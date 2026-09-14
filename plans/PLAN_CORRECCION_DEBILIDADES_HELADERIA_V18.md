# 🛡️ PLAN DE CORRECCIÓN DE DEBILIDADES — MÓDULO HELADERÍA (V18)

> **Objetivo:** Corregir las debilidades detectadas en la auditoría del módulo de Heladería,
> **sin afectar en ningún momento el módulo de Punto de Venta IA (Panadería)**.
>
> **Restricción Suprema (A):** [`apps/pos/RetailVisionPOS.jsx`](apps/pos/RetailVisionPOS.jsx:29) es **INTOCABLE**.
>
> **Fecha:** 2026-09-14 · **Estado:** Revisión 2 — corregido tras autocrítica
> **Baseline verificado:** vitest 293/293 · pytest 50/50 · build 1433 módulos · HEAD `7086c54`

---

## 0. AUTOCRÍTICA DE LA REVISIÓN 1 (por qué este plan cambió)

La Revisión 1 de este plan contenía **3 defectos graves** que solo se revelaron al verificar
los supuestos contra el código real. Los documento aquí porque **un plan que oculta sus
errores es más peligroso que uno que los expone**.

### ❌ Defecto 1 — Fase 18.2 habría INSTITUCIONALIZADO una violación

**Lo que proponía la Rev. 1:** extraer `apps/pos/config.js` a `apps/shared/config.js` con
re-export, para desacoplar Heladería.

**Lo que descubrí al leer el archivo:**
```javascript
// apps/pos/config.js:1
const hostname = window.location.hostname;   // ← PROHIBIDO por las reglas del proyecto
```

[`apps/pos/config.js:1`](apps/pos/config.js:1) usa `window.location.hostname`, que es
**exactamente el anti-patrón que las reglas del proyecto prohíben**. Los propios servicios de
Heladería lo documentan como prohibido:
> [`heladeriaService.js:5`](apps/heladeria/services/heladeriaService.js:5): *"Usar CONFIG.API_BASE_URL (prohibido window.location.hostname)"*

**El error de razonamiento:** propuse **mover** el archivo violatorio a `apps/shared/` y
**propagarlo a 4 módulos**. Eso no desacopla: **contagia**. Habría convertido una violación
localizada en una violación arquitectónica compartida, y encima la habría bendecido con el
nombre "shared".

**Corrección:** La Fase 18.2 se **elimina como "extracción"** y se reemplaza por una
**corrección real**: crear `apps/shared/config.js` con la lógica **correcta** (sin
`window.location.hostname`), y dejar `apps/pos/config.js` como re-export **temporal** que
preserva el comportamiento actual del POS IA. Heladería migra al módulo correcto.

### ❌ Defecto 2 — Fase 18.3 proponía una migración de alto riesgo por beneficio nulo

**Lo que proponía la Rev. 1:** añadir columna `paid_at` a `tickets` vía Alembic.

**Lo que descubrí al buscar `paid_at` en todo `apps/api`:**
```
apps/api/modules/heladeria/service.py:180   paid_at=None
apps/api/modules/heladeria/schemas.py:109   paid_at: Optional[str] = None
```
**Solo 2 ocurrencias, ambas en Heladería.** El POS IA **nunca lee ni escribe `paid_at`**.

**El error de razonamiento:** propuse tocar la tabla **más crítica del sistema** (`tickets`)
para poblar un campo que **solo un módulo lee** y cuyo beneficio es **puramente semántico**.
El riesgo (migración sobre `tickets`) es **desproporcionado** respecto al beneficio.

**Corrección:** La Fase 18.3 se **elimina del alcance de V18**. Se documenta como deuda
opcional. Si algún día se necesita, se hará con una migración dedicada y su propio plan.

### ❌ Defecto 3 — Afirmé "patrón probado" sin verificar que estuviera vivo

**Lo que afirmaba la Rev. 1:** `_iso_utc()` es un patrón probado que debemos reutilizar.

