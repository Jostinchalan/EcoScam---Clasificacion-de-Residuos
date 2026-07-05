# EcoScan — Waste Classifier

**Classify waste images** into 9 categories using an ensemble of 4 CNN models.  
Single-service architecture: one FastAPI process serves both the API and the frontend.

---

## Categories

| Index | Label | Icon |
|-------|-------|------|
| 0 | cardboard | 📦 |
| 1 | e-waste | 💻 |
| 2 | glass | 🫙 |
| 3 | metal | 🔩 |
| 4 | organic | 🥬 |
| 5 | paper | 📄 |
| 6 | plastic | 🧴 |
| 7 | textile | 👕 |
| 8 | trash | 🗑️ |

---

## Project Structure

```
waste-classifier-app/
├── backend/
│   ├── app/
│   │   ├── main.py            # FastAPI app + endpoints
│   │   ├── inference.py       # Model loading + ensemble/cascade
│   │   ├── schemas.py         # Pydantic request/response models
│   │   └── models/            # ← Place *_inference.keras here
│   │       └── README.md
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── prepare_models.py          # Optimizer-stripping utility
└── README.md
```

---

## Quick Start

### Step 0 — Prepare models (one-time)

Place your 4 original `.keras` files in the project root, then run:

```bash
pip install tensorflow
python prepare_models.py
```

This generates the 4 `*_inference.keras` files in `backend/app/models/`.

> **Verify the output:** each model must print `output_shape=(None, 9)`.

### Step 1 — Install dependencies

```bash
cd backend
pip install -r requirements.txt
```

### Step 2 — Run locally

```bash
# From the project root:
uvicorn backend.app.main:app --reload --port 8000
```

Or from within `backend/`:

```bash
cd backend
uvicorn app.main:app --reload --port 8000
```

Open **http://localhost:8000** in your browser.  
API docs: **http://localhost:8000/docs**

---

## Docker

### Build

```bash
# From the project root (where Dockerfile lives):
docker build -f backend/Dockerfile -t ecoscan .
```

### Run

```bash
docker run -p 8000:8000 ecoscan
```

---

## API Reference

### `POST /predict`

Classify a waste image.

**Request:** `multipart/form-data`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `file` | image | ✅ | JPEG, PNG, WebP, … |
| `mode` | `ensemble` \| `cascade` | ✗ | Default: `ensemble` |
| `cascade_threshold` | float 0–1 | ✗ | Default: `0.70` (cascade only) |

**Response:** `application/json`

```json
{
  "final_label": "plastic",
  "final_confidence": 0.923,
  "mode": "ensemble",
  "per_model": [
    {
      "model_id": "cnn1",
      "model_name": "Custom CNN",
      "label": "plastic",
      "confidence": 0.91,
      "probabilities": [0.00, 0.00, 0.01, 0.00, 0.01, 0.01, 0.91, 0.05, 0.01]
    }
    // ... 3 more
  ],
  "class_labels": ["cardboard", "e-waste", "glass", "metal", "organic", "paper", "plastic", "textile", "trash"]
}
```

### `GET /health`

Returns loaded model IDs and class labels.

---

## Prediction Modes

| Mode | Strategy | When to use |
|------|----------|-------------|
| **Ensemble** (default) | Average softmax of all 4 models | Best accuracy |
| **Cascade** | CNN1 → CNN2 → CNN3 → CNN4, stops when confidence ≥ threshold | Faster on easy images |

---

## Deployment

### Render / Railway

1. Push the repo to GitHub.
2. Create a new Web Service pointing to the repo.
3. Set **Dockerfile path**: `backend/Dockerfile`.
4. Set **Port**: `8000`.

### Fly.io

```bash
fly launch --dockerfile backend/Dockerfile --name ecoscan
fly deploy
```

### Hugging Face Spaces

Create a Space with **Docker** SDK, upload the repo, set `PORT=7860` in the Dockerfile `EXPOSE` line.

---

## Class Label Verification

If you have a `class_indices.json` from training, compare it to the array in `backend/app/schemas.py`:

```python
CLASS_LABELS = [
    "cardboard",  # 0
    "e-waste",    # 1
    "glass",      # 2
    "metal",      # 3
    "organic",    # 4
    "paper",      # 5
    "plastic",    # 6
    "textile",    # 7
    "trash",      # 8
]
```

If the order differs, update this list (and the copy in `inference.py`) before running inference.

---

## Phase 2 Roadmap

- [ ] Grad-CAM heatmap overlay
- [ ] Nearest recycling point geolocation
- [ ] Impact dashboard (CO2 estimate per category)
- [ ] PWA with offline CNN1/TFLite
- [ ] Web Speech API voice output
- [ ] User correction button for retraining
