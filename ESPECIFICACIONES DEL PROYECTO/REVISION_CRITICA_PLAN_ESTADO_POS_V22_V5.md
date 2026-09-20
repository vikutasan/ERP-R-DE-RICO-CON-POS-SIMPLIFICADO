# REVISIÓN CRÍTICA v5 — PLAN v22.4 (Tests del Backend del POS)

> **Fecha:** 2026-09-20
> **Revisor:** Roo (Code mode)
> **Objeto revisado:** [`PLAN_CORRECCION_ESTADO_POS_V22.md`](ESPECIFICACIONES DEL PROYECTO/PLAN_CORRECCION_ESTADO_POS_V22.md:1) — versión v22.4 (1437 líneas, 28 tests)
> **Método:** verificación del **CÓDIGO** de los 28 tests contra el **CÓDIGO** real de los endpoints/servicios, leyendo cada línea citada en esta sesión (regla v22.4).
> **Veredicto:** ❌ **RECHAZADO** (quinta revisión consecutiva)

---

## 0. VEREDICTO

El plan v22.4 corrigió **correctamente** los 9 defectos de la revisión v4 (D9/D10/D11 + A9/A10/A11 + M6/M7/M8). La FASE 2 (emergency-save) ahora coincide **exactamente** con el contrato real de [`router.py:448-497`](apps/api/modules/pos/router.py:448).

**PERO** la aplicación rigurosa de la regla v22.4 ("toda aserción debe citar la línea exacta del código que la produce") a **las 4 fases** —no solo a la FASE 2— ha revelado **5 defectos fatales NUEVOS** (D12-D16) que la revisión v4 no detectó porque solo auditó la FASE 2.

**El patrón del error es idéntico al de v4, pero desplazado:** v4 encontró que la FASE 2 estaba escrita contra un contrato inventado. v5 encuentra que **la FASE 3 y la FASE 4 también lo están**, y que la FASE 1 tiene un falso verde de idempotencia.

| Fase | Tests | Estado tras v5 |
|------|-------|----------------|
| FASE 1 (atomic ops) | 14 | ⚠️ 1 defecto fatal (D12) + 1 alto (A12) |
| FASE 2 (emergency-save) | 6 | ✅ Correcta (v4 la arregló) |
| FASE 3 (checkout) | 4 | ❌ 3 defectos fatales (D13/D14/D15) |
| FASE 4 (occupancy) | 4 | ❌ 1 defecto fatal (D16) |

---

## 1. DEFECTOS FATALES (D12-D16)

### D12 — FALSO VERDE en el test de idempotencia de `add_item_to_ticket` (FASE 1, test #2)

**El test #2** ([`PLAN:435-450`](ESPECIFICACIONES DEL PROYECTO/PLAN_CORRECCION_ESTADO_POS_V22.md:435)):

```python
async def test_02_add_item_incrementa_cantidad(db, sesion_activa, producto_activo):
    acc = f"{ACC_PREFIX}002"
    svc = pos_service.POSService()
    await svc.add_item_to_ticket(db, _payload_add(acc, producto_activo.id, sesion_activa.id, 1))
    result = await svc.add_item_to_ticket(
        db, _payload_add(acc, producto_activo.id, sesion_activa.id, 2, version=2)
    )
    assert result["total"] == 30.0  # 3 unidades * 10
```

**El código real** ([`service.py:434`](apps/api/modules/pos/service.py:434)):

```python
db_ticket.version = (db_ticket.version or 1) + 1
```

**El defecto:** el test pasa `version=2` en la segunda llamada. Pero tras la **primera** llamada, el ticket recién creado tiene `version=1` ([`service.py:386`](apps/api/modules/pos/service.py:386)), y al final de esa primera llamada se incrementa a `version=2` ([`service.py:434`](apps/api/modules/pos/service.py:434)). Por tanto `version=2` **coincide** y el guard de versión ([`service.py:395`](apps/api/modules/pos/service.py:395)) **no dispara**.

**¿Por qué es un falso verde?** El test **parece** verificar el merge de items (incremento de cantidad), pero el `version=2` es un valor **adivinado** que casualmente coincide. Si alguien cambia el orden de los incrementos de versión (p. ej. incrementar antes de crear), el test seguiría verde o fallaría por la razón equivocada. **La aserción `result["total"] == 30.0` no cita ninguna línea del código que la produce** — viola la regla v22.4.

