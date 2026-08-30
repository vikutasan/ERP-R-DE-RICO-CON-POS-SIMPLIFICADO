"""
Módulo de Recursos Humanos — Lógica de Negocio (Fase 1)

Servicios principales:
- Check-in / Check-out con detección de primer login del día
- CRUD de empleados extendidos
- Gestión de puestos
- Reglamento (seed + CRUD)
- Horarios (rotación automática A→B→C→D)
- Cumpleaños del mes
"""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, extract
from sqlalchemy.orm import selectinload
from fastapi import HTTPException
from datetime import date, time, datetime, timedelta
from zoneinfo import ZoneInfo

MEXICO_TZ = ZoneInfo('America/Mexico_City')
from typing import Optional

from . import models, schemas
from modules.security.models import Employee


# ---------------------------------------------------------------------------
# Check-In / Check-Out
# ---------------------------------------------------------------------------

async def check_in(db: AsyncSession, employee_id: int) -> dict:
    """
    Registra la entrada del empleado si es su primer login del día.
    Determina si fue puntual basándose en el turno asignado.
    SEGURO: Si falla, no afecta el login del ERP.
    """
    hoy = datetime.now(MEXICO_TZ).date()
    ahora = datetime.now(MEXICO_TZ).time()

    # Verificar si el empleado está excluido de attendance
    emp_result = await db.execute(
        select(Employee).where(Employee.id == employee_id)
    )
    empleado = emp_result.scalar_one_or_none()
    if not empleado:
        raise HTTPException(status_code=404, detail="Empleado no encontrado")

    # Verificar si tiene exclude_attendance (columna nueva, puede no existir aún)
    exclude = getattr(empleado, 'exclude_attendance', False)
    if exclude:
        return {
            "is_first_login": False,
            "message": "Empleado excluido de registro de asistencia",
            "employee_name": empleado.name
        }

    # Buscar si ya hay registro de hoy
    existing = await db.execute(
        select(models.HRAttendance).where(
            and_(
                models.HRAttendance.employee_id == employee_id,
                models.HRAttendance.fecha == hoy
            )
        )
    )
    registro_existente = existing.scalar_one_or_none()

    if registro_existente:
        # Ya fichó hoy — no es primer login
        return {
            "is_first_login": False,
            "message": "Ya registraste tu entrada hoy",
            "hora_entrada": registro_existente.hora_entrada.strftime("%H:%M") if registro_existente.hora_entrada else None,
            "employee_name": empleado.name
        }

    # Es primer login del día — registrar entrada
    # TODO: Determinar turno asignado según horario rotativo de la semana
    # Por ahora, usamos hora de inicio genérica (6:00 para apertura, 14:00 para cierre)
    hora_inicio_turno = time(6, 0)  # Default: apertura
    tolerancia = time(6, 15)  # 15 minutos de tolerancia

    # Determinar puntualidad
    es_puntual = ahora <= tolerancia
    tipo_entrada = "puntual" if es_puntual else "retardo"

    nuevo_registro = models.HRAttendance(
        employee_id=employee_id,
        fecha=hoy,
        hora_entrada=ahora,
        tipo_entrada=tipo_entrada,
        bono_puntualidad=es_puntual,
        hora_inicio_turno=hora_inicio_turno,
    )
    db.add(nuevo_registro)
    await db.commit()

    hora_str = ahora.strftime("%H:%M")

    if es_puntual:
        message = f"¡Bienvenido, {empleado.name}! 👋\nTu hora de ingreso quedó registrada a las {hora_str} hrs.\n✅ Puedes gozar de tu bono de puntualidad.\n¡Excelente turno! 💪"
    else:
        message = f"Bienvenido, {empleado.name}.\nTu hora de ingreso quedó registrada a las {hora_str} hrs.\n⚠️ Lamentablemente has perdido tu bono de puntualidad.\nTe exhortamos a ser más puntual.\n¡Excelente turno!"

    return {
        "is_first_login": True,
        "message": message,
        "hora_entrada": hora_str,
        "bono_puntualidad": es_puntual,
        "turno_asignado": "apertura",
        "posicion_asignada": None,
        "hora_inicio_turno": hora_inicio_turno.strftime("%H:%M"),
        "employee_name": empleado.name
    }


async def check_out(db: AsyncSession, employee_id: int, tipo_salida: str = "normal", observaciones: str = None) -> dict:
    """Registra la salida del empleado."""
    hoy = datetime.now(MEXICO_TZ).date()
    ahora = datetime.now(MEXICO_TZ).time()

    existing = await db.execute(
        select(models.HRAttendance).where(
            and_(
                models.HRAttendance.employee_id == employee_id,
                models.HRAttendance.fecha == hoy
            )
        )
    )
    registro = existing.scalar_one_or_none()

    if not registro:
        # No fichó entrada — crear registro solo con salida
        registro = models.HRAttendance(
            employee_id=employee_id,
            fecha=hoy,
            hora_salida=ahora,
            tipo_salida=tipo_salida,
            observaciones=observaciones,
        )
        db.add(registro)
    elif registro.hora_salida:
        raise HTTPException(status_code=400, detail="Ya registraste tu salida hoy")
    else:
        registro.hora_salida = ahora
        registro.tipo_salida = tipo_salida
        registro.observaciones = observaciones

    await db.commit()

    return {
        "message": f"Salida registrada a las {ahora.strftime('%H:%M')} hrs. ¡Buen descanso!",
        "hora_salida": ahora.strftime("%H:%M")
    }


# ---------------------------------------------------------------------------
# Empleados HR (datos extendidos)
# ---------------------------------------------------------------------------

async def listar_empleados_hr(db: AsyncSession) -> list[dict]:
    """
    Lista todos los empleados activos con sus datos HR extendidos.
    Combina employees + hr_employees_ext + hr_positions.
    """
    # Traer todos los empleados activos
    result = await db.execute(
        select(Employee).where(Employee.is_active == True)
    )
    empleados = result.scalars().all()

    respuesta = []
    for emp in empleados:
        # Buscar datos HR extendidos
        hr_result = await db.execute(
            select(models.HREmployeeExt)
            .where(models.HREmployeeExt.employee_id == emp.id)
            .options(selectinload(models.HREmployeeExt.position))
        )
        hr_ext = hr_result.scalar_one_or_none()

        position_name = None
        if hr_ext and hr_ext.position:
            position_name = hr_ext.position.nombre

        respuesta.append({
            "id": emp.id,
            "employee_number": getattr(emp, 'employee_number', None),
            "name": emp.name,
            "employee_code": emp.employee_code,
            "role": emp.role,
            "is_active": emp.is_active,
            "profile_id": emp.profile_id,
            "exclude_attendance": getattr(emp, 'exclude_attendance', False),
            "hr": _serialize_hr_ext(hr_ext) if hr_ext else None,
            "position_name": position_name,
        })

    return respuesta


