# 🛒 PLAN HELADERÍA V14 — TIENDA INTERACTIVA (Configurador Visual + Pre-Comanda)

**Fecha:** 2026-09-13
**Autor:** Roo (Ingeniería Senior)
**Estado:** 📋 Propuesto — Pendiente de aprobación
**Alcance:** Sección 1 del Hub de Heladería (`TiendaInteractivaUI.jsx`)
**Depende de:** ⚠️ **FASE 0 (Saneamiento de `heladeriaTerminals.js`)** — ver [`PLAN_HELADERIA_MAESTRO.md`](PLAN_HELADERIA_MAESTRO.md). El switch de caja (Fase 14.3) usa los locks de terminal, que hoy están rotos.
**Bloquea a:** Nada (V15 KDS consume las pre-comandas que este plan genera, pero no es requisito técnico)

---

## 🚨 PROTOCOLO DE NO-INTERFERENCIA AL POS

> **REGLA DE ORO:** El POS de Panadería (`RetailVisionPOS.jsx`) NO debe experimentar NINGUNA degradación, ni siquiera momentánea, durante la ejecución de este plan.

### Prohibiciones absolutas (heredadas del blindaje del POS)

1. **PROHIBIDO** modificar [`RetailVisionPOS.jsx`](apps/pos/RetailVisionPOS.jsx:1), [`POSService.js`](apps/pos/services/POSService.js:1), [`usePOSSession.js`](apps/pos/hooks/usePOSSession.js:1), [`useTicketActions.js`](apps/pos/hooks/useTicketActions.js:1) o cualquier hook del POS.
2. **PROHIBIDO** tocar [`config.js`](apps/pos/config.js:1) (`CONFIG.API_BASE_URL`). Es la ÚNICA fuente de verdad de URLs. Jamás construir URLs con `window.location.hostname + ':5001'`.
3. **PROHIBIDO** añadir `setInterval`, `setTimeout` recurrentes o auto-guardado al carrito del POS.
4. **PROHIBIDO** llamar `clearCart()` sin HTTP 200 verificado.
5. **PROHIBIDO** leer estado de React (`cart`, `currentAccountNum`) dentro de callbacks asíncronos — usar `useRef`.
6. **PROHIBIDO** locks de terminal en RAM de Python — solo en PostgreSQL (`terminal_locks`).
7. **PROHIBIDO** generar folios en el frontend — solo el backend.
8. **PROHIBIDO** animaciones CSS infinitas (`animate-pulse`, `animation: ... infinite`) sobre indicadores estáticos ligados a red/polling (Incidente 16.1 "Efecto Estrobo").
9. **PROHIBIDO** modificar el esquema de `tickets` / `ticket_items` de forma destructiva. Solo columnas aditivas `NULL`-ables.
10. **PROHIBIDO** tocar el contenedor `rderico-pos-dev` o su build durante la fase de backend.

### Aislamiento estructural (ya existente — se respeta)

```
ExperimentCenterUI.jsx
  └─ React.lazy(HeladeriaHubUI)          ← Barrera 1
       └─ HeladeriaHubUI.jsx
            └─ React.lazy(TiendaInteractivaUI) + SectionErrorBoundary   ← Barrera 2
```

Si la Tienda Interactiva falla, el POS de Panadería sigue operando. **Este plan NO rompe ninguna barrera; solo rellena un placeholder.**

### 🧭 Restricciones arquitectónicas del proyecto (aplican a este plan)

**Restricción A — El POS intocable es el módulo "Punto de Venta IA".**
Cuando este plan dice "no interferir con el POS", se refiere al **POS IA de Panadería** ([`RetailVisionPOS.jsx`](apps/pos/RetailVisionPOS.jsx:29)). La **Tienda Interactiva es un módulo de Heladería** y **sí se modifica**. No confundir "POS" (genérico) con "POS IA" (el módulo intocable).

**Restricción B — Gestión de Productos es el MAESTRO ÚNICO de productos.**
La Tienda Interactiva **NO define sabores, recipientes, extras ni precios**. Los **lee** de `GET /heladeria/menu`, que a su vez lee de `heladeria_product_config` → `products` (catálogo maestro).

| Acción | ¿Puede hacerla la Tienda Interactiva? |
|---|---|
| Crear/editar un sabor, recipiente o extra | ❌ **NO** — se hace en Gestión de Productos |
| Cambiar un precio | ❌ **NO** — se hace en Gestión de Productos |
| Decidir en qué POS aparece un producto | ❌ **NO** — se define en Gestión de Productos |
| Leer el menú para mostrarlo | ✅ **SÍ** |
| Agotar temporalmente un sabor (`is_available`) | ✅ **SÍ** (estado operativo, no maestro) |

