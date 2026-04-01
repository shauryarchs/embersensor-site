# worker/ — EmberSensor Cloudflare Worker

Cloudflare Worker backend that serves the EmberSensor fire risk API. The website and iOS app both depend on this.

## Module structure

```
worker/
├── src/
│   ├── worker.js     Entry point — route dispatcher
│   ├── config.js     Central constants (home lat/lon, cache TTLs, channel ID)
│   ├── firms.js      NASA FIRMS fire data — fetch and KV cache
│   ├── weather.js    OpenWeather current conditions — fetch and KV cache
│   ├── geo.js        Distance, bearing, wind-toward-home, bounding box filter
│   ├── risk.js       Scoring functions — sensor, fire, weather, wind
│   ├── csv.js        CSV parser for FIRMS data
│   ├── utils.js      round2() helper
│   └── youtube.js    YouTube live stream status — fetch and KV cache
├── package.json
└── wrangler.jsonc
```

`config.js` is the single source of truth for home coordinates, cache keys, and cache TTLs.

## Routes

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/status` | Core endpoint. Returns merged sensor + weather + fire data with computed `riskIndex` (1–10). |
| `GET` | `/api/fires` | Fire hotspots in a lat/lon bounding box. Requires `minLat`, `maxLat`, `minLon`, `maxLon` query params. Returns 400 if any are missing or invalid. |
| `GET` | `/api/youtube-live-status` | Whether the YouTube channel is currently live. `?refresh=1` bypasses cache. |
| `POST` | `/api/update` | Accepts a JSON body and stores it in `FIRE_DATA` KV under key `"latest"`. Called by the IoT device. |
| `POST` | `/api/refresh-firms` | Force-fetches fresh NASA FIRMS data and overwrites the KV cache. |
| `POST` | `/api/refresh-weather` | Force-fetches fresh OpenWeather data and overwrites the KV cache. |

> No authentication is enforced on any route.

## KV bindings

| Binding | Key | TTL | Purpose |
|---|---|---|---|
| `FIRE_DATA` | `"latest"` | None (persistent) | Stores the latest IoT sensor reading pushed via `POST /api/update` |
| `FIRMS_CACHE` | `"firms_global_csv"` | 300s | Caches the raw FIRMS CSV from NASA to avoid hitting the API on every request |
| `WEATHER_CACHE` | `"weather_home_current"` | 300s | Caches normalized weather data from OpenWeather |
| `YOUTUBE_CACHE` | `"youtube_live_status"` | 60s if live / 180s if offline | Caches YouTube live stream check result |

## Data flow — `/api/status`

```
POST /api/update (IoT device)
    └── writes JSON → FIRE_DATA KV ["latest"]

GET /api/status
    ├── read FIRE_DATA KV → sensorData (sensorTemperature, smoke, flame, ...)
    ├── fetchFirmsData()
    │       ├── FIRMS_CACHE KV hit → return cached CSV
    │       └── miss → fetch NASA FIRMS API → write KV → return CSV
    ├── fetchWeatherData()
    │       ├── WEATHER_CACHE KV hit → return cached object
    │       └── miss → fetch OpenWeather API → normalize → write KV → return
    ├── parseCSV() → findNearbyFires(radius) → getClosestDistance()
    │                                         → evaluateWindRisk()
    ├── computeSensorScore()    uses: smoke, flame, sensorTemperature, weatherTemperature
    │   computeFireScore()      uses: nearbyCount, closestDistance, windThreat
    │   computeWeatherScore()   uses: humidity, wind, weatherTemperature, raining
    │   computeWindScore()      uses: windThreat (bool)
    └── riskIndex = sum of scores, clamped to [1, 10]
```

Default search radius is **25 miles** from home (configurable via `?radius=` query param).

## `/api/status` response fields

These fields are part of the API contract. The iOS app reads them — do not rename or remove without updating all clients.

```
riskIndex                  integer 1–10
fireNearby                 boolean
nearbyCount                integer
closestFireDistanceMiles   float or null
windTowardsHome            boolean
sensorTemperature          float (from IoT push)
smoke                      number (from IoT push)
flame                      number (from IoT push)
weatherTemperature         float
humidity                   float
wind                       float (mph)
windDirection              float (degrees)
condition                  string (e.g. "Clear", "Rain")
raining                    boolean
firmsSource                "kv-cache" or "live-fetch"
weatherSource              "kv-cache" or "live-fetch"
generatedAt                ISO 8601 timestamp
```

## `/api/fires` fire object fields

```
latitude, longitude        float
distanceMiles              float (distance from home)
brightness                 float or null
confidence                 string or null
satellite                  string or null
acquiredDate               string or null
acquiredTime               string or null
```

## Environment secrets required

| Secret name | Used by |
|---|---|
| `FIRMS_API_KEY` | `firms.js` — NASA FIRMS API key |
| `OPENWEATHER_API_KEY` | `weather.js` — OpenWeather API key |
| `YOUTUBE_API_KEY` | `youtube.js` — YouTube Data API v3 key |

Secrets are set via `wrangler secret put` and are never hardcoded.

## Development and deployment

```bash
# Install dependencies
npm install

# Run locally
npm run dev

# Deploy to Cloudflare
npm run deploy
```
