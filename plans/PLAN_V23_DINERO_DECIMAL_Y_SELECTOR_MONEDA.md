# PLAN V23 — DINERO EN DECIMAL Y SELECTOR DE MONEDA

**Estado:** 📋 **PLANIFICADO — NO EJECUTADO**
**Fecha:** 2026-09-22
**Alcance:** ERP que corre (`ERP-R-DE-RICO`) — **NO** el repo de planos del nuevo POS
**Riesgo:** 🔴 **ALTO** (toca columnas monetarias con datos reales en producción)
**Autorización requerida:** ✅ **SÍ** — este plan no se ejecuta sin tu aprobación explícita

---

## 0. POR QUÉ EXISTE ESTE PLAN

Durante la auditoría del ERP que corre se detectaron **dos deudas transversales** que el
compendio [`DIRECTRICES_TRANSVERSALES_DEL_ERP.md`](../PLANOS-ARQUITECTONICOS-DEL-NUEVO-POS/DIRECTRICES_TRANSVERSALES_DEL_ERP.md)
declara como reglas (DT-02 Dinero y DT-06 Configuración del Negocio), pero que el ERP
**todavía no cumple**:

| Deuda | Directriz que la declara | Estado en el ERP que corre |
|---|---|---|
| Dinero almacenado en `Float` en 3 módulos | DT-02 (Dinero) | ❌ **INCUMPLIDA** |
| No existe `business_currency` ni selector de moneda | DT-06 (Configuración) | ❌ **INEXISTENTE** |

Este plan resuelve **ambas** en una sola versión (V23), porque comparten el mismo eje:
**el dinero debe tener un tipo único (Decimal) y una presentación única (formato declarado).**

> **Regla de oro que este plan respeta:** el ERP que corre no se toca sin autorización.
> Este documento es una **propuesta**. La ejecución es una decisión tuya.

---

## 1. EVIDENCIA (VERIFICADA EN CÓDIGO, NO SUPUESTA)

### 1.1 La migración existente está a medias

[`apps/api/migrations_applied/migrate_float_to_decimal.py`](../apps/api/migrations_applied/migrate_float_to_decimal.py:15)
declara **10 columnas** en su lista `ALTERATIONS`:

| # | Tabla | Columna |
|---|---|---|
| 1 | `tickets` | `total` |
| 2 | `ticket_items` | `unit_price` |
| 3 | `ticket_items` | `subtotal` |
| 4 | `products` | `price` |
| 5 | `products` | `cost` |
| 6 | `cash_sessions` | `opening_float` |
| 7 | `cash_sessions` | `physical_cash` |
| 8 | `cash_sessions` | `physical_credit` |
| 9 | `cash_sessions` | `physical_debit` |
| 10 | `cash_movements` | `amount` |

**Conclusión:** la migración cubrió **POS, Catálogo y Caja**. Dejó fuera **Grandeza,
RRHH y Pedidos**. El script es idempotente y seguro de re-ejecutar, pero su lista está
incompleta.

### 1.2 Las columnas monetarias que siguen en `Float`

#### Módulo Grandeza — [`apps/api/modules/grandeza/models.py`](../apps/api/modules/grandeza/models.py:23)

| Línea | Columna | Tabla | ¿Es dinero? |
|---|---|---|---|
| 23 | `b2b_price` | `grandeza_products` | ✅ Sí |
| 100 | `cash_fund` | `grandeza_journeys` | ✅ Sí |
| 104 | `cash_expected` | `grandeza_journeys` | ✅ Sí |
| 105 | `cash_received` | `grandeza_journeys` | ✅ Sí |
| 164 | `total_exchange_amount` | `grandeza_visits` | ✅ Sí |
| 165 | `total_fresh_amount` | `grandeza_visits` | ✅ Sí |
| 166 | `sale_amount` | `grandeza_visits` | ✅ Sí |
| 167 | `payment_received` | `grandeza_visits` | ✅ Sí |
| 168 | `change_given` | `grandeza_visits` | ✅ Sí |
| 205 | `unit_price` | `grandeza_visit_items` | ✅ Sí |
| 250 | `amount` | `grandeza_expenses` | ✅ Sí |
| 274 | `total_amount` | `grandeza_orders` | ✅ Sí |
| 282 | `advance_payment` | `grandeza_orders` | ✅ Sí |

**Subtotal Grandeza: 13 columnas monetarias.**

