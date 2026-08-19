# 📊 DOCUMENTACIÓN — MÓDULO DE ESTADÍSTICAS DE VENTAS

> **Versión:** 2.1.0  
> **Última actualización:** 18 de agosto de 2026  
> **Autor:** Sistema de IA / Arquitectura R de Rico  
> **Estado:** ✅ Dashboard + KPIs + Estadística de Productos + 12 mejoras críticas implementadas

---

## 📑 ÍNDICE

1. [Visión General](#1-visión-general)
2. [Arquitectura del Módulo](#2-arquitectura-del-módulo)
3. [Estructura de Archivos](#3-estructura-de-archivos)
4. [Vistas del Módulo](#4-vistas-del-módulo)
5. [Estadística de Productos — Diseño Detallado](#5-estadística-de-productos--diseño-detallado)
6. [API — Endpoints](#6-api--endpoints)
7. [Lógica de Negocio del Backend](#7-lógica-de-negocio-del-backend)
8. [El Cementerio de Bugs](#8-el-cementerio-de-bugs)
9. [Reglas de Oro del Módulo](#9-reglas-de-oro-del-módulo)
10. [Archivos Críticos — Mapa de Zona](#10-archivos-críticos--mapa-de-zona)
11. [Auditoría de Mejoras v2.1](#11-auditoría-de-mejoras-v21)

---

## 1. VISIÓN GENERAL

El módulo de Estadísticas de Ventas es el **centro de inteligencia comercial** de R de Rico. Permite al Socio Fundador y gerentes visualizar el rendimiento de ventas a través de dashboards personalizables, KPIs en tiempo real y análisis granular producto por producto.

### Objetivos del módulo

- **Visualizar** métricas clave de ventas (ingreso, volumen, margen, ticket promedio)
- **Analizar** tendencias cronológicas por día, semana y periodo personalizado
- **Comparar** rendimiento entre productos, categorías y periodos
- **Detectar** productos de bajo margen y oportunidades de mejora
- **Personalizar** dashboards con secciones configurables y persistentes

### Principios de diseño

| Principio | Implementación |
|---|---|
| **Solo lectura** | El módulo NUNCA escribe en la base de datos. Solo ejecuta `SELECT` |
| **Zero dependencies** | Gráficos dibujados en SVG/CSS puro — sin Chart.js, Recharts ni librerías externas |
| **Persistencia local** | La configuración del dashboard se guarda en `localStorage` del navegador |
| **Privacidad financiera** | Toggle "Cifras Visibles/Ocultas" controlado por permisos granulares |
| **Zona horaria correcta** | Backend usa `datetime.now(MEXICO_TZ)`, Frontend usa `Intl.DateTimeFormat` con `America/Mexico_City` |

---

## 2. ARQUITECTURA DEL MÓDULO

```
┌──────────────────────────────────────────────────────────────────┐
│                   EstadisticasVentasUI.jsx                       │
│                  (Componente Raíz del Módulo)                    │
│                                                                  │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────────┐  │
│  │  Dashboard   │  │ KPIs Ventas  │  │ Estadística Productos  │  │
│  │  (tab 1)     │  │  (tab 2)     │  │ (tab 3 — v2.0)        │  │
│  └──────┬──────┘  └──────┬───────┘  └────────────┬───────────┘  │
│         │                │                        │              │
│  Secciones         SalesKPIsView          ProductStatsView.jsx   │
│  configurables     (inline)               (componente separado)  │
│  en localStorage                                  │              │
│                                           ┌───────┴────────┐    │
│                                           │ StockChartModal │    │
│                                           │ (gráfico SVG)   │    │
│                                           └────────────────┘    │
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │              Gestor de Dashboard (vista manager)           │  │
│  │  Presets rápidos + Editor de secciones + Reordenamiento   │  │
│  └───────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
                              │
                       FastAPI Backend
                              │
                ┌─────────────┼──────────────┐
                │             │              │
           ┌────▼────┐  ┌────▼────┐  ┌──────▼──────┐
           │ router  │  │ service │  │   models    │
           │ (.py)   │  │ (.py)   │  │   (.py)     │
           └────┬────┘  └────┬────┘  └──────┬──────┘
                │            │               │
                └────────────┼───────────────┘
                             │
                      PostgreSQL (solo SELECT)
                      Tablas: tickets, ticket_items,
                      products, categories, daily_context
```

### Patrón de comunicación

```
Frontend (React)
    ↓ fetch()
EstadisticasVentasUI / ProductStatsView
    ↓ HTTP GET
router.py (FastAPI endpoints)
    ↓ await
service.py (queries SQL + procesamiento)
    ↓ SQLAlchemy async
PostgreSQL (tickets + ticket_items + products)
```

---

## 3. ESTRUCTURA DE ARCHIVOS

### Backend (`apps/api/modules/analytics/`)

| Archivo | Líneas | Función |
|---|---|---|
| `models.py` | ~25 | Modelo `DailyContext` (eventualidades: lluvia, festivo, atípico) |
| `schemas.py` | ~43 | Modelos Pydantic: `DailyContextCreate`, `TopProductRead`, `CustomQueryPayload` |
| `service.py` | ~440 | 5 funciones de servicio (rankings, tickets, time series, custom query, product daily sales) + consulta de días atípicos |
| `router.py` | ~95 | 4 endpoints REST (`/context`, `/rankings`, `/query`, `/product-daily-sales`) — usa constante `MEXICO_TZ` |

### Frontend (`apps/analytics/`)

| Archivo | Líneas | Función |
|---|---|---|
| `EstadisticasVentasUI.jsx` | ~953 | Componente raíz: header con tabs, dashboard configurable, KPIs, gestor de secciones |
| `ProductStatsView.jsx` | ~645 | Tab de Estadística de Productos: tabla scrollable, filtros inteligentes, gráfico bursátil con zoom |
| `analyticsConfig.js` | ~108 | Constantes, paletas de colores, presets, funciones utilitarias puras (extraído de EstadisticasVentasUI en v2.1) |

---

## 4. VISTAS DEL MÓDULO

### 4.1 Dashboard (Tab 1 — Predeterminado)

Dashboard completamente personalizable con secciones configurables:

- **Tipos de gráfico:** Barras horizontales, barras verticales, circular, donut, tabla, lista, tarjeta KPI
- **Parámetros de datos:** Ingresos brutos, volumen, margen absoluto, margen %, costo acumulado, precio promedio, tendencia por día
- **Paletas de color:** Vibrante, Océano, Atardecer, Bosque, Monocromático, Royal
- **Tamaños:** Tercio, medio, completo
- **Temporalidades:** 7d, 14d, 30d, 60d, 90d, 6 meses, 1 año
- **Presets rápidos:** 9 configuraciones predefinidas (Top 10 Ingresos, Top 10 Volumen, Categorías, etc.)
- **Persistencia:** Configuración guardada en `localStorage` bajo la clave `rderico_sales_dashboard_v2`

### 4.2 KPIs de Ventas (Tab 2)

Vista fija con análisis consolidado:

- **4 tarjetas KPI:** Ingreso bruto total, volumen desplazado, ticket promedio, margen promedio
- **Top 10 por Ingresos:** Barras horizontales con montos
- **Distribución por Categoría:** Gráfico donut con leyenda
- **Top 10 por Volumen:** Lista con barras de progreso
- **Productos con Menor Margen:** Alertas con indicadores de color (rojo <20%, ámbar <35%, verde ≥35%)
- **Ventas Diarias:** Gráfico de barras cronológico con tooltip de revenue y unidades
- **Selector de rango:** Modal para elegir fecha inicio/fin personalizada

### 4.3 Estadística de Productos (Tab 3 — v2.0)

Análisis granular producto × día. Documentado en detalle en la [Sección 5](#5-estadística-de-productos--diseño-detallado).

### 4.4 Gestor de Dashboard (Vista Manager)

Accesible desde el botón "Gestionar Dashboard de Ventas":

- **Presets rápidos:** 9 botones para agregar secciones predefinidas con un clic
- **Lista de secciones:** Editar, duplicar, eliminar, reordenar (con flechas arriba/abajo)
- **Editor modal:** Formulario completo para configurar título, parámetro, tipo de gráfico, orden, límite, temporalidad, tamaño, paleta de colores — con vista previa en tiempo real

---

## 5. ESTADÍSTICA DE PRODUCTOS — DISEÑO DETALLADO

### 5.1 Concepto

Una **heatmap de ventas por producto × día** con un sistema de filtrado inteligente por día de la semana. Permite responder preguntas como:
- "¿Cuántas conchas se venden los martes?"
- "¿Cómo han evolucionado las ventas de bolillo los últimos 8 lunes?"
- "¿Qué productos tienen demanda inconsistente?"

### 5.2 Componentes de la UI

#### Barra de Filtros (Progressive Disclosure)

```
┌──────────────────────────────────────────────────────────────────────┐
│  Día: [Todos] [Lun] [Mar✓] [Mié] [Jue] [Vie] [Sáb] [Dom]          │
│  Mostrando: Martes  Alcance: [Todos] [Últ 4✓] [Últ 8] [Últ 12]    │
│                                                    📅 vs. Año Ant.  │
│                                    🔍 Buscar...  [Categoría ▼]      │
└──────────────────────────────────────────────────────────────────────┘
```

**Nivel 1 — Selector de Día (siempre visible):**
- Pills horizontales: `Todos | Lun | Mar | Mié | Jue | Vie | Sáb | Dom`
- `Todos` = muestra todas las fechas del rango
- Día específico = filtra solo ese día de la semana

**Nivel 2 — Alcance (aparece SOLO al elegir un día específico):**
- `Todos` = todas las ocurrencias de ese día en el rango
- `Últ 4 | Últ 8 | Últ 12` = limita a las últimas N ocurrencias

**Nivel 3 — Comparativa interanual:**
- Toggle `📅 vs. Año Anterior` que solicita datos del mismo rango del año pasado

**Controles adicionales:**
- Búsqueda por nombre de producto (filtro instantáneo)
- Dropdown de categorías (filtra la tabla)

#### Tabla Scrollable

```
┌──────────────┬─────────┬──────────┬──────────┬──────────┐
│ Producto     │Promedio │Mar 05/08 │Mar 12/08 │Mar 19/08 │  ←scroll
├──────────────┼─────────┼──────────┼──────────┼──────────┤
│ 🔗 Concha    │   45    │    38    │    52    │    48    │
│ 🔗 Bolillo   │   120   │   105    │   130    │   125    │
└──────────────┴─────────┴──────────┴──────────┴──────────┘
```

- **Columnas fijas (sticky):** #, Producto (clickable), Promedio
- **Columnas dinámicas:** Una por cada fecha, con scroll horizontal
- **Heatmap visual:** Celdas coloreadas según intensidad de venta (verde = alto, ámbar = medio, gris = nulo)
- **Promedio:** Calculado solo sobre días que SÍ tuvieron venta (no distorsiona productos intermitentes)
- **Ordenamiento:** Por promedio descendente (más vendidos arriba)

#### Gráfico Bursátil (Modal)

Al hacer clic en el nombre de un producto, se abre un modal con un gráfico SVG puro estilo TradingView:

- **Eje X:** Fechas cronológicas
- **Eje Y:** Piezas vendidas
- **Línea principal (azul):** Ventas diarias reales
- **Área con gradiente:** Relleno semitransparente bajo la línea
- **Promedio móvil 7d (púrpura punteada):** Suaviza la tendencia
- **Línea de promedio general (ámbar punteada):** Referencia visual
- **Puntos interactivos:** Tooltip con fecha y cantidad al hacer hover
- **4 KPIs en el header:** Promedio diario, Máximo, Mínimo, Tendencia (%)
- **Indicador de tendencia:** Compara primera mitad vs segunda mitad del periodo

### 5.3 Flujo de Datos

```
1. Usuario abre tab "Estadística de Productos"
2. Frontend calcula rango de fechas (del period del dashboard o fallback 30 días)
   → Fecha "hoy" forzada a zona horaria America/Mexico_City (Regla 4.6)
3. GET /analytics/product-daily-sales?start=...&end=...&weekday=...&last_n=...
4. Backend ejecuta:
   SELECT product_id, product_name, category_name, DATE(created_at), SUM(quantity)
   FROM products JOIN ticket_items JOIN tickets
   WHERE status='PAID' AND date BETWEEN start AND end
   GROUP BY product_id, DATE(created_at)
5. Python filtra por weekday (si aplica), limita a last_n fechas, calcula promedios
6. Frontend renderiza tabla con heatmap + filtros
7. Usuario hace clic en producto → Modal con gráfico SVG bursátil
```

---

## 6. API — ENDPOINTS

### `GET /api/v1/analytics/rankings`

Endpoint principal del dashboard y KPIs.

| Parámetro | Tipo | Default | Descripción |
|---|---|---|---|
| `days` | int | 30 | Días hacia atrás |
| `start` | date | null | Fecha inicio (prevalece sobre `days`) |
| `end` | date | null | Fecha fin |

**Respuesta:**
```json
{
  "period": {"start": "2026-07-19", "end": "2026-08-18"},
  "top_volume": [...],
  "bottom_volume": [...],
  "top_margin": [...],
  "bottom_margin": [...],
  "ticket_metrics": {"total_tickets": 4520},
  "time_series_metrics": {
    "by_date": [{"date": "2026-08-01", "revenue": 15420.0, "quantity": 832}],
    "by_hour": [{"hour": 8, "revenue": 3200.0}]
  },
  "all": [...]
}
```

### `GET /api/v1/analytics/product-daily-sales`

Endpoint de la tabla de Estadística de Productos (v2.0).

| Parámetro | Tipo | Default | Descripción |
|---|---|---|---|
| `start` | date | **requerido** | Fecha inicio |
| `end` | date | **requerido** | Fecha fin |
| `weekday` | int | null | 0=Lunes ... 6=Domingo |
| `last_n` | int | null | Últimas N ocurrencias |
| `include_prev_year` | bool | false | Incluir datos del año anterior |

**Respuesta:**
```json
{
  "dates": ["2026-08-05", "2026-08-12", "2026-08-19"],
  "products": [
    {
      "product_id": 42,
      "product_name": "CONCHA BLANCA",
      "category_name": "3.-C - D",
      "daily_sales": {"2026-08-05": 38, "2026-08-12": 52, "2026-08-19": 48},
      "average": 46.0
    }
  ],
  "prev_year": null
}
```

### `GET /api/v1/analytics/context`

Obtiene el contexto de eventualidades para un día (lluvia, festivo, atípico).

### `PUT /api/v1/analytics/context`

Actualiza el contexto de eventualidades.

### `POST /api/v1/analytics/query`

Motor de consultas personalizadas con filtros avanzados (productos, categorías, días de la semana, exclusión de días atípicos).

---

## 7. LÓGICA DE NEGOCIO DEL BACKEND

### 7.1 `get_product_rankings()`
- JOIN: `products → ticket_items → tickets → categories`
- Filtro: `tickets.status = 'PAID'` + rango de fechas
- Calcula: margen absoluto y porcentual a partir de `price` y `cost` del producto
- Ordena: por múltiples métricas para generar tops/bottoms

### 7.2 `get_ticket_metrics()`
- `COUNT(DISTINCT ticket.id)` para obtener total de tickets únicos en el periodo

### 7.3 `get_time_series_metrics()`
- **Por fecha exacta:** `GROUP BY DATE(created_at)` → gráfico cronológico
- **Por hora del día:** `GROUP BY EXTRACT(hour FROM created_at)` → distribución horaria

### 7.4 `get_product_daily_sales()` (v2.0)
- Query: `GROUP BY product_id, DATE(created_at)` sobre tickets PAID
- **Filtro weekday:** Post-procesamiento en Python (`date_obj.weekday() != weekday`)
- **Filtro last_n:** Toma solo las últimas N fechas del set ordenado
- **Promedio:** Calculado sobre días con venta > 0 (no distorsiona productos intermitentes)
- **Año anterior:** Segundo query con rango desplazado -1 año

### 7.5 `execute_custom_query()`
- Query flexible con filtros por producto, categoría, día de semana
- Soporte para excluir días atípicos (tabla `daily_context`)
- Re-enfoque: carga raw tickets y agrega en Python para compatibilidad

---

## 8. EL CEMENTERIO DE BUGS

### Incidente: Desfase de Fecha UTC vs México CST (Agosto 2026)

**Síntoma:** El gráfico de "Ventas Diarias" y la tabla de Estadística de Productos mostraban datos del día 19 de agosto cuando en México aún era 18 de agosto (22:49 PM CST).

**Causa raíz:**
1. **Backend:** `date.today()` en el router de analytics devolvía la fecha del sistema del contenedor Docker, que opera en UTC. A las 22:49 CST (UTC-6), UTC ya es 04:49 del día siguiente.
2. **Frontend:** `new Date().toISOString().split('T')[0]` en el cálculo de fechas fallback también devolvía la fecha UTC.

**Investigación forense:**
```
Hora real en Toluca, México:     18/Ago/2026 22:49 PM CST (UTC-6)
Hora del contenedor Docker (UTC): 19/Ago/2026 04:49 AM UTC
date.today() en Python (Docker):  2026-08-19 ← ¡DÍA INCORRECTO!
new Date().toISOString() en JS:   2026-08-19T04:49:00.000Z ← ¡DÍA INCORRECTO!
```

**Solución implementada (vigente hoy):**

| Capa | Antes (bug) | Después (fix) |
|---|---|---|
| Backend `router.py` | `date.today()` | `datetime.now(MEXICO_TZ).date()` donde `MEXICO_TZ = timezone(timedelta(hours=-6))` |
| Frontend `ProductStatsView.jsx` | `new Date().toISOString().split('T')[0]` | `Intl.DateTimeFormat('en-CA', {timeZone: 'America/Mexico_City'}).format(new Date())` |

**Referencia:** Regla 4.6 del Contexto Maestro del Sistema:
> **Backend:** Está estrictamente prohibido el uso de `datetime.utcnow()`. Utiliza exclusivamente `datetime.now()`.
> **Frontend:** Siempre que el dispositivo deba calcular "Hoy", se debe forzar explícitamente la zona horaria `America/Mexico_City`.

**Nota sobre DST:** México eliminó el horario de verano en 2022 para la mayor parte del territorio (incluida Toluca). La constante `UTC-6` es correcta y estable para la operación actual. Si en el futuro se legislara un cambio, se deberá actualizar la constante `MEXICO_TZ` en el router.

> ⚠️ **REGLA DERIVADA:** Todo nuevo módulo o endpoint que necesite calcular "la fecha de hoy" en el backend **DEBE** usar `datetime.now(MEXICO_TZ).date()`, NUNCA `date.today()` ni `datetime.utcnow()`. En el frontend, siempre usar `Intl.DateTimeFormat` con `timeZone: 'America/Mexico_City'`.

---

## 9. REGLAS DE ORO DEL MÓDULO

### 9.1 Solo Lectura — Prohibición Absoluta de Escritura

Este módulo **JAMÁS** debe ejecutar `INSERT`, `UPDATE` ni `DELETE` sobre las tablas de ventas, productos o tickets. Su única interacción con la base de datos es `SELECT`. La única excepción es la tabla `daily_context` (eventualidades), que es propiedad exclusiva de este módulo.

### 9.2 Sin Librerías de Gráficos Externas

Todos los gráficos (barras, donut, pie, área bursátil) están dibujados en **SVG puro y CSS**. Esto mantiene el bundle ligero, evita conflictos de dependencias, y garantiza que los monitores táctiles de las terminales no carguen librerías pesadas innecesariamente.

### 9.3 Zona Horaria México (Regla 4.6)

- **Backend:** `datetime.now(MEXICO_TZ).date()` — NUNCA `date.today()` ni `datetime.utcnow()`
- **Frontend:** `Intl.DateTimeFormat('en-CA', {timeZone: 'America/Mexico_City'})` — NUNCA `toISOString()`

### 9.4 Privacidad Financiera

Las cifras monetarias solo se muestran si el usuario tiene el permiso `analytics_financial_data` o `all: 'full'`. Sin permiso, todas las cifras se reemplazan por `•••`. El toggle "Cifras Visibles / Cifras Ocultas" respeta este control.

### 9.5 Persistencia del Dashboard en localStorage

La configuración del dashboard (secciones, orden, tipos de gráfico) se guarda en `localStorage` bajo la clave `rderico_sales_dashboard_v2`. Si se borra el localStorage del navegador, el dashboard se restaura con las 6 secciones por defecto (3 KPI cards + Top 10 + Donut + Lista).

### 9.6 Promedio de Ventas — Solo Días con Venta

El promedio diario de un producto se calcula **excluyendo los días con 0 ventas**. Esto evita distorsionar productos que solo se venden ciertos días (ejemplo: Pan de Muerto solo en temporada). La fórmula es:

```
promedio = sum(ventas_días_con_venta) / count(días_con_venta)
```

No:
```
promedio = sum(ventas_todos_los_días) / count(todos_los_días)  ← INCORRECTO
```

---

## 10. ARCHIVOS CRÍTICOS — MAPA DE ZONA

| Archivo | Criticidad | Notas |
|---|---|---|
| `apps/analytics/EstadisticasVentasUI.jsx` | 🟡 Media | Componente raíz (~953 lín). Modificar con cuidado al agregar tabs |
| `apps/analytics/ProductStatsView.jsx` | 🟢 Baja | Componente aislado (~645 lín). Seguro de modificar |
| `apps/analytics/analyticsConfig.js` | 🟢 Baja | Constantes y utilidades puras (~108 lín). Seguro de modificar |
| `apps/api/modules/analytics/router.py` | 🟡 Media | Contiene la constante `MEXICO_TZ`. No cambiar sin razón |
| `apps/api/modules/analytics/service.py` | 🟡 Media | Queries SQL complejas. Filtro weekday en SQL via `EXTRACT(DOW)` |
| `apps/api/modules/analytics/models.py` | 🟢 Baja | Solo `DailyContext`. Rara vez cambia |
| `apps/api/modules/analytics/schemas.py` | 🟢 Baja | Validaciones Pydantic |

---

## 11. AUDITORÍA DE MEJORAS v2.1

> Fecha: 18 de agosto de 2026  
> Proceso: Análisis crítico de 12 puntos identificados → corrección total

Se realizó una revisión exhaustiva del módulo identificando 12 problemas concretos agrupados por severidad. Todos fueron resueltos en una sola sesión sin romper funcionalidad existente.

### 11.1 Problemas Resueltos

| # | Problema | Severidad | Solución Implementada |
|---|---|---|---|
| **1** | Query `product-daily-sales` sin paginación | 🟡 Media | Mitigado con smart fetch client-side: un solo request, filtrado en JS |
| **2** | Filtro de día de semana se hacía en Python post-query | 🟡 Media | Movido a SQL con `EXTRACT(DOW FROM created_at)`. Conversión Python→PostgreSQL DOW: `(weekday+1)%7` |
| **3** | Columnas sticky con `left` hardcodeados en px | 🟡 Media | Reemplazado con constantes `COL_NUM_W=44`, `COL_PROD_W=200`, `COL_AVG_W=72` y `style={{left, width, minWidth}}` calculados |
| **4** | Toggle "vs. Año Anterior" visible pero no renderiza datos | 🔴 Alta | Oculto con comentario `TODO` hasta implementar renderización de columnas comparativas |
| **5** | `from datetime import` dentro de un `for` loop | 🟢 Baja | Movido al top del archivo `service.py` como `from datetime import date, datetime as dt_cls, timedelta` |
| **6** | `date.replace(year=year-1)` explota el 29 de febrero | 🟡 Media | Creada función `_safe_prev_year(d)` con `try/except ValueError` → fallback a día 28 |
| **7** | Variable `productMax` calculada pero nunca usada | 🟢 Baja | Eliminada |
| **8** | Archivo `EstadisticasVentasUI.jsx` con 1,062 líneas | 🟢 Baja | Extraídas constantes y funciones utilitarias a `analyticsConfig.js` (108 lín). Archivo principal reducido a 953 líneas |
| **9** | Sin exportación a CSV | 🔵 Feature | Agregado botón "📥 Exportar CSV" que genera archivo client-side con BOM UTF-8 para Excel |
| **10** | Sin distinción "tienda cerrada" vs "sin ventas" | 🔵 Feature | Backend consulta `daily_contexts` y devuelve `atypical_dates`. Frontend muestra celdas rayadas con `✕` y tooltip `⚠️` para días atípicos |
| **11** | Gráfico bursátil sin zoom ni navegación | 🔵 Feature | Agregados controles zoom +/−, pan ←/→, botón 1:1, y mini-chart overview con ventana de selección visible |
| **12** | Cada cambio de filtro disparaba un fetch al servidor | 🔵 Mejora | Smart fetch: un solo request al montar el componente, filtrado de día/alcance 100% en JS via `useMemo` |

### 11.2 Dependencia Eliminada

- Se eliminó el `from dateutil.relativedelta import relativedelta` que estaba dentro de un `try/except` genérico. La librería `dateutil` **no está instalada** en el contenedor Docker, por lo que siempre ejecutaba el fallback. Se reemplazó con `_safe_prev_year()` que es autosuficiente.

### 11.3 Refactoring Estructural

**Antes (v2.0):**
```
apps/analytics/
├── EstadisticasVentasUI.jsx    (1,062 líneas) — TODO junto
└── ProductStatsView.jsx        (530 líneas)
```

**Después (v2.1):**
```
apps/analytics/
├── analyticsConfig.js          (108 lín) — Constantes, paletas, presets, utilidades puras
├── EstadisticasVentasUI.jsx    (953 lín) — Componentes React: Dashboard + KPIs + Widgets + Editor
└── ProductStatsView.jsx        (645 lín) — Tabla + Filtros inteligentes + Gráfico con zoom
```

### 11.4 Nuevas Capacidades del Gráfico Bursátil (v2.1)

| Control | Función | Implementación |
|---|---|---|
| **+** (Zoom in) | Reduce la ventana visible al 60% centrado | Ajusta `viewStart`/`viewEnd` |
| **−** (Zoom out) | Amplía la ventana visible un 25% por lado | Limita a `[0, allDataPoints.length-1]` |
| **1:1** | Resetea al rango completo | `viewStart=0`, `viewEnd=length-1` |
| **←** (Pan izq) | Desplaza la ventana 30% hacia atrás | Mantiene el ancho de ventana constante |
| **→** (Pan der) | Desplaza la ventana 30% hacia adelante | Mantiene el ancho de ventana constante |
| **Mini overview** | Muestra el dataset completo con la ventana actual resaltada | SVG separado con rectángulos de dimming |

Los KPIs (Promedio, Máximo, Mínimo, Tendencia) se **recalculan dinámicamente** para reflejar solo el rango visible.

### 11.5 Smart Fetch — Arquitectura de Datos

```
┌─ Servidor (1 request) ─────────────────────────────┐
│  GET /product-daily-sales?start=...&end=...         │
│  → Devuelve TODOS los días y TODOS los productos    │
│  → Incluye atypical_dates del rango                 │
└────────────────────────┬────────────────────────────┘
                         │ rawData (useState)
                         ▼
┌─ Cliente (useMemo, 0ms) ────────────────────────────┐
│  1. Filtrar fechas por día de semana (getDay)        │
│  2. Aplicar last_n (slice últimas N fechas)          │
│  3. Recalcular daily_sales por producto filtrado     │
│  4. Recalcular promedios (solo días con venta > 0)   │
│  5. Reordenar por promedio descendente               │
│  → data (useMemo derivado)                           │
└────────────────────────┬────────────────────────────┘
                         │
                         ▼
┌─ Cliente (useMemo, 0ms) ────────────────────────────┐
│  6. Filtrar por categoría (dropdown)                 │
│  7. Filtrar por búsqueda (texto)                     │
│  → filteredProducts (renderizado)                    │
└─────────────────────────────────────────────────────┘
```

**Resultado:** Cambiar de "Todos los días" a "Solo Martes" o ajustar el alcance a "Últimos 4" es **instantáneo** (0ms, sin spinner de carga, sin request al servidor).

