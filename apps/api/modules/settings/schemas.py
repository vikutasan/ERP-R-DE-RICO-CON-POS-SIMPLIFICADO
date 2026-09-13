from pydantic import BaseModel
from typing import Optional

class SystemSettingBase(BaseModel):
    key: str
    value: str
    description: Optional[str] = None
    category: str = "general"
    input_type: str = "text"

class SystemSettingCreate(SystemSettingBase):
    pass

class SystemSettingUpdate(BaseModel):
    value: str

class SystemSettingResponse(SystemSettingBase):
    """v1.2 (BUG 4): `category` e `input_type` se declaran tolerantes a NULL.

    Motivo: la tabla `system_settings` admite NULL en esas columnas (el modelo
    SQLAlchemy define `default=` del lado Python, que NO aplica a filas creadas
    por SQL crudo o por `op.bulk_insert`). Un solo registro con NULL hacia que
    `GET /api/v1/settings/` devolviera HTTP 500 (ResponseValidationError), lo que
    rompia la carga de la Vista General y hacia parecer que la direccion y el
    telefono se "borraban solos".
    """
    id: int
    category: Optional[str] = "general"
    input_type: Optional[str] = "text"

    class Config:
        from_attributes = True