**Corrección:** el test debe **leer la versión real** tras la primera llamada (`r1["version"]`) y pasarla explícitamente, en vez de hardcodear `2`:

```python
r1 = await svc.add_item_to_ticket(db, _payload_add(acc, producto_activo.id, sesion_activa.id, 1))
result = await svc.add_item_to_ticket(
    db, _payload_add(acc, producto_activo.id, sesion_activa.id, 2, version=r1["version"])
)
```

---

### D13 — El test #1 de FASE 3 aserta `result.status` sobre un **dict**, no un objeto (FASE 3, test #1)

**El test #1** ([`PLAN:1071-1087`](ESPECIFICACIONES DEL PROYECTO/PLAN_CORRECCION_ESTADO_POS_V22.md:1071)):

```python
result = await pos_service.POSService().create_ticket(
    db, _payload_checkout(acc, sesion_t1.id, producto.id, status="PAID")
)
assert result.status == "PAID"
assert float(result.total) == 50.0
```

**El código real** ([`service.py:62`](apps/api/modules/pos/service.py:62)):

```python
return await self._get_full_ticket(db, db_ticket.id)
```

Y [`_get_full_ticket`](apps/api/modules/pos/service.py:254) termina en:

```python
ticket_obj = result.scalar_one()
return self._populate_flat_fields(ticket_obj)
```

Y [`_populate_flat_fields`](apps/api/modules/pos/service.py:292) **muta el objeto ORM y lo devuelve** (no construye un dict):

```python
def _populate_flat_fields(self, ticket_obj: models.Ticket):
    if not ticket_obj.terminal_id:
        ticket_obj.terminal_id = ...
    ticket_obj.captured_by_name = ...
    ...
    return ticket_obj   # ← devuelve el ORM
```

**El defecto:** `result` **sí** es un objeto ORM (no un dict), así que `result.status` **funciona**. **PERO** hay un problema mayor: `_populate_flat_fields` accede a `ticket_obj.session.terminal_id` ([`service.py:296`](apps/api/modules/pos/service.py:296)) y a `ticket_obj.captured_by.name` ([`service.py:297`](apps/api/modules/pos/service.py:297)). Estas relaciones se cargan con `selectinload` en `_get_full_ticket` ([`service.py:260-263`](apps/api/modules/pos/service.py:260)), **pero `_get_full_ticket` NO carga `Ticket.order`** (el `backref` de [`orders/models.py:56`](apps/api/modules/orders/models.py:56)).

**El riesgo real:** el test #4 de FASE 3 ([`PLAN:1131`](ESPECIFICACIONES DEL PROYECTO/PLAN_CORRECCION_ESTADO_POS_V22.md:1131)) usa `order_type="PEDIDO"`, lo que dispara `_sync_order_from_ticket` ([`service.py:59-60`](apps/api/modules/pos/service.py:59)). Esa función hace `await db.commit()` ([`service.py:344`](apps/api/modules/pos/service.py:344)) **después** de que `create_ticket` ya hizo su commit ([`service.py:56`](apps/api/modules/pos/service.py:56)). El segundo commit **expira** `db_ticket` (comportamiento por defecto de SQLAlchemy `expire_on_commit=True`). Al volver a `create_ticket`, la línea `return await self._get_full_ticket(db, db_ticket.id)` accede a `db_ticket.id` — un atributo **expirado** → **`MissingGreenlet`** en contexto async.

**Esto es exactamente el pitfall que el plan dice evitar** (§3.3), pero el plan **no lo detectó** en su propio código de test. El test #4 de FASE 3 **fallará con `MissingGreenlet`**, no con la aserción esperada.

**Corrección:** capturar `ticket_id = db_ticket.id` **antes** de `_sync_order_from_ticket`, o usar `db.expire_on_commit = False` en el fixture. El plan debe **verificar** esto empíricamente antes de aprobar.

---

### D14 — El test #1 de FASE 3 aserta `ev.estado == "PENDIENTE"` pero `WarehouseEvent.estado` es un `default` de Python, no de BD (FASE 3, test #1)

**El test #1** ([`PLAN:1087`](ESPECIFICACIONES DEL PROYECTO/PLAN_CORRECCION_ESTADO_POS_V22.md:1087)):

```python
assert ev.estado == "PENDIENTE"
```

**El código real** ([`warehouse/models.py:115`](apps/api/modules/warehouse/models.py:115)):

```python
estado = Column(String, default="PENDIENTE") # PENDIENTE, PROCESADO, FALLIDO
```

