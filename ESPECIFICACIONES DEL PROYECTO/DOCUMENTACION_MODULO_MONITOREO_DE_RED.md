# 📡 DOCUMENTACIÓN MAESTRA: MÓDULO DE MONITOREO DE RED — R de Rico ERP

> ⚠️ **LECTURA OBLIGATORIA** antes de tocar cualquier archivo de este módulo.
> Este documento describe la utilidad, la arquitectura, el diseño y las reglas de oro
> del sistema de vigilancia de red. Cualquier cambio que rompa las **Reglas de Oro**
> (sección 9) se considera una regresión crítica.

**Última actualización:** 13/Septiembre/2026 (v13 — clasificadores puros + tests, `CONFIG.API_BASE_URL`, offset TZ configurable)
**Archivos gobernados:**
- [`apps/network/NetworkMonitorUI.jsx`](../../apps/network/NetworkMonitorUI.jsx) — Dashboard (componente React)
- [`apps/network/utils/networkClassifiers.js`](../../apps/network/utils/networkClassifiers.js) — Clasificadores puros (v13)
- [`apps/network/utils/networkClassifiers.test.js`](../../apps/network/utils/networkClassifiers.test.js) — Tests vitest (v13)
- [`apps/pos/services/networkMonitor.js`](../../apps/pos/services/networkMonitor.js) — Monitor de conectividad (servicio puro)
- [`apps/pos/hooks/useNetworkHealth.js`](../../apps/pos/hooks/useNetworkHealth.js) — Hook de latencia + reporte de incidentes
- [`apps/api/modules/network/models.py`](../../apps/api/modules/network/models.py) — Modelo `NetworkIncident`
- [`apps/api/modules/network/schemas.py`](../../apps/api/modules/network/schemas.py) — Contratos Pydantic
- [`apps/api/modules/network/router.py`](../../apps/api/modules/network/router.py) — Endpoints REST
- [`apps/api/tests/test_network_tz.py`](../../apps/api/tests/test_network_tz.py) — Tests pytest del offset TZ (v13)

---

## 1. PROPÓSITO DEL MÓDULO

El módulo de **Monitoreo de Red** es el sistema nervioso de vigilancia de la infraestructura
LAN del ERP. Su misión es responder, en tiempo real, a tres preguntas operativas:

1. **¿El servidor API está vivo y qué tan rápido responde?** (latencia en milisegundos)
2. **¿Qué terminales están ocupadas, por quién, y desde cuándo?** (estado por terminal)
3. **¿Hubo caídas de red hoy, y fueron fallas reales o simples salidas ordenadas?** (historial de incidentes)

### Capacidades

| Capacidad | Descripción | Archivo responsable |
|---|---|---|
| **Ping de servidor** | Mide latencia contra `/settings` cada 10 s con timeout de 5 s | `NetworkMonitorUI.jsx` (`pingServer`) |
| **Estado por terminal** | Consulta `/pos/terminals/status` cada 5 s y clasifica 6 estados | `NetworkMonitorUI.jsx` (`fetchTerminals`) |
| **Historial de incidentes** | Carga incidentes por fecha desde BD y los clasifica (normal vs sospechoso) | `NetworkMonitorUI.jsx` (`loadIncidents`) |
| **Detección de conectividad real** | Doble verificación: eventos nativos + heartbeat cada 30 s | `networkMonitor.js` |
| **Semáforo de salud** | Estado `good` / `slow` / `down` con anti-falsos-positivos | `useNetworkHealth.js` |
| **Persistencia de incidentes** | Guarda cada desconexión/reconexión en `network_incidents` | `router.py` (`POST /incidents`) |

### Principio de No-Interferencia

> **El monitoreo es 100 % pasivo respecto al POS.**
> Ningún componente de este módulo modifica el carrito, los folios, los locks de terminal
> ni el estado de sesión. Observa y reporta; jamás interviene.
> Esta es la misma filosofía que rige el módulo de Almacenes (ver
> [`DOCUMENTACION_MODULO_GESTION_DE_ALMACENES.md`](DOCUMENTACION_MODULO_GESTION_DE_ALMACENES.md:73)).

---

## 2. ARQUITECTURA

### 2.1 Diagrama de Flujo

