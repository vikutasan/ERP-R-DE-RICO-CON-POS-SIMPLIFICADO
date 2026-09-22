import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from modules.catalog.router import router as catalog_router
from modules.pos.router import router as pos_router
from modules.security.router import router as security_router
from modules.cash.router import router as cash_router
from modules.settings.router import router as settings_router
from modules.production.router import router as production_router
from modules.orders.router import router as orders_router
from modules.delivery_settings.router import router as delivery_settings_router
from modules.analytics.router import router as analytics_router
from modules.network.router import router as network_router
from modules.grandeza.router import router as grandeza_router
from modules.hr.router import router as hr_router
from modules.warehouse.router import router as warehouse_router
from modules.heladeria.router import router as heladeria_router
from modules.ai.router import router as ai_router
from core.database import AsyncSessionLocal, engine, Base
from modules.catalog.models import Category, Product, ProductTechnicalSheet
from modules.security.models import SecurityProfile, Employee, Auditoria
from sqlalchemy import select, text
from modules.settings.service import seed_settings as seed_system_settings

# v7 (D6): logger estructurado en lugar de print(). Los print() no llevan
# nivel, ni timestamp, ni origen, y no se pueden filtrar en producción.
logger = logging.getLogger("rderico.api")

# Importar TODOS los modelos para que Base.metadata los conozca
from modules.pos.models import Ticket, TerminalSession, TerminalLock
from modules.cash.models import CashSession, CashMovement
from modules.heladeria.models import HeladeriaProductConfig, TicketItemComponent
from modules.settings.models import SystemSetting
from modules.production.models import Dough, DoughBatchConfig, DoughIngredient, DoughProcedureStep, DoughProductRelation, ProductionEquipment
from modules.orders.models import Order
from modules.delivery_settings.models import DeliverySettings
from modules.analytics.models import DailyContext
from modules.network.models import NetworkIncident
from modules.grandeza.models import (
    GrandezaProductConfig, GrandezaClient, GrandezaRouteSlot,
    GrandezaJourney, GrandezaInventory, GrandezaVisit, GrandezaVisitItem,
    GrandezaDriverLocation, GrandezaSettings
)
from modules.hr.models import (
    HREmployeeExt, HRPosition, HRAttendance, HRRegulation,
    HRScheduleTemplate, HRSchedule,
    HRIncident, HRIncidentConfig, HRUniformDeposit, HRUniformMovement,
    HRUniformConfig, HRCoverageFund, HRCoverageMovement, HRCoverageConfig,
    HRSalaryTable, HRPayroll, HRPayrollDeduction, HRPayrollConfig,
    HRPSG, HRPSGConfig,
    HRVacation, HRVacationConfig, HRPsychometric, HRPsychometricConfig,
    HRKpi, HRKpiConfig, HRExitSurvey, HRExitSurveyConfig,
    HRSeverance, HRSeveranceConfig
)
from modules.warehouse.models import Almacen, StockAlmacen, MovimientoInventario, WarehouseEvent, Insumo
# v7 (Fase 5): el modulo AI no define modelos propios todavia, pero se importa
# explicitamente para dejar constancia de que debe registrarse aqui cuando los
# tenga (Incidente 16.3: un modelo no importado no se crea y provoca crash loop).
from modules.ai import models as ai_models  # noqa: F401

