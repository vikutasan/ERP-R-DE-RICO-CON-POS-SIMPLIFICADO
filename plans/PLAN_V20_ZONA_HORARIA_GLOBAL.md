# PLAN V20 — ZONA HORARIA GLOBAL ("Store UTC, Display Local")

> **Objetivo:** que **todo el ERP** almacene en **UTC** y que el **selector de Zona
> Horaria de "Visión General"** sea la **única fuente de verdad** para mostrar la
> hora en **toda** la interfaz.
>
> **Estado:** 📋 **PLANIFICADO.** No implementado. Depende de V19 (Fase 19.4).
>
> **Autor:** Roo · **Fecha:** 2026-09-14 · **Revisión:** 2
>
> **Cambios de la Rev. 2:** se incorpora la **Sección 6.5 — Arreglo de zona horaria
> del POS IA**, tras auditar el módulo a fondo. Se documenta el **bug del `+6h`**
> ([`pos/service.py:579-580`](apps/api/modules/pos/service.py:579)) y se establece la
> regla del **commit atómico** para `pos`.

---

## 0. AUTOCRÍTICA PREVENTIVA — Supuestos verificados contra el código real

Antes de escribir una sola línea de este plan, verifiqué **cada** supuesto con
búsquedas reales en el repositorio. Esto es lo que encontré (y lo que me obligó a
corregir mi propio diseño inicial):

| # | Supuesto inicial | Realidad verificada | ¿Corregido? |
|---|---|---|---|
| 1 | "Hay un solo mecanismo de zona horaria" | **FALSO.** Hay **TRES**: `business_timezone`, `network_tz_offset_hours`, `heladeria_kds_urgency_config.tzOffsetHours` | ✅ Sí |
| 2 | "El selector controla todo el sistema" | **FALSO.** Solo controla `analytics`, `hr` y `grandeza`. Red y KDS lo ignoran | ✅ Sí |
| 3 | "`grandeza` guarda UTC" | **FALSO.** Guarda **hora local a propósito** ([`grandeza/service.py:15`](apps/api/modules/grandeza/service.py:15)) | ✅ Sí |
| 4 | "El frontend ya lee la zona del negocio" | **FALSO.** Nunca la lee. Usa la zona del navegador | ✅ Sí |
| 5 | "Son pocos los lugares que formatean fechas" | **FALSO.** Son **49** (46 en `.jsx` + 3 en `.js`) | ✅ Sí |
| 6 | "`hr` guarda UTC correctamente" | **CIERTO.** Usa `timezone=True, server_default=func.now()` (19 columnas) | — |
| 7 | "`warehouse`/`security` guardan UTC correctamente" | **CIERTO.** Usan `_utcnow()` | — |
| 8 | "`pos` guarda UTC" | **FALSO.** `pos/models.py:34` usa `datetime.now()` (hora local) | ✅ Sí |
| 9 | "El POS IA maneja zona horaria" | **FALSO.** No tiene **ninguna** lógica de timezone. Solo `setLastSaveTime(new Date())` ×3 | ✅ Sí |
| 10 | "El `+6h` de `pos/service.py` es un bug" | **MATIZ.** Hoy es un **parche funcional** que compensa el naive local. Se vuelve bug **solo si** se migra `created_at` a UTC sin quitarlo | ✅ Sí |

**Conclusión de la autocrítica:** este plan **NO es "activar" algo que ya existe**.
Es **corregir desviaciones reales** en 4 módulos backend + reescribir la capa de
presentación de fechas en 49 puntos del frontend. Cualquier plan que diga lo
contrario está mintiendo.

---

## 1. RESUMEN EJECUTIVO

### 1.1 El problema en una frase

Hoy el ERP tiene **dos convenciones de timestamp mezcladas** y **tres mecanismos de
zona horaria independientes**, lo que produce desfases de 6 horas en reportes
cruzados y hace que el selector de "Visión General" **mienta**: promete afectar
"TODO el ERP" pero solo afecta 3 de 5 mecanismos.

### 1.2 La solución en una frase

Unificar **todo** en UTC en la base de datos, exponer `business_timezone` al
frontend mediante un **contexto global**, y reemplazar los **49** formateos de fecha
sueltos por un **helper único** que respete la zona elegida.

### 1.3 El diagrama objetivo

```
┌──────────────────────────────────────────────────────────────┐
│  DB (PostgreSQL)                                             │
│  TODAS las columnas DateTime → UTC naive                     │
│  (TIMESTAMP WITHOUT TIME ZONE, siempre UTC)                  │
└──────────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────┐
│  API (FastAPI)                                               │
│  Serializa con iso_utc() → "2026-09-14T03:22:22Z"            │
│  NUNCA convierte a local para guardar                        │
│  Expone GET /api/v1/settings/timezone                        │
└──────────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────┐
│  Frontend (React)                                            │
│  TimezoneProvider lee business_timezone UNA VEZ              │
│  formatLocal(iso) aplica { timeZone: tz } al mostrar         │
│  El selector de Visión General = única fuente de verdad      │
└──────────────────────────────────────────────────────────────┘
```

### 1.4 Lo que el usuario obtendrá

- **Reportes que cuadran.** Ventas (UTC) y repartos (UTC) se comparan sin desfase.
- **El selector cumple su promesa.** Cambiar a "Tijuana" cambia la hora en TODO el ERP.
- **Sin bugs de horario de verano.** UTC no tiene horas inexistentes ni duplicadas.
- **Un solo lugar para formatear.** `formatLocal()` en vez de 49 `toLocaleString` sueltos.

---

## 2. PRINCIPIOS RECTORES

1. **Store UTC, Display Local.** La DB guarda UTC. La UI muestra local. Nunca al revés.
2. **Una sola fuente de verdad.** `business_timezone` decide la zona de TODO el ERP.
3. **La conversión vive en la capa de presentación.** Nunca en la de almacenamiento.
4. **Aditivo, nunca sustractivo.** No se borra ningún endpoint ni columna existente.
5. **El POS IA es intocable.** `RetailVisionPOS.jsx` no se modifica (Restricción A).
6. **Gestión de Productos es la única fuente de productos.** (Restricción B)
7. **Degradación elegante.** Si el endpoint de zona falla, el frontend usa `America/Mexico_City`.
8. **Verificación en cada fase.** pytest + vitest + smoke antes de cada commit.
9. **Sin migraciones destructivas.** Los datos existentes NO se reescriben (ver Sección 9).
10. **Documentar la deuda que no se paga.** Lo que no se haga, se registra explícitamente.

---

## 3. INVENTARIO VERIFICADO (la base del plan)

### 3.1 Backend — Convenciones de timestamp

**✅ Convención A (UTC correcto) — NO tocar:**

| Módulo | Mecanismo | Columnas |
|---|---|---|
| `warehouse` | `_utcnow()` ([`models.py:9`](apps/api/modules/warehouse/models.py:9)) | 4 |
| `security` | `_utcnow()` ([`models.py:8`](apps/api/modules/security/models.py:8)) | 1 |
| `hr` | `timezone=True, server_default=func.now()` | 19 |

