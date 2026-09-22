# PLAN DE CONSTRUCCIÓN — PROGRAMACIÓN DE PEDIDOS CON CAPTURA ASISTIDA POR IA
## Módulo Reparto Pan Grandeza · ERP R de Rico

**Versión:** V1
**Fecha:** 22/Septiembre/2026
**Estado:** PROPUESTO — pendiente de aprobación
**Alcance:** Quinta pestaña en la suite `GrandezaParamsUI` + captura de pedidos por OCR/LLM + integración con Producción
**Restricción dura:** CERO cambios en el POS (`RetailVisionPOS.jsx`)

---

## 1. CONTEXTO DE NEGOCIO

El módulo de **Programación de Mensajes** (v7.5.0, ya implementado) resuelve la mitad del problema: avisa a los clientes por WhatsApp que levanten su pedido. Pero **la captura del pedido sigue siendo manual**: el administrador lee cada respuesta de WhatsApp y la transcribe a mano.

**Situación actual:** el administrador recibe N respuestas de WhatsApp (una por cliente), y debe transcribir cada pedido a una hoja de cálculo o a papel para luego pasarlo a Producción.

**Objetivo:** que el ERP **lea la captura de pantalla del chat de WhatsApp**, identifique al cliente y los productos, y **proponga** una fila en la tabla de pedidos. El administrador solo revisa y confirma. La tabla resultante alimenta al módulo de Producción.

### 1.1 Decisiones ya tomadas por el usuario

| # | Decisión | Valor |
|---|----------|-------|
| D-1 | **Ubicación de la UI** | **Quinta pestaña** "📋 Programación de Pedidos" en `GrandezaParamsUI.jsx` |
| D-2 | **Configuración de la pestaña** | Día y hora límite de entrada de pedidos + día de entrega + selector (LUNES…DOMINGO) |
| D-3 | **Estructura de la tabla** | Filas = clientes · Columnas = productos · Fila final = total por producto |
| D-4 | **Clientes en la tabla** | **SOLO los que respondieron.** Los que no respondieron NO se integran |
| D-5 | **Método de captura** | **Ruta A: OCR + LLM.** El humano sube una captura de pantalla del chat |
| D-6 | **Identificación del cliente** | Por **teléfono** o **nombre** visible en el encabezado del chat |
| D-7 | **Integración con Producción** | La tabla se comunica con el módulo de Producción para fabricar las piezas |
| D-8 | **Contrato IA** | **Human-in-the-loop.** La IA PROPONE, el humano CONFIRMA. Nunca registra sola |

### 1.2 Por qué Ruta A (OCR + LLM) y NO lectura directa de WhatsApp

Se evaluó y se descartó la lectura automática de WhatsApp. Razones registradas para que ninguna IA futura lo reintente:

1. **No existe API pública** para leer los mensajes de un WhatsApp personal.
2. **Automatizar la UI de WhatsApp viola sus Términos de Servicio** y expone el número a **baneo permanente**. El número es el canal de contacto con los clientes: perderlo es un daño operativo grave.
3. **La vía legítima (WhatsApp Business API / Meta Cloud API)** exige verificación de negocio, plantillas aprobadas y **costo por conversación**. No se justifica.
4. **La captura de pantalla es un acto humano explícito.** El administrador decide qué compartir y cuándo. No hay scraping, no hay sesión headless, no hay riesgo de baneo.

**Conclusión:** el camino correcto es **captura manual + interpretación automática**. El humano aporta la imagen; la IA aporta la transcripción. Es legítimo, robusto y gratis.

### 1.3 Por qué OCR y NO el YOLO existente

**Hallazgo crítico de la investigación previa:** el motor de visión actual ([`ai-local/app/engines/vision.py`](../ai-local/app/engines/vision.py)) usa **YOLOv8**, que **detecta y cuenta objetos**, no transcribe texto. Su docstring es explícito:

> *"Motor de vision — conteo de objetos con YOLOv8. Este motor resuelve el problema P2 del spec §3.2: '¿CUANTOS hay?'"*

