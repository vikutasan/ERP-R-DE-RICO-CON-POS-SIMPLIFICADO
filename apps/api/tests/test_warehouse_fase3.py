"""v7 (Fase 3.1): tests pytest del modulo warehouse.

Cubre los 7 escenarios exigidos por el plan (lineas 394-423):

  1. Bloqueo optimista  -> version correcta 200, incorrecta 409, version incrementa.
  2. Idempotencia Outbox -> reprocesar no duplica; fallo parcial hace rollback.
  3. Mermas             -> mayor a stock 400; valida descuenta y registra.
  4. Traspasos          -> insuficiente 400; valido mueve ambos almacenes.
  5. Entrada masiva     -> todos comparten lote_entrada_id; versiones incrementan.
  6. SKU sin almacen    -> registra diagnostico y el evento queda PROCESADO.
  7. Integridad         -> no eliminar almacen con stock > 0.

Los tests usan el MISMO codigo de servicio que corre en produccion
(warehouse.service.warehouse_service y _process_single_event).
"""
import datetime
import json

import pytest
from fastapi import HTTPException
from sqlalchemy import select

from modules.security import models as sec_models
from modules.warehouse import models, schemas
from modules.warehouse.service import _process_single_event, warehouse_service

from .conftest import (
    ALMACEN_DESTINO,
    ALMACEN_ORIGEN,
    ALMACEN_VENTA,
    SKU_A,
    SKU_B,
    SKU_SIN_STOCK,
    TICKET_BASE,
    contar_auditoria,
    leer_stock,
)


def _ahora():
    return datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)


# =============================================================================
# 1. BLOQUEO OPTIMISTA
# =============================================================================
class TestBloqueoOptimista:
    """D7/D9: toda mutacion incrementa version; version incorrecta => 409."""

    async def test_version_correcta_actualiza_y_retorna_200(
        self, db, empleado_admin, stock_origen
    ):
        payload = schemas.StockAlmacenUpdate(
            cantidad_actual=80.0, version=stock_origen.version,
            usuario_id=str(empleado_admin),
        )
        resultado = await warehouse_service.update_stock(
            db, ALMACEN_ORIGEN, stock_origen.id, payload
        )
        assert resultado.cantidad_actual == 80.0
        assert resultado.version == 1  # 0 -> 1

    async def test_version_incorrecta_lanza_409(self, db, empleado_admin, stock_origen):
        payload = schemas.StockAlmacenUpdate(
            cantidad_actual=80.0, version=999,  # version obsoleta
            usuario_id=str(empleado_admin),
        )
        with pytest.raises(HTTPException) as exc:
            await warehouse_service.update_stock(
                db, ALMACEN_ORIGEN, stock_origen.id, payload
            )
        assert exc.value.status_code == 409
        # El stock NO debe haberse modificado.
        await db.rollback()
        st = await leer_stock(db, ALMACEN_ORIGEN, SKU_A)
        assert st.cantidad_actual == 100.0
        assert st.version == 0

    async def test_version_incrementa_en_cada_mutacion(self, db, empleado_admin, stock_origen):
        """Dos ajustes consecutivos con la version correcta => version 0->1->2."""
        p1 = schemas.StockAlmacenUpdate(
            cantidad_actual=90.0, version=0, usuario_id=str(empleado_admin)
        )
        r1 = await warehouse_service.update_stock(db, ALMACEN_ORIGEN, stock_origen.id, p1)
        assert r1.version == 1

        p2 = schemas.StockAlmacenUpdate(
            cantidad_actual=70.0, version=1, usuario_id=str(empleado_admin)
        )
        r2 = await warehouse_service.update_stock(db, ALMACEN_ORIGEN, stock_origen.id, p2)
        assert r2.version == 2
        assert r2.cantidad_actual == 70.0

    async def test_ajuste_genera_auditoria_con_snapshot(self, db, empleado_admin, stock_origen):
        payload = schemas.StockAlmacenUpdate(
            cantidad_actual=55.0, version=0, usuario_id=str(empleado_admin)
        )
        await warehouse_service.update_stock(db, ALMACEN_ORIGEN, stock_origen.id, payload)

        assert await contar_auditoria(db, "AJUSTE") == 1
        r = await db.execute(
            select(sec_models.Auditoria).where(sec_models.Auditoria.accion == "AJUSTE")
        )
        audit = r.scalar_one()
        assert audit.valores_antes["cantidad_actual"] == 100.0
        assert audit.valores_despues["cantidad_actual"] == 55.0
        assert audit.valores_antes["version"] == 0
        assert audit.valores_despues["version"] == 1


