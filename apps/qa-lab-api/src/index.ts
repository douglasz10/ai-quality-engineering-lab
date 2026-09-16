import { buildApp, resolvePort } from "./app.ts";

const app = buildApp();
const port = resolvePort();

try {
  await app.listen({ port, host: "127.0.0.1" });
  process.stdout.write(`qa-lab-api listening on http://127.0.0.1:${String(port)}\n`);
} catch (error) {
  process.stderr.write(`qa-lab-api failed to start: ${String(error)}\n`);
  process.exitCode = 1;
}
