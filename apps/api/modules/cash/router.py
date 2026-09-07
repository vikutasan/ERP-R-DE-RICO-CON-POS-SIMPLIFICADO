from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List

from core.database import get_db
from . import schemas, service

router = APIRouter()


@router.post("/sessions/open", response_model=schemas.CashSessionResponse, status_code=201)
async def abrir_sesion(datos: schemas.CashSessionCreate, db: AsyncSession = Depends(get_db)):
    return await service.abrir_sesion(db, datos)

@router.get("/sessions/history", response_model=List[schemas.CashSessionResponse])
async def obtener_historial_sesiones(
    terminal_id: str = None, 
    search_date: str = None,
    limit: int = 50, 
    db: AsyncSession = Depends(get_db)
):
    return await service.obtener_historial_sesiones(db, terminal_id, search_date, limit)


@router.get("/sessions/{terminal_id}/active", response_model=schemas.CashSessionResponse)
async def obtener_sesion_activa(terminal_id: str, db: AsyncSession = Depends(get_db)):
    from fastapi import HTTPException
    sesion = await service.obtener_sesion_activa(db, terminal_id)
    if not sesion:
        raise HTTPException(status_code=404, detail="No hay sesión activa en esta terminal")
    return sesion


@router.post("/sessions/{session_id}/movements", response_model=schemas.CashMovementResponse, status_code=201)
async def agregar_movimiento(
    session_id: int, datos: schemas.CashMovementCreate, db: AsyncSession = Depends(get_db)
):
    return await service.agregar_movimiento(db, session_id, datos)


@router.delete("/sessions/{session_id}/movements/{movimiento_id}")
async def eliminar_movimiento(
    session_id: int, movimiento_id: int, db: AsyncSession = Depends(get_db)
):
    return await service.eliminar_movimiento(db, session_id, movimiento_id)


@router.get("/sessions/{session_id}/summary", response_model=schemas.CashSummaryResponse)
async def obtener_resumen(session_id: int, db: AsyncSession = Depends(get_db)):
    return await service.calcular_resumen(db, session_id)


@router.post("/sessions/{session_id}/close", response_model=schemas.CashCloseResponse)
async def cerrar_sesion(
    session_id: int, datos: schemas.CashSessionClose, db: AsyncSession = Depends(get_db)
):
    return await service.cerrar_sesion(db, session_id, datos)


@router.get("/daily-report/{fecha}")
async def reporte_diario_consolidado(fecha: str, db: AsyncSession = Depends(get_db)):
    """
    Reporte diario consolidado.
    Agrupa ventas por canal (PANADERÍA/HELADERÍA) y por cajero/terminal.
    Formato de fecha: YYYY-MM-DD
    """
    return await service.generar_reporte_diario(db, fecha)
