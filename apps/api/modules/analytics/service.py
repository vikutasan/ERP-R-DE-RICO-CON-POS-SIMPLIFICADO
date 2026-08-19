from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, func, desc, asc, extract, and_
from datetime import date, datetime as dt_cls, timedelta
from decimal import Decimal
from typing import List, Optional

from modules.analytics.models import DailyContext
from modules.analytics.schemas import DailyContextCreate, CustomQueryPayload
from modules.pos.models import Ticket, TicketItem
from modules.catalog.models import Product, Category

async def get_or_create_daily_context(db: AsyncSession, target_date: date) -> DailyContext:
    result = await db.execute(select(DailyContext).where(DailyContext.target_date == target_date))
    context = result.scalar_one_or_none()
    if not context:
        context = DailyContext(target_date=target_date)
        db.add(context)
        await db.commit()
        await db.refresh(context)
    return context

async def update_daily_context(db: AsyncSession, target_date: date, data: DailyContextCreate) -> DailyContext:
    context = await get_or_create_daily_context(db, target_date)
    context.is_atypical = data.is_atypical
    context.weather_condition = data.weather_condition
    context.holiday_name = data.holiday_name
    context.notes = data.notes
    context.temperature_c = data.temperature_c
    await db.commit()
    await db.refresh(context)
    return context

async def get_product_rankings(db: AsyncSession, start_date: date, end_date: date):
    """
    Lista todos los productos vendidos en el periodo, ordenados por métricas 
    para poder sacar Top/Bottom Volumen y Top/Bottom Margen.
    """
    # En PostgreSQL y SQLite podemos usar func.sum()
    query = (
        select(
            Product.id.label("product_id"),
            Product.name.label("product_name"),
            Category.name.label("category_name"),
            Product.price,
            Product.cost,
            func.sum(TicketItem.quantity).label("total_quantity"),
            func.sum(TicketItem.subtotal).label("total_revenue")
        )
        .join(TicketItem, TicketItem.product_id == Product.id)
        .join(Ticket, Ticket.id == TicketItem.ticket_id)
        .outerjoin(Category, Product.category_id == Category.id)
        .where(
            Ticket.status == "PAID",
            Ticket.created_at >= dt_cls.combine(start_date, dt_cls.min.time()),
            Ticket.created_at < dt_cls.combine(end_date + timedelta(days=1), dt_cls.min.time())
        )
        .group_by(Product.id, Product.name, Category.name, Product.price, Product.cost)
    )
    result = await db.execute(query)
    rows = result.all()

    rankings = []
    for row in rows:
        price = Decimal(str(row.price)) if row.price is not None else Decimal("0.0")
        cost = Decimal(str(row.cost)) if row.cost is not None else Decimal("0.0")
        margin_abs = price - cost
        margin_perc = (margin_abs / price * Decimal("100")) if price > 0 else Decimal("0.0")
        
        rankings.append({
            "product_id": row.product_id,
            "product_name": row.product_name,
            "category_name": row.category_name,
            "total_quantity": row.total_quantity or 0,
            "total_revenue": row.total_revenue or 0.0,
            "margin_absolute": margin_abs,
            "margin_percentage": margin_perc
        })

    return rankings

async def get_ticket_metrics(db: AsyncSession, start_date: date, end_date: date):
    """
    Retorna métricas generales de tickets para el periodo (total tickets, etc).
    """
    query = (
        select(func.count(func.distinct(Ticket.id)))
        .where(
            Ticket.status == "PAID",
            Ticket.created_at >= dt_cls.combine(start_date, dt_cls.min.time()),
            Ticket.created_at < dt_cls.combine(end_date + timedelta(days=1), dt_cls.min.time())
        )
    )
    result = await db.execute(query)
    total_tickets = result.scalar() or 0
    return {"total_tickets": total_tickets}

