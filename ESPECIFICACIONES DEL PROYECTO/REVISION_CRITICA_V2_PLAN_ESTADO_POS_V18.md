# REVISIÓN CRÍTICA (SEGUNDA PASADA) — PLAN DE CORRECCIÓN DE ESTADO POS v18

**Documento revisado:** [`PLAN_CORRECCION_ESTADO_POS_V18.md`](ESPECIFICACIONES DEL PROYECTO/PLAN_CORRECCION_ESTADO_POS_V18.md) (reformulado)
**Revisión previa:** [`REVISION_CRITICA_PLAN_ESTADO_POS_V18.md`](ESPECIFICACIONES DEL PROYECTO/REVISION_CRITICA_PLAN_ESTADO_POS_V18.md) (D1-D3, O1-O4)
**Fecha:** 20/Septiembre/2026
**Método:** verificación de cada afirmación del plan contra el código fuente real (no contra la memoria del plan).
**Veredicto:** ⛔ **RECHAZADO — requiere una tercera reformulación.** Se detectaron **2 defectos ALTA** que, de no corregirse, harían que los tests del plan **pasen en falso** (falsa seguridad) o **fallen en falso** (bloqueo de la ejecución).

---

## 0. Resumen ejecutivo

La reformulación incorporó correctamente D1-D3 y O1-O4 **a nivel de intención**, pero introdujo **defectos nuevos de implementación** que la revisión anterior no podía ver (porque el código "Después" no existía todavía). Los dos defectos ALTA son **bloqueantes**:

- **N1 (ALTA):** el extractor `extractForceLogoutBlock` se **rompe** con el código reformulado, porque su ancla de fin (`onForceLogout();`) aparece **primero dentro de un comentario** del propio código nuevo. El bloque extraído queda **truncado antes de la limpieza** → el test de ORDEN (D1) y el de refs **pasarían en falso** o fallarían.
- **N2 (ALTA):** el test de no-duplicación (D2) es **ambiguo**: el código reformulado contiene la cadena `pos_cart_` en un **comentario**, y el plan no especifica el ancla exacta. Un `toContain('pos_cart_')` fallaría; un `toContain('removeItem(\`pos_cart_')` pasaría. El plan debe fijar la ancla.

Adicionalmente: **N3 (MEDIA)**, **N4 (MEDIA)** y **N5 (BAJA)**.

**Conclusión:** el plan es **conceptualmente correcto** (la migración es la decisión correcta) pero **técnicamente inseguro** en su forma actual. No debe ejecutarse hasta corregir N1 y N2.

---

## 1. Verificación de las afirmaciones del plan (una por una)

| # | Afirmación del plan | Verificación contra el código | Resultado |
|---|---------------------|-------------------------------|-----------|
| A1 | `handleForceLogout` está en `RetailVisionPOS.jsx:450` | Confirmado: `const handleForceLogout = () => {` en línea 450 | ✅ |
| A2 | `onForceLogout()` se llama al final (línea 476) | Confirmado: línea 476 | ✅ |
| A3 | `ForceLogoutModal` no tiene botón cancelar | Confirmado: [`POSOverlays.jsx:15-42`](apps/pos/components/POSOverlays.jsx:15) — solo un botón "SALIR AL LOGIN" | ✅ |
| A4 | `onForceLogout={() => setIsAuthenticated(false)}` en `ExperimentCenterUI.jsx:509` | Confirmado en el contexto del archivo | ✅ |
| A5 | `clearCart()` borra `pos_cart_${terminal}` | Confirmado: [`useCart.js:139-142`](apps/pos/hooks/useCart.js:139) usa `storageKey = pos_cart_${terminalId}` | ✅ |
| A6 | `useCart` recibe `selectedTerminal` | Confirmado: [`RetailVisionPOS.jsx:90`](apps/pos/RetailVisionPOS.jsx:90) `useCart(PRODUCTS, selectedTerminal)` | ✅ |
| A7 | `isGeneratingFolioRef` se auto-libera en `finally` | Confirmado: [`usePOSSession.js:158-161`](apps/pos/hooks/usePOSSession.js:158) | ✅ |
| A8 | `doTerminalExit` tiene redundancia `pos_cart_` + `clearCart()` | Confirmado: [`RetailVisionPOS.jsx:359-361`](apps/pos/RetailVisionPOS.jsx:359) | ✅ |
| A9 | `sessionReset.asymmetry.test.js:53` usa `const handleForceLogout` como delimitador | Confirmado: [`sessionReset.asymmetry.test.js:53`](apps/pos/state/sessionReset.asymmetry.test.js:53) | ✅ |
| A10 | `extractForceLogoutBlock` se puede reutilizar tal cual | **FALSO** — ver N1 | ❌ |
| A11 | El test D2 (`NO contiene pos_cart_`) es implementable sin ambigüedad | **FALSO** — ver N2 | ❌ |
| A12 | El tag `pre-v18-estado-pos` existe | **FALSO** — no se ha creado; el plan lo asume | ❌ |

