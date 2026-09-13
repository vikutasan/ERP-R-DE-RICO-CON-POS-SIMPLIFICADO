# 📺 PLAN v16 — DISPLAY TÓTEM SUGESTIVO (Heladería)

**Fecha:** 13/Septiembre/2026
**Autor:** Auditoría técnica derivada de [`DOCUMENTACION_MODULO_HELADERIA.md`](../ESPECIFICACIONES%20DEL%20PROYECTO/DOCUMENTACION_MODULO_HELADERIA.md)
**Estado:** ⏳ PROPUESTO — pendiente de ejecución
**Alcance:** Convertir el placeholder [`DisplayTotemUI.jsx`](../apps/heladeria/sections/DisplayTotemUI.jsx:7) en un tótem de antojo visual macro con gestor de contenido 4K/8K, control fino de reproducción, torre dinámica y selector estético.
**Predecesor:** [`PLAN_HELADERIA_V17_DISPLAY_PRECIOS.md`](PLAN_HELADERIA_V17_DISPLAY_PRECIOS.md)
**Sucesor:** [`PLAN_HELADERIA_V14_TIENDA_INTERACTIVA.md`](PLAN_HELADERIA_V14_TIENDA_INTERACTIVA.md)

---

## 🚨 PROTOCOLO DE NO-INTERFERENCIA AL POS (OBLIGATORIO)

> **Este plan NO puede romper el POS de Panadería. Punto.**

### Reglas de ejecución

1. **PROHIBIDO tocar** [`apps/pos/RetailVisionPOS.jsx`](../apps/pos/RetailVisionPOS.jsx), [`apps/pos/hooks/useTerminalLocking.js`](../apps/pos/hooks/useTerminalLocking.js), [`apps/pos/hooks/useBeforeUnload.js`](../apps/pos/hooks/useBeforeUnload.js) y [`apps/pos/services/POSService.js`](../apps/pos/services/POSService.js).
2. **PROHIBIDO modificar** [`apps/pos/config.js`](../apps/pos/config.js) — solo se **lee**.
3. **PROHIBIDO** construir URLs con `window.location.hostname`. Siempre `CONFIG.API_BASE_URL`.
4. **PROHIBIDO** animaciones CSS infinitas en indicadores estáticos (Incidente 16.1).
5. **Cada fase es un commit independiente** y debe pasar la verificación completa antes de continuar.
6. **Si una fase falla la verificación, se revierte inmediatamente** (`git revert`).
7. **Ninguna fase se ejecuta en horario de operación del POS.**

### Verificación obligatoria por fase

```bash
# 1. Tests backend (deben seguir en 39/39 o más)
docker exec rderico-api-dev python -m pytest -q

# 2. Tests frontend (deben seguir en 141/141 o más)
npx vitest run

# 3. Build de producción
npm run build

# 4. POS Panadería (manual): abrir http://localhost:5000, agregar producto, sin banner falso
# 5. Hub Heladería (manual): entrar al Tótem, verificar que las demás secciones siguen accesibles
```

---

## 🎯 OBJETIVO

Convertir el placeholder de 100 líneas en un tótem de antojo visual con:

1. **Gestor de Contenido Macro (4K/8K):** panel administrativo para subir y administrar macrofotografías de texturas de helados y tomas de helados completos.
2. **Control Fino de Reproducción:** cuántas tomas macro antes de pasar a un helado completo (y viceversa), duración exacta en segundos de cada diapositiva, y efecto de transición (desvanecimiento, deslizamiento, zoom suave).
3. **Torre Dinámica de Helados:** animación opcional basada en los sabores activos e inventario en tiempo real del ERP.
4. **Selector de Formato y Estética:** color picker por imagen, tipografías curadas, selector de formato de hardware (vertical para tótem).

---

## 📍 EVIDENCIA DEL PROBLEMA

[`DisplayTotemUI.jsx`](../apps/heladeria/sections/DisplayTotemUI.jsx:7) es un placeholder:

