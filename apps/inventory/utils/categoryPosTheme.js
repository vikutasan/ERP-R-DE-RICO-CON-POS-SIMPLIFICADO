/**
 * v8 (POS-THEME): Tema visual del recuadro de categoría según su destino de POS.
 *
 * El recuadro de categoría del Maestro de Productos comunica DOS cosas a la vez:
 *   1. El destino de POS (`pos_target`)  → COLOR DE FONDO SÓLIDO (este módulo)
 *   2. Si está visible u oculta en POS   → OPACIDAD (mismo color, diluido)
 *
 * Regla de oro: el FONDO siempre lo dicta el POS, tanto cuando la categoría está
 * visible (color sólido) como cuando está oculta (el mismo color al 40%). Así el
 * usuario NUNCA pierde de vista a qué POS pertenece una categoría, ni siquiera
 * cuando la tiene desactivada.
 *
 * El estado "activa" se expresa con ANILLO + ESCALA, que no tocan el fondo.
 *
 * Este módulo es el ESPEJO EN FRONTEND de `categories.pos_target` (backend).
 * Debe mantenerse en sincronía con:
 *   - `_normalize_pos_target()`  (apps/api/modules/catalog/service.py)
 *   - `POS_TARGET_OPTIONS`       (ProductCatalogUI.jsx, modal de categoría)
 *
 * Funciones puras, sin efectos secundarios, sin red. Testeables de forma aislada.
 */

/**
 * Destinos canónicos de POS. Una sola fuente de verdad.
 * El ORDEN replica el del modal de categoría para que el usuario vea
 * los mismos colores en el recuadro y en el selector.
 */
export const POS_TARGETS = {
    PANADERIA: 'PANADERIA',
    HELADERIA: 'HELADERIA',
    AMBOS: 'AMBOS',
};

/** Destino por defecto cuando el backend no envía `pos_target`. */
export const DEFAULT_POS_TARGET = POS_TARGETS.PANADERIA;

/**
 * Paleta por destino de POS. COLORES SÓLIDOS.
 *
 * Tonos 700 (saturados y legibles) para que el color se lea con claridad
 * sobre el fondo negro del ERP. El texto va en blanco porque sobre un fondo
 * sólido de tono 700 el contraste blanco supera AA.
 *
 * `ring` es el color del anillo del estado activo: se dibuja FUERA del
 * recuadro, así que no compite con el fondo.
 */
export const POS_TARGET_THEMES = {
    [POS_TARGETS.PANADERIA]: {
        key: POS_TARGETS.PANADERIA,
        label: 'POS Panadería',
        shortLabel: 'Panadería',
        bg: 'bg-orange-700',
        text: 'text-white',
        ring: 'ring-orange-400',
    },
    [POS_TARGETS.HELADERIA]: {
        key: POS_TARGETS.HELADERIA,
        label: 'POS Heladería',
        shortLabel: 'Heladería',
        bg: 'bg-pink-700',
        text: 'text-white',
        ring: 'ring-pink-400',
    },
    [POS_TARGETS.AMBOS]: {
        key: POS_TARGETS.AMBOS,
        label: 'Ambos POS',
        shortLabel: 'Ambos',
        bg: 'bg-purple-700',
        text: 'text-white',
        ring: 'ring-purple-400',
    },
};

/**
 * Opacidad del estado OCULTO.
 *
 * La categoría oculta conserva el color de su POS pero diluido al 40%.
 * Esto es deliberado: el usuario debe poder ver de un vistazo a qué POS
 * pertenece una categoría incluso cuando la tiene desactivada.
 */
export const HIDDEN_OPACITY_CLASS = 'opacity-40';

/**
 * Normaliza un `pos_target` crudo al conjunto canónico.
 *
 * Espejo de `_normalize_pos_target()` del backend: cualquier valor ausente,
 * nulo o desconocido degrada a `PANADERIA` (el POS base del ERP).
 *
 * @param {*} raw - Valor crudo de `category.pos_target`.
 * @returns {string} Uno de POS_TARGETS.
 */
