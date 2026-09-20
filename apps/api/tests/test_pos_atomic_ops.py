"""v22 (FASE 1): tests de las operaciones atómicas por ítem del POS.

Cubre [`add_item_to_ticket`](apps/api/modules/pos/service.py:351),
[`update_item_quantity`](apps/api/modules/pos/service.py:444),
[`remove_item_from_ticket`](apps/api/modules/pos/service.py:490) y el guard de
versión de [`create_ticket`](apps/api/modules/pos/service.py:32).

Regla de oro: NUNCA se toca el POS. Solo se insertan/borran filas propias
(prefijo `TEST_V22_ATOMIC_`), con `_limpiar()` idempotente.

Orden de borrado (inverso a las FKs) — D4 + D6 + A14 + D18:
  TicketItemComponent -> TicketItem -> WarehouseEvent -> Order -> Ticket
  -> TerminalSession -> Product -> TerminalLock
"""
import pytest
import pytest_asyncio
from sqlalchemy import delete, select

from core.database import AsyncSessionLocal
# Importar TODOS los modelos que participan en relaciones del Ticket
from modules.cash import models as _cash_models  # noqa: F401
from modules.pos import models as pos_models
from modules.pos import service as pos_service
from modules.pos import schemas as pos_schemas
from modules.warehouse import models as _wh_models  # noqa: F401
from modules.orders import models as _orders_models  # noqa: F401
from modules.catalog import models as _catalog_models
from modules.heladeria import models as _hel_models  # noqa: F401

ACC_PREFIX = "TEST_V22_ATOMIC_"
# D26: el SKU_PREFIX debe ser ESPECÍFICO de este archivo (no "TEST_V22_"), para que
# _limpiar() no borre productos de los otros 3 archivos (regla de oro: cada archivo
# limpia SOLO sus filas). "TEST_V22_" colisionaría con EMERG_/CHECKOUT_/OCCUPANCY_.
SKU_PREFIX = "TEST_V22_ATOMIC_"
TERM_1 = "TEST_V22_ATOMIC_T1"
TERM_2 = "TEST_V22_ATOMIC_T2"


async def _limpiar(db):
    """Borra las filas de prueba en orden inverso a las FKs (D4 + D6 + A14 + D18)."""
    # 1. TicketItemComponent (heladería) -> referencia TicketItem
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
    # 2. TicketItem -> referencia Ticket y Product
    await db.execute(
        delete(pos_models.TicketItem).where(
            pos_models.TicketItem.ticket_id.in_(
                select(pos_models.Ticket.id).where(
                    pos_models.Ticket.account_num.like(f"{ACC_PREFIX}%")
                )
            )
        )
    )
    # 3. WarehouseEvent -> referencia Ticket (A14: ANTES que Ticket)
    await db.execute(
        delete(_wh_models.WarehouseEvent).where(
            _wh_models.WarehouseEvent.ticket_id.in_(
                select(pos_models.Ticket.id).where(
                    pos_models.Ticket.account_num.like(f"{ACC_PREFIX}%")
                )
            )
        )
    )
    # 4. Order -> referencia Ticket (A14: ANTES que Ticket)
    await db.execute(
        delete(_orders_models.Order).where(
            _orders_models.Order.ticket_id.in_(
                select(pos_models.Ticket.id).where(
                    pos_models.Ticket.account_num.like(f"{ACC_PREFIX}%")
                )
            )
        )
    )
    # 5. Ticket (A14: DESPUÉS de WarehouseEvent y Order)
    await db.execute(
        delete(pos_models.Ticket).where(
            pos_models.Ticket.account_num.like(f"{ACC_PREFIX}%")
        )
    )
    # 6. TerminalSession
    await db.execute(
        delete(pos_models.TerminalSession).where(
            pos_models.TerminalSession.terminal_id.like(f"{ACC_PREFIX}%")
        )
    )
    # 7. Product -> referencia por TicketItem (M3)
    await db.execute(
        delete(_catalog_models.Product).where(
            _catalog_models.Product.sku.like(f"{SKU_PREFIX}%")
        )
    )
    # 8. TerminalLock
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
async def sesion_inactiva(db):
    s = pos_models.TerminalSession(terminal_id=TERM_2, is_active=False)
    db.add(s)
    await db.commit()
    await db.refresh(s)
    return s


