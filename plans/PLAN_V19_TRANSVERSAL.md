# 🌐 PLAN TRANSVERSAL V19 — DEUDA TÉCNICA SISTÉMICA (2.1 + 2.2)

> **Objetivo:** Resolver de una sola vez las **dos deudas técnicas sistémicas** que hoy se
> parchan módulo por módulo, con una sola decisión arquitectónica cada una.
>
> **Restricción Suprema (A):** [`apps/pos/RetailVisionPOS.jsx`](apps/pos/RetailVisionPOS.jsx:29) es **INTOCABLE**.
> El **Punto de Venta IA (Panadería)** no debe cambiar su comportamiento observable **ni un byte**.
>
> **Restricción Suprema (B):** [`apps/api/modules/catalog/`](apps/api/modules/catalog/models.py:1) es la
> **única fuente de verdad** de productos y categorías. Cero precios hardcodeados.
>
> **Fecha:** 2026-09-14 · **Estado:** Revisión 1 — pendiente de autocrítica
> **Baseline verificado:** vitest **293/293** · pytest **58/58** · build **1433 módulos** · HEAD `5448426`

---

## 0. AUTOCRÍTICA PREVIA (antes de escribir una sola línea)

Este plan nace de la lección de V18: **un plan que oculta sus supuestos es más peligroso que
uno que los expone**. Antes de proponer nada, verifico los supuestos contra el código real.

### ✅ Supuesto 1 — `docker-compose.yml` YA pasa una variable de API al frontend

**Verificado:** [`docker-compose.yml:47`](docker-compose.yml:47) contiene:
```yaml
- VITE_API_URL=http://192.168.1.117:5001
```
**Pero el código NUNCA la lee.** `search_files` de `import.meta.env|VITE_API` en `*.js`
devuelve **0 resultados**. Es decir: **la infraestructura ya está cableada, pero desconectada.**

> **Consecuencia:** V19 no es "inventar infraestructura nueva". Es, en gran parte,
> **conectar lo que ya existe**. Eso reduce drásticamente el riesgo.

### ⚠️ Supuesto 2 — La variable se llama `VITE_API_URL`, no `VITE_API_BASE_URL`

**Verificado:** `docker-compose.yml` usa `VITE_API_URL`. El plan V18 (diferido) proponía
`VITE_API_BASE_URL`. **Son nombres distintos.**

> **Decisión:** V19 debe **elegir UN nombre** y usarlo en los 3 lugares (compose, `.env`,
> código). Propongo **`VITE_API_URL`** porque **ya está en `docker-compose.yml`** y cambiarlo
> implicaría tocar el compose del POS IA. **No se toca el compose del POS IA.**

### ⚠️ Supuesto 3 — `.env` NO tiene la variable, pero SÍ tiene `API_URL`

**Verificado:**
```
.env:API_URL="http://192.168.1.117:5001"
.env:NEXT_PUBLIC_API_URL="http://192.168.1.117:5001"
```
- `NEXT_PUBLIC_API_URL` es un prefijo de **Next.js**; **Vite NO lo expone** al cliente
  (`import.meta.env` solo expone variables con prefijo `VITE_`).
- `API_URL` **sí** está disponible para el **backend** (Python), pero **no** para el frontend.

> **Consecuencia:** hay que **añadir `VITE_API_URL`** a `.env` y `.env.example`. Es una
> decisión de infraestructura **deliberada y reversible**.

### ⚠️ Supuesto 4 — `window.location.hostname` es SISTÉMICO, no de Heladería

**Verificado — 15 archivos afectados** (no 4 como decía el plan V18):

| Módulo | Archivos | Líneas |
|---|---|---|
| `production` | `ProductionEquipmentUI.jsx` | 7, 212 |
| `production` | `GestorPickupUI.jsx` | 7 |
| `production` | `PedidosProduccionUI.jsx` | 22 |
| `production` | `GlobalAgentSettingsUI.jsx` | 21 |
| `production` | `PedidosPendientesUI.jsx` | 4 |
| `production` | `ProcesoProduccionMasaUI.jsx` | 7 |
| `production` | `DoughManagerUI.jsx` | 83, 90–94 |
| `production` | `GestorRepartosUI.jsx` | 7 |
| `pos` | `config.js` | 1 |
| `pos` | `posConstants.js` | 60, 79 |
| `pos` | `ProgramacionPedidoModal.jsx` | 4 |
| `pos` | `TerminalSelector.jsx` | 63 |
| `pos` | `GrandezaDriverUI.jsx` | 726 |
| `inventory` | `ProductCatalogUI.jsx` | 48, 54–56, 58 |
| `auth` | `PerfilesAccessSuite.jsx` | 3 |
| `settings` | `SystemSettingsUI.jsx` | 3 |

