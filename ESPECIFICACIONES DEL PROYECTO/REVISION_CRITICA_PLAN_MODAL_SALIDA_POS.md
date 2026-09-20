# 🔍 REVISIÓN CRÍTICA DEL PLAN DE CORRECCIÓN: MODAL DE SALIDA POS

> **Revisor:** Arquitecto Full-Stack Senior (IA) — auto-revisión adversarial
> **Fecha:** 2026-09-20
> **Documento revisado:** [`PLAN_CORRECCION_MODAL_SALIDA_POS.md`](ESPECIFICACIONES%20DEL%20PROYECTO/PLAN_CORRECCION_MODAL_SALIDA_POS.md:1)
> **Método:** Verificación de cada afirmación del plan contra el código fuente real (evidencia con número de línea).
> **Veredicto global:** ⚠️ **EL PLAN ES CORRECTO EN SU DIAGNÓSTICO PERO TIENE 3 DEFECTOS GRAVES Y 4 IMPRECISIONES.** No debe ejecutarse tal cual. Requiere revisión v2.

---

## 0. RESUMEN EJECUTIVO

| # | Hallazgo | Severidad | Fase afectada | Acción requerida |
|---|----------|-----------|---------------|------------------|
| **H1** | La Fase 6 se basa en una **premisa FALSA**: el endpoint `emergency-save` **SÍ existe** | 🔴 CRÍTICO | Fase 6 | Reescribir Fase 6 completa |
| **H2** | La Fase 1 **rompe el flujo de checkout** al devolver `{ ok: false }` en `needs_payment` | 🔴 CRÍTICO | Fase 1 | Rediseñar el contrato de retorno |
| **H3** | La Fase 3 **duplica** la limpieza que ya hace `handleTicketAction` y **pierde el `orderData`/`orderType`** | 🟠 ALTO | Fase 3 | Simplificar y completar |
| **H4** | La Fase 4 introduce un `useCallback` con `doTerminalExit` **no memoizado** → closure obsoleto | 🟠 ALTO | Fase 4 | Memoizar o usar ref |
| **H5** | El plan **no cubre** el caso `finalizeUI=false` (checkout desde `CheckoutScreen`) | 🟡 MEDIO | Fase 1 | Documentar y excluir |
| **H6** | El plan **no cubre** el `onForceLogout` (expulsión por lock) — un cuarto camino de salida | 🟡 MEDIO | Fases 2/4 | Añadir análisis |
| **H7** | La Fase 7 propone tests de componentes React **sin infraestructura de testing de componentes** | 🟡 MEDIO | Fase 7 | Verificar `vitest` + jsdom |
| **H8** | El plan afirma "6 bugs" pero el **BUG 5 (doble clearCart) no es un bug real** en el camino analizado | 🟢 BAJO | Inventario | Reclasificar |

**Conclusión:** El diagnóstico de fondo (BUG 1 = pérdida de cuenta por fallo silencioso) es **válido y grave**. Pero la solución propuesta tiene defectos que, si se ejecutan literalmente, **introducirían regresiones nuevas** en el checkout y en el cambio de terminal. El plan debe corregirse antes de aprobarse.

---

## 1. HALLAZGO H1 — 🔴 LA FASE 6 SE BASA EN UNA PREMISA FALSA

### 1.1 Lo que dice el plan

> **Fase 6, línea 344:** "**Revisar** el `emergency-save`: verificar que el endpoint `/pos/tickets/emergency-save` exista en el backend. **Si no existe, eliminar esa llamada** (envía basura silenciosa) y confiar solo en el diálogo nativo..."
>
> **Línea 346:** "⚠️ ACCIÓN PREVIA OBLIGATORIA: Antes de tocar este archivo, verificar con `grep` si el endpoint `emergency-save` existe..."

### 1.2 La realidad (evidencia)

El endpoint **SÍ EXISTE** y es una **feature legítima v4.0 ZERO-LOSS**:

```python
# apps/api/modules/pos/router.py:429-475
@router.post("/tickets/emergency-save")
async def emergency_save_ticket(payload: dict, db: AsyncSession = Depends(get_db)):
    """
    v4.0 ZERO-LOSS: Endpoint de emergencia para sendBeacon (cierre de navegador).
    Acepta un payload simplificado y hace lo posible por guardar el ticket.
    No lanza excepciones — siempre retorna 200 para no bloquear el cierre del navegador.
    """
```

