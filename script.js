/**
 * Food Delivery Carbon Footprint Tracker - Frontend Integration
 * Connects to the Express & SQLite backend REST API:
 * - OSRM road routing & Nominatim geocoding (/api/route)
 * - Server-side scientific emissions calculation (/api/calculate)
 * - SQLite order persistence & retrieval (/api/orders)
 * - Scientific emission factor benchmarks (/api/emission-factors)
 */

// ---------------------------------------------------------------------------
// 1. State Management & Constants
// ---------------------------------------------------------------------------
const API_BASE = '/api';

let emissionFactorsCache = null;
let emissionsChartInstance = null;
let currentCalculatedRoute = null;

// ---------------------------------------------------------------------------
// 2. DOM Elements Cache
// ---------------------------------------------------------------------------
const form = document.getElementById('footprint-form');
const orderNameInput = document.getElementById('order-name');
const pickupAddressInput = document.getElementById('pickup-address');
const deliveryAddressInput = document.getElementById('delivery-address');
const distanceInput = document.getElementById('delivery-distance');
const containerCountInput = document.getElementById('container-count');

// Buttons & Spinners
const btnFindRoute = document.getElementById('btn-find-route');
const routeBtnText = document.getElementById('route-btn-text');
const routeIcon = document.getElementById('route-icon');
const routeSpinner = document.getElementById('route-spinner');
const btnCalculate = document.getElementById('btn-calculate');
const calcBtnText = document.getElementById('calc-btn-text');
const calcIcon = document.getElementById('calc-icon');
const calcSpinner = document.getElementById('calc-spinner');
const btnReset = document.getElementById('btn-reset');
const btnDecrement = document.getElementById('btn-decrement');
const btnIncrement = document.getElementById('btn-increment');

// Route Card & Alert Elements
const routeApiAlert = document.getElementById('route-api-alert');
const alertTitle = document.getElementById('alert-title');
const alertMessage = document.getElementById('alert-message');
const alertCloseBtn = document.getElementById('alert-close-btn');

const routeInfoCard = document.getElementById('route-info-card');
const routeDistanceDisplay = document.getElementById('route-distance-display');
const routeDurationDisplay = document.getElementById('route-duration-display');
const routeCacheStatus = document.getElementById('route-cache-status');
const pickupGeocodedDisplay = document.getElementById('pickup-geocoded-display');
const deliveryGeocodedDisplay = document.getElementById('delivery-geocoded-display');
const routeAttributionText = document.getElementById('route-attribution-text');

// Results elements
const resultsSection = document.getElementById('results-section');
const resultsOrderNameDisplay = document.getElementById('results-order-name-display');
const totalEmissionsNumber = document.getElementById('total-emissions-number');
const totalEmissionsUnit = document.getElementById('total-emissions-unit');
const resultStatusPill = document.getElementById('result-status-pill');
const statusPillText = document.getElementById('status-pill-text');
const friendlyStatusText = document.getElementById('friendly-status-text');
const equivalenceText = document.getElementById('equivalence-text');

// Breakdown elements
const barDelivery = document.getElementById('bar-delivery');
const barPackaging = document.getElementById('bar-packaging');
const pctDelivery = document.getElementById('pct-delivery');
const pctPackaging = document.getElementById('pct-packaging');
const deliveryEmissionsVal = document.getElementById('delivery-emissions-val');
const packagingEmissionsVal = document.getElementById('packaging-emissions-val');
const deliveryCalcDetails = document.getElementById('delivery-calc-details');
const packagingCalcDetails = document.getElementById('packaging-calc-details');
const legendMethodName = document.getElementById('legend-method-name');
const legendPkgName = document.getElementById('legend-pkg-name');
const chartLegendDelivery = document.getElementById('chart-legend-delivery');
const chartLegendPackaging = document.getElementById('chart-legend-packaging');
const swapContentText = document.getElementById('swap-content-text');

