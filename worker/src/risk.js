export function computeSensorScore(data) {
    if (data.flame === 0) return 10;

    let score = 0;

    if (typeof data.smoke === "number") {
        if (data.smoke > 800) return 8;

        if (data.smoke > 700) score += 3;
        else if (data.smoke >= 600) score += 2;
        else if (data.smoke >= 500) score += 1;
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

export function computeFireScore(nearbyFires, closestDistance, calfireCount = 0, effectiveFireCount = 0) {
    if (effectiveFireCount === 0) return 0;

    let score = 0;

    // NIFC confirmed incidents — higher weight (real reported fires)
    if (calfireCount >= 2) score += 3;
    else if (calfireCount === 1) score += 2;

    // Weighted count: high confidence = 1.0, nominal = 0.5, low already filtered out
    const firmsWeighted = nearbyFires.reduce((sum, f) => sum + (f._weight ?? 1.0), 0);

    // FIRMS satellite detections — 0.5 overall weight (noisy source)
    // raw score: 6+ detections = 2, 1-5 = 1, then halved (floor)
    // result:    6+ detections = +1, 1-5 = 0
    const firmsRawScore = firmsWeighted > 5 ? 2 : firmsWeighted > 0 ? 1 : 0;
    score += Math.floor(firmsRawScore * 0.5);

    // Closest FIRMS detection proximity bonus
    if (firmsWeighted > 0 && closestDistance < 5) score += 1;

    return Math.min(score, 4);
}

export function computeWeatherScore(data, effectiveFireCount = 0) {
    let score = 0;

    const humidity = Number(data.humidity || 0);
    const wind = Number(data.wind || 0);
    const weatherTemp = Number(data.weatherTemperature || 0);
    const raining = Boolean(data.raining);

    if (humidity < 20) score += 2;
    else if (humidity <= 30) score += 1;
    else if (humidity > 40) score -= 1;
    else if (humidity > 50) score -= 2;

    // Wind speed only contributes when there are effective fires nearby
    if (effectiveFireCount > 0) {
        if (wind > 8) score += 2;
        else if (wind >= 5) score += 1;
    }

    if (weatherTemp > 95) score += 1;

    if (raining) return -10;

    return Math.max(-2, Math.min(score, 3));
}

export function computeWindScore(windThreat, fireScore = 0) {
    if (!windThreat) return 0;
    if (fireScore === 0) return 0;
    return 2;
}

/**
 * Compute effective fire count:
 * CAL FIRE incidents + FIRMS weighted (high = 1.0, nominal/medium = 0.5)
 */
export function computeEffectiveFireCount(nearbyFires, calfireCount = 0) {
    const firmsWeighted = nearbyFires.reduce((sum, f) => sum + (f._weight ?? 1.0), 0);
    return calfireCount + firmsWeighted;
}
