"""
main.py — FastAPI application entry point.

Serves:
  POST /predict  — image classification endpoint
  GET  /*        — static frontend files (index.html, styles.css, app.js)
"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from . import inference
from .schemas import CLASS_LABELS, ModelPrediction, PredictResponse

# ── Logging ──────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

# ── Lifespan (startup / shutdown) ────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("🚀 Loading models…")
    inference.load_all_models()
    logger.info("✅ Models ready. App is live.")
    yield
    logger.info("👋 Shutting down.")


# ── App ──────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="Waste Classifier API",
    description=(
        "Classifies waste images into 9 categories using an ensemble of 4 CNN models. "
        "Categories: cardboard, e-waste, glass, metal, organic, paper, plastic, textile, trash."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

# Allow any origin during development; restrict in production as needed
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST", "GET", "OPTIONS"],
    allow_headers=["*"],
)

import urllib.request
import urllib.parse
import json

# ── SerpApi Recycling Endpoint ───────────────────────────────────────────────

@app.get("/api/recycling", tags=["map"])
def get_recycling_points(lat: float, lng: float):
    api_key = "97a737488be312b1566d91673c5fbb05be717f3bbab55927bc598c6593094212"
    url = "https://serpapi.com/search.json?" + urllib.parse.urlencode({
        "engine": "google_maps",
        "q": "reciclaje OR recicladora",
        "ll": f"@{lat},{lng},12z",
        "hl": "es",
        "api_key": api_key
    })
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=15) as response:
            return json.loads(response.read().decode())
    except Exception as e:
        return {"error": str(e), "local_results": []}


# ── Health check ─────────────────────────────────────────────────────────────

@app.get("/health", tags=["system"])
def health_check():
    loaded = [m["meta"]["id"] for m in inference._loaded_models]
    return {
        "status": "ok",
        "models_loaded": loaded,
        "class_labels": CLASS_LABELS,
    }


# ── Predict endpoint ─────────────────────────────────────────────────────────

ALLOWED_CONTENT_TYPES = {
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/bmp",
    "image/tiff",
}


@app.post(
    "/predict",
    response_model=PredictResponse,
    summary="Classify a waste image",
    tags=["inference"],
)
async def predict_endpoint(
    file: UploadFile = File(..., description="Image file (JPEG, PNG, WebP, …)"),
    mode: Literal["ensemble", "cascade"] = Query(
        "ensemble",
        description="ensemble = soft-vote average; cascade = escalate by confidence threshold",
    ),
    cascade_threshold: float = Query(
        0.70,
        ge=0.0,
        le=1.0,
        description="Confidence threshold for cascade mode (ignored in ensemble mode)",
    ),
):
    # Basic content-type guard (browsers may omit it; don't hard-fail)
    ct = (file.content_type or "").lower().split(";")[0].strip()
    if ct and ct not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported media type '{ct}'. Send an image file.",
        )

    image_bytes = await file.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Empty file received.")

    try:
        result = inference.predict(
            image_bytes,
            mode=mode,
            cascade_threshold=cascade_threshold,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Unexpected error during prediction.")
        raise HTTPException(
            status_code=500, detail=f"Prediction failed: {exc}"
        ) from exc

    # Build validated response
    per_model_validated = [
        ModelPrediction(**pm) for pm in result["per_model"]
    ]

    return PredictResponse(
        final_label=result["final_label"],
        final_confidence=result["final_confidence"],
        mode=result["mode"],
        per_model=per_model_validated,
        class_labels=result["class_labels"],
    )


# ── Serve frontend as static files ───────────────────────────────────────────

# Resolve frontend dir — works for both local dev and Docker:
#   Local  (uvicorn from backend/): backend/app/main.py → .parent×3 = project_root/frontend ✓
#   Docker (WORKDIR=/app):          /app/app/main.py   → .parent×2 = /app/frontend          ✓
_p3 = Path(__file__).parent.parent.parent / "frontend"  # local
_p2 = Path(__file__).parent.parent / "frontend"          # Docker fallback
FRONTEND_DIR = _p3 if _p3.exists() else _p2

if FRONTEND_DIR.exists():
    # Mount at root — must be LAST so it doesn't shadow API routes
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")
    logger.info("📁 Serving frontend from %s", FRONTEND_DIR)
else:
    logger.warning(
        "Frontend directory not found at %s — API-only mode.", FRONTEND_DIR
    )

    @app.get("/", tags=["system"])
    def root():
        return JSONResponse(
            {"message": "Waste Classifier API is running. Frontend not found."}
        )