// History elements
const historyContainer = document.getElementById('history-container');
const btnClearHistory = document.getElementById('btn-clear-history');
const btnExportHistory = document.getElementById('btn-export-history');
const clearConfirmModal = document.getElementById('clear-confirm-modal');
const modalCancelBtn = document.getElementById('modal-cancel-btn');
const modalConfirmBtn = document.getElementById('modal-confirm-btn');
const toastContainer = document.getElementById('toast-container');

// ---------------------------------------------------------------------------
// 3. API Helpers
// ---------------------------------------------------------------------------

/**
 * Fetch with unified JSON error handling
 */
async function apiRequest(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const defaultHeaders = {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  };

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        ...defaultHeaders,
        ...(options.headers || {})
      }
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      const errMsg = (data && data.error) ? data.error : `HTTP ${response.status} (${response.statusText})`;
      throw new Error(errMsg);
    }

    return data;
  } catch (err) {
    if (err.name === 'TypeError' && err.message.includes('fetch')) {
      throw new Error('Could not connect to the backend server. Please verify the server is running on http://localhost:3000.');
    }
    throw err;
  }
}

/**
 * Fetch emission factors metadata from server
 */
async function loadEmissionFactors() {
  try {
    const res = await apiRequest('/emission-factors');
    if (res && res.success && res.data) {
      emissionFactorsCache = res.data;
      console.log('✅ Emission factors loaded from server:', emissionFactorsCache.version);
    }
  } catch (err) {
    console.warn('⚠️ Could not load remote emission factors:', err.message);
  }
}

// ---------------------------------------------------------------------------
// 4. Real-World Route Calculation (OSRM & Nominatim)
// ---------------------------------------------------------------------------

function setRouteLoading(isLoading) {
  if (isLoading) {
    btnFindRoute.disabled = true;
    routeSpinner.style.display = 'inline-block';
    routeIcon.style.display = 'none';
    routeBtnText.textContent = 'Calculating Route...';
    hideRouteAlert();
  } else {
    btnFindRoute.disabled = false;
    routeSpinner.style.display = 'none';
    routeIcon.style.display = 'inline-block';
    routeBtnText.textContent = 'Calculate Road Route (OSRM)';
  }
}

function showRouteAlert(message, title = 'Routing Notice:', isError = true) {
  alertTitle.textContent = title;
  alertMessage.textContent = message;
  routeApiAlert.className = `api-alert ${isError ? 'api-alert-error' : ''}`;
  routeApiAlert.style.display = 'flex';
  routeApiAlert.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function hideRouteAlert() {
  routeApiAlert.style.display = 'none';
}

if (alertCloseBtn) {
  alertCloseBtn.addEventListener('click', hideRouteAlert);
}

/**
 * Request real-world road route from backend
 */
async function calculateRoadRoute() {
  const pickup = pickupAddressInput.value.trim();
  const delivery = deliveryAddressInput.value.trim();

  if (!pickup) {
    showRouteAlert('Please enter a pickup address (e.g. restaurant name or street).', 'Pickup Address Required:');
    pickupAddressInput.focus();
    return;
  }

  if (!delivery) {
    showRouteAlert('Please enter a delivery destination address.', 'Delivery Address Required:');
    deliveryAddressInput.focus();
    return;
  }

  setRouteLoading(true);

  try {
    const res = await apiRequest('/route', {
      method: 'POST',
      body: JSON.stringify({
        pickupAddress: pickup,
        deliveryAddress: delivery
      })
    });

    if (!res.success || !res.data) {
      throw new Error(res.error || 'Failed to calculate route.');
    }

    const routeData = res.data;
    currentCalculatedRoute = routeData;

    // Automatically populate distance input
    distanceInput.value = routeData.distanceKm;
    distanceInput.dispatchEvent(new Event('input'));

    // Populate route details card
    routeDistanceDisplay.textContent = `${routeData.distanceKm} km`;
    routeDurationDisplay.textContent = `~${routeData.durationMin} mins`;
    routeCacheStatus.textContent = routeData.isCached ? 'Cached Route' : 'Live OSRM Route';
    pickupGeocodedDisplay.textContent = routeData.pickup.displayName;
    pickupGeocodedDisplay.title = routeData.pickup.displayName;
    deliveryGeocodedDisplay.textContent = routeData.delivery.displayName;
    deliveryGeocodedDisplay.title = routeData.delivery.displayName;
    routeAttributionText.textContent = routeData.attribution || '© OpenStreetMap contributors, routing by OSRM';

    routeInfoCard.style.display = 'block';
    showToast(`Road route calculated: ${routeData.distanceKm} km (~${routeData.durationMin} mins)`, 'success');

  } catch (err) {
    console.error('Route calculation error:', err);
    currentCalculatedRoute = null;
    routeInfoCard.style.display = 'none';
    showRouteAlert(err.message, 'Route Calculation Error:');
    showToast(err.message, 'danger');
  } finally {
    setRouteLoading(false);
  }
}

btnFindRoute.addEventListener('click', calculateRoadRoute);

// Demo route chips
document.querySelectorAll('.route-demo-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    const p = chip.getAttribute('data-pickup');
    const d = chip.getAttribute('data-delivery');
    pickupAddressInput.value = p;
    deliveryAddressInput.value = d;
    calculateRoadRoute();
  });
});

