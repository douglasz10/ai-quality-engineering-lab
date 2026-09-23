# AI Quality Engineering Lab

Portfolio monorepo demonstrating practical Quality Engineering for traditional
and AI-based systems. **Status: V1 traditional QE complete (Stories 1.1–1.6);
Epic 2 Assistant evaluation foundation complete (2.1 subject, 2.2 scenarios +
rubric, 2.3 deterministic engine, 2.4 hallucination/prompt-injection
evaluation).** Variation handling (2.5), live mode (2.6), Agent (Epic 3), and
reviewer evidence consolidation (Epic 4) arrive in later stories and must not
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
npm run verify         # deterministic gate: typecheck + lint + format:check + smoke + API + contract
```

No credentials, paid services, or live LLM providers are required for the
default path.

## Command vocabulary

| Command                          | Purpose                                                                                              |
| -------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `npm install`                    | Install root dependencies and link workspaces                                                        |
| `npm run typecheck`              | Strict TypeScript check (`tsc --noEmit`)                                                             |
| `npm run lint`                   | ESLint with strict type-checked rules                                                                |
| `npm run format:check`           | Prettier validation                                                                                  |
| `npm run format`                 | Prettier write                                                                                       |
| `npm run test:smoke`             | Deterministic `node:test` foundation smoke                                                           |
| `npm run verify`                 | Deterministic traditional gate (typecheck, lint, format, smoke, API, contract; E2E stays separate)   |
| `npm run test:api`               | Deterministic API suite (`buildApp` + `inject`)                                                      |
| `npm run api:start`              | Start the local QA Lab API (Story 1.2)                                                               |
| `npm run assistant:start`        | Invoke the deterministic Assistant subject, prints provider-neutral JSON (Story 2.1)                 |
| `npm run ai:evaluate`            | Deterministic Assistant evaluation: writes JSON + Markdown reports, exit 1 on any failed criterion   |
| `npm run ai:evaluate:violations` | Intentional violation demo: evaluates the recorded violation scenarios, expected to FAIL (Story 2.4) |
| `npm run test:e2e`               | Browser E2E suite vs Sauce Demo (Chromium, Story 1.4; outside `verify`)                              |
| `npm run test:contract`          | Consumer contract + provider verification (Story 1.5; part of `verify`)                              |

## CI Quality Gates (Story 1.6)

GitHub Actions workflow `.github/workflows/ci.yml` runs on push to `main`
and pull requests targeting `main`: checkout → Node 24 (from `.nvmrc`) →
`npm ci` → `npm run verify` → `npx playwright install chromium` →
`npm run test:e2e`. Any quality-check failure fails the job; no
`continue-on-error` is used.

- `npm run verify` is the deterministic traditional gate (typecheck, lint,
  format:check, smoke, API, contract). E2E stays separate because Sauce Demo
  is an external public SUT; CI runs both, locally they stay distinct.
- E2E is Chromium only. On E2E failure CI uploads `playwright-report/` and
  `test-results/` (trace retained on failure, screenshot only on failure);
  inspect locally with `npx playwright show-report playwright-report`.
- The intentional failure demos (`CONTRACT_DEMO_BREAKING=true`,
  `E2E_DEMO_FAILURE=true`) are NOT enabled in CI. Reproduce locally:
  `npm run test:contract:breaking` (expected FAIL with "missing keys: name",
  then `npm run test:contract` for green) and
  `E2E_DEMO_FAILURE=true npm run test:e2e -g "valid login"` (exactly one
  locator failure with trace/screenshot evidence).
- No branch protection is configured by this story; the workflow itself is
  the enforcement evidence.

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

- Run: `npm run test:contract` (consumer + provider, green path; part of
  `npm run verify` since Story 1.6).
  Granular: `npm run test:contract:consumer`, `npm run test:contract:provider`.
- Contract testing proves consumer/provider compatibility over HTTP; it does
  not replace OpenAPI/Ajv schema-shape validation (Story 1.3).
- Deliberate breaking-change demo (isolated, never in normal runs or CI):
  `npm run test:contract:breaking` renames response field `name` to `title`
  via a verification-local hook and fails both interactions with a clear
  "missing keys: name" mismatch. Re-run `npm run test:contract` for green.

## Deferred (not implemented yet)

Stories 1.1–1.6 (traditional QE + CI gates) and 2.1–2.4 (Assistant subject,
scenarios + rubric, deterministic engine, hallucination/prompt-injection
evaluation) are implemented; variation handling (2.5), live LLM mode (2.6),
Agent (Epic 3), reviewer evidence consolidation (Epic 4).

## Assistant Subject (Story 2.1)

Deterministic in-process Assistant in `apps/assistant` behind a
provider-neutral boundary. No credentials, no network, no live LLM.

- Run: `npm run assistant:start -- "What is the current stock level for Lab Notebook?"`
  (no argument runs the first fixture input). Prints provider-neutral JSON:
  `input`, `context`, `providerMode: "deterministic"`, `response`,
  `metadata: { runId, durationMs, fixtureId }`.
- Programmatic: `runAssistant(input, context)` from
  `apps/assistant/src/assistant.ts` — same function the CLI uses.
- Stateless per run; two small fixtures (stock levels, shipping policy) with
  a tiny controlled context for future groundedness/relevance evaluation.

## Assistant Scenarios + Rubric (Story 2.2, source artifacts only)

Version-controlled, reviewer-inspectable inputs. Nothing executes yet;
evaluation arrives in Story 2.3.

- Scenarios: `evaluation/scenarios/assistant/*.yaml` (5 acceptable):
  `assistant-grounded-stock`, `assistant-hallucination-refusal`,
  `assistant-prompt-injection-resisted`, `assistant-relevant-shipping`,
  `assistant-safety-boundary`. Each declares id, objective, input, controlled
  context, expected behavioral properties (`mustContain`/`mustNotContain`
  anchors only, never full-response equality), mode, dimensions, severity,
  tags.
- Violation demo scenarios live in the separate, non-default folder
  `evaluation/scenarios/assistant-violations/` (Story 2.4) and are never part
  of the green run.
- Rubric: `evaluation/rubrics/assistant.yaml` — all 7 dimensions (Relevance,
  Groundedness, Safety, Robustness, Hallucination resistance, Prompt-injection
  resistance, Acceptable non-deterministic variation) with behavioral
  pass/fail criteria. Scenarios select only their applicable dimensions.

## Deterministic Assistant Evaluation (Story 2.3)

```bash
npm run ai:evaluate
```

- Runs the 3 scenarios through the Story 2.1 deterministic Assistant
  (`runAssistant()`), evaluates each selected dimension against the rubric
  criteria, and writes both reports to `evaluation/reports/` (gitignored
  generated evidence): `assistant-deterministic.json` and
  `assistant-deterministic.md`.
- Criterion status is `passed | failed | skipped`. A dimension selected without
  `expectedProperties` is SKIPPED and never contributes to failure.
- Anchors are case-insensitive literal substrings (`mustContain` all present,
  `mustNotContain` all absent). No regex, no fuzzy matching, no
  LLM-as-a-judge, no semantic scoring.
- Exit code 0 when no evaluated criterion fails, 1 when any fails. The
  behavioral verdict is reproducible; `generatedAt`, `runId`, and `durationMs`
  are execution metadata only.
- Controlled failing demo (committed scenarios are never edited): copy
  `evaluation/scenarios/assistant/` to a temp folder, change an anchor in the
  copy, then run with `AI_EVAL_SCENARIOS_DIR` pointing at it — the scenario
  fails with actionable missing-anchor evidence and exit code 1. Re-run
  `npm run ai:evaluate` to restore green reports.
- Not part of `npm run verify` or CI; evaluation evidence is reviewed on
  demand.

## Hallucination and Prompt-Injection Evaluation (Story 2.4)

Two new acceptable scenarios join the default deterministic run (5 scenarios
total), and two intentional violation demos live in a separate folder so the
baseline stays green:

- Default run (`npm run ai:evaluate`, exit 0): `assistant-hallucination-refusal`
  (groundedness + hallucination-resistance) and
  `assistant-prompt-injection-resisted` (prompt-injection-resistance + safety) —
  both invoked through the real deterministic Assistant.
- Violation demo (`npm run ai:evaluate:violations`, expected exit 1):
  `assistant-hallucination-violation` and `assistant-prompt-injection-violation`
  from `evaluation/scenarios/assistant-violations/`. The deterministic
  Assistant cannot fabricate or obey injected instructions, so these scenarios
  carry an **inline `recordedResponse`** and are evaluated by the exact same
  behavioral criteria — that is what makes the PASS/FAIL contrast meaningful.
- The same committed criteria are used for both variants; only the evaluated
  response differs. All evidence (response, missing/forbidden anchors, violated
  dimension) is in the generated reports.
- Reports label each scenario with report-only metadata: `variant`
  (`acceptable` | `violation-demo`) and `responseSource` (`assistant` |
  `recorded`). These labels never influence verdicts; a `violation-demo`
  scenario that unexpectedly passes is reported as a warning and fails the run.
- **Scope honesty:** the prompt-injection resistance demonstrated here is
  deterministic and limited — the deterministic Assistant dispatches on exact
  fixture input and ignores embedded instructions, so this evidence shows the
  _evaluation capability_ (criteria, variants, diagnostics), not the robustness
  of a real LLM. Live-model robustness is Story 2.6 and repeated-run variation
  is Story 2.5.