async def obtener_empleado_hr(db: AsyncSession, employee_id: int) -> dict:
    """Obtiene un empleado con todos sus datos HR."""
    result = await db.execute(
        select(Employee).where(Employee.id == employee_id)
    )
    emp = result.scalar_one_or_none()
    if not emp:
        raise HTTPException(status_code=404, detail="Empleado no encontrado")

    hr_result = await db.execute(
        select(models.HREmployeeExt)
        .where(models.HREmployeeExt.employee_id == emp.id)
        .options(selectinload(models.HREmployeeExt.position))
    )
    hr_ext = hr_result.scalar_one_or_none()

    position_name = None
    if hr_ext and hr_ext.position:
        position_name = hr_ext.position.nombre

    return {
        "id": emp.id,
        "employee_number": getattr(emp, 'employee_number', None),
        "name": emp.name,
        "employee_code": emp.employee_code,
        "role": emp.role,
        "is_active": emp.is_active,
        "profile_id": emp.profile_id,
        "exclude_attendance": getattr(emp, 'exclude_attendance', False),
        "hr": _serialize_hr_ext(hr_ext) if hr_ext else None,
        "position_name": position_name,
    }


async def crear_o_actualizar_hr_ext(
    db: AsyncSession, employee_id: int, datos: schemas.HREmployeeExtCreate | schemas.HREmployeeExtUpdate
) -> models.HREmployeeExt:
    """Crea o actualiza los datos HR extendidos de un empleado."""
    # Verificar que el empleado existe
    emp_result = await db.execute(select(Employee).where(Employee.id == employee_id))
    if not emp_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Empleado no encontrado")

    # Buscar si ya existe extensión HR
    existing = await db.execute(
        select(models.HREmployeeExt).where(models.HREmployeeExt.employee_id == employee_id)
    )
    hr_ext = existing.scalar_one_or_none()

    datos_dict = datos.model_dump(exclude_unset=True)
    datos_dict.pop('employee_id', None)  # No sobreescribir el FK

    if hr_ext:
        # Actualizar
        for key, value in datos_dict.items():
            if value is not None:
                setattr(hr_ext, key, value)
    else:
        # Crear
        hr_ext = models.HREmployeeExt(employee_id=employee_id, **datos_dict)
        db.add(hr_ext)

    await db.commit()
    await db.refresh(hr_ext)
    return hr_ext


def _serialize_hr_ext(hr_ext: models.HREmployeeExt) -> dict:
    """Serialización manual para evitar MissingGreenlet."""
    if not hr_ext:
        return None
    return {
        "id": hr_ext.id,
        "employee_id": hr_ext.employee_id,
        "fecha_nacimiento": hr_ext.fecha_nacimiento.isoformat() if hr_ext.fecha_nacimiento else None,
        "direccion": hr_ext.direccion,
        "telefono": hr_ext.telefono,
        "telefono_emergencia": hr_ext.telefono_emergencia,
        "contacto_emergencia": hr_ext.contacto_emergencia,
        "tipo_sangre": hr_ext.tipo_sangre,
        "curp": hr_ext.curp,
        "nss": hr_ext.nss,
        "foto_url": hr_ext.foto_url,
        "ine_frontal_url": hr_ext.ine_frontal_url,
        "ine_trasera_url": hr_ext.ine_trasera_url,
        "selfie_url": hr_ext.selfie_url,
        "position_id": hr_ext.position_id,
        "fecha_ingreso": hr_ext.fecha_ingreso.isoformat() if hr_ext.fecha_ingreso else None,
        "fecha_fin_contrato": hr_ext.fecha_fin_contrato.isoformat() if hr_ext.fecha_fin_contrato else None,
        "semestre_actual": hr_ext.semestre_actual,
        "estado": hr_ext.estado,
        "created_at": hr_ext.created_at.isoformat() if hr_ext.created_at else None,
    }


# ---------------------------------------------------------------------------
# Puestos
# ---------------------------------------------------------------------------

async def listar_puestos(db: AsyncSession) -> list[models.HRPosition]:
    result = await db.execute(
        select(models.HRPosition).where(models.HRPosition.activo == True).order_by(models.HRPosition.orden)
    )
    return result.scalars().all()


async def crear_puesto(db: AsyncSession, datos: schemas.PositionCreate) -> models.HRPosition:
    puesto = models.HRPosition(**datos.model_dump())
    db.add(puesto)
    await db.commit()
    await db.refresh(puesto)
    return puesto


# ---------------------------------------------------------------------------
# Reglamento
# ---------------------------------------------------------------------------

async def listar_regulaciones(db: AsyncSession) -> list[models.HRRegulation]:
    result = await db.execute(
        select(models.HRRegulation).where(models.HRRegulation.activo == True).order_by(models.HRRegulation.orden)
    )
    return result.scalars().all()