@pytest_asyncio.fixture
async def producto_activo(db):
    p = _catalog_models.Product(
        sku=f"{SKU_PREFIX}ATOMIC_PROD", name="Test Activo", price=10.0, active=True
    )
    db.add(p)
    await db.commit()
    await db.refresh(p)
    return p


@pytest_asyncio.fixture
async def producto_inactivo(db):
    p = _catalog_models.Product(
        sku=f"{SKU_PREFIX}ATOMIC_INACT", name="Test Inactivo", price=10.0, active=False
    )
    db.add(p)
    await db.commit()
    await db.refresh(p)
    return p


def _payload_add(account_num, product_id, session_id, quantity=1, version=None):
    return pos_schemas.TicketItemAdd(
        account_num=account_num,
        product_id=product_id,
        quantity=quantity,
        session_id=session_id,
        version=version,
    )


# --- Test #1 (D7 + A12 + D17): add_item crea ticket DRAFT con version=2 y terminal_id ---
@pytest.mark.asyncio
async def test_01_add_item_crea_ticket_draft(db, sesion_activa, producto_activo):
    acc = f"{ACC_PREFIX}001"
    result = await pos_service.POSService().add_item_to_ticket(
        db, _payload_add(acc, producto_activo.id, sesion_activa.id, quantity=2)
    )
    # Aserciones explícitas (D7): status DRAFT
    assert result["status"] == "DRAFT"
    # D17: el ticket se CREA con version=1 (service.py:386) pero se INCREMENTA a 2
    # (service.py:434) antes de retornar. La respuesta lee la versión commiteada
    # (service.py:287) -> 2, NO 1. Citar la 386 sin leer la 434 es el error que la
    # regla v22.4 prohíbe.
    assert result["version"] == 2
    # A12: el total debe ser float (service.py:288 -> float(row.total)), no Decimal
    assert isinstance(result["total"], float)
    assert result["total"] == 20.0
    # Verificar en DB el terminal_id (fallback a session.terminal_id)
    ticket = (
        await db.execute(select(pos_models.Ticket).where(pos_models.Ticket.account_num == acc))
    ).scalars().first()
    assert ticket.status == "DRAFT"
    assert ticket.version == 2  # D17: 1 (creación) + 1 (incremento) = 2
    assert ticket.terminal_id == TERM_1


# --- Test #2 (D12 + A16): add_item a ticket existente incrementa cantidad ---
@pytest.mark.asyncio
async def test_02_add_item_incrementa_cantidad(db, sesion_activa, producto_activo):
    acc = f"{ACC_PREFIX}002"
    # D27: add_item_to_ticket hace db.expire_all() (service.py:441) ANTES de
    # retornar. Eso EXPIRA los objetos de las fixtures (producto_activo,
    # sesion_activa); acceder a .id DESPUÉS de la 1ª llamada dispara un lazy-load
    # fuera del greenlet -> MissingGreenlet. Capturar los IDs ANTES.
    pid = producto_activo.id
    sid = sesion_activa.id
    svc = pos_service.POSService()
    r1 = await svc.add_item_to_ticket(db, _payload_add(acc, pid, sid, 1))
    # D12: leer la versión real de la 1ª llamada (no hardcodear 2)
    result = await svc.add_item_to_ticket(
        db, _payload_add(acc, pid, sid, 2, version=r1["version"])
    )
    assert result["total"] == 30.0  # 3 unidades * 10
    # A16: filtrar por ticket_id (no solo por product_id) para no capturar el item
    # de otro ticket que comparta el mismo producto.
    ticket_id = (
        await db.execute(
            select(pos_models.Ticket.id).where(pos_models.Ticket.account_num == acc)
        )
    ).scalar_one()
    item = (
        await db.execute(
            select(pos_models.TicketItem).where(
                pos_models.TicketItem.ticket_id == ticket_id,
                pos_models.TicketItem.product_id == pid,
            )
        )
    ).scalars().first()
    assert item.quantity == 3


# --- Test #3: add_item recalcula total ---
@pytest.mark.asyncio
async def test_03_add_item_recalcula_total(db, sesion_activa, producto_activo):
    acc = f"{ACC_PREFIX}003"
    result = await pos_service.POSService().add_item_to_ticket(
        db, _payload_add(acc, producto_activo.id, sesion_activa.id, 5)
    )
    assert result["total"] == 50.0


