"""v7 (Fase 1.5): verificacion end-to-end del Outbox idempotente y aislado.

Ejecuta 3 escenarios sobre la BD real usando el MISMO codigo de servicio que
corre en produccion (warehouse.service._process_single_event):

  T1. Rollback por fallo parcial: un evento con un item valido y otro que
      provoca un error de BD debe revertir TODO el evento (stock intacto).
  T2. Reprocesamiento sin doble descuento: procesar dos veces el mismo evento
      debe descontar el stock UNA sola vez (idempotencia por evento_id).
  T3. SKU sin almacen: un SKU sin stock en EXHIBICION_VENTA debe registrarse
      en warehouse_eventos_sin_almacen en lugar de ignorarse en silencio.

El script es autolimpiante: borra todo lo que crea al finalizar.
Uso: docker exec rderico-api-dev python verify_fase1.py
"""
import asyncio
import datetime
import json
import sys

from sqlalchemy import delete, select, text

from core.database import AsyncSessionLocal
from modules.warehouse import models
from modules.warehouse.service import _process_single_event

SKU_OK = "TEST_FASE1_OK"
SKU_MISSING = "TEST_FASE1_SIN_STOCK"
ALMACEN_ID = "alm_test_fase1"

resultados = []


def check(nombre, condicion, detalle=""):
    estado = "PASS" if condicion else "FAIL"
    resultados.append((nombre, condicion))
    print(f"[{estado}] {nombre} {detalle}")


async def limpiar(db):
    """Borra todo rastro de las pruebas (idempotente)."""
    await db.execute(delete(models.WarehouseEventoSinAlmacen))
    await db.execute(delete(models.MovimientoInventario))
    await db.execute(delete(models.WarehouseEvent))
    await db.execute(delete(models.StockAlmacen).where(models.StockAlmacen.almacen_id == ALMACEN_ID))
    await db.execute(delete(models.Almacen).where(models.Almacen.id == ALMACEN_ID))
    await db.commit()


async def setup(db):
    """Crea un almacen EXHIBICION_VENTA con stock del SKU_OK."""
    await limpiar(db)
    # Las columnas son TIMESTAMP WITHOUT TIME ZONE: usamos datetimes naive.
    ahora = datetime.datetime.now()
    db.add(models.Almacen(
        id=ALMACEN_ID, nombre="Test Fase1", proposito="EXHIBICION_VENTA",
        zona_termica="AMBIENTE", activo=True, created_at=ahora,
    ))
    db.add(models.StockAlmacen(
        almacen_id=ALMACEN_ID, item_id=SKU_OK, item_type="PRODUCTO",
        cantidad_actual=100.0, stock_minimo=0.0, stock_maximo=0.0, version=0,
        fecha_ingreso=ahora, ultima_actualizacion=ahora,
    ))
    await db.commit()


async def crear_evento(db, ticket_id, items):
    ev = models.WarehouseEvent(
        ticket_id=ticket_id, items_json=json.dumps(items), estado="PENDIENTE",
        created_at=datetime.datetime.now(),
    )
    db.add(ev)
    await db.commit()
    await db.refresh(ev)
    return ev


async def stock_actual(db, sku):
    r = await db.execute(
        select(models.StockAlmacen.cantidad_actual).where(
            models.StockAlmacen.almacen_id == ALMACEN_ID,
            models.StockAlmacen.item_id == sku,
        )
    )
    return r.scalar_one_or_none()


async def t1_rollback_parcial():
    """Un item valido + un item que rompe la BD => rollback total."""
    async with AsyncSessionLocal() as db:
        await setup(db)
        ev = await crear_evento(db, 900001, [
            {"sku": SKU_OK, "qty": 5},
            {"sku": None, "qty": 1},  # se registra en diagnostico, no rompe
        ])
        # Forzamos un fallo de BD real: cantidad no numerica en un item valido.
        ev.items_json = json.dumps([
            {"sku": SKU_OK, "qty": 5},
            {"sku": SKU_OK, "qty": "NO_ES_NUMERO"},
        ])
        await db.commit()

        fallo = False
        try:
            await _process_single_event(db, ev)
            await db.commit()
        except Exception:
            await db.rollback()
            fallo = True

        check("T1 el evento con item invalido falla", fallo)
        # Tras el rollback, el stock del primer item NO debe haberse descontado.
        cant = await stock_actual(db, SKU_OK)
        check("T1 rollback deja el stock intacto (100)", cant == 100.0, f"(stock={cant})")
        movs = await db.execute(select(models.MovimientoInventario))
        check("T1 no se persistio ningun movimiento", len(movs.scalars().all()) == 0)


async def t2_idempotencia():
    """Procesar dos veces el mismo evento descuenta una sola vez."""
    async with AsyncSessionLocal() as db:
        await setup(db)
        ev = await crear_evento(db, 900002, [{"sku": SKU_OK, "qty": 7}])
        ev_id = ev.id

        # Primera pasada.
        await _process_single_event(db, ev)
        await db.commit()
        cant1 = await stock_actual(db, SKU_OK)
        check("T2 primer procesamiento descuenta 7 (93)", cant1 == 93.0, f"(stock={cant1})")

        # Segunda pasada: recargamos el evento como PENDIENTE (simula reintento).
        ev2 = await db.get(models.WarehouseEvent, ev_id)
        ev2.estado = "PENDIENTE"
        await db.commit()
        await _process_single_event(db, ev2)
        await db.commit()
        cant2 = await stock_actual(db, SKU_OK)
        check("T2 reprocesamiento NO vuelve a descontar (93)", cant2 == 93.0, f"(stock={cant2})")

        movs = await db.execute(
            select(models.MovimientoInventario).where(
                models.MovimientoInventario.evento_id == ev_id
            )
        )
        check("T2 solo existe 1 movimiento para el evento", len(movs.scalars().all()) == 1)


async def t3_sku_sin_almacen():
    """SKU sin stock en EXHIBICION_VENTA => registro en diagnostico."""
    async with AsyncSessionLocal() as db:
        await setup(db)
        ev = await crear_evento(db, 900003, [{"sku": SKU_MISSING, "qty": 3}])
        await _process_single_event(db, ev)
        await db.commit()

        diag = await db.execute(
            select(models.WarehouseEventoSinAlmacen).where(
                models.WarehouseEventoSinAlmacen.evento_id == ev.id
            )
        )
        filas = diag.scalars().all()
        check("T3 se registro 1 diagnostico", len(filas) == 1, f"(filas={len(filas)})")
        if filas:
            check("T3 motivo = SIN_STOCK_SUFICIENTE", filas[0].motivo == "SIN_STOCK_SUFICIENTE",
                  f"(motivo={filas[0].motivo})")
            check("T3 sku registrado correctamente", filas[0].sku == SKU_MISSING)


async def main():
    try:
        await t1_rollback_parcial()
        await t2_idempotencia()
        await t3_sku_sin_almacen()
    finally:
        async with AsyncSessionLocal() as db:
            await limpiar(db)

    total = len(resultados)
    ok = sum(1 for _, c in resultados if c)
    print(f"\n=== RESULTADO: {ok}/{total} verificaciones PASS ===")
    sys.exit(0 if ok == total else 1)


if __name__ == "__main__":
    asyncio.run(main())
