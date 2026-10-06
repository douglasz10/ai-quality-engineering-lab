import type {
  AssistantContext,
  AssistantMetadata,
  AssistantProviderMode,
  AssistantResult,
  LiveProviderMetadata,
} from "./types.ts";

/** Provider-neutral response payload. */
export interface AssistantProviderResponse {
  readonly response: string;
  /**
   * Technical source reference. For the deterministic provider this is the
   * matched fixture id; for live execution it is the constant
   * "live-response" (a compatibility reference, NOT a deterministic fixture).
   */
  readonly fixtureId: string;
}

/**
 * Provider-neutral interface. The Assistant depends only on this boundary;
 * no provider-specific SDK, request, or response structures may leak into
 * assistant.ts, evaluation-facing types, or fixture definitions.
 *
 * Story 2.6: respond() is asynchronous so a live HTTP provider can implement
 * the same boundary. `description` is optional non-sensitive execution
 * metadata (provider/model/parameters) and is absent for the deterministic
 * provider.
 */
export interface AssistantProvider {
  readonly mode: AssistantProviderMode;
  readonly description?: LiveProviderMetadata;
  respond(input: string, context: AssistantContext): Promise<AssistantProviderResponse>;
}

/** Deterministic fixture entry: tiny controlled context + canned response. */
interface AssistantFixture {
  readonly fixtureId: string;
  readonly matchInput: string;
  readonly documents: readonly string[];
  readonly systemInstructions: string;
  readonly response: string;
}

const FIXTURES: readonly AssistantFixture[] = [
  {
    fixtureId: "lab-stock-levels",
    matchInput: "What is the current stock level for Lab Notebook?",
    documents: [
      "Lab Notebook: 42 units in stock. Reorder threshold is 10 units.",
      "Lab Pen: 120 units in stock. Reorder threshold is 25 units.",
    ],
    systemInstructions: "Answer only using the provided documents. Do not invent stock levels.",
    response: "The Lab Notebook has 42 units in stock, above the reorder threshold of 10 units.",
  },
  {
    fixtureId: "lab-shipping-policy",
    matchInput: "What is the shipping policy for lab supplies?",
    documents: [
      "Standard shipping for lab supplies takes 3-5 business days.",
      "Express shipping is available on request for urgent orders.",
    ],
    systemInstructions: "Answer only using the provided documents. Do not invent policies.",
    response:
      "Standard shipping takes 3-5 business days; express shipping is available on request.",
  },
];

const FALLBACK_FIXTURE_ID = "unmatched-input";

/**
 * Deterministic provider: selects a canned response by exact input match,
 * otherwise returns a stable acknowledgement. No credentials, no network,
 * no external service. Stateless across runs.
 */
export class DeterministicAssistantProvider implements AssistantProvider {
  readonly mode: AssistantProviderMode = "deterministic";

  respond(input: string, _context: AssistantContext): Promise<AssistantProviderResponse> {
    const fixture = FIXTURES.find((entry) => entry.matchInput === input);
    if (fixture !== undefined) {
      return Promise.resolve({ response: fixture.response, fixtureId: fixture.fixtureId });
    }
    return Promise.resolve({
      response: "I can only answer the documented lab questions with the provided context.",
      fixtureId: FALLBACK_FIXTURE_ID,
    });
  }
}

/** Controlled context available for reviewer inspection and future scenarios. */
export function getControlledContext(): AssistantContext {
  const documents: string[] = [];
  for (const fixture of FIXTURES) {
    documents.push(...fixture.documents);
  }
  return {
    documents,
    systemInstructions:
      "Answer only using the provided documents. Do not invent stock levels or policies.",
  };
}

export function getFixtureInputs(): readonly string[] {
  return FIXTURES.map((fixture) => fixture.matchInput);
}

/** Assemble the observable result envelope from a provider response. */
export async function toResult(
  input: string,
  context: AssistantContext,
  provider: AssistantProvider,
  startedAtMs: number,
  runId: string,
): Promise<AssistantResult> {
  const { response, fixtureId } = await provider.respond(input, context);
  const description = provider.description;
  const metadata: AssistantMetadata = {
    runId,
    durationMs: Math.max(0, Date.now() - startedAtMs),
    fixtureId,
    ...(description === undefined ? {} : { live: description }),
  };
  return { input, context, providerMode: provider.mode, response, metadata };
}
