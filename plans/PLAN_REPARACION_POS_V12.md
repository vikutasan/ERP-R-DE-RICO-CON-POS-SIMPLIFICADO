# Plan v12: Reparación de la Veracidad de Ocupación de Terminales (POS)

**Estado:** 📋 PROPUESTO — pendiente de aprobación del operador
**Rama sugerida:** `fix/pos-v12-veracidad-ocupacion`
**Base:** `main` @ `b202b8c`
**Autor:** Arquitectura
**Fecha:** 2026-09-13
**Alcance:** Los 3 defectos que hacen que la landing del POS **mienta** sobre qué terminales están ocupadas.

---

## 0. FILOSOFÍA DE ESTE PLAN

El negocio reportó dos síntomas que parecían el mismo bug:

> *"Alfa está logueada en T2 y el sistema no lo refleja."*
> *"CAJA tampoco se muestra ocupada en la landing."*

La investigación forense demostró que son **tres defectos independientes** con una raíz común: **la landing del POS no es una fuente de verdad, es una interpretación.** Cada capa (backend → hook → componente) reinterpreta el estado y cada reinterpretación puede mentir.

> **Regla rectora de este plan:** *"Una pantalla de selección de terminal debe mostrar el estado del servidor, no una opinión sobre él."*

### Los tres defectos

| # | Defecto | Naturaleza | Se manifiesta cuando... | Depende del observador |
|---|---------|-----------|------------------------|:---:|
| 1 | `isMine` pinta la terminal propia como LIBRE | Lógica de render | El ocupante mira su propia terminal | **Sí** |
| 2 | Terminal libre etiquetada `SIN CONEXIÓN` | Semántica | Cualquier terminal libre | No |
| 3 | Lock huérfano no se libera al navegar | Ciclo de vida | El usuario cambia de terminal sin salir | No |

---

## 1. AUDITORÍA DE LOS TRES DEFECTOS

### 1.1 Defecto 1 — `isMine` convierte "ocupada por mí" en "libre"

**Evidencia en código:**

```js
// apps/pos/components/TerminalSelector.jsx:287-289
const isOccupied = terminalStatuses[t.id];
const isMine = isOccupied && isOccupied.occupier_id === currentUser?.id;
const lockedByOther = isOccupied && !isMine;
```

Y el render solo tiene **dos ramas** ([`TerminalSelector.jsx:321`](apps/pos/components/TerminalSelector.jsx:321) y [`TerminalSelector.jsx:344`](apps/pos/components/TerminalSelector.jsx:344)):

```jsx
{lockedByOther ? (
    /* TARJETA ROJA: "OCUPADA / EN CAJA" + 🔒 + nombre del ocupante */
) : (
    /* TARJETA LIBRE: icono + nombre + "Punto de Venta" */
)}
```

**No existe una tercera rama para "ocupada por mí".** Cuando `isMine === true`, `lockedByOther` es `false`, así que la tarjeta cae en el `else` y se dibuja **idéntica a una terminal libre**.

**Prueba ejecutada** con el estado real de CAJA (`occupier_id: 1` = VICTOR):

```
VICTOR (id=1)    | isMine=true   | lockedByOther=false  -> TARJETA LIBRE (icono + nombre)
Alfa (id=3)      | isMine=false  | lockedByOther=true   -> TARJETA ROJA OCUPADA
Dana (id=34)     | isMine=false  | lockedByOther=true   -> TARJETA ROJA OCUPADA
```

**Por qué explica exactamente el reporte del negocio:**

- VICTOR es el usuario `id=1` y tiene la sesión de caja abierta en CAJA desde el 12 de septiembre (`cash_sessions.id=169`, `status=OPEN`).
- Si **Víctor es quien mira la landing**, CAJA se le pinta como libre → *"la landing no muestra CAJA ocupada"*. ✅
- Si **Alfa o Dana** miraran la landing, CAJA **sí** aparecería en rojo.

**El bug es dependiente del observador.** Esto también explica por qué el Monitor de Red ([`NetworkMonitorUI.jsx`](apps/network/NetworkMonitorUI.jsx:36)) **sí** muestra CAJA ocupada: ese módulo no tiene lógica de `isMine` — pinta el estado crudo de la API para todos por igual.

**Severidad:** 🔴 Crítica — un cajero puede creer que su propia terminal está libre, y el negocio pierde confianza en el sistema ("el sistema miente").

