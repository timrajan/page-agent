import OpenAI from 'openai';
import { LLMCompletionOptions, LLMCompletionResult } from '../core/types';
import { LLMProvider } from './provider';
import { logger } from '../utils/logger';

/**
 * OpenAI-compatible LLM provider.
 *
 * Works with any OpenAI-compatible API:
 *   - OpenAI (GPT-4, GPT-4o, etc.)
 *   - DeepSeek
 *   - Qwen / DashScope
 *   - Mistral
 *   - Ollama (local)
 *   - Any other OpenAI-compatible endpoint
 */
export class OpenAIProvider implements LLMProvider {
  readonly name = 'openai-compatible';
  readonly model: string;

  private client: OpenAI;

  constructor(apiKey: string, model: string, baseUrl?: string) {
    this.model = model;
    this.client = new OpenAI({
      apiKey,
      baseURL: baseUrl,
    });
  }

  async complete(options: LLMCompletionOptions): Promise<LLMCompletionResult> {
    const modelToUse = options.model ?? this.model;

    logger.debug(`LLM request to model: ${modelToUse}`);
    logger.debug(`Messages: ${JSON.stringify(options.messages, null, 2)}`);

    try {
      const response = await this.client.chat.completions.create({
        model: modelToUse,
        messages: options.messages as OpenAI.Chat.ChatCompletionMessageParam[],
        temperature: options.temperature ?? 0,
        max_tokens: options.maxTokens ?? 2048,
      });

      const content = response.choices[0]?.message?.content ?? '';
      const usage = response.usage;

      logger.debug(`LLM response: ${content}`);

      return {
        content,
        model: response.model,
        usage: usage
          ? {
              promptTokens: usage.prompt_tokens,
              completionTokens: usage.completion_tokens,
              totalTokens: usage.total_tokens,
            }
          : undefined,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`LLM API call failed: ${message}`);
    }
  }
}
