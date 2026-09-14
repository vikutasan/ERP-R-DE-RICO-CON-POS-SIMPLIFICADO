"""
serialization.py — Contrato de serialización de datetimes naive (UTC).

v18 (Fase 18.1): extrae el patrón `_iso_utc()` que ya existía y está EN USO en
`modules/pos/router.py` (v12 Fase 12.4, usado en la línea 306) a un módulo
compartido, para que Heladería lo reutilice sin duplicar lógica ni tocar el POS IA.

CONTEXTO DEL PROBLEMA (BUG 3 / BUG 4):
    Varias columnas del sistema son `timestamp WITHOUT time zone` (naive). La API
    las serializaba con `.isoformat()` SIN sufijo de zona, obligando al frontend a
    un parche frágil (`endsWith('Z')`). Aquí normalizamos el contrato: un datetime
    naive se asume UTC y SIEMPRE termina en 'Z'.

REGLA DE ORO:
    Un datetime naive se asume UTC y SIEMPRE se serializa con sufijo 'Z'.
    NUNCA pasarlo a `Date.parse()` en el frontend sin esta normalización.
"""
from datetime import datetime


def iso_utc(dt: datetime | None) -> str | None:
    """Serializa un datetime naive (UTC) con sufijo 'Z' explícito.

    Args:
        dt: datetime naive (asumido UTC) o None.

    Returns:
        - None si `dt` es None.
        - El ISO string tal cual si ya trae zona ('Z' o '+').
        - El ISO string con sufijo 'Z' si es naive.

    Ejemplos:
        >>> iso_utc(None)
        None
        >>> iso_utc(datetime(2026, 9, 14, 1, 30, 0))
        '2026-09-14T01:30:00Z'
    """
    if dt is None:
        return None
    iso = dt.isoformat()
    if iso.endswith("Z") or "+" in iso:
        return iso
    return iso + "Z"
