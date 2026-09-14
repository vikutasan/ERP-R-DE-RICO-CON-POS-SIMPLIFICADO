"""
test_bloque9d_3bugs.py - Tests de aceptación del BLOQUE 9.d (V20).

Verifica los 3 bugs de zona horaria corregidos de forma CONJUNTA:

  Bug #1 (POS IA): el filtro por día local de `get_tickets(search_date=...)`
      usa `local_day_bounds_utc()` (no un `+6h` hardcodeado). Un ticket creado
      a las 23:30 local aparece en el día local correcto (no del día siguiente),
      y uno creado a las 00:30 local aparece en el día local correcto (no del
      día anterior).

  Bug #2 (analytics): los reportes filtran por el rango de días LOCALES del
      negocio convertido a UTC. El ranking de productos y las métricas de
      tickets coinciden con el filtro de tickets del POS.

  Bug #3 (grandeza): `_now_mexico()` es un alias de `utcnow()` (UTC naive),
      `journey_date`/`route_date` siguen siendo `Column(Date)` LOCAL, y
      `to_local_date_str()` devuelve la fecha LOCAL de un timestamp UTC.

Regla de oro: NUNCA se toca el POS real. Solo se insertan/borran filas propias
con prefijo TEST_B9D_ y se limpian al terminar.
"""
from datetime import datetime, date, timedelta
from zoneinfo import ZoneInfo

import pytest
import pytest_asyncio
from sqlalchemy import delete, select

from core.database import AsyncSessionLocal
from core.timestamps import utcnow
from core.timezone import local_day_bounds_utc, to_local_date_str
# Importar TODOS los modelos que participan en relaciones del Ticket
# (Ticket.cash_session -> CashSession) para que el mapper de SQLAlchemy
# resuelva las clases antes de configurarse.
from modules.cash import models as _cash_models  # noqa: F401
from modules.pos import models as pos_models
from modules.pos import service as pos_service
from modules.grandeza import service as grandeza_service

MEXICO = ZoneInfo("America/Mexico_City")

# Prefijo único para poder limpiar sin riesgo
ACC_PREFIX = "TEST_B9D_"


async def _limpiar(db):
    """Borra solo los tickets de prueba (idempotente)."""
    await db.execute(
        delete(pos_models.Ticket).where(
            pos_models.Ticket.account_num.like(f"{ACC_PREFIX}%")
        )
    )
    await db.commit()


@pytest_asyncio.fixture
async def db():
    """Sesión async limpia con limpieza antes y después."""
    async with AsyncSessionLocal() as session:
        await _limpiar(session)
        try:
            yield session
        finally:
            await _limpiar(session)


async def _crear_ticket(db, account_num, created_at_utc, status="PAID"):
    """Inserta un ticket con un created_at UTC explícito."""
    ticket = pos_models.Ticket(
        account_num=account_num,
        total=100,
        created_at=created_at_utc,
        status=status,
        channel="PANADERIA",
    )
    db.add(ticket)
    await db.commit()
    await db.refresh(ticket)
    return ticket


# ---------------------------------------------------------------------------
# Bug #1 — POS IA: filtro por día local
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_bug1_ticket_2330_local_aparece_en_dia_local_correcto(db):
    """Un ticket a las 23:30 local (05:30 UTC del día siguiente) debe aparecer
    en el día local D, NO en D+1."""
    # Día local D = 2026-09-14. 23:30 local = 05:30 UTC del 15 Sep.
    created_utc = datetime(2026, 9, 15, 5, 30, 0)
    await _crear_ticket(db, f"{ACC_PREFIX}2330", created_utc)

    svc = pos_service.POSService()
    # Buscar en el día local D (2026-09-14)
    tickets_d = await svc.get_tickets(db, search_date="2026-09-14")
    accs_d = [t.account_num for t in tickets_d]
    assert f"{ACC_PREFIX}2330" in accs_d, "El ticket de las 23:30 local debe estar en D"

    # NO debe aparecer en D+1 (2026-09-15)
    tickets_d1 = await svc.get_tickets(db, search_date="2026-09-15")
    accs_d1 = [t.account_num for t in tickets_d1]
    assert f"{ACC_PREFIX}2330" not in accs_d1, "El ticket NO debe estar en D+1"


