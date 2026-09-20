from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List

from core.database import get_db
from . import schemas
from .service import pos_service

from pydantic import BaseModel
class LockRequest(BaseModel):
    occupier_id: int
    occupier_name: str

from .occupancy import get_all_locks, lock_terminal, unlock_terminal, force_unlock, heartbeat
from .models import TerminalLock
from modules.settings.service import get_setting_by_key
from .pos_audit import audit_pos_write

router = APIRouter()

@router.post("/sessions", response_model=schemas.TerminalSessionResponse)
async def create_session(session: schemas.TerminalSessionCreate, request: Request, db: AsyncSession = Depends(get_db)):
    result = await pos_service.create_session(db, session)
    audit_pos_write(request, "POST /sessions", {"terminal_id": session.terminal_id, "session_id": result.id}, 200)
    return result

@router.get("/sessions/{terminal_id}/active", response_model=schemas.TerminalSessionResponse)
async def get_active_session(terminal_id: str, db: AsyncSession = Depends(get_db)):
    session = await pos_service.get_active_session(db, terminal_id)
    if not session:
        raise HTTPException(status_code=404, detail="Active session not found")
    return session

@router.post("/tickets/reserve", response_model=schemas.TicketResponse)
async def reserve_ticket(req: schemas.ReserveTicketRequest, request: Request, db: AsyncSession = Depends(get_db)):
    # v14 (Opcion 2): `channel` opcional → el ticket nace con el canal correcto
    # en el MISMO INSERT. El POS IA no envía el campo y recibe 'PANADERIA'.
    result = await pos_service.reserve_ticket(db, req.terminal_id, req.captured_by_id, req.channel)
    audit_pos_write(request, "POST /tickets/reserve", {
        "terminal_id": req.terminal_id, "captured_by_id": req.captured_by_id,
        "channel": req.channel,
        "account_num": result.account_num
    }, 200)
    return result

@router.post("/tickets", response_model=schemas.TicketResponse)
async def create_ticket(ticket: schemas.TicketCreate, request: Request, db: AsyncSession = Depends(get_db)):
    result = await pos_service.create_ticket(db, ticket)
    audit_pos_write(request, "POST /tickets", ticket, 200, extra=f"folio={ticket.account_num}")
    return result

# ── FASE 2: Endpoints Atómicos de Items (Persistencia Inmediata) ────────
@router.post("/tickets/items/add", response_model=schemas.TicketLightResponse)
async def add_item_to_ticket(payload: schemas.TicketItemAdd, request: Request, db: AsyncSession = Depends(get_db)):
    """Agrega un producto al ticket. Si ya existe, incrementa cantidad."""
    result = await pos_service.add_item_to_ticket(db, payload)
    audit_pos_write(request, "POST /tickets/items/add", {
        "account_num": payload.account_num, "product_id": payload.product_id, "qty": payload.quantity
    }, 200)
    return result

@router.put("/tickets/items/update", response_model=schemas.TicketLightResponse)
async def update_item_quantity(payload: schemas.TicketItemUpdate, request: Request, db: AsyncSession = Depends(get_db)):
    """Actualiza la cantidad de un item existente."""
    result = await pos_service.update_item_quantity(db, payload)
    audit_pos_write(request, "PUT /tickets/items/update", {
        "account_num": payload.account_num, "product_id": payload.product_id, "new_qty": payload.new_quantity
    }, 200)
    return result

@router.delete("/tickets/items/remove", response_model=schemas.TicketLightResponse)
async def remove_item_from_ticket(payload: schemas.TicketItemRemove, request: Request, db: AsyncSession = Depends(get_db)):
    """Elimina un producto del ticket."""
    result = await pos_service.remove_item_from_ticket(db, payload)
    audit_pos_write(request, "DELETE /tickets/items/remove", {
        "account_num": payload.account_num, "product_id": payload.product_id
    }, 200)
    return result