# =============================================================================
# 2. IDEMPOTENCIA OUTBOX
# =============================================================================
class TestIdempotenciaOutbox:
    """D1: reprocesar un evento no duplica el descuento; fallo parcial revierte."""

    async def _crear_evento(self, db, ticket_id, items):
        ev = models.WarehouseEvent(
            ticket_id=ticket_id, items_json=json.dumps(items),
            estado="PENDIENTE", created_at=_ahora(),
        )
        db.add(ev)
        await db.commit()
        await db.refresh(ev)
        return ev

    async def _stock_venta(self, db, sku, cantidad=100.0):
        st = models.StockAlmacen(
            almacen_id=ALMACEN_VENTA, item_id=sku, item_type="PRODUCTO",
            cantidad_actual=cantidad, stock_minimo=0.0, stock_maximo=0.0,
            version=0, fecha_ingreso=_ahora(), ultima_actualizacion=_ahora(),
        )
        db.add(st)
        await db.commit()
        return st

    async def test_reprocesar_no_duplica_descuento(self, db, almacenes):
        """Procesar dos veces el mismo evento descuenta UNA sola vez."""
        await self._stock_venta(db, SKU_A, 100.0)
        ev = await self._crear_evento(db, TICKET_BASE + 1, [{"sku": SKU_A, "qty": 10}])

        # Primer procesamiento.
        await _process_single_event(db, ev)
        await db.commit()
        st = await leer_stock(db, ALMACEN_VENTA, SKU_A)
        assert st.cantidad_actual == 90.0
        assert st.version == 1

        # Segundo procesamiento del MISMO evento (simula reintento/reinicio).
        await _process_single_event(db, ev)
        await db.commit()
        st = await leer_stock(db, ALMACEN_VENTA, SKU_A)
        assert st.cantidad_actual == 90.0, "no debe descontar dos veces"
        assert st.version == 1, "no debe incrementar version dos veces"

        # Solo debe existir UN movimiento ligado al evento.
        r = await db.execute(
            select(models.MovimientoInventario).where(
                models.MovimientoInventario.evento_id == ev.id
            )
        )
        assert len(r.scalars().all()) == 1

    async def test_fallo_parcial_hace_rollback_total(self, db, almacenes):
        """Un item valido + un item que rompe la BD => rollback total del evento."""
        await self._stock_venta(db, SKU_A, 100.0)
        ev = await self._crear_evento(db, TICKET_BASE + 2, [{"sku": SKU_A, "qty": 5}])
        # Forzamos un fallo real: qty no numerica en el segundo item.
        ev.items_json = json.dumps([
            {"sku": SKU_A, "qty": 5},
            {"sku": SKU_A, "qty": "NO_ES_NUMERO"},
        ])
        await db.commit()

        fallo = False
        try:
            await _process_single_event(db, ev)
            await db.commit()
        except Exception:
            await db.rollback()
            fallo = True

        assert fallo, "el evento con item invalido debe fallar"
        st = await leer_stock(db, ALMACEN_VENTA, SKU_A)
        assert st.cantidad_actual == 100.0, "el rollback debe dejar el stock intacto"
        r = await db.execute(select(models.MovimientoInventario))
        assert len(r.scalars().all()) == 0, "no debe persistir ningun movimiento"

    async def test_evento_exitoso_queda_procesado(self, db, almacenes):
        await self._stock_venta(db, SKU_A, 50.0)
        ev = await self._crear_evento(db, TICKET_BASE + 3, [{"sku": SKU_A, "qty": 3}])
        await _process_single_event(db, ev)
        await db.commit()
        await db.refresh(ev)
        assert ev.estado == "PROCESADO"


