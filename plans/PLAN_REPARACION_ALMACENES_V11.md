# Plan v11: Reparación de Deudas Operativas del Módulo de Almacenes

**Estado:** 📋 PROPUESTO — pendiente de aprobación del operador
**Rama sugerida:** `fix/almacenes-v11-deudas-operativas`
**Base:** `main` @ `e39c70f`
**Autor:** Arquitectura
**Fecha:** 2026-09-13
**Alcance:** Los 4 puntos de preocupación identificados tras la auditoría de cierre de v10.

---

## 0. FILOSOFÍA DE ESTE PLAN

Las Fases 0–10 dejaron el módulo **funcionalmente completo y correcto para una sucursal**. Este plan no agrega funcionalidad nueva: **elimina las cuatro deudas que impedirán que el módulo escale a dos o tres sucursales sin romperse en silencio**.

Los cuatro puntos comparten un patrón: **hoy funcionan por convención, no por garantía.**

| # | Deuda | Naturaleza | Se rompe cuando... |
|---|-------|-----------|-------------------|
| 1 | `exclude_unset=True` en `update_warehouse` | Contrato implícito | Alguien escribe un cliente que omite un campo |
| 2 | Procesador de eventos con polling sin lock | Concurrencia | Se levanta una segunda réplica de la API |
| 3 | `SIN_CLASIFICAR` sin vigilancia visible | Operación | Nadie revisa el endpoint de diagnóstico |
| 4 | Enum `PropositoAlmacen` deprecado | Mantenibilidad | Un dev nuevo lo usa creyendo que es la fuente de verdad |

> **Regla rectora de este plan:** *"Lo que funciona por convención es deuda; lo que funciona por garantía es diseño."*

---

## 1. AUDITORÍA DE LAS CUATRO DEUDAS

### 1.1 Deuda 1 — `exclude_unset=True` impide limpiar campos

**Evidencia en código:**

```python
# apps/api/modules/warehouse/service.py:341
update_data = payload.model_dump(exclude_unset=True)
```

**El problema:** `exclude_unset=True` descarta los campos que el cliente **no envió**. Esto es correcto para un PATCH parcial, pero crea una ambigüedad irresoluble:

| Intención del cliente | Payload enviado | Resultado real |
|---|---|---|
| "No toques la foto" | `{nombre: "X"}` | ✅ La foto se conserva |
| "Borra la foto" | `{foto_url: null}` | ✅ Se borra (`null` está *set*) |
| "Borra la foto" | `{nombre: "X"}` (omite foto) | ❌ **Imposible de expresar** |

Hoy funciona porque [`buildWarehouseCreatePayload`](apps/inventory/utils/warehouseMappers.js:99) **siempre** envía `foto_url`, `planograma_url` y `pautas_acomodo` (decisión v10). Pero eso es una **convención del frontend**, no una garantía del backend.

**Riesgo concreto:** un script de importación, un cliente móvil, o una integración futura que omita `foto_url` hará que el operador **no pueda borrar una foto** y nadie entenderá por qué. El bug se manifestará como "el sistema no me deja quitar la foto" — un síntoma que apunta al frontend cuando la causa está en el backend.

**Severidad:** 🟠 Alta — silenciosa, difícil de diagnosticar, bloquea una operación legítima.

---

### 1.2 Deuda 2 — Procesador de eventos sin lock distribuido

**Evidencia en código:**

```python
# apps/api/modules/warehouse/service.py:1022-1058
while True:
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(models.WarehouseEvent.id)
            .where(models.WarehouseEvent.estado == "PENDIENTE")
            .order_by(models.WarehouseEvent.created_at)
            .limit(50)
        )
        evento_ids = result.scalars().all()
    for evento_id in evento_ids:
        ...
    await asyncio.sleep(30)
```

**El problema:** el bucle **no tiene ningún mecanismo de exclusión mutua**. Si se levantan dos réplicas de la API (escalado horizontal, o simplemente un `docker-compose up --scale api=2`), **ambas leerán los mismos eventos PENDIENTE** y ambas intentarán procesarlos.

**Por qué no explota hoy:** la idempotencia a nivel de BD (índice único `(evento_id, item_id)`) evita el doble descuento. El sistema **es correcto**, pero:

1. **Trabajo desperdiciado:** dos transacciones compiten por el mismo registro.
2. **Contención de locks:** ambas intentan `UPDATE` sobre las mismas filas de `stock_almacen`.
3. **Ruido en logs:** errores de violación de índice único que parecen bugs pero no lo son.
4. **Falsa sensación de seguridad:** la idempotencia salva el caso, pero nadie diseñó el sistema para multi-réplica; simplemente no se rompe *demasiado*.

**Severidad:** 🟡 Media — no corrompe datos, pero degrada y confunde. Se vuelve crítico al escalar.

---

### 1.3 Deuda 3 — `SIN_CLASIFICAR` sin vigilancia visible

**Evidencia en código:**

```python
# apps/api/modules/warehouse/router.py:197
@router.get("/diagnostico/sin-almacen", response_model=List[schemas.EventoSinAlmacenResponse])
async def list_eventos_sin_almacen(limit: int = 100, db: AsyncSession = Depends(get_db)):
    """SKUs que no se pudieron descontar (sin SKU, sin stock o sin almacen de venta)."""
    return await warehouse_svc.get_eventos_sin_almacen(db, limit)
```

**El problema:** el endpoint existe y es correcto, pero **nadie lo consume desde la UI**. La búsqueda en el frontend confirma que `SIN_CLASIFICAR` solo aparece en comentarios de código ([`WarehouseManagerUI.jsx:1086`](apps/inventory/WarehouseManagerUI.jsx:1086), [`:1307`](apps/inventory/WarehouseManagerUI.jsx:1307), [`:2615`](apps/inventory/WarehouseManagerUI.jsx:2615)), nunca en una llamada a `/diagnostico/sin-almacen`.

**La consecuencia operativa:** cuando un SKU no se puede descontar (no tiene almacén de venta asignado, o no tiene stock), el sistema lo registra en `warehouse_eventos_sin_almacen` y **sigue adelante**. Es la decisión correcta — no se pierde trazabilidad. Pero si nadie mira esa tabla, se convierte en un **vertedero silencioso**.

**El escenario real:** el POS vende 200 panes. 3 SKUs no tienen almacén de venta configurado. Esos 3 descuentos se pierden silenciosamente. El inventario queda inflado en 3 SKUs. Nadie se entera hasta el inventario físico del mes siguiente, cuando ya es imposible reconstruir qué pasó.

**Severidad:** 🟠 Alta — pérdida silenciosa de exactitud de inventario, que es exactamente lo que el plan v7 declaró inaceptable (*"Un dato perdido sin aviso es peor que un conflicto visible"*).

---

### 1.4 Deuda 4 — Enum `PropositoAlmacen` deprecado pero presente

**Evidencia en código:**

```python
# apps/api/modules/warehouse/schemas.py:11-23
class PropositoAlmacen(str, Enum):
    """v7 (D-ENUM) — DEPRECADO en v8.
    ...
    Se conserva esta clase unicamente por compatibilidad hacia atras
    (imports existentes y tests de la Fase 3);
    NO debe usarse en validaciones nuevas.
    """
    ALMACENAMIENTO = "ALMACENAMIENTO"
    EXHIBICION_VENTA = "EXHIBICION_VENTA"
    EQUIPAMIENTO = "EQUIPAMIENTO"
```

**El problema:** el docstring es honesto y correcto, pero **el enum sigue siendo importable y usable**. Un desarrollador nuevo que busque "cómo se valida el propósito de un almacén" encontrará esta clase primero (está en la línea 11, muy arriba en el archivo) y podría usarla, reintroduciendo el bloqueo que v8 eliminó.

**Por qué no se puede borrar sin más:** hay imports existentes y tests de la Fase 3 que lo referencian. Borrarlo a ciegas rompería la suite.

**Severidad:** 🟡 Media — no rompe nada hoy, pero es una trampa para el futuro. Cada mes que pasa es un mes más de confusión.

---

## 2. PRINCIPIOS DE REPARACIÓN

1. **Cero regresiones.** El POS no se toca. Las 95 pruebas de Vitest y las 21 de pytest deben seguir pasando.
2. **Cada deuda se repara con un test que la previene.** No basta con arreglar; hay que hacer imposible la reincidencia.
3. **Cambios incrementales y verificables.** Cada fase es un commit independiente con su propia verificación.
4. **Documentar la decisión, no solo el cambio.** Cada fase actualiza el documento maestro del módulo.
5. **Nada de refactors cosméticos.** Solo se toca lo que la deuda exige.

