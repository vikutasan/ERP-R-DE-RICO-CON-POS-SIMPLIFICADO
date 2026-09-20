# 🔍 SEGUNDA REVISIÓN CRÍTICA: PLAN v2 — MODAL DE SALIDA POS

> **Revisor:** Arquitecto Full-Stack Senior (IA) — auto-revisión adversarial (ronda 2)
> **Fecha:** 2026-09-20
> **Documento revisado:** [`PLAN_CORRECCION_MODAL_SALIDA_POS.md`](ESPECIFICACIONES%20DEL%20PROYECTO/PLAN_CORRECCION_MODAL_SALIDA_POS.md:1) (v2)
> **Pregunta guía del usuario:** *"¿Rompe algo importante?"*
> **Método:** Verificación de cada fase contra el código real, con foco en **efectos secundarios** y **suposiciones no verificadas**.
> **Veredicto:** 🛑 **LA v2 TIENE 6 DEFECTOS NUEVOS, 2 DE ELLOS CAPACES DE ROMPER EL POS.** No debe ejecutarse tal cual. Requiere v3.

---

## 0. RESUMEN EJECUTIVO

La v2 corrigió los 8 hallazgos de la ronda 1, pero **introdujo 6 defectos nuevos** al proponer cambios sin verificar los efectos secundarios. Dos son **graves**:

| # | Hallazgo | Severidad | Fase | ¿Rompe algo? |
|---|----------|-----------|------|--------------|
| **N1** | `handleTicketAction` **NO está memoizado** → `handleForceLogout` con `useCallback([handleTicketAction])` se recrea en cada render y **puede causar un bucle de re-renders** | 🔴 CRÍTICO | 5b | **SÍ — puede colgar el POS** |
| **N2** | `handleForceLogout` llama a `handleTicketAction` que adquiere el **mutex**; si el usuario ya tenía una acción en vuelo, **se encola y puede tardar 3+ segundos** antes de expulsar → el admin ve la terminal "colgada" | 🔴 CRÍTICO | 5b | **SÍ — UX rota en expulsión** |
| **N3** | La Fase 1 usa `cartRef.current.length > 0` como señal de fallo, pero **`clearCart()` es asíncrono respecto a `cartRef`** → falso negativo posible | 🟠 ALTO | 1 | **SÍ — puede no salir nunca** |
| **N4** | La Fase 3 mueve la limpieza a un helper, pero `handleTicketAction` **no recibe `setOrderData`/`setOrderType`/`setLastSaveTime` como parámetros con esos nombres** (sí los recibe, pero el helper los invoca desde fuera del hook) → **riesgo de desincronización de refs** | 🟠 ALTO | 3 | **SÍ — refs quedan sucias** |
| **N5** | La Fase 6 añade `terminal_id` al beacon, pero **`TerminalSession` puede no tener ese campo** (el plan lo admite como "acción previa" pero **no lo verifica**) | 🟡 MEDIO | 6 | Puede fallar silenciosamente |
| **N6** | La Fase 4 cambia `window.requestPOSExit` de deps `[]` a `[requestExit]`; si `requestExit` cambia de identidad, **el bridge se des-registra y re-registra**, pudiendo perder una llamada en vuelo | 🟡 MEDIO | 4 | Ventana de carrera |

**Conclusión:** El **diagnóstico** sigue siendo correcto y el **fix de negocio (Fase 1)** es necesario. Pero las fases 5b, 3 y 4 introducen riesgos que **superan su beneficio**. La v3 debe **simplificar drásticamente**: menos fases, más conservadoras.

---

## 1. HALLAZGO N1 — 🔴 `handleTicketAction` NO ESTÁ MEMOIZADO (rompe Fase 5b)

### 1.1 Lo que propone la v2

> **Fase 5b:**
> ```javascript
> const handleForceLogout = useCallback(async () => {
>     if (cartRef.current.length > 0 && accountNumRef.current) {
>         try {
>             await handleTicketAction('OPEN', null, false);
>         } catch (e) { ... }
>     }
>     if (onForceLogout) onForceLogout();
> }, [handleTicketAction, onForceLogout]);
> ```

### 1.2 La realidad (evidencia)

`handleTicketAction` **NO es un `useCallback`**. Es una función plana declarada dentro del hook:

```javascript
// apps/pos/hooks/useTicketActions.js:112
const handleTicketAction = async (status, paymentData = null, finalizeUI = true) => {
```

