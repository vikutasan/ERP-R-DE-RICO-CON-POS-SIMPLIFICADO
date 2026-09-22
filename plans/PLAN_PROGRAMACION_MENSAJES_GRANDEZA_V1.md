# PLAN DE CONSTRUCCIÓN — PROGRAMACIÓN DE MENSAJES A LOS CLIENTES
## Módulo Reparto Pan Grandeza · ERP R de Rico

**Versión:** V1
**Fecha:** 22/Septiembre/2026
**Estado:** APROBADO — listo para ejecución
**Alcance:** Cuarta pestaña en la suite `GrandezaParamsUI` + backend de programación y bitácora de envíos
**Restricción dura:** CERO cambios en el POS (`RetailVisionPOS.jsx`)

---

## 1. CONTEXTO DE NEGOCIO

El modelo de negocio cambió. Ahora se envía un **mensaje recordatorio vía WhatsApp a los clientes activos todos los martes**, para que levanten su pedido y poder entregárselos.

**Situación actual:** el mensaje está predefinido y se envía **manualmente, uno por uno**. Esto consume tiempo del administrador.

**Objetivo:** que el ERP prepare el trabajo (mensaje + lista de destinatarios + lote de envío) para que el administrador solo tenga que **tocar "Enviar"** en cada cliente, sin escribir ni buscar contactos.

### 1.1 Decisiones ya tomadas por el usuario

| # | Decisión | Valor |
|---|----------|-------|
| D-1 | **Modelo de programación** | **Modelo 2** — día de envío explícito + grupo de destinatarios explícito. Ejemplo: *"martes 9:00 AM → clientes del jueves"* |
| D-2 | **Mecanismo de envío** | **Panel asistido con `wa.me`** (deep link). NO hay integración con WhatsApp Business API. NO hay agente de IA. |
| D-3 | **Contenido del mensaje** | **El mismo mensaje para todos.** No hay personalización por cliente. |
| D-4 | **Lotes de envío** | **Grupos de 5** para ergonomía del administrador (no por límite de WhatsApp). |
| D-5 | **Funciones de IA** | **DESCARTADAS.** No hay redacción, personalización, priorización ni resumen automático. |
| D-6 | **Dispositivo de operación** | El módulo es **responsivo**; el administrador lo abre **desde su teléfono**, donde ya tiene WhatsApp instalado. |
| D-7 | **Ubicación de la UI** | **Cuarta pestaña** en `GrandezaParamsUI.jsx` (suite "Parámetros Generales" de la Herramienta Administrador Grandeza). |

### 1.2 Por qué NO un agente de IA que automatice WhatsApp

Se evaluó y se descartó. Razones técnicas registradas para que ninguna IA futura lo reintente:

1. **"Reenviar a 5 contactos" es una función manual de la app, no una API.** No existe endpoint público para invocarla.
2. **Automatizar la UI de WhatsApp viola sus Términos de Servicio** y expone el número a **baneo permanente**. El número es el canal de contacto con los clientes: perderlo es un daño operativo grave.
3. **Es más frágil, no menos.** Un cambio de layout en WhatsApp rompe la automatización sin aviso.
4. **No hay confirmación confiable.** La automatización no puede saber si el mensaje se envió realmente.
5. **La alternativa legítima (WhatsApp Business API / Meta Cloud API)** exige verificación de negocio, plantillas aprobadas y **costo por conversación**. No se justifica para un recordatorio semanal.

**Conclusión:** el camino correcto es **el humano asistido**. El ERP hace el 95% del trabajo (mensaje listo, destinatario resuelto, teléfono validado, lote ordenado, bitácora) y el humano da el toque final. Es gratis, es legítimo, es robusto y ya está probado en este módulo (§9 de la documentación: `sendWhatsApp()`).

---

## 2. ALCANCE

### 2.1 Dentro del alcance

- Cuarta pestaña **"📅 Programación de Mensajes"** en `GrandezaParamsUI.jsx`.
- Editor del mensaje (texto libre, persistido).
- Selector de destinatarios con **11 opciones**.
- Selector de **fecha y hora** de envío.
- **Checkbox de recurrencia semanal.**
- **Panel de envío asistido** con `wa.me`, en lotes de 5.
- **Bitácora de envíos** (tabla nueva `grandeza_message_log`).
- Endpoint de **resolución de destinatarios** (los 11 selectores).
- Endpoint de **previsualización del lote** (mensaje + teléfonos normalizados).

### 2.2 Fuera del alcance

- Integración con WhatsApp Business API / Meta Cloud API.
- Cualquier función de IA (redacción, personalización, priorización, resumen).
- Envío automático sin intervención humana.
- Mensajes distintos por cliente.
- Adjuntar imágenes o PDF al mensaje.
- Cambios en el POS (`RetailVisionPOS.jsx`) — **CERO**.
- Cambios en `GrandezaDriverUI.jsx` — **CERO**.

---

## 3. ARQUITECTURA

### 3.1 Principio rector

> **El ERP prepara. El humano envía. El ERP registra.**

El sistema **nunca** abre WhatsApp por su cuenta. Genera el enlace `wa.me` y el humano decide cuándo tocarlo. Esto respeta la regla de oro del módulo: *"Respetar la captura del usuario: nunca sobreescribir silenciosamente datos que el usuario ya capturó"* (§7.4 de la documentación).

### 3.2 Flujo completo

