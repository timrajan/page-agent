#!/usr/bin/env node
import { Command } from 'commander';
import * as path from 'path';
import { TestRunner } from './runner/test-runner';
import { Reporter } from './runner/reporter';
import { loadConfig, loadEnv } from './utils/config';
import { logger, setVerbose } from './utils/logger';
import { CLIOptions } from './core/types';

// Load environment variables from .env in cwd
loadEnv();

const program = new Command();

program
  .name('page-agent')
  .description('AI-powered Puppeteer test automation — write tests in plain English')
  .version('1.0.0');

// ─── run command ──────────────────────────────────────────────────────────────
program
  .command('run <path>')
  .description('Run .test files at the given path (file or directory)')
  .option('--headed', 'Run browser in headed (visible) mode', false)
  .option('--tag <tag>', 'Only run tests matching this tag')
  .option(
    '--report <format>',
    'Report format: console | html | both (default: console)',
    'console'
  )
  .option('--model <model>', 'Override LLM model (e.g., gpt-4o, deepseek-chat)')
  .option('--timeout <ms>', 'Override default action timeout in ms', parseInt)
  .option('--retries <n>', 'Override max retries per step', parseInt)
  .option('--output-dir <dir>', 'Directory for screenshots and HTML reports')
  .option('--verbose', 'Enable verbose/debug logging', false)
  .action(async (testPath: string, opts) => {
    if (opts.verbose) {
      setVerbose(true);
    }

    const options: CLIOptions = {
      headed: opts.headed,
      tag: opts.tag,
      report: opts.report as CLIOptions['report'],
      model: opts.model,
      timeout: opts.timeout,
      retries: opts.retries,
      outputDir: opts.outputDir,
    };

    logger.divider('Page Agent');
    logger.info(`Test path: ${path.resolve(testPath)}`);

    if (options.tag) logger.info(`Tag filter: ${options.tag}`);
    if (options.headed) logger.info('Running in headed mode');

    const config = loadConfig({
      headless: !options.headed,
      ...(options.model ? { llmModel: options.model } : {}),
      ...(options.timeout ? { timeout: options.timeout } : {}),
      ...(options.retries ? { maxRetries: options.retries } : {}),
      ...(options.outputDir ? { screenshotDir: options.outputDir } : {}),
    });

    if (!config.llmApiKey) {
      logger.warn(
        'LLM_API_KEY is not set. Keyword-based steps will work, but natural language steps require an API key.\n' +
          'Set LLM_API_KEY in your .env file or as an environment variable.'
      );
    } else {
      logger.info(`LLM: ${config.llmModel} via ${config.llmBaseUrl}`);
    }

    const runner = new TestRunner(config);
    const reporter = new Reporter();

    try {
      const results = await runner.run(testPath, options);

      // Print console report
      if (options.report !== 'html') {
        reporter.printConsoleReport(results);
      }

      // Generate HTML report
      if (options.report === 'html' || options.report === 'both') {
        const outputDir = options.outputDir ?? './reports';
        const htmlPath = reporter.generateHTMLReport(results, outputDir);
        logger.info(`HTML report: ${htmlPath}`);
      }

      // Exit with non-zero code if any tests failed
      if (results.failed > 0) {
        process.exit(1);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`Fatal error: ${message}`);
      if (opts.verbose && err instanceof Error) {
        console.error(err.stack);
      }
      process.exit(1);
    }
  });

// ─── validate command ─────────────────────────────────────────────────────────
program
  .command('validate <path>')
  .description('Parse and validate .test files without running them')
  .action((testPath: string) => {
    const { TestParser } = require('./runner/test-parser');
    const parser = new TestParser();

    try {
      const files = parser.findTestFiles(testPath);
      logger.info(`Found ${files.length} test file(s)`);

      let hasErrors = false;
      for (const file of files) {
        try {
          const testCase = parser.parseFile(file);
          logger.success(
            `✓ ${testCase.name} — ${testCase.steps.length} step(s)` +
              (testCase.url ? ` — URL: ${testCase.url}` : '') +
              (testCase.tags.length ? ` — Tags: ${testCase.tags.join(', ')}` : '')
          );
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          logger.error(`✗ ${file}: ${message}`);
          hasErrors = true;
        }
      }

      if (hasErrors) process.exit(1);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(message);
      process.exit(1);
    }
  });

// ─── init command ─────────────────────────────────────────────────────────────
program
  .command('init')
  .description('Create a sample .env and example test file in the current directory')
  .action(() => {
    const fs = require('fs');
    const cwd = process.cwd();

    // Write .env.example
    const envExample = `LLM_PROVIDER=openai
LLM_MODEL=gpt-4o
LLM_API_KEY=sk-your-api-key-here
LLM_BASE_URL=https://api.openai.com/v1
HEADLESS=true
VIEWPORT_WIDTH=1280
VIEWPORT_HEIGHT=720
TIMEOUT=30000
MAX_RETRIES=3
SCREENSHOT_DIR=./screenshots
`;
    const envPath = path.join(cwd, '.env.example');
    fs.writeFileSync(envPath, envExample);
    logger.success(`Created ${envPath}`);

    // Write example test
    const testsDir = path.join(cwd, 'tests');
    if (!fs.existsSync(testsDir)) fs.mkdirSync(testsDir, { recursive: true });

    const exampleTest = `# Test: Example Search Test
# URL: https://www.google.com
# Tags: smoke, example

Navigate to https://www.google.com
Type "page agent puppeteer" in the search input
Press Enter
Wait for 2 seconds
Verify that the results page contains "puppeteer"
Take a screenshot named "search-results"
`;
    const testPath = path.join(testsDir, 'example.test');
    fs.writeFileSync(testPath, exampleTest);
    logger.success(`Created ${testPath}`);

    console.log('\nNext steps:');
    console.log('  1. cp .env.example .env');
    console.log('  2. Edit .env and add your LLM_API_KEY');
    console.log('  3. npx page-agent run ./tests');
  });

program.parse(process.argv);

// Show help if no command provided
if (process.argv.length < 3) {
  program.help();
}
