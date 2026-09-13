# 📦 DOCUMENTACIÓN MAESTRA: MÓDULO DE GESTIÓN DE ALMACENES — R de Rico ERP

> **⚠️ LECTURA OBLIGATORIA.** Cualquier IA o desarrollador que necesite interactuar, depurar o extender el Módulo de Gestión de Almacenes **DEBE** leer este documento. Aquí se detalla la arquitectura, el flujo de datos, el patrón Outbox, el bloqueo optimista y las reglas de negocio del módulo.
>
> **Última actualización:** 2026-09-13
> **Versión del módulo:** v10 (Fases 0-10 completadas)
> **Archivos gobernados:**
> - Backend: `apps/api/modules/warehouse/*` (models, schemas, service, router)
> - Frontend: `apps/inventory/WarehouseManagerUI.jsx`, `apps/inventory/WarehouseHubUI.jsx`
> - Utilidades frontend: `apps/inventory/utils/warehouseMappers.js` (+ `warehouseMappers.test.js`)
> - Integración POS: `apps/api/modules/pos/service.py` (6 líneas outbox)
> - Startup: `apps/api/main.py` (background task + `ensure_warehouse_propositos`)
> - Seed: `apps/api/migrations/seed_almacenes.py`
> - Migración subcategorías: `apps/api/migrations/versions/f5a6b7c8d9e0_add_warehouse_propositos.py`
> - Planes: `plans/PLAN_MAESTRO_ALMACENES_V7.md`, `plans/PLAN_SUBCATEGORIAS_ALMACEN_V8.md`

---

## 1. PROPÓSITO DEL MÓDULO

El Módulo de Gestión de Almacenes controla **todo el inventario físico** del negocio R de Rico: materias primas (harina, azúcar, manteca), productos terminados (panes, helados) y empaques (bolsas, charolas, conos). Opera tanto para la **Panadería** como para la **Heladería**.

### Capacidades
- **CRUD de almacenes** — Crear, editar, eliminar almacenes con zonas térmicas (SECO/REFRIGERADO/CONGELADO)
- **Subcategorías dinámicas** (v8) — CRUD de subcategorías de almacén (`warehouse_propositos`) con traslado de almacenes y borrado protegido
- **Representación visual** (v10) — Icono curado (12 emojis) o fotografía real del almacén subida desde el equipo
- **Infografía de acomodo** (v10) — Planograma (imagen) + pautas de acomodo (texto) por almacén
- **Control de stock** — Stock por SKU con alertas PEPS (Primero En Entrar, Primero En Salir)
- **Entrada masiva** — Registrar lotes completos de proveedor en < 2 minutos
- **Traspasos** — Mover stock entre almacenes (ej. Bodega → Exhibidor)
- **Mermas** — Registrar pérdidas con notas obligatorias para auditoría
- **Bloqueo optimista** — Previene sobreescrituras concurrentes (error 409)
- **Outbox Pattern** — Descuento automático de stock por ventas POS
- **Dead-Letter Queue** — Eventos fallidos visibles para diagnóstico
- **Gestión de insumos** — Tabla stub para materias primas con unidades de conversión
- **Auditoría y RBAC** (v7) — Operaciones sensibles auditadas; permisos verificados por perfil
- **PWA offline** (v7) — Cola de operaciones en IndexedDB con sincronización al reconectar

---

## 2. ARQUITECTURA

### 2.1 Diagrama de Flujo

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────────────┐
│  POS Panadería   │────▶│  create_ticket() │────▶│  WarehouseEvent         │
│  POS Heladería   │     │  (pos/service.py)│     │  (ANTES del commit)     │
└─────────────────┘     └──────────────────┘     │  try/except pass        │
                                                  └──────────┬──────────────┘
                                                             │
                                                             ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    OUTBOX PROCESSOR (Background Task)                    │
