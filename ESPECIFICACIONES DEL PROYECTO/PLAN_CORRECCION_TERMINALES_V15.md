# 🛠️ PLAN DE CORRECCIÓN — LÓGICA DE BLOQUEO/DESBLOQUEO DE TERMINALES (v15)

> **Estado:** PROPUESTA — pendiente de aprobación antes de ejecutar.
> **Fecha:** 2026-09-20
> **Base:** Reporte de hallazgos H1–H8 contra la Sección 5 de [`DOCUMENTACION_MODULO_POS.md`](DOCUMENTACION_MODULO_POS.md:471).
> **Reemplaza a:** [`PLAN_CORRECCION_TERMINALES_V14.md`](PLAN_CORRECCION_TERMINALES_V14.md:1) (rechazado por [`REVISION_CRITICA_PLAN_TERMINALES_V14.md`](REVISION_CRITICA_PLAN_TERMINALES_V14.md:1)).
> **Principio rector:** *No romper nada.* El POS es un módulo vital. Toda corrección debe respetar las 18 Reglas de Oro y el principio transversal "Store UTC, Display Local".
> **Principio de alcance (nuevo en v15):** *Solo se toca lo que se ha verificado línea-por-línea.* Ampliar el alcance sin verificar es tan peligroso como corregir sin verificar.

---

## 0. QUÉ CAMBIA RESPECTO A LA v14

La v14 fue rechazada por 7 críticas (D1–D7). Esta v15 las resuelve así:

| Crítica | Corrección aplicada en v15 |
|---------|---------------------------|
| **D1** 🔴 `useNetworkHealth` no tiene el anti-patrón | **Fase 3.4 REVERTIDA.** `useNetworkHealth` queda **FUERA del alcance**. Se documenta que tiene guarda de idempotencia ([`línea 57`](../apps/pos/hooks/useNetworkHealth.js:57)) que hace inofensivo el re-registro. |
| **D2** 🔴 Riesgo no documentado en heartbeat | La Fase 3.3 **documenta explícitamente** que `sendHeartbeat` lee `currentUserRef.current?.id` (valor vivo) y que el cleanup por `currentUserId` evita intervalos huérfanos. Se añade test de limpieza al cambiar `selectedTerminal`. |
| **D3** 🟠 Atribución de incidentes | Resuelto por D1 (no se toca `useNetworkHealth`). |
| **D4** 🟠 `usePOSSession` SÍ depende de `currentUser` | La Fase 3.5 **corrige la afirmación**: `usePOSSession` tiene `currentUser` en deps de `useCallback` ([`línea 158`](../apps/pos/hooks/usePOSSession.js:158)). Se decide **corregirlo** (bajo riesgo, no hay timers). |
| **D5** 🟡 Segundo `useEffect` en `useBeforeUnload` | La Fase 1 **menciona** el efecto de [`useBeforeUnload.js:27`](../apps/pos/hooks/useBeforeUnload.js:27) como "verificado, inofensivo". |
| **D6** 🟡 Nombre de servicio Docker | **CORREGIDO EN EJECUCIÓN:** el nombre del **contenedor** es `rderico-api-dev`, pero el nombre del **servicio** (el que usa `docker compose exec`) es **`api`**. Verificado con `docker compose ps -a`. El Paso 0 usa **`api`**. |
| **D7** 🟢 Inconsistencia Fase 5/7 | La Fase 7 **aclara** que los tests de H8 son de **no-regresión**. |

### Clasificación de riesgo por fase (v15)

| Fase | Hallazgo | Riesgo | Justificación |
|------|----------|--------|---------------|
| 1 | H3 — `terminal_id` en `beforeunload` | 🟢 Bajo | Añadir un campo al payload; el backend ya lo soporta con fallback |
| 2 | H2 — `utcnow()` en `occupancy.py` | 🟢 Bajo | Sustituir `datetime.now()` por helper ya usado en `models.py` (con verificación TZ previa) |
| 3 | H1 — deps de `currentUser` | 🟢 Bajo | **Alcance reducido:** solo `useTerminalLocking` (2 efectos) + `usePOSSession` (1 `useCallback`) |
| 4 | H7 — `heartbeatTerminal` no lanza | 🟢 Bajo | Cambio de observabilidad en un servicio |
| 5 | H8 — 403 espurios en unlock | 🟢 Bajo | **Solo documentación**, sin cambio de código |
| 6 | H4/H5/H6 — Consistencia documental | 🟢 Bajo | Solo edición de documentación (al final) |
| 7 | Tests guardianes | 🟢 Bajo | Solo añade pruebas (funciones puras) |

