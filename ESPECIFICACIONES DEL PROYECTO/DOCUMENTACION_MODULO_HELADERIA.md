# 🍦 DOCUMENTACIÓN MAESTRA: MÓDULO DE HELADERÍA — R de Rico ERP

> **⚠️ LECTURA OBLIGATORIA.** Cualquier IA o desarrollador que necesite interactuar, depurar o extender el Módulo de Heladería **DEBE** leer este documento. Aquí se detalla la arquitectura, el flujo de datos, las reglas de negocio y las decisiones técnicas del módulo.
>
> **Última actualización:** 2026-09-07
> **Archivos gobernados:**
> - Backend: `apps/api/modules/heladeria/*` (models, schemas, service, router)
> - Frontend: `apps/heladeria/*` (Hub, secciones, hooks, services, components)
> - Integración: `apps/ExperimentCenterUI.jsx`, `apps/AuditoriaControlUI.jsx`

---

## 1. PROPÓSITO DEL MÓDULO

El Módulo de Heladería extiende el ERP R de Rico para gestionar la operación de una **heladería artesanal de alta gama** (estilo Häagen-Dazs / Amorino) dentro de la misma sucursal que la panadería. El módulo opera de forma **totalmente aislada** del POS de panadería: si heladería se cae, la panadería sigue funcionando sin afectación.

### Capacidades
- **POS Heladería** — Punto de venta rápido para el personal de mostrador
- **KDS Helados** — Pantalla de preparación para estación de helados
- **KDS Malteadas** — Pantalla de preparación para estación de malteadas/aguas frescas
- **Tienda Interactiva** — (Futuro) Interfaz táctil para clientes en mostrador
- **Display Tótem** — (Futuro) Contenido visual para atraer clientes
- **Display Precios** — (Futuro) Menú digital con precios en tiempo real
- **Reporte Consolidado** — Ventas de heladería aparecen separadas en el reporte diario de Auditoría

---

## 2. ARQUITECTURA

### 2.1 Diagrama de Módulos

