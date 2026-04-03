# EmberSensor Site

Website and Cloudflare Worker backend for the EmberSensor wildfire monitoring project.

## Repo structure

```
embersensor-site/
├── docs/       Static website (GitHub Pages)
├── worker/     Cloudflare Worker backend API
└── CLAUDE.md   AI assistant rules for this repo
```

## What this repo contains

**`docs/`** — The public-facing EmberSensor website. Four static HTML pages sharing one CSS file and one JS file. Hosted on GitHub Pages at `embersensor.com`.

**`worker/`** — A Cloudflare Worker that serves the live fire risk API. It combines IoT sensor data (pushed by the device), NASA FIRMS satellite fire data, and OpenWeather weather data into a single `/api/status` response. The website and iOS app both depend on this API.

## Live endpoints

| Endpoint | Description |
|---|---|
| `GET /api/status` | Core fire risk response — sensor + weather + nearby fires + `riskIndex` |
| `GET /api/fires` | Fire hotspots within a lat/lon bounding box |
| `GET /api/youtube-live-status` | Whether the YouTube channel is currently live |
| `POST /api/camera-access` | Validates 4-digit code, returns stream URL — code and URL never exposed in client HTML |
| `POST /api/update` | IoT device pushes sensor readings here |
| `POST /api/refresh-firms` | Force-refresh NASA FIRMS cache |
| `POST /api/refresh-weather` | Force-refresh OpenWeather cache |
| `POST /api/graphQuery` | Proxy Cypher queries to Neo4j graph database via Cloudflare Tunnel |

## Key dependencies

- **Cloudflare Workers** — Worker runtime and KV storage
- **NASA FIRMS API** — Satellite wildfire hotspot data (VIIRS NOAA-20 NRT)
- **OpenWeather API** — Current weather at home location
- **YouTube Data API v3** — Live stream status check
- **Wrangler** — Cloudflare Worker deployment CLI
- **Neo4j Community Edition** — Graph database for wildfire causation data
- **D3.js** — Force-directed and tree graph visualizations
- **Cloudflare Tunnel + Access** — Secure tunnel from Worker to local Neo4j instance

## Documentation

- [`docs/WILDFIRE_ANALYSIS.md`](docs/WILDFIRE_ANALYSIS.md) — Graph schema, architecture, and features for the Wildfire Analysis page
- [`worker/RISK_ALGORITHM.md`](worker/RISK_ALGORITHM.md) — Fire Risk Index algorithm with full scoring breakdown
- [`docs/README.md`](docs/README.md) — Static site details
- [`worker/README.md`](worker/README.md) — Worker architecture, routes, KV bindings, and data flow
- [`worker/setup-neo4j-readme.md`](worker/setup-neo4j-readme.md) — Cloudflare Tunnel and Neo4j setup
