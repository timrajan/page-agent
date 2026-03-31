import { Page } from 'puppeteer';
import { DOMElement, DOMState } from './types';
import { logger } from '../utils/logger';

/**
 * Extracts interactive elements from the current page DOM.
 *
 * Injects JavaScript into the page to enumerate all interactive elements,
 * assigns each a unique index, and builds a compact text representation
 * suitable for sending to the LLM.
 *
 * No screenshots or vision — purely text-based DOM extraction.
 */
export class DOMProcessor {
  /** Maximum number of elements to extract (to keep token count manageable) */
  private maxElements: number;

  constructor(maxElements = 150) {
    this.maxElements = maxElements;
  }

  /**
   * Extract the current interactive state of the page.
   */
  async extractState(page: Page): Promise<DOMState> {
    const url = page.url();
    const title = await page.title();

    // Inject JS into the page to enumerate interactive elements
    const rawElements = await page.evaluate((maxEls: number) => {
      // ── Helper functions (run inside browser context) ──────────────────────

      function getCssSelector(el: Element): string {
        if (el.id) return `#${CSS.escape(el.id)}`;

        const parts: string[] = [];
        let current: Element | null = el;

        while (current && current !== document.body) {
          let part = current.tagName.toLowerCase();
          if (current.id) {
            part = `#${CSS.escape(current.id)}`;
            parts.unshift(part);
            break;
          }
          if (current.className) {
            const classes = Array.from(current.classList)
              .filter((c) => c.trim().length > 0)
              .slice(0, 2)
              .map((c) => `.${CSS.escape(c)}`)
              .join('');
            if (classes) part += classes;
          }
          // Add nth-child for specificity
          const parent = current.parentElement;
          if (parent) {
            const siblings = Array.from(parent.children).filter(
              (s) => s.tagName === current!.tagName
            );
            if (siblings.length > 1) {
              const idx = siblings.indexOf(current) + 1;
              part += `:nth-of-type(${idx})`;
            }
          }
          parts.unshift(part);
          current = current.parentElement;
          if (parts.length >= 5) break;
        }

        return parts.join(' > ');
      }

      function isVisible(el: Element): boolean {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) return false;
        const style = window.getComputedStyle(el);
        if (style.display === 'none') return false;
        if (style.visibility === 'hidden') return false;
        if (parseFloat(style.opacity) === 0) return false;
        return true;
      }

      function getText(el: Element): string {
        // For inputs / buttons, prefer value or aria-label
        const tag = el.tagName.toLowerCase();
        if (tag === 'input') {
          const input = el as HTMLInputElement;
          if (input.type !== 'password') {
            return input.value || input.placeholder || '';
          }
          return input.placeholder || '';
        }
        if (tag === 'select') {
          const sel = el as HTMLSelectElement;
          return sel.options[sel.selectedIndex]?.text ?? '';
        }
        // Get text content, trimmed
        return (el.textContent ?? '').trim().replace(/\s+/g, ' ').substring(0, 100);
      }

      function getOptions(el: Element): string[] | undefined {
        if (el.tagName.toLowerCase() !== 'select') return undefined;
        const select = el as HTMLSelectElement;
        return Array.from(select.options)
          .map((o) => o.text.trim())
          .filter((t) => t.length > 0)
          .slice(0, 20);
      }

      // ── Selector for interactive elements ──────────────────────────────────
      const INTERACTIVE_SELECTOR = [
        'button',
        'input:not([type="hidden"])',
        'textarea',
        'select',
        'a[href]',
        '[role="button"]',
        '[role="link"]',
        '[role="menuitem"]',
        '[role="option"]',
        '[role="tab"]',
        '[role="checkbox"]',
        '[role="radio"]',
        '[role="combobox"]',
        '[role="textbox"]',
        '[tabindex]:not([tabindex="-1"])',
        '[onclick]',
        '[contenteditable="true"]',
      ].join(', ');

      const allElements = Array.from(document.querySelectorAll(INTERACTIVE_SELECTOR));

      // De-duplicate and filter
      const seen = new Set<Element>();
      const filtered: Element[] = [];
      for (const el of allElements) {
        if (seen.has(el)) continue;
        seen.add(el);
        if (!isVisible(el)) continue;
        if ((el as HTMLInputElement).disabled) continue;
        filtered.push(el);
        if (filtered.length >= maxEls) break;
      }

      // Build serializable element descriptors
      return filtered.map((el, i) => {
        const tag = el.tagName.toLowerCase();
        const input = tag === 'input' ? (el as HTMLInputElement) : null;
        const anchor = tag === 'a' ? (el as HTMLAnchorElement) : null;

        return {
          index: i + 1,
          tag,
          type: input?.type ?? undefined,
          role: el.getAttribute('role') ?? undefined,
          text: getText(el) || undefined,
          placeholder: input?.placeholder || el.getAttribute('placeholder') || undefined,
          ariaLabel: el.getAttribute('aria-label') ?? undefined,
          name: (el as HTMLInputElement).name || undefined,
          id: el.id || undefined,
          href: anchor?.href || undefined,
          value: input?.value || undefined,
          visible: true,
          disabled: (el as HTMLInputElement).disabled ?? false,
          options: getOptions(el),
          selector: getCssSelector(el),
        };
      });
    }, this.maxElements);