app = FastAPI(
    title="R de Rico ERP API",
    description="Backend Monolito Modular para ERP",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# OUTBOX PROCESSOR: Procesar eventos POS → Almacenes en background
# ---------------------------------------------------------------------------
import asyncio

@app.on_event("startup")
async def start_warehouse_processor():
    """Inicia el procesador de eventos del Outbox Pattern (polling cada 30s)."""
    try:
        from modules.warehouse.service import process_warehouse_events
        asyncio.create_task(process_warehouse_events())
        logger.info("Warehouse Outbox Processor iniciado (polling 30s)")
    except Exception as e:
        logger.warning("Warehouse Processor no iniciado: %s", e)

# ---------------------------------------------------------------------------
# AUTO-SEED: Crear tablas + usuario admin en primera ejecución
# ---------------------------------------------------------------------------
@app.on_event("startup")
async def auto_seed_on_first_boot():
    """
    Detecta si la base de datos está vacía (instalación nueva) y:
    1. Crea todas las tablas (idempotente - no toca las existentes).
    2. Siembra los 3 perfiles de seguridad base.
    3. Crea el usuario ADMINISTRADOR de emergencia (código 1111).
    Seguro para ejecutarse en cada reinicio - no duplica ni sobreescribe datos.
    """
    try:
        # Paso 1: Crear tablas que no existan (idempotente)
        async with engine.begin() as conn:
            await conn.execute(text('DROP TABLE IF EXISTS warehouse_items CASCADE'))
            await conn.execute(text('DROP TABLE IF EXISTS warehouses CASCADE'))
            await conn.run_sync(Base.metadata.create_all)
        logger.info("Tablas verificadas/creadas.")

        # Paso 1.5: Migraciones de columnas nuevas (idempotente)
        # create_all no agrega columnas a tablas existentes (ver Error F — Grandeza docs).
        # Cada migración verifica existencia antes de ejecutar ALTER TABLE.
        migrations = [
            ("grandeza_visits", "ext_client_phone", "VARCHAR"),
            ("grandeza_orders", "client_phone", "VARCHAR"),
            # HR Module: columnas nuevas en tabla employees
            ("employees", "employee_number", "INTEGER"),
            ("employees", "exclude_attendance", "BOOLEAN DEFAULT FALSE"),
        ]
        async with engine.begin() as conn:
            for table, column, col_type in migrations:
                check = await conn.execute(
                    text(
                        "SELECT 1 FROM information_schema.columns "
                        "WHERE table_name = :table AND column_name = :column"
                    ),
                    {"table": table, "column": column}
                )
                if not check.scalar():
                    await conn.execute(text(f'ALTER TABLE {table} ADD COLUMN {column} {col_type}'))
                    logger.info("Migración: %s.%s agregada.", table, column)

        async with AsyncSessionLocal() as session:
            # Paso 2: Sembrar perfiles de seguridad base
            perfiles_base = [
                {
                    "name": "ADMIN",
                    "description": "Acceso total al sistema",
                    "permissions": {
                        "overview": "full", "pos_retail": "full", "inventory": "full",
                        "warehouse": "full", "vision_train": "full", "production": "full",
                        "financials": "full", "invoicing": "full", "purchasing": "full",
                        "procurement": "full", "logistics": "full", "pos_tables": "full",
                        "waiter": "full", "driver": "full", "seguridad_acceso": "full",
                        "auditoria": "full"
                    },
                    "is_system": True
                },
                {
                    "name": "MANAGER",
                    "description": "Gestión operativa",
                    "permissions": {
                        "overview": "full", "pos_retail": "full", "inventory": "full",
                        "warehouse": "full", "vision_train": "full", "production": "full",
                        "financials": "read", "invoicing": "full", "purchasing": "full",
                        "logistics": "full", "seguridad_acceso": "read"
                    },
                    "is_system": True
                },
                {
                    "name": "CAJERO",
                    "description": "Operación de ventas",
                    "permissions": {
                        "overview": "full", "pos_retail": "full", "invoicing": "limited"
                    },
                    "is_system": True
                },
            ]

            admin_profile_id = None
            for p_data in perfiles_base:
                res = await session.execute(
                    select(SecurityProfile).where(SecurityProfile.name == p_data["name"])
                )
                perfil = res.scalar_one_or_none()
                if not perfil:
                    perfil = SecurityProfile(**p_data)
                    session.add(perfil)
                    await session.flush()
                    logger.info("Perfil '%s' creado.", p_data['name'])
                if p_data["name"] == "ADMIN":
                    admin_profile_id = perfil.id

            # Paso 3: Crear usuario administrador de emergencia (1111)
            res = await session.execute(
                select(Employee).where(Employee.employee_code == "1111")
            )
            admin_user = res.scalar_one_or_none()

            if not admin_user:
                admin_user = Employee(
                    name="ADMINISTRADOR",
                    employee_code="1111",
                    role="ADMIN",
                    profile_id=admin_profile_id,
                    is_active=True
                )
                session.add(admin_user)
                logger.info("Primera ejecución detectada. Usuario ADMIN '1111' creado.")

            await session.commit()
            logger.info("Seed de seguridad verificado.")

            # Paso 4: Sembrar ajustes de sistema (polling, TTL, heartbeat)
            await seed_system_settings(session)
            logger.info("Ajustes de sistema verificados.")

            # Paso 5: Sembrar datos base de RRHH (puestos + reglamento)
            from modules.hr.service import seed_puestos_base, seed_regulaciones
            await seed_puestos_base(session)
            await seed_regulaciones(session)
            logger.info("Datos base de RRHH verificados.")

    except Exception as e:
        logger.error("Error en auto-seed: %s", e)

# ---------------------------------------------------------------------------
# Asegurar categorías de sistema
# ---------------------------------------------------------------------------
@app.on_event("startup")
async def ensure_system_categories():
    """Asegura que la categoría 'DESCONTINUADOS' exista como categoría de sistema."""
    async with AsyncSessionLocal() as db:
        try:
            stmt = select(Category).where(Category.name == "DESCONTINUADOS")
            result = await db.execute(stmt)
            category = result.scalar_one_or_none()

            if not category:
                new_cat = Category(
                    name="DESCONTINUADOS",
                    icon="🗑️",
                    position=999,
                    vision_enabled=False,
                    is_system=True
                )
                db.add(new_cat)
                await db.commit()
                logger.info("Categoría 'DESCONTINUADOS' creada como sistema.")
            else:
                if not category.is_system:
                    category.is_system = True
                    category.vision_enabled = False
                    await db.commit()
                    logger.info("Categoría 'DESCONTINUADOS' actualizada como sistema.")
        except Exception as e:
            logger.error("Error asegurando categorías de sistema: %s", e)
            await db.rollback()

# ---------------------------------------------------------------------------
# v8: Asegurar subcategorías de sistema de almacén
# ---------------------------------------------------------------------------
@app.on_event("startup")
async def ensure_warehouse_propositos():
    """v8: garantiza que las 4 subcategorías base de almacén existan.

    Es idempotente y aditivo: si la migración f5a6b7c8d9e0 ya sembró las filas,
    no hace nada. Si alguien las borró por error, las recrea. Nunca modifica
    `label`/`icon` de una subcategoría existente (el usuario puede haberlas
    personalizado).
    """
    from modules.warehouse.models import WarehouseProposito

    base = [
        {"codigo": "EXHIBICION_VENTA", "label": "Almacenes / Exhibidores", "icon": "🏪", "orden": 1, "es_cuarentena": False},
        {"codigo": "ALMACENAMIENTO", "label": "Almacenes de Insumos", "icon": "📦", "orden": 2, "es_cuarentena": False},
        {"codigo": "EQUIPAMIENTO", "label": "Almacenes de Equipamiento", "icon": "🔧", "orden": 3, "es_cuarentena": False},
        {"codigo": "SIN_CLASIFICAR", "label": "Sin Clasificar", "icon": "🗂️", "orden": 999, "es_cuarentena": True},
    ]

    async with AsyncSessionLocal() as db:
        try:
            creadas = 0
            for item in base:
                stmt = select(WarehouseProposito).where(WarehouseProposito.codigo == item["codigo"])
                result = await db.execute(stmt)
                existente = result.scalar_one_or_none()
                if not existente:
                    db.add(WarehouseProposito(
                        codigo=item["codigo"],
                        label=item["label"],
                        icon=item["icon"],
                        orden=item["orden"],
                        es_sistema=True,
                        es_cuarentena=item["es_cuarentena"],
                        activo=True,
                    ))
                    creadas += 1

            if creadas:
                await db.commit()
                logger.info("Subcategorías de almacén creadas: %s", creadas)
        except Exception as e:
            logger.error("Error asegurando subcategorías de almacén: %s", e)
            await db.rollback()

@app.get("/health")
async def health_check():
    return {"status": "ok", "version": "1.0.0"}

app.include_router(catalog_router, prefix="/api/v1/catalog", tags=["Catalog"])
app.include_router(pos_router, prefix="/api/v1/pos", tags=["POS"])
app.include_router(security_router, prefix="/api/v1/security", tags=["Security"])
app.include_router(cash_router, prefix="/api/v1/cash", tags=["Cash"])
app.include_router(settings_router, prefix="/api/v1/settings", tags=["Settings"])
app.include_router(production_router, prefix="/api/v1/production", tags=["Production"])
app.include_router(orders_router, prefix="/api/v1/orders", tags=["Orders"])
app.include_router(delivery_settings_router, prefix="/api/v1/delivery-settings", tags=["DeliverySettings"])
app.include_router(analytics_router, prefix="/api/v1", tags=["Analytics"])
app.include_router(network_router, prefix="/api/v1/network", tags=["Network"])
app.include_router(grandeza_router, prefix="/api/v1/grandeza", tags=["Grandeza"])
app.include_router(hr_router, prefix="/api/v1/hr", tags=["HR"])
app.include_router(warehouse_router, prefix="/api/v1/warehouse", tags=["Warehouse"])
app.include_router(heladeria_router, prefix="/api/v1/heladeria", tags=["Heladeria"])
app.include_router(ai_router, prefix="/api/v1/ai", tags=["AI"])

# Montar carpetas de archivos estáticos
app.mount("/static/catalog", StaticFiles(directory="static/catalog"), name="catalog")
app.mount("/static/images", StaticFiles(directory="static/images"), name="images")
# v7 (Fase 8): dataset de entrenamiento de vision. Montaje ADITIVO: sirve las
# imagenes capturadas para que el canvas de anotacion pueda cargarlas.
# NOTA: la ruta debe coincidir con la que escribe el servicio
# (POSService._training_dir -> "apps/api/static/training"), NO con "static/".
app.mount("/static/training", StaticFiles(directory="apps/api/static/training"), name="training")
# V16 (Fase 16.2): imágenes del Display Tótem de Heladería. Montaje ADITIVO:
# no altera los montajes existentes que consume el POS de Panadería.
app.mount("/media/totem", StaticFiles(directory="media/totem"), name="totem")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=3001, reload=True)
