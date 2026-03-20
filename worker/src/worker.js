import { DEFAULT_RADIUS_MILES } from "./config.js";
import { fetchFirmsData, refreshFirmsCache } from "./firms.js";
import { fetchWeatherData, refreshWeatherCache } from "./weather.js";
import { parseCSV } from "./csv.js";
import {
  findNearbyFires,
  getClosestDistance,
  evaluateWindRisk
} from "./geo.js";
import {
  computeSensorScore,
  computeFireScore,
  computeWeatherScore,
  computeWindScore
} from "./risk.js";
import { round2 } from "./utils.js";

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

    if (url.pathname === "/api/update" && request.method === "POST") {
      const data = await request.json();
      await env.FIRE_DATA.put("latest", JSON.stringify(data));
      return new Response("OK");
    }

    if (url.pathname === "/api/status") {
      try {
        const raw = await env.FIRE_DATA.get("latest");
        const sensorData = raw ? JSON.parse(raw) : {};

        const forceRefreshFirms = url.searchParams.get("refreshFirms") === "1";
        const firmsResult = await fetchFirmsData(env, forceRefreshFirms);
        const csv = firmsResult.text;
        const fires = parseCSV(csv);

        const forceRefreshWeather = url.searchParams.get("refreshWeather") === "1";
        const weatherResult = await fetchWeatherData(env, forceRefreshWeather);
        const weatherData = weatherResult.data;

        const mergedData = {
          ...sensorData,
          ...weatherData
        };

        const nearby = findNearbyFires(fires, radius);
        const closestFireDistanceMiles = getClosestDistance(nearby);

        const windDirection = mergedData.windDirection || 0;
        const windTo = (windDirection + 180) % 360;
        const windThreat = evaluateWindRisk(nearby, windTo);

        const sensorScore = computeSensorScore(mergedData);
        const fireScore = computeFireScore(nearby, closestFireDistanceMiles, windThreat);
        const weatherScore = computeWeatherScore(mergedData);
        const windScore = computeWindScore(windThreat);

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
          firmsSource: firmsResult.source,
          weatherSource: weatherResult.source,
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
    
  }
};
