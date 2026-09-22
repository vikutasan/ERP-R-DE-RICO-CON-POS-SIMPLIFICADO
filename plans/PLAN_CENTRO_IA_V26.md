# PLAN V26.1 — CENTRO DE IA (MÓDULO PARAGUAS)

**Estado:** 📋 **PLANIFICADO — NO EJECUTADO**
**Fecha:** 2026-09-22
**Alcance:** ERP que corre (`ERP-R-DE-RICO`) — **solo frontend** (`apps/`)
**Riesgo:** 🟢 **MUY BAJO** (no toca base de datos, no toca dinero, no toca el POS, **no toca el gateway**)
**Autorización requerida:** ✅ **SÍ** — este plan no se ejecuta sin tu aprobación explícita

> **Nota de versión:** esta es la revisión **V26.1**, corregida tras la autocrítica
> [`AUTOCRITICA_PLAN_CENTRO_IA_V26.md`](AUTOCRITICA_PLAN_CENTRO_IA_V26.md). La V26 original
> proponía 4 pestañas y un endpoint nuevo en el gateway; **ambos se eliminaron** por los
> defectos D1, D2 y D8. Ver §11 para el registro de cambios.

---

## 0. POR QUÉ EXISTE ESTE PLAN

Hoy el ERP tiene **un solo módulo de IA visible**: `vision_train` ("Entrenamiento IA", 👁️).
Pero la IA del sistema ya tiene **tres capacidades en producción**:

| Capacidad | Motor | Endpoint del gateway | ¿Dónde se usa? |
|---|---|---|---|
| **Visión** | YOLOv8 | `POST /ai/vision/detect` | POS (conteo), Almacén (entrada por foto) |
| **Voz** | Whisper | `POST /ai/voice/transcribe` | POS (agregar_item), Almacén (entrada por voz) |
| **NLU** | Ollama/Qwen 2.5 3B | `POST /ai/voice/parse-intent` | POS, Almacén |

El módulo actual solo expone **Visión** (captura, anotación, entrenamiento). **Voz y NLU
no tienen ninguna superficie de control ni diagnóstico**: si el micrófono falla, si Whisper
no carga, si Ollama no responde, el operador no tiene dónde verlo. Solo ve un toast genérico
`IA_NO_DISPONIBLE`.

### 0.1 La pregunta que originó este plan

> *"¿Valdría la pena crear un módulo de IA por voz donde se controlen o se visualicen los
> módulos que la emplean, los parámetros de cada herramienta, etc.? ¿O se integra al mismo
> módulo de Entrenamiento IA en otro apartado? ¿O ni siquiera lo consideras necesario?"*

### 0.2 La decisión (y por qué)

**NO** se crea un módulo "IA por Voz" separado. **SÍ** se expande el módulo existente a un
**"Centro de IA"** con pestañas por capacidad.

**Razones (no opinión, reglas del proyecto):**

1. **DRY** — Un módulo "IA por Voz" duplicaría el diagnóstico del motor (estado, URL, timeout,
   salud) que ya necesita Visión. Dos módulos = dos lugares donde arreglar el mismo bug.
2. **SRP** — El módulo no es "Entrenamiento" ni "Voz": es **el panel de control de la IA**.
   Su responsabilidad única es *observar el motor de IA*. Las capacidades son **pestañas**.
3. **Regla de Oro** — El ERP nunca importa `torch`/`whisper`/`ultralytics`. Solo conoce
   `AI_LOCAL_URL` y habla HTTP. Un módulo paraguas refleja esa arquitectura: **una sola
   puerta al motor**, con vistas por capacidad.
4. **Costo** — Un módulo nuevo implica registrarlo en `ExperimentCenterUI.jsx`, en
   `PerfilesAccessSuite.jsx`, en la matriz de permisos, y en la documentación. Expandir el
   existente reutiliza todo eso.
5. **KISS** — El operador aprende **una** ubicación ("Centro de IA") y dentro encuentra
   todo. No dos módulos que se pisan.

