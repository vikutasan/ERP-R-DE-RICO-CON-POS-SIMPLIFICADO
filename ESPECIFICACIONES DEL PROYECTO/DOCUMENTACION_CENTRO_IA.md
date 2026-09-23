# DOCUMENTACIÓN — CENTRO DE IA (MÓDULO PARAGUAS)

> **Versión:** v27.3 — Centro de IA (4 capacidades) + Fine-tuning de Visión (v7 Fase 8) + OCR de Pedidos (v27) + Correcciones de efectividad OCR (v27.1, v27.2) + Selector de cliente y captura manual (v27.3)
> **Estado:** Implementado, build verificado (`npm run build` exit 0)
> **Última actualización:** 23 Sep 2026
> **Documentos relacionados:**
> - [`CONTEXTO_SISTEMA_IA.md`](CONTEXTO_SISTEMA_IA.md) — Arquitectura del AI Gateway y reglas de resiliencia
> - [`DOCUMENTACION_MODULO_POS.md`](DOCUMENTACION_MODULO_POS.md) — Módulo POS (consumidor de la voz y la visión)
> - [`../../docs/SPEC_AI_GATEWAY_TRANSVERSAL.md`](../../docs/SPEC_AI_GATEWAY_TRANSVERSAL.md) — Especificación del Gateway transversal
> - [`../../plans/PLAN_CENTRO_IA_V26.md`](../../plans/PLAN_CENTRO_IA_V26.md) — Plan de implementación aprobado
> - [`../../plans/AUTOCRITICA_PLAN_CENTRO_IA_V26.md`](../../plans/AUTOCRITICA_PLAN_CENTRO_IA_V26.md) — Autocrítica que originó la v26.1

---

## ÍNDICE GENERAL

**PARTE I — EL CENTRO DE IA (módulo paraguas)**
1. Resumen ejecutivo
2. Problema que resuelve
3. Arquitectura general
4. Estructura de archivos
5. Las tres pestañas
6. Constantes centralizadas
7. Servicio HTTP centralizado
8. Endpoints utilizados (0 nuevos)
9. Permisos
10. Criterios de aceptación
11. Fuera de alcance
12. Historial de versiones del Centro de IA

**PARTE II — FINE-TUNING DE VISIÓN (pestaña Visión)**
13. Problema que resuelve el fine-tuning
14. Arquitectura del pipeline de entrenamiento
15. Componentes en detalle
16. Flujo completo paso a paso
17. Decisiones de diseño y su justificación
18. Contratos de datos (schemas)
19. Formato YOLO de las etiquetas
20. Configuración y despliegue
21. Validación (smoke test)
22. Bug resuelto — la ruta doble `apps/api`
23. Seguridad y límites
24. Archivos involucrados
25. Estado actual y trabajo pendiente
26. Glosario
27. Historial de cambios

**PARTE III — OCR DE PEDIDOS (pestaña Programación de Pedidos)**
28. Lectura de capturas de WhatsApp (OCR + LLM)

---
---

# PARTE I — EL CENTRO DE IA (MÓDULO PARAGUAS)

## 1. RESUMEN EJECUTIVO

El **Centro de IA** es un **módulo paraguas** que agrupa, en una sola pantalla con pestañas, las
**tres capacidades de inteligencia artificial** del ERP:

| Pestaña | Capacidad | Motor | Qué hace |
|---|---|---|---|
| 📊 **Estado del Motor** | Diagnóstico | — | Muestra si la IA está habilitada, configurada y disponible |
| 👁️ **Visión** | Conteo de objetos | YOLO | Captura, anota y entrena el modelo de conteo de pan |
| 🎙️ **Voz** | Dictado manos libres | Whisper + Ollama | Diagnóstico del micrófono y de los parámetros de captura |

**Frase que resume el diseño:**

> *Un módulo, tres sentidos. El ERP nunca importa `torch`, `whisper` ni `ultralytics`.*

**Decisión de diseño clave:** NO se creó un módulo nuevo "IA por Voz". Se **expandió** el módulo
existente `vision_train` (antes "Entrenamiento IA") para que sea el **hogar único** de toda la IA.
Esto evita duplicar la lógica de permisos, el registro de módulos y la navegación.

---

## 2. PROBLEMA QUE RESUELVE

### 2.1 El problema de negocio

Antes de v26.1, la IA estaba **fragmentada y opaca**:

- El módulo se llamaba "Entrenamiento IA" y solo mostraba la pestaña de Visión, aunque el sistema
  ya tenía **voz** (VOZ-POS v2) y **NLU** (Ollama) funcionando en el POS y en Almacenes.
- No había **ningún lugar** donde un administrador pudiera ver si el motor de IA estaba vivo.
- Los parámetros de la voz (`VOZ_CONFIG`) vivían **duplicados** dentro de `useVoiceCart.js`, sin
  forma de inspeccionarlos desde la UI.

### 2.2 El problema técnico

| Problema | Consecuencia |
|---|---|
| Módulo con nombre engañoso | El operador no sabe que ahí también vive la voz |
| Sin panel de estado | Un fallo del motor se descubre cuando el POS falla, no antes |
| Constantes duplicadas | Cambiar un umbral de voz exige tocar el hook del POS |
| Sin diagnóstico de micrófono | El operador no sabe si su hardware funciona |

### 2.3 La restricción de arquitectura (Regla de Oro §1.2)

> **El ERP NUNCA importa `torch`, `whisper` ni `ultralytics`.**

El ERP solo conoce `AI_LOCAL_URL` y habla HTTP. Esta regla es **inviolable** y condiciona todo el
diseño del Centro de IA: **no se añadió ni un solo endpoint nuevo**.

---

## 3. ARQUITECTURA GENERAL

### 3.1 Diagrama de capas

```
┌─────────────────────────────────────────────────────────────────┐
│  ExperimentCenterUI.jsx  (registro del módulo `vision_train`)   │
│  └── <AICenterUI />  ← shell con 3 pestañas                      │
│       ├── <AIEngineStatusPanel />   (pestaña Estado)             │
│       ├── <VisionTrainingUI />      (pestaña Visión, reutilizada)│
│       └── <AIVoicePanel />          (pestaña Voz)                │
└─────────────────────────────────────────────────────────────────┘
                              │  HTTP (fetch)
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  AI Gateway  (apps/api/modules/ai)  —  /api/v1/ai/*             │
│  Política inviolable: cualquier fallo del motor → 503           │
│  IA_NO_DISPONIBLE. Nunca se propaga un 500 al POS.              │
└─────────────────────────────────────────────────────────────────┘
                              │  HTTP
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Motor de IA Local  (ia-local, puerto 9000)                     │
│  YOLO · Whisper · Ollama (Qwen 2.5 3B)                          │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Principio de "estado preservado" (fix del defecto D3)

`VisionTrainingUI` mantiene en su estado interno las fotos capturadas (`capturedImages`), el
dataset (`dataset`), la imagen activa (`activeImage`) y las cajas dibujadas (`boxes`). Si el
usuario cambiara de pestaña y el componente se desmontara, **perdería todo su trabajo**.

**Solución:** el shell monta **siempre** los tres paneles y los oculta con CSS:

```jsx
<div className={tabActiva === TABS.VISION ? 'block h-full' : 'hidden'}>
    <VisionTrainingUI activo={tabActiva === TABS.VISION} ... />
