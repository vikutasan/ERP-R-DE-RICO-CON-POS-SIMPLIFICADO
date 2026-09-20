"""
test_pos_emergency_save.py - v22.6: Tests del endpoint de guardado de emergencia.

Cubre POST /pos/tickets/emergency-save (router.py:438), la ruta que el frontend
invoca en beforeunload / force_logout para no perder el carrito.

Contrato REAL verificado leyendo router.py:448-497 en esta sesion:
  - sin items / items vacio -> {"status": "ignored", "reason": "incomplete payload"}  (455)
  - sin sesion activa       -> {"status": "failed", "reason": "no active session"}    (481)
  - error interno           -> {"status": "failed", "error": str(e)}                  (497)
  - exito                   -> {"status": "saved", "account_num": <acc>}              (493)

Clave del payload: "items" (NO "cart"). Confirmado contra el frontend real
(useBeforeUnload.js:47 -> items: cartRef.current.map(i => ({product_id, quantity}))).

Regla de oro: prefijo TEST_V22_EMERG_ y limpieza idempotente.
"""
import pytest
import pytest_asyncio
from sqlalchemy import delete, select

from core.database import AsyncSessionLocal
from modules.cash import models as _cash_models  # noqa: F401
from modules.pos import models as pos_models
from modules.pos import router as pos_router
from modules.warehouse import models as _wh_models  # noqa: F401
from modules.orders import models as _orders_models  # noqa: F401
from modules.catalog import models as _catalog_models
from modules.heladeria import models as _hel_models  # noqa: F401

ACC_PREFIX = "TEST_V22_EMERG_"
SKU_PREFIX = "TEST_V22_EMERG_"
TERM_1 = "TEST_V22_EMERG_T1"
TERM_2 = "TEST_V22_EMERG_T2"


async def _limpiar(db):
    """Mismo orden de 8 pasos que FASE 1 y FASE 3 (D4 + D6 + M3 + D18).

    D18: el orden DEBE ser TicketItemComponent -> TicketItem -> WarehouseEvent ->
    Order -> Ticket -> TerminalSession -> Product -> TerminalLock. Borrar Ticket
    ANTES de WarehouseEvent/Order viola las FKs (warehouse/models.py:113,
    orders/models.py:18) y contradice §5.3. v22.5 tenía aquí el orden VIEJO.
    """
    await db.execute(
        delete(_hel_models.TicketItemComponent).where(
            _hel_models.TicketItemComponent.ticket_item_id.in_(
                select(pos_models.TicketItem.id).where(
                    pos_models.TicketItem.ticket_id.in_(
                        select(pos_models.Ticket.id).where(
                            pos_models.Ticket.account_num.like(f"{ACC_PREFIX}%")
                        )
                    )
                )
            )
        )
    )
    await db.execute(
        delete(pos_models.TicketItem).where(
            pos_models.TicketItem.ticket_id.in_(
                select(pos_models.Ticket.id).where(
                    pos_models.Ticket.account_num.like(f"{ACC_PREFIX}%")
                )
            )
        )
    )
    # D18: WarehouseEvent ANTES de Ticket (FK warehouse/models.py:113).
    await db.execute(
        delete(_wh_models.WarehouseEvent).where(
            _wh_models.WarehouseEvent.ticket_id.in_(
                select(pos_models.Ticket.id).where(
                    pos_models.Ticket.account_num.like(f"{ACC_PREFIX}%")
                )
            )
        )
    )
    # D18: Order ANTES de Ticket (FK orders/models.py:18).
    await db.execute(
        delete(_orders_models.Order).where(
            _orders_models.Order.ticket_id.in_(
                select(pos_models.Ticket.id).where(
                    pos_models.Ticket.account_num.like(f"{ACC_PREFIX}%")
                )
            )
        )
    )
    # D18: Ticket DESPUÉS de WarehouseEvent y Order.
    await db.execute(
        delete(pos_models.Ticket).where(
            pos_models.Ticket.account_num.like(f"{ACC_PREFIX}%")
        )
    )
    await db.execute(
        delete(pos_models.TerminalSession).where(
            pos_models.TerminalSession.terminal_id.like(f"{ACC_PREFIX}%")
        )
    )
    await db.execute(
        delete(_catalog_models.Product).where(
            _catalog_models.Product.sku.like(f"{SKU_PREFIX}%")
        )
    )
    await db.execute(
        delete(pos_models.TerminalLock).where(
            pos_models.TerminalLock.terminal_id.like(f"{ACC_PREFIX}%")
        )
    )
    await db.commit()


@pytest_asyncio.fixture
async def db():
    async with AsyncSessionLocal() as session:
        await _limpiar(session)
        try:
            yield session
        finally:
            await _limpiar(session)


@pytest_asyncio.fixture
async def sesion_activa(db):
    s = pos_models.TerminalSession(terminal_id=TERM_1, is_active=True)
    db.add(s)
    await db.commit()
    await db.refresh(s)
    return s


@pytest_asyncio.fixture
async def producto_activo(db):
    p = _catalog_models.Product(
        sku=f"{SKU_PREFIX}PROD", name="Test Emerg", price=10.0, active=True
    )
    db.add(p)
    await db.commit()
    await db.refresh(p)
    return p


