import {
  FIRMS_CACHE_KEY,
  FIRMS_CACHE_TTL_SECONDS
} from "./config.js";

export async function fetchFirmsData(env, forceRefresh = false) {
  const apiKey = env.FIRMS_API_KEY;
  if (!apiKey) {
    throw new Error("FIRMS_API_KEY binding is missing");
  }

  const hasCache = env.FIRMS_CACHE && typeof env.FIRMS_CACHE.get === "function";

  if (!forceRefresh && hasCache) {
    const cached = await env.FIRMS_CACHE.get(FIRMS_CACHE_KEY);
    if (cached) {
      return { text: cached, source: "kv-cache" };
    }
  }

  const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${apiKey}/VIIRS_NOAA20_NRT/-180,-90,180,90/2`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch FIRMS data: ${response.status}`);
  }

  const text = await response.text();

  if (hasCache) {
    await env.FIRMS_CACHE.put(FIRMS_CACHE_KEY, text, {
      expirationTtl: FIRMS_CACHE_TTL_SECONDS
    });
  }

  return { text, source: "live-fetch" };
}

export async function refreshFirmsCache(env) {
  const apiKey = env.FIRMS_API_KEY;
  if (!apiKey) {
    throw new Error("FIRMS_API_KEY binding is missing");
  }

  const hasCache = env.FIRMS_CACHE && typeof env.FIRMS_CACHE.put === "function";

  if (!hasCache) {
    return new Response("FIRMS_CACHE binding is missing", { status: 500 });
  }

  const firmsUrl = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${apiKey}/VIIRS_NOAA20_NRT/-180,-90,180,90/2`;

  const response = await fetch(firmsUrl);
  if (!response.ok) {
    return new Response(`Failed to refresh FIRMS cache: ${response.status}`, { status: 500 });
  }

  const text = await response.text();

  await env.FIRMS_CACHE.put(FIRMS_CACHE_KEY, text, {
    expirationTtl: FIRMS_CACHE_TTL_SECONDS
  });

  return new Response("FIRMS cache refreshed");
}
