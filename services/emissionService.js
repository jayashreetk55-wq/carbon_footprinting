/**
 * Emission Service - Handles scientific carbon emission factor benchmarks,
 * emission calculations, lifecycle boundary metadata, and eco-swap alternatives.
 */

// Version and metadata
const EMISSION_FACTORS_VERSION = '2024.1';
const PRIMARY_SOURCE = 'UK Department for Energy Security and Net Zero (DESNZ) / Defra 2024 GHG Conversion Factors & European Life Cycle Assessment (LCA) Studies';

// Configurable emission factors with comprehensive scientific documentation
const EMISSION_FACTORS = {
  vehicles: {
    motorcycle: {
      id: 'motorcycle',
      label: 'Motorcycle / Scooter',
      icon: '🛵',
      factor: 103.2, // g CO2e per km
      unit: 'g CO₂e/km',
      category: 'delivery',
      source: 'UK DESNZ / Defra Greenhouse Gas Conversion Factors',
      sourceYear: 2024,
      lifecycleBoundary: 'Well-to-Wheel (Direct tailpipe fuel combustion + Well-to-Tank upstream fuel supply chain)',
      assumptions: 'Medium standard delivery motorbike (>125cc to 500cc, petrol) in urban stop-and-go driving conditions.'
    },
    car: {
      id: 'car',
      label: 'Car (Petrol / Internal Combustion)',
      icon: '🚗',
      factor: 170.5, // g CO2e per km
      unit: 'g CO₂e/km',
      category: 'delivery',
      source: 'UK DESNZ / Defra Greenhouse Gas Conversion Factors',
      sourceYear: 2024,
      lifecycleBoundary: 'Well-to-Wheel (Direct tailpipe fuel combustion + Well-to-Tank fuel refining & transport)',
      assumptions: 'Average passenger vehicle (petrol engine) used in urban food delivery routes.'
    },
    ev: {
      id: 'ev',
      label: 'Electric Vehicle (EV)',
      icon: '⚡',
      factor: 47.1, // g CO2e per km
      unit: 'g CO₂e/km',
      category: 'delivery',
      source: 'UK DESNZ / Defra 2024 & European Environment Agency (EEA)',
      sourceYear: 2024,
      lifecycleBoundary: 'Well-to-Wheel / Grid-to-Wheel (Scope 2 indirect emissions from electricity generation and grid transmission losses)',
      assumptions: 'Light battery electric vehicle with average energy consumption of 0.19 kWh/km charged via national electricity grid mix (~207 g CO₂e/kWh).'
    },
    bicycle: {
      id: 'bicycle',
      label: 'Bicycle / Walker',
      icon: '🚲',
      factor: 0.0, // Operational emissions
      unit: 'g CO₂e/km',
      category: 'delivery',
      source: 'European Cyclists’ Federation (ECF) & GHG Protocol Scope 1 Boundary',
      sourceYear: 2023,
      lifecycleBoundary: 'Operational Direct Scope 1 (0 g CO₂e/km direct tailpipe emissions). Optional full lifecycle boundary estimated at ~5.0 g CO₂e/km.',
      assumptions: 'Zero tailpipe emissions. Note: When evaluating full cradle-to-grave lifecycle (manufacturing amortization + incremental dietary calorie consumption), emissions are approx. 5.0 g CO₂e/km.'
    }
  },
  packaging: {
    plastic: {
      id: 'plastic',
      label: 'Plastic Takeout Container',
      icon: '🥡',
      factor: 52.0, // g CO2e per container
      unit: 'g CO₂e/container',
      category: 'packaging',
      source: 'Franklin Associates & PlasticsEurope Cradle-to-Grave Life Cycle Assessment',
      sourceYear: 2023,
      lifecycleBoundary: 'Cradle-to-Grave (Polypropylene polymer production, container thermoforming molding, plus typical municipal solid waste incineration/landfill)',
      assumptions: 'Single-use 500-750ml polypropylene (PP) takeout container with matching transparent lid (average mass 25-30g).'
    },
    paper: {
      id: 'paper',
      label: 'Paper / Kraft Cardboard Box',
      icon: '📦',
      factor: 24.5, // g CO2e per container
      unit: 'g CO₂e/container',
      category: 'packaging',
      source: 'European Paper Packaging Alliance (EPPA) Life Cycle Assessment',
      sourceYear: 2023,
      lifecycleBoundary: 'Cradle-to-Grave (Fibre pulping, unbleached kraft board manufacture, converting, and end-of-life composting/recycling)',
      assumptions: 'Single-use biodegradable unbleached kraft paper box or bowl without thick polyethylene lining.'
    },
    reusable: {
      id: 'reusable',
      label: 'Reusable / Deposit Container',
      icon: '🔄',
      factor: 5.2, // g CO2e per use
      unit: 'g CO₂e/use',
      category: 'packaging',
      source: 'Zero Waste Europe & Ellen MacArthur Foundation Life Cycle Analysis',
      sourceYear: 2023,
      lifecycleBoundary: 'Amortized Life Cycle per Use (Container manufacturing amortized over 50+ wash cycles, plus commercial dishwashing energy, water, and detergent footprint)',
      assumptions: 'Returnable stainless steel or durable tempered glass deposit container cleaned in high-efficiency commercial warewashers.'
    }
  }
};

