import logging

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import delete
from fastapi import HTTPException
from . import models, schemas
from modules.catalog.models import Product
# v7 (Fase 2): auditoria en la misma transaccion + RBAC (secciones 13 y 14).
from core.audit import registrar_auditoria, verificar_permiso

# v7 (Fase 0.5, D6): prohibido print() en produccion. Logger del modulo.
logger = logging.getLogger("rderico.warehouse")

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

    async def delete_warehouse(self, db: AsyncSession, wh_id: str, usuario_id=None):
        # v7 (Fase 2.2): RBAC. Eliminar un almacen es una operacion destructiva.
        await verificar_permiso(db, usuario_id, "almacenes.eliminar")

        # Integridad imperial: no borrar si hay stock mayor a 0
        result = await db.execute(select(models.StockAlmacen).where(models.StockAlmacen.almacen_id == wh_id, models.StockAlmacen.cantidad_actual > 0))
        if result.scalars().first():
            raise HTTPException(status_code=400, detail="No se puede eliminar un almacén con stock activo")
            
        result = await db.execute(select(models.Almacen).where(models.Almacen.id == wh_id))
        db_wh = result.scalar_one_or_none()
        if not db_wh:
            raise HTTPException(status_code=404, detail="Almacén no encontrado")

        # v7 (Fase 2.1): snapshot antes de borrar (el registro sobrevive al DELETE).
        snapshot = {
            "id": db_wh.id,
            "nombre": db_wh.nombre,
            "proposito": db_wh.proposito,
            "zona_termica": db_wh.zona_termica,
            "sucursal_id": db_wh.sucursal_id,
        }

        await db.delete(db_wh)

        # v7 (Fase 2.1): auditoria en la MISMA transaccion que el DELETE.
        await registrar_auditoria(
            db,
            usuario_id=usuario_id,
            accion="ELIMINAR",
            entidad="almacen",
            entidad_id=wh_id,
            valores_antes=snapshot,
            valores_despues=None,
            detalle=f"Eliminacion del almacen {wh_id}",
        )

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

        if not stock_items:
            return []

        # v7 (D10): antes se ejecutaba 1 query por cada item (N+1). Con 200 SKUs
        # eso eran 201 round-trips a la BD. Ahora se hace un solo SELECT ... IN
        # por cada tipo de item y se resuelve el enriquecimiento en memoria.
        producto_skus = [
            s.item_id for s in stock_items
            if s.item_type == schemas.ItemType.PRODUCTO.value
        ]
        insumo_ids = [
            s.item_id for s in stock_items
            if s.item_type != schemas.ItemType.PRODUCTO.value
        ]

        productos_map = {}
        if producto_skus:
            prod_res = await db.execute(select(Product).where(Product.sku.in_(producto_skus)))
            productos_map = {p.sku: p for p in prod_res.scalars().all()}

        insumos_map = {}
        if insumo_ids:
            ins_res = await db.execute(select(models.Insumo).where(models.Insumo.id.in_(insumo_ids)))
            insumos_map = {i.id: i for i in ins_res.scalars().all()}

        # Enriquecer con info de producto/insumo (lookup en memoria, sin queries)
        enriched = []
        for stock in stock_items:
            stock_dict = schemas.StockAlmacenExtendedResponse.model_validate(stock).model_dump()
            if stock.item_type == schemas.ItemType.PRODUCTO.value:
                prod = productos_map.get(stock.item_id)
                if prod:
                    stock_dict["item_name"] = prod.name
                    stock_dict["item_image_url"] = prod.image_url
                    stock_dict["item_price"] = float(prod.price)
                    stock_dict["item_unit"] = "PZA"
            else:
                ins = insumos_map.get(stock.item_id)
                if ins:
                    stock_dict["item_name"] = ins.nombre
                    stock_dict["item_unit"] = ins.unidad_base
            enriched.append(stock_dict)

        return enriched

    async def get_stock_by_sku(self, db: AsyncSession, sku: str):
        """v7 (Fase 0.5, D-STOCK): stock total de un SKU sumando todos los almacenes.

        Esta es la UNICA fuente de verdad de disponibilidad. Sustituye la lectura
        de la columna obsoleta `products.stock`. Devuelve el total y el desglose
        por almacen para trazabilidad.
        """
        result = await db.execute(
            select(models.StockAlmacen).where(
                models.StockAlmacen.item_id == sku,
                models.StockAlmacen.item_type == schemas.ItemType.PRODUCTO.value,
            )
        )
        stock_items = result.scalars().all()

        # El producto debe existir aunque no tenga stock registrado.
        prod_res = await db.execute(select(Product).where(Product.sku == sku))
        producto = prod_res.scalar_one_or_none()
        if not producto:
            raise HTTPException(status_code=404, detail=f"SKU '{sku}' no encontrado")

        # Resolver nombres de almacen en un solo SELECT ... IN (evita N+1).
        almacen_ids = [s.almacen_id for s in stock_items]
        almacenes_map = {}
        if almacen_ids:
            alm_res = await db.execute(
                select(models.Almacen).where(models.Almacen.id.in_(almacen_ids))
            )
            almacenes_map = {a.id: a for a in alm_res.scalars().all()}

        desglose = []
        stock_total = 0.0
        for s in stock_items:
            cantidad = float(s.cantidad_actual or 0.0)
            stock_total += cantidad
            almacen = almacenes_map.get(s.almacen_id)
            desglose.append({
                "almacen_id": s.almacen_id,
                "almacen_nombre": almacen.nombre if almacen else None,
                "cantidad_actual": cantidad,
                "stock_minimo": float(s.stock_minimo or 0.0),
                "version": s.version,
            })

        return {
            "sku": sku,
            "item_name": producto.name,
            "item_image_url": producto.image_url,
            "item_price": float(producto.price) if producto.price is not None else None,
            "item_unit": "PZA",
            "stock_total": stock_total,
            "desglose": desglose,
        }

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
                cantidad_actual=payload.cantidad,
                version=1  # v7 (D9): stock nuevo nace en version 1
            )
            db.add(stock)
        else:
            stock.cantidad_actual += payload.cantidad
            stock.version += 1  # v7 (D7): bloqueo optimista, toda mutacion incrementa version

        await db.commit()
        await db.refresh(mov)
        return mov
        
    async def register_transfer(self, db: AsyncSession, payload: schemas.TraspasoRequest):
        # v7 (Fase 2.2): RBAC. El backend valida por su cuenta; nunca se confia
        # en que el frontend oculte el boton (Defensa en Profundidad, seccion 4.4).
        await verificar_permiso(db, payload.usuario_id, "almacenes.traspaso")

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
        stock_origen.version += 1  # v7 (D8): bloqueo optimista en origen

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
                cantidad_actual=payload.cantidad,
                version=1  # v7 (D9): stock nuevo nace en version 1
            )
            db.add(stock_destino)
        else:
            stock_destino.cantidad_actual += payload.cantidad
            stock_destino.version += 1  # v7 (D8): bloqueo optimista en destino

        # v7 (Fase 2.1): auditoria en la MISMA transaccion. Si el commit falla,
        # el registro de auditoria se revierte con la operacion (no se audita lo
        # que no ocurrio).
        await registrar_auditoria(
            db,
            usuario_id=payload.usuario_id,
            accion="TRASPASO",
            entidad="movimiento_inventario",
            entidad_id=mov_entrada.id,
            valores_antes={
                "origen": {"almacen_id": payload.almacen_origen_id,
                           "cantidad_actual": stock_origen.cantidad_actual + payload.cantidad},
                "destino": {"almacen_id": payload.almacen_destino_id,
                            "cantidad_actual": stock_destino.cantidad_actual - payload.cantidad},
            },
            valores_despues={
                "origen": {"almacen_id": payload.almacen_origen_id,
                           "cantidad_actual": stock_origen.cantidad_actual},
                "destino": {"almacen_id": payload.almacen_destino_id,
                            "cantidad_actual": stock_destino.cantidad_actual},
            },
            detalle=f"Traspaso de {payload.cantidad} de {payload.item_id}",
        )

        await db.commit()
        await db.refresh(mov_entrada)
        return mov_entrada

    # --- Bloqueo Optimista ---
    async def update_stock(self, db: AsyncSession, wh_id: str, stock_id: str, payload: schemas.StockAlmacenUpdate):
        # v7 (Fase 2.2): RBAC para ajuste manual de stock.
        await verificar_permiso(db, payload.usuario_id, "almacenes.editar_stock")

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

        # v7 (Fase 2.1): snapshot del estado previo para la auditoria.
        antes = {
            "cantidad_actual": stock.cantidad_actual,
            "stock_minimo": stock.stock_minimo,
            "stock_maximo": stock.stock_maximo,
            "version": stock.version,
        }

        update_data = payload.model_dump(exclude_unset=True, exclude={"version", "usuario_id"})
        for key, value in update_data.items():
            setattr(stock, key, value)
        stock.version += 1

        # v7 (Fase 2.1): auditoria en la MISMA transaccion.
        await registrar_auditoria(
            db,
            usuario_id=payload.usuario_id,
            accion="AJUSTE",
            entidad="stock_almacen",
            entidad_id=stock.id,
            valores_antes=antes,
            valores_despues={
                "cantidad_actual": stock.cantidad_actual,
                "stock_minimo": stock.stock_minimo,
                "stock_maximo": stock.stock_maximo,
                "version": stock.version,
            },
            detalle=f"Ajuste manual de stock en almacen {wh_id}",
        )

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
                    cantidad_actual=item.cantidad,
                    version=1  # v7 (D9): stock nuevo nace en version 1
                )
                db.add(stock)
            else:
                stock.cantidad_actual += item.cantidad
                stock.version += 1  # v7 (D9): ya existia, se mantiene el incremento

            resultados.append({"item_id": item.item_id, "cantidad": item.cantidad, "status": "OK"})

        await db.commit()
        return {"lote_id": lote_id, "total_items": len(resultados), "items": resultados}

    # --- Escaner IA de Vision (Fase 6.2) ---
    async def register_vision_snapshot(self, db: AsyncSession, wh_id: str, payload: schemas.VisionSnapshotRequest):
        """v7 (Fase 6.2): registra una entrada a partir de una foto de charola.

        Regla human-in-the-loop: la IA solo PROPONE cantidades. Este metodo
        recibe unicamente los items que el operador ya confirmo o corrigio.
        Nunca se registra stock automaticamente sin confirmacion humana.

        El movimiento queda con metodo_captura = VISION_SNAPSHOT para que la
        auditoria distinga una entrada asistida por IA de una entrada manual.
        """
        import uuid as _uuid
        lote_id = f"VIS-{_uuid.uuid4().hex[:8]}"
        resultados = []

        for item in payload.items:
            mov = models.MovimientoInventario(
                almacen_origen_id=None,  # Entrada externa (produccion/compra)
                almacen_destino_id=wh_id,
                item_id=item.item_id,
                item_type=item.item_type.value,
                cantidad=item.cantidad,
                tipo_movimiento=schemas.TipoMovimiento.ENTRADA_COMPRA.value,
                metodo_captura=schemas.MetodoCaptura.VISION_SNAPSHOT.value,
                usuario_id=payload.usuario_id,
                notas=item.notas,
                lote_entrada_id=lote_id
            )
            db.add(mov)

            # Actualizar stock con bloqueo optimista (mismo patron que entrada masiva)
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
                    cantidad_actual=item.cantidad,
                    version=1  # v7 (D9): stock nuevo nace en version 1
                )
                db.add(stock)
            else:
                stock.cantidad_actual += item.cantidad
                stock.version += 1  # v7 (D9): ya existia, se mantiene el incremento

            resultados.append({
                "item_id": item.item_id,
                "cantidad": item.cantidad,
                "confianza": item.confianza,
                "status": "OK",
            })

        await db.commit()
        logger.info(
            "Entrada por vision registrada: lote=%s almacen=%s items=%d modelo=%s",
            lote_id, wh_id, len(resultados), payload.modelo or "n/d",
        )
        return {
            "lote_id": lote_id,
            "total_items": len(resultados),
            "metodo_captura": schemas.MetodoCaptura.VISION_SNAPSHOT.value,
            "items": resultados,
        }

    # --- Mermas ---
    async def register_merma(self, db: AsyncSession, wh_id: str, payload: schemas.MermaRequest):
        # v7 (Fase 2.2): RBAC. Solo perfiles con 'almacenes.merma' pueden mermar.
        await verificar_permiso(db, payload.usuario_id, "almacenes.merma")

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
        cantidad_antes = stock.cantidad_actual
        stock.cantidad_actual -= payload.cantidad
        stock.version += 1

        # v7 (Fase 2.1): auditoria en la MISMA transaccion. La merma es una
        # operacion sensible (perdida de inventario) y debe quedar trazada con
        # su motivo obligatorio.
        await registrar_auditoria(
            db,
            usuario_id=payload.usuario_id,
            accion="MERMA",
            entidad="movimiento_inventario",
            entidad_id=mov.id,
            valores_antes={"cantidad_actual": cantidad_antes},
            valores_despues={"cantidad_actual": stock.cantidad_actual},
            detalle=payload.notas,
        )

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

    async def get_eventos_sin_almacen(self, db: AsyncSession, limit: int = 100):
        """v7 (Fase 1.3, D2): SKUs que no se pudieron descontar del stock.

        Devuelve las ocurrencias registradas por el procesador de eventos para
        que el operador corrija la configuracion del producto o del almacen.
        """
        result = await db.execute(
            select(models.WarehouseEventoSinAlmacen)
            .order_by(models.WarehouseEventoSinAlmacen.created_at.desc())
            .limit(limit)
        )
        return result.scalars().all()

