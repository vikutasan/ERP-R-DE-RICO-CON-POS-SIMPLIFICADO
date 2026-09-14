# DOCUMENTACION — VISTA GENERAL (OVERVIEW)

> **Version:** 1.3.0
> **Ultima actualizacion:** 14 de septiembre de 2026
> **Archivos gobernados:** `apps/ExperimentCenterUI.jsx` (seccion overview), `apps/api/modules/settings/` (schemas.py, service.py)

---

## 1. DESCRIPCION

La **Vista General** es la pantalla de inicio del ERP R de Rico. Es el modulo que se carga por defecto al iniciar sesion (`activeModule = 'overview'`). Su proposito es mostrar informacion institucional de la sucursal y un reloj en tiempo real.

---

## 2. COMPONENTES VISUALES

La pantalla se divide en dos bloques principales:

### 2.1 Encabezado (Franja Negra)

Franja negra solida de lado a lado en la parte superior que muestra:

| Campo | Fuente de datos | Clave en BD |
|---|---|---|
| Nombre del negocio | `system_settings` | `business_name` |
| Nombre de la sucursal | `system_settings` | `branch_name` |
| Direccion | `system_settings` | `business_address` |
| Telefono | `system_settings` | `business_phone` |

**Proposito:** Que los empleados tengan siempre visible la direccion y telefono de la sucursal para darsela a clientes que la soliciten.

### 2.2 Reloj y Calendario

Bloque central con fondo oscuro semitransparente que muestra:

- **Hora actual** en formato HH:MM (sin segundos para evitar distraccion)
- **Fecha completa** en espanol (ej: "Domingo, 30 de Agosto de 2026")
- **Numero de semana** del anio en formato grande y destacado

> **IMPORTANTE:** La hora se calcula con `timeZone: 'America/Mexico_City'` via `Intl.DateTimeFormat` para garantizar la hora correcta independientemente de la zona horaria del dispositivo o contenedor Docker.

---

## 3. EDICION DE INFORMACION DEL NEGOCIO

### 3.1 Boton de Edicion

Un boton discreto "Editar" aparece en la esquina superior derecha del encabezado. Este boton **solo es visible** para usuarios cuyo perfil tenga activado el permiso `editar_info_negocio`.

### 3.2 Modal de Edicion

Al presionar "Editar" se abre un modal con 5 campos:

1. **Nombre del Negocio** (clave: `business_name`)
2. **Nombre de la Sucursal** (clave: `branch_name`)
3. **Direccion** (clave: `business_address`)
4. **Telefono** (clave: `business_phone`)
5. **Zona Horaria** (clave: `business_timezone`) — Selector con 12 zonas horarias de America Latina, EEUU y España

### 3.3 Persistencia

Los datos se guardan en la tabla `system_settings` de PostgreSQL mediante la API existente:
- **Lectura:** `GET /api/v1/settings/`
- **Escritura:** `PATCH /api/v1/settings/{key}` (un request por campo)

Los cambios **aplican a todas las terminales** de la sucursal ya que se leen desde la base de datos central.

---

## 4. PERMISOS

El permiso para editar la informacion del negocio se gestiona desde el **Gestor de Perfiles** (modulo Seguridad y Acceso):

| Permiso | ID | Descripcion |
|---|---|---|
| Editar Info del Negocio en Vista General | `editar_info_negocio` | Muestra el boton de edicion en el encabezado |

Este permiso se agrego al arreglo `SYSTEM_MODULES` en `apps/auth/PerfilesAccessSuite.jsx`.

---

## 5. ARQUITECTURA TECNICA

### 5.1 Estado del Reloj

`javascript
const [clockNow, setClockNow] = useState(new Date());
useEffect(() => {
    const timer = setInterval(() => setClockNow(new Date()), 1000);
    return () => clearInterval(timer);
}, []);
`

El reloj se actualiza cada segundo con `setInterval`. Se limpia con `clearInterval` al desmontar el componente.

### 5.2 Zona Horaria

`javascript
const mxOpts = { timeZone: 'America/Mexico_City' };
const horaStr = clockNow.toLocaleTimeString('es-MX', { ...mxOpts, hour: '2-digit', minute: '2-digit', hour12: false });
`

Se fuerza explicitamente la zona horaria de Mexico para evitar el bug documentado en `DOCUMENTACION_MODULO_RECURSOS_HUMANOS.md` (Incidente de Timezone del 29/Ago/2026) donde los contenedores Docker operan en UTC.

### 5.3 Calculo del Numero de Semana