**⚠️ Convención B (hora local naive) — MIGRAR a UTC:**

| Módulo | Ubicación | Notas |
|---|---|---|
| `network` | [`models.py:13`](apps/api/modules/network/models.py:13) | `created_at` |
| `cash` | [`models.py:44`](apps/api/modules/cash/models.py:44) + [`service.py:154`](apps/api/modules/cash/service.py:154) | `closed_at` |
| `orders` | [`models.py:52,53`](apps/api/modules/orders/models.py:52) + [`service.py:117`](apps/api/modules/orders/service.py:117) | `created_at`, `updated_at` |
| `pos` | [`models.py:34`](apps/api/modules/pos/models.py:34) | `created_at` |

**❌ Convención C (hora local DELIBERADA) — NO MIGRAR:**

| Módulo | Ubicación | Razón |
|---|---|---|
| `grandeza` | [`service.py:15`](apps/api/modules/grandeza/service.py:15) | Guarda local **a propósito** para fechas de negocio de reparto |

**⚠️ `datetime.now()` en lógica (no columnas) — revisar caso por caso:**

| Módulo | Ubicación | Decisión |
|---|---|---|
| `network/router.py` | `:50,52,83,85` | Migrar a `utcnow()` |
| `pos/occupancy.py` | `:18,55,65,116` | Migrar a `utcnow()` (TTL de candados) |
| `pos/service.py` | `:658,685,962,984` | Migrar a `utcnow()` (GC y TTL) |
| `pos/router.py` | `:135,255,402` | Migrar a `utcnow()` |
| `pos/pos_audit.py` | `:82` | Migrar a `utcnow()` |
| `heladeria/service.py` | `:274` | `last_updated` informativo — migrar a `iso_utc()` |

### 3.1.b 🔴 EL BUG DEL `+6h` — el hallazgo más importante de la Rev. 2

[`pos/service.py:573-584`](apps/api/modules/pos/service.py:573) — filtro de fecha de la Auditoría POS:

```python
if search_date:
    try:
        from datetime import datetime, timedelta
        # Los timestamps están en UTC. Hora local México es UTC-6.   ← COMENTARIO FALSO
        # Calculamos el inicio y el fin del día en UTC para que el rango abarque correctamente la noche.
        target_date = datetime.strptime(search_date, "%Y-%m-%d")
        start_utc = target_date + timedelta(hours=6)          # ← +6h
        end_utc   = target_date + timedelta(days=1, hours=6)  # ← +6h
        query = query.where(models.Ticket.created_at >= start_utc).where(models.Ticket.created_at < end_utc)
```

**El comentario MIENTE.** Dice *"Los timestamps están en UTC"*, pero
[`pos/models.py:34`](apps/api/modules/pos/models.py:34) los guarda en **hora local**.
El `+6h` **no** convierte UTC→local: **compensa** que `created_at` ya está en local.

**Aritmética real (hoy, con `created_at` en local):**

| Paso | Valor |
|---|---|
| Usuario pide | `search_date = "2026-09-14"` (día local) |
| `start_utc` | `2026-09-14 06:00:00` |
| `end_utc` | `2026-09-15 06:00:00` |
| Rango efectivo sobre `created_at` (local) | **06:00 del 14 → 06:00 del 15** |
| ❌ Consecuencia | Los tickets vendidos entre **00:00 y 06:00** aparecen en el día **anterior** |

**🔴 Si se migra `pos` a UTC sin quitar el `+6h`:**

| Paso | Valor |
|---|---|
| `start_utc` | `2026-09-14 06:00:00` UTC = `2026-09-14 00:00:00` local |
| `end_utc` | `2026-09-15 06:00:00` UTC = `2026-09-15 00:00:00` local |
| Rango efectivo | **00:00 del 14 → 00:00 del 15** ✅ **¡CORRECTO!** |

**Conclusión contraintuitiva y CRÍTICA:** el `+6h` **NO debe eliminarse** al migrar a
UTC — **debe CONSERVARSE**, porque el `+6h` es precisamente la conversión
"día local → rango UTC" que se necesita. Lo que **debe corregirse es el comentario**
(que hoy miente) y **generalizarse el offset** para que lea del selector en vez de
hardcodear `6`.

**El arreglo correcto (Sección 6.5):** reemplazar el `6` hardcodeado por el offset
real del negocio, calculado con `ZoneInfo` (soporta horario de verano), y corregir el
comentario. Ver la Sección 6.5 para el código exacto.

### 3.2 Backend — Los TRES mecanismos de zona horaria

| # | Mecanismo | Definición | Consumidores | ¿Sigue al selector? |
|---|---|---|---|---|
| 1 | `business_timezone` | Setting (default `America/Mexico_City`) | `analytics`, `hr`, `grandeza` vía [`core/timezone.py`](apps/api/core/timezone.py:21) | ✅ **SÍ** |
| 2 | `network_tz_offset_hours` | Setting (seed = `"6"`) | [`network/router.py:16`](apps/api/modules/network/router.py:16) | ❌ **NO** |
| 3 | `heladeria_kds_urgency_config.tzOffsetHours` | Setting (seed = `6`) | KDS Heladería | ❌ **NO** |

**Bug latente confirmado:** si el dueño cambia el selector a "Tijuana (UTC-8)",
el Monitor de Red y el KDS **siguen calculando con UTC-6**. Esto ya es un bug hoy.

### 3.3 Frontend — Los 49 puntos de formateo de fecha

**`.jsx` (46 resultados):**

