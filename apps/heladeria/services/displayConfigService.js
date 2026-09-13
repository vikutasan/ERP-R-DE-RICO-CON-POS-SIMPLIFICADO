/**
 * displayConfigService.js — Cliente HTTP de la configuración del Display de Precios (V17, Fase 17.2).
 *
 * REGLAS OBLIGATORIAS (ver apps/heladeria/services/heladeriaService.js):
 * - Usar CONFIG.API_BASE_URL (PROHIBIDO window.location.hostname).
 * - Usar withRetries para todas las operaciones de red.
 *
 * CONTRATO VERIFICADO EN VIVO (2026-09-13):
 *   - `PATCH /api/v1/settings/{key}`  → 404 si la clave no existe (NO es PUT).
 *   - `POST  /api/v1/settings/seed`   → 200 {"status":"seeded"} (idempotente).
 *   - `GET   /api/v1/settings/`       → 200 [SystemSettingResponse, ...]
 *
 * La clave `heladeria_display_precios_config` se siembra en FASE 17.0
 * (apps/api/modules/settings/service.py → default_settings).
 */
import { CONFIG } from '../../pos/config';
import { withRetries } from '../../pos/utils/withRetries';
import {
    DEFAULT_DISPLAY_CONFIG,
    normalizeDisplayConfig,
    serializeDisplayConfig,
} from '../utils/displayMappers';

/** Clave en `system_settings` (fuente de verdad de la configuración). */
export const DISPLAY_CONFIG_KEY = 'heladeria_display_precios_config';

/**
 * Lee TODAS las settings y extrae la del Display.
 * Si la clave no existe (p. ej. BD sin sembrar), devuelve los defaults
 * en lugar de lanzar: el Display debe poder arrancar siempre.
 *
 * @returns {Promise<{config: object, found: boolean}>}
 */
export async function fetchDisplayConfig() {
    return withRetries(async () => {
        const res = await fetch(`${CONFIG.API_BASE_URL}/settings/`, { cache: 'no-store' });
        if (!res.ok) throw new Error('Error cargando configuración del Display');

        const settings = await res.json();
        const list = Array.isArray(settings) ? settings : [];
        const entry = list.find((s) => s && s.key === DISPLAY_CONFIG_KEY);

        if (!entry) {
            return { config: { ...DEFAULT_DISPLAY_CONFIG }, found: false };
        }
        return { config: normalizeDisplayConfig(entry.value), found: true };
    }, { label: 'fetchDisplayConfig' });
}

/**
 * Persiste la configuración del Display.
 * Usa PATCH (el PUT NO existe en el router de settings).
 *
 * @param {object} config - Configuración cruda (se normaliza antes de enviar).
 * @returns {Promise<object>} La configuración normalizada que quedó guardada.
 */
export async function saveDisplayConfig(config) {
    const value = serializeDisplayConfig(config);

    return withRetries(async () => {
        const res = await fetch(
            `${CONFIG.API_BASE_URL}/settings/${DISPLAY_CONFIG_KEY}`,
            {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ value }),
            },
        );
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.detail || 'Error guardando configuración del Display');
        }
        return normalizeDisplayConfig(config);
    }, { label: 'saveDisplayConfig' });
}

/**
 * Siembra las settings por defecto (idempotente: solo inserta las faltantes).
 * Se usa como reparación si `fetchDisplayConfig` devuelve `found: false`.
 *
 * @returns {Promise<{status: string}>}
 */
export async function seedDisplayConfig() {
    return withRetries(async () => {
        const res = await fetch(`${CONFIG.API_BASE_URL}/settings/seed`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
        });
        if (!res.ok) throw new Error('Error sembrando configuración del Display');
        return res.json();
    }, { label: 'seedDisplayConfig' });
}

/**
 * Carga la configuración con auto-reparación:
 *   1. Intenta leerla.
 *   2. Si no existe, siembra y vuelve a leer.
 *   3. Si algo falla, devuelve los defaults (el Display nunca se queda en blanco).
 *
 * @returns {Promise<object>} Configuración normalizada.
 */
export async function loadDisplayConfig() {
    try {
        const { config, found } = await fetchDisplayConfig();
        if (found) return config;

        // Auto-reparación: la clave no está en la BD.
        await seedDisplayConfig();
        const retry = await fetchDisplayConfig();
        return retry.config;
    } catch {
        return { ...DEFAULT_DISPLAY_CONFIG };
    }
}
