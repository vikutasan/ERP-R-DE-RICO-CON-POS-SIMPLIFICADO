/**
 * displayMappers.js — Guardián del contrato del Display de Precios (V17, Fase 17.1).
 *
 * MÓDULO 100% PURO: sin React, sin DOM, sin fetch, sin timers, sin IndexedDB.
 * Toda la lógica de presentación del Display vive aquí para poder testearla
 * sin montar UI (patrón "guardián del contrato" ya usado en
 * `tiendaConfigurator.js`, `warehouseMappers.js` y `terminalCardState.js`).
 *
 * REGLA DE ORO: CERO PRECIOS HARDCODEADOS. Todo precio se lee del `menu`
 * que entrega `GET /heladeria/display/menu` (fuente de verdad: Gestión de Productos).
 *
 * Forma REAL verificada en vivo de `GET /heladeria/display/menu`:
 *   {
 *     groups: [
 *       { component_type: 'BEBIDA_BASE', items: [MenuItemResponse, ...] },
 *       { component_type: 'EXTRA',       items: [...] },
 *       { component_type: 'RECIPIENTE',  items: [...] },
 *       { component_type: 'SABOR',       items: [...] },
 *     ],
 *     total_items: number,
 *   }
 *
 * Forma de un MenuItemResponse (ver apps/api/modules/heladeria/schemas.py):
 *   { config_id, product_id, name, price, image, component_type,
 *     is_available, max_scoops, base_price, price_per_scoop, position }
 *
 * ADVERTENCIA DE CONTRATO (verificada en vivo el 2026-09-13):
 *   `price` llega como NÚMERO (ej. 65.0), NO como string "65.00".
 *   `formatPrice` acepta AMBOS (número y string Decimal) para no romperse
 *   si el backend cambia la serialización.
 *
 * Forma de la configuración persistida en `system_settings`
 * (clave `heladeria_display_precios_config`):
 *   { groups: string[], columns: number, theme: 'LIGHT'|'DARK',
 *     showImages: boolean, showUnavailable: boolean }
 */

// ─────────────────────────────────────────────────────────────
// Constantes de estructura
// ─────────────────────────────────────────────────────────────

/**
 * Etiquetas legibles por `component_type` para los encabezados del Display.
 * El orden de las claves NO importa: el orden visual lo da COMPONENT_TYPE_ORDER.
 */
export const COMPONENT_TYPE_LABELS = {
    RECIPIENTE: '🍦 Conos y Vasos',
    TAMAÑO: '📏 Tamaños',
    SABOR: '🍨 Sabores',
    EXTRA: '✨ Toppings y Extras',
    BEBIDA_BASE: '🥤 Bases de Malteada',
};

/**
 * Orden visual canónico de los grupos en el Display.
 * Los `component_type` que no aparezcan aquí se colocan al final,
 * ordenados alfabéticamente (ver `groupItemsByComponentType`).
 */
export const COMPONENT_TYPE_ORDER = [
    'RECIPIENTE',
    'TAMAÑO',
    'SABOR',
    'EXTRA',
    'BEBIDA_BASE',
];

/** Configuración por defecto del Display (espejo del seed de FASE 17.0). */
export const DEFAULT_DISPLAY_CONFIG = {
    groups: [],            // [] = mostrar TODOS los grupos disponibles
    columns: 3,            // 1..6
    theme: 'LIGHT',        // 'LIGHT' | 'DARK'
    showImages: true,
    showUnavailable: true, // true = mostrar agotados (atenuados)
};

/** Límites de columnas aceptados por la UI. */
export const MIN_COLUMNS = 1;
export const MAX_COLUMNS = 6;

/** Temas válidos. */
export const VALID_THEMES = ['LIGHT', 'DARK'];

/** Moneda por defecto (México). */
export const DEFAULT_CURRENCY = 'MXN';