**El defecto:** el `default="PENDIENTE"` es un **default de Python** (client-side), que SQLAlchemy aplica **al hacer flush/commit**. El test hace `select(WarehouseEvent)` **después** del commit de `create_ticket` ([`service.py:56`](apps/api/modules/pos/service.py:56)), así que el default **sí** se aplicó. **PERO** el test #1 de FASE 3 **no verifica** que el `WarehouseEvent` se insertó **antes** del commit (la garantía de atomicidad del outbox que el plan dice probar en §4.3). El test solo verifica que existe. **La aserción no cita la línea que produce la atomicidad** ([`service.py:44-52`](apps/api/modules/pos/service.py:44)).

**Además:** el test #1 **no verifica** que `items_json` contiene el SKU correcto ([`service.py:50`](apps/api/modules/pos/service.py:50): `{"sku": item.product.sku, "qty": item.quantity}`). Esa es la parte crítica del outbox: si el SKU se serializa mal, el descuento de stock falla silenciosamente. El test lo ignora.

**Corrección:** asertar `json.loads(ev.items_json) == [{"sku": producto.sku, "qty": 2}]`.

---

### D15 — El test #4 de FASE 3 aserta `order.status == "PAGADO"` pero `_sync_order_from_ticket` hace un **segundo commit** que puede dejar el `Order` sin persistir (FASE 3, test #4)

**El test #4** ([`PLAN:1131-1149`](ESPECIFICACIONES DEL PROYECTO/PLAN_CORRECCION_ESTADO_POS_V22.md:1131)):

```python
result = await pos_service.POSService().create_ticket(
    db,
    pos_schemas.TicketCreate(
        account_num=acc, session_id=sesion_t1.id, status="PAID",
        order_type="PEDIDO",
        items=[pos_schemas.TicketItemCreate(product_id=producto.id, quantity=1)],
    ),
)
order = (await db.execute(select(_orders_models.Order).where(_orders_models.Order.ticket_id == result.id))).scalars().first()
assert order is not None
assert order.status == "PAGADO"  # service.py:316
```

**El código real** ([`service.py:59-60`](apps/api/modules/pos/service.py:59)):

```python
if db_ticket.order_type == "PEDIDO" and db_ticket.status in ["OPEN", "PAID"]:
    await self._sync_order_from_ticket(db, db_ticket)
```

**El defecto (doble):**

1. **`result.id` puede lanzar `MissingGreenlet`** (ver D13): `_sync_order_from_ticket` hace `await db.commit()` ([`service.py:344`](apps/api/modules/pos/service.py:344)), que expira `db_ticket`. Luego `create_ticket` ejecuta `return await self._get_full_ticket(db, db_ticket.id)` ([`service.py:62`](apps/api/modules/pos/service.py:62)) → acceso a `db_ticket.id` expirado → `MissingGreenlet`. **El test #4 fallará antes de llegar a la aserción.**

2. **La aserción `order.status == "PAGADO"` no cita la línea que la produce.** El plan cita [`service.py:316`](apps/api/modules/pos/service.py:316) (`target_status = "PAGADO" if ticket.status == "PAID" else "TENTATIVO"`), pero **no verifica** que `_sync_order_from_ticket` se invocó con `ticket.status == "PAID"`. Si alguien cambia el orden de `_update_ticket_fields` (que asigna `db_ticket.status = ticket.status` en [`service.py:144`](apps/api/modules/pos/service.py:144)), el `Order` podría crearse como `TENTATIVO` y el test seguiría... no, fallaría. Pero el test **no aísla** la causa.

**Corrección:** capturar `ticket_id` antes del sync, y asertar también `order.delivery_type == "PICKUP"` (default de [`orders/models.py:21`](apps/api/modules/orders/models.py:21)) para verificar que el mapeo completo ocurrió.

---

### D16 — El test #2 de FASE 4 aserta `ok is False` pero `lock_terminal` **renueva el TTL** si el mismo usuario vuelve a pedir el lock (FASE 4, test #2)

**El test #2** ([`PLAN:1225-1228`](ESPECIFICACIONES DEL PROYECTO/PLAN_CORRECCION_ESTADO_POS_V22.md:1225)):

```python
await occupancy.lock_terminal(db, TERM_1, occupier_id=1, occupier_name="Cajero A")
ok = await occupancy.lock_terminal(db, TERM_1, occupier_id=2, occupier_name="Cajero B")
assert ok is False
```

