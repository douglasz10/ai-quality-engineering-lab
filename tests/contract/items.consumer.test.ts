import { describe, it } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PactV3, MatchersV3 } from "@pact-foundation/pact";
import { createItem, getItem } from "./consumer.client.ts";
import { CONSUMER_NAME, PROVIDER_NAME } from "./pact.config.ts";

/**
 * Story 1.5 consumer contract: drives the minimal consumer against the
 * Pact mock server and writes the version-controlled contract to
 * specs/contracts/. Two interactions: GET /items/:id and POST /items.
 * The generated id uses a flexible matcher; name stays meaningful and
 * quantity keeps the agreed scenario expectation.
 */

const { like } = MatchersV3;

const contractsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "specs",
  "contracts",
);

describe("consumer contract (qa-lab-api)", () => {
  it("GET /items/:id returns the expected item shape", async () => {
    const provider = new PactV3({
      consumer: CONSUMER_NAME,
      provider: PROVIDER_NAME,
      dir: contractsDir,
    });
    provider
      .given("an item exists")
      .uponReceiving("a request for an item by id")
      .withRequest({ method: "GET", path: "/items/item-0001" })
      .willRespondWith({
        status: 200,
        headers: { "content-type": "application/json" },
        body: {
          id: like("item-0001"),
          name: like("Notebook"),
          quantity: like(2),
        },
      });
    await provider.executeTest(async (mockServer) => {
      const item = await getItem(mockServer.url, "item-0001");
      assert.equal(item.name, "Notebook");
      assert.equal(item.quantity, 2);
      assert.match(item.id, /^item-/);
    });
  });

  it("POST /items creates an item with the expected shape", async () => {
    const provider = new PactV3({
      consumer: CONSUMER_NAME,
      provider: PROVIDER_NAME,
      dir: contractsDir,
    });
    provider
      .given("a valid create payload")
      .uponReceiving("a request to create an item")
      .withRequest({
        method: "POST",
        path: "/items",
        headers: { "content-type": "application/json" },
        body: { name: "Notebook", quantity: 2 },
      })
      .willRespondWith({
        status: 201,
        headers: { "content-type": "application/json" },
        body: {
          id: like("item-0002"),
          name: like("Notebook"),
          quantity: like(2),
        },
      });
    await provider.executeTest(async (mockServer) => {
      const item = await createItem(mockServer.url, { name: "Notebook", quantity: 2 });
      assert.equal(item.name, "Notebook");
      assert.equal(item.quantity, 2);
      assert.match(item.id, /^item-/);
    });
  });
});
