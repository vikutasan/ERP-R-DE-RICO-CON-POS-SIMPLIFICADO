"""
Router API para el módulo Heladería.
6 endpoints que exponen el menú dinámico, toggle de disponibilidad,
KDS con filtro por estación, y datos para displays.

Todos los endpoints reutilizan el sistema de tickets y caja existente
(POST /pos/tickets, POST /cash/sessions) — no se duplica esa lógica aquí.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from core.database import get_db
from . import service, schemas

router = APIRouter()


# ═══════════════════════════════════════════════════════════════
# MENÚ DINÁMICO
# ═══════════════════════════════════════════════════════════════

@router.get("/menu", response_model=schemas.FullMenuResponse)
async def get_menu(db: AsyncSession = Depends(get_db)):
    """
    Obtiene el menú completo de heladería agrupado por tipo de componente.
    Incluye: RECIPIENTE, SABOR, EXTRA, BEBIDA_BASE, TAMAÑO.
    Cada item indica si está disponible o agotado.
    """
    return await service.get_menu(db)


# ═══════════════════════════════════════════════════════════════
# TOGGLE DISPONIBILIDAD (AGOTAR SABOR)
# ═══════════════════════════════════════════════════════════════

@router.patch("/availability/{config_id}")
async def toggle_availability(
    config_id: int,
    data: schemas.AvailabilityToggle,
    db: AsyncSession = Depends(get_db),
):
    """
    Toggle instantáneo de disponibilidad de un sabor/producto.
    Usado por el botón 'AGOTAR SABOR' en el POS Heladería.
    """
    return await service.toggle_availability(db, config_id, data.is_available)


# ═══════════════════════════════════════════════════════════════
# KDS (Kitchen Display System)
# ═══════════════════════════════════════════════════════════════

@router.get("/kds/{station}")
async def get_kds_orders(
    station: str,
    db: AsyncSession = Depends(get_db),
):
    """
    Obtiene pedidos pagados de heladería para una estación KDS.
    
    Estaciones válidas:
    - HELADOS: Bolas de helado, conos, vasos
    - MALTEADAS: Malteadas y aguas frescas
    
    Solo muestra items con item_status != 'READY' (pendientes de preparar).
    Ordenados FIFO (más antiguo primero).
    """
    return await service.get_kds_orders(db, station.upper())


@router.patch("/kds/items/{item_id}/status")
async def update_kds_item_status(
    item_id: int,
    data: schemas.KdsItemStatusUpdate,
    db: AsyncSession = Depends(get_db),
):
    """
    Actualiza el estado de un item en el KDS.
    
    Estados: PENDING → IN_PROGRESS → READY
    
    Si TODOS los items de heladería del ticket están READY,
    el ticket se marca automáticamente como 'LISTO PARA ENTREGA'.
    """
    return await service.update_kds_item_status(db, item_id, data)


# ═══════════════════════════════════════════════════════════════
# DISPLAY DATA
# ═══════════════════════════════════════════════════════════════

@router.get("/display/flavors", response_model=list[schemas.DisplayFlavorResponse])
async def get_display_flavors(db: AsyncSession = Depends(get_db)):
    """
    Lista de sabores con estado de disponibilidad para displays.
    Usado por el Display Tótem Sugestivo y Display Pantalla de Precios.
    """
    return await service.get_active_flavors(db)


@router.get("/display/menu")
async def get_display_menu(db: AsyncSession = Depends(get_db)):
    """
    Menú completo con precios para el Display Pantalla de Precios.
    Incluye timestamp de última actualización.
    """
    return await service.get_display_menu(db)
