# 🍦 DOCUMENTACIÓN MAESTRA: MÓDULO DE HELADERÍA — R de Rico ERP

> **⚠️ LECTURA OBLIGATORIA.** Cualquier IA o desarrollador que necesite interactuar, depurar o extender el Módulo de Heladería **DEBE** leer este documento. Aquí se detalla la arquitectura, el flujo de datos, las reglas de negocio y las decisiones técnicas del módulo.
>
> **Última actualización:** 2026-09-14 (Hub Editorial B&W + Branding Editable + Permiso `editar_ui_heladeria`)
> **Archivos gobernados:**
> - Backend: `apps/api/modules/heladeria/*` (models, schemas, service, router)
> - Frontend: `apps/heladeria/*` (Hub, secciones, hooks, services, components)
> - Integración: `apps/ExperimentCenterUI.jsx`, `apps/AuditoriaControlUI.jsx`

---

## 1. PROPÓSITO DEL MÓDULO

El Módulo de Heladería extiende el ERP R de Rico para gestionar la operación de una **heladería artesanal de alta gama** (estilo Häagen-Dazs / Amorino) dentro de la misma sucursal que la panadería. El módulo opera de forma **totalmente aislada** del POS de panadería: si heladería se cae, la panadería sigue funcionando sin afectación.

### Capacidades
- **POS Heladería** — Punto de venta rápido para el personal de mostrador
- **KDS Helados** — Pantalla de preparación para estación de helados (con urgencia visual V15)
- **KDS Malteadas** — Pantalla de preparación para estación de malteadas/aguas frescas (con urgencia visual V15)
- **Tienda Interactiva** — 🟢 Interfaz táctil para clientes en mostrador (V14)
- **Display Tótem** — 🟢 Contenido visual para atraer clientes (V16)
- **Display Precios** — 🟢 Menú digital con precios en tiempo real (V17)
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
│   │      (Landing editorial B&W — branding editable)          │     │
│   │                                                           │     │
│   │   Nivel 1: Landing con 3 Gestores                         │     │
│   │   ┌────────────────┬────────────────┬──────────────────┐  │     │
│   │   │ 01 Gestor POS  │ 02 Gestor KDS  │ 03 Gestor Display│  │     │
│   │   └───────┬────────┴───────┬────────┴───────┬──────────┘  │     │
│   │           │                │                │             │     │
│   │   Nivel 2: Sub-suite (GestorSuiteUI)                      │     │
│   │   ┌───────┴──────┐ ┌──────┴───────┐ ┌──────┴───────┐     │     │
│   │   │POS    Tienda │ │KDS     KDS   │ │Tótem  Precios│     │     │
│   │   │Helad. Interac│ │Helados Malte.│ │Display Display│     │     │
│   │   └──────────────┘ └──────────────┘ └──────────────┘     │     │
│   │                                                           │     │
│   │   Nivel 3: Herramienta real (React.lazy + ErrorBoundary)  │     │
│   └───────────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.1.1 Navegación de 3 Niveles

El Hub implementa una navegación jerárquica de 3 niveles:

| Nivel | Componente | Descripción |
|---|---|---|
| **1 — Landing** | `HeladeriaHubUI` | 3 tarjetas de gestores con branding editable en el encabezado |
| **2 — Sub-suite** | `GestorSuiteUI` | 2 herramientas por gestor, con botón "← Volver" |
| **3 — Herramienta** | `React.lazy(Sección)` | La sección real (POS, KDS, Display, etc.) |

### 2.1.2 Los 3 Gestores

| Gestor | ID | Herramientas |
|---|---|---|
| **Gestor de Puntos de Venta** | `gestor_pos` | POS Heladería + Tienda Interactiva |
| **Gestor de KDS** | `gestor_kds` | KDS Helados + KDS Malteadas |
| **Gestor de Displays** | `gestor_displays` | Display Tótem + Display Precios |

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
| `PATCH` | `/availability/{config_id}` | Alterna disponibilidad (botón AGOTAR SABOR) |
| `GET` | `/kds/{station}` | Pedidos pendientes para estación KDS (HELADOS o MALTEADAS) |
| `PATCH` | `/kds/items/{item_id}/status` | Actualizar estado KDS (PENDING → IN_PROGRESS → READY) |
| `GET` | `/display/flavors` | Sabores disponibles para display público |
| `GET` | `/display/menu` | Menú formateado para pantalla de precios. **Agrupa por `component_type`** (RECIPIENTE, TAMAÑO, SABOR, EXTRA, BEBIDA_BASE). `price` llega como **NÚMERO** (ej. `65.0`), no como string |
| `POST` | `/totem/upload` | **(V16 Fase 16.2)** Sube una imagen del tótem (`multipart/form-data`, campo `file`). Valida MIME (JPEG/PNG/WebP), peso (≤ 8 MB) y no-vacío. Devuelve `{ filename, url }` |
| `DELETE` | `/totem/upload/{filename}` | **(V16 Fase 16.2)** Borra una imagen del tótem. Devuelve `{ deleted, filename }` |

