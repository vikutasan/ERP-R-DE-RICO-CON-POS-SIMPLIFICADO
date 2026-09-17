"""
Schemas Pydantic para el módulo Heladería.
Valida requests y serializa responses para la API.
"""
from pydantic import BaseModel, ConfigDict
from typing import Optional, List
from decimal import Decimal


# ═══════════════════════════════════════════════════════════════
# Schemas de HeladeriaProductConfig
# ═══════════════════════════════════════════════════════════════

class HeladeriaProductConfigBase(BaseModel):
    product_id: int
    component_type: str
    max_scoops: Optional[int] = None
    base_price: Optional[Decimal] = None
    price_per_scoop: Optional[Decimal] = None
    is_available: bool = True
    position: int = 0


class HeladeriaProductConfigResponse(HeladeriaProductConfigBase):
    id: int
    product_name: Optional[str] = None
    product_price: Optional[Decimal] = None
    product_image: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)


class AvailabilityToggle(BaseModel):
    """Request para toggle de 'AGOTAR SABOR'."""
    is_available: bool


# ═══════════════════════════════════════════════════════════════
# Schemas de Menú Agrupado
# ═══════════════════════════════════════════════════════════════

class MenuItemResponse(BaseModel):
    """
    Un producto del menú de heladería con su config.

    v8 (POS-CATEGORIAS): se añade la identidad de CATEGORÍA (`category_id`,
    `category_name`). El POS de Heladería navega por categoría —igual que el POS
    de Panadería—, así que el frontend necesita saber a qué categoría pertenece
    cada item. `component_type` se conserva porque describe el COMPORTAMIENTO
    del producto al armar un helado (receta), no la navegación.
    """
    config_id: int
    product_id: int
    name: str
    price: Decimal
    image: Optional[str] = None
    sku: Optional[str] = None
    component_type: str
    is_available: bool
    max_scoops: Optional[int] = None
    base_price: Optional[Decimal] = None
    price_per_scoop: Optional[Decimal] = None
    position: int = 0
    category_id: Optional[int] = None
    category_name: Optional[str] = None


class MenuGroupResponse(BaseModel):
    """Un grupo de productos del menú agrupados por component_type."""
    component_type: str
    items: List[MenuItemResponse]


class MenuCategoryResponse(BaseModel):
    """
    Índice de navegación por categoría para el POS de Heladería.

    Espeja lo que el POS de Panadería obtiene de `GET /catalog/categories`:
    una lista ordenada de categorías con su conteo de items proyectados.
    """
    id: int
    name: str
    icon: Optional[str] = None
    position: int = 0
    item_count: int = 0


class FullMenuResponse(BaseModel):
    """
    Respuesta completa del menú de heladería.

    `groups` se conserva EXACTAMENTE (agrupado por `component_type`) porque es el
    contrato que consumen la Tienda (`getMenuItemsByType`) y los Displays.
    `categories` es un índice ADITIVO para la navegación del POS.
    """
    groups: List[MenuGroupResponse]
    total_items: int
    categories: List[MenuCategoryResponse] = []


# ═══════════════════════════════════════════════════════════════
# Schemas de Ticket Item Component
# ═══════════════════════════════════════════════════════════════

class TicketItemComponentCreate(BaseModel):
    """Un componente de un helado armado."""
    product_id: Optional[int] = None
    component_type: str
    component_name: str
    unit_price: Decimal = Decimal("0")
    quantity: int = 1


class TicketItemComponentResponse(TicketItemComponentCreate):
    id: int
    ticket_item_id: int
    model_config = ConfigDict(from_attributes=True)


# ═══════════════════════════════════════════════════════════════
# Schemas de KDS (Kitchen Display System)
# ═══════════════════════════════════════════════════════════════

class KdsItemResponse(BaseModel):
    """Un item individual en el KDS."""
    item_id: int
    product_name: str
    quantity: int
    item_status: str
    kds_station: Optional[str] = None
    recipient_name: Optional[str] = None
    components: List[TicketItemComponentResponse] = []


class KdsOrderResponse(BaseModel):
    """Un pedido completo en el KDS."""
    ticket_id: int
    account_num: str
    customer_group_name: Optional[str] = None
    terminal_id: Optional[str] = None
    created_at: str
    paid_at: Optional[str] = None
    items: List[KdsItemResponse]


class KdsItemStatusUpdate(BaseModel):
    """Request para actualizar estado de un item en el KDS."""
    item_status: str  # "PENDING" | "IN_PROGRESS" | "READY"


# ═══════════════════════════════════════════════════════════════
# Schemas de Display
# ═══════════════════════════════════════════════════════════════

class DisplayFlavorResponse(BaseModel):
    """Un sabor disponible para los displays."""
    name: str
    price: Decimal
    is_available: bool
    image: Optional[str] = None
    position: int = 0


class DisplayMenuResponse(BaseModel):
    """Menú con precios para display de pantalla."""
    groups: List[MenuGroupResponse]
    last_updated: str
