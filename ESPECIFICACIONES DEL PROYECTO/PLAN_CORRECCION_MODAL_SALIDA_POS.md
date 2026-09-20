# 🛡️ PLAN DE CORRECCIÓN v3: MODAL DE SALIDA CON CUENTA SIN ENVIAR — POS R de Rico

> **⚠️ ZONA RESTRINGIDA.** Este plan toca [`RetailVisionPOS.jsx`](apps/pos/RetailVisionPOS.jsx:1), [`useTicketActions.js`](apps/pos/hooks/useTicketActions.js:1) y [`useBeforeUnload.js`](apps/pos/hooks/useBeforeUnload.js:1), listados en el Mapa de Zona Restringida de [`DOCUMENTACION_MODULO_POS.md`](ESPECIFICACIONES%20DEL%20PROYECTO/DOCUMENTACION_MODULO_POS.md:485). La Fase 5 toca además [`router.py`](apps/api/modules/pos/router.py:1) (backend).
>
> **Autor:** Arquitecto Full-Stack Senior (IA)
> **Fecha:** 2026-09-20
> **Versión:** **v3** — simplificación tras la 2ª revisión crítica [`REVISION_CRITICA_V2_PLAN_MODAL_SALIDA_POS.md`](ESPECIFICACIONES%20DEL%20PROYECTO/REVISION_CRITICA_V2_PLAN_MODAL_SALIDA_POS.md:1)
> **Estado:** PROPUESTA — pendiente de aprobación del Socio Fundador
> **Versión objetivo del POS:** v7.0.3 (parche — corrección de bugs, sin cambio de arquitectura)

---

## 0. PRINCIPIO RECTOR DE LA v3

> **"La duplicación explícita y testeable es preferible a la abstracción que oculta riesgos."**

La v1 y la v2 fallaron por **sobre-ingeniería**: introdujeron abstracciones (contrato booleano, helper compartido, bridge unificado) que crearon riesgos nuevos. La v3 **elimina** esas abstracciones y se queda con lo mínimo indispensable.

### 0.1 Trazabilidad de las 3 versiones

| Aspecto | v1 | v2 | **v3** |
|---------|----|----|--------|
| Diagnóstico del BUG 1 | ✅ | ✅ | ✅ |
| Rompe checkout | ❌ Sí (H2) | ✅ No | ✅ No |
| Rompe rendimiento | ✅ No | ❌ Sí (N1) | ✅ No |
| Rompe mutex/expulsión | ✅ No | ❌ Sí (N2) | ✅ No |
| Rompe salida del modal | ✅ No | ❌ Sí (N3) | ✅ No |
| Rompe bridge | ✅ No | ❌ Sí (N6) | ✅ No |
| Nº de fases | 7 | 9 | **6** |
| Riesgo global | 🔴 Alto | 🟠 Medio-Alto | 🟢 **Bajo** |

### 0.2 Qué se ELIMINÓ de la v2 (y por qué)

| Elemento v2 | Motivo de eliminación | Hallazgo |
|-------------|----------------------|----------|
| `useCallback` en `handleForceLogout` | `handleTicketAction` no está memoizado → re-renders | N1 |
| `await handleTicketAction` en force logout | El mutex + retries bloquean la expulsión hasta 6.5s | N2 |
| `cartRef.current.length > 0` como señal | Carrera con el `useEffect` de sincronización | N3 |
| Helper `resetCaptureState` | Oculta la lista de limpieza → riesgo de omitir setters | N4 |
| Fase 4 (DRY intercepción) | El bridge puede des-registrarse → ventana de carrera | N6 |
| Fase 7 (anti-closure) | Era solo un comentario → no merece fase | — |

### 0.3 Suposiciones VERIFICADAS (no asumidas)

| Suposición | Verificación | Resultado |
|------------|--------------|-----------|
| `TerminalSession.terminal_id` existe | [`models.py:21`](apps/api/modules/pos/models.py:21) | ✅ **Existe** → Fase 5 viable |
| `CONFIG` está importado en `RetailVisionPOS` | [`RetailVisionPOS.jsx:12`](apps/pos/RetailVisionPOS.jsx:12) | ✅ **Sí** → beacon viable |
| Infraestructura de testing | [`package.json:26-36`](package.json:26) | ✅ `@testing-library/react`, `jsdom`, `vitest` instalados |
| `handleTicketAction` no memoizado | [`useTicketActions.js:112`](apps/pos/hooks/useTicketActions.js:112) | ⚠️ Confirmado → no usar en deps |
| `handlePrintTicket` sí memoizado | [`useTicketActions.js:70`](apps/pos/hooks/useTicketActions.js:70) | ✅ Confirmado |