# =============================================================================
# 3. MERMAS
# =============================================================================
class TestMermas:
    """Merma mayor al stock => 400; merma valida descuenta y registra auditoria."""

    async def test_merma_mayor_al_stock_lanza_400(self, db, empleado_admin, stock_origen):
        payload = schemas.MermaRequest(
            item_id=SKU_A, item_type=schemas.ItemType.PRODUCTO,
            cantidad=500.0, notas="Merma excesiva", usuario_id=str(empleado_admin),
        )
        with pytest.raises(HTTPException) as exc:
            await warehouse_service.register_merma(db, ALMACEN_ORIGEN, payload)
        assert exc.value.status_code == 400
        await db.rollback()
        st = await leer_stock(db, ALMACEN_ORIGEN, SKU_A)
        assert st.cantidad_actual == 100.0, "el stock no debe cambiar"

    async def test_merma_valida_descuenta_y_registra(self, db, empleado_admin, stock_origen):
        payload = schemas.MermaRequest(
            item_id=SKU_A, item_type=schemas.ItemType.PRODUCTO,
            cantidad=7.0, notas="Pan quemado", usuario_id=str(empleado_admin),
        )
        mov = await warehouse_service.register_merma(db, ALMACEN_ORIGEN, payload)

        assert mov.tipo_movimiento == schemas.TipoMovimiento.MERMA.value
        assert mov.cantidad == 7.0
        assert mov.notas == "Pan quemado"

        st = await leer_stock(db, ALMACEN_ORIGEN, SKU_A)
        assert st.cantidad_actual == 93.0
        assert st.version == 1

        assert await contar_auditoria(db, "MERMA") == 1
        r = await db.execute(
            select(sec_models.Auditoria).where(sec_models.Auditoria.accion == "MERMA")
        )
        audit = r.scalar_one()
        assert audit.valores_antes["cantidad_actual"] == 100.0
        assert audit.valores_despues["cantidad_actual"] == 93.0
        assert audit.detalle == "Pan quemado"

    async def test_merma_sin_permiso_lanza_403_y_no_audita(
        self, db, empleado_sin_permiso, stock_origen
    ):
        payload = schemas.MermaRequest(
            item_id=SKU_A, item_type=schemas.ItemType.PRODUCTO,
            cantidad=5.0, notas="Sin permiso", usuario_id=str(empleado_sin_permiso),
        )
        with pytest.raises(HTTPException) as exc:
            await warehouse_service.register_merma(db, ALMACEN_ORIGEN, payload)
        assert exc.value.status_code == 403
        await db.rollback()
        assert await contar_auditoria(db) == 0, "no se audita lo que no ocurrio"

    async def test_merma_sku_inexistente_lanza_404(self, db, empleado_admin, almacenes):
        payload = schemas.MermaRequest(
            item_id=SKU_SIN_STOCK, item_type=schemas.ItemType.PRODUCTO,
            cantidad=1.0, notas="No existe", usuario_id=str(empleado_admin),
        )
        with pytest.raises(HTTPException) as exc:
            await warehouse_service.register_merma(db, ALMACEN_ORIGEN, payload)
        assert exc.value.status_code == 404


