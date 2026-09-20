# PLAN DE CORRECCIÓN DE ESTADO POS — v18 (v4 — REFORMULADO TRAS 3ª REVISIÓN)

**Cierre del contrato de limpieza de sesión: migrar `handleForceLogout` a `buildResetPatch()`**

- **Fecha:** 20/Septiembre/2026
- **Módulo:** POS (`apps/pos/`)
- **Predecesor:** v17 (commit `a073caa`) — centralizó la limpieza en `buildResetPatch()` en 3 de 5 rutas
- **Tipo:** Corrección de deuda técnica (cierre de contrato), riesgo BAJO
- **Estado:** **v4** — reformulado tras la 3ª revisión crítica
- **Revisiones aplicadas:**
  - 1ª revisión: [`REVISION_CRITICA_PLAN_ESTADO_POS_V18.md`](ESPECIFICACIONES DEL PROYECTO/REVISION_CRITICA_PLAN_ESTADO_POS_V18.md) → D1-D3, O1-O4
  - 2ª revisión: [`REVISION_CRITICA_V2_PLAN_ESTADO_POS_V18.md`](ESPECIFICACIONES DEL PROYECTO/REVISION_CRITICA_V2_PLAN_ESTADO_POS_V18.md) → N1-N5, O5-O8
  - 3ª revisión: [`REVISION_CRITICA_V3_PLAN_ESTADO_POS_V18.md`](ESPECIFICACIONES DEL PROYECTO/REVISION_CRITICA_V3_PLAN_ESTADO_POS_V18.md) → P1-P7
- **Correcciones incorporadas en esta v4:** P1 (extractor `extractForceLogoutFull` para el test de última sentencia), P2 (test de sanidad reclasificado como permanente), P3 (test D2 por string, no regex), P4 (test de contraste lee 2 archivos), P5 (declaración exacta de rojos/verdes en FASE 0), P6 (8 tests → 541), P7 (test de ORDEN documentado como best-effort)

---

## 1. Contexto y problema

### 1.1 Lo que v17 resolvió

El v17 eliminó la **asimetría verificada (A2)**: la rama `success` de `handleTicketAction` no limpiaba `savedTicketRef` / `showExitModal` / `pendingExitAction`, mientras `handleExitWithoutSaving` sí. La solución fue una **fuente única de verdad**: la función pura [`buildResetPatch()`](apps/pos/state/sessionReset.js:59), que devuelve el conjunto exacto de 12 valores de reset.

Tras v17, **3 de las 5 rutas** de salida aplican el patch:

| # | Ruta | Estado v17 |
|---|------|-----------|
| 1 | `handleExitWithoutSaving` | ✅ Migrada |
| 2 | Rama `success` de `handleTicketAction` | ✅ Migrada (asimetría corregida) |
| 3 | `doTerminalExit` | ✅ Migrada |
| 4 | `handleForceLogout` | ❌ **NO migrada** |
| 5 | `window.requestPOSExit` | ➖ No es ruta de limpieza (es interceptor) |

### 1.2 El hueco que queda (A6 — nuevo hallazgo)

[`handleForceLogout`](apps/pos/RetailVisionPOS.jsx:450) es la **única ruta de salida que no aplica `buildResetPatch()`**. Su corrección actual depende de una **suposición implícita**: que `onForceLogout()` desmonta el componente `RetailVisionPOS`, matando el estado local por desmontaje.

**Cadena verificada del desmontaje:**

1. [`ForceLogoutModal`](apps/pos/components/POSOverlays.jsx:15) invoca `onForceLogout()` al confirmar. **El modal NO tiene botón "cancelar"** — el force logout es inevitable una vez mostrado.
2. Ese `onForceLogout` es [`handleForceLogout`](apps/pos/RetailVisionPOS.jsx:450) (línea 649: `<ForceLogoutModal visible={forceLogoutModal} onForceLogout={handleForceLogout} />`).
3. `handleForceLogout` envía el beacon de emergencia y luego llama a `onForceLogout()` (la prop del padre, línea 476).
4. La prop del padre es [`onForceLogout={() => setIsAuthenticated(false)}`](apps/ExperimentCenterUI.jsx:509).
5. `setIsAuthenticated(false)` desmonta `RetailVisionPOS` → el estado local muere con el componente.

### 1.3 Naturaleza del hueco: LATENTE, no activo (calibración de urgencia)

**Importante:** hoy el hueco **NO produce un bug en producción**. El desmontaje ocurre **siempre** (el modal no permite cancelar), así que el estado local siempre muere. El hueco es **deuda preventiva**: se materializaría solo si en el futuro:

