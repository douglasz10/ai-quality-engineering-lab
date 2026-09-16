import { fastify, type FastifyInstance } from "fastify";
import {
  QUANTITY_MAX,
  QUANTITY_MIN,
  notFound,
  validateCreateItem,
  validationError,
  type Item,
} from "./items.ts";

const DEFAULT_PORT = 3001;

function parsePort(value: string | undefined): number {
  if (value === undefined || value === "") {
    return DEFAULT_PORT;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    throw new Error(`Invalid QA_LAB_API_PORT value: ${JSON.stringify(value)}`);
  }
  return parsed;
}

export function resolvePort(): number {
  return parsePort(process.env["QA_LAB_API_PORT"]);
}

/**
 * Build the Fastify application. State is in-memory only: restarting the
 * process resets it. There is intentionally no /reset endpoint.
 */
export function buildApp(): FastifyInstance {
  const app = fastify({ logger: false });
  const store = new Map<string, Item>();
  let nextId = 1;

  app.get("/health", () => ({ status: "ok" }));

  app.get("/items", () => ({ items: [...store.values()] }));

  app.get("/items/:id", (request, reply) => {
    const { id } = request.params as { id: string };
    const item = store.get(id);
    if (item === undefined) {
      return reply.code(404).send(notFound(`Item '${id}' was not found.`));
    }
    return item;
  });

  app.post("/items", (request, reply) => {
    const result = validateCreateItem(request.body);
    if (!result.ok) {
      return reply.code(400).send(result.error);
    }
    const item: Item = {
      id: `item-${String(nextId).padStart(4, "0")}`,
      name: result.name,
      quantity: result.quantity,
    };
    nextId += 1;
    store.set(item.id, item);
    return reply.code(201).send(item);
  });

  // Malformed JSON or unknown routes must produce documented errors, never
  // crash the process.
  app.setErrorHandler((error: unknown, _request, reply) => {
    const statusCode =
      typeof error === "object" &&
      error !== null &&
      "statusCode" in error &&
      typeof error.statusCode === "number" &&
      error.statusCode >= 400 &&
      error.statusCode < 500
        ? error.statusCode
        : 500;
    if (statusCode === 404) {
      return reply.code(404).send(notFound("Route was not found."));
    }
    if (statusCode === 400) {
      return reply.code(400).send(validationError("Request could not be parsed or validated."));
    }
    return reply.code(500).send({ error: "INTERNAL_ERROR", message: "Unexpected server error." });
  });

  app.setNotFoundHandler((_request, reply) => {
    return reply.code(404).send(notFound("Route was not found."));
  });

  return app;
}

export { QUANTITY_MAX, QUANTITY_MIN };
