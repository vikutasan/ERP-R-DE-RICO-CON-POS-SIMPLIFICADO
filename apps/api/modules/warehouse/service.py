from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import delete
from fastapi import HTTPException
from . import models, schemas
from modules.catalog.models import Product

class WarehouseService:
    # --- CRUD Almacenes ---
    async def get_all_warehouses(self, db: AsyncSession):
        result = await db.execute(select(models.Almacen))
        return result.scalars().all()

    async def create_warehouse(self, db: AsyncSession, payload: schemas.AlmacenCreate):
        db_wh = models.Almacen(**payload.model_dump())
        db.add(db_wh)
        await db.commit()
        await db.refresh(db_wh)
        return db_wh

    async def update_warehouse(self, db: AsyncSession, wh_id: str, payload: schemas.AlmacenUpdate):
        result = await db.execute(select(models.Almacen).where(models.Almacen.id == wh_id))
        db_wh = result.scalar_one_or_none()
        if not db_wh:
            raise HTTPException(status_code=404, detail="Almacén no encontrado")
        
        update_data = payload.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(db_wh, key, value)
            
        await db.commit()
        await db.refresh(db_wh)
        return db_wh

    async def delete_warehouse(self, db: AsyncSession, wh_id: str):
        # Integridad imperial: no borrar si hay stock mayor a 0
        result = await db.execute(select(models.StockAlmacen).where(models.StockAlmacen.almacen_id == wh_id, models.StockAlmacen.cantidad_actual > 0))
        if result.scalars().first():
            raise HTTPException(status_code=400, detail="No se puede eliminar un almacén con stock activo")
            
        result = await db.execute(select(models.Almacen).where(models.Almacen.id == wh_id))
        db_wh = result.scalar_one_or_none()
        if not db_wh:
            raise HTTPException(status_code=404, detail="Almacén no encontrado")
            
        await db.delete(db_wh)
        await db.commit()
        return {"detail": "Almacén eliminado exitosamente"}

    # --- CRUD Insumos Stub ---
    async def get_all_insumos(self, db: AsyncSession):
        result = await db.execute(select(models.Insumo))
        return result.scalars().all()
        
    async def create_insumo(self, db: AsyncSession, payload: schemas.InsumoCreate):
        db_insumo = models.Insumo(**payload.model_dump())
        db.add(db_insumo)
        await db.commit()
        await db.refresh(db_insumo)
        return db_insumo

    # --- Stock y Movimientos ---
    async def get_warehouse_stock(self, db: AsyncSession, wh_id: str):
        result = await db.execute(select(models.StockAlmacen).where(models.StockAlmacen.almacen_id == wh_id))
        stock_items = result.scalars().all()
        
        # Enriquecer con info de producto/insumo
        enriched = []
        for stock in stock_items:
            stock_dict = schemas.StockAlmacenExtendedResponse.model_validate(stock).model_dump()
            if stock.item_type == schemas.ItemType.PRODUCTO.value:
                prod_res = await db.execute(select(Product).where(Product.sku == stock.item_id))
                prod = prod_res.scalar_one_or_none()
                if prod:
                    stock_dict["item_name"] = prod.name
                    stock_dict["item_image_url"] = prod.image_url
                    stock_dict["item_price"] = float(prod.price)
                    stock_dict["item_unit"] = "PZA"
            else:
                ins_res = await db.execute(select(models.Insumo).where(models.Insumo.id == stock.item_id))
                ins = ins_res.scalar_one_or_none()
                if ins:
                    stock_dict["item_name"] = ins.nombre
                    stock_dict["item_unit"] = ins.unidad_base
            enriched.append(stock_dict)
            
        return enriched
        
    async def register_movement(self, db: AsyncSession, payload: schemas.MovimientoInventarioCreate):
        # 1. Registrar movimiento
        mov = models.MovimientoInventario(**payload.model_dump())
        db.add(mov)
        
        # 2. Actualizar stock
        result = await db.execute(
            select(models.StockAlmacen).where(
                models.StockAlmacen.almacen_id == payload.almacen_destino_id,
                models.StockAlmacen.item_id == payload.item_id
            )
        )
        stock = result.scalar_one_or_none()
        if not stock:
            stock = models.StockAlmacen(
                almacen_id=payload.almacen_destino_id,
                item_id=payload.item_id,
                item_type=payload.item_type.value,
                cantidad_actual=payload.cantidad
            )
            db.add(stock)
        else:
            stock.cantidad_actual += payload.cantidad
            
        await db.commit()
        await db.refresh(mov)
        return mov
        
    async def register_transfer(self, db: AsyncSession, payload: schemas.TraspasoRequest):
        # Verificar stock suficiente en origen
        result_origen = await db.execute(
            select(models.StockAlmacen).where(
                models.StockAlmacen.almacen_id == payload.almacen_origen_id,
                models.StockAlmacen.item_id == payload.item_id
            )
        )
        stock_origen = result_origen.scalar_one_or_none()
        if not stock_origen or stock_origen.cantidad_actual < payload.cantidad:
            raise HTTPException(status_code=400, detail="Stock insuficiente en almacén origen")

        # Salida del origen
        mov_salida = models.MovimientoInventario(
            almacen_origen_id=payload.almacen_origen_id,
            almacen_destino_id=payload.almacen_destino_id,
            item_id=payload.item_id,
            item_type=payload.item_type.value,
            cantidad=payload.cantidad,
            tipo_movimiento=schemas.TipoMovimiento.TRASPASO_SALIDA.value,
            metodo_captura=schemas.MetodoCaptura.MANUAL.value,
            usuario_id=payload.usuario_id
        )
        db.add(mov_salida)
        stock_origen.cantidad_actual -= payload.cantidad

        # Entrada al destino
        mov_entrada = models.MovimientoInventario(
            almacen_origen_id=payload.almacen_origen_id,
            almacen_destino_id=payload.almacen_destino_id,
            item_id=payload.item_id,
            item_type=payload.item_type.value,
            cantidad=payload.cantidad,
            tipo_movimiento=schemas.TipoMovimiento.TRASPASO_ENTRADA.value,
            metodo_captura=schemas.MetodoCaptura.MANUAL.value,
            usuario_id=payload.usuario_id
        )
        db.add(mov_entrada)

        result_destino = await db.execute(
            select(models.StockAlmacen).where(
                models.StockAlmacen.almacen_id == payload.almacen_destino_id,
                models.StockAlmacen.item_id == payload.item_id
            )
        )
        stock_destino = result_destino.scalar_one_or_none()
        if not stock_destino:
            stock_destino = models.StockAlmacen(
                almacen_id=payload.almacen_destino_id,
                item_id=payload.item_id,
                item_type=payload.item_type.value,
                cantidad_actual=payload.cantidad
            )
            db.add(stock_destino)
        else:
            stock_destino.cantidad_actual += payload.cantidad

        await db.commit()
        await db.refresh(mov_entrada)
        return mov_entrada

    # --- Bloqueo Optimista ---
    async def update_stock(self, db: AsyncSession, wh_id: str, stock_id: str, payload: schemas.StockAlmacenUpdate):
        result = await db.execute(
            select(models.StockAlmacen).where(
                models.StockAlmacen.id == stock_id,
                models.StockAlmacen.almacen_id == wh_id
            )
        )
        stock = result.scalar_one_or_none()
        if not stock:
            raise HTTPException(status_code=404, detail="Stock no encontrado")

        # Bloqueo optimista: verificar version
        if stock.version != payload.version:
            raise HTTPException(
                status_code=409,
                detail=f"Conflicto de versión. Esperada: {payload.version}, actual: {stock.version}. Refresca y reintenta."
            )

        update_data = payload.model_dump(exclude_unset=True, exclude={"version"})
        for key, value in update_data.items():
            setattr(stock, key, value)
        stock.version += 1

        await db.commit()
        await db.refresh(stock)
        return stock

    # --- Entrada Masiva ---
    async def register_bulk_entry(self, db: AsyncSession, wh_id: str, payload: schemas.EntradaMasivaRequest):
        import uuid as _uuid
        lote_id = f"LOT-{_uuid.uuid4().hex[:8]}"
        resultados = []

        for item in payload.items:
            mov = models.MovimientoInventario(
                almacen_origen_id=None,  # Entrada externa
                almacen_destino_id=wh_id,
                item_id=item.item_id,
                item_type=item.item_type.value,
                cantidad=item.cantidad,
                tipo_movimiento=schemas.TipoMovimiento.ENTRADA_COMPRA.value,
                metodo_captura=schemas.MetodoCaptura.ENTRADA_MASIVA.value,
                usuario_id=payload.usuario_id,
                notas=item.notas,
                lote_entrada_id=lote_id
            )
            db.add(mov)

            # Actualizar stock con bloqueo optimista
            result = await db.execute(
                select(models.StockAlmacen).where(
                    models.StockAlmacen.almacen_id == wh_id,
                    models.StockAlmacen.item_id == item.item_id
                )
            )
            stock = result.scalar_one_or_none()
            if not stock:
                stock = models.StockAlmacen(
                    almacen_id=wh_id,
                    item_id=item.item_id,
                    item_type=item.item_type.value,
                    cantidad_actual=item.cantidad
                )
                db.add(stock)
            else:
                stock.cantidad_actual += item.cantidad
                stock.version += 1

            resultados.append({"item_id": item.item_id, "cantidad": item.cantidad, "status": "OK"})

        await db.commit()
        return {"lote_id": lote_id, "total_items": len(resultados), "items": resultados}

    # --- Mermas ---
    async def register_merma(self, db: AsyncSession, wh_id: str, payload: schemas.MermaRequest):
        # Buscar stock actual
        result = await db.execute(
            select(models.StockAlmacen).where(
                models.StockAlmacen.almacen_id == wh_id,
                models.StockAlmacen.item_id == payload.item_id
            )
        )
        stock = result.scalar_one_or_none()
        if not stock:
            raise HTTPException(status_code=404, detail="Producto no encontrado en este almacén")
        if stock.cantidad_actual < payload.cantidad:
            raise HTTPException(status_code=400, detail="La merma no puede ser mayor al stock actual")

        # Registrar movimiento
        mov = models.MovimientoInventario(
            almacen_origen_id=wh_id,
            almacen_destino_id=None,  # Salida (merma)
            item_id=payload.item_id,
            item_type=payload.item_type.value,
            cantidad=payload.cantidad,
            tipo_movimiento=schemas.TipoMovimiento.MERMA.value,
            metodo_captura=schemas.MetodoCaptura.MANUAL.value,
            usuario_id=payload.usuario_id,
            notas=payload.notas  # Notas obligatorias en merma
        )
        db.add(mov)

        # Descontar stock
        stock.cantidad_actual -= payload.cantidad
        stock.version += 1

        await db.commit()
        await db.refresh(mov)
        return mov

    # --- Historial de Movimientos ---
    async def get_movements(self, db: AsyncSession, almacen_id: str = None, limit: int = 100):
        query = select(models.MovimientoInventario).order_by(models.MovimientoInventario.timestamp.desc()).limit(limit)
        if almacen_id:
            query = query.where(
                (models.MovimientoInventario.almacen_origen_id == almacen_id) |
                (models.MovimientoInventario.almacen_destino_id == almacen_id)
            )
        result = await db.execute(query)
        return result.scalars().all()

    # --- Eventos Outbox ---
    async def get_pending_events(self, db: AsyncSession):
        result = await db.execute(
            select(models.WarehouseEvent)
            .where(models.WarehouseEvent.estado == "PENDIENTE")
            .order_by(models.WarehouseEvent.created_at.desc())
        )
        return result.scalars().all()

    async def get_failed_events(self, db: AsyncSession):
        result = await db.execute(
            select(models.WarehouseEvent)
            .where(models.WarehouseEvent.estado == "FALLIDO")
            .order_by(models.WarehouseEvent.created_at.desc())
        )
        return result.scalars().all()

