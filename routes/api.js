/**
 * API Routes - All REST endpoints for Food Delivery Carbon Footprint Tracker
 */

const express = require('express');
const router = express.Router();

const db = require('../database/db');
const geocodingService = require('../services/geocodingService');
const routingService = require('../services/routingService');
const emissionService = require('../services/emissionService');
const { routeLimiter } = require('../middleware/rateLimiter');
const {
  validateRouteRequest,
  validateCalculateRequest,
  validateOrderRequest,
  validateOrderId
} = require('../middleware/validator');

/**
 * GET /api/health - Check backend system health and status
 */
router.get('/health', (req, res) => {
  res.json({
    success: true,
    data: {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: db.getDbInstance() ? 'connected' : 'disconnected',
      routingProvider: 'OpenStreetMap OSRM',
      geocodingProvider: 'OpenStreetMap Nominatim',
      version: emissionService.EMISSION_FACTORS_VERSION
    }
  });
});

/**
 * GET /api/emission-factors - Retrieve configured emission factors, sources, and assumptions
 */
router.get('/emission-factors', (req, res) => {
  const metadata = emissionService.getEmissionFactorsMetadata();
  res.json({
    success: true,
    data: metadata
  });
});

/**
 * POST /api/route - Geocode addresses and calculate road-route distance and duration
 */
