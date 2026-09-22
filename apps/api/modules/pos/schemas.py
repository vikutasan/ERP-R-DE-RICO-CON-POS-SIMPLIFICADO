from pydantic import BaseModel, ConfigDict
from typing import Optional, List
from datetime import datetime
from modules.catalog.schemas import ProductBase, CategoryResponse
from modules.security.schemas import EmployeeResponse

class ProductLightResponse(ProductBase):
    id: int
    category: Optional[CategoryResponse] = None
    model_config = ConfigDict(from_attributes=True)

# --- Atomic Item Operations (Fase 2: Persistencia Inmediata) ---
class TicketItemAdd(BaseModel):
    """Agregar un producto al ticket de forma atómica."""
    account_num: str
    product_id: int
    quantity: int = 1
    session_id: int
    terminal_id: Optional[str] = None
    captured_by_id: Optional[int] = None
    version: Optional[int] = None

class TicketItemUpdate(BaseModel):
    """Actualizar cantidad de un item existente."""
    account_num: str
    product_id: int
    new_quantity: int
    version: Optional[int] = None

class TicketItemRemove(BaseModel):
    """Eliminar un producto del ticket."""
    account_num: str
    product_id: int
    version: Optional[int] = None

# --- Ticket Item ---
class TicketItemBase(BaseModel):
    product_id: int
    quantity: int = 1

class TicketItemCreate(TicketItemBase):
    pass

class TicketItemResponse(TicketItemBase):
    id: int
    unit_price: float
    subtotal: float
    product: Optional[ProductLightResponse] = None
    model_config = ConfigDict(from_attributes=True)

# --- Ticket ---
class TicketBase(BaseModel):
    account_num: str
    session_id: int
    order_type: Optional[str] = "VENTA_DIRECTA"
    order_status: Optional[str] = "PROGRAMADO PARA SER PREPARADO"
    delivery_type: Optional[str] = None
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    committed_at: Optional[datetime] = None
    packaging_type: Optional[str] = None
    delivery_address: Optional[str] = None
    order_notes: Optional[str] = None

class TicketCreate(TicketBase):
    items: List[TicketItemCreate]
    status: Optional[str] = "OPEN"
    payment_details: Optional[List] = None
    cash_session_id: Optional[int] = None
    captured_by_id: Optional[int] = None
    cashed_by_id: Optional[int] = None
    version: Optional[int] = None  # Bloqueo optimista: enviar la versión conocida para validar

class TicketResponse(TicketBase):
    id: int
    total: float
    status: str
    payment_details: Optional[List] = None
    cash_session_id: Optional[int] = None
    captured_by_id: Optional[int] = None
    cashed_by_id: Optional[int] = None
    captured_by: Optional[EmployeeResponse] = None
    cashed_by: Optional[EmployeeResponse] = None
    captured_by_name: Optional[str] = None
    cashed_by_name: Optional[str] = None
    terminal_id: Optional[str] = None
    version: int = 1  # Bloqueo optimista
    created_at: datetime
    items: List[TicketItemResponse] = []
    model_config = ConfigDict(from_attributes=True)

class TicketLightResponse(BaseModel):
    """Respuesta mínima para operaciones atómicas de items (add/update/remove).
    El frontend solo necesita version y total tras cada operación.
    Evita el SELECT con 5 JOINs de _get_full_ticket que degradaba rendimiento en hora rush."""
    id: int
    account_num: str
    version: int
    total: float
    status: str

# --- Terminal Session ---
class TerminalSessionBase(BaseModel):
    terminal_id: str

class TerminalSessionCreate(TerminalSessionBase):
    pass

class ReserveTicketRequest(BaseModel):
    """Schema para reservar ticket — incluye capturista desde el primer instante.

    v14 (Opcion 2): `channel` es OPCIONAL y aditivo. Permite crear el ticket con
    el canal correcto en el MISMO INSERT (atómico), eliminando el PUT posterior
    que dejaba tickets huérfanos con channel=NULL visibles en el POS de Panadería.
    Si se omite, el backend aplica el default 'PANADERIA' (comportamiento intacto
    para el POS IA, que no envía este campo).
    """
    terminal_id: str
    captured_by_id: Optional[int] = None
    channel: Optional[str] = None

class TerminalSessionResponse(TerminalSessionBase):
    id: int
    opened_at: datetime
    closed_at: Optional[datetime] = None
    is_active: bool
    model_config = ConfigDict(from_attributes=True)

# --- Vision Training ---
class VisionTrainingUpload(BaseModel):
    sku: str
    images: List[str] # List of base64 strings

# --- Vision Annotation (v7 Fase 8) ---
# El operador dibuja cajas sobre cada imagen del dataset. La IA solo PROPONE
# (pre-anotacion); el operador confirma. Nada se auto-etiqueta.
class AnnotationBox(BaseModel):
    """Una caja delimitadora en coordenadas NORMALIZADAS (0..1).

    Se usan coordenadas normalizadas (no pixeles) porque el canvas del
    navegador y la imagen original pueden tener tamanos distintos. El
    backend las convierte al formato YOLO (cx, cy, w, h) al persistir.
    """
    x: float  # esquina superior izquierda, 0..1
    y: float  # esquina superior izquierda, 0..1
    w: float  # ancho, 0..1
    h: float  # alto, 0..1
    label: str = "concha"  # clase del objeto (nombre de producto o clase YOLO)


class AnnotationSaveRequest(BaseModel):
    """Guarda las anotaciones de UNA imagen del dataset."""
    sku: str
    filename: str  # nombre del archivo dentro de static/training/<sku>/
    boxes: List[AnnotationBox]


class DatasetImage(BaseModel):
    """Una imagen del dataset con su estado de anotacion."""
    filename: str
    url: str  # URL publica para servir la imagen (/static/training/...)
    annotated: bool
    box_count: int


class DatasetResponse(BaseModel):
    """Listado del dataset de un SKU."""
    sku: str
    total: int
    annotated: int
    images: List[DatasetImage]


class AnnotationSaveResponse(BaseModel):
    """Resultado de guardar una anotacion."""
    sku: str
    filename: str
    box_count: int
    label_file: str  # ruta del .txt YOLO escrito

# --- Vision Prediction ---
class VisionPredictionRequest(BaseModel):
    image: str # Base64 string from camera
    terminal_id: Optional[str] = "T1"

class VisionDetection(BaseModel):
    label: str # SKU or Product Name
    qty: int = 1
    confidence: float # 0.0 to 1.0

class VisionPredictionResponse(BaseModel):
    detections: List[VisionDetection]
    engine: str # "local" or "cloud"
    latency_ms: float
