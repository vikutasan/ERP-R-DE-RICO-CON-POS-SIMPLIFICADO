# 📺 PLAN v16 — DISPLAY TÓTEM SUGESTIVO (Heladería) — REVISIÓN 2

**Fecha:** 14/Septiembre/2026
**Autor:** Auditoría técnica derivada de [`DOCUMENTACION_MODULO_HELADERIA.md`](../ESPECIFICACIONES%20DEL%20PROYECTO/DOCUMENTACION_MODULO_HELADERIA.md)
**Estado:** ⏳ PROPUESTO — pendiente de aprobación y ejecución
**Alcance:** Convertir el placeholder [`DisplayTotemUI.jsx`](../apps/heladeria/sections/DisplayTotemUI.jsx:7) en un tótem de antojo visual macro con gestor de contenido, control fino de reproducción y selector estético.
**Predecesor:** [`PLAN_HELADERIA_V14_TIENDA_INTERACTIVA.md`](PLAN_HELADERIA_V14_TIENDA_INTERACTIVA.md)
**Sucesor:** [`PLAN_HELADERIA_V15_KDS_INTELIGENTE.md`](PLAN_HELADERIA_V15_KDS_INTELIGENTE.md)

> **Orden de ejecución corregido:** FASE 0 → V17 → V14 → **V16** → V15 (ver tabla de baselines del [`PLAN_HELADERIA_MAESTRO.md`](PLAN_HELADERIA_MAESTRO.md)).

---

## 📋 REGISTRO DE LA REVISIÓN 2

La Revisión 1 de este plan contenía **15 defectos** detectados en auditoría autocrítica contra el código real. Esta Revisión 2 los corrige todos. Tabla de trazabilidad:

| # | Defecto Rev.1 | Severidad | Corrección en Rev.2 |
|---|---|---|---|
| D1 | Pillow NO instalado; conversión WebP imposible; falta rebuild Docker | 🔴 Bloqueante | **Eliminada la conversión WebP del MVP.** Se aceptan JPEG/PNG/WebP tal cual, con límite de peso. Cero dependencias nuevas de Python. Ver §Decisión 1 |
| D2 | Volumen `totem_media` inexistente y sin especificar | 🔴 Bloqueante | Bind mount explícito `../ERP-R-DE-RICO-DATA/totem_media:/app/media/totem` (respeta la convención de bind mounts externos). Ver Fase 16.2 |
| D3 | `/media` no montado en `StaticFiles`; URLs darían 404 | 🔴 Bloqueante | Se añade `app.mount("/media/totem", ...)` en `main.py`. `main.py` ahora figura en la tabla de archivos. Ver Fase 16.2 |
| D4 | `PUT` no existe; falta siembra → primer guardado daría 404 | 🔴 Bloqueante | Se usa el patrón `/settings/` (**PATCH**) y se añade **Fase 16.0** de siembra de `heladeria_totem_content`. Ver Fase 16.0 |
| D5 | Endpoints `/totem/content` duplican `/settings/` | 🔴 Bloqueante | El manifiesto se lee/escribe vía `/settings/`. Solo se crea endpoint nuevo para el **upload binario** (que sí lo requiere). Ver Fase 16.2 |
| D6 | Baselines obsoletos (141/141) | 🟠 Grave | Actualizados a **vitest 232**, pytest 39, build 1428. Ver §Baselines |
| D7 | Validación de archivos duplicada cliente/servidor | 🟠 Grave | Backend es el **guardián autoritativo**; frontend solo da UX temprana. Constante documentada en un único lugar. Ver §Decisión 3 |
| D8 | "Inventario en tiempo real" no existe en el API | 🟠 Grave | **Eliminado del alcance.** La torre usa solo disponibilidad booleana. Ver §Decisión 4 |
| D9 | Lazy-loading declarado sin diseño | 🟠 Grave | Diseño explícito con `new Image()` precargando solo la siguiente. Ver Fase 16.4 |
| D10 | Sin limpieza de huérfanos en el volumen | 🟠 Grave | `DELETE` borra manifiesto **y** archivo físico; + saneo anti path-traversal. Ver Fase 16.2 |
| D11 | No elimina `@keyframes float` explícitamente | 🟡 Menor | Tarea explícita en Fase 16.4 |
| D12 | `format` sin validar en `normalizeTotemConfig` | 🟡 Menor | Enum `FORMAT` validado. Ver Fase 16.1 |
| D13 | Falta Fase 16.0 (siembra) | 🟡 Menor | Fase 16.0 añadida |
| D14 | Reversión no cubre infraestructura | 🟡 Menor | Protocolo de reversión ampliado (volumen + compose + recrear). Ver §Reversión |
| D15 | Regla de horario no auditable | 🟡 Menor | Reemplazada por criterio verificable: "POS sin tickets abiertos". Ver §Protocolo |

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
7. **Ventana de ejecución verificable:** antes de cada fase que toque el backend (16.0, 16.2), confirmar que **no hay tickets abiertos** en el POS de Panadería:

```powershell
(Invoke-WebRequest -Uri "http://localhost:5001/api/v1/pos/tickets?status=OPEN" -UseBasicParsing).Content
```

