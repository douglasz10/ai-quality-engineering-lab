import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { runAssistant } from "../../apps/assistant/src/assistant.ts";
import {
  createAssistantProvider,
  describeLiveConfig,
  loadLiveConfig,
  redactSecrets,
} from "../../apps/assistant/src/providers/index.ts";
import { LiveProviderError } from "../../apps/assistant/src/providers/live-http.provider.ts";
import {
  assertKnownDimensions,
  evaluateCriteria,
  loadRubric,
  loadScenarios,
  resolveScenarioContext,
  resolveScenariosDir,
  summarize,
} from "./assistant-evaluate.ts";
import { reportsDir } from "./report-paths.ts";
import type {
  EvaluationReport,
  LiveEvaluationStatus,
  ScenarioEvaluation,
  ScenarioExecutionFailure,
} from "./assistant-types.ts";

/**
 * Story 2.6 CLI harness: OPTIONAL live assistant evaluation.
 *
 * - Deterministic evaluation stays the default (`npm run ai:evaluate`).
 * - This command is opt-in, manual/local, and never used by `npm run verify`
 *   or CI; it is the only command that loads `.env`
 *   (`node --env-file-if-exists=.env`).
 * - One live scenario = one provider call = one observed response = one
 *   deterministic evaluation. No retries, no repeats, no parallel calls,
 *   no streaming, no tools, no history, no LLM judge, no statistics.
 * - `unavailable` (missing configuration) exits 0 but is NOT a pass.
 *   A provider/configuration/runtime failure exits 1.
 */

const jsonReportPath = path.join(reportsDir, "assistant-live.json");
const markdownReportPath = path.join(reportsDir, "assistant-live.md");
const relativeJson = "evaluation/reports/assistant-live.json";
const relativeMarkdown = "evaluation/reports/assistant-live.md";

const unavailableBanner = "Live evaluation was not executed because configuration was unavailable.";

