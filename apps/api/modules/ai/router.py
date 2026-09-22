"""v7 (Fase 5): AI Gateway — endpoints stub.

Todos los endpoints devuelven 503 IA_NO_DISPONIBLE mientras el motor de IA
Local no este instalado. La UI traduce ese 503 a un toast informativo y el
operador continua en modo manual. El POS no se ve afectado.
"""

from fastapi import APIRouter

from . import schemas, service

router = APIRouter()


@router.get("/status")
async def status():
    """Diagnostico del gateway. Util para saber si la IA esta encendida."""
    return service.estado_gateway()


@router.post("/vision/detect", response_model=schemas.VisionDetectResponse)
async def vision_detect(payload: schemas.VisionDetectRequest):
    """Proxy de vision con fallback 503 IA_NO_DISPONIBLE."""
    return await service.detectar_vision(payload)


@router.post("/voice/transcribe", response_model=schemas.VoiceTranscribeResponse)
async def voice_transcribe(payload: schemas.VoiceTranscribeRequest):
    """Proxy Whisper con fallback 503 IA_NO_DISPONIBLE."""
    return await service.transcribir_voz(payload)


@router.post("/voice/parse-intent", response_model=schemas.VoiceParseIntentResponse)
async def voice_parse_intent(payload: schemas.VoiceParseIntentRequest):
    """NLU texto -> intencion JSON con fallback 503 IA_NO_DISPONIBLE."""
    return await service.interpretar_intencion(payload)


# ---------------------------------------------------------------------------
# v7 (Fase 8) — Entrenamiento (fine-tuning de YOLO)
# ---------------------------------------------------------------------------
# Herramientas de MANTENIMIENTO, no del flujo del POS. La pestana Anotacion
# las consume para entrenar el modelo con el dataset anotado por el operador.
# ---------------------------------------------------------------------------
@router.get("/vision/dataset-summary", response_model=schemas.DatasetSummaryResponse)
async def vision_dataset_summary():
    """Resumen del dataset anotado (pre-validacion antes de entrenar)."""
    return await service.resumen_dataset()


@router.get("/vision/train/status", response_model=schemas.TrainStatusResponse)
async def vision_train_status():
    """Estado del entrenamiento en curso (o del ultimo)."""
    return await service.estado_entrenamiento()


@router.post("/vision/train", response_model=schemas.TrainStatusResponse)
async def vision_train(payload: schemas.TrainRequest):
    """Lanza el fine-tuning de YOLO. Timeout largo (1h por defecto)."""
    return await service.entrenar_vision(payload)


# ---------------------------------------------------------------------------
# Fase B (Ruta A) — OCR de capturas de WhatsApp
# ---------------------------------------------------------------------------
# El operador sube una captura del chat; la IA propone cliente + renglones.
# El ERP hace el match contra su catalogo real (nunca el LLM).
# ---------------------------------------------------------------------------
@router.post("/ocr/extract-order", response_model=schemas.OcrExtractOrderResponse)
async def ocr_extract_order(payload: schemas.OcrExtractOrderRequest):
    """Lee una captura de WhatsApp y propone un pedido (OCR + LLM).

    Con fallback 503 IA_NO_DISPONIBLE: si el motor no esta, el operador
    captura el pedido a mano en la pestana Programacion de Pedidos.
    """
    return await service.extraer_pedido_ocr(payload)