`javascript
const startOfYear = new Date(clockNow.getFullYear(), 0, 1);
const diffMs = clockNow - startOfYear;
const dayOfYear = Math.floor(diffMs / 86400000);
const numSemana = Math.ceil((dayOfYear + startOfYear.getDay() + 1) / 7);
`

### 5.4 Carga de Datos del Negocio

Al montar el componente, se ejecuta un `useEffect` que hace `GET /api/v1/settings/` y filtra las claves `business_name`, `branch_name`, `business_address` y `business_phone`. Si la API falla, se usan valores por defecto (degradacion elegante).

---

## 6. SEEDS EN BASE DE DATOS

Los valores iniciales se sembraron en `system_settings`:

`sql
INSERT INTO system_settings (key, value, description, category, input_type) VALUES
('business_name', 'R de Rico', 'Nombre del negocio', 'negocio', 'text'),
('branch_name', 'Sucursal San Pablo', 'Nombre de la sucursal', 'negocio', 'text'),
('business_address', 'Manuel Buendia Tellez Giron Esq. con Independencia, CP 50294, San Pablo Autopan, Mex.', 'Direccion del negocio', 'negocio', 'text'),
('business_phone', '7225 41 05 53', 'Telefono del negocio', 'negocio', 'text');
`

---

## 7. ARCHIVOS INVOLUCRADOS

| Archivo | Cambio |
|---|---|
| `apps/ExperimentCenterUI.jsx` | Seccion overview con reloj, encabezado dinamico, modal de edicion |
| `apps/auth/PerfilesAccessSuite.jsx` | Permiso `editar_info_negocio` agregado a `SYSTEM_MODULES` |
| `system_settings` (BD) | 4 registros de configuracion del negocio |

---

> **Nota:** Esta seccion esta disenada para crecer. En el futuro podria incluir KPIs en tiempo real, alertas del sistema, o un dashboard ejecutivo conectado a datos reales de ventas, produccion e inventario.

## 5. ZONA HORARIA CONFIGURABLE (Implementado 31 Ago 2026)

### 5.1 Principio: "Store UTC, Display Local"

El sistema almacena todos los timestamps en UTC (hora del contenedor Docker). La zona horaria del negocio se usa exclusivamente para:
- **Mostrar** horas al usuario en la UI
- **Logica de negocio** que depende de hora local (puntualidad HR, regla "antes de 5 AM" en analytics)

### 5.2 Selector de Zona Horaria

El campo **Zona Horaria** en el modal de edicion ofrece 12 opciones:

| Zona | Descripcion |
|------|-------------|
| `America/Mexico_City` | Mexico Central (UTC-6) — Default |
| `America/Cancun` | Mexico Sureste (UTC-5) |
| `America/Mazatlan` | Mexico Pacifico (UTC-7) |
| `America/Tijuana` | Mexico Noroeste (UTC-8) |
| `America/Bogota` | Colombia (UTC-5) |
| `America/Lima` | Peru (UTC-5) |
| `America/Santiago` | Chile (UTC-4) |
| `America/Argentina/Buenos_Aires` | Argentina (UTC-3) |
| `America/New_York` | Este EEUU (UTC-5) |
| `America/Chicago` | Centro EEUU (UTC-6) |
| `America/Los_Angeles` | Pacifico EEUU (UTC-8) |
| `Europe/Madrid` | Espana (UTC+1) |

### 5.3 Modal de Advertencia

Al intentar cambiar la zona horaria, el sistema muestra un modal de advertencia premium (no `window.confirm`) que informa:
- Que modulos se ven afectados (HR, reportes, estadisticas, regla de 5 AM)
- La zona anterior (tachada en rojo) y la nueva (en verde)
- Que los datos existentes NO se modifican
- Botones Cancelar / Confirmar

### 5.4 Arquitectura Backend

La zona horaria se lee desde `system_settings` mediante la utilidad centralizada `apps/api/core/timezone.py`:

| Funcion | Proposito |
|---------|-----------|
| `get_business_tz(db)` | Lee `business_timezone` de DB, cachea 5 minutos |
| `local_now(tz)` | Retorna hora actual en la zona del negocio (naive) |
| `utc_to_local(dt, tz)` | Convierte un datetime UTC a hora local (naive) |

### 5.5 Modulos que usan la utilidad

| Modulo | Archivo | Uso |
|--------|---------|-----|
| HR (check-in) | `modules/hr/service.py` | Determinar puntualidad con hora local |
| Analytics | `modules/analytics/router.py` | Regla "antes de 5 AM = dia anterior" |
| Grandeza | `modules/grandeza/service.py` | Timestamps de despacho y visitas |
| POS (locks) | `modules/pos/occupancy.py` | NO usa — opera en UTC internamente |
| POS (tickets) | `modules/pos/service.py` | NO usa — almacena UTC |

