# 🧠 PLAN HELADERÍA V15 — KDS INTELIGENTE (Urgencia Visual + Asistente de Lotes)

**Fecha:** 2026-09-13
**Autor:** Arquitectura ERP R de Rico
**Estado:** 📋 PLANIFICADO (no iniciado)
**Alcance:** Módulo Heladería — pantallas KDS (`KdsHeladosUI.jsx`, `KdsMalteadasUI.jsx`) + lógica pura compartida.
**Depende de:** ⚠️ **FASE 0** (saneamiento de `heladeriaTerminals.js`) — ver [`PLAN_HELADERIA_MAESTRO.md`](PLAN_HELADERIA_MAESTRO.md:1)
**Predecesor:** V16 (Tótem Sugestivo) · **Sucesor:** ninguno (último de la oleada)

---

## 🚨 PROTOCOLO DE NO-INTERFERENCIA AL POS

Este plan **NO toca** el módulo **"Punto de Venta IA"** (Panadería). Ver Restricción A más abajo.

**PROHIBIDO en este plan:**
1. ❌ Modificar cualquier archivo de `apps/pos/` (incluido `RetailVisionPOS.jsx`).
2. ❌ Importar componentes de UI desde `apps/pos/` (solo utilidades sin estado: `CONFIG`, `withRetries`).
3. ❌ Construir URLs manualmente con `window.location.hostname + ':5001'`. **Solo** `CONFIG.API_BASE_URL` desde [`apps/pos/config.js`](../apps/pos/config.js:16).
4. ❌ Animaciones CSS infinitas (`animate-pulse`, `animation: float ... infinite`) sobre indicadores estáticos. **Incidente 16.1 (Efecto Estrobo).** La urgencia se comunica con **COLOR**, no con animación.
5. ❌ Auto-ejecutar acciones en el KDS (el asistente de lotes **SUGIERE**, el humano confirma).
6. ❌ Escribir en las tablas `products` ni `categories` (Restricción B).

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

**Este plan (V15) SOLO LEE el catálogo y ESCRIBE estado operativo del KDS.**

| Acción | ¿Permitido? |
|---|---|
| Leer pedidos del KDS (`GET /heladeria/kds/{station}`) | ✅ |
| Cambiar estado de un ítem (`PATCH /heladeria/kds/items/{id}/status`) | ✅ |
| Leer umbrales desde `system_settings` | ✅ |
| Crear/editar sabores o productos | ❌ |
| Cambiar precios | ❌ |
| Decidir en qué POS aparece un producto | ❌ (se define en Gestión de Productos) |
| Escribir en `products` / `categories` | ❌ |

> **Nota:** el mecanismo "en qué POS aparece cada producto/categoría" se definirá **desde Gestión de Productos** y aún no existe. Es una **dependencia futura NO bloqueante** para V15 (el KDS no muestra catálogo, muestra pedidos).

---

## 📋 RESUMEN

Hoy los KDS (`KdsHeladosUI.jsx`, `KdsMalteadasUI.jsx`) muestran pedidos en una lista plana sin noción de **tiempo transcurrido** ni de **prioridad**. En hora pico, un pedido de hace 10 minutos se ve igual que uno de hace 30 segundos.

V15 introduce dos capacidades, ambas con **lógica pura testeable** (patrón "Guardián del contrato"):

1. **Urgencia visual por color** — cada pedido se clasifica en `NORMAL` / `WARNING` / `CRITICAL` según segundos transcurridos. Se pinta con **color de fondo/borde**, **sin animaciones** (Incidente 16.1).
2. **Asistente de lotes (batch)** — para malteadas, sugiere agrupar pedidos compatibles en un mismo ciclo de licuadora (máx. 3 vasos), respetando **alérgenos**. **Sugiere, no ejecuta.**

---

## FASE 15.1 — `kdsUrgency.js` (lógica pura + tests)

🎯 **Objetivo:** Extraer el cálculo de urgencia a un módulo puro, sin React/DOM/fetch.

📍 **Evidencia:** Hoy no existe. El color se decide inline en cada KDS.

