/**
 * Shared domain and error shapes for the QA Lab API (Story 1.2).
 * Kept in one place so routes, validation, and the OpenAPI document
 * describe exactly the same behavior. No test or reporting imports.
 */

export const QUANTITY_MIN = 1;
export const QUANTITY_MAX = 100;

export interface Item {
  readonly id: string;
  readonly name: string;
  readonly quantity: number;
}

export interface CreateItemInput {
  readonly name: unknown;
  readonly quantity: unknown;
}

export type ApiErrorCode = "VALIDATION_ERROR" | "NOT_FOUND";

export interface ApiError {
  readonly error: ApiErrorCode;
  readonly message: string;
}

export function validationError(message: string): ApiError {
  return { error: "VALIDATION_ERROR", message };
}

export function notFound(message: string): ApiError {
  return { error: "NOT_FOUND", message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Validate a POST /items payload. Returns the sanitized item fields or a
 * stable validation error. Unknown extra fields are ignored by design.
 */
export function validateCreateItem(
  body: unknown,
): { ok: true; name: string; quantity: number } | { ok: false; error: ApiError } {
  if (!isRecord(body)) {
    return { ok: false, error: validationError("Request body must be a JSON object.") };
  }
  const { name, quantity } = body;
  if (typeof name !== "string" || name.trim() === "") {
    return {
      ok: false,
      error: validationError("Field 'name' is required and must be a non-empty string."),
    };
  }
  if (typeof quantity !== "number" || !Number.isInteger(quantity)) {
    return {
      ok: false,
      error: validationError("Field 'quantity' is required and must be an integer."),
    };
  }
  if (quantity < QUANTITY_MIN || quantity > QUANTITY_MAX) {
    return {
      ok: false,
      error: validationError(
        `Field 'quantity' must be between ${QUANTITY_MIN.toString()} and ${QUANTITY_MAX.toString()}.`,
      ),
    };
  }
  return { ok: true, name: name.trim(), quantity };
}
