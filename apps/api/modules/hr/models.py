"""
Módulo de Recursos Humanos — Modelos de Base de Datos (Fase 1)

Tablas para la base del módulo HR:
- hr_employees_ext: Extensión de datos del empleado
- hr_positions: Catálogo de puestos
- hr_attendance: Registro de entradas/salidas
- hr_regulations: Secciones del reglamento
- hr_schedule_templates: Plantillas de horario A/B/C/D
- hr_schedules: Asignación semanal de horarios
"""
from sqlalchemy import (
    Column, Integer, String, Boolean, Float, ForeignKey,
    JSON, Text, DateTime, Date, Time, Enum as SAEnum
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from core.database import Base
import enum


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------
class EstadoEmpleado(str, enum.Enum):
    ACTIVO = "activo"
    BAJA = "baja"
    PROCESO_BAJA = "proceso_baja"
    ASPIRANTE = "aspirante"


class TipoEntrada(str, enum.Enum):
    PUNTUAL = "puntual"
    RETARDO = "retardo"


class TipoSalida(str, enum.Enum):
    NORMAL = "normal"
    PRO = "pro"  # Permiso para retirarse de operación
    ABANDONO = "abandono"
    NO_REGISTRADA = "no_registrada"
    INCAPACIDAD = "incapacidad"
    EMERGENCIA = "emergencia"


class AreaPuesto(str, enum.Enum):
    VENTAS = "ventas"
    PRODUCCION = "produccion"
    ADMINISTRACION = "administracion"


# ---------------------------------------------------------------------------
# Extensión de datos del empleado (FK a employees existente)
# ---------------------------------------------------------------------------
class HREmployeeExt(Base):
    """
    Datos extendidos de RRHH. Se vincula 1:1 con la tabla employees existente
    del módulo de seguridad. No duplicamos name/employee_code/role/is_active.
    """
    __tablename__ = "hr_employees_ext"

    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), unique=True, nullable=False, index=True)

    # Datos personales
    fecha_nacimiento = Column(Date, nullable=True)
    direccion = Column(String, nullable=True)
    telefono = Column(String, nullable=True)
    telefono_emergencia = Column(String, nullable=True)
    contacto_emergencia = Column(String, nullable=True)
    tipo_sangre = Column(String, nullable=True)
    curp = Column(String, nullable=True)
    nss = Column(String, nullable=True)  # Número de Seguro Social

    # Documentos (URLs a archivos estáticos)
    foto_url = Column(String, nullable=True)
    ine_frontal_url = Column(String, nullable=True)
    ine_trasera_url = Column(String, nullable=True)
    selfie_url = Column(String, nullable=True)

    # Datos laborales
    position_id = Column(Integer, ForeignKey("hr_positions.id"), nullable=True)
    fecha_ingreso = Column(Date, nullable=True)
    fecha_fin_contrato = Column(Date, nullable=True)
    semestre_actual = Column(Integer, default=1)  # 1-6, sube cada contrato de 6 meses
    estado = Column(String, default=EstadoEmpleado.ACTIVO)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relaciones
    position = relationship("HRPosition", back_populates="employees")


# ---------------------------------------------------------------------------
# Catálogo de puestos
# ---------------------------------------------------------------------------
class HRPosition(Base):
    """
    Catálogo de puestos de la empresa.
    Ejemplo: Aspirante, Ayudante General, Artesano, Cajero, Repartidor, Gerente
    """
    __tablename__ = "hr_positions"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String, unique=True, nullable=False)
    descripcion = Column(String, nullable=True)
    area = Column(String, default=AreaPuesto.VENTAS)  # ventas, produccion, admin
    orden = Column(Integer, default=0)  # Para ordenar en la tabla
    activo = Column(Boolean, default=True)

    employees = relationship("HREmployeeExt", back_populates="position")