> **NO son dinero (no tocar):** `lat` (219), `lng` (220), `accuracy` (221) — son GPS.

#### Módulo RRHH — [`apps/api/modules/hr/models.py`](../apps/api/modules/hr/models.py:276)

| Línea | Columna | Tabla | ¿Es dinero? |
|---|---|---|---|
| 276 | `fianza_total` | `hr_fianzas` | ✅ Sí |
| 277 | `pagado` | `hr_fianzas` | ✅ Sí |
| 291 | `monto` | `hr_fianza_movimientos` | ✅ Sí |
| 315 | `monto_requerido` | `hr_fondos` | ✅ Sí |
| 316 | `monto_cubierto` | `hr_fondos` | ✅ Sí |
| 331 | `monto` | `hr_fondo_movimientos` | ✅ Sí |
| 361 | `sueldo_hora` | `hr_tabuladores` | ✅ Sí |
| 362 | `bono_hora` | `hr_tabuladores` | ✅ Sí |
| 363 | `sueldo_dia` | `hr_tabuladores` | ✅ Sí |
| 364 | `bono_dia` | `hr_tabuladores` | ✅ Sí |
| 388 | `salario_base` | `hr_nominas` | ✅ Sí |
| 389 | `bono_puntualidad` | `hr_nominas` | ✅ Sí |
| 390 | `total_percepciones` | `hr_nominas` | ✅ Sí |
| 392 | `deduccion_uniforme` | `hr_nominas` | ✅ Sí |
| 393 | `deduccion_fondo` | `hr_nominas` | ✅ Sí |
| 394 | `deduccion_otros` | `hr_nominas` | ✅ Sí |
| 395 | `total_deducciones` | `hr_nominas` | ✅ Sí |
| 397 | `neto` | `hr_nominas` | ✅ Sí |
| 413 | `monto` | `hr_incidencias` | ✅ Sí |
| 446 | `monto_fondo` | `hr_contratos` | ✅ Sí |
| 477 | `prima_vacacional` | `hr_vacaciones` | ✅ Sí |
| 569 | `neto` | `hr_nomina_detalle` | ✅ Sí |

**Subtotal RRHH: 22 columnas monetarias.**

> **NO son dinero (no tocar):** `porcentaje_aplicado` (333), `porcentaje_fondo` (445) —
> son porcentajes; `score_total` (526) — es un puntaje.

#### Módulo Pedidos — [`apps/api/modules/orders/models.py`](../apps/api/modules/orders/models.py:49)

| Línea | Columna | Tabla | ¿Es dinero? |
|---|---|---|---|
| 49 | `delivery_fee` | `orders` | ✅ Sí |

**Subtotal Pedidos: 1 columna monetaria.**

> **NO son dinero (no tocar):** `delivery_lat` (46), `delivery_lng` (47),
> `delivery_distance_km` (48) — son geografía/distancia.

### 1.3 Resumen cuantitativo

| Módulo | Columnas monetarias en Float |
|---|---|
| Grandeza | 13 |
| RRHH | 22 |
| Pedidos | 1 |
| **TOTAL A MIGRAR** | **36** |
| Ya migradas (POS/Catálogo/Caja) | 10 |

### 1.4 La infraestructura de configuración ya existe (para el selector)

| Pieza | Archivo | Estado |
|---|---|---|
| Modelo `SystemSetting` | [`apps/api/modules/settings/models.py`](../apps/api/modules/settings/models.py:4) | ✅ Existe |
| `GET /settings` + `GET /settings/{key}` + `PATCH /settings/{key}` | [`apps/api/modules/settings/router.py`](../apps/api/modules/settings/router.py:1) | ✅ Existe |
| `get_settings` / `get_setting_by_key` / `update_setting` / `seed_settings` | [`apps/api/modules/settings/service.py`](../apps/api/modules/settings/service.py:8) | ✅ Existe |
| `GET /api/v1/settings/timezone` (devuelve `timezone` + `offset_hours`) | `modules/settings/router.py` | ✅ Existe |
| `business_timezone` sembrado | [`seed_settings`](../apps/api/modules/settings/service.py:26) | ✅ Existe |
| **`business_currency`** | — | ❌ **NO existe** |

### 1.5 Vista General ya tiene el patrón del selector de zona horaria

