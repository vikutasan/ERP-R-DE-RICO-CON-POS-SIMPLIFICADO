/**
 * tiendaConfigurator.js — Guardián del contrato de la Tienda Interactiva (V14, Fase 14.1).
 *
 * MÓDULO 100% PURO: sin React, sin DOM, sin fetch, sin timers.
 * Toda la lógica de armado de un helado vive aquí para poder testearla
 * sin montar UI (patrón "guardián del contrato" ya usado en
 * `warehouseMappers.js` y `terminalCardState.js`).
 *
 * REGLA DE ORO: CERO PRECIOS HARDCODEADOS. Todo precio se lee del `menu`
 * que entrega `GET /heladeria/menu` (fuente de verdad: Gestión de Productos).
 *
 * Forma del `menu` (ver apps/api/modules/heladeria/schemas.py):
 *   {
 *     groups: [
 *       { component_type: 'RECIPIENTE', items: [MenuItemResponse, ...] },
 *       { component_type: 'TAMAÑO',     items: [...] },
 *       { component_type: 'SABOR',      items: [...] },
 *       { component_type: 'EXTRA',      items: [...] },
 *       { component_type: 'BEBIDA_BASE',items: [...] },
 *     ],
 *     total_items: number,
 *   }
 *
 * Forma de un MenuItemResponse:
 *   { config_id, product_id, name, price, image, component_type,
 *     is_available, max_scoops, base_price, price_per_scoop, position }
 */

// ─────────────────────────────────────────────────────────────
// Constantes de estructura
// ─────────────────────────────────────────────────────────────

/** Pasos de UI, en orden estricto de armado. */
export const CONFIGURATOR_STEPS = ['base', 'tamano', 'sabores', 'toppings', 'extras'];

/**
 * Mapeo OBLIGATORIO paso UI → enum `component_type` del backend.
 *
 * Sin este mapeo, `buildPreComandaPayload` no puede producir la forma que
 * espera el backend (`TicketItemComponentCreate.component_type`).
 *
 * Nota: `BEBIDA_BASE` NO aplica a la Tienda Interactiva (es para malteadas
 * del POS de Heladería). El configurador NUNCA lo emite.
 */
export const STEP_TO_COMPONENT_TYPE = {
    base: 'RECIPIENTE',
    tamano: 'TAMAÑO',
    sabores: 'SABOR',
    toppings: 'EXTRA',
    extras: 'EXTRA',
};

/** Etiquetas legibles para la UI (no afectan la lógica). */
export const STEP_LABELS = {
    base: 'Recipiente',
    tamano: 'Tamaño',
    sabores: 'Sabores',
    toppings: 'Toppings',
    extras: 'Extras',
};

/** Estado inicial vacío del configurador. */
export const DEFAULT_CONFIGURATOR_STATE = {
    stepIndex: 0,
    base: null,        // MenuItemResponse del recipiente
    tamano: null,      // MenuItemResponse del tamaño
    sabores: [],       // MenuItemResponse[] (cada bola)
    toppings: [],      // MenuItemResponse[]
    extras: [],        // MenuItemResponse[]
    recipientName: '', // Nombre del integrante (OPCIONAL)
};

/** Máximo de toppings por defecto si el menú no lo especifica. */
const DEFAULT_MAX_TOPPINGS = 5;

// ─────────────────────────────────────────────────────────────
// Helpers internos (puros)
// ─────────────────────────────────────────────────────────────

/** Convierte a número de forma segura (Decimal serializado llega como string). */
function toNumber(value) {
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : 0;
}

/** Devuelve los items de un `component_type` del menú (nunca null). */
export function getMenuItemsByType(menu, componentType) {
    if (!menu || !Array.isArray(menu.groups)) return [];
    const group = menu.groups.find((g) => g && g.component_type === componentType);
    return group && Array.isArray(group.items) ? group.items : [];
}

/**
 * Deriva el máximo de sabores del RECIPIENTE seleccionado.
 * Origen: `max_scoops` de `HeladeriaProductConfig` expuesto en el menú.
 * NO es una constante global.
 */
export function getMaxSabores(state) {
    const max = state && state.base ? state.base.max_scoops : null;
    const n = parseInt(max, 10);
    return Number.isFinite(n) && n > 0 ? n : 3;
}

/** Deriva el máximo de toppings. Hoy el menú no expone un tope por producto. */
export function getMaxToppings(menu) {
    const meta = menu && menu.max_toppings;
    const n = parseInt(meta, 10);
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_TOPPINGS;
}