| Módulo | Archivo | Líneas |
|---|---|---|
| `analytics` | [`ProductStatsView.jsx`](apps/analytics/ProductStatsView.jsx:41) | 41,42,230,487 |
| `analytics` | [`EstadisticasVentasUI.jsx`](apps/analytics/EstadisticasVentasUI.jsx:403) | 403,404,459,467-471,488,546,578,603,652,669 |
| `inventory` | [`WarehouseManagerUI.jsx`](apps/inventory/WarehouseManagerUI.jsx:2234) | 2234,3345 |
| `network` | [`NetworkMonitorUI.jsx`](apps/network/NetworkMonitorUI.jsx:105) | 105,128,172 |
| `production` | [`PedidosProduccionUI.jsx`](apps/production/PedidosProduccionUI.jsx:324) | 324,410 |
| `production` | [`PedidosPendientesUI.jsx`](apps/production/PedidosPendientesUI.jsx:158) | 158 |
| `production` | [`MaestroPanaderoUI.jsx`](apps/production/MaestroPanaderoUI.jsx:24) | 24 |
| `production` | [`GestorRepartosUI.jsx`](apps/production/GestorRepartosUI.jsx:196) | 196,261 |
| `production` | [`GestorPickupUI.jsx`](apps/production/GestorPickupUI.jsx:203) | 203,267 |
| `root` | [`AuditoriaControlUI.jsx`](apps/AuditoriaControlUI.jsx:168) | 168,209,236,385,424,441,468 |
| `root` | [`ExperimentCenterUI.jsx`](apps/ExperimentCenterUI.jsx:369) | 369,370 |
| `pos` | [`GrandezaDriverUI.jsx`](apps/pos/GrandezaDriverUI.jsx:997) | 997,1121 |
| `pos` | [`GrandezaDailyUI.jsx`](apps/pos/GrandezaDailyUI.jsx:700) | 700,728 |
| `pos` | [`OpenAccountsCorkboard.jsx`](apps/pos/OpenAccountsCorkboard.jsx:111) | 111 |
| `pos` | [`VisionTrainingUI.jsx`](apps/pos/VisionTrainingUI.jsx:27) | 27 |
| `pos` | [`CheckoutScreen.jsx`](apps/pos/components/CheckoutScreen.jsx:342) | 342 |
| `pos` | [`CorteTicketTemplate.jsx`](apps/pos/components/CorteTicketTemplate.jsx:8) | 8 |
| `pos` | [`POSHeader.jsx`](apps/pos/components/POSHeader.jsx:178) | 178 |
| `pos` | [`GestorDeCaja.jsx`](apps/pos/components/GestorDeCaja.jsx:409) | 409 |
| `pos` | [`SalesReceipt.jsx`](apps/pos/components/SalesReceipt.jsx:58) | 58 |
| `pos` | [`ProgramacionPedidoModal.jsx`](apps/pos/components/ProgramacionPedidoModal.jsx:347) | 347 |
| `pos` | [`TicketTemplate.jsx`](apps/pos/components/TicketTemplate.jsx:4) | 4 |

**`.js` (3 resultados):**

| Módulo | Archivo | Líneas |
|---|---|---|
| `analytics` | [`analyticsConfig.js`](apps/analytics/analyticsConfig.js:88) | 88,89 (números, NO fechas) |
| `pos` | [`ticketGenerator.js`](apps/pos/utils/ticketGenerator.js:11) | 11,12,154 |

**Clasificación crítica de los 49 puntos:**

| Categoría | Cantidad | Acción |
|---|---|---|
| **A. Fechas de negocio (deben respetar el selector)** | ~35 | Migrar a `formatLocal()` |
| **B. Números (NO son fechas)** | ~10 | **NO tocar** (ej. `$1,234.56`) |
| **C. Hora actual del dispositivo (no de la DB)** | ~4 | Revisar caso por caso |
| **D. Ya usan `timeZone` hardcodeado** | 4 | Migrar a la zona del contexto |

**Puntos D (ya hardcodean `America/Mexico_City`):**
- [`ExperimentCenterUI.jsx:368`](apps/ExperimentCenterUI.jsx:368) — el reloj de Visión General
- [`GrandezaDriverUI.jsx:997,1121`](apps/pos/GrandezaDriverUI.jsx:997) — ya hardcodeado
- [`GrandezaDailyUI.jsx`](apps/pos/GrandezaDailyUI.jsx:700) — usa `+ 'Z'` manual

---

## 4. FASE 20.0 — INFRAESTRUCTURA BACKEND (sin cambios de comportamiento)

**Objetivo:** crear las piezas compartidas **sin** cambiar nada funcional todavía.

### 4.1 `apps/api/core/timestamps.py` (NUEVO)

```python
"""timestamps.py - Fuente unica de verdad para timestamps UTC.

Regla de oro del proyecto: almacenar en UTC, mostrar en hora local.
Las columnas DateTime son TIMESTAMP WITHOUT TIME ZONE, por eso se
elimina tzinfo explicitamente (asyncpg rechaza datetimes con tzinfo).
"""
import datetime


def utcnow() -> datetime.datetime:
    """UTC naive. Reemplaza datetime.now() (hora local) y datetime.utcnow() (deprecado)."""
    return datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)
```

**Nota:** `warehouse/models.py` y `security/models.py` ya tienen su propio `_utcnow()`.
En esta fase **NO se tocan** (funcionan). En la Fase 20.5 se unifican opcionalmente.

### 4.2 `apps/api/core/timezone.py` — añadir helper de offset

```python
def tz_offset_hours(tz: ZoneInfo, at: datetime | None = None) -> float:
    """Offset actual de la zona respecto a UTC, en horas (ej. -6.0 para Mexico City).

    Usa el offset VIGENTE en 'at' (o ahora), por lo que respeta el horario de verano.
    """
    ref = at or datetime.now(tz)
    delta = ref.utcoffset()
    return delta.total_seconds() / 3600.0 if delta else 0.0
```

**Por qué:** permite que `network` y el KDS **deriven** su offset de
`business_timezone` en vez de tener un 6 fijo. Esto cierra el bug latente.

### 4.3 Endpoint `GET /api/v1/settings/timezone` (NUEVO, aditivo)

En [`settings/router.py`](apps/api/modules/settings/router.py:9), **antes** de la ruta
`/{key}` (para que no la capture):

```python
@router.get("/timezone")
async def get_timezone(db: AsyncSession = Depends(get_db)):
    """Expone la zona horaria del negocio para que el frontend formatee fechas."""
    from core.timezone import get_business_tz, tz_offset_hours
    tz = await get_business_tz(db)
    return {
        "timezone": str(tz),
        "offset_hours": tz_offset_hours(tz),
    }
```

**⚠️ ORDEN CRÍTICO:** debe ir **antes** de `@router.get("/{key}")`, o FastAPI
interpretará `"timezone"` como un `key` y devolverá 404.

### 4.4 Tests de la Fase 20.0

`apps/api/tests/test_timezone_global.py` (NUEVO):

```python
class TestUtcnow:
    def test_utcnow_es_naive(self): ...
    def test_utcnow_cerca_de_utc_real(self): ...

class TestTzOffsetHours:
    def test_mexico_city_es_menos_6(self): ...
    def test_respeta_horario_de_verano(self): ...

class TestEndpointTimezone:
    async def test_devuelve_timezone_y_offset(self, db): ...
    async def test_no_rompe_la_ruta_de_key(self, db): ...  # /settings/business_name sigue funcionando
```

**Verificación:** `docker exec rderico-api-dev python -m pytest -q` → 58 + ~6 = **64/64**.

---

## 5. FASE 20.1 — SINCRONIZAR LOS TRES MECANISMOS

**Objetivo:** que `network` y el KDS **dejen de tener un 6 fijo** y sigan al selector.

### 5.1 `network/router.py` — derivar el offset

**Antes** ([`network/router.py:16`](apps/api/modules/network/router.py:16)):
```python
async def _get_tz_offset(db: AsyncSession) -> int:
    try:
        from modules.settings.service import get_setting_by_key
        setting = await get_setting_by_key(db, "network_tz_offset_hours")
        if setting and setting.value is not None:
            return int(float(setting.value))
    except Exception:
        pass
    return DEFAULT_TZ_OFFSET_HOURS
```

