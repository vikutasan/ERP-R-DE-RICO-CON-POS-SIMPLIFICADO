from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime
from enum import Enum

class ZonaTermica(str, Enum):
    SECO = "SECO"
    REFRIGERADO = "REFRIGERADO"
    CONGELADO = "CONGELADO"

# v11 (Fase 11.4, Deuda 4): se ELIMINO el enum `PropositoAlmacen`.
# ---------------------------------------------------------------------------
# Era una trampa para futuros desarrolladores: parecia la fuente de verdad del
# proposito de un almacen, pero desde v8 el proposito es un `codigo` libre
# validado contra la tabla `warehouse_propositos` (catalogo configurable).
# La auditoria de la Fase 11.4 confirmo que NINGUN codigo de produccion ni
# ningun test lo usaba: solo aparecia en comentarios. La validacion real vive
# en `WarehouseService._validar_proposito`.

# v8: patron de validacion del codigo de subcategoria. Mayusculas, digitos y
# guion bajo. Se aplica tanto a `almacenes.proposito` como a
# `warehouse_propositos.codigo` para que ambos lados del contrato coincidan.
PROPOSITO_PATTERN = r"^[A-Z][A-Z0-9_]{1,39}$"

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
    # v8: antes era PropositoAlmacen (enum cerrado). Ahora es un codigo libre
    # validado contra el catalogo `warehouse_propositos` en la capa de servicio.
    proposito: str = Field(..., min_length=2, max_length=40, pattern=PROPOSITO_PATTERN)
    sucursal_id: Optional[str] = None
    foto_url: Optional[str] = None
    planograma_url: Optional[str] = None
    pautas_acomodo: List[str] = []
    activo: bool = True

class AlmacenCreate(AlmacenBase):
    pass

class AlmacenUpdate(BaseModel):
    """v11 (Deuda 1): contrato explicito de actualizacion parcial.

    REGLA DE ORO — la diferencia entre OMITIR un campo y enviarlo como `null`:

    | Intencion del cliente     | Payload enviado      | Resultado           |
    |---------------------------|----------------------|---------------------|
    | "No toques la foto"       | `{"nombre": "X"}`    | La foto SE CONSERVA |
    | "Borra la foto"           | `{"foto_url": null}` | La foto SE LIMPIA   |
    | "Borra la foto" (omitida) | `{"nombre": "X"}`    | IMPOSIBLE de expresar |

    El servicio aplica `payload.model_dump(exclude_unset=True)`, por lo que
    **solo los campos presentes en el JSON del cliente se tocan**. Un campo
    enviado explicitamente como `null` SI cuenta como "presente" y por lo
    tanto SI limpia el valor en la base de datos.

    ADVERTENCIA PARA CLIENTES (scripts de importacion, apps moviles,
    integraciones futuras): si necesitas BORRAR `foto_url`, `planograma_url`
    o `pautas_acomodo`, DEBES enviarlos explicitamente como `null` (o `[]`
    para listas). Omitirlos los conserva. El frontend actual
    (`buildWarehouseCreatePayload`) siempre envia los tres campos, pero eso
    es una convencion del cliente, NO una garantia del backend.
    """
    nombre: Optional[str] = None
    zona_termica: Optional[ZonaTermica] = None
    # v8: codigo libre validado contra el catalogo (ver AlmacenBase).
    proposito: Optional[str] = Field(None, min_length=2, max_length=40, pattern=PROPOSITO_PATTERN)
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

# --- v8: Catalogo de subcategorias de almacen (warehouse_propositos) ---
class WarehousePropositoBase(BaseModel):
    """Base del catalogo de subcategorias.

    `codigo` es la llave logica que se guarda en `almacenes.proposito`.
    `label` es lo que ve el operador en la barra. `icon` es un emoji de la
    paleta curada (ver PLAN_SUBCATEGORIAS_ALMACEN_V8.md seccion 10.1).
    """
    codigo: str = Field(..., min_length=2, max_length=40, pattern=PROPOSITO_PATTERN)
    label: str = Field(..., min_length=2, max_length=60)
    icon: str = Field("📦", max_length=8)
    orden: int = Field(0, ge=0, le=9999)

class WarehousePropositoCreate(WarehousePropositoBase):
    """Payload de creacion. `es_sistema` y `es_cuarentena` NO son asignables
    por el cliente: los define el sistema (seed/migracion)."""
    pass

