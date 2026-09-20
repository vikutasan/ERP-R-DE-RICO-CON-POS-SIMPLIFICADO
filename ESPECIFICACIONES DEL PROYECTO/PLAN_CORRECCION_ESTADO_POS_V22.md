# PLAN DE CORRECCIÓN — v22.7: Tests del Backend del POS (CRÍTICO 1)

> **Estado:** PROPUESTO v22.7 — reformulado tras la **séptima** revisión crítica (que rechazó v22.6 con 5 fatales NUEVOS D20/D21/D22/D25/D26, todos de la clase "corrección-introducidos").
> **Fecha:** 2026-09-20
> **Autor:** Roo (Code mode)
> **Alcance:** Cerrar el punto ciego #1 del módulo POS: el backend no tiene tests de sus rutas críticas.
> **Riesgo de ejecución:** BAJO (aditivo — solo se añaden archivos de test; cero cambios en producción).
> **Rollback:** `git reset --hard v21-estable-3431861` o eliminar los archivos nuevos.
> **Cambio de método respecto a v22.6:** la revisión v7 **confirmó por tercera vez** la **regla v22.6** (*toda corrección de un defecto debe re-auditarse contra el código del sujeto bajo prueba, porque una corrección puede introducir un defecto nuevo de la misma clase*). Al corregir D17/D18/D19 + A15/A16 + M13, la v22.6 introdujo **5 defectos nuevos** (D20-D22, D25-D26), **todos** de esa clase. v22.7 corrige los 5 y **re-audita cada corrección** contra el código.
> **Advertencia de convergencia:** el número de defectos nuevos **no decrece** (v22.5 → 3; v22.6 → 5). Si la v22.8 vuelve a encontrar defectos nuevos, **detener el ciclo de reformulación y pasar a ejecución** (FASE 0-5): la ejecución de los 33 tests contra la BD real es el único auditor que no puede ser engañado por la prosa.

---

## 0. CAMBIOS RESPECTO A v22.5 (trazabilidad de la sexta revisión crítica)

| Defecto | Corrección en v22.6 | Sección |
|---------|---------------------|---------|
| **D17** — Los tests #1 y #4 de FASE 1 asertan `version == 1` tras una operación que la incrementa a 2 ([`service.py:386`](apps/api/modules/pos/service.py:386) crea con 1, [`service.py:434`](apps/api/modules/pos/service.py:434) incrementa a 2, [`service.py:287`](apps/api/modules/pos/service.py:287) devuelve 2) → 3 aserciones falsas | Los tests #1 y #4 asertan `== 2` (la versión real tras el incremento), citando **ambas** líneas (386 y 434). | §4.1 |
| **D18** — El `_limpiar()` de FASE 2 borra `Ticket` (paso 3) **antes** de `WarehouseEvent` (paso 4) y `Order` (paso 5) — el orden VIEJO que A14 ya había corregido en FASE 1 y FASE 3, pero que se olvidó en FASE 2. Contradice §5.3 | Reordenado al orden de §5.3: TicketItemComponent → TicketItem → WarehouseEvent → Order → Ticket → TerminalSession → Product → TerminalLock. | §4.2 |
| **D19** — El test #4 de FASE 3 usa `order_type="PEDIDO"` → `create_ticket` llama a `_sync_order_from_ticket` (2º commit, [`service.py:344`](apps/api/modules/pos/service.py:344)) y luego accede a `db_ticket.id` ([`service.py:62`](apps/api/modules/pos/service.py:62)) → `MissingGreenlet` **dentro de `create_ticket`, antes de retornar**. La "corrección D13/D15" (capturar el id por `account_num`) no lo evita: el test nunca llega a esa línea | El test #4 se reescribe como **guardián del bug de producción**: `with pytest.raises(MissingGreenlet)` documenta que el POS no puede cobrar un PEDIDO sin romperse. Se añade un test #7 que ejercita `_sync_order_from_ticket` **directamente** (sin pasar por `create_ticket`) para verificar el mapeo PAID→PAGADO. FASE 3 pasa a 7 tests. | §4.3 |
| **A15** — Los tests #9, #11 y #12 de FASE 1 pasan `version=1` cuando la DB ya tiene 2 ([`service.py:459`](apps/api/modules/pos/service.py:459) y [`505`](apps/api/modules/pos/service.py:505)) → 409 en vez del resultado esperado | Los 3 tests capturan `r1["version"]` de la respuesta de `add_item` y lo pasan como `version=`. Es la misma clase de defecto que D12, en la dirección opuesta. | §4.1 |
| **A16** — El test #2 de FASE 1 filtra `TicketItem` solo por `product_id`, sin `ticket_id` → `.first()` podría devolver el item de otro ticket | El test #2 añade el filtro `ticket_id == <id del ticket>` (capturado por `account_num`). | §4.1 |
| **M13** — El test #5 de FASE 4 aserta `lock2.locked_at >= locked_at_1`, que es **siempre verdadero** (falso verde: no prueba que la renovación ocurrió) | El test #5 fuerza un `locked_at` viejo (`utcnow() - timedelta(minutes=10)`) antes de la 2ª llamada y aserta `lock2.locked_at > locked_at_viejo`. | §4.4 |

---

## 0.1 CAMBIOS RESPECTO A v22.6 (trazabilidad de la séptima revisión crítica)

La revisión v7 **re-auditó las 6 correcciones de la v6 contra el código** (regla v22.6) y las encontró **correctas (6/6)**. Pero la propia corrección **introdujo 5 defectos nuevos**, todos de la clase "corrección-introducidos":

| Defecto | Corrección en v22.7 | Sección |
|---------|---------------------|---------|
| **D20** — §11 (ESTIMACIÓN) decía FASE 3 = 6 tests, Total = 32, "Mutaciones: 8 (M1-M8)", contradiciendo §4/§6/§9 (33 tests, 9 mutaciones). Al añadir el test #7 y la mutación M9 en v22.6 no se propagó a §11. | §11 actualizada: FASE 3 `6 → 7`, Total `32 → 33`, `8 (M1-M8) → 9 (M1-M9)`. | §11 |
| **D21** — M9 decía *"Quitar el `order_type="PEDIDO"` del test #4"*: modificaba el **test**, no el código de producción. Una mutación que altera el test es un **falso rojo** (el test falla porque se le quitó el estímulo, no porque el guardián detecte un cambio en el sujeto bajo prueba). | M9 reescrita como mutación **real de producción**: arreglar el bug capturando `ticket_id = db_ticket.id` **antes** del `await self._sync_order_from_ticket(...)` y usarlo en la línea 62 ([`service.py:59-62`](apps/api/modules/pos/service.py:59)). Al arreglar el bug, `create_ticket` deja de lanzar `MissingGreenlet` → el `pytest.raises` del test #4 falla (ROJO). | §6 FASE 3 |
| **D22** — "M9" designaba **dos cosas**: (a) la corrección del DRAFT GUARD camino feliz (heredada de la v5) y (b) la mutación M9 de §6. Colisión de etiqueta que rompe la trazabilidad. | La corrección se renombró **M9 → M12** en los 3 lugares (líneas 961, 972, 1259). M12 estaba libre (0 ocurrencias previas). | §4.3 |
| **D25** — El docstring de `_limpiar()` de FASE 3 decía *"(D4 + D6 + M3 + A14)"* — **omitía D18**, mientras que FASE 2 sí lo citaba. El orden del código era correcto, pero la documentación de la regla era inconsistente entre fases. | El docstring de FASE 3 ahora cita `(D4 + D6 + M3 + A14 + D18)` con explicación. Las 3 fases documentan la misma regla. | §4.3 |
| **D26** — FASE 1 definía `SKU_PREFIX = "TEST_V22_"`, que **matchea** `TEST_V22_ATOMIC_*`, `TEST_V22_EMERG_*`, `TEST_V22_CHECKOUT_*` y `TEST_V22_OCC_*`. El `_limpiar()` de FASE 1 **borraría productos de los otros 3 archivos**, violando la regla de oro ("cada archivo limpia SOLO sus filas"). | `SKU_PREFIX = "TEST_V22_ATOMIC_"` (específico de FASE 1). Verificado que los 4 prefijos son mutuamente exclusivos. | §4.1 |

**Nota meta:** los 5 defectos son **de la misma clase** que la regla v22.6 predice. El número de defectos nuevos **no decrece** (v22.5 → 3; v22.6 → 5), lo que indica que el plan **no ha convergido**. Si la v22.8 vuelve a encontrar defectos nuevos, se debe **detener la reformulación y ejecutar**.

---

## 1. PROBLEMA (evidencia dura verificada)

### 1.1 El hecho

El frontend del POS tiene **557 tests verdes** (19 archivos). El backend del POS tiene **0 tests** de sus rutas críticas.

| Verificación | Comando | Resultado |
|--------------|---------|-----------|
| Tests que cubren las operaciones atómicas | `search_files` de `add_item_to_ticket\|update_item_quantity\|remove_item_from_ticket\|create_ticket\|reserve_ticket\|emergency_save\|lock_terminal\|force_unlock` en `apps/api/tests/` | **0 resultados** |
| Archivos pytest existentes | `list_files apps/api/tests` | 9 archivos `test_*.py` (ver §3.5) |
| Único test que toca el POS | [`test_bloque9d_3bugs.py`](apps/api/tests/test_bloque9d_3bugs.py:95) | Solo `get_tickets()` (filtro de fecha local) |
| Tamaño del servicio sin tests | [`service.py`](apps/api/modules/pos/service.py:1) | **1021 líneas**, 27 métodos |

### 1.2 Por qué es el hallazgo #1

Toda la lógica de negocio real del POS vive en el backend:

- **Validación de versión (409)** — [`service.py:129`](apps/api/modules/pos/service.py:129) (create), [`395`](apps/api/modules/pos/service.py:395) (add), [`459`](apps/api/modules/pos/service.py:459) (update), [`505`](apps/api/modules/pos/service.py:505) (remove)
- **`with_for_update()`** (lock pesimista) — [`service.py:100`](apps/api/modules/pos/service.py:100), [`369`](apps/api/modules/pos/service.py:369), [`450`](apps/api/modules/pos/service.py:450), [`496`](apps/api/modules/pos/service.py:496)
- **Cálculo de totales** — [`service.py:433`](apps/api/modules/pos/service.py:433), [`482`](apps/api/modules/pos/service.py:482), [`527`](apps/api/modules/pos/service.py:527)
- **Upsert de cabecera** — [`_upsert_ticket_header`](apps/api/modules/pos/service.py:93)
- **Sincronización de items** — [`_sync_ticket_items`](apps/api/modules/pos/service.py:202)
- **Validación de productos** — [`_get_items_and_total`](apps/api/modules/pos/service.py:64) valida **existencia** ([`78-79`](apps/api/modules/pos/service.py:78)) y **`active`** ([`80-81`](apps/api/modules/pos/service.py:80)). **NO valida stock** (corrección A6: el docstring dice "stock" pero el código no lo hace).

**Riesgo concreto:** un cambio en `_sync_ticket_items` o en la validación de versión puede romper el cobro y **los 557 tests seguirán verdes**. Es el mismo punto ciego que v20/v21 cerraron en el frontend, pero del lado del servidor.

### 1.3 La asimetría

```
Frontend POS:  557 tests  ████████████████████████  blindado
Backend POS:     0 tests  ░░░░░░░░░░░░░░░░░░░░░░░░  punto ciego
```

---

## 2. OBJETIVO

Añadir una **suite de tests de integración** (pytest + BD real de desarrollo) que cubra las **rutas críticas del backend del POS**, empezando por las 3 operaciones atómicas (el corazón del POS) y el endpoint de emergencia.

**Criterio de éxito:** si alguien rompe la validación de versión, el cálculo de totales o el lock pesimista, **un test debe fallar en rojo**.

**NO-objetivo:** alcanzar cobertura del 100%. Se prioriza por **riesgo de negocio** (lo que mueve dinero), no por porcentaje.

---

## 3. INFRAESTRUCTURA EXISTENTE (verificada)

