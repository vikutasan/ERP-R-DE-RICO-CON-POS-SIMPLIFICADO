# 🍦 PLAN DEFINITIVO FINAL: Módulo Heladería + Reportes Consolidados
## ERP R de Rico — Versión Aprobada

---

## Resumen Ejecutivo

Construir el módulo de Heladería en **dos oleadas**: un **MVP** enfocado en vender y cobrar helados con velocidad (POS Heladería + KDS + Reporte Consolidado), seguido de la **experiencia premium** para el cliente (Tienda Interactiva + Displays). Estética de heladería de alta gama tipo Häagen-Dazs en todo el módulo.

---

## Todas las Decisiones Tomadas

| # | Decisión | Resolución | Origen |
|---|---|---|---|
| 1 | ¿Quién toca la pantalla? | **Dos interfaces:** POS Heladería (empleado) + Tienda Interactiva (cliente) | Dueño |
| 2 | ¿Tablas nuevas o reutilizar Ticket? | **Reutilizar `Ticket` + `TicketItem`** con campo `channel`. Solo 2 tablas nuevas | Auditoría P0-2 |
| 3 | ¿Nombre del integrante? | **Opcional.** Campo libre, se puede saltar | Dueño |
| 4 | ¿Cómo agotar un sabor? | **Botón "AGOTAR" en POS Heladería**, toggle instantáneo | Dueño |
| 5 | ¿Soporte offline? | **Obligatorio.** Cache de menú + cola de sync | Auditoría P0-1 |
| 6 | ¿URLs del API? | **Solo via `CONFIG.API_BASE_URL`** — prohibido construir manual | Auditoría P1-1 |
| 7 | ¿Retries de red? | **`withRetries` obligatorio** en todas las operaciones | Auditoría P1-2 |
| 8 | ¿Categorías heladería? | **Columna `channel`** en tabla `categories` | Plan original |
| 9 | ¿Terminales separados? | **Namespace `H-`** (H1, H2, H-CAJA) en misma tabla `terminal_locks` | Auditoría P0-3 |
| 10 | ¿Prioridad? | **MVP primero** (POS + KDS + Reporte), luego Tienda + Displays | Dueño |
| 11 | ¿Estética? | **Häagen-Dazs premium.** Dark mode, rosa/violeta/crema, Playfair Display | Dueño |
| 12 | ¿Cortes de caja? | **Independientes por terminal/cajero.** Cada uno cierra su turno | Confirmado |
| 13 | ¿Reporte consolidado? | **Nueva pestaña en Auditoría y Control** — vista de solo lectura por fecha | Dueño |
| 14 | ¿Cierre ciego? | **Diferido** — se implementa después del MVP | Dueño |
| 15 | ¿Día operativo? | **Diferido** — se implementa si hay operación nocturna | Dueño |
| 16 | ¿Tienda Interactiva puede cobrar? | **NO.** Solo genera pre-comandas (PENDING). Un cajero del POS las cobra | Confirmado |
| 17 | ¿Aislamiento de módulos? | **`React.lazy()` + `ErrorBoundary`** — si heladería se cae, el POS sigue funcionando | Auditoría Modularidad |

---

## Arquitectura del Hub — 6 Secciones

| # | Sección | Operador | Oleada |
|---|---|---|---|
| 1 | **POS Heladería** ★ | Cajero/Empleado | 🔴 MVP |
| 2 | Tienda Interactiva | Cliente (self-service) | 🔵 Post-MVP |
| 3 | KDS Estación de Helados | Barista | 🔴 MVP |
| 4 | KDS Malteadas y Aguas | Barista bebidas | 🔴 MVP |
| 5 | Display Tótem Sugestivo | Sin operador (auto) | 🔵 Post-MVP |
| 6 | Display Pantalla de Precios | Sin operador (auto) | 🔵 Post-MVP |

---

# OLEADA 1 — MVP

---

## FASE 1: Backend + Modelo de Datos

### Cambios en Tablas Existentes (5 columnas nuevas)

#### [MODIFY] [catalog/models.py](file:///C:/Users/servidor1/.gemini/antigravity/scratch/ERP-R-DE-RICO/apps/api/modules/catalog/models.py) — tabla `categories`
```python
channel = Column(String, default="PANADERIA")  # "PANADERIA" | "HELADERIA" | "AMBOS"
```

#### [MODIFY] [pos/models.py](file:///C:/Users/servidor1/.gemini/antigravity/scratch/ERP-R-DE-RICO/apps/api/modules/pos/models.py) — tabla `tickets`
```python
channel = Column(String, default="PANADERIA")       # "PANADERIA" | "HELADERIA"
customer_group_name = Column(String, nullable=True)  # "Mesa de Rosi" (opcional)
```

#### [MODIFY] [pos/models.py](file:///C:/Users/servidor1/.gemini/antigravity/scratch/ERP-R-DE-RICO/apps/api/modules/pos/models.py) — tabla `ticket_items`
```python
recipient_name = Column(String, nullable=True)       # "Rosi" (OPCIONAL)
kds_station = Column(String, nullable=True)          # "HELADOS" | "MALTEADAS" | null
item_status = Column(String, default="PENDING")      # "PENDING" | "IN_PROGRESS" | "READY"
```

---

### Tablas Nuevas (2)

#### [NEW] `apps/api/modules/heladeria/__init__.py`

#### [NEW] `apps/api/modules/heladeria/models.py`

