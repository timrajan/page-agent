import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import { TestSuiteResult, TestResult, StepResult } from '../core/types';
import { logger } from '../utils/logger';

/**
 * Generates test reports in console and/or HTML format.
 */
export class Reporter {
  /**
   * Print a summary to the console.
   */
  printConsoleReport(suiteResult: TestSuiteResult): void {
    logger.divider('Test Results');

    const { totalTests, passed, failed, skipped, durationMs } = suiteResult;

    // Per-test summary
    for (const result of suiteResult.results) {
      this.printTestResult(result);
    }

    console.log('');
    logger.divider('Summary');

    const passColor = passed > 0 ? chalk.green : chalk.gray;
    const failColor = failed > 0 ? chalk.red : chalk.gray;
    const skipColor = skipped > 0 ? chalk.yellow : chalk.gray;

    console.log(
      [
        `Tests:   ${totalTests}`,
        passColor(`Passed: ${passed}`),
        failColor(`Failed: ${failed}`),
        skipColor(`Skipped: ${skipped}`),
        chalk.gray(`Duration: ${(durationMs / 1000).toFixed(2)}s`),
      ].join('   ')
    );

    console.log('');

    if (failed === 0) {
      console.log(chalk.bold.green('All tests passed!'));
    } else {
      console.log(chalk.bold.red(`${failed} test(s) failed`));
    }
  }

  private printTestResult(result: TestResult): void {
    const icon = result.status === 'passed' ? chalk.green('✓') : chalk.red('✗');
    const name = result.status === 'passed'
      ? chalk.green(result.testCase.name)
      : chalk.red(result.testCase.name);
    const time = chalk.gray(`(${(result.durationMs / 1000).toFixed(2)}s)`);

    console.log(`\n${icon} ${name} ${time}`);

    for (const stepResult of result.stepResults) {
      this.printStepResult(stepResult);
    }

    if (result.screenshots.length > 0) {
      console.log(chalk.gray(`  📷 Screenshots: ${result.screenshots.join(', ')}`));
    }
  }

  private printStepResult(stepResult: StepResult): void {
    const statusIcon =
      stepResult.status === 'passed'
        ? chalk.green('  ✓')
        : stepResult.status === 'failed'
        ? chalk.red('  ✗')
        : chalk.yellow('  ○');

    const instruction = stepResult.status === 'failed'
      ? chalk.red(stepResult.step.instruction)
      : chalk.gray(stepResult.step.instruction);

    console.log(`${statusIcon} ${instruction}`);

    if (stepResult.status === 'failed' && stepResult.error) {
      console.log(chalk.red(`     Error: ${stepResult.error}`));
    }

    if (stepResult.retries > 0) {
      console.log(chalk.yellow(`     Retried ${stepResult.retries} time(s)`));
    }
  }

  /**
   * Generate an HTML report file.
   */
  generateHTMLReport(suiteResult: TestSuiteResult, outputDir = '.'): string {
    const html = this.buildHTML(suiteResult);
    const filename = `test-report-${Date.now()}.html`;
    const outputPath = path.resolve(outputDir, filename);

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    fs.writeFileSync(outputPath, html, 'utf8');
    logger.info(`HTML report written to: ${outputPath}`);
    return outputPath;
  }

