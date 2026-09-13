# 🍦 PLAN MAESTRO — MÓDULO DE HELADERÍA (Oleada 2) — R de Rico ERP

**Fecha:** 13/Septiembre/2026
**Autor:** Auditoría técnica derivada de [`DOCUMENTACION_MODULO_HELADERIA.md`](../ESPECIFICACIONES%20DEL%20PROYECTO/DOCUMENTACION_MODULO_HELADERIA.md)
**Estado:** ⏳ PROPUESTO — pendiente de ejecución
**Alcance:** Completar las 4 secciones que hoy son placeholders y elevar los 2 KDS existentes a "KDS Inteligente", con paridad absoluta de terminales y productos respecto al resto del ERP.

> **REVISIÓN 2 (13/Sept/2026):** Este documento fue corregido tras una auto-auditoría crítica. Se corrigieron 7 defectos: (1) se descubrió que `heladeriaTerminals.js` está **roto** y se añadió una **FASE 0 de saneamiento**; (2) se resolvió la contradicción V14 vs Nota #5; (3) se separaron los ejes de riesgo; (4) se completó el protocolo de reversión; (5) se definió "funcional" por sección; (6) se verificaron los endpoints de backend contra el código real; (7) se corrigió el baseline de tests. Ver **ANEXO A — Bitácora de correcciones**.
>
> **REVISIÓN 3 (13/Sept/2026):** Se incorporaron **2 restricciones arquitectónicas definidas por el negocio** (ver sección "RESTRICCIONES ARQUITECTÓNICAS DEL PROYECTO"): **(A)** el POS intocable es específicamente el módulo **Punto de Venta IA** (Panadería), no el concepto genérico de POS; **(B)** **Gestión de Productos es el maestro único** de productos y categorías, y desde ahí se define en qué POS aparece cada producto. Heladería **solo lee** el catálogo.

---

## 🚨 PROTOCOLO DE NO-INTERFERENCIA AL POS (OBLIGATORIO)

> **Este plan NO puede romper el POS de Panadería. Punto.**
> El POS está en producción y cualquier regresión cuesta dinero real.
> La Heladería es un módulo **aislado**: si se cae, la Panadería sigue operando.

### Reglas de ejecución

1. **PROHIBIDO tocar** [`apps/pos/RetailVisionPOS.jsx`](../apps/pos/RetailVisionPOS.jsx), [`apps/pos/hooks/useTerminalLocking.js`](../apps/pos/hooks/useTerminalLocking.js), [`apps/pos/hooks/useBeforeUnload.js`](../apps/pos/hooks/useBeforeUnload.js) y [`apps/pos/services/POSService.js`](../apps/pos/services/POSService.js) — territorio sagrado del POS.
2. **PROHIBIDO modificar** [`apps/pos/config.js`](../apps/pos/config.js) — es la única fuente de verdad de URLs (Incidente 16.6). Solo se **lee**.
3. **PROHIBIDO** cambiar el contrato público de [`useNetworkHealth`](../apps/pos/hooks/useNetworkHealth.js:12) (`{ status, latency }`).
4. **PROHIBIDO** introducir `setInterval`/timers que escriban en el carrito del POS de Panadería. Los timers de Heladería viven **solo** dentro de `apps/heladeria/`.
5. **PROHIBIDO** construir URLs con `window.location.hostname`. Siempre `CONFIG.API_BASE_URL`.
6. **PROHIBIDO** animaciones CSS infinitas (`animate-pulse`) en indicadores estáticos que dependan de red/polling (Incidente 16.1 — Efecto Estrobo).
7. **Cada fase es un commit independiente** y debe pasar la verificación completa antes de continuar.
8. **Si una fase falla la verificación, se revierte inmediatamente** (`git revert`) y se documenta el motivo.
9. **Ninguna fase se ejecuta en horario de operación del POS** (idealmente antes de abrir o después de cerrar).
10. **Toda integración con el POS se envuelve en `try/except pass`** (o `try/catch` silencioso en JS) para que un fallo de Heladería jamás interrumpa la Panadería.

### ⚠️ Deuda técnica reconocida: acoplamiento YA existente con `apps/pos/`

**La regla #1 es aspiracional, no descriptiva.** La realidad es que la Heladería **ya importa** código de `apps/pos/`:

| Archivo de Heladería | Importa de `apps/pos/` | Línea |
|---|---|---|
| [`heladeriaTerminals.js`](../apps/heladeria/services/heladeriaTerminals.js:5) | `CONFIG` desde `../../pos/config` | [5](../apps/heladeria/services/heladeriaTerminals.js:5) |
| [`heladeriaTerminals.js`](../apps/heladeria/services/heladeriaTerminals.js:6) | `withRetries` desde `../../pos/utils/withRetries` | [6](../apps/heladeria/services/heladeriaTerminals.js:6) |
| [`heladeriaService.js`](../apps/heladeria/services/heladeriaService.js:1) | `CONFIG` (vía `config.js`) | — |