---

## 3. FASES DE EJECUCIÓN

### FASE 11.1 — Contrato explícito de actualización de almacén

**Objetivo:** eliminar la ambigüedad de `exclude_unset=True` haciendo **explícito** qué significa omitir un campo.

**Diseño aprobado:** introducir un centinela que distinga "no enviado" de "enviado como null".

```python
# apps/api/modules/warehouse/schemas.py
from pydantic import BaseModel, Field
from typing import List, Optional

class AlmacenUpdate(BaseModel):
    """v11 (Deuda 1): contrato explicito de actualizacion parcial.

    Regla: un campo OMITIDO se conserva. Un campo enviado como `null`
    se LIMPIA. Esto elimina la ambiguedad de `exclude_unset=True` y
    permite al operador borrar una foto o un planograma sin depender
    de que el frontend envie siempre todos los campos.
    """
    nombre: Optional[str] = None
    zona_termica: Optional[ZonaTermica] = None
    proposito: Optional[str] = Field(None, min_length=2, max_length=40, pattern=PROPOSITO_PATTERN)
    sucursal_id: Optional[str] = None
    foto_url: Optional[str] = None
    planograma_url: Optional[str] = None
    pautas_acomodo: Optional[List[str]] = None
    activo: Optional[bool] = None
```

**Cambio en el servicio:**

```python
# apps/api/modules/warehouse/service.py — update_warehouse
update_data = payload.model_dump(exclude_unset=True)

# v11 (Deuda 1): documentar y blindar la semantica.
# `exclude_unset=True` significa: "solo toca lo que el cliente envio".
# Un campo enviado como `null` SI esta "set" y por lo tanto SI limpia.
# Un campo omitido NO se toca. Esta es la semantica correcta para un PATCH.
#
# ADVERTENCIA PARA FUTUROS CLIENTES: si necesitas borrar `foto_url`,
# DEBES enviar `{"foto_url": null}` explicitamente. Omitirlo lo conserva.
```

**Entregables:**

| # | Entregable | Archivo |
|---|---|---|
| 1.1 | Docstring de contrato explícito en `AlmacenUpdate` | [`schemas.py`](apps/api/modules/warehouse/schemas.py:94) |
| 1.2 | Comentario de advertencia en `update_warehouse` | [`service.py`](apps/api/modules/warehouse/service.py:341) |
| 1.3 | Test backend: omitir conserva, `null` limpia | `apps/api/tests/test_warehouse_fase11.py` |
| 1.4 | Test frontend: `buildWarehouseCreatePayload` siempre envía los 3 campos | [`warehouseMappers.test.js`](apps/inventory/utils/warehouseMappers.test.js:320) |

**Test backend (nuevo):**

```python
async def test_update_omite_conserva_y_null_limpia():
    """v11 (Deuda 1): la semantica de PATCH debe ser explicita.

    - Omitir `foto_url` CONSERVA el valor existente.
    - Enviar `foto_url: null` LIMPIA el valor.
    """
    # 1. Crear almacen con foto
    # 2. PATCH {nombre: "X"} -> foto_url sigue igual
    # 3. PATCH {foto_url: None} -> foto_url es None
```

**Verificación:**
```
docker exec rderico-api-dev python -m pytest tests/test_warehouse_fase11.py -q
npx vitest run apps/inventory/utils/warehouseMappers.test.js
```

**Riesgo:** bajo. No cambia comportamiento; solo lo documenta y lo prueba.

---

### FASE 11.2 — Lock distribuido en el procesador de eventos

**Objetivo:** garantizar que **solo una instancia** procese eventos a la vez, sin introducir dependencias nuevas (Redis, Celery).

**Diseño aprobado:** advisory lock de PostgreSQL (`pg_try_advisory_lock`), que es **nativo, sin dependencias, y se libera automáticamente** si el proceso muere.