Si devuelve una lista **no vacía**, **detener** y esperar. Esto reemplaza la regla vaga "no en horario de operación" por un criterio objetivo y auditable.

### ⚠️ Regla especial: cambios en `main.py` y `docker-compose.yml`

Las Fases 16.0 y 16.2 tocan infraestructura compartida con el POS de Panadería:

- **`main.py`** es el punto de entrada de **todo** el API. Un error de sintaxis aquí **tumba el POS de Panadería**.
- **`docker-compose.yml`** define el contenedor del API que el POS consume.

**Mitigación obligatoria:**

1. Los cambios en `main.py` son **estrictamente aditivos** (una línea `app.mount(...)` al final del bloque de mounts). No se reordena ni se toca nada existente.
2. **NUNCA** se ejecuta `docker compose down` (tumbaría el POS). Solo `docker compose up -d api` o `docker restart rderico-api-dev`.
3. Tras cualquier cambio en `main.py`, verificar **inmediatamente** que el POS sigue vivo:

```powershell
(Invoke-WebRequest -Uri "http://localhost:5001/api/v1/settings/" -UseBasicParsing).StatusCode   # debe ser 200
```

4. Si el API no responde en 15 s tras el reinicio, **revertir de inmediato**.

### Verificación obligatoria por fase

```bash
# 1. Tests backend (deben seguir en 39/39 o más)
docker exec rderico-api-dev python -m pytest -q

# 2. Tests frontend (deben seguir en 232/232 o más)
npx vitest run

# 3. Build de producción
npx vite build

# 4. POS Panadería (manual): abrir http://localhost:5000, agregar producto, sin banner falso
# 5. Hub Heladería (manual): entrar al Tótem, verificar que las demás secciones siguen accesibles
```

---

## 📊 BASELINES REALES (verificados el 14/Sept/2026)

> **Corrección D6:** la Revisión 1 citaba "141/141" repetidamente. Ese baseline es de antes de V17. Los valores reales son:

| Métrica | Baseline real | Comando |
|---|---|---|
| vitest | **232/232** (6 archivos) | `npx vitest run` |
| pytest | **39/39** | `docker exec rderico-api-dev python -m pytest -q` |
| build | **1428 módulos** | `npx vite build` |

**Ninguna fase de este plan puede reducir estos números.** Cualquier regresión = revert inmediato.

---

## 🧭 RESTRICCIONES ARQUITECTÓNICAS DEL PROYECTO (aplican a este plan)

### Restricción A — El POS intocable es "Punto de Venta IA"

El único módulo POS que **NO se puede tocar** es **"Punto de Venta IA"** (Panadería, [`apps/pos/RetailVisionPOS.jsx`](../apps/pos/RetailVisionPOS.jsx:29)).

| Módulo | ¿Modificable? |
|---|---|
| Punto de Venta IA (Panadería) | ❌ **PROHIBIDO** |
| POS Heladería ([`PosHeladeriaUI.jsx`](../apps/heladeria/sections/PosHeladeriaUI.jsx:15)) | ✅ Permitido |
| Tienda Interactiva | ✅ Permitido |
| Displays (Precios / Tótem) | ✅ Permitido |
| KDS (Helados / Malteadas) | ✅ Permitido |

> El Tótem es un **display de solo lectura**: no cobra, no reserva folios, no bloquea terminales. Su riesgo sobre el POS es nulo por diseño.

### Restricción B — Gestión de Productos es el maestro único

**Gestión de Productos** ([`apps/api/modules/catalog/`](../apps/api/modules/catalog/models.py:1)) es la **única fuente de verdad** de productos y categorías.

**Este plan (V16) SOLO LEE el catálogo y ESCRIBE su propia configuración visual.**

| Acción | ¿Permitido? |
|---|---|
| Leer sabores activos (`GET /heladeria/display/flavors`) | ✅ |
| Leer menú (`GET /heladeria/display/menu`) | ✅ |
| Guardar configuración visual del tótem en `system_settings` | ✅ |
| Subir imágenes al bind mount `totem_media` | ✅ |
| Crear/editar sabores o productos | ❌ |
| Cambiar precios | ❌ |
| Decidir en qué POS aparece un producto | ❌ (se define en Gestión de Productos) |
| Escribir en `products` / `categories` | ❌ |

> **Nota:** el mecanismo "en qué POS aparece cada producto/categoría" se definirá **desde Gestión de Productos** y aún no existe. Es una **dependencia futura NO bloqueante** para V16 (el tótem muestra lo que el catálogo ya marca como activo).

---

## 🎯 OBJETIVO

Convertir el placeholder de 100 líneas en un tótem de antojo visual con:

1. **Gestor de Contenido Macro:** panel administrativo para subir y administrar macrofotografías de texturas de helados y tomas de helados completos.
2. **Control Fino de Reproducción:** cuántas tomas macro antes de pasar a un helado completo (y viceversa), duración exacta en segundos de cada diapositiva, y efecto de transición (desvanecimiento, deslizamiento, zoom suave).
3. **Selector de Formato y Estética:** color picker por imagen, tipografías curadas, selector de formato de hardware (vertical para tótem).
4. **(Fase opcional 16.5) Torre de Sabores:** animación basada en los **sabores activos** (disponibilidad booleana). **NO usa inventario** — ver §Decisión 4.