---

## 6. EL CEMENTERIO DE BUGS

### 🐛 BUG 1: La direccion y el telefono se "borraban solos" (13 Sep 2026)

**Sintoma reportado:** El operador escribia la direccion y el telefono en el modal de edicion, presionaba Guardar, y al cabo de un rato (o tras recargar la pagina) los campos aparecian vacios otra vez. El nombre del negocio y el de la sucursal si se conservaban.

**Diagnostico:** El sintoma era enganoso. Los datos **nunca se borraban de la base de datos**. Lo que fallaba era la **lectura**.

```
GET /api/v1/settings/  ->  HTTP 500 Internal Server Error
PATCH /api/v1/settings/{key}  ->  HTTP 200 OK
```

La escritura funcionaba perfectamente; la lectura fallaba por completo.

**Causa raiz:** El endpoint `GET /api/v1/settings/` devolvia **todos** los registros de `system_settings` validados contra el contrato `SystemSettingResponse`. Ese contrato declaraba `category: str` e `input_type: str` como **campos obligatorios**.

El registro `id=22` (`heladeria_terminals_config`) tenia `category = NULL` e `input_type = NULL` en la base de datos. Un unico registro malformado bastaba para que Pydantic lanzara:

```
fastapi.exceptions.ResponseValidationError: 2 validation errors:
  {'type': 'string_type', 'loc': ('response', 15, 'category'), 'msg': 'Input should be a valid string', 'input': None}
  {'type': 'string_type', 'loc': ('response', 15, 'input_type'), 'msg': 'Input should be a valid string', 'input': None}
```

**Por que se veia como "se borra la direccion y el telefono":** El frontend en [`loadBizInfo`](apps/ExperimentCenterUI.jsx:104) hace `if (res.ok)`. Como la respuesta era 500, `res.ok` era `false`, el bloque se saltaba en silencio (la degradacion elegante del `catch` no mostraba nada) y `bizInfo` conservaba los valores por defecto del `useState`:

```javascript
const [bizInfo, setBizInfo] = useState({
    business_name: 'R de Rico',
    branch_name: 'Sucursal San Pablo',
    business_address: '',      // <-- vacio
    business_phone: '',        // <-- vacio
    ...
});
```

Es decir: `business_name` y `branch_name` "sobrevivian" porque sus valores por defecto en el `useState` coincidian con los reales. `business_address` y `business_phone` aparecian vacios porque sus defaults eran `''`. **El bug no era de escritura, era de lectura.**

**Por que el registro quedo con NULL:** El modelo SQLAlchemy define los defaults del lado Python:

```python
category = Column(String, default="general")
input_type = Column(String, default="text")
```

Los defaults de Python **solo aplican cuando SQLAlchemy construye el INSERT**. Si la fila se creo por SQL crudo, por `op.bulk_insert` en una migracion, o por un script de soporte de Heladeria, esas columnas quedaron NULL. Es el mismo patron documentado en el modulo de Almacenes (`op.bulk_insert` omite defaults Python).

**Solucion aplicada (3 capas):**

| Capa | Archivo | Cambio |
|---|---|---|
| 1. Contrato tolerante | [`apps/api/modules/settings/schemas.py`](apps/api/modules/settings/schemas.py:17) | `category` e `input_type` pasan a `Optional[str]` con default (`"general"` / `"text"`). Un NULL ya no rompe la respuesta. |
| 2. Reparacion de datos | `system_settings` (BD) | `UPDATE system_settings SET category='heladeria' WHERE category IS NULL` y `input_type='json' WHERE input_type IS NULL`. |
| 3. Blindaje del seed | [`apps/api/modules/settings/service.py`](apps/api/modules/settings/service.py:24) | `seed_settings()` ahora repara filas historicas con NULL en cada arranque, ademas de sembrar las faltantes. |

**Verificacion:**

```
GET /api/v1/settings/  ->  200
  business_name     = R de Rico
  branch_name       = Sucursal San Pablo
  business_phone    = 7225 41 05 53
  business_timezone = America/Mexico_City
  business_address  = MANUEL BUENDIA TELLEZ GIRON ESQUINA CON INDEPENDENCIA, SAN PABLO AUTOPAN; TOLUCA, MEXICO
```

**Leccion:** Un `ResponseValidationError` en un endpoint de listado es una falla **total**, no parcial. Un solo registro con NULL tumba la respuesta completa. Los contratos de respuesta deben ser tolerantes a NULL cuando la columna de BD lo permite, y los seeds deben usar los defaults del modelo, nunca SQL crudo sin columnas completas.

---

## 7. PLAN TRANSVERSAL V19 — FUENTE UNICA DE VERDAD DE LA API (14 Sep 2026)

