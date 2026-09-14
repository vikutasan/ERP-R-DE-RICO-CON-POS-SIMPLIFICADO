# 🧠 PLAN HELADERÍA V15 — KDS INTELIGENTE (Urgencia Visual por Color)

**Fecha original:** 2026-09-13
**Revisión 2:** 2026-09-14
**Autor:** Arquitectura ERP R de Rico
**Estado:** 📋 PLANIFICADO — Revisión 2 (pendiente de aprobación del usuario)
**Alcance:** Módulo Heladería — pantallas KDS ([`KdsHeladosUI.jsx`](../apps/heladeria/sections/KdsHeladosUI.jsx:15), [`KdsMalteadasUI.jsx`](../apps/heladeria/sections/KdsMalteadasUI.jsx:14)) + lógica pura compartida.
**Depende de:** ⚠️ **FASE 0** (saneamiento de `heladeriaTerminals.js`) — ver [`PLAN_HELADERIA_MAESTRO.md`](PLAN_HELADERIA_MAESTRO.md:1)
**Predecesor:** V16 (Tótem Sugestivo) · **Sucesor:** ninguno (último de la oleada)

> **REVISIÓN 2 (14/Sept/2026):** Este documento fue reescrito tras una **auto-auditoría crítica** que encontró **11 defectos**, de los cuales **3 eran bloqueantes**. Se corrigieron: **(D1)** se **eliminó el asistente de lotes** por ser inconstruible (no existen alérgenos en el sistema); **(D2)** se resolvió el problema de **zona horaria** de `created_at` (naive local, no UTC); **(D3)** se actualizaron los **3 baselines** desfasados; **(D4/D5)** se reconoció la **divergencia real** entre los dos KDS y se degradó el refactor a **opcional**; **(D6)** se completó la Fase 15.5 con el **servicio frontend** y el fallback; **(D7)** se corrigió la **semántica de urgencia** (desde el pago, no desde la creación); **(D8)** se definió el **reloj de urgencia** (1 s) separado del polling (5 s); **(D9)** se especificó `formatElapsed` para >1 h; **(D10)** se corrigió la referencia al "Cementerio de Bugs"; **(D11)** se añadió este proceso de revisión. Ver **ANEXO A — Bitácora de correcciones**.

---

## 🚨 PROTOCOLO DE NO-INTERFERENCIA AL POS (OBLIGATORIO)

> **Este plan NO puede romper el módulo "Punto de Venta IA" (Panadería). Punto.**
> El POS está en producción y cualquier regresión cuesta dinero real.
> La Heladería es un módulo **aislado**: si se cae, la Panadería sigue operando.

### Reglas de ejecución

1. **PROHIBIDO MODIFICAR** cualquier archivo de [`apps/pos/`](../apps/pos/RetailVisionPOS.jsx:29) — territorio sagrado del POS IA. (Se permite **importar** utilidades sin estado: `CONFIG`, `withRetries`.)
2. **PROHIBIDO modificar** [`apps/pos/config.js`](../apps/pos/config.js:16) — es la única fuente de verdad de URLs. Solo se **lee**.
3. **PROHIBIDO** construir URLs con `window.location.hostname`. Siempre `CONFIG.API_BASE_URL`.
4. **PROHIBIDO** animaciones CSS infinitas (`animate-pulse`, `animation: float ... infinite`) sobre indicadores estáticos. **Incidente 16.1 (Efecto Estrobo).** La urgencia se comunica con **COLOR**, no con animación.
5. **PROHIBIDO** auto-ejecutar acciones en el KDS. El cambio de estado es **siempre** manual por ítem.
6. **PROHIBIDO** escribir en las tablas `products` ni `categories` (Restricción B).
7. **Cada fase es un commit independiente** y debe pasar la verificación completa antes de continuar.
8. **Si una fase falla la verificación, se revierte inmediatamente** (`git revert`) y se documenta el motivo.
9. **Ninguna fase se ejecuta en horario de operación del POS** (idealmente antes de abrir o después de cerrar).
10. **Toda integración con el POS se envuelve en `try/catch` silencioso** para que un fallo de Heladería jamás interrumpa la Panadería.

### ⚠️ Deuda técnica reconocida: acoplamiento YA existente con `apps/pos/`

La regla #1 es **aspiracional, no descriptiva**. La Heladería **ya importa** código de `apps/pos/`:

| Archivo de Heladería | Importa de `apps/pos/` | Línea |
|---|---|---|
| [`heladeriaService.js`](../apps/heladeria/services/heladeriaService.js:1) | `CONFIG` (vía `config.js`) | — |
| [`heladeriaTerminals.js`](../apps/heladeria/services/heladeriaTerminals.js:5) | `CONFIG` desde `../../pos/config` | [5](../apps/heladeria/services/heladeriaTerminals.js:5) |
| [`heladeriaTerminals.js`](../apps/heladeria/services/heladeriaTerminals.js:6) | `withRetries` desde `../../pos/utils/withRetries` | [6](../apps/heladeria/services/heladeriaTerminals.js:6) |

**Decisión:** se **acepta** el acoplamiento a `CONFIG` y `withRetries` (utilidades estables y sin estado), pero se **prohíbe** importar componentes de UI del POS. La regla #1 se interpreta como: **"PROHIBIDO MODIFICAR archivos de `apps/pos/`"**, no "prohibido importarlos".

---

## 🧭 RESTRICCIONES ARQUITECTÓNICAS DEL PROYECTO (aplican a este plan)

### Restricción A — El POS intocable es "Punto de Venta IA"

El único módulo POS que **NO se puede tocar** es **"Punto de Venta IA"** (Panadería, [`apps/pos/RetailVisionPOS.jsx`](../apps/pos/RetailVisionPOS.jsx:29)).

| Módulo | ¿Modificable? |
|---|---|
| Punto de Venta IA (Panadería) | ❌ **PROHIBIDO** |
| POS Heladería ([`PosHeladeriaUI.jsx`](../apps/heladeria/sections/PosHeladeriaUI.jsx:15)) | ✅ Permitido |
| Tienda Interactiva | ✅ Permitido |
| Displays (Precios / Tótem) | ✅ Permitido |
| **KDS (Helados / Malteadas)** | ✅ **Permitido — este plan** |

### Restricción B — Gestión de Productos es el maestro único

**Gestión de Productos** ([`apps/api/modules/catalog/`](../apps/api/modules/catalog/models.py:1)) es la **única fuente de verdad** de productos y categorías.

**Este plan (V15) SOLO LEE pedidos del KDS y ESCRIBE estado operativo del KDS.**

| Acción | ¿Permitido? |
|---|---|
| Leer pedidos del KDS (`GET /heladeria/kds/{station}`) | ✅ |
| Cambiar estado de un ítem (`PATCH /heladeria/kds/items/{id}/status`) | ✅ |
| Leer umbrales desde `system_settings` | ✅ |
| Crear/editar sabores o productos | ❌ |
| Cambiar precios | ❌ |
| Decidir en qué POS aparece un producto | ❌ (se define en Gestión de Productos) |
| Escribir en `products` / `categories` | ❌ |
| **Añadir campos de alérgenos a productos** | ❌ **(competencia de Gestión de Productos — ver D1)** |

> **Nota:** el mecanismo "en qué POS aparece cada producto/categoría" se definirá **desde Gestión de Productos** y aún no existe. Es una **dependencia futura NO bloqueante** para V15 (el KDS no muestra catálogo, muestra pedidos).

---

## 📋 RESUMEN

Hoy los KDS ([`KdsHeladosUI.jsx`](../apps/heladeria/sections/KdsHeladosUI.jsx:15), [`KdsMalteadasUI.jsx`](../apps/heladeria/sections/KdsMalteadasUI.jsx:14)) muestran pedidos en una lista plana sin noción de **tiempo transcurrido** ni de **prioridad**. En hora pico, un pedido de hace 10 minutos se ve igual que uno de hace 30 segundos.

**V15 Revisión 2 introduce UNA sola capacidad** (el asistente de lotes fue eliminado — ver D1):

1. **Urgencia visual por color** — cada pedido se clasifica en `NORMAL` / `WARNING` / `CRITICAL` según segundos transcurridos **desde el pago**. Se pinta con **color de fondo/borde**, **sin animaciones** (Incidente 16.1).

Todo con **lógica pura testeable** (patrón "Guardián del contrato").

---

## 🔴 DECISIÓN DE ALCANCE: EL ASISTENTE DE LOTES FUE ELIMINADO (D1)

La Revisión 1 proponía un **asistente de lotes** que agrupaba malteadas "respetando alérgenos". La auditoría verificó que **ese dato no existe**:

- [`KdsItemResponse`](../apps/api/modules/heladeria/schemas.py:1) expone: `item_id`, `product_name`, `quantity`, `item_status`, `kds_station`, `recipient_name`, `components`. **Cero alérgenos.**
- [`TicketItemComponentResponse`](../apps/api/modules/heladeria/schemas.py:1): `id`, `ticket_item_id`, `product_id`, `component_type`, `component_name`, `unit_price`, `quantity`. **Cero alérgenos.**
- Búsqueda en [`heladeria/models.py`](../apps/api/modules/heladeria/models.py:1), [`catalog/models.py`](../apps/api/modules/catalog/models.py:1) y [`pos/models.py`](../apps/api/modules/pos/models.py:1) por `alerg|allerg|ingredient`: **único hit** es `recipe_procedure` en [`catalog/models.py:88`](../apps/api/modules/catalog/models.py:88) — texto libre de procedimiento, **no** una lista estructurada.

**Consecuencia:** `areCompatible(orderA, orderB)` no tiene de dónde leer el alérgeno. Construirlo requeriría **añadir campos de alérgenos a los productos**, lo cual **viola la Restricción B** (es competencia de Gestión de Productos).

**Decisión:** el asistente de lotes **se elimina de V15**. Si en el futuro Gestión de Productos expone alérgenos estructurados, se abrirá un **plan nuevo (V18)** que consuma ese dato. V15 queda enfocado en la urgencia visual, que es **100 % construible con los datos actuales**.

---

## 🕐 DECISIÓN TÉCNICA: ZONA HORARIA DE `created_at` (D2)

La Revisión 1 asumía que `created_at` era UTC. **Es falso.**

**Evidencia:**
- [`pos/models.py:34`](../apps/api/modules/pos/models.py:34): `created_at = Column(DateTime, default=datetime.now)` — `datetime.now()` es **hora local del contenedor**, sin `timezone=True`.
- [`heladeria/service.py:179`](../apps/api/modules/heladeria/service.py:179): `created_at=ticket.created_at.isoformat() if ticket.created_at else ""` — serializa un naive datetime **sin sufijo `Z` ni offset**.

**Riesgo:** si el navegador interpreta `"2026-09-14T18:44:27"` como hora local y el contenedor corre en otra zona, **todos** los pedidos aparecerían con horas de diferencia → todos CRITICAL o todos NORMAL.

**Solución adoptada (sin tocar el backend, cero riesgo POS):**

`computeElapsedSec` **NO** usará `new Date(iso)` sobre el string naive. En su lugar:

1. El backend ya emite `created_at` como **hora local del contenedor** (naive).
2. El frontend obtiene el **offset del servidor** desde la clave `heladeria_tz_offset` de `system_settings` (mecanismo **ya existente** para el módulo de red — ver [`test_network_tz.py`](../apps/api/tests/test_network_tz.py:1) y [`network/router.py:16`](../apps/api/modules/network/router.py:16)).
3. `computeElapsedSec(createdAtNaiveIso, serverOffsetHours, nowMs)` calcula:
   - `createdUtcMs = Date.parse(createdAtNaiveIso + 'Z') - (serverOffsetHours * 3600_000)`
   - `elapsedSec = Math.max(0, Math.floor((nowMs - createdUtcMs) / 1000))`
4. **Fallback:** si `serverOffsetHours` es inválido o ausente, se usa `0` y se documenta en el footer del KDS que la urgencia es "aproximada".

> **Nota:** `heladeria_tz_offset` **no se siembra en V15** (evita tocar el seed compartido). Si la clave no existe, `normalizeThresholds`/`normalizeTzOffset` cae al fallback `0`. La Fase 15.5 **sí** siembra `heladeria_kds_urgency_config` (clave nueva, aditiva).

---

## FASE 15.1 — `kdsUrgency.js` (lógica pura + tests)

🎯 **Objetivo:** Extraer el cálculo de urgencia a un módulo puro, sin React/DOM/fetch.

📍 **Evidencia:** Hoy no existe. El color se decide inline en cada KDS ([`KdsHeladosUI.jsx:9`](../apps/heladeria/sections/KdsHeladosUI.jsx:9) define `STATUS_COLORS` por **estado**, no por **tiempo**).

