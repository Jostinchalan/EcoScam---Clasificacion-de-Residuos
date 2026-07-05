/**
 * app.js — EcoScan Waste Classifier
 * Handles: file selection, drag-and-drop, preview, API call,
 *          result rendering (ensemble + cascade), model comparison bars.
 */

'use strict';

// ── Constants ────────────────────────────────────────────────────────────────

const API_URL = '/predict';
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

btnClassify.addEventListener('click', () => {
  if (selectedFile) classify(selectedFile);
});

// ── API call ──────────────────────────────────────────────────────────────────

async function classify(file) {
  // Disable classify button during request
  btnClassify.disabled = true;
  btnClassify.innerHTML = '<span aria-hidden="true">⏳</span> Procesando…';

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
    const resp = await fetch(url, { method: 'POST', body: formData });

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
    btnClassify.innerHTML = '<span aria-hidden="true">🔍</span> Clasificar';
  }
}

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
        ? `<span class="model-prediction-label">
                ${classMeta ? `<span aria-hidden="true">${classMeta.emoji}</span> ` : ''}
                ${classMeta ? classMeta.label : pm.label}
               </span>`
        : `<span class="skipped-badge" aria-label="No consultado">
                <span aria-hidden="true">–</span> no consultado
               </span>`
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

initCategoriesLegend();
