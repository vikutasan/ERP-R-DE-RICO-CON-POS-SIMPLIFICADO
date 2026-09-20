# REVISIÓN CRÍTICA v4 — PLAN_CORRECCION_ESTADO_POS_V22.md (v22.3)

**Fecha:** 2026-09-20
**Revisor:** Roo (Code mode)
**Objeto revisado:** [`PLAN_CORRECCION_ESTADO_POS_V22.md`](ESPECIFICACIONES%20DEL%20PROYECTO/PLAN_CORRECCION_ESTADO_POS_V22.md) en su versión **v22.3** (1371 líneas, 26 tests, 12 secciones)
**HEAD:** `3431861` (v21, pusheado) · **Tag de rollback:** `v20-estable-f624fcb`
**Método:** verificación **empírica del CÓDIGO** de los 26 tests contra el contrato **real** de los endpoints y servicios, leyendo [`router.py`](apps/api/modules/pos/router.py), [`schemas.py`](apps/api/modules/pos/schemas.py), [`models.py`](apps/api/modules/pos/models.py) y el frontend [`useBeforeUnload.js`](apps/pos/hooks/useBeforeUnload.js).

---

## 0. VEREDICTO

# ❌ RECHAZADO

El plan v22.3 **no puede ejecutarse tal cual**. La FASE 2 completa (4 de los 26 tests) está escrita contra un **contrato inventado** que no coincide con el endpoint real. Los 4 tests de `test_pos_emergency_save.py` **fallarían en la primera ejecución**, y —peor aún— el plan los declara como "contrato verificado (router.py:448-497)", lo que es **falso**.

Este es el **cuarto rechazo consecutivo** (v1, v2, v3, v4). La lección de la revisión v3 —*"un test que no especifica el valor esperado es un falso verde"*— se cumple de nuevo, pero en una forma más grave: **el test SÍ especifica el valor esperado, pero el valor esperado es incorrecto**. Es un falso verde que además **rompe la suite** (rojo espurio).

**Causa raíz:** los tests de la FASE 2 se redactaron a partir de la **prosa del plan** (que a su vez se redactó de memoria), no leyendo el código del endpoint. La FASE 1 y FASE 3/4 sí se derivaron del código real y son sólidas. La FASE 2 es la única isla defectuosa, pero es suficiente para rechazar.

---

## 1. DEFECTOS FATALES (bloquean la ejecución)

### D9 — FATAL — La clave del payload es `items`, no `cart`