- El componente se mantiene montado (refactor de layout, keep-alive, modal que no desmonta), o
- `onForceLogout` cambia de implementación (p. ej. a un `navigate()` que no desmonta), o
- Se reutiliza `handleForceLogout` en otro contexto.

**Conclusión:** no hay prisa. Es mejor un plan sólido que uno rápido. La corrección es **preventiva, no correctiva**.

### 1.4 Por qué esto es "frágil por acumulación"

Es exactamente el patrón que el encabezado de [`sessionReset.js`](apps/pos/state/sessionReset.js:5) advierte: **una ruta que limpia implícitamente (vía desmontaje) en vez de por contrato explícito**. El desmontaje es un mecanismo real y determinista de React, pero **no es un contrato**: no está documentado, no está testeado, y depende de una cadena de 5 eslabones que nadie garantiza.

### 1.5 Objetivo

Cerrar el contrato de las 5 rutas: que **toda** ruta de salida limpie el estado de sesión **explícitamente** vía `buildResetPatch()`, sin depender del desmontaje del componente.

---

## 2. Alcance

### 2.1 Dentro del alcance

- Migrar [`handleForceLogout`](apps/pos/RetailVisionPOS.jsx:450) para que aplique `buildResetPatch()` + sincronice las refs **antes** de delegar a `onForceLogout()`.
- Añadir tests de arquitectura que verifiquen: (a) presencia del patch, (b) **ORDEN** beacon→limpieza, (c) sincronización de refs, (d) **última sentencia** `onForceLogout();`, (e) no-duplicación de `pos_cart_`, (f) contraste entre las 4 rutas, (g) **sanidad "no vacuo"**.
- Actualizar el encabezado de [`sessionReset.js`](apps/pos/state/sessionReset.js:5) para reflejar que las 5 rutas ya están cerradas.
- Documentar el cierre en [`DOCUMENTACION_MODULO_POS.md`](ESPECIFICACIONES DEL PROYECTO/DOCUMENTACION_MODULO_POS.md).

### 2.2 FUERA del alcance (explícito)

- **NO** tocar las 3 rutas ya migradas y validadas en v17 (`handleExitWithoutSaving`, rama `success`, `doTerminalExit`). Cualquier refactor de esas rutas es un plan aparte (ver §7, deuda residual).
- **NO** extraer un `applyResetPatch(patch, refs)` compartido (opción 3 del análisis). Es la deuda de fondo, pero toca rutas validadas → riesgo mayor → plan propio.
- **NO** modificar `window.requestPOSExit` (es un interceptor, no una ruta de limpieza).
- **NO** modificar el backend ni el contrato del beacon de emergencia (`terminal_id` dentro del `JSON.stringify`).
- **NO** cambiar el comportamiento observable del force logout (sigue siendo fire-and-forget del beacon).
- **NO** corregir la redundancia histórica de `doTerminalExit` (borra `pos_cart_` a mano Y vía `clearCart()`). Es deuda separada; tocarla violaría §2.2.

---

## 3. Diseño de la solución

### 3.1 Cambio en `handleForceLogout`

**Antes** (estado actual, líneas 450-477):

```jsx
const handleForceLogout = () => {
    try {
        const liveCart = cartRef.current;
        const liveAccountNum = accountNumRef.current;
        if (liveCart && liveCart.length > 0 && liveAccountNum) {
            const payload = JSON.stringify({
                account_num: liveAccountNum,
                terminal_id: selectedTerminal || null,
                items: liveCart.map(i => ({ product_id: i.id, quantity: i.quantity || 1 })),
            });
            const url = `${CONFIG.API_BASE_URL}/pos/tickets/emergency-save`;
            if (navigator.sendBeacon) {
                navigator.sendBeacon(url, new Blob([payload], { type: 'application/json' }));
            } else {
                fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload, keepalive: true }).catch(() => {});
            }
        }
    } catch (e) {
        console.warn('Force logout: no se pudo enviar beacon de emergencia:', e);
    }
    // Delegar el logout real (no se espera el beacon — fire-and-forget)
    onForceLogout();
};
```

**Después** (v3 — con N1-N5, O5-O6 aplicadas):

