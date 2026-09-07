# Plan de Implementación v6: Gestión de Almacenes — ERP R de Rico

> [!NOTE]
> Versión 6 — Reformulado tras auditoría del código existente.
> Modo: **INCREMENTAL** (no reescritura). El 60-70% del backend ya existe.
> Última actualización: 2026-09-07

---

## 0. Resultado de la Auditoría

| Componente | Ya existe | Falta |
|---|---|---|
| **models.py** (5 tablas: almacenes, stock_almacen, movimientos_inventario, warehouse_events, insumos) | ✅ 100% | Nada |
| **schemas.py** (8 enums + todos los schemas Pydantic) | ✅ 100% | Nada |
| **service.py** (WarehouseService class) | 🟡 60% | Entrada masiva, merma, bloqueo optimista real, outbox processor |
| **router.py** (endpoints REST) | 🟡 60% | 6 endpoints faltantes |
| **5 tablas en BD PostgreSQL** | ✅ 5/5 creadas | 0 datos (vacías, listas para seed) |
| **WarehouseManagerUI.jsx** (111KB) | ✅ Existe | Evaluar cobertura vs plan |
| **WarehouseHubUI.jsx** (10KB) | ✅ Existe | Evaluar |
| **Outbox en pos/service.py** | ❌ No existe | 6 líneas por agregar |
| **Outbox processor** | ❌ No existe | Background task por crear |
| **offlineQueue.js** | ❌ No existe | Por crear |
| **sw.js + manifest.json** | ❌ No existe | Por crear |
| **ai_gateway/** | ❌ No existe | Stubs por crear |

---

## 0.1 Decisiones Técnicas

| Tema | Decisión | Razón |
|---|---|---|
| **Modo** | **INCREMENTAL** | No tocar lo que ya funciona. Solo agregar lo faltante |
| **PKs** | **Mantener String** (`alm_uuid8`, `stk_uuid8`, `mov_uuid8`) | Ya existe en BD y en 111KB de frontend. Cambiar sería destructivo |
| **Integración Heladería** | El outbox captura **todos** los tickets PAID (panadería + heladería). El `items_json` tiene SKU+qty genérico | Sin cambio en modelo |
| **Almacenes Heladería** | Seed de almacenes específicos: `Cámara Helados` (CONGELADO), `Exhibidor Helados` (EXHIBICION_VENTA) | Nuevos registros, no nuevos modelos |
| **Outbox Processor** | `asyncio.create_task()` en startup de FastAPI, polling cada 30s | Mismo proceso, sin workers externos |

---

## 1. Fases de Ejecución (Subdivididas)

| Sub-fase | Contenido | Riesgo | Dependencia |
|---|---|---|---|
| **1A** | Completar service.py (entrada masiva, merma, bloqueo optimista, historial) | 🟡 Medio | Ninguna |
| **1B** | Completar router.py (6 endpoints faltantes) | 🟢 Bajo | 1A |
| **1C** | Outbox POS: 6 líneas en pos/service.py (try/except pass) | 🔴 **Alto** | 1B |
| **1D** | Outbox Processor (background task cada 30s) | 🟡 Medio | 1C |
| **1E** | Seed de almacenes (panadería + heladería) + insumos | 🟢 Bajo | 1B |
| **1F** | Evaluar + completar frontend UI (111KB existente) + offlineQueue | 🟡 Medio | 1B |
| **1G** | PWA Offline (sw.js + manifest) + AI Gateway stubs | 🟢 Bajo | 1F |
| **2** | Escáner IA (visión de charolas vía /api/v1/pos/vision/predict) | 🟡 Medio | 1G |
| **3** | AI Gateway real (Whisper + LLM local) — cuando IA Local esté instalado | 🔴 Alto | Módulo IA Local |

> [!IMPORTANT]
> La **Fase 3** depende de la instalación futura de Whisper y LLM local en el servidor (módulo "IA Local"). El AI Gateway se creará como stub con fallback graceful para que la UI esté preparada pero funcione en modo manual hasta que la infraestructura de IA esté lista.

---

## 2. Modelos de Datos (YA EXISTEN — NO MODIFICAR)

### 2.1 Enums (en schemas.py)

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

### 2.2 Tablas existentes (5 tablas en BD, 0 datos)

| Tabla | PK | Campos clave |
|---|---|---|
| `almacenes` | `String alm_uuid8` | nombre, zona_termica, proposito, sucursal_id, foto_url, planograma_url, pautas_acomodo (JSON) |
| `stock_almacen` | `String stk_uuid8` | FK almacen_id, item_id (SKU), item_type, cantidad_actual, stock_minimo, stock_maximo, fecha_ingreso, dias_anaquel_alerta, **version** (bloqueo optimista) |
| `movimientos_inventario` | `String mov_uuid8` | almacen_origen_id, almacen_destino_id, item_id, tipo_movimiento, metodo_captura, usuario_id, notas, lote_entrada_id |
| `warehouse_events` | `Integer SERIAL` | ticket_id (UNIQUE), items_json (JSON), estado, intentos, error_log |
| `insumos` | `String ins_uuid8` | nombre, unidad_base, unidad_compra, factor_conversion, categoria_insumo |

**Bloqueo optimista:** Cada UPDATE incluye `WHERE version = {expected}` y hace `version = version + 1`. Si 0 filas afectadas → error `409 Conflict` → el frontend refresca y reintenta.

---

## 3. Modelo de Unidades (Simplificado para Panadería + Heladería)

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

┌──────────────────────┐                                    ┌──────────────────────┐
│  CÁMARA HELADOS      │                                    │  EXHIBIDOR HELADOS   │
│  (CONGELADO/ALMAC.)  │───────────────────────────────────▶│  (CONGELADO/EXHIB.)  │
│                      │                                    │                      │
│  ENTRA: Helado PZA   │         Traspaso directo           │  SALE: Helado PZA    │
│  (por producción)    │                                    │    (vía POS/Evento)  │
└──────────────────────┘                                    └──────────────────────┘
```

> [!TIP]
> **No hay conversión de unidades dentro del módulo de almacenes.** Cada almacén opera en su unidad nativa. La conversión KG → PZA ocurre en el módulo de Producción (recetas).

---

## 4. Flujo de Entrada Masiva

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

## 5. Integración POS → Warehouse (Outbox Pattern)

> [!IMPORTANT]
> **Fix crítico vs v4:** El INSERT del evento se hace **ANTES** de `await db.commit()`, dentro de la misma transacción que la venta. Si la transacción falla, tanto la venta como el evento se revierten juntos.

```python
# EN pos/service.py → create_ticket() — ANTES de db.commit()
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

Esto aplica tanto a ventas de **PANADERÍA** como de **HELADERÍA** (ambas pasan por `create_ticket()`).

---

## 6. Outbox Processor (Background Task)

```python
# Pseudo-código del procesador (en warehouse/service.py)
async def process_warehouse_events():
    """Polling cada 30s. Procesa eventos PENDIENTE."""
    while True:
        async with AsyncSessionLocal() as db:
            eventos = await db.execute(
                select(WarehouseEvent)
                .where(WarehouseEvent.estado == "PENDIENTE")
                .order_by(WarehouseEvent.created_at)
                .limit(50)
            )
            for evento in eventos.scalars():
                try:
                    items = json.loads(evento.items_json)
                    for item in items:
                        # Buscar almacén EXHIBICION_VENTA que tenga el SKU
                        # Descontar stock con bloqueo optimista
                        pass
                    evento.estado = "PROCESADO"
                except Exception as e:
                    evento.intentos += 1
                    if evento.intentos >= 3:
                        evento.estado = "FALLIDO"
                        evento.error_log = str(e)
            await db.commit()
        await asyncio.sleep(30)
```

Registrado en `main.py`:
```python
@app.on_event("startup")
async def startup():
    asyncio.create_task(process_warehouse_events())
```

---

## 7. PWA Offline (Service Worker + IndexedDB)

### Capacidades offline

| Funcionalidad | Offline | Sync al reconectar |
|---|---|---|
| Ver almacenes y stock (caché) | ✅ | Auto-refresh |
| Registrar entrada de stock | ✅ (cola local) | Auto-sync |
| Registrar merma | ✅ (cola local) | Auto-sync |
| Crear almacén | ❌ (requiere servidor) | — |
| Escáner IA | ❌ (requiere servidor) | — |

---

## 8. Endpoints API Completos

### Warehouse (`/api/v1/warehouse`)

| Método | Ruta | Estado | Descripción |
|---|---|---|---|
| `GET` | `/` | ✅ Existe | Listar almacenes |
| `POST` | `/` | ✅ Existe | Crear almacén |
| `PUT` | `/{id}` | ✅ Existe | Actualizar almacén |
| `DELETE` | `/{id}` | ✅ Existe | Eliminar (Integridad Imperial) |
| `GET` | `/{id}/stock` | ✅ Existe | Stock con info enriquecida |
| `POST` | `/{id}/stock` | ✅ Existe | Registrar entrada individual |
| `PUT` | `/{id}/stock/{stock_id}` | ❌ **FALTA** | Actualizar (bloqueo optimista) |
| `POST` | `/{id}/entrada-masiva` | ❌ **FALTA** | Entrada en lote (planilla) |
| `POST` | `/traspasos` | ✅ Existe | Mover stock entre almacenes |
| `POST` | `/mermas` | ❌ **FALTA** | Registrar merma auditable |
| `POST` | `/upload-image` | ✅ Existe | Fotos (almacén/planograma) |
| `GET` | `/movimientos` | ❌ **FALTA** | Historial auditable |
| `GET` | `/eventos/pendientes` | ❌ **FALTA** | Outbox pendientes |
| `GET` | `/eventos/fallidos` | ❌ **FALTA** | Dead-Letter Queue |
| `GET` | `/insumos` | ✅ Existe | Listar insumos (stub) |
| `POST` | `/insumos` | ✅ Existe | Crear insumo |

### AI Gateway (`/api/v1/ai`) — Fase 3 (stub hasta IA Local)

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/vision/detect` | Proxy visión con fallback |
| `POST` | `/voice/transcribe` | Proxy Whisper con fallback |
| `POST` | `/voice/parse-intent` | NLU texto → intención JSON |

---

## 9. Frontend: UI/UX (Evaluar 111KB existente)

### 9.1 Colores Semánticos

| Zona | Fondo | Acento | Borde |
|---|---|---|---|
| SECO | `#2D3748` | `#A0AEC0` | `#4A5568` |
| REFRIGERADO | `#EBF8FF` | `#3182CE` | `#BEE3F8` |
| CONGELADO | `#1A365D` | `#63B3ED` | `#2A4365` |

### 9.2 Touch-First
- Áreas de toque: mínimo **48×48px**.
- Botones de acción: altura **56px** con padding generoso.
- Swipe en tarjetas de stock para acciones rápidas.

---

## 10. Protocolo de Seguridad (por sub-fase)

1. ✅ **Backup BD** antes de la primera modificación
2. ✅ **Commit + push a GitHub** al final de cada sub-fase
3. ✅ **Verificar POS panadería + heladería** después de cada cambio
4. ✅ **try/except pass** en toda integración con POS
5. ✅ **React.lazy()** si se agrega nuevo módulo al ExperimentCenter

---

## 11. Verificación Final

1. Crear almacén CONGELADO → Azul Hielo + `sucursal_id`.
2. Entrada masiva de 5 items → Verificar `lote_entrada_id` compartido.
3. Esperar N días → Alerta amarilla/roja en tarjeta PEPS.
4. Merma → `tipo_movimiento=MERMA` + notas.
5. Update concurrente → Error 409 + refresh automático.
6. Venta POS panadería → Evento ANTES del commit → Procesador descuenta → PROCESADO.
7. Venta POS heladería → Mismo flujo → PROCESADO.
8. Venta con SKU inexistente → 3 intentos → FALLIDO + `error_log`.
9. Cortar WiFi → Registrar entrada offline → Reconectar → Sync automático.
10. IA apagada → Toast "IA no disponible" sin congelamiento.
11. POS panadería + heladería operando sin afectación durante todas las pruebas.

---

## INSTRUCCIONES PARA REANUDAR EN NUEVA SESIÓN

Si se cortó la sesión, pega este mensaje al iniciar una nueva conversación:

---
Vamos a implementar el módulo de Almacenes del ERP R de Rico.
El plan está en: https://github.com/vikutasan/ERP-R-DE-RICO-CON-POS-SIMPLIFICADO/blob/main/ESPECIFICACIONES%20DEL%20PROYECTO/PLAN_IMPLEMENTACION_ALMACENES_V5.md
El código fuente está en: C:\Users\servidor1\.gemini\antigravity\scratch\ERP-R-DE-RICO
MODO: INCREMENTAL. El backend ya tiene 60-70% implementado. Solo agregar lo faltante.
Empieza por la sub-fase marcada como pendiente.
---