---

## 1. CONTEXTO Y MOTIVACIÓN

### 1.1 Problema de negocio original

El personal capturaba una cuenta en el POS, olvidaba presionar "Enviar al Pizarrón" y cerraba sesión. El operador de CAJA nunca encontraba la cuenta porque **nunca llegó al servidor**. Para prevenirlo se creó un modal que obliga al usuario a decidir antes de salir.

### 1.2 Hallazgo de la auditoría

El modal **existe, está cableado y es funcional**, pero tiene defectos que reducen su eficacia. El más grave (**BUG 1**) anula parcialmente el propósito del modal: si el envío falla silenciosamente, el usuario sale igual y la cuenta se pierde — exactamente el escenario que el modal debía prevenir.

### 1.3 Principio de no-regresión

> **NO romper el POS.** Toda corrección debe:
> 1. Respetar las **18 Reglas de Oro** de [`DOCUMENTACION_MODULO_POS.md`](ESPECIFICACIONES%20DEL%20PROYECTO/DOCUMENTACION_MODULO_POS.md:300).
> 2. No reintroducir auto-save, timers de persistencia, ni complejidad de la era v4.x.
> 3. Mantener la **persistencia atómica por ítem** (v6.0) intacta.
> 4. Pasar `npm run build` y `npx vitest run` sin regresiones.
> 5. Ser **reversible** (cada fase es un commit atómico independiente).
> 6. **No introducir bugs nuevos** (lección de las revisiones v1 y v2).

---

## 2. INVENTARIO DE DEFECTOS A CORREGIR

| # | Severidad | Defecto | Archivo | Impacto |
|---|-----------|---------|---------|---------|
| **1** | 🔴 CRÍTICO | `handleSendThenExit` ejecuta la salida aunque el envío haya fallado silenciosamente | [`RetailVisionPOS.jsx:359`](apps/pos/RetailVisionPOS.jsx:359) + [`useTicketActions.js:112`](apps/pos/hooks/useTicketActions.js:112) | Pérdida de cuenta (el bug original) |
| **2** | 🟠 ALTO | `handleExitWithoutSaving` no limpia carrito ni estado de captura | [`RetailVisionPOS.jsx:375`](apps/pos/RetailVisionPOS.jsx:375) | Carrito "perdido" reaparece; `orderType` queda pegado |
| **3** | 🟡 MEDIO | El modal se cierra con clic en backdrop dejando `pendingExitAction` huérfano | [`RetailVisionPOS.jsx:559`](apps/pos/RetailVisionPOS.jsx:559) | Acción vieja se ejecuta después |
| **4** | 🟡 MEDIO | `onForceLogout` (expulsión por lock) **no** guarda la cuenta antes de expulsar | [`POSOverlays.jsx:31`](apps/pos/components/POSOverlays.jsx:31) | Pérdida de cuenta en expulsión |
| **5** | 🟡 MEDIO | `emergency-save` busca la sesión con `.limit(1)` sin filtrar por terminal | [`router.py:452`](apps/api/modules/pos/router.py:452) | Guarda en la sesión equivocada (multi-terminal) |

**Defectos NO incluidos (reclasificados):**
- **Doble `clearCart()`** (v1 "BUG 5"): deuda técnica, no bug. `clearCart()` es idempotente ([`useCart.js:139`](apps/pos/hooks/useCart.js:139)).
- **Duplicación de la condición de intercepción** (v1 "BUG 6"): **se mantiene deliberadamente**. Abstraerla crea el riesgo N6. La condición es de 1 línea.
- **Closure de `doTerminalExit`** (v2 "BUG 8"): **no se toca**. El callback solo se invoca desde `handleTerminalSwitch` en el mismo render; el riesgo es teórico y la corrección (refs) añade complejidad sin beneficio medible.

---

## 3. ANÁLISIS DE CAUSA RAÍZ (BUG 1 — el crítico)

### 3.1 El contrato de retorno roto de `handleTicketAction`

[`handleTicketAction`](apps/pos/hooks/useTicketActions.js:112) tiene **7 caminos de salida** con semántica inconsistente:

| Camino | Línea | Retorno actual | ¿Lanza? | Naturaleza |
|--------|-------|----------------|---------|------------|
| Carrito vacío | 130 | `undefined` | ❌ | Abortado |
| Cobro sin datos de pago | 136 | `undefined` | ❌ | **Navegación** (abre checkout) |
| Folio ya pagado | 197 | `undefined` | ❌ | Abortado |
| Auto-heal 409 exitoso | 232 | `undefined` | ❌ | Abortado |
| **Verificación post-envío falla** | **270** | **`undefined`** | **❌** | **Abortado (peligroso)** |
| **Error de verificación (catch)** | **276** | **`undefined`** | **❌** | **Abortado (peligroso)** |
| Éxito real | 302 | `undefined` | ❌ | Éxito |
| Error de red agotado | 312 | — | ✅ `throw` | Error |

