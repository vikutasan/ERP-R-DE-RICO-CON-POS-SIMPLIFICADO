"""
Modelos de datos para el módulo Heladería.
Extiende el catálogo y los tickets existentes con configuración específica
para la operación de heladería (sabores, recipientes, extras, componentes).
"""
from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, Numeric
from sqlalchemy.orm import relationship
from core.database import Base


class HeladeriaProductConfig(Base):
    """
    Extiende un producto del catálogo con configuración específica de heladería.
    Ejemplo: Producto 'Chocolate' → component_type='SABOR', is_available=True
    
    component_type values:
        - RECIPIENTE: Vaso, Cono, Cono waffle
        - SABOR: Chocolate, Vainilla, Fresa, etc.
        - EXTRA: Chocolate duro, Granillo, Nuez, etc.
        - BEBIDA_BASE: Base de malteada, agua fresca, etc.
        - TAMAÑO: Chico, Mediano, Grande (para bebidas)
    """
    __tablename__ = "heladeria_product_config"

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), unique=True, nullable=False)
    component_type = Column(String, nullable=False)
    max_scoops = Column(Integer, nullable=True)  # Solo para RECIPIENTE: máx bolas permitidas
    base_price = Column(Numeric(12, 2), nullable=True)  # Precio base del recipiente
    price_per_scoop = Column(Numeric(12, 2), nullable=True)  # Precio por bola adicional
    is_available = Column(Boolean, default=True, nullable=False)  # Toggle "AGOTAR SABOR"
    position = Column(Integer, default=0)  # Orden de visualización en la UI

    product = relationship("Product")

    def __repr__(self):
        return f"<HeladeriaProductConfig(id={self.id}, product_id={self.product_id}, type={self.component_type}, available={self.is_available})>"


class TicketItemComponent(Base):
    """
    Componente de un TicketItem compuesto (helado armado).
    Un helado = 1 TicketItem con N TicketItemComponents.
    
    Ejemplo:
        TicketItem: "Vaso 2 bolas" ($80)
        └── TicketItemComponent: RECIPIENTE → "Vaso" ($0)
        └── TicketItemComponent: BOLA_1 → "Chocolate" ($40)
        └── TicketItemComponent: BOLA_2 → "Fresa" ($40)
        └── TicketItemComponent: EXTRA → "Chocolate Duro" ($10)
    
    component_type values:
        - RECIPIENTE: El contenedor del helado
        - BOLA_1, BOLA_2, BOLA_3: Cada bola de sabor
        - EXTRA: Topping o adición
    """
    __tablename__ = "ticket_item_components"

    id = Column(Integer, primary_key=True, index=True)
    ticket_item_id = Column(Integer, ForeignKey("ticket_items.id"), nullable=False)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=True)
    component_type = Column(String, nullable=False)
    component_name = Column(String, nullable=False)
    unit_price = Column(Numeric(12, 2), default=0)
    quantity = Column(Integer, default=1)

    ticket_item = relationship("TicketItem")
    product = relationship("Product")

    def __repr__(self):
        return f"<TicketItemComponent(id={self.id}, type={self.component_type}, name={self.component_name})>"
