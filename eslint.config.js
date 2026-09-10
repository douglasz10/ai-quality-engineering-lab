import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "node_modules/**",
      "artifacts/**",
      "test-results/**",
      "playwright-report/**",
      "coverage/**",
      ".agents/**",
      "_bmad/**",
      "_bmad-output/**",
      "**/*.js",
      "**/*.cjs",
      "**/*.mjs",
      "**/*.d.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked.map((block) => ({
    ...block,
    files: ["**/*.ts", "**/*.mts", "**/*.cts"],
  })),
  {
    files: ["**/*.ts", "**/*.mts", "**/*.cts"],
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "separate-type-imports" },
      ],
      "@typescript-eslint/no-explicit-any": "error",
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
  {
    // node:test owns the lifecycle of describe/it promises; awaiting them
    // is neither required nor idiomatic, so the floating-promises rule is
    // relaxed for suite files only (Story 1.1 smoke foundation).
    files: ["tests/**/*.test.ts"],
    rules: {
      "@typescript-eslint/no-floating-promises": "off",
    },
  },
);