**Orden de ejecución:** Fases 1→2→4→5 (independientes) → Fase 3 (aislada) → Fase 6 (doc) → Fase 7 (tests).

---

## FASE 1 — H3: Añadir `terminal_id` al emergency-save de `beforeunload`

**Hallazgo:** [`useBeforeUnload.js:38`](../apps/pos/hooks/useBeforeUnload.js:38) construye el payload del beacon **sin `terminal_id`**, obligando al backend a usar el fallback "cualquier sesión activa" ([`router.py:463`](../apps/api/modules/pos/router.py:463)) — el Defecto 5 que la v7.0.3 corrigió para el force logout pero **no** para el cierre de pestaña.

**Regla que respeta:** Regla 6 endurecida (v7.0.3, línea 375) — "el force logout dispara `sendBeacon` … con `terminal_id`". Se extiende el mismo contrato al camino de `beforeunload`.

### Cambio propuesto

En [`useBeforeUnload.js:38`](../apps/pos/hooks/useBeforeUnload.js:38), añadir `terminal_id` al payload usando el ref ya existente (`selectedTerminalRef`):

```js
const payload = JSON.stringify({
    account_num: accountNumRef.current,
    terminal_id: selectedTerminalRef.current || null,   // ← NUEVO (v15)
    items: cartRef.current.map(i => ({ product_id: i.id, quantity: i.quantity || 1 })),
    status: 'OPEN',
    emergency_save: true
});
```

### Auditoría completa del hook (resuelve D5)

| Efecto | Línea | Deps | Evaluación |
|--------|-------|------|------------|
| Sync `selectedTerminalRef` | [`23`](../apps/pos/hooks/useBeforeUnload.js:23) | `[selectedTerminal]` | ✅ Primitivo, correcto |
| Sync `currentUserRef` | [`27`](../apps/pos/hooks/useBeforeUnload.js:27) | `[currentUser]` | ⚠️ Objeto, pero **inofensivo** (solo asigna un ref, no hay timers ni fetch) |
| Listener `beforeunload` | [`31`](../apps/pos/hooks/useBeforeUnload.js:31) | `[]` | ✅ Correcto (blindado con refs) |

**Decisión:** el efecto de la línea 27 **se deja como está**. Re-ejecutarse solo reasigna un ref; no causa efectos secundarios. Documentarlo en un comentario.

### Por qué es seguro
- El backend [`emergency_save_ticket`](../apps/api/modules/pos/router.py:442) ya lee `payload.get("terminal_id")` y **mantiene el fallback** si no encuentra sesión. Añadir el campo solo mejora la precisión; nunca empeora.
- `selectedTerminalRef` ya está declarado y sincronizado ([`useBeforeUnload.js:20`](../apps/pos/hooks/useBeforeUnload.js:20)). No se añaden dependencias al efecto.

### Evidencia de aceptación
- Test unitario: el payload del beacon contiene `terminal_id` cuando `selectedTerminal` está definido.
- Verificación manual: cerrar pestaña con carrito → el log del backend muestra `terminal=<TID>` (no `None`).

---

## FASE 2 — H2: Unificar timestamps de candados con `utcnow()`

**Hallazgo:** [`occupancy.py:18`](../apps/api/modules/pos/occupancy.py:18) usa `datetime.now()` (hora local naive) en 4 puntos, mientras [`models.py:15`](../apps/api/modules/pos/models.py:15) ya usa `utcnow()` de [`core/timestamps.py:21`](../apps/api/core/timestamps.py:21) como default de columna. El frontend asume UTC (vía [`parseUtc`](../apps/shared/timezone.js:60) y [`_iso_utc`](../apps/api/core/serialization.py:21)), pero el backend escribe hora local → desfase potencial de 6h que falsea `lockAge` en [`getNetStatus()`](../apps/pos/components/TerminalSelector.jsx:48).

**Regla que respeta:** Principio "Store UTC, Display Local" ([`core/timestamps.py:4`](../apps/api/core/timestamps.py:4)) y la nota histórica de que `datetime.now()` coincidía con UTC "por accidente" en Docker.

### Paso 0 (obligatorio — resuelve D6): Verificar la TZ real del contenedor

**Antes de tocar código**, confirmar la zona horaria del contenedor API.

> **Aclaración D6 (verificada en ejecución):** `docker compose exec` usa el **nombre del servicio**, no el del contenedor. En [`docker-compose.yml`](../docker-compose.yml:1) el servicio se llama **`api`** (el contenedor se llama `rderico-api-dev`). Confirmado con `docker compose ps -a`:
> ```
> NAME              ...  SERVICE
> rderico-api-dev   ...  api
> rderico-db-dev    ...  db
> rderico-pos-dev   ...  pos
> ```

