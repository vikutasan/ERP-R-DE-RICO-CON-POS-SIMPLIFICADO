"""v13 (Fase 13.3): tests del offset de zona horaria configurable del modulo de red.

Antes de esta fase, `tz_offset_hours = 6` estaba hardcodeado en dos lugares de
`modules/network/router.py`. Ahora se lee del setting `network_tz_offset_hours`
con fallback a 6. Estos tests son el guardian del contrato:

  1. El helper devuelve el valor del setting cuando existe.
  2. El helper cae al default (6) cuando el setting no existe.
  3. El helper cae al default cuando el valor es basura (no numerico).
  4. El seed crea la fila `network_tz_offset_hours` con valor 6.

Regla de oro: NUNCA se toca el POS. Solo se leen/escriben filas de settings
propias del test, que se restauran al final.
"""
import pytest
from sqlalchemy import delete, select

from core.database import AsyncSessionLocal
from modules.network.router import _get_tz_offset, DEFAULT_TZ_OFFSET_HOURS
from modules.settings import models as settings_models
from modules.settings.service import seed_settings

CLAVE = "network_tz_offset_hours"


async def _borrar_setting(db):
    await db.execute(delete(settings_models.SystemSetting).where(
        settings_models.SystemSetting.key == CLAVE
    ))
    await db.commit()


async def _sembrar_setting(db, valor):
    await _borrar_setting(db)
    db.add(settings_models.SystemSetting(
        key=CLAVE,
        value=str(valor),
        description="TEST_FASE13",
        category="network",
        input_type="number",
    ))
    await db.commit()


class TestGetTzOffset:
    """El helper lee el setting con fallback robusto."""

    async def test_devuelve_el_valor_del_setting(self, db):
        await _sembrar_setting(db, 5)
        try:
            assert await _get_tz_offset(db) == 5
        finally:
            await _borrar_setting(db)

    async def test_fallback_cuando_no_existe_el_setting(self, db):
        await _borrar_setting(db)
        assert await _get_tz_offset(db) == DEFAULT_TZ_OFFSET_HOURS

    async def test_fallback_cuando_el_valor_es_basura(self, db):
        await _sembrar_setting(db, "no-es-un-numero")
        try:
            assert await _get_tz_offset(db) == DEFAULT_TZ_OFFSET_HOURS
        finally:
            await _borrar_setting(db)

    async def test_acepta_valor_decimal(self, db):
        await _sembrar_setting(db, "6.0")
        try:
            assert await _get_tz_offset(db) == 6
        finally:
            await _borrar_setting(db)

    async def test_default_es_seis(self):
        assert DEFAULT_TZ_OFFSET_HOURS == 6


class TestSeedDelSetting:
    """El seed debe crear la fila con el valor por defecto."""

    async def test_seed_crea_la_fila_con_valor_6(self, db):
        await _borrar_setting(db)
        try:
            await seed_settings(db)
            result = await db.execute(
                select(settings_models.SystemSetting).where(
                    settings_models.SystemSetting.key == CLAVE
                )
            )
            fila = result.scalar_one_or_none()
            assert fila is not None
            assert fila.value == "6"
            assert fila.category == "network"
        finally:
            await _borrar_setting(db)
