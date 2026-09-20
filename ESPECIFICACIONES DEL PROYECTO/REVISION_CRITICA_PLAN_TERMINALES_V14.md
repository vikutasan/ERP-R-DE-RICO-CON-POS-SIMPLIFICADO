# 🔍 REVISIÓN CRÍTICA — PLAN DE CORRECCIÓN TERMINALES v14

> **Revisor:** Auto-revisión crítica (modo adversarial), con verificación línea-por-línea contra el código real.
> **Fecha:** 2026-09-20
> **Objeto:** [`PLAN_CORRECCION_TERMINALES_V14.md`](PLAN_CORRECCION_TERMINALES_V14.md:1)
> **Veredicto global:** ⚠️ **NO EJECUTAR TAL CUAL.** Contiene **1 error de hecho grave** (Fase 3.4) y **2 riesgos de regresión** no advertidos. Requiere v15.

---

## RESUMEN EJECUTIVO

La v14 corrigió las 8 críticas de la v13, pero **introdujo un error nuevo** al ampliar el alcance a `useNetworkHealth` sin verificar su código. Además, la verificación reveló **2 riesgos de regresión** que la v14 no menciona.

| # | Tipo | Severidad | Fase afectada |
|---|------|-----------|---------------|
| **D1** | **Error de hecho** — `useNetworkHealth` NO tiene el anti-patrón que la v14 dice corregir | 🔴 Crítico | Fase 3.4 |
| **D2** | **Riesgo de regresión** — cambiar deps del heartbeat puede **detener el heartbeat** al cambiar de terminal | 🔴 Crítico | Fase 3.3 |
| **D3** | **Riesgo de regresión** — `useNetworkHealth` reporta incidentes con `currentUser?.name`; cambiar deps altera la atribución | 🟠 Alto | Fase 3.4 |
| **D4** | **Error de hecho** — `usePOSSession` SÍ depende de `currentUser` (en `useCallback`, línea 158) | 🟠 Alto | Fase 3.5 |
| **D5** | **Omisión** — el plan no advierte que `useBeforeUnload` tiene un **segundo** `useEffect` con deps `[currentUser]` | 🟡 Medio | Fase 1 |
| **D6** | **Riesgo** — el Paso 0 de TZ usa `docker compose exec api`, pero el servicio se llama `rderico-api-dev` | 🟡 Medio | Fase 2 |
| **D7** | **Inconsistencia** — la Fase 5 dice "solo comentarios" pero la Fase 7 añade tests que asumen comportamiento | 🟢 Bajo | Fases 5/7 |

---

## D1 — 🔴 ERROR CRÍTICO: `useNetworkHealth` NO tiene el anti-patrón

### Lo que dice la v14 (Fase 3.4)

> "`useNetworkHealth.js:78` tiene el mismo anti-patrón; se cambia `currentUser` por `currentUserId` en las deps."

### La realidad (verificada en código)

[`useNetworkHealth.js:55-78`](../apps/pos/hooks/useNetworkHealth.js:55):

```js
const prevStatusRef = useRef('good');
useEffect(() => {
    if (!terminalId) return;
    if (status === prevStatusRef.current) return;   // ← GUARDA DE IDEMPOTENCIA
    ...
    prevStatusRef.current = status;
}, [status, terminalId, currentUser]);
```

**El efecto tiene una guarda de idempotencia** (`if (status === prevStatusRef.current) return;`) que hace que **re-ejecutarse sea inofensivo**: si el efecto se re-registra por cambio de referencia de `currentUser`, la guarda lo aborta inmediatamente porque `status` no cambió.

**Conclusión:**
1. **NO hay bug de reportes duplicados.** La v14 (y mi crítica C3 de la revisión anterior) **sobreestimaron** el riesgo.
2. El cambio propuesto **no aporta beneficio** y **sí introduce riesgo** (ver D3).
3. **Corrección necesaria:** **REVERTIR** la Fase 3.4. `useNetworkHealth` debe quedar **fuera del alcance**, documentando por qué (tiene guarda de idempotencia).

