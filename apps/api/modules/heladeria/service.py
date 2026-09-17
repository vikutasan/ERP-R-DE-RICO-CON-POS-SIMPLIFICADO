"""
Service layer para el módulo Heladería.
Contiene toda la lógica de negocio: menú dinámico, toggle de disponibilidad,
KDS con filtro por estación, y datos para displays.
"""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from sqlalchemy.orm import selectinload
from fastapi import HTTPException
from datetime import datetime
from typing import Optional

from .models import HeladeriaProductConfig, TicketItemComponent
from .schemas import (
    MenuItemResponse, MenuGroupResponse, FullMenuResponse,
    MenuCategoryResponse,
    KdsItemResponse, KdsOrderResponse, KdsItemStatusUpdate,
    DisplayFlavorResponse,
)
# v8 (POS-SELECTOR): resolución de la proyección catálogo → menú de Heladería.
from .sync import projects_to_heladeria, resolve_effective_role
from modules.catalog.models import Product, Category
from modules.pos.models import Ticket, TicketItem
from core.serialization import iso_utc


# ═══════════════════════════════════════════════════════════════
# MENÚ DINÁMICO
# ═══════════════════════════════════════════════════════════════

async def get_menu(db: AsyncSession) -> FullMenuResponse:
    """
    Obtiene el menú completo de heladería agrupado por component_type.

    v8 (POS-SELECTOR): lee del CATÁLOGO (`products` + `categories`), igual que
    `catalog/service.get_products()` para el POS de Panadería. La tabla puente
    `heladeria_product_config` deja de ser la fuente de lectura del menú: pasa a
    ser un espejo de disponibilidad (`is_available`) y de overrides de precio.

    Reglas de proyección (ver `heladeria/sync.py`):
      - La categoría debe declarar `pos_target` HELADERIA o AMBOS.
      - El rol efectivo se resuelve por precedencia:
          1. `technical_data.heladeria_component_type` (explícito del producto)
          2. `category.heladeria_default_role` (heredado de la categoría)
      - Si no hay rol efectivo, el producto no aparece en el menú.

    El contrato de respuesta se preserva EXACTAMENTE: cada item expone
    `config_id`, `product_id`, `name`, `price`, `image`, `component_type`,
    `is_available`, `max_scoops`, `base_price`, `price_per_scoop`, `position`.
    """
    result = await db.execute(
        select(Product)
        .where(Product.active == True)
        .options(selectinload(Product.category))
        .order_by(Product.position.asc(), Product.name.asc())
    )
    products = result.scalars().all()

    # Índice de overrides de disponibilidad/precio por product_id.
    configs_result = await db.execute(select(HeladeriaProductConfig))
    configs_by_product = {
        cfg.product_id: cfg for cfg in configs_result.scalars().all()
    }

    groups_dict = {}
    categories_dict = {}
    for product in products:
        if not projects_to_heladeria(product):
            continue

        component_type = resolve_effective_role(product)
        cfg = configs_by_product.get(product.id)
        category = product.category

        item = MenuItemResponse(
            config_id=cfg.id if cfg else product.id,
            product_id=product.id,
            name=product.name,
            price=product.price,
            image=product.image_url,
            sku=product.sku,
            component_type=component_type,
            is_available=cfg.is_available if cfg else True,
            max_scoops=cfg.max_scoops if cfg else None,
            base_price=cfg.base_price if cfg else None,
            price_per_scoop=cfg.price_per_scoop if cfg else None,
            position=product.position or 0,
            category_id=category.id if category else None,
            category_name=category.name if category else None,
        )
        groups_dict.setdefault(component_type, []).append(item)

        # Índice de navegación: una entrada por categoría con items proyectados.
        if category is not None:
            entry = categories_dict.setdefault(category.id, {
                "id": category.id,
                "name": category.name,
                "icon": category.icon,
                "position": category.position or 0,
                "item_count": 0,
            })
            entry["item_count"] += 1

    groups = [
        MenuGroupResponse(component_type=ct, items=items)
        for ct, items in groups_dict.items()
    ]

    categories = [
        MenuCategoryResponse(**entry)
        for entry in sorted(
            categories_dict.values(),
            key=lambda e: (e["position"], e["name"]),
        )
    ]

    total = sum(len(g.items) for g in groups)
    return FullMenuResponse(groups=groups, total_items=total, categories=categories)


# ═══════════════════════════════════════════════════════════════
# TOGGLE DISPONIBILIDAD (AGOTAR SABOR)
# ═══════════════════════════════════════════════════════════════