**Lo que verifiqué:** [`pos/router.py:306`](apps/api/modules/pos/router.py:306) lo usa
realmente:
```python
if info.get("locked_at") is not None:
    info["locked_at"] = _iso_utc(info["locked_at"])
```
✅ **Confirmado vivo.** Este supuesto **sí resistió** la verificación. Lo dejo documentado
porque la autocrítica debe reconocer también lo que estaba bien.

### ✅ Supuesto que SÍ resistió: `core/` es el namespace compartido correcto

Verifiqué que `core/` ya es el espacio compartido establecido (**70 imports** de
`core.database`, `core.timezone`, `core.audit`, `core.config`). Por tanto
`core/serialization.py` es la ubicación **correcta y consistente**. No inventé un namespace.

---

## 1. RESUMEN EJECUTIVO (REVISADO)

| # | Debilidad | Alcance real | Riesgo POS IA | Decisión Rev. 2 |
|---|---|---|---|---|
| D1 | `created_at` naive local | SISTÉMICO (`pos`, `network`, `cash`, `grandeza`, `orders`) | 🔴 Alto | **Corregir en serialización** (patrón `_iso_utc` vivo) |
| D2 | Acoplamiento `apps/pos/config` | 4 módulos + **violación de `window.location.hostname`** | 🟢 Bajo | **Corregir la violación**, no propagarla |
| D3 | Polling vs WebSocket | Solo Heladería | 🟢 Nulo | **Diferir** a Oleada 2 |
| D4 | `paid_at` siempre `None` | Solo Heladería (2 ocurrencias) | 🟡 Medio | **ELIMINADA de V18** — riesgo desproporcionado |
| D5 | Asistente de lotes eliminado | N/A | N/A | No hacer nada |

**Alcance final de V18: 18.1 + 18.2 + 18.5.** (18.3 eliminada, 18.4 diferida.)

---

## 2. PRINCIPIOS RECTORES (NO NEGOCIABLES)

1. **Barrera de No-Interferencia:** ningún cambio altera el comportamiento observable del POS IA.
2. **No propagar violaciones:** si un archivo viola las reglas, se **corrige**, no se **copia**.
3. **Proporcionalidad riesgo/beneficio:** no se toca la tabla `tickets` por un beneficio semántico.
4. **Verificar antes de afirmar:** todo supuesto del plan se comprueba contra el código.
5. **Verificación en cada fase:** vitest + pytest + build + smoke POS 200 + smoke SETTINGS 200.
6. **Reversibilidad:** cada fase es un commit atómico revertible.
7. **Documentación simultánea:** cada fase actualiza la documentación en el mismo commit.

---

## 3. FASE 18.1 — CONTRATO DE SERIALIZACIÓN UTC (D1)

### 3.1 Problema

[`heladeria/service.py:179`](apps/api/modules/heladeria/service.py:179) serializa
`created_at` con `.isoformat()` **sin sufijo `Z`**. El frontend compensa con
`computeElapsedSec` + `tzOffsetHours` — un parche frágil que la v12 del POS ya eliminó
para sus propias columnas.

### 3.2 Solución (reutiliza el patrón `_iso_utc` VIVO)

**Paso 1 — Crear `apps/api/core/serialization.py`:**
```python
"""
serialization.py — Contrato de serialización de datetimes naive (UTC).

v18 (Fase 18.1): extrae el patrón _iso_utc() que ya existía y está EN USO en
pos/router.py (v12 Fase 12.4, usado en la línea 306) a un módulo compartido,
para que Heladería lo reutilice sin duplicar lógica ni tocar el POS IA.

REGLA DE ORO: un datetime naive se asume UTC y SIEMPRE se serializa con sufijo 'Z'.
"""
from datetime import datetime


def iso_utc(dt: datetime | None) -> str | None:
    """Serializa un datetime naive (UTC) con sufijo 'Z' explícito.

    Si dt es None, devuelve None. Si ya trae zona ('Z' o '+'), lo respeta.
    """
    if dt is None:
        return None
    iso = dt.isoformat()
    if iso.endswith("Z") or "+" in iso:
        return iso
    return iso + "Z"
```