> **Regla de oro que este plan respeta:** el ERP que corre no se toca sin autorización.
> Este documento es una **propuesta**. La ejecución es una decisión tuya.

---

## 1. EVIDENCIA (VERIFICADA EN CÓDIGO, NO SUPUESTA)

### 1.1 El módulo actual está registrado en dos lugares

**Registro en el centro de experimentos** — [`apps/ExperimentCenterUI.jsx`](../apps/ExperimentCenterUI.jsx:179):

```jsx
{ id: 'vision_train', name: 'Entrenamiento IA', color: 'bg-[#c1d72e]', icon: '👁️', access: ['ADMIN', 'MANAGER'] },
```

**Registro en la suite de perfiles** — [`apps/auth/PerfilesAccessSuite.jsx`](../apps/auth/PerfilesAccessSuite.jsx:17):

```jsx
{ id: 'vision_train', name: 'Entrenamiento IA', icon: '👁️' },
```

**Import y montaje** — [`apps/ExperimentCenterUI.jsx`](../apps/ExperimentCenterUI.jsx:23) y [:527):

```jsx
import { VisionTrainingUI } from './pos/VisionTrainingUI';
// ...
{activeModule === 'vision_train' && (
    <div className="h-full">
        <VisionTrainingUI
            products={REAL_PRODUCTS}
            categories={categories}
            onCategoriesChange={setCategories}
        />
    </div>
)}
```

### 1.2 El gateway ya expone TODO lo que el Centro de IA necesita

[`apps/api/modules/ai/router.py`](../apps/api/modules/ai/router.py:15) — endpoints existentes:

| Método | Ruta | Qué devuelve | ¿Sirve al Centro de IA? |
|---|---|---|---|
| `GET` | `/ai/status` | `{habilitada, configurada, disponible, codigo_fallback}` | ✅ Pestaña **Estado** |
| `POST` | `/ai/vision/detect` | Detecciones YOLO | ✅ (ya lo usa el POS) |
| `POST` | `/ai/voice/transcribe` | Texto de Whisper | ✅ (ya lo usa el POS) |
| `POST` | `/ai/voice/parse-intent` | Intención JSON | ✅ (ya lo usa el POS) |
| `GET` | `/ai/vision/dataset-summary` | Resumen del dataset | ✅ Pestaña **Visión** |
| `GET` | `/ai/vision/train/status` | Estado del fine-tuning | ✅ Pestaña **Visión** |
| `POST` | `/ai/vision/train` | Lanza el fine-tuning | ✅ Pestaña **Visión** |

**Conclusión: NO hace falta crear ningún endpoint.** El gateway ya cubre el 100% de lo que
el Centro de IA necesita. (La V26 original proponía un endpoint `/engine/status`; se eliminó
— ver §11, defecto D1.)

### 1.3 La política de error del gateway es única e inviolable

[`apps/api/modules/ai/service.py`](../apps/api/modules/ai/service.py:17) — docstring:

```
DEGRADACION (spec §1.2):
    Cualquier fallo del motor (timeout, conexion rechazada, 5xx, JSON invalido)
    se traduce a 503 IA_NO_DISPONIBLE. Nunca se propaga un 500 al POS.
```

**Implicación para el Centro de IA:** la pestaña Estado **no** puede pedir un endpoint que
"responda siempre". Debe **interpretar el 503** como "motor caído" y pintar los semáforos en
rojo. Esto es **más simple** y **consistente** con el resto del sistema.

### 1.4 La configuración vive en variables de entorno

[`apps/api/modules/ai/service.py`](../apps/api/modules/ai/service.py:46):

| Variable | Default | Función |
|---|---|---|
| `AI_LOCAL_ENABLED` | `false` | Interruptor maestro. Apagado = modo manual. |
| `AI_LOCAL_URL` | `""` | URL base del motor (ej. `http://ia-local:9000`). |
| `AI_LOCAL_TIMEOUT` | `120.0` | Timeout de inferencia (segundos). |

