import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../apps/qa-lab-api/src/app.ts";
import { assertValid } from "./openapi.ts";

/**
 * Story 1.3 — REST API behavior for the local QA Lab API.
 *
 * Technique coverage: Equivalence Partitioning (valid 1..100, below-1,
 * above-100, wrong types, missing data, non-object bodies), Boundary Value
 * Analysis (0/1/100/101), a small Decision Table for required-field
 * combinations, and negative testing (malformed JSON, unknown ids/routes).
 */

interface ItemBody {
  readonly id: string;
  readonly name: string;
  readonly quantity: number;
}

interface ErrorBody {
  readonly error: string;
  readonly message: string;
}

let app: FastifyInstance | undefined;

beforeEach(async () => {
  await app?.close();
  app = buildApp();
  await app.ready();
});

function activeApp(): FastifyInstance {
  if (app === undefined) {
    throw new Error("Fastify app is not initialized.");
  }
  return app;
}

async function postItem(payload: unknown, raw = false): Promise<{ status: number; body: unknown }> {
  const response = await activeApp().inject({
    method: "POST",
    url: "/items",
    payload: raw ? (payload as string) : (payload as Record<string, unknown>),
    headers: { "content-type": "application/json" },
  });
  return { status: response.statusCode, body: response.json() };
}

describe("health and empty state", () => {
  it("GET /health returns ok", async () => {
    const response = await activeApp().inject({ method: "GET", url: "/health" });
    assert.equal(response.statusCode, 200);
    assertValid("Health", response.json(), "GET /health -> 200");
    assert.deepEqual(response.json(), { status: "ok" });
  });

  it("GET /items starts empty", async () => {
    const response = await activeApp().inject({ method: "GET", url: "/items" });
    assert.equal(response.statusCode, 200);
    assertValid("ItemList", response.json(), "GET /items -> 200");
    assert.deepEqual(response.json(), { items: [] });
  });
});

describe("lifecycle observation (create, read, list)", () => {
  it("POST valid item then read it back via id and list", async () => {
    const created = await postItem({ name: "Notebook", quantity: 2 });
    assert.equal(created.status, 201);
    assertValid("Item", created.body, "POST /items -> 201");
    const item = created.body as ItemBody;
    assert.match(item.id, /^item-\d{4}$/);
    assert.equal(item.name, "Notebook");
    assert.equal(item.quantity, 2);

    const fetched = await activeApp().inject({ method: "GET", url: `/items/${item.id}` });
    assert.equal(fetched.statusCode, 200);
    assertValid("Item", fetched.json(), `GET /items/${item.id} -> 200`);
    assert.deepEqual(fetched.json(), item);

    const listed = await activeApp().inject({ method: "GET", url: "/items" });
    assert.equal(listed.statusCode, 200);
    assertValid("ItemList", listed.json(), "GET /items -> 200");
    assert.deepEqual(listed.json(), { items: [item] });
  });
});

describe("boundary values (quantity 0/1/100/101)", () => {
  it("quantity 0 is rejected", async () => {
    const { status, body } = await postItem({ name: "Zero", quantity: 0 });
    assert.equal(status, 400);
    assertValid("ValidationError", body, "POST /items qty=0 -> 400");
    assert.equal((body as ErrorBody).error, "VALIDATION_ERROR");
  });

  it("quantity 1 is accepted", async () => {
    const { status, body } = await postItem({ name: "Min", quantity: 1 });
    assert.equal(status, 201);
    assertValid("Item", body, "POST /items qty=1 -> 201");
    assert.equal((body as ItemBody).quantity, 1);
  });

  it("quantity 100 is accepted", async () => {
    const { status, body } = await postItem({ name: "Max", quantity: 100 });
    assert.equal(status, 201);
    assertValid("Item", body, "POST /items qty=100 -> 201");
    assert.equal((body as ItemBody).quantity, 100);
  });

  it("quantity 101 is rejected", async () => {
    const { status, body } = await postItem({ name: "Over", quantity: 101 });
    assert.equal(status, 400);
    assertValid("ValidationError", body, "POST /items qty=101 -> 400");
    assert.equal((body as ErrorBody).error, "VALIDATION_ERROR");
  });
});

