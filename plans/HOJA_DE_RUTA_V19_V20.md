# HOJA DE RUTA — IMPLEMENTACIÓN V19 + V20

> **Objetivo:** implementar los planes V19 (Transversal) y V20 (Zona Horaria Global)
> de forma **exitosa, verificable y sin romper la operación**.
>
> **Estado:** 📋 **LISTA PARA EJECUTAR.** Ningún bloque iniciado.
>
> **Autor:** Roo · **Fecha:** 2026-09-14 · **Revisión:** 1

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

**⛔ NO TOCAR:**
- `grandeza/models.py` y `grandeza/service.py` — guarda local **a propósito**
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
2. Registrar en el CHANGELOG la decisión de `grandeza` (local deliberado)
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
- [ ] **Smoke Grandeza:** fechas de reparto correctas (no se tocó el backend)

**Commit:** `feat(v20): migrar pos a UTC + formatLocal en toda la UI`

---

### BLOQUE 10 — V20 Fase 20.5 (unificación) ⏸️ DIFERIDA

**Decisión:** **NO se implementa.** La duplicación de `_utcnow` en `warehouse` y
`security` es inocua (hacen exactamente lo mismo). El riesgo de tocar esos módulos
supera el beneficio.

Se documenta como **deuda técnica aceptada**.

---

## 4. LAS 7 REGLAS DE ORO

1. **Un bloque = un commit verificado.** Nunca dos bloques sin verificar.
2. **`docker restart rderico-api-dev`** después de CADA cambio de Python.
3. **pytest vía `docker exec`** (Python no está en el PATH del host).
4. **Nunca `docker compose down`.** Solo `restart`.
5. **El POS IA (`RetailVisionPOS.jsx`) no se toca.** Ni una línea.
6. **`grandeza` no se migra a UTC.** Guarda local a propósito.
7. **Si pytest o vitest fallan, se revierte el bloque.** No se avanza con rojo.

---

## 5. LOS 5 PUNTOS DE MAYOR RIESGO

| # | Punto | Síntoma si falla | Prevención |
|---|---|---|---|
| 1 | `TerminalSelector.jsx:63` | Los terminales no abren | **NO migrarlo** (es la URL de la app) |
| 2 | `pos` a UTC (Bloque 9) | KDS muestra "360 min" | Hacer 20.2 + 20.4 **juntos** |
| 3 | Orden de rutas FastAPI | `/settings/timezone` → 404 | `/timezone` **antes** de `/{key}` |
| 4 | `grandeza` | Fechas de reparto corridas 6h | **NO tocarlo** |
| 5 | Frontera de datos | Reportes con salto de 6h | Documentar fecha/hora del deploy |

---

## 6. CRONOGRAMA SUGERIDO

| Sesión | Bloques | Entregable |
|---|---|---|
| **1** | Bloque 1 | Infraestructura frontend |
| **2** | Bloques 2 + 3 | Migración `window.location.hostname` |
| **3** | Bloque 4 | Timestamps UTC (network/cash/orders) |
| **4** | Bloque 5 | Cierre V19 ✅ |
| **5** | Bloque 6 | Infraestructura backend V20 |
| **6** | Bloque 7 | Sincronizar 3 mecanismos |
| **7** | Bloque 8 | TimezoneProvider |
| **8-10** | Bloque 9 | Migración datos + formateo (4 sub-oleadas) |
| — | Bloque 10 | Diferido |

**Total:** ~10 sesiones. **V19 se completa en 4. V20 en 6.**

---

## 7. CRITERIOS DE ÉXITO

### Al cerrar V19
- [ ] `window.location.hostname` solo aparece en `TerminalSelector.jsx:63` (legítimo)
- [ ] `network`, `cash`, `orders` escriben UTC
- [ ] pytest 58/58 + vitest 293/293
- [ ] Build compila

### Al cerrar V20
- [ ] **Todas** las columnas `DateTime` son UTC (excepto `grandeza`, documentado)
- [ ] `GET /api/v1/settings/timezone` responde correctamente
- [ ] El selector de "Visión General" **controla** la hora en todo el ERP
- [ ] Los 3 mecanismos de zona están sincronizados
- [ ] pytest ~70/70 + vitest ~305/305
- [ ] Smoke POS + KDS + Auditoría + Grandeza en verde

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
alto concentrado en el Bloque 9). Un commit verificado por bloque. El POS IA y
`grandeza` nunca se tocan. Si algo falla, se revierte el bloque y no se avanza.**

**FIN DE LA HOJA DE RUTA**