</div>
```

El atributo `hidden` de Tailwind (`display: none`) **no desmonta** el componente: el estado
sobrevive. Para evitar peticiones innecesarias, cada panel recibe la prop `activo` y solo
consulta la red cuando su pestaña está visible (**lazy-fetch**).

---

## 4. ESTRUCTURA DE ARCHIVOS

### 4.1 Archivos nuevos (v26.1)

| Archivo | Responsabilidad |
|---|---|
| [`apps/ai/AICenterUI.jsx`](../../apps/ai/AICenterUI.jsx) | Shell con las 3 pestañas y el montaje persistente |
| [`apps/ai/components/AIEngineStatusPanel.jsx`](../../apps/ai/components/AIEngineStatusPanel.jsx) | Pestaña "Estado del Motor" |
| [`apps/ai/components/AIVoicePanel.jsx`](../../apps/ai/components/AIVoicePanel.jsx) | Pestaña "Voz" (diagnóstico de micrófono) |
| [`apps/ai/services/AICenterService.js`](../../apps/ai/services/AICenterService.js) | Cliente HTTP centralizado del Centro de IA |
| [`apps/ai/utils/aiCenterConstants.js`](../../apps/ai/utils/aiCenterConstants.js) | Constantes de negocio centralizadas (incluye `VOZ_CONFIG`) |

### 4.2 Archivos modificados

| Archivo | Cambio |
|---|---|
| [`apps/ExperimentCenterUI.jsx`](../../apps/ExperimentCenterUI.jsx) | Import de `AICenterUI`; nombre "Centro de IA" + icono 🧠; montaje |
| [`apps/auth/PerfilesAccessSuite.jsx`](../../apps/auth/PerfilesAccessSuite.jsx) | Nombre "Centro de IA" + icono 🧠 en la matriz de permisos |
| [`apps/pos/VisionTrainingUI.jsx`](../../apps/pos/VisionTrainingUI.jsx) | Nueva prop `activo` + guarda en el `useEffect` de carga del dataset |
| [`apps/pos/hooks/useVoiceCart.js`](../../apps/pos/hooks/useVoiceCart.js) | Elimina `VOZ_CONFIG` local; lo importa de `aiCenterConstants.js` |

### 4.3 Ubicación transversal

El Centro de IA vive en `apps/ai/`, **no** en `apps/pos/`. Es un módulo **transversal**: la voz
la usan el POS y Almacenes; la visión la usan el POS y Almacenes; el estado del motor interesa a
todos. Ponerlo bajo `pos/` habría sido una decisión injustificada (defecto D5 de la autocrítica).

---

## 5. LAS TRES PESTAÑAS

### 5.1 📊 Estado del Motor

**Endpoint:** `GET /api/v1/ai/status` (existente, sin cambios).

**Respuesta del gateway:**

```json
{
  "habilitada": true,
  "configurada": true,
  "disponible": true,
  "codigo_fallback": null
}
```

**Interpretación de los 4 estados:**

| Estado visual | Condición | Color |
|---|---|---|
| ⏳ CONSULTANDO | Petición en vuelo | Gris |
| ✅ OPERATIVO | `disponible === true` | Verde |
| ⚪ APAGADO | `habilitada === false` | Ámbar |
| 🔴 CAÍDO | 503 `IA_NO_DISPONIBLE` o error de red | Rojo |

**Punto crítico:** el gateway **siempre** responde 503 cuando el motor falla (nunca 200 con un
error dentro). El panel interpreta ese 503 como "motor caído" (semáforo rojo), **no** como un
crash de la UI. Esto respeta la política inviolable del gateway.

### 5.2 👁️ Visión

**Componente:** [`VisionTrainingUI`](../../apps/pos/VisionTrainingUI.jsx) — **reutilizado sin
duplicar**. Conserva sus dos sub-pestañas (Captura y Anotación) y toda su lógica de fine-tuning.

**Único cambio:** recibe la prop `activo` y la usa como guarda:

```jsx
useEffect(() => {
    if (activo && tab === TABS.ANOTACION && selectedProduct?.sku) {
        cargarDataset(selectedProduct.sku);
    }
}, [activo, tab, selectedProduct, cargarDataset]);
```

El detalle completo del fine-tuning está en la **PARTE II** de este documento.

### 5.3 🎙️ Voz

**Componente:** [`AIVoicePanel.jsx`](../../apps/ai/components/AIVoicePanel.jsx).

Es un panel de **diagnóstico**, no de operación. Permite:

1. **Probar el micrófono** con un medidor RMS en vivo (idéntico al del POS).
2. **Ver los 6 parámetros** de captura continua (`VOZ_CONFIG`).
3. **Ver la lista blanca** de intenciones permitidas por módulo.

**Medidor RMS (réplica exacta de `useVoiceCart.js`):**

```js
analyser.fftSize = 2048;
analyser.getByteTimeDomainData(buffer);
// v = (buffer[i] - 128) / 128   →   rms = sqrt(suma / buffer.length)
setNivel(Math.min(1, rms * 4));
```

**Limpieza idempotente:** al salir de la pestaña (`activo === false`) o al desmontar, se detienen
las pistas del micrófono y se cierra el `AudioContext`:

```jsx
useEffect(() => {
    if (!activo) { limpiarAudio(); setProbando(false); }
    return limpiarAudio;
}, [activo, limpiarAudio]);
```

---

## 6. CONSTANTES CENTRALIZADAS

### 6.1 `VOZ_CONFIG` — fuente única de verdad

Antes vivía duplicado en `useVoiceCart.js`. Ahora vive en
[`aiCenterConstants.js`](../../apps/ai/utils/aiCenterConstants.js) y **ambos** consumidores lo
importan:

```js
export const VOZ_CONFIG = {
    UMBRAL_RMS: 0.02,           // RMS mínimo para considerar que hay voz
    SILENCIO_MS: 1500,          // ms de silencio continuo → detener y transcribir
    ESPERA_VOZ_MS: 6000,        // ms máximos esperando a que empiece a hablar
    MAX_GRABACION_MS: 30000,    // ms máximos de grabación total (anti-olvido)
    MIN_VOZ_MS: 300,            // ms mínimos de voz acumulada para validar
    INTERVALO_MUESTREO_MS: 100, // cada cuánto se muestrea el nivel de audio
};
```

**Regla del manifiesto aplicada:** las constantes de negocio van en MAYÚSCULAS en un archivo de
configuración central, no dispersas en los componentes.

### 6.2 Lista blanca de intenciones

```js
export const INTENCIONES_POR_MODULO = {
    POS: ['agregar_item'],
    ALMACEN: ['entrada_insumo'],
};
```

El panel de Voz la muestra para que el administrador vea **qué puede dictar** cada módulo. La
regla de negocio es: **la IA PROPONE, el humano CONFIRMA**.

---

## 7. SERVICIO HTTP CENTRALIZADO

[`AICenterService.js`](../../apps/ai/services/AICenterService.js) encapsula las llamadas y
traduce los errores:

```js
export const AICenterService = {
    async getGatewayStatus()   { return getJson('/ai/status', '...'); },
    async getDatasetSummary()  { return getJson('/ai/vision/dataset-summary', '...'); },
    async getTrainStatus()     { return getJson('/ai/vision/train/status', '...'); },
};
```

La clase `AICenterError` expone un getter `esNoDisponible` que detecta el **503
`IA_NO_DISPONIBLE`**, permitiendo a los paneles distinguir "motor caído" de "error real".

---

## 8. ENDPOINTS UTILIZADOS (0 NUEVOS)

| Método | Ruta | Usado por | Estado |
|---|---|---|---|
| `GET` | `/api/v1/ai/status` | Estado del Motor | Existente |
| `GET` | `/api/v1/ai/vision/dataset-summary` | Visión | Existente |
| `GET` | `/api/v1/ai/vision/train/status` | Visión | Existente |
| `POST` | `/api/v1/ai/vision/train` | Visión | Existente |
| `POST` | `/api/v1/ai/voice/transcribe` | POS / Almacenes | Existente |
| `POST` | `/api/v1/ai/voice/parse-intent` | POS / Almacenes | Existente |

**Decisión de diseño:** el plan original (V26) proponía un endpoint nuevo
`GET /ai/engine/status` que "siempre respondiera 200". Se **eliminó** porque violaba la política
inviolable del gateway (defecto D1 de la autocrítica). El Centro de IA usa **solo** endpoints
existentes.

---

## 9. PERMISOS

El módulo conserva su `id` histórico `vision_train` para **no romper** la matriz de permisos ya
persistida en base de datos. Solo cambian el nombre visible y el icono:

| Antes | Después |
|---|---|
| `Entrenamiento IA` 👁️ | `Centro de IA` 🧠 |

**Acceso:** `['ADMIN', 'MANAGER']` (sin cambios).

---

## 10. CRITERIOS DE ACEPTACIÓN

| # | Criterio | Verificación |
|---|---|---|
| 1 | El módulo aparece como "Centro de IA" con icono 🧠 | `ExperimentCenterUI.jsx` + `PerfilesAccessSuite.jsx` |
| 2 | El Centro de IA tiene 3 pestañas navegables | `AICenterUI.jsx` |
| 3 | La pestaña Estado muestra el semáforo del motor | `AIEngineStatusPanel.jsx` |
| 4 | Un 503 se interpreta como "motor caído", no como crash | `AICenterError.esNoDisponible` |
| 5 | La pestaña Visión conserva captura y anotación | `VisionTrainingUI` reutilizado |
| 6 | Cambiar de pestaña NO pierde las fotos capturadas | Montaje persistente + CSS `hidden` |
| 7 | La pestaña Voz muestra el medidor RMS en vivo | `AIVoicePanel.jsx` |
| 8 | `VOZ_CONFIG` tiene una sola fuente de verdad | `aiCenterConstants.js` |
| 9 | Cero endpoints nuevos | §8 |
| 10 | `npm run build` pasa sin errores | Exit code 0 (1827 módulos) |

---

## 11. FUERA DE ALCANCE (NO se hizo)

- ❌ Crear un módulo separado "IA por Voz".
- ❌ Añadir endpoints nuevos al gateway.
- ❌ Tocar el POS, la base de datos o el motor `ia-local`.
- ❌ Modificar la política de errores del gateway.
- ❌ Editar parámetros de voz desde la UI (solo se **muestran**; editarlos sería otra fase).

---

## 12. HISTORIAL DE VERSIONES DEL CENTRO DE IA

| Versión | Fecha | Cambio |
|---|---|---|
| v26 | 22 Sep 2026 | Plan inicial: 4 pestañas, 1 endpoint nuevo |
| **v26.1** | 22 Sep 2026 | **3 pestañas, 0 endpoints nuevos, prop `activo`, ubicación `apps/ai/`** |

La corrección V26 → V26.1 nació de una **autocrítica** solicitada explícitamente, que detectó 3
defectos graves (endpoint que violaba la política del gateway, código Python no compilable,
pérdida de estado al cambiar de pestaña) y 5 menores. Ver
[`../../plans/AUTOCRITICA_PLAN_CENTRO_IA_V26.md`](../../plans/AUTOCRITICA_PLAN_CENTRO_IA_V26.md).

---
---

# PARTE II — FINE-TUNING DE VISIÓN (PESTAÑA VISIÓN)

> Esta parte documenta la **pestaña Visión** del Centro de IA. Corresponde al antiguo
> `DOCUMENTACION_MODULO_ENTRENAMIENTO_IA.md` (v7 Fase 8), ahora absorbido aquí. El contenido
> técnico es idéntico porque el pipeline de fine-tuning **no cambió** en v26.1: solo cambió
> **dónde se monta la UI** (antes un módulo propio, ahora la pestaña Visión del Centro de IA).

## 13. PROBLEMA QUE RESUELVE EL FINE-TUNING

### 13.1 El problema de negocio

El conteo de pan en el POS requiere que la IA reconozca piezas en una charola. Un modelo
genérico (`yolov8n.pt`, entrenado con COCO) **no conoce el pan de R de Rico**: confunde
conchas con bolillos, no distingue piezas pegadas y falla con la iluminación del local.

### 13.2 El problema técnico

Entrenar YOLO es:

| Característica | Implicación |
|---|---|
| **Largo** | Minutos (decenas de minutos con datasets reales) |
| **Bloqueante** | Consume CPU/RAM al 100% durante todo el proceso |
| **Con estado** | Solo puede haber UN entrenamiento a la vez |
| **Falible** | Puede fallar por dataset vacío, OOM, error de ultralytics |

Si el entrenamiento corriera dentro del event loop de FastAPI, **congelaría el motor de IA
completo**: la voz (`/voice/*`) y la detección (`/vision/detect`) dejarían de responder, y el
POS perdería la IA en plena operación.

### 13.3 La restricción de arquitectura (Regla de Oro §1.2)

> **El ERP NUNCA importa `torch`, `whisper` ni `ultralytics`.**

El ERP solo conoce `AI_LOCAL_URL` y habla HTTP. Si el motor de IA se cae, el POS sigue operando
en modo manual. Esta regla es **inviolable** y condiciona todo el diseño del módulo.

---

## 14. ARQUITECTURA DEL PIPELINE DE ENTRENAMIENTO

### 14.1 Diagrama de capas

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  NAVEGADOR (Centro de IA → pestaña Visión)                                   │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │  VisionTrainingUI.jsx  (sub-pestaña "Anotación")                       │  │
│  │    · Selector de épocas (1..500)                                       │  │
│  │    · Botón "🧠 Entrenar con N imagen(es)"                              │  │
│  │    · iniciarEntrenamiento() → posService.trainVision({skus, epochs})   │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────┬──────────────────────────────────────────┘
                                    │ HTTP POST /api/v1/ai/vision/train
                                    ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  CONTENEDOR "api"  (ERP — FastAPI)                                           │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │  apps/api/modules/ai/router.py                                         │  │
│  │    POST /vision/train          → service.entrenar_vision()             │  │
│  │    GET  /vision/train/status   → service.estado_entrenamiento()        │  │
│  │    GET  /vision/dataset-summary→ service.resumen_dataset()             │  │
│  ├────────────────────────────────────────────────────────────────────────┤  │
│  │  apps/api/modules/ai/service.py                                        │  │
│  │    · _timeout_entrenamiento()  (default 3600s, env AI_LOCAL_TRAIN_TIMEOUT)│
│  │    · _llamar_motor_get()       (proxy GET)                             │  │
│  │    · entrenar_vision()         (proxy POST con timeout largo)          │  │
│  │    · Traduce 400/409 → HTTPException; 5xx/timeout → 503 IA_NO_DISPONIBLE│ │
│  └────────────────────────────────────────────────────────────────────────┘  │
│  ⚠️  NO importa torch / ultralytics / whisper                                │
└───────────────────────────────────┬──────────────────────────────────────────┘
                                    │ HTTP (red interna rderico-ia-net)
                                    │ POST http://ia-local:9000/vision/train
                                    ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  CONTENEDOR "ia-local"  (Motor de IA — FastAPI)                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │  ai-local/app/main.py                                                  │  │
│  │    POST /vision/train          → training.entrenar()                   │  │
│  │    GET  /vision/train/status   → training.estado_actual()              │  │
│  │    GET  /vision/dataset-summary→ training._resumen_dataset()           │  │
│  ├────────────────────────────────────────────────────────────────────────┤  │
│  │  ai-local/app/engines/training.py                                      │  │
│  │    · ESTADO_ENTRENAMIENTO (dict compartido, 1 entrenamiento a la vez)  │  │
│  │    · _resumen_dataset()   (pre-validación: ¿hay etiquetas?)            │  │
│  │    · _correr_subproceso() (asyncio.create_subprocess_exec)             │  │
│  │    · entrenar()           (orquesta + HOT-RELOAD)                      │  │
│  ├────────────────────────────────────────────────────────────────────────┤  │
│  │  ai-local/app/engines/vision.py                                        │  │
│  │    · cargar_modelo(ruta)  ← recarga el modelo en memoria (hot-reload)  │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                    │                                         │
│                                    │ subprocess (proceso SEPARADO)           │
│                                    ▼                                         │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │  python -m train.train_bakery --epochs N --imgsz 640 --sku 10 ...      │  │
│  │  ai-local/train/train_bakery.py                                        │  │
│  │    1. descubrir_dataset()      lee /dataset/<sku>/                     │  │
│  │    2. construir_dataset_yolo() arma images/ + labels/ + data.yaml      │  │
│  │    3. entrenar()               YOLO.train()  ← CPU-bound, minutos      │  │
│  │    4. publicar_modelo()        copia best.pt → /training/best.pt       │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 14.2 Flujo de datos (volúmenes compartidos)

El punto crítico del diseño es que **el dataset que el ERP escribe es el mismo directorio físico
que el motor de IA lee**. Se logra con un bind mount al MISMO directorio del host:

```
HOST (Windows)                                  CONTENEDOR "api"        CONTENEDOR "ia-local"
─────────────────────────────────────────────   ────────────────────    ─────────────────────
ERP-R-DE-RICO-DATA/vision_training/  ─────────► /app/static/training    /dataset  (read-only)
   └── 10/                                       (VISION_TRAINING_DIR)   (DATASET_DIR)
        ├── pan_001.jpg  ◄── escribe el ERP      ▲                       ▲
        ├── pan_001.txt  ◄── anota el operador   │                       │
        ├── pan_002.jpg                          │                       │
        └── pan_002.txt                          │                       │
                                                 │                       │
ERP-R-DE-RICO-DATA/ai_training/      ───────────┼───────────────────────┘
   ├── best.pt       ◄── modelo afinado          │        /training  (read-write)
   ├── dataset_yolo/ ◄── dataset YOLO temporal   │        (TRAINING_DIR)
   └── runs/         ◄── logs de ultralytics     │
```

| Variable de entorno | Contenedor | Valor | Propósito |
|---|---|---|---|
| `VISION_TRAINING_DIR` | `api` | `/app/static/training` | Raíz donde el ERP escribe imágenes + labels |
| `DATASET_DIR` | `ia-local` | `/dataset` | Raíz donde el motor LEE el dataset (ro) |
| `TRAINING_DIR` | `ia-local` | `/training` | Raíz donde el motor ESCRIBE el modelo |
| `YOLO_MODEL` | `ia-local` | `yolov8n.pt` | Pesos base para el fine-tuning |
| `AI_LOCAL_TRAIN_TIMEOUT` | `api` | `3600` | Timeout del proxy de entrenamiento (segundos) |

---

## 15. COMPONENTES EN DETALLE

### 15.1 Frontend — [`VisionTrainingUI.jsx`](../../apps/pos/VisionTrainingUI.jsx)

La UI de entrenamiento vive **dentro de la sub-pestaña "Anotación"**, no en una pantalla aparte.
Esto es deliberado: el operador anota y entrena en el mismo contexto mental.

> **Cambio v26.1:** este componente ya no se monta directamente desde `ExperimentCenterUI`, sino
> desde [`AICenterUI.jsx`](../../apps/ai/AICenterUI.jsx) como la pestaña Visión. Recibe la prop
> `activo` para el lazy-fetch. Su lógica interna es idéntica.

**Estado de entrenamiento:**

```javascript
// --- Estado de entrenamiento (v7 Fase 8) ---
const [training, setTraining] = useState(false);
const [trainMsg, setTrainMsg] = useState('');
const [trainError, setTrainError] = useState('');
const [epochs, setEpochs] = useState(50);
```

**Disparador:**

```javascript
const iniciarEntrenamiento = async () => {
    if (!selectedProduct) return;
    setTraining(true);
    setTrainMsg('');
    setTrainError('');
    try {
        // Entrena SOLO con el SKU seleccionado (el operador anota por producto).
        const res = await posService.trainVision({
            skus: [selectedProduct.sku],
            epochs,
        });
        if (res.ok) {
            setTrainMsg(
                `✅ Entrenamiento completado (${res.resumen?.imagenes ?? '?'} imágenes). Modelo recargado.`
            );
        } else {
            setTrainError(res.error || res.mensaje || 'El entrenamiento falló.');
        }
    } catch (error) {
        // 503 = motor de IA caído; 400/409 = dataset o concurrencia.
        setTrainError(
            error.status === 503
                ? 'El motor de IA Local no está disponible. Entrena más tarde.'
                : error.message || 'No se pudo iniciar el entrenamiento.'
        );
    } finally {
        setTraining(false);
    }
};
```

**Reglas de UX implementadas:**

1. **El botón solo aparece si hay etiquetas.** La condición es
   `{dataset && dataset.annotated > 0 && (...)}`. Si no hay nada anotado, no se
   muestra el bloque de entrenamiento: no se puede entrenar con cero etiquetas.
2. **El botón se deshabilita mientras entrena** (`disabled={training}`) y cambia el texto a
   `🧠 Entrenando... (puede tardar minutos)`.
3. **El selector de épocas** está acotado a `min={1} max={500}` y se deshabilita durante el
   entrenamiento.
4. **El mensaje de éxito incluye el número de imágenes** usadas, para que el operador sepa
   con qué dataset se entrenó.
5. **Los errores se traducen a lenguaje humano**: `503` → "El motor de IA Local no está
   disponible. Entrena más tarde."

> **Nota de diseño:** el entrenamiento se lanza **por SKU** (`skus: [selectedProduct.sku]`),
> porque el operador anota producto por producto. El backend soporta entrenar varios SKUs a la
> vez (o todos si se omite `skus`), pero la UI actual entrena uno.

### 15.2 Cliente HTTP — [`POSService.js`](../../apps/pos/services/POSService.js)

Tres métodos:

```javascript
async getDatasetSummary() {
    const res = await fetch(`${CONFIG.API_BASE_URL}/ai/vision/dataset-summary`);
    // ...
}

async getTrainStatus() {
    const res = await fetch(`${CONFIG.API_BASE_URL}/ai/vision/train/status`);
    // ...
}

async trainVision({ skus = null, epochs = 50, imgsz = 640, batch = 8, runName = 'bakery' } = {}) {
    const res = await fetch(`${CONFIG.API_BASE_URL}/ai/vision/train`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skus, epochs, imgsz, batch, run_name: runName }),
    });
    // ...
}
```

> **Ojo con el prefijo:** `CONFIG.API_BASE_URL` ya incluye `/api/v1`, por lo que la ruta final
> es `/api/v1/ai/vision/train`. El router del Gateway está montado en `/api/v1/ai`
> (ver [`apps/api/main.py`](../../apps/api/main.py:317)), **no** en `/ai`.

### 15.3 API Gateway — [`apps/api/modules/ai/router.py`](../../apps/api/modules/ai/router.py)

Tres endpoints:

```python
@router.get("/vision/dataset-summary", response_model=schemas.DatasetSummaryResponse)
async def dataset_summary():
    return await service.resumen_dataset()

@router.get("/vision/train/status", response_model=schemas.TrainStatusResponse)
async def train_status():
    return await service.estado_entrenamiento()

@router.post("/vision/train", response_model=schemas.TrainStatusResponse)
async def train(payload: schemas.TrainRequest):
    return await service.entrenar_vision(payload)
```

> **Nota:** el router del Gateway **no** contiene lógica de negocio. Solo delega en
> [`service.py`](../../apps/api/modules/ai/service.py). Toda la traducción de errores y los
> timeouts viven en la capa de servicio.

### 15.4 Servicio del Gateway — [`apps/api/modules/ai/service.py`](../../apps/api/modules/ai/service.py)

El servicio es el **guardián de la política de errores**. Tiene dos timeouts distintos:

```python
def _timeout_motor_ia() -> float:
    """Timeout en segundos para las llamadas al motor. Default 30s."""
    try:
        return float(os.getenv("AI_LOCAL_TIMEOUT", "30"))
    except (TypeError, ValueError):
        return 30.0

def _timeout_entrenamiento() -> float:
    """Timeout (segundos) para el entrenamiento. Default 1h."""
    try:
        return float(os.getenv("AI_TRAIN_TIMEOUT", "3600"))
    except (TypeError, ValueError):
        return 3600.0
```

**¿Por qué dos timeouts?** Porque el entrenamiento tarda minutos u horas, mientras que una
detección de visión tarda milisegundos. Usar el mismo timeout para ambos sería un error: o
cortaríamos el entrenamiento, o dejaríamos una detección colgada 1 hora.

La función clave es `entrenar_vision()`, que traduce los errores del motor:

```python
async def entrenar_vision(payload: schemas.TrainRequest) -> schemas.TrainStatusResponse:
    """Lanza el fine-tuning en el motor y espera el resultado.

    El entrenamiento es LARGO: usa un timeout propio (`AI_TRAIN_TIMEOUT`, default 1h).
    """
    _verificar_configuracion("entrenamiento")
    url = f"{_base_motor()}/vision/train"
    try:
        async with httpx.AsyncClient(timeout=_timeout_entrenamiento()) as cliente:
            resp = await cliente.post(url, json=payload.model_dump())
    except (httpx.ConnectError, httpx.ConnectTimeout, httpx.ReadTimeout) as exc:
        _lanzar_no_disponible(f"Motor de IA inalcanzable: {exc}")
    except httpx.HTTPError as exc:
        _lanzar_no_disponible(f"Error de transporte con el motor: {exc}")

    if resp.status_code >= 500:
        _lanzar_no_disponible(f"El motor devolvió {resp.status_code}")

    if resp.status_code >= 400:
        # 400/409 son errores de NEGOCIO (dataset vacío, entrenamiento en curso).
        # Se propagan tal cual para que la UI pueda explicarlos.
        detalle = {}
        try:
            detalle = resp.json()
        except ValueError:
            detalle = {}
        raise HTTPException(status_code=resp.status_code, detail=detalle)

    try:
        return schemas.TrainStatusResponse(**resp.json())
    except (ValueError, TypeError) as exc:
        _lanzar_no_disponible(f"Respuesta inválida del motor: {exc}")
```

**Tabla de traducción de errores:**

| Situación | Código del motor | Respuesta del Gateway | ¿Por qué? |
|---|---|---|---|
| Motor caído / timeout | — | **503** `IA_NO_DISPONIBLE` | La IA es opcional; el POS no debe romperse |
| Motor devuelve 5xx | 500 | **503** `IA_NO_DISPONIBLE` | Un 500 del motor es un fallo de infraestructura |
| Dataset vacío | 400 | **400** (propagado) | Es un error de **negocio**, la UI debe explicarlo |
| Entrenamiento en curso | 409 | **409** (propagado) | Es un estado válido, no un fallo |
| JSON inválido | 200 | **503** `IA_NO_DISPONIBLE` | Contrato roto = motor no confiable |

> **Regla de oro del Gateway:** *"Cualquier fallo del motor (timeout, conexión rechazada, 5xx,
> JSON inválido) se traduce a 503 `IA_NO_DISPONIBLE`. Nunca se propaga un 500 al POS."*
> La única excepción son los errores **4xx de negocio** (400/409), que sí se propagan porque
> son información útil para el operador.

### 15.5 Endpoints del motor — [`ai-local/app/main.py`](../../ai-local/app/main.py)

El motor expone tres endpoints de entrenamiento:

```python
@app.get("/vision/dataset-summary", response_model=schemas.DatasetSummaryResponse)
async def dataset_summary() -> schemas.DatasetSummaryResponse:
    return training.resumen_dataset()

@app.get("/vision/train/status", response_model=schemas.TrainStatusResponse)
async def train_status() -> schemas.TrainStatusResponse:
    return training.estado_actual()

@app.post("/vision/train", response_model=schemas.TrainStatusResponse)
async def train(payload: schemas.TrainRequest) -> schemas.TrainStatusResponse:
    """Lanza el fine-tuning de YOLO sobre el dataset anotado."""
    return await training.entrenar(payload)
```

### 15.6 Orquestador — [`ai-local/app/engines/training.py`](../../ai-local/app/engines/training.py)

El orquestador mantiene un **estado global en memoria** y lanza el pipeline en un **subproceso
aislado**:

```python
ESTADO_ENTRENAMIENTO: dict = {
    "en_curso": False,
    "iniciado_en": None,
    "terminado_en": None,
    "exito": None,
    "mensaje": "",
    "run_name": None,
    "log_tail": [],
}
```

**¿Por qué un subproceso?** Porque `ultralytics`/`torch` pueden consumir toda la RAM y bloquear
el event loop de FastAPI. Al aislarlo en un subproceso:

1. El motor sigue respondiendo a `/status` y `/vision/detect` mientras entrena.
2. Si el subproceso muere (OOM), el motor sobrevive.
3. Se puede matar el entrenamiento sin reiniciar el contenedor.

La función `_correr_subproceso()` ejecuta el pipeline y captura el log:

```python
async def _correr_subproceso(
    cmd: list[str],
    log_path: Path,
    timeout: float,
) -> tuple[int, str]:
    """Ejecuta el pipeline en un subproceso y devuelve (returncode, tail_log)."""
    with open(log_path, "w", encoding="utf-8") as log_file:
        proceso = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=log_file,
            stderr=asyncio.subprocess.STDOUT,
        )
        try:
            await asyncio.wait_for(proceso.wait(), timeout=timeout)
        except asyncio.TimeoutError:
            proceso.kill()
            await proceso.wait()
            return -1, "Timeout: el entrenamiento excedió el límite."
    return proceso.returncode or 0, _leer_tail_log(log_path)
```

**Hot-reload del modelo:** al terminar con éxito, el orquestador recarga el modelo en memoria
**sin reiniciar el contenedor**:

```python
if exito:
    best = Path("/training/best.pt")
    if best.exists():
        vision.cargar_modelo(str(best))  # hot-reload
```

Esto es clave: el operador entrena y **de inmediato** el POS usa el modelo nuevo.

### 15.7 Pipeline — [`ai-local/train/train_bakery.py`](../../ai-local/train/train_bakery.py)

El pipeline tiene **4 etapas** independientes y testeables:

| Etapa | Función | Qué hace |
|---|---|---|
| 1. Descubrir | `descubrir_dataset(skus)` | Empareja cada imagen con su `.txt` YOLO |
| 2. Construir | `construir_dataset_yolo(...)` | Copia a `train/` y `val/` con split 80/20 |
| 3. Entrenar | `entrenar(...)` | Llama a `YOLO.train()` con el dataset temporal |
| 4. Publicar | `publicar_modelo(best, destino)` | Copia `best.pt` a `/training/best.pt` |

```python
def descubrir_dataset(skus: list[str] | None = None) -> dict[str, list[tuple[Path, Path]]]:
    """Devuelve {sku: [(imagen, label), ...]} solo para pares completos."""
    ...

def construir_dataset_yolo(
    pares: dict[str, list[tuple[Path, Path]]],
    destino: Path,
    val_ratio: float = 0.2,
) -> Path:
    """Copia las imágenes y etiquetas a la estructura YOLO train/val."""
    ...

def entrenar(dataset_dir: Path, epochs: int, imgsz: int, batch: int, run_name: str) -> Path:
    """Entrena YOLO y devuelve la ruta del best.pt."""
    ...

def publicar_modelo(best: Path, destino: Path) -> Path:
    """Copia el best.pt al destino final (montado como volumen)."""
    ...
```

---

## 16. FLUJO COMPLETO PASO A PASO

### 16.1 Camino feliz (happy path)

1. El operador entra al **Centro de IA** → pestaña **Visión**.
2. Selecciona un producto (SKU) en el desplegable.
3. Captura fotos con la cámara (`VisionScanner`).
4. Sincroniza las fotos al backend (`POST /pos/vision/training/upload`).
5. Anota cada foto dibujando cajas (`AnnotationCanvas`).
6. Guarda las anotaciones (`POST /pos/vision/annotations`) → se escriben los `.txt` YOLO.
7. El panel consulta `GET /ai/vision/dataset-summary` y muestra `annotated > 0`.
8. El botón **"Entrenar modelo"** aparece (solo si hay etiquetas).
9. El operador elige épocas y pulsa el botón.
10. `POST /ai/vision/train` → Gateway → Motor → subproceso `train_bakery.py`.
11. El pipeline descubre, construye, entrena y publica `best.pt`.
12. El orquestador hace **hot-reload** del modelo.
13. La UI muestra "✅ Entrenamiento completado con N imágenes".
14. El POS ya usa el modelo nuevo en la siguiente detección.

### 16.2 Caminos de error

| # | Escenario | Dónde falla | Respuesta | UX |
|---|---|---|---|---|
| 1 | Motor de IA caído | Gateway no conecta | **503** `IA_NO_DISPONIBLE` | "El motor de IA Local no está disponible. Entrena más tarde." |
| 2 | Dataset vacío (0 etiquetas) | Motor valida | **400** | "No hay imágenes anotadas para entrenar." |
| 3 | Entrenamiento ya en curso | Motor valida | **409** | "Ya hay un entrenamiento en curso." |
| 4 | Timeout del entrenamiento | Subproceso excede `AI_TRAIN_TIMEOUT` | **503** | "El entrenamiento tardó demasiado." |

---

## 17. DECISIONES DE DISEÑO Y SU JUSTIFICACIÓN

### 17.1 Subproceso aislado en vez de hilo

**Decisión:** el entrenamiento corre en un subproceso (`asyncio.create_subprocess_exec`), no en
un hilo ni en el event loop.

**Razón:** `torch` y `ultralytics` son librerías CPU-intensivas y con estado global. Un hilo
compartiría el GIL y bloquearía el event loop. Un subproceso aísla la memoria y permite matarlo
sin tumbar el motor.

### 17.2 Hot-reload en vez de reinicio

**Decisión:** al terminar el entrenamiento, se recarga el modelo en memoria
(`vision.cargar_modelo(best.pt)`).

**Razón:** reiniciar el contenedor del motor tardaría ~30s y dejaría la IA caída durante ese
tiempo. El hot-reload es instantáneo y transparente para el POS.

### 17.3 Dataset de solo lectura

**Decisión:** el volumen del dataset se monta como **solo lectura** en el contenedor del motor.

**Razón:** el motor **nunca** debe modificar las imágenes originales del operador. Solo las lee
para construir el dataset temporal de entrenamiento.

### 17.4 Ruta de salida fija

**Decisión:** el modelo entrenado siempre se publica en `/training/best.pt` (ruta fija).

**Razón:** el hot-reload necesita una ruta **conocida y estable**. Si la ruta variara por
`run_name`, el motor no sabría qué archivo cargar.

### 17.5 Timeout separado para el entrenamiento

**Decisión:** `AI_TRAIN_TIMEOUT` (default 1h) es independiente de `AI_LOCAL_TIMEOUT` (default 30s).

**Razón:** ver §15.4. Un timeout único rompería uno de los dos casos de uso.

### 17.6 El botón de entrenar solo aparece con etiquetas

**Decisión:** la UI oculta el bloque de entrenamiento si `dataset.annotated === 0`.

**Razón:** entrenar con cero etiquetas es un error garantizado. Es mejor **no ofrecer** la
acción que ofrecerla y fallar.

### 17.7 Errores de negocio vs errores de infraestructura

**Decisión:** los 4xx del motor se propagan; los 5xx se convierten en 503.

**Razón:** un dataset vacío (400) es información útil para el operador. Un motor caído (503) es
un fallo de infraestructura que el POS debe poder tolerar sin romperse.

---

## 18. CONTRATOS DE DATOS (SCHEMAS)

### 18.1 `TrainRequest` (entrada)

```python
class TrainRequest(BaseModel):
    skus: Optional[List[str]] = Field(
        default=None,
        description="SKUs a entrenar. None = todos los que tengan dataset.",
    )
    epochs: int = Field(default=50, ge=1, le=500)
    imgsz: int = Field(default=640, ge=160, le=1280)
    batch: int = Field(default=8, ge=1, le=64)
    run_name: str = Field(default="bakery")
```

### 18.2 `TrainStatusResponse` (salida)

```python
class TrainStatusResponse(BaseModel):
    en_curso: bool
    exito: Optional[bool] = None
    mensaje: str = ""
    run_name: Optional[str] = None
    imagenes_usadas: int = 0
    log_tail: List[str] = Field(default_factory=list)
```

### 18.3 `DatasetSummaryResponse` (salida)

```python
class DatasetSummaryResponse(BaseModel):
    total_imagenes: int
    anotadas: int
    sin_anotar: int
    por_sku: dict[str, int] = Field(default_factory=dict)
```

---

## 19. FORMATO YOLO DE LAS ETIQUETAS

Cada imagen `foto.jpg` tiene un archivo `foto.txt` hermano con **una línea por caja**:

```
<class_id> <x_center> <y_center> <width> <height>
```

- Todos los valores están **normalizados** entre 0 y 1 (relativos al ancho/alto de la imagen).
- `class_id` es `0` (una sola clase: "pan").
- Ejemplo: `0 0.512 0.487 0.221 0.334`

**Conversión desde píxeles (lo que hace `AnnotationCanvas`):**

```javascript
const xCenter = (x + w / 2) / imageWidth;
const yCenter = (y + h / 2) / imageHeight;
const normW = w / imageWidth;
const normH = h / imageHeight;
```

**¿Por qué normalizado?** Porque YOLO redimensiona las imágenes a `imgsz` durante el
entrenamiento. Las coordenadas normalizadas son **invariantes a la resolución**.

---

## 20. CONFIGURACIÓN Y DESPLIEGUE

### 20.1 Variables de entorno

| Variable | Default | Descripción |
|---|---|---|
| `AI_LOCAL_URL` | `http://ia-local:9000` | URL del motor de IA Local |
| `AI_LOCAL_TIMEOUT` | `30` | Timeout (s) para detección/transcripción |
| `AI_TRAIN_TIMEOUT` | `3600` | Timeout (s) para el entrenamiento |
| `AI_HABILITADA` | `true` | Interruptor maestro de la IA |

### 20.2 Volúmenes (docker-compose.ai.yml)

| Volumen host | Volumen contenedor | Modo | Propósito |
|---|---|---|---|
| `./ai-local/train` | `/app/train` | `ro` | Código del pipeline |
| `./data/vision_dataset` | `/dataset` | `ro` | Imágenes y etiquetas del operador |
| `./data/vision_models` | `/training` | `rw` | Salida del modelo (`best.pt`) |

### 20.3 Comandos

```bash
# Levantar el motor de IA
docker compose -f docker-compose.ai.yml up -d

# Ver logs del motor
docker compose -f docker-compose.ai.yml logs -f ia-local

# Verificar estado
curl http://localhost:9000/status
```

---

## 21. VALIDACIÓN (SMOKE TEST)

**Dataset de prueba:** 8 imágenes anotadas de un SKU.

**Parámetros:** `epochs=1`, `imgsz=160`, `batch=2`.

**Resultado esperado:**

| Métrica | Valor |
|---|---|
| Duración | ~2-4 min (CPU) |
| `best.pt` | ~6,189,866 bytes |
| `exito` | `true` |
| Hot-reload | Modelo recargado sin reinicio |

**Cómo verificar:**

```bash
# 1. Lanzar el entrenamiento
curl -X POST http://localhost:3001/api/v1/ai/vision/train \
  -H "Content-Type: application/json" \
  -d '{"epochs":1,"imgsz":160,"batch":2}'

# 2. Consultar el estado
curl http://localhost:3001/api/v1/ai/vision/train/status

# 3. Verificar que el modelo se publicó
docker exec ia-local ls -la /training/best.pt
```

---

## 22. BUG RESUELTO — LA RUTA DOBLE `apps/api`

### 22.1 Síntoma

El entrenamiento fallaba con "dataset no encontrado" aunque las imágenes existían.

### 22.2 Causa raíz

El contenedor del motor montaba el dataset en una ruta que incluía `apps/api` **dos veces**:

```
/app/apps/api/data/vision_dataset   ← ruta real (incorrecta)
/app/data/vision_dataset            ← ruta esperada
```

El `docker-compose.ai.yml` tenía un `working_dir` que duplicaba el prefijo.

### 22.3 Solución

Se corrigió el `volumes` del `docker-compose.ai.yml` para montar en la ruta absoluta correcta:

```yaml
volumes:
  - ./data/vision_dataset:/dataset:ro
```

Y el pipeline usa la constante `DATASET_DIR = Path("/dataset")` en vez de una ruta relativa.

### 22.4 Lección

**Nunca usar rutas relativas dentro de contenedores.** El `working_dir` puede cambiar y romper
todo. Siempre rutas absolutas desde la raíz del contenedor.

---

## 23. SEGURIDAD Y LÍMITES

### 23.1 Límites de recursos

| Recurso | Límite | Razón |
|---|---|---|
| Memoria del motor | `mem_limit: 6g` | `torch` + YOLO consumen mucha RAM |
| Concurrencia de entrenamiento | 1 (mutex `ESTADO_ENTRENAMIENTO`) | Evitar 2 entrenamientos simultáneos |
| Timeout de entrenamiento | 1h | Evitar procesos zombis |

### 23.2 Protección contra path traversal

El endpoint `POST /pos/vision/annotations` valida que el `sku` y el `filename` **no contengan**
`..` ni separadores de ruta:

```python
if ".." in sku or "/" in sku or "\\" in sku:
    raise HTTPException(status_code=400, detail="SKU inválido")
```

### 23.3 Aislamiento del motor

El motor **nunca** tiene acceso a la base de datos ni a las credenciales del ERP. Solo ve:

- El dataset (solo lectura).
- El directorio de salida del modelo (escritura).
- La red interna de Docker.

---

## 24. ARCHIVOS INVOLUCRADOS

### 24.1 Frontend

| Archivo | Rol |
|---|---|
| [`apps/pos/VisionTrainingUI.jsx`](../../apps/pos/VisionTrainingUI.jsx) | Panel de Visión (captura, anotación, entrenamiento) |
| [`apps/pos/components/AnnotationCanvas.jsx`](../../apps/pos/components/AnnotationCanvas.jsx) | Lienzo de dibujo de cajas |
| [`apps/pos/VisionScanner.jsx`](../../apps/pos/VisionScanner.jsx) | Captura de cámara |
| [`apps/pos/services/POSService.js`](../../apps/pos/services/POSService.js) | Cliente HTTP (3 métodos de entrenamiento) |

### 24.2 Backend (Gateway)

| Archivo | Rol |
|---|---|
| [`apps/api/modules/ai/router.py`](../../apps/api/modules/ai/router.py) | 3 endpoints de entrenamiento |
| [`apps/api/modules/ai/service.py`](../../apps/api/modules/ai/service.py) | Traducción de errores + timeouts |
| [`apps/api/modules/ai/schemas.py`](../../apps/api/modules/ai/schemas.py) | Contratos Pydantic |
| [`apps/api/modules/pos/service.py`](../../apps/api/modules/pos/service.py) | Upload, anotaciones, dataset |

### 24.3 Motor de IA

| Archivo | Rol |
|---|---|
| [`ai-local/app/main.py`](../../ai-local/app/main.py) | 3 endpoints de entrenamiento |
| [`ai-local/app/engines/training.py`](../../ai-local/app/engines/training.py) | Orquestador + subproceso + hot-reload |
| [`ai-local/train/train_bakery.py`](../../ai-local/train/train_bakery.py) | Pipeline de 4 etapas |
| [`ai-local/app/engines/vision.py`](../../ai-local/app/engines/vision.py) | Carga del modelo YOLO |

---

## 25. ESTADO ACTUAL Y TRABAJO PENDIENTE

### 25.1 Estado

| Componente | Estado |
|---|---|
| Captura de fotos | ✅ Funcional |
| Anotación de cajas | ✅ Funcional |
| Upload al backend | ✅ Funcional |
| Dataset summary | ✅ Funcional |
| Entrenamiento | ✅ Funcional (validado con smoke test) |
| Hot-reload | ✅ Funcional |
| Integración en Centro de IA | ✅ Funcional (v26.1) |

### 25.2 Trabajo pendiente

- **Validación manual en navegador** de los 5 flujos del Centro de IA (FASE 3).
- **Ampliar el dataset** a más SKUs para mejorar la precisión.
- **Evaluar GPU** si el volumen de entrenamiento crece.

---

## 26. GLOSARIO

| Término | Definición |
|---|---|
| **Fine-tuning** | Reentrenar un modelo preentrenado con datos propios |
| **YOLO** | "You Only Look Once", modelo de detección de objetos |
| **best.pt** | El mejor checkpoint del entrenamiento (pesos del modelo) |
| **Hot-reload** | Recargar un modelo en memoria sin reiniciar el proceso |
| **Subproceso** | Proceso hijo aislado del proceso principal |
| **Dataset** | Conjunto de imágenes + etiquetas para entrenar |
| **Anotación** | Dibujar cajas sobre una imagen para etiquetar objetos |
| **Epoch** | Una pasada completa sobre el dataset de entrenamiento |
| **imgsz** | Tamaño al que se redimensionan las imágenes para entrenar |
| **batch** | Número de imágenes procesadas antes de actualizar los pesos |
| **SKU** | Stock Keeping Unit, identificador único de un producto |
| **Gateway** | Capa intermedia que traduce y protege al ERP del motor |

---

## 27. HISTORIAL DE CAMBIOS

| Versión | Fecha | Cambio |
|---|---|---|
| v7 Fase 8 | — | Fine-tuning de YOLO: pipeline, orquestador, hot-reload, smoke test |
| v26.1 | 22 Sep 2026 | Fusión de la documentación de entrenamiento dentro del Centro de IA |
| v26.2 | 22 Sep 2026 | Añadida la 4ª capacidad: OCR de pedidos (Parte III, sección 28) |
| v27.1 | 23 Sep 2026 | Corrección de efectividad del OCR: tema oscuro, multi-PSM, respaldo determinista y panel de diagnóstico (sección 28.12) |
| v27.2 | 23 Sep 2026 | 2ª corrección de efectividad: causa raíz real = `uvicorn` del `api` sin `--reload` (endpoint 404); limpieza del prefijo «Cliente:» y match de productos contra todo el catálogo (sección 28.13) |
| v27.3 | 23 Sep 2026 | Corrección de usabilidad del panel OCR: el selector de cliente se llenaba de la matriz (solo clientes con pedido previo) → ahora usa el directorio completo; y se añade la **captura manual de pedido** que el mensaje de error prometía pero no existía (sección 28.14) |

---

---

# PARTE III — OCR DE PEDIDOS (PESTAÑA PROGRAMACIÓN DE PEDIDOS)

## 28. LECTURA DE CAPTURAS DE WHATSAPP (OCR + LLM)

### 28.1 Problema que resuelve

En el módulo **Reparto Grandeza**, el administrador recibe los pedidos de los clientes por
**WhatsApp**. Hasta ahora debía **transcribir a mano** cada pedido en la matriz de la pestaña
«📋 Programación de Pedidos»: buscar el cliente, buscar cada producto y teclear la cantidad.
Con 20–40 clientes por día, esto es lento y propenso a errores.

La **4ª capacidad del Centro de IA** permite **subir una captura de pantalla del chat** y que la
IA **proponga** el pedido ya estructurado (cliente + renglones producto/cantidad), listo para que
el operador lo **revise y confirme**.

> **Contrato human-in-the-loop (inviolable):** la IA **PROPONE**, el humano **CONFIRMA**.
> Nada se guarda en la base de datos hasta que el operador presiona «Confirmar pedido».
> El motor de IA **no conoce** el campo `confirmado` — por diseño no puede registrar nada.

### 28.2 Por qué NO se usa YOLO (visión) para esto

Es la confusión más común y conviene dejarla explícita:

| Tecnología | Pregunta que responde | Motor | Endpoint |
|---|---|---|---|
| **Visión (YOLO)** | «¿CUÁNTOS panes hay en la foto?» | YOLOv8 | `POST /vision/detect` |
| **OCR (Tesseract)** | «¿QUÉ DICE el texto de la captura?» | Tesseract + Ollama | `POST /ocr/extract-order` |

YOLO **cuenta objetos**; **no lee texto**. Una captura de WhatsApp es **texto**, no objetos
contables. Por eso se añadió **Tesseract** (OCR) como tecnología **distinta y complementaria**.
Ambas conviven: YOLO sigue intacto para contar pan, OCR se suma para leer imágenes con texto.

### 28.3 Arquitectura del pipeline (Ruta A)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  FRONTEND — GrandezaOrderRequestsTab.jsx  (pestaña Programación de Pedidos)   │
│  Botón «📷 Subir captura» → FileReader → base64 (sin prefijo data:)           │
└───────────────────────────────┬──────────────────────────────────────────────┘
                                │ POST /grandeza/order-requests/ocr-extract
                                │ { imagen_base64, productos_catalogo[], clientes_catalogo[] }
                                ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  ERP — apps/api/modules/grandeza/router.py                                    │
│  ocr_extract_order_request()                                                  │
│    ├─ ai_service.extraer_pedido_ocr()   (Gateway, apps/api/modules/ai/service)│
│    │     └─ POST {AI_LOCAL_URL}/ocr/extract-order                             │
│    └─ GrandezaService.resolver_cliente_ocr()  +  resolver_productos_ocr()     │
│          (match en cascada contra el catálogo REAL del ERP)                   │
└───────────────────────────────┬──────────────────────────────────────────────┘
                                │ POST /ocr/extract-order
                                ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  MOTOR DE IA LOCAL — ai-local/app/main.py  →  extract_order()                 │
│    1. ocr.extraer_texto(imagen_base64)   → Tesseract (spa) → texto crudo      │
│    2. nlu.parsear_pedido(texto, ...)     → Ollama → {items, notas, confianza} │
│    3. Devuelve propuesta SIN resolver IDs (el LLM no decide IDs)              │
└───────────────────────────────┬──────────────────────────────────────────────┘
                                │ respuesta
                                ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  ERP — resuelve cliente y productos contra su catálogo real (cascada)         │
│    Cliente:  teléfono → nombre exacto → fuzzy (contención) → manual           │
│    Producto: nombre exacto → fuzzy → requiere_revision = true                 │
└───────────────────────────────┬──────────────────────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  FRONTEND — Panel de confirmación (human-in-the-loop)                         │
│    Vista previa + confianzas + cliente + renglones editables                  │
│    El operador corrige → «Confirmar pedido» → POST /grandeza/order-requests   │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Regla de oro:** el LLM **nunca** decide un `client_id` ni un `product_id`. Solo extrae
**texto** (nombre del cliente, nombre del producto, cantidad). El **ERP** es quien resuelve esos
nombres contra su catálogo real mediante el match en cascada. Así el LLM no puede inventar
productos que no existen.

### 28.4 Componentes en detalle

#### 28.4.1 Motor OCR — `ai-local/app/engines/ocr.py` (nuevo)

| Aspecto | Detalle |
|---|---|
| Motor | **Tesseract OCR** (`pytesseract`) |
| Idioma | `spa` (español) — requiere `tesseract-ocr-spa` |
| Entrada | `imagen_base64` (string, sin prefijo `data:`) |
| Salida | Texto crudo + confianza media de Tesseract |
| Preprocesado | Escala de grises + umbral adaptativo (mejora capturas de pantalla) |
| Función | `extraer_texto(imagen_base64) -> (texto, confianza)` |

#### 28.4.2 Parser LLM — `ai-local/app/engines/nlu.py::parsear_pedido()`

| Aspecto | Detalle |
|---|---|
| Motor | **Ollama** (LLM local, mismo que la voz) |
| Entrada | Texto crudo del OCR + catálogos (productos, clientes) como contexto |
| Salida | `{ items: [{producto, cantidad, confianza}], notas, confianza }` |
| Prompt | Instruye al LLM a **solo extraer**, nunca inventar ni resolver IDs |
| Tolerancia | Si el LLM devuelve JSON inválido → se descarta el renglón, no se rompe |

#### 28.4.3 Endpoint del motor — `POST /ocr/extract-order`

Definido en [`ai-local/app/main.py`](../../ai-local/app/main.py:267) y
[`ai-local/app/schemas.py`](../../ai-local/app/schemas.py:167).

**Request** (`OcrExtractOrderRequest`):
```json
{
  "imagen_base64": "iVBORw0KGgo...",
  "productos_catalogo": ["Concha", "Bolillo", "Telera"],
  "clientes_catalogo": ["Abarrotes La Esquina", "Tienda Doña Mary"]
}
```

**Response** (`OcrExtractOrderResponse`):
```json
{
  "ok": true,
  "texto_ocr": "Cliente: Abarrotes La Esquina\n2 conchas\n1 bolillo",
  "confianza_ocr": 0.87,
  "confianza_llm": 0.91,
  "cliente_nombre": "Abarrotes La Esquina",
  "cliente_telefono": null,
  "items": [
    { "producto": "conchas", "cantidad": 2, "confianza": 0.9 },
    { "producto": "bolillo", "cantidad": 1, "confianza": 0.95 }
  ],
  "notas": "El cliente pidió entrega temprano"
}
```

#### 28.4.4 Gateway — `apps/api/modules/ai/service.py::extraer_pedido_ocr()`

Sigue **exactamente** el patrón del Gateway (ver `CONTEXTO_SISTEMA_IA.md`):

- `_ia_habilitada()` → si `AI_LOCAL_ENABLED` es falso → **503 `IA_NO_DISPONIBLE`**.
- `_verificar_configuracion()` → si falta `AI_LOCAL_URL` → **503**.
- `_llamar_motor()` → timeout configurable; cualquier fallo del motor → **503**, nunca 500.
- El ERP **degrada con gracia**: si el motor no está, el operador captura a mano.

#### 28.4.5 Endpoint del ERP — `POST /grandeza/order-requests/ocr-extract`

Definido en [`apps/api/modules/grandeza/router.py`](../../apps/api/modules/grandeza/router.py:429).

**Request** (`GrandezaOcrExtractRequest`):
```json
{
  "imagen_base64": "iVBORw0KGgo...",
  "productos_catalogo": ["Concha", "Bolillo"],
  "clientes_catalogo": ["Abarrotes La Esquina"]
}
```

**Response** (`GrandezaOcrExtractResponse`):
```json
{
  "ok": true,
  "cliente_id": 42,
  "cliente_nombre": "Abarrotes La Esquina",
  "cliente_telefono": "5551234567",
  "cliente_match": "nombre_exacto",
  "confianza_ocr": 0.87,
  "confianza_llm": 0.91,
  "items": [
    { "producto_id": 7, "producto": "Concha", "cantidad": 2, "confianza": 0.9, "requiere_revision": false }
  ],
  "notas": "El cliente pidió entrega temprano"
}
```

### 28.5 Match en cascada (D-6)

El cliente se identifica por **teléfono o nombre** en el encabezado del chat. El ERP intenta
resolverlo en este orden estricto:

| Paso | Estrategia | `cliente_match` |
|---|---|---|
| 1 | **Teléfono** normalizado (10 dígitos) contra `grandeza_clients.phone` | `telefono` |
| 2 | **Nombre exacto** (normalizado: mayúsculas, sin acentos) | `nombre_exacto` |
| 3 | **Fuzzy** — contención de subcadenas (el nombre del chat ⊂ nombre del cliente o viceversa) | `fuzzy` |
| 4 | **Manual** — no se encontró; el operador lo selecciona en el panel | `manual` |

Los productos siguen una cascada análoga (exacto → fuzzy). Si un producto **no** se resuelve,
el renglón se marca con `requiere_revision: true` y el panel lo resalta en **ámbar** con la
etiqueta «Revisar», mostrando lo que la IA leyó para que el operador lo corrija.

### 28.6 Panel de confirmación (human-in-the-loop)

El panel se renderiza en [`GrandezaOrderRequestsTab.jsx`](../../apps/pos/GrandezaOrderRequestsTab.jsx:440)
y tiene **tres columnas**:

1. **Vista previa + metadatos** — la captura subida, la confianza OCR, la confianza LLM, el tipo
   de match del cliente y las notas de la IA.
2. **Editor de la propuesta** — selector de cliente (pre-cargado con el match) y lista editable de
   renglones (producto + cantidad), con botones «+ Agregar renglón» y «✕» por renglón.
3. **Acciones** — «Cancelar» (descarta todo) y «Confirmar pedido» (guarda vía
   `POST /grandeza/order-requests` con `source: "OCR"`).

**Nada se persiste** hasta «Confirmar pedido». Si el operador descarta, no queda rastro en la BD.

### 28.7 Resiliencia y degradación

| Escenario | Comportamiento |
|---|---|
| IA deshabilitada (`AI_LOCAL_ENABLED=false`) | **503** → el panel muestra «Motor de IA no disponible» y sugiere captura manual |
| Motor caído / timeout | **503** → mismo mensaje; el ERP sigue funcionando |
| OCR no encuentra texto legible | `ok: false` + `notas` → el panel lo explica y sugiere captura manual |
| LLM devuelve JSON inválido | Se descartan los renglones inválidos; el resto se conserva |
| Producto no resuelto | Renglón con `requiere_revision: true` (ámbar) para corrección manual |
| Cliente no resuelto | El selector queda vacío; el panel muestra el nombre propuesto por la IA |

**Principio:** el OCR es una **ayuda**, nunca un **requisito**. Si falla, el flujo manual de la
matriz sigue disponible sin cambios.

### 28.8 Seguridad y límites

- La imagen **no se almacena** en el ERP: se envía al motor, se procesa y se descarta.
- El motor corre **local** (Ollama + Tesseract), sin llamadas a servicios externos.
- El LLM **no** recibe credenciales ni acceso a la BD; solo texto y catálogos de nombres.
- El LLM **no** puede crear clientes ni productos: solo el ERP resuelve contra su catálogo real.
- El endpoint del ERP **no** persiste nada: solo devuelve una propuesta.

### 28.9 Archivos involucrados

| Archivo | Rol |
|---|---|
| [`ai-local/Dockerfile`](../../ai-local/Dockerfile) | Instala `tesseract-ocr` + `tesseract-ocr-spa` |
| [`ai-local/app/engines/ocr.py`](../../ai-local/app/engines/ocr.py) | Motor OCR (Tesseract) — **nuevo** |
| [`ai-local/app/engines/nlu.py`](../../ai-local/app/engines/nlu.py) | `parsear_pedido()` — estructura el texto |
| [`ai-local/app/main.py`](../../ai-local/app/main.py) | Endpoint `POST /ocr/extract-order` |
| [`ai-local/app/schemas.py`](../../ai-local/app/schemas.py) | Contratos `OcrExtractOrder*` |
| [`apps/api/modules/ai/service.py`](../../apps/api/modules/ai/service.py) | `extraer_pedido_ocr()` (Gateway) |
| [`apps/api/modules/ai/router.py`](../../apps/api/modules/ai/router.py) | `POST /ai/ocr/extract-order` |
| [`apps/api/modules/ai/schemas.py`](../../apps/api/modules/ai/schemas.py) | Contratos del Gateway |
| [`apps/api/modules/grandeza/router.py`](../../apps/api/modules/grandeza/router.py) | `POST /grandeza/order-requests/ocr-extract` |
| [`apps/api/modules/grandeza/service.py`](../../apps/api/modules/grandeza/service.py) | `resolver_cliente_ocr()` + `resolver_productos_ocr()` |
| [`apps/pos/GrandezaOrderRequestsTab.jsx`](../../apps/pos/GrandezaOrderRequestsTab.jsx) | Botón «📷 Subir captura» + panel de confirmación |

### 28.10 Criterios de aceptación

- [x] El botón «📷 Subir captura» aparece en la pestaña Programación de Pedidos.
- [x] La captura se envía al motor y se recibe una propuesta estructurada.
- [x] El cliente se resuelve por teléfono → nombre exacto → fuzzy → manual.
- [x] Los productos se resuelven contra el catálogo real; los dudosos se marcan «Revisar».
- [x] El panel permite editar cliente y renglones antes de confirmar.
- [x] **Nada** se guarda hasta presionar «Confirmar pedido».
- [x] Si la IA no está disponible, el flujo manual sigue funcionando (degradación con gracia).
- [x] Build verificado (`npm run build` exit 0) y `py_compile` sin errores.

### 28.11 Fuera de alcance

- **Lectura automática de chats en vivo** (WhatsApp Business API) — fuera de alcance; el humano
  sube la captura manualmente.
- **Entrenamiento de un modelo OCR propio** — se usa Tesseract preentrenado.
- **Resolución de IDs por el LLM** — prohibido por diseño; siempre resuelve el ERP.

### 28.12 Corrección de efectividad (v27.1 — Fase F)

**Síntoma reportado:** el operador subía una captura de WhatsApp con texto perfectamente legible y
la IA respondía «no reconoció nada».

**Causa raíz (infraestructura):** el contenedor `ia-local` corría una **imagen construida antes de
que existiera el código de OCR**. Esa imagen no contenía el binario `tesseract`, ni la librería
`pytesseract`, ni el módulo `ocr.py`. El endpoint fallaba de forma silenciosa y el panel mostraba el
mensaje genérico de error.

> **Lección de operación:** la imagen de `ia-local` **no** está montada por volumen (`bind mount`);
> el `Dockerfile` copia `app/` en tiempo de construcción. Por lo tanto, **cualquier cambio en
> `ai-local/app/` exige reconstruir la imagen** (`docker compose -f docker-compose.ai.yml build
> ia-local`) y recrear el contenedor (`up -d --force-recreate ia-local`). Reiniciar el contenedor
> **no** basta. El contenedor tarda ~90 s en quedar sano porque carga Whisper y YOLO al arrancar.

**Correcciones aplicadas:**

| # | Archivo | Corrección |
|---|---|---|
| 1 | [`ocr.py`](../../ai-local/app/engines/ocr.py) | **Detección de tema oscuro/claro** por mediana de brillo del histograma + inversión. Tesseract asume texto oscuro sobre fondo claro; las capturas de WhatsApp en tema oscuro devolvían basura o nada. |
| 2 | [`ocr.py`](../../ai-local/app/engines/ocr.py) | **Binarización por umbral + autocontraste** para eliminar el ruido de compresión JPEG. |
| 3 | [`ocr.py`](../../ai-local/app/engines/ocr.py) | **Estrategia multi-PSM**: se prueban `--psm 6` (bloque uniforme), `--psm 4` (burbujas) y `--psm 3` (automático), y se elige el resultado con más líneas útiles y mayor confianza. Ningún PSM sirve para todas las capturas. |
| 4 | [`nlu.py`](../../ai-local/app/engines/nlu.py) | **Parser determinista de respaldo por regex** (`parsear_pedido_determinista`). Si el LLM devuelve 0 renglones pero el OCR **sí** leyó texto, se extraen producto+cantidad por regex. Elimina el síntoma «no reconoció nada» cuando el texto estaba bien y solo falló el LLM. |
| 5 | [`nlu.py`](../../ai-local/app/engines/nlu.py) | **Prompt con 2 ejemplos few-shot y 10 reglas**, incluyendo corrección de erratas típicas de OCR (`bo1illos` → `bolillos`, `c0nchas` → `conchas`). |
| 6 | [`GrandezaOrderRequestsTab.jsx`](../../apps/pos/GrandezaOrderRequestsTab.jsx) | **Panel de diagnóstico** «🔎 Ver lo que el OCR sí leyó» con el texto crudo y el % de confianza. Permite distinguir «la imagen no tiene texto legible» de «el OCR leyó pero la IA no entendió». |

**Verificación end-to-end:** `POST /ocr/extract-order` sobre una captura de prueba devolvió el
cliente `Juan Perez` y 3 renglones (`bolillo 20`, `concha 15`, `telera 3`) con **94.8 %** de
confianza OCR. El parser determinista de respaldo se validó por separado extrayendo los mismos 3
renglones sin LLM.

**Nuevo comportamiento de degradación en cascada:**

```
Tesseract lee texto  →  LLM estructura  →  si el LLM falla, regex de respaldo  →  match al catálogo
```

El operador **siempre** recibe una propuesta si el OCR leyó algo, y **siempre** puede ver qué leyó
realmente el OCR para decidir si el problema es la imagen o el modelo.

### 28.13 Segunda corrección de efectividad (v27.2 — Fase G)

**Síntoma reportado:** tras la Fase F, el operador volvió a reportar «**sigue sin ser capaz de leer
nada**». El motor, probado de forma aislada, sí leía; pero desde la UI el resultado seguía siendo
inútil.

**Causa raíz real (infraestructura — la más importante):** el contenedor `api` ejecutaba `uvicorn`
**sin la bandera `--reload`** y llevaba **2 horas** en marcha. El código de las Fases A/B/C está
montado por volumen (`./apps/api:/app`), pero el proceso ya tenía los módulos viejos en memoria y
**nunca recargó** los archivos nuevos. Resultado: el endpoint `POST /api/v1/grandeza/order-requests/
ocr-extract` **no existía** en el proceso en vivo y devolvía **HTTP 404 `{"detail":"Not Found"}`**.

Evidencia objetiva (rutas en `/openapi.json`):

| Métrica | Antes del `restart` | Después del `restart` |
|---|---|---|
| Rutas totales | 173 | **181** |
| Rutas `order-requests/*` | 0 | **7** |
| Rutas `ocr/*` | 0 | **2** |

> **Lección de operación (crítica):** el servicio `api` **sí** está montado por volumen, pero su
> `uvicorn` corre **sin `--reload`**. Por lo tanto, **cualquier cambio en `apps/api/` exige
> `docker compose restart api`**. No basta con guardar el archivo: el proceso en vivo conserva los
> módulos antiguos. Esta fue la verdadera razón del «no lee nada», no el OCR.

**Defectos adicionales corregidos (calidad del resultado):**

| # | Archivo | Defecto | Corrección |
|---|---|---|---|
| 1 | [`ocr.py`](../../ai-local/app/engines/ocr.py) | `extraer_candidato_cliente()` tomaba la primera línea del encabezado **literal**, conservando el prefijo `"Cliente: "`. El nombre resultante (`"Cliente: Abarrotes La Esquina"`) no matcheaba el directorio → `cliente_match: "manual"`, `cliente_id: null`. | Nueva función `_limpiar_nombre_cliente()` con la regex `_RE_ETIQUETA_CLIENTE`, que elimina `Cliente:`, `Nombre:`, `Contacto:`, `Razón Social:`, `Negocio:`, `Tienda:`, `Para:`, `De:`, `A:` (repetible hasta 3 veces) y limpia comillas y dos puntos residuales. |
| 2 | [`service.py`](../../apps/api/modules/grandeza/service.py) | `resolver_productos_ocr()` solo matcheaba contra `GrandezaProductConfig` con `is_enabled=True`. En la BD real solo hay **5 productos habilitados** (`ESPOLVOREADO`, `HIGO`, `MINIS`, `NUEZ`, `PASAS`), así que `bolillo`/`concha`/`telera` devolvían `producto_id: null` y `requiere_revision: true`. | El match ahora se hace contra **TODO el catálogo de productos** (el cliente puede pedir cualquiera), **priorizando** los habilitados para Grandeza. Se exige un mínimo de **4 caracteres** en el match fuzzy para evitar falsos positivos con palabras cortas. |

**Verificación end-to-end (tras `restart api` + rebuild de `ia-local`):**

| Campo | Antes (Fase F) | Después (Fase G) |
|---|---|---|
| `cliente_nombre` | `"Cliente: Abarrotes La Esquina"` | **`"Abarrotes La Esquina"`** |
| `bolillo` → `producto_id` | `null` | **5** (`BOLILLO ARTESANAL MEDIANO`) |
| `concha` → `producto_id` | `null` | **54** (`CONCHA DE CANELA GRANDE`) |
| `telera` → `producto_id` | `null` | **3** |
| `requiere_revision` | `true` (los 3) | **`false`** (los 3) |

El `cliente_match` permanece en `"manual"` cuando el nombre no existe en el directorio: es el
comportamiento correcto (el operador lo elige en la UI). El motor **nunca** inventa un `client_id`.

**Regla de operación consolidada (obligatoria para futuros cambios):**

```
Cambio en ai-local/app/  →  docker compose -f docker-compose.ai.yml build ia-local
                            docker compose -f docker-compose.ai.yml up -d --force-recreate ia-local
                            (esperar ~90 s a que quede "healthy")

Cambio en apps/api/      →  docker compose restart api
                            (el uvicorn NO tiene --reload)
```

### 28.14 Corrección de usabilidad del panel OCR (v27.3 — Fase H)

**Síntoma reportado (dos defectos en el mismo panel):**

1. «*Ya confirmé que funciona, probé con una captura, solo que no supo qué cliente y me dio un
   selector para que yo decida qué cliente, solo que **el selector de cliente no funciona***».
2. «*Cuando no detectaba nada en absoluto me decía: **agrega el pedido manualmente en la tabla
   superior**, pero **no está habilitado** el agregar un pedido manualmente en la tabla*».

Ambos defectos comparten una misma raíz conceptual: **la matriz superior solo contiene a los
clientes que YA tienen un pedido registrado para esa fecha** (decisión **D-4**: los que no
respondieron no aparecen). Por eso la matriz no sirve ni para elegir un cliente nuevo ni para dar
de alta un pedido desde cero.

**Causa raíz del defecto 1 (selector vacío):** el `<select>` de cliente del panel OCR se poblaba
con `(matrix?.rows || []).map(r => r.client_name)`. Como `get_order_matrix()` construye `rows`
**solo** a partir de los pedidos existentes, al capturar un pedido **nuevo** (el caso normal del
OCR) el cliente no está en la matriz y el dropdown quedaba **vacío**. El operador no podía elegir
nada.

**Causa raíz del defecto 2 (captura manual inexistente):** el mensaje de error del panel OCR decía
«*Puedes capturar el pedido a mano en la matriz de arriba*», pero la tabla de la matriz **solo
renderiza `matrix.rows`** y **no tiene ningún botón para agregar un renglón**. La instrucción
apuntaba a una capacidad que no existía.

**Correcciones aplicadas** (todas en [`GrandezaOrderRequestsTab.jsx`](../../apps/pos/GrandezaOrderRequestsTab.jsx)):

| # | Defecto | Corrección |
|---|---|---|
| 1 | Selector de cliente poblado desde `matrix.rows` (solo clientes con pedido previo) | Nuevo estado `clientesDirectorio` cargado una sola vez desde `GET /grandeza/clients?active_only=true` (48 clientes activos). El `<select>` ahora itera `clientesDirectorio` (`c.id`, `c.name`, `c.phone`). Se añade un aviso visible si el directorio está vacío. |
| 2 | El match de cliente del OCR se hacía contra `matrix.rows` | `handleOcrUpload` ahora construye `clientes_catalogo` desde `clientesDirectorio.map(c => c.name)`, de modo que el match por nombre funciona aunque el cliente no tenga pedido previo. |
| 3 | No existía captura manual de pedido | Nuevo estado `manualMode` + función `abrirManual()`. El panel OCR se reutiliza como **editor de captura manual** (cliente + renglones producto/cantidad), accesible desde un botón **«✍️ Pedido manual»** en la barra de herramientas y desde un botón **«✍️ Capturar pedido manualmente»** dentro del bloque de error. |
| 4 | El mensaje de error apuntaba a una capacidad inexistente | El texto ahora dice «*Puedes capturar el pedido a mano con el botón de abajo*» y ofrece el botón que **sí** abre el editor manual. |

**Detalles de implementación del modo manual:**

- `abrirManual()` inicializa `ocrEdit` con un renglón vacío
  (`{ producto_id: '', producto: '', cantidad: 0, ... }`) y `manualMode = true`.
- El título del panel cambia a «✍️ Captura Manual de Pedido» y el párrafo introductorio explica el
  flujo manual (elegir cliente + agregar renglones).
- La columna de **vista previa de la captura** solo se muestra cuando hay `ocrPropuesta` (modo OCR);
  en modo manual el editor ocupa el ancho completo (`lg:col-span-3`).
- `cancelarOcr()` resetea `manualMode` a `false`.
- **El contrato human-in-the-loop se mantiene intacto:** nada se registra hasta que el operador
  presiona «Confirmar pedido». El motor de IA sigue sin decidir `client_id` ni `product_id`.

**Verificación:**

| Comprobación | Resultado |
|---|---|
| `npx vite build` | **1828 módulos**, exit 0 (~19 s) |
| `npx eslint GrandezaOrderRequestsTab.jsx` | Sin errores |
| `GET /grandeza/clients?active_only=true` | **48** clientes activos con campos `id`, `name`, `phone` |

**Lección de diseño:** una instrucción de UI («hazlo a mano en la tabla de arriba») **debe**
apuntar a una capacidad que exista y sea alcanzable. Si la matriz solo muestra pedidos ya
registrados (D-4), entonces la captura manual **tiene que** vivir en el propio panel de captura,
no en la matriz.

---

> **Fin del documento.** Este documento absorbe y reemplaza a
> `DOCUMENTACION_MODULO_ENTRENAMIENTO_IA.md` (eliminado en v26.1).
