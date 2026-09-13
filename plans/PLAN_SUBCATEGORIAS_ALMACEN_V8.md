# Plan v8: Subcategorías de Almacén Configurables (`proposito`)

**Estado:** ✅ APROBADO — listo para implementar
**Rama sugerida:** `feature/almacenes-v8-subcategorias`
**Base:** `main` @ `ae8b1f9`
**Autor:** Arquitectura
**Fecha:** 2026-09-13
**Aprobación:** El usuario aprobó el plan siguiendo todas las recomendaciones de la sección 10.

---

## 1. Problema a resolver

### 1.1 Diagnóstico de UX

En la suite de zona de [`WarehouseManagerUI.jsx`](apps/inventory/WarehouseManagerUI.jsx) conviven **dos barras de filtrado apiladas** que confunden al operador:

| # | Barra | Ubicación | Filtra por | Valores |
|---|-------|-----------|------------|---------|
| 1 | Subcategorías | [`WarehouseManagerUI.jsx:1158`](apps/inventory/WarehouseManagerUI.jsx:1158) | `proposito` | Almacenes / Exhibidores, Almacenes de Insumos, Almacenes de Equipamiento |
| 2 | Tipos | [`WarehouseManagerUI.jsx:1197`](apps/inventory/WarehouseManagerUI.jsx:1197) | `type` | Todos, Almacén General, Almacén Exhibidor, ... |

**Problema A — La barra de tipos es redundante.** Dentro de una zona + subcategoría ya filtrada quedan típicamente 2-5 almacenes que suelen compartir el mismo `type`. El filtro casi nunca reduce el conjunto. Es el mismo patrón de redundancia que la barra de búsqueda eliminada en `ae8b1f9`.

**Problema B — El engrane gestiona la dimensión equivocada.** El botón ⚙️ de [`WarehouseManagerUI.jsx:1214`](apps/inventory/WarehouseManagerUI.jsx:1214) abre el modal "Gestionar Categorías" de [`WarehouseManagerUI.jsx:2165`](apps/inventory/WarehouseManagerUI.jsx:2165), que edita `warehouseTypes` (la dimensión `type`). El usuario espera que gestione la barra de **subcategorías** (`proposito`), que es la que realmente segmenta el inventario.

### 1.2 Bloqueador técnico

`proposito` es un **enum cerrado** validado por Pydantic:

```python
# apps/api/modules/warehouse/schemas.py:11
class PropositoAlmacen(str, Enum):
    ALMACENAMIENTO = "ALMACENAMIENTO"
    EXHIBICION_VENTA = "EXHIBICION_VENTA"
    EQUIPAMIENTO = "EQUIPAMIENTO"
```

Aplicado en dos puntos de validación:

```python
# apps/api/modules/warehouse/schemas.py:76  (AlmacenBase)
proposito: PropositoAlmacen

# apps/api/modules/warehouse/schemas.py:89  (AlmacenUpdate)
proposito: Optional[PropositoAlmacen] = None
```

**Consecuencia:** si el frontend envía `proposito: "CAVA_DE_VINOS"`, el POST/PUT a `/api/v1/warehouse` **falla con HTTP 422**. No es un cambio de UI; requiere backend + migración.

**Contraste:** `type` **sí es texto libre** en la BD ([`models.py:42`](apps/api/modules/warehouse/models.py:42) es `Column(String)` sin validación de enum en el schema de almacén), por eso el modal actual puede crear tipos nuevos sin tocar backend.

### 1.3 Hallazgo adicional: `warehouseTypes` no se persiste

El estado `warehouseTypes` de [`WarehouseManagerUI.jsx:166`](apps/inventory/WarehouseManagerUI.jsx:166) se inicializa desde `INITIAL_TYPES` ([`WarehouseManagerUI.jsx:64`](apps/inventory/WarehouseManagerUI.jsx:64)) y **solo vive en memoria del navegador**. `handleAddType` ([`WarehouseManagerUI.jsx:688`](apps/inventory/WarehouseManagerUI.jsx:688)) y `handleRenameType` ([`WarehouseManagerUI.jsx:708`](apps/inventory/WarehouseManagerUI.jsx:708)) hacen `setWarehouseTypes(...)` sin llamada a API.

**Implicación:** al recargar la página, todo tipo creado o renombrado **se pierde**. El modal "Gestionar Categorías" actual es efectivamente decorativo. Esto refuerza la necesidad de persistir en backend.

---

## 2. Análisis de la lógica de categorías de productos (sugerencia del usuario)

Se auditó el módulo de catálogo para evaluar si su lógica de gestión de categorías es trasplantable. **Resultado: sí, en su mayoría, y con un hallazgo que mejora el diseño original.**

### 2.1 Inventario de mecanismos encontrados