**Ya migrados (patrón correcto, sirven de referencia):**
- [`AuditoriaControlUI.jsx:5`](apps/AuditoriaControlUI.jsx:5) → `const API_BASE = CONFIG.API_BASE_URL;`
- [`NetworkMonitorUI.jsx:19`](apps/network/NetworkMonitorUI.jsx:19) → `const API_BASE = CONFIG.API_BASE_URL;`
  con el comentario *"PROHIBIDO reconstruir la URL con window.location.hostname + ':5001'"*.

### ⚠️ Supuesto 5 — Hay DOS convenciones de timestamps, no una

**Verificado — 35 columnas `DateTime` en `apps/api/modules`:**

**Convención A — ✅ CORRECTA (UTC naive vía `_utcnow`):**
| Módulo | Patrón |
|---|---|
| `warehouse` | `default=_utcnow` (4 columnas) |
| `security` | `default=_utcnow` (1 columna) |
| `hr` | `DateTime(timezone=True), server_default=func.now()` (19 columnas) |

**Convención B — ⚠️ NAIVE LOCAL (`datetime.now`):**
| Módulo | Columnas |
|---|---|
| `pos` | `models.py:34` (`created_at`) |
| `network` | `models.py:13` (`created_at`) |
| `cash` | `models.py:44` (`created_at`) |
| `grandeza` | `models.py:23,45,82,116,179,250,291` (7 columnas) |
| `orders` | `models.py:52,53` (`created_at`, `updated_at`) |

> **Consecuencia:** `datetime.now()` guarda **hora local de Toluca (UTC-6)** en una columna
> `TIMESTAMP WITHOUT TIME ZONE`. Al serializar, el frontend lo interpreta como UTC → **error
> de 6 horas** en los cálculos de urgencia. V18 lo mitigó en la **serialización** (sufijo `Z`),
> pero la **raíz** sigue ahí.

### ✅ Supuesto 6 — `core/` es el namespace compartido establecido

**Verificado:** 70 imports de `core.database`, `core.timezone`, `core.audit`, `core.config`.
`core/serialization.py` ya existe (creado en V18 Fase 18.1). **No se inventa namespace.**

---

## 1. RESUMEN EJECUTIVO

| # | Deuda | Alcance real | Riesgo POS IA | Estrategia V19 |
|---|---|---|---|---|
| **2.1** | `window.location.hostname` | **15 archivos** en 5 módulos | 🔴 **Alto** (toca `pos/config.js`) | **Contener + migrar por oleadas**, POS IA al final y con red de seguridad |
| **2.2** | Dos convenciones de timestamps | **35 columnas** en 8 módulos | 🔴 **Alto** (toca `pos/models.py`) | **NO migrar columnas.** Unificar en la **capa de escritura** (`_utcnow`) sin tocar el esquema |

> **Principio rector de V19:** **la deuda se paga en la capa correcta, no en la capa más
> visible.** Migrar 35 columnas con Alembic sobre `tickets` sería un suicidio operativo.
> La solución correcta es **unificar el punto de escritura** y **dejar el esquema intacto**.

---

## 2. PRINCIPIOS RECTORES (NO NEGOCIABLES)

1. **Barrera de No-Interferencia:** ningún cambio altera el comportamiento observable del POS IA.
2. **No migrar esquema por deuda de datos:** las columnas `TIMESTAMP WITHOUT TIME ZONE` se
   quedan. Se corrige **qué se escribe en ellas**, no **cómo están definidas**.
3. **Un solo nombre de variable:** `VITE_API_URL` (ya presente en `docker-compose.yml`).
4. **Oleadas, no big-bang:** cada módulo migra en su propio commit atómico y revertible.
5. **El POS IA va al FINAL y con red de seguridad:** `apps/pos/config.js` conserva su lógica
   hasta que **todos** los demás módulos estén migrados y verificados.
