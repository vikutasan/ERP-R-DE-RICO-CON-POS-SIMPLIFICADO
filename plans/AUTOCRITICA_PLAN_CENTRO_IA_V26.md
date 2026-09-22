# AUTOCRÍTICA — PLAN CENTRO DE IA V26

**Fecha:** 2026-09-22
**Objeto criticado:** [`plans/PLAN_CENTRO_IA_V26.md`](PLAN_CENTRO_IA_V26.md)
**Método:** re-verificación del plan contra el código real (no contra mi memoria del código)
**Veredicto:** ⚠️ **EL PLAN TIENE 3 DEFECTOS GRAVES Y 5 MENORES. NO ESTÁ LISTO PARA EJECUTAR.**

---

## 0. RESUMEN DE HALLAZGOS

| # | Defecto | Severidad | ¿Invalida el plan? |
|---|---|---|---|
| **D1** | El endpoint propuesto **viola la Regla de Oro** del gateway (nunca propagar error; siempre 503) | 🔴 **GRAVE** | Sí, hay que rediseñarlo |
| **D2** | `_llamar_motor_get` **lanza 503**, no devuelve error. Mi código de ejemplo **no compila** | 🔴 **GRAVE** | Sí, el código es incorrecto |
| **D3** | La pestaña "Visión" **NO tiene paridad funcional**: `VisionTrainingUI` usa `useEffect` que se re-ejecuta al cambiar de pestaña | 🔴 **GRAVE** | Sí, rompe el criterio de aceptación #4 |
| **D4** | El plan **no verifica** si `REAL_PRODUCTS` existe ni de dónde sale | 🟡 Menor | No, pero es un hueco |
| **D5** | El plan asume que `AICenterUI` puede vivir en `apps/pos/` sin justificarlo | 🟡 Menor | No |
| **D6** | El criterio de aceptación #10 (`findstr`) **no funciona** como está escrito | 🟡 Menor | No |
| **D7** | El plan **no dice cómo probar** el endpoint sin `curl` (que no está en los contenedores) | 🟡 Menor | No |
| **D8** | El plan **sobreestima el valor** de la pestaña "Parámetros Globales" (3 variables de solo lectura) | 🟡 Menor | No |

**Conclusión honesta:** el plan es **estructuralmente correcto** (la decisión del módulo paraguas
sigue siendo la correcta), pero la **implementación propuesta tiene errores técnicos que
habrían causado un fallo en producción**. Los defectos D1-D3 son el resultado de **no haber
leído el código con suficiente cuidado** antes de escribir el plan.

---

## 1. DEFECTOS GRAVES

### D1 — El endpoint `/engine/status` viola la Regla de Oro del gateway

**Lo que escribí en el plan (§3.2):**

> *"**NO** lanza 503 — este endpoint es de diagnóstico y debe responder siempre (incluso
> cuando la IA está caída)."*

**Por qué es un error:** leí el docstring de [`service.py`](../apps/api/modules/ai/service.py:1)
y lo ignoré. Dice literalmente:

```
DEGRADACION (spec §1.2):
    Cualquier fallo del motor (timeout, conexion rechazada, 5xx, JSON invalido)
    se traduce a 503 IA_NO_DISPONIBLE. Nunca se propaga un 500 al POS.
```

El gateway tiene **una sola política de error**: todo fallo del motor → 503. Mi endpoint
introduce una **segunda política** ("este sí responde 200 aunque falle"). Eso es:

1. **Inconsistente** — el frontend tendría que saber que *este* endpoint se comporta distinto.
2. **Contradictorio** — el propio plan dice en §0.2 que la Regla de Oro es "una sola puerta
   al motor". Un endpoint con política de error propia **no es una sola puerta**.
3. **Innecesario** — el 503 **ya lleva el detalle** en `detail.mensaje`. La UI puede leerlo.

**Corrección:** el endpoint debe seguir la política del gateway. Si el motor no responde,
devuelve **503** con el detalle. La UI de la pestaña Estado **interpreta el 503 como
"motor caído"** y pinta los semáforos en rojo. Eso es más simple y consistente.

**Alternativa mejor (y más honesta):** **no crear endpoint nuevo en absoluto.** El
`GET /ai/status` existente ya dice `habilitada`/`configurada`/`disponible`. Lo único que
falta es la salud por capacidad. Pero **¿es realmente necesaria?** Si el motor está
`disponible`, las 3 capacidades están sanas (el motor no arranca si un modelo falla —
ver [`main.py:43`](../ai-local/app/main.py:43), el `lifespan` carga los modelos y registra
errores). **La salud por capacidad es un lujo, no una necesidad.**