---

### 1.2 Defecto 2 — Terminal libre etiquetada `SIN CONEXIÓN`

**Evidencia en código:**

```js
// apps/pos/components/TerminalSelector.jsx:39-47
const getNetStatus = useCallback((tid) => {
    const info = terminalStatuses[tid];
    if (!info || !info.occupier_id) return { color: '#555', label: 'SIN CONEXIÓN' }; // gris
    if (info.stale_session) return { color: '#ef4444', label: 'SESIÓN EXPIRADA' }; // rojo
    const safeDate = info.locked_at.endsWith('Z') ? info.locked_at : info.locked_at + 'Z';
    const lockAge = info.locked_at ? (Date.now() - new Date(safeDate).getTime()) / 60000 : 999;
    if (lockAge < 25) return { color: '#4ade80', label: 'EN LÍNEA' }; // verde
    return { color: '#f59e0b', label: 'INACTIVA' }; // amarillo
}, [terminalStatuses]);
```

**El problema:** `!info || !info.occupier_id` conflaciona **dos estados distintos**:

| Estado real | Significado | Etiqueta actual | Etiqueta correcta |
|---|---|---|---|
| No hay lock | Terminal **libre y lista** | `SIN CONEXIÓN` ❌ | `DISPONIBLE` ✅ |
| Hay lock, sin heartbeat | Terminal **abandonada** | `INACTIVA` | `INACTIVA` |

El Monitor de Red **ya tiene la semántica correcta** ([`NetworkMonitorUI.jsx:24`](apps/network/NetworkMonitorUI.jsx:24)):

```js
idle: { color: '#555', label: 'DISPONIBLE', icon: '○' },
```

**Impacto:** una terminal libre (como T2) se ve **averiada** en vez de disponible. Esto alimentó directamente la confusión del reporte: el negocio vio T2 en gris y asumió que el sistema no reflejaba la sesión de Alfa, cuando en realidad T2 estaba genuinamente libre.

**Severidad:** 🟠 Alta — no rompe nada, pero **genera diagnósticos falsos** y erosiona la confianza operativa.

---

### 1.3 Defecto 3 — Lock huérfano al navegar entre terminales

**Evidencia en la BD (capturada en vivo durante la investigación):**

```
 terminal_id | occupier_name |         locked_at          |   antiguedad
-------------+---------------+----------------------------+-----------------
 CAJA        | VICTOR        | 2026-09-13 16:22:36.152142 | 00:00:04.59   ← renovando
 T3          | Alfa          | 2026-09-13 16:08:26.596123 | 00:14:14.14   ← CONGELADO
 T4          | Dana          | 2026-09-13 16:21:41.946716 | 00:00:58.79   ← renovando
 T5          | DALIA         | 2026-09-13 16:22:23.456671 | 00:00:17.28   ← renovando
```

**El lock de Alfa quedó congelado en T3 durante 14 minutos** mientras CAJA/T4/T5 se renovaban cada ~20 s. Esto significa que **el navegador de Alfa dejó de mandar heartbeat a T3** — consistente con que navegó a otra terminal. Pero el lock de T3 **no se liberó**: quedó huérfano hasta que el TTL de 20 min lo purgue.

**Análisis del ciclo de vida:**

El heartbeat solo se envía cuando `selectedTerminal` está definido ([`useTerminalLocking.js:126-142`](apps/pos/hooks/useTerminalLocking.js:126)):

```js
useEffect(() => {
    if (!selectedTerminal || !currentUser?.id) return;
    const sendHeartbeat = () => {
        posService.heartbeatTerminal(selectedTerminal, currentUser.id).catch(...);
    };
    sendHeartbeat();
    const intervalId = setInterval(sendHeartbeat, settings.heartbeatInterval);
    return () => clearInterval(intervalId);
}, [selectedTerminal, currentUser, settings.heartbeatInterval]);
```

Cuando el usuario cambia de terminal, `selectedTerminal` cambia → el cleanup **detiene el heartbeat de la terminal vieja** — pero **no la libera**. El unlock solo ocurre en:

1. [`useTerminalLocking.js:115-123`](apps/pos/hooks/useTerminalLocking.js:115) — cleanup de **desmontaje** (solo al cerrar el módulo/pestaña).
2. [`RetailVisionPOS.jsx:342-354`](apps/pos/RetailVisionPOS.jsx:342) — `doTerminalExit()` (botón explícito de salida).