6. **Verificar antes de afirmar:** todo supuesto se comprueba contra el código (Sección 0).
7. **Verificación en cada fase:** vitest + pytest + build + smoke POS 200 + smoke SETTINGS 200.
8. **Documentación simultánea:** cada fase actualiza la documentación en el mismo commit.

---

## 3. FASE 19.0 — INFRAESTRUCTURA (PRERREQUISITO, RIESGO CERO)

> **Sin esta fase, ninguna migración de URL funciona.** Es el cimiento.

### 3.1 Problema
`docker-compose.yml:47` pasa `VITE_API_URL` al contenedor `pos`, pero:
- `.env` **no** la define (solo `API_URL` y `NEXT_PUBLIC_API_URL`).
- `.env.example` **no** la menciona.
- El código **nunca** la lee.

### 3.2 Solución (estrictamente aditiva)

**Paso 1 — Añadir a `.env`** (junto a las existentes, sin borrar nada):
```
VITE_API_URL="http://192.168.1.117:5001"
```

**Paso 2 — Añadir a `.env.example`** (documentar la variable):
```
# URL base del API para el frontend (Vite). Debe llevar prefijo VITE_ para
# que import.meta.env la exponga al cliente.
VITE_API_URL="http://192.168.1.117:5001"
```

**Paso 3 — Verificar que `docker-compose.yml:47` ya la pasa** (NO se modifica):
```yaml
- VITE_API_URL=http://192.168.1.117:5001   # ← ya existe, no se toca
```

### 3.3 Verificación
- [ ] `docker compose config` → la variable aparece en el servicio `pos`
- [ ] `docker restart rderico-pos-dev` → el contenedor arranca sin error
- [ ] `GET /api/v1/settings/` → **200** (el backend no se ve afectado)
- [ ] `npx vitest run` → **293/293** (el código aún no la usa; cero impacto)

### 3.4 Commit
```
V19 Fase 19.0: infraestructura VITE_API_URL en .env y .env.example (aditivo)
```

> **Riesgo:** 🟢 **Nulo.** Solo se añaden variables de entorno. Ningún archivo de código cambia.

---

## 4. FASE 19.1 — MÓDULO CORRECTO `apps/shared/config.js` (RIESGO CERO)

### 4.1 Problema
No existe un módulo de configuración **correcto** al que migrar. `apps/pos/config.js` es el
único, y **viola las reglas** (`window.location.hostname`).

### 4.2 Solución