async def get_time_series_metrics(db: AsyncSession, start_date: date, end_date: date):
    """
    Retorna métricas agrupadas por día de la semana y por hora del día.
    """
    # Ventas por fecha exacta cronológica
    date_query = (
        select(
            func.date(Ticket.created_at).label("exact_date"),
            func.sum(TicketItem.subtotal).label("revenue"),
            func.sum(TicketItem.quantity).label("quantity")
        )
        .join(Ticket, Ticket.id == TicketItem.ticket_id)
        .where(
            Ticket.status == "PAID",
            func.date(Ticket.created_at) >= start_date,
            func.date(Ticket.created_at) <= end_date
        )
        .group_by(func.date(Ticket.created_at))
        .order_by(func.date(Ticket.created_at))
    )
    
    # Ventas por hora del día (0-23)
    hour_query = (
        select(
            func.extract('hour', Ticket.created_at).label("hour"),
            func.sum(Ticket.total).label("revenue")
        )
        .where(
            Ticket.status == "PAID",
            func.date(Ticket.created_at) >= start_date,
            func.date(Ticket.created_at) <= end_date
        )
        .group_by("hour")
    )
    
    date_result = await db.execute(date_query)
    hour_result = await db.execute(hour_query)
    
    by_date = [{
        "date": r.exact_date.isoformat() if hasattr(r.exact_date, 'isoformat') else str(r.exact_date),
        "revenue": float(r.revenue or 0),
        "quantity": int(r.quantity or 0)
    } for r in date_result.all()]
    
    by_hour = [{"hour": int(r.hour), "revenue": float(r.revenue or 0)} for r in hour_result.all()]
    
    return {
        "by_date": by_date,
        "by_hour": by_hour
    }

async def execute_custom_query(db: AsyncSession, payload: CustomQueryPayload):
    """
    Resuelve preguntas como: "¿Cuántos churros hemos vendido los viernes de este mes?"
    Si exclude_atypical=True, omite los días marcados en DailyContext.
    """
    conditions = [Ticket.status == "PAID"]

    if payload.start_date:
        conditions.append(func.date(Ticket.created_at) >= payload.start_date)
    if payload.end_date:
        conditions.append(func.date(Ticket.created_at) <= payload.end_date)
        
    if payload.product_ids and len(payload.product_ids) > 0:
        conditions.append(TicketItem.product_id.in_(payload.product_ids))
        
    query = (
        select(
            Product.id.label("product_id"),
            Product.name.label("product_name"),
            func.sum(TicketItem.quantity).label("total_quantity"),
            func.sum(TicketItem.subtotal).label("total_revenue"),
            func.count(func.distinct(Ticket.id)).label("tickets_count")
        )
        .join(TicketItem, TicketItem.product_id == Product.id)
        .join(Ticket, Ticket.id == TicketItem.ticket_id)
        .outerjoin(Category, Product.category_id == Category.id)
    )

    if payload.category_ids and len(payload.category_ids) > 0:
        conditions.append(Category.id.in_(payload.category_ids))

    query = query.where(and_(*conditions))
    query = query.group_by(Product.id, Product.name)

    result = await db.execute(query)
    rows = result.all()

    # Post-filtrado en Python (para compatibilidad con SQLite/Postgres en weekday)
    # y para excluir días atípicos si es necesario.
    # NOTA: En un sistema gigante con millones de filas, esto se debe hacer puramente en SQL.
    # Dado que los TicketItems que retorna son agregaciones, para filtrar por dia/atipico DEBE
    # hacerse a nivel ticket antes de agrupar. Lo reescribimos cargando tickets o haciendo joinedload.
    
    # RE-ENFOQUE: En lugar de agrupar en SQL que es difícil filtrar el dow y atípicos en dialecto mixto,
    # vamos a traer los items puros y sumar con un pase de Python, ideal para "Dataframes" rápidos.
    
    raw_query = (
        select(Ticket, TicketItem, Product)
        .join(TicketItem, TicketItem.ticket_id == Ticket.id)
        .join(Product, Product.id == TicketItem.product_id)
        .outerjoin(Category, Product.category_id == Category.id)
        .where(and_(*conditions))
    )
    
    raw_result = await db.execute(raw_query)
    records = raw_result.all()

    # Si necesitamos excluir atípicos, cargamos los contextos
    atypical_dates = set()
    if payload.exclude_atypical:
        ctx_query = select(DailyContext.target_date).where(DailyContext.is_atypical == True)
        ctx_res = await db.execute(ctx_query)
        atypical_dates = {row[0] for row in ctx_res.all()}

    summary = {}
    total_sales = 0
    total_tickets = set()

    for ticket, item, product in records:
        t_date = ticket.created_at.date()
        t_weekday = ticket.created_at.weekday() # 0-6 (Lunes a Domingo)

        if payload.weekdays and t_weekday not in payload.weekdays:
            continue
            
        if payload.exclude_atypical and t_date in atypical_dates:
            continue
            
        if product.id not in summary:
            summary[product.id] = {
                "product_name": product.name,
                "quantity": 0,
                "revenue": 0.0
            }
        
        summary[product.id]["quantity"] += item.quantity
        summary[product.id]["revenue"] += item.subtotal
        total_sales += item.subtotal
        total_tickets.add(ticket.id)

    return {
        "filtered_total_revenue": total_sales,
        "filtered_total_tickets": len(total_tickets),
        "products": [
            {
                "product_id": pid,
                "product_name": data["product_name"],
                "quantity": data["quantity"],
                "revenue": data["revenue"]
            }
            for pid, data in summary.items()
        ]
    }


