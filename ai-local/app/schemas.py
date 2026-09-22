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


class VoiceIntentItem(BaseModel):
    """Un item individual detectado en una frase dictada.

    v24 (VOZ-POS): una sola frase puede contener varios productos
    ("agrega 3 conchas y 12 bolillos"), por eso el NLU devuelve una lista.
    """

    sku: Optional[str] = Field(None, description="SKU o nombre mencionado")
    cantidad: Optional[float] = Field(None, description="Cantidad mencionada")
    unidad: Optional[str] = Field(None, description="Unidad mencionada (kg, pieza, caja)")


class VoiceParseIntentResponse(BaseModel):
    """Intencion estructurada.

    El LLM SOLO devuelve este JSON. Nunca ejecuta acciones (spec §8).
    """

    intencion: str = Field(..., description="Ej. 'registrar_entrada', 'contar_stock'")
    items: List[VoiceIntentItem] = Field(
        default_factory=list,
        description="v24: lista de items detectados (1..N). Vacio si no aplica.",
    )
    sku: Optional[str] = Field(None, description="SKU mencionado, si se pudo resolver")
    sku_resuelto: bool = Field(
        False, description="False si el SKU no existe -> selector manual obligatorio"
    )
    cantidad: Optional[float] = Field(None, description="Cantidad mencionada")
    unidad: Optional[str] = Field(None, description="Unidad mencionada (kg, pieza, caja)")
    confianza: float = Field(0.0, ge=0.0, le=1.0)


# ---------------------------------------------------------------------------
# Entrenamiento (v7 Fase 8 — fine-tuning)
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
    """Estado del entrenamiento. El ERP lo consulta para mostrar progreso."""

    activo: bool = Field(..., description="True si hay un entrenamiento en curso")
    iniciado_en: Optional[str] = None
    terminado_en: Optional[str] = None
    ok: Optional[bool] = Field(None, description="None si aun no termina")
    mensaje: str = Field("", description="Mensaje legible para el operador")
    resumen: Optional[dict] = Field(None, description="Resumen del entrenamiento")
    error: Optional[str] = None
    log_tail: List[str] = Field(default_factory=list, description="Ultimas lineas del log")


class DatasetSummaryResponse(BaseModel):
    """Resumen del dataset disponible para entrenar (pre-validacion)."""

    disponible: bool = Field(..., description="True si /dataset es accesible")
    skus: dict = Field(default_factory=dict, description="{sku: {imagenes, anotadas}}")
    total_imagenes: int = Field(0, ge=0)
    total_etiquetas: int = Field(0, ge=0)


# ---------------------------------------------------------------------------
# OCR — lectura de capturas de WhatsApp (Fase B, Ruta A)
# ---------------------------------------------------------------------------
class OcrExtractOrderRequest(BaseModel):
    """Peticion de lectura de una captura de pantalla de WhatsApp.

    La imagen llega en base64. El motor hace OCR (Tesseract) y luego pide al
    LLM que estructure el pedido. NUNCA registra nada: solo PROPONE.
    """

    imagen_base64: str = Field(..., description="Captura de pantalla en base64")
    productos_catalogo: List[str] = Field(
        default_factory=list,
        description="Nombres de producto del catalogo Grandeza (para el match)",
    )
    clientes_catalogo: List[str] = Field(
        default_factory=list,
        description="Nombres de cliente del directorio Grandeza (para el match)",
    )


class OcrOrderItem(BaseModel):
    """Un renglon propuesto del pedido (producto + cantidad)."""

    producto: str = Field(..., description="Nombre de producto tal como se leyo")
    cantidad: float = Field(0.0, ge=0.0, description="Cantidad propuesta")
    confianza: float = Field(0.0, ge=0.0, le=1.0)


class OcrExtractOrderResponse(BaseModel):
    """Propuesta de pedido extraida de una captura.

    REGLA (spec §5.2): este contrato NO tiene campo `confirmado`.
    El operador confirma en la UI del ERP antes de guardar.
    """

    ok: bool = Field(..., description="True si el OCR produjo texto util")
    texto_crudo: str = Field("", description="Texto completo leido por el OCR")
    lineas: List[str] = Field(default_factory=list, description="Lineas no vacias")
    confianza_ocr: float = Field(0.0, ge=0.0, le=1.0)
    cliente_nombre: Optional[str] = Field(
        None, description="Nombre de cliente PROPUESTO (del encabezado del chat)"
    )
    cliente_telefono: Optional[str] = Field(
        None, description="Telefono PROPUESTO (10 digitos, sin lada)"
    )
    items: List[OcrOrderItem] = Field(
        default_factory=list, description="Renglones de pedido propuestos"
    )
    confianza_llm: float = Field(0.0, ge=0.0, le=1.0)
    notas: Optional[str] = Field(None, description="Observaciones del parser")
    motor_ocr: str = Field("tesseract", description="Motor de OCR usado")
    motor_llm: str = Field("ollama", description="Motor de LLM usado")
