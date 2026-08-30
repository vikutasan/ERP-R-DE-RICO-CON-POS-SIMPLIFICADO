"""
Módulo de Recursos Humanos — Router FastAPI (Fase 1)

Endpoints:
- /health — Health check del módulo
- /check-in — Registrar entrada (primer login del día)
- /check-out — Registrar salida de turno
- /employees — CRUD de empleados con datos HR
- /positions — Catálogo de puestos
- /regulations — Secciones del reglamento
- /attendance — Historial de asistencia
- /birthdays — Cumpleaños del mes
"""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional

from core.database import get_db
from . import schemas, service

router = APIRouter()


# ---------------------------------------------------------------------------
# Health Check
# ---------------------------------------------------------------------------

@router.get("/health")
async def health_check():
    return {"status": "ok", "module": "recursos_humanos", "version": "1.0.0"}


# ---------------------------------------------------------------------------
# Check-In / Check-Out
# ---------------------------------------------------------------------------

@router.post("/attendance/check-in", response_model=None)
async def check_in(datos: schemas.CheckInRequest, db: AsyncSession = Depends(get_db)):
    """Registra la entrada del empleado. Solo cuenta el primer login del día."""
    return await service.check_in(db, datos.employee_id)


@router.post("/attendance/check-out", response_model=None)
async def check_out(datos: schemas.CheckOutRequest, db: AsyncSession = Depends(get_db)):
    """Registra la salida del turno con motivo."""
    return await service.check_out(db, datos.employee_id, datos.tipo_salida, datos.observaciones)


# ---------------------------------------------------------------------------
# Empleados HR
# ---------------------------------------------------------------------------

@router.get("/employees")
async def listar_empleados(db: AsyncSession = Depends(get_db)):
    """Lista todos los empleados activos con datos HR extendidos."""
    return await service.listar_empleados_hr(db)


@router.get("/employees/{employee_id}")
async def obtener_empleado(employee_id: int, db: AsyncSession = Depends(get_db)):
    """Obtiene un empleado con todos sus datos HR."""
    return await service.obtener_empleado_hr(db, employee_id)


@router.post("/employees/{employee_id}/hr-data")
async def crear_datos_hr(
    employee_id: int,
    datos: schemas.HREmployeeExtCreate,
    db: AsyncSession = Depends(get_db)
):
    """Crea o actualiza los datos HR extendidos de un empleado."""
    datos.employee_id = employee_id
    result = await service.crear_o_actualizar_hr_ext(db, employee_id, datos)
    return {"message": "Datos HR actualizados", "id": result.id}


@router.put("/employees/{employee_id}/hr-data")
async def actualizar_datos_hr(
    employee_id: int,
    datos: schemas.HREmployeeExtUpdate,
    db: AsyncSession = Depends(get_db)
):
    """Actualiza los datos HR extendidos de un empleado."""
    result = await service.crear_o_actualizar_hr_ext(db, employee_id, datos)
    return {"message": "Datos HR actualizados", "id": result.id}


# ---------------------------------------------------------------------------
# Puestos
# ---------------------------------------------------------------------------

@router.get("/positions", response_model=List[schemas.PositionResponse])
async def listar_puestos(db: AsyncSession = Depends(get_db)):
    """Lista todos los puestos activos."""
    return await service.listar_puestos(db)


@router.post("/positions", response_model=schemas.PositionResponse, status_code=201)
async def crear_puesto(datos: schemas.PositionCreate, db: AsyncSession = Depends(get_db)):
    """Crea un nuevo puesto."""
    return await service.crear_puesto(db, datos)


# ---------------------------------------------------------------------------
# Reglamento
# ---------------------------------------------------------------------------

@router.get("/regulations", response_model=List[schemas.RegulationResponse])
async def listar_regulaciones(db: AsyncSession = Depends(get_db)):
    """Lista todas las secciones del reglamento."""
    return await service.listar_regulaciones(db)


# ---------------------------------------------------------------------------
# Asistencia (historial)
# ---------------------------------------------------------------------------

@router.get("/attendance/{employee_id}")
async def obtener_asistencia(
    employee_id: int,
    mes: Optional[int] = None,
    año: Optional[int] = None,
    db: AsyncSession = Depends(get_db)
):
    """Obtiene el historial de asistencia de un empleado."""
    registros = await service.obtener_asistencia_empleado(db, employee_id, mes, año)
    return [
        {
            "id": r.id,
            "fecha": r.fecha.isoformat(),
            "hora_entrada": r.hora_entrada.strftime("%H:%M") if r.hora_entrada else None,
            "tipo_entrada": r.tipo_entrada,
            "bono_puntualidad": r.bono_puntualidad,
            "hora_salida": r.hora_salida.strftime("%H:%M") if r.hora_salida else None,
            "tipo_salida": r.tipo_salida,
            "turno_asignado": r.turno_asignado,
            "posicion_asignada": r.posicion_asignada,
            "observaciones": r.observaciones,
        }
        for r in registros
    ]