Pasarle una captura de WhatsApp devolvería "hay 3 objetos", no "3 conchas". **Se necesita OCR (reconocimiento óptico de caracteres), que es una tecnología distinta.** No es un problema de entrenamiento: YOLO no hace OCR.

---

## 2. ALCANCE

### 2.1 Dentro del alcance

- Quinta pestaña **"📋 Programación de Pedidos"** en `GrandezaParamsUI.jsx`.
- Configuración: **día y hora límite** de entrada de pedidos, **día de entrega**, **selector** de clientes.
- **Tabla editable** clientes × productos con fila de **totales por producto**.
- **Botón "📷 Subir captura"** que abre el selector de archivos del dispositivo.
- **Pipeline OCR + LLM**: la captura se convierte en una propuesta estructurada.
- **Match de cliente** en cascada (teléfono → nombre exacto → nombre difuso → selección manual).
- **Panel de confirmación** donde el humano revisa y corrige la propuesta antes de aceptarla.
- **Persistencia** de pedidos en tabla nueva `grandeza_order_requests`.
- **Endpoint de envío a Producción** que materializa los pedidos confirmados.
- **Nuevo endpoint en el motor de IA** `POST /ocr/extract-order`.
- **Nuevo endpoint en el AI Gateway** `POST /ai/orders/parse-screenshot`.

### 2.2 Fuera del alcance

- Lectura automática de WhatsApp (descartado, ver §1.2).
- Modelos multimodales (LLaVA, Qwen-VL) — se usa OCR + LLM de texto (ver §4.2).
- Envío automático de pedidos a Producción sin confirmación humana.
- Clientes que no respondieron (D-4: no se integran).
- Personalización del mensaje por cliente.
- Cambios en el POS (`RetailVisionPOS.jsx`) — **CERO**.
- Cambios en `GrandezaDriverUI.jsx` — **CERO**.

---

## 3. ARQUITECTURA GENERAL