---

## 📍 EVIDENCIA DEL PROBLEMA

[`DisplayTotemUI.jsx`](../apps/heladeria/sections/DisplayTotemUI.jsx:7) es un placeholder de 100 líneas que incluye una **animación infinita prohibida** (Incident 16.1) en la línea 61:

```jsx
<div style={{ fontSize: '80px', animation: 'float 3s ease-in-out infinite' }}>📺</div>
// ...
<style>{`
    @keyframes float {
        0%, 100% { transform: translateY(0px); }
        50% { transform: translateY(-15px); }
    }
`}</style>
```

**Lo que ya existe y se puede reutilizar (verificado):**

- Endpoint backend `GET /api/v1/heladeria/display/flavors` — operativo ([`router.py:91`](../apps/api/modules/heladeria/router.py:91)). Devuelve `DisplayFlavorResponse` = **solo disponibilidad booleana**.
- Método [`heladeriaService.getDisplayFlavors()`](../apps/heladeria/services/heladeriaService.js:76) — operativo, con `withRetries`.
- [`heladeriaOfflineStore.js`](../apps/heladeria/services/heladeriaOfflineStore.js:1) — IndexedDB (`heladeria_offline` v1, store `menu_cache` con `keyPath: 'key'`) para cache offline-first.
- Patrón `/settings/` para persistir configuración ([`settings/router.py:17`](../apps/api/modules/settings/router.py:17) — **PATCH**, no PUT).
- `python-multipart 0.0.32` **ya instalado** → `UploadFile` de FastAPI funciona sin dependencias nuevas.

---

## 🔑 DECISIONES DE DISEÑO (resuelven los defectos bloqueantes)

### Decisión 1 — SIN conversión WebP en el MVP (resuelve D1)

**Contexto verificado:** Pillow **NO está instalado** (`ModuleNotFoundError: No module named 'PIL'`) y no figura en [`requirements.txt`](../apps/api/requirements.txt:1). Agregarlo exigiría `docker compose build api` (rebuild completo), lo que **aumenta el riesgo sobre el POS de Panadería** durante la implementación.

**Decisión:** el MVP **acepta JPEG/PNG/WebP tal cual**, sin conversión. Se mitiga el peso con:

- Límite duro de **8 MB** por archivo (validado en backend).
- Recomendación documentada al admin: exportar a 2560 px de ancho máximo.
- Lazy-loading (solo 2 imágenes en memoria).

**Beneficio:** cero dependencias nuevas, cero rebuild, cero riesgo añadido al POS. La conversión WebP queda como **mejora futura** (Fase 16.7 opcional, fuera del MVP).

### Decisión 2 — El manifiesto vive en `system_settings`, no en un router nuevo (resuelve D4, D5)

**Contexto verificado:** el proyecto ya tiene un mecanismo consolidado: `system_settings` + `/settings/` (GET lista, GET por clave, **PATCH** por clave, POST seed). V17 lo usó correctamente.

**Decisión:** el manifiesto del tótem se guarda en `system_settings` con la clave `heladeria_totem_content`, y se lee/escribe **directamente vía `/settings/`** desde el frontend. **No se crea `GET/PUT /totem/content`.**

Solo se crea **un endpoint nuevo**: `POST /heladeria/totem/upload` — porque el upload binario **sí** requiere `multipart/form-data`, que `/settings/` no soporta.

### Decisión 3 — El backend es el guardián autoritativo de la validación (resuelve D7)

**Contexto:** validar en el cliente es UX; validar en el servidor es seguridad. El cliente es bypasseable.

**Decisión:**

- **Backend** (`service.py`): validación **autoritativa** — rechaza > 8 MB (413) y tipos no permitidos (415). Es la única que importa.
- **Frontend** (`totemSequencer.js`): `validateImageFile` existe **solo para UX temprana** (avisar antes de subir). Su límite se documenta como "espejo del backend" y **no es la fuente de verdad**.
- Ambos usan el **mismo valor literal `8 * 1024 * 1024`**, documentado en un comentario cruzado en ambos archivos para que un cambio se haga en los dos.

### Decisión 4 — La torre usa disponibilidad, NO inventario (resuelve D8)

**Contexto verificado:** [`GET /heladeria/display/flavors`](../apps/api/modules/heladeria/router.py:91) devuelve `DisplayFlavorResponse` — **solo un booleano de disponibilidad**. El inventario en tiempo real requeriría la integración con Almacenes (V6), que **no existe**.

**Decisión:** la Fase 16.5 (opcional) construye la torre con los **sabores activos** (los que `is_available = true`). Se **elimina toda mención a "inventario en tiempo real"**. Si en el futuro se integra Almacenes, la torre podrá enriquecerse — pero eso es otro plan.

### Decisión 5 — Storage en bind mount externo, consistente con el proyecto (resuelve D2)

**Contexto verificado:** [`docker-compose.yml:48`](../docker-compose.yml:48) dice explícitamente: *"Los volúmenes ahora son externos (Bind Mounts) para mayor seguridad y facilidad de backup."* Los 4 mounts actuales del API son bind mounts a `../ERP-R-DE-RICO-DATA/`.

