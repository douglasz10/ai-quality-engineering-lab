/**
 * Provider verification for Story 1.5.
 *
 * Starts the real QA Lab API in-process on an ephemeral port and verifies
 * the committed consumer contract with no broker. State is seeded through
 * the public HTTP API only: the Pact core calls a verification-local
 * `/pact-setup` endpoint (providerStatesSetupUrl), which POSTs to the real
 * app. The API's internal store is never imported or manipulated.
 *
 * Breaking-change demo: with CONTRACT_DEMO_BREAKING=true the responses are
 * transformed (field `name` renamed to `title`) by a verification-local
 * onSend hook. apps/qa-lab-api is never modified; normal runs stay green.
 */
import { Verifier } from "@pact-foundation/pact";
import { fastify, type FastifyInstance } from "fastify";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildApp } from "../../apps/qa-lab-api/src/app.ts";
import { PACT_FILE_NAME, PROVIDER_NAME } from "./pact.config.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const pactFile = path.join(repoRoot, "specs", "contracts", PACT_FILE_NAME);
const breaking = process.env["CONTRACT_DEMO_BREAKING"] === "true";

const app = buildApp();

if (breaking) {
  app.addHook("onSend", async (request, _reply, payload) => {
    const url = request.raw.url ?? "";
    if (!url.startsWith("/items")) {
      return payload;
    }
    let body: unknown = payload;
    if (typeof payload === "string") {
      try {
        body = JSON.parse(payload) as unknown;
      } catch {
        return payload;
      }
    }
    const rename = (value: unknown): unknown => {
      if (Array.isArray(value)) {
        return value.map((entry) => rename(entry));
      }
      if (typeof value === "object" && value !== null && "name" in value) {
        const { name: removed, ...rest } = value as Record<string, unknown>;
        return { ...rest, title: removed };
      }
      return value;
    };
    return JSON.stringify(rename(body));
  });
}

/**
 * Verification-local provider-state endpoint. The Pact core POSTs
 * `{ state: "<name>" }` here before each interaction; seeding uses only the
 * real provider routes, never the API internals.
 */
const setupApp = fastify({ logger: false });
setupApp.post("/pact-setup", async (request, reply) => {
  const { state } = request.body as { state?: string };
  if (state === "an item exists") {
    const created = await fetch(`${providerBaseUrl}/items`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Notebook", quantity: 2 }),
    });
    if (!created.ok) {
      return reply.code(500).send({ error: `seed POST failed: ${created.status.toString()}` });
    }
  }
  return { ok: true };
});

const address = await app.listen({ port: 0, host: "127.0.0.1" });
const providerBaseUrl = address.replace("[::1]", "127.0.0.1");
const setupAddress = await (setupApp as FastifyInstance).listen({ port: 0, host: "127.0.0.1" });
const setupUrl = setupAddress.replace("[::1]", "127.0.0.1");

try {
  const output = await new Verifier({
    provider: PROVIDER_NAME,
    providerBaseUrl,
    pactUrls: [pactFile],
    providerStatesSetupUrl: `${setupUrl}/pact-setup`,
    logLevel: "warn",
  }).verifyProvider();
  process.stdout.write(`${output}\n`);
} finally {
  await app.close();
  await setupApp.close();
}

if (breaking) {
  process.stdout.write("breaking-demo: CONTRACT_DEMO_BREAKING=true was active\n");
}
