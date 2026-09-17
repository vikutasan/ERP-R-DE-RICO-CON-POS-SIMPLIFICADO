"""v8 (HEL-P): tests de la proyección catálogo → heladeria_product_config.

Los tests corren DENTRO del contenedor rderico-api-dev contra la BD real de
desarrollo. Cada test crea datos con prefijo TEST_HELP_ y los elimina al
terminar, de modo que la suite es autolimpiante.

Regla de oro: NUNCA se toca el POS. Solo se insertan/borran filas propias.
"""
import pytest
import pytest_asyncio
from sqlalchemy import delete, or_, select

from core.database import AsyncSessionLocal
from modules.catalog import models as cat_models
from modules.heladeria import models as hel_models
# Importar TODOS los modelos para completar el registry de SQLAlchemy.
# TicketItemComponent (heladeria) referencia a TicketItem (pos), y Ticket (pos)
# referencia a CashSession (cash). Sin el registry completo, el mapper falla con
# "failed to locate a name". Se replica el bloque de imports de main.py.
from modules.pos.models import Ticket, TerminalSession, TerminalLock  # noqa: F401
from modules.cash.models import CashSession, CashMovement  # noqa: F401
from modules.settings.models import SystemSetting  # noqa: F401
from modules.heladeria.sync import (
    VALID_COMPONENT_TYPES,
    read_heladeria_intent,
    remove_product_config,
    sync_product_config,
)

# --- Identificadores de prueba (prefijo único para limpiar sin riesgo) ---
SKU_SABOR = "TEST_HELP_SABOR"
SKU_RECIPIENTE = "TEST_HELP_RECIPIENTE"
SKU_SIN_INTENCION = "TEST_HELP_SIN_INTENCION"
SKU_INVALIDO = "TEST_HELP_INVALIDO"
CATEGORIA = "TEST_HELP_CATEGORIA"


async def _limpiar(db):
    """
    Borra todo rastro de las pruebas HEL-P (idempotente).

    v8 (FIX-IMG): además de los SKUs canónicos, se eliminan TODOS los productos
    que apunten a la categoría de prueba. Sin esto, un producto creado por un
    test con un SKU no listado sobrevive y bloquea el borrado de la categoría
    en el setup del siguiente test (ForeignKeyViolationError).
    """
    skus = [SKU_SABOR, SKU_RECIPIENTE, SKU_SIN_INTENCION, SKU_INVALIDO]

    # IDs de productos por SKU canónico + cualquier producto colgado de la
    # categoría de prueba (cubre SKUs ad-hoc de tests puntuales).
    cat_result = await db.execute(
        select(cat_models.Category.id).where(cat_models.Category.name == CATEGORIA)
    )
    cat_ids = [row[0] for row in cat_result.all()]

    conditions = [cat_models.Product.sku.in_(skus)]
    if cat_ids:
        conditions.append(cat_models.Product.category_id.in_(cat_ids))

    result = await db.execute(
        select(cat_models.Product.id).where(or_(*conditions))
    )
    product_ids = [row[0] for row in result.all()]

    if product_ids:
        await db.execute(
            delete(hel_models.HeladeriaProductConfig).where(
                hel_models.HeladeriaProductConfig.product_id.in_(product_ids)
            )
        )
        await db.execute(
            delete(cat_models.Product).where(cat_models.Product.id.in_(product_ids))
        )

    await db.execute(
        delete(cat_models.Category).where(cat_models.Category.name == CATEGORIA)
    )
    await db.commit()


@pytest_asyncio.fixture
async def db():
    """Sesión limpia contra la BD de desarrollo, autolimpiante."""
    async with AsyncSessionLocal() as session:
        await _limpiar(session)
        yield session
        await _limpiar(session)