```bash
docker compose exec -T api python -c "from datetime import datetime, timezone; print('now=', datetime.now()); print('utc=', datetime.now(timezone.utc))"
```

- **Si ambos valores coinciden** (contenedor en UTC) → el cambio es **neutro** en producción; solo hace explícita la intención.
- **Si difieren** (contenedor hereda `TZ=America/Mexico_City` del host Windows) → el cambio **SÍ altera** el comportamiento: los locks expirarán 6h antes/después. En ese caso, **detener la fase** y reportar antes de continuar, porque implicaría que el bug H2 **ya está activo** y el cambio requiere coordinación (posible limpieza de locks con timestamps mixtos).

> **Nota:** Este paso es obligatorio. La v13 afirmaba equivalencia sin verificarla; la v14 usó el nombre de servicio correcto (`api`); la v15 lo había cambiado erróneamente a `rderico-api-dev` y se corrigió tras verificar con `docker compose ps -a`.

#### ✅ Resultado del Paso 0 (ejecutado 2026-09-20)

```
now= 2026-09-20 04:21:22.267665
utc= 2026-09-20 04:21:22.267685+00:00
```

**Ambos valores coinciden → el contenedor está en UTC.** El cambio `datetime.now()` → `utcnow()` es **neutro en comportamiento** (mismo valor numérico); solo hace explícita la intención y elimina la dependencia accidental de la TZ del host. **Fase 2 autorizada a proceder.**

### Cambio propuesto

En [`occupancy.py:9`](../apps/api/modules/pos/occupancy.py:9), importar el helper y sustituir las 4 ocurrencias:

```python
from core.timestamps import utcnow   # ← NUEVO (v15)
```

| Línea | Antes | Después |
|-------|-------|---------|
| [`18`](../apps/api/modules/pos/occupancy.py:18) | `cutoff = datetime.now() - timedelta(...)` | `cutoff = utcnow() - timedelta(...)` |
| [`55`](../apps/api/modules/pos/occupancy.py:55) | `lock.locked_at = datetime.now()` | `lock.locked_at = utcnow()` |
| [`65`](../apps/api/modules/pos/occupancy.py:65) | `locked_at=datetime.now()` | `locked_at=utcnow()` |
| [`116`](../apps/api/modules/pos/occupancy.py:116) | `lock.locked_at = datetime.now()` | `lock.locked_at = utcnow()` |

Adicionalmente, en [`router.py:255`](../apps/api/modules/pos/router.py:255) (cutoff de CashSession huérfana de 24h), sustituir `datetime.now()` por `utcnow()` para consistencia. El log de auditoría de [`router.py:402`](../apps/api/modules/pos/router.py:402) puede permanecer con `datetime.now()` (es solo texto de log, no se compara).

### Por qué es seguro
- `utcnow()` retorna un datetime **naive** (sin tzinfo) — verificado en [`timestamps.py:29`](../apps/api/core/timestamps.py:29) → **no rompe el esquema** `DateTime` sin `timezone=True` de [`TerminalLock.locked_at`](../apps/api/modules/pos/models.py:15).
- Es el mismo patrón ya usado por [`service.py:12`](../apps/api/modules/pos/service.py:12) (`utcnow()` en GC y drafts).
- **Condicionado al Paso 0:** si el contenedor está en UTC, el valor es idéntico al actual → cero cambio de comportamiento.

### Evidencia de aceptación
- Salida del Paso 0 registrada en el reporte de ejecución.
- `docker compose exec -T api python -m py_compile modules/pos/occupancy.py` → `COMPILE_OK`.
- Test: crear lock, verificar que `locked_at` es coherente con `utcnow()` (no con hora local).
- Suite POS completa sigue en verde.

---

## FASE 3 — H1: Endurecimiento preventivo de las deps de `currentUser` (alcance REDUCIDO)

**Hallazgo (corregido y verificado):** De los hooks que reciben `currentUser`, **solo dos** tienen el anti-patrón de forma que importe:

| Hook | Línea | Deps actuales | ¿Anti-patrón? | Acción v15 |
|------|-------|---------------|---------------|------------|
| [`useTerminalLocking.js`](../apps/pos/hooks/useTerminalLocking.js:110) `checkMyLock` | 110 | `[selectedTerminal, currentUser, forceLogoutModal, settings.checkLockPolling]` | ✅ Sí (efecto con `setInterval`) | **Corregir** |
| [`useTerminalLocking.js`](../apps/pos/hooks/useTerminalLocking.js:142) heartbeat | 142 | `[selectedTerminal, currentUser, settings.heartbeatInterval]` | ✅ Sí (efecto con `setInterval`) | **Corregir** |
| [`usePOSSession.js`](../apps/pos/hooks/usePOSSession.js:158) `generateNewAccountNum` | 158 | `[selectedTerminal, currentUser]` | ⚠️ Sí, pero en `useCallback` (sin timers) | **Corregir** (bajo riesgo) |
| [`useNetworkHealth.js`](../apps/pos/hooks/useNetworkHealth.js:78) | 78 | `[status, terminalId, currentUser]` | ❌ **NO** — tiene guarda de idempotencia ([`línea 57`](../apps/pos/hooks/useNetworkHealth.js:57)) | **NO tocar** (D1) |
| [`useBeforeUnload.js`](../apps/pos/hooks/useBeforeUnload.js:27) | 27 | `[currentUser]` | ❌ **NO** — solo asigna un ref | **NO tocar** (D5) |

**Alcance declarado (resuelve D1, D3, D4):** se corrigen **3 puntos** en **2 hooks** (`useTerminalLocking` ×2, `usePOSSession` ×1). Se **excluyen explícitamente** `useNetworkHealth` y `useBeforeUnload`, con justificación verificada.

**Diagnóstico honesto:** El padre actual [`ExperimentCenterUI.jsx:508`](../apps/ExperimentCenterUI.jsx:508) pasa `currentUser={currentUser}` — una **variable de estado**, no un objeto en línea. Por lo tanto:
- El escenario "nueva referencia en cada render" **NO ocurre hoy**.
- El cleanup crítico (causa de la pérdida de sesión) **ya está blindado** con `[]` + refs ([`línea 115`](../apps/pos/hooks/useTerminalLocking.js:115)).
- **Esto es deuda técnica preventiva (🟢), no un bug activo (🟠).**

**Regla que respeta:** Resolución del incidente v2 — "los efectos no deben depender de la referencia del objeto `currentUser`; usar `useRef` para leer valores actuales".

### Cambio propuesto (mínimo y quirúrgico)

**3.1 — Extraer el `id` primitivo del usuario** (evita depender del objeto):

```js
const currentUserId = currentUser?.id;   // ← primitivo estable (v15)
```

**3.2 — `useTerminalLocking.checkMyLock`:** cambiar deps a primitivos y leer el id desde el ref dentro del callback:

```js
useEffect(() => {
    if (!selectedTerminal || forceLogoutModal) return;

    const checkMyLock = async () => {
        try {
            const data = await posService.getTerminalsStatus();
            const myStatus = data[selectedTerminal];
            const uid = currentUserRef.current?.id;   // ← leer del ref (v15)
            if (!myStatus || myStatus.occupier_id !== uid) {
                setLockWarning(true);
                if (myStatus && myStatus.occupier_id !== uid) {
                    setForceLogoutModal(true);
                }
            } else {
                setLockWarning(false);
            }
        } catch (e) {
            console.error("Error en polling de seguridad (Capa Red):", e);
        }
    };

    const intervalId = setInterval(checkMyLock, settings.checkLockPolling);
    return () => clearInterval(intervalId);
}, [selectedTerminal, currentUserId, forceLogoutModal, settings.checkLockPolling]);   // ← id primitivo
```

**3.3 — `useTerminalLocking` heartbeat (con documentación de D2):**

```js
useEffect(() => {
    if (!selectedTerminal || !currentUserId) return;

    const sendHeartbeat = () => {
        // v15: lee el id VIVO desde el ref. Si el usuario cambia de id,
        // el efecto se re-registra (por currentUserId) y el cleanup borra
        // el intervalo anterior → no quedan heartbeats huérfanos.
        posService.heartbeatTerminal(selectedTerminal, currentUserRef.current?.id)
            .catch(e => console.warn("Heartbeat network request failed:", e));
    };

    sendHeartbeat();
    const intervalId = setInterval(sendHeartbeat, settings.heartbeatInterval);
    return () => clearInterval(intervalId);
}, [selectedTerminal, currentUserId, settings.heartbeatInterval]);   // ← id primitivo
```

> **Nota D2:** el riesgo de "tick con id nuevo a terminal vieja" es **preexistente** (ya ocurre hoy) y **no lo introduce la v15**. El cleanup por `currentUserId` garantiza que no queden intervalos huérfanos. Se añade un test que verifica la limpieza al cambiar `selectedTerminal`.

**3.4 — `usePOSSession.generateNewAccountNum` (resuelve D4):**

```js
// antes: }, [selectedTerminal, currentUser]);
// después:
}, [selectedTerminal, currentUserId]);   // ← id primitivo (v15)
```

