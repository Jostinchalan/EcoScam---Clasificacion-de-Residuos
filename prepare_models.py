#!/usr/bin/env python3
"""
prepare_models.py — Strip Adam optimizer state from .keras files.

Run this ONCE with your 4 original .keras files in the same directory.
Output files are safe for inference and ~60-75% smaller for CNN4.

Usage:
    python prepare_models.py
    python prepare_models.py --src-dir /path/to/originals --dst-dir backend/app/models
"""
import argparse
import logging
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
log = logging.getLogger(__name__)

CLASS_LABELS = [
    "cardboard", "e-waste", "glass", "metal",
    "organic", "paper", "plastic", "textile", "trash",
]


def prepare(src_dir: Path, dst_dir: Path) -> None:
    try:
        import keras
    except ImportError:
        log.error("keras / tensorflow not found. Install with: pip install tensorflow")
        raise SystemExit(1)

    dst_dir.mkdir(parents=True, exist_ok=True)

    models = ["cnn1", "cnn2", "cnn3", "cnn4"]
    ok = 0

    for name in models:
        src = src_dir / f"{name}.keras"
        dst = dst_dir / f"{name}_inference.keras"

        if not src.exists():
            log.warning("Source file not found, skipping: %s", src)
            continue

        log.info("Loading %s …", src)
        model = keras.models.load_model(str(src), compile=False)

        # Verify output shape
        out = model.output_shape
        n_classes = out[-1]
        if n_classes != len(CLASS_LABELS):
            log.error(
                "%s has %d output units, expected %d. "
                "Check your CLASS_LABELS or the wrong file was used.",
                src.name, n_classes, len(CLASS_LABELS),
            )
            continue

        log.info("  output_shape=%s  params=%d", out, model.count_params())

        # Save without optimizer
        model.save(str(dst), include_optimizer=False)
        size_mb = dst.stat().st_size / 1_048_576
        log.info("  ✓ Saved %s (%.1f MB)", dst.name, size_mb)
        ok += 1

    log.info("\n%d / %d model(s) prepared.", ok, len(models))

    if ok == len(models):
        log.info("Copy the *_inference.keras files to backend/app/models/ and start the server.")
    else:
        log.warning("Some models were skipped. Check warnings above.")


def main():
    parser = argparse.ArgumentParser(description="Prepare .keras models for inference.")
    parser.add_argument(
        "--src-dir", type=Path, default=Path("."),
        help="Directory containing cnn1.keras … cnn4.keras (default: current dir)"
    )
    parser.add_argument(
        "--dst-dir", type=Path, default=Path("backend/app/models"),
        help="Output directory for *_inference.keras files"
    )
    args = parser.parse_args()
    prepare(args.src_dir, args.dst_dir)


if __name__ == "__main__":
    main()