warehouse_service = WarehouseService()


# --- Outbox Processor (Background Task) ---
async def _process_single_event(db: AsyncSession, evento: models.WarehouseEvent) -> None:
    """v7 (Fase 1.1, D1): procesa UN evento dentro de su propia transaccion.

    Aislamiento transaccional: cada evento se confirma o se revierte por separado.
    Si un item falla a mitad del evento, se lanza la excepcion y el llamador hace
    rollback explicito, de modo que NUNCA queden descuentos parciales de stock
    "a medias" que luego se confirmen junto con otros eventos.

    El llamador es responsable de `commit()` (exito) o `rollback()` (fallo).
    """
    import json

    items = json.loads(evento.items_json) if isinstance(evento.items_json, str) else evento.items_json

    for item_data in items:
        sku = item_data.get("sku")
        qty = item_data.get("qty", 1)
        if not sku:
            # v7 (Fase 1.3, D2): no se ignora en silencio; se registra para diagnostico.
            logger.warning(
                "Evento %s: item sin SKU, se registra en diagnostico: %s",
                evento.id, item_data,
            )
            db.add(models.WarehouseEventoSinAlmacen(
                evento_id=evento.id,
                ticket_id=evento.ticket_id,
                sku=None,
                cantidad=qty,
                motivo="SIN_SKU",
                detalle=f"Item sin SKU en el evento: {item_data}",
            ))
            continue

        # v7 (Fase 1.2, D1): verificacion de deduplicacion ANTES de descontar.
        # Si este evento ya genero un movimiento para este SKU (reprocesamiento
        # tras un reinicio o un reintento), NO se vuelve a descontar stock.
        ya_procesado = await db.execute(
            select(models.MovimientoInventario.id).where(
                models.MovimientoInventario.evento_id == evento.id,
                models.MovimientoInventario.item_id == sku,
            )
        )
        if ya_procesado.scalar_one_or_none() is not None:
            logger.info(
                "Evento %s: SKU '%s' ya fue descontado (idempotencia), se omite",
                evento.id, sku,
            )
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

        if not stock:
            # v7 (Fase 1.3, D2): SKU sin almacen de venta con stock suficiente.
            # No se ignora en silencio: se registra para diagnostico.
            logger.warning(
                "Evento %s: SKU '%s' sin stock suficiente en EXHIBICION_VENTA (qty=%s)",
                evento.id, sku, qty,
            )
            db.add(models.WarehouseEventoSinAlmacen(
                evento_id=evento.id,
                ticket_id=evento.ticket_id,
                sku=sku,
                cantidad=qty,
                motivo="SIN_STOCK_SUFICIENTE",
                detalle=f"SKU '{sku}' sin stock suficiente en almacenes EXHIBICION_VENTA",
            ))
            continue

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
            notas=f"Ticket #{evento.ticket_id}",
            # v7 (Fase 1.2, D1): liga el movimiento al evento para la idempotencia.
            evento_id=evento.id,
        )
        db.add(mov)

    evento.estado = "PROCESADO"


