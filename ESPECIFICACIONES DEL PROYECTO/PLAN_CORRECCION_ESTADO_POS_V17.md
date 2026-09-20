# PLAN DE CORRECCIÓN — ESTADO DEL POS (v17)

> **Reemplaza a:** [`PLAN_CORRECCION_ESTADO_POS_V16.md`](ESPECIFICACIONES%20DEL%20PROYECTO/PLAN_CORRECCION_ESTADO_POS_V16.md) (rechazado por [`REVISION_CRITICA_PLAN_ESTADO_POS_V16.md`](ESPECIFICACIONES%20DEL%20PROYECTO/REVISION_CRITICA_PLAN_ESTADO_POS_V16.md))
> **Módulo:** POS — **CRÍTICO**. Un error aquí pierde cuentas y dinero.
> **Principio rector:** **Primero no romper.** Cada fase es reversible, verificable y de riesgo acotado. Si una fase no puede garantizar equivalencia, NO se ejecuta.
> **Estado:** PROPUESTA v17 — pendiente de revisión crítica.

---

## 0. QUÉ CAMBIÓ RESPECTO A LA v16 (y por qué)

La v16 fue rechazada por 3 defectos graves. La v17 los corrige de raíz:

| Defecto v16 | Corrección en v17 |
|-------------|-------------------|
| **D1** — Afirmaba un bug fantasma en `doTerminalExit` sin verificarlo | **Fase 0 obligatoria: REPRODUCIR antes de tocar.** Si no se reproduce, el plan se reclasifica como preventivo y baja de prioridad. |
| **D2** — Ignoraba que el estado vive en 3 hooks + el padre | **§2 mapea el estado real** (30 props de `useTicketActions`, máquina interna de `useCart`, 5 rutas de salida). El alcance se **reduce** a lo que se puede migrar sin romper. |
| **D3** — Feature flag a nivel de línea (creaba un 5º espejo) | **Sin flag de línea.** Migración por **extracción de función pura** + tests de equivalencia. Reversible con `git revert`. |
| **D5** — Tests de arquitectura con regex frágiles | Tests de arquitectura **anclados y con contexto**, marcados como "best-effort", no como garantía. |
| **D6** — Reducer parcial sin justificar el límite | **§3.2 define explícitamente** qué entra y qué NO entra en la máquina. |
| **D7** — Esfuerzo no cuantificado | **§8 cuantifica** archivos, tests y horas por fase. |
| **D10** — Sin rollback real | **§7 define rollback** por fase (git revert + verificación). |

---

## 1. HALLAZGOS VERIFICADOS (base del plan)

Todo lo siguiente fue **verificado leyendo el código**, no asumido.

### 1.1 Superficie de estado real

| Ubicación | Estado | ¿Migrable a la máquina? |
|-----------|--------|-------------------------|
| [`RetailVisionPOS.jsx:31-69`](apps/pos/RetailVisionPOS.jsx:31) | 22 `useState` + 10 `useRef` | **Parcial** (ver §3.2) |
| [`useCart.js:25`](apps/pos/hooks/useCart.js:25) | Máquina interna `cartState` (`key` + `items`, v4.6 Anti-Wipe) | **NO** — tiene su propio candado; se deja intacta |
| [`usePOSSession.js:35`](apps/pos/hooks/usePOSSession.js:35) | `categories`, `initialProducts`, `activeCategory` | **NO** — es catálogo, no sesión de captura |
| [`useTicketActions.js:67`](apps/pos/hooks/useTicketActions.js:67) | `printTicketData` | **NO** — es de impresión |

### 1.2 El acoplamiento real (esto es lo que la v16 ignoró)

[`useTicketActions`](apps/pos/hooks/useTicketActions.js:23) recibe **30 props** del padre:

- **Estado compartido (6):** `selectedTerminal`, `currentUser`, `currentAccountNum`, `orderType`, `orderData`, `cashSessionId`
- **Refs compartidas (8):** `cartRef`, `accountNumRef`, `originalCapturerRef`, `ticketVersionRef`, `isGeneratingFolioRef`, `isRecoveringRef`, `actionMutexRef`, `savedTicketRef`
- **Funciones del carrito (6):** `addToCart`, `setCart`, `clearCart`, `cart`, `total`, `initialProducts`
- **Funciones de sesión (1):** `generateNewAccountNum`
- **Setters de UI (14):** `setCurrentAccountNum`, `setOriginalCapturer`, `setTicketVersion`, `setToastMessage`, `setLastSaveStatus`, `setLastSaveTime`, `setShowCheckout`, `setIsSendingToPizarron`, `setPaymentsHistory`, `setOrderType`, `setOrderData`, `setShowCorkboard`, `setAllOpenAccounts`, `paymentsHistory`