### Branding Editable (Encabezado del Hub)

El nombre y eslogan del módulo viven en `system_settings` bajo la clave `heladeria_branding`:

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/settings/` | Devuelve TODAS las settings; el frontend extrae la clave `heladeria_branding` |
| `PATCH` | `/settings/heladeria_branding` | Guarda nombre y eslogan. Body: `{ "value": "<json string>" }` |
| `POST` | `/settings/seed` | Siembra la clave si no existe (idempotente). **El frontend llama auto-seed si PATCH devuelve 404** |

Forma del `value` (JSON serializado):

```json
{
    "nombre": "Heladería\nR de Rico.",
    "eslogan": "Haciendo tu vida más dulce."
}
```

- `nombre`: el salto de línea `\n` se renderiza como `<br />` en el encabezado.
- `eslogan`: se muestra como subtítulo bajo el nombre.
- **Permiso requerido:** `editar_ui_heladeria` o `all = "full"` (Master Access).

### Configuración del Display (V17)

La configuración de presentación del Display de Precios vive en `system_settings`
bajo la clave `heladeria_display_precios_config` (prefijo `/api/v1/settings`):

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/settings/` | Devuelve TODAS las settings; el frontend extrae la clave del Display |
| `PATCH` | `/settings/heladeria_display_precios_config` | Guarda la configuración. Body: `{ "value": "<json string>" }`. **El PUT NO existe** (devuelve 405) |
| `POST` | `/settings/seed` | Siembra las claves faltantes (idempotente). Reparación si la clave no existe |

Forma del `value` (JSON serializado):

```json
{
    "groups": [],
    "columns": 3,
    "theme": "LIGHT",
    "showImages": true,
    "showUnavailable": true
}
```

- `groups: []` ⇒ mostrar **todos** los grupos. Con valores ⇒ solo esos `component_type`.
- `columns`: entero 1–6.
- `theme`: `LIGHT` | `DARK`.
- `showUnavailable: false` ⇒ oculta productos agotados.

### Configuración del Tótem (V16)

El manifiesto de contenido del Display Tótem vive en `system_settings` bajo la
clave `heladeria_totem_content` (prefijo `/api/v1/settings`):

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/settings/` | Devuelve TODAS las settings; el frontend extrae la clave del Tótem |
| `PATCH` | `/settings/heladeria_totem_content` | Guarda el manifiesto. Body: `{ "value": "<json string>" }`. **El PUT NO existe** |
| `POST` | `/settings/seed` | Siembra las claves faltantes (idempotente) |

Las imágenes se sirven desde el montaje estático **ADITIVO** `/media/totem/<filename>`
(no altera los montajes que consume el POS de Panadería).

Forma del `value` (JSON serializado):

```json
{
    "macros": [ { "id": "macro_1", "filename": "x.png", "url": "/media/totem/x.png", "label": "Cono", "accentColor": "#fbbf24" } ],
    "heroes": [ { "id": "hero_1", "filename": "y.png", "url": "/media/totem/y.png", "label": "R de Rico", "accentColor": "#fbbf24" } ],
    "config": {
        "macroCount": 3,
        "macroDurationSec": 4,
        "heroDurationSec": 6,
        "transition": "fade",
        "transitionMs": 800,
        "format": "vertical",
        "accentColor": "#fbbf24"
    }
}
```

- `macroCount`: entero 1–10 (tomas macro antes de cada hero).
- `macroDurationSec` / `heroDurationSec`: entero 1–15.
- `transition`: `fade` | `slide` | `zoom` (transiciones **FINITAS**).
- `transitionMs`: entero 200–2000.
- `format`: `vertical` | `horizontal`.
- `accentColor`: `#rrggbb`.

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

