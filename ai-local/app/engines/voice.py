"""Motor de voz — transcripcion con faster-whisper.

faster-whisper usa CTranslate2: ~4x mas rapido que openai-whisper en CPU.
Modelo por defecto: "base" (fallback CPU del spec §8).

REGLA (spec §5.2): este motor PROPONE. Nunca registra stock.
"""

import base64
import io
import logging

from .. import schemas

logger = logging.getLogger("rderico.ia.motor.voice")

# Modelo cargado una sola vez (lo hace main.py en el lifespan)
_modelo = None


def cargar_modelo(nombre: str) -> None:
    """Carga el modelo Whisper en memoria.

    Se llama UNA vez al arrancar el contenedor.
    """
    global _modelo  # noqa: PLW0603
    from faster_whisper import WhisperModel

    # device="cpu" + compute_type="int8": el fallback del spec §8.
    # Si hay GPU, cambiar a device="cuda" + compute_type="float16".
    _modelo = WhisperModel(nombre, device="cpu", compute_type="int8")
    logger.info("Whisper '%s' cargado (cpu/int8).", nombre)


async def transcribir(payload: schemas.VoiceTranscribeRequest) -> schemas.VoiceTranscribeResponse:
    """Transcribe audio base64 -> texto."""
    if _modelo is None:
        raise RuntimeError("Modelo Whisper no cargado.")

    datos = base64.b64decode(payload.audio_base64)
    audio = io.BytesIO(datos)

    segmentos, info = _modelo.transcribe(
        audio,
        language=payload.idioma,
        beam_size=5,
        vad_filter=True,  # filtra silencios: mejora precision y velocidad
    )

    texto = " ".join(seg.text.strip() for seg in segmentos).strip()

    return schemas.VoiceTranscribeResponse(
        texto=texto,
        idioma=info.language,
        duracion_seg=float(info.duration),
    )