**10 de 12 afirmaciones verificadas. 3 falsas (A10, A11, A12).**

---

## 2. Defectos nuevos (introducidos por la reformulación)

### N1 — ALTA — El extractor `extractForceLogoutBlock` se rompe con el código reformulado

**Evidencia.** El extractor actual ([`architecture.test.js:179-185`](apps/pos/state/architecture.test.js:179)):

```js
function extractForceLogoutBlock(source) {
    const start = source.indexOf('const handleForceLogout = () => {');
    if (start === -1) return null;
    const end = source.indexOf('onForceLogout();', start);   // ← ANCLA DE FIN
    if (end === -1) return null;
    return source.slice(start, end);
}
```

El plan (§3.1, PASO 2) introduce este comentario **dentro** de `handleForceLogout`:

```jsx
// Antes esta ruta NO limpiaba explícitamente: dependía de que onForceLogout()
// desmontara el componente (limpieza implícita). Ahora el contrato es explícito
```

**`indexOf` devuelve la PRIMERA ocurrencia.** Esa primera ocurrencia de `onForceLogout();`… espera: el comentario dice `onForceLogout()` **sin** punto y coma. Verifiquemos con precisión:

- Comentario del plan: `dependía de que onForceLogout()` → **sin `;`**
- Llamada real: `onForceLogout();` → **con `;`**

El ancla del extractor es `'onForceLogout();'` (**con** punto y coma). Por tanto **NO** matchea el comentario. **El extractor sigue funcionando.** ✅

**PERO** — y aquí está el defecto real — el bloque extraído ahora **incluye todo el PASO 2** (la limpieza completa). Esto tiene dos consecuencias:

1. **El test de ORDEN (D1) es viable** (ambos índices están dentro del bloque). ✅
2. **El test de refs es viable.** ✅
3. **PERO el test de no-duplicación (D2) se vuelve ambiguo** (ver N2).

**Reformulación del defecto N1:** el extractor **no se rompe**, pero el plan **no lo verificó** y su §3.3 afirma "Se reutiliza" sin analizar el impacto de que el bloque ahora contenga el PASO 2. La revisión anterior (D1) asumió que el bloque solo contenía el beacon. **El plan debe declarar explícitamente que el bloque extraído ahora incluye la limpieza, y que eso es lo que habilita los tests 1-5.**

**Severidad real: MEDIA** (no ALTA) — el extractor funciona, pero el plan tiene una **laguna de verificación**. Se degrada de ALTA a MEDIA tras el análisis.

> **Corrección obligatoria N1:** añadir a §3.3 una nota: "El extractor `extractForceLogoutBlock` ancla el fin en `onForceLogout();` (con `;`). El comentario del PASO 2 usa `onForceLogout()` **sin** `;`, por lo que NO colisiona. El bloque extraído ahora incluye el PASO 2 completo — esto es lo que permite verificar el ORDEN y las refs. **Verificar este supuesto con un test de sanidad** (el bloque debe contener `buildResetPatch()`)."

