# REVISIÓN CRÍTICA v2 — PLAN v22.1: Tests del Backend del POS

> **Objeto revisado:** [`PLAN_CORRECCION_ESTADO_POS_V22.md`](ESPECIFICACIONES%20DEL%20PROYECTO/PLAN_CORRECCION_ESTADO_POS_V22.md) (versión v22.1, reformulada)
> **Fecha:** 2026-09-20
> **Autor:** Roo (Code mode)
> **Método:** segunda revisión crítica, **más agresiva que la primera**. Se buscaron defectos que la v1 no vio y defectos **introducidos por la propia reformulación**.
> **Veredicto:** **RECHAZADO DE NUEVO — 3 defectos fatales NUEVOS (D4, D5, D6) + 2 altos (A4, A5) + 1 medio (M3).** La reformulación v22.1 resolvió los 8 defectos de la v1, pero **introdujo/omitió 3 defectos fatales nuevos** que la harían fallar en ejecución.

---

## 0. RESUMEN EJECUTIVO

La v22.1 corrigió correctamente los 8 defectos de la v1 (verificado: D1, D2, D3, A1, A2, A3, M1, M2 están resueltos). **Pero la segunda revisión encontró 3 defectos fatales nuevos** que la v1 no detectó porque no había llegado a este nivel de profundidad:

| # | Severidad | Defecto | Impacto |
|---|-----------|---------|---------|
| **D4** | 🔴 FATAL | **`TicketItem` no tiene `ondelete="CASCADE"`.** El `_limpiar()` de la v22.1 borra `Ticket` por prefijo, pero los `TicketItem` creados por `add_item` **bloquean el DELETE con FK violation**. La limpieza **fallará** en FASE 1. | FASE 1 no se puede limpiar |
| **D5** | 🔴 FATAL | **`create_ticket` tiene un DRAFT GUARD** ([`service.py:113-125`](apps/api/modules/pos/service.py:113)): un DRAFT solo puede cobrarse (→PAID) desde la misma terminal. El test #1 de FASE 3 (PAID) **fallará con 400** si el ticket es DRAFT. | FASE 3 test #1 falla |
| **D6** | 🔴 FATAL | **`TicketItemComponent` (heladería) referencia `TicketItem`** ([`heladeria/models.py:60`](apps/api/modules/heladeria/models.py:60)). El orden de limpieza de la v22.1 **no lo incluye**. Si un `TicketItem` de prueba tuviera componentes, el DELETE falla. | Limpieza incompleta |
| **A4** | 🟠 ALTO | **`create_ticket` también valida versión** ([`service.py:129`](apps/api/modules/pos/service.py:129)) — la v22.1 no lo menciona y su mutación #1 (comentar `service.py:395`) **no afecta** a `create_ticket`. | Cobertura de mutación incompleta |
| **A5** | 🟠 ALTO | **La v22.1 afirma que `_limpiar()` "cascada a TicketItem"** (§4.1). **Falso**: no hay cascade. Es una afirmación no verificada — exactamente el pecado que la v1 criticó. | Afirmación falsa |
| **M3** | 🟡 MEDIO | La v22.1 propone `_limpiar_productos()` pero **no define el orden** respecto a `TicketItem` (que referencia `Product` por FK). Si se borra `Product` antes que `TicketItem`, FK violation. | Orden de limpieza ambiguo |

---

## 1. DEFECTOS FATALES NUEVOS

### 🔴 D4 — `TicketItem` no tiene cascade: la limpieza de FASE 1 fallará

**Afirmación de la v22.1** (§4.1, fixtures):
> "`_limpiar()` — borra tickets con prefijo `TEST_V22_ATOMIC_` (**cascada a `TicketItem`**)."

**Realidad verificada:**

1. [`pos/models.py:76`](apps/api/modules/pos/models.py:76): `ticket_id = Column(Integer, ForeignKey("tickets.id"))`. **NO hay `ondelete="CASCADE"`**.
2. [`pos/models.py:70`](apps/api/modules/pos/models.py:70): `items = relationship("TicketItem", back_populates="ticket")`. **NO hay `cascade="all, delete-orphan"`**.
3. Búsqueda de `ondelete|cascade=` en `apps/api/modules/pos/`: **0 resultados**. Confirmado: no hay cascade en el módulo POS.
4. El `_limpiar()` del precedente ([`test_bloque9d_3bugs.py:49-53`](apps/api/tests/test_bloque9d_3bugs.py:49)) hace `delete(Ticket).where(account_num LIKE ...)`. **Funciona solo porque esos tests NUNCA crean `TicketItem`** (solo insertan `Ticket` con `total=100`).

**Por qué es fatal:** la FASE 1 de la v22.1 **sí crea `TicketItem`** (vía `add_item_to_ticket`, que hace `db.add(new_item)` en [`service.py:425`](apps/api/modules/pos/service.py:425)). Al ejecutar `_limpiar()` → `DELETE FROM tickets WHERE account_num LIKE 'TEST_V22_ATOMIC_%'` → PostgreSQL lanza **`ForeignKeyViolationError`** porque existen filas en `ticket_items` que referencian esos tickets.