🔧 **Cambios:**
- Crear [`apps/heladeria/utils/kdsUrgency.js`](../apps/heladeria/utils/kdsUrgency.js:1) con:
  - `URGENCY_LEVELS = { NORMAL: 'NORMAL', WARNING: 'WARNING', CRITICAL: 'CRITICAL' }`
  - `DEFAULT_URGENCY_THRESHOLDS = { warningSec: 180, criticalSec: 420 }`
  - `DEFAULT_TZ_OFFSET_HOURS = 0`
  - `normalizeTzOffset(raw)` → número finito en `[-12, 14]`, o `0`.
  - `computeElapsedSec(createdAtNaiveIso, serverOffsetHours = 0, nowMs = Date.now())` → segundos transcurridos **desde el pago** (ver D7). **Nunca** negativo (clamp a 0). Si el ISO es inválido → `null`.
  - `classifyUrgency(elapsedSec, thresholds)` → nivel. `null` → `NORMAL`.
  - `urgencyColor(level)` → `{ bg, border, text }` (colores semánticos, **sin animación**).
  - `sortOrdersByUrgency(orders, thresholds, serverOffsetHours, nowMs)` → ordena CRITICAL → WARNING → NORMAL, desempate por antigüedad. **No muta** el array de entrada.
  - `formatElapsed(elapsedSec)` → `"3m 20s"`; para `>= 3600 s` → `"1h 05m"` (ver D9).
  - `normalizeThresholds(raw)` → valida y aplica defaults si faltan o son inválidos (incluye `warningSec >= criticalSec`).
- Crear [`apps/heladeria/utils/kdsUrgency.test.js`](../apps/heladeria/utils/kdsUrgency.test.js:1) con **~18 tests**:
  - límites exactos (179/180/181, 419/420/421),
  - `normalizeThresholds` con `null`, `{}`, negativos, `warningSec > criticalSec`, `warningSec === criticalSec`,
  - `normalizeTzOffset` con `null`, `"abc"`, `-99`, `99`, `6`, `"6"`,
  - `computeElapsedSec` con offset `0`, `-6`, `+5`; ISO inválido → `null`; fecha futura → `0`,
  - `sortOrdersByUrgency` con empate y **guardián: no muta el array**,
  - `formatElapsed` en 0s, 59s, 60s, 3599s, 3600s, 7325s,
  - **guardián:** `urgencyColor` NO devuelve ninguna propiedad de animación (`animation`, `animate`, `transition`).

✅ **Verificación:** `npx vitest run apps/heladeria/utils/kdsUrgency.test.js` → 18/18.

⚠️ **Riesgo POS:** Nulo (archivo nuevo, no importado por POS).
⚠️ **Riesgo de ejecución:** Bajo.

---

## FASE 15.2 — `KdsBoard.jsx` (componente compartido) — **OPCIONAL / DEGRADADA** (D4, D5)

🎯 **Objetivo:** Un solo componente de tablero KDS reutilizado por Helados y Malteadas.

📍 **Evidencia verificada (corrige la Revisión 1):** los dos KDS **NO son idénticos**. Diferencias reales:

| Aspecto | [`KdsHeladosUI.jsx`](../apps/heladeria/sections/KdsHeladosUI.jsx:1) | [`KdsMalteadasUI.jsx`](../apps/heladeria/sections/KdsMalteadasUI.jsx:1) |
|---|---|---|
| Líneas | 213 | 156 |
| `customer_group_name` | ✅ renderiza (línea 122) | ❌ no renderiza |
| `recipient_name` | ✅ renderiza (línea 152) | ❌ no renderiza |
| `components` | ✅ renderiza (línea 161) | ❌ no renderiza |
| Color PENDING | `#f59e0b` (ámbar) | `#a855f7` (púrpura) |
| Comentario | — | *"Idéntico al KDS Helados"* ← **falso** |

**Consecuencia:** unificar **pierde funcionalidad** (Malteadas empezaría a mostrar componentes que hoy no muestra) o exige props que anulan el beneficio de DRY.

🔧 **Cambios (si se decide ejecutar):**
- Crear [`apps/heladeria/components/KdsBoard.jsx`](../apps/heladeria/components/KdsBoard.jsx:1) que reciba `{ station, accentColor, orders, onStatusChange, thresholds, serverOffsetHours, showComponents, showCustomerGroup, showRecipient }`.
- Usar `classifyUrgency` + `urgencyColor` para pintar cada tarjeta (color, **sin animación**).
- Refactorizar ambos KDS para consumir `KdsBoard`, **preservando** las diferencias vía props.
- Mantener intactos los endpoints: `GET /heladeria/kds/{station}` ([`router.py:52`](../apps/api/modules/heladeria/router.py:52)) y `PATCH /heladeria/kds/items/{item_id}/status` ([`router.py:70`](../apps/api/modules/heladeria/router.py:70)).

✅ **Verificación:** `npx vitest run` (baseline **268/268** se mantiene) + `npx vite build` (**1432** módulos) + **prueba manual de paridad**: ambos KDS deben mostrar exactamente lo mismo que antes del refactor.