async def seed_regulaciones(db: AsyncSession):
    """Siembra las 11 secciones del reglamento si no existen."""
    existing = await db.execute(select(func.count(models.HRRegulation.id)))
    count = existing.scalar()
    if count > 0:
        return  # Ya hay regulaciones, no sobreescribir

    secciones = [
        (1, "📋", "Observancia General", "El presente reglamento es de observancia general y obligatoria para todos los colaboradores de R de Rico. Su cumplimiento garantiza un ambiente de trabajo justo, ordenado y productivo."),
        (2, "🤝", "Convivencia y Liderazgo", "**Reglas de compañerismo:**\n- Se prohíbe el uso de apodos\n- Provocaciones o conatos de bronca → Acta Administrativa\n- Agresión verbal → Suspensión de 8 días sin goce de sueldo + Acta Administrativa\n- Agresión física → Baja inmediata\n\nTodos los colaboradores deben mantener un trato respetuoso y profesional."),
        (3, "👔", "Vestimenta y Uniforme", "**Uniforme obligatorio (2 juegos):**\n- Paliacate\n- Mandil\n- Camiseta\n- Pantalón\n- Calzado antiderrapante color café\n\n**Fianza:** $600 por uniforme, cubierta mediante descuento semanal.\n**Reposición:** Sin costo cuando el desgaste es por uso normal.\n**Préstamo:** Se puede prestar uniforme adicional con cargo de lavandería."),
        (4, "⏰", "Puntualidad y Asistencia", "**Bono de puntualidad:** Se otorga diariamente al llegar a tiempo. El monto aumenta con cada semestre de contrato.\n\n**Tolerancia:** 15 minutos. Si llegas dentro de la tolerancia, trabajas pero pierdes el bono del día.\n\n**Retardos:** 3 retardos acumulados = 1 falta injustificada.\n\n**Faltas:** 3 faltas injustificadas = baja laboral."),
        (5, "📝", "Permisos e Inasistencias", "**Tipos de permiso:**\n- **PSG** (Permiso Sin Goce): 3 por contrato de 6 meses. Solicitar con 6 días de anticipación.\n- **IT** (Intercambio de Turnos): 3 días de anticipación. Ambos empleados firman.\n- **CP** (Cobertura de Puestos): 3 días de anticipación.\n- **PRO** (Permiso para Retirarse de Operación): Solo emergencias.\n\n**Fondo de Cobertura:** $600 para Rs Generales. Se aplica según días de anticipación:\n- 0 días (no avisa): 100%\n- 0 días (avisa antes): 90%\n- 1 día: 80%\n- 2 días: 70%\n- 3 días: 60%\n- 4 días: 50%\n- 5+ días: 40%\n\nReposición del fondo en 3 exhibiciones semanales."),
        (6, "🕐", "Horarios y Turnos", "**Ventas — Rotación A/B/C/D:**\n- Turno Apertura: 6:00 – 14:00\n- Turno Cierre: 14:00 – 22:00\n- 20 posiciones rotativas\n- Refuerzos: 7:00–11:00 y 16:00–22:00\n- Gerencia: ALFA / BETA\n\n**Producción — Horario Fijo:**\n- Artesanos 1-6 tienen horario asignado por el gerente de producción, no rotan."),
        (7, "📅", "Juntas de Personal", "**Horarios:**\n- Junta de Producción: Lunes 13:00 – 13:30\n- Junta General: Viernes 13:45 – 14:15\n- Junta de Fin de Semana: Sábado 13:45 – 14:15\n\n**Secuencia de 6 pasos:**\n1. Pase de lista\n2. Temas operativos\n3. Reconocimientos\n4. Áreas de oportunidad\n5. Preguntas abiertas\n6. Cierre motivacional\n\n**Cumpleaños:** La última junta del mes se destina a festejar cumpleaños. La empresa pone el pastel. 🎂"),
        (8, "📱", "Uso de Celular", "**Prohibido** el uso de celular y cualquier dispositivo de fotografía o videograbación durante el turno de trabajo.\n\nPara emergencias, los familiares pueden comunicarse al **ricofón: 7225 41 05 53**."),
        (9, "🚫", "Sustancias Prohibidas", "Queda estrictamente prohibido ingresar al trabajo bajo el efecto del alcohol, drogas o cualquier sustancia que altere el estado de consciencia.\n\n**Sanción:** Suspensión de 8 días sin goce de sueldo + Acta Administrativa.\n\nEn caso de reincidencia → Baja laboral."),
        (10, "🔒", "Hurto", "El robo de productos, materias primas, equipos u objetos ajenos ocasiona **baja inmediata** y se procede a **denuncia penal**.\n\nNo hay tolerancia ni escalamiento para este tipo de falta."),
        (11, "⚠️", "Normas Generales", "**Prohibido:**\n🚫 Ingresar celular y dispositivos de foto/video\n🚫 Ingresar con resaca, alcohol o drogas\n🚫 Usar perfumes o lociones\n🚫 Usar alhajas ni relojes\n🚫 Usar maquillaje\n🚫 Hacer señas obscenas ni decir groserías\n🚫 Robar productos, materias primas, equipos\n🚫 Provocar ni pelear\n\n**Obligatorio:**\n✅ Ser puntual\n✅ Mantener actitud positiva\n✅ Presentarse aseado con desodorante no aromático\n✅ Portar uniforme limpio, planchado y completo\n✅ Uñas cortas sin esmaltes o barnices\n✅ Cabello corto o recogido\n✅ Guardar mochila y pertenencias en el locker\n✅ Respeto"),
    ]

    for num, icono, titulo, contenido in secciones:
        reg = models.HRRegulation(
            seccion_numero=num,
            titulo=titulo,
            contenido=contenido,
            icono=icono,
            orden=num,
        )
        db.add(reg)

    await db.commit()
    print("  ✅ Reglamento HR sembrado (11 secciones).")


# ---------------------------------------------------------------------------
# Asistencia (historial)
# ---------------------------------------------------------------------------

async def obtener_asistencia_empleado(
    db: AsyncSession, employee_id: int, mes: int = None, año: int = None
) -> list[models.HRAttendance]:
    """Obtiene el historial de asistencia de un empleado, opcionalmente filtrado por mes/año."""
    query = select(models.HRAttendance).where(
        models.HRAttendance.employee_id == employee_id
    )

    if mes and año:
        query = query.where(
            extract('month', models.HRAttendance.fecha) == mes,
            extract('year', models.HRAttendance.fecha) == año,
        )

    query = query.order_by(models.HRAttendance.fecha.desc())
    result = await db.execute(query)
    return result.scalars().all()


# ---------------------------------------------------------------------------
# Cumpleaños del mes
# ---------------------------------------------------------------------------

async def obtener_cumpleaños_mes(db: AsyncSession, mes: int = None) -> list[dict]:
    """Obtiene los empleados que cumplen años en el mes indicado (o el mes actual)."""
    if mes is None:
        mes = date.today().month

    # Buscar extensiones HR con fecha de nacimiento en el mes indicado
    result = await db.execute(
        select(models.HREmployeeExt, Employee)
        .join(Employee, models.HREmployeeExt.employee_id == Employee.id)
        .where(
            Employee.is_active == True,
            extract('month', models.HREmployeeExt.fecha_nacimiento) == mes
        )
        .order_by(extract('day', models.HREmployeeExt.fecha_nacimiento))
    )

    cumpleaños = []
    hoy = datetime.now(MEXICO_TZ).date()
    for hr_ext, emp in result.all():
        if hr_ext.fecha_nacimiento:
            edad = hoy.year - hr_ext.fecha_nacimiento.year
            if (hoy.month, hoy.day) < (hr_ext.fecha_nacimiento.month, hr_ext.fecha_nacimiento.day):
                edad -= 1
            cumpleaños.append({
                "employee_id": emp.id,
                "employee_number": getattr(emp, 'employee_number', None),
                "name": emp.name,
                "fecha_nacimiento": hr_ext.fecha_nacimiento.isoformat(),
                "dia": hr_ext.fecha_nacimiento.day,
                "edad": edad,
            })

    return cumpleaños


# ---------------------------------------------------------------------------
# Seed de puestos base
# ---------------------------------------------------------------------------

async def seed_puestos_base(db: AsyncSession):
    """Siembra puestos base si no existen."""
    existing = await db.execute(select(func.count(models.HRPosition.id)))
    count = existing.scalar()
    if count > 0:
        return

    puestos = [
        ("Aspirante a Prueba", "ventas", 1),
        ("Ayudante General Entrenamiento", "ventas", 2),
        ("Ayudante General Nivel 1", "ventas", 3),
        ("Ayudante General Nivel 2", "ventas", 4),
        ("Ayudante General Nivel 3", "ventas", 5),
        ("Ayudante General Nivel 4", "ventas", 6),
        ("Ayudante General Nivel 5", "ventas", 7),
        ("Ayudante General Nivel 6", "ventas", 8),
        ("Refuerzo de Ventas", "ventas", 9),
        ("Cajero", "ventas", 10),
        ("Gerente de Ventas", "administracion", 11),
        ("Gerente de Producción", "administracion", 12),
        ("Artesano Entrenamiento", "produccion", 13),
        ("Artesano Nivel 1", "produccion", 14),
        ("Artesano Nivel 2", "produccion", 15),
        ("Artesano Nivel 3", "produccion", 16),
        ("Artesano Nivel 4", "produccion", 17),
        ("Artesano Nivel 5", "produccion", 18),
        ("Artesano Nivel 6", "produccion", 19),
        ("Repartidor", "ventas", 20),
    ]

    for nombre, area, orden in puestos:
        puesto = models.HRPosition(nombre=nombre, area=area, orden=orden)
        db.add(puesto)

    await db.commit()
    print("  ✅ Puestos HR base sembrados (20 puestos).")