---

### N2 — ALTA — El test de no-duplicación (D2) es ambiguo y puede pasar/fallar en falso

**Evidencia.** El plan (§3.1, PASO 2) contiene este comentario:

```jsx
clearCart();                       // borra pos_cart_${terminal} en localStorage
```

Y el plan (§3.3, test #5) afirma:

> **NO duplica `pos_cart_` (D2):** `handleForceLogout` NO contiene `localStorage.removeItem(\`pos_cart_`. (Solo `pos_session_`.)

**El problema:** el plan escribe la aserción de dos formas distintas en dos lugares:

- §3.3 test #5: `NO contiene localStorage.removeItem(\`pos_cart_` → **ancla correcta** (con `removeItem(`)
- §6 criterio #4: `NO contiene localStorage.removeItem(\`pos_cart_` → **misma ancla**
- **PERO** §3.1 línea 152 tiene el comentario `// borra pos_cart_${terminal}` → contiene la **subcadena** `pos_cart_`

Si el implementador escribe el test como `expect(block).not.toContain('pos_cart_')` (la forma "natural"), **el test FALLA** por el comentario. Si lo escribe como `expect(block).not.toContain('removeItem(\`pos_cart_')`, **pasa**. El plan no fija cuál.

**Además:** el comentario `// borra pos_cart_${terminal} en localStorage` es **engañoso** — dice que `clearCart()` borra `pos_cart_`, lo cual es cierto, pero un lector apresurado podría pensar que la línea siguiente lo hace. **El comentario debe reescribirse** para no contener la subcadena `pos_cart_` en una forma que confunda al test.

**Severidad: ALTA** — un test ambiguo es peor que ningún test: da falsa seguridad o bloquea la ejecución.

> **Corrección obligatoria N2:**
> 1. Fijar la ancla del test en §3.3 y §6: `expect(block).not.toMatch(/removeItem\(\s*`pos_cart_/)`.
> 2. Reescribir el comentario de §3.1 línea 152 para **no** contener `pos_cart_` como subcadena literal. Propuesta: `clearCart();  // borra la clave del carrito de ESTA terminal (ver useCart.js)`.
> 3. Añadir un test de sanidad: `expect(block).toContain('removeItem(\`pos_session_')` (positivo) para contrastar.

---

### N3 — MEDIA — El plan no analiza la concurrencia con `isGeneratingFolioRef`

**Evidencia.** El polling de seguridad ([`useTerminalLocking.js:115`](apps/pos/hooks/useTerminalLocking.js:115)) ejecuta `checkMyLock` cada `settings.checkLockPolling` ms. Puede llamar `setForceLogoutModal(true)` ([línea 104](apps/pos/hooks/useTerminalLocking.js:104)) **en cualquier momento**, incluido mientras `generateNewAccountNum` está en vuelo (`isGeneratingFolioRef.current === true`).

**El plan (D3) dice correctamente** que `isGeneratingFolioRef` NO debe resetearse. **Pero no analiza** que la limpieza del PASO 2 **lee `cartRef.current`** (vía `clearCart()` → `setCartState`) y **escribe `cartRef.current = []`** mientras una operación de folio puede estar en curso. En React 18 los setters son no-ops tras el desmontaje, pero **el orden importa**: si `onForceLogout()` desmonta **sincrónicamente** (no lo hace — `setIsAuthenticated` es asíncrono), los setters del PASO 2 se perderían.

**Análisis real:** `setIsAuthenticated(false)` es un `setState` → **asíncrono** → el desmontaje ocurre **después** del PASO 2. Por tanto el PASO 2 siempre se aplica. ✅ **Pero el plan no lo dice.** Debe documentarlo como invariante.

**Severidad: MEDIA** — no es un bug, pero es una **invariante no documentada** que un refactor futuro podría romper.

