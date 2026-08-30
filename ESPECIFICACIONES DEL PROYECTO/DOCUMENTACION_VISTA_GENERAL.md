# DOCUMENTACION — VISTA GENERAL (OVERVIEW)

> **Version:** 1.0.0
> **Ultima actualizacion:** 30 de agosto de 2026
> **Archivos gobernados:** `apps/ExperimentCenterUI.jsx` (seccion overview)

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

Al presionar "Editar" se abre un modal con 4 campos:

1. **Nombre del Negocio** (clave: `business_name`)
2. **Nombre de la Sucursal** (clave: `branch_name`)
3. **Direccion** (clave: `business_address`)
4. **Telefono** (clave: `business_phone`)

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