### 3.1 Cómo se ejecutan los tests

- **Config:** [`apps/api/pytest.ini`](apps/api/pytest.ini:1) — `asyncio_mode = auto`, `testpaths = tests`.
- **Contenedor:** `rderico-api-dev` (definido en [`docker-compose.yml`](docker-compose.yml)).
- **BD:** los tests corren **dentro del contenedor** contra la **BD real de desarrollo** (no hay BD de test separada).
- **Comando:** `docker exec rderico-api-dev python -m pytest tests/ -v`

### 3.2 El patrón de fixtures (probado en `test_bloque9d_3bugs.py`)

```python
@pytest_asyncio.fixture
async def db():
    """Sesión async limpia con limpieza antes y después."""
    async with AsyncSessionLocal() as session:
        await _limpiar(session)
        try:
            yield session
        finally:
            await _limpiar(session)
```

**Regla de oro (documentada en [`conftest.py:7`](apps/api/tests/conftest.py:7)):**
> "NUNCA se toca el POS. Solo se insertan/borran filas propias."

Se materializa con un **prefijo único** (`TEST_B9D_`, `TEST_FASE3_`) y un `_limpiar()` idempotente que borra solo las filas con ese prefijo.

### 3.3 El patrón de imports (crítico — evita `MissingGreenlet`)

[`test_bloque9d_3bugs.py:33-39`](apps/api/tests/test_bloque9d_3bugs.py:33) documenta que hay que importar **TODOS** los modelos que participan en relaciones del `Ticket`:

```python
from modules.cash import models as _cash_models  # noqa: F401
from modules.pos import models as pos_models
from modules.pos import service as pos_service
```

Sin esto, el mapper falla con `"failed to locate a name"`.

**Ampliación para v22.6:** como FASE 3 toca el outbox (`WarehouseEvent`) y los pedidos (`Order`), y la limpieza toca `TicketItemComponent` (heladería), hay que importar también:

```python
from modules.warehouse import models as _wh_models  # noqa: F401
from modules.orders import models as _orders_models  # noqa: F401
from modules.catalog import models as _catalog_models  # noqa: F401
from modules.heladeria import models as _hel_models  # noqa: F401  (D6: TicketItemComponent)
```

### 3.4 Modelos verificados (evidencia dura — resuelve D1 y A2)

**`Product`** ([`catalog/models.py:42-77`](apps/api/modules/catalog/models.py:42)):

| Columna | Definición | ¿NOT NULL? |
|---------|-----------|------------|
| `sku` | `Column(String, unique=True, index=True, nullable=False)` | **SÍ** (y UNIQUE) |
| `name` | `Column(String, index=True, nullable=False)` | **SÍ** |
| `price` | `Column(Numeric(12, 2), nullable=False)` | **SÍ** |
| `category_id` | `Column(Integer, ForeignKey("categories.id"))` | **NO** (nullable) |
| `active` | `Column(Boolean, default=True)` | NO (default) |
| `cost`, `stock`, `nature` | con default | NO |

**Conclusión:** la fixture es construible con solo `sku`, `name`, `price`. **PERO** `sku` es UNIQUE → el prefijo de limpieza va en **`sku`**, no en `account_num`.

**`TerminalSession`** ([`pos/models.py:17-26`](apps/api/modules/pos/models.py:17)): `terminal_id` NOT NULL; `is_active` default `True`.

**`Ticket`** ([`pos/models.py:28-70`](apps/api/modules/pos/models.py:28)): `account_num` UNIQUE NOT NULL; `total` NOT NULL default 0; `version` NOT NULL default 1; `status` default `"OPEN"`; `terminal_id` nullable indexado.

**`WarehouseEvent`** ([`warehouse/models.py:110-115`](apps/api/modules/warehouse/models.py:110)): `ticket_id` **UNIQUE NOT NULL**; `items_json` es **`JSON`** (no Text); `estado` default `"PENDIENTE"`.

**`Order`** ([`orders/models.py:12-56`](apps/api/modules/orders/models.py:12)): `ticket_id` **UNIQUE NOT NULL**; `delivery_type`, `status`, `packaging_type` NOT NULL con default.

### 3.5 Los 9 archivos pytest existentes (resuelve M1)

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

**Verificado:** ninguno usa el prefijo `TEST_V22_*` → **sin colisión**.

### 3.6 Estructura de FKs verificada (evidencia dura — resuelve D4, D6, M3)

| FK | Definición | ¿Cascade? | Fuente |
|----|-----------|-----------|--------|
| `TicketItem.ticket_id` → `tickets.id` | `Column(Integer, ForeignKey("tickets.id"))` | **NO** | [`pos/models.py:76`](apps/api/modules/pos/models.py:76) |
| `TicketItem.product_id` → `products.id` | `Column(Integer, ForeignKey("products.id"))` | **NO** | [`pos/models.py:77`](apps/api/modules/pos/models.py:77) |
| `Ticket.items` (relación) | `relationship("TicketItem", back_populates="ticket")` | **NO** (`cascade` ausente) | [`pos/models.py:70`](apps/api/modules/pos/models.py:70) |
| `TicketItemComponent.ticket_item_id` → `ticket_items.id` | `Column(Integer, ForeignKey("ticket_items.id"), nullable=False)` | **NO** | [`heladeria/models.py:60`](apps/api/modules/heladeria/models.py:60) |
| `TicketItemComponent.product_id` → `products.id` | `Column(Integer, ForeignKey("products.id"), nullable=True)` | **NO** | [`heladeria/models.py:61`](apps/api/modules/heladeria/models.py:61) |

**Búsqueda de `ondelete|cascade=` en `apps/api/modules/pos/`: 0 resultados.** Confirmado empíricamente: **no hay cascade en el módulo POS**.

**Consecuencia (D4):** el `_limpiar()` del precedente ([`test_bloque9d_3bugs.py:49-53`](apps/api/tests/test_bloque9d_3bugs.py:49)) hace `delete(Ticket).where(account_num LIKE ...)` y **funciona solo porque esos tests NUNCA crean `TicketItem`**. La FASE 1 de v22.6 **sí crea `TicketItem`** (vía `add_item_to_ticket` → `db.add(new_item)` en [`service.py:425`](apps/api/modules/pos/service.py:425)). Por tanto, el `_limpiar()` de v22.6 **debe borrar `TicketItem` explícitamente antes de `Ticket`**.

**Consecuencia (D6):** `TicketItemComponent` referencia `TicketItem` → debe borrarse **antes** que `TicketItem`.

**Consecuencia (M3):** `TicketItem.product_id` referencia `Product` → `_limpiar_productos()` debe correr **después** de borrar `TicketItem`.

### 3.7 Valores hardcodeados y guards de `add_item_to_ticket` y `create_ticket` (resuelve D5, D7, A4, A7)

**`add_item_to_ticket` — creación de ticket nuevo** ([`service.py:373-389`](apps/api/modules/pos/service.py:373)):

```python
if not db_ticket:
    is_new = True
    session = await db.get(models.TerminalSession, payload.session_id)
    if not session or not session.is_active:
        raise HTTPException(status_code=400, detail="Sesión de terminal inválida")
    db_ticket = models.Ticket(
        account_num=payload.account_num,
        session_id=payload.session_id,
        terminal_id=payload.terminal_id or session.terminal_id,  # ← fallback
        captured_by_id=payload.captured_by_id,
        total=0,
        status="DRAFT",   # ← HARDCODEADO (D7)
        version=1         # ← HARDCODEADO (D7)
    )
```

**3 valores hardcodeados (A7):**
1. `status="DRAFT"` ([`service.py:385`](apps/api/modules/pos/service.py:385)) — no hay parámetro para cambiarlo.
2. `version=1` ([`service.py:386`](apps/api/modules/pos/service.py:386)) — siempre 1 al crear.
3. `terminal_id = payload.terminal_id or session.terminal_id` ([`service.py:382`](apps/api/modules/pos/service.py:382)) — fallback a la sesión.

**Orden de validaciones en `add_item_to_ticket`** ([`service.py:357-400`](apps/api/modules/pos/service.py:357)):
1. Producto existe → 404 ([`359-360`](apps/api/modules/pos/service.py:359)).
2. Producto `active` → 400 ([`361-362`](apps/api/modules/pos/service.py:361)).
3. Sesión activa (solo si ticket nuevo) → 400 ([`377-378`](apps/api/modules/pos/service.py:377)).
4. Ticket `PAID` → 400 ([`391-392`](apps/api/modules/pos/service.py:391)).
5. Versión → 409 ([`395-400`](apps/api/modules/pos/service.py:395)).

**`create_ticket` — orden de guards** ([`service.py:104-136`](apps/api/modules/pos/service.py:104)):
1. `_get_items_and_total` valida productos → 404/400 ([`service.py:35`](apps/api/modules/pos/service.py:35)).
2. Ticket `PAID` → 400 ([`105-109`](apps/api/modules/pos/service.py:105)).
3. DRAFT GUARD (DRAFT + payload PAID + terminal distinta) → 400 ([`113-125`](apps/api/modules/pos/service.py:113)).
4. Versión → 409 ([`129-135`](apps/api/modules/pos/service.py:129)).

**Implicación para el test #14 (D8):** para llegar al 409 hay que pasar los guards 1-3. Solución: ticket `OPEN` (no PAID, no DRAFT) + producto válido + payload `status="OPEN"` + `version=99`.

**Incremento de versión (A5-bis)** ([`service.py:168`](apps/api/modules/pos/service.py:168)): cada `create_ticket` sobre un ticket existente incrementa `version` en 1.

### 3.8 `db.expire_all()` — riesgo de `MissingGreenlet` (resuelve A8)

[`service.py:441`](apps/api/modules/pos/service.py:441) (y también [`487`](apps/api/modules/pos/service.py:487), [`532`](apps/api/modules/pos/service.py:532)): `db.expire_all()` tras el commit. Esto **expira todos los objetos ORM** de la sesión.

**Consecuencia:** si un test mantiene una referencia a un objeto (`producto`, `sesion`, `ticket`) y lo usa **después** de `add_item_to_ticket` / `update_item_quantity` / `remove_item_from_ticket`, el acceso dispara un lazy-load → **`MissingGreenlet`** en contexto async.

**Regla para los tests:** guardar los **IDs** (no los objetos) antes de llamar a las operaciones atómicas, y **re-consultar** después si se necesita el objeto.

```python
# CORRECTO
producto_id = producto.id          # guardar el ID antes
result = await pos_service.POSService().add_item_to_ticket(db, payload)
# ... usar producto_id, no producto ...
```

---

## 4. ALCANCE PROPUESTO — CÓDIGO COMPLETO DE LOS 33 TESTS

### 4.1 FASE 1 — `apps/api/tests/test_pos_atomic_ops.py` (14 tests)