Y dentro del callback, donde se usa `currentUser?.id` ([`línea 120`](../apps/pos/hooks/usePOSSession.js:120)) y `currentUser` ([`línea 134`](../apps/pos/hooks/usePOSSession.js:134)), usar `currentUserId` para el id. Para el fallback de `originalCapturer` ([`línea 134`](../apps/pos/hooks/usePOSSession.js:134)), mantener `currentUser` **fuera** de las deps (se lee del closure, que se recrea cuando cambia `currentUserId` — suficiente porque el capturador solo se usa al reservar folio).

> **Decisión:** este cambio es de **bajo riesgo** porque `generateNewAccountNum` no tiene timers; solo se recrea la función. Si se prefiere máxima prudencia, se puede **dejar sin cambio** y documentar la exclusión. **Recomendación: corregir**, porque es consistente y no hay riesgo de timers.

**3.5 — `useNetworkHealth` y `useBeforeUnload`: NO TOCAR (D1, D5).** Se añade un comentario de una línea en cada uno documentando por qué se excluyen.

### Por qué es seguro
- `currentUserRef` **ya existe** y se sincroniza en cada render ([`useTerminalLocking.js:31-33`](../apps/pos/hooks/useTerminalLocking.js:31)). No se añade infraestructura.
- Cambiar `currentUser` (objeto) por `currentUser?.id` (número) en las deps **reduce** los re-registros: el efecto solo se re-ejecuta si cambia el **id real**, no la referencia.
- **NO** se toca el cleanup de desmontaje ([`línea 115`](../apps/pos/hooks/useTerminalLocking.js:115)), que ya está correcto con `[]` + refs. Esto evita reintroducir el bug de pérdida de sesión.
- **NO** se cambia la lógica anti-ping-pong ni la semántica de expulsión.

### Riesgo y mitigación
- **Riesgo:** si algún consumidor dependía de que el efecto se re-ejecutara al cambiar `currentUser` (p. ej. cambio de nombre sin cambio de id), el heartbeat no se reiniciaría. **Mitigación:** el heartbeat solo necesita el `id`; el nombre no afecta al candado. Verificado: [`heartbeatTerminal`](../apps/pos/services/POSService.js:117) solo usa `occupierId`.
- **Riesgo D2:** documentado arriba; se mitiga con test de limpieza.

### Evidencia de aceptación
- Test de función pura (ver Fase 7): `shouldRenewLock(lockInfo, userId)` devuelve el resultado correcto.
- Test: cambiar el `id` → el efecto **sí** se re-registra.
- Test: cambiar `selectedTerminal` → el intervalo anterior **se limpia** (D2).
- Suite POS completa en verde.

---

## FASE 4 — H7: `heartbeatTerminal` debe señalar el fallo (sin romper anti-ping-pong)

**Hallazgo:** [`POSService.heartbeatTerminal()`](../apps/pos/services/POSService.js:117) retorna `res.ok` (booleano) y **no lanza** en error. El `.catch()` del consumidor ([`useTerminalLocking.js:131`](../apps/pos/hooks/useTerminalLocking.js:131)) es código muerto. Un 404 (lock expirado) pasa silencioso.

**Regla que respeta:** Regla anti-ping-pong (5.5) — el frontend **NUNCA** re-adquiere un lock. El cambio **no** debe provocar re-adquisición; solo **observabilidad**.

### Cambio propuesto

Mantener el retorno booleano (no lanzar, para no romper el flujo), pero **registrar** el fallo de forma explícita para diagnóstico:

```js
async heartbeatTerminal(terminalId, occupierId) {
    const res = await fetch(`${CONFIG.API_BASE_URL}/pos/terminals/${terminalId}/heartbeat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ occupier_id: occupierId, occupier_name: "heartbeat" })
    });
    if (!res.ok) {
        // v15: NO lanzar (respeta anti-ping-pong). Solo señalar para diagnóstico.
        console.warn(`Heartbeat no renovado (HTTP ${res.status}) para ${terminalId}`);
    }
    return res.ok;
}
```

> **Decisión de diseño:** Se descarta lanzar excepción. Lanzar obligaría al consumidor a manejar el rechazo y podría tentar a un futuro desarrollador a "re-adquirir" el lock en el `catch` — violando la regla anti-ping-pong. El retorno booleano + warning es la opción más segura.

### Por qué es seguro
- No cambia el contrato de retorno (`boolean`). Los consumidores actuales siguen funcionando.
- No introduce re-adquisición.

### Evidencia de aceptación
- Test: `heartbeatTerminal` con respuesta 404 retorna `false` y emite `console.warn`.
- Suite POS en verde.

---

## FASE 5 — H8: Documentar los 403 espurios en unlock idempotente (SOLO DOCUMENTACIÓN)

**Hallazgo:** [`unlock_terminal()`](../apps/api/modules/pos/occupancy.py:85) retorna `True` si el lock no existe, pero `False` si pertenece a otro → [`release_terminal_lock`](../apps/api/modules/pos/router.py:318) responde **403**. En cleanup/`beforeunload`, esto genera 403 ruidosos cuando el lock ya fue reasignado por force_unlock.

**Regla que respeta:** 5.5 — el frontend nunca re-adquiere; el unlock es best-effort en cleanup.

### Aclaración (resuelve C5 de la v13 y D7 de la v14)

**Esta fase NO cambia código.** El comportamiento actual ya es correcto (verificado en [`occupancy.py:72-85`](../apps/api/modules/pos/occupancy.py:72)):

```python
async def unlock_terminal(db, terminal_id, occupier_id) -> bool:
    result = await db.execute(select(TerminalLock).where(TerminalLock.terminal_id == terminal_id))
    lock = result.scalars().first()
    if lock:
        if lock.occupier_id == occupier_id:
            await db.delete(lock)
            await db.flush()
            return True
        return False  # No eres el dueño → 403 legítimo
    return True  # Ya estaba libre (idempotente)
