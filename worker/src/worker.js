import { DEFAULT_RADIUS_MILES, HOME_LAT, HOME_LON } from "./config.js";
import { fetchFirmsData, refreshFirmsCache } from "./firms.js";
import { fetchWeatherData, refreshWeatherCache } from "./weather.js";
import {
  distanceMiles,
  findNearbyFires,
  getClosestDistance,
  evaluateWindRisk,
  filterFiresByBounds
} from "./geo.js";
import {
  computeSensorScore,
  computeFireScore,
  computeWeatherScore,
  computeWindScore,
  computeEffectiveFireCount
} from "./risk.js";
import { round2 } from "./utils.js";
import { fetchYoutubeLiveStatus } from "./youtube.js";
import { fetchCalfireData, findNearbyCalfireIncidents } from "./calfire.js";
import { handleGraphQuery } from "./neo4j.js";
import { handleNl2Cypher } from "./nl2cypher.js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const radius = parseFloat(url.searchParams.get("radius")) || DEFAULT_RADIUS_MILES;

    if (url.pathname === "/api/refresh-firms" && request.method === "POST") {
      return refreshFirmsCache(env);
    }

    if (url.pathname === "/api/refresh-weather" && request.method === "POST") {
      return refreshWeatherCache(env);
    }

    if (url.pathname === "/api/camera-access" && request.method === "POST") {
      const accessCode = env.CAMERA_ACCESS_CODE;
      const streamUrl = env.CAMERA_STREAM_URL;

      if (!accessCode || !streamUrl) {
        return new Response(JSON.stringify({ error: "Camera access not configured" }), {
          status: 500,
          headers: { "Content-Type": "application/json" }
        });
      }

      let body;
      try {
        body = await request.json();
      } catch {
        return new Response(JSON.stringify({ error: "Invalid request body" }), {
          status: 400,
          headers: { "Content-Type": "application/json" }
        });
      }

      if (body.code !== accessCode) {
        return new Response(JSON.stringify({ error: "Invalid code" }), {
          status: 401,
          headers: { "Content-Type": "application/json" }
        });
      }

      return new Response(JSON.stringify({ url: streamUrl }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    if (url.pathname === "/api/update" && request.method === "POST") {
      const data = await request.json();
      await env.FIRE_DATA.put("latest", JSON.stringify(data));
      return new Response("OK");
    }

    if (url.pathname === "/api/youtube-live-status") {
      const forceRefresh = url.searchParams.get("refresh") === "1";
      return fetchYoutubeLiveStatus(env, forceRefresh);
    }

    if (url.pathname === "/api/fires") {
      try {
        const minLat = parseFloat(url.searchParams.get("minLat"));
        const maxLat = parseFloat(url.searchParams.get("maxLat"));
        const minLon = parseFloat(url.searchParams.get("minLon"));
        const maxLon = parseFloat(url.searchParams.get("maxLon"));

        if ([minLat, maxLat, minLon, maxLon].some(Number.isNaN)) {
          return new Response(JSON.stringify({
            error: "Invalid bounding box parameters"
          }), {
            status: 400,
            headers: { "Content-Type": "application/json" }
          });
        }

        const forceRefreshFirms = url.searchParams.get("refreshFirms") === "1";
        const firmsResult = await fetchFirmsData(env, forceRefreshFirms);
        const fires = firmsResult.fires;

        const firesInBounds = filterFiresByBounds(fires, minLat, maxLat, minLon, maxLon);

        return new Response(JSON.stringify({
          count: firesInBounds.length,
          fires: firesInBounds.map(f => {
            const lat = Number(f.latitude);
            const lon = Number(f.longitude);

            return {
              latitude: lat,
              longitude: lon,
              distanceMiles: round2(distanceMiles(HOME_LAT, HOME_LON, lat, lon)),
              brightness: f.bright_ti4 ? Number(f.bright_ti4) : null,
              confidence: f.confidence ?? null,
              satellite: f.satellite ?? null,
              acquiredDate: f.acq_date ?? null,
              acquiredTime: f.acq_time ?? null
            };
          }),
          firmsSource: firmsResult.source,
          generatedAt: new Date().toISOString()
        }), {
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "Pragma": "no-cache",
            "Expires": "0"
          }
        });
      } catch (err) {
        return new Response(JSON.stringify({
          error: "api/fires failed",
          message: String(err)
        }), {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0"
          }
        });
      }
    }

    if (url.pathname === "/api/calfire-fires") {
      try {
        const forceRefresh = url.searchParams.get("refresh") === "1";
        const calfireResult = await fetchCalfireData(env, forceRefresh);
        const nearby = findNearbyCalfireIncidents(calfireResult.incidents, radius);

        return new Response(JSON.stringify({
          count: nearby.length,
          fires: nearby,
          source: calfireResult.source,
          generatedAt: new Date().toISOString()
        }), {
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "Access-Control-Allow-Origin": "*"
          }
        });
      } catch (err) {
        return new Response(JSON.stringify({
          error: "api/calfire-fires failed",
          message: String(err)
        }), {
          status: 500,
          headers: { "Content-Type": "application/json" }
        });
      }
    }

    if (url.pathname === "/api/graphQuery") {
      return handleGraphQuery(request, env);
    }

    if (url.pathname === "/api/nl2cypher") {
      return handleNl2Cypher(request, env);
    }

    if (url.pathname === "/api/status") {
      try {
        const raw = await env.FIRE_DATA.get("latest");
        const sensorData = raw ? JSON.parse(raw) : {};

        const forceRefreshFirms = url.searchParams.get("refreshFirms") === "1";
        const firmsResult = await fetchFirmsData(env, forceRefreshFirms);
        const fires = firmsResult.fires;

        const forceRefreshWeather = url.searchParams.get("refreshWeather") === "1";
        const weatherResult = await fetchWeatherData(env, forceRefreshWeather);
        const weatherData = weatherResult.data;

        const forceRefreshCalfire = url.searchParams.get("refreshCalfire") === "1";
        let calfireNearby = [];
        let calfireSource = "unavailable";
        try {
          const calfireResult = await fetchCalfireData(env, forceRefreshCalfire);
          calfireNearby = findNearbyCalfireIncidents(calfireResult.incidents, radius);
          calfireSource = calfireResult.source;
        } catch (_) {
          // CAL FIRE fetch failed — degrade gracefully, rest of status still works
        }

        const mergedData = {
          ...sensorData,
          ...weatherData
        };

        const nearby = findNearbyFires(fires, radius);
        const closestFireDistanceMiles = getClosestDistance(nearby);

        const windDirection = mergedData.windDirection || 0;
        const windTo = (windDirection + 180) % 360;
        const windThreat = evaluateWindRisk(nearby, windTo);

        const effectiveFireCount = computeEffectiveFireCount(nearby, calfireNearby.length);
        const sensorScore = computeSensorScore(mergedData);
        const fireScore = computeFireScore(nearby, closestFireDistanceMiles, calfireNearby.length, effectiveFireCount);
        const weatherScore = computeWeatherScore(mergedData, effectiveFireCount);
        const windScore = computeWindScore(windThreat, fireScore);

        let riskIndex = sensorScore + fireScore + weatherScore + windScore;
        riskIndex = Math.max(1, Math.min(10, riskIndex));

        return new Response(JSON.stringify({
          ...mergedData,
          fireNearby: nearby.length > 0,
          windTowardsHome: windThreat,
          nearbyCount: nearby.length,
          closestFireDistanceMiles: closestFireDistanceMiles === Infinity
            ? null
            : round2(closestFireDistanceMiles),
          riskIndex,
          scoreBreakdown: { sensorScore, fireScore, weatherScore, windScore },
          calfireNearby: calfireNearby.length > 0,
          calfireCount: calfireNearby.length,
          calfireFires: calfireNearby,
          firmsSource: firmsResult.source,
          weatherSource: weatherResult.source,
          calfireSource,
          generatedAt: new Date().toISOString()
        }), {
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "Pragma": "no-cache",
            "Expires": "0"
          }
        });
      } catch (err) {
        return new Response(JSON.stringify({
          error: "api/status failed",
          message: String(err)
        }), {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0"
          }
        });
      }
    }

    return new Response("Not Found", { status: 404 });
  },

  // Scheduled refresh: keep the FIRMS / weather / CAL FIRE caches warm so that
  // /api/status and /api/fires almost always hit the cache and never have to
  // do the heavy fetch+parse inside a user request (which is what was
  // tripping Cloudflare error 1102, "Worker exceeded resource limits").
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(Promise.allSettled([
      fetchFirmsData(env, true),
      fetchWeatherData(env, true),
      fetchCalfireData(env, true)
    ]));
  }

  }
};