# ---------------------------------------------------------------------------
# Registro de asistencia (check-in / check-out)
# ---------------------------------------------------------------------------
class HRAttendance(Base):
    """
    Cada registro = 1 día de trabajo de un empleado.
    Se crea al primer login del día (check-in) y se completa al registrar salida.
    """
    __tablename__ = "hr_attendance"

    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False, index=True)
    fecha = Column(Date, nullable=False, index=True)

    # Entrada
    hora_entrada = Column(Time, nullable=True)
    tipo_entrada = Column(String, nullable=True)  # puntual / retardo
    bono_puntualidad = Column(Boolean, default=False)  # True si llegó a tiempo

    # Salida
    hora_salida = Column(Time, nullable=True)
    tipo_salida = Column(String, nullable=True)  # normal / pro / abandono / no_registrada

    # Turno asignado ese día (para referencia)
    turno_asignado = Column(String, nullable=True)  # "apertura" / "cierre"
    posicion_asignada = Column(String, nullable=True)  # "RL", "RAP", etc.
    hora_inicio_turno = Column(Time, nullable=True)  # 06:00 / 14:00

    # Observaciones (para incidencias manuales del gerente)
    observaciones = Column(Text, nullable=True)
    registrado_por = Column(Integer, ForeignKey("employees.id"), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())


# ---------------------------------------------------------------------------
# Secciones del reglamento
# ---------------------------------------------------------------------------
class HRRegulation(Base):
    """
    Cada fila = 1 sección del reglamento interno.
    El contenido es editable desde el panel de Reglamento del módulo HR.
    """
    __tablename__ = "hr_regulations"

    id = Column(Integer, primary_key=True, index=True)
    seccion_numero = Column(Integer, nullable=False, unique=True)
    titulo = Column(String, nullable=False)
    contenido = Column(Text, nullable=False)  # Markdown
    icono = Column(String, nullable=True)  # Emoji
    activo = Column(Boolean, default=True)
    orden = Column(Integer, default=0)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


# ---------------------------------------------------------------------------
# Plantillas de horario (A, B, C, D)
# ---------------------------------------------------------------------------
class HRScheduleTemplate(Base):
    """
    Almacena las 4 plantillas de horario rotativo.
    data_json contiene la matriz completa de 20 posiciones × 7 días.
    """
    __tablename__ = "hr_schedule_templates"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String, unique=True, nullable=False)  # "A", "B", "C", "D"
    descripcion = Column(String, nullable=True)
    # Estructura: { "apertura": { "RL": [pos_lunes, pos_martes, ...], ... }, "cierre": { ... } }
    data_json = Column(JSON, nullable=False, default={})
    activo = Column(Boolean, default=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


# ---------------------------------------------------------------------------
# Asignación semanal de horarios
# ---------------------------------------------------------------------------
class HRSchedule(Base):
    """
    Asignación real de cada semana.
    Se genera automáticamente rotando A→B→C→D.
    El gerente puede modificar posiciones puntuales (se guardan en modificaciones_json).
    """
    __tablename__ = "hr_schedules"

    id = Column(Integer, primary_key=True, index=True)
    semana_año = Column(Integer, nullable=False)  # 1-53
    año = Column(Integer, nullable=False)
    template_id = Column(Integer, ForeignKey("hr_schedule_templates.id"), nullable=True)

    # Asignación: { posicion_numero: employee_id, ... }
    asignaciones_json = Column(JSON, nullable=False, default={})
    # Modificaciones manuales del gerente: { "dia_posicion": { "employee_id": X, "motivo": "..." } }
    modificaciones_json = Column(JSON, nullable=False, default={})
    generado_auto = Column(Boolean, default=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    template = relationship("HRScheduleTemplate")


# ===========================================================================
# FASE 2 — Tablas operativas
# ===========================================================================

# ---------------------------------------------------------------------------
# Incidencias (llamadas de atención, actas, bajas)
# ---------------------------------------------------------------------------
class HRIncident(Base):
    """
    Registro de incidencias disciplinarias.
    Escalamiento automático: 3 llamadas → acta, 3 actas → baja.
    """
    __tablename__ = "hr_incidents"

    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False, index=True)
    fecha = Column(Date, nullable=False)
    tipo = Column(String, nullable=False)  # llamada_atencion / acta_administrativa / baja
    motivo = Column(String, nullable=False)
    descripcion = Column(Text, nullable=True)
    # Periodo de contrato al que pertenece (para resetear conteo por contrato)
    contrato_periodo = Column(String, nullable=True)  # ej: "2026-S1"
    # Firma
    firmado_por = Column(Integer, ForeignKey("employees.id"), nullable=True)  # Gerente
    firma_empleado = Column(Boolean, default=False)  # Si el empleado firmó
    # Suspensión (si aplica)
    dias_suspension = Column(Integer, default=0)
    fecha_reincorporacion = Column(Date, nullable=True)
    # Si fue generada automáticamente por escalamiento
    auto_generada = Column(Boolean, default=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())


class HRIncidentConfig(Base):
    """Configuración de escalamiento de incidencias."""
    __tablename__ = "hr_incident_config"

    id = Column(Integer, primary_key=True, index=True)
    parametro = Column(String, unique=True, nullable=False)
    valor_json = Column(JSON, nullable=False, default={})


# ---------------------------------------------------------------------------
# Fianza de Uniforme
# ---------------------------------------------------------------------------
class HRUniformDeposit(Base):
    """Fianza de uniforme por empleado."""
    __tablename__ = "hr_uniform_deposits"

    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False, index=True)
    uniforme_numero = Column(Integer, default=1)  # 1er o 2do juego
    fecha_entrega = Column(Date, nullable=True)
    fianza_total = Column(Float, default=600.0)
    pagado = Column(Float, default=0.0)
    estado = Column(String, default="pendiente")  # pendiente / cubierto / devuelto

    created_at = Column(DateTime(timezone=True), server_default=func.now())


