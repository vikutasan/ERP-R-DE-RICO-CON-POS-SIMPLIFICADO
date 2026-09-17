from pydantic import BaseModel, ConfigDict
from typing import Optional, List, Dict, Any
from modules.production.schemas import TechnicalSheetResponse

# --- Categoria ---
class CategoryBase(BaseModel):
    name: str
    icon: Optional[str] = None
    position: Optional[int] = None
    vision_enabled: bool = False
    is_system: bool = False
    # v8 (HEL-P): primer nivel de la proyeccion a heladeria_product_config.
    # Declara que la categoria pertenece al dominio Heladeria.
    heladeria_enabled: bool = False
    # v8 (POS-SELECTOR): destino de la categoria hacia los POS.
    # 'PANADERIA' | 'HELADERIA' | 'AMBOS'. Default 'PANADERIA'.
    pos_target: str = "PANADERIA"
    # v8 (POS-SELECTOR): rol por defecto de los productos de la categoria
    # dentro del menu de Heladeria. Solo aplica si pos_target incluye HELADERIA.
    heladeria_default_role: Optional[str] = None

class CategoryCreate(CategoryBase):
    pass

class CategoryResponse(CategoryBase):
    id: int
    model_config = ConfigDict(from_attributes=True)

# --- Producto ---
class ProductBase(BaseModel):
    sku: str
    barcode: Optional[str] = None
    name: str
    price: float
    cost: Optional[float] = 0.0
    stock: Optional[float] = 0.0
    # v7 (Fase 0.5, D-WH): sin default. "Bóveda Central" era un hardcode de una
    # sucursal concreta, prohibido por el principio SaaS. La ubicacion real de un
    # producto vive en `stock_almacen` (modulo warehouse), no en este campo.
    warehouse: Optional[str] = None
    image_url: Optional[str] = None
    position: Optional[int] = None
    nature: str = "MANUFACTURADO"
    category_id: Optional[int] = None
    active: bool = True

class ProductCreate(ProductBase):
    technical_data: Optional[Dict[str, Any]] = None

class ProductUpdate(BaseModel):
    sku: Optional[str] = None
    barcode: Optional[str] = None
    name: Optional[str] = None
    price: Optional[float] = None
    cost: Optional[float] = None
    stock: Optional[float] = None
    warehouse: Optional[str] = None
    image_url: Optional[str] = None
    position: Optional[int] = None
    nature: Optional[str] = None
    category_id: Optional[int] = None
    active: Optional[bool] = None
    technical_data: Optional[Dict[str, Any]] = None

class ProductResponse(ProductBase):
    id: int
    category: Optional[CategoryResponse] = None
    technical_sheet: Optional[TechnicalSheetResponse] = None
    model_config = ConfigDict(from_attributes=True)