@router.get("/tickets", response_model=List[schemas.TicketResponse])
async def get_tickets(
    terminal_id: str = None, 
    status: str = None, 
    search: str = None, 
    search_date: str = None,
    limit: int = 100, 
    db: AsyncSession = Depends(get_db)
):
    return await pos_service.get_tickets(db=db, terminal_id=terminal_id, status=status, search=search, search_date=search_date, limit=limit)

@router.get("/tickets/by-account/{account_num}", response_model=schemas.TicketResponse)
async def get_ticket_by_account_num(account_num: str, db: AsyncSession = Depends(get_db)):
    """Búsqueda EXACTA por account_num (no fuzzy). Usado por recovery y auto-heal."""
    ticket = await pos_service.get_ticket_by_account_num(db, account_num)
    if not ticket:
        raise HTTPException(status_code=404, detail=f"Ticket {account_num} no encontrado")
    return ticket

@router.get("/tickets/open", response_model=List[schemas.TicketResponse])
async def get_open_tickets(db: AsyncSession = Depends(get_db)):
    return await pos_service.get_open_tickets(db)

@router.get("/tickets/drafts/{terminal_id}", response_model=List[schemas.TicketResponse])
async def get_terminal_drafts(terminal_id: str, db: AsyncSession = Depends(get_db)):
    """v5.0: Devuelve tickets DRAFT con items para la terminal indicada.
    Usado al login para detectar cuentas huérfanas dejadas por el usuario anterior.
    v5.1: Respuesta incluye age_hours para mostrar antigüedad en el modal."""
    return await pos_service.get_drafts_for_terminal(db, terminal_id.strip())

@router.get("/tickets/drafts-report")
async def get_drafts_expiry_report(db: AsyncSession = Depends(get_db)):
    """v5.1: Reporte administrativo de DRAFTs próximos a expirar.
    Útil para que el administrador tome acción antes de que el GC los cancele.
    El TTL se configura en Ajustes del Sistema con la clave 'pos_draft_ttl_days'."""
    return await pos_service.get_stale_drafts_report(db)

@router.get("/audit")
async def get_audit_log(
    terminal_id: str = None,
    date_from: str = None,
    date_to: str = None,
    limit: int = 200,
    db: AsyncSession = Depends(get_db)
):
    """v5.1: Auditoría de operaciones POS por terminal y rango de fechas.
    Combina datos de tickets (PostgreSQL) con log de seguridad (pos_audit.log).
    Usado por el panel Auditar Terminales en la UI."""
    from datetime import datetime, timedelta
    from sqlalchemy.future import select
    from sqlalchemy.orm import selectinload, subqueryload
    from modules.pos import models
    from modules.catalog.models import Product
    # v17 (H2): helper UTC centralizado (mismo criterio que occupancy.py v15).
    from core.timestamps import utcnow

    # Defaults: hoy
    now = utcnow()
    try:
        d_from = datetime.fromisoformat(date_from) if date_from else now.replace(hour=0, minute=0, second=0, microsecond=0)
    except ValueError:
        d_from = now.replace(hour=0, minute=0, second=0, microsecond=0)
    try:
        d_to = datetime.fromisoformat(date_to) if date_to else now
    except ValueError:
        d_to = now

    query = (
        select(models.Ticket)
        .options(
            selectinload(models.Ticket.items).selectinload(models.TicketItem.product),
            selectinload(models.Ticket.captured_by),
            selectinload(models.Ticket.cashed_by)
        )
        .where(models.Ticket.created_at >= d_from)
        .where(models.Ticket.created_at <= d_to)
        .order_by(models.Ticket.created_at.desc())
        .limit(limit)
    )
    if terminal_id:
        query = query.where(models.Ticket.terminal_id == terminal_id.strip())

    result = await db.execute(query)
    tickets = result.scalars().all()

    events = []
    for t in tickets:
        captured_name = t.captured_by.name if t.captured_by else "DESCONOCIDO"
        cashed_name = t.cashed_by.name if t.cashed_by else None
        items_summary = []
        for i in (t.items or []):
            try:
                name = i.product.name if i.product else f"#{i.product_id}"
            except Exception:
                name = f"#{i.product_id}"
            items_summary.append({"name": name, "qty": i.quantity, "subtotal": float(i.subtotal or 0)})

        events.append({
            "id": t.id,
            "account_num": t.account_num,
            "terminal_id": t.terminal_id,
            "status": t.status,
            "total": float(t.total or 0),
            "items_count": len(t.items or []),
            "items": items_summary,
            "captured_by_id": t.captured_by_id,
            "captured_by_name": captured_name,
            "cashed_by_id": t.cashed_by_id,
            "cashed_by_name": cashed_name,
            "created_at": t.created_at.isoformat() if t.created_at else None,
        })

    # Leer últimas líneas del log de seguridad (alertas ⚠️)
    security_alerts = []
    try:
        import os
        log_path = "/app/logs/pos_audit.log"
        if os.path.exists(log_path):
            with open(log_path, "r", encoding="utf-8") as f:
                lines = f.readlines()
            for line in lines[-500:]:
                if "⚠️" not in line:
                    continue
                if terminal_id and terminal_id not in line:
                    continue
                security_alerts.append(line.strip())
    except Exception:
        pass

    return {
        "terminal_id": terminal_id,
        "date_from": d_from.isoformat(),
        "date_to": d_to.isoformat(),
        "total_events": len(events),
        "events": events,
        "security_alerts": security_alerts[-20:],
    }
