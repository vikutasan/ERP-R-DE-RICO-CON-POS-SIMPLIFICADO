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