**Consecuencia:** `handleTicketAction` **escribe directamente** en 14 setters del padre. No tiene `dispatch`. Migrar a un reducer exige cambiar esta firma de 30 props → refactorización de alto riesgo. **La v17 NO lo hace en la primera iteración.**

### 1.3 Las 5 rutas de salida (la v16 solo vio 4)

| # | Ruta | Archivo:línea | Limpia |
|---|------|---------------|--------|
| 1 | `handleExitWithoutSaving` | [`RetailVisionPOS.jsx:385`](apps/pos/RetailVisionPOS.jsx:385) | 13 cosas |
| 2 | Rama `success` de `handleTicketAction` | [`useTicketActions.js:289-301`](apps/pos/hooks/useTicketActions.js:289) | 10 cosas |
| 3 | `doTerminalExit` | [`RetailVisionPOS.jsx:344`](apps/pos/RetailVisionPOS.jsx:344) | 5 cosas (solo con carrito vacío) |
| 4 | `handleForceLogout` | [`RetailVisionPOS.jsx:423`](apps/pos/RetailVisionPOS.jsx:423) | 0 (delega) |
| 5 | **`window.requestPOSExit`** | [`RetailVisionPOS.jsx:302`](apps/pos/RetailVisionPOS.jsx:302) | Intercepta y delega al modal |

**La ruta 5 es nueva** — la v16 no la mencionó. Es un hook global que `ExperimentCenterUI` usa para interceptar la salida.

### 1.4 ¿Existe el "bug fantasma"? (respuesta honesta)

**NO se pudo reproducir por la ruta que la v16 denunciaba.** Verificado:

- `doTerminalExit` **solo se alcanza con carrito vacío** ([`handleTerminalSwitch:335`](apps/pos/RetailVisionPOS.jsx:335): si hay items, va por el modal).
- Termina con `setSelectedTerminal(null)` → **desmonta la sesión** → el estado se re-inicializa.

**PERO sí existe una asimetría real y verificada:**

- La rama `success` de `handleTicketAction` ([líneas 289-301](apps/pos/hooks/useTicketActions.js:289)) limpia 10 cosas pero **NO** limpia `savedTicketRef.current`, `showExitModal` ni `pendingExitAction`.
- `handleExitWithoutSaving` **sí** limpia `savedTicketRef.current` ([línea 406](apps/pos/RetailVisionPOS.jsx:406)).

**Conclusión honesta:** hay una **inconsistencia menor** (no un bug catastrófico). El plan se reclasifica como **preventivo**, no correctivo. Esto **baja la urgencia** y permite hacerlo con calma.

---

## 2. ALCANCE REDEFINIDO (más pequeño, más seguro)

### 2.1 Dentro del alcance

- **A.** Extraer la limpieza de sesión a **una función pura** `buildResetPatch()` — **sin** reducer, **sin** cambiar firmas.
- **B.** Usar esa función en las rutas 1, 2 y 3 (las que limpian estado de captura).
- **C.** Añadir **tests de equivalencia** que prueben que la limpieza nueva == la limpieza vieja.
- **D.** Tests de arquitectura **best-effort** (anclados, con contexto).

### 2.2 Fuera del alcance (explícito y justificado)

- ❌ **NO** migrar a `useReducer` en la primera iteración (D2: riesgo alto, 30 props).
- ❌ **NO** tocar [`useCart.js`](apps/pos/hooks/useCart.js:25) (tiene su propia máquina Anti-Wipe).
- ❌ **NO** tocar [`usePOSSession.js`](apps/pos/hooks/usePOSSession.js:35) (es catálogo).
- ❌ **NO** tocar el contrato `{ outcome, reason }`.
- ❌ **NO** tocar la persistencia atómica.
- ❌ **NO** tocar el backend.
- ❌ **NO** feature flag de línea (D3).

---

## 3. DISEÑO DE LA SOLUCIÓN

### 3.1 La función pura `buildResetPatch()` (en vez de un reducer)

En lugar de un reducer que reescribe todo, una **función pura** que devuelve el **conjunto exacto de valores de reset**. No cambia firmas; solo centraliza los valores.

