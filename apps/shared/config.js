/**
 * v19 (Fase 19.1): Configuracion compartida del frontend.
 *
 * FUENTE UNICA DE VERDAD para la URL base del API.
 *
 * Orden de resolucion (CORREGIDO en v19.1-hotfix):
 *   1. window.location.hostname + puerto 5001  (PRIMARIO en LAN)
 *      -> Garantiza que CUALQUIER cliente (PC, tablet, celular) que abra el POS
 *         desde http://<host>:5000 llame al API en http://<host>:5001.
 *         Esto es lo que funcionaba antes de V19 y NO debe romperse.
 *   2. import.meta.env.VITE_API_URL  (OVERRIDE explicito)
 *      -> Solo se usa si no hay window (SSR/build) o si el hostname no resuelve.
 *   3. Fallback final: localhost:5001 (SSR / entorno sin window)
 *
 * HISTORIA DEL BUG (v19.1):
 *   La primera version de este archivo daba PRIORIDAD a VITE_API_URL. Como
 *   docker-compose.yml fijaba VITE_API_URL=http://192.168.1.117:5001, cualquier
 *   cliente que NO fuera esa IP exacta recibia "sin conexion al servidor" y las
 *   fotografias de producto (servidas por el API) no cargaban.
 *   La correccion invierte la prioridad: el hostname del navegador manda.
 *
 * IMPORTANTE: Vite SOLO expone variables con prefijo VITE_ (import.meta.env.VITE_*).
 */

const ENV_URL = import.meta.env?.VITE_API_URL;

/**
 * Deriva la URL del API a partir del hostname del navegador.
 * Es la ruta que garantiza compatibilidad LAN total.
 */
const hostnameUrl = () => {
    if (typeof window === 'undefined') return null;
    const host = window.location.hostname;
    if (!host) return null;
    return `http://${host}:5001/api/v1`;
};

/**
 * Normaliza VITE_API_URL a una URL base terminada en /api/v1.
 * Acepta tanto "http://host:5001" como "http://host:5001/api/v1".
 */
const normalizeEnvUrl = (raw) => {
    if (!raw) return null;
    const trimmed = String(raw).replace(/\/+$/, '');
    if (trimmed.endsWith('/api/v1')) return trimmed;
    return `${trimmed}/api/v1`;
};

const resolveApiBaseUrl = () => {
    // 1. PRIORIDAD: hostname del navegador (compatibilidad LAN, comportamiento historico).
    const fromHostname = hostnameUrl();
    if (fromHostname) return fromHostname;

    // 2. OVERRIDE explicito (solo si no hay window, p.ej. SSR/build).
    const fromEnv = normalizeEnvUrl(ENV_URL);
    if (fromEnv) return fromEnv;

    // 3. Fallback final.
    return 'http://localhost:5001/api/v1';
};

export const CONFIG = {
    API_BASE_URL: resolveApiBaseUrl(),
    ITEMS_PER_PAGE: 12,
    TASA_IVA_MEXICO: 0.16
};

export default CONFIG;