⚠️ **Riesgo POS:** Nulo (solo archivos de `apps/heladeria/`).
⚠️ **Riesgo de ejecución:** **ALTO** — refactoriza dos secciones en producción. **Si el tiempo es limitado, esta fase se OMITE** y la urgencia se aplica inline en cada KDS (duplicando ~20 líneas). La duplicación es preferible a una regresión funcional.

> **Decisión de la Revisión 2:** esta fase queda **marcada como opcional**. La urgencia visual (Fase 15.1 + 15.3) es el valor real; el refactor es cosmético.

---

## FASE 15.3 — Aplicar urgencia visual en ambos KDS

🎯 **Objetivo:** Pintar cada pedido con el color de urgencia, sin animaciones.

📍 **Evidencia:** Fase 15.1 produce `classifyUrgency` / `urgencyColor`; falta consumirlos.

🔧 **Cambios:**
- En [`KdsHeladosUI.jsx`](../apps/heladeria/sections/KdsHeladosUI.jsx:15) y [`KdsMalteadasUI.jsx`](../apps/heladeria/sections/KdsMalteadasUI.jsx:14):
  - Importar `classifyUrgency`, `urgencyColor`, `formatElapsed`, `normalizeThresholds`, `normalizeTzOffset` desde `../utils/kdsUrgency`.
  - Añadir un **reloj de urgencia** con `setInterval(tick, 1000)` que solo hace `setNowMs(Date.now())` (ver D8). **Separado** del polling de datos (5 s).
  - Calcular `elapsedSec` por pedido con `computeElapsedSec(order.created_at, serverOffsetHours, nowMs)`.
  - Aplicar `urgencyColor(level)` al **borde izquierdo** de la tarjeta (barra de 4 px) y a un badge con `formatElapsed`.
  - **NO** cambiar los `STATUS_COLORS` existentes (estado ≠ urgencia; son ejes independientes).
  - Mostrar en el header un contador: `N normal · M warning · K critical`.
- **Sin animaciones.** Solo `border`, `background`, `color`.

✅ **Verificación:** `npx vitest run` (**268/268**) + `npx vite build` (**1432**) + prueba manual: un pedido recién pagado es NORMAL (verde), a los 3 min pasa a WARNING (ámbar), a los 7 min a CRITICAL (rojo).

⚠️ **Riesgo POS:** Nulo.
⚠️ **Riesgo de ejecución:** Medio (toca dos secciones, pero cambios aditivos).

---

## FASE 15.4 — Umbrales configurables en `system_settings` (D6)

🎯 **Objetivo:** Permitir ajustar `warningSec` / `criticalSec` sin recompilar.

📍 **Evidencia:** [`settings/router.py:17`](../apps/api/modules/settings/router.py:17) expone `PATCH /{key}`; [`settings/service.py`](../apps/api/modules/settings/service.py:1) tiene el patrón de seed (verificado con `heladeria_display_precios_config` y `heladeria_totem_content`).

🔧 **Cambios (backend):**
- Sembrar la clave `heladeria_kds_urgency_config` en [`seed_settings`](../apps/api/modules/settings/service.py:24) con `{"warningSec":180,"criticalSec":420}`, categoría `heladeria`, `input_type` `json`. **Aditivo** — no toca claves existentes.
- **Sin migración Alembic** (usa `system_settings`).

🔧 **Cambios (frontend — la Revisión 1 omitía esto):**
- Añadir a [`heladeriaService.js`](../apps/heladeria/services/heladeriaService.js:1):
  - `async getKdsUrgencyConfig()` → GET `/settings/` + busca la clave + `JSON.parse`. Devuelve `null` si no existe o está corrupta.
  - `async saveKdsUrgencyConfig(config)` → **PATCH** `/settings/heladeria_kds_urgency_config` con `{ value: JSON.stringify(config) }`.
- En cada KDS, al montar: `getKdsUrgencyConfig()` → `normalizeThresholds(raw)` → estado local.
- **Fallback obligatorio:** si el fetch falla o devuelve `null`, usar `DEFAULT_URGENCY_THRESHOLDS`. **Nunca** bloquear el render del KDS por un fallo de settings.
- **Auto-reparación (patrón V17):** si la clave no existe, llamar `POST /settings/seed` una vez y reintentar; si vuelve a fallar, usar defaults.

✅ **Verificación:** `docker exec rderico-api-dev python -m pytest -q` (baseline **50/50**) + `GET /api/v1/settings/` = **200** + cambiar el valor vía PATCH y ver el cambio de color sin recargar código.

⚠️ **Riesgo POS:** Nulo (clave nueva, no colisiona con claves del POS).
⚠️ **Riesgo de ejecución:** Bajo.

---