    // Build the element map (index → selector)
    const elementMap = new Map<number, string>();
    const elements: DOMElement[] = rawElements.map((raw) => {
      const el: DOMElement = {
        index: raw.index,
        tag: raw.tag,
        type: raw.type,
        role: raw.role,
        text: raw.text,
        placeholder: raw.placeholder,
        ariaLabel: raw.ariaLabel,
        name: raw.name,
        id: raw.id,
        href: raw.href,
        value: raw.value,
        visible: raw.visible,
        disabled: raw.disabled,
        options: raw.options,
        selector: raw.selector,
      };
      elementMap.set(raw.index, raw.selector);
      return el;
    });

    const textRepresentation = this.buildTextRepresentation(elements);

    logger.debug(`Extracted ${elements.length} interactive elements from ${url}`);

    return {
      url,
      title,
      elements,
      textRepresentation,
      elementMap,
      timestamp: Date.now(),
    };
  }

  /**
   * Build a compact text representation of the DOM state for the LLM.
   * Example:
   *   [1] <button> "Sign In" id=signin-btn
   *   [2] <input type="text"> placeholder="Enter your email" id=email
   */
  private buildTextRepresentation(elements: DOMElement[]): string {
    const lines = elements.map((el) => {
      const parts: string[] = [];

      // Tag + type
      if (el.type) {
        parts.push(`<${el.tag} type="${el.type}">`);
      } else {
        parts.push(`<${el.tag}>`);
      }

      // Primary label (text content, aria-label, or placeholder)
      const label = el.text || el.ariaLabel || el.placeholder;
      if (label) {
        parts.push(`"${label.substring(0, 80)}"`);
      }

      // Attributes
      if (el.id) parts.push(`id=${el.id}`);
      if (el.name) parts.push(`name=${el.name}`);
      if (el.placeholder && !label) parts.push(`placeholder="${el.placeholder}"`);
      if (el.ariaLabel && label !== el.ariaLabel) parts.push(`aria-label="${el.ariaLabel}"`);
      if (el.href) {
        const href = el.href.length > 60 ? el.href.substring(0, 60) + '...' : el.href;
        parts.push(`href=${href}`);
      }
      if (el.role) parts.push(`role=${el.role}`);
      if (el.options && el.options.length > 0) {
        parts.push(`options=[${el.options.map((o) => `"${o}"`).join(', ')}]`);
      }

      return `[${el.index}] ${parts.join(' ')}`;
    });

    return lines.join('\n');
  }

  /**
   * Get a page's full visible text content (for assertions).
   */
  async getPageText(page: Page): Promise<string> {
    return page.evaluate(() => document.body.innerText ?? '');
  }

  /**
   * Get a specific element's text content by selector.
   */
  async getElementText(page: Page, selector: string): Promise<string | null> {
    try {
      return await page.$eval(selector, (el) => (el as HTMLElement).innerText ?? '');
    } catch {
      return null;
    }
  }
}