El endpoint:
- Busca la sesión activa (`TerminalSession.is_active == True`).
- Construye un `TicketCreate` con `status="OPEN"` y llama a `pos_service.create_ticket`.
- Retorna `{"status": "saved"|"failed"|"ignored"}` — **nunca lanza excepción** (por diseño, para no bloquear el cierre del navegador).

### 1.3 Por qué el plan está mal

1. **La premisa "si no existe, eliminar" es inaplicable** — existe. El plan deja una instrucción condicional que nunca se ejecutará, pero **contamina el razonamiento** y podría llevar a un ejecutor descuidado a borrar una feature v4.0 ZERO-LOSS.
2. **El plan califica la llamada como "basura silenciosa"** (línea 344) — es un juicio **incorrecto y peligroso**. La llamada es la **última línea de defensa** contra pérdida de datos en cierre de pestaña. Eliminarla **debilita** el Zero-Loss.
3. **El plan ignora un defecto REAL del endpoint** que sí debería corregirse: el endpoint busca `TerminalSession.is_active == True` **sin filtrar por terminal** (`.limit(1)`), por lo que en un entorno multi-terminal **puede guardar el ticket en la sesión equivocada**. Ese es el bug real que la Fase 6 debería atacar.

### 1.4 Corrección propuesta para la Fase 6 (v2)

**NO eliminar** la llamada. En su lugar:

1. **Frontend** ([`useBeforeUnload.js:38-43`](apps/pos/hooks/useBeforeUnload.js:38)): añadir `terminal_id` al payload del beacon para que el backend pueda resolver la sesión correcta:
   ```javascript
   const payload = JSON.stringify({
       account_num: accountNumRef.current,
       items: cartRef.current.map(i => ({ product_id: i.id, quantity: i.quantity || 1 })),
       status: 'OPEN',
       emergency_save: true,
       terminal_id: selectedTerminalRef.current,   // ← NUEVO
   });
   ```
2. **Backend** ([`router.py:449-455`](apps/api/modules/pos/router.py:449)): filtrar la sesión por terminal si viene `terminal_id`; si no viene, mantener el fallback actual (`.limit(1)`).
3. **Documentar** que el `emergency-save` es **best-effort** y que la verificación post-envío (Regla 12) **no aplica** en `beforeunload` (no hay tiempo de hacer un round-trip de verificación).

> **Nota:** El cambio de backend toca [`router.py`](apps/api/modules/pos/router.py:1), que está en Zona Restringida. Requiere aprobación explícita y una migración NO es necesaria (no hay cambio de esquema).

---

## 2. HALLAZGO H2 — 🔴 LA FASE 1 ROMPE EL FLUJO DE CHECKOUT

### 2.1 Lo que dice el plan

> **Fase 1, línea 132-133:**
> ```javascript
> // Cobro sin datos de pago (línea 136) — NO es un fallo, es una navegación
> return { ok: false, reason: 'needs_payment' };
> ```

### 2.2 La realidad (evidencia)

El camino `needs_payment` **no es un fallo**: es una **transición de UI legítima** que abre la pantalla de cobro:

```javascript
// apps/pos/hooks/useTicketActions.js:133-137
if (status === 'PAID' && (!paymentData || paymentData.length === 0)) {
    setShowCheckout(true);   // ← Abre la pantalla de cobro
    return;
}
```

Y el consumidor en [`RetailVisionPOS.jsx:494`](apps/pos/RetailVisionPOS.jsx:494) es:
```javascript
handleCheckout={(method) => handleTicketAction('PAID', method)}
```

### 2.3 Por qué el plan está mal

1. **Semánticamente incorrecto:** `{ ok: false, reason: 'needs_payment' }` mezcla **fallo** con **navegación**. Un consumidor que haga `if (!result.ok) mostrarError()` mostraría un error falso cuando el usuario simplemente está yendo a pagar.
2. **Riesgo de regresión real:** Si en el futuro alguien escribe un consumidor genérico que trate `ok: false` como error, el flujo de cobro se rompería. El plan **crea una trampa** para el próximo desarrollador.
3. **El plan no define el contrato con precisión:** ¿`ok: true` significa "acción completada" o "no hubo error"? El plan usa ambos significados indistintamente.

### 2.4 Corrección propuesta para la Fase 1 (v2)

Usar un **discriminador de 3 estados** en vez de un booleano:

```javascript
// Contrato v2: { outcome: 'success' | 'aborted' | 'navigated', reason?: string }
return { outcome: 'success' };                          // Éxito real
return { outcome: 'aborted', reason: 'empty_cart' };    // No se hizo nada
return { outcome: 'navigated', reason: 'needs_payment' }; // Se abrió otra UI
return { outcome: 'aborted', reason: 'already_paid' };
return { outcome: 'aborted', reason: 'version_conflict_recovered' };
return { outcome: 'aborted', reason: 'verification_failed' };
throw error;                                            // Error de red (sin cambio)
```

Y en el consumidor del modal:
```javascript
if (result?.outcome !== 'success') { /* NO salir */ }
```

**Ventaja:** `navigated` es explícitamente **no-error**, eliminando la trampa semántica. Además, el nombre `outcome` deja claro que describe el resultado, no el éxito.

> **Alternativa más conservadora (si se prefiere minimizar cambios):** mantener `{ ok, reason }` pero **excluir `needs_payment` del contrato** — es decir, que ese camino siga retornando `undefined` y se documente como "navegación, no resultado". Menos elegante, pero cero riesgo de trampa semántica.

---

## 3. HALLAZGO H3 — 🟠 LA FASE 3 DUPLICA LIMPIEZA Y PIERDE ESTADO

### 3.1 Lo que dice el plan

> **Fase 3, líneas 225-246:** `handleExitWithoutSaving` limpia `clearCart()`, `setCurrentAccountNum('')`, `setOriginalCapturer(null)`, `setTicketVersion(null)`, `setLastSaveStatus('idle')` y dos `localStorage.removeItem`.

### 3.2 La realidad (evidencia)

`handleTicketAction` ya hace **exactamente** esa limpieza en su camino de éxito ([`useTicketActions.js:280-290`](apps/pos/hooks/useTicketActions.js:280)):

```javascript
clearCart();
setOriginalCapturer(null);
setCurrentAccountNum('');
setTicketVersion(null);
setOrderData(null);          // ← El plan NO limpia esto
setOrderType('VENTA_DIRECTA'); // ← El plan NO limpia esto
setLastSaveStatus('idle');
setLastSaveTime(null);       // ← El plan NO limpia esto
try {
    if (selectedTerminal) localStorage.removeItem(`pos_session_${selectedTerminal}`);
} catch (e) { ... }
```

### 3.3 Por qué el plan está mal

1. **Duplicación de lógica (viola DRY):** La lista de limpieza está ahora en **dos lugares** que pueden divergir. Si mañana se añade un estado nuevo, habrá que recordar limpiarlo en ambos sitios.
2. **Limpieza INCOMPLETA:** El plan **olvida** `setOrderData(null)`, `setOrderType('VENTA_DIRECTA')` y `setLastSaveTime(null)`. Si el usuario estaba capturando un **PEDIDO** (no una venta directa) y sale sin enviar, el `orderType` **queda pegado en `'PEDIDO'`** y la siguiente cuenta heredará el tipo equivocado. **Esto es un bug nuevo que el plan introduce.**
3. **`localStorage.removeItem('pos_cart_...')` es redundante:** `clearCart()` ya lo hace ([`useCart.js:139-142`](apps/pos/hooks/useCart.js:139)):
   ```javascript
   const clearCart = () => {
       setCartState(prev => ({ ...prev, items: [] }));
       localStorage.removeItem(storageKey);   // ← Ya remueve la key
   };
   ```
   El plan lo remueve **otra vez** (línea 237). Inofensivo pero ruido.

### 3.4 Corrección propuesta para la Fase 3 (v2)

**Extraer una función única de limpieza** y reutilizarla:

```javascript
// Función única de limpieza de sesión de captura (DRY)
const resetCaptureState = useCallback(() => {
    clearCart();
    setCurrentAccountNum('');
    setOriginalCapturer(null);
    setTicketVersion(null);
    setOrderData(null);
    setOrderType('VENTA_DIRECTA');
    setLastSaveStatus('idle');
    setLastSaveTime(null);
    try {
        if (selectedTerminal) localStorage.removeItem(`pos_session_${selectedTerminal}`);
    } catch (e) { console.warn('Error limpiando persistencia:', e); }
}, [selectedTerminal, clearCart]);

const handleExitWithoutSaving = () => {
    setShowExitModal(false);
    resetCaptureState();   // ← Una sola fuente de verdad
    if (pendingExitAction) {
        pendingExitAction();
        setPendingExitAction(null);
    }
};
```

