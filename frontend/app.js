/**
 * app.js — EcoScan Waste Classifier
 * Handles: splash screen, transition loader, file selection, drag-and-drop,
 *          preview, API call, result rendering (ensemble + cascade),
 *          model comparison bars, recycling map (Leaflet + OpenStreetMap).
 */

'use strict';

// ── Constants ────────────────────────────────────────────────────────────────

const API_URL = 'https://odd-forks-send.loca.lt/predict';
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB


/** Must match CLASS_LABELS in backend/app/schemas.py */
const CLASS_META = {
  cardboard: { emoji: '📦', label: 'Cartón', color: '#F5DEB3', bg: '#FFF8EE' },
  'e-waste': { emoji: '💻', label: 'E-waste', color: '#DDB6F2', bg: '#F8EEFF' },
  glass: { emoji: '🫙', label: 'Vidrio', color: '#A8E6CF', bg: '#EFFFEF' },
  metal: { emoji: '🔩', label: 'Metal', color: '#C8D8E4', bg: '#EFF5FA' },
  organic: { emoji: '🥬', label: 'Orgánico', color: '#C8F2A0', bg: '#EFFFDF' },
  paper: { emoji: '📄', label: 'Papel', color: '#FAF2A0', bg: '#FFFFEE' },
  plastic: { emoji: '🧴', label: 'Plástico', color: '#FAC8A0', bg: '#FFF5EE' },
  textile: { emoji: '👕', label: 'Textil', color: '#F2B8CC', bg: '#FFF0F5' },
  trash: { emoji: '🗑️', label: 'Basura', color: '#D0D0D0', bg: '#F5F5F5' },
};

// Recycling guidance per category
const RECYCLING_GUIDE = {
  cardboard: {
    type: 'Reciclaje — Papel/Cartón',
    how: 'Aplasta y pliega las cajas; quita residuos de comida y cintas. Depositar en el contenedor azul (papel y cartón).'
  },
  'e-waste': {
    type: 'Punto verde / Punto limpio',
    how: 'No tirar en la basura común. Llevar a puntos limpios o recogidas especiales; reciclan componentes electrónicos de forma segura.'
  },
  glass: {
    type: 'Reciclaje — Vidrio',
    how: 'Enjuagar si es posible y depositar en los contenedores verdes para vidrio. No mezclar con cerámica o cristales rotos.'
  },
  metal: {
    type: 'Reciclaje — Metal',
    how: 'Limpia restos de comida y deposita en el contenedor amarillo si tu municipio lo acepta, o en puntos limpios para metales.'
  },
  organic: {
    type: 'Compost / Orgánico',
    how: 'Desechar en el contenedor marrón o compostador doméstico. Evitar bolsas de plástico; usar bolsas compostables si es necesario.'
  },
  paper: {
    type: 'Reciclaje — Papel',
    how: 'Doblar y depositar en contenedor azul para papel y cartón. Evitar papel muy sucio o encerado.'
  },
  plastic: {
    type: 'Reciclaje — Plásticos',
    how: 'Enjuagar envases; deposítalos en el contenedor amarillo o según la normativa local. Evita contaminación con restos orgánicos.'
  },
  textile: {
    type: 'Ropa / Textil',
    how: 'Lleva ropa en buen estado a puntos de recolección o tiendas de segunda mano. Ropa rota al contenedor de textil (si existe) o puntos limpios.'
  },
  trash: {
    type: 'Residuos — No reciclable',
    how: 'Depósito en contenedor de rechazo. Si contiene líquidos o peligrosos, llevar al punto limpio.'
  }
};

const MODEL_DISPLAY = {
  cnn1: { name: 'Custom CNN', badge: 'CNN1' },
  cnn2: { name: 'MobileNetV2', badge: 'CNN2' },
  cnn3: { name: 'EfficientNetB0', badge: 'CNN3' },
  cnn4: { name: 'ResNet50V2', badge: 'CNN4' },
};

// Arc circumference for r=35 circle: 2π×35 ≈ 220
const ARC_CIRCUMFERENCE = 2 * Math.PI * 35;

// ── State ────────────────────────────────────────────────────────────────────

let selectedFile = null;
let currentMode = 'ensemble'; // 'ensemble' | 'cascade'

// ── DOM refs ─────────────────────────────────────────────────────────────────

