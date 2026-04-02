import { HOME_LAT, HOME_LON } from "./config.js";

export function distanceMiles(lat1, lon1, lat2, lon2) {
    const R = 3958.8;

    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;

    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) *
        Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) ** 2;

    return 2 * R * Math.asin(Math.sqrt(a));
}

export function findNearbyFires(fires, radius) {
    return fires
        .map(f => {
            const lat = parseFloat(f.latitude);
            const lon = parseFloat(f.longitude);

            if (isNaN(lat) || isNaN(lon)) return null;

            const conf = (f.confidence ?? "").toLowerCase();
            if (conf === "low") return null;

            const weight = conf === "high" ? 1.0 : 0.5; // nominal = 0.5
            const dist = distanceMiles(HOME_LAT, HOME_LON, lat, lon);

            return {
                ...f,
                _distanceMiles: dist,
                _weight: weight
            };
        })
        .filter(f => f && f._distanceMiles <= radius);
}

export function getClosestDistance(nearbyFires) {
    if (!nearbyFires.length) return Infinity;

    let minDist = Infinity;
    for (const f of nearbyFires) {
        if (f._distanceMiles < minDist) {
            minDist = f._distanceMiles;
        }
    }

    return minDist;
}

export function bearing(lat1, lon1, lat2, lon2) {
    const dLon = (lon2 - lon1) * Math.PI / 180;

    const y = Math.sin(dLon) * Math.cos(lat2 * Math.PI / 180);
    const x =
        Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
        Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos(dLon);

    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

export function angularDifference(a, b) {
    let diff = Math.abs(a - b) % 360;
    return diff > 180 ? 360 - diff : diff;
}

export function isWindTowardsHome(fireLat, fireLon, windDirTo) {
    const fireToHome = bearing(fireLat, fireLon, HOME_LAT, HOME_LON);
    const diff = angularDifference(fireToHome, windDirTo);
    return diff <= 45;
}

export function evaluateWindRisk(nearbyFires, windDirTo) {
    for (const f of nearbyFires) {
        const fireLat = parseFloat(f.latitude);
        const fireLon = parseFloat(f.longitude);

        if (isWindTowardsHome(fireLat, fireLon, windDirTo)) {
            return true;
        }
    }

    return false;
}

export function filterFiresByBounds(fires, minLat, maxLat, minLon, maxLon) {
    return fires.filter(f => {
        const lat = parseFloat(f.latitude);
        const lon = parseFloat(f.longitude);

        if (isNaN(lat) || isNaN(lon)) return false;

        return lat >= minLat && lat <= maxLat && lon >= minLon && lon <= maxLon;
    });
}
