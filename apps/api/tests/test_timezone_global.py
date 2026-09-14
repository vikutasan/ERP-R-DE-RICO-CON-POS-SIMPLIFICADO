"""
test_timezone_global.py - Tests de la infraestructura de zona horaria global (V20 Fase 20.0).

Cubre:
- core/timestamps.py::utcnow
- core/timezone.py::tz_offset_hours, local_day_bounds_utc, to_local_date_str
- Endpoint GET /api/v1/settings/timezone (orden de rutas)
"""
from datetime import datetime, date
from zoneinfo import ZoneInfo

import httpx
import pytest
import pytest_asyncio

from core.timestamps import utcnow
from core.timezone import (
    tz_offset_hours,
    local_day_bounds_utc,
    to_local_date_str,
    utc_to_local,
    local_now,
)

MEXICO = ZoneInfo("America/Mexico_City")
UTC = ZoneInfo("UTC")


@pytest_asyncio.fixture
async def client():
    """Cliente HTTP async contra la app FastAPI en proceso (sin red)."""
    from main import app
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


# ---------------------------------------------------------------------------
# core/timestamps.py
# ---------------------------------------------------------------------------

def test_utcnow_es_naive():
    """utcnow() retorna un datetime naive (sin tzinfo)."""
    now = utcnow()
    assert isinstance(now, datetime)
    assert now.tzinfo is None


def test_utcnow_cercano_a_utc_real():
    """utcnow() no debe desviarse mas de 5 segundos del UTC real."""
    real_utc = datetime.now(UTC).replace(tzinfo=None)
    delta = abs((real_utc - utcnow()).total_seconds())
    assert delta < 5


# ---------------------------------------------------------------------------
# tz_offset_hours
# ---------------------------------------------------------------------------

def test_tz_offset_hours_mexico_sin_dst():
    """America/Mexico_City en invierno (CST) = -6."""
    # 15 de enero 2026 12:00 UTC
    at = datetime(2026, 1, 15, 12, 0, 0)
    assert tz_offset_hours(MEXICO, at) == -6


def test_tz_offset_hours_utc_es_cero():
    """UTC siempre tiene offset 0."""
    assert tz_offset_hours(UTC, datetime(2026, 6, 15, 12, 0, 0)) == 0


def test_tz_offset_hours_default_usa_ahora():
    """Sin argumento 'at' usa el momento actual (no lanza)."""
    offset = tz_offset_hours(MEXICO)
    assert isinstance(offset, int)
    # Mexico ya no aplica DST desde 2022, siempre -6
    assert offset == -6


# ---------------------------------------------------------------------------
# local_day_bounds_utc
# ---------------------------------------------------------------------------

def test_local_day_bounds_utc_mexico():
    """Un dia local en Mexico (-6) abarca de 06:00 UTC a 06:00 UTC del dia siguiente."""
    start, end = local_day_bounds_utc(MEXICO, date(2026, 9, 14))
    assert start == datetime(2026, 9, 14, 6, 0, 0)
    assert end == datetime(2026, 9, 15, 6, 0, 0)


def test_local_day_bounds_utc_acepta_string():
    """Acepta fecha como string ISO."""
    start, end = local_day_bounds_utc(MEXICO, "2026-09-14")
    assert start == datetime(2026, 9, 14, 6, 0, 0)
    assert end == datetime(2026, 9, 15, 6, 0, 0)


def test_local_day_bounds_utc_end_es_exclusivo():
    """El fin es exclusivo: end - start == 24h."""
    start, end = local_day_bounds_utc(MEXICO, date(2026, 9, 14))
    assert (end - start).total_seconds() == 24 * 3600


def test_local_day_bounds_utc_utc_es_medianoche():
    """En UTC el dia local coincide con el dia UTC."""
    start, end = local_day_bounds_utc(UTC, date(2026, 9, 14))
    assert start == datetime(2026, 9, 14, 0, 0, 0)
    assert end == datetime(2026, 9, 15, 0, 0, 0)


# ---------------------------------------------------------------------------
# to_local_date_str / utc_to_local / local_now
# ---------------------------------------------------------------------------

def test_to_local_date_str_cruza_medianoche():
    """02:00 UTC del 15 Sep = 20:00 local del 14 Sep en Mexico."""
    dt_utc = datetime(2026, 9, 15, 2, 0, 0)
    assert to_local_date_str(dt_utc, MEXICO) == "2026-09-14"


def test_to_local_date_str_none():
    """None retorna None (no lanza)."""
    assert to_local_date_str(None, MEXICO) is None


def test_utc_to_local_resta_seis_horas():
    """UTC 12:00 -> local 06:00 en Mexico."""
    dt_utc = datetime(2026, 9, 14, 12, 0, 0)
    assert utc_to_local(dt_utc, MEXICO) == datetime(2026, 9, 14, 6, 0, 0)


def test_local_now_es_naive():
    """local_now() retorna naive."""
    assert local_now(MEXICO).tzinfo is None


# ---------------------------------------------------------------------------
# Endpoint GET /api/v1/settings/timezone (orden de rutas)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_endpoint_timezone_responde(client):
    """El endpoint /settings/timezone responde 200 con timezone y offset_hours."""
    resp = await client.get("/api/v1/settings/timezone")
    assert resp.status_code == 200
    data = resp.json()
    assert "timezone" in data
    assert "offset_hours" in data
    assert data["timezone"] == "America/Mexico_City"
    assert data["offset_hours"] == -6


@pytest.mark.asyncio
async def test_endpoint_timezone_no_es_capturado_por_key(client):
    """Verifica el orden: /timezone NO debe caer en /{key} (devolveria 404)."""
    resp = await client.get("/api/v1/settings/timezone")
    assert resp.status_code == 200
    # Si hubiera caido en /{key}, el body seria un SystemSettingResponse
    # con 'key' == 'timezone' o un 404. Verificamos que NO tenga 'key'.
    data = resp.json()
    assert "key" not in data


@pytest.mark.asyncio
async def test_endpoint_settings_list_sigue_funcionando(client):
    """GET /settings/ sigue devolviendo 200 (no rompimos el orden)."""
    resp = await client.get("/api/v1/settings/")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)