**Decisión:** se **acepta** el acoplamiento a `CONFIG` y `withRetries` (son utilidades estables y sin estado), pero se **prohíbe** importar componentes de UI del POS (`GestorDeCaja.jsx`, `POSHeader.jsx`, etc.). La regla #1 se reinterpreta como: **"PROHIBIDO MODIFICAR archivos de `apps/pos/`"**, no "prohibido importarlos".

---

## 🧭 RESTRICCIONES ARQUITECTÓNICAS DEL PROYECTO (definidas por el negocio)

> Estas dos restricciones **no son negociables** y aplican a los 5 planes. Se documentan aquí porque condicionan el diseño de V14, V15, V16 y V17.

### Restricción A — El POS que NO se toca es el módulo **"Punto de Venta IA"**

Cuando este plan dice "no interferir con el POS", se refiere **específicamente** al módulo del ERP llamado **Punto de Venta IA** (el POS de Panadería en producción, [`apps/pos/RetailVisionPOS.jsx`](../apps/pos/RetailVisionPOS.jsx:29)).

**Implicaciones:**
- El POS de Heladería ([`PosHeladeriaUI.jsx`](../apps/heladeria/sections/PosHeladeriaUI.jsx:15)) es un **módulo distinto** y **sí** puede modificarse.
- La Tienda Interactiva (V14), los Displays (V16, V17) y los KDS (V15) son **módulos de Heladería** y **sí** pueden modificarse.
- Lo único intocable es el POS IA de Panadería y sus archivos núcleo (ver regla #1).

### Restricción B — **Gestión de Productos es el MAESTRO ÚNICO de productos**

El módulo **Gestión de Productos** ([`apps/api/modules/catalog/`](../apps/api/modules/catalog/models.py:1)) es la **única fuente de verdad** respecto a productos y categorías. **Ningún plan de Heladería puede crear, duplicar ni redefinir productos.**

**El mecanismo de asignación a POS se define DESDE Gestión de Productos**, no desde Heladería: desde ese módulo se decidirá **en qué POS aparece cada producto o categoría de productos**.

**Estado actual verificado (lo que YA existe):**

| Pieza | Tabla / Archivo | Rol |
|---|---|---|
| Producto maestro | [`products`](../apps/api/modules/catalog/models.py:17) | SKU, nombre, precio, categoría, `active` |
| Categoría maestra | [`categories`](../apps/api/modules/catalog/models.py:5) | Nombre, icono, posición |
| Extensión de Heladería | [`heladeria_product_config`](../apps/api/modules/heladeria/models.py:11) | **Extiende** un producto del catálogo con `component_type` (RECIPIENTE/SABOR/EXTRA/BEBIDA_BASE/TAMAÑO), `max_scoops`, `base_price`, `price_per_scoop`, `is_available`, `position` |

**Lo que esto significa para los planes:**

1. **V14 (Tienda Interactiva)** — El configurador **NO define sabores ni precios**. Los **lee** de `GET /heladeria/menu`, que a su vez los lee de `heladeria_product_config` → `products`. Si un sabor no está en Gestión de Productos, no existe para la Tienda.
2. **V15 (KDS)** — Los tiempos de urgencia y la compatibilidad de lotes **NO crean productos**. Operan sobre los `ticket_items` ya generados.
3. **V16 (Tótem)** — El contenido del tótem es **publicidad**, no catálogo. **PROHIBIDO** que el tótem defina precios o productos; si muestra un precio, lo **lee** del catálogo.
4. **V17 (Display Precios)** — **PROHIBIDO** hardcodear precios. El display **lee** de `GET /heladeria/display/menu`, que lee del catálogo. Un cambio de precio en Gestión de Productos debe reflejarse en el display sin tocar código.

**Frontera explícita (quién hace qué):**

| Acción | Módulo responsable | ¿Puede Heladería hacerlo? |
|---|---|---|
| Crear/editar/borrar un producto | **Gestión de Productos** | ❌ **NO** |
| Crear/editar/borrar una categoría | **Gestión de Productos** | ❌ **NO** |
| Cambiar el precio de un producto | **Gestión de Productos** | ❌ **NO** |
| Decidir en qué POS aparece un producto/categoría | **Gestión de Productos** | ❌ **NO** |
| Marcar un producto como componente de heladería (SABOR, EXTRA…) | **Gestión de Productos** (escribe `heladeria_product_config`) | ❌ **NO** (solo lee) |
| Agotar temporalmente un sabor (`is_available`) | **Heladería** | ✅ **SÍ** (es operativo, no maestro) |
| Leer el menú para mostrarlo | **Heladería** | ✅ **SÍ** |

> **Regla de oro:** Heladería **LEE** el catálogo y **ESCRIBE** solo estado operativo (`is_available`, tickets, KDS). Nunca escribe en `products` ni en `categories`.

> **⚠️ PENDIENTE DE DISEÑO (fuera del alcance de estos 5 planes):** el mecanismo concreto de "en qué POS aparece cada producto/categoría" **aún no existe** en el código. Hoy `heladeria_product_config` es el único vínculo producto→Heladería. Cuando el usuario lo defina en Gestión de Productos, los planes V14/V16/V17 deberán **consumir ese mecanismo** en lugar de asumir que todo producto de heladería aparece en todos los POS. **Se documenta como dependencia futura, no como bloqueante.**

### Verificación obligatoria por fase

```bash
# 1. Tests backend (baseline: 39/39 — ver tabla de baselines por plan)
docker exec rderico-api-dev python -m pytest -q

# 2. Tests frontend (baseline: 141/141 — ver tabla de baselines por plan)
npx vitest run

# 3. Build de producción (baseline: 1419 módulos)
npm run build

# 4. Arranque del POS Panadería (verificación manual)
#    - Abrir http://localhost:5000
#    - Seleccionar una terminal
#    - Agregar un producto al carrito
#    - Verificar que NO aparece banner falso "SIN CONEXIÓN"

# 5. Arranque del Hub Heladería (verificación manual)
#    - Abrir el Hub de Heladería desde el Centro de Experimentos
#    - Entrar a la sección modificada
#    - Verificar que las demás secciones siguen accesibles
```

> **Nota de entorno:** Python **NO** está en el PATH del host. `pytest` se ejecuta **siempre** vía `docker exec rderico-api-dev python -m pytest -q`.

---

## 📋 ESTADO REAL DEL MÓDULO (evidencia verificada en código)

| # | Sección | Archivo | Estado real | Plan |
|---|---|---|---|---|
| 1 | Tienda Interactiva | [`TiendaInteractivaUI.jsx`](../apps/heladeria/sections/TiendaInteractivaUI.jsx:7) | 🔴 **Placeholder** (105 líneas, "Próximamente") | **V14** |
| 2 | KDS Helados | [`KdsHeladosUI.jsx`](../apps/heladeria/sections/KdsHeladosUI.jsx:15) | 🟡 **Funcional** — polling 5s, 3 estados, **sin urgencia por tiempo** | **V15** |
| 3 | KDS Malteadas | [`KdsMalteadasUI.jsx`](../apps/heladeria/sections/KdsMalteadasUI.jsx:14) | 🟡 **Funcional pero clon** — "Idéntico al KDS Helados" (línea 3), **sin batching** | **V15** |
| 4 | Display Tótem | [`DisplayTotemUI.jsx`](../apps/heladeria/sections/DisplayTotemUI.jsx:7) | 🔴 **Placeholder** (100 líneas, "Próximamente") | **V16** |
| 5 | Display Precios | [`DisplayPreciosUI.jsx`](../apps/heladeria/sections/DisplayPreciosUI.jsx:7) | 🔴 **Placeholder** (100 líneas, "Próximamente") | **V17** |

**El Hub ya está listo** ([`HeladeriaHubUI.jsx`](../apps/heladeria/HeladeriaHubUI.jsx:49)): las 6 secciones existen con `React.lazy` + `SectionErrorBoundary` (doble barrera). Solo faltan los cuerpos.

### 🔴 HALLAZGO CRÍTICO: `heladeriaTerminals.js` está ROTO

**Este es el defecto más grave detectado en la auto-auditoría.** El archivo [`heladeriaTerminals.js`](../apps/heladeria/services/heladeriaTerminals.js:1) (73 líneas) llama a **3 endpoints que NO existen** en el backend:

| Llamada en el archivo | Línea | ¿Existe en el backend? | Endpoint real |
|---|---|---|---|
| `POST /pos/terminal-lock` | [29](../apps/heladeria/services/heladeriaTerminals.js:29) | ❌ **NO EXISTE** | `POST /pos/terminals/{id}/lock` |
| `DELETE /pos/terminal-lock/{id}` | [51](../apps/heladeria/services/heladeriaTerminals.js:51) | ❌ **NO EXISTE** | `POST /pos/terminals/{id}/unlock` |
| `GET /pos/terminal-locks` | [66](../apps/heladeria/services/heladeriaTerminals.js:66) | ❌ **NO EXISTE** | `GET /pos/terminals/status` |

**Evidencia de los endpoints reales:** [`apps/api/modules/pos/router.py`](../apps/api/modules/pos/router.py:306) define `/terminals/{terminal_id}/lock`, `/terminals/{terminal_id}/unlock`, `/terminals/{terminal_id}/force_unlock`, `/terminals/{terminal_id}/heartbeat` y `/terminals/status`. **No existe ningún `/terminal-lock` (singular) ni `/terminal-locks` (plural).**

**Consecuencia:** `heladeriaTerminals.js` es **código muerto que falla en runtime**. Cualquier plan que asuma que "los locks de heladería ya funcionan" está construido sobre arena. **Por eso se añade la FASE 0.**

### Backend verificado (endpoints reales)

**Módulo Heladería** ([`apps/api/modules/heladeria/router.py`](../apps/api/modules/heladeria/router.py:1)) — 6 endpoints confirmados:

| Endpoint | Línea | Usado por |
|---|---|---|
| `GET /heladeria/menu` | [21](../apps/api/modules/heladeria/router.py:21) | POS Heladería, Tienda (V14) |
| `PATCH /heladeria/availability/{config_id}` | [35](../apps/api/modules/heladeria/router.py:35) | Toggle "Agotar sabor" |
| `GET /heladeria/kds/{station}` | [52](../apps/api/modules/heladeria/router.py:52) | KDS Helados/Malteadas (V15) |
| `PATCH /heladeria/kds/items/{item_id}/status` | [70](../apps/api/modules/heladeria/router.py:70) | KDS (V15) |
| `GET /heladeria/display/flavors` | [91](../apps/api/modules/heladeria/router.py:91) | Displays (V16, V17) |
| `GET /heladeria/display/menu` | [100](../apps/api/modules/heladeria/router.py:100) | Display Precios (V17) |

**Módulo POS** ([`apps/api/modules/pos/router.py`](../apps/api/modules/pos/router.py:1)) — endpoints reutilizados por Heladería:

| Endpoint | Línea | Usado por |
|---|---|---|
| `POST /pos/tickets/reserve` | [34](../apps/api/modules/pos/router.py:34) | Pre-comanda (V14) |
| `POST /pos/tickets/items/add` | [50](../apps/api/modules/pos/router.py:50) | Pre-comanda (V14) |
| `POST /pos/terminals/{id}/lock` | [306](../apps/api/modules/pos/router.py:306) | Terminales Heladería (FASE 0) |
| `POST /pos/terminals/{id}/unlock` | [320](../apps/api/modules/pos/router.py:320) | Terminales Heladería (FASE 0) |
| `GET /pos/terminals/status` | [227](../apps/api/modules/pos/router.py:227) | Terminales Heladería (FASE 0) |

**Endpoints que NO existen y que V16 deberá crear:** `GET/PUT /heladeria/totem/content`, `POST /heladeria/totem/upload`, `DELETE /heladeria/totem/content/{image_id}`.

### Servicios de Heladería (verificados)

| Servicio | Estado | Evidencia |
|---|---|---|
| [`heladeriaService.js`](../apps/heladeria/services/heladeriaService.js:12) | 🟢 Funcional | Cliente HTTP con `withRetries`, 7 métodos |
| [`heladeriaOfflineStore.js`](../apps/heladeria/services/heladeriaOfflineStore.js:1) | 🟢 Funcional | **IndexedDB confirmado** (línea 20: `indexedDB.open('heladeria_offline')`), 2 stores: `menu_cache` + `sync_queue` |
| [`heladeriaTerminals.js`](../apps/heladeria/services/heladeriaTerminals.js:1) | 🔴 **ROTO** | 3 endpoints inexistentes (ver hallazgo crítico) |

---

## 🗂️ LOS 5 PLANES (orden de ejecución)

> **Nota:** el orden se decide por **riesgo de EJECUCIÓN** (probabilidad de que la fase falle o introduzca un bug), NO por riesgo-POS. Ambos ejes se reportan por separado.

| Orden | Plan | Alcance | Complejidad | Riesgo POS | Riesgo Ejecución | Dependencias |
|---|---|---|---|---|---|---|
| **0º** | **FASE 0 — Saneamiento** (en este documento) | Reparar `heladeriaTerminals.js` (3 endpoints rotos) | 🟢 Baja | 🟢 Nulo | 🟢 Bajo | Ninguna |
| **1º** | [`PLAN_HELADERIA_V17_DISPLAY_PRECIOS.md`](PLAN_HELADERIA_V17_DISPLAY_PRECIOS.md) | Doble landing (panel/output), conexión a catálogo | 🟢 Baja | 🟢 Nulo | 🟢 Bajo | `/display/menu` (verificado, [línea 100](../apps/api/modules/heladeria/router.py:100)) |
| **2º** | [`PLAN_HELADERIA_V14_TIENDA_INTERACTIVA.md`](PLAN_HELADERIA_V14_TIENDA_INTERACTIVA.md) | Configurador visual doble columna, pre-comanda PENDING, switch de caja, cancelaciones | 🔴 Alta | 🟢 Nulo | 🟡 Medio | `GestorDeCaja.jsx` (contrato replicado) |
| **3º** | [`PLAN_HELADERIA_V16_TOTEM_SUGESTIVO.md`](PLAN_HELADERIA_V16_TOTEM_SUGESTIVO.md) | Gestor de contenido macro, control fino de reproducción, torre dinámica, color picker | 🟡 Media | 🟢 Nulo | 🔴 **Alto** | Volumen Docker nuevo + 4 endpoints backend nuevos |
| **4º** | [`PLAN_HELADERIA_V15_KDS_INTELIGENTE.md`](PLAN_HELADERIA_V15_KDS_INTELIGENTE.md) | Urgencia por tiempos (Verde/Amarillo/Rojo) + Asistente de lotes malteadas | 🔴 Alta | 🟢 Nulo | 🟡 Medio | KDS actuales (funcionales) |

### Justificación del orden (corregida)

**Se ordena por riesgo de EJECUCIÓN, no por riesgo-POS** (todos tienen riesgo-POS nulo, así que ese eje no discrimina):

1. **FASE 0 primero** — porque `heladeriaTerminals.js` está roto y V14 lo necesita para el switch de caja. Repararlo es barato y desbloquea todo lo demás.
2. **V17 segundo** — es el más simple (display de solo lectura, endpoint ya verificado). Valida el patrón "display" sin tocar nada crítico.
3. **V14 tercero** — complejidad alta pero riesgo de ejecución medio: es UI + lógica pura, sin infraestructura nueva.
4. **V16 cuarto** — **se movió al penúltimo lugar** (antes estaba 2º). Razón: es el de **mayor riesgo de ejecución** porque introduce volumen Docker nuevo, 4 endpoints backend nuevos, conversión WebP y migración de storage. No debe ejecutarse antes de haber validado el patrón con V17 y V14.
5. **V15 último** — máquina de estado con concurrencia (3 licuadoras), el más complejo en lógica. Pero su infraestructura ya existe (KDS funcionales), así que su riesgo de ejecución es medio, no alto.

**Corrección respecto a la revisión 1:** antes V16 iba 2º por tener "riesgo POS nulo". Eso fue un error de razonamiento: confundí riesgo-POS con riesgo-de-ejecución. V16 es el más arriesgado de ejecutar y debe ir después de validar los patrones simples.

---

## 🎯 CRITERIOS DE ACEPTACIÓN GLOBALES

Al terminar los 5 planes (FASE 0 + V14 + V15 + V16 + V17):

- [ ] **Las 5 secciones del Hub son funcionales** según la definición medible de la sección "DEFINICIÓN DE FUNCIONAL" (abajo).
- [ ] **`heladeriaTerminals.js` funciona** contra los endpoints reales (`/pos/terminals/{id}/lock`, `/unlock`, `/status`).
- [ ] **pytest:** 39 → **≥39** tests, todos OK (sin regresiones). El número exacto se declara por plan.
- [ ] **vitest:** 141 → **≥141** tests, todos OK (sin regresiones). El número exacto se declara por plan.
- [ ] **build:** transforma sin errores (≥1419 módulos).
- [ ] **Cero** `window.location.hostname` en `apps/heladeria/`.
- [ ] **Cero** archivos del POS de Panadería **modificados** (`git diff --name-only` no incluye `apps/pos/RetailVisionPOS.jsx`, `useTerminalLocking.js`, `useBeforeUnload.js`, `POSService.js`, `config.js`).
- [ ] **El POS de Panadería funciona idéntico** (verificación manual: seleccionar terminal, agregar producto, sin banner falso).
- [ ] **El aislamiento se mantiene:** apagar el API y verificar que el POS de Panadería sigue operando.
- [ ] **Restricción A respetada:** el único POS intocable es el **Punto de Venta IA**; los módulos de Heladería sí se modifican.
- [ ] **Restricción B respetada:** **cero** escrituras a `products` o `categories` desde `apps/heladeria/`. Heladería solo **lee** el catálogo y escribe estado operativo (`is_available`, tickets, KDS).
- [ ] **Cero precios hardcodeados** en V14/V16/V17: todo precio se lee del catálogo vía `/heladeria/menu` o `/heladeria/display/menu`.
- [ ] Documentación actualizada: [`DOCUMENTACION_MODULO_HELADERIA.md`](../ESPECIFICACIONES%20DEL%20PROYECTO/DOCUMENTACION_MODULO_HELADERIA.md) sección 13 "Próximos Pasos (Oleada 2)" marcada como resuelta.

### 📏 DEFINICIÓN DE "FUNCIONAL" POR SECCIÓN (criterios medibles)

Un criterio de aceptación que dice "es funcional" no es verificable. Estos son los criterios medibles:

| Sección | "Funcional" significa... | Cómo se verifica |
|---|---|---|
| **Tienda Interactiva** (V14) | Un cliente arma un helado completo (base + tamaño + sabores + toppings) y genera una pre-comanda con `channel='HELADERIA'` que aparece en el KDS como `PENDING`. | Test manual + verificar en PostgreSQL que el ticket tiene `channel='HELADERIA'` y NO aparece en el POS de Panadería. |
| **KDS Helados** (V15) | Cada orden muestra su tiempo transcurrido y cambia de color (Verde <3min, Amarillo 3-7min, Rojo >7min). El operador puede avanzar `PENDING → IN_PROGRESS → READY`. | Test manual + `kdsUrgency.test.js` (12 tests) verde. |
| **KDS Malteadas** (V15) | Igual que KDS Helados + el asistente sugiere lotes de hasta 3 malteadas compatibles con tiempo estimado. | Test manual + `batchAssistant.test.js` (15 tests) verde. |
| **Display Tótem** (V16) | El tótem reproduce una secuencia de imágenes/videos en bucle, **sobrevive un reinicio sin red** (sirve contenido cacheado), y el admin puede cambiar el contenido desde el panel. | Test manual: apagar el API, reiniciar el tótem, verificar que sigue reproduciendo. |
| **Display Precios** (V17) | El display muestra el menú agrupado por categoría con precios formateados, **sobrevive un reinicio sin red**, y el admin puede configurar qué categorías mostrar. | Test manual: apagar el API, reiniciar el display, verificar que sigue mostrando precios. |

---

## 🔄 PROTOCOLO DE REVERSIÓN (completo)

> **Advertencia:** `git revert` **solo revierte código**. NO limpia estado externo (base de datos, volúmenes Docker, migraciones Alembic). Este protocolo cubre ambos.

### Reversión de código

```bash
# Revertir el último commit (una fase)
git revert HEAD --no-edit
git push origin main

# Revertir varias fases (en orden inverso)
git revert <hash_V15> <hash_V16> <hash_V14> <hash_V17> <hash_FASE0> --no-edit
git push origin main
```

### Reversión de estado externo (OBLIGATORIO si la fase tocó DB o volúmenes)

| Fase | Estado externo creado | Cómo revertirlo |
|---|---|---|
| **FASE 0** | Ninguno | N/A |
| **V17** | Clave `heladeria_display_precios_config` en `system_settings` | `DELETE FROM system_settings WHERE key='heladeria_display_precios_config';` |
| **V14** | Tickets con `channel='HELADERIA'` (datos de negocio, NO se borran) | No se revierte — son ventas reales. Solo se revierte el código. |
| **V16** | Clave `heladeria_totem_content` en `system_settings` + archivos en volumen `totem_media` | `DELETE FROM system_settings WHERE key='heladeria_totem_content';` + `docker volume rm rderico_totem_media` |
| **V15** | Clave `heladeria_kds_config` en `system_settings` | `DELETE FROM system_settings WHERE key='heladeria_kds_config';` |

### Reversión de migraciones Alembic (si aplica)

Si alguna fase añade una migración Alembic (V16 podría necesitarlo para el storage):

```bash
# Ver la migración actual
docker exec rderico-api-dev alembic current

# Bajar una revisión
docker exec rderico-api-dev alembic downgrade -1

# Verificar
docker exec rderico-api-dev alembic current
```

> **Regla de diseño:** se prefiere **NO usar migraciones** para las configuraciones (usar `system_settings` con claves nuevas). Las migraciones solo se usan si se añaden **columnas** a tablas existentes, y siempre `NULL`-ables (aditivas).

### Verificación post-reversión

```bash
docker exec rderico-api-dev python -m pytest -q   # 39/39
npx vitest run                                     # 141/141
npm run build                                      # 1419 módulos
# + verificación manual del POS de Panadería
```

**Regla:** ante la duda, revertir. El POS nunca se queda roto.

---

## 📊 BASELINES DE TESTS POR PLAN

> **Corrección:** la revisión 1 decía "39 → 39+" y "141 → 141+", que no son criterios verificables. Aquí están los números exactos.

| Plan | vitest antes | vitest después | pytest antes | pytest después | build (módulos) |
|---|---|---|---|---|---|
| **FASE 0** | 141 | 141 | 39 | 39 | 1419 |
| **V17** | 141 | ~153 (+12) | 39 | 39 | ~1421 |
| **V14** | ~153 | ~168 (+15) | 39 | 39 | ~1424 |
| **V16** | ~168 | ~183 (+15) | 39 | ~45 (+6) | ~1427 |
| **V15** | ~183 | ~210 (+27) | ~45 | ~45 | ~1430 |

> Los números son **estimaciones**. El criterio real es: **el número NUNCA baja** y los tests nuevos pasan. Si un plan produce menos tests de los estimados, se documenta por qué.

---

## 📝 NOTAS DE DISEÑO TRANSVERSALES

1. **¿Por qué 4 planes y no 1?**
   Porque la especificación original mezcla 4 proyectos de tamaños muy distintos. Un solo plan sería imposible de verificar y de revertir. Cada plan es independiente, con su propio commit y su propia verificación.

2. **¿Por qué el Tótem es offline-first?**
   Porque un tótem que depende del API en vivo se queda **en negro frente al cliente** si el API se cae. El tótem debe cachear su manifiesto de contenido en IndexedDB y solo *refrescar* disponibilidad cuando hay red. Nunca bloquea el render esperando al API.

3. **¿Por qué las imágenes 4K/8K necesitan estrategia de storage?**
   Porque un JPEG 8K pesa 15-40 MB. Subirlos al servidor actual (Docker local, sin CDN) satura disco y ancho de banda. Se define desde el inicio: límite de peso, conversión a WebP, volumen Docker dedicado y lazy-loading por diapositiva.

4. **¿Por qué el asistente de lotes es una fase propia?**
   Porque no es una pantalla: es una **máquina de estado con concurrencia** (3 lotes simultáneos, cada uno con su paso actual, cantidades del ERP, avance por pedal/manos libres). Es el mismo patrón de [`useQuickBuilder.js`](../apps/heladeria/hooks/useQuickBuilder.js:1) multiplicado por 3 y con input externo.

5. **¿Por qué se REPLICA el contrato de `GestorDeCaja.jsx` y no se importa?** *(corregido — antes decía "se reutiliza el componente")*
   Porque `GestorDeCaja.jsx` vive en `apps/pos/` y es un **componente de UI con estado**. Importarlo desde `apps/heladeria/` crearía un acoplamiento de UI que rompería la Barrera 1: un cambio en el POS podría romper la Heladería. Se **replica el contrato de props** (`onCajaHabilitada` / `onCajaDeshabilitada`) y se cubre con un test de contrato.
   **Distinción clave:** se **acepta** importar utilidades sin estado (`CONFIG`, `withRetries`), pero se **prohíbe** importar componentes de UI del POS.
   **Esta decisión es la única válida y aplica a los 5 documentos.** El plan V14 ya la implementa así.

6. **¿Por qué la FASE 0 es obligatoria?**
   Porque `heladeriaTerminals.js` llama a 3 endpoints inexistentes. Si V14 intenta usar los locks de terminal sin repararlo, fallará en runtime. Repararlo es barato (cambiar 3 URLs) y desbloquea V14.

7. **¿Por qué el "POS que no se toca" es específicamente el Punto de Venta IA?**
   Porque el ERP tiene **varios POS**: el POS IA de Panadería (producción, intocable) y el POS de Heladería (módulo propio, modificable). Confundirlos paralizaría el proyecto: si "POS" significara "todo lo que vende", no se podría construir la Tienda Interactiva. La restricción protege **el POS IA de Panadería**, no el concepto genérico de punto de venta.

8. **¿Por qué Heladería NO puede crear productos?**
   Porque **Gestión de Productos es el maestro único**. Si Heladería creara sus propios sabores, tendríamos **doble fuente de verdad**: un sabor podría existir en Heladería pero no en el catálogo, o tener dos precios distintos. El diseño correcto ya existe: `heladeria_product_config` **extiende** un producto del catálogo (FK a `products.id`), no lo duplica. Heladería **lee** el catálogo y **escribe** solo estado operativo (`is_available`). Esto garantiza que un cambio de precio en Gestión de Productos se refleje automáticamente en la Tienda, el Tótem y el Display de Precios.

---

## 🎯 FASE 0 — SANEAMIENTO: Reparar `heladeriaTerminals.js`

**🎯 Objetivo:** Corregir los 3 endpoints rotos para que los locks de terminal de Heladería funcionen contra el backend real.

**📍 Evidencia:** [`heladeriaTerminals.js`](../apps/heladeria/services/heladeriaTerminals.js:29) llama a `/pos/terminal-lock`, `/pos/terminal-lock/{id}` y `/pos/terminal-locks`. Los endpoints reales en [`apps/api/modules/pos/router.py`](../apps/api/modules/pos/router.py:306) son `/pos/terminals/{id}/lock`, `/pos/terminals/{id}/unlock` y `/pos/terminals/status`.

**🔧 Cambios:**

1. En [`heladeriaTerminals.js`](../apps/heladeria/services/heladeriaTerminals.js:29), corregir `lockTerminal`:
   - `POST /pos/terminal-lock` → `POST /pos/terminals/${terminalId}/lock`
   - Verificar el contrato del body contra [`schemas.LockRequest`](../apps/api/modules/pos/router.py:307).
2. Corregir `unlockTerminal`:
   - `DELETE /pos/terminal-lock/${terminalId}` → `POST /pos/terminals/${terminalId}/unlock`
   - **Nota:** el endpoint real es `POST`, no `DELETE`. Ajustar el método HTTP.
3. Corregir `getAllLocks`:
   - `GET /pos/terminal-locks` → `GET /pos/terminals/status`
   - Adaptar el filtro `startsWith('H')` a la forma real de la respuesta de `/terminals/status`.
4. Añadir un test de contrato `apps/heladeria/services/heladeriaTerminals.test.js` que verifique que las URLs construidas coinciden con los endpoints reales (mock de `fetch`).

**✅ Verificación:**
```bash
npx vitest run apps/heladeria/services/heladeriaTerminals.test.js
npm run build
```
Test verde + build OK. Baseline: 141/141 → 141/141 (el test nuevo es de contrato, no añade cobertura de lógica pura).

**⚠️ Riesgo POS:** 🟢 **NULO.** Solo se modifican URLs en un archivo de `apps/heladeria/`. No se toca el backend ni el POS.

**⚠️ Riesgo Ejecución:** 🟢 **Bajo.** Cambio mecánico de 3 URLs + 1 test.

---

## ✅ CHECKLIST DE APROBACIÓN

Antes de ejecutar, confirmar:

- [ ] El plan respeta el protocolo de no-interferencia al POS (reinterpretado: prohibido MODIFICAR `apps/pos/`, permitido importar utilidades sin estado).
- [ ] **Restricción A confirmada:** el único POS intocable es el **Punto de Venta IA** (Panadería). Los módulos de Heladería sí se modifican.
- [ ] **Restricción B confirmada:** **Gestión de Productos es el maestro único**. Heladería solo **lee** el catálogo; **cero** escrituras a `products`/`categories`.
- [ ] **Cero precios hardcodeados** en V14/V16/V17 (todo precio se lee del catálogo).
- [ ] La FASE 0 (saneamiento de `heladeriaTerminals.js`) se ejecuta ANTES que V14.
- [ ] La estrategia de caja es **replicar el contrato**, no importar `GestorDeCaja.jsx` (Nota #5 corregida).
- [ ] El orden de ejecución se justifica por **riesgo de ejecución** (V16 penúltimo, no segundo).
- [ ] Cada fase es reversible de forma independiente (código + estado externo).
- [ ] La verificación es objetiva (tests + build + manual) con baselines numéricos exactos.
- [ ] "Funcional" está definido con criterios medibles por sección.

**Una vez aprobado:** FASE 0 → verificar → commit → push → V17 → ... → V15.

---

## 📎 ANEXO A — Bitácora de correcciones (Revisión 1 → Revisión 2)

| # | Defecto detectado en la auto-auditoría | Corrección aplicada |
|---|---|---|
| 1 | **ERROR GRAVE:** el plan declaraba `heladeriaTerminals.js` como funcional, pero llama a 3 endpoints inexistentes. | Se añadió la **FASE 0 de saneamiento** y la sección "HALLAZGO CRÍTICO". |
| 2 | **CONTRADICCIÓN:** la tabla decía "reusar `GestorDeCaja.jsx`" pero el plan V14 decía "replicar el contrato". | Se unificó a **"replicar el contrato"** en la Nota #5 y en la tabla. |
| 3 | **BASELINE VAGO:** "39 → 39+" y "141 → 141+" no son verificables. | Se añadió la tabla **"BASELINES DE TESTS POR PLAN"** con números exactos. |
| 4 | **AFIRMACIONES NO VERIFICADAS:** el plan decía "endpoints operativos" sin evidencia. | Se añadieron las tablas de **endpoints verificados** con línea exacta. |
| 5 | **ORDEN MAL JUSTIFICADO:** V16 iba 2º por "riesgo POS nulo", confundiendo ejes. | Se separaron **riesgo-POS** y **riesgo-ejecución**; V16 se movió al **penúltimo** lugar. |
| 6 | **REVERSIÓN INGENUA:** solo revertía código, no estado externo. | Se completó con **limpieza de `system_settings`, volúmenes Docker y migraciones Alembic**. |
| 7 | **"FUNCIONAL" SIN DEFINICIÓN:** no había criterios medibles. | Se añadió la sección **"DEFINICIÓN DE FUNCIONAL POR SECCIÓN"**. |
| 8 | **ACOPLAMIENTO NO RECONOCIDO:** el plan prohibía tocar `apps/pos/` pero la Heladería ya importa de ahí. | Se añadió la sección **"Deuda técnica reconocida"** y se reinterpretó la regla #1. |
| 9 | **"POS" AMBIGUO:** el plan decía "no tocar el POS" sin especificar cuál, cuando el ERP tiene varios. | Se añadió la **Restricción A**: el POS intocable es específicamente el **Punto de Venta IA** (Panadería). |
| 10 | **MAESTRO DE PRODUCTOS NO DECLARADO:** el plan no decía de dónde salen los productos/sabores. | Se añadió la **Restricción B**: **Gestión de Productos es el maestro único**; Heladería solo lee el catálogo. |