**Decisión:** se usa un **bind mount** (no un named volume) para respetar la convención:

```yaml
- ../ERP-R-DE-RICO-DATA/totem_media:/app/media/totem
```

Esto permite respaldar las imágenes con el mismo procedimiento que el resto de los datos.

---

## 🔧 CAMBIOS PROPUESTOS

### Fase 16.0 — Sembrar la clave `heladeria_totem_content` (NUEVA — resuelve D4, D13)

**Objetivo:** garantizar que el primer `PATCH /settings/heladeria_totem_content` **no devuelva 404**. Este fue exactamente el defecto que V17 corrigió con su Fase 17.0.

**Archivo:** [`apps/api/modules/settings/service.py`](../apps/api/modules/settings/service.py:24)

**Cambio:** añadir una entrada **aditiva** al final de `default_settings` (después de `heladeria_display_precios_config`, línea 112):

```python
# V16 (Fase 16.0): manifiesto de contenido del Display Tótem de Heladería.
# Entrada ADITIVA: el bucle de abajo solo inserta si la clave no existe,
# por lo que no altera ninguna clave que lea el POS de Panadería.
{
    "key": "heladeria_totem_content",
    "value": '{"macros":[],"heroes":[],"config":{"macroCount":3,"macroDurationSec":4,"heroDurationSec":6,"transition":"fade","transitionMs":800,"format":"vertical","accentColor":"#fbbf24"}}',
    "description": "Manifiesto de contenido del Display Tótem de Heladería (V16).",
    "category": "heladeria",
    "input_type": "json"
}
```

**Verificación de la fase:**

```powershell
# 1. Reiniciar API (NO rebuild — solo cambio de Python)
docker restart rderico-api-dev
Start-Sleep -Seconds 15

# 2. Sembrar
Invoke-WebRequest -Uri "http://localhost:5001/api/v1/settings/seed" -Method POST -UseBasicParsing

# 3. Verificar que la clave existe (debe ser 200)
(Invoke-WebRequest -Uri "http://localhost:5001/api/v1/settings/heladeria_totem_content" -UseBasicParsing).StatusCode

# 4. Verificar que el POS sigue vivo
(Invoke-WebRequest -Uri "http://localhost:5001/api/v1/settings/" -UseBasicParsing).StatusCode   # 200

# 5. pytest
docker exec rderico-api-dev python -m pytest -q   # 39/39
```

**Commit:** `feat(settings): sembrar clave heladeria_totem_content (V16 Fase 16.0)`

---

### Fase 16.1 — Extraer la lógica de reproducción a funciones puras + tests

**Objetivo:** replicar el patrón "guardián del contrato" para que la lógica de secuenciación sea testeable sin React ni timers.

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

export const FORMAT = {
    VERTICAL: 'vertical',
    HORIZONTAL: 'horizontal',
};

export const VALID_TRANSITIONS = Object.values(TRANSITION);
export const VALID_FORMATS = Object.values(FORMAT);

export const MIN_MACRO_COUNT = 1;
export const MAX_MACRO_COUNT = 10;
export const MIN_DURATION_SEC = 1;
export const MAX_DURATION_SEC = 15;
export const MIN_TRANSITION_MS = 200;
export const MAX_TRANSITION_MS = 2000;

/**
 * Límite de peso por imagen. ESPEJO del backend (apps/api/modules/heladeria/service.py).
 * Si cambia aquí, DEBE cambiar allá. El backend es el guardián autoritativo.
 */
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export const DEFAULT_TOTEM_CONFIG = {
    macroCount: 3,
    macroDurationSec: 4,
    heroDurationSec: 6,
    transition: TRANSITION.FADE,
    transitionMs: 800,
    format: FORMAT.VERTICAL,
    accentColor: '#fbbf24',
};

/** Construye la secuencia intercalando macros y heroes: N macros → 1 hero → ... */
export const buildSequence = (macros, heroes, macroCount) => { /* ... */ };

/** Duración total de una secuencia en segundos. */
export const totalDurationSec = (sequence) => { /* ... */ };

/** Valida y normaliza una configuración (defensa contra configs corruptas). */
export const normalizeTotemConfig = (config) => { /* ... */ };