async def get_product_daily_sales(
    db: AsyncSession,
    start_date: date,
    end_date: date,
    weekday: Optional[int] = None,
    last_n: Optional[int] = None,
    include_prev_year: bool = False
):
    """
    Retorna las ventas diarias por producto para la tabla de Estadística de Productos.
    Agrupa por (product_id, fecha) y devuelve cantidad vendida por día.
    
    weekday: 0=Lunes ... 6=Domingo (filtro opcional por día de semana)
    last_n: limitar a las últimas N ocurrencias de fechas
    include_prev_year: incluir datos del mismo rango del año anterior
    """
    async def _fetch_daily_data(db_session, date_start, date_end, filter_weekday=None):
        conditions = [
            Ticket.status == "PAID",
            func.date(Ticket.created_at) >= date_start,
            func.date(Ticket.created_at) <= date_end
        ]
        # Filtrar por día de la semana directamente en SQL
        # PostgreSQL DOW: 0=Domingo, 1=Lunes ... 6=Sábado
        # Python weekday: 0=Lunes ... 6=Domingo
        # Conversión: pg_dow = (python_weekday + 1) % 7
        if filter_weekday is not None:
            pg_dow = (filter_weekday + 1) % 7
            conditions.append(extract('dow', Ticket.created_at) == pg_dow)

        query = (
            select(
                Product.id.label("product_id"),
                Product.name.label("product_name"),
                Category.name.label("category_name"),
                func.date(Ticket.created_at).label("sale_date"),
                func.sum(TicketItem.quantity).label("total_quantity")
            )
            .join(TicketItem, TicketItem.product_id == Product.id)
            .join(Ticket, Ticket.id == TicketItem.ticket_id)
            .outerjoin(Category, Product.category_id == Category.id)
            .where(*conditions)
            .group_by(
                Product.id, Product.name,
                Category.name, func.date(Ticket.created_at)
            )
            .order_by(Product.name, func.date(Ticket.created_at))
        )
        result = await db_session.execute(query)
        return result.all()

    rows = await _fetch_daily_data(db, start_date, end_date, weekday)

    # Recopilar todas las fechas únicas y productos
    all_dates_set = set()
    products_map = {}

    for row in rows:
        sale_date = row.sale_date
        if hasattr(sale_date, 'isoformat'):
            date_str = sale_date.isoformat()
            date_obj = sale_date
        else:
            date_str = str(sale_date)
            date_obj = dt_cls.strptime(date_str, "%Y-%m-%d").date()

        # (Filtro de weekday ya aplicado en SQL por _fetch_daily_data)

        all_dates_set.add(date_str)

        pid = row.product_id
        if pid not in products_map:
            products_map[pid] = {
                "product_id": pid,
                "product_name": row.product_name,
                "category_name": row.category_name or "Sin Categoría",
                "daily_sales": {}
            }
        products_map[pid]["daily_sales"][date_str] = int(row.total_quantity or 0)

    # Ordenar fechas cronológicamente
    sorted_dates = sorted(all_dates_set)

    # Aplicar last_n: tomar solo las últimas N fechas
    if last_n is not None and last_n > 0 and len(sorted_dates) > last_n:
        sorted_dates = sorted_dates[-last_n:]
        # Filtrar daily_sales para solo incluir fechas visibles
        for prod in products_map.values():
            prod["daily_sales"] = {
                d: v for d, v in prod["daily_sales"].items() if d in sorted_dates
            }

    # Calcular promedio por producto (solo días que SÍ vendió)
    products_list = []
    for prod in products_map.values():
        sales_values = [
            prod["daily_sales"].get(d, 0) for d in sorted_dates
        ]
        non_zero_values = [v for v in sales_values if v > 0]
        avg_sales = (
            sum(non_zero_values) / len(non_zero_values)
            if non_zero_values else 0
        )
        prod["average"] = round(avg_sales, 1)
        products_list.append(prod)

    # Ordenar por promedio descendente (productos más vendidos primero)
    products_list.sort(key=lambda p: p["average"], reverse=True)

    # Año anterior (opcional)
    prev_year_data = None
    if include_prev_year:
        # Calcular rango del año anterior (safe para 29 de febrero)
        def _safe_prev_year(d):
            try:
                return d.replace(year=d.year - 1)
            except ValueError:
                # 29 de febrero en año no bisiesto → usar 28 de febrero
                return d.replace(year=d.year - 1, day=28)
        prev_start = _safe_prev_year(start_date)
        prev_end = _safe_prev_year(end_date)

        prev_rows = await _fetch_daily_data(db, prev_start, prev_end, weekday)
        prev_dates_set = set()
        prev_products_map = {}

        for row in prev_rows:
            sale_date = row.sale_date
            if hasattr(sale_date, 'isoformat'):
                date_str = sale_date.isoformat()
                date_obj = sale_date
            else:
                date_str = str(sale_date)
                date_obj = dt_cls.strptime(date_str, "%Y-%m-%d").date()

            # (Filtro de weekday ya aplicado en SQL por _fetch_daily_data)

            prev_dates_set.add(date_str)
            pid = row.product_id
            if pid not in prev_products_map:
                prev_products_map[pid] = {
                    "product_id": pid,
                    "product_name": row.product_name,
                    "daily_sales": {}
                }
            prev_products_map[pid]["daily_sales"][date_str] = int(
                row.total_quantity or 0
            )

        prev_sorted_dates = sorted(prev_dates_set)
        if last_n and len(prev_sorted_dates) > last_n:
            prev_sorted_dates = prev_sorted_dates[-last_n:]

        prev_year_data = {
            "dates": prev_sorted_dates,
            "products": prev_products_map
        }

    # Consultar días atípicos/festivos en el rango
    atypical_query = (
        select(
            DailyContext.target_date,
            DailyContext.is_atypical,
            DailyContext.holiday_name,
            DailyContext.notes
        )
        .where(
            DailyContext.target_date >= start_date,
            DailyContext.target_date <= end_date,
            DailyContext.is_atypical == True
        )
    )
    atypical_result = await db.execute(atypical_query)
    atypical_rows = atypical_result.all()
    atypical_dates = {}
    for row in atypical_rows:
        d_str = row.target_date.isoformat() if hasattr(row.target_date, 'isoformat') else str(row.target_date)
        atypical_dates[d_str] = {
            "holiday": row.holiday_name,
            "notes": row.notes
        }

    return {
        "dates": sorted_dates,
        "products": products_list,
        "prev_year": prev_year_data,
        "atypical_dates": atypical_dates
    }

