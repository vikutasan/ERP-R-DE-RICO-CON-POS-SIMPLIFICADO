"""
timestamps.py - Utilidad centralizada de timestamps tecnicos en UTC.

Principio: "Store UTC, Display Local"
- Los timestamps TECNICOS (auditoria, logs, created_at/updated_at de eventos)
  SIEMPRE se almacenan en UTC.
- Los timestamps de NEGOCIO (fechas operativas que el usuario ve) usan la hora
  local del negocio via core/timezone.py (local_now).

Regla de decision:
    Si la columna se muestra al usuario como fecha de negocio -> hora local.
    Si es metadata tecnica -> UTC (usar utcnow()).

Nota historica: en Docker el contenedor corre en UTC, por lo que datetime.now()
coincidia con UTC "por accidente". Este helper hace la intencion EXPLICITA y
protege contra cambios de TZ del sistema operativo.
"""
from datetime import datetime, timezone


def utcnow() -> datetime:
    """
    Retorna la hora actual en UTC como datetime NAIVE.

    Se retorna naive (sin tzinfo) por compatibilidad con las columnas
    `DateTime` (sin `timezone=True`) ya existentes en la base de datos.
    El valor SIEMPRE representa UTC.
    """
    return datetime.now(timezone.utc).replace(tzinfo=None)