# v18 (Fase 18.1): el helper se movio a core/serialization.py para que Heladeria
# lo reutilice. Se conserva este alias para NO alterar el POS IA: el comportamiento
# es IDENTICO (mismo cuerpo de funcion, ahora compartido).
from core.serialization import iso_utc as _iso_utc


@router.get("/terminals/status")
async def get_terminals_status(db: AsyncSession = Depends(get_db)):
    """
    Fuente de verdad UNIFICADA (v4.3):
    1. Lee candados persistentes de la tabla terminal_locks (DB)
    2. Complementa con sesiones de caja abiertas (CashSession)
    3. Previene que un usuario aparezca en 2+ terminales simultáneamente
    4. Aplica TTL máximo de 24h a CashSessions huérfanas
    No depende de RAM volátil.
    """
    try:
        ttl_setting = await get_setting_by_key(db, "pos_terminal_lock_ttl_m")
        ttl = int(ttl_setting.value)
    except Exception:
        ttl = 15
    
    # Fuente 1: Candados persistentes (reemplaza _locks en RAM)
    locks = await get_all_locks(db, ttl_minutes=ttl)
    
    # Construir set de user IDs que ya tienen un lock activo (con heartbeat reciente)
    locked_user_ids = {info["occupier_id"] for info in locks.values()}
    
    # Fuente 2: Sesiones de caja activas (persisten incluso sin lock)
    from modules.cash.models import CashSession
    from sqlalchemy.future import select
    from datetime import datetime, timedelta
    # v15 (H2): cutoff de CashSession huérfana en UTC (consistencia con occupancy.py).
    from core.timestamps import utcnow
    
    CASH_SESSION_MAX_TTL_HOURS = 24  # TTL máximo para sesiones de caja huérfanas
    
    result = await db.execute(select(CashSession).where(CashSession.status == "OPEN"))
    active_cash = result.scalars().all()
    
    # Combinar: locks de DB + caja abierta
    res = dict(locks)
    cutoff = utcnow() - timedelta(hours=CASH_SESSION_MAX_TTL_HOURS)
    
    for c in active_cash:
        tid = c.terminal_id.strip() if c.terminal_id else ""
        
        # v4.3 Bug Fix: Si el usuario de esta CashSession ya tiene un lock activo
        # en OTRA terminal, no crear un candado fantasma en esta terminal.
        # Solo marcar como caja abierta sin operador presente.
        user_locked_elsewhere = (c.employee_id in locked_user_ids) and (tid not in res or res[tid].get("occupier_id") != c.employee_id)
        
        if tid not in res:
            if user_locked_elsewhere:
                # El cajero se fue a otra terminal — marcar caja como abierta pero sin operador activo
                res[tid] = {
                    "occupier_id": c.employee_id,
                    "occupier_name": f"{c.employee_name} (CAJA ABIERTA)",
                    "locked_at": c.opened_at,
                    "is_cash_register": True,
                    "operator_absent": True
                }
            elif c.opened_at and c.opened_at < cutoff:
                # v4.3: CashSession huérfana (>24h sin cerrar) — marcar como zombie
                res[tid] = {
                    "occupier_id": c.employee_id,
                    "occupier_name": f"{c.employee_name} (SESIÓN EXPIRADA)",
                    "locked_at": c.opened_at,
                    "is_cash_register": True,
                    "stale_session": True
                }
            else:
                res[tid] = {
                    "occupier_id": c.employee_id,
                    "occupier_name": c.employee_name,
                    "locked_at": c.opened_at,
                    "is_cash_register": True
                }
        else:
            res[tid]["is_cash_register"] = True

    # v12 (Fase 12.4): normalizar locked_at con sufijo Z explicito.
    for info in res.values():
        if info.get("locked_at") is not None:
            info["locked_at"] = _iso_utc(info["locked_at"])
    return res