> **Consecuencia de diseño:** el configurador es **100% data-driven**. Si un sabor no está en Gestión de Productos, no existe para la Tienda. **Cero precios hardcodeados** en [`tiendaConfigurator.js`](apps/heladeria/utils/tiendaConfigurator.js:1): el precio siempre se calcula a partir de los datos que llegan de `/heladeria/menu`.

> **⚠️ Dependencia futura (no bloqueante):** el mecanismo de "en qué POS aparece cada producto/categoría" se definirá en Gestión de Productos. Cuando exista, la Tienda deberá **consumirlo** en lugar de asumir que todo producto de heladería aparece siempre. Se documenta para no crear deuda técnica.

---

## 📋 RESUMEN

La sección **Tienda Interactiva** es hoy un **placeholder de 105 líneas** ([`TiendaInteractivaUI.jsx`](apps/heladeria/sections/TiendaInteractivaUI.jsx:7)) que muestra "Próximamente" con una animación `float infinite`. Este plan la convierte en un **configurador visual de doble columna** para que un cliente (o un empleado en modo kiosco) arme su helado paso a paso, y genere una **pre-comanda** que entra al KDS como `PENDING`.

### Objetivo de negocio

Permitir que el cliente arme su producto sin la ayuda de un empleado, reduciendo el tiempo de atención en mostrador y alimentando directamente las estaciones KDS (Helados / Malteadas).

### Objetivo técnico

- Extraer TODA la lógica de armado a un módulo puro `tiendaConfigurator.js` (sin React, sin DOM, sin fetch) con tests vitest.
- **Replicar el contrato de props** del switch de caja ya probado en [`GestorDeCaja.jsx`](apps/pos/components/GestorDeCaja.jsx:73) — **sin importarlo** (vive en `apps/pos/` y es UI con estado; importarlo rompería la Barrera 1).
- Persistir la pre-comanda vía los endpoints existentes `POST /pos/tickets/reserve` + `PUT /pos/tickets/{account_num}` + `POST /pos/tickets/items/add` (ya usados por [`heladeriaService.createHeladeriaTicket()`](apps/heladeria/services/heladeriaService.js:96)).
- **⚠️ Corregir el flujo no atómico de `createHeladeriaTicket()`:** hoy reserva el folio y luego setea `channel='HELADERIA'` en un **segundo request cuyo `res.ok` NO se verifica**. Si ese `PUT` falla, el ticket queda con `channel=NULL` y **aparece en el POS de Panadería**. Este plan DEBE cerrar ese hueco (ver Fase 14.4).

---

## 🧩 ESTADO ACTUAL (evidencia)

| Elemento | Archivo | Estado |
|---|---|---|
| Sección Tienda | [`TiendaInteractivaUI.jsx`](apps/heladeria/sections/TiendaInteractivaUI.jsx:7) | 🔴 Placeholder (105 líneas, "Próximamente") |
| Servicio HTTP | [`heladeriaService.js`](apps/heladeria/services/heladeriaService.js:12) | 🟢 Funcional (`getMenu`, `createHeladeriaTicket`, `addItemToTicket`) |
| Hook de menú | [`useHeladeriaMenu.js`](apps/heladeria/hooks/useHeladeriaMenu.js:1) | 🟢 Funcional |
| Hook de carrito | [`useHeladeriaCart.js`](apps/heladeria/hooks/useHeladeriaCart.js:1) | 🟢 Funcional |
| Builder rápido | [`useQuickBuilder.js`](apps/heladeria/hooks/useQuickBuilder.js:1) | 🟢 Funcional |
| Componentes | [`FlavorGrid.jsx`](apps/heladeria/components/FlavorGrid.jsx:1), [`QuickIceCreamPanel.jsx`](apps/heladeria/components/QuickIceCreamPanel.jsx:1) | 🟢 Funcionales |
| Switch de caja | [`GestorDeCaja.jsx`](apps/pos/components/GestorDeCaja.jsx:73) | 🟢 Contrato replicable (NO importable) |
| Almacén offline | [`heladeriaOfflineStore.js`](apps/heladeria/services/heladeriaOfflineStore.js:1) | 🟢 Funcional (pero **NO conectado** a `heladeriaService`) |
| Flujo de canal | [`heladeriaService.js`](apps/heladeria/services/heladeriaService.js:96) | 🔴 **NO atómico** — el `PUT` del canal no verifica `res.ok` |