class HRUniformMovement(Base):
    """Movimientos de fianza de uniforme (cargos y abonos semanales)."""
    __tablename__ = "hr_uniform_movements"

    id = Column(Integer, primary_key=True, index=True)
    deposit_id = Column(Integer, ForeignKey("hr_uniform_deposits.id"), nullable=False)
    fecha = Column(Date, nullable=False)
    concepto = Column(String, nullable=False)  # "Descuento semanal", "Devolución", etc.
    monto = Column(Float, nullable=False)
    tipo = Column(String, nullable=False)  # cargo / abono

    created_at = Column(DateTime(timezone=True), server_default=func.now())


class HRUniformConfig(Base):
    """Configuración de uniformes (prendas, costos, monto semanal)."""
    __tablename__ = "hr_uniform_config"

    id = Column(Integer, primary_key=True, index=True)
    parametro = Column(String, unique=True, nullable=False)
    valor_json = Column(JSON, nullable=False, default={})


# ---------------------------------------------------------------------------
# Fondo de Cobertura
# ---------------------------------------------------------------------------
class HRCoverageFund(Base):
    """Fondo de cobertura por empleado ($600 para RsG)."""
    __tablename__ = "hr_coverage_fund"

    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False, index=True)
    monto_requerido = Column(Float, default=600.0)
    monto_cubierto = Column(Float, default=0.0)
    estado = Column(String, default="pendiente")  # pendiente / cubierto

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class HRCoverageMovement(Base):
    """Movimientos del fondo de cobertura."""
    __tablename__ = "hr_coverage_movements"

    id = Column(Integer, primary_key=True, index=True)
    fund_id = Column(Integer, ForeignKey("hr_coverage_fund.id"), nullable=False)
    fecha = Column(Date, nullable=False)
    concepto = Column(String, nullable=False)  # "Aportación semanal", "Aplicación por falta", "Reposición 1/3"
    monto = Column(Float, nullable=False)
    tipo = Column(String, nullable=False)  # cargo / abono
    porcentaje_aplicado = Column(Float, nullable=True)  # % aplicado según anticipación
    dias_anticipacion = Column(Integer, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())


class HRCoverageConfig(Base):
    """Configuración del fondo de cobertura."""
    __tablename__ = "hr_coverage_config"

    id = Column(Integer, primary_key=True, index=True)
    parametro = Column(String, unique=True, nullable=False)
    valor_json = Column(JSON, nullable=False, default={})