## FASE 15.5 — Documentación (D10)

🎯 **Objetivo:** Registrar el módulo en la documentación maestra.

🔧 **Cambios:**
- Actualizar [`ESPECIFICACIONES DEL PROYECTO/DOCUMENTACION_MODULO_HELADERIA.md`](../ESPECIFICACIONES%20DEL%20PROYECTO/DOCUMENTACION_MODULO_HELADERIA.md:1):
  - Añadir `kdsUrgency.js` a la tabla de **Servicios/Utils**.
  - Añadir la clave `heladeria_kds_urgency_config` a la sección de `system_settings`.
  - Añadir `getKdsUrgencyConfig` / `saveKdsUrgencyConfig` a la tabla de servicios.
  - Mover "KDS Inteligente" de "Oleada 2" a "✅ Completado".
- **Cementerio de Bugs:** la Revisión 1 pedía documentar el "Incidente 16.1" allí, pero **ese incidente nunca se registró como bug** (fue una decisión de diseño de V16). La Revisión 2 **añade una entrada nueva** al Cementerio: *"BUG 3: Efecto Estrobo por animaciones infinitas en indicadores de polling (Incidente 16.1)"*, con la regla derivada: **urgencia = color, nunca animación**.

✅ **Verificación:** el documento menciona `kdsUrgency.js`, `heladeria_kds_urgency_config` y el BUG 3.

⚠️ **Riesgo POS:** Nulo.

---

## 📊 ORDEN DE EJECUCIÓN Y COMMITS

| Orden | Fase | Commit sugerido | Riesgo Ejecución | Riesgo POS | Obligatoria |
|---|---|---|---|---|---|
| 0 | **FASE 0** (maestro) | `fix(heladeria): saneamiento heladeriaTerminals` | Medio | Nulo | ✅ (ya hecha) |
| 1 | 15.1 | `feat(heladeria): kdsUrgency puro + tests` | Bajo | Nulo | ✅ |
| 2 | 15.3 | `feat(heladeria): urgencia visual por color en KDS` | Medio | Nulo | ✅ |
| 3 | 15.4 | `feat(heladeria): umbrales KDS en system_settings` | Bajo | Nulo | ✅ |
| 4 | 15.5 | `docs(heladeria): KDS inteligente` | Nulo | Nulo | ✅ |
| 5 | 15.2 | `refactor(heladeria): KdsBoard compartido` | **Alto** | Nulo | ⚪ **Opcional** |

> **Nota:** la Fase 15.2 (KdsBoard) se movió al **final** y se marcó **opcional**. La Revisión 1 la ponía en medio con "Riesgo Nulo", lo cual era incorrecto (D5).

---

## 🎯 CRITERIOS DE ACEPTACIÓN

1. `kdsUrgency.js` es **puro** (sin React/DOM/fetch) y tiene tests verdes.
2. La urgencia se comunica **solo con color** — cero animaciones infinitas (Incidente 16.1).
3. `computeElapsedSec` maneja correctamente el **offset del servidor** y **nunca** devuelve negativo.
4. `sortOrdersByUrgency` **no muta** el array de entrada.
5. Los umbrales se leen de `system_settings` con **fallback** a `DEFAULT_URGENCY_THRESHOLDS`.
6. **Restricción A respetada:** cero archivos de `apps/pos/` **modificados**.
7. **Restricción B respetada:** cero escrituras a `products` / `categories`; **cero campos de alérgenos añadidos**.
8. **Cero precios hardcodeados** en el código de V15.
9. Baselines intactos: **vitest 268/268** (+18 nuevos = ~286), **build 1432** módulos, **pytest 50/50**.
10. El KDS **sigue funcionando** si `system_settings` no responde (fallback).

---

## 🔄 PROTOCOLO DE REVERSIÓN

1. **Código:** revertir los commits de las fases 15.1–15.5 (`git revert <sha>`).
2. **`system_settings`:** eliminar la clave `heladeria_kds_urgency_config` (o restaurar su valor previo).
3. **Migraciones:** ninguna (V15 no crea migraciones Alembic).
4. **Volúmenes:** ninguno afectado.
5. **Verificación post-reversión:** los KDS vuelven a mostrar la lista plana sin urgencia; `GET /api/v1/settings/` sigue en 200.

---

## 📝 NOTAS DE DISEÑO