```python
class HeladeriaProductConfig(Base):
    """
    Extiende un producto del catálogo con configuración específica de heladería.
    Ejemplo: Producto 'Chocolate' → component_type='SABOR', is_available=True
    """
    __tablename__ = "heladeria_product_config"

    id = Column(Integer, primary_key=True)
    product_id = Column(Integer, ForeignKey("products.id"), unique=True)
    component_type = Column(String, nullable=False)
        # 'RECIPIENTE' | 'SABOR' | 'EXTRA' | 'BEBIDA_BASE' | 'TAMAÑO'
    max_scoops = Column(Integer, nullable=True)          # Solo RECIPIENTE
    base_price = Column(Numeric(12,2), nullable=True)    # Precio base recipiente
    price_per_scoop = Column(Numeric(12,2), nullable=True)
    is_available = Column(Boolean, default=True)          # ← TOGGLE "AGOTAR SABOR"
    position = Column(Integer, default=0)

    product = relationship("Product")


class TicketItemComponent(Base):
    """Componente de un TicketItem compuesto (recipiente, bolas, extras)."""
    __tablename__ = "ticket_item_components"

    id = Column(Integer, primary_key=True)
    ticket_item_id = Column(Integer, ForeignKey("ticket_items.id"), nullable=False)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=True)
    component_type = Column(String, nullable=False)
        # 'RECIPIENTE' | 'BOLA_1' | 'BOLA_2' | 'BOLA_3' | 'EXTRA'
    component_name = Column(String, nullable=False)
    unit_price = Column(Numeric(12,2), default=0)
    quantity = Column(Integer, default=1)

    ticket_item = relationship("TicketItem")
    product = relationship("Product")
```

---

### API Endpoints Heladería (6 endpoints)

#### [NEW] `apps/api/modules/heladeria/schemas.py`
Schemas Pydantic para request/response.

#### [NEW] `apps/api/modules/heladeria/service.py`

| Método | Descripción |
|---|---|
| `get_menu(db)` | Categorías `channel IN ('HELADERIA','AMBOS')` + productos agrupados por `component_type` |
| `toggle_flavor_availability(db, config_id, bool)` | Toggle instantáneo del campo `is_available` |
| `get_kds_orders(db, station)` | Tickets `channel='HELADERIA' AND status='PAID'` con items filtrados por `kds_station` |
| `update_kds_item_status(db, item_id, status)` | Marca item READY/IN_PROGRESS. Si TODOS ready → ticket READY |
| `get_active_flavors(db)` | Sabores disponibles para displays |
| `get_display_menu(db)` | Menú con precios para displays |

#### [NEW] `apps/api/modules/heladeria/router.py`

```
GET    /heladeria/menu                          → Menú completo dinámico
PATCH  /heladeria/availability/{config_id}      → Toggle "AGOTAR SABOR" ⚡
GET    /heladeria/kds/{station}                 → Comandas pagadas (HELADOS | MALTEADAS)
PATCH  /heladeria/kds/items/{item_id}/status    → Marcar item READY/IN_PROGRESS
GET    /heladeria/display/flavors               → Sabores activos (para displays)
GET    /heladeria/display/menu                  → Menú con precios (para displays)
```

> [!NOTE]
> Los endpoints de crear ticket, agregar items, cobrar, y gestión de caja **NO se duplican**. Se reutilizan los del POS existente (`/pos/tickets`, `/pos/tickets/items/add`, `/cash/sessions`) con el campo `channel='HELADERIA'`.

---

### API Endpoint Reporte Consolidado (1 endpoint)

#### [MODIFY] [cash/service.py](file:///C:/Users/servidor1/.gemini/antigravity/scratch/ERP-R-DE-RICO/apps/api/modules/cash/service.py)

Nueva función:
```python
async def generar_reporte_diario(db, fecha: str) -> dict:
    """
    Genera reporte consolidado del día agrupado por channel.
    1. Obtiene TODAS las CashSessions del día (por fecha)
    2. Determina channel por el prefijo del terminal_id ('H-' → HELADERIA, otro → PANADERIA)
    3. Para cada sesión, calcula resumen via calcular_resumen() (ya existe)
    4. Agrupa y suma por channel
    5. Detecta alertas (sesiones abiertas, pedidos sin cobrar)
    """
```

#### [MODIFY] [cash/router.py](file:///C:/Users/servidor1/.gemini/antigravity/scratch/ERP-R-DE-RICO/apps/api/modules/cash/router.py)

```python
@router.get("/daily-report")
async def daily_report(date: str, db: AsyncSession = Depends(get_db)):
    return await generar_reporte_diario(db, date)
```

---

### Migración de BD

#### [NEW] `apps/api/migrations/add_heladeria_support.py`

Script idempotente que ejecuta:
1. `ALTER TABLE categories ADD COLUMN IF NOT EXISTS channel VARCHAR DEFAULT 'PANADERIA'`
2. `UPDATE categories SET channel='HELADERIA' WHERE name LIKE '14.-%' OR name LIKE '15.-%' OR name LIKE '16.-%'`
3. `ALTER TABLE tickets ADD COLUMN IF NOT EXISTS channel VARCHAR DEFAULT 'PANADERIA'`
4. `ALTER TABLE tickets ADD COLUMN IF NOT EXISTS customer_group_name VARCHAR`
5. `ALTER TABLE ticket_items ADD COLUMN IF NOT EXISTS recipient_name VARCHAR`
6. `ALTER TABLE ticket_items ADD COLUMN IF NOT EXISTS kds_station VARCHAR`
7. `ALTER TABLE ticket_items ADD COLUMN IF NOT EXISTS item_status VARCHAR DEFAULT 'PENDING'`
8. `CREATE TABLE IF NOT EXISTS heladeria_product_config (...)`
9. `CREATE TABLE IF NOT EXISTS ticket_item_components (...)`
10. Seed `SystemSetting` con key `heladeria_terminals_config`

---

### Registro en API Main

#### [MODIFY] [main.py](file:///C:/Users/servidor1/.gemini/antigravity/scratch/ERP-R-DE-RICO/apps/api/main.py)

