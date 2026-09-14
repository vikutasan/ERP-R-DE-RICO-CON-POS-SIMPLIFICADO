# HOJA DE RUTA — IMPLEMENTACIÓN V19 + V20

> **Objetivo:** implementar los planes V19 (Transversal) y V20 (Zona Horaria Global)
> de forma **exitosa, verificable y sin romper la operación**.
>
> **Estado:** 📋 **LISTA PARA EJECUTAR.** Ningún bloque iniciado.
>
> **Autor:** Roo · **Fecha:** 2026-09-14 · **Revisión:** 3
>
> **Cambios de la Rev. 2 (alineada con el plan V20 Rev. 4):**
> 1. **`grandeza` SÍ se migra** (Fase 20.2.d) — ya no es excepción. Solo sus
>    `Column(Date)` (`journey_date`, `route_date`) quedan locales.
> 2. **Nuevo Bloque 9.b — acoplamiento `analytics` ↔ `pos`** (Fase 20.2.c):
>    `analytics` filtra `Ticket.created_at` con fronteras naive; va en el MISMO
>    commit que `pos`.
> 3. **Nuevo Bloque 9.a — arreglo del `+6h` del POS IA** (Fase 20.2.b):
>    se generaliza con `ZoneInfo`, **no se borra**.
> 4. **Nuevo Bloque 9.c — migrar `grandeza`** (Fase 20.2.d), commit propio tras 20.3.
> 5. Total: **~58 archivos** / **~11 sesiones** (antes ~53 / ~10).
>
> **Cambios de la Rev. 3 (alineada con el plan V20 Rev. 5):**
> 1. **Nuevo Bloque 9.d — corrección de los 3 bugs cerrados** (Sección 6.8 del
>    plan): consolida en un solo lugar los tres arreglos que ya estaban dispersos
>    en 9.a/9.b/9.c, con su **orden de ejecución obligatorio** y su **criterio de
>    aceptación conjunto**.
> 2. **Regla de oro #9:** los 3 bugs se corrigen en el **mismo commit atómico**
>    que `pos` (20.2 + 20.2.b + 20.2.c); `grandeza` (20.2.d) va en su commit propio.
> 3. **Riesgo #8:** si se corrige uno solo de los 3 bugs, el ERP queda
>    **inconsistente** (POS en UTC, reportes en local, o viceversa).
> 4. Total: **~58 archivos** / **~11 sesiones** (sin cambio; 9.d no añade archivos,
>    solo consolida y ordena).

---

## 0. ESTADO VERIFICADO AL INICIO (línea base)

Verificado con comandos reales antes de escribir esta hoja de ruta:

| Elemento | Estado | Comando de verificación |
|---|---|---|
| `rderico-api-dev` | ✅ Up 2h | `docker ps` |
| `rderico-db-dev` | ✅ Up 24h | `docker ps` |
| `rderico-pos-dev` | ✅ Up 39h | `docker ps` |
| pytest | ✅ **58/58** | `docker exec rderico-api-dev python -m pytest -q` |
| vitest | ✅ **293/293** (8 archivos) | `npx vitest run` |
| Árbol git | ✅ Limpio | `git status --short` |
| HEAD | ✅ `22cf546` == origin/main | `git log origin/main..HEAD` |

**Regla:** si cualquiera de estos valores cambia antes de empezar, **detenerse y
re-verificar** antes de tocar código.

---

## 1. POR QUÉ EN SECUENCIA Y NO EN PARALELO

**V19 y V20 tocan los mismos archivos.** Hacerlos en paralelo garantiza conflictos.

| Archivo | V19 | V20 |
|---|---|---|
| `apps/api/modules/network/models.py` | Fase 19.4 | Fase 20.2 |
| `apps/api/modules/cash/models.py` | Fase 19.4 | Fase 20.2 |
| `apps/api/modules/orders/models.py` | Fase 19.4 | Fase 20.2 |
| `apps/shared/config.js` | Fase 19.1 (crea) | Fase 20.3 (importa) |
| `main.jsx` | Fase 19.1 | Fase 20.3 |

