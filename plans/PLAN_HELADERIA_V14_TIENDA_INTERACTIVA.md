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

## 🎯 FASE 14.4 — Pre-comanda + cierre del flujo no atómico + test de contrato

**🎯 Objetivo:** Enviar la pre-comanda al backend **garantizando** que el ticket quede con `channel='HELADERIA'` (o se compense si falla), y permitir cancelarla antes de que el KDS la tome.

**📍 Evidencia:** [`heladeriaService.createHeladeriaTicket()`](apps/heladeria/services/heladeriaService.js:96) hace **DOS requests secuenciales**: (1) `POST /pos/tickets/reserve` (reserva folio) y (2) `PUT /pos/tickets/{account_num}` (setea `channel='HELADERIA'`). **El segundo request NO verifica `res.ok`.** El endpoint `reserve` **NO acepta `channel`** (confirmado en [`pos/router.py:34`](apps/api/modules/pos/router.py:34): solo recibe `terminal_id` y `captured_by_id`), por eso el canal se setea aparte. [`heladeriaService.addItemToTicket()`](apps/heladeria/services/heladeriaService.js:127) agrega items.

> **🔴 DEFECTO A CERRAR EN ESTA FASE:** si el `PUT` del canal falla (red, timeout, 500), el ticket queda con `channel=NULL` → **aparece en el POS de Panadería**, violando el criterio de aceptación. Esta fase DEBE cerrar ese hueco.

**🔧 Cambios:**

1. **Corregir `heladeriaService.createHeladeriaTicket()`** (archivo de Heladería, NO del POS):
   - Verificar `res.ok` del `PUT` del canal. Si falla → **lanzar error** (no silenciarlo).
   - **Compensación:** si el `PUT` falla tras reservar el folio, **cancelar/liberar el ticket huérfano** para que NO quede con `channel=NULL` en el POS de Panadería. Si no existe endpoint de cancelación, **reintentar el `PUT` del canal** con `withRetries` antes de rendirse y, si aun así falla, registrar el `account_num` en un log de "huérfanos" para limpieza manual.
   - **Decisión de diseño a confirmar con el usuario:** la alternativa más limpia es hacer el canal **atómico en el backend** (añadir `channel` opcional a `ReserveTicketRequest`). Eso toca `apps/api/modules/pos/`, lo cual **NO** viola la Restricción A (el POS IA es el frontend `RetailVisionPOS.jsx`; el endpoint es aditivo y `NULL`-able). **Se documenta como opción preferida si el usuario la aprueba.**
2. Crear `apps/heladeria/hooks/usePreComanda.js`:
   - `enviarPreComanda(state)` → llama `createHeladeriaTicket` + `addItemToTicket`, y **solo reporta éxito si el canal quedó confirmado**.
   - `cancelarPreComanda(accountNum)` → **⚠️ VERIFICAR PRIMERO** que exista un endpoint de cancelación en [`pos/router.py`](apps/api/modules/pos/router.py:1). Los endpoints actuales son `reserve`, `create`, `items/add`, `items/update`, `items/remove`, `emergency-save`. **Si NO existe `cancel`, esta función se implementa como "marcar el ticket como cancelado vía `items/remove` de todos los items" o se pospone.** No asumir un endpoint inexistente.
   - **Cola offline REAL:** si el backend está caído, llamar `heladeriaOfflineStore.enqueueOperation()` (hoy **NO** se llama desde `heladeriaService`). Sin esto, la pre-comanda se pierde.
   - **NO** genera folios localmente — los recibe del backend.
3. Crear `apps/heladeria/utils/tiendaContract.test.js` — **test de contrato** que verifica que el payload de `buildPreComandaPayload` coincide con lo que el backend espera: campos `channel: 'HELADERIA'`, `component_type` correcto por paso (usando `STEP_TO_COMPONENT_TYPE`), `station`, etc.
4. Actualizar [`TiendaInteractivaUI.jsx`](apps/heladeria/sections/TiendaInteractivaUI.jsx:7) para montar `TiendaConfigurator` y eliminar la animación `float infinite` del placeholder.

**✅ Verificación:**
```bash
npx vitest run && npm run build
```
~168/168 tests + build OK. **Prueba manual obligatoria:** simular fallo del `PUT` del canal y verificar que NO queda ningún ticket con `channel=NULL` creado por la Tienda.

**⚠️ Riesgo POS:** 🟡 **MEDIO.** Se usan endpoints del POS (`/pos/tickets/reserve`, `/pos/tickets/items/add`) pero **sin modificarlos** (salvo que el usuario apruebe el cambio aditivo en `ReserveTicketRequest`). El campo `channel: 'HELADERIA'` separa los tickets (NULL = PANADERÍA). **Verificar en PostgreSQL que NO existen tickets con `channel=NULL` creados por la Tienda** (consulta: `SELECT * FROM tickets WHERE channel IS NULL AND created_at > <inicio_prueba>`).

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
| 4 | 14.4 | `feat(heladeria): pre-comanda + cierre flujo canal no atómico + test contrato` | 🟡 Medio | 🟡 Medio |
| 5 | 14.5 | `docs(heladeria): actualizar doc maestra V14` | 🟢 Nulo | 🟢 Bajo |