**Después:**
```python
async def _get_tz_offset(db: AsyncSession) -> int:
    """Deriva el offset de business_timezone (fuente unica de verdad).

    Mantiene compatibilidad: si existe network_tz_offset_hours y es valido,
    se respeta como override explicito; si no, se deriva del selector.
    """
    try:
        from modules.settings.service import get_setting_by_key
        override = await get_setting_by_key(db, "network_tz_offset_hours")
        if override and override.value is not None:
            return int(float(override.value))
    except Exception:
        pass
    try:
        from core.timezone import get_business_tz, tz_offset_hours
        tz = await get_business_tz(db)
        return int(round(abs(tz_offset_hours(tz))))
    except Exception:
        pass
    return DEFAULT_TZ_OFFSET_HOURS
```

**Decisión de diseño:** se mantiene `network_tz_offset_hours` como **override
explícito** (compatibilidad con `test_network_tz.py`), pero si no existe, **deriva
del selector**. Así no se rompe ningún test y se cierra el bug.

### 5.2 KDS Heladería — derivar el offset

En [`heladeria/service.py`](apps/api/modules/heladeria/service.py:80) (`get_kds_urgency_config`),
si `tzOffsetHours` no está configurado explícitamente, derivarlo de `business_timezone`.

**⚠️ Cuidado:** el frontend [`kdsUrgency.js:53`](apps/heladeria/utils/kdsUrgency.js:53)
(`normalizeTzOffset`) ya tiene un fallback. Verificar que ambos coincidan.

### 5.3 Tests de la Fase 20.1

- `test_network_tz.py` debe seguir pasando **sin cambios** (compatibilidad).
- Nuevo test: si se borra `network_tz_offset_hours` y `business_timezone = "America/Tijuana"`, el offset es 8.

**Verificación:** pytest **64/64** + smoke del Monitor de Red.

---

## 6. FASE 20.2 — MIGRAR TIMESTAMPS A UTC (backend)

**Objetivo:** eliminar la Convención B. **NO tocar** `grandeza` (Convención C).

### 6.1 Tabla de migración

| Módulo | Archivo | Cambio | Riesgo |
|---|---|---|---|
| `network` | [`models.py:13`](apps/api/modules/network/models.py:13) | `default=utcnow` | 🟢 Bajo |
| `network` | [`router.py:50,52,83,85`](apps/api/modules/network/router.py:50) | `datetime.now()` → `utcnow()` | 🟡 Medio |
| `cash` | [`models.py:44`](apps/api/modules/cash/models.py:44) | `default=utcnow` | 🟡 Medio |
| `cash` | [`service.py:154`](apps/api/modules/cash/service.py:154) | `datetime.now()` → `utcnow()` | 🟡 Medio |
| `orders` | [`models.py:52,53`](apps/api/modules/orders/models.py:52) | `default=utcnow` | 🟡 Medio |
| `orders` | [`service.py:117`](apps/api/modules/orders/service.py:117) | `datetime.now()` → `utcnow()` | 🟡 Medio |
| `pos` | [`models.py:34`](apps/api/modules/pos/models.py:34) | `default=utcnow` | 🔴 **ALTO** |
| `pos` | [`occupancy.py:18,55,65,116`](apps/api/modules/pos/occupancy.py:18) | `datetime.now()` → `utcnow()` | 🔴 **ALTO** |
| `pos` | [`service.py:658,685,962,984`](apps/api/modules/pos/service.py:658) | `datetime.now()` → `utcnow()` | 🔴 **ALTO** |
| `pos` | [`router.py:135,255,402`](apps/api/modules/pos/router.py:135) | `datetime.now()` → `utcnow()` | 🔴 **ALTO** |
| `pos` | [`pos_audit.py:82`](apps/api/modules/pos/pos_audit.py:82) | `datetime.now()` → `utcnow()` | 🟢 Bajo (solo log) |
| `heladeria` | [`service.py:274`](apps/api/modules/heladeria/service.py:274) | `datetime.now().isoformat()` → `iso_utc(utcnow())` | 🟢 Bajo |

### 6.2 ⚠️ ADVERTENCIA CRÍTICA sobre `pos`

**`pos` es el módulo de mayor riesgo.** `pos/models.py:34` (`Ticket.created_at`) es
la columna que alimenta:
- El KDS (cálculo de urgencia)
- La auditoría
- Los cortes de caja
- El TTL de DRAFTs ([`service.py:658`](apps/api/modules/pos/service.py:658))

**Si se migra `pos` a UTC sin migrar el frontend en el mismo commit, el KDS
mostrará "6 horas de antigüedad" en tickets recién creados.**

**Regla:** la migración de `pos` (Fase 20.2) y el `formatLocal` del KDS
(Fase 20.3) deben ir **en el mismo commit** o en commits consecutivos sin deploy
intermedio.

### 6.3 ⚠️ Los datos históricos NO se reescriben

**Decisión explícita:** NO se hace migración de datos. Los registros existentes
quedan con su valor actual (hora local). Esto significa que:

- Los reportes que crucen **datos viejos** con **datos nuevos** tendrán un desfase
  de 6 horas **en la frontera** (el momento del deploy).
- **Mitigación:** documentar la fecha/hora exacta del deploy en el CHANGELOG.
- **Alternativa descartada:** reescribir datos históricos es **demasiado peligroso**
  (no se puede distinguir con certeza qué fila es UTC y cuál es local).

### 6.4 Tests de la Fase 20.2

- Test nuevo: `Ticket.created_at` recién creado está a menos de 5 segundos de `utcnow()`.
- Test nuevo: `NetworkIncident.created_at` idem.
- **Regresión:** todos los tests existentes deben pasar (58 base + los nuevos).

**Verificación:** pytest **~70/70** + smoke POS + smoke KDS.

---

## 6.5 FASE 20.2.b — ARREGLO DE ZONA HORARIA DEL POS IA (Rev. 2)

> **Origen:** auditoría del módulo POS IA solicitada por el dueño. Se encontraron
> **5 hallazgos**, de los cuales **3 son corregibles sin tocar la UI intocable**
> (Restricción A) porque viven en backend y utilitarios.

### 6.5.1 Los 5 hallazgos (verificados contra el código real)

| # | Hallazgo | Ubicación | Severidad | ¿Se corrige? |
|---|---|---|---|---|
| 1 | `created_at` guarda **local naive**, no UTC | [`pos/models.py:34`](apps/api/modules/pos/models.py:34) | 🔴 Alta | ✅ Sí (Fase 20.2) |
| 2 | `+6h/+6h` con **comentario falso** | [`pos/service.py:579-580`](apps/api/modules/pos/service.py:579) | 🔴 Alta | ✅ Sí (6.5.2) |
| 3 | `now - created_at` naive−naive (GC y TTL) | [`pos/service.py:658,685,962,984`](apps/api/modules/pos/service.py:962) | 🟡 Media | ✅ Sí (Fase 20.2) |
| 4 | `committed_at` impreso **sin parche `Z`** | [`ticketGenerator.js:154`](apps/pos/utils/ticketGenerator.js:154) | 🟡 Media | ✅ Sí (6.5.3) |
| 5 | Zona **hardcodeada** `America/Mexico_City` | [`GestorDeCaja.jsx:365`](apps/pos/components/GestorDeCaja.jsx:365) | 🟢 Baja | ✅ Sí (6.5.4) |

