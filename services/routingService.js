/**
 * Routing Service - Calculates road-route distance and estimated travel duration
 * Uses OpenStreetMap-based OSRM API with SQLite caching and timeout handling.
 * Supports optional Google Routes API if GOOGLE_MAPS_API_KEY is configured.
 */

const db = require('../database/db');

const OSRM_BASE_URL = process.env.OSRM_BASE_URL || 'http://router.project-osrm.org';
const OSRM_PROFILE = process.env.OSRM_PROFILE || 'driving';
const API_TIMEOUT_MS = parseInt(process.env.API_TIMEOUT_MS, 10) || 8000;
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || '';

const OSM_ATTRIBUTION = '© OpenStreetMap contributors, routing by OSRM';

/**
 * Generate a rounded cache key for route coordinates (~11 meters precision)
 */
function makeRouteCacheKey(pickupLat, pickupLon, deliveryLat, deliveryLon) {
  const pLat = Number(pickupLat).toFixed(4);
  const pLon = Number(pickupLon).toFixed(4);
  const dLat = Number(deliveryLat).toFixed(4);
  const dLon = Number(deliveryLon).toFixed(4);
  return `${pLat},${pLon}->${dLat},${dLon}`;
}

/**
 * Calculate road route between two coordinate pairs
 * @param {number} pickupLat
 * @param {number} pickupLon
 * @param {number} deliveryLat
 * @param {number} deliveryLon
 * @returns {Promise<{ distanceKm: number, durationMin: number, attribution: string, isCached: boolean, provider: string, isLiveTraffic: boolean }>}
 */
async function getRoadRoute(pickupLat, pickupLon, deliveryLat, deliveryLon) {
  const pLat = parseFloat(pickupLat);
  const pLon = parseFloat(pickupLon);
  const dLat = parseFloat(deliveryLat);
  const dLon = parseFloat(deliveryLon);

  if (isNaN(pLat) || isNaN(pLon) || isNaN(dLat) || isNaN(dLon)) {
    throw new Error('Valid numeric coordinates (latitude and longitude) are required for both pickup and delivery locations.');
  }

  // Same point check
  if (pLat === dLat && pLon === dLon) {
    return {
      distanceKm: 0.1,
      durationMin: 1,
      attribution: OSM_ATTRIBUTION,
      isCached: false,
      provider: 'Zero distance (pickup and delivery at identical location)',
      isLiveTraffic: false
    };
  }

  const cacheKey = makeRouteCacheKey(pLat, pLon, dLat, dLon);

  // 1. Check SQLite route cache
  try {
    const cached = await db.get(
      'SELECT distance_km, duration_min, attribution FROM route_cache WHERE cache_key = ?',
      [cacheKey]
    );

    if (cached) {
      return {
        distanceKm: Number(cached.distance_km),
        durationMin: Number(cached.duration_min),
        attribution: cached.attribution || OSM_ATTRIBUTION,
        isCached: true,
        provider: 'OSRM Route Cache',
        isLiveTraffic: false
      };
    }
  } catch (cacheErr) {
    console.warn('⚠️ Route cache read warning:', cacheErr.message);
  }

  // 2. If Google Maps API key is configured, query Google Routes API
  if (GOOGLE_MAPS_API_KEY && GOOGLE_MAPS_API_KEY.trim().length > 0) {
    try {
      return await getGoogleRoute(pLat, pLon, dLat, dLon, cacheKey);
    } catch (googleErr) {
      console.warn('⚠️ Google Routes API failed, falling back to OSRM:', googleErr.message);
    }
  }

  // 3. Query OpenStreetMap OSRM Routing API
  return await getOsrmRoute(pLat, pLon, dLat, dLon, cacheKey);
}

/**
 * Query OSRM router
 */
async function getOsrmRoute(pLat, pLon, dLat, dLon, cacheKey) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  // OSRM coordinates are in longitude,latitude order!
  const coords = `${pLon},${pLat};${dLon},${dLat}`;
  const url = `${OSRM_BASE_URL}/route/v1/${OSRM_PROFILE}/${coords}?overview=false&alternatives=false&steps=false`;

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json'
      }
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`OSRM routing service responded with HTTP status ${response.status} (${response.statusText})`);
    }

    const data = await response.json();

    if (data.code !== 'Ok' || !Array.isArray(data.routes) || data.routes.length === 0) {
      throw new Error(`No drivable road route could be found between these coordinates (${data.code || 'No route'}). Please check that both locations are accessible by road.`);
    }

    const route = data.routes[0];
    const distanceMeters = route.distance;
    const durationSeconds = route.duration;

    // Convert meters to kilometres (minimum 0.1 km)
    const distanceKm = Math.max(0.1, Number((distanceMeters / 1000).toFixed(2)));
    
    // Convert seconds to minutes (minimum 1 minute)
    const durationMin = Math.max(1, Math.round(durationSeconds / 60));

    // Save to SQLite cache asynchronously
    db.run(
      `INSERT OR REPLACE INTO route_cache (cache_key, pickup_lat, pickup_lon, delivery_lat, delivery_lon, distance_km, duration_min, attribution, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [cacheKey, pLat, pLon, dLat, dLon, distanceKm, durationMin, OSM_ATTRIBUTION, new Date().toISOString()]
    ).catch(err => {
      console.warn('⚠️ Failed to cache route:', err.message);
    });

    return {
      distanceKm,
      durationMin,
      attribution: OSM_ATTRIBUTION,
      isCached: false,
      provider: 'OpenStreetMap OSRM',
      isLiveTraffic: false,
      notes: 'Duration estimate is based on statutory road hierarchy and standard speed limits; not live traffic.'
    };

  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error(`OSRM routing request timed out after ${API_TIMEOUT_MS / 1000}s. The public routing server may be busy; please retry.`);
    }
    throw err;
  }
}

/**
 * Optional Google Routes API implementation
 */
async function getGoogleRoute(pLat, pLon, dLat, dLon, cacheKey) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  const url = 'https://routes.googleapis.com/directions/v2:computeRoutes';
  const body = {
    origin: { location: { latLng: { latitude: pLat, longitude: pLon } } },
    destination: { location: { latLng: { latitude: dLat, longitude: dLon } } },
    travelMode: 'DRIVE',
    routingPreference: 'TRAFFIC_AWARE'
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
        'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters'
      },
      body: JSON.stringify(body)
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Google Routes API returned ${response.status}`);
    }

    const data = await response.json();
    if (!data.routes || data.routes.length === 0) {
      throw new Error('Google Routes found no route');
    }

    const route = data.routes[0];
    const distanceMeters = route.distanceMeters || 1000;
    // duration string e.g. "450s"
    const durationSeconds = parseInt(route.duration) || 600;

    const distanceKm = Math.max(0.1, Number((distanceMeters / 1000).toFixed(2)));
    const durationMin = Math.max(1, Math.round(durationSeconds / 60));
    const attribution = 'Route data © Google Maps (Live Traffic)';

    // Cache
    db.run(
      `INSERT OR REPLACE INTO route_cache (cache_key, pickup_lat, pickup_lon, delivery_lat, delivery_lon, distance_km, duration_min, attribution, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [cacheKey, pLat, pLon, dLat, dLon, distanceKm, durationMin, attribution, new Date().toISOString()]
    ).catch(() => {});

    return {
      distanceKm,
      durationMin,
      attribution,
      isCached: false,
      provider: 'Google Routes API',
      isLiveTraffic: true,
      notes: 'Duration reflects live traffic estimates.'
    };
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

module.exports = {
  getRoadRoute,
  OSM_ATTRIBUTION
};