# =============================================================================
# 4. TRASPASOS
# =============================================================================
class TestTraspasos:
    """Traspaso con stock insuficiente => 400; valido mueve origen y destino."""

    async def test_traspaso_insuficiente_lanza_400(self, db, empleado_admin, stock_origen):
        payload = schemas.TraspasoRequest(
            almacen_origen_id=ALMACEN_ORIGEN, almacen_destino_id=ALMACEN_DESTINO,
            item_id=SKU_A, item_type=schemas.ItemType.PRODUCTO,
            cantidad=500.0, usuario_id=str(empleado_admin),
        )
        with pytest.raises(HTTPException) as exc:
            await warehouse_service.register_transfer(db, payload)
        assert exc.value.status_code == 400
        await db.rollback()
        st = await leer_stock(db, ALMACEN_ORIGEN, SKU_A)
        assert st.cantidad_actual == 100.0

    async def test_traspaso_valido_mueve_ambos_almacenes(self, db, empleado_admin, stock_origen):
        payload = schemas.TraspasoRequest(
            almacen_origen_id=ALMACEN_ORIGEN, almacen_destino_id=ALMACEN_DESTINO,
            item_id=SKU_A, item_type=schemas.ItemType.PRODUCTO,
            cantidad=30.0, usuario_id=str(empleado_admin),
        )
        mov = await warehouse_service.register_transfer(db, payload)
        assert mov.tipo_movimiento == schemas.TipoMovimiento.TRASPASO_ENTRADA.value

        origen = await leer_stock(db, ALMACEN_ORIGEN, SKU_A)
        destino = await leer_stock(db, ALMACEN_DESTINO, SKU_A)
        assert origen.cantidad_actual == 70.0
        assert origen.version == 1
        assert destino.cantidad_actual == 30.0
        assert destino.version == 1, "stock nuevo nace en version 1"

        # Deben existir DOS movimientos: salida y entrada.
        r = await db.execute(
            select(models.MovimientoInventario).where(
                models.MovimientoInventario.item_id == SKU_A
            )
        )
        movs = r.scalars().all()
        tipos = {m.tipo_movimiento for m in movs}
        assert tipos == {
            schemas.TipoMovimiento.TRASPASO_SALIDA.value,
            schemas.TipoMovimiento.TRASPASO_ENTRADA.value,
        }
        assert await contar_auditoria(db, "TRASPASO") == 1

    async def test_traspaso_sin_permiso_lanza_403(self, db, empleado_sin_permiso, stock_origen):
        payload = schemas.TraspasoRequest(
            almacen_origen_id=ALMACEN_ORIGEN, almacen_destino_id=ALMACEN_DESTINO,
            item_id=SKU_A, item_type=schemas.ItemType.PRODUCTO,
            cantidad=10.0, usuario_id=str(empleado_sin_permiso),
        )
        with pytest.raises(HTTPException) as exc:
            await warehouse_service.register_transfer(db, payload)
        assert exc.value.status_code == 403


# =============================================================================
# 5. ENTRADA MASIVA
# =============================================================================
class TestEntradaMasiva:
    """Todos los items comparten lote_entrada_id; las versiones incrementan."""

    async def test_todos_comparten_lote_y_versiones_incrementan(
        self, db, empleado_admin, almacenes
    ):
        # Pre-existente: SKU_A con version 0.
        db.add(models.StockAlmacen(
            almacen_id=ALMACEN_ORIGEN, item_id=SKU_A, item_type="PRODUCTO",
            cantidad_actual=10.0, stock_minimo=0.0, stock_maximo=0.0,
            version=0, fecha_ingreso=_ahora(), ultima_actualizacion=_ahora(),
        ))
        await db.commit()

        payload = schemas.EntradaMasivaRequest(
            items=[
                schemas.EntradaMasivaItem(
                    item_id=SKU_A, item_type=schemas.ItemType.PRODUCTO, cantidad=20.0
                ),
                schemas.EntradaMasivaItem(
                    item_id=SKU_B, item_type=schemas.ItemType.PRODUCTO, cantidad=15.0
                ),
            ],
            usuario_id=str(empleado_admin),
        )
        resultado = await warehouse_service.register_bulk_entry(db, ALMACEN_ORIGEN, payload)

        assert resultado["total_items"] == 2
        lote = resultado["lote_id"]
        assert lote.startswith("LOT-")

        # Ambos movimientos comparten el MISMO lote_entrada_id.
        r = await db.execute(
            select(models.MovimientoInventario).where(
                models.MovimientoInventario.lote_entrada_id == lote
            )
        )
        movs = r.scalars().all()
        assert len(movs) == 2
        assert {m.item_id for m in movs} == {SKU_A, SKU_B}
        assert all(
            m.metodo_captura == schemas.MetodoCaptura.ENTRADA_MASIVA.value for m in movs
        )

        # SKU_A ya existia: 10 + 20 = 30, version 0 -> 1.
        st_a = await leer_stock(db, ALMACEN_ORIGEN, SKU_A)
        assert st_a.cantidad_actual == 30.0
        assert st_a.version == 1

        # SKU_B es nuevo: nace en version 1.
        st_b = await leer_stock(db, ALMACEN_ORIGEN, SKU_B)
        assert st_b.cantidad_actual == 15.0
        assert st_b.version == 1

    async def test_entrada_masiva_vacia_no_falla(self, db, empleado_admin, almacenes):
        payload = schemas.EntradaMasivaRequest(items=[], usuario_id=str(empleado_admin))
        resultado = await warehouse_service.register_bulk_entry(db, ALMACEN_ORIGEN, payload)
        assert resultado["total_items"] == 0