1. **¿Por qué color y no animación?** El Incidente 16.1 (Efecto Estrobo) demostró que las animaciones infinitas sobre indicadores dependientes de polling causan parpadeo y mareo. La urgencia es información estática → color.
2. **¿Por qué se eliminó el asistente de lotes?** Porque los alérgenos **no existen** en el sistema (D1) y crearlos violaría la Restricción B. Se difiere a un plan futuro (V18) condicionado a que Gestión de Productos exponga ese dato.
3. **¿Por qué lógica pura?** Patrón "Guardián del contrato" ya usado en [`warehouseMappers.js`](../apps/inventory/utils/warehouseMappers.js:1), [`terminalCardState.js`](../apps/pos/utils/terminalCardState.js:1), [`networkClassifiers.js`](../apps/network/utils/networkClassifiers.js:1). Permite testear sin montar React.
4. **¿Por qué `system_settings` y no una tabla nueva?** Los umbrales son configuración, no datos de negocio. Evita una migración Alembic.
5. **¿Por qué V15 va al final?** Es el plan de mayor riesgo de ejecución (toca UI en producción) y el de menor urgencia operativa. Va después de V17, V14 y V16.
6. **¿Por qué el reloj de urgencia es de 1 s y el polling de 5 s?** Porque la urgencia cambia cada segundo, pero los datos del pedido no. Separarlos evita refetch innecesario (D8).
7. **¿Por qué la urgencia se mide desde el pago y no desde la creación?** Porque un pedido creado a las 10:00 y pagado a las 10:25 no debe aparecer con 25 min de urgencia al instante de pagarse (D7). **Limitación conocida:** `paid_at` hoy siempre es `None` ([`service.py:180`](../apps/api/modules/heladeria/service.py:180)), así que se usa `created_at` como **aproximación**. Cuando el backend trackee `paid_at`, `computeElapsedSec` debe preferirlo. Se documenta como **deuda técnica**.

---

## ✅ CHECKLIST DE APROBACIÓN

- [ ] FASE 0 completada (prerequisito).
- [ ] `kdsUrgency.js` creado y puro.
- [ ] `kdsUrgency.test.js` con ~18 tests verdes.
- [ ] Urgencia visual aplicada en ambos KDS (color, sin animación).
- [ ] Reloj de urgencia (1 s) separado del polling (5 s).
- [ ] Umbrales en `system_settings` (`heladeria_kds_urgency_config`) + servicio frontend + fallback.
- [ ] Documentación actualizada (incluye BUG 3 del Cementerio).
- [ ] **Restricción A confirmada:** cero archivos de `apps/pos/` modificados.
- [ ] **Restricción B confirmada:** cero escrituras a `products` / `categories`; cero campos de alérgenos.
- [ ] Cero precios hardcodeados.
- [ ] Baselines intactos (**vitest 268/268 + 18**, **build 1432**, **pytest 50/50**).
- [ ] KDS funcional si `system_settings` no responde (fallback verificado).
- [ ] ⚪ Fase 15.2 (KdsBoard) — **opcional**, solo si hay tiempo y se verifica paridad.

---

## ANEXO A — BITÁCORA DE CORRECCIONES (Revisión 1 → Revisión 2)

| # | Defecto (Revisión 1) | Severidad | Corrección (Revisión 2) |
|---|---|---|---|
| **D1** | El asistente de lotes dependía de **alérgenos inexistentes** en el sistema | 🔴 Bloqueante | **Eliminado** de V15. Diferido a V18 condicionado a Gestión de Productos |
| **D2** | Asumía `created_at` en UTC; es **naive local** ([`pos/models.py:34`](../apps/api/modules/pos/models.py:34)) | 🔴 Bloqueante | `computeElapsedSec` usa el offset del servidor (`heladeria_tz_offset`) con fallback a `0` |
| **D3** | Baselines desfasados: vitest 141, build 1419, pytest 39 | 🔴 Bloqueante | Actualizados a **vitest 268**, **build 1432**, **pytest 50/50** |
| **D4** | Afirmaba que los dos KDS "duplican la lógica" — **son divergentes** | 🟠 Grave | Reconocida la divergencia real; el refactor preserva diferencias vía props |
| **D5** | Fase 15.3 marcada "Riesgo POS: Nulo" (confunde riesgo POS con riesgo de ejecución) | 🟠 Grave | Reclasificada como **Riesgo de ejecución ALTO** y movida al final como **opcional** |
| **D6** | Fase 15.5 no especificaba el servicio frontend ni el fallback | 🟠 Grave | Añadidos `getKdsUrgencyConfig` / `saveKdsUrgencyConfig` + fallback + auto-reparación |
| **D7** | Urgencia medida desde `created_at` sin justificar | 🟡 Menor | Documentada la semántica; `paid_at` es deuda técnica conocida |
| **D8** | No definía el reloj de urgencia vs. el polling de 5 s | 🟡 Menor | Reloj de 1 s separado del polling de 5 s |
| **D9** | `formatElapsed` ambiguo para >1 h | 🟡 Menor | Especificado: `>= 3600 s` → `"1h 05m"` |
| **D10** | Pedía documentar el "Incidente 16.1" en el Cementerio, donde **no existía** | 🟡 Menor | Se añade **BUG 3** nuevo al Cementerio |
| **D11** | El plan nunca pasó por auto-auditoría | 🟡 Menor | Este Anexo A documenta el proceso Revisión 1 → Revisión 2 |