// ---------------------------------------------------------------------------
// 5. Form Validation & Interaction
// ---------------------------------------------------------------------------

function getSelectedRadioValue(name) {
  const checked = document.querySelector(`input[name="${name}"]:checked`);
  return checked ? checked.value : null;
}

function validateForm() {
  let isValid = true;

  // Validate Order Name
  const nameVal = orderNameInput.value.trim();
  const nameError = document.getElementById('order-name-error');
  if (!nameVal || nameVal.length < 2) {
    orderNameInput.classList.add('user-invalid');
    orderNameInput.setAttribute('aria-invalid', 'true');
    nameError.style.display = 'block';
    isValid = false;
  } else {
    orderNameInput.classList.remove('user-invalid');
    orderNameInput.removeAttribute('aria-invalid');
    nameError.style.display = 'none';
  }

  // Validate Distance
  const distVal = parseFloat(distanceInput.value);
  const distError = document.getElementById('distance-error');
  if (isNaN(distVal) || distVal < 0.1 || distVal > 100) {
    distanceInput.classList.add('user-invalid');
    distanceInput.setAttribute('aria-invalid', 'true');
    distError.style.display = 'block';
    isValid = false;
  } else {
    distanceInput.classList.remove('user-invalid');
    distanceInput.removeAttribute('aria-invalid');
    distError.style.display = 'none';
  }

  // Validate Container Count
  const countVal = parseInt(containerCountInput.value, 10);
  const countError = document.getElementById('container-error');
  if (isNaN(countVal) || countVal < 1 || countVal > 30) {
    containerCountInput.classList.add('user-invalid');
    containerCountInput.setAttribute('aria-invalid', 'true');
    countError.style.display = 'block';
    isValid = false;
  } else {
    containerCountInput.classList.remove('user-invalid');
    containerCountInput.removeAttribute('aria-invalid');
    countError.style.display = 'none';
  }

  return isValid;
}

// Clear invalid styles on input
[orderNameInput, distanceInput, containerCountInput].forEach(input => {
  input.addEventListener('input', () => {
    input.classList.remove('user-invalid');
    input.removeAttribute('aria-invalid');
    const err = input.closest('.form-group')?.querySelector('.error-msg');
    if (err) err.style.display = 'none';
  });
});

// Stepper buttons
btnDecrement.addEventListener('click', () => {
  let current = parseInt(containerCountInput.value, 10) || 1;
  if (current > 1) {
    containerCountInput.value = current - 1;
    containerCountInput.dispatchEvent(new Event('input'));
  }
});

