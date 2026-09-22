import { readFileSync, readdirSync } from "node:fs";
import { parse } from "yaml";
import path from "node:path";
import { runAssistant } from "../../apps/assistant/src/assistant.ts";
import { repoRoot } from "./report-paths.ts";
import type {
  AssistantRubric,
  AssistantScenario,
  CriterionResult,
  EvaluationReport,
  ScenarioEvaluation,
} from "./assistant-types.ts";

const defaultScenariosDir = path.join(repoRoot, "evaluation", "scenarios", "assistant");
const rubricPath = path.join(repoRoot, "evaluation", "rubrics", "assistant.yaml");

/**
 * Scenario directory override. Used only to demonstrate a controlled failing
 * evaluation against a temporary copy; the committed scenarios stay the
 * default and are never modified by the harness.
 */
export function resolveScenariosDir(): string {
  return process.env["AI_EVAL_SCENARIOS_DIR"] ?? defaultScenariosDir;
}

function containsAnchor(response: string, anchor: string): boolean {
  return response.toLowerCase().includes(anchor.toLowerCase());
}

function evaluateAnchors(
  dimension: string,
  property: string,
  response: string,
  mustContain: readonly string[] = [],
  mustNotContain: readonly string[] = [],
): CriterionResult {
  const missingAnchors = mustContain.filter((anchor) => !containsAnchor(response, anchor));
  const forbiddenFound = mustNotContain.filter((anchor) => containsAnchor(response, anchor));
  const passed = missingAnchors.length === 0 && forbiddenFound.length === 0;
  const detail =
    !passed && missingAnchors.length > 0
      ? `missing: ${missingAnchors.join(", ")}`
      : !passed
        ? `forbidden found: ${forbiddenFound.join(", ")}`
        : "all anchors satisfied";
  return {
    dimension,
    property,
    status: passed ? "passed" : "failed",
    missingAnchors,
    forbiddenFound,
    detail,
  };
}

function loadScenarios(): AssistantScenario[] {
  return readdirSync(resolveScenariosDir())
    .filter((file) => file.endsWith(".yaml"))
    .sort()
    .map(
      (file) =>
        parse(readFileSync(path.join(resolveScenariosDir(), file), "utf8")) as AssistantScenario,
    );
}

function loadRubric(): AssistantRubric {
  return parse(readFileSync(rubricPath, "utf8")) as AssistantRubric;
}

async function evaluateScenario(scenario: AssistantScenario): Promise<ScenarioEvaluation> {
  const context =
    scenario.context.documents === undefined && scenario.context.systemInstructions === undefined
      ? {}
      : {
          ...(scenario.context.documents === undefined
            ? {}
            : { documents: scenario.context.documents }),
          ...(scenario.context.systemInstructions === undefined
            ? {}
            : { systemInstructions: scenario.context.systemInstructions }),
        };
  const result = await runAssistant(scenario.input, context);
  const criteria: CriterionResult[] = scenario.dimensions.map((dimension) => {
    const properties = scenario.expectedProperties.filter((entry) => entry.dimension === dimension);
    if (properties.length === 0) {
      return {
        dimension,
        property: "no expectedProperties defined for this dimension",
        status: "skipped",
        missingAnchors: [],
        forbiddenFound: [],
        detail: "skipped: dimension selected without expectedProperties",
      } satisfies CriterionResult;
    }
    const evaluated = properties.map((entry) =>
      evaluateAnchors(
        entry.dimension,
        entry.property,
        result.response,
        entry.mustContain,
        entry.mustNotContain,
      ),
    );
    const failed = evaluated.find((entry) => entry.status === "failed");
    if (failed !== undefined) {
      return failed;
    }
    const first = evaluated[0];
    if (first === undefined) {
      throw new Error(`No evaluated criteria for dimension '${dimension}'`);
    }
    return first;
  });
  const evaluated = criteria.filter((entry) => entry.status !== "skipped");
  return {
    scenarioId: scenario.id,
    severity: scenario.severity,
    input: scenario.input,
    response: result.response,
    fixtureId: result.metadata.fixtureId,
    runId: result.metadata.runId,
    criteria,
    // A scenario with zero evaluated criteria is never a pass: an empty
    // `evaluated` array would otherwise make `.every()` return true.
    passed: evaluated.length > 0 && evaluated.every((entry) => entry.status === "passed"),
  };
}

function summarize(evaluations: readonly ScenarioEvaluation[]): EvaluationReport["summary"] {
  const byDimension: Record<string, { pass: number; fail: number; skipped: number }> = {};
  for (const evaluation of evaluations) {
    for (const criterion of evaluation.criteria) {
      const entry = byDimension[criterion.dimension] ?? { pass: 0, fail: 0, skipped: 0 };
      if (criterion.status === "passed") {
        entry.pass += 1;
      } else if (criterion.status === "failed") {
        entry.fail += 1;
      } else {
        entry.skipped += 1;
      }
      byDimension[criterion.dimension] = entry;
    }
  }
  return {
    totalScenarios: evaluations.length,
    passed: evaluations.filter((entry) => entry.passed).length,
    failed: evaluations.filter((entry) => !entry.passed).length,
    byDimension,
  };
}

export async function evaluateAssistant(): Promise<EvaluationReport> {
  const scenarios = loadScenarios();
  const rubric = loadRubric();
  const known = new Set(rubric.dimensions.map((dimension) => dimension.name));
  for (const scenario of scenarios) {
    for (const dimension of scenario.dimensions) {
      if (!known.has(dimension)) {
        throw new Error(`Scenario '${scenario.id}' selects unknown dimension '${dimension}'`);
      }
    }
  }
  const evaluations: ScenarioEvaluation[] = [];
  for (const scenario of scenarios) {
    evaluations.push(await evaluateScenario(scenario));
  }
  return {
    subject: "assistant",
    mode: "deterministic",
    generatedAt: new Date().toISOString(),
    scenarios: evaluations,
    summary: summarize(evaluations),
  };
}