**No hay liberación al cambiar de terminal.** El lock viejo queda huérfano ocupando la terminal durante hasta 20 minutos.

**Agravante — `pos_heartbeat_interval_ms = 60000`:** el intervalo de heartbeat configurado es de **60 segundos**, no los 20 s por defecto del hook ([`useTerminalLocking.js:25`](apps/pos/hooks/useTerminalLocking.js:25)). Esto significa que una terminal puede tardar hasta 60 s en reflejar actividad, y que un lock huérfano tarda hasta 20 min en purgarse.

**Severidad:** 🟠 Alta — bloquea terminales legítimamente libres y genera "terminales fantasma" que el negocio reporta como ocupadas.

---

### 1.4 Descartado: la hipótesis de zona horaria UTC vs México

El operador sospechó que el desfase UTC/México causaba el problema. **Se investigó y se descartó como causa**, pero se documenta porque el parche actual es frágil.

**Evidencia:**

```
SHOW timezone;  →  UTC
now()           →  2026-09-13 16:22:40+00
now() AT TIME ZONE 'America/Mexico_City'  →  2026-09-13 10:22:40
```

Las columnas son `timestamp WITHOUT time zone` y la API serializa **sin sufijo `Z`**:

```json
"CAJA":{"occupier_id":1,"occupier_name":"VICTOR","locked_at":"2026-09-13T16:22:36.152142","is_cash_register":true}
```

El front lo compensa con un parche en dos lugares:

```js
// TerminalSelector.jsx:43  y  NetworkMonitorUI.jsx:94
const safeDate = info.locked_at.endsWith('Z') ? info.locked_at : info.locked_at + 'Z';
```

**Verificación numérica ejecutada:**

```
locked_at crudo:        2026-09-13T16:22:36.152142
safeDate usado:         2026-09-13T16:22:36.152142Z
lockAge (min):          1.34   →  lockAge < 25 = true  →  "EN LÍNEA" ✅
```

**Conclusión:** el parche `+ 'Z'` **neutraliza** el desfase. Sin él, `lockAge` sería 361 min y **todo** se vería `INACTIVA`. No es la causa de CAJA ni de T2.

**Pero es deuda:** `endsWith('Z')` es frágil. Si la API algún día serializa con offset (`+00:00`) en vez de `Z`, el parche falla y el desfase de 6 h reaparece silenciosamente. Se incluye como Fase 12.4 (endurecimiento).

---

## 2. FASES DE REPARACIÓN

### FASE 12.1 — Tercer estado visual: "ocupada por mí"

**Objetivo:** que una terminal ocupada por el usuario actual se pinte como **ocupada**, no como libre.

**Archivos:**

| # | Archivo | Cambio |
|---|---------|--------|
| 1.1 | [`TerminalSelector.jsx`](apps/pos/components/TerminalSelector.jsx:287) | Añadir `isMine` como estado de render explícito |
| 1.2 | [`TerminalSelector.jsx`](apps/pos/components/TerminalSelector.jsx:321) | Tercera rama visual (ámbar) para `isMine` |
| 1.3 | `apps/pos/components/__tests__/terminalCardState.test.js` | Test de la función pura de clasificación |

**Diseño:**

Extraer la clasificación a una **función pura testeable** (patrón DRY ya usado en `warehouseMappers.js`):

```js
// apps/pos/utils/terminalCardState.js  (NUEVO)
export const resolveCardState = (info, currentUserId) => {
    if (!info || !info.occupier_id) return 'free';
    if (info.occupier_id === currentUserId) return 'mine';
    return 'occupied';
};
```

Y en el render:

```jsx
const cardState = resolveCardState(terminalStatuses[t.id], currentUser?.id);
// cardState: 'free' | 'mine' | 'occupied'
```

| `cardState` | Color | Etiqueta | Icono | Clickable |
|---|---|---|---|---|
| `free` | normal | (nombre) | icono | Sí → `lockTerminal` |
| `mine` | **ámbar** | `TU SESIÓN ACTIVA` | 🔑 | Sí → `onTerminalSelected` (re-entrar) |
| `occupied` | rojo | `OCUPADA` / `EN CAJA` | 🔒 | Solo con permiso → force unlock |

