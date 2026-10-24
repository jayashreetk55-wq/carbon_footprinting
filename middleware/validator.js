/**
 * Request Validation Middleware - Validates inputs for all REST endpoints
 */

const VALID_VEHICLES = ['motorcycle', 'car', 'ev', 'bicycle'];
const VALID_PACKAGING = ['plastic', 'paper', 'reusable'];

/**
 * Validate POST /api/route request
 */
function validateRouteRequest(req, res, next) {
  const { pickupAddress, deliveryAddress, pickupCoords, deliveryCoords } = req.body;

  // Direct coordinates passed
  if (pickupCoords && deliveryCoords) {
    const pLat = parseFloat(pickupCoords.lat);
    const pLon = parseFloat(pickupCoords.lon);
    const dLat = parseFloat(deliveryCoords.lat);
    const dLon = parseFloat(deliveryCoords.lon);

    if (isNaN(pLat) || isNaN(pLon) || isNaN(dLat) || isNaN(dLon)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid coordinates provided. Latitude must be between -90 and 90, and longitude between -180 and 180.'
      });
    }

    if (pLat < -90 || pLat > 90 || dLat < -90 || dLat > 90 || pLon < -180 || pLon > 180 || dLon < -180 || dLon > 180) {
      return res.status(400).json({
        success: false,
        error: 'Coordinates are out of geographic bounds.'
      });
    }

    return next();
  }

  // Address strings passed
  if (!pickupAddress || typeof pickupAddress !== 'string' || pickupAddress.trim().length < 2) {
    return res.status(400).json({
      success: false,
      error: 'Please enter a valid pickup address (at least 2 characters).'
    });
  }

  if (!deliveryAddress || typeof deliveryAddress !== 'string' || deliveryAddress.trim().length < 2) {
    return res.status(400).json({
      success: false,
      error: 'Please enter a valid delivery address (at least 2 characters).'
    });
  }

  if (pickupAddress.trim().length > 250 || deliveryAddress.trim().length > 250) {
    return res.status(400).json({
      success: false,
      error: 'Address string is too long (maximum 250 characters).'
    });
  }

  next();
}

/**
 * Validate POST /api/calculate request
 */
function validateCalculateRequest(req, res, next) {
  const { distanceKm, deliveryVehicle, packagingType, containerCount } = req.body;

  const dist = parseFloat(distanceKm);
  if (isNaN(dist) || dist <= 0 || dist > 500) {
    return res.status(400).json({
      success: false,
      error: 'Delivery distance must be a positive number between 0.1 and 500 kilometres.'
    });
  }

  if (!deliveryVehicle || !VALID_VEHICLES.includes(deliveryVehicle.toLowerCase())) {
    return res.status(400).json({
      success: false,
      error: `Invalid delivery vehicle. Must be one of: ${VALID_VEHICLES.join(', ')}.`
    });
  }

  if (!packagingType || !VALID_PACKAGING.includes(packagingType.toLowerCase())) {
    return res.status(400).json({
      success: false,
      error: `Invalid packaging type. Must be one of: ${VALID_PACKAGING.join(', ')}.`
    });
  }

  const count = parseInt(containerCount, 10);
  if (isNaN(count) || count < 1 || count > 50) {
    return res.status(400).json({
      success: false,
      error: 'Container count must be an integer between 1 and 50.'
    });
  }

  next();
}

/**
 * Validate POST /api/orders request
 */
function validateOrderRequest(req, res, next) {
  const { orderName, pickupAddress, deliveryAddress, distanceKm, deliveryVehicle, packagingType, containerCount } = req.body;

  if (!orderName || typeof orderName !== 'string' || orderName.trim().length < 2) {
    return res.status(400).json({
      success: false,
      error: 'Order name is required (at least 2 characters).'
    });
  }

  if (orderName.trim().length > 100) {
    return res.status(400).json({
      success: false,
      error: 'Order name must not exceed 100 characters.'
    });
  }

  const dist = parseFloat(distanceKm);
  if (isNaN(dist) || dist <= 0 || dist > 500) {
    return res.status(400).json({
      success: false,
      error: 'Route distance must be a positive number between 0.1 and 500 km.'
    });
  }

  if (!deliveryVehicle || !VALID_VEHICLES.includes(deliveryVehicle.toLowerCase())) {
    return res.status(400).json({
      success: false,
      error: `Invalid delivery vehicle. Must be one of: ${VALID_VEHICLES.join(', ')}.`
    });
  }

  if (!packagingType || !VALID_PACKAGING.includes(packagingType.toLowerCase())) {
    return res.status(400).json({
      success: false,
      error: `Invalid packaging type. Must be one of: ${VALID_PACKAGING.join(', ')}.`
    });
  }

  const count = parseInt(containerCount, 10);
  if (isNaN(count) || count < 1 || count > 50) {
    return res.status(400).json({
      success: false,
      error: 'Number of containers must be between 1 and 50.'
    });
  }

  next();
}

/**
 * Validate order ID in params
 */
function validateOrderId(req, res, next) {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id) || id <= 0) {
    return res.status(400).json({
      success: false,
      error: 'Invalid order ID. Must be a positive integer.'
    });
  }
  req.parsedOrderId = id;
  next();
}

module.exports = {
  validateRouteRequest,
  validateCalculateRequest,
  validateOrderRequest,
  validateOrderId
};
