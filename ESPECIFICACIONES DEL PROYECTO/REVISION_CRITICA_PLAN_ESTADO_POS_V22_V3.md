# REVISIÓN CRÍTICA v3 — PLAN v22.2: Tests del Backend del POS

> **Objeto revisado:** [`PLAN_CORRECCION_ESTADO_POS_V22.md`](ESPECIFICACIONES%20DEL%20PROYECTO/PLAN_CORRECCION_ESTADO_POS_V22.md) (versión v22.2, reformulada)
> **Fecha:** 2026-09-20
> **Autor:** Roo (Code mode)
> **Método:** tercera revisión crítica, **autocrítica máxima**. Se buscaron defectos que las dos revisiones anteriores no vieron y, sobre todo, defectos **introducidos por la propia v22.2**.
> **Veredicto:** **RECHAZADO DE NUEVO — 2 defectos fatales NUEVOS (D7, D8) + 3 altos (A6, A7, A8) + 2 medios (M4, M5).** La v22.2 resolvió los 6 defectos de la v2, pero **introdujo 2 defectos fatales nuevos** y **arrastra 3 afirmaciones no verificadas** del mismo tipo que las revisiones anteriores criticaron.

---

## 0. RESUMEN EJECUTIVO

La v22.2 corrigió correctamente los 6 defectos de la v2 (verificado: D4, D5, D6, A4, A5, M3 están resueltos). **Pero la tercera revisión encontró 2 defectos fatales nuevos** que las dos anteriores no detectaron porque no habían llegado a este nivel de profundidad:

| # | Severidad | Defecto | Impacto |
|---|-----------|---------|---------|
| **D7** | 🔴 FATAL | **El test #1 de FASE 1 es imposible de escribir como está descrito.** El plan dice "`add_item` crea ticket DRAFT si no existe **y hay sesión activa**", pero `add_item_to_ticket` **NO recibe `status`** — siempre crea `status="DRAFT"` ([`service.py:385`](apps/api/modules/pos/service.py:385)). El test #1 debe asertar `status == "DRAFT"`, no "crea ticket". Además, el plan **no especifica** que el ticket creado por `add_item` nace con `version=1` y que el **primer** `add_item` con `version=1` **pasa** (la validación de versión ocurre DESPUÉS de crear). | Test #1 ambiguo |
| **D8** | 🔴 FATAL | **El test #14 (409 de `create_ticket`) es imposible de escribir como está descrito.** El plan dice "crear un ticket existente con `version=1` y enviar un payload con `version=99`". Pero `create_ticket` **primero valida el DRAFT GUARD y el guard de PAID**, y **solo después** la versión ([`service.py:105-135`](apps/api/modules/pos/service.py:105)). Si el ticket es `OPEN` con `version=1`, el payload con `version=99` **sí** dispara el 409 — pero el plan **no dice** que el ticket debe tener `status="OPEN"` **y** que el payload debe tener `status="OPEN"` (no PAID), o el guard de PAID lo intercepta antes. | Test #14 ambiguo |
| **A6** | 🟠 ALTO | **El plan afirma que `_get_items_and_total` "valida stock"** (§1.2 implícito). **Falso:** solo valida existencia y `active` ([`service.py:78-81`](apps/api/modules/pos/service.py:78)). No hay validación de stock. | Afirmación falsa |
| **A7** | 🟠 ALTO | **El plan cita `service.py:373-389` para "creación implícita"**, pero la creación real es **373-389** y la validación de sesión es **376-378**. El plan cita `377-378` para el test #13, que es correcto, pero el test #1 cita `373-389` sin mencionar que **el `status` es hardcodeado a DRAFT**. | Cita incompleta |
| **A8** | 🟠 ALTO | **El plan no menciona que `add_item_to_ticket` hace `db.expire_all()`** ([`service.py:441`](apps/api/modules/pos/service.py:441)). Tras `expire_all()`, cualquier acceso a un objeto ORM previamente cargado dispara un lazy-load → **`MissingGreenlet`** en el test. El plan advierte del `MissingGreenlet` por imports (§3.3) pero **no por `expire_all()`**. | Riesgo de `MissingGreenlet` |
| **M4** | 🟡 MEDIO | El plan dice que `_limpiar()` borra `WarehouseEvent` y `Order` "antes de borrar el Ticket (pasos 4 y 5)" (§5.3, nota). Pero el **código concreto** de `_limpiar()` en §5.3 **solo muestra 3 pasos** (TicketItemComponent, TicketItem, Ticket). **No muestra** los pasos 4-8. El código está incompleto. | Código incompleto |
| **M5** | 🟡 MEDIO | El plan afirma que `emergency_save_ticket` retorna `{"status": "saved"}`. **Verificado:** retorna `{"status": "saved", "account_num": account_num}` ([`router.py:493`](apps/api/modules/pos/router.py:493)). El test #1 debe asertar el dict **completo**, no solo `status`. | Aserción incompleta |