class WarehousePropositoUpdate(BaseModel):
    """Payload de edicion. `codigo` NO es editable: cambiarlo huerfanaria los
    almacenes que ya lo referencian. Para renombrar se edita `label`."""
    label: Optional[str] = Field(None, min_length=2, max_length=60)
    icon: Optional[str] = Field(None, max_length=8)
    orden: Optional[int] = Field(None, ge=0, le=9999)
    activo: Optional[bool] = None

class WarehousePropositoResponse(WarehousePropositoBase):
    id: str
    es_sistema: bool
    es_cuarentena: bool
    activo: bool
    created_at: datetime
    # v8: conteo de almacenes que referencian esta subcategoria. Permite a la
    # UI deshabilitar el boton de borrar sin una llamada extra.
    almacenes_count: int = 0

    class Config:
        from_attributes = True

class WarehousePropositoDeleteResponse(BaseModel):
    """Resultado del borrado fisico de una subcategoria."""
    ok: bool
    codigo: str
    almacenes_trasladados: int = 0
    destino: Optional[str] = None

class TrasladoSubcategoriaRequest(BaseModel):
    """v8: traslado masivo de almacenes de una subcategoria a otra.

    Se usa cuando el operador quiere borrar una subcategoria que aun tiene
    almacenes: primero se trasladan a `destino_codigo` (por defecto la
    cuarentena SIN_CLASIFICAR) y luego se borra.
    """
    origen_codigo: str = Field(..., min_length=2, max_length=40, pattern=PROPOSITO_PATTERN)
    destino_codigo: str = Field(..., min_length=2, max_length=40, pattern=PROPOSITO_PATTERN)

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
    # v7 (Fase 2.2): actor que ejecuta el ajuste. Opcional para no romper
    # llamadores existentes; si falta, `verificar_permiso` responde 403.
    usuario_id: Optional[str] = None

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

class StockPorSkuResponse(BaseModel):
    """v7 (Fase 0.5, D-STOCK): fuente unica de verdad del stock total de un SKU.

    Reemplaza la lectura de `products.stock` (columna obsoleta). El total se
    calcula sumando `stock_almacen.cantidad_actual` de todos los almacenes.
    """
    sku: str
    item_name: Optional[str] = None
    item_image_url: Optional[str] = None
    item_price: Optional[float] = None
    item_unit: Optional[str] = None
    stock_total: float = 0.0
    # Desglose por almacen para trazabilidad (de donde sale cada pieza).
    desglose: List[dict] = []

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

# --- Escaner IA de Vision (Fase 6.2) ---
class VisionSnapshotItem(BaseModel):
    """v7 (Fase 6.2): item CONFIRMADO por el operador tras la deteccion por IA.

    La IA solo PROPONE cantidades; este contrato transporta lo que el humano
    acepto o corrigio. Nunca se registra stock sin pasar por aqui.
    """
    item_id: str
    item_type: ItemType
    cantidad: float = Field(..., gt=0)
    confianza: Optional[float] = Field(None, ge=0.0, le=1.0)
    notas: Optional[str] = None

class VisionSnapshotRequest(BaseModel):
    """v7 (Fase 6.2): registro de entrada a partir de una foto de charola.

    El frontend captura la imagen, la IA propone cantidades y el operador las
    confirma/edita. Solo entonces se envia este payload para registrar el
    movimiento con metodo_captura = VISION_SNAPSHOT.
    """
    items: List[VisionSnapshotItem]
    usuario_id: str
    # Trazabilidad: hash/identificador de la imagen analizada (opcional).
    imagen_ref: Optional[str] = None
    # Modelo/motor que genero la propuesta (ej. "local-orb"), para auditoria.
    modelo: Optional[str] = None

class VisionSnapshotResponse(BaseModel):
    """v7 (Fase 6.2): resultado del registro de una entrada por vision."""
    lote_id: str
    total_items: int
    metodo_captura: str
    items: List[dict] = []

# --- Diagnostico (Fase 1.3, D2) ---
class EventoSinAlmacenResponse(BaseModel):
    """v7 (Fase 1.3, D2): item de diagnostico de SKUs que no se pudieron descontar.

    Antes el procesador los ignoraba en silencio. Ahora quedan registrados para
    que el operador corrija la configuracion del producto o del almacen.
    """
    id: int
    evento_id: Optional[int] = None
    ticket_id: Optional[int] = None
    sku: Optional[str] = None
    cantidad: Optional[float] = None
    motivo: str
    detalle: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True
