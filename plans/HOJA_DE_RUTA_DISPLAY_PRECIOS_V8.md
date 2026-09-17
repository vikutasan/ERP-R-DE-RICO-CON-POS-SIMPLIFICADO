# HOJA DE RUTA — Implementación del Gestor de Display de Precios (v8)

> **Documento fuente:** [`plans/plan gestor de display`](plans/plan%20gestor%20de%20display:1) (v8)
> **Alcance:** convertir "Display de Precios" de monolito en una **sub-suite de 2
> herramientas** (Configurador + Selector) con hasta **3 pantallas nombradas**,
> preview en vivo, proyección multi-pantalla y **exportación a PDF para imprenta**.
> **Restricción dura:** **NO se toca `apps/pos/`** (zona restringida: impresoras
> térmicas de 80 mm). Esta herramienta **no imprime**: genera un archivo y lo
> descarga.
> **Dependencia nueva:** `jspdf` (~350 KB) — la **única** del plan.
> **Migraciones Alembic:** **CERO** (todo va a `system_settings`).

---

## 0. Resumen ejecutivo

| Métrica | Valor |
|---|---|
| Archivos **modificados** | 9 |
| Archivos **nuevos** | 14 |
| Dependencias nuevas | 1 (`jspdf`) |
| Migraciones Alembic | 0 |
| Archivos de `apps/pos/` tocados | **0** |
| Fases | 6 (F0–F5) |
| Checkpoints de verificación | 6 (uno por fase) |

**Principio rector:** *primero lo puro y testeable, luego la UI, al final la
integración.* Cada fase deja el sistema **en verde** (build + tests) antes de pasar
a la siguiente.

---

## 1. Mapa de dependencias entre fases

```
F0 (Backend seed)
      │
      ▼
F1 (Utilidades puras + tests)  ◄── base sólida, sin UI
      │
      ├──────────────┐
      ▼              ▼
F2 (Servicio)   F3 (Deep-link)   ← F3 es BLOQUEANTE para el Selector
      │              │
      └──────┬───────┘
             ▼
F4 (UI: componentes → output → sub-suite → wrapper)
             │
             ▼
F5 (jspdf + motor de diseño + exportación PDF)
             │
             ▼
F6 (Verificación manual completa + cierre)
```

**Regla de oro:** ninguna fase empieza hasta que la anterior pasa su checkpoint.

---

## FASE 0 — Backend: seed aditivo

**Objetivo:** que exista la clave `heladeria_display_screens` en `system_settings`
sin migración y sin borrar la clave legacy.

### Archivos
| Acción | Archivo |
|---|---|
| MODIFY | [`apps/api/modules/settings/service.py`](apps/api/modules/settings/service.py:26) |

### Tareas
1. Añadir el seed **aditivo** de `heladeria_display_screens` en
   [`seed_settings()`](apps/api/modules/settings/service.py:26).
2. **NO borrar** `heladeria_display_precios_config` (clave legacy, §2.4 del plan).
3. El seed debe ser **idempotente**: si la clave ya existe, no la sobrescribe.

### Comandos
```cmd
cd apps\api && pytest tests\ -q
```

### Checkpoint F0 ✅
- [ ] `POST /settings/seed` responde 200 y es idempotente (2 llamadas seguidas → mismo estado).
- [ ] La clave legacy sigue presente tras el seed.
- [ ] Tests de backend en verde.

---

## FASE 1 — Utilidades puras + tests (la base)

**Objetivo:** toda la lógica de negocio, **sin UI**, testeable con Vitest sin
navegador. Es la fase más importante: si esto está bien, la UI es trivial.

### Archivos
| Acción | Archivo | Contenido |
|---|---|---|
| MODIFY | [`apps/heladeria/utils/displayMappers.js`](apps/heladeria/utils/displayMappers.js:1) | Constantes + 7 funciones puras multi-pantalla |
| NEW | [`apps/heladeria/utils/printFormats.js`](apps/heladeria/utils/printFormats.js:1) | `getPageSizePt`, `mmToPt`, `normalizePrintConfig` |
| NEW | [`apps/heladeria/utils/displayFonts.js`](apps/heladeria/utils/displayFonts.js:1) | Catálogo de 4 tipografías + `collectUsedFonts` |
| NEW | [`apps/heladeria/utils/layoutPrintDocument.js`](apps/heladeria/utils/layoutPrintDocument.js:1) | Paginación determinista (pura) |
| NEW | [`apps/heladeria/utils/displayTemplates.js`](apps/heladeria/utils/displayTemplates.js:1) | 5 plantillas + `applyTemplate` |
| NEW | [`apps/heladeria/utils/displayConfigIO.js`](apps/heladeria/utils/displayConfigIO.js:1) | `exportScreen`, `importScreen`, `duplicateScreenConfig` |
| MODIFY | [`apps/heladeria/utils/displayMappers.test.js`](apps/heladeria/utils/displayMappers.test.js:1) | **Añadir** casos (no reescribir los 43 existentes) |