/** Valida un archivo de imagen (UX temprana; el backend re-valida). */
export const validateImageFile = (file, maxBytes = MAX_IMAGE_BYTES) => { /* ... */ };
```

**2. Crear `apps/heladeria/utils/totemSequencer.test.js`** (nuevo, ~20 tests):

Casos a cubrir:

- `buildSequence`: 3 macros + 1 hero → `[m,m,m,h]`; 6 macros + 2 heroes → `[m,m,m,h,m,m,m,h]`; sin heroes → solo macros; sin macros → solo heroes; listas vacías → `[]`; `macroCount` mayor que macros disponibles → no rompe.
- `totalDurationSec`: suma correcta; secuencia vacía → 0.
- `normalizeTotemConfig`: config vacía → defaults; config parcial → mezcla; transición inválida → default; **`format` inválido → default (D12)**; `macroCount` negativo → default; `macroCount` > 10 → clamp a 10; `transitionMs` fuera de rango → clamp.
- `validateImageFile`: archivo válido → `{ ok: true }`; > límite → `{ ok: false, reason }`; tipo no permitido → `{ ok: false, reason }`; archivo nulo → `{ ok: false }`.

**Verificación de la fase:**

```bash
npx vitest run      # 232 + ~20 = ~252 OK
npx vite build      # sin errores
docker exec rderico-api-dev python -m pytest -q   # 39/39
```

**Commit:** `test(heladeria): extraer secuenciador puro del tótem + tests (V16 Fase 16.1)`

---

### Fase 16.2 — Backend: upload de imágenes + storage (resuelve D2, D3, D5, D10)

**Objetivo:** permitir subir imágenes y servirlas, sin tocar el mecanismo de configuración existente.

**1. Bind mount en [`docker-compose.yml`](../docker-compose.yml:23)** — añadir **una línea** al bloque `volumes` del servicio `api`:

```yaml
    volumes:
      - ./apps/api:/app
      - ../ERP-R-DE-RICO-DATA/catalogos:/app/static/catalog
      - ../ERP-R-DE-RICO-DATA/images:/app/static/images
      - ../ERP-R-DE-RICO-DATA/config/terminal_status.json:/app/terminal_status.json
      - ../ERP-R-DE-RICO-DATA/totem_media:/app/media/totem      # V16: imágenes del tótem
```

> **Nota:** bind mount externo (no named volume) para respetar la convención del proyecto y permitir backup con el mismo procedimiento.

**2. Montar `StaticFiles` en [`apps/api/main.py`](../apps/api/main.py:321)** — añadir **una línea** al final del bloque de mounts:

```python
app.mount("/static/catalog", StaticFiles(directory="static/catalog"), name="catalog")
app.mount("/static/images", StaticFiles(directory="static/images"), name="images")
app.mount("/media/totem", StaticFiles(directory="media/totem"), name="totem")   # V16
```

> **⚠️ Cambio aditivo en el punto de entrada del API.** Ver §Regla especial. Tras aplicarlo, verificar que `/api/v1/settings/` sigue devolviendo 200.

**3. Endpoints en [`apps/api/modules/heladeria/router.py`](../apps/api/modules/heladeria/router.py:106):**

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/heladeria/totem/upload` | Sube una imagen (valida peso/tipo). Devuelve `{ url, filename, size }` |
| `DELETE` | `/heladeria/totem/upload/{filename}` | Elimina el archivo físico (resuelve D10) |

**NO se crean `GET/PUT /totem/content`** — el manifiesto se maneja vía `/settings/heladeria_totem_content` (Decisión 2).

**4. Servicio en [`apps/api/modules/heladeria/service.py`](../apps/api/modules/heladeria/service.py:267):**

```python
TOTEM_MEDIA_DIR = "media/totem"
MAX_IMAGE_BYTES = 8 * 1024 * 1024  # ESPEJO de totemSequencer.js
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}

async def save_totem_image(file) -> dict:
    # 1. Validar content_type → 415 si no permitido
    # 2. Leer bytes y validar tamaño → 413 si > MAX_IMAGE_BYTES
    # 3. Generar nombre seguro (uuid4 + extensión derivada del content_type)
    # 4. Escribir en TOTEM_MEDIA_DIR (crear si no existe)
    # 5. Devolver { url: f"/media/totem/{filename}", filename, size }

async def delete_totem_image(filename: str) -> dict:
    # 1. Sanear filename (PROHIBIDO path traversal: rechazar '/', '..', '\\')
    # 2. Borrar el archivo físico si existe
    # 3. Devolver { deleted: bool }
```

> **Seguridad:** el saneo de `filename` es obligatorio. Sin él, `DELETE /totem/upload/../../etc/passwd` sería un path traversal. Se valida contra una whitelist de caracteres y se rechaza cualquier separador de ruta.

**5. Tests backend** (`apps/api/tests/test_heladeria_totem.py`, nuevo, ~7 tests):

- `POST /totem/upload` con JPEG válido → 200 + `url` que empieza con `/media/totem/`.
- `POST /totem/upload` con archivo > 8 MB → **413**.
- `POST /totem/upload` con tipo no permitido (`application/pdf`) → **415**.
- `DELETE /totem/upload/{filename}` existente → 200 + `{ deleted: true }`.
- `DELETE /totem/upload/{filename}` inexistente → 200 + `{ deleted: false }` (idempotente).
- `DELETE /totem/upload/..%2F..%2Fetc%2Fpasswd` → **400** (path traversal bloqueado).
- `GET /settings/heladeria_totem_content` tras seed → 200 con el manifiesto por defecto.

**Verificación de la fase:**

```bash
# 1. Rebuild NO necesario (sin deps nuevas). Solo recrear el contenedor por el nuevo mount:
docker compose up -d api
Start-Sleep -Seconds 15

# 2. Verificar que el POS sigue vivo (CRÍTICO tras tocar main.py)
(Invoke-WebRequest -Uri "http://localhost:5001/api/v1/settings/" -UseBasicParsing).StatusCode   # 200

# 3. pytest
docker exec rderico-api-dev python -m pytest -q   # 39 + 7 = 46 OK

# 4. Persistencia tras reinicio
docker restart rderico-api-dev
Start-Sleep -Seconds 15
# La imagen subida debe seguir accesible en /media/totem/<filename>
```

