# DOCUMENTACIÓN — MÓDULO GESTIÓN DE PERFILES DE SEGURIDAD

> **Versión:** 1.0.0
> **Última actualización:** 31 de agosto de 2026
> **Archivos gobernados:** `apps/auth/PerfilesAccessSuite.jsx`, `apps/api/modules/security/`

---

## 1. DESCRIPCIÓN

El módulo de **Gestión de Perfiles** controla qué empleados pueden acceder a qué funciones del ERP. Funciona como una **matriz de permisos** donde cada perfil de seguridad (ej: ADMIN, CAJERO, RG) tiene un conjunto de permisos habilitados o deshabilitados.

El módulo se accede desde el menú lateral del ERP → **Seguridad y Acceso** → **Gestión de Perfiles**.

---

## 2. ARQUITECTURA

### 2.1 Base de Datos

**Tabla:** `security_profiles`

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | Integer (PK) | Identificador único |
| `name` | String | Nombre del perfil (ej: "ADMIN", "CAJERO", "RG") |
| `description` | String | Descripción del perfil |
| `permissions` | JSON | Diccionario de permisos `{"clave": "full" o null}` |
| `is_system` | Boolean | Si es un perfil del sistema (no eliminable) |

**Relación:** Cada `Employee` tiene un `profile_id` que apunta a `security_profiles`. Un perfil puede tener múltiples empleados asignados.

### 2.2 Estructura del JSON de Permisos

```json
{
    "all": "full",                    // Master Access — acceso total
    "pos_retail": "full",             // Acceso al POS
    "inventory": "full",              // Acceso a Gestión de Productos
    "inventory_delete": null,         // Eliminar productos: deshabilitado
    "pos_force_unlock": "full",       // Puede forzar desbloqueo de terminales
    "editar_info_negocio": "full"     // Puede editar info del negocio
}
```

- `"full"` = permiso habilitado
- `null` o ausente = permiso deshabilitado

### 2.3 Master Access (`all = "full"`)

Cuando un perfil tiene `all = "full"`, se interpreta como **acceso total** a todos los módulos y funciones. Al activar Master Access en la UI:
- Todos los permisos individuales se activan automáticamente
- No se pueden desactivar permisos individuales mientras Master Access esté ON
- Al desactivar Master Access, todos los permisos se limpian

### 2.4 Perfiles de Sistema (Semilla)

El sistema crea automáticamente 3 perfiles al inicializar (`service.py` línea 118-120):

| Perfil | Permisos por defecto | ¿Eliminable? |
|--------|---------------------|--------------|
| **ADMIN** | `{"all": "full"}` | No (`is_system: true`) |
| **MANAGER** | `{"pos": "full", "inventory": "full", "cash": "full"}` | No |
| **CAJERO** | `{"pos": "full", "cash": "limited"}` | No |

Los perfiles personalizados (ej: "RG", "EMBOLSADOR") sí son eliminables.

---

## 3. CATÁLOGO DE PERMISOS

### 3.1 Permisos de Módulos (Controlan visibilidad en el sidebar)

| Clave | Módulo | Qué controla |
|-------|--------|--------------|
| `pos_retail` | Punto de Venta IA | Acceso al POS completo |
| `inventory` | Gestión de Productos | Catálogo de productos |
| `warehouse` | Gestión de Almacenes | Control de almacenes |
| `vision_train` | Entrenamiento IA | Entrenamiento del modelo de visión |
| `production` | Maestro Panadero | Módulo de producción |
| `financials` | Módulo Financiero | Finanzas y contabilidad |
| `invoicing` | Facturación CFDI | Facturación electrónica |
| `purchasing` | Gestión de Compras | Órdenes de compra |
| `logistics` | Logística de Rutas | Gestión de rutas de reparto |
| `pos_tables` | TPV Mesas & KDS | Terminal de mesas/restaurante |
| `waiter` | App Mesero | Interfaz de mesero |
| `driver` | App Repartidor | Interfaz de repartidor |
| `settings` | Ajustes del Sistema | Configuración del sistema |
| `procurement` | B2B Procurement | Compras empresariales |
| `seguridad_acceso` | Seguridad y Acceso | Gestión de empleados y perfiles |
| `auditoria` | Auditoría y Control | Logs y auditoría |

### 3.2 Permisos de Funciones Específicas (Controlan acciones dentro de un módulo)

