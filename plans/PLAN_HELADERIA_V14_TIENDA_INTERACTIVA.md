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

---

## 📋 RESUMEN

La sección **Tienda Interactiva** es hoy un **placeholder de 105 líneas** ([`TiendaInteractivaUI.jsx`](apps/heladeria/sections/TiendaInteractivaUI.jsx:7)) que muestra "Próximamente" con una animación `float infinite`. Este plan la convierte en un **configurador visual de doble columna** para que un cliente (o un empleado en modo kiosco) arme su helado paso a paso, y genere una **pre-comanda** que entra al KDS como `PENDING`.

### Objetivo de negocio

Permitir que el cliente arme su producto sin la ayuda de un empleado, reduciendo el tiempo de atención en mostrador y alimentando directamente las estaciones KDS (Helados / Malteadas).

### Objetivo técnico

- Extraer TODA la lógica de armado a un módulo puro `tiendaConfigurator.js` (sin React, sin DOM, sin fetch) con tests vitest.
- Reutilizar el patrón de **switch de caja** ya probado en [`GestorDeCaja.jsx`](apps/pos/components/GestorDeCaja.jsx:73) — sin duplicarlo.
- Persistir la pre-comanda vía el endpoint existente `POST /pos/tickets/reserve` + `POST /pos/tickets/items/add` (ya usado por [`heladeriaService.createHeladeriaTicket()`](apps/heladeria/services/heladeriaService.js:96)).

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
| Switch de caja | [`GestorDeCaja.jsx`](apps/pos/components/GestorDeCaja.jsx:73) | 🟢 Patrón reutilizable |
| Almacén offline | [`heladeriaOfflineStore.js`](apps/heladeria/services/heladeriaOfflineStore.js:1) | 🟢 Funcional |

**Conclusión:** la infraestructura de datos ya existe. Este plan es **mayoritariamente UI + lógica pura**, con riesgo bajo.

---

## 🎯 FASE 14.1 — Guardián del contrato: `tiendaConfigurator.js` (lógica pura)

**🎯 Objetivo:** Extraer toda la lógica de armado a un módulo puro testeable, ANTES de escribir una sola línea de UI.

**📍 Evidencia:** No existe `apps/heladeria/utils/tiendaConfigurator.js`. El patrón "guardián del contrato" ya se usó en [`warehouseMappers.js`](apps/inventory/utils/warehouseMappers.js:1) y [`terminalCardState.js`](apps/pos/utils/terminalCardState.js:1).

**🔧 Cambios:**

1. Crear `apps/heladeria/utils/tiendaConfigurator.js` con exports puros:
   - `CONFIGURATOR_STEPS` — array ordenado de pasos (`['base', 'tamano', 'sabores', 'toppings', 'extras']`).
   - `DEFAULT_CONFIGURATOR_STATE` — estado inicial vacío.
   - `canAdvanceStep(state, stepId)` → `{ ok: boolean, reason: string }`.
   - `advanceStep(state)` / `goBackStep(state)` — navegación de pasos.
   - `toggleFlavor(state, flavorId, maxSabores)` — respeta el máximo de sabores.
   - `toggleTopping(state, toppingId, maxToppings)`.
   - `computeUnitPrice(state, menu)` — suma base + tamaño + toppings + extras.
   - `buildPreComandaPayload(state, menu, meta)` → payload listo para `createHeladeriaTicket` + `addItemToTicket`.
   - `validateConfiguratorState(state)` → `{ ok, errors[] }`.
   - `normalizeConfiguratorState(raw)` — tolerante a datos corruptos de localStorage.
2. Crear `apps/heladeria/utils/tiendaConfigurator.test.js` con **~15 tests**:
   - Avance de pasos bloqueado si falta base.
   - Máximo de sabores respetado (no permite 4 si el máximo es 3).
   - Precio calculado correctamente con combinaciones.
   - `buildPreComandaPayload` produce la forma exacta que espera el backend.
   - `normalizeConfiguratorState` no explota con `null`/`undefined`/basura.
   - `validateConfiguratorState` detecta estados incompletos.

**✅ Verificación:**
```bash
npx vitest run apps/heladeria/utils/tiendaConfigurator.test.js
```
Debe pasar 100%. Baseline global: **141/141 → 156/156**.

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

## 🎯 FASE 14.3 — Switch de caja (reutilizar `GestorDeCaja.jsx`)

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
Build OK + 156/156 tests.

**⚠️ Riesgo POS:** 🟡 **MEDIO-BAJO.** Se replica un contrato, no se importa código del POS. El riesgo real es que un futuro refactor de `GestorDeCaja.jsx` rompa la paridad — mitigado con un test de contrato (ver Fase 14.4).

---

## 🎯 FASE 14.4 — Pre-comanda + cancelaciones + test de contrato

**🎯 Objetivo:** Enviar la pre-comanda al backend y permitir cancelarla antes de que el KDS la tome.