btnIncrement.addEventListener('click', () => {
  let current = parseInt(containerCountInput.value, 10) || 1;
  if (current < 30) {
    containerCountInput.value = current + 1;
    containerCountInput.dispatchEvent(new Event('input'));
  }
});

// Suggestion chips
document.querySelectorAll('.chip-btn[data-fill]').forEach(btn => {
  btn.addEventListener('click', () => {
    const text = btn.getAttribute('data-fill');
    orderNameInput.value = text;
    orderNameInput.focus();
    orderNameInput.dispatchEvent(new Event('input'));
  });
});

// Distance preset buttons
document.querySelectorAll('.preset-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const dist = btn.getAttribute('data-dist');
    distanceInput.value = dist;
    distanceInput.focus();
    distanceInput.dispatchEvent(new Event('input'));
  });
});

// Reset form
btnReset.addEventListener('click', () => {
  form.reset();
  containerCountInput.value = '2';
  document.getElementById('method-motorcycle').checked = true;
  document.getElementById('pkg-plastic').checked = true;
  currentCalculatedRoute = null;
  routeInfoCard.style.display = 'none';
  hideRouteAlert();

  // Clear validation styles
  document.querySelectorAll('.error-msg').forEach(el => el.style.display = 'none');
  document.querySelectorAll('.form-control').forEach(el => {
    el.classList.remove('user-invalid');
    el.removeAttribute('aria-invalid');
  });

  showToast('Calculator form reset to defaults.', 'info');
});

// ---------------------------------------------------------------------------
// 6. Chart.js Visualization & Fallback
// ---------------------------------------------------------------------------

function renderChart(deliveryGrams, packagingGrams) {
  const canvas = document.getElementById('emissionsChart');
  if (!canvas) return;

  if (typeof Chart === 'undefined') {
    canvas.style.display = 'none';
    return;
  }

  if (emissionsChartInstance) {
    emissionsChartInstance.destroy();
  }

  const ctx = canvas.getContext('2d');
  const deliveryColor = '#2d6a4f';
  const packagingColor = '#e09f3e';

  const dataValues = [
    Math.max(0, Math.round(deliveryGrams)),
    Math.max(0, Math.round(packagingGrams))
  ];

  emissionsChartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Delivery', 'Packaging'],
      datasets: [{
        data: dataValues,
        backgroundColor: [deliveryColor, packagingColor],
        borderColor: '#ffffff',
        borderWidth: 2,
        hoverOffset: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      cutout: '68%',
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#143626',
          titleFont: { family: 'Outfit', size: 13 },
          bodyFont: { family: 'Plus Jakarta Sans', size: 12 },
          padding: 10,
          cornerRadius: 8,
          callbacks: {
            label: function(context) {
              const val = context.raw || 0;
              const total = dataValues[0] + dataValues[1];
              const pct = total > 0 ? Math.round((val / total) * 100) : 0;
              return ` ${context.label}: ${val} g CO₂e (${pct}%)`;
            }
          }
        }
      },
      animation: {
        duration: 650,
        easing: 'easeOutQuart'
      }
    }
  });
}

// ---------------------------------------------------------------------------
// 7. Dynamic Results Display
// ---------------------------------------------------------------------------

