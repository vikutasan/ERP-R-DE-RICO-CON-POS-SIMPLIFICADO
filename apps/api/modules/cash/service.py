from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from fastapi import HTTPException
from datetime import datetime

from . import models, schemas
from modules.pos.models import Ticket, TerminalSession


async def abrir_sesion(db: AsyncSession, datos: schemas.CashSessionCreate) -> models.CashSession:
    """Abre una nueva sesión de caja para un cajero en una terminal."""
    sesion_existente = await _obtener_sesion_activa(db, datos.terminal_id)
    if sesion_existente:
        raise HTTPException(
            status_code=400,
            detail="Ya existe una sesión activa en esta terminal. Ciérrela antes de abrir una nueva."
        )

    nueva_sesion = models.CashSession(
        terminal_id=datos.terminal_id,
        employee_id=datos.employee_id,
        employee_name=datos.employee_name,
        opening_float=datos.opening_float,
    )
    db.add(nueva_sesion)
    await db.commit()
    # Cargar preventivamente las relaciones tras el commit para que estén disponibles en el Response
    resultado = await db.execute(
        select(models.CashSession)
        .where(models.CashSession.id == nueva_sesion.id)
        .options(
            selectinload(models.CashSession.movements),
            selectinload(models.CashSession.tickets)
        )
    )
    return resultado.scalar_one()


async def obtener_sesion_activa(db: AsyncSession, terminal_id: str) -> models.CashSession | None:
    """Devuelve la sesión activa de una terminal, o None si no hay ninguna."""
    return await _obtener_sesion_activa(db, terminal_id)


async def _obtener_sesion_activa(db: AsyncSession, terminal_id: str) -> models.CashSession | None:
    """Helper interno para consultar la sesión activa con sus movimientos."""
    resultado = await db.execute(
        select(models.CashSession)
        .where(
            models.CashSession.terminal_id == terminal_id,
            models.CashSession.status == "OPEN",
        )
        .options(
            selectinload(models.CashSession.movements),
            selectinload(models.CashSession.tickets)
        )
    )
    return resultado.scalar_one_or_none()


async def agregar_movimiento(
    db: AsyncSession, session_id: int, datos: schemas.CashMovementCreate
) -> models.CashMovement:
    """Registra una entrada o salida de dinero en el turno activo."""
    sesion = await _obtener_sesion_por_id(db, session_id)

    movimiento = models.CashMovement(
        cash_session_id=sesion.id,
        movement_type=datos.movement_type,
        amount=datos.amount,
        concept=datos.concept,
    )
    db.add(movimiento)
    await db.commit()
    await db.refresh(movimiento)
    return movimiento


async def eliminar_movimiento(db: AsyncSession, session_id: int, movimiento_id: int) -> dict:
    """Elimina un movimiento de efectivo previamente registrado."""
    resultado = await db.execute(
        select(models.CashMovement).where(
            models.CashMovement.id == movimiento_id,
            models.CashMovement.cash_session_id == session_id,
        )
    )
    movimiento = resultado.scalar_one_or_none()
    if not movimiento:
        raise HTTPException(status_code=404, detail="Movimiento no encontrado")

    await db.delete(movimiento)
    await db.commit()
    return {"message": "Movimiento eliminado"}


async def calcular_resumen(db: AsyncSession, session_id: int) -> schemas.CashSummaryResponse:
    """Calcula el resumen financiero del turno en tiempo real."""
    sesion = await _obtener_sesion_por_id(db, session_id)
    movimientos = await _obtener_movimientos(db, session_id)
    tickets_pagados = await _obtener_tickets_pagados(db, session_id)

    # 1. Totales de movimientos (Entradas/Salidas)
    t_entradas = sum(float(m.amount) for m in movimientos if m.movement_type == "ENTRADA")
    t_salidas = sum(float(m.amount) for m in movimientos if m.movement_type == "SALIDA")

    # 2. Clasificación de ventas por método de pago
    ventas = _clasificar_pagos(tickets_pagados)

    # 3. Cálculo de saldos esperados
    efectivo_esp = float(sesion.opening_float or 0) + ventas["efectivo"] + t_entradas - t_salidas
    total_v = ventas["efectivo"] + ventas["credito"] + ventas["debito"]

    return schemas.CashSummaryResponse(
        efectivo_esperado=round(efectivo_esp, 2),
        total_credito=round(ventas["credito"], 2),
        total_debito=round(ventas["debito"], 2),
        total_ventas=round(total_v, 2),
        num_transacciones=len(tickets_pagados),
        fondo_inicial=sesion.opening_float,
        total_entradas=round(t_entradas, 2),
        total_salidas=round(t_salidas, 2),
    )

