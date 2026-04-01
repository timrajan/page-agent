````markdown
# 🤖 Page Agent

> An AI-powered Puppeteer test automation framework. Write tests in plain English — the AI agent converts your instructions into precise browser actions.

Inspired by Alibaba's Page Agent approach: **no screenshots, no vision models**. Instead, the DOM is extracted as structured text and sent to an LLM which returns a JSON action plan that Puppeteer executes.

---

## How It Works

.test file (plain English)
        │
        ▼
Test Runner reads each line
        │
        ▼ (for each step)
DOM Processor ──────► scans the page with page.evaluate()
        │               builds a numbered list of interactive elements
        ▼
LLM Planner ─────────► sends element list + your instruction to the LLM
        │               LLM returns a JSON action plan
        ▼
Action Executor ─────► converts element indices to CSS selectors
        │               executes via Puppeteer (click, type, select, etc.)
        ▼
  Pass / Fail ─────────► next step
        │
        ▼
   HTML Report


Every test step goes through the LLM. The LLM reads the page's interactive elements and figures out which one matches your plain English description — **no hardcoded selectors needed**.

---

## Features

- 📝 **Plain English tests** — write natural language instructions, no code required
- 🧠 **Pure LLM-driven** — every step is interpreted by your LLM, no keyword matching or fuzzy logic
- 🌐 **DOM-based context** — injects JS into the page to extract all interactive elements as structured text
- 🔌 **BYOLLM** — works with any OpenAI-compatible API: GPT-4o, Qwen, DeepSeek, Ollama, vLLM, etc.
- 🔁 **Smart retries** — on failure, re-extracts the DOM and retries with the LLM up to `MAX_RETRIES` times
- 👁️ **Headed or headless** — watch the browser in real time or run invisibly in CI
- 📊 **HTML reports** — test reports with pass/fail status per step
- ⚡ **CLI runner** — run tests with `npx page-agent run ./tests`

---

## Quick Start

**1. Install dependencies**

npm install


**2. Install Chromium for Puppeteer**

npx puppeteer browsers install chrome


**3. Set up your LLM**

If using a local model via Ollama:

ollama pull qwen3.5:4b


**4. Configure**

cp .env.example .env


Edit `.env` with your LLM details:
```env
LLM_BASE_URL=http://localhost:11434/v1
LLM_API_KEY=ollama
LLM_MODEL=qwen3.5:4b
HEADLESS=false


**5. Build and run**

npm run build
npx page-agent run examples/login-flow.test --headed


You'll see a Chromium browser open and execute each step in real time.

---

## Writing Tests

Create a `.test` file with metadata headers and plain English steps:

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
````

### Test File Format

| Line format | Purpose |
|---|---|
| `# Test: ...` | Sets the test name *(required)* |
| `# URL: ...` | Sets the starting URL *(optional)* |
| `# Tags: ...` | Sets comma-separated tags *(optional)* |
| Any other non-empty line | A test step |

---

## Supported Action Types

| You write... | The LLM produces... |
|---|---|
| `Navigate to https://example.com` | `navigate` action |
| `Type "hello" in the search box` | `click` + `type` actions |
| `Click the Submit button` | `click` action |
| `Select "Physics" from the Course dropdown` | `select` action |
| `Hover over the menu item` | `hover` action |
| `Press Enter` | `press` action |
| `Scroll down 400` | `scroll` action |
| `Wait for 2 seconds` | `wait` action |
| `Verify that the page contains "Success"` | `assert_text` action |
| `Take a screenshot named "result"` | `screenshot` action |

> You don't need to remember exact syntax — the LLM interprets natural language. *"Click the login button"*, *"Press the sign in button"*, *"Hit the log in link"* all work.

---

## CLI Reference
```bash
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
```



## Performance Tips

- ⏱️ **LLM speed is the bottleneck** — each step requires an LLM call. Use a smaller model (`qwen3.5:4b`) for faster responses on a laptop.
- 🖥️ **GPU server recommended** — for production use, host the LLM on a server with a GPU. Even an NVIDIA T4 at ~$0.35/hr makes a big difference.
- 🚀 **Headless mode** — set `HEADLESS=true` for faster execution when you don't need to watch.
- 🔁 **Reduce retries** — set `MAX_RETRIES=1` for faster feedback during development.

---

## Example Test Sites

- [the-internet.herokuapp.com](https://the-internet.herokuapp.com) — classic automation practice site
- [testrpages.com](https://testrpages.com) — 20 tech stacks with Good/Bad/Ugly testing modes

---

## License

[MIT](./LICENSE)