# --- Test #4 (D17): add_item incrementa version en 1 (1ª llamada -> 2, 2ª -> 3) ---
@pytest.mark.asyncio
async def test_04_add_item_incrementa_version(db, sesion_activa, producto_activo):
    acc = f"{ACC_PREFIX}004"
    # D27: capturar los IDs ANTES (add_item_to_ticket hace db.expire_all()).
    pid = producto_activo.id
    sid = sesion_activa.id
    svc = pos_service.POSService()
    r1 = await svc.add_item_to_ticket(db, _payload_add(acc, pid, sid, 1))
    # D17: la 1ª llamada crea con version=1 (service.py:386) y la incrementa a 2
    # (service.py:434) -> la respuesta es 2, NO 1.
    assert r1["version"] == 2
    # La 2ª llamada debe pasar la versión REAL (2), no un hardcode.
    r2 = await svc.add_item_to_ticket(
        db, _payload_add(acc, pid, sid, 1, version=r1["version"])
    )
    assert r2["version"] == 3  # 2 + 1


# --- Test #5: add_item con versión obsoleta -> 409 ---
@pytest.mark.asyncio
async def test_05_add_item_version_obsoleta_409(db, sesion_activa, producto_activo):
    from fastapi import HTTPException
    acc = f"{ACC_PREFIX}005"
    # D27: capturar los IDs ANTES (add_item_to_ticket hace db.expire_all()).
    pid = producto_activo.id
    sid = sesion_activa.id
    svc = pos_service.POSService()
    await svc.add_item_to_ticket(db, _payload_add(acc, pid, sid, 1))
    with pytest.raises(HTTPException) as exc:
        await svc.add_item_to_ticket(
            db, _payload_add(acc, pid, sid, 1, version=99)
        )
    assert exc.value.status_code == 409


# --- Test #6: add_item a ticket PAID -> 400 ---
@pytest.mark.asyncio
async def test_06_add_item_ticket_paid_400(db, sesion_activa, producto_activo):
    from fastapi import HTTPException
    acc = f"{ACC_PREFIX}006"
    t = pos_models.Ticket(
        account_num=acc, status="PAID", version=1, total=0,
        session_id=sesion_activa.id, terminal_id=TERM_1,
    )
    db.add(t)
    await db.commit()
    with pytest.raises(HTTPException) as exc:
        await pos_service.POSService().add_item_to_ticket(
            db, _payload_add(acc, producto_activo.id, sesion_activa.id, 1)
        )
    assert exc.value.status_code == 400


# --- Test #7: add_item con producto inexistente -> 404 ---
@pytest.mark.asyncio
async def test_07_add_item_producto_inexistente_404(db, sesion_activa):
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc:
        await pos_service.POSService().add_item_to_ticket(
            db, _payload_add(f"{ACC_PREFIX}007", 99999999, sesion_activa.id, 1)
        )
    assert exc.value.status_code == 404


# --- Test #8: add_item con producto inactivo -> 400 ---
@pytest.mark.asyncio
async def test_08_add_item_producto_inactivo_400(db, sesion_activa, producto_inactivo):
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc:
        await pos_service.POSService().add_item_to_ticket(
            db, _payload_add(f"{ACC_PREFIX}008", producto_inactivo.id, sesion_activa.id, 1)
        )
    assert exc.value.status_code == 400


# --- Test #9 (A15): update_quantity cambia cantidad y subtotal ---
@pytest.mark.asyncio
async def test_09_update_quantity_cambia_subtotal(db, sesion_activa, producto_activo):
    acc = f"{ACC_PREFIX}009"
    # D27: capturar los IDs ANTES (add_item_to_ticket hace db.expire_all()).
    pid = producto_activo.id
    sid = sesion_activa.id
    svc = pos_service.POSService()
    r1 = await svc.add_item_to_ticket(db, _payload_add(acc, pid, sid, 1))
    # A15: pasar la versión REAL (r1["version"] == 2), no un hardcode 1 -> 409.
    result = await svc.update_item_quantity(
        db,
        pos_schemas.TicketItemUpdate(
            account_num=acc, product_id=pid, new_quantity=4, version=r1["version"]
        ),
    )
    assert result["total"] == 40.0