### 6.5.2 El arreglo del `+6h` — generalizar el offset (hallazgo #2)

**Estado actual** ([`pos/service.py:573-584`](apps/api/modules/pos/service.py:573)):

```python
# Los timestamps están en UTC. Hora local México es UTC-6.   ← FALSO
target_date = datetime.strptime(search_date, "%Y-%m-%d")
start_utc = target_date + timedelta(hours=6)          # ← 6 hardcodeado
end_utc   = target_date + timedelta(days=1, hours=6)  # ← 6 hardcodeado
```

**Arreglo propuesto** (tras la Fase 20.2, cuando `created_at` YA es UTC):

```python
from core.timezone import get_business_tz
from zoneinfo import ZoneInfo

if search_date:
    try:
        target_date = datetime.strptime(search_date, "%Y-%m-%d").date()
        tz = await get_business_tz(db)
        # El día LOCAL [00:00, 24:00) convertido a UTC.
        # ZoneInfo maneja el horario de verano automáticamente.
        start_local = datetime.combine(target_date, time.min, tzinfo=tz)
        end_local   = datetime.combine(target_date + timedelta(days=1), time.min, tzinfo=tz)
        start_utc = start_local.astimezone(ZoneInfo("UTC")).replace(tzinfo=None)
        end_utc   = end_local.astimezone(ZoneInfo("UTC")).replace(tzinfo=None)
        query = query.where(models.Ticket.created_at >= start_utc).where(models.Ticket.created_at < end_utc)
    except Exception as e:
        logging.error(f"Error parsing date {search_date}: {e}")
```

**Por qué es el arreglo correcto:**
1. **Elimina el `6` hardcodeado** → si el negocio cambia de zona, el filtro se ajusta solo.
2. **Soporta horario de verano** vía `ZoneInfo` (el `+6` fijo NO lo soporta).
3. **Corrige el comentario** que hoy miente.
4. **Mantiene la semántica** de "día local completo" que el `+6` lograba por accidente.

**⚠️ Regla de oro:** este cambio y la migración de [`pos/models.py:34`](apps/api/modules/pos/models.py:34)
van en el **MISMO COMMIT**. Si se migra la columna sin cambiar el filtro, la auditoría
se desfasa 6 horas. Si se cambia el filtro sin migrar la columna, también.

### 6.5.3 El arreglo del ticket impreso (hallazgo #4)

**Estado actual** ([`ticketGenerator.js:154`](apps/pos/utils/ticketGenerator.js:154)):

```javascript
new Date(ticketData.committed_at).toLocaleString('es-MX', {...})   // ← SIN parche 'Z'
```

**Problema:** si `committed_at` llega naive (`"2026-09-14T03:49:00"`), `new Date()`
lo interpreta como **hora local del navegador** → desfase de 6 horas en el ticket.

**Arreglo:** usar el helper compartido `formatLocal()` de la Fase 20.3, que normaliza
el ISO y aplica la zona del negocio:

```javascript
import { formatLocal } from '../../shared/timezone';
// ...
const committedStr = formatLocal(ticketData.committed_at, timeZone, {
    dateStyle: 'short', timeStyle: 'short'
});
```

**Nota:** [`ticketGenerator.js:7-12`](apps/pos/utils/ticketGenerator.js:7) (el parche
`+ 'Z'` del `created_at`) **se conserva** — es defensa redundante inofensiva y
garantiza compatibilidad si algún día el backend dejara de mandar la `Z`.

### 6.5.4 El arreglo de la zona hardcodeada (hallazgo #5)

**Estado actual** ([`GestorDeCaja.jsx:365-368`](apps/pos/components/GestorDeCaja.jsx:365)):

```javascript
const mexicoDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' })
    .format(new Date());
```

**Arreglo:** leer la zona del contexto global:

```javascript
const { timeZone } = useTimezone();
const mexicoDate = new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date());
```

**Nota:** `GestorDeCaja.jsx` **NO es la UI intocable** — la Restricción A aplica a
[`RetailVisionPOS.jsx`](apps/pos/RetailVisionPOS.jsx:29). `GestorDeCaja` es un
componente de caja modificable.

### 6.5.5 Lo que NO se toca del POS IA (Restricción A)

| Archivo | Razón |
|---|---|
| [`RetailVisionPOS.jsx`](apps/pos/RetailVisionPOS.jsx:29) | **UI intocable.** Sus 3 `setLastSaveTime(new Date())` son hora del dispositivo, no de la DB |
| [`useTicketActions.js:79`](apps/pos/hooks/useTicketActions.js:79) | `new Date().toISOString()` ya es UTC correcto (solo payload de impresión) |
| [`ticketGenerator.js:7-12`](apps/pos/utils/ticketGenerator.js:7) | El parche `+ 'Z'` es defensa redundante inofensiva |

### 6.5.6 Tests de la Fase 20.2.b

- Test nuevo: filtro de fecha con `search_date` cubre el **día local completo**
  (incluye un ticket creado a las 23:30 local).
- Test nuevo: `committed_at` naive se formatea con la zona del negocio, no del navegador.
- **Regresión:** pytest **~72/72** + smoke Auditoría POS (verificar que un ticket de
  las 02:00 aparece en el día correcto).

**Verificación:** pytest **~72/72** + smoke Auditoría POS + smoke ticket impreso.

---

## 7. FASE 20.3 — FRONTEND: CONTEXTO GLOBAL DE ZONA HORARIA

**Objetivo:** que el frontend **sepa** la zona del negocio y formatee con ella.

### 7.1 `apps/shared/timezone.js` (NUEVO — lógica pura, testeable)

```javascript
/**
 * timezone.js - Logica pura de formateo de fechas en la zona del negocio.
 * Sin React, sin DOM, sin fetch. 100% testeable con vitest.
 */
export const DEFAULT_TIMEZONE = 'America/Mexico_City';

export function normalizeTimezone(raw) {
    if (typeof raw !== 'string' || !raw.trim()) return DEFAULT_TIMEZONE;
    try {
        new Intl.DateTimeFormat('es-MX', { timeZone: raw });
        return raw;
    } catch {
        return DEFAULT_TIMEZONE;
    }
}

export function formatLocal(iso, timeZone = DEFAULT_TIMEZONE, options = {}) {
    if (!iso) return '---';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '---';
    return d.toLocaleString('es-MX', { timeZone, ...options });
}

export function formatLocalTime(iso, timeZone = DEFAULT_TIMEZONE, options = {}) {
    if (!iso) return '---';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '---';
    return d.toLocaleTimeString('es-MX', {
        timeZone, hour: '2-digit', minute: '2-digit', ...options,
    });
}

export function formatLocalDate(iso, timeZone = DEFAULT_TIMEZONE, options = {}) {
    if (!iso) return '---';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '---';
    return d.toLocaleDateString('es-MX', { timeZone, ...options });
}
```