**Paso 2 — Usar en Heladería** ([`heladeria/service.py:179`](apps/api/modules/heladeria/service.py:179)):
```python
from core.serialization import iso_utc
...
created_at=iso_utc(ticket.created_at) or "",
```

**Paso 3 — Refactorizar `pos/router.py` para delegar** (ADITIVO, comportamiento idéntico):
```python
from core.serialization import iso_utc as _iso_utc  # v18: delega al helper compartido
```
> ⚠️ **CRÍTICO:** es un **re-export idéntico**. La salida del POS IA no cambia ni un byte.
> El uso en la línea 306 sigue funcionando sin modificación.

### 3.3 Impacto en el frontend

[`kdsUrgency.js:100`](apps/heladeria/utils/kdsUrgency.js:100) ya maneja ambos casos:
```javascript
const asUtcMs = Date.parse(raw.endsWith('Z') ? raw : raw + 'Z');
```
Con el backend enviando `Z`, la rama `endsWith('Z')` se activa. **No se rompe nada.**
`tzOffsetHours` queda como cinturón de seguridad para datos históricos sin `Z`.

### 3.4 Verificación
- [ ] `pytest` 50/50
- [ ] Test nuevo `test_heladeria_serialization.py`: `created_at` termina en `Z`
- [ ] Smoke POS: `GET /api/v1/pos/terminals/status` → 200, `locked_at` **idéntico** al anterior
- [ ] Smoke Heladería: `GET /api/v1/heladeria/kds/helados` → `created_at` termina en `Z`
- [ ] `docker restart rderico-api-dev` + `/api/v1/settings/` → 200

### 3.5 Commit
```
V18 Fase 18.1: contrato de serializacion UTC compartido (iso_utc) + Heladeria
```

---

## 4. FASE 18.2 — CORREGIR LA VIOLACIÓN DE `window.location.hostname` (D2)

### 4.1 Problema (reformulado tras autocrítica)

[`apps/pos/config.js:1`](apps/pos/config.js:1) usa `window.location.hostname` — **prohibido
por las reglas del proyecto**. Heladería, `hr` e `inventory` lo importan, **heredando la
violación**. La Rev. 1 proponía mover el archivo; eso **propagaba** la violación.

### 4.2 Solución (corregir, no copiar)

**Paso 1 — Crear `apps/shared/config.js` con la lógica CORRECTA:**
```javascript
/**
 * config.js — Fuente única de verdad para la URL del API.
 *
 * v18 (Fase 18.2): reemplaza el uso de window.location.hostname (PROHIBIDO) por
 * una variable de entorno de Vite, con fallback explícito. El POS IA conserva su
 * comportamiento actual vía re-export en apps/pos/config.js.
 */
const ENV_URL = import.meta.env?.VITE_API_BASE_URL;

export const CONFIG = {
    API_BASE_URL: ENV_URL || 'http://localhost:5001/api/v1',
    ITEMS_PER_PAGE: 12,
    TASA_IVA_MEXICO: 0.16
};
```
> ⚠️ **PUNTO DELICADO:** cambiar la resolución de URL **sí puede** alterar el POS IA en
> producción (IP de red vs localhost). Por eso el **Paso 2 es obligatorio** y el
> **Paso 3 es la red de seguridad**.

