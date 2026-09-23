# Documentación Módulo de Reparto "Grandeza"

Este documento está diseñado para proporcionar contexto técnico, funcional y de arquitectura a las IAs y desarrolladores que interactúen con el módulo "Reparto Pan Grandeza".

## 1. Visión General
El módulo "Grandeza" es un sistema especializado dentro del ERP R de Rico, diseñado exclusivamente para administrar rutas de reparto, inventarios móviles, visitas a clientes (programadas y no programadas), y el registro de ventas o pedidos (anticipos/saldos) directamente en campo a través de una tablet o dispositivo móvil utilizado por el repartidor.

**Pilar Arquitectónico Crítico:**
El módulo "Grandeza" **VIVE TOTALMENTE AISLADO** del Punto de Venta (POS) de las sucursales. 
- **Base de datos:** Utiliza tablas con el prefijo `grandeza_` (ej. `grandeza_orders`, `grandeza_clients`, `grandeza_journeys`). No interfiere con las tablas `tickets`, `ticket_items` ni interrumpe la operación de los cajeros en mostrador.
- **Frontend:** Tiene su propia UI independiente (`GrandezaDriverUI.jsx`) montada en Vite, separada de `POS.jsx`.
- **Backend:** Sus rutas están en `apps/api/modules/grandeza/router.py`, lo que previene que fallos o lentitud en el reparto afecten al POS físico.

---

## 2. Flujo de Trabajo del Repartidor (Jornada)

1. **Apertura de Jornada (`GrandezaJourney`)**: Se abre un día de reparto. Queda ligado a un chofer, fecha y una cantidad de dinero como "Fondo de Caja".
2. **Carga de Inventario Inicial (`GrandezaInventory`)**: Antes de salir, se registra el inventario (productos) subido a la camioneta.
3. **Ruta del Día (`GrandezaRouteSlot`)**: Se define una secuencia de visitas (`visits`) basadas en los clientes (`GrandezaClient`) asignados para ese día específico de la semana.
4. **Ejecución en Campo**:
    - El repartidor atiende clientes, usando geolocalización (GPS) al llegar a la tienda.
    - Levanta pedidos o registra ventas directas (`GrandezaOrder`).
    - Al final, reporta el retorno, dinero en mano y mercancía sobrante.

---

## 3. Estructura de Base de Datos y Modelos

Todos los modelos residen en `apps/api/modules/grandeza/models.py`. Destacan:
- `GrandezaProductConfig`: Define qué productos del catálogo general están habilitados para reparto y a qué precio B2B.
- `GrandezaClient`: Ficha del cliente, ubicación GPS, historial y foto de fachada.
- `GrandezaRouteSlot`: Plantilla semanal de rutas (lunes a domingo).
- `GrandezaOrder` / `GrandezaOrderItem`: 
    - Registra la venta.
    - Soporta los campos `delivery_time` (fecha/hora de entrega).
    - Soporta `advance_payment` (anticipos) y calcula el estado del pago (`PAGADO`, `ANTICIPO`, `PENDIENTE`).

---

## 4. Lógica de Tiempos de Producción y Entregas
Para los pedidos, el sistema evita que el repartidor prometa entregas imposibles al cliente consultando la **Ficha Técnica** del producto en el momento.

- **Cálculo:** El sistema lee el campo `order_lead_time_hours` (Tiempo para pedidos) desde la relación `ProductTechnicalSheet` del catálogo. El backend lo extrae en `service.py` usando `cfg.product.technical_sheet.order_lead_time_hours`.
- **Auto-sugerencia:** Cuando el campo de fecha está vacío y se agregan productos con lead time, el frontend auto-rellena la fecha/hora mínima posible. **Si el usuario ya capturó una fecha/hora, el sistema la respeta y NO la sobreescribe.**
- **Bloqueo al enviar:** Si la fecha/hora capturada es anterior a la mínima viable, el botón de "Levantar Pedido" se bloquea con un toast de error que dice exactamente cuántas horas de producción se necesitan. El pedido NO se envía.
- **Indicador visual:** Debajo de los campos fecha/hora aparece una etiqueta:
    - **Morada (⏱️):** Indica la fecha más próxima posible, todo está bien.
    - **Roja (⚠️):** La fecha capturada no alcanza, se necesita más tiempo.

---

## 5. Integración con el Módulo de Producción

Los pedidos levantados desde la tablet del repartidor aparecen automáticamente en **Pedidos en Producción** (`PedidosProduccionUI.jsx`), sin intervención del POS.

### Status de Pedido vs. Status de Pago
Existen **dos campos de status independientes** en `GrandezaOrder`:
- `status`: Controla el **flujo de producción** (TENTATIVO → TURNO_ASIGNADO → EN_PREPARACION → ... → ENTREGADO). Este es el que lee Producción para saber qué hacer.
- `payment_status`: Controla el **estado financiero** (PENDIENTE, ANTICIPO, PAGADO). Este es el que lee el repartidor para saber cuánto cobrar.

### Reglas de Negocio
1. **Los pedidos Grandeza entran a Producción como `TENTATIVO`**, no como `PAGADO`. Esto permite que se levanten pedidos sin pago completo (con anticipo o pendientes).
2. **La información financiera real** se muestra en Producción:
    - En la tarjeta del pedido: una etiqueta de color indica PAGADO (verde), ANTICIPO con montos (ámbar), o PENDIENTE (rojo).
    - En el modal de detalles: un bloque muestra Total, Anticipo y Resta desglosados.
3. **La hora de compromiso** se construye combinando `delivery_date` + `delivery_time` (ej: `2026-06-18T10:00`) para que Producción vea la hora real que capturó el repartidor.

### Mapeo de Datos (PedidosProduccionUI.jsx → loadOrders)
Al cargar pedidos, Producción hace fetch a `/api/v1/grandeza/orders` y mapea los datos así:
```javascript
committed_at: o.delivery_time ? `${o.delivery_date}T${o.delivery_time}` : o.delivery_date,
payment_status: o.payment_status || 'PENDIENTE',
advance_payment: o.advance_payment || 0,
balance_due: o.balance_due || 0,
```

---

## 6. Registro de Errores Enfrentados y Sus Soluciones (Troubleshooting)

A lo largo del desarrollo hemos topado con peculiaridades del ecosistema (Timezones, Lazy Loading, Redes, Mapeo de datos). Se listan a continuación para que ninguna IA futura tropiece con la misma piedra.

### Error A: "Desaparición" de la Ruta (Efecto Zona Horaria / Timezone)
**Síntoma:** Al probar la aplicación del repartidor en la tablet después de cierta hora de la tarde (ej. 6:00 PM), la ruta del día en curso desaparecía y el sistema mostraba "Sin ruta activa". Sin embargo, en la base de datos la jornada seguía abierta.
**Diagnóstico:** México (America/Mexico_City) está desfasado del horario UTC. La función del frontend `todayStr()` utilizaba `new Date()`. Al caer la tarde en México, en UTC ya es el día siguiente (medianoche). El navegador de la tablet pasaba a solicitar a la API la ruta "de mañana", devolviendo `404 Not Found`.
**Solución:** Se forzó explícitamente el timezone de México en la construcción de la fecha, extrayendo las partes exactas usando `formatToParts` para evitar diferencias de renderizado (slashes vs dashes) entre distintos navegadores (Chrome vs Safari).

```javascript
// SOLUCIÓN APLICADA EN GrandezaDriverUI.jsx
const todayStr = () => {
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Mexico_City',
        year: 'numeric', month: '2-digit', day: '2-digit'
    });
    const parts = formatter.formatToParts(new Date());
    const year = parts.find(p => p.type === 'year').value;
    const month = parts.find(p => p.type === 'month').value;
    const day = parts.find(p => p.type === 'day').value;
    return `${year}-${month}-${day}`;
};
```

### Error B: "Failed to fetch" engañoso (Internal Server Error 500 encubierto por CORS)
**Síntoma:** Tras agregar la lógica de "lead time", la tablet del repartidor falló drásticamente en la carga inicial y arrojó un error en rojo que decía `FETCH ERR en products: Failed to fetch`.
**Diagnóstico:** 
1. Originalmente, se creía que era un problema de red, IPs caídas, puertos bloqueados o solicitudes HTTP desde HTTPS (Mixed Content).
2. Se comprobó que el servidor FastApi (puerto 5001) respondía. Al atacar el endpoint `/api/v1/grandeza/products` directo, se descubrió un `HTTP 500 Internal Server Error`.
3. Cuando FastAPI falla con un 500 no controlado, **no adjunta cabeceras CORS**. Por tanto, el navegador de la tablet bloquea la respuesta y lo disfraza como un "Failed to fetch" de red.
**Causa real (Typo + Lazy Loading):** 
- Se intentó leer `cfg.product.technical_data.get()` cuando el ORM en realidad tiene la relación definida como `technical_sheet`, no `technical_data`.
- Además, `technical_sheet` es una relación ORM asíncrona de SQLAlchemy. Al intentar accederla de forma síncrona dentro del bucle de serialización sin haber hecho un *eager load* (`selectinload`), se disparaba un `MissingGreenlet` o `AttributeError`.
**Solución:** Se modificó la consulta en `service.py` para obligar a la base de datos a precargar (`selectinload`) la ficha técnica asíncronamente en una sola llamada, y se corrigió el nombre del atributo.

```python
# SOLUCIÓN APLICADA EN apps/api/modules/grandeza/service.py
stmt = (
    select(GrandezaProductConfig)
    # Eager loading vital para evitar MissingGreenlet en FastAPI Async
    .options(selectinload(GrandezaProductConfig.product).selectinload(Product.technical_sheet))
    .where(GrandezaProductConfig.is_enabled == True)
    .order_by(GrandezaProductConfig.id)
)
```

### Error C: Hora de entrega incorrecta en Producción (6 PM en vez de 10 AM)
**Síntoma:** El repartidor capturaba un pedido con hora de entrega 10:00 AM, pero en el módulo de Producción aparecía como las 6:00 PM.
**Diagnóstico:** En `PedidosProduccionUI.jsx`, al mapear los pedidos Grandeza se asignaba `committed_at: o.delivery_date` pasando solo la fecha (ej: `"2026-06-18"`) e ignorando completamente `o.delivery_time`. JavaScript interpreta una fecha sin hora como medianoche UTC, que al convertir a zona horaria de México resulta en las 6:00 PM del día anterior.
**Solución:** Se combinan ambos campos: `committed_at: o.delivery_time ? \`${o.delivery_date}T${o.delivery_time}\` : o.delivery_date`