const uploadZone = document.getElementById('upload-zone');
const fileInput = document.getElementById('file-input');
const previewSection = document.getElementById('preview-section');
const previewImg = document.getElementById('preview-img');
const previewFilename = document.getElementById('preview-filename');
const previewFilesize = document.getElementById('preview-filesize');
const btnClassify = document.getElementById('btn-classify');
const btnClear = document.getElementById('btn-clear');
const loadingSection = document.getElementById('loading-section');
const loadingModeText = document.getElementById('loading-mode-text');
const resultSection = document.getElementById('result-section');
const errorBanner = document.getElementById('error-banner');
const errorMsg = document.getElementById('error-msg');
const categoriesGrid = document.querySelector('.categories-grid');
const openHistoryBtn = document.getElementById('open-history');
const historyModal = document.getElementById('history-modal');
const historyListEl = document.getElementById('history-list');
const closeHistoryBtn = document.getElementById('close-history');
const openCameraBtn = document.getElementById('open-camera');
const cameraCard = document.getElementById('camera-card');
const cameraVideo = document.getElementById('camera-video');
const btnCapture = document.getElementById('btn-capture');
const btnCameraClose = document.getElementById('btn-camera-close');
const recycleMmapBtnWrap = document.getElementById('recycle-map-btn-wrap');
const btnOpenMap = document.getElementById('btn-open-map');
let mediaStream = null;

// Result card refs
const resultEmoji = document.getElementById('result-emoji');
const resultLabel = document.getElementById('result-label');
const resultConfidence = document.getElementById('result-confidence');
const resultModeBadge = document.getElementById('result-mode-badge');
const resultModeText = document.getElementById('result-mode-text');
const categoryChip = document.getElementById('category-chip');
const arcFill = document.getElementById('arc-fill');
const arcText = document.getElementById('arc-text');
const modelRows = document.getElementById('model-rows');

// ── Map Modal Logic (Leaflet + OpenStreetMap + Overpass API + Routing) ────────

let leafletMap = null;
let leafletMapInitialized = false;
let currentRouteControl = null;

// Tracking state
let userMarker = null;
let userCircle = null;
let userWatchId = null;

// Función para trazar la ruta en el mismo mapa
window.drawRoute = function (startLat, startLng, endLat, endLng) {
  if (!leafletMap) return;

  if (currentRouteControl) {
    leafletMap.removeControl(currentRouteControl);
  }

  setMapStatus('Calculando la mejor ruta...', 'loading');
  leafletMap.closePopup();

  currentRouteControl = L.Routing.control({
    waypoints: [
      L.latLng(startLat, startLng),
      L.latLng(endLat, endLng)
    ],
    routeWhileDragging: false,
    show: true, // MOSTRAR el panel de instrucciones paso a paso
    collapsible: true, // Permitir colapsarlo
    addWaypoints: false,
    fitSelectedRoutes: true,
    lineOptions: {
      styles: [{ color: '#3b82f6', opacity: 0.8, weight: 6 }]
    },
    createMarker: function () { return null; } // No añadir más marcadores
  }).on('routesfound', function (e) {
    const route = e.routes[0];
    const distanceKm = (route.summary.totalDistance / 1000).toFixed(1);
    const timeMin = Math.round(route.summary.totalTime / 60);
    setMapStatus(`📍 Ruta lista: ${distanceKm} km (aprox. ${timeMin} min)`, 'success');
  }).on('routingerror', function () {
    setMapStatus('Error al calcular la ruta.', 'error');
  }).addTo(leafletMap);
};

function openMapModal() {
  const mapModal = document.getElementById('map-modal');
  if (!mapModal) return;
  mapModal.setAttribute('aria-hidden', 'false');
  mapModal.classList.add('visible');

  // Only initialize once
  if (!leafletMapInitialized) {
    leafletMapInitialized = true;
    initLeafletMap();
  } else if (leafletMap) {
    // Force a size recalculation if map was hidden
    setTimeout(() => leafletMap.invalidateSize(), 200);
  }
}

function closeMapModal() {
  const mapModal = document.getElementById('map-modal');
  if (!mapModal) return;
  mapModal.setAttribute('aria-hidden', 'true');
  mapModal.classList.remove('visible');
}

function setMapStatus(text, state) {
  const dot = document.getElementById('map-status-dot');
  const statusText = document.getElementById('map-status-text');
  if (statusText) statusText.textContent = text;
  if (dot) {
    dot.className = 'map-status-dot';
    if (state) dot.classList.add('dot-' + state);
  }
}

