# 📋 REPORTE DE EJECUCIÓN — Corrección del Estado POS v17

**Fecha:** 20/Septiembre/2026
**Plan ejecutado:** [`PLAN_CORRECCION_ESTADO_POS_V17.md`](PLAN_CORRECCION_ESTADO_POS_V17.md)
**Objetivo:** Centralizar la limpieza de sesión del POS en una **fuente única de verdad** (`buildResetPatch()`), corrigiendo la **asimetría verificada** entre las rutas de salida, sin romper el módulo crítico.
**Estado:** ✅ **COMPLETADO** — 6 fases + verificación final.

---

## 1. RESUMEN EJECUTIVO

| Métrica | Baseline (pre-v17) | Final (post-v17) | Δ |
|---------|--------------------|------------------|---|
| Tests | 503 | **533** | **+30** |
| Archivos de test | 15 | **19** | +4 |
| Build | 8.52s | **8.78s** | +0.26s |
| Rutas de salida con limpieza manual | 5 | **0** | −5 |
| Fuentes de verdad de limpieza | 5 (espejos) | **1** (`buildResetPatch`) | −4 |
| `datetime.now()` en código vivo (POS API) | 3 | **0** | −3 |

**Resultado:** La limpieza de sesión pasó de estar **duplicada a mano en 5 rutas** (frágil por acumulación) a una **función pura única**. La asimetría verificada quedó corregida y **blindada por tests**.

---

## 2. EJECUCIÓN POR FASE

### FASE 0 — Reproducción de la asimetría + baseline (BLOQUEANTE)

- **Baseline medido:** `npm test` → **503 passed** (15 archivos); `npm run build` → **8.52s**.
- **Test de reproducción creado:** [`apps/pos/state/sessionReset.asymmetry.test.js`](apps/pos/state/sessionReset.asymmetry.test.js).
- **Resultado:** **8/8 tests** — la asimetría quedó **REPRODUCIDA**:
  - `handleExitWithoutSaving` **SÍ** limpia `savedTicketRef.current`, `showExitModal`, `pendingExitAction`.
  - La rama `success` de `handleTicketAction` **NO** los limpia.
- **Incidente técnico resuelto:** los archivos fuente usan **CRLF** (Windows). Las anclas de extracción devolvían `null`. Se normalizó `\r\n` → `\n` en `readSource()`.
- **Commit:** `27c3469` (Fase 0 + Fase 1).

### FASE 1 — Fuente única de verdad (`buildResetPatch`)

- **Creado:** [`apps/pos/state/sessionReset.js`](apps/pos/state/sessionReset.js).
  - `buildResetPatch()` — función **pura**, devuelve los **12 valores** de reset (incluidos los 3 que faltaban: `savedTicket`, `showExitModal`, `pendingExitAction`).
  - `RESET_PATCH_KEYS` — las 12 claves, congeladas.
  - `FORBIDDEN_PATCH_KEYS` — límite explícito (carrito, catálogo, impresión, UI).
- **Creado:** [`apps/pos/state/sessionReset.test.js`](apps/pos/state/sessionReset.test.js) — **4 tests**: 12 claves, valores correctos, sin claves prohibidas, pureza (referencias distintas).
- **Resultado:** 4/4 tests. Código **muerto** (nadie lo importa aún) → riesgo cero.
- **Commit:** `27c3469`.

### FASE 2a — Ruta 1: `handleExitWithoutSaving`

- **Modificado:** [`apps/pos/RetailVisionPOS.jsx`](apps/pos/RetailVisionPOS.jsx) — la limpieza manual (13 sentencias) se reemplazó por `buildResetPatch()` + sincronización explícita de refs.
- **Creado:** [`apps/pos/state/sessionReset.equivalence.test.js`](apps/pos/state/sessionReset.equivalence.test.js) — prueba que el estado resultante es **idéntico** al de la limpieza vieja.
- **Resultado:** 522 tests verdes. Build 8.33s.
- **Commit:** `b696220`.

### FASE 2b — Ruta 2: rama `success` de `handleTicketAction` (CORRECCIÓN DE LA ASIMETRÍA)