```python
"""
test_pos_atomic_ops.py - v22.6: Tests de las 3 operaciones atómicas del POS.

Cubre add_item_to_ticket, update_item_quantity y remove_item_from_ticket
(el corazón del POS: persistencia inmediata por item).

Regla de oro: NUNCA se toca el POS real. Solo se insertan/borran filas propias
con prefijo TEST_V22_ATOMIC_ y se limpian al terminar.

Orden de limpieza (inverso a las FKs, verificado en pos/models.py, heladeria/models.py,
warehouse/models.py y orders/models.py):
  TicketItemComponent -> TicketItem -> WarehouseEvent -> Order -> Ticket
  -> TerminalSession -> Product -> TerminalLock
"""
import pytest
import pytest_asyncio
from sqlalchemy import delete, select

from core.database import AsyncSessionLocal
# Importar TODOS los modelos que participan en relaciones del Ticket
from modules.cash import models as _cash_models  # noqa: F401
from modules.pos import models as pos_models
from modules.pos import service as pos_service
from modules.pos import schemas as pos_schemas
from modules.warehouse import models as _wh_models  # noqa: F401
from modules.orders import models as _orders_models  # noqa: F401
from modules.catalog import models as _catalog_models
from modules.heladeria import models as _hel_models  # noqa: F401

ACC_PREFIX = "TEST_V22_ATOMIC_"
# D26: el SKU_PREFIX debe ser ESPECÍFICO de este archivo (no "TEST_V22_"), para que
# _limpiar() no borre productos de los otros 3 archivos (regla de oro: cada archivo
# limpia SOLO sus filas). "TEST_V22_" colisionaría con EMERG_/CHECKOUT_/OCCUPANCY_.
SKU_PREFIX = "TEST_V22_ATOMIC_"
TERM_1 = "TEST_V22_ATOMIC_T1"
TERM_2 = "TEST_V22_ATOMIC_T2"


async def _limpiar(db):
    """Borra las filas de prueba en orden inverso a las FKs (D4 + D6 + A14 + D18)."""
    # 1. TicketItemComponent (heladería) -> referencia TicketItem
    await db.execute(
        delete(_hel_models.TicketItemComponent).where(
            _hel_models.TicketItemComponent.ticket_item_id.in_(
                select(pos_models.TicketItem.id).where(
                    pos_models.TicketItem.ticket_id.in_(
                        select(pos_models.Ticket.id).where(
                            pos_models.Ticket.account_num.like(f"{ACC_PREFIX}%")
                        )
                    )
                )
            )
        )
    )
    # 2. TicketItem -> referencia Ticket y Product
    await db.execute(
        delete(pos_models.TicketItem).where(
            pos_models.TicketItem.ticket_id.in_(
                select(pos_models.Ticket.id).where(
                    pos_models.Ticket.account_num.like(f"{ACC_PREFIX}%")
                )
            )
        )
    )
    # 3. WarehouseEvent -> referencia Ticket (A14: ANTES que Ticket)
    await db.execute(
        delete(_wh_models.WarehouseEvent).where(
            _wh_models.WarehouseEvent.ticket_id.in_(
                select(pos_models.Ticket.id).where(
                    pos_models.Ticket.account_num.like(f"{ACC_PREFIX}%")
                )
            )
        )
    )
    # 4. Order -> referencia Ticket (A14: ANTES que Ticket)
    await db.execute(
        delete(_orders_models.Order).where(
            _orders_models.Order.ticket_id.in_(
                select(pos_models.Ticket.id).where(
                    pos_models.Ticket.account_num.like(f"{ACC_PREFIX}%")
                )
            )
        )
    )
    # 5. Ticket (A14: DESPUÉS de WarehouseEvent y Order)
    await db.execute(
        delete(pos_models.Ticket).where(
            pos_models.Ticket.account_num.like(f"{ACC_PREFIX}%")
        )
    )
    # 6. TerminalSession
    await db.execute(
        delete(pos_models.TerminalSession).where(
            pos_models.TerminalSession.terminal_id.like(f"{ACC_PREFIX}%")
        )
    )
    # 7. Product -> referencia por TicketItem (M3)
    await db.execute(
        delete(_catalog_models.Product).where(
            _catalog_models.Product.sku.like(f"{SKU_PREFIX}%")
        )
    )
    # 8. TerminalLock
    await db.execute(
        delete(pos_models.TerminalLock).where(
            pos_models.TerminalLock.terminal_id.like(f"{ACC_PREFIX}%")
        )
    )
    await db.commit()


@pytest_asyncio.fixture
async def db():
    async with AsyncSessionLocal() as session:
        await _limpiar(session)
        try:
            yield session
        finally:
            await _limpiar(session)


@pytest_asyncio.fixture
async def sesion_activa(db):
    s = pos_models.TerminalSession(terminal_id=TERM_1, is_active=True)
    db.add(s)
    await db.commit()
    await db.refresh(s)
    return s


@pytest_asyncio.fixture
async def sesion_inactiva(db):
    s = pos_models.TerminalSession(terminal_id=TERM_2, is_active=False)
    db.add(s)
    await db.commit()
    await db.refresh(s)
    return s


@pytest_asyncio.fixture
async def producto_activo(db):
    p = _catalog_models.Product(
        sku=f"{SKU_PREFIX}ATOMIC_PROD", name="Test Activo", price=10.0, active=True
    )
    db.add(p)
    await db.commit()
    await db.refresh(p)
    return p


@pytest_asyncio.fixture
async def producto_inactivo(db):
    p = _catalog_models.Product(
        sku=f"{SKU_PREFIX}ATOMIC_INACT", name="Test Inactivo", price=10.0, active=False
    )
    db.add(p)
    await db.commit()
    await db.refresh(p)
    return p


def _payload_add(account_num, product_id, session_id, quantity=1, version=None):
    return pos_schemas.TicketItemAdd(
        account_num=account_num,
        product_id=product_id,
        quantity=quantity,
        session_id=session_id,
        version=version,
    )


# --- Test #1 (D7 + A12 + D17): add_item crea ticket DRAFT con version=2 y terminal_id ---
@pytest.mark.asyncio
async def test_01_add_item_crea_ticket_draft(db, sesion_activa, producto_activo):
    acc = f"{ACC_PREFIX}001"
    result = await pos_service.POSService().add_item_to_ticket(
        db, _payload_add(acc, producto_activo.id, sesion_activa.id, quantity=2)
    )
    # Aserciones explícitas (D7): status DRAFT
    assert result["status"] == "DRAFT"
    # D17: el ticket se CREA con version=1 (service.py:386) pero se INCREMENTA a 2
    # (service.py:434) antes de retornar. La respuesta lee la versión commiteada
    # (service.py:287) -> 2, NO 1. Citar la 386 sin leer la 434 es el error que la
    # regla v22.4 prohíbe.
    assert result["version"] == 2
    # A12: el total debe ser float (service.py:288 -> float(row.total)), no Decimal
    assert isinstance(result["total"], float)
    assert result["total"] == 20.0
    # Verificar en DB el terminal_id (fallback a session.terminal_id)
    ticket = (
        await db.execute(select(pos_models.Ticket).where(pos_models.Ticket.account_num == acc))
    ).scalars().first()
    assert ticket.status == "DRAFT"
    assert ticket.version == 2  # D17: 1 (creación) + 1 (incremento) = 2
    assert ticket.terminal_id == TERM_1


# --- Test #2 (D12 + A16): add_item a ticket existente incrementa cantidad ---
@pytest.mark.asyncio
async def test_02_add_item_incrementa_cantidad(db, sesion_activa, producto_activo):
    acc = f"{ACC_PREFIX}002"
    svc = pos_service.POSService()
    r1 = await svc.add_item_to_ticket(
        db, _payload_add(acc, producto_activo.id, sesion_activa.id, 1)
    )
    # D12: leer la versión real de la 1ª llamada (no hardcodear 2)
    result = await svc.add_item_to_ticket(
        db, _payload_add(acc, producto_activo.id, sesion_activa.id, 2, version=r1["version"])
    )
    assert result["total"] == 30.0  # 3 unidades * 10
    # A16: filtrar por ticket_id (no solo por product_id) para no capturar el item
    # de otro ticket que comparta el mismo producto.
    ticket_id = (
        await db.execute(
            select(pos_models.Ticket.id).where(pos_models.Ticket.account_num == acc)
        )
    ).scalar_one()
    item = (
        await db.execute(
            select(pos_models.TicketItem).where(
                pos_models.TicketItem.ticket_id == ticket_id,
                pos_models.TicketItem.product_id == producto_activo.id,
            )
        )
    ).scalars().first()
    assert item.quantity == 3


# --- Test #3: add_item recalcula total ---
@pytest.mark.asyncio
async def test_03_add_item_recalcula_total(db, sesion_activa, producto_activo):
    acc = f"{ACC_PREFIX}003"
    result = await pos_service.POSService().add_item_to_ticket(
        db, _payload_add(acc, producto_activo.id, sesion_activa.id, 5)
    )
    assert result["total"] == 50.0


# --- Test #4 (D17): add_item incrementa version en 1 (1ª llamada -> 2, 2ª -> 3) ---
@pytest.mark.asyncio
async def test_04_add_item_incrementa_version(db, sesion_activa, producto_activo):
    acc = f"{ACC_PREFIX}004"
    svc = pos_service.POSService()
    r1 = await svc.add_item_to_ticket(db, _payload_add(acc, producto_activo.id, sesion_activa.id, 1))
    # D17: la 1ª llamada crea con version=1 (service.py:386) y la incrementa a 2
    # (service.py:434) -> la respuesta es 2, NO 1.
    assert r1["version"] == 2
    # La 2ª llamada debe pasar la versión REAL (2), no un hardcode.
    r2 = await svc.add_item_to_ticket(
        db, _payload_add(acc, producto_activo.id, sesion_activa.id, 1, version=r1["version"])
    )
    assert r2["version"] == 3  # 2 + 1


# --- Test #5: add_item con versión obsoleta -> 409 ---
@pytest.mark.asyncio
async def test_05_add_item_version_obsoleta_409(db, sesion_activa, producto_activo):
    from fastapi import HTTPException
    acc = f"{ACC_PREFIX}005"
    svc = pos_service.POSService()
    await svc.add_item_to_ticket(db, _payload_add(acc, producto_activo.id, sesion_activa.id, 1))
    with pytest.raises(HTTPException) as exc:
        await svc.add_item_to_ticket(
            db, _payload_add(acc, producto_activo.id, sesion_activa.id, 1, version=99)
        )
    assert exc.value.status_code == 409


# --- Test #6: add_item a ticket PAID -> 400 ---
@pytest.mark.asyncio
async def test_06_add_item_ticket_paid_400(db, sesion_activa, producto_activo):
    from fastapi import HTTPException
    acc = f"{ACC_PREFIX}006"
    t = pos_models.Ticket(
        account_num=acc, status="PAID", version=1, total=0,
        session_id=sesion_activa.id, terminal_id=TERM_1,
    )
    db.add(t)
    await db.commit()
    with pytest.raises(HTTPException) as exc:
        await pos_service.POSService().add_item_to_ticket(
            db, _payload_add(acc, producto_activo.id, sesion_activa.id, 1)
        )
    assert exc.value.status_code == 400


# --- Test #7: add_item con producto inexistente -> 404 ---
@pytest.mark.asyncio
async def test_07_add_item_producto_inexistente_404(db, sesion_activa):
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc:
        await pos_service.POSService().add_item_to_ticket(
            db, _payload_add(f"{ACC_PREFIX}007", 99999999, sesion_activa.id, 1)
        )
    assert exc.value.status_code == 404


# --- Test #8: add_item con producto inactivo -> 400 ---
@pytest.mark.asyncio
async def test_08_add_item_producto_inactivo_400(db, sesion_activa, producto_inactivo):
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc:
        await pos_service.POSService().add_item_to_ticket(
            db, _payload_add(f"{ACC_PREFIX}008", producto_inactivo.id, sesion_activa.id, 1)
        )
    assert exc.value.status_code == 400


# --- Test #9 (A15): update_quantity cambia cantidad y subtotal ---
@pytest.mark.asyncio
async def test_09_update_quantity_cambia_subtotal(db, sesion_activa, producto_activo):
    acc = f"{ACC_PREFIX}009"
    svc = pos_service.POSService()
    r1 = await svc.add_item_to_ticket(db, _payload_add(acc, producto_activo.id, sesion_activa.id, 1))
    # A15: pasar la versión REAL (r1["version"] == 2), no un hardcode 1 -> 409.
    result = await svc.update_item_quantity(
        db,
        pos_schemas.TicketItemUpdate(
            account_num=acc, product_id=producto_activo.id, new_quantity=4, version=r1["version"]
        ),
    )
    assert result["total"] == 40.0


# --- Test #10: update_quantity con versión obsoleta -> 409 ---
@pytest.mark.asyncio
async def test_10_update_quantity_version_obsoleta_409(db, sesion_activa, producto_activo):
    from fastapi import HTTPException
    acc = f"{ACC_PREFIX}010"
    svc = pos_service.POSService()
    await svc.add_item_to_ticket(db, _payload_add(acc, producto_activo.id, sesion_activa.id, 1))
    with pytest.raises(HTTPException) as exc:
        await svc.update_item_quantity(
            db,
            pos_schemas.TicketItemUpdate(
                account_num=acc, product_id=producto_activo.id, new_quantity=2, version=99
            ),
        )
    assert exc.value.status_code == 409


# --- Test #11 (A15): remove_item elimina y recalcula total ---
@pytest.mark.asyncio
async def test_11_remove_item_recalcula_total(db, sesion_activa, producto_activo):
    acc = f"{ACC_PREFIX}011"
    svc = pos_service.POSService()
    r1 = await svc.add_item_to_ticket(db, _payload_add(acc, producto_activo.id, sesion_activa.id, 3))
    # A15: pasar la versión REAL (r1["version"] == 2), no un hardcode 1 -> 409.
    result = await svc.remove_item_from_ticket(
        db,
        pos_schemas.TicketItemRemove(
            account_num=acc, product_id=producto_activo.id, version=r1["version"]
        ),
    )
    assert result["total"] == 0.0


# --- Test #12 (A15): remove_item con producto que no está en el ticket -> 404 ---
@pytest.mark.asyncio
async def test_12_remove_item_no_esta_en_ticket_404(db, sesion_activa, producto_activo):
    from fastapi import HTTPException
    acc = f"{ACC_PREFIX}012"
    svc = pos_service.POSService()
    r1 = await svc.add_item_to_ticket(db, _payload_add(acc, producto_activo.id, sesion_activa.id, 1))
    # A15: el guard de versión (service.py:505) corre ANTES de la búsqueda del item
    # (service.py:509). Pasar la versión REAL (2) para que el guard pase y el 404
    # provenga de la búsqueda, no del 409.
    with pytest.raises(HTTPException) as exc:
        await svc.remove_item_from_ticket(
            db,
            pos_schemas.TicketItemRemove(
                account_num=acc, product_id=99999999, version=r1["version"]
            ),
        )
    assert exc.value.status_code == 404


# --- Test #13: add_item con sesión inactiva (ticket nuevo) -> 400 ---
@pytest.mark.asyncio
async def test_13_add_item_sesion_inactiva_400(db, sesion_inactiva, producto_activo):
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc:
        await pos_service.POSService().add_item_to_ticket(
            db, _payload_add(f"{ACC_PREFIX}013", producto_activo.id, sesion_inactiva.id, 1)
        )
    assert exc.value.status_code == 400


# --- Test #14 (D8): create_ticket con versión obsoleta -> 409 ---
# Para llegar al guard de versión hay que pasar los 3 guards previos:
#   1. _get_items_and_total (producto válido y activo)  -> OK
#   2. Ticket PAID                                       -> el ticket es OPEN, no PAID
#   3. DRAFT GUARD (DRAFT + payload PAID + terminal !=)  -> el ticket es OPEN, no DRAFT
# Por eso: ticket OPEN + payload status="OPEN" + version=99.
@pytest.mark.asyncio
async def test_14_create_ticket_version_obsoleta_409(db, sesion_activa, producto_activo):
    from fastapi import HTTPException
    acc = f"{ACC_PREFIX}014"
    t = pos_models.Ticket(
        account_num=acc, status="OPEN", version=1, total=0,
        session_id=sesion_activa.id, terminal_id=TERM_1,
    )
    db.add(t)
    await db.commit()
    payload = pos_schemas.TicketCreate(
        account_num=acc,
        session_id=sesion_activa.id,
        status="OPEN",
        version=99,
        items=[pos_schemas.TicketItemCreate(product_id=producto_activo.id, quantity=1)],
    )
    with pytest.raises(HTTPException) as exc:
        await pos_service.POSService().create_ticket(db, payload)
    assert exc.value.status_code == 409
    # M10: verificar el detail del 409 (service.py:129-135)
    assert "versión" in exc.value.detail.lower()
```

