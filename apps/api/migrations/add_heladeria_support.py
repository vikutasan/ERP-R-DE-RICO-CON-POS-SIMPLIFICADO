"""
Migración: Soporte para módulo Heladería
=========================================
Script idempotente que agrega las columnas y tablas necesarias para el módulo de heladería.
Puede ejecutarse múltiples veces sin efectos secundarios.

Ejecución:
    docker exec rderico-api-dev python migrations/add_heladeria_support.py

Cambios:
    1. ALTER TABLE categories → ADD COLUMN channel
    2. ALTER TABLE tickets → ADD COLUMN channel, customer_group_name
    3. ALTER TABLE ticket_items → ADD COLUMN recipient_name, kds_station, item_status
    4. CREATE TABLE heladeria_product_config
    5. CREATE TABLE ticket_item_components
    6. INSERT SystemSetting heladeria_terminals_config (si no existe)

Rollback:
    Ejecutar rollback_heladeria_support.sql o restaurar backup pg_dump
"""
import asyncio
import logging
import sys
import os

# Asegurar que /app está en el path para encontrar 'core' y 'modules'
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from sqlalchemy import text
from core.database import engine

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


MIGRATION_STEPS = [
    # ═══════════════════════════════════════════════════════════════
    # PASO 1: Columnas nuevas en tablas existentes (todas con DEFAULT)
    # ═══════════════════════════════════════════════════════════════
    {
        "name": "1.1 categories.channel",
        "sql": """
            DO $$ BEGIN
                ALTER TABLE categories ADD COLUMN channel VARCHAR DEFAULT 'PANADERIA';
            EXCEPTION WHEN duplicate_column THEN
                RAISE NOTICE 'Column categories.channel already exists — skipping';
            END $$;
        """
    },
    {
        "name": "1.2 tickets.channel",
        "sql": """
            DO $$ BEGIN
                ALTER TABLE tickets ADD COLUMN channel VARCHAR DEFAULT 'PANADERIA';
            EXCEPTION WHEN duplicate_column THEN
                RAISE NOTICE 'Column tickets.channel already exists — skipping';
            END $$;
        """
    },
    {
        "name": "1.3 tickets.customer_group_name",
        "sql": """
            DO $$ BEGIN
                ALTER TABLE tickets ADD COLUMN customer_group_name VARCHAR;
            EXCEPTION WHEN duplicate_column THEN
                RAISE NOTICE 'Column tickets.customer_group_name already exists — skipping';
            END $$;
        """
    },
    {
        "name": "1.4 ticket_items.recipient_name",
        "sql": """
            DO $$ BEGIN
                ALTER TABLE ticket_items ADD COLUMN recipient_name VARCHAR;
            EXCEPTION WHEN duplicate_column THEN
                RAISE NOTICE 'Column ticket_items.recipient_name already exists — skipping';
            END $$;
        """
    },
    {
        "name": "1.5 ticket_items.kds_station",
        "sql": """
            DO $$ BEGIN
                ALTER TABLE ticket_items ADD COLUMN kds_station VARCHAR;
            EXCEPTION WHEN duplicate_column THEN
                RAISE NOTICE 'Column ticket_items.kds_station already exists — skipping';
            END $$;
        """
    },
    {
        "name": "1.6 ticket_items.item_status",
        "sql": """
            DO $$ BEGIN
                ALTER TABLE ticket_items ADD COLUMN item_status VARCHAR DEFAULT 'PENDING';
            EXCEPTION WHEN duplicate_column THEN
                RAISE NOTICE 'Column ticket_items.item_status already exists — skipping';
            END $$;
        """
    },

    # ═══════════════════════════════════════════════════════════════
    # PASO 2: Tablas nuevas (CREATE IF NOT EXISTS)
    # ═══════════════════════════════════════════════════════════════
    {
        "name": "2.1 CREATE TABLE heladeria_product_config",
        "sql": """
            CREATE TABLE IF NOT EXISTS heladeria_product_config (
                id SERIAL PRIMARY KEY,
                product_id INTEGER NOT NULL UNIQUE REFERENCES products(id),
                component_type VARCHAR NOT NULL,
                max_scoops INTEGER,
                base_price NUMERIC(12, 2),
                price_per_scoop NUMERIC(12, 2),
                is_available BOOLEAN NOT NULL DEFAULT TRUE,
                position INTEGER DEFAULT 0
            )
        """
    },
    {
        "name": "2.2 INDEX heladeria_product_config.product_id",
        "sql": "CREATE INDEX IF NOT EXISTS idx_hpc_product_id ON heladeria_product_config(product_id)"
    },
    {
        "name": "2.3 INDEX heladeria_product_config.component_type",
        "sql": "CREATE INDEX IF NOT EXISTS idx_hpc_component_type ON heladeria_product_config(component_type)"
    },
    {
        "name": "2.4 CREATE TABLE ticket_item_components",
        "sql": """
            CREATE TABLE IF NOT EXISTS ticket_item_components (
                id SERIAL PRIMARY KEY,
                ticket_item_id INTEGER NOT NULL REFERENCES ticket_items(id),
                product_id INTEGER REFERENCES products(id),
                component_type VARCHAR NOT NULL,
                component_name VARCHAR NOT NULL,
                unit_price NUMERIC(12, 2) DEFAULT 0,
                quantity INTEGER DEFAULT 1
            )
        """
    },
    {
        "name": "2.5 INDEX ticket_item_components.ticket_item_id",
        "sql": "CREATE INDEX IF NOT EXISTS idx_tic_ticket_item_id ON ticket_item_components(ticket_item_id)"
    },

    # ═══════════════════════════════════════════════════════════════
    # PASO 3: Seed de configuración de terminales heladería
    # ═══════════════════════════════════════════════════════════════
    {
        "name": "3.1 SystemSetting: heladeria_terminals_config",
        "sql": """
            INSERT INTO system_settings (key, value)
            VALUES ('heladeria_terminals_config', '{"terminals": ["H1", "H2", "H-CAJA"], "max_terminals": 6}')
            ON CONFLICT (key) DO NOTHING;
        """
    },
]


