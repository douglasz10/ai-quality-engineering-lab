import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import {
  createServer,
  type IncomingHttpHeaders,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  LiveHttpAssistantProvider,
  LiveProviderError,
  loadLiveConfig,
} from "../../apps/assistant/src/providers/index.ts";
import type { LiveConfig } from "../../apps/assistant/src/providers/index.ts";
import type { AssistantContext } from "../../apps/assistant/src/types.ts";

/**
 * Story 2.6 smoke: the OPTIONAL live evaluation path, fully offline.
 *
 * Guarantees enforced by this file:
 * - Every HTTP request goes to a local mock server (127.0.0.1, ephemeral
 *   port). ASSISTANT_LIVE_BASE_URL points at the mock for every CLI run, so
 *   no test can reach OpenRouter or any other external service.
 * - The CLI is spawned as `node --import tsx ...` WITHOUT --env-file, and the
 *   child environment is rebuilt with all ASSISTANT_LIVE_* variables, the
 *   scenario override and NODE_OPTIONS removed first: neither a machine `.env`
 *   nor shell-level live configuration can influence a test.
 * - The API key is a fixed fake value. Failure messages redact it, and every
 *   captured stdout plus both report files are scanned for key material,
 *   Authorization header values and base-URL leakage.
 */

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const reportJsonPath = path.join(repoRoot, "evaluation", "reports", "assistant-live.json");
const reportMdPath = path.join(repoRoot, "evaluation", "reports", "assistant-live.md");

const FAKE_API_KEY = "sk-test-1234567890abcdef";
const MOCK_MODEL = "mock/test-model";
const QUESTION = "What is the current stock level for Lab Notebook?";
const SYSTEM_INSTRUCTIONS = "Answer only using the provided documents. Do not invent stock levels.";
/** Canned mock answer satisfying the anchors of all three committed live scenarios. */
const MOCK_RESPONSE =
  "Lab Notebook has 42 units in stock according to the provided documents. " +
  "The documents contain no information about Lab Beaker stock levels.";

const liveContext: AssistantContext = {
  documents: ["Lab Notebook: 42 units in stock. Reorder threshold is 10 units."],
  systemInstructions: SYSTEM_INSTRUCTIONS,
};

type MockMode = "ok" | "empty" | "unauthorized" | "servererror" | "hang";

interface CapturedRequest {
  readonly method: string;
  readonly url: string;
  readonly headers: IncomingHttpHeaders;
  readonly body: string;
}

interface CliResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

const capturedRequests: CapturedRequest[] = [];
let mockMode: MockMode = "ok";
let mockPort = 0;

function mockBaseUrl(): string {
  return `http://127.0.0.1:${mockPort.toString()}/v1`;
}

function sendJson(response: ServerResponse, status: number, payload: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(payload));
}

function respondAsMocked(request: IncomingMessage, response: ServerResponse): void {
  if (mockMode === "hang") {
    // Never respond: the provider must hit its own timeout.
    return;
  }
  if (mockMode === "unauthorized") {
    // Hostile body echoing the Authorization header: proves it is never read.
    const authHeader = request.headers.authorization;
    const echoedAuth = typeof authHeader === "string" ? authHeader : "none";
    sendJson(response, 401, { error: { message: `rejected: ${echoedAuth}` } });
    return;
  }
  if (mockMode === "servererror") {
    sendJson(response, 500, { error: { message: "mock upstream failure" } });
    return;
  }
  if (mockMode === "empty") {
    sendJson(response, 200, { choices: [] });
    return;
  }
  sendJson(response, 200, {
    choices: [{ message: { role: "assistant", content: MOCK_RESPONSE } }],
  });
}

const mockServer = createServer((request, response) => {
  const chunks: Buffer[] = [];
  request.on("data", (chunk: Buffer) => {
    chunks.push(chunk);
  });
  request.on("end", () => {
    capturedRequests.push({
      method: request.method ?? "",
      url: request.url ?? "",
      headers: request.headers,
      body: Buffer.concat(chunks).toString("utf8"),
    });
    respondAsMocked(request, response);
  });
});

