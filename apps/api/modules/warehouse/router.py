from fastapi import APIRouter, Depends, HTTPException, File, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
from core.database import get_db
from . import schemas, service
import os
import uuid

router = APIRouter()
warehouse_svc = service.warehouse_service

@router.get("/", response_model=List[schemas.AlmacenResponse])
async def list_warehouses(db: AsyncSession = Depends(get_db)):
    return await warehouse_svc.get_all_warehouses(db)

@router.post("/", response_model=schemas.AlmacenResponse)
async def create_warehouse(payload: schemas.AlmacenCreate, db: AsyncSession = Depends(get_db)):
    return await warehouse_svc.create_warehouse(db, payload)

@router.put("/{warehouse_id}", response_model=schemas.AlmacenResponse)
async def update_warehouse(warehouse_id: str, payload: schemas.AlmacenUpdate, db: AsyncSession = Depends(get_db)):
    return await warehouse_svc.update_warehouse(db, warehouse_id, payload)

@router.delete("/{warehouse_id}")
async def delete_warehouse(warehouse_id: str, db: AsyncSession = Depends(get_db)):
    return await warehouse_svc.delete_warehouse(db, warehouse_id)

@router.get("/{warehouse_id}/stock", response_model=List[schemas.StockAlmacenExtendedResponse])
async def get_warehouse_stock(warehouse_id: str, db: AsyncSession = Depends(get_db)):
    return await warehouse_svc.get_warehouse_stock(db, warehouse_id)

@router.post("/{warehouse_id}/stock", response_model=schemas.MovimientoInventarioResponse)
async def add_stock(warehouse_id: str, payload: schemas.MovimientoInventarioCreate, db: AsyncSession = Depends(get_db)):
    payload.almacen_destino_id = warehouse_id
    return await warehouse_svc.register_movement(db, payload)

@router.post("/traspasos", response_model=schemas.MovimientoInventarioResponse)
async def transfer_stock(payload: schemas.TraspasoRequest, db: AsyncSession = Depends(get_db)):
    movimiento = schemas.MovimientoInventarioCreate(
        almacen_origen_id=payload.almacen_origen_id,
        almacen_destino_id=payload.almacen_destino_id,
        item_id=payload.item_id,
        item_type=payload.item_type,
        cantidad=payload.cantidad,
        tipo_movimiento=schemas.TipoMovimiento.TRASPASO_SALIDA,
        metodo_captura=schemas.MetodoCaptura.MANUAL,
        usuario_id=payload.usuario_id
    )
    return await warehouse_svc.register_transfer(db, payload)

@router.post("/upload-image")
async def upload_warehouse_image(file: UploadFile = File(...)):
    target_dir = os.path.join("static", "inventory")
    os.makedirs(target_dir, exist_ok=True)
    ext = file.filename.split('.')[-1] if '.' in file.filename else 'jpg'
    filename = f"alm_{uuid.uuid4().hex[:8]}.{ext}"
    filepath = os.path.join(target_dir, filename)
    
    with open(filepath, "wb") as buffer:
        content = await file.read()
        buffer.write(content)
        
    return {"image_url": f"/static/inventory/{filename}"}

@router.get("/insumos", response_model=List[schemas.InsumoResponse])
async def list_insumos(db: AsyncSession = Depends(get_db)):
    return await warehouse_svc.get_all_insumos(db)

@router.post("/insumos", response_model=schemas.InsumoResponse)
async def create_insumo(payload: schemas.InsumoCreate, db: AsyncSession = Depends(get_db)):
    return await warehouse_svc.create_insumo(db, payload)

# --- Endpoints nuevos (Plan V6) ---

@router.put("/{warehouse_id}/stock/{stock_id}", response_model=schemas.StockAlmacenResponse)
async def update_stock(warehouse_id: str, stock_id: str, payload: schemas.StockAlmacenUpdate, db: AsyncSession = Depends(get_db)):
    """Actualizar stock con bloqueo optimista (409 si versión no coincide)."""
    return await warehouse_svc.update_stock(db, warehouse_id, stock_id, payload)

@router.post("/{warehouse_id}/entrada-masiva")
async def bulk_entry(warehouse_id: str, payload: schemas.EntradaMasivaRequest, db: AsyncSession = Depends(get_db)):
    """Entrada en lote con lote_entrada_id compartido."""
    return await warehouse_svc.register_bulk_entry(db, warehouse_id, payload)

@router.post("/{warehouse_id}/mermas", response_model=schemas.MovimientoInventarioResponse)
async def register_merma(warehouse_id: str, payload: schemas.MermaRequest, db: AsyncSession = Depends(get_db)):
    """Registrar merma auditable (notas obligatorias)."""
    return await warehouse_svc.register_merma(db, warehouse_id, payload)

@router.get("/movimientos", response_model=List[schemas.MovimientoInventarioResponse])
async def list_movements(almacen_id: str = None, limit: int = 100, db: AsyncSession = Depends(get_db)):
    """Historial de movimientos auditable. Filtro opcional por almacén."""
    return await warehouse_svc.get_movements(db, almacen_id, limit)

@router.get("/eventos/pendientes")
async def list_pending_events(db: AsyncSession = Depends(get_db)):
    """Eventos del Outbox en estado PENDIENTE."""
    return await warehouse_svc.get_pending_events(db)

@router.get("/eventos/fallidos")
async def list_failed_events(db: AsyncSession = Depends(get_db)):
    """Dead-Letter Queue: eventos que fallaron 3+ veces."""
    return await warehouse_svc.get_failed_events(db)
