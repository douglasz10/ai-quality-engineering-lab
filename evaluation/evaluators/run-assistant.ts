import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { evaluateAssistant } from "./assistant-evaluate.ts";
import { reportsDir } from "./report-paths.ts";
import type { EvaluationReport, ScenarioEvaluation } from "./assistant-types.ts";

/**
 * Story 2.3 CLI harness: deterministic assistant evaluation.
 * Exit 0 when no evaluated criterion fails; exit 1 otherwise.
 * SKIPPED criteria never cause failure. generatedAt/runId/durationMs are
 * execution metadata only and do not affect verdicts.
 */

function renderMarkdown(report: EvaluationReport): string {
  const passedCount = report.summary.passed.toString();
  const totalCount = report.summary.totalScenarios.toString();
  const lines: string[] = [
    `# Assistant Deterministic Evaluation`,
    ``,
    `Mode: ${report.mode} | Generated: ${report.generatedAt}`,
    `Scenarios: passed=${passedCount} total=${totalCount}`,
    ``,
    `| Scenario | Severity | Result | Failed criteria |`,
    `| --- | --- | --- | --- |`,
  ];
  for (const scenario of report.scenarios) {
    const failed = scenario.criteria
      .filter((criterion) => criterion.status === "failed")
      .map((criterion) => `${criterion.dimension} (${criterion.detail})`)
      .join("; ");
    lines.push(
      `| ${scenario.scenarioId} | ${scenario.severity} | ${scenario.passed ? "PASS" : "FAIL"} | ${failed === "" ? "none" : failed} |`,
    );
  }
  lines.push(``, `## Detail`, ``);
  for (const scenario of report.scenarios) {
    lines.push(`### ${scenario.scenarioId} - ${scenario.passed ? "PASS" : "FAIL"}`);
    lines.push(``);
    lines.push(`Input: ${scenario.input}`);
    lines.push(``);
    lines.push(`Response: ${scenario.response}`);
    lines.push(``);
    for (const criterion of scenario.criteria) {
      lines.push(
        `- [${criterion.status.toUpperCase()}] ${criterion.dimension}: ${criterion.detail}`,
      );
    }
    lines.push(``);
  }
  lines.push(`## Summary by dimension`, ``);
  for (const [dimension, counts] of Object.entries(report.summary.byDimension)) {
    lines.push(
      `- ${dimension}: pass ${counts.pass.toString()}, fail ${counts.fail.toString()}, skipped ${counts.skipped.toString()}`,
    );
  }
  return `${lines.join("\n")}\n`;
}

function scenarioLabel(scenario: ScenarioEvaluation): string {
  const failed = scenario.criteria.filter((criterion) => criterion.status === "failed").length;
  const skipped = scenario.criteria.filter((criterion) => criterion.status === "skipped").length;
  return `${scenario.passed ? "PASS" : "FAIL"} ${scenario.scenarioId} (failed=${failed.toString()}, skipped=${skipped.toString()})`;
}

const report = await evaluateAssistant();
mkdirSync(reportsDir, { recursive: true });
writeFileSync(
  path.join(reportsDir, "assistant-deterministic.json"),
  `${JSON.stringify(report, null, 2)}\n`,
);
writeFileSync(path.join(reportsDir, "assistant-deterministic.md"), renderMarkdown(report));

const passedCount = report.summary.passed.toString();
const totalCount = report.summary.totalScenarios.toString();
process.stdout.write(
  `Assistant deterministic evaluation: passed=${passedCount} total=${totalCount} scenarios passed\n`,
);
for (const scenario of report.scenarios) {
  process.stdout.write(`- ${scenarioLabel(scenario)}\n`);
}
process.stdout.write(
  `Reports: evaluation/reports/assistant-deterministic.json, evaluation/reports/assistant-deterministic.md\n`,
);

if (report.summary.failed > 0) {
  process.exitCode = 1;
}
