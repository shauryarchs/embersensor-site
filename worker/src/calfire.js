import {
  HOME_LAT,
  HOME_LON,
  CALFIRE_CACHE_KEY,
  CALFIRE_CACHE_TTL_SECONDS
} from "./config.js";
import { distanceMiles } from "./geo.js";
import { kvGet, kvPut } from "./neo4jKv.js";

const CALFIRE_LABEL = "CalfireCache";
const CALFIRE_ID = CALFIRE_CACHE_KEY;
const CALFIRE_MAX_AGE_MS = CALFIRE_CACHE_TTL_SECONDS * 1000;

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
  if (!forceRefresh) {
    try {
      const hit = await kvGet(env, CALFIRE_LABEL, CALFIRE_ID, CALFIRE_MAX_AGE_MS);
      if (hit && Array.isArray(hit.data)) {
        return { incidents: hit.data, source: "neo4j-cache" };
      }
    } catch {
      // Neo4j read failed — fall through to live fetch.
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

  try {
    await kvPut(env, CALFIRE_LABEL, CALFIRE_ID, incidents);
  } catch (_) {}

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