function displayResults(calcData, orderName) {
  const { emissions, status, equivalence, swaps, factorsUsed, inputs } = calcData;

  // Format Total
  totalEmissionsNumber.textContent = emissions.formattedTotal.value;
  totalEmissionsUnit.textContent = emissions.formattedTotal.unit;
  resultsOrderNameDisplay.textContent = `Server Analysis for: "${orderName}"`;

  // Status message & pill
  resultStatusPill.className = `status-pill ${status.badgeClass}`;
  statusPillText.textContent = status.badgeText;
  friendlyStatusText.textContent = status.message;

  // Real world equivalence
  equivalenceText.textContent = equivalence.description;

  // Breakdown progress bar & metrics
  pctDelivery.textContent = `${emissions.deliveryPercentage}%`;
  pctPackaging.textContent = `${emissions.packagingPercentage}%`;
  barDelivery.style.width = `${emissions.deliveryPercentage}%`;
  barPackaging.style.width = `${emissions.packagingPercentage}%`;

  deliveryEmissionsVal.textContent = `${Math.round(emissions.deliveryGrams)} g CO₂e`;
  deliveryCalcDetails.textContent = `${inputs.distanceKm} km × ${factorsUsed.vehicle.factor} g/km (${factorsUsed.vehicle.label})`;

  packagingEmissionsVal.textContent = `${Math.round(emissions.packagingGrams)} g CO₂e`;
  packagingCalcDetails.textContent = `${inputs.containerCount} container(s) × ${factorsUsed.packaging.factor} g (${factorsUsed.packaging.label})`;

  // Chart legend
  legendMethodName.textContent = `${factorsUsed.vehicle.label} (${inputs.distanceKm} km)`;
  chartLegendDelivery.textContent = `${Math.round(emissions.deliveryGrams)} g CO₂e`;

  legendPkgName.textContent = `${factorsUsed.packaging.label} (${inputs.containerCount} items)`;
  chartLegendPackaging.textContent = `${Math.round(emissions.packagingGrams)} g CO₂e`;

  // Render Chart
  renderChart(emissions.deliveryGrams, emissions.packagingGrams);

  // Render Smart Eco Swaps
  let swapHtml = '<div class="swap-comparison-grid">';

  if (swaps.vehicleSwap) {
    swapHtml += `
      <div class="swap-box">
        <div class="swap-box-title">
          <span aria-hidden="true">${swaps.vehicleSwap.icon}</span> ${swaps.vehicleSwap.title}
        </div>
        <p>${swaps.vehicleSwap.description}</p>
        ${!swaps.vehicleSwap.isOptimal ? `
          <span class="swap-savings">
            Saves ~${swaps.vehicleSwap.savedGrams} g CO₂e (${swaps.vehicleSwap.reductionPercentage}% total reduction)
          </span>
        ` : `
          <span class="swap-savings">Optimal transit choice</span>
        `}
      </div>
    `;
  }

  if (swaps.packagingSwap) {
    swapHtml += `
      <div class="swap-box">
        <div class="swap-box-title">
          <span aria-hidden="true">${swaps.packagingSwap.icon}</span> ${swaps.packagingSwap.title}
        </div>
        <p>${swaps.packagingSwap.description}</p>
        ${!swaps.packagingSwap.isOptimal ? `
          <span class="swap-savings">
            Saves ~${swaps.packagingSwap.savedGrams} g CO₂e (${swaps.packagingSwap.reductionPercentage}% packaging reduction)
          </span>
        ` : `
          <span class="swap-savings">Lowest packaging impact</span>
        `}
      </div>
    `;
  }

  swapHtml += '</div>';
  swapContentText.innerHTML = swapHtml;

  // Reveal results section
  resultsSection.classList.remove('hidden');
  resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---------------------------------------------------------------------------
// 8. Order Submission (Calculate & Save to SQLite)
// ---------------------------------------------------------------------------

function setCalcLoading(isLoading) {
  if (isLoading) {
    btnCalculate.disabled = true;
    calcSpinner.style.display = 'inline-block';
    calcIcon.style.display = 'none';
    calcBtnText.textContent = 'Calculating & Saving...';
  } else {
    btnCalculate.disabled = false;
    calcSpinner.style.display = 'none';
    calcIcon.style.display = 'inline-block';
    calcBtnText.textContent = 'Calculate Carbon Footprint';
  }
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  if (!validateForm()) {
    showToast('Please fix the highlighted fields in the calculator.', 'danger');
    return;
  }

  const orderName = orderNameInput.value.trim();
  const distanceKm = parseFloat(distanceInput.value);
  const containerCount = parseInt(containerCountInput.value, 10);
  const deliveryVehicle = getSelectedRadioValue('deliveryMethod') || 'motorcycle';
  const packagingType = getSelectedRadioValue('packagingType') || 'plastic';

  const pickupAddress = pickupAddressInput.value.trim() || (currentCalculatedRoute ? currentCalculatedRoute.pickup.displayName : 'Manual Distance');
  const deliveryAddress = deliveryAddressInput.value.trim() || (currentCalculatedRoute ? currentCalculatedRoute.delivery.displayName : 'Direct');
  const estimatedDurationMin = currentCalculatedRoute ? currentCalculatedRoute.durationMin : 0;

  setCalcLoading(true);

  try {
    // 1. Request scientific emissions calculation from backend
    const calcRes = await apiRequest('/calculate', {
      method: 'POST',
      body: JSON.stringify({
        distanceKm,
        deliveryVehicle,
        packagingType,
        containerCount
      })
    });

    if (!calcRes.success || !calcRes.data) {
      throw new Error(calcRes.error || 'Emissions calculation failed on server.');
    }

    // 2. Display calculation results
    displayResults(calcRes.data, orderName);

    // 3. Persist verified order to SQLite database
    const orderRes = await apiRequest('/orders', {
      method: 'POST',
      body: JSON.stringify({
        orderName,
        pickupAddress,
        deliveryAddress,
        distanceKm,
        estimatedDurationMin,
        deliveryVehicle,
        packagingType,
        containerCount
      })
    });

    if (orderRes.success) {
      showToast(`Saved calculation #${orderRes.data.id} (${Math.round(calcRes.data.emissions.totalGrams)} g CO₂e) to database.`, 'success');
      loadOrderHistory(); // Refresh history table
    }

  } catch (err) {
    console.error('Submission error:', err);
    showToast(err.message, 'danger');
  } finally {
    setCalcLoading(false);
  }
});

