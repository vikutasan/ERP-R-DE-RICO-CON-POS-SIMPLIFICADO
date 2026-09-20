# ✅ REPORTE DE EJECUCIÓN — CORRECCIÓN DE TERMINALES (v15)

> **Fecha de ejecución:** 2026-09-20
> **Plan ejecutado:** [`PLAN_CORRECCION_TERMINALES_V15.md`](PLAN_CORRECCION_TERMINALES_V15.md:1)
> **Estado:** ✅ COMPLETADO — todas las fases ejecutadas y verificadas.
> **Principio aplicado:** *No romper nada.* Solo se tocó lo verificado línea-por-línea.

---

## 1. Resumen de fases

| Fase | Hallazgo | Estado | Archivos modificados |
|------|----------|--------|----------------------|
| 1 | H3 — `terminal_id` en `beforeunload` | ✅ | [`useBeforeUnload.js`](../apps/pos/hooks/useBeforeUnload.js:1) |
| 2 | H2 — `utcnow()` en timestamps de candados | ✅ | [`occupancy.py`](../apps/api/modules/pos/occupancy.py:1), [`router.py`](../apps/api/modules/pos/router.py:1) |
| 3 | H1 — deps de `currentUser` (alcance reducido) | ✅ | [`useTerminalLocking.js`](../apps/pos/hooks/useTerminalLocking.js:1), [`usePOSSession.js`](../apps/pos/hooks/usePOSSession.js:1) |
| 4 | H7 — `heartbeatTerminal` señala fallo | ✅ | [`POSService.js`](../apps/pos/services/POSService.js:1) |
| 5 | H8 — documentar 403 espurios | ✅ | [`DOCUMENTACION_MODULO_POS.md`](DOCUMENTACION_MODULO_POS.md:1), [`router.py`](../apps/api/modules/pos/router.py:1) |
| 6 | H4/H5/H6 — consistencia documental | ✅ | [`DOCUMENTACION_MODULO_POS.md`](DOCUMENTACION_MODULO_POS.md:1) |
| 7 | Tests guardianes | ✅ | [`useTerminalLocking.v15.test.js`](../apps/pos/hooks/useTerminalLocking.v15.test.js:1) |

---

## 2. Detalle por fase

### Fase 1 — H3: `terminal_id` en el emergency-save de `beforeunload`

**Cambio:** se añadió `terminal_id: selectedTerminalRef.current || null` al payload del beacon en [`useBeforeUnload.js:46`](../apps/pos/hooks/useBeforeUnload.js:46). Se documentó el segundo `useEffect` (`[currentUser]`) como inofensivo (solo reasigna un ref).

**Por qué es seguro:** el backend [`emergency_save_ticket`](../apps/api/modules/pos/router.py:442) ya lee `payload.get("terminal_id")` y mantiene el fallback. Añadir el campo solo mejora la precisión.

---

### Fase 2 — H2: `utcnow()` en timestamps de candados

**Paso 0 (obligatorio) — verificación de TZ del contenedor:**

```
docker compose exec -T api python -c "from datetime import datetime, timezone; print('now=', datetime.now()); print('utc=', datetime.now(timezone.utc))"

now= 2026-09-20 04:21:22.267665
utc= 2026-09-20 04:21:22.267685+00:00
```

**Resultado: ambos valores coinciden → el contenedor corre en UTC.** El cambio es **neutro en comportamiento** (mismo valor numérico); solo hace explícita la intención y elimina la dependencia accidental de la TZ del host.

> **Corrección D6:** `docker compose exec` usa el **nombre del servicio** (`api`), no el del contenedor (`rderico-api-dev`). Confirmado con `docker compose ps -a`. El plan v15 se corrigió en consecuencia.

**Cambios:**
- [`occupancy.py`](../apps/api/modules/pos/occupancy.py:1): import de `utcnow` + 4 sustituciones (`datetime.now()` → `utcnow()`) en las líneas 18, 55, 65, 116.
- [`router.py:255`](../apps/api/modules/pos/router.py:255): cutoff de CashSession huérfana → `utcnow()`.

**Por qué es seguro:** `utcnow()` retorna un datetime **naive** (sin `tzinfo`), compatible con las columnas `DateTime` sin `timezone=True`. Es el mismo patrón ya usado en `models.py` y `service.py`.

**Evidencia:** `docker compose exec -T api python -m py_compile modules/pos/occupancy.py modules/pos/router.py` → `COMPILE_OK`.

---

### Fase 3 — H1: endurecimiento preventivo de deps (alcance REDUCIDO)

**Alcance declarado:** 3 puntos en 2 hooks. Se **excluyeron** `useNetworkHealth` (tiene guarda de idempotencia, D1) y `useBeforeUnload` (solo asigna un ref, D5).

**Cambios:**
- [`useTerminalLocking.js`](../apps/pos/hooks/useTerminalLocking.js:1): se añadió `const currentUserId = currentUser?.id;`. Los efectos `checkMyLock` y `sendHeartbeat` ahora dependen de `currentUserId` (primitivo) y leen el id vivo desde `currentUserRef.current?.id`.
- [`usePOSSession.js`](../apps/pos/hooks/usePOSSession.js:1): se añadió `const currentUserId = currentUser?.id;`. El `useCallback` de folio ahora depende de `currentUserId` y usa `currentUserId` en `reserveTicket`.

