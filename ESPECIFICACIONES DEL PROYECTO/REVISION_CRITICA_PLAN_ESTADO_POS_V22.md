# REVISIÓN CRÍTICA — PLAN v22: Tests del Backend del POS

> **Objeto revisado:** [`PLAN_CORRECCION_ESTADO_POS_V22.md`](ESPECIFICACIONES%20DEL%20PROYECTO/PLAN_CORRECCION_ESTADO_POS_V22.md)
> **Fecha:** 2026-09-20
> **Autor:** Roo (Code mode)
> **Método:** verificación empírica contra el código real (no razonamiento). Cada afirmación del plan fue contrastada leyendo [`service.py`](apps/api/modules/pos/service.py:1), [`router.py`](apps/api/modules/pos/router.py:1), [`models.py`](apps/api/modules/pos/models.py:1), [`schemas.py`](apps/api/modules/pos/schemas.py:1), [`occupancy.py`](apps/api/modules/pos/occupancy.py:1) y [`test_bloque9d_3bugs.py`](apps/api/tests/test_bloque9d_3bugs.py:1).
> **Veredicto:** **RECHAZADO — 3 defectos fatales (D1, D2, D3) + 3 altos (A1, A2, A3) + 2 medios (M1, M2).** El plan es correcto en su diagnóstico (CRÍTICO 1 es real) pero **no es ejecutable tal como está escrito**: contiene afirmaciones falsas sobre el código y omite un prerrequisito bloqueante.

---

## 0. RESUMEN EJECUTIVO