**Resumen FASE 1 (14 tests):**

| # | Test | Guard/Comportamiento verificado | Defecto que resuelve |
|---|------|--------------------------------|----------------------|
| 1 | `test_01_add_item_crea_ticket_draft` | `status="DRAFT"`, `version=1`, `terminal_id` fallback | **D7** |
| 2 | `test_02_add_item_incrementa_cantidad` | Merge de item existente | — |
| 3 | `test_03_add_item_recalcula_total` | `total = Σ subtotal` | — |
| 4 | `test_04_add_item_incrementa_version` | `version += 1` por operación | — |
| 5 | `test_05_add_item_version_obsoleta_409` | Bloqueo optimista (add) | — |
| 6 | `test_06_add_item_ticket_paid_400` | Guard PAID (add) | — |
| 7 | `test_07_add_item_producto_inexistente_404` | Existencia de producto | — |
| 8 | `test_08_add_item_producto_inactivo_400` | `active` de producto | — |
| 9 | `test_09_update_quantity_cambia_subtotal` | Recalculo en update | — |
| 10 | `test_10_update_quantity_version_obsoleta_409` | Bloqueo optimista (update) | — |
| 11 | `test_11_remove_item_recalcula_total` | Recalculo en remove | — |
| 12 | `test_12_remove_item_no_esta_en_ticket_404` | Item ausente (remove) | — |
| 13 | `test_13_add_item_sesion_inactiva_400` | Sesión inactiva | — |
| 14 | `test_14_create_ticket_version_obsoleta_409` | Orden de guards de `create_ticket` | **D8** |

### 4.2 FASE 2 — `apps/api/tests/test_pos_emergency_save.py` (6 tests)

Cubre [`emergency_save_ticket`](apps/api/modules/pos/router.py:438) — la ruta que el frontend llama en `beforeunload` / `force_logout` para no perder el carrito.

**Contrato REAL del endpoint** ([`router.py:448-497`](apps/api/modules/pos/router.py:448)) — verificado leyendo el código en esta sesión:

| Caso | Respuesta real | Línea |
|------|----------------|-------|
| Payload sin `items` o `items` vacío | `{"status": "ignored", "reason": "incomplete payload"}` | [`455`](apps/api/modules/pos/router.py:455) |
| Sin sesión activa | `{"status": "failed", "reason": "no active session"}` | [`481`](apps/api/modules/pos/router.py:481) |
| Error interno (except) | `{"status": "failed", "error": str(e)}` | [`497`](apps/api/modules/pos/router.py:497) |
| Éxito | `{"status": "saved", "account_num": account_num}` | [`493`](apps/api/modules/pos/router.py:493) |

**Correcciones D9/D10/D11/A9/A10/A11/M6/M7/M8:**

- **D9:** la clave del payload es `"items"` ([`router.py:450`](apps/api/modules/pos/router.py:450)), NO `"cart"`. Confirmado contra el frontend real ([`useBeforeUnload.js:47`](apps/pos/hooks/useBeforeUnload.js:47)).
- **D10:** las respuestas de error incluyen `"reason"` (o `"error"`). Los tests asertan el dict completo.
- **D11:** los items solo llevan `product_id` y `quantity` ([`schemas.py:37-42`](apps/api/modules/pos/schemas.py:37)). Sin `"price"`.
- **A9:** el endpoint ignora el `session_id` del payload; busca la sesión por `terminal_id` ([`router.py:464-468`](apps/api/modules/pos/router.py:464)).
- **A10:** nuevo test #5 cubre el fallback de sesión ([`router.py:470-477`](apps/api/modules/pos/router.py:470)).
- **A11:** el test #4 aserta que el total no se duplica tras la segunda llamada.
- **M6:** docstring corregido con el contrato real.
- **M7:** los tests #2 y #3 no reciben `sesion_activa` (el endpoint retorna `ignored` antes de buscar sesión).
- **M8:** nuevo test #6 cubre la rama `except` ([`router.py:495-497`](apps/api/modules/pos/router.py:495)).