**El problema:** Solo el error de red lanza excepción. Los fallos de **negocio** (verificación fallida, folio pagado, auto-heal) retornan `undefined` silenciosamente.

### 3.2 El consumidor asume que "no lanzar" = "éxito"

```javascript
// RetailVisionPOS.jsx:359 — handleSendThenExit (código actual)
await handleTicketAction('OPEN');
// ⛔ Asume que si no lanzó, se envió. FALSO.
if (pendingExitAction) {
    pendingExitAction();   // Ejecuta logout/cambio aunque el envío falló
    setPendingExitAction(null);
}
```

### 3.3 Escenario de fallo real

```
T=0s    Cajera captura cuenta de $453 en T3
T=30s   Presiona "Cerrar Sesión"
T=31s   Modal aparece → clic en "📌 Enviar al Pizarrón y salir"
T=32s   handleTicketAction('OPEN') → createTicket() responde HTTP 200
T=33s   Verificación post-envío: GET /tickets/by-account/V34538 → 404
        → setToastMessage('⚠️ El ticket NO se encontró...')
        → return;  (SIN lanzar excepción)
T=34s   handleSendThenExit: "no lanzó → éxito" → pendingExitAction()
        → setIsAuthenticated(false) → LOGOUT
T=35s   La cuenta de $453 se pierde. 💀
```

**Este es exactamente el incidente "Cuenta Fantasma $453" (Sección 3 de la doc POS) reapareciendo por otra puerta.**

---

## 4. ESTRATEGIA DE CORRECCIÓN

### 4.1 Principios de diseño (v3)

1. **Contrato de resultado discriminado:** `{ outcome: 'success' | 'aborted' | 'navigated', reason?: string }`. Separa fallo de navegación.
2. **Fail-safe por defecto:** Ante duda, **NO salir**.
3. **Duplicación explícita > abstracción oculta:** la lista de limpieza se duplica con un comentario de espejo; la condición de intercepción se duplica (1 línea).
4. **Fire-and-forget para lo no bloqueante:** el force logout usa `sendBeacon`, nunca `await`.
5. **No memoizar lo que no está memoizado:** no usar `handleTicketAction` en deps de `useCallback`.
6. **Sin nuevas dependencias ni timers.**
7. **Cada fase = 1 commit atómico reversible.**

### 4.2 Orden de ejecución

```
FASE 1 (contrato)  →  FASE 2 (consumidor)  →  FASE 3 (limpieza espejo)
   →  FASE 4 (backdrop)  →  FASE 5 (force logout + beacon)  →  FASE 6 (tests)
```

**El contrato va PRIMERO** (corrige N3: el consumidor necesita una señal fiable, no un ref con carrera).

---

## 5. PLAN DE FASES

### 🔧 FASE 1 — Contrato de resultado discriminado en `handleTicketAction`

**Archivo:** [`apps/pos/hooks/useTicketActions.js`](apps/pos/hooks/useTicketActions.js:112)
**Riesgo:** 🟡 Medio (toca el hook maestro)
**Reversible:** Sí
**Depende de:** Nada (aditivo)

**Cambio:** Devolver `{ outcome, reason? }` en **todos** los caminos no-throw:

```javascript
// Carrito vacío (línea 130)
return { outcome: 'aborted', reason: 'empty_cart' };

// Cobro sin datos de pago (línea 136) — NAVEGACIÓN, no fallo
return { outcome: 'navigated', reason: 'needs_payment' };

// Folio ya pagado (línea 197)
return { outcome: 'aborted', reason: 'already_paid' };

// Auto-heal 409 exitoso (línea 232)
return { outcome: 'aborted', reason: 'version_conflict_recovered' };

// Verificación post-envío falla (línea 270)
return { outcome: 'aborted', reason: 'verification_failed' };

// Error de verificación en catch (línea 276)
return { outcome: 'aborted', reason: 'verification_failed' };

// Éxito real (línea 302, tras clearCart)
return { outcome: 'success' };

// Guardado sin finalizar UI (finalizeUI === false)
return { outcome: 'success', reason: 'not_finalized' };

// Error de red agotado (línea 312) — SIN CAMBIO
throw error;
```