```python
# apps/api/modules/warehouse/service.py — process_warehouse_events
async def process_warehouse_events():
    """v11 (Deuda 2): procesador con lock distribuido.

    Usa `pg_try_advisory_lock` para garantizar que solo UNA instancia
    de la API procese eventos a la vez. Si hay multiples replicas, las
    demas obtienen `False` y esperan al siguiente ciclo.

    Ventajas frente a alternativas:
    - Sin dependencias nuevas (Redis, Celery, RabbitMQ).
    - El lock se libera automaticamente si el proceso muere (la conexion
      se cierra y PostgreSQL libera el advisory lock).
    - No requiere coordinacion externa ni configuracion.
    """
    import asyncio
    from core.database import AsyncSessionLocal

    # ID arbitrario pero estable para este lock. No debe colisionar con
    # otros advisory locks del sistema.
    LOCK_ID = 0x52444552  # "RDER" en hex

    await asyncio.sleep(10)

    while True:
        try:
            async with AsyncSessionLocal() as db:
                # Intentar adquirir el lock SIN bloquear.
                result = await db.execute(
                    text("SELECT pg_try_advisory_lock(:lock_id)"),
                    {"lock_id": LOCK_ID}
                )
                acquired = result.scalar()

                if not acquired:
                    # Otra instancia esta procesando. Esperar al siguiente ciclo.
                    logger.debug("Otra instancia tiene el lock del procesador. Esperando.")
                else:
                    try:
                        # ... bucle de procesamiento existente ...
                        pass
                    finally:
                        # Liberar SIEMPRE el lock, incluso si hay excepcion.
                        await db.execute(
                            text("SELECT pg_advisory_unlock(:lock_id)"),
                            {"lock_id": LOCK_ID}
                        )
        except Exception:
            logger.error("Error en el bucle del procesador de eventos", exc_info=True)

        await asyncio.sleep(30)
```

**Punto crítico de diseño:** el lock debe adquirirse y liberarse **en la misma conexión**. Como `AsyncSessionLocal()` abre una conexión del pool, hay que asegurar que la sesión no se recicle entre el lock y el unlock. La forma segura es mantener la sesión abierta durante todo el ciclo de procesamiento.

**Alternativa más simple (si el lock por sesión resulta frágil):** usar una tabla `warehouse_processor_lock` con un registro único y `SELECT ... FOR UPDATE NOWAIT`. Es más explícito y no depende del comportamiento del pool.

**Entregables:**

| # | Entregable | Archivo |
|---|---|---|
| 2.1 | `pg_try_advisory_lock` en el bucle del procesador | [`service.py`](apps/api/modules/warehouse/service.py:1006) |
| 2.2 | Liberación garantizada del lock en `finally` | [`service.py`](apps/api/modules/warehouse/service.py:1006) |
| 2.3 | Log de diagnóstico cuando otra instancia tiene el lock | [`service.py`](apps/api/modules/warehouse/service.py:1006) |
| 2.4 | Test de concurrencia: dos procesadores no procesan el mismo evento | `apps/api/tests/test_warehouse_fase11.py` |

**Test de concurrencia (nuevo):**

```python
async def test_solo_una_instancia_procesa():
    """v11 (Deuda 2): dos procesadores concurrentes no duplican trabajo.

    Se simulan dos intentos de adquirir el lock. Solo uno debe tener exito.
    """
    # 1. Adquirir lock en sesion A -> True
    # 2. Intentar adquirir en sesion B -> False
    # 3. Liberar en A
    # 4. Intentar adquirir en B -> True
```

**Verificación:**
```
docker exec rderico-api-dev python -m pytest tests/test_warehouse_fase11.py -q
docker exec rderico-db-dev psql -U user -d rderico -c "SELECT * FROM pg_locks WHERE locktype='advisory';"
```

**Riesgo:** medio. Es el cambio más delicado del plan porque toca el corazón del Outbox. **Debe probarse con el POS activo** para confirmar que no se bloquea.

---

### FASE 11.3 — Vigilancia visible de `SIN_CLASIFICAR`

**Objetivo:** que un SKU no descontado **nunca** pase desapercibido. El operador debe verlo en la UI, no en un endpoint que nadie consulta.

**Diseño aprobado:** tres capas de vigilancia, de menor a mayor intrusividad.

**Capa A — Badge de alerta en la barra de subcategorías.**

Cuando `warehouse_eventos_sin_almacen` tiene registros no resueltos, mostrar un badge rojo en la subcategoría `SIN_CLASIFICAR`:

```jsx
{/* v11 (Deuda 3): badge de alerta en la cuarentena */}
{subCategoria.codigo === 'SIN_CLASIFICAR' && sinAlmacenCount > 0 && (
    <span className="ml-2 px-2 py-0.5 bg-red-500 text-white text-xs font-black rounded-full animate-pulse">
        {sinAlmacenCount}
    </span>
)}
```