[`apps/ExperimentCenterUI.jsx`](../apps/ExperimentCenterUI.jsx:106) (módulo Vista General,
`activeModule === 'overview'`):

- Línea 106: `bizInfo` incluye `business_timezone: 'America/Mexico_City'`.
- Línea 386-394: renderiza la info del negocio con botón "Editar".
- El selector de zona horaria usa `useTimezone()` y un modal de advertencia.

**Conclusión:** el selector de moneda **se construye copiando el patrón del selector de
zona horaria** que ya funciona. No hay que inventar arquitectura.

---

## 2. DECISIONES QUE TÚ DEBES TOMAR ANTES DE EJECUTAR

Estas 4 decisiones cambian el plan. Sin ellas, no se ejecuta.

### D-1. ¿Migrar las 36 columnas de una vez, o por módulo?

| Opción | Ventaja | Riesgo |
|---|---|---|
| **A. Todo de una vez** | Consistencia inmediata | Un fallo tumba 3 módulos a la vez |
| **B. Por módulo (Pedidos → Grandeza → RRHH)** | Aísla el fallo; cada módulo se valida antes del siguiente | Más sesiones de trabajo |

**Recomendación:** **B** — Pedidos primero (1 columna, riesgo mínimo, valida el procedimiento),
luego Grandeza (13), luego RRHH (22, el más delicado porque toca nómina).

### D-2. ¿Qué moneda declara `business_currency`?

| Opción | Valor | Nota |
|---|---|---|
| **A. Solo MXN** | `MXN` | El ERP es de una panadería en Toluca. Simple. |
| **B. MXN + USD (informativo)** | `MXN` con `business_currency_secondary = USD` | Solo para mostrar equivalencia; **nunca convierte** |
| **C. Multi-moneda real** | Requiere tipo de cambio, histórico, etc. | **Fuera de alcance** — es otro proyecto |

**Recomendación:** **A** ahora. La regla DT-02 dice "declara pero nunca convierte".
Multi-moneda real es un proyecto aparte.

### D-3. ¿Dónde vive el selector de moneda?

| Opción | Ubicación | Nota |
|---|---|---|
| **A. Vista General** (junto al de zona horaria) | `ExperimentCenterUI.jsx` | ✅ Coherente con DT-06 |
| **B. Módulo de Configuración del Sistema** | `apps/settings/SystemSettingsUI.jsx` | Ya existe, pero es más técnico |

**Recomendación:** **A** — DT-06 ya declaró que Vista General es donde se declaran los
valores transversales. Ponerlo en otro lado contradice el compendio.

### D-4. ¿Se aplica el formateo (`formatMoney`) en esta versión o en otra?

| Opción | Alcance | Nota |
|---|---|---|
| **A. Solo tipo de dato** (Float → Numeric) | Backend | No toca las 80 apariciones de `toFixed(2)` |
| **B. Tipo de dato + formateo** | Backend + Frontend | Cierra DT-02 completo |

**Recomendación:** **A** en V23 (el tipo de dato es lo urgente y lo que corrompe datos).
**B** en V24 (el formateo es cosmético y se puede hacer sin riesgo de datos).

---

## 3. FASES DEL PLAN

### FASE 0 — PREPARACIÓN (sin tocar datos)

| # | Acción | Verificación |
|---|---|---|
| 0.1 | **Respaldo completo de la BD** antes de cualquier `ALTER` | `pg_dump` con fecha; verificar que el archivo abre |
| 0.2 | Confirmar que el ERP no está en uso (o avisar a los usuarios) | Caja cerrada, sin tickets abiertos |
| 0.3 | Ejecutar el script de **auditoría** (solo lectura) que lista las columnas Float reales en la BD | Comparar contra la tabla de §1.2 |
| 0.4 | Decidir D-1 a D-4 | Respuestas escritas en este documento |

**Entregable:** respaldo + auditoría + decisiones.

### FASE 1 — MIGRACIÓN DE TIPOS (Float → Numeric(12,2))

**Principio:** se extiende el script existente, **no se crea otro**. El script ya es
idempotente y ya tiene el patrón de verificación.

