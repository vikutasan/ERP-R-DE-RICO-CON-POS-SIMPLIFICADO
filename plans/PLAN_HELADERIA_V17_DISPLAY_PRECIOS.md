# 💰 PLAN HELADERÍA V17 — DISPLAY DE PRECIOS (Doble Landing + Offline-First)

**Fecha:** 13/Septiembre/2026
**Autor:** Auditoría técnica derivada de [`DOCUMENTACION_MODULO_HELADERIA.md`](../ESPECIFICACIONES%20DEL%20PROYECTO/DOCUMENTACION_MODULO_HELADERIA.md)
**Estado:** ⏳ PROPUESTO — pendiente de ejecución
**Alcance:** Convertir el placeholder [`DisplayPreciosUI.jsx`](../apps/heladeria/sections/DisplayPreciosUI.jsx:7) en un display de precios de doble landing (panel de administración + salida de pantalla completa), offline-first, alimentado por el catálogo maestro.
**Depende de:** Nada (es el primer plan de la oleada tras la FASE 0)
**Bloquea a:** Nada (V16 reutiliza el patrón "display" que este plan valida)

---

## 🚨 PROTOCOLO DE NO-INTERFERENCIA AL POS (OBLIGATORIO)

> **Este plan NO puede romper el POS de Panadería. Punto.**

### Reglas de ejecución

1. **PROHIBIDO tocar** [`apps/pos/RetailVisionPOS.jsx`](../apps/pos/RetailVisionPOS.jsx), [`apps/pos/hooks/useTerminalLocking.js`](../apps/pos/hooks/useTerminalLocking.js), [`apps/pos/hooks/useBeforeUnload.js`](../apps/pos/hooks/useBeforeUnload.js) y [`apps/pos/services/POSService.js`](../apps/pos/services/POSService.js).
2. **PROHIBIDO modificar** [`apps/pos/config.js`](../apps/pos/config.js) — solo se **lee**.
3. **PROHIBIDO** construir URLs con `window.location.hostname`. Siempre `CONFIG.API_BASE_URL`.
4. **PROHIBIDO** animaciones CSS infinitas en indicadores estáticos (Incidente 16.1 — Efecto Estrobo).
5. **Cada fase es un commit independiente** y debe pasar la verificación completa antes de continuar.
6. **Si una fase falla la verificación, se revierte inmediatamente** (`git revert`).
7. **Ninguna fase se ejecuta en horario de operación del POS.**

### 🧭 Restricciones arquitectónicas del proyecto (aplican a este plan)

**Restricción A — El POS intocable es el módulo "Punto de Venta IA".**
Cuando este plan dice "no interferir con el POS", se refiere al **POS IA de Panadería** ([`RetailVisionPOS.jsx`](../apps/pos/RetailVisionPOS.jsx:29)). El **Display de Precios es un módulo de Heladería** y **sí se modifica**.

**Restricción B — Gestión de Productos es el MAESTRO ÚNICO de productos.**
El Display de Precios **NO define precios ni productos**. Los **lee** de `GET /heladeria/display/menu`, que a su vez lee del catálogo maestro (`products` / `categories`).

| Acción | ¿Puede hacerla el Display de Precios? |
|---|---|
| Crear/editar un producto o categoría | ❌ **NO** — se hace en Gestión de Productos |
| Cambiar un precio | ❌ **NO** — se hace en Gestión de Productos |
| Decidir en qué POS aparece un producto | ❌ **NO** — se define en Gestión de Productos |
| Leer el menú con precios para mostrarlo | ✅ **SÍ** |
| Elegir qué categorías mostrar en pantalla | ✅ **SÍ** (configuración de presentación, no de catálogo) |

> **Consecuencia de diseño:** **CERO precios hardcodeados**. Un cambio de precio en Gestión de Productos debe reflejarse en el display **sin tocar código**. El display solo decide **cómo presentar** (agrupación, orden, tipografía), nunca **qué vale** cada producto.

