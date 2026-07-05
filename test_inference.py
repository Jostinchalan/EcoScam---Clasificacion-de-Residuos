"""Test end-to-end inference against the running local server."""
import io
import json
import urllib.request
import numpy as np
from PIL import Image

# Create a small solid-colour test image (224x224 green)
img = Image.fromarray(np.full((224, 224, 3), [80, 160, 60], dtype="uint8"))
buf = io.BytesIO()
img.save(buf, format="PNG")
img_bytes = buf.getvalue()

BOUNDARY = "----EcoScanTestBoundary"
body = (
    f"--{BOUNDARY}\r\n"
    f"Content-Disposition: form-data; name=\"file\"; filename=\"test.png\"\r\n"
    f"Content-Type: image/png\r\n\r\n"
).encode() + img_bytes + f"\r\n--{BOUNDARY}--\r\n".encode()

req = urllib.request.Request(
    "http://127.0.0.1:8000/predict?mode=ensemble",
    data=body,
    headers={"Content-Type": f"multipart/form-data; boundary={BOUNDARY}"},
    method="POST",
)

with urllib.request.urlopen(req) as resp:
    result = json.loads(resp.read())

print("final_label      :", result["final_label"])
print("final_confidence :", f"{result['final_confidence']*100:.1f}%")
print("mode             :", result["mode"])
print("models used      :", [m["model_id"] for m in result["per_model"]])
print("\nEND-TO-END OK")