| Mecanismo | Ubicación | ¿Trasplantable? | Nota |
|---|---|---|---|
| `is_system` protege de edición y borrado | [`models.py:13`](apps/api/modules/catalog/models.py:13), [`service.py:31`](apps/api/modules/catalog/service.py:31), [`service.py:47`](apps/api/modules/catalog/service.py:47) | ✅ **Sí** | Idéntico a `es_sistema` propuesto |
| Bloqueo de borrado si contiene productos | [`service.py:50-56`](apps/api/modules/catalog/service.py:50) | ✅ **Sí** | Equivalente: "si tiene almacenes" |
| Categoría `DESCONTINUADOS` como cuarentena | [`main.py:222-250`](apps/api/main.py:222) | ✅ **Sí — mejora clave** | Resuelve el dilema borrar vs conservar |
| `position` para ordenar | [`models.py:11`](apps/api/modules/catalog/models.py:11), [`service.py:179`](apps/api/modules/catalog/service.py:179) | ✅ **Sí** | Ya contemplado como `orden` |
| `reorder_categories` | [`service.py:179-187`](apps/api/modules/catalog/service.py:179) | ✅ **Sí** | Patrón para reordenar la barra |
| `vision_enabled` | [`models.py:12`](apps/api/modules/catalog/models.py:12) | ❌ **No** | Específico de visión, no aplica a almacenes |
| `IntegrityError` → soft delete | [`service.py:130-135`](apps/api/modules/catalog/service.py:130) | ⚠️ **Parcial** | Útil como red de seguridad, pero el bloqueo preventivo es superior |
| Verificación de permisos en frontend | [`ProductCatalogUI.jsx:421`](apps/inventory/ProductCatalogUI.jsx:421) | ⚠️ **Parcial** | Usa `alert()`; en almacenes usamos `showOpMessage` (toast) |

### 2.2 El hallazgo más valioso: `DESCONTINUADOS` como cuarentena

En productos, `DESCONTINUADOS` es una categoría de sistema (`is_system=True`, `position=999`, icono 🗑️) que funciona como **zona de cuarentena**: no se puede borrar, y sirve de destino para productos que se quieren retirar sin perder la data. Solo desde ahí se permite el borrado definitivo.

**Aplicado a almacenes, esto resuelve elegantemente el dilema de la decisión abierta #1** (borrado físico vs soft delete):

- En lugar de devolver un **409 seco** cuando una subcategoría tiene almacenes, el sistema ofrece **trasladar** esos almacenes a una subcategoría de cuarentena.
- Una vez vacía, la subcategoría se puede borrar definitivamente.
- Esto es **superior** a mi propuesta original: no bloquea al usuario, le da una salida.

**Matiz importante:** a diferencia de un producto (que puede quedar sin categoría), un almacén **no puede quedar sin `proposito`** porque la columna es `nullable=False` ([`models.py:42`](apps/api/modules/warehouse/models.py:42)). La cuarentena resuelve exactamente eso: siempre hay un destino válido.

### 2.3 Diferencia de semántica a respetar

| Aspecto | Productos | Almacenes (propuesto) |
|---------|-----------|----------------------|
| Cuarentena | `DESCONTINUADOS` (productos retirados de venta) | `SIN_CLASIFICAR` (almacenes sin subcategoría asignada) |
| Semántica | "Ya no se vende" | "Aún no se clasificó" |
| ¿Se muestra en la barra? | Sí, al final | Sí, al final (o solo en el modal) |

**Decisión:** usar `SIN_CLASIFICAR` en lugar de `DESCONTINUADOS` porque un almacén no "se descontinúa" — simplemente queda pendiente de clasificación. Es más honesto semánticamente.

### 2.4 Lo que NO se trasplanta

- **`vision_enabled`**: no tiene sentido para almacenes.
- **`alert()` en el frontend**: viola la convención del proyecto. Se usa `showOpMessage` ([`WarehouseManagerUI.jsx:258`](apps/inventory/WarehouseManagerUI.jsx:258)).
- **`IntegrityError` como mecanismo principal**: en productos es un fallback tras intentar borrar. En almacenes haremos la verificación **preventiva** (contar almacenes antes de borrar), que da mejor mensaje al usuario.

---

## 3. Decisión de arquitectura

### 3.1 Opciones evaluadas

| Opción | Descripción | Veredicto |
|--------|-------------|-----------|
| **A. Texto libre** | Quitar el enum y aceptar cualquier string | ❌ Sin control de calidad; permite duplicados por typo |
| **B. Tabla catálogo** | Nueva tabla `warehouse_propositos` con CRUD propio | ✅ **Elegida** |
| **C. Enum extendido** | Agregar valores al enum de Python | ❌ Requiere deploy por cada categoría nueva |

### 3.2 Opción elegida: tabla catálogo con lógica de catálogo de productos

Se replica el patrón de [`apps/api/modules/catalog/`](apps/api/modules/catalog/service.py) adaptado a almacenes:

- `is_system` → `es_sistema` (protege los 3 valores base)
- `position` → `orden` (controla el orden en la barra)
- `DESCONTINUADOS` → `SIN_CLASIFICAR` (cuarentena)
- Bloqueo de borrado si tiene hijos → bloqueo si tiene almacenes, **con opción de traslado**

### 3.3 Decisión sobre `type` (la barra redundante)

**Se elimina la barra de tipos de la UI** ([`WarehouseManagerUI.jsx:1197-1213`](apps/inventory/WarehouseManagerUI.jsx:1197)) y el estado `filterType` ([`WarehouseManagerUI.jsx:169`](apps/inventory/WarehouseManagerUI.jsx:169)). El campo `type` **se conserva en la BD** para no romper registros ni el editor de almacén, pero deja de ser un eje de navegación.