│                    Polling cada 30 segundos                              │
│                                                                         │
│  1. Lee eventos PENDIENTE (FIFO, máx 50)                               │
│  2. Para cada item del ticket:                                          │
│     a. Busca stock en almacén EXHIBICION_VENTA con ese SKU             │
│     b. Si hay stock suficiente → descuenta + registra movimiento       │
│     c. Si no hay stock → no hace nada (el SKU no está en almacenes)    │
│  3. Marca evento como PROCESADO                                        │
│  4. Si falla 3 veces → FALLIDO + error_log (Dead-Letter Queue)        │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────┐     ┌──────────────────┐     ┌─────────────────────────┐
│  UI Almacenes    │────▶│  warehouse/      │────▶│  stock_almacen          │
│  (React)         │     │  router.py       │     │  movimientos_inventario │
│                  │     │  (16 endpoints)  │     │  almacenes              │
└─────────────────┘     └──────────────────┘     └─────────────────────────┘
```

### 2.2 Principio de No-Interferencia

> [!IMPORTANT]
> **Regla de Oro #1:** El módulo de almacenes **NUNCA** puede interrumpir el POS. Toda integración con `pos/service.py` está envuelta en `try/except pass`. Si el módulo de almacenes falla completamente (tablas borradas, errores de código), el POS sigue cobrando sin afectación.

> [!IMPORTANT]
> **Regla de Oro #2:** El procesador de eventos está envuelto en `try/except pass` a nivel global. Si el procesador crashea, el servidor FastAPI sigue corriendo. Los eventos quedan como PENDIENTE y se reprocesan en el siguiente ciclo.

---

## 3. MODELO DE DATOS

### 3.1 Tabla `almacenes`

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | `String PK` | Formato `alm_{uuid8}` (ej. `alm_a2efcd56`) |
| `nombre` | `String NOT NULL` | Nombre legible (ej. "Exhibidor Pan Dulce") |
| `zona_termica` | `String` | `SECO`, `REFRIGERADO`, `CONGELADO` |
| `proposito` | `String` | Código de subcategoría (FK lógica → `warehouse_propositos.codigo`). Ej. `ALMACENAMIENTO`, `EXHIBICION_VENTA`, `SIN_CLASIFICAR` |
| `sucursal_id` | `String nullable` | Para futuras sucursales |
| `foto_url` | `String nullable` | **v10** — Foto real del almacén físico (subida desde el equipo) |
| `planograma_url` | `String nullable` | **v10** — Imagen de la infografía de acomodo (planograma) |
| `pautas_acomodo` | `JSON` | **v10** — Lista de instrucciones de acomodo (una por línea de texto) |
| `activo` | `Boolean` | Soft delete |
| `created_at` | `DateTime` | Fecha de creación |

> [!NOTE]
> Las columnas `foto_url`, `planograma_url` y `pautas_acomodo` **existían desde v7** en el modelo, pero no tenían interfaz de captura. La **Fase 10** las activó en la UI. **No requirió migración ni cambio de backend**: `create_warehouse` usa `payload.model_dump()` y `update_warehouse` usa `payload.model_dump(exclude_unset=True)`, por lo que los tres campos ya se persistían si se enviaban.

### 3.1.1 Tabla `warehouse_propositos` (v8 — subcategorías dinámicas)

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | `String PK` | Formato `wpr_{uuid8}` |
| `codigo` | `String UNIQUE` | Código normalizado (mayúsculas, sin acentos). Ej. `EXHIBICION_VENTA` |
| `label` | `String` | Nombre visible en la UI. Ej. "Exhibición Venta" |
| `icono` | `String` | Emoji de la subcategoría |
| `orden` | `Integer` | Orden de aparición en la barra de pestañas |
| `es_sistema` | `Boolean` | Si es `true`, **no puede desactivarse** (protección) |
| `activo` | `Boolean` | Soft delete |
| `created_at` | `DateTime` | Fecha de creación |

**Subcategorías base sembradas** (vía `ensure_warehouse_propositos` en `main.py`, idempotente):

| Código | Label | Sistema |
|---|---|---|
| `ALMACENAMIENTO` | Almacenamiento | ✅ |
| `EXHIBICION_VENTA` | Exhibición Venta | ✅ |
| `PRODUCCION` | Producción | ✅ |
| `SIN_CLASIFICAR` | Sin Clasificar | ✅ |

> [!IMPORTANT]
> `SIN_CLASIFICAR` es la **cuarentena del sistema**: es el destino por defecto al eliminar una subcategoría con almacenes asignados. **No se muestra en la barra de pestañas**, solo en el modal de gestión. Un almacén nunca queda huérfano.

### 3.2 Tabla `stock_almacen`

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | `String PK` | Formato `stk_{uuid8}` |
| `almacen_id` | `FK → almacenes.id` | A qué almacén pertenece |
| `item_id` | `String` | SKU del producto o ID del insumo |
| `item_type` | `String` | `PRODUCTO` o `INSUMO` |
| `cantidad_actual` | `Float` | Stock actual |
| `stock_minimo` | `Float` | Umbral de alerta baja |
| `stock_maximo` | `Float` | Capacidad máxima |
| `fecha_ingreso` | `DateTime` | Primer ingreso (para alerta PEPS) |
| `dias_anaquel_alerta` | `Integer nullable` | Días máx en anaquel antes de alertar |
| `version` | `Integer default 1` | **Bloqueo optimista** |
| `ultima_actualizacion` | `DateTime` | Auto-actualizado |

### 3.3 Tabla `movimientos_inventario`

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | `String PK` | Formato `mov_{uuid8}` |
| `almacen_origen_id` | `String nullable` | `NULL` = entrada externa (proveedor) |
| `almacen_destino_id` | `String nullable` | `NULL` = salida (venta/merma) |
| `item_id` | `String` | SKU o ID insumo |
| `item_type` | `String` | `PRODUCTO` o `INSUMO` |
| `cantidad` | `Float` | Cantidad movida |
| `tipo_movimiento` | `String` | Ver enum abajo |
| `metodo_captura` | `String` | `MANUAL`, `VOZ`, `VISION_SNAPSHOT`, `EVENTO_POS`, `ENTRADA_MASIVA` |
| `usuario_id` | `String` | Quién realizó el movimiento (o `SISTEMA` para outbox) |
| `notas` | `String nullable` | Obligatorio en mermas |
| `lote_entrada_id` | `String nullable` | Agrupa movimientos de entrada masiva |
| `timestamp` | `DateTime` | Cuándo ocurrió |

**Tipos de movimiento:**
| Enum | Descripción |
|---|---|
| `ENTRADA_COMPRA` | Compra a proveedor |
| `PRODUCCION_ENTRADA` | Producto terminado entra de producción |
| `TRASPASO_SALIDA` | Sale de un almacén hacia otro |
| `TRASPASO_ENTRADA` | Entra a un almacén desde otro |
| `SALIDA_VENTA` | Descuento automático por venta POS |
| `MERMA` | Pérdida (quemado, caducado, roto) |
| `AJUSTE_INVENTARIO` | Corrección manual de conteo |

### 3.4 Tabla `warehouse_events` (Outbox + DLQ)

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | `Integer PK SERIAL` | Autoincremental |
| `ticket_id` | `Integer UNIQUE` | Idempotencia — un ticket = un evento |
| `items_json` | `JSON` | `[{"sku": "SKU-001", "qty": 3}, ...]` |
| `estado` | `String` | `PENDIENTE` → `PROCESADO` o `FALLIDO` |
| `intentos` | `Integer default 0` | Máximo 3 antes de marcar FALLIDO |
| `error_log` | `String nullable` | Mensaje de error (solo en FALLIDO) |
| `created_at` | `DateTime` | Cuándo se creó el evento |

### 3.5 Tabla `insumos` (stub)

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | `String PK` | Formato `ins_{uuid8}` |
| `nombre` | `String` | Nombre (ej. "Harina de Trigo T55") |
| `unidad_base` | `String` | `KG`, `LT`, `PZA` |
| `unidad_compra` | `String` | `BULTO`, `CAJA`, `COSTAL` |
| `factor_conversion` | `Float` | 1 COSTAL = 50 KG |
| `categoria_insumo` | `String` | `MATERIA_PRIMA`, `EMPAQUE`, `QUIMICO` |
| `activo` | `Boolean` | Soft delete |

### 3.6 Diagrama de Relaciones

```
almacenes ─────────── stock_almacen
    │                    (1:N — un almacén tiene muchos items en stock)
    │
    ├── movimientos_inventario (almacen_origen_id / almacen_destino_id)
    │       (N:1 — muchos movimientos referencian un almacén)
    │
    └── warehouse_events
            (independiente — referencia tickets por ticket_id)

