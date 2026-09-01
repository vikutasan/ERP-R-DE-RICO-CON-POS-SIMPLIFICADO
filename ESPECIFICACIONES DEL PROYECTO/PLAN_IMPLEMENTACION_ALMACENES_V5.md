# Plan de Implementación v5: Gestión de Almacenes — ERP R de Rico

> [!NOTE]
> Este documento será respaldado temporalmente en el repositorio GitHub del proyecto hasta que la implementación sea exitosa.

---

## 0. Fases de Ejecución

| Fase | Contenido | Dependencia |
|---|---|---|
| **Fase 1** | Modelos + CRUD + UI completa (pestañas térmicas, tarjetas, buscador, planograma, mermas, entrada masiva, PWA offline) | Ninguna |
| **Fase 2** | Outbox POS + procesador asíncrono + bloqueo optimista | Fase 1 |
| **Fase 3** | Escáner IA (visión de charolas vía `/api/v1/pos/vision/predict`) | Fase 1 |
| **Fase 4** | AI Gateway (stub) + Voz + Bluetooth + NLU + TTS | Fase 1 + Módulo "IA Local" (futuro) |

> [!IMPORTANT]
> La **Fase 4** depende de la instalación futura de Whisper y LLM local en el servidor (módulo "IA Local"). El AI Gateway se creará como stub con fallback graceful para que la UI esté preparada pero funcione en modo manual hasta que la infraestructura de IA esté lista.

---

## 1. Modelos de Datos

### 1.1 Enums

```python
class ZonaTermica(str, Enum):
    SECO = "SECO"
    REFRIGERADO = "REFRIGERADO"
    CONGELADO = "CONGELADO"

class PropositoAlmacen(str, Enum):
    ALMACENAMIENTO = "ALMACENAMIENTO"
    EXHIBICION_VENTA = "EXHIBICION_VENTA"

class MetodoCaptura(str, Enum):
    MANUAL = "MANUAL"
    VOZ = "VOZ"
    VISION_SNAPSHOT = "VISION_SNAPSHOT"
    EVENTO_POS = "EVENTO_POS"
    ENTRADA_MASIVA = "ENTRADA_MASIVA"

class ItemType(str, Enum):
    PRODUCTO = "PRODUCTO"
    INSUMO = "INSUMO"

class TipoMovimiento(str, Enum):
    ENTRADA_COMPRA = "ENTRADA_COMPRA"
    PRODUCCION_ENTRADA = "PRODUCCION_ENTRADA"
    TRASPASO_SALIDA = "TRASPASO_SALIDA"
    TRASPASO_ENTRADA = "TRASPASO_ENTRADA"
    SALIDA_VENTA = "SALIDA_VENTA"
    MERMA = "MERMA"
    AJUSTE_INVENTARIO = "AJUSTE_INVENTARIO"

class EstadoEvento(str, Enum):
    PENDIENTE = "PENDIENTE"
    PROCESADO = "PROCESADO"
    FALLIDO = "FALLIDO"

class CategoriaInsumo(str, Enum):
    MATERIA_PRIMA = "MATERIA_PRIMA"
    EMPAQUE = "EMPAQUE"
    QUIMICO = "QUIMICO"
```

### 1.2 Tabla `almacenes`

| Campo | Tipo | Notas |
|---|---|---|
| `id` | `String PK` | `alm_{uuid8}` |
| `nombre` | `String NOT NULL` | |
| `zona_termica` | `Enum ZonaTermica` | |
| `proposito` | `Enum PropositoAlmacen` | |
| `sucursal_id` | `String nullable` | Planta vs sucursales |
| `foto_url` | `String nullable` | |
| `planograma_url` | `String nullable` | |
| `pautas_acomodo` | `JSON` | `List[str]` |
| `activo` | `Boolean default True` | |
| `created_at` | `DateTime` | |

### 1.3 Tabla `stock_almacen` (con bloqueo optimista)

| Campo | Tipo | Notas |
|---|---|---|
| `id` | `String PK` | |
| `almacen_id` | `FK → almacenes.id` | |
| `item_id` | `String (SKU)` | |
| `item_type` | `Enum ItemType` | |
| `cantidad_actual` | `Float` | |
| `stock_minimo` | `Float` | |
| `stock_maximo` | `Float` | |
| `fecha_ingreso` | `DateTime` | Primer ingreso al anaquel |
| `dias_anaquel_alerta` | `Integer nullable` | Umbral para alerta PEPS |
| `version` | `Integer default 1` | **Bloqueo optimista** |
| `ultima_actualizacion` | `DateTime` | |