# ===========================================================================
# FASE 2 — Lógica operativa
# ===========================================================================

# --- Tabla de % del fondo según días de anticipación ---
TABLA_PORCENTAJE_FONDO = {
    -1: 1.00,   # No avisó
    0:  0.90,   # Avisó el mismo día
    1:  0.80,
    2:  0.70,
    3:  0.60,
    4:  0.50,
    5:  0.40,   # 5+ días
}

# --- Motivos que saltan directo a acta ---
MOTIVOS_ACTA_DIRECTA = ["alcohol", "drogas", "agresion_verbal", "provocacion", "sustancias"]
MOTIVOS_BAJA_DIRECTA = ["hurto", "robo", "agresion_fisica"]


# ---------------------------------------------------------------------------
# Incidencias
# ---------------------------------------------------------------------------

async def listar_incidencias(db: AsyncSession, employee_id: int) -> list[dict]:
    result = await db.execute(
        select(models.HRIncident)
        .where(models.HRIncident.employee_id == employee_id)
        .order_by(models.HRIncident.fecha.desc())
    )
    return [_serialize_incident(i) for i in result.scalars().all()]


async def resumen_incidencias(db: AsyncSession, employee_id: int) -> dict:
    """Conteo de llamadas, actas y estado actual en el contrato vigente."""
    result = await db.execute(
        select(models.HRIncident)
        .where(models.HRIncident.employee_id == employee_id)
    )
    incidents = result.scalars().all()

    llamadas = sum(1 for i in incidents if i.tipo == "llamada_atencion")
    actas = sum(1 for i in incidents if i.tipo == "acta_administrativa")
    bajas = sum(1 for i in incidents if i.tipo == "baja")

    return {
        "employee_id": employee_id,
        "llamadas_atencion": llamadas,
        "actas_administrativas": actas,
        "bajas": bajas,
        "total": len(incidents),
        "alerta": "BAJA PENDIENTE" if actas >= 3 else ("ACTA PENDIENTE" if llamadas >= 3 else None),
    }


async def crear_incidencia(db: AsyncSession, datos: dict) -> dict:
    """Crea incidencia con escalamiento automático."""
    employee_id = datos["employee_id"]
    motivo = datos.get("motivo", "")
    tipo = datos.get("tipo", "llamada_atencion")

    # --- Escalamiento por motivo directo ---
    motivo_lower = motivo.lower()
    if any(m in motivo_lower for m in MOTIVOS_BAJA_DIRECTA):
        tipo = "baja"
    elif any(m in motivo_lower for m in MOTIVOS_ACTA_DIRECTA):
        tipo = "acta_administrativa"

    incidencia = models.HRIncident(
        employee_id=employee_id,
        fecha=date.today(),
        tipo=tipo,
        motivo=motivo,
        descripcion=datos.get("descripcion"),
        contrato_periodo=datos.get("contrato_periodo"),
        firmado_por=datos.get("firmado_por"),
        dias_suspension=datos.get("dias_suspension", 0),
        auto_generada=False,
    )
    db.add(incidencia)
    await db.commit()

    # --- Escalamiento automático por acumulación ---
    resumen = await resumen_incidencias(db, employee_id)
    auto_incidents = []

    if tipo == "llamada_atencion" and resumen["llamadas_atencion"] >= 3 and resumen["actas_administrativas"] == 0:
        # 3 llamadas → genera acta automática
        acta_auto = models.HRIncident(
            employee_id=employee_id,
            fecha=date.today(),
            tipo="acta_administrativa",
            motivo=f"Escalamiento automático: {resumen['llamadas_atencion']} llamadas de atención acumuladas",
            auto_generada=True,
            dias_suspension=8,
            fecha_reincorporacion=date.today() + timedelta(days=8),
        )
        db.add(acta_auto)
        auto_incidents.append("acta_administrativa")

    if tipo == "acta_administrativa" and resumen["actas_administrativas"] >= 3:
        # 3 actas → proceso de baja
        baja_auto = models.HRIncident(
            employee_id=employee_id,
            fecha=date.today(),
            tipo="baja",
            motivo=f"Escalamiento automático: {resumen['actas_administrativas']} actas administrativas acumuladas",
            auto_generada=True,
        )
        db.add(baja_auto)
        auto_incidents.append("baja")

    if auto_incidents:
        await db.commit()

    return {
        "message": "Incidencia registrada",
        "tipo": tipo,
        "escalamiento_auto": auto_incidents if auto_incidents else None,
        "resumen": await resumen_incidencias(db, employee_id),
    }


def _serialize_incident(i):
    return {
        "id": i.id, "employee_id": i.employee_id,
        "fecha": i.fecha.isoformat(), "tipo": i.tipo,
        "motivo": i.motivo, "descripcion": i.descripcion,
        "contrato_periodo": i.contrato_periodo,
        "firmado_por": i.firmado_por, "firma_empleado": i.firma_empleado,
        "dias_suspension": i.dias_suspension,
        "fecha_reincorporacion": i.fecha_reincorporacion.isoformat() if i.fecha_reincorporacion else None,
        "auto_generada": i.auto_generada,
    }


# ---------------------------------------------------------------------------
# Fianza de Uniforme
# ---------------------------------------------------------------------------

async def obtener_uniformes(db: AsyncSession, employee_id: int) -> dict:
    result = await db.execute(
        select(models.HRUniformDeposit).where(models.HRUniformDeposit.employee_id == employee_id)
    )
    deposits = result.scalars().all()

    items = []
    for d in deposits:
        mov_result = await db.execute(
            select(models.HRUniformMovement).where(models.HRUniformMovement.deposit_id == d.id).order_by(models.HRUniformMovement.fecha.desc())
        )
        movs = mov_result.scalars().all()
        items.append({
            "id": d.id, "uniforme_numero": d.uniforme_numero,
            "fianza_total": d.fianza_total, "pagado": d.pagado,
            "estado": d.estado, "fecha_entrega": d.fecha_entrega.isoformat() if d.fecha_entrega else None,
            "pendiente": d.fianza_total - d.pagado,
            "movimientos": [{"id": m.id, "fecha": m.fecha.isoformat(), "concepto": m.concepto, "monto": m.monto, "tipo": m.tipo} for m in movs],
        })

    total_pendiente = sum(d.fianza_total - d.pagado for d in deposits if d.estado == "pendiente")
    return {"employee_id": employee_id, "uniformes": items, "total_pendiente": total_pendiente}