```
┌──────────────────────────────────────────────────────────────────────────┐
│                          NAVEGADOR (Dashboard)                            │
│                                                                           │
│   ┌─────────────────────────┐        ┌──────────────────────────────┐    │
│   │  NetworkMonitorUI.jsx   │        │  useNetworkHealth.js (POS)   │    │
│   │  (Dashboard de red)     │        │  (Hook pasivo del POS)       │    │
│   │                         │        │                              │    │
│   │  • pingServer   (10 s)  │        │  • checkHealth   (15 s)      │    │
│   │  • fetchTerminals (5 s) │        │  • reporta incidentes        │    │
│   │  • loadIncidents (fecha)│        │                              │    │
│   └───────────┬─────────────┘        └──────────────┬───────────────┘    │
│               │                                     │                    │
│               │  fetch()                            │  fetch()           │
│               ▼                                     ▼                    │
│   ┌──────────────────────────────────────────────────────────────────┐   │
│   │              networkMonitor.js (servicio puro, sin React)         │   │
│   │  • eventos nativos online/offline                                 │   │
│   │  • heartbeat cada 30 s → /health (timeout 5 s)                    │   │
│   └──────────────────────────────┬───────────────────────────────────┘   │
└──────────────────────────────────┼───────────────────────────────────────┘
                                   │ HTTP
                                   ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                        API FASTAPI (puerto 5001 host)                     │
│                                                                           │
│   GET  /api/v1/settings              → ping de latencia                   │
│   GET  /api/v1/pos/terminals/status  → estado de terminales (POS)         │
│   POST /api/v1/network/incidents     → registrar incidente                │
│   GET  /api/v1/network/incidents     → listar incidentes por fecha        │
│   GET  /api/v1/network/incidents/summary → resumen agregado               │
│                                                                           │
│   ┌──────────────────────────────────────────────────────────────────┐   │
│   │  modules/network/router.py  →  models.NetworkIncident             │   │
│   └──────────────────────────────┬───────────────────────────────────┘   │
└──────────────────────────────────┼───────────────────────────────────────┘
                                   │ SQLAlchemy async
                                   ▼
                        ┌────────────────────────┐
                        │  PostgreSQL 15         │
                        │  tabla: network_incidents │
                        └────────────────────────┘
```

### 2.2 Tres Capas Independientes

El módulo se compone de **tres piezas desacopladas** que pueden usarse por separado:

| Capa | Archivo | Depende de React | Responsabilidad |
|---|---|---|---|
| **Servicio puro** | `networkMonitor.js` | ❌ No | Detección de conectividad real (eventos + heartbeat) |
| **Hook** | `useNetworkHealth.js` | ✅ Sí | Latencia + reporte de incidentes al backend |
| **Dashboard** | `NetworkMonitorUI.jsx` | ✅ Sí | Visualización completa del estado de la red |

> **Regla de diseño:** `networkMonitor.js` **NO importa React ni dependencias externas**.
> Es un módulo puro y testeable que puede ejecutarse en cualquier contexto JS.

---

## 3. MODELO DE DATOS

### 3.1 Tabla `network_incidents`

Definida en [`apps/api/modules/network/models.py`](../../apps/api/modules/network/models.py:5).

| Columna | Tipo | Nulo | Índice | Descripción |
|---|---|---|---|---|
| `id` | Integer | No | PK | Identificador autoincremental |
| `terminal_id` | String | No | ✅ | Terminal afectada (`T6`, `T5`, `T4`, `T3`, `T2`, `CAJA`) |
| `incident_type` | String | No | — | `disconnect` \| `slow` \| `reconnect` |
| `user_logged` | String | Sí | — | Nombre del usuario involucrado (o `null`) |
| `details` | String | Sí | — | Descripción legible del incidente |
| `created_at` | DateTime | No | ✅ | Marca temporal (UTC, `datetime.now`) |

### 3.2 Tipos de Incidente

| `incident_type` | Origen | Significado |
|---|---|---|
| `disconnect` | `useNetworkHealth` (status → `down`) o `NetworkMonitorUI` (pérdida de ocupación) | Pérdida de conexión con sesión ocupada |
| `slow` | `useNetworkHealth` (status → `slow`) | Latencia elevada (> 500 ms) |
| `reconnect` | `useNetworkHealth` (status → `good`) o `NetworkMonitorUI` (nueva ocupación) | Recuperación de conexión |

### 3.3 Clasificación de Severidad (Frontend)

La severidad **no se guarda en BD**; se calcula en el cliente al cargar el historial
(ver [`NetworkMonitorUI.jsx:193-203`](../../apps/network/NetworkMonitorUI.jsx:193)):

