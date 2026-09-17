/**
 * displayTemplates.js — Plantillas de diseño del Display de Precios
 * (V8, plan gestor de display, §5.18).
 *
 * MÓDULO 100% PURO: sin React, sin DOM, sin fetch, sin timers.
 *
 * REGLA CRÍTICA: `applyTemplate` cambia SOLO la presentación (tema, columnas,
 * tipografía, imágenes, encabezado). NUNCA toca `groups` ni `groupLabels`:
 * la selección de qué grupos se muestran es una decisión del negocio, no del
 * diseño. Aplicar una plantilla no debe alterar el contenido.
 *
 * 5 plantillas: CLASSIC, MINIMAL, KIDS, RETRO, PRICE_ONLY.
 */

import { normalizeScreenConfig } from './displayMappers';

/**
 * Catálogo de las 5 plantillas.
 * Cada una define solo los campos de PRESENTACIÓN que sobrescribe.
 */
export const DISPLAY_TEMPLATES = {
    CLASSIC: {
        key: 'CLASSIC',
        label: 'Clásica',
        description: 'Elegante y equilibrada. La opción por defecto.',
        theme: 'LIGHT',
        columns: 3,
        fontFamily: 'CLASSIC',
        images: { enabled: true, size: 'MEDIUM', shape: 'ROUNDED', fallback: 'INITIALS' },
    },
    MINIMAL: {
        key: 'MINIMAL',
        label: 'Minimalista',
        description: 'Sin imágenes, mucho aire. Solo lo esencial.',
        theme: 'LIGHT',
        columns: 2,
        fontFamily: 'MODERN',
        images: { enabled: false, size: 'SMALL', shape: 'SQUARE', fallback: 'NONE' },
    },
    KIDS: {
        key: 'KIDS',
        label: 'Infantil',
        description: 'Divertida y colorida. Imágenes grandes.',
        theme: 'LIGHT',
        columns: 2,
        fontFamily: 'FUN',
        images: { enabled: true, size: 'LARGE', shape: 'CIRCLE', fallback: 'INITIALS' },
    },
    RETRO: {
        key: 'RETRO',
        label: 'Retro',
        description: 'Ambientación soda fountain. Tipografía script.',
        theme: 'DARK',
        columns: 3,
        fontFamily: 'RETRO',
        images: { enabled: true, size: 'MEDIUM', shape: 'ROUNDED', fallback: 'INITIALS' },
    },
    PRICE_ONLY: {
        key: 'PRICE_ONLY',
        label: 'Solo precio',
        description: 'Sin imágenes, muchas columnas. Para carteleras densas.',
        theme: 'LIGHT',
        columns: 6,
        fontFamily: 'MODERN',
        images: { enabled: false, size: 'SMALL', shape: 'SQUARE', fallback: 'NONE' },
    },
};

/** Claves válidas de plantilla. */
export const VALID_TEMPLATES = Object.keys(DISPLAY_TEMPLATES);

/**
 * Lista de plantillas para poblar la UI.
 * @returns {Array<{value: string, label: string, description: string}>}
 */
export function listTemplates() {
    return VALID_TEMPLATES.map((key) => ({
        value: key,
        label: DISPLAY_TEMPLATES[key].label,
        description: DISPLAY_TEMPLATES[key].description,
    }));
}

/**
 * Aplica una plantilla a una configuración de pantalla.
 *
 * IMPORTANTE: NO toca `groups` ni `groupLabels`. Si la plantilla es inválida,
 * devuelve la config normalizada SIN CAMBIOS (no lanza).
 *
 * @param {object} config - Config actual (cruda o normalizada).
 * @param {string} templateKey - Clave de DISPLAY_TEMPLATES.
 * @returns {object} Nueva config con la presentación de la plantilla.
 */
export function applyTemplate(config, templateKey) {
    const base = normalizeScreenConfig(config);
    const template = DISPLAY_TEMPLATES[templateKey];

    if (!template) {
        return base;
    }

    return {
        ...base,
        // Preservados explícitamente (la plantilla NO los toca):
        groups: base.groups,
        groupLabels: base.groupLabels,
        showUnavailable: base.showUnavailable,
        // Presentación aplicada por la plantilla:
        theme: template.theme,
        columns: template.columns,
        fontFamily: template.fontFamily,
        images: { ...template.images },
        showImages: template.images.enabled,
    };
}