```
┌─────────────────────────────────────────────────────────────────────┐
│                      ExperimentCenterUI.jsx                         │
│                    (Hub principal del ERP)                           │
│                                                                     │
│   React.lazy() ───── Barrera 1 (aislamiento)                       │
│         │                                                           │
│         ▼                                                           │
│   ┌───────────────────────────────────────────────────────────┐     │
│   │                  HeladeriaHubUI.jsx                        │     │
│   │            (Landing page del módulo)                       │     │
│   │                                                           │     │
│   │   React.lazy() + ErrorBoundary ── Barrera 2 (por sección) │     │
│   │         │           │           │           │             │     │
│   │         ▼           ▼           ▼           ▼             │     │
│   │   ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐       │     │
│   │   │ POS     │ │ KDS     │ │ KDS     │ │ Tienda  │       │     │
│   │   │Heladería│ │ Helados │ │Malteadas│ │Interact.│       │     │
│   │   └─────────┘ └─────────┘ └─────────┘ └─────────┘       │     │
│   └───────────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 Doble Barrera de Aislamiento

| Barrera | Ubicación | Protección |
|---|---|---|
| **Barrera 1** | `ExperimentCenterUI.jsx` → `React.lazy(HeladeriaHubUI)` | Si TODO el módulo de heladería falla, el POS panadería y todos los demás módulos siguen funcionando |
| **Barrera 2** | `HeladeriaHubUI.jsx` → `React.lazy(PosHeladeriaUI)` + `SectionErrorBoundary` | Si una sección falla (ej. KDS), las demás secciones del Hub siguen accesibles |

### 2.3 Separación de Canal

El módulo utiliza el campo `channel` en la tabla `tickets` para separar flujos:

| Canal | Valor | Uso |
|---|---|---|
| Panadería | `NULL` o `'PANADERIA'` | Tickets del POS tradicional (default) |
| Heladería | `'HELADERIA'` | Tickets del POS Heladería |

> [!IMPORTANT]
> **Regla de Oro:** El campo `channel` es lo único que separa las ventas de heladería de las de panadería. Si un ticket de heladería se crea con `channel=NULL`, aparecerá como venta de panadería en el reporte diario.

---

## 3. MODELO DE DATOS

### 3.1 Tabla `heladeria_product_config`

Extiende la tabla `products` del catálogo existente con configuración específica de heladería.

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | `Integer PK` | Autoincremental |
| `product_id` | `FK → products.id` | Producto del catálogo base |
| `component_type` | `String` | `SABOR`, `RECIPIENTE`, `EXTRA`, `BEBIDA_BASE` |
| `max_scoops` | `Integer nullable` | Máximo de bolas (solo RECIPIENTE) |
| `base_price` | `Float nullable` | Precio base del recipiente |
| `is_available` | `Boolean default True` | Disponibilidad (botón AGOTAR SABOR) |
| `position` | `Integer default 0` | Orden de visualización |

### 3.2 Tabla `ticket_item_components`

Registra los componentes individuales de cada helado vendido (qué sabores, qué recipiente, qué extras).

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | `Integer PK` | Autoincremental |
| `ticket_item_id` | `FK → ticket_items.id` | Item del ticket padre |
| `component_product_id` | `FK → products.id` | Producto componente (sabor, recipiente, etc.) |
| `component_type` | `String` | `SABOR`, `RECIPIENTE`, `EXTRA` |
| `quantity` | `Integer default 1` | Cantidad del componente |
| `unit_price` | `Float` | Precio unitario al momento de la venta |

### 3.3 Columnas agregadas a `tickets`

| Campo | Tipo | Descripción |
|---|---|---|
| `channel` | `String nullable` | `'PANADERIA'` o `'HELADERIA'` (NULL = PANADERIA) |
| `preparation_station` | `String nullable` | `'HELADOS'` o `'MALTEADAS'` (para KDS) |

### 3.4 Columnas agregadas a `ticket_items`

| Campo | Tipo | Descripción |
|---|---|---|
| `item_status` | `String default 'PENDING'` | Estado KDS: `PENDING` → `IN_PROGRESS` → `READY` |
| `station` | `String nullable` | Estación de preparación asignada |
| `component_summary` | `String nullable` | Resumen legible (ej. "Vaso Mediano: Chocolate, Vainilla + Granillo") |

### 3.5 Diagrama de Relaciones

```
products ──────────────────── heladeria_product_config
    │                              (1:1 extensión)
    │
    ├── ticket_items ──────── ticket_item_components
    │       │                     (1:N componentes)
    │       │
    │       └── item_status, station, component_summary
    │
    └── tickets
            └── channel, preparation_station
```

---

## 4. API ENDPOINTS

Prefijo: `/api/v1/heladeria`

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/menu` | Menú completo agrupado por component_type (SABOR, RECIPIENTE, EXTRA, BEBIDA_BASE) |
| `PUT` | `/toggle-availability/{product_id}` | Alterna disponibilidad (botón AGOTAR SABOR) |
| `GET` | `/kds/{station}/orders` | Pedidos pendientes para estación KDS (HELADOS o MALTEADAS) |
| `PUT` | `/kds/item/{item_id}/status` | Actualizar estado KDS (PENDING → IN_PROGRESS → READY) |
| `GET` | `/display/flavors` | Sabores disponibles para display público |
| `GET` | `/display/menu` | Menú formateado para pantalla de precios |

### Respuesta de `/menu`

```json
{
    "groups": [
        {
            "component_type": "SABOR",
            "items": [
                {
                    "product_id": 150,
                    "name": "Chocolate",
                    "price": 40.0,
                    "is_available": true,
                    "position": 1,
                    "image_url": null
                }
            ]
        },
        {
            "component_type": "RECIPIENTE",
            "items": [...]
        }
    ],
    "total_items": 29
}
```

---