### Error D: Status "PAGADO" falso en Producción (siendo ANTICIPO o PENDIENTE)
**Síntoma:** El repartidor levantaba un pedido con anticipo parcial, pero en Producción aparecía marcado como "Pagado".
**Diagnóstico:** En `service.py`, la función `create_grandeza_order` forzaba `status="PAGADO"` para que Producción lo aceptara en su flujo. Pero el módulo de Producción ya acepta pedidos con `status="TENTATIVO"` (sección "EN ESPERA DE ASIGNACIÓN DE TURNO", línea 35 de PedidosProduccionUI.jsx).
**Solución:** Se cambió el status inicial de `"PAGADO"` a `"TENTATIVO"`, y se agregaron campos `payment_status`, `advance_payment` y `balance_due` al mapeo de datos de Producción para mostrar la información financiera real.

### Error E: Auto-modificación silenciosa de la hora capturada
**Síntoma:** El repartidor capturaba una hora de entrega (ej. 10:00 AM), pero el sistema automáticamente la cambiaba a las 6:00 PM sin avisar, porque calculaba que el lead time de producción no alcanzaba.
**Diagnóstico:** El `useEffect` de auto-rellenado verificaba si la fecha/hora capturada era "demasiado temprana" y la sobreescribía con la mínima calculada, sin informar al usuario.
**Solución:** El auto-rellenado ahora SOLO actúa si el campo de fecha está completamente vacío. Si el usuario ya capturó algo, el sistema lo respeta y simplemente bloquea el envío al intentar guardar, mostrando un toast de error claro.

### Error F: "Failed to fetch" al abrir nueva jornada (Columna de base de datos faltante)
**Síntoma:** Al intentar "ABRIR JORNADA DE HOY" desde la interfaz, el frontend lanzaba inmediatamente un `Error de red: Failed to fetch`.
**Diagnóstico:** El modelo en Python definía el campo `dispatched_at` (añadido recientemente para rastrear la hora de despacho de ruta), pero la tabla física en la base de datos carecía de esta columna. El script inicial (`auto_seed_on_first_boot`) usa `Base.metadata.create_all`, el cual **no realiza migraciones** en tablas ya existentes.

### Error G: "SIN CONEXIÓN — MODO LOCAL ACTIVO" falso al acceder desde internet (12/Julio/2026)
**Síntoma:** El repartidor accedía al sistema desde su celular con datos móviles vía `reparto.rdericotoluca.com`. La interfaz cargaba correctamente, pero el banner ámbar permanecía fijo en la parte superior porque el heartbeat al endpoint `/health` fallaba al intentar atacar una URL pública con puerto local (ej: `http://reparto.rdericotoluca.com:5001/health`).
**Solución:** Se reemplazó la construcción manual de la URL por una derivada de `CONFIG.API_BASE_URL`.

### Error H: Timestamps del Backend en UTC en vez de Hora de México (13/Julio/2026)
**Síntoma:** Las visitas del repartidor se registraban con hora UTC en la base de datos. Una visita realizada a las 22:00 hora de México aparecía como `04:00` del día siguiente en `arrived_at` y `completed_at`.
**Diagnóstico:** La función `create_visit()` en `service.py` usaba `datetime.now()`, que devuelve la hora del **sistema operativo del contenedor Docker**. Los contenedores Docker corren en UTC por defecto, independientemente del timezone del host Windows.
**Solución:** Se creó una función helper `_now_mexico()` a nivel de módulo en `service.py` que fuerza explícitamente `America/Mexico_City`:
```python
# SOLUCIÓN APLICADA EN apps/api/modules/grandeza/service.py
from zoneinfo import ZoneInfo
MEXICO_TZ = ZoneInfo('America/Mexico_City')
def _now_mexico():
    return datetime.now(MEXICO_TZ).replace(tzinfo=None)
```
Se reemplazaron los 3 usos de `datetime.now()` en el archivo (despacho, llegada, cierre).

---

## 7. Directivas Generales para Modificar este Módulo
1. **Jamás modificar el POS para arreglar Grandeza:** Si Grandeza requiere una adaptación, se debe hacer mediante nuevas columnas específicas en tablas `grandeza_` o interfaces únicas en su módulo de React. 
2. **Prevenir errores de red falsos:** Siempre utilizar herramientas como `Invoke-RestMethod` o `curl` directamente en el entorno de backend para desenmascarar errores 500, en lugar de confiar ciegamente en el `TypeError: Failed to fetch` del frontend.
3. **Zona horaria inquebrantable:** Toda operación relacionada a fechas y días de la semana (`hoy`) debe calcularse forzando explícitamente `America/Mexico_City`. No depender del reloj local no-filtrado del dispositivo móvil.
4. **Respetar la captura del usuario:** Nunca sobreescribir silenciosamente datos que el usuario ya capturó (fechas, horas, montos). Si hay un problema de validación, bloquearlo al intentar guardar con un mensaje claro, no modificar el dato a sus espaldas.
5. **Status de producción ≠ Status de pago:** El campo `status` es el flujo de producción (TENTATIVO, EN_PREPARACION, etc.). El campo `payment_status` es el estado financiero (PAGADO, ANTICIPO, PENDIENTE). Nunca mezclarlos.
6. **Eager loading obligatorio en SQLAlchemy Async:** Cualquier relación ORM que se acceda dentro de un bucle de serialización DEBE precargarse con `selectinload()` en la consulta inicial. De lo contrario, FastAPI dispara un error 500 silencioso que el frontend reporta como "Failed to fetch".
7. **Sincronización de Base de Datos (Migraciones):** Ya que el sistema usa `create_all` al arrancar, este no altera tablas existentes. Si agregas columnas a los modelos de SQLAlchemy, DEBES ejecutar el `ALTER TABLE` correspondiente en la base de datos; de lo contrario, provocarás caídas silenciosas (Error 500).
8. **No instalar Service Workers ni PWA plugins globales:** El frontend del POS y Grandeza comparten el mismo Vite build. Registrar un Service Worker global interceptaría las peticiones del POS. La funcionalidad offline se resuelve exclusivamente con IndexedDB dentro de `GrandezaDriverUI.jsx`.
9. **Toda URL de API debe derivarse de `CONFIG.API_BASE_URL`:** Nunca construir URLs de API manualmente con `window.location.hostname + ':5001'`. El archivo `config.js` es la **única fuente de verdad** para la base de la URL de API. Cualquier servicio interno (networkMonitor, GPS, sync) debe derivar su URL desde `CONFIG.API_BASE_URL`. Hardcodear puertos causa falsos negativos de conectividad cuando se accede desde internet vía Cloudflare Tunnels (ver Error G).
10. **Timestamps del backend en hora de México:** Dentro del módulo Grandeza, **nunca usar `datetime.now()` directamente**. Siempre usar la función helper `_now_mexico()` definida en `service.py`, que fuerza `America/Mexico_City` y devuelve un datetime naive compatible con PostgreSQL. Los contenedores Docker corren en UTC por defecto (ver Error H).

---

## 8. Arquitectura Offline-First (Modo Sin Conexión)

La herramienta del repartidor (`GrandezaDriverUI.jsx`) está diseñada para funcionar en zonas sin cobertura celular.

### Archivos Involucrados
- `apps/pos/services/offlineStore.js`: Capa de persistencia local usando IndexedDB nativo (sin librerías externas).
- `apps/pos/services/networkMonitor.js`: Monitor de conectividad con doble verificación (eventos del navegador + heartbeat al endpoint `/health`).

### Flujo Offline
1. **Al cargar con internet (mañana en la panadería):** `loadAll()` descarga toda la información (jornada, productos, clientes, inventario, ruta) y la guarda en IndexedDB (`cacheRouteData()`).
2. **Al perder señal:** Un banner discreto ámbar aparece: "📡 Sin conexión — Modo local activo". La app sigue funcionando normalmente.
3. **Al registrar una visita sin red:** El `saveVisit()` detecta el error de red y en lugar de mostrar "Error de red", encola la operación en `sync_queue` de IndexedDB. La visita se muestra optimistamente en la UI.
4. **GPS sin red:** Las coordenadas no se descartan (antes `.catch(() => {})`). Se guardan en `gps_buffer` de IndexedDB.
5. **Al recuperar señal:** El monitor de red detecta conectividad real (heartbeat exitoso a `/health`), procesa la cola automáticamente (`processQueue()`), envía el GPS buffereado (`flushGPSBuffer()`), y recarga datos frescos del servidor.

### IndexedDB: 3 Object Stores
| Store | Propósito | Clave |
|---|---|---|
| `cached_data` | Snapshot de jornada, productos, clientes, inventario, ruta | `key` (string) |
| `sync_queue` | Cola de operaciones HTTP pendientes | Auto-increment `id` |
| `gps_buffer` | Coordenadas GPS capturadas sin internet | Auto-increment `id` |

### Resolución de Conflictos al Sincronizar
- **HTTP 200/201:** Exitoso → eliminar de la cola
- **HTTP 409/422/404:** Conflicto (jornada cerrada, duplicado) → eliminar de cola + notificar al repartidor
- **HTTP 500:** Error del servidor → reintentar en el siguiente ciclo

### Por qué NO se usa Service Worker
El POS y Grandeza comparten el mismo dominio y build de Vite. Un Service Worker registrado globalmente interceptaría las peticiones del POS, arriesgando cachear datos obsoletos o bloquear actualizaciones críticas del punto de venta. La solución con IndexedDB es más segura porque actúa solo a nivel de componente React, no a nivel de navegador.

---

## 9. Integración WhatsApp (Deep Links)

La función `sendWhatsApp()` en `GrandezaDriverUI.jsx` genera una nota de venta formateada y la envía al cliente vía WhatsApp usando enlaces profundos (`wa.me`).

