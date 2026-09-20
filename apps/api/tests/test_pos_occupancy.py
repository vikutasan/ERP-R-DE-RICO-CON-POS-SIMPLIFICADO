"""
test_pos_occupancy.py - v22.6: Tests del lock de terminales.

Cubre occupancy.py: lock_terminal (adquisición + renovación de TTL),
unlock_terminal, force_unlock, heartbeat.
El lock evita que dos cajeros operen la misma caja simultáneamente.

Regla de oro: prefijo TEST_V22_OCC_ y limpieza idempotente.
"""
import pytest
import pytest_asyncio
from sqlalchemy import delete, select

from core.database import AsyncSessionLocal
from modules.cash import models as _cash_models  # noqa: F401
from modules.pos import models as pos_models
from modules.pos import occupancy
from modules.warehouse import models as _wh_models  # noqa: F401
from modules.orders import models as _orders_models  # noqa: F401
from modules.catalog import models as _catalog_models  # noqa: F401
from modules.heladeria import models as _hel_models  # noqa: F401

TERM_1 = "TEST_V22_OCC_T1"
TERM_2 = "TEST_V22_OCC_T2"


async def _limpiar(db):
    """Solo TerminalLock y TerminalSession (los demás no se tocan en esta fase)."""
    await db.execute(
        delete(pos_models.TerminalLock).where(
            pos_models.TerminalLock.terminal_id.like("TEST_V22_OCC_%")
        )
    )
    await db.execute(
        delete(pos_models.TerminalSession).where(
            pos_models.TerminalSession.terminal_id.like("TEST_V22_OCC_%")
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


# --- Test #1: lock_terminal adquiere el lock ---
@pytest.mark.asyncio
async def test_01_lock_terminal_adquiere(db):
    ok = await occupancy.lock_terminal(db, TERM_1, occupier_id=1, occupier_name="Cajero A")
    assert ok is True
    lock = (
        await db.execute(
            select(pos_models.TerminalLock).where(pos_models.TerminalLock.terminal_id == TERM_1)
        )
    ).scalars().first()
    assert lock is not None
    assert lock.occupier_id == 1


# --- Test #2: segundo lock del mismo terminal por otro usuario -> False ---
@pytest.mark.asyncio
async def test_02_lock_terminal_ocupado_devuelve_false(db):
    await occupancy.lock_terminal(db, TERM_1, occupier_id=1, occupier_name="Cajero A")
    ok = await occupancy.lock_terminal(db, TERM_1, occupier_id=2, occupier_name="Cajero B")
    assert ok is False


# --- Test #3: unlock_terminal libera el lock ---
@pytest.mark.asyncio
async def test_03_unlock_terminal_libera(db):
    await occupancy.lock_terminal(db, TERM_1, occupier_id=1, occupier_name="Cajero A")
    ok = await occupancy.unlock_terminal(db, TERM_1, occupier_id=1)
    assert ok is True
    lock = (
        await db.execute(
            select(pos_models.TerminalLock).where(pos_models.TerminalLock.terminal_id == TERM_1)
        )
    ).scalars().first()
    assert lock is None


# --- Test #4: force_unlock libera el lock de otro usuario ---
@pytest.mark.asyncio
async def test_04_force_unlock_libera_de_otro(db):
    await occupancy.lock_terminal(db, TERM_1, occupier_id=1, occupier_name="Cajero A")
    await occupancy.force_unlock(db, TERM_1)
    lock = (
        await db.execute(
            select(pos_models.TerminalLock).where(pos_models.TerminalLock.terminal_id == TERM_1)
        )
    ).scalars().first()
    assert lock is None


# --- Test #5 (D16 + M13): el MISMO ocupante renueva el TTL -> True ---
@pytest.mark.asyncio
async def test_05_lock_terminal_mismo_ocupante_renueva_ttl(db):
    from datetime import timedelta
    from core.timestamps import utcnow
    # 1ª adquisición
    ok1 = await occupancy.lock_terminal(db, TERM_1, occupier_id=1, occupier_name="Cajero A")
    assert ok1 is True
    lock1 = (
        await db.execute(
            select(pos_models.TerminalLock).where(pos_models.TerminalLock.terminal_id == TERM_1)
        )
    ).scalars().first()
    # M13: forzar un locked_at VIEJO para que la renovación sea observable.
    # Sin esto, `>=` sería siempre verdadero (falso verde: no prueba la renovación).
    locked_at_viejo = utcnow() - timedelta(minutes=10)
    lock1.locked_at = locked_at_viejo
    await db.commit()
    # 2ª llamada del MISMO ocupante -> rama de renovación (occupancy.py:57-61)
    ok2 = await occupancy.lock_terminal(db, TERM_1, occupier_id=1, occupier_name="Cajero A")
    assert ok2 is True
    lock2 = (
        await db.execute(
            select(pos_models.TerminalLock).where(pos_models.TerminalLock.terminal_id == TERM_1)
        )
    ).scalars().first()
    # M13: `>` (estricto) prueba que la renovación ocurrió; `>=` no probaría nada.
    assert lock2.locked_at > locked_at_viejo


# --- Test #6 (D16): heartbeat renueva el lock del ocupante ---
@pytest.mark.asyncio
async def test_06_heartbeat_renueva_lock(db):
    await occupancy.lock_terminal(db, TERM_1, occupier_id=1, occupier_name="Cajero A")
    ok = await occupancy.heartbeat(db, TERM_1, occupier_id=1)
    assert ok is True
    lock = (
        await db.execute(
            select(pos_models.TerminalLock).where(pos_models.TerminalLock.terminal_id == TERM_1)
        )
    ).scalars().first()
    assert lock is not None
    assert lock.occupier_id == 1