### 7.2 `apps/shared/TimezoneContext.jsx` (NUEVO)

```javascript
import React, { createContext, useContext, useEffect, useState } from 'react';
import { CONFIG } from './config';
import { DEFAULT_TIMEZONE, normalizeTimezone } from './timezone';

const TimezoneContext = createContext({ timezone: DEFAULT_TIMEZONE, offsetHours: -6 });

export function TimezoneProvider({ children }) {
    const [tz, setTz] = useState({ timezone: DEFAULT_TIMEZONE, offsetHours: -6 });

    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const res = await fetch(`${CONFIG.API_BASE_URL}/settings/timezone`);
                if (!res.ok) return;
                const data = await res.json();
                if (alive) {
                    setTz({
                        timezone: normalizeTimezone(data.timezone),
                        offsetHours: Number(data.offset_hours) || -6,
                    });
                }
            } catch { /* degradacion elegante: se queda el default */ }
        })();
        return () => { alive = false; };
    }, []);

    return <TimezoneContext.Provider value={tz}>{children}</TimezoneContext.Provider>;
}

export function useTimezone() {
    return useContext(TimezoneContext);
}
```

### 7.3 Montar el provider en `main.jsx`

Envolver `<App />` con `<TimezoneProvider>`. **Aditivo**, no rompe nada.

### 7.4 Tests de la Fase 20.3

`apps/shared/timezone.test.js` (NUEVO — "Guardián del contrato"):

```javascript
describe('normalizeTimezone', () => {
    it('acepta una zona valida', ...);
    it('cae al default con basura', ...);
    it('cae al default con null', ...);
});
describe('formatLocal', () => {
    it('formatea en la zona indicada', ...);
    it('devuelve --- con null', ...);
    it('devuelve --- con fecha invalida', ...);
    it('respeta el horario de verano', ...);  // el test clave
});
```

**Verificación:** vitest **293 + ~12 = ~305/305**.

---

## 8. FASE 20.4 — MIGRAR LOS 49 PUNTOS DE FORMATEO

**Objetivo:** reemplazar cada `toLocaleString` de fecha por `formatLocal()`.

### 8.1 Orden de migración (de menor a mayor riesgo)

| Oleada | Módulos | Puntos | Riesgo |
|---|---|---|---|
| **1** | `analytics`, `inventory`, `network` | ~15 | 🟢 Bajo (solo lectura) |
| **2** | `production` (5 archivos) | ~10 | 🟡 Medio |
| **3** | `AuditoriaControlUI`, `ExperimentCenterUI` | ~9 | 🟡 Medio |
| **4** | `pos` (no-IA): `GrandezaDriver`, `GrandezaDaily`, `OpenAccounts`, `Checkout`, `Corte`, `POSHeader`, `GestorDeCaja`, `SalesReceipt`, `ProgramacionPedido`, `TicketTemplate`, `ticketGenerator` | ~15 | 🔴 **ALTO** |
| **5** | `pos` IA (`RetailVisionPOS.jsx`) | 0 | ⛔ **NO TOCAR** |

### 8.2 Patrón de migración (ejemplo real)

**Antes** ([`PedidosProduccionUI.jsx:324`](apps/production/PedidosProduccionUI.jsx:324)):
```jsx
{order.committed_at ? new Date(order.committed_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : '---'}
```

**Después:**
```jsx
{formatLocalTime(order.committed_at, timezone)}
```

### 8.3 ⚠️ Los puntos que NO se migran

| Punto | Razón |
|---|---|
| `analyticsConfig.js:88,89` | Son **números**, no fechas |
| `EstadisticasVentasUI.jsx:467-471,488,546,578,603,652,669` | Son **montos** (`$1,234`) |
| `AuditoriaControlUI.jsx:424,441,468` | Son **montos** |
| `VisionTrainingUI.jsx:27` | Es la hora **del dispositivo**, no de la DB |
| `SalesReceipt.jsx:58`, `TicketTemplate.jsx:4` | Es `new Date()` (ahora), no un dato de la DB |
| `MaestroPanaderoUI.jsx:24` | Es `new Date()` (ahora) |

**Regla:** si el valor viene de `new Date()` sin argumento, es la hora del
dispositivo y **no** debe convertirse (ya está en la zona correcta).

### 8.4 ⚠️ El caso especial de `AuditoriaControlUI.jsx`

Este archivo usa `new Date(t.created_at + 'Z')` — **añade la `Z` manualmente**.
Eso es un parche de la era pre-V18. Con `formatLocal()` la `Z` sobra (el ISO ya
viene con `Z` desde la Fase 18.1). **Hay que quitar el `+ 'Z'`** al migrar.

Mismo caso en [`GrandezaDailyUI.jsx:700,728`](apps/pos/GrandezaDailyUI.jsx:700).

### 8.5 Tests de la Fase 20.4

- **No hay tests unitarios** para componentes (no existen hoy).
- **Verificación:** smoke manual de cada pantalla migrada + vitest sin regresiones.

**Verificación:** vitest **~305/305** + build **~1433 módulos** + smoke de 4 oleadas.

---

## 9. FASE 20.5 — UNIFICACIÓN Y LIMPIEZA (opcional)

**Objetivo:** eliminar duplicación. **Solo si las fases anteriores están estables.**

1. `warehouse/models.py::_utcnow` → importar de `core.timestamps`.
2. `security/models.py::_utcnow` → importar de `core.timestamps`.
3. `pos/router.py::_iso_utc` → importar de `core.serialization`.
4. Eliminar `network_tz_offset_hours` del seed (ya no es necesario como override).
5. Eliminar `tzOffsetHours` del seed del KDS.

**⚠️ Riesgo:** tocar `warehouse`/`security` puede romper tests. Hacer **solo si
hay tiempo y los tests lo cubren**. Si no, **dejar la duplicación** (es inocua:
ambos `_utcnow` hacen exactamente lo mismo).

**Decisión recomendada:** **DIFERIR** la Fase 20.5. La duplicación de un helper de
3 líneas no justifica el riesgo. Se documenta como deuda técnica aceptada.

---

## 10. MATRIZ DE RIESGO

| Fase | Riesgo | Impacto si falla | Mitigación |
|---|---|---|---|
| 20.0 | 🟢 Bajo | Ninguno (solo añade) | Endpoint aditivo, tests propios |
| 20.1 | 🟡 Medio | Red/KDS con offset incorrecto | Mantener override + fallback |
| 20.2 | 🔴 **ALTO** | KDS muestra 6h de antigüedad | Migrar `pos` junto con 20.3 |
| **20.2.b** | 🔴 **ALTO** | **Auditoría POS desfasada 6h** | **Commit atómico con 20.2 (ver 6.5.2)** |
| 20.3 | 🟢 Bajo | Ninguno (solo añade contexto) | Degradación elegante |
| 20.4 | 🔴 **ALTO** | Fechas mal mostradas | Oleadas + smoke por pantalla |
| 20.5 | 🟡 Medio | Tests de warehouse/security | **DIFERIR** |