| # | Acción | Detalle |
|---|---|---|
| 1.1 | Añadir a `ALTERATIONS` las **13 columnas de Grandeza** | Ver §1.2 |
| 1.2 | Añadir a `ALTERATIONS` la **1 columna de Pedidos** (`orders.delivery_fee`) | Ver §1.2 |
| 1.3 | Añadir a `ALTERATIONS` las **22 columnas de RRHH** | Ver §1.2 |
| 1.4 | Extender el bloque de **verificación** del script para incluir las 36 nuevas | El script ya imprime ✅/❌ por columna |
| 1.5 | Ejecutar **por módulo** (según D-1) | `docker exec rderico-api-dev python migrate_float_to_decimal.py` |
| 1.6 | Verificar en la BD que las 36 columnas son `numeric(12,2)` | Query de `information_schema` |

**Riesgo:** `ALTER COLUMN ... TYPE NUMERIC(12,2) USING col::NUMERIC(12,2)` **redondea**.
Un valor `12.345` pasa a `12.35` (o `12.34` según PostgreSQL). Para dinero esto es
**correcto** (el dinero tiene 2 decimales), pero hay que **avisar** que los valores
históricos pueden cambiar en el tercer decimal.

**Mitigación:** antes de migrar, correr una query que cuente cuántos valores tienen más
de 2 decimales. Si son pocos, revisarlos a mano.

### FASE 2 — ACTUALIZACIÓN DE MODELOS SQLALCHEMY

| # | Acción | Detalle |
|---|---|---|
| 2.1 | En `grandeza/models.py`, cambiar `Float` → `Numeric(12,2)` en las 13 columnas | Importar `Numeric` (ya se importa en otros modelos) |
| 2.2 | En `hr/models.py`, cambiar `Float` → `Numeric(12,2)` en las 22 columnas | Idem |
| 2.3 | En `orders/models.py`, cambiar `Float` → `Numeric(12,2)` en `delivery_fee` | Idem |
| 2.4 | **NO tocar** las columnas GPS, porcentajes ni scores | Ver §1.2 |

**Verificación:** `grep -n "Column(Float" apps/api/modules/{grandeza,hr,orders}/models.py`
debe devolver **solo** las columnas GPS/porcentaje/score.

### FASE 3 — `business_currency` (backend)

| # | Acción | Detalle |
|---|---|---|
| 3.1 | Añadir `business_currency` a `seed_settings` | Valor `"MXN"`, `category: "general"`, `input_type: "list"` |
| 3.2 | Añadir `business_currency_symbol` a `seed_settings` | Valor `"$"` |
| 3.3 | Crear `GET /api/v1/settings/currency` | Devuelve `{ currency, symbol }` — espejo de `/settings/timezone` |
| 3.4 | Re-ejecutar `seed_settings` (idempotente) | Verificar que la fila aparece en `system_settings` |

**Verificación:** `GET /api/v1/settings/currency` devuelve `{"currency":"MXN","symbol":"$"}`.

### FASE 4 — SELECTOR DE MONEDA (frontend, Vista General)

| # | Acción | Detalle |
|---|---|---|
| 4.1 | Añadir `business_currency` al estado `bizInfo` | [`ExperimentCenterUI.jsx:106`](../apps/ExperimentCenterUI.jsx:106) |
| 4.2 | Añadir el `<select>` de moneda junto al de zona horaria | Copiar el patrón del selector de zona horaria |
| 4.3 | Añadir el modal de advertencia | Mismo patrón que el de zona horaria |
| 4.4 | Persistir vía `PATCH /settings/business_currency` | El endpoint ya existe |

**Verificación:** cambiar la moneda en Vista General → recargar → el valor persiste.

### FASE 5 — VALIDACIÓN

| # | Acción | Criterio |
|---|---|---|
| 5.1 | Abrir Caja y cerrar una sesión de prueba | Los totales cuadran al centavo |
| 5.2 | Crear una jornada de Grandeza y cerrarla | `cash_expected` == `cash_received` cuando no hay diferencia |
| 5.3 | Generar una nómina de prueba en RRHH | `neto` == `total_percepciones - total_deducciones` |
| 5.4 | Crear un pedido con envío | `delivery_fee` se guarda con 2 decimales |
| 5.5 | Verificar el selector de moneda | Persiste y se muestra |

### FASE 6 — CIERRE

| # | Acción |
|---|---|
| 6.1 | Actualizar `DOCUMENTACION_MODULO_*.md` de los 3 módulos (nota de migración) |
| 6.2 | Actualizar el compendio: DT-02 pasa de ❌ a ✅ en Grandeza/RRHH/Pedidos |
| 6.3 | Actualizar el compendio: DT-06 pasa de ❌ a ✅ (selector de moneda existe) |
| 6.4 | Commit + push |