/** Modos de la doble landing. */
export const DISPLAY_MODES = {
    ADMIN: 'admin',
    OUTPUT: 'output',
};

// ─────────────────────────────────────────────────────────────
// Helpers internos (puros)
// ─────────────────────────────────────────────────────────────

/**
 * Convierte a número de forma segura.
 * Acepta número (65.0) y string Decimal ("65.00"). Devuelve 0 si no es finito.
 */
function toNumber(value) {
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : 0;
    }
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : 0;
}

/** Redondea a 2 decimales evitando errores de coma flotante. */
function round2(n) {
    return Math.round((toNumber(n) + Number.EPSILON) * 100) / 100;
}

/** ¿Es un objeto plano (no null, no array)? */
function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** ¿Tiene la forma mínima de un MenuItemResponse? */
function isMenuItem(obj) {
    return isPlainObject(obj) && typeof obj.name === 'string' && obj.name.length > 0;
}

// ─────────────────────────────────────────────────────────────
// Normalización de configuración
// ─────────────────────────────────────────────────────────────

/**
 * Normaliza una configuración cruda (de la API, de IndexedDB o de un formulario)
 * a la forma canónica. NUNCA lanza: ante basura devuelve los valores por defecto.
 *
 * @param {object|string|null} raw - Objeto, JSON string o null.
 * @returns {{groups: string[], columns: number, theme: string,
 *            showImages: boolean, showUnavailable: boolean}}
 */
export function normalizeDisplayConfig(raw) {
    let source = raw;

    // La API entrega `value` como string JSON; toleramos ambos.
    if (typeof source === 'string') {
        try {
            source = JSON.parse(source);
        } catch {
            source = null;
        }
    }

    if (!isPlainObject(source)) {
        return { ...DEFAULT_DISPLAY_CONFIG };
    }

    // groups: array de strings no vacíos, sin duplicados.
    let groups = [];
    if (Array.isArray(source.groups)) {
        groups = source.groups
            .filter((g) => typeof g === 'string' && g.trim().length > 0)
            .map((g) => g.trim());
        groups = Array.from(new Set(groups));
    }

    // columns: entero dentro de [MIN_COLUMNS, MAX_COLUMNS].
    let columns = parseInt(source.columns, 10);
    if (!Number.isFinite(columns)) {
        columns = DEFAULT_DISPLAY_CONFIG.columns;
    }
    columns = Math.min(MAX_COLUMNS, Math.max(MIN_COLUMNS, columns));

    // theme: solo LIGHT o DARK.
    const theme = VALID_THEMES.includes(source.theme)
        ? source.theme
        : DEFAULT_DISPLAY_CONFIG.theme;

    // Booleanos: solo `true`/`false` explícitos; cualquier otra cosa → default.
    const showImages = typeof source.showImages === 'boolean'
        ? source.showImages
        : DEFAULT_DISPLAY_CONFIG.showImages;
    const showUnavailable = typeof source.showUnavailable === 'boolean'
        ? source.showUnavailable
        : DEFAULT_DISPLAY_CONFIG.showUnavailable;

    return { groups, columns, theme, showImages, showUnavailable };
}

/**
 * Valida una configuración normalizada.
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validateDisplayConfig(config) {
    const errors = [];
    const c = normalizeDisplayConfig(config);

    if (c.columns < MIN_COLUMNS || c.columns > MAX_COLUMNS) {
        errors.push(`columns debe estar entre ${MIN_COLUMNS} y ${MAX_COLUMNS}`);
    }
    if (!VALID_THEMES.includes(c.theme)) {
        errors.push(`theme debe ser uno de: ${VALID_THEMES.join(', ')}`);
    }
    if (!Array.isArray(c.groups)) {
        errors.push('groups debe ser un arreglo de strings');
    }

    return { valid: errors.length === 0, errors };
}

// ─────────────────────────────────────────────────────────────
// Mapeo de la respuesta de la API
// ─────────────────────────────────────────────────────────────

/**
 * Normaliza un MenuItemResponse a la forma que consume el Display.
 * NO inventa precios: si `price` falta, queda 0 (y `hasPrice=false`).
 *
 * @param {object} item - MenuItemResponse crudo.
 * @returns {object|null} Item normalizado o null si no es válido.
 */
