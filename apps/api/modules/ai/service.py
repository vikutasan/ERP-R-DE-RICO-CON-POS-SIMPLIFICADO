"""v7 (Fase 5): AI Gateway — capa de servicio (stubs).

Regla de oro: el modulo de almacenes NUNCA debe romperse porque la IA no este.
Por eso todos los endpoints delegan aqui y esta capa:

1. Consulta si el motor de IA Local esta configurado y disponible.
2. Si NO lo esta, lanza HTTP 503 con codigo `IA_NO_DISPONIBLE`.
3. Si lo esta, delega al motor real (Fase 7, aun no implementado).

La UI traduce el 503 a un toast informativo y el operador continua en modo
manual. Nada se registra automaticamente: la IA solo PROPONE.
"""

import logging
import os

from fastapi import HTTPException

from . import schemas

logger = logging.getLogger("rderico.api.ai")

# Codigo de error estable que la UI reconoce para mostrar el toast.
CODIGO_IA_NO_DISPONIBLE = "IA_NO_DISPONIBLE"

# Mensaje unico y accionable para el operador.
MENSAJE_IA_NO_DISPONIBLE = (
    "El motor de IA Local no esta disponible. Continue en modo manual."
)


def _ia_habilitada() -> bool:
    """Indica si el motor de IA Local esta configurado.

    Se controla por variable de entorno para poder apagar la IA sin desplegar
    codigo. Por defecto esta APAGADA: el sistema arranca en modo manual.
    """
    valor = os.getenv("AI_LOCAL_ENABLED", "false").strip().lower()
    return valor in ("1", "true", "yes", "on")


def _url_motor_ia() -> str:
    """URL base del motor de IA Local (Whisper + LLM). Vacio si no se configuro."""
    return os.getenv("AI_LOCAL_URL", "").strip()


def _lanzar_no_disponible(detalle: str = "") -> None:
    """Lanza el 503 estandar que la UI sabe interpretar."""
    mensaje = MENSAJE_IA_NO_DISPONIBLE
    if detalle:
        mensaje = f"{mensaje} ({detalle})"
    raise HTTPException(
        status_code=503,
        detail={"codigo": CODIGO_IA_NO_DISPONIBLE, "mensaje": mensaje},
    )


def estado_gateway() -> dict:
    """Estado del gateway para diagnostico (no expone secretos)."""
    habilitada = _ia_habilitada()
    url = _url_motor_ia()
    return {
        "habilitada": habilitada,
        "configurada": bool(url),
        "disponible": habilitada and bool(url),
        "codigo_fallback": CODIGO_IA_NO_DISPONIBLE,
    }


# ---------------------------------------------------------------------------
# Vision
# ---------------------------------------------------------------------------
async def detectar_vision(payload: schemas.VisionDetectRequest) -> schemas.VisionDetectResponse:
    """Proxy de vision. Stub: 503 si el motor no esta disponible."""
    if not _ia_habilitada() or not _url_motor_ia():
        _lanzar_no_disponible("vision")
    # Fase 7: aqui se delegara al motor de vision real.
    _lanzar_no_disponible("vision no implementada")


# ---------------------------------------------------------------------------
# Voz — transcripcion
# ---------------------------------------------------------------------------
async def transcribir_voz(payload: schemas.VoiceTranscribeRequest) -> schemas.VoiceTranscribeResponse:
    """Proxy Whisper. Stub: 503 si el motor no esta disponible."""
    if not _ia_habilitada() or not _url_motor_ia():
        _lanzar_no_disponible("transcripcion")
    # Fase 7: aqui se delegara a Whisper local.
    _lanzar_no_disponible("transcripcion no implementada")


# ---------------------------------------------------------------------------
# Voz — interpretacion de intencion
# ---------------------------------------------------------------------------
async def interpretar_intencion(payload: schemas.VoiceParseIntentRequest) -> schemas.VoiceParseIntentResponse:
    """NLU texto -> intencion JSON. Stub: 503 si el motor no esta disponible."""
    if not _ia_habilitada() or not _url_motor_ia():
        _lanzar_no_disponible("nlu")
    # Fase 7: aqui se delegara al LLM local.
    _lanzar_no_disponible("nlu no implementado")