Y se retorna sin memoizar:
```javascript
// apps/pos/hooks/useTicketActions.js:450-456
return {
    handleTicketAction,   // ← nueva identidad en CADA render
    handlePrintTicket,
    handleAddToCart,
    handleRecoverAccount,
    printTicketData,
};
```

### 1.3 Por qué rompe

1. **`handleTicketAction` cambia de identidad en cada render** de `RetailVisionPOS`.
2. Por tanto, `useCallback(..., [handleTicketAction, onForceLogout])` **también cambia de identidad en cada render**.
3. `handleForceLogout` se pasa como prop a `ForceLogoutModal` → **el modal se re-renderiza en cada render del POS**.
4. Peor: si en el futuro alguien añade `handleForceLogout` a un `useEffect` con deps, **se dispara un bucle infinito de renders**.
5. **El POS se vuelve lento o se cuelga** en el peor caso.

> **Nota:** `handlePrintTicket` **SÍ está memoizado** ([`useTicketActions.js:70`](apps/pos/hooks/useTicketActions.js:70) con `useCallback`), lo que demuestra que el autor del hook **sabe** memoizar — simplemente no lo hizo con `handleTicketAction` (probablemente porque nadie lo necesitó hasta ahora).

### 1.4 Corrección para la v3

**Opción A (recomendada): NO usar `useCallback` en `handleForceLogout`.** Una función plana es suficiente y no añade riesgo:

```javascript
// Sin useCallback — se recrea en cada render, pero eso es lo que ya hace el resto del componente
const handleForceLogout = async () => {
    if (cartRef.current.length > 0 && accountNumRef.current) {
        try {
            await handleTicketAction('OPEN', null, false);
        } catch (e) {
            console.error('No se pudo guardar antes del force logout:', e);
        }
    }
    if (onForceLogout) onForceLogout();
};
```

**Opción B:** Memoizar `handleTicketAction` en `useTicketActions.js` con `useCallback`. **Pero esto es un cambio de mayor alcance** que puede alterar el comportamiento de otros consumidores → **requiere su propia fase de validación**.

> **Recomendación:** Opción A. La memoización de `handleTicketAction` es una **optimización ortogonal** que no debe mezclarse con la corrección del modal.

---

## 2. HALLAZGO N2 — 🔴 EL MUTEX HACE QUE LA EXPULSIÓN ESPERE (rompe Fase 5b)

### 2.1 Lo que propone la v2

> **Fase 5b:** `await handleTicketAction('OPEN', null, false)` antes de `onForceLogout()`.

### 2.2 La realidad (evidencia)

`handleTicketAction` adquiere un **mutex** al inicio:

```javascript
// apps/pos/hooks/useTicketActions.js:113-118
const previousPromise = actionMutexRef.current;
let releaseMutex;
actionMutexRef.current = new Promise(resolve => releaseMutex = resolve);

await previousPromise;   // ← ESPERA a que termine la acción anterior
```

Y usa `withRetries` con **3 intentos y backoff de 1s, 2s, 3s** ([`withRetries.js:38`](apps/pos/utils/withRetries.js:38)):

```javascript
await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
```

### 2.3 Por qué rompe

**Escenario real:**
```
T=0s    Cajera tiene una cuenta capturada. El admin fuerza la liberación.
T=0s    ForceLogoutModal aparece. Cajera hace clic en "SALIR AL LOGIN".
T=0s    handleForceLogout → await handleTicketAction('OPEN', null, false)
T=0s    El mutex está libre → procede
T=0.5s  createTicket() falla (red caída)
T=1.5s  Retry 1 (esperó 1s)
T=3.5s  Retry 2 (esperó 2s)
T=6.5s  Retry 3 (esperó 3s) → falla
T=6.5s  throw → catch → onForceLogout()
T=6.5s  La cajera ve la pantalla de login 6.5 SEGUNDOS después de hacer clic.
```

**Peor aún:** si el mutex estaba ocupado (ej. un `handleAddToCart` en vuelo), la espera se **suma**. El usuario ve el botón "SALIR AL LOGIN" **sin respuesta durante 6-10 segundos**. Parecerá que el POS está **colgado**.

**Y hay un problema adicional:** el `ForceLogoutModal` **no tiene estado de loading**. El botón no se deshabilita ni muestra spinner ([`POSOverlays.jsx:29-37`](apps/pos/components/POSOverlays.jsx:29)). El usuario hará **clic repetido**, disparando múltiples `handleForceLogout` → múltiples `handleTicketAction` encolados en el mutex → **efecto cascada**.

