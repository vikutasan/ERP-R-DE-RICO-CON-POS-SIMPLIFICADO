# 🛠️ PLAN DE REPARACIÓN — MÓDULO DE MONITOREO DE RED (v13)

**Fecha:** 13/Septiembre/2026
**Autor:** Auditoría técnica derivada de [`DOCUMENTACION_MODULO_MONITOREO_DE_RED.md`](../ESPECIFICACIONES%20DEL%20PROYECTO/DOCUMENTACION_MODULO_MONITOREO_DE_RED.md)
**Estado:** ⏳ PROPUESTO — pendiente de aprobación
**Alcance:** 3 áreas de mejora detectadas en la auditoría del módulo de red.

---

## 🚨 PROTOCOLO DE NO-INTERFERENCIA AL POS (OBLIGATORIO)

> **Este plan NO puede romper el POS. Punto.**
> El POS está en producción y cualquier regresión cuesta dinero real.

### Reglas de ejecución

1. **PROHIBIDO tocar** [`apps/pos/RetailVisionPOS.jsx`](../apps/pos/RetailVisionPOS.jsx) salvo la línea exacta indicada en la Fase 13.2 (y solo si es estrictamente necesario).
2. **PROHIBIDO tocar** [`apps/pos/hooks/useTerminalLocking.js`](../apps/pos/hooks/useTerminalLocking.js), [`apps/pos/hooks/useBeforeUnload.js`](../apps/pos/hooks/useBeforeUnload.js) y [`apps/pos/services/POSService.js`](../apps/pos/services/POSService.js) — son territorio sagrado del POS.
3. **PROHIBIDO** cambiar el comportamiento de `useNetworkHealth` en su contrato público (`{ status, latency }`). Solo se permite refactor interno.
4. **Cada fase es un commit independiente** y debe pasar la verificación completa antes de continuar.
5. **Si una fase falla la verificación, se revierte inmediatamente** (`git revert`) y se documenta el motivo.
6. **Ninguna fase se ejecuta en horario de operación del POS** (idealmente antes de abrir o después de cerrar).

### Verificación obligatoria por fase

```bash
# 1. Tests backend (deben seguir en 33/33)
cd apps/api && python -m pytest -q

# 2. Tests frontend (deben seguir en 120/120 o más)
npx vitest run

# 3. Build de producción (debe transformar sin errores)
npm run build

# 4. Arranque del POS (verificación manual)
#    - Abrir http://localhost:5000
#    - Seleccionar una terminal
#    - Agregar un producto al carrito
#    - Verificar que NO aparece banner falso "SIN CONEXIÓN"
```

---

## 📋 RESUMEN DE LAS 3 ÁREAS DE MEJORA

| # | Área | Severidad | Riesgo POS | Fase |
|---|---|---|---|---|
| 1 | Sin tests unitarios propios | 🟡 Media | 🟢 Nulo | 13.1 |
| 2 | `API_BASE` construido manualmente (bomba de tiempo) | 🔴 Alta | 🟢 Nulo | 13.2 |
| 3 | Offset de zona horaria hardcodeado | 🟡 Media | 🟢 Nulo | 13.3 |

**Orden de ejecución:** 13.1 → 13.2 → 13.3 (de menor a mayor riesgo, aunque todos son de riesgo nulo para el POS).

---

## FASE 13.1 — Extraer la lógica de clasificación a funciones puras + tests

### 🎯 Objetivo
Extraer la lógica de clasificación de estado de terminal y de severidad de incidentes
de [`NetworkMonitorUI.jsx`](../apps/network/NetworkMonitorUI.jsx) a un módulo de utilidades
puras, testeable con vitest — replicando el patrón exitoso de
[`terminalCardState.js`](../apps/pos/utils/terminalCardState.js) y
[`warehouseMappers.js`](../apps/inventory/utils/warehouseMappers.js).

### 📍 Evidencia del problema
- [`NetworkMonitorUI.jsx:84-101`](../apps/network/NetworkMonitorUI.jsx:84) — lógica de clasificación de terminal **inline** dentro del `useEffect`.
- [`NetworkMonitorUI.jsx:193-203`](../apps/network/NetworkMonitorUI.jsx:193) — clasificación de severidad **inline** dentro de `loadIncidents`.
- **Cero tests** para el módulo de red (a diferencia de Almacenes: 33 pytest + 120 vitest).

### 🔧 Cambios propuestos

**1. Crear `apps/network/utils/networkClassifiers.js`** (nuevo, puro, sin React):