insumos (standalone — referenciado por stock_almacen.item_id cuando item_type='INSUMO')
products (standalone — referenciado por stock_almacen.item_id cuando item_type='PRODUCTO' vía SKU)
```

---

## 4. API ENDPOINTS

Prefijo: `/api/v1/warehouse`

### 4.1 CRUD Almacenes (ya existían)

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/` | Listar todos los almacenes |
| `POST` | `/` | Crear almacén |
| `PUT` | `/{id}` | Actualizar almacén |
| `DELETE` | `/{id}` | Eliminar (Integridad Imperial: no si hay stock > 0) |

### 4.2 Stock (ya existían + nuevos)

| Método | Ruta | Estado | Descripción |
|---|---|---|---|
| `GET` | `/{id}/stock` | ✅ Existía | Stock enriquecido (nombre, imagen, precio del producto) |
| `POST` | `/{id}/stock` | ✅ Existía | Registrar entrada individual |
| `PUT` | `/{id}/stock/{stock_id}` | ✅ **Nuevo** | Actualizar con bloqueo optimista (409 Conflict) |

### 4.3 Operaciones (ya existían + nuevos)

| Método | Ruta | Estado | Descripción |
|---|---|---|---|
| `POST` | `/traspasos` | ✅ Mejorado | Mover stock (valida stock suficiente en origen) |
| `POST` | `/{id}/entrada-masiva` | ✅ **Nuevo** | Entrada en lote con `lote_entrada_id` compartido |
| `POST` | `/{id}/mermas` | ✅ **Nuevo** | Registrar merma (notas obligatorias, valida stock) |
| `POST` | `/upload-image` | ✅ Existía | Subir imagen (foto del almacén **o** planograma). Devuelve `{"image_url": "/static/inventory/{filename}"}`. Usado por v10 para `foto_url` y `planograma_url` |

### 4.4 Consultas (nuevas)

| Método | Ruta | Estado | Descripción |
|---|---|---|---|
| `GET` | `/movimientos` | ✅ **Nuevo** | Historial auditable (filtro por almacén, límite) |
| `GET` | `/eventos/pendientes` | ✅ **Nuevo** | Outbox: eventos esperando procesamiento |
| `GET` | `/eventos/fallidos` | ✅ **Nuevo** | Dead-Letter Queue: eventos que fallaron 3+ veces |

### 4.5 Insumos (ya existían)

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/insumos` | Listar insumos |
| `POST` | `/insumos` | Crear insumo |

### 4.6 Subcategorías (v8 — nuevas)

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/subcategorias` | Listar subcategorías (`?incluir_inactivos=true` para incluir desactivadas) |
| `POST` | `/subcategorias` | Crear subcategoría (código normalizado automáticamente) |
| `PUT` | `/subcategorias/{proposito_id}` | Actualizar label, icono u orden (busca por **`id`** `wpr_...`, no por código) |
| `DELETE` | `/subcategorias/{proposito_id}` | Eliminar. Si tiene almacenes → **409** con conteo; usar `/trasladar` para forzar |
| `POST` | `/subcategorias/trasladar` | Trasladar almacenes entre subcategorías y luego eliminar la origen |

> [!IMPORTANT]
> **Orden de rutas:** las rutas literales (`/subcategorias`, `/subcategorias/trasladar`) están declaradas **antes** de las rutas con parámetro (`/{warehouse_id}`, `/subcategorias/{proposito_id}`). Invertir el orden haría que FastAPI interpretara `"subcategorias"` como un `warehouse_id`.

> [!IMPORTANT]
> **`usuario_id` es un QUERY PARAMETER**, no un header. Todos los endpoints de subcategorías lo requieren (ej. `?usuario_id=1`). Sin él, `verificar_permiso` lanza **403**.

**Contrato de `/subcategorias/trasladar`:**
```json
{ "origen_codigo": "PRODUCCION", "destino_codigo": "SIN_CLASIFICAR" }
```
`trasladar_almacenes()` devuelve un **`int`** (número de almacenes movidos).

**Reglas de negocio de subcategorías:**
| Regla | Comportamiento |
|---|---|
| Subcategoría de sistema (`es_sistema=true`) | No puede desactivarse → **409** |
| Eliminar subcategoría con almacenes | **409** + conteo; requiere traslado explícito |
| Eliminar subcategoría vacía | Borrado físico |
| `SIN_CLASIFICAR` | Cuarentena del sistema; oculta en la barra, visible en el modal |

---

## 5. BLOQUEO OPTIMISTA

### ¿Qué es?
Previene que dos personas actualicen el mismo stock simultáneamente y una sobreescriba a la otra.

