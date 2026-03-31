/**
 * Core TypeScript interfaces for the Page Agent framework.
 */

// ─── DOM Processor Types ─────────────────────────────────────────────────────

/** An interactive element extracted from the page DOM */
export interface DOMElement {
  /** Unique index used to reference the element in action plans */
  index: number;
  /** HTML tag name (button, input, a, select, textarea, etc.) */
  tag: string;
  /** Element type attribute (text, password, submit, checkbox, etc.) */
  type?: string;
  /** ARIA role */
  role?: string;
  /** Visible text content */
  text?: string;
  /** Placeholder attribute */
  placeholder?: string;
  /** aria-label attribute */
  ariaLabel?: string;
  /** name attribute */
  name?: string;
  /** id attribute */
  id?: string;
  /** href (for links) */
  href?: string;
  /** Current value */
  value?: string;
  /** Whether the element is currently visible */
  visible: boolean;
  /** Whether the element is disabled */
  disabled: boolean;
  /** Available options (for select elements) */
  options?: string[];
  /** CSS selector to locate this element */
  selector: string;
  /** XPath expression (fallback) */
  xpath?: string;
}

/** Result of DOM extraction from the current page state */
export interface DOMState {
  /** URL of the current page */
  url: string;
  /** Page title */
  title: string;
  /** Extracted interactive elements */
  elements: DOMElement[];
  /** Compact text representation sent to the LLM */
  textRepresentation: string;
  /** Map from element index to DOM selector */
  elementMap: Map<number, string>;
  /** Timestamp of extraction */
  timestamp: number;
}

// ─── Action Types ─────────────────────────────────────────────────────────────

export type ActionType =
  | 'click'
  | 'type'
  | 'select'
  | 'hover'
  | 'press'
  | 'scroll'
  | 'wait'
  | 'navigate'
  | 'assert_text'
  | 'assert_element'
  | 'screenshot';

export interface BaseAction {
  type: ActionType;
  description?: string;
}

export interface ClickAction extends BaseAction {
  type: 'click';
  elementIndex: number;
}

export interface TypeAction extends BaseAction {
  type: 'type';
  elementIndex: number;
  text: string;
}

export interface SelectAction extends BaseAction {
  type: 'select';
  elementIndex: number;
  value: string;
}

export interface HoverAction extends BaseAction {
  type: 'hover';
  elementIndex: number;
}

export interface PressAction extends BaseAction {
  type: 'press';
  key: string;
}

export interface ScrollAction extends BaseAction {
  type: 'scroll';
  direction: 'up' | 'down' | 'left' | 'right';
  amount?: number;
}

export interface WaitAction extends BaseAction {
  type: 'wait';
  ms: number;
}

export interface NavigateAction extends BaseAction {
  type: 'navigate';
  url: string;
}

export interface AssertTextAction extends BaseAction {
  type: 'assert_text';
  text: string;
  /** If true, checks that the text does NOT exist */
  negate?: boolean;
}

export interface AssertElementAction extends BaseAction {
  type: 'assert_element';
  elementIndex: number;
  property: string;
  value: string;
}

export interface ScreenshotAction extends BaseAction {
  type: 'screenshot';
  name: string;
}

export type Action =
  | ClickAction
  | TypeAction
  | SelectAction
  | HoverAction
  | PressAction
  | ScrollAction
  | WaitAction
  | NavigateAction
  | AssertTextAction
  | AssertElementAction
  | ScreenshotAction;

// ─── LLM Planner Types ────────────────────────────────────────────────────────

/** The structured response from the LLM planner */
export interface ActionPlan {
  /** LLM reasoning / chain-of-thought */
  thought: string;
  /** Sequence of actions to execute */
  actions: Action[];
}

/** Raw LLM response before parsing */
export interface LLMResponse {
  rawContent: string;
  plan: ActionPlan | null;
  error?: string;
}

// ─── Action Executor Types ────────────────────────────────────────────────────

export interface ActionResult {
  action: Action;
  success: boolean;
  error?: string;
  /** Path to screenshot file (for screenshot actions) */
  screenshotPath?: string;
  /** Duration in milliseconds */
  durationMs: number;
}

export interface ExecutionResult {
  success: boolean;
  actionResults: ActionResult[];
  error?: string;
  durationMs: number;
}

// ─── Test File Types ──────────────────────────────────────────────────────────

/** A single parsed step from a .test file */
export interface TestStep {
  /** Original instruction text as written */
  instruction: string;
  /** Line number in the source file */
  lineNumber: number;
  /** Pre-classified step type (if keyword match) */
  stepType?: StepType;
  /** Extracted arguments for keyword steps */
  args?: Record<string, string>;
}

export type StepType =
  | 'navigate'
  | 'type'
  | 'click'
  | 'verify'
  | 'wait'
  | 'screenshot'
  | 'select'
  | 'hover'
  | 'press'
  | 'scroll'
  | 'generic';

/** A parsed test file */
export interface TestCase {
  /** Test name (from # Test: header) */
  name: string;
  /** Target URL (from # URL: header) */
  url: string;
  /** Tags for filtering (from # Tags: header) */
  tags: string[];
  /** Ordered test steps */
  steps: TestStep[];
  /** Absolute path to the source .test file */
  filePath: string;
}

// ─── Test Result Types ────────────────────────────────────────────────────────

export type StepStatus = 'passed' | 'failed' | 'skipped';

export interface StepResult {
  step: TestStep;
  status: StepStatus;
  /** LLM thought/reasoning for this step */
  thought?: string;
  /** Actions that were executed */
  executedActions: ActionResult[];
  error?: string;
  durationMs: number;
  /** Number of retry attempts made */
  retries: number;
}

export type TestStatus = 'passed' | 'failed' | 'skipped';

export interface TestResult {
  testCase: TestCase;
  status: TestStatus;
  stepResults: StepResult[];
  startTime: number;
  endTime: number;
  durationMs: number;
  /** Paths to any screenshots taken */
  screenshots: string[];
}

export interface TestSuiteResult {
  totalTests: number;
  passed: number;
  failed: number;
  skipped: number;
  durationMs: number;
  results: TestResult[];
  startTime: number;
  endTime: number;
}

// ─── Configuration Types ──────────────────────────────────────────────────────

export interface PageAgentConfig {
  /** LLM provider identifier */
  llmProvider: string;
  /** LLM model name */
  llmModel: string;
  /** API key */
  llmApiKey: string;
  /** Base URL for OpenAI-compatible API */
  llmBaseUrl: string;
  /** Run browser headlessly */
  headless: boolean;
  /** Browser viewport width */
  viewportWidth: number;
  /** Browser viewport height */
  viewportHeight: number;
  /** Default timeout in ms */
  timeout: number;
  /** Max retry attempts per step */
  maxRetries: number;
  /** Directory for screenshots */
  screenshotDir: string;
}

// ─── LLM Provider Types ───────────────────────────────────────────────────────

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMCompletionOptions {
  messages: LLMMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface LLMCompletionResult {
  content: string;
  model: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

// ─── CLI Types ────────────────────────────────────────────────────────────────

export interface CLIOptions {
  headed?: boolean;
  tag?: string;
  report?: 'console' | 'html' | 'both';
  model?: string;
  timeout?: number;
  retries?: number;
  outputDir?: string;
}
