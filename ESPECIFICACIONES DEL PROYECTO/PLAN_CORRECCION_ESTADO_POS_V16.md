# PLAN DE CORRECCIÓN — ESTADO DEL POS (v16)

> **Objetivo:** Eliminar la fragilidad por acumulación del módulo POS convirtiendo el estado disperso en una **máquina de estados explícita con un reducer único**, y convirtiendo las reglas críticas de **prosa en código** (tests de arquitectura).
>
> **Filosofía:** Este plan NO cambia el comportamiento observable del POS. Es una **refactorización de blindaje**: el usuario final no debe notar ninguna diferencia, salvo que los bugs fantasma dejen de ocurrir.
>
> **Estado:** PROPUESTA — pendiente de revisión crítica antes de ejecutar.

---

## 1. DIAGNÓSTICO (por qué este plan existe)

### 1.1 El problema en una frase

El estado del POS vive **regado en 15+ `useState` y 8 `useRef`** dentro de [`RetailVisionPOS.jsx`](apps/pos/RetailVisionPOS.jsx:29), más el estado interno de [`useCart`](apps/pos/hooks/useCart.js:18) y [`usePOSSession`](apps/pos/hooks/usePOSSession.js:17). La limpieza de ese estado se hace **a mano** en varios lugares, y cada lugar debe ser un "espejo" exacto de los demás. Cuando alguien agrega una variable nueva y olvida limpiarla en uno de los espejos, aparece un **bug fantasma**.

### 1.2 Evidencia concreta (leída del código actual)

**Superficie de estado en [`RetailVisionPOS.jsx`](apps/pos/RetailVisionPOS.jsx:29):**

| Tipo | Variables |
|------|-----------|
| `useState` | `selectedTerminal`, `showCorkboard`, `currentAccountNum`, `viewMode`, `currentPage`, `allOpenAccounts`, `showCheckout`, `paymentsHistory`, `originalCapturer`, `toastMessage`, `lastSaveStatus`, `lastSaveTime`, `isSendingToPizarron`, `ticketVersion`, `showExitModal`, `pendingExitAction`, `isCashEnabled`, `showGestorCaja`, `cashSessionId`, `orderType`, `showProgramacion`, `orderData` |
| `useRef` | `savedTicketRef`, `cartRef`, `accountNumRef`, `originalCapturerRef`, `isGeneratingFolioRef`, `isRecoveringRef`, `ticketVersionRef`, `actionMutexRef`, `reconciliationTimerRef`, `clearCartRef` |

**Los "espejos" que deben mantenerse sincronizados manualmente:**

1. [`handleExitWithoutSaving`](apps/pos/RetailVisionPOS.jsx:385) — limpia 13 cosas a mano (líneas 391-409).
2. La rama `success` de [`handleTicketAction`](apps/pos/hooks/useTicketActions.js:118) — limpia un conjunto **distinto** de cosas.
3. [`doTerminalExit`](apps/pos/RetailVisionPOS.jsx:344) — limpia **otro** subconjunto (solo 5 cosas, líneas 350-355).
4. [`handleForceLogout`](apps/pos/RetailVisionPOS.jsx:423) — **no limpia nada** (delega a `onForceLogout`).

**El síntoma:** `doTerminalExit` limpia `clearCart()`, `setCurrentAccountNum('')`, `setOriginalCapturer(null)` — pero **NO** limpia `ticketVersion`, `orderData`, `orderType`, `lastSaveStatus`, `paymentsHistory`, `savedTicketRef`. Es decir, **cambiar de terminal deja residuos** que `handleExitWithoutSaving` sí limpia. Esa asimetría es exactamente el tipo de bug que este plan elimina.

### 1.3 Por qué la documentación no basta

La regla "OBLIGATORIO que toda rama de limpieza sea un espejo completo" está escrita en [`DOCUMENTACION_MODULO_POS.md`](ESPECIFICACIONES%20DEL%20PROYECTO/DOCUMENTACION_MODULO_POS.md:339). Pero **la documentación no compila**. Depende de que un humano (o una IA) la lea y la recuerde. La única forma de garantizar el cumplimiento es **mover la regla al código**.

---

## 2. ALCANCE

### 2.1 Dentro del alcance

- **A.** Crear una **máquina de estados explícita** (`posMachine`) con un reducer único para el estado de la sesión de captura.
- **B.** Unificar las **4 rutas de limpieza** en **una sola acción** `RESET_SESSION`.
- **C.** Convertir las **reglas críticas de prosa en tests de arquitectura** (que fallen el build si se violan).
- **D.** Migración **incremental y reversible** (feature flag), sin big-bang.

### 2.2 Fuera del alcance (explícitamente)