### 2.4 Corrección para la v3

**Usar `sendBeacon` (fire-and-forget) en vez de `await handleTicketAction`.** Es el mismo mecanismo que ya usa `useBeforeUnload` y **no bloquea**:

```javascript
const handleForceLogout = () => {
    // Best-effort SIN bloquear: sendBeacon es fire-and-forget.
    // No se puede esperar (el lock ya se perdió y el usuario debe salir YA).
    if (cartRef.current.length > 0 && accountNumRef.current) {
        try {
            const payload = JSON.stringify({
                account_num: accountNumRef.current,
                items: cartRef.current.map(i => ({ product_id: i.id, quantity: i.quantity || 1 })),
                status: 'OPEN',
                emergency_save: true,
                terminal_id: selectedTerminalRef.current,
            });
            navigator.sendBeacon(
                `${CONFIG.API_BASE_URL}/pos/tickets/emergency-save`,
                new Blob([payload], { type: 'application/json' })
            );
        } catch (e) {
            console.error('Emergency save en force logout falló:', e);
        }
    }
    if (onForceLogout) onForceLogout();   // ← INMEDIATO, sin esperar
};
```

**Ventajas:**
- **Cero latencia** para el usuario.
- **Reutiliza** el endpoint `emergency-save` ya existente (DRY).
- **No toca el mutex** → no interfiere con acciones en vuelo.
- **No requiere `useCallback`** → elimina N1.

> **Nota:** Esto hace que la Fase 5b y la Fase 6 compartan el mismo mecanismo. Se pueden **unificar** en una sola fase.

---

## 3. HALLAZGO N3 — 🟠 `cartRef.current.length > 0` NO ES UNA SEÑAL FIABLE (rompe Fase 1)

### 3.1 Lo que propone la v2

> **Fase 1:**
> ```javascript
> await handleTicketAction('OPEN');
> if (cartRef.current.length > 0) {
>     // Falló → no salir
> }
> ```

### 3.2 La realidad (evidencia)

`cartRef` se sincroniza con `cart` mediante un `useEffect`:

```javascript
// apps/pos/RetailVisionPOS.jsx:94
React.useEffect(() => { cartRef.current = cart; }, [cart]);
```

Y `clearCart()` hace `setCartState` ([`useCart.js:139-142`](apps/pos/hooks/useCart.js:139)):

```javascript
const clearCart = () => {
    setCartState(prev => ({ ...prev, items: [] }));
    localStorage.removeItem(storageKey);
};
```

### 3.3 Por qué es frágil

1. **`setCartState` es asíncrono.** Tras `clearCart()`, el `cart` (state) se actualiza en el **siguiente render**, y `cartRef.current` se actualiza en el **`useEffect` posterior**.
2. `handleTicketAction` hace `clearCart()` y **retorna inmediatamente** (no espera al re-render).
3. Cuando `handleSendThenExit` lee `cartRef.current.length`, **puede que el `useEffect` aún no haya corrido** → `cartRef.current` todavía tiene los items → **falso positivo de fallo**.
4. Resultado: **el usuario NO sale aunque el envío fue exitoso.** El modal se cierra, aparece un toast de error falso, y el usuario queda confundido con un carrito que **sí se limpió visualmente** pero el código cree que no.

> **Esto es un bug de carrera clásico.** La v2 lo introduce al confiar en un ref que se sincroniza por efecto.

### 3.4 Corrección para la v3

**Usar el contrato de retorno (Fase 2) como fuente de verdad, NO el ref.** Es decir, **invertir el orden**: ejecutar la Fase 2 (contrato) **antes** que la Fase 1 (consumidor).

```javascript
// handleSendThenExit (v3) — depende del contrato de la Fase 2
const result = await handleTicketAction('OPEN');
if (result?.outcome !== 'success') {
    // Falló → no salir
    return;
}
// Éxito → salir
```

**Implicación:** La v2 reordenó las fases para "mitigar el riesgo primero", pero ese reordenamiento **introdujo N3**. La v3 debe **volver al orden de la v1** (contrato primero), aceptando que el fix crítico espera una fase.

> **Alternativa (si se quiere mitigar antes):** usar `savedTicketRef.current` como señal. `handleTicketAction` lo setea en [`useTicketActions.js:253`](apps/pos/hooks/useTicketActions.js:253) **sincrónicamente** antes de `clearCart()`. Pero esto es **más frágil** que el contrato. **Recomendación: usar el contrato.**