async def run_migration():
    """Ejecuta todos los pasos de migración en una sola transacción."""
    logger.info("=" * 60)
    logger.info("🍦 MIGRACIÓN: Soporte para módulo Heladería")
    logger.info("=" * 60)

    async with engine.begin() as conn:
        for step in MIGRATION_STEPS:
            try:
                await conn.execute(text(step["sql"]))
                logger.info(f"  ✅ {step['name']}")
            except Exception as e:
                logger.error(f"  ❌ {step['name']}: {e}")
                raise  # Rollback automático — engine.begin() revierte todo

    logger.info("=" * 60)
    logger.info("✅ MIGRACIÓN COMPLETADA EXITOSAMENTE")
    logger.info("   Las tablas existentes no fueron afectadas.")
    logger.info("   Verifique el POS de panadería antes de continuar.")
    logger.info("=" * 60)


async def verify_migration():
    """Verifica que las columnas y tablas fueron creadas correctamente."""
    logger.info("\n🔍 Verificando migración...")

    checks = [
        ("categories.channel", "SELECT column_name FROM information_schema.columns WHERE table_name='categories' AND column_name='channel'"),
        ("tickets.channel", "SELECT column_name FROM information_schema.columns WHERE table_name='tickets' AND column_name='channel'"),
        ("tickets.customer_group_name", "SELECT column_name FROM information_schema.columns WHERE table_name='tickets' AND column_name='customer_group_name'"),
        ("ticket_items.recipient_name", "SELECT column_name FROM information_schema.columns WHERE table_name='ticket_items' AND column_name='recipient_name'"),
        ("ticket_items.kds_station", "SELECT column_name FROM information_schema.columns WHERE table_name='ticket_items' AND column_name='kds_station'"),
        ("ticket_items.item_status", "SELECT column_name FROM information_schema.columns WHERE table_name='ticket_items' AND column_name='item_status'"),
        ("heladeria_product_config", "SELECT table_name FROM information_schema.tables WHERE table_name='heladeria_product_config'"),
        ("ticket_item_components", "SELECT table_name FROM information_schema.tables WHERE table_name='ticket_item_components'"),
    ]

    async with engine.connect() as conn:
        all_ok = True
        for name, sql in checks:
            result = await conn.execute(text(sql))
            row = result.fetchone()
            if row:
                logger.info(f"  ✅ {name} — existe")
            else:
                logger.error(f"  ❌ {name} — NO ENCONTRADO")
                all_ok = False

    if all_ok:
        logger.info("\n✅ Verificación completa: TODOS los cambios aplicados correctamente")
    else:
        logger.error("\n❌ Verificación FALLIDA: algunos cambios no se aplicaron")

    return all_ok


if __name__ == "__main__":
    asyncio.run(run_migration())
    asyncio.run(verify_migration())
