import type { AssistantContext, LiveFailureCategory, LiveProviderMetadata } from "../types.ts";
import type { AssistantProvider, AssistantProviderResponse } from "../provider.ts";
import { describeLiveConfig, redactSecrets } from "./live-config.ts";
import type { LiveConfig } from "./live-config.ts";

/**
 * Story 2.6: the single OpenAI-compatible live adapter (native fetch, no SDK).
 * This is the only file aware of the provider HTTP request/response shape;
 * everything else sees the provider-neutral AssistantProvider boundary.
 *
 * Deliberately absent: retries, streaming, tools, conversation history,
 * parallel calls, token/cost accounting, capability detection.
 */

/** A live attempt was made and failed. `unavailable` is never represented here. */
export class LiveProviderError extends Error {
  readonly category: LiveFailureCategory;

  constructor(category: LiveFailureCategory, message: string, apiKey?: string) {
    super(redactSecrets(message, apiKey));
    this.name = "LiveProviderError";
    this.category = category;
  }
}

/** Compatibility reference for live responses (not a deterministic fixture). */
export const liveResponseReference = "live-response";

interface ChatCompletionMessage {
  readonly role: string;
  readonly content: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Read choices[0].message.content without ever trusting the payload shape. */
function readContent(body: unknown): string | undefined {
  if (!isRecord(body)) {
    return undefined;
  }
  const choices = body["choices"];
  if (!Array.isArray(choices) || choices.length === 0) {
    return undefined;
  }
  const first: unknown = choices[0];
  if (!isRecord(first)) {
    return undefined;
  }
  const message = first["message"];
  if (!isRecord(message)) {
    return undefined;
  }
  const content = message["content"];
  if (typeof content !== "string") {
    return undefined;
  }
  const trimmed = content.trim();
  return trimmed === "" ? undefined : trimmed;
}

/** Deterministic user message built from the controlled documents + input. */
export function buildUserMessage(input: string, context: AssistantContext): string {
  const documents = context.documents ?? [];
  if (documents.length === 0) {
    return `Question: ${input}`;
  }
  const rendered = documents.map((document) => `- ${document}`).join("\n");
  return `Context documents:\n${rendered}\n\nQuestion: ${input}`;
}

/** 401/403 -> authentication, 404 -> configuration, other non-2xx -> provider. */
function failureCategory(status: number): LiveFailureCategory {
  if (status === 401 || status === 403) {
    return "authentication";
  }
  if (status === 404) {
    return "configuration";
  }
  return "provider";
}

export class LiveHttpAssistantProvider implements AssistantProvider {
  readonly mode = "live" as const;
  readonly description: LiveProviderMetadata;
  private readonly config: LiveConfig;

  constructor(config: LiveConfig) {
    this.config = config;
    this.description = describeLiveConfig(config);
  }

  async respond(input: string, context: AssistantContext): Promise<AssistantProviderResponse> {
    // The adapter never invents a system prompt: scenario system instructions
    // are forwarded only when they were explicitly supplied.
    const messages: ChatCompletionMessage[] = [];
    if (context.systemInstructions !== undefined) {
      messages.push({ role: "system", content: context.systemInstructions });
    }
    messages.push({ role: "user", content: buildUserMessage(input, context) });

    const body = {
      model: this.config.model,
      temperature: this.config.temperature,
      ...(this.config.maxOutputTokens === undefined
        ? {}
        : { max_tokens: this.config.maxOutputTokens }),
      messages,
    };

    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, this.config.timeoutMs);

    let response: Response;
    try {
      response = await fetch(`${this.config.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted) {
        throw new LiveProviderError(
          "provider",
          `Live provider request timed out after ${this.config.timeoutMs.toString()} ms`,
        );
      }
      const reason = error instanceof Error ? error.name : "unknown error";
      throw new LiveProviderError(
        "provider",
        `Live provider request failed (${reason})`,
        this.config.apiKey,
      );
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      throw new LiveProviderError(
        failureCategory(response.status),
        `Live provider returned HTTP ${response.status.toString()}`,
      );
    }

    let parsed: unknown;
    try {
      parsed = await response.json();
    } catch {
      throw new LiveProviderError(
        "response",
        "Live provider returned a body that is not valid JSON",
      );
    }

    const content = readContent(parsed);
    if (content === undefined) {
      throw new LiveProviderError("response", "Live provider returned no usable assistant content");
    }

    return { response: content, fixtureId: liveResponseReference };
  }
}