```
┌─────────────────────────────────────────────────────────────────────┐
│ 1. CONFIGURACIÓN (una vez, o cuando cambie)                         │
│    Administrador → pestaña "Programación de Mensajes"               │
│    ├─ Escribe/edita el mensaje                                      │
│    ├─ Elige destinatarios: "Clientes de JUEVES"                     │
│    ├─ Elige día de envío: MARTES 09:00                              │
│    └─ Marca ☑ Repetir cada semana                                   │
│    → PUT /grandeza/message-schedule  (persiste en grandeza_settings)│
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 2. PREPARACIÓN (el martes, desde el teléfono)                       │
│    Administrador abre la pestaña → ve el panel de envío             │
│    → GET /grandeza/message-recipients?selector=JUEVES               │
│    Backend resuelve: clientes con route_slot.day_of_week = JUEVES   │
│                      + phone válido + active = true                 │
│    → Devuelve [{client_id, name, phone_normalized, wa_url}]         │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 3. ENVÍO ASISTIDO (lotes de 5)                                      │
│    El panel muestra 5 clientes por página.                          │
│    Por cada uno: [📲 Enviar] → abre wa.me con el texto pre-cargado  │
│    El administrador toca "Enviar" en WhatsApp → vuelve al ERP       │
│    → POST /grandeza/message-log  (registra el envío)                │
│    El cliente se marca ✅ en la lista.                              │
│    Cuando los 5 están ✅ → botón "Siguiente lote →"                 │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 4. BITÁCORA                                                         │
│    Tabla grandeza_message_log: quién, cuándo, a quién, qué mensaje  │
│    Permite saber si ya se envió esta semana y a quién falta.        │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.3 Los 11 selectores de destinatarios

| # | ID técnico | Etiqueta UI | Resolución |
|---|-----------|-------------|------------|
| 1 | `TODOS` | Todos los clientes | `grandeza_clients` (sin filtro de `active`) |
| 2 | `ACTIVOS` | Solo activos | `active = true` |
| 3 | `INACTIVOS` | Solo inactivos | `active = false` |
| 4 | `LUNES` | Clientes de Lunes | `route_slot.day_of_week = 'LUNES'` |
| 5 | `MARTES` | Clientes de Martes | `route_slot.day_of_week = 'MARTES'` |
| 6 | `MIERCOLES` | Clientes de Miércoles | `route_slot.day_of_week = 'MIERCOLES'` |
| 7 | `JUEVES` | Clientes de Jueves | `route_slot.day_of_week = 'JUEVES'` |
| 8 | `VIERNES` | Clientes de Viernes | `route_slot.day_of_week = 'VIERNES'` |
| 9 | `SABADO` | Clientes de Sábado | `route_slot.day_of_week = 'SABADO'` |
| 10 | `DOMINGO` | Clientes de Domingo | `route_slot.day_of_week = 'DOMINGO'` |
| 11 | `PROXIMA_EXTRAORDINARIA` | Clientes de próxima ruta extraordinaria | `grandeza_extraordinary_route_slots` con `route_date >= hoy` (la más próxima) |

> ⚠️ **Nota de implementación:** los valores de `day_of_week` en la base de datos son **sin acento** (`MIERCOLES`, `SABADO`), tal como los define `DAYS` en `GrandezaParamsUI.jsx` línea 101. La etiqueta de UI sí lleva acento.

> ⚠️ **Regla de exclusión:** en todos los selectores se **excluyen clientes sin teléfono válido**. Un cliente sin `phone` no puede recibir el mensaje; se reporta en el conteo como `sin_telefono` para que el administrador lo sepa.

---

## 4. MODELO DE DATOS

### 4.1 Tabla nueva: `grandeza_message_log`

Registra cada envío individual. Es la memoria del sistema: permite saber si ya se envió esta semana y a quién falta.

| Columna | Tipo | Nulo | Descripción |
|---------|------|:----:|-------------|
| `id` | SERIAL PK | No | Identificador |
| `client_id` | INTEGER FK → `grandeza_clients.id` | No | Destinatario |
| `phone_used` | VARCHAR(20) | No | Teléfono normalizado usado en el enlace |
| `message_text` | TEXT | No | **Copia** del mensaje enviado (histórico inmutable) |
| `selector_used` | VARCHAR(30) | No | Selector que originó el envío (ej. `JUEVES`) |
| `sent_at` | TIMESTAMP | No | Momento del envío (UTC naive, vía `utcnow()`) |
| `sent_by` | VARCHAR(100) | Sí | Nombre del usuario que envió (si está disponible) |
| `batch_id` | VARCHAR(40) | Sí | Identificador del lote (agrupa los envíos de una sesión) |

**Índices:**
```sql
CREATE INDEX IF NOT EXISTS ix_grandeza_message_log_client_id
    ON grandeza_message_log(client_id);
CREATE INDEX IF NOT EXISTS ix_grandeza_message_log_sent_at
    ON grandeza_message_log(sent_at);
```

**Migración SQL (obligatoria — `create_all` NO altera tablas existentes, ver §7.7 de la documentación):**
```sql
CREATE TABLE IF NOT EXISTS grandeza_message_log (
    id SERIAL PRIMARY KEY,
    client_id INTEGER NOT NULL REFERENCES grandeza_clients(id),
    phone_used VARCHAR(20) NOT NULL,
    message_text TEXT NOT NULL,
    selector_used VARCHAR(30) NOT NULL,
    sent_at TIMESTAMP NOT NULL,
    sent_by VARCHAR(100),
    batch_id VARCHAR(40)
);
CREATE INDEX IF NOT EXISTS ix_grandeza_message_log_client_id
    ON grandeza_message_log(client_id);
CREATE INDEX IF NOT EXISTS ix_grandeza_message_log_sent_at
    ON grandeza_message_log(sent_at);