**Bloqueo optimista:** Cada UPDATE incluye `WHERE version = {expected}` y hace `version = version + 1`. Si 0 filas afectadas → error `409 Conflict` → el frontend refresca y reintentar.

### 1.4 Tabla `movimientos_inventario`

| Campo | Tipo | Notas |
|---|---|---|
| `id` | `String PK` | |
| `almacen_origen_id` | `String nullable` | NULL = entrada externa |
| `almacen_destino_id` | `String nullable` | NULL = salida (venta/merma) |
| `item_id` | `String` | |
| `item_type` | `Enum ItemType` | |
| `cantidad` | `Float` | |
| `tipo_movimiento` | `Enum TipoMovimiento` | |
| `metodo_captura` | `Enum MetodoCaptura` | |
| `usuario_id` | `String` | |
| `notas` | `String nullable` | Detalle de mermas |
| `lote_entrada_id` | `String nullable` | Agrupa movimientos de entrada masiva |
| `timestamp` | `DateTime` | |

### 1.5 Tabla `warehouse_events` (Outbox + DLQ)

| Campo | Tipo | Notas |
|---|---|---|
| `id` | `Integer PK` | |
| `ticket_id` | `Integer UNIQUE` | Idempotencia |
| `items_json` | `JSON` | |
| `estado` | `Enum EstadoEvento` | |
| `intentos` | `Integer default 0` | |
| `error_log` | `String nullable` | |
| `created_at` | `DateTime` | |

> [!IMPORTANT]
> **Fix crítico vs v4:** El INSERT del evento se hace **ANTES** de `await db.commit()`, dentro de la misma transacción que la venta. Si la transacción falla, tanto la venta como el evento se revierten juntos. Si el servidor muere después del commit, ambos están guardados.

```python
# EN pos/service.py → create_ticket() — ANTES de db.commit() (línea ~41)
if db_ticket.status == "PAID":
    try:
        from modules.warehouse.models import WarehouseEvent
        import json
        items_data = [{"sku": item.product.sku, "qty": item.quantity} for item in db_items]
        event = WarehouseEvent(ticket_id=db_ticket.id, items_json=json.dumps(items_data))
        db.add(event)
    except Exception:
        pass  # NUNCA interrumpir el POS

await db.commit()  # ← Persiste venta + evento en UNA transacción
```

### 1.6 Tabla stub `insumos`

| Campo | Tipo |
|---|---|
| `id` | `String PK` |
| `nombre` | `String` |
| `unidad_base` | `String` (KG, LT, PZA) |
| `unidad_compra` | `String` (BULTO, CAJA, COSTAL) |
| `factor_conversion` | `Float` |
| `categoria_insumo` | `Enum CategoriaInsumo` |
| `activo` | `Boolean` |

---

## 2. Modelo de Unidades (Simplificado para Panadería)

```
┌──────────────────────┐      ┌──────────────────────┐      ┌──────────────────────┐
│  ALM. INSUMOS        │      │  PRODUCCIÓN          │      │  EXHIBIDOR           │
│  (ALMACENAMIENTO)    │      │  (externo al módulo) │      │  (EXHIBICION_VENTA)  │
│                      │      │                      │      │                      │
│  ENTRA: Harina KG    │─────▶│  Harina KG → 🍞     │─────▶│  ENTRA: Pan PZA      │
│  ENTRA: Azúcar KG    │      │  Azúcar KG → 🍩     │      │  SALE:  Pan PZA      │
│  ENTRA: Manteca KG   │      │                      │      │    (vía POS/Evento)  │
│                      │      │                      │      │                      │
│  Unidad: KG          │      │  Conversión en       │      │  Unidad: PZA         │
│                      │      │  recetas/producción  │      │                      │
└──────────────────────┘      └──────────────────────┘      └──────────────────────┘
```

> [!TIP]
> **No hay conversión de unidades dentro del módulo de almacenes.** Cada almacén opera en su unidad nativa. La conversión KG → PZA ocurre en el módulo de Producción (recetas). El almacén de insumos maneja KG/LT, el exhibidor maneja PZA. Simple.

