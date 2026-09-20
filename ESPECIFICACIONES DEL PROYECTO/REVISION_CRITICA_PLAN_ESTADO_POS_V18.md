# REVISIÓN CRÍTICA DEL PLAN v18

**Plan revisado:** [`PLAN_CORRECCION_ESTADO_POS_V18.md`](ESPECIFICACIONES DEL PROYECTO/PLAN_CORRECCION_ESTADO_POS_V18.md)
**Fecha:** 20/Septiembre/2026
**Revisor:** Auto-revisión crítica (modo escéptico, módulo crítico)
**Veredicto:** ⚠️ **APROBADO CON CORRECCIONES OBLIGATORIAS** — el plan tiene 3 defectos que, sin corregir, podrían introducir un bug en producción.

---

## Resumen ejecutivo

El plan v18 identifica correctamente el hueco (A6: `handleForceLogout` no migrada) y la dirección es correcta. Sin embargo, la revisión encontró **3 defectos críticos** y **4 observaciones** que el plan original no contempla. El más grave: **el plan propone un orden de operaciones que puede enviar el beacon de emergencia con datos incorrectos o vacíos**, y **duplica una limpieza de `localStorage` que ya hace `clearCart()`**.

**No ejecutar el plan tal como está.** Aplicar las correcciones D1-D3 antes de proceder.

---

## Defectos críticos (BLOQUEANTES)

### D1 — El orden "beacon → limpieza" es correcto, pero el plan NO protege contra el `clearCart()` que borra el carrito del beacon

**Severidad: ALTA**

El plan (§3.2) dice: "El beacon debe leer `cartRef.current` **antes** de limpiarlo". Correcto. Pero hay un problema más sutil que el plan no aborda:

[`clearCart()`](apps/pos/hooks/useCart.js:139) hace **dos** cosas:
```js
const clearCart = () => {
    setCartState(prev => ({ ...prev, items: [] }));
    localStorage.removeItem(storageKey);   // storageKey = pos_cart_${terminalId}
};
```

Y en [`RetailVisionPOS.jsx:95`](apps/pos/RetailVisionPOS.jsx:95):
```js
React.useEffect(() => { cartRef.current = cart; }, [cart]);
```

**El problema:** `clearCart()` dispara un `setCartState`, que cambia `cart`, que dispara el `useEffect` de la línea 95, que pone `cartRef.current = []`. Esto es **asíncrono** (React batchea). En el plan, el orden es:

1. Leer `cartRef.current` (beacon) ✅
2. `clearCart()` → programa `setCartState`
3. `cartRef.current = []` (manual)
4. `onForceLogout()`

**El riesgo real:** entre el paso 1 y el paso 3, si React re-renderiza (por el `setCartState` del paso 2), el `useEffect` de la línea 95 podría ejecutarse y poner `cartRef.current = []` **antes** de que el beacon lo lea... pero no, el beacon ya se leyó en el paso 1. **El beacon está a salvo.**

**PERO:** el plan **no verifica** que el beacon se construya con el carrito vivo. Si alguien reordena el código en el futuro (limpieza antes del beacon), el beacon iría vacío y **se perdería la venta en curso** — exactamente el escenario que el force logout debe proteger. El plan debe incluir un **test de arquitectura que verifique el ORDEN** (beacon antes de `buildResetPatch()`), no solo la presencia.

**Corrección obligatoria:** añadir a §3.3 un test que afirme que el índice de `JSON.stringify` (beacon) es **menor** que el índice de `const patch = buildResetPatch()` en el cuerpo de `handleForceLogout`.

---

### D2 — El plan duplica `localStorage.removeItem('pos_cart_...')` que `clearCart()` ya hace

**Severidad: MEDIA (deuda, no bug)**

El plan (§3.1) propone:
```js
clearCart();
...
try {
    if (selectedTerminal) localStorage.removeItem(`pos_session_${selectedTerminal}`);
} catch (e) { ... }
```

`clearCart()` ya borra `pos_cart_${terminalId}`. El plan solo añade `pos_session_${terminalId}` (correcto, no duplicado). **Pero** el plan no lo dice explícitamente, y un lector podría añadir también `pos_cart_` "por simetría con `doTerminalExit`".

**Verificación:** [`doTerminalExit`](apps/pos/RetailVisionPOS.jsx:359) hace:
```js
localStorage.removeItem(`pos_session_${selectedTerminal}`);
localStorage.removeItem(`pos_cart_${selectedTerminal}`);  // ← redundante con clearCart()
clearCart();
```

