# 🛠️ PLAN DE CORRECCIÓN — LÓGICA DE BLOQUEO/DESBLOQUEO DE TERMINALES (v13)

> **Estado:** PROPUESTA — pendiente de revisión crítica antes de ejecutar.
> **Fecha:** 2026-09-20
> **Base:** Reporte de hallazgos H1–H8 contra la Sección 5 de [`DOCUMENTACION_MODULO_POS.md`](DOCUMENTACION_MODULO_POS.md:471).
> **Principio rector:** *No romper nada.* El POS es un módulo vital. Toda corrección debe respetar las 18 Reglas de Oro y el principio transversal "Store UTC, Display Local".

---

## 0. FILOSOFÍA DEL PLAN

Este plan **NO reescribe** la arquitectura de candados (que cumple en lo esencial con la Sección 5). Corrige **8 hallazgos puntuales** de robustez y consistencia, priorizando:

1. **Cero regresiones** en el flujo de bloqueo/desbloqueo que hoy funciona.
2. **Reutilizar infraestructura existente** ([`core/timestamps.py`](../apps/api/core/timestamps.py:21), [`shared/timezone.js`](../apps/shared/timezone.js:60)) en vez de crear nuevas abstracciones.
3. **Cambios mínimos y testeables**, uno por hallazgo, con evidencia de aceptación por fase.

### Clasificación de riesgo por fase

| Fase | Hallazgo | Riesgo | Justificación |
|------|----------|--------|---------------|
| 1 | H3 — `terminal_id` en `beforeunload` | 🟢 Bajo | Añadir un campo al payload; el backend ya lo soporta con fallback |
| 2 | H2 — `utcnow()` en `occupancy.py` | 🟢 Bajo | Sustituir `datetime.now()` por helper ya usado en `models.py` |
| 3 | H1 — deps de efectos con `currentUser` | 🟠 Medio | Toca el corazón del hook de candados; requiere cuidado con refs |
| 4 | H7 — `heartbeatTerminal` no lanza | 🟢 Bajo | Cambio de contrato de retorno en un servicio |
| 5 | H8 — 403 espurios en unlock | 🟢 Bajo | Solo logging/observabilidad, sin cambio de comportamiento |
| 6 | H4/H5/H6 — Consistencia documental | 🟢 Bajo | Solo edición de documentación |
| 7 | Tests guardianes | 🟢 Bajo | Solo añade pruebas |

**Orden de ejecución:** Fases 1→2→3→4→5→6→7. Las fases 1, 2, 4, 5 son independientes entre sí; la 3 es la más delicada y se aísla. La 6 y 7 cierran.

---

## FASE 1 — H3: Añadir `terminal_id` al emergency-save de `beforeunload`

**Hallazgo:** [`useBeforeUnload.js`](../apps/pos/hooks/useBeforeUnload.js:38) construye el payload del beacon **sin `terminal_id`**, obligando al backend a usar el fallback "cualquier sesión activa" ([`router.py:463`](../apps/api/modules/pos/router.py:463)) — el Defecto 5 que la v7.0.3 corrigió para el force logout pero **no** para el cierre de pestaña.

**Regla que respeta:** Regla 6 endurecida (v7.0.3, línea 375) — "el force logout dispara `sendBeacon` … con `terminal_id`". Se extiende el mismo contrato al camino de `beforeunload`.

### Cambio propuesto

En [`useBeforeUnload.js`](../apps/pos/hooks/useBeforeUnload.js:38), añadir `terminal_id` al payload usando el ref ya existente (`selectedTerminalRef`):

```js
const payload = JSON.stringify({
    account_num: accountNumRef.current,
    terminal_id: selectedTerminalRef.current || null,   // ← NUEVO (v13)
    items: cartRef.current.map(i => ({ product_id: i.id, quantity: i.quantity || 1 })),
    status: 'OPEN',
    emergency_save: true
});
```

### Por qué es seguro
- El backend [`emergency_save_ticket`](../apps/api/modules/pos/router.py:442) ya lee `payload.get("terminal_id")` y **mantiene el fallback** si no encuentra sesión. Añadir el campo solo mejora la precisión; nunca empeora.
- `selectedTerminalRef` ya está declarado y sincronizado ([`useBeforeUnload.js:20`](../apps/pos/hooks/useBeforeUnload.js:20)). No se añaden dependencias al efecto.

### Evidencia de aceptación
- Test unitario: el payload del beacon contiene `terminal_id` cuando `selectedTerminal` está definido.
- Verificación manual: cerrar pestaña con carrito → el log del backend muestra `terminal=<TID>` (no `None`).

---

## FASE 2 — H2: Unificar timestamps de candados con `utcnow()`

