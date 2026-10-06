import { readFileSync, readdirSync } from "node:fs";
import { parse } from "yaml";
import path from "node:path";
import { runAssistant } from "../../apps/assistant/src/assistant.ts";
import type { AssistantContext } from "../../apps/assistant/src/assistant.ts";
import { repoRoot } from "./report-paths.ts";
import type {
  AssistantRubric,
  AssistantScenario,
  CriterionResult,
  EvaluationReport,
  ResponseSource,
  ScenarioEvaluation,
  ScenarioVariant,
} from "./assistant-types.ts";

const defaultScenariosDir = path.join(repoRoot, "evaluation", "scenarios", "assistant");
const rubricPath = path.join(repoRoot, "evaluation", "rubrics", "assistant.yaml");

/**
 * Scenario directory override. Used only to demonstrate a controlled failing
 * evaluation against a temporary copy; the committed scenarios stay the
 * default and are never modified by the harness. Story 2.6 reuses the same
 * mechanism to point the live command at evaluation/scenarios/assistant-live.
 */
export function resolveScenariosDir(): string {
  const override = process.env["AI_EVAL_SCENARIOS_DIR"];
  return override === undefined ? defaultScenariosDir : path.resolve(repoRoot, override);
}

function containsAnchor(response: string, anchor: string): boolean {
  return response.toLowerCase().includes(anchor.toLowerCase());
}

/**
 * Deterministic literal anchor evaluation (case-insensitive substring):
 * every mustContain literal present, at least one mustContainAny literal
 * present (when declared), and no mustNotContain literal present.
 * No regex, no fuzzy matching, no embeddings, no scoring, no LLM judge.
 */
function evaluateAnchors(
  dimension: string,
  property: string,
  response: string,
  mustContain: readonly string[] = [],
  mustNotContain: readonly string[] = [],
  mustContainAny: readonly string[] = [],
): CriterionResult {
  const missingAnchors = mustContain.filter((anchor) => !containsAnchor(response, anchor));
  const unmatchedAnyAnchors =
    mustContainAny.length > 0 && !mustContainAny.some((anchor) => containsAnchor(response, anchor))
      ? [...mustContainAny]
      : [];
  const forbiddenFound = mustNotContain.filter((anchor) => containsAnchor(response, anchor));
  const passed =
    missingAnchors.length === 0 && unmatchedAnyAnchors.length === 0 && forbiddenFound.length === 0;
  const detail =
    !passed && missingAnchors.length > 0
      ? `missing: ${missingAnchors.join(", ")}`
      : !passed && unmatchedAnyAnchors.length > 0
        ? `no acceptable anchor found: ${unmatchedAnyAnchors.join(", ")}`
        : !passed
          ? `forbidden found: ${forbiddenFound.join(", ")}`
          : "all anchors satisfied";
  return {
    dimension,
    property,
    status: passed ? "passed" : "failed",
    missingAnchors,
    forbiddenFound,
    ...(unmatchedAnyAnchors.length === 0 ? {} : { unmatchedAnyAnchors }),
    detail,
  };
}

export function loadScenarios(dir: string = resolveScenariosDir()): AssistantScenario[] {
  return readdirSync(dir)
    .filter((file) => file.endsWith(".yaml"))
    .sort()
    .map((file) => parse(readFileSync(path.join(dir, file), "utf8")) as AssistantScenario);
}

export function loadRubric(): AssistantRubric {
  return parse(readFileSync(rubricPath, "utf8")) as AssistantRubric;
}

/** Every dimension selected by a scenario must exist in the rubric. */
export function assertKnownDimensions(
  scenarios: readonly AssistantScenario[],
  rubric: AssistantRubric,
): void {
  const known = new Set(rubric.dimensions.map((dimension) => dimension.name));
  for (const scenario of scenarios) {
    for (const dimension of scenario.dimensions) {
      if (!known.has(dimension)) {
        throw new Error(`Scenario '${scenario.id}' selects unknown dimension '${dimension}'`);
      }
    }
  }
}

/** Scenario context as a provider-neutral AssistantContext. */
export function resolveScenarioContext(scenario: AssistantScenario): AssistantContext {
  if (
    scenario.context.documents === undefined &&
    scenario.context.systemInstructions === undefined
  ) {
    return {};
  }
  return {
    ...(scenario.context.documents === undefined ? {} : { documents: scenario.context.documents }),
    ...(scenario.context.systemInstructions === undefined
      ? {}
      : { systemInstructions: scenario.context.systemInstructions }),
  };
}
interface ResolvedResponse {
  readonly variantRef: string;
  readonly response: string;
  readonly variant: ScenarioVariant;
  readonly source: ResponseSource;
  readonly fixtureId: string;
  readonly runId: string;
}