// ---------------------------------------------------------------------------
// 9. Order History (Loaded from SQLite Database)
// ---------------------------------------------------------------------------

async function loadOrderHistory() {
  try {
    const res = await apiRequest('/orders');
    if (!res.success || !Array.isArray(res.data)) {
      throw new Error(res.error || 'Failed to load order history.');
    }

    renderOrderHistory(res.data);
  } catch (err) {
    console.error('History load error:', err);
    historyContainer.innerHTML = `
      <div class="history-empty">
        <span class="empty-icon" aria-hidden="true">⚠️</span>
        <h3 class="empty-title">Could not load saved orders</h3>
        <p class="empty-text">${err.message}</p>
        <button type="button" class="btn btn-sm btn-outline" onclick="loadOrderHistory()">Retry Connection</button>
      </div>
    `;
    btnClearHistory.style.display = 'none';
    btnExportHistory.style.display = 'none';
  }
}

function getVehicleIcon(vehicle) {
  switch (vehicle) {
    case 'motorcycle': return '🛵';
    case 'car': return '🚗';
    case 'ev': return '⚡';
    case 'bicycle': return '🚲';
    default: return '🚗';
  }
}

function getPackagingIcon(pkg) {
  switch (pkg) {
    case 'plastic': return '🥡';
    case 'paper': return '📦';
    case 'reusable': return '🔄';
    default: return '🥡';
  }
}

