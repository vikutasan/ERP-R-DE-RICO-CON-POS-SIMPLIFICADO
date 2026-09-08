from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime
from enum import Enum

class ZonaTermica(str, Enum):
    SECO = "SECO"
    REFRIGERADO = "REFRIGERADO"
    CONGELADO = "CONGELADO"

class PropositoAlmacen(str, Enum):
    ALMACENAMIENTO = "ALMACENAMIENTO"
    EXHIBICION_VENTA = "EXHIBICION_VENTA"
    EQUIPAMIENTO = "EQUIPAMIENTO"

class MetodoCaptura(str, Enum):
    MANUAL = "MANUAL"
    VOZ = "VOZ"
    VISION_SNAPSHOT = "VISION_SNAPSHOT"
    EVENTO_POS = "EVENTO_POS"
    ENTRADA_MASIVA = "ENTRADA_MASIVA"

class ItemType(str, Enum):
    PRODUCTO = "PRODUCTO"
    INSUMO = "INSUMO"

class TipoMovimiento(str, Enum):
    ENTRADA_COMPRA = "ENTRADA_COMPRA"
    PRODUCCION_ENTRADA = "PRODUCCION_ENTRADA"
    TRASPASO_SALIDA = "TRASPASO_SALIDA"
    TRASPASO_ENTRADA = "TRASPASO_ENTRADA"
    SALIDA_VENTA = "SALIDA_VENTA"
    MERMA = "MERMA"
    AJUSTE_INVENTARIO = "AJUSTE_INVENTARIO"

class EstadoEvento(str, Enum):
    PENDIENTE = "PENDIENTE"
    PROCESADO = "PROCESADO"
    FALLIDO = "FALLIDO"

class CategoriaInsumo(str, Enum):
    MATERIA_PRIMA = "MATERIA_PRIMA"
    EMPAQUE = "EMPAQUE"
    QUIMICO = "QUIMICO"

# --- Insumos Stub ---
class InsumoBase(BaseModel):
    nombre: str
    unidad_base: str
    unidad_compra: str
    factor_conversion: float
    categoria_insumo: CategoriaInsumo
    activo: bool = True

class InsumoCreate(InsumoBase):
    pass

class InsumoResponse(InsumoBase):
    id: str
    
    class Config:
        from_attributes = True

# --- Almacen ---
class AlmacenBase(BaseModel):
    nombre: str
    zona_termica: ZonaTermica
    proposito: PropositoAlmacen
    sucursal_id: Optional[str] = None
    foto_url: Optional[str] = None
    planograma_url: Optional[str] = None
    pautas_acomodo: List[str] = []
    activo: bool = True

class AlmacenCreate(AlmacenBase):
    pass

class AlmacenUpdate(BaseModel):
    nombre: Optional[str] = None
    zona_termica: Optional[ZonaTermica] = None
    proposito: Optional[PropositoAlmacen] = None
    sucursal_id: Optional[str] = None
    foto_url: Optional[str] = None
    planograma_url: Optional[str] = None
    pautas_acomodo: Optional[List[str]] = None
    activo: Optional[bool] = None

class AlmacenResponse(AlmacenBase):
    id: str
    created_at: datetime
    
    class Config:
        from_attributes = True

# --- StockAlmacen ---
class StockAlmacenBase(BaseModel):
    item_id: str
    item_type: ItemType
    cantidad_actual: float = 0.0
    stock_minimo: float = 0.0
    stock_maximo: float = 0.0
    dias_anaquel_alerta: Optional[int] = None

class StockAlmacenCreate(StockAlmacenBase):
    pass

class StockAlmacenUpdate(BaseModel):
    cantidad_actual: Optional[float] = None
    stock_minimo: Optional[float] = None
    stock_maximo: Optional[float] = None
    dias_anaquel_alerta: Optional[int] = None
    version: int

class StockAlmacenResponse(StockAlmacenBase):
    id: str
    almacen_id: str
    fecha_ingreso: datetime
    ultima_actualizacion: datetime
    version: int
    
    class Config:
        from_attributes = True

class StockAlmacenExtendedResponse(StockAlmacenResponse):
    item_name: Optional[str] = None
    item_image_url: Optional[str] = None
    item_price: Optional[float] = None
    item_unit: Optional[str] = None
    
    class Config:
        from_attributes = True

# --- MovimientoInventario ---
class MovimientoInventarioCreate(BaseModel):
    almacen_origen_id: Optional[str] = None
    almacen_destino_id: Optional[str] = None
    item_id: str
    item_type: ItemType
    cantidad: float
    tipo_movimiento: TipoMovimiento
    metodo_captura: MetodoCaptura
    usuario_id: str
    notas: Optional[str] = None
    lote_entrada_id: Optional[str] = None

class MovimientoInventarioResponse(MovimientoInventarioCreate):
    id: str
    timestamp: datetime
    
    class Config:
        from_attributes = True

# --- Operaciones en Lote ---
class EntradaMasivaItem(BaseModel):
    item_id: str
    item_type: ItemType
    cantidad: float
    notas: Optional[str] = None

class EntradaMasivaRequest(BaseModel):
    items: List[EntradaMasivaItem]
    usuario_id: str
    
class TraspasoRequest(BaseModel):
    almacen_origen_id: str
    almacen_destino_id: str
    item_id: str
    item_type: ItemType
    cantidad: float
    usuario_id: str
    
class MermaRequest(BaseModel):
    item_id: str
    item_type: ItemType
    cantidad: float
    notas: str
    usuario_id: str