# --- Test #10: update_quantity con versión obsoleta -> 409 ---
@pytest.mark.asyncio
async def test_10_update_quantity_version_obsoleta_409(db, sesion_activa, producto_activo):
    from fastapi import HTTPException
    acc = f"{ACC_PREFIX}010"
    # D27: capturar los IDs ANTES (add_item_to_ticket hace db.expire_all()).
    pid = producto_activo.id
    sid = sesion_activa.id
    svc = pos_service.POSService()
    await svc.add_item_to_ticket(db, _payload_add(acc, pid, sid, 1))
    with pytest.raises(HTTPException) as exc:
        await svc.update_item_quantity(
            db,
            pos_schemas.TicketItemUpdate(
                account_num=acc, product_id=pid, new_quantity=2, version=99
            ),
        )
    assert exc.value.status_code == 409


# --- Test #11 (A15): remove_item elimina y recalcula total ---
@pytest.mark.asyncio
async def test_11_remove_item_recalcula_total(db, sesion_activa, producto_activo):
    acc = f"{ACC_PREFIX}011"
    # D27: capturar los IDs ANTES (add_item_to_ticket hace db.expire_all()).
    pid = producto_activo.id
    sid = sesion_activa.id
    svc = pos_service.POSService()
    r1 = await svc.add_item_to_ticket(db, _payload_add(acc, pid, sid, 3))
    # A15: pasar la versión REAL (r1["version"] == 2), no un hardcode 1 -> 409.
    result = await svc.remove_item_from_ticket(
        db,
        pos_schemas.TicketItemRemove(
            account_num=acc, product_id=pid, version=r1["version"]
        ),
    )
    assert result["total"] == 0.0


# --- Test #12 (A15): remove_item con producto que no está en el ticket -> 404 ---
@pytest.mark.asyncio
async def test_12_remove_item_no_esta_en_ticket_404(db, sesion_activa, producto_activo):
    from fastapi import HTTPException
    acc = f"{ACC_PREFIX}012"
    svc = pos_service.POSService()
    r1 = await svc.add_item_to_ticket(db, _payload_add(acc, producto_activo.id, sesion_activa.id, 1))
    # A15: el guard de versión (service.py:505) corre ANTES de la búsqueda del item
    # (service.py:509). Pasar la versión REAL (2) para que el guard pase y el 404
    # provenga de la búsqueda, no del 409.
    with pytest.raises(HTTPException) as exc:
        await svc.remove_item_from_ticket(
            db,
            pos_schemas.TicketItemRemove(
                account_num=acc, product_id=99999999, version=r1["version"]
            ),
        )
    assert exc.value.status_code == 404


# --- Test #13: add_item con sesión inactiva (ticket nuevo) -> 400 ---
@pytest.mark.asyncio
async def test_13_add_item_sesion_inactiva_400(db, sesion_inactiva, producto_activo):
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc:
        await pos_service.POSService().add_item_to_ticket(
            db, _payload_add(f"{ACC_PREFIX}013", producto_activo.id, sesion_inactiva.id, 1)
        )
    assert exc.value.status_code == 400


# --- Test #14 (D8): create_ticket con versión obsoleta -> 409 ---
# Para llegar al guard de versión hay que pasar los 3 guards previos:
#   1. _get_items_and_total (producto válido y activo)  -> OK
#   2. Ticket PAID                                       -> el ticket es OPEN, no PAID
#   3. DRAFT GUARD (DRAFT + payload PAID + terminal !=)  -> el ticket es OPEN, no DRAFT
# Por eso: ticket OPEN + payload status="OPEN" + version=99.
@pytest.mark.asyncio
async def test_14_create_ticket_version_obsoleta_409(db, sesion_activa, producto_activo):
    from fastapi import HTTPException
    acc = f"{ACC_PREFIX}014"
    t = pos_models.Ticket(
        account_num=acc, status="OPEN", version=1, total=0,
        session_id=sesion_activa.id, terminal_id=TERM_1,
    )
    db.add(t)
    await db.commit()
    payload = pos_schemas.TicketCreate(
        account_num=acc,
        session_id=sesion_activa.id,
        status="OPEN",
        version=99,
        items=[pos_schemas.TicketItemCreate(product_id=producto_activo.id, quantity=1)],
    )
    with pytest.raises(HTTPException) as exc:
        await pos_service.POSService().create_ticket(db, payload)
    assert exc.value.status_code == 409
    # M10: verificar el detail del 409 (service.py:129-135)
    assert "versión" in exc.value.detail.lower()
