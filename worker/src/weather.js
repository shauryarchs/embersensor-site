import {
    HOME_LAT,
    HOME_LON,
    WEATHER_CACHE_KEY,
    WEATHER_CACHE_TTL_SECONDS
} from "./config.js";
import { kvGet, kvPut } from "./neo4jKv.js";

const WEATHER_LABEL = "WeatherCache";
const WEATHER_ID = WEATHER_CACHE_KEY;
const WEATHER_MAX_AGE_MS = WEATHER_CACHE_TTL_SECONDS * 1000;

export async function fetchWeatherData(env, forceRefresh = false) {
    const apiKey = env.OPENWEATHER_API_KEY;

    if (!apiKey) {
        throw new Error("OPENWEATHER_API_KEY binding is missing");
    }

    // 1. Try Neo4j cache first unless force refresh is requested
    if (!forceRefresh) {
        try {
            const hit = await kvGet(env, WEATHER_LABEL, WEATHER_ID, WEATHER_MAX_AGE_MS);
            if (hit && hit.data && typeof hit.data === "object") {
                return { data: hit.data, source: "neo4j-cache" };
            }
        } catch {
            // Neo4j read failed — fall through to live fetch.
        }
    }

    // 2. Cache miss -> fetch from OpenWeather
    const weatherUrl =
        `https://api.openweathermap.org/data/2.5/weather` +
        `?lat=${HOME_LAT}&lon=${HOME_LON}&appid=${apiKey}&units=imperial`;

    const response = await fetch(weatherUrl);

    if (!response.ok) {
        throw new Error(`Failed to fetch weather data: ${response.status}`);
    }

    const weather = await response.json();

    const normalized = {
        weatherTemperature: Number(weather?.main?.temp ?? 0),
        humidity: Number(weather?.main?.humidity ?? 0),
        wind: Number(weather?.wind?.speed ?? 0),
        windDirection: Number(weather?.wind?.deg ?? 0),
        condition: weather?.weather?.[0]?.main || "Unknown",
        conditionDescription: weather?.weather?.[0]?.description || "",
        raining: (weather?.weather || []).some(w =>
            ["Rain", "Drizzle", "Thunderstorm"].includes(w.main)
        ),
        weatherFetchedAt: new Date().toISOString()
    };

    // 3. Save to Neo4j. Swallow write failures so a cache-write blip
    //    can't turn a successful live fetch into a 500.
    try {
        await kvPut(env, WEATHER_LABEL, WEATHER_ID, normalized);
    } catch (_) {}

    return {
        data: normalized,
        source: "live-fetch"
    };
}

export async function refreshWeatherCache(env) {
    const result = await fetchWeatherData(env, true);

    return new Response(JSON.stringify({
        message: "Weather cache refreshed",
        weatherSource: result.source,
        data: result.data
    }), {
        headers: { "Content-Type": "application/json" }
    });
}