```python
from modules.heladeria.router import router as heladeria_router
from modules.heladeria.models import HeladeriaProductConfig, TicketItemComponent

app.include_router(heladeria_router, prefix="/api/v1/heladeria", tags=["Heladeria"])
```

---

## FASE 2: POS Heladería — La Máquina de Velocidad ⚡

**Filosofía:** Todo en una pantalla, mínimos taps, máxima velocidad.

### Layout Principal

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ 🍦 POS HELADERÍA │ Terminal: H1 │ Cajero: María │ ● Conectado │ 14:32     │
├──────────────────┬───────────────────────────────────────────────────────────┤
│                  │                                                           │
│  RECIPIENTES     │   SABORES DISPONIBLES                                    │
│  [Vaso] [Cono]   │   [🟫Choc] [🫐Vaini] [🍓Fresa] [🟡Mango] [🍪Cookies]  │
│  [Waffle]        │   [🥜Nuez] [⛔Pistache AGOTADO]                         │
│                  │                                                           │
│  EXTRAS          │   [AGOTAR SABOR ▼] ← Dropdown rápido                    │
│  ☐ Choc Duro $10 │                                                          │
│  ☐ Granillo  $5  │                                                          │
│  ☐ Nuez     $10  │                                                          │
│                  │                                                           │
├──────────────────┼──────────────────────────────────────────────────────────┤
│ ARMADO RÁPIDO    │  🛒 TICKET H-V00123         Para: [________] (opcional) │
│                  │  ──────────────────────────────────────────────────────  │
│ Recipiente: Vaso │  1x 🍦 Vaso Choc+Fresa +ChocDuro             $80.00    │
│ Bola 1: Choc     │  1x 🥤 Malteada Oreo Grande                  $65.00    │
│ Bola 2: Fresa    │  ──────────────────────────────────────────────────────  │
│ + Choc Duro      │  TOTAL:                                      $145.00   │
│                  │                                                          │
│ Subtotal: $80    │  [🍦 AGREGAR HELADO] [🥤 BEBIDA]                       │
│ [+ AL TICKET →]  │  [📋 PIZARRÓN]      [💰 COBRAR]                       │
└──────────────────┴──────────────────────────────────────────────────────────┘
```

**Flujo mínimo (4 taps, <10 segundos):**
```
TAP 1: Vaso → TAP 2: Chocolate → TAP 3: Fresa → TAP 4: [+ AL TICKET →]
```

### Archivos Frontend — Services

#### [NEW] `apps/heladeria/services/heladeriaService.js`
Cliente HTTP con `CONFIG.API_BASE_URL` + `withRetries`:
- `getMenu()` → `GET /heladeria/menu`
- `toggleAvailability(configId, bool)` → `PATCH /heladeria/availability/{id}`
- `getKdsOrders(station)` → `GET /heladeria/kds/{station}`
- `updateKdsItemStatus(itemId, status)` → `PATCH /heladeria/kds/items/{id}/status`
- Reutiliza `posService` para: crear ticket, agregar items, cobrar

#### [NEW] `apps/heladeria/services/heladeriaOfflineStore.js`
Cache IndexedDB: menú cacheado + cola de operaciones pendientes + indicador de conexión + auto-sync.

#### [NEW] `apps/heladeria/services/heladeriaTerminals.js`
Terminales namespace `H-` via `CONFIG.API_BASE_URL` + SystemSetting `heladeria_terminals_config`.

### Archivos Frontend — Hooks

#### [NEW] `apps/heladeria/hooks/useHeladeriaMenu.js`
Carga menú dinámico, agrupa por `component_type`, cachea en IndexedDB.

#### [NEW] `apps/heladeria/hooks/useQuickBuilder.js`
Estado del armado rápido en memoria: `selectedRecipient`, `scoops[]`, `extras[]`, `currentPrice`. Persistencia atómica al presionar `[+ AL TICKET →]`.

#### [NEW] `apps/heladeria/hooks/useHeladeriaCart.js`
Gestión del ticket heladería. Reutiliza `posService` con `channel='HELADERIA'`.

### Archivos Frontend — Components

#### [NEW] `apps/heladeria/components/QuickIceCreamPanel.jsx`
Panel izquierdo "Armado Rápido" — recipiente + bolas + extras seleccionados con subtotal.

#### [NEW] `apps/heladeria/components/FlavorGrid.jsx`
Grid de sabores con colores representativos. Agotados en gris con badge rojo.

#### [NEW] `apps/heladeria/components/HeladeriaTicketPanel.jsx`
Panel derecho — ticket en construcción, items, total, botones de acción.

#### [NEW] `apps/heladeria/components/HeladeriaCashSwitch.jsx`
Reutiliza [cashService.js](file:///C:/Users/servidor1/.gemini/antigravity/scratch/ERP-R-DE-RICO/apps/pos/services/cashService.js). PIN → abre sesión de caja → habilita cobro.

#### [NEW] `apps/heladeria/components/HeladeriaCheckout.jsx`
Pantalla de cobro: total, métodos de pago, confirmación → `status='PAID'` → libera al KDS.

#### [NEW] `apps/heladeria/components/HeladeriaTerminalSelector.jsx`
Réplica de [TerminalSelector.jsx](file:///C:/Users/servidor1/.gemini/antigravity/scratch/ERP-R-DE-RICO/apps/pos/components/TerminalSelector.jsx) con estética heladería rosa/violeta. Incluye gestor alta/baja terminales.

#### [NEW] `apps/heladeria/components/FlavorAvailabilityToggle.jsx`
Dropdown "AGOTAR SABOR": lista de sabores con switch on/off instantáneo.

### Sección Principal

#### [NEW] `apps/heladeria/sections/PosHeladeriaUI.jsx`
⭐ Componente orquestador que ensambla: TerminalSelector → QuickIceCreamPanel + FlavorGrid + TicketPanel + CashSwitch + Checkout.

---

## FASE 3: KDS Helados + Malteadas

#### [MODIFY] [KdsHeladosUI.jsx](file:///C:/Users/servidor1/.gemini/antigravity/scratch/ERP-R-DE-RICO/apps/heladeria/sections/KdsHeladosUI.jsx)
Reescritura total:

```
┌─────────────────────────────────────────────────────────────────────────┐
│  🍦 KDS — ESTACIÓN DE HELADOS     ● 5 pedidos     🔄 5s   🔊 Sonido  │
│  [PIN: ****] María — Barista                                           │
├──────────┬──────────┬──────────┬──────────┬──────────┬─────────────────┤
│ H-V00123 │ H-V00124 │ H-V00125 │ H-V00126 │ H-V00127 │                 │
│ ⏱ 3:45   │ ⏱ 2:12   │ ⏱ 1:30   │ ⏱ 0:45   │ ⏱ 0:10   │                 │
│ 👤 ROSI  │ 👤 CARLOS│ 👤 (sin) │ 👤 ANA   │ 👤 PEDRO │                 │
│ VASO     │ CONO WAF │ VASO     │ CONO     │ VASO     │                 │
│ 🟫 Choc  │ 🍓 Fresa │ 🟡 Mango │ 🫐 Vaini │ 🟫 Choc  │                 │
│ 🍓 Fresa │ 🟡 Mango │ 🍪 Cooki │ 🟫 Choc  │ x3       │                 │
│ +ChocDur │          │          │ +Nuez    │ +Granillo│                 │
│[✅ LISTO]│[✅ LISTO]│[✅ LISTO]│[✅ LISTO]│[✅ LISTO]│                 │
└──────────┴──────────┴──────────┴──────────┴──────────┴─────────────────┘
```

**Características:**
- PIN de acceso al entrar (seguridad)
- Nombre del integrante EN GRANDE (para escribir con plumón)
- Timer ascendente desde pago. Tarjetas ordenadas FIFO
- Botón "LISTO" → `item_status='READY'`. Todos ready → ticket READY
- Polling configurable via `SystemSetting` (default: 5s)
- Sonido de notificación con botón "Activar Sonido" (Web Audio API)
- Estética teal (#5eead4) sobre fondo oscuro

#### [MODIFY] [KdsMalteadasUI.jsx](file:///C:/Users/servidor1/.gemini/antigravity/scratch/ERP-R-DE-RICO/apps/heladeria/sections/KdsMalteadasUI.jsx)
Idéntico pero filtra `kds_station='MALTEADAS'`. Estética violeta (#c4b5fd).

#### [NEW] `apps/heladeria/components/KdsOrderCard.jsx`
Tarjeta reutilizable de comanda KDS.

#### [NEW] `apps/heladeria/hooks/useKdsPolling.js`
Polling al endpoint `/heladeria/kds/{station}` con detección de nuevos pedidos y sonido.

---

## FASE 4: Reporte Diario Consolidado

#### [MODIFY] [AuditoriaControlUI.jsx](file:///C:/Users/servidor1/.gemini/antigravity/scratch/ERP-R-DE-RICO/apps/AuditoriaControlUI.jsx)

Agregar 3ª pestaña `Reportes Diarios` al sistema de tabs existente:

```javascript
// Línea 7: agregar nuevo estado de tab
const [activeTab, setActiveTab] = useState('ventas'); // 'ventas', 'cortes', 'consolidado'

