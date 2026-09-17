from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from sqlalchemy import delete
from sqlalchemy.exc import IntegrityError
from . import models, schemas
from modules.production import service as prod_service
from modules.production import schemas as prod_schemas
# v8 (HEL-P): proyección del catálogo hacia la configuración de Heladería.
# Import perezoso dentro de los métodos para evitar circularidad de imports
# (heladeria.sync importa modules.catalog.models).


# ═══════════════════════════════════════════════════════════════
# v8 (POS-SELECTOR): catálogos cerrados de proyección a POS
# ═══════════════════════════════════════════════════════════════

# Destinos válidos de una categoría. Es un catálogo cerrado: cualquier valor
# fuera de esta lista se degrada a 'PANADERIA' (el comportamiento histórico).
VALID_POS_TARGETS = ("PANADERIA", "HELADERIA", "AMBOS")

# Roles válidos dentro del menú de Heladería. Espejo de
# `heladeria.sync.VALID_COMPONENT_TYPES` y de `COMPONENT_TYPE_ORDER`.
VALID_HELADERIA_ROLES = ("RECIPIENTE", "TAMAÑO", "SABOR", "EXTRA", "BEBIDA_BASE")

# Destinos que proyectan la categoría al POS de Heladería.
POS_TARGETS_WITH_HELADERIA = ("HELADERIA", "AMBOS")


def _normalize_pos_target(raw) -> str:
    """
    Normaliza el destino de POS de una categoría.

    Regla: si el valor no pertenece al catálogo cerrado, se degrada a
    'PANADERIA'. Nunca lanza excepción — un cliente desactualizado no debe
    poder corromper la proyección.
    """
    value = str(raw or "").strip().upper()
    return value if value in VALID_POS_TARGETS else "PANADERIA"


def _normalize_heladeria_role(raw, pos_target: str):
    """
    Normaliza el rol por defecto en Heladería.

    Regla: si la categoría NO proyecta a Heladería, el rol se limpia (None)
    para evitar estado zombie. Si proyecta, el valor debe pertenecer al
    catálogo cerrado; de lo contrario se limpia.
    """
    if pos_target not in POS_TARGETS_WITH_HELADERIA:
        return None
    value = str(raw or "").strip().upper()
    return value if value in VALID_HELADERIA_ROLES else None


