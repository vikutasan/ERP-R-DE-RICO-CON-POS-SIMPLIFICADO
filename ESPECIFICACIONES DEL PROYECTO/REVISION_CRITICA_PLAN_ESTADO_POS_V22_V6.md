# REVISIÓN CRÍTICA v6 — PLAN_CORRECCION_ESTADO_POS_V22.md (v22.5)

> **Fecha:** 2026-09-20
> **Revisor:** Roo (Code mode)
> **Objeto:** `PLAN_CORRECCION_ESTADO_POS_V22.md` en su versión **v22.5** (1585 líneas, 32 tests, 8 mutaciones).
> **Método:** auditoría **exhaustiva de las 4 fases**, test por test y aserción por aserción, **leyendo el código del sujeto bajo prueba en esta sesión** (regla v22.4). No se razona: se cita la línea.
> **Veredicto:** **RECHAZADO** — 3 fatales NUEVOS (D17, D18, D19) + 2 altos (A15, A16) + 2 medios (M12, M13).

---

## 0. Por qué esta revisión existe (y por qué v5 no bastó)

La revisión v5 estableció la regla: *"una revisión que solo audita la fase que falló la vez anterior deja las otras fases sin auditar."* v5 auditó las 4 fases y encontró D12-D16.

**Pero v22.5 introdujo correcciones que a su vez introdujeron defectos nuevos.** La lección v2 (*"una reformulación no es inmune a los defectos de la versión que corrige"*) se cumple otra vez: al corregir D12 (hardcodear `version=2`), v22.5 introdujo **A16** (pasar `version=1` donde la DB ya tiene 2). Al corregir D13/D15 (capturar `ticket_id` por `account_num`), v22.5 **no advirtió que `create_ticket` mismo lanza `MissingGreenlet`** antes de retornar → **D19**. Al corregir A14 en FASE 1 y FASE 3, v22.5 **olvidó FASE 2** → **D18**.

**Conclusión metodológica:** la auditoría debe ser **exhaustiva Y de regresión** — cada corrección debe re-auditarse contra el código, no solo declararse resuelta.

---

## 1. DEFECTOS FATALES (3)

### D17 — FASE 1, tests #1 y #4: asertan `version == 1` tras una operación que la incrementa a 2

**Evidencia dura (leída en esta sesión):**

[`service.py:379-389`](apps/api/modules/pos/service.py:379) crea el ticket con `version=1`:

```python
db_ticket = models.Ticket(
    ...
    status="DRAFT",
    version=1          # ← service.py:386
)
```

Pero **inmediatamente después**, [`service.py:434`](apps/api/modules/pos/service.py:434) incrementa:

```python
db_ticket.version = (db_ticket.version or 1) + 1   # ← 1 → 2
```

Y [`service.py:442`](apps/api/modules/pos/service.py:442) retorna `_get_lightweight_response`, que lee la versión **ya commiteada** ([`service.py:287`](apps/api/modules/pos/service.py:287)):

```python
"version": row.version,   # ← 2, NO 1
```

**El plan aserta lo contrario:**

- Test #1, línea 425: `assert result["version"] == 1` → **FALLA** (es 2).
- Test #1, línea 434: `assert ticket.version == 1` → **FALLA** (es 2).
- Test #4, línea 477: `assert r1["version"] == 1` → **FALLA** (es 2).

**Impacto:** 3 aserciones falsas en 2 tests. El plan **no puede pasar** tal como está escrito.

**Corrección:** asertar `== 2` (o, mejor, leer la versión y no hardcodearla). El comentario del test #1 dice "version=1" citando [`service.py:386`](apps/api/modules/pos/service.py:386), pero **ignora la línea 434** que la incrementa. Es exactamente el error que la regla v22.4 prohíbe: citar una línea sin leer la que la modifica.

---

### D18 — FASE 2, `_limpiar()`: el orden de borrado es el VIEJO (Ticket antes de WarehouseEvent/Order)

**Evidencia dura:** el `_limpiar()` de FASE 2 ([`PLAN...V22.md:724-786`](ESPECIFICACIONES%20DEL%20PROYECTO/PLAN_CORRECCION_ESTADO_POS_V22.md:724)) borra en este orden:

```
1. TicketItemComponent   (línea 726)
2. TicketItem            (línea 739)
3. Ticket                (línea 748)   ← ¡ANTES de WarehouseEvent y Order!
4. WarehouseEvent        (línea 753)
5. Order                 (línea 762)
6. TerminalSession       (línea 771)
7. Product               (línea 776)
8. TerminalLock          (línea 781)
```

Pero §5.3 del mismo plan ([`PLAN...V22.md:1401-1410`](ESPECIFICACIONES%20DEL%20PROYECTO/PLAN_CORRECCION_ESTADO_POS_V22.md:1401)) documenta el orden correcto:

```
3. WarehouseEvent
4. Order
5. Ticket            ← DESPUÉS de WarehouseEvent y Order
```

**Contradicción interna:** FASE 1 y FASE 3 fueron corregidas (A14), pero **FASE 2 quedó con el orden viejo**. El plan se contradice a sí mismo: la prosa dice una cosa, el código de FASE 2 dice otra.

**Impacto:** si algún test de FASE 2 creara un `WarehouseEvent` o un `Order`, el `_limpiar()` lanzaría `ForeignKeyViolationError`. En FASE 2 actualmente **ningún test los crea** (el endpoint de emergencia crea tickets `OPEN`, sin outbox ni pedido) → el defecto está **latente**, no se manifiesta hoy. Pero es una bomba de tiempo: el día que se añada un test de emergencia con `status="PAID"`, explota.

**Corrección:** reordenar el `_limpiar()` de FASE 2 al orden de §5.3 (WarehouseEvent y Order antes de Ticket).

---

### D19 — FASE 3, test #4: `create_ticket` con `order_type="PEDIDO"` lanza `MissingGreenlet` ANTES de retornar; la "corrección D13/D15" no lo evita

**Evidencia dura (leída en esta sesión):**

[`service.py:56-62`](apps/api/modules/pos/service.py:56):

```python
await db.commit()                                    # 56

if db_ticket.order_type == "PEDIDO" and db_ticket.status in ["OPEN", "PAID"]:
    await self._sync_order_from_ticket(db, db_ticket)  # 60 → 2º commit (service.py:344)

return await self._get_full_ticket(db, db_ticket.id)   # 62 ← accede a db_ticket.id
```

[`service.py:344`](apps/api/modules/pos/service.py:344) hace el **segundo commit**:

```python
db.add(new_order)
await db.commit()      # ← expira db_ticket (expire_on_commit=True)
```

Tras ese commit, `db_ticket` está **expirado**. La línea 62 accede a `db_ticket.id` → SQLAlchemy intenta un refresh → en contexto async sin greenlet → **`MissingGreenlet`**.

**El plan afirma** ([`PLAN...V22.md:933`](ESPECIFICACIONES%20DEL%20PROYECTO/PLAN_CORRECCION_ESTADO_POS_V22.md:933)):

> "Por eso los tests #1 y #4 **capturan el `ticket_id` por `account_num`** (una query nueva) en vez de usar `result.id`."

**Pero eso no resuelve nada:** el problema no es que el test use `result.id`; es que **`create_ticket` mismo lanza la excepción en la línea 62, antes de retornar**. El test nunca llega a la línea donde captura el `ticket_id`:

```python
# test #4, líneas 1169-1178
await pos_service.POSService().create_ticket(   # ← AQUÍ explota (MissingGreenlet)
    db, pos_schemas.TicketCreate(..., order_type="PEDIDO", ...),
)
# las líneas siguientes NUNCA se ejecutan
ticket_id = (await db.execute(select(...).where(account_num == acc))).scalar_one()
```

**Impacto:** el test #4 **falla con `MissingGreenlet`**, no con la aserción `order.status == "PAGADO"`. La corrección D13/D15 es **incompleta**: confunde "el test no debe usar `result.id`" con "el test debe manejar que `create_ticket` lanza".

**Corrección (dos opciones):**

