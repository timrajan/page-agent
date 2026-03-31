import puppeteer, { Browser, Page } from 'puppeteer';
import {
  TestCase,
  TestResult,
  TestSuiteResult,
  StepResult,
  PageAgentConfig,
  CLIOptions,
} from '../core/types';
import { PageAgent } from '../core/page-agent';
import { TestParser } from './test-parser';
import { logger } from '../utils/logger';
import { ensureDir } from '../utils/config';

/**
 * Orchestrates test execution:
 * 1. Discovers .test files
 * 2. Parses each into TestCase
 * 3. Launches Puppeteer
 * 4. Runs each test case through PageAgent
 * 5. Collects and returns results
 */
export class TestRunner {
  private config: PageAgentConfig;
  private parser: TestParser;

  constructor(config: PageAgentConfig) {
    this.config = config;
    this.parser = new TestParser();
  }

  /**
   * Run all tests found at the given path.
   * @param testPath - Directory or single .test file
   * @param options - CLI run options (headed, tag filter, etc.)
   */
  async run(testPath: string, options: CLIOptions = {}): Promise<TestSuiteResult> {
    const start = Date.now();

    // Apply CLI overrides to config
    const config = this.applyOptions(this.config, options);

    // Discover test files
    const testFiles = this.parser.findTestFiles(testPath);
    if (testFiles.length === 0) {
      logger.warn(`No .test files found at: ${testPath}`);
      return this.emptyResult(start);
    }

    // Parse test cases
    let testCases = testFiles.map((file) => this.parser.parseFile(file));

    // Filter by tag if specified
    if (options.tag) {
      const tag = options.tag.toLowerCase();
      testCases = testCases.filter((tc) =>
        tc.tags.some((t) => t.toLowerCase() === tag)
      );
      if (testCases.length === 0) {
        logger.warn(`No test cases match tag: ${options.tag}`);
        return this.emptyResult(start);
      }
    }

    logger.divider(`Running ${testCases.length} test(s)`);

    // Ensure screenshot directory exists
    ensureDir(config.screenshotDir);

    // Launch browser
    const browser = await this.launchBrowser(config);

    const results: TestResult[] = [];

    try {
      for (const testCase of testCases) {
        const result = await this.runTestCase(testCase, browser, config);
        results.push(result);
        logger.testResult(testCase.name, result.status === 'passed', result.durationMs);
      }
    } finally {
      await browser.close();
    }

    const end = Date.now();
    const passed = results.filter((r) => r.status === 'passed').length;
    const failed = results.filter((r) => r.status === 'failed').length;
    const skipped = results.filter((r) => r.status === 'skipped').length;

    return {
      totalTests: results.length,
      passed,
      failed,
      skipped,
      durationMs: end - start,
      results,
      startTime: start,
      endTime: end,
    };
  }

  /**
   * Run a single test case.
   */
  private async runTestCase(
    testCase: TestCase,
    browser: Browser,
    config: PageAgentConfig
  ): Promise<TestResult> {
    const start = Date.now();
    logger.testStart(testCase.name);

    const page = await browser.newPage();
    const stepResults: StepResult[] = [];
    const screenshots: string[] = [];

    try {
      // Set viewport
      await page.setViewport({
        width: config.viewportWidth,
        height: config.viewportHeight,
      });

      // Navigate to test URL if specified
      if (testCase.url) {
        logger.info(`Navigating to ${testCase.url}`);
        await page.goto(testCase.url, {
          waitUntil: 'domcontentloaded',
          timeout: config.timeout,
        });
      }

      // Create agent for this page
      const agent = new PageAgent(page, config);

      // Execute steps
      let failed = false;
      for (let i = 0; i < testCase.steps.length; i++) {
        const step = testCase.steps[i];
        logger.step(i + 1, testCase.steps.length, step.instruction);

        if (failed) {
          // Skip remaining steps after a failure
          stepResults.push({
            step,
            status: 'skipped',
            executedActions: [],
            durationMs: 0,
            retries: 0,
          });
          continue;
        }

        const result = await agent.executeStep(step);
        stepResults.push(result);

        if (result.status === 'failed') {
          failed = true;
          logger.error(
            `Step ${i + 1} FAILED: ${result.error ?? 'Unknown error'}`
          );
          if (result.executedActions.length > 0) {
            for (const ar of result.executedActions) {
              if (ar.screenshotPath) screenshots.push(ar.screenshotPath);
            }
          }
        } else {
          // Collect screenshots from passing steps too
          for (const ar of result.executedActions) {
            if (ar.screenshotPath) screenshots.push(ar.screenshotPath);
          }
        }
      }

      const end = Date.now();
      const allPassed = stepResults.every((s) => s.status !== 'failed');

      return {
        testCase,
        status: allPassed ? 'passed' : 'failed',
        stepResults,
        startTime: start,
        endTime: end,
        durationMs: end - start,
        screenshots,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`Test "${testCase.name}" threw an unexpected error: ${message}`);

      const end = Date.now();
      return {
        testCase,
        status: 'failed',
        stepResults,
        startTime: start,
        endTime: end,
        durationMs: end - start,
        screenshots,
      };
    } finally {
      await page.close();
    }
  }

  private async launchBrowser(config: PageAgentConfig): Promise<Browser> {
    logger.info(
      `Launching browser (headless: ${config.headless}, ${config.viewportWidth}x${config.viewportHeight})`
    );
    return puppeteer.launch({
      headless: config.headless,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
      ],
    });
  }

  private applyOptions(config: PageAgentConfig, options: CLIOptions): PageAgentConfig {
    return {
      ...config,
      headless: options.headed ? false : config.headless,
      timeout: options.timeout ?? config.timeout,
      maxRetries: options.retries ?? config.maxRetries,
      llmModel: options.model ?? config.llmModel,
      screenshotDir: options.outputDir ?? config.screenshotDir,
    };
  }

  private emptyResult(start: number): TestSuiteResult {
    const now = Date.now();
    return {
      totalTests: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      durationMs: now - start,
      results: [],
      startTime: start,
      endTime: now,
    };
  }
}