**Nota:** estos valores **no se exponen** por `/ai/status` (solo `habilitada`/`configurada`/
`disponible`). El Centro de IA **no puede mostrarlos** sin un endpoint nuevo. **Decisión: no
mostrarlos.** El operador que los necesite los lee del `.env`. (La V26 original proponía una
pestaña "Parámetros Globales" para esto; se eliminó — ver §11, defecto D8.)

### 1.5 Los parámetros de voz viven en el frontend

[`apps/pos/hooks/useVoiceCart.js`](../apps/pos/hooks/useVoiceCart.js:15) — `VOZ_CONFIG`:

```js
const VOZ_CONFIG = {
    UMBRAL_RMS: 0.02,          // umbral de energía para considerar "hay voz"
    SILENCIO_MS: 1500,         // ms de silencio para auto-detener
    ESPERA_VOZ_MS: 6000,       // ms de espera antes de abortar si nadie habla
    MAX_GRABACION_MS: 30000,   // tope duro de grabación
    MIN_VOZ_MS: 300,           // voz mínima para no descartar como ruido
    INTERVALO_MUESTREO_MS: 100,// frecuencia del monitor de audio
};
```

**Hallazgo clave:** estos parámetros son **constantes de negocio** y hoy están **enterrados
en un hook**. El Centro de IA debe **mostrarlos** (pestaña Voz) para que sean auditables.

### 1.6 La allowlist de intenciones del POS

[`apps/pos/utils/voiceCartMapper.js`](../apps/pos/utils/voiceCartMapper.js:47):

```js
export const POS_ALLOWED_INTENTS = new Set([POS_VOICE_INTENTS.AGREAR_ITEM]);
```

El POS **solo** acepta `agregar_item`. Cualquier otra intención se degrada a `DESCONOCIDA`.
El Centro de IA debe **documentar y mostrar** esta restricción (pestaña Voz).

### 1.7 `VisionTrainingUI` mantiene estado que se perdería al desmontar

[`apps/pos/VisionTrainingUI.jsx`](../apps/pos/VisionTrainingUI.jsx:27) — estado interno:

```jsx
const [capturedImages, setCapturedImages] = useState([]);   // captura en curso
const [dataset, setDataset] = useState(null);               // dataset cargado
const [activeImage, setActiveImage] = useState(null);       // imagen en anotación
const [boxes, setBoxes] = useState([]);                     // cajas sin guardar
```

**Hallazgo clave:** si el shell monta/desmonta el componente al cambiar de pestaña, el
operador **pierde la anotación en curso**. Por eso el shell debe **montar siempre y ocultar
con CSS** (ver §4.3). (La V26 original afirmaba "cero cambios"; era falso — ver §11, D3.)

---

## 2. ESTRUCTURA PROPUESTA

```
🧠 CENTRO DE IA
│
├── 📊 Estado del Motor                    ← NUEVO
│     · Semáforo del gateway: habilitada / configurada / disponible
│     · Origen del dato: GET /api/v1/ai/status (ya existe)
│     · Botón "Probar conexión" (re-consulta /ai/status)
│     · Si el motor está caído, el 503 se muestra como "🔴 Motor no disponible"
│     · Nota: "La configuración (URL, timeout) vive en el .env del servidor"
│
├── 👁️ Visión                              ← EXISTENTE (se reutiliza)
│     └── VisionTrainingUI (captura + anotación + entrenamiento)
│
└── 🎙️ Voz                                 ← NUEVO
      · Módulos que la usan: POS (agregar_item), Almacén (entrada por voz)
      · Parámetros visibles: UMBRAL_RMS, SILENCIO_MS, ESPERA_VOZ_MS,
        MAX_GRABACION_MS, MIN_VOZ_MS, INTERVALO_MUESTREO_MS
      · Intenciones permitidas por módulo (la allowlist)
      · Prueba de micrófono en vivo (reusa el medidor de nivel de useVoiceCart)
```

### 2.1 Decisión de diseño: 3 pestañas, no 4