```

> **Decisión de diseño:** `message_text` se **copia** en cada registro en lugar de referenciar el mensaje actual. Si el administrador cambia el mensaje la próxima semana, la bitácora debe seguir mostrando **qué se envió realmente**. Es el principio de *ledger inmutable*.

### 4.2 Configuración en `grandeza_settings` (tabla existente)

No se crea tabla nueva para la configuración. Se reutiliza el patrón key-value existente (`GrandezaSettings`).

| Key | Valor de ejemplo | Descripción |
|-----|------------------|-------------|
| `msg_schedule_enabled` | `"true"` | Interruptor maestro de la programación |
| `msg_schedule_text` | `"Buen día 👋 Le recordamos..."` | El mensaje editable |
| `msg_schedule_selector` | `"JUEVES"` | Selector de destinatarios activo |
| `msg_schedule_send_day` | `"MARTES"` | Día de la semana de envío |
| `msg_schedule_send_time` | `"09:00"` | Hora de envío (hora local del negocio) |
| `msg_schedule_weekly` | `"true"` | Recurrencia semanal |

**Ventaja:** cero migración para la configuración. `get_settings()` y `upsert_setting()` ya existen y funcionan (`service.py` líneas 408-423).

> ⚠️ **Zona horaria:** `msg_schedule_send_time` se guarda como **hora local del negocio** (`America/Mexico_City`), porque es una **intención de negocio**, no un instante. La comparación con "ahora" se hace en el frontend usando `apps/shared/timezone.js`. Esto respeta DT-01 (*Store UTC, Display Local*) sin convertir una hora de reloj en un timestamp.

---

## 5. BACKEND

### 5.1 Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `apps/api/modules/grandeza/models.py` | + modelo `GrandezaMessageLog` |
| `apps/api/modules/grandeza/schemas.py` | + 5 schemas nuevos |
| `apps/api/modules/grandeza/service.py` | + 5 métodos nuevos + 2 helpers |
| `apps/api/modules/grandeza/router.py` | + 5 endpoints nuevos |

### 5.2 `models.py` — Modelo nuevo

```python
class GrandezaMessageLog(Base):
    """Bitácora inmutable de mensajes WhatsApp enviados a clientes.

    Cada fila es un envío individual. `message_text` se copia (no se
    referencia) para que el histórico refleje lo que realmente se envió,
    aunque el mensaje configurado cambie después.
    """
    __tablename__ = "grandeza_message_log"

    id = Column(Integer, primary_key=True, index=True)
    client_id = Column(Integer, ForeignKey("grandeza_clients.id"), nullable=False, index=True)
    phone_used = Column(String(20), nullable=False)
    message_text = Column(Text, nullable=False)
    selector_used = Column(String(30), nullable=False)
    sent_at = Column(DateTime, default=utcnow, nullable=False, index=True)
    sent_by = Column(String(100), nullable=True)
    batch_id = Column(String(40), nullable=True)

    client = relationship("GrandezaClient")
```

> **Nota:** `utcnow` ya está importado en `models.py` (se usa en `GrandezaClient.created_at`). No se usa `_now_mexico()` aquí porque `_now_mexico` vive en `service.py` y los timestamps de auditoría del ERP se almacenan en UTC naive (DT-01).

### 5.3 `schemas.py` — Schemas nuevos

```python
# ─── Programación de Mensajes (v7.5.0) ────────────────────────────────

class GrandezaMessageSchedule(BaseModel):
    """Configuración completa de la programación de mensajes."""
    enabled: bool = False
    text: str = ""
    selector: str = "ACTIVOS"
    send_day: str = "MARTES"
    send_time: str = "09:00"
    weekly: bool = True


class GrandezaMessageRecipient(BaseModel):
    """Un destinatario resuelto, listo para el enlace wa.me."""
    client_id: int
    name: str
    business_name: Optional[str] = None
    phone_normalized: Optional[str] = None
    wa_url: Optional[str] = None
    already_sent: bool = False


class GrandezaMessageRecipientsResponse(BaseModel):
    """Resultado de resolver un selector de destinatarios."""
    selector: str
    total: int
    con_telefono: int
    sin_telefono: int
    recipients: List[GrandezaMessageRecipient]


class GrandezaMessageLogCreate(BaseModel):
    """Registro de un envío individual."""
    client_id: int
    phone_used: str
    message_text: str
    selector_used: str
    sent_by: Optional[str] = None
    batch_id: Optional[str] = None


class GrandezaMessageLogResponse(BaseModel):
    id: int
    client_id: int
    phone_used: str
    message_text: str
    selector_used: str
    sent_at: datetime
    sent_by: Optional[str] = None
    batch_id: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)
```

> **Verificar:** `datetime` y `Optional` ya están importados en `schemas.py`. `ConfigDict` también (se usa en `GrandezaSettingResponse`).

### 5.4 `service.py` — Helpers y métodos nuevos

Se agregan al final de la clase `GrandezaService`, después de `upsert_setting`.

#### 5.4.1 Helpers a nivel de módulo

```python
# ─── Programación de Mensajes (v7.5.0) ────────────────────────────────

MSG_SCHEDULE_KEYS = {
    "enabled":   "msg_schedule_enabled",
    "text":      "msg_schedule_text",
    "selector":  "msg_schedule_selector",
    "send_day":  "msg_schedule_send_day",
    "send_time": "msg_schedule_send_time",
    "weekly":    "msg_schedule_weekly",
}

DIAS_VALIDOS = {"LUNES", "MARTES", "MIERCOLES", "JUEVES",
                "VIERNES", "SABADO", "DOMINGO"}


def _normalizar_telefono(raw: Optional[str]) -> Optional[str]:
    """Normaliza un teléfono mexicano a 10 dígitos. None si es inválido.

    Replica EXACTAMENTE la lógica ya probada en GrandezaDriverUI.jsx
    (§9 de la documentación): limpia no-dígitos, exige 10 dígitos,
    y si hay más toma los últimos 10.
    """
    if not raw:
        return None
    digitos = "".join(ch for ch in str(raw) if ch.isdigit())
    if len(digitos) < 10:
        return None
    return digitos[-10:]
