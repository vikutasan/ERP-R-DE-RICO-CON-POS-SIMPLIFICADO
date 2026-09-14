/**
 * totemSequencer.js — Guardián del contrato del Display Tótem (V16, Fase 16.1).
 *
 * MÓDULO 100% PURO: sin React, sin DOM, sin fetch, sin timers, sin IndexedDB.
 * Toda la lógica de secuenciación y validación del tótem vive aquí para poder
 * testearla sin montar UI (patrón "guardián del contrato" ya usado en
 * `displayMappers.js`, `tiendaConfigurator.js`, `warehouseMappers.js` y
 * `terminalCardState.js`).
 *
 * REGLA DE ORO: CERO ANIMACIONES CSS INFINITAS (Incident 16.1). Este módulo
 * solo calcula secuencias y duraciones; las transiciones son finitas.
 *
 * Forma del manifiesto persistido en `system_settings`
 * (clave `heladeria_totem_content`, ver Fase 16.0):
 *   {
 *     macros: [ { id, filename, url, label, accentColor } ],
 *     heroes: [ { id, filename, url, label, accentColor } ],
 *     config: {
 *       macroCount: number,        // 1..10  tomas macro antes de un hero
 *       macroDurationSec: number,  // 1..15  duración de cada macro
 *       heroDurationSec: number,   // 1..15  duración del hero
 *       transition: string,        // 'fade' | 'slide' | 'zoom'
 *       transitionMs: number,      // 200..2000
 *       format: string,            // 'vertical' | 'horizontal'
 *       accentColor: string,       // color de acento global (#rrggbb)
 *     },
 *   }
 */

// ─────────────────────────────────────────────────────────────
// Constantes de estructura
// ─────────────────────────────────────────────────────────────

/** Tipos de transición válidos (transiciones FINITAS, nunca infinitas). */
export const TRANSITION = {
    FADE: 'fade',
    SLIDE: 'slide',
    ZOOM: 'zoom',
};

/** Lista de transiciones válidas para validación. */
export const VALID_TRANSITIONS = [TRANSITION.FADE, TRANSITION.SLIDE, TRANSITION.ZOOM];

/** Formatos de hardware válidos. */
export const FORMAT = {
    VERTICAL: 'vertical',
    HORIZONTAL: 'horizontal',
};

/** Lista de formatos válidos para validación. */
export const VALID_FORMATS = [FORMAT.VERTICAL, FORMAT.HORIZONTAL];

/** Límites de configuración (espejo de los sliders del gestor). */
export const MIN_MACRO_COUNT = 1;
export const MAX_MACRO_COUNT = 10;
export const MIN_DURATION_SEC = 1;
export const MAX_DURATION_SEC = 15;
export const MIN_TRANSITION_MS = 200;
export const MAX_TRANSITION_MS = 2000;

/** Límite de peso por imagen (8 MB) — el backend es el guardián autoritativo. */
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/** Tipos MIME aceptados (JPEG/PNG/WebP). Sin conversión en el MVP (Decisión 1). */
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** Configuración por defecto del tótem (espejo del seed de Fase 16.0). */
export const DEFAULT_TOTEM_CONFIG = {
    macroCount: 3,
    macroDurationSec: 4,
    heroDurationSec: 6,
    transition: TRANSITION.FADE,
    transitionMs: 800,
    format: FORMAT.VERTICAL,
    accentColor: '#fbbf24',
};

// ─────────────────────────────────────────────────────────────
// Utilidades internas
// ─────────────────────────────────────────────────────────────

/**
 * Convierte un valor a número entero dentro de un rango, o devuelve el fallback.
 * @param {*} value
 * @param {number} min
 * @param {number} max
 * @param {number} fallback
 * @returns {number}
 */
function clampInt(value, min, max, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    const i = Math.round(n);
    if (i < min) return min;
    if (i > max) return max;
    return i;
}

/**
 * Valida un color hexadecimal `#rrggbb`. Devuelve el fallback si no es válido.
 * @param {*} value
 * @param {string} fallback
 * @returns {string}
 */
function normalizeHexColor(value, fallback) {
    if (typeof value !== 'string') return fallback;
    const v = value.trim();
    return /^#[0-9a-fA-F]{6}$/.test(v) ? v.toLowerCase() : fallback;
}

/**
 * Normaliza una lista de imágenes (macros o heroes), descartando entradas
 * inválidas. NO valida el peso (eso lo hace el backend al subir).
 * @param {*} list
 * @returns {Array<object>}
 */
function normalizeImageList(list) {
    if (!Array.isArray(list)) return [];
    return list
        .filter((item) => item && typeof item === 'object' && typeof item.url === 'string' && item.url.length > 0)
        .map((item, idx) => ({
            id: typeof item.id === 'string' && item.id ? item.id : `img_${idx}`,
            filename: typeof item.filename === 'string' ? item.filename : '',
            url: item.url,
            label: typeof item.label === 'string' ? item.label : '',
            accentColor: normalizeHexColor(item.accentColor, DEFAULT_TOTEM_CONFIG.accentColor),
        }));
}