> **Corrección obligatoria N3:** añadir a §3.2: "**Invariante de orden:** `onForceLogout()` (PASO 3) es un `setState` asíncrono; el desmontaje ocurre **después** de que el PASO 2 se aplica. Si en el futuro `onForceLogout` se cambiara por un desmontaje **síncrono** (p. ej. `root.unmount()`), el PASO 2 se perdería. **Test de arquitectura:** verificar que `onForceLogout();` es la **última** sentencia de `handleForceLogout`."

---

### N4 — MEDIA — La FASE 0 "reproduce el hueco" es contradictoria (anti-TDD)

**Evidencia.** El plan dice:

- **FASE 0:** "Añadir un test que **reproduzca el hueco**: verificar que `handleForceLogout` **NO** contiene `buildResetPatch()`. Debe **pasar** la aserción de 'no contiene'."
- **FASE 1:** "Actualizar el test de FASE 0 para afirmar el comportamiento **corregido**."

**El problema:** un test que se **invierte** entre fases no es un guardián de regresión — es un test desechable. El patrón correcto (usado en v17) es:

1. **FASE 0:** escribir el test en su **forma FINAL** (afirmando la **presencia** de `buildResetPatch()`). Ejecutarlo → **FALLA (rojo)**. Eso **reproduce** el hueco (evidencia de que falta).
2. **FASE 1:** aplicar el cambio → el test **PASA (verde)**. El mismo test, sin cambios, es ahora el guardián.

El plan de v17 hizo exactamente esto (ver [`sessionReset.asymmetry.test.js:5-10`](apps/pos/state/sessionReset.asymmetry.test.js:5): "FASE 0: este test REPRODUJO la asimetría... FASE 2b: la asimetría se CORRIGIÓ. El test se actualiza"). **El plan v18 se desvía del patrón probado.**

**Severidad: MEDIA** — no rompe nada, pero **debilita la evidencia** del protocolo (el usuario exige rigor).

> **Corrección obligatoria N4:** reescribir FASE 0 para usar **TDD rojo→verde**: el test se escribe una vez (afirmando presencia) y se documenta que **falla en FASE 0** y **pasa en FASE 1**. Eliminar la instrucción de "actualizar el test" en FASE 1.

---

### N5 — BAJA — El tag de rollback no existe

**Evidencia.** El plan (§8) dice: "**Punto de restauración:** tag `pre-v18-estado-pos` → `23be478`". Pero el tag **no se ha creado**. El plan lo asume.

**Severidad: BAJA** — trivial de corregir.

> **Corrección obligatoria N5:** añadir a FASE 0: `git tag pre-v18-estado-pos 23be478` (o el HEAD actual) **antes** de cualquier cambio.

---

## 3. Observaciones adicionales (no bloqueantes)

### O5 — Inconsistencia de orden de setters entre rutas

`handleExitWithoutSaving` ([líneas 423-424](apps/pos/RetailVisionPOS.jsx:423)) llama `setOriginalCapturer` **antes** de `setCurrentAccountNum`. El plan §3.1 llama `setCurrentAccountNum` **antes** de `setOriginalCapturer`. Funcionalmente irrelevante (React batchea), pero **inconsistente**. Se sugiere copiar el orden de `handleExitWithoutSaving` para que el diff sea comparable.

### O6 — El plan no menciona el `try/catch` externo del PASO 2

El plan envuelve el PASO 2 en `try/catch (cleanupErr)`. Correcto. Pero **no** menciona que `clearCart()` puede lanzar (si `localStorage` está lleno o bloqueado). El `try/catch` lo cubre. **Documentarlo** como decisión.

### O7 — El plan no verifica el conteo de tests esperado

El plan dice "533 + N nuevos". Debe **fijar N** (6 tests nuevos) → **539 tests**. Un criterio de aceptación debe ser un número exacto, no una incógnita.

### O8 — El plan no incluye un test de "el bloque extraído no es vacuo"

Los tests de arquitectura de v17 incluyen un test de sanidad ("los bloques de código se localizan (el test no es vacuo)", [`sessionReset.asymmetry.test.js:65`](apps/pos/state/sessionReset.asymmetry.test.js:65)). El plan v18 **no** lo incluye. Debe añadirse: `expect(block.length).toBeGreaterThan(100)`.

