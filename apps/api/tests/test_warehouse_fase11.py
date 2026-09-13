"""v11 (Fase 11.1): tests del contrato explicito de actualizacion parcial.

Deuda 1 del plan v11: `update_warehouse` usa
`payload.model_dump(exclude_unset=True)`. La semantica es sutil y peligrosa:

    - Campo OMITIDO en el JSON  -> NO se toca (se conserva el valor).
    - Campo enviado como `null` -> SI esta "set" -> SI limpia el valor.
    - Campo enviado con valor   -> se actualiza.

Estos tests FIJAN ese contrato para que nadie lo rompa por accidente. Si un
refactor futuro cambia `exclude_unset=True` por `exclude_none=True` (o por
`model_dump()` a secas), estos tests fallaran y explicaran por que.

Los tests usan el MISMO codigo de servicio que corre en produccion
(`warehouse_service.update_warehouse`).

NOTA: se reutiliza el almacen creado por la fixture `almacenes` (id
ALMACEN_ORIGEN) en lugar de insertar uno nuevo, para no violar la PK.
Los campos de representacion visual se siembran con un UPDATE directo.
"""
import pytest
from fastapi import HTTPException
from sqlalchemy import update

from modules.warehouse import models, schemas
from modules.warehouse.service import warehouse_service

from .conftest import ALMACEN_ORIGEN


async def _sembrar_representacion(
    db,
    *,
    foto_url=None,
    planograma_url=None,
    pautas_acomodo=None,
):
    """Setea los campos de representacion visual del almacen de la fixture.

    Se hace con un UPDATE directo (no via servicio) para preparar el estado
    inicial sin depender del contrato que estamos probando.
    """
    valores = {}
    if foto_url is not None:
        valores["foto_url"] = foto_url
    if planograma_url is not None:
        valores["planograma_url"] = planograma_url
    if pautas_acomodo is not None:
        valores["pautas_acomodo"] = pautas_acomodo
    if valores:
        await db.execute(
            update(models.Almacen)
            .where(models.Almacen.id == ALMACEN_ORIGEN)
            .values(**valores)
        )
        await db.commit()


# =============================================================================
# 1. CONTRATO: OMITIR CONSERVA
# =============================================================================
class TestOmitirConserva:
    """Un campo ausente del payload NO debe tocarse."""

    async def test_omitir_foto_conserva_el_valor_existente(self, db, almacenes):
        """Si el payload solo trae `nombre`, la foto y el planograma sobreviven."""
        await _sembrar_representacion(
            db,
            foto_url="https://cdn/foto.png",
            planograma_url="https://cdn/plano.png",
            pautas_acomodo=["Peso abajo", "Rotacion PEPS"],
        )

        # Payload que OMITE foto_url, planograma_url y pautas_acomodo.
        payload = schemas.AlmacenUpdate(nombre="Renombrado")
        resultado = await warehouse_service.update_warehouse(db, ALMACEN_ORIGEN, payload)

        assert resultado.nombre == "Renombrado"
        # Los tres campos omitidos DEBEN conservarse intactos.
        assert resultado.foto_url == "https://cdn/foto.png"
        assert resultado.planograma_url == "https://cdn/plano.png"
        assert resultado.pautas_acomodo == ["Peso abajo", "Rotacion PEPS"]

    async def test_omitir_todos_los_campos_no_modifica_nada(self, db, almacenes):
        """Un payload vacio es un no-op: no debe borrar ni cambiar nada."""
        await _sembrar_representacion(db, foto_url="https://cdn/foto.png")

        payload = schemas.AlmacenUpdate()  # sin ningun campo
        resultado = await warehouse_service.update_warehouse(db, ALMACEN_ORIGEN, payload)

        assert resultado.nombre == "Test Fase3 Origen"
        assert resultado.foto_url == "https://cdn/foto.png"
        assert resultado.zona_termica == "SECO"