---

## 4. HALLAZGO N4 — 🟠 EL HELPER `resetCaptureState` DESINCRONIZA REFS (rompe Fase 3)

### 4.1 Lo que propone la v2

> **Fase 3:** extraer la limpieza a `apps/pos/utils/resetCaptureState.js` y llamarlo desde `handleTicketAction` y `handleExitWithoutSaving`.

### 4.2 La realidad (evidencia)

`handleTicketAction` **no solo limpia state** — también debe limpiar **refs**. Pero el bloque actual ([`useTicketActions.js:280-290`](apps/pos/hooks/useTicketActions.js:280)) **solo limpia state**:

```javascript
clearCart();
setOriginalCapturer(null);
setCurrentAccountNum('');
setTicketVersion(null);
setOrderData(null);
setOrderType('VENTA_DIRECTA');
setLastSaveStatus('idle');
setLastSaveTime(null);
try {
    if (selectedTerminal) localStorage.removeItem(`pos_session_${selectedTerminal}`);
} catch (e) { ... }
```

**Las refs se limpian indirectamente** por los `useEffect` de sincronización ([`RetailVisionPOS.jsx:94-97`](apps/pos/RetailVisionPOS.jsx:94)):

```javascript
React.useEffect(() => { cartRef.current = cart; }, [cart]);
React.useEffect(() => { accountNumRef.current = currentAccountNum; }, [currentAccountNum]);
React.useEffect(() => { originalCapturerRef.current = originalCapturer; }, [originalCapturer]);
React.useEffect(() => { ticketVersionRef.current = ticketVersion; }, [ticketVersion]);
```

### 4.3 Por qué es un riesgo

1. **El helper es una función pura que recibe setters.** Si se llama desde `handleExitWithoutSaving` (en `RetailVisionPOS`), funciona igual que ahora.
2. **PERO** si se llama desde `handleTicketAction` (dentro de `useTicketActions`), el helper necesita recibir **los mismos setters**. El plan lo hace, pero **no considera que `handleTicketAction` también debe limpiar `savedTicketRef.current`** (que el bloque actual **tampoco limpia** — es un bug latente preexistente).
3. **Riesgo real:** al extraer la limpieza, es fácil **omitir** un setter o un ref. El plan ya omitió 3 campos en la v1; la v2 los añadió, pero **no hay garantía de que la lista esté completa**.
4. **Además:** el helper se llama desde **dos contextos distintos** (dentro y fuera del hook). Si en el futuro uno de los dos contextos necesita limpiar algo extra, el helper compartido **no lo permitirá** sin afectar al otro.

### 4.4 Corrección para la v3

**NO extraer el helper.** El beneficio (DRY) **no compensa** el riesgo de desincronización. En su lugar:

1. **Fase 3 (v3):** solo corregir `handleExitWithoutSaving` para que limpie **los mismos campos** que `handleTicketAction`, **copiando la lista exacta** (incluyendo `orderData`, `orderType`, `lastSaveTime`).
2. **Añadir un test** que verifique que ambas listas son idénticas (test de contrato).
3. **Documentar** en un comentario que si se añade un campo a una lista, debe añadirse a la otra.

```javascript
// handleExitWithoutSaving (v3) — lista EXPLÍCITA, espejo de handleTicketAction
const handleExitWithoutSaving = () => {
    setShowExitModal(false);
    // ⚠️ MANTENER EN ESPEJO con useTicketActions.js:280-290
    clearCart();
    setOriginalCapturer(null);
    setCurrentAccountNum('');
    setTicketVersion(null);
    setOrderData(null);
    setOrderType('VENTA_DIRECTA');
    setLastSaveStatus('idle');
    setLastSaveTime(null);
    try {
        if (selectedTerminal) localStorage.removeItem(`pos_session_${selectedTerminal}`);
    } catch (e) { console.warn('Error limpiando persistencia:', e); }
    if (pendingExitAction) {
        pendingExitAction();
        setPendingExitAction(null);
    }
};
```

> **Nota:** Esto **duplica** la lista, pero la duplicación es **explícita y testeable**, mientras que el helper la **oculta**. Para una lista de 8 líneas, la duplicación explícita es **más segura**.

---

## 5. HALLAZGO N5 — 🟡 `terminal_id` PUEDE NO EXISTIR EN `TerminalSession`

