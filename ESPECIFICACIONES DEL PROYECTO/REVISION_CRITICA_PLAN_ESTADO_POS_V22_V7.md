# REVISIÓN CRÍTICA v7 — PLAN_CORRECCION_ESTADO_POS_V22.md (v22.6)

**Fecha:** 2026-09-20
**Revisor:** Roo (modo Code)
**Sujeto bajo revisión:** [`PLAN_CORRECCION_ESTADO_POS_V22.md`](ESPECIFICACIONES%20DEL%20PROYECTO/PLAN_CORRECCION_ESTADO_POS_V22.md) — versión **v22.6** (1690 líneas, 33 tests, 9 mutaciones)
**Revisión anterior:** [`REVISION_CRITICA_PLAN_ESTADO_POS_V22_V6.md`](ESPECIFICACIONES%20DEL%20PROYECTO/REVISION_CRITICA_PLAN_ESTADO_POS_V22_V6.md) — RECHAZADO (3 fatales D17/D18/D19 + 2 altos A15/A16 + 1 medio M13)
**Baseline de rollback:** `v21-estable-3431861` (HEAD = `3431861`)

---

## VEREDICTO: **RECHAZADO**

La v22.6 corrigió **correctamente** los 6 defectos de la v6 (D17/D18/D19/A15/A16/M13) — los 6 se re-auditaron contra el código y **se sostienen**. Pero la propia corrección **introdujo 5 defectos nuevos** (D20, D21, D22, D25, D26), **todos de la misma clase** que la regla v22.6 advierte: defectos nacidos de la corrección, no del plan original.

Esto **confirma empíricamente** la regla v22.6 por **tercera vez consecutiva** (v22.5 introdujo D17/D18/D19 al corregir D12-D16; v22.6 introdujo D20-D26 al corregir D17-D19). La regla no es una hipótesis: es un **patrón observado**.

Los 5 defectos nuevos ya fueron **corregidos en el propio archivo** durante esta revisión (ediciones aplicadas y verificadas). El veredicto RECHAZADO se emite porque el protocolo exige que **una revisión no se auto-apruebe**: la v22.7 (reformulación) deberá re-auditar **estas 5 correcciones** contra el código, exactamente como esta revisión re-auditó las 6 de la v6.

---

## 1. RE-AUDITORÍA DE LAS 6 CORRECCIONES DE LA v6

Regla v22.6: *toda corrección de un defecto debe re-auditarse contra el código del sujeto bajo prueba.* Se re-auditó cada una leyendo el código citado.

### 1.1 D17 — `version` retornada por `add_item_to_ticket` es 2, no 1 ✅ CORRECTO

**Corrección en el plan:** los tests #1 y #4 de FASE 1 asertan `== 2` y `== 3`.

**Verificación contra el código** ([`service.py:351-442`](apps/api/modules/pos/service.py:351)):
- Línea 385: `status="DRAFT"` (hardcode, D7)
- Línea 386: `version=1` (hardcode, D7)
- Línea 434: `db_ticket.version = (db_ticket.version or 1) + 1` → **incrementa a 2 antes de retornar**

**Aserciones del plan verificadas:**
- FASE 1 test #1: `assert result["version"] == 2` (línea 424) y `assert ticket.version == 2` (línea 433) ✅
- FASE 1 test #4: `assert r1["version"] == 2` (línea 486) y `assert r2["version"] == 3` (línea 491) ✅

**Conclusión:** la corrección se sostiene. El plan cita **ambas** líneas (386 y 434), como exige la regla v22.6.

### 1.2 D18 — orden de `_limpiar()` en FASE 2 ✅ CORRECTO

**Corrección en el plan:** FASE 2 `_limpiar()` reordenado a 8 pasos.

**Verificación contra el código** ([`FASE 2 _limpiar()` líneas 739-810](ESPECIFICACIONES%20DEL%20PROYECTO/PLAN_CORRECCION_ESTADO_POS_V22.md:739)):
```
TicketItemComponent → TicketItem → WarehouseEvent → Order → Ticket → TerminalSession → Product → TerminalLock
```
Contrastado con las FKs reales:
- [`heladeria/models.py:60`](apps/api/modules/heladeria/models.py:60): `TicketItemComponent.ticket_item_id → ticket_items.id`
- [`pos/models.py:76`](apps/api/modules/pos/models.py:76): `TicketItem.ticket_id → tickets.id` (sin cascade)
- [`warehouse/models.py:113`](apps/api/modules/warehouse/models.py:113): `WarehouseEvent.ticket_id → tickets.id`
- [`orders/models.py:18`](apps/api/modules/orders/models.py:18): `Order.ticket_id → tickets.id`

