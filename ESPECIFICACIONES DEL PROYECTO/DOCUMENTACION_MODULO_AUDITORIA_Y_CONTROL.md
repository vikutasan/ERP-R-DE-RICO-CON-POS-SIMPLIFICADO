# 🛡️ DOCUMENTACIÓN MAESTRA: MÓDULO DE AUDITORÍA Y CONTROL — R de Rico ERP

> **⚠️ LECTURA OBLIGATORIA.** Cualquier IA o desarrollador que necesite interactuar, depurar o extender el Módulo de Auditoría y Control **DEBE** leer este documento. Aquí se detalla la lógica de trazabilidad de tickets, cortes de caja y reporte diario consolidado, así como los *gotchas* (problemas ocultos) resueltos durante el desarrollo.
>
> **Última actualización:** 2026-09-07
> **Archivos gobernados:** `apps/AuditoriaControlUI.jsx`, `apps/api/modules/pos/service.py`, `apps/api/modules/cash/service.py`, `apps/api/modules/cash/router.py`

---

## 1. PROPÓSITO Y FUNCIONAMIENTO DEL MÓDULO

El **Módulo de Auditoría y Control** es el centro de monitoreo operativo donde la gerencia puede rastrear la trazabilidad de cada centavo ingresado en el sistema. Su funcionamiento se divide en tres secciones principales:

1. **Pestaña de Tickets (Ventas):** Muestra el historial completo de ventas, indicando no solo el folio y el monto, sino la trazabilidad humana y física: **quién capturó** el pedido, **quién lo cobró**, y **en qué terminal** (tablet física) se originó.
2. **Pestaña de Cortes de Caja:** Lista los cierres de sesión de las terminales recaudadoras (`CashSessions`). Muestra los fondos iniciales, ventas por método de pago (Efectivo, Crédito, Débito), movimientos manuales (entradas/salidas) y el monto físico reportado por el empleado.
3. **Pestaña de Reporte Diario (📊):** Genera un reporte consolidado de toda la sucursal para una fecha específica. Agrupa ventas por canal (Panadería/Heladería), detalla cada turno de caja, y emite alertas automáticas.

### Comportamiento de la Interfaz (Filtros y Limpieza)
- **Por defecto / Al hacer clic en "Limpiar":** La UI envía peticiones a los endpoints `/pos/tickets` o `/cash/sessions/history` **sin parámetros**. El backend responde enviando los **últimos 100 tickets** o **últimos 50 cortes**, ordenados desde el más reciente al más antiguo.
- **Búsqueda por Fecha:** Si el gerente selecciona una fecha, la API devuelve todos los registros correspondientes estrictamente a ese "día operativo" (ajustado a la zona horaria UTC-6).
- **Reporte Diario:** El gerente selecciona una fecha y presiona "Generar Reporte". La API responde con un JSON consolidado que la UI renderiza en tarjetas visuales.

---

## 2. EL CEMENTERIO DE BUGS (LECCIONES APRENDIDAS Y CORREGIDAS)

A continuación se documentan los 5 incidentes críticos resueltos en el desarrollo del módulo. **PROHIBIDO revertir estas soluciones o cometer los mismos errores en el futuro.**

### 🐛 BUG 1: El Secuestro de la Terminal de Origen (Ticket Extraviado)

**El Síntoma:**
La gerencia reportó que un ticket de $2,550 capturado en la **Terminal 5** "desapareció" de los registros de dicha terminal y no podía ser encontrado. Al buscar a fondo, el ticket sí existía pero estaba registrado bajo la terminal **"CAJA"**.

**Causa Raíz:**
1. Un vendedor en la Terminal 5 tomaba el pedido y lo mandaba al Pizarrón (Estado `OPEN`). En este paso, el ticket nacía correctamente con `terminal_id='T5'`.
2. El cajero en la CAJA abría el Pizarrón y cobraba el ticket (Estado `PAID`).
3. En el backend (`_update_ticket_fields` en `pos/service.py`), existía una regla que sobreescribía el campo `terminal_id` del ticket original con la sesión de quien estuviera haciendo la actualización. Esto **robaba** la autoría a la T5 y se la daba a la CAJA.