export function mapDisplayItem(item) {
    if (!isMenuItem(item)) return null;

    const price = round2(toNumber(item.price));

    return {
        configId: item.config_id ?? null,
        productId: item.product_id ?? null,
        name: item.name,
        price,
        priceLabel: formatPrice(price),
        image: typeof item.image === 'string' && item.image.length > 0 ? item.image : null,
        componentType: item.component_type || 'SIN_TIPO',
        isAvailable: item.is_available !== false, // ausente ⇒ disponible
        maxScoops: Number.isFinite(parseInt(item.max_scoops, 10))
            ? parseInt(item.max_scoops, 10)
            : null,
        basePrice: item.base_price != null ? round2(toNumber(item.base_price)) : null,
        pricePerScoop: item.price_per_scoop != null
            ? round2(toNumber(item.price_per_scoop))
            : null,
        position: Number.isFinite(parseInt(item.position, 10))
            ? parseInt(item.position, 10)
            : 0,
    };
}

/**
 * Mapea la respuesta completa de `GET /heladeria/display/menu`.
 * Tolera `null`, `{}` y grupos corruptos: NUNCA lanza.
 *
 * @param {object|null} apiResponse
 * @returns {{groups: Array<{componentType: string, label: string, items: object[]}>,
 *            totalItems: number}}
 */
export function mapDisplayMenuFromApi(apiResponse) {
    const rawGroups = apiResponse && Array.isArray(apiResponse.groups)
        ? apiResponse.groups
        : [];

    const groups = rawGroups
        .filter((g) => isPlainObject(g) && typeof g.component_type === 'string')
        .map((g) => {
            const items = Array.isArray(g.items)
                ? g.items.map(mapDisplayItem).filter(Boolean)
                : [];
            return {
                componentType: g.component_type,
                label: COMPONENT_TYPE_LABELS[g.component_type] || g.component_type,
                items,
            };
        })
        // Descartamos grupos sin items para no pintar encabezados vacíos.
        .filter((g) => g.items.length > 0);

    const totalItems = groups.reduce((acc, g) => acc + g.items.length, 0);

    return { groups, totalItems };
}

// ─────────────────────────────────────────────────────────────
// Agrupación y filtrado
// ─────────────────────────────────────────────────────────────

/**
 * Ordena los grupos según COMPONENT_TYPE_ORDER.
 * Los tipos desconocidos van al final, en orden alfabético.
 *
 * @param {Array<{componentType: string}>} groups
 * @returns {Array} Nuevo arreglo ordenado (no muta la entrada).
 */
export function groupItemsByComponentType(groups) {
    if (!Array.isArray(groups)) return [];

    const rank = (type) => {
        const idx = COMPONENT_TYPE_ORDER.indexOf(type);
        return idx === -1 ? COMPONENT_TYPE_ORDER.length : idx;
    };

    return [...groups].sort((a, b) => {
        const ra = rank(a.componentType);
        const rb = rank(b.componentType);
        if (ra !== rb) return ra - rb;
        // Empate (ambos desconocidos): alfabético estable.
        return String(a.componentType).localeCompare(String(b.componentType));
    });
}

/**
 * Filtra los grupos/items según la configuración del admin.
 *
 * Reglas:
 *   - `config.groups` vacío  ⇒ mostrar TODOS los grupos.
 *   - `config.groups` con valores ⇒ mostrar SOLO esos component_type.
 *   - `config.showUnavailable === false` ⇒ ocultar items agotados.
 *   - Un grupo que queda sin items se descarta.
 *
 * @param {Array} groups - Grupos ya mapeados.
 * @param {object} config - Configuración cruda o normalizada.
 * @returns {Array} Grupos filtrados.
 */