```js
// apps/pos/state/sessionReset.js  (NUEVO — sin React)

/**
 * Devuelve el patch de reset de la sesión de captura.
 * Es la ÚNICA fuente de verdad de "cómo se limpia una sesión".
 * Las rutas de salida aplican este patch en vez de limpiar a mano.
 *
 * NO incluye: cartState (useCart), catálogo (usePOSSession), printTicketData.
 * Esos tienen su propio ciclo de vida.
 */
export function buildResetPatch() {
    return {
        currentAccountNum: '',
        originalCapturer: null,
        ticketVersion: null,
        orderType: 'VENTA_DIRECTA',
        orderData: null,
        paymentsHistory: [],
        lastSaveStatus: 'idle',
        lastSaveTime: null,
        showCheckout: false,
        savedTicket: null,        // ← corrige la asimetría verificada en §1.4
        showExitModal: false,     // ← corrige la asimetría verificada en §1.4
        pendingExitAction: null,  // ← corrige la asimetría verificada en §1.4
    };
}
```

**Por qué esto y no un reducer:**
- **Cero cambios de firma.** `useTicketActions` sigue recibiendo sus 30 props.
- **Cero riesgo de romper la persistencia atómica.**
- **Elimina la asimetría real** (§1.4) sin reescribir nada.
- **Testeable como función pura** (patrón ya usado en el repo).

### 3.2 Límite explícito de la máquina (corrige D6)

| Estado | ¿En `buildResetPatch`? | Razón |
|--------|------------------------|-------|
| `currentAccountNum`, `originalCapturer`, `ticketVersion`, `orderType`, `orderData`, `paymentsHistory`, `lastSaveStatus`, `lastSaveTime`, `showCheckout`, `savedTicket`, `showExitModal`, `pendingExitAction` | ✅ SÍ | Es estado de **sesión de captura** |
| `cart` / `cartState` | ❌ NO | Vive en `useCart` con su candado Anti-Wipe |
| `categories`, `initialProducts`, `activeCategory` | ❌ NO | Es **catálogo**, no sesión |
| `printTicketData` | ❌ NO | Es de **impresión** |
| `toastMessage` | ❌ NO | Es **efímero** (se auto-limpia con `setTimeout`) |
| `viewMode`, `currentPage`, `showCorkboard`, `allOpenAccounts`, `isCashEnabled`, `showGestorCaja`, `cashSessionId`, `showProgramacion` | ❌ NO | Es **UI/contexto**, no sesión de captura |

**Justificación del límite:** solo se resetea lo que, si sobrevive, **contamina la siguiente cuenta**. La UI (viewMode, página) puede sobrevivir sin daño. El catálogo debe sobrevivir (recargarlo sería un bug de rendimiento).

### 3.3 Cómo se aplica el patch (sin cambiar firmas)

En cada ruta de salida, en vez de limpiar a mano:

```js
// ANTES (handleExitWithoutSaving, 13 líneas a mano)
clearCart();
cartRef.current = [];
setOriginalCapturer(null);
originalCapturerRef.current = null;
setCurrentAccountNum('');
accountNumRef.current = '';
setTicketVersion(null);
ticketVersionRef.current = null;
setOrderData(null);
setOrderType('VENTA_DIRECTA');
setLastSaveStatus('idle');
setLastSaveTime(null);
setShowCheckout(false);
setPaymentsHistory([]);
savedTicketRef.current = null;
// ... localStorage

// DESPUÉS (aplica el patch + sincroniza refs)
const patch = buildResetPatch();
clearCart();
cartRef.current = [];
accountNumRef.current = '';
originalCapturerRef.current = null;
ticketVersionRef.current = null;
savedTicketRef.current = null;
setOriginalCapturer(patch.originalCapturer);
setCurrentAccountNum(patch.currentAccountNum);
setTicketVersion(patch.ticketVersion);
setOrderData(patch.orderData);
setOrderType(patch.orderType);
setLastSaveStatus(patch.lastSaveStatus);
setLastSaveTime(patch.lastSaveTime);
setShowCheckout(patch.showCheckout);
setPaymentsHistory(patch.paymentsHistory);
setShowExitModal(patch.showExitModal);
setPendingExitAction(patch.pendingExitAction);
// ... localStorage
```

**Nota crítica:** las **refs** (`cartRef`, `accountNumRef`, etc.) se siguen sincronizando a mano porque `buildResetPatch` es puro y no puede tocar refs. Esto es **intencional y visible**: la función pura define los **valores**, el llamador los **aplica**. La duplicación de "aplicar" es mínima y testeable.

---

## 4. FASES DE EJECUCIÓN

### FASE 0 — Reproducir y medir (SIN cambios de código) — BLOQUEANTE

- [ ] Confirmar baseline: `npm test` (503) y `npm run build` (~9.34s).
- [ ] **Escribir un test que intente reproducir la asimetría** de §1.4: verificar que tras la rama `success` de `handleTicketAction`, `savedTicketRef.current` **no** se limpia.
- [ ] Documentar el resultado: ¿se reproduce? ¿es observable por el usuario?

