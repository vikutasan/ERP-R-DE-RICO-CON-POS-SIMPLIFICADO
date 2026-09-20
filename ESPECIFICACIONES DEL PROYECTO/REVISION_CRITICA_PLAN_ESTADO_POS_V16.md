# REVISIÓN CRÍTICA DEL PLAN DE CORRECCIÓN — ESTADO DEL POS (v16)

> **Autor:** Roo (auto-crítica)
> **Objeto revisado:** [`PLAN_CORRECCION_ESTADO_POS_V16.md`](ESPECIFICACIONES%20DEL%20PROYECTO/PLAN_CORRECCION_ESTADO_POS_V16.md)
> **Método:** Verificación línea-por-línea contra el código real. Cada afirmación del plan fue contrastada con el archivo fuente.
> **Veredicto global:** **EL PLAN NO ESTÁ LISTO PARA EJECUTAR.** Tiene 3 defectos graves, 4 medios y 3 menores. Requiere una v17 antes de tocar código.

---

## RESUMEN EJECUTIVO

El plan v16 tiene una **dirección correcta** (máquina de estados + tests de arquitectura) pero **subestima gravemente la complejidad de la migración** y contiene **afirmaciones no verificadas** que, si se ejecutan tal cual, romperían el POS.

Los 3 defectos graves:

- **D1 — El plan afirma un "bug fantasma" en `doTerminalExit` que NO es un bug.** Verificado: es un comportamiento intencional. El plan vende como "corrección" algo que no está roto.
- **D2 — El plan NO reconoce que `handleTicketAction` vive en un hook separado y recibe 15+ props.** El reducer propuesto no puede "limpiar" ese estado sin una refactorización masiva que el plan no menciona.
- **D3 — El plan propone un feature flag que NO es viable** con la arquitectura actual: el estado está partido entre 3 hooks y el componente padre, y no se puede "encender/apagar" la limpieza sin duplicar toda la lógica.

---

## 1. DEFECTOS GRAVES

### D1 — El "síntoma" del plan es FALSO (o al menos no verificado)

**Lo que afirma el plan** (§1.2, línea 33):

> "`doTerminalExit` limpia `clearCart()`, `setCurrentAccountNum('')`, `setOriginalCapturer(null)` — pero **NO** limpia `ticketVersion`, `orderData`, `orderType`, `lastSaveStatus`, `paymentsHistory`, `savedTicketRef`. Es decir, **cambiar de terminal deja residuos** que `handleExitWithoutSaving` sí limpia."

**Lo que dice el código real** ([`RetailVisionPOS.jsx:344-357`](apps/pos/RetailVisionPOS.jsx:344)):

```js
const doTerminalExit = async () => {
    setShowExitModal(false);
    try {
        await posService.unlockTerminal(selectedTerminal, currentUser?.id);
    } catch(e) { console.error("Could not unlock terminal", e); }
    try {
        localStorage.removeItem(`pos_session_${selectedTerminal}`);
        localStorage.removeItem(`pos_cart_${selectedTerminal}`);
        clearCart();
        setCurrentAccountNum('');
        setOriginalCapturer(null);
    } catch(e) {}
    setSelectedTerminal(null);
};
```

**El análisis correcto:** `doTerminalExit` **NO necesita** limpiar `ticketVersion`, `orderData`, etc., porque **`setSelectedTerminal(null)` desmonta toda la sesión de captura**. Al volver a `IDLE`, el componente re-inicializa su estado. Además, `doTerminalExit` **solo se llama cuando el carrito está vacío** (ver [`handleTerminalSwitch:335`](apps/pos/RetailVisionPOS.jsx:335): si hay items, muestra el modal y va por `handleSendThenExit`/`handleExitWithoutSaving`). Es decir, **el caso "residuo" que el plan denuncia no puede ocurrir** por esa ruta.

**Consecuencia:** El plan construye todo su argumento de urgencia sobre un bug que **no existe**. Esto es exactamente el error que cometí en la v13 (afirmar un bug sin verificar). **Lo estoy repitiendo.**

**Corrección necesaria:** El plan debe **probar** que el residuo existe (con un test que falle) ANTES de proponer la máquina de estados. Si no se puede reproducir, el plan pierde su justificación de "urgencia" y pasa a ser una refactorización **preventiva**, no correctiva. Eso cambia el tono y la prioridad.

---

### D2 — El plan ignora que el estado está partido entre 3 hooks y el padre

**Lo que afirma el plan** (§3.1, línea 64):

> "En lugar de 15 `useState` sueltos, un **único reducer**."

**Lo que dice el código real:**

El estado **NO** está solo en `RetailVisionPOS.jsx`. Está repartido:

1. **`RetailVisionPOS.jsx`** — 22 `useState` + 10 `useRef` (verificado).
2. **[`useCart.js`](apps/pos/hooks/useCart.js:25)** — tiene su **propia máquina de estados interna** (`cartState` con `key` + `items`, v4.6 Anti-Wipe). **No se puede meter en el reducer del padre** sin romper el candado `cartState.key === storageKey`.
3. **[`usePOSSession.js`](apps/pos/hooks/usePOSSession.js:35)** — tiene `categories`, `initialProducts`, `activeCategory` (estado de catálogo, no de sesión).
4. **[`useTicketActions.js`](apps/pos/hooks/useTicketActions.js:118)** — recibe **15+ props** del padre y **escribe directamente** en los setters del padre (`setCurrentAccountNum`, `setTicketVersion`, `setOrderData`, `setOrderType`, `setLastSaveStatus`, `setLastSaveTime`, `setShowCheckout`, `setPaymentsHistory`, `setToastMessage`, `setIsSendingToPizarron`).

**El problema:** El reducer propuesto en §3.3 asume que **todo** el estado vive en un solo lugar. Pero `handleTicketAction` (que es quien hace la limpieza de la rama `success`, líneas 289-301) **no tiene acceso al `dispatch`** — recibe setters individuales. Para migrar a un reducer habría que:

- Cambiar la firma de `useTicketActions` para recibir `dispatch` en vez de 10 setters.
- Cambiar `usePOSSession` para recibir `dispatch`.
- Reescribir `useCart` para exponer su estado al reducer (o dejarlo aparte, contradiciendo "único reducer").

**El plan NO menciona nada de esto.** Dice "un reducer único" como si fuera trivial, cuando en realidad es una refactorización de **3 hooks + el componente padre**, con riesgo alto de romper la persistencia atómica (que el plan dice NO tocar, pero que inevitablemente se toca al cambiar las firmas).

**Corrección necesaria:** El plan debe:
1. Reconocer explícitamente que `useCart` mantiene su máquina interna (no se toca).
2. Definir el **contrato exacto** de cómo `useTicketActions` y `usePOSSession` reciben el `dispatch`.
3. Estimar el riesgo real de cambiar esas firmas (alto).

---

### D3 — El feature flag propuesto NO es viable como está descrito

**Lo que afirma el plan** (§3.4, línea 3.4):

> "Fase B: se conecta **solo** `RESET_SESSION` a las 4 rutas de limpieza, con el flag apagado por defecto."

**El problema:** Un feature flag funciona cuando puedes tener **dos implementaciones en paralelo** y elegir una. Pero aquí la limpieza **no es una función aislada** — está **incrustada** dentro de `handleTicketAction` (líneas 289-301), mezclada con la lógica de negocio (verificación post-envío, toasts, `return { outcome }`).

Para tener el flag habría que escribir:

```js
if (USE_POS_MACHINE) {
    dispatch({ type: 'RESET_SESSION' });
} else {
    clearCart();
    setOriginalCapturer(null);
    setCurrentAccountNum('');
    // ... 10 líneas más
}
```

Eso **duplica** la lógica de limpieza, que es **exactamente el problema que el plan quiere resolver** (los espejos). El flag **crea un quinto espejo**. Es contraproducente.

**Corrección necesaria:** El flag debe aplicarse a **nivel de componente** (montar `RetailVisionPOS` o `RetailVisionPOSV2`), no a nivel de línea. O bien, abandonar el flag y hacer la migración con **tests de regresión exhaustivos** que garanticen equivalencia. El plan debe elegir una y justificarla.

---

## 2. DEFECTOS MEDIOS

### D4 — El plan dice "NO tocar el contrato `{ outcome, reason }`" pero lo toca indirectamente

El plan (§2.2) prohíbe tocar el contrato. Pero la Fase 2 (§4) propone reemplazar la limpieza de la rama `success` de `handleTicketAction` por `dispatch`. Esa rama **retorna** `{ outcome: 'success', ... }` (línea 310). Cambiar la limpieza **altera el orden** de las operaciones (¿se limpia antes o después del `return`?) y puede cambiar el comportamiento observable. El plan no analiza esto.

### D5 — Los "tests de arquitectura" con regex son frágiles

El plan (§4, Fase 3) propone tests que leen archivos fuente y aplican regex. Problemas:

- `expect(src).not.toMatch(/datetime\.now\(\)/)` — falla si alguien escribe `datetime . now()` o usa un alias `from datetime import datetime as dt`. **Falsos negativos.**
- `expect(src).toMatch(/terminal_id/)` — pasa si `terminal_id` aparece en un **comentario**, no en el payload. **Falsos positivos.**
- Leer archivos con `readFileSync` en tests acopla los tests a la **estructura de carpetas**. Si se mueve un archivo, el test falla por la razón equivocada.