async def crear_uniforme(db: AsyncSession, datos: dict) -> dict:
    dep = models.HRUniformDeposit(
        employee_id=datos["employee_id"],
        uniforme_numero=datos.get("uniforme_numero", 1),
        fianza_total=datos.get("fianza_total", 600.0),
        fecha_entrega=date.today(),
    )
    db.add(dep)
    await db.commit()
    return {"message": "Fianza de uniforme creada", "id": dep.id}


async def agregar_movimiento_uniforme(db: AsyncSession, deposit_id: int, datos: dict) -> dict:
    result = await db.execute(select(models.HRUniformDeposit).where(models.HRUniformDeposit.id == deposit_id))
    dep = result.scalar_one_or_none()
    if not dep:
        raise HTTPException(status_code=404, detail="Depósito no encontrado")

    mov = models.HRUniformMovement(
        deposit_id=deposit_id,
        fecha=date.today(),
        concepto=datos.get("concepto", "Descuento semanal"),
        monto=datos["monto"],
        tipo=datos.get("tipo", "abono"),
    )
    db.add(mov)

    if datos.get("tipo", "abono") == "abono":
        dep.pagado = (dep.pagado or 0) + datos["monto"]
        if dep.pagado >= dep.fianza_total:
            dep.estado = "cubierto"

    await db.commit()
    return {"message": "Movimiento registrado", "pagado": dep.pagado, "estado": dep.estado}


# ---------------------------------------------------------------------------
# Fondo de Cobertura
# ---------------------------------------------------------------------------

async def obtener_fondo_cobertura(db: AsyncSession, employee_id: int) -> dict:
    result = await db.execute(
        select(models.HRCoverageFund).where(models.HRCoverageFund.employee_id == employee_id)
    )
    fund = result.scalar_one_or_none()
    if not fund:
        return {"employee_id": employee_id, "fondo": None, "movimientos": []}

    mov_result = await db.execute(
        select(models.HRCoverageMovement).where(models.HRCoverageMovement.fund_id == fund.id).order_by(models.HRCoverageMovement.fecha.desc())
    )
    movs = mov_result.scalars().all()

    return {
        "employee_id": employee_id,
        "fondo": {
            "id": fund.id, "monto_requerido": fund.monto_requerido,
            "monto_cubierto": fund.monto_cubierto, "estado": fund.estado,
            "pendiente": fund.monto_requerido - fund.monto_cubierto,
        },
        "movimientos": [{"id": m.id, "fecha": m.fecha.isoformat(), "concepto": m.concepto, "monto": m.monto, "tipo": m.tipo, "porcentaje": m.porcentaje_aplicado, "dias_anticipacion": m.dias_anticipacion} for m in movs],
    }


async def crear_fondo_cobertura(db: AsyncSession, datos: dict) -> dict:
    fund = models.HRCoverageFund(
        employee_id=datos["employee_id"],
        monto_requerido=datos.get("monto_requerido", 600.0),
    )
    db.add(fund)
    await db.commit()
    return {"message": "Fondo de cobertura creado", "id": fund.id}


async def agregar_movimiento_fondo(db: AsyncSession, fund_id: int, datos: dict) -> dict:
    result = await db.execute(select(models.HRCoverageFund).where(models.HRCoverageFund.id == fund_id))
    fund = result.scalar_one_or_none()
    if not fund:
        raise HTTPException(status_code=404, detail="Fondo no encontrado")

    dias_ant = datos.get("dias_anticipacion")
    porcentaje = None
    if dias_ant is not None:
        # Calcular % según tabla de anticipación
        if dias_ant >= 5:
            porcentaje = 0.40
        else:
            porcentaje = TABLA_PORCENTAJE_FONDO.get(dias_ant, 0.40)

    mov = models.HRCoverageMovement(
        fund_id=fund_id,
        fecha=date.today(),
        concepto=datos.get("concepto", "Aportación"),
        monto=datos["monto"],
        tipo=datos.get("tipo", "abono"),
        porcentaje_aplicado=porcentaje,
        dias_anticipacion=dias_ant,
    )
    db.add(mov)

    if datos.get("tipo", "abono") == "abono":
        fund.monto_cubierto = (fund.monto_cubierto or 0) + datos["monto"]
        if fund.monto_cubierto >= fund.monto_requerido:
            fund.estado = "cubierto"
    elif datos.get("tipo") == "cargo":
        fund.monto_cubierto = max(0, (fund.monto_cubierto or 0) - datos["monto"])
        fund.estado = "pendiente"

    await db.commit()
    return {"message": "Movimiento registrado", "cubierto": fund.monto_cubierto, "estado": fund.estado}


# ---------------------------------------------------------------------------
# Tabla Salarial
# ---------------------------------------------------------------------------

async def listar_tablas_salariales(db: AsyncSession) -> list[dict]:
    result = await db.execute(
        select(models.HRSalaryTable).order_by(models.HRSalaryTable.position_id, models.HRSalaryTable.semestre)
    )
    tables = result.scalars().all()
    return [{
        "id": t.id, "position_id": t.position_id, "semestre": t.semestre,
        "sueldo_hora": t.sueldo_hora, "bono_hora": t.bono_hora,
        "sueldo_dia": t.sueldo_dia, "bono_dia": t.bono_dia,
    } for t in tables]


async def guardar_tabla_salarial(db: AsyncSession, datos: dict) -> dict:
    """Crea o actualiza una entrada de tabla salarial."""
    pos_id = datos["position_id"]
    sem = datos["semestre"]

    result = await db.execute(
        select(models.HRSalaryTable).where(
            models.HRSalaryTable.position_id == pos_id,
            models.HRSalaryTable.semestre == sem
        )
    )
    existing = result.scalar_one_or_none()

    sueldo_hora = datos["sueldo_hora"]
    bono_hora = datos["bono_hora"]
    sueldo_dia = sueldo_hora * 8
    bono_dia = bono_hora * 8

    if existing:
        existing.sueldo_hora = sueldo_hora
        existing.bono_hora = bono_hora
        existing.sueldo_dia = sueldo_dia
        existing.bono_dia = bono_dia
    else:
        entry = models.HRSalaryTable(
            position_id=pos_id, semestre=sem,
            sueldo_hora=sueldo_hora, bono_hora=bono_hora,
            sueldo_dia=sueldo_dia, bono_dia=bono_dia,
        )
        db.add(entry)

    await db.commit()
    return {"message": "Tabla salarial actualizada", "sueldo_dia": sueldo_dia, "bono_dia": bono_dia}


# ---------------------------------------------------------------------------
# Nómina
# ---------------------------------------------------------------------------

async def obtener_nomina(db: AsyncSession, employee_id: int, semana: int = None, año: int = None) -> list[dict]:
    query = select(models.HRPayroll).where(models.HRPayroll.employee_id == employee_id)
    if semana:
        query = query.where(models.HRPayroll.semana == semana)
    if año:
        query = query.where(models.HRPayroll.año == año)
    query = query.order_by(models.HRPayroll.año.desc(), models.HRPayroll.semana.desc())

    result = await db.execute(query)
    return [_serialize_payroll(p) for p in result.scalars().all()]


