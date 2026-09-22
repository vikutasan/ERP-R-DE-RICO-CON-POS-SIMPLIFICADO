# =============================================================================
# Motor de IA Local — ERP R de Rico
# =============================================================================
# Este contenedor es INDEPENDIENTE del API del ERP.
#
# Regla de oro (ESPECIFICACION_IA_LOCAL_Y_MULTIMODAL.md §1.2):
#   "El modulo de almacenes NUNCA debe romperse porque la IA no este."
#
# Por eso el ERP NUNCA importa torch, whisper ni ultralytics.
# El ERP solo conoce una URL (AI_LOCAL_URL) y le habla por HTTP.
#
# Modos soportados (D-2):
#   M1 - Local por sucursal : este contenedor corre en cada sucursal
#   M2 - Local central      : este contenedor corre en la matriz
#   M3 - Nube               : este contenedor NO se usa (AI_LOCAL_URL apunta afuera)
#
# El mismo Dockerfile sirve para M1 y M2. La diferencia es solo donde se corre.
# =============================================================================

FROM python:3.11-slim

# --- Metadatos ---
LABEL org.opencontainers.image.title="ERP R de Rico — Motor de IA Local"
LABEL org.opencontainers.image.description="Whisper (voz) + LLM (NLU) + YOLO (vision) en contenedor aislado"
LABEL org.opencontainers.image.version="0.1.0"

# --- Variables de entorno del contenedor ---
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    # Directorio de modelos (se monta como volumen para no re-descargar)
    MODEL_DIR=/models \
    # Whisper: modelo base por defecto (CPU-friendly). Cambiar a "small" o "medium" si hay GPU.
    WHISPER_MODEL=base \
    # LLM: modelo por defecto (Qwen 2.5 3B es el fallback CPU del spec §8)
    LLM_MODEL=qwen2.5:3b \
    # Vision: modelo YOLO por defecto
    YOLO_MODEL=yolov8n.pt

# --- Dependencias del sistema ---
# ffmpeg      : requerido por Whisper para decodificar audio
# libgl1      : requerido por OpenCV (vision)
# libglib2.0-0: requerido por OpenCV
# curl        : healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends \
        ffmpeg \
        libgl1 \
        libglib2.0-0 \
        curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# --- Dependencias de Python ---
# Se copia primero requirements.txt para aprovechar la cache de capas de Docker.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# --- Codigo del motor ---
COPY app/ ./app/

# --- Directorio de modelos (volumen) ---
RUN mkdir -p /models

# --- Usuario no-root (seguridad) ---
RUN useradd --create-home --shell /bin/bash iauser \
    && chown -R iauser:iauser /app /models
USER iauser

EXPOSE 9000

# --- Healthcheck ---
# El ERP consulta /status; este healthcheck verifica que el motor responde.
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -fsS http://localhost:9000/status || exit 1

# --- Arranque ---
# uvicorn con 1 worker: los modelos cargan en RAM una sola vez.
# Mas workers = mas RAM = riesgo de tumbar el host (spec §8).
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "9000", "--workers", "1"]
