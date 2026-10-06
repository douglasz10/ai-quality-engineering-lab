import { randomUUID } from "node:crypto";
import { DeterministicAssistantProvider, toResult } from "./provider.ts";
import type { AssistantProvider } from "./provider.ts";
import type { AssistantContext, AssistantResult } from "./types.ts";

const defaultProvider = new DeterministicAssistantProvider();

/** Optional execution overrides; the default path stays deterministic. */
export interface AssistantRunOptions {
  /** Injected provider. Defaults to the deterministic provider. */
  readonly provider?: AssistantProvider;
  readonly runId?: string;
}

/**
 * Run the Assistant for one input + controlled context. Stateless: each
 * call builds a fresh result from the given context only - no conversation
 * history or hidden mutable state carries between runs. Async to preserve
 * the provider-neutral interface the live mode uses (Story 2.6).
 */
export function runAssistant(
  input: string,
  context: AssistantContext,
  options: AssistantRunOptions = {},
): Promise<AssistantResult> {
  const startedAtMs = Date.now();
  const provider = options.provider ?? defaultProvider;
  const runId = options.runId ?? randomUUID();
  return toResult(input, context, provider, startedAtMs, runId);
}

export { getControlledContext, getFixtureInputs } from "./provider.ts";
export type { AssistantProvider, AssistantProviderResponse } from "./provider.ts";
export type {
  AssistantContext,
  AssistantInput,
  AssistantMetadata,
  AssistantProviderMode,
  AssistantResult,
  LiveFailureCategory,
  LiveProviderMetadata,
} from "./types.ts";