```
Desconexión → ¿Hubo reconexión en la MISMA terminal dentro de 2 minutos?
   ├── SÍ → severity = 'normal'      (salida ordenada, NO cuenta como falla)
   └── NO → severity = 'suspicious'  (falla real de red, SÍ cuenta como falla)
```

> **Nota de diseño:** los eventos llegan en orden **DESC** (más reciente primero),
> por lo que la reconexión se busca en índices **menores** (`j < idx`).

---

## 4. API ENDPOINTS

Todos los endpoints se montan bajo el prefijo `/api/v1/network`
(ver [`main.py:312`](../../apps/api/main.py:312)).

### 4.1 `POST /api/v1/network/incidents`

Registra un incidente de red.

**Body:**
```json
{
  "terminal_id": "T2",
  "incident_type": "disconnect",
  "user_logged": "Alfa",
  "details": "Terminal desconectada — sesión perdida"
}
```

**Respuesta:** `NetworkIncidentResponse` (el incidente creado, con `id` y `created_at`).

### 4.2 `GET /api/v1/network/incidents`

Lista incidentes de un día.

| Query param | Tipo | Default | Descripción |
|---|---|---|---|
| `date` | `YYYY-MM-DD` | hoy | Fecha local (CST) a consultar |
| `terminal` | String | — | Filtrar por terminal específica |
| `limit` | int (≤ 500) | 200 | Máximo de resultados |

**Respuesta:** `List[NetworkIncidentResponse]` ordenada por `created_at DESC`.

### 4.3 `GET /api/v1/network/incidents/summary`

Resumen agregado por terminal y tipo.

**Respuesta:**
```json
{
  "date": "2026-09-13",
  "terminals": {
    "T2": { "disconnects": 3, "slow": 1, "reconnects": 2 }
  }
}
```

### 4.4 Conversión de Zona Horaria (CRÍTICO)

El servidor guarda timestamps en **UTC**, pero el usuario selecciona fechas en
**hora local CST (UTC-6)**. El router aplica un offset explícito
(ver [`router.py:39-43`](../../apps/api/modules/network/router.py:39)):

```python
tz_offset_hours = 6  # CST (Centro de México)
start = target.replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(hours=tz_offset_hours)
end = start + timedelta(days=1)
```

> **Ejemplo:** "13 de Septiembre" en México = `13 Sep 06:00 UTC` → `14 Sep 06:00 UTC`.
> Sin este offset, los incidentes de la tarde/noche aparecerían en el día equivocado.

---

## 5. DISEÑO DEL DASHBOARD (`NetworkMonitorUI.jsx`)

### 5.1 Estructura del Componente

| Bloque | Líneas | Descripción |
|---|---|---|
| `API_BASE` | 10-14 | Construcción de la URL base del API |
| `TERMINALS` | 16 | Lista fija: `['T6','T5','T4','T3','T2','CAJA']` |
| `STATUS_CONFIG` | 18-25 | Mapa de 6 estados → color, fondo, borde, etiqueta, icono |
| `getLocalDateString` | 29-34 | Fecha local `YYYY-MM-DD` (evita desfase UTC) |
| `pingServer` | 49-64 | Ping a `/settings` cada 10 s |
| `fetchTerminals` | 72-165 | Estado de terminales cada 5 s + detección de cambios |
| `loadIncidents` | 172-216 | Carga y clasifica incidentes por fecha |
| `formatUptime` | 225-232 | Formatea el uptime del dashboard `HH:MM:SS` |

### 5.2 Los 6 Estados de Terminal (`STATUS_CONFIG`)

| Estado | Color | Etiqueta | Significado |
|---|---|---|---|
| `online` | 🟢 Verde | EN LÍNEA | Terminal activa, lock reciente (< 25 min) |
| `cash_open` | 🟡 Ámbar | CAJA ABIERTA | Sesión protegida sin corte de caja |
| `stale` | 🔴 Rojo | SESIÓN EXPIRADA | Sesión marcada como obsoleta por el backend |
| `slow` | 🟡 Amarillo | RED LENTA | Latencia > 500 ms |
| `offline` | 🔴 Rojo | SIN CONEXIÓN | Sin respuesta del servidor |
| `idle` | ⚫ Gris | DISPONIBLE | Terminal vacía, lista para usarse |

### 5.3 Lógica de Clasificación de Terminal

