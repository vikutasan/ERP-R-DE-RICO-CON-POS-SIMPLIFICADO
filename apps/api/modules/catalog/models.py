from sqlalchemy import Column, Integer, String, Float, Boolean, ForeignKey, JSON, Text, Numeric
from sqlalchemy.orm import relationship
from core.database import Base

class Category(Base):
    __tablename__ = "categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True, nullable=False)
    icon = Column(String, nullable=True)
    position = Column(Integer, nullable=True)
    vision_enabled = Column(Boolean, default=False)
    is_system = Column(Boolean, default=False)

    products = relationship("Product", back_populates="category")

class Product(Base):
    __tablename__ = "products"

    id = Column(Integer, primary_key=True, index=True)
    sku = Column(String, unique=True, index=True, nullable=False)
    barcode = Column(String, unique=True, index=True, nullable=True)
    name = Column(String, index=True, nullable=False)
    price = Column(Numeric(12, 2), nullable=False)
    cost = Column(Numeric(12, 2), default=0)
    # v7 (Fase 0.5, D-STOCK): OBSOLETO. NO USAR COMO FUENTE DE VERDAD.
    #
    # La fuente unica de stock es la tabla `stock_almacen` (modulo warehouse),
    # que registra cantidad por almacen y soporta bloqueo optimista (version).
    # Esta columna `products.stock` es un remanente del diseno anterior y
    # provoca el conflicto de doble fuente de verdad: el POS descuenta en
    # stock_almacen mientras el catalogo muestra un numero distinto.
    #
    # Se conserva temporalmente para no romper migraciones ni lectores
    # heredados, pero:
    #   - NO escribir en ella desde codigo nuevo.
    #   - NO leerla para mostrar disponibilidad. Usar
    #     GET /api/v1/warehouse/stock-por-sku/{sku}.
    #   - Se migrara su contenido a stock_almacen y se eliminara en una
    #     fase posterior (ver Fase 0.5.3E del plan v7).
    stock = Column(Float, default=0.0)
    # v7 (Fase 0.5, D-WH): el valor por defecto "Bóveda Central" era un
    # hardcode de una sucursal concreta, prohibido por el principio SaaS
    # (el sistema debe servir a cualquier negocio). La ubicacion real de un
    # producto se determina por su registro en `stock_almacen`, no por este
    # campo. Se deja nullable y sin default para no inventar ubicaciones.
    warehouse = Column(String, nullable=True)
    image_url = Column(String, nullable=True)
    position = Column(Integer, nullable=True)
    nature = Column(String, default="MANUFACTURADO")  # MANUFACTURADO, PREPARADO, REVENTA
    category_id = Column(Integer, ForeignKey("categories.id"))
    active = Column(Boolean, default=True)

    category = relationship("Category", back_populates="products")
    technical_sheet = relationship("ProductTechnicalSheet", back_populates="product", uselist=False)

class ProductTechnicalSheet(Base):
    """
    Ficha Técnica del producto (Definida en Catalog para evitar circularidad).
    """
    __tablename__ = "product_technical_sheets"

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), unique=True, nullable=False)
    
    # Masas vinculadas (Referencias por ID para evitar circularidad profunda en modelos)
    primary_mass_id = Column(Integer, ForeignKey("doughs.id"), nullable=True)
    primary_mass_grams = Column(Float, nullable=True)
    
    secondary_mass_id = Column(Integer, ForeignKey("doughs.id"), nullable=True)
    secondary_mass_grams = Column(Float, nullable=True)
    
    tertiary_mass_id = Column(Integer, ForeignKey("doughs.id"), nullable=True)
    tertiary_mass_grams = Column(Float, nullable=True)
    
    weight_per_piece = Column(Float, nullable=True) # Peso total final sugerido
    baking_temp_top = Column(Float, nullable=True)
    baking_temp_bottom = Column(Float, nullable=True)
    baking_time_min = Column(Integer, nullable=True)
    steam_seconds = Column(Integer, nullable=True)
    scoring_type = Column(String, nullable=True)
    
    forming_procedure = Column(Text, nullable=True)
    bom_extra = Column(JSON, nullable=True)

    preparation_time_min = Column(Integer, nullable=True)
    order_lead_time_hours = Column(Integer, nullable=True)  # Tiempo para Pedidos: horas desde que se pide hasta que es posible su entrega
    recipe_procedure = Column(Text, nullable=True)
    modifiers = Column(JSON, nullable=True)

    provider = Column(String, nullable=True)
    original_barcode = Column(String, nullable=True)
    unit_measure = Column(String, nullable=True)
    min_stock = Column(Integer, nullable=True)
    max_stock = Column(Integer, nullable=True)

    product = relationship("Product", back_populates="technical_sheet")