**Justificación de diseño:**
- **`navigated` ≠ `aborted`:** el camino `needs_payment` **abre la pantalla de cobro** ([`useTicketActions.js:135`](apps/pos/hooks/useTicketActions.js:135)). Marcarlo como `aborted` sería una trampa semántica. Con `navigated`, un consumidor genérico sabe que **no es un error**.
- **`finalizeUI === false`:** cuando es `false`, el bloque de limpieza ([`useTicketActions.js:257`](apps/pos/hooks/useTicketActions.js:257)) no se ejecuta. El retorno `{ outcome: 'success', reason: 'not_finalized' }` refleja la verdad.
- **No se elimina el `throw`** del error de red: los consumidores actuales dependen de él para sus `try/catch`.
- Los retornos son **aditivos**: cualquier código que hoy hace `await handleTicketAction(...)` sin leer el retorno sigue funcionando idéntico.

**Verificación de no-regresión (obligatoria):**
- `grep` de todos los call-sites. Confirmados 4:
  - [`RetailVisionPOS.jsx:362`](apps/pos/RetailVisionPOS.jsx:362) — exit modal (Fase 2 lo usará)
  - [`RetailVisionPOS.jsx:494`](apps/pos/RetailVisionPOS.jsx:494) — `handleCheckout` → `PAID` (ignora el retorno)
  - [`RetailVisionPOS.jsx:495`](apps/pos/RetailVisionPOS.jsx:495) — `handleHoldAccount` → `OPEN` (ignora el retorno)
  - [`RetailVisionPOS.jsx:508`](apps/pos/RetailVisionPOS.jsx:508) — `CheckoutScreen onConfirm` (ignora el retorno)
- **Ninguno depende de que retorne `undefined`.** El cambio es seguro.

---

### 🔧 FASE 2 — `handleSendThenExit` fail-safe vía contrato (corrige BUG 1)

**Archivo:** [`apps/pos/RetailVisionPOS.jsx`](apps/pos/RetailVisionPOS.jsx:359)
**Riesgo:** 🟢 Bajo (función aislada)
**Reversible:** Sí
**Depende de:** FASE 1

**Cambio:**

```javascript
const handleSendThenExit = async () => {
    setShowExitModal(false);
    try {
        const result = await handleTicketAction('OPEN');

        // ⛔ FAIL-SAFE: usar el CONTRATO (no el ref — evita la carrera N3).
        // Solo se sale si el envío fue verificado (outcome === 'success').
        if (result?.outcome !== 'success') {
            const mensajes = {
                verification_failed: '⚠️ El envío no se pudo verificar. La cuenta NO se envió. Reintente o revise la conexión.',
                already_paid: '⚠️ Este folio ya fue cobrado. Recupere la cuenta del Pizarrón.',
                version_conflict_recovered: '⚠️ Otro vendedor modificó la cuenta. Revise los cambios y reintente.',
                empty_cart: '⚠️ La cuenta está vacía.',
                needs_payment: '⚠️ Complete el cobro primero.',
            };
            setToastMessage(mensajes[result?.reason] || '⚠️ No se pudo enviar la cuenta. Intente de nuevo.');
            setTimeout(() => setToastMessage(null), 10000);
            setPendingExitAction(null); // El usuario se queda
            return;
        }

        // ✅ Envío verificado → ejecutar la salida pendiente
        if (pendingExitAction) {
            pendingExitAction();
            setPendingExitAction(null);
        }
    } catch (e) {
        // Error de red agotado — NO salir, el carrito sigue intacto
        console.error('Error enviando al pizarrón antes de salir:', e);
        setToastMessage('❌ No se pudo enviar al Pizarrón. La cuenta NO se envió. Intente de nuevo.');
        setTimeout(() => setToastMessage(null), 10000);
        setPendingExitAction(null);
    }
};
```

**Justificación:**
- **Usa el contrato, no `cartRef`** → elimina la carrera N3 (el ref se sincroniza por `useEffect` y puede estar desactualizado).
- Cumple **Regla de Oro 3 (Zero-Loss)** y **Regla 12 (Verificación Post-Envío)**.
- El usuario **permanece en el POS** con el carrito intacto.

**Verificación de no-regresión:**
- El camino de éxito es idéntico al actual (envío verificado → salir).
- El camino de fallo ahora es seguro (antes perdía la cuenta).
- **No toca `useTicketActions.js`** en esta fase.

---

### 🔧 FASE 3 — `handleExitWithoutSaving` limpia el estado (corrige BUG 2)

**Archivo:** [`apps/pos/RetailVisionPOS.jsx`](apps/pos/RetailVisionPOS.jsx:375)
**Riesgo:** 🟢 Bajo
**Reversible:** Sí