**Crear `apps/shared/config.js`:**
```javascript
/**
 * config.js — Fuente única de verdad para la URL del API (frontend).
 *
 * v19 (Fase 19.1): reemplaza el uso de window.location.hostname (PROHIBIDO por las
 * reglas del proyecto) por una variable de entorno de Vite, con fallback explícito.
 *
 * REGLA DE ORO: la URL del API se resuelve por configuración, NUNCA por
 * window.location.hostname. Ver apps/network/NetworkMonitorUI.jsx:18.
 *
 * El POS IA conserva su comportamiento actual vía apps/pos/config.js (no se toca
 * hasta la Fase 19.5).
 */
const ENV_URL = import.meta.env?.VITE_API_URL;

// Fallback: si la variable no está definida, se usa el host actual + puerto 5001.
// Esto preserva el comportamiento histórico SIN hardcodear una IP.
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

> **Decisión clave — el fallback:** si `VITE_API_URL` no está definida, el módulo **cae al
> comportamiento histórico** (`window.location.hostname`). Esto significa que **migrar a este
> módulo NUNCA rompe la conectividad**, ni siquiera si la variable falta. La violación se
> **contiene en un solo lugar documentado** en vez de estar en 15 archivos.

> ⚠️ **Nota honesta:** el fallback **sigue usando `window.location.hostname`**. No es
> "purismo arquitectónico"; es **pragmatismo operativo**. La diferencia es que ahora hay
> **un solo punto** que viola la regla, está **documentado**, y **desaparece** en cuanto
> `VITE_API_URL` esté definida (Fase 19.0). Los 15 archivos dejan de violarla.

### 4.3 Verificación
- [ ] `npx vitest run` → **293/293** (nadie importa el módulo aún)
- [ ] `npx vite build` → **1433 módulos** (o +1)
- [ ] Test nuevo `apps/shared/config.test.js`: con `VITE_API_URL` definida → la usa;
      sin ella → cae al fallback

### 4.4 Commit
```
V19 Fase 19.1: apps/shared/config.js (fuente unica de URL, sin violacion propagada)
```

> **Riesgo:** 🟢 **Nulo.** Archivo nuevo, nadie lo importa todavía.

---

## 5. FASE 19.2 — MIGRAR MÓDULOS NO-POS (OLEADA 1)

> **Los módulos que NO son el POS IA migran primero.** Si algo falla, el POS IA ni se entera.

### 5.1 Archivos a migrar (10 archivos, 4 módulos)

| Módulo | Archivo | Cambio |
|---|---|---|
| `production` | [`ProductionEquipmentUI.jsx:7`](apps/production/ProductionEquipmentUI.jsx:7) | `const API_BASE = CONFIG.API_BASE_URL;` |
| `production` | [`ProductionEquipmentUI.jsx:212`](apps/production/ProductionEquipmentUI.jsx:212) | usar `CONFIG.API_BASE_URL` para imágenes |
| `production` | [`GestorPickupUI.jsx:7`](apps/production/GestorPickupUI.jsx:7) | idem |
| `production` | [`PedidosProduccionUI.jsx:22`](apps/production/PedidosProduccionUI.jsx:22) | idem |
| `production` | [`GlobalAgentSettingsUI.jsx:21`](apps/production/GlobalAgentSettingsUI.jsx:21) | idem |
| `production` | [`PedidosPendientesUI.jsx:4`](apps/production/PedidosPendientesUI.jsx:4) | idem |
| `production` | [`ProcesoProduccionMasaUI.jsx:7`](apps/production/ProcesoProduccionMasaUI.jsx:7) | idem |
| `production` | [`DoughManagerUI.jsx:83`](apps/production/DoughManagerUI.jsx:83) | idem + helper de imágenes |
| `production` | [`GestorRepartosUI.jsx:7`](apps/production/GestorRepartosUI.jsx:7) | idem |
| `inventory` | [`ProductCatalogUI.jsx:48`](apps/inventory/ProductCatalogUI.jsx:48) | idem + helper de imágenes |
| `auth` | [`PerfilesAccessSuite.jsx:3`](apps/auth/PerfilesAccessSuite.jsx:3) | idem |
| `settings` | [`SystemSettingsUI.jsx:3`](apps/settings/SystemSettingsUI.jsx:3) | idem |

### 5.2 Patrón de migración (uniforme)

**Antes:**
```javascript
const API_BASE = `http://${window.location.hostname}:5001/api/v1`;
```
**Después:**
```javascript
import { CONFIG } from '@shared/config';   // alias @shared → ./apps/shared
const API_BASE = CONFIG.API_BASE_URL;
```

> ⚠️ **Punto delicado — el alias `@shared`:** hay que añadirlo a
> [`vite.config.js`](vite.config.js:8) (`resolve.alias`). Es **aditivo** (no toca `@` ni
> `@packages`). Alternativa sin tocar `vite.config.js`: importar con ruta relativa
> (`../../shared/config`). **Recomiendo el alias** por legibilidad, pero es una decisión
> que debe verificarse con `npx vite build`.

### 5.3 Los helpers de imágenes (caso especial)

`ProductCatalogUI.jsx:54-56`, `DoughManagerUI.jsx:90-92` y `ProductionEquipmentUI.jsx:212`
**reescriben URLs de imágenes** con `window.location.hostname`. No basta con cambiar
`API_BASE`; hay que cambiar el helper:
```javascript
// Antes
return url.replace(/localhost:\d+/g, `${window.location.hostname}:5001`)...
// Después
const API_ORIGIN = CONFIG.API_BASE_URL.replace(/\/api\/v1$/, '');
return url.replace(/localhost:\d+/g, API_ORIGIN)...
```

### 5.4 Verificación
- [ ] `npx vitest run` → **293/293**
- [ ] `npx vite build` → **1433 módulos** (o +1 por el alias)
- [ ] Smoke manual: cada UI carga su lista (Producción, Almacén, Auth, Settings)
- [ ] `GET /api/v1/settings/` → **200**
- [ ] **Smoke POS IA:** `RetailVisionPOS.jsx` sigue funcionando (no se tocó, pero se verifica)

### 5.5 Commit
```
V19 Fase 19.2: migrar production/inventory/auth/settings a CONFIG.API_BASE_URL
```

> **Riesgo:** 🟡 **Medio.** Cambia la resolución de URL en 4 módulos. Mitigado por el
> **fallback** de la Fase 19.1 (si `VITE_API_URL` falta, el comportamiento es idéntico).

---

## 6. FASE 19.3 — MIGRAR `pos` NO-IA (OLEADA 2, CON CUIDADO)

> **Aquí empieza el terreno delicado.** Estos archivos viven en `apps/pos/` pero **NO son
> el POS IA**. Se migran **uno por uno**, con verificación individual.

### 6.1 Archivos a migrar (4 archivos)

| Archivo | Línea | Nota |
|---|---|---|
| [`posConstants.js:60`](apps/pos/utils/posConstants.js:60) | `loadTerminalsConfig` | Usa `API` local |
| [`posConstants.js:79`](apps/pos/utils/posConstants.js:79) | `saveTerminalsConfig` | Usa `API` local |
| [`ProgramacionPedidoModal.jsx:4`](apps/pos/components/ProgramacionPedidoModal.jsx:4) | `API_BASE` | Modal de programación |
| [`TerminalSelector.jsx:63`](apps/pos/components/TerminalSelector.jsx:63) | `copyUrl` | **CASO ESPECIAL** (ver 6.2) |
| [`GrandezaDriverUI.jsx:726`](apps/pos/GrandezaDriverUI.jsx:726) | `img src` | Foto de fachada |

### 6.2 ⚠️ CASO ESPECIAL — `TerminalSelector.jsx:63`

```javascript
const url = `http://${window.location.hostname}:${window.location.port}/?terminal=${tid}`;
```
**Esto NO es la URL del API.** Es la URL **de la propia app** (para copiar el enlace de una
terminal). **NO se debe migrar a `CONFIG.API_BASE_URL`** — sería un error grave.

> **Decisión:** `TerminalSelector.jsx:63` **se deja como está**. `window.location.hostname`
> aquí es **correcto** (es la URL de la app, no del API). Se documenta con un comentario
> para que nadie lo "corrija" por error.

### 6.3 Verificación
- [ ] `npx vitest run` → **293/293**
- [ ] `npx vite build` → **1433 módulos** (o +1)
- [ ] Smoke: selector de terminales carga la config
- [ ] Smoke: modal de programación de pedidos abre
- [ ] **Smoke POS IA:** `RetailVisionPOS.jsx` intacto

### 6.4 Commit
```
V19 Fase 19.3: migrar pos no-IA (posConstants, ProgramacionPedidoModal, GrandezaDriver)
```

> **Riesgo:** 🟡 **Medio.** Archivos dentro de `apps/pos/` pero fuera del POS IA.

---

## 7. FASE 19.4 — UNIFICAR LA ESCRITURA DE TIMESTAMPS (DEUDA 2.2)

> **Aquí está el corazón de la deuda 2.2.** Y la decisión más importante del plan.

### 7.1 Problema (la raíz, no el síntoma)

`datetime.now()` guarda **hora local de Toluca (UTC-6)** en columnas
`TIMESTAMP WITHOUT TIME ZONE`. Al serializar, el frontend lo interpreta como UTC →
**error de 6 horas**. V18 lo mitigó en la **serialización** (sufijo `Z`), pero la **raíz**
sigue ahí: **se sigue escribiendo hora local.**

### 7.2 ❌ Lo que NO se hará (y por qué)

| Tentación | Por qué NO |
|---|---|
| Migrar las 35 columnas a `timezone=True` | **Migración masiva sobre `tickets`** (la tabla más crítica). Riesgo desproporcionado. |
| Cambiar `pos/models.py:34` | **Toca el POS IA.** Prohibido por la Restricción A. |
| Reescribir datos históricos | Los datos ya escritos son **hora local**. Reescribirlos requiere saber la hora exacta de cada uno. **Imposible sin riesgo.** |

### 7.3 ✅ Lo que SÍ se hará — unificar el PUNTO DE ESCRITURA

**Crear `apps/api/core/timestamps.py`:**
```python
"""
timestamps.py — Punto único de generación de timestamps para columnas
TIMESTAMP WITHOUT TIME ZONE.

v19 (Fase 19.4): unifica la convención. Las columnas siguen siendo naive
(asyncpg rechaza tzinfo), pero el VALOR es SIEMPRE UTC.

REGLA DE ORO: almacenar en UTC, mostrar en hora local.
Ver apps/api/modules/warehouse/models.py:12 (patrón original).

NO se migra el esquema. Solo se corrige QUÉ se escribe.
"""
import datetime


