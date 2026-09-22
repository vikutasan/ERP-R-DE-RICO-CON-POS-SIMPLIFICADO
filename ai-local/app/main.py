"""Motor de IA Local — ERP R de Rico.

Este servicio es el MOTOR REAL que el AI Gateway del ERP proxya.
Vive en un contenedor separado (spec §6.1) y expone 4 endpoints:

    GET  /status              -> diagnostico (el ERP lo consulta)
    POST /vision/detect       -> conteo/identificacion de producto
    POST /voice/transcribe    -> audio -> texto (Whisper)
    POST /voice/parse-intent  -> texto -> intencion JSON (LLM via Ollama)

CONTRATO CRITICO (spec §5.2 — human-in-the-loop):
    Este motor PROPONE. Nunca registra stock. El campo `confirmado` NO existe
    aqui a proposito: la confirmacion es responsabilidad del operador en la UI.

REGLA DE ORO (spec §1.2):
    Si este servicio se cae, el ERP sigue operando en modo manual.
    Por eso NUNCA debe lanzar 500: si algo falla, lanza 503.
"""

import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException

from . import schemas
from .engines import vision, voice, nlu, training

logger = logging.getLogger("rderico.ia.motor")
logging.basicConfig(level=logging.INFO)

# ---------------------------------------------------------------------------
# Estado del motor (se llena en el lifespan)
# ---------------------------------------------------------------------------
ESTADO = {
    "whisper_cargado": False,
    "yolo_cargado": False,
    "ollama_disponible": False,
    "errores": [],
}


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Carga los modelos UNA sola vez al arrancar.

    Cargar modelos en cada request seria un desastre de rendimiento.
    Si un modelo falla al cargar, el motor arranca igual pero reporta
    ese motor como no disponible (degradacion parcial, no total).
    """
    logger.info("Cargando motor de IA Local...")

    # --- Whisper (voz) ---
    try:
        voice.cargar_modelo(os.getenv("WHISPER_MODEL", "base"))
        ESTADO["whisper_cargado"] = True
        logger.info("Whisper cargado.")
    except Exception as exc:  # noqa: BLE001
        ESTADO["errores"].append(f"whisper: {exc}")
        logger.error("Whisper NO se pudo cargar: %s", exc)

    # --- YOLO (vision) ---
    try:
        vision.cargar_modelo(os.getenv("YOLO_MODEL", "yolov8n.pt"))
        ESTADO["yolo_cargado"] = True
        logger.info("YOLO cargado.")
    except Exception as exc:  # noqa: BLE001
        ESTADO["errores"].append(f"yolo: {exc}")
        logger.error("YOLO NO se pudo cargar: %s", exc)

    # --- Ollama (LLM) ---
    try:
        ESTADO["ollama_disponible"] = await nlu.verificar_ollama()
        logger.info("Ollama disponible: %s", ESTADO["ollama_disponible"])
        if ESTADO["ollama_disponible"]:
            # Warm-up: carga el modelo en RAM ahora, no en la primera
            # peticion del operador (que moriria por timeout en CPU).
            await nlu.calentar_modelo()
    except Exception as exc:  # noqa: BLE001
        ESTADO["errores"].append(f"ollama: {exc}")
        logger.error("Ollama NO responde: %s", exc)

    logger.info("Motor de IA Local listo. Estado: %s", ESTADO)
    yield
    logger.info("Motor de IA Local detenido.")


app = FastAPI(
    title="ERP R de Rico — Motor de IA Local",
    version="0.1.0",
    description="Whisper + YOLO + LLM en contenedor aislado. El ERP solo conoce su URL.",
    lifespan=lifespan,
)


# ---------------------------------------------------------------------------
# GET /status — diagnostico
# ---------------------------------------------------------------------------
@app.get("/status", response_model=schemas.StatusResponse)
async def status() -> schemas.StatusResponse:
    """Estado del motor. El ERP lo consulta para saber si puede delegar.

    NUNCA lanza error: siempre responde 200 con el estado real.
    Un motor a medias (ej. Whisper si, YOLO no) se reporta como tal.
    """
    return schemas.StatusResponse(
        disponible=any(
            [
                ESTADO["whisper_cargado"],
                ESTADO["yolo_cargado"],
                ESTADO["ollama_disponible"],
            ]
        ),
        whisper=ESTADO["whisper_cargado"],
        yolo=ESTADO["yolo_cargado"],
        ollama=ESTADO["ollama_disponible"],
        errores=ESTADO["errores"],
    )


# ---------------------------------------------------------------------------
# POST /vision/detect — conteo / identificacion
# ---------------------------------------------------------------------------
@app.post("/vision/detect", response_model=schemas.VisionDetectResponse)
async def detect(payload: schemas.VisionDetectRequest) -> schemas.VisionDetectResponse:
    """Detecta y cuenta objetos en una imagen.

    Si YOLO no esta cargado -> 503 (el ERP degrada a manual).
    """
    if not ESTADO["yolo_cargado"]:
        raise HTTPException(
            status_code=503,
            detail={"codigo": "MOTOR_VISION_NO_DISPONIBLE", "mensaje": "YOLO no cargado."},
        )
    try:
        return await vision.detectar(payload)
    except Exception as exc:  # noqa: BLE001
        logger.error("Error en vision: %s", exc)
        raise HTTPException(
            status_code=503,
            detail={"codigo": "MOTOR_VISION_ERROR", "mensaje": str(exc)},
        ) from exc


# ---------------------------------------------------------------------------
# POST /voice/transcribe — audio -> texto
# ---------------------------------------------------------------------------
@app.post("/voice/transcribe", response_model=schemas.VoiceTranscribeResponse)
async def transcribe(payload: schemas.VoiceTranscribeRequest) -> schemas.VoiceTranscribeResponse:
    """Transcribe audio a texto con Whisper.

    Si Whisper no esta cargado -> 503 (el ERP degrada a manual).
    """
    if not ESTADO["whisper_cargado"]:
        raise HTTPException(
            status_code=503,
            detail={"codigo": "MOTOR_VOZ_NO_DISPONIBLE", "mensaje": "Whisper no cargado."},
        )
    try:
        return await voice.transcribir(payload)
    except Exception as exc:  # noqa: BLE001
        logger.error("Error en transcripcion: %s", exc)
        raise HTTPException(
            status_code=503,
            detail={"codigo": "MOTOR_VOZ_ERROR", "mensaje": str(exc)},
        ) from exc


# ---------------------------------------------------------------------------
# POST /voice/parse-intent — texto -> intencion JSON
# ---------------------------------------------------------------------------
@app.post("/voice/parse-intent", response_model=schemas.VoiceParseIntentResponse)
async def parse_intent(payload: schemas.VoiceParseIntentRequest) -> schemas.VoiceParseIntentResponse:
    """Interpreta texto libre y devuelve una intencion estructurada.

    El LLM SOLO devuelve JSON validado por Pydantic. Nunca ejecuta acciones
    (spec §8 — mitigacion de prompt injection).
    """
    if not ESTADO["ollama_disponible"]:
        raise HTTPException(
            status_code=503,
            detail={"codigo": "MOTOR_NLU_NO_DISPONIBLE", "mensaje": "Ollama no disponible."},
        )
    try:
        return await nlu.interpretar(payload)
    except Exception as exc:  # noqa: BLE001
        logger.error("Error en NLU: %s", exc)
        raise HTTPException(
            status_code=503,
            detail={"codigo": "MOTOR_NLU_ERROR", "mensaje": str(exc)},
        ) from exc


# ---------------------------------------------------------------------------
# v7 (Fase 8) — Fine-tuning de YOLO
# ---------------------------------------------------------------------------
# Estos endpoints NO son parte del contrato human-in-the-loop del POS: son
# herramientas de MANTENIMIENTO. El ERP los proxya desde el modulo ai.
# ---------------------------------------------------------------------------
@app.get("/vision/dataset-summary", response_model=schemas.DatasetSummaryResponse)
async def dataset_summary() -> schemas.DatasetSummaryResponse:
    """Resumen del dataset anotado disponible para entrenar.

    Permite a la UI pre-validar ANTES de lanzar un entrenamiento largo:
    si no hay etiquetas, no tiene sentido empezar.
    """
    return schemas.DatasetSummaryResponse(**training._resumen_dataset())


@app.get("/vision/train/status", response_model=schemas.TrainStatusResponse)
async def train_status() -> schemas.TrainStatusResponse:
    """Estado del entrenamiento en curso (o del ultimo).

    NUNCA lanza error: siempre responde 200 con el estado real.
    """
    return schemas.TrainStatusResponse(**training.estado_actual())


@app.post("/vision/train", response_model=schemas.TrainStatusResponse)
async def train(payload: schemas.TrainRequest) -> schemas.TrainStatusResponse:
    """Lanza el fine-tuning de YOLO sobre el dataset anotado.

    BLOQUEANTE respecto al cliente (espera a que termine) pero NO respecto al
    motor: el entrenamiento corre en un SUBPROCESO, asi que /status, /vision/detect
    y /voice/* siguen respondiendo mientras entrena.

    Si ya hay un entrenamiento en curso -> 409.
    Si no hay etiquetas -> 400.
    """
    if training.ESTADO_ENTRENAMIENTO["activo"]:
        raise HTTPException(
            status_code=409,
            detail={"codigo": "ENTRENAMIENTO_EN_CURSO", "mensaje": "Ya hay un entrenamiento en curso."},
        )
    try:
        resultado = await training.entrenar(
            skus=payload.skus,
            epochs=payload.epochs,
            imgsz=payload.imgsz,
            batch=payload.batch,
            run_name=payload.run_name,
        )
    except ValueError as exc:
        # Pre-validacion fallida (sin etiquetas, etc.) -> error del cliente.
        raise HTTPException(
            status_code=400,
            detail={"codigo": "DATASET_INVALIDO", "mensaje": str(exc)},
        ) from exc
    except Exception as exc:  # noqa: BLE001
        logger.error("Error en entrenamiento: %s", exc)
        raise HTTPException(
            status_code=503,
            detail={"codigo": "MOTOR_ENTRENAMIENTO_ERROR", "mensaje": str(exc)},
        ) from exc

    return schemas.TrainStatusResponse(**resultado)