async def _crear_categoria(db, pos_target="HELADERIA", default_role="SABOR"):
    """
    Crea (o reutiliza) la categoría de prueba con el destino de POS indicado.

    v8 (POS-SELECTOR): la proyección a Heladería es de DOS niveles. El nivel 1
    vive en la categoría (`pos_target` + `heladeria_default_role`). Sin una
    categoría que apunte a HELADERIA/AMBOS, ningún producto se proyecta, por
    eso los tests deben crear la categoría antes que el producto.
    """
    found = await db.execute(
        select(cat_models.Category).where(cat_models.Category.name == CATEGORIA)
    )
    category = found.scalar_one_or_none()
    if category is not None:
        category.pos_target = pos_target
        category.heladeria_default_role = default_role
        category.heladeria_enabled = pos_target in ("HELADERIA", "AMBOS")
        await db.commit()
        await db.refresh(category)
        return category

    category = cat_models.Category(
        name=CATEGORIA,
        icon="",
        position=999,
        vision_enabled=False,
        is_system=False,
        heladeria_enabled=pos_target in ("HELADERIA", "AMBOS"),
        pos_target=pos_target,
        heladeria_default_role=default_role,
    )
    db.add(category)
    await db.commit()
    await db.refresh(category)
    return category


async def _crear_producto(db, sku, technical_data=None, category=None):
    """
    Inserta un producto de prueba y devuelve la instancia.

    Si no se pasa `category`, se crea/usa la categoría de prueba apuntando a
    HELADERIA con rol por defecto SABOR, de modo que el nivel 1 de la
    proyección quede satisfecho y los tests ejerciten el nivel 2 (intención
    explícita del producto).
    """
    if category is None:
        category = await _crear_categoria(db)

    product = cat_models.Product(
        sku=sku,
        name=f"Producto {sku}",
        price=45.0,
        cost=10.0,
        stock=0.0,
        nature="MANUFACTURADO",
        active=True,
        category_id=category.id,
    )
    db.add(product)
    await db.commit()
    await db.refresh(product)

    # technical_data vive en la ficha técnica, no en products.
    # Para el test lo inyectamos como atributo transitorio: read_heladeria_intent
    # lo lee con getattr, así que el contrato se respeta sin tocar el esquema.
    product.technical_data = technical_data or {}
    # La relación se asigna en memoria para que resolve_effective_role /
    # projects_to_heladeria la vean sin un lazy-load async (que fallaría).
    product.category = category
    return product


# ═══════════════════════════════════════════════════════════════
# read_heladeria_intent — función pura
# ═══════════════════════════════════════════════════════════════

class TestReadHeladeriaIntent:
    def test_sin_technical_data_devuelve_none(self):
        class FakeProduct:
            technical_data = None

        assert read_heladeria_intent(FakeProduct()) is None

    def test_flag_apagado_devuelve_none(self):
        class FakeProduct:
            technical_data = {"heladeria_enabled": False, "heladeria_component_type": "SABOR"}

        assert read_heladeria_intent(FakeProduct()) is None

    def test_flag_ausente_devuelve_none(self):
        class FakeProduct:
            technical_data = {"heladeria_component_type": "SABOR"}

        assert read_heladeria_intent(FakeProduct()) is None

    def test_component_type_invalido_devuelve_none(self):
        class FakeProduct:
            technical_data = {"heladeria_enabled": True, "heladeria_component_type": "PIZZA"}

        assert read_heladeria_intent(FakeProduct()) is None

    def test_component_type_ausente_devuelve_none(self):
        class FakeProduct:
            technical_data = {"heladeria_enabled": True}

        assert read_heladeria_intent(FakeProduct()) is None

    @pytest.mark.parametrize("component_type", sorted(VALID_COMPONENT_TYPES))
    def test_todos_los_tipos_canonicos_son_aceptados(self, component_type):
        class FakeProduct:
            technical_data = {
                "heladeria_enabled": True,
                "heladeria_component_type": component_type,
            }

        assert read_heladeria_intent(FakeProduct()) == component_type


# ═══════════════════════════════════════════════════════════════
# sync_product_config — proyección idempotente
# ═══════════════════════════════════════════════════════════════