### 5.1 Lo que propone la v2

> **Fase 6:** filtrar por `TerminalSession.terminal_id == terminal_id`.

### 5.2 El riesgo

El plan lo marca como "acción previa obligatoria", pero **no lo verifica**. Si el campo se llama distinto (ej. `terminal`, `terminal_code`, `name`), el filtro **fallará silenciosamente** (SQLAlchemy lanzaría `AttributeError`, capturado por el `try/except` del endpoint → retorna `{"status": "failed"}`).

### 5.3 Corrección para la v3

**Verificar el modelo ANTES de escribir la fase.** Si el campo no existe, **omitir la Fase 6** (el `emergency-save` actual funciona, solo es menos preciso en multi-terminal). **No inventar un campo.**

> **Acción concreta:** leer [`apps/api/modules/pos/models.py`](apps/api/modules/pos/models.py:1) y confirmar el nombre del campo. Si no existe, **eliminar la Fase 6 del plan** y documentar la limitación.

---

## 6. HALLAZGO N6 — 🟡 EL BRIDGE `window.requestPOSExit` PUEDE PERDER LLAMADAS

### 6.1 Lo que propone la v2

> **Fase 4:**
> ```javascript
> useEffect(() => {
>     window.requestPOSExit = requestExit;
>     return () => { delete window.requestPOSExit; };
> }, [requestExit]);
> ```

### 6.2 El riesgo

Con `requestExit = useCallback(..., [])`, la identidad es **estable** → el efecto corre **una sola vez**. **Pero** si en el futuro alguien añade una dependencia a `requestExit` (ej. `selectedTerminal`), el efecto se re-ejecutará:
1. Cleanup: `delete window.requestPOSExit` → **el bridge desaparece**.
2. Re-run: `window.requestPOSExit = requestExit` → **el bridge vuelve**.

Entre (1) y (2) hay una **ventana síncrona** donde `window.requestPOSExit` es `undefined`. Si `ExperimentCenterUI` llama en ese instante, `attemptNavigation` cae al `else` y **navega sin preguntar** → **pérdida de cuenta**.

### 6.3 Corrección para la v3

**Mantener deps `[]`** (como en el código actual) y **no depender de `requestExit`**:

```javascript
// v3: deps [] — el bridge se registra UNA vez y nunca se des-registra hasta el unmount
useEffect(() => {
    window.requestPOSExit = (actionCallback) => {
        if (cartRef.current.length > 0 && accountNumRef.current) {
            setPendingExitAction(() => actionCallback);
            setShowExitModal(true);
            return true;
        }
        return false;
    };
    return () => { delete window.requestPOSExit; };
}, []);
```

Y para `handleTerminalSwitch`, **duplicar la condición** (2 líneas) en vez de compartir `requestExit`. La duplicación de **una condición booleana de 1 línea** es **más segura** que un bridge que puede desaparecer.

> **Reconsideración de la v2:** La v2 declaró que la duplicación era "violación DRY" (BUG 5). Pero la duplicación es de **una sola condición** (`cartRef.current.length > 0 && accountNumRef.current`). El coste de abstraerla (riesgo N6) **supera** el beneficio. **La v3 debe abandonar la Fase 4.**

---

## 7. REVISIÓN DE LAS FASES RESTANTES

### Fase 2 (contrato) — ✅ APROBADA
El contrato `{ outcome, reason }` es correcto. **Único ajuste:** debe ejecutarse **antes** que la Fase 1 (por N3).

### Fase 5 (backdrop) — ✅ APROBADA
Cambio defensivo de 1 línea. Sin riesgo.

### Fase 7 (anti-closure) — ⚠️ RECLASIFICAR
La v2 la convierte en "solo un comentario". Si es solo un comentario, **no merece una fase**. **Fusionar con la Fase 4 o eliminarla.**

### Fase 8 (tests) — ✅ APROBADA con ajuste
La infraestructura existe. **Ajuste:** eliminar los tests de `resetCaptureState` (si se elimina el helper por N4) y añadir un test de **paridad de listas** de limpieza.

---

## 8. ANÁLISIS DE "¿ROMPE ALGO IMPORTANTE?"