# ---------------------------------------------------------------------------
# Tabla Salarial
# ---------------------------------------------------------------------------
class HRSalaryTable(Base):
    """
    Tabla salarial por puesto y semestre.
    Cada puesto tiene 6 filas (semestres 1-6).
    """
    __tablename__ = "hr_salary_tables"

    id = Column(Integer, primary_key=True, index=True)
    position_id = Column(Integer, ForeignKey("hr_positions.id"), nullable=False, index=True)
    semestre = Column(Integer, nullable=False)  # 1-6
    sueldo_hora = Column(Float, nullable=False)
    bono_hora = Column(Float, nullable=False)
    sueldo_dia = Column(Float, nullable=False)  # sueldo_hora * 8
    bono_dia = Column(Float, nullable=False)    # bono_hora * 8

    created_at = Column(DateTime(timezone=True), server_default=func.now())


# ---------------------------------------------------------------------------
# Nómina
# ---------------------------------------------------------------------------
class HRPayroll(Base):
    """Nómina semanal calculada por empleado."""
    __tablename__ = "hr_payroll"

    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False, index=True)
    semana = Column(Integer, nullable=False)  # 1-53
    año = Column(Integer, nullable=False)
    # Días
    dias_trabajados = Column(Integer, default=0)
    dias_puntuales = Column(Integer, default=0)
    dias_retardo = Column(Integer, default=0)
    dias_falta = Column(Integer, default=0)
    dias_suspension = Column(Integer, default=0)
    dias_psg = Column(Integer, default=0)
    # Percepciones
    salario_base = Column(Float, default=0.0)
    bono_puntualidad = Column(Float, default=0.0)
    total_percepciones = Column(Float, default=0.0)
    # Deducciones
    deduccion_uniforme = Column(Float, default=0.0)
    deduccion_fondo = Column(Float, default=0.0)
    deduccion_otros = Column(Float, default=0.0)
    total_deducciones = Column(Float, default=0.0)
    # Neto
    neto = Column(Float, default=0.0)
    # Estado
    aprobado = Column(Boolean, default=False)
    aprobado_por = Column(Integer, ForeignKey("employees.id"), nullable=True)
    observaciones = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())


class HRPayrollDeduction(Base):
    """Deducciones especiales individuales de una nómina."""
    __tablename__ = "hr_payroll_deductions"

    id = Column(Integer, primary_key=True, index=True)
    payroll_id = Column(Integer, ForeignKey("hr_payroll.id"), nullable=False)
    concepto = Column(String, nullable=False)  # "Merma", "Daño equipo", etc.
    monto = Column(Float, nullable=False)
    descripcion = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())


class HRPayrollConfig(Base):
    """Configuración general de nómina."""
    __tablename__ = "hr_payroll_config"

    id = Column(Integer, primary_key=True, index=True)
    parametro = Column(String, unique=True, nullable=False)
    valor_json = Column(JSON, nullable=False, default={})


# ---------------------------------------------------------------------------
# Permisos Sin Goce de Sueldo (PSG)
# ---------------------------------------------------------------------------
class HRPSG(Base):
    """Registro de permisos sin goce de sueldo."""
    __tablename__ = "hr_psg"

    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False, index=True)
    fecha_solicitado = Column(Date, nullable=False)
    fecha_permiso = Column(Date, nullable=False)
    dias_anticipacion = Column(Integer, default=0)
    # Estado
    aprobado = Column(Boolean, default=False)
    aprobado_por = Column(Integer, ForeignKey("employees.id"), nullable=True)
    # Fondo de cobertura (si aplica)
    uso_fondo = Column(Boolean, default=False)
    porcentaje_fondo = Column(Float, default=0.0)  # % aplicado
    monto_fondo = Column(Float, default=0.0)
    # Periodo de contrato
    contrato_periodo = Column(String, nullable=True)
    observaciones = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())


class HRPSGConfig(Base):
    """Configuración de PSGs."""
    __tablename__ = "hr_psg_config"

    id = Column(Integer, primary_key=True, index=True)
    parametro = Column(String, unique=True, nullable=False)
    valor_json = Column(JSON, nullable=False, default={})


# ===========================================================================
# FASE 3 — Evaluación
# ===========================================================================