**Justificación:** elimina la duplicidad de barras sin riesgo de migración. Cambio puramente de UI, reversible.

---

## 4. Modelo de datos

### 4.1 Nueva tabla `warehouse_propositos`

```python
# apps/api/modules/warehouse/models.py  (añadir)

class WarehouseProposito(Base):
    """v8: catalogo configurable de subcategorias de almacen.

    Reemplaza al enum cerrado PropositoAlmacen. El `codigo` es el valor que se
    persiste en almacenes.proposito (compatibilidad hacia atras con los 3
    valores historicos: ALMACENAMIENTO, EXHIBICION_VENTA, EQUIPAMIENTO).

    Patron heredado de catalog.Category: is_system protege los valores base,
    position controla el orden, y SIN_CLASIFICAR actua como cuarentena.
    """
    __tablename__ = "warehouse_propositos"
    id = Column(String, primary_key=True, default=lambda: f"wpr_{uuid.uuid4().hex[:8]}")
    codigo = Column(String, nullable=False, unique=True, index=True)  # ALMACENAMIENTO, ...
    label = Column(String, nullable=False)                            # Almacenes de Insumos
    icon = Column(String, nullable=False, default="📦")               # emoji para la barra
    orden = Column(Integer, nullable=False, default=0)                # orden en la barra
    es_sistema = Column(Boolean, nullable=False, default=False)       # no borrable
    es_cuarentena = Column(Boolean, nullable=False, default=False)    # destino de traslado
    activo = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, default=_utcnow)
```

**Notas de diseño:**
- `codigo` es el valor que vive en `almacenes.proposito`. Se mantiene el nombre histórico para no migrar datos de almacenes.
- `es_sistema=True` protege los 4 valores base de borrado accidental (patrón de [`service.py:47`](apps/api/modules/catalog/service.py:47)).
- `es_cuarentena=True` marca `SIN_CLASIFICAR` como destino de traslado. Solo puede haber una.
- `orden` permite reordenar la barra (patrón de [`service.py:179`](apps/api/modules/catalog/service.py:179)).
- `activo` permite ocultar una subcategoría sin borrarla.

### 4.2 Cambio en `almacenes.proposito`

**No se cambia el tipo de columna** (sigue siendo `Column(String, nullable=False)`). Se añade una **FK lógica** validada en servicio, no a nivel de BD, para evitar un `ALTER TABLE` con riesgo sobre datos existentes.

**Razón:** una FK real requeriría que todos los valores existentes ya estén en el catálogo. La migración los siembra, pero una FK dura impediría operaciones durante el despliegue. La validación en servicio da el mismo control con menor riesgo.

### 4.3 Diagrama de relaciones

```mermaid
erDiagram
    WAREHOUSE_PROPOSITOS {
        string id PK
        string codigo UK
        string label
        string icon
        int orden
        bool es_sistema
        bool es_cuarentena
        bool activo
    }
    ALMACENES {
        string id PK
        string nombre
        string zona_termica
        string proposito FK_LOGICA
        string type
    }
    STOCK_ALMACEN {
        string id PK
        string almacen_id FK
        string item_id
        float cantidad_actual
    }
    WAREHOUSE_PROPOSITOS ||--o{ ALMACENES : clasifica
    ALMACENES ||--o{ STOCK_ALMACEN : contiene
```

---

## 5. Migración Alembic

**Archivo:** `apps/api/migrations/versions/f5a6b7c8d9e0_add_warehouse_propositos.py`
**`down_revision`:** `e4f5a6b7c8d9` (head actual, auditoría)

### 5.1 `upgrade()`

1. Crear tabla `warehouse_propositos` con las columnas de la sección 4.1.
2. Crear índice único en `codigo`.
3. **Sembrar los 4 valores base**:

| codigo | label | icon | orden | es_sistema | es_cuarentena |
|--------|-------|------|-------|------------|---------------|
| `EXHIBICION_VENTA` | Almacenes / Exhibidores | 🏪 | 1 | true | false |
| `ALMACENAMIENTO` | Almacenes de Insumos | 📦 | 2 | true | false |
| `EQUIPAMIENTO` | Almacenes de Equipamiento | 🔧 | 3 | true | false |
| `SIN_CLASIFICAR` | Sin Clasificar | 🗂️ | 999 | true | **true** |

4. **Verificación de integridad:** consultar `SELECT DISTINCT proposito FROM almacenes` y confirmar que cada valor existe en el catálogo. Si aparece un valor huérfano, insertarlo con `es_sistema=False` y registrar advertencia en el log de la migración (no fallar).

### 5.2 `downgrade()`

1. `DROP TABLE warehouse_propositos`.
2. **No se toca `almacenes`** — los datos de `proposito` permanecen intactos, por lo que el downgrade es seguro y sin pérdida.

### 5.3 Nota sobre el enum de Python

El enum `PropositoAlmacen` de [`schemas.py:11`](apps/api/modules/warehouse/schemas.py:11) **se conserva** durante la transición, pero deja de usarse en `AlmacenBase`/`AlmacenUpdate` (sección 6.2). Se marca como deprecado con un comentario que apunte a la tabla nueva. Se elimina en una fase posterior.