### 5.0 Utilidades puras (lógica sin React/DOM/fetch)

| Archivo | Responsabilidad |
|---|---|
| `utils/kdsUrgency.js` | **(V15 Fase 15.1)** Guardián del contrato de urgencia del KDS. Lógica **pura** (no importa React, no toca el DOM, no hace `fetch`). Exporta `URGENCY_LEVELS` (NORMAL/WARNING/CRITICAL), `DEFAULT_URGENCY_THRESHOLDS` (`{warningSec:180, criticalSec:420}`), `DEFAULT_TZ_OFFSET_HOURS` (0), `normalizeTzOffset()`, `normalizeThresholds()`, `computeElapsedSec()`, `classifyUrgency()`, `urgencyColor()`, `formatElapsed()`, `sortOrdersByUrgency()` y `countByUrgency()`. **Solo color, nunca animación** (Incidente 16.1). 25 tests |
| `utils/kdsUrgency.test.js` | **(V15 Fase 15.1)** 25 tests de `kdsUrgency.js`, incluyendo guardianes: `urgencyColor()` no devuelve claves de animación y `sortOrdersByUrgency()` no muta la entrada |

### 5.1 Servicios (capa de datos)

| Archivo | Responsabilidad |
|---|---|
| `services/heladeriaService.js` | Cliente HTTP con `withRetries` para todos los endpoints. Usa `CONFIG.API_BASE_URL`. **(V15 Fase 15.4)** añade `getKdsUrgencyConfig()` (GET `/settings/heladeria_kds_urgency_config`, parsea el `value` JSON y devuelve `null` ante JSON corrupto para que el componente caiga a defaults) |
| `services/heladeriaOfflineStore.js` | Cache offline con IndexedDB (`heladeria_offline` v1). Stores: `menu_cache` (TTL 30 min) y `sync_queue` (operaciones PENDING). Expone `enqueueOperation()` / `getPendingOperations()` / `markOperationDone()`. **(V17 Fase 17.3)** añade `cacheDisplayMenu()` / `getCachedDisplayMenu()` (TTL **24 h**, clave `'display_menu'` en el MISMO store `menu_cache`, sin subir `DB_VERSION`), `getDisplayMenuCacheAge()` y `clearDisplayMenuCache()` |
| `services/heladeriaTerminals.js` | Lock de terminales heladería (`H1`, `H2`, `H-CAJA`). Usa los endpoints reales `POST /pos/terminals/{id}/lock`, `POST /pos/terminals/{id}/unlock` y `GET /pos/terminals/status` (FASE 0) |
| `services/displayConfigService.js` | **(V17 Fase 17.2)** Cliente HTTP de la configuración del Display. `fetchDisplayConfig()` (GET `/settings/` + extrae la clave), `saveDisplayConfig()` (**PATCH** `/settings/heladeria_display_precios_config` — el PUT NO existe), `seedDisplayConfig()` (POST `/settings/seed`) y `loadDisplayConfig()` (auto-reparación: si la clave no existe, siembra y reintenta; ante error devuelve defaults) |
| `services/totemContentService.js` | **(V16 Fase 16.3)** Cliente HTTP del manifiesto del Tótem. `getManifest()` (GET `/settings/` + parsea la clave `heladeria_totem_content`), `saveManifest()` (**PATCH** `/settings/heladeria_totem_content`), `uploadImage()` (POST `/heladeria/totem/upload` con `FormData`), `deleteImage()` (DELETE `/heladeria/totem/upload/{filename}`) y `resolveImageUrl()` |

### 5.2 Hooks (lógica de estado)

| Archivo | Responsabilidad |
|---|---|
| `hooks/useHeladeriaMenu.js` | Carga menú offline-first (IndexedDB → API → fallback cache). Auto-refresh cada 60s |
| `hooks/useQuickBuilder.js` | Máquina de estado para armado rápido de helados (recipiente → sabores → extras → confirmar) |
| `hooks/useHeladeriaCart.js` | Carrito: agrega items, calcula total, envía a API de tickets con `channel='HELADERIA'` |
| `hooks/useTiendaCajaMode.js` | **(V14 Fase 14.3)** Switch Kiosco/Caja de la Tienda. Persiste en `sessionStorage` (clave `heladeria_tienda_caja_mode`). **NO toca `terminal_locks`** |
| `hooks/usePreComanda.js` | **(V14 Fase 14.4)** Envía la pre-comanda (reserve atómico + `items/add`), cancela vía `items/remove` y **encola offline real** con `enqueueOperation()` |