### Flujo
1. El repartidor captura la venta (productos, cantidades, pago).
2. Presiona "Enviar ticket por WhatsApp".
3. Se genera un mensaje con formato Markdown de WhatsApp: fecha, nombre del cliente, productos, cantidades (entregas y recompras), importes netos, total, cambio y el número de Servicio al Cliente (SAC).
4. El formato está diseñado para ser profesional, compacto y fácil de leer en un sola pantalla de móvil, omitiendo leyendas promocionales.
5. Se abre `https://wa.me/52XXXXXXXXXX?text=...` que dispara la app de WhatsApp con el mensaje pre-escrito.

### Validación de Teléfono
- Se limpian caracteres no numéricos (`replace(/\D/g, '')`)
- Se valida longitud de 10 dígitos (formato México)
- Si el teléfono tiene más de 10 dígitos, se toman los últimos 10
- Si no hay teléfono registrado, se abre WhatsApp sin destinatario para que el repartidor elija el contacto manualmente

### Costo
Gratuito. No requiere API de WhatsApp Business ni aprobación de Meta. Usa el número del celular del repartidor.

---

## 10. Despliegue en Internet (Cloudflare Tunnels)

Aunque el módulo cuenta con una arquitectura Offline-First para lidiar con pérdida de señal, el objetivo principal es que el repartidor opere en **tiempo real** desde la calle usando sus datos móviles.

Para lograr esto de forma segura sin exponer el servidor local (abrir puertos en el router), se implementa **Cloudflare Tunnels** (`cloudflared` como servicio de Windows/Linux).

### Enrutamiento de Subdominios (Public Hostnames)
El túnel conecta la red privada hacia la red global de Cloudflare mediante dos reglas:
1. **Frontend:** `reparto.tudominio.com` → `http://localhost:5000`
2. **Backend (API):** `api.tudominio.com` → `http://localhost:5001`

### Resolución Dinámica de API (config.js)
El archivo `apps/pos/config.js` está diseñado para manejar conexiones híbridas. Evalúa `window.location.hostname` al arrancar:
- **Si es Local/LAN (ej. `192.168.1.124` o `localhost`):** Dirige el tráfico de red directamente al puerto `5001`.
- **Si es Público (ej. `reparto.rdericotoluca.com`):** Sustituye el subdominio por `api` (ej. `api.rdericotoluca.com`) y dirige el tráfico usando el puerto por defecto de HTTPS (443), saltándose el puerto local 5001 que no está expuesto a internet.

**Instalación PWA (Progressive Web App)**
Se recomienda que el repartidor abra el enlace (`reparto.rdericotoluca.com/?terminal=DRIVER`) en Google Chrome o Safari y utilice la opción "Agregar a la pantalla principal". Esto oculta la barra de navegación del navegador y permite que el sistema opere a pantalla completa como una aplicación nativa.

---

## 11. Nuevas Funcionalidades y Refinamientos (v7.1.0)

En la versión 7.1.0 se agregaron refinamientos operativos para mejorar la inteligencia y usabilidad del sistema:

### 11.1 Sugerencias Dinámicas (Herramienta Repartidor)
El sistema ahora recalcula la cantidad "Sugerida" de piezas en **tiempo real** mientras el repartidor ingresa los cambios de mercancía.
- **Lógica:** `Sugerido = (Frescas dejadas la visita anterior) - (Cambios recogidos hoy)`
- Esta métrica refleja las piezas que el cliente *efectivamente capitalizó* (vendió), lo cual es más preciso que un simple promedio histórico.
- **Indicador Visual:** Cuando el sistema realiza este cálculo dinámico, la sugerencia cambia de color azul a **cyan con un icono de rayo (⚡)** para indicar al repartidor que el número está siendo ajustado basándose en los cambios que acaba de ingresar.
- **Endpoint:** El endpoint `/suggestions` (`service.py`) ahora devuelve `last_fresh_qty` adicional al `suggested_qty` (promedio histórico) para posibilitar este cálculo reactivo en el frontend.

### 11.2 Modal de Estadísticas por Cliente (Herramienta Administrador)
Se agregó un botón **"📊"** en el directorio de clientes de la suite `GrandezaParamsUI`.
- Abre un modal detallado que muestra el **historial completo de visitas** del cliente.
- Incluye un filtro dropdown para ver el rendimiento por producto específico.
- Muestra tarjetas resumen con promedios de: Visitas, Frescas, Cambios, Capitalizadas y Sugeridas.
- La tabla de historial resalta las últimas 3 visitas, indicando visualmente que estas son las que el sistema utiliza para calcular la sugerencia de inventario por defecto.

### 11.3 UI y Comunicación
- **WhatsApp:** El mensaje fue rediseñado para ser más profesional y ocupar menos espacio en pantalla. Se eliminaron los íconos excesivos y las leyendas de la marca ("R DE RICO", "PAN GRANDEZA"). Se agregó el teléfono de Servicio al Cliente (SAC) al final. El término "cambios" fue reemplazado por "recompras" para mayor claridad del cliente.
- **Sidebar:** El botón flotante de la suite Grandeza en el menú principal (`ExperimentCenterUI`) fue rediseñado de un cuadrado a un medio círculo estilizado, ocupando menos espacio y mejorando la estética.

---

## 12. Mejoras de Robustez y Correcciones (v7.2.0 — 13/Julio/2026)

### 12.1 Persistencia de Borrador de Visita (Anti-Kill de Pestaña Móvil)
**Problema:** Cuando el repartidor cambiaba de app en el celular (WhatsApp, llamada, etc.), el SO de Android/iOS podía matar la pestaña del navegador para liberar RAM. Al regresar, la página se recargaba y **todos los datos capturados** (piezas de cambio, frescas, pago recibido, notas) se perdían.

**Solución:** Se implementó un hook `useVisitDraft` en `GrandezaDriverUI.jsx` que persiste automáticamente los datos de la visita activa en `localStorage` del navegador en cada cambio de campo. Al recargar la página, si existe un borrador, se restaura inmediatamente incluyendo la vista activa.

### 12.2 Fix: Modal de Edición de Cliente en Vista de Visita
**Problema:** El botón ✏️ de editar cliente dentro de la vista de visita no abría el modal. Funcionaba solo si el usuario presionaba "← Ruta" después.

**Causa:** El componente `EditClientModal` estaba renderizado en las vistas de ESPERANDO_FIRMA y Ruta, pero **faltaba en la vista de Visita**. 

**Solución:** Se agregó el renderizado de `EditClientModal` dentro del bloque JSX de la vista de visita. Al guardar cambios del cliente, también se actualiza `activeVisit` para que la UI refleje los datos nuevos inmediatamente.

### 12.3 Protección contra Visitas Duplicadas (Backend)
**Problema:** Podían registrarse múltiples visitas al mismo cliente en la misma jornada.

**Solución:** Se agregó validación en `create_visit()` de `service.py`. Antes de crear la visita, verifica si ya existe una visita `COMPLETADA` para el mismo `client_id` en la misma jornada. Si existe, rechaza con **HTTP 409**.
**Frontend:** `saveVisit()` ahora maneja el 409 específicamente: muestra toast "⚠️ Este cliente ya fue visitado hoy", limpia el borrador y regresa a la vista de ruta.

### 12.4 Corrección de Timezone en Timestamps del Backend
**Problema:** Los timestamps de visitas (`arrived_at`, `completed_at`) y despacho de ruta (`dispatched_at`) se guardaban en UTC en vez de hora de México.

**Solución:** Se creó la función helper `_now_mexico()` a nivel de módulo en `service.py` que fuerza `America/Mexico_City` y devuelve un datetime naive compatible con PostgreSQL. Se reemplazaron los 3 usos de `datetime.now()` en el archivo. (Ver detalles en **Error H**).

> ⚠️ **NOTA:** Esta corrección es exclusiva del módulo Grandeza. Una corrección global a nivel de contenedor Docker queda pendiente como proyecto separado que requiere auditoría completa del ERP.

---

## 13. Rutas Extraordinarias (v7.3.0 — 20/Julio/2026)

### 13.1 Visión General
Se agregó la capacidad de crear **rutas extraordinarias** para fechas específicas que reemplazan automáticamente la ruta regular del día de la semana. La ruta extraordinaria aplica **solo para ese día**, y al día siguiente el sistema vuelve a las rutas regulares sin intervención manual.

**Casos de uso:**
- Días festivos donde la ruta cambia (12 de diciembre, Día de Muertos, Navidad).
- Pedidos especiales para un evento — se agrega un cliente que no está en la ruta regular.
- Vacaciones de un cliente — se saca de la ruta solo ese día sin alterar la plantilla semanal.
- Cobertura de otra zona — un repartidor cubre una zona diferente un día específico.

### 13.2 Arquitectura: Endpoint Inteligente `get_effective_route`
El corazón de esta funcionalidad es un **único endpoint inteligente** que decide qué ruta devolver:

```
GET /api/v1/grandeza/routes/effective/{fecha}
```

**Lógica de decisión:**
1. ¿Existe una ruta extraordinaria para esa fecha exacta? → **SÍ:** Devolver `type: "EXTRAORDINARIA"` con sus slots y etiqueta.
2. ¿No existe? → Calcular el día de la semana de esa fecha y devolver la ruta regular con `type: "REGULAR"`.

```
Driver abre la app → fetch /routes/effective/2026-12-25
                │
    ┌─────────────────────────────────────┐
    │  get_effective_route(2026-12-25)    │
    │  1. ¿Existe extraordinaria? → SÍ   │
    │  2. Retorna type: EXTRAORDINARIA    │
    └─────────────────────────────────────┘
                │
    Driver ve: ⚡ RUTA EXTRAORDINARIA — "Ruta Navidad"
                │
    Al día siguiente (26 Dic)...
    ┌─────────────────────────────────────┐
    │  get_effective_route(2026-12-26)    │
    │  1. ¿Existe extraordinaria? → NO   │
    │  2. weekday() → VIERNES            │
    │  3. Retorna type: REGULAR          │
    └─────────────────────────────────────┘
```

### 13.3 Base de Datos

**Nueva tabla:** `grandeza_extraordinary_route_slots`

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | SERIAL PK | Identificador único |
| `route_date` | DATE (indexed) | Fecha exacta de la ruta extraordinaria |
| `client_id` | INTEGER FK → `grandeza_clients.id` | Cliente asignado |
| `visit_order` | INTEGER | Posición en la secuencia del día |
| `label` | VARCHAR (nullable) | Etiqueta opcional (ej: "Ruta Día de Muertos") |
| `created_at` | TIMESTAMP | Fecha de creación |

