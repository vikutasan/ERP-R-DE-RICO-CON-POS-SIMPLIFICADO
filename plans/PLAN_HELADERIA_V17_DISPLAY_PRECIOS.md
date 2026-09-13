# 💰 PLAN HELADERÍA V17 — DISPLAY DE PRECIOS (Doble Landing + Offline-First)

**Fecha:** 13/Septiembre/2026
**Autor:** Auditoría técnica derivada de [`DOCUMENTACION_MODULO_HELADERIA.md`](../ESPECIFICACIONES%20DEL%20PROYECTO/DOCUMENTACION_MODULO_HELADERIA.md)
**Estado:** ⏳ PROPUESTO — REVISIÓN 2 (corregidos 9 defectos de la revisión 1)
**Alcance:** Convertir el placeholder [`DisplayPreciosUI.jsx`](../apps/heladeria/sections/DisplayPreciosUI.jsx:7) en un display de precios de doble landing (panel de administración + salida de pantalla completa), offline-first, alimentado por el catálogo maestro.
**Depende de:** FASE 0 (completada, commit `545e0b5`) — el saneamiento de `heladeriaTerminals.js` ya está hecho.
**Bloquea a:** Nada (V16 reutiliza el patrón "display" que este plan valida).

> **REVISIÓN 2 (13/Sept/2026):** Este documento fue corregido tras una auto-auditoría crítica contra el **código real**. Se corrigieron **9 defectos**, de los cuales **3 eran bloqueantes** (el plan habría fallado en ejecución):
> 1. **BLOQUEANTE:** el plan usaba `PUT /settings/{key}`, que **no existe** — el router solo expone `PATCH` ([`settings/router.py:17`](../apps/api/modules/settings/router.py:17)).
> 2. **BLOQUEANTE:** `update_setting` **no crea claves nuevas** — lanza 404 si la clave no existe ([`settings/service.py:17`](../apps/api/modules/settings/service.py:17)). El plan ahora incluye una **FASE 17.0** que siembra la clave vía `POST /settings/seed`.
> 3. **BLOQUEANTE:** el plan asumía que `/display/menu` agrupa por **categoría**, pero el API agrupa por **`component_type`** y `MenuItemResponse` **no tiene campo `category`** ([`heladeria/service.py:267`](../apps/api/modules/heladeria/service.py:267), [`heladeria/schemas.py`](../apps/api/modules/heladeria/schemas.py:1)). El plan ahora **rediseña el eje de presentación** sobre `component_type` con etiquetas legibles.
> 4. Baseline de tests actualizado (141 → **189**; 1419 → **1424** módulos).
> 5. `formatPrice` ahora maneja explícitamente el `Decimal` serializado como **string**.
> 6. Se crea `getCachedDisplayMenu()` con **TTL largo (24h)**, en lugar de reutilizar el caché de 30 min que rompía el requisito offline.
> 7. La reversión de IndexedDB ahora es **operativamente viable** (botón "Limpiar caché" en el panel).
> 8. Se define el tratamiento de `is_available=false` (se muestran **atenuados con etiqueta "AGOTADO"**, no se ocultan).
> 9. Se define el **mecanismo concreto** del modo kiosco (`?mode=output` en la URL).
>
> Ver **ANEXO A — Bitácora de correcciones** al final.

---

## 🚨 PROTOCOLO DE NO-INTERFERENCIA AL POS (OBLIGATORIO)

> **Este plan NO puede romper el POS de Panadería. Punto.**
> El POS está en producción y cualquier regresión cuesta dinero real.
> La Heladería es un módulo **aislado**: si se cae, la Panadería sigue operando.

### Reglas de ejecución

1. **PROHIBIDO tocar** [`apps/pos/RetailVisionPOS.jsx`](../apps/pos/RetailVisionPOS.jsx), [`apps/pos/hooks/useTerminalLocking.js`](../apps/pos/hooks/useTerminalLocking.js), [`apps/pos/hooks/useBeforeUnload.js`](../apps/pos/hooks/useBeforeUnload.js) y [`apps/pos/services/POSService.js`](../apps/pos/services/POSService.js) — territorio sagrado del POS.
2. **PROHIBIDO modificar** [`apps/pos/config.js`](../apps/pos/config.js) — es la única fuente de verdad de URLs. Solo se **lee**.
3. **PROHIBIDO** construir URLs con `window.location.hostname`. Siempre `CONFIG.API_BASE_URL`.
4. **PROHIBIDO** animaciones CSS infinitas en indicadores estáticos (Incidente 16.1 — Efecto Estrobo).
5. **PROHIBIDO** introducir `setInterval`/timers que escriban en el carrito del POS de Panadería. Los timers de Heladería viven **solo** dentro de `apps/heladeria/`.
6. **Cada fase es un commit independiente** y debe pasar la verificación completa antes de continuar.
7. **Si una fase falla la verificación, se revierte inmediatamente** (`git revert`) y se documenta el motivo.
8. **Ninguna fase se ejecuta en horario de operación del POS** (idealmente antes de abrir o después de cerrar).
9. **Toda integración con el POS se envuelve en `try/catch` silencioso** para que un fallo de Heladería jamás interrumpa la Panadería.

### ⚠️ Frontera de archivos compartidos (CRÍTICO para este plan)

Este plan **SÍ toca** dos archivos que **también usa el POS de Panadería**. Es el punto de mayor riesgo y se trata con máxima cautela:

| Archivo compartido | Lo usa el POS IA | Lo usa V17 | Regla de oro |
|---|---|---|---|
| [`apps/api/modules/settings/router.py`](../apps/api/modules/settings/router.py:1) | ✅ (lee settings) | ✅ (FASE 17.0 añade `POST /seed` idempotente) | **Solo se AÑADE** un endpoint nuevo. **PROHIBIDO modificar** los endpoints existentes (`GET /`, `GET /{key}`, `PATCH /{key}`). |
| [`apps/api/modules/settings/service.py`](../apps/api/modules/settings/service.py:1) | ✅ (lee settings) | ✅ (FASE 17.0 añade la clave al seed) | **Solo se AÑADE** una entrada a la lista `default_settings`. **PROHIBIDO tocar** `get_settings`, `get_setting_by_key`, `update_setting`. |

> **Justificación:** `POST /settings/seed` **ya existe** ([`router.py:21`](../apps/api/modules/settings/router.py:21)) y es **idempotente** (solo inserta claves que no existen, [`service.py:105-108`](../apps/api/modules/settings/service.py:105)). Añadir una entrada a `default_settings` es **aditivo y seguro**: no altera el comportamiento del POS, que solo lee claves existentes. **El POS nunca llama a `/seed`.**

### Verificación obligatoria por fase

```bash
# 1. Tests backend (baseline REAL tras V14: 39/39)
docker exec rderico-api-dev python -m pytest -q

# 2. Tests frontend (baseline REAL tras V14: 189/189)
npx vitest run

# 3. Build de producción (baseline REAL tras V14: 1424 módulos)
npm run build

# 4. POS Panadería (manual): abrir http://localhost:5000, agregar producto, sin banner falso
# 5. Hub Heladería (manual): entrar al Display de Precios, verificar que las demás secciones siguen accesibles
```

> **Nota de entorno:** Python **NO** está en el PATH del host. `pytest` se ejecuta **siempre** vía `docker exec rderico-api-dev python -m pytest -q`.

---

## 🧭 RESTRICCIONES ARQUITECTÓNICAS DEL PROYECTO (aplican a este plan)

### Restricción A — El POS intocable es el módulo **"Punto de Venta IA"**

Cuando este plan dice "no interferir con el POS", se refiere **específicamente** al módulo del ERP llamado **Punto de Venta IA** (el POS de Panadería en producción, [`apps/pos/RetailVisionPOS.jsx`](../apps/pos/RetailVisionPOS.jsx:29)).