---

## 6. Backend

### 6.1 Nuevos schemas

```python
# apps/api/modules/warehouse/schemas.py  (añadir)

class WarehousePropositoBase(BaseModel):
    codigo: str = Field(..., min_length=2, max_length=40, pattern=r"^[A-Z0-9_]+$")
    label: str = Field(..., min_length=2, max_length=60)
    icon: str = Field(default="📦", max_length=8)
    orden: int = 0
    activo: bool = True

class WarehousePropositoCreate(WarehousePropositoBase):
    pass

class WarehousePropositoUpdate(BaseModel):
    label: Optional[str] = Field(None, min_length=2, max_length=60)
    icon: Optional[str] = Field(None, max_length=8)
    orden: Optional[int] = None
    activo: Optional[bool] = None
    # NOTA: `codigo` NO es editable. Cambiarlo romperia la referencia desde
    # almacenes.proposito. Para renombrar la etiqueta visible se usa `label`.

class WarehousePropositoResponse(WarehousePropositoBase):
    id: str
    es_sistema: bool
    es_cuarentena: bool
    created_at: datetime

    class Config:
        from_attributes = True

class TrasladarAlmacenesRequest(BaseModel):
    """v8: traslada todos los almacenes de una subcategoria a otra.

    Se usa antes de eliminar una subcategoria con almacenes asignados,
    replicando el patron DESCONTINUADOS del catalogo de productos.
    """
    proposito_destino: str = Field(..., min_length=2, max_length=40)
```

**Decisión clave:** `codigo` es inmutable tras la creación. Renombrar la etiqueta visible (`label`) es lo que el usuario realmente quiere; cambiar el `codigo` obligaría a un `UPDATE` en cascada sobre `almacenes`.

### 6.2 Relajar la validación de `proposito` en Almacen

```python
# apps/api/modules/warehouse/schemas.py

# ANTES
class AlmacenBase(BaseModel):
    proposito: PropositoAlmacen

class AlmacenUpdate(BaseModel):
    proposito: Optional[PropositoAlmacen] = None

# DESPUES
class AlmacenBase(BaseModel):
    proposito: str = Field(..., min_length=2, max_length=40, pattern=r"^[A-Z0-9_]+$")

class AlmacenUpdate(BaseModel):
    proposito: Optional[str] = Field(None, min_length=2, max_length=40, pattern=r"^[A-Z0-9_]+$")
```

La validación de que el `codigo` **existe y está activo** se hace en el servicio (sección 6.3), porque requiere consulta a BD.

### 6.3 Validación en servicio

```python
# apps/api/modules/warehouse/service.py  (añadir helper)

async def _validar_proposito(db: AsyncSession, codigo: str) -> None:
    """v8: valida que el proposito exista y este activo en el catalogo.

    Lanza HTTP 422 con mensaje claro si no existe, en lugar del 422 opaco que
    producia el enum de Pydantic.
    """
    result = await db.execute(
        select(models.WarehouseProposito).where(
            models.WarehouseProposito.codigo == codigo,
            models.WarehouseProposito.activo == True,
        )
    )
    if result.scalar_one_or_none() is None:
        raise HTTPException(
            status_code=422,
            detail=f"Subcategoria '{codigo}' no existe o esta inactiva.",
        )
```

Se invoca en `create_warehouse` ([`service.py:21`](apps/api/modules/warehouse/service.py:21)) y `update_warehouse` ([`service.py:28`](apps/api/modules/warehouse/service.py:28)) **solo cuando `proposito` viene en el payload**.

### 6.4 Lógica de borrado con cuarentena (trasplante del catálogo)

```python
# apps/api/modules/warehouse/service.py  (añadir)

async def delete_proposito(db: AsyncSession, proposito_id: str) -> dict:
    """v8: elimina una subcategoria replicando la logica de catalog.delete_category.

    Reglas (heredadas de apps/api/modules/catalog/service.py:43-60):
      1. No se puede borrar una subcategoria de sistema (es_sistema=True).
      2. No se puede borrar una subcategoria que contiene almacenes.
         El usuario debe trasladarlos primero (a SIN_CLASIFICAR o a otra).
      3. No se puede borrar la cuarentena misma.
    """
    result = await db.execute(
        select(models.WarehouseProposito).where(models.WarehouseProposito.id == proposito_id)
    )
    proposito = result.scalar_one_or_none()
    if not proposito:
        raise HTTPException(status_code=404, detail="Subcategoria no encontrada.")

    # Regla 1: proteccion de sistema (patron catalog/service.py:47)
    if proposito.es_sistema:
        raise HTTPException(
            status_code=409,
            detail="No se puede eliminar una subcategoria del sistema.",
        )

    # Regla 2: integridad — no borrar si contiene almacenes
    # (patron catalog/service.py:50-56, pero con conteo para mejor mensaje)
    result_count = await db.execute(
        select(func.count()).select_from(models.Almacen).where(
            models.Almacen.proposito == proposito.codigo
        )
    )
    en_uso = result_count.scalar() or 0
    if en_uso > 0:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Hay {en_uso} almacenes usando esta subcategoria. "
                f"Trasladalos a otra subcategoria antes de eliminarla."
            ),
        )

    await db.delete(proposito)
    await db.commit()
    return {"ok": True, "codigo": proposito.codigo}


async def trasladar_almacenes(
    db: AsyncSession, proposito_origen_id: str, proposito_destino_codigo: str
) -> dict:
    """v8: traslada todos los almacenes de una subcategoria a otra.

    Es el equivalente a mover productos a DESCONTINUADOS en el catalogo.
    Permite vaciar una subcategoria para poder eliminarla sin perder data.
    """
    result = await db.execute(
        select(models.WarehouseProposito).where(models.WarehouseProposito.id == proposito_origen_id)
    )
    origen = result.scalar_one_or_none()
    if not origen:
        raise HTTPException(status_code=404, detail="Subcategoria origen no encontrada.")

    if origen.codigo == proposito_destino_codigo:
        raise HTTPException(status_code=422, detail="El destino debe ser distinto del origen.")

    await _validar_proposito(db, proposito_destino_codigo)

    result_upd = await db.execute(
        update(models.Almacen)
        .where(models.Almacen.proposito == origen.codigo)
        .values(proposito=proposito_destino_codigo)
    )
    await db.commit()
    return {"ok": True, "trasladados": result_upd.rowcount, "destino": proposito_destino_codigo}
```