```
┌─────────────────────────────────────────────────────────────────────┐
│  ADMINISTRADOR (móvil)                                              │
│  1. Toma captura del chat de WhatsApp                               │
│  2. Abre 5ª pestaña "📋 Programación de Pedidos"                    │
│  3. Pulsa "📷 Subir captura" → selecciona la imagen                 │
└────────────────────────────┬────────────────────────────────────────┘
                             │ POST /ai/orders/parse-screenshot
                             │ { imagen_base64, selector, fecha_entrega }
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│  ERP — AI GATEWAY (apps/api/modules/ai/service.py)                  │
│  · Verifica AI_LOCAL_ENABLED y AI_LOCAL_URL                         │
│  · Si no está disponible → 503 IA_NO_DISPONIBLE (modo manual)       │
│  · Delega al motor de IA Local por HTTP                             │
└────────────────────────────┬────────────────────────────────────────┘
                             │ POST /ocr/extract-order
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│  MOTOR DE IA LOCAL (ai-local/)                                      │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ PASO 1 — OCR (Tesseract)                                      │  │
│  │   imagen → texto crudo                                        │  │
│  │   "Panadería La Esperanza / 3 conchas / 2 bolillos"           │  │
│  └───────────────────────────┬───────────────────────────────────┘  │
│                              ▼                                      │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ PASO 2 — LLM (Ollama, ya instalado)                           │  │
│  │   texto crudo + catálogo → JSON estructurado                  │  │
│  │   { cliente_hint, telefono_hint, items:[{producto,cantidad}] }│  │
│  └───────────────────────────┬───────────────────────────────────┘  │
└──────────────────────────────┼──────────────────────────────────────┘
                               │ JSON propuesto
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  ERP — GRANDEZA SERVICE                                             │
│  · Match de cliente en cascada:                                     │
│      1. teléfono → grandeza_clients.phone                           │
│      2. nombre exacto → grandeza_clients.name                       │
│      3. nombre difuso (Levenshtein) → requiere confirmación         │
│      4. sin match → el humano elige del dropdown                    │
│  · Match de producto contra el catálogo habilitado                  │
│  · Marca confianza baja en ámbar (requiere_revision)                │
└────────────────────────────┬────────────────────────────────────────┘
                             │ PROPUESTA
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│  UI — PANEL DE CONFIRMACIÓN                                         │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ Cliente: Panadería La Esperanza  ✓ (match por teléfono)       │  │
│  │ ───────────────────────────────────────────────────────────── │  │
│  │ Concha         3   [editable]                                 │  │
│  │ Bolillo        2   [editable]                                 │  │
│  │ ⚠️ "pandeoro" → ¿Pan de oro?  [elegir producto]               │  │
│  └───────────────────────────────────────────────────────────────┘  │
│  [✓ Confirmar pedido]   [✗ Descartar]                               │
└────────────────────────────┬────────────────────────────────────────┘
                             │ POST /grandeza/order-requests
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│  TABLA DE PEDIDOS (5ª pestaña)                                      │
│  Filas = clientes que respondieron · Columnas = productos           │
│  Fila final = TOTAL por producto                                    │
│  [📤 Enviar a Producción]                                           │
└────────────────────────────┬────────────────────────────────────────┘
                             │ POST /grandeza/order-requests/dispatch
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│  MÓDULO DE PRODUCCIÓN                                               │
│  · GrandezaProductionUI.jsx ya consume /grandeza/production-estimate│
│  · PedidosProduccionUI.jsx ya consume /grandeza/orders              │
│  · Los pedidos confirmados aparecen como órdenes a fabricar         │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 4. DECISIONES DE DISEÑO

### 4.1 D-9: OCR con Tesseract (no multimodal)

| Opción | Ventaja | Desventaja | Veredicto |
|--------|---------|------------|-----------|
| **Tesseract + LLM** | Rápido, ligero, gratis, predecible | Requiere dependencia de sistema | ✅ **ELEGIDA** |
| LLaVA / Qwen-VL multimodal | Un solo paso | Muy lento en CPU (1-3 min/imagen), mucha RAM | ❌ Descartada |

**Justificación:** el OCR es un problema resuelto desde hace décadas y muy fiable en capturas nítidas. Separar OCR (extraer texto) de LLM (estructurar) hace el sistema **diagnosticable**: si falla, sabes si falló la lectura o la interpretación.

### 4.2 D-10: Match de cliente en cascada

El encabezado de WhatsApp muestra el nombre **tal como está en la agenda del administrador**, que puede ser "Panadería La Esperanza", "Juan el de la esquina" o un número.

| Prioridad | Método | Fiabilidad | Acción si falla |
|-----------|--------|------------|-----------------|
| 1 | Teléfono contra `grandeza_clients.phone` | Alta (único) | Pasar a 2 |
| 2 | Nombre exacto contra `grandeza_clients.name` | Alta | Pasar a 3 |
| 3 | Nombre difuso (Levenshtein ≤ 3) | Media | **Requiere confirmación** |
| 4 | Sin match | — | **El humano elige del dropdown** |

**El paso 4 es obligatorio.** Nunca dejar que la IA decida sola a qué cliente pertenece un pedido: un error ahí significa entregar el pedido equivocado.

### 4.3 D-11: La IA nunca llena la tabla sola

La IA produce una **propuesta** que se muestra en un panel de confirmación. El humano:
- Corrige cantidades.
- Resuelve productos ambiguos ("concha" blanca vs chocolate).
- Confirma o descarta.

Solo al pulsar **"✓ Confirmar pedido"** se escribe en la tabla. Esto respeta el contrato human-in-the-loop que ya gobierna todo el ERP ([`ai-local/app/main.py`](../ai-local/app/main.py) líneas 11-13).

### 4.4 D-12: Los clientes que no respondieron no entran

Confirmado por el usuario. La tabla solo contiene filas de clientes cuyo pedido fue **capturado y confirmado**. Esto evita que Producción fabrique piezas para clientes que no pidieron nada.

**Implicación:** la tabla NO se prellena con todos los destinatarios del mensaje. Se construye incrementalmente conforme se procesan capturas.

### 4.5 D-13: Zona horaria explícita en el corte

El "día y hora límite" es un **intento de negocio en hora local de México**, no un instante UTC. Se usa el helper `_now_mexico()` existente y la regla DT-01 (guardar UTC, mostrar local).

### 4.6 D-14: Reutilizar el shape de `production-estimate`

La tabla clientes × productos + totales es **exactamente** el shape que ya devuelve [`get_production_estimate()`](../apps/api/modules/grandeza/service.py:1002):

```python
{
  "clients": [ { "client_id", "client_name", "products": [ {product_id, product_name, estimated_qty} ] } ],
  "totals":  [ { "product_id", "product_name", "total_estimated" } ]
}
```

Se reutiliza el modelo de datos, el renderizado de la tabla y la lógica de totales. **La 5ª pestaña no es un módulo desde cero.**

---

## 5. MODELO DE DATOS

### 5.1 Tabla nueva: `grandeza_order_requests`

Almacena los pedidos capturados y confirmados.

| Columna | Tipo | Nulo | Descripción |
|---------|------|------|-------------|
| `id` | Integer PK | No | Identificador |
| `client_id` | Integer FK → `grandeza_clients.id` | No | Cliente que hizo el pedido |
| `delivery_date` | Date | No | Día de entrega |
| `order_deadline` | DateTime | Sí | Día/hora límite de entrada (UTC) |
| `selector_used` | String(30) | No | Selector que originó la ronda |
| `source` | String(20) | No | `OCR` \| `MANUAL` |
| `confidence` | Float | Sí | Confianza global de la propuesta (0-1) |
| `raw_ocr_text` | Text | Sí | Texto crudo del OCR (auditoría) |
| `screenshot_path` | String(255) | Sí | Ruta de la captura guardada |
| `status` | String(20) | No | `BORRADOR` \| `CONFIRMADO` \| `ENVIADO_PRODUCCION` |
| `created_at` | DateTime | No | UTC (DT-01) |
| `confirmed_at` | DateTime | Sí | UTC |
| `confirmed_by` | String(100) | Sí | Quién confirmó |

### 5.2 Tabla nueva: `grandeza_order_request_items`

Detalle de productos por pedido.

| Columna | Tipo | Nulo | Descripción |
|---------|------|------|-------------|
| `id` | Integer PK | No | Identificador |
| `request_id` | Integer FK → `grandeza_order_requests.id` | No | Pedido padre |
| `product_id` | Integer FK → `products.id` | No | Producto |
| `quantity` | Numeric(10,2) | No | Cantidad pedida |
| `match_confidence` | Float | Sí | Confianza del match producto (0-1) |
| `needs_review` | Boolean | No | `true` si el match fue dudoso |

### 5.3 Configuración persistida (reutiliza `grandeza_settings`)

Claves nuevas en la tabla `grandeza_settings` existente:

| Clave | Ejemplo | Descripción |
|-------|---------|-------------|
| `order_deadline_day` | `MIERCOLES` | Día límite de entrada |
| `order_deadline_time` | `18:00` | Hora límite de entrada |
| `order_delivery_day` | `JUEVES` | Día de entrega |
| `order_selector` | `TODOS` | Selector de clientes |

**Ventaja:** no se crea tabla de configuración nueva. Se reutiliza `upsert_setting()` existente.

---

## 6. CONTRATOS DE DATOS (SCHEMAS)

### 6.1 Motor de IA Local — `POST /ocr/extract-order`

**Request:**
```json
{
  "imagen_base64": "string",
  "productos_candidatos": ["Concha", "Bolillo", "Pan de elote"],
  "idioma": "spa"
}
```

**Response:**
```json
{
  "texto_crudo": "Panadería La Esperanza\n3 conchas\n2 bolillos",
  "cliente_hint": "Panadería La Esperanza",
  "telefono_hint": null,
  "items": [
    { "producto": "Concha", "cantidad": 3, "confianza": 0.92 },
    { "producto": "Bolillo", "cantidad": 2, "confianza": 0.88 }
  ],
  "confianza_global": 0.90,
  "requiere_revision": false,
  "errores": []
}
```

### 6.2 AI Gateway — `POST /ai/orders/parse-screenshot`

**Request:**
```json
{
  "imagen_base64": "string",
  "selector": "TODOS",
  "delivery_date": "2026-09-24"
}
```

**Response:** igual al del motor, más el match de cliente resuelto por el ERP:
```json
{
  "texto_crudo": "...",
  "cliente": {
    "client_id": 42,
    "client_name": "Panadería La Esperanza",
    "match_method": "TELEFONO",
    "match_confidence": 1.0
  },
  "items": [
    { "product_id": 118, "product_name": "Concha", "cantidad": 3, "needs_review": false }
  ],
  "confianza_global": 0.90,
  "requiere_revision": false
}
```

### 6.3 Grandeza — Endpoints nuevos

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/grandeza/order-requests/config` | Lee la configuración de la pestaña |
| `PUT` | `/grandeza/order-requests/config` | Guarda la configuración |
| `POST` | `/grandeza/order-requests` | Crea un pedido confirmado |
| `GET` | `/grandeza/order-requests` | Lista pedidos (filtro por fecha de entrega) |
| `GET` | `/grandeza/order-requests/matrix` | Devuelve la tabla clientes × productos + totales |
| `PATCH` | `/grandeza/order-requests/{id}` | Edita un pedido |
| `DELETE` | `/grandeza/order-requests/{id}` | Elimina un pedido |
| `POST` | `/grandeza/order-requests/dispatch` | Envía los pedidos confirmados a Producción |

