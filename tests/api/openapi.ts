import { Ajv } from "ajv";
import type { AnySchema, ValidateFunction } from "ajv";
import { parse } from "yaml";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

export type ResponseSchemaName = "Health" | "ItemList" | "Item" | "ValidationError" | "NotFound";

interface OpenApiDocument {
  readonly components?: {
    readonly schemas?: Record<string, unknown>;
  };
}

const SCHEMA_NAMES: readonly ResponseSchemaName[] = [
  "Health",
  "ItemList",
  "Item",
  "ValidationError",
  "NotFound",
];

const specPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "specs",
  "openapi",
  "qa-lab-api.yaml",
);

function loadSchemas(): Record<ResponseSchemaName, unknown> {
  const document = parse(readFileSync(specPath, "utf8")) as OpenApiDocument;
  const schemas = document.components?.schemas;
  if (schemas === undefined) {
    throw new Error(`No components.schemas found in ${specPath}`);
  }
  const result = {} as Record<ResponseSchemaName, unknown>;
  for (const name of SCHEMA_NAMES) {
    const schema = schemas[name];
    if (schema === undefined) {
      throw new Error(`Missing schema '${name}' in ${specPath}`);
    }
    result[name] = schema;
  }
  return result;
}

const ajv = new Ajv({ strict: true, allErrors: true });
ajv.addKeyword("example");
const schemas = loadSchemas();
for (const [name, schema] of Object.entries(schemas)) {
  ajv.addSchema(schema as AnySchema, `#/components/schemas/${name}`);
}
const validators = {} as Record<ResponseSchemaName, ValidateFunction>;
for (const name of SCHEMA_NAMES) {
  validators[name] = ajv.getSchema(`#/components/schemas/${name}`) as ValidateFunction;
}

export function getValidator(name: ResponseSchemaName): ValidateFunction {
  return validators[name];
}

export function getSchemaNames(): readonly ResponseSchemaName[] {
  return SCHEMA_NAMES;
}

/**
 * Assert a response body matches its OpenAPI schema. On failure the thrown
 * error carries method/path/status/body plus Ajv keyword details so a plain
 * node:test run stays diagnosable without extra reporting infrastructure.
 */
export function assertValid(schemaName: ResponseSchemaName, body: unknown, context: string): void {
  const validate = validators[schemaName];
  if (validate(body)) {
    return;
  }
  const details = (validate.errors ?? [])
    .map((e) => `${e.instancePath || "/"} ${e.keyword} ${e.message ?? ""}`.trim())
    .join("; ");
  throw new Error(
    `OpenAPI schema violation [${schemaName}] ${context}: body=${JSON.stringify(body)} errors=${details}`,
  );
}