**Conclusión:** la infraestructura de datos ya existe. Este plan es **mayoritariamente UI + lógica pura**, con riesgo bajo.

---

## 🎯 FASE 14.1 — Guardián del contrato: `tiendaConfigurator.js` (lógica pura)

**🎯 Objetivo:** Extraer toda la lógica de armado a un módulo puro testeable, ANTES de escribir una sola línea de UI.

**📍 Evidencia:** No existe `apps/heladeria/utils/tiendaConfigurator.js`. El patrón "guardián del contrato" ya se usó en [`warehouseMappers.js`](apps/inventory/utils/warehouseMappers.js:1) y [`terminalCardState.js`](apps/pos/utils/terminalCardState.js:1).

**🔧 Cambios:**

1. Crear `apps/heladeria/utils/tiendaConfigurator.js` con exports puros:
   - `CONFIGURATOR_STEPS` — array ordenado de pasos de UI (`['base', 'tamano', 'sabores', 'toppings', 'extras']`).
   - `STEP_TO_COMPONENT_TYPE` — **mapeo explícito** paso UI → enum del backend (ver tabla abajo). **Sin este mapeo, `buildPreComandaPayload` no puede producir la forma que espera el backend.**
   - `DEFAULT_CONFIGURATOR_STATE` — estado inicial vacío.
   - `canAdvanceStep(state, stepId)` → `{ ok: boolean, reason: string }`.
   - `advanceStep(state)` / `goBackStep(state)` — navegación de pasos.
   - `toggleFlavor(state, flavorId, maxSabores)` — respeta el máximo de sabores. **`maxSabores` se recibe como parámetro derivado del menú** (ver origen abajo); la función NO lo inventa.
   - `toggleTopping(state, toppingId, maxToppings)` — `maxToppings` también derivado del menú.
   - `computeUnitPrice(state, menu)` — suma base + tamaño + toppings + extras, **leyendo precios del `menu`** (cero hardcodeo).
   - `buildPreComandaPayload(state, menu, meta)` → payload listo para `createHeladeriaTicket` + `addItemToTicket`, usando `STEP_TO_COMPONENT_TYPE`.
   - `validateConfiguratorState(state)` → `{ ok, errors[] }`.
   - `normalizeConfiguratorState(raw)` — tolerante a datos corruptos de `sessionStorage`.

   **📐 Mapeo obligatorio `STEP_TO_COMPONENT_TYPE` (paso UI → enum `component_type` del backend):**

   | Paso UI | `component_type` (backend) | Notas |
   |---|---|---|
   | `base` | `RECIPIENTE` | El recipiente (cono, vaso, tina) |
   | `tamano` | `TAMAÑO` | El tamaño del recipiente |
   | `sabores` | `SABOR` | Cada bola es un `SABOR` (hasta `max_scoops`) |
   | `toppings` | `EXTRA` | Toppings = extras |
   | `extras` | `EXTRA` | Extras adicionales (mismo enum que toppings) |
   | *(sin paso UI)* | `BEBIDA_BASE` | **No aplica a la Tienda Interactiva** (es para malteadas del POS Heladería). El configurador NO lo emite. |

   > **Origen de `maxSabores`:** proviene del campo `max_scoops` de `HeladeriaProductConfig` (por producto), expuesto en `GET /heladeria/menu`. El configurador lo lee del **recipiente seleccionado** (`menu.recipientes[].max_scoops`) y lo pasa a `toggleFlavor`. **No es una constante global.**

2. Crear `apps/heladeria/utils/tiendaConfigurator.test.js` con **~15 tests**:
   - Avance de pasos bloqueado si falta base.
   - Máximo de sabores respetado (no permite 4 si `max_scoops` del recipiente es 3).
   - Precio calculado correctamente con combinaciones (leyendo del `menu`, no de constantes).
   - `buildPreComandaPayload` produce la forma exacta que espera el backend, **con `component_type` correcto por cada paso** (verifica el mapeo).
   - `normalizeConfiguratorState` no explota con `null`/`undefined`/basura.
   - `validateConfiguratorState` detecta estados incompletos.

**✅ Verificación:**
```bash
npx vitest run apps/heladeria/utils/tiendaConfigurator.test.js
```
Debe pasar 100%. Baseline global: **~153/153 → ~168/168** (V17 corre antes; ver tabla de baselines del maestro).

**⚠️ Riesgo POS:** 🟢 **NULO.** Archivo nuevo, módulo puro, sin imports de React/DOM/fetch. No toca nada del POS.

---