### 5.3 Componentes (UI reutilizable)

| Archivo | Responsabilidad |
|---|---|
| `components/FlavorGrid.jsx` | Grid de sabores con colores semánticos y badge de disponibilidad |
| `components/QuickIceCreamPanel.jsx` | Panel de armado rápido con pasos guiados |
| `components/HeladeriaTicketPanel.jsx` | Panel de ticket (lista de items, total, botón cobrar) |
| `components/FlavorAvailabilityToggle.jsx` | Botón AGOTAR SABOR (toggle con confirmación) |
| `components/DisplayConfigPanel.jsx` | **(V17 Fase 17.2)** Panel de administración del Display: selección de grupos, columnas (1–6), tema (LIGHT/DARK), mostrar imágenes, mostrar agotados. Persiste vía PATCH. Sin animaciones infinitas |

### 5.4 Secciones (pantallas completas)

| Archivo | Responsabilidad |
|---|---|
| `sections/PosHeladeriaUI.jsx` | Orquestador POS: layout 3 columnas (recipientes, sabores+extras, ticket) |
| `sections/KdsHeladosUI.jsx` | KDS estación HELADOS: polling 5s, estados con colores, botones Preparar/Listo. **(V15 Fase 15.3)** urgencia visual: reloj propio de 1 s (separado del polling de 5 s), borde izquierdo por nivel, badge `⏱` de tiempo transcurrido y contador NORMAL/atención/crítico en el header. **Solo color, sin animación** |
| `sections/KdsMalteadasUI.jsx` | KDS estación MALTEADAS: mismo patrón de urgencia que Helados (V15 Fase 15.3), preservando sus diferencias deliberadas: PENDING en púrpura y sin `customer_group_name` / `recipient_name` / `components` |
| `sections/TiendaInteractivaUI.jsx` | 🟢 **Funcional (V14)**. Monta `TiendaConfigurator` (doble columna) cableado a `usePreComanda`. Sin animaciones infinitas |
| `sections/DisplayTotemUI.jsx` | 🟢 **Funcional (V16)**. Doble landing: sin parámetro → panel de administración del manifiesto; `?mode=output` → kiosco fullscreen con secuencia macro/hero. Transiciones **finitas** (Incidente 16.1) |
| `sections/DisplayPreciosUI.jsx` | 🟢 **Funcional (V17)**. Doble landing: sin parámetro → panel de administración (`DisplayConfigPanel` + utilidades de caché); `?mode=output` → `DisplayPreciosOutput` (kiosco fullscreen). Se eliminó la animación `float` infinita del placeholder (Incident 16.1) |
| `sections/DisplayPreciosOutput.jsx` | **(V17 Fase 17.3)** Pantalla de precios para clientes. Offline-first (red → caché 24 h → estado vacío), refresco cada 5 min, temas LIGHT/DARK, grid de columnas configurable. Sin animaciones infinitas |

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

### 6.1 Flujo de la PRE-COMANDA (Tienda Interactiva — V14)

```
CLIENTE (kiosco)
      │
      ▼
TiendaConfigurator.jsx  ──►  tiendaConfigurator.js (PURA)
   (doble columna)            buildPreComandaPayload(state, menu)
      │                       └─ component_type vía STEP_TO_COMPONENT_TYPE
      │                          (base→RECIPIENTE, tamano→TAMAÑO,
      │                           sabores→SABOR, toppings/extras→EXTRA)
      ▼
usePreComanda.js
      │
      ├── ¿navigator.onLine? ── NO ──► heladeriaOfflineStore.enqueueOperation()
      │                                  (sync_queue, status=PENDING)
      │                                  └─ se reintenta al recuperar red
      │
      ▼ SÍ
heladeriaService.createHeladeriaTicket()
      │  POST /pos/tickets/reserve
      │  body: { terminal_id, captured_by_id, channel: 'HELADERIA' }
      │  └─► CANAL ATÓMICO: el ticket nace con channel='HELADERIA'
      │      en el MISMO INSERT. NUNCA existe con channel=NULL.
      ▼
heladeriaService.addItemToTicket()
      │  POST /pos/tickets/items/add
      │  body: { account_num, product_id (RECIPIENTE), quantity, ... }
      ▼
Ticket en BD (channel='HELADERIA')
      │
      ▼
KDS Helados (polling 5s)  ──►  Preparador: PENDING → IN_PROGRESS → READY
```

