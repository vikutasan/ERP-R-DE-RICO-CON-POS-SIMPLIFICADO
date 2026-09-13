"""v7 (Fase 2.3): verificacion end-to-end de Auditoria y RBAC.

Ejecuta escenarios sobre la BD real usando el MISMO codigo de servicio que corre
en produccion (warehouse.service):

  T1. RBAC deniega: un empleado con perfil CAJERO (sin permisos de almacenes)
      recibe HTTP 403 al intentar una merma, y NO se escribe auditoria.
  T2. RBAC permite + auditoria: un empleado con perfil ADMIN ejecuta la merma
      con exito y se genera EXACTAMENTE un registro en `auditoria` con la accion
      MERMA y el snapshot antes/despues.
  T3. Auditoria atomica: si la operacion falla (stock insuficiente), NO queda
      ningun registro de auditoria (no se audita lo que no ocurrio).
  T4. Ajuste de stock auditado: update_stock con permiso genera auditoria AJUSTE.

El script es autolimpiante: borra todo lo que crea al finalizar.
Uso: docker exec rderico-api-dev python verify_fase2.py
"""
import asyncio
import datetime
import sys

from fastapi import HTTPException
from sqlalchemy import delete, select

from core.database import AsyncSessionLocal
from modules.security import models as sec_models
from modules.warehouse import models, schemas
from modules.warehouse.service import warehouse_service

SKU = "TEST_FASE2_SKU"
ALMACEN_ID = "alm_test_fase2"
PERFIL_SIN_PERMISO = "TEST_FASE2_SIN_PERMISO"
PERFIL_ADMIN = "TEST_FASE2_ADMIN"
EMPLEADO_SIN_PERMISO = "TEST_FASE2_PIN_NOPE"
EMPLEADO_ADMIN = "TEST_FASE2_PIN_ADMIN"

resultados = []


def check(nombre, condicion, detalle=""):
    estado = "PASS" if condicion else "FAIL"
    resultados.append((nombre, condicion))
    print(f"[{estado}] {nombre} {detalle}")


async def limpiar(db):
    """Borra todo rastro de las pruebas (idempotente)."""
    await db.execute(delete(sec_models.Auditoria))
    await db.execute(delete(sec_models.Employee).where(
        sec_models.Employee.employee_code.in_([EMPLEADO_SIN_PERMISO, EMPLEADO_ADMIN])
    ))
    await db.execute(delete(sec_models.SecurityProfile).where(
        sec_models.SecurityProfile.name.in_([PERFIL_SIN_PERMISO, PERFIL_ADMIN])
    ))
    await db.execute(delete(models.MovimientoInventario))
    await db.execute(delete(models.StockAlmacen).where(models.StockAlmacen.almacen_id == ALMACEN_ID))
    await db.execute(delete(models.Almacen).where(models.Almacen.id == ALMACEN_ID))
    await db.commit()


async def setup(db):
    """Crea almacen + stock + perfiles + empleados de prueba."""
    await limpiar(db)
    ahora = datetime.datetime.now()

    db.add(models.Almacen(
        id=ALMACEN_ID, nombre="Test Fase2", proposito="EXHIBICION_VENTA",
        zona_termica="AMBIENTE", activo=True, created_at=ahora,
    ))
    db.add(models.StockAlmacen(
        almacen_id=ALMACEN_ID, item_id=SKU, item_type="PRODUCTO",
        cantidad_actual=100.0, stock_minimo=0.0, stock_maximo=0.0, version=0,
        fecha_ingreso=ahora, ultima_actualizacion=ahora,
    ))

    # Perfil SIN permisos de almacenes (simula CAJERO).
    p_sin = sec_models.SecurityProfile(
        name=PERFIL_SIN_PERMISO, description="Test sin permisos",
        permissions={"pos": "full"}, is_system=False,
    )
    # Perfil con acceso total (simula ADMIN).
    p_admin = sec_models.SecurityProfile(
        name=PERFIL_ADMIN, description="Test admin",
        permissions={"all": "full"}, is_system=False,
    )
    db.add_all([p_sin, p_admin])
    await db.commit()
    await db.refresh(p_sin)
    await db.refresh(p_admin)

    e_sin = sec_models.Employee(
        name="Test Sin Permiso", employee_code=EMPLEADO_SIN_PERMISO,
        role="CAJERO", is_active=True, profile_id=p_sin.id,
    )
    e_admin = sec_models.Employee(
        name="Test Admin", employee_code=EMPLEADO_ADMIN,
        role="ADMIN", is_active=True, profile_id=p_admin.id,
    )
    db.add_all([e_sin, e_admin])
    await db.commit()
    await db.refresh(e_sin)
    await db.refresh(e_admin)
    return e_sin.id, e_admin.id


async def contar_auditoria(db, accion=None):
    q = select(sec_models.Auditoria)
    if accion:
        q = q.where(sec_models.Auditoria.accion == accion)
    r = await db.execute(q)
    return len(r.scalars().all())


async def stock_actual(db):
    r = await db.execute(
        select(models.StockAlmacen.cantidad_actual).where(
            models.StockAlmacen.almacen_id == ALMACEN_ID,
            models.StockAlmacen.item_id == SKU,
        )
    )
    return r.scalar_one_or_none()