---

## 3. Flujo de Entrada Masiva

### Caso de uso
El proveedor llega con 20 costales de harina, 5 cajas de manteca, 10 bolsas de azúcar. El operador necesita registrar todo en < 2 minutos.

### UX: Modal "Entrada Masiva" (tipo planilla)

```
┌─────────────────────────────────────────────────────────────┐
│  📦 ENTRADA MASIVA — Almacén de Insumos (SECO)             │
│  Lote: LOT-20260831-001                                    │
│                                                            │
│  ┌──────────────┬──────────┬────────┬───────────────────┐  │
│  │ Artículo     │ Cantidad │ Unidad │ Notas             │  │
│  ├──────────────┼──────────┼────────┼───────────────────┤  │
│  │ 🔍 Harina T55│    20    │  KG    │ Proveedor Molinos │  │
│  │ 🔍 Manteca V │     5    │  KG    │                   │  │
│  │ 🔍 Azúcar Std│    10    │  KG    │                   │  │
│  │ + Agregar fila                                       │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                            │
│  [Cancelar]                    [✅ Registrar Todo (3 items)]│
└─────────────────────────────────────────────────────────────┘
```

### Lógica backend
- Un solo `POST /api/v1/warehouse/{id}/entrada-masiva` con array de items.
- Genera un `lote_entrada_id` compartido para todos los `MovimientoInventario` del lote.
- `tipo_movimiento = ENTRADA_COMPRA`, `metodo_captura = ENTRADA_MASIVA`.
- Cada item se procesa con bloqueo optimista individual.
- Respuesta: resumen del lote (items exitosos, items con conflicto).

---

## 4. PWA Offline (Service Worker + IndexedDB)

### Capacidades offline

| Funcionalidad | Offline | Sync al reconectar |
|---|---|---|
| Ver almacenes y stock (caché) | ✅ | Auto-refresh |
| Registrar entrada de stock | ✅ (cola local) | Auto-sync |
| Registrar merma | ✅ (cola local) | Auto-sync |
| Crear almacén | ❌ (requiere servidor) | — |
| Escáner IA | ❌ (requiere servidor) | — |

### Implementación

#### [NEW] `public/sw.js` — Service Worker
- Cachea assets estáticos (JS, CSS, imágenes).
- Intercepta GET requests a `/api/v1/warehouse` y sirve desde caché cuando offline.
- Estrategia: **Network First, Cache Fallback**.

#### [NEW] Módulo `offlineQueue.js` (IndexedDB)
```javascript
// Almacena operaciones pendientes cuando no hay red
const queue = {
    async push(operation) {
        // Guarda en IndexedDB: {type, endpoint, payload, timestamp}
    },
    async sync() {
        // Al reconectar, envía todas las operaciones pendientes en orden
        // Si alguna falla (409 Conflict), la descarta y notifica
    }
};

// Listener de conectividad
window.addEventListener('online', () => queue.sync());
```

#### [NEW] `public/manifest.json`
```json
{
    "name": "R de Rico — Almacenes",
    "short_name": "Almacenes",
    "start_url": "/",
    "display": "standalone",
    "theme_color": "#0a0a0a",
    "background_color": "#0a0a0a"
}
```

---

## 5. Arquitectura de Carpetas

```
apps/api/modules/
├── warehouse/
│   ├── __init__.py
│   ├── models.py              # Almacen, StockAlmacen, MovimientoInventario,
│   │                          # WarehouseEvent, Insumo
│   ├── schemas.py             # Todos los Enums + Pydantic schemas
│   ├── service.py             # CRUD + Outbox processor + DLQ + Mermas
│   │                          # + Bloqueo optimista + Entrada masiva
│   └── router.py              # Endpoints REST
│
├── ai_gateway/                # Stub (operativo cuando IA Local esté instalado)
│   ├── __init__.py
│   ├── client.py              # Cliente async con graceful fallback
│   ├── schemas.py             # NLUIntent, VoiceCommandResponse
│   └── router.py              # Proxy endpoints
│
├── pos/
│   └── service.py             # +6 líneas (Outbox insert ANTES del commit)

apps/inventory/
├── WarehouseManagerUI.jsx     # Reescritura completa
├── offlineQueue.js            # Cola offline (IndexedDB)

public/
├── sw.js                      # Service Worker
├── manifest.json              # PWA manifest
```