```
¿info.occupier_id existe?
   ├── NO  → 'idle' (DISPONIBLE)
   └── SÍ  → ¿stale_session?
              ├── SÍ → 'stale'
              └── NO → ¿is_cash_register && (operator_absent || !locked_at)?
                         ├── SÍ → 'cash_open'
                         └── NO → ¿lockAge < 25 min?
                                    ├── SÍ → 'online'
                                    └── NO → 'cash_open'
```

> **Umbral de 25 min** = TTL del lock (20 min) + 5 min de margen.
> Ver setting `pos_terminal_lock_ttl_m`.

### 5.4 Layout Visual

```
┌─────────────────────────────────────────────────────────────────┐
│  MONITOREO DE RED                                                │
│  Estado en tiempo real de la infraestructura LAN                 │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │
│  │ Servidor API │  │ Terminales   │  │ Latencia     │           │
│  │ ● EN LÍNEA   │  │ Activas 4/6  │  │ 23ms  [i]    │           │
│  └──────────────┘  └──────────────┘  └──────────────┘           │
├─────────────────────────────────────────────────────────────────┤
│  ESTADO POR TERMINAL              [fecha] [Hoy]  N eventos       │
│  ┌────┐┌────┐┌────┐┌────┐┌────┐┌────┐                            │
│  │ T6 ││ T5 ││ T4 ││ T3 ││ T2 ││CAJA│  ← tarjetas de estado     │
│  └────┘└────┘└────┘└────┘└────┘└────┘                            │
│  ┌────┐┌────┐┌────┐┌────┐┌────┐┌────┐                            │
│  │ 0  ││ 1  ││ 0  ││ 2  ││ 3  ││ 0  │  ← contadores de fallas   │
│  └────┘└────┘└────┘└────┘└────┘└────┘                            │
│  ┌────┐┌────┐┌────┐┌────┐┌────┐┌────┐                            │
│  │hist││hist││hist││hist││hist││hist│  ← historial por terminal │
│  └────┘└────┘└────┘└────┘└────┘└────┘                            │
└─────────────────────────────────────────────────────────────────┘
```

### 5.5 Guía de Diagnóstico (Modal `[i]`)

El dashboard incluye un modal educativo que explica los colores:

**Latencia del servidor:**
- 🟢 **Verde — < 50 ms:** Conexión normal.
- 🟡 **Amarillo — 50-100 ms:** Red lenta (tráfico o cables en mal estado).
- 🔴 **Rojo — > 100 ms o sin respuesta:** Problema serio (revisar RJ-45, switch, Docker).

**Historial de eventos:**
- 🟢 **Verde:** Conexión (el usuario entró).
- 🔵 **Azul:** Desconexión normal (salida ordenada, NO es falla).
- 🔴 **Rojo:** Desconexión sospechosa sin reconexión (SÍ es falla).

---

## 6. DISEÑO DEL SERVICIO PURO (`networkMonitor.js`)

### 6.1 Estrategia de Doble Verificación

El navegador reporta "conectado a WiFi" aunque no haya internet real. Este servicio
resuelve ese falso positivo con **dos capas**:

1. **Eventos nativos** (`online` / `offline`): detección instantánea.
2. **Heartbeat cada 30 s** a `/health` con timeout de 5 s: verificación real.

```js
const HEARTBEAT_INTERVAL_MS = 30000; // 30 segundos
const HEARTBEAT_TIMEOUT_MS = 5000;   // Si no responde en 5s, está offline
```

### 6.2 API Pública

```js
const monitor = createNetworkMonitor('http://192.168.1.117:5001');
monitor.onStatusChange((isOnline) => { /* ... */ });
monitor.isOnline();   // estado actual
monitor.checkNow();   // forzar heartbeat inmediato
monitor.destroy();    // limpiar listeners y timers (al desmontar)
```

> **Regla:** siempre llamar `destroy()` al desmontar el componente para evitar
> timers huérfanos y memory leaks.

---

## 7. DISEÑO DEL HOOK (`useNetworkHealth.js`)

### 7.1 Semáforo con Anti-Falsos-Positivos

El hook mide latencia cada 15 s y clasifica el estado en `good` / `slow` / `down`.
**Un solo paquete perdido NO marca `down`** — requiere **2 fallos consecutivos**
(ver [`useNetworkHealth.js:39-45`](../../apps/pos/hooks/useNetworkHealth.js:39)):