**Ubicación del defecto:** [`PLAN...V22.md:799`](ESPECIFICACIONES%20DEL%20PROYECTO/PLAN_CORRECCION_ESTADO_POS_V22.md:799), `:826`, `:839` (tests #1, #3, #4 de FASE 2).

**Código del test (v22.3):**
```python
payload = {
    "account_num": acc,
    "terminal_id": TERM_1,
    "session_id": sesion_activa.id,
    "cart": [{"product_id": producto_activo.id, "quantity": 2, "price": 10.0}],  # ← "cart"
}
result = await pos_router.emergency_save_ticket(payload, db=db)
assert result == {"status": "saved", "account_num": acc}
```

**Código real del endpoint** ([`router.py:449-455`](apps/api/modules/pos/router.py:449)):
```python
account_num = payload.get("account_num")
items = payload.get("items", [])          # ← lee "items", NO "cart"
terminal_id = payload.get("terminal_id")

if not account_num or not items:
    logger.warning("Emergency save: payload incompleto, ignorando")
    return {"status": "ignored", "reason": "incomplete payload"}
```

**Consecuencia:** con `"cart"` en el payload, `payload.get("items", [])` devuelve `[]` → `not items` es `True` → el endpoint retorna `{"status": "ignored", "reason": "incomplete payload"}`. La aserción `result == {"status": "saved", "account_num": acc}` **falla**. Los 4 tests de FASE 2 fallan.

**Prueba independiente (frontend real):** [`useBeforeUnload.js:44-50`](apps/pos/hooks/useBeforeUnload.js:44) construye el payload real:
```javascript
const payload = JSON.stringify({
    account_num: accountNumRef.current,
    terminal_id: selectedTerminalRef.current || null,
    items: cartRef.current.map(i => ({ product_id: i.id, quantity: i.quantity || 1 })),  // ← "items"
    status: 'OPEN',
    emergency_save: true
});
```
El frontend envía `items`. El plan v22.3 envía `cart`. **El contrato real es `items`.**

**Corrección requerida:** renombrar la clave `"cart"` → `"items"` en los tests #1, #3 y #4, y en el nombre de los tests (`sin_cart` → `sin_items`, `cart_vacio` → `items_vacio`).

---

### D10 — FATAL — La forma de la respuesta incluye `reason` (no es el dict pelado)

**Ubicación del defecto:** [`PLAN...V22.md:819`](ESPECIFICACIONES%20DEL%20PROYECTO/PLAN_CORRECCION_ESTADO_POS_V22.md:819) y `:828` (tests #2 y #3).

**Código del test (v22.3):**
```python
# Test #2
result = await pos_router.emergency_save_ticket(
    {"account_num": f"{ACC_PREFIX}002", "terminal_id": TERM_1}, db=db
)
assert result == {"status": "ignored"}          # ← dict pelado

# Test #3
result = await pos_router.emergency_save_ticket(
    {"account_num": f"{ACC_PREFIX}003", "terminal_id": TERM_1, "cart": []}, db=db
)
assert result == {"status": "ignored"}          # ← dict pelado
```

**Código real del endpoint** ([`router.py:455`](apps/api/modules/pos/router.py:455)):
```python
return {"status": "ignored", "reason": "incomplete payload"}   # ← con "reason"
```

**Consecuencia:** `{"status": "ignored", "reason": "incomplete payload"} != {"status": "ignored"}` → **ambos tests fallan**.

**Nota:** el propio plan, en su tabla de contrato ([`PLAN...V22.md:672`](ESPECIFICACIONES%20DEL%20PROYECTO/PLAN_CORRECCION_ESTADO_POS_V22.md:672)), escribe `-> {"status": "ignored"}` — es decir, **la tabla también miente**. El defecto está en la tabla Y en los tests.

**Corrección requerida:** asertar el dict completo:
```python
assert result == {"status": "ignored", "reason": "incomplete payload"}
```

---

### D11 — FATAL — `TicketItemCreate(**item)` con la clave extra `price`

**Ubicación del defecto:** [`PLAN...V22.md:799`](ESPECIFICACIONES%20DEL%20PROYECTO/PLAN_CORRECCION_ESTADO_POS_V22.md:799) y `:839` (tests #1 y #4).

**Código del test (v22.3):**
```python
"cart": [{"product_id": producto_activo.id, "quantity": 2, "price": 10.0}],  # ← incluye "price"
```

**Código real del endpoint** ([`router.py:487`](apps/api/modules/pos/router.py:487)):
```python
items=[schemas.TicketItemCreate(**item) for item in items],
```

**Esquema real** ([`schemas.py:37-42`](apps/api/modules/pos/schemas.py:37)):
```python
class TicketItemBase(BaseModel):
    product_id: int
    quantity: int = 1

class TicketItemCreate(TicketItemBase):
    pass
```

`TicketItemCreate` **solo** acepta `product_id` y `quantity`. El test pasa además `price`.

**Consecuencia:** en Pydantic v2, el comportamiento por defecto es **ignorar** los campos extra (`model_config` no define `extra="forbid"`). Por tanto `TicketItemCreate(**{"product_id": 1, "quantity": 2, "price": 10.0})` **no lanza** — el `price` se descarta silenciosamente. **El test no falla por esta razón**, pero:

1. El `price` es **ruido engañoso**: sugiere que el endpoint lo usa, cuando no lo hace.
2. Si en el futuro alguien añade `extra="forbid"` a `TicketItemBase`, el test se rompe sin relación con el POS.
3. **El frontend real NO envía `price`** ([`useBeforeUnload.js:47`](apps/pos/hooks/useBeforeUnload.js:47)): `({ product_id: i.id, quantity: i.quantity || 1 })`. El test debe replicar el contrato real.

**Corrección requerida:** eliminar `"price": 10.0` de los items de los tests #1 y #4. El total esperado (`t.total == 20.0`) se calcula con el `price` del **Product** en BD (10.0), no con el del payload — así que la aserción `t.total == 20.0` sigue siendo válida.

---

## 2. DEFECTOS ALTOS (no bloquean, pero degradan la calidad)

### A9 — ALTO — El endpoint ignora el `session_id` del payload

**Ubicación:** [`PLAN...V22.md:798`](ESPECIFICACIONES%20DEL%20PROYECTO/PLAN_CORRECCION_ESTADO_POS_V22.md:798) y `:838`.

Los tests #1 y #4 envían `"session_id": sesion_activa.id` en el payload. El endpoint **lo ignora por completo**: busca la sesión por `terminal_id` ([`router.py:464-468`](apps/api/modules/pos/router.py:464)) y usa `session.id` ([`router.py:486`](apps/api/modules/pos/router.py:486)).

**Consecuencia:** el `session_id` del payload es **decorativo**. El test pasa porque el fixture `sesion_activa` tiene `terminal_id=TERM_1` y el payload también, así que la búsqueda por terminal encuentra la sesión. Pero el test **no prueba** lo que aparenta (que el `session_id` se respeta). Es un test que pasa por la razón equivocada.

**Corrección requerida:** o bien (a) eliminar `session_id` del payload (no se usa), o (b) añadir un test que verifique que el ticket se asocia a la sesión de la **terminal** indicada, no a la del `session_id`. Recomiendo (a) + un comentario explícito.

### A10 — ALTO — El fallback de sesión no está cubierto

**Ubicación:** ausencia en [`PLAN...V22.md:791-848`](ESPECIFICACIONES%20DEL%20PROYECTO/PLAN_CORRECCION_ESTADO_POS_V22.md:791).

El endpoint tiene un **fallback** ([`router.py:470-477`](apps/api/modules/pos/router.py:470)): si no encuentra sesión para `terminal_id`, usa **cualquier** sesión activa. Este comportamiento es crítico (es el que evita perder el ticket de emergencia) y **no tiene test**. El plan cubre "sin sesión activa" (implícitamente) pero no el fallback.

**Corrección requerida:** añadir un test #5: sesión activa en `TERM_2`, payload con `terminal_id=TERM_1` → el endpoint usa la sesión de `TERM_2` (fallback) y guarda igualmente.

### A11 — ALTO — El test #4 (idempotencia) no prueba idempotencia real

**Ubicación:** [`PLAN...V22.md:831-848`](ESPECIFICACIONES%20DEL%20PROYECTO/PLAN_CORRECCION_ESTADO_POS_V22.md:831).

El test #4 llama dos veces con el mismo payload y aserta `len(rows) == 1`. Pero `create_ticket` → `_upsert_ticket_header` hace **upsert por `account_num`** ([`service.py:93`](apps/api/modules/pos/service.py:93)), así que la segunda llamada **actualiza** el mismo ticket. El test verifica que no se duplica, lo cual es correcto, pero **no verifica que la segunda llamada no corrompe el estado** (p. ej. que el total no se duplica, que la versión incrementa correctamente).

**Corrección requerida:** añadir aserciones sobre el estado tras la segunda llamada: `t.total == 10.0` (no 20.0), y documentar que el upsert es por `account_num`.

---

## 3. DEFECTOS MEDIOS (deuda técnica)

### M6 — MEDIO — El docstring de FASE 2 declara un contrato falso

**Ubicación:** [`PLAN...V22.md:671-674`](ESPECIFICACIONES%20DEL%20PROYECTO/PLAN_CORRECCION_ESTADO_POS_V22.md:671).

```python
Contrato verificado (router.py:448-497):
  - sin cart / cart vacío  -> {"status": "ignored"}
  - error interno          -> {"status": "failed"}
  - éxito                  -> {"status": "saved", "account_num": <acc>}
```

Las tres líneas son **inexactas**:
- "sin cart / cart vacío" → debe ser "sin `items` / `items` vacío".
- `{"status": "ignored"}` → falta `"reason": "incomplete payload"`.
- `{"status": "failed"}` → falta `"reason": "no active session"` (o `"error": ...`).

El docstring dice "verificado" cuando **no lo estaba**. Esto es exactamente el patrón que la revisión v3 marcó como peligroso.

### M7 — MEDIO — El test #2 no crea sesión, pero el fixture `sesion_activa` sí

**Ubicación:** [`PLAN...V22.md:815`](ESPECIFICACIONES%20DEL%20PROYECTO/PLAN_CORRECCION_ESTADO_POS_V22.md:815).

El test #2 recibe `sesion_activa` como fixture, pero el endpoint retorna `ignored` **antes** de buscar sesión (porque `items` está vacío). El fixture es **innecesario** y confunde: sugiere que la sesión importa para el caso "ignored", cuando no.

**Corrección requerida:** quitar `sesion_activa` del test #2 (y #3).

### M8 — MEDIO — Falta el caso "error interno → failed"

El contrato real tiene una rama `except Exception` ([`router.py:495-497`](apps/api/modules/pos/router.py:495)) que retorna `{"status": "failed", "error": str(e)}`. El plan **no la cubre**. Es la rama que garantiza que el endpoint "nunca lanza" (crítico para `sendBeacon`).

**Corrección requerida:** añadir un test que fuerce un error (p. ej. `product_id` inexistente → `create_ticket` lanza 404) y verifique `result["status"] == "failed"`.

---

## 4. LO QUE ESTÁ BIEN (para no ser injusto)

- **FASE 1 (14 tests):** verificada contra [`service.py:351-533`](apps/api/modules/pos/service.py:351). El orden de limpieza de 8 pasos, los fixtures, `_payload_add`, y las aserciones de D7 (`status="DRAFT"`, `version=1`) son correctos.
- **FASE 3 (4 tests):** verificada contra [`service.py:32-62`](apps/api/modules/pos/service.py:32) y [`service.py:113-125`](apps/api/modules/pos/service.py:113). La corrección D5 (partir de `OPEN`, no `DRAFT`) es correcta.
- **FASE 4 (4 tests):** verificada contra [`occupancy.py`](apps/api/modules/pos/occupancy.py). Correcta.
- **§3.6 (tabla de FKs), §3.7 (valores hardcodeados), §3.8 (`expire_all`):** correctos y bien verificados.
- **La estructura de 12 secciones y el orden de limpieza:** correctos.

**El plan es 22/26 correcto. El problema es que los 4 tests de FASE 2 son los que cubren el flujo de `sendBeacon` — el más crítico para "no perder el carrito".**

---

## 5. CONDICIONES PARA APROBAR (v22.4)

El plan v22.4 debe:

1. **[D9]** Renombrar `"cart"` → `"items"` en tests #1, #3, #4 y en los nombres de los tests.
2. **[D10]** Asertar `{"status": "ignored", "reason": "incomplete payload"}` en tests #2 y #3.
3. **[D11]** Eliminar `"price"` de los items en tests #1 y #4.
4. **[A9]** Eliminar `session_id` del payload (o documentar que se ignora).
5. **[A10]** Añadir test #5: fallback de sesión por terminal.
6. **[A11]** Reforzar test #4: asertar `t.total == 10.0` tras la segunda llamada.
7. **[M6]** Corregir el docstring de FASE 2 con el contrato real.
8. **[M7]** Quitar `sesion_activa` de tests #2 y #3.
9. **[M8]** Añadir test #6: error interno → `{"status": "failed", "error": ...}`.
10. **Verificar empíricamente** cada aserción nueva leyendo [`router.py:438-497`](apps/api/modules/pos/router.py:438) — **no razonar**.

**Resultado esperado:** FASE 2 pasa de 4 a **6 tests**; el total del plan pasa de 26 a **28 tests**.

---

## 6. LECCIÓN DE LA REVISIÓN v4

> **Un test escrito en código puede seguir siendo un falso verde si el código no coincide con el contrato real del endpoint.**

Las revisiones v1-v3 verificaron la **prosa** del plan. La v4 verificó el **código** de los tests contra el **código** de los endpoints. La diferencia fue decisiva: la prosa decía "contrato verificado (router.py:448-497)" y el código decía `payload.get("items")`. **La prosa mintió; el código no.**

**Regla nueva (v22.4+):** *toda aserción de un test debe citar la línea exacta del código que la produce, y esa línea debe haberse leído en esta sesión.* El plan v22.3 citaba líneas (`router.py:493`) pero **no las había leído** — las infería de la prosa.

---

## 7. TRAZABILIDAD DE DEFECTOS

| ID | Severidad | Ubicación | Descripción | Estado |
|----|-----------|-----------|-------------|--------|
| D9 | FATAL | plan:799,826,839 | payload usa `cart`, endpoint lee `items` | Pendiente v22.4 |
| D10 | FATAL | plan:819,828 | respuesta incluye `reason`, test aserta dict pelado | Pendiente v22.4 |
| D11 | FATAL | plan:799,839 | item incluye `price`, esquema no lo acepta | Pendiente v22.4 |
| A9 | ALTO | plan:798,838 | `session_id` del payload se ignora | Pendiente v22.4 |
| A10 | ALTO | plan:791-848 | fallback de sesión sin test | Pendiente v22.4 |
| A11 | ALTO | plan:831-848 | test de idempotencia débil | Pendiente v22.4 |
| M6 | MEDIO | plan:671-674 | docstring declara contrato falso | Pendiente v22.4 |
| M7 | MEDIO | plan:815 | fixture innecesario en test #2 | Pendiente v22.4 |
| M8 | MEDIO | plan:791-848 | rama `except` sin test | Pendiente v22.4 |

---

## 8. DECISIÓN

**RECHAZADO.** Reformular como **v22.4** resolviendo D9, D10, D11 (fatales) + A9, A10, A11 (altos) + M6, M7, M8 (medios). La FASE 2 pasa de 4 a 6 tests. El total pasa de 26 a 28.

**No ejecutar FASE 0-5 hasta que v22.4 sea aprobado.**