## 🎯 FASE 14.2 — `TiendaConfigurator.jsx` (UI de doble columna)

**🎯 Objetivo:** Construir el configurador visual de doble columna (izquierda: opciones; derecha: resumen en vivo).

**📍 Evidencia:** [`TiendaInteractivaUI.jsx`](apps/heladeria/sections/TiendaInteractivaUI.jsx:7) es un placeholder. Existen [`FlavorGrid.jsx`](apps/heladeria/components/FlavorGrid.jsx:1) y [`QuickIceCreamPanel.jsx`](apps/heladeria/components/QuickIceCreamPanel.jsx:1) reutilizables.

**🔧 Cambios:**

1. Crear `apps/heladeria/components/TiendaConfigurator.jsx`:
   - **Columna izquierda:** pasos del configurador (base → tamaño → sabores → toppings → extras). Cada paso usa los componentes existentes (`FlavorGrid`, etc.) cuando aplica.
   - **Columna derecha:** resumen en vivo (producto, sabores elegidos, toppings, precio total, botón "Agregar a la pre-comanda").
   - Estado local con `useState` + `useReducer` (reducer puro importado de `tiendaConfigurator.js`).
   - **Sin** `setInterval`, **sin** auto-save, **sin** animaciones infinitas.
   - Responsive: en pantallas < 768px colapsa a una sola columna con tabs.
2. Crear `apps/heladeria/components/ConfiguratorSummary.jsx` — panel derecho aislado (facilita tests futuros).
3. Reutilizar `useHeladeriaMenu.js` para cargar el menú (ya maneja caché offline vía `heladeriaOfflineStore.js`).

**✅ Verificación:**
```bash
npm run build
```
Debe compilar sin errores. Baseline: **1419 módulos**. Nuevo esperado: ~1422.

**⚠️ Riesgo POS:** 🟢 **BAJO.** Componentes nuevos dentro de `apps/heladeria/`. No se importan desde el POS. La Barrera 2 (`SectionErrorBoundary`) contiene cualquier fallo.

---

## 🎯 FASE 14.3 — Switch de caja (REPLICAR el contrato de `GestorDeCaja.jsx`, NO importarlo)

**🎯 Objetivo:** Permitir que la Tienda Interactiva opere en dos modos: **Kiosco** (cliente arma solo) y **Caja** (empleado cobra). Reutilizar el patrón existente, NO duplicarlo.

**📍 Evidencia:** [`GestorDeCaja.jsx`](apps/pos/components/GestorDeCaja.jsx:73) expone `onCajaHabilitada` / `onCajaDeshabilitada`. [`POSHeader.jsx`](apps/pos/components/POSHeader.jsx:140) ya tiene el botón "Habilitar como Caja". [`RetailVisionPOS.jsx`](apps/pos/RetailVisionPOS.jsx:525) ya consume el patrón con `setIsCashEnabled`.

> **⚠️ PRERREQUISITO:** esta fase usa los locks de terminal vía [`heladeriaTerminals.js`](apps/heladeria/services/heladeriaTerminals.js:1), que **hoy está roto** (llama a 3 endpoints inexistentes). La **FASE 0** del [`PLAN_HELADERIA_MAESTRO.md`](PLAN_HELADERIA_MAESTRO.md) lo repara. **NO ejecutar esta fase antes de la FASE 0.**

**🔧 Cambios:**

1. Crear `apps/heladeria/hooks/useTiendaCajaMode.js`:
   - Estado `isCajaEnabled` (default `false` = modo Kiosco).
   - `enableCaja(sessionId)` / `disableCaja()`.
   - Persiste el modo en `sessionStorage` (NO en el POS).
   - **NO** toca `terminal_locks` del POS.
2. Integrar el switch en `TiendaConfigurator.jsx`:
   - Modo Kiosco: el cliente arma y envía la pre-comanda directo al KDS (`PENDING`).
   - Modo Caja: el empleado arma, revisa y cobra (flujo actual del POS de Heladería).
