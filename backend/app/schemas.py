"""
Pydantic schemas for the Waste Classifier API.
"""
from typing import List, Literal
from pydantic import BaseModel, Field


# ── Class labels ────────────────────────────────────────────────────────────
# Alphabetical order matching Keras flow_from_directory / ImageDataGenerator
# training folder convention. Verify against class_indices if available.
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

# ── Per-model prediction ─────────────────────────────────────────────────────

class ModelPrediction(BaseModel):
    model_id: str = Field(..., description="e.g. 'cnn1', 'cnn2', …")
    model_name: str = Field(..., description="Human-readable architecture name")
    label: str = Field(..., description="Predicted class label")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Softmax confidence for top class")
    probabilities: List[float] = Field(
        ..., description="Full softmax vector (9 classes, ordered as CLASS_LABELS)"
    )


# ── Full response ────────────────────────────────────────────────────────────

class PredictResponse(BaseModel):
    final_label: str = Field(..., description="Ensemble/cascade winner label")
    final_confidence: float = Field(..., ge=0.0, le=1.0)
    mode: Literal["ensemble", "cascade"] = Field(
        "ensemble", description="Decision strategy used"
    )
    per_model: List[ModelPrediction] = Field(
        ..., description="Individual prediction from each of the 4 models"
    )
    class_labels: List[str] = Field(
        default=CLASS_LABELS, description="Ordered class label list"
    )