> **⚠️ Dependencia futura (no bloqueante):** el mecanismo de "en qué POS aparece cada producto/categoría" se definirá en Gestión de Productos. Cuando exista, el display deberá **consumirlo** en lugar de asumir que todo producto de heladería aparece siempre.

### Verificación obligatoria por fase

```bash
# 1. Tests backend (baseline: 39/39)
docker exec rderico-api-dev python -m pytest -q

# 2. Tests frontend (baseline: 141/141)
npx vitest run

# 3. Build de producción (baseline: 1419 módulos)
npm run build

# 4. POS Panadería (manual): abrir http://localhost:5000, agregar producto, sin banner falso
# 5. Hub Heladería (manual): entrar al Display de Precios, verificar que las demás secciones siguen accesibles
```

> **Nota de entorno:** Python **NO** está en el PATH del host. `pytest` se ejecuta **siempre** vía `docker exec rderico-api-dev python -m pytest -q`.

---

## 📋 RESUMEN

La sección **Display Precios** es hoy un **placeholder de 100 líneas** ([`DisplayPreciosUI.jsx`](../apps/heladeria/sections/DisplayPreciosUI.jsx:7)) que muestra "Próximamente". Este plan la convierte en un **display de precios real** con dos caras:

1. **Panel de administración** (landing 1): el dueño elige qué categorías mostrar, el orden y el estilo.
2. **Salida de pantalla completa** (landing 2): la pantalla que se cuelga en la pared, en modo kiosco, sin controles visibles.

### Objetivo de negocio

Eliminar los carteles de precios impresos. Un cambio de precio en Gestión de Productos se refleja automáticamente en la pantalla. Si se cae el internet, la pantalla **sigue mostrando los precios** (offline-first).

### Objetivo técnico

- Extraer TODA la lógica de mapeo y agrupación a un módulo puro `displayMappers.js` (sin React, sin DOM, sin fetch) con tests vitest.
- Persistir la configuración de presentación en `system_settings` (clave `heladeria_display_precios_config`), **sin migraciones Alembic**.
- Cachear el menú en IndexedDB para arranque offline (reutilizar el patrón de [`heladeriaOfflineStore.js`](../apps/heladeria/services/heladeriaOfflineStore.js:1)).

---

## 🧩 ESTADO ACTUAL (evidencia)

| Elemento | Archivo | Estado |
|---|---|---|
| Sección Display Precios | [`DisplayPreciosUI.jsx`](../apps/heladeria/sections/DisplayPreciosUI.jsx:7) | 🔴 Placeholder (100 líneas, "Próximamente") |
| Endpoint de menú | [`GET /heladeria/display/menu`](../apps/api/modules/heladeria/router.py:100) | 🟢 **Verificado** (línea 100) |
| Endpoint de sabores | [`GET /heladeria/display/flavors`](../apps/api/modules/heladeria/router.py:91) | 🟢 **Verificado** (línea 91) |
| Almacén offline | [`heladeriaOfflineStore.js`](../apps/heladeria/services/heladeriaOfflineStore.js:1) | 🟢 Funcional (IndexedDB: `menu_cache` + `sync_queue`) |
| Configuración | `system_settings` | 🟢 Tabla existente ([`settings/service.py`](../apps/api/modules/settings/service.py:10)) |

**Conclusión:** el backend ya expone el menú con precios. Este plan es **mayoritariamente UI + lógica pura**, con riesgo de ejecución bajo.

---

## 🎯 FASE 17.1 — Guardián del contrato: `displayMappers.js` (lógica pura)

**🎯 Objetivo:** Extraer toda la lógica de mapeo, agrupación y formateo a un módulo puro testeable, ANTES de escribir una sola línea de UI.

**📍 Evidencia:** No existe `apps/heladeria/utils/displayMappers.js`. El patrón "guardián del contrato" ya se usó en [`warehouseMappers.js`](../apps/inventory/utils/warehouseMappers.js:1) y [`terminalCardState.js`](../apps/pos/utils/terminalCardState.js:1).