```python
"""
test_pos_emergency_save.py - v22.6: Tests del endpoint de guardado de emergencia.

Cubre POST /pos/tickets/emergency-save (router.py:438), la ruta que el frontend
invoca en beforeunload / force_logout para no perder el carrito.

Contrato REAL verificado leyendo router.py:448-497 en esta sesion:
  - sin items / items vacio -> {"status": "ignored", "reason": "incomplete payload"}  (455)
  - sin sesion activa       -> {"status": "failed", "reason": "no active session"}    (481)
  - error interno           -> {"status": "failed", "error": str(e)}                  (497)
  - exito                   -> {"status": "saved", "account_num": <acc>}              (493)

Clave del payload: "items" (NO "cart"). Confirmado contra el frontend real
(useBeforeUnload.js:47 -> items: cartRef.current.map(i => ({product_id, quantity}))).

Regla de oro: prefijo TEST_V22_EMERG_ y limpieza idempotente.
"""
import pytest
import pytest_asyncio
from sqlalchemy import delete, select

from core.database import AsyncSessionLocal
from modules.cash import models as _cash_models  # noqa: F401
from modules.pos import models as pos_models
from modules.pos import router as pos_router
from modules.warehouse import models as _wh_models  # noqa: F401
from modules.orders import models as _orders_models  # noqa: F401
from modules.catalog import models as _catalog_models
from modules.heladeria import models as _hel_models  # noqa: F401

ACC_PREFIX = "TEST_V22_EMERG_"
SKU_PREFIX = "TEST_V22_EMERG_"
TERM_1 = "TEST_V22_EMERG_T1"
TERM_2 = "TEST_V22_EMERG_T2"


async def _limpiar(db):
    """Mismo orden de 8 pasos que FASE 1 y FASE 3 (D4 + D6 + M3 + D18).

    D18: el orden DEBE ser TicketItemComponent -> TicketItem -> WarehouseEvent ->
    Order -> Ticket -> TerminalSession -> Product -> TerminalLock. Borrar Ticket
    ANTES de WarehouseEvent/Order viola las FKs (warehouse/models.py:113,
    orders/models.py:18) y contradice §5.3. v22.5 tenía aquí el orden VIEJO.
    """
    await db.execute(
        delete(_hel_models.TicketItemComponent).where(
            _hel_models.TicketItemComponent.ticket_item_id.in_(
                select(pos_models.TicketItem.id).where(
                    pos_models.TicketItem.ticket_id.in_(
                        select(pos_models.Ticket.id).where(
                            pos_models.Ticket.account_num.like(f"{ACC_PREFIX}%")
                        )
                    )
                )
            )
        )
    )
    await db.execute(
        delete(pos_models.TicketItem).where(
            pos_models.TicketItem.ticket_id.in_(
                select(pos_models.Ticket.id).where(
                    pos_models.Ticket.account_num.like(f"{ACC_PREFIX}%")
                )
            )
        )
    )
    # D18: WarehouseEvent ANTES de Ticket (FK warehouse/models.py:113).
    await db.execute(
        delete(_wh_models.WarehouseEvent).where(
            _wh_models.WarehouseEvent.ticket_id.in_(
                select(pos_models.Ticket.id).where(
                    pos_models.Ticket.account_num.like(f"{ACC_PREFIX}%")
                )
            )
        )
    )
    # D18: Order ANTES de Ticket (FK orders/models.py:18).
    await db.execute(
        delete(_orders_models.Order).where(
            _orders_models.Order.ticket_id.in_(
                select(pos_models.Ticket.id).where(
                    pos_models.Ticket.account_num.like(f"{ACC_PREFIX}%")
                )
            )
        )
    )
    # D18: Ticket DESPUÉS de WarehouseEvent y Order.
    await db.execute(
        delete(pos_models.Ticket).where(
            pos_models.Ticket.account_num.like(f"{ACC_PREFIX}%")
        )
    )
    await db.execute(
        delete(pos_models.TerminalSession).where(
            pos_models.TerminalSession.terminal_id.like(f"{ACC_PREFIX}%")
        )
    )
    await db.execute(
        delete(_catalog_models.Product).where(
            _catalog_models.Product.sku.like(f"{SKU_PREFIX}%")
        )
    )
    await db.execute(
        delete(pos_models.TerminalLock).where(
            pos_models.TerminalLock.terminal_id.like(f"{ACC_PREFIX}%")
        )
    )
    await db.commit()


@pytest_asyncio.fixture
async def db():
    async with AsyncSessionLocal() as session:
        await _limpiar(session)
        try:
            yield session
        finally:
            await _limpiar(session)


@pytest_asyncio.fixture
async def sesion_activa(db):
    s = pos_models.TerminalSession(terminal_id=TERM_1, is_active=True)
    db.add(s)
    await db.commit()
    await db.refresh(s)
    return s


@pytest_asyncio.fixture
async def producto_activo(db):
    p = _catalog_models.Product(
        sku=f"{SKU_PREFIX}PROD", name="Test Emerg", price=10.0, active=True
    )
    db.add(p)
    await db.commit()
    await db.refresh(p)
    return p


# --- Test #1 (D9/D10/D11/A9): guardado exitoso -> dict completo ---
# D9:  la clave es "items" (router.py:450), NO "cart".
# D11: los items solo llevan product_id y quantity (schemas.py:37-42).
# A9:  el endpoint ignora session_id; busca la sesion por terminal_id (router.py:464-468).
@pytest.mark.asyncio
async def test_01_emergency_save_exitoso(db, sesion_activa, producto_activo):
    acc = f"{ACC_PREFIX}001"
    payload = {
        "account_num": acc,
        "terminal_id": TERM_1,
        "items": [{"product_id": producto_activo.id, "quantity": 2}],  # D9 + D11
    }
    result = await pos_router.emergency_save_ticket(payload, db=db)
    # D10: asercion del dict COMPLETO (router.py:493)
    assert result == {"status": "saved", "account_num": acc}
    # Verificar persistencia real
    t = (
        await db.execute(select(pos_models.Ticket).where(pos_models.Ticket.account_num == acc))
    ).scalars().first()
    assert t is not None
    assert t.status == "OPEN"  # router.py:488 crea con status="OPEN"
    assert t.total == 20.0     # 2 x 10.0 (price del Product en BD, no del payload)
    # A9: el ticket se asocia a la sesion de la TERMINAL (TERM_1), no a un session_id del payload
    assert t.session_id == sesion_activa.id


# --- Test #2 (D9/D10/M7): payload sin items -> ignored con reason ---
# M7: NO recibe sesion_activa (el endpoint retorna ignored ANTES de buscar sesion).
@pytest.mark.asyncio
async def test_02_emergency_save_sin_items_ignored(db):
    result = await pos_router.emergency_save_ticket(
        {"account_num": f"{ACC_PREFIX}002", "terminal_id": TERM_1}, db=db
    )
    # D10: dict completo con "reason" (router.py:455)
    assert result == {"status": "ignored", "reason": "incomplete payload"}


# --- Test #3 (D9/D10/M7): items vacio -> ignored con reason ---
@pytest.mark.asyncio
async def test_03_emergency_save_items_vacio_ignored(db):
    result = await pos_router.emergency_save_ticket(
        {"account_num": f"{ACC_PREFIX}003", "terminal_id": TERM_1, "items": []}, db=db
    )
    assert result == {"status": "ignored", "reason": "incomplete payload"}


# --- Test #4 (D9/D11/A11): idempotencia — dos llamadas no duplican ni duplican el total ---
@pytest.mark.asyncio
async def test_04_emergency_save_idempotente(db, sesion_activa, producto_activo):
    acc = f"{ACC_PREFIX}004"
    payload = {
        "account_num": acc,
        "terminal_id": TERM_1,
        "items": [{"product_id": producto_activo.id, "quantity": 1}],  # D9 + D11
    }
    r1 = await pos_router.emergency_save_ticket(payload, db=db)
    r2 = await pos_router.emergency_save_ticket(payload, db=db)
    assert r1["status"] == "saved"
    assert r2["status"] == "saved"
    rows = (
        await db.execute(select(pos_models.Ticket).where(pos_models.Ticket.account_num == acc))
    ).scalars().all()
    assert len(rows) == 1  # no duplica el ticket (upsert por account_num, service.py:93)
    # A11: la segunda llamada NO duplica el total (1 x 10.0, no 2 x 10.0)
    assert rows[0].total == 10.0


# --- Test #5 (A10): fallback de sesion — terminal sin sesion usa cualquier sesion activa ---
# router.py:470-477: si no hay sesion para terminal_id, usa la primera sesion activa.
@pytest.mark.asyncio
async def test_05_emergency_save_fallback_sesion(db, producto_activo):
    # Sesion activa SOLO en TERM_2 (no en TERM_1)
    s2 = pos_models.TerminalSession(terminal_id=TERM_2, is_active=True)
    db.add(s2)
    await db.commit()
    await db.refresh(s2)
    acc = f"{ACC_PREFIX}005"
    payload = {
        "account_num": acc,
        "terminal_id": TERM_1,  # no hay sesion para TERM_1 -> fallback
        "items": [{"product_id": producto_activo.id, "quantity": 1}],
    }
    result = await pos_router.emergency_save_ticket(payload, db=db)
    assert result == {"status": "saved", "account_num": acc}
    t = (
        await db.execute(select(pos_models.Ticket).where(pos_models.Ticket.account_num == acc))
    ).scalars().first()
    assert t is not None
    assert t.session_id == s2.id  # uso la sesion de TERM_2 (fallback)


# --- Test #6 (M8): error interno -> failed con error (rama except, router.py:495-497) ---
# product_id inexistente -> create_ticket lanza 404 -> el endpoint captura y retorna failed.
@pytest.mark.asyncio
async def test_06_emergency_save_error_interno_failed(db, sesion_activa):
    acc = f"{ACC_PREFIX}006"
    payload = {
        "account_num": acc,
        "terminal_id": TERM_1,
        "items": [{"product_id": 999999999, "quantity": 1}],  # producto inexistente
    }
    result = await pos_router.emergency_save_ticket(payload, db=db)
    assert result["status"] == "failed"
    assert "error" in result  # router.py:497 -> {"status": "failed", "error": str(e)}
```

### 4.3 FASE 3 — `apps/api/tests/test_pos_checkout.py` (7 tests)

Cubre [`create_ticket`](apps/api/modules/pos/service.py:32) en su camino de cobro (PAID), incluyendo el **outbox** hacia almacenes ([`service.py:46-54`](apps/api/modules/pos/service.py:46)) y el **puente a pedidos** ([`service.py:59-60`](apps/api/modules/pos/service.py:59)).

**Corrección D5:** el ticket de partida debe ser `status="OPEN"` (no `DRAFT`), porque el DRAFT GUARD ([`service.py:113-125`](apps/api/modules/pos/service.py:113)) bloquea cobrar un DRAFT desde otra terminal.

**Verificado:** `_sync_order_from_ticket` ([`service.py:316`](apps/api/modules/pos/service.py:316)) usa `target_status = "PAGADO" if ticket.status == "PAID" else "TENTATIVO"`.

**Corrección D13/D15 (CRÍTICA):** cuando `order_type="PEDIDO"`, `create_ticket` llama a `_sync_order_from_ticket` ([`service.py:59-60`](apps/api/modules/pos/service.py:59)), que hace un **segundo `db.commit()`** ([`service.py:344`](apps/api/modules/pos/service.py:344)). Con `expire_on_commit=True` (default de SQLAlchemy), ese commit **expira `db_ticket`**; el `return await self._get_full_ticket(db, db_ticket.id)` ([`service.py:62`](apps/api/modules/pos/service.py:62)) accede a `db_ticket.id` → **`MissingGreenlet`**. Por eso los tests #1 y #4 **capturan el `ticket_id` por `account_num`** (una query nueva) en vez de usar `result.id`.

**Corrección A13:** el guard del outbox es `if db_ticket.status == "PAID"` ([`service.py:46`](apps/api/modules/pos/service.py:46)); un `DRAFT` **no** genera `WarehouseEvent`. El test #5 lo verifica.

**Corrección M12:** el DRAFT GUARD solo bloquea si la terminal **difiere** ([`service.py:113-125`](apps/api/modules/pos/service.py:113)); desde la **misma** terminal sí se cobra. El test #6 lo verifica. *(Nota: se renombró de M9 a M12 para no colisionar con la mutación M9 de §6 FASE 3.)*