> **Decisión revisada:** degradar el endpoint a **opcional (Fase 2 del plan, no Fase 1)**.
> La pestaña Estado puede funcionar **solo con `/ai/status`** en v1. El endpoint por
> capacidad se agrega **solo si** el operador reporta que necesita ese detalle.

### D2 — Mi código de ejemplo no funciona: `_llamar_motor_get` lanza, no devuelve

**Lo que escribí en el plan (§3.2):**

```python
    try:
        crudo = await _llamar_motor_get("/status", "estado_motor")
    except HTTPException as exc:
        base.errores = [str(exc.detail)]
        return base
```

**Por qué es un error:** leí [`_llamar_motor_get`](../apps/api/modules/ai/service.py:141) y
**no vi** que llama a `_lanzar_no_disponible()` en **4 puntos distintos** (líneas 153, 156,
163, 169). Es decir: **siempre lanza `HTTPException(503)`**, nunca devuelve un dict de error.

Mi `except HTTPException` **sí capturaría** el 503... pero entonces el endpoint devolvería
200 con `motor_disponible: false`, que es **exactamente lo que D1 dice que no debe hacer**.
Los dos defectos se contradicen entre sí: **el código de ejemplo implementa D1, y D1 viola
la Regla de Oro.**

Además, `base.model_copy(update={...})` sobre un Pydantic v2 — **no verifiqué la versión de
Pydantic del proyecto**. Si es v1, `model_copy` no existe (se llama `copy`). **No lo verifiqué.**

**Corrección:** eliminar el código de ejemplo del plan. Un plan **no debe contener código no
verificado**. Debe describir el **contrato** y dejar la implementación a la fase de ejecución,
donde se lee el código real.

### D3 — La pestaña "Visión" NO tiene paridad funcional (el criterio #4 es falso)