---

## 7. ESTRUCTURA DE ARCHIVOS

### 7.1 Archivos NUEVOS

| Archivo | Propósito |
|---------|-----------|
| `ai-local/app/engines/ocr.py` | Motor OCR con Tesseract |
| `ai-local/app/engines/order_parser.py` | LLM: texto crudo → JSON de pedido |
| `apps/api/modules/grandeza/order_requests_service.py` | Lógica de pedidos y matriz |
| `apps/pos/GrandezaOrderRequestsTab.jsx` | Componente de la 5ª pestaña (extraído para no engordar `GrandezaParamsUI.jsx`) |

### 7.2 Archivos MODIFICADOS

| Archivo | Cambio |
|---------|--------|
| `ai-local/Dockerfile` | Añadir `tesseract-ocr` + `tesseract-ocr-spa` |
| `ai-local/app/main.py` | Registrar endpoint `POST /ocr/extract-order` |
| `ai-local/app/schemas.py` | Schemas `OcrExtractOrderRequest/Response` |
| `apps/api/modules/ai/schemas.py` | Schemas `ParseScreenshotRequest/Response` |
| `apps/api/modules/ai/service.py` | Función `parse_order_screenshot()` |
| `apps/api/modules/ai/router.py` | Endpoint `POST /orders/parse-screenshot` |
| `apps/api/modules/grandeza/models.py` | Modelos `GrandezaOrderRequest` + `GrandezaOrderRequestItem` |
| `apps/api/modules/grandeza/schemas.py` | Schemas de pedidos |
| `apps/api/modules/grandeza/service.py` | Métodos de pedidos y matriz |
| `apps/api/modules/grandeza/router.py` | 8 endpoints nuevos |
| `apps/api/main.py` | `CREATE TABLE` de las 2 tablas nuevas |
| `apps/pos/GrandezaParamsUI.jsx` | 5ª pestaña + import del componente nuevo |
| `ESPECIFICACIONES DEL PROYECTO/DOCUMENTACION_CENTRO_IA.md` | Nueva sección de OCR |
| `ESPECIFICACIONES DEL PROYECTO/DOCUMENTACION_MODULO_REPARTO_GRANDEZA.md` | Sección 18 |