@router.post("/terminals/{terminal_id}/lock")
async def take_terminal_lock(terminal_id: str, req: LockRequest, db: AsyncSession = Depends(get_db)):
    tid = terminal_id.strip()
    try:
        ttl_setting = await get_setting_by_key(db, "pos_terminal_lock_ttl_m")
        ttl = int(ttl_setting.value)
    except Exception:
        ttl = 15
    success = await lock_terminal(db, tid, req.occupier_id, req.occupier_name, ttl_minutes=ttl)
    if not success:
        raise HTTPException(status_code=400, detail="Terminal ocupada por otra persona.")
    await db.commit()
    return {"status": "locked", "terminal_id": tid}

@router.post("/terminals/{terminal_id}/unlock")
async def release_terminal_lock(terminal_id: str, req: LockRequest, db: AsyncSession = Depends(get_db)):
    tid = terminal_id.strip()
    success = await unlock_terminal(db, tid, req.occupier_id)
    if not success:
        # v15 (H8): 403 ESPERADO, no un bug. Ocurre cuando el solicitante ya no es
        # el dueño del candado (force_unlock previo, TTL expirado + re-ocupación, o
        # doble unlock). El frontend lo captura con .catch() y NO reintenta
        # (regla anti-ping-pong). Ver DOCUMENTACION_MODULO_POS.md §5.6.
        raise HTTPException(status_code=403, detail="No tienes permiso para liberar esta terminal.")
    await db.commit()
    return {"status": "unlocked", "terminal_id": tid}

