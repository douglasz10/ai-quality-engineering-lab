import { randomUUID } from "node:crypto";
import { DeterministicAssistantProvider, toResult } from "./provider.ts";
import type { AssistantContext, AssistantResult } from "./types.ts";

const defaultProvider = new DeterministicAssistantProvider();

/**
 * Run the Assistant for one input + controlled context. Stateless: each
 * call builds a fresh result from the given context only — no conversation
 * history or hidden mutable state carries between runs. Async to preserve
 * the provider-neutral interface a future live mode will use.
 */
export function runAssistant(
  input: string,
  context: AssistantContext,
  runId: string = randomUUID(),
): Promise<AssistantResult> {
  const startedAtMs = Date.now();
  return Promise.resolve(toResult(input, context, defaultProvider, startedAtMs, runId));
}

export { getControlledContext, getFixtureInputs } from "./provider.ts";
export type {
  AssistantContext,
  AssistantInput,
  AssistantMetadata,
  AssistantResult,
} from "./types.ts";
