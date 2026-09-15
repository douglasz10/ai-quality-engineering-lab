# AI Quality Engineering Lab

Portfolio monorepo demonstrating practical Quality Engineering for traditional
and AI-based systems. **Status: V1 in progress — Stories 1.1 (foundation), 1.2
(local QA Lab API), 1.3 (REST API + schema tests), 1.4 (browser E2E), and 1.5
(consumer/provider contract protection) are implemented.** CI gates arrive in
Story 1.6; evaluation and AI subjects arrive in Epics 2–4 and must not be
described as implemented.

## Prerequisites

- Node.js 24 LTS (`node --version` → `v24.x`)
- npm 10+ (`npm --version`)

Node version is pinned in `.nvmrc` (`24`). `package.json` also enforces
`engines: node >= 24`.

## Setup

```bash
npm install
cp .env.example .env   # optional local overrides; never commit real secrets
npm run verify         # typecheck + lint + format:check + smoke tests + API tests
```

No credentials, paid services, or live LLM providers are required for the
default path.

## Command vocabulary

| Command                 | Purpose                                                                 |
| ----------------------- | ----------------------------------------------------------------------- |
| `npm install`           | Install root dependencies and link workspaces                           |
| `npm run typecheck`     | Strict TypeScript check (`tsc --noEmit`)                                |
| `npm run lint`          | ESLint with strict type-checked rules                                   |
| `npm run format:check`  | Prettier validation                                                     |
| `npm run format`        | Prettier write                                                          |
| `npm run test:smoke`    | Deterministic `node:test` foundation smoke                              |
| `npm run verify`        | Default verification entry point (all of the above)                     |
| `npm run test:api`      | Deterministic API suite (`buildApp` + `inject`)                         |
| `npm run api:start`     | Start the local QA Lab API (Story 1.2)                                  |
| `npm run test:e2e`      | Browser E2E suite vs Sauce Demo (Chromium, Story 1.4; outside `verify`) |
| `npm run test:contract` | Consumer contract + provider verification (Story 1.5; outside `verify`) |

## Local QA Lab API (Story 1.2)

In-memory test subject in `apps/qa-lab-api`. Restarting the process resets
all state. There is no reset endpoint and no persistence.

- Default port: `3001`. Override with `QA_LAB_API_PORT` (e.g.
  `QA_LAB_API_PORT=3100 npm run api:start`).
- Authoritative behavior contract: `specs/openapi/qa-lab-api.yaml`.
  Automated schema validation arrives in Story 1.3.

| Method | Path         | Success                | Errors                                   |
| ------ | ------------ | ---------------------- | ---------------------------------------- |
| GET    | `/health`    | `200 { status: "ok" }` | —                                        |
| GET    | `/items`     | `200 { items: [...] }` | —                                        |
| GET    | `/items/:id` | `200` item             | `404 { error: "NOT_FOUND", ... }`        |
| POST   | `/items`     | `201` item             | `400 { error: "VALIDATION_ERROR", ... }` |

Quantity boundary: `1..100` inclusive. `0` and `101` return `400`.
Missing `name`/`quantity`, wrong types, and malformed JSON return `400`.
Unknown ids and unknown routes return `404`. Malformed requests never crash
the process.

Manual examples:

```bash
npm run api:start
curl http://127.0.0.1:3001/health
curl http://127.0.0.1:3001/items
curl -X POST http://127.0.0.1:3001/items \
  -H "Content-Type: application/json" \
  -d '{"name":"Notebook","quantity":2}'
curl http://127.0.0.1:3001/items/item-0001
```

## Docs

- `docs/runbook.md` — setup, execution, and verification path.

## Browser E2E (Story 1.4)

Playwright + TypeScript suite in `tests/e2e` against the public Sauce Demo
app (Chromium only). Each test logs in independently; no test depends on
another test's state.

- Run: `npm run test:e2e` (requires `npx playwright install chromium` once).
  E2E is intentionally outside `npm run verify` because Sauce Demo is an
  external public SUT.
- Coverage (6 tests): valid login, invalid login, cart update, valid
  checkout, checkout with missing last name, critical purchase journey.
- Locators use explicit `[data-test='...']` selectors (Sauce Demo's
  `data-test` attribute is not matched by Playwright's default `getByTestId`).
- Failure evidence: trace retained on failure, screenshot only on failure.
  Inspect with `npx playwright show-report playwright-report`.
- Deliberate-failure demo (never active in normal runs):
  `E2E_DEMO_FAILURE=true npm run test:e2e -g "valid login"` fails exactly
  one locator assertion with trace/screenshot evidence.

## Contract Protection (Story 1.5)

Pact consumer/provider verification against the local QA Lab API, no broker.
The committed contract at `specs/contracts/qa-lab-api-consumer-qa-lab-api.json`
is the source of truth: the consumer test generates it via the Pact mock
server; provider verification replays it against the real API started
in-process on an ephemeral port (state seeded through public POST only).

- Run: `npm run test:contract` (consumer + provider, green path).
  Granular: `npm run test:contract:consumer`, `npm run test:contract:provider`.
- Contract testing proves consumer/provider compatibility over HTTP; it does
  not replace OpenAPI/Ajv schema-shape validation (Story 1.3).
- `npm run verify` does not include contract tests; Story 1.6 decides CI
  composition.
- Deliberate breaking-change demo (isolated, never in normal runs):
  `npm run test:contract:breaking` renames response field `name` to `title`
  via a verification-local hook and fails both interactions with a clear
  "missing keys: name" mismatch. Re-run `npm run test:contract` for green.

## Deferred (not implemented yet)

Local QA Lab API behavior (1.2), REST/schema tests (1.3), browser E2E (1.4),
and contract protection (1.5) are implemented; GitHub Actions gates (1.6),
Assistant (Epic 2), Agent (Epic 3), reviewer evidence consolidation (Epic 4).
