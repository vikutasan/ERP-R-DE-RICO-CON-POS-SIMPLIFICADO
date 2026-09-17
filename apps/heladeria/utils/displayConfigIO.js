/**
 * displayConfigIO.js — Exportar / importar / duplicar pantallas del Display
 * (V8, plan gestor de display, §5.19).
 *
 * MÓDULO 100% PURO: sin React, sin DOM, sin fetch, sin timers.
 * Las funciones devuelven strings/objetos; la descarga real del archivo la hace
 * la UI (Blob + `<a download>`), no este módulo.
 */

import { normalizeScreenConfig, normalizeScreen, SCREEN_IDS } from './displayMappers';

/** Versión del formato de exportación. */
export const EXPORT_VERSION = 1;

/**
 * Exporta una pantalla a un objeto serializable (con metadatos).
 * NO incluye funciones (solo datos planos).
 *
 * @param {{id: string, name: string, config: object}} screen
 * @param {Date} [now=new Date()]
 * @returns {{version: number, exportedAt: string, screen: object}}
 */
export function exportScreen(screen, now = new Date()) {
    const normalized = normalizeScreen(screen);
    const d = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();

    return {
        version: EXPORT_VERSION,
        exportedAt: d.toISOString(),
        screen: {
            name: normalized.name,
            config: normalizeScreenConfig(normalized.config),
        },
    };
}

/**
 * Serializa la exportación a string JSON.
 * @param {object} screen
 * @param {Date} [now]
 * @returns {string}
 */
export function exportScreenToJson(screen, now = new Date()) {
    return JSON.stringify(exportScreen(screen, now), null, 2);
}

/**
 * Importa una pantalla desde un string JSON. NUNCA lanza: ante JSON corrupto
 * devuelve `{ ok: false, error }`.
 *
 * El `id` del archivo se IGNORA (la pantalla destino la decide el llamador);
 * los campos faltantes se rellenan con defaults vía `normalizeScreen`.
 *
 * @param {string} json
 * @returns {{ok: true, screen: object} | {ok: false, error: string}}
 */
export function importScreen(json) {
    if (typeof json !== 'string' || json.trim().length === 0) {
        return { ok: false, error: 'El archivo está vacío.' };
    }

    let parsed;
    try {
        parsed = JSON.parse(json);
    } catch {
        return { ok: false, error: 'El archivo no es un JSON válido.' };
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { ok: false, error: 'El archivo no tiene el formato esperado.' };
    }

    const rawScreen = parsed.screen && typeof parsed.screen === 'object'
        ? parsed.screen
        : parsed;

    if (!rawScreen || typeof rawScreen !== 'object') {
        return { ok: false, error: 'El archivo no contiene una pantalla.' };
    }

    // Ignoramos el `id` del archivo: la pantalla destino la decide el llamador.
    const normalized = normalizeScreen(
        { name: rawScreen.name, config: rawScreen.config, enabled: rawScreen.enabled },
        SCREEN_IDS[0],
    );

    return { ok: true, screen: normalized };
}

/**
 * Duplica la config de una pantalla origen a una pantalla destino.
 * NO copia `id` ni `name` (la destino conserva su identidad).
 * Si `fromId === toId` o el destino no existe, devuelve el documento sin cambios.
 *
 * @param {{version: number, screens: Array}} doc
 * @param {string} fromId
 * @param {string} toId
 * @returns {{version: number, screens: Array}} Nuevo documento (no muta).
 */
export function duplicateScreenConfig(doc, fromId, toId) {
    const screens = Array.isArray(doc && doc.screens) ? doc.screens : [];

    if (fromId === toId) {
        return { version: doc && doc.version ? doc.version : 1, screens: [...screens] };
    }

    const source = screens.find((s) => s && s.id === fromId);
    const targetIndex = screens.findIndex((s) => s && s.id === toId);

    if (!source || targetIndex === -1) {
        return { version: doc && doc.version ? doc.version : 1, screens: [...screens] };
    }

    const target = screens[targetIndex];
    const newScreens = [...screens];
    newScreens[targetIndex] = {
        ...target,
        // Conserva id y name del destino; solo copia la config.
        config: normalizeScreenConfig(source.config),
    };

    return { version: doc && doc.version ? doc.version : 1, screens: newScreens };
}