@router.post("/terminals/{terminal_id}/force_unlock")
async def force_terminal_unlock(terminal_id: str, req: LockRequest, db: AsyncSession = Depends(get_db)):
    """
    Fuerza la liberación de una terminal bloqueada (hardened v4.4).
    
    Seguridad:
      1. Valida permisos del usuario en el backend (no solo en frontend).
      2. Si la terminal tiene CashSession activa, requiere permiso pos_force_cash_unlock.
      3. Transfiere titularidad de CashSession al desbloqueador (Traspuesta de Titularidad).
      4. Registra auditoría de quién desbloqueó qué, a quién le quitó, y cuándo.
    """
    import logging
    from modules.cash.models import CashSession
    from modules.security.models import Employee, SecurityProfile
    from sqlalchemy.future import select
    from sqlalchemy.orm import selectinload
    # v17 (H2): helper UTC centralizado (mismo criterio que occupancy.py v15).
    from core.timestamps import utcnow

    logger = logging.getLogger("pos.force_unlock")
    tid = terminal_id.strip()

    # ── 1. VALIDAR PERMISOS EN BACKEND ──────────────────────────────────
    employee = await db.execute(
        select(Employee)
        .options(selectinload(Employee.profile))
        .where(Employee.id == req.occupier_id)
    )
    emp = employee.scalars().first()
    if not emp:
        raise HTTPException(status_code=404, detail="Empleado no encontrado.")
    
    permissions = {}
    if emp.profile and emp.profile.permissions:
        permissions = emp.profile.permissions
    
    is_admin = (emp.role or "").strip().upper() == "ADMIN"
    has_unlock_perm = permissions.get("pos_force_unlock") in ("full", True)
    
    if not is_admin and not has_unlock_perm:
        logger.warning(f"🚫 FORCE UNLOCK DENEGADO: {emp.name} (id={emp.id}) intentó desbloquear {tid} sin permisos")
        raise HTTPException(status_code=403, detail="No tienes permiso para forzar el desbloqueo de terminales.")
    
    # Verificar permiso de caja si la terminal tiene CashSession activa
    result_cash = await db.execute(select(CashSession).where(
        CashSession.terminal_id == tid,
        CashSession.status == "OPEN"
    ))
    cash_session = result_cash.scalars().first()
    
    if cash_session:
        has_cash_perm = permissions.get("pos_force_cash_unlock") in ("full", True)
        if not is_admin and not has_cash_perm:
            logger.warning(f"🚫 FORCE UNLOCK CAJA DENEGADO: {emp.name} (id={emp.id}) intentó desbloquear CAJA en {tid} sin permiso pos_force_cash_unlock")
            raise HTTPException(status_code=403, detail="No tienes permiso para forzar el desbloqueo de terminales con CAJA activa.")
    
    # ── 2. OBTENER DATOS DEL OCUPANTE ANTERIOR (para auditoría) ─────────
    prev_lock = await db.execute(
        select(TerminalLock).where(TerminalLock.terminal_id == tid)
    )
    previous_occupier = prev_lock.scalars().first()
    prev_name = previous_occupier.occupier_name if previous_occupier else "NADIE"
    prev_id = previous_occupier.occupier_id if previous_occupier else None

    # ── 3. TRANSACCIÓN ATÓMICA: unlock + traspuesta + auditoría ─────────
    # Todo dentro del mismo commit para evitar estados inconsistentes
    await force_unlock(db, tid)
    
    cash_transferred = False
    if cash_session:
        cash_session.employee_id = req.occupier_id
        cash_session.employee_name = req.occupier_name
        cash_transferred = True

    # ── 4. LOG DE AUDITORÍA ─────────────────────────────────────────────
    logger.warning(
        f"🔓 FORCE UNLOCK: Terminal={tid} | "
        f"Ejecutado por: {emp.name} (id={emp.id}) | "
        f"Quitado a: {prev_name} (id={prev_id}) | "
        f"CashSession transferida: {cash_transferred} | "
        f"Timestamp: {utcnow().isoformat()}"
    )

    await db.commit()

    return {
        "status": "unlocked", 
        "terminal_id": tid,
        "previous_occupier": prev_name,
        "cash_session_transferred": cash_transferred,
        "unlocked_by": emp.name
    }

@router.post("/terminals/{terminal_id}/heartbeat")
async def heartbeat_terminal_lock(terminal_id: str, req: LockRequest, db: AsyncSession = Depends(get_db)):
    tid = terminal_id.strip()
    try:
        ttl_setting = await get_setting_by_key(db, "pos_terminal_lock_ttl_m")
        ttl = int(ttl_setting.value)
    except Exception:
        ttl = 15
    success = await heartbeat(db, tid, req.occupier_id, ttl_minutes=ttl)
    if not success:
        raise HTTPException(status_code=404, detail="No active lock found for this terminal/user.")
    await db.commit()
    return {"status": "alive", "terminal_id": terminal_id}