**El código real** ([`occupancy.py:56-62`](apps/api/modules/pos/occupancy.py:56)):

```python
if lock:
    if lock.occupier_id == occupier_id:
        lock.locked_at = utcnow()
        await db.flush()
        return True
    return False  # Ocupada por otra persona
```

**El defecto:** el test usa `occupier_id=1` y luego `occupier_id=2` (distintos), así que **sí** retorna `False`. **PERO** el test **no cubre** la rama `lock.occupier_id == occupier_id` (renovación del TTL, [`occupancy.py:57-61`](apps/api/modules/pos/occupancy.py:57)), que es **la rama que evita que un cajero se auto-bloquee**. Es un **falso verde por omisión**: el test pasa, pero la rama crítica (mismo usuario re-lockea) queda sin cubrir.

**Además:** el plan §4.4 dice cubrir `heartbeat` ([`occupancy.py:103`](apps/api/modules/pos/occupancy.py:103)) en la lista de "funciones verificadas" ([`PLAN:1156`](ESPECIFICACIONES DEL PROYECTO/PLAN_CORRECCION_ESTADO_POS_V22.md:1156)), pero **ninguno de los 4 tests lo invoca**. La afirmación del plan es **falsa**.

**Corrección:** añadir un test #5 que verifique la renovación del TTL (mismo `occupier_id` → `True`), y un test #6 para `heartbeat` (o eliminar `heartbeat` de la lista de funciones cubiertas).

---

## 2. DEFECTOS ALTOS (A12-A14)

### A12 — El test #1 de FASE 1 aserta `result["total"] == 20.0` pero `_get_lightweight_response` devuelve `float(row.total)` (FASE 1, test #1)

**El test** ([`PLAN:423`](ESPECIFICACIONES DEL PROYECTO/PLAN_CORRECCION_ESTADO_POS_V22.md:423)): `assert result["total"] == 20.0`.

**El código** ([`service.py:288`](apps/api/modules/pos/service.py:288)): `"total": float(row.total)`.

**El defecto:** `row.total` es `Numeric(12,2)` → `Decimal("20.00")` → `float()` → `20.0`. La aserción **pasa**, pero el plan **no cita** [`service.py:288`](apps/api/modules/pos/service.py:288) como la línea que produce el `float`. Si alguien cambia `float(row.total)` por `row.total` (devolviendo `Decimal`), el test fallaría con `Decimal("20.00") == 20.0` → `True` en Python (Decimal y float comparan por valor), así que **seguiría verde**. Es un falso verde latente.

**Corrección:** asertar `isinstance(result["total"], float)` además del valor.

### A13 — La FASE 3 no verifica que `WarehouseEvent` NO se crea para `status="DRAFT"` (FASE 3)

El test #2 ([`PLAN:1092`](ESPECIFICACIONES DEL PROYECTO/PLAN_CORRECCION_ESTADO_POS_V22.md:1092)) verifica `OPEN` → sin evento. Pero el guard real ([`service.py:46`](apps/api/modules/pos/service.py:46)) es `if db_ticket.status == "PAID"`. Un `DRAFT` tampoco debería crear evento. El plan no lo cubre. **Riesgo:** si alguien cambia el guard a `!= "OPEN"`, el test #2 seguiría verde pero un DRAFT crearía evento.

### A14 — El `_limpiar()` de FASE 3 y FASE 4 borra `WarehouseEvent`/`Order` **después** de `Ticket` (viola el orden de FKs)

**FASE 3** ([`PLAN:979-1001`](ESPECIFICACIONES DEL PROYECTO/PLAN_CORRECCION_ESTADO_POS_V22.md:979)): borra `Ticket` (paso 3) **antes** de `WarehouseEvent` (paso 4) y `Order` (paso 5). Pero `WarehouseEvent.ticket_id` ([`warehouse/models.py:113`](apps/api/modules/warehouse/models.py:113)) y `Order.ticket_id` ([`orders/models.py:18`](apps/api/modules/orders/models.py:18)) son FKs a `tickets.id`. **Borrar el `Ticket` primero viola la FK** → `ForeignKeyViolationError`.

**El plan §5.3** ([`PLAN:1274-1283`](ESPECIFICACIONES DEL PROYECTO/PLAN_CORRECCION_ESTADO_POS_V22.md:1274)) **documenta el orden correcto** (WarehouseEvent y Order **antes** que Ticket), pero **el código de FASE 3 y FASE 4 lo implementa al revés**. Es una **contradicción entre la prosa y el código** — exactamente el patrón que v4 detectó en FASE 2.