class TestSyncProductConfig:
    async def test_intencion_presente_sin_fila_crea_registro(self, db):
        product = await _crear_producto(db, SKU_SABOR, {
            "heladeria_enabled": True,
            "heladeria_component_type": "SABOR",
        })

        await sync_product_config(db, product)
        await db.commit()

        result = await db.execute(
            select(hel_models.HeladeriaProductConfig).where(
                hel_models.HeladeriaProductConfig.product_id == product.id
            )
        )
        config = result.scalar_one()
        assert config.component_type == "SABOR"
        assert config.is_available is True

    async def test_intencion_ausente_sin_fila_no_hace_nada(self, db):
        # Categoría sin rol por defecto: el nivel 1 no aporta rol, así que la
        # ausencia de intención explícita deja al producto fuera del menú.
        category = await _crear_categoria(db, default_role=None)
        product = await _crear_producto(db, SKU_SIN_INTENCION, {}, category=category)

        result = await sync_product_config(db, product)
        await db.commit()

        assert result is None
        found = await db.execute(
            select(hel_models.HeladeriaProductConfig).where(
                hel_models.HeladeriaProductConfig.product_id == product.id
            )
        )
        assert found.scalar_one_or_none() is None

    async def test_intencion_ausente_con_fila_elimina_registro(self, db):
        # Categoría sin rol por defecto: al desmarcar el producto, el rol
        # efectivo desaparece y la fila puente debe eliminarse.
        category = await _crear_categoria(db, default_role=None)
        product = await _crear_producto(db, SKU_SABOR, {
            "heladeria_enabled": True,
            "heladeria_component_type": "SABOR",
        }, category=category)
        await sync_product_config(db, product)
        await db.commit()

        # El usuario desmarca el checkbox en el Maestro de Productos.
        product.technical_data = {"heladeria_enabled": False}
        await sync_product_config(db, product)
        await db.commit()

        found = await db.execute(
            select(hel_models.HeladeriaProductConfig).where(
                hel_models.HeladeriaProductConfig.product_id == product.id
            )
        )
        assert found.scalar_one_or_none() is None

    async def test_cambio_de_component_type_actualiza_registro(self, db):
        product = await _crear_producto(db, SKU_RECIPIENTE, {
            "heladeria_enabled": True,
            "heladeria_component_type": "RECIPIENTE",
        })
        await sync_product_config(db, product)
        await db.commit()

        product.technical_data = {
            "heladeria_enabled": True,
            "heladeria_component_type": "TAMAÑO",
        }
        await sync_product_config(db, product)
        await db.commit()

        found = await db.execute(
            select(hel_models.HeladeriaProductConfig).where(
                hel_models.HeladeriaProductConfig.product_id == product.id
            )
        )
        assert found.scalar_one().component_type == "TAMAÑO"

    async def test_idempotencia_no_duplica_filas(self, db):
        product = await _crear_producto(db, SKU_SABOR, {
            "heladeria_enabled": True,
            "heladeria_component_type": "SABOR",
        })

        for _ in range(3):
            await sync_product_config(db, product)
            await db.commit()

        found = await db.execute(
            select(hel_models.HeladeriaProductConfig).where(
                hel_models.HeladeriaProductConfig.product_id == product.id
            )
        )
        assert len(found.scalars().all()) == 1

    async def test_component_type_invalido_no_crea_fila(self, db):
        # Categoría sin rol por defecto: un component_type inválido no debe
        # caer al rol de la categoría (la intención explícita manda).
        category = await _crear_categoria(db, default_role=None)
        product = await _crear_producto(db, SKU_INVALIDO, {
            "heladeria_enabled": True,
            "heladeria_component_type": "NO_EXISTE",
        }, category=category)

        result = await sync_product_config(db, product)
        await db.commit()

        assert result is None

    async def test_producto_sin_id_devuelve_none(self, db):
        class FakeProduct:
            id = None
            technical_data = {"heladeria_enabled": True, "heladeria_component_type": "SABOR"}

        assert await sync_product_config(db, FakeProduct()) is None


# ═══════════════════════════════════════════════════════════════
# remove_product_config — limpieza al borrar
# ═══════════════════════════════════════════════════════════════