async def toggle_availability(db: AsyncSession, config_id: int, is_available: bool) -> dict:
    """
    Toggle instantáneo de disponibilidad de un sabor/producto.
    Ejemplo: Agotar 'Pistache' → is_available=False

    v8 (POS-SELECTOR): la operación es UNIVERSAL. El identificador recibido
    (`config_id`) puede ser:
      - el `id` de una fila puente existente en `heladeria_product_config`, o
      - el `id` de un producto del catálogo que aún no tiene fila puente.

    En el segundo caso se hace UPSERT: se crea la fila puente con el rol
    efectivo resuelto desde el catálogo. Así el botón "Agotar" funciona para
    cualquier producto que aparezca en el menú, sin depender de que exista una
    fila puente previa (que ya no es la fuente de lectura del menú).
    """
    config = await _resolve_config_for_toggle(db, config_id)

    config.is_available = is_available
    await db.commit()
    await db.refresh(config)

    product_name = config.product.name if config.product else "Desconocido"
    return {
        "config_id": config.id,
        "product_id": config.product_id,
        "product_name": product_name,
        "is_available": config.is_available,
        "message": f"{'Disponible' if is_available else 'AGOTADO'}: {product_name}"
    }


async def _resolve_config_for_toggle(db: AsyncSession, config_id: int) -> HeladeriaProductConfig:
    """
    Resuelve la fila puente sobre la que aplicar el toggle.

    Estrategia:
      1. Buscar por `HeladeriaProductConfig.id` (compatibilidad con el POS actual).
      2. Si no existe, interpretar el identificador como `product_id` y hacer
         upsert de la fila puente con el rol efectivo del catálogo.

    Lanza 404 si el identificador no corresponde ni a una fila puente ni a un
    producto proyectable al menú de Heladería.
    """
    result = await db.execute(
        select(HeladeriaProductConfig)
        .options(selectinload(HeladeriaProductConfig.product))
        .where(HeladeriaProductConfig.id == config_id)
    )
    existing = result.scalar_one_or_none()
    if existing is not None:
        return existing

    return await _upsert_config_by_product(db, config_id)


async def _upsert_config_by_product(db: AsyncSession, product_id: int) -> HeladeriaProductConfig:
    """
    Crea (o recupera) la fila puente de un producto del catálogo.

    El rol se resuelve con la misma precedencia que `get_menu()`:
    intención explícita del producto → rol por defecto de la categoría.
    """
    product_result = await db.execute(
        select(Product)
        .options(selectinload(Product.category))
        .where(Product.id == product_id)
    )
    product = product_result.scalar_one_or_none()

    if product is None:
        raise HTTPException(
            status_code=404,
            detail=f"Ni configuración de heladería ni producto {product_id} encontrados",
        )

    role = resolve_effective_role(product)
    if role is None:
        raise HTTPException(
            status_code=404,
            detail=f"El producto {product_id} no está proyectado al menú de Heladería",
        )

    created = HeladeriaProductConfig(
        product_id=product.id,
        component_type=role,
        is_available=True,
        position=product.position or 0,
    )
    db.add(created)
    await db.flush()
    created.product = product
    return created


# ═══════════════════════════════════════════════════════════════
# KDS (Kitchen Display System)
# ═══════════════════════════════════════════════════════════════