function initLeafletMap() {
  if (typeof L === 'undefined') {
    setMapStatus('Error: Leaflet no disponible. Verifica tu conexión a internet.', 'error');
    return;
  }

  setMapStatus('Obteniendo tu ubicación…', 'loading');

  if (!navigator.geolocation) {
    setMapStatus('Tu navegador no soporta geolocalización. Mostrando mapa por defecto.', 'error');
    loadMapAt(-0.2295, -78.5243, false); // Quito, Ecuador por defecto
    return;
  }

  // Usar watchPosition para actualizaciones en tiempo real
  userWatchId = navigator.geolocation.watchPosition(
    (pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const accuracy = pos.coords.accuracy;

      if (!leafletMap) {
        // Primera vez: inicializa mapa y busca recicladoras
        loadMapAt(lat, lng, true, accuracy);
      } else {
        // Actualización en tiempo real
        if (userMarker) {
          userMarker.setLatLng([lat, lng]);
        }
        if (userCircle) {
          userCircle.setLatLng([lat, lng]);
          userCircle.setRadius(accuracy > 50 ? accuracy : 50);
        }

        // Si hay una ruta activa, centrar el mapa al estilo GPS
        if (currentRouteControl) {
          leafletMap.setView([lat, lng]);
        }
      }
    },
    (err) => {
      if (!leafletMap) {
        console.warn('Geolocation error:', err);
        setMapStatus('No se pudo obtener tu ubicación. Mostrando mapa por defecto.', 'error');
        loadMapAt(-0.2295, -78.5243, false);
      }
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
}

function loadMapAt(lat, lng, hasUserLocation, accuracy = 50) {
  // Initialize Leaflet map
  const mapEl = document.getElementById('recycling-map');
  if (!mapEl) return;

  leafletMap = L.map('recycling-map', {
    center: [lat, lng],
    zoom: 14,
    zoomControl: true,
  });

  // OpenStreetMap tiles (100% free, no API key)
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  }).addTo(leafletMap);

  // User location marker
  if (hasUserLocation) {
    const userIcon = L.divIcon({
      html: `<div style="
        width:18px;height:18px;border-radius:50%;
        background:#3b82f6;border:3px solid #fff;
        box-shadow:0 2px 8px rgba(59,130,246,.6);
      "></div>`,
      className: '',
      iconSize: [18, 18],
      iconAnchor: [9, 9],
    });
    userMarker = L.marker([lat, lng], { icon: userIcon, zIndexOffset: 1000 })
      .addTo(leafletMap)
      .bindPopup('<strong>📍 Tu ubicación</strong>')
      .openPopup();

    // Blue accuracy circle
    userCircle = L.circle([lat, lng], {
      radius: accuracy || 50,
      color: '#3b82f6',
      fillColor: '#3b82f6',
      fillOpacity: 0.07,
      weight: 1.5,
    }).addTo(leafletMap);
  }

  setMapStatus('Buscando puntos de reciclaje cercanos…', 'loading');
  fetchRecyclingPoints(lat, lng);
}

