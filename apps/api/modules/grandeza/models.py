"""
MÓDULO: grandeza/models.py
MISIÓN: Modelos de base de datos para el sistema de Reparto Pan Grandeza.
8 tablas que gestionan el ciclo completo: clientes, rutas, jornadas, visitas, inventario y GPS.
"""
from sqlalchemy import Column, Integer, String, Float, Boolean, ForeignKey, DateTime, Date, Text, JSON, Numeric
from sqlalchemy.orm import relationship
from datetime import datetime
from core.database import Base
from core.timestamps import utcnow


class GrandezaProductConfig(Base):
    """
    Configuración de productos vinculados al módulo Grandeza.
    Relación 1:1 opcional con Product — no modifica la tabla products.
    """
    __tablename__ = "grandeza_product_config"

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), unique=True, nullable=False)
    is_enabled = Column(Boolean, default=True)
    # DT-02 (Dinero): nunca Float. Numeric(12,2) = 10 enteros + 2 decimales.
    b2b_price = Column(Numeric(12, 2), nullable=False, default=0)  # Precio B2B Grandeza (distinto al precio tienda)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    product = relationship("Product", backref="grandeza_config", uselist=False)


class GrandezaClient(Base):
    """
    Clientes de la ruta de reparto Grandeza.
    Cada cliente tiene su información de contacto y puede tener múltiples slots de ruta.
    """
    __tablename__ = "grandeza_clients"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)  # Nombre del cliente
    business_name = Column(String, nullable=True)  # Nombre del negocio
    phone = Column(String, nullable=True)
    address = Column(Text, nullable=True)
    google_maps_url = Column(String, nullable=True)  # Link para navegación
    facade_photo_url = Column(String, nullable=True)  # Ruta al archivo en disco local
    notes = Column(Text, nullable=True)
    active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    # Relaciones
    route_slots = relationship("GrandezaRouteSlot", back_populates="client", cascade="all, delete-orphan")
    visits = relationship("GrandezaVisit", back_populates="client")


class GrandezaRouteSlot(Base):
    """
    Slots de ruta: Define en qué día y en qué orden se visita cada cliente.
    Un cliente puede tener múltiples slots (ej: Lunes posición 3 + Jueves posición 7).
    """
    __tablename__ = "grandeza_route_slots"

    id = Column(Integer, primary_key=True, index=True)
    client_id = Column(Integer, ForeignKey("grandeza_clients.id"), nullable=False)
    day_of_week = Column(String, nullable=False)  # LUNES, MARTES, MIERCOLES, JUEVES, VIERNES
    visit_order = Column(Integer, nullable=False)  # Posición en la secuencia del día

    client = relationship("GrandezaClient", back_populates="route_slots")


class GrandezaExtraordinaryRouteSlot(Base):
    """
    Slot de ruta extraordinaria: define clientes y orden de visita
    para una FECHA ESPECÍFICA que reemplaza la ruta regular del día.
    Cuando el repartidor consulta la ruta del día, el sistema prioriza
    esta tabla sobre grandeza_route_slots. Solo aplica para la fecha exacta.
    """
    __tablename__ = "grandeza_extraordinary_route_slots"

    id = Column(Integer, primary_key=True, index=True)
    route_date = Column(Date, nullable=False, index=True)
    client_id = Column(Integer, ForeignKey("grandeza_clients.id"), nullable=False)
    visit_order = Column(Integer, nullable=False)
    label = Column(String, nullable=True)  # Etiqueta opcional: "Ruta Día de Muertos"
    created_at = Column(DateTime, default=utcnow)

    client = relationship("GrandezaClient")


