import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getValidator, getSchemaNames, assertValid } from "./openapi.ts";

/**
 * Story 1.3 — OpenAPI/schema validation against the authoritative
 * specs/openapi/qa-lab-api.yaml. Compiles one Ajv validator per response
 * schema, asserts representative valid bodies pass, and proves deliberately
 * incompatible fixtures fail deterministically with actionable output.
 */

describe("openapi schema compilation", () => {
  it("loads and compiles every response schema", () => {
    assert.deepEqual(getSchemaNames(), [
      "Health",
      "ItemList",
      "Item",
      "ValidationError",
      "NotFound",
    ]);
    for (const name of getSchemaNames()) {
      assert.equal(typeof getValidator(name), "function");
    }
  });

  it("accepts representative valid bodies", () => {
    assertValid("Health", { status: "ok" }, "fixture Health");
    assertValid("ItemList", { items: [] }, "fixture ItemList");
    assertValid("Item", { id: "item-0001", name: "Notebook", quantity: 2 }, "fixture Item");
    assertValid(
      "ValidationError",
      { error: "VALIDATION_ERROR", message: "Field 'quantity' must be between 1 and 100." },
      "fixture ValidationError",
    );
    assertValid(
      "NotFound",
      { error: "NOT_FOUND", message: "Item 'item-9999' was not found." },
      "fixture NotFound",
    );
  });
});

describe("deliberately incompatible fixtures", () => {
  it("rejects a missing required field", () => {
    const validate = getValidator("Item");
    assert.equal(validate({ id: "item-0001", name: "Notebook" }), false);
    const keywords = (validate.errors ?? []).map((e) => e.keyword);
    assert.ok(keywords.includes("required"));
  });

  it("rejects an incorrect type", () => {
    const validate = getValidator("Item");
    assert.equal(validate({ id: "item-0001", name: "Notebook", quantity: "two" }), false);
    const keywords = (validate.errors ?? []).map((e) => e.keyword);
    assert.ok(keywords.includes("type"));
  });

  it("rejects an out-of-range boundary value", () => {
    const validate = getValidator("Item");
    assert.equal(validate({ id: "item-0001", name: "Notebook", quantity: 101 }), false);
    const keywords = (validate.errors ?? []).map((e) => e.keyword);
    assert.ok(keywords.includes("maximum"));
  });

  it("rejects a wrong error shape", () => {
    const validate = getValidator("NotFound");
    assert.equal(validate({ error: "NOT_FOUND" }), false);
    const keywords = (validate.errors ?? []).map((e) => e.keyword);
    assert.ok(keywords.includes("required"));
  });
});