/** ¿El paso ya tiene una selección válida? */
export function isStepSatisfied(state, stepId) {
    if (!state) return false;
    switch (stepId) {
        case 'base':
            return state.base !== null && state.base !== undefined;
        case 'tamano':
            return state.tamano !== null && state.tamano !== undefined;
        case 'sabores':
            return Array.isArray(state.sabores) && state.sabores.length > 0;
        case 'toppings':
            // Toppings es OPCIONAL: se considera satisfecho siempre.
            return true;
        case 'extras':
            // Extras es OPCIONAL: se considera satisfecho siempre.
            return true;
        default:
            return false;
    }
}

// ─────────────────────────────────────────────────────────────
// Navegación de pasos
// ─────────────────────────────────────────────────────────────

/**
 * ¿Se puede avanzar al siguiente paso?
 * @returns {{ ok: boolean, reason: string }}
 */
export function canAdvanceStep(state, stepId) {
    const id = stepId || (state ? CONFIGURATOR_STEPS[state.stepIndex] : null);
    if (!id) return { ok: false, reason: 'Paso desconocido' };

    if (id === 'base' && !isStepSatisfied(state, 'base')) {
        return { ok: false, reason: 'Selecciona un recipiente para continuar' };
    }
    if (id === 'tamano' && !isStepSatisfied(state, 'tamano')) {
        return { ok: false, reason: 'Selecciona un tamaño para continuar' };
    }
    if (id === 'sabores' && !isStepSatisfied(state, 'sabores')) {
        return { ok: false, reason: 'Selecciona al menos un sabor para continuar' };
    }
    return { ok: true, reason: '' };
}

/** Avanza un paso si el actual está satisfecho. Devuelve un estado NUEVO. */
export function advanceStep(state) {
    const current = CONFIGURATOR_STEPS[state.stepIndex];
    const check = canAdvanceStep(state, current);
    if (!check.ok) return state;
    const nextIndex = Math.min(state.stepIndex + 1, CONFIGURATOR_STEPS.length - 1);
    return { ...state, stepIndex: nextIndex };
}

/** Retrocede un paso. Devuelve un estado NUEVO. */
export function goBackStep(state) {
    const prevIndex = Math.max(state.stepIndex - 1, 0);
    return { ...state, stepIndex: prevIndex };
}

/** Salta a un paso concreto (para el modo tabs en móvil). */
export function goToStep(state, stepId) {
    const idx = CONFIGURATOR_STEPS.indexOf(stepId);
    if (idx === -1) return state;
    return { ...state, stepIndex: idx };
}

// ─────────────────────────────────────────────────────────────
// Selecciones
// ─────────────────────────────────────────────────────────────

/**
 * Selecciona el recipiente. Al cambiar de recipiente se resetean los sabores
 * (porque `max_scoops` puede cambiar) y se conservan toppings/extras.
 */
export function selectBase(state, item) {
    if (!item) return state;
    const sameBase = state.base && state.base.config_id === item.config_id;
    if (sameBase) return state;
    return { ...state, base: item, sabores: [] };
}

/** Selecciona el tamaño. */
export function selectTamano(state, item) {
    if (!item) return state;
    return { ...state, tamano: item };
}

/**
 * Alterna una bola de sabor respetando `maxSabores`.
 * Si el sabor ya está seleccionado, lo quita.
 * Si se alcanzó el máximo y el sabor NO está seleccionado, no hace nada.
 */
export function toggleFlavor(state, flavorId, maxSabores) {
    const max = Number.isFinite(maxSabores) && maxSabores > 0
        ? maxSabores
        : getMaxSabores(state);
    const current = Array.isArray(state.sabores) ? state.sabores : [];
    const exists = current.some((s) => s.config_id === flavorId);

    if (exists) {
        return { ...state, sabores: current.filter((s) => s.config_id !== flavorId) };
    }
    if (current.length >= max) {
        return state; // Tope alcanzado: no se agrega.
    }
    return state; // El item se resuelve en el caller con `addFlavor`.
}

/**
 * Agrega una bola de sabor (objeto completo) respetando `maxSabores`.
 * Es la función que usa la UI, porque necesita el objeto para el resumen.
 */
export function addFlavor(state, item, maxSabores) {
    if (!item) return state;
    const max = Number.isFinite(maxSabores) && maxSabores > 0
        ? maxSabores
        : getMaxSabores(state);
    const current = Array.isArray(state.sabores) ? state.sabores : [];
    if (current.some((s) => s.config_id === item.config_id)) return state;
    if (current.length >= max) return state;
    return { ...state, sabores: [...current, item] };
}

/** Quita una bola de sabor por `config_id`. */
export function removeFlavor(state, flavorId) {
    const current = Array.isArray(state.sabores) ? state.sabores : [];
    return { ...state, sabores: current.filter((s) => s.config_id !== flavorId) };
}

