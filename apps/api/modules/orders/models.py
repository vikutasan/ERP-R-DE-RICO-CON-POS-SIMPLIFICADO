"""
MÓDULO: orders/models.py
MISIÓN: Definir la tabla de Pedidos (Order) vinculada a un Ticket del POS.
Un pedido es una venta diferida con fecha de entrega compromiso.
"""
from sqlalchemy import Column, Integer, String, Float, Boolean, ForeignKey, DateTime, JSON, Text
from sqlalchemy.orm import relationship
from core.database import Base
from core.timestamps import utcnow


class Order(Base):
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True, index=True)

    # Vínculo con el ticket del POS (1:1)
    ticket_id = Column(Integer, ForeignKey("tickets.id"), unique=True, nullable=False)

    # Tipo de entrega: PICKUP | DOMICILIO
    delivery_type = Column(String, nullable=False, default="PICKUP")

    # Estado del pedido
    status = Column(String, nullable=False, default="TENTATIVO")
    # ── Ciclo de vida completo (14 estados) ──
    # Producción: PAGADO → TURNO_ASIGNADO → EN_PREPARACION → PREPARADO_ENFRIAMIENTO → PREPARADO_REPOSO → LISTO_EMPAQUE
    # Pickup:     EN_EMPAQUE_PICKUP → LISTO_PICKUP_SIN_EMPAQUE → LISTO_PICKUP_EMPACADO
    # Reparto:    EN_EMPAQUE_REPARTO → LISTO_REPARTO_EMPACADO → EN_RUTA
    # Final:      ENTREGADO | CANCELADO


    # --- Datos del cliente ---
    customer_name = Column(String, nullable=True)
    customer_phone = Column(String, nullable=True)

    # --- Fechas comprometidas ---
    earliest_ready_at = Column(DateTime, nullable=True)   # Calculada por el sistema
    committed_at = Column(DateTime, nullable=True)         # Confirmada con el cliente

    # --- Empaque ---
    # "PROPIO" = cliente trae su empaque | "VENTA" = se le vende empaque
    packaging_type = Column(String, nullable=False, default="PROPIO")

    # --- Domicilio (solo si delivery_type = DOMICILIO) ---
    delivery_address = Column(Text, nullable=True)
    delivery_lat = Column(Float, nullable=True)
    delivery_lng = Column(Float, nullable=True)
    delivery_distance_km = Column(Float, nullable=True)
    delivery_fee = Column(Float, nullable=True, default=0.0)

    # Metadata
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)
    notes = Column(Text, nullable=True)

    ticket = relationship("Ticket", backref="order", uselist=False)
