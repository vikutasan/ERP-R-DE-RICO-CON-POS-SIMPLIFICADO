/**
 * v19 (Fase 19.1): Configuracion compartida del frontend.
 *
 * FUENTE UNICA DE VERDAD para la URL base del API.
 *
 * Orden de resolucion:
 *   1. import.meta.env.VITE_API_URL  (inyectada por Vite desde .env / docker-compose)
 *   2. Fallback: window.location.hostname + puerto 5001 (compatibilidad LAN)
 *   3. Fallback final: localhost:5001 (SSR / entorno sin window)
 *
 * IMPORTANTE: Vite SOLO expone variables con prefijo VITE_ (import.meta.env.VITE_*).
 * Por eso .env define VITE_API_URL y NO basta con API_URL / NEXT_PUBLIC_API_URL.
 *
 * NOTA: Este archivo NO reemplaza a apps/pos/config.js todavia. La migracion de
 * los consumidores se hace en las Fases 19.2 y 19.3 (Bloques 2 y 3).
 */

const ENV_URL = import.meta.env?.VITE_API_URL;

const fallbackUrl = () => {
    if (typeof window === 'undefined') return 'http://localhost:5001/api/v1';
    return `http://${window.location.hostname}:5001/api/v1`;
};

export const CONFIG = {
    API_BASE_URL: ENV_URL ? `${ENV_URL}/api/v1` : fallbackUrl(),
    ITEMS_PER_PAGE: 12,
    TASA_IVA_MEXICO: 0.16
};

export default CONFIG;