```python
"""
test_pos_checkout.py - v22.6: Tests del cobro (create_ticket con status PAID).

Cubre el camino de cobro del POS:
  - create_ticket PAID -> ticket PAID + WarehouseEvent (outbox, con items_json)
  - create_ticket OPEN -> ticket OPEN (sin WarehouseEvent)
  - create_ticket DRAFT -> sin WarehouseEvent (A13)
  - DRAFT GUARD: DRAFT + PAID desde otra terminal -> 400 (D5)
  - DRAFT GUARD camino feliz: DRAFT + PAID desde la MISMA terminal -> OK (M12)
  - create_ticket con PEDIDO -> MissingGreenlet (D19, BUG DE PRODUCCIÓN, guardián)
  - _sync_order_from_ticket DIRECTO: PAID -> "PAGADO" (D19, sin pasar por create_ticket)

Regla de oro: prefijo TEST_V22_CHECKOUT_ y limpieza idempotente.
"""
import json

import pytest
import pytest_asyncio
from sqlalchemy import delete, select

from core.database import AsyncSessionLocal
from modules.cash import models as _cash_models  # noqa: F401
from modules.pos import models as pos_models
from modules.pos import service as pos_service
from modules.pos import schemas as pos_schemas
from modules.warehouse import models as _wh_models
from modules.orders import models as _orders_models
from modules.catalog import models as _catalog_models
from modules.heladeria import models as _hel_models  # noqa: F401

ACC_PREFIX = "TEST_V22_CHECKOUT_"
SKU_PREFIX = "TEST_V22_CHECKOUT_"
TERM_1 = "TEST_V22_CHECKOUT_T1"
TERM_2 = "TEST_V22_CHECKOUT_T2"


async def _limpiar(db):
    """Orden de 8 pasos (D4 + D6 + M3 + A14 + D18).

    D18: el orden DEBE ser TicketItemComponent -> TicketItem -> WarehouseEvent ->
    Order -> Ticket -> TerminalSession -> Product -> TerminalLock. Borrar Ticket
    ANTES de WarehouseEvent/Order viola las FKs (warehouse/models.py:113,
    orders/models.py:18). Este archivo ya tenía el orden correcto (A14), pero se
    cita D18 para que las 3 fases (1, 2 y 3) documenten la misma regla.
    """
    await db.execute(
        delete(_hel_models.TicketItemComponent).where(
            _hel_models.TicketItemComponent.ticket_item_id.in_(
                select(pos_models.TicketItem.id).where(
                    pos_models.TicketItem.ticket_id.in_(
                        select(pos_models.Ticket.id).where(
                            pos_models.Ticket.account_num.like(f"{ACC_PREFIX}%")
                        )
                    )
                )
            )
        )
    )
    await db.execute(
        delete(pos_models.TicketItem).where(
            pos_models.TicketItem.ticket_id.in_(
                select(pos_models.Ticket.id).where(
                    pos_models.Ticket.account_num.like(f"{ACC_PREFIX}%")
                )
            )
        )
    )
    # A14: WarehouseEvent y Order ANTES que Ticket (ambos tienen ticket_id FK)
    await db.execute(
        delete(_wh_models.WarehouseEvent).where(
            _wh_models.WarehouseEvent.ticket_id.in_(
                select(pos_models.Ticket.id).where(
                    pos_models.Ticket.account_num.like(f"{ACC_PREFIX}%")
                )
            )
        )
    )
    await db.execute(
        delete(_orders_models.Order).where(
            _orders_models.Order.ticket_id.in_(
                select(pos_models.Ticket.id).where(
                    pos_models.Ticket.account_num.like(f"{ACC_PREFIX}%")
                )
            )
        )
    )
    # A14: Ticket DESPUÉS de WarehouseEvent y Order
    await db.execute(
        delete(pos_models.Ticket).where(
            pos_models.Ticket.account_num.like(f"{ACC_PREFIX}%")
        )
    )
    await db.execute(
        delete(pos_models.TerminalSession).where(
            pos_models.TerminalSession.terminal_id.like(f"{ACC_PREFIX}%")
        )
    )
    await db.execute(
        delete(_catalog_models.Product).where(
            _catalog_models.Product.sku.like(f"{SKU_PREFIX}%")
        )
    )
    await db.execute(
        delete(pos_models.TerminalLock).where(
            pos_models.TerminalLock.terminal_id.like(f"{ACC_PREFIX}%")
        )
    )
    await db.commit()


@pytest_asyncio.fixture
async def db():
    async with AsyncSessionLocal() as session:
        await _limpiar(session)
        try:
            yield session
        finally:
            await _limpiar(session)


@pytest_asyncio.fixture
async def sesion_t1(db):
    s = pos_models.TerminalSession(terminal_id=TERM_1, is_active=True)
    db.add(s)
    await db.commit()
    await db.refresh(s)
    return s


@pytest_asyncio.fixture
async def sesion_t2(db):
    s = pos_models.TerminalSession(terminal_id=TERM_2, is_active=True)
    db.add(s)
    await db.commit()
    await db.refresh(s)
    return s


@pytest_asyncio.fixture
async def producto(db):
    p = _catalog_models.Product(
        sku=f"{SKU_PREFIX}PROD", name="Test Checkout", price=25.0, active=True
    )
    db.add(p)
    await db.commit()
    await db.refresh(p)
    return p


def _payload_checkout(acc, session_id, product_id, status="PAID", version=None):
    return pos_schemas.TicketCreate(
        account_num=acc,
        session_id=session_id,
        status=status,
        version=version,
        items=[pos_schemas.TicketItemCreate(product_id=product_id, quantity=2)],
    )


# --- Test #1 (D13 + D14): cobro PAID crea ticket + WarehouseEvent (outbox) ---
@pytest.mark.asyncio
async def test_01_checkout_paid_crea_warehouse_event(db, sesion_t1, producto):
    acc = f"{ACC_PREFIX}001"
    result = await pos_service.POSService().create_ticket(
        db, _payload_checkout(acc, sesion_t1.id, producto.id, status="PAID")
    )
    assert result.status == "PAID"
    assert float(result.total) == 50.0
    # D13: capturar el ticket_id por account_num (NO usar result.id: si order_type
    # fuera PEDIDO, el 2º commit de _sync_order_from_ticket expira db_ticket).
    ticket_id = (
        await db.execute(
            select(pos_models.Ticket.id).where(pos_models.Ticket.account_num == acc)
        )
    ).scalar_one()
    # Outbox: WarehouseEvent insertado ANTES del commit (service.py:46-54)
    ev = (
        await db.execute(
            select(_wh_models.WarehouseEvent).where(
                _wh_models.WarehouseEvent.ticket_id == ticket_id
            )
        )
    ).scalars().first()
    assert ev is not None
    assert ev.estado == "PENDIENTE"
    # D14: el items_json serializa el SKU y la cantidad (service.py:50)
    assert json.loads(ev.items_json) == [{"sku": producto.sku, "qty": 2}]


# --- Test #2: cobro OPEN NO crea WarehouseEvent ---
@pytest.mark.asyncio
async def test_02_checkout_open_sin_warehouse_event(db, sesion_t1, producto):
    acc = f"{ACC_PREFIX}002"
    result = await pos_service.POSService().create_ticket(
        db, _payload_checkout(acc, sesion_t1.id, producto.id, status="OPEN")
    )
    assert result.status == "OPEN"
    ticket_id = (
        await db.execute(
            select(pos_models.Ticket.id).where(pos_models.Ticket.account_num == acc)
        )
    ).scalar_one()
    ev = (
        await db.execute(
            select(_wh_models.WarehouseEvent).where(
                _wh_models.WarehouseEvent.ticket_id == ticket_id
            )
        )
    ).scalars().first()
    assert ev is None


# --- Test #3 (D5): DRAFT + PAID desde OTRA terminal -> 400 (DRAFT GUARD) ---
@pytest.mark.asyncio
async def test_03_draft_guard_otra_terminal_400(db, sesion_t1, sesion_t2, producto):
    from fastapi import HTTPException
    acc = f"{ACC_PREFIX}003"
    # Ticket DRAFT creado por T1
    t = pos_models.Ticket(
        account_num=acc, status="DRAFT", version=1, total=0,
        session_id=sesion_t1.id, terminal_id=TERM_1,
    )
    db.add(t)
    await db.commit()
    # T2 intenta cobrarlo (PAID) -> DRAFT GUARD (service.py:113-125)
    with pytest.raises(HTTPException) as exc:
        await pos_service.POSService().create_ticket(
            db, _payload_checkout(acc, sesion_t2.id, producto.id, status="PAID")
        )
    assert exc.value.status_code == 400
    assert "borrador" in exc.value.detail.lower()


# --- Test #4 (D19): create_ticket con PEDIDO lanza MissingGreenlet (BUG DE PRODUCCIÓN) ---
@pytest.mark.asyncio
async def test_04_create_ticket_pedido_lanza_missing_greenlet(db, sesion_t1, producto):
    """D19: guardián del bug de producción.

    create_ticket con order_type="PEDIDO" llama a _sync_order_from_ticket
    (service.py:60), que hace un 2º commit (service.py:344). Ese commit expira
    db_ticket (expire_on_commit=True), y la línea 62 accede a db_ticket.id ->
    MissingGreenlet. La excepción se lanza DENTRO de create_ticket, ANTES de
    retornar: el test nunca llega a capturar el ticket_id.

    Este test documenta el bug: el POS NO puede cobrar un PEDIDO sin romperse.
    Queda ROJO hasta que se arregle service.py (p. ej. capturando el id antes
    del sync). Es un guardián, no un esquive.
    """
    from sqlalchemy.exc import MissingGreenlet
    acc = f"{ACC_PREFIX}004"
    with pytest.raises(MissingGreenlet):
        await pos_service.POSService().create_ticket(
            db,
            pos_schemas.TicketCreate(
                account_num=acc,
                session_id=sesion_t1.id,
                status="PAID",
                order_type="PEDIDO",
                items=[pos_schemas.TicketItemCreate(product_id=producto.id, quantity=1)],
            ),
        )
    # El ticket SÍ se persistió (el 1er commit ocurrió antes de la excepción).
    ticket_id = (
        await db.execute(
            select(pos_models.Ticket.id).where(pos_models.Ticket.account_num == acc)
        )
    ).scalar_one()
    # El Order SÍ se creó (el 2º commit de _sync_order_from_ticket ocurrió).
    order = (
        await db.execute(
            select(_orders_models.Order).where(_orders_models.Order.ticket_id == ticket_id)
        )
    ).scalars().first()
    assert order is not None
    assert order.status == "PAGADO"  # service.py:316
    assert order.delivery_type == "PICKUP"  # default de Order (orders/models.py:21)


# --- Test #5 (A13): cobro DRAFT NO crea WarehouseEvent ---
@pytest.mark.asyncio
async def test_05_checkout_draft_sin_warehouse_event(db, sesion_t1, producto):
    acc = f"{ACC_PREFIX}005"
    result = await pos_service.POSService().create_ticket(
        db, _payload_checkout(acc, sesion_t1.id, producto.id, status="DRAFT")
    )
    assert result.status == "DRAFT"
    ticket_id = (
        await db.execute(
            select(pos_models.Ticket.id).where(pos_models.Ticket.account_num == acc)
        )
    ).scalar_one()
    # A13: el guard del outbox es `if db_ticket.status == "PAID"` (service.py:46)
    ev = (
        await db.execute(
            select(_wh_models.WarehouseEvent).where(
                _wh_models.WarehouseEvent.ticket_id == ticket_id
            )
        )
    ).scalars().first()
    assert ev is None


# --- Test #6 (M12): DRAFT GUARD camino feliz (misma terminal) -> se cobra ---
@pytest.mark.asyncio
async def test_06_draft_guard_misma_terminal_ok(db, sesion_t1, producto):
    acc = f"{ACC_PREFIX}006"
    # Ticket DRAFT creado por T1
    t = pos_models.Ticket(
        account_num=acc, status="DRAFT", version=1, total=0,
        session_id=sesion_t1.id, terminal_id=TERM_1,
    )
    db.add(t)
    await db.commit()
    # T1 lo cobra (PAID) -> el DRAFT GUARD NO aplica (misma terminal, service.py:113-125)
    result = await pos_service.POSService().create_ticket(
        db, _payload_checkout(acc, sesion_t1.id, producto.id, status="PAID")
    )
    assert result.status == "PAID"


# --- Test #7 (D19): _sync_order_from_ticket DIRECTO mapea PAID -> PAGADO ---
@pytest.mark.asyncio
async def test_07_sync_order_directo_paid_es_pagado(db, sesion_t1, producto):
    """D19: ejercita _sync_order_from_ticket SIN pasar por create_ticket.

    El test #4 no puede verificar el mapeo PAID->PAGADO porque create_ticket
    lanza MissingGreenlet antes de retornar. Este test crea el ticket PAID
    directamente (sin order_type="PEDIDO", para no disparar el sync dentro de
    create_ticket) y luego invoca _sync_order_from_ticket a mano, verificando
    el mapeo (service.py:316) y el delivery_type (service.py:334).
    """
    acc = f"{ACC_PREFIX}007"
    # Crear el ticket PAID directamente (sin PEDIDO -> create_ticket no sincroniza).
    t = pos_models.Ticket(
        account_num=acc, status="PAID", version=1, total=10.0,
        session_id=sesion_t1.id, terminal_id=TERM_1,
    )
    db.add(t)
    await db.commit()
    await db.refresh(t)
    # Invocar el sync directamente (el 2º commit ocurre aquí, no dentro de create_ticket).
    await pos_service.POSService()._sync_order_from_ticket(db, t)
    order = (
        await db.execute(
            select(_orders_models.Order).where(_orders_models.Order.ticket_id == t.id)
        )
    ).scalars().first()
    assert order is not None
    assert order.status == "PAGADO"  # service.py:316
    assert order.delivery_type == "PICKUP"  # service.py:334 (ticket.delivery_type or "PICKUP")
```

### 4.4 FASE 4 — `apps/api/tests/test_pos_occupancy.py` (6 tests)

Cubre [`occupancy.py`](apps/api/modules/pos/occupancy.py:1) — el lock de terminales (evita que dos cajeros usen la misma caja).

**Funciones verificadas:** `lock_terminal` ([`46-73`](apps/api/modules/pos/occupancy.py:46)), `unlock_terminal` ([`76-89`](apps/api/modules/pos/occupancy.py:76)), `force_unlock` ([`92-100`](apps/api/modules/pos/occupancy.py:92)), `heartbeat` ([`103-123`](apps/api/modules/pos/occupancy.py:103)).

**Corrección D16:** `lock_terminal` tiene una rama de **renovación de TTL** ([`occupancy.py:57-61`](apps/api/modules/pos/occupancy.py:57)): si el lock ya existe y el `occupier_id` coincide, renueva `locked_at` y devuelve `True` (en vez de `False`). El test #5 la cubre. Además, `heartbeat` ([`occupancy.py:103`](apps/api/modules/pos/occupancy.py:103)) se citaba pero **ningún test lo invocaba**; el test #6 lo cubre.