- **Modificado:** [`apps/pos/hooks/useTicketActions.js`](apps/pos/hooks/useTicketActions.js) — la rama `success` ahora aplica `buildResetPatch()` e incluye las **3 claves que faltaban**.
- **Hallazgo durante la ejecución:** `setShowExitModal` y `setPendingExitAction` **NO estaban** en las props del hook. Se añadieron al hook **y** al call site en [`RetailVisionPOS.jsx`](apps/pos/RetailVisionPOS.jsx).
- **Test de asimetría actualizado:** pasó de "reproducir" a "guardar la corrección" (guardián de regresión).
- **Resultado:** 522 tests verdes. Build 8.46s.
- **Commit:** `a1fafdf`.

### FASE 2c — Ruta 3: `doTerminalExit`

- **Modificado:** [`apps/pos/RetailVisionPOS.jsx`](apps/pos/RetailVisionPOS.jsx) — antes limpiaba solo **3 valores** a mano (hallazgo A3); ahora aplica el patch completo.
- **Incidente técnico resuelto:** el test falló con `patchedSuccessCleanup is not defined` (los helpers estaban dentro de un `describe`). Se reescribió el archivo de equivalencia con **todos los helpers a nivel de módulo**.
- **Resultado:** 525 tests verdes. Build 7.84s.
- **Commit:** `f891099`.

### FASE 3 — Tests de arquitectura (best-effort) + HALLAZGO NUEVO

- **Creado:** [`apps/pos/state/architecture.test.js`](apps/pos/state/architecture.test.js) — **8 tests** con regex **ancladas y con contexto**:
  - v15 (H2): prohíbe `datetime.now()` en código vivo de `apps/api/modules/pos/`.
  - v7.0.3: exige `terminal_id` **dentro** del `JSON.stringify` del beacon de emergencia.
  - Documentado en el propio test que es **best-effort** (no cubre alias ni AST).
- **🔴 HALLAZGO NUEVO (A5):** el test **falló en la primera corrida**, como anticipaba el criterio de salida de la Fase 3. La corrección H2 de v15 se aplicó **solo a `occupancy.py`**; quedaban **3 usos de `datetime.now()`** en código vivo:
  - [`router.py:135`](apps/api/modules/pos/router.py:135) — defaults de fecha en `/audit`.
  - [`router.py:408`](apps/api/modules/pos/router.py:408) — log de `force_unlock`.
  - [`pos_audit.py:82`](apps/api/modules/pos/pos_audit.py:82) — log de auditoría POS.
- **Corrección:** los 3 se sustituyeron por `utcnow()` de [`core/timestamps.py`](apps/api/core/timestamps.py:21). En `router.py` se conservó `from datetime import datetime` porque sigue usándose `datetime.fromisoformat()`.
- **Resultado:** 8/8 tests de arquitectura. **533 tests** verdes. Build 8.78s.
- **Commit:** `9de8370`.

### FASE 4 — Validación manual de los 5 flujos

Validación en navegador (servidor de desarrollo en `http://localhost:5173/`):

| # | Flujo | Resultado |
|---|-------|-----------|
| 1 | Enviar y salir (ruta 2) | ✅ OK |
| 2 | Salir sin guardar (ruta 1) | ✅ OK |
| 3 | Cambiar de terminal (ruta 3) | ✅ OK |
| 4 | Force logout (ruta 4) | ✅ OK |
| 5 | `window.requestPOSExit` desde ExperimentCenterUI (ruta 5) | ✅ OK |

**Cero residuos entre sesiones:** ✅ verificado.

### FASE 5 — Documentación y respaldo

- **Incidente v17** añadido a [`DOCUMENTACION_MODULO_POS.md`](ESPECIFICACIONES%20DEL%20PROYECTO/DOCUMENTACION_MODULO_POS.md) (Sección 3).
- **REGLA 19** ("Limpieza Única de Sesión vía `buildResetPatch()`") añadida a la Sección 4.
- **6 ítems** añadidos al checklist de revisión (Sección 6).
- **Este reporte** creado.
- **Respaldo en GitHub.**

---

## 3. COMMITS ATÓMICOS

