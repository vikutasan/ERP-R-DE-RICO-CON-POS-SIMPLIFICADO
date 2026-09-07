# 📦 DOCUMENTACIÓN MAESTRA: MÓDULO DE GESTIÓN DE ALMACENES — R de Rico ERP

> **⚠️ LECTURA OBLIGATORIA.** Cualquier IA o desarrollador que necesite interactuar, depurar o extender el Módulo de Gestión de Almacenes **DEBE** leer este documento. Aquí se detalla la arquitectura, el flujo de datos, el patrón Outbox, el bloqueo optimista y las reglas de negocio del módulo.
>
> **Última actualización:** 2026-09-07
> **Archivos gobernados:**
> - Backend: `apps/api/modules/warehouse/*` (models, schemas, service, router)
> - Frontend: `apps/inventory/WarehouseManagerUI.jsx`, `apps/inventory/WarehouseHubUI.jsx`
> - Integración POS: `apps/api/modules/pos/service.py` (6 líneas outbox)
> - Startup: `apps/api/main.py` (background task)
> - Seed: `apps/api/migrations/seed_almacenes.py`

---

## 1. PROPÓSITO DEL MÓDULO

El Módulo de Gestión de Almacenes controla **todo el inventario físico** del negocio R de Rico: materias primas (harina, azúcar, manteca), productos terminados (panes, helados) y empaques (bolsas, charolas, conos). Opera tanto para la **Panadería** como para la **Heladería**.

### Capacidades
- **CRUD de almacenes** — Crear, editar, eliminar almacenes con zonas térmicas (SECO/REFRIGERADO/CONGELADO)
- **Control de stock** — Stock por SKU con alertas PEPS (Primero En Entrar, Primero En Salir)
- **Entrada masiva** — Registrar lotes completos de proveedor en < 2 minutos
- **Traspasos** — Mover stock entre almacenes (ej. Bodega → Exhibidor)
- **Mermas** — Registrar pérdidas con notas obligatorias para auditoría
- **Bloqueo optimista** — Previene sobreescrituras concurrentes (error 409)
- **Outbox Pattern** — Descuento automático de stock por ventas POS
- **Dead-Letter Queue** — Eventos fallidos visibles para diagnóstico
- **Gestión de insumos** — Tabla stub para materias primas con unidades de conversión

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
| `proposito` | `String` | `ALMACENAMIENTO`, `EXHIBICION_VENTA` |
| `sucursal_id` | `String nullable` | Para futuras sucursales |
| `foto_url` | `String nullable` | Foto del almacén físico |
| `planograma_url` | `String nullable` | Imagen del estándar de acomodo |
| `pautas_acomodo` | `JSON` | Lista de reglas PEPS (ej. "Producto más antiguo al frente") |
| `activo` | `Boolean` | Soft delete |
| `created_at` | `DateTime` | Fecha de creación |

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
| `POST` | `/upload-image` | ✅ Existía | Subir foto de almacén/planograma |

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
| **Polling 30s** (no WebSocket) | Simplicidad. La latencia de 30s es aceptable para inventario |
| **`ticket_id UNIQUE`** en eventos | Idempotencia: un ticket nunca genera dos eventos |
| **Evento ANTES del commit** | Atomicidad: venta + evento en una sola transacción |
| **3 reintentos → FALLIDO** | Dead-Letter Queue visible para diagnóstico, no loop infinito |
| **`usuario_id = "SISTEMA"`** en outbox | Trazabilidad: se sabe que fue descuento automático, no manual |

---

## 11. FRONTEND

### 11.1 Archivos existentes

| Archivo | Tamaño | Contenido |
|---|---|---|
| `apps/inventory/WarehouseManagerUI.jsx` | 111 KB | UI completa de gestión de almacenes (pestañas térmicas, tarjetas, stock, movimientos) |
| `apps/inventory/WarehouseHubUI.jsx` | 10 KB | Hub de navegación del módulo |

### 11.2 Pendiente (Fases 1F/1G del plan)

- Evaluar si `WarehouseManagerUI.jsx` cubre todas las funciones nuevas (entrada masiva, merma, historial)
- Crear `offlineQueue.js` para operación sin red (IndexedDB + sync al reconectar)
- Crear `public/sw.js` (Service Worker) y `public/manifest.json` (PWA)
- Crear stubs de AI Gateway para voz + visión (fallback graceful)

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

### Estado actual: 🟡 1 bug resuelto

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

---

## 14. FASES PENDIENTES

| Fase | Contenido | Estado |
|---|---|---|
| 1A | Service completo (bloqueo optimista, entrada masiva, merma) | ✅ Completada |
| 1B | Router completo (16 endpoints) | ✅ Completada |
| 1C | Outbox POS (6 líneas en create_ticket) | ✅ Completada |
| 1D | Processor background (polling 30s) | ✅ Completada |
| 1E | Seed (7 almacenes + 12 insumos) | ✅ Completada |
| 1F | Evaluar/completar frontend + offlineQueue | ⏸️ Pendiente |
| 1G | PWA offline (sw.js + manifest) + AI Gateway stubs | ⏸️ Pendiente |
| 2 | Escáner IA (visión de charolas) | ⏸️ Pendiente |
| 3 | AI Gateway real (Whisper + LLM local) | ⏸️ Futuro (depende de módulo IA Local) |

---

## 15. VERIFICACIÓN

Checklist para validar que el módulo funciona correctamente:

1. ✅ `GET /warehouse/` → 7 almacenes
2. ✅ `GET /warehouse/insumos` → 12 insumos
3. ✅ `GET /warehouse/eventos/pendientes` → lista vacía o con eventos
4. ✅ `GET /warehouse/eventos/fallidos` → lista vacía
5. ✅ `GET /pos/tickets` → POS funciona sin afectación
6. ✅ `GET /heladeria/menu` → 29 items
7. ⬜ Crear entrada masiva → verificar `lote_entrada_id` compartido
8. ⬜ Registrar merma → verificar notas y descuento
9. ⬜ Update concurrente → verificar 409 Conflict
10. ⬜ Venta POS → verificar evento PENDIENTE → PROCESADO (30s)