```jsx
const handleForceLogout = () => {
    // PASO 1 — Beacon de emergencia (fire-and-forget). DEBE ir PRIMERO:
    // lee cartRef.current VIVO. Si se limpiara antes, el beacon iría vacío
    // y se perdería la venta en curso. El test de arquitectura verifica este ORDEN.
    try {
        const liveCart = cartRef.current;
        const liveAccountNum = accountNumRef.current;
        if (liveCart && liveCart.length > 0 && liveAccountNum) {
            const payload = JSON.stringify({
                account_num: liveAccountNum,
                terminal_id: selectedTerminal || null,
                items: liveCart.map(i => ({ product_id: i.id, quantity: i.quantity || 1 })),
            });
            const url = `${CONFIG.API_BASE_URL}/pos/tickets/emergency-save`;
            if (navigator.sendBeacon) {
                navigator.sendBeacon(url, new Blob([payload], { type: 'application/json' }));
            } else {
                fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: payload,
                    keepalive: true,
                }).catch(() => {});
            }
        }
    } catch (e) {
        console.warn('Force logout: no se pudo enviar beacon de emergencia:', e);
    }

    // PASO 2 — v18: limpieza EXPLÍCITA de la sesión vía buildResetPatch() (fuente única).
    // Antes esta ruta NO limpiaba explícitamente: dependía de que el logout del padre
    // desmontara el componente (limpieza implícita). Ahora el contrato es explícito
    // y no depende del desmontaje. Las REFS se sincronizan a mano (el patch es puro).
    //
    // NOTA (D3): isGeneratingFolioRef e isRecoveringRef NO se resetean aquí.
    // Son candados de operación de corta duración que se auto-liberan en su `finally`
    // (usePOSSession.js:160). Resetearlos a mitad de una operación sería un bug.
    // Además, buildResetPatch() es puro y no puede tocarlos.
    //
    // NOTA (O6): el try/catch cubre también clearCart(), que puede lanzar si
    // localStorage está lleno o bloqueado. Un fallo de limpieza NO debe impedir
    // el logout (PASO 3): por eso el catch NO re-lanza.
    try {
        const patch = buildResetPatch();
        clearCart();                       // borra la clave del carrito de ESTA terminal (ver useCart.js)
        cartRef.current = [];
        accountNumRef.current = '';
        originalCapturerRef.current = null;
        ticketVersionRef.current = null;
        savedTicketRef.current = null;
        // O5: mismo orden que handleExitWithoutSaving (setOriginalCapturer antes de
        // setCurrentAccountNum) para que el diff sea comparable entre rutas.
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
        // NOTA (D2): SOLO se borra la clave de sesión. La clave del carrito ya la
        // borra clearCart(). NO duplicar (a diferencia de doTerminalExit, que tiene
        // una redundancia histórica). El test D2 verifica que NO hay removeItem de carrito.
        try {
            if (selectedTerminal) localStorage.removeItem(`pos_session_${selectedTerminal}`);
        } catch (e) { console.warn('Force logout: error al limpiar persistencia:', e); }
    } catch (cleanupErr) {
        console.error('Force logout: error limpiando estado de sesión:', cleanupErr);
    }

    // PASO 3 — Delegar el logout real (no se espera el beacon — fire-and-forget).
    // INVARIANTE (N3): esta DEBE ser la ÚLTIMA sentencia de la función. El logout
    // del padre es un setState ASÍNCRONO → el desmontaje ocurre DESPUÉS de que el
    // PASO 2 se aplica. Si en el futuro se cambiara por un desmontaje SÍNCRONO,
    // el PASO 2 se perdería. El test de arquitectura verifica que es la última.
    onForceLogout();
};
```

### 3.2 Decisiones de diseño

- **Orden estricto (D1):** **beacon → limpieza → `onForceLogout()`**. El beacon debe leer `cartRef.current` **antes** de limpiarlo. Este orden se **verifica con un test** (no solo se documenta).
- **`clearCart()`:** se incluye para consistencia con las otras 3 rutas. Borra la clave del carrito de la terminal activa. **Verificado:** [`useCart`](apps/pos/RetailVisionPOS.jsx:90) recibe `selectedTerminal`, por lo que `clearCart()` opera sobre `pos_cart_${selectedTerminal}` — la misma clave que el resto de rutas.
- **`localStorage.removeItem` (D2):** SOLO la clave de sesión. La clave del carrito la borra `clearCart()`. NO duplicar. **El comentario del código NO contiene la subcadena `pos_cart_`** (N2) para que el test de no-duplicación sea inequívoco.
- **Refs excluidas (D3):** `isGeneratingFolioRef` e `isRecoveringRef` NO se resetean (candados efímeros con `finally`; resetearlos sería un bug).
- **Invariante de orden (N3):** `onForceLogout()` (PASO 3) es un `setState` **asíncrono**; el desmontaje ocurre **después** de que el PASO 2 se aplica. Si en el futuro `onForceLogout` se cambiara por un desmontaje **síncrono** (p. ej. `root.unmount()`), el PASO 2 se perdería. **Test:** verificar que `onForceLogout();` es la **última** sentencia de `handleForceLogout`.
- **Idempotencia:** si el componente se desmonta después (como hoy), la limpieza ya se hizo; el desmontaje no causa daño (los setters sobre un componente desmontado son no-ops en React 18).
- **Sin cambios de comportamiento observable:** el beacon sigue siendo fire-and-forget; el logout sigue delegándose a `onForceLogout()`.
- **Caso borde (O3):** si `selectedTerminal` fuera `null`, `clearCart()` usaría la clave por defecto de `useCart`. No ocurre en la práctica (el force logout requiere terminal seleccionada), pero el `if (selectedTerminal)` protege el borrado de la clave de sesión.
- **`try/catch` del PASO 2 (O6):** cubre `clearCart()` (puede lanzar si `localStorage` está lleno/bloqueado). El `catch` **NO re-lanza**: un fallo de limpieza no debe impedir el logout.

