/**
 * v8 (HEL-P): Contrato de la proyección producto → heladeria_product_config.
 *
 * Este módulo es el ESPEJO EN FRONTEND de apps/api/modules/heladeria/sync.py.
 * Debe mantenerse en sincronía con:
 *   - VALID_COMPONENT_TYPES  (sync.py)
 *   - COMPONENT_TYPE_ORDER   (apps/heladeria/utils/displayMappers.js)
 *
 * Funciones puras, sin efectos secundarios, sin red. Testeables de forma aislada.
 */

/** Claves de technical_data que gobiernan la proyección. */
export const HELADERIA_KEYS = {
    ENABLED: 'heladeria_enabled',
    COMPONENT_TYPE: 'heladeria_component_type',
};

/**
 * Conjunto canónico de tipos de componente.
 * El ORDEN replica COMPONENT_TYPE_ORDER de displayMappers.js para que el
 * usuario vea en el modal el mismo orden que verá en el Display de Precios.
 */
export const COMPONENT_TYPE_OPTIONS = [
    { value: 'RECIPIENTE', label: 'Recipiente' },
    { value: 'TAMAÑO', label: 'Tamaño' },
    { value: 'SABOR', label: 'Sabor' },
    { value: 'EXTRA', label: 'Extra / Topping' },
    { value: 'BEBIDA_BASE', label: 'Base de bebida' },
];

/** Derivado de COMPONENT_TYPE_OPTIONS — una sola fuente de verdad. */
export const VALID_COMPONENT_TYPES = COMPONENT_TYPE_OPTIONS.map((o) => o.value);

/**
 * ¿La categoría del producto pertenece al dominio Heladería?
 *
 * Nivel 1 de la proyección. Resuelve la categoría por nombre contra el
 * catálogo de categorías recibido, porque el formulario de producto solo
 * conserva el NOMBRE de la categoría (ver normalización en ProductCatalogUI).
 *
 * @param {object} product - Producto en edición.
 * @param {Array} categoryCatalog - Categorías del backend ({id, name, heladeria_enabled}).
 * @returns {boolean}
 */
export function isHeladeriaCategory(product, categoryCatalog = []) {
    if (!product) return false;

    // Forma A: el backend anida la categoría resuelta como objeto.
    if (product.category && typeof product.category === 'object') {
        return product.category.heladeria_enabled === true;
    }

    // Forma B: el formulario usa un array de nombres. Resolvemos contra el
    // catálogo para recuperar el flag del nivel 1.
    const names = Array.isArray(product.categories) ? product.categories : [];
    if (names.length === 0) return false;

    const target = String(names[0] || '').trim().toUpperCase();
    if (!target) return false;

    const match = (categoryCatalog || []).find(
        (c) => c && String(c.name || '').trim().toUpperCase() === target
    );
    return match ? match.heladeria_enabled === true : false;
}

/**
 * ¿Debe mostrarse el bloque de Heladería en el modal de producto?
 *
 * Requiere el nivel 1 (categoría marcada). Si el producto ya tiene una
 * proyección activa, el bloque se muestra aunque la categoría aún no se haya
 * recargado, para no ocultar datos existentes.
 *
 * @param {object} product - Producto en edición.
 * @param {Array} categoryCatalog - Categorías del backend.
 * @returns {boolean}
 */
export function shouldShowHeladeriaBlock(product, categoryCatalog = []) {
    if (!product) return false;
    if (isHeladeriaCategory(product, categoryCatalog)) return true;
    return readHeladeriaIntent(product) !== null;
}

/**
 * Lee el `component_type` declarado por el producto, o null si no aplica.
 *
 * ESPEJO de read_heladeria_intent() en sync.py. Devuelve null cuando:
 *   - no hay technical_data,
 *   - `heladeria_enabled` es falso/ausente,
 *   - `heladeria_component_type` no está en el conjunto canónico.
 *
 * @param {object} product - Producto en edición.
 * @returns {string|null}
 */
export function readHeladeriaIntent(product) {
    const technicalData = (product && product.technical_data) || {};
    if (!technicalData[HELADERIA_KEYS.ENABLED]) return null;

    const componentType = technicalData[HELADERIA_KEYS.COMPONENT_TYPE];
    if (!VALID_COMPONENT_TYPES.includes(componentType)) return null;

    return componentType;
}

/**
 * Construye el parche de technical_data para una intención de heladería.
 *
 * Garantiza que al desmarcar el checkbox se envíe `heladeria_component_type:
 * null`, de modo que el backend elimine la fila puente (ver sync.py).
 *
 * @param {object} technicalData - technical_data actual del producto.
 * @param {boolean} enabled - Estado del checkbox.
 * @param {string|null} componentType - Tipo seleccionado.
 * @returns {object} technical_data parcheado.
 */
export function patchHeladeriaIntent(technicalData, enabled, componentType) {
    const base = technicalData || {};
    return {
        ...base,
        [HELADERIA_KEYS.ENABLED]: !!enabled,
        [HELADERIA_KEYS.COMPONENT_TYPE]: enabled ? (componentType || null) : null,
    };
}

/**
 * Valida la intención antes de guardar. Devuelve un mensaje de error o null.
 *
 * @param {object} technicalData - technical_data del producto.
 * @returns {string|null}
 */
export function validateHeladeriaIntent(technicalData) {
    const data = technicalData || {};
    if (!data[HELADERIA_KEYS.ENABLED]) return null;

    const componentType = data[HELADERIA_KEYS.COMPONENT_TYPE];
    if (!componentType) {
        return 'Selecciona el tipo de componente de heladería.';
    }
    if (!VALID_COMPONENT_TYPES.includes(componentType)) {
        return `Tipo de componente inválido: ${componentType}`;
    }
    return null;
}
