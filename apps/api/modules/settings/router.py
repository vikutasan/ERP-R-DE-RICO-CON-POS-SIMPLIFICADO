from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from core.database import get_db
from core.timezone import get_business_tz, tz_offset_hours
from . import schemas, service
from typing import List

router = APIRouter()

@router.get("/", response_model=List[schemas.SystemSettingResponse])
async def list_settings(db: AsyncSession = Depends(get_db)):
    return await service.get_settings(db)

# ⚠️ ORDEN CRÍTICO: /timezone DEBE ir ANTES de /{key}.
# Si va después, FastAPI interpreta "timezone" como un key y devuelve 404.
@router.get("/timezone")
async def get_timezone(db: AsyncSession = Depends(get_db)):
    """Retorna la zona horaria del negocio y su offset actual respecto a UTC."""
    tz = await get_business_tz(db)
    return {
        "timezone": str(tz),
        "offset_hours": tz_offset_hours(tz),
    }

# ⚠️ ORDEN CRÍTICO: /currency DEBE ir ANTES de /{key} (misma regla que /timezone).
# V23 (Fase 3): DT-06 (Configuración del Negocio). Declara la moneda del negocio
# para que la UI la consuma en un solo lugar. NO convierte montos.
@router.get("/currency")
async def get_currency(db: AsyncSession = Depends(get_db)):
    """Retorna el código ISO y el símbolo de la moneda del negocio."""
    code = "MXN"
    symbol = "$"
    try:
        code_row = await service.get_setting_by_key(db, "business_currency")
        code = code_row.value or "MXN"
    except Exception:
        pass
    try:
        sym_row = await service.get_setting_by_key(db, "business_currency_symbol")
        symbol = sym_row.value or "$"
    except Exception:
        pass
    return {
        "currency": code,
        "symbol": symbol,
    }

@router.get("/{key}", response_model=schemas.SystemSettingResponse)
async def get_setting(key: str, db: AsyncSession = Depends(get_db)):
    return await service.get_setting_by_key(db, key)

@router.patch("/{key}", response_model=schemas.SystemSettingResponse)
async def update_setting(key: str, req: schemas.SystemSettingUpdate, db: AsyncSession = Depends(get_db)):
    return await service.update_setting(db, key, req.value)

@router.post("/seed")
async def seed(db: AsyncSession = Depends(get_db)):
    await service.seed_settings(db)
    return {"status": "seeded"}
