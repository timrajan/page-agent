/**
 * Page Agent — AI-powered Puppeteer test automation framework.
 *
 * Write tests in plain English, powered by an LLM to convert natural language
 * instructions into precise browser actions via Puppeteer.
 *
 * @example
 * ```typescript
 * import { TestRunner, loadConfig, loadEnv } from 'page-agent';
 *
 * loadEnv(); // Load .env file
 * const config = loadConfig();
 * const runner = new TestRunner(config);
 * const results = await runner.run('./tests');
 * ```
 */

export { PageAgent } from './core/page-agent';
export { DOMProcessor } from './core/dom-processor';
export { LLMPlanner } from './core/llm-planner';
export { ActionExecutor } from './core/action-executor';
export { OpenAIProvider } from './llm/openai-provider';
export type { LLMProvider } from './llm/provider';
export { TestRunner } from './runner/test-runner';
export { TestParser } from './runner/test-parser';
export { Reporter } from './runner/reporter';
export { loadConfig, loadEnv, ensureDir } from './utils/config';
export { logger, setVerbose } from './utils/logger';

export type {
  // Core
  DOMElement,
  DOMState,
  ActionPlan,
  Action,
  ActionResult,
  ExecutionResult,
  // Test types
  TestCase,
  TestStep,
  StepResult,
  TestResult,
  TestSuiteResult,
  // Config
  PageAgentConfig,
  CLIOptions,
  // LLM
  LLMMessage,
  LLMCompletionOptions,
  LLMCompletionResult,
  LLMResponse,
} from './core/types';