---

## 8. FASES DE IMPLEMENTACIÓN

### FASE A — La tabla manual (SIN IA)

**Objetivo:** valor inmediato. El administrador captura pedidos a mano en la tabla.

| # | Tarea | Archivo |
|---|-------|---------|
| A1 | Modelos `GrandezaOrderRequest` + `GrandezaOrderRequestItem` | `models.py` |
| A2 | `CREATE TABLE` en el arranque | `main.py` |
| A3 | Schemas de pedidos | `schemas.py` |
| A4 | Servicio: CRUD + `get_order_matrix()` | `service.py` |
| A5 | 7 endpoints (sin `dispatch`) | `router.py` |
| A6 | Componente `GrandezaOrderRequestsTab.jsx` | nuevo |
| A7 | 5ª pestaña en `GrandezaParamsUI.jsx` | `GrandezaParamsUI.jsx` |
| A8 | Config: día/hora límite + día entrega + selector | componente |
| A9 | Tabla editable clientes × productos + totales | componente |
| A10 | Verificar build + commit | — |

**Entregable:** pestaña funcional con captura manual. Sirve el jueves.

### FASE B — Captura con OCR + LLM

**Objetivo:** subir una captura y que la IA proponga la fila.

| # | Tarea | Archivo |
|---|-------|---------|
| B1 | `tesseract-ocr` + `tesseract-ocr-spa` en el Dockerfile | `ai-local/Dockerfile` |
| B2 | Motor OCR `extraer_texto()` | `ai-local/app/engines/ocr.py` |
| B3 | Parser LLM `parsear_pedido()` | `ai-local/app/engines/order_parser.py` |
| B4 | Schemas + endpoint `POST /ocr/extract-order` | `ai-local/app/` |
| B5 | Schemas + servicio + endpoint en el Gateway | `apps/api/modules/ai/` |
| B6 | Match de cliente en cascada | `service.py` |
| B7 | Match de producto contra catálogo | `service.py` |
| B8 | Botón "📷 Subir captura" | componente |
| B9 | Panel de confirmación con edición | componente |
| B10 | Verificar build + commit | — |

