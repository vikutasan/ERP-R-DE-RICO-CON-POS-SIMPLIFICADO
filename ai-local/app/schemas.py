"""Contratos Pydantic del Motor de IA Local.

Estos contratos son ESPEJO de los del AI Gateway del ERP
(apps/api/modules/ai/schemas.py). Si uno cambia, el otro debe cambiar.

REGLA (spec §5.2): ningun schema tiene campo `confirmado`.
La confirmacion es del operador, no del motor.
"""

from typing import List, Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Status
# ---------------------------------------------------------------------------
class StatusResponse(BaseModel):
    """Estado del motor. El ERP lo consulta para decidir si delega."""

    disponible: bool = Field(..., description="True si al menos un motor esta listo")
    whisper: bool = Field(..., description="Transcripcion de voz lista")
    yolo: bool = Field(..., description="Deteccion por vision lista")
    ollama: bool = Field(..., description="LLM disponible")
    errores: List[str] = Field(default_factory=list, description="Errores de carga")


# ---------------------------------------------------------------------------
# Vision
# ---------------------------------------------------------------------------
class VisionDetectRequest(BaseModel):
    """Peticion de deteccion. La imagen llega en base64."""

    imagen_base64: str = Field(..., description="Imagen codificada en base64")
    sku_esperado: Optional[str] = Field(
        None, description="SKU a contar (opcional). Si falta, solo detecta."
    )
    umbral_confianza: float = Field(
        0.7, ge=0.0, le=1.0, description="Bajo este umbral, la UI resalta en ambar"
    )


class Deteccion(BaseModel):
    """Una deteccion individual."""

    etiqueta: str = Field(..., description="Clase detectada")
    confianza: float = Field(..., ge=0.0, le=1.0)
    bbox: List[float] = Field(..., description="[x1, y1, x2, y2] normalizado")


class VisionDetectResponse(BaseModel):
    """Resultado de la deteccion.

    `cantidad` es lo que el motor ORB actual NUNCA devolvia (siempre 1).
    """

    detecciones: List[Deteccion] = Field(default_factory=list)
    cantidad: int = Field(0, ge=0, description="Conteo total de objetos")
    confianza_promedio: float = Field(0.0, ge=0.0, le=1.0)
    requiere_revision: bool = Field(
        False, description="True si confianza < umbral (UI resalta en ambar)"
    )


# ---------------------------------------------------------------------------
# Voz — transcripcion
# ---------------------------------------------------------------------------
class VoiceTranscribeRequest(BaseModel):
    """Peticion de transcripcion. El audio llega en base64."""

    audio_base64: str = Field(..., description="Audio codificado en base64")
    idioma: str = Field("es", description="Codigo ISO del idioma")


class VoiceTranscribeResponse(BaseModel):
    """Texto transcrito."""

    texto: str = Field(..., description="Texto transcrito")
    idioma: str = Field(..., description="Idioma detectado")
    duracion_seg: float = Field(0.0, ge=0.0)


# ---------------------------------------------------------------------------
# Voz — interpretacion de intencion
# ---------------------------------------------------------------------------
class VoiceParseIntentRequest(BaseModel):
    """Peticion de interpretacion de intencion."""

    texto: str = Field(..., description="Texto libre del operador")
    contexto: Optional[str] = Field(
        None, description="Contexto (ej. 'almacen', 'pos') para desambiguar"
    )


class VoiceParseIntentResponse(BaseModel):
    """Intencion estructurada.

    El LLM SOLO devuelve este JSON. Nunca ejecuta acciones (spec §8).
    """

    intencion: str = Field(..., description="Ej. 'registrar_entrada', 'contar_stock'")
    sku: Optional[str] = Field(None, description="SKU mencionado, si se pudo resolver")
    sku_resuelto: bool = Field(
        False, description="False si el SKU no existe -> selector manual obligatorio"
    )
    cantidad: Optional[float] = Field(None, description="Cantidad mencionada")
    unidad: Optional[str] = Field(None, description="Unidad mencionada (kg, pieza, caja)")
    confianza: float = Field(0.0, ge=0.0, le=1.0)