describe("decision table (required fields and validity)", () => {
  it("valid name + valid quantity", async () => {
    const { status, body } = await postItem({ name: "Notebook", quantity: 2 });
    assert.equal(status, 201);
    assertValid("Item", body, "POST /items [valid/valid] -> 201");
  });

  it("missing name + valid quantity", async () => {
    const { status, body } = await postItem({ quantity: 2 });
    assert.equal(status, 400);
    assertValid("ValidationError", body, "POST /items [missing/valid] -> 400");
    assert.equal((body as ErrorBody).error, "VALIDATION_ERROR");
  });

  it("valid name + missing quantity", async () => {
    const { status, body } = await postItem({ name: "Notebook" });
    assert.equal(status, 400);
    assertValid("ValidationError", body, "POST /items [valid/missing] -> 400");
    assert.equal((body as ErrorBody).error, "VALIDATION_ERROR");
  });

  it("invalid name + valid quantity", async () => {
    const { status, body } = await postItem({ name: "", quantity: 2 });
    assert.equal(status, 400);
    assertValid("ValidationError", body, "POST /items [invalid/valid] -> 400");
    assert.equal((body as ErrorBody).error, "VALIDATION_ERROR");
  });

  it("valid name + invalid quantity", async () => {
    const { status, body } = await postItem({ name: "Notebook", quantity: 0 });
    assert.equal(status, 400);
    assertValid("ValidationError", body, "POST /items [valid/invalid] -> 400");
    assert.equal((body as ErrorBody).error, "VALIDATION_ERROR");
  });

  it("combined-invalid: missing name + quantity 101", async () => {
    const { status, body } = await postItem({ quantity: 101 });
    assert.equal(status, 400);
    assertValid("ValidationError", body, "POST /items [combined-invalid] -> 400");
    assert.equal((body as ErrorBody).error, "VALIDATION_ERROR");
  });
});

describe("negative robustness", () => {
  it("rejects wrong types", async () => {
    const payloads: unknown[] = [
      { name: "Bad", quantity: "two" },
      { name: "Bad", quantity: 2.5 },
      { name: "Bad", quantity: null },
      { name: 123, quantity: 2 },
    ];
    for (const payload of payloads) {
      const { status, body } = await postItem(payload);
      assert.equal(status, 400);
      assertValid("ValidationError", body, `POST /items ${JSON.stringify(payload)} -> 400`);
      assert.equal((body as ErrorBody).error, "VALIDATION_ERROR");
    }
  });

  it("rejects non-object bodies", async () => {
    const payloads: unknown[] = [[], "x", null];
    for (const payload of payloads) {
      const { status, body } = await postItem(payload);
      assert.equal(status, 400);
      assertValid("ValidationError", body, `POST /items ${JSON.stringify(payload)} -> 400`);
    }
  });

  it("rejects malformed JSON without crashing", async () => {
    const { status, body } = await postItem("not-json{{{", true);
    assert.equal(status, 400);
    assertValid("ValidationError", body, "POST /items malformed -> 400");
    const health = await activeApp().inject({ method: "GET", url: "/health" });
    assert.equal(health.statusCode, 200);
  });

  it("returns NOT_FOUND for unknown ids and routes", async () => {
    const missing = await activeApp().inject({ method: "GET", url: "/items/item-9999" });
    assert.equal(missing.statusCode, 404);
    assertValid("NotFound", missing.json(), "GET /items/item-9999 -> 404");
    const missingBody: ErrorBody = missing.json();
    assert.equal(missingBody.error, "NOT_FOUND");

    const route = await activeApp().inject({ method: "GET", url: "/nope" });
    assert.equal(route.statusCode, 404);
    assertValid("NotFound", route.json(), "GET /nope -> 404");
  });
});