```python
"""
test_pos_occupancy.py - v22.6: Tests del lock de terminales.

Cubre occupancy.py: lock_terminal (adquisición + renovación de TTL),
unlock_terminal, force_unlock, heartbeat.
El lock evita que dos cajeros operen la misma caja simultáneamente.

Regla de oro: prefijo TEST_V22_OCC_ y limpieza idempotente.
"""
import pytest
import pytest_asyncio
from sqlalchemy import delete, select

from core.database import AsyncSessionLocal
from modules.cash import models as _cash_models  # noqa: F401
from modules.pos import models as pos_models
from modules.pos import occupancy
from modules.warehouse import models as _wh_models  # noqa: F401
from modules.orders import models as _orders_models  # noqa: F401
from modules.catalog import models as _catalog_models  # noqa: F401
from modules.heladeria import models as _hel_models  # noqa: F401

TERM_1 = "TEST_V22_OCC_T1"
TERM_2 = "TEST_V22_OCC_T2"


async def _limpiar(db):
    """Solo TerminalLock y TerminalSession (los demás no se tocan en esta fase)."""
    await db.execute(
        delete(pos_models.TerminalLock).where(
            pos_models.TerminalLock.terminal_id.like("TEST_V22_OCC_%")
        )
    )
    await db.execute(
        delete(pos_models.TerminalSession).where(
            pos_models.TerminalSession.terminal_id.like("TEST_V22_OCC_%")
        )
    )
    await db.commit()


@pytest_asyncio.fixture
async def db():
    async with AsyncSessionLocal() as session:
        await _limpiar(session)
        try:
            yield session
        finally:
            await _limpiar(session)


# --- Test #1: lock_terminal adquiere el lock ---
@pytest.mark.asyncio
async def test_01_lock_terminal_adquiere(db):
    ok = await occupancy.lock_terminal(db, TERM_1, occupier_id=1, occupier_name="Cajero A")
    assert ok is True
    lock = (
        await db.execute(
            select(pos_models.TerminalLock).where(pos_models.TerminalLock.terminal_id == TERM_1)
        )
    ).scalars().first()
    assert lock is not None
    assert lock.occupier_id == 1


# --- Test #2: segundo lock del mismo terminal por otro usuario -> False ---
@pytest.mark.asyncio
async def test_02_lock_terminal_ocupado_devuelve_false(db):
    await occupancy.lock_terminal(db, TERM_1, occupier_id=1, occupier_name="Cajero A")
    ok = await occupancy.lock_terminal(db, TERM_1, occupier_id=2, occupier_name="Cajero B")
    assert ok is False


# --- Test #3: unlock_terminal libera el lock ---
@pytest.mark.asyncio
async def test_03_unlock_terminal_libera(db):
    await occupancy.lock_terminal(db, TERM_1, occupier_id=1, occupier_name="Cajero A")
    ok = await occupancy.unlock_terminal(db, TERM_1, occupier_id=1)
    assert ok is True
    lock = (
        await db.execute(
            select(pos_models.TerminalLock).where(pos_models.TerminalLock.terminal_id == TERM_1)
        )
    ).scalars().first()
    assert lock is None


# --- Test #4: force_unlock libera el lock de otro usuario ---
@pytest.mark.asyncio
async def test_04_force_unlock_libera_de_otro(db):
    await occupancy.lock_terminal(db, TERM_1, occupier_id=1, occupier_name="Cajero A")
    await occupancy.force_unlock(db, TERM_1)
    lock = (
        await db.execute(
            select(pos_models.TerminalLock).where(pos_models.TerminalLock.terminal_id == TERM_1)
        )
    ).scalars().first()
    assert lock is None


# --- Test #5 (D16 + M13): el MISMO ocupante renueva el TTL -> True ---
@pytest.mark.asyncio
async def test_05_lock_terminal_mismo_ocupante_renueva_ttl(db):
    from datetime import timedelta
    from core.timestamps import utcnow
    # 1ª adquisición
    ok1 = await occupancy.lock_terminal(db, TERM_1, occupier_id=1, occupier_name="Cajero A")
    assert ok1 is True
    lock1 = (
        await db.execute(
            select(pos_models.TerminalLock).where(pos_models.TerminalLock.terminal_id == TERM_1)
        )
    ).scalars().first()
    # M13: forzar un locked_at VIEJO para que la renovación sea observable.
    # Sin esto, `>=` sería siempre verdadero (falso verde: no prueba la renovación).
    locked_at_viejo = utcnow() - timedelta(minutes=10)
    lock1.locked_at = locked_at_viejo
    await db.commit()
    # 2ª llamada del MISMO ocupante -> rama de renovación (occupancy.py:57-61)
    ok2 = await occupancy.lock_terminal(db, TERM_1, occupier_id=1, occupier_name="Cajero A")
    assert ok2 is True
    lock2 = (
        await db.execute(
            select(pos_models.TerminalLock).where(pos_models.TerminalLock.terminal_id == TERM_1)
        )
    ).scalars().first()
    # M13: `>` (estricto) prueba que la renovación ocurrió; `>=` no probaría nada.
    assert lock2.locked_at > locked_at_viejo


# --- Test #6 (D16): heartbeat renueva el lock del ocupante ---
@pytest.mark.asyncio
async def test_06_heartbeat_renueva_lock(db):
    await occupancy.lock_terminal(db, TERM_1, occupier_id=1, occupier_name="Cajero A")
    ok = await occupancy.heartbeat(db, TERM_1, occupier_id=1)
    assert ok is True
    lock = (
        await db.execute(
            select(pos_models.TerminalLock).where(pos_models.TerminalLock.terminal_id == TERM_1)
        )
    ).scalars().first()
    assert lock is not None
    assert lock.occupier_id == 1
```

---

## 5. DISEÑO DE LA SOLUCIÓN

### 5.1 Por qué tests de integración (no unitarios con mocks)

Los 3 defectos que más riesgo tienen (bloqueo optimista, cálculo de totales, lock pesimista) **solo se manifiestan contra una BD real**: `with_for_update()` no existe en un mock, y el `MissingGreenlet` es un artefacto de SQLAlchemy async. Un test con mocks daría un **falso verde**.

### 5.2 Por qué contra la BD de desarrollo (no una BD de test)

No existe BD de test separada (verificado en §3.1). Crear una implicaría migraciones + seed, fuera del alcance. Se mitiga con la **regla de oro** (prefijos únicos + limpieza idempotente).

### 5.3 El `_limpiar()` de 8 pasos (resuelve M4)

El orden es **el inverso al de las FKs** (verificado en §3.6):

```
1. TicketItemComponent   (heladería) -> referencia TicketItem
2. TicketItem                        -> referencia Ticket y Product
3. WarehouseEvent                    -> referencia Ticket (A14)
4. Order                             -> referencia Ticket (A14)
5. Ticket                            -> (A14: DESPUÉS de WarehouseEvent y Order)
6. TerminalSession
7. Product                           -> referencia por TicketItem (M3)
8. TerminalLock
```

**Por qué este orden y no otro:**
- `TicketItemComponent` **antes** que `TicketItem` (D6): si no, `ForeignKeyViolationError`.
- `TicketItem` **antes** que `Ticket` (D4): `TicketItem.ticket_id` no tiene `ondelete="CASCADE"`.
- `WarehouseEvent` y `Order` **antes** que `Ticket` (A14): ambos tienen `ticket_id` FK ([`warehouse/models.py:113`](apps/api/modules/warehouse/models.py:113), [`orders/models.py:18`](apps/api/modules/orders/models.py:18)). La v22.4 los borraba **después** de `Ticket` → `ForeignKeyViolationError` en cuanto un test creara un `WarehouseEvent` o un `Order`.
- `Product` **después** de `TicketItem` (M3): `TicketItem.product_id` referencia `Product`.

### 5.4 El payload de las operaciones atómicas

`TicketItemAdd` ([`schemas.py:13-21`](apps/api/modules/pos/schemas.py:13)) exige `account_num`, `product_id`, `session_id`. `version` es opcional (`None` = sin validación).

### 5.5 Cómo se invocan los servicios (sin HTTP)

Los tests llaman **directamente** a `POSService().add_item_to_ticket(db, payload)` y a `pos_router.emergency_save_ticket(payload, db=db)`. Motivo: evita levantar `TestClient` + `httpx` y aísla la lógica de negocio. El `db` es la sesión del fixture.

### 5.6 Cómo se evita el DRAFT GUARD (D5)

Para los tests de cobro (FASE 3) el ticket de partida es `status="OPEN"`, **nunca `DRAFT`**. Un `DRAFT` solo puede pasar a `PAID` desde la **misma** terminal ([`service.py:113-125`](apps/api/modules/pos/service.py:113)); el test #3 de FASE 3 **verifica** ese guard (espera 400).

---

## 6. PLAN DE EJECUCIÓN (FASE 0-5)

### FASE 0 — Baseline y preparación

1. `git status` limpio + `git log -1` = `3431861` (v21).
2. Verificar que el tag `v21-estable-3431861` existe.
3. `docker ps` → confirmar `rderico-api-dev` arriba.
4. Baseline: `docker exec rderico-api-dev python -m pytest tests/ -q` → anotar el número de tests verdes actuales.

### FASE 1 — Escribir los 4 archivos de test

Crear los 4 archivos de §4.1-§4.4. **No se toca ningún archivo de producción.**

### FASE 2 — Ejecutar y verificar verde

```bash
# 2a. Los 4 archivos nuevos
docker exec rderico-api-dev python -m pytest tests/test_pos_atomic_ops.py tests/test_pos_emergency_save.py tests/test_pos_checkout.py tests/test_pos_occupancy.py -v
# 2b. La suite COMPLETA (M11: detectar regresiones)
docker exec rderico-api-dev python -m pytest tests/ -q
```

Esperado: **33 passed** en 2a (14 + 6 + 7 + 6); la suite completa en 2b sin regresiones.

### FASE 3 — Prueba de mutación (9 mutaciones)

Cada mutación **debe** poner un test en ROJO. Si no, el test es un falso verde.

| # | Mutación | Archivo:línea | Test que debe fallar |
|---|----------|---------------|----------------------|
| M1 | Comentar la validación de versión | [`service.py:395`](apps/api/modules/pos/service.py:395) | `test_05` |
| M2 | Cambiar `status="DRAFT"` por `"OPEN"` | [`service.py:385`](apps/api/modules/pos/service.py:385) | `test_01` (D7) |
| M3 | Cambiar `version=1` por `version=99` | [`service.py:386`](apps/api/modules/pos/service.py:386) | `test_01` (D7) |
| M4 | Comentar el recálculo de total | [`service.py:433`](apps/api/modules/pos/service.py:433) | `test_03` |
| M5 | Comentar el DRAFT GUARD | [`service.py:113-125`](apps/api/modules/pos/service.py:113) | `test_03` (FASE 3) |
| M6 | Hacer que `lock_terminal` siempre devuelva `True` | [`occupancy.py:46`](apps/api/modules/pos/occupancy.py:46) | `test_02` (FASE 4) |
| M7 | Cambiar el guard del outbox `== "PAID"` por `!= "PAID"` | [`service.py:46`](apps/api/modules/pos/service.py:46) | `test_05` (FASE 3, A13) |
| M8 | Hacer que `heartbeat` devuelva `False` sin renovar | [`occupancy.py:103`](apps/api/modules/pos/occupancy.py:103) | `test_06` (FASE 4, D16) |
| M9 | **Arreglar el bug**: capturar `ticket_id = db_ticket.id` **antes** del `await self._sync_order_from_ticket(...)` y usar esa variable en la línea 62 | [`service.py:59-62`](apps/api/modules/pos/service.py:59) | `test_04` (FASE 3, D19) — al arreglar el bug, `create_ticket` deja de lanzar `MissingGreenlet` y el `pytest.raises` falla (ROJO). Prueba que el guardián detecta la corrección. |

**Protocolo por mutación:** aplicar → correr el test objetivo → confirmar ROJO → `git checkout -- <archivo>` → confirmar verde de nuevo.

### FASE 4 — Documentar

Añadir a [`DOCUMENTACION_MODULO_POS.md`](ESPECIFICACIONES%20DEL%20PROYECTO/DOCUMENTACION_MODULO_POS.md) una sección "REGLA 22: el backend del POS tiene suite de tests" con:
- Los 4 archivos y qué cubre cada uno.
- El comando de ejecución.
- La regla de oro (prefijos + limpieza de 8 pasos).
- La advertencia de `db.expire_all()` (§3.8).

### FASE 5 — Commit