---

## 1. DEFECTOS FATALES NUEVOS

### 🔴 D7 — El test #1 de FASE 1 describe un comportamiento que `add_item_to_ticket` no tiene

**Afirmación de la v22.2** (§4.1, test #1):
> "`add_item` crea ticket DRAFT si no existe **y hay sesión activa**"

**Realidad verificada** ([`service.py:373-389`](apps/api/modules/pos/service.py:373)):

```python
if not db_ticket:
    # Crear ticket nuevo como DRAFT
    is_new = True
    session = await db.get(models.TerminalSession, payload.session_id)
    if not session or not session.is_active:
        raise HTTPException(status_code=400, detail="Sesión de terminal inválida")
    db_ticket = models.Ticket(
        account_num=payload.account_num,
        session_id=payload.session_id,
        terminal_id=payload.terminal_id or session.terminal_id,
        captured_by_id=payload.captured_by_id,
        total=0,
        status="DRAFT",          # ← HARDCODEADO
        version=1                # ← HARDCODEADO
    )
```

**Por qué es fatal:** el test #1 **no puede** asertar "crea ticket" sin especificar que:
1. El `status` es **siempre** `"DRAFT"` (no hay parámetro para cambiarlo).
2. El `version` es **siempre** `1`.
3. El `terminal_id` se toma de `payload.terminal_id` **o** de `session.terminal_id` (fallback).
4. La validación de versión ([`service.py:395`](apps/api/modules/pos/service.py:395)) ocurre **DESPUÉS** de crear el ticket → el primer `add_item` con `version=1` **pasa** (coincide con el `version=1` recién creado).

**Consecuencia:** si el test #1 se escribe como "crea ticket DRAFT" sin asertar `version == 1` y `terminal_id`, el test pasa pero **no protege nada**. Es un falso verde.

**Corrección requerida:** el test #1 debe asertar explícitamente:
```python
# Tras el primer add_item sobre un account_num inexistente:
assert result["status"] == "DRAFT"
assert result["version"] == 1
# Y en DB:
ticket = (await db.execute(select(Ticket).where(Ticket.account_num == ACC))).scalars().first()
assert ticket.status == "DRAFT"
assert ticket.version == 1
assert ticket.terminal_id == "TEST_V22_ATOMIC_T1"
```

---

### 🔴 D8 — El test #14 (409 de `create_ticket`) es imposible de escribir como está descrito

**Afirmación de la v22.2** (§4.1, test #14):
> "`create_ticket` con versión obsoleta → 409. Para provocar el 409, hay que crear un ticket existente con `version=1` y enviar un payload con `version=99`. El ticket debe tener `status="OPEN"` para no disparar el DRAFT GUARD ni el guard de PAID."

**Realidad verificada** ([`service.py:104-136`](apps/api/modules/pos/service.py:104)):

```python
if db_ticket:
    if db_ticket.status == "PAID":
        raise HTTPException(status_code=400, ...)          # ← guard 1 (PAID)
    if db_ticket.status == "DRAFT" and ticket.status == "PAID":
        ... raise HTTPException(status_code=400, ...)      # ← guard 2 (DRAFT GUARD)
    if ticket.version is not None and ticket.version != db_ticket.version:
        raise HTTPException(status_code=409, ...)          # ← validación de versión
```

**Por qué es fatal:** el plan dice "el ticket debe tener `status="OPEN"`", pero **no dice** que el **payload** también debe tener `status="OPEN"`. Si el payload tiene `status="PAID"`:
- El guard 1 no se dispara (el ticket es OPEN, no PAID).
- El guard 2 no se dispara (el ticket no es DRAFT).
- La validación de versión **sí** se dispara → 409. ✅

Pero si el payload tiene `status="PAID"` y el ticket es `OPEN`, el flujo **llega** a la validación de versión. **Sin embargo**, el plan también debe especificar que `create_ticket` **primero** llama a `_get_items_and_total` ([`service.py:35`](apps/api/modules/pos/service.py:35)), que **valida los productos**. Si el payload tiene items con productos inexistentes → **404 antes del 409**. El test #14 debe usar un producto válido.

**Consecuencia:** el test #14, escrito ingenuamente, puede fallar con 404 (producto) o 400 (guard) en vez de 409. Es un test frágil.

**Corrección requerida:** el test #14 debe:
1. Crear un ticket `OPEN` con `version=1` y `terminal_id` consistente.
2. Usar un **producto válido y activo** en el payload.
3. Enviar `version=99` y `status="OPEN"` (o `"PAID"`, ambos llegan a la validación).
4. Asertar `HTTPException.status_code == 409`.

---

## 2. DEFECTOS ALTOS NUEVOS

### 🟠 A6 — El plan afirma que `_get_items_and_total` "valida stock" (falso)

**Afirmación de la v22.2** (§1.2, implícito en la descripción de `create_ticket`):
> "`create_ticket` calcula total desde `_get_items_and_total`"

**Realidad verificada** ([`service.py:64-91`](apps/api/modules/pos/service.py:64)): el docstring dice *"Valida stock/existencia y calcula el valor total"*, pero el **código** solo valida:
- Existencia del producto ([`service.py:78-79`](apps/api/modules/pos/service.py:78)) → 404.
- `product.active` ([`service.py:80-81`](apps/api/modules/pos/service.py:80)) → 400.

**No hay ninguna validación de stock.** El docstring miente. El plan **no debe** repetir esa mentira. Es exactamente el pecado que las revisiones v1 y v2 criticaron: **repetir una afirmación del código sin verificarla**.

**Corrección requerida:** el plan debe decir "valida existencia y `active`", no "valida stock".

### 🟠 A7 — La cita del test #1 es incompleta

El plan cita [`service.py:373-389`](apps/api/modules/pos/service.py:373) para "creación implícita", pero **no menciona** que:
- El `status` es hardcodeado a `"DRAFT"` ([`service.py:385`](apps/api/modules/pos/service.py:385)).
- El `version` es hardcodeado a `1` ([`service.py:386`](apps/api/modules/pos/service.py:386)).
- El `terminal_id` tiene fallback a `session.terminal_id` ([`service.py:382`](apps/api/modules/pos/service.py:382)).

**Corrección requerida:** citar las líneas exactas y documentar los 3 valores hardcodeados.

### 🟠 A8 — `db.expire_all()` no está documentado (riesgo de `MissingGreenlet`)

[`service.py:441`](apps/api/modules/pos/service.py:441): `db.expire_all()` tras el commit. Esto **expira todos los objetos ORM** de la sesión. Si el test mantiene una referencia a un objeto (p. ej. `producto` o `sesion`) y lo usa después de `add_item_to_ticket`, el acceso dispara un lazy-load → **`MissingGreenlet`** en contexto async.

**Por qué es alto:** el plan advierte del `MissingGreenlet` por imports (§3.3) pero **no por `expire_all()`**. Un test que haga:
```python
producto = await _crear_producto(db)
result = await pos_service.POSService().add_item_to_ticket(db, payload)
assert producto.price == 10.0   # ← MissingGreenlet: producto fue expirado
```
fallará.

**Corrección requerida:** documentar que tras `add_item_to_ticket` / `update_item_quantity` / `remove_item_from_ticket` hay que **re-consultar** los objetos (o guardar sus IDs antes), porque `expire_all()` los invalida.

---

## 3. DEFECTOS MEDIOS NUEVOS

### 🟡 M4 — El código de `_limpiar()` en §5.3 está incompleto

El plan dice (§5.3, nota): *"`WarehouseEvent` y `Order` se limpian ... antes de borrar el `Ticket` (pasos 4 y 5)"*. Pero el **código concreto** de `_limpiar()` en §5.3 **solo muestra 3 pasos** (TicketItemComponent, TicketItem, Ticket) y luego salta a `_limpiar_productos()`. Los pasos 4-8 (WarehouseEvent, Order, TerminalSession, Product, TerminalLock) **no están en el código**.

**Corrección requerida:** completar el código de `_limpiar()` con los 8 pasos, o dividirlo en `_limpiar()` (FASE 1) y `_limpiar_checkout()` (FASE 3).

### 🟡 M5 — La aserción del test #1 de FASE 2 es incompleta

El plan dice (§4.2, test #1): *"Payload completo → `{"status": "saved"}`"*. **Verificado:** el endpoint retorna `{"status": "saved", "account_num": account_num}` ([`router.py:493`](apps/api/modules/pos/router.py:493)). El test debe asertar el dict completo.

**Corrección requerida:** `assert result == {"status": "saved", "account_num": ACC}`.

---

## 4. LO QUE LA v22.2 ACIERTA (verificado)

Para ser justos, la v22.2 resolvió correctamente los 6 defectos de la v2:

| Defecto v2 | ¿Resuelto en v22.2? | Evidencia |
|-----------|---------------------|-----------|
| D4 (`TicketItem` sin cascade) | ✅ | §5.3 borra `TicketItem` antes de `Ticket` |
| D5 (DRAFT GUARD) | ✅ | §3.7 + §5.6 |
| D6 (`TicketItemComponent`) | ✅ | §5.3 lo incluye al inicio |
| A4 (versión en `create_ticket`) | ✅ | test #14 + mutación 3 |
| A5 (afirmación falsa "cascada") | ✅ | eliminada |
| M3 (orden de `_limpiar_productos`) | ✅ | §5.3 |

**También acierta en:**
- La tabla de trazabilidad §0 (excelente práctica).
- La nueva §3.6 (tabla de FKs verificadas) — es la sección que faltaba.
- La nueva §3.7 (DRAFT GUARD + validación de versión documentados).
- La nueva §5.6 (cómo evitar el DRAFT GUARD).
- El hallazgo colateral §7.3 (FKs sin `ondelete`).

---

## 5. VEREDICTO Y CONDICIONES

**VEREDICTO: RECHAZADO (tercera vez).**

La v22.2 es **la mejor de las tres**, pero los 2 defectos fatales nuevos (D7, D8) la hacen **inejecutable tal cual**:

- **D7** → el test #1 de FASE 1 no especifica `status="DRAFT"` ni `version=1` → falso verde.
- **D8** → el test #14 no especifica el orden de los guards → puede fallar con 404/400 en vez de 409.

**CONDICIONES PARA APROBAR (v22.3):**

1. **Corregir el test #1 de FASE 1** para asertar `status == "DRAFT"`, `version == 1` y `terminal_id` (resuelve D7).
2. **Corregir el test #14** para especificar: ticket `OPEN` + producto válido + payload con `version=99` + asertar 409 (resuelve D8).
3. **Eliminar la afirmación "valida stock"** y sustituirla por "valida existencia y `active`" (resuelve A6).
4. **Documentar los 3 valores hardcodeados** de `add_item_to_ticket` (status, version, terminal_id fallback) (resuelve A7).
5. **Documentar `db.expire_all()`** y su riesgo de `MissingGreenlet` (resuelve A8).
6. **Completar el código de `_limpiar()`** con los 8 pasos (resuelve M4).
7. **Corregir la aserción del test #1 de FASE 2** al dict completo (resuelve M5).

**Estimación revisada:** 26 tests (sin cambios) + 2 tests reescritos (no añadidos).

---

## 6. LECCIÓN (reforzada por tercera vez)

> "Toda afirmación de impacto debe verificarse leyendo el código, no razonarse."

La v22.2 **resolvió 6 defectos pero introdujo 2 nuevos** por el mismo motivo: describió el comportamiento de `add_item_to_ticket` y `create_ticket` **sin leer el orden exacto de los guards y los valores hardcodeados**.

La lección de esta tercera revisión es aún más profunda:

> **Cada test debe anclarse a la línea exacta del código que verifica, incluyendo el orden de las validaciones y los valores hardcodeados. Un test que no especifica el valor esperado es un falso verde.**

El patrón de fallo es consistente en las 3 revisiones: **asumir el comportamiento del código sin leerlo línea por línea**. La v22.3 debe anclarse a [`service.py:32-62`](apps/api/modules/pos/service.py:32), [`service.py:93-200`](apps/api/modules/pos/service.py:93), [`service.py:351-533`](apps/api/modules/pos/service.py:351) y [`router.py:438-497`](apps/api/modules/pos/router.py:438) **antes de escribir una línea**.

---

## 7. NOTA SOBRE LA CONVERGENCIA

Tres revisiones consecutivas han encontrado defectos fatales nuevos. Esto **no es un fracaso del proceso** — es la evidencia de que el proceso funciona: cada revisión encontró defectos reales que habrían causado fallos en ejecución. Pero también indica que **el plan debe dejar de crecer en prosa y empezar a anclarse en código ejecutable**.

**Recomendación:** la v22.3 debe incluir, para cada test, el **código Python completo** del test (no solo la descripción). Así la revisión v4 puede verificar el código, no la prosa. Si la v22.3 incluye los 26 tests como código, la revisión v4 será la última.

---

**FIN DE LA REVISIÓN CRÍTICA v3.**
