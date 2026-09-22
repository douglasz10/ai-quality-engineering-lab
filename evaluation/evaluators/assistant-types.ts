/**
 * Assistant-specific deterministic evaluation types (Story 2.3).
 * Mirrors the Story 2.2 YAML shape. No cross-epic generalization yet.
 */

export type CriterionStatus = "passed" | "failed" | "skipped";

export interface ScenarioExpectedProperty {
  readonly dimension: string;
  readonly property: string;
  readonly mustContain?: readonly string[];
  readonly mustNotContain?: readonly string[];
}

export interface AssistantScenario {
  readonly id: string;
  readonly subject: string;
  readonly objective: string;
  readonly input: string;
  readonly context: {
    readonly documents?: readonly string[];
    readonly systemInstructions?: string;
  };
  readonly expectedProperties: readonly ScenarioExpectedProperty[];
  readonly mode: string;
  readonly dimensions: readonly string[];
  readonly severity: string;
  readonly tags?: readonly string[];
}

export interface RubricDimension {
  readonly name: string;
  readonly definition: string;
  readonly passCriteria: readonly string[];
  readonly failSignals: readonly string[];
}

export interface AssistantRubric {
  readonly id: string;
  readonly subject: string;
  readonly version: number;
  readonly dimensions: readonly RubricDimension[];
}

export interface CriterionResult {
  readonly dimension: string;
  readonly property: string;
  readonly status: CriterionStatus;
  readonly missingAnchors: readonly string[];
  readonly forbiddenFound: readonly string[];
  readonly detail: string;
}

export interface ScenarioEvaluation {
  readonly scenarioId: string;
  readonly severity: string;
  readonly input: string;
  readonly response: string;
  readonly fixtureId: string;
  readonly runId: string;
  readonly criteria: readonly CriterionResult[];
  readonly passed: boolean;
}

export interface DimensionSummary {
  readonly pass: number;
  readonly fail: number;
  readonly skipped: number;
}

export interface EvaluationReport {
  readonly subject: string;
  readonly mode: string;
  readonly generatedAt: string;
  readonly scenarios: readonly ScenarioEvaluation[];
  readonly summary: {
    readonly totalScenarios: number;
    readonly passed: number;
    readonly failed: number;
    readonly byDimension: Record<string, DimensionSummary>;
  };
}
