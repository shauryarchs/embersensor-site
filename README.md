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

## Key dependencies

- **Cloudflare Workers** — Worker runtime and KV storage
- **NASA FIRMS API** — Satellite wildfire hotspot data (VIIRS NOAA-20 NRT)
- **OpenWeather API** — Current weather at home location
- **YouTube Data API v3** — Live stream status check
- **Wrangler** — Cloudflare Worker deployment CLI

---

## Fire Risk Index Algorithm

The Fire Risk Index is a composite score from **1 to 10** that quantifies how dangerous current fire conditions are at the monitored location. It combines four independent sub-scores computed from real-time data sources.

### High-Level Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     DATA SOURCES                            │
│                                                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐  │
│  │ IoT      │  │ NASA     │  │ CAL FIRE │  │ OpenWeather│  │
│  │ Sensor   │  │ FIRMS    │  │ Incidents│  │ API        │  │
│  │ Device   │  │ Satellite│  │          │  │            │  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └─────┬──────┘  │
│       │              │             │              │          │
└───────┼──────────────┼─────────────┼──────────────┼──────────┘
        │              │             │              │
        v              v             v              v
┌──────────────┐ ┌───────────────────────┐  ┌─────────────┐
│ Sensor Score │ │ Effective Fire Count  │  │Weather Score│
│   (0–4)      │ │ CAL FIRE + FIRMS      │  │  (-2 to +3) │
│              │ │ weighted              │  │             │
└──────┬───────┘ └───────────┬───────────┘  └──────┬──────┘
       │                     │                     │
       │              ┌──────┴──────┐              │
       │              v             v              │
       │       ┌────────────┐ ┌──────────┐         │
       │       │ Fire Score │ │Wind Score│         │
       │       │   (0–4)    │ │ (0 or 2) │         │
       │       └─────┬──────┘ └────┬─────┘         │
       │             │             │                │
       v             v             v                v
    ┌──────────────────────────────────────────────────┐
    │                                                  │
    │  Risk Index = Sensor + Fire + Weather + Wind     │
    │  Clamped to range [1, 10]                        │
    │                                                  │
    └──────────────────────────────────────────────────┘
```

### Risk Index Formula

```
riskIndex = clamp(sensorScore + fireScore + weatherScore + windScore, 1, 10)
```

| Sub-Score | Range | Inputs |
|---|---|---|
| Sensor Score | 0–4 | Flame sensor, smoke level, sensor temperature, temp delta |
| Fire Score | 0–4 | CAL FIRE incidents, FIRMS satellite detections, proximity, wind threat |
| Weather Score | -2 to +3 | Humidity, wind speed, temperature, rain |
| Wind Score | 0 or 2 | Wind direction relative to fire, fire score |

**Theoretical range:** -2 to 13, clamped to **1–10**.

### Wind Dependency Rule

Wind is only relevant when there are confirmed fires. This rule applies across multiple sub-scores:

```
┌─────────────────────────────────────────────────┐
│         Effective Fire Count                    │
│  = CAL FIRE count                               │
│  + FIRMS weighted (high=1.0, medium=0.5)        │
└──────────────────────┬──────────────────────────┘
                       │
              ┌────────┴────────┐
              v                 v
     effectiveFireCount > 0    effectiveFireCount = 0
              │                 │
    ┌─────────┴──────────┐     ├── Fire Score → 0
    │ Fire factors scored │     ├── Weather wind factor → ignored
    │ (CAL FIRE, FIRMS,   │     └── Wind Score → 0
    │  proximity)         │
    └─────────┬──────────┘
              │
     ┌────────┴────────┐
     v                  v
  fireScore > 0      fireScore = 0
     │                  │
     │                  └── Wind Score → 0
     │
     └── Wind Score → +2
```

**Summary:**
- If `effectiveFireCount = 0` → fire score is 0, weather ignores wind speed, wind score is 0
- If `effectiveFireCount > 0` but fire factors score 0 → wind score is 0
- If `fireScore > 0` AND wind blows from fire toward home → wind score adds +2

---

### 1. Sensor Score (0–4)

Measures on-site fire indicators from the IoT sensor device.

#### Critical Conditions (immediate return of 8)

These conditions bypass normal scoring and return a critical value of 8, which exceeds the cap and drives the risk index to its maximum:

| Condition | Return Value |
|---|---|
| Flame detected (`flame === 0`) | 8 |
| Sensor temperature > 120 °F | 8 |
| Smoke level > 600 ppm | 8 |

#### Normal Scoring

When no critical condition is met, points are accumulated:

```
                    ┌──────────────┐
                    │ Flame = 0 ?  │
                    └──────┬───────┘
                     yes / \ no
                     /       \
               return 8   ┌────────────────┐
                          │ Smoke > 600 ?  │
                          └──────┬─────────┘
                           yes / \ no
                           /       \
                     return 8   ┌──────────────────┐
                                │ Accumulate Points │
                                └──────────────────┘