```js
if (failCountRef.current >= 2) {
    setStatus('down');
} else if (failCountRef.current === 1) {
    setStatus('slow');
}
```

### 7.2 Reporte Automático de Incidentes

Cuando el estado cambia, el hook reporta al backend:

| Transición | `incident_type` reportado |
|---|---|
| `good` → `down` | `disconnect` |
| `good` → `slow` | `slow` |
| `down`/`slow` → `good` | `reconnect` |

> **Regla:** el hook es **completamente pasivo** para el POS. No modifica ningún
> estado existente; solo observa y reporta.

---

## 8. EL CEMENTERIO DE BUGS

### 🐛 BUG 1: Falso Banner "SIN CONEXIÓN" (Incidente 16.6 — 12/Julio/2026)

**Síntoma:** El POS mostraba un banner rojo "SIN CONEXIÓN" aunque la red funcionaba
perfectamente. Los usuarios entraban en pánico y reiniciaban equipos innecesariamente.

**Causa Raíz:** `networkMonitor.js` construía la URL del heartbeat **manualmente**:

```js
// ❌ INCORRECTO — falla cuando se accede vía internet
const url = `http://${window.location.hostname}:5001/health`;
```

Cuando el sistema se accedía desde internet (`reparto.rdericotoluca.com:5001`),
ese host **no existe** → el heartbeat fallaba → falso "SIN CONEXIÓN".

**Solución:** usar siempre `CONFIG.API_BASE_URL` como única fuente de verdad:

```js
// ✅ CORRECTO
const apiHost = CONFIG.API_BASE_URL.replace(/\/api\/v1$/, '');
```

**Regla de Oro:** **PROHIBIDO** construir URLs manualmente con `window.location.hostname`.
`config.js` (`CONFIG.API_BASE_URL`) es la **única** fuente de verdad para URLs del API.

---

### 🐛 BUG 2: Efecto Estrobo (Incidente 16.1)

**Síntoma:** La interfaz parpadeaba violentamente ("efecto estrobo") durante las
transiciones de zona horaria. Los indicadores de red se re-renderizaban sin control.

**Causa Raíz:** `useTerminalLocking` (polling 5 s) y `useNetworkHealth` (polling 15 s)
reaccionaban a los cambios de zona horaria, disparando re-renders en cascada.
Además, se usaban animaciones CSS infinitas (`animate-pulse`) sobre indicadores
estáticos que dependían del estado de red.

**Solución:**
1. Eliminar animaciones infinitas sobre indicadores que dependen de polling.
2. Estabilizar las dependencias de los `useEffect` para evitar re-suscripciones.

**Regla de Oro:** **PROHIBIDO** usar animaciones CSS infinitas (`animate-pulse`)
sobre indicadores estáticos que dependen del estado de red o de polling.

---

### 🐛 BUG 3: Incidentes en el Día Equivocado (v12 — 13/Septiembre/2026)

**Síntoma:** Los incidentes ocurridos por la tarde/noche aparecían registrados en el
día siguiente al consultar el historial por fecha.

**Causa Raíz:** El backend guarda timestamps en **UTC**, pero el usuario selecciona
fechas en **hora local CST (UTC-6)**. Sin conversión, "13 de Septiembre 20:00 CST"
(= `14 Sep 02:00 UTC`) se contaba como del día 14.

**Solución (v12):** El router aplica un offset explícito de 6 horas al calcular el
rango `[start, end)` del día consultado (ver [`router.py:39-43`](../../apps/api/modules/network/router.py:39)).
Adicionalmente, el frontend aplica un **parche defensivo** al parsear `locked_at`
(ver [`NetworkMonitorUI.jsx:94-95`](../../apps/network/NetworkMonitorUI.jsx:94)):

```js
// v12 (Fase 12.4): la API ya normaliza con 'Z'; parche defensivo.
const safeDate = (info.locked_at.endsWith('Z') || info.locked_at.includes('+'))
    ? info.locked_at
    : info.locked_at + 'Z';
