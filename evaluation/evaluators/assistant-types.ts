/**
 * Assistant-specific deterministic evaluation types (Story 2.3).
 * Mirrors the Story 2.2 YAML shape. No cross-epic generalization yet.
 */

import type { LiveFailureCategory, LiveProviderMetadata } from "../../apps/assistant/src/types.ts";

export type CriterionStatus = "passed" | "failed" | "skipped";

/** Report-only labels (never influence verdicts). */
export type ScenarioVariant = "acceptable" | "violation-demo";
/**
 * Response origin. "live" (Story 2.6) marks a response observed from the live
 * provider; it is evaluated by the same deterministic criteria as the others.
 */
export type ResponseSource = "assistant" | "recorded" | "live";

/**
 * Story 2.5: a controlled observed response for the same scenario input,
 * context, dimensions and criteria. Variants differ only in permitted wording,
 * structure, or level of detail; a variant that violates the property is
 * expected to fail.
 */
export interface ScenarioResponseVariant {
  readonly variantRef: string;
  readonly response: string;
  /** Report-only label; defaults to the scenario variant (or "acceptable"). */
  readonly variant?: ScenarioVariant;
}

export interface ScenarioExpectedProperty {
  readonly dimension: string;
  readonly property: string;
  /** Every listed literal must be present (case-insensitive substring). */
  readonly mustContain?: readonly string[];
  /**
   * Story 2.6: at least ONE listed literal must be present. An additional
   * rule of the same criterion - never an alternative to mustContain or
   * mustNotContain. Still literal, case-insensitive and deterministic.
   */
  readonly mustContainAny?: readonly string[];
  /** None of the listed literals may be present. */
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
  /**
   * Story 2.5: multiple controlled responses for the same scenario. Each
   * variant is evaluated independently with this scenario dimensions and
   * criteria, which remain the sole authority for acceptance.
   * Story 2.6: live scenarios must NOT use responseVariants - one live
   * scenario performs exactly one provider call.
   */
  readonly responseVariants?: readonly ScenarioResponseVariant[];
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
  /** Story 2.6: set only when the criterion declares mustContainAny. */
  readonly unmatchedAnyAnchors?: readonly string[];
  readonly detail: string;
}

export interface ScenarioEvaluation {
  readonly scenarioId: string;
  /** Story 2.5: traceability to the evaluated response variant. */
  readonly variantRef: string;
  readonly severity: string;
  readonly input: string;
  readonly response: string;
  readonly fixtureId: string;
  readonly runId: string;
  /** Report-only: which variant was evaluated. */
  readonly variant: ScenarioVariant;
  /** Report-only: response origin (invoked Assistant, recorded, or live). */
  readonly responseSource: ResponseSource;
  /** Story 2.6: non-sensitive live execution metadata (live rows only). */
  readonly live?: LiveProviderMetadata;
  readonly criteria: readonly CriterionResult[];
  readonly passed: boolean;
}

export interface DimensionSummary {
  readonly pass: number;
  readonly fail: number;
  readonly skipped: number;
}

/**
 * Story 2.6: live run status.
 * `unavailable` means live evaluation was NOT executed because configuration
 * was missing; it exits 0 but is never a pass.
 */
export type LiveEvaluationStatus = "passed" | "failed" | "unavailable";

/** Story 2.6: a scenario whose live call failed before any evaluation. */
export interface ScenarioExecutionFailure {
  readonly scenarioId: string;
  readonly category: LiveFailureCategory;
  readonly detail: string;
}

export interface EvaluationReport {
  readonly subject: string;
  readonly mode: string;
  readonly generatedAt: string;
  /** One row per (scenario, response variant); a scenario yields >= 1 row. */
  readonly scenarios: readonly ScenarioEvaluation[];
  readonly summary: {
    /** Logical scenarios (a scenario with N variants counts once). */
    readonly totalScenarios: number;
    /** Scenarios where every evaluated variant passed. */
    readonly passed: number;
    /** Scenarios with at least one failing variant. */
    readonly failed: number;
    /** Evaluated variant rows (>= totalScenarios). */
    readonly totalVariants: number;
    readonly byDimension: Record<string, DimensionSummary>;
  };
  /** Story 2.6: live runs only; omitted for deterministic reports. */
  readonly status?: LiveEvaluationStatus;
  /** Story 2.6: scenarios that could not be executed (provider failures). */
  readonly executionFailures?: readonly ScenarioExecutionFailure[];
  /** Story 2.6: why live evaluation was not attempted (status unavailable). */
  readonly unavailableReasons?: readonly string[];
  /** Story 2.6: non-sensitive live execution metadata. */
  readonly live?: LiveProviderMetadata;
}
