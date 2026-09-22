"""v7 (Fase 5/7): AI Gateway — capa de servicio.

Regla de oro: el modulo de almacenes NUNCA debe romperse porque la IA no este.
Por eso todos los endpoints delegan aqui y esta capa:

1. Consulta si el motor de IA Local esta configurado y disponible.
2. Si NO lo esta, lanza HTTP 503 con codigo `IA_NO_DISPONIBLE`.
3. Si lo esta, delega al motor real por HTTP (Fase 7, implementado aqui).

La UI traduce el 503 a un toast informativo y el operador continua en modo
manual. Nada se registra automaticamente: la IA solo PROPONE.

CONTRATO (spec §5.2 — human-in-the-loop):
    Esta capa NUNCA agrega un campo `confirmado`. La confirmacion es del
    operador en la UI. El motor solo propone.

DEGRADACION (spec §1.2):
    Cualquier fallo del motor (timeout, conexion rechazada, 5xx, JSON invalido)
    se traduce a 503 IA_NO_DISPONIBLE. Nunca se propaga un 500 al POS.
"""

import logging
import os

import httpx
from fastapi import HTTPException

from . import schemas

logger = logging.getLogger("rderico.api.ai")

# Codigo de error estable que la UI reconoce para mostrar el toast.
CODIGO_IA_NO_DISPONIBLE = "IA_NO_DISPONIBLE"

# Mensaje unico y accionable para el operador.
MENSAJE_IA_NO_DISPONIBLE = (
    "El motor de IA Local no esta disponible. Continue en modo manual."
)

# Timeout por defecto (segundos) si AI_LOCAL_TIMEOUT no esta configurado.
# 120s: un LLM de 3B en CPU puede tardar decenas de segundos por inferencia.
# Un timeout corto aqui degrada a manual aunque el motor este sano.
_TIMEOUT_DEFECTO = 120.0


def _ia_habilitada() -> bool:
    """Indica si el motor de IA Local esta configurado.

    Se controla por variable de entorno para poder apagar la IA sin desplegar
    codigo. Por defecto esta APAGADA: el sistema arranca en modo manual.
    """
    valor = os.getenv("AI_LOCAL_ENABLED", "false").strip().lower()
    return valor in ("1", "true", "yes", "on")


def _url_motor_ia() -> str:
    """URL base del motor de IA Local (Whisper + LLM). Vacio si no se configuro."""
    return os.getenv("AI_LOCAL_URL", "").strip().rstrip("/")


def _timeout_motor_ia() -> float:
    """Timeout en segundos para las llamadas al motor. Default 30s."""
    try:
        return float(os.getenv("AI_LOCAL_TIMEOUT", str(_TIMEOUT_DEFECTO)))
    except (TypeError, ValueError):
        return _TIMEOUT_DEFECTO


def _lanzar_no_disponible(detalle: str = "") -> None:
    """Lanza el 503 estandar que la UI sabe interpretar."""
    mensaje = MENSAJE_IA_NO_DISPONIBLE
    if detalle:
        mensaje = f"{mensaje} ({detalle})"
    raise HTTPException(
        status_code=503,
        detail={"codigo": CODIGO_IA_NO_DISPONIBLE, "mensaje": mensaje},
    )


def _verificar_configuracion(etiqueta: str) -> str:
    """Valida que la IA este habilitada y configurada. Devuelve la URL base.

    Si no lo esta, lanza 503. Centraliza el guard que antes se repetia en
    cada endpoint.
    """
    if not _ia_habilitada() or not _url_motor_ia():
        _lanzar_no_disponible(etiqueta)
    return _url_motor_ia()