```

**Lo único que se hace es documentar** (comentarios en el código y en la doc):

**5.1 — Comentario en [`useTerminalLocking.js:120`](../apps/pos/hooks/useTerminalLocking.js:120)** (cleanup de desmontaje):

```js
// v15: un 403 aquí es ESPERADO si el lock fue reasignado por force_unlock.
// Es best-effort: no reintentar, no re-adquirir (regla anti-ping-pong 5.5).
```

**5.2 — Comentario equivalente en [`useBeforeUnload.js`](../apps/pos/hooks/useBeforeUnload.js:55)** (beacon de unlock).

> **Decisión de diseño:** **NO** relajar el 403 a 200 cuando el lock pertenece a otro. Eso debilitaría la seguridad (permitiría a cualquiera "liberar" terminales ajenas). El 403 es correcto; solo se documenta.

### Por qué es seguro
- Cambio puramente de comentarios. **Cero cambio de comportamiento.**

### Evidencia de aceptación
- Test de **no-regresión** (D7): unlock de un lock ajeno → 403 (sin cambio).
- Test de **no-regresión**: unlock de un lock inexistente → 200 idempotente (sin cambio).

---

## FASE 6 — H4/H5/H6: Consistencia documental de la Sección 5 (AL FINAL)

> **Nota de orden:** Esta fase se ejecuta **después** de la Fase 3, para que el texto refleje el diagnóstico real (H1 = endurecimiento preventivo, no bug).

**Hallazgo:** Tres inconsistencias en [`DOCUMENTACION_MODULO_POS.md`](DOCUMENTACION_MODULO_POS.md:471):
- **H4:** TTL "15 min" (5.3) vs "20 min" (incidente v12, línea 251; comentario en [`useBeforeUnload.js:10`](../apps/pos/hooks/useBeforeUnload.js:10)).
- **H5:** Claves `pos_terminal_status_polling_ms`, `pos_heartbeat_interval_ms`, `pos_terminal_check_lock_interval_ms` no documentadas en 5.3.
- **H6:** 5.5 dice "el frontend NUNCA expulsa automáticamente" pero `checkMyLock` sí dispara `ForceLogoutModal` en force_unlock.

### Cambios propuestos (solo documentación)

**6.1 — Corregir H4:** unificar a **15 min** (valor real del código) en la línea 251 y en el comentario de [`useBeforeUnload.js:10`](../apps/pos/hooks/useBeforeUnload.js:10).

**6.2 — Corregir H5:** ampliar la tabla de 5.3 con las 3 claves faltantes:

| Parámetro | Clave en `system_settings` | Default |
|-----------|---------------------------|---------|
| TTL de Lock | `pos_terminal_lock_ttl_m` | 15 min |
| TTL de Drafts para GC | `pos_draft_ttl_days` | 1 día |
| Polling de estado (landing) | `pos_terminal_status_polling_ms` | 5000 ms |
| Intervalo de heartbeat | `pos_heartbeat_interval_ms` | 20000 ms |
| Polling de seguridad (lock propio) | `pos_terminal_check_lock_interval_ms` | 15000 ms |

Y verificar explícitamente la regla TTL ≥ 10× heartbeat: `900s / 20s = 45×` ✅.

**6.3 — Corregir H6:** precisar la redacción de 5.5 para distinguir:
- Fallos de **red/TTL** → el frontend **NO** expulsa (solo `lockWarning`).
- **Force unlock del admin** → el frontend **SÍ** muestra `ForceLogoutModal` (expulsión legítima).

**6.4 — Documentar H1:** añadir una nota en 5.5 indicando que los efectos del POS **no deben depender de la referencia del objeto `currentUser`** (usar `currentUser?.id`), y que los hooks auditados en v15 fueron `useTerminalLocking` y `usePOSSession` (con `useNetworkHealth` y `useBeforeUnload` excluidos por tener guarda de idempotencia / ser inofensivos).

### Por qué es seguro
- Solo edición de markdown. No toca código.

### Evidencia de aceptación
- La Sección 5 queda internamente consistente (sin contradicciones 15/20).

---

## FASE 7 — Tests Guardianes (con funciones puras)

**Hallazgo:** Los hallazgos H1, H2, H3, H7 no tienen pruebas que los protejan contra regresión.

**Decisión de diseño:** El repo tiene un patrón establecido: **extraer funciones puras** y probarlas sin montar componentes ([`useTicketActions.exitContract.test.js:36`](../apps/pos/hooks/useTicketActions.exitContract.test.js:36) → `shouldExitAfterSend`, `buildEmergencyPayload`). La v15 sigue ese patrón en lugar de espiar `setInterval` global (frágil y contra el estilo del repo).

### Tests propuestos

| Test | Archivo | Protege | Tipo |
|------|---------|---------|------|
| `buildEmergencyPayload` incluye `terminal_id` | [`useBeforeUnload.test.js`](../apps/pos/hooks/useBeforeUnload.test.js:1) (nuevo) | H3 | Función pura |
| `utcnow()` usado en `occupancy.py` (no `datetime.now()`) | `test_occupancy_utc.py` (nuevo) | H2 | Backend |
| `shouldRenewLock(lockInfo, userId)` decide correctamente | `useTerminalLocking.test.js` (nuevo) | H1 | Función pura |
| El intervalo se limpia al cambiar `selectedTerminal` | `useTerminalLocking.test.js` (nuevo) | D2 | Hook (renderHook) |
| `heartbeatTerminal` retorna `false` en 404 y emite warning | `POSService.heartbeat.test.js` (nuevo) | H7 | Servicio |
| Unlock ajeno → 403; unlock inexistente → 200 | `test_unlock_contract.py` (nuevo) | H8 | **No-regresión** (D7) |
| `resolveCardState` mantiene 3 estados (regresión v12) | ya existe [`terminalCardState.test.js`](../apps/pos/utils/terminalCardState.test.js:1) | v12 | Función pura |

### Refactor necesario para H1 (extraer función pura)

Para poder testear H1 sin `renderHook`, extraer la decisión a una función pura en [`useTerminalLocking.js`](../apps/pos/hooks/useTerminalLocking.js:1):

```js
// v15: función pura extraída para test (patrón del repo)
export const shouldRenewLock = (lockInfo, userId) => {
    if (!lockInfo) return false;                 // no hay lock → no renovar
    return lockInfo.occupier_id === userId;      // solo renueva si es mío
};
```

Y usarla dentro de `checkMyLock`. Esto hace el test **determinista y sin timers**.

### Evidencia de aceptación
- `npm test` → todos en verde (base actual: 485 passed).
- `docker compose exec -T rderico-api-dev python -m py_compile modules/pos/occupancy.py` → `COMPILE_OK`.

---

## 8. MATRIZ DE TRAZABILIDAD

| Hallazgo | Fase | Archivo(s) | Riesgo | Regla respetada |
|----------|------|-----------|--------|-----------------|
| H3 | 1 | [`useBeforeUnload.js`](../apps/pos/hooks/useBeforeUnload.js:38) | 🟢 | Regla 6 v7.0.3 |
| H2 | 2 | [`occupancy.py`](../apps/api/modules/pos/occupancy.py:9), [`router.py`](../apps/api/modules/pos/router.py:255) | 🟢 | Store UTC, Display Local |
| H1 | 3 | [`useTerminalLocking.js`](../apps/pos/hooks/useTerminalLocking.js:110), [`usePOSSession.js`](../apps/pos/hooks/usePOSSession.js:158) | 🟢 | Incidente Terminal Fantasma v2 (preventivo) |
| H7 | 4 | [`POSService.js`](../apps/pos/services/POSService.js:117) | 🟢 | Anti-ping-pong 5.5 |
| H8 | 5 | [`occupancy.py`](../apps/api/modules/pos/occupancy.py:85) | 🟢 | 5.5 (seguridad intacta) |
| H4/H5/H6 | 6 | [`DOCUMENTACION_MODULO_POS.md`](DOCUMENTACION_MODULO_POS.md:471) | 🟢 | Consistencia documental |
| — | 7 | tests nuevos (funciones puras) | 🟢 | Reglas guardianas v7.0.3 |

---

## 9. LO QUE ESTE PLAN **NO** HACE (explícito)

- ⛔ **NO** reintroduce auto-save, timers de guardado ni `setInterval` de persistencia (Regla 1 / Prohibición 1).
- ⛔ **NO** mueve candados a RAM (Prohibición 4).
- ⛔ **NO** toca el cleanup de desmontaje con `[]` + refs (evita reintroducir el bug de pérdida de sesión).
- ⛔ **NO** relaja el 403 de unlock ajeno (mantiene la seguridad de 5.4).
- ⛔ **NO** cambia la lógica de force_unlock, traspuesta de titularidad ni auditoría (5.4).
- ⛔ **NO** modifica el contrato `{ outcome, reason }` de `handleTicketAction` (v7.0.3).
- ⛔ **NO** altera los 3 estados visuales `free`/`mine`/`occupied` (v12).
- ⛔ **NO** asume equivalencia de TZ sin verificar el contenedor (corrección de C6).
- ⛔ **NO** espía timers globales en tests (corrección de C7).
- ⛔ **NO** toca `useNetworkHealth` (tiene guarda de idempotencia — corrección de D1).
- ⛔ **NO** toca el `useEffect` de sync de `useBeforeUnload` (inofensivo — corrección de D5).

---

## 10. ORDEN DE EJECUCIÓN Y VERIFICACIÓN

```
Fase 1 (H3) → Fase 2 (H2, con Paso 0 de TZ) → Fase 4 (H7) → Fase 5 (H8)   [independientes, bajo riesgo]
                                    ↓
                          Fase 3 (H1, aislada)   [endurecimiento preventivo, alcance reducido]
                                    ↓
                          Fase 6 (doc) → Fase 7 (tests)
