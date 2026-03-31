import chalk from 'chalk';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'success';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  success: 1,
};

let currentLevel: number = LOG_LEVELS.info;
let verbose = false;

export function setVerbose(value: boolean): void {
  verbose = value;
  currentLevel = value ? LOG_LEVELS.debug : LOG_LEVELS.info;
}

function formatTime(): string {
  return new Date().toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');
}

function prefix(level: LogLevel): string {
  switch (level) {
    case 'debug':
      return chalk.gray(`[DEBUG]`);
    case 'info':
      return chalk.cyan(`[INFO] `);
    case 'warn':
      return chalk.yellow(`[WARN] `);
    case 'error':
      return chalk.red(`[ERROR]`);
    case 'success':
      return chalk.green(`[PASS] `);
    default:
      return chalk.white(`[LOG]  `);
  }
}

export const logger = {
  debug(message: string, ...args: unknown[]): void {
    if (!verbose) return;
    console.log(`${chalk.gray(formatTime())} ${prefix('debug')} ${chalk.gray(message)}`, ...args);
  },

  info(message: string, ...args: unknown[]): void {
    if (LOG_LEVELS.info < currentLevel) return;
    console.log(`${chalk.gray(formatTime())} ${prefix('info')} ${message}`, ...args);
  },

  warn(message: string, ...args: unknown[]): void {
    console.warn(`${chalk.gray(formatTime())} ${prefix('warn')} ${chalk.yellow(message)}`, ...args);
  },

  error(message: string, ...args: unknown[]): void {
    console.error(`${chalk.gray(formatTime())} ${prefix('error')} ${chalk.red(message)}`, ...args);
  },

  success(message: string, ...args: unknown[]): void {
    console.log(`${chalk.gray(formatTime())} ${prefix('success')} ${chalk.green(message)}`, ...args);
  },

  /** Print a section divider with optional title */
  divider(title?: string): void {
    if (title) {
      const line = '─'.repeat(Math.max(0, 60 - title.length - 2));
      console.log(chalk.gray(`\n─── ${title} ${line}`));
    } else {
      console.log(chalk.gray('─'.repeat(64)));
    }
  },

  /** Print a step being executed */
  step(index: number, total: number, instruction: string): void {
    console.log(
      `\n${chalk.bold.blue(`Step ${index}/${total}`)} ${chalk.white(instruction)}`
    );
  },

  /** Print a test starting */
  testStart(name: string): void {
    console.log(chalk.bold.cyan(`\n▶ ${name}`));
  },

  /** Print a test result */
  testResult(name: string, passed: boolean, durationMs: number): void {
    const icon = passed ? chalk.green('✓') : chalk.red('✗');
    const status = passed ? chalk.green('PASSED') : chalk.red('FAILED');
    const time = chalk.gray(`(${(durationMs / 1000).toFixed(2)}s)`);
    console.log(`${icon} ${name} — ${status} ${time}`);
  },

  /** Print an action being executed */
  action(description: string): void {
    console.log(chalk.gray(`    ↳ ${description}`));
  },

  /** Print LLM thought */
  thought(thought: string): void {
    if (!verbose) return;
    console.log(chalk.magenta(`    💭 ${thought}`));
  },
};