### 10.1 El riesgo #1: la frontera de datos

**El riesgo más grave de todo el plan** no es técnico, es de **datos**:

> Los registros creados **antes** del deploy tienen hora local.
> Los creados **después** tienen UTC.
> Un reporte que abarque ambos tendrá un salto de 6 horas.

**Mitigación obligatoria:**
1. Registrar en el CHANGELOG la fecha/hora exacta del deploy de la Fase 20.2.
2. Avisar al dueño: "los reportes que crucen el día del cambio tendrán un desfase".
3. **NO** intentar reescribir datos históricos (imposible distinguir con certeza).

### 10.2 El riesgo #2: el POS IA

`RetailVisionPOS.jsx` **no se toca**. Pero **consume** `Ticket.created_at` vía
`posService`. Si la Fase 20.2 migra `pos` a UTC y el POS IA muestra la hora sin
`formatLocal`, mostrará 6 horas de menos.

**Mitigación:** el POS IA **no muestra** `created_at` en pantalla (solo lo usa
internamente para TTL). Verificar en el smoke de la Fase 20.2.

### 10.3 El riesgo #3: el `+6h` de la Auditoría POS (Rev. 2)

**El riesgo más traicionero del plan**, porque es **contraintuitivo**:

> El `+6h` de [`pos/service.py:580`](apps/api/modules/pos/service.py:580) **parece**
> un bug que hay que borrar. **NO lo es.** Es el parche que hoy hace que la Auditoría
> funcione. Si se borra **antes** de migrar `created_at` a UTC, la auditoría se
> desfasa 6 horas. Si se migra `created_at` **sin** generalizar el `+6h`, también.

**Mitigación obligatoria:**
1. **Commit atómico:** [`pos/models.py:34`](apps/api/modules/pos/models.py:34) +
   [`pos/service.py:579-580`](apps/api/modules/pos/service.py:579) en el **mismo commit**.
2. **Test de frontera:** un ticket creado a las **23:30 local** debe aparecer en el
   día correcto al filtrar por `search_date`.
3. **Test de madrugada:** un ticket creado a las **02:00 local** debe aparecer en el
   día correcto (hoy aparece en el día anterior — bug existente).
4. **NO borrar el offset:** generalizarlo con `ZoneInfo` (Sección 6.5.2), nunca eliminarlo.

---

## 11. ORDEN DE EJECUCIÓN

```
20.0    Infraestructura backend (core/timestamps.py, endpoint /settings/timezone)
  ↓     pytest 64/64
20.1    Sincronizar los 3 mecanismos (network + KDS derivan del selector)
  ↓     pytest 64/64 + smoke Monitor de Red
20.3    Frontend: shared/timezone.js + TimezoneProvider  ← ANTES de 20.2
  ↓     vitest ~305/305
20.2    Migrar timestamps a UTC (network, cash, orders, pos)
20.2.b  Arreglar el +6h del POS IA (generalizar con ZoneInfo)  ← MISMO COMMIT que 20.2
  ↓     pytest ~72/72 + smoke POS + smoke KDS + smoke Auditoría POS
20.4    Migrar los 49 puntos de formateo (4 oleadas)
  ↓     vitest ~305/305 + build + smoke por pantalla
20.5    Unificación y limpieza → DIFERIDA
```

**⚠️ Cambio de orden respecto a V19:** la Fase 20.3 (frontend) va **ANTES** de la
20.2 (migración de datos). Razón: el frontend debe estar listo para formatear
correctamente **antes** de que los datos cambien, para que el KDS no muestre
6 horas de antigüedad ni por un segundo.

**⚠️ Regla del commit atómico (Rev. 2):** las Fases **20.2 y 20.2.b** son
**indivisibles**. Un solo commit que contenga:
1. [`pos/models.py:34`](apps/api/modules/pos/models.py:34) → `default=utcnow`
2. [`pos/service.py:579-580`](apps/api/modules/pos/service.py:579) → offset con `ZoneInfo`
3. [`pos/service.py:658,685,962,984`](apps/api/modules/pos/service.py:962) → `utcnow()`

Si se separan, la Auditoría POS queda desfasada 6 horas entre commits.

---

## 12. CHECKLIST DE VERIFICACIÓN

### Fase 20.0
- [ ] `apps/api/core/timestamps.py` creado con `utcnow()`
- [ ] `apps/api/core/timezone.py` con `tz_offset_hours()`
- [ ] `GET /api/v1/settings/timezone` responde `{timezone, offset_hours}`
- [ ] `GET /api/v1/settings/business_name` **sigue** funcionando (orden de rutas)
- [ ] `test_timezone_global.py` creado
- [ ] `docker exec rderico-api-dev python -m pytest -q` → **64/64**
- [ ] `docker restart rderico-api-dev` + `GET /api/v1/settings/` → 200

### Fase 20.1
- [ ] `network/router.py::_get_tz_offset` deriva del selector
- [ ] `test_network_tz.py` **sin cambios** sigue pasando
- [ ] KDS deriva `tzOffsetHours` del selector
- [ ] Smoke: Monitor de Red muestra fechas correctas

### Fase 20.3
- [ ] `apps/shared/timezone.js` creado
- [ ] `apps/shared/TimezoneContext.jsx` creado
- [ ] `main.jsx` envuelve con `<TimezoneProvider>`
- [ ] `apps/shared/timezone.test.js` creado
- [ ] `npx vitest run` → **~305/305**

### Fase 20.2
- [ ] `network`, `cash`, `orders`, `pos` migrados a `utcnow()`
- [ ] `grandeza` **NO** tocado
- [ ] `pos` migrado **en el mismo commit** que la oleada 4 de 20.4
- [ ] `docker exec rderico-api-dev python -m pytest -q` → **~70/70**
- [ ] Smoke POS: crear ticket, verificar hora correcta
- [ ] Smoke KDS: ticket nuevo muestra "0 min", no "360 min"

### Fase 20.2.b — Arreglo del POS IA (Rev. 2)
- [ ] [`pos/models.py:34`](apps/api/modules/pos/models.py:34) → `default=utcnow` **en el mismo commit** que 20.2
- [ ] [`pos/service.py:579-580`](apps/api/modules/pos/service.py:579) → offset con `ZoneInfo` (NO borrar el offset)
- [ ] Comentario falso *"Los timestamps están en UTC"* **corregido**
- [ ] [`pos/service.py:658,685,962,984`](apps/api/modules/pos/service.py:962) → `utcnow()`
- [ ] [`ticketGenerator.js:154`](apps/pos/utils/ticketGenerator.js:154) → `formatLocal()` (quitar `new Date()` sin parche)
- [ ] [`GestorDeCaja.jsx:365`](apps/pos/components/GestorDeCaja.jsx:365) → `useTimezone()` (quitar hardcode)
- [ ] [`RetailVisionPOS.jsx`](apps/pos/RetailVisionPOS.jsx:29) **NO tocado** (Restricción A)
- [ ] [`ticketGenerator.js:7-12`](apps/pos/utils/ticketGenerator.js:7) parche `+ 'Z'` **conservado**
- [ ] Test: ticket de las **23:30 local** aparece en el día correcto
- [ ] Test: ticket de las **02:00 local** aparece en el día correcto (bug existente corregido)
- [ ] `docker exec rderico-api-dev python -m pytest -q` → **~72/72**
- [ ] Smoke Auditoría POS: filtrar por fecha y verificar el conteo
- [ ] Smoke ticket impreso: `committed_at` con hora correcta

