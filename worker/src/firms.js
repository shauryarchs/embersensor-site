import {
  FIRMS_CACHE_KEY,
  FIRMS_CACHE_TTL_SECONDS,
  FIRMS_AREA_HALF_DEG,
  HOME_LAT,
  HOME_LON
} from "./config.js";

// Only the FIRMS columns we actually use downstream.
// Output object field names are kept identical to the previous parseCSV output
// so /api/fires and /api/status response shapes are unchanged.
const KEPT_FIELDS = [
  "latitude",
  "longitude",
  "bright_ti4",
  "confidence",
  "satellite",
  "acq_date",
  "acq_time"
];

function buildFirmsUrl(apiKey) {
  // FIRMS area format is W,S,E,N
  const w = HOME_LON - FIRMS_AREA_HALF_DEG;
  const s = HOME_LAT - FIRMS_AREA_HALF_DEG;
  const e = HOME_LON + FIRMS_AREA_HALF_DEG;
  const n = HOME_LAT + FIRMS_AREA_HALF_DEG;
  return `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${apiKey}/VIIRS_NOAA20_NRT/${w},${s},${e},${n}/2`;
}

// Lean single-pass CSV → array of plain objects with only the kept fields.
// Avoids per-cell trim() loops and per-row spread/Object.fromEntries.
function parseFirmsCsv(csv) {
  if (!csv) return [];
  const newline = csv.indexOf("\n");
  if (newline === -1) return [];

  const headerLine = csv.slice(0, newline);
  const headers = headerLine.split(",");

  // Map kept-field name → column index in this CSV
  const colIndex = {};
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i].trim();
    if (KEPT_FIELDS.includes(h)) colIndex[h] = i;
  }

  const latCol = colIndex.latitude;
  const lonCol = colIndex.longitude;
  if (latCol == null || lonCol == null) return [];

  const out = [];
  let start = newline + 1;
  const len = csv.length;

  while (start < len) {
    let end = csv.indexOf("\n", start);
    if (end === -1) end = len;
    if (end > start) {
      const line = csv.charCodeAt(end - 1) === 13 /* \r */
        ? csv.slice(start, end - 1)
        : csv.slice(start, end);

      if (line.length > 0) {
        const cells = line.split(",");
        const lat = parseFloat(cells[latCol]);
        const lon = parseFloat(cells[lonCol]);
        if (!Number.isNaN(lat) && !Number.isNaN(lon)) {
          const row = { latitude: lat, longitude: lon };
          // Pull remaining kept fields if present
          if (colIndex.bright_ti4 != null) row.bright_ti4 = cells[colIndex.bright_ti4] ?? null;
          if (colIndex.confidence != null) row.confidence = cells[colIndex.confidence] ?? null;
          if (colIndex.satellite != null) row.satellite = cells[colIndex.satellite] ?? null;
          if (colIndex.acq_date != null) row.acq_date = cells[colIndex.acq_date] ?? null;
          if (colIndex.acq_time != null) row.acq_time = cells[colIndex.acq_time] ?? null;
          out.push(row);
        }
      }
    }
    start = end + 1;
  }

  return out;
}

async function fetchAndParseFromFirms(env) {
  const apiKey = env.FIRMS_API_KEY;
  if (!apiKey) throw new Error("FIRMS_API_KEY binding is missing");

  const response = await fetch(buildFirmsUrl(apiKey));
  if (!response.ok) {
    throw new Error(`Failed to fetch FIRMS data: ${response.status}`);
  }
  const text = await response.text();
  return parseFirmsCsv(text);
}

async function writeCache(env, fires) {
  if (env.FIRMS_CACHE && typeof env.FIRMS_CACHE.put === "function") {
    try {
      await env.FIRMS_CACHE.put(FIRMS_CACHE_KEY, JSON.stringify(fires), {
        expirationTtl: FIRMS_CACHE_TTL_SECONDS
      });
    } catch (_) {}
  }
}

/**
 * Returns { fires, source } where `fires` is a pre-parsed array of objects.
 *
 * Request-path contract: this function MUST NOT do a live FIRMS fetch+parse
 * unless explicitly told to (forceRefresh=true). The user-facing /api/status
 * and /api/fires handlers were tripping Cloudflare error 1102 (Worker
 * exceeded resource limits) because a cache miss made them block on the
 * heavy fetch+parse inline. Now:
 *
 *   - Cache hit: JSON.parse cached array → return immediately.
 *   - Cache miss (request path): return { fires: [], source: "cache-miss" }
 *     immediately and schedule a background refresh via ctx.waitUntil so the
 *     NEXT request is warm. The user gets a slightly degraded response once
 *     (no fires) instead of a 1102 error page.
 *   - forceRefresh=true (cron, /api/refresh-firms): do the full fetch+parse
 *     synchronously and update KV. These code paths have generous CPU
 *     budgets so they won't trip 1102.
 *
 * `ctx` is optional but should be passed from the request handler so the
 * background refresh can outlive the response.
 */
export async function fetchFirmsData(env, forceRefresh = false, ctx = null) {
  const hasCache = env.FIRMS_CACHE && typeof env.FIRMS_CACHE.get === "function";

  if (!forceRefresh && hasCache) {
    const cached = await env.FIRMS_CACHE.get(FIRMS_CACHE_KEY);
    if (cached) {
      try {
        return { fires: JSON.parse(cached), source: "kv-cache" };
      } catch {
        // fall through — corrupt cache value, treat as miss
      }
    }
  }

  if (!forceRefresh) {
    // Request-path miss: never block. Kick off a background refresh.
    if (ctx && typeof ctx.waitUntil === "function") {
      ctx.waitUntil(
        fetchAndParseFromFirms(env)
          .then(fires => writeCache(env, fires))
          .catch(() => {})
      );
    }
    return { fires: [], source: "cache-miss" };
  }

  // Explicit refresh path (cron, /api/refresh-firms): do the work.
  const fires = await fetchAndParseFromFirms(env);
  await writeCache(env, fires);
  return { fires, source: "live-fetch" };
}

export async function refreshFirmsCache(env) {
  const hasCache = env.FIRMS_CACHE && typeof env.FIRMS_CACHE.put === "function";
  if (!hasCache) {
    return new Response("FIRMS_CACHE binding is missing", { status: 500 });
  }

  try {
    const fires = await fetchAndParseFromFirms(env);
    await env.FIRMS_CACHE.put(FIRMS_CACHE_KEY, JSON.stringify(fires), {
      expirationTtl: FIRMS_CACHE_TTL_SECONDS
    });
    return new Response(`FIRMS cache refreshed (${fires.length} fires)`);
  } catch (err) {
    return new Response(`Failed to refresh FIRMS cache: ${String(err)}`, { status: 500 });
  }
}