function fetchRecyclingPoints(lat, lng) {
  // Overpass API query: radio muy amplio (50km) y añade 'shop=scrap' (chatarreras/recicladoras)
  const radius = 30000;
  const query = `
    [out:json][timeout:25];
    (
      node["amenity"="recycling"](around:${radius},${lat},${lng});
      node["recycling_type"](around:${radius},${lat},${lng});
      way["amenity"="recycling"](around:${radius},${lat},${lng});
      node["shop"="scrap"](around:${radius},${lat},${lng});
      way["shop"="scrap"](around:${radius},${lat},${lng});
      node["amenity"="waste_disposal"](around:${radius},${lat},${lng});
    );
    out center 150;
  `;

  const cleanQuery = query.replace(/\s+/g, ' ');
  const url = 'https://overpass.kumi.systems/api/interpreter?data=' + encodeURIComponent(cleanQuery.trim());

  fetch(url)
    .then(r => {
      if (!r.ok) {
        throw new Error(`HTTP ${r.status}`);
      }
      return r.json();
    })
    .then(data => {
      const elements = data.elements || [];
      if (!elements.length) {
        setMapStatus(`No se encontraron puntos de reciclaje en ${(radius / 1000).toFixed(0)} km a la redonda.`, 'error');
        return;
      }

      const recyclingIcon = L.divIcon({
        html: `<div style="
          width:28px;height:28px;border-radius:50%;
          background:linear-gradient(135deg,#22c55e,#16a34a);
          border:3px solid #fff;
          box-shadow:0 2px 10px rgba(34,197,94,.55);
          display:flex;align-items:center;justify-content:center;
          font-size:13px;color:#fff;font-weight:700;
        ">♻</div>`,
        className: '',
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });

      let addedCount = 0;
      elements.forEach(el => {
        const pLat = el.lat || el.center?.lat;
        const pLng = el.lon || el.center?.lon;
        if (!pLat || !pLng) return;

        const name = el.tags?.name || el.tags?.operator || 'Punto de reciclaje';
        const types = Object.keys(el.tags || {})
          .filter(k => k.startsWith('recycling:') && el.tags[k] === 'yes')
          .map(k => k.replace('recycling:', ''))
          .join(', ');

        const popupHtml = `
          <div style="min-width:180px; padding-bottom:4px;">
            <strong style="color:#16a34a; font-size:1.05rem;">${name}</strong><br/>
            ${types ? `<small style="color:#666; display:block; margin:4px 0 10px;">♻️ ${types}</small>` : '<div style="height:10px;"></div>'}
            <button type="button" onclick="window.drawRoute(${lat}, ${lng}, ${pLat}, ${pLng})"
               style="display:flex; width:100%; align-items:center; justify-content:center; gap:6px; background:#16a34a; color:#fff; padding:8px 12px; border:none; border-radius:6px; font-weight:bold; font-size:0.9rem; box-shadow:0 2px 4px rgba(22,163,74,0.3); cursor:pointer; transition: background 0.2s;">
               📍 Cómo llegar aquí
            </button>
          </div>
        `;

        L.marker([pLat, pLng], { icon: recyclingIcon })
          .addTo(leafletMap)
          .bindPopup(popupHtml);
        addedCount++;
      });

      setMapStatus(
        `✅ ${addedCount} punto${addedCount !== 1 ? 's' : ''} de reciclaje encontrado${addedCount !== 1 ? 's' : ''} en un radio de ${(radius / 1000).toFixed(0)} km`,
        'success'
      );
    })
    .catch(err => {
      console.error('Overpass API error:', err);
      setMapStatus(`Error al buscar puntos: ${err.message}`, 'error');
    });
}

// Map modal events — usando delegación en document para máxima confiabilidad
document.addEventListener('click', function (e) {
  // Botón abrir mapa
  if (e.target && (e.target.id === 'btn-open-map' || e.target.closest('#btn-open-map'))) {
    e.preventDefault();
    openMapModal();
  }
  // Botón cerrar mapa
  if (e.target && (e.target.id === 'close-map-modal' || e.target.closest('#close-map-modal'))) {
    e.preventDefault();
    closeMapModal();
  }
  // Backdrop del mapa
  if (e.target && e.target.id === 'map-backdrop') {
    closeMapModal();
  }
});

// ── Init categories legend ────────────────────────────────────────────────────

function initCategoriesLegend() {
  categoriesGrid.innerHTML = '';
  Object.entries(CLASS_META).forEach(([key, meta]) => {
    const item = document.createElement('div');
    item.className = 'cat-item';
    item.setAttribute('role', 'listitem');
    item.setAttribute('aria-label', `Categoría: ${meta.label}`);
    item.style.setProperty('--cat-color', meta.color);
    item.style.setProperty('--cat-bg', meta.bg);
    item.innerHTML = `
      <div class="cat-emoji" aria-hidden="true">${meta.emoji}</div>
      <div class="cat-name">${meta.label}</div>
    `;
    categoriesGrid.appendChild(item);
  });
}

// ── Mode toggle ───────────────────────────────────────────────────────────────

document.querySelectorAll('.toggle-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    currentMode = btn.dataset.mode;
    document.querySelectorAll('.toggle-btn').forEach(b => {
      const isActive = b.dataset.mode === currentMode;
      b.classList.toggle('active', isActive);
      b.setAttribute('aria-pressed', String(isActive));
    });
  });
});

// ── File selection helpers ────────────────────────────────────────────────────

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function showPreview(file) {
  selectedFile = file;
  const reader = new FileReader();
  reader.onload = (e) => {
    previewImg.src = e.target.result;
    previewImg.alt = `Vista previa: ${file.name}`;
  };
  reader.readAsDataURL(file);
  previewFilename.textContent = file.name;
  previewFilesize.textContent = formatBytes(file.size);

  // Show preview, hide results/errors
  show(previewSection);
  hide(resultSection);
  hide(errorBanner);
  hide(loadingSection);
}

