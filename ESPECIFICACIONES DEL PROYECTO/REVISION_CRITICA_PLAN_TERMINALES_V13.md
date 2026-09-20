# 🔍 REVISIÓN CRÍTICA — PLAN DE CORRECCIÓN TERMINALES v13

> **Revisor:** Auto-revisión crítica (modo adversarial).
> **Fecha:** 2026-09-20
> **Objeto:** [`PLAN_CORRECCION_TERMINALES_V13.md`](PLAN_CORRECCION_TERMINALES_V13.md:1)
> **Veredicto global:** ⚠️ **NO EJECUTAR TAL CUAL.** El plan contiene **2 errores de hecho graves**, **1 riesgo no mitigado** y **3 omisiones**. Requiere reformulación a v14.

---

## RESUMEN EJECUTIVO

El plan v13 es correcto en su **filosofía** (conservador, reutiliza infraestructura, no rompe nada) pero **falla en la verificación de sus propias afirmaciones**. Encontré:

| # | Tipo | Severidad | Fase afectada |
|---|------|-----------|---------------|
| C1 | **Error de hecho** — el "riesgo" de H1 no existe como se describe | 🔴 Crítico | Fase 3 |
| C2 | **Error de hecho** — H1 mal diagnosticado: el bug real es distinto | 🔴 Crítico | Fase 3 |
| C3 | **Riesgo no mitigado** — `useNetworkHealth` tiene el MISMO anti-patrón y no se toca | 🟠 Alto | Fase 3 (omisión) |
| C4 | **Omisión** — `usePOSSession` también depende de `currentUser` | 🟠 Alto | Fase 3 (omisión) |
| C5 | **Contradicción interna** — Fase 5 dice "añadir log" pero el código mostrado NO añade log | 🟡 Medio | Fase 5 |
| C6 | **Afirmación no verificada** — "en Docker el valor es idéntico" no está probado | 🟡 Medio | Fase 2 |
| C7 | **Test mal especificado** — el test de H1 es implementable, pero no como se describe (verificación posterior) | 🟡 Medio | Fase 7 |
| C8 | **Riesgo de orden** — Fase 6 toca doc que Fase 3 podría invalidar | 🟢 Bajo | Orden |

---

## C1 + C2 — 🔴 ERROR CRÍTICO: H1 está MAL DIAGNOSTICADO

### Lo que dice el plan v13

> "Si el padre envía un objeto en línea, React genera nueva referencia en cada render → los `setInterval` se reinician constantemente."

### La realidad (verificada en código)

Revisé [`ExperimentCenterUI.jsx:508`](../apps/ExperimentCenterUI.jsx:508):

```jsx
<RetailVisionPOS 
    initialCategories={categories} 
    initialProducts={REAL_PRODUCTS}
    currentUser={currentUser}          // ← NO es un objeto en línea
    onForceLogout={() => setIsAuthenticated(false)}
    assignedTerminal={...}
/>
```

**`currentUser` es una variable de estado del padre, NO un objeto en línea.** Por lo tanto:

1. **El escenario de "nueva referencia en cada render" NO ocurre hoy.** El plan describe un riesgo **hipotético**, no un bug activo.
2. **El incidente "Terminal Fantasma v2"** (líneas 240-244 de la doc) se refiere a un caso **histórico ya corregido** donde el padre SÍ enviaba `currentUser={{ id: userId... }}`. Ese padre ya no existe así.
3. **Conclusión:** H1, tal como lo redacté, es un **falso positivo de severidad**. No es 🟠 Medio; es 🟢 Bajo (deuda técnica preventiva, no bug).

### Por qué esto importa

El plan v13 **sobreestima el riesgo de la Fase 3** y la aísla como "la más delicada", cuando en realidad:
- El cleanup crítico (el que causaba pérdida de sesión) **ya está blindado**.
- Los dos efectos señalados **no causan pérdida de sesión** (solo reinician intervalos).
- El "riesgo" de reinicio de intervalos **no se materializa** con el padre actual.

**Corrección necesaria:** Reclasificar H1 de 🟠 a 🟢 y reformular la Fase 3 como **endurecimiento preventivo**, no como corrección de bug.

---

## C3 — 🟠 RIESGO NO MITIGADO: `useNetworkHealth` tiene el MISMO anti-patrón

### Hallazgo de la revisión

[`useNetworkHealth.js:78`](../apps/pos/hooks/useNetworkHealth.js:78):

```js
}, [status, terminalId, currentUser]);   // ← depende del OBJETO currentUser
```

