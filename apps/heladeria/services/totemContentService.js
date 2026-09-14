/**
 * totemContentService.js — Cliente HTTP del manifiesto del Display Tótem (V16, Fase 16.3).
 *
 * REGLAS OBLIGATORIAS (heredadas de heladeriaService.js):
 * - Usar CONFIG.API_BASE_URL (PROHIBIDO window.location.hostname).
 * - Usar withRetries para todas las operaciones de red.
 * - El manifiesto vive en `system_settings` bajo la clave `heladeria_totem_content`
 *   (sembrada en Fase 16.0). Se lee con GET /settings/ y se escribe con
 *   PATCH /settings/{key} (NUNCA PUT: el backend responde 404 si la clave no existe).
 * - Las imágenes se suben a POST /heladeria/totem/upload y se sirven desde
 *   /media/totem/<filename> (montaje estático ADITIVO de Fase 16.2).
 *
 * Este servicio NO valida la forma del manifiesto: eso lo hace
 * `totemSequencer.js` (guardián del contrato). Aquí solo se transporta.
 */
import { CONFIG } from '../../pos/config';
import { withRetries } from '../../pos/utils/withRetries';

/** Clave del manifiesto en `system_settings`. */
export const TOTEM_SETTING_KEY = 'heladeria_totem_content';

class TotemContentService {

    // ═══════════════════════════════════════════════════
    // LECTURA DEL MANIFIESTO
    // ═══════════════════════════════════════════════════

    /**
     * Lee el manifiesto crudo desde `system_settings`.
     * Devuelve el objeto ya parseado, o `null` si la clave no existe / está vacía.
     * NO normaliza: el llamador debe pasar el resultado por `normalizeTotemManifest`.
     * @returns {Promise<object|null>}
     */
    async getManifest() {
        return withRetries(async () => {
            const res = await fetch(`${CONFIG.API_BASE_URL}/settings/`, { cache: 'no-store' });
            if (!res.ok) throw new Error('Error cargando configuración del tótem');
            const all = await res.json();
            const entry = Array.isArray(all)
                ? all.find((s) => s && s.key === TOTEM_SETTING_KEY)
                : null;
            if (!entry || typeof entry.value !== 'string' || entry.value.trim() === '') {
                return null;
            }
            try {
                return JSON.parse(entry.value);
            } catch {
                // Valor corrupto: se trata como ausente para que el llamador use el default.
                return null;
            }
        }, { label: 'totem.getManifest' });
    }

    // ═══════════════════════════════════════════════════
    // ESCRITURA DEL MANIFIESTO
    // ═══════════════════════════════════════════════════

    /**
     * Persiste el manifiesto completo (macros + heroes + config) serializado.
     * @param {{macros:Array,heroes:Array,config:object}} manifest
     * @returns {Promise<object>} la entrada de setting actualizada
     */
    async saveManifest(manifest) {
        return withRetries(async () => {
            const res = await fetch(`${CONFIG.API_BASE_URL}/settings/${TOTEM_SETTING_KEY}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ value: JSON.stringify(manifest) }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.detail || 'Error guardando el manifiesto del tótem');
            }
            return res.json();
        }, { label: 'totem.saveManifest' });
    }

    // ═══════════════════════════════════════════════════
    // SUBIDA / BORRADO DE IMÁGENES
    // ═══════════════════════════════════════════════════

    /**
     * Sube una imagen al backend. El backend valida MIME, peso (8 MB) y no-vacío.
     * @param {File} file
     * @returns {Promise<{filename:string,url:string}>}
     */
    async uploadImage(file) {
        return withRetries(async () => {
            const form = new FormData();
            form.append('file', file);
            const res = await fetch(`${CONFIG.API_BASE_URL}/heladeria/totem/upload`, {
                method: 'POST',
                body: form,
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.detail || 'Error subiendo la imagen del tótem');
            }
            return res.json();
        }, { label: 'totem.uploadImage' });
    }

    /**
     * Borra una imagen del backend por su nombre de archivo.
     * @param {string} filename
     * @returns {Promise<{deleted:boolean,filename:string}>}
     */
    async deleteImage(filename) {
        return withRetries(async () => {
            const res = await fetch(
                `${CONFIG.API_BASE_URL}/heladeria/totem/upload/${encodeURIComponent(filename)}`,
                { method: 'DELETE' },
            );
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.detail || 'Error borrando la imagen del tótem');
            }
            return res.json();
        }, { label: 'totem.deleteImage' });
    }

    /**
     * Construye la URL absoluta de una imagen servida por el backend.
     * @param {string} url ruta relativa devuelta por el backend (p.ej. /media/totem/x.png)
     * @returns {string}
     */
    resolveImageUrl(url) {
        if (!url || typeof url !== 'string') return '';
        if (/^https?:\/\//i.test(url)) return url;
        return `${CONFIG.API_BASE_URL.replace(/\/api\/v1\/?$/, '')}${url}`;
    }
}

export const totemContentService = new TotemContentService();
export default totemContentService;