function clearAll() {
  selectedFile = null;
  fileInput.value = '';
  previewImg.src = '';
  hide(previewSection);
  hide(resultSection);
  hide(loadingSection);
  hide(errorBanner);
}

// ── Upload zone events ────────────────────────────────────────────────────────

uploadZone.addEventListener('click', () => fileInput.click());
uploadZone.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    fileInput.click();
  }
});

fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) handleFile(file);
});

uploadZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  uploadZone.classList.add('drag-over');
});

['dragleave', 'dragend'].forEach(ev => {
  uploadZone.addEventListener(ev, () => uploadZone.classList.remove('drag-over'));
});

uploadZone.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) handleFile(file);
});

function handleFile(file) {
  if (!file.type.startsWith('image/')) {
    showError('El archivo seleccionado no es una imagen válida.');
    return;
  }
  if (file.size > MAX_FILE_SIZE) {
    showError(`El archivo es demasiado grande (${formatBytes(file.size)}). Máximo: 20 MB.`);
    return;
  }
  showPreview(file);
}

// ── Clear & classify buttons ──────────────────────────────────────────────────

btnClear.addEventListener('click', clearAll);

// Botón "Seleccionar foto" (fuera del upload zone)
const btnSelectFile = document.getElementById('btn-select-file');
if (btnSelectFile) btnSelectFile.addEventListener('click', (e) => { e.stopPropagation(); fileInput.click(); });

btnClassify.addEventListener('click', () => {
  if (selectedFile) classify(selectedFile);
});

// ── API call ──────────────────────────────────────────────────────────────────

async function classify(file) {
  // Disable classify button during request
  btnClassify.disabled = true;
  btnClassify.innerHTML = '<span aria-hidden="true"></span> Procesando…';

  hide(resultSection);
  hide(errorBanner);
  show(loadingSection);

  loadingModeText.textContent =
    currentMode === 'ensemble'
      ? 'Ensamble — promediando los 4 modelos CNN'
      : 'Cascada — escalando por confianza';

  // Animate loading steps
  const stepIds = ['step-cnn1', 'step-cnn2', 'step-cnn3', 'step-cnn4'];
  let stepIdx = 0;
  const stepTimer = setInterval(() => {
    stepIds.forEach((id, i) => {
      document.getElementById(id).classList.toggle('active', i === stepIdx);
    });
    stepIdx = (stepIdx + 1) % stepIds.length;
  }, 500);

  const formData = new FormData();
  formData.append('file', file);

  const url = `${API_URL}?mode=${currentMode}`;

  try {
    const resp = await fetch(url, { 
      method: 'POST', 
      body: formData,
      headers: {
        'Bypass-Tunnel-Reminder': 'true',
        'ngrok-skip-browser-warning': 'true'
      }
    });

    clearInterval(stepTimer);
    stepIds.forEach(id => document.getElementById(id).classList.remove('active'));
    hide(loadingSection);

    if (!resp.ok) {
      let detail = `Error ${resp.status}`;
      try {
        const errBody = await resp.json();
        detail = errBody.detail || detail;
      } catch (_) { /* ignore */ }
      showError(detail);
      return;
    }

    const data = await resp.json();
    renderResult(data);
    // Save to history
    try {
      const record = {
        ts: Date.now(),
        label: CLASS_META[data.final_label]?.label || data.final_label,
        confidence: data.final_confidence,
        data_url: previewImg.src || '',
        result: data,
      };
      saveHistoryItem(record);
      renderStatsChart();
    } catch (_) { }

  } catch (err) {
    clearInterval(stepTimer);
    hide(loadingSection);
    showError(
      err.message === 'Failed to fetch'
        ? 'No se pudo conectar con el servidor. ¿Está corriendo el backend?'
        : err.message
    );
  } finally {
    btnClassify.disabled = false;
    btnClassify.innerHTML = '<span aria-hidden="true"></span> Clasificar';
  }
}

// ── History storage & modal ─────────────────────────────────────────────────
const HISTORY_KEY = 'ecoscanner_history_v1';
function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); }
  catch { return []; }
}

function saveHistoryItem(item) {
  try {
    const list = loadHistory();
    list.unshift(item);
    if (list.length > 100) list.splice(100);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
  } catch (_) { }
}

function clearHistory() {
  localStorage.removeItem(HISTORY_KEY);
  renderHistoryList();
}

