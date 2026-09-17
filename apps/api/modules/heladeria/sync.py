"""
Proyección del catálogo genérico hacia la configuración de Heladería.
=====================================================================

ARQUITECTURA
------------
El catálogo (`products` + `products.technical_data`) es la ÚNICA fuente de
verdad. `heladeria_product_config` es una PROYECCIÓN IDEMPOTENTE de la
intención declarada por el usuario en el Maestro de Productos.

    Maestro de Productos (UI)
        └─ technical_data.heladeria_enabled = true
        └─ technical_data.heladeria_component_type = 'SABOR'
                ↓  PUT /catalog/products/{id}
    catalog/service.py  (guarda el producto)
                ↓  sync_product_config(db, product)
    heladeria/sync.py   (ESTE MÓDULO — único escritor de la tabla puente)
                ↓  upsert / delete
    heladeria_product_config
                ↓
    get_menu() → POS de Heladería
    get_display_menu() → Display de Precios

REGLAS
------
1. Este módulo es el ÚNICO escritor de `heladeria_product_config` desde la UI.
   `seed_heladeria_data.py` sigue siendo el sembrador inicial.
2. La función es idempotente: llamarla N veces produce el mismo estado.
3. Si el producto no declara intención de heladería, la fila puente se ELIMINA.
4. `component_type` se valida contra el conjunto canónico; un valor inválido
   se trata como "sin intención" (no se crea fila).
"""
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from modules.catalog.models import Product
from .models import HeladeriaProductConfig

# Conjunto canónico. Debe coincidir con COMPONENT_TYPE_ORDER de
# apps/heladeria/utils/displayMappers.js y con el docstring de models.py.
VALID_COMPONENT_TYPES = frozenset({
    "RECIPIENTE",
    "TAMAÑO",
    "SABOR",
    "EXTRA",
    "BEBIDA_BASE",
})

# Claves de technical_data que gobiernan la proyección.
KEY_ENABLED = "heladeria_enabled"
KEY_COMPONENT_TYPE = "heladeria_component_type"


def read_heladeria_intent(product: Product) -> Optional[str]:
    """
    Extrae el `component_type` declarado por el producto, o None si no aplica.

    Devuelve None cuando:
      - el producto no tiene technical_data,
      - `heladeria_enabled` es falso/ausente,
      - `heladeria_component_type` no está en el conjunto canónico.

    Función pura: no toca la base de datos. Testeable de forma aislada.
    """
    technical_data = getattr(product, "technical_data", None) or {}
    if not technical_data.get(KEY_ENABLED):
        return None

    component_type = technical_data.get(KEY_COMPONENT_TYPE)
    if component_type not in VALID_COMPONENT_TYPES:
        return None

    return component_type


async def _find_config(db: AsyncSession, product_id: int) -> Optional[HeladeriaProductConfig]:
    """Busca la fila puente de un producto. Devuelve None si no existe."""
    result = await db.execute(
        select(HeladeriaProductConfig).where(
            HeladeriaProductConfig.product_id == product_id
        )
    )
    return result.scalar_one_or_none()


async def sync_product_config(db: AsyncSession, product: Product) -> Optional[HeladeriaProductConfig]:
    """
    Proyecta la intención de heladería de un producto a la tabla puente.

    v8 (POS-SELECTOR): el rol se resuelve con precedencia
    (intención explícita del producto → rol por defecto de la categoría), y la
    proyección solo ocurre si la categoría declara `pos_target` HELADERIA/AMBOS.

    Casos:
      - proyectable + fila ausente   → INSERT
      - proyectable + fila existente → UPDATE component_type
      - no proyectable + fila existente → DELETE
      - no proyectable + fila ausente   → no-op

    NO hace commit: el llamador controla la transacción. Esto permite que el
    guardado del producto y su proyección sean atómicos.
    """
    if product is None or product.id is None:
        return None

    existing = await _find_config(db, product.id)

    if not projects_to_heladeria(product):
        if existing is not None:
            await db.delete(existing)
        return None

    intent = resolve_effective_role(product)

    if existing is not None:
        existing.component_type = intent
        return existing

    created = HeladeriaProductConfig(
        product_id=product.id,
        component_type=intent,
        is_available=True,
        position=product.position or 0,
    )
    db.add(created)
    return created


async def remove_product_config(db: AsyncSession, product_id: int) -> bool:
    """
    Elimina la fila puente de un producto. Devuelve True si existía.

    Se usa al borrar un producto, como red de seguridad adicional al
    ON DELETE CASCADE de la clave foránea.
    """
    existing = await _find_config(db, product_id)
    if existing is None:
        return False
    await db.delete(existing)
    return True


# ═══════════════════════════════════════════════════════════════
# v8 (POS-SELECTOR): resolución del rol efectivo en Heladería
# ═══════════════════════════════════════════════════════════════

def _safe_category(product: Product):
    """
    Devuelve la categoría del producto SIN disparar un lazy load implícito.

    v8 (FIX-MG): en un contexto async (asyncpg) acceder a una relación no
    cargada provoca `MissingGreenlet`. Aquí inspeccionamos el estado de
    SQLAlchemy: si la relación ya está en memoria la devolvemos; si no,
    devolvemos None en lugar de provocar IO inesperado.

    El llamador es responsable de eager-loadear la relación cuando la
    necesite (ver `CatalogService._project_heladeria`).
    """
    from sqlalchemy import inspect as sa_inspect

    try:
        state = sa_inspect(product)
    except Exception:
        return None

    if "category" in state.unloaded:
        return None

    return state.attrs.category.value


def resolve_effective_role(product: Product) -> Optional[str]:
    """
    Resuelve el rol efectivo de un producto dentro del menú de Heladería.

    Precedencia (de más específico a más general):
      1. Intención explícita del producto (`technical_data.heladeria_component_type`).
      2. Rol por defecto de su categoría (`category.heladeria_default_role`).

    Devuelve None si ninguna de las dos fuentes declara un rol válido. En ese
    caso el producto NO se proyecta al menú de Heladería.

    Función pura: no toca la base de datos. Testeable de forma aislada.
    """
    explicit = read_heladeria_intent(product)
    if explicit is not None:
        return explicit

    category = _safe_category(product)
    if category is None:
        return None

    default_role = getattr(category, "heladeria_default_role", None)
    if default_role in VALID_COMPONENT_TYPES:
        return default_role

    return None


def projects_to_heladeria(product: Product) -> bool:
    """
    Determina si un producto debe aparecer en el POS de Heladería.

    Un producto se proyecta cuando:
      - su categoría declara `pos_target` HELADERIA o AMBOS, Y
      - existe un rol efectivo (explícito o heredado de la categoría).

    Función pura: no toca la base de datos.
    """
    category = getattr(product, "category", None)
    if category is None:
        return False

    pos_target = str(getattr(category, "pos_target", "PANADERIA") or "PANADERIA").upper()
    if pos_target not in ("HELADERIA", "AMBOS"):
        return False

    return resolve_effective_role(product) is not None