La V26 original proponía una cuarta pestaña "Parámetros Globales" que mostraría
`AI_LOCAL_ENABLED`, `AI_LOCAL_URL` y `AI_LOCAL_TIMEOUT` en **solo lectura**.

**Se elimina.** Razones:

1. **No resuelve un problema real** — el operador que necesita cambiar el timeout edita el
   `.env` de todos modos. Una pestaña que solo muestra 3 valores inmutables es decorativa.
2. **Requiere un endpoint nuevo** — `/ai/status` no expone esos valores. Crear el endpoint
   violaría la Regla de Oro (ver §11, D1).
3. **KISS** — 3 pestañas se entienden de un vistazo; 4 con una decorativa, no.

La información útil (URL del motor, timeout) se muestra como **texto informativo** dentro de
la pestaña Estado, con la nota de que se configura en el `.env`.

---

## 3. ENDPOINTS: QUÉ EXISTE Y QUÉ FALTA

### 3.1 Ya existen (reutilizar sin tocar)

| Endpoint | Uso en el Centro de IA |
|---|---|
| `GET /api/v1/ai/status` | Pestaña **Estado** — semáforo del gateway |
| `GET /api/v1/ai/vision/dataset-summary` | Pestaña **Visión** — resumen del dataset |
| `GET /api/v1/ai/vision/train/status` | Pestaña **Visión** — estado del fine-tuning |
| `POST /api/v1/ai/vision/train` | Pestaña **Visión** — lanzar entrenamiento |

### 3.2 Falta crear

**NADA.** El Centro de IA se construye **enteramente** sobre endpoints existentes.

> **Cambio respecto a V26:** la V26 proponía `GET /ai/engine/status` para exponer la salud
> por capacidad (Whisper/YOLO/Ollama). Se eliminó porque (a) viola la política de error única
> del gateway, y (b) el motor no arranca si un modelo falla — ver
> [`main.py:43`](../ai-local/app/main.py:43), el `lifespan` carga los modelos al inicio. Si
> `/ai/status` dice `disponible: true`, las 3 capacidades están sanas. La salud por capacidad
> es un lujo, no una necesidad.

---

## 4. CAMBIOS DE UI

### 4.1 Renombrar el módulo (sin cambiar el `id`)

**Decisión:** se conserva el `id: 'vision_train'` para **no romper** los permisos ya
guardados en base de datos (la matriz de perfiles referencia el `id`). Solo cambia el
`name` y el `icon`.

| Archivo | Antes | Después |
|---|---|---|
| [`ExperimentCenterUI.jsx:179`](../apps/ExperimentCenterUI.jsx:179) | `name: 'Entrenamiento IA', icon: '👁️'` | `name: 'Centro de IA', icon: '🧠'` |
| [`PerfilesAccessSuite.jsx:17`](../apps/auth/PerfilesAccessSuite.jsx:17) | `name: 'Entrenamiento IA', icon: '👁️'` | `name: 'Centro de IA', icon: '🧠'` |

> **Por qué conservar el `id`:** cambiarlo obligaría a migrar la tabla de permisos. El `id`
> es una clave técnica; el `name` es la etiqueta visible. **SRP aplicado a la identidad.**

### 4.2 Crear el componente paraguas

**Nuevo archivo:** `apps/ai/AICenterUI.jsx`

> **Cambio respecto a V26:** la V26 lo ponía en `apps/pos/`. Se mueve a `apps/ai/` porque el
> Centro de IA es **transversal** (lo usan Visión, Voz y Almacén), no del POS. Ponerlo en
> `apps/pos/` reforzaría el acoplamiento que el plan dice querer romper.

**Responsabilidad única:** renderizar la barra de pestañas y montar los paneles.
**No** contiene lógica de negocio: delega a los paneles.