**Entregable:** captura asistida por IA con confirmación humana.

### FASE C — Integración con Producción

**Objetivo:** que Producción vea los pedidos confirmados.

| # | Tarea | Archivo |
|---|-------|---------|
| C1 | Endpoint `POST /order-requests/dispatch` | `router.py` |
| C2 | Materializar pedidos como órdenes de producción | `service.py` |
| C3 | Botón "📤 Enviar a Producción" | componente |
| C4 | Verificar que `PedidosProduccionUI.jsx` los ve | — |
| C5 | Verificar build + commit | — |

**Entregable:** ciclo completo cerrado.

### FASE D — Refinamiento (opcional)

| # | Tarea |
|---|-------|
| D1 | Match difuso de nombres (Levenshtein) |
| D2 | Aprendizaje de correcciones frecuentes |
| D3 | Dictado por voz con Whisper (ya instalado) |

---

## 9. CAMBIOS EN EL CENTRO DE IA

El Centro de IA ([`DOCUMENTACION_CENTRO_IA.md`](../ESPECIFICACIONES%20DEL%20PROYECTO/DOCUMENTACION_CENTRO_IA.md)) documenta las capacidades de IA del ERP. Esta funcionalidad añade una **cuarta capacidad**.

### 9.1 Nueva capacidad: OCR de pedidos

| Pestaña | Capacidad | Motor | Qué hace |
|---------|-----------|-------|----------|
| 📊 Estado del Motor | Diagnóstico | — | Muestra si la IA está disponible |
| 👁️ Visión | Conteo | YOLOv8 | Cuenta objetos en una imagen |
| 🎤 Voz | Transcripción | Whisper | Audio → texto |
| 🧠 NLU | Interpretación | Ollama | Texto → intención JSON |
| **📄 OCR de Pedidos** | **Extracción** | **Tesseract + Ollama** | **Captura → pedido estructurado** |

### 9.2 Sección nueva en la documentación

Añadir a `DOCUMENTACION_CENTRO_IA.md`:

- **Sección 28 — OCR de Pedidos (v27.0)**
  - 28.1 Problema que resuelve
  - 28.2 Arquitectura del pipeline OCR + LLM
  - 28.3 Por qué Tesseract y no multimodal
  - 28.4 Contratos de datos
  - 28.5 Configuración y despliegue
  - 28.6 Límites y advertencias
  - 28.7 Archivos involucrados

### 9.3 Actualización del estado del motor

El endpoint `GET /status` del motor debe reportar `ocr_disponible: true/false`, igual que ya reporta `whisper_cargado`, `yolo_cargado` y `ollama_disponible` ([`ai-local/app/main.py`](../ai-local/app/main.py:35)).

### 9.4 Variable de entorno nueva