function renderHistoryList() {
  if (!historyListEl) return;
  const items = loadHistory();
  historyListEl.innerHTML = '';
  if (!items.length) {
    historyListEl.innerHTML = '<p class="muted">No hay clasificaciones en el historial todavía.<br>Clasifica un residuo para que aparezca aquí.</p>';
    return;
  }
  items.forEach((it, idx) => {
    const node = document.createElement('div');
    node.className = 'hist-item';
    const date = new Date(it.ts).toLocaleString('es-ES', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
    const confPct = Math.round((it.confidence || 0) * 100);
    const meta = Object.values(CLASS_META).find(m => m.label === it.label) || null;
    const emoji = meta ? meta.emoji : '';
    const thumbSrc = it.data_url || '';
    const thumbHtml = thumbSrc
      ? `<img src="${thumbSrc}" alt="${it.label}" loading="lazy"/>`
      : `<div style="width:64px;height:64px;border-radius:var(--r-sm);background:var(--surface-2);display:flex;align-items:center;justify-content:center;font-size:0.75rem;color:var(--text-muted);border:1px solid var(--border);">Sin imagen</div>`;

    node.innerHTML = `
      <div class="hist-thumb">${thumbHtml}</div>
      <div class="hist-meta">
        <div class="hist-label">${it.label}</div>
        <div class="hist-sub">${date}</div>
        <div class="hist-conf-pill">${confPct}% confianza</div>
      </div>
      <div class="hist-actions">
        <button class="upload-btn hist-view" style="font-size:0.78rem;padding:0.35rem 0.85rem;" data-idx="${idx}">Ver</button>
      </div>
    `;
    node.querySelector('.hist-view').addEventListener('click', () => {
      renderResult(it.result);
      closeHistory();
    });
    historyListEl.appendChild(node);
  });

  // footer con botón limpiar
  const footer = document.createElement('div');
  footer.className = 'history-footer';
  const clearBtn = document.createElement('button');
  clearBtn.className = 'history-clear';
  clearBtn.textContent = 'Limpiar todo el historial';
  clearBtn.addEventListener('click', () => {
    if (confirm('¿Borrar todo el historial de clasificaciones?')) clearHistory();
  });
  footer.appendChild(clearBtn);
  historyListEl.appendChild(footer);
}


function openHistory() {
  renderHistoryList();
  if (!historyModal) return;
  historyModal.setAttribute('aria-hidden', 'false');
  historyModal.classList.add('visible');
}

function closeHistory() {
  if (!historyModal) return;
  historyModal.setAttribute('aria-hidden', 'true');
  historyModal.classList.remove('visible');
}

if (openHistoryBtn) openHistoryBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); openHistory(); });
if (closeHistoryBtn) closeHistoryBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); closeHistory(); });
// close when clicking backdrop
const historyBackdrop = document.getElementById('history-backdrop');
if (historyBackdrop) historyBackdrop.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); closeHistory(); });

// Fallback: listen at document level in case specific listeners didn't attach
document.addEventListener('click', (e) => {
  const target = e.target;
  if (!target) return;
  if (target.id === 'open-history') {
    e.preventDefault(); e.stopPropagation(); openHistory();
  }
  if (target.id === 'close-history' || target.id === 'history-backdrop') {
    e.preventDefault(); e.stopPropagation(); closeHistory();
  }
});

// ── Result rendering ──────────────────────────────────────────────────────────

