# 🛡️ DOCUMENTACIÓN MAESTRA: MÓDULO PUNTO DE VENTA IA — R de Rico ERP

> **⚠️ LECTURA OBLIGATORIA.** Cualquier IA o desarrollador que necesite modificar o auditar CUALQUIER aspecto del Punto de Venta (POS) de R de Rico **DEBE leer este documento completo primero.**
>
> **Última actualización:** 2026-09-20
> **Versión de arquitectura POS:** v7.0.3 (Modelo SaaS — Persistencia Atómica + Respuesta Ligera + Verificación Post-Envío + Auto-Reconciliación + Contrato de Resultado Discriminado)
> **Archivos gobernados:** `apps/pos/`, `apps/api/modules/pos/`, `apps/api/modules/cash/`

---

> ⛔ **PROHIBICIONES ABSOLUTAS** (si solo lees 5 líneas de este documento, que sean estas):
> 1. **NO** reintroducir auto-save, timers ni `setInterval` para guardar el carrito. La persistencia es atómica por ítem.
> 2. **NO** hacer `clearCart()` sin confirmación HTTP 200 del servidor **Y** verificación post-envío (v6.1).
> 3. **NO** leer variables de estado (`cart`, `currentAccountNum`) dentro de callbacks asíncronos — usar siempre `useRef` (`cartRef.current`).
> 4. **NO** almacenar candados de terminal en RAM de Python — solo en PostgreSQL (tabla `terminal_locks`).
> 5. **NO** generar folios en el frontend — solo el backend los genera vía secuencia atómica de PostgreSQL.

---

## ÍNDICE