@router.post("/tickets/emergency-save")
async def emergency_save_ticket(payload: dict, db: AsyncSession = Depends(get_db)):
    """
    v4.0 ZERO-LOSS: Endpoint de emergencia para sendBeacon (cierre de navegador).
    Acepta un payload simplificado y hace lo posible por guardar el ticket.
    No lanza excepciones — siempre retorna 200 para no bloquear el cierre del navegador.
    """
    import logging
    logger = logging.getLogger("pos.emergency")
    
    try:
        account_num = payload.get("account_num")
        items = payload.get("items", [])
        terminal_id = payload.get("terminal_id")
        
        if not account_num or not items:
            logger.warning("Emergency save: payload incompleto, ignorando")
            return {"status": "ignored", "reason": "incomplete payload"}
        
        logger.warning(f"🆘 EMERGENCY SAVE: {account_num} con {len(items)} items (terminal={terminal_id})")
        
        # v7.0.3: Buscar la sesión activa de LA TERMINAL indicada.
        # Antes se tomaba la primera sesión activa arbitraria, lo que podía
        # asociar el ticket de emergencia a la terminal equivocada.
        from sqlalchemy.future import select
        from .models import TerminalSession
        query = select(TerminalSession).where(TerminalSession.is_active == True)
        if terminal_id:
            query = query.where(TerminalSession.terminal_id == terminal_id)
        result = await db.execute(query.limit(1))
        session = result.scalars().first()
        
        # Fallback: si no se encontró por terminal_id, usar cualquier sesión activa
        # (preserva el comportamiento previo para no perder el ticket de emergencia).
        if not session and terminal_id:
            logger.warning(f"Emergency save: sin sesión para terminal {terminal_id}, usando fallback")
            result = await db.execute(
                select(TerminalSession).where(TerminalSession.is_active == True).limit(1)
            )
            session = result.scalars().first()
        
        if not session:
            logger.error("Emergency save: No hay sesión activa")
            return {"status": "failed", "reason": "no active session"}
        
        # Construir TicketCreate y guardar
        ticket_data = schemas.TicketCreate(
            account_num=account_num,
            session_id=session.id,
            items=[schemas.TicketItemCreate(**item) for item in items],
            status="OPEN"
        )
        
        await pos_service.create_ticket(db, ticket_data)
        logger.warning(f"✅ EMERGENCY SAVE exitoso: {account_num}")
        return {"status": "saved", "account_num": account_num}
        
    except Exception as e:
        logger.error(f"❌ EMERGENCY SAVE falló: {e}")
        return {"status": "failed", "error": str(e)}

@router.post("/vision/training/upload")
async def upload_vision_training(payload: schemas.VisionTrainingUpload):
    return await pos_service.upload_training_images(payload)

@router.post("/vision/predict", response_model=schemas.VisionPredictionResponse)
async def predict_vision(payload: schemas.VisionPredictionRequest):
    """v7 (Fase 6.2): deteccion por vision reutilizando el motor ORB existente.

    Envuelto en try/except para NO interrumpir el POS: si el motor de vision
    falla (OpenCV ausente, imagen invalida, etc.) se devuelve una respuesta
    vacia con engine="unavailable" en lugar de propagar un 500. La UI lo
    traduce a un toast y el operador continua en modo manual.
    """
    try:
        return await pos_service.predict_vision(payload)
    except Exception as e:
        logger.warning(f"⚠️ Vision predict no disponible: {e}")
        return schemas.VisionPredictionResponse(
            detections=[],
            engine="unavailable",
            latency_ms=0.0,
        )