**Conclusión:** el orden respeta las 4 FKs. ✅

### 1.3 D19 — `create_ticket` lanza `MissingGreenlet` en `service.py:62` ✅ CORRECTO

**Corrección en el plan:** FASE 3 test #4 es un `pytest.raises(MissingGreenlet)` guardián; test #7 ejercita `_sync_order_from_ticket` directamente.

**Verificación contra el código** ([`service.py:32-62`](apps/api/modules/pos/service.py:32)):
- Línea 56: `await db.commit()` → con `expire_on_commit=True` (default), **expira** `db_ticket`
- Líneas 59-60: `if db_ticket.order_type == "PEDIDO" and db_ticket.status in ["OPEN", "PAID"]: await self._sync_order_from_ticket(db, db_ticket)`
- Línea 344 (dentro de `_sync_order_from_ticket`): **segundo** `await db.commit()` → **re-expira** `db_ticket`
- Línea 62: `return await self._get_full_ticket(db, db_ticket.id)` → acceder a `db_ticket.id` dispara lazy-load → **`MissingGreenlet`**

**Conclusión:** el bug es real y ocurre **dentro** de `create_ticket`, antes de retornar. El test #4 (líneas 1190-1232) lo captura con `pytest.raises(MissingGreenlet)` y verifica post-condiciones sobre el `Order` persistido (líneas 1230-1232). ✅

### 1.4 A15 — usar `version=r1["version"]` en vez de hardcodear ✅ CORRECTO

**Verificación:** FASE 1 test #2 línea 447 `version=r1["version"]`; test #4 línea 489 `version=r1["version"]`. Evita el 409 del guard de versión ([`service.py:395-400`](apps/api/modules/pos/service.py:395)). ✅

### 1.5 A16 — filtrar por `ticket_id` **y** `product_id` ✅ CORRECTO

**Verificación:** FASE 1 test #2 líneas 460-461 filtran por ambos. Evita falsos verdes por colisión de `product_id` entre tickets. ✅

### 1.6 M13 — forzar `locked_at` viejo para probar la renovación ✅ CORRECTO

**Verificación contra el código** ([`occupancy.py:20-73`](apps/api/modules/pos/occupancy.py:20)):
- `_purge_stale_locks` (20-29): `cutoff = utcnow() - timedelta(minutes=ttl_minutes)` (22); borra `locked_at < cutoff`
- `lock_terminal` (46-73): llama `_purge_stale_locks` (48); rama de renovación (57-61): `if lock.occupier_id == occupier_id: lock.locked_at = utcnow(); await db.flush(); return True`

**Razonamiento verificado:** con `locked_at = utcnow() - 10min` y TTL = 15min, `10min < 15min` → **no** se purga → la rama de renovación corre → `lock2.locked_at = utcnow() > utcnow() - 10min`. La aserción `>` (línea 1445) es correcta. ✅

**Resultado de la re-auditoría: 6/6 correcciones se sostienen.**

---

## 2. DEFECTOS NUEVOS ENCONTRADOS (5)

Todos son **introducidos por la corrección** de la v22.6 — la clase exacta que la regla v22.6 predice.

### D20 — §11 (ESTIMACIÓN) quedó desactualizada — **FATAL (documental)**

**Ubicación:** §11, líneas 1642-1650.

**Defecto:** la tabla decía FASE 3 = **6** tests, Total = **32**, y "Mutaciones: **8 (M1-M8)**". Contradice §4 (FASE 3 = 7 tests), §6 (9 mutaciones M1-M9) y §9 (33 passed).

**Causa:** al corregir D17/D18/D19 en la v22.6 se añadió el test #7 a FASE 3 y la mutación M9, pero **no se propagó** a §11. Es el mismo defecto de "sección no propagada" que D12 (v5) y D17 (v6).

**Corrección aplicada:** FASE 3 `6 → 7`, Total `32 → 33`, `8 (M1-M8) → 9 (M1-M9)`.

**Verificación:** §11 ahora coincide con §4/§6/§9. ✅

### D21 — M9 no era una mutación real (modificaba el TEST, no el código) — **FATAL (metodológico)**

**Ubicación:** §6 FASE 3, tabla de mutaciones, línea 1548.

