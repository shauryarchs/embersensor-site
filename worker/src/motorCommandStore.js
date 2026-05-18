import { queryNeo4j } from "./neo4j.js";

// Singleton (:MotorCommand {id: "latest"}) node mirroring the last
// command the website queued for the device. The device polls
// GET /api/motor/command?since=<lastSeqAck> and skips commands it has
// already executed.
//
// `seq` is a monotonic counter incremented atomically by Neo4j on each
// write. The caller must NOT pass `seq` in $props — we materialize the
// next value, then run the destructive `SET c = $props`, then re-set
// `seq` from the materialized value (because `SET c = $props` would
// otherwise clobber the existing seq before we read it). Doing the WITH
// before the SET is the trick that keeps this atomic in a single
// statement, which is the only kind of transaction Neo4j's HTTP API
// exposes per request.

const LATEST_ID = "latest";

const VALID_KINDS = new Set([
  "enterMode",
  "rehome",
  "zeroPan",
  "zeroTilt",
  "setSliderSpeed",
  "nudgePan",
  "nudgeTilt",
]);

const VALID_MODES = new Set([
  "menu",
  "motor1",
  "motor2",
  "motor3",
  "allmotors",
]);

// Returns { ok: true, props } or { ok: false, error }. Mirrors the
// "drop non-primitives" pattern from motorStore so a stray nested field
// can't break the write, but also validates the schema since the
// command surface is more dangerous than passive state.
export function validateAndBuildProps(body) {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Body must be a JSON object" };
  }
  const kind = body.kind;
  if (typeof kind !== "string" || !VALID_KINDS.has(kind)) {
    return { ok: false, error: `Unknown kind: ${JSON.stringify(kind)}` };
  }

  const props = { id: LATEST_ID, kind, requestedAt: Date.now() };

  if (kind === "enterMode") {
    const mode = body.mode;
    if (typeof mode !== "string" || !VALID_MODES.has(mode)) {
      return { ok: false, error: `Unknown mode: ${JSON.stringify(mode)}` };
    }
    props.mode = mode;
  } else if (kind === "setSliderSpeed") {
    const speed = body.speed;
    if (typeof speed !== "number" || !Number.isFinite(speed)) {
      return { ok: false, error: "speed must be a finite number" };
    }
    // Signed range matches Encoder::kRange on the device. Negative
    // values reverse direction in Motor 1/2/3 modes; magnitude is used
    // in All Motors mode (sign ignored there by the device handler).
    const clamped = Math.max(-20, Math.min(20, Math.round(speed)));
    props.speed = clamped;
  } else if (kind === "nudgePan" || kind === "nudgeTilt") {
    const deltaDeg = body.deltaDeg;
    if (typeof deltaDeg !== "number" || !Number.isFinite(deltaDeg)) {
      return { ok: false, error: "deltaDeg must be a finite number" };
    }
    // ±360 is well beyond any single nudge a user would issue from
    // the calibration UI (±10° is the max button). The clamp just
    // guards against pathological values being persisted.
    const clamped = Math.max(-360, Math.min(360, Math.round(deltaDeg)));
    props.deltaDeg = clamped;
  }
  // rehome / zeroPan / zeroTilt take no args.

  return { ok: true, props };
}

export async function writeLatestMotorCommand(env, props) {
  // 1. MERGE finds-or-creates the singleton.
  // 2. WITH materializes the next seq BEFORE the destructive SET.
  // 3. SET c = $props replaces the property bag with the validated
  //    command, dropping any stale fields from the previous command.
  // 4. SET c.seq = newSeq restores the counter the destructive SET
  //    just blew away.
  const cypher = `
    MERGE (c:MotorCommand {id: $id})
    WITH c, coalesce(c.seq, 0) + 1 AS newSeq
    SET c = $props
    SET c.seq = newSeq
    RETURN c.seq AS seq
  `;
  const results = await queryNeo4j(env, cypher, { id: LATEST_ID, props });
  const seq = results?.[0]?.data?.[0]?.row?.[0];
  return typeof seq === "number" ? seq : null;
}

// Returns the latest command + seq, or null if there's nothing newer
// than `sinceSeq`. Pass sinceSeq = 0 to always return the current
// command (if any).
export async function readLatestMotorCommand(env, sinceSeq = 0) {
  const cypher = "MATCH (c:MotorCommand {id: $id}) RETURN c";
  const results = await queryNeo4j(env, cypher, { id: LATEST_ID });
  const row = results?.[0]?.data?.[0]?.row?.[0];
  if (!row || typeof row !== "object") return null;
  if (typeof row.seq !== "number" || row.seq <= sinceSeq) return null;
  return row;
}