**Hallazgo:** [`occupancy.py`](../apps/api/modules/pos/occupancy.py:18) usa `datetime.now()` (hora local naive) en 4 puntos, mientras [`models.py`](../apps/api/modules/pos/models.py:15) ya usa `utcnow()` de [`core/timestamps.py`](../apps/api/core/timestamps.py:21) como default de columna. El frontend asume UTC (vía [`parseUtc`](../apps/shared/timezone.js:60) y [`_iso_utc`](../apps/api/core/serialization.py:21)), pero el backend escribe hora local → desfase potencial de 6h que falsea `lockAge` en [`getNetStatus()`](../apps/pos/components/TerminalSelector.jsx:48).

**Regla que respeta:** Principio "Store UTC, Display Local" ([`core/timestamps.py:4`](../apps/api/core/timestamps.py:4)) y la nota histórica de que `datetime.now()` coincidía con UTC "por accidente" en Docker.

### Cambio propuesto

En [`occupancy.py`](../apps/api/modules/pos/occupancy.py:9), importar el helper y sustituir las 4 ocurrencias:

```python
from core.timestamps import utcnow   # ← NUEVO (v13)
```

| Línea | Antes | Después |
|-------|-------|---------|
| [`18`](../apps/api/modules/pos/occupancy.py:18) | `cutoff = datetime.now() - timedelta(...)` | `cutoff = utcnow() - timedelta(...)` |
| [`55`](../apps/api/modules/pos/occupancy.py:55) | `lock.locked_at = datetime.now()` | `lock.locked_at = utcnow()` |
| [`65`](../apps/api/modules/pos/occupancy.py:65) | `locked_at=datetime.now()` | `locked_at=utcnow()` |
| [`116`](../apps/api/modules/pos/occupancy.py:116) | `lock.locked_at = datetime.now()` | `lock.locked_at = utcnow()` |

Adicionalmente, en [`router.py:255`](../apps/api/modules/pos/router.py:255) (cutoff de CashSession huérfana de 24h), sustituir `datetime.now()` por `utcnow()` para consistencia. El log de auditoría de [`router.py:402`](../apps/api/modules/pos/router.py:402) puede permanecer con `datetime.now()` (es solo texto de log, no se compara).

### Por qué es seguro
- `utcnow()` retorna un datetime **naive** (sin tzinfo), idéntico en tipo a `datetime.now()` → **no rompe el esquema** `DateTime` sin `timezone=True` de [`TerminalLock.locked_at`](../apps/api/modules/pos/models.py:15).
- En Docker (contenedor en UTC), el valor es **idéntico** al actual → cero cambio de comportamiento en producción. Solo se hace **explícita** la intención y se protege contra cambios de TZ del host.
- Es el mismo patrón ya usado por [`service.py`](../apps/api/modules/pos/service.py:12) (`utcnow()` en GC y drafts).

### Evidencia de aceptación
- `docker compose exec -T api python -m py_compile modules/pos/occupancy.py` → `COMPILE_OK`.
- Test: crear lock, verificar que `locked_at` es coherente con `utcnow()` (no con hora local).
- Suite POS completa sigue en verde.

---

## FASE 3 — H1: Eliminar la dependencia del OBJETO `currentUser` en los efectos

**Hallazgo:** Dos efectos de [`useTerminalLocking.js`](../apps/pos/hooks/useTerminalLocking.js:110) dependen del objeto `currentUser`:
- [`checkMyLock`](../apps/pos/hooks/useTerminalLocking.js:110): deps `[selectedTerminal, currentUser, forceLogoutModal, settings.checkLockPolling]`
- [Heartbeat](../apps/pos/hooks/useTerminalLocking.js:142): deps `[selectedTerminal, currentUser, settings.heartbeatInterval]`

Si el padre envía un objeto en línea, React genera nueva referencia en cada render → los `setInterval` se reinician constantemente. Es el anti-patrón del incidente "Terminal Fantasma v2" (líneas 240-244), aunque el cleanup crítico ya está blindado con refs.

**Regla que respeta:** Resolución del incidente v2 — "los efectos no deben depender de la referencia del objeto `currentUser`; usar `useRef` para leer valores actuales".

### Cambio propuesto (mínimo y quirúrgico)

**3.1 — Extraer el `id` primitivo del usuario** (evita depender del objeto):

```js
const currentUserId = currentUser?.id;   // ← primitivo estable (v13)
```

**3.2 — `checkMyLock`:** cambiar deps a primitivos y leer el id desde el ref dentro del callback:

```js
useEffect(() => {
    if (!selectedTerminal || forceLogoutModal) return;

    const checkMyLock = async () => {
        try {
            const data = await posService.getTerminalsStatus();
            const myStatus = data[selectedTerminal];
            const uid = currentUserRef.current?.id;   // ← leer del ref (v13)
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

**3.3 — Heartbeat:** idéntico patrón:

```js
useEffect(() => {
    if (!selectedTerminal || !currentUserId) return;

    const sendHeartbeat = () => {
        posService.heartbeatTerminal(selectedTerminal, currentUserRef.current?.id)
            .catch(e => console.warn("Heartbeat network request failed:", e));
    };

    sendHeartbeat();
    const intervalId = setInterval(sendHeartbeat, settings.heartbeatInterval);
    return () => clearInterval(intervalId);
}, [selectedTerminal, currentUserId, settings.heartbeatInterval]);   // ← id primitivo
```

### Por qué es seguro
- `currentUserRef` **ya existe** y se sincroniza en cada render ([`useTerminalLocking.js:31-33`](../apps/pos/hooks/useTerminalLocking.js:31)). No se añade infraestructura.
- Cambiar `currentUser` (objeto) por `currentUser?.id` (número) en las deps **reduce** los re-registros: el efecto solo se re-ejecuta si cambia el **id real**, no la referencia.
- **NO** se toca el cleanup de desmontaje ([`línea 115`](../apps/pos/hooks/useTerminalLocking.js:115)), que ya está correcto con `[]` + refs. Esto evita reintroducir el bug de pérdida de sesión.
- **NO** se cambia la lógica anti-ping-pong ni la semántica de expulsión.

### Riesgo y mitigación
- **Riesgo:** si algún consumidor dependía de que el efecto se re-ejecutara al cambiar `currentUser` (p. ej. cambio de nombre sin cambio de id), el heartbeat no se reiniciaría. **Mitigación:** el heartbeat solo necesita el `id`; el nombre no afecta al candado. Verificado: [`heartbeatTerminal`](../apps/pos/services/POSService.js:117) solo usa `occupierId`.

### Evidencia de aceptación
- Test de regresión: renderizar el hook con un `currentUser` que cambia de referencia pero **no** de `id` → el `setInterval` **no** se reinicia (espía sobre `setInterval`).
- Test: cambiar el `id` → el efecto **sí** se re-registra.
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
        // v13: NO lanzar (respeta anti-ping-pong). Solo señalar para diagnóstico.
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

## FASE 5 — H8: Reducir ruido de 403 espurios en unlock idempotente

**Hallazgo:** [`unlock_terminal()`](../apps/api/modules/pos/occupancy.py:85) retorna `True` si el lock no existe, pero `False` si pertenece a otro → [`release_terminal_lock`](../apps/api/modules/pos/router.py:318) responde **403**. En cleanup/`beforeunload`, esto genera 403 ruidosos cuando el lock ya fue reasignado por force_unlock.

**Regla que respeta:** 5.5 — el frontend nunca re-adquiere; el unlock es best-effort en cleanup.

### Cambio propuesto

**5.1 — Backend:** distinguir "no eres el dueño" (403 legítimo) de "ya no existe" (idempotente, 200). El código actual **ya** hace esto correctamente en [`occupancy.py:85`](../apps/api/modules/pos/occupancy.py:85). El problema es solo **observabilidad**: añadir un log informativo cuando el unlock es idempotente:

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

**5.2 — Frontend:** en el cleanup de desmontaje ([`useTerminalLocking.js:120`](../apps/pos/hooks/useTerminalLocking.js:120)) y en `beforeunload`, el 403 se captura como warning. **No cambiar** el comportamiento (es best-effort), pero **documentar** en el comentario que un 403 aquí es esperado si el lock fue reasignado.

> **Decisión de diseño:** **NO** relajar el 403 a 200 cuando el lock pertenece a otro. Eso debilitaría la seguridad (permitiría a cualquiera "liberar" terminales ajenas). El 403 es correcto; solo se documenta.

### Por qué es seguro
- Cambio puramente de comentarios/logging. Cero cambio de comportamiento.

### Evidencia de aceptación
- Test: unlock de un lock ajeno → 403 (sin cambio).
- Test: unlock de un lock inexistente → 200 idempotente (sin cambio).

---

## FASE 6 — H4/H5/H6: Consistencia documental de la Sección 5

**Hallazgo:** Tres inconsistencias en [`DOCUMENTACION_MODULO_POS.md`](DOCUMENTACION_MODULO_POS.md:471):
- **H4:** TTL "15 min" (5.3) vs "20 min" (incidente v12, línea 251; comentario en `useBeforeUnload.js:10`).
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

### Por qué es seguro
- Solo edición de markdown. No toca código.

### Evidencia de aceptación
- La Sección 5 queda internamente consistente (sin contradicciones 15/20).

---

## FASE 7 — Tests Guardianes

**Hallazgo:** Los hallazgos H1, H2, H3, H7 no tienen pruebas que los protejan contra regresión.

### Tests propuestos

| Test | Archivo | Protege |
|------|---------|---------|
| Payload de `beforeunload` incluye `terminal_id` | `useBeforeUnload.test.js` (nuevo) | H3 |
| `utcnow()` usado en `occupancy.py` (no `datetime.now()`) | `test_occupancy_utc.py` (nuevo) | H2 |
| Efecto NO se re-registra si `currentUser` cambia de referencia pero no de `id` | `useTerminalLocking.test.js` (nuevo) | H1 |
| `heartbeatTerminal` retorna `false` en 404 y emite warning | `POSService.heartbeat.test.js` (nuevo) | H7 |
| `resolveCardState` mantiene 3 estados (regresión v12) | ya existe [`terminalCardState.test.js`](../apps/pos/utils/terminalCardState.test.js:1) | v12 |

### Evidencia de aceptación
- `npm test` → todos en verde (base actual: 485 passed).
- `docker compose exec -T api python -m py_compile modules/pos/occupancy.py` → `COMPILE_OK`.

---

## 8. MATRIZ DE TRAZABILIDAD

| Hallazgo | Fase | Archivo(s) | Riesgo | Regla respetada |
|----------|------|-----------|--------|-----------------|
| H3 | 1 | [`useBeforeUnload.js`](../apps/pos/hooks/useBeforeUnload.js:38) | 🟢 | Regla 6 v7.0.3 |
| H2 | 2 | [`occupancy.py`](../apps/api/modules/pos/occupancy.py:9), [`router.py`](../apps/api/modules/pos/router.py:255) | 🟢 | Store UTC, Display Local |
| H1 | 3 | [`useTerminalLocking.js`](../apps/pos/hooks/useTerminalLocking.js:110) | 🟠 | Incidente Terminal Fantasma v2 |
| H7 | 4 | [`POSService.js`](../apps/pos/services/POSService.js:117) | 🟢 | Anti-ping-pong 5.5 |
| H8 | 5 | [`occupancy.py`](../apps/api/modules/pos/occupancy.py:85) | 🟢 | 5.5 (seguridad intacta) |
| H4/H5/H6 | 6 | [`DOCUMENTACION_MODULO_POS.md`](DOCUMENTACION_MODULO_POS.md:471) | 🟢 | Consistencia documental |
| — | 7 | tests nuevos | 🟢 | Reglas guardianas v7.0.3 |

---

## 9. LO QUE ESTE PLAN **NO** HACE (explícito)

- ⛔ **NO** reintroduce auto-save, timers de guardado ni `setInterval` de persistencia (Regla 1 / Prohibición 1).
- ⛔ **NO** mueve candados a RAM (Prohibición 4).
- ⛔ **NO** toca el cleanup de desmontaje con `[]` + refs (evita reintroducir el bug de pérdida de sesión).
- ⛔ **NO** relaja el 403 de unlock ajeno (mantiene la seguridad de 5.4).
- ⛔ **NO** cambia la lógica de force_unlock, traspuesta de titularidad ni auditoría (5.4).
- ⛔ **NO** modifica el contrato `{ outcome, reason }` de `handleTicketAction` (v7.0.3).
- ⛔ **NO** altera los 3 estados visuales `free`/`mine`/`occupied` (v12).

---

## 10. ORDEN DE EJECUCIÓN Y VERIFICACIÓN

```
Fase 1 (H3) → Fase 2 (H2) → Fase 4 (H7) → Fase 5 (H8)   [independientes, bajo riesgo]
                                    ↓
                          Fase 3 (H1)   [la más delicada, aislada]
                                    ↓
                          Fase 6 (doc) → Fase 7 (tests)
```

**Verificación global al cierre de cada fase:**
1. `npm test` → sin regresiones (base 485 passed).
2. `npm run build` → sin errores JSX.
3. `docker compose exec -T api python -m py_compile modules/pos/occupancy.py modules/pos/router.py` → `COMPILE_OK`.

**Criterio de éxito:** los 8 hallazgos cerrados, suite completa en verde, y **cero** cambios en el comportamiento observable del flujo de bloqueo/desbloqueo en producción (Docker/UTC).

---

> **Nota final:** Este plan es conservador por diseño. Prioriza la estabilidad del POS sobre la elegancia. La Fase 3 (H1) es la única con riesgo medio y se ejecuta aislada, con test de regresión específico, para poder revertirla sin afectar las demás correcciones.
