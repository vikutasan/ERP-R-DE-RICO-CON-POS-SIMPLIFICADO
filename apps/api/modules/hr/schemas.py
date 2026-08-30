"""
Módulo de Recursos Humanos — Schemas Pydantic (Fase 1)
"""
from pydantic import BaseModel
from typing import Optional, Any
from datetime import date, time, datetime


# ---------------------------------------------------------------------------
# Positions
# ---------------------------------------------------------------------------
class PositionCreate(BaseModel):
    nombre: str
    descripcion: Optional[str] = None
    area: str = "ventas"
    orden: int = 0

class PositionResponse(BaseModel):
    id: int
    nombre: str
    descripcion: Optional[str] = None
    area: str
    orden: int
    activo: bool
    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Employee Extended (HR data)
# ---------------------------------------------------------------------------
class HREmployeeExtCreate(BaseModel):
    employee_id: int
    fecha_nacimiento: Optional[date] = None
    direccion: Optional[str] = None
    telefono: Optional[str] = None
    telefono_emergencia: Optional[str] = None
    contacto_emergencia: Optional[str] = None
    tipo_sangre: Optional[str] = None
    curp: Optional[str] = None
    nss: Optional[str] = None
    position_id: Optional[int] = None
    fecha_ingreso: Optional[date] = None
    fecha_fin_contrato: Optional[date] = None
    semestre_actual: int = 1
    estado: str = "activo"

class HREmployeeExtUpdate(BaseModel):
    fecha_nacimiento: Optional[date] = None
    direccion: Optional[str] = None
    telefono: Optional[str] = None
    telefono_emergencia: Optional[str] = None
    contacto_emergencia: Optional[str] = None
    tipo_sangre: Optional[str] = None
    curp: Optional[str] = None
    nss: Optional[str] = None
    position_id: Optional[int] = None
    fecha_ingreso: Optional[date] = None
    fecha_fin_contrato: Optional[date] = None
    semestre_actual: Optional[int] = None
    estado: Optional[str] = None

class HREmployeeExtResponse(BaseModel):
    id: int
    employee_id: int
    fecha_nacimiento: Optional[date] = None
    direccion: Optional[str] = None
    telefono: Optional[str] = None
    telefono_emergencia: Optional[str] = None
    contacto_emergencia: Optional[str] = None
    tipo_sangre: Optional[str] = None
    curp: Optional[str] = None
    nss: Optional[str] = None
    foto_url: Optional[str] = None
    ine_frontal_url: Optional[str] = None
    ine_trasera_url: Optional[str] = None
    selfie_url: Optional[str] = None
    position_id: Optional[int] = None
    fecha_ingreso: Optional[date] = None
    fecha_fin_contrato: Optional[date] = None
    semestre_actual: int = 1
    estado: str = "activo"
    created_at: Optional[datetime] = None
    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# HR Employee Full (combines employees + hr_employees_ext)
# ---------------------------------------------------------------------------
class HREmployeeFullResponse(BaseModel):
    """Respuesta completa que combina datos de security.Employee + hr_employees_ext"""
    id: int  # employees.id
    employee_number: Optional[int] = None
    name: str
    employee_code: str  # PIN (no se muestra, pero existe)
    role: str
    is_active: bool
    profile_id: Optional[int] = None
    exclude_attendance: bool = False
    # Datos HR extendidos
    hr: Optional[HREmployeeExtResponse] = None
    position_name: Optional[str] = None
    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Attendance
# ---------------------------------------------------------------------------
class CheckInRequest(BaseModel):
    employee_id: int

class CheckInResponse(BaseModel):
    is_first_login: bool
    message: str
    hora_entrada: Optional[str] = None
    bono_puntualidad: bool = False
    turno_asignado: Optional[str] = None
    posicion_asignada: Optional[str] = None
    hora_inicio_turno: Optional[str] = None
    employee_name: Optional[str] = None

class CheckOutRequest(BaseModel):
    employee_id: int
    tipo_salida: str = "normal"
    observaciones: Optional[str] = None

class CheckOutResponse(BaseModel):
    message: str
    hora_salida: str

class AttendanceResponse(BaseModel):
    id: int
    employee_id: int
    fecha: date
    hora_entrada: Optional[time] = None
    tipo_entrada: Optional[str] = None
    bono_puntualidad: bool = False
    hora_salida: Optional[time] = None
    tipo_salida: Optional[str] = None
    turno_asignado: Optional[str] = None
    posicion_asignada: Optional[str] = None
    observaciones: Optional[str] = None
    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Regulations
# ---------------------------------------------------------------------------
class RegulationResponse(BaseModel):
    id: int
    seccion_numero: int
    titulo: str
    contenido: str
    icono: Optional[str] = None
    activo: bool
    orden: int
    class Config:
        from_attributes = True

class RegulationUpdate(BaseModel):
    titulo: Optional[str] = None
    contenido: Optional[str] = None
    icono: Optional[str] = None
    activo: Optional[bool] = None


# ---------------------------------------------------------------------------
# Schedule Templates
# ---------------------------------------------------------------------------
class ScheduleTemplateResponse(BaseModel):
    id: int
    nombre: str
    descripcion: Optional[str] = None
    data_json: Any = {}
    activo: bool
    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Schedules
# ---------------------------------------------------------------------------
class ScheduleResponse(BaseModel):
    id: int
    semana_año: int
    año: int
    template_id: Optional[int] = None
    asignaciones_json: Any = {}
    modificaciones_json: Any = {}
    generado_auto: bool
    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Birthdays
# ---------------------------------------------------------------------------
class BirthdayResponse(BaseModel):
    employee_id: int
    employee_number: Optional[int] = None
    name: str
    fecha_nacimiento: date
    dia: int
    edad: int