**Modelo SQLAlchemy:** `GrandezaExtraordinaryRouteSlot` en `apps/api/modules/grandeza/models.py`

**Migración SQL:**
```sql
CREATE TABLE IF NOT EXISTS grandeza_extraordinary_route_slots (
    id SERIAL PRIMARY KEY,
    route_date DATE NOT NULL,
    client_id INTEGER NOT NULL REFERENCES grandeza_clients(id),
    visit_order INTEGER NOT NULL,
    label VARCHAR,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_grandeza_extraordinary_route_slots_route_date 
    ON grandeza_extraordinary_route_slots(route_date);
```

### 13.4 API — Endpoints Nuevos

| Método | Endpoint | Propósito |
|--------|----------|-----------|
| `GET` | `/routes/effective/{fecha}` | **Ruta inteligente:** prioriza extraordinaria sobre regular (usado por el Driver) |
| `GET` | `/routes/extraordinary` | Lista todas las rutas extraordinarias con resumen (Admin) |
| `GET` | `/routes/extraordinary/{fecha}` | Obtener los slots de una ruta extraordinaria específica (Admin) |
| `PUT` | `/routes/extraordinary/{fecha}` | Crear o reemplazar una ruta extraordinaria completa (Admin) |
| `DELETE` | `/routes/extraordinary/{fecha}` | Eliminar una ruta extraordinaria (Admin) |

> ⚠️ **IMPORTANTE (FastAPI):** Los endpoints con rutas literales (`/effective`, `/extraordinary`) se registran **ANTES** que `/routes/{day_of_week}` en `router.py` para evitar que FastAPI capture "effective" o "extraordinary" como un parámetro `day_of_week`.

### 13.5 Backend — Servicio

5 funciones nuevas en `apps/api/modules/grandeza/service.py`:

| Función | Propósito |
|---------|-----------|
| `get_extraordinary_route(db, route_date)` | Obtener slots con eager loading de clientes |
| `set_extraordinary_route(db, route_date, slots, label)` | Reemplazar ruta completa (delete + insert) |
| `delete_extraordinary_route(db, route_date)` | Eliminar ruta por fecha |
| `list_extraordinary_routes(db)` | Agrupar por fecha con conteo de clientes |
| `get_effective_route(db, route_date)` | **Función inteligente** de decisión |

### 13.6 Frontend — Administrador (`GrandezaParamsUI.jsx`)

Se agregó una sección **⚡ Rutas Extraordinarias** en la pestaña "Rutas por Día", debajo de las rutas regulares. Diseño con tema púrpura para diferenciarse visualmente de las rutas regulares (naranja).

**Componentes:**
- **Lista de rutas existentes:** Tarjetas con fecha formateada, día de la semana, etiqueta, conteo de clientes, y botones Editar/Eliminar. Las rutas pasadas se muestran con opacidad reducida.
- **Botón "+ Nueva Ruta":** Abre el modal de edición.
- **Modal Editor:** Date picker nativo (`<input type="date">`), campo de etiqueta opcional, y la misma mecánica de agregar/quitar/reordenar clientes que las rutas regulares.
- **Modal de confirmación de eliminación:** Estilo destructivo con nombre de fecha y día.

**Diseño Responsivo:**
- **Móvil:** Modal se abre desde abajo con bordes redondeados superiores (`items-end`, `rounded-t-[32px]`). Botones full-width. Tarjetas se apilan verticalmente.
- **Desktop:** Modal centrado. Layout de 3 columnas (lista 2/3 + panel agregar 1/3).

### 13.7 Frontend — Herramienta Repartidor (`GrandezaDriverUI.jsx`)

**Cambio mínimo (3 líneas + badge visual):**

El fetch de la ruta cambió de:
```javascript
// ANTES
const routeRes = await fetch(`${API}/grandeza/routes/${todayDay}`);
const rSlots = routeRes.ok ? await routeRes.json() : [];

// DESPUÉS
const routeRes = await fetch(`${API}/grandeza/routes/effective/${todayStr()}`);
const routeData = routeRes.ok ? await routeRes.json() : { type: 'REGULAR', slots: [] };
const rSlots = routeData.slots || [];
```

**Badge visual:** Cuando la ruta es extraordinaria, se muestra un indicador púrpura en el encabezado:
```
⚡ Ruta Extraordinaria — "Ruta Navidad"
```
Esto avisa al repartidor que no es su ruta habitual.

**Caché offline:** Sigue funcionando sin cambios. La estructura de `rSlots` (array de objetos con `client_id`, `visit_order`, `client`) es idéntica.

### 13.8 Archivos Modificados (Resumen)

| Archivo | Tipo de Cambio |
|---------|---------------|
| `apps/api/modules/grandeza/models.py` | Nuevo modelo `GrandezaExtraordinaryRouteSlot` |
| `apps/api/modules/grandeza/schemas.py` | 3 schemas nuevos |
| `apps/api/modules/grandeza/service.py` | Import + 5 funciones nuevas |
| `apps/api/modules/grandeza/router.py` | 5 endpoints nuevos (antes de `{day_of_week}`) |
| `apps/pos/GrandezaParamsUI.jsx` | Sección UI + state + handlers para rutas extraordinarias |
| `apps/pos/GrandezaDriverUI.jsx` | Fetch a `/effective/{fecha}` + badge visual |
| **POS (RetailVisionPOS.jsx)** | **CERO cambios** ✅ |

---

## 14. Gastos Operativos del Repartidor (v7.4.0 — 22/Julio/2026)

### 14.1 Visión General
Se agregó la capacidad de que el repartidor registre **gastos operativos** durante su jornada (gasolina, peajes, estacionamiento, reparaciones, comida, etc.). Estos gastos se persisten en PostgreSQL y se integran al arqueo de caja.

### 14.2 Base de Datos

**Nueva tabla:** `grandeza_expenses`

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | SERIAL PK | Identificador único |
| `journey_id` | INTEGER FK → `grandeza_journeys.id` | Jornada asociada |
| `description` | VARCHAR | Descripción del gasto (ej: "Gasolina") |
| `amount` | FLOAT | Monto del gasto |
| `created_at` | TIMESTAMP | Fecha de creación |

**Modelo SQLAlchemy:** `GrandezaExpense` en `apps/api/modules/grandeza/models.py`

### 14.3 API — Endpoints

| Método | Endpoint | Propósito |
|--------|----------|-----------|
| `GET` | `/journeys/{id}/expenses` | Listar gastos de una jornada |
| `POST` | `/journeys/{id}/expenses` | Registrar un nuevo gasto |
| `DELETE` | `/expenses/{expense_id}` | Eliminar un gasto |

### 14.4 Frontend — Herramienta Repartidor (`GrandezaDriverUI.jsx`)

- Nuevo botón **💸 Gastos** en la barra de navegación inferior.
- Vista `expenses` con lista de gastos existentes + formulario para agregar nuevos.
- Botón de eliminar por gasto individual.
- Diseño mobile-first con el mismo estilo oscuro del resto de la app.

### 14.5 Arqueo de Caja (Fórmula Simplificada)
Se implementó la sección **"Arqueo de Caja"** en la vista `summary` del repartidor, usando la fórmula:

```
Efectivo Esperado = Fondo de Caja + Dinero de las Ventas - Gastos Operativos
```

Se muestra en una tabla clara con filas para cada componente, colores diferenciados (azul para fondo, verde para ventas, rojo para gastos, ámbar para el total esperado).

> ⚠️ **NOTA:** El usuario solicitó específicamente usar "Dinero de las ventas" en lugar de "Dinero cobrado" y "Cambios entregados". La fórmula simplificada refleja el neto real de la operación.

---

## 15. Mejoras a la Herramienta del Gerente — Cierre de Jornada (v7.4.0)

### 15.1 Cambios en la UI Principal (`GrandezaDailyUI.jsx`)

| Cambio | Detalle |
|--------|---------|
| ❌ Piezas Total | Eliminado del encabezado de inventario inicial (era redundante) |
| 🔧 Fondo de Caja | Corregida responsividad: `min-w-0` en input, fuente reducida, `shrink-0` en el signo `$` |
| ❌ Ruta en Curso (3 recuadros) | Eliminados los recuadros de Venta Total, Efectivo Esperado y Frescas Sobrantes |
| 📍 Google Maps | Botón "Ver en Mapa" que abre la última ubicación GPS del repartidor usando el endpoint `GET /journeys/{id}/locations` |
| 📝 Bitácora mejorada | Se muestra tipo de visita (⚡ Extra / 📋 Prog.) y hora de cada visita |

### 15.2 Recepción de Mercancía (Tabla por Producto)

Se reemplazó el formulario simple de 3 inputs por una **tabla detallada por producto** con las siguientes columnas:

| Producto | Inic. | Vend. | Sobr. Esp. | Sobr. Rec. | Dif. | Camb. Esp. | Camb. Rec. | Dif. |
|----------|:-----:|:-----:|:----------:|:----------:|:----:|:----------:|:----------:|:----:|
| Concha Fina | 50 | 35 | 15 | _input_ | auto | 8 | _input_ | auto |

- **Datos automáticos:** Inventario Inicial, Vendidas, Sobrantes Esperadas, Cambios Esperados → calculados desde las visitas completadas.
- **Datos editables:** Sobrantes Recibidas y Cambios Recibidos → inputs para el gerente.
- **Diferencia:** Calculada en tiempo real (`recibido - esperado`). Verde si ≥ 0, rojo si < 0.
- **State:** `productReceipts` → objeto `{ product_id: { freshReceived: '', exchangeReceived: '' } }`

### 15.3 Recepción de Dinero (Tabla con Gastos)

Se agregó una tabla financiera completa que integra los gastos operativos:

| Concepto | Monto |
|----------|------:|
| Fondo de Caja | $500.00 (auto) |
| (+) Dinero de las Ventas | $3,240.00 (auto) |
| (-) Gastos Operativos | -$350.00 (auto, con detalle expandido) |
|     _→ Gasolina_ | _-$200.00_ |
|     _→ Estacionamiento_ | _-$150.00_ |
| **= Efectivo Esperado** | **$3,390.00** (auto) |
| Efectivo Recibido | _input_ |
| **Diferencia** | **auto** (verde si ≥ 0, rojo si < 0) |

Los gastos se obtienen del endpoint `GET /journeys/{id}/expenses`.