### 3.3 Tests de arquitectura (v4 — con P1-P7 aplicadas)

Añadir a [`architecture.test.js`](apps/pos/state/architecture.test.js) un nuevo `describe` con **8 tests** (P6):

**Extractores necesarios (P1):**

- **`extractForceLogoutBlock`** (ya existe, [`architecture.test.js:179`](apps/pos/state/architecture.test.js:179)): ancla inicio `const handleForceLogout = () => {`, ancla fin `onForceLogout();`. **El bloque EXCLUYE `onForceLogout();`** (porque `slice(start, end)` es exclusivo en `end`). Se usa para los tests 1-6.
- **`extractForceLogoutFull`** (NUEVO, requerido por P1): ancla inicio `const handleForceLogout = () => {`, ancla fin `\n    };` (el cierre de la arrow function a 4 espacios). **Incluye `onForceLogout();`**. Se usa SOLO para el test 7.

```js
// NUEVO extractor (P1) — incluye el cierre de la función, por lo que SÍ contiene onForceLogout();
function extractForceLogoutFull(source) {
    const start = source.indexOf('const handleForceLogout = () => {');
    if (start === -1) return null;
    const end = source.indexOf('\n    };', start);   // cierre de la arrow function
    if (end === -1) return null;
    return source.slice(start, end + '\n    };'.length);
}
```

**Los 8 tests:**