- ❌ NO tocar la lógica de persistencia atómica (add/update/remove item) — funciona bien.
- ❌ NO tocar el contrato `{ outcome, reason }` de [`handleTicketAction`](apps/pos/hooks/useTicketActions.js:118) — es correcto.
- ❌ NO tocar los candados de terminal ni el backend de `occupancy.py`.
- ❌ NO reintroducir auto-save ni timers de guardado.
- ❌ NO cambiar el comportamiento observable del POS.

---

## 3. DISEÑO DE LA SOLUCIÓN

### 3.1 La máquina de estados (`posMachine`)

En lugar de 15 `useState` sueltos, un **único reducer** con estados y transiciones explícitas.

**Estados de la sesión de captura:**

```
IDLE          → sin terminal seleccionada
CAPTURING     → terminal seleccionada, capturando items
SENDING       → enviando al Pizarrón (mutex activo)
EXITING       → modal de salida visible, esperando decisión
ERROR         → fallo de persistencia (lastSaveStatus === 'failed')
```

**Transiciones permitidas (el resto son PROHIBIDAS por diseño):**

| Desde | Evento | Hacia |
|-------|--------|-------|
| `IDLE` | `SELECT_TERMINAL` | `CAPTURING` |
| `CAPTURING` | `SEND` | `SENDING` |
| `SENDING` | `SEND_SUCCESS` | `CAPTURING` (o `IDLE` si la acción pendiente es salir) |
| `SENDING` | `SEND_FAIL` | `ERROR` |
| `CAPTURING` | `REQUEST_EXIT` | `EXITING` |
| `EXITING` | `CONFIRM_EXIT` | `IDLE` |
| `EXITING` | `CANCEL_EXIT` | `CAPTURING` |
| `ERROR` | `RECONCILE_OK` | `CAPTURING` |
| `ERROR` | `RESET_SESSION` | `IDLE` |
| **cualquiera** | `RESET_SESSION` | `IDLE` |

**Clave:** `RESET_SESSION` es la **única** acción que limpia. No hay 4 espejos; hay **una** función pura `resetSession(state)` que devuelve el estado inicial. Imposible desincronizar.

### 3.2 Estructura de archivos propuesta

```
apps/pos/state/
├── posMachine.js          # Reducer puro + estado inicial + acciones (SIN React)
├── posMachine.test.js     # Tests de transiciones (100% cobertura de la máquina)
└── usePOSMachine.js       # Hook delgado: useReducer + sincronización de refs
```

**Por qué separar `posMachine.js` (puro) del hook:**
- El reducer es una **función pura** → testeable sin React, sin jsdom, sin mocks.
- Sigue el patrón ya usado en el repo (funciones puras extraídas para test, como `shouldExitAfterSend`).
- El hook solo conecta React con la máquina.

### 3.3 Contrato del reducer (borrador)

```js
// apps/pos/state/posMachine.js

export const POS_STATES = {
    IDLE: 'IDLE',
    CAPTURING: 'CAPTURING',
    SENDING: 'SENDING',
    EXITING: 'EXITING',
    ERROR: 'ERROR',
};

export const initialState = {
    phase: POS_STATES.IDLE,
    terminal: null,
    accountNum: '',
    ticketVersion: null,
    originalCapturer: null,
    orderType: 'VENTA_DIRECTA',
    orderData: null,
    paymentsHistory: [],
    lastSaveStatus: 'idle',
    lastSaveTime: null,
    isSendingToPizarron: false,
    pendingExitAction: null,
    savedTicket: null,
};

// ÚNICA función de limpieza. No hay espejos.
export function resetSession() {
    return { ...initialState };
}

export function posReducer(state, action) {
    switch (action.type) {
        case 'SELECT_TERMINAL':
            return { ...initialState, phase: POS_STATES.CAPTURING, terminal: action.terminal };
        case 'SEND':
            return { ...state, phase: POS_STATES.SENDING, isSendingToPizarron: true };
        case 'SEND_SUCCESS':
            return { ...state, phase: POS_STATES.CAPTURING, isSendingToPizarron: false, lastSaveStatus: 'saved' };
        case 'SEND_FAIL':
            return { ...state, phase: POS_STATES.ERROR, isSendingToPizarron: false, lastSaveStatus: 'failed' };
        case 'REQUEST_EXIT':
            return { ...state, phase: POS_STATES.EXITING, pendingExitAction: action.pendingAction };
        case 'CANCEL_EXIT':
            return { ...state, phase: POS_STATES.CAPTURING, pendingExitAction: null };
        case 'RESET_SESSION':
            return resetSession();
        default:
            return state;
    }
}
```

### 3.4 Migración incremental (feature flag)