```

**Regla de Oro:** **Store UTC, Display Local.** Toda fecha mostrada al usuario debe
convertirse explícitamente a hora local (CST = UTC-6). Nunca asumir que el navegador
interpretará correctamente un timestamp sin sufijo de zona.

---

## 9. REGLAS DE ORO

1. **`config.js` es la única fuente de verdad de URLs.** PROHIBIDO construir URLs
   con `window.location.hostname`. (Bug 1)
2. **PROHIBIDO animaciones CSS infinitas** sobre indicadores que dependen de red/polling. (Bug 2)
3. **Store UTC, Display Local.** Toda fecha se convierte explícitamente a CST (UTC-6). (Bug 3)
4. **El monitoreo es 100 % pasivo.** Nunca modifica carrito, folios, locks ni sesión.
5. **`networkMonitor.js` NO importa React.** Es un módulo puro y testeable.
6. **Siempre llamar `destroy()`** al desmontar para evitar timers huérfanos.
7. **Anti-falsos-positivos:** `down` requiere 2 fallos consecutivos, no uno.
8. **Desconexión normal ≠ falla.** Solo las desconexiones sin reconexión en < 2 min
   cuentan como fallas reales.

---

## 10. ARCHIVOS CRÍTICOS

| Archivo | Criticidad | Motivo |
|---|---|---|
| [`apps/network/NetworkMonitorUI.jsx`](../../apps/network/NetworkMonitorUI.jsx) | 🔴 Alta | Dashboard completo; contiene la lógica de clasificación |
| [`apps/pos/services/networkMonitor.js`](../../apps/pos/services/networkMonitor.js) | 🔴 Alta | Detección de conectividad; origen del Bug 1 |
| [`apps/pos/hooks/useNetworkHealth.js`](../../apps/pos/hooks/useNetworkHealth.js) | 🟡 Media | Reporte de incidentes; origen del Bug 2 |
| [`apps/api/modules/network/router.py`](../../apps/api/modules/network/router.py) | 🔴 Alta | Conversión de zona horaria (Bug 3) |
| [`apps/api/modules/network/models.py`](../../apps/api/modules/network/models.py) | 🟡 Media | Esquema de `network_incidents` |

---

## 11. INTEGRACIÓN CON OTROS MÓDULOS

### 11.1 Con POS

- Consume `GET /pos/terminals/status` para el estado de terminales.
- `useNetworkHealth` corre dentro del POS pero es **pasivo**.
- Ver [`DOCUMENTACION_MODULO_POS.md`](DOCUMENTACION_MODULO_POS.md) para el contrato de locks.

### 11.2 Con Almacenes

- `WarehouseManagerUI.jsx` usa `createWarehouseNetworkMonitor` (variante del servicio)
  para detectar reconexión y sincronizar la cola offline.
- Ver [`DOCUMENTACION_MODULO_GESTION_DE_ALMACENES.md`](DOCUMENTACION_MODULO_GESTION_DE_ALMACENES.md:323)
  (sección Outbox Pattern).

### 11.3 Con Auditoría

- Los incidentes de red son evidencia operativa complementaria a la auditoría de
  operaciones sensibles.
- Ver [`DOCUMENTACION_MODULO_AUDITORIA_Y_CONTROL.md`](DOCUMENTACION_MODULO_AUDITORIA_Y_CONTROL.md).

---

## 12. VERIFICACIÓN

### 12.1 Endpoints

```bash
# Ping de latencia
curl http://localhost:5001/api/v1/settings

# Estado de terminales
curl http://localhost:5001/api/v1/pos/terminals/status

# Incidentes de hoy
curl "http://localhost:5001/api/v1/network/incidents?date=2026-09-13&limit=50"