**Decisión de diseño crítica:** cuando `cardState === 'mine'`, el click debe **re-entrar a la terminal** (llamar `onTerminalSelected(t.id)`), **NO** volver a llamar `lockTerminal`. Re-lockear es innecesario (el lock ya existe) y añade una llamada de red que puede fallar. Esto respeta la regla anti-ping-pong documentada en [`useTerminalLocking.js:15`](apps/pos/hooks/useTerminalLocking.js:15).

**Verificación:**

```
npx vitest run apps/pos/utils/__tests__/terminalCardState.test.js
```
Casos: `free` (sin info), `free` (info vacía), `mine` (mismo id), `occupied` (otro id), `occupied` (id nulo).

**Riesgo:** Bajo. Es un cambio de render aislado, sin tocar backend ni el flujo de locks.

---

### FASE 12.2 — Semántica correcta: `DISPONIBLE` ≠ `SIN CONEXIÓN`

**Objetivo:** que una terminal libre diga `DISPONIBLE`, alineando con el Monitor de Red.

**Archivos:**

| # | Archivo | Cambio |
|---|---------|--------|
| 2.1 | [`TerminalSelector.jsx`](apps/pos/components/TerminalSelector.jsx:41) | `'SIN CONEXIÓN'` → `'DISPONIBLE'` |
| 2.2 | [`NetworkMonitorUI.jsx`](apps/network/NetworkMonitorUI.jsx:24) | (referencia — ya correcto, no se toca) |

**Cambio:**

```js
// ANTES (TerminalSelector.jsx:41)
if (!info || !info.occupier_id) return { color: '#555', label: 'SIN CONEXIÓN' };

// DESPUÉS
if (!info || !info.occupier_id) return { color: '#555', label: 'DISPONIBLE' };
```

**Nota de coherencia:** el Monitor de Red ya usa `DISPONIBLE` para `idle` ([`NetworkMonitorUI.jsx:24`](apps/network/NetworkMonitorUI.jsx:24)). Este cambio **unifica el vocabulario** entre los dos módulos que muestran el mismo estado.

**Verificación:** Manual — abrir la landing con una terminal libre y confirmar que dice `DISPONIBLE` en gris.

**Riesgo:** Muy bajo. Cambio de una cadena de texto.

---

### FASE 12.3 — Liberar el lock al cambiar de terminal

**Objetivo:** que un lock huérfano se libere cuando el usuario navega a otra terminal, en vez de esperar 20 min al TTL.

**Archivos:**

| # | Archivo | Cambio |
|---|---------|--------|
| 3.1 | [`useTerminalLocking.js`](apps/pos/hooks/useTerminalLocking.js:126) | Liberar la terminal anterior al cambiar `selectedTerminal` |
| 3.2 | [`RetailVisionPOS.jsx`](apps/pos/RetailVisionPOS.jsx:342) | (verificar que `doTerminalExit` sigue siendo el camino principal) |

**Diseño — el problema del cleanup:**

El efecto de heartbeat actual ([`useTerminalLocking.js:126-142`](apps/pos/hooks/useTerminalLocking.js:126)) ya tiene un cleanup que detiene el intervalo. **Hay que añadir la liberación ahí**, pero con cuidado:

```js
useEffect(() => {
    if (!selectedTerminal || !currentUser?.id) return;
    const terminalAtStart = selectedTerminal;   // capturar el valor de ESTE efecto
    const userIdAtStart = currentUser.id;

    const sendHeartbeat = () => {
        posService.heartbeatTerminal(terminalAtStart, userIdAtStart).catch(...);
    };
    sendHeartbeat();
    const intervalId = setInterval(sendHeartbeat, settings.heartbeatInterval);

    return () => {
        clearInterval(intervalId);
        // Liberar SOLO si realmente cambiamos de terminal (no en desmontaje global,
        // que ya lo maneja el efecto de línea 115)
        posService.unlockTerminal(terminalAtStart, userIdAtStart)
            .catch(e => console.warn("Auto-unlock al cambiar de terminal falló", e));
    };
}, [selectedTerminal, currentUser?.id, settings.heartbeatInterval]);
```

**⚠️ RIESGO CRÍTICO — Bug Terminales Fantasma V2:**

El documento POS ([`DOCUMENTACION_MODULO_POS.md:234-244`](ESPECIFICACIONES%20DEL%20PROYECTO/DOCUMENTACION_MODULO_POS.md:234)) documenta que un cleanup mal hecho **destruyó sesiones silenciosamente** porque `currentUser` era un objeto inline que cambiaba de referencia en cada render.

