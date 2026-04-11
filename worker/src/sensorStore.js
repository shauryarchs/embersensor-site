import { queryNeo4j } from "./neo4j.js";

const LATEST_ID = "latest";

// Neo4j can only store primitive values (and arrays of primitives) as node
// properties. Flatten to primitives and drop anything else so a stray nested
// field in a sensor payload can't blow up the write.
function toProps(data) {
  const props = {};
  if (data && typeof data === "object") {
    for (const [k, v] of Object.entries(data)) {
      if (v === null || v === undefined) continue;
      const t = typeof v;
      if (t === "number" || t === "string" || t === "boolean") {
        props[k] = v;
      }
    }
  }
  props.id = LATEST_ID;
  props.timestamp = Date.now();
  return props;
}

// Upsert a single (:SensorReading {id: "latest"}) node. SET r = $props
// fully replaces the property bag, so fields that disappear from the
// payload are cleared instead of going stale.
export async function writeLatestSensorReading(env, data) {
  const props = toProps(data);
  const cypher =
    "MERGE (r:SensorReading {id: $id}) SET r = $props RETURN r.timestamp AS ts";
  await queryNeo4j(env, cypher, { id: LATEST_ID, props });
  return props.timestamp;
}

export async function readLatestSensorReading(env) {
  const cypher = "MATCH (r:SensorReading {id: $id}) RETURN r";
  const results = await queryNeo4j(env, cypher, { id: LATEST_ID });
  const row = results?.[0]?.data?.[0]?.row?.[0];
  if (!row || typeof row !== "object") return {};
  return row;
}
