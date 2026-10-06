import type { LiveProviderMetadata } from "../types.ts";

/**
 * Story 2.6: live configuration is environment-only. No config file parsing
 * and no dotenv dependency: the live command loads `.env` with Node's own
 * `--env-file-if-exists` flag, and only that command does so.
 */

export const liveConfigEnv = {
  apiKey: "ASSISTANT_LIVE_API_KEY",
  model: "ASSISTANT_LIVE_MODEL",
  baseUrl: "ASSISTANT_LIVE_BASE_URL",
  temperature: "ASSISTANT_LIVE_TEMPERATURE",
  maxOutputTokens: "ASSISTANT_LIVE_MAX_OUTPUT_TOKENS",
  timeoutMs: "ASSISTANT_LIVE_TIMEOUT_MS",
} as const;

/** Code defaults for optional values (documented in .env.example). */
export const liveConfigDefaults = {
  baseUrl: "https://openrouter.ai/api/v1",
  temperature: "0",
  timeoutMs: "30000",
} as const;

/** Current live provider choice. Only this file and the HTTP adapter care. */
export const liveProviderName = "openrouter";

export interface LiveConfig {
  readonly apiKey: string;
  readonly model: string;
  readonly baseUrl: string;
  readonly temperature: number;
  readonly maxOutputTokens?: number;
  readonly timeoutMs: number;
}

/**
 * `ok: false` means live evaluation could not be attempted: the caller must
 * report `unavailable` and must not create a provider or run a scenario.
 */
export type LiveConfigResolution =
  | { readonly ok: true; readonly config: LiveConfig }
  | { readonly ok: false; readonly problems: readonly string[] };

/** Trimmed value; an empty string counts as absent (as in `.env.example`). */
function readValue(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const raw = env[name];
  if (raw === undefined) {
    return undefined;
  }
  const trimmed = raw.trim();
  return trimmed === "" ? undefined : trimmed;
}

function parsePositiveInteger(name: string, value: string, problems: string[]): number | undefined {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    problems.push(`${name} must be a positive integer`);
    return undefined;
  }
  return parsed;
}

function parseTemperature(value: string, problems: string[]): number | undefined {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 2) {
    problems.push(`${liveConfigEnv.temperature} must be a number between 0 and 2`);
    return undefined;
  }
  return parsed;
}

/**
 * Resolve live configuration. Problems name variables and expected formats
 * only - never values - so an unavailable report can never leak a secret.
 */
export function loadLiveConfig(env: NodeJS.ProcessEnv = process.env): LiveConfigResolution {
  const problems: string[] = [];

  const apiKey = readValue(env, liveConfigEnv.apiKey);
  if (apiKey === undefined) {
    problems.push(`${liveConfigEnv.apiKey} is required for live evaluation`);
  }

  const model = readValue(env, liveConfigEnv.model);
  if (model === undefined) {
    problems.push(`${liveConfigEnv.model} is required for live evaluation`);
  }

  const baseUrl = readValue(env, liveConfigEnv.baseUrl) ?? liveConfigDefaults.baseUrl;
  const temperature = parseTemperature(
    readValue(env, liveConfigEnv.temperature) ?? liveConfigDefaults.temperature,
    problems,
  );
  const timeoutMs = parsePositiveInteger(
    liveConfigEnv.timeoutMs,
    readValue(env, liveConfigEnv.timeoutMs) ?? liveConfigDefaults.timeoutMs,
    problems,
  );

  const rawMaxOutputTokens = readValue(env, liveConfigEnv.maxOutputTokens);
  const maxOutputTokens =
    rawMaxOutputTokens === undefined
      ? undefined
      : parsePositiveInteger(liveConfigEnv.maxOutputTokens, rawMaxOutputTokens, problems);

  if (
    apiKey === undefined ||
    model === undefined ||
    temperature === undefined ||
    timeoutMs === undefined
  ) {
    return { ok: false, problems };
  }

  return {
    ok: true,
    config: {
      apiKey,
      model,
      baseUrl: baseUrl.replace(/\/+$/, ""),
      temperature,
      timeoutMs,
      ...(maxOutputTokens === undefined ? {} : { maxOutputTokens }),
    },
  };
}

/** Non-sensitive metadata allowed in reports (never credentials or headers). */
export function describeLiveConfig(config: LiveConfig): LiveProviderMetadata {
  return {
    provider: liveProviderName,
    model: config.model,
    temperature: config.temperature,
    ...(config.maxOutputTokens === undefined ? {} : { maxOutputTokens: config.maxOutputTokens }),
  };
}

/**
 * Defense in depth: strip anything credential-shaped before text reaches
 * stdout or a report, even though failure messages are built from fixed
 * templates that never contain request data.
 */
export function redactSecrets(text: string, apiKey?: string): string {
  let result = text.replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]");
  result = result.replace(/\bsk-[A-Za-z0-9._-]{4,}/g, "[redacted-key]");
  if (apiKey !== undefined && apiKey !== "") {
    result = result.split(apiKey).join("[redacted-key]");
  }
  return result;
}