| Clave | Función | Dónde se valida |
|-------|---------|-----------------|
| `pos_force_unlock` | Forzar desbloqueo de terminales | ✅ Frontend + ✅ **Backend** (`router.py`) |
| `pos_force_cash_unlock` | Forzar desbloqueo de terminal con caja | ✅ Frontend + ✅ **Backend** (`router.py`) |
| `access_any_terminal` | Navegar entre terminales sin restricción | ✅ Frontend (`RetailVisionPOS.jsx`) |
| `access_terminal_manager` | Acceso al gestor de terminales | ✅ Frontend |
| `inventory_delete` | Botón de eliminar productos | ✅ Frontend (`ProductCatalogUI.jsx`) |
| `analytics_financial_data` | Ver cifras monetarias en estadísticas | ✅ Frontend (`EstadisticasVentasUI.jsx`) |
| `grandeza_params` | Configuración de Pan Grandeza | ✅ Frontend |
| `grandeza_daily` | Herramienta de gerente Grandeza | ✅ Frontend (`RepartoPanGrandezaUI.jsx`) |
| `grandeza_driver` | Herramienta de repartidor Grandeza | ✅ Frontend (`RepartoPanGrandezaUI.jsx`) |
| `grandeza_edit_clients` | Editar clientes de Pan Grandeza | ✅ Frontend (`GrandezaDriverUI.jsx`) |
| `editar_info_negocio` | Editar información del negocio en Vista General | ✅ Frontend (`ExperimentCenterUI.jsx`) |

---

## 4. CÓMO SE APLICAN LOS PERMISOS

### 4.1 Nivel de Navegación (Sidebar)

`ExperimentCenterUI.jsx` (líneas 188-198) controla qué módulos aparecen en el sidebar:

```javascript
// Lógica de visibilidad de módulos:
if (userRole === 'ADMIN') return true;                    // ADMIN ve todo
if (userPermissions?.all === 'full') return true;          // Master Access ve todo
if (userPermissions[moduleId] === 'full') return true;     // Permiso específico
return moduleConfig.access.includes(userRole);             // Fallback por rol
```

### 4.2 Nivel de Función (Botones y Acciones)

Cada componente chequea permisos individualmente. Ejemplo:

```javascript
// ProductCatalogUI.jsx — botón eliminar:
if (userPermissions?.inventory_delete !== 'full' && userPermissions?.all !== 'full') {
    return; // No tiene permiso
}

// ExperimentCenterUI.jsx — botón editar negocio:
{(userPermissions?.editar_info_negocio || userPermissions?.all === 'full') && (
    <button>Editar</button>
)}
```

### 4.3 Nivel de Backend (API)

> ⚠️ **ESTADO ACTUAL:** Solo 2 permisos se validan en el backend. Los demás son solo frontend.

Los únicos permisos validados en el servidor (`apps/api/modules/pos/router.py`):

```python
# force_terminal_unlock — valida pos_force_unlock y pos_force_cash_unlock:
is_admin = (emp.role or "").strip().upper() == "ADMIN"
has_unlock_perm = permissions.get("pos_force_unlock") in ("full", True)
if not is_admin and not has_unlock_perm:
    raise HTTPException(status_code=403, detail="No tienes permiso...")
```

---

## 5. API DEL MÓDULO

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/v1/security/profiles` | GET | Listar todos los perfiles |
| `/api/v1/security/profiles` | POST | Crear nuevo perfil |
| `/api/v1/security/profiles/{id}` | PUT | Actualizar perfil (nombre, descripción, permisos) |
| `/api/v1/security/profiles/{id}` | DELETE | Eliminar perfil (solo si no es `is_system`) |
| `/api/v1/security/employees` | GET | Listar empleados con su perfil asignado |
| `/api/v1/security/employees/{id}` | PUT | Asignar perfil a un empleado |

---

## 6. LIMITACIONES CONOCIDAS Y BUG ACTUAL (Agosto 2026)

### 6.1 Bug de Master Access Resuelto

**Fecha:** 31 de agosto de 2026.
**Problema:** El permiso `editar_info_negocio` no respetaba `all = "full"` (Master Access). Un administrador con acceso total no veía el botón "Editar" en Vista General.
**Causa:** El chequeo de permisos en `ExperimentCenterUI.jsx` línea 376 solo buscaba la clave específica sin verificar el comodín `all`.
**Solución:** Se agregó `|| userPermissions?.all === 'full'` al chequeo.

### 6.2 Validación Solo en Frontend

La mayoría de los permisos se validan **exclusivamente en el frontend** (ocultando botones y módulos). Un usuario técnico podría llamar la API directamente y saltarse las restricciones. En un entorno LAN cerrado (panadería) esto es aceptable; para SaaS es un riesgo de seguridad.

### 6.3 No Existe "Deny Explícito"

Si un perfil tiene `all = "full"`, no se puede deshabilitar un permiso individual. El Master Access siempre gana. No existe el concepto de "dar acceso total EXCEPTO a X".

---

## 7. PLAN DE MEJORA PARA MIGRACIÓN A SAAS

### Fase 1: Validación Backend de Permisos (Prioridad Alta)

**Objetivo:** Cada endpoint de la API debe validar permisos en el servidor, no solo en la UI.

**Implementación:**
1. Crear un **middleware de permisos** en FastAPI:
```python
# Ejemplo de decorador reutilizable:
@require_permission("inventory_delete")
async def delete_product(product_id: int, db: AsyncSession = Depends(get_db)):
    ...