**PROHIBIDO** un big-bang. La migración es por **fases con flag**:

```js
const USE_POS_MACHINE = import.meta.env.VITE_POS_MACHINE === 'true';
```

- Fase A: se crea la máquina y sus tests, **sin conectarla** (código muerto, cero riesgo).
- Fase B: se conecta **solo** `RESET_SESSION` a las 4 rutas de limpieza, con el flag apagado por defecto.
- Fase C: se activa el flag en desarrollo, se corre la suite completa.
- Fase D: se activa en producción tras validación.

Cada fase es **reversible** apagando el flag.

---

## 4. FASES DE EJECUCIÓN

### FASE 0 — Verificación previa (sin cambios de código)

- [ ] Confirmar que `npm test` pasa en verde (baseline: 503 tests).
- [ ] Confirmar que `npm run build` compila (baseline: ~9.34s).
- [ ] Documentar el baseline en el reporte de ejecución.

**Criterio de salida:** baseline registrado. Si el baseline ya está rojo, DETENERSE.

---

### FASE 1 — Crear la máquina de estados (código muerto, cero riesgo)

- [ ] Crear [`apps/pos/state/posMachine.js`](apps/pos/state/posMachine.js) con el reducer puro.
- [ ] Crear [`apps/pos/state/posMachine.test.js`](apps/pos/state/posMachine.test.js) con tests de **todas** las transiciones (incluidas las prohibidas).
- [ ] **NO conectar nada todavía.** El archivo existe pero nadie lo importa.

**Tests obligatorios:**
- Cada transición permitida de la tabla §3.1.
- `RESET_SESSION` desde **cada** estado → siempre `IDLE` con estado inicial.
- Acción desconocida → devuelve el mismo estado (no rompe).

**Criterio de salida:** `npm test` pasa con los nuevos tests. Cero cambios en el POS.

---

### FASE 2 — Conectar `RESET_SESSION` a las 4 rutas de limpieza (tras flag)

- [ ] Crear [`apps/pos/state/usePOSMachine.js`](apps/pos/state/usePOSMachine.js) (hook delgado).
- [ ] Reemplazar el cuerpo de [`handleExitWithoutSaving`](apps/pos/RetailVisionPOS.jsx:385) por `dispatch({ type: 'RESET_SESSION' })` **bajo el flag**.
- [ ] Reemplazar la limpieza de [`doTerminalExit`](apps/pos/RetailVisionPOS.jsx:344) por `dispatch({ type: 'RESET_SESSION' })` **bajo el flag**.
- [ ] Reemplazar la limpieza de la rama `success` de [`handleTicketAction`](apps/pos/hooks/useTicketActions.js:118) **bajo el flag**.
- [ ] `handleForceLogout` → `dispatch({ type: 'RESET_SESSION' })` **bajo el flag**.

**Regla de oro de esta fase:** el flag **apagado** debe producir **exactamente** el comportamiento actual. Se verifica con la suite existente.

**Criterio de salida:** con el flag apagado, `npm test` → 503+ passed (idéntico). Con el flag encendido, `npm test` → verde.

---

### FASE 3 — Tests de arquitectura (convertir prosa en código)

- [ ] Crear [`apps/pos/state/architecture.test.js`](apps/pos/state/architecture.test.js) que **lea los archivos fuente** y falle si:
  - [ ] Alguien usa `datetime.now()` en `apps/api/modules/pos/` (regla H2).
  - [ ] Alguien construye un payload de `beforeunload`/`sendBeacon` sin `terminal_id` (regla H3).
  - [ ] Alguien agrega un `useState` de sesión en [`RetailVisionPOS.jsx`](apps/pos/RetailVisionPOS.jsx:29) fuera de la máquina (regla de estado único).
  - [ ] Alguien usa el objeto `currentUser` (en vez de `currentUserId`) en deps de efectos con `setInterval` (regla H1).

**Ejemplo de test de arquitectura:**

```js
import { readFileSync } from 'fs';
import { describe, it, expect } from 'vitest';

describe('Reglas de arquitectura POS (prosa → código)', () => {
    it('PROHIBIDO datetime.now() en modules/pos (regla H2)', () => {
        const src = readFileSync('apps/api/modules/pos/occupancy.py', 'utf-8');
        expect(src).not.toMatch(/datetime\.now\(\)/);
    });

    it('OBLIGATORIO terminal_id en payload de emergencia (regla H3)', () => {
        const src = readFileSync('apps/pos/hooks/useBeforeUnload.js', 'utf-8');
        expect(src).toMatch(/terminal_id/);
    });
});
```

**Criterio de salida:** los tests de arquitectura pasan en el código actual (si alguno falla, es un hallazgo nuevo → documentar).