**Además, V20 DEPENDE de V19:**
- V20 Fase 20.3 importa `CONFIG` de `apps/shared/config.js` → lo crea V19 Fase 19.1.
- V20 Fase 20.2 migra `network`/`cash`/`orders` → ya lo hizo V19 Fase 19.4.
- El propio plan V20 (Sección 16) dice: *"Requiere V19 Fase 19.4"*.

**Conclusión: V19 completo primero. V20 después.**

---

## 2. LOS 8 BLOQUES DE EJECUCIÓN

Cada bloque = **1 commit verificado**. No se avanza sin pytest + vitest en verde.

```
┌─────────────────────────────────────────────────────────────────┐
│  V19 — TRANSVERSAL (riesgo bajo/medio)                          │
├─────────────────────────────────────────────────────────────────┤
│  BLOQUE 1  Fase 19.0 + 19.1  Infraestructura frontend   🟢      │
│  BLOQUE 2  Fase 19.2         Migrar no-POS (15 archivos) 🟡     │
│  BLOQUE 3  Fase 19.3         Migrar pos no-IA (4 archivos) 🟡   │
│  BLOQUE 4  Fase 19.4         Timestamps UTC (3 módulos)  🟡     │
│  BLOQUE 5  Fase 19.6         Documentación y cierre V19  🟢     │
├─────────────────────────────────────────────────────────────────┤
│  V20 — ZONA HORARIA GLOBAL (riesgo alto)                        │
├─────────────────────────────────────────────────────────────────┤
│  BLOQUE 6  Fase 20.0         Infraestructura backend     🟢     │
│  BLOQUE 7  Fase 20.1         Sincronizar 3 mecanismos    🟡     │
│  BLOQUE 8  Fase 20.3         TimezoneProvider frontend   🟢     │
│  BLOQUE 9  Fase 20.2 + 20.4  Migración datos + formateo  🔴     │
│    ├ 9.a   Fase 20.2.b       Arreglo +6h del POS IA      🔴     │
│    ├ 9.b   Fase 20.2.c       Acoplamiento analytics↔pos  🔴     │
│    └ 9.c   Fase 20.2.d       Migrar grandeza a UTC       🟡     │
│  BLOQUE 10 Fase 20.5         Unificación → DIFERIDA      ⏸️     │
└─────────────────────────────────────────────────────────────────┘
```

**Nota:** la Fase 19.5 (POS IA) del plan V19 se **omite** — el POS IA es intocable
(Restricción A). Se documenta como "no aplicable".

---

## 3. DETALLE DE CADA BLOQUE

### BLOQUE 1 — V19 Fase 19.0 + 19.1 (infraestructura frontend) 🟢

**Riesgo:** Cero. Solo crea archivos nuevos.