### 7.1 Problema resuelto

Antes de V19, cada archivo del frontend construia la URL de la API por su cuenta con
`http://${window.location.hostname}:5001/api/v1`. Esto generaba **27 puntos de duplicacion**
y hacia imposible desplegar en un dominio publico sin editar archivo por archivo.

### 7.2 Solucion: `apps/shared/config.js`

Se creo un unico modulo que resuelve la URL base de la API con **prioridad explicita**:

| Prioridad | Fuente | Uso |
|-----------|--------|-----|
| 1 | `window.location.hostname` | **Comportamiento historico LAN** (compatibilidad total) |
| 2 | `import.meta.env.VITE_API_URL` | Override explicito (solo si no hay `window`, p.ej. SSR/build) |
| 3 | `http://localhost:5001/api/v1` | Fallback final |

```javascript
// apps/shared/config.js
export const CONFIG = {
    API_BASE_URL: resolveApiBaseUrl(),
    ITEMS_PER_PAGE: 12,
    TASA_IVA_MEXICO: 0.16
};
```

> **⚠️ LECCION CRITICA (hotfix v19.1):** La primera version daba **prioridad** a
> `VITE_API_URL`. Al fijarlo a una IP LAN concreta (`192.168.1.117`) en `docker-compose.yml`,
> **cualquier cliente en otro host perdia la conexion** y las fotografias de producto no
> cargaban (el POS mostraba "Sin conexion al servidor"). El hostname del navegador **debe**
> ser la fuente primaria. `VITE_API_URL` es solo un override opcional para despliegues con
> dominio publico.

### 7.3 Archivos migrados

- **11 archivos no-POS** (commit `90438aa`): `PerfilesAccessSuite`, `SystemSettingsUI`,
  `GestorRepartosUI`, `PedidosProduccionUI`, `GestorPickupUI`, `PedidosPendientesUI`,
  `ProcesoProduccionMasaUI`, `GlobalAgentSettingsUI`, `ProductCatalogUI`, `DoughManagerUI`,
  `ProductionEquipmentUI`.
- **4 archivos POS no-IA** (commit `afe314d`): `posConstants.js`, `ProgramacionPedidoModal.jsx`,
  `GrandezaDriverUI.jsx`, `pos/config.js`.
- **Patron `API_ORIGIN`:** para reescribir URLs de imagenes se deriva el origen sin `/api/v1`
  con `CONFIG.API_BASE_URL.replace(/\/api\/v1\/?$/, '')`.

> **NO migrado (intocable):** `apps/pos/RetailVisionPOS.jsx` (Punto de Venta IA) es un
> **consumidor verificado por smoke**, no sujeto de cambio (Restriccion A).

---

## 8. PLAN TRANSVERSAL V19 — TIMESTAMPS TECNICOS EN UTC (14 Sep 2026)

### 8.1 Utilidad centralizada `apps/api/core/timestamps.py`

```python
from datetime import datetime, timezone

def utcnow() -> datetime:
    """Retorna la hora actual en UTC como datetime NAIVE."""
    return datetime.now(timezone.utc).replace(tzinfo=None)
```

### 8.2 Modulos migrados (commit `d3ad9c6`)

| Modulo | Archivos | Cambio |
|--------|----------|--------|
| Network | `network/models.py` | `created_at` default `utcnow` |
| Cash | `cash/models.py`, `cash/service.py` | `opened_at`, `created_at`, `closed_at` en UTC |
| Orders | `orders/models.py`, `orders/service.py` | `created_at`, `updated_at` en UTC |

### 8.3 Distincion tecnico vs negocio (Rev. 2)

- **Timestamps TECNICOS** (network, cash, orders): se almacenan en **UTC**. Son marcas de
  auditoria, no dependen de la hora local del negocio.
- **Timestamps de NEGOCIO** (grandeza): usan `local_now()` de forma **deliberada** porque
  representan eventos de ruta que el operador lee en hora local.

> **⏳ PENDIENTE — V20 Bloque 9.c:** El modulo `grandeza` **aun NO se migra a UTC**.
> Queda **pendiente** para la Fase 20.2.d del plan V20 (Zona Horaria Global). En Rev. 2
> **ya NO se documenta como "local deliberado permanente"**, sino como deuda tecnica
> programada. Ver `plans/PLAN_V20_ZONA_HORARIA_GLOBAL.md`.

---

> **Esta documentacion refleja el estado del sistema al 14 de septiembre de 2026.**
> **V19 (Plan Transversal) — COMPLETO.** Bloques 1-5 cerrados. `grandeza` diferido a V20 Bloque 9.c.