### ¿Cómo funciona?

```
1. Usuario A lee stock de Conchas: cantidad=24, version=5
2. Usuario B lee stock de Conchas: cantidad=24, version=5
3. Usuario A envía PUT con version=5, cantidad=20
   → Backend: version actual (5) == esperada (5) ✅
   → Actualiza: cantidad=20, version=6
4. Usuario B envía PUT con version=5, cantidad=18
   → Backend: version actual (6) ≠ esperada (5) ❌
   → HTTP 409 Conflict: "Refresca y reintenta"
5. Usuario B refresca → ve cantidad=20, version=6
   → Envía PUT con version=6, cantidad=18 ✅
```

### Código clave
```python
if stock.version != payload.version:
    raise HTTPException(status_code=409,
        detail=f"Conflicto de versión. Esperada: {payload.version}, actual: {stock.version}")
stock.version += 1
```

---

## 6. OUTBOX PATTERN (POS → ALMACENES)

### 6.1 ¿Por qué Outbox y no llamada directa?

| Enfoque | Problema |
|---|---|
| Llamada directa (POS → warehouse.descontar()) | Si warehouse falla, el ticket no se cobra. **INACEPTABLE** |
| Outbox Pattern (POS inserta evento → processor lo procesa después) | Si warehouse falla, el ticket se cobra igual. El evento queda PENDIENTE y se reprocesa |

### 6.2 Flujo Completo

```
VENTA EN POS
    │
    ▼
create_ticket() en pos/service.py
    │
    ├── Crea ticket, items, calcula total
    │
    ├── if status == "PAID":
    │       try:
    │           db.add(WarehouseEvent(ticket_id, items_json))
    │       except:
    │           pass  ← NUNCA INTERRUMPIR
    │
    ├── await db.commit()  ← UNA sola transacción atómica
    │
    ▼
EVENTO EN warehouse_events (estado=PENDIENTE)
    │
    ▼ (cada 30 segundos)
OUTBOX PROCESSOR
    │
    ├── Lee items_json: [{"sku": "SKU-001", "qty": 3}]
    │
    ├── Para cada SKU:
    │       Busca stock en almacén EXHIBICION_VENTA
    │       Si existe y hay suficiente → descuenta + registra MovimientoInventario
    │       Si no existe → ignora (producto no está en almacenes aún)
    │
    ├── estado = "PROCESADO" ✅
    │
    └── Si falla 3 veces → estado = "FALLIDO" + error_log (DLQ)
```

### 6.3 Idempotencia

El campo `ticket_id` en `warehouse_events` tiene constraint `UNIQUE`. Si por alguna razón se intenta crear un segundo evento para el mismo ticket, la BD lo rechaza automáticamente.

### 6.4 Garantía de Atomicidad

El evento se inserta **ANTES** de `db.commit()`, dentro de la misma transacción que la venta:
- Si la transacción falla → ni la venta ni el evento se persisten
- Si el servidor muere después del commit → ambos están guardados
- **No hay ventana de pérdida de datos**

---

## 7. DATOS SEED

Script: `apps/api/migrations/seed_almacenes.py` (idempotente)

### 7.1 Almacenes (7)

| Nombre | Zona | Propósito | Canal |
|---|---|---|---|
| Bodega Insumos | SECO | ALMACENAMIENTO | Panadería |
| Exhibidor Pan Dulce | SECO | EXHIBICION_VENTA | Panadería |
| Exhibidor Pan Salado | SECO | EXHIBICION_VENTA | Panadería |
| Refrigerador Materias Primas | REFRIGERADO | ALMACENAMIENTO | Panadería |
| Cámara de Helados | CONGELADO | ALMACENAMIENTO | Heladería |
| Exhibidor Helados | CONGELADO | EXHIBICION_VENTA | Heladería |
| Almacén Insumos Heladería | SECO | ALMACENAMIENTO | Heladería |

### 7.2 Insumos (12)

| Nombre | Unidad | Compra | Factor | Categoría |
|---|---|---|---|---|
| Harina de Trigo T55 | KG | COSTAL | 50 | MATERIA_PRIMA |
| Azúcar Estándar | KG | COSTAL | 50 | MATERIA_PRIMA |
| Manteca Vegetal | KG | CAJA | 20 | MATERIA_PRIMA |
| Huevo | PZA | CAJA | 360 | MATERIA_PRIMA |
| Leche Entera | LT | CAJA | 12 | MATERIA_PRIMA |
| Mantequilla | KG | CAJA | 10 | MATERIA_PRIMA |
| Levadura Fresca | KG | CAJA | 5 | MATERIA_PRIMA |
| Bolsa Papel Kraft | PZA | BULTO | 1000 | EMPAQUE |
| Charola Cartón | PZA | BULTO | 500 | EMPAQUE |
| Vaso Helado Chico | PZA | CAJA | 200 | EMPAQUE |
| Vaso Helado Grande | PZA | CAJA | 150 | EMPAQUE |
| Cono Waffle | PZA | CAJA | 100 | EMPAQUE |

---

## 8. INTEGRACIÓN CON OTROS MÓDULOS

### 8.1 Con POS (Panadería + Heladería)

- **6 líneas en `pos/service.py`** — Outbox insert ANTES del commit
- **`try/except pass`** — NUNCA interrumpe el POS
- Aplica a **todos** los tickets con `status == "PAID"` (panadería y heladería por igual)
- El `items_json` captura SKU + cantidad, genérico para cualquier canal

### 8.2 Con Auditoría y Control

- Los movimientos de inventario (`/movimientos`) son el equivalente a los tickets de auditoría pero para almacenes
- Los eventos de outbox (`/eventos/pendientes`, `/eventos/fallidos`) permiten al gerente diagnosticar problemas de sincronización