def utcnow() -> datetime.datetime:
    """UTC naive. Reemplaza datetime.now() (hora local) y datetime.utcnow() (deprecado).

    Devuelve un datetime SIN tzinfo (las columnas son TIMESTAMP WITHOUT TIME ZONE),
    pero con el VALOR en UTC. Es el patrón ya probado en warehouse y security.
    """
    return datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)
```

**Migrar los `default=datetime.now` a `default=utcnow`** en los módulos **NO-POS**:

| Módulo | Archivo | Columnas |
|---|---|---|
| `network` | [`models.py:13`](apps/api/modules/network/models.py:13) | 1 |
| `cash` | [`models.py:44`](apps/api/modules/cash/models.py:44) | 1 |
| `grandeza` | [`models.py:23,45,82,116,179,250,291`](apps/api/modules/grandeza/models.py:23) | 7 |
| `orders` | [`models.py:52,53`](apps/api/modules/orders/models.py:52) | 2 |

**`pos/models.py:34` se DEJA INTACTO** (Restricción A). Se documenta como deuda contenida.

> ⚠️ **Punto delicado — datos históricos:** los registros ya escritos siguen en hora local.
> El cambio **solo afecta a los NUEVOS registros**. Esto crea una **discontinuidad temporal**
> (los datos viejos en local, los nuevos en UTC). **Mitigación:** la serialización de V18
> (`iso_utc`) ya asume UTC, así que los datos **nuevos** serán correctos. Los **viejos**
> seguirán con el error de 6 h, pero **ya lo tenían**. No empeora nada.

> **Decisión honesta:** esta fase **no corrige el pasado**, corrige el **futuro**. Es lo
> máximo que se puede hacer sin una migración de datos de alto riesgo.

### 7.4 Verificación
- [ ] `docker restart rderico-api-dev`
- [ ] `docker exec rderico-api-dev python -m pytest -q` → **58/58**
- [ ] Test nuevo `test_timestamps.py`: `utcnow()` es naive y ≈ UTC
- [ ] Smoke: crear un registro nuevo en `network`/`cash`/`grandeza` → `created_at` en UTC
- [ ] `GET /api/v1/settings/` → **200**
- [ ] **Smoke POS IA:** `GET /api/v1/pos/terminals/status` → **200**, `locked_at` con `Z`

### 7.5 Commit
```
V19 Fase 19.4: core/timestamps.py + unificar escritura UTC en network/cash/grandeza/orders
```

> **Riesgo:** 🟡 **Medio.** Cambia qué se escribe en 11 columnas. Mitigado por el patrón
> ya probado en `warehouse`/`security` y por el test de contrato.

---

## 8. FASE 19.5 — EL POS IA (ÚLTIMA, CON RED DE SEGURIDAD)

> **Solo se ejecuta si las Fases 19.0–19.4 están completas, verificadas y en producción
> sin incidentes durante al menos una semana.**

### 8.1 ¿Qué se tocaría?

**Únicamente** [`apps/pos/config.js`](apps/pos/config.js:1) — el archivo de configuración,
**NO** `RetailVisionPOS.jsx` (que sigue intocable).

### 8.2 Estrategia de red de seguridad

**Opción A (recomendada) — NO tocar `apps/pos/config.js`:**
Dejarlo como está. El POS IA sigue resolviendo su URL con su lógica actual. **La violación
se contiene en un solo archivo documentado.** El resto del sistema ya está limpio.

**Opción B (solo si se exige purismo) — re-export con verificación exhaustiva:**
```javascript
// apps/pos/config.js
// v19 (Fase 19.5): re-export del módulo compartido. El POS IA conserva su
// comportamiento porque apps/shared/config.js tiene el MISMO fallback.
export { CONFIG } from '../shared/config';
```
> ⚠️ **Antes de aplicar la Opción B:** verificar que `apps/shared/config.js` produce
> **exactamente** la misma URL que la lógica actual en los 3 entornos (localhost, IP de red,
> dominio de producción). Si hay **una sola diferencia**, **NO aplicar**.

### 8.3 Decisión recomendada

**Aplicar la Opción A.** El beneficio de la Opción B es **puramente estético** (un archivo
menos con `window.location.hostname`), y el riesgo es **tocar el POS IA**. **No vale la pena.**

> **Regla de V19:** *"Si el beneficio es estético y el riesgo toca el POS IA, no se hace."*

### 8.4 Verificación (solo si se aplica la Opción B)
- [ ] `npx vitest run` → **293/293**
- [ ] `npx vite build` → **1433 módulos**
- [ ] Smoke POS IA en **localhost**: `CONFIG.API_BASE_URL` === `http://localhost:5001/api/v1`
- [ ] Smoke POS IA en **IP de red**: `CONFIG.API_BASE_URL` === `http://192.168.1.117:5001/api/v1`
- [ ] Smoke POS IA en **dominio**: `CONFIG.API_BASE_URL` === `https://api.rdericotoluca.com/api/v1`
- [ ] `GET /api/v1/pos/terminals/status` → **200**
- [ ] Reservar un ticket de prueba → **200**