**Cambio:** Lista **explícita** (sin helper — evita el riesgo N4):

```javascript
const handleExitWithoutSaving = () => {
    setShowExitModal(false);
    // El usuario eligió EXPLÍCITAMENTE perder la cuenta.
    // ⚠️ MANTENER EN ESPEJO con useTicketActions.js:280-290
    // (si se añade un campo allí, añadirlo aquí también).
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
    } catch (e) {
        console.warn('Error limpiando persistencia al salir sin enviar:', e);
    }
    if (pendingExitAction) {
        pendingExitAction();
        setPendingExitAction(null);
    }
};
```

**Justificación:**
- **Lista explícita y espejo** de la de `handleTicketAction` ([`useTicketActions.js:280-290`](apps/pos/hooks/useTicketActions.js:280)). La duplicación es **visible y testeable** (Fase 6 verifica la paridad).
- **Incluye `orderData`, `orderType`, `lastSaveTime`** — la v1 los omitía, dejando el `orderType` pegado en `'PEDIDO'`.
- **No duplica** `localStorage.removeItem('pos_cart_...')`: `clearCart()` ya lo hace ([`useCart.js:141`](apps/pos/hooks/useCart.js:141)).
- **No extrae un helper** → evita el riesgo N4 de desincronización de refs.

**Verificación de no-regresión:**
- Los setters son los mismos que ya usa `handleTicketAction` en éxito.
- `clearCart()` sigue siendo idempotente.
- No afecta el flujo normal de captura.

---

### 🔧 FASE 4 — Cerrar el backdrop sin dejar acción huérfana (corrige BUG 3)

**Archivo:** [`apps/pos/RetailVisionPOS.jsx`](apps/pos/RetailVisionPOS.jsx:559)
**Riesgo:** 🟢 Bajo
**Reversible:** Sí

```javascript
// Antes (línea 559):
<div className="absolute inset-0 bg-black/70" onClick={() => setShowExitModal(false)} />

// Después:
<div
    className="absolute inset-0 bg-black/70"
    onClick={() => { setShowExitModal(false); setPendingExitAction(null); }}
/>
```

**Justificación:**
- Evita que una acción vieja quede en `pendingExitAction` y se ejecute en un modal futuro.
- Consistente con el botón "Cancelar — quedarme" ([`RetailVisionPOS.jsx:593-596`](apps/pos/RetailVisionPOS.jsx:593)).

**Verificación de no-regresión:**
- Cambio puramente defensivo, sin efecto en el camino feliz.

---

### 🔧 FASE 5 — Force logout con `sendBeacon` + filtrado por terminal (corrige BUG 4 y BUG 5)

**Archivos:**
- [`apps/pos/RetailVisionPOS.jsx`](apps/pos/RetailVisionPOS.jsx:553)
- [`apps/pos/hooks/useBeforeUnload.js`](apps/pos/hooks/useBeforeUnload.js:38)
- [`apps/api/modules/pos/router.py`](apps/api/modules/pos/router.py:429) (backend)

**Riesgo:** 🟡 Medio (afecta expulsión + backend)
**Reversible:** Sí

**Paso 5.1 — `handleForceLogout` con `sendBeacon` (fire-and-forget):**

```javascript
// En RetailVisionPOS.jsx — SIN useCallback (evita N1: handleTicketAction no está memoizado)
const handleForceLogout = () => {
    // Best-effort SIN bloquear: sendBeacon es fire-and-forget.
    // NO se usa await handleTicketAction (el mutex + retries bloquearían la expulsión hasta 6.5s — N2).
    if (cartRef.current.length > 0 && accountNumRef.current) {
        try {
            const payload = JSON.stringify({
                account_num: accountNumRef.current,
                items: cartRef.current.map(i => ({ product_id: i.id, quantity: i.quantity || 1 })),
                status: 'OPEN',
                emergency_save: true,
                terminal_id: selectedTerminal,   // ← permite al backend resolver la sesión correcta
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

// Render (línea 553):
<ForceLogoutModal visible={forceLogoutModal} onForceLogout={handleForceLogout} />
```

**Paso 5.2 — `useBeforeUnload`: añadir `terminal_id` al beacon:**

```javascript
// apps/pos/hooks/useBeforeUnload.js:38-43
const payload = JSON.stringify({
    account_num: accountNumRef.current,
    items: cartRef.current.map(i => ({ product_id: i.id, quantity: i.quantity || 1 })),
    status: 'OPEN',
    emergency_save: true,
    terminal_id: selectedTerminalRef.current,   // ← NUEVO (v7.0.3)
});
```