### 8.3 Con Heladería

- El seed incluye 3 almacenes específicos para heladería (Cámara, Exhibidor, Insumos)
- Los tickets con `channel='HELADERIA'` generan eventos outbox idénticos a los de panadería
- El procesador busca almacenes `EXHIBICION_VENTA` que tengan el SKU — sin importar si es pan o helado

### 8.4 Con Catálogo de Productos

- El stock de tipo `PRODUCTO` referencia `products.sku` (no `products.id`)
- La vista de stock enriquecida (`GET /{id}/stock`) cruza con la tabla `products` para mostrar nombre, imagen y precio

---

## 9. MODELO DE UNIDADES

```
┌──────────────────────┐      ┌──────────────────────┐      ┌──────────────────────┐
│  ALM. INSUMOS        │      │  PRODUCCIÓN          │      │  EXHIBIDOR           │
│  (ALMACENAMIENTO)    │      │  (externo al módulo) │      │  (EXHIBICION_VENTA)  │
│                      │      │                      │      │                      │
│  ENTRA: Harina KG    │─────▶│  Harina KG → 🍞     │─────▶│  ENTRA: Pan PZA      │
│  ENTRA: Azúcar KG    │      │  Azúcar KG → 🍩     │      │  SALE:  Pan PZA      │
│                      │      │                      │      │    (vía POS/Evento)  │
│  Unidad: KG          │      │  Conversión en       │      │  Unidad: PZA         │
│                      │      │  recetas/producción  │      │                      │
└──────────────────────┘      └──────────────────────┘      └──────────────────────┘
```

> [!TIP]
> **No hay conversión de unidades dentro del módulo de almacenes.** Cada almacén opera en su unidad nativa. La conversión KG → PZA ocurre en el módulo de Producción (recetas). El almacén de insumos maneja KG/LT, el exhibidor maneja PZA. Simple.

---

## 10. DECISIONES TÉCNICAS

| Decisión | Razón |
|---|---|
| **PKs String** (`alm_uuid8`) | Legibilidad operativa: "alm_abc123" es más humano que "id: 47" |
| **Outbox Pattern** (no llamada directa) | El POS nunca puede fallar por culpa de almacenes |
| **try/except pass** en POS | Garantía absoluta de no-interferencia |
| **Bloqueo optimista** (no pesimista) | No bloquea la BD. Solo detecta conflictos al momento de escribir |
| **`EXHIBICION_VENTA`** como target del outbox | Solo descuenta de exhibidores (donde se vende), no de bodegas |
| **Subcategorías en tabla, no enum** (v8) | `proposito` era un enum cerrado en Pydantic; migrar a tabla `warehouse_propositos` permite crear subcategorías sin tocar código ni migrar |
| **`zona_termica` como texto libre** | A diferencia de `proposito`, nunca fue enum; por eso el modal antiguo de zonas funcionaba sin backend |
| **Borrado físico con bloqueo preventivo** (v8) | Eliminar una subcategoría con almacenes devuelve 409 y exige traslado explícito; nunca deja almacenes huérfanos |
| **`SIN_CLASIFICAR` como cuarentena** (v8) | Destino por defecto al trasladar; oculto en la barra para no ensuciar la navegación diaria |
| **Subcategorías de sistema no desactivables** (v8) | `es_sistema=true` → 409 al intentar `activo=false`; protege la integridad de la navegación |
| **Foto con prioridad sobre icono** (v10) | La fotografía real del almacén es más informativa que un emoji; el icono queda como fallback obligatorio |
| **Modal anidado con `z-[400]`** (v10) | El editor de almacén usa `z-[200]` y el diálogo de borrado `z-[300]`; la infografía debe quedar por encima de ambos |
| **Modal anidado NO cierra con backdrop** (v10) | Solo el botón "Listo" lo cierra, para no perder una imagen recién subida a medio flujo |
| **`stopPropagation` en backdrop anidado** (v10) | Evita que el clic de cierre se propague y cierre también el editor de almacén subyacente |
| **`pautas_acomodo` como lista de líneas** (v10) | El textarea captura una instrucción por línea; se persiste como `List[str]` en la columna JSON |
| **Enviar siempre los 3 campos visuales** (v10) | `update_warehouse` usa `exclude_unset=True`: omitir un campo NO lo limpia. Enviarlos siempre permite al operador quitar una foto previamente guardada |
| **`custom-scrollbar` en todo contenedor desplazable** (v10 fix) | La barra por defecto del navegador (gris claro) contrasta agresivamente contra el tema oscuro; el proyecto define un pulgar naranja translúcido de 4px |
| **Polling 30s** (no WebSocket) | Simplicidad. La latencia de 30s es aceptable para inventario |
| **`ticket_id UNIQUE`** en eventos | Idempotencia: un ticket nunca genera dos eventos |
| **Evento ANTES del commit** | Atomicidad: venta + evento en una sola transacción |
| **3 reintentos → FALLIDO** | Dead-Letter Queue visible para diagnóstico, no loop infinito |
| **`usuario_id = "SISTEMA"`** en outbox | Trazabilidad: se sabe que fue descuento automático, no manual |

---

## 11. FRONTEND

### 11.1 Archivos existentes

| Archivo | Contenido |
|---|---|
| `apps/inventory/WarehouseManagerUI.jsx` | UI completa de gestión de almacenes (pestañas térmicas, tarjetas, stock, movimientos, modales) |
| `apps/inventory/WarehouseHubUI.jsx` | Hub de navegación del módulo |
| `apps/inventory/utils/warehouseMappers.js` | Funciones puras de mapeo/validación (DRY): `mapWarehouseFromApi`, `buildWarehouseCreatePayload`, `validatePropositoForm`, etc. |
| `apps/inventory/utils/warehouseMappers.test.js` | 95 pruebas Vitest sobre las funciones puras (sin montar React) |
| `apps/inventory/services/offlineQueue.js` | Cola de operaciones offline (IndexedDB + sync al reconectar) |
| `apps/inventory/services/pwaRuntime.js` | Registro del Service Worker + branding dinámico desde settings |