## 5. FRONTEND: ARQUITECTURA DE ARCHIVOS

### 5.1 Servicios (capa de datos)

| Archivo | Responsabilidad |
|---|---|
| `services/heladeriaService.js` | Cliente HTTP con `withRetries` para todos los endpoints. Usa `CONFIG.API_BASE_URL` |
| `services/heladeriaOfflineStore.js` | Cache offline con IndexedDB. Stores: `heladeria-menu`, `heladeria-pending-ops` |
| `services/heladeriaTerminals.js` | Lock de terminales heladería (`H1`, `H2`, `H-CAJA`). Previene uso simultáneo |

### 5.2 Hooks (lógica de estado)

| Archivo | Responsabilidad |
|---|---|
| `hooks/useHeladeriaMenu.js` | Carga menú offline-first (IndexedDB → API → fallback cache). Auto-refresh cada 60s |
| `hooks/useQuickBuilder.js` | Máquina de estado para armado rápido de helados (recipiente → sabores → extras → confirmar) |
| `hooks/useHeladeriaCart.js` | Carrito: agrega items, calcula total, envía a API de tickets con `channel='HELADERIA'` |

### 5.3 Componentes (UI reutilizable)

| Archivo | Responsabilidad |
|---|---|
| `components/FlavorGrid.jsx` | Grid de sabores con colores semánticos y badge de disponibilidad |
| `components/QuickIceCreamPanel.jsx` | Panel de armado rápido con pasos guiados |
| `components/HeladeriaTicketPanel.jsx` | Panel de ticket (lista de items, total, botón cobrar) |
| `components/FlavorAvailabilityToggle.jsx` | Botón AGOTAR SABOR (toggle con confirmación) |

### 5.4 Secciones (pantallas completas)

| Archivo | Responsabilidad |
|---|---|
| `sections/PosHeladeriaUI.jsx` | Orquestador POS: layout 3 columnas (recipientes, sabores+extras, ticket) |
| `sections/KdsHeladosUI.jsx` | KDS estación HELADOS: polling 5s, estados con colores, botones Preparar/Listo |
| `sections/KdsMalteadasUI.jsx` | KDS estación MALTEADAS: misma lógica, esquema de color púrpura |
| `sections/TiendaInteractivaUI.jsx` | Placeholder "Próximamente" (Oleada 2) |
| `sections/DisplayTotemUI.jsx` | Placeholder "Próximamente" (Oleada 2) |
| `sections/DisplayPreciosUI.jsx` | Placeholder "Próximamente" (Oleada 2) |

---

## 6. FLUJO DE DATOS: VENTA DE HELADO

```
1. CAJERO abre POS Heladería
         │
2. Selecciona RECIPIENTE (ej. Vaso Mediano, 2 bolas, $80)
         │
3. Selecciona SABORES (ej. Chocolate + Vainilla)
         │
4. Opcionalmente agrega EXTRAS (ej. Granillo $10)
         │
5. Click "Agregar al Ticket"
         │
6. useQuickBuilder.js calcula precio:
   │  base_price del recipiente ($80)
   │  + extras ($10)
   │  = $90 total del item
         │
7. useHeladeriaCart.js agrega item al carrito
         │
8. Click "Cobrar"
         │
9. POST /api/v1/pos/tickets  ←── MISMA API que panadería
   │  payload incluye:
   │  - channel: "HELADERIA"
   │  - preparation_station: "HELADOS"
   │  - items[].component_summary: "Vaso Mediano: Chocolate, Vainilla + Granillo"
         │
10. Ticket aparece en KDS Helados (polling 5s)
         │
11. Preparador marca PENDING → IN_PROGRESS → READY
         │
12. Ticket aparece en Reporte Diario bajo canal HELADERÍA
```

---

## 7. REGLAS DE NEGOCIO

### 7.1 Disponibilidad de Sabores