```

> **Reutilización:** esta lógica ya existe en el frontend (`GrandezaDriverUI.jsx`). Se replica en el backend porque el backend es quien resuelve los destinatarios. **No se inventa una regla nueva.**

#### 5.4.2 `get_message_schedule(db)`

Lee las 6 keys de `grandeza_settings` y las ensambla en un objeto.

```python
async def get_message_schedule(self, db: AsyncSession):
    """Ensambla la configuración de programación desde grandeza_settings."""
    stmt = select(GrandezaSettings).where(
        GrandezaSettings.key.in_(MSG_SCHEDULE_KEYS.values())
    )
    result = await db.execute(stmt)
    stored = {s.key: s.value for s in result.scalars().all()}

    def _bool(key, default):
        raw = stored.get(MSG_SCHEDULE_KEYS[key])
        return default if raw is None else raw.lower() == "true"

    return {
        "enabled":   _bool("enabled", False),
        "text":      stored.get(MSG_SCHEDULE_KEYS["text"], ""),
        "selector":  stored.get(MSG_SCHEDULE_KEYS["selector"], "ACTIVOS"),
        "send_day":  stored.get(MSG_SCHEDULE_KEYS["send_day"], "MARTES"),
        "send_time": stored.get(MSG_SCHEDULE_KEYS["send_time"], "09:00"),
        "weekly":    _bool("weekly", True),
    }
```

#### 5.4.3 `save_message_schedule(db, data)`

Persiste las 6 keys usando `upsert_setting` (ya existente). **No duplica lógica.**

```python
async def save_message_schedule(self, db: AsyncSession, data):
    """Persiste la configuración de programación (6 keys)."""
    valores = {
        MSG_SCHEDULE_KEYS["enabled"]:   "true" if data.enabled else "false",
        MSG_SCHEDULE_KEYS["text"]:      data.text,
        MSG_SCHEDULE_KEYS["selector"]:  data.selector,
        MSG_SCHEDULE_KEYS["send_day"]:  data.send_day,
        MSG_SCHEDULE_KEYS["send_time"]: data.send_time,
        MSG_SCHEDULE_KEYS["weekly"]:    "true" if data.weekly else "false",
    }
    for key, value in valores.items():
        await self.upsert_setting(db, key, value)
    return await self.get_message_schedule(db)
```

#### 5.4.4 `resolve_message_recipients(db, selector)`

El corazón del backend. Resuelve los 11 selectores.

```python
async def resolve_message_recipients(self, db: AsyncSession, selector: str):
    """Resuelve un selector de destinatarios a una lista de clientes.

    Excluye clientes sin teléfono válido (no pueden recibir el mensaje).
    Reporta el conteo de excluidos para transparencia.
    """
    selector = (selector or "ACTIVOS").upper()

    # ── Construir la consulta base según el selector ──
    if selector in DIAS_VALIDOS:
        stmt = (
            select(GrandezaClient)
            .join(GrandezaRouteSlot, GrandezaRouteSlot.client_id == GrandezaClient.id)
            .where(GrandezaRouteSlot.day_of_week == selector)
            .options(selectinload(GrandezaClient.route_slots))
            .distinct()
        )
    elif selector == "PROXIMA_EXTRAORDINARIA":
        # La fecha extraordinaria más próxima (hoy o futuro)
        hoy = to_local_date_str(utcnow())
        sub = (
            select(func.min(GrandezaExtraordinaryRouteSlot.route_date))
            .where(GrandezaExtraordinaryRouteSlot.route_date >= hoy)
        )
        result = await db.execute(sub)
        proxima = result.scalar_one_or_none()
        if proxima is None:
            return {"selector": selector, "total": 0, "con_telefono": 0,
                    "sin_telefono": 0, "recipients": []}
        stmt = (
            select(GrandezaClient)
            .join(GrandezaExtraordinaryRouteSlot,
                  GrandezaExtraordinaryRouteSlot.client_id == GrandezaClient.id)
            .where(GrandezaExtraordinaryRouteSlot.route_date == proxima)
            .options(selectinload(GrandezaClient.route_slots))
            .distinct()
        )
    elif selector == "TODOS":
        stmt = select(GrandezaClient).options(selectinload(GrandezaClient.route_slots))
    elif selector == "INACTIVOS":
        stmt = (select(GrandezaClient)
                .where(GrandezaClient.active == False)
                .options(selectinload(GrandezaClient.route_slots)))
    else:  # ACTIVOS (default)
        stmt = (select(GrandezaClient)
                .where(GrandezaClient.active == True)
                .options(selectinload(GrandezaClient.route_slots)))

    result = await db.execute(stmt)
    clientes = result.scalars().unique().all()

    # ── Normalizar teléfonos y construir destinatarios ──
    recipients, sin_telefono = [], 0
    for c in clientes:
        tel = _normalizar_telefono(c.phone)
        if not tel:
            sin_telefono += 1
            continue
        recipients.append({
            "client_id": c.id,
            "name": c.name,
            "business_name": c.business_name,
            "phone_normalized": tel,
            "wa_url": None,  # se construye en el router con el texto
            "already_sent": False,
        })

    return {
        "selector": selector,
        "total": len(clientes),
        "con_telefono": len(recipients),
        "sin_telefono": sin_telefono,
        "recipients": recipients,
    }
```

#### 5.4.5 `log_message_sent(db, data)`

Registra un envío individual.

```python
async def log_message_sent(self, db: AsyncSession, data):
    """Registra un envío individual en la bitácora."""
    registro = GrandezaMessageLog(
        client_id=data.client_id,
        phone_used=data.phone_used,
        message_text=data.message_text,
        selector_used=data.selector_used,
        sent_by=data.sent_by,
        batch_id=data.batch_id,
    )
    db.add(registro)
    await db.flush()
    return registro