Es decir, **`doTerminalExit` ya tiene una redundancia** (borra `pos_cart_` a mano Y vía `clearCart()`). El plan v18 NO debe replicar esa redundancia.

**Corrección obligatoria:** en §3.1, dejar SOLO `localStorage.removeItem('pos_session_...')` y añadir un comentario: "`pos_cart_` lo borra `clearCart()`; NO duplicar (a diferencia de `doTerminalExit`, que tiene una redundancia histórica)".

---

### D3 — El plan NO resetea `isGeneratingFolioRef` ni `isRecoveringRef` — ¿es correcto?

**Severidad: MEDIA (requiere justificación explícita)**

[`RetailVisionPOS.jsx:53-54`](apps/pos/RetailVisionPOS.jsx:53) declara:
```js
const isGeneratingFolioRef = React.useRef(false);
const isRecoveringRef = React.useRef(false);
```

Estos refs **NO** están en `buildResetPatch()` (que es puro y solo maneja valores serializables) ni en la sincronización manual del plan. ¿Es un problema?

**Análisis:**
- `isGeneratingFolioRef`: se pone `true` al inicio de `generateNewAccountNum` y `false` en el `finally` ([`usePOSSession.js:118,160`](apps/pos/hooks/usePOSSession.js:118)). Es un candado de corta duración. Si el force logout ocurre **durante** una generación de folio, el ref quedaría `true`... pero el componente se desmonta (o el estado se limpia), y la próxima sesión crea un ref nuevo (`useRef(false)`). **No es un problema real.**
- `isRecoveringRef`: similar, candado de recuperación de cuenta.

**PERO:** el plan no menciona estos refs. Un revisor futuro podría preguntar "¿por qué no se resetean?". El plan debe **documentar explícitamente** por qué se excluyen (son candados efímeros de operación, no estado de sesión; mueren con el componente o se auto-liberan en su `finally`).

**Corrección obligatoria:** añadir a §3.2 una nota: "`isGeneratingFolioRef` e `isRecoveringRef` NO se resetean: son candados de operación de corta duración que se auto-liberan en su `finally`; resetearlos a mitad de una operación sería un bug. Además, `buildResetPatch()` es puro y no puede tocarlos."

---

## Observaciones (no bloqueantes, pero deben abordarse)

### O1 — El plan afirma que `handleForceLogout` "no limpia", pero SÍ limpia por desmontaje

El plan dice: "`handleForceLogout` es la única ruta que no aplica `buildResetPatch()`". Correcto. Pero en §1.2 también dice que "limpia por accidente". La palabra "accidente" es imprecisa: el desmontaje es un **mecanismo real y determinista** de React, no un accidente. El plan debería decir "limpia **implícitamente** vía desmontaje" en vez de "por accidente". Es un matiz de precisión, pero en un módulo crítico la precisión importa.

### O2 — El plan no cuantifica el riesgo de que `onForceLogout` NO desmonte HOY

El plan asume que hoy `onForceLogout` → `setIsAuthenticated(false)` → desmonta. **Verificado** ([`ExperimentCenterUI.jsx:509`](apps/ExperimentCenterUI.jsx:509)). Pero el plan no dice qué pasa si el usuario **cancela** el modal de force logout. Revisando [`ForceLogoutModal`](apps/pos/components/POSOverlays.jsx:15): el modal solo tiene un botón "onForceLogout" (no hay "cancelar"). Es decir, **el force logout es inevitable una vez mostrado**. Esto refuerza que el desmontaje ocurre siempre hoy → el hueco es **latente, no activo**. El plan debería declarar esto explícitamente para calibrar la urgencia (no es un bug en producción hoy; es deuda preventiva).

### O3 — El plan no considera el caso de `selectedTerminal === null`

En `handleForceLogout`, `selectedTerminal` podría ser `null` (aunque el modal de force logout solo aparece con terminal seleccionada). El plan usa `if (selectedTerminal) localStorage.removeItem(...)` — correcto. Pero `clearCart()` usa `storageKey = pos_cart_${terminalId}` con `terminalId = 'DEFAULT'` si es null. Es un caso borde que el plan no menciona. **No es un bug** (el force logout no ocurre sin terminal), pero conviene una nota.

### O4 — El plan no actualiza el test de asimetría existente