> **Lección:** mi crítica C3 fue un falso positivo. Ampliar el alcance sin leer el código completo introdujo un error nuevo. La v15 debe **reducir** el alcance, no ampliarlo.

---

## D2 — 🔴 RIESGO DE REGRESIÓN: el heartbeat puede detenerse al cambiar de terminal

### El problema

La v14 (Fase 3.3) propone:

```js
useEffect(() => {
    if (!selectedTerminal || !currentUserId) return;
    const sendHeartbeat = () => {
        posService.heartbeatTerminal(selectedTerminal, currentUserRef.current?.id)
            .catch(...);
    };
    sendHeartbeat();
    const intervalId = setInterval(sendHeartbeat, settings.heartbeatInterval);
    return () => clearInterval(intervalId);
}, [selectedTerminal, currentUserId, settings.heartbeatInterval]);
```

**Escenario de fallo:** si `currentUser` cambia de **referencia** pero el `id` es el mismo (p. ej. el padre hace `setCurrentUser({...user, lastSeen: Date.now()})`), entonces:
- `currentUserId` (primitivo) **NO cambia** → el efecto **NO se re-registra** → el heartbeat **sigue corriendo**. ✅ Correcto.

Pero el **riesgo real** es distinto y la v14 no lo advierte:

**El `sendHeartbeat` lee `currentUserRef.current?.id` en cada tick.** Si el usuario cambia (logout/login rápido) y el `id` cambia, el efecto se re-registra (por `currentUserId`) y **el cleanup borra el intervalo anterior**. Correcto.

**Sin embargo:** si el `id` cambia **mientras** el intervalo está corriendo, entre el cambio de `currentUserRef.current` y la re-ejecución del efecto, **un tick podría enviar el heartbeat con el id NUEVO a la terminal VIEJA**. Esto ya ocurre hoy (no es regresión), pero la v14 **no lo documenta** y podría dar falsa confianza.

**Corrección necesaria:** la v15 debe **documentar explícitamente** que el heartbeat usa `currentUserRef.current?.id` (valor vivo) y que el cleanup por `currentUserId` garantiza que no queden intervalos huérfanos. Añadir un test que verifique que **al cambiar `selectedTerminal` el intervalo anterior se limpia** (esto es lo crítico, no el cambio de `currentUser`).

> **Nota:** el riesgo es **preexistente**, no introducido por la v14. Pero la v14 lo ignora y vende la Fase 3 como "endurecimiento seguro". La v15 debe ser honesta.

---

## D3 — 🟠 RIESGO: cambiar deps de `useNetworkHealth` altera la atribución de incidentes

### El problema

[`useNetworkHealth.js:71`](../apps/pos/hooks/useNetworkHealth.js:71):

```js
user_logged: currentUser?.name || currentUser?.username || String(currentUser?.id || 'Unknown'),
```

El reporte de incidentes usa el **nombre** del usuario, no solo el `id`. Si la v14 cambia las deps a `currentUserId` pero **deja el cuerpo leyendo `currentUser?.name`**, entonces:

- El efecto **NO se re-registra** cuando cambia el nombre (sin cambiar el id).
- Pero el cuerpo **sí lee** `currentUser?.name` del closure **obsoleto** → reportaría el **nombre viejo**.

**Corrección necesaria:** si se toca este hook (lo cual D1 recomienda NO hacer), habría que introducir un `currentUserRef` para leer el nombre vivo. **Esto confirma que la Fase 3.4 debe revertirse por completo.**

---

## D4 — 🟠 ERROR DE HECHO: `usePOSSession` SÍ depende de `currentUser`

### Lo que dice la v14 (Fase 3.5)

> "`usePOSSession`: verificado sin cambio. No usa `currentUser` en deps de efectos."