router.post('/route', routeLimiter, validateRouteRequest, async (req, res, next) => {
  try {
    const { pickupAddress, deliveryAddress, pickupCoords, deliveryCoords } = req.body;

    let pLat, pLon, pDisplay;
    let dLat, dLon, dDisplay;
    let pCached = false, dCached = false;

    // 1. Geocode pickup location
    if (pickupCoords) {
      pLat = parseFloat(pickupCoords.lat);
      pLon = parseFloat(pickupCoords.lon);
      pDisplay = pickupAddress || `${pLat.toFixed(4)}, ${pLon.toFixed(4)}`;
    } else {
      const geoPickup = await geocodingService.geocodeAddress(pickupAddress);
      pLat = geoPickup.lat;
      pLon = geoPickup.lon;
      pDisplay = geoPickup.displayName;
      pCached = geoPickup.isCached;
    }

    // 2. Geocode delivery location
    if (deliveryCoords) {
      dLat = parseFloat(deliveryCoords.lat);
      dLon = parseFloat(deliveryCoords.lon);
      dDisplay = deliveryAddress || `${dLat.toFixed(4)}, ${dLon.toFixed(4)}`;
    } else {
      const geoDelivery = await geocodingService.geocodeAddress(deliveryAddress);
      dLat = geoDelivery.lat;
      dLon = geoDelivery.lon;
      dDisplay = geoDelivery.displayName;
      dCached = geoDelivery.isCached;
    }

    // 3. Compute road route via OSRM
    const route = await routingService.getRoadRoute(pLat, pLon, dLat, dLon);

    res.json({
      success: true,
      data: {
        distanceKm: route.distanceKm,
        durationMin: route.durationMin,
        pickup: {
          query: pickupAddress || `${pLat}, ${pLon}`,
          displayName: pDisplay,
          lat: pLat,
          lon: pLon,
          isCached: pCached
        },
        delivery: {
          query: deliveryAddress || `${dLat}, ${dLon}`,
          displayName: dDisplay,
          lat: dLat,
          lon: dLon,
          isCached: dCached
        },
        attribution: route.attribution,
        provider: route.provider,
        isCached: route.isCached,
        isLiveTraffic: route.isLiveTraffic,
        notes: route.notes || 'Route duration is based on statutory road hierarchy; not live traffic.'
      }
    });

  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/calculate - Calculate estimated carbon emissions
 */
router.post('/calculate', validateCalculateRequest, (req, res, next) => {
  try {
    const { distanceKm, deliveryVehicle, packagingType, containerCount } = req.body;

    const calculation = emissionService.calculateEmissions({
      distanceKm,
      deliveryVehicle,
      packagingType,
      containerCount
    });

    res.json({
      success: true,
      data: calculation
    });

  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/orders - Save a completed calculation to the database
 * Server recalculates emissions from verified inputs to ensure data integrity!
 */
router.post('/orders', validateOrderRequest, async (req, res, next) => {
  try {
    const {
      orderName,
      pickupAddress = 'Not specified',
      deliveryAddress = 'Not specified',
      distanceKm,
      estimatedDurationMin = 0,
      deliveryVehicle,
      packagingType,
      containerCount
    } = req.body;

    // Recalculate on server - NEVER trust frontend emissions totals!
    const calc = emissionService.calculateEmissions({
      distanceKm,
      deliveryVehicle,
      packagingType,
      containerCount
    });

    const nowIso = new Date().toISOString();

    const insertResult = await db.run(
      `INSERT INTO orders (
        order_name,
        pickup_address,
        delivery_address,
        route_distance_km,
        estimated_duration_min,
        delivery_vehicle,
        packaging_type,
        container_count,
        delivery_emissions,
        packaging_emissions,
        total_emissions,
        created_at,
        emission_factor_source,
        emission_factor_version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        orderName.trim(),
        pickupAddress.trim(),
        deliveryAddress.trim(),
        calc.inputs.distanceKm,
        parseInt(estimatedDurationMin, 10) || 0,
        calc.inputs.deliveryVehicle,
        calc.inputs.packagingType,
        calc.inputs.containerCount,
        calc.emissions.deliveryGrams,
        calc.emissions.packagingGrams,
        calc.emissions.totalGrams,
        nowIso,
        emissionService.PRIMARY_SOURCE,
        emissionService.EMISSION_FACTORS_VERSION
      ]
    );

    const savedOrder = {
      id: insertResult.lastID,
      orderName: orderName.trim(),
      pickupAddress: pickupAddress.trim(),
      deliveryAddress: deliveryAddress.trim(),
      distanceKm: calc.inputs.distanceKm,
      estimatedDurationMin: parseInt(estimatedDurationMin, 10) || 0,
      deliveryVehicle: calc.inputs.deliveryVehicle,
      packagingType: calc.inputs.packagingType,
      containerCount: calc.inputs.containerCount,
      deliveryEmissions: calc.emissions.deliveryGrams,
      packagingEmissions: calc.emissions.packagingGrams,
      totalEmissions: calc.emissions.totalGrams,
      formattedTotal: calc.emissions.formattedTotal,
      status: calc.status,
      createdAt: nowIso
    };

    res.status(201).json({
      success: true,
      message: 'Order footprint calculation saved successfully.',
      data: savedOrder
    });

  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/orders - Retrieve all saved calculations
 */
router.get('/orders', async (req, res, next) => {
  try {
    const rows = await db.all(
      `SELECT * FROM orders ORDER BY created_at DESC LIMIT 100`
    );

    const orders = rows.map(row => ({
      id: row.id,
      orderName: row.order_name,
      pickupAddress: row.pickup_address,
      deliveryAddress: row.delivery_address,
      distanceKm: Number(row.route_distance_km),
      estimatedDurationMin: Number(row.estimated_duration_min),
      deliveryVehicle: row.delivery_vehicle,
      packagingType: row.packaging_type,
      containerCount: Number(row.container_count),
      deliveryEmissions: Number(row.delivery_emissions),
      packagingEmissions: Number(row.packaging_emissions),
      totalEmissions: Number(row.total_emissions),
      formattedTotal: (row.total_emissions >= 1000)
        ? { value: (row.total_emissions / 1000).toFixed(2), unit: 'kg CO₂e' }
        : { value: Math.round(row.total_emissions).toString(), unit: 'g CO₂e' },
      createdAt: row.created_at,
      emissionFactorSource: row.emission_factor_source,
      emissionFactorVersion: row.emission_factor_version
    }));

    res.json({
      success: true,
      count: orders.length,
      data: orders
    });

  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/orders/:id - Retrieve a single order by ID
 */
router.get('/orders/:id', validateOrderId, async (req, res, next) => {
  try {
    const orderId = req.parsedOrderId;
    const row = await db.get(
      'SELECT * FROM orders WHERE id = ?',
      [orderId]
    );

    if (!row) {
      return res.status(404).json({
        success: false,
        error: `Order with ID ${orderId} not found.`
      });
    }

    const order = {
      id: row.id,
      orderName: row.order_name,
      pickupAddress: row.pickup_address,
      deliveryAddress: row.delivery_address,
      distanceKm: Number(row.route_distance_km),
      estimatedDurationMin: Number(row.estimated_duration_min),
      deliveryVehicle: row.delivery_vehicle,
      packagingType: row.packaging_type,
      containerCount: Number(row.container_count),
      deliveryEmissions: Number(row.delivery_emissions),
      packagingEmissions: Number(row.packaging_emissions),
      totalEmissions: Number(row.total_emissions),
      formattedTotal: (row.total_emissions >= 1000)
        ? { value: (row.total_emissions / 1000).toFixed(2), unit: 'kg CO₂e' }
        : { value: Math.round(row.total_emissions).toString(), unit: 'g CO₂e' },
      createdAt: row.created_at,
      emissionFactorSource: row.emission_factor_source,
      emissionFactorVersion: row.emission_factor_version
    };

    res.json({
      success: true,
      data: order
    });

  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/orders/:id - Delete an order by ID
 */
router.delete('/orders/:id', validateOrderId, async (req, res, next) => {
  try {
    const orderId = req.parsedOrderId;

    const existing = await db.get('SELECT id FROM orders WHERE id = ?', [orderId]);
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: `Order with ID ${orderId} not found.`
      });
    }

    await db.run('DELETE FROM orders WHERE id = ?', [orderId]);

    res.json({
      success: true,
      message: `Order #${orderId} deleted successfully.`,
      data: { id: orderId }
    });

  } catch (err) {
    next(err);
  }
});

module.exports = router;
