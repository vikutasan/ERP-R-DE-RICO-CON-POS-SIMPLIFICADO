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


# ─── Timezone (v20 Fase 20.2.d): "Store UTC, Display Local" ───
# Los timestamps de Grandeza se guardan en UTC (naive). La conversión a hora
# local del negocio se hace en la capa de presentación (frontend formatLocal).
# _now_mexico se conserva como alias de utcnow() para no tocar los call-sites.
from core.timestamps import utcnow
from core.timezone import get_business_tz, to_local_date_str

async def _now_mexico(db=None):
    """Alias de utcnow(): los timestamps se almacenan en UTC (naive)."""
    return utcnow()

from .models import (
    GrandezaProductConfig, GrandezaClient, GrandezaRouteSlot,
    GrandezaExtraordinaryRouteSlot,
    GrandezaJourney, GrandezaInventory, GrandezaVisit, GrandezaVisitItem,
    GrandezaDriverLocation, GrandezaSettings, GrandezaExpense,
    GrandezaMessageLog,
    GrandezaOrderRequest, GrandezaOrderRequestItem,
)
from modules.catalog.models import Product


# ─── Programación de Mensajes (WhatsApp asistido) ─────────────────────────────
# Claves de configuración persistidas en grandeza_settings.
MSG_SCHEDULE_KEYS = {
    "enabled":   "msg_schedule_enabled",
    "text":      "msg_schedule_text",
    "selector":  "msg_schedule_selector",
    "send_day":  "msg_schedule_send_day",
    "send_time": "msg_schedule_send_time",
    "weekly":    "msg_schedule_weekly",
}

# Días válidos (sin acentos, como los usa el resto del módulo).
DIAS_VALIDOS = {"LUNES", "MARTES", "MIERCOLES", "JUEVES", "VIERNES", "SABADO", "DOMINGO"}

# Selectores soportados por el endpoint de resolución de destinatarios.
MSG_SELECTORES_VALIDOS = {
    "TODOS", "ACTIVOS", "INACTIVOS",
    "LUNES", "MARTES", "MIERCOLES", "JUEVES", "VIERNES", "SABADO", "DOMINGO",
    "PROXIMA_EXTEMPORANEA",
}


# ─── Programación de Pedidos (5ª pestaña) ─────────────────────────────────────
# Claves de configuración persistidas en grandeza_settings.
ORDER_CONFIG_KEYS = {
    "enabled":       "order_request_enabled",
    "deadline_day":  "order_request_deadline_day",
    "deadline_time": "order_request_deadline_time",
    "delivery_day":  "order_request_delivery_day",
    "selector":      "order_request_selector",
}


