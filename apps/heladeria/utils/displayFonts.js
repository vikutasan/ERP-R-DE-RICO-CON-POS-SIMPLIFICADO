/**
 * displayFonts.js — Catálogo de tipografías del Display de Precios
 * (V8, plan gestor de display, §5.15).
 *
 * MÓDULO 100% PURO: sin React, sin DOM, sin fetch, sin timers.
 *
 * CONTEXTO VERIFICADO (v5): ninguna de estas fuentes estaba cargada en el
 * proyecto. El proyecto carga `Inter` con un `<link>` a Google Fonts
 * (patrón real en `HeladeriaHubUI.jsx`), NO con `@font-face` auto-hospedado.
 * Por eso aquí se declara el NOMBRE de la familia y la URL de Google Fonts;
 * el `<link>` se inyecta en el componente que las usa, y SOLO para las fuentes
 * realmente usadas (`collectUsedFonts`), para no descargar las 4 siempre.
 *
 * Las 4 tipografías están pensadas para el concepto de heladería:
 *   CLASSIC → elegante, para carta principal
 *   FUN     → redondeada y divertida, para público infantil
 *   MODERN  → geométrica y limpia, para carteleras densas
 *   RETRO   → script de soda fountain, para ambientación retro
 */

/** Tipografía por defecto. */
export const DEFAULT_FONT_FAMILY = 'CLASSIC';

/**
 * Catálogo de las 4 tipografías.
 * `googleFamily` es el nombre exacto que espera la API de Google Fonts.
 * `stack` es el fallback CSS si la fuente no carga.
 */
export const DISPLAY_FONTS = {
    CLASSIC: {
        key: 'CLASSIC',
        label: 'Clásica',
        description: 'Elegante y atemporal. Ideal para la carta principal.',
        googleFamily: 'Playfair Display',
        stack: "'Playfair Display', Georgia, serif",
        weights: '400;700;900',
    },
    FUN: {
        key: 'FUN',
        label: 'Divertida',
        description: 'Redondeada y amigable. Ideal para público infantil.',
        googleFamily: 'Baloo 2',
        stack: "'Baloo 2', 'Comic Sans MS', cursive",
        weights: '400;700;800',
    },
    MODERN: {
        key: 'MODERN',
        label: 'Moderna',
        description: 'Geométrica y limpia. Ideal para listas densas.',
        googleFamily: 'Poppins',
        stack: "'Poppins', 'Helvetica Neue', sans-serif",
        weights: '400;600;800',
    },
    RETRO: {
        key: 'RETRO',
        label: 'Retro',
        description: 'Script de soda fountain. Ideal para ambientación retro.',
        googleFamily: 'Lobster Two',
        stack: "'Lobster Two', 'Brush Script MT', cursive",
        weights: '400;700',
    },
};

/** Claves válidas de tipografía. */
export const VALID_FONT_FAMILIES = Object.keys(DISPLAY_FONTS);

/**
 * Devuelve la especificación de una tipografía, con fallback a la default.
 * @param {string} key
 * @returns {object}
 */
export function getFontSpec(key) {
    return DISPLAY_FONTS[key] || DISPLAY_FONTS[DEFAULT_FONT_FAMILY];
}

/**
 * Devuelve el `font-family` CSS (stack completo) de una tipografía.
 * @param {string} key
 * @returns {string}
 */
export function getFontStack(key) {
    return getFontSpec(key).stack;
}

/**
 * Lista de tipografías para poblar un `<select>`.
 * @returns {Array<{value: string, label: string, description: string}>}
 */
export function listDisplayFonts() {
    return VALID_FONT_FAMILIES.map((key) => ({
        value: key,
        label: DISPLAY_FONTS[key].label,
        description: DISPLAY_FONTS[key].description,
    }));
}

/**
 * Recopila el SUBCONJUNTO ÚNICO de tipografías realmente usadas por un conjunto
 * de pantallas. Si no hay pantallas o ninguna declara `fontFamily`, devuelve
 * `['CLASSIC']` (default). NUNCA lanza.
 *
 * @param {Array<{config?: {fontFamily?: string}}>} screens
 * @returns {string[]} Claves de tipografía únicas, en orden canónico.
 */
export function collectUsedFonts(screens) {
    const used = new Set();

    if (Array.isArray(screens)) {
        for (const screen of screens) {
            const family = screen && screen.config && screen.config.fontFamily;
            if (VALID_FONT_FAMILIES.includes(family)) {
                used.add(family);
            }
        }
    }

    if (used.size === 0) {
        return [DEFAULT_FONT_FAMILY];
    }

    // Orden canónico (el de VALID_FONT_FAMILIES) para determinismo.
    return VALID_FONT_FAMILIES.filter((key) => used.has(key));
}

/**
 * Construye la URL del `<link>` de Google Fonts para un conjunto de claves.
 * Solo incluye las familias solicitadas (no las 4 siempre).
 *
 * @param {string[]} fontKeys
 * @returns {string} URL lista para `<link href="...">`.
 */
export function buildGoogleFontsUrl(fontKeys) {
    const keys = Array.isArray(fontKeys) && fontKeys.length > 0
        ? fontKeys.filter((k) => VALID_FONT_FAMILIES.includes(k))
        : [DEFAULT_FONT_FAMILY];

    const families = keys.map((key) => {
        const spec = DISPLAY_FONTS[key];
        const family = spec.googleFamily.replace(/ /g, '+');
        return `family=${family}:wght@${spec.weights}`;
    });

    return `https://fonts.googleapis.com/css2?${families.join('&')}&display=swap`;
}