/**
 * Calculate carbon footprint strictly on the server
 */
function calculateEmissions({ distanceKm, deliveryVehicle, packagingType, containerCount }) {
  const dist = Number(distanceKm);
  const containers = Number(containerCount);

  // Retrieve factors (defaulting safely if unknown)
  const vehicle = EMISSION_FACTORS.vehicles[deliveryVehicle] || EMISSION_FACTORS.vehicles.motorcycle;
  const packaging = EMISSION_FACTORS.packaging[packagingType] || EMISSION_FACTORS.packaging.plastic;

  const deliveryEmissions = Number((dist * vehicle.factor).toFixed(2));
  const packagingEmissions = Number((containers * packaging.factor).toFixed(2));
  const totalEmissions = Number((deliveryEmissions + packagingEmissions).toFixed(2));

  // Percentage breakdown
  const denom = totalEmissions > 0 ? totalEmissions : 1;
  const deliveryPct = Math.round((deliveryEmissions / denom) * 100);
  const packagingPct = 100 - deliveryPct;

  // Environmental status categorization
  const status = getEnvironmentalRating(totalEmissions);

  // Real world equivalencies
  const equivalence = getEquivalenceMetrics(totalEmissions);

  // Smart Eco Swap alternative comparisons
  const swaps = calculateEcoSwaps({
    dist,
    containers,
    currentVehicle: vehicle,
    currentPackaging: packaging,
    deliveryEmissions,
    packagingEmissions,
    totalEmissions
  });

  return {
    inputs: {
      distanceKm: dist,
      deliveryVehicle: vehicle.id,
      packagingType: packaging.id,
      containerCount: containers
    },
    emissions: {
      deliveryGrams: deliveryEmissions,
      packagingGrams: packagingEmissions,
      totalGrams: totalEmissions,
      formattedTotal: formatGrams(totalEmissions),
      deliveryPercentage: deliveryPct,
      packagingPercentage: packagingPct
    },
    status,
    equivalence,
    swaps,
    factorsUsed: {
      vehicle: {
        id: vehicle.id,
        label: vehicle.label,
        factor: vehicle.factor,
        unit: vehicle.unit,
        source: vehicle.source,
        assumptions: vehicle.assumptions
      },
      packaging: {
        id: packaging.id,
        label: packaging.label,
        factor: packaging.factor,
        unit: packaging.unit,
        source: packaging.source,
        assumptions: packaging.assumptions
      },
      version: EMISSION_FACTORS_VERSION,
      primarySource: PRIMARY_SOURCE
    }
  };
}

/**
 * Format gram values into g or kg display
 */
function formatGrams(grams) {
  if (grams >= 1000) {
    return {
      value: (grams / 1000).toFixed(2),
      unit: 'kg CO₂e'
    };
  }
  return {
    value: Math.round(grams).toString(),
    unit: 'g CO₂e'
  };
}

/**
 * Environmental impact tier rating
 */
function getEnvironmentalRating(totalGrams) {
  if (totalGrams < 250) {
    return {
      tier: 'low',
      badgeClass: 'status-low',
      badgeText: 'Low Impact 🌱',
      message: 'Excellent eco choice! Minimal delivery transit emissions and packaging footprint.'
    };
  } else if (totalGrams <= 800) {
    return {
      tier: 'moderate',
      badgeClass: 'status-moderate',
      badgeText: 'Moderate Impact 🌿',
      message: 'Moderate footprint. Small tweaks like reusable packaging or bike delivery can lower it even further.'
    };
  } else {
    return {
      tier: 'high',
      badgeClass: 'status-high',
      badgeText: 'High Impact ⚠️',
      message: 'High carbon footprint for a single order. Swapping to bicycle/EV or reusable containers will significantly cut emissions!'
    };
  }
}

/**
 * Calculate intuitive real-world equivalents
 */