```jsx
export const DisplayTotemUI = ({ onBack }) => {
    return (
        <div style={{ /* ... */ }}>
            {/* ... */}
            <div style={{ fontSize: '80px', animation: 'float 3s ease-in-out infinite' }}>📺</div>
            <h2>Tótem Sugestivo</h2>
            <p>Pantalla vertical tipo tótem con contenido visual sugestivo...</p>
            <div>Próximamente</div>
        </div>
    );
};
```

**Lo que ya existe y se puede reutilizar:**
- Endpoint backend `GET /api/v1/heladeria/display/flavors` (ya operativo) — para la torre dinámica.
- Método [`heladeriaService.getDisplayFlavors()`](../apps/heladeria/services/heladeriaService.js:76) (ya operativo).
- [`heladeriaOfflineStore.js`](../apps/heladeria/services/heladeriaOfflineStore.js:1) — IndexedDB para cache offline-first.

---

## ⚠️ LOS 3 PROBLEMAS CRÍTICOS QUE ESTE PLAN RESUELVE

> Estos 3 puntos son la razón por la que el Tótem **no** se puede implementar "a lo directo".

### Problema 1 — El Tótem NO debe depender del ERP en tiempo real para las imágenes

Si el tótem hace polling al API y el API se cae, **el tótem se queda en negro frente al cliente**. Esto viola el principio de aislamiento del módulo.

**Solución:** el tótem es **offline-first**. Cachea el manifiesto de contenido (lista de imágenes + config de reproducción) en IndexedDB y solo *refresca* disponibilidad cuando hay red. **Nunca bloquea el render esperando al API.**

### Problema 2 — Imágenes 4K/8K en el repo = bomba de tiempo

Un JPEG 8K pesa 15-40 MB. Subirlos al servidor actual (Docker local, sin CDN) satura disco y ancho de banda.

**Solución:** definir desde el inicio:
- (a) Límite de peso por archivo (ej. 8 MB máximo).
- (b) Conversión a WebP en el upload.
- (c) Almacenamiento en volumen Docker dedicado (`totem_media`), **fuera** del repo Git.
- (d) Lazy-loading por diapositiva (solo se carga la imagen actual y la siguiente).

### Problema 3 — La "Torre Dinámica" es una mejora, no un requisito del MVP

La torre dinámica (animación basada en sabores activos) es visualmente atractiva pero añade complejidad y dependencia del API. **Solución:** implementarla como **fase separada y opcional** (Fase 16.5), después de que el núcleo del tótem (gestor + reproducción) funcione y sea estable.

---

## 🔧 CAMBIOS PROPUESTOS

### Fase 16.1 — Extraer la lógica de reproducción a funciones puras + tests

**Objetivo:** replicar el patrón "guardián del contrato" para que la lógica de secuenciación de diapositivas sea testeable sin React ni timers.

**1. Crear `apps/heladeria/utils/totemSequencer.js`** (nuevo, puro, sin React):

```js
/**
 * Módulo: totemSequencer.js
 * Funciones puras de secuenciación para el Display Tótem.
 * REGLA: NO importa React. Solo lógica determinista y testeable.
 */

export const TRANSITION = {
    FADE: 'fade',
    SLIDE: 'slide',
    ZOOM: 'zoom',
};

export const DEFAULT_TOTEM_CONFIG = {
    macroCount: 3,          // cuántas tomas macro antes de un helado completo
    macroDurationSec: 4,    // duración de cada macro
    heroDurationSec: 6,     // duración del helado completo
    transition: TRANSITION.FADE,
    transitionMs: 800,
    format: 'vertical',
    accentColor: '#fbbf24',
};

/**
 * Construye la secuencia de reproducción intercalando macros y heroes.
 * Regla: N macros → 1 hero → N macros → 1 hero ...
 * @param {Array} macros - imágenes macro de textura
 * @param {Array} heroes - imágenes de helados completos
 * @param {number} macroCount - cuántas macros por cada hero
 * @returns {Array<{ image, kind: 'macro'|'hero', durationSec }>}
 */
export const buildSequence = (macros, heroes, macroCount) => { /* ... */ };

/**
 * Calcula la duración total de una secuencia en segundos.
 * @param {Array} sequence
 * @returns {number}
 */
export const totalDurationSec = (sequence) => { /* ... */ };

/**
 * Valida y normaliza una configuración de tótem (defensa contra configs corruptas).
 * @param {object} config
 * @returns {object} config normalizada con defaults aplicados
 */
export const normalizeTotemConfig = (config) => { /* ... */ };

/**
 * Valida un archivo de imagen antes de aceptarlo (peso, tipo).
 * @param {{ size: number, type: string }} file
 * @param {number} maxBytes
 * @returns {{ ok: boolean, reason?: string }}
 */
export const validateImageFile = (file, maxBytes = 8 * 1024 * 1024) => { /* ... */ };
```