### La realidad (verificada en código)

[`usePOSSession.js:158`](../apps/pos/hooks/usePOSSession.js:158):

```js
const generateNewAccountNum = useCallback(async () => {
    ...
    const ticket = await posService.reserveTicket(terminalId, currentUser?.id || null);
    ...
}, [selectedTerminal, currentUser]);   // ← SÍ depende de currentUser
```

**`usePOSSession` SÍ tiene `currentUser` en las deps de un `useCallback`** (no de un `useEffect`, pero es el mismo anti-patrón). La v14 lo declara "verificado sin cambio" — **es falso**.

**Impacto:** `generateNewAccountNum` se recrea cuando cambia la referencia de `currentUser`. Como se pasa a componentes hijos, podría causar re-renders innecesarios. **No es crítico** (no hay timers), pero la afirmación de la v14 es incorrecta.

**Corrección necesaria:** la v15 debe **corregir la afirmación**: `usePOSSession` tiene el anti-patrón en un `useCallback`; se puede cambiar a `[selectedTerminal, currentUserId]` con bajo riesgo, o documentar explícitamente por qué se deja.

---

## D5 — 🟡 OMISIÓN: `useBeforeUnload` tiene un segundo `useEffect` con deps `[currentUser]`

### El hallazgo

[`useBeforeUnload.js:27-29`](../apps/pos/hooks/useBeforeUnload.js:27):

```js
useEffect(() => {
    currentUserRef.current = currentUser;
}, [currentUser]);
```

Este efecto **sí depende del objeto `currentUser`** y se re-ejecuta en cada cambio de referencia. Es **inofensivo** (solo asigna un ref), pero la v14 no lo menciona al auditar el hook en la Fase 1.

**Corrección necesaria:** la v15 debe mencionarlo como "verificado, inofensivo" para que la auditoría sea completa y honesta.

---

## D6 — 🟡 RIESGO: el nombre del servicio Docker en el Paso 0

### El problema

La v14 (Fase 2, Paso 0) propone:

```bash
docker compose exec -T api python -c "..."
```

Pero el servicio se llama **`rderico-api-dev`** (según el contexto del proyecto), no `api`. El comando **fallaría** con "no such service: api".

**Corrección necesaria:** la v15 debe usar el nombre correcto:

```bash
docker compose exec -T rderico-api-dev python -c "from datetime import datetime, timezone; print('now=', datetime.now()); print('utc=', datetime.now(timezone.utc))"
```

---

## D7 — 🟢 INCONSISTENCIA entre Fase 5 y Fase 7

La Fase 5 dice "solo comentarios, cero cambio de comportamiento", pero la Fase 7 propone tests que verifican el comportamiento del 403. **No es contradictorio**, pero la v14 debería aclarar que esos tests son de **no-regresión** (verifican que NO cambió), no de funcionalidad nueva.

---

## LO QUE LA v14 HACE BIEN (crédito justo)

