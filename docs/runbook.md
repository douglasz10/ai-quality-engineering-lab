# Runbook (Stories 1.1–1.6)

## Setup path

1. Clone the repository.
2. Ensure Node.js 24 LTS and npm 10+ are available.
3. `npm install`
4. (Optional) `cp .env.example .env` for local overrides.
5. `npm run verify`

No undocumented manual steps. No credentials or live LLM services are required
for the default path; live LLM evaluation is optional, opt-in and manual (see
the Story 2.6 section at the end of this runbook).

## Verification

`npm run verify` = `typecheck` → `lint` → `format:check` → `test:smoke` → `test:api` → `test:contract`.

- Type failures, lint errors, format drift, smoke test failures, API test
  failures, and contract test failures each fail the command with a clear message.
- `npm run test:e2e` stays outside `verify` because Sauce Demo is an external
  public SUT; CI runs both `verify` and E2E.

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

## Browser E2E (Story 1.4)

Prerequisite (once): `npx playwright install chromium`.

```bash
npm run test:e2e
```

- Suite: `tests/e2e` (Chromium only) vs Sauce Demo. `npm run verify` does
  not include E2E because Sauce Demo is an external public SUT.
- Failure evidence: trace retained on failure, screenshot only on failure;
  open with `npx playwright show-report playwright-report`.
- Deliberate-failure demo (isolated, never in normal runs):
  `E2E_DEMO_FAILURE=true npm run test:e2e -g "valid login"`.

## Contract tests (Story 1.5)

```bash
npm run test:contract
```

- Consumer test generates `specs/contracts/qa-lab-api-consumer-qa-lab-api.json`
  via the local Pact mock server (interactions: `GET /items/:id`, `POST /items`).
- Provider verification replays the committed contract against the real QA Lab
  API started in-process on an ephemeral port; state is seeded through public
  POST only. No broker, no manual server terminal.
- Contract testing proves consumer/provider compatibility; OpenAPI/Ajv schema
  validation (Story 1.3) is a separate concern.
- Intentional breaking-change demo (expected FAIL, repo stays green by default,
  never enabled in CI):
  `npm run test:contract:breaking` renames `name` to `title` via a
  verification-local hook; both interactions fail with "missing keys: name".
  Re-run `npm run test:contract` to restore green.

## CI quality gates (Story 1.6)

Workflow `.github/workflows/ci.yml` (push to `main`, PRs to `main`):
checkout → Node 24 (`.nvmrc`) → `npm ci` → `npm run verify` →
`npx playwright install chromium` → `npm run test:e2e`. No
`continue-on-error`; any check failure fails the job.

- E2E is Chromium only. On failure CI uploads `playwright-report/` and
  `test-results/`; inspect with `npx playwright show-report playwright-report`.
- Failure demos are documentation tools only and are never set in CI:
  `npm run test:contract:breaking` and
  `E2E_DEMO_FAILURE=true npm run test:e2e -g "valid login"`.

## Assistant subject (Story 2.1)

```bash
npm run assistant:start -- "What is the current stock level for Lab Notebook?"
```

- In-process deterministic subject in `apps/assistant`; no server, no
  credentials, no network. Prints provider-neutral JSON (`input`, `context`,
  `providerMode`, `response`, `metadata: { runId, durationMs, fixtureId }`).
- Same behavior programmatically via `runAssistant(input, context)`.
- Stateless per run; no scenarios, rubrics, evaluators, or live mode yet.

## Assistant scenarios + rubric (Story 2.2, inspection only)

```bash
ls evaluation/scenarios/assistant/ evaluation/rubrics/
```

- 3 version-controlled scenarios + full 7-dimension rubric. Each scenario is
  independent of observed outputs.

## Deterministic assistant evaluation (Story 2.3)

```bash
npm run ai:evaluate
```

- Evaluates the 3 scenarios via `runAssistant()` and writes
  `evaluation/reports/assistant-deterministic.json` and `.md` (gitignored
  generated evidence; regenerate any time with the command above).
- Criterion status `passed | failed | skipped`; SKIPPED never causes failure.
  Anchors are case-insensitive literal substrings. Exit 0 = green, 1 = any
  evaluated criterion failed.
- Controlled failing demo without editing committed scenarios:

  ```bash
  cp -r evaluation/scenarios/assistant /tmp/ai23-demo   # copy the scenarios
  # edit an anchor in /tmp/ai23-demo/assistant-grounded-stock.yaml (e.g. 42 units -> 999 units)
  AI_EVAL_SCENARIOS_DIR=/tmp/ai23-demo npm run ai:evaluate   # expect exit 1 + missing-anchor evidence
  npm run ai:evaluate                                        # restore green reports
  ```

  On Windows PowerShell set the variable with
  `$env:AI_EVAL_SCENARIOS_DIR="C:\path\to\ai23-demo"` before the command.

## Hallucination and prompt-injection evaluation (Story 2.4)

```bash
npm run ai:evaluate              # 5 acceptable scenarios, exit 0
npm run ai:evaluate:violations   # 2 violation demos, expected exit 1
```

- Default run adds `assistant-hallucination-refusal` and
  `assistant-prompt-injection-resisted` (both executed against the real
  deterministic Assistant).
