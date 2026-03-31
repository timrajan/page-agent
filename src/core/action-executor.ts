import * as path from 'path';
import * as fs from 'fs';
import { Page, KeyInput } from 'puppeteer';
import {
  Action,
  ActionPlan,
  ActionResult,
  ExecutionResult,
  ClickAction,
  TypeAction,
  SelectAction,
  HoverAction,
  PressAction,
  ScrollAction,
  WaitAction,
  NavigateAction,
  AssertTextAction,
  AssertElementAction,
  ScreenshotAction,
} from './types';
import { DOMProcessor } from './dom-processor';
import { logger } from '../utils/logger';
import { ensureDir } from '../utils/config';

/**
 * Executes action plans produced by the LLM Planner using Puppeteer.
 *
 * Resolves elementIndex references back to CSS selectors via the element map,
 * handles waits, retries on stale elements, and captures screenshots.
 */
export class ActionExecutor {
  private page: Page;
  private domProcessor: DOMProcessor;
  private screenshotDir: string;
  private timeout: number;

  /** Element map from last DOM extraction: index → CSS selector */
  private elementMap: Map<number, string> = new Map();

  constructor(
    page: Page,
    domProcessor: DOMProcessor,
    screenshotDir = './screenshots',
    timeout = 30000
  ) {
    this.page = page;
    this.domProcessor = domProcessor;
    this.screenshotDir = screenshotDir;
    this.timeout = timeout;
  }

  /** Update the element map from a new DOM state */
  updateElementMap(elementMap: Map<number, string>): void {
    this.elementMap = elementMap;
  }

  /**
   * Execute an entire action plan.
   */
  async executePlan(plan: ActionPlan): Promise<ExecutionResult> {
    const start = Date.now();
    const actionResults: ActionResult[] = [];

    for (const action of plan.actions) {
      const result = await this.executeAction(action);
      actionResults.push(result);

      if (!result.success) {
        return {
          success: false,
          actionResults,
          error: `Action failed: ${result.error}`,
          durationMs: Date.now() - start,
        };
      }
    }

    return {
      success: true,
      actionResults,
      durationMs: Date.now() - start,
    };
  }

  /**
   * Execute a single action.
   */
  async executeAction(action: Action): Promise<ActionResult> {
    const start = Date.now();
    const desc = action.description ?? action.type;
    logger.action(desc);

    try {
      let screenshotPath: string | undefined;

      switch (action.type) {
        case 'click':
          await this.executeClick(action);
          break;
        case 'type':
          await this.executeType(action);
          break;
        case 'select':
          await this.executeSelect(action);
          break;
        case 'hover':
          await this.executeHover(action);
          break;
        case 'press':
          await this.executePress(action);
          break;
        case 'scroll':
          await this.executeScroll(action);
          break;
        case 'wait':
          await this.executeWait(action);
          break;
        case 'navigate':
          await this.executeNavigate(action);
          break;
        case 'assert_text':
          await this.executeAssertText(action);
          break;
        case 'assert_element':
          await this.executeAssertElement(action);
          break;
        case 'screenshot':
          screenshotPath = await this.executeScreenshot(action);
          break;
        default: {
          const exhaustive: never = action;
          throw new Error(`Unknown action type: ${(exhaustive as Action).type}`);
        }
      }

      return {
        action,
        success: true,
        screenshotPath,
        durationMs: Date.now() - start,
      };
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      logger.debug(`Action "${desc}" failed: ${error}`);
      return {
        action,
        success: false,
        error,
        durationMs: Date.now() - start,
      };
    }
  }

  // ─── Private action implementations ────────────────────────────────────────

  private async resolveSelector(elementIndex: number): Promise<string> {
    const selector = this.elementMap.get(elementIndex);
    if (!selector) {
      throw new Error(`No element found for index ${elementIndex}. Available indices: [${Array.from(this.elementMap.keys()).join(', ')}]`);
    }
    return selector;
  }

  private async waitForElement(selector: string): Promise<void> {
    try {
      await this.page.waitForSelector(selector, { timeout: this.timeout, visible: true });
    } catch {
      // Element might already be there but not matching waitForSelector — continue
    }
  }

  private async executeClick(action: ClickAction): Promise<void> {
    const selector = await this.resolveSelector(action.elementIndex);
    await this.waitForElement(selector);

    // Scroll into view first
    await this.page.evaluate((sel: string) => {
      const el = document.querySelector(sel);
      if (el) (el as HTMLElement).scrollIntoView({ block: 'center', behavior: 'instant' });
    }, selector);

    await this.page.click(selector);
    // Wait briefly for potential navigation after click
    await this.waitForNavigation(3000);
    await this.waitForIdle(2000);
  }