function renderOrderHistory(orders) {
  if (!orders || orders.length === 0) {
    historyContainer.innerHTML = `
      <div class="history-empty">
        <span class="empty-icon" aria-hidden="true">🌱</span>
        <h3 class="empty-title">No orders recorded in SQLite yet</h3>
        <p class="empty-text">
          Use the calculator above to estimate emissions for your food deliveries. 
          Calculations are verified and stored securely in the SQLite database.
        </p>
        <a href="#calculator" class="btn btn-sm btn-primary">Calculate First Order</a>
      </div>
    `;
    btnClearHistory.style.display = 'none';
    btnExportHistory.style.display = 'none';
    return;
  }

  btnClearHistory.style.display = 'inline-flex';
  btnExportHistory.style.display = 'inline-flex';

  let html = '<div class="history-list">';

  orders.forEach(order => {
    const dateStr = new Date(order.createdAt).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    const isLow = order.totalEmissions < 250;
    const isModerate = order.totalEmissions >= 250 && order.totalEmissions <= 800;
    const statusClass = isLow ? 'status-low' : (isModerate ? 'status-moderate' : 'status-high');
    const statusText = isLow ? 'Low Impact 🌱' : (isModerate ? 'Moderate 🌿' : 'High ⚠️');

    const vIcon = getVehicleIcon(order.deliveryVehicle);
    const pIcon = getPackagingIcon(order.packagingType);

    const hasRoute = order.pickupAddress && order.deliveryAddress && order.pickupAddress !== 'Manual Distance';
    const routeSummary = hasRoute ? `${order.pickupAddress} → ${order.deliveryAddress}` : `${order.distanceKm} km route`;

    html += `
      <div class="history-card" data-order-id="${order.id}">
        <div class="history-col-main">
          <strong class="history-order-name">${escapeHtml(order.orderName)}</strong>
          <span class="history-date">${dateStr} • #${order.id}</span>
          <span class="history-route-path" title="${escapeHtml(routeSummary)}">🗺️ ${escapeHtml(routeSummary)}</span>
        </div>

        <div class="history-col-detail">
          <span class="history-detail-label">Transit</span>
          <span class="history-detail-val">${vIcon} ${capitalize(order.deliveryVehicle)} (${order.distanceKm} km)</span>
        </div>

        <div class="history-col-detail">
          <span class="history-detail-label">Packaging</span>
          <span class="history-detail-val">${pIcon} ${capitalize(order.packagingType)} (${order.containerCount} items)</span>
        </div>

        <div class="history-col-emissions">
          <div class="history-emissions-num">${order.formattedTotal.value} ${order.formattedTotal.unit}</div>
          <span class="status-pill ${statusClass}" style="padding: 0.15rem 0.5rem; font-size: 0.7rem; align-self: flex-start;">
            ${statusText}
          </span>
        </div>

        <div class="history-col-actions">
          <button type="button" class="history-action-btn load-order-btn" title="Reload into calculator" data-id="${order.id}">
            Recalculate
          </button>
          <button type="button" class="history-delete-btn delete-order-btn" title="Delete record" data-id="${order.id}" aria-label="Delete #${order.id}">
            ✕
          </button>
        </div>
      </div>
    `;
  });

  html += '</div>';
  historyContainer.innerHTML = html;

  // Bind actions
  historyContainer.querySelectorAll('.load-order-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = parseInt(btn.getAttribute('data-id'), 10);
      const order = orders.find(o => o.id === id);
      if (order) reloadOrderToForm(order);
    });
  });

  historyContainer.querySelectorAll('.delete-order-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = parseInt(btn.getAttribute('data-id'), 10);
      await deleteOrder(id);
    });
  });
}

function reloadOrderToForm(order) {
  orderNameInput.value = order.orderName;
  distanceInput.value = order.distanceKm;
  containerCountInput.value = order.containerCount;

  if (order.pickupAddress && order.pickupAddress !== 'Manual Distance') {
    pickupAddressInput.value = order.pickupAddress;
  }
  if (order.deliveryAddress && order.deliveryAddress !== 'Direct') {
    deliveryAddressInput.value = order.deliveryAddress;
  }

  const vRadio = document.querySelector(`input[name="deliveryMethod"][value="${order.deliveryVehicle}"]`);
  if (vRadio) vRadio.checked = true;

  const pRadio = document.querySelector(`input[name="packagingType"][value="${order.packagingType}"]`);
  if (pRadio) pRadio.checked = true;

  form.dispatchEvent(new Event('submit'));
  showToast(`Reloaded order #${order.id}: "${order.orderName}"`, 'info');
}

