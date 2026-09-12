# AI Quality Engineering Lab

Portfolio monorepo demonstrating practical Quality Engineering for traditional
and AI-based systems. **Status: V1 in progress — Stories 1.1 (foundation) and
1.2 (local QA Lab API) are implemented.** Remaining suites, REST/schema tests,
contract tests, evaluation, and CI gates arrive in later stories and must not
be described as implemented.

## Prerequisites

- Node.js 24 LTS (`node --version` → `v24.x`)
- npm 10+ (`npm --version`)

Node version is pinned in `.nvmrc` (`24`). `package.json` also enforces
`engines: node >= 24`.

## Setup

```bash
npm install
cp .env.example .env   # optional local overrides; never commit real secrets
npm run verify         # typecheck + lint + format:check + smoke tests
```

No credentials, paid services, or live LLM providers are required for the
default path.

## Command vocabulary

| Command                | Purpose                                             |
| ---------------------- | --------------------------------------------------- |
| `npm install`          | Install root dependencies and link workspaces       |
| `npm run typecheck`    | Strict TypeScript check (`tsc --noEmit`)            |
| `npm run lint`         | ESLint with strict type-checked rules               |
| `npm run format:check` | Prettier validation                                 |
| `npm run format`       | Prettier write                                      |
| `npm run test:smoke`   | Deterministic `node:test` foundation smoke          |
| `npm run verify`       | Default verification entry point (all of the above) |
| `npm run api:start`    | Start the local QA Lab API (Story 1.2)              |

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

## Deferred (not implemented yet)

Local QA Lab API behavior (1.2) is implemented; REST/schema tests (1.3),
Playwright E2E (1.4),
Pact contract protection (1.5), GitHub Actions gates (1.6), Assistant (Epic 2),
Agent (Epic 3), reviewer evidence consolidation (Epic 4).