**Corrección necesaria:** Los tests de arquitectura deben ser más robustos (AST en vez de regex, o al menos regex ancladas y con verificación de contexto). O reconocer que son "guardas best-effort" y no venderlos como garantía.

### D6 — El plan no define qué pasa con `toastMessage` y `showExitModal`

El reducer propuesto (§3.3) **no incluye** `toastMessage`, `showExitModal`, `showCorkboard`, `viewMode`, `currentPage`, `allOpenAccounts`, `isCashEnabled`, `showGestorCaja`, `cashSessionId`, `showProgramacion`. Son 10 `useState` que el plan deja fuera sin explicar por qué. ¿Se quedan como `useState` sueltos? Entonces **no hay "reducer único"** — hay un reducer parcial + 10 estados sueltos. El plan debe justificar el límite.

### D7 — La estimación de esfuerzo es optimista y no cuantifica

El plan (§9) dice "Fase 2: Alto". Pero no dice **cuántas horas**, **cuántos archivos**, ni **cuántos tests** hay que reescribir. Sin números, "Alto" es una opinión. Dado D2 (3 hooks + padre), la Fase 2 es probablemente **la más grande del proyecto**, no "Alta" en una tabla de 6 filas.

---

## 3. DEFECTOS MENORES

### D8 — Inconsistencia de conteo

El plan dice "15+ `useState` y 8 `useRef`" (§1.1) pero luego lista **22 `useState` y 10 `useRef`** (§1.2). El "15+" es impreciso y contradice su propia tabla. Debe decir 22 y 10.

### D9 — El plan cita una línea de documentación que puede haber cambiado

El plan (§1.3) cita `DOCUMENTACION_MODULO_POS.md:339`. Esa línea **se movió** cuando agregué el incidente v15 (el documento creció). La cita puede estar desactualizada. Debe verificarse.

### D10 — No hay plan de rollback más allá del flag

El plan dice "reversible apagando el flag". Pero si el flag no es viable (D3), no hay rollback. El plan debe definir: ¿cómo se revierte un commit que rompió el POS en producción? ¿`git revert`? ¿Restaurar backup de BD? No se menciona.

---

## 4. LO QUE EL PLAN HACE BIEN (para no ser injusto)

- ✅ **La dirección es correcta:** una máquina de estados es la solución adecuada a la clase de problema.
- ✅ **Separar el reducer puro del hook** es una buena decisión de testabilidad.
- ✅ **La migración incremental** es la filosofía correcta (aunque la implementación del flag esté mal, D3).
- ✅ **Los criterios de aceptación** (§6) son concretos y verificables.
- ✅ **Las prohibiciones** (§7) son claras.
- ✅ **La Fase 1 como "código muerto"** es de riesgo cero y bien pensada.

---

## 5. VEREDICTO Y ACCIONES REQUERIDAS

### Veredicto

**El plan v16 NO debe ejecutarse.** Su diagnóstico contiene una afirmación no verificada (D1) que invalida su justificación de urgencia, y su diseño subestima la complejidad real (D2, D3). Ejecutarlo tal cual rompería el POS o, en el mejor caso, crearía un quinto espejo (el flag) que agrava el problema.

### Acciones requeridas antes de una v17

1. **[BLOQUEANTE] Reproducir el bug fantasma (D1).** Escribir un test que demuestre que `doTerminalExit` deja residuos. Si no se reproduce, **cambiar el plan de "corrección" a "refactorización preventiva"** y bajar la prioridad.
2. **[BLOQUEANTE] Mapear el contrato de `dispatch` (D2).** Definir exactamente cómo `useTicketActions` y `usePOSSession` reciben el `dispatch`, y confirmar que `useCart` mantiene su máquina interna.
3. **[BLOQUEANTE] Rediseñar el flag (D3).** A nivel de componente, no de línea. O abandonarlo y usar tests de regresión.
4. **[ALTO] Robustecer los tests de arquitectura (D5).** AST o regex ancladas.
5. **[MEDIO] Definir el límite del reducer (D6).** Qué entra y qué se queda como `useState`.
6. **[MEDIO] Cuantificar el esfuerzo (D7).** Horas, archivos, tests.
7. **[BAJO] Corregir conteos y citas (D8, D9).**
8. **[BAJO] Definir rollback real (D10).**

### Recomendación final

**No ejecutar la v16.** Redactar una **v17** que:
- Empiece por **reproducir** el problema (o admitir que es preventivo).
- Reconozca la complejidad real (3 hooks + padre).
- Proponga un flag viable o lo descarte.
- Sea honesta sobre el riesgo.

**La lección más importante de esta auto-crítica:** cometí el mismo error que critiqué en la v13 — **afirmar un bug sin verificarlo**. La disciplina de "verificar antes de afirmar" debe aplicarse también a mis propios planes, no solo al código ajeno.