**Commit:** `feat(heladeria): upload de imágenes del tótem + storage en bind mount (V16 Fase 16.2)`

---

### Fase 16.3 — Frontend: Gestor de Contenido Macro

**Objetivo:** panel administrativo para subir y administrar las imágenes.

**1. Crear `apps/heladeria/services/totemContentService.js`** (nuevo) — capa de datos:

```js
export const TOTEM_CONTENT_KEY = 'heladeria_totem_content';

export async function fetchTotemContent() { /* GET /settings/ → busca la clave */ }
export async function saveTotemContent(manifest) { /* PATCH /settings/heladeria_totem_content */ }
export async function uploadTotemImage(file) { /* POST /heladeria/totem/upload (FormData) */ }
export async function deleteTotemImage(filename) { /* DELETE /heladeria/totem/upload/{filename} */ }
export async function loadTotemContent() { /* auto-reparación: si no existe → seed + retry */ }
```

> **Reutiliza el patrón exacto de [`displayConfigService.js`](../apps/heladeria/services/displayConfigService.js:1)** (V17), que ya demostró funcionar.

**2. Crear `apps/heladeria/components/TotemContentManager.jsx`** (nuevo):

- Zona de **drag & drop** para subir imágenes (macro y hero).
- Vista previa en miniatura de cada imagen.
- Clasificación: cada imagen se etiqueta como `macro` (textura) o `hero` (helado completo).
- Botón de eliminar por imagen (llama a `deleteTotemImage` → borra manifiesto **y** archivo físico).
- **Color picker por imagen** (color de acento individual).
- Indicador de peso de cada imagen (para que el admin vea el impacto).
- **Sin animaciones CSS infinitas** (Incident 16.1).

**3. Control Fino de Reproducción** (sub-panel):

- Slider: **cuántas tomas macro** antes de un hero (1-10).
- Slider: **duración de cada macro** en segundos (1-15).
- Slider: **duración del hero** en segundos (1-15).
- Selector de **transición**: desvanecimiento / deslizamiento / zoom suave.
- Slider: **duración de la transición** en ms (200-2000).

**4. Selector de Formato y Estética:**

- Selector de **formato de hardware**: vertical (tótem) / horizontal.
- Selector de **tipografía** curada.
- Color picker global de acento.

**5. Persistencia:** guardar el manifiesto vía `saveTotemContent()` (PATCH a `/settings/`).

**Verificación de la fase:**

```bash
npx vite build      # sin errores
# Manual: el gestor sube imágenes, las clasifica, y la config se guarda y recupera
```

**Commit:** `feat(heladeria): gestor de contenido macro del tótem (V16 Fase 16.3)`

---

### Fase 16.4 — Frontend: Output del Tótem (offline-first)

**Objetivo:** la pantalla que ve el cliente. Reproduce la secuencia macro→hero con transiciones suaves, sin animaciones infinitas, y funciona sin red.

**1. Crear `apps/heladeria/components/TotemPlayer.jsx`** (nuevo) — el reproductor:

- Recibe `manifest` (macros, heroes, config) y `onExit`.
- Usa [`buildSequence()`](../apps/heladeria/utils/totemSequencer.js:1) para obtener el orden de reproducción.
- Avanza con un `setTimeout` **encadenado** (no `setInterval`) cuya duración sale de `totalDurationSec`/config. Esto evita el "Efecto Estrobo" (Incident 16.1): cada transición es un cambio de estado puntual, no una animación CSS infinita.
- Transiciones implementadas como **transición CSS finita** (`transition: opacity 800ms`), nunca `@keyframes ... infinite`.
- **Diseño explícito del lazy-loading (corrige D9):** se precarga **solo la siguiente** imagen con `new Image()`; al terminar la transición se libera la anterior. No se precargan las N imágenes (evita saturar la RAM del tótem).
- **Modo offline-first:** si `fetchTotemContent()` falla, usa el manifiesto cacheado en IndexedDB (mismo patrón que [`heladeriaOfflineStore.js`](../apps/heladeria/services/heladeriaOfflineStore.js:1)). Si no hay caché, muestra estado vacío ("Sin contenido configurado").
- **Sin dependencia de inventario** (corrige D8): el tótem es puramente sugestivo; no consulta stock.

**2. Reescribir [`DisplayTotemUI.jsx`](../apps/heladeria/sections/DisplayTotemUI.jsx:7)** con **doble landing** (mismo patrón que [`DisplayPreciosUI.jsx`](../apps/heladeria/sections/DisplayPreciosUI.jsx:21) de V17):

- Sin parámetro → **panel de administración** (`TotemContentManager`).
- Con `?mode=output` → **`TotemPlayer`** a pantalla completa (kiosco).

**3. ELIMINAR explícitamente la animación infinita (corrige D11):**

- Borrar la línea `animation: 'float 3s ease-in-out infinite'` (línea 61 del placeholder actual).
- Borrar el bloque `<style>{`@keyframes float { ... }`}</style>` (líneas 91-96 del placeholder actual).
- Verificación: `findstr /n "infinite" apps\heladeria\sections\DisplayTotemUI.jsx` debe devolver **vacío**.

