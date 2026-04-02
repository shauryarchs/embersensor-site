export function computeSensorScore(data) {
    if (data.flame === 0) return 8;

    let score = 0;

    if (typeof data.smoke === "number") {
        if (data.smoke > 600) return 8;

        if (data.smoke > 500) score += 3;
        else if (data.smoke >= 400) score += 2;
        else if (data.smoke >= 300) score += 1;
    }

    const sensorTemp = Number(data.sensorTemperature || 0);
    const weatherTemp = Number(data.weatherTemperature || 0);
    const delta = sensorTemp - weatherTemp;

    if (sensorTemp > 120) return 8;

    if (sensorTemp > 90) score += 2;

    if (delta > 30) score += 2;
    else if (delta >= 15) score += 1;

    return Math.min(score, 4);
}

export function computeFireScore(nearbyFires, closestDistance, windThreat, calfireCount = 0) {
    // Weighted count: high confidence = 1.0, nominal = 0.5, low already filtered out
    const firmsWeighted = nearbyFires.reduce((sum, f) => sum + (f._weight ?? 1.0), 0);

    if (firmsWeighted === 0 && calfireCount === 0) return 0;

    let score = 0;

    // NIFC confirmed incidents — higher weight (real reported fires)
    if (calfireCount >= 2) score += 3;
    else if (calfireCount === 1) score += 2;

    // FIRMS satellite detections — weighted count
    if (firmsWeighted > 5) score += 2;
    else if (firmsWeighted > 0) score += 1;

    // Closest FIRMS detection proximity bonus
    if (firmsWeighted > 0 && closestDistance < 5) score += 1;

    // Wind carrying fire toward home
    if (windThreat) score += 1;

    return Math.min(score, 4);
}

export function computeWeatherScore(data) {
    let score = 0;

    const humidity = Number(data.humidity || 0);
    const wind = Number(data.wind || 0);
    const weatherTemp = Number(data.weatherTemperature || 0);
    const raining = Boolean(data.raining);

    if (humidity < 20) score += 2;
    else if (humidity <= 30) score += 1;
    else if (humidity > 40) score -= 1;
    else if (humidity > 50) score -= 2;

    if (wind > 8) score += 2;
    else if (wind >= 5) score += 1;

    if (weatherTemp > 95) score += 1;

    if (raining) return -10;

    return Math.max(-2, Math.min(score, 3));
}

export function computeWindScore(windThreat) {
    return windThreat ? 2 : 0;
}