1. **Reconocer el bug de producción y testearlo como tal:** envolver la llamada en `with pytest.raises(MissingGreenlet):` y documentar que es un **bug latente de producción** (el POS no puede cobrar un PEDIDO sin romperse). Esto convierte el test en un **guardián del bug** (rojo hasta que se arregle `service.py`).
2. **Evitar el camino que dispara el bug:** usar `order_type="VENTA_DIRECTA"` (default) y testear `_sync_order_from_ticket` **directamente** (llamándolo con un ticket ya creado), no a través de `create_ticket`.

La opción 1 es la honesta: el plan ya documenta en §7.5 que es un bug de producción. El test debe **capturarlo**, no esquivarlo.

**Nota:** el test #1 (línea 1095) usa el `order_type` default (`"VENTA_DIRECTA"`) → **no** dispara el sync → **no** lanza `MissingGreenlet`. Ese test sí funciona. Solo el #4 está roto.

---

## 2. DEFECTOS ALTOS (2)

### A15 — FASE 1, test #1: `assert isinstance(result["total"], float)` es correcto, pero el comentario cita mal la línea

El test #1 ([`PLAN...V22.md:426-427`](ESPECIFICACIONES%20DEL%20PROYECTO/PLAN_CORRECCION_ESTADO_POS_V22.md:426)) aserta:

```python
# A12: el total debe ser float (service.py:288 -> float(row.total)), no Decimal
assert isinstance(result["total"], float)
```

**Verificado:** [`service.py:288`](apps/api/modules/pos/service.py:288) es `"total": float(row.total)`. La aserción es **correcta** y la cita es **exacta**. **No es un defecto.** Se documenta aquí para dejar constancia de que fue auditado (la regla v22.5 exige auditar todo, no solo lo que falla).

*(Reclasificado: A15 no es un defecto. Se retira.)*

### A15 (real) — FASE 1, tests #9, #11 y #12: pasan `version=1` cuando la DB ya tiene `version=2` → reciben 409 en vez del resultado esperado

**Evidencia dura:**

- Test #9 ([`PLAN...V22.md:540-550`](ESPECIFICACIONES%20DEL%20PROYECTO/PLAN_CORRECCION_ESTADO_POS_V22.md:540)): hace `add_item` (versión 1→2) y luego `update_item_quantity(..., version=1)`. En [`service.py:459`](apps/api/modules/pos/service.py:459): `if payload.version is not None and payload.version != db_ticket.version` → `1 != 2` → **409**. El test espera `result["total"] == 40.0` → **FALLA**.
- Test #11 ([`PLAN...V22.md:572-582`](ESPECIFICACIONES%20DEL%20PROYECTO/PLAN_CORRECCION_ESTADO_POS_V22.md:572)): `add_item` (1→2) y luego `remove_item_from_ticket(..., version=1)`. En [`service.py:505`](apps/api/modules/pos/service.py:505): `1 != 2` → **409**. El test espera `result["total"] == 0.0` → **FALLA**.
- Test #12 ([`PLAN...V22.md:587-599`](ESPECIFICACIONES%20DEL%20PROYECTO/PLAN_CORRECCION_ESTADO_POS_V22.md:587)): `add_item` (1→2) y luego `remove_item_from_ticket(..., version=1)`. El guard de versión ([`service.py:505`](apps/api/modules/pos/service.py:505)) corre **antes** de la búsqueda del item ([`service.py:509`](apps/api/modules/pos/service.py:509)) → **409**, no 404. El test espera 404 → **FALLA**.

**Impacto:** 3 tests fallan. Es la **misma clase de defecto que D12** (hardcodear la versión), pero en la dirección opuesta: D12 hardcodeaba `2` (que coincidía por casualidad); A15 hardcodea `1` (que **no** coincide).

**Corrección:** capturar la versión real de la respuesta de `add_item` y pasarla:

```python
r1 = await svc.add_item_to_ticket(db, _payload_add(acc, producto_activo.id, sesion_activa.id, 1))
result = await svc.update_item_quantity(
    db, pos_schemas.TicketItemUpdate(account_num=acc, product_id=producto_activo.id,
                                     new_quantity=4, version=r1["version"]),
)
```