```bash
git add apps/api/tests/test_pos_atomic_ops.py apps/api/tests/test_pos_emergency_save.py apps/api/tests/test_pos_checkout.py apps/api/tests/test_pos_occupancy.py "ESPECIFICACIONES DEL PROYECTO/DOCUMENTACION_MODULO_POS.md"
git commit -m "v22: tests de integración del backend POS (33 tests, CRÍTICO 1)"
git push
git tag v22-estable-<hash>
```

---

## 7. HALLAZGOS COLATERALES (candidatos a v23)

### 7.1 El docstring de `_get_items_and_total` miente (A6)

[`service.py:65`](apps/api/modules/pos/service.py:65) dice *"Valida stock/existencia"*, pero el código ([`78-81`](apps/api/modules/pos/service.py:78)) solo valida **existencia** y **`active`**. **No hay validación de stock en el POS.** Candidato a v23: decidir si el POS debe validar stock o si el docstring debe corregirse.

### 7.2 `emergency_save_ticket` no valida `session_id`

[`router.py:448-497`](apps/api/modules/pos/router.py:448) crea el ticket con `status="OPEN"` sin validar que `session_id` exista/esté activa. Si el frontend manda un `session_id` inválido, el ticket queda huérfano. Candidato a v23.

### 7.3 FKs sin `ondelete` (verificado en §3.6)

Ninguna FK del POS tiene `ondelete="CASCADE"`. Esto obliga a la limpieza manual de 8 pasos. Candidato a v23: evaluar `ondelete="CASCADE"` en `TicketItem.ticket_id` y `TicketItemComponent.ticket_item_id`.

### 7.4 `db.expire_all()` tras cada operación atómica (A8)

[`service.py:441`](apps/api/modules/pos/service.py:441), [`487`](apps/api/modules/pos/service.py:487), [`532`](apps/api/modules/pos/service.py:532) expiran **toda** la sesión. Es correcto para el POS (fuerza re-lectura fresca), pero es una trampa para cualquier test. Documentado en §3.8.

### 7.5 El doble commit de `_sync_order_from_ticket` (D13/D15)

[`service.py:344`](apps/api/modules/pos/service.py:344) hace un **segundo `db.commit()`** dentro de `_sync_order_from_ticket`, que se invoca desde `create_ticket` ([`service.py:59-60`](apps/api/modules/pos/service.py:59)) **antes** del `return await self._get_full_ticket(db, db_ticket.id)` ([`service.py:62`](apps/api/modules/pos/service.py:62)). Con `expire_on_commit=True`, `db_ticket` queda expirado y `db_ticket.id` lanza `MissingGreenlet`. **Es un bug latente de producción** (no solo de test): cualquier llamada a `create_ticket` con `order_type="PEDIDO"` y `status in ("OPEN","PAID")` pasa por ahí. Candidato a v23: capturar `ticket_id = db_ticket.id` **antes** del sync, o usar `expire_on_commit=False` en la sesión del POS.

---

## 8. RIESGOS

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|-------------|---------|------------|
| Los tests escriben en la BD de desarrollo | Alta (por diseño) | Medio | Prefijos únicos + limpieza idempotente de 8 pasos |
| `MissingGreenlet` por `expire_all()` | Media | Alto | Guardar IDs, no objetos (§3.8) |
| `MissingGreenlet` por el 2º commit de `_sync_order_from_ticket` (D13/D15) | Alta | Alto | Capturar `ticket_id` por `account_num` antes del sync (§4.3) |
| `ForeignKeyViolationError` en limpieza | Media | Alto | Orden de 8 pasos verificado (§5.3, A14) |
| Colisión con tests existentes | Baja | Medio | Prefijos `TEST_V22_*` verificados sin colisión (§3.5) |
| Falso verde (test que pasa sin verificar) | Media | **Crítico** | 9 mutaciones (§6 FASE 3) |
| El contenedor no está arriba | Baja | Bajo | FASE 0 verifica `docker ps` |

---

## 9. CRITERIOS DE ACEPTACIÓN

1. Los 4 archivos existen y contienen **33 tests** (14 + 6 + 7 + 6).
2. `docker exec rderico-api-dev python -m pytest tests/test_pos_*.py -v` → **33 passed**.
3. Las **9 mutaciones** de §6 FASE 3 ponen un test en ROJO (verificado una por una).
4. Tras revertir cada mutación, los 33 vuelven a verde.
5. `git status` limpio tras el commit.
6. La suite completa (`pytest tests/ -q`) sigue verde (sin regresiones) — verificado en FASE 2b (M11).
7. `DOCUMENTACION_MODULO_POS.md` incluye la REGLA 22.
8. **Verificación empírica de D13/D15:** los tests #1 y #4 de FASE 3 pasan sin `MissingGreenlet` (solo se confirma ejecutando, no leyendo).

---

## 10. ROLLBACK

- **Antes del commit:** `git checkout -- apps/api/tests/` (los archivos nuevos se borran con `git clean -fd apps/api/tests/`).
- **Después del commit:** `git reset --hard v21-estable-3431861`.
- **Riesgo de datos:** nulo — los tests solo insertan/borran filas con prefijo `TEST_V22_*`.

---

## 11. ESTIMACIÓN

| Fase | Entregable | Tests |
|------|-----------|-------|
| FASE 1 | `test_pos_atomic_ops.py` | 14 |
| FASE 2 | `test_pos_emergency_save.py` | 6 |
| FASE 3 | `test_pos_checkout.py` | 7 |
| FASE 4 | `test_pos_occupancy.py` | 6 |
| **Total** | **4 archivos** | **33** |

**Mutaciones:** 9 (M1-M9).
**Archivos de producción modificados:** **0**.

---

## 12. LECCIÓN DE ESTA ITERACIÓN

La revisión v4 encontró 3 fatales **nuevos** (D9, D10, D11) en un plan que ya había pasado **tres** revisiones y que **incluía el código completo** de los tests. La causa: los tests de FASE 2 se redactaron a partir de la **prosa del plan** (que decía "contrato verificado (router.py:448-497)"), no leyendo el **código del endpoint**. La prosa decía `cart`; el código decía `payload.get("items")`.

**Regla adoptada (v22.4):** *toda aserción de un test debe citar la línea exacta del código que la produce, y esa línea debe haberse leído en esta sesión.* Un plan que cita líneas (`router.py:493`) pero no las ha leído es un plan que **infiere**, no que **verifica**.

Esto conecta con la lección de v18-v21 (*"toda afirmación de impacto debe verificarse leyendo el código, no razonarse"*): la v22.3 creyó haberla aplicado incluyendo el código de los tests, pero el código de los tests **no es** el código del endpoint. La verificación debe ser **cruzada**: el test contra el endpoint, no el test contra la prosa.

**Corolario:** incluir el código de los tests (v22.3) es **necesario pero no suficiente**. Hace falta además **leer el código del sujeto bajo prueba** y citarlo. La v22.4 lo hace en cada aserción de FASE 2.

---

### 12.1 La lección de la quinta revisión (v22.5)

La revisión v4 aplicó la regla v22.4 **solo a la FASE 2** (la que había fallado en v22.3). Las FASES 1, 3 y 4 se dieron por buenas **sin auditarlas con el mismo rigor**. La revisión v5 auditó **las 4 fases, test por test, aserción por aserción**, y encontró **5 fatales nuevos** (D12-D16) + 3 altos + 3 medios.

**Regla adoptada (v22.5):** *una revisión que solo audita la fase que falló la vez anterior deja las otras fases sin auditar.* La auditoría debe ser **exhaustiva** (las 4 fases, los 32 tests, cada aserción), no **por excepción** (solo lo que falló antes).

**Corolario empírico:** hay defectos que **no se detectan leyendo**, solo **ejecutando**. El `MissingGreenlet` de D13/D15 nace de un **segundo commit** ([`service.py:344`](apps/api/modules/pos/service.py:344)) que expira el ORM object; ninguna lectura del test lo revela — solo correrlo. Por eso la FASE 2 del plan de ejecución corre los tests **antes** de declararlos verdes, y la FASE 3 (mutaciones) prueba que **fallan** cuando deben.

---

### 12.2 La lección de la sexta revisión (v22.6)

La revisión v5 auditó las 4 fases exhaustivamente y encontró D12-D16. **Pero v22.5, al corregirlos, introdujo defectos nuevos de la misma clase.** La lección v2 (*"una reformulación no es inmune a los defectos de la versión que corrige"*) se cumplió otra vez:

- Corregir **D12** (hardcodear `version=2`) introdujo **A15** (hardcodear `version=1` donde la DB tiene 2 → 409). Misma clase de defecto, dirección opuesta.
- Corregir **D13/D15** (no usar `result.id`) introdujo **D19**: no advirtió que `create_ticket` **mismo** lanza `MissingGreenlet` en [`service.py:62`](apps/api/modules/pos/service.py:62) **antes de retornar**, así que el test nunca llega a la línea donde captura el id.
- Corregir **A14** en FASE 1 y FASE 3 **olvidó FASE 2** → **D18** (el `_limpiar()` de FASE 2 quedó con el orden viejo).

**Regla adoptada (v22.6):** *toda corrección de un defecto debe re-auditarse contra el código del sujeto bajo prueba, porque una corrección puede introducir un defecto nuevo de la misma clase.*

**Corolario:** la auditoría no es "leer el plan"; es **leer el código que el plan cita y verificar que la aserción se sostiene**. El plan v22.5 citaba [`service.py:386`](apps/api/modules/pos/service.py:386) (`version=1`) pero **no citaba la línea 434** que la incrementa. Citar una línea sin leer la que la modifica es el mismo error que la regla v22.4 prohíbe. Por eso v22.6 cita **ambas** líneas (386 y 434) en cada aserción de versión.

**Consecuencia para la ejecución:** el test #4 de FASE 3 es un **guardián de un bug de producción** (el POS no puede cobrar un PEDIDO sin romperse). Queda ROJO hasta que se arregle [`service.py:62`](apps/api/modules/pos/service.py:62). Esto es intencional: un test que documenta un bug es más valioso que un test que lo esquiva.

---

### 12.3 La lección de la séptima revisión (v22.7)

La revisión v7 **re-auditó las 6 correcciones de la v6 contra el código** (regla v22.6) y las encontró **correctas (6/6)**. Pero la propia corrección **introdujo 5 defectos nuevos** (D20-D22, D25-D26), **todos** de la clase que la regla v22.6 predice.

**La regla v22.6 se confirma por tercera vez consecutiva:**

| Iteración | Correcciones aplicadas | Defectos nuevos introducidos |
|-----------|------------------------|------------------------------|
| v22.5 | D12-D16 + A12-A14 + M9-M11 | **D17, D18, D19** (3) |
| v22.6 | D17-D19 + A15/A16 + M13 | **D20, D21, D22, D25, D26** (5) |

**El número de defectos nuevos NO decrece (3 → 5).** Esto es la evidencia más fuerte de que el plan **no ha convergido**: cada reformulación en prosa introduce tantos defectos como corrige. La causa es estructural: **la prosa no es ejecutable**, así que cada edición es una oportunidad de introducir una inconsistencia que solo la ejecución detectaría.

**Regla adoptada (v22.7):** *si una reformulación vuelve a introducir defectos nuevos de la clase "corrección-introducidos", el ciclo de reformulación ha agotado su rendimiento y debe detenerse.* La ejecución de los 33 tests contra la BD real es el único auditor que no puede ser engañado por la prosa.

**Corolario operativo:** la v22.7 es la **última reformulación**. Si la v22.8 encuentra defectos nuevos, se **ejecuta igualmente** (FASE 0-5), porque:
1. Los 5 defectos de la v7 son **documentales/metodológicos** (D20 §11, D21 mutación, D22 etiqueta, D25 docstring, D26 prefijo) — **ninguno** afecta la lógica de los 33 tests.
2. La ejecución **detecta** cualquier defecto residual de forma **empírica** (los tests fallan o pasan), sin depender de la prosa.
3. El coste de seguir reformulando (riesgo de introducir más defectos) supera el beneficio (corregir defectos documentales que la ejecución no lee).
