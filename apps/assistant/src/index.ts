import { getControlledContext, getFixtureInputs, runAssistant } from "./assistant.ts";

/**
 * Thin CLI: no business logic. Invokes runAssistant and prints the
 * provider-neutral JSON result. Usage:
 *   npm run assistant:start -- "What is the current stock level for Lab Notebook?"
 * With no argument, runs the first deterministic fixture input.
 */
const input = process.argv[2] ?? getFixtureInputs()[0] ?? "";
const result = await runAssistant(input, getControlledContext());
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
