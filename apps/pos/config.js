/**
 * v19 (Fase 19.3): Configuracion del POS.
 *
 * Ahora delega en la fuente unica de verdad (apps/shared/config.js), que
 * resuelve la URL del API en este orden:
 *   1. import.meta.env.VITE_API_URL  (inyectada por Vite)
 *   2. Fallback LAN: window.location.hostname + puerto 5001
 *   3. Fallback final: localhost:5001
 *
 * Se conserva la deteccion de dominio de produccion (reparto.* -> api.*)
 * para no romper el despliegue publico existente.
 */

import { CONFIG as SHARED_CONFIG } from '../shared/config.js';

const hostname = window.location.hostname;
const isIP = /^\d+\.\d+\.\d+\.\d+$/.test(hostname);
const isLocal = hostname === 'localhost' || isIP;

let apiUrl;
if (isLocal) {
    // En LAN, la fuente unica de verdad decide (VITE_API_URL o fallback).
    apiUrl = SHARED_CONFIG.API_BASE_URL;
} else {
    // Si entran por reparto.tudominio.com, el API está en api.tudominio.com
    const domainParts = hostname.split('.');
    domainParts[0] = 'api';
    const apiHostname = domainParts.join('.');
    apiUrl = `https://${apiHostname}/api/v1`;
}

export const CONFIG = {
    API_BASE_URL: apiUrl,
    ITEMS_PER_PAGE: 12,
    TASA_IVA_MEXICO: 0.16
};
