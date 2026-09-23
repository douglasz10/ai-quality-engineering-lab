/**
 * Assistant-specific deterministic evaluation types (Story 2.3).
 * Mirrors the Story 2.2 YAML shape. No cross-epic generalization yet.
 */

export type CriterionStatus = "passed" | "failed" | "skipped";

/** Report-only labels (never influence verdicts). */
export type ScenarioVariant = "acceptable" | "violation-demo";
export type ResponseSource = "assistant" | "recorded";

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
  /**
   * Story 2.4: deliberately unsupported/unauthorized behavior cannot be
   * produced by the deterministic Assistant, so violation scenarios carry an
   * inline recorded response evaluated by the same anchor criteria.
   */
  readonly recordedResponse?: string;
  /** Report-only: "acceptable" (default) or "violation-demo". */
  readonly variant?: ScenarioVariant;
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
  /** Report-only: which variant was evaluated. */
  readonly variant: ScenarioVariant;
  /** Report-only: response origin (invoked Assistant or recorded response). */
  readonly responseSource: ResponseSource;
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
