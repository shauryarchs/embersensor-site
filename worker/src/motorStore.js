import { queryNeo4j } from "./neo4j.js";

// Singleton (:MotorState {id: "latest"}) node that mirrors the live UI
// state of the sprinkler controller (current mode, slider mm, pan/tilt
// degrees, encoder dial, limit switch). The device pushes whatever
// fields it has; we drop non-primitives the same way sensorStore.js
// does so a stray nested field can't blow up the write.

const LATEST_ID = "latest";

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
  props.updatedAt = Date.now();
  return props;
}

// Upsert the singleton. SET s = $props fully replaces the property bag,
// so fields that disappear from the payload are cleared instead of
// going stale.
export async function writeLatestMotorState(env, data) {
  const props = toProps(data);
  const cypher =
    "MERGE (s:MotorState {id: $id}) SET s = $props RETURN s.updatedAt AS ts";
  await queryNeo4j(env, cypher, { id: LATEST_ID, props });
  return props.updatedAt;
}

export async function readLatestMotorState(env) {
  const cypher = "MATCH (s:MotorState {id: $id}) RETURN s";
  const results = await queryNeo4j(env, cypher, { id: LATEST_ID });
  const row = results?.[0]?.data?.[0]?.row?.[0];
  if (!row || typeof row !== "object") return null;
  return row;
}