**Criterio de salida:** baseline registrado + veredicto sobre la reproducibilidad.
**Si NO se reproduce como bug observable:** el plan se marca como **PREVENTIVO** y puede ejecutarse sin urgencia.

---

### FASE 1 — Crear `buildResetPatch()` + tests (código muerto, riesgo CERO)

- [ ] Crear [`apps/pos/state/sessionReset.js`](apps/pos/state/sessionReset.js) con `buildResetPatch()`.
- [ ] Crear [`apps/pos/state/sessionReset.test.js`](apps/pos/state/sessionReset.test.js):
  - [ ] Devuelve exactamente las 12 claves esperadas.
  - [ ] Cada valor es el "vacío" correcto (`''`, `null`, `[]`, `'idle'`, `'VENTA_DIRECTA'`).
  - [ ] **NO** incluye `cart`, `categories`, `printTicketData`, `toastMessage` (test de límite).
  - [ ] Es puro: dos llamadas devuelven objetos iguales pero **no la misma referencia**.

**Criterio de salida:** `npm test` verde. **Nadie importa el archivo todavía.** Cero cambios en el POS.

---

### FASE 2 — Aplicar el patch en las 3 rutas (una por una, con test de equivalencia)

**Regla:** una ruta por commit. Si una rompe, se revierte sola.

- [ ] **2a — `handleExitWithoutSaving`** ([`RetailVisionPOS.jsx:385`](apps/pos/RetailVisionPOS.jsx:385)):
  - [ ] Reemplazar la limpieza a mano por `buildResetPatch()`.
  - [ ] Test de equivalencia: el estado resultante es **idéntico** al anterior.
- [ ] **2b — Rama `success` de `handleTicketAction`** ([`useTicketActions.js:289`](apps/pos/hooks/useTicketActions.js:289)):
  - [ ] Aplicar el patch. **Añade** la limpieza de `savedTicketRef`, `showExitModal`, `pendingExitAction` (corrige §1.4).
  - [ ] Test de equivalencia + test del nuevo comportamiento.
- [ ] **2c — `doTerminalExit`** ([`RetailVisionPOS.jsx:344`](apps/pos/RetailVisionPOS.jsx:344)):
  - [ ] Aplicar el patch (aunque hoy solo se llame con carrito vacío, unifica el contrato).

**Criterio de salida por sub-fase:** `npm test` verde + `npm run build` verde + revisión manual del diff.

---

### FASE 3 — Tests de arquitectura (best-effort, corregido D5)

- [ ] Crear [`apps/pos/state/architecture.test.js`](apps/pos/state/architecture.test.js) con regex **ancladas y con contexto**:
  - [ ] `datetime.now()` en `apps/api/modules/pos/` → **anclado** a `\bdatetime\.now\(\)` y excluyendo comentarios.
  - [ ] `terminal_id` en payload de emergencia → verificar que está **dentro** del `JSON.stringify`, no en un comentario.
- [ ] **Documentar en el propio test** que es "best-effort" (no cubre alias ni AST).

**Criterio de salida:** los tests pasan en el código actual. Si alguno falla → hallazgo nuevo → documentar.

---

### FASE 4 — Validación manual de los 5 flujos

- [ ] Enviar y salir (ruta 2).
- [ ] Salir sin guardar (ruta 1).
- [ ] Cambiar de terminal (ruta 3).
- [ ] Force logout (ruta 4).
- [ ] `window.requestPOSExit` desde ExperimentCenterUI (ruta 5).
- [ ] **Verificar cero residuos** entre sesiones.

**Criterio de salida:** los 5 flujos idénticos al comportamiento actual + cero residuos.

---

### FASE 5 — Documentación y respaldo

- [ ] Incidente v17 en [`DOCUMENTACION_MODULO_POS.md`](ESPECIFICACIONES%20DEL%20PROYECTO/DOCUMENTACION_MODULO_POS.md) (Sección 3).
- [ ] Regla "limpieza única vía `buildResetPatch`" en Sección 4.
- [ ] Ítems al checklist.
- [ ] `REPORTE_EJECUCION_ESTADO_POS_V17.md`.
- [ ] Respaldo en GitHub.

---

## 5. RIESGOS Y MITIGACIONES