async def calcular_nomina(db: AsyncSession, employee_id: int, semana: int, año: int) -> dict:
    """Calcula la nómina semanal basándose en asistencia y deducciones."""
    from datetime import date as dateclass
    import datetime as dt

    # Obtener datos del empleado y su semestre
    hr_result = await db.execute(
        select(models.HREmployeeExt).where(models.HREmployeeExt.employee_id == employee_id)
    )
    hr_ext = hr_result.scalar_one_or_none()
    semestre = hr_ext.semestre_actual if hr_ext else 1
    position_id = hr_ext.position_id if hr_ext else None

    # Buscar tabla salarial
    sueldo_dia = 190.0  # Default RsG
    bono_dia = 50.0     # Default Sem 1

    if position_id:
        sal_result = await db.execute(
            select(models.HRSalaryTable).where(
                models.HRSalaryTable.position_id == position_id,
                models.HRSalaryTable.semestre == semestre
            )
        )
        sal = sal_result.scalar_one_or_none()
        if sal:
            sueldo_dia = sal.sueldo_dia
            bono_dia = sal.bono_dia

    # Contar asistencia de la semana
    # Calcular rango de fechas de la semana ISO
    jan1 = dateclass(año, 1, 1)
    delta = dt.timedelta(days=(semana - 1) * 7 - jan1.weekday())
    lunes = jan1 + delta
    domingo = lunes + dt.timedelta(days=6)

    att_result = await db.execute(
        select(models.HRAttendance).where(
            models.HRAttendance.employee_id == employee_id,
            models.HRAttendance.fecha >= lunes,
            models.HRAttendance.fecha <= domingo,
        )
    )
    attendances = att_result.scalars().all()

    dias_trabajados = len(attendances)
    dias_puntuales = sum(1 for a in attendances if a.bono_puntualidad)
    dias_retardo = sum(1 for a in attendances if a.tipo_entrada == "retardo")

    # Calcular percepciones
    salario_base = dias_trabajados * sueldo_dia
    bono_puntualidad = dias_puntuales * bono_dia
    total_percepciones = salario_base + bono_puntualidad

    # Obtener deducciones pendientes (uniforme + fondo)
    deduccion_uniforme = 0.0
    uni_result = await db.execute(
        select(models.HRUniformDeposit).where(
            models.HRUniformDeposit.employee_id == employee_id,
            models.HRUniformDeposit.estado == "pendiente"
        )
    )
    for dep in uni_result.scalars().all():
        pendiente = dep.fianza_total - dep.pagado
        semanal = min(pendiente, 100.0)  # $100/semana default
        deduccion_uniforme += semanal

    deduccion_fondo = 0.0
    fondo_result = await db.execute(
        select(models.HRCoverageFund).where(
            models.HRCoverageFund.employee_id == employee_id,
            models.HRCoverageFund.estado == "pendiente"
        )
    )
    for fund in fondo_result.scalars().all():
        pendiente = fund.monto_requerido - fund.monto_cubierto
        semanal = min(pendiente, 200.0)  # Reposición en 3 exhibiciones ($600/3=$200)
        deduccion_fondo += semanal

    total_deducciones = deduccion_uniforme + deduccion_fondo
    neto = total_percepciones - total_deducciones

    # Crear o actualizar registro de nómina
    existing = await db.execute(
        select(models.HRPayroll).where(
            models.HRPayroll.employee_id == employee_id,
            models.HRPayroll.semana == semana,
            models.HRPayroll.año == año,
        )
    )
    payroll = existing.scalar_one_or_none()

    if payroll:
        payroll.dias_trabajados = dias_trabajados
        payroll.dias_puntuales = dias_puntuales
        payroll.dias_retardo = dias_retardo
        payroll.salario_base = salario_base
        payroll.bono_puntualidad = bono_puntualidad
        payroll.total_percepciones = total_percepciones
        payroll.deduccion_uniforme = deduccion_uniforme
        payroll.deduccion_fondo = deduccion_fondo
        payroll.total_deducciones = total_deducciones
        payroll.neto = neto
    else:
        payroll = models.HRPayroll(
            employee_id=employee_id, semana=semana, año=año,
            dias_trabajados=dias_trabajados, dias_puntuales=dias_puntuales,
            dias_retardo=dias_retardo,
            salario_base=salario_base, bono_puntualidad=bono_puntualidad,
            total_percepciones=total_percepciones,
            deduccion_uniforme=deduccion_uniforme, deduccion_fondo=deduccion_fondo,
            total_deducciones=total_deducciones, neto=neto,
        )
        db.add(payroll)

    await db.commit()
    return _serialize_payroll(payroll)


def _serialize_payroll(p) -> dict:
    return {
        "id": p.id, "employee_id": p.employee_id,
        "semana": p.semana, "año": p.año,
        "dias_trabajados": p.dias_trabajados,
        "dias_puntuales": p.dias_puntuales,
        "dias_retardo": p.dias_retardo,
        "dias_falta": p.dias_falta,
        "dias_suspension": p.dias_suspension,
        "dias_psg": p.dias_psg,
        "salario_base": p.salario_base,
        "bono_puntualidad": p.bono_puntualidad,
        "total_percepciones": p.total_percepciones,
        "deduccion_uniforme": p.deduccion_uniforme,
        "deduccion_fondo": p.deduccion_fondo,
        "deduccion_otros": p.deduccion_otros,
        "total_deducciones": p.total_deducciones,
        "neto": p.neto,
        "aprobado": p.aprobado,
    }


# ---------------------------------------------------------------------------
# PSGs (Permisos Sin Goce)
# ---------------------------------------------------------------------------

async def listar_psgs(db: AsyncSession, employee_id: int) -> list[dict]:
    result = await db.execute(
        select(models.HRPSG)
        .where(models.HRPSG.employee_id == employee_id)
        .order_by(models.HRPSG.fecha_permiso.desc())
    )
    return [{
        "id": p.id, "employee_id": p.employee_id,
        "fecha_solicitado": p.fecha_solicitado.isoformat(),
        "fecha_permiso": p.fecha_permiso.isoformat(),
        "dias_anticipacion": p.dias_anticipacion,
        "aprobado": p.aprobado,
        "uso_fondo": p.uso_fondo,
        "porcentaje_fondo": p.porcentaje_fondo,
        "monto_fondo": p.monto_fondo,
        "observaciones": p.observaciones,
    } for p in result.scalars().all()]