```js
/**
 * Módulo: networkClassifiers.js
 * Funciones puras de clasificación para el módulo de Monitoreo de Red.
 * REGLA: NO importa React. Solo lógica determinista y testeable.
 */

export const TERMINAL_STATUS = {
    ONLINE: 'online',
    CASH_OPEN: 'cash_open',
    STALE: 'stale',
    IDLE: 'idle',
};

/**
 * Clasifica el estado de una terminal a partir de la info del backend.
 * @param {object|null} info - { occupier_id, stale_session, is_cash_register, operator_absent, locked_at }
 * @param {number} nowMs - Timestamp actual en ms (inyectable para tests)
 * @param {number} ttlMinutes - TTL del lock (default 25 = 20 TTL + 5 margen)
 * @returns {'online'|'cash_open'|'stale'|'idle'}
 */
export const classifyTerminalStatus = (info, nowMs = Date.now(), ttlMinutes = 25) => {
    const isOccupied = info && info.occupier_id;
    if (!isOccupied) return TERMINAL_STATUS.IDLE;
    if (info.stale_session) return TERMINAL_STATUS.STALE;
    if (info.is_cash_register && (info.operator_absent || !info.locked_at)) {
        return TERMINAL_STATUS.CASH_OPEN;
    }
    const safeDate = normalizeUtcString(info.locked_at);
    const lockAge = safeDate ? (nowMs - new Date(safeDate).getTime()) / 60000 : 999;
    return lockAge < ttlMinutes ? TERMINAL_STATUS.ONLINE : TERMINAL_STATUS.CASH_OPEN;
};

/**
 * Normaliza un timestamp sin sufijo de zona agregándole 'Z' (UTC).
 * v12 (Fase 12.4): parche defensivo de zona horaria.
 */
export const normalizeUtcString = (value) => {
    if (!value) return null;
    return (value.endsWith('Z') || value.includes('+')) ? value : value + 'Z';
};

/**
 * Clasifica la severidad de un evento de desconexión.
 * @param {object} evt - evento con { rawType, terminal, timestamp }
 * @param {Array} allEvents - lista completa (orden DESC)
 * @param {number} idx - índice del evento en la lista
 * @param {number} windowMs - ventana de reconexión (default 120000 = 2 min)
 * @returns {'normal'|'suspicious'}
 */
export const classifyDisconnectSeverity = (evt, allEvents, idx, windowMs = 120000) => {
    if (evt.rawType !== 'disconnect') return 'normal';
    const reconnect = allEvents.find((e, j) =>
        j < idx && e.terminal === evt.terminal && e.rawType === 'reconnect' &&
        Math.abs(e.timestamp - evt.timestamp) < windowMs
    );
    return reconnect ? 'normal' : 'suspicious';
};

/**
 * Calcula el resumen de fallas sospechosas por terminal.
 */
export const summarizeSuspiciousIncidents = (events) => {
    const summary = {};
    events.forEach(evt => {
        if (evt.rawType === 'disconnect' && evt.severity === 'suspicious') {
            summary[evt.terminal] = (summary[evt.terminal] || 0) + 1;
        }
    });
    return summary;
};
```

**2. Crear `apps/network/utils/networkClassifiers.test.js`** (nuevo, ~15 tests):

Casos a cubrir:
- `classifyTerminalStatus`: idle (sin occupier), stale, cash_open (operator_absent), cash_open (sin locked_at), online (lock reciente), cash_open (lock viejo > 25 min).
- `normalizeUtcString`: con 'Z', con '+', sin sufijo (agrega 'Z'), null.
- `classifyDisconnectSeverity`: disconnect con reconexión < 2 min → normal; disconnect sin reconexión → suspicious; reconnect → normal.
- `summarizeSuspiciousIncidents`: cuenta solo sospechosas; ignora normales y reconnects.

**3. Refactorizar `NetworkMonitorUI.jsx`** para consumir las funciones puras:
- Reemplazar el bloque inline de líneas 84-101 por `classifyTerminalStatus(info, now.getTime())`.
- Reemplazar el bloque inline de líneas 193-203 por `classifyDisconnectSeverity(...)`.
- Reemplazar el bloque inline de líneas 207-214 por `summarizeSuspiciousIncidents(classified)`.
- **Sin cambios visuales.** El comportamiento debe ser idéntico.

### ✅ Verificación de la Fase 13.1
- [ ] `npx vitest run` → 120 + ~15 = **~135 tests OK**.
- [ ] `npm run build` → transforma sin errores.
- [ ] El dashboard muestra los mismos estados que antes (comparación visual).
- [ ] `cd apps/api && python -m pytest -q` → **33/33** (no se tocó backend).

