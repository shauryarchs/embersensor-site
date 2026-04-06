export const HOME_LAT = 34.1;
export const HOME_LON = -117.6;
export const DEFAULT_RADIUS_MILES = 25;
// Stores parsed+filtered FIRMS fires as JSON (not raw CSV) so request handlers
// can skip CSV parsing entirely. Key is versioned so an old raw-CSV blob in KV
// is never mis-parsed after deploy.
export const FIRMS_CACHE_KEY = "firms_regional_parsed_v1";
export const FIRMS_CACHE_TTL_SECONDS = 900; // 15 minutes; cron refreshes every 5

// Half-width (degrees) of the FIRMS bounding box around HOME. ~8° ≈ ~550 mi —
// generous enough for the iOS/web map and the risk radius, but small enough
// that the CSV stays well under the Worker CPU budget.
export const FIRMS_AREA_HALF_DEG = 8;

export const WEATHER_CACHE_KEY = "weather_home_current";
export const WEATHER_CACHE_TTL_SECONDS = 300; // 5 minutes

export const YOUTUBE_CHANNEL_ID = "UCvj9pFy7xF7Ecg6ji9gCKQg";
export const YOUTUBE_STATUS_CACHE_SECONDS = 30;

export const CALFIRE_CACHE_KEY = "calfire_incidents";
export const CALFIRE_CACHE_TTL_SECONDS = 300; // 5 minutes
