"""
Migración: Selector de POS en categorías
========================================
Script idempotente que agrega dos columnas a `categories`:

    pos_target              VARCHAR NOT NULL DEFAULT 'PANADERIA'
    heladeria_default_role  VARCHAR NULL

CONTEXTO ARQUITECTÓNICO
-----------------------
El POS de Panadería lee `GET /catalog/products` (todos los productos activos).
El POS de Heladería lee `GET /heladeria/menu` (agrupado por component_type).

Para que ambos POS se alimenten del MISMO maestro de productos sin editar
producto por producto, la CATEGORÍA declara su destino:

    pos_target = 'PANADERIA'  → solo aparece en el POS de Panadería
    pos_target = 'HELADERIA'  → solo aparece en el POS de Heladería
    pos_target = 'AMBOS'      → aparece en los dos

Y cuando el destino incluye Heladería, la categoría declara además el ROL
por defecto de sus productos dentro del menú de heladería:

    heladeria_default_role = 'SABOR' | 'RECIPIENTE' | 'EXTRA'
                           | 'BEBIDA_BASE' | 'TAMAÑO' | NULL

Así, arrastrar 14 productos a una categoría marcada como HELADERIA con rol
SABOR los proyecta todos como sabores de un solo golpe.

BACKFILL
--------
Las categorías que ya tenían `heladeria_enabled = TRUE` se marcan como
'HELADERIA' para preservar el comportamiento previo. El resto queda en
'PANADERIA' (el default histórico).

Ejecución:
    docker exec rderico-api-dev python migrations/add_category_pos_target.py

Rollback:
    ALTER TABLE categories DROP COLUMN pos_target;
    ALTER TABLE categories DROP COLUMN heladeria_default_role;
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


# Cada paso es una sentencia independiente: asyncpg no puede ejecutar varias
# sentencias SQL en un mismo prepared statement.
MIGRATION_STEPS = [
    {
        "name": "1.1 categories.pos_target",
        "sql": """
            DO $$ BEGIN
                ALTER TABLE categories
                    ADD COLUMN pos_target VARCHAR DEFAULT 'PANADERIA';
            EXCEPTION WHEN duplicate_column THEN
                RAISE NOTICE 'Column categories.pos_target already exists — skipping';
            END $$;
        """
    },
    {
        "name": "1.2 categories.heladeria_default_role",
        "sql": """
            DO $$ BEGIN
                ALTER TABLE categories
                    ADD COLUMN heladeria_default_role VARCHAR;
            EXCEPTION WHEN duplicate_column THEN
                RAISE NOTICE 'Column categories.heladeria_default_role already exists — skipping';
            END $$;
        """
    },
    {
        "name": "2.1 Backfill: categorías ya marcadas como Heladería",
        "sql": """
            UPDATE categories
               SET pos_target = 'HELADERIA'
             WHERE heladeria_enabled = TRUE
               AND (pos_target IS NULL OR pos_target = 'PANADERIA');
        """
    },
    {
        "name": "2.2 Backfill: normalizar NULLs a PANADERIA",
        "sql": """
            UPDATE categories
               SET pos_target = 'PANADERIA'
             WHERE pos_target IS NULL;
        """
    },
    {
        "name": "3.1 Constraint NOT NULL en pos_target",
        "sql": """
            ALTER TABLE categories
                ALTER COLUMN pos_target SET NOT NULL;
        """
    },
    {
        "name": "3.2 Constraint NOT NULL en heladeria_enabled",
        "sql": """
            ALTER TABLE categories
                ALTER COLUMN heladeria_enabled SET NOT NULL;
        """
    },
]


async def run_migration():
    """Ejecuta todos los pasos de migración en una sola transacción."""
    logger.info("=" * 60)
    logger.info("🔧 MIGRACIÓN: Selector de POS en categorías")
    logger.info("=" * 60)

    async with engine.begin() as conn:
        for step in MIGRATION_STEPS:
            try:
                await conn.execute(text(step["sql"]))
                logger.info("  ✅ %s", step["name"])
            except Exception as e:
                logger.error("  ❌ %s — %s", step["name"], e)
                raise

    logger.info("=" * 60)
    logger.info("✅ Migración completada")
    logger.info("=" * 60)


async def verify_migration():
    """Verifica que las columnas fueron creadas correctamente."""
    logger.info("🔍 Verificando migración...")

    async with engine.connect() as conn:
        result = await conn.execute(text("""
            SELECT column_name, data_type, is_nullable, column_default
              FROM information_schema.columns
             WHERE table_name = 'categories'
               AND column_name IN ('pos_target', 'heladeria_default_role')
             ORDER BY column_name;
        """))
        rows = result.fetchall()

        if len(rows) != 2:
            logger.error("  ❌ Se esperaban 2 columnas, se encontraron %d", len(rows))
            return False

        for row in rows:
            logger.info(
                "  ✅ %s — %s, nullable=%s, default=%s",
                row[0], row[1], row[2], row[3]
            )

        # Distribución de pos_target
        result = await conn.execute(text("""
            SELECT pos_target, COUNT(*) AS total
              FROM categories
             GROUP BY pos_target
             ORDER BY pos_target;
        """))
        logger.info("  📊 Distribución de pos_target:")
        for row in result.fetchall():
            logger.info("     %s: %d categorías", row[0], row[1])

    logger.info("✅ Verificación completada")
    return True


async def main():
    await run_migration()
    ok = await verify_migration()
    if not ok:
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
