# Runbook (Stories 1.1–1.3)

## Setup path

1. Clone the repository.
2. Ensure Node.js 24 LTS and npm 10+ are available.
3. `npm install`
4. (Optional) `cp .env.example .env` for local overrides.
5. `npm run verify`

No undocumented manual steps. No credentials or live LLM services required.

## Verification

`npm run verify` = `typecheck` → `lint` → `format:check` → `test:smoke` → `test:api`.

- Type failures, lint errors, format drift, smoke test failures, and API test
  failures each fail the command with a clear message.

## Local QA Lab API (Story 1.2)

Start the API:

```bash
npm run api:start
```

- Default port `3001`; override with `QA_LAB_API_PORT`.
- Endpoints: `GET /health`, `GET /items`, `GET /items/:id`, `POST /items`.
- Quantity must be an integer in `1..100`; violations return `400` with
  `{ error: "VALIDATION_ERROR", message: "..." }`.
- Unknown item ids and unknown routes return `404` with
  `{ error: "NOT_FOUND", message: "..." }`.
- State is in-memory only. Restart the process to reset it. There is no
  reset endpoint.

## API test suite (Story 1.3)

Run the deterministic suite (no network server; isolated `buildApp()` + `inject`):

```bash
npm run test:api
```

- `tests/api/items.test.ts`: HTTP behavior — health/empty state, create/read/list
  observation, quantity boundaries (0/1/100/101), a 6-rule decision table for
  required-field combinations, wrong types, non-object bodies, malformed JSON,
  unknown ids/routes. Every response is also validated against the OpenAPI schema.
- `tests/api/schema.test.ts`: OpenAPI loading/compilation plus deliberately
  incompatible fixtures (missing field, wrong type, out-of-range, wrong error
  shape) that must fail with actionable Ajv details.
- `tests/api/openapi.ts`: local-only schema-loading/validation helper.