async function deleteOrder(orderId) {
  try {
    const res = await apiRequest(`/orders/${orderId}`, { method: 'DELETE' });
    if (res.success) {
      showToast(`Order #${orderId} deleted from SQLite database.`, 'info');
      loadOrderHistory();
    }
  } catch (err) {
    showToast(err.message, 'danger');
  }
}

// Clear all orders modal
btnClearHistory.addEventListener('click', () => {
  if (typeof clearConfirmModal.showModal === 'function') {
    clearConfirmModal.showModal();
  } else {
    if (confirm('Are you sure you want to delete all saved calculations from the SQLite database?')) {
      clearAllHistory();
    }
  }
});

modalCancelBtn.addEventListener('click', () => {
  clearConfirmModal.close();
});

modalConfirmBtn.addEventListener('click', async () => {
  clearConfirmModal.close();
  await clearAllHistory();
});

async function clearAllHistory() {
  try {
    const res = await apiRequest('/orders');
    if (res.success && Array.isArray(res.data)) {
      for (const order of res.data) {
        await apiRequest(`/orders/${order.id}`, { method: 'DELETE' });
      }
      showToast('All order history cleared from SQLite database.', 'info');
      loadOrderHistory();
    }
  } catch (err) {
    showToast(err.message, 'danger');
  }
}

// Export CSV
btnExportHistory.addEventListener('click', async () => {
  try {
    const res = await apiRequest('/orders');
    if (!res.success || !res.data || res.data.length === 0) {
      showToast('No orders to export.', 'info');
      return;
    }

    const orders = res.data;
    const headers = [
      'Order ID',
      'Date & Time (UTC)',
      'Food Order Name',
      'Pickup Address',
      'Delivery Address',
      'Route Distance (km)',
      'Est Duration (min)',
      'Delivery Vehicle',
      'Delivery Emissions (g CO2e)',
      'Packaging Type',
      'Container Count',
      'Packaging Emissions (g CO2e)',
      'Total Emissions (g CO2e)',
      'Primary Source'
    ];

    const rows = orders.map(o => [
      o.id,
      `"${o.createdAt}"`,
      `"${o.orderName.replace(/"/g, '""')}"`,
      `"${(o.pickupAddress || '').replace(/"/g, '""')}"`,
      `"${(o.deliveryAddress || '').replace(/"/g, '""')}"`,
      o.distanceKm,
      o.estimatedDurationMin,
      `"${o.deliveryVehicle}"`,
      Math.round(o.deliveryEmissions),
      `"${o.packagingType}"`,
      o.containerCount,
      Math.round(o.packagingEmissions),
      Math.round(o.totalEmissions),
      `"${(o.emissionFactorSource || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map(r => r.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `carbon_tracker_orders_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showToast('Database order history exported as CSV.', 'success');
  } catch (err) {
    showToast('Failed to export CSV: ' + err.message, 'danger');
  }
});

// ---------------------------------------------------------------------------
// 10. Utilities & Notifications
// ---------------------------------------------------------------------------

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.setAttribute('role', 'status');
  toast.textContent = message;

  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 300);
  }, 3400);
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

const currentYearEl = document.getElementById('current-year');
if (currentYearEl) {
  currentYearEl.textContent = new Date().getFullYear();
}

// ---------------------------------------------------------------------------
// 11. Initial Application Bootstrapping
// ---------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
  // Load emission factors metadata from server
  await loadEmissionFactors();

  // Load existing orders from SQLite database
  await loadOrderHistory();

  // Populate friendly initial example in form
  if (!orderNameInput.value) {
    orderNameInput.value = 'Veggie Burrito Bowl & Kombucha';
    pickupAddressInput.value = 'Times Square, New York';
    deliveryAddressInput.value = 'Empire State Building, New York';
    distanceInput.value = '1.8';
    containerCountInput.value = '2';
  }
});