**Solución Implementada:**
- Se **eliminó permanentemente** la línea de sobreescritura de `terminal_id` al actualizar tickets.
- **Regla de Oro:** El campo `terminal_id` es **inmutable** una vez que el ticket nace (`_initialize_new_ticket`). Representa el origen físico de la venta. Para saber quién cobró el dinero, el módulo de auditoría utiliza los campos `cashed_by_id` y `cash_session_id`. Nunca destruir la información de origen.

---

### 🐛 BUG 2: La Zona Horaria y los Tickets/Cortes Nocturnos Desaparecidos

**El Síntoma:**
Al utilizar el filtro de búsqueda por "Fecha" en la Auditoría, el gerente notó que el sistema mostraba los tickets y cortes del día seleccionado, pero **solo hasta las 6:00 PM**. Cualquier venta u operación realizada a las 7:00 PM, 10:00 PM o media noche simplemente **desaparecía** de la consulta de ese día.

**Causa Raíz:**
1. PostgreSQL guarda todos los timestamps (`created_at`, `opened_at`) en **UTC** (Tiempo Universal Coordinado), el cual está **6 horas adelantado** respecto a México (UTC-6).
2. El código anterior hacía un simple `cast(models.Ticket.created_at, Date) == target_date`. Para el servidor UTC, las 6:01 PM de México ya son las 00:01 del día siguiente. El cast cortaba el día prematuramente.

**Solución Implementada:**
- En `apps/api/modules/pos/service.py` y `apps/api/modules/cash/service.py`, el filtrado por fecha (`search_date`) ya no utiliza `cast`.
- Ahora, el backend recibe la fecha (ej. `2026-06-15`), le suma el desfase horario local (`+ 6 horas`) para obtener `start_utc` y `end_utc`, y ejecuta una consulta de **rango**: `WHERE created_at >= start_utc AND created_at < end_utc`. Esto alinea perfectamente los "días" de la base de datos con los "días" reales de operación del negocio.

---

### 🐛 BUG 3: Cortes de Caja Invisibles (El Error 500 Silencioso)

**El Síntoma:**
Al entrar a la pestaña de "Cortes de Caja", la interfaz aparecía **completamente vacía**, sin mostrar el historial de los últimos realizados ni al usar el botón "Limpiar". La creencia inicial del usuario era que los cortes eran muy viejos para mostrarse.

**Causa Raíz:**
1. No era que no hubiera cortes (había más de 100 guardados). Era un **Internal Server Error 500** del API (`/cash/sessions/history`).
2. La API intentaba inyectar un `CashSummary` calculando los esperados de efectivo. Para ello, sumaba el fondo inicial (`opening_float` - tipo `Decimal` de SQLAlchemy) con las ventas cobradas en efectivo (tipo `float` calculado en un diccionario en Python).
3. **El fallo:** En Python, intentar sumar `decimal.Decimal` + `float` directamente lanza un `TypeError`. Este error rompía la respuesta del API y mandaba un arreglo vacío al frontend de React.

**Solución Implementada:**
- En `apps/api/modules/cash/service.py` -> `calcular_resumen`, se forzó el cast seguro a `float()` en todos los campos provenientes de la base de datos (`opening_float`, `m.amount`) antes de mezclarlos con los diccionarios de ventas y construir la respuesta Pydantic final. Esto estabilizó la API y los cortes volvieron a aparecer de inmediato.

---

### 🐛 BUG 4: Pestaña en Blanco por Lazy Loading de SQLAlchemy (El Bloqueo de AsyncPG)

**El Síntoma:**
Al intentar entrar al módulo de Auditoría, la pantalla se mostraba completamente en blanco (sin tickets) a pesar de que en la base de datos existían miles de registros. Ocurría un Internal Server Error 500 silencioso al llamar a `/pos/tickets`.

**Causa Raíz:**
1. Al configurar la seguridad de PostgreSQL y forzar el uso estricto del driver asíncrono (`asyncpg`), SQLAlchemy bloqueó de inmediato todas las lecturas "Lazy Load" (lecturas bajo demanda a la base de datos fuera de una consulta asíncrona explícita).
2. La API para obtener los tickets retornaba los items del carrito. En el esquema Pydantic (`ProductResponse`), se pedía serializar el campo `technical_sheet` (Ficha técnica del producto).
3. Como el backend fue optimizado en versiones pasadas para NO incluir `technical_sheet` en los JOINs iniciales (ahorrando memoria), SQLAlchemy intentaba descargarlo de la DB en pleno vuelo (Lazy Load). Al estar en un contexto asíncrono estricto, esto detonaba una excepción fatal: `MissingGreenlet`.