**Verificación de la fase:**

```bash
npx vite build      # sin errores
findstr /n "infinite" apps\heladeria\sections\DisplayTotemUI.jsx   # debe estar vacío
# Manual: ?mode=output reproduce la secuencia; sin red usa la caché
```

**Commit:** `feat(heladeria): reproductor del tótem offline-first + elimina animación infinita (V16 Fase 16.4)`

---

### Fase 16.5 — (Opcional) Torre de Disponibilidad

**Objetivo:** mostrar en el tótem qué sabores están disponibles **hoy**, sin inventario.

> **Alcance reducido (corrige D8):** el API [`GET /heladeria/display/flavors`](../apps/api/modules/heladeria/router.py:91) devuelve **solo disponibilidad booleana** (`DisplayFlavorResponse`), NO cantidades. La torre refleja únicamente "disponible / agotado".

- Consumir `heladeriaService.getDisplayFlavors()` (ya existe, [`heladeriaService.js`](../apps/heladeria/services/heladeriaService.js:76)).
- Renderizar una lista simple de sabores con un punto verde/gris.
- **Sin animaciones infinitas.** Refresco cada 5 min (igual que el Display de Precios).
- Si el API falla, ocultar la torre (no romper el tótem).

**Verificación de la fase:**

```bash
npx vite build
# Manual: apagar un sabor en el POS de Heladería → el tótem lo refleja en <5 min
```

**Commit:** `feat(heladeria): torre de disponibilidad del tótem (V16 Fase 16.5)`

---

### Fase 16.6 — Documentación

**Objetivo:** registrar el módulo en la documentación maestra.

**1. Actualizar [`DOCUMENTACION_MODULO_HELADERIA.md`](../ESPECIFICACIONES%20DEL%20PROYECTO/DOCUMENTACION_MODULO_HELADERIA.md:1):**

- Tabla §5.4 (Secciones): cambiar la fila de `DisplayTotemUI.jsx` de "Placeholder" a "🟢 Funcional (V16)" y añadir las filas de `TotemPlayer.jsx` y `TotemContentManager.jsx`.
- §4 (API ENDPOINTS): documentar `POST /heladeria/totem/upload` y `DELETE /heladeria/totem/upload/{filename}`.
- §13 (Roadmap): mover "Display Tótem" de "Oleada 2" a "✅ Completado".
- §9 (DATOS SEED): documentar la clave `heladeria_totem_content`.

**2. Actualizar [`PLAN_HELADERIA_MAESTRO.md`](PLAN_HELADERIA_MAESTRO.md):** marcar V16 como completado.

**Verificación de la fase:**

```bash
git diff --stat   # solo archivos .md
```

**Commit:** `docs(heladeria): documenta el Display Tótem V16`

---

### Fase 16.7 — (Futuro, NO en este plan) Conversión WebP

> **Corrige D1.** La conversión a WebP requiere **Pillow**, que NO está instalado ni en [`requirements.txt`](../apps/api/requirements.txt:1). Añadirlo obliga a `docker compose build`, lo que **reinicia el contenedor del API y por ende el POS**. Por eso queda **explícitamente fuera del MVP**.

**Cuándo retomarlo:** en una ventana de mantenimiento programada, con el POS cerrado.

**Qué implicaría:**

1. Añadir `Pillow>=10.0.0` a `requirements.txt`.
2. `docker compose build api` (rebuild, NO `down`).
3. `docker compose up -d api` (recrea solo el API).
4. Implementar la conversión en `save_totem_image()`.
5. Verificar `/api/v1/settings/` = 200 tras el rebuild.

**Commit (futuro):** `feat(heladeria): conversión WebP de imágenes del tótem (V16 Fase 16.7)`

---

## ✅ CHECKLIST DE VERIFICACIÓN POR FASE

| Fase | vitest | build | pytest | POS vivo | Commit |
|---|---|---|---|---|---|
| 16.0 | 232 | 1428 | 39 | ✅ `/settings/`=200 | `feat(heladeria): siembra clave heladeria_totem_content (V16 Fase 16.0)` |
| 16.1 | 232 + N | 1428 | 39 | ✅ | `feat(heladeria): totemSequencer.js puro + tests (V16 Fase 16.1)` |
| 16.2 | 232 + N | 1428 | 39 + 7 | ✅ `/settings/`=200 | `feat(heladeria): upload de imágenes del tótem + storage (V16 Fase 16.2)` |
| 16.3 | 232 + N | 1428 | 46 | ✅ | `feat(heladeria): gestor de contenido macro del tótem (V16 Fase 16.3)` |
| 16.4 | 232 + N | 1428 | 46 | ✅ | `feat(heladeria): reproductor del tótem offline-first (V16 Fase 16.4)` |
| 16.5 | 232 + N | 1428 | 46 | ✅ | `feat(heladeria): torre de disponibilidad del tótem (V16 Fase 16.5)` |
| 16.6 | 232 + N | 1428 | 46 | ✅ | `docs(heladeria): documenta el Display Tótem V16` |

> **N** = tests nuevos de `totemSequencer.test.js` (estimado 30-40).

---