function providerConfig(overrides: Partial<LiveConfig> = {}): LiveConfig {
  return {
    apiKey: FAKE_API_KEY,
    model: MOCK_MODEL,
    baseUrl: mockBaseUrl(),
    temperature: 0,
    maxOutputTokens: 64,
    timeoutMs: 5000,
    ...overrides,
  };
}

async function captureLiveFailure(provider: LiveHttpAssistantProvider): Promise<LiveProviderError> {
  try {
    await provider.respond(QUESTION, liveContext);
  } catch (error) {
    assert.ok(
      error instanceof LiveProviderError,
      `expected LiveProviderError, received: ${String(error)}`,
    );
    return error;
  }
  throw new Error("expected respond() to fail, but it resolved");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value;
}

function asArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`);
  }
  return value;
}

function asString(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new Error(`${label} must be a string`);
  }
  return value;
}

function readLiveReport(): Record<string, unknown> {
  const parsed = JSON.parse(readFileSync(reportJsonPath, "utf8")) as unknown;
  return asRecord(parsed, "assistant-live.json");
}

function readReportFile(label: "JSON" | "Markdown"): string {
  return readFileSync(label === "JSON" ? reportJsonPath : reportMdPath, "utf8");
}

function assertNoSecrets(label: string, text: string): void {
  assert.ok(!text.includes(FAKE_API_KEY), `${label} must not contain the API key value`);
  assert.ok(!text.includes("Bearer"), `${label} must not contain an Authorization header value`);
  assert.ok(!/\bsk-[A-Za-z0-9]/.test(text), `${label} must not contain a key-like token`);
  assert.ok(!text.includes(mockBaseUrl()), `${label} must not contain the live base URL`);
}

function redactForMessage(text: string): string {
  return text.split(FAKE_API_KEY).join("[redacted]");
}

function assertCliSucceeded(result: CliResult): void {
  assert.equal(
    result.status,
    0,
    `live CLI must exit 0\nstdout: ${redactForMessage(result.stdout)}\nstderr: ${redactForMessage(result.stderr)}`,
  );
}

/**
 * Rebuilds the child environment from scratch: machine-level live variables,
 * the scenario override and NODE_OPTIONS (which could inject --env-file) are
 * removed before the test-specific overrides are applied. The spawn itself
 * never passes --env-file, so a local `.env` is never read.
 */
function buildCliEnv(overrides: Record<string, string>): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (
      key.startsWith("ASSISTANT_LIVE_") ||
      key === "AI_EVAL_SCENARIOS_DIR" ||
      key === "NODE_OPTIONS"
    ) {
      continue;
    }
    env[key] = value;
  }
  return { ...env, ...overrides };
}

function runLiveCli(overrides: Record<string, string>): Promise<CliResult> {
  return new Promise<CliResult>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "evaluation/evaluators/run-assistant-live.ts"],
      { cwd: repoRoot, env: buildCliEnv(overrides), stdio: ["ignore", "pipe", "pipe"] },
    );
    const stdoutStream = child.stdout;
    const stderrStream = child.stderr;
    let stdout = "";
    let stderr = "";
    stdoutStream.setEncoding("utf8");
    stderrStream.setEncoding("utf8");
    stdoutStream.on("data", (chunk: string) => {
      stdout += chunk;
    });
    stderrStream.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      reject(error);
    });
    child.on("close", (status) => {
      resolve({ status, stdout, stderr });
    });
  });
}

/** Live scenarios + mock base URL on every CLI run: traffic can only reach the mock. */
function liveCliEnv(extra: Record<string, string> = {}): Record<string, string> {
  return {
    AI_EVAL_SCENARIOS_DIR: "evaluation/scenarios/assistant-live",
    ASSISTANT_LIVE_BASE_URL: mockBaseUrl(),
    ...extra,
  };
}

describe("Story 2.6 live evaluation smoke (offline, local mock only)", () => {
  before(async () => {
    await new Promise<void>((resolve, reject) => {
      mockServer.once("error", reject);
      mockServer.listen(0, "127.0.0.1", () => {
        resolve();
      });
    });
    const address: string | AddressInfo | null = mockServer.address();
    if (address === null || typeof address === "string") {
      throw new Error("mock server must listen on an ephemeral TCP port");
    }
    mockPort = address.port;
  });

  after(async () => {
    mockServer.closeAllConnections();
    await new Promise<void>((resolve) => {
      mockServer.close(() => {
        resolve();
      });
    });
  });

  beforeEach(() => {
    mockMode = "ok";
  });

  it("loadLiveConfig({}) reports missing configuration with variable names only", () => {
    const resolution = loadLiveConfig({});
    if (resolution.ok) {
      throw new Error("expected unavailable for an empty environment");
    }
    assert.ok(
      resolution.problems.some((problem) => problem.includes("ASSISTANT_LIVE_API_KEY")),
      "problems must name ASSISTANT_LIVE_API_KEY",
    );
    assert.ok(
      resolution.problems.some((problem) => problem.includes("ASSISTANT_LIVE_MODEL")),
      "problems must name ASSISTANT_LIVE_MODEL",
    );
    for (const problem of resolution.problems) {
      assert.match(problem, /^ASSISTANT_LIVE_[A-Z_]+ /, "problems must start with a variable name");
      assert.ok(!problem.includes("="), "problems must never carry values");
    }
  });

  it("loadLiveConfig reports a missing model without echoing the api key value", () => {
    const resolution = loadLiveConfig({ ASSISTANT_LIVE_API_KEY: FAKE_API_KEY });
    if (resolution.ok) {
      throw new Error("expected unavailable without ASSISTANT_LIVE_MODEL");
    }
    const joined = resolution.problems.join(" | ");
    assert.ok(joined.includes("ASSISTANT_LIVE_MODEL"), "problems must name ASSISTANT_LIVE_MODEL");
    assert.ok(!joined.includes(FAKE_API_KEY), "problems must never echo a configured value");
    assert.ok(
      !resolution.problems.some((problem) => problem.includes("ASSISTANT_LIVE_API_KEY")),
      "a provided variable must not be reported as missing",
    );
  });

  it("loadLiveConfig reports invalid temperature and timeout without echoing values", () => {
    const resolution = loadLiveConfig({
      ASSISTANT_LIVE_API_KEY: FAKE_API_KEY,
      ASSISTANT_LIVE_MODEL: MOCK_MODEL,
      ASSISTANT_LIVE_TEMPERATURE: "warm",
      ASSISTANT_LIVE_TIMEOUT_MS: "abc",
    });
    if (resolution.ok) {
      throw new Error("expected unavailable with invalid numeric values");
    }
    const joined = resolution.problems.join(" | ");
    assert.ok(
      joined.includes("ASSISTANT_LIVE_TEMPERATURE"),
      "problems must name the temperature variable",
    );
    assert.ok(
      joined.includes("ASSISTANT_LIVE_TIMEOUT_MS"),
      "problems must name the timeout variable",
    );
    assert.ok(!joined.includes("warm"), "problems must never echo an invalid value");
    assert.ok(!joined.includes("abc"), "problems must never echo an invalid value");
  });

  it("provider returns the usable content of a valid 200 response", async () => {
    const provider = new LiveHttpAssistantProvider(providerConfig());
    const result = await provider.respond(QUESTION, liveContext);
    assert.equal(result.response, MOCK_RESPONSE);
    assert.equal(result.fixtureId, "live-response");
  });

  it("provider sends the documented request shape to POST /v1/chat/completions", async () => {
    const beforeCount = capturedRequests.length;
    const provider = new LiveHttpAssistantProvider(providerConfig());
    await provider.respond(QUESTION, liveContext);
    const request = capturedRequests[beforeCount];
    if (request === undefined) {
      throw new Error("mock server observed no request");
    }
    assert.equal(request.method, "POST");
    assert.equal(request.url, "/v1/chat/completions");
    assert.equal(
      request.headers["host"],
      `127.0.0.1:${mockPort.toString()}`,
      "request must target the local mock",
    );
    assert.equal(request.headers["authorization"], `Bearer ${FAKE_API_KEY}`);
    const contentType = request.headers["content-type"];
    assert.ok(typeof contentType === "string" && contentType.includes("application/json"));
    const body = asRecord(JSON.parse(request.body) as unknown, "request body");
    assert.equal(body["model"], MOCK_MODEL);
    assert.equal(body["temperature"], 0);
    assert.equal(body["max_tokens"], 64);
    const messages = asArray(body["messages"], "messages");
    assert.equal(messages.length, 2);
    const systemMessage = asRecord(messages[0], "system message");
    assert.equal(systemMessage["role"], "system");
    assert.equal(systemMessage["content"], SYSTEM_INSTRUCTIONS);
    const userMessage = asRecord(messages[1], "user message");
    assert.equal(userMessage["role"], "user");
    const userContent = asString(userMessage["content"], "user message content");
    assert.ok(userContent.includes(QUESTION), "user message must contain the input");
    assert.ok(
      userContent.includes("Lab Notebook: 42 units in stock."),
      "user message must contain documents",
    );
  });

  it("provider never sends seed, stream, or tools", async () => {
    const beforeCount = capturedRequests.length;
    const provider = new LiveHttpAssistantProvider(providerConfig());
    await provider.respond(QUESTION, liveContext);
    const request = capturedRequests[beforeCount];
    if (request === undefined) {
      throw new Error("mock server observed no request");
    }
    const body = asRecord(JSON.parse(request.body) as unknown, "request body");
    assert.ok(!("seed" in body), "seed must not be sent");
    assert.ok(!("stream" in body), "stream must not be sent");
    assert.ok(!("tools" in body), "tools must not be sent");
  });

  it("provider classifies a 200 response without usable content", async () => {
    mockMode = "empty";
    const provider = new LiveHttpAssistantProvider(providerConfig());
    const error = await captureLiveFailure(provider);
    assert.equal(error.category, "response");
    assert.match(error.message, /no usable assistant content/);
  });

  it("provider classifies HTTP 401 as authentication without reading the error body", async () => {
    mockMode = "unauthorized";
    const provider = new LiveHttpAssistantProvider(providerConfig());
    const error = await captureLiveFailure(provider);
    assert.equal(error.category, "authentication");
    assert.equal(error.message, "Live provider returned HTTP 401");
    assert.ok(!error.message.includes(FAKE_API_KEY), "error message must not contain the api key");
    assert.ok(
      !error.message.includes("Bearer"),
      "error message must not contain the Authorization header",
    );
  });

  it("provider classifies HTTP 500 as a provider failure", async () => {
    mockMode = "servererror";
    const provider = new LiveHttpAssistantProvider(providerConfig());
    const error = await captureLiveFailure(provider);
    assert.equal(error.category, "provider");
    assert.ok(error.message.includes("HTTP 500"), `unexpected message: ${error.message}`);
  });

  it("provider times out when the local mock never responds", { timeout: 30000 }, async () => {
    mockMode = "hang";
    const provider = new LiveHttpAssistantProvider(providerConfig({ timeoutMs: 100 }));
    const error = await captureLiveFailure(provider);
    assert.equal(error.category, "provider");
    assert.match(error.message, /timed out after 100 ms/);
  });

  it("live CLI runs the three scenarios against the local mock without leaking secrets", async () => {
    const beforeCount = capturedRequests.length;
    const result = await runLiveCli(
      liveCliEnv({
        ASSISTANT_LIVE_API_KEY: FAKE_API_KEY,
        ASSISTANT_LIVE_MODEL: MOCK_MODEL,
        ASSISTANT_LIVE_MAX_OUTPUT_TOKENS: "64",
        ASSISTANT_LIVE_TIMEOUT_MS: "10000",
      }),
    );
    assertCliSucceeded(result);

    const newRequests = capturedRequests.slice(beforeCount);
    assert.equal(newRequests.length, 3, "exactly one provider call per live scenario");
    for (const request of newRequests) {
      assert.equal(
        request.headers["host"],
        `127.0.0.1:${mockPort.toString()}`,
        "every call must target the local mock",
      );
      assert.equal(request.url, "/v1/chat/completions");
    }

    const report = readLiveReport();
    assert.equal(report["status"], "passed");
    assert.equal(report["mode"], "live");
    assert.equal(asArray(report["scenarios"], "scenarios").length, 3);

    assertNoSecrets("stdout", result.stdout);
    assertNoSecrets("JSON report", readReportFile("JSON"));
    assertNoSecrets("Markdown report", readReportFile("Markdown"));
  });

  it("live CLI lists only variable names in unavailable reasons", async () => {
    const beforeCount = capturedRequests.length;
    // The key value IS present: it must never appear in reasons or reports.
    const result = await runLiveCli(liveCliEnv({ ASSISTANT_LIVE_API_KEY: FAKE_API_KEY }));
    assertCliSucceeded(result);
    assert.equal(
      capturedRequests.length,
      beforeCount,
      "no provider call may happen without configuration",
    );

    const report = readLiveReport();
    assert.equal(report["status"], "unavailable");
    const reasons = asArray(report["unavailableReasons"], "unavailableReasons").map(
      (reason, index) => asString(reason, `unavailableReasons[${index.toString()}]`),
    );
    assert.equal(reasons.length, 1, "only the missing model must be reported");
    assert.ok(
      reasons[0]?.includes("ASSISTANT_LIVE_MODEL"),
      "reason must name ASSISTANT_LIVE_MODEL",
    );
    for (const reason of reasons) {
      assert.match(reason, /^ASSISTANT_LIVE_[A-Z_]+ /, "reasons must start with a variable name");
      assert.ok(!reason.includes(FAKE_API_KEY), "reasons must never echo a configured value");
      assert.ok(!reason.includes("="), "reasons must never carry values");
    }
    assert.ok(
      !reasons.some((reason) => reason.includes("ASSISTANT_LIVE_API_KEY")),
      "a provided variable must not be reported as missing",
    );

    assertNoSecrets("stdout", result.stdout);
    assertNoSecrets("JSON report", readReportFile("JSON"));
    assertNoSecrets("Markdown report", readReportFile("Markdown"));
  });

  it("live CLI exits 0 with status unavailable when no live configuration exists", async () => {
    const beforeCount = capturedRequests.length;
    // Only scenarios + base URL: no key, no model. This run also restores the
    // canonical unavailable report state for the next local invocation.
    const result = await runLiveCli(liveCliEnv());
    assertCliSucceeded(result);
    assert.equal(
      capturedRequests.length,
      beforeCount,
      "no provider call may happen without configuration",
    );
    assert.ok(result.stdout.includes("UNAVAILABLE"), "stdout must report the unavailable status");

    const report = readLiveReport();
    assert.equal(report["status"], "unavailable");
    assert.equal(
      asArray(report["scenarios"], "scenarios").length,
      0,
      "no scenario may be executed",
    );
    const reasons = asArray(report["unavailableReasons"], "unavailableReasons").map(
      (reason, index) => asString(reason, `unavailableReasons[${index.toString()}]`),
    );
    assert.equal(reasons.length, 2, "both required variables must be reported");
    assert.ok(reasons.some((reason) => reason.includes("ASSISTANT_LIVE_API_KEY")));
    assert.ok(reasons.some((reason) => reason.includes("ASSISTANT_LIVE_MODEL")));
    for (const reason of reasons) {
      assert.match(reason, /^ASSISTANT_LIVE_[A-Z_]+ /, "reasons must start with a variable name");
      assert.ok(!reason.includes("="), "reasons must never carry values");
    }

    assertNoSecrets("stdout", result.stdout);
    assertNoSecrets("JSON report", readReportFile("JSON"));
    assertNoSecrets("Markdown report", readReportFile("Markdown"));
  });
});