### 8.5 Commit
```
V19 Fase 19.5: pos/config.js re-export (SOLO si la verificacion de 3 entornos pasa)
```

> **Riesgo:** 🔴 **Alto.** Es el POS IA. **Por defecto NO se ejecuta.**

---

## 9. FASE 19.6 — DOCUMENTACIÓN Y CIERRE

- Actualizar [`DOCUMENTACION_MODULO_HELADERIA.md`](ESPECIFICACIONES%20DEL%20PROYECTO/DOCUMENTACION_MODULO_HELADERIA.md:1):
  - Sección 11 → registrar la decisión de `VITE_API_URL` y `core/timestamps.py`.
  - Sección 12 → BUG 5: la deuda sistémica de `window.location.hostname`.
- Crear/actualizar `DOCUMENTACION_ARQUITECTURA.md` con:
  - La **regla de oro** de la URL del API (nunca `window.location.hostname`).
  - La **regla de oro** de timestamps (almacenar UTC, mostrar local).
  - El **punto único** de cada una (`apps/shared/config.js`, `core/timestamps.py`).
- Commit + push.

---

## 10. MATRIZ DE RIESGO

| Fase | Descripción | Riesgo POS IA | Mitigación | Reversible |
|---|---|---|---|---|
| 19.0 | Infraestructura `.env` | 🟢 Nulo | Solo variables de entorno | ✅ Sí |
| 19.1 | `apps/shared/config.js` | 🟢 Nulo | Archivo nuevo, nadie lo importa | ✅ Sí |
| 19.2 | Migrar no-POS | 🟡 Medio | Fallback preserva comportamiento | ✅ Sí |
| 19.3 | Migrar `pos` no-IA | 🟡 Medio | Uno por uno; `TerminalSelector` NO se toca | ✅ Sí |
| 19.4 | Timestamps UTC | 🟡 Medio | Patrón probado; solo afecta datos nuevos | ✅ Sí |
| 19.5 | POS IA | 🔴 **Alto** | **Por defecto NO se ejecuta** (Opción A) | ✅ Sí |
| 19.6 | Documentación | 🟢 Nulo | Solo docs | ✅ Sí |

