"""v7 (Fase 3.1): fixtures compartidas de pytest para el modulo warehouse.

Los tests corren DENTRO del contenedor rderico-api-dev contra la BD real de
desarrollo. Cada fixture crea datos con prefijo TEST_FASE3_ y los elimina al
terminar, de modo que la suite es autolimpiante (regla de higiene, seccion 5.2).

Regla de oro: NUNCA se toca el POS. Solo se insertan/borran filas propias.
"""
import datetime

import pytest
import pytest_asyncio
from sqlalchemy import delete, select

from core.database import AsyncSessionLocal
from modules.security import models as sec_models
from modules.warehouse import models

# --- Identificadores de prueba (prefijo unico para poder limpiar sin riesgo) ---
SKU_A = "TEST_FASE3_SKU_A"
SKU_B = "TEST_FASE3_SKU_B"
SKU_SIN_STOCK = "TEST_FASE3_SKU_SIN_STOCK"
ALMACEN_ORIGEN = "alm_test_fase3_origen"
ALMACEN_DESTINO = "alm_test_fase3_destino"
ALMACEN_VENTA = "alm_test_fase3_venta"
PERFIL_ADMIN = "TEST_FASE3_ADMIN"
PERFIL_SIN_PERMISO = "TEST_FASE3_SIN_PERMISO"
EMPLEADO_ADMIN = "TEST_FASE3_PIN_ADMIN"
EMPLEADO_SIN_PERMISO = "TEST_FASE3_PIN_NOPE"

TICKET_BASE = 930000


def _ahora():
    """UTC naive: las columnas son TIMESTAMP WITHOUT TIME ZONE."""
    return datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)


async def _limpiar_todo(db):
    """Borra todo rastro de las pruebas de Fase 3 (idempotente)."""
    await db.execute(delete(models.WarehouseEventoSinAlmacen))
    await db.execute(delete(models.MovimientoInventario))
    await db.execute(delete(models.WarehouseEvent))
    await db.execute(delete(sec_models.Auditoria))
    await db.execute(delete(models.StockAlmacen).where(
        models.StockAlmacen.almacen_id.in_([ALMACEN_ORIGEN, ALMACEN_DESTINO, ALMACEN_VENTA])
    ))
    await db.execute(delete(models.Almacen).where(
        models.Almacen.id.in_([ALMACEN_ORIGEN, ALMACEN_DESTINO, ALMACEN_VENTA])
    ))
    await db.execute(delete(sec_models.Employee).where(
        sec_models.Employee.employee_code.in_([EMPLEADO_ADMIN, EMPLEADO_SIN_PERMISO])
    ))
    await db.execute(delete(sec_models.SecurityProfile).where(
        sec_models.SecurityProfile.name.in_([PERFIL_ADMIN, PERFIL_SIN_PERMISO])
    ))
    await db.commit()


@pytest_asyncio.fixture
async def db():
    """Sesion async limpia. Limpia antes y despues de cada test."""
    async with AsyncSessionLocal() as session:
        await _limpiar_todo(session)
        try:
            yield session
        finally:
            await _limpiar_todo(session)


@pytest_asyncio.fixture
async def empleado_admin(db):
    """Empleado con perfil ADMIN (permiso total). Devuelve su id (int)."""
    perfil = sec_models.SecurityProfile(
        name=PERFIL_ADMIN, description="Test Fase3 admin",
        permissions={"all": "full"}, is_system=False,
    )
    db.add(perfil)
    await db.commit()
    await db.refresh(perfil)

    emp = sec_models.Employee(
        name="Test Fase3 Admin", employee_code=EMPLEADO_ADMIN,
        role="ADMIN", is_active=True, profile_id=perfil.id,
    )
    db.add(emp)
    await db.commit()
    await db.refresh(emp)
    return emp.id


@pytest_asyncio.fixture
async def empleado_sin_permiso(db):
    """Empleado con perfil sin permisos de almacenes. Devuelve su id (int)."""
    perfil = sec_models.SecurityProfile(
        name=PERFIL_SIN_PERMISO, description="Test Fase3 sin permisos",
        permissions={"pos": "full"}, is_system=False,
    )
    db.add(perfil)
    await db.commit()
    await db.refresh(perfil)

    emp = sec_models.Employee(
        name="Test Fase3 Sin Permiso", employee_code=EMPLEADO_SIN_PERMISO,
        role="CAJERO", is_active=True, profile_id=perfil.id,
    )
    db.add(emp)
    await db.commit()
    await db.refresh(emp)
    return emp.id


@pytest_asyncio.fixture
async def almacenes(db):
    """Crea 3 almacenes: origen (ALMACENAMIENTO), destino (ALMACENAMIENTO) y
    venta (EXHIBICION_VENTA). Devuelve un dict con sus ids."""
    ahora = _ahora()
    db.add_all([
        models.Almacen(
            id=ALMACEN_ORIGEN, nombre="Test Fase3 Origen",
            proposito="ALMACENAMIENTO", zona_termica="SECO",
            activo=True, created_at=ahora,
        ),
        models.Almacen(
            id=ALMACEN_DESTINO, nombre="Test Fase3 Destino",
            proposito="ALMACENAMIENTO", zona_termica="SECO",
            activo=True, created_at=ahora,
        ),
        models.Almacen(
            id=ALMACEN_VENTA, nombre="Test Fase3 Venta",
            proposito="EXHIBICION_VENTA", zona_termica="SECO",
            activo=True, created_at=ahora,
        ),
    ])
    await db.commit()
    return {
        "origen": ALMACEN_ORIGEN,
        "destino": ALMACEN_DESTINO,
        "venta": ALMACEN_VENTA,
    }


@pytest_asyncio.fixture
async def stock_origen(db, almacenes):
    """Stock de SKU_A en el almacen origen: 100 unidades, version 0."""
    ahora = _ahora()
    st = models.StockAlmacen(
        almacen_id=ALMACEN_ORIGEN, item_id=SKU_A, item_type="PRODUCTO",
        cantidad_actual=100.0, stock_minimo=0.0, stock_maximo=0.0,
        version=0, fecha_ingreso=ahora, ultima_actualizacion=ahora,
    )
    db.add(st)
    await db.commit()
    await db.refresh(st)
    return st


async def leer_stock(db, almacen_id, sku):
    """Devuelve el objeto StockAlmacen o None."""
    r = await db.execute(
        select(models.StockAlmacen).where(
            models.StockAlmacen.almacen_id == almacen_id,
            models.StockAlmacen.item_id == sku,
        )
    )
    return r.scalar_one_or_none()


async def contar_auditoria(db, accion=None):
    q = select(sec_models.Auditoria)
    if accion:
        q = q.where(sec_models.Auditoria.accion == accion)
    r = await db.execute(q)
    return len(r.scalars().all())