### 11.2 Patrón DRY: funciones puras + tests

La lógica de mapeo y validación vive en `warehouseMappers.js` como **funciones puras**, no dentro del componente React. Esto permite probarlas con Vitest sin montar la UI:

```javascript
// Mapeo API → UI (español → inglés)
export const mapWarehouseFromApi = (wh) => ({
    ...wh,
    name: wh.nombre || 'Sin nombre',
    type: wh.zona_termica || 'SECO',
    fotoUrl: wh.foto_url || null,          // v10
    planogramaUrl: wh.planograma_url || null, // v10
    pautasAcomodo: Array.isArray(wh.pautas_acomodo) ? wh.pautas_acomodo : [], // v10
});

// Payload UI → API (inglés → español)
export const buildWarehouseCreatePayload = (formData, selectedZone, subCategoryTab) => ({
    nombre: formData.name,
    zona_termica: selectedZone || formData.type,
    proposito: subCategoryTab || formData.proposito,
    foto_url: formData.fotoUrl || null,           // v10
    planograma_url: formData.planogramaUrl || null, // v10
    pautas_acomodo: formData.pautasAcomodo || [],   // v10
});
```

### 11.3 Botón flotante "Nuevo Almacén" (v9)

El botón flotante se renderiza con `ReactDOM.createPortal(<button .../>, document.body)` para escapar de contextos de apilamiento y ancestros con `overflow-hidden`. Requiere `import ReactDOM from 'react-dom';`.

### 11.4 Modal de almacén — orden de campos (v10)

El modal sigue un orden de lectura tipo ficha:

| # | Campo | Editable | Notas |
|---|---|---|---|
| 1 | Categoría (`zona_termica`) | ❌ Informativo | El operador ya la eligió al navegar (v9) |
| 2 | Subcategoría (`proposito`) | ❌ Informativo | El operador ya la eligió al navegar (v9) |
| 3 | Nombre del almacén | ✅ | Obligatorio |
| 4 | Icono / Fotografía | ✅ | 12 emojis curados **o** foto subida del equipo |
| 5 | Capacidad máxima de items | ✅ | Numérico |
| 6 | Botón "Infografía de Acomodo" | — | Abre el modal anidado |

> [!NOTE]
> **Categoría y Subcategoría son INFORMATIVAS, no editables** (decisión v9). El operador ya las eligió al navegar (zona → pestaña de subcategoría); el modal no debe volver a preguntarlas ni permitir contradecir la navegación. Al editar, muestran los valores reales del almacén.

### 11.5 Modal anidado "Infografía de Acomodo" (v10)

| Elemento | Destino | Descripción |
|---|---|---|
| Imagen de la infografía | `planograma_url` | Planograma subido desde el equipo |
| Pautas de acomodo | `pautas_acomodo` | Textarea: una instrucción por línea → `List[str]` |

**Detalles de implementación:**
- `z-[400]` — por encima del editor (`z-[200]`) y del diálogo de borrado (`z-[300]`)
- Backdrop con `stopPropagation` — no cierra el editor subyacente
- Solo el botón "Listo" cierra el modal — evita perder una imagen a medio subir
- Estado independiente (`showPlanograma`) — cerrarlo no cierra el editor que lo abrió

### 11.6 Representación visual en tarjetas y detalle (v10)

La fotografía real tiene **prioridad visual** sobre el icono. Si no hay foto, se cae al emoji de la zona térmica (comportamiento previo). Esto aplica tanto a las tarjetas de la lista como al encabezado del detalle.

### 11.7 Scrollbar personalizado (v10 fix)

Todo contenedor desplazable dentro de un modal oscuro **DEBE** llevar la clase `custom-scrollbar`, definida en `index.css`:

```css
.custom-scrollbar::-webkit-scrollbar { width: 4px; }
.custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
.custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(249, 115, 22, 0.2); border-radius: 10px; }
.custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(249, 115, 22, 0.5); }
```

Sin ella, el navegador usa su barra por defecto (gris claro, ~15px), que contrasta de forma agresiva contra el fondo oscuro.

### 11.8 Vigilancia visible de `SIN_CLASIFICAR` (v11 — Fase 11.3)

**Deuda reparada:** el endpoint `GET /api/v1/warehouse/diagnostico/sin-almacen` existía desde v7 y era correcto, pero **nadie lo consumía desde la UI**. Un SKU que no se pudo descontar del stock quedaba registrado en `warehouse_eventos_sin_almacen` y jamás se mostraba al operador: la pérdida era silenciosa.

**Diseño aprobado:** tres capas de vigilancia, de menor a mayor intrusividad.

| Capa | Qué hace | Dónde |
|---|---|---|
| **A — Badge** | Si hay incidencias, aparece un botón rojo "🚨 Cuarentena" con el conteo en la barra de subcategorías | [`WarehouseManagerUI.jsx`](apps/inventory/WarehouseManagerUI.jsx:1338) |
| **B — Panel** | Tabla de diagnóstico: SKU, motivo legible, ocurrencias, cantidad, última vez y acción sugerida | [`WarehouseManagerUI.jsx`](apps/inventory/WarehouseManagerUI.jsx:2547) |
| **C — Resolución** | Cada fila ofrece una **acción sugerida** (nunca automática) | [`warehouseMappers.js`](apps/inventory/utils/warehouseMappers.js:568) |