---

## 11. ORDEN DE EJECUCIÓN RECOMENDADO

```
19.0 (infraestructura .env)     ← CIMIENTO, RIESGO CERO
  ↓
19.1 (apps/shared/config.js)    ← MÓDULO CORRECTO, RIESGO CERO
  ↓
19.2 (migrar no-POS)            ← OLEADA 1: production/inventory/auth/settings
  ↓
19.3 (migrar pos no-IA)         ← OLEADA 2: posConstants/ProgramacionPedidoModal/GrandezaDriver
  ↓
19.4 (timestamps UTC)           ← DEUDA 2.2: network/cash/grandeza/orders
  ↓
19.6 (documentación)            ← CIERRE
  ↓
19.5 (POS IA)                   ← ⏸️ SOLO SI TODO LO ANTERIOR LLEVA 1 SEMANA ESTABLE
```

**Recomendación final:** ejecutar **19.0 → 19.1 → 19.2 → 19.3 → 19.4 → 19.6** con confianza.
**19.5 se deja pendiente** y probablemente **nunca se ejecute** (Opción A es suficiente).

---

## 12. CHECKLIST DE VERIFICACIÓN FINAL (OBLIGATORIO)

- [ ] `npx vitest run` → **293/293** (o más)
- [ ] `npx vite build` → **1433 módulos** (o +1)
- [ ] `docker exec rderico-api-dev python -m pytest -q` → **58/58** (o más)
- [ ] `GET /api/v1/settings/` → **200**
- [ ] `GET /api/v1/pos/terminals/status` → **200** (POS IA intacto, `locked_at` con `Z`)
- [ ] `GET /api/v1/heladeria/kds/helados` → **200** con `created_at` terminando en `Z`
- [ ] `git status` → árbol limpio
- [ ] `git log origin/main..HEAD` → vacío (todo pusheado)
- [ ] Documentación actualizada en el mismo commit
- [ ] **`RetailVisionPOS.jsx` NO aparece en ningún `git diff`** (verificación explícita)