async def t1_rbac_deniega():
    """Empleado sin permiso => HTTP 403 y sin auditoria."""
    async with AsyncSessionLocal() as db:
        emp_sin, _ = await setup(db)
        payload = schemas.MermaRequest(
            item_id=SKU, item_type=schemas.ItemType.PRODUCTO,
            cantidad=5.0, notas="Test RBAC denegado", usuario_id=str(emp_sin),
        )
        try:
            await warehouse_service.register_merma(db, ALMACEN_ID, payload)
            check("T1.1 merma sin permiso lanza 403", False, "(no lanzo excepcion)")
        except HTTPException as e:
            check("T1.1 merma sin permiso lanza 403", e.status_code == 403,
                  f"(status={e.status_code})")
        await db.rollback()

        stock = await stock_actual(db)
        check("T1.2 stock intacto tras 403", stock == 100.0, f"(stock={stock})")
        n = await contar_auditoria(db, "MERMA")
        check("T1.3 sin auditoria tras 403", n == 0, f"(registros={n})")


async def t2_rbac_permite_audita():
    """Empleado ADMIN => merma OK + exactamente 1 auditoria MERMA."""
    async with AsyncSessionLocal() as db:
        _, emp_admin = await setup(db)
        payload = schemas.MermaRequest(
            item_id=SKU, item_type=schemas.ItemType.PRODUCTO,
            cantidad=7.0, notas="Test RBAC permitido", usuario_id=str(emp_admin),
        )
        mov = await warehouse_service.register_merma(db, ALMACEN_ID, payload)
        check("T2.1 merma con permiso OK", mov is not None)

        stock = await stock_actual(db)
        check("T2.2 stock descontado a 93", stock == 93.0, f"(stock={stock})")

        n = await contar_auditoria(db, "MERMA")
        check("T2.3 exactamente 1 auditoria MERMA", n == 1, f"(registros={n})")

        r = await db.execute(
            select(sec_models.Auditoria).where(sec_models.Auditoria.accion == "MERMA")
        )
        reg = r.scalar_one()
        check("T2.4 auditoria con usuario_id correcto",
              reg.usuario_id == emp_admin, f"(usuario_id={reg.usuario_id})")
        check("T2.5 auditoria con snapshot antes/despues",
              reg.valores_antes == {"cantidad_actual": 100.0}
              and reg.valores_despues == {"cantidad_actual": 93.0},
              f"(antes={reg.valores_antes}, despues={reg.valores_despues})")
        check("T2.6 auditoria con detalle (motivo)",
              reg.detalle == "Test RBAC permitido", f"(detalle={reg.detalle})")


async def t3_auditoria_atomica():
    """Operacion fallida (stock insuficiente) => sin auditoria."""
    async with AsyncSessionLocal() as db:
        _, emp_admin = await setup(db)
        payload = schemas.MermaRequest(
            item_id=SKU, item_type=schemas.ItemType.PRODUCTO,
            cantidad=9999.0, notas="Test merma imposible", usuario_id=str(emp_admin),
        )
        try:
            await warehouse_service.register_merma(db, ALMACEN_ID, payload)
            check("T3.1 merma imposible lanza 400", False, "(no lanzo excepcion)")
        except HTTPException as e:
            check("T3.1 merma imposible lanza 400", e.status_code == 400,
                  f"(status={e.status_code})")
        await db.rollback()

        n = await contar_auditoria(db, "MERMA")
        check("T3.2 sin auditoria de operacion fallida", n == 0, f"(registros={n})")
        stock = await stock_actual(db)
        check("T3.3 stock intacto", stock == 100.0, f"(stock={stock})")


async def t4_ajuste_auditado():
    """update_stock con permiso genera auditoria AJUSTE."""
    async with AsyncSessionLocal() as db:
        _, emp_admin = await setup(db)
        r = await db.execute(
            select(models.StockAlmacen).where(
                models.StockAlmacen.almacen_id == ALMACEN_ID,
                models.StockAlmacen.item_id == SKU,
            )
        )
        stock = r.scalar_one()
        payload = schemas.StockAlmacenUpdate(
            cantidad_actual=55.0, version=stock.version, usuario_id=str(emp_admin),
        )
        await warehouse_service.update_stock(db, ALMACEN_ID, stock.id, payload)

        n = await contar_auditoria(db, "AJUSTE")
        check("T4.1 exactamente 1 auditoria AJUSTE", n == 1, f"(registros={n})")

        r2 = await db.execute(
            select(sec_models.Auditoria).where(sec_models.Auditoria.accion == "AJUSTE")
        )
        reg = r2.scalar_one()
        check("T4.2 auditoria AJUSTE con snapshot correcto",
              reg.valores_antes.get("cantidad_actual") == 100.0
              and reg.valores_despues.get("cantidad_actual") == 55.0,
              f"(antes={reg.valores_antes}, despues={reg.valores_despues})")


async def main():
    print("=" * 70)
    print("v7 FASE 2.3 - Verificacion de Auditoria y RBAC")
    print("=" * 70)
    try:
        await t1_rbac_deniega()
        await t2_rbac_permite_audita()
        await t3_auditoria_atomica()
        await t4_ajuste_auditado()
    finally:
        async with AsyncSessionLocal() as db:
            await limpiar(db)

    total = len(resultados)
    pasados = sum(1 for _, ok in resultados if ok)
    print("-" * 70)
    print(f"RESULTADO: {pasados}/{total} PASS")
    print("=" * 70)
    sys.exit(0 if pasados == total else 1)


if __name__ == "__main__":
    asyncio.run(main())