/** Alterna un topping (agrega si no está, quita si ya está). */
export function toggleTopping(state, item, maxToppings) {
    if (!item) return state;
    const max = Number.isFinite(maxToppings) && maxToppings > 0
        ? maxToppings
        : DEFAULT_MAX_TOPPINGS;
    const current = Array.isArray(state.toppings) ? state.toppings : [];
    const exists = current.some((t) => t.config_id === item.config_id);
    if (exists) {
        return { ...state, toppings: current.filter((t) => t.config_id !== item.config_id) };
    }
    if (current.length >= max) return state;
    return { ...state, toppings: [...current, item] };
}

/** Alterna un extra (agrega si no está, quita si ya está). */
export function toggleExtra(state, item, maxExtras) {
    if (!item) return state;
    const max = Number.isFinite(maxExtras) && maxExtras > 0 ? maxExtras : DEFAULT_MAX_TOPPINGS;
    const current = Array.isArray(state.extras) ? state.extras : [];
    const exists = current.some((e) => e.config_id === item.config_id);
    if (exists) {
        return { ...state, extras: current.filter((e) => e.config_id !== item.config_id) };
    }
    if (current.length >= max) return state;
    return { ...state, extras: [...current, item] };
}

/** Establece el nombre del integrante (OPCIONAL). */
export function setRecipientName(state, name) {
    return { ...state, recipientName: typeof name === 'string' ? name : '' };
}

// ─────────────────────────────────────────────────────────────
// Precio (SIEMPRE leído del menú, nunca hardcodeado)
// ─────────────────────────────────────────────────────────────

/**
 * Calcula el precio unitario del helado armado.
 *
 * Regla de negocio (idéntica a `useQuickBuilder`):
 *   base_price del recipiente + suma(precio de cada bola) + suma(precio de toppings/extras)
 *
 * Si el recipiente no tiene `base_price`, se usa su `price`.
 */
export function computeUnitPrice(state, menu) {
    if (!state || !state.base) return 0;

    const basePrice = state.base.base_price !== null && state.base.base_price !== undefined
        ? toNumber(state.base.base_price)
        : toNumber(state.base.price);

    const tamanoPrice = state.tamano ? toNumber(state.tamano.price) : 0;

    const saboresPrice = (Array.isArray(state.sabores) ? state.sabores : [])
        .reduce((sum, s) => sum + toNumber(s.price), 0);

    const toppingsPrice = (Array.isArray(state.toppings) ? state.toppings : [])
        .reduce((sum, t) => sum + toNumber(t.price), 0);

    const extrasPrice = (Array.isArray(state.extras) ? state.extras : [])
        .reduce((sum, e) => sum + toNumber(e.price), 0);

    // `menu` se recibe para permitir futuras reglas (promos, descuentos) sin
    // cambiar la firma. Hoy el precio sale del estado, que a su vez vino del menú.
    void menu;

    return round2(basePrice + tamanoPrice + saboresPrice + toppingsPrice + extrasPrice);
}

/** Redondeo a 2 decimales evitando errores de coma flotante. */
export function round2(n) {
    return Math.round((toNumber(n) + Number.EPSILON) * 100) / 100;
}

// ─────────────────────────────────────────────────────────────
// Validación y normalización
// ─────────────────────────────────────────────────────────────

/**
 * Valida que el estado esté listo para generar la pre-comanda.
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateConfiguratorState(state) {
    const errors = [];
    if (!state || typeof state !== 'object') {
        return { ok: false, errors: ['El estado del configurador es inválido'] };
    }
    if (!state.base) {
        errors.push('Falta seleccionar el recipiente');
    }
    if (!state.tamano) {
        errors.push('Falta seleccionar el tamaño');
    }
    if (!Array.isArray(state.sabores) || state.sabores.length === 0) {
        errors.push('Falta seleccionar al menos un sabor');
    } else {
        const max = getMaxSabores(state);
        if (state.sabores.length > max) {
            errors.push(`Se excedió el máximo de ${max} sabores`);
        }
    }
    return { ok: errors.length === 0, errors };
}

/**
 * Normaliza un estado crudo (por ejemplo, leído de `sessionStorage`).
 * Tolerante a `null`, `undefined`, tipos incorrectos y basura.
 */
