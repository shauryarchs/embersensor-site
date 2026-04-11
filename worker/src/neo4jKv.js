import { queryNeo4j } from "./neo4j.js";

// Generic KV-style helper backed by Neo4j singleton nodes. Each (label, id)
// pair maps to one (:Label {id}) node with a stringified `value` property
// and an `updatedAt` unix-millis timestamp. TTLs are NOT enforced by the
// store — callers pass a maxAgeMs when reading and we treat older rows as
// misses. Neo4j properties can't hold nested JS values, so we always
// JSON.stringify on write / JSON.parse on read.
//
// Labels are interpolated into the Cypher string (Neo4j can't parameterize
// labels), so we lock labels to an identifier regex to keep this safe even
// though today's callers only pass hard-coded constants.

const LABEL_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

function assertLabel(label) {
  if (!LABEL_RE.test(label)) {
    throw new Error(`Invalid Neo4j label: ${label}`);
  }
}

export async function kvPut(env, label, id, data) {
  assertLabel(label);
  const value = JSON.stringify(data);
  const cypher =
    `MERGE (n:${label} {id: $id}) SET n.value = $value, n.updatedAt = $ts RETURN n.updatedAt AS ts`;
  await queryNeo4j(env, cypher, { id, value, ts: Date.now() });
}

// Returns { data, updatedAt } on hit, or null on miss / stale / parse error.
// Pass maxAgeMs = 0 (or omit) to disable the staleness check.
export async function kvGet(env, label, id, maxAgeMs = 0) {
  assertLabel(label);
  const cypher =
    `MATCH (n:${label} {id: $id}) RETURN n.value AS value, n.updatedAt AS ts`;
  const results = await queryNeo4j(env, cypher, { id });
  const row = results?.[0]?.data?.[0]?.row;
  if (!row) return null;

  const [value, updatedAt] = row;
  if (typeof value !== "string") return null;

  if (maxAgeMs > 0 && typeof updatedAt === "number") {
    if (Date.now() - updatedAt > maxAgeMs) return null;
  }

  try {
    return { data: JSON.parse(value), updatedAt };
  } catch {
    return null;
  }
}