**Cancelación:** NO existe endpoint `cancel`. `usePreComanda.cancelarPreComanda()`
vacía el ticket con `DELETE /pos/tickets/items/remove`; al quedar sin items, el
GC de tickets lo reclama.

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

## 7.5 Branding Editable del Encabezado

- El nombre de la heladería y el eslogan se guardan en `system_settings` (clave `heladeria_branding`) y se cargan al montar el Hub.
- Solo los usuarios con el permiso `editar_ui_heladeria` (o `all = "full"`) ven el botón ✏️ en la esquina superior derecha del encabezado.
- Al hacer clic, se abre un modal (`BrandingEditorModal`) que permite editar ambos campos. Los cambios se guardan con PATCH y se reflejan inmediatamente.
- Si la clave no existe en la BD (primer uso), el frontend llama automáticamente a `POST /settings/seed` y reintenta.
- **Permiso:** Se configura desde **Seguridad y Acceso → Gestión de Perfiles** → casilla **"Editar UI de Heladería"** (`editar_ui_heladeria`).

### Estética: Editorial B&W

El Hub utiliza una estética **editorial blanco y negro** (tipo revista de moda):

| Elemento | Valor |
|---|---|
| Fondo | `#ffffff` (blanco puro) |
| Texto principal | `#0f0f0f` (negro casi puro) |
| Subtítulos | `#6b7280` (gris medio) |
| Divisores | `1px solid #0f0f0f` (líneas editoriales) |
| Tipografía | Inter, peso 900 (ultra-bold) |
| Hover de tarjetas | Inversión completa (fondo negro, texto blanco) |
| Animaciones | Solo transición de color/fondo (0.15s ease). **Sin animaciones infinitas** |


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

### 8.5 Con Gestión de Perfiles
- El permiso `editar_ui_heladeria` se registra en `SYSTEM_MODULES` de [`PerfilesAccessSuite.jsx`](apps/auth/PerfilesAccessSuite.jsx) con ícono `🍦✏️`.
- `ExperimentCenterUI.jsx` pasa `userPermissions` al `HeladeriaHubUI` para la validación del botón de edición.
- El chequeo sigue el patrón estándar: `userPermissions?.editar_ui_heladeria === 'full' || userPermissions?.all === 'full'`.

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
| **(V18 Fase 18.1) Normalizar timestamps en serialización, no en la columna** | `core/serialization.py::iso_utc()` añade `Z` a los naive. Evita una migración de alto riesgo sobre `tickets` (compartida con el POS IA) y unifica el contrato con el POS (v12 Fase 12.4) |
| **Branding en `system_settings`** (no hardcodeado) | El nombre y eslogan del Hub son editables sin tocar código. El frontend carga defaults si la clave no existe |
| **Auto-seed en 404** | Si el PATCH de branding devuelve 404, el frontend llama automáticamente a `POST /settings/seed` y reintenta. Elimina la dependencia de reiniciar el API manualmente |
| **Permiso `editar_ui_heladeria` como permiso de función** | Sigue el patrón existente de `editar_info_negocio`: un permiso granular que controla un botón específico, no un módulo completo |

---

## 12. EL CEMENTERIO DE BUGS

> Sección reservada para documentar bugs críticos descubiertos en producción.
> Formato: mismo que la Documentación de Auditoría (Síntoma → Causa Raíz → Solución → Regla de Oro).

### 🐛 BUG 1: `heladeriaTerminals.js` llamaba 3 endpoints inexistentes (FASE 0)

**Síntoma:** El lock de terminales de heladería nunca funcionaba; las llamadas devolvían 404 silencioso.