```

**Smoke Level:**

| Smoke (ppm) | Points |
|---|---|
| > 500 | +3 |
| 400–500 | +2 |
| 300–399 | +1 |
| < 300 | 0 |

**Sensor Temperature:**

| Condition | Points |
|---|---|
| > 120 °F | Critical (return 8) |
| > 90 °F | +2 |
| <= 90 °F | 0 |

**Temperature Delta** (sensor temp - weather temp):

| Delta | Points |
|---|---|
| > 30 °F | +2 |
| 15–30 °F | +1 |
| < 15 °F | 0 |

The temperature delta detects localized heat sources — if the sensor reads significantly higher than ambient weather, something nearby may be burning.

**Final:** `min(accumulated_points, 4)`

---

### 2. Fire Score (0–4)

Combines confirmed fire reports and satellite detections to assess nearby fire activity.

#### Prerequisite: Effective Fire Count

Before scoring, an effective fire count is computed:

```
effectiveFireCount = calfireCount + sum(FIRMS detections weighted by confidence)
```

- FIRMS high confidence: weight = 1.0
- FIRMS nominal/medium confidence: weight = 0.5
- FIRMS low confidence: filtered out before scoring

**If `effectiveFireCount = 0`, the fire score is 0.** No further computation occurs.

#### Scoring Factors

```
  effectiveFireCount > 0
          │
          v
  ┌───────────────────┐
  │ CAL FIRE Incidents │
  │                   │
  │  >= 2  → +3       │
  │  == 1  → +2       │
  │  == 0  → +0       │
  └────────┬──────────┘
           │
           v
  ┌────────────────────────┐
  │ FIRMS Weighted Score   │
  │                        │
  │ weighted > 5   → +1    │
  │ weighted 1–5   → +0    │
  │ weighted 0     → +0    │
  │                        │
  │ (raw score halved to   │
  │  reduce satellite      │
  │  noise)                │
  └────────┬───────────────┘
           │
           v
  ┌────────────────────────┐
  │ Proximity Bonus        │
  │                        │
  │ FIRMS detection < 5 mi │
  │ AND weighted > 0       │
  │ → +1                   │
  └────────┬───────────────┘
           │
           v
     min(score, 4)
```

**CAL FIRE Incidents** (confirmed, reported fires):

| Count | Points |
|---|---|
| >= 2 | +3 |
| 1 | +2 |
| 0 | 0 |

**FIRMS Satellite Detections** (weighted, halved to reduce noise):

| Weighted Count | Raw Score | After 0.5x | Points |
|---|---|---|---|
| > 5 | 2 | 1 | +1 |
| 1–5 | 1 | 0.5 → 0 | 0 |
| 0 | 0 | 0 | 0 |

**Proximity Bonus:**

| Condition | Points |
|---|---|
| Closest FIRMS detection < 5 miles AND weighted > 0 | +1 |
| Otherwise | 0 |

Wind is **not** factored into the fire score — it has its own dedicated Wind Score (see section 4).

**Final:** `min(accumulated_points, 4)`

---

### 3. Weather Score (-2 to +3)

Adjusts risk based on atmospheric conditions. This is the only sub-score that can be negative, reflecting that favorable weather reduces fire risk.

```
  ┌──────────────────────┐
  │ Humidity              │
  │                      │
  │  < 20%   → +2       │
  │  <= 30%  → +1       │
  │  31–40%  →  0       │
  │  > 40%   → -1       │
  │  > 50%   → -2       │
  └────────┬─────────────┘
           │
           v
  ┌──────────────────────────────────┐
  │ Wind Speed                       │
  │ (only if effectiveFireCount > 0) │
  │                                  │
  │  > 8 m/s  → +2                  │
  │  >= 5 m/s → +1                  │
  │  < 5 m/s  →  0                  │
  │                                  │
  │ If no fires: ignored             │
  └────────┬─────────────────────────┘
           │
           v
  ┌──────────────────────┐
  │ Temperature           │
  │                      │
  │  > 95 °F  → +1      │
  │  <= 95 °F →  0      │
  └────────┬─────────────┘
           │
           v
  ┌──────────────────────┐
  │ Rain Override         │
  │                      │
  │  Raining → return -10│
  │  (overrides all      │
  │   other factors)     │
  └────────┬─────────────┘
           │
           v
     clamp(score, -2, 3)