class CatalogService:
    async def get_categories(self, db: AsyncSession):
        result = await db.execute(select(models.Category).order_by(models.Category.position.asc(), models.Category.name.asc()))
        return result.scalars().all()

    async def create_category(self, db: AsyncSession, category: schemas.CategoryCreate):
        db_category = models.Category(**category.model_dump())
        db.add(db_category)
        await db.commit()
        await db.refresh(db_category)
        return db_category

    async def update_category(self, db: AsyncSession, category_id: int, category: schemas.CategoryCreate):
        result = await db.execute(select(models.Category).where(models.Category.id == category_id))
        db_cat = result.scalar_one_or_none()
        if not db_cat:
            return None
        
        # Proteger categorías de sistema (no cambiar nombre ni borrar, pero talvez permitir visibilidad?)
        # El usuario dice "que NO sean de sistema" para editar/borrar/ocultar.
        if db_cat.is_system:
            # Solo permitimos actualizar vision_enabled si acaso, pero el usuario dice "que NO sean del sistema"
            # Así que bloqueamos todo para categorías de sistema por ahora.
            return db_cat
        
        db_cat.name = category.name
        db_cat.icon = category.icon
        db_cat.vision_enabled = category.vision_enabled
        # v8 (HEL-P): primer nivel de la proyeccion a heladeria_product_config.
        db_cat.heladeria_enabled = category.heladeria_enabled
        # v8 (POS-SELECTOR): destino de la categoria hacia los POS.
        # Normalizamos a mayusculas y validamos contra el catalogo cerrado para
        # que un valor corrupto del cliente no ensucie la proyeccion.
        db_cat.pos_target = _normalize_pos_target(category.pos_target)
        # v8 (POS-SELECTOR): rol por defecto en el menu de Heladeria.
        # Se limpia si la categoria no proyecta a Heladeria (evita estado zombie).
        db_cat.heladeria_default_role = _normalize_heladeria_role(
            category.heladeria_default_role, db_cat.pos_target
        )
        await db.commit()
        await db.refresh(db_cat)

        # v8 (POS-SELECTOR): cascada. Al cambiar el destino o el rol por defecto
        # de la categoria, TODOS sus productos deben re-proyectarse. Esto es lo
        # que permite "crear la categoria, arrastrarle productos y listo".
        await self._reproject_category_products(db, category_id)

        return db_cat

    async def _reproject_category_products(self, db: AsyncSession, category_id: int):
        """
        v8 (POS-SELECTOR): re-proyecta todos los productos de una categoria a la
        tabla puente de Heladeria. Import perezoso para evitar circularidad.

        Es idempotente: `sync_product_config` decide INSERT/UPDATE/DELETE segun
        la intencion efectiva de cada producto.
        """
        from modules.heladeria.sync import sync_product_config

        result = await db.execute(
            select(models.Product)
            .options(selectinload(models.Product.category))
            .where(models.Product.category_id == category_id)
        )
        for db_product in result.scalars().all():
            await sync_product_config(db, db_product)
        await db.commit()

    async def delete_category(self, db: AsyncSession, category_id: int):
        # 1. Verificar existencia y exclusión de categorías de sistema
        result = await db.execute(select(models.Category).where(models.Category.id == category_id))
        db_cat = result.scalar_one_or_none()
        if not db_cat or db_cat.is_system:
            return False
            
        # 2. Verificar si la categoría está vacía (Integridad Imperial)
        result_prod = await db.execute(
            select(models.Product).where(models.Product.category_id == category_id)
        )
        if result_prod.scalar_one_or_none():
            # Si hay productos, no permitimos borrar (el usuario debe moverlos a DESCONTINUADOS)
            raise ValueError("No se puede eliminar una categoría que contiene productos.")

        await db.delete(db_cat)
        await db.commit()
        return True

    async def get_products(self, db: AsyncSession, category_id: int = None):
        query = select(models.Product).where(models.Product.active == True).options(
            selectinload(models.Product.category), 
            selectinload(models.Product.technical_sheet)
        ).order_by(models.Product.position.asc(), models.Product.name.asc())
        
        if category_id:
            query = query.where(models.Product.category_id == category_id)
        result = await db.execute(query)
        return result.scalars().all()

    async def create_product(self, db: AsyncSession, product: schemas.ProductCreate):
        product_data = product.model_dump(exclude={"technical_data"})
        db_product = models.Product(**product_data)
        db.add(db_product)
        await db.commit()
        await db.refresh(db_product)
        
        if product.technical_data:
            tech_data = prod_schemas.TechnicalSheetCreate(product_id=db_product.id, **product.technical_data)
            await prod_service.upsert_technical_sheet(db, tech_data)

        await self._project_heladeria(db, db_product)

        result = await db.execute(
            select(models.Product)
            .options(selectinload(models.Product.category), selectinload(models.Product.technical_sheet))
            .where(models.Product.id == db_product.id)
        )
        return result.scalar_one()

    async def _project_heladeria(self, db: AsyncSession, db_product: models.Product):
        """
        v8 (HEL-P): proyecta la intención de heladería del producto a la tabla
        puente `heladeria_product_config`. Import perezoso para evitar
        circularidad (heladeria.sync importa modules.catalog.models).

        v8 (FIX-MG): `sync_product_config` inspecciona `product.category` para
        resolver el rol efectivo. Si la relación no está cargada, SQLAlchemy
        intenta un lazy load implícito, lo que en asyncpg dispara
        `MissingGreenlet`. Por eso recargamos el producto con `selectinload`
        ANTES de proyectar, garantizando que la relación ya esté en memoria.
        """
        from modules.heladeria.sync import sync_product_config

        result = await db.execute(
            select(models.Product)
            .options(selectinload(models.Product.category))
            .where(models.Product.id == db_product.id)
        )
        hydrated = result.scalar_one_or_none()
        if hydrated is None:
            return

        await sync_product_config(db, hydrated)
        await db.commit()

    async def update_product(self, db: AsyncSession, product_id: int, product: schemas.ProductUpdate):
        result = await db.execute(
            select(models.Product).where(models.Product.id == product_id)
        )
        db_product = result.scalar_one_or_none()
        if not db_product:
            return None
            
        product_data = product.model_dump(exclude={"technical_data"}, exclude_unset=True)
        for key, value in product_data.items():
            setattr(db_product, key, value)
            
        await db.commit()
        await db.refresh(db_product)
        
        if product.technical_data is not None:
            # Evitar colisión de product_id si viene en technical_data
            t_data = product.technical_data.copy()
            t_data.pop("product_id", None)
            tech_data = prod_schemas.TechnicalSheetCreate(product_id=product_id, **t_data)
            await prod_service.upsert_technical_sheet(db, tech_data)

        await self._project_heladeria(db, db_product)

        result = await db.execute(
            select(models.Product)
            .options(selectinload(models.Product.category), selectinload(models.Product.technical_sheet))
            .where(models.Product.id == product_id)
        )
        return result.scalar_one()

    async def delete_product(self, db: AsyncSession, product_id: int):
        result = await db.execute(select(models.Product).where(models.Product.id == product_id))
        db_product = result.scalar_one_or_none()
        if not db_product:
            return False

        # v8 (HEL-P): limpiar la proyección de heladería antes de borrar.
        # Red de seguridad adicional al ON DELETE CASCADE de la FK.
        from modules.heladeria.sync import remove_product_config
        await remove_product_config(db, product_id)
        await db.commit()

        try:
            await db.delete(db_product)
            await db.commit()
            return True
        except IntegrityError:
            await db.rollback()
            # Soft delete to preserve historical integrity (e.g. sales tickets, inventory transactions)
            db_product.active = False
            await db.commit()
            return True

    async def clear_catalog(self, db: AsyncSession):
        """Función deshabilitada por seguridad."""
        pass

    async def bulk_import(self, db: AsyncSession, data: list):
        """Importa una lista de productos en masa, creando categorias si no existen y evitando duplicados exactos."""
        count = 0
        for item in data:
            name = str(item.get('name', '')).strip()
            price = float(item.get('price', 0))
            sku = str(item.get('sku', '')).strip()

            if not name: continue

            # Evitar duplicados por nombre y SKU
            existing = await db.execute(select(models.Product).where((models.Product.name == name) & (models.Product.sku == sku)))
            if existing.scalar_one_or_none():
                continue

            cat_name = str(item.get('category', 'TODOS')).strip().upper()
            if not cat_name or cat_name == 'NAN' or cat_name == 'GENERAL':
                cat_name = 'TODOS'

            result = await db.execute(select(models.Category).where(models.Category.name == cat_name))
            db_category = result.scalar_one_or_none()
            if not db_category:
                db_category = models.Category(name=cat_name, icon="")
                db.add(db_category)
                await db.flush()

            db_product = models.Product(
                name=name,
                price=price,
                sku=sku or f"SKU-{count}",
                category=db_category
            )
            db.add(db_product)
            count += 1

        await db.commit()
        return count

    async def reorder_categories(self, db: AsyncSession, category_ids: list):
        """Actualiza el campo position de una lista de IDs de categoría en el orden recibido."""
        for index, cat_id in enumerate(category_ids):
            result = await db.execute(select(models.Category).where(models.Category.id == cat_id))
            category = result.scalar_one_or_none()
            if category:
                category.position = index
        await db.commit()
        return True

    async def reorder_products(self, db: AsyncSession, product_ids: list):
        """Actualiza el campo position de una lista de IDs de producto en el orden recibido."""
        for index, prod_id in enumerate(product_ids):
            result = await db.execute(select(models.Product).where(models.Product.id == prod_id))
            product = result.scalar_one_or_none()
            if product:
                product.position = index
        await db.commit()
        return True


catalog_service = CatalogService()
