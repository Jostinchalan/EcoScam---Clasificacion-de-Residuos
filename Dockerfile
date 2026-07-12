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
WORKDIR /workspace

# ── Python dependencies ───────────────────────────────────────────────────────
COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

# ── Application code ──────────────────────────────────────────────────────────
COPY backend/app ./backend/app

# ── Frontend static files ─────────────────────────────────────────────────────
COPY frontend ./frontend

# ── Port ──────────────────────────────────────────────────────────────────────
# Hugging Face Spaces usa el puerto 7860 por defecto
EXPOSE 7860

# ── Start from the backend directory so app.main:app resolves correctly ───────
WORKDIR /workspace/backend
CMD sh -c "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-7860} --workers 1"