```

**Humidity:**

| Humidity | Points |
|---|---|
| < 20% | +2 |
| 20–30% | +1 |
| 31–40% | 0 |
| > 40% | -1 |
| > 50% | -2 |

Low humidity means dry vegetation that ignites easily. High humidity means moisture that suppresses fire.

**Wind Speed** (only when effective fires nearby):

| Wind Speed | Points |
|---|---|
| > 8 m/s | +2 |
| 5–8 m/s | +1 |
| < 5 m/s | 0 |

Wind speed is **ignored when there are no effective fires nearby** (`effectiveFireCount = 0`). Wind only matters for fire spread when there is something burning.

**Temperature:**

| Temperature | Points |
|---|---|
| > 95 °F | +1 |
| <= 95 °F | 0 |

**Rain Override:**

If it is currently raining, the weather score returns **-10**, which effectively drives the total risk index to its minimum of 1, regardless of all other factors. Rain is the single strongest suppression signal.

**Final:** `clamp(accumulated_points, -2, 3)` (unless raining, which returns -10)

---

### 4. Wind Score (0 or 2)

A standalone binary score that reflects whether wind is actively carrying fire toward the home location.

```
  ┌───────────────────────────┐
  │ Is wind blowing toward    │
  │ home from a fire?         │
  │ (windThreat)              │
  └─────────┬─────────────────┘
        yes │           no
            │            │
            v            v
  ┌─────────────────┐  return 0
  │ Fire Score > 0 ? │
  └────┬────────────┘
   yes │        no
       │         │
       v         v
   return 2   return 0
```

| Condition | Score |
|---|---|
| Wind toward home AND fire score > 0 | **+2** |
| Wind toward home BUT fire score = 0 | 0 |
| No wind toward home | 0 |

The wind score depends on the **fire score**, not just the presence of fires. If nearby fires exist but none scored points (e.g., only low-weight satellite detections), wind is not considered a threat.

---

### Final Risk Index Calculation

```
   Sensor Score (0–4)
 + Fire Score   (0–4)
 + Weather Score(-2 to +3)
 + Wind Score   (0 or 2)
 ────────────────────────
   Raw Total    (-2 to 13)
   → Clamped to [1, 10]
```

### Risk Level Classification

| Risk Index | Level | Color |
|---|---|---|
| 8–10 | HIGH RISK | Red |
| 5–7 | MEDIUM RISK | Orange |
| 1–4 | LOW RISK | Green |

### Example Scenarios

#### Scenario A: Calm Day, No Fires
| Component | Value | Score |
|---|---|---|
| Smoke | 50 ppm | 0 |
| Flame | No | 0 |
| Sensor Temp | 78 °F | 0 |
| **Sensor Score** | | **0** |
| CAL FIRE | 0 | 0 |
| FIRMS | 0 | 0 |
| **Fire Score** | | **0** |
| Humidity | 45% | -1 |
| Wind | 3 m/s | 0 (ignored) |
| Temp | 82 °F | 0 |
| **Weather Score** | | **-1** |
| Wind threat | N/A | 0 (fire score = 0) |
| **Wind Score** | | **0** |
| **Risk Index** | | **clamp(-1) = 1 (LOW)** |

#### Scenario B: Nearby Fire, Hot and Dry
| Component | Value | Score |
|---|---|---|
| Smoke | 350 ppm | +1 |
| Flame | No | 0 |
| Sensor Temp | 95 °F | +2 |
| Temp Delta | +20 °F | +1 |
| **Sensor Score** | | **4** (capped) |
| CAL FIRE | 1 | +2 |
| FIRMS (weighted) | 3.5 | 0 |
| Closest fire | 4 mi | +1 |
| **Fire Score** | | **3** |
| Humidity | 15% | +2 |
| Wind | 6 m/s | +1 |
| Temp | 98 °F | +1 |
| **Weather Score** | | **3** (capped) |
| Wind threat | Yes | +2 (fire score > 0) |
| **Wind Score** | | **2** |
| **Risk Index** | | **clamp(12) = 10 (HIGH)** |

#### Scenario C: Rainy Day Despite Nearby Fire
| Component | Value | Score |
|---|---|---|
| Smoke | 100 ppm | 0 |
| **Sensor Score** | | **0** |
| CAL FIRE | 1 | +2 |
| **Fire Score** | | **2** |
| Rain | Yes | -10 |
| **Weather Score** | | **-10** |
| **Wind Score** | | **2** (fire score > 0) |
| **Risk Index** | | **clamp(-6) = 1 (LOW)** |

Rain overrides weather scoring and effectively suppresses the risk index to minimum.

---

### Source Code Reference

The scoring algorithm is implemented in [`worker/src/risk.js`](worker/src/risk.js):

| Function | Description |
|---|---|
| `computeSensorScore(data)` | IoT sensor scoring with critical condition early returns |
| `computeEffectiveFireCount(nearbyFires, calfireCount)` | CAL FIRE + FIRMS weighted count |
| `computeFireScore(nearbyFires, closestDistance, calfireCount, effectiveFireCount)` | Fire presence and proximity scoring |
| `computeWeatherScore(data, effectiveFireCount)` | Weather scoring with conditional wind speed |
| `computeWindScore(windThreat, fireScore)` | Binary wind score gated on fire score |

Scoring is orchestrated in [`worker/src/worker.js`](worker/src/worker.js) within the `/api/status` handler. Sub-scores are returned in the API response under `scoreBreakdown` for the frontend to display.

---

## See also

- [`docs/README.md`](docs/README.md) — Static site details
- [`worker/README.md`](worker/README.md) — Worker architecture, routes, KV bindings, and data flow