Y se invoca en [`RetailVisionPOS.jsx:59`](../apps/pos/RetailVisionPOS.jsx:59):

```js
const { status: netStatus, latency: netLatency } = useNetworkHealth(15000, selectedTerminal, currentUser);
```

**Este hook tiene EXACTAMENTE el mismo anti-patrón que el plan v13 dice corregir en `useTerminalLocking`.** Sin embargo, el plan **no lo menciona**.

### Por qué es más grave que H1

- `useNetworkHealth` **reporta incidentes al backend** ([`línea 65`](../apps/pos/hooks/useNetworkHealth.js:65)) cuando `status` cambia.
- Si el efecto se re-registra por cambio de referencia de `currentUser`, `prevStatusRef` se mantiene (es un ref), pero el efecto de reporte se re-evalúa.
- **Riesgo real:** reportes de incidentes duplicados o mal atribuidos si `currentUser` cambia de referencia.

**Corrección necesaria:** La Fase 3 debe incluir `useNetworkHealth` o justificar explícitamente por qué se excluye.

---

## C4 — 🟠 OMISIÓN: `usePOSSession` también depende de `currentUser`

### Hallazgo de la revisión

[`usePOSSession.js:19`](../apps/pos/hooks/usePOSSession.js:19) recibe `currentUser` como prop. Revisé su uso interno y **no lo incluye en deps de efectos críticos** (el efecto de `selectedTerminal` en línea 50 solo depende de `selectedTerminal`). 

**Pero:** el plan v13 afirma que la regla del incidente v2 es "los efectos no deben depender de la referencia del objeto `currentUser`". Si esa regla es **global**, entonces el plan es **incompleto** al no auditar TODOS los hooks que reciben `currentUser`.

**Corrección necesaria:** La Fase 3 debe declarar explícitamente el **alcance de la auditoría** (¿solo `useTerminalLocking`? ¿todos los hooks del POS?). Si es solo `useTerminalLocking`, debe justificarse.

---

## C5 — 🟡 CONTRADICCIÓN INTERNA en Fase 5

### Lo que dice el plan v13

> "El problema es solo **observabilidad**: añadir un log informativo cuando el unlock es idempotente"

### El código mostrado

```python
async def unlock_terminal(db, terminal_id, occupier_id) -> bool:
    ...
    return True  # Ya estaba libre (idempotente)
```

**El código mostrado NO añade ningún log.** Es idéntico al código actual. La Fase 5 promete un cambio que su propio snippet no implementa.

**Corrección necesaria:** O bien añadir el `print`/`logger.info` real, o bien reclasificar la Fase 5 como "sin cambio de código, solo documentación" (que es lo que realmente es).

---

## C6 — 🟡 AFIRMACIÓN NO VERIFICADA en Fase 2

### Lo que dice el plan v13

> "En Docker (contenedor en UTC), el valor es **idéntico** al actual → cero cambio de comportamiento en producción."

### El problema

Esta afirmación es **plausible pero no verificada**. No comprobé:
1. La `TZ` real del contenedor `rderico-api-dev` (¿está en UTC o hereda del host?).
2. Si `datetime.now()` y `utcnow()` coinciden en ese contenedor.

**Si el contenedor NO está en UTC** (p. ej. hereda `TZ=America/Mexico_City` del host Windows), entonces el cambio **SÍ altera el comportamiento** y podría:
- Expirar locks antes/después de lo esperado.
- Cambiar el cálculo de `lockAge` en el frontend.

**Corrección necesaria:** La Fase 2 debe incluir un **paso de verificación previo**: `docker compose exec -T api python -c "from datetime import datetime; print(datetime.now())"` para confirmar la TZ del contenedor ANTES de asumir equivalencia.

---

## C7 — 🟡 TEST MAL ESPECIFICADO en Fase 7 (parcialmente resuelto tras verificación)

### Lo que dice el plan v13

> "Test de regresión: renderizar el hook con un `currentUser` que cambia de referencia pero **no** de `id` → el `setInterval` **no** se reinicia (espía sobre `setInterval`)."

### Verificación posterior (actualización de esta revisión)

Tras redactar esta crítica, verifiqué las dependencias reales:

- [`package.json:27`](../package.json:27) → `"@testing-library/react": "^14.2.1"` **SÍ está instalado**.
- [`vitest.config.js:12`](../vitest.config.js:12) → `environment: 'jsdom'`, `globals: true`, `include: ['apps/**/*.test.{js,jsx}']`.

**Por lo tanto, `renderHook` SÍ está disponible.** La premisa original de C7 ("no verifiqué si está instalado") queda **resuelta a favor del plan**: el test ES implementable.