**Solución Implementada:**
- Se creó un nuevo esquema `ProductLightResponse` en `apps/api/modules/pos/schemas.py` exclusivo para las respuestas del POS y Auditoría.
- Este esquema **omite** explícitamente atributos pesados como `technical_sheet`.
- **Regla de Oro:** Nunca agregar relaciones profundas a los esquemas de respuesta Pydantic (como `ProductResponse`) sin asegurar que la consulta de base de datos correspondiente incluya el `selectinload()` para precargarlos. Para consultas masivas, es mandatorio usar esquemas *Lightweight*.

---

### 🐛 BUG 5: URL del API Construida con `window.location.hostname` (Rompe en Red Local)

**El Síntoma:**
La pestaña de Auditoría funcionaba perfectamente en `localhost`, pero al acceder desde otra tablet en la red local (ej. `192.168.1.124:5000`), las llamadas al API fallaban silenciosamente porque la URL del backend se construía como `http://192.168.1.124:5001/api/v1` en lugar de apuntar al servidor correcto.

**Causa Raíz:**
El código original construía la URL del API así:
```javascript
const API_BASE = `http://${window.location.hostname}:5001/api/v1`;
```
Esto funciona **solo si el API está en el mismo host que el frontend**. En una red con múltiples terminales, cada tablet genera una URL distinta apuntando a sí misma, no al servidor.

**Solución Implementada:**
- Se reemplazó por el patrón centralizado `CONFIG.API_BASE_URL` de `apps/pos/config.js`:
```javascript
import { CONFIG } from './pos/config';
const API_BASE = CONFIG.API_BASE_URL;
```
- **Regla de Oro:** Está **ESTRICTAMENTE PROHIBIDO** construir URLs manualmente con `window.location.hostname` en cualquier parte del ERP. Todo debe usar `CONFIG.API_BASE_URL`.

---

## 3. REPORTE DIARIO CONSOLIDADO (📊)

### 3.1 Propósito

El Reporte Diario Consolidado es la **vista ejecutiva** para el dueño del negocio. En una sola pantalla muestra:
- **Gran Total de la sucursal** para la fecha seleccionada
- **Desglose por canal** (Panadería vs Heladería)
- **Detalle por turno** (qué cajero, en qué terminal, cuánto vendió, cuál fue su diferencia)
- **Alertas automáticas** (sesiones de caja que siguen abiertas)

### 3.2 Arquitectura

```
┌─────────────────────┐     ┌──────────────────────────┐     ┌─────────────────────┐
│  AuditoriaControlUI │────▶│  GET /cash/daily-report/  │────▶│  generar_reporte_    │
│  Pestaña "📊"       │     │      {fecha}              │     │  diario()            │
│  (React)            │     │  (cash/router.py)         │     │  (cash/service.py)   │
└─────────────────────┘     └──────────────────────────┘     └─────────────────────┘
                                                                      │
                                                                      ▼
                                                            ┌─────────────────────┐
                                                            │  1. Query sesiones   │
                                                            │     del día          │
                                                            │  2. Query tickets    │
                                                            │     PAID del día     │
                                                            │  3. Agrupar por      │
                                                            │     canal            │
                                                            │  4. Agrupar por      │
                                                            │     turno/cajero     │
                                                            │  5. Calcular         │
                                                            │     diferencias      │
                                                            │  6. Generar alertas  │
                                                            └─────────────────────┘
```

### 3.3 Endpoint

| Método | Ruta | Archivo |
|---|---|---|
| `GET` | `/api/v1/cash/daily-report/{fecha}` | `apps/api/modules/cash/router.py` |

**Parámetro:** `fecha` en formato `YYYY-MM-DD` (ej. `2026-09-06`).

### 3.4 Lógica del Backend (`generar_reporte_diario`)

**Archivo:** `apps/api/modules/cash/service.py`

**Paso 1 — Obtener sesiones de caja del día:**
```python
select(CashSession)
    .options(selectinload(CashSession.tickets))
    .where(CashSession.opened_at >= fecha_inicio)
    .where(CashSession.opened_at <= fecha_fin)
