/**
 * Geocoding Service - Converts human-readable addresses to coordinates (lat, lon)
 * Supports OpenStreetMap Nominatim with SQLite caching and timeout handling.
 */

const db = require('../database/db');

const NOMINATIM_BASE_URL = process.env.NOMINATIM_BASE_URL || 'https://nominatim.openstreetmap.org';
const NOMINATIM_USER_AGENT = process.env.NOMINATIM_USER_AGENT || 'FoodDeliveryCarbonTracker/1.0 (college-project; educational-demo)';
const API_TIMEOUT_MS = parseInt(process.env.API_TIMEOUT_MS, 10) || 8000;

/**
 * Geocode an address to latitude and longitude
 * @param {string} address
 * @returns {Promise<{ lat: number, lon: number, displayName: string, isCached: boolean, provider: string }>}
 */
async function geocodeAddress(address) {
  if (!address || typeof address !== 'string' || address.trim().length < 2) {
    throw new Error('Please provide a valid address with at least 2 characters.');
  }

  const normalizedQuery = address.trim().toLowerCase();

  // 1. Check SQLite geocode cache first
  try {
    const cached = await db.get(
      'SELECT lat, lon, display_name FROM geocode_cache WHERE query = ?',
      [normalizedQuery]
    );

    if (cached) {
      return {
        lat: Number(cached.lat),
        lon: Number(cached.lon),
        displayName: cached.display_name,
        isCached: true,
        provider: 'OpenStreetMap Nominatim (Cached)'
      };
    }
  } catch (cacheErr) {
    console.warn('⚠️ Geocode cache read warning:', cacheErr.message);
  }

  // 2. Query Nominatim API with timeout and required User-Agent
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const url = `${NOMINATIM_BASE_URL}/search?q=${encodeURIComponent(address)}&format=json&limit=1&addressdetails=1`;
    
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': NOMINATIM_USER_AGENT,
        'Accept': 'application/json',
        'Accept-Language': 'en'
      }
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Geocoding service returned status ${response.status} (${response.statusText})`);
    }

    const data = await response.json();

    if (!Array.isArray(data) || data.length === 0) {
      throw new Error(`Address could not be found: "${address}". Please enter a more specific location, street, or city.`);
    }

    const result = data[0];
    const lat = parseFloat(result.lat);
    const lon = parseFloat(result.lon);
    const displayName = result.display_name || address;

    if (isNaN(lat) || isNaN(lon)) {
      throw new Error(`Invalid coordinates returned for address: "${address}".`);
    }

    // 3. Save to SQLite cache asynchronously
    db.run(
      `INSERT OR REPLACE INTO geocode_cache (query, lat, lon, display_name, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [normalizedQuery, lat, lon, displayName, new Date().toISOString()]
    ).catch(err => {
      console.warn('⚠️ Failed to save geocode to cache:', err.message);
    });

    return {
      lat,
      lon,
      displayName,
      isCached: false,
      provider: 'OpenStreetMap Nominatim'
    };

  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error(`Geocoding request timed out after ${API_TIMEOUT_MS / 1000}s. Please check your internet connection and try again.`);
    }
    throw err;
  }
}

module.exports = {
  geocodeAddress
};