  private buildHTML(suiteResult: TestSuiteResult): string {
    const { totalTests, passed, failed, skipped, durationMs } = suiteResult;
    const passRate = totalTests > 0 ? Math.round((passed / totalTests) * 100) : 0;
    const startDate = new Date(suiteResult.startTime).toLocaleString();

    const testRows = suiteResult.results.map((r) => this.buildTestHTML(r)).join('\n');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Page Agent Test Report</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f5; color: #333; }
    header { background: #1a1a2e; color: white; padding: 24px 32px; }
    header h1 { font-size: 1.5rem; font-weight: 600; }
    header p { font-size: 0.85rem; color: #aaa; margin-top: 4px; }
    .summary { display: flex; gap: 16px; padding: 20px 32px; background: white; border-bottom: 1px solid #e0e0e0; }
    .stat { text-align: center; padding: 12px 20px; border-radius: 8px; min-width: 100px; }
    .stat-total { background: #e8f4f8; }
    .stat-passed { background: #e8f8e8; color: #2d7a2d; }
    .stat-failed { background: #f8e8e8; color: #7a2d2d; }
    .stat-skipped { background: #f8f5e8; color: #7a6a2d; }
    .stat .value { font-size: 2rem; font-weight: bold; }
    .stat .label { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 2px; }
    .duration { margin-left: auto; align-self: center; color: #666; font-size: 0.9rem; }
    .tests { padding: 24px 32px; }
    .test { background: white; border-radius: 8px; margin-bottom: 16px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,0.08); }
    .test-header { padding: 14px 20px; display: flex; align-items: center; gap: 12px; cursor: pointer; border-left: 4px solid #ccc; }
    .test-header.passed { border-left-color: #4caf50; }
    .test-header.failed { border-left-color: #f44336; }
    .test-header.skipped { border-left-color: #ff9800; }
    .test-name { font-weight: 600; flex: 1; }
    .test-status { font-size: 0.8rem; font-weight: 600; padding: 2px 8px; border-radius: 12px; }
    .status-passed { background: #e8f8e8; color: #2d7a2d; }
    .status-failed { background: #f8e8e8; color: #7a2d2d; }
    .status-skipped { background: #f8f5e8; color: #7a6a2d; }
    .test-time { color: #999; font-size: 0.8rem; }
    .steps { padding: 0 20px 16px; }
    .step { padding: 8px 12px; border-radius: 4px; margin-bottom: 6px; font-size: 0.88rem; }
    .step.passed { background: #f5fff5; border-left: 3px solid #4caf50; }
    .step.failed { background: #fff5f5; border-left: 3px solid #f44336; }
    .step.skipped { background: #fffff5; border-left: 3px solid #ff9800; }
    .step-instruction { font-weight: 500; }
    .step-error { color: #c0392b; font-size: 0.82rem; margin-top: 4px; font-family: monospace; }
    .step-thought { color: #7f8c8d; font-size: 0.8rem; margin-top: 3px; font-style: italic; }
    .tags { margin-top: 4px; }
    .tag { background: #e8eaf6; color: #3949ab; font-size: 0.75rem; padding: 1px 7px; border-radius: 10px; margin-right: 4px; }
  </style>
</head>
<body>
  <header>
    <h1>Page Agent Test Report</h1>
    <p>Run started: ${startDate} &nbsp;·&nbsp; Duration: ${(durationMs / 1000).toFixed(2)}s &nbsp;·&nbsp; Pass rate: ${passRate}%</p>
  </header>

  <div class="summary">
    <div class="stat stat-total"><div class="value">${totalTests}</div><div class="label">Total</div></div>
    <div class="stat stat-passed"><div class="value">${passed}</div><div class="label">Passed</div></div>
    <div class="stat stat-failed"><div class="value">${failed}</div><div class="label">Failed</div></div>
    <div class="stat stat-skipped"><div class="value">${skipped}</div><div class="label">Skipped</div></div>
  </div>

  <div class="tests">
    ${testRows}
  </div>
</body>
</html>`;
  }

  private buildTestHTML(result: TestResult): string {
    const status = result.status;
    const name = this.escapeHtml(result.testCase.name);
    const time = (result.durationMs / 1000).toFixed(2);
    const tags = result.testCase.tags
      .map((t) => `<span class="tag">${this.escapeHtml(t)}</span>`)
      .join('');

    const stepsHTML = result.stepResults
      .map((s) => this.buildStepHTML(s))
      .join('\n');

    return `<div class="test">
  <div class="test-header ${status}">
    <div class="test-name">${name}
      ${tags ? `<div class="tags">${tags}</div>` : ''}
    </div>
    <span class="test-status status-${status}">${status.toUpperCase()}</span>
    <span class="test-time">${time}s</span>
  </div>
  <div class="steps">
    ${stepsHTML}
  </div>
</div>`;
  }

  private buildStepHTML(stepResult: StepResult): string {
    const status = stepResult.status;
    const instruction = this.escapeHtml(stepResult.step.instruction);
    const error = stepResult.error ? `<div class="step-error">✗ ${this.escapeHtml(stepResult.error)}</div>` : '';
    const thought = stepResult.thought
      ? `<div class="step-thought">💭 ${this.escapeHtml(stepResult.thought)}</div>`
      : '';

    return `<div class="step ${status}">
  <div class="step-instruction">${instruction}</div>
  ${thought}
  ${error}
</div>`;
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