**Acciones:**
1. Crear/actualizar `.env` con `VITE_API_URL=http://192.168.1.117:5001`
2. Crear `apps/shared/config.js`:
   ```javascript
   const ENV_URL = import.meta.env?.VITE_API_URL;
   const fallbackUrl = () => {
       if (typeof window === 'undefined') return 'http://localhost:5001/api/v1';
       return `http://${window.location.hostname}:5001/api/v1`;
   };
   export const CONFIG = {
       API_BASE_URL: ENV_URL ? `${ENV_URL}/api/v1` : fallbackUrl(),
       ITEMS_PER_PAGE: 12,
       TASA_IVA_MEXICO: 0.16
   };
   ```
3. Verificar que `docker-compose.yml:47` ya pasa `VITE_API_URL` (ya está).

**Verificación:**
- [ ] `npm run build` compila sin errores
- [ ] `npx vitest run` → 293/293 (sin cambios)
- [ ] `docker restart rderico-pos-dev` + cargar la app en el navegador

**Commit:** `feat(v19): infraestructura VITE_API_URL + apps/shared/config.js`

---

### BLOQUE 2 — V19 Fase 19.2 (migrar no-POS, 15 archivos) 🟡

**Riesgo:** Medio. Muchos archivos, pero todos de solo lectura.

**Archivos (15):**

| Módulo | Archivo | Líneas |
|---|---|---|
| `production` | `ProductionEquipmentUI.jsx` | 7, 212 |
| `production` | `GestorPickupUI.jsx` | 7 |
| `production` | `PedidosProduccionUI.jsx` | 22 |
| `production` | `GlobalAgentSettingsUI.jsx` | 21 |
| `production` | `PedidosPendientesUI.jsx` | 4 |
| `production` | `ProcesoProduccionMasaUI.jsx` | 7 |
| `production` | `DoughManagerUI.jsx` | 83, 90-94 |
| `production` | `GestorRepartosUI.jsx` | 7 |
| `inventory` | `ProductCatalogUI.jsx` | 48, 54-58 |
| `auth` | `PerfilesAccessSuite.jsx` | 3 |
| `settings` | `SystemSettingsUI.jsx` | 3 |
| `pos` | `config.js` | 1 |
| `pos` | `posConstants.js` | 60, 79 |
| `pos` | `ProgramacionPedidoModal.jsx` | 4 |
| `pos` | `GrandezaDriverUI.jsx` | 726 |

**⛔ EXCEPCIÓN CRÍTICA — NO TOCAR:**
- `apps/pos/components/TerminalSelector.jsx:63` — usa `window.location.hostname`
  para construir la **URL de la app** (`/?terminal=X`), NO la URL de la API.
  Migrarlo **rompería** la selección de terminales.

**Patrón de migración:**
```javascript
// ANTES
const API = `http://${window.location.hostname}:5001/api/v1`;
// DESPUÉS
import { CONFIG } from '@/shared/config';
const API = CONFIG.API_BASE_URL;
```

**Verificación:**
- [ ] `npm run build` compila
- [ ] `npx vitest run` → 293/293
- [ ] Smoke: abrir cada módulo migrado y verificar que carga datos
- [ ] **Smoke crítico:** `TerminalSelector` sigue funcionando (no se tocó)

**Commit:** `refactor(v19): migrar window.location.hostname a CONFIG.API_BASE_URL`

---

### BLOQUE 3 — V19 Fase 19.3 (migrar pos no-IA, 4 archivos) 🟡

**Riesgo:** Medio. Es `pos`, pero **no** el POS IA.

**Archivos:** los 4 de `pos` listados en el Bloque 2 (ya migrados ahí si se
hace junto). **Recomendación:** fusionar Bloques 2 y 3 en un solo commit si el
smoke es limpio, para no duplicar verificación.

**Verificación:** igual que Bloque 2 + smoke del POS de Panadería.

**Commit:** (fusionado con Bloque 2) o `refactor(v19): migrar pos no-IA a CONFIG`

---

### BLOQUE 4 — V19 Fase 19.4 (timestamps UTC: network, cash, orders) 🟡

**Riesgo:** Medio. Cambia **escritura** de datos.

**Acciones:**
1. Crear `apps/api/core/timestamps.py` con `utcnow()`
2. Migrar `network/models.py:13` → `default=utcnow`
3. Migrar `cash/models.py:44` + `cash/service.py:154` → `utcnow()`
4. Migrar `orders/models.py:52,53` + `orders/service.py:117` → `utcnow()`

**⛔ NO TOCAR en este bloque:**
- `grandeza/models.py` y `grandeza/service.py` — **se migra en V20 Bloque 9.c**
  (Rev. 2: ya NO es excepción permanente; solo sus `Column(Date)` quedan locales)
- `pos/models.py` — se migra en V20 Bloque 9 (junto con el frontend)

**Verificación:**
- [ ] `docker restart rderico-api-dev`
- [ ] `docker exec rderico-api-dev python -m pytest -q` → 58/58
- [ ] `GET /api/v1/settings/` → 200 (main.py no se tocó)
- [ ] Smoke: crear un incidente de red, verificar que la fecha es correcta

**Commit:** `fix(v19): migrar network/cash/orders a UTC (deuda 2.2)`

---

### BLOQUE 5 — V19 Fase 19.6 (documentación y cierre) 🟢

**Acciones:**
1. Actualizar `ESPECIFICACIONES DEL PROYECTO/DOCUMENTACION_VISTA_GENERAL.md`
2. Registrar en el CHANGELOG que `grandeza` queda **pendiente** para V20 Bloque 9.c
   (Rev. 2: ya NO se documenta como "local deliberado permanente")
3. Marcar V19 como COMPLETO en el plan

**Verificación:**
- [ ] pytest 58/58 + vitest 293/293
- [ ] Árbol limpio + HEAD == origin/main

**Commit:** `docs(v19): cierre del plan transversal`

---

### BLOQUE 6 — V20 Fase 20.0 (infraestructura backend) 🟢

**Riesgo:** Bajo. Solo añade.

**Acciones:**
1. Crear `apps/api/core/timestamps.py` (si no se creó en Bloque 4) con `utcnow()`
2. Añadir `tz_offset_hours(tz, at=None)` a `core/timezone.py`
3. Añadir endpoint `GET /api/v1/settings/timezone` en `settings/router.py`

**⚠️ ORDEN CRÍTICO:** el endpoint `/timezone` debe ir **ANTES** de `@router.get("/{key}")`.
Si va después, FastAPI interpreta `"timezone"` como un `key` y devuelve 404.

```python
# settings/router.py — el orden importa
@router.get("/")                    # lista
@router.get("/timezone")            # ← NUEVO, ANTES de /{key}
@router.get("/{key}")               # ← debe ir DESPUÉS
@router.patch("/{key}")
@router.post("/seed")
```

4. Crear `apps/api/tests/test_timezone_global.py`

**Verificación:**
- [ ] `docker restart rderico-api-dev`
- [ ] `docker exec rderico-api-dev python -m pytest -q` → **64/64**
- [ ] `GET /api/v1/settings/timezone` → `{"timezone":"America/Mexico_City","offset_hours":-6}`
- [ ] `GET /api/v1/settings/business_name` → **sigue funcionando** (orden de rutas)
- [ ] `GET /api/v1/settings/` → 200

**Commit:** `feat(v20): core/timestamps.py + endpoint /settings/timezone`

---

### BLOQUE 7 — V20 Fase 20.1 (sincronizar los 3 mecanismos) 🟡

**Riesgo:** Medio. Cierra el bug latente de Red/KDS.

**Acciones:**
1. `network/router.py::_get_tz_offset` → deriva de `business_timezone` si no hay override
2. KDS Heladería → deriva `tzOffsetHours` de `business_timezone`

**Verificación:**
- [ ] `docker restart rderico-api-dev`
- [ ] pytest **64/64**
- [ ] `test_network_tz.py` **sin cambios** sigue pasando (compatibilidad)
- [ ] Smoke: Monitor de Red muestra fechas correctas

**Commit:** `fix(v20): sincronizar network/KDS con business_timezone`

---

### BLOQUE 8 — V20 Fase 20.3 (TimezoneProvider frontend) 🟢

**Riesgo:** Bajo. Solo añade contexto.

**⚠️ VA ANTES DEL BLOQUE 9.** El frontend debe saber formatear **antes** de que
los datos cambien, o el KDS mostrará "6 horas de antigüedad" en tickets nuevos.

**Acciones:**
1. Crear `apps/shared/timezone.js` (`formatLocal`, `formatLocalTime`, `formatLocalDate`, `normalizeTimezone`)
2. Crear `apps/shared/TimezoneContext.jsx` (`TimezoneProvider`, `useTimezone`)
3. Montar `<TimezoneProvider>` en `main.jsx`
4. Crear `apps/shared/timezone.test.js`

**Verificación:**
- [ ] `npx vitest run` → **~305/305**
- [ ] `npm run build` compila
- [ ] Smoke: la app carga y el contexto tiene la zona correcta

**Commit:** `feat(v20): TimezoneProvider + formatLocal`

---

### BLOQUE 9 — V20 Fase 20.2 + 20.4 (migración datos + formateo) 🔴

**Riesgo:** **ALTO.** Es el bloque peligroso. `pos` a UTC + los 49 formateos.

**⚠️ REGLA ABSOLUTA:** la migración de `pos` (20.2) y el `formatLocal` de la UI
(20.4) van **en el mismo commit**. Si se separan, el KDS muestra 6 horas de
antigüedad entre un commit y el otro.

**Sub-oleadas (en orden):**

| Sub-oleada | Módulos | Puntos | Riesgo |
|---|---|---|---|
| 9.1 | `analytics`, `inventory`, `network` | ~15 | 🟢 |
| 9.2 | `production` (5 archivos) | ~10 | 🟡 |
| 9.3 | `AuditoriaControlUI`, `ExperimentCenterUI` | ~9 | 🟡 |
| 9.4 | `pos` no-IA (11 archivos) + `pos/models.py` a UTC | ~15 | 🔴 |

**⚠️ COMMIT ATÓMICO AMPLIADO (Rev. 2):** las Fases **20.2 + 20.2.b + 20.2.c** son
**indivisibles**. Un solo commit que contenga:

| # | Archivo | Cambio |
|---|---|---|
| 1 | [`pos/models.py:34`](apps/api/modules/pos/models.py:34) | `default=utcnow` |
| 2 | [`pos/service.py:579-580`](apps/api/modules/pos/service.py:579) | `+6h` generalizado con `ZoneInfo` (**NO borrar**) |
| 3 | [`pos/service.py:658,685,962,984`](apps/api/modules/pos/service.py:962) | `utcnow()` |
| 4 | [`analytics/service.py:54-55,89-90`](apps/api/modules/analytics/service.py:54) | `local_day_bounds_utc()` |
| 5 | [`analytics/service.py:104,111-115,121,126-128,156-158,272-273,281,288,297-299`](apps/api/modules/analytics/service.py:104) | `func.timezone(tz, ...)` |
| 6 | [`analytics/service.py:217-218`](apps/api/modules/analytics/service.py:217) | convertir a local antes de `.date()/.weekday()` |

Si se separan, la Auditoría POS **y** los reportes de ventas quedan desfasados
6 horas entre commits.

---

### BLOQUE 9.c — V20 Fase 20.2.d (migrar `grandeza` a UTC) 🟡

**Riesgo:** Medio. **Commit propio**, DESPUÉS del Bloque 8 (frontend listo).

**⚠️ LA TRAMPA `Date` ≠ `DateTime`:** `grandeza` mezcla dos tipos de columna:

| Columna | Tipo | Destino |
|---|---|---|
| `journey_date`, `route_date` | `Column(Date)` — día de negocio | **LOCAL (no se toca)** |
| `dispatched_at`, `arrived_at`, `completed_at`, `recorded_at`, `created_at`, `updated_at` | `Column(DateTime)` — instante real | **UTC** |

**Acciones (5 archivos, 1 commit):**
1. [`grandeza/models.py`](apps/api/modules/grandeza/models.py:95) → 9 columnas `DateTime` con `default=_utcnow`
2. [`grandeza/service.py:18-20`](apps/api/modules/grandeza/service.py:18) → `_now_mexico()` alias de `utcnow()`
3. [`grandeza/service.py:614`](apps/api/modules/grandeza/service.py:614) → `to_local_date_str()` en vez de `strftime`
4. [`GrandezaDailyUI.jsx:700,728`](apps/pos/GrandezaDailyUI.jsx:700) → quitar el parche `+ 'Z'`
5. [`GrandezaDriverUI.jsx:997,1121`](apps/pos/GrandezaDriverUI.jsx:997) → `formatLocal` en vez de `timeZone` hardcodeado

**⛔ NO TOCAR:** `journey_date`, `route_date`, `weekday()`, `day_map`, `order_by`.

**Verificación:**
- [ ] `docker restart rderico-api-dev`
- [ ] pytest **~80/80**
- [ ] Test: `created_at` de un viaje nuevo < 5s de `utcnow()`
- [ ] Test: `journey_date` de un viaje creado a las **23:30 local** sigue siendo el día local
- [ ] Smoke Reparto Grandeza: horas de despacho/llegada correctas
- [ ] Smoke App Repartidor: horas correctas en el móvil

**Commit:** `fix(v20): migrar grandeza a UTC (Date local / DateTime UTC)`

**⛔ NO MIGRAR (son montos o hora del dispositivo):**
- `analyticsConfig.js:88,89` — números
- `EstadisticasVentasUI.jsx:467-471,488,546,578,603,652,669` — montos
- `AuditoriaControlUI.jsx:424,441,468` — montos
- `VisionTrainingUI.jsx:27`, `SalesReceipt.jsx:58`, `TicketTemplate.jsx:4`,
  `MaestroPanaderoUI.jsx:24` — `new Date()` sin argumento (hora del dispositivo)

**⚠️ Quitar el `+ 'Z'` manual:**
- `AuditoriaControlUI.jsx:168,209,236,385` — `new Date(t.created_at + 'Z')`
- `GrandezaDailyUI.jsx:700,728` — mismo patrón

**Verificación:**
- [ ] `docker restart rderico-api-dev`
- [ ] pytest **~70/70**
- [ ] vitest **~305/305**
- [ ] `npm run build` → ~1433 módulos
- [ ] **Smoke POS:** crear ticket, verificar hora correcta
- [ ] **Smoke KDS:** ticket nuevo muestra "0 min", **NO** "360 min"
- [ ] **Smoke Auditoría:** fechas correctas
- [ ] **Smoke Grandeza:** fechas de reparto correctas (backend migrado en Bloque 9.c)

**Commit:** `feat(v20): migrar pos a UTC + formatLocal en toda la UI`

---

### BLOQUE 9.d — Corrección de los 3 bugs cerrados (Sección 6.8 del plan) 🔴

**Riesgo:** **ALTO.** Este bloque **no añade archivos nuevos**: consolida y ordena
los tres arreglos que ya viven en 9.a, 9.b y 9.c. Existe porque los tres bugs
están **acoplados**: corregir uno solo deja el ERP inconsistente.

**Los 3 bugs (confirmados con código real):**

| # | Bug | Ubicación exacta | Naturaleza |
|---|---|---|---|
| 1 | `+6h` del POS IA | [`pos/service.py:573-584`](apps/api/modules/pos/service.py:573) | **NO es bug**: es un parche funcional. Se **generaliza** con `ZoneInfo`, **nunca se borra** |
| 2 | Acoplamiento `analytics` ↔ `pos` | [`analytics/service.py:54-55,89-90,104,111-115,121,126-128,156-158,217-218,272-273,281,288,297-299`](apps/api/modules/analytics/service.py:54) | **Bug latente**: hoy funciona por coincidencia (ambos naive local). Tras migrar `pos` a UTC, **todos los reportes se desplazan 6h** |
| 3 | `_now_mexico()` de `grandeza` | [`grandeza/service.py:18-20`](apps/api/modules/grandeza/service.py:18) + call sites `:344`, `:484`, `:692` + `strftime` en `:614` | **Bug latente**: idéntico al `+6h`. Tras migrar `pos`, `grandeza` queda como el único módulo en hora local |

**⚠️ ORDEN DE EJECUCIÓN OBLIGATORIO (no invertir):**

| Paso | Acción | Dónde | Por qué en este orden |
|---|---|---|---|
| 1 | Crear `local_day_bounds_utc()` en `core/timestamps.py` | Bloque 6 (infra) | Es el helper compartido por POS y Analytics |
| 2 | Crear `to_local_date_str()` en `core/timestamps.py` | Bloque 6 (infra) | Lo consume `grandeza` en el paso 5 |
| 3 | Generalizar el `+6h` del POS IA con `ZoneInfo` | Bloque 9.a (20.2.b) | **Primero el POS**: es el origen de los datos |
| 4 | Migrar `analytics` a `local_day_bounds_utc()` + `func.timezone()` | Bloque 9.b (20.2.c) | **Mismo commit que el paso 3**: si no, reportes desfasados |
| 5 | Migrar `grandeza` (`_now_mexico` → alias de `utcnow()`) | Bloque 9.c (20.2.d) | **Commit propio**, después de que el frontend esté listo |

**⚠️ COMMIT ATÓMICO (los 3 bugs, indivisibles):**

Los pasos 3 y 4 van en **UN SOLO commit**. El paso 5 va en **su propio commit**
(porque toca `grandeza`, que tiene su propia UI y su propio smoke test).

```
Commit A (Bloque 9, atómico):  pos + analytics   → 20.2 + 20.2.b + 20.2.c
Commit B (Bloque 9.c, propio): grandeza          → 20.2.d
```

**Criterio de aceptación conjunto (los 3 bugs a la vez):**

- [ ] **Bug #1:** un ticket creado a las **23:30 local** aparece en la Auditoría POS
      del **día local correcto** (no del día siguiente).
- [ ] **Bug #1:** un ticket creado a las **00:30 local** aparece en el día local
      correcto (no del día anterior).
- [ ] **Bug #2:** el reporte de ventas del día local `D` incluye exactamente los
      tickets vendidos entre `00:00` y `23:59:59` **hora local** de `D`.
- [ ] **Bug #2:** el histograma por hora muestra el pico a la **hora local** real
      (no desplazado 6h).
- [ ] **Bug #2:** el ranking de productos por día coincide con el filtro de tickets.
- [ ] **Bug #3:** `dispatched_at` de un viaje nuevo está a **< 5s** de `utcnow()`.
- [ ] **Bug #3:** `journey_date` de un viaje creado a las **23:30 local** sigue
      siendo el **día local** (no se convierte a UTC).
- [ ] **Bug #3:** `get_client_statistics` devuelve la fecha **local** de la visita.
- [ ] **Los 3 juntos:** POS, Analytics y Grandeza reportan la **misma hora local**
      para el mismo instante.

**Verificación:**
- [ ] `docker restart rderico-api-dev`
- [ ] pytest **~80/80** (incluye los tests nuevos de `local_day_bounds_utc`)
- [ ] vitest **~305/305**
- [ ] **Smoke cruzado:** crear un ticket a las 23:30 local → verificar que aparece
      en Auditoría POS, en Estadísticas de Ventas y en Grandeza el **mismo día local**.

**Commit A:** `fix(v20): corregir los 3 bugs de zona horaria (POS + analytics)`
**Commit B:** `fix(v20): migrar grandeza a UTC (Date local / DateTime UTC)`

**⛔ SI SOLO SE CORRIGE UNO DE LOS 3:** el ERP queda inconsistente. No se avanza
con rojo parcial. Se revierte el commit y se reintenta completo.

---

### BLOQUE 10 — V20 Fase 20.5 (unificación) ⏸️ DIFERIDA

**Decisión:** **NO se implementa.** La duplicación de `_utcnow` en `warehouse` y
`security` es inocua (hacen exactamente lo mismo). El riesgo de tocar esos módulos
supera el beneficio.

Se documenta como **deuda técnica aceptada**.

---

## 4. LAS 9 REGLAS DE ORO

1. **Un bloque = un commit verificado.** Nunca dos bloques sin verificar.
2. **`docker restart rderico-api-dev`** después de CADA cambio de Python.
3. **pytest vía `docker exec`** (Python no está en el PATH del host).
4. **Nunca `docker compose down`.** Solo `restart`.
5. **El POS IA (`RetailVisionPOS.jsx`) no se toca.** Ni una línea.
6. **`grandeza` SÍ se migra** (Bloque 9.c). Solo sus `Column(Date)`
   (`journey_date`, `route_date`) quedan locales. **Rev. 2: ya no es excepción.**
7. **El `+6h` del POS IA no se borra: se generaliza** con `ZoneInfo`. Es el parche
   que sostiene la Auditoría POS.
8. **Si pytest o vitest fallan, se revierte el bloque.** No se avanza con rojo.
9. **Los 3 bugs cerrados se corrigen JUNTOS** (Bloque 9.d): `pos` + `analytics` en
   un commit atómico, `grandeza` en su commit propio. **Nunca uno solo.**

---

## 5. LOS 8 PUNTOS DE MAYOR RIESGO

| # | Punto | Síntoma si falla | Prevención |
|---|---|---|---|
| 1 | `TerminalSelector.jsx:63` | Los terminales no abren | **NO migrarlo** (es la URL de la app) |
| 2 | `pos` a UTC (Bloque 9) | KDS muestra "360 min" | Hacer 20.2 + 20.4 **juntos** |
| 3 | Orden de rutas FastAPI | `/settings/timezone` → 404 | `/timezone` **antes** de `/{key}` |
| 4 | `+6h` del POS IA (Bloque 9.a) | Auditoría POS desfasada 6h | **Generalizar con `ZoneInfo`, NO borrar** |
| 5 | `analytics` ↔ `pos` (Bloque 9.b) | Reportes de ventas desfasados 6h | **Mismo commit que `pos`** |
| 6 | `grandeza` `Date` ≠ `DateTime` (Bloque 9.c) | Calendario roto o reparto desfasado | **`Date` local, `DateTime` UTC** |
| 7 | Frontera de datos | Reportes con salto de 6h | Documentar fecha/hora del deploy |
| 8 | Los 3 bugs corregidos por separado (Bloque 9.d) | POS en UTC, reportes en local (o viceversa) | **Corregir los 3 JUNTOS** (commit atómico + commit propio) |

---

## 6. CRONOGRAMA SUGERIDO

| Sesión | Bloques | Entregable |
|---|---|---|
| **1** | Bloque 1 | Infraestructura frontend |
| **2** | Bloques 2 + 3 | Migración `window.location.hostname` |
| **3** | Bloque 4 | Timestamps UTC (network/cash/orders) |
| **4** | Bloque 5 | Cierre V19 ✅ |
| **5** | Bloque 6 | Infraestructura backend V20 (incluye `local_day_bounds_utc` + `to_local_date_str`) |
| **6** | Bloque 7 | Sincronizar 3 mecanismos |
| **7** | Bloque 8 | TimezoneProvider |
| **8-10** | Bloque 9 (9.1-9.4) + 9.d | Migración datos + formateo + **corrección de los 3 bugs (commit atómico)** |
| **11** | Bloque 9.c | Migrar `grandeza` a UTC (commit propio) |
| — | Bloque 10 | Diferido |

**Total:** ~11 sesiones. **V19 se completa en 4. V20 en 7.** El Bloque 9.d **no
añade sesiones**: consolida y ordena lo que ya estaba en 9.a/9.b/9.c.

---

## 7. CRITERIOS DE ÉXITO

### Al cerrar V19
- [ ] `window.location.hostname` solo aparece en `TerminalSelector.jsx:63` (legítimo)
- [ ] `network`, `cash`, `orders` escriben UTC
- [ ] pytest 58/58 + vitest 293/293
- [ ] Build compila

### Al cerrar V20
- [ ] **Todas** las columnas `DateTime` son UTC — **Rev. 2: sin excepciones**
      (`grandeza` incluida; solo sus `Column(Date)` quedan locales)
- [ ] `GET /api/v1/settings/timezone` responde correctamente
- [ ] El selector de "Visión General" **controla** la hora en todo el ERP
- [ ] Los 3 mecanismos de zona están sincronizados
- [ ] El `+6h` del POS IA generalizado con `ZoneInfo` (no borrado)
- [ ] `analytics` filtra con `local_day_bounds_utc()` (mismo commit que `pos`)
- [ ] **Rev. 3 — los 3 bugs cerrados corregidos JUNTOS** (Bloque 9.d):
      - [ ] Bug #1: ticket a las 23:30 local → día local correcto en Auditoría POS
      - [ ] Bug #2: reporte de ventas del día `D` = tickets 00:00-23:59 local de `D`
      - [ ] Bug #3: `dispatched_at` a < 5s de `utcnow()`; `journey_date` sigue local
      - [ ] Los 3: POS, Analytics y Grandeza reportan la **misma hora local**
- [ ] pytest ~80/80 + vitest ~305/305
- [ ] Smoke POS + KDS + Auditoría + Estadísticas + Grandeza en verde
- [ ] Smoke cruzado: un ticket a las 23:30 local aparece el **mismo día local** en
      Auditoría POS, Estadísticas de Ventas y Grandeza

---

## 8. QUÉ HACER SI ALGO SALE MAL

| Situación | Acción |
|---|---|
| pytest falla tras un cambio | `git checkout -- <archivo>` y reintentar |
| El KDS muestra horas raras | Verificar que 20.2 y 20.4 fueron en el mismo commit |
| `/settings/timezone` da 404 | Revisar el orden de rutas en `settings/router.py` |
| El POS no carga productos | Verificar `CONFIG.API_BASE_URL` en `apps/shared/config.js` |
| Los terminales no abren | Revisar que `TerminalSelector.jsx:63` **no** se tocó |
| Duda sobre un archivo | **Detenerse y preguntar.** No adivinar. |

---

## 9. RESUMEN EN UNA FRASE

**V19 primero (Bloques 1-5, riesgo bajo/medio), V20 después (Bloques 6-9, riesgo
alto concentrado en el Bloque 9). Un commit verificado por bloque. El POS IA nunca
se toca; `grandeza` SÍ se migra (Bloque 9.c) salvo sus `Column(Date)`. Los 3 bugs
cerrados se corrigen **juntos** (Bloque 9.d): `pos` + `analytics` en un commit
atómico, `grandeza` en su commit propio. Si algo falla, se revierte el bloque y no
se avanza.**

**FIN DE LA HOJA DE RUTA**
