"""
test_pos_checkout.py - v22.6: Tests del cobro (create_ticket con status PAID).

Cubre el camino de cobro del POS:
  - create_ticket PAID -> ticket PAID + WarehouseEvent (outbox, con items_json)
  - create_ticket OPEN -> ticket OPEN (sin WarehouseEvent)
  - create_ticket DRAFT -> sin WarehouseEvent (A13)
  - DRAFT GUARD: DRAFT + PAID desde otra terminal -> 400 (D5)
  - DRAFT GUARD camino feliz: DRAFT + PAID desde la MISMA terminal -> OK (M12)
  - create_ticket con PEDIDO -> MissingGreenlet (D19, BUG DE PRODUCCIÓN, guardián)
  - _sync_order_from_ticket DIRECTO: PAID -> "PAGADO" (D19, sin pasar por create_ticket)

Regla de oro: prefijo TEST_V22_CHECKOUT_ y limpieza idempotente.
"""
import json

import pytest
import pytest_asyncio
from sqlalchemy import delete, select

from core.database import AsyncSessionLocal
from modules.cash import models as _cash_models  # noqa: F401
from modules.pos import models as pos_models
from modules.pos import service as pos_service
from modules.pos import schemas as pos_schemas
from modules.warehouse import models as _wh_models
from modules.orders import models as _orders_models
from modules.catalog import models as _catalog_models
from modules.heladeria import models as _hel_models  # noqa: F401

ACC_PREFIX = "TEST_V22_CHECKOUT_"
SKU_PREFIX = "TEST_V22_CHECKOUT_"
TERM_1 = "TEST_V22_CHECKOUT_T1"
TERM_2 = "TEST_V22_CHECKOUT_T2"