**Mitigación obligatoria:**

1. Depender de `currentUser?.id` (primitivo), **NO** de `currentUser` (objeto).
2. Capturar `terminalAtStart` y `userIdAtStart` **dentro** del efecto (no leer refs en el cleanup).
3. **Verificar** que `ExperimentCenterUI.jsx` pasa `currentUser` memoizado antes de aplicar este cambio.
4. Añadir un **guard de idempotencia**: si el unlock falla con 403 (no eres el dueño), ignorar silenciosamente — significa que un admin ya transfirió la terminal.

**Alternativa más segura (si el riesgo se considera alto):** en vez de liberar en el cleanup, **liberar explícitamente** en el handler de cambio de terminal ([`RetailVisionPOS.jsx:330`](apps/pos/RetailVisionPOS.jsx:330) `handleTerminalSwitch`), que es un camino **explícito** y no depende del ciclo de vida de React. **Esta es la opción recomendada** por ser determinista.

**Verificación:**

```
# 1. Seleccionar T2, luego cambiar a T3
# 2. Consultar la BD inmediatamente:
docker exec rderico-db-dev psql -U user -d rderico -c "SELECT terminal_id, occupier_name, locked_at FROM terminal_locks ORDER BY terminal_id;"
# Esperado: T2 NO aparece (liberada), T3 SÍ aparece
```

**Riesgo:** Medio-Alto. Toca el ciclo de vida de los locks, que tiene historial de bugs graves. **Requiere prueba con POS activo y ventana de mantenimiento.**

---

### FASE 12.4 — Endurecimiento de zona horaria (deuda preventiva)

**Objetivo:** eliminar la fragilidad del parche `endsWith('Z')`.

**Archivos:**

| # | Archivo | Cambio |
|---|---------|--------|
| 4.1 | [`router.py`](apps/api/modules/pos/router.py:284) | Serializar `locked_at` con `Z` explícito |
| 4.2 | [`TerminalSelector.jsx`](apps/pos/components/TerminalSelector.jsx:43) | Simplificar el parche |
| 4.3 | [`NetworkMonitorUI.jsx`](apps/network/NetworkMonitorUI.jsx:94) | Simplificar el parche |

**Diseño:**

En el backend, normalizar el timestamp antes de devolverlo:

```python
# apps/api/modules/pos/router.py — en get_terminals_status
def _iso_utc(dt):
    """Serializa un datetime naive (UTC) con sufijo Z explícito."""
    if dt is None:
        return None
    return dt.isoformat() + "Z" if not dt.isoformat().endswith("Z") else dt.isoformat()

# Aplicar a cada locked_at en res
for tid, info in res.items():
    if info.get("locked_at"):
        info["locked_at"] = _iso_utc(info["locked_at"])
```

Y en el front, el parche se vuelve defensivo pero simple:

```js
const safeDate = info.locked_at.endsWith('Z') || info.locked_at.includes('+')
    ? info.locked_at
    : info.locked_at + 'Z';
```

**Nota:** este cambio es **preventivo**, no corrige un bug activo. Se incluye porque el parche actual falla silenciosamente si el formato de serialización cambia.

**Verificación:**

```
curl -s http://localhost:5001/api/v1/pos/terminals/status | findstr locked_at
# Esperado: "locked_at":"2026-09-13T16:22:36.152142Z"  (con Z)
```

**Riesgo:** Bajo. Cambio aditivo en la serialización.

---

## 3. ORDEN DE EJECUCIÓN Y DEPENDENCIAS

```
FASE 12.1 (isMine)       ──┐
                            ├──> independientes, se pueden paralelizar
FASE 12.2 (DISPONIBLE)   ──┘

FASE 12.3 (liberar lock) ──> independiente, pero REQUIERE prueba con POS activo

FASE 12.4 (zona horaria) ──> independiente, preventivo
```

**Orden recomendado:**

| Orden | Fase | Motivo |
|---|---|---|
| 1 | **12.2** | La más simple (una cadena). Impacto inmediato en claridad. |
| 2 | **12.1** | Resuelve el bug crítico reportado por el negocio (CAJA). |
| 3 | **12.4** | Preventivo, bajo riesgo, se hace mientras el POS está estable. |
| 4 | **12.3** | El más riesgoso. Requiere ventana de mantenimiento y prueba con POS activo. |

---

## 4. PROTOCOLO DE SEGURIDAD (por sub-fase)

