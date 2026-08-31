"""
MÓDULO: grandeza/service.py
Servicios de negocio para el módulo Reparto Pan Grandeza.
Fase 0: Solo operaciones CRUD base. La lógica inteligente se agrega en fases posteriores.
"""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, func
from sqlalchemy.orm import selectinload
from typing import List, Optional
from datetime import date, datetime


# ─── Timezone: Hora oficial de México para todos los timestamps de Grandeza ───
# Los contenedores Docker corren en UTC por defecto. Esta función garantiza
# que los timestamps se guarden en hora local de México sin depender del SO.
from core.timezone import get_business_tz, local_now

async def _now_mexico(db):
    """Retorna datetime naive en hora del negocio (configurable via system_settings)."""
    return local_now(await get_business_tz(db))

from .models import (
    GrandezaProductConfig, GrandezaClient, GrandezaRouteSlot,
    GrandezaExtraordinaryRouteSlot,
    GrandezaJourney, GrandezaInventory, GrandezaVisit, GrandezaVisitItem,
    GrandezaDriverLocation, GrandezaSettings, GrandezaExpense
)
from modules.catalog.models import Product


class GrandezaService:

    # ─── Productos Grandeza ───────────────────────────────────────────────

    async def get_grandeza_products(self, db: AsyncSession):
        """Lista todos los productos habilitados para Grandeza con su info del catálogo."""
        stmt = (
            select(GrandezaProductConfig)
            .options(selectinload(GrandezaProductConfig.product).selectinload(Product.technical_sheet))
            .where(GrandezaProductConfig.is_enabled == True)
            .order_by(GrandezaProductConfig.id)
        )
        result = await db.execute(stmt)
        configs = result.scalars().all()
        
        # Enriquecer con datos del producto
        response = []
        for cfg in configs:
            lead_time = 0.0
            if cfg.product and cfg.product.technical_sheet:
                lead_time = float(cfg.product.technical_sheet.order_lead_time_hours or 0.0)
                
            data = {
                "id": cfg.id,
                "product_id": cfg.product_id,
                "is_enabled": cfg.is_enabled,
                "b2b_price": cfg.b2b_price,
                "product_name": cfg.product.name if cfg.product else None,
                "product_sku": cfg.product.sku if cfg.product else None,
                "product_price": cfg.product.price if cfg.product else None,
                "order_lead_time_hours": lead_time,
            }
            response.append(data)
        return response

    async def upsert_grandeza_product(self, db: AsyncSession, product_id: int, b2b_price: float, is_enabled: bool = True):
        """Crear o actualizar la configuración Grandeza de un producto."""
        stmt = select(GrandezaProductConfig).where(GrandezaProductConfig.product_id == product_id)
        result = await db.execute(stmt)
        config = result.scalar_one_or_none()
        
        if config:
            config.b2b_price = b2b_price
            config.is_enabled = is_enabled
        else:
            config = GrandezaProductConfig(product_id=product_id, b2b_price=b2b_price, is_enabled=is_enabled)
            db.add(config)
        
        await db.flush()
        return config

    async def disable_grandeza_product(self, db: AsyncSession, product_id: int):
        """Deshabilitar un producto del módulo Grandeza (no lo borra, solo lo marca)."""
        stmt = select(GrandezaProductConfig).where(GrandezaProductConfig.product_id == product_id)
        result = await db.execute(stmt)
        config = result.scalar_one_or_none()
        if config:
            config.is_enabled = False
            await db.flush()
        return config

    # ─── Clientes ─────────────────────────────────────────────────────────

    async def get_clients(self, db: AsyncSession, active_only: bool = True):
        """Lista clientes con sus slots de ruta."""
        stmt = select(GrandezaClient).options(selectinload(GrandezaClient.route_slots))
        if active_only:
            stmt = stmt.where(GrandezaClient.active == True)
        stmt = stmt.order_by(GrandezaClient.name)
        result = await db.execute(stmt)
        return result.scalars().all()

    async def get_client(self, db: AsyncSession, client_id: int):
        """Obtener un cliente por ID."""
        stmt = (
            select(GrandezaClient)
            .options(selectinload(GrandezaClient.route_slots))
            .where(GrandezaClient.id == client_id)
        )
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    async def create_client(self, db: AsyncSession, data: dict):
        client = GrandezaClient(**data)
        db.add(client)
        await db.flush()
        return await self.get_client(db, client.id)

    async def update_client(self, db: AsyncSession, client_id: int, data: dict):
        client = await self.get_client(db, client_id)
        if not client:
            return None
        for key, value in data.items():
            if value is not None and hasattr(client, key):
                setattr(client, key, value)
        await db.flush()
        return client

    async def deactivate_client(self, db: AsyncSession, client_id: int):
        """Soft delete: desactiva el cliente y lo retira de todas las rutas."""
        client = await self.get_client(db, client_id)
        if not client:
            return None
        client.active = False
        # Retirar de todas las rutas
        await db.execute(
            delete(GrandezaRouteSlot).where(GrandezaRouteSlot.client_id == client_id)
        )
        await db.commit()
        return client

    async def delete_client_permanently(self, db: AsyncSession, client_id: int):
        """Hard delete: elimina el cliente y TODOS sus registros asociados (visitas, items, rutas)."""
        client = await self.get_client(db, client_id)
        if not client:
            return None
        # 1. Eliminar visit_items de las visitas de este cliente
        visit_ids_stmt = select(GrandezaVisit.id).where(GrandezaVisit.client_id == client_id)
        visit_ids_result = await db.execute(visit_ids_stmt)
        visit_ids = [row[0] for row in visit_ids_result.all()]
        if visit_ids:
            await db.execute(
                delete(GrandezaVisitItem).where(GrandezaVisitItem.visit_id.in_(visit_ids))
            )
        # 2. Eliminar visitas
        await db.execute(
            delete(GrandezaVisit).where(GrandezaVisit.client_id == client_id)
        )
        # 3. Eliminar route_slots (ya cubierto por cascade, pero explícito por seguridad)
        await db.execute(
            delete(GrandezaRouteSlot).where(GrandezaRouteSlot.client_id == client_id)
        )
        # 4. Eliminar el cliente
        await db.execute(
            delete(GrandezaClient).where(GrandezaClient.id == client_id)
        )
        await db.commit()
        return True

    # ─── Route Slots ──────────────────────────────────────────────────────

    async def get_route_by_day(self, db: AsyncSession, day_of_week: str):
        """Obtener la ruta de un día específico con clientes ordenados."""
        stmt = (
            select(GrandezaRouteSlot)
            .options(selectinload(GrandezaRouteSlot.client))
            .where(GrandezaRouteSlot.day_of_week == day_of_week.upper())
            .order_by(GrandezaRouteSlot.visit_order)
        )
        result = await db.execute(stmt)
        return result.scalars().all()

    async def set_route_slots(self, db: AsyncSession, day_of_week: str, slots: list):
        """Reemplazar la ruta completa de un día (para reordenar o cambiar clientes)."""
        # Eliminar slots existentes para ese día
        await db.execute(
            delete(GrandezaRouteSlot).where(GrandezaRouteSlot.day_of_week == day_of_week.upper())
        )
        # Crear nuevos slots
        for i, slot_data in enumerate(slots):
            slot = GrandezaRouteSlot(
                client_id=slot_data["client_id"],
                day_of_week=day_of_week.upper(),
                visit_order=i + 1
            )
            db.add(slot)
        await db.flush()

    # ─── Rutas Extraordinarias ────────────────────────────────────────────

    async def get_extraordinary_route(self, db: AsyncSession, route_date: date):
        """Obtener los slots de una ruta extraordinaria para una fecha específica."""
        stmt = (
            select(GrandezaExtraordinaryRouteSlot)
            .options(selectinload(GrandezaExtraordinaryRouteSlot.client))
            .where(GrandezaExtraordinaryRouteSlot.route_date == route_date)
            .order_by(GrandezaExtraordinaryRouteSlot.visit_order)
        )
        result = await db.execute(stmt)
        return result.scalars().all()

    async def set_extraordinary_route(self, db: AsyncSession, route_date: date, slots: list, label: str = None):
        """Crear o reemplazar una ruta extraordinaria completa para una fecha."""
        await db.execute(
            delete(GrandezaExtraordinaryRouteSlot)
            .where(GrandezaExtraordinaryRouteSlot.route_date == route_date)
        )
        for i, slot_data in enumerate(slots):
            slot = GrandezaExtraordinaryRouteSlot(
                route_date=route_date,
                client_id=slot_data["client_id"],
                visit_order=i + 1,
                label=label
            )
            db.add(slot)
        await db.flush()

    async def delete_extraordinary_route(self, db: AsyncSession, route_date: date):
        """Eliminar una ruta extraordinaria por fecha."""
        result = await db.execute(
            delete(GrandezaExtraordinaryRouteSlot)
            .where(GrandezaExtraordinaryRouteSlot.route_date == route_date)
        )
        await db.flush()
        return result.rowcount > 0

    async def list_extraordinary_routes(self, db: AsyncSession):
        """Lista todas las rutas extraordinarias agrupadas por fecha (para el admin)."""
        stmt = (
            select(GrandezaExtraordinaryRouteSlot)
            .order_by(
                GrandezaExtraordinaryRouteSlot.route_date,
                GrandezaExtraordinaryRouteSlot.visit_order
            )
        )
        result = await db.execute(stmt)
        all_slots = result.scalars().all()

        routes_map = {}
        for slot in all_slots:
            date_key = slot.route_date.isoformat()
            if date_key not in routes_map:
                routes_map[date_key] = {
                    "route_date": slot.route_date.isoformat(),
                    "label": slot.label,
                    "client_count": 0
                }
            routes_map[date_key]["client_count"] += 1

        return list(routes_map.values())

    async def get_effective_route(self, db: AsyncSession, route_date: date):
        """
        Ruta efectiva para una fecha: prioriza extraordinaria sobre regular.
        Retorna dict con type ('EXTRAORDINARIA' o 'REGULAR'), slots serializados, y metadata.
        """
        extraordinary_slots = await self.get_extraordinary_route(db, route_date)
        if extraordinary_slots:
            label = extraordinary_slots[0].label if extraordinary_slots else None
            return {
                "type": "EXTRAORDINARIA",
                "label": label,
                "route_date": route_date.isoformat(),
                "slots": [
                    {
                        "slot_id": s.id,
                        "client_id": s.client_id,
                        "visit_order": s.visit_order,
                        "client": {
                            "id": s.client.id,
                            "name": s.client.name,
                            "business_name": s.client.business_name,
                            "phone": s.client.phone,
                            "address": s.client.address,
                            "google_maps_url": s.client.google_maps_url,
                            "facade_photo_url": s.client.facade_photo_url,
                        } if s.client else None
                    }
                    for s in extraordinary_slots
                ]
            }

        day_map = {0: 'LUNES', 1: 'MARTES', 2: 'MIERCOLES', 3: 'JUEVES', 4: 'VIERNES', 5: 'SABADO', 6: 'DOMINGO'}
        day_of_week = day_map[route_date.weekday()]
        regular_slots = await self.get_route_by_day(db, day_of_week)
        return {
            "type": "REGULAR",
            "day_of_week": day_of_week,
            "route_date": route_date.isoformat(),
            "slots": [
                {
                    "slot_id": s.id,
                    "client_id": s.client_id,
                    "visit_order": s.visit_order,
                    "client": {
                        "id": s.client.id,
                        "name": s.client.name,
                        "business_name": s.client.business_name,
                        "phone": s.client.phone,
                        "address": s.client.address,
                        "google_maps_url": s.client.google_maps_url,
                        "facade_photo_url": s.client.facade_photo_url,
                    } if s.client else None
                }
                for s in regular_slots
            ]
        }

    # ─── Jornadas ─────────────────────────────────────────────────────────

    async def get_journey_by_date(self, db: AsyncSession, journey_date: date):
        """Obtener la jornada de una fecha específica."""
        stmt = (
            select(GrandezaJourney)
            .where(GrandezaJourney.journey_date == journey_date)
        )
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    async def create_journey(self, db: AsyncSession, data: dict):
        journey = GrandezaJourney(**data)
        db.add(journey)
        await db.flush()
        return journey

    async def update_journey(self, db: AsyncSession, journey_id: int, data: dict):
        stmt = select(GrandezaJourney).where(GrandezaJourney.id == journey_id)
        result = await db.execute(stmt)
        journey = result.scalar_one_or_none()
        if not journey:
            return None
            
        if data.get("status") == "EN_RUTA" and journey.status != "EN_RUTA" and not journey.dispatched_at:
            journey.dispatched_at = await _now_mexico(db)
            
        for key, value in data.items():
            if value is not None and hasattr(journey, key):
                setattr(journey, key, value)
        await db.flush()
        return journey

    # ─── Inventario ───────────────────────────────────────────────────────

    async def set_inventory(self, db: AsyncSession, journey_id: int, inventory_type: str, items: list):
        """Establecer inventario (inicial o final) para una jornada."""
        # Eliminar registros existentes de ese tipo
        await db.execute(
            delete(GrandezaInventory).where(
                GrandezaInventory.journey_id == journey_id,
                GrandezaInventory.inventory_type == inventory_type
            )
        )
        for item in items:
            record = GrandezaInventory(
                journey_id=journey_id,
                product_id=item["product_id"],
                inventory_type=inventory_type,
                fresh_qty=item.get("fresh_qty", 0),
                exchange_qty=item.get("exchange_qty", 0),
                received_qty=item.get("received_qty", 0),
            )
            db.add(record)
        await db.flush()

    async def get_inventory(self, db: AsyncSession, journey_id: int, inventory_type: str = None):
        stmt = select(GrandezaInventory).where(GrandezaInventory.journey_id == journey_id)
        if inventory_type:
            stmt = stmt.where(GrandezaInventory.inventory_type == inventory_type)
        result = await db.execute(stmt)
        return result.scalars().all()

    # ─── GPS ──────────────────────────────────────────────────────────────

    async def record_location(self, db: AsyncSession, journey_id: int, lat: float, lng: float, accuracy: float = None):
        location = GrandezaDriverLocation(
            journey_id=journey_id,
            lat=lat,
            lng=lng,
            accuracy=accuracy
        )
        db.add(location)
        await db.flush()
        return location

    async def get_locations(self, db: AsyncSession, journey_id: int):
        stmt = (
            select(GrandezaDriverLocation)
            .where(GrandezaDriverLocation.journey_id == journey_id)
            .order_by(GrandezaDriverLocation.recorded_at)
        )
        result = await db.execute(stmt)
        return result.scalars().all()

    # ─── Settings ─────────────────────────────────────────────────────────

    async def get_settings(self, db: AsyncSession):
        stmt = select(GrandezaSettings).order_by(GrandezaSettings.key)
        result = await db.execute(stmt)
        return result.scalars().all()

    async def upsert_setting(self, db: AsyncSession, key: str, value: str, description: str = None):
        stmt = select(GrandezaSettings).where(GrandezaSettings.key == key)
        result = await db.execute(stmt)
        setting = result.scalar_one_or_none()
        if setting:
            setting.value = value
        else:
            setting = GrandezaSettings(key=key, value=value, description=description)
            db.add(setting)
        await db.flush()
        return setting



    # ─── Visitas (CRUD) ───────────────────────────────────────────────────

    async def get_visits(self, db: AsyncSession, journey_id: int):
        stmt = (
            select(GrandezaVisit)
            .options(selectinload(GrandezaVisit.items), selectinload(GrandezaVisit.client))
            .where(GrandezaVisit.journey_id == journey_id)
            .order_by(GrandezaVisit.visit_order)
        )
        result = await db.execute(stmt)
        visits = result.scalars().all()
        response = []
        for v in visits:
            vd = {
                "id": v.id, "journey_id": v.journey_id, "client_id": v.client_id,
                "visit_order": v.visit_order, "visit_type": v.visit_type, "status": v.status,
                "arrived_at": str(v.arrived_at) if v.arrived_at else None,
                "completed_at": str(v.completed_at) if v.completed_at else None,
                "total_exchange_amount": v.total_exchange_amount,
                "total_fresh_amount": v.total_fresh_amount,
                "sale_amount": v.sale_amount,
                "payment_received": v.payment_received,
                "change_given": v.change_given,
                "incident_notes": v.incident_notes,
                "ext_client_name": v.ext_client_name,
                "ext_client_phone": v.ext_client_phone,
                "client_name": v.client.name if v.client else v.ext_client_name,
                "items": [
                    {"id": it.id, "product_id": it.product_id, "exchange_qty": it.exchange_qty,
                     "suggested_fresh_qty": it.suggested_fresh_qty, "actual_fresh_qty": it.actual_fresh_qty,
                     "missing_qty": it.missing_qty, "unit_price": it.unit_price}
                    for it in v.items
                ]
            }
            response.append(vd)
        return response

    async def create_visit(self, db: AsyncSession, journey_id: int, data: dict):
        from fastapi import HTTPException

        # ─── Protección contra visitas duplicadas ───
        # Si ya existe una visita COMPLETADA para este client_id en esta jornada,
        # rechazar para evitar duplicados accidentales.
        # Las visitas extemporáneas (client_id=None) se excluyen de esta validación.
        client_id = data.get("client_id")
        if client_id is not None:
            existing_stmt = (
                select(GrandezaVisit)
                .where(GrandezaVisit.journey_id == journey_id)
                .where(GrandezaVisit.client_id == client_id)
                .where(GrandezaVisit.status == "COMPLETADA")
            )
            existing_result = await db.execute(existing_stmt)
            if existing_result.scalar_one_or_none():
                raise HTTPException(
                    status_code=409,
                    detail=f"Ya existe una visita completada para este cliente (ID: {client_id}) en esta jornada."
                )

        ahora_mexico = await _now_mexico(db)
        visit = GrandezaVisit(
            journey_id=journey_id,
            client_id=client_id,
            visit_order=data.get("visit_order", 0),
            visit_type=data.get("visit_type", "PROGRAMADA"),
            status="COMPLETADA",
            arrived_at=ahora_mexico,
            completed_at=ahora_mexico,
            total_exchange_amount=data.get("total_exchange_amount", 0),
            total_fresh_amount=data.get("total_fresh_amount", 0),
            sale_amount=data.get("sale_amount", 0),
            payment_received=data.get("payment_received", 0),
            change_given=data.get("change_given", 0),
            incident_notes=data.get("incident_notes"),
            ext_client_name=data.get("ext_client_name"),
            ext_client_phone=data.get("ext_client_phone"),
        )
        db.add(visit)
        await db.flush()
        
        # Guardar items
        for item_data in data.get("items", []):
            item = GrandezaVisitItem(
                visit_id=visit.id,
                product_id=item_data["product_id"],
                exchange_qty=item_data.get("exchange_qty", 0),
                suggested_fresh_qty=item_data.get("suggested_fresh_qty", 0),
                actual_fresh_qty=item_data.get("actual_fresh_qty", 0),
                missing_qty=item_data.get("missing_qty", 0),
                unit_price=item_data.get("unit_price", 0),
            )
            db.add(item)
        await db.flush()
        return {"id": visit.id, "status": "COMPLETADA"}

    async def set_visit_items(self, db: AsyncSession, visit_id: int, items: list):
        await db.execute(delete(GrandezaVisitItem).where(GrandezaVisitItem.visit_id == visit_id))
        for item_data in items:
            item = GrandezaVisitItem(visit_id=visit_id, **item_data)
            db.add(item)
        await db.flush()

    async def update_visit(self, db: AsyncSession, visit_id: int, data: dict):
        stmt = select(GrandezaVisit).where(GrandezaVisit.id == visit_id)
        result = await db.execute(stmt)
        visit = result.scalar_one_or_none()
        if not visit:
            return None
        for key, value in data.items():
            if value is not None and hasattr(visit, key):
                setattr(visit, key, value)
        await db.flush()
        return visit

    # ─── Sugerencias ──────────────────────────────────────────────────────

    async def get_client_suggestions(self, db: AsyncSession, client_id: int):
        """Calcula promedio de piezas vendidas netas (frescas - cambios) por producto en las últimas 3 visitas.
        También devuelve last_fresh_qty para cálculo dinámico en el frontend."""
        # 1. Obtener las últimas 3 visitas completadas
        visit_stmt = (
            select(GrandezaVisit)
            .where(GrandezaVisit.client_id == client_id)
            .where(GrandezaVisit.status == "COMPLETADA")
            .order_by(GrandezaVisit.created_at.desc())
            .limit(3)
            .options(selectinload(GrandezaVisit.items))
        )
        visit_result = await db.execute(visit_stmt)
        last_visits = visit_result.scalars().all()

        if not last_visits:
            return []

        # 2. Agrupar items por producto
        from collections import defaultdict
        product_sales = defaultdict(list)
        # Guardar las frescas de la visita más reciente (índice 0) para sugerencia dinámica
        last_visit_fresh = {}
        
        for i, v in enumerate(last_visits):
            for item in v.items:
                net_sale = max(0, (item.actual_fresh_qty or 0) - (item.exchange_qty or 0))
                product_sales[item.product_id].append(net_sale)
                # Solo guardar de la visita más reciente (i == 0)
                if i == 0:
                    last_visit_fresh[item.product_id] = item.actual_fresh_qty or 0

        # 3. Calcular promedios
        suggestions = []
        import math
        for pid, sales in product_sales.items():
            if not sales: continue
            avg = sum(sales) / len(sales)
            suggestions.append({
                "product_id": pid,
                "suggested_qty": math.ceil(avg), # Redondeo hacia arriba por seguridad de inventario
                "visit_count": len(sales),
                "last_fresh_qty": last_visit_fresh.get(pid, 0)  # Frescas dejadas en la última visita
            })

        return suggestions

    # ─── Estadísticas por Cliente ─────────────────────────────────────────

    async def get_client_statistics(self, db: AsyncSession, client_id: int):
        """Historial completo de visitas de un cliente con desglose por producto."""
        # 1. Obtener TODAS las visitas completadas del cliente
        visit_stmt = (
            select(GrandezaVisit)
            .where(GrandezaVisit.client_id == client_id)
            .where(GrandezaVisit.status == "COMPLETADA")
            .order_by(GrandezaVisit.created_at.desc())
            .options(selectinload(GrandezaVisit.items))
        )
        visit_result = await db.execute(visit_stmt)
        all_visits = visit_result.scalars().all()

        if not all_visits:
            return {"visits": [], "summary": {}}

        # 2. Construir historial de visitas
        from collections import defaultdict
        visits_data = []
        product_totals = defaultdict(lambda: {"fresh": 0, "exchange": 0, "capitalized": 0, "count": 0, "product_name": ""})

        for v in all_visits:
            visit_entry = {
                "visit_id": v.id,
                "date": v.created_at.strftime("%Y-%m-%d") if v.created_at else None,
                "sale_amount": v.sale_amount or 0,
                "items": []
            }
            for item in v.items:
                fresh = item.actual_fresh_qty or 0
                exchange = item.exchange_qty or 0
                capitalized = max(0, fresh - exchange)
                
                # Obtener nombre del producto
                prod_stmt = select(Product).where(Product.id == item.product_id)
                prod_result = await db.execute(prod_stmt)
                product = prod_result.scalar_one_or_none()
                product_name = product.name if product else f"Producto #{item.product_id}"

                visit_entry["items"].append({
                    "product_id": item.product_id,
                    "product_name": product_name,
                    "fresh_qty": fresh,
                    "exchange_qty": exchange,
                    "capitalized": capitalized,
                    "unit_price": item.unit_price or 0
                })

                # Acumular para resumen
                product_totals[item.product_id]["fresh"] += fresh
                product_totals[item.product_id]["exchange"] += exchange
                product_totals[item.product_id]["capitalized"] += capitalized
                product_totals[item.product_id]["count"] += 1
                product_totals[item.product_id]["product_name"] = product_name

            visits_data.append(visit_entry)

        # 3. Calcular resumen por producto
        import math
        summary = {}
        for pid, totals in product_totals.items():
            count = totals["count"]
            summary[str(pid)] = {
                "product_id": pid,
                "product_name": totals["product_name"],
                "total_visits": count,
                "total_fresh": totals["fresh"],
                "total_exchange": totals["exchange"],
                "total_capitalized": totals["capitalized"],
                "avg_fresh": round(totals["fresh"] / count, 1) if count else 0,
                "avg_exchange": round(totals["exchange"] / count, 1) if count else 0,
                "avg_capitalized": round(totals["capitalized"] / count, 1) if count else 0,
                "suggested_qty": math.ceil(totals["capitalized"] / count) if count else 0
            }

        return {"visits": visits_data, "summary": summary}

    # ─── Gastos Operativos ────────────────────────────────────────────────

    async def get_expenses(self, db: AsyncSession, journey_id: int):
        from .models import GrandezaExpense
        stmt = (
            select(GrandezaExpense)
            .where(GrandezaExpense.journey_id == journey_id)
            .order_by(GrandezaExpense.created_at.asc())
        )
        result = await db.execute(stmt)
        return [
            {
                "id": e.id, "journey_id": e.journey_id,
                "description": e.description, "amount": e.amount,
                "created_at": str(e.created_at) if e.created_at else None,
            }
            for e in result.scalars().all()
        ]

    async def create_expense(self, db: AsyncSession, journey_id: int, data: dict):
        from .models import GrandezaExpense
        expense = GrandezaExpense(
            journey_id=journey_id,
            description=data["description"],
            amount=float(data["amount"]),
            created_at=await _now_mexico(db),
        )
        db.add(expense)
        await db.flush()
        return {
            "id": expense.id, "journey_id": expense.journey_id,
            "description": expense.description, "amount": expense.amount,
            "created_at": str(expense.created_at),
        }

    async def delete_expense(self, db: AsyncSession, expense_id: int):
        from .models import GrandezaExpense
        stmt = select(GrandezaExpense).where(GrandezaExpense.id == expense_id)
        result = await db.execute(stmt)
        expense = result.scalar_one_or_none()
        if not expense:
            return False
        await db.delete(expense)
        await db.flush()
        return True

    # ─── Pedidos Grandeza ─────────────────────────────────────────────────


    async def get_grandeza_orders(self, db: AsyncSession, status: str = None):
        from .models import GrandezaOrder
        stmt = select(GrandezaOrder).order_by(GrandezaOrder.created_at.desc())
        if status:
            stmt = stmt.where(GrandezaOrder.status == status)
        result = await db.execute(stmt)
        orders = result.scalars().all()
        return [
            {
                "id": o.id, "client_id": o.client_id, "client_name": o.client_name, "client_phone": o.client_phone,
                "items": o.items, "total_amount": o.total_amount, "advance_payment": o.advance_payment,
                "balance_due": max(0.0, o.total_amount - o.advance_payment),
                "payment_method": o.payment_method, "payment_status": o.payment_status,
                "delivery_date": o.delivery_date, "delivery_time": o.delivery_time,
                "status": o.status, "delivery_journey_id": o.delivery_journey_id,
                "notes": o.notes, "created_at": o.created_at
            }
            for o in orders
        ]

    async def create_grandeza_order(self, db: AsyncSession, data: dict):
        from .models import GrandezaOrder
        
        total = float(data.get("total_amount", 0))
        advance = float(data.get("advance_payment", 0))
        
        pay_status = "PENDIENTE"
        if advance >= total and total > 0:
            pay_status = "PAGADO"
        elif advance > 0:
            pay_status = "ANTICIPO"
            
        order = GrandezaOrder(
            client_id=data.get("client_id"),
            client_name=data.get("client_name"),
            client_phone=data.get("client_phone"),
            items=data.get("items", []),
            total_amount=total,
            advance_payment=advance,
            payment_method=data.get("payment_method", "EFECTIVO"),
            payment_status=pay_status,
            delivery_date=data["delivery_date"],
            delivery_time=data.get("delivery_time"),
            status="TENTATIVO", # Entra a Producción como tentativo, se confirma al liquidar
            notes=data.get("notes"),
        )
        db.add(order)
        await db.flush()
        return {"id": order.id, "status": order.status, "payment_status": order.payment_status, "delivery_date": str(order.delivery_date), "delivery_time": order.delivery_time}

    async def update_grandeza_order(self, db: AsyncSession, order_id: int, data: dict):
        from .models import GrandezaOrder
        stmt = select(GrandezaOrder).where(GrandezaOrder.id == order_id)
        result = await db.execute(stmt)
        order = result.scalar_one_or_none()
        if not order:
            return None
        for key, value in data.items():
            if value is not None and hasattr(order, key):
                setattr(order, key, value)
        await db.flush()
        return order



    # ─── Estimación de producción ───
    async def get_production_estimate(self, db: AsyncSession, target_date: date, last_n: int = 10):
        """
        Calcula la estimación de producción para una fecha dada.
        1. Determina la ruta (extraordinaria o regular)
        2. Para cada cliente, consulta las últimas N visitas completadas
        3. Calcula promedio de actual_fresh_qty por producto
        4. Retorna totales y desglose por cliente
        """
        import math
        
        # 1. Determinar tipo de ruta y obtener clientes
        # Verificar si hay ruta extraordinaria para esa fecha
        ext_result = await db.execute(
            select(GrandezaExtraordinaryRouteSlot)
            .where(GrandezaExtraordinaryRouteSlot.route_date == target_date)
            .order_by(GrandezaExtraordinaryRouteSlot.visit_order)
        )
        ext_slots = ext_result.scalars().all()
        
        if ext_slots:
            route_type = "EXTRAORDINARIA"
            client_ids = [s.client_id for s in ext_slots]
            label = ext_slots[0].label if ext_slots[0].label else None
        else:
            route_type = "REGULAR"
            label = None
            # Determinar día de la semana
            days_map = {0: 'LUNES', 1: 'MARTES', 2: 'MIERCOLES', 3: 'JUEVES', 4: 'VIERNES', 5: 'SABADO', 6: 'DOMINGO'}
            day_name = days_map.get(target_date.weekday(), 'LUNES')
            reg_result = await db.execute(
                select(GrandezaRouteSlot)
                .where(GrandezaRouteSlot.day_of_week == day_name)
                .order_by(GrandezaRouteSlot.visit_order)
            )
            reg_slots = reg_result.scalars().all()
            client_ids = [s.client_id for s in reg_slots]
        
        if not client_ids:
            return {
                "route_date": str(target_date),
                "route_type": route_type,
                "route_label": label,
                "client_count": 0,
                "clients": [],
                "totals": []
            }
        
        # 2. Obtener info de clientes
        clients_result = await db.execute(
            select(GrandezaClient).where(GrandezaClient.id.in_(client_ids))
        )
        clients_map = {c.id: c for c in clients_result.scalars().all()}
        
        # 3. Obtener productos habilitados
        prods_result = await db.execute(
            select(GrandezaProductConfig).where(GrandezaProductConfig.is_enabled == True)
        )
        products = prods_result.scalars().all()
        prod_names = {}
        for p in products:
            # Obtener nombre del producto del catálogo
            prod_result = await db.execute(select(Product).where(Product.id == p.product_id))
            prod = prod_result.scalar_one_or_none()
            prod_names[p.product_id] = prod.name if prod else f"Producto #{p.product_id}"
        
        # 4. Para cada cliente, calcular promedios
        clients_data = []
        product_totals = {}  # product_id -> { total_avg, total_estimated }
        
        for cid in client_ids:
            client = clients_map.get(cid)
            if not client:
                continue
            
            # Obtener últimas N visitas completadas de este cliente
            visits_result = await db.execute(
                select(GrandezaVisit)
                .options(selectinload(GrandezaVisit.items))
                .where(
                    GrandezaVisit.client_id == cid,
                    GrandezaVisit.status == 'COMPLETADA'
                )
                .order_by(GrandezaVisit.completed_at.desc())
                .limit(last_n)
            )
            recent_visits = visits_result.scalars().all()
            visit_count = len(recent_visits)
            
            client_products = []
            for p in products:
                pid = p.product_id
                # Sumar actual_fresh_qty de todas las visitas para este producto
                total_sold = 0
                for v in recent_visits:
                    for item in v.items:
                        if item.product_id == pid:
                            total_sold += item.actual_fresh_qty or 0
                
                avg_qty = total_sold / visit_count if visit_count > 0 else 0
                estimated = math.ceil(avg_qty) if avg_qty > 0 else 0
                
                client_products.append({
                    "product_id": pid,
                    "product_name": prod_names.get(pid, f"#{pid}"),
                    "avg_qty": round(avg_qty, 1),
                    "estimated_qty": estimated
                })
                
                # Acumular en totales
                if pid not in product_totals:
                    product_totals[pid] = {"total_avg": 0, "total_estimated": 0}
                product_totals[pid]["total_avg"] += avg_qty
                product_totals[pid]["total_estimated"] += estimated
            
            clients_data.append({
                "client_id": cid,
                "client_name": client.name,
                "business_name": client.business_name,
                "visit_count": visit_count,
                "products": client_products
            })
        
        # 5. Armar totales
        totals = []
        for p in products:
            pid = p.product_id
            pt = product_totals.get(pid, {"total_avg": 0, "total_estimated": 0})
            totals.append({
                "product_id": pid,
                "product_name": prod_names.get(pid, f"#{pid}"),
                "total_avg": round(pt["total_avg"], 1),
                "total_estimated": pt["total_estimated"]
            })
        
        return {
            "route_date": str(target_date),
            "route_type": route_type,
            "route_label": label,
            "client_count": len(clients_data),
            "clients": clients_data,
            "totals": totals
        }


grandeza_service = GrandezaService()