```

**Paso 2 — Obtener tickets pagados del día:**
```python
select(Ticket)
    .where(Ticket.status == "PAID")
    .where(Ticket.created_at >= fecha_inicio)
    .where(Ticket.created_at <= fecha_fin)
```

**Paso 3 — Agrupar por canal:**
```python
canal = getattr(ticket, 'channel', None) or 'PANADERIA'
```
El campo `channel` fue agregado a la tabla `tickets` como parte del módulo de Heladería. Si es `NULL` (tickets pre-heladería), se asume `'PANADERIA'`. Tickets de heladería tienen `channel='HELADERIA'`.

**Paso 4 — Agrupar por turno/cajero:**
Para cada `CashSession`, se filtran los tickets que pertenecen a esa sesión (`ticket.cash_session_id == session.id`) y se suman sus totales.

**Paso 5 — Calcular diferencias:**
```python
diferencia = float(session.real_cash_count or 0) - float(session.expected_cash or 0)
```
- `real_cash_count`: Lo que el cajero reportó al contar su caja físicamente.
- `expected_cash`: Lo que el sistema calculó que debería haber.
- **Diferencia negativa** = faltante (🔴 rojo). **Positiva** = sobrante (🟢 verde).
- Solo se calcula para sesiones cerradas (`is_closed == True`).

**Paso 6 — Alertas automáticas:**
Se detectan sesiones de caja que **siguen abiertas** al final del día y se generan mensajes de alerta:
```
"Sesión T5 (María López) sigue abierta"
```

### 3.5 Respuesta JSON

```json
{
    "fecha": "2026-09-06",
    "gran_total": 77761.0,
    "total_tickets": 508,
    "total_turnos": 4,
    "turnos_cerrados": 3,
    "diferencia_total": -15.50,
    "por_canal": {
        "PANADERIA": { "total": 65000.0, "tickets": 420 },
        "HELADERIA": { "total": 12761.0, "tickets": 88 }
    },
    "turnos": [
        {
            "session_id": 12,
            "terminal_id": "CAJA",
            "employee_name": "María López",
            "opened_at": "2026-09-06T08:00:00",
            "closed_at": "2026-09-06T16:00:00",
            "is_closed": true,
            "total_ventas": 42000.0,
            "num_tickets": 280,
            "diferencia": -5.50
        }
    ],
    "alertas": [
        "Sesión H-CAJA (Juan Pérez) sigue abierta"
    ]
}
```

### 3.6 Frontend (UI)

La pestaña "📊 Reporte Diario" en `AuditoriaControlUI.jsx` renderiza 4 bloques visuales:

| Bloque | Diseño | Contenido |
|---|---|---|
| **Gran Total** | Tarjeta negra con gradiente, texto 5XL | Monto total + total tickets + turnos cerrados + diferencia total |
| **Por Canal** | Grid 2 columnas, tarjetas blancas | 🍞 Panadería y 🍦 Heladería con total y tickets por canal |
| **Detalle por Turno** | Tabla con filas hover | Cajero, terminal, ventas, tickets, diferencia (rojo/verde), estado (cerrado/abierto) |
| **Alertas** | Tarjeta amarilla condicional | Solo aparece si hay sesiones abiertas. Lista con bullets |

### 3.7 Notas Técnicas

> [!NOTE]
> **Zona horaria:** `generar_reporte_diario()` aplica el mismo ajuste UTC-6 que el Bug 2: el "día" local de México va de las 06:00 UTC a las 06:00 UTC del día siguiente. Esto garantiza que ventas nocturnas (7PM-12AM) se incluyan correctamente en el reporte del día correcto.

> [!NOTE]
> **Tickets sin sesión de caja:** Si un ticket fue pagado pero NO tiene `cash_session_id` (por ejemplo, cobros directos sin abrir sesión de caja), aparecerá en el gran total y en el desglose por canal, pero NO se asignará a ningún turno. No se pierde dinero del reporte, pero puede haber diferencia entre la suma de turnos y el gran total.

