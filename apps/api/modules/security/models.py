import datetime

from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, JSON, DateTime, Text
from sqlalchemy.orm import relationship
from core.database import Base


def _utcnow():
    """UTC naive: las columnas DateTime son TIMESTAMP WITHOUT TIME ZONE.

    asyncpg rechaza datetimes con tzinfo, por eso se elimina explicitamente.
    """
    return datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)


class SecurityProfile(Base):
    """
    Define un perfil de acceso al sistema con permisos granulares.
    """
    __tablename__ = "security_profiles"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)
    description = Column(String, nullable=True)
    # Almacena permisos como dict: {"pos": "full", "inventory": "read", ...}
    permissions = Column(JSON, nullable=False, default={})
    is_system = Column(Boolean, default=False)  # Para perfiles base no eliminables

    employees = relationship("Employee", back_populates="profile")


class Employee(Base):
    """
    Representa un empleado del sistema con acceso al POS.
    Cada empleado tiene un PIN único para autenticarse como cajero.
    """
    __tablename__ = "employees"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    employee_code = Column(String, unique=True, nullable=False, index=True)  # PIN de acceso
    role = Column(String, nullable=False, default="CAJERO")  # Legacy: CAJERO, SUPERVISOR, ADMIN
    is_active = Column(Boolean, default=True)
    
    profile_id = Column(Integer, ForeignKey("security_profiles.id"), nullable=True)
    profile = relationship("SecurityProfile", back_populates="employees")


class Auditoria(Base):
    """
    v7 (Fase 2, seccion 14 del Contexto Maestro): bitacora de operaciones criticas.

    Regla absoluta: la auditoria es de insercion unica y se escribe EN LA MISMA
    TRANSACCION SQL que la operacion auditada. Si la operacion hace rollback, el
    registro de auditoria desaparece con ella (no se audita lo que no ocurrio).

    No se actualiza ni se elimina: es un libro mayor inmutable.
    """
    __tablename__ = "auditoria"

    id = Column(Integer, primary_key=True, index=True)
    # Empleado que ejecuto la accion (puede ser NULL si el actor no se identifico).
    usuario_id = Column(Integer, ForeignKey("employees.id"), nullable=True, index=True)
    # Verbo de la operacion: CREAR, ACTUALIZAR, ELIMINAR, MERMA, TRASPASO, AJUSTE...
    accion = Column(String(50), nullable=False, index=True)
    # Entidad afectada: almacen, stock_almacen, movimiento_inventario...
    entidad = Column(String(80), nullable=False, index=True)
    # Identificador de la entidad afectada (se guarda como texto por flexibilidad).
    entidad_id = Column(String(120), nullable=True, index=True)
    # Estado previo y posterior en JSON para trazabilidad completa.
    valores_antes = Column(JSON, nullable=True)
    valores_despues = Column(JSON, nullable=True)
    # Contexto libre (motivo de merma, notas, etc.).
    detalle = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=_utcnow, index=True)

    usuario = relationship("Employee")
