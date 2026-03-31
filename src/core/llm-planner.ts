import { LLMProvider } from '../llm/provider';
import { DOMState, ActionPlan, LLMResponse, Action } from './types';
import { logger } from '../utils/logger';

/**
 * The LLM Planner converts natural language instructions + DOM state
 * into structured action plans.
 *
 * It uses a carefully crafted system prompt to ensure the model always
 * returns valid, parseable JSON.
 */
export class LLMPlanner {
  private provider: LLMProvider;

  constructor(provider: LLMProvider) {
    this.provider = provider;
  }

  /**
   * Build the system prompt that defines the action vocabulary and
   * instructs the LLM to return ONLY valid JSON.
   */
  private buildSystemPrompt(): string {
    return `You are a browser automation assistant. Your job is to interpret natural language instructions and translate them into precise browser actions.

You will be given:
1. The current page URL and title
2. A list of interactive elements on the page, each with an index number like [1], [2], etc.
3. A natural language instruction to execute

You must respond with ONLY a valid JSON object — no markdown, no explanation, no code fences. Just raw JSON.

The JSON must follow this exact schema:
{
  "thought": "Your reasoning about what actions are needed",
  "actions": [
    // Array of action objects (see action types below)
  ]
}

Available action types:

1. click — Click an element
   { "type": "click", "elementIndex": 2, "description": "Click the submit button" }

2. type — Type text into an input
   { "type": "type", "elementIndex": 3, "text": "hello world", "description": "Type into search box" }

3. select — Select an option from a dropdown
   { "type": "select", "elementIndex": 4, "value": "United States", "description": "Select country" }

4. hover — Hover over an element
   { "type": "hover", "elementIndex": 5, "description": "Hover over menu item" }

5. press — Press a keyboard key
   { "type": "press", "key": "Enter", "description": "Press Enter to submit" }
   Valid keys: Enter, Tab, Escape, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Backspace, Delete, Space, F1-F12, and any single character.

6. scroll — Scroll the page
   { "type": "scroll", "direction": "down", "amount": 300, "description": "Scroll down" }
   direction: "up" | "down" | "left" | "right"
   amount: pixels to scroll (default 300 if omitted)

7. wait — Wait for a duration
   { "type": "wait", "ms": 1000, "description": "Wait for animation" }

8. navigate — Navigate to a URL
   { "type": "navigate", "url": "https://example.com", "description": "Go to homepage" }

9. assert_text — Verify text exists on the page
   { "type": "assert_text", "text": "Success", "description": "Verify success message" }
   Add "negate": true to assert text does NOT exist.

10. assert_element — Verify an element property
    { "type": "assert_element", "elementIndex": 2, "property": "value", "value": "test@example.com", "description": "Verify email field" }
    Valid properties: "value", "text", "checked", "disabled", "visible"

11. screenshot — Take a screenshot
    { "type": "screenshot", "name": "search-results", "description": "Capture results" }

IMPORTANT RULES:
- You MUST return ONLY valid JSON — no prose, no markdown, no backticks
- elementIndex must refer to an actual index from the provided element list
- For "Verify that X" instructions, use assert_text or assert_element actions
- For "Take a screenshot named X" instructions, use the screenshot action
- For "Navigate to X" instructions, use the navigate action
- For "Press Enter" or similar, use the press action
- For "Wait for X seconds", use the wait action with ms = X * 1000
- If an instruction seems ambiguous, do your best to infer intent from context
- If no element matches exactly, choose the closest semantic match
- Use multiple actions when a single instruction requires multiple steps (e.g., click then type)
- For "type" actions, always click the element first if it needs focus`;
  }

  /**
   * Build the user message with DOM context and instruction.
   */
  private buildUserMessage(domState: DOMState, instruction: string): string {
    const elementList = domState.textRepresentation || '(no interactive elements found)';

    return `Current page:
URL: ${domState.url}
Title: ${domState.title}

Interactive elements:
${elementList}

Instruction: ${instruction}

Respond with ONLY a JSON action plan.`;
  }

