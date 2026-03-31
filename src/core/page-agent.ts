import { Page } from 'puppeteer';
import {
  TestStep,
  StepResult,
  PageAgentConfig,
} from './types';
import { DOMProcessor } from './dom-processor';
import { LLMPlanner } from './llm-planner';
import { ActionExecutor } from './action-executor';
import { OpenAIProvider } from '../llm/openai-provider';
import { logger } from '../utils/logger';

/**
 * The main PageAgent class — pure LLM-driven.
 *
 * For each test step:
 * 1. Extracts current DOM state via DOMProcessor
 * 2. Sends DOM + instruction to LLMPlanner
 * 3. Executes the resulting action plan via ActionExecutor
 * 4. Retries up to maxRetries if execution fails
 *
 * Every step goes through the LLM — no fuzzy matching or keyword fallback.
 */
export class PageAgent {
  private page: Page;
  private config: PageAgentConfig;
  private domProcessor: DOMProcessor;
  private llmPlanner: LLMPlanner;
  private executor: ActionExecutor;

  constructor(page: Page, config: PageAgentConfig) {
    this.page = page;
    this.config = config;
    this.domProcessor = new DOMProcessor();

    if (!config.llmApiKey) {
      throw new Error(
        'LLM_API_KEY is required. Set it in your .env file or as an environment variable.\n' +
        'The Page Agent framework sends every step to the LLM for interpretation.'
      );
    }

    const provider = new OpenAIProvider(
      config.llmApiKey,
      config.llmModel,
      config.llmBaseUrl
    );
    this.llmPlanner = new LLMPlanner(provider);

    this.executor = new ActionExecutor(
      page,
      this.domProcessor,
      config.screenshotDir,
      config.timeout
    );
  }

  /**
   * Execute a single test step through the agent loop.
   */
  async executeStep(step: TestStep): Promise<StepResult> {
    const start = Date.now();
    let retries = 0;
    const maxRetries = this.config.maxRetries;

    while (retries <= maxRetries) {
      try {
        // 1. Extract current DOM state
        const domState = await this.domProcessor.extractState(this.page);
        this.executor.updateElementMap(domState.elementMap);

        // 2. Send DOM + instruction to LLM
        logger.debug(`Sending to LLM: "${step.instruction}"`);
        const llmResponse = await this.llmPlanner!.plan(domState, step.instruction);

        if (!llmResponse.plan) {
          const err = llmResponse.error ?? 'LLM returned no valid plan';
          if (retries >= maxRetries) {
            return this.makeFailResult(step, start, err, retries);
          }
          retries++;
          logger.warn(`LLM planning failed (attempt ${retries}/${maxRetries}): ${err}`);
          await this.sleep(1000 * retries);
          continue;
        }

        const plan = llmResponse.plan;
        logger.thought(plan.thought);

        // 4. Execute the action plan
        const execResult = await this.executor.executePlan(plan);

        if (execResult.success) {
          // Brief wait for any dynamic content to settle
          await this.sleep(300);

          return {
            step,
            status: 'passed',
            thought: plan.thought,
            executedActions: execResult.actionResults,
            durationMs: Date.now() - start,
            retries,
          };
        }

        // 5. Execution failed — retry with fresh DOM
        const failureMsg = execResult.error ?? 'Execution failed';
        if (retries >= maxRetries) {
          return {
            step,
            status: 'failed',
            thought: plan.thought,
            executedActions: execResult.actionResults,
            error: `Step failed after ${retries} retries: ${failureMsg}`,
            durationMs: Date.now() - start,
            retries,
          };
        }

        retries++;
        logger.warn(
          `Step execution failed (attempt ${retries}/${maxRetries}): ${failureMsg}. Retrying...`
        );
        await this.sleep(1500 * retries);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        if (retries >= maxRetries) {
          return this.makeFailResult(step, start, message, retries);
        }
        retries++;
        logger.warn(`Unexpected error (attempt ${retries}/${maxRetries}): ${message}`);
        await this.sleep(1000 * retries);
      }
    }

    // Should never reach here, but TypeScript needs this
    return this.makeFailResult(step, start, 'Max retries exceeded', retries);
  }

  private makeFailResult(
    step: TestStep,
    start: number,
    error: string,
    retries: number
  ): StepResult {
    return {
      step,
      status: 'failed',
      executedActions: [],
      error,
      durationMs: Date.now() - start,
      retries,
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