export function normalizeConfiguratorState(raw) {
    const base = { ...DEFAULT_CONFIGURATOR_STATE };
    if (!raw || typeof raw !== 'object') return base;

    const stepIndex = Number.isInteger(raw.stepIndex)
        ? Math.min(Math.max(raw.stepIndex, 0), CONFIGURATOR_STEPS.length - 1)
        : 0;

    return {
        stepIndex,
        base: isMenuItem(raw.base) ? raw.base : null,
        tamano: isMenuItem(raw.tamano) ? raw.tamano : null,
        sabores: Array.isArray(raw.sabores) ? raw.sabores.filter(isMenuItem) : [],
        toppings: Array.isArray(raw.toppings) ? raw.toppings.filter(isMenuItem) : [],
        extras: Array.isArray(raw.extras) ? raw.extras.filter(isMenuItem) : [],
        recipientName: typeof raw.recipientName === 'string' ? raw.recipientName : '',
    };
}

/** ¿El objeto tiene la forma mínima de un MenuItemResponse? */
function isMenuItem(obj) {
    return !!obj
        && typeof obj === 'object'
        && obj.config_id !== undefined
        && obj.config_id !== null
        && typeof obj.name === 'string';
}

// ─────────────────────────────────────────────────────────────
// Payload de pre-comanda
// ─────────────────────────────────────────────────────────────

/**
 * Construye el payload listo para `createHeladeriaTicket` + `addItemToTicket`.
 *
 * El `component_type` de cada componente se resuelve con `STEP_TO_COMPONENT_TYPE`
 * (mapeo explícito y testeado). El canal NO se incluye aquí: lo garantiza el
 * backend de forma atómica (Opción 2, Fase 14.4).
 *
 * @returns {{
 *   ok: boolean,
 *   errors: string[],
 *   item: null | {
 *     product_id: number,
 *     quantity: number,
 *     unit_price: number,
 *     recipient_name: string,
 *     components: Array<{ product_id, component_type, component_name, unit_price, quantity }>
 *   }
 * }}
 */
export function buildPreComandaPayload(state, menu, meta = {}) {
    const validation = validateConfiguratorState(state);
    if (!validation.ok) {
        return { ok: false, errors: validation.errors, item: null };
    }

    const components = [];

    // Paso `base` → RECIPIENTE
    components.push({
        product_id: state.base.product_id,
        component_type: STEP_TO_COMPONENT_TYPE.base,
        component_name: state.base.name,
        unit_price: state.base.base_price !== null && state.base.base_price !== undefined
            ? toNumber(state.base.base_price)
            : toNumber(state.base.price),
        quantity: 1,
    });

    // Paso `tamano` → TAMAÑO
    if (state.tamano) {
        components.push({
            product_id: state.tamano.product_id,
            component_type: STEP_TO_COMPONENT_TYPE.tamano,
            component_name: state.tamano.name,
            unit_price: toNumber(state.tamano.price),
            quantity: 1,
        });
    }

    // Paso `sabores` → SABOR (una entrada por bola)
    (Array.isArray(state.sabores) ? state.sabores : []).forEach((s) => {
        components.push({
            product_id: s.product_id,
            component_type: STEP_TO_COMPONENT_TYPE.sabores,
            component_name: s.name,
            unit_price: toNumber(s.price),
            quantity: 1,
        });
    });

    // Paso `toppings` → EXTRA
    (Array.isArray(state.toppings) ? state.toppings : []).forEach((t) => {
        components.push({
            product_id: t.product_id,
            component_type: STEP_TO_COMPONENT_TYPE.toppings,
            component_name: t.name,
            unit_price: toNumber(t.price),
            quantity: 1,
        });
    });

    // Paso `extras` → EXTRA
    (Array.isArray(state.extras) ? state.extras : []).forEach((e) => {
        components.push({
            product_id: e.product_id,
            component_type: STEP_TO_COMPONENT_TYPE.extras,
            component_name: e.name,
            unit_price: toNumber(e.price),
            quantity: 1,
        });
    });

    const unitPrice = computeUnitPrice(state, menu);

    return {
        ok: true,
        errors: [],
        item: {
            // El producto "cabeza" del item es el recipiente (igual que el POS).
            product_id: state.base.product_id,
            quantity: 1,
            unit_price: unitPrice,
            recipient_name: typeof meta.recipientName === 'string'
                ? meta.recipientName
                : (state.recipientName || ''),
            components,
        },
    };
}

/**
 * Etiqueta legible del helado armado (para el resumen y el ticket).
 * Ej: "Vaso Grande Chocolate+Fresa +Chispas"
 */
export function buildItemLabel(state) {
    if (!state || !state.base) return '';
    const partes = [state.base.name];
    if (state.tamano) partes.push(state.tamano.name);
    const sabores = (state.sabores || []).map((s) => s.name).join('+');
    if (sabores) partes.push(sabores);
    const extras = [...(state.toppings || []), ...(state.extras || [])].map((e) => e.name);
    const base = partes.join(' ');
    return extras.length ? `${base} +${extras.join('+')}` : base;
}
