"""v7 (Fase 5): contratos de datos del AI Gateway.

Estos esquemas definen el contrato que consumira la UI (Fases 6 y 6.5) y que
el motor de IA Local debera respetar cuando se instale. Mientras el motor no
exista, los endpoints devuelven 503 IA_NO_DISPONIBLE.
"""

from typing import List, Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Vision
# ---------------------------------------------------------------------------
class VisionDetectRequest(BaseModel):
    """Imagen a analizar. `imagen_base64` es la captura de la charola."""

    imagen_base64: str = Field(..., description="Imagen codificada en base64 (sin prefijo data:).")
    almacen_id: Optional[str] = Field(None, description="Almacen donde se captura la charola.")
    contexto: Optional[str] = Field(None, description="Pista opcional para el modelo (ej. 'charola de conchas').")


class VisionDetectItem(BaseModel):
    """Una deteccion propuesta por la IA. NUNCA se registra sin confirmacion."""

    sku: Optional[str] = None
    nombre: Optional[str] = None
    cantidad: float = 0
    confianza: float = Field(0.0, ge=0.0, le=1.0)


class VisionDetectResponse(BaseModel):
    """Respuesta del proxy de vision. `items` es una PROPUESTA, no una verdad."""

    items: List[VisionDetectItem] = Field(default_factory=list)
    modelo: Optional[str] = None
    requiere_confirmacion: bool = True


# ---------------------------------------------------------------------------
# Voz — transcripcion (Whisper)
# ---------------------------------------------------------------------------
class VoiceTranscribeRequest(BaseModel):
    """Audio dictado por el operador, codificado en base64."""

    audio_base64: str = Field(..., description="Audio codificado en base64 (webm/ogg/wav).")
    idioma: str = Field("es", description="Idioma esperado del dictado.")
    formato: Optional[str] = Field(None, description="MIME/extension del audio (ej. 'webm').")


class VoiceTranscribeResponse(BaseModel):
    """Texto plano resultante de la transcripcion."""

    texto: str = ""
    idioma: str = "es"
    duracion_seg: Optional[float] = None
    modelo: Optional[str] = None


# ---------------------------------------------------------------------------
# Voz — interpretacion de intencion (NLU)
# ---------------------------------------------------------------------------
class VoiceParseIntentRequest(BaseModel):
    """Texto transcrito que debe convertirse en una intencion estructurada."""

    texto: str = Field(..., description="Texto dictado, ej. 'veinte kilos de harina extra fina'.")
    almacen_id: Optional[str] = Field(None, description="Almacen destino del movimiento.")
    skus_disponibles: Optional[List[str]] = Field(
        None,
        description="SKUs candidatos para que el NLU resuelva el mas probable.",
    )
    contexto: Optional[str] = Field(
        None,
        description="v24: 'almacen' (default) o 'pos' para venta al publico.",
    )


class VoiceIntentItem(BaseModel):
    """v24: un item individual detectado en una frase dictada.

    Una sola frase puede contener varios productos
    ("agrega 3 conchas y 12 bolillos"), por eso el NLU devuelve una lista.
    """

    sku: Optional[str] = None
    cantidad: Optional[float] = None
    unidad: Optional[str] = None


class VoiceParseIntentResponse(BaseModel):
    """Intencion estructurada. `confianza` es una sugerencia, no una verdad.

    El operador SIEMPRE confirma antes de registrar (human-in-the-loop).
    """

    intencion: Optional[str] = Field(
        None,
        description="Tipo de operacion detectada: ENTRADA, MERMA, CONTEO o (POS) AGREGAR_ITEM, QUITAR_ITEM, COBRAR, CANCELAR.",
    )
    items: List[VoiceIntentItem] = Field(
        default_factory=list,
        description="v24: lista de items detectados (1..N). Vacio si no aplica.",
    )
    sku: Optional[str] = None
    cantidad: Optional[float] = None
    unidad: Optional[str] = None
    confianza: float = Field(0.0, ge=0.0, le=1.0)
    texto_original: str = ""
    requiere_confirmacion: bool = True