async def get_kds_orders(db: AsyncSession, station: str) -> list[KdsOrderResponse]:
    """
    Obtiene los pedidos PAGADOS de heladería para una estación KDS específica.
    
    Filtros:
        - tickets con channel='HELADERIA' y status='PAID'
        - items con kds_station=station e item_status != 'READY'
    
    Ordenamiento: FIFO (más antiguo primero por created_at)
    """
    # Obtener tickets de heladería pagados
    result = await db.execute(
        select(Ticket)
        .where(
            Ticket.channel == "HELADERIA",
            Ticket.status == "PAID",
        )
        .options(
            selectinload(Ticket.items).selectinload(TicketItem.product)
        )
        .order_by(Ticket.created_at.asc())
    )
    tickets = result.scalars().all()

    orders = []
    for ticket in tickets:
        # Filtrar items por estación KDS y que no estén listos
        kds_items = [
            item for item in ticket.items
            if item.kds_station == station and item.item_status != "READY"
        ]

        if not kds_items:
            continue

        # Obtener componentes de cada item
        item_responses = []
        for item in kds_items:
            # Buscar componentes
            comp_result = await db.execute(
                select(TicketItemComponent)
                .where(TicketItemComponent.ticket_item_id == item.id)
                .order_by(TicketItemComponent.component_type)
            )
            components = comp_result.scalars().all()

            from .schemas import TicketItemComponentResponse
            comp_responses = [
                TicketItemComponentResponse(
                    id=c.id,
                    ticket_item_id=c.ticket_item_id,
                    product_id=c.product_id,
                    component_type=c.component_type,
                    component_name=c.component_name,
                    unit_price=c.unit_price,
                    quantity=c.quantity,
                )
                for c in components
            ]

            item_responses.append(KdsItemResponse(
                item_id=item.id,
                product_name=item.product.name if item.product else "Helado",
                quantity=item.quantity,
                item_status=item.item_status or "PENDING",
                kds_station=item.kds_station,
                recipient_name=item.recipient_name,
                components=comp_responses,
            ))

        orders.append(KdsOrderResponse(
            ticket_id=ticket.id,
            account_num=ticket.account_num,
            customer_group_name=ticket.customer_group_name,
            terminal_id=ticket.terminal_id,
            created_at=iso_utc(ticket.created_at) or "",
            paid_at=None,  # Se puede agregar si se trackea el momento del pago
            items=item_responses,
        ))

    return orders


async def update_kds_item_status(db: AsyncSession, item_id: int, data: KdsItemStatusUpdate) -> dict:
    """
    Actualiza el estado de un item en el KDS.
    Si todos los items del ticket están READY, marca el ticket como READY.
    
    Estados válidos: PENDING → IN_PROGRESS → READY
    """
    valid_statuses = {"PENDING", "IN_PROGRESS", "READY"}
    if data.item_status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Estado inválido. Válidos: {valid_statuses}")

    # Obtener el item
    result = await db.execute(
        select(TicketItem).where(TicketItem.id == item_id)
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail=f"Item {item_id} no encontrado")

    # Actualizar estado del item
    item.item_status = data.item_status
    await db.flush()

    # Verificar si TODOS los items del ticket están READY
    all_items_result = await db.execute(
        select(TicketItem).where(TicketItem.ticket_id == item.ticket_id)
    )
    all_items = all_items_result.scalars().all()

    heladeria_items = [i for i in all_items if i.kds_station is not None]
    all_ready = all(i.item_status == "READY" for i in heladeria_items) if heladeria_items else False

    ticket_status_changed = False
    if all_ready and heladeria_items:
        # Marcar el ticket como listo para entrega
        ticket_result = await db.execute(
            select(Ticket).where(Ticket.id == item.ticket_id)
        )
        ticket = ticket_result.scalar_one_or_none()
        if ticket:
            ticket.order_status = "LISTO PARA ENTREGA"
            ticket_status_changed = True

    await db.commit()

    return {
        "item_id": item_id,
        "item_status": data.item_status,
        "all_items_ready": all_ready,
        "ticket_status_changed": ticket_status_changed,
        "message": f"Item {item_id} → {data.item_status}" + (" | ✅ Pedido completo!" if all_ready else "")
    }


# ═══════════════════════════════════════════════════════════════
# DISPLAY DATA (sabores activos + menú con precios)
# ═══════════════════════════════════════════════════════════════

async def get_active_flavors(db: AsyncSession) -> list[DisplayFlavorResponse]:
    """
    Obtiene la lista de sabores disponibles para los displays.

    v8 (POS-SELECTOR): se alimenta del mismo menú proyectado que el POS de
    Heladería (`get_menu()`), filtrando por rol efectivo SABOR. Así el display
    y el POS nunca divergen: ambos leen del catálogo con la misma precedencia
    de rol (intención del producto → rol por defecto de la categoría).
    """
    menu = await get_menu(db)
    flavors = []
    for group in menu.groups:
        if group.component_type != "SABOR":
            continue
        for item in group.items:
            flavors.append(
                DisplayFlavorResponse(
                    name=item.name,
                    price=item.price,
                    is_available=item.is_available,
                    image=item.image,
                    position=item.position,
                )
            )
    return flavors


async def get_display_menu(db: AsyncSession) -> dict:
    """Obtiene el menú completo con precios para el display de precios."""
    menu = await get_menu(db)
    return {
        "groups": [g.model_dump() for g in menu.groups],
        "total_items": menu.total_items,
        "last_updated": datetime.now().isoformat(),
    }