### 6.5 Nuevos endpoints

Se añaden al router existente [`apps/api/modules/warehouse/router.py`](apps/api/modules/warehouse/router.py).

| Método | Ruta | Descripción | Permiso |
|--------|------|-------------|---------|
| `GET` | `/api/v1/warehouse/propositos` | Lista subcategorías activas ordenadas por `orden` | — (lectura libre) |
| `POST` | `/api/v1/warehouse/propositos` | Crea subcategoría | `almacenes.crear` |
| `PUT` | `/api/v1/warehouse/propositos/{id}` | Renombra `label`, cambia `icon`/`orden`/`activo` | `almacenes.editar` |
| `DELETE` | `/api/v1/warehouse/propositos/{id}` | Elimina si no es sistema y no tiene almacenes | `almacenes.eliminar` |
| `POST` | `/api/v1/warehouse/propositos/{id}/trasladar` | Traslada almacenes a otra subcategoría | `almacenes.editar` |
| `POST` | `/api/v1/warehouse/propositos/reorder` | Reordena la barra (patrón [`service.py:179`](apps/api/modules/catalog/service.py:179)) | `almacenes.editar` |

**Orden de declaración en el router:** las rutas `/propositos` deben declararse **antes** de `/{warehouse_id}` para que `propositos` no se interprete como un `warehouse_id`. Es el mismo cuidado ya documentado en [`router.py:33-35`](apps/api/modules/warehouse/router.py:33) para `stock-por-sku`.

### 6.6 Auditoría

Las operaciones POST/PUT/DELETE/trasladar sobre subcategorías se registran con [`registrar_auditoria()`](apps/api/core/audit.py:45) usando acciones `SUBCATEGORIA_CREAR`, `SUBCATEGORIA_EDITAR`, `SUBCATEGORIA_ELIMINAR`, `SUBCATEGORIA_TRASLADAR`. Es un cambio de configuración estructural, por lo que debe quedar trazado.

### 6.7 Seed en arranque

Se replica el patrón `ensure_system_categories` de [`main.py:222`](apps/api/main.py:222) con un `ensure_warehouse_propositos` que garantice los 4 valores base en cada arranque (idempotente). Protege contra bases restauradas desde un backup previo a la migración.

---

## 7. Frontend

### 7.1 Nuevo estado y carga

```jsx
// apps/inventory/WarehouseManagerUI.jsx
const [propositos, setPropositos] = useState([]);        // catalogo desde API
const [showPropositoManager, setShowPropositoManager] = useState(false);
const [newPropositoLabel, setNewPropositoLabel] = useState('');
const [trasladoDialog, setTrasladoDialog] = useState(null); // { proposito, count }
```

Se elimina `SUB_CATEGORIES` hardcodeado de [`WarehouseManagerUI.jsx:958`](apps/inventory/WarehouseManagerUI.jsx:958) y se reemplaza por `propositos` cargado vía `GET /api/v1/warehouse/propositos`.

**Fallback obligatorio:** si la llamada falla (offline o error), usar los 4 valores base como respaldo local para que la UI nunca quede vacía. Respeta el modo offline de Fase 4.

### 7.2 Mappers (DRY + testeables)

Siguiendo el patrón de [`warehouseMappers.js`](apps/inventory/utils/warehouseMappers.js):