---

## 13. LO QUE **NO** SE HARÁ (Y POR QUÉ)

| Tentación | Por qué NO |
|---|---|
| Migrar las 35 columnas `DateTime` a `timezone=True` | **Migración masiva sobre `tickets`.** Riesgo desproporcionado. Se corrige la **escritura**, no el esquema. |
| Cambiar `pos/models.py:34` | **Toca el POS IA.** Prohibido por la Restricción A. |
| Reescribir datos históricos de timestamps | Requiere saber la hora exacta de cada registro. **Imposible sin riesgo.** Solo se corrige el futuro. |
| Migrar `TerminalSelector.jsx:63` a `CONFIG.API_BASE_URL` | **Es la URL de la app, no del API.** `window.location.hostname` aquí es **correcto**. Migrarlo sería un bug. |
| Renombrar `VITE_API_URL` a `VITE_API_BASE_URL` | Implicaría tocar `docker-compose.yml` (infra del POS IA). **Se usa el nombre que ya existe.** |
| Tocar `apps/pos/config.js` "por purismo" | **Riesgo Alto, beneficio estético.** La Opción A (no tocarlo) es suficiente. |
| Eliminar el fallback de `apps/shared/config.js` | El fallback es la **red de seguridad** que garantiza que migrar nunca rompe la conectividad. |
| Tocar `RetailVisionPOS.jsx` | **Restricción A. Prohibido.** |
| Tocar `apps/api/modules/catalog/` | **Restricción B.** Es la fuente única de verdad de productos. |

---

## 14. LECCIONES APLICADAS DE V18 (autocrítica preventiva)

1. **Verificar el contenido de un archivo antes de proponer moverlo.** V18 descubrió que
   `config.js` escondía una violación. V19 **ya verificó** los 15 archivos antes de planear.
2. **Medir el beneficio contra el riesgo de cada migración.** V19 **rechaza** migrar 35
   columnas porque el riesgo (tocar `tickets`) supera el beneficio.
3. **Confirmar que un "patrón probado" está realmente en uso.** V19 reutiliza `_utcnow`
   de `warehouse`/`security`, **verificado vivo** en 5 columnas.
4. **Reconocer lo que resistió la verificación.** V19 documenta que `docker-compose.yml:47`
   **ya pasa** `VITE_API_URL` — la infraestructura está cableada, solo desconectada.
5. **La deuda se paga en la capa correcta.** V18 pagó la deuda 2.2 en la **serialización**
   (síntoma). V19 la paga en la **escritura** (raíz), sin tocar el esquema.
6. **El POS IA va al final y por defecto NO se toca.** V19 lo aísla en la Fase 19.5, marcada
   como opcional y de riesgo Alto.

---

## 15. ESTIMACIÓN DE ESFUERZO

| Fase | Archivos tocados | Complejidad | Riesgo |
|---|---|---|---|
| 19.0 | 2 (`.env`, `.env.example`) | Trivial | 🟢 Nulo |
| 19.1 | 1 nuevo + 1 test | Baja | 🟢 Nulo |
| 19.2 | 12 (10 UI + `vite.config.js` + test) | Media | 🟡 Medio |
| 19.3 | 3 (2 UI + 1 util) | Media | 🟡 Medio |
| 19.4 | 5 (1 nuevo + 4 models + 1 test) | Media | 🟡 Medio |
| 19.5 | 1 (`pos/config.js`) | Baja | 🔴 Alto |
| 19.6 | 2 docs | Baja | 🟢 Nulo |

**Total sin 19.5:** ~24 archivos, 6 commits atómicos, riesgo máximo 🟡 Medio.
**Total con 19.5:** +1 archivo, +1 commit, riesgo 🔴 Alto.

---

**FIN DEL PLAN — V19 (Revisión 1)**
