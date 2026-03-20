import {
    HOME_LAT,
    HOME_LON,
    WEATHER_CACHE_KEY,
    WEATHER_CACHE_TTL_SECONDS
} from "./config.js";

export async function fetchWeatherData(env, forceRefresh = false) {
    const hasCache = env.WEATHER_CACHE && typeof env.WEATHER_CACHE.get === "function";
    const apiKey = env.OPENWEATHER_API_KEY;

    if (!apiKey) {
        throw new Error("OPENWEATHER_API_KEY binding is missing");
    }

    // 1. Try KV cache first unless force refresh is requested
    if (!forceRefresh && hasCache) {
        const cached = await env.WEATHER_CACHE.get(WEATHER_CACHE_KEY);
        if (cached) {
            return {
                data: JSON.parse(cached),
                source: "kv-cache"
            };
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

    // 3. Save to KV with expiration
    if (hasCache) {
        await env.WEATHER_CACHE.put(WEATHER_CACHE_KEY, JSON.stringify(normalized), {
            expirationTtl: WEATHER_CACHE_TTL_SECONDS
        });
    }

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
