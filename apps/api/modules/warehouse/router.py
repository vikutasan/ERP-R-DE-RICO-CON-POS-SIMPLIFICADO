from fastapi import APIRouter, Depends, HTTPException, File, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
from core.database import get_db
from . import schemas, service
import os
import uuid

router = APIRouter()
warehouse_svc = service.warehouse_service

# --- v8: Catalogo de subcategorias (warehouse_propositos) ---
# IMPORTANTE: estas rutas literales deben declararse ANTES de "/{warehouse_id}"
# para que "subcategorias" no se interprete como un warehouse_id.

@router.get("/subcategorias", response_model=List[schemas.WarehousePropositoResponse])
async def list_subcategorias(incluir_inactivos: bool = False, db: AsyncSession = Depends(get_db)):
    """Lista el catalogo de subcategorias con el conteo de almacenes por cada una."""
    return await warehouse_svc.get_propositos(db, incluir_inactivos=incluir_inactivos)

@router.post("/subcategorias", response_model=schemas.WarehousePropositoResponse, status_code=201)
async def create_subcategoria(
    payload: schemas.WarehousePropositoCreate,
    usuario_id: str = None,
    db: AsyncSession = Depends(get_db),
):
    """v8: crea una subcategoria de usuario. Requiere permiso 'almacenes.crear'."""
    return await warehouse_svc.create_proposito(db, payload, usuario_id)

@router.post("/subcategorias/trasladar")
async def trasladar_subcategoria(
    payload: schemas.TrasladoSubcategoriaRequest,
    usuario_id: str = None,
    db: AsyncSession = Depends(get_db),
):
    """v8: traslada todos los almacenes de una subcategoria a otra.

    Se declara ANTES de "/subcategorias/{proposito_id}" para que "trasladar"
    no se interprete como un proposito_id.
    """
    trasladados = await warehouse_svc.trasladar_almacenes(
        db,
        origen_codigo=payload.origen_codigo,
        destino_codigo=payload.destino_codigo,
        usuario_id=usuario_id,
    )
    return {"ok": True, "almacenes_trasladados": trasladados, "destino": payload.destino_codigo}

@router.put("/subcategorias/{proposito_id}", response_model=schemas.WarehousePropositoResponse)
async def update_subcategoria(
    proposito_id: str,
    payload: schemas.WarehousePropositoUpdate,
    usuario_id: str = None,
    db: AsyncSession = Depends(get_db),
):
    """v8: edita label/icon/orden/activo. `codigo` no es editable.

    Una subcategoria de sistema no puede desactivarse (409).
    """
    return await warehouse_svc.update_proposito(db, proposito_id, payload, usuario_id)

@router.delete("/subcategorias/{proposito_id}", response_model=schemas.WarehousePropositoDeleteResponse)
async def delete_subcategoria(
    proposito_id: str,
    forzar_traslado: bool = False,
    usuario_id: str = None,
    db: AsyncSession = Depends(get_db),
):
    """v8: borrado fisico con bloqueo preventivo.

    - Subcategoria de sistema => 409.
    - Subcategoria con almacenes => 409 (trasladar primero).
    - `forzar_traslado=true` => mueve los almacenes a SIN_CLASIFICAR y borra,
      todo en una sola transaccion.
    """
    if forzar_traslado:
        return await warehouse_svc.delete_proposito_con_traslado(db, proposito_id, usuario_id)
    return await warehouse_svc.delete_proposito(db, proposito_id, usuario_id)

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
async def delete_warehouse(warehouse_id: str, usuario_id: str = None, db: AsyncSession = Depends(get_db)):
    """v7 (Fase 2.2): requiere permiso 'almacenes.eliminar' (403 si falta)."""
    return await warehouse_svc.delete_warehouse(db, warehouse_id, usuario_id)

@router.get("/{warehouse_id}/stock", response_model=List[schemas.StockAlmacenExtendedResponse])
async def get_warehouse_stock(warehouse_id: str, db: AsyncSession = Depends(get_db)):
    return await warehouse_svc.get_warehouse_stock(db, warehouse_id)

# v7 (Fase 0.5, D-STOCK): fuente unica de verdad del stock total por SKU.
# IMPORTANTE: debe declararse ANTES de las rutas con path param "/{warehouse_id}/..."
# para que "stock-por-sku" no se interprete como un warehouse_id.
@router.get("/stock-por-sku/{sku}", response_model=schemas.StockPorSkuResponse)
async def get_stock_by_sku(sku: str, db: AsyncSession = Depends(get_db)):
    """Stock total de un SKU sumando todos los almacenes (fuente unica de verdad)."""
    return await warehouse_svc.get_stock_by_sku(db, sku)

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

# v7 (Fase 6.2): entrada asistida por vision. El frontend captura la foto, la IA
# propone cantidades y el operador las confirma/edita. Solo entonces se llama
# aqui. El movimiento queda con metodo_captura = VISION_SNAPSHOT.
@router.post("/{warehouse_id}/entrada-vision", response_model=schemas.VisionSnapshotResponse)
async def vision_snapshot_entry(
    warehouse_id: str,
    payload: schemas.VisionSnapshotRequest,
    db: AsyncSession = Depends(get_db),
):
    """Registra una entrada confirmada por el operador tras deteccion por IA."""
    return await warehouse_svc.register_vision_snapshot(db, warehouse_id, payload)

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

# v7 (Fase 1.3, D2): diagnostico de SKUs que no se pudieron descontar del stock.
# Debe declararse ANTES de las rutas con path param "/{warehouse_id}/..." para
# que "diagnostico" no se interprete como un warehouse_id.
@router.get("/diagnostico/sin-almacen", response_model=List[schemas.EventoSinAlmacenResponse])
async def list_eventos_sin_almacen(limit: int = 100, db: AsyncSession = Depends(get_db)):
    """SKUs que no se pudieron descontar (sin SKU, sin stock o sin almacen de venta)."""
    return await warehouse_svc.get_eventos_sin_almacen(db, limit)
