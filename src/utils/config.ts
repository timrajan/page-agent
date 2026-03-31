import * as path from 'path';
import * as fs from 'fs';
import { PageAgentConfig } from '../core/types';

/**
 * Loads configuration from environment variables, with sensible defaults.
 * Call loadEnv() first if you need to load from a .env file.
 */
export function loadConfig(overrides?: Partial<PageAgentConfig>): PageAgentConfig {
  const config: PageAgentConfig = {
    llmProvider: process.env.LLM_PROVIDER ?? 'openai',
    llmModel: process.env.LLM_MODEL ?? 'gpt-4o',
    llmApiKey: process.env.LLM_API_KEY ?? '',
    llmBaseUrl: process.env.LLM_BASE_URL ?? 'https://api.openai.com/v1',
    headless: parseBoolean(process.env.HEADLESS, true),
    viewportWidth: parseInt(process.env.VIEWPORT_WIDTH ?? '1280', 10),
    viewportHeight: parseInt(process.env.VIEWPORT_HEIGHT ?? '720', 10),
    timeout: parseInt(process.env.TIMEOUT ?? '30000', 10),
    maxRetries: parseInt(process.env.MAX_RETRIES ?? '3', 10),
    screenshotDir: process.env.SCREENSHOT_DIR ?? './screenshots',
    ...overrides,
  };

  return config;
}

/**
 * Load a .env file from the current working directory or a specific path.
 */
export function loadEnv(envPath?: string): void {
  const targetPath = envPath ?? path.join(process.cwd(), '.env');

  if (fs.existsSync(targetPath)) {
    const content = fs.readFileSync(targetPath, 'utf8');
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      // Skip comments and empty lines
      if (!trimmed || trimmed.startsWith('#')) continue;

      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;

      const key = trimmed.substring(0, eqIdx).trim();
      let value = trimmed.substring(eqIdx + 1).trim();

      // Strip inline comments
      const commentIdx = value.indexOf(' #');
      if (commentIdx !== -1) {
        value = value.substring(0, commentIdx).trim();
      }

      // Strip surrounding quotes
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }

      // Only set if not already set in environment
      if (key && !(key in process.env)) {
        process.env[key] = value;
      }
    }
  }
}

function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue;
  return value.toLowerCase() === 'true' || value === '1';
}

/** Ensure a directory exists, creating it if necessary */
export function ensureDir(dirPath: string): void {
  const resolved = path.isAbsolute(dirPath)
    ? dirPath
    : path.join(process.cwd(), dirPath);

  if (!fs.existsSync(resolved)) {
    fs.mkdirSync(resolved, { recursive: true });
  }
}

/** Resolve a path relative to cwd if not absolute */
export function resolvePath(p: string): string {
  return path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
}