**Paso 5.3 — Backend: filtrar la sesión por terminal:**

```python
# apps/api/modules/pos/router.py:449-459
from sqlalchemy.future import select
from .models import TerminalSession

terminal_id = payload.get("terminal_id")

if terminal_id:
    # v7.0.3: resolver la sesión de la terminal correcta
    result = await db.execute(
        select(TerminalSession)
        .where(TerminalSession.is_active == True)
        .where(TerminalSession.terminal_id == terminal_id)
        .limit(1)
    )
else:
    # Fallback legacy: sin terminal_id, tomar la primera activa
    result = await db.execute(
        select(TerminalSession).where(TerminalSession.is_active == True).limit(1)
    )

session = result.scalars().first()
```

**Justificación:**
- **`sendBeacon` en vez de `await`** → corrige N2 (el mutex + retries bloqueaban la expulsión hasta 6.5s). El usuario sale **inmediatamente**.
- **Sin `useCallback`** → corrige N1 (`handleTicketAction` no está memoizado; usarlo en deps causaría re-renders).
- **Reutiliza el endpoint `emergency-save`** ya existente → DRY real, sin abstracciones nuevas.
- **`TerminalSession.terminal_id` VERIFICADO** en [`models.py:21`](apps/api/modules/pos/models.py:21) → el filtro es viable (corrige N5).
- **Se conserva** el `emergency-save` porque es la última línea de defensa (v4.0 ZERO-LOSS). **NO se elimina.**
- **Retrocompatible:** el backend mantiene el fallback legacy si no viene `terminal_id`.
- **No requiere migración** (no hay cambio de esquema).

**Verificación de no-regresión:**
- Si no hay carrito, `handleForceLogout` solo llama a `onForceLogout()` (idéntico al actual).
- El unlock por `sendBeacon` de `useBeforeUnload` (v12) se mantiene intacto.
- El diálogo nativo de `beforeunload` se mantiene intacto.
- El backend mantiene el comportamiento actual si no viene `terminal_id`.

---

### 🔧 FASE 6 — Pruebas y verificación

**Archivos:** `apps/pos/utils/__tests__/` (nuevo) + verificación manual

**Infraestructura verificada:**
- ✅ `@testing-library/react@^14.2.1` ([`package.json:27`](package.json:27))
- ✅ `@testing-library/jest-dom@^6.4.2` ([`package.json:26`](package.json:26))
- ✅ `jsdom@^24.0.0` ([`package.json:32`](package.json:32))
- ✅ `vitest@^2.1.9` ([`package.json:36`](package.json:36))
- ✅ Patrón existente: [`terminalCardState.test.js`](apps/pos/utils/terminalCardState.test.js:1)

**Pruebas unitarias (Vitest):**

1. **Contrato:** `handleTicketAction` retorna `{ outcome: 'success' }` en éxito.
2. **Contrato:** retorna `{ outcome: 'aborted', reason: 'verification_failed' }` cuando la verificación falla.
3. **Contrato:** retorna `{ outcome: 'aborted', reason: 'already_paid' }` en folio pagado.
4. **Contrato:** retorna `{ outcome: 'navigated', reason: 'needs_payment' }` cuando falta el pago (no `aborted`).
5. **Contrato:** retorna `{ outcome: 'success', reason: 'not_finalized' }` con `finalizeUI=false`.
6. **Paridad de listas:** verificar que la lista de limpieza de `handleExitWithoutSaving` es **idéntica** a la de `handleTicketAction` (test de contrato — protege contra la divergencia).
7. **Beacon:** `handleForceLogout` llama a `navigator.sendBeacon` con `terminal_id` y **no** espera a `handleTicketAction`.

> **Nota:** Las pruebas 1-5 requieren mockear `posService`. Seguir el patrón de [`terminalCardState.test.js`](apps/pos/utils/terminalCardState.test.js:1). La prueba 6 puede ser un test de snapshot de la lista de setters.

**Verificación manual (obligatoria antes de declarar terminado):**