/**
 * Resolve the response(s) to evaluate for one scenario:
 * controlled response variants (Story 2.5) > single recorded response
 * (Story 2.4) > the deterministic Assistant via runAssistant().
 * Every resolved response is evaluated with the same scenario criteria.
 */
async function resolveResponses(
  scenario: AssistantScenario,
  context: AssistantContext,
): Promise<ResolvedResponse[]> {
  const variants = scenario.responseVariants;
  if (variants !== undefined && variants.length > 0) {
    return variants.map((entry) => ({
      variantRef: entry.variantRef,
      response: entry.response,
      variant: entry.variant ?? scenario.variant ?? "acceptable",
      source: "recorded" as const,
      fixtureId: "recorded-response",
      runId: "not-executed",
    }));
  }

  const recorded = scenario.recordedResponse;
  if (recorded !== undefined) {
    return [
      {
        variantRef: "recorded",
        response: recorded,
        variant: scenario.variant ?? "acceptable",
        source: "recorded",
        fixtureId: "recorded-response",
        runId: "not-executed",
      },
    ];
  }

  const result = await runAssistant(scenario.input, context);
  return [
    {
      variantRef: "assistant-run",
      response: result.response,
      variant: scenario.variant ?? "acceptable",
      source: "assistant",
      fixtureId: result.metadata.fixtureId,
      runId: result.metadata.runId,
    },
  ];
}

/** Deterministic anchor evaluation of one observed response. */
export function evaluateCriteria(scenario: AssistantScenario, response: string): CriterionResult[] {
  return scenario.dimensions.map((dimension) => {
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
        response,
        entry.mustContain,
        entry.mustNotContain,
        entry.mustContainAny,
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
}
/** Build one evaluated row per response resolved for the scenario. */
export async function evaluateScenario(scenario: AssistantScenario): Promise<ScenarioEvaluation[]> {
  const context = resolveScenarioContext(scenario);
  const resolved = await resolveResponses(scenario, context);
  // Each response variant is evaluated independently with the same criteria;
  // no variant result influences another variant.
  return resolved.map((entry) => {
    const criteria = evaluateCriteria(scenario, entry.response);
    const evaluated = criteria.filter((criterion) => criterion.status !== "skipped");
    return {
      scenarioId: scenario.id,
      variantRef: entry.variantRef,
      severity: scenario.severity,
      input: scenario.input,
      response: entry.response,
      fixtureId: entry.fixtureId,
      runId: entry.runId,
      variant: entry.variant,
      responseSource: entry.source,
      criteria,
      // A scenario variant with zero evaluated criteria is never a pass:
      // an empty `evaluated` array would otherwise make `.every()` return true.
      passed: evaluated.length > 0 && evaluated.every((criterion) => criterion.status === "passed"),
    } satisfies ScenarioEvaluation;
  });
}

export function summarize(evaluations: readonly ScenarioEvaluation[]): EvaluationReport["summary"] {
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
  // Story 2.5: a scenario is one logical test case; its response variants are
  // evaluated rows. A scenario is reported as failed when any variant failed.
  const scenarioIds = [...new Set(evaluations.map((entry) => entry.scenarioId))];
  const failedScenarioIds = new Set(
    evaluations.filter((entry) => !entry.passed).map((entry) => entry.scenarioId),
  );
  return {
    totalScenarios: scenarioIds.length,
    passed: scenarioIds.length - failedScenarioIds.size,
    failed: failedScenarioIds.size,
    totalVariants: evaluations.length,
    byDimension,
  };
}

/** Default deterministic evaluation: scenarios -> Assistant -> criteria. */
export async function evaluateAssistant(): Promise<EvaluationReport> {
  const scenarios = loadScenarios();
  const rubric = loadRubric();
  assertKnownDimensions(scenarios, rubric);
  const evaluations: ScenarioEvaluation[] = [];
  for (const scenario of scenarios) {
    evaluations.push(...(await evaluateScenario(scenario)));
  }
  return {
    subject: "assistant",
    mode: "deterministic",
    generatedAt: new Date().toISOString(),
    scenarios: evaluations,
    summary: summarize(evaluations),
  };
}