async def crear_psg(db: AsyncSession, datos: dict) -> dict:
    fecha_sol = date.fromisoformat(datos["fecha_solicitado"]) if isinstance(datos.get("fecha_solicitado"), str) else date.today()
    fecha_perm = date.fromisoformat(datos["fecha_permiso"])
    dias_ant = (fecha_perm - fecha_sol).days

    # Verificar máximo por contrato (3)
    count_result = await db.execute(
        select(func.count(models.HRPSG.id)).where(
            models.HRPSG.employee_id == datos["employee_id"],
            models.HRPSG.contrato_periodo == datos.get("contrato_periodo"),
        )
    )
    count = count_result.scalar()
    if count >= 3:
        raise HTTPException(status_code=400, detail="Máximo 3 PSGs por contrato ya alcanzado")

    # Calcular si aplica fondo
    uso_fondo = datos.get("uso_fondo", False)
    porcentaje_fondo = 0.0
    monto_fondo = 0.0

    if uso_fondo and dias_ant is not None:
        if dias_ant >= 5:
            porcentaje_fondo = 0.40
        else:
            porcentaje_fondo = TABLA_PORCENTAJE_FONDO.get(max(dias_ant, -1), 0.40)
        monto_fondo = 600.0 * porcentaje_fondo  # Aplica sobre el total del fondo

    psg = models.HRPSG(
        employee_id=datos["employee_id"],
        fecha_solicitado=fecha_sol,
        fecha_permiso=fecha_perm,
        dias_anticipacion=dias_ant,
        uso_fondo=uso_fondo,
        porcentaje_fondo=porcentaje_fondo,
        monto_fondo=monto_fondo,
        contrato_periodo=datos.get("contrato_periodo"),
        observaciones=datos.get("observaciones"),
    )
    db.add(psg)
    await db.commit()

    return {
        "message": "PSG registrado",
        "id": psg.id,
        "dias_anticipacion": dias_ant,
        "porcentaje_fondo": porcentaje_fondo,
        "monto_fondo": monto_fondo,
        "psgs_usados": count + 1,
        "psgs_restantes": 2 - count,  # 3 max - (count+1) = 2-count
    }


# ---------------------------------------------------------------------------
# Configuración genérica (todas las suites)
# ---------------------------------------------------------------------------

CONFIG_MODELS = {
    "incidents": models.HRIncidentConfig,
    "uniform": models.HRUniformConfig,
    "coverage": models.HRCoverageConfig,
    "payroll": models.HRPayrollConfig,
    "psg": models.HRPSGConfig,
    "vacations": models.HRVacationConfig,
    "psychometrics": models.HRPsychometricConfig,
    "kpis": models.HRKpiConfig,
    "exit_survey": models.HRExitSurveyConfig,
    "severance": models.HRSeveranceConfig,
}


async def obtener_config(db: AsyncSession, config_type: str) -> list[dict]:
    model = CONFIG_MODELS.get(config_type)
    if not model:
        raise HTTPException(status_code=400, detail=f"Tipo de config no válido: {config_type}")

    result = await db.execute(select(model))
    return [{"id": c.id, "parametro": c.parametro, "valor": c.valor_json} for c in result.scalars().all()]


async def guardar_config(db: AsyncSession, config_type: str, datos: dict) -> dict:
    model = CONFIG_MODELS.get(config_type)
    if not model:
        raise HTTPException(status_code=400, detail=f"Tipo de config no válido: {config_type}")

    parametro = datos["parametro"]
    valor = datos["valor"]

    result = await db.execute(select(model).where(model.parametro == parametro))
    existing = result.scalar_one_or_none()

    if existing:
        existing.valor_json = valor
    else:
        new_config = model(parametro=parametro, valor_json=valor)
        db.add(new_config)

    await db.commit()
    return {"message": f"Config {config_type}.{parametro} guardada"}


# ===========================================================================
# FASE 3 — Evaluación y cierre
# ===========================================================================

# ---------------------------------------------------------------------------
# Vacaciones
# ---------------------------------------------------------------------------

async def listar_vacaciones(db: AsyncSession, employee_id: int) -> list[dict]:
    result = await db.execute(
        select(models.HRVacation).where(models.HRVacation.employee_id == employee_id)
        .order_by(models.HRVacation.fecha_inicio.desc())
    )
    return [{
        "id": v.id, "employee_id": v.employee_id,
        "fecha_inicio": v.fecha_inicio.isoformat(), "fecha_fin": v.fecha_fin.isoformat(),
        "dias": v.dias, "prima_vacacional": v.prima_vacacional,
        "estado": v.estado, "observaciones": v.observaciones,
    } for v in result.scalars().all()]


async def crear_vacacion(db: AsyncSession, datos: dict) -> dict:
    fecha_ini = date.fromisoformat(datos["fecha_inicio"])
    fecha_fin = date.fromisoformat(datos["fecha_fin"])
    dias = (fecha_fin - fecha_ini).days + 1

    vac = models.HRVacation(
        employee_id=datos["employee_id"],
        fecha_inicio=fecha_ini, fecha_fin=fecha_fin,
        dias=dias,
        prima_vacacional=datos.get("prima_vacacional", 0.0),
        observaciones=datos.get("observaciones"),
    )
    db.add(vac)
    await db.commit()
    return {"message": "Vacaciones registradas", "id": vac.id, "dias": dias}


# ---------------------------------------------------------------------------
# Psicométricos
# ---------------------------------------------------------------------------

async def listar_psicometricos(db: AsyncSession, employee_id: int) -> list[dict]:
    result = await db.execute(
        select(models.HRPsychometric).where(models.HRPsychometric.employee_id == employee_id)
        .order_by(models.HRPsychometric.fecha.desc())
    )
    return [{
        "id": p.id, "employee_id": p.employee_id, "fecha": p.fecha.isoformat(),
        "test_tipo": p.test_tipo, "resultados": p.resultados_json,
        "recomendacion": p.recomendacion, "evaluador": p.evaluador,
    } for p in result.scalars().all()]


async def crear_psicometrico(db: AsyncSession, datos: dict) -> dict:
    psych = models.HRPsychometric(
        employee_id=datos["employee_id"],
        fecha=date.today(),
        test_tipo=datos["test_tipo"],
        resultados_json=datos.get("resultados", {}),
        recomendacion=datos.get("recomendacion"),
        evaluador=datos.get("evaluador"),
    )
    db.add(psych)
    await db.commit()
    return {"message": f"Test {datos['test_tipo']} registrado", "id": psych.id}


# ---------------------------------------------------------------------------
# KPIs
# ---------------------------------------------------------------------------

async def listar_kpis(db: AsyncSession, employee_id: int) -> list[dict]:
    result = await db.execute(
        select(models.HRKpi).where(models.HRKpi.employee_id == employee_id)
        .order_by(models.HRKpi.año.desc(), models.HRKpi.mes.desc())
    )
    return [{
        "id": k.id, "employee_id": k.employee_id,
        "mes": k.mes, "año": k.año,
        "score_total": k.score_total, "detalle": k.detalle_json,
    } for k in result.scalars().all()]