🔧 **Cambios:**
- Crear [`apps/heladeria/utils/kdsUrgency.js`](../apps/heladeria/utils/kdsUrgency.js:1) con:
  - `URGENCY_LEVELS = { NORMAL: 'NORMAL', WARNING: 'WARNING', CRITICAL: 'CRITICAL' }`
  - `DEFAULT_URGENCY_THRESHOLDS = { warningSec: 180, criticalSec: 420 }`
  - `computeElapsedSec(createdAtIso, nowMs = Date.now())` → segundos transcurridos (UTC almacenado, local mostrado).
  - `classifyUrgency(elapsedSec, thresholds)` → nivel.
  - `urgencyColor(level)` → `{ bg, border, text }` (colores semánticos, **sin animación**).
  - `sortOrdersByUrgency(orders, thresholds, nowMs)` → ordena CRITICAL → WARNING → NORMAL, desempate por antigüedad.
  - `formatElapsed(elapsedSec)` → `"3m 20s"`.
  - `normalizeThresholds(raw)` → valida y aplica defaults si faltan o son inválidos.
- Crear [`apps/heladeria/utils/kdsUrgency.test.js`](../apps/heladeria/utils/kdsUrgency.test.js:1) con **~12 tests**:
  - límites exactos (179/180/181, 419/420/421),
  - `normalizeThresholds` con `null`, `{}`, valores negativos, `warningSec > criticalSec`,
  - `sortOrdersByUrgency` con empate,
  - `formatElapsed` en 0s, 59s, 60s, 3600s,
  - **guardián:** `urgencyColor` NO devuelve ninguna propiedad de animación.

✅ **Verificación:** `npx vitest run apps/heladeria/utils/kdsUrgency.test.js` → 12/12.

⚠️ **Riesgo POS:** Nulo (archivo nuevo, no importado por POS).

---

## FASE 15.2 — `batchAssistant.js` (lógica pura + tests)

🎯 **Objetivo:** Sugerir agrupaciones de malteadas compatibles para optimizar la licuadora.

📍 **Evidencia:** Hoy cada malteada se prepara de a una; la licuadora (3 vasos) se subutiliza.

🔧 **Cambios:**
- Crear [`apps/heladeria/utils/batchAssistant.js`](../apps/heladeria/utils/batchAssistant.js:1) con:
  - `MAX_BLENDERS = 3`
  - `DEFAULT_BATCH_CONFIG = { maxPerBatch: 3, respectAllergens: true, maxWaitSec: 240 }`
  - `areCompatible(orderA, orderB, config)` → `false` si comparten alérgeno declarado y `respectAllergens` está activo.
  - `buildBatches(orders, config)` → `[{ orders: [...], reason }]` (sugerencias, no ejecución).
  - `estimateBatchDuration(batch)` → segundos estimados.
  - `optimizeBatchOrder(batches)` → ordena por urgencia + duración.
  - `validateBatchConfig(config)` / `normalizeBatchConfig(raw)`.
- Crear [`apps/heladeria/utils/batchAssistant.test.js`](../apps/heladeria/utils/batchAssistant.test.js:1) con **~15 tests**:
  - compatibilidad por alérgeno (bloquea y permite),
  - `buildBatches` respeta `maxPerBatch`,
  - pedidos incompatibles van a lotes distintos,
  - `estimateBatchDuration` monótono,
  - `normalizeBatchConfig` con basura,
  - **guardián:** `buildBatches` **nunca** muta el array de entrada.

✅ **Verificación:** `npx vitest run apps/heladeria/utils/batchAssistant.test.js` → 15/15.

⚠️ **Riesgo POS:** Nulo (archivo nuevo).

---

## FASE 15.3 — `KdsBoard.jsx` (componente compartido)

🎯 **Objetivo:** Un solo componente de tablero KDS reutilizado por Helados y Malteadas, eliminando duplicación.

