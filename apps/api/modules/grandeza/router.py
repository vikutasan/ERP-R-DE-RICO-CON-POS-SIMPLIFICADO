"""
MÓDULO: grandeza/router.py
Endpoints REST para el módulo Reparto Pan Grandeza.
Fase 0: CRUD base para productos, clientes, rutas, jornadas, GPS y settings.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
from datetime import date

from core.database import get_db
from . import schemas
from .service import grandeza_service

router = APIRouter()


# ─── Productos Grandeza ───────────────────────────────────────────────────────

@router.get("/products", response_model=List[schemas.GrandezaProductConfigResponse])
async def get_grandeza_products(db: AsyncSession = Depends(get_db)):
    """Lista productos habilitados para Reparto Pan Grandeza con precios B2B."""
    return await grandeza_service.get_grandeza_products(db)

@router.post("/products")
async def upsert_grandeza_product(data: schemas.GrandezaProductConfigCreate, db: AsyncSession = Depends(get_db)):
    """Habilitar/actualizar un producto para Grandeza con precio B2B."""
    config = await grandeza_service.upsert_grandeza_product(db, data.product_id, data.b2b_price, data.is_enabled)
    return {"message": "Producto configurado para Grandeza", "id": config.id}

@router.delete("/products/{product_id}")
async def disable_grandeza_product(product_id: int, db: AsyncSession = Depends(get_db)):
    """Deshabilitar un producto del módulo Grandeza."""
    config = await grandeza_service.disable_grandeza_product(db, product_id)
    if not config:
        raise HTTPException(status_code=404, detail="Producto no encontrado en Grandeza")
    return {"message": "Producto deshabilitado de Grandeza"}


# ─── Clientes ─────────────────────────────────────────────────────────────────

@router.get("/clients", response_model=List[schemas.GrandezaClientResponse])
async def get_clients(active_only: bool = True, db: AsyncSession = Depends(get_db)):
    return await grandeza_service.get_clients(db, active_only)

@router.get("/clients/{client_id}", response_model=schemas.GrandezaClientResponse)
async def get_client(client_id: int, db: AsyncSession = Depends(get_db)):
    client = await grandeza_service.get_client(db, client_id)
    if not client:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    return client

@router.post("/clients", response_model=schemas.GrandezaClientResponse)
async def create_client(data: schemas.GrandezaClientCreate, db: AsyncSession = Depends(get_db)):
    return await grandeza_service.create_client(db, data.model_dump())

@router.put("/clients/{client_id}", response_model=schemas.GrandezaClientResponse)
async def update_client(client_id: int, data: schemas.GrandezaClientUpdate, db: AsyncSession = Depends(get_db)):
    client = await grandeza_service.update_client(db, client_id, data.model_dump(exclude_unset=True))
    if not client:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    return client

@router.patch("/clients/{client_id}/deactivate")
async def deactivate_client(client_id: int, db: AsyncSession = Depends(get_db)):
    """Soft delete: desactiva el cliente y lo retira de todas las rutas."""
    client = await grandeza_service.deactivate_client(db, client_id)
    if not client:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    return {"message": f"Cliente '{client.name}' desactivado y retirado de rutas"}

@router.delete("/clients/{client_id}")
async def delete_client_permanently(client_id: int, db: AsyncSession = Depends(get_db)):
    """Hard delete: elimina el cliente y TODOS sus registros (visitas, items, rutas) permanentemente."""
    result = await grandeza_service.delete_client_permanently(db, client_id)
    if not result:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    return {"message": "Cliente eliminado permanentemente"}


# ─── Rutas por Día ────────────────────────────────────────────────────────────

# IMPORTANTE: Los endpoints con rutas literales (/effective, /extraordinary)
# van ANTES que /routes/{day_of_week} para evitar que FastAPI los capture
# como un parámetro de ruta (ej: day_of_week="effective").

@router.get("/routes/effective/{route_date}")
async def get_effective_route(route_date: date, db: AsyncSession = Depends(get_db)):
    """Ruta efectiva para una fecha: prioriza extraordinaria sobre regular."""
    return await grandeza_service.get_effective_route(db, route_date)

@router.get("/routes/extraordinary")
async def list_extraordinary_routes(db: AsyncSession = Depends(get_db)):
    """Lista todas las rutas extraordinarias (para el panel de administración)."""
    return await grandeza_service.list_extraordinary_routes(db)

@router.get("/routes/extraordinary/{route_date}")
async def get_extraordinary_route(route_date: date, db: AsyncSession = Depends(get_db)):
    """Obtener los slots de una ruta extraordinaria por fecha."""
    slots = await grandeza_service.get_extraordinary_route(db, route_date)
    return [
        {
            "slot_id": s.id,
            "client_id": s.client_id,
            "visit_order": s.visit_order,
            "label": s.label,
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
        for s in slots
    ]

@router.put("/routes/extraordinary/{route_date}")
async def set_extraordinary_route(
    route_date: date,
    data: schemas.GrandezaExtraordinaryRouteCreate,
    db: AsyncSession = Depends(get_db)
):
    """Crear o reemplazar la ruta extraordinaria de una fecha específica."""
    await grandeza_service.set_extraordinary_route(
        db, route_date, [s.model_dump() for s in data.slots], data.label
    )
    return {"message": f"Ruta extraordinaria del {route_date} guardada"}

@router.delete("/routes/extraordinary/{route_date}")
async def delete_extraordinary_route(route_date: date, db: AsyncSession = Depends(get_db)):
    """Eliminar una ruta extraordinaria."""
    deleted = await grandeza_service.delete_extraordinary_route(db, route_date)
    if not deleted:
        raise HTTPException(status_code=404, detail="No existe ruta extraordinaria para esa fecha")
    return {"message": f"Ruta extraordinaria del {route_date} eliminada"}


@router.get("/routes/{day_of_week}")
async def get_route(day_of_week: str, db: AsyncSession = Depends(get_db)):
    """Obtener la ruta regular de un día con clientes en orden de visita."""
    slots = await grandeza_service.get_route_by_day(db, day_of_week)
    return [
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
        for s in slots
    ]

@router.put("/routes/{day_of_week}")
async def set_route(day_of_week: str, slots: List[schemas.GrandezaRouteSlotCreate], db: AsyncSession = Depends(get_db)):
    """Reemplazar la ruta completa de un día (reordenar o cambiar clientes)."""
    await grandeza_service.set_route_slots(db, day_of_week, [s.model_dump() for s in slots])
    return {"message": f"Ruta del {day_of_week} actualizada"}


# ─── Jornadas ─────────────────────────────────────────────────────────────────

@router.get("/journeys/{journey_date}")
async def get_journey(journey_date: date, db: AsyncSession = Depends(get_db)):
    journey = await grandeza_service.get_journey_by_date(db, journey_date)
    if not journey:
        raise HTTPException(status_code=404, detail="No hay jornada para esa fecha")
    return journey

@router.post("/journeys")
async def create_journey(data: schemas.GrandezaJourneyCreate, db: AsyncSession = Depends(get_db)):
    """Crear/abrir una jornada de reparto para una fecha."""
    existing = await grandeza_service.get_journey_by_date(db, data.journey_date)
    if existing:
        raise HTTPException(status_code=409, detail="Ya existe una jornada para esa fecha")
    journey = await grandeza_service.create_journey(db, data.model_dump())
    return {"message": "Jornada creada", "id": journey.id}

@router.patch("/journeys/{journey_id}")
async def update_journey(journey_id: int, data: schemas.GrandezaJourneyUpdate, db: AsyncSession = Depends(get_db)):
    journey = await grandeza_service.update_journey(db, journey_id, data.model_dump(exclude_unset=True))
    if not journey:
        raise HTTPException(status_code=404, detail="Jornada no encontrada")
    return {"message": "Jornada actualizada"}


# ─── Inventario ───────────────────────────────────────────────────────────────

@router.get("/journeys/{journey_id}/inventory")
async def get_inventory(journey_id: int, inventory_type: str = None, db: AsyncSession = Depends(get_db)):
    return await grandeza_service.get_inventory(db, journey_id, inventory_type)

@router.put("/journeys/{journey_id}/inventory/{inventory_type}")
async def set_inventory(journey_id: int, inventory_type: str, items: List[schemas.GrandezaInventoryCreate], db: AsyncSession = Depends(get_db)):
    """Establecer inventario inicial o final de una jornada."""
    if inventory_type not in ("INITIAL", "FINAL"):
        raise HTTPException(status_code=400, detail="inventory_type debe ser INITIAL o FINAL")
    await grandeza_service.set_inventory(db, journey_id, inventory_type, [i.model_dump() for i in items])
    return {"message": f"Inventario {inventory_type} guardado"}


# ─── GPS ──────────────────────────────────────────────────────────────────────

@router.post("/journeys/{journey_id}/location")
async def record_location(journey_id: int, data: schemas.GrandezaDriverLocationCreate, db: AsyncSession = Depends(get_db)):
    """Registrar ubicación GPS del repartidor."""
    loc = await grandeza_service.record_location(db, journey_id, data.lat, data.lng, data.accuracy)
    return {"id": loc.id}

@router.get("/journeys/{journey_id}/locations", response_model=List[schemas.GrandezaDriverLocationResponse])
async def get_locations(journey_id: int, db: AsyncSession = Depends(get_db)):
    return await grandeza_service.get_locations(db, journey_id)


# ─── Settings ─────────────────────────────────────────────────────────────────

@router.get("/settings", response_model=List[schemas.GrandezaSettingResponse])
async def get_settings(db: AsyncSession = Depends(get_db)):
    return await grandeza_service.get_settings(db)

@router.put("/settings/{key}")
async def update_setting(key: str, data: schemas.GrandezaSettingUpdate, db: AsyncSession = Depends(get_db)):
    setting = await grandeza_service.upsert_setting(db, key, data.value)
    return {"message": f"Setting '{key}' actualizado", "value": setting.value}


# ─── Programación de Mensajes (WhatsApp asistido) ─────────────────────────────

@router.get("/message-schedule", response_model=schemas.GrandezaMessageSchedule)
async def get_message_schedule(db: AsyncSession = Depends(get_db)):
    """Lee la configuración de programación de mensajes (texto, selector, día, hora)."""
    return await grandeza_service.get_message_schedule(db)

@router.put("/message-schedule", response_model=schemas.GrandezaMessageSchedule)
async def save_message_schedule(data: schemas.GrandezaMessageSchedule, db: AsyncSession = Depends(get_db)):
    """Guarda la configuración de programación de mensajes."""
    return await grandeza_service.save_message_schedule(db, data)

@router.get("/message-recipients", response_model=schemas.GrandezaMessageRecipientsResponse)
async def get_message_recipients(selector: str = "TODOS", db: AsyncSession = Depends(get_db)):
    """
    Resuelve los destinatarios según el selector elegido.
    Selectores: TODOS, ACTIVOS, INACTIVOS, LUNES..DOMINGO, PROXIMA_EXTEMPORANEA.
    """
    return await grandeza_service.resolve_message_recipients(db, selector)

@router.post("/message-log", response_model=schemas.GrandezaMessageLogResponse)
async def log_message_sent(data: schemas.GrandezaMessageLogCreate, db: AsyncSession = Depends(get_db)):
    """Registra en la bitácora un mensaje efectivamente enviado por el humano."""
    entry = await grandeza_service.log_message_sent(db, data)
    return {
        "id": entry.id,
        "client_id": entry.client_id,
        "phone_used": entry.phone_used,
        "message_text": entry.message_text,
        "selector_used": entry.selector_used,
        "sent_at": entry.sent_at,
        "sent_by": entry.sent_by,
        "batch_id": entry.batch_id,
        "client_name": None,
    }

@router.get("/message-log", response_model=List[schemas.GrandezaMessageLogResponse])
async def get_message_log(limit: int = 100, db: AsyncSession = Depends(get_db)):
    """Devuelve la bitácora de mensajes enviados, más reciente primero."""
    return await grandeza_service.get_message_log(db, limit)


# ─── Visitas ──────────────────────────────────────────────────────────────────

@router.get("/journeys/{journey_id}/visits")
async def get_visits(journey_id: int, db: AsyncSession = Depends(get_db)):
    return await grandeza_service.get_visits(db, journey_id)

@router.post("/journeys/{journey_id}/visits")
async def create_visit(journey_id: int, data: schemas.GrandezaVisitCreate, db: AsyncSession = Depends(get_db)):
    visit = await grandeza_service.create_visit(db, journey_id, data.model_dump())
    return visit

@router.post("/visits/{visit_id}/items")
async def set_visit_items(visit_id: int, items: List[schemas.GrandezaVisitItemCreate], db: AsyncSession = Depends(get_db)):
    await grandeza_service.set_visit_items(db, visit_id, [i.model_dump() for i in items])
    return {"message": "Items guardados"}

@router.patch("/visits/{visit_id}")
async def update_visit(visit_id: int, data: schemas.GrandezaVisitUpdate, db: AsyncSession = Depends(get_db)):
    visit = await grandeza_service.update_visit(db, visit_id, data.model_dump(exclude_unset=True))
    if not visit:
        raise HTTPException(status_code=404, detail="Visita no encontrada")
    return {"message": "Visita actualizada"}


# ─── Sugerencias ──────────────────────────────────────────────────────────────

@router.get("/clients/{client_id}/suggestions")
async def get_suggestions(client_id: int, db: AsyncSession = Depends(get_db)):
    return await grandeza_service.get_client_suggestions(db, client_id)


@router.get("/clients/{client_id}/statistics")
async def get_client_statistics(client_id: int, db: AsyncSession = Depends(get_db)):
    """Historial completo de visitas y resumen por producto para el modal de estadísticas del administrador."""
    return await grandeza_service.get_client_statistics(db, client_id)


# ─── Gastos Operativos ───────────────────────────────────────────────────────

@router.get("/journeys/{journey_id}/expenses")
async def get_expenses(journey_id: int, db: AsyncSession = Depends(get_db)):
    """Lista los gastos operativos registrados en una jornada."""
    return await grandeza_service.get_expenses(db, journey_id)

@router.post("/journeys/{journey_id}/expenses")
async def create_expense(journey_id: int, data: schemas.GrandezaExpenseCreate, db: AsyncSession = Depends(get_db)):
    """Registra un gasto operativo (gasolina, comida, casetas, etc.)."""
    return await grandeza_service.create_expense(db, journey_id, data.model_dump())

@router.delete("/expenses/{expense_id}")
async def delete_expense(expense_id: int, db: AsyncSession = Depends(get_db)):
    """Elimina un gasto operativo registrado por error."""
    deleted = await grandeza_service.delete_expense(db, expense_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Gasto no encontrado")
    return {"message": "Gasto eliminado"}


# ─── Pedidos Grandeza ─────────────────────────────────────────────────────────


@router.get("/orders")
async def get_grandeza_orders(status: str = None, db: AsyncSession = Depends(get_db)):
    return await grandeza_service.get_grandeza_orders(db, status)

@router.post("/orders")
async def create_grandeza_order(data: schemas.GrandezaOrderCreate, db: AsyncSession = Depends(get_db)):
    order = await grandeza_service.create_grandeza_order(db, data.model_dump())
    return order

@router.patch("/orders/{order_id}")
async def update_grandeza_order(order_id: int, data: schemas.GrandezaOrderUpdate, db: AsyncSession = Depends(get_db)):
    order = await grandeza_service.update_grandeza_order(db, order_id, data.model_dump(exclude_unset=True))
    if not order:
        raise HTTPException(status_code=404, detail="Pedido no encontrado")
    return order


# ─── Estimación de Producción ───────────────────────────────────────────────
@router.get("/production-estimate/{target_date}")
async def get_production_estimate(target_date: date, last_n: int = 10, db: AsyncSession = Depends(get_db)):
    """Retorna estimación de piezas a producir basada en historial de ventas por cliente de la ruta."""
    return await grandeza_service.get_production_estimate(db, target_date, last_n)


# ─── Programación de Pedidos (5ª pestaña) ─────────────────────────────────────
#
# IMPORTANTE (D-4): solo se crean filas para los clientes que RESPONDIERON.
# Los clientes que no respondieron NO se integran a la tabla de pedidos.

@router.get("/order-requests/config", response_model=schemas.GrandezaOrderRequestConfig)
async def get_order_request_config(db: AsyncSession = Depends(get_db)):
    """Lee la configuración de la pestaña (día/hora límite, día entrega, selector)."""
    return await grandeza_service.get_order_request_config(db)


@router.put("/order-requests/config", response_model=schemas.GrandezaOrderRequestConfig)
async def save_order_request_config(
    data: schemas.GrandezaOrderRequestConfig,
    db: AsyncSession = Depends(get_db),
):
    """Persiste la configuración de la pestaña."""
    return await grandeza_service.save_order_request_config(db, data)


@router.get("/order-requests/matrix/{delivery_date}", response_model=schemas.GrandezaOrderMatrixResponse)
async def get_order_matrix(delivery_date: date, db: AsyncSession = Depends(get_db)):
    """Matriz clientes × productos + fila de totales para una fecha de entrega."""
    return await grandeza_service.get_order_matrix(db, delivery_date)


@router.get("/order-requests/{delivery_date}", response_model=List[schemas.GrandezaOrderRequestResponse])
async def get_order_requests(delivery_date: date, db: AsyncSession = Depends(get_db)):
    """Lista los pedidos capturados para una fecha de entrega."""
    return await grandeza_service.get_order_requests(db, delivery_date)


@router.post("/order-requests", response_model=schemas.GrandezaOrderRequestResponse)
async def upsert_order_request(
    data: schemas.GrandezaOrderRequestCreate,
    db: AsyncSession = Depends(get_db),
):
    """Crea o reemplaza el pedido de un cliente para una fecha (UPSERT)."""
    return await grandeza_service.upsert_order_request(db, data)


@router.delete("/order-requests/{request_id}")
async def delete_order_request(request_id: int, db: AsyncSession = Depends(get_db)):
    """Elimina un pedido y sus ítems."""
    ok = await grandeza_service.delete_order_request(db, request_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Pedido no encontrado")
    return {"ok": True, "deleted_id": request_id}


@router.post("/order-requests/dispatch", response_model=schemas.GrandezaOrderDispatchResponse)
async def dispatch_order_requests(
    data: schemas.GrandezaOrderDispatchRequest,
    db: AsyncSession = Depends(get_db),
):
    """Envía la matriz confirmada al módulo de Producción (Fase C)."""
    return await grandeza_service.dispatch_order_requests_to_production(
        db, data.delivery_date, data.dispatched_by, data.notes
    )