**Regla de oro respetada:** la IA propone, el operador confirma. El panel **sugiere** ("Asignar almacén", "Ver stock", "Revisar producto") pero **nunca** resuelve el huérfano por sí solo.

**Nota de UI (Incidente 16.1):** el badge **NO** usa `animate-pulse` ni ninguna animación de bucle infinito. Solo transiciones de montaje único.

**Funciones puras (cubiertas por Vitest):**

| Función | Responsabilidad |
|---|---|
| `mapEventoSinAlmacenFromApi` | Mapea un registro API (español) → UI (inglés) |
| `mapEventosSinAlmacenFromApi` | Mapea la lista completa |
| `etiquetaMotivoSinAlmacen` | Traduce el código técnico a lenguaje del operador |
| `accionSugeridaSinAlmacen` | Sugiere la acción concreta (human-in-the-loop) |
| `contarEventosSinAlmacen` | Alimenta el badge (nunca devuelve `NaN`) |
| `agruparEventosSinAlmacenPorSku` | Una fila por SKU, no por intento |

### 11.9 Pendiente

- Escáner IA (visión de charolas) — Fase 2 del plan
- AI Gateway real (Whisper + LLM local) — depende del módulo IA Local

---

## 12. COLORES SEMÁNTICOS POR ZONA TÉRMICA

| Zona | Fondo | Acento | Borde | Uso |
|---|---|---|---|---|
| SECO | `#2D3748` | `#A0AEC0` | `#4A5568` | Bodegas, exhibidores de pan |
| REFRIGERADO | `#EBF8FF` | `#3182CE` | `#BEE3F8` | Refrigerador de materias primas |
| CONGELADO | `#1A365D` | `#63B3ED` | `#2A4365` | Cámara de helados, exhibidor helados |

---

## 13. EL CEMENTERIO DE BUGS

> Sección reservada para documentar bugs críticos descubiertos en producción.
> Formato: Síntoma → Causa Raíz → Solución → Regla de Oro.

### Estado actual: 🟡 3 bugs resueltos

### 🐛 BUG 1: Crash de UI por Desajuste de Nombres de Campos (API vs Frontend)

**El Síntoma:**
Al entrar al módulo "Gestión de Almacenes" desde cualquier terminal, la pantalla mostraba un error fatal: `TypeError: Cannot read properties of undefined (reading 'toLowerCase')`. El módulo era completamente inaccesible.

**Causa Raíz:**
1. La API de almacenes (`/api/v1/warehouse/`) devuelve objetos con nombres de campos **en español**: `{ nombre, zona_termica, proposito, ... }`.
2. La UI (`WarehouseManagerUI.jsx`) fue construida originalmente con datos hardcodeados que usaban campos **en inglés**: `{ name, type, icon, ... }`.
3. Al conectar la UI con la API real (línea 52: `fetchWarehouses()`), se inyectaron los datos de la API directamente al state sin mapear campos.
4. En la línea 87, el filtro de búsqueda hacía `wh.name.toLowerCase()`. Como `wh.name` era `undefined` (el campo real era `wh.nombre`), JavaScript lanzaba el `TypeError`.

**Solución Implementada:**
- En `fetchWarehouses()`, se agregó un mapeo explícito entre los campos de la API y los que la UI espera:
```javascript
const mapped = res.data.map(wh => ({
    ...wh,
    name: wh.nombre || wh.name || 'Sin nombre',
    type: wh.zona_termica || wh.type || 'SECO',
    icon: wh.zona_termica === 'CONGELADO' ? '❄️' :
          wh.zona_termica === 'REFRIGERADO' ? '🧊' : '📦',
    capacity: 100,
    current: 0
}));
```
- **Regla de Oro:** Al conectar una UI pre-existente con una API, **SIEMPRE** verificar que los nombres de campos coincidan. Si la API usa español y la UI inglés, crear una capa de mapeo en el `fetch`, nunca asumir que los campos se llaman igual.

### 🐛 BUG 2: Crash en el Detalle del Almacén por `.map()` (Stock UI vs Stock Backend)

**El Síntoma:**
Al entrar a cualquier almacén en específico (ej. "Bodega Insumos"), la UI crasheaba mostrando `TypeError: Cannot read properties of undefined (reading 'map')`.

**Causa Raíz:**
1. La variable `whContent` obtenía su valor de la función `getWHContent(whId)`.
2. Esta función hacía `return wh ? wh.items : []`, confiando en que el almacén tuviera un arreglo interno `items`.
3. Esto era cierto para los mock data locales, pero la estructura `AlmacenResponse` del backend no devuelve los items anidados.
4. Al tratar de hacer `whContent.map()` en la tabla, como `wh.items` era `undefined`, la app lanzaba una excepción fatal.

**Solución Implementada:**
- Se desacopló la obtención del stock anidado. `getWHContent(whId)` ahora lee de un estado local `whInventories`.
- Se añadió un `useEffect` que detecta cuando cambia `selectedWH` y hace un fetch a `/{id}/stock` (datos reales).
- Los datos devueltos se mapean explícitamente a las propiedades de UI esperadas (ej. `cantidad_actual` → `stock`, `item_id` → `sku`).
- **Regla de Oro:** Nunca depender de objetos anidados (como `.items`) en respuestas HTTP si el schema Pydantic no lo incluye explícitamente. Consultar sub-recursos en peticiones separadas o adaptar el schema.

### 🐛 BUG 3: Barra de Desplazamiento con Contraste Agresivo en los Modales (v10)

**El Síntoma:**
Al abrir el modal de crear/editar almacén (o el modal anidado de "Infografía de Acomodo"), la barra de desplazamiento aparecía **gris claro**, generando un contraste muy agresivo contra el fondo oscuro del modal. El resto de paneles del módulo sí mostraban la barra naranja translúcida.