def _normalizar_telefono(raw: Optional[str]) -> Optional[str]:
    """
    Normaliza un teléfono a los últimos 10 dígitos (formato nacional MX).

    Regla heredada de sendWhatsApp() en GrandezaDriverUI.jsx:
    se limpian los no-dígitos y se exige un mínimo de 10. Si hay más
    (p. ej. prefijo 52), se toman los últimos 10. Si hay menos, se
    devuelve None para que el frontend lo marque como "sin teléfono".
    """
    if not raw:
        return None
    digitos = "".join(ch for ch in str(raw) if ch.isdigit())
    if len(digitos) < 10:
        return None
    return digitos[-10:]


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

    # ─── Programación de Mensajes (WhatsApp asistido) ─────────────────────

    async def get_message_schedule(self, db: AsyncSession) -> dict:
        """
        Lee la configuración de programación de mensajes desde grandeza_settings.
        Devuelve un dict con defaults seguros si aún no se ha guardado nada.
        """
        stmt = select(GrandezaSettings).where(
            GrandezaSettings.key.in_(list(MSG_SCHEDULE_KEYS.values()))
        )
        result = await db.execute(stmt)
        rows = {s.key: s.value for s in result.scalars().all()}

        def _bool(key: str, default: bool = False) -> bool:
            raw = rows.get(MSG_SCHEDULE_KEYS[key])
            if raw is None:
                return default
            return str(raw).strip().lower() in ("1", "true", "yes", "si", "sí")

        return {
            "enabled":   _bool("enabled", False),
            "text":      rows.get(MSG_SCHEDULE_KEYS["text"]) or "",
            "selector":  rows.get(MSG_SCHEDULE_KEYS["selector"]) or "TODOS",
            "send_day":  rows.get(MSG_SCHEDULE_KEYS["send_day"]) or None,
            "send_time": rows.get(MSG_SCHEDULE_KEYS["send_time"]) or None,
            "weekly":    _bool("weekly", False),
        }

    async def save_message_schedule(self, db: AsyncSession, data) -> dict:
        """
        Persiste la configuración de programación de mensajes.
        Respeta la entrada del usuario (§7.4): no normaliza ni sobrescribe el texto.
        """
        selector = (data.selector or "TODOS").strip().upper()
        if selector not in MSG_SELECTORES_VALIDOS:
            selector = "TODOS"

        send_day = (data.send_day or "").strip().upper() or None
        if send_day and send_day not in DIAS_VALIDOS:
            send_day = None

        send_time = (data.send_time or "").strip() or None

        await self.upsert_setting(db, MSG_SCHEDULE_KEYS["enabled"],   "true" if data.enabled else "false")
        await self.upsert_setting(db, MSG_SCHEDULE_KEYS["text"],      data.text or "")
        await self.upsert_setting(db, MSG_SCHEDULE_KEYS["selector"],  selector)
        await self.upsert_setting(db, MSG_SCHEDULE_KEYS["send_day"],  send_day or "")
        await self.upsert_setting(db, MSG_SCHEDULE_KEYS["send_time"], send_time or "")
        await self.upsert_setting(db, MSG_SCHEDULE_KEYS["weekly"],    "true" if data.weekly else "false")
        await db.flush()

        return await self.get_message_schedule(db)

    async def resolve_message_recipients(self, db: AsyncSession, selector: str) -> dict:
        """
        Resuelve la lista de destinatarios según el selector elegido.

        Selectores soportados (11):
          TODOS, ACTIVOS, INACTIVOS,
          LUNES..DOMINGO (clientes con slot de ruta ese día),
          PROXIMA_EXTEMPORANEA (clientes de la próxima ruta extraordinaria).

        Eager loading obligatorio (§7.6 / Error B): se cargan los route_slots
        con selectinload para evitar el 500 sin cabeceras CORS.
        """
        selector = (selector or "TODOS").strip().upper()
        if selector not in MSG_SELECTORES_VALIDOS:
            selector = "TODOS"

        stmt = select(GrandezaClient).options(selectinload(GrandezaClient.route_slots))

        if selector == "ACTIVOS":
            stmt = stmt.where(GrandezaClient.active == True)  # noqa: E712
        elif selector == "INACTIVOS":
            stmt = stmt.where(GrandezaClient.active == False)  # noqa: E712
        elif selector in DIAS_VALIDOS:
            stmt = stmt.join(GrandezaRouteSlot).where(
                GrandezaRouteSlot.day_of_week == selector
            )
        elif selector == "PROXIMA_EXTEMPORANEA":
            # Próxima fecha con ruta extraordinaria (>= hoy, hora local del negocio).
            hoy = date.fromisoformat(to_local_date_str(utcnow()))
            sub = (
                select(GrandezaExtraordinaryRouteSlot.client_id)
                .where(GrandezaExtraordinaryRouteSlot.route_date >= hoy)
                .order_by(GrandezaExtraordinaryRouteSlot.route_date)
            )
            result_dates = await db.execute(
                select(GrandezaExtraordinaryRouteSlot.route_date)
                .where(GrandezaExtraordinaryRouteSlot.route_date >= hoy)
                .order_by(GrandezaExtraordinaryRouteSlot.route_date)
                .limit(1)
            )
            proxima = result_dates.scalar_one_or_none()
            if proxima is None:
                return {"selector": selector, "total": 0, "with_phone": 0,
                        "without_phone": 0, "recipients": []}
            stmt = stmt.join(GrandezaExtraordinaryRouteSlot).where(
                GrandezaExtraordinaryRouteSlot.route_date == proxima
            )

        stmt = stmt.order_by(GrandezaClient.name)
        result = await db.execute(stmt)
        clientes = result.scalars().unique().all()

        recipients = []
        with_phone = 0
        for c in clientes:
            tel = _normalizar_telefono(c.phone)
            if tel:
                with_phone += 1
            # Día de ruta representativo (el primero disponible) para mostrar en UI.
            dia = None
            if c.route_slots:
                dia = c.route_slots[0].day_of_week
            recipients.append({
                "client_id": c.id,
                "name": c.name,
                "phone": tel,
                "day_of_week": dia,
                "is_active": bool(c.active),
            })

        return {
            "selector": selector,
            "total": len(recipients),
            "with_phone": with_phone,
            "without_phone": len(recipients) - with_phone,
            "recipients": recipients,
        }

    async def log_message_sent(self, db: AsyncSession, data) -> GrandezaMessageLog:
        """
        Registra en la bitácora un mensaje efectivamente enviado.
        El texto se COPIA (snapshot inmutable), no se referencia.
        """
        tel = _normalizar_telefono(data.phone_used)
        entry = GrandezaMessageLog(
            client_id=data.client_id,
            phone_used=tel or (data.phone_used or "")[:20],
            message_text=data.message_text or "",
            selector_used=(data.selector_used or "TODOS").strip().upper()[:30],
            sent_at=utcnow(),
            sent_by=(data.sent_by or None),
            batch_id=(data.batch_id or None),
        )
        db.add(entry)
        await db.flush()
        return entry

    async def get_message_log(self, db: AsyncSession, limit: int = 100) -> list:
        """
        Devuelve la bitácora de mensajes enviados, más reciente primero.
        Incluye el nombre del cliente (eager loading del relationship).
        """
        stmt = (
            select(GrandezaMessageLog)
            .options(selectinload(GrandezaMessageLog.client))
            .order_by(GrandezaMessageLog.sent_at.desc())
            .limit(max(1, min(limit, 500)))
        )
        result = await db.execute(stmt)
        rows = result.scalars().all()
        return [
            {
                "id": r.id,
                "client_id": r.client_id,
                "phone_used": r.phone_used,
                "message_text": r.message_text,
                "selector_used": r.selector_used,
                "sent_at": r.sent_at,
                "sent_by": r.sent_by,
                "batch_id": r.batch_id,
                "client_name": r.client.name if r.client else None,
            }
            for r in rows
        ]



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
                "date": to_local_date_str(v.created_at, await get_business_tz(db)) if v.created_at else None,
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

    # ─── Programación de Pedidos (5ª pestaña) ────────────────────────────────
    #
    # IMPORTANTE (D-4): solo se crean filas para los clientes que RESPONDIERON.
    # Los clientes que no respondieron NO se integran a la tabla de pedidos.

    async def get_order_request_config(self, db: AsyncSession) -> dict:
        """Lee la configuración de la pestaña desde grandeza_settings."""
        rows = await db.execute(
            select(GrandezaSettings).where(
                GrandezaSettings.key.in_(list(ORDER_CONFIG_KEYS.values()))
            )
        )
        mapa = {r.key: r.value for r in rows.scalars().all()}

        def _bool(key: str, default: bool = False) -> bool:
            raw = mapa.get(ORDER_CONFIG_KEYS[key])
            if raw is None:
                return default
            return str(raw).strip().lower() in ("1", "true", "yes", "on")

        return {
            "enabled": _bool("enabled", False),
            "deadline_day": mapa.get(ORDER_CONFIG_KEYS["deadline_day"]) or None,
            "deadline_time": mapa.get(ORDER_CONFIG_KEYS["deadline_time"]) or None,
            "delivery_day": mapa.get(ORDER_CONFIG_KEYS["delivery_day"]) or None,
            "selector": mapa.get(ORDER_CONFIG_KEYS["selector"]) or "TODOS",
        }

    async def save_order_request_config(self, db: AsyncSession, data) -> dict:
        """Persiste la configuración de la pestaña (UPSERT por clave)."""
        valores = {
            "enabled": "true" if getattr(data, "enabled", False) else "false",
            "deadline_day": getattr(data, "deadline_day", None) or "",
            "deadline_time": getattr(data, "deadline_time", None) or "",
            "delivery_day": getattr(data, "delivery_day", None) or "",
            "selector": getattr(data, "selector", None) or "TODOS",
        }
        for campo, valor in valores.items():
            await self.upsert_setting(
                db, ORDER_CONFIG_KEYS[campo], valor,
                description=f"Programación de Pedidos: {campo}",
            )
        await db.commit()
        return await self.get_order_request_config(db)

    async def _resolver_nombres_producto(self, db: AsyncSession, product_ids: list) -> dict:
        """Devuelve {product_id: nombre} consultando el catálogo."""
        if not product_ids:
            return {}
        res = await db.execute(select(Product).where(Product.id.in_(product_ids)))
        return {p.id: p.name for p in res.scalars().all()}

    async def get_order_matrix(self, db: AsyncSession, delivery_date: date) -> dict:
        """
        Construye la matriz clientes × productos + fila de totales (D-14).

        Solo incluye clientes que tienen un pedido registrado para esa fecha
        (D-4: los que no respondieron no aparecen).
        """
        cfg = await self.get_order_request_config(db)

        # 1. Pedidos de esa fecha, con cliente e ítems precargados (§7.6).
        res = await db.execute(
            select(GrandezaOrderRequest)
            .options(
                selectinload(GrandezaOrderRequest.client),
                selectinload(GrandezaOrderRequest.items),
            )
            .where(GrandezaOrderRequest.delivery_date == delivery_date)
            .order_by(GrandezaOrderRequest.id)
        )
        pedidos = res.scalars().all()

        # 2. Productos habilitados en Grandeza (columnas de la tabla).
        prods_res = await db.execute(
            select(GrandezaProductConfig)
            .where(GrandezaProductConfig.is_enabled == True)
            .order_by(GrandezaProductConfig.product_id)
        )
        configs = prods_res.scalars().all()
        product_ids = [c.product_id for c in configs]
        nombres = await self._resolver_nombres_producto(db, product_ids)

        products = [
            {"product_id": pid, "product_name": nombres.get(pid, f"Producto #{pid}")}
            for pid in product_ids
        ]

        # 3. Filas (una por cliente que respondió).
        rows = []
        totales = {pid: 0.0 for pid in product_ids}
        total_units = 0.0

        for pedido in pedidos:
            cliente = pedido.client
            cantidades = {str(pid): 0.0 for pid in product_ids}
            for item in pedido.items:
                clave = str(item.product_id)
                if clave in cantidades:
                    cantidades[clave] += float(item.quantity or 0)
                else:
                    cantidades[clave] = float(item.quantity or 0)
                if item.product_id in totales:
                    totales[item.product_id] += float(item.quantity or 0)
                total_units += float(item.quantity or 0)

            rows.append({
                "client_id": pedido.client_id,
                "client_name": cliente.name if cliente else f"Cliente #{pedido.client_id}",
                "phone": _normalizar_telefono(cliente.phone) if cliente else None,
                "request_id": pedido.id,
                "status": pedido.status,
                "source": pedido.source,
                "confidence": pedido.confidence,
                "quantities": cantidades,
            })

        totals = [
            {
                "product_id": pid,
                "product_name": nombres.get(pid, f"Producto #{pid}"),
                "total": totales.get(pid, 0.0),
            }
            for pid in product_ids
        ]

        return {
            "delivery_date": delivery_date,
            "deadline_day": cfg.get("deadline_day"),
            "deadline_time": cfg.get("deadline_time"),
            "delivery_day": cfg.get("delivery_day"),
            "selector": cfg.get("selector", "TODOS"),
            "products": products,
            "rows": rows,
            "totals": totals,
            "total_clients": len(rows),
            "total_units": total_units,
        }

    async def upsert_order_request(self, db: AsyncSession, data) -> GrandezaOrderRequest:
        """
        Crea o reemplaza el pedido de un cliente para una fecha de entrega.

        UPSERT por (client_id, delivery_date): si ya existe, se borran sus
        ítems y se reemplazan por los nuevos (idempotente para reintentos).
        """
        res = await db.execute(
            select(GrandezaOrderRequest)
            .options(selectinload(GrandezaOrderRequest.items))
            .where(
                GrandezaOrderRequest.client_id == data.client_id,
                GrandezaOrderRequest.delivery_date == data.delivery_date,
            )
        )
        pedido = res.scalar_one_or_none()

        if pedido is None:
            pedido = GrandezaOrderRequest(
                client_id=data.client_id,
                delivery_date=data.delivery_date,
            )
            db.add(pedido)

        pedido.order_deadline = getattr(data, "order_deadline", None)
        pedido.selector_used = getattr(data, "selector_used", None) or "TODOS"
        pedido.source = getattr(data, "source", None) or "MANUAL"
        pedido.confidence = getattr(data, "confidence", None)
        pedido.raw_ocr_text = getattr(data, "raw_ocr_text", None)
        pedido.screenshot_path = getattr(data, "screenshot_path", None)
        pedido.status = getattr(data, "status", None) or "CONFIRMADO"
        pedido.confirmed_by = getattr(data, "confirmed_by", None)
        pedido.confirmed_at = utcnow()

        await db.flush()

        # Reemplazar ítems (idempotencia).
        await db.execute(
            delete(GrandezaOrderRequestItem).where(
                GrandezaOrderRequestItem.request_id == pedido.id
            )
        )
        for item in (getattr(data, "items", None) or []):
            db.add(GrandezaOrderRequestItem(
                request_id=pedido.id,
                product_id=item.product_id,
                quantity=item.quantity or 0,
                match_confidence=getattr(item, "match_confidence", None),
                needs_review=getattr(item, "needs_review", False),
            ))

        await db.commit()

        res = await db.execute(
            select(GrandezaOrderRequest)
            .options(
                selectinload(GrandezaOrderRequest.client),
                selectinload(GrandezaOrderRequest.items),
            )
            .where(GrandezaOrderRequest.id == pedido.id)
        )
        return res.scalar_one()

    async def delete_order_request(self, db: AsyncSession, request_id: int) -> bool:
        """Elimina un pedido y sus ítems (cascade)."""
        res = await db.execute(
            select(GrandezaOrderRequest).where(GrandezaOrderRequest.id == request_id)
        )
        pedido = res.scalar_one_or_none()
        if pedido is None:
            return False
        await db.delete(pedido)
        await db.commit()
        return True

    async def get_order_requests(self, db: AsyncSession, delivery_date: date) -> list:
        """Lista los pedidos de una fecha con cliente e ítems precargados."""
        res = await db.execute(
            select(GrandezaOrderRequest)
            .options(
                selectinload(GrandezaOrderRequest.client),
                selectinload(GrandezaOrderRequest.items),
            )
            .where(GrandezaOrderRequest.delivery_date == delivery_date)
            .order_by(GrandezaOrderRequest.id)
        )
        pedidos = res.scalars().all()

        product_ids = [i.product_id for p in pedidos for i in p.items]
        nombres = await self._resolver_nombres_producto(db, list(set(product_ids)))

        salida = []
        for p in pedidos:
            salida.append({
                "id": p.id,
                "client_id": p.client_id,
                "client_name": p.client.name if p.client else f"Cliente #{p.client_id}",
                "delivery_date": p.delivery_date,
                "order_deadline": p.order_deadline,
                "selector_used": p.selector_used,
                "source": p.source,
                "confidence": p.confidence,
                "raw_ocr_text": p.raw_ocr_text,
                "screenshot_path": p.screenshot_path,
                "status": p.status,
                "created_at": p.created_at,
                "confirmed_at": p.confirmed_at,
                "confirmed_by": p.confirmed_by,
                "items": [
                    {
                        "id": i.id,
                        "product_id": i.product_id,
                        "product_name": nombres.get(i.product_id, f"Producto #{i.product_id}"),
                        "quantity": float(i.quantity or 0),
                        "match_confidence": i.match_confidence,
                        "needs_review": i.needs_review,
                    }
                    for i in p.items
                ],
            })
        return salida

    async def dispatch_order_requests_to_production(
        self, db: AsyncSession, delivery_date: date, dispatched_by: Optional[str] = None,
        notes: Optional[str] = None,
    ) -> dict:
        """
        Materializa la matriz confirmada como órdenes de producción (Fase C).

        Crea/actualiza una `GrandezaOrder` por cliente CON sus ítems reales
        (product_id, product_name, qty) para que `PedidosProduccionUI.jsx` los
        vea completos. Marca los pedidos como ENVIADO. Es idempotente:
        re-despachar actualiza la orden existente sin duplicarla.
        """
        from .models import GrandezaOrder

        matriz = await self.get_order_matrix(db, delivery_date)
        nombres = {p["product_id"]: p["product_name"] for p in matriz["products"]}
        creadas = 0
        actualizadas = 0
        detalle = []

        for fila in matriz["rows"]:
            cantidades = {
                int(pid): float(qty)
                for pid, qty in (fila.get("quantities") or {}).items()
                if float(qty) > 0
            }
            if not cantidades:
                continue

            # Ítems en el formato que consume Producción:
            # [{product_id, product_name, qty, unit_price}]
            items = [
                {
                    "product_id": pid,
                    "product_name": nombres.get(pid, f"Producto #{pid}"),
                    "qty": qty,
                    "unit_price": 0.0,
                }
                for pid, qty in cantidades.items()
            ]

            res = await db.execute(
                select(GrandezaOrder).where(
                    GrandezaOrder.client_id == fila["client_id"],
                    GrandezaOrder.delivery_date == delivery_date,
                )
            )
            orden = res.scalar_one_or_none()
            if orden is None:
                orden = GrandezaOrder(
                    client_id=fila["client_id"],
                    client_name=fila["client_name"],
                    client_phone=fila.get("phone"),
                    items=items,
                    delivery_date=delivery_date,
                    status="PENDIENTE",
                )
                db.add(orden)
                creadas += 1
            else:
                # Re-despacho: se refrescan ítems y snapshot del cliente.
                orden.client_name = fila["client_name"]
                orden.client_phone = fila.get("phone")
                orden.items = items
                actualizadas += 1

            orden.notes = notes or orden.notes
            detalle.append({
                "client_id": fila["client_id"],
                "client_name": fila["client_name"],
                "products": cantidades,
            })

        # Marcar los pedidos como ENVIADO.
        res = await db.execute(
            select(GrandezaOrderRequest).where(
                GrandezaOrderRequest.delivery_date == delivery_date
            )
        )
        for pedido in res.scalars().all():
            pedido.status = "ENVIADO"

        await db.commit()

        return {
            "delivery_date": delivery_date,
            "orders_created": creadas,
            "orders_updated": actualizadas,
            "total_units": matriz["total_units"],
            "detail": detalle,
        }

    # ─── Fase B (Ruta A): match OCR → catálogo real ───────────────────────────
    #
    # El LLM PROPONE nombres; el ERP los resuelve contra su catálogo real.
    # El LLM NUNCA decide un client_id ni un product_id (spec §5.2).

    @staticmethod
    def _normalizar_texto(valor: Optional[str]) -> str:
        """Minúsculas, sin acentos ni signos, para comparar nombres."""
        if not valor:
            return ""
        import unicodedata

        base = unicodedata.normalize("NFKD", str(valor))
        base = "".join(ch for ch in base if not unicodedata.combining(ch))
        base = base.lower()
        limpio = "".join(ch if ch.isalnum() or ch.isspace() else " " for ch in base)
        return " ".join(limpio.split())

    async def resolver_cliente_ocr(
        self, db: AsyncSession, telefono: Optional[str] = None,
        nombre: Optional[str] = None,
    ) -> dict:
        """
        Cascada de resolución de cliente (D-6): teléfono → nombre exacto →
        fuzzy → manual.

        Devuelve {client_id, client_name, match}. Si nada coincide,
        client_id=None y match="manual" (el operador elige en la UI).
        """
        res = await db.execute(select(GrandezaClient))
        clientes = res.scalars().all()

        # 1. Teléfono (la señal más fuerte: viene del encabezado del chat).
        tel_norm = _normalizar_telefono(telefono)
        if tel_norm:
            for c in clientes:
                if _normalizar_telefono(c.phone) == tel_norm:
                    return {"client_id": c.id, "client_name": c.name, "match": "telefono"}

        # 2. Nombre exacto (normalizado).
        nombre_norm = self._normalizar_texto(nombre)
        if nombre_norm:
            for c in clientes:
                if self._normalizar_texto(c.name) == nombre_norm:
                    return {"client_id": c.id, "client_name": c.name, "match": "nombre"}

            # 3. Fuzzy: contención en cualquiera de los dos sentidos.
            for c in clientes:
                c_norm = self._normalizar_texto(c.name)
                if not c_norm:
                    continue
                if nombre_norm in c_norm or c_norm in nombre_norm:
                    return {"client_id": c.id, "client_name": c.name, "match": "fuzzy"}

        return {"client_id": None, "client_name": nombre or None, "match": "manual"}

    async def resolver_productos_ocr(
        self, db: AsyncSession, nombres: list,
    ) -> list:
        """
        Resuelve nombres propuestos por el LLM contra el catálogo real.

        El OCR lee un pedido de WhatsApp: el cliente puede pedir CUALQUIER
        producto del catálogo, no solo los habilitados para Grandeza. Por eso
        el match se hace contra TODO el catálogo de productos, pero se
        PRIORIZAN los productos habilitados para Grandeza (is_enabled=True):
        si un nombre matchea un producto Grandeza, ese gana.

        Devuelve [{producto, producto_id, cantidad, confianza, requiere_revision}].
        Si un nombre no matchea, producto_id=None y requiere_revision=True:
        la UI obliga al operador a elegirlo (nunca se descarta en silencio).
        """
        # 1. Productos habilitados para Grandeza (prioridad alta).
        prods_res = await db.execute(
            select(GrandezaProductConfig).where(GrandezaProductConfig.is_enabled == True)
        )
        configs = prods_res.scalars().all()
        ids_grandeza = {c.product_id for c in configs}

        # 2. Catálogo COMPLETO de productos (el cliente puede pedir cualquiera).
        todos_res = await db.execute(select(Product.id, Product.name))
        catalogo = [(pid, nombre) for pid, nombre in todos_res.all() if nombre]

        # 3. Índice ordenado: primero los Grandeza, luego el resto.
        indice = sorted(
            (
                (pid, self._normalizar_texto(nombre), pid in ids_grandeza)
                for pid, nombre in catalogo
            ),
            key=lambda t: (not t[2],),  # Grandeza primero
        )

        resueltos = []
        for entrada in nombres or []:
            propuesto = (entrada.get("producto") or "").strip()
            cantidad = float(entrada.get("cantidad") or 0)
            confianza = float(entrada.get("confianza") or 0.0)
            objetivo = self._normalizar_texto(propuesto)

            pid_match = None
            if objetivo:
                # 1. Exacto.
                for pid, nombre_norm, _es_grandeza in indice:
                    if nombre_norm == objetivo:
                        pid_match = pid
                        break
                # 2. Contención (fuzzy): el nombre del catálogo contiene lo
                #    propuesto o viceversa. Se exige un mínimo de 4 caracteres
                #    para evitar falsos positivos con palabras cortas.
                if pid_match is None and len(objetivo) >= 4:
                    for pid, nombre_norm, _es_grandeza in indice:
                        if nombre_norm and (
                            objetivo in nombre_norm or nombre_norm in objetivo
                        ):
                            pid_match = pid
                            break

            resueltos.append({
                "producto": propuesto,
                "producto_id": pid_match,
                "cantidad": cantidad,
                "confianza": confianza,
                "requiere_revision": pid_match is None,
            })

        return resueltos


grandeza_service = GrandezaService()