function renderResult(data) {
  const { final_label, final_confidence, mode, per_model } = data;
  const meta = CLASS_META[final_label] || CLASS_META.trash;
  const pct = Math.round(final_confidence * 100);

  // Emoji & label
  resultEmoji.textContent = meta.emoji;
  resultLabel.textContent = meta.label;
  resultConfidence.textContent = `${pct}%`;

  // Mode badge
  resultModeText.textContent = mode === 'cascade' ? 'Cascada' : 'Ensamble';

  // Category chip
  categoryChip.innerHTML = '';
  categoryChip.style.background = meta.bg;
  categoryChip.style.border = `1.5px solid ${meta.color}`;
  categoryChip.style.borderRadius = 'var(--r-full)';
  categoryChip.style.padding = '0.3rem 1rem';
  categoryChip.style.marginTop = 'var(--space-md)';
  categoryChip.style.display = 'inline-flex';
  categoryChip.style.fontSize = '0.8rem';
  categoryChip.style.fontWeight = '600';
  categoryChip.style.color = 'var(--text-secondary)';
  categoryChip.innerHTML = `<span aria-hidden="true">${meta.emoji}</span> ${meta.label}`;

  // Recycling recommendation block
  const recoEl = document.getElementById('recycling-reco');
  if (recoEl) {
    const guide = RECYCLING_GUIDE[final_label] || RECYCLING_GUIDE.trash;
    recoEl.innerHTML = `
      <div class="reco-type">${guide.type}</div>
      <div class="reco-how">${guide.how}</div>
    `;
    recoEl.style.display = 'block';
  }

  // Mostrar botón de mapa de reciclaje
  const mapBtnWrap = document.getElementById('recycle-map-btn-wrap');
  if (mapBtnWrap) mapBtnWrap.style.display = 'block';

  // Arc meter
  const dashOffset = ARC_CIRCUMFERENCE * (1 - final_confidence);
  arcFill.style.strokeDasharray = ARC_CIRCUMFERENCE;
  arcFill.style.strokeDashoffset = ARC_CIRCUMFERENCE; // reset first
  // Trigger animation after a tiny delay so CSS transition fires
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      arcFill.style.strokeDashoffset = dashOffset;
    });
  });
  arcText.textContent = `${pct}%`;

  // Model comparison rows
  renderModelRows(per_model, mode);

  // Calcular modelo óptimo
  const optimalMsg = document.getElementById('optimal-model-msg');
  const optimalText = document.getElementById('optimal-model-text');
  if (optimalMsg && optimalText) {
    let bestModel = null;
    let maxConf = -1;

    // Filtramos los modelos que no fueron saltados
    const activeModels = per_model.filter(m => m.label !== '—' && m.confidence !== undefined);

    if (activeModels.length > 0) {
      if (mode === 'cascade') {
        // En cascada, el modelo que dio la predicción final (el último que no falló) es el óptimo
        bestModel = activeModels[activeModels.length - 1];
      } else {
        // En ensamble, buscamos el modelo que tenga la mayor confianza para la clase final
        // (o en general si todos son diferentes, el de mayor confianza global)
        const modelsMatchingFinal = activeModels.filter(m => m.label === final_label);
        const candidates = modelsMatchingFinal.length > 0 ? modelsMatchingFinal : activeModels;

        candidates.forEach(m => {
          if (m.confidence > maxConf) {
            maxConf = m.confidence;
            bestModel = m;
          }
        });
      }
    }

    if (bestModel) {
      const display = MODEL_DISPLAY[bestModel.model_id] || { name: bestModel.model_id };
      const pct = Math.round(bestModel.confidence * 100);
      optimalText.innerHTML = `El <strong>${display.name}</strong> es el más preciso para esta imagen, clasificándola como <em>${bestModel.label}</em> con un <strong>${pct}%</strong> de confianza.`;
      optimalMsg.style.display = 'flex';
    } else {
      optimalMsg.style.display = 'none';
    }
  }

  show(resultSection);
  resultSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function renderModelRows(perModel, mode) {
  modelRows.innerHTML = '';

  perModel.forEach((pm) => {
    const isSkipped = pm.label === '—';
    const pct = Math.round(pm.confidence * 100);
    const display = MODEL_DISPLAY[pm.model_id] || { name: pm.model_id, badge: pm.model_id };
    const classMeta = CLASS_META[pm.label] || null;

    const row = document.createElement('div');
    row.className = 'model-row';
    row.setAttribute('role', 'listitem');
    row.setAttribute('aria-label',
      isSkipped
        ? `${display.name}: no consultado (cascada paró antes)`
        : `${display.name}: ${classMeta ? classMeta.label : pm.label} con ${pct}% de confianza`
    );

    row.innerHTML = `
      <div class="model-row-header">
        <div class="model-row-left">
          <span class="model-id-badge">${display.badge}</span>
          <span class="model-name">${display.name}</span>
          ${!isSkipped
        ? `<span class="model-prediction-label">${classMeta ? classMeta.label : pm.label}</span>`
        : `<span class="skipped-badge" aria-label="No consultado"><span aria-hidden="true">–</span> no consultado</span>`
      }
        </div>
        <span class="model-conf-value" aria-hidden="true">
          ${isSkipped ? '—' : `${pct}%`}
        </span>
      </div>
      <div class="bar-track" role="progressbar"
           aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"
           aria-label="Confianza ${display.badge}">
        <div class="bar-fill ${isSkipped ? 'muted' : ''}"
             id="bar-${pm.model_id}"
             style="width:0%"></div>
      </div>
    `;

    modelRows.appendChild(row);

    // Animate bar
    if (!isSkipped) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const bar = document.getElementById(`bar-${pm.model_id}`);
          if (bar) bar.style.width = `${pct}%`;
        });
      });
    }
  });
}

