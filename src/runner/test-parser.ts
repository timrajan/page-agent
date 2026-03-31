import * as fs from 'fs';
import * as path from 'path';
import { TestCase, TestStep, StepType } from '../core/types';

/**
 * Parses plain English .test files into structured TestCase objects.
 *
 * File format:
 * ```
 * # Test: My Test Name
 * # URL: https://example.com
 * # Tags: smoke, regression
 *
 * Navigate to the homepage
 * Click the Login button
 * Type "user@example.com" in the email field
 * Verify that the page contains "Welcome"
 * ```
 */
export class TestParser {
  /**
   * Parse a single .test file into a TestCase.
   */
  parseFile(filePath: string): TestCase {
    const absolutePath = path.resolve(filePath);
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`Test file not found: ${absolutePath}`);
    }

    const content = fs.readFileSync(absolutePath, 'utf8');
    return this.parseContent(content, absolutePath);
  }

  /**
   * Parse raw .test file content.
   */
  parseContent(content: string, filePath: string): TestCase {
    const lines = content.split('\n');
    let name = path.basename(filePath, '.test');
    let url = '';
    const tags: string[] = [];
    const steps: TestStep[] = [];

    let lineNumber = 0;

    for (const rawLine of lines) {
      lineNumber++;
      const line = rawLine.trim();

      // Skip empty lines
      if (!line) continue;

      // Parse metadata headers (# Key: Value)
      if (line.startsWith('#')) {
        const headerMatch = line.match(/^#\s*(\w[\w\s]*):\s*(.+)$/);
        if (headerMatch) {
          const key = headerMatch[1].toLowerCase().trim();
          const value = headerMatch[2].trim();

          switch (key) {
            case 'test':
              name = value;
              break;
            case 'url':
              url = value;
              break;
            case 'tags':
              tags.push(...value.split(',').map((t) => t.trim()).filter((t) => t.length > 0));
              break;
            // Ignore unknown metadata keys
          }
        }
        // Lines starting with # but not matching header format are comments
        continue;
      }

      // Parse a test step
      const step = this.parseStep(line, lineNumber);
      steps.push(step);
    }

    if (!url) {
      // Try to infer URL from the first navigate step
      const navStep = steps.find((s) => s.stepType === 'navigate');
      if (navStep?.args?.url) {
        url = navStep.args.url;
      }
    }

    return { name, url, tags, steps, filePath };
  }

  /**
   * Classify and extract arguments from a step instruction.
   */
  private parseStep(instruction: string, lineNumber: number): TestStep {
    const lower = instruction.toLowerCase();

    // Navigate to <url>
    const navigateMatch =
      instruction.match(/navigate\s+to\s+(https?:\/\/\S+)/i) ??
      instruction.match(/go\s+to\s+(https?:\/\/\S+)/i) ??
      instruction.match(/open\s+(https?:\/\/\S+)/i);
    if (navigateMatch) {
      return {
        instruction,
        lineNumber,
        stepType: 'navigate',
        args: { url: navigateMatch[1] },
      };
    }

    // Type "<text>" in <element>
    const typeMatch = instruction.match(/type\s+"([^"]+)"\s+in(?:to)?\s+(.+)/i);
    if (typeMatch) {
      return {
        instruction,
        lineNumber,
        stepType: 'type',
        args: { text: typeMatch[1], element: typeMatch[2].trim() },
      };
    }

    // Click <element>
    if (/^click\s+/i.test(instruction)) {
      const element = instruction.replace(/^click\s+/i, '').trim();
      return {
        instruction,
        lineNumber,
        stepType: 'click',
        args: { element },
      };
    }

    // Verify that <assertion>
    if (/^verify\s+that\s+/i.test(instruction)) {
      const assertion = instruction.replace(/^verify\s+that\s+/i, '').trim();
      return {
        instruction,
        lineNumber,
        stepType: 'verify',
        args: { assertion },
      };
    }

    // Wait for <condition>
    if (/^wait\s+for\s+/i.test(instruction) || /^wait\s+\d/i.test(instruction)) {
      return {
        instruction,
        lineNumber,
        stepType: 'wait',
        args: { condition: instruction.replace(/^wait\s+for\s+/i, '').trim() },
      };
    }

    // Take a screenshot named "<name>"
    const screenshotMatch = instruction.match(/take\s+a?\s*screenshot\s+named?\s+"([^"]+)"/i);
    if (screenshotMatch) {
      return {
        instruction,
        lineNumber,
        stepType: 'screenshot',
        args: { name: screenshotMatch[1] },
      };
    }

    // Select "<value>" from <element>
    const selectMatch = instruction.match(/select\s+"([^"]+)"\s+from\s+(.+)/i);
    if (selectMatch) {
      return {
        instruction,
        lineNumber,
        stepType: 'select',
        args: { value: selectMatch[1], element: selectMatch[2].trim() },
      };
    }

    // Hover over <element>
    if (/^hover\s+over\s+/i.test(instruction)) {
      const element = instruction.replace(/^hover\s+over\s+/i, '').trim();
      return {
        instruction,
        lineNumber,
        stepType: 'hover',
        args: { element },
      };
    }

    // Press <key>
    const pressMatch = instruction.match(/^press\s+(.+)/i);
    if (pressMatch) {
      return {
        instruction,
        lineNumber,
        stepType: 'press',
        args: { key: pressMatch[1].trim() },
      };
    }

    // Scroll <direction>
    if (/^scroll\s+/i.test(instruction)) {
      let direction = 'down';
      if (/up/i.test(lower)) direction = 'up';
      else if (/left/i.test(lower)) direction = 'left';
      else if (/right/i.test(lower)) direction = 'right';
      return {
        instruction,
        lineNumber,
        stepType: 'scroll',
        args: { direction },
      };
    }

    // Generic — send to LLM as-is
    return {
      instruction,
      lineNumber,
      stepType: 'generic',
    };
  }

  /**
   * Find all .test files in a directory (recursive).
   */
  findTestFiles(directory: string): string[] {
    const absDir = path.resolve(directory);
    if (!fs.existsSync(absDir)) {
      throw new Error(`Test directory not found: ${absDir}`);
    }

    const stat = fs.statSync(absDir);
    if (stat.isFile()) {
      // Single file provided
      return [absDir];
    }

    const results: string[] = [];
    this.walkDir(absDir, results);
    return results.sort();
  }

  private walkDir(dir: string, results: string[]): void {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        this.walkDir(fullPath, results);
      } else if (entry.isFile() && entry.name.endsWith('.test')) {
        results.push(fullPath);
      }
    }
  }
}