def _clasificar_pagos(tickets: list[Ticket]) -> dict:
    """Helper puro para sumar montos por categoría de pago."""
    res = {"efectivo": 0.0, "credito": 0.0, "debito": 0.0}
    for t in tickets:
        if not t.payment_details: continue
        for p in t.payment_details:
            m = (p.get("method") or "").upper()
            tipo = (p.get("type") or "").upper()
            amt = float(p.get("amount") or 0)
            
            if m == "EFECTIVO":
                res["efectivo"] += amt
            elif any(x in (tipo + m) for x in ["CREDITO", "CRÉDITO"]):
                res["credito"] += amt
            else:
                res["debito"] += amt
    return res


async def cerrar_sesion(
    db: AsyncSession, session_id: int, datos: schemas.CashSessionClose
) -> schemas.CashCloseResponse:
    """
    Cierra el turno de caja, guarda los montos físicos contados
    y calcula las diferencias respecto al sistema.
    """
    sesion = await _obtener_sesion_por_id(db, session_id)
    resumen = await calcular_resumen(db, session_id)

    sesion.status = "CLOSED"
    sesion.closed_at = datetime.now()
    sesion.physical_cash = datos.physical_cash
    sesion.physical_credit = datos.physical_credit
    sesion.physical_debit = datos.physical_debit

    await db.commit()
    await db.refresh(sesion)

    return schemas.CashCloseResponse(
        sesion=sesion,
        resumen=resumen,
        diferencia_efectivo=round(datos.physical_cash - resumen.efectivo_esperado, 2),
        diferencia_credito=round(datos.physical_credit - resumen.total_credito, 2),
        diferencia_debito=round(datos.physical_debit - resumen.total_debito, 2),
    )


async def obtener_historial_sesiones(db: AsyncSession, terminal_id: str = None, search_date: str = None, limit: int = 50) -> list[models.CashSession]:
    """Obtiene el historial de sesiones de caja cerradas con sus resúmenes y tickets."""
    query = (
        select(models.CashSession)
        .where(models.CashSession.status == "CLOSED")
        .options(
            selectinload(models.CashSession.movements),
            selectinload(models.CashSession.tickets)
        )
    )
    
    if terminal_id:
        query = query.where(models.CashSession.terminal_id == terminal_id)
        
    if search_date:
        try:
            from datetime import datetime, timedelta
            target_date = datetime.strptime(search_date, "%Y-%m-%d")
            start_utc = target_date + timedelta(hours=6)
            end_utc = target_date + timedelta(days=1, hours=6)
            query = query.where(models.CashSession.opened_at >= start_utc).where(models.CashSession.opened_at < end_utc)
        except Exception as e:
            import logging
            logging.error(f"Error parsing date {search_date}: {e}")
            
    query = query.order_by(models.CashSession.closed_at.desc()).limit(limit)
    
    resultado = await db.execute(query)
    sesiones = resultado.scalars().all()
    
    # Inyectar resumen calculado a cada sesión para la auditoría
    for sesion in sesiones:
        resumen = await calcular_resumen(db, sesion.id)
        sesion.resumen = resumen
        
    return sesiones


# --- Helpers privados ---

async def _obtener_sesion_por_id(db: AsyncSession, session_id: int) -> models.CashSession:
    resultado = await db.execute(
        select(models.CashSession)
        .where(models.CashSession.id == session_id)
        .options(
            selectinload(models.CashSession.movements),
            selectinload(models.CashSession.tickets)
        )
    )
    sesion = resultado.scalar_one_or_none()
    if not sesion:
        raise HTTPException(status_code=404, detail="Sesión de caja no encontrada")
    return sesion


