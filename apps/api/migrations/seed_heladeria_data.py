"""
Seed de datos de prueba para el módulo Heladería.
Crea categorías, productos y configuraciones de heladería.

Ejecución:
    docker exec -w /app rderico-api-dev python migrations/seed_heladeria_data.py
"""
import asyncio
import sys
import os
import logging

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from sqlalchemy import text, select
from core.database import engine, AsyncSessionLocal
from modules.catalog.models import Category, Product
from modules.heladeria.models import HeladeriaProductConfig
# Importar TODOS los modelos (como main.py) para resolver relaciones SQLAlchemy
from modules.pos.models import Ticket, TicketItem, TerminalSession, TerminalLock
from modules.cash.models import CashSession, CashMovement
from modules.security.models import Employee, SecurityProfile

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ═══════════════════════════════════════════════════════════════
# DATOS SEED
# ═══════════════════════════════════════════════════════════════

SABORES = [
    ("Chocolate", 40.00, 1),
    ("Vainilla", 40.00, 2),
    ("Fresa", 40.00, 3),
    ("Cookies & Cream", 45.00, 4),
    ("Mango", 40.00, 5),
    ("Pistache", 50.00, 6),
    ("Nuez", 45.00, 7),
    ("Café", 40.00, 8),
    ("Chicle", 40.00, 9),
    ("Limón", 40.00, 10),
    ("Coco", 40.00, 11),
    ("Queso con Zarzamora", 50.00, 12),
    ("Mora Azul", 45.00, 13),
    ("Guanábana", 45.00, 14),
]

RECIPIENTES = [
    ("Vaso Chico (1 bola)", 45.00, 1, 1),
    ("Vaso Mediano (2 bolas)", 80.00, 2, 2),
    ("Vaso Grande (3 bolas)", 110.00, 3, 3),
    ("Cono Sencillo (1 bola)", 45.00, 1, 4),
    ("Cono Doble (2 bolas)", 85.00, 2, 5),
    ("Cono Waffle (2 bolas)", 95.00, 2, 6),
    ("Banana Split", 140.00, 3, 7),
]

EXTRAS = [
    ("Chocolate Duro", 15.00, 1),
    ("Granillo", 10.00, 2),
    ("Gomitas", 12.00, 3),
    ("Nuez Picada", 18.00, 4),
    ("Crema Batida", 15.00, 5),
    ("Jarabe de Chocolate", 10.00, 6),
    ("Jarabe de Cajeta", 12.00, 7),
]

BEBIDAS = [
    ("Malteada Chica", 65.00, 1),
    ("Malteada Grande", 85.00, 2),
    ("Agua Fresca Chica", 30.00, 3),
    ("Agua Fresca Grande", 45.00, 4),
]


async def seed():
    logger.info("=" * 60)
    logger.info("🍦 SEED: Datos de prueba para Heladería")
    logger.info("=" * 60)

    async with AsyncSessionLocal() as db:
        # 1. Crear categoría HELADERÍA si no existe
        result = await db.execute(
            select(Category).where(Category.name == "Heladería")
        )
        cat = result.scalar_one_or_none()
        if not cat:
            cat = Category(name="Heladería", icon="🍦", position=99, is_system=False)
            db.add(cat)
            await db.flush()
            logger.info(f"  ✅ Categoría 'Heladería' creada (id={cat.id})")
        else:
            logger.info(f"  ℹ️ Categoría 'Heladería' ya existe (id={cat.id})")

        # 2. Crear categoría HELADERÍA EXTRAS
        result2 = await db.execute(
            select(Category).where(Category.name == "Heladería Extras")
        )
        cat_extras = result2.scalar_one_or_none()
        if not cat_extras:
            cat_extras = Category(name="Heladería Extras", icon="✨", position=100, is_system=False)
            db.add(cat_extras)
            await db.flush()
            logger.info(f"  ✅ Categoría 'Heladería Extras' creada (id={cat_extras.id})")
        else:
            logger.info(f"  ℹ️ Categoría 'Heladería Extras' ya existe (id={cat_extras.id})")

        created_count = 0

        # 3. Crear productos SABORES
        for nombre, precio, pos in SABORES:
            sku = f"HEL-SAB-{nombre[:8].upper().replace(' ', '')}"
            existing = await db.execute(select(Product).where(Product.sku == sku))
            if existing.scalar_one_or_none():
                logger.info(f"  ℹ️ Ya existe: {nombre}")
                continue

            prod = Product(sku=sku, name=nombre, price=precio, cost=0, stock=999,
                           category_id=cat.id, active=True, nature="PREPARADO")
            db.add(prod)
            await db.flush()

            config = HeladeriaProductConfig(
                product_id=prod.id, component_type="SABOR",
                is_available=True, position=pos
            )
            db.add(config)
            created_count += 1
            logger.info(f"  🍨 Sabor: {nombre} (${precio})")

        # 4. Crear productos RECIPIENTES
        for nombre, precio, max_bolas, pos in RECIPIENTES:
            sku = f"HEL-REC-{nombre[:8].upper().replace(' ', '').replace('(', '')}"
            existing = await db.execute(select(Product).where(Product.sku == sku))
            if existing.scalar_one_or_none():
                logger.info(f"  ℹ️ Ya existe: {nombre}")
                continue

            prod = Product(sku=sku, name=nombre, price=precio, cost=0, stock=999,
                           category_id=cat.id, active=True, nature="PREPARADO")
            db.add(prod)
            await db.flush()

            config = HeladeriaProductConfig(
                product_id=prod.id, component_type="RECIPIENTE",
                max_scoops=max_bolas, base_price=precio,
                is_available=True, position=pos
            )
            db.add(config)
            created_count += 1
            logger.info(f"  🥤 Recipiente: {nombre} (${precio}, máx {max_bolas} bolas)")

        # 5. Crear productos EXTRAS
        for nombre, precio, pos in EXTRAS:
            sku = f"HEL-EXT-{nombre[:8].upper().replace(' ', '')}"
            existing = await db.execute(select(Product).where(Product.sku == sku))
            if existing.scalar_one_or_none():
                logger.info(f"  ℹ️ Ya existe: {nombre}")
                continue

            prod = Product(sku=sku, name=nombre, price=precio, cost=0, stock=999,
                           category_id=cat_extras.id, active=True, nature="PREPARADO")
            db.add(prod)
            await db.flush()

            config = HeladeriaProductConfig(
                product_id=prod.id, component_type="EXTRA",
                is_available=True, position=pos
            )
            db.add(config)
            created_count += 1
            logger.info(f"  ✨ Extra: {nombre} (${precio})")

        # 6. Crear productos BEBIDAS
        for nombre, precio, pos in BEBIDAS:
            sku = f"HEL-BEB-{nombre[:8].upper().replace(' ', '')}"
            existing = await db.execute(select(Product).where(Product.sku == sku))
            if existing.scalar_one_or_none():
                logger.info(f"  ℹ️ Ya existe: {nombre}")
                continue

            prod = Product(sku=sku, name=nombre, price=precio, cost=0, stock=999,
                           category_id=cat.id, active=True, nature="PREPARADO")
            db.add(prod)
            await db.flush()

            config = HeladeriaProductConfig(
                product_id=prod.id, component_type="BEBIDA_BASE",
                is_available=True, position=pos
            )
            db.add(config)
            created_count += 1
            logger.info(f"  🥤 Bebida: {nombre} (${precio})")

        await db.commit()
        logger.info("=" * 60)
        logger.info(f"✅ SEED COMPLETADO: {created_count} productos nuevos")
        logger.info("=" * 60)


if __name__ == "__main__":
    asyncio.run(seed())