**Resumen:** 11 defectos detectados — **3 bloqueantes** (D1, D2, D3), **3 graves** (D4, D5, D6) y **5 menores** (D7–D11). Los tres bloqueantes se corrigieron antes de aprobar la ejecución; ninguno de ellos tocaba el POS de Panadería, pero D2 habría producido una urgencia visualmente incorrecta (reloj desfasado 6 h) y D1 habría intentado leer campos inexistentes.

---

## ANEXO B — DIFERENCIAS CLAVE vs. REVISIÓN 1

| Aspecto | Revisión 1 | Revisión 2 |
|---|---|---|
| **Asistente de lotes** | Incluido (Fase 15.4) | ❌ **Eliminado** (dependía de alérgenos inexistentes) |
| **Zona horaria** | Asumía UTC | Offset del servidor (`heladeria_tz_offset`) + fallback `0` |
| **Baselines** | vitest 141 / build 1419 / pytest 39 | vitest **268** / build **1432** / pytest **50/50** |
| **KdsBoard (refactor)** | Fase 15.2 obligatoria | ⚪ **Opcional/degradada** (los KDS son divergentes) |
| **Riesgo de la Fase 15.3** | "Riesgo POS: Nulo" | **Riesgo de ejecución ALTO** (movida al final) |
| **Servicio frontend de umbrales** | No especificado | `getKdsUrgencyConfig` / `saveKdsUrgencyConfig` + fallback |
| **Reloj de urgencia** | No definido | Reloj de 1 s separado del polling de 5 s |
| **`formatElapsed` >1 h** | Ambiguo | `>= 3600 s` → `"1h 05m"` |
| **Cementerio de Bugs** | Referenciaba un "Incidente 16.1" inexistente | Añade **BUG 3** nuevo |
| **Auto-auditoría** | Ausente | Anexo A documenta el proceso |

---

## ANEXO C — PROTOCOLO DE NO-INTERFERENCIA CON EL POS (RESUMEN OPERATIVO)

Antes de **cada** commit de V15, ejecutar y confirmar:

1. `git status --short` → **cero** archivos bajo `apps/pos/` en el diff.
2. `git diff --name-only HEAD~1` → verificar que ningún path empieza con `apps/pos/`.
3. `npx vitest run` → **268/268** (o 268 + N de los tests nuevos de V15).
4. `docker exec rderico-api-dev python -m pytest -q` → **50/50**.
5. `npx vite build` → **1432** módulos (o 1432 + N si se añaden archivos).
6. `curl.exe -s -o NUL -w "%{http_code}" http://localhost:5001/api/v1/settings/` → **200**.
7. `curl.exe -s -o NUL -w "%{http_code}" http://localhost:5000/index.html` → **200**.

Si **cualquiera** de los 7 pasos falla, **revertir el commit** y diagnosticar antes de continuar.

---

## ANEXO D — DEUDA TÉCNICA ACEPTADA (NO BLOQUEANTE)

| # | Deuda | Impacto | Mitigación actual |
|---|---|---|---|
| **T1** | `paid_at` siempre es `None` en `KdsOrderResponse` | La urgencia se mide desde `created_at`, no desde el pago | Documentado; el KDS ya ordena por `created_at` |
| **T2** | `created_at` es naive local (sin `timezone=True`) | Requiere el offset del servidor para calcular la urgencia | `heladeria_tz_offset` con fallback `0` |
| **T3** | Los dos KDS son divergentes (no comparten componente) | Duplicación de lógica de render | Fase 15.2 opcional; el refactor preserva diferencias |
| **T4** | No existen campos de alérgenos en el catálogo | Imposibilita el asistente de lotes | Diferido a V18 condicionado a Gestión de Productos |
| **T5** | `heladeria_kds_urgency_config` no existe en el seed | El KDS debe funcionar con fallback | Fallback en el servicio frontend + auto-reparación |

---

**FIN DEL PLAN — Revisión 2**