warehouse_service = WarehouseService()


# --- Outbox Processor (Background Task) ---
async def process_warehouse_events():
    """
    Procesador asíncrono del Outbox Pattern.
    Polling cada 30s: lee eventos PENDIENTE, descuenta stock en almacenes EXHIBICION_VENTA.
    3 intentos máx → FALLIDO con error_log.
    """
    import asyncio
    import json
    from core.database import AsyncSessionLocal

    # Esperar 10s al startup para que la BD esté lista
    await asyncio.sleep(10)

    while True:
        try:
            async with AsyncSessionLocal() as db:
                result = await db.execute(
                    select(models.WarehouseEvent)
                    .where(models.WarehouseEvent.estado == "PENDIENTE")
                    .order_by(models.WarehouseEvent.created_at)
                    .limit(50)
                )
                eventos = result.scalars().all()

                for evento in eventos:
                    try:
                        items = json.loads(evento.items_json) if isinstance(evento.items_json, str) else evento.items_json

                        for item_data in items:
                            sku = item_data.get("sku")
                            qty = item_data.get("qty", 1)
                            if not sku:
                                continue

                            # Buscar stock en almacenes EXHIBICION_VENTA que tengan este SKU
                            stock_result = await db.execute(
                                select(models.StockAlmacen)
                                .join(models.Almacen, models.StockAlmacen.almacen_id == models.Almacen.id)
                                .where(
                                    models.Almacen.proposito == "EXHIBICION_VENTA",
                                    models.StockAlmacen.item_id == sku,
                                    models.StockAlmacen.cantidad_actual >= qty
                                )
                                .limit(1)
                            )
                            stock = stock_result.scalar_one_or_none()

                            if stock:
                                stock.cantidad_actual -= qty
                                stock.version += 1

                                # Registrar movimiento de salida por venta
                                mov = models.MovimientoInventario(
                                    almacen_origen_id=stock.almacen_id,
                                    almacen_destino_id=None,
                                    item_id=sku,
                                    item_type="PRODUCTO",
                                    cantidad=qty,
                                    tipo_movimiento="SALIDA_VENTA",
                                    metodo_captura="EVENTO_POS",
                                    usuario_id="SISTEMA",
                                    notas=f"Ticket #{evento.ticket_id}"
                                )
                                db.add(mov)

                        evento.estado = "PROCESADO"

                    except Exception as e:
                        evento.intentos += 1
                        if evento.intentos >= 3:
                            evento.estado = "FALLIDO"
                            evento.error_log = str(e)[:500]

                if eventos:
                    await db.commit()

        except Exception:
            pass  # Silenciar errores del procesador — NUNCA crashear el servidor

        await asyncio.sleep(30)
