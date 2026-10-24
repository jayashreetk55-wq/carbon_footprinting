/**
 * Rate Limiter Middleware - Protects backend endpoints and respects
 * OpenStreetMap Nominatim and OSRM public usage policies.
 */

const rateLimit = require('express-rate-limit');

// General API rate limiter
const apiLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000, // 15 mins
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 150,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many requests from this IP address. Please wait a few moments before trying again.'
  }
});

// Stricter rate limiter specifically for external routing & geocoding requests
const routeLimiter = rateLimit({
  windowMs: parseInt(process.env.ROUTE_RATE_LIMIT_WINDOW_MS, 10) || 60 * 1000, // 1 minute
  max: parseInt(process.env.ROUTE_RATE_LIMIT_MAX_REQUESTS, 10) || 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Routing request limit reached. Please wait 1 minute before requesting another route calculation.'
  }
});

module.exports = {
  apiLimiter,
  routeLimiter
};
