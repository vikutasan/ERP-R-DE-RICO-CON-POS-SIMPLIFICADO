from sqlalchemy import Column, Integer, String, Boolean, Float, ForeignKey, DateTime, JSON
from sqlalchemy.orm import relationship
from core.database import Base
import datetime
import uuid
import json

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
    proposito = Column(String, nullable=False) # ALMACENAMIENTO, EXHIBICION_VENTA
    sucursal_id = Column(String, nullable=True)
    foto_url = Column(String, nullable=True)
    planograma_url = Column(String, nullable=True)
    pautas_acomodo = Column(JSON, default=list)
    activo = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

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
    fecha_ingreso = Column(DateTime, default=datetime.datetime.utcnow)
    dias_anaquel_alerta = Column(Integer, nullable=True)
    version = Column(Integer, default=1)
    ultima_actualizacion = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

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
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)

class WarehouseEvent(Base):
    __tablename__ = "warehouse_events"
    id = Column(Integer, primary_key=True, autoincrement=True)
    ticket_id = Column(Integer, unique=True, index=True, nullable=False)
    items_json = Column(JSON, nullable=False)
    estado = Column(String, default="PENDIENTE") # PENDIENTE, PROCESADO, FALLIDO
    intentos = Column(Integer, default=0)
    error_log = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
