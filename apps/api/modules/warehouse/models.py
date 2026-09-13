from sqlalchemy import Column, Integer, String, Boolean, Float, ForeignKey, DateTime, JSON
from sqlalchemy.orm import relationship
from core.database import Base
import datetime
import uuid
import json


def _utcnow():
    """v7 (D3): UTC naive. Reemplaza datetime.utcnow() (deprecado en Python 3.12).

    Regla de oro del proyecto: almacenar en UTC, mostrar en hora local.

    v7 (Fase 1.5, bugfix): debe ser NAIVE (sin tzinfo). Todas las columnas
    DateTime de este modulo son TIMESTAMP WITHOUT TIME ZONE, y asyncpg rechaza
    un datetime timezone-aware con "can't subtract offset-naive and
    offset-aware datetimes". Se conserva el valor en UTC, solo se omite el
    tzinfo para que coincida con el tipo de columna.
    """
    return datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)

class Insumo(Base):
    __tablename__ = "insumos"
    id = Column(String, primary_key=True, default=lambda: f"ins_{uuid.uuid4().hex[:8]}")
    nombre = Column(String, nullable=False)
    unidad_base = Column(String, nullable=False)
    unidad_compra = Column(String, nullable=False)
    factor_conversion = Column(Float, nullable=False)
    categoria_insumo = Column(String, nullable=False) # MATERIA_PRIMA, EMPAQUE, QUIMICO
    activo = Column(Boolean, default=True)

class Almacen(Base):
    __tablename__ = "almacenes"
    id = Column(String, primary_key=True, default=lambda: f"alm_{uuid.uuid4().hex[:8]}")
    nombre = Column(String, nullable=False)
    zona_termica = Column(String, nullable=False) # SECO, REFRIGERADO, CONGELADO
    # v7 (D-ENUM): valores validos = ALMACENAMIENTO, EXHIBICION_VENTA, EQUIPAMIENTO.
    # El comentario anterior omitia EQUIPAMIENTO, lo que hacia parecer huerfano el
    # valor del enum en schemas.py. EQUIPAMIENTO SI se persiste: el frontend lo
    # envia como proposito al crear almacenes de equipamiento (ver SUB_CATEGORIES
    # en WarehouseManagerUI.jsx). No eliminar del enum.
    proposito = Column(String, nullable=False)
    sucursal_id = Column(String, nullable=True)
    foto_url = Column(String, nullable=True)
    planograma_url = Column(String, nullable=True)
    pautas_acomodo = Column(JSON, default=list)
    activo = Column(Boolean, default=True)
    created_at = Column(DateTime, default=_utcnow)

    stock = relationship("StockAlmacen", back_populates="almacen", cascade="all, delete-orphan")

class StockAlmacen(Base):
    __tablename__ = "stock_almacen"
    id = Column(String, primary_key=True, default=lambda: f"stk_{uuid.uuid4().hex[:8]}")
    almacen_id = Column(String, ForeignKey("almacenes.id"), nullable=False)
    item_id = Column(String, index=True, nullable=False) # SKU
    item_type = Column(String, nullable=False) # PRODUCTO, INSUMO
    cantidad_actual = Column(Float, default=0.0)
    stock_minimo = Column(Float, default=0.0)
    stock_maximo = Column(Float, default=0.0)
    fecha_ingreso = Column(DateTime, default=_utcnow)
    dias_anaquel_alerta = Column(Integer, nullable=True)
    version = Column(Integer, default=1)
    ultima_actualizacion = Column(DateTime, default=_utcnow, onupdate=_utcnow)

    almacen = relationship("Almacen", back_populates="stock")

class MovimientoInventario(Base):
    __tablename__ = "movimientos_inventario"
    id = Column(String, primary_key=True, default=lambda: f"mov_{uuid.uuid4().hex[:8]}")
    almacen_origen_id = Column(String, nullable=True)
    almacen_destino_id = Column(String, nullable=True)
    item_id = Column(String, index=True, nullable=False)
    item_type = Column(String, nullable=False)
    cantidad = Column(Float, nullable=False)
    tipo_movimiento = Column(String, nullable=False) # ENTRADA_COMPRA, SALIDA_VENTA, MERMA...
    metodo_captura = Column(String, nullable=False)
    usuario_id = Column(String, nullable=False)
    notas = Column(String, nullable=True)
    lote_entrada_id = Column(String, nullable=True)
    # v7 (Fase 1.2, D1): idempotencia del Outbox. FK logica al evento del POS que
    # origino este movimiento. Junto con item_id forma el indice unico
    # uq_movimiento_evento_item, que impide descontar el mismo SKU dos veces si
    # el evento se reprocesa. NULL para movimientos que no vienen del POS.
    evento_id = Column(Integer, nullable=True)
    timestamp = Column(DateTime, default=_utcnow)

class WarehouseEvent(Base):
    __tablename__ = "warehouse_events"
    id = Column(Integer, primary_key=True, autoincrement=True)
    ticket_id = Column(Integer, unique=True, index=True, nullable=False)
    items_json = Column(JSON, nullable=False)
    estado = Column(String, default="PENDIENTE") # PENDIENTE, PROCESADO, FALLIDO
    intentos = Column(Integer, default=0)
    error_log = Column(String, nullable=True)
    # v7 (Fase 1.4): sucursal que origino el evento. Nullable para no romper los
    # eventos historicos ya existentes ni el POS actual (que aun no la envia).
    # Permite aislar el descuento de stock por sucursal en el futuro.
    sucursal_id = Column(Integer, nullable=True, index=True)
    created_at = Column(DateTime, default=_utcnow)


class WarehouseEventoSinAlmacen(Base):
    """v7 (Fase 1.3, D2): diagnostico de SKUs que no se pudieron descontar.

    Antes el procesador ignoraba en silencio los items sin SKU o sin almacen de
    venta con stock suficiente. Ahora cada ocurrencia se registra aqui para que
    el operador pueda corregir la configuracion del producto/almacen.
    """
    __tablename__ = "warehouse_eventos_sin_almacen"
    id = Column(Integer, primary_key=True, autoincrement=True)
    evento_id = Column(Integer, index=True, nullable=True)
    ticket_id = Column(Integer, nullable=True)
    sku = Column(String, index=True, nullable=True)
    cantidad = Column(Float, nullable=True)
    # SIN_SKU, SIN_STOCK_SUFICIENTE, SIN_ALMACEN_VENTA
    motivo = Column(String, nullable=False)
    detalle = Column(String, nullable=True)
    created_at = Column(DateTime, default=_utcnow)
