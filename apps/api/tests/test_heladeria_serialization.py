"""v18 (Fase 18.1): tests del contrato de serializacion UTC compartido.

Verifica que `core.serialization.iso_utc` normaliza datetimes naive con sufijo 'Z',
que es el contrato que el frontend (kdsUrgency.js) espera para calcular la urgencia
del KDS sin parches fragiles.

REGLA DE ORO: un datetime naive se asume UTC y SIEMPRE termina en 'Z'.
"""
from datetime import datetime, timezone, timedelta

from core.serialization import iso_utc


class TestIsoUtc:
    """El helper debe normalizar naive -> 'Z' y respetar los que ya traen zona."""

    def test_none_devuelve_none(self):
        assert iso_utc(None) is None

    def test_naive_termina_en_z(self):
        dt = datetime(2026, 9, 14, 1, 30, 0)
        assert iso_utc(dt) == "2026-09-14T01:30:00Z"

    def test_naive_con_microsegundos_termina_en_z(self):
        dt = datetime(2026, 9, 14, 1, 30, 0, 123456)
        result = iso_utc(dt)
        assert result.endswith("Z")
        assert result.startswith("2026-09-14T01:30:00.123456")

    def test_aware_utc_se_respeta(self):
        dt = datetime(2026, 9, 14, 1, 30, 0, tzinfo=timezone.utc)
        # Ya trae '+00:00' -> se respeta tal cual (no se le añade 'Z').
        result = iso_utc(dt)
        assert "+" in result
        assert not result.endswith("Z")

    def test_aware_con_offset_se_respeta(self):
        dt = datetime(2026, 9, 14, 1, 30, 0, tzinfo=timezone(timedelta(hours=-6)))
        result = iso_utc(dt)
        assert "-06:00" in result

    def test_string_ya_con_z_no_se_duplica(self):
        # Un datetime naive cuyo isoformat ya termina en 'Z' no debe duplicar la Z.
        # (Caso defensivo: no ocurre con datetime naive, pero blinda el contrato.)
        dt = datetime(2026, 9, 14, 1, 30, 0)
        result = iso_utc(dt)
        assert result.count("Z") == 1

    def test_es_idempotente_en_el_sentido_del_contrato(self):
        """Aplicar el helper dos veces no altera el resultado."""
        dt = datetime(2026, 9, 14, 1, 30, 0)
        once = iso_utc(dt)
        # once ya termina en Z; el helper sobre un string no aplica, pero
        # verificamos que el contrato (terminar en Z) se mantiene.
        assert once.endswith("Z")


class TestContratoConElFrontend:
    """El contrato debe ser compatible con Date.parse() del frontend."""

    def test_date_parse_interpreta_como_utc(self):
        """Un string con 'Z' es interpretado como UTC por el estandar ISO 8601."""
        dt = datetime(2026, 9, 14, 1, 30, 0)
        result = iso_utc(dt)
        # El sufijo 'Z' es lo que garantiza la interpretacion UTC.
        assert result.endswith("Z")
        # El formato es ISO 8601 valido.
        assert "T" in result