**📍 Evidencia:** [`heladeriaService.createHeladeriaTicket()`](apps/heladeria/services/heladeriaService.js:96) ya reserva folio vía `POST /pos/tickets/reserve`. [`heladeriaService.addItemToTicket()`](apps/heladeria/services/heladeriaService.js:127) ya agrega items.

**🔧 Cambios:**

1. Crear `apps/heladeria/hooks/usePreComanda.js`:
   - `enviarPreComanda(state)` → llama `createHeladeriaTicket` + `addItemToTicket`.
   - `cancelarPreComanda(accountNum)` → marca el ticket como cancelado (endpoint existente del POS, **sin modificarlo**).
   - Manejo de errores con reintentos vía `withRetries` (ya en `heladeriaService`).
   - **NO** genera folios localmente — los recibe del backend.
2. Crear `apps/heladeria/utils/tiendaContract.test.js` — **test de contrato** que verifica que el payload de `buildPreComandaPayload` coincide con lo que el backend espera (campos `channel: 'HELADERIA'`, `station`, etc.).
3. Actualizar [`TiendaInteractivaUI.jsx`](apps/heladeria/sections/TiendaInteractivaUI.jsx:7) para montar `TiendaConfigurator` y eliminar la animación `float infinite` del placeholder.

**✅ Verificación:**
```bash
npx vitest run && npm run build
```
156/156 tests + build OK.

**⚠️ Riesgo POS:** 🟡 **MEDIO.** Se usan endpoints del POS (`/pos/tickets/reserve`, `/pos/tickets/items/add`) pero **sin modificarlos**. El campo `channel: 'HELADERIA'` ya separa los tickets (NULL = PANADERÍA). Verificar en PostgreSQL que los tickets de heladería NO aparecen en el POS de panadería.

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
| 4 | 14.4 | `feat(heladeria): pre-comanda + cancelaciones + test contrato` | 🟡 Medio | 🟡 Medio |
| 5 | 14.5 | `docs(heladeria): actualizar doc maestra V14` | 🟢 Nulo | 🟢 Bajo |

**Regla:** un commit por fase. Si una fase falla la verificación, NO se avanza a la siguiente.

> **⚠️ La FASE 0 es PRERREQUISITO de la Fase 14.3.** Sin ella, el switch de caja fallará en runtime porque `heladeriaTerminals.js` llama a endpoints inexistentes.

---

## 🎯 CRITERIOS DE ACEPTACIÓN

- [ ] `tiendaConfigurator.js` es 100% puro (sin React/DOM/fetch) y tiene ≥15 tests.
- [ ] `npx vitest run` → **156/156** (baseline 141 + 15 nuevos).
- [ ] `npm run build` → compila sin errores (~1422 módulos).
- [ ] La Tienda Interactiva arma un helado completo y genera una pre-comanda `PENDING`.
- [ ] El ticket generado tiene `channel = 'HELADERIA'` y NO aparece en el POS de Panadería.
- [ ] El switch Kiosco/Caja funciona sin tocar `terminal_locks` del POS.
- [ ] NO se modificó ningún archivo de `apps/pos/` (verificar con `git diff --stat`).
- [ ] NO hay animaciones CSS infinitas en la sección.
- [ ] El POS de Panadería sigue operando si la Tienda Interactiva falla (Barrera 2).

---

## 🔄 PROTOCOLO DE REVERSIÓN

1. **Reversión por fase:** cada fase es un commit independiente → `git revert <hash>`.
2. **Reversión total:** `git revert` de los 5 commits en orden inverso (14.5 → 14.1).
3. **Reversión de emergencia (POS afectado):** restaurar `TiendaInteractivaUI.jsx` al placeholder original (el archivo está aislado; el POS no lo importa).
4. **Reversión de estado externo:** este plan **NO** crea claves en `system_settings` ni volúmenes Docker. Los tickets con `channel='HELADERIA'` son **datos de negocio reales** y NO se borran al revertir el código.
5. **Verificación post-reversión:** `npx vitest run` → 141/141, `npm run build` → 1419 módulos.

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

5. **¿Qué pasa si el backend está caído?**
   `heladeriaService` usa `withRetries` y `heladeriaOfflineStore.js` cachea el menú. La pre-comanda se encola y se envía al reconectar. El configurador NUNCA bloquea su render esperando red.

---

## ✅ CHECKLIST DE APROBACIÓN

- [ ] El usuario aprueba el alcance (configurador doble columna + pre-comanda + switch Kiosco/Caja).
- [ ] El usuario aprueba el orden de ejecución (FASE 0 → 14.1 → 14.5).
- [ ] El usuario confirma que la **FASE 0** (saneamiento de `heladeriaTerminals.js`) se ejecuta ANTES de la Fase 14.3.
- [ ] El usuario confirma que NO se **modificará** ningún archivo de `apps/pos/` (se permite importar `CONFIG` y `withRetries`).
- [ ] El usuario confirma la estrategia de caja: **replicar el contrato**, no importar `GestorDeCaja.jsx`.
- [ ] El usuario confirma el baseline de tests (141/141 → 156/156).
- [ ] El usuario aprueba el commit por fase.