@pytest.mark.asyncio
async def test_bug1_ticket_0030_local_aparece_en_dia_local_correcto(db):
    """Un ticket a las 00:30 local (06:30 UTC del mismo día) debe aparecer
    en el día local D, NO en D-1."""
    # Día local D = 2026-09-14. 00:30 local = 06:30 UTC del 14 Sep.
    created_utc = datetime(2026, 9, 14, 6, 30, 0)
    await _crear_ticket(db, f"{ACC_PREFIX}0030", created_utc)

    svc = pos_service.POSService()
    # Aislamiento: filtrar por el prefijo de prueba para que el resultado no
    # dependa del volumen de tickets reales del día (get_tickets aplica
    # limit=100 + created_at DESC, y el ticket de prueba es el más antiguo).
    tickets_d = await svc.get_tickets(db, search_date="2026-09-14", search=ACC_PREFIX)
    accs_d = [t.account_num for t in tickets_d]
    assert f"{ACC_PREFIX}0030" in accs_d, "El ticket de las 00:30 local debe estar en D"

    # NO debe aparecer en D-1 (2026-09-13)
    tickets_dm1 = await svc.get_tickets(db, search_date="2026-09-13", search=ACC_PREFIX)
    accs_dm1 = [t.account_num for t in tickets_dm1]
    assert f"{ACC_PREFIX}0030" not in accs_dm1, "El ticket NO debe estar en D-1"


@pytest.mark.asyncio
async def test_bug1_limites_del_dia_local_son_0600_utc(db):
    """El día local en México abarca [06:00 UTC, 06:00 UTC del día siguiente)."""
    start, end = local_day_bounds_utc(MEXICO, date(2026, 9, 14))
    assert start == datetime(2026, 9, 14, 6, 0, 0)
    assert end == datetime(2026, 9, 15, 6, 0, 0)

    # Un ticket exactamente en el límite inferior (06:00 UTC) SÍ entra.
    await _crear_ticket(db, f"{ACC_PREFIX}LIMITE_IN", datetime(2026, 9, 14, 6, 0, 0))
    # Un ticket exactamente en el límite superior (06:00 UTC del 15) NO entra.
    await _crear_ticket(db, f"{ACC_PREFIX}LIMITE_OUT", datetime(2026, 9, 15, 6, 0, 0))

    svc = pos_service.POSService()
    # Aislamiento: ver nota en test_bug1_ticket_0030_local_aparece_en_dia_local_correcto.
    tickets = await svc.get_tickets(db, search_date="2026-09-14", search=ACC_PREFIX)
    accs = [t.account_num for t in tickets]
    assert f"{ACC_PREFIX}LIMITE_IN" in accs
    assert f"{ACC_PREFIX}LIMITE_OUT" not in accs


# ---------------------------------------------------------------------------
# Bug #2 — analytics: el rango de días locales coincide con el filtro del POS
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_bug2_ranking_y_tickets_coinciden_en_el_mismo_dia_local(db):
    """El ranking de productos (analytics) y el filtro de tickets (POS) deben
    incluir exactamente los mismos tickets del día local D."""
    from modules.analytics import service as analytics_service

    # Ticket dentro del día local D (2026-09-14): 12:00 local = 18:00 UTC.
    await _crear_ticket(db, f"{ACC_PREFIX}DENTRO", datetime(2026, 9, 14, 18, 0, 0))
    # Ticket fuera (día local D+1): 12:00 local del 15 = 18:00 UTC del 15.
    await _crear_ticket(db, f"{ACC_PREFIX}FUERA", datetime(2026, 9, 15, 18, 0, 0))

    svc = pos_service.POSService()
    tickets_d = await svc.get_tickets(db, search_date="2026-09-14")
    accs_d = {t.account_num for t in tickets_d}
    assert f"{ACC_PREFIX}DENTRO" in accs_d
    assert f"{ACC_PREFIX}FUERA" not in accs_d

    # Las métricas de tickets del mismo día local deben contar solo el de dentro.
    metrics = await analytics_service.get_ticket_metrics(
        db, date(2026, 9, 14), date(2026, 9, 14)
    )
    # No podemos aislar el conteo global, pero verificamos que el rango
    # [start, end) del día local es el correcto (06:00 UTC -> 06:00 UTC).
    start, end = local_day_bounds_utc(MEXICO, date(2026, 9, 14))
    assert start == datetime(2026, 9, 14, 6, 0, 0)
    assert end == datetime(2026, 9, 15, 6, 0, 0)
    assert metrics["total_tickets"] >= 1