# ---------------------------------------------------------------------------
# Vacaciones
# ---------------------------------------------------------------------------
class HRVacation(Base):
    __tablename__ = "hr_vacations"
    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False, index=True)
    fecha_inicio = Column(Date, nullable=False)
    fecha_fin = Column(Date, nullable=False)
    dias = Column(Integer, nullable=False)
    prima_vacacional = Column(Float, default=0.0)
    estado = Column(String, default="pendiente")  # pendiente / aprobado / rechazado / completado
    aprobado_por = Column(Integer, ForeignKey("employees.id"), nullable=True)
    observaciones = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class HRVacationConfig(Base):
    __tablename__ = "hr_vacation_config"
    id = Column(Integer, primary_key=True, index=True)
    parametro = Column(String, unique=True, nullable=False)
    valor_json = Column(JSON, nullable=False, default={})


# ---------------------------------------------------------------------------
# Evaluación Psicométrica
# ---------------------------------------------------------------------------
class HRPsychometric(Base):
    """
    Resultados de tests psicométricos:
    - DISC (Dominancia, Influencia, Estabilidad, Cumplimiento)
    - Valores (orientación a procesos/relaciones/resultados/innovación)
    - Aptitud (numérica, verbal, abstracta)
    """
    __tablename__ = "hr_psychometrics"
    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False, index=True)
    fecha = Column(Date, nullable=False)
    test_tipo = Column(String, nullable=False)  # disc / valores / aptitud
    resultados_json = Column(JSON, nullable=False, default={})
    recomendacion = Column(Text, nullable=True)
    evaluador = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class HRPsychometricConfig(Base):
    __tablename__ = "hr_psychometric_config"
    id = Column(Integer, primary_key=True, index=True)
    parametro = Column(String, unique=True, nullable=False)
    valor_json = Column(JSON, nullable=False, default={})


# ---------------------------------------------------------------------------
# KPIs por Empleado
# ---------------------------------------------------------------------------
class HRKpi(Base):
    __tablename__ = "hr_kpis"
    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False, index=True)
    mes = Column(Integer, nullable=False)
    año = Column(Integer, nullable=False)
    score_total = Column(Float, default=0.0)
    detalle_json = Column(JSON, nullable=False, default={})
    evaluado_por = Column(Integer, ForeignKey("employees.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class HRKpiConfig(Base):
    __tablename__ = "hr_kpi_config"
    id = Column(Integer, primary_key=True, index=True)
    parametro = Column(String, unique=True, nullable=False)
    valor_json = Column(JSON, nullable=False, default={})


# ---------------------------------------------------------------------------
# Encuesta de Salida
# ---------------------------------------------------------------------------
class HRExitSurvey(Base):
    __tablename__ = "hr_exit_surveys"
    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False, index=True)
    fecha = Column(Date, nullable=False)
    motivo_salida = Column(String, nullable=False)
    respuestas_json = Column(JSON, nullable=False, default={})
    observaciones = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class HRExitSurveyConfig(Base):
    __tablename__ = "hr_exit_survey_config"
    id = Column(Integer, primary_key=True, index=True)
    parametro = Column(String, unique=True, nullable=False)
    valor_json = Column(JSON, nullable=False, default={})


# ---------------------------------------------------------------------------
# Finiquito
# ---------------------------------------------------------------------------
class HRSeverance(Base):
    __tablename__ = "hr_severance"
    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False, index=True)
    fecha_calculo = Column(Date, nullable=False)
    motivo_salida = Column(String, nullable=False)  # renuncia / baja_disciplinaria / termino_contrato / mutuo_acuerdo
    percepciones_json = Column(JSON, nullable=False, default={})
    deducciones_json = Column(JSON, nullable=False, default={})
    neto = Column(Float, default=0.0)
    aprobado = Column(Boolean, default=False)
    aprobado_por = Column(Integer, ForeignKey("employees.id"), nullable=True)
    firmado = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class HRSeveranceConfig(Base):
    __tablename__ = "hr_severance_config"
    id = Column(Integer, primary_key=True, index=True)
    parametro = Column(String, unique=True, nullable=False)
    valor_json = Column(JSON, nullable=False, default={})