1. [Arquitectura Actual (v6.0 - Modelo SaaS)](#1-arquitectura-actual-v60---modelo-saas)
2. [Evolución Histórica: Cómo y Por Qué Llegamos Aquí](#2-evolución-histórica-cómo-y-por-qué-llegamos-aquí)
3. [El Cementerio de Bugs (Lecciones Aprendidas)](#3-el-cementerio-de-bugs-lecciones-aprendidas)
4. [Las Reglas de Oro Supervivientes (v6.0)](#4-las-reglas-de-oro-supervivientes-v60)
5. [Lógica de Terminales y Ocupación](#5-lógica-de-terminales-y-ocupación)
6. [Archivos Críticos — Mapa de Zona Restringida](#6-archivos-críticos--mapa-de-zona-restringida)
7. [Historial de Reglas Pre-v6.0 (Archivo Histórico)](#7-historial-de-reglas-pre-v60-archivo-histórico)

---

## 1. ARQUITECTURA ACTUAL (v6.0 - MODELO SaaS)

### El Gran Cambio de Paradigma

Hasta la versión 4.8, el POS intentaba guardar todo el carrito completo cada 15 segundos (Bulk Auto-Save). Esto causaba problemas infinitos de concurrencia y sobreescrituras.

En la **v6.0 (Modelo SaaS)**, el funcionamiento del POS se simplificó radicalmente imitando a los ERPs SaaS estables: **Persistencia Inmediata y Atómica.**

### ¿Cómo funciona la v6.0?

1. **Un solo camino de escritura atómica:**
   - Cuando el cajero agrega un pan: `handleAddToCart` se ejecuta y llama a `posService.addItemToTicket()`.
   - Cuando cambia la cantidad: `handleUpdateQuantity` llama a `posService.updateItemQuantity()`.
   - Cuando borra un pan: `handleRemoveFromCart` llama a `posService.removeItemFromTicket()`.
   - **Resultado:** La base de datos siempre tiene la versión real de la cuenta. El carrito local de React es solo un reflejo veloz (optimistic update).

2. **Acciones Explícitas (El fin del Auto-Save):**
   - El envío en bloque (`handleTicketAction`) **solo** se usa para dos cosas puntuales y explícitas que el usuario ordena:
     - Dar click en "Guardar en Pizarrón" (estado `OPEN`).
     - Dar click en "Cobrar" (estado `PAID`).
   - El timer asíncrono de auto-guardado masivo **fue eliminado**.

3. **Recuperación Directa:**
   - Al recuperar una cuenta del pizarrón (`handleRecoverAccount`), ya no se hace un "flush" de seguridad. Simplemente se descarga la versión fresca de los items del servidor y se dibuja en la pantalla.

---

## 2. EVOLUCIÓN HISTÓRICA: CÓMO Y POR QUÉ LLEGAMOS AQUÍ

Para evitar que futuras IAs intenten reimplementar arquitecturas pasadas que fracasaron, aquí se documenta el orden cronológico de nuestra evolución:

### Fase 1: El POS Básico y el Caos (v1.0 - v3.0)
- **Febrero/Marzo 2026:** Se construyó el POS básico. Usaba un botón de "Guardar" que enviaba el estado del carrito al backend.
- **El problema:** Los cajeros cerraban la pestaña o perdían la conexión antes de guardar. Se perdieron cuentas.

### Fase 2: La Era de la Complejidad Defensiva (v4.0 - v4.8)
- Para solucionar la pérdida de datos, implementamos un **Auto-Save masivo de 15 segundos**.
- Esto abrió la caja de Pandora de las *race conditions* (condiciones de carrera de JavaScript). Si dos personas tocaban la misma cuenta, o si el Wi-Fi era lento, el Auto-Save sobreescribía los datos del otro.
- **La solución temporal:** Se implementó una ingeniería masiva de candados:
  - `actionMutexRef` para serializar promesas.
  - Bloqueo optimista total con el campo `version`.
  - Modales constantes de "Conflicto de Versión" (HTTP 409) que bloqueaban la pantalla del cajero.
  - Sincronización agresiva de `useRef` para evitar que los timers leyeran *closures* viejos.

### Fase 3: La Simplificación SaaS (v6.0 - v6.1)
- **Mayo 2026:** Nos dimos cuenta de que la v4.8 era demasiado frágil y compleja. Al analizar cómo funcionaban otros ERPs comerciales tipo SaaS, descubrimos que **no hacían auto-saves de todo el carrito**. Guardaban ítem por ítem en tiempo real.
- Se reescribió `useTicketActions.js`. Se borró el timer de auto-save. Se crearon los endpoints `addItem`, `updateItem`, `removeItem`.
- **El resultado:** El POS se volvió 100x más estable. Los modales 409 desaparecieron porque la base de datos centraliza la verdad átomo por átomo. La complejidad de la v4.8 se desechó por un diseño inmensamente superior.

### Fase 4: Optimización de Rendimiento en Rush Hour (v7.0 - Actualidad)
- **Julio 2026:** Los cajeros reportaron lentitud al escanear productos y cobrar durante horas pico (4-6 terminales operando simultáneamente).
- **Diagnóstico:** Cada operación atómica (`addItemToTicket`, `updateItemQuantity`, `removeItemFromTicket`) ejecutaba `_get_full_ticket()` al final: un SELECT con **5 niveles de carga ansiosa** (JOINs a items → product → category, items → product → technical_sheet, session, captured_by → profile, cashed_by → profile). El frontend solo necesitaba `version` y `total` de estas respuestas.
- **Solución (v7.0):** Se creó `_get_lightweight_response()`: un SELECT de 5 columnas escalares **sin ningún JOIN**. Las 3 operaciones atómicas ahora devuelven esta respuesta ligera. El checkout (`createTicket`) sigue usando `_get_full_ticket()` porque necesita el ticket completo para impresión.
- **Adicionalmente:** Se eliminó `selectinload(Product.technical_sheet)` de todas las consultas POS (nunca se usaba), y se batcheó el N+1 en `_get_items_and_total()` (1 query `WHERE id IN(...)` en vez de N queries individuales).
- **Impacto medido:** ~80% menos carga de DB por producto escaneado. Zero cambios en frontend.
- **Adicionalmente (v7.0.1):** Se detectó que `handleUpdateQuantity` y `handleRemoveFromCart` (en `RetailVisionPOS.jsx`) **no tenían retries** — fallaban al primer intento y marcaban `lastSaveStatus = 'failed'` inmediatamente, mientras que `handleAddToCart` (en `useTicketActions.js`) ya tenía 3 intentos con backoff. Esta asimetría significaba que cambiar una cantidad o borrar un producto era más frágil que agregarlo. Se corrigió igualando el patrón: las 3 operaciones ahora usan `MAX_RETRIES = 3` con backoff progresivo (1s, 2s, 3s).
- **v7.0.2 — Hardening de Resiliencia (Julio 2026):** Auditoría de robustez identificó 4 vulnerabilidades remanentes:
  1. **Estado `failed` atrapado:** Si la red se recuperaba, el banner rojo permanecía indefinidamente porque nada reseteaba `lastSaveStatus`. **Fix:** Auto-reconciliación con timer de 10s que verifica el servidor y sincroniza el carrito.
  2. **Divergencia UI ↔ Servidor:** Optimistic updates de cantidad/borrado podían divergir del servidor tras retries fallidos. **Fix:** Al reconciliar, el servidor gana (fuente de verdad) y el carrito local se actualiza.
  3. **Retries duplicados en 2 archivos:** La lógica de retry estaba en `useTicketActions.js` (addToCart) y `RetailVisionPOS.jsx` (update/remove), lo que causó la asimetría original. **Fix:** Se creó `withRetries.js` como utilidad centralizada DRY.
  4. **Checkout sin retries:** `createTicket` (cobro/pizarrón) fallaba al primer intento de red sin reintentar, mientras que agregar un producto tenía 3 intentos. **Fix:** `createTicket` ahora usa `withRetries` con `shouldRetry` que excluye errores de negocio (409, folio pagado).

---

## 3. EL CEMENTERIO DE BUGS (LECCIONES APRENDIDAS)

Estos son los incidentes que nos llevaron a simplificar todo. **No cometer los mismos errores:**

### Incidentes Financieros

| Error Histórico (Pre-v6) | Consecuencia | Cómo la v6.0 lo previene |
|-------------------------|--------------|--------------------------| 
| **Ticket #906 ($124 → $2):** El auto-save leyó variables viejas de un `closure` y sobreescribió un carrito de 8 ítems con 1 ítem. | Pérdida económica severa. | Al no existir auto-save masivo, no hay timers asíncronos que puedan tener closures viejos. Todo es síncrono al clic. |
| **Ticket #125 ($205):** El botón de Pizarrón limpiaba la pantalla antes de que el servidor confirmara el guardado. La red falló. | Cuenta desaparecida. | `clearCart()` solo ocurre si el servidor responde con HTTP 200 (Regla de Oro). |
| **Hora Pico de Falsos Positivos:** El auto-save lanzaba modales bloqueantes de conflicto porque el Wi-Fi tardaba más de 15s en responder. | Cajeros paralizados. | El envío atómico es rápido y si falla, hace 3 reintentos silenciosos con "backoff" (ver `handleAddToCart`). |

### Incidente Ticket #906 — Línea de Tiempo Forense

Este es el bug más grave que sufrimos. Se documenta en detalle para que jamás se repita:

```
T=0s    Víctor abre V11906 (8 items, total $124)
        Auto-save del render N captura: cart=[8 items], account='V11906'

T=10s   Víctor COBRA V11906 → clearCart() → cart = []
        Víctor escanea BOLSA ($2) → nuevo carrito con 1 item
        Nuevo folio: V11907

T=15s   ⛔ AUTO-SAVE DISPARA con datos del render N (CLOSURE VIEJO):
        → Envía: { account_num: 'V11906', items: [BOLSA] }
        → Servidor: _sync_ticket_items() BORRA los 7 items extra
        → V11906 ahora solo tiene 1x BOLSA ($2) 💀

T=30s   Víctor cobra V11906 desde pizarrón
        → Ticket impreso con $2.00 en vez de $124.00
```

**La v6.0 elimina este escenario de raíz:** No existe ningún timer que pueda disparar con datos viejos.

### Incidente Terminal Fantasma OMEGA (23/Abril/2026)

**Terminal afectada:** CAJA + T4/T6 (usuario OMEGA, ID: 20).
**Síntoma:** OMEGA aparecía como ocupante de 2 terminales simultáneamente durante 2+ días.

**Causa raíz (3 bugs interconectados):**
1. **CashSession sin TTL:** OMEGA abrió una sesión de caja que nunca se cerró. El endpoint `/terminals/status` mostraba la terminal CAJA como bloqueada permanentemente.
2. **Doble ocupación:** `lock_terminal()` limpiaba locks previos del usuario pero no sabía de CashSessions. La CashSession huérfana en CAJA generaba una entrada duplicada.
3. **Heartbeat sin purga:** El heartbeat solo renovaba el timestamp sin limpiar locks duplicados del mismo usuario.

**Solución implementada (vigente hoy):**
1. `heartbeat()` ahora ejecuta purga de locks expirados + limpieza de duplicados del mismo usuario en cada ciclo.
2. `/terminals/status` detecta cuando un usuario tiene lock en otra terminal y marca la CashSession huérfana como `"CAJA ABIERTA"` con flag `operator_absent: true`.
3. CashSessions abiertas >24 horas se marcan como `"SESIÓN EXPIRADA"` con flag `stale_session: true`.

### Incidente Cuenta Fantasma $453 — Terminal T3 (11/Junio/2026)

**Terminal afectada:** T3 (cajera Yami, ID: 25).
**Síntoma:** Yami reportó que armó una cuenta por $453 en T3, le dio clic en "Enviar Cuenta" al Pizarrón, creyó que se envió correctamente, pero la cuenta **nunca apareció en el Pizarrón**.

**Investigación forense:**
1. **Base de datos:** No existe ningún ticket con total=$453, ni como OPEN, ni DRAFT, ni CANCELLED. La cuenta nunca llegó al servidor.
2. **Logs del servidor:** Cero errores HTTP. Cero excepciones. El servidor nunca recibió la petición.
3. **Auditoría POS:** Todos los requests de T3 ese día respondieron HTTP 200. No hay registro de un intento fallido.
4. **Tickets de Yami:** Sus 16 tickets de esa noche están todos completos y pagados correctamente. Ninguno suma $453.
5. **DRAFT tickets:** No existe ningún DRAFT de T3, confirmando que los items **nunca se persistieron atómicamente**.

**Causa raíz:** La Terminal T3 sufrió un **corte de WiFi silencioso**. Los productos se agregaron a la pantalla (optimistic update de React), pero las llamadas a `addItemToTicket()` fallaron silenciosamente después de 3 reintentos. Los items solo existieron en la memoria del navegador. Cuando Yami presionó "Enviar Cuenta", el `createTicket()` también falló por falta de red, pero el indicador de error (un toast de 5 segundos y un texto de 10px) fue **insuficiente en hora pico** y la cajera no lo percibió.

```
T=0s    Yami empieza a armar cuenta de $453 en T3
        Agrega productos → aparecen en pantalla (optimistic update)
        PERO: WiFi de T3 está caído

T=1-30s addItemToTicket() falla 3 veces por cada producto
        Toast ⚠️ aparece brevemente → Yami no lo ve en hora pico
        Items SOLO existen en memoria del navegador, NO en PostgreSQL

T=31s   Yami da clic en "Enviar Cuenta"
        createTicket() falla (sin red)
        Toast ❌ aparece 5 segundos → Yami ya está atendiendo al siguiente cliente
        Carrito NO se limpia (Regla de Oro funciona)
        PERO Yami cree que se envió porque el error fue invisible

T=32s+  Yami cambia a otra cuenta → la cuenta de $453 se pierde
```

**Solución implementada (v6.1 — vigente hoy, 3 capas de protección):**
1. **Botón BLOQUEADO:** El botón "Enviar Cuenta" ahora se **deshabilita y se pone rojo** cuando `lastSaveStatus === 'failed'`. Es físicamente imposible enviarlo sin conexión. (`SalesReceipt.jsx`)
2. **Banner Rojo Fijo:** Un banner grande, rojo y parpadeante aparece en el ticket diciendo "⛔ SIN CONEXIÓN AL SERVIDOR — Los productos NO se están guardando". Ya no es un toast que desaparece. (`SalesReceipt.jsx`)
3. **Verificación Post-Envío:** Después de que `createTicket()` retorna HTTP 200, el sistema ejecuta un `GET /tickets/by-account/{folio}` para **confirmar que el ticket realmente existe** en la base de datos. Si la verificación falla, **NO limpia el carrito** y muestra una alerta de 10 segundos. (`useTicketActions.js`)

### Incidente Ticket Secuestrado por la CAJA — Terminal 5 (16/Junio/2026)

**Terminal afectada:** T5 y CAJA.
**Síntoma:** Un ticket (V34538) de $2,550 capturado en la Terminal 5 no aparecía bajo "T5" en la base de datos ni en las auditorías de esa terminal. Parecía estar extraviado, pero en realidad estaba bajo "CAJA".

**Causa raíz:**
1. Cuando la Terminal 5 reserva el ticket, se registra correctamente (`terminal_id='T5'`).
2. El ticket pasa al Pizarrón y queda en estado `OPEN`.
3. El cajero en "CAJA" abre el ticket desde el Pizarrón y lo cobra (`status='PAID'`).
4. **El Bug:** Al hacer `update_ticket_fields`, el backend aplicaba la regla: *"Asegurar que la terminal actual se convierte en la dueña del ticket"*, sobreescribiendo el `terminal_id` original ("T5") con la sesión actual ("CAJA").
5. Esto destruía la trazabilidad de qué tablet originó la venta.

**Solución implementada (vigente hoy):**
1. Se **eliminó** la sobreescritura de `terminal_id` en `apps/api/modules/pos/service.py` (`_update_ticket_fields`).
2. El `terminal_id` solo se asigna en `_initialize_new_ticket` y **jamás cambia**.
3. Las métricas del cobrador se mantienen a salvo porque se utilizan `cashed_by_id` y `cash_session_id`.

### Incidente Bucle de Destrucción de T2 y T4 (18/Junio/2026)

**Terminal afectada:** T2 y T4.
**Síntoma:** Las terminales eran expulsadas silenciosamente de la sesión y recibían errores HTTP 404 de "No active lock found" constantemente en bucle, impidiendo el uso del sistema.

**Causa raíz (Error Clásico de SQLAlchemy):**
1. La migración que movió los candados de la RAM a la base de datos (PostgreSQL) usaba `await db.flush()` en la lógica interna (`occupancy.py`).
2. Sin embargo, los endpoints en `router.py` (`take_terminal_lock`, `release_terminal_lock`, `heartbeat_terminal_lock`) **olvidaron incluir el `await db.commit()`** antes de retornar el HTTP 200.
3. Al no haber `commit()`, los cambios jamás se guardaban físicamente. Los tiempos de `locked_at` se congelaron con fechas de hacía 3 meses.
4. Cuando el frontend enviaba un `heartbeat`, el backend veía la fecha vieja, borraba el candado (por limpieza de inactividad) pero como no lo guardaba, al segundo siguiente intentaba renovarlo, no lo encontraba en su transacción local y respondía `404`.

**Solución implementada (vigente hoy):**
1. Se añadieron estrictamente los comandos `await db.commit()` antes de cada `return` en los 3 endpoints de `router.py` relacionados a los candados de terminal.
2. **⚠️ REGLA PARA FUTURAS IAs:** NUNCA asumir que `db.flush()` guarda en la base de datos de forma persistente. Siempre verificar que el router que ejecuta la llamada asíncrona posea un `await db.commit()`.

### Incidente Error 500 Silencioso por Schema Incongruente (12/Julio/2026)

**Módulos afectados:** POS Checkout, Auditoría y Control.
**Síntoma:** Al blindar la base de datos forzando el driver estricto `asyncpg`, la obtención de tickets devolvía *Internal Server Error 500* y la pantalla se mostraba en blanco a pesar de existir miles de registros.

**Causa raíz:**
1. En la v7.0, se optimizaron las consultas de DB eliminando explícitamente `selectinload(Product.technical_sheet)` para ahorrar memoria.
2. Sin embargo, se **olvidó** quitar el atributo `technical_sheet` del esquema Pydantic original (`ProductResponse`).
3. Al construir el JSON de respuesta, Pydantic intentaba leer `technical_sheet` forzando una lectura perezosa (Lazy Load) a la DB.
4. El entorno estricto asíncrono prohíbe el Lazy Load, detonando una excepción fatal `MissingGreenlet` y rompiendo la API.

**Solución implementada (vigente hoy):**
1. Se creó un esquema ultraligero `ProductLightResponse` en `apps/api/modules/pos/schemas.py` que **omite** explícitamente atributos como `technical_sheet`.
2. Las respuestas del POS consumen ahora este esquema, eliminando el fallo y mejorando el rendimiento.
3. **⚠️ REGLA PARA FUTURAS IAs:** Los esquemas de respuesta Pydantic DEBEN estar perfectamente alineados con los `selectinload()` de SQLAlchemy. No dejar atributos residuales en esquemas de respuesta masiva.

---


### Incidente Bug de Terminales Fantasma V2 (31/Agosto/2026)

**Sntoma:** Constantemente las terminales aparecan como INACTIVAS (lockAge > 25 min) a pesar de estar siendo operadas, y los heartbeats devolvan error 404 (lock no encontrado). Las terminales liberaban su estado sin motivo.

**Anlisis Forense:**
Se descubri que la seal posService.unlockTerminal() se estaba enviando de forma silente por culpa de un useEffect de limpieza (cleanup) en useTerminalLocking.js. Este efecto dependa de [selectedTerminal, currentUser].
El componente padre ExperimentCenterUI.jsx estaba enviando currentUser como un objeto en lnea (currentUser={{ id: userId... }}). Como en React los objetos en lnea generan una nueva referencia en memoria en cada re-render, el useEffect detectaba un cambio, disparaba el cleanup (destruyendo el candado en la DB) y se volva a registrar, ocasionando que la sesin se perdiera.

> **⚠️ CORRECCIÓN v15 (hallazgo H4):** El análisis anterior describe el estado **histórico** del incidente. Verificado línea-por-línea el 2026-09-20: el padre actual [`ExperimentCenterUI.jsx:508`](../apps/ExperimentCenterUI.jsx:508) pasa `currentUser={currentUser}` — una **variable de estado**, **NO** un objeto en línea. Por lo tanto el escenario "nueva referencia en cada render" **ya no ocurre hoy**. La causa raíz (cleanup con deps) ya está blindada con `[]` + refs. La corrección de deps de v15 es **deuda técnica preventiva (🟢)**, no un bug activo.

**Resolucin (Nueva Regla de Componentes Reactivos):**
- Se impuso la regla del useMemo() en componentes de alto nivel para props tipo objeto que no mutan sus valores reales.
- **Cambio Crtico en Cleanups de Desmontaje:** Se reescribi el useEffect de limpieza de la terminal para usar un array de dependencias vaco []. Para evitar cierres de estado obsoletos (*stale closures*), se implementaron useRef locales (selectedTerminalRef, currentUserRef) que apuntan a los valores actualizados. As, el cleanup solo se invoca cuando el componente **realmente se destruye** al salir del mdulo o cerrar la pestaa, leyendo los valores directamente de las referencias.
- **Endurecimiento v15 (hallazgo H1):** Además del cleanup, los efectos con `setInterval` (`checkMyLock` y `sendHeartbeat` en [`useTerminalLocking.js`](../apps/pos/hooks/useTerminalLocking.js:79)) y el `useCallback` de folio en [`usePOSSession.js`](../apps/pos/hooks/usePOSSession.js:111) ya **no dependen del objeto `currentUser`**, sino del primitivo `currentUserId = currentUser?.id`. Los callbacks leen el id vivo desde `currentUserRef.current?.id`. Esto elimina la clase de bug por cambio de referencia de objeto sin alterar el comportamiento actual.

### Incidente Veracidad de Ocupacin de Terminales (13/Septiembre/2026) — v12

**Sntoma:** El landing de seleccin de terminal "menta" sobre la ocupacin real. Tres manifestaciones concretas:
1. **CAJA:** Una terminal ocupada por el propio usuario se pintaba como LIBRE (bug dependiente del observador: si VICTOR, dueo de CAJA, miraba el landing, CAJA apareca libre).
2. **T2:** Una terminal libre se etiquetaba como `SIN CONEXIN` en vez de `DISPONIBLE`, confundiendo "libre" con "sin red".
3. **Lock hurfano:** Al cerrar la pestaa o navegar fuera, el candado de la terminal quedaba en PostgreSQL hasta que expiraba el TTL (20 min), bloqueando la terminal para otros usuarios.

**Anlisis Forense:**
- **Defecto 1 (CAJA):** `TerminalSelector.jsx` calculaba `isMine = isOccupied && isOccupied.occupier_id === currentUser?.id` y `lockedByOther = isOccupied && !isMine`. El render slo tena DOS ramas (`lockedByOther` y libre). Cuando `isMine === true`, `lockedByOther === false`, as que caa en la rama "libre" y se pintaba como disponible. **Bug dependiente del observador.**
- **Defecto 2 (T2):** La funcin `getNetStatus` devolva la etiqueta `SIN CONEXIN` para el estado sin ocupante, mezclando semntica de red con semntica de ocupacin.
- **Defecto 3 (lock hurfano):** El camino de salida explcito (`handleTerminalSwitch`  `doTerminalExit`) **s ya** liberaba el lock. El caso real hurfano era el cierre de pesta / navegacin fuera, que el cleanup de desmontaje cubra parcialmente pero `useBeforeUnload` no liberaba.

**Resolucin (v12 — 4 fases):**
- **Fase 12.1:** Se extrajo la clasificacin a una funcin pura `resolveCardState(info, currentUserId)` en `apps/pos/utils/terminalCardState.js` que devuelve `'free' | 'mine' | 'occupied'`. Se aadi un TERCER estado visual mbar ("TU SESIN ACTIVA") para la terminal propia. Al hacer clic en una terminal `mine`, se re-entra sin re-lockear (respeta la regla anti-ping-pong). Cubierto con 7 tests vitest.
- **Fase 12.2:** `'SIN CONEXIN'`  `'DISPONIBLE'` en `TerminalSelector.jsx` para el estado libre.
- **Fase 12.3:** Se extendi `useBeforeUnload.js` para liberar el lock de la terminal va `navigator.sendBeacon` al cerrar/navegar fuera de la pesta. Usa `useRef` para `selectedTerminal` y `currentUser` (evita *stale closures*). **Nunca re-adquiere un lock** (regla anti-ping-pong).
- **Fase 12.4:** Se aadi el helper `_iso_utc(dt)` en `apps/api/modules/pos/router.py` para serializar `locked_at` con sufijo `Z` explcito; los parches defensivos del front (`TerminalSelector.jsx`, `NetworkMonitorUI.jsx`) se mantienen por robustez ante offsets `+00:00`.

**Leccin (Nueva Regla de Veracidad de Estado):**
- **Nunca** colapsar tres estados (libre / mo / ajeno) en dos ramas de render. Una terminal ocupada por el propio usuario NO es "libre".
- La etiqueta de red (`SIN CONEXIN`) **no** debe reutilizarse para describir ocupacin (`DISPONIBLE`).
- Todo lock debe liberarse en **ambos** caminos: salida explcita (handler) y abandono de pesta (`beforeunload` con `sendBeacon`).

**Archivos involucrados:** `apps/pos/utils/terminalCardState.js` (nuevo), `apps/pos/utils/terminalCardState.test.js` (nuevo), `apps/pos/components/TerminalSelector.jsx`, `apps/pos/hooks/useBeforeUnload.js`, `apps/pos/RetailVisionPOS.jsx`, `apps/api/modules/pos/router.py`, `apps/network/NetworkMonitorUI.jsx`.

### Incidente: Tests de `test_bloque9d_3bugs.py` frgiles por el `limit=100` de `get_tickets` (14/Septiembre/2026)

**Commit:** `133233b` (`apps/api/tests/test_bloque9d_3bugs.py`).

**Sntoma:** 2 tests del bloque 9d (`test_bug1_ticket_0030_local_aparece_en_dia_local_correcto` y `test_bug1_limites_del_dia_local_son_0600_utc`) fallaban de forma intermitente. **No** era un bug de produccin ni de zona horaria.

**Causa raíz (trampa de paginacin implcita):**
[`POSService.get_tickets()`](apps/api/modules/pos/service.py:555) termina con `order_by(Ticket.created_at.desc()).limit(100)`. El test crea un ticket de prueba a las **06:00 UTC** (00:00 hora local), que es el **ms antiguo** del da local. Cuando la base de datos acumula **>100 tickets reales** con esa fecha, el ticket de prueba queda **fuera de la ventana top-100** y el test no lo encuentra  fallo. El test dependa del volumen de datos reales de la base de datos de desarrollo.

**Resolucin (aislamiento por prefijo):**
Se aadi `search=ACC_PREFIX` (`"TEST_B9D_"`) a las 3 llamadas de `get_tickets()` en los 2 tests afectados. Como `search` filtra por `account_num ILIKE '%TEST_B9D_%'`, el resultado contiene **nicamente** los tickets de prueba:

```python
# Antes (frgil: dependa del volumen de datos reales)
tickets = await svc.get_tickets(db, search_date="2026-09-14")

# Despus (aislado: solo tickets de prueba)
tickets = await svc.get_tickets(db, search_date="2026-09-14", search=ACC_PREFIX)
```

**Evidencia de aceptacin:** `10 passed` (archivo aislado) y `84 passed` (suite completa), antes 8/2 y 82/2.

**Leccin (Nueva Regla de Aislamiento de Tests):**
- **OBLIGATORIO** que todo test que consulte una funcin de listado con `limit` (paginacin implcita) **filtre por un prefijo nico de prueba** (`search=ACC_PREFIX`), para no depender del volumen de datos reales.
- **OBLIGATORIO** que los datos de prueba usen un prefijo identificable (`TEST_B9D_`) y que la limpieza borre **solo** ese prefijo, nunca datos reales.
- **PROHIBIDO** asumir que un test que pasa en una base de datos vaca pasar en una base de datos con datos reales.

**Archivos involucrados:** `apps/api/tests/test_bloque9d_3bugs.py`.

### Incidente Cuentas Perdidas por Salida sin Enviar — Modal de Salida (20/Septiembre/2026) — v7.0.3

**Terminales afectadas:** Todas (vendedores en tablets + CAJA).
**Síntoma:** El personal se logueaba, comenzaba a capturar una cuenta, **olvidaba presionar "Enviar al Pizarrón"** y cerraba la sesión. El operador de CAJA **no encontraba la cuenta** porque nunca había sido enviada. El Modal de Salida (Regla 6) existía y aparecía, pero **no garantizaba** que la cuenta llegara al Pizarrón.

**Análisis Forense (6 defectos interconectados):**

1. **Defecto raíz — "no lanzar excepción" ≠ "éxito":** [`handleSendThenExit`](apps/pos/RetailVisionPOS.jsx:359) llamaba a `handleTicketAction('OPEN')` dentro de un `try/catch` y, si **no se lanzaba excepción**, ejecutaba la acción pendiente de salida (logout/cambio de terminal). Pero `handleTicketAction` **retornaba silenciosamente** en varios fallos de negocio **sin lanzar**: carrito vacío, folio ya pagado, conflicto de versión auto-sanado, y — el más grave — **verificación post-envío fallida** (Regla 12). En esos casos el vendedor salía creyendo que la cuenta se había enviado, pero el ticket nunca quedó `OPEN` en el servidor.
2. **`handleExitWithoutSaving` incompleto:** La rama "Salir perdiendo la cuenta" limpiaba solo una parte del estado (carrito y folio), dejando **refs y estado residuales** (`originalCapturer`, `ticketVersion`, `orderData`, `orderType`, `lastSaveStatus`, `paymentsHistory`, `savedTicketRef`, persistencia en `localStorage`). Esto podía contaminar la siguiente sesión en la misma terminal.
3. **Backdrop del modal no limpiaba `pendingExitAction`:** El botón "Cancelar" sí limpiaba la acción pendiente, pero el **clic en el fondo oscuro (backdrop)** cerraba el modal **sin** limpiarla. Una acción pendiente (p. ej. "cambiar de terminal") podía dispararse en una salida posterior no relacionada.
4. **Force logout sin persistencia de emergencia:** Cuando otro usuario tomaba la terminal (`ForceLogoutModal`), el logout se ejecutaba **sin intentar** persistir el carrito en curso. La cuenta en progreso se perdía.
5. **Endpoint de emergencia asociaba la terminal equivocada:** [`emergency_save_ticket`](apps/api/modules/pos/router.py:430) tomaba **la primera sesión activa arbitraria** (`select(TerminalSession).where(is_active == True).limit(1)`), sin filtrar por `terminal_id`. El ticket de emergencia podía quedar asociado a la terminal incorrecta.
6. **Sin tests guardianes:** No existía ninguna prueba que protegiera el contrato "solo salir si el envío fue confirmado", por lo que el bug podía reaparecer silenciosamente.

**Solución implementada (v7.0.3 — 6 fases):**

- **Fase 1 — Contrato de Resultado Discriminado:** [`handleTicketAction`](apps/pos/hooks/useTicketActions.js:118) ahora retorna **siempre** un objeto `{ outcome, reason }`:
  - `outcome: 'success'` → el ticket quedó persistido **y verificado** en el servidor.
  - `outcome: 'aborted'` → no se persistió (vacío, ya pagado, conflicto, verificación fallida). `reason` indica la causa (`empty_cart`, `already_paid`, `version_conflict_autoheal`, `verification_failed`, `verification_error`).
  - `outcome: 'navigated'` → se abrió otra pantalla (checkout) sin persistir (`checkout_opened`).
  - `outcome: 'not_finalized'` → se persistió pero con `finalizeUI=false` (`finalize_ui_disabled`).
  - El `catch` sigue haciendo `throw` (intencional): los llamadores deben manejar **tanto** la promesa rechazada **como** los outcomes no-`success`.
- **Fase 2 — Consumidor Fail-Safe:** [`handleSendThenExit`](apps/pos/RetailVisionPOS.jsx:359) ahora **solo** ejecuta la acción pendiente si `result?.outcome === 'success'`. En cualquier otro caso muestra un toast de error y **mantiene la cuenta abierta**.
- **Fase 3 — Limpieza Espejo Explícita:** [`handleExitWithoutSaving`](apps/pos/RetailVisionPOS.jsx:385) limpia **explícitamente** todo el estado y los refs (espejo de la rama `success` de `handleTicketAction`). Se evitó a propósito un helper compartido: la duplicación visible y testeable es preferible a una abstracción que pueda desincronizar refs y estado.
- **Fase 4 — Backdrop Limpio:** El backdrop del modal ahora limpia `pendingExitAction` igual que "Cancelar".
- **Fase 5 — Force Logout con Beacon:** Se añadió [`handleForceLogout`](apps/pos/RetailVisionPOS.jsx:423), que dispara un `navigator.sendBeacon` **sin `await`** (fire-and-forget) a `/pos/tickets/emergency-save` con `{ account_num, terminal_id, items }`, y luego delega el logout real. El `sendBeacon` evita la espera de hasta ~6.5s del mutex + reintentos. El backend [`emergency_save_ticket`](apps/api/modules/pos/router.py:430) ahora **filtra por `terminal_id`** (con fallback a cualquier sesión activa para no perder el ticket).
- **Fase 6 — Tests Guardianes:** Se creó [`useTicketActions.exitContract.test.js`](apps/pos/hooks/useTicketActions.exitContract.test.js) con **13 tests** que replican las funciones puras `shouldExitAfterSend(result)` y `buildEmergencyPayload(...)`. Prueba crítica de regresión: `undefined`, `null` y `{}` **NO** autorizan la salida.

**Evidencia de aceptación:**
- `npm test` → **485 passed** (14 archivos), incluidos los 13 tests nuevos.
- `npm run build` → **built in 12.12s**, 1817 módulos transformados, sin errores JSX.
- `docker compose exec -T api python -m py_compile modules/pos/router.py` → **COMPILE_OK**.

**Lección (Nuevas Reglas Arquitectónicas Derivadas):**
- **OBLIGATORIO** que toda función de persistencia crítica retorne un **contrato de resultado discriminado** `{ outcome, reason }`. **PROHIBIDO** asumir que "no lanzar excepción" equivale a éxito: los fallos de negocio retornan sin lanzar.
- **OBLIGATORIO** que todo consumidor de una acción final (salir, cambiar de terminal, cobrar) **verifique explícitamente** `outcome === 'success'` antes de ejecutar efectos irreversibles (logout, limpieza de UI, navegación).
- **OBLIGATORIO** que toda rama de limpieza de UI sea un **espejo explícito y completo** del estado + refs que limpia la rama de éxito. **PROHIBIDO** dejar refs o `localStorage` residuales.
- **OBLIGATORIO** que todo cierre de modal (botón **y** backdrop) limpie las acciones pendientes (`pendingExitAction`).
- **OBLIGATORIO** que el force logout intente persistir el carrito en curso vía `sendBeacon` (fire-and-forget, nunca bloqueante) incluyendo `terminal_id`.
- **OBLIGATORIO** que el endpoint de emergencia asocie el ticket a la **terminal correcta** (`terminal_id`), con fallback documentado.
- **OBLIGATORIO** que todo contrato crítico tenga **tests guardianes** que prueben los casos negativos (`undefined`/`null`/`{}` no autorizan).

**Archivos involucrados:** `apps/pos/hooks/useTicketActions.js`, `apps/pos/RetailVisionPOS.jsx`, `apps/api/modules/pos/router.py`, `apps/pos/hooks/useTicketActions.exitContract.test.js` (nuevo).

### Incidente Lógica de Bloqueo/Desbloqueo de Terminales — Hallazgos H1–H8 (20/Septiembre/2026) — v15

**Terminales afectadas:** Todas (T1, T2, CAJA) — candados de terminal y heartbeat.
**Síntoma:** No hubo un bug reproducible en producción. Este incidente nace de una **auditoría preventiva** de la lógica de bloqueo/desbloqueo de terminales, que destapó **8 hallazgos** (H1–H8) de distinta gravedad: desde deuda técnica latente hasta un fallo silencioso real. El objetivo fue **blindar** el módulo sin tocar su comportamiento observable.

**Análisis Forense (8 hallazgos):**

| ID | Hallazgo | Gravedad | Naturaleza |
|----|----------|----------|------------|
| **H1** | Los efectos con `setInterval` de [`useTerminalLocking.js`](apps/pos/hooks/useTerminalLocking.js) y el `useCallback` de [`usePOSSession.js`](apps/pos/hooks/usePOSSession.js) dependían del **objeto** `currentUser` en sus deps. Un cambio de **referencia** (no de valor) re-registraba los intervalos/callbacks. | Media (latente) | Deuda técnica preventiva |
| **H2** | [`occupancy.py`](apps/api/modules/pos/occupancy.py) y el cutoff de `CashSession` en [`router.py`](apps/api/modules/pos/router.py) usaban `datetime.now()` (hora local naive) en lugar del helper UTC centralizado. | Media (latente) | Consistencia de zona horaria |
| **H3** | El payload de `beforeunload` en [`useBeforeUnload.js`](apps/pos/hooks/useBeforeUnload.js) **no incluía `terminal_id`**, por lo que el guardado de emergencia al cerrar la pestaña no podía asociar el ticket a la terminal correcta. | Alta | Bug funcional real |
| **H4** | La documentación afirmaba que el padre pasaba un **objeto inline** `currentUser`, cuando en realidad pasa una **variable de estado**. | Baja | Consistencia documental |
| **H5** | No existía una **regla explícita de timestamps** en la documentación, pese a ser un principio transversal ("Store UTC, Display Local"). | Baja | Consistencia documental |
| **H6** | El checklist de revisión no cubría los hallazgos H1–H5, por lo que podían reaparecer sin detección. | Baja | Consistencia documental |
| **H7** | [`heartbeatTerminal`](apps/pos/services/POSService.js:117) devolvía `false` **en silencio** ante un `404`/`403`, haciendo indistinguible un candado perdido de un blip de red. | Alta | Bug funcional real |
| **H8** | El `403` de `unlock` (cuando el solicitante ya no es dueño del candado) **parecía un bug** y no estaba documentado como comportamiento esperado. | Media | Documentación de comportamiento |

**Solución implementada (v15 — 7 fases):**

- **Fase 1 — H3 (`terminal_id` en `beforeunload`):** [`useBeforeUnload.js`](apps/pos/hooks/useBeforeUnload.js:44) ahora incluye `terminal_id: selectedTerminalRef.current || null` en el payload del `sendBeacon`, para que el guardado de emergencia asocie el ticket a la terminal correcta. Se auditó además el efecto `[currentUser]` para documentar su intención.
- **Fase 2 — H2 (`utcnow()`):** Se sustituyó `datetime.now()` por `utcnow()` (helper de [`core/timestamps.py`](apps/api/core/timestamps.py:21)) en las 4 ocurrencias de [`occupancy.py`](apps/api/modules/pos/occupancy.py) (líneas 18, 55, 65, 116) y en el cutoff de `CashSession` de [`router.py`](apps/api/modules/pos/router.py:255). **Paso 0 de verificación:** se comprobó que el contenedor `rderico-api-dev` (servicio `api`) corre en **UTC** (`now` y `utc` coinciden), por lo que el valor es idéntico; el cambio solo hace **explícita** la intención y elimina la dependencia accidental de la TZ del host.
- **Fase 3 — H1 (primitivo `currentUserId`):** Se introdujo `const currentUserId = currentUser?.id;` y se usó como dependencia **primitiva y estable** en los dos efectos de [`useTerminalLocking.js`](apps/pos/hooks/useTerminalLocking.js) (`checkMyLock` y `sendHeartbeat`) y en el `useCallback` de folio de [`usePOSSession.js`](apps/pos/hooks/usePOSSession.js:158). Los efectos siguen leyendo el valor actual vía `currentUserRef.current?.id`, evitando re-registros por cambio de referencia.
- **Fase 4 — H7 (`heartbeatTerminal` señala fallo):** [`heartbeatTerminal`](apps/pos/services/POSService.js:117) ahora **lanza** `Error` cuando `!res.ok`, en lugar de devolver `false` en silencio. El llamador captura el error y **NO re-adquiere** el candado (regla anti-ping-pong), pero ahora puede registrarlo/observarlo.
- **Fase 5 — H8 (403 espurios documentados):** Se añadió la subsección [§5.6 403 Espurios en `unlock`](#56-403-espurios-en-unlock-comportamiento-esperado--no-es-un-bug) y un comentario explicativo en el endpoint [`release_terminal_lock`](apps/api/modules/pos/router.py:316).
- **Fase 6 — H4/H5/H6 (consistencia documental):** Se corrigió el análisis forense (H4), se añadió la **REGLA DE TIMESTAMPS** a §5.3 (H5) y se agregaron 5 ítems al checklist de revisión (H6).
- **Fase 7 — Tests guardianes:** Se creó [`useTerminalLocking.v15.test.js`](apps/pos/hooks/useTerminalLocking.v15.test.js) con **18 tests** que replican las funciones puras `buildBeforeUnloadPayload`, `resolveHeartbeat`, `handleUnlockResult` y `resolveLockCheck`, cubriendo H1/H3/H7/H8.

**Evidencia de aceptación:**
- `npm test` → **503 passed** (15 archivos), incluidos los 18 tests nuevos.
- `npm run build` → **built in 9.34s**, sin errores JSX.
- `docker compose exec -T api python -m py_compile modules/pos/occupancy.py modules/pos/router.py` → **COMPILE_OK**.
- `docker compose exec -T api python -c "from modules.pos.occupancy import utcnow..."` → **IMPORT_OK**.
- **Paso 0 (TZ):** `now= 2026-09-20 04:21:22.267665` / `utc= 2026-09-20 04:21:22.267685+00:00` → coinciden → contenedor en **UTC**.

**Lección (Nuevas Reglas Arquitectónicas Derivadas):**
- **OBLIGATORIO** que las deps de todo efecto con `setInterval`/`setTimeout` y de todo `useCallback` usen **primitivos estables** (`currentUserId`), nunca el **objeto** completo (`currentUser`). Un cambio de referencia no debe re-registrar temporizadores.
- **OBLIGATORIO** usar `utcnow()` (helper centralizado) para **todo** timestamp de lógica de negocio. **PROHIBIDO** `datetime.now()` (hora local naive) en el backend.
- **OBLIGATORIO** que todo payload de guardado de emergencia (`sendBeacon`/`beforeunload`) incluya `terminal_id`.
- **OBLIGATORIO** que toda función de red señale el fallo **explícitamente** (lanzar o retornar un contrato discriminado). **PROHIBIDO** devolver `false` en silencio ante un `404`/`403`.
- **OBLIGATORIO** documentar como "comportamiento esperado" todo código de estado que parezca un error (p. ej. el `403` de `unlock`) para evitar "correcciones" que rompan la regla anti-ping-pong.
- **OBLIGATORIO** que todo hallazgo de auditoría quede reflejado en el **checklist de revisión** para que no reaparezca.

**Archivos involucrados:** `apps/pos/hooks/useBeforeUnload.js`, `apps/api/modules/pos/occupancy.py`, `apps/api/modules/pos/router.py`, `apps/pos/hooks/useTerminalLocking.js`, `apps/pos/hooks/usePOSSession.js`, `apps/pos/services/POSService.js`, `apps/pos/hooks/useTerminalLocking.v15.test.js` (nuevo), `ESPECIFICACIONES DEL PROYECTO/PLAN_CORRECCION_TERMINALES_V15.md`, `ESPECIFICACIONES DEL PROYECTO/REPORTE_EJECUCION_TERMINALES_V15.md`.

---

### Incidente Asimetría de Limpieza de Sesión — "Frágil por Acumulación" (20/Septiembre/2026) — v17

**Terminales afectadas:** Todas (T1, T2, CAJA) — rutas de salida de sesión del POS.
**Síntoma:** No hubo un bug reproducible en producción. Este incidente nace de una **auditoría preventiva** de la limpieza de estado al salir de una sesión de captura. Se descubrió que la limpieza estaba **escrita a mano en 5 rutas distintas**, y que cada ruta limpiaba un **subconjunto diferente** de valores. La más grave: la rama `success` de `handleTicketAction` **NO** limpiaba `savedTicketRef.current`, `showExitModal` ni `pendingExitAction`, mientras `handleExitWithoutSaving` **SÍ** los limpiaba.

**El problema de fondo — "frágil por acumulación":**
Cada vez que se añadía una ruta de salida nueva (o un valor de estado nuevo), había que recordar actualizar **los 5 espejos manuales**. Nadie lo garantizaba. El resultado fue una **asimetría silenciosa**: dos rutas que debían hacer lo mismo hacían cosas distintas. No rompía nada visible hoy, pero era una **bomba de tiempo**: cualquier valor de estado nuevo que se añadiera en el futuro podía quedar sin limpiar en alguna ruta, contaminando la siguiente cuenta.

**Análisis Forense:**

| ID | Hallazgo | Gravedad | Naturaleza |
|----|----------|----------|------------|
| **A1** | La limpieza de sesión estaba duplicada a mano en **5 rutas** (`handleExitWithoutSaving`, rama `success` de `handleTicketAction`, `doTerminalExit`, `handleForceLogout`, `window.requestPOSExit`). | Alta (latente) | Deuda técnica estructural |
| **A2** | **Asimetría verificada:** la rama `success` NO limpiaba `savedTicketRef.current` / `showExitModal` / `pendingExitAction`; `handleExitWithoutSaving` SÍ. | Alta (latente) | Bug latente real |
| **A3** | `doTerminalExit` limpiaba solo **3 valores** a mano, ignorando el resto del contrato de limpieza. | Media (latente) | Bug latente real |
| **A4** | No existía una **fuente única de verdad** para "cómo se limpia una sesión". Cada ruta era un "espejo" que podía desincronizarse. | Alta (latente) | Deuda técnica estructural |
| **A5** | El hallazgo H2 de v15 (`datetime.now()` → `utcnow()`) se aplicó **solo a `occupancy.py`**; quedaron **3 usos residuales** en `router.py` (×2) y `pos_audit.py` (×1). | Media (latente) | Consistencia de zona horaria |

**Solución implementada (v17 — 6 fases):**

- **Fase 0 — Reproducción (BLOQUEANTE):** Se creó [`sessionReset.asymmetry.test.js`](apps/pos/state/sessionReset.asymmetry.test.js), que **reprodujo** la asimetría A2 leyendo el código fuente (8 tests). Se documentó el baseline: **503 tests**, build **8.52s**.
- **Fase 1 — Fuente única (`buildResetPatch`):** Se creó [`apps/pos/state/sessionReset.js`](apps/pos/state/sessionReset.js) con la función **pura** `buildResetPatch()`, que devuelve el conjunto **exacto** de 12 valores de reset (incluidos los 3 que faltaban: `savedTicket`, `showExitModal`, `pendingExitAction`). Se exportan además `RESET_PATCH_KEYS` y `FORBIDDEN_PATCH_KEYS` (límite explícito: NO toca carrito, catálogo, impresión ni UI). Se creó [`sessionReset.test.js`](apps/pos/state/sessionReset.test.js) (4 tests: 12 claves, valores correctos, sin claves prohibidas, pureza).
- **Fase 2a — Ruta 1 (`handleExitWithoutSaving`):** Se reemplazó la limpieza manual por `buildResetPatch()` + sincronización explícita de refs. Se creó [`sessionReset.equivalence.test.js`](apps/pos/state/sessionReset.equivalence.test.js) probando que el estado resultante es **idéntico** al de la limpieza vieja.
- **Fase 2b — Ruta 2 (rama `success` de `handleTicketAction`):** Se aplicó el patch y se **corrigió la asimetría A2**. Se descubrió que `setShowExitModal`/`setPendingExitAction` **no estaban** en las props del hook; se añadieron al hook y al call site en [`RetailVisionPOS.jsx`](apps/pos/RetailVisionPOS.jsx). El test de asimetría se actualizó de "reproducir" a "guardar la corrección".
- **Fase 2c — Ruta 3 (`doTerminalExit`):** Se aplicó el patch (antes limpiaba solo 3 valores — hallazgo A3).
- **Fase 3 — Tests de arquitectura (best-effort):** Se creó [`apps/pos/state/architecture.test.js`](apps/pos/state/architecture.test.js) (8 tests) con regex **ancladas y con contexto**. **HALLAZGO NUEVO (A5):** el test falló en la primera corrida, destapando los 3 `datetime.now()` residuales. Se corrigieron los 3 usando `utcnow()`.
- **Fase 4 — Validación manual:** Los **5 flujos de salida** validados en navegador → **5/5 OK, cero residuos** entre sesiones.
- **Fase 5 — Documentación y respaldo:** Este incidente, la Regla 19, los ítems del checklist y el reporte de ejecución.

**Evidencia de aceptación:**
- `npm test` → **533 passed** (19 archivos), frente a **503** del baseline (+30 tests).
- `npm run build` → **built in 8.78s**, sin errores.
- **Asimetría reproducida** en Fase 0 (8/8 tests) y **corregida** en Fase 2b.
- **Equivalencia** de las 3 rutas migradas verificada por test (10 tests).
- **5 flujos de salida** validados manualmente: 5/5 OK, cero residuos.

**Lección (Nuevas Reglas Arquitectónicas Derivadas):**
- **OBLIGATORIO** que la limpieza de sesión del POS se haga **exclusivamente** vía `buildResetPatch()`. **PROHIBIDO** limpiar el estado de sesión a mano en cualquier ruta de salida.
- **OBLIGATORIO** que toda ruta de salida nueva aplique `buildResetPatch()` y sincronice las refs explícitamente (la función es pura y no puede tocarlas).
- **OBLIGATORIO** que todo valor de estado nuevo que deba resetearse se añada a `buildResetPatch()` **y** a `RESET_PATCH_KEYS`; el test de contrato fallará si no.
- **PROHIBIDO** añadir a `buildResetPatch()` valores de catálogo, carrito, impresión o UI (ver `FORBIDDEN_PATCH_KEYS`).
- **OBLIGATORIO** que todo hallazgo de auditoría quede reflejado en el **checklist de revisión** para que no reaparezca.

**Archivos involucrados:** `apps/pos/state/sessionReset.js` (nuevo), `apps/pos/state/sessionReset.test.js` (nuevo), `apps/pos/state/sessionReset.asymmetry.test.js` (nuevo), `apps/pos/state/sessionReset.equivalence.test.js` (nuevo), `apps/pos/state/architecture.test.js` (nuevo), `apps/pos/RetailVisionPOS.jsx`, `apps/pos/hooks/useTicketActions.js`, `apps/api/modules/pos/router.py`, `apps/api/modules/pos/pos_audit.py`, `ESPECIFICACIONES DEL PROYECTO/PLAN_CORRECCION_ESTADO_POS_V17.md`, `ESPECIFICACIONES DEL PROYECTO/REPORTE_EJECUCION_ESTADO_POS_V17.md`.

### Cierre del Contrato de Limpieza de Sesión — `handleForceLogout` (20/Septiembre/2026) — v18

**Contexto:** El v17 centralizó la limpieza en `buildResetPatch()` en **3 de las 5 rutas** de salida. Quedó pendiente `handleForceLogout`, que limpiaba **implícitamente** (vía desmontaje del componente `RetailVisionPOS` al hacer logout el padre), no por contrato explícito.

**Hallazgo (A6):**

| # | Hallazgo | Severidad | Tipo |
|----|----------|-----------|------|
| **A6** | `handleForceLogout` era la única ruta de salida que NO aplicaba `buildResetPatch()`. Su corrección dependía de una **suposición implícita**: que `onForceLogout()` desmonta el componente, matando el estado local. La cadena de desmontaje tiene 5 eslabones (modal sin "cancelar" → `onForceLogout` → prop del padre → `setIsAuthenticated(false)` → desmontaje) que **nadie garantiza**. | Baja (latente) | Deuda técnica preventiva |

**Naturaleza del hueco:** **latente, no activo.** Hoy el force logout **siempre** desmonta (el modal no permite cancelar), así que el estado local siempre muere. El hueco se materializaría solo si el componente se mantuviera montado (refactor de layout, keep-alive) o si `onForceLogout` cambiara a un `navigate()` que no desmonta. La corrección es **preventiva**.

**Solución implementada (v18 — 4 fases):**

- **Fase 0 — Reproducción (BLOQUEANTE):** Se creó el tag `pre-v18-estado-pos` (→ `23be478`). Baseline: **533 tests**, build **9.81s**. Se añadieron **8 tests** al `describe` "v18" de [`architecture.test.js`](apps/pos/state/architecture.test.js). **Reconciliación empírica:** la predicción del plan (6 rojos + 2 verdes) era incorrecta; la ejecución real dio **5 rojos funcionales (2,3,4,5,6) + 3 verdes de invariante (1,7,8)**. Los tests 7 y 8 verifican invariantes que ya se cumplían (el bloque ya terminaba en `onForceLogout();`; las rutas de v17 ya contenían el patch).
- **Fase 1 — Migración:** [`handleForceLogout`](apps/pos/RetailVisionPOS.jsx:450) ahora aplica `buildResetPatch()` en un **PASO 2** explícito (orden estricto: **beacon → limpieza → `onForceLogout()`**). Se sincronizan las 5 refs a mano. Se añadió el extractor `extractForceLogoutFull` (incluye el cierre de la función) para el test de última sentencia.
- **Fase 2 — Documentación de código:** Se actualizó el encabezado de [`sessionReset.js`](apps/pos/state/sessionReset.js) para declarar el contrato **CERRADO** (las 4 rutas de limpieza aplican el patch).
- **Fase 3 — Validación manual (PENDIENTE):** Los 5 flujos de salida (3 de v17 + force logout + cierre de pestaña) deben validarse en navegador. **Aún no ejecutada** — requiere interacción humana. Los tests de arquitectura cubren el contrato a nivel de código, pero la validación empírica en navegador queda pendiente.
- **Fase 4 — Documentación y respaldo:** Este incidente, la actualización de la Regla 19, los ítems del checklist y el respaldo en GitHub.

**Evidencia de aceptación:**
- `npm test` → **541 passed** (19 archivos), frente a **533** del baseline (+8 tests).
- `npm run build` → **built in 9.81s**, sin errores.
- **5 rojos funcionales** en Fase 0 (tests 2,3,4,5,6) → **verdes** en Fase 1.
- **Test de asimetría (O4)** de v17 sigue verde (18 tests en `sessionReset.*`).
- **Diff limpio:** solo `RetailVisionPOS.jsx` modificado (52 inserciones, 1 deleción) — las 3 rutas de v17 intactas.
- **5 flujos de salida:** validación manual en navegador **pendiente** (Fase 3). El contrato está verificado por los 8 tests de arquitectura; la comprobación empírica de residuos en navegador queda por hacer.

**Lección (Nuevas Reglas Arquitectónicas Derivadas):**
- **OBLIGATORIO** que toda ruta de salida limpie **por contrato explícito** (`buildResetPatch()`), **nunca** confiando en el desmontaje del componente como mecanismo de limpieza.
- **OBLIGATORIO** que el beacon de emergencia se construya **antes** de la limpieza (el payload debe contener los items vivos).
- **OBLIGATORIO** que `onForceLogout()` sea la **última** sentencia de `handleForceLogout` (el logout del padre es un `setState` asíncrono; un desmontaje síncrono futuro perdería la limpieza).
- **LECCIÓN DE PROCESO:** la clasificación de un test como rojo→verde debe **verificarse ejecutándolo**, no razonándolo. El plan v18 predijo mal 3 de 8 tests; la ejecución lo corrigió.

**Archivos involucrados:** `apps/pos/RetailVisionPOS.jsx`, `apps/pos/state/architecture.test.js`, `apps/pos/state/sessionReset.js`. Los artefactos de proceso (plan v18 y sus 3 revisiones críticas) fueron **eliminados del repositorio** tras la ejecución, ya que su contenido quedó absorbido por esta documentación (mismo criterio que la limpieza de v13-v17).

---

## 3.5. INCIDENTE v19 — REDUNDANCIA EN `doTerminalExit` Y DECISIÓN SOBRE LA ASIMETRÍA A3

**Contexto:** Tras cerrar el contrato de limpieza en v18 (las 4 rutas aplican `buildResetPatch()`), quedó documentada una **deuda residual** con dos componentes: (a) una **redundancia** en `doTerminalExit`, y (b) una **asimetría** en la rama `success` de `handleTicketAction`. El v19 se abrió para decidir si ambos debían corregirse.

**Hallazgos (verificados empíricamente, no razonados):**

| # | Hallazgo | Severidad | Tipo | Decisión v19 |
|----|----------|-----------|------|--------------|
| **R1** | `doTerminalExit` ejecutaba `localStorage.removeItem(\`pos_cart_${selectedTerminal}\`)` **además** de `clearCart()`, que ya borra esa misma clave (`useCart.js`: `removeItem(storageKey)`, `storageKey = pos_cart_${terminalId}`). Redundancia histórica de 1 línea. | Baja (latente) | Defecto real | **CORREGIDO** |
| **A3** | La rama `success` de `handleTicketAction` aplica **1 ref** (`savedTicketRef`); las otras 3 rutas aplican **5 refs**. | Ninguna | Inconsistencia de **estilo** | **ACEPTADA** (no se corrige) |

**Solución implementada (v19 — alternativa mínima, 4 fases):**

- **Fase 0 — Reproducción (BLOQUEANTE):** HEAD verificado = `1dcbbb9`. Baseline: **541 tests** (19 archivos), build **9.23s**. Se añadieron **5 tests** al `describe` "v19" de [`architecture.test.js`](apps/pos/state/architecture.test.js). **Reconciliación empírica:** el test 3 ("NO duplica la clave del carrito") **FALLÓ** (rojo); los tests 1, 2, 4 y 5 pasaron. Rojo verificado por ejecución, no por razonamiento.
- **Fase 1 — Corrección:** Se **eliminó la línea redundante** de [`doTerminalExit`](apps/pos/RetailVisionPOS.jsx:349). `clearCart()` sigue siendo la **fuente real** del borrado del carrito; `doTerminalExit` conserva el borrado de `pos_session_` (que `clearCart()` NO toca). Rojo→verde verificado: **546 tests** verdes.
- **Fase 2 — Documentación de código:** Se añadió una sección v19 al encabezado de [`sessionReset.js`](apps/pos/state/sessionReset.js) que **documenta la asimetría A3 como inconsistencia de estilo ACEPTADA**, con la justificación técnica (el `useEffect` de `RetailVisionPOS.jsx:95` re-sincroniza `cartRef.current = cart` automáticamente tras `clearCart()`).
- **Fase 4 — Documentación y respaldo:** Este incidente, la actualización de la Regla 19, los ítems del checklist y el respaldo en GitHub.

**¿Por qué la asimetría A3 NO es un bug?** Verificado en [`RetailVisionPOS.jsx:95`](apps/pos/RetailVisionPOS.jsx:95):
```js
React.useEffect(() => { cartRef.current = cart; }, [cart]);
```
`clearCart()` hace `setCartState(items: [])` → `cart` cambia de referencia → el `useEffect` se dispara → `cartRef.current = []`. Por tanto `cartRef` se limpia **automáticamente** tras `clearCart()`. La rama `success` no necesita escribirlo. Lo mismo aplica a `accountNumRef`/`originalCapturerRef`/`ticketVersionRef`, que tienen sus propios `useEffect` de re-sincronización (l.96-98).

**¿Por qué NO se corrigió la asimetría A3?** Corregirla exigiría tocar la rama `success` — la ruta de **CADA VENTA** — sin beneficio funcional, añadiendo riesgo a la ruta crítica. El único defecto **real** era la redundancia R1 (1 línea), que sí se corrigió.

**Evidencia de aceptación:**
- `npm test` → **546 passed** (19 archivos), frente a **541** del baseline (+5 tests).
- `npm run build` → **built in 9.23s**, sin errores.
- **1 rojo funcional** en Fase 0 (test 3) → **verde** en Fase 1.
- **Diff limpio:** solo `RetailVisionPOS.jsx` (1 deleción + comentario), `sessionReset.js` (encabezado) y `architecture.test.js` (+5 tests).

**Lección (Nuevas Reglas Arquitectónicas Derivadas):**
- **OBLIGATORIO** que cada ruta de salida borre **solo** las claves que le corresponden. `clearCart()` es la fuente única del borrado de `pos_cart_`; ninguna ruta debe duplicarlo.
- **LECCIÓN DE PROCESO (reincidente):** 4 versiones del plan v19 fueron rechazadas por verificar lo mecánico (existencia de símbolos) y **asumir lo semántico** (que un cambio "no tiene impacto funcional"). La lección de v18 ("clasificar un test como rojo→verde debe verificarse ejecutándolo") se extendió a **toda afirmación de impacto**: debe verificarse leyendo el código, no razonarse.
- **LECCIÓN DE ALCANCE:** ante una deuda residual con un defecto real (R1) y una inconsistencia de estilo (A3), el alcance correcto es **corregir el defecto y documentar la inconsistencia**, no refactorizar la ruta crítica por simetría estética.

**Archivos involucrados:** `apps/pos/RetailVisionPOS.jsx`, `apps/pos/state/architecture.test.js`, `apps/pos/state/sessionReset.js`. Los artefactos de proceso (plan v19 y sus 4 revisiones críticas) fueron **eliminados del repositorio** tras la ejecución, ya que su contenido quedó absorbido por esta documentación (mismo criterio que la limpieza de v13-v18).

## 3.6. INCIDENTE v20 — GUARDIÁN DE SIMETRÍA DE LA APLICACIÓN DEL PATCH

**Contexto:** Tras v19, la deuda residual "frágil por acumulación" seguía teniendo un componente vivo: `buildResetPatch()` centraliza los **VALORES** de la limpieza, pero cada una de las **4 rutas de salida** los **APLICA** a mano (11 setters + refs). Añadir una clave a `RESET_PATCH_KEYS` exige recordar aplicarla en las 4 rutas; nada lo garantizaba.

**Dos opciones evaluadas (con revisión crítica previa a tocar código):**

| Opción | Descripción | Veredicto de la revisión crítica |
|--------|-------------|----------------------------------|
| **B** | Crear `applyResetPatch()` y aplicarlo a las 3 rutas de `RetailVisionPOS.jsx` (dejar la rama `success` intacta). | **RECHAZADO** — 2 defectos **fatales**: (D1) rompe **11 aserciones** en 2 archivos de test que verifican la presencia literal de `setXxx(patch.xxx)` en el código fuente; (D2) el test de equivalencia resultaba irrealizable sin un harness. |
| **A** | **Guardián de simetría**: un test que verifica que las 4 rutas aplican el mismo conjunto de setters derivado de `RESET_PATCH_KEYS`. **Aditivo**: no toca código de producción. | **APROBADO CON CORRECCIONES** — 0 fatales. |

**Decisión:** Opción A. 90% del beneficio (detecta la desincronización), 10% del coste (un test), **cero riesgo** de romper tests existentes.

**Solución implementada (v20 — guardián aditivo, 4 fases):**

- **Fase 0 — Reproducción (BLOQUEANTE):** HEAD verificado = `b9cc796`. Baseline: **546 tests** (19 archivos). Se añadió el `describe` "v20" a [`architecture.test.js`](apps/pos/state/architecture.test.js) con **6 tests**.
  - **Hallazgo de la prueba de mutación (defecto del propio guardián):** la primera versión usaba `toContain` sobre el bloque **crudo**. Al comentar temporalmente `setPendingExitAction(patch.pendingExitAction)` con `//`, el substring **seguía presente en el comentario** y el test **PASABA** (falso verde). Se corrigió añadiendo el helper `stripJsComments()` (elimina `//` y `/* */`) y aplicándolo a cada bloque extraído. **Re-ejecutada la mutación: el guardián FALLÓ** con el mensaje exacto `Ruta handleExitWithoutSaving (RetailVisionPOS.jsx): falta aplicar setPendingExitAction(patch.pendingExitAction)`. Rojo verificado por ejecución.
- **Fase 1 — Verificación:** Mutación revertida → **552 tests** verdes (546 + 6 nuevos). `npm run build` → **built in 9.27s**, sin errores.
- **Fase 2 — Documentación:** Esta sección, la Regla 20 y los ítems del checklist.
- **Fase 3 — Respaldo:** Commit y push a GitHub.

**Cómo funciona el guardián (algoritmo):**
```js
function setterNameFor(key) {
    return 'set' + key.charAt(0).toUpperCase() + key.slice(1);
}
const REF_KEYS = { savedTicket: 'savedTicketRef' };
for (const key of RESET_PATCH_KEYS) {
    if (REF_KEYS[key]) {
        expect(block).toContain(`${REF_KEYS[key]}.current = null`);
    } else {
        expect(block).toContain(`${setterNameFor(key)}(patch.${key})`);
    }
}
```
El guardián lee **dos archivos** (`RetailVisionPOS.jsx` para 3 rutas + `useTicketActions.js` para la rama `success`) y verifica **6 invariantes**: (1) las 4 rutas se localizan; (2) las 4 parten de `buildResetPatch()`; (3) las 4 aplican los **11 setters**; (4) las 4 limpian `savedTicketRef`; (5) `RESET_PATCH_KEYS` tiene 12 claves (11 setters + 1 ref); (6) **anti-regresión**: ninguna ruta aplica un setter ajeno al patch.

**¿Por qué el guardián verifica SETTERS pero solo 1 ref?** Porque la asimetría A3 (v19) es una inconsistencia de **estilo aceptada**: la rama `success` aplica 1 ref y las otras 3 aplican 5, pero el `useEffect` de re-sincronización ([`RetailVisionPOS.jsx:95`](apps/pos/RetailVisionPOS.jsx:95)) limpia las demás automáticamente. El único ref que las 4 rutas **deben** limpiar explícitamente es `savedTicketRef`.

**Evidencia de aceptación:**
- `npx vitest run` → **552 passed** (19 archivos), frente a **546** del baseline (+6 tests).
- `npm run build` → **built in 9.27s**, sin errores.
- **Prueba de mutación:** mutar 1 setter → guardián **ROJO** (mensaje preciso); revertir → **VERDE**.
- **Diff limpio:** solo `architecture.test.js` (+6 tests + helper `stripJsComments`). **Cero cambios en código de producción.**

**Lección (Nuevas Reglas Arquitectónicas Derivadas):**
- **OBLIGATORIO** que todo guardián basado en `toContain` sobre código fuente **elimine los comentarios** antes de aseverar. Un substring dentro de un comentario produce un **falso verde** (verificado empíricamente en v20).
- **LECCIÓN DE PROCESO:** la revisión crítica **previa** a tocar código evitó ejecutar la Opción B, que habría roto 11 aserciones. El protocolo (plan → revisión → reformular) demostró su valor: el coste de la revisión fue mínimo frente al coste de romper 11 tests.
- **LECCIÓN DE ALCANCE:** ante una deuda de "frágil por acumulación", un **guardián aditivo** (que detecta la desincronización sin refactorizar) ofrece la mayor parte del beneficio con **cero riesgo** sobre la ruta crítica.

**Archivos involucrados:** `apps/pos/state/architecture.test.js` (único archivo modificado). Los artefactos de proceso (plan v20 y su revisión crítica) fueron **eliminados del repositorio** tras la ejecución, ya que su contenido quedó absorbido por esta documentación (mismo criterio que la limpieza de v13-v19).

## 4. LAS REGLAS DE ORO SUPERVIVIENTES (v6.0)

A pesar de la simplificación, estas reglas de ingeniería siguen siendo **obligatorias** en la v6.0:

### ⚡ REGLA 1: Referencias Mutables (`useRef`) vs Closures
Aunque ya no hay timer de auto-save, React sigue siendo asíncrono. **Nunca** leas el carrito desde una variable de estado dentro de la lógica de finalización.
- ✅ OBLIGATORIO: Usar `cartRef.current`, `accountNumRef.current`, `ticketVersionRef.current`.
- ⛔ PROHIBIDO: Usar `cart`, `currentAccountNum` dentro de `handleTicketAction`.

### ⚡ REGLA 2: Mutex para Acciones Finales
El cobro y el envío al pizarrón (`handleTicketAction`) todavía usan `actionMutexRef`.
Esto evita que un cajero desespere, dé doble clic en "Cobrar", y se generen dos registros de pago para la misma cuenta.

### ⚡ REGLA 3: Zero-Loss en Acciones Finales
Cuando se cobra o se manda al pizarrón explícitamente, la UI **nunca** debe hacer `clearCart()` hasta que la petición HTTP finalice con éxito **Y se verifique que el ticket existe en el servidor** (v6.1).

### ⚡ REGLA 4: El Candado Anti-Wipe (v4.6)
Si el cajero pierde internet y presiona F5, React se reinicia con `cart = []`.
Para evitar que eso borre el carrito almacenado en `localStorage`, `useCart.js` tiene un candado estricto: `cartState.key === storageKey`. El localStorage jamás se sobreescribe hasta que el estado se haya hidratado primero.

### ⚡ REGLA 5: Visibilidad en el Pizarrón (DRAFT vs OPEN)
Debido a la persistencia atómica por ítem, un ticket se crea en la base de datos desde que se escanea el primer producto. Para evitar que dos personas abran y editen el mismo ticket al mismo tiempo, el ticket se mantiene en estado `DRAFT` y **NO es visible** en el Pizarrón de las demás terminales.
El ticket **solo cambia a estado `OPEN` (y se vuelve visible en el Pizarrón)** cuando el cajero da clic explícitamente en el botón "Guardar en Pizarrón". Esto previene colisiones multi-usuario de raíz.

### ⚡ REGLA 6: Protección Contra Olvidos (Exit Modal) — v7.0.3
Como ahora se requiere una acción explícita para mandar una cuenta al Pizarrón, es frecuente que el personal olvide hacerlo y deje tickets en estado `DRAFT` huérfanos. Para remediarlo, el sistema cuenta con una protección: si un usuario intenta **salir del sistema** o **cambiar de terminal** teniendo un carrito con productos no enviados, se lanza un Modal de Advertencia bloqueante. Este modal le obliga a elegir entre "Enviar al Pizarrón y salir", "Salir perdiendo la cuenta", o "Cancelar".

**Garantía v7.0.3 (endurecimiento crítico):** La opción "Enviar al Pizarrón y salir" **solo** ejecuta la salida si `handleTicketAction('OPEN')` retorna `{ outcome: 'success' }`. **PROHIBIDO** asumir que "no lanzar excepción" equivale a éxito: los fallos de negocio (carrito vacío, folio ya pagado, verificación post-envío fallida) retornan **sin lanzar**. Si el envío no se confirma, la cuenta **permanece abierta** y se muestra un error visible.
- ✅ OBLIGATORIO: `if (result?.outcome === 'success')` antes de ejecutar `pendingExitAction()`.
- ✅ OBLIGATORIO: Toda rama de limpieza de UI (salir sin guardar) es un **espejo explícito y completo** del estado + refs que limpia la rama de éxito.
- ✅ OBLIGATORIO: El **backdrop** del modal limpia `pendingExitAction` igual que el botón "Cancelar".
- ✅ OBLIGATORIO: El **force logout** (terminal tomada por otro usuario) dispara un `sendBeacon` fire-and-forget a `/pos/tickets/emergency-save` con `terminal_id`, sin bloquear el logout.
- ⛔ PROHIBIDO: Ejecutar el logout/cambio de terminal tras un envío cuyo `outcome` no sea `'success'`.

### ⚡ REGLA 7: El "Draft Guard" (Blindaje Backend)
Por seguridad en la API, un ticket en estado `DRAFT` tiene un "dueño" (la terminal que lo creó). El backend (`_upsert_ticket_header`) prohíbe estrictamente que una terminal intente cobrar (`PAID`) un `DRAFT` que pertenece a otra terminal. Si Terminal B quiere cobrar la cuenta de Terminal A, Terminal A primero debe mandarla al Pizarrón (`OPEN`). Esto evita el "robo" accidental de tickets en progreso a nivel base de datos.

### ⚡ REGLA 8: Garbage Collector (Limpieza de Zombis)
Para evitar que la base de datos se llene de basura por pestañas cerradas bruscamente, el backend ejecuta un *Garbage Collector* silencioso cada vez que se reserva un folio (con un acelerador máximo de 1 vez por minuto). Este proceso:
1. Elimina físicamente los tickets vacíos (sin productos) que tengan más de 1 hora de antigüedad.
2. Cambia a estado `CANCELLED` los tickets `DRAFT` con productos que tengan más de 24 horas de abandono (configurable vía `pos_draft_ttl_days` en `SystemSetting`). Esto evita cuentas fantasma pero mantiene el registro para auditoría.

### ⚡ REGLA 9: Sync Obligatorio de `cartRef` en Recuperación (v4.5)
Cuando se recupera una cuenta del Pizarrón o se ejecuta un auto-heal por conflicto 409, `cartRef.current` debe sincronizarse **ANTES** de llamar a `setCart()`.
- ⛔ PROHIBIDO: `setCart(recovered)` sin sincronizar `cartRef` primero.
- ✅ OBLIGATORIO: `cartRef.current = recovered` seguido de `setCart(recovered)`.

**¿Por qué?** `setCart()` es asíncrono en React. Si otra operación lee `cartRef.current` entre el `setCart` y el siguiente render, leería datos obsoletos.

### ⚡ REGLA 10: Búsqueda Exacta por `account_num` (v4.5)
Para recuperar un ticket por su folio (recovery o auto-heal), se usa el endpoint `/tickets/by-account/{account_num}` con búsqueda exacta (`==`).
- ⛔ PROHIBIDO: Buscar tickets con `ilike('%V1300%')` para recovery. Esto coincide con V1300, V13000, V13001 y devuelve el ticket equivocado.
- ✅ OBLIGATORIO: Usar el endpoint de búsqueda exacta que retorna el ticket correcto o HTTP 404.

### ⚡ REGLA 11: Reciclaje de Tickets — Máximo 5 Minutos (v4.8)
Cuando una terminal reserva un folio, el sistema intenta reciclar un ticket vacío existente antes de generar uno nuevo. Sin embargo, solo se reciclan tickets creados hace **menos de 5 minutos**.
- ⛔ PROHIBIDO: Reciclar tickets vacíos sin límite de antigüedad (un ticket viejo pudo haber sido pagado y liberado en otro ciclo).
- ✅ OBLIGATORIO: Filtro `created_at >= (now - 5min)` en `_find_empty_ticket()`.

### ⚡ REGLA 12: Verificación Post-Envío al Pizarrón (v6.1)
Después de que `createTicket()` retorna éxito, el sistema debe hacer un `GET` de verificación para confirmar que el ticket existe en la base de datos antes de limpiar el carrito.
- ✅ OBLIGATORIO: Verificar existencia del ticket con `posService.getTicketByAccountNum(folio)` antes de `clearCart()`.
- ⛔ PROHIBIDO: Confiar ciegamente en el HTTP 200 de `createTicket()` sin verificar que el commit de PostgreSQL fue exitoso.
- Si la verificación falla: NO limpiar el carrito, mostrar alerta visible de 10+ segundos.

**¿Por qué?** El incidente de la cuenta fantasma $453 demostró que un HTTP 200 no garantiza que los datos persistan si hay problemas de red intermitentes o fallos de commit en la DB. La verificación añade ~50ms de latencia pero previene pérdida de datos.

### ⚡ REGLA 13: Bloqueo de Botón Sin Conexión (v6.1)
El botón "Enviar Cuenta" (Guardar en Pizarrón) debe estar **físicamente deshabilitado** cuando `lastSaveStatus === 'failed'`.
- ✅ OBLIGATORIO: `disabled={... || hasUnsavedItems}` en el botón del Pizarrón.
- ✅ OBLIGATORIO: Banner rojo visible y persistente (no un toast efímero) cuando los items no se están guardando.
- ⛔ PROHIBIDO: Permitir enviar al Pizarrón cuando hay items que fallaron la persistencia atómica.

**¿Por qué?** Un toast que desaparece en 5 segundos es invisible en hora pico. El cajero debe ver un indicador FIJO y el botón debe ser INOPERABLE hasta que la conexión se restablezca y los items se persistan exitosamente.

### ⚡ REGLA 14: Inmutabilidad de la Terminal de Origen
El campo `terminal_id` de un Ticket **solo** se asigna en su creación (`_initialize_new_ticket`).
- ⛔ PROHIBIDO: Sobreescribir el `terminal_id` al actualizar o cobrar el ticket en `_update_ticket_fields`.
- ✅ OBLIGATORIO: Para registrar quién cobró, usar exclusivamente `cashed_by_id` y `cash_session_id`.

**¿Por qué?** Si la CAJA recauda un ticket creado por un vendedor en una tablet, y la base de datos sobreescribe el `terminal_id` a "CAJA", se destruye la trazabilidad física de las ventas y la auditoría.

### ⚡ REGLA 15: Respuesta Ligera en Operaciones Atómicas (v7.0)
Las operaciones atómicas de items (`addItemToTicket`, `updateItemQuantity`, `removeItemFromTicket`) **deben** devolver una respuesta ligera (`_get_lightweight_response`) con solo 5 campos: `id`, `account_num`, `version`, `total`, `status`.
- ⛔ PROHIBIDO: Devolver `_get_full_ticket()` (con JOINs pesados) desde operaciones atómicas. Esto satura PostgreSQL en hora rush.
- ⛔ PROHIBIDO: Cargar `selectinload(Product.technical_sheet)` en consultas del módulo POS. El POS no usa fichas técnicas desde respuestas de tickets — las carga desde el catálogo de productos.
- ✅ OBLIGATORIO: Las operaciones atómicas devuelven `TicketLightResponse` (schema Pydantic). El checkout (`createTicket`) sigue devolviendo `TicketResponse` completo porque necesita datos para impresión.
- ✅ OBLIGATORIO: Validación de productos al cobrar (`_get_items_and_total`) usa batch query `WHERE id IN(...)`, no N consultas individuales.

**¿Por qué?** Con 4-6 terminales escaneando rápido, cada `_get_full_ticket()` ejecutaba un SELECT con 5 JOINs anidados que el frontend descartaba — solo leía `.version`. Multiplicado por decenas de operaciones por segundo, esto saturaba PostgreSQL y causaba lentitud perceptible en el cobro.

### ⚡ REGLA 16: Retries Simétricos en Operaciones Atómicas (v7.0.1)
Las **tres** operaciones atómicas del POS (`handleAddToCart`, `handleUpdateQuantity`, `handleRemoveFromCart`) **deben** tener el mismo patrón de reintento: 3 intentos con backoff progresivo (1s, 2s, 3s).
- ⛔ PROHIBIDO: Que una operación atómica tenga retries y otra no. Esto crea una asimetría donde agregar un producto es resiliente pero cambiar su cantidad no lo es.
- ⛔ PROHIBIDO: Que cualquiera de las 3 operaciones marque `lastSaveStatus = 'failed'` al primer intento sin reintentar.
- ✅ OBLIGATORIO: Loop `for (attempt = 1..3)` con `await new Promise(r => setTimeout(r, 1000 * attempt))` entre intentos.
- ✅ OBLIGATORIO: Solo marcar `'failed'` después de agotar los 3 intentos.

**¿Por qué?** Sin retries simétricos, un micro-corte de red de 500ms durante hora pico causa que el cajero cambie una cantidad o borre un producto y el POS marque error inmediato (banner rojo + botón bloqueado), aunque la red se recupere 1 segundo después. Con retries, el sistema absorbe la interrupción silenciosamente.

**Archivos involucrados:**
- `handleAddToCart` → `useTicketActions.js` (ya tenía retries desde v6.0)
- `handleUpdateQuantity` → `RetailVisionPOS.jsx` (corregido en v7.0.1)
- `handleRemoveFromCart` → `RetailVisionPOS.jsx` (corregido en v7.0.1)
- **`withRetries.js`** → `apps/pos/utils/withRetries.js` (centralizado en v7.0.2)

### ⚡ REGLA 17: Auto-Reconciliación Post-Fallo (v7.0.2)
Cuando `lastSaveStatus === 'failed'`, el POS **debe** intentar reconciliar automáticamente el carrito local con el servidor después de un retraso de 10 segundos.
- ✅ OBLIGATORIO: Timer de 10s que primero verifica si el servidor responde (`/settings`), y si responde, descarga el ticket real vía `getTicketByAccountNum` y sobrescribe el carrito local.
- ✅ OBLIGATORIO: Si el ticket no existe en el servidor (items nunca persistidos), resetear `lastSaveStatus` a `'idle'` y notificar al cajero.
- ✅ OBLIGATORIO: Seguir la regla `cartRef.current = recovered` ANTES de `setCart(recovered)` (Regla 9).
- ⛔ PROHIBIDO: Hacer polling continuo para reconciliar. El timer se dispara UNA vez y se re-programa solo cuando `netStatus` cambia.
- ⛔ PROHIBIDO: Confundir esto con auto-save. Esto es RECOVERY post-fallo, no persistencia periódica.

**¿Por qué?** Sin reconciliación, el estado `'failed'` se queda atrapado indefinidamente: el banner rojo permanece, el botón de Pizarrón queda bloqueado, y el cajero tiene que agregar otro producto para “desbloquearse”. Además, las cantidades en pantalla pueden divergir del servidor si un `updateQuantity` falló tras los retries.

### ⚡ REGLA 18: Retries en Checkout con Filtro de Errores de Negocio (v7.0.2)
El checkout (`createTicket`) **debe** tener retries para errores de red, pero **NO debe** reintentar errores de lógica de negocio.
- ✅ OBLIGATORIO: Usar `withRetries` con `shouldRetry` que retorna `false` para errores que contengan `"ya ha sido pagado"` o `"Conflicto de versión"`.
- ✅ OBLIGATORIO: Los handlers de errores de negocio (auto-heal 409, folio pagado) permanecen intactos fuera del loop de retries.
- ⛔ PROHIBIDO: Reintentar un error 409 (Conflicto de versión) — el auto-heal ya lo maneja descargando datos frescos.
- ⛔ PROHIBIDO: Reintentar “ya ha sido pagado” — es una condición terminal legítima.

**¿Por qué?** Sin retries en checkout, agregar una Concha de $8 tiene 3 intentos pero cobrar una cuenta de $2,000 es todo-o-nada al primer intento. Un micro-corte de LAN de 500ms durante el cobro obliga al cajero a presionar “Cobrar” de nuevo manualmente.

### ⚡ REGLA 19: Limpieza Única de Sesión vía `buildResetPatch()` (v17, contrato CERRADO en v18, depurado en v19)
La limpieza del estado de sesión del POS **debe** hacerse **exclusivamente** a través de la función pura `buildResetPatch()` de [`apps/pos/state/sessionReset.js`](apps/pos/state/sessionReset.js). **PROHIBIDO** limpiar el estado de sesión a mano en cualquier ruta de salida.
- ✅ OBLIGATORIO: Toda ruta de salida (`handleExitWithoutSaving`, rama `success` de `handleTicketAction`, `doTerminalExit`, `handleForceLogout`) aplica `buildResetPatch()`. **Las 4 rutas están migradas** (v17: 3 rutas; v18: `handleForceLogout`). `window.requestPOSExit` NO es ruta de limpieza (es interceptor).
- ✅ OBLIGATORIO: Sincronizar las **refs** explícitamente en cada ruta (`cartRef`, `accountNumRef`, `originalCapturerRef`, `ticketVersionRef`, `savedTicketRef`). `buildResetPatch()` es **pura** y no puede tocarlas: define los VALORES, el llamador los APLICA.
- ✅ OBLIGATORIO: Todo valor de estado nuevo que deba resetearse se añade a `buildResetPatch()` **y** a `RESET_PATCH_KEYS`. El test de contrato fallará si no.
- ✅ OBLIGATORIO (v18): Toda ruta de salida limpia **por contrato explícito**, **nunca** confiando en el desmontaje del componente como mecanismo de limpieza. El desmontaje no es un contrato (no está documentado ni testeado).
- ✅ OBLIGATORIO (v18): En `handleForceLogout`, el beacon de emergencia se construye **antes** de la limpieza, y `onForceLogout()` es la **última** sentencia (el logout del padre es un `setState` asíncrono).
- ✅ OBLIGATORIO (v19): Cada ruta de salida borra **solo** las claves de `localStorage` que le corresponden. `clearCart()` es la **fuente única** del borrado de `pos_cart_`; **PROHIBIDO** duplicarlo con un `removeItem(\`pos_cart_...\`)` explícito en cualquier ruta. Guardián: `architecture.test.js` (describe "v19").
- ✅ OBLIGATORIO (v19): La asimetría A3 (la rama `success` aplica 1 ref; las otras 3 aplican 5) se **ACEPTA** como inconsistencia de **estilo**, NO como bug. Está justificada por el `useEffect` de re-sincronización de refs ([`RetailVisionPOS.jsx:95`](apps/pos/RetailVisionPOS.jsx:95)). **PROHIBIDO** "corregirla" tocando la rama `success` sin un defecto funcional demostrado.
- ⛔ PROHIBIDO: Añadir a `buildResetPatch()` valores de **catálogo** (`categories`, `initialProducts`, `activeCategory`), **carrito** (`cart`, `cartState`), **impresión** (`printTicketData`) o **UI** (`viewMode`, `currentPage`, `showCorkboard`, `allOpenAccounts`, `isCashEnabled`, `showGestorCaja`, `cashSessionId`, `showProgramacion`). Ver `FORBIDDEN_PATCH_KEYS`.
- ⛔ PROHIBIDO: Reintroducir "espejos" manuales de limpieza. Fueron la causa raíz de la asimetría A2 (la rama `success` no limpiaba `savedTicketRef`/`showExitModal`/`pendingExitAction`).

**¿Por qué?** Antes de v17, la limpieza estaba escrita a mano en **5 rutas**, cada una limpiando un subconjunto distinto. Era **frágil por acumulación**: cada valor de estado nuevo exigía recordar actualizar los 5 espejos, y nadie lo garantizaba. La asimetría resultante era una bomba de tiempo (contaminación de la siguiente cuenta). Con una fuente única, añadir un valor de reset es **una sola edición** y el test de contrato obliga a mantenerlo sincronizado. El v18 cerró el último hueco (A6): `handleForceLogout` limpiaba implícitamente vía desmontaje; ahora lo hace por contrato explícito. El v19 depuró la última redundancia (R1): `doTerminalExit` duplicaba el borrado de `pos_cart_` que `clearCart()` ya realiza; se eliminó. La asimetría A3 se documentó como inconsistencia de estilo aceptada (no un bug), evitando tocar la ruta crítica de cada venta por simetría estética.

### ⚡ REGLA 20: Guardián de Simetría de la Aplicación del Patch (v20)
`buildResetPatch()` centraliza los **VALORES**, pero cada ruta los **APLICA** a mano. Para que la desincronización no pase inadvertida, **debe** existir un guardián que verifique que las **4 rutas** aplican el **mismo conjunto** de setters derivado de `RESET_PATCH_KEYS`.
- ✅ OBLIGATORIO: El guardián deriva los setters de `RESET_PATCH_KEYS` (no los escribe a mano): `setterNameFor(key) = 'set' + key[0].toUpperCase() + key.slice(1)`.
- ✅ OBLIGATORIO: El guardián cubre las **4 rutas** leyendo **2 archivos**: [`RetailVisionPOS.jsx`](apps/pos/RetailVisionPOS.jsx) (`doTerminalExit`, `handleExitWithoutSaving`, `handleForceLogout`) y [`useTicketActions.js`](apps/pos/hooks/useTicketActions.js) (rama `success`).
- ✅ OBLIGATORIO: El guardián verifica los **11 setters** en las 4 rutas, y el ref `savedTicketRef` (el único que las 4 deben limpiar explícitamente). La asimetría A3 (1 ref vs 5) se respeta: NO se exigen los otros 4 refs.
- ✅ OBLIGATORIO: El guardián incluye un test **anti-regresión**: ninguna ruta aplica un setter **ajeno** al patch.
- ✅ OBLIGATORIO (v20): Todo guardián basado en `toContain` sobre código fuente **debe eliminar los comentarios** (`//` y `/* */`) antes de aseverar. Un substring dentro de un comentario produce un **falso verde**. Helper: `stripJsComments()` en [`architecture.test.js`](apps/pos/state/architecture.test.js).
- ⛔ PROHIBIDO: Refactorizar las rutas a un helper `applyResetPatch()` sin un defecto funcional demostrado. La Opción B fue **RECHAZADA** en v20: rompía 11 aserciones de 2 archivos de test. El guardián es **aditivo** (no toca código de producción).

**¿Por qué?** El guardián cierra el último resquicio de "frágil por acumulación": si alguien añade una clave a `RESET_PATCH_KEYS` y olvida aplicarla en una ruta, el test falla con un mensaje que nombra la ruta, el archivo y el setter faltante. Es la mayor parte del beneficio de un refactor, con **cero riesgo** sobre la ruta crítica. La lección del falso verde (v20) es transversal: **cualquier aserción textual sobre código fuente debe ignorar los comentarios**.

### ⚡ REGLA 21: Guardián del `useEffect` de Re-sincronización de Refs (v21)
La rama `success` de `handleTicketAction` limpia explícitamente **1 ref** (`savedTicketRef`) pero **NO** las otras 4 (`cartRef`, `accountNumRef`, `originalCapturerRef`, `ticketVersionRef`), porque no tiene acceso a ellas (viven en [`RetailVisionPOS.jsx`](apps/pos/RetailVisionPOS.jsx) y no se le pasan al hook). Esas 4 refs se limpian de forma **implícita** vía los 4 `useEffect` de re-sincronización. Para que ese acoplamiento implícito no se rompa en silencio, **debe** existir un guardián que verifique que los 4 `useEffect` existen y están intactos.
- ✅ OBLIGATORIO: Los 4 `useEffect` de re-sincronización ([`RetailVisionPOS.jsx:95`](apps/pos/RetailVisionPOS.jsx:95)) **deben** existir, cada uno copiando su state a su ref (`cartRef.current = cart`, `accountNumRef.current = currentAccountNum`, `originalCapturerRef.current = originalCapturer`, `ticketVersionRef.current = ticketVersion`).
- ✅ OBLIGATORIO: Cada `useEffect` **debe** declarar su dependencia correcta (`[cart]`, `[currentAccountNum]`, `[originalCapturer]`, `[ticketVersion]`). Sin la dependencia, la ref no se re-sincroniza al cambiar el state.
- ✅ OBLIGATORIO: El guardián **debe** eliminar los comentarios (`stripJsComments()`) antes de aseverar, para evitar el falso verde (lección de v20).
- ✅ OBLIGATORIO: El guardián **debe** incluir un test de cobertura que verifique que las 4 refs re-sincronizadas son **exactamente** las 4 que la rama `success` NO limpia manualmente (acoplamiento implícito documentado). Si esa lista cambia, el guardián debe revisarse.
- ⛔ PROHIBIDO: Eliminar o comentar cualquiera de los 4 `useEffect` sin migrar la limpieza de las 4 refs a un mecanismo explícito (p. ej. pasarlas al hook). El guardián fallará (rojo verificado por prueba de mutación en v21).
- ⛔ PROHIBIDO: "Corregir" la asimetría A3 eliminando los 4 refs redundantes de las 3 rutas de `RetailVisionPOS.jsx` (Opción E, **RECHAZADA** en v21): la premisa era falsa para `handleForceLogout` (el desmontaje impide que los `useEffect` se disparen) y no había cierre de diseño sobre el guardián de v20. La Opción D (guardián aditivo) es la elegida.

**¿Por qué?** La asimetría A3 (1 ref vs 5) se aceptó en v19 como estilo, pero descansaba sobre un acoplamiento **implícito y no testeado**: la rama `success` dependía de que los 4 `useEffect` existieran para limpiar las 4 refs que no toca. Si alguien los borra o comenta, la rama `success` deja de limpiar 4 refs **en silencio** (fuga de estado entre tickets: el siguiente ticket heredaría `cartRef`/`accountNumRef`/`originalCapturerRef`/`ticketVersionRef` obsoletos). El guardián de v21 cierra ese riesgo real con **cero cambios en producción** (aditivo), a diferencia de la Opción E que tocaba la ruta crítica de cada venta. La prueba de mutación (comentar un `useEffect` → 3 tests en rojo) demostró que el guardián no es un falso verde.

---

## 5. LÓGICA DE TERMINALES Y OCUPACIÓN

### 5.1 Estados Posibles de una Terminal

| Estado | Lock (DB) | CashSession | Descripción |
|--------|-----------|-------------|-------------|
| **Disponible** | ❌ No | ❌ No | Cualquier empleado puede entrar |
| **Ocupada (Sin Caja)** | ✅ Sí | ❌ No | Solo el dueño del lock la usa |
| **Ocupada (Con Caja)** | ✅ Sí | ✅ Abierta | Puede cobrar e imprimir tickets |
| **Caja Abierta sin Operador** | ❌ No | ✅ Abierta | El cajero se fue pero la CashSession sigue abierta |

### 5.2 Interacción del Usuario con Terminales
- **Logueado sin terminal:** Ve las desocupadas disponibles y las ocupadas con candado rojo.
- **Con terminal ocupada:** Si está usando T1, no puede usar otra sin soltar T1.
- **Sale de la terminal (cierra pestaña o unlock) pero con Caja Abierta:** La terminal se libera de su candado, pero como tiene `CashSession` activa, muestra "CAJA ABIERTA" sin operador.
- **Saca Corte de Caja:** La terminal pierde el estatus de "Caja", vuelve a ser terminal regular.
- **Es Administrador:** Tiene el botón de **FORZAR DESBLOQUEO** en terminales bloqueadas.

### 5.3 Heartbeat, TTL y Configuración

Todos los valores son **configurables desde `system_settings`** (tabla `SystemSetting`):

| Parámetro | Clave en `system_settings` | Default |
|-----------|---------------------------|---------|
| TTL de Lock | `pos_terminal_lock_ttl_m` | 15 min |
| TTL de Drafts para GC | `pos_draft_ttl_days` | 1 día |

**Regla de seguridad:** El `TTL` del lock siempre debe ser al menos **10 veces mayor** que el intervalo de heartbeat del frontend.

> **⚠️ REGLA DE TIMESTAMPS (v15, hallazgo H2):** Todos los timestamps de candados (`locked_at`) y los cutoffs de TTL **DEBEN** escribirse con el helper [`utcnow()`](../apps/api/core/timestamps.py:21) de `core/timestamps.py`, **NUNCA** con `datetime.now()`. El helper devuelve un datetime **naive en UTC** (sin `tzinfo`), compatible con las columnas `DateTime` sin `timezone=True` de [`TerminalLock`](../apps/api/modules/pos/models.py:15). El frontend asume UTC al parsear ([`parseUtc`](../apps/shared/timezone.js:60)), por lo que escribir hora local produciría un desfase que falsea `lockAge`. **Prohibido** reintroducir `datetime.now()` en [`occupancy.py`](../apps/api/modules/pos/occupancy.py:1) o en el cutoff de CashSession de [`router.py`](../apps/api/modules/pos/router.py:255).

### 5.4 Desbloqueo Forzado, Permisos y Auditoría

#### Permisos requeridos (validados en BACKEND, no solo en frontend)

| Permiso en `SecurityProfile.permissions` | Permite |
|------------------------------------------|---------|
| `pos_force_unlock` = `"full"` o `true` | Desbloquear terminales regulares (sin caja) |
| `pos_force_cash_unlock` = `"full"` o `true` | Desbloquear terminales que tienen CashSession activa |
| `role` = `"ADMIN"` | Ambos permisos automáticamente |

> **REGLA ABSOLUTA:** El backend (`router.py → force_terminal_unlock`) valida los permisos consultando `Employee.profile.permissions` antes de ejecutar el desbloqueo. Si el usuario no tiene permisos, responde con HTTP 403. **NUNCA** confiar solo en que el frontend oculta el botón.

#### Traspuesta de Titularidad de Caja

Cuando se ejecuta Force Unlock en una terminal con `CashSession` activa:
1. El backend **elimina** el lock de `terminal_locks`.
2. El backend **cambia** el `employee_id` y `employee_name` de la `CashSession` activa al del usuario que ejecutó el desbloqueo.
3. Ambas operaciones ocurren en un **solo `db.commit()`** (transacción atómica). Si algo falla, ninguna se aplica.
4. **El cajero original pierde definitivamente la titularidad de esa sesión de caja.**

#### Auditoría de Force Unlock

Cada ejecución de `force_unlock` genera un log con: Terminal afectada, quién ejecutó el desbloqueo, a quién le fue quitado, si se transfirió la CashSession y timestamp. **Prohibido** eliminar o reducir este log.

### 5.5 Candados Persistentes (Regla Inamovible)
- Los candados de terminal viven **siempre** en la tabla `terminal_locks` de PostgreSQL.
- **NUNCA** almacenar candados en la RAM de Python (se pierden con cada reinicio de Docker).
- El frontend (`useTerminalLocking.js`) **NUNCA** expulsa automáticamente al cajero si pierde el lock — solo muestra una advertencia visual.
- El frontend **NUNCA** re-adquiere un lock perdido automáticamente.

### 5.6 403 Espurios en `unlock` (Comportamiento Esperado — NO es un Bug)

> **Añadido en v15 (hallazgo H8).** Documentación de un comportamiento que parece un error pero es correcto.

El endpoint [`release_terminal_lock`](../apps/api/modules/pos/router.py:316) responde **HTTP 403** cuando `unlock_terminal()` devuelve `False`, es decir, cuando el `occupier_id` que solicita el desbloqueo **no es el dueño actual del candado**.

**Escenarios que producen un 403 legítimo (no espurio):**

| Escenario | Por qué ocurre | ¿Es un bug? |
|-----------|----------------|-------------|
| El admin ejecutó `force_unlock` y otro usuario tomó la terminal | El candado ya pertenece a otra persona; el unlock del dueño anterior es rechazado | ❌ No |
| El TTL expiró y la terminal fue re-ocupada por otro empleado | El lock viejo ya no existe o cambió de dueño | ❌ No |
| El cleanup de desmontaje (`useTerminalLocking.js`) se dispara **después** de un `force_unlock` | El usuario ya no es dueño; el unlock de limpieza es rechazado | ❌ No |
| Doble unlock (pestaña cerrada + logout explícito) | El segundo intento encuentra el lock ya liberado por el primero | ❌ No |

**Contrato de `unlock_terminal()`** ([`occupancy.py:72`](../apps/api/modules/pos/occupancy.py:72)):
- Devuelve `True` si el lock no existía (ya estaba libre) → **idempotente**.
- Devuelve `True` si el solicitante es el dueño → libera.
- Devuelve `False` si el solicitante **no** es el dueño → el router responde 403.

**Regla para el frontend:** un 403 en `unlock` **NO debe** tratarse como error fatal ni reintentarse. El cleanup de [`useTerminalLocking.js:120`](../apps/pos/hooks/useTerminalLocking.js:120) ya lo captura con `.catch()` y solo emite un `console.warn`. **Prohibido** convertir este 403 en una expulsión o en un bucle de reintentos (violaría la regla anti-ping-pong).

### 5.7 Sesiones de Caja vs Candados de Terminal
- `terminal_locks`: Bloquea físicamente la pantalla (T1, T2, CAJA).
- `cash_sessions`: Permite que un empleado registre ingresos/egresos monetarios en una terminal habilitada para cobrar.

---

## 6. ARCHIVOS CRÍTICOS — MAPA DE ZONA RESTRINGIDA

| Archivo | Propósito | Peligro |
|---------|-----------|---------|
| `apps/api/modules/pos/occupancy.py` | Candados persistentes en PostgreSQL | ⚠️ NUNCA volver a usar RAM |
| `apps/api/modules/pos/router.py` | Endpoints de lock/unlock/heartbeat/status/force_unlock | ⚠️ force_unlock tiene permisos + auditoría |
| `apps/api/modules/pos/models.py` | Modelo `TerminalLock` + `Ticket` (version, UNIQUE constraints) | ⚠️ No modificar constraints |
| `apps/api/modules/pos/service.py` | Lógica de negocio: persistencia atómica, GC, folios, reciclaje | ⚠️ El corazón del POS |
| `apps/pos/hooks/useTicketActions.js` | Hook maestro v6.0: addToCart atómico, ticketAction, recovery | ⚠️ No reintroducir auto-save |
| `apps/pos/hooks/useCart.js` | Estado + localStorage del carrito (v4.6: Anti-Wipe) | ⚠️ NUNCA guardar a localStorage sin validar `cartState.key === storageKey` |
| `apps/pos/hooks/useTerminalLocking.js` | Polling + heartbeat del frontend | ⚠️ NUNCA re-adquirir lock automáticamente |
| `apps/pos/RetailVisionPOS.jsx` | Componente principal: captura, carrito, cobro | ⚠️ Leer este documento completo antes de tocar |
| `apps/api/modules/cash/models.py` | Modelo `CashSession` | ⚠️ La traspuesta modifica employee_id |
| `apps/api/modules/cash/router.py` | Cierre de caja (corte) | ⚠️ No confundir con force_unlock |

### Checklist para Revisión de Código

Antes de aprobar cualquier cambio que toque terminales, sesiones o tickets, verificar:

- [ ] ¿Los candados se persisten en PostgreSQL (tabla `terminal_locks`)?
- [ ] ¿El frontend NUNCA expulsa automáticamente basándose en fallos de polling?
- [ ] ¿El frontend NUNCA re-adquiere un lock perdido automáticamente?
- [ ] ¿Los folios de ticket se generan SOLO en el backend, sin fallbacks aleatorios?
- [ ] ¿El force_unlock valida permisos en el BACKEND (no solo frontend)?
- [ ] ¿El force_unlock transfiere la CashSession al nuevo operador?
- [ ] ¿El force_unlock y la traspuesta están en UN SOLO commit atómico?
- [ ] ¿El force_unlock registra auditoría?
- [ ] ¿El heartbeat renueva el lock en la base de datos?
- [ ] ¿Las cuentas del pizarrón solo desaparecen por cobro o cancelación explícita?
- [ ] ¿El `useEffect` de localStorage del carrito está protegido con el candado `cartState.key`?
- [ ] ¿`cartRef.current` se sincroniza ANTES de `setCart()` en toda recuperación?
- [ ] ¿El envío al Pizarrón verifica post-envío que el ticket existe antes de `clearCart()`? (v6.1)
- [ ] ¿El botón "Enviar Cuenta" está bloqueado cuando `lastSaveStatus === 'failed'`? (v6.1)
- [ ] ¿Hay un banner rojo FIJO (no toast) cuando los items fallan la persistencia atómica? (v6.1)
- [ ] ¿Las operaciones atómicas (add/update/remove item) devuelven `TicketLightResponse` y NO `TicketResponse`? (v7.0)
- [ ] ¿Las consultas del módulo POS NO cargan `Product.technical_sheet`? (v7.0)
- [ ] ¿`_get_items_and_total` usa batch query `WHERE id IN(...)` y NO un loop de `db.get()` individual? (v7.0)
- [ ] ¿Las 3 operaciones atómicas (add/update/remove) tienen retries simétricos (3 intentos, backoff 1s/2s/3s)? (v7.0.1)
- [ ] ¿Todas las operaciones atómicas usan `withRetries()` de `apps/pos/utils/withRetries.js` en vez de loops inline? (v7.0.2)
- [ ] ¿El checkout (`createTicket`) tiene retries con `shouldRetry` que excluye errores de negocio? (v7.0.2)
- [ ] ¿Existe auto-reconciliación que resetea `lastSaveStatus` cuando la red se recupera? (v7.0.2)
- [ ] ¿La reconciliación descarga el ticket del servidor y sobrescribe el carrito local (servidor gana)? (v7.0.2)
- [ ] ¿`handleTicketAction` retorna SIEMPRE un contrato `{ outcome, reason }` en TODAS sus ramas? (v7.0.3)
- [ ] ¿`handleSendThenExit` verifica `result?.outcome === 'success'` antes de ejecutar `pendingExitAction()`? (v7.0.3)
- [ ] ¿`handleExitWithoutSaving` limpia TODOS los refs y el `localStorage` (espejo completo de la rama success)? (v7.0.3)
- [ ] ¿El backdrop del modal de salida limpia `pendingExitAction` igual que el botón "Cancelar"? (v7.0.3)
- [ ] ¿El force logout dispara `sendBeacon` a `/pos/tickets/emergency-save` con `terminal_id` sin bloquear el logout? (v7.0.3)
- [ ] ¿`emergency_save_ticket` filtra la sesión por `terminal_id` (con fallback documentado)? (v7.0.3)
- [ ] ¿Existen tests guardianes que prueben que `undefined`/`null`/`{}` NO autorizan la salida? (v7.0.3)
- [ ] ¿Los timestamps de candados usan `utcnow()` y NO `datetime.now()`? (v15)
- [ ] ¿Los efectos con `setInterval` y los `useCallback` dependen de `currentUserId` (primitivo) y NO del objeto `currentUser`? (v15)
- [ ] ¿El payload de `beforeunload` incluye `terminal_id`? (v15)
- [ ] ¿`heartbeatTerminal` lanza error en respuesta no-OK (en vez de devolver `false` en silencio)? (v15)
- [ ] ¿Un 403 en `unlock` se trata como esperado (sin reintentos ni expulsión)? (v15)
- [ ] ¿Toda ruta de salida limpia la sesión vía `buildResetPatch()` y NO a mano? (v17)
- [ ] ¿Las refs (`cartRef`, `accountNumRef`, `originalCapturerRef`, `ticketVersionRef`, `savedTicketRef`) se sincronizan explícitamente en cada ruta de salida? (v17)
- [ ] ¿Todo valor de estado nuevo que deba resetearse está en `buildResetPatch()` y en `RESET_PATCH_KEYS`? (v17)
- [ ] ¿`buildResetPatch()` NO incluye valores de catálogo, carrito, impresión ni UI (`FORBIDDEN_PATCH_KEYS`)? (v17)
- [ ] ¿La rama `success` de `handleTicketAction` limpia `savedTicketRef`/`showExitModal`/`pendingExitAction` (sin asimetría)? (v17)
- [ ] ¿No queda ningún `datetime.now()` en código vivo de `apps/api/modules/pos/` (solo `utcnow()`)? (v17)
- [ ] ¿`handleForceLogout` aplica `buildResetPatch()` (no confía en el desmontaje)? (v18)
- [ ] ¿En `handleForceLogout` el beacon se construye ANTES de la limpieza y `onForceLogout()` es la última sentencia? (v18)
- [ ] ¿`handleForceLogout` borra SOLO la clave de sesión (`pos_session_`), sin duplicar el borrado del carrito (`pos_cart_`)? (v18)
- [ ] ¿`doTerminalExit` NO duplica el borrado de `pos_cart_` (lo hace `clearCart()`)? (v19)
- [ ] ¿`doTerminalExit` SÍ borra `pos_session_` y sigue llamando a `clearCart()`? (v19)
- [ ] ¿La asimetría A3 sigue documentada como inconsistencia de estilo aceptada (no se "corrigió" la rama `success`)? (v19)
- [ ] ¿El guardián de simetría (describe "v20") sigue verde y cubre las 4 rutas (3 en `RetailVisionPOS.jsx` + rama `success` en `useTicketActions.js`)? (v20)
- [ ] ¿El guardián deriva los setters de `RESET_PATCH_KEYS` (no los escribe a mano) y verifica los 11 setters en las 4 rutas? (v20)
- [ ] ¿El guardián limpia los comentarios (`stripJsComments()`) antes de aseverar, para evitar falsos verdes? (v20)
- [ ] ¿Ninguna ruta aplica un setter ajeno al patch (test anti-regresión)? (v20)
- [ ] ¿Los 4 `useEffect` de re-sincronización de refs existen y copian su state a su ref? (v21)
- [ ] ¿Cada `useEffect` de re-sincronización declara su dependencia correcta (`[cart]`, `[currentAccountNum]`, `[originalCapturer]`, `[ticketVersion]`)? (v21)
- [ ] ¿El guardián del `useEffect` (describe "v21") limpia los comentarios (`stripJsComments()`) antes de aseverar? (v21)
- [ ] ¿Las 4 refs re-sincronizadas son exactamente las 4 que la rama `success` NO limpia manualmente? (v21)

---

## 7. HISTORIAL DE REGLAS PRE-v6.0 (ARCHIVO HISTÓRICO)

> **⚠️ ATENCIÓN: Las reglas listadas en esta sección están OBSOLETAS.** Existieron durante la era del auto-save masivo (v4.0-v4.8) y fueron **eliminadas intencionalmente** al migrar a la arquitectura de persistencia atómica (v6.0). **NO deben reimplementarse.** Se documentan aquí únicamente como registro histórico para evitar que futuras IAs o desarrolladores las "redescubran" y las reintroduzcan.

| Regla Eliminada | Qué hacía | Por qué fue eliminada en v6.0 |
|-----------------|-----------|-------------------------------|
| **Auto-Save Bulk (Timer 15s)** | Un `setInterval` de 15 segundos enviaba el carrito completo al servidor. | Causa raíz de las race conditions, closures viejos y sobreescrituras que generaron el incidente del Ticket #906 y los falsos positivos de hora pico. La persistencia atómica por ítem elimina la necesidad de un timer. |
| **Regla de Debounce del Auto-Save** | Controlaba las dependencias del `useEffect` del timer para evitar disparos prematuros. | Ya no existe timer de auto-save que controlar. |
| **Flush de Seguridad en Recovery** | Al recuperar una cuenta del Pizarrón, primero se guardaba el carrito actual como medida de seguridad. | Con persistencia atómica, cada operación ya está en el servidor en el momento en que ocurre. No hay nada pendiente que "flushear". |
| **CollisionModal (UI Bloqueante para 409)** | Un modal que bloqueaba la pantalla del cajero cuando se detectaba un conflicto de versión HTTP 409. | Los conflictos 409 ahora se resuelven silenciosamente con auto-heal inline: el sistema descarga la versión fresca del servidor y actualiza la UI sin interrumpir al cajero. |
| **Actualización Síncrona de `version` en Auto-Save** | Tras cada ciclo de auto-save, se actualizaba `ticketVersionRef` sincrónicamente para evitar que el siguiente ciclo enviara una versión obsoleta. | Ya no hay ciclos de auto-save. La versión se sincroniza directamente en `handleAddToCart` y `handleTicketAction` al recibir la respuesta del servidor. |
| **Reasignación Automática de Folio** | Si un folio ya había sido pagado, el sistema automáticamente generaba un nuevo folio y transfería los items. | Eliminado por ser confuso para los cajeros. Ahora el sistema simplemente informa al usuario: "El folio X ya fue cobrado. Recupere la cuenta del Pizarrón o inicie una nueva." El cajero decide qué hacer. |
| **`_get_full_ticket()` en operaciones atómicas** | Cada vez que se agregaba, actualizaba o eliminaba un item del ticket, el backend ejecutaba `_get_full_ticket()` con 5 niveles de JOINs anidados para devolver el ticket completo. | Eliminado en v7.0 porque el frontend solo lee `.version` de estas respuestas. Reemplazado por `_get_lightweight_response()` (SELECT de 5 columnas escalares sin JOINs). `_get_full_ticket()` se conserva únicamente para el checkout (`createTicket`) y la recuperación del Pizarrón. |
| **`selectinload(Product.technical_sheet)` en consultas POS** | Todas las consultas de tickets cargaban ansiosamente la ficha técnica del producto como parte de la respuesta. | Eliminado en v7.0 porque el POS nunca consume `technical_sheet` desde respuestas de tickets — lo obtiene del catálogo de productos (`initialProducts`). Reducía innecesariamente el rendimiento de cada consulta. |
| **N+1 queries en `_get_items_and_total()`** | Al validar el carrito para cobro, se ejecutaba `await db.get(Product, id)` en un loop por cada item, generando N consultas individuales a la DB. | Reemplazado en v7.0 por una sola query batch: `SELECT * FROM products WHERE id IN (...)`. Menor impacto individual, pero buena práctica de código. |

---

> **Esta es la FUENTE ÚNICA DE VERDAD de la v7.0.3.**
> El POS de R de Rico es un monumento a la evolución: construimos sistemas complejos para sobrevivir, aprendimos que la complejidad causaba errores, y los sustituimos por simplicidad atómica robusta.
> La v6.1 agregó verificación post-envío y bloqueo visual sin conexión. La v7.0 optimizó el rendimiento eliminando JOINs innecesarios en operaciones de alta frecuencia. La v7.0.1 igualó la resiliencia de las 3 operaciones atómicas con retries simétricos. La v7.0.2 cerró las últimas vulnerabilidades: auto-reconciliación post-fallo, `withRetries` DRY centralizado, y retries inteligentes en el checkout. La v7.0.3 blindó el Modal de Salida con un **contrato de resultado discriminado** (`{ outcome, reason }`): ya no se asume que "no lanzar excepción" equivale a éxito, el force logout persiste el carrito vía `sendBeacon`, y el endpoint de emergencia asocia el ticket a la terminal correcta.
>
> *Tu trabajo como IA no es reintroducir la complejidad antigua, sino proteger y expandir esta simplicidad.*