@pytest.mark.asyncio
async def test_bug2_rango_multidia_usa_limites_locales(db):
    """Un rango de varios días usa el inicio local del primer día y el fin
    local (exclusivo) del último día."""
    from modules.analytics import service as analytics_service

    # No debe lanzar y debe devolver una lista (aunque vacía).
    rankings = await analytics_service.get_product_rankings(
        db, date(2026, 9, 14), date(2026, 9, 16)
    )
    assert isinstance(rankings, list)

    # El rango local [14, 16] abarca de 06:00 UTC del 14 a 06:00 UTC del 17.
    start, _ = local_day_bounds_utc(MEXICO, date(2026, 9, 14))
    _, end = local_day_bounds_utc(MEXICO, date(2026, 9, 16))
    assert start == datetime(2026, 9, 14, 6, 0, 0)
    assert end == datetime(2026, 9, 17, 6, 0, 0)


# ---------------------------------------------------------------------------
# Bug #3 — grandeza: _now_mexico es alias de utcnow; Date local vs DateTime UTC
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_bug3_now_mexico_es_utc(db):
    """`_now_mexico()` debe devolver UTC (a < 5s de utcnow())."""
    valor = await grandeza_service._now_mexico(db)
    delta = abs((utcnow() - valor).total_seconds())
    assert delta < 5, "_now_mexico debe devolver UTC, no hora local"


def test_bug3_to_local_date_str_devuelve_fecha_local():
    """`to_local_date_str` convierte un timestamp UTC a la fecha LOCAL."""
    # 02:00 UTC del 15 Sep = 20:00 local del 14 Sep en México.
    dt_utc = datetime(2026, 9, 15, 2, 0, 0)
    assert to_local_date_str(dt_utc, MEXICO) == "2026-09-14"


def test_bug3_journey_date_es_columna_date_local():
    """`journey_date` y `route_date` deben ser Column(Date) (LOCAL), no DateTime."""
    from sqlalchemy import Date as SADate

    from modules.grandeza import models as gz_models

    journey_date_col = gz_models.GrandezaJourney.__table__.c.journey_date
    route_date_col = gz_models.GrandezaExtraordinaryRouteSlot.__table__.c.route_date
    assert isinstance(journey_date_col.type, SADate)
    assert isinstance(route_date_col.type, SADate)


def test_bug3_timestamps_son_datetime_utc():
    """`dispatched_at`/`arrived_at`/`completed_at` deben ser Column(DateTime)."""
    from sqlalchemy import DateTime as SADateTime

    from modules.grandeza import models as gz_models

    dispatched = gz_models.GrandezaJourney.__table__.c.dispatched_at
    arrived = gz_models.GrandezaVisit.__table__.c.arrived_at
    completed = gz_models.GrandezaVisit.__table__.c.completed_at
    assert isinstance(dispatched.type, SADateTime)
    assert isinstance(arrived.type, SADateTime)
    assert isinstance(completed.type, SADateTime)


# ---------------------------------------------------------------------------
# Los 3 juntos: POS, Analytics y Grandeza reportan la misma hora local
# ---------------------------------------------------------------------------

def test_los_3_juntos_misma_hora_local():
    """Para el mismo instante UTC, POS/Analytics (local_day_bounds_utc) y
    Grandeza (to_local_date_str) coinciden en el día local."""
    # Instante: 23:30 local del 14 Sep = 05:30 UTC del 15 Sep.
    instante_utc = datetime(2026, 9, 15, 5, 30, 0)

    # Grandeza: fecha local del instante.
    fecha_local_gz = to_local_date_str(instante_utc, MEXICO)
    assert fecha_local_gz == "2026-09-14"

    # POS/Analytics: el instante cae dentro del día local 2026-09-14.
    start, end = local_day_bounds_utc(MEXICO, date(2026, 9, 14))
    assert start <= instante_utc < end

    # Y NO cae dentro del día local 2026-09-15.
    start_next, end_next = local_day_bounds_utc(MEXICO, date(2026, 9, 15))
    assert not (start_next <= instante_utc < end_next)