async def process_warehouse_events():
    """
    Procesador asíncrono del Outbox Pattern.
    Polling cada 30s: lee eventos PENDIENTE, descuenta stock en almacenes EXHIBICION_VENTA.
    3 intentos máx → FALLIDO con error_log.

    v7 (Fase 1.1, D1): cada evento se procesa en su PROPIA transaccion. Un fallo
    en un evento hace rollback explicito SOLO de ese evento (sin descuentos
    parciales) y no afecta a los demas. El POS nunca se bloquea por este proceso.
    """
    import asyncio
    from core.database import AsyncSessionLocal

    # Esperar 10s al startup para que la BD esté lista
    await asyncio.sleep(10)

    while True:
        try:
            # Fase 1: leer los IDs de eventos pendientes en una sesion corta y cerrarla,
            # para no mantener una transaccion abierta mientras se procesan uno a uno.
            async with AsyncSessionLocal() as db:
                result = await db.execute(
                    select(models.WarehouseEvent.id)
                    .where(models.WarehouseEvent.estado == "PENDIENTE")
                    .order_by(models.WarehouseEvent.created_at)
                    .limit(50)
                )
                evento_ids = result.scalars().all()

            # Fase 2: procesar cada evento en su propia transaccion aislada.
            for evento_id in evento_ids:
                async with AsyncSessionLocal() as db:
                    try:
                        evento = await db.get(models.WarehouseEvent, evento_id)
                        if not evento or evento.estado != "PENDIENTE":
                            continue

                        await _process_single_event(db, evento)
                        await db.commit()

                    except Exception as e:
                        # Rollback explicito: descarta cualquier descuento parcial
                        # de ESTE evento. Los demas eventos no se ven afectados.
                        await db.rollback()
                        logger.error(
                            "Evento %s fallo y se revirtio: %s", evento_id, e, exc_info=True
                        )
                        await _mark_event_failed(evento_id, e)

        except Exception:
            logger.error("Error en el bucle del procesador de eventos", exc_info=True)

        await asyncio.sleep(30)


async def _mark_event_failed(evento_id: int, error: Exception) -> None:
    """v7 (Fase 1.1, D1): incrementa intentos y marca FALLIDO tras 3 fallos.

    Se ejecuta en una sesion NUEVA y limpia (la anterior ya se revirtio), para
    que el contador de intentos y el error_log persistan aunque el procesamiento
    del evento haya fallado.
    """
    from core.database import AsyncSessionLocal

    async with AsyncSessionLocal() as db:
        try:
            evento = await db.get(models.WarehouseEvent, evento_id)
            if not evento:
                return
            evento.intentos = (evento.intentos or 0) + 1
            if evento.intentos >= 3:
                evento.estado = "FALLIDO"
                evento.error_log = str(error)[:500]
            await db.commit()
        except Exception:
            await db.rollback()
            logger.error("No se pudo marcar el evento %s como fallido", evento_id, exc_info=True)