**2. Crear `apps/heladeria/utils/totemSequencer.test.js`** (nuevo, ~15 tests):

Casos a cubrir:
- `buildSequence`: 3 macros + 1 hero → `[m,m,m,h]`; 6 macros + 2 heroes → `[m,m,m,h,m,m,m,h]`; sin heroes → solo macros; sin macros → solo heroes; listas vacías → `[]`.
- `totalDurationSec`: suma correcta de duraciones; secuencia vacía → 0.
- `normalizeTotemConfig`: config vacía → defaults; config parcial → mezcla; transición inválida → default; `macroCount` negativo → default.
- `validateImageFile`: archivo válido → `{ ok: true }`; archivo > límite → `{ ok: false, reason }`; tipo no permitido → `{ ok: false, reason }`.

### Fase 16.2 — Backend: endpoints de gestión de contenido del tótem

**Objetivo:** persistir el manifiesto de contenido y servir las imágenes.

**1. Agregar endpoints en `apps/api/modules/heladeria/router.py`:**

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/totem/content` | Devuelve el manifiesto (lista de imágenes + config) |
| `PUT` | `/totem/content` | Guarda el manifiesto |
| `POST` | `/totem/upload` | Sube una imagen (valida peso/tipo, convierte a WebP) |
| `DELETE` | `/totem/content/{image_id}` | Elimina una imagen del manifiesto |

**2. Almacenamiento:**

- Las imágenes se guardan en un **volumen Docker dedicado** (`totem_media`), mapeado a `/app/media/totem` dentro del contenedor.
- **PROHIBIDO** guardar las imágenes en el repo Git (`.gitignore` debe excluir `media/totem/`).
- El manifiesto (JSON) se guarda en `system_settings` con la clave `heladeria_totem_content`.

**3. Validación en el upload:**

- Peso máximo: 8 MB.
- Tipos permitidos: `image/jpeg`, `image/png`, `image/webp`.
- Conversión a WebP con Pillow (ya disponible en el entorno Python del API).

**4. Tests backend** (`apps/api/tests/test_heladeria_totem.py`, nuevo, ~6 tests):
- `GET /totem/content` sin manifiesto → devuelve defaults.
- `PUT /totem/content` guarda y `GET` recupera.
- `POST /totem/upload` con archivo válido → 200 + URL.
- `POST /totem/upload` con archivo > 8 MB → 413.
- `POST /totem/upload` con tipo no permitido → 415.
- `DELETE /totem/content/{id}` elimina del manifiesto.

### Fase 16.3 — Frontend: Gestor de Contenido Macro

**Objetivo:** panel administrativo para subir y administrar las imágenes.

**1. Crear `apps/heladeria/components/TotemContentManager.jsx`** (nuevo):

- Zona de **drag & drop** para subir imágenes (macro y hero).
- Vista previa en miniatura de cada imagen.
- Clasificación: cada imagen se etiqueta como `macro` (textura) o `hero` (helado completo).
- Botón de eliminar por imagen.
- **Color picker por imagen** (color de acento individual).
- Indicador de peso de cada imagen (para que el admin vea el impacto).

**2. Control Fino de Reproducción** (mismo componente o sub-panel):

- Slider: **cuántas tomas macro** antes de un hero (1-10).
- Slider: **duración de cada macro** en segundos (1-15).
- Slider: **duración del hero** en segundos (1-15).
- Selector de **transición**: desvanecimiento / deslizamiento / zoom suave.
- Slider: **duración de la transición** en ms (200-2000).

**3. Selector de Formato y Estética:**

- Selector de **formato de hardware**: vertical (tótem) / horizontal.
- Selector de **tipografía** curada.
- Color picker global de acento.

**4. Persistencia:** guardar el manifiesto vía `PUT /totem/content`.

### Fase 16.4 — Frontend: Output del Tótem (offline-first)

**Objetivo:** la pantalla que ve el cliente, sin controles, que nunca se queda en negro.

**1. Crear `apps/heladeria/components/TotemPlayer.jsx`** (nuevo):

- Reproduce la secuencia construida por `buildSequence()`.
- Aplica las transiciones configuradas.
- **Offline-first:** carga el manifiesto desde IndexedDB primero; si hay red, refresca en segundo plano.
- **Lazy-loading:** solo carga la imagen actual y la siguiente (nunca todas a la vez).
- **Nunca bloquea el render:** si el fetch falla, reproduce el manifiesto cacheado.
- **Sin animaciones CSS infinitas** en indicadores de estado (Incidente 16.1).

**2. Refactorizar [`DisplayTotemUI.jsx`](../apps/heladeria/sections/DisplayTotemUI.jsx:7)** para orquestar las dos landings:

```jsx
export const DisplayTotemUI = ({ onBack }) => {
    const [view, setView] = useState('player'); // 'player' | 'manager'
    // ...
    return view === 'player'
        ? <TotemPlayer onBack={onBack} onOpenManager={() => setView('manager')} />
        : <TotemContentManager onBack={() => setView('player')} />;
};
```

### Fase 16.5 — (OPCIONAL) Torre Dinámica de Helados

**Objetivo:** animación basada en los sabores activos e inventario en tiempo real.

> **Esta fase es opcional y se ejecuta solo si las fases 16.1-16.4 están estables.**

- Consume `GET /heladeria/display/flavors` (ya existe).
- Construye una "torre" visual apilando los sabores activos.
- **Offline-first:** si el API falla, usa el último estado cacheado o se oculta (nunca rompe el tótem).
- Toggle en el gestor para activar/desactivar.

### Fase 16.6 — Verificación y documentación

- Actualizar [`DOCUMENTACION_MODULO_HELADERIA.md`](../ESPECIFICACIONES%20DEL%20PROYECTO/DOCUMENTACION_MODULO_HELADERIA.md) sección 13: marcar "Display Tótem" como ✅ resuelto.
- Documentar la estrategia de storage (volumen Docker, límites, WebP).
- Agregar los nuevos archivos a "Archivos gobernados".

---

## ✅ VERIFICACIÓN DE CADA FASE

### Fase 16.1
- [ ] `npx vitest run` → 141 + ~15 = **~156 tests OK**.
- [ ] `npm run build` → transforma sin errores.
- [ ] `docker exec rderico-api-dev python -m pytest -q` → **39/39**.

### Fase 16.2
- [ ] `docker exec rderico-api-dev python -m pytest -q` → 39 + ~6 = **~45 tests OK**.
- [ ] `curl -X POST .../totem/upload` con archivo válido → 200.
- [ ] `curl -X POST .../totem/upload` con archivo > 8 MB → 413.
- [ ] El volumen `totem_media` persiste las imágenes tras reiniciar el contenedor.

### Fase 16.3
- [ ] `npm run build` → transforma sin errores.
- [ ] El gestor sube imágenes y las clasifica como macro/hero.
- [ ] La config de reproducción se guarda y recupera.

### Fase 16.4
- [ ] `npm run build` → transforma sin errores.
- [ ] El tótem reproduce la secuencia con las transiciones configuradas.
- [ ] **Prueba offline:** apagar el API → el tótem sigue reproduciendo el contenido cacheado.
- [ ] **Prueba de lazy-loading:** verificar en DevTools que solo se cargan 2 imágenes a la vez.

### Fase 16.5 (opcional)
- [ ] La torre dinámica refleja los sabores activos.
- [ ] Si el API falla, la torre se oculta sin romper el tótem.

### Fase 16.6
- [ ] Documentación actualizada.
- [ ] `git diff --name-only` no incluye archivos del POS de Panadería.
- [ ] `git diff --name-only` no incluye imágenes en `media/totem/`.

---

## ⚠️ RIESGO POS: 🟢 NULO

Solo se toca `apps/heladeria/` y `apps/api/modules/heladeria/`. El POS de Panadería no importa nada de ahí. Los endpoints `/totem/*` son nuevos y no afectan tickets ni caja.

---

## 📊 ORDEN DE EJECUCIÓN Y COMMITS

| Fase | Commit esperado | Archivos |
|---|---|---|
| 16.1 | `test(heladeria): extraer secuenciador puro del tótem + tests` | `totemSequencer.js` (nuevo), `totemSequencer.test.js` (nuevo) |
| 16.2 | `feat(heladeria): endpoints de gestión de contenido del tótem` | `router.py`, `service.py`, `schemas.py`, `test_heladeria_totem.py` (nuevo), `docker-compose.yml` (volumen) |
| 16.3 | `feat(heladeria): gestor de contenido macro del tótem` | `TotemContentManager.jsx` (nuevo) |
| 16.4 | `feat(heladeria): output del tótem offline-first` | `TotemPlayer.jsx` (nuevo), `DisplayTotemUI.jsx` |
| 16.5 | `feat(heladeria): torre dinámica de sabores (opcional)` | `TotemDynamicTower.jsx` (nuevo) |
| 16.6 | `docs(heladeria): tótem sugestivo completado` | `DOCUMENTACION_MODULO_HELADERIA.md` |

**Cada commit se pushea individualmente** a `origin/main` tras verificar.

---

## 🎯 CRITERIOS DE ACEPTACIÓN

Al terminar las fases 16.1-16.4 (núcleo) y 16.6:

- [ ] `DisplayTotemUI.jsx` ya no dice "Próximamente".
- [ ] Gestor de contenido funcional (subir, clasificar, eliminar, color picker).
- [ ] Control fino de reproducción funcional (macros, duraciones, transiciones).
- [ ] Output offline-first: el tótem sobrevive a la caída del API.
- [ ] Lazy-loading verificado (solo 2 imágenes en memoria).
- [ ] Imágenes en volumen Docker, **fuera** del repo Git.
- [ ] vitest: 141 → ~156 tests, todos OK.
- [ ] pytest: 39 → ~45 tests, todos OK.
- [ ] build: sin errores.
- [ ] **El POS de Panadería funciona idéntico.**
- [ ] Documentación actualizada.

---

## 🔄 PROTOCOLO DE REVERSIÓN

```bash
git revert HEAD --no-edit
git push origin main
# Verificar POS Panadería en http://localhost:5000
```

**Regla:** ante la duda, revertir. El POS nunca se queda roto.

---

## 📝 NOTAS DE DISEÑO

1. **¿Por qué el tótem es offline-first?**
   Porque un tótem que depende del API en vivo se queda **en negro frente al cliente** si el API se cae. El cache en IndexedDB garantiza que siempre haya contenido que mostrar.

2. **¿Por qué las imágenes van a un volumen Docker y no al repo?**
   Porque un JPEG 8K pesa 15-40 MB. Meterlos al repo Git infla el historial, ralentiza los clones y satura el disco. El volumen dedicado los aísla y permite respaldarlos por separado.

3. **¿Por qué la torre dinámica es opcional?**
   Porque es visualmente atractiva pero añade dependencia del API y complejidad. El núcleo del tótem (gestor + reproducción) debe funcionar y ser estable primero. La torre es una mejora incremental.

4. **¿Por qué lazy-loading?**
   Porque cargar 20 imágenes 4K a la vez consume cientos de MB de RAM y satura el ancho de banda. Cargar solo la actual y la siguiente mantiene el consumo bajo y la reproducción fluida.

5. **¿Por qué la conversión a WebP?**
   Porque WebP pesa ~30% menos que JPEG con calidad equivalente. Reduce el ancho de banda y el tiempo de carga sin pérdida visual perceptible.

---

## ✅ CHECKLIST DE APROBACIÓN

- [ ] El plan respeta el protocolo de no-interferencia al POS.
- [ ] Cada fase es reversible de forma independiente.
- [ ] La verificación es objetiva (tests + build + manual).
- [ ] El orden de ejecución minimiza el riesgo.
- [ ] La estrategia de storage está definida antes de codificar.

**Una vez aprobado:** ejecutar Fase 16.1 → verificar → commit → push → Fase 16.2 → ...