**Causa Raíz:** El módulo invocaba `POST /pos/terminal-lock`, `DELETE /pos/terminal-lock/{id}` y `GET /pos/terminal-locks`, rutas que **no existen** en [`pos/router.py`](apps/api/modules/pos/router.py:1). Las reales son `POST /pos/terminals/{id}/lock`, `POST /pos/terminals/{id}/unlock` y `GET /pos/terminals/status`. Además, `GET /terminals/status` devuelve un **MAPA** (`{terminal_id: {...}}`), no una lista.

**Solución:** Se reescribieron las 3 funciones contra los endpoints reales y `getAllLocks()` normaliza el mapa a un arreglo filtrando terminales `H*`.

**Regla de Oro:** *Nunca asumir la forma de un endpoint: leer el router del backend antes de consumirlo.*

### 🐛 BUG 2: Ticket de Heladería nacía con `channel=NULL` y aparecía en el POS de Panadería (V14 Fase 14.4)

**Síntoma:** Pre-comandas de la Tienda Interactiva aparecían en el POS de Panadería.

**Causa Raíz:** `createHeladeriaTicket()` hacía **dos requests secuenciales**: `reserve` (sin `channel`) y luego un `PUT` para setear `channel='HELADERIA'`. **El `PUT` no verificaba `res.ok`.** Si fallaba (red, timeout, 500), el ticket quedaba con `channel=NULL` → visible en Panadería.

**Solución (Opción 2 — canal atómico):** Se añadió `channel: Optional[str] = None` a `ReserveTicketRequest` (aditivo y `NULL`-able, **no viola la Restricción A**) y se propaga al `INSERT` de la reserva. El `PUT` **desapareció**: el ticket **nunca existe con `channel=NULL`**. Mitigado con el test de contrato [`tiendaContract.test.js`](apps/heladeria/utils/tiendaContract.test.js:1).

**Regla de Oro:** *Un dato crítico de enrutamiento (el canal) debe nacer en el MISMO `INSERT`, nunca en un segundo request no verificado.*

### 🐛 BUG 3: `created_at` es **naive local**, no UTC (V15 Fase 15.1)

**Síntoma:** Al calcular la urgencia del KDS con `Date.parse(order.created_at)`, los pedidos aparecían con **6 horas de antigüedad** (o negativos) apenas se creaban, marcando todo como CRÍTICO de inmediato.

**Causa Raíz:** [`pos/models.py:34`](apps/api/modules/pos/models.py:34) define `created_at = Column(DateTime, default=datetime.now)` — **sin `timezone=True`** — por lo que el valor es **hora local naive**. [`heladeria/service.py:179`](apps/api/modules/heladeria/service.py:179) lo serializa con `.isoformat()` **sin sufijo `Z` ni offset**. `Date.parse()` de un string sin zona lo interpreta como **UTC**, introduciendo un desfase igual al offset local (CST México = 6 h). Además, `paid_at` es **siempre `None`** ([`service.py:180`](apps/api/modules/heladeria/service.py:180)), por lo que no sirve como referencia.

**Solución:** `computeElapsedSec(createdAtNaiveIso, serverOffsetHours, nowMs)` en [`kdsUrgency.js`](apps/heladeria/utils/kdsUrgency.js:1) reconstruye el instante UTC real: `createdUtcMs = Date.parse(raw + 'Z') - offset * 3600000`, y luego `elapsedSec = max(0, floor((now - createdUtcMs) / 1000))`. El offset se lee de `heladeria_kds_urgency_config.tzOffsetHours` (fallback `0`). El `max(0, …)` blinda contra relojes desfasados.

**Regla de Oro:** *Un `DateTime` sin `timezone=True` es hora local naive: NUNCA pasarlo a `Date.parse()` sin corregir el offset.*

### 🐛 BUG 4: La API serializaba `created_at` sin sufijo `Z` (V18 Fase 18.1)

**Síntoma:** El frontend del KDS necesitaba un parche frágil (`endsWith('Z')`) para interpretar `created_at` como UTC. El mismo problema ya había sido resuelto en el POS de Panadería (v12 Fase 12.4) con un helper local `_iso_utc()`, pero Heladería lo desconocía y duplicaba el parche.

**Causa Raíz:** El problema de BUG 3 **no es exclusivo de Heladería**: es **sistémico**. Conviven dos convenciones de timestamp en el backend:

| Convención | Módulos | Definición |
|---|---|---|
| ✅ Correcta | `hr`, `warehouse`, `security` | `DateTime(timezone=True)` + `server_default=func.now()` |
| ⚠️ Naive local | `pos`, `network`, `cash`, `grandeza`, `orders` | `DateTime(default=datetime.now)` |

[`pos/models.py:34`](apps/api/modules/pos/models.py:34) es naive. La solución del POS fue **normalizar en la capa de serialización**, NO migrar la columna: [`pos/router.py:215`](apps/api/modules/pos/router.py:215) define `_iso_utc()` (usado en la línea 306) que añade `Z` a los naive. Heladería serializaba con `.isoformat()` crudo.

**Solución (V18 Fase 18.1):** Se extrajo el helper a un módulo compartido [`core/serialization.py`](apps/api/core/serialization.py:1) (`iso_utc()`). Heladería lo usa en [`heladeria/service.py:180`](apps/api/modules/heladeria/service.py:180) (`created_at=iso_utc(ticket.created_at) or ""`). El POS **no se alteró**: [`pos/router.py:218`](apps/api/modules/pos/router.py:218) conserva el alias `from core.serialization import iso_utc as _iso_utc` (comportamiento idéntico). 8 tests en [`test_heladeria_serialization.py`](apps/api/tests/test_heladeria_serialization.py:1).

**Regla de Oro:** *Un datetime naive se asume UTC y SIEMPRE se serializa con sufijo `Z`. La normalización va en la capa de serialización, no en la columna (evita migraciones de alto riesgo).*

### Estado actual: 🟢 Sin bugs abiertos

El módulo fue implementado el 2026-09-07. Los bugs se documentan aquí conforme se presentan.

---

## 13. PRÓXIMOS PASOS

### ✅ Completado

| Feature | Plan | Estado |
|---|---|---|
| **Tienda Interactiva** | V14 (Fases 14.1–14.5) | 🟢 Funcional — configurador doble columna, switch Kiosco/Caja, pre-comanda con canal atómico + cola offline real |
| **Display Precios** | V17 (Fases 17.0–17.4) | 🟢 Funcional — doble landing (admin + kiosco `?mode=output`), config persistida en `system_settings`, offline-first con caché 24 h, `displayMappers.js` puro con 43 tests |
| **Display Tótem** | V16 (Fases 16.0–16.4) | 🟢 Funcional — doble landing (admin + kiosco `?mode=output`), manifiesto persistido en `system_settings` (`heladeria_totem_content`), subida/borrado de imágenes con validación de MIME + tamaño (8 MB), servido estático en `/media/totem/`, offline-first con caché en `localStorage`, `totemSequencer.js` puro con 36 tests. **Sin animaciones infinitas** (Incidente 16.1) |
| **KDS Inteligente** | V15 (Fases 15.1–15.5) | 🟢 Funcional — urgencia visual por color (NORMAL/WARNING/CRITICAL) en ambos KDS, umbrales configurables en `system_settings` (`heladeria_kds_urgency_config`), `kdsUrgency.js` puro con 25 tests. **Solo color, sin animación** (Incidente 16.1). El asistente de lotes se eliminó (D1: no existen alérgenos en el sistema) |
| **Contrato de serialización UTC** | V18 (Fase 18.1) | 🟢 Funcional — `core/serialization.py::iso_utc()` compartido con el POS. Heladería serializa `created_at` con sufijo `Z`; el POS conserva su alias `_iso_utc` sin cambios. 8 tests. Cierra BUG 4 |
| **Hub Editorial B&W** | — | 🟢 Funcional — Rediseño del Hub con estética editorial blanco y negro. Navegación de 3 niveles (Landing → Gestor → Herramienta). 3 gestores: POS, KDS, Displays |
| **Branding Editable** | — | 🟢 Funcional — Nombre y eslogan editables desde el Hub. Persistencia en `system_settings` (`heladeria_branding`). Botón ✏️ condicionado al permiso `editar_ui_heladeria`. Auto-seed si la clave no existe (manejo de 404) |

### Oleada 2 (pendiente de revisión)

| Feature | Prioridad | Dependencia |
|---|---|---|
| **Checkout integrado** | 🔴 Alta | Módulo de caja existente |
| **WebSocket KDS** | 🟢 Baja | Reemplazar polling 5s |
| **Integración Almacenes** | 🟡 Media | Plan Almacenes V6 |