**Capa B — Panel de diagnóstico en el detalle de `SIN_CLASIFICAR`.**

Al abrir la subcategoría `SIN_CLASIFICAR`, mostrar una tabla con los SKUs huérfanos:

| SKU | Producto | Motivo | Fecha | Acción |
|---|---|---|---|---|
| PAN-001 | Bolillo | Sin almacén de venta | 13/Sep 08:30 | Asignar almacén |
| PAN-045 | Concha | Sin stock | 13/Sep 09:15 | Ver stock |

**Capa C — Resolución human-in-the-loop.**

Cada fila ofrece una acción concreta. **Nunca se resuelve automáticamente** — respeta la regla rectora del módulo.

**Entregables:**

| # | Entregable | Archivo |
|---|---|---|
| 3.1 | `fetchEventosSinAlmacen()` en el componente | [`WarehouseManagerUI.jsx`](apps/inventory/WarehouseManagerUI.jsx:108) |
| 3.2 | Badge de alerta en la barra de subcategorías | [`WarehouseManagerUI.jsx`](apps/inventory/WarehouseManagerUI.jsx:1306) |
| 3.3 | Panel de diagnóstico en el detalle de `SIN_CLASIFICAR` | [`WarehouseManagerUI.jsx`](apps/inventory/WarehouseManagerUI.jsx:1306) |
| 3.4 | Función pura `mapEventoSinAlmacenFromApi` | [`warehouseMappers.js`](apps/inventory/utils/warehouseMappers.js:1) |
| 3.5 | Tests de la función pura | [`warehouseMappers.test.js`](apps/inventory/utils/warehouseMappers.test.js:1) |

**Verificación:**
```
npx vitest run apps/inventory/utils/warehouseMappers.test.js
npm run build
```

**Riesgo:** bajo. Es UI aditiva; no toca lógica de negocio.

---

### FASE 11.4 — Eliminación del enum `PropositoAlmacen`

**Objetivo:** eliminar la trampa para futuros desarrolladores.

**Diseño aprobado:** eliminación en dos pasos, con verificación de que nada lo usa.

**Paso 1 — Auditar todos los usos.**

```bash
findstr /S /I "PropositoAlmacen" apps\api\*.py
```

**Paso 2 — Migrar los usos legítimos y eliminar la clase.**

Si los únicos usos son:
- El docstring de deprecación (se elimina con la clase).
- Tests de la Fase 3 que verifican el enum (se migran a verificar el catálogo dinámico).

Entonces la clase se elimina y se actualizan los tests.

**Si hay usos legítimos en producción:** se mantiene pero se mueve a un módulo `_deprecated.py` con un `DeprecationWarning` en el import, para que cualquier uso nuevo genere una advertencia visible.

**Entregables:**

| # | Entregable | Archivo |
|---|---|---|
| 4.1 | Auditoría de usos de `PropositoAlmacen` | (comando, sin archivo) |
| 4.2 | Eliminación de la clase (o aislamiento con warning) | [`schemas.py`](apps/api/modules/warehouse/schemas.py:11) |
| 4.3 | Migración de tests de Fase 3 al catálogo dinámico | `apps/api/tests/test_warehouse_fase3.py` |
| 4.4 | Verificación de que la suite completa pasa | (comando) |

**Verificación:**
```
docker exec rderico-api-dev python -m pytest tests/ -q
findstr /S /I "PropositoAlmacen" apps\api\*.py
```

**Riesgo:** bajo si la auditoría confirma que solo lo usan tests. Medio si hay usos en producción (en cuyo caso se aplica el aislamiento con warning).

---

## 4. ORDEN DE EJECUCIÓN Y DEPENDENCIAS

```
FASE 11.1 (contrato)     ──┐
                           ├──> independientes, se pueden paralelizar
FASE 11.3 (vigilancia)   ──┘

FASE 11.2 (lock)         ──> independiente, pero REQUIERE prueba con POS activo

FASE 11.4 (enum)         ──> DEBE ir al final (depende de que 11.1 estabilice schemas.py)
```

**Orden recomendado:**