async def _llamar_motor(ruta: str, cuerpo: dict, etiqueta: str) -> dict:
    """Llama al motor de IA Local y devuelve el JSON de respuesta.

    Traduce CUALQUIER fallo a 503 IA_NO_DISPONIBLE para que el POS nunca vea
    un 500. El motor real ya devuelve 503 en sus propios fallos; aqui se
    normaliza el codigo al del Gateway.

    Args:
        ruta: ruta relativa del motor (ej. "/vision/detect").
        cuerpo: payload ya serializable a JSON.
        etiqueta: nombre corto para el mensaje de error (ej. "vision").
    """
    url = f"{_url_motor_ia()}{ruta}"
    try:
        async with httpx.AsyncClient(timeout=_timeout_motor_ia()) as cliente:
            respuesta = await cliente.post(url, json=cuerpo)
    except httpx.TimeoutException:
        logger.warning("Motor IA timeout en %s (%ss)", ruta, _timeout_motor_ia())
        _lanzar_no_disponible(f"{etiqueta}: timeout")
    except httpx.HTTPError as exc:
        logger.warning("Motor IA inalcanzable en %s: %s", ruta, exc)
        _lanzar_no_disponible(f"{etiqueta}: motor inalcanzable")

    if respuesta.status_code >= 500:
        logger.warning(
            "Motor IA devolvio %s en %s: %s",
            respuesta.status_code,
            ruta,
            respuesta.text[:200],
        )
        _lanzar_no_disponible(f"{etiqueta}: motor no disponible")

    if respuesta.status_code >= 400:
        # 4xx del motor = payload invalido. No es un fallo de disponibilidad,
        # pero tampoco queremos un 500: se reporta como 503 con el detalle.
        logger.warning(
            "Motor IA rechazo la peticion %s (%s): %s",
            ruta,
            respuesta.status_code,
            respuesta.text[:200],
        )
        _lanzar_no_disponible(f"{etiqueta}: peticion rechazada")

    try:
        return respuesta.json()
    except ValueError:
        logger.error("Motor IA devolvio JSON invalido en %s", ruta)
        _lanzar_no_disponible(f"{etiqueta}: respuesta invalida")


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
    """Proxy de vision: delega al motor YOLO y traduce el contrato.

    El motor devuelve `detecciones[]` + `cantidad` (conteo real, lo que el ORB
    nunca daba). El Gateway expone `items[]` para la UI. Se agrupa por etiqueta
    para que una charola con 12 conchas sea UN item con cantidad=12, no 12 items.
    """
    _verificar_configuracion("vision")

    # Traduccion Gateway -> Motor.
    cuerpo_motor = {
        "imagen_base64": payload.imagen_base64,
        "sku_esperado": payload.contexto,
        "umbral_confianza": 0.7,
    }
    datos = await _llamar_motor("/vision/detect", cuerpo_motor, "vision")

    # Traduccion Motor -> Gateway: agrupar detecciones por etiqueta.
    detecciones = datos.get("detecciones") or []
    agrupado: dict[str, dict] = {}
    for det in detecciones:
        etiqueta = str(det.get("etiqueta") or "desconocido")
        confianza = float(det.get("confianza") or 0.0)
        acumulado = agrupado.setdefault(
            etiqueta, {"cantidad": 0.0, "confianza_max": 0.0}
        )
        acumulado["cantidad"] += 1.0
        acumulado["confianza_max"] = max(acumulado["confianza_max"], confianza)

    items = [
        schemas.VisionDetectItem(
            sku=None,
            nombre=etiqueta,
            cantidad=valores["cantidad"],
            confianza=round(valores["confianza_max"], 4),
        )
        for etiqueta, valores in agrupado.items()
    ]

    return schemas.VisionDetectResponse(
        items=items,
        modelo="yolo-local",
        requiere_confirmacion=True,
    )


# ---------------------------------------------------------------------------
# Voz — transcripcion
# ---------------------------------------------------------------------------
async def transcribir_voz(payload: schemas.VoiceTranscribeRequest) -> schemas.VoiceTranscribeResponse:
    """Proxy Whisper: delega al motor y traduce el contrato."""
    _verificar_configuracion("transcripcion")

    # Traduccion Gateway -> Motor (el motor solo necesita audio + idioma).
    cuerpo_motor = {
        "audio_base64": payload.audio_base64,
        "idioma": payload.idioma or "es",
    }
    datos = await _llamar_motor("/voice/transcribe", cuerpo_motor, "transcripcion")

    return schemas.VoiceTranscribeResponse(
        texto=datos.get("texto") or "",
        idioma=datos.get("idioma") or (payload.idioma or "es"),
        duracion_seg=datos.get("duracion_seg"),
        modelo="whisper-local",
    )


# ---------------------------------------------------------------------------
# Voz — interpretacion de intencion
# ---------------------------------------------------------------------------
async def interpretar_intencion(payload: schemas.VoiceParseIntentRequest) -> schemas.VoiceParseIntentResponse:
    """NLU texto -> intencion JSON. Delega al LLM local y traduce el contrato."""
    _verificar_configuracion("nlu")

    # Traduccion Gateway -> Motor: el motor recibe un `contexto` libre.
    contexto_partes = []
    if payload.almacen_id:
        contexto_partes.append(f"almacen={payload.almacen_id}")
    if payload.skus_disponibles:
        contexto_partes.append("skus=" + ",".join(payload.skus_disponibles[:50]))
    cuerpo_motor = {
        "texto": payload.texto,
        "contexto": "; ".join(contexto_partes) or None,
    }
    datos = await _llamar_motor("/voice/parse-intent", cuerpo_motor, "nlu")

    return schemas.VoiceParseIntentResponse(
        intencion=datos.get("intencion"),
        sku=datos.get("sku"),
        cantidad=datos.get("cantidad"),
        unidad=datos.get("unidad"),
        confianza=float(datos.get("confianza") or 0.0),
        texto_original=payload.texto,
        requiere_confirmacion=True,
    )