**Causa Raíz:**
1. El proyecto define una barra personalizada en `index.css` mediante la clase `.custom-scrollbar` (pulgar naranja `rgba(249, 115, 22, 0.2)`, 4px de ancho, pista transparente).
2. Todos los contenedores desplazables de `WarehouseManagerUI.jsx` usaban esa clase… **excepto los dos cuerpos de modal introducidos en la Fase 10**.
3. Al agregar `max-h-[60vh] overflow-y-auto` (editor) y `max-h-[55vh] overflow-y-auto` (infografía) se omitió `custom-scrollbar`, por lo que el navegador aplicó su barra por defecto (gris claro, ~15px).

**Solución Implementada:**
- Se agregó la clase `custom-scrollbar` a ambos contenedores:
```jsx
{/* Editor de almacén */}
<div className="space-y-6 max-h-[60vh] overflow-y-auto pr-1 custom-scrollbar">

{/* Modal anidado de infografía */}
<div className="space-y-6 max-h-[55vh] overflow-y-auto pr-1 custom-scrollbar">
```
- **Regla de Oro:** Todo contenedor con `overflow-y-auto` dentro de un modal oscuro **DEBE** llevar `custom-scrollbar`. Al crear un contenedor desplazable nuevo, copiar la clase del contenedor existente más cercano en lugar de escribir las clases a mano.

---

## 14. FASES PENDIENTES

### 14.1 Fases v7 (plan maestro)

| Fase | Contenido | Estado |
|---|---|---|
| 1A | Service completo (bloqueo optimista, entrada masiva, merma) | ✅ Completada |
| 1B | Router completo (16 endpoints) | ✅ Completada |
| 1C | Outbox POS (6 líneas en create_ticket) | ✅ Completada |
| 1D | Processor background (polling 30s) | ✅ Completada |
| 1F | Funciones 5 pestañas operativas y conexión Backend | ✅ Completada |
| 1G | PWA offline (sw.js + manifest + offlineQueue.js) | ✅ Completada |
| 2 | Auditoría y RBAC (secciones 13 y 14) | ✅ Completada |
| 3 | Verificación end-to-end (verify_fase1.py, verify_fase2.py) | ✅ Completada |
| 4 | AI Gateway (stubs voz + visión, fallback graceful) | ✅ Completada |
| 5 | Escáner IA (visión de charolas) | ⏸️ Pendiente |
| 6 | AI Gateway real (Whisper + LLM local) | ⏸️ Futuro (depende de módulo IA Local) |

### 14.2 Fases v8-v10 (subcategorías y representación visual)

| Fase | Contenido | Commit | Estado |
|---|---|---|---|
| v8 | Subcategorías dinámicas (`warehouse_propositos`), traslado, borrado protegido | `3bcaa5e` | ✅ Completada |
| v9 | Botón flotante "Nuevo Almacén" + Categoría/Subcategoría informativas en el modal | `107fb9a` | ✅ Completada |
| v10 | Foto del almacén, infografía de acomodo (planograma + pautas) y reordenamiento del modal | `aa33ce9` | ✅ Completada |
| v10 fix | Scrollbar oscuro coherente en los modales | `82fa134` | ✅ Completada |

### 14.3 Pendiente de infraestructura

| Tarea | Estado |
|---|---|
| Regenerar `ENTERPRISE_PAT` para reparar el espejo a San Pablo | ⏸️ Pendiente del usuario |

---

## 15. VERIFICACIÓN

Checklist para validar que el módulo funciona correctamente:

1. ✅ `GET /warehouse/` → 7 almacenes
2. ✅ `GET /warehouse/insumos` → 12 insumos
3. ✅ `GET /warehouse/eventos/pendientes` → lista vacía o con eventos
4. ✅ `GET /warehouse/eventos/fallidos` → lista vacía
5. ✅ `GET /pos/tickets` → POS funciona sin afectación
6. ✅ `GET /heladeria/menu` → 29 items
7. ✅ Crear entrada masiva → verificar `lote_entrada_id` compartido
8. ✅ Registrar merma → verificar notas y descuento
9. ✅ Update concurrente → verificar 409 Conflict
10. ✅ Venta POS → verificar evento PENDIENTE → PROCESADO (30s)
11. ✅ `GET /warehouse/subcategorias` → 4 subcategorías base (v8)
12. ✅ Crear subcategoría → código normalizado automáticamente (v8)
13. ✅ Eliminar subcategoría con almacenes → 409 + conteo (v8)
14. ✅ Trasladar almacenes → `int` con el número movido (v8)
15. ✅ Subcategoría de sistema → 409 al intentar desactivar (v8)
16. ✅ Subir foto del almacén → `foto_url` persistido (v10)
17. ✅ Subir infografía → `planograma_url` persistido (v10)
18. ✅ Capturar pautas de acomodo → `pautas_acomodo` como `List[str]` (v10)
19. ✅ Foto visible en tarjeta y detalle, con fallback al icono (v10)
20. ✅ Barra de desplazamiento oscura en ambos modales (v10 fix)

### 15.1 Comandos de verificación

```bash
# Frontend — pruebas unitarias de funciones puras
npx vitest run          # → 95/95 PASS

# Frontend — build de producción
npm run build           # → 1417 módulos, ~6.6s, exit 0

# Backend — pruebas de integración
docker exec rderico-api-dev python -m pytest tests/ -q   # → 21/21 PASS

# Salud de servicios
# API  → http://localhost:5001/health        → 200
# POS  → http://localhost:5000/index.html    → 200
```

> [!NOTE]
> `http://localhost:5000/` devuelve **404** porque la SPA de Vite no tiene ruta en `/`. Es el comportamiento esperado; usar `/index.html`.