# =============================================================================
# 2. CONTRATO: NULL LIMPIA
# =============================================================================
class TestNullLimpia:
    """Un campo enviado explicitamente como `null` SI debe limpiarse."""

    async def test_null_en_foto_limpia_el_valor(self, db, almacenes):
        """`{"foto_url": null}` debe borrar la foto (es la unica forma de hacerlo)."""
        await _sembrar_representacion(
            db,
            foto_url="https://cdn/foto.png",
            planograma_url="https://cdn/plano.png",
        )

        # `foto_url` explicito como None => SI limpia. `planograma_url` omitido => conserva.
        payload = schemas.AlmacenUpdate(foto_url=None)
        resultado = await warehouse_service.update_warehouse(db, ALMACEN_ORIGEN, payload)

        assert resultado.foto_url is None
        # El planograma NO se envio, por lo tanto se conserva.
        assert resultado.planograma_url == "https://cdn/plano.png"

    async def test_null_en_pautas_limpia_la_lista(self, db, almacenes):
        """`{"pautas_acomodo": []}` debe vaciar la lista de pautas."""
        await _sembrar_representacion(db, pautas_acomodo=["A", "B", "C"])

        payload = schemas.AlmacenUpdate(pautas_acomodo=[])
        resultado = await warehouse_service.update_warehouse(db, ALMACEN_ORIGEN, payload)

        assert resultado.pautas_acomodo == []

    async def test_valor_nuevo_reemplaza_el_anterior(self, db, almacenes):
        """Un valor enviado reemplaza al anterior (caso normal de update)."""
        await _sembrar_representacion(db, foto_url="https://cdn/vieja.png")

        payload = schemas.AlmacenUpdate(
            nombre="Nuevo", foto_url="https://cdn/nueva.png"
        )
        resultado = await warehouse_service.update_warehouse(db, ALMACEN_ORIGEN, payload)

        assert resultado.nombre == "Nuevo"
        assert resultado.foto_url == "https://cdn/nueva.png"


# =============================================================================
# 3. GUARDIAN DEL CONTRATO (evita la reincidencia)
# =============================================================================
class TestGuardianDelContrato:
    """Tests que fallan si alguien cambia la semantica de `exclude_unset`."""

    async def test_model_dump_exclude_unset_distingue_omitido_de_null(self):
        """Prueba pura: `exclude_unset=True` distingue 'omitido' de 'null'.

        Este es el corazon de la Deuda 1. Si alguien cambia el servicio a
        `exclude_none=True`, un `null` dejaria de limpiar y este test lo
        documenta como comportamiento NO deseado.
        """
        # Caso A: campo omitido -> NO aparece en el dump.
        solo_nombre = schemas.AlmacenUpdate(nombre="X")
        dump_a = solo_nombre.model_dump(exclude_unset=True)
        assert "foto_url" not in dump_a
        assert dump_a == {"nombre": "X"}

        # Caso B: campo enviado como null -> SI aparece en el dump.
        con_null = schemas.AlmacenUpdate(foto_url=None)
        dump_b = con_null.model_dump(exclude_unset=True)
        assert "foto_url" in dump_b
        assert dump_b["foto_url"] is None

        # Caso C: `exclude_none=True` (lo que NO debemos usar) borraria el null.
        dump_c = con_null.model_dump(exclude_none=True)
        assert "foto_url" not in dump_c  # <- por esto NO se usa exclude_none

    async def test_almacen_inexistente_lanza_404(self, db, almacenes):
        """El contrato no debe relajarse: un id inexistente sigue siendo 404."""
        payload = schemas.AlmacenUpdate(nombre="Fantasma")
        with pytest.raises(HTTPException) as exc:
            await warehouse_service.update_warehouse(db, "alm_no_existe", payload)
        assert exc.value.status_code == 404


