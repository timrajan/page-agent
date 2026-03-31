Page Agent
An AI-powered Puppeteer test automation framework. Write tests in plain English — the AI agent converts your instructions into precise browser actions.

Inspired by Alibaba's Page Agent approach: no screenshots, no vision models. Instead, the DOM is extracted as structured text and sent to an LLM which returns a JSON action plan that Puppeteer executes.

How It Works
text
.test file (plain English)
        │
        ▼
  Test Runner reads each line
        │
        ▼ (for each step)
  DOM Processor ──► scans the page with page.evaluate()
        │            builds a numbered list of interactive elements
        ▼
  LLM Planner ────► sends element list + your instruction to the LLM
        │            LLM returns a JSON action plan
        ▼
  Action Executor ► converts element indices to CSS selectors
        │            executes via Puppeteer (click, type, select, etc.)
        ▼
  Pass / Fail ────► next step
        │
        ▼
  HTML Report
Every test step goes through the LLM. The LLM reads the page's interactive elements and figures out which one matches your plain English description — no hardcoded selectors needed.

Features
Plain English tests — write natural language instructions, no code required

Pure LLM-driven — every step is interpreted by your LLM, no keyword matching or fuzzy logic

DOM-based context — injects JS into the page to extract all interactive elements as structured text

BYOLLM — works with any OpenAI-compatible API: GPT-4o, Qwen, DeepSeek, Ollama, vLLM, etc.

Smart retries — on failure, re-extracts the DOM and retries with the LLM up to MAX_RETRIES times

Headed or headless — watch the browser in real time or run invisibly in CI

HTML reports — test reports with pass/fail status per step

CLI runner — npx page-agent run ./tests

Quick Start
1. Install dependencies
bash
npm install
2. Install Chromium for Puppeteer
bash
npx puppeteer browsers install chrome
3. Set up your LLM
If using a local model via Ollama:

bash
ollama pull qwen3.5:4b
4. Configure
bash
cp .env.example .env
Edit .env with your LLM details:

text
# Local Ollama
LLM_BASE_URL=http://localhost:11434/v1
LLM_API_KEY=ollama
LLM_MODEL=qwen3.5:4b
HEADLESS=false
5. Build and run
bash
npm run build
npx page-agent run examples/login-flow.test --headed
You'll see a Chromium browser open and execute each step in real time.

Writing Tests
Create a .test file with metadata headers and plain English steps:

text
# Test: Student Registration
# URL: https://testrpages.com/vanilla-tailwind/good
# Tags: smoke, registration

Navigate to https://testrpages.com/vanilla-tailwind/good
Verify that the page contains "Student Registration"

Type "James" in the First name input field
Type "Anderson" in the Last name input field
Select "High School" from the Grade dropdown
Type "A passionate student who loves science." in the Student Personal Statement textarea

Click the Submit Application button
Wait for 2 seconds
Take a screenshot named "form-submitted"
Test File Format
text
# Test: <name>          ← required: test name
# URL: <url>            ← optional: starting URL
# Tags: tag1, tag2      ← optional: comma-separated tags

<plain English step 1>
<plain English step 2>
...
Supported Action Types
The LLM can produce any of these actions based on your English instructions:

You write...	The LLM produces...
Navigate to https://example.com	navigate action
Type "hello" in the search box	click + type actions
Click the Submit button	click action
Select "Physics" from the Course dropdown	select action
Hover over the menu item	hover action
Press Enter	press action
Scroll down 400	scroll action
Wait for 2 seconds	wait action
Verify that the page contains "Success"	assert_text action
Take a screenshot named "result"	screenshot action
You don't need to remember exact syntax — the LLM interprets natural language. "Click the login button", "Press the sign in button", "Hit the log in link" all work.

CLI Reference
bash
# Run a single test file
npx page-agent run ./tests/login.test

# Run all tests in a directory
npx page-agent run ./tests

# Run with visible browser
npx page-agent run ./tests --headed

# Filter by tag
npx page-agent run ./tests --tag smoke

# Generate HTML report
npx page-agent run ./tests --report html

# Both console and HTML output
npx page-agent run ./tests --report both

# Override model at runtime
npx page-agent run ./tests --model qwen3.5:9b

# Override timeout and retries
npx page-agent run ./tests --timeout 60000 --retries 5

# Validate test files without running
npx page-agent validate ./tests

# Scaffold a new project
npx page-agent init

# Verbose/debug output
npx page-agent run ./tests --verbose
Configuration
All configuration is via environment variables (or a .env file):

Variable	Default	Description
LLM_API_KEY	(required)	API key for your LLM provider
LLM_MODEL	gpt-4o	Model name
LLM_BASE_URL	https://api.openai.com/v1	API base URL
LLM_PROVIDER	openai	Provider identifier (informational)
HEADLESS	true	Set to false to see the browser
VIEWPORT_WIDTH	1280	Browser viewport width
VIEWPORT_HEIGHT	720	Browser viewport height
TIMEOUT	30000	Action timeout in ms
MAX_RETRIES	3	Max retries per step on failure
SCREENSHOT_DIR	./screenshots	Screenshot output directory
LLM Provider Examples
Local Ollama:

text
LLM_BASE_URL=http://localhost:11434/v1
LLM_MODEL=qwen3.5:4b
LLM_API_KEY=ollama
OpenAI:

text
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-4o
LLM_API_KEY=sk-your-openai-key
DeepSeek:

text
LLM_BASE_URL=https://api.deepseek.com/v1
LLM_MODEL=deepseek-chat
LLM_API_KEY=sk-your-deepseek-key
Qwen via DashScope (Alibaba Cloud):

text
LLM_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
LLM_MODEL=qwen-turbo
LLM_API_KEY=sk-your-dashscope-key
vLLM on a remote server:

text
LLM_BASE_URL=http://your-gpu-server:8000/v1
LLM_MODEL=Qwen/Qwen2.5-7B-Instruct
LLM_API_KEY=token-123
Architecture
text
page-agent/
├── src/
│   ├── cli.ts                   # CLI entry point (run / validate / init)
│   ├── index.ts                 # Public API exports
│   ├── core/
│   │   ├── page-agent.ts        # Main agent loop — orchestrates DOM → LLM → Execute
│   │   ├── dom-processor.ts     # Injects JS via page.evaluate() to extract interactive elements
│   │   ├── llm-planner.ts       # Sends DOM + instruction to LLM, parses JSON action plan
│   │   ├── action-executor.ts   # Resolves element indices to CSS selectors, executes via Puppeteer
│   │   └── types.ts             # TypeScript interfaces (32 types)
│   ├── llm/
│   │   ├── provider.ts          # LLM provider interface
│   │   └── openai-provider.ts   # OpenAI-compatible provider (works with Ollama, vLLM, etc.)
│   ├── runner/
│   │   ├── test-runner.ts       # Test orchestration and browser lifecycle
│   │   ├── test-parser.ts       # Parses .test files into structured test cases
│   │   └── reporter.ts          # Console output + HTML report generation
│   └── utils/
│       ├── logger.ts            # Colored console logging
│       └── config.ts            # Environment and .env file loading
├── examples/
│   ├── login-flow.test                        # Login test (the-internet.herokuapp.com)
│   ├── form-fill.test                         # Forgot password form test
│   ├── google-search.test                     # Google search test
│   ├── student-registration-vanilla.test      # Student form — Vanilla JS + Tailwind
│   └── student-registration-react-mui.test    # Student form — React + Material UI
├── tests/
│   └── example.test
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
Core Components
Component	What it does
DOM Processor	Injects JavaScript into the browser page to find all interactive elements (buttons, inputs, links, dropdowns, etc.). Assigns each a number and builds a text list like [1] <button> "Submit". Also generates a map of index → CSS selector.
LLM Planner	Takes the numbered element list + your English instruction and sends it to the LLM. The LLM returns a JSON plan with actions like { "type": "click", "elementIndex": 1 }. Handles response parsing, JSON extraction, and validation.
Action Executor	Receives the JSON plan, looks up the CSS selector for each element index, and calls the corresponding Puppeteer method (page.click(), page.type(), page.select(), etc.). Handles scrolling into view, waiting for elements, and navigation.
Page Agent	The orchestrator. For each test step: extracts DOM → sends to LLM → executes plan → retries on failure.
Test Runner	Manages browser launch, test file discovery, and runs each test case through the Page Agent.
Reporter	Outputs colored console results and generates HTML reports.
Programmatic API
typescript
import { TestRunner, loadConfig, loadEnv } from 'page-agent';

loadEnv();
const config = loadConfig();
const runner = new TestRunner(config);

const results = await runner.run('./tests', {
  tag: 'smoke',
  headed: true,
  report: 'html',
});

console.log(`Passed: ${results.passed}/${results.totalTests}`);
Custom LLM Provider
typescript
import { LLMProvider, LLMCompletionOptions, LLMCompletionResult } from 'page-agent';

class MyProvider implements LLMProvider {
  readonly name = 'my-provider';
  readonly model = 'my-model';

  async complete(options: LLMCompletionOptions): Promise<LLMCompletionResult> {
    // Call your custom LLM API here
    return { content: '...', model: this.model };
  }
}
Performance Tips
LLM speed is the bottleneck — each step requires an LLM call. Use a smaller model (qwen3.5:4b) for faster responses on a laptop.

GPU server recommended — for production use, host the LLM on a server with a GPU (even an NVIDIA T4 at ~$0.35/hr makes a big difference).

Headless mode — set HEADLESS=true for faster execution when you don't need to watch.

Reduce retries — set MAX_RETRIES=1 for faster feedback during development.

Example Test Sites
The framework works with any website. Some good sites for practice:

the-internet.herokuapp.com — classic automation practice site

testrpages.com — 20 tech stacks with Good/Bad/Ugly testing modes