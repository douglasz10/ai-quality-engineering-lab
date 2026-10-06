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

/** Execution mode. Deterministic is the default; live is opt-in (Story 2.6). */
export type AssistantProviderMode = "deterministic" | "live";

/**
 * Story 2.6: non-sensitive live execution metadata.
 * Never contains credentials, auth headers, token counts, or cost.
 */
export interface LiveProviderMetadata {
  readonly provider: string;
  readonly model: string;
  readonly temperature: number;
  readonly maxOutputTokens?: number;
}

/**
 * Story 2.6: provider-neutral classification of a live attempt that was made.
 * "unavailable" is deliberately absent: it means required configuration was
 * missing, so no provider call could be attempted at all.
 */
export type LiveFailureCategory = "authentication" | "configuration" | "provider" | "response";

/** Minimal execution metadata (no provider-specific details). */
export interface AssistantMetadata {
  readonly runId: string;
  readonly durationMs: number;
  readonly fixtureId: string;
  /** Present only for live execution (Story 2.6). */
  readonly live?: LiveProviderMetadata;
}

/** Observable provider-neutral result for later evaluation and diagnosis. */
export interface AssistantResult {
  readonly input: string;
  readonly context: AssistantContext;
  readonly providerMode: AssistantProviderMode;
  readonly response: string;
  readonly metadata: AssistantMetadata;
}