| Orden | Fase | Motivo |
|---|---|---|
| 1 | **11.1** | Es la más simple y estabiliza `schemas.py` antes de tocar el enum. |
| 2 | **11.3** | Alto impacto operativo, bajo riesgo técnico. Resuelve la pérdida silenciosa. |
| 3 | **11.2** | Requiere prueba con POS activo; se hace con calma y ventana de mantenimiento. |
| 4 | **11.4** | Cierre: elimina la deuda de mantenibilidad una vez que todo lo demás está estable. |

---

## 5. PROTOCOLO DE SEGURIDAD (por sub-fase)

Siguiendo el protocolo del plan maestro v7 (§5.1 y §5.2):

1. **Antes de cada fase:** `git status` limpio, `git log --oneline -1` registrado.
2. **Durante:** no tocar archivos del POS. Si un cambio requiere tocar POS, **detenerse y consultar**.
3. **Después de cada fase:**
   - `docker exec rderico-api-dev python -m pytest tests/ -q` → 21+ passed
   - `npx vitest run` → 95+ passed
   - `npm run build` → 1417+ módulos, exit 0
   - `git diff | findstr /I "console.log debugger print("` → sin resultados
4. **Commit por fase** con mensaje descriptivo y referencia a la deuda.
5. **Push a origin** al cerrar cada fase.
6. **Actualizar** `DOCUMENTACION_MODULO_GESTION_DE_ALMACENES.md` con la decisión tomada.

---

## 6. VERIFICACIÓN FINAL DEL PLAN

Al cerrar las 4 fases, el checklist debe estar completo:

| # | Verificación | Comando | Esperado |
|---|---|---|---|
| 1 | Tests backend | `docker exec rderico-api-dev python -m pytest tests/ -q` | 25+ passed |
| 2 | Tests frontend | `npx vitest run` | 98+ passed |
| 3 | Build | `npm run build` | 1417+ módulos, exit 0 |
| 4 | API viva | `GET /health` | 200 |
| 5 | POS vivo | `GET :5000/index.html` | 200 |
| 6 | Sin debug | `git diff \| findstr "console.log"` | vacío |
| 7 | Enum eliminado | `findstr /S "PropositoAlmacen" apps\api\*.py` | solo en tests migrados |
| 8 | Lock funcional | `SELECT * FROM pg_locks WHERE locktype='advisory'` | 1 lock durante procesamiento |
| 9 | Badge visible | Manual: crear evento huérfano, ver badge rojo | badge aparece |
| 10 | Contrato explícito | `PATCH {foto_url: null}` | foto se borra |

---

## 7. LO QUE ESTE PLAN **NO** HACE

Para evitar malentendidos:

- **No agrega funcionalidad nueva.** No hay features de usuario.
- **No toca el POS.** Cero cambios en `apps/pos/` y `modules/pos/`.
- **No introduce dependencias.** El lock usa PostgreSQL nativo, no Redis.
- **No refactoriza lo que funciona.** Solo se toca lo que la deuda exige.
- **No resuelve el espejo a San Pablo.** Eso depende del `ENTERPRISE_PAT` del usuario.

---

## 8. ESTIMACIÓN DE ESFUERZO

| Fase | Complejidad | Riesgo | Archivos tocados |
|---|---|---|---|
| 11.1 | Baja | Bajo | 2 backend + 2 tests |
| 11.2 | Media-Alta | Medio | 1 backend + 1 test |
| 11.3 | Media | Bajo | 1 frontend + 2 tests |
| 11.4 | Baja | Bajo-Medio | 1 backend + 1 test |

**Total:** 4 commits, ~8 archivos, sin migraciones de BD.

---

## 9. CRITERIO DE ÉXITO

El plan está completo cuando:

1. Un cliente que omita `foto_url` **no puede** borrar la foto por accidente, y un cliente que envíe `null` **sí puede** borrarla — y hay un test que lo prueba.
2. Levantar dos réplicas de la API **no** genera trabajo duplicado ni contención — y hay un test que lo prueba.
3. Un SKU no descontado **aparece como badge rojo** en la UI en menos de 30 segundos — y hay un test de la función pura que lo alimenta.
4. `PropositoAlmacen` **ya no existe** (o genera warning si alguien lo importa) — y la suite completa pasa.

> **Nota final:** ninguna de estas cuatro deudas está causando un problema hoy. Este plan es una inversión para que el módulo siga siendo confiable cuando haya dos o tres sucursales, y para que el próximo desarrollador no tenga que redescubrir por qué las cosas funcionan.