---

## 6. Endpoints API

### Warehouse (`/api/v1/warehouse`)

| Método | Ruta | Fase | Descripción |
|---|---|---|---|
| `GET` | `/` | 1 | Listar almacenes (filtro: `zona_termica`, `sucursal_id`) |
| `POST` | `/` | 1 | Crear almacén |
| `PUT` | `/{id}` | 1 | Actualizar almacén |
| `DELETE` | `/{id}` | 1 | Eliminar (Integridad Imperial) |
| `GET` | `/{id}/stock` | 1 | Stock con alertas PEPS calculadas |
| `POST` | `/{id}/stock` | 1 | Registrar entrada individual |
| `PUT` | `/{id}/stock/{stock_id}` | 1 | Actualizar (bloqueo optimista) |
| `POST` | `/{id}/entrada-masiva` | 1 | Entrada en lote (planilla) |
| `POST` | `/traspasos` | 1 | Mover stock entre almacenes |
| `POST` | `/mermas` | 1 | Registrar merma auditable |
| `POST` | `/upload-image` | 1 | Fotos (almacén/planograma) |
| `GET` | `/movimientos` | 1 | Historial auditable |
| `GET` | `/eventos/pendientes` | 2 | Outbox pendientes |
| `GET` | `/eventos/fallidos` | 2 | Dead-Letter Queue |
| `GET` | `/insumos` | 1 | Listar insumos (stub) |
| `POST` | `/insumos` | 1 | Crear insumo |

### AI Gateway (`/api/v1/ai`) — Fase 4

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/vision/detect` | Proxy visión con fallback |
| `POST` | `/voice/transcribe` | Proxy Whisper con fallback |
| `POST` | `/voice/parse-intent` | NLU texto → intención JSON + `mensaje_respuesta` (TTS) |

---

## 7. Frontend: UI/UX Completa

### 7.1 Landing: Pestañas Térmicas

```
┌─────────────────────────────────────────────────────┐
│  GESTIÓN DE ALMACENES           [+ Nuevo Almacén]   │
│                                                     │
│  ┌────────┐  ┌──────────────┐  ┌────────────┐      │
│  │ SECOS  │  │ REFRIGERADOS │  │ CONGELADOS │      │
│  │ #4A5568│  │   #3182CE    │  │  #1A365D   │      │
│  └────────┘  └──────────────┘  └────────────┘      │
│                                                     │
│  Grid 3 col (desktop) / Stack vertical (móvil)      │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐            │
│  │ 📷foto  │  │ 📷foto  │  │ SVG     │            │
│  │ Almacén │  │ Exhib.  │  │ fallback│ + NUEVO    │
│  │ Harina  │  │ Pan Dulce│  │ Empaques│            │
│  │ ██████░░│  │ ████░░░░│  │ █░░░░░░░│            │
│  │ ALMACEN │  │ EXHIB.  │  │ ALMACEN │            │
│  └─────────┘  └─────────┘  └─────────┘            │
└─────────────────────────────────────────────────────┘
```

### 7.2 Vista Detalle con Buscador + Alertas PEPS

```
┌─────────────────────────────────────────────────────┐
│  ← EXHIBIDOR PAN DULCE (SECO)      [📋PEPS] [⚙️]  │
│                                                     │
│  ┌─────────────────────────────────────────────┐    │
│  │ 🔍 Buscar por nombre o SKU...               │    │
│  └─────────────────────────────────────────────┘    │
│                                                     │
│  ┌ ✅ ─────────────────────────────────────────┐    │
│  │ CONCHA BLANCA  SKU-001   24 PZA  ██████░░   │    │
│  ├ ⚠️ border-yellow ──────────────────────────┤    │
│  │ CUERNO SAL     SKU-002    8 PZA  ████░░░░   │    │
│  │ ⏰ 3 días en anaquel (alerta: 2 días)       │    │
│  ├ 🔴 border-red animate-pulse ───────────────┤    │
│  │ POLVORÓN       SKU-003    3 PZA  █░░░░░░░   │    │
│  │ ⏰ 4 días en anaquel (alerta: 2 días) ¡ROTAR!│   │
│  └─────────────────────────────────────────────┘    │
│                                                     │
│  [🎤 Voz] [📷 Escáner] [📦 Masiva] [+ Agregar]    │
└─────────────────────────────────────────────────────┘
```

### 7.3 Modal: Planograma (2 pestañas)

**Pestaña 1 — Visual:** Foto del estándar de acomodo ideal + infografía de niveles (qué va en cada estante).

**Pestaña 2 — Checklist PEPS:**
```
☑ Producto más antiguo al frente
☑ Fecha de ingreso visible en etiqueta
☑ No mezclar lotes diferentes
☐ Limpieza de anaquel realizada hoy
☐ Temperatura verificada (si aplica)
```

### 7.4 Colores Semánticos

| Zona | Fondo | Acento | Borde |
|---|---|---|---|
| SECO | `#2D3748` | `#A0AEC0` | `#4A5568` |
| REFRIGERADO | `#EBF8FF` | `#3182CE` | `#BEE3F8` |
| CONGELADO | `#1A365D` | `#63B3ED` | `#2A4365` |