class GrandezaJourney(Base):
    """
    Jornada de reparto: Un día completo de operación.
    Contiene el inventario, fondo de caja, y estado general del día.
    """
    __tablename__ = "grandeza_journeys"

    id = Column(Integer, primary_key=True, index=True)
    journey_date = Column(Date, nullable=False, unique=True, index=True)
    status = Column(String, default="PREPARANDO")  # PREPARANDO | EN_RUTA | CERRADA
    
    # Fondo de caja (variable, puede ser 0)
    cash_fund = Column(Numeric(12, 2), default=0)  # Lo que se le entrega al repartidor para dar cambio
    dispatched_at = Column(DateTime, nullable=True) # Hora en la que se despacha la ruta
    
    # Cierre — Sistema vs Recibido
    cash_expected = Column(Numeric(12, 2), nullable=True)  # Calculado por el sistema al cierre
    cash_received = Column(Numeric(12, 2), nullable=True)  # Lo que entrega el repartidor
    exchange_pieces_expected = Column(Integer, nullable=True)  # Piezas de cambio según sistema
    exchange_pieces_received = Column(Integer, nullable=True)  # Piezas de cambio recibidas
    fresh_leftover_expected = Column(Integer, nullable=True)  # Piezas frescas sobrantes según sistema
    fresh_leftover_received = Column(Integer, nullable=True)  # Piezas frescas sobrantes recibidas
    
    # Repartidor asignado
    driver_user_id = Column(Integer, ForeignKey("employees.id"), nullable=True)
    
    # Notas de retroalimentación del gerente
    feedback_notes = Column(Text, nullable=True)
    
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    # Relaciones
    visits = relationship("GrandezaVisit", back_populates="journey", cascade="all, delete-orphan")
    inventory_records = relationship("GrandezaInventory", back_populates="journey", cascade="all, delete-orphan")
    driver_locations = relationship("GrandezaDriverLocation", back_populates="journey", cascade="all, delete-orphan")


class GrandezaInventory(Base):
    """
    Inventario de la jornada (inicial y final).
    Un registro por producto por tipo (INITIAL / FINAL).
    """
    __tablename__ = "grandeza_inventory"

    id = Column(Integer, primary_key=True, index=True)
    journey_id = Column(Integer, ForeignKey("grandeza_journeys.id"), nullable=False)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    inventory_type = Column(String, nullable=False)  # INITIAL | FINAL
    
    fresh_qty = Column(Integer, default=0)  # Piezas frescas
    exchange_qty = Column(Integer, default=0)  # Piezas de cambio (solo en FINAL)
    received_qty = Column(Integer, default=0)  # Recibido de vuelta (solo en FINAL)
    
    journey = relationship("GrandezaJourney", back_populates="inventory_records")


class GrandezaVisit(Base):
    """
    Visita a un cliente durante una jornada.
    Registra venta, cambios, incidentes, y datos financieros.
    """
    __tablename__ = "grandeza_visits"

    id = Column(Integer, primary_key=True, index=True)
    journey_id = Column(Integer, ForeignKey("grandeza_journeys.id"), nullable=False)
    client_id = Column(Integer, ForeignKey("grandeza_clients.id"), nullable=True)  # NULL para extemporáneas
    visit_order = Column(Integer, nullable=False)  # Posición real en la que se visitó
    visit_type = Column(String, default="PROGRAMADA")  # PROGRAMADA | EXTEMPORANEA | PEDIDO
    status = Column(String, default="PENDIENTE")  # PENDIENTE | COMPLETADA | OMITIDA
    
    # Timestamp automático al abrir la tarjeta
    arrived_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    
    # Cálculos financieros
    total_exchange_amount = Column(Numeric(12, 2), default=0)  # Importe de las piezas de cambio recompradas
    total_fresh_amount = Column(Numeric(12, 2), default=0)  # Importe de las piezas frescas vendidas
    sale_amount = Column(Numeric(12, 2), default=0)  # Venta neta = fresh - exchange
    payment_received = Column(Numeric(12, 2), default=0)  # Dinero recibido del cliente
    change_given = Column(Numeric(12, 2), default=0)  # Cambio entregado al cliente
    
    # Incidentes y notas
    incident_notes = Column(Text, nullable=True)
    
    # Para ventas extemporáneas: nombre y teléfono del cliente no programado
    ext_client_name = Column(String, nullable=True)
    ext_client_phone = Column(String, nullable=True)  # Para envío de ticket digital vía WhatsApp
    
    # Vinculación con pedido de producción (opcional)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=True)
    
    created_at = Column(DateTime, default=utcnow)
    
    # Relaciones
    journey = relationship("GrandezaJourney", back_populates="visits")
    client = relationship("GrandezaClient", back_populates="visits")
    items = relationship("GrandezaVisitItem", back_populates="visit", cascade="all, delete-orphan")