```

#### 5.4.6 `get_message_log(db, limit)`

Devuelve la bitácora reciente para mostrarla en la UI.

```python
async def get_message_log(self, db: AsyncSession, limit: int = 100):
    """Bitácora reciente de envíos, con el nombre del cliente."""
    stmt = (
        select(GrandezaMessageLog)
        .options(selectinload(GrandezaMessageLog.client))
        .order_by(GrandezaMessageLog.sent_at.desc())
        .limit(limit)
    )
    result = await db.execute(stmt)
    return result.scalars().all()
```

> ⚠️ **Eager loading obligatorio** (§7.6 de la documentación): `selectinload(GrandezaMessageLog.client)` es indispensable. Sin él, FastAPI dispara un 500 silencioso que el frontend reporta como "Failed to fetch".

### 5.5 `router.py` — Endpoints nuevos

Se agregan **después** de los endpoints de settings (línea 233), y **antes** de los endpoints de visitas.

```python
# ─── Programación de Mensajes (v7.5.0) ────────────────────────────────

@router.get("/message-schedule", response_model=schemas.GrandezaMessageSchedule)
async def get_message_schedule(db: AsyncSession = Depends(get_db)):
    """Devuelve la configuración de programación de mensajes."""
    return await grandeza_service.get_message_schedule(db)


@router.put("/message-schedule", response_model=schemas.GrandezaMessageSchedule)
async def save_message_schedule(
    data: schemas.GrandezaMessageSchedule,
    db: AsyncSession = Depends(get_db),
):
    """Guarda la configuración de programación de mensajes."""
    return await grandeza_service.save_message_schedule(db, data)


@router.get("/message-recipients", response_model=schemas.GrandezaMessageRecipientsResponse)
async def get_message_recipients(
    selector: str = "ACTIVOS",
    db: AsyncSession = Depends(get_db),
):
    """Resuelve un selector de destinatarios y construye los enlaces wa.me.

    El texto del mensaje se toma de la configuración guardada y se
    codifica con urllib.parse.quote para el deep link.
    """
    from urllib.parse import quote

    config = await grandeza_service.get_message_schedule(db)
    texto = config.get("text") or ""
    resultado = await grandeza_service.resolve_message_recipients(db, selector)

    for r in resultado["recipients"]:
        r["wa_url"] = f"https://wa.me/52{r['phone_normalized']}?text={quote(texto)}"

    return resultado


@router.post("/message-log", response_model=schemas.GrandezaMessageLogResponse)
async def create_message_log(
    data: schemas.GrandezaMessageLogCreate,
    db: AsyncSession = Depends(get_db),
):
    """Registra un envío individual en la bitácora."""
    return await grandeza_service.log_message_sent(db, data)


@router.get("/message-log", response_model=List[schemas.GrandezaMessageLogResponse])
async def get_message_log(
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
):
    """Bitácora reciente de envíos."""
    return await grandeza_service.get_message_log(db, limit)
```

> ⚠️ **Orden de rutas (FastAPI):** `/message-schedule`, `/message-recipients` y `/message-log` son literales. No colisionan con `/routes/{day_of_week}` ni con `/clients/{client_id}` porque el prefijo es distinto. Aun así, se registran **antes** de cualquier ruta paramétrica nueva que pudiera agregarse en el futuro.

> ⚠️ **Prefijo `52`:** el enlace usa `https://wa.me/52XXXXXXXXXX` (México), idéntico al patrón ya probado en `sendWhatsApp()` (§9 de la documentación). El teléfono se normaliza a 10 dígitos y se le antepone `52`.

---

## 6. FRONTEND

### 6.1 Archivo a modificar

**Único archivo:** `apps/pos/GrandezaParamsUI.jsx`

### 6.2 Cambio 1 — Agregar la cuarta pestaña (líneas 1204-1208)

```jsx
{[
    { id: 'products', label: 'Productos Vinculados', icon: '🍞' },
    { id: 'clients', label: 'Directorio de Clientes', icon: '👥' },
    { id: 'routes', label: 'Rutas por Día', icon: '🗺️' },
    { id: 'messages', label: 'Programación de Mensajes', icon: '📅' }
].map(tab => (
```

### 6.3 Cambio 2 — Renderizar el contenido (líneas 1238-1240)

```jsx
{activeTab === 'products' && renderProductsTab()}
{activeTab === 'clients' && renderClientsTab()}
{activeTab === 'routes' && renderRoutesTab()}
{activeTab === 'messages' && renderMessagesTab()}
```

### 6.4 Cambio 3 — State nuevo

```jsx
// ─── Programación de Mensajes (v7.5.0) ───
const [msgSchedule, setMsgSchedule] = useState({
    enabled: false,
    text: '',
    selector: 'ACTIVOS',
    send_day: 'MARTES',
    send_time: '09:00',
    weekly: true,
});
const [msgRecipients, setMsgRecipients] = useState(null);
const [msgBatchIndex, setMsgBatchIndex] = useState(0);
const [msgSentIds, setMsgSentIds] = useState(new Set());
const [msgBatchId, setMsgBatchId] = useState(null);
const [msgLog, setMsgLog] = useState([]);
const [msgSaving, setMsgSaving] = useState(false);
```

### 6.5 Cambio 4 — Constantes