- Un sabor puede ser marcado como **AGOTADO** desde el POS Heladería (botón AGOTAR SABOR).
- El toggle es instantáneo (`PUT /heladeria/toggle-availability/{id}`).
- Sabores agotados **no aparecen** en los displays públicos (`/display/flavors`).
- Sabores agotados **sí aparecen** en el POS (con indicador visual) para que el cajero sepa que están agotados sin tener que memorizarlo.

### 7.2 Precio de un Helado

```
Precio = base_price del RECIPIENTE + Σ(precio de cada EXTRA)
```

Los SABORES no tienen precio adicional — están incluidos en el precio del recipiente. El recipiente define cuántas bolas se permiten (`max_scoops`).

### 7.3 Estaciones KDS

| Estación | Pantalla | Productos |
|---|---|---|
| `HELADOS` | KDS Helados (teal) | Helados en vaso, cono, banana split |
| `MALTEADAS` | KDS Malteadas (púrpura) | Malteadas, aguas frescas |

### 7.4 Terminales

| Terminal ID | Uso |
|---|---|
| `H1` | Tablet mostrador heladería #1 |
| `H2` | Tablet mostrador heladería #2 |
| `H-CAJA` | Caja registradora heladería |

---

## 8. INTEGRACIÓN CON OTROS MÓDULOS

### 8.1 Con POS Panadería
- **Ninguna dependencia directa.** Comparten la misma API de tickets (`/pos/tickets`) pero se separan por `channel`.
- Si heladería se cae, panadería NO se afecta (garantizado por React.lazy + ErrorBoundary).

### 8.2 Con Auditoría y Control
- La pestaña **📊 Reporte Diario** muestra las ventas de heladería separadas en su propia tarjeta.
- El campo `channel` determina la agrupación: `NULL`/`'PANADERIA'` → 🍞 Panadería, `'HELADERIA'` → 🍦 Heladería.

### 8.3 Con Cortes de Caja
- Los tickets de heladería se vinculan a la sesión de caja activa al momento del cobro (`cash_session_id`).
- Los cortes de caja **no distinguen** entre canales — suman todo lo cobrado en esa terminal.

### 8.4 Con Almacenes (Futuro — Plan V6)
- El outbox pattern generará `WarehouseEvent` para tickets de heladería igual que para panadería.
- Se necesitarán almacenes tipo CONGELADO para stock de helados.

---

## 9. DATOS SEED

Script: `apps/api/migrations/seed_heladeria_data.py`

| Tipo | Cantidad | Ejemplos |
|---|---|---|
| **Sabores** | 14 | Chocolate, Vainilla, Fresa, Cookies & Cream, Pistache, Queso con Zarzamora... |
| **Recipientes** | 7 | Vaso Chico (1 bola), Vaso Mediano (2), Cono Waffle (2), Banana Split (3)... |
| **Extras** | 6 | Chocolate Duro, Granillo, Gomitas, Nuez Picada, Crema Batida... |
| **Bebidas** | 2 | Malteada Chica, Malteada Grande |

> [!NOTE]
> El script es **idempotente** — puede ejecutarse múltiples veces sin duplicar datos. Usa el campo `sku` como clave de unicidad.

> [!WARNING]
> El script requiere importar **TODOS** los modelos del ERP para resolver la cadena de relaciones de SQLAlchemy. Si se agregan nuevos modelos con relaciones, el script puede fallar con `KeyError: 'NuevoModelo'`. Solución: agregar el import del nuevo modelo al script.

---

## 10. DECISIONES DE NEGOCIO (Registro Histórico)

Estas decisiones fueron tomadas entre el dueño y el equipo técnico durante la fase de diseño:

| # | Pregunta | Resolución | Decidido por |
|---|---|---|---|
| 1 | ¿Quién toca la pantalla? | **Dos interfaces:** POS Heladería (empleado) + Tienda Interactiva (cliente) | Dueño |
| 2 | ¿Tablas nuevas o reutilizar Ticket? | **Reutilizar `Ticket` + `TicketItem`** con campo `channel`. Solo 2 tablas nuevas | Auditoría |
| 3 | ¿Nombre del integrante? | **Opcional.** Campo libre, se puede saltar | Dueño |
| 4 | ¿Cómo agotar un sabor? | **Botón "AGOTAR" en POS Heladería**, toggle instantáneo | Dueño |
| 5 | ¿Soporte offline? | **Obligatorio.** Cache de menú + cola de sync | Auditoría |
| 6 | ¿URLs del API? | **Solo via `CONFIG.API_BASE_URL`** — prohibido construir manual | Auditoría |
| 7 | ¿Retries de red? | **`withRetries` obligatorio** en todas las operaciones | Auditoría |
| 8 | ¿Terminales separados? | **Namespace `H-`** (H1, H2, H-CAJA) en misma tabla `terminal_locks` | Auditoría |
| 9 | ¿Prioridad? | **MVP primero** (POS + KDS + Reporte), luego Tienda + Displays | Dueño |
| 10 | ¿Estética? | **Häagen-Dazs premium.** Dark mode, rosa/violeta/crema, Playfair Display | Dueño |
| 11 | ¿Cortes de caja? | **Independientes por terminal/cajero.** Cada uno cierra su turno | Confirmado |
| 12 | ¿Reporte consolidado? | **Nueva pestaña en Auditoría y Control** — vista de solo lectura por fecha | Dueño |
| 13 | ¿Cierre ciego? | **Diferido** — se implementa después del MVP | Dueño |
| 14 | ¿Día operativo? | **Diferido** — se implementa si hay operación nocturna | Dueño |
| 15 | ¿Tienda Interactiva puede cobrar? | **NO.** Solo genera pre-comandas (PENDING). Un cajero las cobra | Confirmado |
| 16 | ¿Aislamiento de módulos? | **`React.lazy()` + `ErrorBoundary`** — si heladería se cae, el POS sigue | Auditoría |

---

## 11. DECISIONES TÉCNICAS

| Decisión | Razón |
|---|---|
| **Reusar tabla `tickets`** en lugar de crear tabla propia | Permite que cortes de caja, auditoría y reportes funcionen sin modificación |
| **Campo `channel` nullable** | Retrocompatibilidad: tickets existentes (pre-heladería) siguen funcionando como `PANADERIA` |
| **React.lazy() doble barrera** | Aislamiento de fallos: heladería nunca puede tumbar panadería |
| **Polling 5s en KDS** (no WebSocket) | Simplicidad. WebSocket es mejora de Oleada 2 |
| **IndexedDB para offline** | Patrón ya probado en el POS. Permite operar sin red y sincronizar después |
| **`CONFIG.API_BASE_URL`** | Prohibido `window.location.hostname`. Todas las URLs centralizadas |
| **Precio = recipiente + extras** (sabores incluidos) | Modelo de precios simple y predecible para el cajero |

---

## 12. EL CEMENTERIO DE BUGS

> Sección reservada para documentar bugs críticos descubiertos en producción.
> Formato: mismo que la Documentación de Auditoría (Síntoma → Causa Raíz → Solución → Regla de Oro).

### Estado actual: 🟢 Sin bugs reportados

El módulo fue implementado el 2026-09-07 y aún no ha entrado en operación con clientes reales. Los bugs se documentarán aquí conforme se presenten.

---

## 13. PRÓXIMOS PASOS (OLEADA 2)

| Feature | Prioridad | Dependencia |
|---|---|---|
| **Checkout integrado** | 🔴 Alta | Módulo de caja existente |
| **Tienda Interactiva** | 🟡 Media | Diseño UX para cliente/tótem |
| **Display Precios** | 🟡 Media | Endpoint `/display/menu` ya existe |
| **Display Tótem** | 🟢 Baja | Contenido visual por definir |
| **WebSocket KDS** | 🟢 Baja | Reemplazar polling 5s |
| **Integración Almacenes** | 🟡 Media | Plan Almacenes V6 |
