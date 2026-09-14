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