async def crear_kpi(db: AsyncSession, datos: dict) -> dict:
    detalle = datos.get("detalle", {})
    # Calcular score total como promedio de rubros
    scores = [v for v in detalle.values() if isinstance(v, (int, float))]
    score_total = sum(scores) / len(scores) if scores else 0

    kpi = models.HRKpi(
        employee_id=datos["employee_id"],
        mes=datos["mes"], año=datos["año"],
        score_total=round(score_total, 2),
        detalle_json=detalle,
        evaluado_por=datos.get("evaluado_por"),
    )
    db.add(kpi)
    await db.commit()
    return {"message": "KPI registrado", "id": kpi.id, "score_total": score_total}


# ---------------------------------------------------------------------------
# Encuesta de Salida
# ---------------------------------------------------------------------------

async def obtener_encuesta_salida(db: AsyncSession, employee_id: int) -> dict:
    result = await db.execute(
        select(models.HRExitSurvey).where(models.HRExitSurvey.employee_id == employee_id)
    )
    survey = result.scalar_one_or_none()
    if not survey:
        return {"employee_id": employee_id, "encuesta": None}
    return {
        "employee_id": employee_id,
        "encuesta": {
            "id": survey.id, "fecha": survey.fecha.isoformat(),
            "motivo_salida": survey.motivo_salida,
            "respuestas": survey.respuestas_json,
            "observaciones": survey.observaciones,
        }
    }


async def crear_encuesta_salida(db: AsyncSession, datos: dict) -> dict:
    survey = models.HRExitSurvey(
        employee_id=datos["employee_id"],
        fecha=date.today(),
        motivo_salida=datos.get("motivo_salida", "renuncia"),
        respuestas_json=datos.get("respuestas", {}),
        observaciones=datos.get("observaciones"),
    )
    db.add(survey)
    await db.commit()
    return {"message": "Encuesta de salida registrada", "id": survey.id}


# ---------------------------------------------------------------------------
# Finiquito
# ---------------------------------------------------------------------------

async def obtener_finiquito(db: AsyncSession, employee_id: int) -> dict:
    result = await db.execute(
        select(models.HRSeverance).where(models.HRSeverance.employee_id == employee_id)
    )
    sev = result.scalar_one_or_none()
    if not sev:
        return {"employee_id": employee_id, "finiquito": None}
    return {
        "employee_id": employee_id,
        "finiquito": {
            "id": sev.id, "fecha_calculo": sev.fecha_calculo.isoformat(),
            "motivo_salida": sev.motivo_salida,
            "percepciones": sev.percepciones_json,
            "deducciones": sev.deducciones_json,
            "neto": sev.neto, "aprobado": sev.aprobado, "firmado": sev.firmado,
        }
    }


async def calcular_finiquito(db: AsyncSession, datos: dict) -> dict:
    """Calcula finiquito completo considerando todo el historial del empleado."""
    employee_id = datos["employee_id"]
    motivo = datos.get("motivo_salida", "renuncia")

    # Obtener datos del empleado
    hr_result = await db.execute(
        select(models.HREmployeeExt).where(models.HREmployeeExt.employee_id == employee_id)
    )
    hr_ext = hr_result.scalar_one_or_none()

    fecha_ingreso = hr_ext.fecha_ingreso if hr_ext and hr_ext.fecha_ingreso else date.today()
    dias_trabajados = (date.today() - fecha_ingreso).days
    años_servicio = dias_trabajados / 365.25

    # Sueldo diario (buscar en tabla salarial o usar default)
    sueldo_dia = 190.0
    if hr_ext and hr_ext.position_id:
        sal_result = await db.execute(
            select(models.HRSalaryTable).where(
                models.HRSalaryTable.position_id == hr_ext.position_id,
                models.HRSalaryTable.semestre == (hr_ext.semestre_actual or 1)
            )
        )
        sal = sal_result.scalar_one_or_none()
        if sal:
            sueldo_dia = sal.sueldo_dia

    # === PERCEPCIONES ===
    # 1. Días trabajados no pagados (proporcional de la semana en curso)
    dias_sem_actual = dias_trabajados % 7
    salario_proporcional = dias_sem_actual * sueldo_dia

    # 2. Aguinaldo proporcional (15 días / 365 * días trabajados en el año)
    dias_año = (date.today() - date(date.today().year, 1, 1)).days
    aguinaldo_prop = (15.0 / 365.0) * dias_año * sueldo_dia

    # 3. Vacaciones proporcionales
    # LFT: 12 días primer año, +2 por año hasta 5° año
    dias_vac_anuales = min(12 + (int(años_servicio) * 2), 20)
    vac_proporcional = (dias_vac_anuales / 365.0) * dias_trabajados * sueldo_dia

    # 4. Prima vacacional (25% de vacaciones)
    prima_vac = vac_proporcional * 0.25

    percepciones = {
        "salario_proporcional": round(salario_proporcional, 2),
        "aguinaldo_proporcional": round(aguinaldo_prop, 2),
        "vacaciones_proporcionales": round(vac_proporcional, 2),
        "prima_vacacional": round(prima_vac, 2),
    }
    total_percepciones = sum(percepciones.values())

    # === DEDUCCIONES ===
    deducciones = {}

    # Fianza de uniforme pendiente
    uni_result = await db.execute(
        select(models.HRUniformDeposit).where(
            models.HRUniformDeposit.employee_id == employee_id,
            models.HRUniformDeposit.estado == "pendiente"
        )
    )
    for dep in uni_result.scalars().all():
        pendiente = dep.fianza_total - dep.pagado
        if pendiente > 0:
            deducciones[f"uniforme_{dep.uniforme_numero}"] = round(pendiente, 2)

    # Fondo de cobertura pendiente
    fondo_result = await db.execute(
        select(models.HRCoverageFund).where(
            models.HRCoverageFund.employee_id == employee_id,
            models.HRCoverageFund.estado == "pendiente"
        )
    )
    for fund in fondo_result.scalars().all():
        pendiente = fund.monto_requerido - fund.monto_cubierto
        if pendiente > 0:
            deducciones["fondo_cobertura"] = round(pendiente, 2)

    total_deducciones = sum(deducciones.values())
    neto = total_percepciones - total_deducciones

    # Guardar o actualizar
    existing = await db.execute(
        select(models.HRSeverance).where(models.HRSeverance.employee_id == employee_id)
    )
    sev = existing.scalar_one_or_none()

    if sev:
        sev.fecha_calculo = date.today()
        sev.motivo_salida = motivo
        sev.percepciones_json = percepciones
        sev.deducciones_json = deducciones
        sev.neto = round(neto, 2)
    else:
        sev = models.HRSeverance(
            employee_id=employee_id, fecha_calculo=date.today(),
            motivo_salida=motivo,
            percepciones_json=percepciones, deducciones_json=deducciones,
            neto=round(neto, 2),
        )
        db.add(sev)

    await db.commit()

    return {
        "id": sev.id,
        "dias_trabajados": dias_trabajados,
        "años_servicio": round(años_servicio, 2),
        "sueldo_dia": sueldo_dia,
        "percepciones": percepciones,
        "total_percepciones": round(total_percepciones, 2),
        "deducciones": deducciones,
        "total_deducciones": round(total_deducciones, 2),
        "neto": round(neto, 2),
    }