**🔧 Cambios:**

1. Crear `apps/heladeria/utils/displayMappers.js` con funciones puras:
   - `DEFAULT_DISPLAY_CONFIG` — configuración por defecto (`{ categories: [], groupBy: 'CATEGORY', showImages: true, columns: 3, theme: 'LIGHT' }`).
   - `normalizeDisplayConfig(raw)` — normaliza una config cruda (de `system_settings`) a la forma canónica, con defaults seguros.
   - `mapDisplayMenuFromApi(apiResponse)` — mapea la respuesta de `GET /heladeria/display/menu` a la forma interna (sin tocar precios, solo los transporta).
   - `groupItemsByCategory(items)` — agrupa por categoría respetando el orden del catálogo.
   - `filterVisibleCategories(groups, config)` — aplica la selección del admin.
   - `formatPrice(value, currency = 'MXN')` — formatea un precio (ej. `80` → `"$80.00"`). **Nunca inventa un precio.**
   - `buildDisplayViewModel(apiResponse, config)` — orquesta todo y devuelve el modelo listo para render.
   - `validateDisplayConfig(config)` — valida la config antes de guardarla.

2. Crear `apps/heladeria/utils/displayMappers.test.js` con ~12 tests:
   - `normalizeDisplayConfig` con `null`, `{}`, config parcial y config completa.
   - `mapDisplayMenuFromApi` con respuesta vacía, con 1 grupo, con N grupos.
   - `groupItemsByCategory` respeta el orden del catálogo.
   - `filterVisibleCategories` con lista vacía (= mostrar todo) y con selección explícita.
   - `formatPrice` con enteros, decimales, `null` y `0`.
   - `buildDisplayViewModel` end-to-end con datos reales de ejemplo.
   - `validateDisplayConfig` rechaza `columns` fuera de rango.
   - **Test de contrato:** verificar que `mapDisplayMenuFromApi` **NO modifica** los precios que recibe (los transporta tal cual).

**✅ Verificación:**
```bash
npx vitest run apps/heladeria/utils/displayMappers.test.js
```
12 tests verdes. Baseline: 141/141 → ~153/153.

**⚠️ Riesgo POS:** 🟢 **NULO.** Solo se crean archivos nuevos en `apps/heladeria/utils/`.

**⚠️ Riesgo Ejecución:** 🟢 **Bajo.** Lógica pura sin dependencias.

---

## 🎯 FASE 17.2 — `DisplayConfigPanel.jsx` (panel de administración)

**🎯 Objetivo:** Construir la cara de administración: elegir categorías, orden, columnas y tema.

**📍 Evidencia:** No existe el componente. El patrón de panel de configuración ya existe en [`SystemSettingsUI.jsx`](../apps/settings/SystemSettingsUI.jsx:1).

**🔧 Cambios:**

1. Crear `apps/heladeria/components/DisplayConfigPanel.jsx`:
   - Lista de categorías con checkbox (leídas del menú, **no hardcodeadas**).
   - Selector de columnas (2/3/4).
   - Selector de tema (claro/oscuro).
   - Toggle "mostrar imágenes".
   - Botón "Vista previa" que abre la landing de salida.
   - Botón "Guardar" que persiste en `system_settings` vía `PUT /settings/heladeria_display_precios_config`.

2. Crear `apps/heladeria/services/displayConfigService.js`:
   - `loadDisplayConfig()` — `GET /settings/heladeria_display_precios_config` con fallback a `DEFAULT_DISPLAY_CONFIG`.
   - `saveDisplayConfig(config)` — `PUT /settings/heladeria_display_precios_config`.
   - Usar `CONFIG.API_BASE_URL` (nunca `window.location.hostname`).

**✅ Verificación:**
```bash
npx vitest run
npm run build
```
Tests verdes + build OK. Baseline: ~153/153 → ~153/153 (sin tests nuevos; es UI).