**Nota:** FASE 1 ([`PLAN:306-331`](ESPECIFICACIONES DEL PROYECTO/PLAN_CORRECCION_ESTADO_POS_V22.md:306)) tiene el **mismo error**: borra `Ticket` (paso 3) antes de `WarehouseEvent` (paso 4) y `Order` (paso 5).

**Corrección:** reordenar a: TicketItemComponent → TicketItem → WarehouseEvent → Order → Ticket → TerminalSession → Product → TerminalLock.

---

## 3. DEFECTOS MEDIOS (M9-M11)

### M9 — El docstring de FASE 3 dice "DRAFT GUARD: DRAFT + PAID desde otra terminal -> 400" pero el test #3 usa `sesion_t2` que **no** es la terminal del ticket

El test #3 ([`PLAN:1110`](ESPECIFICACIONES DEL PROYECTO/PLAN_CORRECCION_ESTADO_POS_V22.md:1110)) crea el ticket con `terminal_id=TERM_1` y cobra con `sesion_t2.id` (TERM_2). El guard ([`service.py:113-125`](apps/api/modules/pos/service.py:113)) compara `guard_req_tid` (de `ticket.session_id` → TERM_2) con `safe_guard_db` (de `db_ticket.terminal_id` → TERM_1). **Diferentes → 400.** Correcto. Pero el test **no verifica** el caso simétrico (misma terminal → **no** 400), que es el camino feliz del guard. Sin él, un guard que **siempre** lanza 400 pasaría el test #3.

### M10 — El test #14 de FASE 1 aserta 409 pero no verifica que el guard de versión es el que dispara (podría ser otro)

El test #14 ([`PLAN:612`](ESPECIFICACIONES DEL PROYECTO/PLAN_CORRECCION_ESTADO_POS_V22.md:612)) usa `status="OPEN"` + `version=99`. El plan argumenta (correctamente) que pasa los 3 guards previos. Pero **no aserta el `detail`** del `HTTPException`. Si alguien añade un guard nuevo que también lanza 409, el test seguiría verde. **Corrección:** asertar `"versión" in exc.value.detail.lower()`.

### M11 — El plan afirma "28 passed" pero no verifica que los 9 archivos de test existentes siguen verdes

La FASE 2 del plan de ejecución ([`PLAN:1321`](ESPECIFICACIONES DEL PROYECTO/PLAN_CORRECCION_ESTADO_POS_V22.md:1321)) ejecuta **solo** los 4 archivos nuevos. No ejecuta la suite completa (`pytest tests/`) para verificar que los 9 archivos existentes (incluido [`test_bloque9d_3bugs.py`](apps/api/tests/test_bloque9d_3bugs.py:1)) siguen verdes. **Riesgo:** un `_limpiar()` agresivo podría borrar filas de otros tests.

---

## 4. LO QUE ESTÁ BIEN (para no ser injusto)

1. **La FASE 2 es ahora impecable.** Los 6 tests citan las líneas exactas ([`router.py:450`](apps/api/modules/pos/router.py:450), [`455`](apps/api/modules/pos/router.py:455), [`481`](apps/api/modules/pos/router.py:481), [`493`](apps/api/modules/pos/router.py:493), [`497`](apps/api/modules/pos/router.py:497)) y coinciden con el código. El test #5 (fallback) y el #6 (except) son correctos.
2. **La corrección D9 (`items` vs `cart`)** está verificada contra el frontend real ([`useBeforeUnload.js:47`](apps/pos/hooks/useBeforeUnload.js:47)).
3. **La corrección D11 (sin `price`)** coincide con [`schemas.py:37-42`](apps/api/modules/pos/schemas.py:37).
4. **La corrección D5 (ticket OPEN, no DRAFT)** es correcta para el camino de cobro.
5. **La corrección D7** (`status="DRAFT"`, `version=1`, `terminal_id` fallback) coincide con [`service.py:382-386`](apps/api/modules/pos/service.py:382).
6. **La corrección D8** (orden de guards) coincide con [`service.py:35-38`](apps/api/modules/pos/service.py:35).
7. **La FASE 4 (occupancy)** coincide con [`occupancy.py:46-100`](apps/api/modules/pos/occupancy.py:46) en los 4 tests que tiene.

---