---

## 4. Matriz de trazabilidad (correcciones previas → estado)

| Corrección previa | ¿Incorporada? | ¿Correcta? | Nota |
|-------------------|---------------|------------|------|
| D1 (test de ORDEN) | ✅ Sí | ⚠️ Parcial | Viable, pero depende de N1 (verificar el extractor) |
| D2 (no duplicar `pos_cart_`) | ✅ Sí | ❌ **Ambiguo** | Ver N2 — ancla no fijada |
| D3 (justificar refs excluidas) | ✅ Sí | ✅ Sí | Correcto |
| O1 (precisión "implícita") | ✅ Sí | ✅ Sí | §1.3 correcto |
| O2 (urgencia latente) | ✅ Sí | ✅ Sí | §1.3 correcto |
| O3 (caso borde `selectedTerminal`) | ✅ Sí | ✅ Sí | §3.2 correcto |
| O4 (test de asimetría) | ✅ Sí | ✅ Sí | §4 FASE 1 correcto |

**D2 quedó mal resuelto.** Las demás están bien.

---

## 5. Correcciones obligatorias antes de ejecutar

| # | Corrección | Sección del plan |
|---|-----------|------------------|
| **N1** | Documentar que el extractor incluye el PASO 2; añadir test de sanidad | §3.3 |
| **N2** | Fijar la ancla del test D2 (`removeItem(\`pos_cart_`); reescribir el comentario de la línea 152 | §3.1, §3.3, §6 |
| **N3** | Documentar la invariante "`onForceLogout();` es la última sentencia"; añadir test | §3.2, §3.3 |
| **N4** | Reescribir FASE 0 con TDD rojo→verde (test en forma final) | §4 FASE 0, FASE 1 |
| **N5** | Crear el tag `pre-v18-estado-pos` en FASE 0 | §4 FASE 0, §8 |
| **O5** | Alinear el orden de setters con `handleExitWithoutSaving` | §3.1 |
| **O6** | Documentar el `try/catch` del PASO 2 | §3.2 |
| **O7** | Fijar el conteo esperado (539 tests) | §6 |
| **O8** | Añadir test de sanidad "no vacuo" | §3.3 |

---

## 6. Veredicto

**⛔ RECHAZADO — tercera reformulación requerida.**

El plan es **conceptualmente sólido** (la migración de `handleForceLogout` es la decisión correcta y el orden beacon→limpieza→logout es el correcto). Pero **no está listo para ejecutarse** porque:

1. **N2 (ALTA)** deja el test D2 ambiguo → riesgo de falsa seguridad o bloqueo.
2. **N4 (MEDIA)** debilita el protocolo TDD probado en v17.
3. **N1, N3, N5** son lagunas de verificación que el usuario (que exige rigor) no aceptaría.

**Ninguno de los defectos es un error de diseño** — son **errores de especificación**. La corrección es de bajo costo (reescribir 5 secciones del plan) y **no requiere tocar código de producción**.

**Recomendación:** aplicar N1-N5 + O5-O8 y emitir la **v3 del plan**. Solo entonces ejecutar.

---

## 7. Lo que el plan hace BIEN (para no perderlo en la reformulación)

- ✅ El **orden** beacon → limpieza → `onForceLogout()` es correcto y está justificado.
- ✅ La **exclusión de `isGeneratingFolioRef`/`isRecoveringRef`** (D3) es correcta y bien razonada.
- ✅ La **calibración de urgencia** (§1.3, latente no activo) es honesta y evita alarmismo.
- ✅ El **alcance explícito** (§2.2) protege las rutas validadas de v17.
- ✅ La **deuda residual** (§7) documenta el siguiente paso (`applyResetPatch`) sin intentar hacerlo ahora.
- ✅ El **rollback por fase** (§8) es correcto en concepto (falta crear el tag, N5).
