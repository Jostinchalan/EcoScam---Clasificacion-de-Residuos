"""
inference.py — Model loading, preprocessing, ensemble & cascade prediction.

All 4 models accept raw uint8/float32 pixels in [0, 255] at 224×224×3.
Normalization is embedded inside each model's graph — NO manual scaling needed.
"""
from __future__ import annotations

import io
import logging
from pathlib import Path
from typing import List, Tuple

import numpy as np
from PIL import Image

logger = logging.getLogger(__name__)

# ── Constants ────────────────────────────────────────────────────────────────

MODELS_DIR = Path(__file__).parent / "models"

MODEL_REGISTRY = [
    {
        "id": "cnn1",
        "name": "Custom CNN",
        "files": ["cnn1_inference.keras", "cnn1.keras"],
        "arch": "3× Conv2D+MaxPool → GAP → Dense64 → Dropout",
    },
    {
        "id": "cnn2",
        "name": "MobileNetV2",
        "files": ["cnn2_inference.keras", "cnn2.keras"],
        "arch": "MobileNetV2 transfer learning",
    },
    {
        "id": "cnn3",
        "name": "EfficientNetB0",
        "files": ["cnn3_inference.keras", "cnn3.keras"],
        "arch": "EfficientNetB0 transfer learning",
    },
    {
        "id": "cnn4",
        "name": "ResNet50V2",
        "files": ["cnn4_inference.keras", "cnn4.keras"],
        "arch": "ResNet50V2 fine-tuned",
    },
]