// Línea 97-110: agregar botón de pestaña
<button onClick={() => setActiveTab('consolidado')} ...>
    📊 Reportes Diarios
</button>
```

**Vista de la pestaña:**

```
┌─────────────────────────────────────────────────────────────────────────┐
│  [ Tickets ]  [ Cortes de Caja ]  [ 📊 Reportes Diarios ]             │
├─────────────────────────────────────────────────────────────────────────┤
│  📅 Fecha: [06/Sep/2026]  [Buscar]                                     │
│                                                                         │
│  ╔═══════════════════════════════════════════════════════════════════╗  │
│  ║  GRAN TOTAL SUCURSAL               06/Sep/2026                  ║  │
│  ║  $51,810.00    393 tickets    7 turnos cerrados                 ║  │
│  ║  Diferencia total: -$20.00                                      ║  │
│  ╚═══════════════════════════════════════════════════════════════════╝  │
│                                                                         │
│  ┌─── 🍞 PANADERÍA ──────────────────────────────────────────────┐    │
│  │  $45,200.00    312 tickets    4 turnos                        │    │
│  │  Cajero     Terminal  Ventas       Diferencia                 │    │
│  │  Yami       CAJA      $22,100.00    -$5.00                    │    │
│  │  Omar       T5        $12,300.00   -$10.00                    │    │
│  │  Pedro      T3         $6,200.00     $0.00                    │    │
│  │  Ana        T2         $4,600.00     $0.00                    │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                                                                         │
│  ┌─── 🍦 HELADERÍA ──────────────────────────────────────────────┐    │
│  │  $6,610.00    81 tickets    3 turnos                          │    │
│  │  Cajero     Terminal  Ventas       Diferencia                 │    │
│  │  Carlos     H-CAJA     $4,650.00     $0.00                   │    │
│  │  María      H1         $1,960.00    -$5.00                   │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                                                                         │
│  ⚠️ ALERTAS:                                                          │
│  • 2 pedidos de Tienda Interactiva sin cobrar                          │
│  • Sesión H2 (Luis) sigue abierta                                      │
└─────────────────────────────────────────────────────────────────────────┘
```

**Corrección incluida:** Corregir `const API_BASE = \`http://${window.location.hostname}:5001/api/v1\`` → usar `CONFIG.API_BASE_URL` (bug P1-1).