[`sessionReset.asymmetry.test.js:53`](apps/pos/state/sessionReset.asymmetry.test.js:53) usa `const end = source.indexOf('const handleForceLogout', start);` como **delimitador** para extraer `handleExitWithoutSaving`. Si el plan modifica `handleForceLogout`, el delimitador sigue funcionando (el nombre no cambia). **Pero** el plan debería verificar que ese test sigue verde tras el cambio. El plan no lo menciona en los criterios de aceptación. **Añadir:** "El test `sessionReset.asymmetry.test.js` sigue verde (el delimitador `const handleForceLogout` no cambia)."

---

## Verificación de las afirmaciones del plan

| Afirmación del plan | Verificación | Resultado |
|---------------------|--------------|-----------|
| `handleForceLogout` no aplica `buildResetPatch()` | Leído [`RetailVisionPOS.jsx:450-477`](apps/pos/RetailVisionPOS.jsx:450) | ✅ CIERTO |
| `onForceLogout` → `setIsAuthenticated(false)` | Leído [`ExperimentCenterUI.jsx:509`](apps/ExperimentCenterUI.jsx:509) | ✅ CIERTO |
| El beacon incluye `terminal_id` | Leído [`RetailVisionPOS.jsx:457`](apps/pos/RetailVisionPOS.jsx:457) | ✅ CIERTO |
| `extractForceLogoutBlock` ya existe | Leído [`architecture.test.js:179`](apps/pos/state/architecture.test.js:179) | ✅ CIERTO |
| `clearCart()` borra `pos_cart_` | Leído [`useCart.js:141`](apps/pos/hooks/useCart.js:141) | ✅ CIERTO |
| Las 3 rutas de v17 no se tocan | El plan lo declara en §2.2 | ✅ CIERTO |
| `handleForceLogout` es la única ruta sin patch | Revisadas las 5 rutas | ✅ CIERTO |

**Todas las afirmaciones fácticas del plan son correctas.** Los defectos son de **diseño** (orden, duplicación, omisiones), no de hechos.

---

## Riesgos que el plan SUBESTIMA

| Riesgo | Plan dice | Realidad |
|--------|-----------|----------|
| R1 (beacon vacío) | "Baja" | **Media** — el orden es frágil ante refactors; requiere test de orden (D1) |
| R2 (`clearCart` interfiere) | "Baja" | **Baja** — confirmado, `clearCart` es idempotente |
| R3 (regresión v17) | "Muy baja" | **Muy baja** — confirmado, no se tocan |
| R4 (test best-effort) | "Media" | **Media** — correcto |
| R5 (doble limpieza) | "Baja" | **Baja** — confirmado, idempotente |

**El plan subestima R1.** Debe subirse a "Media" y añadirse el test de orden.

---

## Correcciones obligatorias (antes de ejecutar)

1. **D1:** Añadir test de arquitectura que verifique el **ORDEN** (beacon antes de `buildResetPatch()`) en `handleForceLogout`.
2. **D2:** En §3.1, dejar SOLO `localStorage.removeItem('pos_session_...')`; documentar que `pos_cart_` lo borra `clearCart()`.
3. **D3:** Documentar explícitamente por qué `isGeneratingFolioRef`/`isRecoveringRef` NO se resetean.
4. **O1:** Cambiar "por accidente" → "implícitamente vía desmontaje".
5. **O2:** Declarar que el hueco es **latente, no activo** (el force logout siempre desmonta hoy).
6. **O4:** Añadir a criterios de aceptación: el test `sessionReset.asymmetry.test.js` sigue verde.

---

## Veredicto final

**APROBADO CON CORRECCIONES OBLIGATORIAS.**

El plan es **direccionalmente correcto** y de **riesgo bajo real** (una función, sin tocar rutas validadas). Pero contiene **3 defectos de diseño** que, sin corregir, podrían:
- (D1) Permitir que un refactor futuro envíe el beacon vacío → **pérdida de venta**.
- (D2) Introducir una redundancia que confunde a futuros mantenedores.
- (D3) Dejar sin justificar la exclusión de 2 refs → deuda de documentación.

Ninguno de los 3 es un bug **hoy**, pero los 3 violan el principio de "no dejar basura" que el propio usuario ha exigido. **Aplicar D1-D3 y O1-O4, luego ejecutar.**

**Nota de calibración de urgencia:** el hueco A6 es **latente** (el desmontaje siempre ocurre hoy). No hay prisa; es mejor un plan sólido que uno rápido. La corrección es preventiva, no correctiva.