**Nota:** el test #10 (`version=99`) sí es correcto: espera 409 y obtiene 409.

---

## 3. DEFECTOS MEDIOS (2)

### M12 — FASE 1, test #2: la aserción `item.quantity == 3` puede fallar por `db.expire_all()`

El test #2 ([`PLAN...V22.md:451-458`](ESPECIFICACIONES%20DEL%20PROYECTO/PLAN_CORRECCION_ESTADO_POS_V22.md:451)) consulta `TicketItem` tras `add_item_to_ticket`, que hace `db.expire_all()` ([`service.py:441`](apps/api/modules/pos/service.py:441)). La query es nueva (`db.execute(select(...))`) → **debería** funcionar. Pero el test filtra **solo por `product_id`**, sin filtrar por `ticket_id`:

```python
select(pos_models.TicketItem).where(
    pos_models.TicketItem.product_id == producto_activo.id
)
```

Si otro test dejara un `TicketItem` con el mismo `product_id` (el fixture `producto_activo` es **compartido por función**, pero el `_limpiar()` borra por prefijo de `account_num`), el `.first()` podría devolver el item equivocado. **Riesgo bajo pero real.** Corrección: filtrar también por `ticket_id`.

### M13 — FASE 4, test #5: `assert lock2.locked_at >= locked_at_1` es un falso verde potencial

El test #5 ([`PLAN...V22.md:1367`](ESPECIFICACIONES%20DEL%20PROYECTO/PLAN_CORRECCION_ESTADO_POS_V22.md:1367)) aserta:

```python
assert lock2.locked_at >= locked_at_1  # renovado (no rechazado)
```

**Problema:** `>=` es **siempre verdadero** si el timestamp no cambió (por ejemplo, si la renovación no ocurrió pero el lock sigue ahí). La rama de renovación ([`occupancy.py:57-61`](apps/api/modules/pos/occupancy.py:57)) hace `lock.locked_at = utcnow()`. Si `utcnow()` devuelve el **mismo** valor (resolución de microsegundos, dos llamadas en el mismo tick), `>=` pasa **sin probar la renovación**.

**Corrección:** forzar un `locked_at` viejo antes de la 2ª llamada (por ejemplo, `lock1.locked_at = utcnow() - timedelta(minutes=10); await db.commit()`), y luego asertar `lock2.locked_at > locked_at_viejo`. Así el test **prueba** que la renovación ocurrió.

**Nota:** el test #2 (`ok is False`) sí prueba la rama de rechazo correctamente. El test #5 debe probar la rama de renovación con la misma contundencia.

---

## 4. LO QUE SÍ ESTÁ BIEN (auditado, para constancia)

| Elemento | Verificación | Veredicto |
|----------|--------------|-----------|
| FASE 1 `_limpiar()` orden | WarehouseEvent (309) y Order (319) antes de Ticket (329) | ✅ Correcto (A14 resuelto) |
| FASE 3 `_limpiar()` orden | WarehouseEvent (1000) y Order (1009) antes de Ticket (1019) | ✅ Correcto (A14 resuelto) |
| FASE 1 test #14 (D8) | Ticket OPEN + payload OPEN + version 99 → pasa guards 1-3 → 409 | ✅ Correcto |
| FASE 1 test #14 (M10) | `assert "versión" in exc.value.detail.lower()` — el detail real ([`service.py:132`](apps/api/modules/pos/service.py:132)) dice "Conflicto de versión" | ✅ Correcto |
| FASE 2 contrato del endpoint | `{"status": "ignored", "reason": "incomplete payload"}` ([`router.py:455`](apps/api/modules/pos/router.py:455)) | ✅ Correcto |
| FASE 3 test #1 (D14) | `json.loads(ev.items_json) == [{"sku": ..., "qty": 2}]` — el formato real ([`service.py:50`](apps/api/modules/pos/service.py:50)) | ✅ Correcto |
| FASE 3 test #3 (D5) | DRAFT + PAID desde otra terminal → 400 con "borrador" ([`service.py:123`](apps/api/modules/pos/service.py:123)) | ✅ Correcto |
| FASE 3 test #6 (M9) | DRAFT + PAID desde la misma terminal → el guard no aplica ([`service.py:120`](apps/api/modules/pos/service.py:120)) | ✅ Correcto |
| FASE 4 test #6 (D16) | `heartbeat` ([`occupancy.py:103`](apps/api/modules/pos/occupancy.py:103)) renueva y devuelve `True` | ✅ Correcto |
| FASE 4 test #2 | Segundo lock de otro usuario → `False` ([`occupancy.py:62`](apps/api/modules/pos/occupancy.py:62)) | ✅ Correcto |