**Implicaciones:**
- El **Display de Precios es un módulo de Heladería** y **sí se modifica**.
- Lo único intocable es el POS IA de Panadería y sus archivos núcleo (ver regla #1).

### Restricción B — **Gestión de Productos es el MAESTRO ÚNICO de productos**

El módulo **Gestión de Productos** ([`apps/api/modules/catalog/`](../apps/api/modules/catalog/models.py:1)) es la **única fuente de verdad** respecto a productos y categorías. **Este plan NO crea, duplica ni redefine productos.**

| Acción | ¿Puede hacerla el Display de Precios? |
|---|---|
| Crear/editar un producto o categoría | ❌ **NO** — se hace en Gestión de Productos |
| Cambiar un precio | ❌ **NO** — se hace en Gestión de Productos |
| Decidir en qué POS aparece un producto | ❌ **NO** — se define en Gestión de Productos |
| Leer el menú con precios para mostrarlo | ✅ **SÍ** |
| Elegir qué **grupos de componente** mostrar en pantalla | ✅ **SÍ** (configuración de presentación, no de catálogo) |

> **Consecuencia de diseño:** **CERO precios hardcodeados**. Un cambio de precio en Gestión de Productos debe reflejarse en el display **sin tocar código**. El display solo decide **cómo presentar** (agrupación, orden, tipografía), nunca **qué vale** cada producto.

> **⚠️ Dependencia futura (no bloqueante):** el mecanismo de "en qué POS aparece cada producto/categoría" se definirá en Gestión de Productos. Cuando exista, el display deberá **consumirlo** en lugar de asumir que todo producto de heladería aparece siempre.

---

## 📋 RESUMEN

La sección **Display Precios** es hoy un **placeholder de 100 líneas** ([`DisplayPreciosUI.jsx`](../apps/heladeria/sections/DisplayPreciosUI.jsx:7)) que muestra "Próximamente". Este plan la convierte en un **display de precios real** con dos caras:

1. **Panel de administración** (landing 1): el dueño elige qué grupos mostrar, el orden, las columnas y el tema.
2. **Salida de pantalla completa** (landing 2): la pantalla que se cuelga en la pared, en modo kiosco, sin controles visibles.

### Objetivo de negocio

Eliminar los carteles de precios impresos. Un cambio de precio en Gestión de Productos se refleja automáticamente en la pantalla. Si se cae el internet, la pantalla **sigue mostrando los precios** (offline-first).

### Objetivo técnico

- Extraer TODA la lógica de mapeo y agrupación a un módulo puro `displayMappers.js` (sin React, sin DOM, sin fetch) con tests vitest.
- Persistir la configuración de presentación en `system_settings` (clave `heladeria_display_precios_config`), **sin migraciones Alembic**.
- Cachear el menú en IndexedDB para arranque offline (con **TTL largo de 24h**, no el de 30 min del caché del POS).

---

## 🧩 ESTADO ACTUAL (evidencia verificada en código)

| Elemento | Archivo | Estado |
|---|---|---|
| Sección Display Precios | [`DisplayPreciosUI.jsx`](../apps/heladeria/sections/DisplayPreciosUI.jsx:7) | 🔴 Placeholder (100 líneas, "Próximamente") |
| Endpoint de menú | [`GET /heladeria/display/menu`](../apps/api/modules/heladeria/router.py:100) | 🟢 **Verificado** (línea 100) |
| Endpoint de sabores | [`GET /heladeria/display/flavors`](../apps/api/modules/heladeria/router.py:91) | 🟢 **Verificado** (línea 91) |
| Almacén offline | [`heladeriaOfflineStore.js`](../apps/heladeria/services/heladeriaOfflineStore.js:1) | 🟢 Funcional (IndexedDB: `menu_cache` + `sync_queue`) |
| Configuración | `system_settings` | 🟢 Tabla existente ([`settings/service.py`](../apps/api/modules/settings/service.py:10)) |
| Endpoint de guardado | [`PATCH /settings/{key}`](../apps/api/modules/settings/router.py:17) | 🟢 **Verificado** — es **PATCH**, no PUT |
| Endpoint de siembra | [`POST /settings/seed`](../apps/api/modules/settings/router.py:21) | 🟢 **Verificado** — idempotente |

### 🔬 Contrato REAL de `GET /heladeria/display/menu` (verificado)

```json
{
  "groups": [
    {
      "component_type": "SABOR",
      "items": [
        {
          "config_id": 12,
          "product_id": 340,
          "name": "Pistache",
          "price": "45.00",          // ← Decimal serializado como STRING
          "image": "/assets/...",
          "component_type": "SABOR",
          "is_available": true,
          "max_scoops": null,
          "base_price": null,
          "price_per_scoop": null,
          "position": 3
        }
      ]
    }
  ],
  "total_items": 42,
  "last_updated": "2026-09-13T23:00:00"
}
```

**Hallazgos críticos de este contrato:**
1. **NO existe campo `category`.** El eje de agrupación es **`component_type`** (RECIPIENTE, SABOR, EXTRA, BEBIDA_BASE, TAMAÑO).
2. **`price` llega como STRING** (`"45.00"`), no como número. `formatPrice` debe parsearlo.
3. `last_updated` viene del servidor en hora local del servidor (no UTC con `Z`).

**Conclusión:** el backend ya expone el menú con precios. Este plan es **mayoritariamente UI + lógica pura**, con riesgo de ejecución bajo, **siempre que se respete el contrato real** (no el asumido en la revisión 1).

---

## 🗺️ MAPEO DE PRESENTACIÓN (decisión de diseño corregida)

Como el API **no envía `category`**, el display agrupa por **`component_type`** y traduce cada uno a una **etiqueta legible para el cliente**:

| `component_type` (API) | Etiqueta en pantalla | Orden de presentación |
|---|---|---|
| `RECIPIENTE` | 🍦 Conos y Vasos | 1 |
| `TAMAÑO` | 📏 Tamaños | 2 |
| `SABOR` | 🍨 Sabores | 3 |
| `EXTRA` | ✨ Toppings y Extras | 4 |
| `BEBIDA_BASE` | 🥤 Bases de Malteada | 5 |
| *(desconocido)* | *(el propio `component_type`)* | 99 (al final) |

> **Regla:** este mapeo de **etiquetas** es la **única** traducción permitida. **PROHIBIDO** que el display invente precios, productos o categorías que no vengan del API. Si aparece un `component_type` nuevo, se muestra con su nombre crudo (no se oculta, no se rompe).

> **Nota de negocio:** si en el futuro se quiere agrupar por la **categoría del catálogo** (ej. "Malteadas", "Conos"), eso requiere **extender `MenuItemResponse` con `category`** en el backend. Se documenta como **mejora futura**, fuera del alcance de V17 (tocaría el contrato del API que también consume el POS de Heladería). **V17 no lo hace.**

---

## 🎯 FASE 17.0 — Sembrar la clave de configuración (backend, aditivo)

**🎯 Objetivo:** Garantizar que la clave `heladeria_display_precios_config` exista en `system_settings` ANTES de que el frontend intente guardarla, porque `update_setting` **lanza 404 si la clave no existe**.

**📍 Evidencia:** [`settings/service.py:17`](../apps/api/modules/settings/service.py:17) — `update_setting` llama a `get_setting_by_key`, que lanza `HTTPException(404)` si no encuentra la clave. **No hay endpoint de creación de claves.**

**🔧 Cambios (MÍNIMOS y ADITIVOS):**

1. En [`apps/api/modules/settings/service.py`](../apps/api/modules/settings/service.py:24), añadir **UNA entrada** a la lista `default_settings` dentro de `seed_settings`:
   ```python
   {
       "key": "heladeria_display_precios_config",
       "value": '{"groups":[],"columns":3,"theme":"LIGHT","showImages":true,"showUnavailable":true}',
       "description": "Configuración de presentación del Display de Precios de Heladería (V17).",
       "category": "heladeria",
       "input_type": "json"
   }
   ```
   > **PROHIBIDO** tocar cualquier otra línea de `seed_settings`. El bucle de inserción ([`service.py:105-108`](../apps/api/modules/settings/service.py:105)) ya es idempotente: solo inserta si la clave no existe.

2. **NO se toca** [`settings/router.py`](../apps/api/modules/settings/router.py:1). El endpoint `POST /settings/seed` **ya existe** ([línea 21](../apps/api/modules/settings/router.py:21)) y es suficiente.

3. **Ejecutar el seed una vez** (operación de despliegue, no de código). El prefijo real del router es `/api/v1/settings` ([`main.py:307`](../apps/api/main.py:307)):
   ```powershell
   # El contenedor NO tiene curl. Se llama desde el host con Invoke-WebRequest.
   powershell -NoProfile -Command "Invoke-WebRequest -Method POST -Uri 'http://localhost:5001/api/v1/settings/seed' -SkipHttpErrorCheck | Select-Object -ExpandProperty StatusCode"
   # Debe devolver 200. Es idempotente: llamarlo N veces no duplica claves.
   ```
   > **PROHIBIDO** ejecutar el seed con un one-liner de Python improvisado. El endpoint `POST /api/v1/settings/seed` **ya existe** y es la vía oficial.

**✅ Verificación:**
```bash
# 1. La clave existe
docker exec rderico-db-dev psql -U user -d rderico -c "SELECT key, category, input_type FROM system_settings WHERE key='heladeria_display_precios_config';"
# Debe devolver 1 fila.

# 2. El POS de Panadería sigue leyendo settings sin error
#    (verificación manual: abrir http://localhost:5000, la Vista General carga)

# 3. pytest sigue en 39/39
docker exec rderico-api-dev python -m pytest -q
```

**⚠️ Riesgo POS:** 🟢 **NULO.** Solo se **añade** una entrada a una lista; el bucle de seed es idempotente y el POS nunca llama a `/seed`. Los endpoints que el POS usa (`GET /settings/`, `GET /settings/{key}`) **no se tocan**.

**⚠️ Riesgo Ejecución:** 🟢 **Bajo.** Cambio de 6 líneas en una lista.

**🔄 Reversión:** `DELETE FROM system_settings WHERE key='heladeria_display_precios_config';` + `git revert`.

---

## 🎯 FASE 17.1 — Guardián del contrato: `displayMappers.js` (lógica pura)

**🎯 Objetivo:** Extraer toda la lógica de mapeo, agrupación y formateo a un módulo puro testeable, ANTES de escribir una sola línea de UI.

**📍 Evidencia:** No existe `apps/heladeria/utils/displayMappers.js`. El patrón "guardián del contrato" ya se usó en [`warehouseMappers.js`](../apps/inventory/utils/warehouseMappers.js:1) y [`terminalCardState.js`](../apps/pos/utils/terminalCardState.js:1).

**🔧 Cambios:**

1. Crear `apps/heladeria/utils/displayMappers.js` con funciones puras:
   - `COMPONENT_TYPE_LABELS` — mapa `component_type` → etiqueta legible (ver tabla de mapeo arriba).
   - `COMPONENT_TYPE_ORDER` — mapa `component_type` → orden de presentación.
   - `DEFAULT_DISPLAY_CONFIG` — `{ groups: [], columns: 3, theme: 'LIGHT', showImages: true, showUnavailable: true }`.
   - `normalizeDisplayConfig(raw)` — normaliza una config cruda (de `system_settings`, que llega como **string JSON**) a la forma canónica, con defaults seguros. Debe tolerar `null`, `{}`, string inválido y config parcial.
   - `mapDisplayMenuFromApi(apiResponse)` — mapea la respuesta de `GET /heladeria/display/menu` a la forma interna. **Transporta los precios tal cual** (no los convierte, no los redondea).
   - `groupItemsByComponentType(items)` — agrupa por `component_type` respetando `COMPONENT_TYPE_ORDER`.
   - `filterVisibleGroups(groups, config)` — aplica la selección del admin (lista vacía = mostrar todo).
   - `formatPrice(value, currency = 'MXN')` — formatea un precio. **Acepta string o número** (el API envía string). Ej. `"45.00"` → `"$45.00"`. **Nunca inventa un precio**; si el valor es inválido, devuelve `"—"`.
   - `buildDisplayViewModel(apiResponse, config)` — orquesta todo y devuelve el modelo listo para render.
   - `validateDisplayConfig(config)` — valida la config antes de guardarla (rechaza `columns` fuera de `[2,3,4]`, `theme` fuera de `['LIGHT','DARK']`).

2. Crear `apps/heladeria/utils/displayMappers.test.js` con **~15 tests**:
   - `normalizeDisplayConfig` con `null`, `{}`, **string JSON válido**, **string JSON inválido**, config parcial y config completa.
   - `mapDisplayMenuFromApi` con respuesta vacía, con 1 grupo, con N grupos.
   - `groupItemsByComponentType` respeta `COMPONENT_TYPE_ORDER` (RECIPIENTE antes que SABOR).
   - `groupItemsByComponentType` con `component_type` desconocido → va al final, no rompe.
   - `filterVisibleGroups` con lista vacía (= mostrar todo) y con selección explícita.
   - `formatPrice` con **string `"45.00"`**, número `45`, decimal `45.5`, `null`, `0`, `"abc"` (inválido → `"—"`).
   - `buildDisplayViewModel` end-to-end con datos reales de ejemplo.
   - `validateDisplayConfig` rechaza `columns` fuera de rango y `theme` inválido.
   - **Test de contrato:** verificar que `mapDisplayMenuFromApi` **NO modifica** los precios que recibe (los transporta tal cual, string incluido).

**✅ Verificación:**
```bash
npx vitest run apps/heladeria/utils/displayMappers.test.js
```
15 tests verdes. Baseline: **189/189 → ~204/204**.

**⚠️ Riesgo POS:** 🟢 **NULO.** Solo se crean archivos nuevos en `apps/heladeria/utils/`.

**⚠️ Riesgo Ejecución:** 🟢 **Bajo.** Lógica pura sin dependencias.

**🔄 Reversión:** `git revert` (no hay estado externo).

---

## 🎯 FASE 17.2 — `DisplayConfigPanel.jsx` (panel de administración)

**🎯 Objetivo:** Construir la cara de administración: elegir grupos, columnas, tema y visibilidad.

**📍 Evidencia:** No existe el componente. El patrón de panel de configuración ya existe en [`SystemSettingsUI.jsx`](../apps/settings/SystemSettingsUI.jsx:1).

**🔧 Cambios:**

1. Crear `apps/heladeria/services/displayConfigService.js`:
   - `loadDisplayConfig()` — `GET /settings/heladeria_display_precios_config` con fallback a `DEFAULT_DISPLAY_CONFIG`. **Debe parsear el `value` (string JSON) con `normalizeDisplayConfig`.**
   - `saveDisplayConfig(config)` — **`PATCH /settings/heladeria_display_precios_config`** con body `{ value: JSON.stringify(config) }`. **NO usar PUT** (no existe).
   - Usar `CONFIG.API_BASE_URL` (nunca `window.location.hostname`).
   - Usar `withRetries` (patrón de [`heladeriaService.js`](../apps/heladeria/services/heladeriaService.js:10)).

2. Crear `apps/heladeria/components/DisplayConfigPanel.jsx`:
   - Lista de **grupos de componente** con checkbox (leídos del menú vía `COMPONENT_TYPE_LABELS`, **no hardcodeados**).
   - Selector de columnas (2/3/4).
   - Selector de tema (claro/oscuro).
   - Toggle "mostrar imágenes".
   - Toggle "mostrar agotados" (`showUnavailable`).
   - Botón "Vista previa" que abre la landing de salida (`?mode=output`).
   - Botón "Guardar" que persiste vía `saveDisplayConfig`.
   - Botón **"Limpiar caché del display"** que borra la clave `'display_menu'` del store `menu_cache` de IndexedDB (para la reversión operativa — ver FASE 17.3). **No borra** la clave `'full_menu'` del POS de Heladería.

**✅ Verificación:**
```bash
npx vitest run
npm run build
```
Tests verdes + build OK. Baseline: **~204/204 → ~204/204** (sin tests nuevos; es UI).

**⚠️ Riesgo POS:** 🟢 **NULO.** Archivos nuevos en `apps/heladeria/`. El `PATCH` a una clave **nueva** (`heladeria_display_precios_config`) no afecta las claves que lee el POS.

**⚠️ Riesgo Ejecución:** 🟡 **Medio.** Depende de que la FASE 17.0 haya sembrado la clave (si no, el `PATCH` da 404).

**🔄 Reversión:** `git revert` + `DELETE FROM system_settings WHERE key='heladeria_display_precios_config';`

---

## 🎯 FASE 17.3 — `DisplayPreciosOutput.jsx` (salida offline-first)

**🎯 Objetivo:** Construir la pantalla de salida: modo kiosco, sin controles, que arranca sin red.

**📍 Evidencia:** El patrón offline-first ya está probado en [`heladeriaOfflineStore.js`](../apps/heladeria/services/heladeriaOfflineStore.js:1) (IndexedDB confirmado, línea 20: `indexedDB.open('heladeria_offline')`).

**🔧 Cambios:**

1. **Extender** [`heladeriaOfflineStore.js`](../apps/heladeria/services/heladeriaOfflineStore.js:1) con dos funciones nuevas, **reutilizando el store existente `menu_cache`** (no se crea un store nuevo — evita tocar `DB_VERSION` y arriesgar una migración de IndexedDB que afectaría al POS de Heladería):
   - `cacheDisplayMenu(menuData)` — guarda con clave `'display_menu'` (distinta de `'full_menu'` que usa el POS) y `cachedAt`.
   - `getCachedDisplayMenu()` — lee la clave `'display_menu'` **SIN el TTL de 30 min**. Usa un **TTL de 24h**. **Motivo:** el requisito es "sobrevive un reinicio sin red"; el caché de 30 min del POS rompería ese requisito si el API lleva más de 30 min caído.
   > **PROHIBIDO modificar** `cacheMenu`/`getCachedMenu` existentes (los usa el POS de Heladería) y **PROHIBIDO** cambiar `DB_VERSION` o `STORES`. Solo se **añaden** dos funciones nuevas que escriben una clave nueva (`'display_menu'`) en el store ya existente.

2. Crear `apps/heladeria/components/DisplayPreciosOutput.jsx`:
   - Renderiza el `buildDisplayViewModel` en grid de N columnas.
   - **Arranque offline-first:** primero lee de IndexedDB (`getCachedDisplayMenu`), luego intenta refrescar del API. **Nunca bloquea el render esperando al API.**
   - Muestra los productos con `is_available=false` **atenuados con etiqueta "AGOTADO"** (no se ocultan, salvo que `showUnavailable=false`).
   - Indicador de "última actualización" (texto, **sin animación infinita** — Incidente 16.1).
   - Modo kiosco: sin botones, sin scroll visible, tipografía grande.

3. Reescribir [`DisplayPreciosUI.jsx`](../apps/heladeria/sections/DisplayPreciosUI.jsx:7) para alternar entre panel y salida (doble landing):
   - **Mecanismo concreto:** lee `?mode=output` de la URL (`new URLSearchParams(window.location.search)`).
     - `?mode=output` → renderiza `DisplayPreciosOutput` (modo kiosco, sin botón "Regresar").
     - Sin parámetro (o cualquier otro) → renderiza `DisplayConfigPanel` (modo admin, con botón "Regresar").
   - **PROHIBIDO** usar `window.location.hostname` para construir URLs de API (solo se usa `window.location.search` para leer el modo, que es legítimo).

**✅ Verificación:**
```bash
npx vitest run
npm run build
```
Tests verdes + build OK.

**Verificación manual offline (crítica):**
1. Abrir el display con red (`http://localhost:5000/...?mode=output`) → verificar que muestra precios.
2. **Apagar el API** (`docker stop rderico-api-dev`).
3. **Reiniciar el display** (F5).
4. Verificar que **sigue mostrando los precios** desde IndexedDB.
5. Levantar el API de nuevo → verificar que se refresca solo.

**⚠️ Riesgo POS:** 🟢 **NULO.** Archivos nuevos en `apps/heladeria/`. Las funciones nuevas de IndexedDB usan una clave distinta (`display_menu`) y no tocan `full_menu`.

**⚠️ Riesgo Ejecución:** 🟡 **Medio.** El arranque offline-first debe probarse explícitamente; si se implementa mal, el display queda en blanco sin red.

**🔄 Reversión:** `git revert` + botón "Limpiar caché del display" (FASE 17.2) o limpiar el almacenamiento del sitio.

---

## 🎯 FASE 17.4 — Documentación

**🎯 Objetivo:** Actualizar la documentación del módulo.

**🔧 Cambios:**

1. Actualizar [`DOCUMENTACION_MODULO_HELADERIA.md`](../ESPECIFICACIONES%20DEL%20PROYECTO/DOCUMENTACION_MODULO_HELADERIA.md) sección 5.4 (secciones) con el nuevo estado del Display de Precios.
2. Documentar la clave `heladeria_display_precios_config` en la sección de `system_settings`.
3. Documentar el mapeo `component_type` → etiqueta legible.
4. Marcar la sección 13 "Próximos Pasos (Oleada 2)" como parcialmente resuelta.

**✅ Verificación:** Revisión manual del documento.

**⚠️ Riesgo POS:** 🟢 **NULO.**

**⚠️ Riesgo Ejecución:** 🟢 **Bajo.**

**🔄 Reversión:** `git revert`.

---

## 📊 ORDEN DE EJECUCIÓN Y COMMITS

| # | Fase | Commit sugerido | Riesgo POS | Riesgo Ejecución |
|---|---|---|---|---|
| 1 | 17.0 | `feat(settings): sembrar clave heladeria_display_precios_config (V17 Fase 17.0)` | 🟢 Nulo | 🟢 Bajo |
| 2 | 17.1 | `feat(heladeria): displayMappers.js puro + 15 tests (V17 Fase 17.1)` | 🟢 Nulo | 🟢 Bajo |
| 3 | 17.2 | `feat(heladeria): DisplayConfigPanel + displayConfigService (V17 Fase 17.2)` | 🟢 Nulo | 🟡 Medio |
| 4 | 17.3 | `feat(heladeria): DisplayPreciosOutput offline-first + doble landing (V17 Fase 17.3)` | 🟢 Nulo | 🟡 Medio |
| 5 | 17.4 | `docs(heladeria): documentar Display de Precios (V17 Fase 17.4)` | 🟢 Nulo | 🟢 Bajo |

---

## 🎯 CRITERIOS DE ACEPTACIÓN

- [ ] La clave `heladeria_display_precios_config` existe en `system_settings` (FASE 17.0).
- [ ] `displayMappers.js` es **puro** (sin React, sin DOM, sin `fetch`).
- [ ] `displayMappers.test.js` pasa con **~15 tests** verdes.
- [ ] El display muestra el menú agrupado por `component_type` con etiquetas legibles y precios formateados.
- [ ] **CERO precios hardcodeados** en el código del display.
- [ ] `formatPrice` maneja correctamente el precio como **string** (`"45.00"` → `"$45.00"`).
- [ ] El admin puede elegir qué grupos mostrar y se persiste en `system_settings` vía `PATCH /settings/heladeria_display_precios_config` (nunca `PUT`).
- [ ] El panel de administración **nunca** llama a `PUT /settings/{key}` (no existe → 405).
- [ ] El modo kiosco se activa con `?mode=output` en la URL y **oculta** el botón de administración.
- [ ] El display **sobrevive a un reinicio sin red**: al recargar con el API caído, muestra el último menú cacheado (TTL 24h).
- [ ] `getCachedDisplayMenu()` usa TTL de **24h**, no el de 30 min del POS.
- [ ] Los productos con `is_available=false` se muestran **atenuados con etiqueta "AGOTADO"** (no se ocultan).
- [ ] El botón **"Limpiar caché"** del panel borra la clave `'display_menu'` del store `menu_cache` de IndexedDB (reversión operativa), **sin** tocar la clave `'full_menu'` del POS de Heladería.
- [ ] **CERO** `window.location.hostname` en el código nuevo (solo `CONFIG.API_BASE_URL`).
- [ ] **CERO** animaciones CSS infinitas en indicadores estáticos (Incidente 16.1).
- [ ] **CERO** archivos bajo `apps/pos/` modificados (`git diff --name-only` no lista `apps/pos/`).
- [ ] `npx vitest run` → **189/189** (o más, nunca menos) tests verdes.
- [ ] `npm run build` → **1424** módulos (o más, nunca menos), sin errores.
- [ ] `docker exec rderico-api-dev python -m pytest -q` → **39/39** tests verdes.
- [ ] El POS de Panadería (`http://localhost:5000`) sigue operando: agregar producto, cobrar, sin banner falso.
- [ ] El Hub de Heladería sigue mostrando las 6 secciones accesibles tras el cambio.

---

## 🔄 PROTOCOLO DE REVERSIÓN

Cada fase es un commit atómico y reversible de forma independiente. La reversión **nunca** requiere tocar el POS.

### Reversión por fase

| Fase | Comando | Efecto | Riesgo POS |
|---|---|---|---|
| 17.0 | `git revert <hash>` | Elimina la entrada de `default_settings`. La clave ya sembrada en la BD **permanece** (inofensiva: nadie la lee). | 🟢 Nulo |
| 17.1 | `git revert <hash>` | Elimina `displayMappers.js` + su test. Nada más lo importa todavía. | 🟢 Nulo |
| 17.2 | `git revert <hash>` | Elimina `DisplayConfigPanel.jsx` + `displayConfigService.js`. | 🟢 Nulo |
| 17.3 | `git revert <hash>` | Restaura `DisplayPreciosUI.jsx` al placeholder original. | 🟢 Nulo |
| 17.4 | `git revert <hash>` | Revierte solo la documentación. | 🟢 Nulo |

### Reversión de datos (si la clave sembrada causa problemas)

```sql
-- La clave es inerte: el POS nunca la lee. Borrarla es seguro.
DELETE FROM system_settings WHERE key = 'heladeria_display_precios_config';
```

### Reversión de caché del navegador (operativa, sin git)

Si el display muestra datos corruptos o desactualizados en un equipo concreto:

1. Abrir el panel de administración (`/heladeria` → Display de Precios, sin `?mode=output`).
2. Pulsar **"Limpiar caché"** → borra la clave `'display_menu'` del store `menu_cache` de IndexedDB (no toca `'full_menu'`).
3. Recargar. El display vuelve a pedir el menú al API.

> **Por qué esto es viable:** la revisión 1 proponía "borrar IndexedDB a mano desde DevTools", lo cual **no es operativamente viable** en una tienda con personal no técnico. El botón lo resuelve en un clic.

### Criterio de aborto (cuándo revertir sin dudar)

- Si `npx vitest run` baja de **189** tests verdes → revertir la fase.
- Si `npm run build` falla o baja de **1424** módulos → revertir la fase.
- Si `docker exec rderico-api-dev python -m pytest -q` baja de **39/39** → revertir la fase.
- Si el POS de Panadería muestra cualquier regresión → revertir **todas** las fases de V17 y abrir incidencia.

---

## 🧠 NOTAS DE DISEÑO

### ¿Por qué el eje de presentación es `component_type` y no `category`?

El contrato real de `GET /heladeria/display/menu` ([`heladeria/service.py:267`](../apps/api/modules/heladeria/service.py:267)) devuelve grupos por **`component_type`**, y `MenuItemResponse` **no expone `category`** ([`heladeria/schemas.py`](../apps/api/modules/heladeria/schemas.py:1)). Inventar una agrupación por categoría habría exigido:

- Modificar `MenuItemResponse` (riesgo de romper el contrato que ya consume la Tienda Interactiva V14).
- Un `JOIN` adicional a `catalog.categories` (coste y acoplamiento innecesarios).

En su lugar, se **respeta el contrato existente** y se traduce `component_type` a una etiqueta legible en el frontend puro ([`displayMappers.js`](../apps/heladeria/utils/displayMappers.js:1)). Esto es coherente con la **Restricción B**: la Heladería solo **lee** el catálogo; la presentación es responsabilidad del display.

### ¿Por qué `PATCH` y no `PUT`?

El router de settings **solo expone `PATCH /{key}`** ([`settings/router.py:17`](../apps/api/modules/settings/router.py:17)). Un `PUT` devolvería **405 Method Not Allowed**. Además, `update_setting` **no crea claves** — lanza **404** si la clave no existe ([`settings/service.py:17`](../apps/api/modules/settings/service.py:17)). Por eso la **FASE 17.0** siembra la clave **antes** de que el panel intente escribirla.

### ¿Por qué TTL de 24h y no 30 min?

El requisito del display es **"sobrevivir a un reinicio sin red"** (pantalla de tienda que debe seguir mostrando precios aunque el API caiga). El caché existente del POS ([`heladeriaOfflineStore.js:54`](../apps/heladeria/services/heladeriaOfflineStore.js:54)) tiene un TTL de **30 min**, pensado para operaciones transaccionales, no para una pantalla pasiva. Reutilizarlo habría roto el requisito. Se crea `getCachedDisplayMenu()` con TTL de **24h**, escribiendo en una **clave separada** (`'display_menu'`) dentro del store `menu_cache` ya existente, para no interferir con la clave `'full_menu'` del POS de Heladería ni arriesgar una migración de `DB_VERSION`.

### ¿Por qué `?mode=output` y no detección automática?

La revisión 1 no definía **cómo** se activaba el modo kiosco. La detección automática (por `window.location.hostname`, por tamaño de pantalla, por user-agent) es **frágil y prohibida** (regla 3 del protocolo). Un parámetro explícito en la URL es:

- **Determinista:** la misma URL siempre da el mismo modo.
- **Configurable por el operador:** se guarda como acceso directo / marcador en el equipo kiosco.
- **Testeable:** `displayMappers.js` puede exponer `resolveDisplayMode(search)` como función pura.

### Manejo del precio como string

`price` es un `Decimal` de Pydantic que se serializa como **string** en JSON (`"45.00"`). `formatPrice` debe:

1. Aceptar `string | number`.
2. Convertir con `Number(...)` de forma segura.
3. Rechazar `NaN` devolviendo un marcador (`"—"`) en lugar de `"$NaN"`.
4. Formatear con `Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' })`.

### Tratamiento de `is_available=false`

Un sabor agotado **sigue siendo información útil** para el cliente (sabe que existe y que puede volver). Ocultarlo genera confusión ("¿por qué no está el pistache?"). Se muestra **atenuado** (`opacity-50`) con etiqueta **"AGOTADO"**, controlado por el flag `showUnavailable` de la configuración.

---

## 📎 ANEXO A — BITÁCORA DE CORRECCIONES (Revisión 1 → Revisión 2)

Esta bitácora documenta **cada defecto** detectado en la auto-auditoría crítica de la revisión 1, su evidencia en el código real y la corrección aplicada. Se incluye para que un futuro auditor pueda verificar que **no se repitieron** los errores de la FASE 0 (asumir endpoints inexistentes).

| # | Severidad | Defecto en Revisión 1 | Evidencia en el código real | Corrección en Revisión 2 |
|---|---|---|---|---|
| 1 | 🔴 **BLOQUEANTE** | Usaba `PUT /settings/{key}` para guardar la config. | [`settings/router.py:17`](../apps/api/modules/settings/router.py:17) solo expone `@router.patch("/{key}")`. Un `PUT` → **405**. | Se usa **`PATCH`**. Añadido criterio de aceptación explícito. |
| 2 | 🔴 **BLOQUEANTE** | Asumía que `PATCH` creaba la clave si no existía. | [`settings/service.py:17`](../apps/api/modules/settings/service.py:17): `update_setting` llama a `get_setting_by_key`, que lanza **404** si falta. | Nueva **FASE 17.0** que siembra la clave vía `POST /settings/seed` (idempotente, [`service.py:105`](../apps/api/modules/settings/service.py:105)). |
| 3 | 🔴 **BLOQUEANTE** | Agrupaba el menú por **categoría**. | [`heladeria/service.py:267`](../apps/api/modules/heladeria/service.py:267) agrupa por **`component_type`**; `MenuItemResponse` **no tiene `category`**. | Rediseño del eje de presentación sobre `component_type` + tabla `COMPONENT_TYPE_LABELS`. |
| 4 | 🟡 Rigor | Baseline de tests desactualizado (141 vitest / 1419 módulos). | Tras V14 el baseline real es **189 vitest / 1424 módulos**. | Actualizado en todo el documento y en los criterios de aceptación. |
| 5 | 🟡 Rigor | `formatPrice` asumía `number`. | `price: Decimal` se serializa como **string** (`"45.00"`). | `formatPrice` maneja `string \| number` y rechaza `NaN`. |
| 6 | 🟡 Rigor | Reutilizaba `getCachedMenu()` (TTL 30 min). | [`heladeriaOfflineStore.js:54`](../apps/heladeria/services/heladeriaOfflineStore.js:54): `MAX_AGE = 30 * 60 * 1000`. | Nuevo `getCachedDisplayMenu()` con TTL **24h** y store separado. |
| 7 | 🟡 Rigor | Reversión de IndexedDB "a mano desde DevTools". | No es viable para personal no técnico en tienda. | Botón **"Limpiar caché"** en el panel de administración. |
| 8 | 🟡 Rigor | No definía qué hacer con `is_available=false`. | `MenuItemResponse.is_available: bool` existe pero el plan lo ignoraba. | Se muestran **atenuados con "AGOTADO"**, controlado por `showUnavailable`. |
| 9 | 🟡 Rigor | No definía el mecanismo del modo kiosco. | La detección automática violaría la regla 3 (prohibido `window.location.hostname`). | Parámetro explícito **`?mode=output`** + `resolveDisplayMode(search)` puro. |

### Lección aprendida (repetida de la FASE 0)

> **La FASE 0 falló por asumir 3 endpoints que no existían** ([`heladeriaTerminals.js`](../apps/heladeria/services/heladeriaTerminals.js:1) llamaba a rutas inexistentes). La revisión 1 de V17 **repetía el mismo patrón** (asumía `PUT` y creación implícita de claves). La revisión 2 corrige esto **verificando cada endpoint contra el código real** antes de escribir el plan.

### Checklist de verificación previa a la ejecución

Antes de empezar la FASE 17.0, confirmar en el entorno real:

```bash
# 1. El endpoint PATCH existe (debe responder 200 o 404, NUNCA 405)
powershell -NoProfile -Command "Invoke-WebRequest -Method PATCH -Uri 'http://localhost:5001/settings/__ping__' -Body '{\"value\":\"x\"}' -ContentType 'application/json' -SkipHttpErrorCheck | Select-Object -ExpandProperty StatusCode"

# 2. El endpoint seed existe y es idempotente
powershell -NoProfile -Command "Invoke-WebRequest -Method POST -Uri 'http://localhost:5001/settings/seed' -SkipHttpErrorCheck | Select-Object -ExpandProperty StatusCode"

# 3. El display menu agrupa por component_type (no por category)
powershell -NoProfile -Command "(Invoke-WebRequest -Uri 'http://localhost:5001/heladeria/display/menu').Content | ConvertFrom-Json | Select-Object -ExpandProperty groups | Select-Object -ExpandProperty component_type"

# 4. Baseline de tests ANTES de tocar nada
docker exec rderico-api-dev python -m pytest -q
npx vitest run
npm run build
```

> **Si cualquiera de los 4 pasos falla, DETENER la ejecución y re-auditar el plan.** No se escribe una sola línea de código hasta que el contrato esté confirmado contra el entorno real.

---

**FIN DEL PLAN — REVISIÓN 2**