| Fase | Evaluación |
|------|-----------|
| **Fase 1 (H3)** | ✅ Correcta. Verificado: el payload de `beforeunload` ([`línea 38`](../apps/pos/hooks/useBeforeUnload.js:38)) carece de `terminal_id`; el backend lo lee ([`router.py:442`](../apps/api/modules/pos/router.py:442)) con fallback ([`línea 463`](../apps/api/modules/pos/router.py:463)). El ref ya existe ([`línea 20`](../apps/pos/hooks/useBeforeUnload.js:20)). |
| **Fase 2 (H2)** | ✅ Correcta. Verificado: `datetime.now()` en [`occupancy.py:18,55,65,116`](../apps/api/modules/pos/occupancy.py:18) y [`router.py:255`](../apps/api/modules/pos/router.py:255). `utcnow()` retorna naive ([`timestamps.py:29`](../apps/api/core/timestamps.py:29)) → compatible con `DateTime` sin tz. |
| **Fase 3.2 (checkMyLock)** | ✅ Correcta. Verificado: deps `[selectedTerminal, currentUser, ...]` en [`línea 110`](../apps/pos/hooks/useTerminalLocking.js:110); el cuerpo usa `currentUser?.id` ([`líneas 87,95`](../apps/pos/hooks/useTerminalLocking.js:87)). Cambiar a `currentUserId` es seguro. |
| **Fase 4 (H7)** | ✅ Correcta. Verificado: [`POSService.js:123`](../apps/pos/services/POSService.js:123) retorna `res.ok` sin lanzar; el `.catch()` de [`useTerminalLocking.js:131`](../apps/pos/hooks/useTerminalLocking.js:131) es código muerto. |
| **Fase 5 (H8)** | ✅ Correcta. Verificado: [`occupancy.py:85`](../apps/api/modules/pos/occupancy.py:85) retorna `True` si no hay lock; [`router.py:318`](../apps/api/modules/pos/router.py:318) responde 403 solo si `False`. |
| **Fase 6 (doc)** | ✅ Correcta en intención. |
| **Fase 7 (tests)** | ✅ Correcta en enfoque (funciones puras). |

---

## VEREDICTO

| Aspecto | Evaluación |
|---------|-----------|
| Fases 1, 2, 4, 5, 6 | ✅ Correctas y verificadas |
| Fase 3.2 (`checkMyLock`) | ✅ Correcta |
| Fase 3.3 (heartbeat) | 🟠 Correcta pero **riesgo no documentado** (D2) |
| Fase 3.4 (`useNetworkHealth`) | 🔴 **ERROR — debe revertirse** (D1, D3) |
| Fase 3.5 (`usePOSSession`) | 🟠 **Afirmación falsa** (D4) |
| Paso 0 (TZ) | 🟡 **Comando incorrecto** (D6) |

### Recomendación

**NO ejecutar la v14.** Reformular a **v15** con estos cambios:

1. **REVERTIR Fase 3.4** — `useNetworkHealth` queda FUERA del alcance (tiene guarda de idempotencia; no hay bug). Documentar por qué.
2. **Documentar el riesgo D2** en Fase 3.3 — el heartbeat lee `currentUserRef.current?.id` (valor vivo); el cleanup por `currentUserId` evita intervalos huérfanos. Añadir test de limpieza al cambiar `selectedTerminal`.
3. **Corregir Fase 3.5** — `usePOSSession` SÍ tiene `currentUser` en deps de `useCallback` ([`línea 158`](../apps/pos/hooks/usePOSSession.js:158)). Decidir: corregir a `currentUserId` o documentar la exclusión.
4. **Añadir D5** — mencionar el `useEffect` de [`useBeforeUnload.js:27`](../apps/pos/hooks/useBeforeUnload.js:27) como "verificado, inofensivo".
5. **Corregir D6** — usar `rderico-api-dev` en el comando del Paso 0.
6. **Aclarar D7** — los tests de Fase 7 para H8 son de no-regresión.

### Riesgo residual si se ejecutara la v14 tal cual

- 🟢 **Bajo en producción** — las Fases 1, 2, 4, 5 son seguras.
- 🟠 **Medio en mantenibilidad** — la Fase 3.4 introduciría un cambio innecesario en `useNetworkHealth` que podría alterar la atribución de incidentes (D3), y la Fase 3.5 dejaría una afirmación falsa en el plan.

---

> **Conclusión:** La v14 mejoró la v13 pero **cometió el error inverso**: amplió el alcance sin verificar el código, introduciendo un cambio innecesario (D1) y una afirmación falsa (D4). La lección es que **ampliar el alcance requiere la misma verificación que corregir un bug**. La v15 debe **reducir** el alcance de la Fase 3 a lo estrictamente verificado: `useTerminalLocking` (2 efectos) y, opcionalmente, `usePOSSession` (1 `useCallback`).