async def _obtener_movimientos(db: AsyncSession, session_id: int) -> list[models.CashMovement]:
    resultado = await db.execute(
        select(models.CashMovement).where(models.CashMovement.cash_session_id == session_id)
    )
    return resultado.scalars().all()


async def _obtener_tickets_pagados(
    db: AsyncSession, session_id: int
) -> list[Ticket]:
    """Obtiene todos los tickets pagados vinculados a la sesión de caja específica."""
    resultado = await db.execute(
        select(Ticket).where(
            Ticket.status == "PAID",
            Ticket.cash_session_id == session_id
        )
    )
    return resultado.scalars().all()


async def generar_reporte_diario(db: AsyncSession, fecha: str) -> dict:
    """
    Genera el reporte diario consolidado para una fecha específica.
    Agrupa ventas por canal (PANADERÍA/HELADERÍA) y por cajero/terminal.
    
    Args:
        fecha: string YYYY-MM-DD
    
    Returns:
        dict con gran_total, por_canal, alertas
    """
    from datetime import timedelta
    fecha_obj = datetime.strptime(fecha, "%Y-%m-%d").date()
    # Ajuste UTC-6 (México): el "día" local va de 06:00 UTC a 06:00 UTC del día siguiente
    # Misma solución que Bug 2 en pos/service.py
    fecha_inicio = datetime.combine(fecha_obj, datetime.min.time()) + timedelta(hours=6)
    fecha_fin = fecha_inicio + timedelta(days=1)

    # Obtener todas las sesiones de caja del día
    resultado_sesiones = await db.execute(
        select(models.CashSession)
        .options(selectinload(models.CashSession.tickets))
        .where(models.CashSession.opened_at >= fecha_inicio)
        .where(models.CashSession.opened_at <= fecha_fin)
    )
    sesiones = resultado_sesiones.scalars().all()

    # Obtener tickets pagados del día
    resultado_tickets = await db.execute(
        select(Ticket)
        .where(Ticket.status == "PAID")
        .where(Ticket.created_at >= fecha_inicio)
        .where(Ticket.created_at <= fecha_fin)
    )
    tickets = resultado_tickets.scalars().all()

    # Agrupar por canal
    canales = {}
    for t in tickets:
        canal = getattr(t, 'channel', None) or 'PANADERIA'
        if canal not in canales:
            canales[canal] = {'total': 0, 'count': 0, 'tickets': []}
        canales[canal]['total'] += float(t.total or 0)
        canales[canal]['count'] += 1

    # Agrupar sesiones por terminal
    turnos = []
    diferencia_total = 0
    for s in sesiones:
        tickets_sesion = [t for t in tickets if t.cash_session_id == s.id]
        total_ventas = sum(float(t.total or 0) for t in tickets_sesion)
        diferencia = float(s.real_cash_count or 0) - float(s.expected_cash or 0) if s.is_closed else 0
        diferencia_total += diferencia

        turnos.append({
            'session_id': s.id,
            'terminal_id': s.terminal_id,
            'employee_name': s.employee_name,
            'opened_at': s.opened_at.isoformat() if s.opened_at else None,
            'closed_at': s.closed_at.isoformat() if s.closed_at else None,
            'is_closed': s.is_closed,
            'total_ventas': total_ventas,
            'num_tickets': len(tickets_sesion),
            'diferencia': diferencia,
        })

    # Alertas
    alertas = []
    sesiones_abiertas = [s for s in sesiones if not s.is_closed]
    for s in sesiones_abiertas:
        alertas.append(f"Sesión {s.terminal_id} ({s.employee_name}) sigue abierta")

    gran_total = sum(float(t.total or 0) for t in tickets)

    return {
        'fecha': fecha,
        'gran_total': gran_total,
        'total_tickets': len(tickets),
        'total_turnos': len(sesiones),
        'turnos_cerrados': len([s for s in sesiones if s.is_closed]),
        'diferencia_total': diferencia_total,
        'por_canal': {
            canal: {
                'total': data['total'],
                'tickets': data['count'],
            }
            for canal, data in canales.items()
        },
        'turnos': turnos,
        'alertas': alertas,
    }
