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
        # Salida
        salida = schemas.MovimientoInventarioCreate(
            almacen_origen_id=payload.almacen_origen_id,
            almacen_destino_id=payload.almacen_destino_id,
            item_id=payload.item_id,
            item_type=payload.item_type,
            cantidad=-payload.cantidad,
            tipo_movimiento=schemas.TipoMovimiento.TRASPASO_SALIDA,
            metodo_captura=schemas.MetodoCaptura.MANUAL,
            usuario_id=payload.usuario_id
        )
        await self.register_movement(db, salida)
        
        # Entrada
        entrada = schemas.MovimientoInventarioCreate(
            almacen_origen_id=payload.almacen_origen_id,
            almacen_destino_id=payload.almacen_destino_id,
            item_id=payload.item_id,
            item_type=payload.item_type,
            cantidad=payload.cantidad,
            tipo_movimiento=schemas.TipoMovimiento.TRASPASO_ENTRADA,
            metodo_captura=schemas.MetodoCaptura.MANUAL,
            usuario_id=payload.usuario_id
        )
        return await self.register_movement(db, entrada)

warehouse_service = WarehouseService()