| Riesgo | Prob. | Impacto | Mitigación |
|--------|-------|---------|------------|
| El patch omite un valor que la limpieza vieja sí ponía | Media | Alto | Test de equivalencia por ruta (Fase 2) |
| El patch incluye un valor que NO debía (rompe catálogo/UI) | Baja | Alto | Test de límite (Fase 1) + §3.2 |
| Las refs quedan desincronizadas | Media | Alto | Sincronización de refs **explícita** en cada ruta (§3.3) |
| `handleTicketAction` cambia de comportamiento | Media | Alto | Test de equivalencia + revisión manual del diff |
| Los tests de arquitectura dan falsos positivos | Media | Bajo | Regex ancladas + marcados como best-effort |

---

## 6. CRITERIOS DE ACEPTACIÓN GLOBALES

1. ✅ `npm test` verde, con **más** tests que el baseline (503+).
2. ✅ `npm run build` verde.
3. ✅ Los **5** flujos de salida idénticos al comportamiento actual.
4. ✅ **Cero residuos** entre sesiones (verificado manualmente).
5. ✅ Test de equivalencia por cada ruta migrada.
6. ✅ `buildResetPatch()` es puro (test).
7. ✅ Documentación actualizada.

---

## 7. ROLLBACK (corrige D10)

| Fase | Rollback |
|------|----------|
| 0 | N/A (sin cambios) |
| 1 | `git revert` del commit (código muerto, nadie lo importa) |
| 2a/2b/2c | `git revert` del commit **de esa sub-fase** (una ruta por commit) |
| 3 | `git revert` (solo tests) |
| 4 | N/A (validación) |
| 5 | `git revert` (solo docs) |

**Regla:** cada sub-fase de la Fase 2 es **un commit atómico**. Revertir una no afecta a las otras.

---

## 8. ESTIMACIÓN CUANTIFICADA (corrige D7)

| Fase | Archivos | Tests nuevos | Horas est. | Riesgo |
|------|----------|--------------|------------|--------|
| 0 | 0 | 1 (repro) | 1-2 | Nulo |
| 1 | 2 (nuevos) | 4 | 2-3 | Nulo |
| 2a | 1 | 1 | 1-2 | Bajo |
| 2b | 1 | 2 | 2-3 | **Medio** |
| 2c | 1 | 1 | 1 | Bajo |
| 3 | 1 (nuevo) | 2 | 2-3 | Bajo |
| 4 | 0 | 0 | 2-3 | Medio |
| 5 | 3 (docs) | 0 | 1-2 | Nulo |
| **Total** | **~9** | **~11** | **12-19 h** | — |

**La sub-fase 2b es la crítica** (toca `handleTicketAction`). Por eso va sola en su commit.

---

## 9. PROHIBICIONES (violarlas invalida el plan)

- ⛔ **PROHIBIDO** ejecutar la Fase 2 sin el test de equivalencia de la Fase 0/1.
- ⛔ **PROHIBIDO** migrar a `useReducer` en esta iteración (D2).
- ⛔ **PROHIBIDO** tocar `useCart`, `usePOSSession`, la persistencia atómica o el backend.
- ⛔ **PROHIBIDO** cambiar el contrato `{ outcome, reason }`.
- ⛔ **PROHIBIDO** un feature flag de línea (D3).
- ⛔ **PROHIBIDO** agrupar 2a/2b/2c en un solo commit.
- ⛔ **PROHIBIDO** ejecutar una fase sin que la anterior tenga su criterio de salida cumplido.

---

## 10. POR QUÉ ESTE PLAN NO ROMPE NADA

1. **No cambia firmas** → `useTicketActions` sigue con sus 30 props.
2. **No toca la persistencia atómica** → el corazón del POS queda intacto.
3. **No toca `useCart`** → el candado Anti-Wipe queda intacto.
4. **Cada ruta es un commit atómico** → rollback granular.
5. **Test de equivalencia por ruta** → garantiza comportamiento idéntico.
6. **La Fase 1 es código muerto** → riesgo cero.
7. **El alcance se redujo** respecto a la v16 → menos superficie de error.

**La diferencia clave con la v16:** la v16 intentaba reescribir el estado (alto riesgo). La v17 **centraliza los valores de limpieza** (bajo riesgo) y deja la arquitectura intacta. Es el 80% del beneficio con el 20% del riesgo.

---

## 11. NOTA FINAL

Este plan es **honesto sobre lo que NO sabe** (§1.4: el bug fantasma no se reprodujo). No vende urgencia falsa. Ataca una **asimetría real y verificada** (la rama `success` no limpia 3 cosas que sí limpia `handleExitWithoutSaving`) con el **mínimo cambio posible** en un módulo crítico.

Si en el futuro se quiere la máquina de estados completa (v16), este plan es el **prerrequisito seguro**: primero centraliza los valores, luego —con tests de equivalencia ya en su lugar— se puede migrar a `useReducer` con red de seguridad.