```js
// apps/inventory/utils/warehouseMappers.js
export const mapPropositoFromApi = (p) => ({
    key: p.codigo,
    label: p.label,
    icon: p.icon,
    orden: p.orden,
    esSistema: p.es_sistema,
    esCuarentena: p.es_cuarentena,
    activo: p.activo,
});

export const sortPropositos = (lista) =>
    [...lista].sort((a, b) => a.orden - b.orden);

export const buildPropositoCreatePayload = (label, icon = '📦') => ({
    codigo: label.trim().toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, ''),
    label: label.trim(),
    icon,
    orden: 99,
    activo: true,
});

export const validatePropositoDelete = (proposito, warehouses) => {
    if (proposito.esSistema) {
        return { ok: false, error: 'No se puede eliminar una subcategoria del sistema.' };
    }
    const enUso = warehouses.filter(w => (w.proposito || 'EXHIBICION_VENTA') === proposito.key);
    if (enUso.length > 0) {
        return {
            ok: false,
            error: `Hay ${enUso.length} almacenes usando esta subcategoria.`,
            requiereTraslado: true,
            count: enUso.length,
        };
    }
    return { ok: true, error: null };
};
```

Estas funciones se cubren con Vitest **sin montar React**, igual que los 74 tests actuales.

### 7.3 Cambios de layout

**a) Eliminar la barra de tipos redundante** — [`WarehouseManagerUI.jsx:1197-1213`](apps/inventory/WarehouseManagerUI.jsx:1197). Se elimina el contenedor completo y el estado `filterType` ([`WarehouseManagerUI.jsx:169`](apps/inventory/WarehouseManagerUI.jsx:169)).

**b) Simplificar el filtro de la grilla** — [`WarehouseManagerUI.jsx:1234`](apps/inventory/WarehouseManagerUI.jsx:1234):

```jsx
// ANTES
{subCatWarehouses.filter(wh => filterType === 'ALL' || wh.type === filterType).map(wh => {

// DESPUES
{subCatWarehouses.map(wh => {
```

**c) Mover el engrane junto a la barra de subcategorías** — [`WarehouseManagerUI.jsx:1158-1176`](apps/inventory/WarehouseManagerUI.jsx:1158). El contenedor pasa a `flex items-center gap-2` y el botón ⚙️ se coloca como hermano de la barra, alineado a su derecha:

```jsx
{selectedZone && suiteTab === 'existencias' && (
    <div className="mb-4 flex items-center gap-2">
        <div className="bg-slate-900/50 border border-slate-500/30 rounded-2xl p-1.5 flex gap-1 w-max backdrop-blur-md">
            {propositosOrdenados.map(sc => (
                <button
                    key={sc.key}
                    onClick={() => setSubCategoryTab(sc.key)}
                    className={subCategoryTab === sc.key ? '...activo...' : '...inactivo...'}
                >
                    <span className="text-base">{sc.icon}</span>
                    <span>{sc.label}</span>
                </button>
            ))}
        </div>
        <button
            onClick={() => setShowPropositoManager(true)}
            title="Gestionar Subcategorías"
            className="p-2.5 rounded-xl bg-slate-900/50 border border-slate-500/30 hover:border-indigo-500/50 text-slate-400 hover:text-indigo-400 transition-colors backdrop-blur-md"
        >
            ⚙️
        </button>
    </div>
)}
```

**d) Eliminar el modal antiguo "Gestionar Categorías"** — [`WarehouseManagerUI.jsx:2165-2224`](apps/inventory/WarehouseManagerUI.jsx:2165), junto con `handleAddType` ([`WarehouseManagerUI.jsx:688`](apps/inventory/WarehouseManagerUI.jsx:688)), `handleRenameType` ([`WarehouseManagerUI.jsx:708`](apps/inventory/WarehouseManagerUI.jsx:708)), el estado `warehouseTypes` ([`WarehouseManagerUI.jsx:166`](apps/inventory/WarehouseManagerUI.jsx:166)) y `INITIAL_TYPES` ([`WarehouseManagerUI.jsx:64`](apps/inventory/WarehouseManagerUI.jsx:64)) **si no tienen otros consumidores**. Se verifica con búsqueda antes de borrar (regla de higiene 5.2).

### 7.4 Nuevo modal "Gestionar Subcategorías"

Reemplaza al modal antiguo. Contenido:

1. **Lista de subcategorías** ordenada por `orden`, cada fila con: icono, `label`, `codigo` (solo lectura), badge "Sistema" si `es_sistema`, badge "Cuarentena" si `es_cuarentena`, y contador de almacenes en uso.
2. **Botón "Nueva Subcategoría"** → input de nombre + selector de icono → `POST /propositos`.
3. **Botón "Renombrar"** por fila → input inline → `PUT /propositos/{id}` (solo `label`).
4. **Botón "Eliminar"** por fila → deshabilitado si `es_sistema`; si tiene almacenes, abre el **diálogo de traslado** en lugar de fallar.
5. **Reordenar** con drag & drop (patrón de [`ProductCatalogUI.jsx:525`](apps/inventory/ProductCatalogUI.jsx:525)) → `POST /propositos/reorder`.

### 7.5 Diálogo de traslado (la pieza clave)

Cuando el usuario intenta eliminar una subcategoría con almacenes, en lugar de un error seco se abre:

```
┌─────────────────────────────────────────────────────┐
│  "Almacenes de Temporada" tiene 3 almacenes         │
│                                                     │
│  Para eliminarla, traslada sus almacenes a:         │
│                                                     │
│  ( ) Sin Clasificar            🗂️  [cuarentena]     │
│  ( ) Almacenes / Exhibidores   🏪                   │
│  ( ) Almacenes de Insumos      📦                   │
│  ( ) Almacenes de Equipamiento 🔧                   │
│                                                     │
│  [ Cancelar ]              [ Trasladar y Eliminar ] │
└─────────────────────────────────────────────────────┘
```