**Consecuencia:** la fixture `db` falla en el `finally: await _limpiar(session)`, **todos los tests de FASE 1 fallan en el teardown**, y la BD queda con basura.

**Corrección requerida:** `_limpiar()` debe borrar en orden inverso a las FKs:
```python
async def _limpiar(db):
    # 1. TicketItem (referencia Ticket y Product)
    await db.execute(
        delete(pos_models.TicketItem).where(
            pos_models.TicketItem.ticket_id.in_(
                select(pos_models.Ticket.id).where(
                    pos_models.Ticket.account_num.like(f"{ACC_PREFIX}%")
                )
            )
        )
    )
    # 2. Ticket
    await db.execute(delete(pos_models.Ticket).where(...))
    await db.commit()
```

---

### 🔴 D5 — `create_ticket` tiene un DRAFT GUARD que rompe el test #1 de FASE 3

**Afirmación de la v22.1** (§4.3, test #1):
> "`create_ticket` con status PAID inserta `WarehouseEvent` (outbox)."

**Realidad verificada** ([`service.py:111-125`](apps/api/modules/pos/service.py:111)):

```python
# v5.0 DRAFT GUARD: Un DRAFT solo puede cobrarse (→PAID) desde la misma terminal.
if db_ticket.status == "DRAFT" and ticket.status == "PAID":
    guard_req_tid = None
    if ticket.session_id:
        guard_session = await db.get(models.TerminalSession, ticket.session_id)
        guard_req_tid = guard_session.terminal_id if guard_session else None
    safe_guard_req = (guard_req_tid or "").strip().upper()
    safe_guard_db = (db_ticket.terminal_id or "").strip().upper()
    if safe_guard_req != safe_guard_db:
        raise HTTPException(status_code=400, detail="...borrador de la terminal...")
```

**Por qué es fatal:** si el test #1 de FASE 3 crea un ticket DRAFT (o reutiliza uno) y luego llama a `create_ticket` con `status="PAID"`, el guard compara `terminal_id` de la sesión del payload vs `terminal_id` del ticket. Si no coinciden → **400**, y el test #1 falla. La v22.1 **no menciona este guard**.

**Además:** el outbox solo se dispara si `db_ticket.status == "PAID"` ([`service.py:46`](apps/api/modules/pos/service.py:46)). Para que el test #1 pase, hay que:
1. Crear el ticket con `status="OPEN"` (no DRAFT) **o** asegurar que `terminal_id` coincida.
2. Enviar `status="PAID"` en el payload.

**Corrección requerida:** documentar el DRAFT GUARD y especificar que el test #1 crea el ticket con `status="OPEN"` y `terminal_id` consistente, o que usa la misma sesión.

---

### 🔴 D6 — `TicketItemComponent` (heladería) referencia `TicketItem`: el orden de limpieza está incompleto

**Afirmación de la v22.1** (§5.3, orden de limpieza):
> "`TicketItem → Ticket → WarehouseEvent → Order → TerminalSession → Product → TerminalLock`"

**Realidad verificada:**

1. [`heladeria/models.py:60`](apps/api/modules/heladeria/models.py:60): `ticket_item_id = Column(Integer, ForeignKey("ticket_items.id"), nullable=False)`.
2. [`test_heladeria_sync.py:17`](apps/api/tests/test_heladeria_sync.py:17) lo documenta explícitamente: *"TicketItemComponent (heladeria) referencia a TicketItem (pos)"*.

**Por qué es fatal:** el orden de la v22.1 borra `TicketItem` **antes** de `TicketItemComponent`. Si un `TicketItem` de prueba tuviera componentes (heladería), el DELETE de `TicketItem` falla con FK violation. Aunque FASE 1 no crea componentes de heladería, **el orden documentado es incorrecto** y sentaría un precedente peligroso para futuras fases.

**Corrección requerida:** el orden debe ser:
```
TicketItemComponent → TicketItem → Ticket → WarehouseEvent → Order → TerminalSession → Product → TerminalLock
```

---

## 2. DEFECTOS ALTOS NUEVOS

### 🟠 A4 — `create_ticket` también valida versión (la mutación #1 no lo cubre)

[`service.py:129`](apps/api/modules/pos/service.py:129):
```python
if ticket.version is not None and ticket.version != db_ticket.version:
    raise HTTPException(status_code=409, detail="Conflicto de versión...")
```

La v22.1 solo menciona la validación de versión en `add_item` (395), `update` (459) y `remove` (505). **Omite la de `create_ticket` (129)**. Además, la mutación #1 (comentar `service.py:395`) **no afecta** a `create_ticket`. Si se quiere cubrir el 409 de `create_ticket`, hace falta un test y una mutación propios.

### 🟠 A5 — La v22.1 afirma "cascada a TicketItem" sin verificar (el mismo pecado de la v1)

La v22.1 (§4.1) dice literalmente "cascada a `TicketItem`". **Es falso** (ver D4). La v1 criticó a la v22 por asumir cosas sin verificar; la v22.1 **repitió el error** al afirmar un cascade que no existe. Es la prueba de que la reformulación no fue lo bastante rigurosa.

### 🟠 A5-bis — `_upsert_ticket_header` incrementa versión en `_update_ticket_fields`

[`service.py:168`](apps/api/modules/pos/service.py:168): `db_ticket.version = (db_ticket.version or 1) + 1`. La v22.1 no lo menciona, pero es relevante para FASE 3: cada `create_ticket` sobre un ticket existente incrementa la versión. Los tests deben tenerlo en cuenta al asertar versiones.

---

## 3. DEFECTOS MEDIOS NUEVOS

### 🟡 M3 — Orden de `_limpiar_productos()` ambiguo

La v22.1 añade `_limpiar_productos()` (por `sku LIKE 'TEST_V22_%'`) pero **no define cuándo** se ejecuta respecto a `TicketItem`. `TicketItem.product_id` referencia `Product` ([`pos/models.py:77`](apps/api/modules/pos/models.py:77)). Si se borra `Product` antes que `TicketItem` → FK violation. **Corrección:** `_limpiar_productos()` debe correr **después** de borrar `TicketItem`.

---

## 4. LO QUE LA v22.1 ACIERTA (verificado)

Para ser justos, la reformulación resolvió correctamente los 8 defectos de la v1:

| Defecto v1 | ¿Resuelto en v22.1? | Evidencia |
|-----------|---------------------|-----------|
| D1 (prefijo `Product` en `sku`) | ✅ | §5.2 lo especifica |
| D2 (`sesion_terminal` prerrequisito + test #13) | ✅ | §4.1 |
| D3 (patrón de router + commit) | ✅ | §4.2, §5.5 |
| A1 (3 sitios de total) | ✅ | §1.2 |
| A2 (modelo `Product` verificado) | ✅ | §3.4 |
| A3 (mutaciones FASE 3 y 4) | ✅ | §6 |
| M1 (9 archivos listados) | ✅ | §3.5 |
| M2 (verificar HEAD) | ✅ | §6 FASE 0 |

**También acierta en:**
- La tabla de trazabilidad §0 (excelente práctica).
- La advertencia de que `emergency_save_ticket` commitea (§4.2).
- La nota de que `WarehouseEvent.ticket_id` y `Order.ticket_id` son UNIQUE (§4.3).
- La ampliación de imports para evitar `MissingGreenlet` (§3.3).

---

## 5. VEREDICTO Y CONDICIONES

**VEREDICTO: RECHAZADO (segunda vez).**

La v22.1 es **mucho mejor** que la v22, pero los 3 defectos fatales nuevos (D4, D5, D6) la hacen **inejecutable**:

- **D4** → la limpieza de FASE 1 falla con FK violation.
- **D5** → el test #1 de FASE 3 falla con 400 (DRAFT GUARD).
- **D6** → el orden de limpieza es incorrecto (falta `TicketItemComponent`).

**CONDICIONES PARA APROBAR (v22.2):**

1. **Corregir `_limpiar()`** para borrar `TicketItem` **antes** que `Ticket` (resuelve D4). Código concreto en §1-D4.
2. **Documentar el DRAFT GUARD** ([`service.py:113-125`](apps/api/modules/pos/service.py:113)) y especificar que el test #1 de FASE 3 usa `status="OPEN"` + `terminal_id` consistente (resuelve D5).
3. **Corregir el orden de limpieza** para incluir `TicketItemComponent` al inicio (resuelve D6).
4. **Añadir la validación de versión de `create_ticket`** ([`service.py:129`](apps/api/modules/pos/service.py:129)) a la cobertura y a las mutaciones (resuelve A4).
5. **Eliminar la afirmación falsa "cascada a TicketItem"** y sustituirla por el borrado explícito (resuelve A5).
6. **Definir el orden de `_limpiar_productos()`** (después de `TicketItem`) (resuelve M3).
7. **Mencionar el incremento de versión en `_update_ticket_fields`** ([`service.py:168`](apps/api/modules/pos/service.py:168)) (resuelve A5-bis).

**Estimación revisada:** 26 tests (25 + 1 para el 409 de `create_ticket`).

---

## 6. LECCIÓN (reforzada)

> "Toda afirmación de impacto debe verificarse leyendo el código, no razonarse."

La v22.1 **resolvió 8 defectos pero introdujo 3 nuevos** por el mismo motivo: afirmó "cascada a `TicketItem`" sin verificar que existiera. La lección de esta segunda revisión es más profunda:

> **Una reformulación no es inmune a los defectos de la versión que corrige.** Cada corrección debe re-verificarse con el mismo rigor que el original.

El patrón de fallo es consistente: **asumir el comportamiento de las FKs y de los guards sin leer los modelos**. La v22.2 debe anclarse a [`pos/models.py`](apps/api/modules/pos/models.py:1), [`heladeria/models.py`](apps/api/modules/heladeria/models.py:1) y [`service.py:93-200`](apps/api/modules/pos/service.py:93) antes de escribir una línea.

---

**FIN DE LA REVISIÓN CRÍTICA v2.**