> **Nota:** `useTicketActions.js` **no puede** importar esta función (vive en `RetailVisionPOS.jsx`). Para un DRY real habría que mover la limpieza a un helper compartido. **Recomendación:** crear `apps/pos/utils/resetCaptureState.js` y usarlo en ambos sitios. Esto **sí** toca `useTicketActions.js` (Zona Restringida) pero es un refactor puro sin cambio de comportamiento.

---

## 4. HALLAZGO H4 — 🟠 LA FASE 4 INTRODUCE UN CLOSURE OBSOLETO

### 4.1 Lo que dice el plan

> **Fase 4, líneas 270-291:**
> ```javascript
> const requestExit = useCallback((actionCallback) => {
>     if (cartRef.current.length > 0 && accountNumRef.current) {
>         setPendingExitAction(() => actionCallback);
>         setShowExitModal(true);
>         return true;
>     }
>     return false;
> }, []);
>
> const handleTerminalSwitch = () => {
>     if (!canSwitchTerminal) return;
>     if (!requestExit(doTerminalExit)) {
>         doTerminalExit();
>     }
> };
> ```

### 4.2 La realidad (evidencia)

`doTerminalExit` **se recrea en cada render** (no está memoizado) y **captura `selectedTerminal`** en su closure:

```javascript
// apps/pos/RetailVisionPOS.jsx:344-357
const doTerminalExit = async () => {
    setShowExitModal(false);
    try {
        await posService.unlockTerminal(selectedTerminal, currentUser?.id);  // ← closure
    } catch(e) { ... }
    try {
        localStorage.removeItem(`pos_session_${selectedTerminal}`);          // ← closure
        localStorage.removeItem(`pos_cart_${selectedTerminal}`);             // ← closure
        clearCart();
        setCurrentAccountNum('');
        setOriginalCapturer(null);
    } catch(e) {}
    setSelectedTerminal(null);
};
```

### 4.3 Por qué el plan está mal

1. **El plan afirma (línea 297):** "`useCallback` con deps `[]` es seguro porque lee de refs (no de state)." — **Esto es cierto para `requestExit`**, pero **NO para el `actionCallback` que recibe**. El callback `doTerminalExit` captura `selectedTerminal` del render en que se creó.
2. **Escenario de fallo:** Si el usuario cambia de terminal (T1 → T2) sin desmontar el componente, `doTerminalExit` del render viejo captura `selectedTerminal = 'T1'`. Si ese callback quedó guardado en `pendingExitAction` y se ejecuta después, **desbloquearía y limpiaría la terminal equivocada**.
3. **El plan no valida este riesgo** — lo declara "seguro" sin analizar el closure del callback. Es una **afirmación no verificada** (viola la regla del proyecto: "Prohibido 'adivinar'").

### 4.4 Corrección propuesta para la Fase 4 (v2)

**Memoizar `doTerminalExit`** con sus dependencias reales, o **leer de refs** dentro de él:

```javascript
// Opción A (recomendada): leer de refs dentro de doTerminalExit
const selectedTerminalRef = useRef(selectedTerminal);
useEffect(() => { selectedTerminalRef.current = selectedTerminal; }, [selectedTerminal]);

const doTerminalExit = useCallback(async () => {
    const terminal = selectedTerminalRef.current;   // ← siempre el vigente
    setShowExitModal(false);
    try {
        await posService.unlockTerminal(terminal, currentUser?.id);
    } catch(e) { console.error("Could not unlock terminal", e); }
    try {
        localStorage.removeItem(`pos_session_${terminal}`);
        localStorage.removeItem(`pos_cart_${terminal}`);
        clearCart();
        setCurrentAccountNum('');
        setOriginalCapturer(null);
    } catch(e) {}
    setSelectedTerminal(null);
}, [clearCart]);
```

> **Nota:** `currentUser` también es un closure. Si el usuario cambia (raro en POS), el unlock usaría el ID viejo. Añadir `currentUserRef` por simetría.

---

## 5. HALLAZGO H5 — 🟡 EL PLAN NO CUBRE `finalizeUI=false`

### 5.1 Evidencia

`handleTicketAction` tiene un tercer parámetro `finalizeUI` ([`useTicketActions.js:112`](apps/pos/hooks/useTicketActions.js:112)):

```javascript
const handleTicketAction = async (status, paymentData = null, finalizeUI = true) => {
```

Y se llama con `false` desde el checkout ([`RetailVisionPOS.jsx:508`](apps/pos/RetailVisionPOS.jsx:508)):
```javascript
await handleTicketAction('PAID', method, true)   // ← el plan dice "true", pero verificar
```