# =============================================================================
# 6. SKU SIN ALMACEN (DIAGNOSTICO)
# =============================================================================
class TestSkuSinAlmacen:
    """D2: SKU sin stock en EXHIBICION_VENTA se registra en diagnostico."""

    async def _crear_evento(self, db, ticket_id, items):
        ev = models.WarehouseEvent(
            ticket_id=ticket_id, items_json=json.dumps(items),
            estado="PENDIENTE", created_at=_ahora(),
        )
        db.add(ev)
        await db.commit()
        await db.refresh(ev)
        return ev

    async def test_sku_sin_stock_registra_diagnostico_y_procesa(self, db, almacenes):
        ev = await self._crear_evento(
            db, TICKET_BASE + 10, [{"sku": SKU_SIN_STOCK, "qty": 2}]
        )
        await _process_single_event(db, ev)
        await db.commit()
        await db.refresh(ev)

        # El evento se marca PROCESADO (no se queda atorado).
        assert ev.estado == "PROCESADO"

        # Se registro el diagnostico.
        r = await db.execute(
            select(models.WarehouseEventoSinAlmacen).where(
                models.WarehouseEventoSinAlmacen.evento_id == ev.id
            )
        )
        diag = r.scalars().all()
        assert len(diag) == 1
        assert diag[0].sku == SKU_SIN_STOCK
        assert diag[0].motivo == "SIN_STOCK_SUFICIENTE"

        # No se creo ningun movimiento de inventario.
        r2 = await db.execute(select(models.MovimientoInventario))
        assert len(r2.scalars().all()) == 0

    async def test_item_sin_sku_registra_diagnostico(self, db, almacenes):
        ev = await self._crear_evento(
            db, TICKET_BASE + 11, [{"sku": None, "qty": 1}]
        )
        await _process_single_event(db, ev)
        await db.commit()

        r = await db.execute(
            select(models.WarehouseEventoSinAlmacen).where(
                models.WarehouseEventoSinAlmacen.evento_id == ev.id
            )
        )
        diag = r.scalars().all()
        assert len(diag) == 1
        assert diag[0].motivo == "SIN_SKU"


# =============================================================================
# 7. INTEGRIDAD
# =============================================================================
class TestIntegridad:
    """No se debe poder eliminar un almacen con stock > 0."""

    async def test_no_eliminar_almacen_con_stock(self, db, empleado_admin, stock_origen):
        with pytest.raises(HTTPException) as exc:
            await warehouse_service.delete_warehouse(
                db, ALMACEN_ORIGEN, usuario_id=str(empleado_admin)
            )
        assert exc.value.status_code == 400
        # El almacen sigue existiendo.
        r = await db.execute(
            select(models.Almacen).where(models.Almacen.id == ALMACEN_ORIGEN)
        )
        assert r.scalar_one_or_none() is not None

    async def test_eliminar_almacen_vacio_funciona(self, db, empleado_admin, almacenes):
        # ALMACEN_DESTINO no tiene stock.
        resultado = await warehouse_service.delete_warehouse(
            db, ALMACEN_DESTINO, usuario_id=str(empleado_admin)
        )
        assert resultado is not None
        r = await db.execute(
            select(models.Almacen).where(models.Almacen.id == ALMACEN_DESTINO)
        )
        assert r.scalar_one_or_none() is None
        assert await contar_auditoria(db, "ELIMINAR") == 1

    async def test_eliminar_sin_permiso_lanza_403(self, db, empleado_sin_permiso, almacenes):
        with pytest.raises(HTTPException) as exc:
            await warehouse_service.delete_warehouse(
                db, ALMACEN_DESTINO, usuario_id=str(empleado_sin_permiso)
            )
        assert exc.value.status_code == 403
