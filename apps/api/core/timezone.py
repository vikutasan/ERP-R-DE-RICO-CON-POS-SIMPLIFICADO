"""
timezone.py - Utilidad centralizada de zona horaria del negocio.

Principio: "Store UTC, Display Local"
- La base de datos SIEMPRE almacena UTC (datetime.now() en Docker = UTC)
- Esta utilidad convierte UTC a hora local del negocio usando el setting business_timezone
- Úsala para lógica de negocio que necesite hora local (puntualidad, regla de 5 AM, etc.)
"""
from datetime import datetime
from zoneinfo import ZoneInfo
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select


# Cache simple para no consultar la DB en cada llamada dentro de la misma request
_cached_tz = None
_cache_timestamp = None
CACHE_TTL_SECONDS = 300  # Refresca cada 5 minutos


async def get_business_tz(db: AsyncSession) -> ZoneInfo:
    """Lee business_timezone de system_settings. Cachea por 5 minutos."""
    global _cached_tz, _cache_timestamp

    now = datetime.utcnow()
    if _cached_tz and _cache_timestamp and (now - _cache_timestamp).total_seconds() < CACHE_TTL_SECONDS:
        return _cached_tz

    from modules.settings.service import get_setting_by_key
    try:
        setting = await get_setting_by_key(db, "business_timezone")
        tz_name = setting.value if setting else "America/Mexico_City"
    except Exception:
        tz_name = "America/Mexico_City"

    _cached_tz = ZoneInfo(tz_name)
    _cache_timestamp = now
    return _cached_tz


def local_now(tz: ZoneInfo) -> datetime:
    """Retorna la hora actual en la zona del negocio (naive, sin tzinfo)."""
    return datetime.now(tz).replace(tzinfo=None)


def utc_to_local(dt: datetime, tz: ZoneInfo) -> datetime:
    """Convierte un datetime UTC naive a hora local del negocio (naive)."""
    if dt is None:
        return None
    return dt.replace(tzinfo=ZoneInfo("UTC")).astimezone(tz).replace(tzinfo=None)


def tz_offset_hours(tz: ZoneInfo, at: datetime = None) -> int:
    """Retorna el offset de la zona respecto a UTC en horas enteras.

    Ej: America/Mexico_City -> -6 (CST) o -5 (CDT si hubiera DST).

    Args:
        tz: Zona horaria del negocio (ZoneInfo).
        at: Momento UTC naive de referencia. Si es None usa "ahora" en UTC.
            Se usa para respetar el offset historico (DST) del momento dado.
    """
    if at is None:
        at = datetime.utcnow()
    aware_utc = at.replace(tzinfo=ZoneInfo("UTC"))
    offset = aware_utc.astimezone(tz).utcoffset()
    if offset is None:
        return 0
    return int(offset.total_seconds() // 3600)


def local_day_bounds_utc(tz: ZoneInfo, target_date=None) -> tuple:
    """Calcula los limites [inicio, fin) en UTC de un dia local del negocio.

    Dado un dia local (ej. 2026-09-14 en America/Mexico_City), retorna el rango
    de datetimes UTC naive que cubren ese dia completo. Sirve para filtrar
    registros almacenados en UTC por dia local.

    Args:
        tz: Zona horaria del negocio.
        target_date: date local. Si es None usa el dia local actual.

    Returns:
        (start_utc, end_utc) como datetimes UTC naive, con end exclusivo.
    """
    from datetime import date as _date, timedelta

    if target_date is None:
        target_date = local_now(tz).date()
    elif isinstance(target_date, datetime):
        target_date = target_date.date()
    elif isinstance(target_date, str):
        target_date = _date.fromisoformat(target_date)

    start_local = datetime(target_date.year, target_date.month, target_date.day)
    end_local = start_local + timedelta(days=1)

    start_utc = start_local.replace(tzinfo=tz).astimezone(ZoneInfo("UTC")).replace(tzinfo=None)
    end_utc = end_local.replace(tzinfo=tz).astimezone(ZoneInfo("UTC")).replace(tzinfo=None)
    return start_utc, end_utc


def to_local_date_str(dt: datetime, tz: ZoneInfo) -> str:
    """Convierte un datetime UTC naive a string de fecha local 'YYYY-MM-DD'."""
    if dt is None:
        return None
    return utc_to_local(dt, tz).strftime("%Y-%m-%d")