```jsx
const MSG_SELECTORES = [
    { id: 'TODOS',                   label: 'Todos los clientes' },
    { id: 'ACTIVOS',                 label: 'Solo activos' },
    { id: 'INACTIVOS',               label: 'Solo inactivos' },
    { id: 'LUNES',                   label: 'Clientes de Lunes' },
    { id: 'MARTES',                  label: 'Clientes de Martes' },
    { id: 'MIERCOLES',               label: 'Clientes de Miércoles' },
    { id: 'JUEVES',                  label: 'Clientes de Jueves' },
    { id: 'VIERNES',                 label: 'Clientes de Viernes' },
    { id: 'SABADO',                  label: 'Clientes de Sábado' },
    { id: 'DOMINGO',                 label: 'Clientes de Domingo' },
    { id: 'PROXIMA_EXTRAORDINARIA',  label: 'Clientes de próxima ruta extraordinaria' },
];

const MSG_BATCH_SIZE = 5;
```

> **Nota:** `DAYS` ya existe en la línea 101 y se reutiliza para el selector de día de envío.

### 6.6 Cambio 5 — Handlers

```jsx
// ─── Programación de Mensajes (v7.5.0) ───

const fetchMsgSchedule = async () => {
    try {
        const res = await fetch(`${API_BASE}/grandeza/message-schedule`);
        if (res.ok) setMsgSchedule(await res.json());
    } catch (e) { console.error('FETCH ERR msg-schedule:', e); }
};

const fetchMsgLog = async () => {
    try {
        const res = await fetch(`${API_BASE}/grandeza/message-log?limit=50`);
        if (res.ok) setMsgLog(await res.json());
    } catch (e) { console.error('FETCH ERR msg-log:', e); }
};

const saveMsgSchedule = async () => {
    setMsgSaving(true);
    try {
        const res = await fetch(`${API_BASE}/grandeza/message-schedule`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(msgSchedule),
        });
        if (res.ok) setMsgSchedule(await res.json());
    } catch (e) {
        console.error('SAVE ERR msg-schedule:', e);
    } finally {
        setMsgSaving(false);
    }
};

const loadMsgRecipients = async () => {
    try {
        const res = await fetch(
            `${API_BASE}/grandeza/message-recipients?selector=${msgSchedule.selector}`
        );
        if (res.ok) {
            const data = await res.json();
            setMsgRecipients(data);
            setMsgBatchIndex(0);
            setMsgSentIds(new Set());
            setMsgBatchId(`B${Date.now()}`);
        }
    } catch (e) { console.error('FETCH ERR msg-recipients:', e); }
};

const markMsgSent = async (recipient) => {
    // 1. Abrir WhatsApp con el mensaje pre-cargado (deep link)
    window.open(recipient.wa_url, '_blank');

    // 2. Registrar el envío en la bitácora (optimista en UI)
    setMsgSentIds(prev => new Set(prev).add(recipient.client_id));
    try {
        await fetch(`${API_BASE}/grandeza/message-log`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                client_id: recipient.client_id,
                phone_used: recipient.phone_normalized,
                message_text: msgSchedule.text,
                selector_used: msgSchedule.selector,
                sent_by: null,
                batch_id: msgBatchId,
            }),
        });
    } catch (e) {
        console.error('LOG ERR msg-log:', e);
    }
};

const nextMsgBatch = () => setMsgBatchIndex(i => i + 1);
const prevMsgBatch = () => setMsgBatchIndex(i => Math.max(0, i - 1));
```

> **Decision de diseno:** `markMsgSent` abre WhatsApp **primero** y registra **despues**. Si el registro falla, el envio ya ocurrio y el cliente queda marcado en la UI. Se prefiere un falso positivo en la bitacora (registro faltante) a un falso negativo (marcar como no enviado algo que si se envio y reenviarlo). El registro es *best-effort*.

### 6.7 Cambio 6 — `useEffect` de carga

Se extiende el `useEffect` existente (lineas 103-111) para cargar la configuracion al entrar a la pestaña:

```jsx
useEffect(() => {
    if (activeTab === 'messages') {
        fetchMsgSchedule();
        fetchMsgLog();
    }
}, [activeTab]);
```

### 6.8 Cambio 7 — `renderMessagesTab()`

Se agrega como funcion nueva, junto a `renderProductsTab`, `renderClientsTab` y `renderRoutesTab`.

**Estructura de la UI (3 bloques):**

```
BLOQUE 1 — CONFIGURACION
  [x] Activar programacion de mensajes

  MENSAJE
  +----------------------------------------------------------+
  | Buen dia. Le recordamos que hoy es su dia de reparto.    |
  | Por favor levante su pedido para poder entregarselo.     |
  +----------------------------------------------------------+
  (textarea, 4 filas, editable)

  DESTINATARIOS            DIA DE ENVIO      HORA
  [Clientes de Jueves v]   [Martes v]        [09:00]

  [x] Repetir cada semana

                [ Guardar configuracion ]

BLOQUE 2 — PANEL DE ENVIO (solo si enabled)
  MARTES 09:00 -> Clientes de Jueves
  12 destinatarios - 10 con telefono - 2 sin telefono

  LOTE 1 de 2                          Enviados: 3/5
  +----------------------------------------------------------+
  | [OK] Tienda Dona Mary        [ Enviar ]                  |
  | [  ] Abarrotes El Sol        [ Enviar ]                  |
  | [  ] Panaderia La Luz        [ Enviar ]                  |
  | [  ] Tienda San Jose         [ Enviar ]                  |
  | [  ] Abarrotes Central       [ Enviar ]                  |
  +----------------------------------------------------------+

  [ <- Lote anterior ]              [ Siguiente lote -> ]

BLOQUE 3 — BITACORA RECIENTE
  22/Sep 09:03 - Tienda Dona Mary - JUEVES
  22/Sep 09:02 - Abarrotes El Sol - JUEVES
  15/Sep 09:01 - Tienda Dona Mary - JUEVES
```

**Especificaciones de la UI:**