---

### [MODIFY] [ExperimentCenterUI.jsx](file:///C:/Users/servidor1/.gemini/antigravity/scratch/ERP-R-DE-RICO/apps/ExperimentCenterUI.jsx) — 🛡️ AISLAMIENTO DE MÓDULOS

> [!CAUTION]
> **Este cambio es CRÍTICO para la modularidad.** Sin él, un error en cualquier archivo de heladería tumba todo el ERP.

Cambiar el import estático de heladería (línea 34) por `React.lazy()` + `ErrorBoundary`:

```javascript
// ANTES (línea 34 — PELIGROSO):
import { HeladeriaHubUI } from './heladeria/HeladeriaHubUI';

// DESPUÉS (SEGURO):
const HeladeriaHubUI = React.lazy(() =>
    import('./heladeria/HeladeriaHubUI').then(m => ({ default: m.HeladeriaHubUI }))
);
```

Y en el render (línea ~533), envolver en `Suspense` + `ErrorBoundary`:

```javascript
// ANTES:
{activeModule === 'heladeria' && <HeladeriaHubUI onBack={() => setActiveModule('overview')} />}

// DESPUÉS:
{activeModule === 'heladeria' && (
    <React.Suspense fallback={
        <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100%',color:'#f9a8d4'}}>
            🍦 Cargando Heladería...
        </div>
    }>
        <ErrorBoundaryModule moduleName="Heladería" onBack={() => setActiveModule('overview')}>
            <HeladeriaHubUI onBack={() => setActiveModule('overview')} />
        </ErrorBoundaryModule>
    </React.Suspense>
)}
```

Componente `ErrorBoundaryModule` (agregar al mismo archivo):
```javascript
class ErrorBoundaryModule extends React.Component {
    constructor(props) { super(props); this.state = { hasError: false, error: null }; }
    static getDerivedStateFromError(error) { return { hasError: true, error }; }
    render() {
        if (this.state.hasError) return (
            <div style={{display:'flex',flexDirection:'column',alignItems:'center',
                justifyContent:'center',height:'100%',gap:'20px',color:'#fff'}}>
                <h2>⚠️ Error en módulo {this.props.moduleName}</h2>
                <p style={{color:'#999'}}>El resto del ERP sigue funcionando normalmente.</p>
                <pre style={{color:'#ef4444',fontSize:'12px',maxWidth:'600px',overflow:'auto'}}>
                    {this.state.error?.toString()}
                </pre>
                <button onClick={this.props.onBack}
                    style={{background:'#f97316',color:'#000',border:'none',padding:'12px 24px',
                        borderRadius:'8px',cursor:'pointer',fontWeight:'bold'}}>
                    ← Volver al Dashboard
                </button>
            </div>
        );
        return this.props.children;
    }
}
```

**Resultado:** Si heladería explota, el usuario ve un mensaje de error limpio con botón para volver al dashboard. El POS, la caja, los reportes — todo sigue funcionando.

---

### [MODIFY] [HeladeriaHubUI.jsx](file:///C:/Users/servidor1/.gemini/antigravity/scratch/ERP-R-DE-RICO/apps/heladeria/HeladeriaHubUI.jsx)

**Dos cambios:**

**1. Agregar 6ª tarjeta "POS Heladería":**

```javascript
{
    id: 'pos_heladeria',
    nombre: 'POS Heladería',
    descripcion: 'Punto de venta rápido para el personal de mostrador',
    icono: '⚡',
    gradiente: 'linear-gradient(135deg, #f43f5e, #fb7185)',
    glowColor: 'rgba(244, 63, 94, 0.3)',
    borderColor: 'rgba(251, 113, 133, 0.3)',
},
```

**2. Lazy loading INTERNO de secciones** (doble barrera de protección):

```javascript
// ANTES (líneas 2-6 — todas estáticas):
import { TiendaInteractivaUI } from './sections/TiendaInteractivaUI';
import { KdsHeladosUI } from './sections/KdsHeladosUI';
import { KdsMalteadasUI } from './sections/KdsMalteadasUI';
import { DisplayTotemUI } from './sections/DisplayTotemUI';
import { DisplayPreciosUI } from './sections/DisplayPreciosUI';

// DESPUÉS (lazy — si una sección falla, las demás siguen):
const PosHeladeriaUI = React.lazy(() => import('./sections/PosHeladeriaUI').then(m => ({default: m.PosHeladeriaUI})));
const TiendaInteractivaUI = React.lazy(() => import('./sections/TiendaInteractivaUI').then(m => ({default: m.TiendaInteractivaUI})));
const KdsHeladosUI = React.lazy(() => import('./sections/KdsHeladosUI').then(m => ({default: m.KdsHeladosUI})));
const KdsMalteadasUI = React.lazy(() => import('./sections/KdsMalteadasUI').then(m => ({default: m.KdsMalteadasUI})));
const DisplayTotemUI = React.lazy(() => import('./sections/DisplayTotemUI').then(m => ({default: m.DisplayTotemUI})));
const DisplayPreciosUI = React.lazy(() => import('./sections/DisplayPreciosUI').then(m => ({default: m.DisplayPreciosUI})));
```

**Resultado:** Doble barrera de aislamiento:
- **Barrera 1:** `ExperimentCenterUI` → `HeladeriaHubUI` (lazy) — si el Hub falla, solo heladería se cae
- **Barrera 2:** `HeladeriaHubUI` → cada sección (lazy) — si KDS falla, el POS Heladería sigue funcionando

---

# OLEADA 2 — Post-MVP

> [!NOTE]
> Se construyen DESPUÉS de que el MVP esté en producción y validado. El MVP genera datos reales (sabores activos, precios, pedidos) que alimentan estas secciones automáticamente.