| Variable | Default | Descripción |
|----------|---------|-------------|
| `OCR_LANG` | `spa` | Idioma de Tesseract |
| `OCR_ENABLED` | `true` | Permite apagar el OCR sin desplegar código |

---

## 10. RIESGOS Y MITIGACIONES

| # | Riesgo | Probabilidad | Impacto | Mitigación |
|---|--------|--------------|---------|------------|
| R-1 | OCR falla en capturas borrosas | Alta | Medio | Mensaje claro: *"No pude leer la imagen, intenta con una captura más nítida"*. Nunca inventar datos |
| R-2 | Producto ambiguo ("concha" blanca vs chocolate) | Alta | Medio | Marcar `needs_review` y resaltar en ámbar. El humano elige |
| R-3 | LLM alucina cantidades | Media | Alto | Si no hay número, devolver `cantidad: null`. El humano la pone |
| R-4 | Cliente mal identificado | Media | **Crítico** | Match en cascada + confirmación humana obligatoria (D-10) |
| R-5 | Tesseract no disponible en el contenedor | Baja | Medio | `OCR_ENABLED=false` degrada a captura manual (Fase A) |
| R-6 | El motor de IA está caído | Media | Bajo | El Gateway devuelve 503 y la UI muestra "modo manual". La Fase A sigue funcionando |
| R-7 | Consumo de RAM del OCR | Baja | Medio | Tesseract es ligero. El `mem_limit: 6g` existente es suficiente |
| R-8 | El administrador confía ciegamente en la IA | Media | Alto | La UI **exige** revisión cuando `requiere_revision=true`. No hay botón "aceptar todo" |

---

## 11. CRITERIOS DE ACEPTACIÓN

### Fase A
- [ ] La 5ª pestaña aparece en `GrandezaParamsUI.jsx` y es responsiva en móvil.
- [ ] Se puede configurar día/hora límite, día de entrega y selector.
- [ ] Se puede añadir un pedido manualmente (cliente + productos + cantidades).
- [ ] La tabla muestra filas = clientes, columnas = productos, fila final = totales.
- [ ] Los totales se recalculan al editar cualquier celda.
- [ ] Los clientes que no respondieron NO aparecen.
- [ ] `npm run build` exit 0.

### Fase B
- [ ] Se puede subir una captura de pantalla.
- [ ] El OCR extrae el texto correctamente en una captura nítida.
- [ ] El LLM estructura el pedido en JSON válido.
- [ ] El cliente se identifica por teléfono o nombre.
- [ ] Si el match es dudoso, se pide confirmación.
- [ ] El panel de confirmación permite editar antes de aceptar.
- [ ] Si el motor de IA está caído, la UI muestra "modo manual" sin romperse.
- [ ] `npm run build` exit 0.

### Fase C
- [ ] El botón "📤 Enviar a Producción" materializa los pedidos.
- [ ] `PedidosProduccionUI.jsx` muestra los pedidos enviados.
- [ ] El estado del pedido cambia a `ENVIADO_PRODUCCION`.
- [ ] `npm run build` exit 0.

---

## 12. ADVERTENCIAS PARA FUTURAS IAs

1. **NO intentes leer WhatsApp directamente.** Viola los ToS de Meta y banea el número. Ver §1.2.
2. **NO uses YOLO para leer texto.** YOLO cuenta objetos, no transcribe. Ver §1.3.
3. **NO dejes que la IA escriba en la tabla sin confirmación humana.** Ver D-11.
4. **NO prellenes la tabla con clientes que no respondieron.** Ver D-4.
5. **NO uses `datetime.now()`.** Usa `_now_mexico()` (regla DT-01).
6. **NO olvides `selectinload`** en las consultas async (regla §7.6 de la documentación de Grandeza).
7. **NO asumas que `create_all` altera tablas existentes.** Hay que hacer `CREATE TABLE` explícito (regla §7.7).
8. **NO modifiques el POS** para arreglar Grandeza (regla §7.1).

---

## 13. HISTORIAL DE VERSIONES

| Versión | Fecha | Cambio |
|---------|-------|--------|
| V1 | 22/Sep/2026 | Plan inicial. Ruta A (OCR + LLM). 4 fases. |

---

**FIN DEL PLAN**