# --- Test #1 (D9/D10/D11/A9): guardado exitoso -> dict completo ---
# D9:  la clave es "items" (router.py:450), NO "cart".
# D11: los items solo llevan product_id y quantity (schemas.py:37-42).
# A9:  el endpoint ignora session_id; busca la sesion por terminal_id (router.py:464-468).
@pytest.mark.asyncio
async def test_01_emergency_save_exitoso(db, sesion_activa, producto_activo):
    acc = f"{ACC_PREFIX}001"
    payload = {
        "account_num": acc,
        "terminal_id": TERM_1,
        "items": [{"product_id": producto_activo.id, "quantity": 2}],  # D9 + D11
    }
    result = await pos_router.emergency_save_ticket(payload, db=db)
    # D10: asercion del dict COMPLETO (router.py:493)
    assert result == {"status": "saved", "account_num": acc}
    # Verificar persistencia real
    t = (
        await db.execute(select(pos_models.Ticket).where(pos_models.Ticket.account_num == acc))
    ).scalars().first()
    assert t is not None
    assert t.status == "OPEN"  # router.py:488 crea con status="OPEN"
    assert t.total == 20.0     # 2 x 10.0 (price del Product en BD, no del payload)
    # A9: el ticket se asocia a la sesion de la TERMINAL (TERM_1), no a un session_id del payload
    assert t.session_id == sesion_activa.id


# --- Test #2 (D9/D10/M7): payload sin items -> ignored con reason ---
# M7: NO recibe sesion_activa (el endpoint retorna ignored ANTES de buscar sesion).
@pytest.mark.asyncio
async def test_02_emergency_save_sin_items_ignored(db):
    result = await pos_router.emergency_save_ticket(
        {"account_num": f"{ACC_PREFIX}002", "terminal_id": TERM_1}, db=db
    )
    # D10: dict completo con "reason" (router.py:455)
    assert result == {"status": "ignored", "reason": "incomplete payload"}


# --- Test #3 (D9/D10/M7): items vacio -> ignored con reason ---
@pytest.mark.asyncio
async def test_03_emergency_save_items_vacio_ignored(db):
    result = await pos_router.emergency_save_ticket(
        {"account_num": f"{ACC_PREFIX}003", "terminal_id": TERM_1, "items": []}, db=db
    )
    assert result == {"status": "ignored", "reason": "incomplete payload"}


# --- Test #4 (D9/D11/A11): idempotencia — dos llamadas no duplican ni duplican el total ---
@pytest.mark.asyncio
async def test_04_emergency_save_idempotente(db, sesion_activa, producto_activo):
    acc = f"{ACC_PREFIX}004"
    payload = {
        "account_num": acc,
        "terminal_id": TERM_1,
        "items": [{"product_id": producto_activo.id, "quantity": 1}],  # D9 + D11
    }
    r1 = await pos_router.emergency_save_ticket(payload, db=db)
    r2 = await pos_router.emergency_save_ticket(payload, db=db)
    assert r1["status"] == "saved"
    assert r2["status"] == "saved"
    rows = (
        await db.execute(select(pos_models.Ticket).where(pos_models.Ticket.account_num == acc))
    ).scalars().all()
    assert len(rows) == 1  # no duplica el ticket (upsert por account_num, service.py:93)
    # A11: la segunda llamada NO duplica el total (1 x 10.0, no 2 x 10.0)
    assert rows[0].total == 10.0


# --- Test #5 (A10): fallback de sesion — terminal sin sesion usa cualquier sesion activa ---
# router.py:470-477: si no hay sesion para terminal_id, usa la primera sesion activa.
# D29 (corrección empírica): el fallback hace `select(...).where(is_active==True).limit(1)`
# SIN ORDER BY (router.py:474-477). La BD de desarrollo tiene 7 sesiones activas
# (ids 1..7); la "primera" es la id=1 (T6), NO la s2 recién creada. Afirmar
# `t.session_id == s2.id` es una suposición falsa: el fallback NO garantiza que
# elija la sesión del test. Lo verificable es que el fallback ENCONTRÓ una sesión
# activa (el ticket se guardó con un session_id no nulo y válido), no CUÁL.
@pytest.mark.asyncio
async def test_05_emergency_save_fallback_sesion(db, producto_activo):
    # Sesion activa SOLO en TERM_2 (no en TERM_1)
    s2 = pos_models.TerminalSession(terminal_id=TERM_2, is_active=True)
    db.add(s2)
    await db.commit()
    await db.refresh(s2)
    acc = f"{ACC_PREFIX}005"
    payload = {
        "account_num": acc,
        "terminal_id": TERM_1,  # no hay sesion para TERM_1 -> fallback
        "items": [{"product_id": producto_activo.id, "quantity": 1}],
    }
    result = await pos_router.emergency_save_ticket(payload, db=db)
    assert result == {"status": "saved", "account_num": acc}
    t = (
        await db.execute(select(pos_models.Ticket).where(pos_models.Ticket.account_num == acc))
    ).scalars().first()
    assert t is not None
    # El fallback usó ALGUNA sesión activa (no nula). No se puede afirmar CUÁL
    # porque la query no tiene ORDER BY y la BD tiene otras sesiones activas.
    assert t.session_id is not None
    sesion_usada = await db.get(pos_models.TerminalSession, t.session_id)
    assert sesion_usada is not None
    assert sesion_usada.is_active is True


# --- Test #6 (M8): error interno -> failed con error (rama except, router.py:495-497) ---
# product_id inexistente -> create_ticket lanza 404 -> el endpoint captura y retorna failed.
@pytest.mark.asyncio
async def test_06_emergency_save_error_interno_failed(db, sesion_activa):
    acc = f"{ACC_PREFIX}006"
    payload = {
        "account_num": acc,
        "terminal_id": TERM_1,
        "items": [{"product_id": 999999999, "quantity": 1}],  # producto inexistente
    }
    result = await pos_router.emergency_save_ticket(payload, db=db)
    assert result["status"] == "failed"
    assert "error" in result  # router.py:497 -> {"status": "failed", "error": str(e)}