**Paso 2 — `apps/pos/config.js` conserva su lógica actual** (NO se toca su comportamiento):
```javascript
// v18 (Fase 18.2): se mantiene la lógica original para NO alterar el POS IA.
// Heladería/hr/inventory migran a apps/shared/config.js.
const hostname = window.location.hostname;
const isIP = /^\d+\.\d+\.\d+\.\d+$/.test(hostname);
const isLocal = hostname === 'localhost' || isIP;
let apiUrl;
if (isLocal) {
    apiUrl = `http://${hostname}:5001/api/v1`;
} else {
    const domainParts = hostname.split('.');
    domainParts[0] = 'api';
    apiUrl = `https://${domainParts.join('.')}/api/v1`;
}
export const CONFIG = { API_BASE_URL: apiUrl, ITEMS_PER_PAGE: 12, TASA_IVA_MEXICO: 0.16 };
```
> **Decisión honesta:** el POS IA **sigue con su lógica original**. No lo "corregimos"
> porque es intocable y su resolución de URL funciona en su entorno. La violación se
> **contiene** (no se propaga) y se corrige **solo en los módulos que migran**.

**Paso 3 — Migrar Heladería** (4 servicios) a `apps/shared/config`:
- [`heladeriaService.js:9`](apps/heladeria/services/heladeriaService.js:9)
- [`totemContentService.js:16`](apps/heladeria/services/totemContentService.js:16)
- [`heladeriaTerminals.js:19`](apps/heladeria/services/heladeriaTerminals.js:19)
- [`displayConfigService.js:16`](apps/heladeria/services/displayConfigService.js:16)

**Paso 4 — `hr` e `inventory`:** migrar en el **mismo commit** o diferir. Recomendado
diferir para mantener el commit pequeño y reversible.

### 4.3 Riesgo residual (declarado honestamente)

`apps/shared/config.js` usa `import.meta.env.VITE_API_BASE_URL`. Si esa variable **no está
definida** en el entorno de Heladería, caerá a `localhost:5001`, que **puede no ser la IP
correcta** en una tablet de la tienda. **Mitigación:** verificar el `.env` antes de migrar,
y si no existe la variable, **mantener el fallback con la lógica de hostname** (con un
comentario que documente la deuda) en lugar de romper la tienda.

> **Si esta verificación falla, la Fase 18.2 se DIFIERE.** No vale la pena arriesgar la
> operación de la tienda por una mejora arquitectónica.

### 4.4 Verificación
- [ ] `npx vitest run` → 293/293
- [ ] `npx vite build` → 1433 módulos (o +1)
- [ ] Smoke POS: `RetailVisionPOS.jsx` resuelve `CONFIG.API_BASE_URL` correctamente
- [ ] Smoke Heladería: los 4 servicios resuelven `CONFIG.API_BASE_URL`
- [ ] Verificar `.env` / `.env.example` para `VITE_API_BASE_URL`

### 4.5 Commit
```
V18 Fase 18.2: apps/shared/config sin window.location.hostname + migracion Heladeria
```

---

## 5. FASE 18.3 — `paid_at` — ❌ ELIMINADA DE V18

**Motivo:** solo 2 ocurrencias en todo `apps/api`, ambas en Heladería. El POS IA nunca lo
lee. Requeriría migración sobre `tickets` (la tabla más crítica) por un beneficio
**puramente semántico**. **Riesgo desproporcionado.**

**Acción:** documentar como deuda opcional en la sección de Oleada 2. Si se retoma, será
con su propio plan y su propia migración dedicada.

---

## 6. FASE 18.4 — WEBSOCKET KDS — DIFERIDA

Ya planificado en Oleada 2 (prioridad 🟢 Baja). El polling de 5 s es aceptable para 3–4
pantallas. Implementarlo ahora introduce infraestructura nueva con riesgo innecesario.

---

## 7. FASE 18.5 — DOCUMENTACIÓN Y CIERRE

- Actualizar [`DOCUMENTACION_MODULO_HELADERIA.md`](ESPECIFICACIONES%20DEL%20PROYECTO/DOCUMENTACION_MODULO_HELADERIA.md:1):
  - Sección **5.0** → añadir `core/serialization.py` como utilidad compartida.
  - **BUG 4** (nuevo): contrato de serialización UTC y por qué NO se migró la columna.
  - Tabla de convenciones de timestamps (UTC-aware vs naive).
- Actualizar [`DOCUMENTACION_MODULO_POS.md`](ESPECIFICACIONES%20DEL%20PROYECTO/DOCUMENTACION_MODULO_POS.md:1)
  con la nota del re-export de `_iso_utc` (aditivo).
- Commit + push.

---

## 8. MATRIZ DE RIESGO (REVISADA)

| Fase | Riesgo POS IA | Mitigación | Reversible |
|---|---|---|---|
| 18.1 | 🟢 Bajo | Re-export idéntico de `_iso_utc`; test de contrato | ✅ Sí |
| 18.2 | 🟡 **Medio** | POS conserva su lógica; verificar `.env` antes; **diferir si falla** | ✅ Sí |
| 18.3 | — | **ELIMINADA** | N/A |
| 18.4 | 🟢 Nulo | No se implementa | N/A |
| 18.5 | 🟢 Nulo | Solo docs | ✅ Sí |

> **Nota:** la Rev. 1 calificaba 18.2 como 🟢 Bajo. Tras la autocrítica, es **🟡 Medio**,
> porque cambiar la resolución de URL puede afectar la conectividad en producción.

---

## 9. ORDEN DE EJECUCIÓN RECOMENDADO

```
18.1 (serialización UTC)   ← MÁXIMO VALOR, MÍNIMO RIESGO
  ↓