# Resumen del día
curl "http://localhost:5001/api/v1/network/incidents/summary?date=2026-09-13"
```

### 12.2 Checklist de Regresión

- [ ] El dashboard carga sin errores en consola.
- [ ] El KPI "Servidor API" muestra latencia real (no `--`).
- [ ] Las 6 terminales aparecen con su estado correcto.
- [ ] El historial muestra incidentes del día seleccionado (no del día siguiente).
- [ ] El modal `[i]` abre y explica los colores.
- [ ] Al acceder vía internet, NO aparece falso "SIN CONEXIÓN" (Bug 1).
- [ ] No hay parpadeo/estrobo al cambiar de zona horaria (Bug 2).
- [ ] Los incidentes de la noche aparecen en el día correcto (Bug 3).

### 12.3 Comandos de Build

```bash
npm run build          # Vite — debe transformar sin errores
npx vitest run         # Tests unitarios
```

---

## 13. PENDIENTES

- **`ENTERPRISE_PAT`:** regenerar el token para reparar el espejo a San Pablo
  (`.github/workflows/mirror.yml`). Requiere acción del administrador de GitHub.

> **v13 (Fase 13.1–13.3):** las tres áreas de mejora detectadas en la auditoría
> del módulo fueron reparadas. Ver sección 14.

---

## 14. REPARACIÓN v13 (Áreas de Mejora Cerradas)

La auditoría del módulo identificó tres áreas de mejora. Las tres fueron
reparadas en tres fases independientes, cada una con su propio commit y
verificación completa, **sin interrumpir al POS** (protocolo de no-interferencia:
no se tocó `RetailVisionPOS.jsx`, `useTerminalLocking.js`, `useBeforeUnload.js`
ni `POSService.js`; el contrato público de `useNetworkHealth` no cambió).

### 14.1 Fase 13.1 — Clasificadores puros + tests (commit `f4c9da9`)

**Problema:** la lógica de clasificación de estado de terminal y de severidad de
desconexión vivía inline dentro de `NetworkMonitorUI.jsx`, sin tests. Un cambio
accidental podía romper el dashboard sin que nada lo detectara.

**Solución:** se extrajo a [`networkClassifiers.js`](apps/network/utils/networkClassifiers.js:1)
(función pura, sin React, sin DOM, sin fetch):

| Función | Responsabilidad |
|---|---|
| `classifyTerminalStatus(info, nowMs, ttlMinutes)` | Estado de terminal (online/cash_open/stale/idle) |
| `normalizeUtcString(value)` | Agrega `Z` si falta zona (parche defensivo UTC) |
| `classifyDisconnectSeverity(evt, allEvents, idx, windowMs)` | normal vs sospechosa |
| `classifyEvents(events, windowMs)` | Aplica severidad a toda la lista |
| `summarizeSuspiciousIncidents(events)` | Conteo de sospechosas por terminal |

**Tests:** [`networkClassifiers.test.js`](apps/network/utils/networkClassifiers.test.js:1)
— 21 tests. Vitest pasó de 120 a **141**.

**Regla de Oro:** toda lógica de clasificación del módulo de red debe vivir en
`networkClassifiers.js` y tener test. PROHIBIDO volver a escribirla inline en el JSX.

### 14.2 Fase 13.2 — `CONFIG.API_BASE_URL` (commit `df73bd8`)

**Problema:** `NetworkMonitorUI.jsx` construía la URL del API a mano
(`window.location.hostname + ':5001'`), el patrón exacto del **Incidente 16.6**
(falso banner "SIN CONEXIÓN" cuando se accede por dominio en producción).

**Solución:** `const API_BASE = CONFIG.API_BASE_URL;` importando
[`config.js`](apps/pos/config.js:16). `CONFIG.API_BASE_URL` ya resuelve
`http://${hostname}:5001/api/v1` en local/IP y `https://api.${dominio}/api/v1`
en producción.

**Regla de Oro:** `CONFIG.API_BASE_URL` es la ÚNICA fuente de verdad de la URL
del API. PROHIBIDO reconstruirla con `window.location.hostname`.

### 14.3 Fase 13.3 — Offset de zona horaria configurable (commit `31a9139`)

**Problema:** `tz_offset_hours = 6` estaba hardcodeado en dos lugares de
[`router.py`](apps/api/modules/network/router.py:1). Si el negocio cambiara de
zona horaria o de horario de verano, el filtrado de incidentes por fecha se
desfasaba silenciosamente.

**Solución:**
- Nuevo setting `network_tz_offset_hours` (default `6`) en
  [`settings/service.py`](apps/api/modules/settings/service.py:24) `seed_settings`.
- Helper `_get_tz_offset(db)` en `router.py` que lee el setting con **fallback
  robusto a 6** si no existe o el valor es basura (no rompe si la BD aún no
  tiene la fila sembrada).
- Ambos usos de `tz_offset_hours = 6` reemplazados por `await _get_tz_offset(db)`.

**Tests:** [`test_network_tz.py`](apps/api/tests/test_network_tz.py:1) — 6 tests.
Pytest pasó de 33 a **39**.

**Regla de Oro:** ningún offset de zona horaria se hardcodea. Se lee del setting
con fallback explícito.

### 14.4 Verificación final v13

| Verificación | Antes | Después |
|---|---|---|
| `npx vitest run` | 120 | **141** |
| `npm run build` | 1418 módulos | **1419 módulos** |
| `docker exec rderico-api-dev python -m pytest -q` | 33 | **39** |
| POS (`RetailVisionPOS.jsx`) | — | **sin cambios** |