| Componente crítico | ¿La v2 lo rompe? | Evidencia |
|--------------------|------------------|-----------|
| **Checkout (cobro)** | ❌ No | El contrato usa `navigated` para `needs_payment` (H2 corregido) |
| **Persistencia atómica por ítem** | ❌ No | No se toca `handleAddToCart` ni `useCart` |
| **Mutex de acciones** | ⚠️ **SÍ (N2)** | Fase 5b encola en el mutex → expulsión lenta |
| **Rendimiento del POS** | ⚠️ **SÍ (N1)** | Fase 5b con `useCallback([handleTicketAction])` → re-renders |
| **Bridge de navegación** | ⚠️ **SÍ (N6)** | Fase 4 puede des-registrar el bridge |
| **Salida del modal (camino feliz)** | ⚠️ **SÍ (N3)** | Fase 1 puede no salir por carrera de refs |
| **Force logout** | ⚠️ **SÍ (N2)** | Expulsión lenta + clic repetido |
| **Cierre de pestaña** | ❌ No | Fase 6 es aditiva |
| **Cambio de terminal** | ❌ No | Fase 4 mantiene comportamiento (si se conserva deps `[]`) |
| **Reglas de Oro** | ✅ Se respetan | Ninguna se viola |

**Respuesta a la pregunta del usuario:** **SÍ, la v2 puede romper 4 cosas importantes** (mutex, rendimiento, bridge, salida del modal). Por eso requiere v3.

---

## 9. PLAN v3 RECOMENDADO (SIMPLIFICADO)

La v3 debe ser **más pequeña y conservadora**. De 9 fases a **5**:

| Fase v3 | Contenido | Riesgo | Origen |
|---------|-----------|--------|--------|
| **1. Contrato** | `{ outcome, reason }` en `handleTicketAction` (incluye `navigated` y `not_finalized`) | 🟡 Medio | Fase 2 v2 |
| **2. Consumidor** | `handleSendThenExit` usa `result.outcome !== 'success'` | 🟢 Bajo | Fase 1 v2 (corregida N3) |
| **3. Limpieza espejo** | `handleExitWithoutSaving` limpia la lista **explícita** (sin helper) | 🟢 Bajo | Fase 3 v2 (corregida N4) |
| **4. Backdrop** | Limpiar `pendingExitAction` al cerrar | 🟢 Bajo | Fase 5 v2 |
| **5. Force logout + beacon** | `sendBeacon` fire-and-forget (sin `await`, sin `useCallback`) | 🟢 Bajo | Fases 5b+6 v2 (corregidas N1, N2) |
| **6. Tests** | Contrato + paridad de listas + beacon | 🟢 Bajo | Fase 8 v2 |

**Fases ELIMINADAS de la v2:**
- ❌ **Fase 4 (DRY intercepción):** riesgo N6 > beneficio. Mantener la duplicación de 1 línea.
- ❌ **Fase 6 backend (`terminal_id`):** condicional a verificar el modelo. Si no existe el campo, eliminar.
- ❌ **Fase 7 (anti-closure):** era solo un comentario. Fusionar o eliminar.
- ❌ **Helper `resetCaptureState`:** riesgo N4 > beneficio. Usar lista espejo explícita.

**Orden:** Contrato → Consumidor → Limpieza → Backdrop → Force logout → Tests.

---

## 10. VEREDICTO FINAL

| Aspecto | v1 | v2 | v3 (propuesta) |
|---------|----|----|----------------|
| Diagnóstico del BUG 1 | ✅ | ✅ | ✅ |
| Rompe checkout | ❌ Sí (H2) | ✅ No | ✅ No |
| Rompe rendimiento | ✅ No | ❌ **Sí (N1)** | ✅ No |
| Rompe mutex/expulsión | ✅ No | ❌ **Sí (N2)** | ✅ No |
| Rompe salida del modal | ✅ No | ❌ **Sí (N3)** | ✅ No |
| Rompe bridge | ✅ No | ❌ **Sí (N6)** | ✅ No |
| Nº de fases | 7 | 9 | **6** |
| Riesgo global | 🔴 Alto | 🟠 Medio-Alto | 🟢 Bajo |

**Recomendación:** **NO ejecutar la v2.** Redactar la **v3** con las 6 fases simplificadas de la Sección 9. La v3 prioriza **no romper nada** sobre la elegancia arquitectónica (DRY), que es exactamente lo que el usuario pidió.

> **Principio rector de la v3:** *"La duplicación explícita y testeable es preferible a la abstracción que oculta riesgos."*

> **Pendiente:** Aprobación del Socio Fundador sobre la v3 antes de ejecutar cualquier fase.