**⚠️ Riesgo POS:** 🟢 **NULO.** Archivos nuevos en `apps/heladeria/`.

**⚠️ Riesgo Ejecución:** 🟡 **Medio.** Introduce una clave nueva en `system_settings` (reversible con un `DELETE`).

---

## 🎯 FASE 17.3 — `DisplayPreciosOutput.jsx` (salida offline-first)

**🎯 Objetivo:** Construir la pantalla de salida: modo kiosco, sin controles, que arranca sin red.

**📍 Evidencia:** El patrón offline-first ya está probado en [`heladeriaOfflineStore.js`](../apps/heladeria/services/heladeriaOfflineStore.js:1) (IndexedDB confirmado, línea 20: `indexedDB.open('heladeria_offline')`).

**🔧 Cambios:**

1. Crear `apps/heladeria/components/DisplayPreciosOutput.jsx`:
   - Renderiza el `buildDisplayViewModel` en grid de N columnas.
   - **Arranque offline-first:** primero lee de IndexedDB (`menu_cache`), luego intenta refrescar del API. **Nunca bloquea el render esperando al API.**
   - Indicador de "última actualización" (texto, **sin animación infinita** — Incidente 16.1).
   - Modo kiosco: sin botones, sin scroll visible, tipografía grande.

2. Extender `heladeriaOfflineStore.js` con `cacheDisplayMenu()` / `getCachedDisplayMenu()` (reutilizando el store `menu_cache` existente).

3. Reescribir [`DisplayPreciosUI.jsx`](../apps/heladeria/sections/DisplayPreciosUI.jsx:7) para alternar entre panel y salida (doble landing).

**✅ Verificación:**
```bash
npx vitest run
npm run build
```
Tests verdes + build OK.

**Verificación manual offline (crítica):**
1. Abrir el display con red → verificar que muestra precios.
2. **Apagar el API** (`docker stop rderico-api-dev`).
3. **Reiniciar el display** (F5).
4. Verificar que **sigue mostrando los precios** desde IndexedDB.
5. Levantar el API de nuevo → verificar que se refresca solo.

**⚠️ Riesgo POS:** 🟢 **NULO.** Archivos nuevos en `apps/heladeria/`.

**⚠️ Riesgo Ejecución:** 🟡 **Medio.** El arranque offline-first debe probarse explícitamente; si se implementa mal, el display queda en blanco sin red.

---

## 🎯 FASE 17.4 — Documentación

**🎯 Objetivo:** Actualizar la documentación del módulo.

**🔧 Cambios:**

1. Actualizar [`DOCUMENTACION_MODULO_HELADERIA.md`](../ESPECIFICACIONES%20DEL%20PROYECTO/DOCUMENTACION_MODULO_HELADERIA.md) sección 5.4 (secciones) con el nuevo estado del Display de Precios.
2. Documentar la clave `heladeria_display_precios_config` en la sección de `system_settings`.
3. Marcar la sección 13 "Próximos Pasos (Oleada 2)" como parcialmente resuelta.

**✅ Verificación:** Revisión manual del documento.

**⚠️ Riesgo POS:** 🟢 **NULO.**

**⚠️ Riesgo Ejecución:** 🟢 **Bajo.**

---

## 📊 ORDEN DE EJECUCIÓN Y COMMITS

| # | Fase | Commit sugerido | Riesgo POS | Riesgo Ejecución |
|---|---|---|---|---|
| 1 | 17.1 | `feat(heladeria): displayMappers.js puro + 12 tests` | 🟢 Nulo | 🟢 Bajo |
| 2 | 17.2 | `feat(heladeria): DisplayConfigPanel + displayConfigService` | 🟢 Nulo | 🟡 Medio |
| 3 | 17.3 | `feat(heladeria): DisplayPreciosOutput offline-first + doble landing` | 🟢 Nulo | 🟡 Medio |
| 4 | 17.4 | `docs(heladeria): documentar Display de Precios` | 🟢 Nulo | 🟢 Bajo |

---

