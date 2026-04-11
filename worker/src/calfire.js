import {
  HOME_LAT,
  HOME_LON,
  CALFIRE_CACHE_KEY,
  CALFIRE_CACHE_TTL_SECONDS
} from "./config.js";
import { distanceMiles } from "./geo.js";

// NIFC Active Fires feature service — public ArcGIS REST API, no auth required.
// Returns fire perimeter polygons; we request centroids via returnCentroid=true.
const NIFC_URL =
  "https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/Active_Fires/FeatureServer/0/query" +
  "?where=1%3D1" +
  "&outFields=IncidentName,GISAcres,PercentContained,State,CreateDate" +
  "&returnGeometry=false" +
  "&returnCentroid=true" +
  "&outSR=4326" +
  "&f=json";

export async function fetchCalfireData(env, forceRefresh = false) {
  const hasCache = env.FIRMS_CACHE && typeof env.FIRMS_CACHE.get === "function";

  if (!forceRefresh && hasCache) {
    const cached = await env.FIRMS_CACHE.get(CALFIRE_CACHE_KEY);
    if (cached) {
      return { incidents: JSON.parse(cached), source: "kv-cache" };
    }
  }

  const response = await fetch(NIFC_URL);

  if (!response.ok) {
    throw new Error(`Failed to fetch NIFC fire data: ${response.status}`);
  }

  const json = await response.json();
  const features = json.features ?? [];

  // Normalise into a flat array so the rest of the code stays the same
  const incidents = features
    .filter(f => f.centroid)
    .map(f => ({
      name: f.attributes.IncidentName ?? "Unknown",
      latitude: f.centroid.y,
      longitude: f.centroid.x,
      acresBurned: f.attributes.GISAcres != null ? Math.round(f.attributes.GISAcres) : null,
      percentContained: f.attributes.PercentContained ?? null,
      state: f.attributes.State ?? null,
      updated: f.attributes.CreateDate
        ? new Date(f.attributes.CreateDate).toISOString()
        : null
    }));

  if (hasCache) {
    try {
      await env.FIRMS_CACHE.put(CALFIRE_CACHE_KEY, JSON.stringify(incidents), {
        expirationTtl: CALFIRE_CACHE_TTL_SECONDS
      });
    } catch (_) {}
  }

  return { incidents, source: "live-fetch" };
}

export function findNearbyCalfireIncidents(incidents, radiusMiles) {
  return incidents
    .filter(i => i.latitude && i.longitude)
    .map(i => {
      const dist = distanceMiles(HOME_LAT, HOME_LON, i.latitude, i.longitude);
      return { ...i, distanceMiles: Math.round(dist * 100) / 100 };
    })
    .filter(i => i.distanceMiles <= radiusMiles);
}