### Tareas
1. **`displayMappers.js`** — añadir las funciones puras multi-pantalla:
   `normalizeScreen`, `normalizeDisplayScreens`, `resolveScreenFromQuery`,
   `buildScreenProjectionUrl`, `resolveGroupLabel`, `resolveImagePresentation`,
   `serializeDisplayConfig` (ya existe, verificar).
2. **`printFormats.js`** — catálogo en **puntos** (1 pt = 1/72"):
   - `LETTER` 612×792 · `LEGAL` 612×1008 · `TABLOID` 792×1224 ·
     `DOUBLE_LETTER` 1224×792 · `A4` 595.28×841.89 · `A3` 841.89×1190.55.
   - `getPageSizePt(format, orientation)` — intercambia ancho/alto en `LANDSCAPE`.
   - `mmToPt(mm)` — `mm * 72 / 25.4`.
   - `normalizePrintConfig(raw)` — defaults: `LETTER`/`PORTRAIT`/`showQr:false`.
3. **`displayFonts.js`** — 4 fuentes: `CLASSIC` (Playfair Display), `FUN`
   (Baloo 2), `MODERN` (Poppins), `RETRO` (Lobster Two). `collectUsedFonts(screens)`
   devuelve el **subconjunto único** realmente usado (para no descargar las 4).
4. **`layoutPrintDocument.js`** — **firma corregida v8:**
   `layoutPrintDocument(viewModel, screenConfig)` (config **completa**, no
   `screenConfig.print`). Devuelve `{ pageSizePt, pages: [{ items: [...] }] }`.
   Reglas: paginación determinista, `GROUP_TITLE` nunca al final de página
   (keep-with-next), `HEADER` repetido si `repeatHeader:true`, `FOOTER` en la última.
5. **`displayTemplates.js`** — **5 plantillas**: `CLASSIC`, `MINIMAL`, `KIDS`,
   `RETRO`, `PRICE_ONLY`. `applyTemplate(config, key)` **NO** toca `groups` ni
   `groupLabels`.
6. **`displayConfigIO.js`** — `exportScreen` (añade `version`+`exportedAt`),
   `importScreen` (valida, ignora `id` del archivo, nunca lanza),
   `duplicateScreenConfig` (copia config, **no** `id`/`name`).
7. **Tests** — añadir los casos 9→21 de §7.1 del plan en un `describe` nuevo.

### Comandos
```cmd
npx vitest run apps/heladeria/utils/displayMappers.test.js
```

### Checkpoint F1 ✅
- [ ] Los 43 tests existentes **siguen pasando** (sin regresión del contrato).
- [ ] Los casos nuevos (9→21) pasan.
- [ ] `layoutPrintDocument` recibe `screenConfig` completo (test que verifica que
      `header` y `fontFamily` llegan al layout).
- [ ] `PRICE_ONLY` existe en `DISPLAY_TEMPLATES` (5 plantillas, no 4).
- [ ] `getPageSizePt('TABLOID','LANDSCAPE')` → `{width:1224, height:792}`.
- [ ] Cero dependencias nuevas todavía.

---

## FASE 2 — Servicio de datos

**Objetivo:** capa de acceso a `system_settings` con reintentos centralizados.

### Archivos
| Acción | Archivo |
|---|---|
| MODIFY | [`apps/heladeria/services/displayConfigService.js`](apps/heladeria/services/displayConfigService.js:1) |

### Tareas
1. Añadir `fetchDisplayScreens`, `loadDisplayScreens`, `saveDisplayScreens`.
2. **Obligatorio:** usar `withRetries` de
   [`apps/pos/utils/withRetries.js`](apps/pos/utils/withRetries.js:1) (utilidad
   centralizada, no reimplementar).
3. **Obligatorio:** usar `CONFIG.API_BASE_URL` importado de
   [`apps/pos/config`](apps/pos/config.js:1) — **PROHIBIDO** construir URLs con
   `window.location.hostname` (Incident 16.6/16.8).
4. Mantener compatibilidad con la clave legacy.

### Comandos
```cmd
npx vitest run
```

### Checkpoint F2 ✅
- [ ] `displayConfigService.js` importa `CONFIG` (verificación **manual**: el build
      no detecta imports faltantes — Incident 16.8).
- [ ] Todas las llamadas pasan por `withRetries`.
- [ ] Cero URLs construidas a mano.

---

## FASE 3 — Deep-link del kiosco ⚠️ BLOQUEANTE

**Objetivo:** que una URL con `?module=heladeria&mode=output&screen=screen_2`
monte el Display **aunque el usuario no esté logueado en el módulo**. Sin esto, el
Selector no sirve.

### Archivos
| Acción | Archivo |
|---|---|
| MODIFY | [`apps/ExperimentCenterUI.jsx`](apps/ExperimentCenterUI.jsx:1) |
| MODIFY | [`apps/heladeria/HeladeriaHubUI.jsx`](apps/heladeria/HeladeriaHubUI.jsx:1) |

### Tareas
1. `ExperimentCenterUI` — interpretar `module`, `mode`, `screen` de la query y
   montar el Display directamente.
2. `HeladeriaHubUI` — prop opcional `initialTool` para abrir una herramienta
   concreta al montar.
3. **No romper** la URL legacy `?mode=output` (sin `&screen=`).

### Comandos
```cmd
npm run build
```

### Checkpoint F3 ✅
- [ ] Abrir en pestaña nueva `{pathname}?module=heladeria&mode=output&screen=screen_2`
      **estando deslogueado del módulo** → monta el Display, no el Dashboard.
- [ ] La URL legacy `?mode=output` sigue funcionando.
- [ ] `npm run build` sin errores.

---

## FASE 4 — UI: componentes → output → sub-suite → wrapper

**Objetivo:** toda la interfaz, reutilizando el cuerpo puro compartido.

### Archivos
| Acción | Archivo | Rol |
|---|---|---|
| NEW | [`apps/heladeria/components/DisplayPreciosBody.jsx`](apps/heladeria/components/DisplayPreciosBody.jsx:1) | Cuerpo puro (grupos + cards) |
| NEW | [`apps/heladeria/components/DisplayPreciosPreview.jsx`](apps/heladeria/components/DisplayPreciosPreview.jsx:1) | Marco + escala sobre `Body` |
| NEW | [`apps/heladeria/components/DisplayConfigControls.jsx`](apps/heladeria/components/DisplayConfigControls.jsx:1) | Controles **base** (presentacional) |
| MODIFY | [`apps/heladeria/sections/DisplayPreciosOutput.jsx`](apps/heladeria/sections/DisplayPreciosOutput.jsx:1) | Lee `screen`, fix `position`, compara antes de `setState` |
| NEW | [`apps/heladeria/sections/DisplayPreciosSuiteUI.jsx`](apps/heladeria/sections/DisplayPreciosSuiteUI.jsx:1) | Sub-suite B&W con 2 botones |
| NEW | [`apps/heladeria/sections/DisplayPreciosConfigUI.jsx`](apps/heladeria/sections/DisplayPreciosConfigUI.jsx:1) | Configurador split con preview en vivo |
| NEW | [`apps/heladeria/sections/DisplayPreciosSelectorUI.jsx`](apps/heladeria/sections/DisplayPreciosSelectorUI.jsx:1) | Sala de control con proyección |
| MODIFY | [`apps/heladeria/sections/DisplayPreciosUI.jsx`](apps/heladeria/sections/DisplayPreciosUI.jsx:1) | Wrapper delgado (legacy vs sub-suite) |

### Tareas
1. **`DisplayPreciosBody`** — extraer el cuerpo de
   [`DisplayPreciosOutput.jsx`](apps/heladeria/sections/DisplayPreciosOutput.jsx:34)
   (grupos + cards). **Puro**: sin fetch, sin timers, sin `position: fixed`.
2. **`DisplayPreciosPreview`** — marco con `overflow: hidden` + `pointer-events:
   none` + escala. Sin `@keyframes` (Incident 16.1).
3. **`DisplayConfigControls`** — controles **base** (nombre, habilitada, grupos,
   columnas 1..6, tema, imágenes, agotados). Los controles v4 van en
   `DisplayTemplateControls` (Fase 5).
4. **`DisplayPreciosOutput`** — leer `?screen=`; **fix del `position: fixed`**
   (líneas 265-272) para que no tape el sidebar; **comparar datos antes de
   `setState`** en el polling (Incident 16.2); usar `Body`.
5. **`DisplayPreciosSuiteUI`** — 2 botones (Configurador / Selector), estilo B&W
   editorial idéntico al resto.
6. **`DisplayPreciosConfigUI`** — split: controles a la izquierda, preview en vivo
   a la derecha. Guardar / resetear.
7. **`DisplayPreciosSelectorUI`** — 3 tarjetas de pantalla con miniaturas;
   "Proyectar" abre pestaña con la URL de §5.4; pantallas `enabled:false`
   atenuadas; estado vacío con CTA al Configurador.
8. **`DisplayPreciosUI`** — wrapper delgado: si hay `?screen=` o sub-suite →
   sub-suite; si no → legacy.

### Comandos
```cmd
npm run build
npx vitest run
```

### Checkpoint F4 ✅
- [ ] Hub → Gestor Displays → Display Precios → sub-suite con 2 botones.
- [ ] Configurador: cambiar nombre/grupos/columnas/tema → preview en vivo.
- [ ] Guardar → recargar → los 3 valores persisten.
- [ ] Selector: 3 pantallas con miniaturas → "Proyectar" abre fullscreen correcto.
- [ ] Pantalla `enabled:false` atenuada y sin botón.
- [ ] Cero habilitadas → estado vacío + CTA.
- [ ] El output **no** se recorta ni tapa el sidebar.
- [ ] Ningún componente nuevo define `@keyframes` ni `animate-pulse`.
- [ ] `DisplayConfigPanel.jsx` **NO** se ha modificado.

---

## FASE 5 — `jspdf` + motor de diseño + exportación PDF

**Objetivo:** el poder de diseño real (encabezado, tipografía, imágenes,
plantillas) y la **exportación a PDF para imprenta**.

### Archivos
| Acción | Archivo | Rol |
|---|---|---|
| NEW | [`apps/heladeria/utils/pdfRenderer.js`](apps/heladeria/utils/pdfRenderer.js:1) | `renderPdf` con `jspdf` (impuro) |
| NEW | [`apps/heladeria/components/DisplayTemplateControls.jsx`](apps/heladeria/components/DisplayTemplateControls.jsx:1) | Controles v4 (encabezado/tipografía/imágenes/exportar) |
| NEW | [`apps/heladeria/components/DisplayTemplatePicker.jsx`](apps/heladeria/components/DisplayTemplatePicker.jsx:1) | Modal de plantillas y pantalla destino |

### Tareas
1. **Instalar la dependencia (única del plan):**
   ```cmd
   npm install jspdf
   ```
   Verificar que `package.json` gana **solo** `jspdf` (ni `html2canvas` ni
   `svg2pdf`).
2. **`pdfRenderer.js`** — `renderPdf(layout, screenConfig)`:
   - `new jsPDF({ unit: 'pt', format: [w, h], orientation })`.
   - Dibuja texto **vectorial** e imágenes (`addImage` con `dataURL`).
   - Fondo **siempre blanco** (§2.14.2), aunque la pantalla esté en `DARK`.
   - `doc.save(buildFileName(screenConfig))` → **descarga, NO imprime**.
   - **Nunca** decide saltos de página: vienen resueltos en `layout.pages`.
3. **`DisplayTemplateControls`** — encabezado (título/subtítulo/logo/alineación),
   tipografía (4 fuentes), imágenes finas (tamaño/forma/fallback), botón
   "Descargar PDF para imprenta", exportar/importar JSON.
4. **`DisplayTemplatePicker`** — modal para aplicar plantilla y elegir pantalla
   destino al duplicar.
5. **Carga de Google Fonts** — `<link>` a Google Fonts (patrón del proyecto,
   igual que `Inter`), **solo las fuentes usadas** (`collectUsedFonts`).
6. **`handleDownloadPdf`** en el Configurador:
   ```js
   const viewModel = buildDisplayViewModel(menuData, screenConfig);
   const layout = layoutPrintDocument(viewModel, screenConfig);  // puro
   await renderPdf(layout, screenConfig);                        // impuro
   ```

### Comandos
```cmd
npm install jspdf
npm run build
npx vitest run
```

### Checkpoint F5 ✅
- [ ] `package.json` gana **solo** `jspdf`.
- [ ] "Descargar PDF para imprenta" descarga `carta-*.pdf` **sin abrir diálogo de
      impresión**.
- [ ] El PDF abre con el **tamaño de página correcto** (verificable en propiedades).
- [ ] El fondo del PDF es **blanco** aunque la pantalla esté en `DARK`.
- [ ] El texto del PDF es **seleccionable** (vectorial, no imagen).
- [ ] Los cortes de página caen **entre grupos**, nunca a mitad de una card.
- [ ] `TABLOID`+`LANDSCAPE` → página de `1224 × 792 pt`.
- [ ] Con `showQr:false` (default) el PDF incluye la **URL en texto** bajo el pie.
- [ ] `footerNote` y `validUntil` aparecen en el PDF.
- [ ] Con las 3 pantallas en `CLASSIC`, la pestaña Network **no** descarga
      `Baloo 2`, `Poppins` ni `Lobster Two`.
- [ ] Aplicar "Infantil" → preview cambia, **pero los grupos NO cambian**.
- [ ] Duplicar pantalla 1 → pantalla 2 conserva **su** nombre.
- [ ] Exportar → `.json` con `version` y `exportedAt`.
- [ ] Importar válido → config aplicada; importar corrupto → error, **no** aplica nada.
- [ ] `PRICE_ONLY` → sin imágenes, 5-6 columnas, tipografía moderna.

---

## FASE 6 — Verificación manual completa + cierre

**Objetivo:** recorrer los 28 pasos de §7.3 del plan y cerrar.

### Tareas
1. Ejecutar **los 28 pasos** de verificación manual (§7.3).
2. **Regresión de zona restringida:** `git status` → confirmar que **ningún**
   archivo de `apps/pos/` cambió.
3. Confirmar que los tickets térmicos de 80 mm siguen imprimiendo igual.
4. Confirmar que **esta herramienta no toca ninguna impresora**.

### Comandos
```cmd
git status
npm run build
npx vitest run
cd apps\api && pytest tests\ -q
```

### Checkpoint F6 ✅ (cierre)
- [ ] Los 28 pasos de §7.3 pasan.
- [ ] `git status` → **0 archivos de `apps/pos/`** modificados.
- [ ] Build + tests frontend + tests backend en verde.
- [ ] Rollback documentado y probado (§8): revertir el commit restaura el monolito
      y el output sigue leyendo la clave legacy.

---

## 2. Tabla de trazabilidad (archivo → fase → checkpoint)

| # | Archivo | Acción | Fase | Checkpoint |
|---|---|---|---|---|
| 1 | `apps/api/modules/settings/service.py` | MODIFY | F0 | F0 |
| 2 | `apps/heladeria/utils/displayMappers.js` | MODIFY | F1 | F1 |
| 3 | `apps/heladeria/utils/printFormats.js` | NEW | F1 | F1 |
| 4 | `apps/heladeria/utils/displayFonts.js` | NEW | F1 | F1 |
| 5 | `apps/heladeria/utils/layoutPrintDocument.js` | NEW | F1 | F1 |
| 6 | `apps/heladeria/utils/displayTemplates.js` | NEW | F1 | F1 |
| 7 | `apps/heladeria/utils/displayConfigIO.js` | NEW | F1 | F1 |
| 8 | `apps/heladeria/utils/displayMappers.test.js` | MODIFY | F1 | F1 |
| 9 | `apps/heladeria/services/displayConfigService.js` | MODIFY | F2 | F2 |
| 10 | `apps/ExperimentCenterUI.jsx` | MODIFY | F3 | F3 |
| 11 | `apps/heladeria/HeladeriaHubUI.jsx` | MODIFY | F3 | F3 |
| 12 | `apps/heladeria/components/DisplayPreciosBody.jsx` | NEW | F4 | F4 |
| 13 | `apps/heladeria/components/DisplayPreciosPreview.jsx` | NEW | F4 | F4 |
| 14 | `apps/heladeria/components/DisplayConfigControls.jsx` | NEW | F4 | F4 |
| 15 | `apps/heladeria/sections/DisplayPreciosOutput.jsx` | MODIFY | F4 | F4 |
| 16 | `apps/heladeria/sections/DisplayPreciosSuiteUI.jsx` | NEW | F4 | F4 |
| 17 | `apps/heladeria/sections/DisplayPreciosConfigUI.jsx` | NEW | F4 | F4 |
| 18 | `apps/heladeria/sections/DisplayPreciosSelectorUI.jsx` | NEW | F4 | F4 |
| 19 | `apps/heladeria/sections/DisplayPreciosUI.jsx` | MODIFY | F4 | F4 |
| 20 | `apps/heladeria/utils/pdfRenderer.js` | NEW | F5 | F5 |
| 21 | `apps/heladeria/components/DisplayTemplateControls.jsx` | NEW | F5 | F5 |
| 22 | `apps/heladeria/components/DisplayTemplatePicker.jsx` | NEW | F5 | F5 |
| 23 | `package.json` (dependencia `jspdf`) | MODIFY | F5 | F5 |

**Total: 9 MODIFY + 14 NEW = 23 entradas** (la #23 es la dependencia, no un archivo
de código nuevo).

---

## 3. Riesgos y mitigaciones

| Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|
| El deep-link no monta el Display deslogueado | Media | **Alto** (bloquea el Selector) | F3 es **bloqueante**; se verifica antes de la UI. |
| `layoutPrintDocument` recibe la config equivocada | Baja | Alto | Firma corregida en v8 (`screenConfig` completo) + test que lo verifica. |
| Se descargan las 4 fuentes siempre | Media | Bajo | `collectUsedFonts` + verificación en Network (F5). |
| El PDF sale rasterizado o con fondo oscuro | Baja | Medio | `jspdf` vectorial + tema claro forzado + verificación de texto seleccionable. |
| Se toca `apps/pos/` por accidente | Baja | **Crítico** | `git status` en F6; zona restringida declarada en §0. |
| `jspdf` engorda el bundle | Media | Bajo | ~350 KB justificados; única dependencia; se documenta. |
| Regresión de los 43 tests existentes | Media | Medio | F1: se **añaden** casos, no se reescribe el archivo. |

---

## 4. Definición de "terminado" (DoD)

La implementación se considera terminada cuando:

1. Los **6 checkpoints** (F0–F6) están en verde.
2. Los **28 pasos** de verificación manual (§7.3) pasan.
3. `git status` confirma **0 archivos de `apps/pos/`** modificados.
4. `npm run build` + `npx vitest run` + `pytest` en verde.
5. `package.json` tiene **exactamente 1** dependencia nueva (`jspdf`).
6. El rollback (§8) está documentado y probado.
7. La clave legacy `heladeria_display_precios_config` **sigue intacta**.

---

## 5. Orden de commits sugerido

| Commit | Fase | Mensaje |
|---|---|---|
| 1 | F0 | `feat(display): seed aditivo de heladeria_display_screens` |
| 2 | F1 | `feat(display): utilidades puras multi-pantalla + tests` |
| 3 | F1 | `feat(display): motor de paginación PDF (layoutPrintDocument)` |
| 4 | F1 | `feat(display): plantillas, fuentes y export/import JSON` |
| 5 | F2 | `feat(display): servicio de pantallas con withRetries` |
| 6 | F3 | `fix(kiosco): deep-link ?module=heladeria&mode=output&screen=` |
| 7 | F4 | `feat(display): sub-suite, configurador y selector` |
| 8 | F4 | `fix(display): position del output + comparación antes de setState` |
| 9 | F5 | `feat(display): exportación a PDF para imprenta (jspdf)` |
| 10 | F5 | `feat(display): controles de diseño y modal de plantillas` |
| 11 | F6 | `docs(display): verificación manual y cierre` |

---

## 6. Notas de precisión (heredadas de la v8)

- **"El ERP" ≠ "esta herramienta".** El ERP **sí** usa impresoras en el POS
  (tickets térmicos de 80 mm). **Esta herramienta de Display no toca ninguna
  impresora**: solo genera un archivo PDF y lo descarga.
- **`layoutPrintDocument(viewModel, screenConfig)`** — config **completa**, no
  `screenConfig.print` (corrección v8, defecto #2).
- **5 plantillas**, no 4: `CLASSIC`, `MINIMAL`, `KIDS`, `RETRO`, `PRICE_ONLY`.
- **Solo `jspdf`**, sin `svg2pdf` ni `html2canvas` (corrección v8, defecto #8).
- **`showQr: false`** por defecto; el QR gráfico es fase futura (§12).