1. **Sanidad "no vacuo" (O8, P2 — PERMANENTE, no parte del rojo→verde):** el bloque extraído existe y `block.length > 100`. **Este test PASA en FASE 0 y en FASE 1** (el bloque actual ya tiene ~900 chars). Su misión es evitar que los demás tests pasen sobre un bloque vacío, NO detectar la migración.
2. **Presencia:** `handleForceLogout` contiene `const patch = buildResetPatch();`.
3. **ORDEN (D1 — crítico, P7 — best-effort documentado):** el índice de `JSON.stringify({` (beacon) es **menor** que el índice de `const patch = buildResetPatch()` dentro del bloque. Garantiza que el beacon se construye ANTES de limpiar. **Best-effort:** ancla en la construcción del payload; no cubre alias ni un `JSON.stringify` movido a un comentario.
4. **Refs:** `handleForceLogout` sincroniza las 5 refs (`cartRef`, `accountNumRef`, `originalCapturerRef`, `ticketVersionRef`, `savedTicketRef`).
5. **Claves de la asimetría:** contiene `setShowExitModal(patch.showExitModal)`, `setPendingExitAction(patch.pendingExitAction)` y `savedTicketRef.current = null`.
6. **NO duplica la clave del carrito (D2, P3 — por STRING, no regex):**
   ```js
   expect(block).not.toContain('removeItem(`pos_cart_');   // negativo
   expect(block).toContain('removeItem(`pos_session_');    // positivo (contraste)
   ```
   Se usa `toContain` (string) en vez de regex para evitar la ambigüedad del backtick.
7. **Última sentencia (N3, P1 — usa `extractForceLogoutFull`):**
   ```js
   const full = extractForceLogoutFull(posSource);
   expect(full).not.toBeNull();
   expect(full.trimEnd().endsWith('onForceLogout();\n    };')).toBe(true);
   ```
   **NO se puede usar `extractForceLogoutBlock`** (excluye `onForceLogout();`). Requiere el extractor nuevo.
8. **Contraste (P4 — lee DOS archivos):** las 4 rutas de limpieza contienen `buildResetPatch()`. El test lee:
   - `posSource` = [`RetailVisionPOS.jsx`](apps/pos/RetailVisionPOS.jsx) → verifica `handleExitWithoutSaving`, `doTerminalExit`, `handleForceLogout`.
   - `ticketActionsSource` = [`useTicketActions.js`](apps/pos/hooks/useTicketActions.js) → verifica la rama `success` de `handleTicketAction`.
   ```js
   const ticketActionsSource = readSource(resolve(POS_ROOT, 'hooks/useTicketActions.js'));
   expect(posSource).toContain('const patch = buildResetPatch();');
   expect(ticketActionsSource).toContain('const patch = buildResetPatch();');
   ```

> **Nota sobre el extractor (N1, corregida por P1):** el extractor `extractForceLogoutBlock` ancla el fin en `'onForceLogout();'` (**con** punto y coma). El comentario del PASO 2 usa "el logout del padre" (sin la cadena `onForceLogout()`), por lo que **NO colisiona** con el ancla. **PERO** el bloque extraído **EXCLUYE `onForceLogout();`** (slice exclusivo) — por eso el test 7 requiere `extractForceLogoutFull`. Los tests 1-6 usan el extractor original.

---

## 4. Fases de ejecución

### FASE 0 — Baseline, tag y reproducción (TDD rojo) (BLOQUEANTE)

1. **Crear el tag de rollback (N5):** `git tag pre-v18-estado-pos` (apunta al HEAD actual `23be478`).
2. **Registrar baseline:** `npm test` (esperado: **533 tests**, 19 archivos) y `npm run build` (esperado: ~9s).
3. **Escribir los 8 tests de §3.3 en su FORMA FINAL (N4 — TDD rojo→verde).** NO se escribirán tests "invertidos" que luego se reescriban. Los tests afirman el comportamiento **corregido**.
4. **Ejecutar `npm test` y registrar el estado EXACTO de cada test (P5).** NO todos fallan.

   > **⚠️ RECONCILIACIÓN EMPÍRICA (ejecución real, 20/Sept/2026):** la tabla P5 de la v4 era **incorrecta** (3ª generación de defecto auto-infligido: se predijo por intención, no por ejecución). El estado **realmente observado** fue:

   | Test | Estado REAL en FASE 0 | Razón verificada |
   |------|----------------------|------------------|
   | 1 (sanidad `length > 100`) | ✅ **PASA** | El bloque actual ya tiene ~900 chars |
   | 2 (presencia `buildResetPatch()`) | ❌ **FALLA** | `handleForceLogout` no lo contiene aún |
   | 3 (ORDEN) | ❌ **FALLA** | No existe `const patch =` en el bloque |
   | 4 (refs) | ❌ **FALLA** | No sincroniza refs |
   | 5 (claves asimetría) | ❌ **FALLA** | No limpia `showExitModal` |
   | 6 (D2 no-duplicación) | ❌ **FALLA** | La aserción **positiva** `toContain('removeItem(\`pos_session_')` falla: el bloque actual NO tiene ningún `removeItem` |
   | 7 (última sentencia) | ✅ **PASA** | El bloque actual YA termina en `onForceLogout();\n    };` → el invariante ya se cumple |
   | 8 (contraste) | ✅ **PASA** | `RetailVisionPOS.jsx` y `useTicketActions.js` YA contienen `const patch = buildResetPatch();` (en las rutas de v17) |

   **Resultado REAL: 5 rojos (2,3,4,5,6) + 3 verdes (1,7,8).** (La v4 predijo 6 rojos + 2 verdes — incorrecto.)

   > **Hallazgo de la reconciliación (defecto de diseño de los tests 7 y 8):**
   > - **Test 7** verifica un invariante que **ya se cumple** antes de migrar → NO es un guardián de la migración; es un guardián de "no romper el orden en el futuro". Sigue siendo útil, pero **no detecta la migración**.
   > - **Test 8** verifica que la **cadena** `const patch = buildResetPatch();` existe en cada archivo, pero **no aísla `handleForceLogout`** → pasa por las rutas de v17. NO detecta la migración de `handleForceLogout`.
   > - **Test 6** es un guardián de no-duplicación (aserción negativa) + contraste de la clave de sesión (aserción positiva). La positiva falla en FASE 0 y pasa en FASE 1 → **sí** es funcional (rojo→verde).
   >
   > **Conclusión:** los tests que **realmente** detectan la migración son **2, 3, 4, 5 y 6** (5 rojos funcionales). Los tests 1, 7 y 8 son guardianes de invariantes que pasan en ambas fases. Esto **no invalida** el plan (los 5 rojos funcionales cubren la migración), pero **corrige** la clasificación. Se documenta para no repetir el error de predecir sin ejecutar.

5. Commit: `v18 Fase 0: tag pre-v18 + baseline + tests (5 rojos funcionales: 2,3,4,5,6; 3 verdes de invariante: 1,7,8)`.

> **Diferencia con la v2 (N4):** la v2 escribía un test "no contiene" que pasaba en FASE 0 y luego se invertía en FASE 1. Eso no es un guardián de regresión. La v4 usa el patrón probado en v17: el test se escribe **una vez** en forma final, **falla** en FASE 0 (rojo) y **pasa** en FASE 1 (verde), quedando como guardián permanente.

> **Aclaración P2/P5 (CORREGIDA tras la reconciliación empírica):** los tests **1, 7 y 8** son **invariantes permanentes** (pasan en FASE 0 y FASE 1):
> - **Test 1:** sanidad (el bloque no está vacío).
> - **Test 7:** el bloque termina en `onForceLogout();` (protege contra un desmontaje síncrono futuro).
> - **Test 8:** las 4 rutas contienen `buildResetPatch()` (contraste).
>
> Los tests **2, 3, 4, 5 y 6** son **funcionales (rojo→verde)** — son los que realmente detectan la migración de `handleForceLogout`. (La v4 original decía que 6 era permanente y 7/8 funcionales; la ejecución demostró lo contrario.)

### FASE 1 — Migrar `handleForceLogout` (TDD verde)

1. Aplicar el cambio de §3.1 en [`RetailVisionPOS.jsx`](apps/pos/RetailVisionPOS.jsx:450).
2. **Añadir el extractor `extractForceLogoutFull` (P1)** en [`architecture.test.js`](apps/pos/state/architecture.test.js) — requerido por el test 7.
3. **Ejecutar `npm test` → los 8 tests nuevos DEBEN PASAR (verde).** Sin modificar los tests (N4).
4. Verificar: `npm test` (esperado: **541 tests** = 533 + 8 nuevos — ver nota P6 abajo).
5. **Verificar (O4):** [`sessionReset.asymmetry.test.js`](apps/pos/state/sessionReset.asymmetry.test.js:53) sigue verde (usa `const handleForceLogout` como delimitador; el nombre no cambia).
6. Commit: `v18 Fase 1: migrar handleForceLogout a buildResetPatch (cierre del contrato)`.

> **Nota P6 (conteo exacto):** el plan define **8 tests** en §3.3. El conteo final esperado es **533 + 8 = 541 tests**. (La v3 decía "7 tests → 540" pero listaba 8 ítems; la v4 unifica en 8 → 541.) Si al ejecutar el conteo difiere, **detenerse y reconciliar** antes de continuar.

### FASE 2 — Actualizar documentación de código

- Actualizar el encabezado de [`sessionReset.js`](apps/pos/state/sessionReset.js:5) para reflejar que las 5 rutas están cerradas (quitar la implicación de que `handleForceLogout` está pendiente).
- Commit: `v18 Fase 2: actualizar encabezado de sessionReset.js (contrato cerrado)`.

### FASE 3 — Validación manual

Validar los 5 flujos de salida (los 3 de v17 + force logout + cierre de pestaña):

1. **Force logout (auto-expulsión):** con carrito con items, simular robo de terminal por admin → confirmar modal → verificar que el beacon llega (Network tab) y que **no queda residuo** (al re-loguear, cuenta limpia).
2. **Salir sin enviar:** carrito con items → modal → "Salir sin enviar" → sin residuo.
3. **Enviar y salir:** carrito con items → modal → "Enviar al Pizarrón" → sin residuo.
4. **Cambiar terminal:** carrito con items → modal → confirmar → sin residuo.
5. **Cierre de pestaña:** carrito con items → cerrar pestaña → diálogo nativo + beacon.

Criterio: **cero residuos** en los 5 flujos. **Verificación extra del flujo 1:** el payload del beacon debe contener los items (no vacío).

### FASE 4 — Documentación y respaldo

- Añadir el incidente v18 (hallazgo A6 + cierre del contrato) a [`DOCUMENTACION_MODULO_POS.md`](ESPECIFICACIONES DEL PROYECTO/DOCUMENTACION_MODULO_POS.md).
- Actualizar la REGLA 19 para reflejar que las 5 rutas están cerradas.
- Añadir 1-2 ítems al checklist de revisión.
- Commit + push a GitHub.

---

## 5. Riesgos y mitigaciones (recalibrados)

| # | Riesgo | Prob. | Impacto | Mitigación |
|---|--------|-------|---------|-----------|
| R1 | El beacon de emergencia se envía vacío (si se limpia el carrito antes) | **Media** | Alto | Orden estricto: beacon → limpieza → `onForceLogout()`. **Test de ORDEN (D1)** verifica que el índice del beacon < índice del patch. |
| R2 | `clearCart()` en force logout interfiere con el desmontaje | Baja | Bajo | `clearCart()` es idempotente; el desmontaje posterior es no-op. Validación manual del flujo 1. |
| R3 | Regresión en las 3 rutas de v17 | Muy baja | Alto | NO se tocan. El test de asimetría de v17 sigue verde como guardián (verificado en FASE 1, O4). |
| R4 | El test de arquitectura es "best-effort" (regex, no AST) | Media | Bajo | Documentado como best-effort (igual que v17). Cubre el caso real; no cubre alias/AST. |
| R5 | `onForceLogout` ya no desmonta en el futuro → doble limpieza | Baja | Bajo | La limpieza es idempotente; el patch es puro. No hay daño. |
| R6 | Duplicar la clave del carrito en localStorage (confusión con `doTerminalExit`) | Baja | Bajo | **Test D2** con ancla fijada (`removeItem(\`pos_cart_`) verifica que NO se duplica. |
| R7 | El extractor captura un bloque truncado (N1) | Baja | Medio | **Test de sanidad (O8)** verifica `block.length > 100` y que contiene `buildResetPatch()`. |
| R8 | Un refactor futuro cambia `onForceLogout()` por desmontaje síncrono (N3) | Baja | Medio | **Test "última sentencia"** verifica que `onForceLogout();` cierra la función. |
| R9 | El extractor `extractForceLogoutFull` ancla en `\n    };` y podría capturar un `};` interno (P1) | Baja | Bajo | El ancla incluye 4 espacios de indentación; el único `\n    };` es el cierre de la función. El test 7 verifica `endsWith('onForceLogout();\n    };')`. |
| R10 | El test 6 (D2) pasa en FASE 0 y podría dar falsa confianza (P5) | Baja | Bajo | Documentado: el test 6 es un **guardián de no-duplicación**, no un detector de migración. Su valor es impedir que un refactor futuro AÑADA el `removeItem` duplicado. |