**Lo que escribí en el plan (§4.3 y criterio #4):**

> *"**Cero cambios en `VisionTrainingUI.jsx`.** Esto es DRY: se reutiliza, no se duplica."*
> *"La pestaña **Visión** funciona **idéntico** a hoy."*

**Por qué es un error:** leí [`VisionTrainingUI.jsx:1`](../apps/pos/VisionTrainingUI.jsx:1) y
vi que importa `useState, useEffect, useCallback`. **No leí qué hace el `useEffect`.**

El patrón es: `VisionTrainingUI` **se desmonta** cuando el operador cambia de pestaña
(porque `AICenterUI` hace `{tabActiva === TABS.VISION && <VisionTrainingUI .../>}`). Al
desmontarse:

1. **Se pierde el estado de captura** (`capturedImages`, `selectedProduct`).
2. **Se pierde el dataset cargado** (`dataset`, `activeImage`, `boxes`).
3. **Se pierde la anotación en curso** (`boxes` sin guardar).
4. Si hay un `useEffect` que carga el dataset al montar, **se re-ejecuta** cada vez que el
   operador vuelve a la pestaña Visión → **llamada HTTP innecesaria + parpadeo**.

**Esto NO es "idéntico a hoy".** Hoy el módulo está montado permanentemente; con mi diseño,
se monta y desmonta. **El operador que esté anotando una imagen, cambie a "Estado" para ver
si la IA está viva, y vuelva — habrá perdido su anotación.**

**Corrección (dos opciones):**

- **Opción A (simple):** montar los 4 paneles **siempre** y ocultarlos con CSS
  (`className={tabActiva === TABS.VISION ? 'block' : 'hidden'}`). El estado sobrevive.
  **Costo:** los 4 paneles hacen `fetch` al montar el módulo, aunque el operador nunca abra
  esa pestaña. Aceptable si los paneles son livianos.
- **Opción B (correcta):** montar bajo demanda **pero** elevar el estado de anotación a
  `AICenterUI`. **Costo:** viola SRP (el shell no debe conocer el estado de anotación).

**Decisión revisada:** **Opción A**, pero con *lazy fetch*: cada panel hace su `fetch` en un
`useEffect` que depende de "¿estoy visible?". Así el estado sobrevive **y** no hay llamadas
innecesarias. Esto **sí** requiere un cambio en `VisionTrainingUI` (recibir una prop
`activo`), lo que **contradice mi afirmación de "cero cambios"**.

> **Corrección al plan:** el criterio #4 es **falso**. Hay que reescribirlo como:
> *"La pestaña Visión conserva el estado de captura y anotación al cambiar de pestaña."*
> Y hay que **aceptar** que `VisionTrainingUI` recibe una prop nueva.

---

## 2. DEFECTOS MENORES

### D4 — No verifiqué `REAL_PRODUCTS`

El plan (§6.1) escribe `<AICenterUI products={REAL_PRODUCTS} .../>` copiando el montaje
actual. **No verifiqué** de dónde sale `REAL_PRODUCTS` ni si es el nombre correcto. Si me
equivoqué, el plan induce a un error de compilación.

### D5 — Ubicación de `AICenterUI.jsx` sin justificar

Puse `apps/pos/AICenterUI.jsx` porque `VisionTrainingUI.jsx` vive ahí. Pero el Centro de IA
**no es del POS**: es transversal (lo usan Visión, Voz, Almacén). Ponerlo en `apps/pos/`
**refuerza el acoplamiento que el plan dice querer romper**. Debería ir en `apps/ai/` o
`apps/shared/`. **No lo justifiqué.**

### D6 — El criterio #10 no funciona

Escribí:
```
findstr /s /i "torch whisper ultralytics" apps\*.jsx apps\*.js
```
`findstr` **no acepta dos patrones de archivo separados por espacio** de esa forma. El
comando fallaría o buscaría mal. Además, `whisper` aparecería en comentarios legítimos
(ej. "Whisper" en un docstring), dando **falsos positivos**.

### D7 — No di método de prueba sin `curl`

El plan (§7, criterio #1) usa `docker exec api python -c "import urllib.request..."`. Eso
**sí** funciona (lo aprendí en la sesión anterior), pero **no lo verifiqué** para este
contenedor específico. Y el criterio #2 ("apagar `AI_LOCAL_ENABLED=false`") **requiere
reiniciar el contenedor**, lo que el plan no menciona.

### D8 — Sobreestimo el valor de "Parámetros Globales"

Una pestaña que muestra **3 variables de solo lectura** que el operador **no puede cambiar**
es, honestamente, **decorativa**. El operador que necesita cambiar `AI_LOCAL_TIMEOUT` va a
editar el `.env` de todos modos. **Esta pestaña no resuelve ningún problema real.** Debería
**fusionarse** con "Estado del Motor" (que ya muestra URL y timeout) y **eliminarse** como
pestaña independiente.

---

## 3. LO QUE EL PLAN HIZO BIEN (para no ser injusto)

| Acierto | Por qué se sostiene |
|---|---|
| **La decisión del módulo paraguas** | Sigue siendo correcta. DRY/SRP la respaldan. |
| **Conservar el `id: 'vision_train'`** | Correcto: cambiarlo rompería permisos en BD. |
| **No tocar la base de datos** | Correcto: cero riesgo de datos. |
| **Reutilizar `VisionTrainingUI`** | Correcto en intención (aunque D3 lo matiza). |
| **Centralizar `VOZ_CONFIG`** | Correcto: hoy está enterrado en un hook. |
| **Orden de fases de menor a mayor riesgo** | Correcto y bien razonado. |
| **Alcance explícito de lo que NO hace** | Correcto y útil. |

**El esqueleto del plan es bueno. La carne tiene errores.**

---

## 4. PLAN CORREGIDO (V26.1)

### 4.1 Cambios estructurales

| Antes (V26) | Después (V26.1) | Razón |
|---|---|---|
| 4 pestañas | **3 pestañas** (Estado · Visión · Voz) | D8: "Parámetros" es decorativa |
| Endpoint `/engine/status` en F1 | **Eliminado de v1** (opcional, solo si se pide) | D1: viola la Regla de Oro |
| Código Python de ejemplo | **Eliminado** | D2: no verificado, no compila |
| "Cero cambios en `VisionTrainingUI`" | **`VisionTrainingUI` recibe prop `activo`** | D3: paridad funcional falsa |
| `apps/pos/AICenterUI.jsx` | **`apps/ai/AICenterUI.jsx`** | D5: el Centro de IA es transversal |
| Criterio #4 "idéntico a hoy" | **"conserva el estado al cambiar de pestaña"** | D3 |
| Criterio #10 `findstr` | **Búsqueda con `search_files` (regex)** | D6 |

### 4.2 Estructura corregida

```
🧠 CENTRO DE IA
├── 📊 Estado del Motor   ← NUEVO
│     · Semáforo del gateway (de GET /ai/status, ya existe)
│     · URL del motor + timeout (de GET /ai/status, ya existe)
│     · Botón "Probar conexión" → llama a GET /ai/status
│     · Si el motor está caído, el 503 se muestra como "🔴 Motor no disponible"
│
├── 👁️ Visión             ← EXISTENTE (recibe prop `activo` para lazy-fetch)
│     └── VisionTrainingUI (captura + anotación + entrenamiento)
│
└── 🎙️ Voz                ← NUEVO
      · Parámetros visibles (VOZ_CONFIG centralizado)
      · Allowlist por módulo
      · Prueba de micrófono en vivo
```

**Sin endpoint nuevo. Sin código Python. Sin pestaña decorativa.**

### 4.3 Montaje con preservación de estado (corrige D3)

```jsx
// Los 3 paneles se montan SIEMPRE; se ocultan con CSS.
// El estado sobrevive al cambio de pestaña.
<div className={tabActiva === TABS.ESTADO ? 'block h-full' : 'hidden'}>
    <AIEngineStatusPanel activo={tabActiva === TABS.ESTADO} />
</div>
<div className={tabActiva === TABS.VISION ? 'block h-full' : 'hidden'}>
    <VisionTrainingUI
        activo={tabActiva === TABS.VISION}
        products={products}
        categories={categories}
        onCategoriesChange={onCategoriesChange}
    />
</div>
<div className={tabActiva === TABS.VOZ ? 'block h-full' : 'hidden'}>
    <AIVoicePanel activo={tabActiva === TABS.VOZ} />
</div>
```

**Cambio requerido en `VisionTrainingUI`:** aceptar `activo = true` y usarlo como guarda en
los `useEffect` de carga. **Es un cambio de ~3 líneas**, no una reescritura.

### 4.4 Orden corregido

| Fase | Qué | Riesgo |
|---|---|---|
| **F1** | `aiCenterConstants.js` + `AICenterService.js` | 🟢 Nulo |
| **F2** | `AICenterUI.jsx` (shell de 3 pestañas) + registrar | 🟢 Bajo |
| **F3** | `AIEngineStatusPanel.jsx` (solo con `/ai/status`) | 🟢 Bajo |
| **F4** | `AIVoicePanel.jsx` | 🟡 Medio |
| **F5** | Prop `activo` en `VisionTrainingUI` + lazy-fetch | 🟡 Medio |
| **F6** | Centralizar `VOZ_CONFIG` + actualizar `useVoiceCart` | 🟡 Medio |
| **F7** | Renombrar módulo + documentación | 🟢 Nulo |

**Nota:** F5 sube de riesgo porque **toca un componente en producción**. Se hace **después**
de que el shell funcione, con prueba manual de anotación.

---

## 5. LECCIÓN (lo que debo cambiar en mi proceso)

Los 3 defectos graves tienen **la misma causa raíz**: **escribí el plan desde mi memoria del
código, no desde el código.**

| Defecto | Lo que asumí | Lo que el código dice |
|---|---|---|
| D1 | "Un endpoint de diagnóstico debe responder siempre" | "Cualquier fallo → 503. Nunca se propaga un 500." |
| D2 | "`_llamar_motor_get` devuelve un dict de error" | Lanza `HTTPException` en 4 puntos |
| D3 | "Montar/desmontar un componente no cambia su comportamiento" | El estado se pierde al desmontar |

**Regla para el próximo plan:** antes de escribir una sección de implementación, **leer el
archivo completo que se va a modificar**, no solo la firma. Y **no incluir código en un plan
que no haya sido verificado contra el código real** — describir el contrato, no la sintaxis.

---

## 6. VEREDICTO FINAL

| Pregunta | Respuesta |
|---|---|
| ¿La decisión arquitectónica (módulo paraguas) es correcta? | ✅ **Sí.** Se sostiene. |
| ¿El plan V26 es ejecutable tal cual? | ❌ **No.** D1-D3 causarían fallos. |
| ¿El plan V26.1 (corregido) es ejecutable? | ✅ **Sí**, con las correcciones de §4. |
| ¿Vale la pena el módulo? | ✅ **Sí**, pero **más pequeño** de lo que propuse: 3 pestañas, 0 endpoints nuevos. |

**Recomendación:** ejecutar **V26.1**, no V26. El alcance se reduce ~30% y el riesgo baja
de 🟢 Bajo a 🟢 **Muy bajo** (ya no se toca el gateway en absoluto).

---

**FIN DE LA AUTOCRÍTICA — V26**
