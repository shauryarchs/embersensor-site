import {
  HOME_LAT,
  HOME_LON,
  CALFIRE_CACHE_KEY,
  CALFIRE_CACHE_TTL_SECONDS
} from "./config.js";
import { distanceMiles } from "./geo.js";

const CALFIRE_API_URL = "https://www.fire.ca.gov/umbraco/Api/IncidentApi/GetIncidents?inactive=false";

export async function fetchCalfireData(env, forceRefresh = false) {
  const hasCache = env.FIRMS_CACHE && typeof env.FIRMS_CACHE.get === "function";

  if (!forceRefresh && hasCache) {
    const cached = await env.FIRMS_CACHE.get(CALFIRE_CACHE_KEY);
    if (cached) {
      return { incidents: JSON.parse(cached), source: "kv-cache" };
    }
  }

  const response = await fetch(CALFIRE_API_URL, {
    headers: { "Accept": "application/json" }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch CAL FIRE data: ${response.status}`);
  }

  const json = await response.json();
  const incidents = json.Incidents ?? [];

  if (hasCache) {
    await env.FIRMS_CACHE.put(CALFIRE_CACHE_KEY, JSON.stringify(incidents), {
      expirationTtl: CALFIRE_CACHE_TTL_SECONDS
    });
  }

  return { incidents, source: "live-fetch" };
}

export function findNearbyCalfireIncidents(incidents, radiusMiles) {
  return incidents
    .filter(i => i.IsActive && i.Latitude && i.Longitude)
    .map(i => {
      const lat = parseFloat(i.Latitude);
      const lon = parseFloat(i.Longitude);
      const dist = distanceMiles(HOME_LAT, HOME_LON, lat, lon);
      return {
        name: i.Name ?? "Unknown",
        latitude: lat,
        longitude: lon,
        distanceMiles: Math.round(dist * 100) / 100,
        acresBurned: i.AcresBurned ?? null,
        percentContained: i.PercentContained ?? null,
        county: i.County ?? null,
        updated: i.Updated ?? null,
        started: i.Started ?? null
      };
    })
    .filter(i => i.distanceMiles <= radiusMiles);
}