### ⚠️ Riesgo POS: 🟢 NULO
Solo se toca `apps/network/`. El POS no importa nada de ahí.

---

## FASE 13.2 — Migrar `API_BASE` a `CONFIG.API_BASE_URL`

### 🎯 Objetivo
Eliminar la construcción manual de URL en el dashboard de red, que replica el
patrón exacto del **Incidente 16.6** (falso banner "SIN CONEXIÓN").

### 📍 Evidencia del problema
[`NetworkMonitorUI.jsx:10-14`](../apps/network/NetworkMonitorUI.jsx:10):
```js
const API_BASE = (() => {
    const host = window.location.hostname;
    const port = '5001';
    return `http://${host}:${port}/api/v1`;
})();
```

**Por qué es una bomba de tiempo:**
- Si alguien accede al dashboard vía internet (`reparto.rdericotoluca.com`),
  el host `reparto.rdericotoluca.com:5001` **no existe** → todo el dashboard falla.
- Es **exactamente** el mismo error que causó el Incidente 16.6 en el POS.
- [`config.js`](../apps/pos/config.js:1) ya resuelve esto correctamente (detecta IP vs dominio).

### 🔧 Cambios propuestos

**1. Modificar `NetworkMonitorUI.jsx`** (líneas 1-14):

```js
import React, { useState, useEffect, useRef } from 'react';
import { CONFIG } from '../pos/config';

/**
 * Módulo: Monitoreo de Red
 * Dashboard de salud de red para el ERP R de Rico.
 * ...
 */

// v13 (Fase 13.2): usar la config central (Incidente 16.6).
// PROHIBIDO construir URLs con window.location.hostname.
const API_BASE = CONFIG.API_BASE_URL;
```

**2. Verificar que no queden otras construcciones manuales** en el archivo:
```bash
findstr /n "window.location.hostname" "apps\network\NetworkMonitorUI.jsx"
# Debe devolver 0 resultados
```

### ✅ Verificación de la Fase 13.2
- [ ] `findstr` no encuentra `window.location.hostname` en el archivo.
- [ ] `npm run build` → transforma sin errores.
- [ ] El dashboard carga y muestra latencia real (no `--`).
- [ ] El dashboard muestra las 6 terminales con su estado.
- [ ] `npx vitest run` → sin regresiones.

### ⚠️ Riesgo POS: 🟢 NULO
`config.js` es **solo lectura** desde el dashboard. No se modifica `config.js`
ni ningún archivo del POS.

> **Nota:** este cambio **sí** altera el comportamiento del dashboard si se accede
> vía dominio (ahora funcionará en vez de fallar). Eso es una **mejora**, no una regresión.

---

## FASE 13.3 — Hacer configurable el offset de zona horaria

### 🎯 Objetivo
Eliminar el `tz_offset_hours = 6` hardcodeado en el router de red, reemplazándolo
por un setting configurable desde la BD (con fallback a 6).

### 📍 Evidencia del problema
[`router.py:41`](../apps/api/modules/network/router.py:41) y [`router.py:72`](../apps/api/modules/network/router.py:72):
```python
tz_offset_hours = 6  # CST (Centro de México)
```

**Por qué es frágil:**
- Si el negocio operara en otro huso horario, habría que tocar código.
- México **eliminó el horario de verano en 2022**, pero si se reinstaurara, el offset
  cambiaría estacionalmente.
- El valor está duplicado en dos endpoints (`list_incidents` y `incidents_summary`).

### 🔧 Cambios propuestos

**1. Agregar el setting en `apps/api/modules/settings/service.py`** (en `seed_settings`):

```python
# v13 (Fase 13.3): offset de zona horaria configurable para el módulo de red.
{"key": "network_tz_offset_hours", "value": "6", "description": "Offset UTC para conversión de fechas locales (CST = 6)"},
```

**2. Crear un helper en `apps/api/modules/network/router.py`:**

```python
async def _get_tz_offset(db: AsyncSession) -> int:
    """v13 (Fase 13.3): offset de zona horaria configurable (default 6 = CST)."""
    try:
        from modules.settings.service import get_setting_by_key
        setting = await get_setting_by_key(db, "network_tz_offset_hours")
        if setting and setting.value:
            return int(setting.value)
    except Exception:
        pass
    return 6  # Fallback seguro: CST
```

**3. Reemplazar los dos usos hardcodeados:**

```python
# Antes:
tz_offset_hours = 6  # CST (Centro de México)