# ---------------------------------------------------------------------------
# Cumpleaños
# ---------------------------------------------------------------------------

@router.get("/birthdays")
async def obtener_cumpleaños(mes: Optional[int] = None, db: AsyncSession = Depends(get_db)):
    """Obtiene los cumpleaños del mes indicado (o del mes actual)."""
    return await service.obtener_cumpleaños_mes(db, mes)


# ===========================================================================
# FASE 2 — Endpoints operativos
# ===========================================================================

# ---------------------------------------------------------------------------
# Incidencias
# ---------------------------------------------------------------------------

@router.get("/incidents/{employee_id}")
async def listar_incidencias(employee_id: int, db: AsyncSession = Depends(get_db)):
    return await service.listar_incidencias(db, employee_id)


@router.post("/incidents")
async def crear_incidencia(datos: dict, db: AsyncSession = Depends(get_db)):
    """Crea una incidencia y ejecuta escalamiento automático si aplica."""
    return await service.crear_incidencia(db, datos)


@router.get("/incidents/{employee_id}/summary")
async def resumen_incidencias(employee_id: int, db: AsyncSession = Depends(get_db)):
    """Resumen: cuántas llamadas, actas y estado actual."""
    return await service.resumen_incidencias(db, employee_id)


# ---------------------------------------------------------------------------
# Fianza de Uniforme
# ---------------------------------------------------------------------------

@router.get("/uniform/{employee_id}")
async def obtener_uniforme(employee_id: int, db: AsyncSession = Depends(get_db)):
    return await service.obtener_uniformes(db, employee_id)


@router.post("/uniform")
async def crear_uniforme(datos: dict, db: AsyncSession = Depends(get_db)):
    return await service.crear_uniforme(db, datos)


@router.post("/uniform/{deposit_id}/movement")
async def agregar_movimiento_uniforme(deposit_id: int, datos: dict, db: AsyncSession = Depends(get_db)):
    return await service.agregar_movimiento_uniforme(db, deposit_id, datos)


# ---------------------------------------------------------------------------
# Fondo de Cobertura
# ---------------------------------------------------------------------------

@router.get("/coverage/{employee_id}")
async def obtener_fondo(employee_id: int, db: AsyncSession = Depends(get_db)):
    return await service.obtener_fondo_cobertura(db, employee_id)


@router.post("/coverage")
async def crear_fondo(datos: dict, db: AsyncSession = Depends(get_db)):
    return await service.crear_fondo_cobertura(db, datos)


@router.post("/coverage/{fund_id}/movement")
async def agregar_movimiento_fondo(fund_id: int, datos: dict, db: AsyncSession = Depends(get_db)):
    return await service.agregar_movimiento_fondo(db, fund_id, datos)


# ---------------------------------------------------------------------------
# Tabla Salarial
# ---------------------------------------------------------------------------

@router.get("/salary-tables")
async def listar_tablas_salariales(db: AsyncSession = Depends(get_db)):
    return await service.listar_tablas_salariales(db)


@router.post("/salary-tables")
async def guardar_tabla_salarial(datos: dict, db: AsyncSession = Depends(get_db)):
    return await service.guardar_tabla_salarial(db, datos)


# ---------------------------------------------------------------------------
# Nómina
# ---------------------------------------------------------------------------

@router.get("/payroll/{employee_id}")
async def obtener_nomina(employee_id: int, semana: Optional[int] = None, año: Optional[int] = None, db: AsyncSession = Depends(get_db)):
    return await service.obtener_nomina(db, employee_id, semana, año)


@router.post("/payroll/calculate")
async def calcular_nomina(datos: dict, db: AsyncSession = Depends(get_db)):
    """Calcula la nómina semanal de un empleado basándose en asistencia, deducciones, etc."""
    return await service.calcular_nomina(db, datos.get("employee_id"), datos.get("semana"), datos.get("año"))


# ---------------------------------------------------------------------------
# PSGs (Permisos Sin Goce)
# ---------------------------------------------------------------------------

@router.get("/psg/{employee_id}")
async def listar_psgs(employee_id: int, db: AsyncSession = Depends(get_db)):
    return await service.listar_psgs(db, employee_id)


