/**
 * Minimal real HTTP consumer for the QA Lab API (Story 1.5).
 * Used by the Pact consumer test against the mock server and reusable
 * against the real provider. Plain fetch, no retries, no abstractions.
 */

export interface Item {
  readonly id: string;
  readonly name: string;
  readonly quantity: number;
}

async function readJson(response: Response, context: string): Promise<unknown> {
  if (!response.ok) {
    throw new Error(`${context} failed with status ${response.status.toString()}`);
  }
  const body: unknown = await response.json();
  return body;
}

export async function getItem(baseUrl: string, id: string): Promise<Item> {
  const response = await fetch(`${baseUrl}/items/${id}`);
  const body: unknown = await readJson(response, `GET /items/${id}`);
  return body as Item;
}

export async function createItem(
  baseUrl: string,
  input: { name: string; quantity: number },
): Promise<Item> {
  const response = await fetch(`${baseUrl}/items`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const body: unknown = await readJson(response, "POST /items");
  return body as Item;
}