# ---------------------------------------------------------------------------
# Entrenamiento (v7 Fase 8 — fine-tuning de YOLO)
# ---------------------------------------------------------------------------
# NOTA: estos contratos NO son human-in-the-loop del POS. Son herramientas de
# MANTENIMIENTO que el operador/admin dispara desde la pestana Anotacion.
# ---------------------------------------------------------------------------
class TrainRequest(BaseModel):
    """Peticion de fine-tuning. Todos los parametros tienen defaults seguros."""

    skus: Optional[List[str]] = Field(
        None, description="SKUs a entrenar. Si falta, entrena con TODOS."
    )
    epochs: int = Field(50, ge=1, le=500, description="Epocas de entrenamiento")
    imgsz: int = Field(640, ge=160, le=1280, description="Tamano de imagen")
    batch: int = Field(8, ge=1, le=64, description="Tamano de lote")
    run_name: str = Field("bakery", description="Nombre del run (carpeta de salida)")


class TrainStatusResponse(BaseModel):
    """Estado del entrenamiento. La UI lo consulta para mostrar progreso."""

    activo: bool = False
    iniciado_en: Optional[str] = None
    terminado_en: Optional[str] = None
    ok: Optional[bool] = None
    mensaje: str = ""
    resumen: Optional[dict] = None
    error: Optional[str] = None
    log_tail: List[str] = Field(default_factory=list)


class DatasetSummaryResponse(BaseModel):
    """Resumen del dataset anotado disponible para entrenar."""

    disponible: bool = False
    skus: dict = Field(default_factory=dict)
    total_imagenes: int = 0
    total_etiquetas: int = 0


# ---------------------------------------------------------------------------
# OCR — lectura de capturas de WhatsApp (Fase B, Ruta A)
# ---------------------------------------------------------------------------
# NOTA: esto es DISTINTO de VisionDetectRequest. Vision (YOLO) CUENTA objetos;
# OCR (Tesseract) LEE texto. Aqui el operador sube una captura del chat de
# WhatsApp y la IA propone el cliente + los renglones del pedido.
# ---------------------------------------------------------------------------
class OcrExtractOrderRequest(BaseModel):
    """Captura de WhatsApp a interpretar. La imagen llega en base64."""

    imagen_base64: str = Field(..., description="Captura de pantalla en base64 (sin prefijo data:).")
    productos_catalogo: Optional[List[str]] = Field(
        None, description="Nombres de producto del catalogo Grandeza (para el match)."
    )
    clientes_catalogo: Optional[List[str]] = Field(
        None, description="Nombres de cliente del directorio Grandeza (para el match)."
    )


class OcrOrderItem(BaseModel):
    """Un renglon propuesto del pedido. NUNCA se registra sin confirmacion."""

    producto: str = ""
    producto_id: Optional[int] = Field(
        None, description="ID de producto resuelto por el ERP (None si no hubo match)."
    )
    cantidad: float = 0
    confianza: float = Field(0.0, ge=0.0, le=1.0)
    requiere_revision: bool = Field(
        False, description="True si el match fue debil (UI resalta en ambar)."
    )


class OcrExtractOrderResponse(BaseModel):
    """Propuesta de pedido extraida de una captura.

    `items` y `cliente_*` son PROPUESTAS, no verdades. El operador confirma
    y edita en la UI antes de guardar (human-in-the-loop).
    """

    ok: bool = False
    texto_crudo: str = ""
    lineas: List[str] = Field(default_factory=list)
    confianza_ocr: float = Field(0.0, ge=0.0, le=1.0)
    cliente_id: Optional[int] = Field(
        None, description="ID de cliente resuelto por el ERP (None si no hubo match)."
    )
    cliente_nombre: Optional[str] = None
    cliente_telefono: Optional[str] = None
    cliente_match: Optional[str] = Field(
        None, description="Como se resolvio el cliente: telefono | nombre | fuzzy | manual."
    )
    items: List[OcrOrderItem] = Field(default_factory=list)
    confianza_llm: float = Field(0.0, ge=0.0, le=1.0)
    notas: Optional[str] = None
    motor_ocr: Optional[str] = None
    motor_llm: Optional[str] = None
    requiere_confirmacion: bool = True