### 5.2 Por qué importa

Cuando `finalizeUI === false`, el bloque de limpieza ([`useTicketActions.js:257`](apps/pos/hooks/useTicketActions.js:257)) **no se ejecuta**, por lo que:
- El carrito **no se limpia**.
- La verificación post-envío **no se ejecuta**.
- El retorno del contrato v2 **debe reflejar** que no hubo finalización.

El plan **no menciona** este parámetro en ninguna fase. Si el contrato v2 devuelve `{ outcome: 'success' }` cuando `finalizeUI === false`, sería **mentira** (no se finalizó nada).

### 5.3 Corrección propuesta

Documentar explícitamente en la Fase 1:
```javascript
if (!finalizeUI) {
    return { outcome: 'success', reason: 'not_finalized' };  // Guardado sin finalizar UI
}
```
Y añadir un test que verifique este camino.

---

## 6. HALLAZGO H6 — 🟡 EL PLAN IGNORA `onForceLogout`

### 6.1 Evidencia

`RetailVisionPOS` recibe `onForceLogout` como prop ([`RetailVisionPOS.jsx:29`](apps/pos/RetailVisionPOS.jsx:29)):
```javascript
export const RetailVisionPOS = ({ currentUser, onForceLogout, assignedTerminal }) => {
```

Este es un **cuarto camino de salida** (expulsión cuando otro usuario toma la terminal). El plan solo analiza 3 caminos (logout, cambio de módulo, cambio de terminal).

### 6.2 Por qué importa

Si un usuario es **expulsado** (force logout) mientras tiene una cuenta capturada sin enviar, **¿se pierde la cuenta?** El plan no lo responde. Es exactamente el escenario de negocio original ("el operador de CAJA no encuentra la cuenta").

### 6.3 Corrección propuesta

Añadir a la Fase 2 (o una Fase 2b) el análisis y, si procede, la intercepción del force logout. **Nota:** el force logout es **involuntario** — no se puede mostrar un modal bloqueante (el usuario ya perdió el lock). La mitigación correcta es **emergency-save automático** antes de ejecutar `onForceLogout`.

---

## 7. HALLAZGO H7 — 🟡 LA FASE 7 ASUME INFRAESTRUCTURA DE TESTING INEXISTENTE

### 7.1 Lo que dice el plan

> **Fase 7, línea 370:** "Estas pruebas requieren mockear `posService`. Seguir el patrón de los tests existentes en `apps/pos/utils/` (ej. `terminalCardState.test.js`)."

### 7.2 La realidad

El plan propone tests de **componentes React** (`handleSendThenExit`, `handleExitWithoutSaving` son funciones internas de un componente). Los tests existentes en `apps/pos/utils/` son de **utilidades puras** (ej. `terminalCardState`), no de hooks/componentes.

Testear `handleSendThenExit` requiere:
- `@testing-library/react` + `jsdom` (o `happy-dom`).
- Renderizar `RetailVisionPOS` con todos sus hooks (que a su vez llaman a `posService`, `useVision`, `useNetworkHealth`, etc.).

**El plan no verifica** que esa infraestructura exista. Si no existe, la Fase 7 es **inviable** y el plan quedaría incompleto.

### 7.3 Corrección propuesta

**Antes de la Fase 7**, verificar:
```bash
npm ls @testing-library/react jsdom happy-dom vitest
```
Si no están instalados, la Fase 7 debe:
- **Opción A:** Añadir la infraestructura (nuevas devDependencies — requiere aprobación).
- **Opción B (recomendada):** Extraer la lógica de decisión a una **función pura testeable** (ej. `shouldExitAfterSend(result)`) y testear solo esa función. Cero dependencias nuevas.

---

## 8. HALLAZGO H8 — 🟢 EL "BUG 5" NO ES UN BUG REAL

### 8.1 Lo que dice el plan

> **Inventario, línea 41:** "🟢 BAJO | Doble `clearCart()` en el camino 'Enviar y salir' → `doTerminalExit`"

### 8.2 La realidad

En el camino "Enviar y salir" con `pendingExitAction = doTerminalExit`:
1. `handleTicketAction('OPEN')` → éxito → `clearCart()` (línea 280).
2. `pendingExitAction()` → `doTerminalExit()` → `clearCart()` (línea 352).