// ── Camera helpers ──────────────────────────────────────────────────────────
async function openCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showError('Tu navegador no soporta acceso a la cámara.');
    return;
  }
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    if (cameraVideo) cameraVideo.srcObject = mediaStream;
    if (cameraCard) {
      cameraCard.classList.add('visible');
      cameraCard.setAttribute('aria-hidden', 'false');
    }
  } catch (err) {
    showError('No se pudo acceder a la cámara: ' + err.message);
  }
}

function closeCamera() {
  if (mediaStream) {
    mediaStream.getTracks().forEach(t => t.stop());
    mediaStream = null;
  }
  if (cameraVideo) cameraVideo.srcObject = null;
  if (cameraCard) {
    cameraCard.classList.remove('visible');
    cameraCard.setAttribute('aria-hidden', 'true');
  }
}

if (openCameraBtn) openCameraBtn.addEventListener('click', (e) => { e.stopPropagation(); openCamera(); });
if (btnCameraClose) btnCameraClose.addEventListener('click', closeCamera);
if (btnCapture) btnCapture.addEventListener('click', () => {
  if (!cameraVideo) return;
  const w = cameraVideo.videoWidth || 1280;
  const h = cameraVideo.videoHeight || 720;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(cameraVideo, 0, 0, w, h);
  canvas.toBlob((blob) => {
    if (!blob) return;
    const file = new File([blob], `capture-${Date.now()}.jpg`, { type: 'image/jpeg' });
    // show preview and automatically classify
    showPreview(file);
    closeCamera();
    classify(file);
  }, 'image/jpeg', 0.9);
});

// ── Utility: show / hide ──────────────────────────────────────────────────────

function show(el) { el.classList.add('visible'); }
function hide(el) { el.classList.remove('visible'); }

function showError(msg) {
  errorMsg.textContent = msg;
  show(errorBanner);
  hide(loadingSection);
  hide(resultSection);
  errorBanner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ── Init ──────────────────────────────────────────────────────────────────────

let statsChartInstance = null;   // declarado aquí, antes de cualquier llamada

initCategoriesLegend();
renderStatsChart();

// ── Stats chart ───────────────────────────────────────────────────────────────

function renderStatsChart() {
  const items = loadHistory();
  const statsContent = document.getElementById('stats-content');
  const statsEmpty = document.getElementById('stats-empty');
  if (!statsContent || !statsEmpty) return;

  if (!items.length) {
    statsContent.style.display = 'none';
    statsEmpty.style.display = 'block';
    return;
  }

  statsEmpty.style.display = 'none';
  statsContent.style.display = 'flex';

  // Contar ocurrencias por categoría
  const counts = {};
  items.forEach(it => {
    const lbl = it.label || '—';
    counts[lbl] = (counts[lbl] || 0) + 1;
  });

  const labels = Object.keys(counts);
  const data = Object.values(counts);
  const total = items.length;

  // Color por categoría
  const bgColors = labels.map(lbl => {
    const meta = Object.values(CLASS_META).find(m => m.label === lbl);
    return meta ? meta.color : '#D0D0D0';
  });

  const canvas = document.getElementById('stats-chart');
  if (!canvas) return;

  // Destruir instancia anterior para evitar duplicados
  if (statsChartInstance) {
    statsChartInstance.destroy();
    statsChartInstance = null;
  }

  try {
    statsChartInstance = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: bgColors,
          borderColor: '#fff',
          borderWidth: 3,
          hoverOffset: 8,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        cutout: '62%',
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => ` ${ctx.label}: ${ctx.parsed} (${Math.round(ctx.parsed / total * 100)}%)`,
            },
            bodyFont: { family: 'Inter', size: 12 },
          },
        },
      },
    });
  } catch (e) {
    console.error('Error al renderizar gráfica:', e);
  }

  // Barras de resumen lateral
  const summaryEl = document.getElementById('stats-summary');
  if (summaryEl) {
    summaryEl.innerHTML = labels
      .map((lbl, i) => {
        const pct = Math.round(data[i] / total * 100);
        return `
          <div class="stat-row">
            <span class="stat-label" title="${lbl}">${lbl}</span>
            <span class="stat-bar-wrap">
              <span class="stat-bar" style="width:${pct}%;background:${bgColors[i]};"></span>
            </span>
            <span class="stat-count">${data[i]}</span>
          </div>`;
      })
      .join('');
  }
}