class TestRemoveProductConfig:
    async def test_elimina_fila_existente(self, db):
        product = await _crear_producto(db, SKU_SABOR, {
            "heladeria_enabled": True,
            "heladeria_component_type": "SABOR",
        })
        await sync_product_config(db, product)
        await db.commit()

        assert await remove_product_config(db, product.id) is True
        await db.commit()

        found = await db.execute(
            select(hel_models.HeladeriaProductConfig).where(
                hel_models.HeladeriaProductConfig.product_id == product.id
            )
        )
        assert found.scalar_one_or_none() is None

    async def test_devuelve_false_si_no_existe(self, db):
        category = await _crear_categoria(db, default_role=None)
        product = await _crear_producto(db, SKU_SIN_INTENCION, {}, category=category)
        assert await remove_product_config(db, product.id) is False


# ═══════════════════════════════════════════════════════════════
# Integración: get_menu() ve el producto proyectado
# ═══════════════════════════════════════════════════════════════

class TestIntegracionConGetMenu:
    async def test_producto_proyectado_aparece_en_el_menu(self, db):
        from modules.heladeria.service import get_menu

        product = await _crear_producto(db, SKU_SABOR, {
            "heladeria_enabled": True,
            "heladeria_component_type": "SABOR",
        })
        await sync_product_config(db, product)
        await db.commit()

        menu = await get_menu(db)
        nombres = [
            item.name
            for group in menu.groups
            for item in group.items
        ]
        assert f"Producto {SKU_SABOR}" in nombres

    async def test_producto_sin_intencion_no_aparece_en_el_menu(self, db):
        from modules.heladeria.service import get_menu

        # Categoría sin rol por defecto: sin rol efectivo el producto no se
        # proyecta aunque la categoría apunte a Heladería.
        category = await _crear_categoria(db, default_role=None)
        product = await _crear_producto(db, SKU_SIN_INTENCION, {}, category=category)
        await sync_product_config(db, product)
        await db.commit()

        menu = await get_menu(db)
        nombres = [
            item.name
            for group in menu.groups
            for item in group.items
        ]
        assert f"Producto {SKU_SIN_INTENCION}" not in nombres


# ═══════════════════════════════════════════════════════════════
# v8 (POS-CATEGORIAS): navegación por categoría en get_menu()
# ═══════════════════════════════════════════════════════════════

