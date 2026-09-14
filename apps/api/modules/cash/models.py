from sqlalchemy import Column, Integer, String, Float, Boolean, ForeignKey, DateTime, Numeric
from sqlalchemy.orm import relationship
from core.database import Base
from core.timestamps import utcnow


class CashSession(Base):
    """
    Representa el turno de un cajero en una terminal.
    Se abre con un fondo inicial y se cierra al finalizar el turno.
    """
    __tablename__ = "cash_sessions"

    id = Column(Integer, primary_key=True, index=True)
    terminal_id = Column(String, nullable=False, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False)
    employee_name = Column(String, nullable=False)  # Desnormalizado para reportes rápidos
    opening_float = Column(Numeric(12, 2), nullable=False, default=0)
    status = Column(String, nullable=False, default="OPEN")  # OPEN, CLOSED
    opened_at = Column(DateTime, default=utcnow)
    closed_at = Column(DateTime, nullable=True)

    # Montos físicos capturados al cierre
    physical_cash = Column(Numeric(12, 2), nullable=True)
    physical_credit = Column(Numeric(12, 2), nullable=True)
    physical_debit = Column(Numeric(12, 2), nullable=True)

    movements = relationship("CashMovement", back_populates="session", cascade="all, delete-orphan")
    tickets = relationship("Ticket", primaryjoin="CashSession.id == Ticket.cash_session_id", back_populates="cash_session")


class CashMovement(Base):
    """
    Registro de una entrada o salida de dinero durante un turno de caja.
    Ejemplos: retiro de propinas, refuerzo de efectivo.
    """
    __tablename__ = "cash_movements"

    id = Column(Integer, primary_key=True, index=True)
    cash_session_id = Column(Integer, ForeignKey("cash_sessions.id"), nullable=False)
    movement_type = Column(String, nullable=False)  # ENTRADA, SALIDA
    amount = Column(Numeric(12, 2), nullable=False)
    concept = Column(String, nullable=False)
    created_at = Column(DateTime, default=utcnow)

    session = relationship("CashSession", back_populates="movements")
