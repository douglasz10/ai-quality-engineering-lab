# AI Quality Engineering Lab

Portfolio monorepo demonstrating practical Quality Engineering for traditional
and AI-based systems. **Status: V1 in progress — only Story 1.1 foundation is
implemented.** Test suites, test subjects, evaluation, and CI gates arrive in
later stories and must not be described as implemented.

## Prerequisites

- Node.js 24 LTS (`node --version` → `v24.x`)
- npm 10+ (`npm --version`)

Node version is pinned in `.nvmrc` (`24`). `package.json` also enforces
`engines: node >= 24`.

## Setup

```bash
npm install
cp .env.example .env   # optional local overrides; never commit real secrets
npm run verify         # typecheck + lint + format:check + smoke test
```

No credentials, paid services, or live LLM providers are required for the
default path.

## Command vocabulary (Story 1.1)

| Command                | Purpose                                             |
| ---------------------- | --------------------------------------------------- |
| `npm install`          | Install root dependencies and link workspaces       |
| `npm run typecheck`    | Strict TypeScript check (`tsc --noEmit`)            |
| `npm run lint`         | ESLint with strict type-checked rules               |
| `npm run format:check` | Prettier validation                                 |
| `npm run format`       | Prettier write                                      |
| `npm run test:smoke`   | Deterministic `node:test` foundation smoke          |
| `npm run verify`       | Default verification entry point (all of the above) |

## Docs

- `docs/runbook.md` — setup, execution, and verification path.

## Deferred (not implemented in Story 1.1)

Local QA Lab API behavior (1.2), REST/schema tests (1.3), Playwright E2E (1.4),
Pact contract protection (1.5), GitHub Actions gates (1.6), Assistant (Epic 2),
Agent (Epic 3), reviewer evidence consolidation (Epic 4).
