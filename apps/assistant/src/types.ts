/**
 * Provider-neutral contracts for the Assistant subject (Story 2.1).
 * Focused on observable execution data needed by future evaluation.
 * No provider-specific model/token/cost metadata is exposed here.
 */

/** Controlled context available to the Assistant for one run. */
export interface AssistantContext {
  readonly documents?: readonly string[];
  readonly systemInstructions?: string;
}

/** Defined input for one Assistant run. */
export interface AssistantInput {
  readonly input: string;
  readonly context: AssistantContext;
}

/** Execution mode. V1 supports deterministic only; live arrives later. */
export type AssistantProviderMode = "deterministic";

/** Minimal execution metadata (no provider-specific details). */
export interface AssistantMetadata {
  readonly runId: string;
  readonly durationMs: number;
  readonly fixtureId: string;
}

/** Observable provider-neutral result for later evaluation and diagnosis. */
export interface AssistantResult {
  readonly input: string;
  readonly context: AssistantContext;
  readonly providerMode: AssistantProviderMode;
  readonly response: string;
  readonly metadata: AssistantMetadata;
}