---

## 4. LO QUE ESTE PLAN **NO** HACE

| No hace | Por qué |
|---|---|
| **No convierte monedas** | DT-02: "declara pero nunca convierte". Multi-moneda es otro proyecto. |
| **No toca las 80 apariciones de `toFixed(2)`** | Es V24 (formateo), no V23 (tipo de dato). |
| **No toca el repo de planos del nuevo POS** | Este plan es del ERP que corre. |
| **No toca las columnas GPS/porcentaje/score** | No son dinero. |
| **No migra datos entre tablas** | Solo cambia el tipo de la columna. |
| **No elimina `Float` del ERP entero** | Solo de las 36 columnas monetarias identificadas. |

---

## 5. RIESGOS Y MITIGACIONES

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| El `ALTER` falla a mitad | Baja | Alto | El script es idempotente; re-ejecutar |
| Redondeo cambia valores históricos | Media | Medio | Auditar valores con >2 decimales antes |
| Un modelo queda desincronizado | Media | Alto | `grep` de verificación en FASE 2 |
| El ERP se usa durante la migración | Media | Alto | FASE 0.2: confirmar que no está en uso |
| `business_currency` no se siembra | Baja | Bajo | `seed_settings` es idempotente |
| El selector no persiste | Baja | Bajo | El endpoint `PATCH` ya existe y funciona |

---

## 6. CRITERIOS DE ACEPTACIÓN

Este plan se considera **completo** cuando:

- [ ] Las **36 columnas** monetarias son `numeric(12,2)` en la BD.
- [ ] Los **3 modelos** (`grandeza`, `hr`, `orders`) declaran `Numeric(12,2)` en esas columnas.
- [ ] `grep "Column(Float"` en los 3 modelos devuelve **solo** GPS/porcentaje/score.
- [ ] `business_currency` existe en `system_settings` con valor `MXN`.
- [ ] `GET /api/v1/settings/currency` devuelve `{currency, symbol}`.
- [ ] El selector de moneda en Vista General **persiste** tras recargar.
- [ ] Los 5 flujos de validación (FASE 5) pasan.
- [ ] El compendio marca DT-02 y DT-06 como ✅ en los 3 módulos.
- [ ] El ERP sigue funcionando (Caja, POS, Grandeza, RRHH, Pedidos).

---

## 7. ORDEN DE EJECUCIÓN RECOMENDADO

```
FASE 0 (preparación)
   ↓
FASE 1 + 2 — PEDIDOS (1 columna)  ← valida el procedimiento con riesgo mínimo
   ↓
FASE 1 + 2 — GRANDEZA (13 columnas)
   ↓
FASE 1 + 2 — RRHH (22 columnas)   ← el más delicado (nómina)
   ↓
FASE 3 + 4 (business_currency + selector)
   ↓
FASE 5 (validación)
   ↓
FASE 6 (cierre)
```

**Por qué este orden:** Pedidos primero porque una sola columna permite verificar que el
procedimiento completo (respaldo → ALTER → modelo → validación) funciona sin arriesgar
nómina. RRHH al final porque es el que más duele si algo sale mal.

---

## 8. ESFUERZO ESTIMADO

| Fase | Sesiones | Nota |
|---|---|---|
| FASE 0 | 1 | Respaldo + auditoría + decisiones |
| FASE 1+2 Pedidos | 1 | Riesgo mínimo |
| FASE 1+2 Grandeza | 1 | 13 columnas |
| FASE 1+2 RRHH | 1-2 | 22 columnas, nómina |
| FASE 3+4 | 1 | Selector de moneda |
| FASE 5 | 1 | Validación manual |
| FASE 6 | 1 | Documentación |
| **TOTAL** | **7-8 sesiones** | |

---

## 9. CIERRE

Este plan resuelve las **dos deudas transversales** que el compendio declara pero el ERP
no cumple:

1. **DT-02 (Dinero):** 36 columnas pasan de `Float` a `Numeric(12,2)`.
2. **DT-06 (Configuración):** `business_currency` existe y tiene selector en Vista General.

**No se ejecuta sin tu autorización.** Las 4 decisiones (D-1 a D-4) son tuyas.

> **La deuda no se paga sola. Se paga cuando alguien decide pagarla.**
> Este documento es la factura. La firma es tuya.