### 15.4 Modal de Confirmación Mejorado
El modal de cierre ahora muestra la diferencia de efectivo antes de confirmar, con color verde/rojo según corresponda.

### 15.5 Datos Enviados al Cerrar
El payload de `PATCH /journeys/{id}` ahora incluye totales por producto:

```json
{
    "status": "CERRADA",
    "cash_expected": 3390.00,
    "cash_received": 3400.00,
    "exchange_pieces_expected": 25,
    "exchange_pieces_received": 24,
    "fresh_leftover_expected": 45,
    "fresh_leftover_received": 44,
    "feedback_notes": "Todo bien, un cliente cerrado"
}
```

---

## 16. Módulo Producción Grandeza (v7.4.0)

### 16.1 Visión General
Se agregó un nuevo módulo al **Gestor de Producción** que permite al gerente de producción ver **cuántas piezas de cada producto necesita producir** para la ruta del día siguiente, basado en el historial de ventas de cada cliente incluido en la ruta.

**Contexto operativo:**
- La producción se efectúa a las **20:00 hrs** (horario central de México).
- El empaquetado es entre **6:00 y 9:00 hrs** del día de reparto.
- Las cantidades son **dinámicas**: si se modifica la ruta extraordinaria del día siguiente, las cantidades se recalculan automáticamente.

### 16.2 Backend — Endpoint de Estimación

```
GET /api/v1/grandeza/production-estimate/{fecha}?last_n=10
```

**Lógica del algoritmo:**
1. Determinar la ruta del `{fecha}`: si existe `extraordinary_route_slots` para esa fecha, usar esos clientes; si no, usar `route_slots` del `day_of_week` correspondiente.
2. Para cada cliente en la ruta, consultar sus **últimas N visitas completadas** (default: 10).
3. Calcular el **promedio de `actual_fresh_qty`** por producto por cliente.
4. Aplicar `Math.ceil(promedio)` para redondear hacia arriba (no quedarse corto).
5. Sumar los estimados de todos los clientes para obtener el total por producto.

**Respuesta:**
```json
{
    "route_date": "2026-07-23",
    "route_type": "REGULAR",
    "route_label": null,
    "client_count": 12,
    "clients": [
        {
            "client_id": 5,
            "client_name": "Tienda Doña Mary",
            "business_name": "Abarrotes Mary",
            "visit_count": 10,
            "products": [
                { "product_id": 1, "product_name": "Concha Fina", "avg_qty": 4.5, "estimated_qty": 5 }
            ]
        }
    ],
    "totals": [
        { "product_id": 1, "product_name": "Concha Fina", "total_avg": 42.3, "total_estimated": 45 }
    ]
}
```

### 16.3 Frontend — Botón en Gestor de Producción (`ProductionManagementUI.jsx`)

Se agregó un **4to botón** con estilo amber/gold y emoji 🍞:
```
🍞 PRODUCCIÓN GRANDEZA
   Estimación de piezas por ruta
```
Hover: fondo amber-500, texto negro, flecha oscura.

### 16.4 Frontend — Suite de Producción (`GrandezaProductionUI.jsx`)

**Archivo nuevo:** `apps/production/GrandezaProductionUI.jsx`

**Componentes:**
1. **Header:** Logo Grandeza + título "PRODUCCIÓN GRANDEZA" + botón Volver.
2. **Selector de fecha:** Default = mañana. Muestra día de la semana.
3. **Badge de tipo de ruta:** Azul "📋 Ruta Regular" o Púrpura "⚡ Ruta Extraordinaria" con etiqueta si aplica.
4. **Tabla resumen "Piezas a Producir":** Cards por producto con total estimado prominente + badge de total general.
5. **Tabla "Desglose por Cliente":** Tabla con una **columna por cada producto** habilitado:

| # | Cliente | Concha Fina | Cuernito | Polvorón | Total |
|:-:|---------|:-----------:|:--------:|:--------:|:-----:|
| 1 | Tienda Doña Mary | **5** | **3** | — | 8 |
| 2 | Abarrotes El Sol | **8** | — | **2** | 10 |
| **Total a Producir** | | **13** | **3** | **2** | **18** |

- Celdas con valor > 0 en naranja, celdas vacías muestran "—" en gris.
- Fila de totales al pie con fondo naranja sutil.
- Scroll horizontal en móvil (`overflow-x-auto`).

### 16.5 Archivos Modificados (Resumen)

| Archivo | Tipo de Cambio |
|---------|---------------|
| `apps/api/modules/grandeza/models.py` | Nuevo modelo `GrandezaExpense` |
| `apps/api/modules/grandeza/schemas.py` | Schema `GrandezaExpenseCreate` |
| `apps/api/modules/grandeza/service.py` | CRUD gastos + `get_production_estimate()` |
| `apps/api/modules/grandeza/router.py` | Endpoints gastos + `/production-estimate/{date}` |
| `apps/pos/GrandezaDriverUI.jsx` | Vista gastos + Arqueo de Caja |
| `apps/pos/GrandezaDailyUI.jsx` | Cierre de Jornada rediseñado (tablas Mercancía/Dinero, Google Maps) |
| `apps/production/ProductionManagementUI.jsx` | Botón 🍞 Producción Grandeza |
| `apps/production/GrandezaProductionUI.jsx` | **NUEVO** — Suite de estimación de producción |
| **POS (RetailVisionPOS.jsx)** | **CERO cambios** ✅ |

---

## 17. Programación de Mensajes WhatsApp (v7.5.0 — 22/Septiembre/2026)

### 17.1 Visión General

Se agregó una **4ta pestaña** llamada **"Programación de Mensajes"** (💬) a la suite de administración `GrandezaParamsUI.jsx`. Permite al administrador:

1. **Definir el mensaje de WhatsApp a voluntad** (texto libre, sin plantillas fijas).
2. **Elegir los destinatarios** mediante un selector con 11 opciones.
3. **Programar día y hora** del envío.
4. **Marcar la repetición semanal** (acción cíclica).

**Decisión de diseño fundamental (D-2):** El ERP **NO envía** el mensaje. El ERP **prepara** el texto y el destinatario, el humano pulsa "Enviar WhatsApp" (deep link `wa.me`) y el ERP **registra el hecho** en una bitácora. Esto elimina la necesidad de la API de WhatsApp Business (aprobación de Meta, costos, tokens) y mantiene al humano en control del envío.

**Contexto operativo:**
- El administrador accede desde su **celular** (la pestaña es responsive).
- El mensaje es **el mismo para todos** los destinatarios (D-3) — no hay personalización por cliente.
- Los envíos se agrupan en **lotes de 5** (D-4) para ergonomía en pantalla móvil.
- **Sin funciones de IA** (D-5) — fue una decisión explícita del usuario.

### 17.2 Base de Datos

**Tabla nueva:** `grandeza_message_log` (bitácora inmutable de envíos).

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | SERIAL PK | Identificador |
| `client_id` | INTEGER FK → `grandeza_clients.id` | Cliente destinatario |
| `phone_used` | VARCHAR(20) | Teléfono normalizado a 10 dígitos |
| `message_text` | TEXT | **Snapshot** del texto enviado |
| `selector_used` | VARCHAR(30) | Selector que originó el lote |
| `sent_at` | TIMESTAMP | UTC (ver DT-01) |
| `sent_by` | VARCHAR(100) | Quién lo envió (nullable) |
| `batch_id` | VARCHAR(40) | Agrupa los envíos de un mismo lote |

**Índices:** `ix_grandeza_message_log_client_id`, `ix_grandeza_message_log_sent_at`.

**Ledger inmutable:** `message_text` se **COPIA** en cada registro (no se referencia). Si mañana el administrador cambia la plantilla, el historial sigue mostrando lo que realmente se envió ese día.

**Creación explícita de la tabla:** Como `create_all` **NO altera tablas existentes** (ver §7.7), la tabla se crea de forma idempotente en `apps/api/main.py` (Paso 1.4) con `CREATE TABLE IF NOT EXISTS` + 2 `CREATE INDEX IF NOT EXISTS`.

**Configuración persistida:** Los 6 parámetros de la programación se guardan como filas en la tabla existente `grandeza_settings` (no se creó tabla nueva para esto):

| Clave en `grandeza_settings` | Contenido |
|------------------------------|-----------|
| `msg_schedule_enabled` | `"1"` / `"0"` |
| `msg_schedule_text` | Texto libre del mensaje |
| `msg_schedule_selector` | Selector activo (ej. `JUEVES`) |
| `msg_schedule_send_day` | Día de envío (`LUNES`..`DOMINGO`) |
| `msg_schedule_send_time` | `"HH:MM"` hora local (intención de negocio) |
| `msg_schedule_weekly` | `"1"` / `"0"` |

### 17.3 Los 11 Selectores de Destinatarios

| Selector | Significado |
|----------|-------------|
| `TODOS` | Todos los clientes registrados |
| `ACTIVOS` | Solo clientes con `active = true` |
| `INACTIVOS` | Solo clientes con `active = false` |
| `LUNES` | Clientes con ruta asignada el lunes |
| `MARTES` | Clientes con ruta asignada el martes |
| `MIERCOLES` | Clientes con ruta asignada el miércoles |
| `JUEVES` | Clientes con ruta asignada el jueves |
| `VIERNES` | Clientes con ruta asignada el viernes |
| `SABADO` | Clientes con ruta asignada el sábado |
| `DOMINGO` | Clientes con ruta asignada el domingo |
| `PROXIMA_EXTEMPORANEA` | Clientes de la **próxima ruta extraordinaria** (la más cercana con `route_date >= hoy`) |

**Ejemplo de uso (D-1, Modelo 2):** *"martes 9:00 AM → clientes del jueves"*. El administrador elige el selector `JUEVES` y programa el envío para el día `MARTES` a las `09:00`. El sistema le presenta los clientes del jueves para que les avise con antelación.

### 17.4 API — Endpoints Nuevos

```
GET  /api/v1/grandeza/message-schedule
PUT  /api/v1/grandeza/message-schedule
GET  /api/v1/grandeza/message-recipients?selector={SELECTOR}
POST /api/v1/grandeza/message-log
GET  /api/v1/grandeza/message-log?limit=100
```