export function filterVisibleGroups(groups, config) {
    if (!Array.isArray(groups)) return [];

    const c = normalizeDisplayConfig(config);
    const allowAll = c.groups.length === 0;

    return groups
        .filter((g) => allowAll || c.groups.includes(g.componentType))
        .map((g) => {
            const items = Array.isArray(g.items) ? g.items : [];
            const visible = c.showUnavailable
                ? items
                : items.filter((it) => it.isAvailable !== false);
            return { ...g, items: visible };
        })
        .filter((g) => g.items.length > 0);
}

// ─────────────────────────────────────────────────────────────
// Formato de precio
// ─────────────────────────────────────────────────────────────

/**
 * Formatea un precio para el Display.
 * Acepta número (65.0) y string Decimal ("65.00") — ver ADVERTENCIA arriba.
 *
 * @param {number|string} value
 * @param {string} [currency='MXN']
 * @returns {string} Ej. "$65.00"
 */
export function formatPrice(value, currency = DEFAULT_CURRENCY) {
    const n = round2(toNumber(value));
    const symbol = currency === 'MXN' ? '$' : `${currency} `;
    return `${symbol}${n.toFixed(2)}`;
}

// ─────────────────────────────────────────────────────────────
// ViewModel
// ─────────────────────────────────────────────────────────────

/**
 * Construye el ViewModel completo que consume la UI del Display.
 * Encadena: mapeo → orden → filtrado.
 *
 * @param {object|null} apiResponse - Respuesta cruda de la API.
 * @param {object} config - Configuración cruda o normalizada.
 * @returns {{groups: Array, totalItems: number, config: object, isEmpty: boolean}}
 */
export function buildDisplayViewModel(apiResponse, config) {
    const normalized = normalizeDisplayConfig(config);
    const mapped = mapDisplayMenuFromApi(apiResponse);
    const ordered = groupItemsByComponentType(mapped.groups);
    const visible = filterVisibleGroups(ordered, normalized);

    const totalItems = visible.reduce((acc, g) => acc + g.items.length, 0);

    return {
        groups: visible,
        totalItems,
        config: normalized,
        isEmpty: totalItems === 0,
    };
}

// ─────────────────────────────────────────────────────────────
// Modo de la doble landing
// ─────────────────────────────────────────────────────────────

/**
 * Resuelve el modo del Display a partir del query string.
 * `?mode=output` ⇒ pantalla de kiosco (solo lectura, fullscreen).
 * Cualquier otro valor (o ausente) ⇒ panel de administración.
 *
 * @param {string} search - `window.location.search` (ej. '?mode=output').
 * @returns {'admin'|'output'}
 */
export function resolveDisplayMode(search) {
    if (typeof search !== 'string' || search.length === 0) {
        return DISPLAY_MODES.ADMIN;
    }
    // Quitamos el '?' inicial y parseamos manualmente (sin URLSearchParams
    // para mantener el módulo 100% puro y testeable en cualquier entorno).
    const query = search.startsWith('?') ? search.slice(1) : search;
    const pairs = query.split('&');
    for (const pair of pairs) {
        const [rawKey, rawValue = ''] = pair.split('=');
        if (decodeURIComponent(rawKey) === 'mode') {
            const value = decodeURIComponent(rawValue).toLowerCase();
            return value === DISPLAY_MODES.OUTPUT
                ? DISPLAY_MODES.OUTPUT
                : DISPLAY_MODES.ADMIN;
        }
    }
    return DISPLAY_MODES.ADMIN;
}

/**
 * Serializa la configuración a string JSON listo para
 * `PATCH /settings/heladeria_display_precios_config` (body `{ value }`).
 *
 * @param {object} config
 * @returns {string}
 */
export function serializeDisplayConfig(config) {
    return JSON.stringify(normalizeDisplayConfig(config));
}