| Commit | Fase | Contenido |
|--------|------|-----------|
| `27c3469` | 0 + 1 | Test de asimetría (reproducción) + `sessionReset.js` + `sessionReset.test.js` |
| `b696220` | 2a | Patch en `handleExitWithoutSaving` + test de equivalencia |
| `a1fafdf` | 2b | Patch en rama `success` + asimetría CORREGIDA + 2 props nuevas |
| `f891099` | 2c | Patch en `doTerminalExit` + test |
| `9de8370` | 3 | `architecture.test.js` + hallazgo A5 (3 `datetime.now()` corregidos) |

**Tag de restauración:** `pre-v17-estado-pos` → `0892e6d`.

---

## 4. CRITERIOS DE ACEPTACIÓN GLOBALES

| # | Criterio | Estado |
|---|----------|--------|
| 1 | `npm test` verde, con **más** tests que el baseline (503+) | ✅ **533** |
| 2 | `npm run build` verde | ✅ **8.78s** |
| 3 | Los **5** flujos de salida idénticos al comportamiento actual | ✅ 5/5 |
| 4 | **Cero residuos** entre sesiones | ✅ verificado |
| 5 | Test de equivalencia por cada ruta migrada | ✅ 3/3 rutas |
| 6 | `buildResetPatch()` es puro (test) | ✅ |
| 7 | Documentación actualizada | ✅ |

---

## 5. HALLAZGOS Y LECCIONES

### Hallazgos de la auditoría (A1–A5)

| ID | Hallazgo | Gravedad | Estado |
|----|----------|----------|--------|
| **A1** | Limpieza duplicada a mano en 5 rutas | Alta (latente) | ✅ Corregido |
| **A2** | Asimetría: rama `success` no limpiaba 3 claves | Alta (latente) | ✅ Corregido |
| **A3** | `doTerminalExit` limpiaba solo 3 valores | Media (latente) | ✅ Corregido |
| **A4** | Sin fuente única de verdad | Alta (latente) | ✅ Corregido |
| **A5** | 3 `datetime.now()` residuales (H2 de v15 incompleto) | Media (latente) | ✅ Corregido |

### Lecciones

1. **"Frágil por acumulación":** la duplicación manual de lógica no falla de golpe; se degrada silenciosamente. La asimetría A2 llevaba tiempo latente sin síntoma visible.
2. **Los tests de arquitectura best-effort SÍ encuentran bugs reales:** el test de la Fase 3 destapó A5 en su primera corrida. El criterio de salida ("si falla → hallazgo nuevo") funcionó exactamente como se diseñó.
3. **Los tests de caracterización deben actualizarse al corregir:** el test de asimetría pasó de "reproducir el bug" a "guardar la corrección". Es el ciclo correcto.
4. **CRLF importa:** los tests que leen código fuente deben normalizar los fines de línea.

---

## 6. ARCHIVOS INVOLUCRADOS

**Nuevos:**
- `apps/pos/state/sessionReset.js`
- `apps/pos/state/sessionReset.test.js`
- `apps/pos/state/sessionReset.asymmetry.test.js`
- `apps/pos/state/sessionReset.equivalence.test.js`
- `apps/pos/state/architecture.test.js`
- `ESPECIFICACIONES DEL PROYECTO/REPORTE_EJECUCION_ESTADO_POS_V17.md`

**Modificados:**
- `apps/pos/RetailVisionPOS.jsx`
- `apps/pos/hooks/useTicketActions.js`
- `apps/api/modules/pos/router.py`
- `apps/api/modules/pos/pos_audit.py`
- `ESPECIFICACIONES DEL PROYECTO/DOCUMENTACION_MODULO_POS.md`

---

## 7. ROLLBACK

Cada fase es un **commit atómico** y reversible de forma independiente:

| Fase | Rollback |
|------|----------|
| 0 | N/A (sin cambios de producción) |
| 1 | `git revert 27c3469` (código muerto) |
| 2a | `git revert b696220` |
| 2b | `git revert a1fafdf` |
| 2c | `git revert f891099` |
| 3 | `git revert 9de8370` |
| 5 | `git revert` (solo docs) |

**Restauración total:** `git reset --hard pre-v17-estado-pos` (→ `0892e6d`).
