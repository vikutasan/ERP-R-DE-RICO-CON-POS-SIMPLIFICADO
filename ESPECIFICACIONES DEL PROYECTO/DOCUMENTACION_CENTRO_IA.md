# DOCUMENTACIÓN — CENTRO DE IA (MÓDULO PARAGUAS)

> **Versión:** v26.1 — Centro de IA (3 capacidades)
> **Estado:** Implementado, build verificado (`npm run build` exit 0)
> **Última actualización:** 22 Sep 2026
> **Documentos relacionados:**
> - [`DOCUMENTACION_MODULO_ENTRENAMIENTO_IA.md`](DOCUMENTACION_MODULO_ENTRENAMIENTO_IA.md) — Detalle del fine-tuning de YOLO (pestaña Visión)
> - [`CONTEXTO_SISTEMA_IA.md`](CONTEXTO_SISTEMA_IA.md) — Arquitectura del AI Gateway y reglas de resiliencia
> - [`../../docs/SPEC_AI_GATEWAY_TRANSVERSAL.md`](../../docs/SPEC_AI_GATEWAY_TRANSVERSAL.md) — Especificación del Gateway transversal
> - [`../../plans/PLAN_CENTRO_IA_V26.md`](../../plans/PLAN_CENTRO_IA_V26.md) — Plan de implementación aprobado

---

## 0. RESUMEN EJECUTIVO

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

## 1. PROBLEMA QUE RESUELVE

### 1.1 El problema de negocio

Antes de v26.1, la IA estaba **fragmentada y opaca**:

- El módulo se llamaba "Entrenamiento IA" y solo mostraba la pestaña de Visión, aunque el sistema
  ya tenía **voz** (VOZ-POS v2) y **NLU** (Ollama) funcionando en el POS y en Almacenes.
- No había **ningún lugar** donde un administrador pudiera ver si el motor de IA estaba vivo.
- Los parámetros de la voz (`VOZ_CONFIG`) vivían **duplicados** dentro de `useVoiceCart.js`, sin
  forma de inspeccionarlos desde la UI.

### 1.2 El problema técnico

| Problema | Consecuencia |
|---|---|
| Módulo con nombre engañoso | El operador no sabe que ahí también vive la voz |
| Sin panel de estado | Un fallo del motor se descubre cuando el POS falla, no antes |
| Constantes duplicadas | Cambiar un umbral de voz exige tocar el hook del POS |
| Sin diagnóstico de micrófono | El operador no sabe si su hardware funciona |

### 1.3 La restricción de arquitectura (Regla de Oro §1.2)

> **El ERP NUNCA importa `torch`, `whisper` ni `ultralytics`.**

El ERP solo conoce `AI_LOCAL_URL` y habla HTTP. Esta regla es **inviolable** y condiciona todo el
diseño del Centro de IA: **no se añadió ni un solo endpoint nuevo**.

---

## 2. ARQUITECTURA GENERAL

### 2.1 Diagrama de capas

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

### 2.2 Principio de "estado preservado" (fix del defecto D3)

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

## 3. ESTRUCTURA DE ARCHIVOS

### 3.1 Archivos nuevos (v26.1)

| Archivo | Responsabilidad |
|---|---|
| [`apps/ai/AICenterUI.jsx`](../../apps/ai/AICenterUI.jsx) | Shell con las 3 pestañas y el montaje persistente |
| [`apps/ai/components/AIEngineStatusPanel.jsx`](../../apps/ai/components/AIEngineStatusPanel.jsx) | Pestaña "Estado del Motor" |
| [`apps/ai/components/AIVoicePanel.jsx`](../../apps/ai/components/AIVoicePanel.jsx) | Pestaña "Voz" (diagnóstico de micrófono) |
| [`apps/ai/services/AICenterService.js`](../../apps/ai/services/AICenterService.js) | Cliente HTTP centralizado del Centro de IA |
| [`apps/ai/utils/aiCenterConstants.js`](../../apps/ai/utils/aiCenterConstants.js) | Constantes de negocio centralizadas (incluye `VOZ_CONFIG`) |

### 3.2 Archivos modificados