Al confirmar: `POST /propositos/{id}/trasladar` → si OK, `DELETE /propositos/{id}`. Se muestra toast con `showOpMessage` indicando cuántos almacenes se movieron.

**Esto es lo que hace que la lógica del catálogo de productos valga la pena trasplantar:** convierte un callejón sin salida en un flujo de dos pasos guiado.

---

## 8. Tests

### 8.1 pytest (backend) — 13 casos nuevos

Archivo: `apps/api/tests/test_warehouse_propositos.py`

| # | Caso | Verifica |
|---|------|----------|
| 1 | `test_listar_propositos_ordenados` | GET devuelve los 4 base ordenados por `orden` |
| 2 | `test_crear_proposito` | POST crea y devuelve `id`, `codigo` derivado |
| 3 | `test_crear_proposito_codigo_duplicado` | POST con `codigo` existente → 409 |
| 4 | `test_crear_proposito_codigo_invalido` | `codigo` con minúsculas/espacios → 422 |
| 5 | `test_renombrar_label` | PUT cambia `label` sin tocar `codigo` |
| 6 | `test_no_renombrar_codigo` | PUT con `codigo` en body → ignorado (no está en el schema) |
| 7 | `test_eliminar_proposito_vacio` | DELETE de subcategoría sin almacenes → 200 |
| 8 | `test_no_eliminar_proposito_sistema` | DELETE de `EXHIBICION_VENTA` → 409 |
| 9 | `test_no_eliminar_proposito_con_almacenes` | DELETE con 2 almacenes → 409 con conteo |
| 10 | `test_trasladar_almacenes` | POST trasladar mueve N almacenes y devuelve `trasladados: N` |
| 11 | `test_trasladar_a_mismo_origen` | POST trasladar al mismo `codigo` → 422 |
| 12 | `test_crear_almacen_proposito_inexistente` | POST `/warehouse` con `proposito` inválido → 422 con mensaje claro |
| 13 | `test_no_desactivar_proposito_sistema` | PUT con `activo=false` sobre `EXHIBICION_VENTA` → 409 (decisión #7) |

**Criterio de aceptación:** `pytest` pasa de 21 a **34** casos, todos verdes.

### 8.2 Vitest (frontend) — 7 casos nuevos

Archivo: `apps/inventory/utils/warehouseMappers.test.js` (añadir bloque)

| # | Caso | Verifica |
|---|------|----------|
| 1 | `mapPropositoFromApi` | Mapea snake_case → camelCase correctamente |
| 2 | `sortPropositos` | Ordena por `orden` ascendente sin mutar el original |
| 3 | `buildPropositoCreatePayload` | Deriva `codigo` de `"Almacenes de Temporada"` → `ALMACENES_DE_TEMPORADA` |
| 4 | `buildPropositoCreatePayload` con acentos | `"Café Frío"` → `CAF_FRIO` (sin caracteres inválidos) |
| 5 | `validatePropositoDelete` sistema | Devuelve `ok: false` para `esSistema: true` |
| 6 | `validatePropositoDelete` con almacenes | Devuelve `requiereTraslado: true` y `count` correcto |
| 7 | `validatePropositoDelete` vacío | Devuelve `ok: true` |

**Criterio de aceptación:** `npm test` pasa de 74 a 81 casos, todos verdes.

---

## 9. Protocolo de seguridad (no-interferencia POS)

Se respeta la sección 5.1 del [`PLAN_MAESTRO_ALMACENES_V7.md`](plans/PLAN_MAESTRO_ALMACENES_V7.md):

| Regla | Cómo se cumple |
|-------|----------------|
| No tocar `apps/pos/` | Ningún archivo del POS se modifica |
| No tocar `apps/api/modules/pos/` | Ningún archivo del POS backend se modifica |
| No tocar `stock_almacen` | La migración solo crea una tabla nueva y lee `almacenes` |
| No tocar el Outbox | `warehouse_events` no se modifica |
| `--reload` apagado durante migración | Se aplica la migración con el contenedor detenido o con reload off |
| Verificar `/health` tras la migración | Obligatorio antes de continuar |
| Verificar que el POS sigue cobrando | Prueba manual de venta al final |

**Riesgo específico de esta fase:** la migración `f5a6b7c8d9e0` es **aditiva** (solo `CREATE TABLE` + `INSERT`). No hay `ALTER` sobre tablas existentes, por lo que el riesgo de romper el POS es mínimo. El `downgrade` solo hace `DROP TABLE` de la tabla nueva.

---

## 10. Decisiones CONFIRMADAS por el usuario

El usuario aprobó el plan siguiendo **todas** las recomendaciones. Estas decisiones son **vinculantes** para la implementación:

| # | Decisión | Resolución confirmada | Impacto en la implementación |
|---|----------|----------------------|------------------------------|
| 1 | Borrado físico o soft delete | **Borrado físico** con bloqueo preventivo + traslado | `delete_proposito` hace `db.delete()` real. La columna `activo` existe pero **no** se usa como mecanismo de borrado |
| 2 | ¿`SIN_CLASIFICAR` en la barra? | **No** — solo en el modal de gestión | El filtro de la barra excluye `es_cuarentena === true`. `GET /propositos` sí lo devuelve, pero la UI lo filtra |
| 3 | ¿Reordenar con drag & drop? | **Diferir** — no en esta fase | El endpoint `POST /propositos/reorder` **se implementa igual** (es barato y ya está diseñado), pero la UI no expone drag & drop. `orden` se fija al crear (`99`) |
| 4 | ¿Selector de icono? | **Paleta curada de ~12 emojis** | El modal muestra una grilla de 12 emojis predefinidos. No hay input libre |
| 5 | ¿Cuándo eliminar el enum `PropositoAlmacen`? | **Fase posterior** | El enum se conserva con comentario de deprecación. **No se borra en esta fase** |
| 6 | ¿Persistir también `type`? | **No** | Solo se elimina la barra de tipos de la UI. `type` permanece en BD sin cambios |
| 7 | ¿Desactivar una subcategoría de sistema? | **No** | `update_proposito` rechaza `activo=false` si `es_sistema === true` (HTTP 409) |

### 10.1 Paleta de iconos aprobada (decisión #4)

```js
// apps/inventory/WarehouseManagerUI.jsx
const ICONOS_PROPOSITO = ['📦', '🏪', '🔧', '🗂️', '🧊', '🥖', '🍰', '🧁', '🥤', '🧴', '🧺', '📋'];
```

### 10.2 Regla adicional derivada de la decisión #7

`update_proposito` debe incluir esta validación:

```python
# apps/api/modules/warehouse/service.py
if proposito.es_sistema and payload.activo is False:
    raise HTTPException(
        status_code=409,
        detail="No se puede desactivar una subcategoria del sistema.",
    )
```

**Razón:** si se desactiva `EXHIBICION_VENTA`, el POS no encuentra su almacén de destino y el Outbox empieza a acumular eventos en `warehouse_eventos_sin_almacen`.

### 10.3 Caso de test adicional derivado de la decisión #7

Se añade un caso 13 a la sección 8.1:

| # | Caso | Verifica |
|---|------|----------|
| 13 | `test_no_desactivar_proposito_sistema` | PUT con `activo=false` sobre `EXHIBICION_VENTA` → 409 |

**Criterio de aceptación actualizado:** `pytest` pasa de 21 a **34** casos.

---

## 11. Orden de ejecución propuesto

| Fase | Entregable | Verificación |
|------|-----------|--------------|
| **8.1** | Modelo `WarehouseProposito` + migración `f5a6b7c8d9e0` | `alembic upgrade head` OK; `SELECT * FROM warehouse_propositos` devuelve 4 filas; `/health` OK |
| **8.2** | Schemas nuevos + relajar `proposito` en `AlmacenBase`/`AlmacenUpdate` | Import de la app sin errores |
| **8.3** | Servicio: `_validar_proposito`, `delete_proposito`, `trasladar_almacenes`, CRUD, guard de `activo=false` en sistema | pytest 13/13 nuevos (21 → 34) |
| **8.4** | Endpoints + auditoría + `ensure_warehouse_propositos` en `main.py` | Prueba manual con curl/PowerShell de los 6 endpoints |
| **8.5** | Mappers en `warehouseMappers.js` + tests Vitest | `npm test` 81/81 |
| **8.6** | UI: eliminar barra de tipos, mover engrane, nuevo modal con paleta de 12 iconos, diálogo de traslado, filtrar cuarentena de la barra | Prueba manual en navegador |
| **8.7** | Verificación e2e: crear subcategoría, asignar almacén, intentar borrar, trasladar, borrar | Checklist manual |
| **8.8** | Higiene (regla 5.2), `npm run build`, commit y push | `git status` limpio; build OK |

---

## 12. Resumen de archivos afectados

| Archivo | Acción |
|---------|--------|
| `apps/api/modules/warehouse/models.py` | Añadir `WarehouseProposito` |
| `apps/api/modules/warehouse/schemas.py` | Añadir 5 schemas; relajar `proposito` en 2 |
| `apps/api/modules/warehouse/service.py` | Añadir 3 funciones + CRUD de propositos |
| `apps/api/modules/warehouse/router.py` | Añadir 6 endpoints |
| `apps/api/migrations/versions/f5a6b7c8d9e0_add_warehouse_propositos.py` | **Nuevo** |
| `apps/api/main.py` | Añadir `ensure_warehouse_propositos` |
| `apps/api/tests/test_warehouse_propositos.py` | **Nuevo** (13 casos) |
| `apps/inventory/utils/warehouseMappers.js` | Añadir 4 funciones |
| `apps/inventory/utils/warehouseMappers.test.js` | Añadir 7 casos |
| `apps/inventory/WarehouseManagerUI.jsx` | Eliminar barra de tipos + modal antiguo; añadir modal nuevo + diálogo de traslado |

**Archivos que NO se tocan:** todo `apps/pos/`, `apps/api/modules/pos/`, `apps/inventory/ProductCatalogUI.jsx`, `stock_almacen`, `warehouse_events`.