---

### FASE 4 — Activación y validación

- [ ] Activar `VITE_POS_MACHINE=true` en `.env` de desarrollo.
- [ ] Correr la suite completa: `npm test`.
- [ ] Correr el build: `npm run build`.
- [ ] Prueba manual de los 4 flujos: enviar y salir, salir sin guardar, cambiar de terminal, force logout.
- [ ] Verificar que **no hay residuos** entre sesiones (el bug fantasma).

**Criterio de salida:** todos los flujos funcionan idénticos al comportamiento actual, sin residuos.

---

### FASE 5 — Documentación y cierre

- [ ] Añadir incidente v16 a la Sección 3 de [`DOCUMENTACION_MODULO_POS.md`](ESPECIFICACIONES%20DEL%20PROYECTO/DOCUMENTACION_MODULO_POS.md).
- [ ] Añadir la regla "estado único vía `posMachine`" a la Sección 4 (Reglas de Oro).
- [ ] Añadir ítems al checklist de revisión.
- [ ] Crear `REPORTE_EJECUCION_ESTADO_POS_V16.md`.
- [ ] Respaldo en GitHub.

---

## 5. RIESGOS Y MITIGACIONES

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|--------------|---------|------------|
| La migración rompe un flujo de salida | Media | Alto | Feature flag + suite completa + prueba manual de los 4 flujos |
| El reducer no cubre un caso de estado | Media | Medio | Tests de transiciones exhaustivos + `default: return state` |
| Los tests de arquitectura dan falsos positivos | Baja | Bajo | Regex ancladas + revisión manual de cada regla |
| Se introduce un bug fantasma nuevo | Baja | Alto | Migración incremental + flag reversible |
| El equipo no adopta la máquina | Media | Medio | Documentación + tests de arquitectura que fuerzan el uso |

---

## 6. CRITERIOS DE ACEPTACIÓN GLOBALES

1. ✅ `npm test` → verde, con **más** tests que el baseline (503+).
2. ✅ `npm run build` → compila sin errores.
3. ✅ Los 4 flujos de salida funcionan idénticos al comportamiento actual.
4. ✅ **Cero residuos** entre sesiones (verificado manualmente).
5. ✅ Los tests de arquitectura pasan y **fallan** si se viola una regla (verificado con un cambio temporal).
6. ✅ El flag `VITE_POS_MACHINE` permite revertir sin tocar código.
7. ✅ Documentación actualizada (incidente + reglas + checklist).

---

## 7. PROHIBICIONES (violarlas invalida el plan)

- ⛔ **PROHIBIDO** un big-bang. La migración es por fases con flag.
- ⛔ **PROHIBIDO** tocar la persistencia atómica o el contrato `{ outcome, reason }`.
- ⛔ **PROHIBIDO** reintroducir auto-save o timers de guardado.
- ⛔ **PROHIBIDO** cambiar el comportamiento observable del POS.
- ⛔ **PROHIBIDO** ejecutar una fase sin que la anterior tenga su criterio de salida cumplido.
- ⛔ **PROHIBIDO** dejar el flag encendido en producción sin la validación de la Fase 4.

---

## 8. ORDEN DE EJECUCIÓN RECOMENDADO

```
Fase 0 (baseline)
   ↓
Fase 1 (máquina, código muerto)  ← cero riesgo
   ↓
Fase 2 (conectar RESET_SESSION tras flag)
   ↓
Fase 3 (tests de arquitectura)
   ↓
Fase 4 (activar + validar)
   ↓
Fase 5 (documentar + respaldar)
```

**Regla:** cada fase termina con `npm test` + `npm run build` en verde. Si una fase rompe el baseline, se revierte antes de continuar.

---

## 9. ESTIMACIÓN DE ESFUERZO

| Fase | Esfuerzo | Riesgo |
|------|----------|--------|
| Fase 0 | Bajo | Nulo |
| Fase 1 | Medio | Nulo (código muerto) |
| Fase 2 | Alto | Medio (toca 4 rutas) |
| Fase 3 | Medio | Bajo |
| Fase 4 | Medio | Medio (validación) |
| Fase 5 | Bajo | Nulo |

**La fase crítica es la 2.** Es donde se toca el código vivo. Por eso el flag es obligatorio.

---

## 10. NOTA FINAL

Este plan ataca la **causa raíz** de la fragilidad (estado disperso + limpieza manual), no los síntomas. No arregla un bug específico porque **no hay un bug reproducible** — arregla la **clase entera de bugs** que pueden aparecer cuando alguien agregue la variable número 16 y olvide limpiarla en uno de los 4 espejos.

Es el paso de "frágil por acumulación" a "robusto por diseño".