**Regla:** un commit por fase. Si una fase falla la verificación, NO se avanza a la siguiente.

> **⚠️ La FASE 0 es PRERREQUISITO de la Fase 14.3.** Sin ella, el switch de caja fallará en runtime porque `heladeriaTerminals.js` llama a endpoints inexistentes.

---

## 🎯 CRITERIOS DE ACEPTACIÓN

- [ ] `tiendaConfigurator.js` es 100% puro (sin React/DOM/fetch) y tiene ≥15 tests.
- [ ] `npx vitest run` → **~168/168** (baseline ~153 de V17 + 15 nuevos).
- [ ] `npm run build` → compila sin errores (~1424 módulos).
- [ ] La Tienda Interactiva arma un helado completo y genera una pre-comanda `PENDING`.
- [ ] **El ticket generado tiene `channel = 'HELADERIA'` Y el flujo lo GARANTIZA:** si el `PUT` del canal falla, el ticket huérfano se compensa (cancelado/liberado) y **NO queda ningún ticket con `channel=NULL`** creado por la Tienda. *(Criterio reformulado: el código actual NO garantiza esto; la Fase 14.4 lo corrige.)*
- [ ] `buildPreComandaPayload` emite el `component_type` correcto por paso (mapeo `STEP_TO_COMPONENT_TYPE` verificado por el test de contrato).
- [ ] `toggleFlavor` respeta el `max_scoops` del recipiente seleccionado (leído del menú, no constante global).
- [ ] El switch Kiosco/Caja funciona sin tocar `terminal_locks` del POS.
- [ ] NO se modificó ningún archivo de `apps/pos/` (verificar con `git diff --stat`) — **salvo** que el usuario apruebe el cambio aditivo en `ReserveTicketRequest`.
- [ ] NO hay animaciones CSS infinitas en la sección.
- [ ] El POS de Panadería sigue operando si la Tienda Interactiva falla (Barrera 2).

---

## 🔄 PROTOCOLO DE REVERSIÓN

1. **Reversión por fase:** cada fase es un commit independiente → `git revert <hash>`.
2. **Reversión total:** `git revert` de los 5 commits en orden inverso (14.5 → 14.1).
3. **Reversión de emergencia (POS afectado):** restaurar `TiendaInteractivaUI.jsx` al placeholder original (el archivo está aislado; el POS no lo importa).
4. **Reversión de estado externo:** este plan **NO** crea claves en `system_settings` ni volúmenes Docker. Los tickets con `channel='HELADERIA'` son **datos de negocio reales** y NO se borran al revertir el código.
5. **⚠️ Limpieza de tickets huérfanos:** si durante la ejecución se generaron tickets con `channel=NULL` por el fallo del `PUT` (defecto #1), **deben identificarse y limpiarse** antes de dar la reversión por completa. Consulta: `SELECT id, account_num, created_at FROM tickets WHERE channel IS NULL AND created_at > <inicio_ejecucion> AND terminal_id LIKE 'H%';`. Estos tickets contaminan el POS de Panadería.
6. **Verificación post-reversión:** `npx vitest run` → ~153/153 (baseline de V17), `npm run build` → ~1421 módulos.

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

6. **¿Por qué el flujo de `channel` es un riesgo?** *(nuevo — defecto #1)*
   Porque `createHeladeriaTicket()` hace **2 requests no atómicos**: reserva el folio y luego setea el canal con un `PUT` **cuyo `res.ok` no verifica**. Si ese `PUT` falla, el ticket queda con `channel=NULL` y aparece en el POS de Panadería. La Fase 14.4 cierra este hueco con verificación + compensación. La alternativa preferida (si el usuario la aprueba) es hacer el canal atómico añadiendo `channel` a `ReserveTicketRequest` — cambio aditivo y `NULL`-able que NO viola la Restricción A.

---

## ✅ CHECKLIST DE APROBACIÓN

- [ ] El usuario aprueba el alcance (configurador doble columna + pre-comanda + switch Kiosco/Caja).
- [ ] El usuario aprueba el orden de ejecución (FASE 0 → 14.1 → 14.5).
- [ ] El usuario confirma que la **FASE 0** (saneamiento de `heladeriaTerminals.js`) se ejecuta ANTES de la Fase 14.3.
- [ ] El usuario confirma que NO se **modificará** ningún archivo de `apps/pos/` (se permite importar `CONFIG` y `withRetries`), **salvo** que apruebe el cambio aditivo en `ReserveTicketRequest` para hacer el canal atómico.
- [ ] El usuario confirma la estrategia de caja: **replicar el contrato**, no importar `GestorDeCaja.jsx`.
- [ ] El usuario confirma el baseline de tests (**~153/153 → ~168/168**, V17 corre antes).
- [ ] El usuario decide cómo cerrar el **defecto #1** (flujo de canal no atómico): compensación en frontend **o** `channel` atómico en `ReserveTicketRequest`.
- [ ] El usuario aprueba el commit por fase.