  private async executeType(action: TypeAction): Promise<void> {
    const selector = await this.resolveSelector(action.elementIndex);
    await this.waitForElement(selector);

    // Clear existing content, then type
    await this.page.click(selector, { clickCount: 3 }); // triple-click to select all
    await this.page.keyboard.press('Backspace');
    await this.page.type(selector, action.text, { delay: 20 });
  }

  private async executeSelect(action: SelectAction): Promise<void> {
    const selector = await this.resolveSelector(action.elementIndex);
    await this.waitForElement(selector);
    await this.page.select(selector, action.value);
  }

  private async executeHover(action: HoverAction): Promise<void> {
    const selector = await this.resolveSelector(action.elementIndex);
    await this.waitForElement(selector);
    await this.page.hover(selector);
  }

  private async executePress(action: PressAction): Promise<void> {
    await this.page.keyboard.press(action.key as KeyInput);
  }

  private async executeScroll(action: ScrollAction): Promise<void> {
    const amount = action.amount ?? 300;
    const deltaX = action.direction === 'left' ? -amount : action.direction === 'right' ? amount : 0;
    const deltaY = action.direction === 'up' ? -amount : action.direction === 'down' ? amount : 0;

    await this.page.evaluate(
      (dx: number, dy: number) => window.scrollBy(dx, dy),
      deltaX,
      deltaY
    );
  }

  private async executeWait(action: WaitAction): Promise<void> {
    await new Promise<void>((resolve) => setTimeout(resolve, action.ms));
  }

  private async executeNavigate(action: NavigateAction): Promise<void> {
    await this.page.goto(action.url, {
      waitUntil: 'domcontentloaded',
      timeout: this.timeout,
    });
  }

  private async executeAssertText(action: AssertTextAction): Promise<void> {
    const pageText = await this.domProcessor.getPageText(this.page);
    const found = pageText.toLowerCase().includes(action.text.toLowerCase());

    if (action.negate) {
      if (found) {
        throw new Error(`Assertion failed: text "${action.text}" was found on the page (expected NOT to find it)`);
      }
    } else {
      if (!found) {
        // Also check the page HTML source for content that might not be in innerText
        const html = await this.page.content();
        const foundInHtml = html.toLowerCase().includes(action.text.toLowerCase());
        if (!foundInHtml) {
          throw new Error(`Assertion failed: text "${action.text}" was not found on the page`);
        }
      }
    }
  }

  private async executeAssertElement(action: AssertElementAction): Promise<void> {
    const selector = await this.resolveSelector(action.elementIndex);

    const result = await this.page.evaluate(
      (sel: string, prop: string) => {
        const el = document.querySelector(sel) as HTMLInputElement | null;
        if (!el) return { found: false, value: '' };

        switch (prop) {
          case 'value':
            return { found: true, value: el.value ?? '' };
          case 'text':
            return { found: true, value: el.textContent?.trim() ?? '' };
          case 'checked':
            return { found: true, value: String(el.checked ?? false) };
          case 'disabled':
            return { found: true, value: String(el.disabled ?? false) };
          case 'visible': {
            const style = window.getComputedStyle(el);
            const visible =
              style.display !== 'none' &&
              style.visibility !== 'hidden' &&
              parseFloat(style.opacity) > 0;
            return { found: true, value: String(visible) };
          }
          default:
            return { found: true, value: el.getAttribute(prop) ?? '' };
        }
      },
      selector,
      action.property
    );

    if (!result.found) {
      throw new Error(`Assertion failed: element [${action.elementIndex}] (selector: ${selector}) not found`);
    }

    if (result.value.toLowerCase() !== action.value.toLowerCase()) {
      throw new Error(
        `Assertion failed: element [${action.elementIndex}] property "${action.property}" ` +
          `expected "${action.value}" but got "${result.value}"`
      );
    }
  }

  private async executeScreenshot(action: ScreenshotAction): Promise<string> {
    ensureDir(this.screenshotDir);
    const filename = `${action.name.replace(/[^a-z0-9-_]/gi, '_')}_${Date.now()}.png`;
    const screenshotPath = path.resolve(this.screenshotDir, filename);

    await this.page.screenshot({ path: screenshotPath, fullPage: false });
    logger.info(`Screenshot saved: ${screenshotPath}`);
    return screenshotPath;
  }

  /**
   * Wait for navigation to complete after an action (useful after clicks that
   * might trigger navigation).
   */
  async waitForNavigation(timeout = 5000): Promise<void> {
    try {
      await this.page.waitForNavigation({
        waitUntil: 'domcontentloaded',
        timeout,
      });
    } catch {
      // Navigation may not always happen — ignore timeout
    }
  }

  /**
   * Wait for network to be mostly idle (useful after dynamic content loads).
   */
  async waitForIdle(timeout = 3000): Promise<void> {
    try {
      await this.page.waitForNetworkIdle({ timeout, idleTime: 500 });
    } catch {
      // Ignore
    }
  }
}