1. **Camino feliz:** Capturar cuenta → Cerrar Sesión → "Enviar y salir" → verificar que la cuenta aparece en el Pizarrón y el usuario salió.
2. **Fallo de verificación:** Simular caída de red tras el `createTicket` → "Enviar y salir" → verificar que el usuario **NO** sale y ve el error.
3. **Salir sin enviar:** Capturar cuenta → "Salir sin enviar" → verificar que el carrito se limpia y no reaparece.
4. **Salir sin enviar con PEDIDO:** Capturar un PEDIDO → "Salir sin enviar" → verificar que el siguiente ticket es `VENTA_DIRECTA`.
5. **Cambio de módulo:** Capturar cuenta → clic en otro módulo → verificar que aparece el modal.
6. **Cambio de terminal:** Capturar cuenta → botón de salir de terminal → verificar modal.
7. **Cierre de pestaña:** Capturar cuenta → F5 → verificar diálogo nativo del navegador.
8. **Force logout:** Capturar cuenta → forzar liberación desde admin → verificar que (a) la expulsión es **inmediata** (sin espera de 6.5s) y (b) la cuenta se guardó.
9. **POS normal:** Agregar/cambiar/borrar productos → verificar que la persistencia atómica sigue funcionando (Reglas 15, 16).

**Comandos de aceptación:**
```bash
npx vitest run          # Debe pasar sin regresiones
npm run build           # Debe salir con exit 0
```

**Verificación de zona restringida:**
```bash
git diff --name-only    # Confirmar que SOLO se tocaron los archivos del plan
```

---

## 6. ARCHIVOS AFECTADOS (RESUMEN)

| Archivo | Fases | Riesgo | Zona Restringida |
|---------|-------|--------|------------------|
| [`apps/pos/hooks/useTicketActions.js`](apps/pos/hooks/useTicketActions.js:1) | 1 | 🟡 Medio | ✅ Sí |
| [`apps/pos/RetailVisionPOS.jsx`](apps/pos/RetailVisionPOS.jsx:1) | 2, 3, 4, 5 | 🟡 Medio | ✅ Sí |
| [`apps/pos/hooks/useBeforeUnload.js`](apps/pos/hooks/useBeforeUnload.js:1) | 5 | 🟢 Bajo | ✅ Sí |
| [`apps/api/modules/pos/router.py`](apps/api/modules/pos/router.py:1) | 5 | 🟡 Medio | ✅ Sí |
| `apps/pos/utils/__tests__/*.test.js` (nuevo) | 6 | 🟢 Bajo | ❌ No |

**Archivos que NO se tocan (explícitamente):**
- [`apps/pos/hooks/useCart.js`](apps/pos/hooks/useCart.js:1) — la máquina anti-wipe está intacta.
- [`apps/pos/hooks/useTerminalLocking.js`](apps/pos/hooks/useTerminalLocking.js:1) — los locks no se tocan.
- [`apps/pos/hooks/usePOSSession.js`](apps/pos/hooks/usePOSSession.js:1) — no se toca.
- [`apps/api/modules/pos/service.py`](apps/api/modules/pos/service.py:1) — el backend no requiere cambios de servicio.
- [`apps/api/modules/pos/occupancy.py`](apps/api/modules/pos/occupancy.py:1) — no se toca.
- [`apps/ExperimentCenterUI.jsx`](apps/ExperimentCenterUI.jsx:1) — el puente `attemptNavigation` ya funciona correctamente.
- [`apps/pos/components/POSOverlays.jsx`](apps/pos/components/POSOverlays.jsx:1) — la Fase 5 envuelve el callback desde el padre, sin tocar el componente.

---

## 7. CUMPLIMIENTO DE LAS REGLAS DE ORO DEL POS

| Regla | ¿Se respeta? | Cómo |
|-------|--------------|------|
| 1. useRef vs closures | ✅ | Se sigue leyendo de `cartRef.current`, `accountNumRef.current` |
| 2. Mutex en acciones finales | ✅ | `handleTicketAction` mantiene `actionMutexRef` intacto; el force logout **no** lo usa (sendBeacon) |
| 3. Zero-Loss | ✅ **MEJORA** | Fases 2 y 5 impiden perder cuentas |
| 4. Candado Anti-Wipe | ✅ | No se toca `useCart.js` |
| 5. DRAFT vs OPEN | ✅ | No se altera la lógica de estados |
| 6. Exit Modal | ✅ **MEJORA** | Se corrige y endurece |
| 7. Draft Guard | ✅ | No se toca el backend de drafts |
| 8. Garbage Collector | ✅ | No se toca |
| 9. Sync de `cartRef` | ✅ | No se altera |
| 10. Búsqueda exacta | ✅ | No se altera |
| 11. Reciclaje 5 min | ✅ | No se altera |
| 12. Verificación Post-Envío | ✅ **MEJORA** | Fase 2 usa el contrato de verificación para bloquear la salida |
| 13. Bloqueo de botón | ✅ | No se altera |
| 14. Inmutabilidad de terminal | ✅ | No se altera |
| 15. Respuesta ligera | ✅ | No se altera |
| 16. Retries simétricos | ✅ | No se altera |
| 17. Auto-reconciliación | ✅ | No se altera |
| 18. Retries en checkout | ✅ | No se altera |

