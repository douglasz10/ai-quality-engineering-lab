import { DeterministicAssistantProvider } from "../provider.ts";
import type { AssistantProvider } from "../provider.ts";
import type { AssistantProviderMode } from "../types.ts";
import { loadLiveConfig } from "./live-config.ts";
import { LiveHttpAssistantProvider } from "./live-http.provider.ts";

/**
 * Story 2.6: minimal provider selection for the Assistant subject.
 * No registry, no dependency-injection framework, no capability detection.
 * "deterministic" is the default and needs no configuration; "live" is
 * opt-in and reports `unavailable` problems when configuration is missing.
 */
export type AssistantProviderResolution =
  | { readonly ok: true; readonly provider: AssistantProvider }
  | { readonly ok: false; readonly problems: readonly string[] };

export function createAssistantProvider(mode: AssistantProviderMode): AssistantProviderResolution {
  if (mode === "deterministic") {
    return { ok: true, provider: new DeterministicAssistantProvider() };
  }
  const resolution = loadLiveConfig();
  if (!resolution.ok) {
    return { ok: false, problems: resolution.problems };
  }
  return { ok: true, provider: new LiveHttpAssistantProvider(resolution.config) };
}

export {
  describeLiveConfig,
  liveConfigDefaults,
  liveConfigEnv,
  loadLiveConfig,
  liveProviderName,
  redactSecrets,
} from "./live-config.ts";
export type { LiveConfig, LiveConfigResolution } from "./live-config.ts";
export {
  buildUserMessage,
  LiveHttpAssistantProvider,
  LiveProviderError,
  liveResponseReference,
} from "./live-http.provider.ts";
