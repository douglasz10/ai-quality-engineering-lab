# Runbook (Story 1.1 foundation)

## Setup path

1. Clone the repository.
2. Ensure Node.js 24 LTS and npm 10+ are available.
3. `npm install`
4. (Optional) `cp .env.example .env` for local overrides.
5. `npm run verify`

No undocumented manual steps. No credentials or live LLM services required.

## Verification

`npm run verify` = `typecheck` → `lint` → `format:check` → `test:smoke`.

- Type failures, lint errors, format drift, and smoke failures each fail the
  command with a clear message.