### Fase 20.4
- [ ] Oleada 1 (analytics, inventory, network) migrada + smoke
- [ ] Oleada 2 (production) migrada + smoke
- [ ] Oleada 3 (Auditoria, ExperimentCenter) migrada + smoke
- [ ] Oleada 4 (pos no-IA) migrada + smoke
- [ ] `+ 'Z'` eliminado de `AuditoriaControlUI` y `GrandezaDailyUI`
- [ ] Montos y números **NO** migrados
- [ ] `npx vitest run` → **~305/305**
- [ ] `npm run build` → **~1433 módulos**

### Cierre
- [ ] CHANGELOG con la fecha/hora del deploy de 20.2
- [ ] Documentación actualizada (DOCUMENTACION_VISTA_GENERAL.md)
- [ ] Árbol limpio + HEAD == origin/main

---

## 13. LO QUE **NO** SE HARÁ (y por qué)

| # | No se hará | Razón |
|---|---|---|
| 1 | Reescribir datos históricos | Imposible distinguir UTC de local con certeza |
| 2 | Tocar `RetailVisionPOS.jsx` | Restricción A (POS IA intocable) |
| 3 | Migrar `grandeza` a UTC | Guarda local **a propósito** para fechas de negocio |
| 4 | Convertir montos (`$1,234`) | No son fechas |
| 5 | Convertir `new Date()` sin argumento | Ya es la hora del dispositivo |
| 6 | Zona horaria por usuario | Una sola sucursal → selector global es correcto |
| 7 | Fase 20.5 (unificación) | Riesgo > beneficio (duplicación inocua) |
| 8 | Migrar `hr` | Ya usa `timezone=True` correctamente |
| 9 | Migrar `warehouse`/`security` | Ya usan `_utcnow()` correctamente |
| 10 | **Borrar el `+6h` de `pos/service.py`** | **Es el parche que hace funcionar la Auditoría. Se generaliza, no se borra** |
| 11 | Tocar [`useTicketActions.js:79`](apps/pos/hooks/useTicketActions.js:79) | `new Date().toISOString()` ya es UTC correcto |
| 12 | Quitar el parche `+ 'Z'` de [`ticketGenerator.js:7-12`](apps/pos/utils/ticketGenerator.js:7) | Defensa redundante inofensiva |

---

## 14. LECCIONES DE V18 Y V19 APLICADAS

1. **Verificar supuestos contra el código real.** La Sección 0 existe por esto:
   mi diseño inicial asumía 1 mecanismo de zona y encontré 3.
2. **Aditivo, nunca sustractivo.** El endpoint `/settings/timezone` se añade sin
   tocar los existentes.
3. **El orden de las rutas de FastAPI importa.** `/timezone` antes de `/{key}`.
4. **`write_to_file` puede truncarse.** Verificar siempre la integridad del archivo.
5. **La API no recarga Python.** `docker restart rderico-api-dev` tras cada cambio.
6. **Python no está en el PATH del host.** pytest vía `docker exec`.
7. **Documentar la deuda que no se paga.** La Fase 20.5 se difiere **explícitamente**.
8. **El POS IA es intocable.** Ni siquiera para "mejorar" el formateo de fechas.
9. **Un parche funcional no es un bug.** El `+6h` de `pos/service.py` parecía un bug;
   era el parche que sostenía la Auditoría. **Auditar antes de "arreglar".**
10. **Los cambios acoplados van en un commit.** `pos/models.py` + `pos/service.py`
    son indivisibles: separarlos introduce un desfase de 6 horas entre commits.

---

## 15. ESTIMACIÓN DE ESFUERZO

| Fase | Archivos | Complejidad | Sesiones |
|---|---|---|---|
| 20.0 | 3 nuevos + 1 edit | 🟢 Baja | 1 |
| 20.1 | 2 edits | 🟡 Media | 1 |
| 20.3 | 3 nuevos + 1 edit | 🟢 Baja | 1 |
| 20.2 | ~12 edits | 🔴 Alta | 2 |
| **20.2.b** | **~6 edits** | 🔴 **Alta** | **1** |
| 20.4 | ~22 edits | 🔴 Alta | 3 |
| 20.5 | — | ⏸️ Diferida | 0 |
| **Total** | **~50 archivos** | — | **~9 sesiones** |

**Comparación con V19:** V19 son ~15 archivos y ~3 sesiones. **V20 es 3× más
grande.** Por eso son planes separados.

---

## 16. RELACIÓN CON V19

| Aspecto | V19 (Transversal) | V20 (Zona Horaria Global) |
|---|---|---|
| **Objetivo** | Conectar `VITE_API_URL` + unificar timestamps | Selector como fuente de verdad de TODA la UI |
| **Alcance** | 15 archivos | ~44 archivos |
| **Dependencia** | Ninguna | **Requiere V19 Fase 19.4** |
| **Bloqueante** | Sección 16 (selector) | Ninguno propio |
| **Riesgo** | 🟡 Medio | 🔴 Alto |

**V19 prepara el terreno. V20 completa la visión.**

La Fase 19.4 de V19 migra `network`, `cash`, `orders` a UTC (sin tocar `grandeza`).
La Fase 20.2 de V20 **repite** esa migración para `pos` y añade el frontend.
**No hay conflicto:** si V19 ya migró `network`/`cash`/`orders`, la Fase 20.2 solo
hace `pos` y verifica los demás.

---

## 17. CONCLUSIÓN

Este plan convierte al ERP en un sistema que sigue la **mejor práctica de la
industria** ("Store UTC, Display Local") de forma **completa y verificable**:

- **Backend:** todo en UTC, con `grandeza` como excepción documentada.
- **API:** serializa en UTC con `iso_utc()`, expone la zona del negocio.
- **Frontend:** un solo helper (`formatLocal`) y un solo contexto (`TimezoneProvider`).
- **Selector:** deja de mentir — ahora **sí** controla todo el ERP.
- **POS IA:** alineado sin tocar su UI — se corrigen sus 5 desviaciones en backend
  y utilitarios (Sección 6.5), respetando la Restricción A.

**El resultado:** reportes que cuadran, cero bugs de horario de verano, una sola
fuente de verdad para la hora en todo el sistema, y un POS IA que —sin cambiar una
sola línea de su interfaz— deja de depender de un parche de `+6h` para funcionar.

**FIN DEL PLAN V20**