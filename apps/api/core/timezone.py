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