18.5 (documentación)       ← CIERRE DE 18.1
  ↓
18.2 (corregir hostname)   ← SOLO SI el .env tiene VITE_API_BASE_URL
  ↓
18.3 (paid_at)             ← ELIMINADA
  ↓
18.4 (WebSocket)           ← DIFERIDA A OLEADA 2
```

**Recomendación final:** ejecutar **18.1 + 18.5** con confianza. Ejecutar **18.2** solo tras
verificar el `.env`. **18.3 y 18.4 fuera de V18.**

---

## 10. CHECKLIST DE VERIFICACIÓN FINAL (OBLIGATORIO)

- [ ] `npx vitest run` → **293/293** (o más)
- [ ] `npx vite build` → **1433 módulos** (o +1)
- [ ] `docker exec rderico-api-dev python -m pytest -q` → **50/50**
- [ ] `GET /api/v1/settings/` → **200**
- [ ] `GET /api/v1/pos/terminals/status` → **200** (POS IA intacto, `locked_at` con `Z`)
- [ ] `GET /api/v1/heladeria/kds/helados` → **200** con `created_at` terminando en `Z`
- [ ] `git status` → árbol limpio
- [ ] `git log origin/main..HEAD` → vacío (todo pusheado)
- [ ] Documentación actualizada en el mismo commit

---

## 11. LO QUE **NO** SE HARÁ (Y POR QUÉ)

| Tentación | Por qué NO |
|---|---|
| Migrar `pos/models.py` a `timezone=True` | Toca el POS IA + migración de alto riesgo sobre `tickets`. `_iso_utc` ya resuelve sin migrar. |
| **Mover `apps/pos/config.js` a `apps/shared/` tal cual** | **Propagaría la violación de `window.location.hostname` a 4 módulos.** (Corregido en Rev. 2.) |
| **Añadir columna `paid_at` a `tickets`** | **Riesgo desproporcionado:** solo Heladería lo lee, beneficio semántico. (Corregido en Rev. 2.) |
| Reescribir `_iso_utc` en `pos/router.py` | El POS IA es intocable. Solo se permite un re-export idéntico. |
| Implementar WebSocket ahora | Infraestructura nueva, riesgo innecesario, ya en Oleada 2. |
| Eliminar `tzOffsetHours` | Necesario para datos históricos sin `Z`. Es cinturón de seguridad. |
| Tocar `RetailVisionPOS.jsx` | **Restricción A. Prohibido.** |

---

## 12. LECCIONES DE LA AUTOCRÍTICA (para futuros planes)

1. **Verificar el contenido de un archivo antes de proponer moverlo.** Un nombre inocente
   (`config.js`) puede esconder una violación.
2. **Medir el beneficio contra el riesgo de cada migración.** Tocar `tickets` por un campo
   semántico es un mal negocio.
3. **Confirmar que un "patrón probado" está realmente en uso**, no solo definido.
4. **Reconocer lo que resistió la verificación**, no solo lo que falló.

---

**FIN DEL PLAN — V18 (Revisión 2)**