export function normalizePosTarget(raw) {
    if (typeof raw !== 'string') return DEFAULT_POS_TARGET;
    const upper = raw.trim().toUpperCase();
    return POS_TARGET_THEMES[upper] ? upper : DEFAULT_POS_TARGET;
}

/**
 * Resuelve el tema visual de una categoría a partir de su destino de POS.
 *
 * Nunca lanza: una categoría `null`, sin `pos_target` o con un valor inválido
 * devuelve el tema de Panadería. Esto garantiza que el recuadro SIEMPRE tenga
 * un color, incluso con datos parciales del backend.
 *
 * @param {object|null} category - Categoría ({id, name, pos_target, ...}).
 * @returns {object} Tema con {key, label, shortLabel, bg, text, ring}.
 */
export function resolveCategoryPosTheme(category) {
    const raw = category && typeof category === 'object' ? category.pos_target : null;
    return POS_TARGET_THEMES[normalizePosTarget(raw)];
}

/**
 * ¿Está la categoría visible en el POS?
 *
 * Compatibilidad: una categoría sin `vision_enabled` se considera visible,
 * porque el backend lo envía siempre y su ausencia solo puede venir de datos
 * parciales o antiguos.
 *
 * @param {object|null} category - Categoría.
 * @returns {boolean}
 */
export function isCategoryVisible(category) {
    return !category || category.vision_enabled !== false;
}

/**
 * Construye las clases Tailwind del recuadro de categoría.
 *
 * Combina los DOS canales de información sin que se pisen:
 *   - FONDO SÓLIDO del POS → siempre, visible u oculta (oculta = mismo color al 40%)
 *   - ANILLO + ESCALA      → categoría activa (no toca el fondo)
 *
 * No se usa borde: el color del POS ya delimita el recuadro por sí solo, y un
 * borde añadiría ruido visual a una fila de recuadros contiguos.
 *
 * @param {object|null} category - Categoría.
 * @param {object} options
 * @param {boolean} [options.isActive=false] - ¿Es la categoría seleccionada?
 * @param {boolean} [options.isDragging=false] - ¿Se está arrastrando esta categoría?
 * @returns {string} Cadena de clases Tailwind lista para `className`.
 */
export function buildCategoryTabClasses(category, { isActive = false, isDragging = false } = {}) {
    const theme = resolveCategoryPosTheme(category);
    const isVisible = isCategoryVisible(category);

    const classes = [
        'group relative px-6 py-4 rounded-xl text-[10px] font-black uppercase',
        'tracking-widest text-center transition-all flex items-center justify-center',
        'min-w-[140px] h-auto min-h-[56px] whitespace-normal break-words cursor-pointer',
        theme.bg,
        theme.text,
    ];

    // Canal 1: la categoría oculta conserva el color de su POS, diluido al 40%.
    if (!isVisible) {
        classes.push(HIDDEN_OPACITY_CLASS, 'hover:opacity-100');
    }

    // Canal 2: categoría activa → anillo + escala. El fondo NO cambia.
    if (isActive) {
        classes.push('ring-2 ring-offset-2 ring-offset-black z-10 scale-105 shadow-lg', theme.ring);
    } else {
        classes.push('hover:scale-[1.02] hover:shadow-md');
    }

    if (isDragging) {
        classes.push('opacity-30');
    }

    return classes.join(' ');
}

/**
 * Texto accesible (`title`) del recuadro de categoría.
 *
 * El color por sí solo no es accesible para personas con daltonismo:
 * este texto es el canal redundante que describe el destino y la visibilidad.
 *
 * @param {object|null} category - Categoría.
 * @returns {string} Descripción legible.
 */
export function buildCategoryTabTitle(category) {
    const theme = resolveCategoryPosTheme(category);
    const name = (category && category.name) || 'Categoría';
    const visibility = isCategoryVisible(category) ? 'Visible en POS' : 'Oculta en POS';
    return `${name} — ${theme.label} — ${visibility}`;
}