### Tienda Interactiva (Experiencia Cliente Häagen-Dazs)
- Configurador visual paso a paso con animaciones SVG/CSS
- Experiencia lúdica que despierta el antojo
- Optimizada para tótem/tablet frente al cliente
- **NO tiene switch de caja ni cobro** — solo genera pre-comandas al pizarrón del POS
- Layout responsive: doble columna en tablet, columna única en celular

### Display Tótem Sugestivo
- Panel de Control (admin): configurar velocidad, productos destacados, torre de sabores
- Vista de Proyección: `React.lazy()` via URL directa, fullscreen, sin controles

### Display Pantalla de Precios
- Panel de Control (admin): seleccionar categorías/productos, velocidad
- Vista de Proyección: menú digital tipo menú board, precios en tiempo real

---

## Estética Häagen-Dazs — Sistema de Diseño

```css
/* Paleta Heladería Premium */
--heladeria-bg:        #0a0a0a;
--heladeria-surface:   rgba(255,255,255,0.03);
--heladeria-pink:      #f43f5e;            /* Acento POS */
--heladeria-rose:      #f9a8d4;            /* Acento suave */
--heladeria-violet:    #c084fc;            /* Acento secundario */
--heladeria-cream:     #fef3c7;            /* Highlight cálido */
--heladeria-teal:      #5eead4;            /* KDS Helados */
--heladeria-purple:    #c4b5fd;            /* KDS Malteadas */
--heladeria-gold:      #f59e0b;            /* Precios/totales */

/* Tipografía */
--font-display: 'Playfair Display', serif;
--font-body: 'Inter', sans-serif;

/* Sabores → Colores */
--sabor-chocolate:  #5C3D2E;
--sabor-vainilla:   #F3E5AB;
--sabor-fresa:      #E8474C;
--sabor-mango:      #FFB347;
--sabor-cookies:    #C4A882;
--sabor-nuez:       #8B6914;
--sabor-pistache:   #93C572;
--sabor-cafe:       #6F4E37;
```

---

## Árbol Completo de Archivos

```
BACKEND:
apps/api/modules/heladeria/               [NUEVO módulo]
├── __init__.py
├── models.py                              2 tablas: HeladeriaProductConfig, TicketItemComponent
├── schemas.py                             Validación Pydantic
├── service.py                             Lógica de negocio
└── router.py                              6 endpoints

apps/api/migrations/
└── add_heladeria_support.py               Migración: 5 columnas + 2 tablas + seed

apps/api/main.py                           [MODIFICAR] registrar heladeria_router
apps/api/modules/pos/models.py             [MODIFICAR] 3 columnas en Ticket/TicketItem
apps/api/modules/catalog/models.py         [MODIFICAR] 1 columna en Category
apps/api/modules/cash/service.py           [MODIFICAR] función generar_reporte_diario
apps/api/modules/cash/router.py            [MODIFICAR] endpoint GET /daily-report

FRONTEND HELADERÍA:
apps/heladeria/HeladeriaHubUI.jsx          [MODIFICAR] agregar 6ª tarjeta
apps/heladeria/services/
├── heladeriaService.js                    Cliente HTTP + withRetries
├── heladeriaOfflineStore.js               Cache IndexedDB + cola sync
└── heladeriaTerminals.js                  Config terminales H-

apps/heladeria/hooks/
├── useHeladeriaMenu.js                    Hook menú dinámico
├── useQuickBuilder.js                     Hook armado rápido
├── useHeladeriaCart.js                    Hook ticket/carrito
└── useKdsPolling.js                      Hook polling KDS

apps/heladeria/components/
├── HeladeriaTerminalSelector.jsx
├── QuickIceCreamPanel.jsx                Panel armado rápido
├── FlavorGrid.jsx                        Grid sabores + colores
├── HeladeriaTicketPanel.jsx              Ticket en construcción
├── HeladeriaCashSwitch.jsx               Switch de caja
├── HeladeriaCheckout.jsx                 Pantalla de cobro
├── FlavorAvailabilityToggle.jsx          Botón AGOTAR SABOR
└── KdsOrderCard.jsx                     Tarjeta comanda KDS

apps/heladeria/sections/
├── PosHeladeriaUI.jsx                    ★ NUEVO — POS rápido
├── KdsHeladosUI.jsx                      [REESCRIBIR]
├── KdsMalteadasUI.jsx                    [REESCRIBIR]
├── TiendaInteractivaUI.jsx              [OLEADA 2]
├── DisplayTotemUI.jsx                    [OLEADA 2]
└── DisplayPreciosUI.jsx                  [OLEADA 2]

FRONTEND AUDITORÍA:
apps/AuditoriaControlUI.jsx               [MODIFICAR] +pestaña Reportes Diarios + fix API_BASE
```

**Totales MVP:** ~22 archivos nuevos + ~7 archivos modificados

---

## Orden de Ejecución

| Paso | Qué | Depende de |
|---|---|---|
| **1** | Migración BD + modelos backend | — |
| **2** | Service + Router heladería (6 endpoints) | Paso 1 |
| **3** | Services + Hooks frontend | Paso 2 |
| **4** | POS Heladería (UI completa) | Paso 2 + 3 |
| **5** | KDS Helados | Paso 2 |
| **6** | KDS Malteadas (copia de 5) | Paso 5 |
| **7** | Hub actualizado (6 tarjetas) | Paso 4 |
| **8** | Reporte Diario Consolidado (backend + frontend) | Paso 2 |
| **9** | Testing + Refinamiento | Todo |
| --- | **─── CORTE MVP ───** | --- |
| **10** | Tienda Interactiva (cliente) | MVP validado |
| **11** | Display Tótem | MVP validado |
| **12** | Display Precios | MVP validado |

---

## 🛡️ Protocolo de Despliegue Seguro — "El POS No Se Cae"

