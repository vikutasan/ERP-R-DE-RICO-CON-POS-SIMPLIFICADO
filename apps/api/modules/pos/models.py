from sqlalchemy import Column, Integer, String, Float, Boolean, ForeignKey, DateTime, JSON, Text, Numeric
from sqlalchemy.orm import relationship
from datetime import datetime
from core.database import Base

class TerminalLock(Base):
    """Candado persistente de terminal. Reemplaza el diccionario en RAM que se perdía con reinicios."""
    __tablename__ = "terminal_locks"

    id = Column(Integer, primary_key=True, index=True)
    terminal_id = Column(String, unique=True, index=True, nullable=False)
    occupier_id = Column(Integer, nullable=False)
    occupier_name = Column(String, nullable=False)
    locked_at = Column(DateTime, default=datetime.now)

class TerminalSession(Base):
    __tablename__ = "terminal_sessions"

    id = Column(Integer, primary_key=True, index=True)
    terminal_id = Column(String, index=True, nullable=False)
    opened_at = Column(DateTime, default=datetime.now)
    closed_at = Column(DateTime, nullable=True)
    is_active = Column(Boolean, default=True)

    tickets = relationship("Ticket", back_populates="session")

class Ticket(Base):
    __tablename__ = "tickets"

    id = Column(Integer, primary_key=True, index=True)
    account_num = Column(String, unique=True, index=True, nullable=False)
    total = Column(Numeric(12, 2), nullable=False, default=0)
    payment_details = Column(JSON, nullable=True) # Almacena lista de pagos mixtos
    created_at = Column(DateTime, default=datetime.now)
    status = Column(String, default="OPEN") # OPEN, PAID, CANCELLED
    version = Column(Integer, default=1, nullable=False)  # Bloqueo optimista: se incrementa en cada update
    
    # --- Data del OMS (Order Management System) ---
    order_type = Column(String, default="VENTA_DIRECTA") # VENTA_DIRECTA, PEDIDO
    order_status = Column(String, default="PROGRAMADO PARA SER PREPARADO")
    delivery_type = Column(String, nullable=True) # PICKUP, DOMICILIO
    customer_name = Column(String, nullable=True)
    customer_phone = Column(String, nullable=True)
    committed_at = Column(DateTime, nullable=True)
    packaging_type = Column(String, nullable=True) # PROPIO, VENTA
    delivery_address = Column(String, nullable=True)
    order_notes = Column(Text, nullable=True)

    terminal_id = Column(String, nullable=True, index=True)  # Campo directo — elimina dependencia de session para obtener terminal

    # --- Separación de canal (migración add_heladeria_support.py) ---
    # NULL / 'PANADERIA' = POS Panadería (IA). 'HELADERIA' = POS de Heladería.
    # Se declara aquí para que el ORM pueda escribir el canal de forma ATÓMICA
    # en el INSERT de reserva (antes se hacía con un PUT posterior no atómico).
    channel = Column(String, nullable=True, default="PANADERIA", index=True)
    customer_group_name = Column(String, nullable=True)

    session_id = Column(Integer, ForeignKey("terminal_sessions.id"))
    cash_session_id = Column(Integer, ForeignKey("cash_sessions.id"), nullable=True)
    
    # Auditoría: Quién capturó y quién cobró
    captured_by_id = Column(Integer, ForeignKey("employees.id"), nullable=True)
    cashed_by_id = Column(Integer, ForeignKey("employees.id"), nullable=True)

    session = relationship("TerminalSession", back_populates="tickets")
    cash_session = relationship("CashSession", back_populates="tickets")
    captured_by = relationship("Employee", foreign_keys=[captured_by_id])
    cashed_by = relationship("Employee", foreign_keys=[cashed_by_id])
    items = relationship("TicketItem", back_populates="ticket")

class TicketItem(Base):
    __tablename__ = "ticket_items"

    id = Column(Integer, primary_key=True, index=True)
    ticket_id = Column(Integer, ForeignKey("tickets.id"))
    product_id = Column(Integer, ForeignKey("products.id"))
    quantity = Column(Integer, nullable=False, default=1)
    unit_price = Column(Numeric(12, 2), nullable=False)
    subtotal = Column(Numeric(12, 2), nullable=False)

    ticket = relationship("Ticket", back_populates="items")
    product = relationship("Product")