```

2. El middleware lee el `profile_id` del empleado autenticado, consulta sus `permissions`, y valida contra el permiso requerido.

3. Aplicar a los ~15-20 endpoints que actualmente no validan permisos.

**Endpoints prioritarios:**
- `DELETE /products/{id}` → requiere `inventory_delete`
- `PUT /settings/{key}` → requiere `settings`
- `GET /analytics/*` con datos monetarios → requiere `analytics_financial_data`
- Todos los endpoints de `security/` → requiere `seguridad_acceso`

### Fase 2: Deny Explícito (Prioridad Media)

**Objetivo:** Permitir que un perfil con Master Access tenga excepciones explícitas.

**Implementación:**
- Agregar un tercer valor al JSON de permisos: `"denied"`
- Lógica: si `permissions[key] === "denied"`, denegar aunque `all === "full"`
- UI: permitir marcar excepciones en rojo cuando Master Access está activo

### Fase 3: Zona Horaria Configurable (Prioridad Media)

**Objetivo:** La zona horaria del ERP se configura desde la UI, no desde Docker.

**Implementación:**
1. Agregar `business_timezone` a `system_settings` (ej: `"America/Mexico_City"`)
2. Campo editable desde Vista General → modal "Editar Información del Negocio"
3. El backend lee este setting y lo usa para convertir UTC a hora local donde se necesite
4. Docker permanece en UTC (best practice para servidores)

### Fase 4: Restricción Multi-Terminal por Perfil (Prioridad Baja)

**Objetivo:** Controlar qué perfiles pueden operar múltiples terminales simultáneamente.

**Implementación:**
1. Agregar permiso `pos_multi_terminal` al catálogo de `SYSTEM_MODULES`
2. En `lock_terminal()`: si el usuario NO tiene este permiso y ya tiene un lock en otra terminal, rechazar con mensaje claro: "Ya tienes sesión activa en T{X}. Ciérrala primero."
3. Perfiles ADMIN/MANAGER: habilitado por defecto
4. Perfiles CAJERO/RG: deshabilitado por defecto

### Fase 5: Autenticación por Token (Prioridad para SaaS)

**Objetivo:** Reemplazar el sistema actual (el frontend envía `occupier_id` en cada request) por tokens JWT.

**Estado actual:** Cualquier terminal puede enviar cualquier `occupier_id` en las peticiones. No hay autenticación real.

**Implementación:**
1. Login genera un JWT con `employee_id`, `profile_id`, `permissions`
2. Cada request incluye el token en el header `Authorization`
3. El middleware de permisos (Fase 1) lee el token automáticamente
4. Se elimina la dependencia de enviar `occupier_id` manualmente

---

## 8. ARCHIVOS CRÍTICOS

| Archivo | Propósito |
|---------|-----------|
| `apps/auth/PerfilesAccessSuite.jsx` | UI completa del gestor de perfiles |
| `apps/api/modules/security/models.py` | Modelo `SecurityProfile` y `Employee` |
| `apps/api/modules/security/schemas.py` | Schemas Pydantic para validación |
| `apps/api/modules/security/service.py` | Lógica de negocio (CRUD de perfiles, semilla) |
| `apps/api/modules/security/router.py` | Endpoints REST del módulo |
| `apps/ExperimentCenterUI.jsx` | Lógica de navegación por permisos (sidebar) |

---

> **Esta documentación refleja el estado del sistema al 31 de agosto de 2026.**
> El plan de mejora (Sección 7) documenta la ruta hacia un sistema SaaS con seguridad completa.
> La prioridad inmediata es estabilizar la operación; las mejoras de seguridad se implementarán progresivamente.