### 7.5 Touch-First

- Áreas de toque: mínimo **48×48px**.
- Botones de acción: altura **56px** con padding generoso.
- Swipe en tarjetas de stock para acciones rápidas.

---

## 8. Voz + Bluetooth (Fase 4 — Stub hasta IA Local)

### Flujo completo (cuando IA Local esté disponible)

```
[Botón BT / MediaSession] → Push-to-Talk
       ↓
[enumerateDevices] → Selección micrófono BT
       ↓
[MediaRecorder] → Audio WAV
       ↓
[POST /ai/voice/transcribe] → Whisper → Texto
       ↓
[POST /ai/voice/parse-intent] → LLM → JSON {intent, item, qty, almacen}
       ↓
[Confirmación en pantalla] → "¿Registrar 12 Concha Blanca?"
       ↓
[POST /warehouse/{id}/stock]
       ↓
[SpeechSynthesis] → TTS: "12 Conchas Blancas registradas" (auriculares BT)
```

### Intenciones NLU

| Intent | Ejemplo de voz | Acción |
|---|---|---|
| `REGISTRAR_ENTRADA` | "Agregar 12 Concha Blanca Exhibidor" | POST stock |
| `CREAR_TRASPASO` | "Mover 5 Cuernos de Bodega a Exhibidor" | POST traspaso |
| `CONSULTAR_STOCK` | "¿Cuántas Conchas hay en Exhibidor?" | GET stock |
| `REPORTAR_MERMA` | "Merma 3 Polvorones quemados" | POST merma |

### Estado actual (sin IA Local)
- Botón de micrófono visible pero muestra toast: "Módulo de IA Local pendiente de instalación".
- La UI está 100% preparada para activarse cuando el módulo IA Local sea desplegado.

---

## 9. Analítica

> [!NOTE]
> La analítica de almacenes (tendencias de merma, valorización, rotación PEPS) se visualizará en el módulo **"Estadísticas"** (renombrado desde "Estadísticas de Ventas"). No se implementa en este plan — solo se exponen los endpoints de datos que Estadísticas consumirá: `/movimientos` (historial) y `/stock` (estado actual).

---

## 10. Integración POS

Única modificación: 6 líneas en `create_ticket()` **ANTES** del `db.commit()`, dentro de `try/except` con `pass`. La venta y el evento se persisten en **una sola transacción atómica**.

---

## 11. Permisos

Agregar `"warehouse": "full"` al seed de perfiles ADMIN y MANAGER. Configurable desde el Gestor de Perfiles existente.

---

## 12. Verificación Final

1. Crear almacén CONGELADO → Azul Hielo + `sucursal_id`.
2. Entrada masiva de 5 items → Verificar `lote_entrada_id` compartido.
3. Esperar N días → Alerta amarilla/roja en tarjeta PEPS.
4. Merma → `tipo_movimiento=MERMA` + notas.
5. Update concurrente → Error 409 + refresh automático.
6. Venta POS → Evento ANTES del commit → Procesador descuenta → PROCESADO.
7. Venta con SKU inexistente → 3 intentos → FALLIDO + `error_log`.
8. Cortar WiFi → Registrar entrada offline → Reconectar → Sync automático.
9. IA apagada → Toast "IA no disponible" sin congelamiento.
10. POS operando sin afectación durante todas las pruebas.