Siguiendo el protocolo del plan maestro v7 (§5.1 y §5.2):

1. **Antes de cada fase:** `git status` limpio, `git log --oneline -1` registrado.
2. **Durante:** si un cambio requiere tocar el flujo de cobro o el carrito, **detenerse y consultar**.
3. **Después de cada fase:**
   - `docker exec rderico-api-dev python -m pytest tests/ -q` → 33+ passed
   - `npx vitest run` → 113+ passed
   - `npm run build` → 1417+ módulos, exit 0
   - `git diff | findstr /I "console.log debugger print("` → sin resultados
4. **Commit por fase** con mensaje descriptivo y referencia al defecto.
5. **Push a origin** al cerrar cada fase.
6. **Actualizar** [`DOCUMENTACION_MODULO_POS.md`](ESPECIFICACIONES%20DEL%20PROYECTO/DOCUMENTACION_MODULO_POS.md) con el nuevo incidente en el Cementerio de Bugs.

---

## 5. VERIFICACIÓN FINAL DEL PLAN

| # | Verificación | Comando | Esperado |
|---|---|---|---|
| 1 | Tests backend | `docker exec rderico-api-dev python -m pytest tests/ -q` | 33+ passed |
| 2 | Tests frontend | `npx vitest run` | 118+ passed |
| 3 | Build | `npm run build` | 1417+ módulos, exit 0 |
| 4 | API viva | `GET /health` | 200 |
| 5 | POS vivo | `GET :5000/index.html` | 200 |
| 6 | Sin debug | `git diff \| findstr "console.log"` | vacío |
| 7 | **CAJA visible** | Manual: Víctor mira la landing | CAJA en **ámbar** "TU SESIÓN ACTIVA" |
| 8 | **Terminal libre** | Manual: T2 sin lock | T2 en gris "**DISPONIBLE**" |
| 9 | **Lock liberado** | Manual: cambiar T2→T3, consultar BD | T2 ausente de `terminal_locks` |
| 10 | **Zona horaria** | `curl .../terminals/status \| findstr locked_at` | termina en `Z` |

---

## 6. LO QUE ESTE PLAN **NO** HACE

- **No toca el flujo de cobro.** Cero cambios en `handleTicketAction`, `createTicket`, `clearCart`.
- **No toca la persistencia atómica.** Cero cambios en `addItemToTicket` / `updateItem` / `removeItem`.
- **No reintroduce auto-save.** No se añade ningún timer de guardado.
- **No cambia el modelo de locks.** Sigue siendo PostgreSQL puro, sin RAM.
- **No resuelve el espejo a San Pablo.** Eso depende del `ENTERPRISE_PAT` del usuario.
- **No arregla el lock de T2 de Alfa retroactivamente.** Ese lock ya se purgó por TTL; este plan previene que vuelva a ocurrir.

---

## 7. ESTIMACIÓN DE ESFUERZO

| Fase | Complejidad | Riesgo | Archivos tocados |
|---|---|---|---|
| 12.1 | Media | Bajo | 1 frontend + 1 util + 1 test |
| 12.2 | Muy baja | Muy bajo | 1 frontend |
| 12.3 | Alta | Medio-Alto | 1 frontend (hook o handler) |
| 12.4 | Baja | Bajo | 1 backend + 2 frontend |

**Total:** 4 commits, ~7 archivos, sin migraciones de BD.

---

## 8. CRITERIO DE ÉXITO

El plan está completo cuando:

1. Un cajero que mira su **propia** terminal ocupada la ve en **ámbar "TU SESIÓN ACTIVA"**, no como libre — y hay un test de la función pura que lo prueba.
2. Una terminal **libre** dice `DISPONIBLE`, no `SIN CONEXIÓN` — y el vocabulario coincide con el Monitor de Red.
3. Cambiar de terminal **libera** la anterior en menos de 5 segundos, sin esperar el TTL de 20 min — y se verifica en la BD.
4. La API serializa `locked_at` con `Z` explícito, eliminando la dependencia del parche `endsWith('Z')`.

> **Nota final:** el negocio tenía razón en ambos reportes. CAJA no se veía ocupada porque quien la miraba era su propio ocupante, y T2 no se veía ocupada porque su lock nunca llegó a la base de datos. Este plan corrige la **veracidad** de la pantalla de selección, que es la primera impresión que el personal tiene del sistema cada mañana.
