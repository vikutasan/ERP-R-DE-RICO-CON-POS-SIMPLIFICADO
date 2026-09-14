"""
MÓDULO: orders/service.py
MISIÓN: Lógica de negocio para crear, actualizar y consultar pedidos.
Cada función hace UNA sola cosa (SRP).
"""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from core.timestamps import utcnow
from .models import Order
from .schemas import OrderCreate, OrderUpdate
from modules.pos.models import Ticket, TicketItem
from modules.catalog.models import Product
from modules.security.models import Employee


async def create_order(db: AsyncSession, data: OrderCreate) -> Order:
    """Crea un pedido TENTATIVO vinculado a un ticket existente."""
    order = Order(**data.model_dump())
    db.add(order)
    await db.commit()
    await db.refresh(order)
    return order


async def get_order_by_ticket(db: AsyncSession, ticket_id: int) -> Order | None:
    """Recupera el pedido asociado a un ticket, si existe."""
    result = await db.execute(
        select(Order).where(Order.ticket_id == ticket_id)
    )
    return result.scalar_one_or_none()


async def get_pending_orders(db: AsyncSession) -> list[Order]:
    """
    Retorna pedidos activos desde el pago hasta estar listos para entrega.
    Carga el ticket y sus items → producto para la vista de detalles.
    Usa PostgreSQL (disco), NO RAM.
    """
    production_statuses = [
        "TENTATIVO", "PAGADO", "TURNO_ASIGNADO", "EN_PREPARACION", 
        "PREPARADO_ENFRIAMIENTO", "PREPARADO_REPOSO", "LISTO_EMPAQUE",
        "EN_EMPAQUE_PICKUP", "LISTO_PICKUP_SIN_EMPAQUE", "LISTO_PICKUP_EMPACADO",
        "EN_EMPAQUE_REPARTO", "LISTO_REPARTO_EMPACADO", "EN_RUTA"
    ]
    result = await db.execute(
        select(Order)
        .options(
            selectinload(Order.ticket).selectinload(Ticket.items).selectinload(TicketItem.product).selectinload(Product.category),
            selectinload(Order.ticket).selectinload(Ticket.items).selectinload(TicketItem.product).selectinload(Product.technical_sheet),
            selectinload(Order.ticket).selectinload(Ticket.captured_by).selectinload(Employee.profile),
            selectinload(Order.ticket).selectinload(Ticket.cashed_by).selectinload(Employee.profile)
        )
        .where(Order.status.in_(production_statuses))
        .order_by(Order.committed_at.asc())
    )
    return result.scalars().all()


async def get_pickup_orders(db: AsyncSession) -> list[Order]:
    """
    Retorna pedidos PICKUP en zona de despacho.
    Usado por el módulo 'Gestor de Pickup'.
    """
    pickup_statuses = ["EN_EMPAQUE_PICKUP", "LISTO_PICKUP_SIN_EMPAQUE", "LISTO_PICKUP_EMPACADO"]
    result = await db.execute(
        select(Order)
        .options(
            selectinload(Order.ticket).selectinload(Ticket.items).selectinload(TicketItem.product).selectinload(Product.category),
            selectinload(Order.ticket).selectinload(Ticket.items).selectinload(TicketItem.product).selectinload(Product.technical_sheet),
            selectinload(Order.ticket).selectinload(Ticket.captured_by).selectinload(Employee.profile),
            selectinload(Order.ticket).selectinload(Ticket.cashed_by).selectinload(Employee.profile)
        )
        .where(
            Order.delivery_type == "PICKUP",
            Order.status.in_(pickup_statuses)
        )
        .order_by(Order.committed_at.asc())
    )
    return result.scalars().all()


async def get_reparto_orders(db: AsyncSession) -> list[Order]:
    """
    Retorna pedidos DOMICILIO en zona de despacho.
    Usado por el módulo 'Gestor de Repartos'.
    """
    reparto_statuses = ["EN_EMPAQUE_REPARTO", "LISTO_REPARTO_EMPACADO", "EN_RUTA"]
    result = await db.execute(
        select(Order)
        .options(
            selectinload(Order.ticket).selectinload(Ticket.items).selectinload(TicketItem.product).selectinload(Product.category),
            selectinload(Order.ticket).selectinload(Ticket.items).selectinload(TicketItem.product).selectinload(Product.technical_sheet),
            selectinload(Order.ticket).selectinload(Ticket.captured_by).selectinload(Employee.profile),
            selectinload(Order.ticket).selectinload(Ticket.cashed_by).selectinload(Employee.profile)
        )
        .where(
            Order.delivery_type == "DOMICILIO",
            Order.status.in_(reparto_statuses)
        )
        .order_by(Order.committed_at.asc())
    )
    return result.scalars().all()


async def update_order(db: AsyncSession, order_id: int, data: OrderUpdate) -> Order | None:
    """Actualiza campos de un pedido existente. Retorna None si no existe."""
    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one_or_none()
    if not order:
        return None

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(order, field, value)

    order.updated_at = utcnow()
    await db.commit()
    await db.refresh(order)
    return order