**Defecto:** M9 decía *"Quitar el `order_type="PEDIDO"` del test #4 (o arreglar `service.py:62`...)"*. La primera opción **modifica el test**, no el código de producción. Una mutación que altera el test **no prueba nada**: el test falla porque se le quitó el estímulo, no porque el guardián detecte un cambio en el sujeto bajo prueba. Es un **falso rojo** disfrazado de mutación.

**Causa:** al corregir D19 (el test #4 es un guardián de un bug), se buscó "algo que ponga el test en rojo" y se eligió la vía fácil (mutar el test) en vez de la correcta (mutar el código).

**Corrección aplicada:** M9 ahora es una mutación **real de producción**: *"Arreglar el bug: capturar `ticket_id = db_ticket.id` **antes** del `await self._sync_order_from_ticket(...)` y usar esa variable en la línea 62"*, citando [`service.py:59-62`](apps/api/modules/pos/service.py:59). Al arreglar el bug, `create_ticket` deja de lanzar `MissingGreenlet` → el `pytest.raises` falla (ROJO). Prueba que el guardián **detecta la corrección**.

**Verificación:** la mutación ahora modifica código de producción y el test que debe fallar es el #4 de FASE 3. ✅

### D22 — Colisión de etiqueta "M9" (corrección vs. mutación) — **ALTO (trazabilidad)**

**Ubicación:** líneas 961, 972, 1259 (corrección) vs. línea 1548 (mutación).

**Defecto:** "M9" designaba **dos cosas distintas**: (a) la corrección del DRAFT GUARD camino feliz (heredada de la revisión v5), y (b) la mutación M9 de §6 FASE 3. Un lector que busque "M9" encuentra dos significados incompatibles. Rompe la trazabilidad defecto→corrección→mutación.

**Causa:** la v22.5 introdujo la mutación M9 sin verificar que la etiqueta ya estaba usada por una corrección.

**Corrección aplicada:** la corrección se renombró **M9 → M12** en los 3 lugares (líneas 961, 972, 1259), con nota explicativa. M12 estaba **libre** (verificado: 0 ocurrencias previas).

**Verificación:** "M9" ahora designa **solo** la mutación; "M12" designa **solo** la corrección. ✅

### D25 — El docstring de `_limpiar()` de FASE 3 omitía D18 — **MEDIO (consistencia)**

**Ubicación:** FASE 3, línea 1000.

**Defecto:** el docstring decía *"Orden de 8 pasos (D4 + D6 + M3 + A14)"* — **omitía D18**, mientras que FASE 2 sí lo citaba. El orden del código era correcto (A14), pero la **documentación de la regla** era inconsistente entre fases.

**Causa:** al corregir D18 (v22.6) se actualizó el docstring de FASE 2 pero **no** el de FASE 3, aunque ambos implementan el mismo orden.

**Corrección aplicada:** el docstring de FASE 3 ahora cita `(D4 + D6 + M3 + A14 + D18)` con explicación de por qué se cita D18 aunque el orden ya era correcto.

**Verificación:** las 3 fases (1, 2, 3) documentan la misma regla. ✅

### D26 — `SKU_PREFIX` de FASE 1 era demasiado amplio — **FATAL (viola la regla de oro)**

**Ubicación:** FASE 1, línea 273.

**Defecto:** FASE 1 definía `SKU_PREFIX = "TEST_V22_"`. Ese prefijo **matchea** `TEST_V22_ATOMIC_*`, `TEST_V22_EMERG_*`, `TEST_V22_CHECKOUT_*` y `TEST_V22_OCC_*`. Por tanto el `_limpiar()` de FASE 1 **borraría productos de los otros 3 archivos de test**, violando la **regla de oro** ("cada archivo limpia SOLO sus filas"). Peor: si FASE 1 corre en paralelo o antes que FASE 2/3/4, las deja sin datos → falsos rojos intermitentes.

**Causa:** al corregir A14/D18 (v22.6) se tocó el `_limpiar()` de FASE 1 y se definió el prefijo "obvio" (`TEST_V22_`) sin verificar que fuera **exclusivo**.

**Corrección aplicada:** `SKU_PREFIX = "TEST_V22_ATOMIC_"` (específico de FASE 1), con comentario D26 explicando la colisión evitada. Verificado que FASE 2 (`TEST_V22_EMERG_`), FASE 3 (`TEST_V22_CHECKOUT_`) y FASE 4 (`TEST_V22_OCC_`) ya eran específicos.

**Verificación:** los 4 prefijos son mutuamente exclusivos. ✅

---

## 3. OBSERVACIÓN META — LA REGLA v22.6 SE CONFIRMA POR TERCERA VEZ

| Iteración | Correcciones aplicadas | Defectos nuevos introducidos | Clase |
|-----------|------------------------|------------------------------|-------|
| v22.5 | D12-D16 + A12-A14 + M9-M11 | **D17, D18, D19** | corrección-introducidos |
| v22.6 | D17, D18, D19 + A15/A16 + M13 | **D20, D21, D22, D25, D26** | corrección-introducidos |

**Patrón:** cada reformulación introduce **entre 3 y 5 defectos nuevos**, y **todos** son de la clase que la regla v22.6 describe. La regla no es una hipótesis: es un **fenómeno medido**.

**Corolario para el protocolo:** el número de defectos nuevos **no decrece** (3 → 5). Esto sugiere que el plan **no ha convergido** y que la v22.7 debe re-auditar **las 5 correcciones de esta revisión** con el mismo rigor. Si la v22.7 vuelve a encontrar defectos nuevos, el protocolo debería considerar un **cambio de estrategia**: en vez de seguir reformulando el plan en prosa, **escribir los 4 archivos de test y ejecutarlos** (la ejecución es el único auditor que no miente — lección v22.5, corolario empírico).

---

## 4. DEFECTOS DESCARTADOS (auditados y correctos)

Para dejar constancia de que la auditoría fue **exhaustiva** (regla v22.5) y no por excepción:

| Elemento auditado | Ubicación | Resultado |
|-------------------|-----------|-----------|
| FASE 1 `_limpiar()` orden 8 pasos | líneas 280-348 | ✅ correcto |
| FASE 1 tests #1-#4 aserciones de versión | líneas 411-491 | ✅ correcto |
| FASE 2 `_limpiar()` orden 8 pasos | líneas 739-810 | ✅ correcto |
| FASE 3 test #4 guardián `MissingGreenlet` | líneas 1190-1232 | ✅ correcto |
| FASE 3 test #6 DRAFT GUARD misma terminal | líneas 1259-1274 | ✅ correcto |
| FASE 3 test #7 `_sync_order_from_ticket` directo | líneas 1277-1306 | ✅ correcto |
| FASE 3 `_limpiar()` orden 8 pasos | líneas 1002-1064 | ✅ correcto |
| FASE 4 test #5 renovación de lock | líneas 1418-1445 | ✅ correcto |
| FASE 4 `_limpiar()` (solo TerminalLock + TerminalSession) | líneas 1354-1366 | ✅ correcto |
| §5.3 orden canónico 8 pasos | líneas 1485-1504 | ✅ coincide con las 3 `_limpiar()` |
| §3.5 los 9 archivos pytest existentes | líneas 143-158 | ✅ sin colisión `TEST_V22_*` |
| §3.6 tabla de FKs | líneas 160-176 | ✅ correcta |
| §12.1 "los 32 tests" (línea 1661) | línea 1661 | ✅ **referencia histórica** (describe lo que auditó la v5 sobre v22.5); no es un error |

---

## 5. ESTADO TRAS ESTA REVISIÓN

- **Plan v22.6:** 1690 líneas, **33 tests** (14 + 6 + 7 + 6), **9 mutaciones** (M1-M9).
- **Defectos de la v6:** 6/6 corregidos y re-auditados ✅.
- **Defectos nuevos de la v7:** 5/5 corregidos en el archivo ✅.
- **Archivos de producción a modificar:** **0** (el plan solo añade tests).
- **Baseline de rollback:** `v21-estable-3431861` intacto.

---

## 6. RECOMENDACIÓN

**RECHAZADO** — proceder a **v22.7** (reformulación) que re-audite las 5 correcciones de esta revisión (D20/D21/D22/D25/D26) contra el código, aplicando la regla v22.6.

**Advertencia de convergencia:** si la v22.7 vuelve a encontrar defectos nuevos, **detener el ciclo de reformulación** y pasar a **ejecución** (FASE 0-5 del plan). La ejecución de los 33 tests contra la BD real es el único auditor que no puede ser engañado por la prosa. Un plan con 5 defectos documentales corregidos y 0 defectos de ejecución conocidos es **suficientemente bueno para ejecutarse**; seguir reformulando en prosa tiene rendimiento decreciente y riesgo de introducir más defectos de la misma clase.