## 🎯 CRITERIOS DE ACEPTACIÓN

- [ ] `displayMappers.js` es **puro** (sin React, sin DOM, sin `fetch`).
- [ ] `displayMappers.test.js` pasa con **~12 tests** verdes.
- [ ] El display muestra el menú agrupado por categoría con precios formateados.
- [ ] **CERO precios hardcodeados** en el código del display.
- [ ] El admin puede elegir qué categorías mostrar y se persiste en `system_settings`.
- [ ] **El display sobrevive un reinicio sin red** (verificación manual de los 5 pasos).
- [ ] **Cero** `window.location.hostname` en los archivos nuevos.
- [ ] **Cero** animaciones CSS infinitas en indicadores estáticos.
- [ ] **Cero** archivos de `apps/pos/` modificados.
- [ ] vitest: 141 → **≥153** tests, todos OK.
- [ ] pytest: 39 → **39** tests, todos OK (sin cambios de backend).
- [ ] build: transforma sin errores (≥1419 módulos).

---

## 🔄 PROTOCOLO DE REVERSIÓN

### Reversión de código

```bash
git revert HEAD --no-edit
git push origin main
```

### Reversión de estado externo

| Fase | Estado externo creado | Cómo revertirlo |
|---|---|---|
| 17.1 | Ninguno | N/A |
| 17.2 | Clave `heladeria_display_precios_config` en `system_settings` | `DELETE FROM system_settings WHERE key='heladeria_display_precios_config';` |
| 17.3 | Entradas en IndexedDB del navegador (`menu_cache`) | Limpiar el almacenamiento del sitio en el navegador |
| 17.4 | Ninguno | N/A |

### Verificación post-reversión

```bash
docker exec rderico-api-dev python -m pytest -q   # 39/39
npx vitest run                                     # 141/141
npm run build                                      # 1419 módulos
# + verificación manual del POS de Panadería
```

**Regla:** ante la duda, revertir. El POS nunca se queda roto.

---

## 📝 NOTAS DE DISEÑO

1. **¿Por qué doble landing (panel + salida) en vez de dos secciones?**
   Porque son **la misma pantalla en dos modos**: el admin configura, el cliente ve. Separarlas en dos secciones del Hub duplicaría el código de render. La doble landing mantiene un solo componente de salida y un solo modelo de datos.

2. **¿Por qué offline-first?**
   Porque un display que depende del API en vivo se queda **en blanco frente al cliente** si el API se cae. El display debe cachear el menú en IndexedDB y solo *refrescar* cuando hay red. Nunca bloquea el render esperando al API.

3. **¿Por qué la config va en `system_settings` y no en una tabla nueva?**
   Porque es **configuración de presentación**, no datos de negocio. Usar `system_settings` evita una migración Alembic y hace la reversión trivial (un `DELETE`). Regla del plan maestro: se prefiere **NO usar migraciones** para configuraciones.

4. **¿Por qué el display NO puede definir precios?**
   Porque **Gestión de Productos es el maestro único** (Restricción B). Si el display tuviera sus propios precios, habría **doble fuente de verdad**: el POS cobraría un precio y la pantalla mostraría otro. El display **lee** el catálogo y solo decide **cómo presentarlo**.

5. **¿Por qué este plan va primero en la oleada?**
   Porque es el más simple (display de solo lectura, endpoint ya verificado) y valida el patrón "display" (doble landing + offline-first) que V16 reutilizará. Es el de menor riesgo de ejecución.

---

## ✅ CHECKLIST DE APROBACIÓN

- [ ] El usuario aprueba el alcance (doble landing + offline-first + config en `system_settings`).
- [ ] El usuario aprueba el orden de ejecución (17.1 → 17.4).
- [ ] El usuario confirma que **Gestión de Productos es el maestro único** y el display solo lee.
- [ ] El usuario confirma que NO se **modificará** ningún archivo de `apps/pos/`.
- [ ] El usuario confirma que el display debe **sobrevivir un reinicio sin red**.