3. **NO** importar `GestorDeCaja.jsx` directamente (vive en `apps/pos/` y es un componente de UI con estado). En su lugar, replicar el **contrato de props** (`onCajaHabilitada` / `onCajaDeshabilitada`) para mantener el aislamiento. **Esta es la estrategia única aprobada** (ver Nota de Diseño #5 del plan maestro). Documentar esta decisión en NOTAS DE DISEÑO.

**✅ Verificación:**
```bash
npm run build && npx vitest run
```
Build OK + ~168/168 tests.

**⚠️ Riesgo POS:** 🟡 **MEDIO-BAJO.** Se replica un contrato, no se importa código del POS. El riesgo real es que un futuro refactor de `GestorDeCaja.jsx` rompa la paridad — mitigado con un test de contrato (ver Fase 14.4).

---

## 🎯 FASE 14.4 — Pre-comanda con canal ATÓMICO (Opción 2 aprobada) + test de contrato

**🎯 Objetivo:** Enviar la pre-comanda al backend **garantizando de forma atómica** que el ticket nazca con `channel='HELADERIA'`, y permitir cancelarla antes de que el KDS la tome.

> **✅ DECISIÓN DEL USUARIO (cerrada):** se implementa la **Opción 2 — canal atómico en el backend**. Se descarta la Opción 1 (compensación en frontend) porque deja una ventana de inconsistencia y depende de un endpoint de cancelación que **no existe**. La Opción 2 es **aditiva y `NULL`-able**, por lo que **NO viola la Restricción A** (el POS IA intocable es el frontend [`RetailVisionPOS.jsx`](apps/pos/RetailVisionPOS.jsx:29); el endpoint `POST /pos/tickets/reserve` no es el POS IA).

**📍 Evidencia (estado ANTES de esta fase):** [`heladeriaService.createHeladeriaTicket()`](apps/heladeria/services/heladeriaService.js:96) hacía **DOS requests secuenciales**: (1) `POST /pos/tickets/reserve` (reserva folio) y (2) `PUT /pos/tickets/{account_num}` (setea `channel='HELADERIA'`). **El segundo request NO verificaba `res.ok`.** El endpoint `reserve` **NO aceptaba `channel`** ([`pos/router.py:34`](apps/api/modules/pos/router.py:34): solo `terminal_id` y `captured_by_id`).

> **🔴 DEFECTO CERRADO POR ESTA FASE:** si el `PUT` del canal fallaba (red, timeout, 500), el ticket quedaba con `channel=NULL` → **aparecía en el POS de Panadería**. Con la Opción 2 el `PUT` **desaparece**: el canal se escribe en el **mismo `INSERT`** de la reserva, así que el ticket **NUNCA existe con `channel=NULL`**.

**🔧 Cambios (5 archivos, 4 backend + 1 frontend):**

1. **[`apps/api/modules/pos/models.py`](apps/api/modules/pos/models.py:49)** — declarar las columnas que ya existen en la BD (migración [`add_heladeria_support.py`](apps/api/migrations/add_heladeria_support.py:51)) pero que el ORM **no conocía**:
   ```python
   channel = Column(String, nullable=True, default="PANADERIA", index=True)
   customer_group_name = Column(String, nullable=True)
   ```
   Sin esto, el ORM no puede escribir `channel` en el `INSERT` (era la causa raíz de que se usara un `PUT` aparte).
2. **[`apps/api/modules/pos/schemas.py`](apps/api/modules/pos/schemas.py:109)** — añadir `channel: Optional[str] = None` a `ReserveTicketRequest`. **Aditivo y opcional:** el POS IA no lo envía y recibe `'PANADERIA'` (comportamiento intacto).
3. **[`apps/api/modules/pos/service.py`](apps/api/modules/pos/service.py:612)** — propagar el canal:
   - `reserve_ticket(..., channel=None)` → `canal = channel or "PANADERIA"`.
   - `_generate_consecutive_ticket(..., channel)` → escribe `channel=canal` **dentro del `models.Ticket(...)`** (INSERT atómico).
   - `_find_empty_ticket(..., channel)` → filtra por `func.coalesce(Ticket.channel, "PANADERIA") == channel`, para que un ticket de Heladería **nunca** sea reciclado por el POS de Panadería (y viceversa). Los tickets legacy con `channel NULL` se tratan como `PANADERIA`.
   - Añadir `func` al import de SQLAlchemy (`from sqlalchemy import delete, text, func`).
4. **[`apps/api/modules/pos/router.py`](apps/api/modules/pos/router.py:34)** — pasar `req.channel` a `pos_service.reserve_ticket(...)` e incluirlo en el payload de auditoría.
5. **[`apps/heladeria/services/heladeriaService.js`](apps/heladeria/services/heladeriaService.js:96)** — `createHeladeriaTicket()` envía `channel: 'HELADERIA'` en el body del `reserve` y **elimina por completo el segundo `PUT`**. Un solo request, atómico.

6. Crear `apps/heladeria/hooks/usePreComanda.js`:
   - `enviarPreComanda(state)` → llama `createHeladeriaTicket` + `addItemToTicket`. **El canal ya viene garantizado por el backend**, así que el éxito del `reserve` implica canal correcto.
   - `cancelarPreComanda(accountNum)` → **⚠️ NO existe endpoint `cancel`** en [`pos/router.py`](apps/api/modules/pos/router.py:1) (endpoints reales: `reserve`, `create`, `items/add`, `items/update`, `items/remove`, `emergency-save`). Se implementa como **`items/remove` de todos los items** (deja el ticket vacío, que el GC reclama) **o se pospone**. No asumir un endpoint inexistente.
   - **Cola offline REAL:** si el backend está caído, llamar `heladeriaOfflineStore.enqueueOperation()` (hoy **NO** se llama desde `heladeriaService`). Sin esto, la pre-comanda se pierde.
   - **NO** genera folios localmente — los recibe del backend.
7. Crear `apps/heladeria/utils/tiendaContract.test.js` — **test de contrato** que verifica que el payload de `buildPreComandaPayload` coincide con lo que el backend espera: `channel: 'HELADERIA'` en el `reserve`, `component_type` correcto por paso (usando `STEP_TO_COMPONENT_TYPE`), `station`, etc.
8. Actualizar [`TiendaInteractivaUI.jsx`](apps/heladeria/sections/TiendaInteractivaUI.jsx:7) para montar `TiendaConfigurator` y eliminar la animación `float infinite` del placeholder.

**✅ Verificación:**
```bash
npx vitest run && npm run build
docker exec rderico-api-dev python -m pytest -q
```
~168/168 vitest + build OK + 39/39 pytest. **Prueba manual obligatoria:** crear una pre-comanda desde la Tienda y verificar en PostgreSQL que el ticket nace con `channel='HELADERIA'` **en el mismo `INSERT`** (ya no hay ventana de `NULL`).

**⚠️ Riesgo POS:** 🟡 **MEDIO-BAJO.** Se modifica `apps/api/modules/pos/` de forma **aditiva y `NULL`-able** (no viola la Restricción A). El POS IA no envía `channel` → recibe `'PANADERIA'` (default), comportamiento **idéntico** al actual. **Verificar en PostgreSQL que NO existen tickets con `channel=NULL` creados por la Tienda** (`SELECT * FROM tickets WHERE channel IS NULL AND created_at > <inicio_prueba>`). **Regresión obligatoria:** abrir el POS IA de Panadería y confirmar que reserva folio con normalidad.

---

## 🎯 FASE 14.5 — Documentación

**🎯 Objetivo:** Actualizar la documentación maestra del módulo.

**🔧 Cambios:**

1. Actualizar [`DOCUMENTACION_MODULO_HELADERIA.md`](ESPECIFICACIONES%20DEL%20PROYECTO/DOCUMENTACION_MODULO_HELADERIA.md:1):
   - Sección 5.4 (Secciones): marcar Tienda Interactiva como 🟢 Funcional.
   - Sección 13 (Próximos Pasos): mover "Tienda Interactiva" de Oleada 2 a Completado.
   - Añadir entrada en "Cementerio de Bugs" si aplica.
2. Añadir diagrama de flujo de la pre-comanda (cliente → configurador → backend → KDS).

**✅ Verificación:** Lectura manual del doc.

**⚠️ Riesgo POS:** 🟢 **NULO.** Solo documentación.

---

## 📊 ORDEN DE EJECUCIÓN Y COMMITS

| # | Fase | Commit sugerido | Riesgo POS | Riesgo Ejecución |
|---|---|---|---|---|
| 0 | **FASE 0** (maestro) | `fix(heladeria): reparar heladeriaTerminals.js (3 endpoints rotos)` | 🟢 Nulo | 🟢 Bajo |
| 1 | 14.1 | `feat(heladeria): tiendaConfigurator.js puro + 15 tests` | 🟢 Nulo | 🟢 Bajo |
| 2 | 14.2 | `feat(heladeria): TiendaConfigurator UI doble columna` | 🟢 Bajo | 🟡 Medio |
| 3 | 14.3 | `feat(heladeria): switch Kiosco/Caja (contrato replicado)` | 🟡 Medio-Bajo | 🟡 Medio |
| 4 | 14.4 | `feat(heladeria): canal atómico en reserve (Opcion 2) + pre-comanda + test contrato` | 🟡 Medio-Bajo | 🟡 Medio |
| 5 | 14.5 | `docs(heladeria): actualizar doc maestra V14` | 🟢 Nulo | 🟢 Bajo |

**Regla:** un commit por fase. Si una fase falla la verificación, NO se avanza a la siguiente.

> **⚠️ La FASE 0 es PRERREQUISITO de la Fase 14.3.** Sin ella, el switch de caja fallará en runtime porque `heladeriaTerminals.js` llama a endpoints inexistentes.

---

## 🎯 CRITERIOS DE ACEPTACIÓN

- [ ] `tiendaConfigurator.js` es 100% puro (sin React/DOM/fetch) y tiene ≥15 tests.
- [ ] `npx vitest run` → **~168/168** (baseline ~153 de V17 + 15 nuevos).
- [ ] `npm run build` → compila sin errores (~1424 módulos).
- [ ] La Tienda Interactiva arma un helado completo y genera una pre-comanda `PENDING`.
- [ ] **El ticket generado tiene `channel = 'HELADERIA'` de forma ATÓMICA:** el canal viaja en el **mismo `INSERT`** de `POST /pos/tickets/reserve` (Opción 2). **NO existe un segundo `PUT`** y por tanto **NO hay ventana** en la que el ticket tenga `channel=NULL`. Verificación en PostgreSQL: `SELECT count(*) FROM tickets WHERE channel IS NULL AND created_at > <inicio_prueba> AND terminal_id LIKE 'H%';` → **0**.
- [ ] **Regresión del POS IA (Panadería):** el POS IA **no envía** `channel` y sigue reservando folio con normalidad (`channel='PANADERIA'` por default). El cambio es aditivo y `NULL`-able → **NO viola la Restricción A**.
- [ ] **Aislamiento de canal en el reciclaje:** `_find_empty_ticket` filtra por canal, así un ticket de Heladería **nunca** es reciclado por el POS de Panadería (y viceversa).
- [ ] `buildPreComandaPayload` emite el `component_type` correcto por paso (mapeo `STEP_TO_COMPONENT_TYPE` verificado por el test de contrato).
- [ ] `toggleFlavor` respeta el `max_scoops` del recipiente seleccionado (leído del menú, no constante global).
- [ ] El switch Kiosco/Caja funciona sin tocar `terminal_locks` del POS.
- [ ] Se modificó `apps/api/modules/pos/` de forma **aditiva y `NULL`-able** (Opción 2 aprobada por el usuario): `models.py` (declarar `channel`), `schemas.py` (`channel` opcional), `service.py` (propagar + filtrar por canal), `router.py` (pasar `channel`). **NO se tocó** ningún archivo del frontend del POS (`apps/pos/*.jsx`) — verificar con `git diff --stat`.
- [ ] NO hay animaciones CSS infinitas en la sección.
- [ ] El POS de Panadería sigue operando si la Tienda Interactiva falla (Barrera 2).

---

## 🔄 PROTOCOLO DE REVERSIÓN

1. **Reversión por fase:** cada fase es un commit independiente → `git revert <hash>`.
2. **Reversión total:** `git revert` de los 5 commits en orden inverso (14.5 → 14.1).
3. **Reversión de emergencia (POS afectado):** restaurar `TiendaInteractivaUI.jsx` al placeholder original (el archivo está aislado; el POS no lo importa).
4. **Reversión de estado externo:** este plan **NO** crea claves en `system_settings` ni volúmenes Docker. Los tickets con `channel='HELADERIA'` son **datos de negocio reales** y NO se borran al revertir el código.
5. **⚠️ Limpieza de tickets huérfanos (solo si existieran de ANTES de la Opción 2):** con la Opción 2 el `PUT` ya no existe, así que la Fase 14.4 **no puede generar** tickets con `channel=NULL`. Si se detectan tickets huérfanos de ejecuciones previas, identificarlos y limpiarlos: `SELECT id, account_num, created_at FROM tickets WHERE channel IS NULL AND created_at > <inicio_ejecucion> AND terminal_id LIKE 'H%';`. Estos tickets contaminan el POS de Panadería.
6. **⚠️ Reversión del cambio aditivo en backend:** si se revierte la Fase 14.4, el frontend de Heladería volvería a hacer el `PUT` no atómico. **Revertir SIEMPRE el commit de la Fase 14.4 completo** (backend + frontend juntos) para no dejar el frontend enviando `channel` a un endpoint que ya no lo acepta (Pydantic lo ignoraría silenciosamente, degradando al flujo no atómico).
7. **Verificación post-reversión:** `npx vitest run` → ~153/153 (baseline de V17), `npm run build` → ~1421 módulos, `docker exec rderico-api-dev python -m pytest -q` → 39/39.

---

## 📝 NOTAS DE DISEÑO

1. **¿Por qué replicar el contrato de `GestorDeCaja` en vez de importarlo?**
   Porque `GestorDeCaja.jsx` vive en `apps/pos/` y es un **componente de UI con estado**. Importarlo desde `apps/heladeria/` crearía un acoplamiento de UI que rompería la Barrera 1: un cambio en el POS podría romper la Heladería. Se replica el contrato de props (`onCajaHabilitada` / `onCajaDeshabilitada`) y se cubre con un test de contrato.
   **Distinción clave:** se **acepta** importar utilidades sin estado (`CONFIG`, `withRetries`), pero se **prohíbe** importar componentes de UI del POS. **Esta es la estrategia única aprobada** (ver Nota de Diseño #5 del plan maestro).

2. **¿Por qué la lógica pura primero?**
   Es el patrón "guardián del contrato" ya validado en Almacenes (V7-V11). Permite testear sin montar React y detecta regresiones de negocio (precios, máximos de sabores) antes de tocar UI.

3. **¿Por qué NO auto-save en el configurador?**
   El configurador es efímero (el cliente arma y envía). El auto-save solo tiene sentido en el POS, donde está PROHIBIDO por el blindaje. Mantener el configurador sin timers reduce el riesgo de fugas de memoria en kioscos que quedan encendidos todo el día.

4. **¿Por qué `sessionStorage` y no `localStorage` para el modo Caja?**
   El modo Caja es por sesión de navegador. Si el kiosco se reinicia, debe volver a modo Kiosco por defecto (más seguro).

5. **¿Qué pasa si el backend está caído?** *(corregido — antes afirmaba una cola offline que NO existe)*
   `heladeriaService` usa `withRetries` (reintenta **en el lugar**) y `heladeriaOfflineStore.js` **cachea el menú** (eso sí funciona). **PERO** `heladeriaService` **NO importa** `heladeriaOfflineStore` y **NO llama** `enqueueOperation`: hoy la pre-comanda **NO se encola**; si el backend está caído más allá de los reintentos, **se pierde**. La Fase 14.4 debe conectar la cola real (`enqueueOperation`) para que esta nota sea cierta. El configurador NUNCA bloquea su render esperando red (eso sí es cierto).

6. **¿Por qué el flujo de `channel` era un riesgo y cómo se cerró?** *(defecto #1 — RESUELTO con la Opción 2)*
   `createHeladeriaTicket()` hacía **2 requests no atómicos**: reservaba el folio y luego seteaba el canal con un `PUT` **cuyo `res.ok` no verificaba**. Si ese `PUT` fallaba, el ticket quedaba con `channel=NULL` y aparecía en el POS de Panadería. **Solución aprobada por el usuario (Opción 2):** el canal se escribe **atómicamente en el `INSERT`** de la reserva. Se añadió `channel` opcional a `ReserveTicketRequest` y se declaró la columna `channel` en el modelo ORM (que existía en la BD pero no en SQLAlchemy). El `PUT` **desaparece**. Es un cambio **aditivo y `NULL`-able** → **NO viola la Restricción A** (el POS IA intocable es el frontend `RetailVisionPOS.jsx`, no el endpoint). Se descartó la Opción 1 (compensación en frontend) porque dejaba una ventana de inconsistencia y dependía de un endpoint de cancelación **inexistente**.

---

## ✅ CHECKLIST DE APROBACIÓN

- [ ] El usuario aprueba el alcance (configurador doble columna + pre-comanda + switch Kiosco/Caja).
- [ ] El usuario aprueba el orden de ejecución (FASE 0 → 14.1 → 14.5).
- [ ] El usuario confirma que la **FASE 0** (saneamiento de `heladeriaTerminals.js`) se ejecuta ANTES de la Fase 14.3.
- [ ] El usuario confirma que **NO se modificará** ningún archivo del **frontend** del POS (`apps/pos/*.jsx`); se permite importar `CONFIG` y `withRetries`. **✅ APROBADO:** se modifica `apps/api/modules/pos/` (backend) de forma **aditiva y `NULL`-able** para hacer el canal atómico (Opción 2).
- [ ] El usuario confirma la estrategia de caja: **replicar el contrato**, no importar `GestorDeCaja.jsx`.
- [ ] El usuario confirma el baseline de tests (**~153/153 → ~168/168**, V17 corre antes).
- [x] **✅ DECIDIDO POR EL USUARIO:** el **defecto #1** (flujo de canal no atómico) se cierra con la **Opción 2 — `channel` atómico en `ReserveTicketRequest`** (backend). Se descarta la compensación en frontend.
- [ ] El usuario aprueba el commit por fase.