class TestNavegacionPorCategoria:
    """
    El POS de Heladería navega por CATEGORÍA, igual que el POS de Panadería.
    `get_menu()` debe exponer la identidad de categoría en cada item y un
    índice `categories` ordenado por `position`.
    """

    async def test_item_expone_category_id_y_category_name(self, db):
        from modules.heladeria.service import get_menu

        category = await _crear_categoria(db)
        product = await _crear_producto(db, SKU_SABOR, {
            "heladeria_enabled": True,
            "heladeria_component_type": "SABOR",
        }, category=category)
        await sync_product_config(db, product)
        await db.commit()

        menu = await get_menu(db)
        items = [item for group in menu.groups for item in group.items]
        objetivo = next(i for i in items if i.name == f"Producto {SKU_SABOR}")

        assert objetivo.category_id == category.id
        assert objetivo.category_name == category.name

    async def test_indice_categories_agrupa_por_categoria(self, db):
        from modules.heladeria.service import get_menu

        category = await _crear_categoria(db)
        product = await _crear_producto(db, SKU_SABOR, {
            "heladeria_enabled": True,
            "heladeria_component_type": "SABOR",
        }, category=category)
        await sync_product_config(db, product)
        await db.commit()

        menu = await get_menu(db)
        entrada = next(
            (c for c in menu.categories if c.id == category.id), None
        )

        assert entrada is not None
        assert entrada.name == category.name
        assert entrada.item_count >= 1

    async def test_indice_categories_ordenado_por_position(self, db):
        from modules.heladeria.service import get_menu

        category = await _crear_categoria(db)
        product = await _crear_producto(db, SKU_SABOR, {
            "heladeria_enabled": True,
            "heladeria_component_type": "SABOR",
        }, category=category)
        await sync_product_config(db, product)
        await db.commit()

        menu = await get_menu(db)
        posiciones = [c.position for c in menu.categories]
        assert posiciones == sorted(posiciones)

    async def test_groups_se_conserva_para_la_tienda(self, db):
        """
        El contrato `groups[].component_type` NO debe romperse: lo consumen la
        Tienda (`getMenuItemsByType`) y los Displays.
        """
        from modules.heladeria.service import get_menu

        category = await _crear_categoria(db)
        product = await _crear_producto(db, SKU_SABOR, {
            "heladeria_enabled": True,
            "heladeria_component_type": "SABOR",
        }, category=category)
        await sync_product_config(db, product)
        await db.commit()

        menu = await get_menu(db)
        tipos = [g.component_type for g in menu.groups]
        assert "SABOR" in tipos
        grupo_sabor = next(g for g in menu.groups if g.component_type == "SABOR")
        assert any(i.name == f"Producto {SKU_SABOR}" for i in grupo_sabor.items)

    async def test_item_expone_la_categoria_de_la_que_proviene(self, db):
        """
        v8 (POS-CATEGORIAS): cada item del menú debe exponer `category_id` y
        `category_name`. El POS de Heladería navega por categoría —igual que el
        POS de Panadería—, así que sin esta identidad el frontend no puede
        construir la barra de categorías.
        """
        from modules.heladeria.service import get_menu

        category = await _crear_categoria(db)
        product = await _crear_producto(db, SKU_SABOR, {
            "heladeria_enabled": True,
            "heladeria_component_type": "SABOR",
        }, category=category)
        await sync_product_config(db, product)
        await db.commit()

        menu = await get_menu(db)
        item = next(
            i
            for group in menu.groups
            for i in group.items
            if i.name == f"Producto {SKU_SABOR}"
        )
        assert item.category_id == category.id
        assert item.category_name == category.name

    async def test_menu_expone_indice_de_categorias(self, db):
        """
        v8 (POS-CATEGORIAS): `get_menu()` debe devolver un índice `categories`
        con las categorías que tienen items proyectados y su conteo.
        """
        from modules.heladeria.service import get_menu

        category = await _crear_categoria(db)
        product = await _crear_producto(db, SKU_SABOR, {
            "heladeria_enabled": True,
            "heladeria_component_type": "SABOR",
        }, category=category)
        await sync_product_config(db, product)
        await db.commit()

        menu = await get_menu(db)
        entry = next((c for c in menu.categories if c.id == category.id), None)
        assert entry is not None
        assert entry.name == category.name
        assert entry.item_count >= 1

    async def test_item_expone_el_sku_para_la_cascada_de_imagenes(self, db):
        """
        v8 (FIX-IMG): el POS de Heladería resuelve imágenes con la misma cascada
        que el POS de Panadería (API → SKU.png → SKU.jpg → Legacy). Para que los
        respaldos por SKU funcionen, el item DEBE exponer `sku`.
        """
        from modules.heladeria.service import get_menu

        categoria = await _crear_categoria(db, pos_target="HELADERIA", default_role="SABOR")
        await _crear_producto(db, "TEST_HELP_IMG", category=categoria)

        menu = await get_menu(db)
        items = [i for g in menu.groups for i in g.items]
        item = next(i for i in items if i.name == "Producto TEST_HELP_IMG")

        assert item.sku == "TEST_HELP_IMG"

    async def test_grupos_por_component_type_se_preservan(self, db):
        """
        El contrato de `groups` (agrupado por `component_type`) NO debe cambiar:
        lo consumen la Tienda (`getMenuItemsByType`) y los Displays.
        """
        from modules.heladeria.service import get_menu

        category = await _crear_categoria(db)
        product = await _crear_producto(db, SKU_SABOR, {
            "heladeria_enabled": True,
            "heladeria_component_type": "SABOR",
        }, category=category)
        await sync_product_config(db, product)
        await db.commit()

        menu = await get_menu(db)
        grupo = next((g for g in menu.groups if g.component_type == "SABOR"), None)
        assert grupo is not None
        assert any(i.name == f"Producto {SKU_SABOR}" for i in grupo.items)