CLASS_LABELS: List[str] = [
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

TARGET_SIZE = (224, 224)

# Default cascade threshold: escalate to next model if confidence < this value
DEFAULT_CASCADE_THRESHOLD = 0.70

# ── State ────────────────────────────────────────────────────────────────────

_loaded_models: List[dict] = []  # list of {"meta": {...}, "model": keras_model}


# ── Startup / loading ────────────────────────────────────────────────────────

def load_all_models() -> None:
    """
    Load all 4 Keras models from MODELS_DIR.
    Called once during FastAPI lifespan startup.
    Gracefully skips models whose files are missing (useful during dev).
    """
    import keras  # imported here to avoid slow import at module level

    _loaded_models.clear()
    missing: List[str] = []

    for meta in MODEL_REGISTRY:
        path = None
        loaded_file = None
        for filename in meta["files"]:
            candidate_path = MODELS_DIR / filename
            if candidate_path.exists():
                path = candidate_path
                loaded_file = filename
                break
        
        if not path:
            logger.warning("Model file not found for %s — skipping.", meta["name"])
            missing.append(meta["files"][0])
            continue
            
        logger.info("Loading %s from %s …", meta["name"], path)
        model = keras.models.load_model(str(path), compile=False)

        # Sanity-check output shape
        out_shape = model.output_shape
        if out_shape[-1] != len(CLASS_LABELS):
            raise ValueError(
                f"{loaded_file}: expected {len(CLASS_LABELS)} output classes, "
                f"got {out_shape[-1]}. Check CLASS_LABELS order!"
            )
        logger.info(
            "✓ %s loaded — output_shape=%s params=%s",
            meta["name"],
            out_shape,
            model.count_params(),
        )
        _loaded_models.append({"meta": meta, "model": model})

    if missing:
        logger.warning(
            "⚠ %d model(s) missing: %s\n"
            "Place the *_inference.keras files in %s and restart.",
            len(missing),
            missing,
            MODELS_DIR,
        )
    if not _loaded_models:
        raise RuntimeError(
            f"No models found in {MODELS_DIR}. "
            "Run prepare_models.py and copy the *_inference.keras files there."
        )
    logger.info("✓ %d / 4 model(s) ready.", len(_loaded_models))


# ── Preprocessing ────────────────────────────────────────────────────────────

def preprocess_image(image_bytes: bytes) -> np.ndarray:
    """
    Decode raw image bytes → numpy array (1, 224, 224, 3) float32 in [0, 255].
    Each model handles its own normalization internally.
    """
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    img = img.resize(TARGET_SIZE, Image.Resampling.LANCZOS)
    arr = np.array(img, dtype=np.float32)        # (224, 224, 3)  values 0–255
    return np.expand_dims(arr, axis=0)            # (1, 224, 224, 3)


# ── Per-model inference ──────────────────────────────────────────────────────

def _run_model(entry: dict, img_array: np.ndarray) -> Tuple[str, float, List[float]]:
    """
    Run a single model and return (label, confidence, full_probs).
    """
    probs: np.ndarray = entry["model"].predict(img_array, verbose=0)[0]  # (9,)
    probs_list = probs.tolist()
    idx = int(np.argmax(probs))
    label = CLASS_LABELS[idx]
    confidence = float(probs[idx])
    return label, confidence, probs_list


# ── Ensemble (soft voting) ───────────────────────────────────────────────────

def ensemble_predict(img_array: np.ndarray) -> Tuple[str, float, List[dict]]:
    """
    Average softmax probabilities across all loaded models.
    Returns: (final_label, final_confidence, per_model_results)
    """
    per_model_results: List[dict] = []
    prob_stack: List[np.ndarray] = []

    for entry in _loaded_models:
        label, conf, probs = _run_model(entry, img_array)
        prob_stack.append(np.array(probs))
        per_model_results.append(
            {
                "model_id": entry["meta"]["id"],
                "model_name": entry["meta"]["name"],
                "label": label,
                "confidence": conf,
                "probabilities": probs,
            }
        )

    avg_probs = np.mean(prob_stack, axis=0)
    final_idx = int(np.argmax(avg_probs))
    final_label = CLASS_LABELS[final_idx]
    final_confidence = float(avg_probs[final_idx])

    return final_label, final_confidence, per_model_results


# ── Cascade (confidence-threshold escalation) ────────────────────────────────

def cascade_predict(
    img_array: np.ndarray,
    threshold: float = DEFAULT_CASCADE_THRESHOLD,
) -> Tuple[str, float, List[dict]]:
    """
    Try CNN1 → CNN2 → CNN3 → CNN4.
    Stops at the first model whose top-class confidence ≥ threshold.
    All model results are returned for UI display; unused models show 0 confidence.
    """
    per_model_results: List[dict] = []
    final_label = CLASS_LABELS[0]
    final_confidence = 0.0

    for entry in _loaded_models:
        label, conf, probs = _run_model(entry, img_array)
        per_model_results.append(
            {
                "model_id": entry["meta"]["id"],
                "model_name": entry["meta"]["name"],
                "label": label,
                "confidence": conf,
                "probabilities": probs,
            }
        )
        if conf >= threshold:
            final_label = label
            final_confidence = conf
            logger.debug(
                "Cascade stopped at %s (conf=%.3f ≥ %.2f)",
                entry["meta"]["id"],
                conf,
                threshold,
            )
            break
    else:
        # All models ran without reaching threshold — use last model's result
        last = per_model_results[-1]
        final_label = last["label"]
        final_confidence = last["confidence"]

    # Pad remaining entries if cascade stopped early (models not queried)
    already_run = {r["model_id"] for r in per_model_results}
    for meta in MODEL_REGISTRY:
        if meta["id"] not in already_run:
            per_model_results.append(
                {
                    "model_id": meta["id"],
                    "model_name": meta["name"],
                    "label": "—",
                    "confidence": 0.0,
                    "probabilities": [0.0] * len(CLASS_LABELS),
                }
            )

    return final_label, final_confidence, per_model_results


# ── Public entrypoint ────────────────────────────────────────────────────────

def predict(
    image_bytes: bytes,
    mode: str = "ensemble",
    cascade_threshold: float = DEFAULT_CASCADE_THRESHOLD,
) -> dict:
    """
    Full pipeline: bytes → preprocess → models → result dict.
    """
    if not _loaded_models:
        raise RuntimeError("No models loaded. Check startup logs.")

    img_array = preprocess_image(image_bytes)

    if mode == "cascade":
        final_label, final_confidence, per_model = cascade_predict(
            img_array, threshold=cascade_threshold
        )
    else:
        final_label, final_confidence, per_model = ensemble_predict(img_array)

    return {
        "final_label": final_label,
        "final_confidence": final_confidence,
        "mode": mode,
        "per_model": per_model,
        "class_labels": CLASS_LABELS,
    }