| Archivo | Cambio |
|---|---|
| [`apps/ExperimentCenterUI.jsx`](../../apps/ExperimentCenterUI.jsx) | Import de `AICenterUI`; nombre "Centro de IA" + icono 🧠; montaje |
| [`apps/auth/PerfilesAccessSuite.jsx`](../../apps/auth/PerfilesAccessSuite.jsx) | Nombre "Centro de IA" + icono 🧠 en la matriz de permisos |
| [`apps/pos/VisionTrainingUI.jsx`](../../apps/pos/VisionTrainingUI.jsx) | Nueva prop `activo` + guarda en el `useEffect` de carga del dataset |
| [`apps/pos/hooks/useVoiceCart.js`](../../apps/pos/hooks/useVoiceCart.js) | Elimina `VOZ_CONFIG` local; lo importa de `aiCenterConstants.js` |

### 3.3 Ubicación transversal

El Centro de IA vive en `apps/ai/`, **no** en `apps/pos/`. Es un módulo **transversal**: la voz
la usan el POS y Almacenes; la visión la usan el POS y Almacenes; el estado del motor interesa a
todos. Ponerlo bajo `pos/` habría sido una decisión injustificada (defecto D5 de la autocrítica).

---

## 4. LAS TRES PESTAÑAS

### 4.1 📊 Estado del Motor

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

### 4.2 👁️ Visión

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

El detalle completo del fine-tuning está en
[`DOCUMENTACION_MODULO_ENTRENAMIENTO_IA.md`](DOCUMENTACION_MODULO_ENTRENAMIENTO_IA.md).

### 4.3 🎙️ Voz

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

## 5. CONSTANTES CENTRALIZADAS

### 5.1 `VOZ_CONFIG` — fuente única de verdad

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

### 5.2 Lista blanca de intenciones

```js
export const INTENCIONES_POR_MODULO = {
    POS: ['agregar_item'],
    ALMACEN: ['entrada_insumo'],
};
```

El panel de Voz la muestra para que el administrador vea **qué puede dictar** cada módulo. La
regla de negocio es: **la IA PROPONE, el humano CONFIRMA**.

---

## 6. SERVICIO HTTP CENTRALIZADO

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

## 7. ENDPOINTS UTILIZADOS (0 NUEVOS)

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

## 8. PERMISOS

El módulo conserva su `id` histórico `vision_train` para **no romper** la matriz de permisos ya
persistida en base de datos. Solo cambian el nombre visible y el icono:

| Antes | Después |
|---|---|
| `Entrenamiento IA` 👁️ | `Centro de IA` 🧠 |

**Acceso:** `['ADMIN', 'MANAGER']` (sin cambios).

---

## 9. CRITERIOS DE ACEPTACIÓN

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
| 9 | Cero endpoints nuevos | §7 |
| 10 | `npm run build` pasa sin errores | Exit code 0 (1827 módulos) |

---

## 10. FUERA DE ALCANCE (NO se hizo)

- ❌ Crear un módulo separado "IA por Voz".
- ❌ Añadir endpoints nuevos al gateway.
- ❌ Tocar el POS, la base de datos o el motor `ia-local`.
- ❌ Modificar la política de errores del gateway.
- ❌ Editar parámetros de voz desde la UI (solo se **muestran**; editarlos sería otra fase).

---

## 11. HISTORIAL DE VERSIONES

| Versión | Fecha | Cambio |
|---|---|---|
| v26 | 22 Sep 2026 | Plan inicial: 4 pestañas, 1 endpoint nuevo |
| **v26.1** | 22 Sep 2026 | **3 pestañas, 0 endpoints nuevos, prop `activo`, ubicación `apps/ai/`** |

La corrección V26 → V26.1 nació de una **autocrítica** solicitada explícitamente, que detectó 3
defectos graves (endpoint que violaba la política del gateway, código Python no compilable,
pérdida de estado al cambiar de pestaña) y 5 menores. Ver
[`../../plans/AUTOCRITICA_PLAN_CENTRO_IA_V26.md`](../../plans/AUTOCRITICA_PLAN_CENTRO_IA_V26.md).

---

## 12. RESUMEN EJECUTIVO FINAL

El **Centro de IA** unifica las tres capacidades de IA del ERP en un solo módulo con pestañas,
**sin crear un módulo nuevo**, **sin añadir endpoints** y **sin tocar el gateway, el POS ni la
base de datos**. Reutiliza `VisionTrainingUI` íntegro, centraliza `VOZ_CONFIG` como fuente única
de verdad y añade un panel de diagnóstico de estado y de voz. El estado de trabajo del operador
sobrevive al cambio de pestaña gracias al montaje persistente con ocultamiento por CSS.