| Endpoint | Propósito |
|----------|-----------|
| `GET /message-schedule` | Lee la configuración (texto, selector, día, hora, weekly, enabled) |
| `PUT /message-schedule` | Guarda la configuración (valida selector y día) |
| `GET /message-recipients` | Resuelve los destinatarios según el selector elegido |
| `POST /message-log` | Registra un mensaje efectivamente enviado por el humano |
| `GET /message-log` | Devuelve la bitácora, más reciente primero (limit 1–500) |

**Respuesta de `/message-recipients`:**
```json
{
    "selector": "JUEVES",
    "total": 12,
    "with_phone": 10,
    "without_phone": 2,
    "recipients": [
        {
            "client_id": 5,
            "name": "Tienda Doña Mary",
            "phone": "7221234567",
            "day_of_week": "JUEVES",
            "is_active": true
        }
    ]
}
```

### 17.5 Backend — Servicio

**Helpers nuevos en `apps/api/modules/grandeza/service.py`:**

- `MSG_SCHEDULE_KEYS`: mapa de las 6 claves de configuración.
- `DIAS_VALIDOS`: `{LUNES, MARTES, MIERCOLES, JUEVES, VIERNES, SABADO, DOMINGO}`.
- `MSG_SELECTORES_VALIDOS`: los 11 selectores soportados.
- `_normalizar_telefono(raw)`: limpia no-dígitos, exige mínimo 10, devuelve los **últimos 10** (formato nacional MX). Si hay menos, devuelve `None` para que el frontend lo marque como "sin teléfono". Regla heredada de `sendWhatsApp()` en `GrandezaDriverUI.jsx`.

**Métodos nuevos:**

| Método | Descripción |
|--------|-------------|
| `get_message_schedule(db)` | Lee las 6 claves de `grandeza_settings` con defaults seguros |
| `save_message_schedule(db, data)` | Valida selector/día y persiste las 6 claves vía `upsert_setting` |
| `resolve_message_recipients(db, selector)` | Resuelve destinatarios según el selector |
| `log_message_sent(db, data)` | Normaliza el teléfono y crea el registro en la bitácora |
| `get_message_log(db, limit)` | Bitácora con `selectinload(client)`, orden `sent_at DESC` |

**Nota crítica (§7.6 / Error B):** `resolve_message_recipients` usa **obligatoriamente** `selectinload(GrandezaClient.route_slots)`. Sin eager loading, SQLAlchemy Async lanza un 500 al que FastAPI no adjunta cabeceras CORS, y el navegador lo disfraza como "Failed to fetch".

**Nota crítica (§7.10 / Error H):** `sent_at` se guarda con `utcnow()` (UTC). `send_time` es una **intención de negocio** (hora local del reloj), no un instante — por eso se almacena como string `"HH:MM"` y no como timestamp.

**Respeto al input del usuario (§7.4):** `save_message_schedule` nunca sobrescribe silenciosamente; valida y persiste exactamente lo que el usuario capturó.

### 17.6 Frontend — Suite Administrador (`GrandezaParamsUI.jsx`)

**Pestaña nueva:** `{ id: 'messages', label: 'Programación de Mensajes', icon: '💬' }` (4ta pestaña, después de "Rutas por Día").

**Estado nuevo:**
```jsx
const [msgSchedule, setMsgSchedule] = useState({
    enabled: false, text: '', selector: 'TODOS',
    send_day: null, send_time: null, weekly: false
});
const [msgRecipients, setMsgRecipients] = useState([]);
const [msgRecipientsMeta, setMsgRecipientsMeta] = useState(null);
const [msgBatchIndex, setMsgBatchIndex] = useState(0);
const [msgSentIds, setMsgSentIds] = useState([]);
const [msgBatchId, setMsgBatchId] = useState('');
const [msgLog, setMsgLog] = useState([]);
const [msgSaving, setMsgSaving] = useState(false);
const [msgLoadingRecipients, setMsgLoadingRecipients] = useState(false);
```

**Constantes:** `MSG_SELECTORES` (11 opciones con etiqueta legible) y `MSG_BATCH_SIZE = 5`.

**Handlers:** `fetchMsgSchedule`, `fetchMsgLog`, `saveMsgSchedule`, `loadMsgRecipients`, `buildWaLink`, `markMsgSent`, `nextMsgBatch`, `prevMsgBatch`.

**`renderMessagesTab()` — 3 bloques:**

1. **Configuración:** textarea del mensaje, dropdown de selector, dropdown de día de envío, input de hora, checkboxes de "repetir semanalmente" y "habilitado", botones Guardar/Cargar.
2. **Envío Asistido:** lote de 5 destinatarios con botón "Enviar WhatsApp" por cada uno, navegación entre lotes (anterior/siguiente), contador de enviados.
3. **Bitácora:** lista de los últimos envíos registrados (cliente, teléfono, fecha/hora, selector).

