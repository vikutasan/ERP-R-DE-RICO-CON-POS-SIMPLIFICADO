from fastapi import APIRouter, Depends, Query, Body, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
from datetime import date, datetime, timedelta, timezone

from core.timezone import get_business_tz, local_now

from core.database import get_db
from modules.analytics import schemas, service

router = APIRouter(prefix="/analytics", tags=["Analytics"])

@router.get("/context", response_model=schemas.DailyContextRead)
async def get_context(target_date: date = Query(...), db: AsyncSession = Depends(get_db)):
    """Obtiene el contexto de eventualidades para un día específico"""
    return await service.get_or_create_daily_context(db, target_date)

@router.put("/context", response_model=schemas.DailyContextRead)
async def update_context(target_date: date, data: schemas.DailyContextCreate, db: AsyncSession = Depends(get_db)):
    """Guarda/actualiza el contexto de eventualidades (Lluvia, festivo, atípico)"""
    return await service.update_daily_context(db, target_date, data)

@router.get("/rankings")
async def get_rankings(
    days: int = Query(30, description="Días hacia atrás a analizar"),
    start: Optional[date] = Query(None, description="Fecha inicio YYYY-MM-DD"),
    end: Optional[date] = Query(None, description="Fecha fin YYYY-MM-DD"),
    db: AsyncSession = Depends(get_db)
):
    """
    Retorna el top/bottom de productos según volumen y margen.
    """
    if start and end:
        start_date = start
        end_date = end
    else:
        # Regla día de negocio: antes de 5 AM, usar "ayer" como hoy
        # (la panadería está cerrada, evita datos vacíos del día nuevo)
        tz = await get_business_tz(db)
        mexico_now = local_now(tz)
        if mexico_now.hour < 5:
            end_date = (mexico_now - timedelta(days=1)).date()
        else:
            end_date = mexico_now.date()
        start_date = end_date - timedelta(days=days)
    
    rankings = await service.get_product_rankings(db, start_date, end_date)
    
    # Calcular top/bottom de Volumen
    by_volume_desc = sorted(rankings, key=lambda x: x["total_quantity"], reverse=True)
    by_volume_asc = sorted([r for r in rankings if r["total_quantity"] > 0], key=lambda x: x["total_quantity"])
    
    # Calcular top/bottom de Margen (%)
    by_margin_desc = sorted(rankings, key=lambda x: x["margin_percentage"], reverse=True)
    by_margin_asc = sorted(rankings, key=lambda x: x["margin_percentage"])
    
    # Get ticket metrics (e.g. total distinct tickets)
    ticket_metrics = await service.get_ticket_metrics(db, start_date, end_date)
    time_series_metrics = await service.get_time_series_metrics(db, start_date, end_date)
    
    return {
        "period": {"start": start_date, "end": end_date},
        "top_volume": by_volume_desc[:10],
        "bottom_volume": by_volume_asc[:10],
        "top_margin": by_margin_desc[:10],
        "bottom_margin": by_margin_asc[:10],
        "ticket_metrics": ticket_metrics,
        "time_series_metrics": time_series_metrics,
        "all": rankings
    }

@router.post("/query")
async def custom_query(
    payload: schemas.CustomQueryPayload = Body(...),
    db: AsyncSession = Depends(get_db)
):
    """
    Motor de consultas personalizadas. Ejemplo: Todos los Churros vendidos los viernes de este mes.
    """
    return await service.execute_custom_query(db, payload)

@router.get("/product-daily-sales")
async def get_product_daily_sales(
    start: date = Query(..., description="Fecha inicio YYYY-MM-DD"),
    end: date = Query(..., description="Fecha fin YYYY-MM-DD"),
    weekday: Optional[int] = Query(None, description="Día de semana: 0=Lun, 6=Dom"),
    last_n: Optional[int] = Query(None, description="Últimas N ocurrencias"),
    include_prev_year: bool = Query(False, description="Incluir año anterior"),
    db: AsyncSession = Depends(get_db)
):
    """
    Retorna ventas diarias por producto para la tabla de Estadística de Productos.
    Soporta filtrado por día de semana, últimas N ocurrencias, y comparativa interanual.
    """
    # Validar rango máximo (180 días) para evitar queries masivas
    if (end - start).days > 180:
        raise HTTPException(status_code=400, detail="Rango máximo permitido: 180 días")
    if end < start:
        raise HTTPException(status_code=400, detail="La fecha fin debe ser posterior a la fecha inicio")
    return await service.get_product_daily_sales(
        db, start, end, weekday, last_n, include_prev_year
    )