---

## 5. RESUMEN DE DEFECTOS

| ID | Severidad | Fase | Test | Descripción | Corrección |
|----|-----------|------|------|-------------|------------|
| **D17** | **FATAL** | 1 | #1, #4 | Asertan `version == 1` tras una operación que la incrementa a 2 ([`service.py:434`](apps/api/modules/pos/service.py:434)) | Asertar `== 2` o leer la versión real |
| **D18** | **FATAL** | 2 | `_limpiar` | Borra `Ticket` antes de `WarehouseEvent`/`Order` (contradice §5.3) | Reordenar al orden de §5.3 |
| **D19** | **FATAL** | 3 | #4 | `create_ticket` con `order_type="PEDIDO"` lanza `MissingGreenlet` en [`service.py:62`](apps/api/modules/pos/service.py:62); la "corrección D13/D15" no lo evita | `pytest.raises(MissingGreenlet)` + documentar el bug, o testear `_sync_order_from_ticket` directo |
| **A15** | ALTO | 1 | #9, #11, #12 | Pasan `version=1` cuando la DB tiene 2 → 409 en vez del resultado esperado | Capturar `r1["version"]` y pasarla |
| **A16** | ALTO | 1 | #2 | Filtra `TicketItem` solo por `product_id`, sin `ticket_id` | Añadir filtro por `ticket_id` |
| **M12** | MEDIO | 1 | #2 | (ver A16 — se fusiona) | — |
| **M13** | MEDIO | 4 | #5 | `>=` es siempre verdadero; no prueba la renovación | Forzar `locked_at` viejo y asertar `>` |

*(Nota: A16 y M12 son el mismo hallazgo; se unifican como A16.)*

---

## 6. LECCIÓN DE LA REVISIÓN v6

**Regla adoptada (v22.6):** *toda corrección de un defecto debe re-auditarse contra el código del sujeto bajo prueba, porque una corrección puede introducir un defecto nuevo de la misma clase.*

Evidencia:
- Corregir D12 (hardcodear `2`) introdujo **A15** (hardcodear `1`).
- Corregir D13/D15 (no usar `result.id`) introdujo **D19** (no advirtió que `create_ticket` lanza antes de retornar).
- Corregir A14 en FASE 1 y FASE 3 **olvidó FASE 2** → **D18**.

**Corolario:** la auditoría no es "leer el plan"; es **leer el código que el plan cita y verificar que la aserción se sostiene**. El plan v22.5 cita [`service.py:386`](apps/api/modules/pos/service.py:386) (`version=1`) pero **no cita la línea 434** que la incrementa. Citar una línea sin leer la que la modifica es el mismo error que la regla v22.4 prohíbe.

---

## 7. VEREDICTO

**RECHAZADO.** El plan v22.5 no puede ejecutarse: **6 tests fallarían** (FASE 1: #1, #4, #9, #11, #12; FASE 3: #4) y el `_limpiar()` de FASE 2 tiene el orden viejo.

**Se requiere v22.6** con:
1. D17: corregir las 3 aserciones de versión.
2. D18: reordenar el `_limpiar()` de FASE 2.
3. D19: decidir si el test #4 captura el bug (`pytest.raises`) o lo esquiva (testear `_sync_order_from_ticket` directo).
4. A15: capturar `r1["version"]` en los tests #9, #11, #12.
5. A16: añadir filtro `ticket_id` en el test #2.
6. M13: forzar `locked_at` viejo en el test #5.

**Rollback intacto:** `git reset --hard v21-estable-3431861`.