**Deep link de WhatsApp:**
```jsx
const buildWaLink = (phone, text) => {
    const limpio = String(phone || '').replace(/\D/g, '');
    const destino = limpio.length >= 10 ? limpio.slice(-10) : limpio;
    return `https://wa.me/52${destino}?text=${encodeURIComponent(text || '')}`;
};
```

**Flujo de envío (`markMsgSent`):** abre WhatsApp en pestaña nueva (`window.open`), luego hace `POST /message-log` para registrar el envío, marca el `client_id` en `msgSentIds` y refresca la bitácora.

**Todas las URLs derivan de `CONFIG.API_BASE_URL`** (§7.9).

### 17.7 Archivos Modificados (Resumen)

| Archivo | Tipo de Cambio |
|---------|---------------|
| `apps/api/modules/grandeza/models.py` | Nuevo modelo `GrandezaMessageLog` |
| `apps/api/main.py` | Import del modelo + `CREATE TABLE IF NOT EXISTS grandeza_message_log` (Paso 1.4) |
| `apps/api/modules/grandeza/schemas.py` | 5 schemas: `GrandezaMessageSchedule`, `GrandezaMessageRecipient`, `GrandezaMessageRecipientsResponse`, `GrandezaMessageLogCreate`, `GrandezaMessageLogResponse` |
| `apps/api/modules/grandeza/service.py` | Helpers (`MSG_SCHEDULE_KEYS`, `DIAS_VALIDOS`, `MSG_SELECTORES_VALIDOS`, `_normalizar_telefono`) + 5 métodos |
| `apps/api/modules/grandeza/router.py` | 5 endpoints (`/message-schedule`, `/message-recipients`, `/message-log`) |
| `apps/pos/GrandezaParamsUI.jsx` | 4ta pestaña + estado + 8 handlers + `renderMessagesTab()` |
| **POS (RetailVisionPOS.jsx)** | **CERO cambios** ✅ |

### 17.8 Verificación

- **Backend:** `docker compose exec -T api python -m py_compile modules/grandeza/models.py modules/grandeza/schemas.py modules/grandeza/service.py modules/grandeza/router.py main.py` → `SYNTAX_OK`.
- **Frontend:** `npm run build` → exit code 0, 1827 módulos transformados, build en 22.19s.

---

## 18. Programación de Pedidos (v7.6.0 — 22/Septiembre/2026)

Esta sección documenta la **5ª pestaña** del módulo Grandeza: «📋 Programación de Pedidos».
Permite al administrador **planear la producción** a partir de los pedidos que los clientes
envían por WhatsApp, con una **capacidad de IA (OCR + LLM)** que lee capturas de pantalla y
**propone** el pedido para que el humano lo confirme.

> **Documentación de la capacidad de IA:** el detalle técnico del pipeline OCR vive en
> [`DOCUMENTACION_CENTRO_IA.md`](DOCUMENTACION_CENTRO_IA.md) — Parte III, sección 28.
> Esta sección 18 documenta la **integración en Grandeza**.

### 18.1 Problema que resuelve

Antes, el administrador recibía los pedidos por WhatsApp y los transcribía a mano en una hoja o
en la cabeza. No había forma de:

1. **Consolidar** los pedidos de todos los clientes en una sola vista.
2. **Totalizar** cuánto pan producir por producto.
3. **Comunicar** esos pedidos al módulo de Producción sin volver a teclear.

La pestaña resuelve los tres: una **matriz clientes × productos**, con **totales por producto**,
que se **envía a Producción** con un botón.

### 18.2 Configuración de la pestaña

El administrador define, en la parte superior de la pestaña:

| Campo | Descripción |
|---|---|
| **Día y hora límite** | Cuándo cierra la recepción de pedidos (ej. «Jueves 18:00») |
| **Día de entrega** | Para qué día es la producción (ej. «Viernes») |
| **Selector** | A qué grupo de clientes aplica (TODOS, o un selector de ruta) |

Se persisten en `grandeza_settings` mediante `GET/PUT /grandeza/order-requests/config`.

### 18.3 La matriz clientes × productos

- **Filas** = clientes (resueltos por el selector).
- **Columnas** = productos habilitados para reparto (`GrandezaProductConfig`).
- **Celdas** = cantidad pedida (editable).
- **Última fila** = **totales por producto** (suma de la columna).
- **Última columna** = total por cliente.

Cada fila se guarda con `POST /grandeza/order-requests` (UPSERT por cliente + fecha de entrega).
El botón «⟳ Recargar» vuelve a leer la matriz con `GET /grandeza/order-requests/matrix/{fecha}`.

> **D-4 (decisión de negocio):** los clientes que **NO respondieron** no se integran a la tabla.
> La matriz solo muestra a quienes tienen pedido capturado (o se les captura manualmente).

### 18.4 Lectura de capturas con IA (Ruta A)

El botón **«📷 Subir captura»** abre el selector de archivos. Al elegir una imagen:

1. El frontend la convierte a **base64** (`FileReader`) y la envía a
   `POST /grandeza/order-requests/ocr-extract` junto con los **catálogos reales** de productos y
   clientes (para que el ERP haga el match en cascada).
2. El ERP delega al **AI Gateway** (`ai_service.extraer_pedido_ocr()`), que llama al motor local
   (`POST /ocr/extract-order`).
3. El motor usa **Tesseract** (texto) + **Ollama** (estructura) y devuelve una **propuesta**.
4. El ERP **resuelve** el cliente (teléfono → nombre exacto → fuzzy → manual) y los productos
   contra su catálogo real.
5. El frontend muestra un **panel de confirmación** con la vista previa, las confianzas, el
   cliente y los renglones **editables**.

> **Contrato human-in-the-loop:** la IA **propone**, el humano **confirma**. Nada se guarda hasta
> presionar «Confirmar pedido». Si el motor de IA no está disponible, el ERP responde **503** y el
> operador captura a mano — el flujo manual **nunca** se bloquea.

**Detección de cliente (D-6):** por **teléfono o nombre** en el encabezado del chat. Los renglones
cuyo producto no se resuelve se marcan con `requiere_revision: true` y se resaltan en **ámbar**
con la etiqueta «Revisar».

### 18.5 Envío a Producción

El botón **«📤 Enviar a Producción»** llama a `POST /grandeza/order-requests/dispatch`. El servicio
`dispatch_order_requests_to_production()`:

1. Agrupa los pedidos confirmados por **producto** y suma cantidades.
2. Crea (o actualiza) una **`GrandezaOrder`** con:
   - `client_id` y `client_name` (snapshot del nombre),
   - `delivery_date`,
   - `status = 'TENTATIVO'`,
   - **`items`** en formato `[{product_id, product_name, qty, unit_price}]`.
3. Si se reenvía, **refresca** los `items` y el snapshot del cliente (idempotente).

> **Corrección importante (Fase C):** originalmente el dispatch creaba la orden **sin `items`** ni
> `client_name`, por lo que `PedidosProduccionUI.jsx` mostraba tarjetas vacías. Se corrigió para
> poblar `items` y `client_name`, cerrando el gap entre Grandeza y Producción.

### 18.6 Integración con Producción (verificación)

`PedidosProduccionUI.jsx` hace polling a `GET /grandeza/orders` cada 30 s, filtra los estados
`ENTREGADO`/`CANCELADO` y mapea cada orden a un ticket `G-{id}` leyendo `o.items` y `o.client_name`.
Con la corrección de la Fase C, los pedidos programados aparecen **con sus renglones y su cliente**.

### 18.7 Endpoints añadidos

| Método | Ruta | Propósito |
|---|---|---|
| `GET` | `/grandeza/order-requests/config` | Lee la configuración de la pestaña |
| `PUT` | `/grandeza/order-requests/config` | Guarda la configuración |
| `GET` | `/grandeza/order-requests/matrix/{delivery_date}` | Matriz clientes × productos + totales |
| `GET` | `/grandeza/order-requests/{delivery_date}` | Lista los pedidos de una fecha |
| `POST` | `/grandeza/order-requests` | UPSERT de un pedido (cliente + fecha) |
| `DELETE` | `/grandeza/order-requests/{request_id}` | Elimina un pedido |
| `POST` | `/grandeza/order-requests/dispatch` | Materializa los pedidos como órdenes de producción |
| `POST` | `/grandeza/order-requests/ocr-extract` | Lee una captura y propone un pedido (IA) |

### 18.8 Modelos de base de datos

| Modelo | Tabla | Rol |
|---|---|---|
| `GrandezaOrderRequest` | `grandeza_order_requests` | Cabecera del pedido (cliente + fecha de entrega + selector + source) |
| `GrandezaOrderRequestItem` | `grandeza_order_request_items` | Renglón (producto + cantidad) del pedido |

> **§7.7:** `create_all` **no** altera tablas existentes. Las tablas se crean con
> `CREATE TABLE IF NOT EXISTS` en el arranque (`apps/api/main.py`).

### 18.9 Archivos involucrados

| Archivo | Tipo de Cambio |
|---|---|
| `apps/api/modules/grandeza/models.py` | Nuevos modelos `GrandezaOrderRequest` + `GrandezaOrderRequestItem` |
| `apps/api/main.py` | `CREATE TABLE IF NOT EXISTS` de las dos tablas nuevas |
| `apps/api/modules/grandeza/schemas.py` | Schemas de config, pedido, matriz, dispatch y OCR |
| `apps/api/modules/grandeza/service.py` | CRUD + `get_order_matrix()` + `dispatch_order_requests_to_production()` + `resolver_cliente_ocr()` + `resolver_productos_ocr()` |
| `apps/api/modules/grandeza/router.py` | 8 endpoints nuevos (incl. `ocr-extract`) |
| `apps/pos/GrandezaOrderRequestsTab.jsx` | **Nuevo** componente de la pestaña (matriz + OCR + panel) |
| `apps/pos/GrandezaParamsUI.jsx` | 5ª pestaña «📋 Programación de Pedidos» |
| `ai-local/app/engines/ocr.py` | **Nuevo** motor OCR (Tesseract) |
| `ai-local/app/engines/nlu.py` | `parsear_pedido()` (estructura el texto con Ollama) |
| `ai-local/app/main.py` | Endpoint `POST /ocr/extract-order` |
| `ai-local/Dockerfile` | `tesseract-ocr` + `tesseract-ocr-spa` |
| **POS (RetailVisionPOS.jsx)** | **CERO cambios** ✅ |

### 18.10 Verificación

- **Backend:** `docker compose exec -T api python -m py_compile` sobre los 6 archivos tocados → `PY_COMPILE_OK`.
- **Frontend:** `npm run build` → exit code 0, 1828 módulos transformados, build en 10.29s.
- **Commits:** Fase A `e6fcd19`, Fase B `e524c17`, Fase C `3f48e64`.

### 18.11 Cumplimiento de las directivas (§7)

- **§7.1** — No se tocó el POS: `RetailVisionPOS.jsx` tiene **cero cambios**.
- **§7.4** — Se respeta la captura del usuario: la IA propone, el humano confirma; nada se
  sobreescribe en silencio.
- **§7.6** — Eager loading (`selectinload`) en las consultas de pedidos.
- **§7.7** — `CREATE TABLE IF NOT EXISTS` en el arranque (no se confía en `create_all`).
- **§7.9** — Todas las URLs derivan de `CONFIG.API_BASE_URL`.
- **§7.10** — No se usa `datetime.now()` directo; se usa `_now_mexico()`.

---

## 19. MEJORA DE CONTRASTE DE LA MATRIZ DE PEDIDOS (v7.6.3)

### 19.1 Motivo

El usuario reportó: *«LA MATRIZ DE PEDIDOS TIENE EL PROBLEMA DE FALTA DE CONTRASTE,
LETRAS EN GRIS QUE NO SE VEN, TRANSPARENCIAS QUE DIFICULTAN LA LECTURA, HAY QUE
MEJORAR EL CONTRASTE PRIORIZANDO LA FACIL LEGIBILIDAD»*.

La matriz se renderiza sobre el **fondo de madera** (`wood_bg.jpg`) del shell
(`ExperimentCenterUI.jsx`). Los estilos originales usaban transparencias
(`bg-black/40`, `bg-white/5`, `text-gray-500`) que, sobre una textura clara y
ruidosa, producían texto prácticamente invisible.

### 19.2 Diagnóstico: elementos de bajo contraste

| Elemento | Estilo anterior | Problema |
|---|---|---|
| Contenedor de la matriz | `bg-black/40 backdrop-blur-sm` | Translúcido: la madera se veía a través |
| Encabezados de columna | `text-gray-500` | Gris medio sobre madera → ilegible |
| Fila de encabezado | `border-white/10` | Separación imperceptible |
| Hover de fila | `hover:bg-white/[0.02]` | 2 % de opacidad → invisible |
| Teléfono del cliente | `text-gray-500` | Gris medio → ilegible |
| Inputs de cantidad | `bg-white/5 border-white/10` | Casi invisibles sobre la madera |
| Pie «clientes» | `text-gray-500` | Gris medio → ilegible |
| Estado vacío | `text-gray-500` / `text-gray-600` | Gris medio → ilegible |
| Resultado de despacho | `text-gray-300` | Contraste insuficiente |
| «Cargando matriz…» | `text-gray-500` | Gris medio → ilegible |

### 19.3 Solución aplicada (solo estilos, cero lógica)

Se priorizó la **legibilidad** sobre la estética translúcida:

| Elemento | Estilo nuevo | Razón |
|---|---|---|
| Contenedor de la matriz | `bg-[#0d0b09] border-2 border-amber-500/30 shadow-2xl` | Fondo **sólido** casi negro: aísla la tabla de la madera |
| Encabezados de columna | `text-amber-300` | Ámbar vivo sobre negro → contraste alto |
| Fila de encabezado | `bg-black/60 border-b-2 border-amber-500/40` | Banda de encabezado diferenciada |
| Hover de fila | `hover:bg-amber-500/10` | Realce perceptible sin romper la lectura |
| Teléfono del cliente | `text-gray-300` | Gris claro legible |
| Inputs de cantidad | `bg-black/50 border-2 border-white/25` | Fondo sólido + borde grueso visible |
| Pie «clientes» | `text-amber-300` | Consistente con los encabezados |
| Estado vacío | `text-white` + `border-2 border-dashed border-amber-500/30` + `bg-black/30` | Mensaje claro y enmarcado |
| Resultado de despacho | `text-white font-semibold` | Lectura directa |
| «Cargando matriz…» | `text-amber-300` | Visible durante la carga |

> **Nota:** El panel de confirmación OCR (Fase B) **ya** usaba fondo sólido negro
> (`bg-black border-2 border-purple-400`) con texto blanco puro; no requirió cambios.

### 19.4 Archivos involucrados

| Archivo | Tipo de Cambio |
|---|---|
| `apps/pos/GrandezaOrderRequestsTab.jsx` | Solo clases Tailwind de la matriz (contenedor, encabezados, filas, inputs, pie, estados) |
| **POS (RetailVisionPOS.jsx)** | **CERO cambios** ✅ |
| **Backend** | **CERO cambios** ✅ |

### 19.5 Verificación

- **Frontend:** `docker compose exec -T pos npx vite build` → exit code 0,
  **1829 módulos** transformados, build en **20.11 s**.
- **Commit:** `df722ae` — `fix(grandeza): mejorar contraste de la Matriz de Pedidos (K1)`.
- **Diff:** 1 archivo, 18 inserciones, 15 eliminaciones.

### 19.6 Cumplimiento de las directivas (§7)

- **§7.1** — No se tocó el POS: `RetailVisionPOS.jsx` tiene **cero cambios**.
- **§7.4** — No se alteró la lógica de captura ni el flujo humano-en-el-bucle.
- **§7.9** — No se modificaron URLs ni endpoints.
- **Sin cambios de lógica:** el diff es exclusivamente de clases de presentación.

---

## 20. CONTRASTE EN MÓVIL — PANELES RESTANTES (v7.6.4)

### 20.1 Motivo

Tras la sección 19, el usuario reportó: *«YA REPARASTE EL CONTRASTE DE LA MATRIZ
DE PEDIDOS SI LA VEO DESDE EL MONITOR DE UNA PC, PERO SI ACCEDO DESDE MI MÓVIL
AUN NO SE SOLUCIONA LO DEL CONTRASTE»*.

### 20.2 Diagnóstico: por qué en PC sí y en móvil no

La sección 19 corrigió **solo la matriz**. Pero la pestaña tiene **tres bloques
apilados verticalmente**:

1. **Panel de Configuración** (arriba)
2. **Matriz de Pedidos** (centro) — *corregido en §19*
3. **Panel de confirmación OCR** (abajo)

En **PC** los tres bloques caben o el usuario ve la matriz directamente. En
**móvil** el layout apila los tres y el usuario hace scroll a través del **Panel
de Configuración** y del **Panel OCR**, que **seguían usando fondos translúcidos**
(`bg-black/40`, `bg-white/5`, `bg-white/10`, `bg-white/15`). Sobre el fondo de
madera, en pantallas móviles (menor luminosidad y contraste), esos paneles se ven
«lavados» y el texto pierde legibilidad.

### 20.3 Solución aplicada (solo estilos, cero lógica)

| Elemento | Estilo anterior | Estilo nuevo |
|---|---|---|
| Panel de Configuración | `bg-black/40 backdrop-blur-sm` | `bg-[#0d0b09] border-2 border-amber-500/30 shadow-2xl` |
| Selects/inputs de Configuración | `bg-white/5 border-white/10` | `bg-black/50 border-2 border-white/25` |
| Input de fecha de entrega | `bg-white/5 border-white/10` | `bg-black/50 border-2 border-white/25` |
| Tarjetas de metadatos OCR (confianza/match) | `bg-white/15 border-white/30` | `bg-black/60 border-2 border-white/40` |
| Select de cliente OCR | `bg-white/10 border-white/30` | `bg-black/60 border-2 border-white/40` |
| Botones Descartar / Agregar renglón / Cancelar | `bg-white/15 border-white/40` | `bg-black/60 border-2 border-white/50` |
| Filas de renglón OCR | `bg-white/15 border-white/30` | `bg-black/60 border-white/40` |
| Mensaje «Sin renglones» | `border-white/40` | `border-white/50 bg-black/40` |

### 20.4 Archivos involucrados

| Archivo | Tipo de Cambio |
|---|---|
| `apps/pos/GrandezaOrderRequestsTab.jsx` | Solo clases Tailwind del panel de Configuración y del panel OCR |
| **POS (RetailVisionPOS.jsx)** | **CERO cambios** ✅ |
| **Backend** | **CERO cambios** ✅ |

### 20.5 Verificación

- **Frontend:** `docker compose exec -T pos npx vite build` → exit code 0,
  **1829 módulos** transformados, build en **25.13 s**.
- **Commit:** `641b154` — `fix(grandeza): contraste movil de la pestana de Pedidos (K5)`.
- **Diff:** 1 archivo, 15 inserciones, 15 eliminaciones.

### 20.6 Nota sobre caché del móvil

El contenedor `pos` corre un **Vite dev server** con HMR, pero los navegadores
móviles cachean agresivamente. Si tras el despliegue el móvil sigue mostrando el
aspecto anterior, hacer **recarga forzada** (o borrar caché del sitio) para
descargar el bundle nuevo.

### 20.7 Cumplimiento de las directivas (§7)

- **§7.1** — No se tocó el POS: `RetailVisionPOS.jsx` tiene **cero cambios**.
- **§7.4** — No se alteró la lógica de captura ni el flujo humano-en-el-bucle.
- **§7.9** — No se modificaron URLs ni endpoints.
- **Sin cambios de lógica:** el diff es exclusivamente de clases de presentación.

---

## 21. ERGONOMÍA — ORDEN DE LAS COLUMNAS DE PRODUCTO (v7.6.5)

### 21.1 Motivo

El usuario solicitó: *«VAMOS A MEJORAR LA ERGONOMÍA DE LA MATRIZ DE PEDIDOS, LAS
COLUMNAS DE PRODUCTOS LAS VAMOS A COLOCAR EN EL SIGUIENTE ORDEN DE IZQUIERDA A
DERECHA: NUEZ, HIGO, PASAS, ESPOLVOREADO Y MINIS»*.

### 21.2 Diagnóstico: por qué el orden era arbitrario

En [`get_order_matrix()`](apps/api/modules/grandeza/service.py:1209) las columnas
se construían desde `GrandezaProductConfig` ordenadas por **`product_id`**:

```python
.order_by(GrandezaProductConfig.product_id)
```

Ese orden es el **orden de alta en el catálogo**, no el orden de trabajo real.
Los IDs resultantes eran:

| product_id | Producto |
|---|---|
| 67 | ESPOLVOREADO |
| 76 | HIGO |
| 103 | MINIS |
| 112 | NUEZ |
| 119 | PASAS |

Es decir, la matriz mostraba **ESPOLVOREADO, HIGO, MINIS, NUEZ, PASAS** — un orden
sin relación con la secuencia de llenado del pan.

### 21.3 Solución: columna `display_order` (configurable, no hardcodeada)

Se añadió la columna **`display_order`** (Integer, nullable, indexada) a la tabla
`grandeza_product_config`. El orden de las columnas pasa a ser **dato**, no código:

- **Menor valor = más a la izquierda.**
- **`NULL` = al final**, desempatado por `product_id` (orden estable).
- Es **editable desde la UI** mediante un endpoint dedicado, sin tocar código.

#### Orden sembrado (el solicitado por el usuario)

| Posición | Producto | product_id |
|---|---|---|
| 1 | NUEZ | 112 |
| 2 | HIGO | 76 |
| 3 | PASAS | 119 |
| 4 | ESPOLVOREADO | 67 |
| 5 | MINIS | 103 |

### 21.4 Cambios por archivo

| Archivo | Cambio |
|---|---|
| [`apps/api/modules/grandeza/models.py`](apps/api/modules/grandeza/models.py:13) | Nueva columna `display_order = Column(Integer, nullable=True, index=True)` en `GrandezaProductConfig` |
| [`apps/api/modules/grandeza/service.py`](apps/api/modules/grandeza/service.py:1209) | `get_order_matrix()` y `get_grandeza_products()` ordenan por `display_order ASC NULLS LAST, product_id ASC` |
| [`apps/api/modules/grandeza/service.py`](apps/api/modules/grandeza/service.py:146) | Nuevo método `reorder_grandeza_products(db, product_ids)` |
| [`apps/api/modules/grandeza/schemas.py`](apps/api/modules/grandeza/schemas.py:21) | `display_order` expuesto en `GrandezaProductConfigResponse` + nuevo `GrandezaProductReorderRequest` |
| [`apps/api/modules/grandeza/router.py`](apps/api/modules/grandeza/router.py:39) | Nuevo endpoint `PUT /grandeza/products/order` |
| [`apps/api/migrations_applied/migrate_grandeza_product_display_order.py`](apps/api/migrations_applied/migrate_grandeza_product_display_order.py:1) | Migración idempotente: `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` + siembra del orden |
| **POS (RetailVisionPOS.jsx)** | **CERO cambios** ✅ |
| **Frontend** | **CERO cambios** ✅ (el orden llega ya resuelto en `matrix.products`) |

### 21.5 Endpoint de reordenamiento

```
PUT /api/v1/grandeza/products/order
Body: { "product_ids": [112, 76, 119, 67, 103] }
```

Asigna `display_order = 1..N` en el orden recibido. Los productos habilitados que
**no** vengan en la lista quedan con `display_order = NULL` (al final). La
operación es **idempotente y no destructiva** (no borra ni deshabilita nada).

### 21.6 Migración (§7.7)

`create_all` **no altera** tablas existentes, por eso la migración usa
`ALTER TABLE grandeza_product_config ADD COLUMN IF NOT EXISTS display_order INTEGER`
(idempotente). Reutiliza el motor de la propia app (`core.database.engine`) para
no duplicar credenciales ni depender de la forma del `DATABASE_URL` del entorno.

Ejecución:

```
docker compose exec -T api python -c "import sys; sys.path.insert(0,'/app'); exec(open('/app/migrations_applied/migrate_grandeza_product_display_order.py').read())"
```

Salida verificada:

```
   [1] 112 — NUEZ
   [2] 76 — HIGO
   [3] 119 — PASAS
   [4] 67 — ESPOLVOREADO
   [5] 103 — MINIS
```

### 21.7 Verificación

- **Backend:** `get_order_matrix()` devuelve
  `PRODUCTS: ['NUEZ', 'HIGO', 'PASAS', 'ESPOLVOREADO', 'MINIS']` y
  `TOTALS: ['NUEZ', 'HIGO', 'PASAS', 'ESPOLVOREADO', 'MINIS']` (orden consistente
  entre encabezados y pie).
- **Frontend:** `docker compose exec -T pos npx vite build` → exit code 0,
  **1829 módulos** transformados, build en **24.92 s**.
- **Commit:** `98066ce` — `v7.6.5: ergonomia Matriz de Pedidos - orden de columnas configurable`.
- **Diff:** 5 archivos, 150 inserciones, 2 eliminaciones.

> **Nota operativa:** el contenedor `api` corre uvicorn **sin `--reload`**; tras
> cambiar `apps/api/` es obligatorio `docker compose restart api`.

### 21.8 Cumplimiento de las directivas (§7)

- **§7.1** — No se tocó el POS: `RetailVisionPOS.jsx` tiene **cero cambios**.
- **§7.4** — No se alteró la lógica de captura ni el flujo humano-en-el-bucle.
- **§7.6** — Se mantiene la carga anticipada (`selectinload`) en las consultas.
- **§7.7** — Migración con `ADD COLUMN IF NOT EXISTS` (no se confió en `create_all`).
- **§7.9** — El nuevo endpoint deriva de `CONFIG.API_BASE_URL` como el resto.
- **Sin cambios de lógica de negocio:** solo se añadió un criterio de orden.