## ⚠️ MATRIZ DE RIESGOS

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| Tocar `main.py` rompe el POS | Baja | 🔴 Alto | Cambio **estrictamente aditivo** (solo `app.mount`). Verificar `/settings/`=200 tras cada cambio. Revertir con `git revert` si falla |
| Tocar `docker-compose.yml` reinicia el POS | Baja | 🔴 Alto | Solo se **añade** un bind mount al servicio `api`. **NUNCA** `docker compose down`. Usar `docker compose up -d api` |
| El volumen `totem_media` no existe en el host | Media | 🟠 Medio | Crear el directorio `../ERP-R-DE-RICO-DATA/totem_media` **antes** de `up -d api` |
| Imágenes pesadas saturan el tótem | Media | 🟠 Medio | Límite de 8 MB por archivo (backend autoritativo). Lazy-loading de solo la siguiente imagen |
| Path traversal en el upload | Baja | 🔴 Alto | Saneo del filename en `save_totem_image()` (solo `[a-zA-Z0-9._-]`, sin `..`) |
| El manifiesto se corrompe | Baja | 🟠 Medio | `normalizeTotemConfig()` valida y repara; `loadTotemContent()` re-siembra si falta |
| Animación infinita reintroducida | Baja | 🟡 Bajo | Verificación `findstr "infinite"` en cada fase de frontend |

**Riesgo global: 🟢 NULO para el POS de Panadería**, con las 2 mitigaciones críticas (cambios aditivos + nunca `down`).

---

## 🔄 PROTOCOLO DE REVERSIÓN (AMPLIADO — corrige D14)

### Reversión de código (frontend)

```bash
git revert <commit_sha>   # revierte el commit de la fase
npx vite build            # verifica que compila
```

### Reversión de backend (Fases 16.0 y 16.2)

```bash
git revert <commit_sha>
docker restart rderico-api-dev
Start-Sleep -Seconds 15
(Invoke-WebRequest -Uri "http://localhost:5001/api/v1/settings/" -UseBasicParsing).StatusCode   # 200
```

### Reversión de infraestructura (Fase 16.2 — bind mount)

Si el bind mount causa problemas:

1. Revertir el commit de `docker-compose.yml`.
2. `docker compose up -d api` (recrea el API con la config anterior).
3. Verificar `/settings/`=200.
4. Los archivos en `../ERP-R-DE-RICO-DATA/totem_media` **no se borran** (quedan huérfanos pero inofensivos).

### Reversión de emergencia (POS caído)

```bash
git log --oneline -5                 # identificar el último commit bueno
git revert <commit_malo>
docker compose up -d api             # NUNCA down
Start-Sleep -Seconds 15
(Invoke-WebRequest -Uri "http://localhost:5001/api/v1/settings/" -UseBasicParsing).StatusCode   # 200
```

---

## 📌 NOTAS DE DISEÑO

1. **Cero dependencias nuevas de Python.** El MVP acepta JPEG/PNG/WebP tal cual. WebP se difiere a Fase 16.7.
2. **El manifiesto vive en `system_settings`** (clave `heladeria_totem_content`), leído/escrito vía `/settings/` (PATCH). No se crean endpoints CRUD nuevos.
3. **El backend es el guardián autoritativo** de la validación de archivos; el frontend solo da UX temprana.
4. **La torre usa disponibilidad, no inventario** (el API no expone cantidades).
5. **Bind mount, no volumen nombrado** — respeta la convención de [`docker-compose.yml`](../docker-compose.yml:48).
6. **`config.js` es la única fuente de URLs.** Prohibido `window.location.hostname`.
7. **Sin animaciones infinitas** (Incident 16.1). Transiciones finitas únicamente.

---

## ✅ CRITERIOS DE ACEPTACIÓN

- [ ] El placeholder `DisplayTotemUI.jsx` ya no contiene `@keyframes float` ni `infinite`.
- [ ] `?mode=output` reproduce la secuencia macro→hero con transiciones finitas.
- [ ] El gestor de contenido sube, clasifica y elimina imágenes.
- [ ] El manifiesto persiste en `system_settings` y sobrevive un reinicio del API.
- [ ] El tótem funciona sin red (usa caché IndexedDB).
- [ ] `POST /heladeria/totem/upload` rechaza archivos >8 MB y tipos no permitidos.
- [ ] `DELETE /heladeria/totem/upload/{filename}` borra manifiesto **y** archivo físico.
- [ ] vitest 232+N, build 1428, pytest 39+7.
- [ ] `/api/v1/settings/` = 200 tras cada cambio de backend.
- [ ] **El POS de Panadería funciona sin cambios** (Restricción A respetada).
- [ ] Cero archivos de `apps/pos/` modificados.

---

## 🚦 CHECKLIST DE APROBACIÓN

- [ ] El usuario aprueba la Revisión 2 de este plan.
- [ ] Se confirma la ventana de ejecución (sin tickets abiertos).
- [ ] Se crea el directorio `../ERP-R-DE-RICO-DATA/totem_media` en el host.
- [ ] Se confirma el orden: Fase 16.0 → 16.1 → 16.2 → 16.3 → 16.4 → 16.5 → 16.6.

> **Este plan está PROPUESTO. No se inicia la implementación sin aprobación explícita del usuario.**