# Después:
tz_offset_hours = await _get_tz_offset(db)
```

Aplicar en `list_incidents` (línea 41) y `incidents_summary` (línea 72).

**4. Agregar test en `apps/api/tests/`** (nuevo archivo `test_network_tz.py`):
- Verificar que `_get_tz_offset` devuelve 6 cuando no hay setting.
- Verificar que devuelve el valor del setting cuando existe.
- Verificar que el rango `[start, end)` se calcula correctamente.

### ✅ Verificación de la Fase 13.3
- [ ] `cd apps/api && python -m pytest -q` → 33 + ~3 = **~36 tests OK**.
- [ ] `curl "http://localhost:5001/api/v1/network/incidents?date=2026-09-13"` → devuelve incidentes del día correcto.
- [ ] `npx vitest run` → sin regresiones.
- [ ] `npm run build` → sin errores.

### ⚠️ Riesgo POS: 🟢 NULO
Solo se toca el módulo `network` del backend. El POS no consume estos endpoints.

---

## 📊 ORDEN DE EJECUCIÓN Y COMMITS

| Fase | Commit esperado | Archivos |
|---|---|---|
| 13.1 | `test(network): extraer clasificadores puros + tests vitest` | `networkClassifiers.js` (nuevo), `networkClassifiers.test.js` (nuevo), `NetworkMonitorUI.jsx` |
| 13.2 | `fix(network): usar CONFIG.API_BASE_URL (Incidente 16.6)` | `NetworkMonitorUI.jsx` |
| 13.3 | `feat(network): offset de zona horaria configurable` | `router.py`, `settings/service.py`, `test_network_tz.py` (nuevo) |

**Cada commit se pushea individualmente** a `origin/main` tras verificar.

---

## 🎯 CRITERIOS DE ACEPTACIÓN GLOBALES

Al terminar las 3 fases:

- [ ] **pytest:** 33 → ~36 tests, todos OK.
- [ ] **vitest:** 120 → ~135 tests, todos OK.
- [ ] **build:** transforma sin errores.
- [ ] **Cero** `window.location.hostname` en `apps/network/`.
- [ ] **Cero** offsets de zona horaria hardcodeados en `apps/api/modules/network/`.
- [ ] **El POS funciona idéntico** (verificación manual: seleccionar terminal, agregar producto, sin banner falso).
- [ ] Documentación actualizada: sección 13 "Pendientes" de
  [`DOCUMENTACION_MODULO_MONITOREO_DE_RED.md`](../ESPECIFICACIONES%20DEL%20PROYECTO/DOCUMENTACION_MODULO_MONITOREO_DE_RED.md)
  marcada como resuelta.

---

## 🔄 PROTOCOLO DE REVERSIÓN

Si cualquier fase rompe algo:

```bash
# Revertir el último commit
git revert HEAD --no-edit
git push origin main

# Verificar que el POS sigue funcionando
# (abrir http://localhost:5000 y probar el flujo básico)
```

**Regla:** ante la duda, revertir. El POS nunca se queda roto.

---

## 📝 NOTAS DE DISEÑO

1. **¿Por qué extraer clasificadores y no testear el componente completo?**
   Porque testear componentes React con timers y fetch es frágil. Las funciones puras
   son deterministas, rápidas y no requieren mocks complejos. Es el mismo patrón que
   ya funcionó en Almacenes (`warehouseMappers.js`) y POS (`terminalCardState.js`).

2. **¿Por qué `CONFIG.API_BASE_URL` y no una variable de entorno?**
   Porque `config.js` ya resuelve la lógica IP-vs-dominio y es la fuente de verdad
   establecida en el Incidente 16.6. Duplicar esa lógica sería crear una segunda
   fuente de verdad (anti-patrón).

3. **¿Por qué el offset en BD y no en `.env`?**
   Porque el resto de la configuración operativa (TTL de locks, intervalos de polling)
   ya vive en la tabla `system_settings`. Mantener la consistencia es más importante
   que la pureza de las variables de entorno.

---

## ✅ CHECKLIST DE APROBACIÓN

Antes de ejecutar, confirmar:

- [ ] El plan respeta el protocolo de no-interferencia al POS.
- [ ] Cada fase es reversible de forma independiente.
- [ ] La verificación es objetiva (tests + build + manual).
- [ ] El orden de ejecución minimiza el riesgo.

**Una vez aprobado:** ejecutar Fase 13.1 → verificar → commit → push → Fase 13.2 → ...