function getEquivalenceMetrics(totalGrams) {
  const smartphoneCharges = Math.max(1, Math.round(totalGrams / 8.2));
  const carKmEquivalent = Number((totalGrams / 170.5).toFixed(1));
  const electricKettleMinutes = Math.round(totalGrams / 15);

  return {
    smartphoneCharges,
    carKmEquivalent,
    electricKettleMinutes,
    description: `Equivalent to driving ~${carKmEquivalent} km in a petrol passenger car, boiling an electric kettle for ~${electricKettleMinutes} mins, or charging a smartphone ${smartphoneCharges} times.`
  };
}

/**
 * Calculate green swap opportunities
 */
function calculateEcoSwaps({ dist, containers, currentVehicle, currentPackaging, deliveryEmissions, packagingEmissions, totalEmissions }) {
  const swaps = {};

  // Vehicle swap (comparing to zero-tailpipe bicycle)
  if (currentVehicle.id !== 'bicycle') {
    const bikeTransitEmissions = 0.0;
    const transitSavedGrams = Number((deliveryEmissions - bikeTransitEmissions).toFixed(1));
    const overallReductionPct = totalEmissions > 0 ? Math.round((transitSavedGrams / totalEmissions) * 100) : 0;

    swaps.vehicleSwap = {
      isOptimal: false,
      recommendedVehicle: 'bicycle',
      title: 'Swap to Bicycle Delivery',
      icon: '🚲',
      description: `Switching from ${currentVehicle.label} to Bicycle for this ${dist} km trip eliminates transit fuel emissions completely.`,
      savedGrams: transitSavedGrams,
      reductionPercentage: overallReductionPct
    };
  } else {
    swaps.vehicleSwap = {
      isOptimal: true,
      recommendedVehicle: 'bicycle',
      title: 'Bicycle Transit Selected',
      icon: '🌟',
      description: `You chose zero-tailpipe bicycle delivery for this ${dist} km route. Transit emissions are at zero!`,
      savedGrams: 0,
      reductionPercentage: 0
    };
  }

  // Packaging swap (comparing to reusable)
  if (currentPackaging.id === 'plastic') {
    const reusableEmissions = containers * EMISSION_FACTORS.packaging.reusable.factor;
    const pkgSavedGrams = Number((packagingEmissions - reusableEmissions).toFixed(1));
    const pkgReductionPct = Math.round((pkgSavedGrams / packagingEmissions) * 100);

    swaps.packagingSwap = {
      isOptimal: false,
      recommendedPackaging: 'reusable',
      title: 'Swap to Reusable Containers',
      icon: '🔄',
      description: `Opting for returnable/reusable deposit containers for ${containers} container(s) slashes single-use plastic waste.`,
      savedGrams: pkgSavedGrams,
      reductionPercentage: pkgReductionPct
    };
  } else if (currentPackaging.id === 'paper') {
    const reusableEmissions = containers * EMISSION_FACTORS.packaging.reusable.factor;
    const pkgSavedGrams = Number((packagingEmissions - reusableEmissions).toFixed(1));
    const pkgReductionPct = Math.round((pkgSavedGrams / packagingEmissions) * 100);

    swaps.packagingSwap = {
      isOptimal: false,
      recommendedPackaging: 'reusable',
      title: 'Paper Selected • Reusable Potential',
      icon: '📦',
      description: `Paper is cleaner than plastic. Upgrading to reusable deposit containers would save an additional ~${pkgSavedGrams} g CO₂e.`,
      savedGrams: pkgSavedGrams,
      reductionPercentage: pkgReductionPct
    };
  } else {
    swaps.packagingSwap = {
      isOptimal: true,
      recommendedPackaging: 'reusable',
      title: 'Reusable Packaging Selected',
      icon: '✨',
      description: `You selected reusable packaging! At only ~5.2 g CO₂e per use, you have minimized packaging footprint by ~90% compared to plastic.`,
      savedGrams: 0,
      reductionPercentage: 0
    };
  }

  return swaps;
}

/**
 * Return all configured emission factors and sources
 */
function getEmissionFactorsMetadata() {
  return {
    version: EMISSION_FACTORS_VERSION,
    primarySource: PRIMARY_SOURCE,
    lastUpdated: '2024-06-01',
    disclaimer: 'Emission factors are documented benchmarks based on official government greenhouse gas conversion factors and published Life Cycle Assessments (LCAs). They represent estimated averages for educational and awareness purposes.',
    vehicles: EMISSION_FACTORS.vehicles,
    packaging: EMISSION_FACTORS.packaging
  };
}

module.exports = {
  calculateEmissions,
  getEmissionFactorsMetadata,
  EMISSION_FACTORS,
  EMISSION_FACTORS_VERSION,
  PRIMARY_SOURCE
};