**Ninguna regla se viola. Las Reglas 3, 6 y 12 se refuerzan.**

---

## 8. RIESGOS Y MITIGACIONES

| Riesgo | Prob. | Mitigación |
|--------|-------|------------|
| Cambio de contrato de `handleTicketAction` rompe un consumidor | Baja | Retorno aditivo; los 4 call-sites ignoran el retorno (verificado). |
| El modal bloquea al usuario en un bucle si la red está caída | Media | El botón "Salir sin enviar" **siempre** está disponible como escape. |
| Regresión en el flujo de checkout | **Muy baja** | El contrato usa `navigated` (no `aborted`) para `needs_payment`. |
| Las listas de limpieza divergen en el futuro | Media | Comentario de espejo + test de paridad (Fase 6, prueba 6). |
| `sendBeacon` no llega (navegador cerrado) | Media | Es **best-effort** por diseño; el diálogo nativo de `beforeunload` es la defensa primaria. |
| El backend no filtra bien por `terminal_id` | Baja | Campo **verificado** en [`models.py:21`](apps/api/modules/pos/models.py:21); fallback legacy si no viene. |
| `handleForceLogout` se recrea en cada render | **Nula** | Es una función plana sin `useCallback` → no hay deps que provoquen bucles (corrige N1). |
| El force logout bloquea la UI | **Nula** | `sendBeacon` es fire-and-forget → expulsión inmediata (corrige N2). |

---

## 9. CRITERIOS DE ACEPTACIÓN

La corrección se considera completa cuando:

- [ ] `handleTicketAction` retorna `{ outcome, reason }` en todos los caminos no-throw (Fase 1).
- [ ] El camino `needs_payment` retorna `outcome: 'navigated'` (no `aborted`) (Fase 1).
- [ ] El camino `finalizeUI === false` retorna `{ outcome: 'success', reason: 'not_finalized' }` (Fase 1).
- [ ] `handleSendThenExit` NO ejecuta la salida si `result.outcome !== 'success'` (Fase 2).
- [ ] `handleExitWithoutSaving` limpia la lista espejo completa (incluye `orderData`/`orderType`/`lastSaveTime`) (Fase 3).
- [ ] El backdrop del modal limpia `pendingExitAction` (Fase 4).
- [ ] `handleForceLogout` usa `sendBeacon` y **no** espera a `handleTicketAction` (Fase 5).
- [ ] `emergency-save` recibe `terminal_id` y filtra la sesión (Fase 5).
- [ ] `npx vitest run` pasa sin regresiones (Fase 6).
- [ ] `npm run build` sale con exit 0 (Fase 6).
- [ ] `git diff --name-only` muestra solo los archivos del plan.
- [ ] Verificación manual de los 9 escenarios de la Fase 6.
- [ ] El POS de Panadería sigue operando normalmente (smoke test).

---

## 10. PROTOCOLO DE RESPALDO

Tras completar y validar todas las fases (Sección 2.1 del Contexto Maestro):

1. **Sugerir Push** al repositorio oficial `vikutasan/ERP-R-DE-RICO-CON-POS-SIMPLIFICADO`.
2. **Número de versión propuesto:** `v7.0.3` (parche — corrección de bugs del modal de salida).
3. **Mejoras respaldadas:**
   - Fail-safe en el modal de salida (imposible perder cuenta por fallo silencioso).
   - Contrato de resultado discriminado en `handleTicketAction`.
   - Limpieza completa del estado de captura al "salir sin enviar".
   - Emergency-save no bloqueante antes del force logout.
   - Endurecimiento del `emergency-save` multi-terminal.

---

## 11. NOTA FINAL

Este plan **no cambia la arquitectura** del POS (v6.0/v7.0). Solo corrige defectos en la capa de intercepción de salida, respetando la persistencia atómica y las 18 Reglas de Oro. Cada fase es un commit atómico reversible.

**Diferencia clave con la v2:** la v3 **elimina las abstracciones que introdujeron riesgos** (helper compartido, bridge unificado, `useCallback` sobre funciones no memoizadas, `await` sobre el mutex). Prioriza **no romper nada** sobre la elegancia arquitectónica.

**Diferencia clave con la v1:** la v3 corrige los 8 hallazgos de la 1ª revisión y los 6 de la 2ª, y **verifica** las suposiciones (campo `terminal_id`, import de `CONFIG`, infraestructura de tests) en vez de asumirlas.

> **Pendiente:** Aprobación del Socio Fundador antes de ejecutar cualquier fase.
