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
    KdsItemResponse, KdsOrderResponse, KdsItemStatusUpdate,
    DisplayFlavorResponse,
)
from modules.catalog.models import Product, Category
from modules.pos.models import Ticket, TicketItem


# ═══════════════════════════════════════════════════════════════
# MENÚ DINÁMICO
# ═══════════════════════════════════════════════════════════════

async def get_menu(db: AsyncSession) -> FullMenuResponse:
    """
    Obtiene el menú completo de heladería agrupado por component_type.
    Incluye todos los productos configurados con su estado de disponibilidad.
    """
    result = await db.execute(
        select(HeladeriaProductConfig)
        .options(selectinload(HeladeriaProductConfig.product))
        .order_by(HeladeriaProductConfig.component_type, HeladeriaProductConfig.position)
    )
    configs = result.scalars().all()

    # Agrupar por component_type
    groups_dict = {}
    for cfg in configs:
        if not cfg.product:
            continue
        item = MenuItemResponse(
            config_id=cfg.id,
            product_id=cfg.product_id,
            name=cfg.product.name,
            price=cfg.product.price,
            image=cfg.product.image_url,
            component_type=cfg.component_type,
            is_available=cfg.is_available,
            max_scoops=cfg.max_scoops,
            base_price=cfg.base_price,
            price_per_scoop=cfg.price_per_scoop,
            position=cfg.position,
        )
        if cfg.component_type not in groups_dict:
            groups_dict[cfg.component_type] = []
        groups_dict[cfg.component_type].append(item)

    groups = [
        MenuGroupResponse(component_type=ct, items=items)
        for ct, items in groups_dict.items()
    ]

    total = sum(len(g.items) for g in groups)
    return FullMenuResponse(groups=groups, total_items=total)


# ═══════════════════════════════════════════════════════════════
# TOGGLE DISPONIBILIDAD (AGOTAR SABOR)
# ═══════════════════════════════════════════════════════════════

async def toggle_availability(db: AsyncSession, config_id: int, is_available: bool) -> dict:
    """
    Toggle instantáneo de disponibilidad de un sabor/producto.
    Ejemplo: Agotar 'Pistache' → is_available=False
    """
    result = await db.execute(
        select(HeladeriaProductConfig)
        .options(selectinload(HeladeriaProductConfig.product))
        .where(HeladeriaProductConfig.id == config_id)
    )
    config = result.scalar_one_or_none()

    if not config:
        raise HTTPException(status_code=404, detail=f"Configuración de heladería {config_id} no encontrada")

    config.is_available = is_available
    await db.commit()

    return {
        "config_id": config.id,
        "product_name": config.product.name if config.product else "Desconocido",
        "is_available": config.is_available,
        "message": f"{'Disponible' if is_available else 'AGOTADO'}: {config.product.name if config.product else config_id}"
    }


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
            created_at=ticket.created_at.isoformat() if ticket.created_at else "",
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
    """Obtiene la lista de sabores disponibles para los displays."""
    result = await db.execute(
        select(HeladeriaProductConfig)
        .options(selectinload(HeladeriaProductConfig.product))
        .where(HeladeriaProductConfig.component_type == "SABOR")
        .order_by(HeladeriaProductConfig.position)
    )
    configs = result.scalars().all()

    return [
        DisplayFlavorResponse(
            name=cfg.product.name if cfg.product else "?",
            price=cfg.product.price if cfg.product else 0,
            is_available=cfg.is_available,
            image=cfg.product.image_url if cfg.product else None,
            position=cfg.position,
        )
        for cfg in configs
    ]


async def get_display_menu(db: AsyncSession) -> dict:
    """Obtiene el menú completo con precios para el display de precios."""
    menu = await get_menu(db)
    return {
        "groups": [g.model_dump() for g in menu.groups],
        "total_items": menu.total_items,
        "last_updated": datetime.now().isoformat(),
    }