  /**
   * Parse the LLM response string into an ActionPlan.
   * Handles common issues like markdown code fences.
   */
  private parseResponse(rawContent: string): ActionPlan | null {
    let content = rawContent.trim();

    // Strip markdown code fences if present
    content = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

    // Find the JSON object boundaries
    const startIdx = content.indexOf('{');
    const lastIdx = content.lastIndexOf('}');
    if (startIdx === -1 || lastIdx === -1) {
      logger.debug(`No JSON object found in LLM response: ${content}`);
      return null;
    }
    content = content.substring(startIdx, lastIdx + 1);

    try {
      const parsed = JSON.parse(content) as Record<string, unknown>;

      // Validate structure
      if (typeof parsed.thought !== 'string') {
        parsed.thought = 'No reasoning provided';
      }
      if (!Array.isArray(parsed.actions)) {
        logger.warn('LLM response missing "actions" array');
        return null;
      }

      // Validate and type each action
      const actions: Action[] = [];
      for (const rawAction of parsed.actions as Record<string, unknown>[]) {
        if (!rawAction.type || typeof rawAction.type !== 'string') continue;

        // Basic structural validation per action type
        try {
          const action = this.validateAction(rawAction);
          if (action) actions.push(action);
        } catch (err) {
          logger.warn(`Skipping invalid action: ${JSON.stringify(rawAction)} — ${err}`);
        }
      }

      return {
        thought: parsed.thought as string,
        actions,
      };
    } catch (err) {
      logger.debug(`JSON parse error: ${err}`);
      logger.debug(`Raw content was: ${content}`);
      return null;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private validateAction(raw: Record<string, any>): Action | null {
    switch (raw.type) {
      case 'click':
        if (typeof raw.elementIndex !== 'number') throw new Error('click requires elementIndex');
        return { type: 'click', elementIndex: raw.elementIndex, description: raw.description };

      case 'type':
        if (typeof raw.elementIndex !== 'number') throw new Error('type requires elementIndex');
        if (typeof raw.text !== 'string') throw new Error('type requires text');
        return { type: 'type', elementIndex: raw.elementIndex, text: raw.text, description: raw.description };

      case 'select':
        if (typeof raw.elementIndex !== 'number') throw new Error('select requires elementIndex');
        if (typeof raw.value !== 'string') throw new Error('select requires value');
        return { type: 'select', elementIndex: raw.elementIndex, value: raw.value, description: raw.description };

      case 'hover':
        if (typeof raw.elementIndex !== 'number') throw new Error('hover requires elementIndex');
        return { type: 'hover', elementIndex: raw.elementIndex, description: raw.description };

      case 'press':
        if (typeof raw.key !== 'string') throw new Error('press requires key');
        return { type: 'press', key: raw.key, description: raw.description };

      case 'scroll': {
        const dir = raw.direction as string;
        if (!['up', 'down', 'left', 'right'].includes(dir)) throw new Error('scroll requires valid direction');
        return {
          type: 'scroll',
          direction: dir as 'up' | 'down' | 'left' | 'right',
          amount: typeof raw.amount === 'number' ? raw.amount : 300,
          description: raw.description,
        };
      }

      case 'wait':
        if (typeof raw.ms !== 'number') throw new Error('wait requires ms');
        return { type: 'wait', ms: raw.ms, description: raw.description };

      case 'navigate':
        if (typeof raw.url !== 'string') throw new Error('navigate requires url');
        return { type: 'navigate', url: raw.url, description: raw.description };

      case 'assert_text':
        if (typeof raw.text !== 'string') throw new Error('assert_text requires text');
        return {
          type: 'assert_text',
          text: raw.text,
          negate: raw.negate === true,
          description: raw.description,
        };

      case 'assert_element':
        if (typeof raw.elementIndex !== 'number') throw new Error('assert_element requires elementIndex');
        if (typeof raw.property !== 'string') throw new Error('assert_element requires property');
        if (typeof raw.value !== 'string') throw new Error('assert_element requires value');
        return {
          type: 'assert_element',
          elementIndex: raw.elementIndex,
          property: raw.property,
          value: raw.value,
          description: raw.description,
        };

      case 'screenshot':
        if (typeof raw.name !== 'string') throw new Error('screenshot requires name');
        return { type: 'screenshot', name: raw.name, description: raw.description };

      default:
        logger.warn(`Unknown action type: ${raw.type}`);
        return null;
    }
  }

  /**
   * Plan actions for a given instruction given the current DOM state.
   */
  async plan(domState: DOMState, instruction: string): Promise<LLMResponse> {
    logger.debug(`Planning for: "${instruction}"`);

    try {
      const result = await this.provider.complete({
        messages: [
          { role: 'system', content: this.buildSystemPrompt() },
          { role: 'user', content: this.buildUserMessage(domState, instruction) },
        ],
        temperature: 0,
        maxTokens: 2048,
      });

      const plan = this.parseResponse(result.content);

      if (!plan) {
        return {
          rawContent: result.content,
          plan: null,
          error: 'Failed to parse LLM response as valid JSON action plan',
        };
      }

      return { rawContent: result.content, plan };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        rawContent: '',
        plan: null,
        error: `LLM planning failed: ${message}`,
      };
    }
  }
}