| Elemento | Especificacion |
|----------|----------------|
| Contenedor | `bg-white/5 border border-white/10 rounded-[35px] p-6` (paleta del modulo) |
| Titulo de bloque | `text-amber-400 font-black uppercase tracking-widest text-sm` |
| Textarea del mensaje | `w-full bg-black/40 border border-white/10 rounded-2xl p-4 text-white resize-none` |
| Selectores | `bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-white` |
| Boton guardar | `bg-amber-500 text-black font-black uppercase rounded-2xl px-6 py-3` |
| Boton enviar | `bg-green-600 text-white font-black rounded-xl px-4 py-2` (verde WhatsApp) |
| Cliente enviado | `opacity-50 line-through` + check |
| Responsivo | Lista apilada en movil; botones full-width en movil (`w-full md:w-auto`) |
| Lotes | `MSG_BATCH_SIZE = 5`; slice `recipients.slice(idx*5, idx*5+5)` |

**Calculo del lote actual:**

```jsx
const loteActual = msgRecipients
    ? msgRecipients.recipients.slice(
          msgBatchIndex * MSG_BATCH_SIZE,
          msgBatchIndex * MSG_BATCH_SIZE + MSG_BATCH_SIZE
      )
    : [];
const totalLotes = msgRecipients
    ? Math.ceil(msgRecipients.recipients.length / MSG_BATCH_SIZE)
    : 0;
```

**Indicador de "ya se envio esta semana":** si un cliente tiene un registro en `msgLog` con `sent_at` dentro de los ultimos 7 dias y el mismo `selector_used`, se muestra con check y la fecha. Esto evita reenviar por error.

---

## 7. VERIFICACION

### 7.1 Verificacion de backend

| # | Prueba | Comando / Accion | Resultado esperado |
|---|--------|------------------|--------------------|
| V-1 | La tabla existe | `\d grandeza_message_log` en psql | 8 columnas + 2 indices |
| V-2 | GET config vacia | `curl /api/v1/grandeza/message-schedule` | JSON con defaults (`enabled: false`) |
| V-3 | PUT config | `curl -X PUT ... -d '{"enabled":true,"text":"Hola","selector":"JUEVES",...}'` | JSON guardado |
| V-4 | GET config persistida | `curl /api/v1/grandeza/message-schedule` | Devuelve lo guardado |
| V-5 | Resolver `ACTIVOS` | `curl ".../message-recipients?selector=ACTIVOS"` | Solo `active=true`, con `wa_url` |
| V-6 | Resolver `JUEVES` | `curl ".../message-recipients?selector=JUEVES"` | Solo clientes con slot JUEVES |
| V-7 | Resolver `PROXIMA_EXTRAORDINARIA` | `curl ".../message-recipients?selector=PROXIMA_EXTRAORDINARIA"` | Clientes de la fecha extraordinaria mas proxima |
| V-8 | Exclusion sin telefono | Cliente sin `phone` | Aparece en `sin_telefono`, no en `recipients` |
| V-9 | POST log | `curl -X POST .../message-log -d '{...}'` | 200 + registro creado |
| V-10 | GET log | `curl ".../message-log?limit=10"` | Lista ordenada desc, con `client` |
| V-11 | **Sin 500 encubierto** | Revisar logs de FastAPI | Cero `MissingGreenlet` (eager loading OK) |

> ⚠️ **V-11 es critica.** El Error B de la documentacion (§6) demuestra que un `selectinload` faltante produce un 500 que el frontend disfraza como "Failed to fetch". Verificar los logs del contenedor, no solo la respuesta del navegador.

### 7.2 Verificacion de frontend

| # | Prueba | Resultado esperado |
|---|--------|--------------------|
| V-12 | La 4a pestaña aparece | "Programacion de Mensajes" visible |
| V-13 | El mensaje se edita y persiste | Recargar -> el texto sigue ahi |
| V-14 | Los 11 selectores aparecen | Dropdown completo |
| V-15 | El panel de envio carga destinatarios | Lista con nombres y conteos |
| V-16 | El boton abre WhatsApp | `wa.me` con el texto pre-cargado |
| V-17 | El cliente se marca | Al tocar "Enviar" |
| V-18 | Los lotes de 5 funcionan | "Siguiente lote" avanza de 5 en 5 |
| V-19 | La bitacora muestra los envios | Registros con fecha y cliente |
| V-20 | **Responsivo en telefono** | Se usa desde el movil sin scroll horizontal |
| V-21 | **El POS no cambio** | `git diff --stat` no toca `RetailVisionPOS.jsx` |

### 7.3 Verificacion de build

```bash
npm run build
```

**Criterio de aceptacion:** build exitoso, cero errores, cero warnings nuevos.

### 7.4 Verificacion de estandares

| Estandar | Verificacion |
|----------|--------------|
| E-07 Trazabilidad | `grandeza_message_log` registra quien/cuando/a quien/que |
| E-10 Tiempo UTC | `sent_at` usa `utcnow()`; `send_time` es hora local de negocio (intencion) |
| E-12 Ledger inmutable | `message_text` se copia, no se referencia |
| E-15 Cero codigo basura | Sin `console.log` de debug; solo `console.error` en catch |
| E-16 Funciones atomicas | Cada metodo del service hace una cosa |
| E-17 Nombres autodocumentados | `resolve_message_recipients`, `log_message_sent` |
| E-18 Constantes centralizadas | `MSG_SCHEDULE_KEYS`, `DIAS_VALIDOS`, `MSG_BATCH_SIZE` |
| §7.6 Eager loading | `selectinload` en `get_message_log` y en cada query de clientes |
| §7.7 Migracion | `CREATE TABLE` ejecutado manualmente |
| §7.9 URL unica | Todo deriva de `CONFIG.API_BASE_URL` (`API_BASE`) |

---

## 8. RIESGOS Y MITIGACIONES