class GrandezaVisitItem(Base):
    """
    Detalle de productos por visita.
    Registra cambios recogidos, sugerencia del sistema, y venta real.
    """
    __tablename__ = "grandeza_visit_items"

    id = Column(Integer, primary_key=True, index=True)
    visit_id = Column(Integer, ForeignKey("grandeza_visits.id"), nullable=False)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    
    exchange_qty = Column(Integer, default=0)  # Piezas de cambio recogidas
    suggested_fresh_qty = Column(Integer, default=0)  # Sugerido por el sistema (basado en historial)
    actual_fresh_qty = Column(Integer, default=0)  # Decidido con el cliente
    missing_qty = Column(Integer, default=0)  # "Nos faltó" — producto que pidió pero no traía
    
    # Precio usado en esta transacción (snapshot del b2b_price al momento)
    unit_price = Column(Numeric(12, 2), nullable=False, default=0)
    
    visit = relationship("GrandezaVisit", back_populates="items")


class GrandezaDriverLocation(Base):
    """
    GPS del repartidor: registros periódicos de ubicación.
    Frecuencia configurable desde Parámetros Generales (default: 60 segundos).
    """
    __tablename__ = "grandeza_driver_locations"

    id = Column(Integer, primary_key=True, index=True)
    journey_id = Column(Integer, ForeignKey("grandeza_journeys.id"), nullable=False)
    lat = Column(Float, nullable=False)
    lng = Column(Float, nullable=False)
    accuracy = Column(Float, nullable=True)  # Precisión en metros del GPS
    recorded_at = Column(DateTime, default=utcnow)
    
    journey = relationship("GrandezaJourney", back_populates="driver_locations")


class GrandezaSettings(Base):
    """
    Parámetros generales del módulo Reparto Pan Grandeza.
    Configurable desde la Suite de Parámetros Generales.
    """
    __tablename__ = "grandeza_settings"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String, unique=True, nullable=False, index=True)
    value = Column(String, nullable=True)
    description = Column(String, nullable=True)

class GrandezaExpense(Base):
    """
    Gastos operativos registrados por el repartidor durante la jornada.
    Ejemplos: gasolina, comida, casetas, viáticos.
    Vinculado a la jornada para el arqueo de caja.
    """
    __tablename__ = "grandeza_expenses"

    id = Column(Integer, primary_key=True, index=True)
    journey_id = Column(Integer, ForeignKey("grandeza_journeys.id"), nullable=False)
    description = Column(String, nullable=False)  # Texto libre: "Gasolina", "Caseta Palmillas"
    amount = Column(Numeric(12, 2), nullable=False, default=0)
    created_at = Column(DateTime, default=utcnow)

    journey = relationship("GrandezaJourney")
 

class GrandezaOrder(Base):
    """
    Pedido levantado desde la ruta de reparto Pan Grandeza.
    Independiente del sistema de pedidos POS (no requiere ticket_id).
    Aparece en la suite 'Pedidos en Producción' como PEDIDO REPARTO PAN GRANDEZA.
    """
    __tablename__ = "grandeza_orders"


    id = Column(Integer, primary_key=True, index=True)
    client_id = Column(Integer, ForeignKey("grandeza_clients.id"), nullable=True)
    client_name = Column(String, nullable=True)  # Snapshot o nombre manual
    client_phone = Column(String, nullable=True)  # Para envío de ticket digital vía WhatsApp
    
    # Productos del pedido (JSON: [{product_id, product_name, qty, unit_price}])
    items = Column(JSON, nullable=False, default=[])
    
    # Financieros
    total_amount = Column(Numeric(12, 2), default=0)
    payment_method = Column(String, default="EFECTIVO")  # EFECTIVO | TRANSFERENCIA
    payment_status = Column(String, default="PAGADO")    # PAGADO (obligatorio para procesar)
    
    # Programación de entrega
    delivery_date = Column(Date, nullable=False)  # Día en que se entregará
    delivery_time = Column(String, nullable=True) # Hora en que se entregará
    
    advance_payment = Column(Numeric(12, 2), default=0)  # Anticipo recibido por el repartidor
    
    # Estado de producción
    status = Column(String, default="PAGADO")
    # PAGADO → EN_PRODUCCION → LISTO → EN_RUTA → ENTREGADO | CANCELADO
    
    # Vinculación con jornada de entrega (se llena cuando se incluye en la ruta)
    delivery_journey_id = Column(Integer, ForeignKey("grandeza_journeys.id"), nullable=True)
    
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)
