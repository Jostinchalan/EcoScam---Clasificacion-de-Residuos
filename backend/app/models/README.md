# Models Directory

Place your 4 optimized Keras model files here before running the app:

```
backend/app/models/
├── cnn1_inference.keras   (~0.4 MB)
├── cnn2_inference.keras   (~9.2 MB)
├── cnn3_inference.keras   (~16.1 MB)
└── cnn4_inference.keras   (~90.9 MB)
```

## How to generate these files

Run `prepare_models.py` (located at the project root) with your original `.keras` files:

```bash
# From the project root, with original .keras files in the same directory:
python prepare_models.py
```

This strips the Adam optimizer state (unnecessary for inference), reducing file sizes significantly.

## Class label order

The models were trained with 9 output classes in **alphabetical** folder order:

| Index | Label |
|-------|-------|
| 0 | cardboard |
| 1 | e-waste |
| 2 | glass |
| 3 | metal |
| 4 | organic |
| 5 | paper |
| 6 | plastic |
| 7 | textile |
| 8 | trash |

If your `class_indices.json` differs, update `CLASS_LABELS` in `backend/app/schemas.py`.