📍 **Evidencia:** [`KdsHeladosUI.jsx`](../apps/heladeria/sections/KdsHeladosUI.jsx:15) y [`KdsMalteadasUI.jsx`](../apps/heladeria/sections/KdsMalteadasUI.jsx:14) duplican la lógica de lista y cambio de estado.

🔧 **Cambios:**
- Crear [`apps/heladeria/components/KdsBoard.jsx`](../apps/heladeria/components/KdsBoard.jsx:1) que reciba `{ station, orders, onStatusChange, thresholds, showBatchAssistant }`.
- Usar `classifyUrgency` + `urgencyColor` para pintar cada tarjeta (color, **sin animación**).
- Refactorizar `KdsHeladosUI.jsx` y `KdsMalteadasUI.jsx` para consumir `KdsBoard`.
- Mantener intactos los endpoints: `GET /heladeria/kds/{station}` y `PATCH /heladeria/kds/items/{item_id}/status` (ver [`apps/api/modules/heladeria/router.py`](../apps/api/modules/heladeria/router.py:52)).

✅ **Verificación:** `npx vitest run` (baseline 141/141 se mantiene) + `npm run build` (1419 módulos) + prueba manual: los dos KDS siguen cambiando estado.

⚠️ **Riesgo POS:** Nulo (solo archivos de `apps/heladeria/`).

---

## FASE 15.4 — Asistente de lotes en KDS Malteadas

🎯 **Objetivo:** Mostrar las sugerencias de `buildBatches` en el KDS de Malteadas, con confirmación humana.

📍 **Evidencia:** Fase 15.2 produce las sugerencias; falta exponerlas.

🔧 **Cambios:**
- En `KdsMalteadasUI.jsx`, activar `showBatchAssistant`.
- Panel lateral "Sugerencias de lote" que lista los lotes propuestos con su `reason`.
- Botón **"Preparar lote"** que **solo marca visualmente** los pedidos agrupados (no cambia estado en backend).
- El cambio de estado sigue siendo manual por ítem (endpoint existente).

✅ **Verificación:** Prueba manual con 5 pedidos compatibles + 1 con alérgeno → el alérgeno queda fuera del lote.

⚠️ **Riesgo POS:** Nulo.

---

## FASE 15.5 — Umbrales configurables en `system_settings`

🎯 **Objetivo:** Permitir ajustar `warningSec` / `criticalSec` sin recompilar.

📍 **Evidencia:** [`apps/api/modules/settings/service.py`](../apps/api/modules/settings/service.py:10) ya expone `get_setting_by_key` / `update_setting`.

🔧 **Cambios:**
- Sembrar la clave `heladeria_kds_urgency_config` en `seed_settings` con `DEFAULT_URGENCY_THRESHOLDS`.
- El frontend lee la clave y la pasa por `normalizeThresholds` antes de usar.
- **Sin migración Alembic** (usa `system_settings`).

✅ **Verificación:** `docker exec rderico-api-dev python -m pytest -q` (baseline 39/39) + cambiar el valor y ver el cambio de color.

⚠️ **Riesgo POS:** Nulo (clave nueva, no colisiona con claves del POS).

---

## FASE 15.6 — Documentación

🎯 **Objetivo:** Registrar el módulo en la documentación maestra.

🔧 **Cambios:**
- Actualizar [`ESPECIFICACIONES DEL PROYECTO/DOCUMENTACION_MODULO_HELADERIA.md`](../ESPECIFICACIONES%20DEL%20PROYECTO/DOCUMENTACION_MODULO_HELADERIA.md:1) con la sección KDS Inteligente.
- Añadir al "Cementerio de bugs" la nota del Incidente 16.1 (urgencia por color, no animación).

✅ **Verificación:** Revisión de que el documento menciona `kdsUrgency.js` y `batchAssistant.js`.

⚠️ **Riesgo POS:** Nulo.

---

## 📊 ORDEN DE EJECUCIÓN Y COMMITS