## 5. CONDICIONES PARA APROBAR v22.5

1. **D12:** el test #2 de FASE 1 debe leer `r1["version"]` en vez de hardcodear `2`.
2. **D13:** verificar empíricamente si `create_ticket` con `order_type="PEDIDO"` lanza `MissingGreenlet`; si es así, capturar `ticket_id` antes del sync.
3. **D14:** asertar `json.loads(ev.items_json)` con el SKU real.
4. **D15:** capturar `ticket_id` antes del sync; asertar `order.delivery_type`.
5. **D16:** añadir test de renovación de TTL (mismo `occupier_id`) y de `heartbeat` (o eliminar `heartbeat` de la lista).
6. **A12:** asertar `isinstance(result["total"], float)`.
7. **A13:** añadir test `DRAFT` → sin `WarehouseEvent`.
8. **A14:** reordenar el `_limpiar()` de las 3 fases a: TicketItemComponent → TicketItem → WarehouseEvent → Order → Ticket → TerminalSession → Product → TerminalLock.
9. **M9:** añadir test del camino feliz del DRAFT GUARD (misma terminal → no 400).
10. **M10:** asertar el `detail` del 409 en el test #14.
11. **M11:** ejecutar la suite completa en FASE 2 del plan de ejecución.
12. **Regla v22.5:** toda aserción debe citar la línea del código **y** el plan debe **verificar empíricamente** los flujos que cruzan commits (el `MissingGreenlet` de D13/D15 no se detecta leyendo, solo ejecutando).

---

## 6. LA LECCIÓN DE LA REVISIÓN v5

> **"Una revisión que solo audita la fase que falló la vez anterior deja las otras fases sin auditar."**

v4 encontró que la FASE 2 estaba mal y la arregló. v5 encontró que **la FASE 3 y la FASE 4 nunca fueron auditadas con el mismo rigor**, y que la FASE 1 tenía un falso verde de idempotencia. El error de método es **auditar por excepción** (solo lo que falló) en vez de **auditar por exhaustividad** (las 4 fases, los 28 tests, cada aserción).

**Regla v22.5:** la revisión debe recorrer **las 4 fases** y **cada aserción**, no solo la fase que falló la vez anterior.

---

## 7. TRAZABILIDAD DE LOS DEFECTOS

| Defecto | Fase | Test | Línea del plan | Línea del código | Severidad |
|---------|------|------|----------------|------------------|-----------|
| D12 | 1 | #2 | 435-450 | [`service.py:386,434`](apps/api/modules/pos/service.py:386) | FATAL |
| D13 | 3 | #1 | 1071-1087 | [`service.py:59-62,344`](apps/api/modules/pos/service.py:59) | FATAL |
| D14 | 3 | #1 | 1087 | [`service.py:50`](apps/api/modules/pos/service.py:50) | FATAL |
| D15 | 3 | #4 | 1131-1149 | [`service.py:59-60,316,344`](apps/api/modules/pos/service.py:59) | FATAL |
| D16 | 4 | #2 | 1225-1228 | [`occupancy.py:57-61,103`](apps/api/modules/pos/occupancy.py:57) | FATAL |
| A12 | 1 | #1 | 423 | [`service.py:288`](apps/api/modules/pos/service.py:288) | ALTO |
| A13 | 3 | #2 | 1092 | [`service.py:46`](apps/api/modules/pos/service.py:46) | ALTO |
| A14 | 1/3/4 | `_limpiar` | 306-331, 979-1001, 1184-1196 | [`warehouse/models.py:113`](apps/api/modules/warehouse/models.py:113), [`orders/models.py:18`](apps/api/modules/orders/models.py:18) | ALTO |
| M9 | 3 | #3 | 1110 | [`service.py:113-125`](apps/api/modules/pos/service.py:113) | MEDIO |
| M10 | 1 | #14 | 612 | [`service.py:129`](apps/api/modules/pos/service.py:129) | MEDIO |
| M11 | — | — | 1321 | — | MEDIO |

---

## 8. DECISIÓN

**❌ RECHAZADO.** El plan v22.4 corrigió los 9 defectos de v4, pero la auditoría exhaustiva de las 4 fases revela **5 defectos fatales nuevos** (D12-D16) + 3 altos (A12-A14) + 3 medios (M9-M11).

**Reformular como v22.5** resolviendo los 11 defectos y aplicando la regla v22.5 (auditar las 4 fases, no solo la que falló).