```jsx
const TABS = {
    ESTADO: 'estado',
    VISION: 'vision',
    VOZ: 'voz',
};

const ETIQUETA_TAB = {
    [TABS.ESTADO]: '📊 Estado del Motor',
    [TABS.VISION]: '👁️ Visión',
    [TABS.VOZ]: '🎙️ Voz',
};

export const AICenterUI = ({ products, categories = [], onCategoriesChange }) => {
    const [tabActiva, setTabActiva] = useState(TABS.ESTADO);
    // ... barra de pestañas + montaje de los 3 paneles (ver §4.3)
};
```

**Regla de tamaño:** el componente debe quedar **bajo 120 líneas**. Si crece más, se
extrae la barra de pestañas a `AICenterTabs.jsx`.

### 4.3 Montaje con preservación de estado (corrige D3)

**Los 3 paneles se montan SIEMPRE; se ocultan con CSS.** El estado sobrevive al cambio de
pestaña. Cada panel recibe una prop `activo` para hacer *lazy fetch* (no consultar hasta
que sea visible).

```jsx
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

> **Corrección respecto a V26:** la V26 afirmaba "cero cambios en `VisionTrainingUI`". Era
> **falso**: montar/desmontar el componente perdía la anotación en curso. Ver §11, D3.

### 4.4 Nuevos paneles (2 archivos pequeños)

| Archivo | Responsabilidad | Líneas estimadas |
|---|---|---|
| `apps/ai/components/AIEngineStatusPanel.jsx` | Pestaña Estado — semáforo + botón "Probar conexión" | ~80 |
| `apps/ai/components/AIVoicePanel.jsx` | Pestaña Voz — parámetros + allowlist + prueba de micrófono | ~110 |

**Cada panel es autónomo:** hace su propio `fetch`, maneja su propio `loading`/`error`.
**No** comparten estado entre sí (SRP). El único estado compartido es `tabActiva`, que vive
en `AICenterUI`.

### 4.5 Servicio de datos

**Nuevo archivo:** `apps/ai/services/AICenterService.js`

Centraliza las llamadas HTTP del Centro de IA. **No** mezclar con `POSService.js`
(ese es del flujo de venta; este es de diagnóstico).

```js
export const AICenterService = {
    async getGatewayStatus() { /* GET /ai/status */ },
    async getDatasetSummary() { /* GET /ai/vision/dataset-summary */ },
    async getTrainStatus() { /* GET /ai/vision/train/status */ },
};
```

### 4.6 Constantes de negocio centralizadas

**Nuevo archivo:** `apps/ai/utils/aiCenterConstants.js`

Siguiendo la regla del manifiesto (*"constantes de negocio en MAYÚSCULAS en un archivo de
configuración central"*), los parámetros de voz que hoy están enterrados en
[`useVoiceCart.js`](../apps/pos/hooks/useVoiceCart.js:15) se **declaran** aquí y el hook los
**importa**.

```js
// Parámetros de captura de voz (v26: centralizados para que el Centro de IA los muestre)
export const VOZ_CONFIG = {
    UMBRAL_RMS: 0.02,
    SILENCIO_MS: 1500,
    ESPERA_VOZ_MS: 6000,
    MAX_GRABACION_MS: 30000,
    MIN_VOZ_MS: 300,
    INTERVALO_MUESTREO_MS: 100,
};