| Orden | Fase | Commit sugerido | Riesgo Ejecución | Riesgo POS |
|---|---|---|---|---|
| 0 | **FASE 0** (maestro) | `fix(heladeria): saneamiento heladeriaTerminals` | Medio | Nulo |
| 1 | 15.1 | `feat(heladeria): kdsUrgency puro + tests` | Bajo | Nulo |
| 2 | 15.2 | `feat(heladeria): batchAssistant puro + tests` | Bajo | Nulo |
| 3 | 15.3 | `refactor(heladeria): KdsBoard compartido` | Medio | Nulo |
| 4 | 15.4 | `feat(heladeria): asistente de lotes en KDS Malteadas` | Medio | Nulo |
| 5 | 15.5 | `feat(heladeria): umbrales KDS en system_settings` | Bajo | Nulo |
| 6 | 15.6 | `docs(heladeria): KDS inteligente` | Nulo | Nulo |

---

## 🎯 CRITERIOS DE ACEPTACIÓN

1. `kdsUrgency.js` y `batchAssistant.js` son **puros** (sin React/DOM/fetch) y tienen tests verdes.
2. La urgencia se comunica **solo con color** — cero animaciones infinitas (Incidente 16.1).
3. El asistente de lotes **sugiere**; ningún estado se cambia sin acción humana.
4. `areCompatible` respeta alérgenos cuando `respectAllergens` está activo.
5. **Restricción A respetada:** cero archivos de `apps/pos/` modificados.
6. **Restricción B respetada:** cero escrituras a `products` / `categories`.
7. **Cero precios hardcodeados** en el código de V15.
8. Baselines intactos: vitest 141/141 (+27 nuevos), build 1419 módulos, pytest 39/39.

---

## 🔄 PROTOCOLO DE REVERSIÓN

1. **Código:** revertir los commits de las fases 15.1–15.6 (`git revert <sha>`).
2. **`system_settings`:** eliminar la clave `heladeria_kds_urgency_config` (o restaurar su valor previo).
3. **Migraciones:** ninguna (V15 no crea migraciones Alembic).
4. **Volúmenes:** ninguno afectado.
5. **Verificación post-reversión:** los KDS vuelven a mostrar la lista plana sin urgencia.

---

## 📝 NOTAS DE DISEÑO

1. **¿Por qué color y no animación?** El Incidente 16.1 (Efecto Estrobo) demostró que las animaciones infinitas sobre indicadores dependientes de polling causan parpadeo y mareo. La urgencia es información estática → color.
2. **¿Por qué el asistente no auto-ejecuta?** El KDS es un punto de control humano. Automatizar la agrupación sin confirmación puede producir errores de alérgenos irrecuperables.
3. **¿Por qué lógica pura?** Patrón "Guardián del contrato" ya usado en `warehouseMappers.js`, `terminalCardState.js`, `networkClassifiers.js`. Permite testear sin montar React.
4. **¿Por qué `system_settings` y no una tabla nueva?** Los umbrales son configuración, no datos de negocio. Evita una migración Alembic.
5. **¿Por qué V15 va al final?** Es el plan de mayor riesgo de ejecución (refactor de UI compartida) y el de menor urgencia operativa. Va después de V17, V14 y V16.

---

## ✅ CHECKLIST DE APROBACIÓN

- [ ] FASE 0 completada (prerequisito).
- [ ] `kdsUrgency.js` creado y puro.
- [ ] `kdsUrgency.test.js` con ~12 tests verdes.
- [ ] `batchAssistant.js` creado y puro.
- [ ] `batchAssistant.test.js` con ~15 tests verdes.
- [ ] `KdsBoard.jsx` compartido y consumido por ambos KDS.
- [ ] Asistente de lotes visible en KDS Malteadas (sugiere, no ejecuta).
- [ ] Umbrales en `system_settings` (`heladeria_kds_urgency_config`).
- [ ] Documentación actualizada.
- [ ] **Restricción A confirmada:** cero archivos de `apps/pos/` modificados.
- [ ] **Restricción B confirmada:** cero escrituras a `products` / `categories`.
- [ ] Cero precios hardcodeados.
- [ ] Baselines intactos (vitest 141/141 + 27, build 1419, pytest 39/39).