```

**Verificación global al cierre de cada fase:**
1. `npm test` → sin regresiones (base 485 passed).
2. `npm run build` → sin errores JSX.
3. `docker compose exec -T rderico-api-dev python -m py_compile modules/pos/occupancy.py modules/pos/router.py` → `COMPILE_OK`.

**Criterio de éxito:** los 8 hallazgos cerrados, suite completa en verde, y **cero** cambios en el comportamiento observable del flujo de bloqueo/desbloqueo en producción (Docker/UTC).

---

## 11. DIFERENCIAS CLAVE v14 → v15 (resumen para el revisor)

| Aspecto | v14 | v15 |
|---------|-----|-----|
| Alcance Fase 3 | 3 hooks (`useTerminalLocking`, `useNetworkHealth`, `usePOSSession`) | **2 hooks** (`useTerminalLocking`, `usePOSSession`) |
| `useNetworkHealth` | Incluido (error D1) | **Excluido** — tiene guarda de idempotencia |
| `usePOSSession` | "Verificado sin cambio" (falso, D4) | **Corregido** — sí tiene el anti-patrón en `useCallback` |
| `useBeforeUnload` | No auditado (D5) | **Auditado** — 3 efectos, 2 correctos, 1 inofensivo |
| Paso 0 (TZ) | `docker compose exec api` (falla, D6) | `docker compose exec rderico-api-dev` |
| Riesgo D2 (heartbeat) | No documentado | **Documentado** + test de limpieza |
| Tests H8 | Sin aclarar | **No-regresión** (D7) |

---

## 12. HISTORIAL DE VERSIONES

| Versión | Estado | Motivo del rechazo |
|---------|--------|-------------------|
| v13 | ❌ Rechazada | H1 mal diagnosticado (C1/C2); `useNetworkHealth` omitido (C3); alcance no declarado (C4); contradicción Fase 5 (C5); TZ no verificada (C6); test mal especificado (C7); orden (C8) |
| v14 | ❌ Rechazada | `useNetworkHealth` NO tiene el anti-patrón (D1); riesgo heartbeat no documentado (D2); atribución de incidentes (D3); `usePOSSession` afirmación falsa (D4); segundo efecto omitido (D5); servicio Docker incorrecto (D6); inconsistencia Fase 5/7 (D7) |
| **v15** | ⏳ **Propuesta** | Resuelve D1–D7. Alcance reducido a lo verificado. |

---

> **Nota final:** La v15 es la más conservadora de las tres. Aprendió de dos errores opuestos: la v13 subestimó el rigor (afirmó sin verificar), la v14 amplió sin verificar. La v15 **solo toca lo que ha leído línea-por-línea** y **excluye explícitamente** lo que no necesita cambio. El POS es un módulo vital: la prioridad es la estabilidad, no la elegancia.