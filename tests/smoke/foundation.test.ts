import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { FOUNDATION_WORKSPACE } from "../../packages/foundation/index.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

describe("monorepo foundation smoke (Story 1.1)", () => {
  it("runs on Node.js 24 LTS", () => {
    const major = process.versions.node.split(".")[0];
    assert.equal(major, "24");
  });

  it("resolves the npm workspaces wiring", () => {
    assert.equal(FOUNDATION_WORKSPACE, "foundation");
  });

  it("declares the minimal foundation files", () => {
    const required = [
      "package.json",
      "package-lock.json",
      "tsconfig.json",
      "eslint.config.js",
      ".prettierrc.json",
      ".prettierignore",
      ".nvmrc",
      ".env.example",
      "README.md",
      "docs/runbook.md",
      "tests/smoke/foundation.test.ts",
      "packages/foundation/package.json",
      "packages/foundation/index.ts",
    ];
    for (const relative of required) {
      assert.equal(
        existsSync(path.join(repoRoot, relative)),
        true,
        `missing required foundation file: ${relative}`,
      );
    }
  });
});