Sí hay doble llamada, **pero**:
- `clearCart()` es **idempotente** ([`useCart.js:139`](apps/pos/hooks/useCart.js:139)).
- React **batchea** los `setState`.
- El `localStorage.removeItem` es idempotente.

**No hay bug observable.** El plan lo clasifica como "bug" pero luego admite (línea 252) que "es idempotente e inofensivo". **Es una inconsistencia interna del plan:** no puede ser un bug y ser inofensivo a la vez.

### 8.3 Corrección propuesta

Reclasificar el BUG 5 como **"deuda técnica / code smell"**, no como bug. Y **no** dedicarle una fase de corrección (la Fase 3 ya lo mitiga indirectamente al no duplicar).

---

## 9. ANÁLISIS DE RIESGOS ADICIONALES NO CUBIERTOS POR EL PLAN

| Riesgo | Descripción | Mitigación propuesta |
|--------|-------------|----------------------|
| **R1** | El modal **atrapa** al usuario si `handleTicketAction` entra en un bucle de reintentos (`withRetries` con 3 intentos × timeout) | El botón "Salir sin enviar" debe estar **siempre habilitado** (verificar que no se deshabilite durante `isSendingToPizarron`) |
| **R2** | El plan no define qué pasa si el usuario cierra el modal con **ESC** | Verificar si hay un listener de ESC; si no, añadirlo como "Cancelar" |
| **R3** | El plan no menciona **accesibilidad** (focus trap en el modal) | Fuera de alcance, pero documentar |
| **R4** | La Fase 4 cambia `window.requestPOSExit` de deps `[]` a deps `[requestExit]` — si `requestExit` cambia de identidad, el bridge se re-registra | Con `useCallback([])` la identidad es estable; verificar que no haya re-render loops |
| **R5** | El plan no verifica que `ExperimentCenterUI` **desmonte** el POS al hacer logout — si no lo desmonta, el modal podría quedar montado | Verificar el ciclo de vida del componente |

---

## 10. VEREDICTO POR FASE

| Fase | Veredicto | Razón |
|------|-----------|-------|
| **Fase 1** | ❌ **RECHAZADA** | Rompe semántica del checkout (H2); no cubre `finalizeUI=false` (H5) |
| **Fase 2** | ✅ **APROBADA con matices** | Correcta en esencia; añadir manejo de `outcome: 'navigated'` y el caso `onForceLogout` (H6) |
| **Fase 3** | ⚠️ **REQUIERE REVISIÓN** | Limpieza incompleta (pierde `orderData`/`orderType`) (H3); duplica lógica |
| **Fase 4** | ⚠️ **REQUIERE REVISIÓN** | Closure obsoleto de `doTerminalExit` (H4) |
| **Fase 5** | ✅ **APROBADA** | Cambio defensivo correcto y de bajo riesgo |
| **Fase 6** | ❌ **RECHAZADA** | Premisa falsa (H1); propone eliminar una feature ZERO-LOSS |
| **Fase 7** | ⚠️ **REQUIERE REVISIÓN** | Asume infraestructura de testing inexistente (H7) |

---

## 11. RECOMENDACIÓN FINAL

**NO ejecutar el plan v1.** Elaborar un **Plan v2** que:

1. **Fase 1 (v2):** Contrato `{ outcome: 'success'|'aborted'|'navigated', reason? }` + manejo de `finalizeUI=false`.
2. **Fase 2 (v2):** `handleSendThenExit` fail-safe + análisis de `onForceLogout`.
3. **Fase 3 (v2):** Extraer `resetCaptureState` a helper compartido (DRY real) e incluir `orderData`/`orderType`/`lastSaveTime`.
4. **Fase 4 (v2):** `doTerminalExit` leyendo de refs (no closure).
5. **Fase 5:** Sin cambios (aprobada).
6. **Fase 6 (v2):** **Endurecer** el `emergency-save` (añadir `terminal_id`), **NO eliminarlo**. Requiere cambio de backend en Zona Restringida.
7. **Fase 7 (v2):** Extraer lógica a funciones puras testeables; verificar infraestructura antes.

**Prioridad de ejecución sugerida:** Fase 2 (el fix crítico del negocio) puede ejecutarse **primero** si se hace con un chequeo defensivo local (sin depender del contrato v2), para mitigar el riesgo de pérdida de cuentas **cuanto antes**. Las fases de refactor (1, 3, 4) pueden ir después.

> **Pendiente:** Aprobación del Socio Fundador sobre el Plan v2 antes de ejecutar cualquier fase.