> [!CAUTION]
> **REGLA ABSOLUTA:** En ningún paso de este protocolo el módulo "Punto de Venta IA" puede dejar de funcionar. Si cualquier paso falla, se ejecuta el rollback y el POS sigue operando como si nada hubiera pasado.

### Pre-requisitos Antes de Tocar CUALQUIER Cosa

```bash
# PASO 0: BACKUP COMPLETO — No se hace NADA sin esto
# 0.1 Backup de la base de datos
pg_dump -U postgres -d rderico_erp -F c -f /backups/rderico_pre_heladeria_$(date +%Y%m%d_%H%M%S).dump

# 0.2 Backup del código fuente
cd /ruta/al/proyecto
git add -A && git commit -m "CHECKPOINT: Pre-heladería — estado estable del POS"
git tag -a v_pre_heladeria -m "Backup antes de integrar módulo heladería"
git push origin main --tags
```

> [!IMPORTANT]
> **Si el backup falla, DETENERSE.** No continuar sin backup verificado.

---

### Fase A: Backend — Despliegue Aislado (POS no se toca)

```bash
# PASO 1: Crear módulo heladería SIN conectarlo al API
# Crear archivos: __init__.py, models.py, schemas.py, service.py, router.py
# PERO NO modificar main.py todavía

# PASO 2: Verificar que los modelos se importan correctamente EN AISLAMIENTO
docker exec rderico-api-dev python -c "
import sys
sys.path.insert(0, '.')
from modules.heladeria.models import HeladeriaProductConfig, TicketItemComponent
print('✅ Modelos de heladería importan correctamente')
"
# ⛔ Si falla: corregir el error. El POS sigue funcionando porque main.py NO importa estos modelos.
```

```bash
# PASO 3: Ejecutar migración de BD en UNA TRANSACCIÓN
# El script add_heladeria_support.py debe estar envuelto en BEGIN/COMMIT
docker exec rderico-api-dev python migrations/add_heladeria_support.py

# PASO 3.1: VERIFICAR que el POS sigue funcionando INMEDIATAMENTE después
# Abrir el POS de panadería en el navegador y:
#   ✅ Verificar que carga la selección de terminales
#   ✅ Seleccionar una terminal (ej. T1)
#   ✅ Verificar que carga el catálogo (categorías + productos)
#   ✅ Agregar un producto al carrito (NO cobrar — solo verificar que funciona)
#   ✅ Cancelar y cerrar

# ⛔ Si el POS NO funciona después de la migración:
docker exec rderico-api-dev psql -U postgres -d rderico_erp -f /backups/rollback_heladeria.sql
# El rollback elimina columnas nuevas y tablas nuevas. Los datos originales no se pierden.
```

```bash
# PASO 4: Verificar que los endpoints POS existentes responden igual que antes
# Test automatizado: comparar respuestas antes y después

# 4.1 Tickets
curl -s http://localhost:5001/api/v1/pos/tickets | python -c "
import sys, json
data = json.load(sys.stdin)
print(f'✅ GET /pos/tickets: {len(data)} tickets, estructura intacta')
# Verificar que no hay campo 'channel' en la respuesta (el schema del POS no lo incluye)
if data and 'channel' not in data[0]:
    print('✅ Campo channel NO aparece en respuesta del POS (correcto)')
else:
    print('⚠️ Campo channel aparece — verificar schema')
"

# 4.2 Categorías
curl -s http://localhost:5001/api/v1/catalog/categories | python -c "
import sys, json
data = json.load(sys.stdin)
print(f'✅ GET /catalog/categories: {len(data)} categorías')
"

# 4.3 Terminal locks
curl -s http://localhost:5001/api/v1/pos/terminal-locks | python -c "
import sys, json
data = json.load(sys.stdin)
print(f'✅ GET /pos/terminal-locks: funcionando')
"
```

```bash
# PASO 5: AHORA SÍ conectar al main.py — este es el momento de verdad
# Agregar las 2 líneas de import + router a main.py

# PASO 5.1: Reiniciar el API
docker restart rderico-api-dev

# PASO 5.2: Esperar 10 segundos y verificar que arrancó
sleep 10
curl -s http://localhost:5001/health | python -c "
import sys, json
data = json.load(sys.stdin)
if data.get('status') == 'ok':
    print('✅ API arrancó correctamente con módulo heladería')
else:
    print('⛔ API NO arrancó — ROLLBACK INMEDIATO')
"

# ⛔ Si el API NO arranca:
# 5.3 ROLLBACK: Revertir los 2 líneas agregadas a main.py
# git checkout -- apps/api/main.py
# docker restart rderico-api-dev
# El POS vuelve a funcionar en segundos. Las tablas nuevas quedan pero no molestan.
```

```bash
# PASO 6: Verificar endpoints de heladería Y POS simultáneamente
# 6.1 Heladería nueva
curl -s http://localhost:5001/api/v1/heladeria/menu
# Debe responder (aunque esté vacío)

# 6.2 POS existente (VERIFICACIÓN CRÍTICA)
curl -s http://localhost:5001/api/v1/pos/tickets
# Debe responder EXACTAMENTE igual que antes del paso 5

# 6.3 Caja existente
curl -s http://localhost:5001/api/v1/cash/sessions/history
# Debe responder igual que antes
```

---

### Fase B: Frontend — Despliegue Aditivo