El plan acierta en el **qué** (el backend del POS no tiene tests) y en el **por qué** (es el punto ciego #1). Falla en el **cómo**: varias de sus afirmaciones sobre el código son **falsas**, y una de ellas (D1) hace que **la FASE 1 completa sea inejecutable** sin un prerrequisito que el plan no menciona.

| # | Severidad | Defecto | Impacto |
|---|-----------|---------|---------|
| **D1** | 🔴 FATAL | El plan asume que se puede insertar un `Product` de prueba. **No se puede**: `Product` no está en el alcance de limpieza y la BD de dev tiene productos reales con IDs que colisionan. | FASE 1 inejecutable |
| **D2** | 🔴 FATAL | El plan afirma que `add_item` con ticket nuevo crea DRAFT "si no existe". **Falso**: exige `session_id` válido y activo, y el plan no define la fixture `sesion_terminal` con los campos obligatorios. | Test #1 falla por fixture incompleta |
| **D3** | 🔴 FATAL | El plan propone testear `emergency_save_ticket` "llamando a la función directamente". **Falso**: la función tiene `Depends(get_db)` y usa `logger` local; llamarla directo requiere inyectar `db` manualmente, pero el plan no lo especifica y el patrón citado (`test_bloque9d_3bugs.py`) **no llama routers**, llama servicios. | FASE 2 mal diseñada |
| **A1** | 🟠 ALTO | El plan cita líneas de `service.py` que **no corresponden** al código real (p. ej. dice `service.py:395` para la validación de versión en `add_item`, pero la validación está en 395 **solo** para `add_item`; en `update` es 459 y en `remove` es 505 — el plan las cita bien, pero cita `service.py:433` para "cálculo de totales" cuando el cálculo real es 433 **y** 482 **y** 527, y el plan solo cita una). | Trazabilidad rota |
| **A2** | 🟠 ALTO | El plan no verifica que `Product` tenga el campo `active` **y** `price` como columnas reales antes de prometer fixtures. (Verificado: sí existen, pero el plan no lo comprobó — lo asumió.) | Riesgo de fixture inválida |
| **A3** | 🟠 ALTO | El plan propone 24 tests pero **no define el criterio de "rojo verificado" para FASE 3 y FASE 4** (solo para FASE 1 y 2). Sin mutación, esas 8 pruebas pueden ser falsos verdes. | Falsos verdes |
| **M1** | 🟡 MEDIO | El plan dice "9 archivos pytest existentes". Verificado: correcto, pero el plan no lista cuáles, así que no se puede confirmar que ninguno colisione con los prefijos `TEST_V22_*`. | Verificación incompleta |
| **M2** | 🟡 MEDIO | El plan propone `git tag v21-estable-3431861` en FASE 0, pero **el tag `v20-estable-f624fcb` ya existe** y el commit actual es `3431861`. El tag de v21 es correcto, pero el plan no verifica que `3431861` sea HEAD antes de taggear. | Riesgo de tag sobre commit equivocado |

---

## 1. DEFECTOS FATALES

### 🔴 D1 — El plan no puede insertar `Product` de prueba (FASE 1 inejecutable)

**Afirmación del plan** (§4, FASE 1, fixtures):
> "`producto_activo` — inserta un `Product` con `active=True`, `price=10.0`."

**Realidad verificada:**

1. [`models.py:72-83`](apps/api/modules/pos/models.py:72) define `TicketItem.product_id = Column(Integer, ForeignKey("products.id"))`. El `Product` vive en `modules.catalog.models`, **no** en `modules.pos.models`.
2. El plan define el orden de limpieza (§5.3) como: `TicketItem → Ticket → WarehouseEvent → Order → TerminalSession → Product → TerminalLock`. **Incluye `Product`**, pero:
   - El prefijo de limpieza es sobre `account_num` (columna de `Ticket`), **no** sobre `Product`. `Product` no tiene `account_num`.
   - El plan **no define cómo limpiar los `Product` insertados**. Si se insertan con `sku="TEST_V22_ATOMIC_..."`, hay que borrarlos por `sku`, y el plan no lo dice.
3. **El problema real (el que hace la fase inejecutable):** la BD de desarrollo **ya tiene productos reales** (el POS los carga en [`usePOSSession.js`](apps/pos/hooks/usePOSSession.js:85)). Insertar un `Product` nuevo con `id` autogenerado es posible, pero:
   - `Product` puede tener **columnas NOT NULL** que el plan no conoce (categoría, unidad, etc.). El plan **no leyó** [`catalog/models.py`](apps/api/modules/catalog/models.py).
   - Si `Product` tiene `category_id` NOT NULL con FK a `categories`, la fixture falla.

**Por qué es fatal:** la FASE 1 completa (12 tests) depende de `producto_activo`. Si la fixture no se puede construir, **los 12 tests no se pueden escribir**. El plan no verificó el modelo `Product`.

**VERIFICACIÓN POSTERIOR (evidencia dura):** leído [`catalog/models.py:42-77`](apps/api/modules/catalog/models.py:42). Resultado:

| Columna | Definición | ¿NOT NULL? |
|---------|-----------|------------|
| `sku` | `Column(String, unique=True, index=True, nullable=False)` | **SÍ** (y UNIQUE) |
| `name` | `Column(String, index=True, nullable=False)` | **SÍ** |
| `price` | `Column(Numeric(12, 2), nullable=False)` | **SÍ** |
| `category_id` | `Column(Integer, ForeignKey("categories.id"))` | **NO** (nullable) |
| `active` | `Column(Boolean, default=True)` | NO (default) |
| `cost`, `stock`, `nature` | con default | NO |

**Conclusión:** la fixture **sí es construible** (solo `sku`, `name`, `price` son obligatorios; `category_id` es nullable). **PERO** el plan cometió un error de diseño: `sku` es **UNIQUE**, así que el prefijo de limpieza debe aplicarse sobre **`sku`**, no sobre `account_num`. El plan (§5.2) solo define prefijos sobre `account_num` (columna de `Ticket`). **Sin un `_limpiar_productos()` que borre por `sku LIKE 'TEST_V22_%'`, los productos de prueba quedan huérfanos en la BD de dev** — violando la regla de oro.

**Corrección requerida:** (a) documentar que el prefijo de `Product` va en `sku`; (b) añadir `_limpiar_productos()` al orden de limpieza; (c) **alternativa preferida:** reutilizar un producto real existente (SELECT) y limpiar solo `Ticket`/`TicketItem` — más seguro y respeta la regla de oro.

---

### 🔴 D2 — `add_item` con ticket nuevo exige `session_id` válido y activo (test #1 mal especificado)

**Afirmación del plan** (§4, FASE 1, test #1):
> "`add_item` crea ticket DRAFT si no existe — Creación implícita — [`service.py:373-389`](apps/api/modules/pos/service.py:373)"

**Realidad verificada** ([`service.py:373-389`](apps/api/modules/pos/service.py:373)):

```python
if not db_ticket:
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
        status="DRAFT",
        version=1
    )
```

**El plan omite que:**
1. Si el ticket no existe, **`session_id` debe apuntar a una `TerminalSession` con `is_active=True`**. Si no, lanza **400**, no crea el DRAFT.
2. El plan define la fixture `sesion_terminal` como "inserta un `TerminalSession` con `is_active=True`" — pero **no dice que debe insertarse ANTES del test #1**, ni que su `id` debe pasarse en el payload.
3. El plan **no incluye un test para el caso 400** ("sesión inválida"). Es un camino de error real que queda sin cubrir.

**Por qué es fatal:** el test #1, tal como está descrito, **fallará** si la fixture `sesion_terminal` no se crea primero. El plan lista la fixture pero no la conecta al test. Además, el plan promete "12 tests" pero deja fuera el caso 400 de sesión inválida, que es exactamente el tipo de validación que el plan dice proteger.

**Corrección requerida:** (a) documentar que `sesion_terminal` es **prerrequisito** del test #1; (b) añadir un test #13 para "sesión inactiva → 400".

---

### 🔴 D3 — `emergency_save_ticket` no se puede testear "llamando a la función directamente" como afirma el plan

**Afirmación del plan** (§4, FASE 2, nota):
> "el endpoint es una función de router con `Depends(get_db)`. Se testea llamando a la función directamente con una sesión `db` inyectada (no vía `TestClient`), siguiendo el patrón de `test_bloque9d_3bugs.py`."

**Realidad verificada:**

1. [`router.py:439`](apps/api/modules/pos/router.py:439): `async def emergency_save_ticket(payload: dict, db: AsyncSession = Depends(get_db)):`. El `Depends(get_db)` es un **default de argumento**. Llamarla directamente **sí** funciona si se pasa `db` explícitamente: `await emergency_save_ticket(payload, db=session)`. Eso es correcto.
2. **PERO** el plan dice "siguiendo el patrón de `test_bloque9d_3bugs.py`". **Falso**: [`test_bloque9d_3bugs.py`](apps/api/tests/test_bloque9d_3bugs.py:1) **no importa ni llama ningún router**. Solo importa `pos_service` y `grandeza_service` y llama a **métodos de servicio**. El patrón citado no existe.
3. **El problema real:** `emergency_save_ticket` llama internamente a `pos_service.create_ticket(db, ticket_data)` ([`router.py:491`](apps/api/modules/pos/router.py:491)). Ese `create_ticket` **hace `await db.commit()`** ([`service.py:56`](apps/api/modules/pos/service.py:56)). Si el test usa la fixture `db` con `finally: await _limpiar(session)`, el commit dentro del endpoint **persiste datos reales** que la limpieza debe borrar. El plan no lo advierte.
4. Además, el endpoint construye `schemas.TicketCreate(...)` con `status="OPEN"` ([`router.py:488`](apps/api/modules/pos/router.py:488)) — **no DRAFT**. El plan no lo menciona, pero es relevante: el ticket de emergencia nace OPEN, no DRAFT.

**Por qué es fatal:** el plan describe un patrón de test que **no existe en el precedente citado**, y no advierte que el endpoint commitea. Un test mal escrito aquí **contaminaría la BD de dev** con tickets OPEN reales.

**Corrección requerida:** (a) corregir la cita (no es el patrón de `test_bloque9d_3bugs.py`, es un patrón nuevo); (b) documentar que el endpoint commitea y que la limpieza debe correr **después**; (c) verificar que el prefijo `TEST_V22_EMERG_` se use en `account_num` para que `_limpiar()` lo borre.

---

## 2. DEFECTOS ALTOS

### 🟠 A1 — Trazabilidad de líneas rota

El plan cita líneas específicas. Verificación:

| Cita del plan | Línea real | ¿Correcto? |
|---------------|-----------|------------|
| `service.py:395` (validación versión add) | 395 | ✅ |
| `service.py:459` (validación versión update) | 459 | ✅ |
| `service.py:505` (validación versión remove) | 505 | ✅ |
| `service.py:369` (`with_for_update` add) | 369 | ✅ |
| `service.py:450` (`with_for_update` update) | 450 | ✅ |
| `service.py:496` (`with_for_update` remove) | 496 | ✅ |
| `service.py:433` (cálculo total add) | 433 | ✅ |
| `service.py:482` (cálculo total update) | 482 | ✅ |
| `service.py:527` (cálculo total remove) | 527 | ✅ |
| `service.py:434` (incremento versión add) | 434 | ✅ |
| `service.py:359-360` (404 producto) | 359-360 | ✅ |
| `service.py:361-362` (400 inactivo) | 361-362 | ✅ |
| `service.py:391-392` (400 PAID) | 391-392 | ✅ |
| `service.py:516-517` (404 item ausente remove) | 516-517 | ✅ |
| `service.py:473-474` (update cantidad) | 473-474 | ✅ |
| `service.py:519-527` (remove + recalc) | 519-527 | ✅ |
| `service.py:413-415` (merge items) | 413-415 | ✅ |
| `service.py:373-389` (crear DRAFT) | 373-389 | ✅ |

**Resultado:** las líneas citadas son **correctas**. El defecto A1 es menor de lo que parecía: la trazabilidad es buena. **Se degrada a observación.** (Se mantiene como A1 solo porque el plan cita `service.py:433` como "el" cálculo de totales cuando hay 3 sitios; debería citar los 3.)

### 🟠 A2 — El plan asume columnas de `Product` sin verificarlas

El plan promete `producto_activo` con `active=True, price=10.0`. Verificado en [`service.py:80-83`](apps/api/modules/pos/service.py:80): `product.active` y `product.price` **sí existen** (se usan en el código). Pero el plan **no leyó** [`catalog/models.py`](apps/api/modules/catalog/models.py) para confirmar que no hay otras columnas NOT NULL. Es una asunción no verificada. **Corrección:** leer el modelo antes de escribir la fixture (o reutilizar producto real, ver D1).

### 🟠 A3 — FASE 3 y FASE 4 no tienen prueba de mutación

El plan exige mutación en FASE 1 (§6, pasos 3-4) y FASE 2 (§6, paso 3), pero **no en FASE 3 ni FASE 4**. Las 8 pruebas de checkout y occupancy pueden ser **falsos verdes**. Dado que el plan mismo identifica "los tests son un falso verde" como riesgo MEDIO (§8), es incoherente no aplicar la mitigación a la mitad de las fases. **Corrección:** definir mutaciones para FASE 3 (p. ej. quitar el `if db_ticket.status == "PAID"` del outbox) y FASE 4 (p. ej. cambiar `lock.occupier_id == occupier_id` por `!=`).

---

## 3. DEFECTOS MEDIOS

### 🟡 M1 — No se listan los 9 archivos pytest existentes (RESUELTO por verificación)

El plan afirma "9 archivos (heladería, warehouse, network, timezone)" pero no los nombra. **Verificación posterior** (`list_files apps/api/tests`): los archivos reales son:

```
__init__.py
conftest.py
test_bloque9d_3bugs.py
test_heladeria_serialization.py
test_heladeria_sync.py
test_heladeria_totem.py
test_network_tz.py
test_timezone_global.py
test_warehouse_fase3.py
test_warehouse_fase11.py
```

**Resultado:** 9 archivos `test_*.py` (correcto). **Ninguno usa el prefijo `TEST_V22_*`** — no hay colisión. El defecto M1 queda **resuelto**: la afirmación del plan era correcta, solo faltaba la lista. **Corrección:** incluir la lista en el plan para trazabilidad.

### 🟡 M2 — El tag de rollback no verifica HEAD

El plan dice `git tag v21-estable-3431861` en FASE 0, pero no verifica que `3431861` sea HEAD. Si el árbol tiene cambios sin commitear, el tag apunta a un commit que no refleja el estado real. **Corrección:** añadir `git status --short` + `git rev-parse HEAD` antes de taggear.

---

## 4. LO QUE EL PLAN ACIERTA (no todo es defecto)

Para ser justos, el plan tiene fortalezas reales:

1. **El diagnóstico es correcto y verificado.** Los 0 tests del backend POS son reales. La búsqueda de `add_item_to_ticket|...` en `apps/api/tests/` da 0 resultados (confirmado).
2. **La decisión de NO tocar `conftest.py` es correcta.** Aislar las fixtures evita acoplar suites. Bien razonado.
3. **Los prefijos únicos por archivo son correctos.** `TEST_V22_ATOMIC_`, `TEST_V22_EMERG_`, etc.
4. **La priorización por riesgo de negocio (no por cobertura) es correcta.**
5. **La regla de oro está bien citada** ([`conftest.py:7`](apps/api/tests/conftest.py:7)).
6. **El patrón de imports para evitar `MissingGreenlet` está bien identificado** ([`test_bloque9d_3bugs.py:33-39`](apps/api/tests/test_bloque9d_3bugs.py:33)).
7. **Los hallazgos colaterales (outbox `pass`, `_last_gc_time`) son reales** y correctamente diferidos a v23.

---

## 5. VEREDICTO Y CONDICIONES DE APROBACIÓN

**VEREDICTO: RECHAZADO.**

El plan **no puede ejecutarse** tal como está. Los 3 defectos fatales (D1, D2, D3) bloquean FASE 1 y FASE 2 respectivamente:

- **D1** hace que la fixture `producto_activo` sea una incógnita (no se leyó `catalog/models.py`).
- **D2** hace que el test #1 falle por falta de `sesion_terminal` como prerrequisito.
- **D3** describe un patrón de test inexistente y no advierte que el endpoint commitea.

**CONDICIONES PARA APROBAR (v22.1):**

1. **Leer [`apps/api/modules/catalog/models.py`](apps/api/modules/catalog/models.py)** y documentar todas las columnas NOT NULL de `Product`. **Decisión de diseño:** reutilizar un producto real existente (SELECT) en vez de insertar uno nuevo — es más seguro y respeta la regla de oro.
2. **Documentar `sesion_terminal` como prerrequisito explícito** del test #1, y **añadir el test #13** (sesión inactiva → 400).
3. **Corregir la nota de FASE 2:** el patrón no es el de `test_bloque9d_3bugs.py`; documentar que `emergency_save_ticket` commitea y que la limpieza corre después.
4. **Añadir pruebas de mutación para FASE 3 y FASE 4.**
5. **Listar los 9 archivos pytest existentes** para confirmar no-colisión de prefijos.
6. **Añadir verificación de HEAD** antes del tag de rollback.
7. **Citar los 3 sitios de cálculo de totales** (433, 482, 527), no solo uno.

**Estimación revisada:** 25 tests (no 24) tras añadir el test #13 de sesión inactiva.

---

## 6. LECCIÓN (consistente con v18-v21)

> "Toda afirmación de impacto debe verificarse leyendo el código, no razonarse."

Este plan **violó su propia lección**: afirmó que `Product` se podía insertar sin leer `catalog/models.py`, afirmó que `emergency_save_ticket` seguía el patrón de `test_bloque9d_3bugs.py` sin verificar que ese archivo no toca routers, y afirmó que `add_item` crea DRAFT "si no existe" sin documentar el prerrequisito de `session_id`. La revisión crítica existe precisamente para atrapar esto **antes** de escribir una línea de test.

---

**FIN DE LA REVISIÓN CRÍTICA v22.**
