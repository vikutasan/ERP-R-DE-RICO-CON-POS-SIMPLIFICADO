"""
Migración: Flag de dominio Heladería en categorías
==================================================
Script idempotente que agrega `categories.heladeria_enabled`.

Este flag es el PRIMER NIVEL de la proyección
    producto (technical_data) → heladeria_product_config

    Nivel 1 — CATEGORÍA: `categories.heladeria_enabled = true`
              declara "esta categoría pertenece al dominio Heladería".
    Nivel 2 — PRODUCTO: `products.technical_data.heladeria_component_type`
              declara "este producto es un SABOR/RECIPIENTE/EXTRA/...".

Sin el nivel 1, el bloque de Heladería no aparece en el modal de producto,
evitando ruido en productos de panadería o reventa.

Ejecución:
    docker exec rderico-api-dev python migrations/add_heladeria_category_flag.py

Rollback:
    ALTER TABLE categories DROP COLUMN heladeria_enabled;
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
    {
        "name": "1.1 categories.heladeria_enabled",
        "sql": """
            DO $$ BEGIN
                ALTER TABLE categories
                    ADD COLUMN heladeria_enabled BOOLEAN DEFAULT FALSE;
            EXCEPTION WHEN duplicate_column THEN
                RAISE NOTICE 'Column categories.heladeria_enabled already exists — skipping';
            END $$;
        """
    },
    {
        "name": "1.2 Backfill: categorías ya usadas por heladería",
        "sql": """
            UPDATE categories
               SET heladeria_enabled = TRUE
             WHERE heladeria_enabled = FALSE
               AND id IN (
                   SELECT DISTINCT p.category_id
                     FROM products p
                     JOIN heladeria_product_config hpc ON hpc.product_id = p.id
                    WHERE p.category_id IS NOT NULL
               );
        """
    },
    # NOTA: asyncpg no permite múltiples sentencias en un prepared statement.
    # Cada ALTER/UPDATE va en su propio paso.
    {
        "name": "1.3 default estable",
        "sql": """
            ALTER TABLE categories
                ALTER COLUMN heladeria_enabled SET DEFAULT FALSE;
        """
    },
    {
        "name": "1.4 backfill de NULLs",
        "sql": """
            UPDATE categories SET heladeria_enabled = FALSE
             WHERE heladeria_enabled IS NULL;
        """
    },
    {
        "name": "1.5 NOT NULL",
        "sql": """
            ALTER TABLE categories
                ALTER COLUMN heladeria_enabled SET NOT NULL;
        """
    },
]


async def run_migration():
    """Ejecuta los pasos de migración de forma idempotente."""
    logger.info("═" * 60)
    logger.info("Migración: categories.heladeria_enabled")
    logger.info("═" * 60)

    async with engine.begin() as conn:
        for step in MIGRATION_STEPS:
            try:
                await conn.execute(text(step["sql"]))
                logger.info("✅ %s", step["name"])
            except Exception as exc:  # noqa: BLE001 — reportar y abortar
                logger.error("❌ %s → %s", step["name"], exc)
                raise

    logger.info("═" * 60)
    logger.info("Migración completada")
    logger.info("═" * 60)


if __name__ == "__main__":
    asyncio.run(run_migration())
