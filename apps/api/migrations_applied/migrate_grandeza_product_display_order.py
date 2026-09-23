"""
MÓDULO: migrations_applied/migrate_grandeza_product_display_order.py
MISIÓN: v7.6.5 — Ergonomía de la Matriz de Pedidos de Grandeza.

Añade la columna `display_order` a `grandeza_product_config` para controlar el
orden de las columnas de producto (izquierda → derecha) en la Matriz de Pedidos.

§7.7: `create_all` NO altera tablas existentes. Por eso usamos
`ALTER TABLE ... ADD COLUMN IF NOT EXISTS` (idempotente).

Siembra el orden solicitado por el usuario:
    NUEZ=1, HIGO=2, PASAS=3, ESPOLVOREADO=4, MINIS=5

Reutiliza el motor de la propia app (`core.database.engine`) para no duplicar
credenciales ni depender de la forma del `DATABASE_URL` del entorno.

Uso (dentro del contenedor api):
    docker compose exec -T api python migrations_applied/migrate_grandeza_product_display_order.py
"""
import asyncio
import sys

from sqlalchemy import text

from core.database import engine

# Orden deseado: nombre de producto → posición (menor = más a la izquierda).
ORDEN_DESEADO = [
    ("NUEZ", 1),
    ("HIGO", 2),
    ("PASAS", 3),
    ("ESPOLVOREADO", 4),
    ("MINIS", 5),
]


async def migrate() -> None:
    print("Migrando: grandeza_product_config.display_order (v7.6.5)...")

    try:
        async with engine.begin() as conn:
            # 1. Añadir la columna (idempotente).
            print("1. Añadiendo columna display_order...")
            await conn.execute(text(
                "ALTER TABLE grandeza_product_config "
                "ADD COLUMN IF NOT EXISTS display_order INTEGER"
            ))
            await conn.execute(text(
                "CREATE INDEX IF NOT EXISTS "
                "ix_grandeza_product_config_display_order "
                "ON grandeza_product_config (display_order)"
            ))

            # 2. Sembrar el orden deseado por nombre de producto.
            print("2. Sembrando orden de columnas...")
            for nombre, posicion in ORDEN_DESEADO:
                result = await conn.execute(
                    text(
                        "UPDATE grandeza_product_config AS gpc "
                        "SET display_order = :posicion "
                        "FROM products AS p "
                        "WHERE p.id = gpc.product_id "
                        "  AND UPPER(TRIM(p.name)) = :nombre"
                    ),
                    {"posicion": posicion, "nombre": nombre},
                )
                print(f"   {nombre} → {posicion} ({result.rowcount} fila(s))")

            # 3. Verificación.
            print("3. Estado final:")
            rows = await conn.execute(text(
                "SELECT gpc.product_id, p.name, gpc.display_order "
                "FROM grandeza_product_config AS gpc "
                "JOIN products AS p ON p.id = gpc.product_id "
                "ORDER BY gpc.display_order NULLS LAST, gpc.product_id"
            ))
            for row in rows:
                print(f"   [{row.display_order}] {row.product_id} — {row.name}")

            print("Migración completada con éxito.")
    except Exception as exc:  # noqa: BLE001
        print(f"Error durante la migración: {exc}")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(migrate())