@router.post("/psg")
async def crear_psg(datos: dict, db: AsyncSession = Depends(get_db)):
    return await service.crear_psg(db, datos)


# ---------------------------------------------------------------------------
# Configuración genérica (todas las suites)
# ---------------------------------------------------------------------------

@router.get("/config/{config_type}")
async def obtener_config(config_type: str, db: AsyncSession = Depends(get_db)):
    """Obtiene configuración de cualquier suite: incidents, uniform, coverage, payroll, psg."""
    return await service.obtener_config(db, config_type)


@router.put("/config/{config_type}")
async def guardar_config(config_type: str, datos: dict, db: AsyncSession = Depends(get_db)):
    """Guarda configuración de cualquier suite."""
    return await service.guardar_config(db, config_type, datos)


# ===========================================================================
# FASE 3 — Evaluación y cierre
# ===========================================================================

# --- Vacaciones ---
@router.get("/vacations/{employee_id}")
async def listar_vacaciones(employee_id: int, db: AsyncSession = Depends(get_db)):
    return await service.listar_vacaciones(db, employee_id)

@router.post("/vacations")
async def crear_vacacion(datos: dict, db: AsyncSession = Depends(get_db)):
    return await service.crear_vacacion(db, datos)

# --- Psicométricos ---
@router.get("/psychometrics/{employee_id}")
async def listar_psicometricos(employee_id: int, db: AsyncSession = Depends(get_db)):
    return await service.listar_psicometricos(db, employee_id)

@router.post("/psychometrics")
async def crear_psicometrico(datos: dict, db: AsyncSession = Depends(get_db)):
    return await service.crear_psicometrico(db, datos)

# --- KPIs ---
@router.get("/kpis/{employee_id}")
async def listar_kpis(employee_id: int, db: AsyncSession = Depends(get_db)):
    return await service.listar_kpis(db, employee_id)

@router.post("/kpis")
async def crear_kpi(datos: dict, db: AsyncSession = Depends(get_db)):
    return await service.crear_kpi(db, datos)

# --- Encuesta de Salida ---
@router.get("/exit-survey/{employee_id}")
async def obtener_encuesta_salida(employee_id: int, db: AsyncSession = Depends(get_db)):
    return await service.obtener_encuesta_salida(db, employee_id)

@router.post("/exit-survey")
async def crear_encuesta_salida(datos: dict, db: AsyncSession = Depends(get_db)):
    return await service.crear_encuesta_salida(db, datos)

# --- Finiquito ---
@router.get("/severance/{employee_id}")
async def obtener_finiquito(employee_id: int, db: AsyncSession = Depends(get_db)):
    return await service.obtener_finiquito(db, employee_id)

@router.post("/severance/calculate")
async def calcular_finiquito(datos: dict, db: AsyncSession = Depends(get_db)):
    return await service.calcular_finiquito(db, datos)



# ===========================================================================
# HORARIOS — Rotacion Semanal A/B/C/D
# ===========================================================================

@router.get("/schedules/templates")
async def listar_templates_horario(db: AsyncSession = Depends(get_db)):
    """Lista los 4 templates (A, B, C, D) con sus datos."""
    return await service.listar_templates_horario(db)


@router.get("/schedules/current")
async def obtener_horario_semana_actual(db: AsyncSession = Depends(get_db)):
    """Devuelve el template correspondiente a la semana actual (auto-rotacion)."""
    return await service.obtener_horario_semana_actual(db)


@router.get("/schedules/templates/{template_id}")
async def obtener_template_horario(template_id: int, db: AsyncSession = Depends(get_db)):
    """Template especifico con todas sus celdas."""
    return await service.obtener_template_horario(db, template_id)


@router.put("/schedules/templates/{template_id}")
async def actualizar_template_horario(template_id: int, datos: dict, db: AsyncSession = Depends(get_db)):
    """Actualiza la matriz data_json de un template."""
    return await service.actualizar_template_horario(db, template_id, datos)


@router.get("/schedules/week")
async def obtener_horario_semana(semana: int, anio: int, db: AsyncSession = Depends(get_db)):
    """Obtiene el HRSchedule de una semana especifica (o lo genera si no existe)."""
    return await service.obtener_horario_semana(db, semana, anio)


@router.put("/schedules/week/{schedule_id}/assignments")
async def actualizar_asignaciones_semana(schedule_id: int, datos: dict, db: AsyncSession = Depends(get_db)):
    """Actualiza las asignaciones de personal de una semana especifica."""
    return await service.actualizar_asignaciones_semana(db, schedule_id, datos)