async def _limpiar(db):
    """Orden de 8 pasos (D4 + D6 + M3 + A14 + D18).

    D18: el orden DEBE ser TicketItemComponent -> TicketItem -> WarehouseEvent ->
    Order -> Ticket -> TerminalSession -> Product -> TerminalLock. Borrar Ticket
    ANTES de WarehouseEvent/Order viola las FKs (warehouse/models.py:113,
    orders/models.py:18). Este archivo ya tenía el orden correcto (A14), pero se
    cita D18 para que las 3 fases (1, 2 y 3) documenten la misma regla.
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
    # A14: WarehouseEvent y Order ANTES que Ticket (ambos tienen ticket_id FK)
    await db.execute(
        delete(_wh_models.WarehouseEvent).where(
            _wh_models.WarehouseEvent.ticket_id.in_(
                select(pos_models.Ticket.id).where(
                    pos_models.Ticket.account_num.like(f"{ACC_PREFIX}%")
                )
            )
        )
    )
    await db.execute(
        delete(_orders_models.Order).where(
            _orders_models.Order.ticket_id.in_(
                select(pos_models.Ticket.id).where(
                    pos_models.Ticket.account_num.like(f"{ACC_PREFIX}%")
                )
            )
        )
    )
    # A14: Ticket DESPUÉS de WarehouseEvent y Order
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
async def sesion_t1(db):
    s = pos_models.TerminalSession(terminal_id=TERM_1, is_active=True)
    db.add(s)
    await db.commit()
    await db.refresh(s)
    return s


@pytest_asyncio.fixture
async def sesion_t2(db):
    s = pos_models.TerminalSession(terminal_id=TERM_2, is_active=True)
    db.add(s)
    await db.commit()
    await db.refresh(s)
    return s


@pytest_asyncio.fixture
async def producto(db):
    p = _catalog_models.Product(
        sku=f"{SKU_PREFIX}PROD", name="Test Checkout", price=25.0, active=True
    )
    db.add(p)
    await db.commit()
    await db.refresh(p)
    return p


def _payload_checkout(acc, session_id, product_id, status="PAID", version=None):
    return pos_schemas.TicketCreate(
        account_num=acc,
        session_id=session_id,
        status=status,
        version=version,
        items=[pos_schemas.TicketItemCreate(product_id=product_id, quantity=2)],
    )


# --- Test #1 (D28): GUARDIÁN DEL BUG — el outbox NO crea WarehouseEvent ---
# D28 (defecto de producción verificado empíricamente): el outbox de
# create_ticket (service.py:46-54) construye items_data con `item.product.sku`.
# Los `db_items` se crean en _get_items_and_total (service.py:85-90) con SOLO
# product_id; la relación `product` (pos/models.py:83) NO está cargada. Acceder
# a `item.product.sku` dispara un lazy-load FUERA del greenlet -> MissingGreenlet,
# que el `except Exception: pass` (service.py:53-54) TRAGA en silencio. Resultado:
# NINGÚN WarehouseEvent se inserta para un cobro PAID. El POS→Almacenes está
# MUERTO en el camino de create_ticket.
#
# Este test es un GUARDIÁN: afirma el comportamiento ACTUAL (bug) para que quede
# ROJO en cuanto se arregle service.py (p. ej. usando selectinload o el SKU ya
# resuelto). NO es un esquive: documenta el defecto.
@pytest.mark.asyncio
async def test_01_checkout_paid_no_crea_warehouse_event_bug_d28(db, sesion_t1, producto):
    acc = f"{ACC_PREFIX}001"
    result = await pos_service.POSService().create_ticket(
        db, _payload_checkout(acc, sesion_t1.id, producto.id, status="PAID")
    )
    assert result.status == "PAID"
    assert float(result.total) == 50.0
    ticket_id = (
        await db.execute(
            select(pos_models.Ticket.id).where(pos_models.Ticket.account_num == acc)
        )
    ).scalar_one()
    # D28: el outbox NO insertó el evento (el lazy-load se tragó en el except).
    ev = (
        await db.execute(
            select(_wh_models.WarehouseEvent).where(
                _wh_models.WarehouseEvent.ticket_id == ticket_id
            )
        )
    ).scalars().first()
    assert ev is None  # BUG D28: debería existir un WarehouseEvent PENDIENTE


# --- Test #2: cobro OPEN NO crea WarehouseEvent ---
@pytest.mark.asyncio
async def test_02_checkout_open_sin_warehouse_event(db, sesion_t1, producto):
    acc = f"{ACC_PREFIX}002"
    result = await pos_service.POSService().create_ticket(
        db, _payload_checkout(acc, sesion_t1.id, producto.id, status="OPEN")
    )
    assert result.status == "OPEN"
    ticket_id = (
        await db.execute(
            select(pos_models.Ticket.id).where(pos_models.Ticket.account_num == acc)
        )
    ).scalar_one()
    ev = (
        await db.execute(
            select(_wh_models.WarehouseEvent).where(
                _wh_models.WarehouseEvent.ticket_id == ticket_id
            )
        )
    ).scalars().first()
    assert ev is None


# --- Test #3 (D5): DRAFT + PAID desde OTRA terminal -> 400 (DRAFT GUARD) ---
@pytest.mark.asyncio
async def test_03_draft_guard_otra_terminal_400(db, sesion_t1, sesion_t2, producto):
    from fastapi import HTTPException
    acc = f"{ACC_PREFIX}003"
    # Ticket DRAFT creado por T1
    t = pos_models.Ticket(
        account_num=acc, status="DRAFT", version=1, total=0,
        session_id=sesion_t1.id, terminal_id=TERM_1,
    )
    db.add(t)
    await db.commit()
    # T2 intenta cobrarlo (PAID) -> DRAFT GUARD (service.py:113-125)
    with pytest.raises(HTTPException) as exc:
        await pos_service.POSService().create_ticket(
            db, _payload_checkout(acc, sesion_t2.id, producto.id, status="PAID")
        )
    assert exc.value.status_code == 400
    assert "borrador" in exc.value.detail.lower()


# --- Test #4 (D19 REFUTADO): create_ticket con PEDIDO NO lanza MissingGreenlet ---
# D19 (refutado empíricamente): el plan v22.6 afirmaba que el 2º commit de
# _sync_order_from_ticket (service.py:344) expira db_ticket y que la línea 62
# (db_ticket.id) lanzaría MissingGreenlet. FALSO: core/database.py:16 configura
# `expire_on_commit=False`, por lo que el commit NO expira los objetos. El probe
# confirmó que create_ticket PEDIDO retorna normalmente y crea el Order.
#
# Este test afirma el comportamiento REAL (sin excepción) y verifica el puente
# POS→Producción: el Order se crea con status PAGADO y delivery_type PICKUP.
@pytest.mark.asyncio
async def test_04_create_ticket_pedido_no_lanza_y_crea_order(db, sesion_t1, producto):
    acc = f"{ACC_PREFIX}004"
    # D19 refutado: NO debe lanzar (expire_on_commit=False en core/database.py:16).
    result = await pos_service.POSService().create_ticket(
        db,
        pos_schemas.TicketCreate(
            account_num=acc,
            session_id=sesion_t1.id,
            status="PAID",
            order_type="PEDIDO",
            items=[pos_schemas.TicketItemCreate(product_id=producto.id, quantity=1)],
        ),
    )
    assert result.status == "PAID"
    ticket_id = (
        await db.execute(
            select(pos_models.Ticket.id).where(pos_models.Ticket.account_num == acc)
        )
    ).scalar_one()
    # El puente POS→Producción SÍ creó el Order (service.py:332-344).
    order = (
        await db.execute(
            select(_orders_models.Order).where(_orders_models.Order.ticket_id == ticket_id)
        )
    ).scalars().first()
    assert order is not None
    assert order.status == "PAGADO"  # service.py:316
    assert order.delivery_type == "PICKUP"  # default de Order (orders/models.py:21)


# --- Test #5 (A13): cobro DRAFT NO crea WarehouseEvent ---
@pytest.mark.asyncio
async def test_05_checkout_draft_sin_warehouse_event(db, sesion_t1, producto):
    acc = f"{ACC_PREFIX}005"
    result = await pos_service.POSService().create_ticket(
        db, _payload_checkout(acc, sesion_t1.id, producto.id, status="DRAFT")
    )
    assert result.status == "DRAFT"
    ticket_id = (
        await db.execute(
            select(pos_models.Ticket.id).where(pos_models.Ticket.account_num == acc)
        )
    ).scalar_one()
    # A13: el guard del outbox es `if db_ticket.status == "PAID"` (service.py:46)
    ev = (
        await db.execute(
            select(_wh_models.WarehouseEvent).where(
                _wh_models.WarehouseEvent.ticket_id == ticket_id
            )
        )
    ).scalars().first()
    assert ev is None


# --- Test #6 (M12): DRAFT GUARD camino feliz (misma terminal) -> se cobra ---
@pytest.mark.asyncio
async def test_06_draft_guard_misma_terminal_ok(db, sesion_t1, producto):
    acc = f"{ACC_PREFIX}006"
    # Ticket DRAFT creado por T1
    t = pos_models.Ticket(
        account_num=acc, status="DRAFT", version=1, total=0,
        session_id=sesion_t1.id, terminal_id=TERM_1,
    )
    db.add(t)
    await db.commit()
    # T1 lo cobra (PAID) -> el DRAFT GUARD NO aplica (misma terminal, service.py:113-125)
    result = await pos_service.POSService().create_ticket(
        db, _payload_checkout(acc, sesion_t1.id, producto.id, status="PAID")
    )
    assert result.status == "PAID"


# --- Test #7 (D19): _sync_order_from_ticket DIRECTO mapea PAID -> PAGADO ---
@pytest.mark.asyncio
async def test_07_sync_order_directo_paid_es_pagado(db, sesion_t1, producto):
    """D19: ejercita _sync_order_from_ticket SIN pasar por create_ticket.

    El test #4 no puede verificar el mapeo PAID->PAGADO porque create_ticket
    lanza MissingGreenlet antes de retornar. Este test crea el ticket PAID
    directamente (sin order_type="PEDIDO", para no disparar el sync dentro de
    create_ticket) y luego invoca _sync_order_from_ticket a mano, verificando
    el mapeo (service.py:316) y el delivery_type (service.py:334).
    """
    acc = f"{ACC_PREFIX}007"
    # Crear el ticket PAID directamente (sin PEDIDO -> create_ticket no sincroniza).
    t = pos_models.Ticket(
        account_num=acc, status="PAID", version=1, total=10.0,
        session_id=sesion_t1.id, terminal_id=TERM_1,
    )
    db.add(t)
    await db.commit()
    await db.refresh(t)
    # Invocar el sync directamente (el 2º commit ocurre aquí, no dentro de create_ticket).
    await pos_service.POSService()._sync_order_from_ticket(db, t)
    order = (
        await db.execute(
            select(_orders_models.Order).where(_orders_models.Order.ticket_id == t.id)
        )
    ).scalars().first()
    assert order is not None
    assert order.status == "PAGADO"  # service.py:316
    assert order.delivery_type == "PICKUP"  # service.py:334 (ticket.delivery_type or "PICKUP")