**Diagnóstico honesto:** el padre actual [`ExperimentCenterUI.jsx:508`](../apps/ExperimentCenterUI.jsx:508) pasa `currentUser={currentUser}` (variable de estado, no objeto en línea). El escenario "nueva referencia en cada render" **no ocurre hoy**. Es **deuda técnica preventiva (🟢)**, no un bug activo. El cleanup crítico ya estaba blindado con `[]` + refs.

---

### Fase 4 — H7: `heartbeatTerminal` señala el fallo

**Cambio:** [`POSService.js:117`](../apps/pos/services/POSService.js:117) ahora **lanza** `Error` en respuesta no-OK, en vez de devolver `false` en silencio.

**Por qué es seguro:** el llamador ([`useTerminalLocking.js`](../apps/pos/hooks/useTerminalLocking.js:129)) ya captura con `.catch()` y **no re-adquiere** el candado (regla anti-ping-pong). El cambio solo mejora la observabilidad.

---

### Fase 5 — H8: documentar 403 espurios

**Cambio:** nueva subsección **§5.6** en [`DOCUMENTACION_MODULO_POS.md`](DOCUMENTACION_MODULO_POS.md:530) que explica que el 403 de `unlock` es **esperado** (force_unlock previo, TTL expirado + re-ocupación, doble unlock). Se añadió un comentario en [`router.py:320`](../apps/api/modules/pos/router.py:320).

**Sin cambio de código funcional** — solo documentación y comentario.

---

### Fase 6 — H4/H5/H6: consistencia documental

**Cambios en [`DOCUMENTACION_MODULO_POS.md`](DOCUMENTACION_MODULO_POS.md:1):**
- **H4:** corrección del análisis forense del incidente "Terminales Fantasma V2" — se aclara que el padre actual pasa una variable de estado, no un objeto en línea.
- **H5:** nueva regla de timestamps en §5.3 — prohibido `datetime.now()`, obligatorio `utcnow()`.
- **H6:** 5 nuevos ítems en el checklist de revisión de código.

---

### Fase 7 — Tests guardianes

**Archivo nuevo:** [`useTerminalLocking.v15.test.js`](../apps/pos/hooks/useTerminalLocking.v15.test.js:1) — **18 tests** que fijan H1, H3, H7 y H8 como no-regresión, siguiendo el patrón de funciones puras del repo.

---

## 3. Verificación final

| Verificación | Comando | Resultado |
|--------------|---------|-----------|
| Suite de tests | `npm test` | ✅ **503 passed** (15 archivos, 18 nuevos) |
| Compilación API | `docker compose exec -T api python -m py_compile ...` | ✅ `COMPILE_OK` |
| Import API | `docker compose exec -T api python -c "from modules.pos.occupancy import utcnow..."` | ✅ `IMPORT_OK` |
| Build producción | `npm run build` | ✅ `built in 9.34s` |

---

## 4. Archivos modificados (resumen)

| Archivo | Tipo de cambio |
|---------|----------------|
| [`apps/pos/hooks/useBeforeUnload.js`](../apps/pos/hooks/useBeforeUnload.js:1) | + `terminal_id` en payload + comentario |
| [`apps/api/modules/pos/occupancy.py`](../apps/api/modules/pos/occupancy.py:1) | + import `utcnow` + 4 sustituciones |
| [`apps/api/modules/pos/router.py`](../apps/api/modules/pos/router.py:1) | + import `utcnow` + cutoff UTC + comentario 403 |
| [`apps/pos/hooks/useTerminalLocking.js`](../apps/pos/hooks/useTerminalLocking.js:1) | + `currentUserId` + 2 efectos |
| [`apps/pos/hooks/usePOSSession.js`](../apps/pos/hooks/usePOSSession.js:1) | + `currentUserId` + 1 `useCallback` |
| [`apps/pos/services/POSService.js`](../apps/pos/services/POSService.js:1) | `heartbeatTerminal` lanza en no-OK |
| [`ESPECIFICACIONES DEL PROYECTO/DOCUMENTACION_MODULO_POS.md`](DOCUMENTACION_MODULO_POS.md:1) | §5.3 regla timestamps, §5.6 403, corrección H4, checklist |
| [`apps/pos/hooks/useTerminalLocking.v15.test.js`](../apps/pos/hooks/useTerminalLocking.v15.test.js:1) | **NUEVO** — 18 tests guardianes |
| [`ESPECIFICACIONES DEL PROYECTO/PLAN_CORRECCION_TERMINALES_V15.md`](PLAN_CORRECCION_TERMINALES_V15.md:1) | Corrección D6 + resultado Paso 0 |

---

## 5. Prohibiciones respetadas

- ✅ No se tocó `useNetworkHealth` (D1 — tiene guarda de idempotencia).
- ✅ No se tocó el cleanup de desmontaje (ya blindado con `[]` + refs).
- ✅ No se reintrodujo `datetime.now()` en `occupancy.py`.
- ✅ No se convirtió el 403 de `unlock` en expulsión ni en reintentos.
- ✅ No se alteró el contrato `{ outcome, reason }` del modal de salida.
- ✅ No se modificaron constraints de `models.py` ni la lógica de `force_unlock`.

---

> **Conclusión:** las 8 correcciones (H1–H8) están aplicadas con el alcance mínimo verificado. La suite completa (503 tests) pasa, la API compila e importa, y el build de producción es exitoso. El módulo POS no fue degradado.