### El problema que permanece

1. **Espiar `setInterval` global sigue siendo frágil** — React y otros hooks también usan timers. El test podría dar falsos positivos/negativos.
2. **El proyecto tiene un patrón establecido distinto**: [`useTicketActions.exitContract.test.js`](../apps/pos/hooks/useTicketActions.exitContract.test.js:36) **extrae funciones puras** (`shouldExitAfterSend`, `buildEmergencyPayload`) y las prueba sin montar componentes. Ese es el estilo dominante del repo.
3. **`useTerminalLocking` no expone lógica pura extraíble** — su valor está en los efectos, no en funciones puras.

**Corrección necesaria (matizada):** La Fase 7 **no necesita** verificar dependencias (ya están). Debe en cambio **elegir explícitamente** entre:
- (a) `renderHook` + espía de timers (posible, pero frágil y contra el estilo del repo), o
- (b) **extraer una función pura** de decisión (p. ej. `shouldRenewLock(lockInfo, userId)`) y testearla — alineado con el patrón existente.

**Recomendación:** opción (b). Es más robusta y consistente con [`useTicketActions.exitContract.test.js`](../apps/pos/hooks/useTicketActions.exitContract.test.js:1).

---

## C8 — 🟢 RIESGO DE ORDEN

El plan ejecuta Fase 6 (documentación) **después** de Fase 3. Pero si la Fase 3 se reformula (por C1/C2), el texto de la Fase 6 sobre H1 quedaría desactualizado. **Corrección:** la documentación debe redactarse al final, tras confirmar el diagnóstico real.

---

## LO QUE EL PLAN v13 HACE BIEN (crédito justo)

Para ser equilibrado, el plan **acierta** en:

1. ✅ **Fase 1 (H3)** — correcta, verificada, bajo riesgo real. El payload de `beforeunload` efectivamente carece de `terminal_id`.
2. ✅ **Fase 2 (H2)** — el diagnóstico es correcto (`datetime.now()` vs `utcnow()`); solo falta verificar la TZ del contenedor (C6).
3. ✅ **Fase 4 (H7)** — correcta; el `.catch()` muerto es real.
4. ✅ **Fase 5 (H8)** — la decisión de NO relajar el 403 es correcta y bien justificada.
5. ✅ **Sección 9** — las prohibiciones explícitas son valiosas y correctas.
6. ✅ **Filosofía conservadora** — el instinto de no romper nada es el correcto.

---

## VEREDICTO

| Aspecto | Evaluación |
|---------|-----------|
| Filosofía | ✅ Correcta |
| Fases 1, 2, 4, 5 | ✅ Correctas (con ajuste menor en 5) |
| Fase 3 | 🔴 **Mal diagnosticada** (C1, C2) + incompleta (C3, C4) |
| Fase 6 | 🟡 Prematura (C8) |
| Fase 7 | 🟡 Tests implementables, pero mal especificados (C7, matizado) |
| Verificación de supuestos | 🔴 **Débil** (C6) |

### Recomendación

**NO ejecutar la v13.** Reformular a **v14** con estos cambios obligatorios:

1. **Reclasificar H1** de 🟠 a 🟢 y reformular Fase 3 como endurecimiento preventivo (no bug).
2. **Ampliar Fase 3** para incluir `useNetworkHealth` (C3) o justificar su exclusión.
3. **Declarar el alcance** de la auditoría de `currentUser` (C4).
4. **Corregir Fase 5** para que el snippet coincida con la promesa (C5).
5. **Añadir paso de verificación de TZ** en Fase 2 antes de asumir equivalencia (C6).
6. **Reescribir la Fase 7** para extraer una función pura testeable (patrón del repo) en lugar de espiar timers globales (C7, matizado: `@testing-library/react` ya está instalado).
7. **Mover la documentación al final** (C8).

### Riesgo residual si se ejecutara la v13 tal cual

- 🟢 **Bajo en producción** — las fases 1, 2, 4, 5 son seguras.
- 🟠 **Medio en mantenibilidad** — la Fase 3 se vendería como "corrección de bug crítico" cuando es deuda técnica, y dejaría `useNetworkHealth` con el mismo patrón, creando **inconsistencia** (un hook corregido, otro no).

---

> **Conclusión:** El plan v13 es un buen borrador con un **error de diagnóstico central** (H1) que infla artificialmente el riesgo y desvía el foco. La corrección más importante no es técnica sino de **rigor**: verificar cada afirmación contra el código antes de clasificar severidades. La v14 debe ser más humilde en sus afirmaciones y más exhaustiva en su auditoría.
