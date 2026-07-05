# ── Base image ────────────────────────────────────────────────────────────────
FROM python:3.11-slim

# ── System deps ───────────────────────────────────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
        libglib2.0-0 \
        libsm6 \
        libxext6 \
        libxrender1 \
        libgl1 \
    && rm -rf /var/lib/apt/lists/*

# ── Working directory mirrors the local project root ──────────────────────────
# This makes FRONTEND_DIR in main.py resolve identically in Docker and locally
WORKDIR /workspace

# ── Python dependencies ───────────────────────────────────────────────────────
COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

# ── Application code ──────────────────────────────────────────────────────────
COPY backend/app ./backend/app

# ── Frontend static files ─────────────────────────────────────────────────────
COPY frontend ./frontend

# ── Port ──────────────────────────────────────────────────────────────────────
EXPOSE 8000

# ── Start from the backend directory so app.main:app resolves correctly ───────
WORKDIR /workspace/backend
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
