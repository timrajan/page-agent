import { LLMCompletionOptions, LLMCompletionResult } from '../core/types';

/**
 * Abstract interface for LLM providers.
 * Implement this to add support for new providers (OpenAI, Anthropic, local, etc.)
 */
export interface LLMProvider {
  /** Human-readable provider name */
  readonly name: string;

  /** The model currently being used */
  readonly model: string;

  /**
   * Send a chat completion request to the LLM.
   * @param options - messages, model override, temperature, etc.
   * @returns The completion result with content and token usage
   */
  complete(options: LLMCompletionOptions): Promise<LLMCompletionResult>;
}