# =============================================================================
# 4. LOCK DISTRIBUIDO DEL PROCESADOR (v11 - Fase 11.2, Deuda 2)
# =============================================================================
# El procesador del Outbox puede correr en mas de un proceso. Sin exclusion
# mutua, dos instancias leerian los MISMOS eventos PENDIENTE y aplicarian el
# descuento DOS veces. Estos tests fijan el contrato del advisory lock:
#
#   - Una conexion adquiere el lock -> True.
#   - Otra conexion intenta adquirirlo -> False (no bloquea, no espera).
#   - Al liberar la primera, la segunda puede adquirirlo -> True.
#
# Se usan sesiones REALES de AsyncSessionLocal (no la fixture `db`) porque el
# advisory lock esta ligado a la CONEXION fisica: dos sesiones distintas deben
# mapear a dos conexiones distintas del pool.
class TestLockDistribuidoProcesador:
    """v11 (Fase 11.2): el advisory lock impide el doble procesamiento."""

    async def test_lock_id_corresponde_a_rder(self):
        """LOCK_ID = 0x52444552 = 'RDER' en ASCII. Documenta el valor magico."""
        from modules.warehouse.service import LOCK_ID_PROCESADOR_EVENTOS

        assert LOCK_ID_PROCESADOR_EVENTOS == 0x52444552
        assert LOCK_ID_PROCESADOR_EVENTOS == 1380205906

    async def test_una_sola_instancia_adquiere_el_lock(self):
        """Sesion A adquiere -> True; sesion B (concurrente) -> False."""
        from core.database import AsyncSessionLocal
        from modules.warehouse.service import (
            _intentar_adquirir_lock,
            _liberar_lock,
        )

        async with AsyncSessionLocal() as sesion_a:
            async with AsyncSessionLocal() as sesion_b:
                try:
                    # A toma el candado.
                    assert await _intentar_adquirir_lock(sesion_a) is True

                    # B NO puede tomarlo mientras A lo tenga: devuelve False
                    # sin bloquear (pg_try_advisory_lock no espera).
                    assert await _intentar_adquirir_lock(sesion_b) is False
                finally:
                    await _liberar_lock(sesion_a)

    async def test_liberar_permite_a_otra_instancia_adquirir(self):
        """Tras liberar A, B puede adquirir el lock (no queda huerfano)."""
        from core.database import AsyncSessionLocal
        from modules.warehouse.service import (
            _intentar_adquirir_lock,
            _liberar_lock,
        )

        async with AsyncSessionLocal() as sesion_a:
            async with AsyncSessionLocal() as sesion_b:
                assert await _intentar_adquirir_lock(sesion_a) is True
                assert await _intentar_adquirir_lock(sesion_b) is False

                # A libera explicitamente.
                await _liberar_lock(sesion_a)

                # Ahora B si puede tomarlo.
                try:
                    assert await _intentar_adquirir_lock(sesion_b) is True
                finally:
                    await _liberar_lock(sesion_b)

    async def test_liberar_lock_no_adquirido_no_falla(self):
        """Liberar un lock que no se tiene no debe lanzar excepcion.

        `pg_advisory_unlock` devuelve False (no error) si el candado no estaba
        tomado por esa conexion. El helper lo tolera para que el `finally` del
        procesador sea seguro incluso si la adquisicion fallo.
        """
        from core.database import AsyncSessionLocal
        from modules.warehouse.service import _liberar_lock

        async with AsyncSessionLocal() as sesion:
            # No se adquiere antes: liberar debe ser inocuo.
            await _liberar_lock(sesion)

    async def test_lock_persiste_si_la_conexion_vuelve_al_pool(self):
        """ADVERTENCIA de diseno: devolver la conexion al pool NO libera el lock.

        `AsyncSessionLocal` usa un pool de conexiones. Al salir del `async with`
        la sesion se cierra, pero la CONEXION fisica vuelve al pool y sigue
        viva: el advisory lock SIGUE TOMADO. Por eso el procesador DEBE liberar
        el lock explicitamente en su bloque `finally` (no basta con cerrar la
        sesion).

        Este test fija ese comportamiento para que nadie asuma que 'cerrar la
        sesion' libera el candado.
        """
        from core.database import AsyncSessionLocal
        from modules.warehouse.service import (
            _intentar_adquirir_lock,
            _liberar_lock,
        )

        # Sesion efimera: adquiere y se cierra SIN liberar explicitamente.
        async with AsyncSessionLocal() as sesion_efimera:
            assert await _intentar_adquirir_lock(sesion_efimera) is True
        # La conexion volvio al pool con el lock AUN tomado.

        # Una sesion nueva (que reutiliza la MISMA conexion del pool) NO puede
        # adquirirlo: el lock sigue vivo. Esto demuestra por que el `finally`
        # explicito del procesador es obligatorio.
        async with AsyncSessionLocal() as sesion_nueva:
            try:
                assert await _intentar_adquirir_lock(sesion_nueva) is False
            finally:
                # Limpieza: liberar el lock que quedo tomado por la sesion efimera.
                await _liberar_lock(sesion_nueva)