// Intenciones que cada modulo acepta por voz (allowlist visible)
export const INTENCIONES_POR_MODULO = {
    POS: ['agregar_item'],
    ALMACEN: ['entrada_insumo'],
};
```

> **Impacto en `useVoiceCart.js`:** se elimina la constante local y se importa desde aquí.
> **Un solo cambio de una línea.** El comportamiento no cambia.

---

## 5. ORDEN DE IMPLEMENTACIÓN (DE MENOR A MAYOR RIESGO)

| Fase | Qué | Riesgo | Por qué en este orden |
|---|---|---|---|
| **F1** | `aiCenterConstants.js` + `AICenterService.js` | 🟢 Nulo | Archivos nuevos, sin consumidores aún. |
| **F2** | `AICenterUI.jsx` (shell de 3 pestañas) + registrar en `ExperimentCenterUI.jsx` | 🟢 Bajo | Reemplaza el montaje de `VisionTrainingUI` por el shell. La pestaña Visión monta el componente existente → **paridad funcional inmediata**. |
| **F3** | `AIEngineStatusPanel.jsx` (pestaña Estado) | 🟢 Bajo | Mayor valor: el operador ve *por qué* la IA no responde. Solo usa `/ai/status`. |
| **F4** | `AIVoicePanel.jsx` (pestaña Voz) | 🟡 Medio | Reusa el medidor de nivel de `useVoiceCart`. Requiere cuidado con el ciclo de vida del `AudioContext`. |
| **F5** | Prop `activo` en `VisionTrainingUI` + lazy-fetch | 🟡 Medio | **Toca un componente en producción.** Se hace después de que el shell funcione, con prueba manual de anotación. |
| **F6** | Centralizar `VOZ_CONFIG` en `aiCenterConstants.js` y actualizar `useVoiceCart.js` | 🟡 Medio | Toca un hook **en producción**. Se hace al final, con build + prueba manual del POS. |
| **F7** | Renombrar el módulo en `ExperimentCenterUI.jsx` + `PerfilesAccessSuite.jsx` | 🟢 Nulo | Solo etiquetas. |
| **F8** | Documentación (`DOCUMENTACION_CENTRO_IA.md`) | 🟢 Nulo | Cierra la versión. |

**Punto de no retorno:** F2. Hasta F1, todo es aditivo y reversible con `git revert`.
F2 cambia el montaje del módulo, pero **mantiene la paridad funcional** (Visión sigue
funcionando idéntico).

> **Cambio respecto a V26:** F5 (prop `activo`) **sube de riesgo** porque toca un componente
> en producción. En la V26 no existía porque se asumía (incorrectamente) que no hacía falta.

---

## 6. REGISTRO DEL MÓDULO

### 6.1 `ExperimentCenterUI.jsx`

**Línea 23** — cambiar el import:

```jsx
import { AICenterUI } from './ai/AICenterUI';
```

**Línea 179** — renombrar:

```jsx
{ id: 'vision_train', name: 'Centro de IA', color: 'bg-[#c1d72e]', icon: '🧠', access: ['ADMIN', 'MANAGER'] },
```

**Líneas 527-535** — cambiar el montaje:

```jsx
{activeModule === 'vision_train' && (
    <div className="h-full">
        <AICenterUI
            products={REAL_PRODUCTS}
            categories={categories}
            onCategoriesChange={setCategories}
        />
    </div>
)}
```

> **Nota:** `REAL_PRODUCTS` es el nombre que usa el montaje actual (verificado en
> [`ExperimentCenterUI.jsx:530`](../apps/ExperimentCenterUI.jsx:530)). Se conserva tal cual.

### 6.2 `PerfilesAccessSuite.jsx`

**Línea 17** — renombrar:

```jsx
{ id: 'vision_train', name: 'Centro de IA', icon: '🧠' },
```

> **El `id` NO cambia.** Los permisos guardados siguen siendo válidos.

---

## 7. CRITERIOS DE ACEPTACIÓN

| # | Criterio | Cómo se verifica |
|---|---|---|
| 1 | El módulo se llama "Centro de IA" con icono 🧠 | Inspección visual en el centro de experimentos |
| 2 | La pestaña **Visión** funciona **idéntico** a hoy (captura, anotación, entrenamiento) | Prueba manual: capturar, anotar, lanzar entrenamiento |
| 3 | **La anotación en curso SOBREVIVE al cambiar de pestaña** | Anotar una caja → ir a "Estado" → volver a "Visión" → la caja sigue ahí |
| 4 | La pestaña **Estado** muestra el semáforo del gateway | Inspección visual + clic en "Probar conexión" |
| 5 | Con la IA apagada, la pestaña Estado muestra "🔴 Motor no disponible" (no un crash) | Apagar `AI_LOCAL_ENABLED=false` + reiniciar el contenedor `api` |
| 6 | La pestaña **Voz** muestra los 6 parámetros y la allowlist | Inspección visual |
| 7 | El POS sigue funcionando por voz **sin cambios** | Prueba manual: dictar "agrega 3 conchas" |
| 8 | `npm run build` pasa sin errores ni warnings | `npm run build` |
| 9 | Ningún archivo del frontend importa `torch`, `whisper` ni `ultralytics` | Búsqueda con `search_files` (regex `from ['"]?(torch\|whisper\|ultralytics)`) |
| 10 | El gateway **no fue modificado** | `git diff --stat apps/api/` debe estar vacío |

> **Cambios respecto a V26:** el criterio #3 es **nuevo** (corrige D3). El #5 ahora menciona
> el reinicio del contenedor (corrige D7). El #9 usa `search_files` en vez de `findstr`
> (corrige D6). El #10 es **nuevo** y verifica que no se tocó el gateway (corrige D1/D2).

---

## 8. LO QUE ESTE PLAN **NO** HACE (alcance explícito)

| No hace | Por qué |
|---|---|
| ❌ Crear un endpoint nuevo en el gateway | Viola la política de error única (D1). No hace falta. |
| ❌ Editar parámetros desde la UI | Requiere escribir `.env` + reiniciar contenedor. Es **V27**. |
| ❌ Crear un módulo "IA por Voz" separado | Viola DRY y SRP (ver §0.2). |
| ❌ Tocar la base de datos | No hay migración. Cero riesgo de datos. |
| ❌ Cambiar el `id` del módulo | Rompería los permisos guardados. |
| ❌ Reescribir `VisionTrainingUI.jsx` | Solo recibe una prop nueva (~3 líneas). |
| ❌ Tocar el flujo del POS | El POS sigue igual. Solo se **lee** su configuración. |
| ❌ Agregar dependencias npm | Todo se hace con React + fetch nativos. |
| ❌ Mostrar `AI_LOCAL_URL` / `AI_LOCAL_TIMEOUT` | Requiere endpoint nuevo (D1). Se documenta en el `.env`. |

---

## 9. ARCHIVOS INVOLUCRADOS

### 9.1 Nuevos (5)

| Archivo | Fase | Líneas est. |
|---|---|---|
| `apps/ai/AICenterUI.jsx` | F2 | ~120 |
| `apps/ai/components/AIEngineStatusPanel.jsx` | F3 | ~80 |
| `apps/ai/components/AIVoicePanel.jsx` | F4 | ~110 |
| `apps/ai/services/AICenterService.js` | F1 | ~40 |
| `apps/ai/utils/aiCenterConstants.js` | F1 | ~30 |
| `ESPECIFICACIONES DEL PROYECTO/DOCUMENTACION_CENTRO_IA.md` | F8 | — |

### 9.2 Modificados (4)

| Archivo | Fase | Cambio |
|---|---|---|
| [`apps/ExperimentCenterUI.jsx`](../apps/ExperimentCenterUI.jsx) | F2, F7 | Import + montaje + nombre |
| [`apps/auth/PerfilesAccessSuite.jsx`](../apps/auth/PerfilesAccessSuite.jsx) | F7 | Nombre |
| [`apps/pos/VisionTrainingUI.jsx`](../apps/pos/VisionTrainingUI.jsx) | F5 | +prop `activo` (~3 líneas) |
| [`apps/pos/hooks/useVoiceCart.js`](../apps/pos/hooks/useVoiceCart.js) | F6 | Importar `VOZ_CONFIG` |

### 9.3 Intactos (por diseño)

- `apps/api/**` — **el gateway no se toca** (verificado por el criterio #10).
- `apps/pos/RetailVisionPOS.jsx` — el POS no se toca.
- `apps/pos/utils/voiceCartMapper.js` — la allowlist se **lee**, no se cambia.
- `ai-local/**` — el motor no se toca.
- Base de datos — sin migraciones.

---

## 10. RIESGOS Y MITIGACIONES

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| El `AudioContext` de la prueba de micrófono queda abierto | Media | Bajo | Reusar el patrón de `limpiarAudio()` de [`useVoiceCart.js`](../apps/pos/hooks/useVoiceCart.js:91) |
| La prop `activo` rompe el `useEffect` de `VisionTrainingUI` | Media | Medio | F5 va después del shell + prueba manual de anotación |
| Centralizar `VOZ_CONFIG` rompe el POS | Baja | Alto | F6 va al final + build + prueba manual de dictado |
| Los 3 paneles montados hacen 3 `fetch` al abrir el módulo | Media | Bajo | *Lazy fetch* con la prop `activo` (solo consulta si es visible) |
| El renombre confunde a los operadores | Baja | Bajo | El icono 🧠 + documentación; el `id` no cambia |

---

## 11. REGISTRO DE CAMBIOS (V26 → V26.1)

Esta versión corrige los defectos encontrados en la autocrítica
[`AUTOCRITICA_PLAN_CENTRO_IA_V26.md`](AUTOCRITICA_PLAN_CENTRO_IA_V26.md):

| Defecto | Severidad | Corrección aplicada |
|---|---|---|
| **D1** — El endpoint `/engine/status` violaba la Regla de Oro (política de error única) | 🔴 Grave | **Endpoint eliminado.** La pestaña Estado usa `/ai/status` e interpreta el 503. |
| **D2** — El código Python de ejemplo no compilaba (`_llamar_motor_get` lanza, no devuelve) | 🔴 Grave | **Código eliminado.** El plan ya no contiene código no verificado. |
| **D3** — La pestaña Visión NO tenía paridad funcional (se perdía la anotación al desmontar) | 🔴 Grave | **Montaje con CSS + prop `activo`.** Criterio #3 nuevo. |
| **D4** — No se verificó `REAL_PRODUCTS` | 🟡 Menor | Verificado en [`ExperimentCenterUI.jsx:530`](../apps/ExperimentCenterUI.jsx:530). |
| **D5** — `AICenterUI.jsx` en `apps/pos/` sin justificar | 🟡 Menor | Movido a `apps/ai/` (transversal, no del POS). |
| **D6** — El criterio `findstr` no funcionaba | 🟡 Menor | Reemplazado por `search_files` con regex. |
| **D7** — No se mencionaba el reinicio del contenedor | 🟡 Menor | Criterio #5 ahora lo menciona. |
| **D8** — La pestaña "Parámetros Globales" era decorativa | 🟡 Menor | **Pestaña eliminada.** De 4 pestañas a 3. |

**Impacto neto:** el alcance se reduce ~30% (5 archivos nuevos en vez de 7, 4 modificados en
vez de 6, 0 endpoints nuevos en vez de 1) y el riesgo baja de 🟢 Bajo a 🟢 **Muy bajo**.

---

## 12. RESUMEN EJECUTIVO

**Qué:** expandir el módulo `vision_train` ("Entrenamiento IA") a **"Centro de IA"** con
3 pestañas: Estado del Motor · Visión · Voz.

**Por qué:** hoy la IA tiene 3 capacidades (Visión, Voz, NLU) pero solo 1 es visible. Voz y
NLU no tienen diagnóstico. Un módulo separado violaría DRY/SRP.

**Cuánto:** 5 archivos nuevos (~380 líneas), 4 archivos modificados (2 etiquetas, 1 import,
1 montaje, 1 prop nueva, 1 constante centralizada).

**Riesgo:** 🟢 **MUY BAJO**. Sin migraciones, sin tocar el POS, sin tocar el motor, **sin
tocar el gateway**. La pestaña Visión mantiene **paridad funcional exacta** con el módulo
actual (y además preserva el estado al cambiar de pestaña).

**Endpoints nuevos:** **NINGUNO.** Todo se construye sobre `/ai/status`,
`/ai/vision/dataset-summary`, `/ai/vision/train/status` y `/ai/vision/train`.

**Punto de no retorno:** F2 (montaje del shell). Hasta ahí, todo es aditivo y reversible.

---

**FIN DEL PLAN — V26.1**
