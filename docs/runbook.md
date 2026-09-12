# Runbook (Stories 1.1–1.2)

## Setup path

1. Clone the repository.
2. Ensure Node.js 24 LTS and npm 10+ are available.
3. `npm install`
4. (Optional) `cp .env.example .env` for local overrides.
5. `npm run verify`

No undocumented manual steps. No credentials or live LLM services required.

## Verification

`npm run verify` = `typecheck` → `lint` → `format:check` → `test:smoke`.

- Type failures, lint errors, format drift, and smoke test failures each fail
  the command with a clear message.

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