| # | Riesgo | Prob. | Impacto | Mitigacion |
|---|--------|:-----:|:-------:|------------|
| R-1 | `selectinload` faltante -> 500 encubierto | Media | Alto | Eager loading explicito en cada query; V-11 revisa logs del contenedor |
| R-2 | La tabla no existe (migracion olvidada) | Media | Alto | `CREATE TABLE IF NOT EXISTS` documentado y ejecutado antes de probar |
| R-3 | Telefonos con formato inconsistente | Alta | Medio | `_normalizar_telefono()` replica la logica ya probada; excluye invalidos |
| R-4 | Cliente sin telefono recibe nada y nadie lo nota | Media | Medio | Se reporta `sin_telefono` en la respuesta y se muestra en la UI |
| R-5 | Reenvio accidental al mismo cliente | Media | Bajo | La bitacora marca a quien ya se le envio esta semana |
| R-6 | El administrador cierra WhatsApp y no vuelve | Baja | Bajo | El registro es optimista; el cliente queda marcado igual |
| R-7 | `wa.me` abre en desktop sin WhatsApp | Baja | Bajo | El modulo es responsivo; el uso previsto es el telefono (D-6) |
| R-8 | Confusion de zona horaria en `send_time` | Media | Medio | Se guarda como hora local de negocio, no como timestamp |
| R-9 | Colision de rutas en FastAPI | Baja | Medio | Prefijos literales distintos; se registran antes de rutas parametricas |
| R-10 | Regresion en el POS | Baja | Critico | Cero cambios en `RetailVisionPOS.jsx`; V-21 lo verifica con `git diff` |

---

## 9. ORDEN DE EJECUCION

| Paso | Tarea | Archivo | Verificacion |
|:----:|-------|---------|--------------|
| 1 | Crear el modelo `GrandezaMessageLog` | `models.py` | Import sin error |
| 2 | Ejecutar el `CREATE TABLE` en PostgreSQL | SQL manual | V-1 |
| 3 | Agregar los 5 schemas | `schemas.py` | Import sin error |
| 4 | Agregar `_normalizar_telefono` + `MSG_SCHEDULE_KEYS` + `DIAS_VALIDOS` | `service.py` | — |
| 5 | Agregar los 5 metodos del service | `service.py` | — |
| 6 | Agregar los 5 endpoints | `router.py` | V-2 a V-10 |
| 7 | Reiniciar el backend y revisar logs | — | V-11 |
| 8 | Agregar la 4a pestaña + state + constantes | `GrandezaParamsUI.jsx` | V-12, V-14 |
| 9 | Agregar los handlers | `GrandezaParamsUI.jsx` | — |
| 10 | Agregar `renderMessagesTab()` | `GrandezaParamsUI.jsx` | V-13, V-15 a V-19 |
| 11 | Probar en el telefono | — | V-20 |
| 12 | `npm run build` | — | Build verde |
| 13 | Verificar que el POS no cambio | `git diff --stat` | V-21 |
| 14 | Documentar en `DOCUMENTACION_MODULO_REPARTO_GRANDEZA.md` | §17 nueva | — |
| 15 | Commit + push | — | — |

---

## 10. MATRIZ DE TRAZABILIDAD

| Requisito del usuario | Decision | Implementacion | Verificacion |
|-----------------------|----------|----------------|--------------|
| "Editar el mensaje a mi voluntad" | D-3 | `msg_schedule_text` + textarea | V-13 |
| "Elegir a que clientes enviar" (11 opciones) | D-1 | `resolve_message_recipients` + dropdown | V-5 a V-8, V-14 |
| "Elegir fecha y hora" | D-1 | `msg_schedule_send_day` + `send_time` | V-3, V-4 |
| "Repetir cada semana" | D-1 | `msg_schedule_weekly` (checkbox) | V-3 |
| "Evitar mandarlos uno por uno" | D-2 | Panel de envio con `wa.me` | V-16 |
| "Sin integraciones complejas con WhatsApp" | D-2 | Deep link `wa.me` (gratis, sin API) | V-16 |
| "De 5 en 5" | D-4 | `MSG_BATCH_SIZE = 5` + paginacion | V-18 |
| "El mensaje es el mismo para todos" | D-3 | Un solo `msg_schedule_text` | V-13 |
| "Sin IA" | D-5 | Cero llamadas a `/ai/*` | Revision de codigo |
| "Desde mi telefono" | D-6 | UI responsiva | V-20 |
| "En Parametros Generales" | D-7 | 4a pestaña en `GrandezaParamsUI` | V-12 |

---

## 11. DECLARACION DE REGLAS DURAS

1. **CERO cambios en el POS.** `RetailVisionPOS.jsx` no se toca. Verificado con `git diff`.
2. **CERO funciones de IA.** Ninguna llamada a `/ai/*`. El humano decide y envia.
3. **CERO envio automatico.** El sistema nunca abre WhatsApp por su cuenta; solo genera el enlace.
4. **Un solo mensaje para todos.** No hay personalizacion por cliente.
5. **Eager loading obligatorio.** Todo acceso a relacion ORM dentro de un bucle usa `selectinload`.
6. **Migracion manual obligatoria.** `create_all` no altera tablas; el `CREATE TABLE` se ejecuta a mano.
7. **URL unica.** Todo deriva de `CONFIG.API_BASE_URL`. Nunca hardcodear puertos.
8. **Bitacora inmutable.** `message_text` se copia en cada registro.
9. **Respeto al usuario.** El sistema no sobreescribe datos capturados; solo bloquea con mensaje claro.
10. **Reutilizacion.** La normalizacion de telefonos y el patron `wa.me` replican lo ya probado en `GrandezaDriverUI.jsx`.

---

**FIN DEL PLAN**