- Violation demos live in `evaluation/scenarios/assistant-violations/` and use
  an inline `recordedResponse` because the deterministic Assistant cannot
  fabricate or obey injected instructions. They are evaluated with the same
  behavioral criteria, so FAIL evidence names the violated dimension and the
  missing/forbidden anchors, e.g.:
  `groundedness: failed (forbidden found: Lab Beaker has)`.
- Reports label each scenario with report-only `variant`
  (`acceptable` | `violation-demo`) and `responseSource`
  (`assistant` | `recorded`); these never affect verdicts. A `violation-demo`
  scenario that unexpectedly passes is reported as a warning and fails the run.
- **Scope honesty:** this prompt-injection resistance is deterministic and
  limited (exact-fixture dispatch ignores embedded instructions). It
  demonstrates the evaluation capability, not real LLM robustness — that is
  Story 2.6 (live mode) with variation work in 2.5.

## Non-determinism and acceptable variation (Story 2.5)

```bash
npm run ai:evaluate              # 6 scenarios / 8 variants, exit 0
npm run ai:evaluate:violations   # includes the material-variation failure, exit 1
```

- `assistant-acceptable-variation` (default run) declares three controlled
  response variants — `concise`, `detailed`, `reordered` — for the same input,
  context, dimensions and criteria. Each variant is evaluated independently and
  all must pass, showing that wording/structure/detail variation is acceptable.
- `assistant-material-variation-failure` (violation folder) uses the same
  criteria for a grounded variant (`grounded-correct`, PASS) and a materially
  wrong one (`material-wrong-quantity` = `420 units`, FAIL) with evidence
  `missing: 42 units` / `forbidden found: 420 units`.
- Counting: `summary.totalScenarios` counts logical scenarios once;
  `summary.totalVariants` counts evaluated variant rows. Reports include
  `variantRef` per row for traceability.
- No sampling, statistics, thresholds, fuzzy/semantic matching or
  LLM-as-a-judge; acceptable variation is proven by shared literal anchors.
- Scope honesty: variants are recorded responses, not live-model sampling.

## Live LLM evaluation (Story 2.6, optional and manual)

```bash
cp .env.example .env      # then set ASSISTANT_LIVE_API_KEY; never commit it
npm run ai:evaluate:live  # opt-in; local/manual only
```

- Deterministic evaluation remains the default: `npm run ai:evaluate` (exit 0)
  and `npm run ai:evaluate:violations` (expected exit 1) are unchanged and need
  no configuration or network. `npm run verify` stays deterministic and CI
  never calls the live evaluator.
- Scenarios: `evaluation/scenarios/assistant-live/*.yaml`
  (`live-grounded-stock`, `live-unsupported-fact`,
  `live-prompt-injection-resisted`). One scenario = one provider call = one
  observed response = one deterministic evaluation. No `responseVariants` and
  no exact full-response matching.
- Configuration is environment-only and loaded with Node 24
  `--env-file-if-exists=.env` (no dotenv dependency). Required:
  `ASSISTANT_LIVE_API_KEY`, `ASSISTANT_LIVE_MODEL`. Defaults:
  `ASSISTANT_LIVE_BASE_URL=https://openrouter.ai/api/v1`,
  `ASSISTANT_LIVE_TEMPERATURE=0`, `ASSISTANT_LIVE_TIMEOUT_MS=30000`. Optional:
  `ASSISTANT_LIVE_MAX_OUTPUT_TOKENS` (sent as `max_tokens`).
- Provider: OpenRouter; documented default model `qwen/qwen3.8-27b:free`
  (verify the model id against your own OpenRouter account). The adapter is
  OpenAI-compatible and provider-neutral, so switching providers means editing
  `apps/assistant/src/providers/live-http.provider.ts` only.
- Outcomes:

| Status        | When                                                          | Exit code |
| ------------- | ------------------------------------------------------------- | --------- |
| `passed`      | live evaluation executed and every evaluated criterion passed | 0         |
| `failed`      | a criterion failed, or the provider/API call failed           | 1         |
| `unavailable` | required configuration was missing, so nothing was executed   | 0         |

`unavailable` is not a pass; the report says explicitly that live evaluation
was not executed because configuration was unavailable. No provider is
created and no scenario runs in that case.

- Failure categories in the report (sanitized, no secrets): `authentication`
  (401/403), `configuration` (404), `provider` (429, 5xx, timeout, network
  error), `response` (2xx without usable assistant content).
- Reports: `evaluation/reports/assistant-live.json` and `.md` (gitignored
  generated evidence). Only non-sensitive metadata is recorded (provider, model,
  temperature, optional max output tokens, runId, durationMs) plus the observed
  response as evaluation evidence; never the API key, `Authorization` header,
  raw request headers/payload, token counts or cost.
- No retries, streaming, tools, conversation history, parallel calls, repeated
  passes, LLM-as-a-judge, statistics or benchmarking. Each response is evaluated
  with literal, case-insensitive anchors (`mustContain`, `mustContainAny`,
  `mustNotContain`).
- Windows note: the script sets `AI_EVAL_SCENARIOS_DIR` through `cross-env`, so
  it behaves identically in PowerShell and POSIX shells.