---

## 6. Criterios de aceptación

1. [`handleForceLogout`](apps/pos/RetailVisionPOS.jsx:450) aplica `buildResetPatch()` + sincroniza las 5 refs.
2. El beacon de emergencia sigue enviándose **antes** de la limpieza (con `terminal_id` y con los items).
3. **Test de ORDEN (D1, best-effort — P7):** el índice del beacon < índice del patch en `handleForceLogout`. Documentado como best-effort: no detecta un reordenamiento que use alias o extraiga el beacon a un helper.
4. **Test D2 (ancla fijada, N2 + P3):** `handleForceLogout` NO contiene la subcadena ``removeItem(`pos_cart_`` — verificación **por string** (`block.includes(...)`), NO por regex (evita la ambigüedad del backtick).
5. **Test "última sentencia" (N3 + P1):** usando el extractor **`extractForceLogoutFull`** (que SÍ incluye `onForceLogout();`), el bloque termina en `onForceLogout();\n    };`.
6. **Test de sanidad (O8 + P2):** el bloque extraído no es vacuo (`length > 100`). **Permanente:** pasa en FASE 0 y FASE 1; su valor es impedir que los demás tests pasen sobre un bloque vacío.
7. `onForceLogout()` sigue llamándose al final (comportamiento observable sin cambios).
8. Las 3 rutas de v17 **no** se modifican (diff limpio).
9. **Test de asimetría (O4):** [`sessionReset.asymmetry.test.js`](apps/pos/state/sessionReset.asymmetry.test.js:53) sigue verde.
10. **Test de contraste (P4):** el test lee **2 archivos** (`RetailVisionPOS.jsx` y `sessionReset.js`) y verifica que el bloque migrado contiene `buildResetPatch()`.
11. **Declaración exacta de FASE 0 (P5):** en FASE 0 el resultado esperado es **5 rojos funcionales** (tests 2,3,4,5,8) + **1 rojo por extractor** (test 7, porque `extractForceLogoutFull` devuelve `null` al no existir aún el cierre esperado) + **2 verdes** (tests 1 y 6). Total: 6 rojos, 2 verdes.
12. `npm test` verde con **541 tests** (533 + 8 nuevos) — conteo exacto (P6).
13. `npm run build` verde.
14. Validación manual: 5/5 flujos sin residuos (con verificación del payload del beacon).
15. Documentación actualizada (incidente v18 + REGLA 19 + checklist).
16. Respaldo en GitHub.

---

## 7. Deuda residual (fuera de alcance — plan futuro)

`buildResetPatch()` centraliza los **VALORES**, pero **APLICARLOS** sigue duplicado en 4 sitios (las 3 rutas de v17 + `handleForceLogout`). Cada ruta repite ~10 líneas de `setX(patch.x)` + sincronización de refs.

**Refactor futuro (v19 candidato):** extraer un `applyResetPatch(patch, refs)` que centralice la aplicación, eliminando la duplicación. Riesgo: toca rutas validadas → requiere su propio plan + revisión crítica + validación manual completa.

**Deuda adicional detectada (D2):** [`doTerminalExit`](apps/pos/RetailVisionPOS.jsx:360) tiene una redundancia histórica (`localStorage.removeItem('pos_cart_...')` + `clearCart()`). Limpiarla es un plan aparte.

---

## 8. Rollback

- **Punto de restauración:** tag `pre-v18-estado-pos` → `23be478` (HEAD actual tras la limpieza de planes). **El tag se crea en FASE 0 (N5)** — no se asume que exista.
- **Rollback por fase:** cada fase es un commit atómico → `git revert <commit>` revierte solo esa fase.
- **Rollback total:** `git reset --hard pre-v18-estado-pos` (local) + `git push --force-with-lease` (remoto, solo si es imprescindible).

---

## 9. Archivos involucrados

| Archivo | Cambio |
|---------|--------|
| [`apps/pos/RetailVisionPOS.jsx`](apps/pos/RetailVisionPOS.jsx:450) | Migrar `handleForceLogout` a `buildResetPatch()` (orden beacon→limpieza→logout) |
| [`apps/pos/state/architecture.test.js`](apps/pos/state/architecture.test.js:172) | Añadir **8 tests** (sanidad, presencia, ORDEN, refs, claves, no-duplicación, última sentencia, contraste) + **nuevo extractor `extractForceLogoutFull`** (P1) |
| [`apps/pos/state/sessionReset.js`](apps/pos/state/sessionReset.js:5) | Actualizar encabezado (contrato cerrado) |
| [`ESPECIFICACIONES DEL PROYECTO/DOCUMENTACION_MODULO_POS.md`](ESPECIFICACIONES DEL PROYECTO/DOCUMENTACION_MODULO_POS.md) | Incidente v18 + REGLA 19 + checklist |

---

## 10. Resumen ejecutivo

El v17 cerró la asimetría A2 en 3 de 5 rutas. El v18 cierra la **última ruta pendiente** (`handleForceLogout`), que hoy limpia **implícitamente** (vía desmontaje del componente) en vez de por contrato explícito. El cambio es de **riesgo bajo** (una sola función, sin tocar las rutas validadas), **sin cambios de comportamiento observable**, y con **8 tests de arquitectura** — incluidos un **test de ORDEN** (previene que un refactor envíe el beacon vacío), un **test de última sentencia** (previene un desmontaje síncrono futuro), un **test de sanidad** (previene que los demás pasen sobre un bloque vacío) y un **test de contraste** (verifica que el bloque migrado referencia `buildResetPatch()`).

**Naturaleza del hueco:** **latente, no activo** (el force logout siempre desmonta hoy). La corrección es **preventiva**. Con esto, el contrato de las 5 rutas de salida queda **completo y explícito**.

**Correcciones incorporadas (v4):**

| Revisión | Corrección | Estado |
|----------|-----------|--------|
| 1ª | D1 (test de orden) | ✅ |
| 1ª | D2 (no duplicar carrito) | ✅ (ancla fijada en v3) |
| 1ª | D3 (justificar refs excluidas) | ✅ |
| 1ª | O1-O4 | ✅ |
| 2ª | N1 (extractor + sanidad) | ✅ |
| 2ª | N2 (ancla D2 + comentario sin `pos_cart_`) | ✅ |
| 2ª | N3 (invariante + test última sentencia) | ✅ |
| 2ª | N4 (TDD rojo→verde) | ✅ |
| 2ª | N5 (crear tag en FASE 0) | ✅ |
| 2ª | O5 (orden de setters) | ✅ |
| 2ª | O6 (try/catch documentado) | ✅ |
| 2ª | O7 (conteo exacto de tests) | ✅ (recalibrado a 541 en v4) |
| 2ª | O8 (test no vacuo) | ✅ |
| 3ª | P1 (extractor `extractForceLogoutFull` para el test de última sentencia) | ✅ |
| 3ª | P2 (test de sanidad reclasificado como permanente) | ✅ |
| 3ª | P3 (test D2 por string, no regex) | ✅ |
| 3ª | P4 (test de contraste lee 2 archivos) | ✅ |
| 3ª | P5 (declaración exacta de rojos/verdes en FASE 0) | ✅ |
| 3ª | P6 (8 tests → 541) | ✅ |
| 3ª | P7 (test de ORDEN documentado como best-effort) | ✅ |

**Lección del ciclo de revisiones:** los defectos migraron de "diseño" (v1) → "especificación" (v2) → "detalle de test" (v3). Cada corrección debe **verificarse contra el código real** antes de incorporarse; en particular, el defecto P1 (test imposible) nació de asumir el comportamiento de `slice(start, end)` sin comprobarlo.