```bash
# PASO 7: Agregar archivos frontend de heladería
# Todos los archivos nuevos van en apps/heladeria/ — carpeta separada del POS
# NO se modifica NINGÚN archivo en apps/pos/

# PASO 7.1: Modificar HeladeriaHubUI.jsx (agregar 6ª tarjeta)
# Este archivo es SOLO del módulo heladería — no afecta al POS

# PASO 7.2: Modificar AuditoriaControlUI.jsx (agregar pestaña)
# Riesgo: Si hay error JS, podría romper el componente de Auditoría
# Mitigación: Envolver la pestaña nueva en try/catch con ErrorBoundary propio

# PASO 8: Build del frontend
npm run build

# ⛔ Si el build falla:
# Revertir los archivos modificados: git checkout -- apps/AuditoriaControlUI.jsx apps/heladeria/HeladeriaHubUI.jsx
# Re-build: npm run build
# El frontend vuelve al estado anterior

# PASO 8.1: VERIFICAR POS EN NAVEGADOR
# Abrir el POS de panadería y ejecutar el checklist completo:
```

---

### Fase C: Checklist de Verificación Post-Despliegue

#### Checklist POS Panadería (DEBE pasar 100%)

| # | Test | Verificación | ¿Pasa? |
|---|---|---|---|
| 1 | Abrir POS Panadería | Carga la selección de terminales (T1-T6, CAJA) | ☐ |
| 2 | Seleccionar terminal T1 | Terminal se bloquea, muestra interfaz de venta | ☐ |
| 3 | Verificar catálogo | Las 17 categorías + productos cargan correctamente | ☐ |
| 4 | Agregar producto al carrito | El producto aparece con precio correcto | ☐ |
| 5 | Verificar persistencia atómica | Recargar página → el producto sigue en el ticket | ☐ |
| 6 | Eliminar producto | Se elimina correctamente | ☐ |
| 7 | Verificar terminal lock | Desde otra pestaña, T1 aparece como "Ocupada" | ☐ |
| 8 | Liberar terminal | Salir del POS → T1 se libera | ☐ |
| 9 | Auditoría y Control | Las pestañas "Tickets" y "Cortes de Caja" funcionan | ☐ |
| 10 | Auditoría — Pestaña nueva | "Reportes Diarios" aparece y no rompe las otras | ☐ |

> [!WARNING]
> **Si CUALQUIER test del 1 al 8 falla, ejecutar rollback completo inmediatamente.** Los tests 9-10 son de menor criticidad.

#### Checklist Heladería (verificar que lo nuevo funciona)

| # | Test | Verificación | ¿Pasa? |
|---|---|---|---|
| 11 | Hub Heladería | Muestra 6 tarjetas (incluyendo POS Heladería) | ☐ |
| 12 | POS Heladería | Carga selector de terminales H1, H2, H-CAJA | ☐ |
| 13 | Menú dinámico | Categorías de heladería cargan desde el API | ☐ |
| 14 | Agotar sabor | Toggle funciona, sabor se marca AGOTADO | ☐ |
| 15 | Crear ticket | Se crea con `channel='HELADERIA'` | ☐ |
| 16 | Cobrar | Pago se registra, ticket pasa a PAID | ☐ |
| 17 | KDS | Pedido pagado aparece en la estación correcta | ☐ |
| 18 | Corte de caja | Ventas de heladería aparecen en el corte del cajero | ☐ |
| 19 | Reporte consolidado | Desglose por PANADERÍA y HELADERÍA correcto | ☐ |

---

### 🔴 Plan de Emergencia — "Botón Rojo"

Si en cualquier momento el POS de panadería deja de funcionar:

```bash
# NIVEL 1: Rollback de frontend (30 segundos)
git checkout -- apps/AuditoriaControlUI.jsx
git checkout -- apps/heladeria/HeladeriaHubUI.jsx
npm run build
# → El frontend vuelve al estado anterior. La heladería queda como placeholder.

# NIVEL 2: Rollback de backend (60 segundos)
git checkout -- apps/api/main.py
docker restart rderico-api-dev
# → El API ignora el módulo heladería. Las tablas nuevas quedan pero no molestan.

# NIVEL 3: Rollback de BD — NUCLEAR (5 minutos)
# Solo si los niveles 1 y 2 no resuelven:
pg_restore -U postgres -d rderico_erp -c /backups/rderico_pre_heladeria_XXXXXXXX.dump
docker restart rderico-api-dev
npm run build
# → TODO vuelve al estado exacto pre-heladería. Pérdida: solo el trabajo de heladería.
```

| Nivel | Qué restaura | Tiempo | ¿Se pierde algo? |
|---|---|---|---|
| **1** | Frontend | 30 seg | Solo cambios de UI heladería |
| **2** | Backend | 60 seg | El módulo heladería backend queda desconectado |
| **3** | Todo (nuclear) | 5 min | Todo el trabajo de heladería |

> [!TIP]
> **El Nivel 3 nunca debería ser necesario** si se sigue el protocolo paso a paso. Los Niveles 1 y 2 son suficientes para resolver cualquier problema porque los cambios son aditivos — quitar lo nuevo restaura lo viejo.

---

## Verification Plan — Tests Funcionales

### Smoke Test Automatizado
```bash
# 1. Migración
docker exec rderico-api-dev python migrations/add_heladeria_support.py

# 2. API
docker exec rderico-api-dev python -c "from modules.heladeria.models import *; print('OK')"

# 3. Frontend
npm run build
```

### Test Funcional Manual
1. **POS Panadería:** Checklist completo (tests 1-8 del protocolo de despliegue)
2. **POS Heladería:** Abrir H1 → armar helado (4 taps) → agregar → cobrar → verificar en corte de caja
3. **Agotar Sabor:** Toggle mango → se marca rojo inmediatamente
4. **KDS:** Pedido pagado aparece en estación correcta con nombre del integrante
5. **Caja unificada:** Cerrar turno → ventas helados + panadería en mismo sistema de caja
6. **Reporte Consolidado:** Auditoría y Control → Reportes Diarios → seleccionar fecha → ver desglose por channel
7. **Offline:** Desconectar cable → operar → reconectar → verificar sync