// ─────────────────────────────────────────────────────────────
// API pública
// ─────────────────────────────────────────────────────────────

/**
 * Normaliza y repara una configuración cruda del tótem. Garantiza que TODOS
 * los campos existan y estén dentro de rango. Nunca lanza.
 * @param {*} raw
 * @returns {object} configuración válida
 */
export function normalizeTotemConfig(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const transition = VALID_TRANSITIONS.includes(src.transition)
        ? src.transition
        : DEFAULT_TOTEM_CONFIG.transition;
    const format = VALID_FORMATS.includes(src.format)
        ? src.format
        : DEFAULT_TOTEM_CONFIG.format;

    return {
        macroCount: clampInt(src.macroCount, MIN_MACRO_COUNT, MAX_MACRO_COUNT, DEFAULT_TOTEM_CONFIG.macroCount),
        macroDurationSec: clampInt(src.macroDurationSec, MIN_DURATION_SEC, MAX_DURATION_SEC, DEFAULT_TOTEM_CONFIG.macroDurationSec),
        heroDurationSec: clampInt(src.heroDurationSec, MIN_DURATION_SEC, MAX_DURATION_SEC, DEFAULT_TOTEM_CONFIG.heroDurationSec),
        transition,
        transitionMs: clampInt(src.transitionMs, MIN_TRANSITION_MS, MAX_TRANSITION_MS, DEFAULT_TOTEM_CONFIG.transitionMs),
        format,
        accentColor: normalizeHexColor(src.accentColor, DEFAULT_TOTEM_CONFIG.accentColor),
    };
}

/**
 * Normaliza un manifiesto completo (macros + heroes + config). Nunca lanza.
 * @param {*} raw
 * @returns {{macros: Array, heroes: Array, config: object}}
 */
export function normalizeTotemManifest(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    return {
        macros: normalizeImageList(src.macros),
        heroes: normalizeImageList(src.heroes),
        config: normalizeTotemConfig(src.config),
    };
}

/**
 * Construye la secuencia de reproducción: intercala `macroCount` tomas macro
 * seguidas de 1 hero, repitiendo hasta agotar las imágenes. Si no hay heroes,
 * reproduce solo macros. Si no hay macros, reproduce solo heroes.
 *
 * @param {Array} macros
 * @param {Array} heroes
 * @param {object} config (normalizado o crudo)
 * @returns {Array<{kind: 'macro'|'hero', image: object, durationSec: number}>}
 */
export function buildSequence(macros, heroes, config) {
    const cfg = normalizeTotemConfig(config);
    const m = Array.isArray(macros) ? macros : [];
    const h = Array.isArray(heroes) ? heroes : [];
    const sequence = [];

    if (m.length === 0 && h.length === 0) return sequence;

    // Solo macros
    if (h.length === 0) {
        return m.map((image) => ({ kind: 'macro', image, durationSec: cfg.macroDurationSec }));
    }

    // Solo heroes
    if (m.length === 0) {
        return h.map((image) => ({ kind: 'hero', image, durationSec: cfg.heroDurationSec }));
    }

    // Intercalado: macroCount macros → 1 hero, ciclando ambas listas.
    let mi = 0;
    let hi = 0;
    const total = m.length + h.length;
    let guard = 0;
    while (sequence.length < total && guard < total * 2 + 10) {
        guard += 1;
        for (let k = 0; k < cfg.macroCount && sequence.length < total; k += 1) {
            sequence.push({ kind: 'macro', image: m[mi % m.length], durationSec: cfg.macroDurationSec });
            mi += 1;
        }
        if (sequence.length < total) {
            sequence.push({ kind: 'hero', image: h[hi % h.length], durationSec: cfg.heroDurationSec });
            hi += 1;
        }
    }
    return sequence;
}

/**
 * Suma la duración total (en segundos) de una secuencia.
 * @param {Array} sequence
 * @returns {number}
 */
export function totalDurationSec(sequence) {
    if (!Array.isArray(sequence)) return 0;
    return sequence.reduce((acc, step) => acc + (Number(step?.durationSec) || 0), 0);
}

/**
 * Valida un archivo de imagen en el cliente (UX temprana). El backend es el
 * guardián autoritativo (Decisión 3). Devuelve `{ ok, error }`.
 * @param {{type?: string, size?: number, name?: string}} file
 * @returns {{ok: boolean, error: string|null}}
 */
export function validateImageFile(file) {
    if (!file || typeof file !== 'object') {
        return { ok: false, error: 'Archivo inválido.' };
    }
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
        return { ok: false, error: 'Formato no permitido. Usa JPEG, PNG o WebP.' };
    }
    if (typeof file.size === 'number' && file.size > MAX_IMAGE_BYTES) {
        return { ok: false, error: 'La imagen supera el límite de 8 MB.' };
    }
    return { ok: true, error: null };
}