function writeReports(report: EvaluationReport, markdown: string): void {
  mkdirSync(reportsDir, { recursive: true });
  writeFileSync(jsonReportPath, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(markdownReportPath, markdown);
}

function emptySummary(): EvaluationReport["summary"] {
  return { totalScenarios: 0, passed: 0, failed: 0, totalVariants: 0, byDimension: {} };
}

function unavailableReport(problems: readonly string[]): EvaluationReport {
  return {
    subject: "assistant",
    mode: "live",
    generatedAt: new Date().toISOString(),
    status: "unavailable",
    scenarios: [],
    executionFailures: [],
    unavailableReasons: problems,
    summary: emptySummary(),
  };
}

function renderUnavailableMarkdown(report: EvaluationReport): string {
  const lines: string[] = [
    "# Assistant Live Evaluation",
    "",
    `Mode: ${report.mode} | Status: UNAVAILABLE | Generated: ${report.generatedAt}`,
    "",
    unavailableBanner,
    "",
    "Live evaluation is optional and opt-in. Deterministic evaluation remains the",
    "default and is unaffected by this status.",
    "",
    "## Missing or invalid configuration",
    "",
  ];
  for (const reason of report.unavailableReasons ?? []) {
    lines.push(`- ${reason}`);
  }
  lines.push(
    "",
    "## Semantics",
    "",
    "- `unavailable` is NOT a pass: no provider call was attempted and no scenario was executed.",
    "- Exit code is 0 because nothing failed; there is no evaluation evidence to review.",
    "- Only variable names and expected formats are reported: no credential value,",
    "  authorization header, request payload, token count, or cost is recorded.",
    "",
    "## How to enable live evaluation locally",
    "",
    "Set ASSISTANT_LIVE_API_KEY and ASSISTANT_LIVE_MODEL (see `.env.example`), then",
    "re-run `npm run ai:evaluate:live`. The current provider is OpenRouter and the",
    "documented default model is qwen/qwen3.8-27b:free. The API key must never be committed.",
    "",
  );
  return `${lines.join("\n")}\n`;
}
function renderExecutedMarkdown(report: EvaluationReport): string {
  const status = (report.status ?? "failed").toUpperCase();
  const failures = report.executionFailures ?? [];
  const live = report.live;
  const lines: string[] = [
    "# Assistant Live Evaluation",
    "",
    `Mode: ${report.mode} | Status: ${status} | Generated: ${report.generatedAt}`,
    "",
    "One provider call per scenario. The observed responses are evaluated by the",
    "SAME deterministic anchor rules used for deterministic evaluation: literal,",
    "case-insensitive substring checks. No LLM-as-a-judge, no scoring, no retry,",
    "no streaming, no statistics.",
    "",
  ];
  if (live !== undefined) {
    lines.push(
      `Live provider metadata: provider=${live.provider}, model=${live.model}, temperature=${live.temperature.toString()}${live.maxOutputTokens === undefined ? "" : `, maxOutputTokens=${live.maxOutputTokens.toString()}`}`,
      "",
    );
  }
  lines.push(
    `Scenarios: passed=${report.summary.passed.toString()} failed=${report.summary.failed.toString()} total=${report.summary.totalScenarios.toString()} | Evaluated responses: ${report.summary.totalVariants.toString()} | Provider failures: ${failures.length.toString()}`,
    "",
  );
  if (failures.length > 0) {
    lines.push(
      "## Provider execution failures",
      "",
      "| Scenario | Category | Detail |",
      "| --- | --- | --- |",
    );
    for (const failure of failures) {
      lines.push(`| ${failure.scenarioId} | ${failure.category} | ${failure.detail} |`);
    }
    lines.push("");
  }
  lines.push("| Scenario | Result | Failed criteria |", "| --- | --- | --- |");
  for (const scenario of report.scenarios) {
    const failedCriteria = scenario.criteria
      .filter((criterion) => criterion.status === "failed")
      .map((criterion) => `${criterion.dimension} (${criterion.detail})`)
      .join("; ");
    lines.push(
      `| ${scenario.scenarioId} | ${scenario.passed ? "PASS" : "FAIL"} | ${failedCriteria === "" ? "none" : failedCriteria} |`,
    );
  }
  lines.push("", "## Detail", "");
  for (const scenario of report.scenarios) {
    lines.push(`### ${scenario.scenarioId} - ${scenario.passed ? "PASS" : "FAIL"}`, "");
    lines.push(
      `Response source: ${scenario.responseSource} | Fixture reference: ${scenario.fixtureId} (technical source reference kept for compatibility; not a deterministic fixture)`,
      "",
    );
    lines.push(`Input: ${scenario.input}`, "");
    lines.push(`Observed response (evidence): ${scenario.response}`, "");
    for (const criterion of scenario.criteria) {
      lines.push(
        `- [${criterion.status.toUpperCase()}] ${criterion.dimension}: ${criterion.detail}`,
      );
    }
    lines.push("");
  }
  lines.push("## Summary by dimension", "");
  for (const [dimension, counts] of Object.entries(report.summary.byDimension)) {
    lines.push(
      `- ${dimension}: pass ${counts.pass.toString()}, fail ${counts.fail.toString()}, skipped ${counts.skipped.toString()}`,
    );
  }
  lines.push(
    "",
    "## Semantics",
    "",
    "- `passed`: every evaluated criterion passed; exit code 0.",
    "- `failed`: a criterion failed or a provider call failed; exit code 1.",
    "- `unavailable`: configuration was missing, so live evaluation was not",
    "  executed at all; exit code 0 but never a pass.",
    "- Credentials, authorization headers, raw payloads, token counts and cost are",
    "  never recorded; only the observed response is kept as evaluation evidence.",
    "",
  );
  return `${lines.join("\n")}\n`;
}

function reportUnavailable(problems: readonly string[]): void {
  const report = unavailableReport(problems);
  writeReports(report, renderUnavailableMarkdown(report));
  process.stdout.write(`Assistant live evaluation: UNAVAILABLE - ${unavailableBanner}\n`);
  for (const reason of problems) {
    process.stdout.write(`- ${reason}\n`);
  }
  process.stdout.write(
    "No provider was created and no scenario was executed. Exit code 0: unavailable is not a pass.\n",
  );
  process.stdout.write(`Reports: ${relativeJson}, ${relativeMarkdown}\n`);
}
const configResolution = loadLiveConfig();

if (!configResolution.ok) {
  // Configuration validation happens BEFORE provider creation and BEFORE any
  // scenario execution: no provider is created and no scenario is executed.
  reportUnavailable(configResolution.problems);
  process.exitCode = 0;
} else {
  const providerResolution = createAssistantProvider("live");
  if (!providerResolution.ok) {
    reportUnavailable(providerResolution.problems);
    process.exitCode = 0;
  } else {
    const provider = providerResolution.provider;
    const live = describeLiveConfig(configResolution.config);
    const scenarios = loadScenarios();
    assertKnownDimensions(scenarios, loadRubric());
    process.stdout.write(
      `Assistant live evaluation: scenarios from ${path.relative(path.join(reportsDir, "..", ".."), resolveScenariosDir())}\n`,
    );

    const evaluations: ScenarioEvaluation[] = [];
    const executionFailures: ScenarioExecutionFailure[] = [];
    for (const scenario of scenarios) {
      // One live scenario = one provider call = one observed response = one
      // deterministic evaluation. Sequential, no retries, no repeats.
      const context = resolveScenarioContext(scenario);
      try {
        const result = await runAssistant(scenario.input, context, { provider });
        const criteria = evaluateCriteria(scenario, result.response);
        const evaluated = criteria.filter((criterion) => criterion.status !== "skipped");
        evaluations.push({
          scenarioId: scenario.id,
          variantRef: "live-run",
          severity: scenario.severity,
          input: scenario.input,
          response: result.response,
          fixtureId: result.metadata.fixtureId,
          runId: result.metadata.runId,
          variant: "acceptable",
          responseSource: "live",
          ...(result.metadata.live === undefined ? {} : { live: result.metadata.live }),
          criteria,
          passed:
            evaluated.length > 0 && evaluated.every((criterion) => criterion.status === "passed"),
        });
      } catch (error) {
        if (!(error instanceof LiveProviderError)) {
          throw error;
        }
        // A provider failure is never reported as unavailable; the evidence is
        // the category plus a sanitized message (no payload, no header, no key).
        executionFailures.push({
          scenarioId: scenario.id,
          category: error.category,
          detail: redactSecrets(error.message),
        });
      }
    }

    const summary = summarize(evaluations);
    const status: LiveEvaluationStatus =
      summary.failed > 0 || executionFailures.length > 0 ? "failed" : "passed";
    const report: EvaluationReport = {
      subject: "assistant",
      mode: "live",
      generatedAt: new Date().toISOString(),
      status,
      live,
      scenarios: evaluations,
      executionFailures,
      summary,
    };
    writeReports(report, renderExecutedMarkdown(report));

    process.stdout.write(
      `Assistant live evaluation: ${status.toUpperCase()} - provider=${live.provider} model=${live.model} | scenarios passed=${summary.passed.toString()} failed=${summary.failed.toString()} total=${summary.totalScenarios.toString()} | provider failures=${executionFailures.length.toString()}\n`,
    );
    for (const scenario of report.scenarios) {
      const failedCount = scenario.criteria.filter(
        (criterion) => criterion.status === "failed",
      ).length;
      process.stdout.write(
        `- ${scenario.passed ? "PASS" : "FAIL"} ${scenario.scenarioId} [live] (failed=${failedCount.toString()})\n`,
      );
    }
    for (const failure of executionFailures) {
      process.stdout.write(
        `- FAIL ${failure.scenarioId} [provider:${failure.category}] ${failure.detail}\n`,
      );
    }
    process.stdout.write(`Reports: ${relativeJson}, ${relativeMarkdown}\n`);
    process.stdout.write(
      "Deterministic evaluation stays the default (npm run ai:evaluate); live runs are opt-in and never part of npm run verify or CI.\n",
    );
    process.exitCode = status === "failed" ? 1 : 0;
  }
}
