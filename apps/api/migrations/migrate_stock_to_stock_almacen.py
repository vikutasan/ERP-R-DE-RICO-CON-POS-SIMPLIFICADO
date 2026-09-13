"""
Migración v7 (Fase 0.5.3E): Unificar la fuente de verdad del stock
==================================================================
Migra el contenido de la columna OBSOLETA `products.stock` hacia la tabla
`stock_almacen` (módulo warehouse), que es la ÚNICA fuente de verdad.

Contexto (D-STOCK):
    El sistema tenía dos fuentes de stock en conflicto:
      - `products.stock`  (columna heredada, sin desglose por almacén)
      - `stock_almacen.cantidad_actual` (fuente real, con bloqueo optimista)
    El POS descuenta en `stock_almacen` mientras el catálogo mostraba un número
    distinto leído de `products.stock`. Esta migración cierra esa brecha.

Estrategia (idempotente):
    1. Para cada producto con `stock > 0` que NO tenga ya un registro en
       `stock_almacen`, se crea un registro en el almacén destino designado.
    2. Si el producto YA tiene stock en `stock_almacen`, NO se toca: se registra
       la discrepancia en el log para revisión manual (nunca se sobreescribe
       stock real con un valor heredado).
    3. Se puede ejecutar múltiples veces sin duplicar ni corromper datos.

Almacén destino:
    Se elige por nombre vía la variable de entorno STOCK_MIGRATION_WAREHOUSE
    (default: "Bodega Insumos"). Si no existe, el script aborta sin escribir.

Uso:
    docker exec rderico-api-dev python migrations/migrate_stock_to_stock_almacen.py

Rollback:
    Restaurar backup pg_dump. Los registros creados por este script se pueden
    identificar por `stock_minimo = 0 AND stock_maximo = 0 AND version = 1`
    creados en la misma fecha de ejecución (ver log de salida).
"""
import asyncio
import logging
import os
import sys

# Asegurar que /app está en el path para encontrar 'core' y 'modules'
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from sqlalchemy import text
from core.database import engine

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Almacén destino para el stock heredado. Configurable por entorno (principio SaaS:
# no hardcodear una sucursal; el operador decide dónde cae el stock migrado).
WAREHOUSE_NAME = os.environ.get("STOCK_MIGRATION_WAREHOUSE", "Bodega Insumos")


async def main():
    logger.info("=" * 70)
    logger.info("Migración v7 Fase 0.5.3E: products.stock -> stock_almacen")
    logger.info("Almacén destino: '%s'", WAREHOUSE_NAME)
    logger.info("=" * 70)

    async with engine.begin() as conn:
        # 1. Resolver el almacén destino. Si no existe, abortar sin escribir.
        res = await conn.execute(
            text("SELECT id, nombre FROM almacenes WHERE nombre = :n AND activo = TRUE LIMIT 1"),
            {"n": WAREHOUSE_NAME},
        )
        almacen = res.first()
        if not almacen:
            logger.error(
                "ABORTADO: no existe un almacén activo llamado '%s'. "
                "Créelo o ajuste STOCK_MIGRATION_WAREHOUSE.", WAREHOUSE_NAME,
            )
            return
        almacen_id = almacen[0]
        logger.info("Almacén destino resuelto: %s (%s)", almacen[1], almacen_id)

        # 2. Detectar productos con stock heredado > 0.
        res = await conn.execute(
            text("SELECT sku, name, stock FROM products WHERE stock IS NOT NULL AND stock > 0")
        )
        productos = res.fetchall()
        logger.info("Productos con products.stock > 0: %d", len(productos))

        creados = 0
        ya_existentes = 0
        discrepancias = []

        for sku, name, stock_heredado in productos:
            # 3. ¿Ya existe un registro en stock_almacen para este SKU?
            res = await conn.execute(
                text(
                    "SELECT id, cantidad_actual FROM stock_almacen "
                    "WHERE item_id = :sku AND item_type = 'PRODUCTO' LIMIT 1"
                ),
                {"sku": sku},
            )
            existente = res.first()

            if existente:
                # No sobreescribir stock real. Registrar discrepancia para revisión.
                ya_existentes += 1
                cantidad_real = float(existente[1] or 0.0)
                if abs(cantidad_real - float(stock_heredado)) > 0.001:
                    discrepancias.append((sku, name, float(stock_heredado), cantidad_real))
                continue

            # 4. Crear el registro de stock en el almacén destino.
            await conn.execute(
                text(
                    """
                    INSERT INTO stock_almacen
                        (id, almacen_id, item_id, item_type, cantidad_actual,
                         stock_minimo, stock_maximo, fecha_ingreso, version, ultima_actualizacion)
                    VALUES
                        (:id, :almacen_id, :sku, 'PRODUCTO', :cantidad,
                         0, 0, NOW(), 1, NOW())
                    """
                ),
                {
                    "id": f"stk_mig{os.urandom(3).hex()}",
                    "almacen_id": almacen_id,
                    "sku": sku,
                    "cantidad": float(stock_heredado),
                },
            )
            creados += 1

        # 5. Reporte final.
        logger.info("-" * 70)
        logger.info("RESUMEN DE MIGRACIÓN")
        logger.info("  Registros creados en stock_almacen : %d", creados)
        logger.info("  SKUs que ya tenían stock (intactos): %d", ya_existentes)
        logger.info("  Discrepancias detectadas           : %d", len(discrepancias))
        if discrepancias:
            logger.warning("DISCREPANCIAS (products.stock != stock_almacen real):")
            for sku, name, heredado, real in discrepancias:
                logger.warning(
                    "  SKU %s (%s): heredado=%.2f  real=%.2f  -> se conserva el real",
                    sku, name, heredado, real,
                )
        logger.info("-" * 70)
        logger.info(
            "NOTA: la columna products.stock queda OBSOLETA. No se elimina en esta "
            "fase; se retirará en una fase posterior tras confirmar que ningún "
            "lector la usa (ver Fase 0.5.3E del plan v7)."
        )
        logger.info("=" * 70)


if __name__ == "__main__":
    asyncio.run(main())
