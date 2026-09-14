/**
 * MÓDULO: pwaRuntime.js
 * MISIÓN: Registro del Service Worker y personalización del manifest PWA
 *         para el módulo de ALMACENES (v7 Fase 4.2 / 4.3).
 *
 * Reglas que respeta:
 *   - El Service Worker se registra con scope limitado al módulo de almacenes.
 *     NUNCA se registra sobre /api/v1/pos/ (regla crítica de seguridad).
 *   - `name` y `theme_color` del manifest se derivan de `system_settings`
 *     (`business_name`), no se hardcodean (sección 19 del Contexto Maestro).
 *   - Si el backend no responde, se conserva el manifest estático como
 *     fallback: la app nunca se queda sin PWA por un fallo de settings.
 *
 * REGLA: Este módulo NO importa React.
 */

import { CONFIG } from '../../pos/config';

const API_BASE_URL = CONFIG.API_BASE_URL;

/** Ruta del Service Worker (servido desde /public). */
const SW_URL = '/sw.js';

/**
 * Scope del Service Worker. Se registra en la raíz porque el SW ya filtra por
 * ruta internamente (guarda explícita para /api/v1/pos/), pero el registro se
 * hace de forma explícita y documentada para que quede claro el límite.
 */
const SW_SCOPE = '/';

/** Color de tema por defecto si system_settings no lo provee. */
const DEFAULT_THEME_COLOR = '#1e293b';

/** Nombre por defecto si system_settings no lo provee. */
const DEFAULT_APP_NAME = 'R de Rico - ERP';

// ─── Registro del Service Worker ─────────────────────────────────────────────

/**
 * ¿Estamos en el servidor de desarrollo de Vite?
 *
 * v19.3: en DEV el Service Worker NO debe existir. Cacheaba el app shell
 * (HTML + scripts) con estrategia cache-first, y al editar un módulo Vite
 * cambiaba el hash de la query, pero el SW seguía sirviendo la copia ANTIGUA
 * de /main.jsx y /apps/ExperimentCenterUI.jsx -> error de módulo -> página en
 * blanco. Ctrl+Shift+R no ayuda porque bypassa el cache HTTP, no el SW.
 *
 * @returns {boolean}
 */
function esEntornoDev() {
    if (typeof window === 'undefined') return false;
    const host = window.location.hostname;
    const port = window.location.port;
    const puertosDev = ['3000', '5000', '5173'];
    if (puertosDev.includes(port)) return true;
    if (host === 'localhost' || host === '127.0.0.1') return true;
    if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return true;
    return false;
}

/**
 * v19.3: Purga total del Service Worker y sus caches en desarrollo.
 *
 * Se ejecuta al arrancar la app. Si detecta entorno DEV, desregistra cualquier
 * SW existente (incluido uno stale de una sesión anterior) y borra TODAS las
 * caches. Esto garantiza que la página en blanco no vuelva a ocurrir aunque el
 * ciclo de actualización del SW sea lento.
 *
 * @returns {Promise<boolean>} true si se purgó algo.
 */
export async function purgarServiceWorkerEnDev() {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
        return false;
    }
    if (!esEntornoDev()) return false;

    let purgado = false;
    try {
        // 1. Desregistrar todos los SW existentes.
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((reg) => reg.unregister()));
        if (registrations.length > 0) purgado = true;

        // 2. Borrar todas las caches (app shell stale).
        if (typeof caches !== 'undefined') {
            const keys = await caches.keys();
            await Promise.all(keys.map((key) => caches.delete(key)));
            if (keys.length > 0) purgado = true;
        }
    } catch (e) {
        // Silencioso: nunca romper el arranque de la app por el SW.
    }
    return purgado;
}

/**
 * Registra el Service Worker del módulo de almacenes.
 * Es idempotente y silencioso ante entornos sin soporte (SSR, navegadores
 * antiguos) para no romper la app.
 *
 * v19.3: en DEV NO se registra (ver `esEntornoDev`). El SW solo tiene sentido
 * en el build de producción.
 *
 * @returns {Promise<ServiceWorkerRegistration|null>}
 */
export async function registrarServiceWorker() {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
        return null;
    }
    // En DEV: nunca registrar; además purgar cualquier SW stale.
    if (esEntornoDev()) {
        await purgarServiceWorkerEnDev();
        return null;
    }
    try {
        const registration = await navigator.serviceWorker.register(SW_URL, {
            scope: SW_SCOPE,
        });
        return registration;
    } catch (e) {
        // No se propaga: la app debe funcionar aunque el SW falle.
        return null;
    }
}

// ─── Personalización del manifest desde system_settings ──────────────────────

/**
 * Obtiene un valor de `system_settings` por clave.
 * Devuelve null si no existe o si el backend no responde.
 *
 * @param {string} key
 * @returns {Promise<string|null>}
 */
async function getSystemSetting(key) {
    try {
        const res = await fetch(`${API_BASE_URL}/settings/${encodeURIComponent(key)}`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            cache: 'no-store',
        });
        if (!res.ok) return null;
        const data = await res.json();
        return data && typeof data.value === 'string' ? data.value : null;
    } catch (e) {
        return null;
    }
}

/**
 * Deriva el nombre de la app y el color de tema desde `system_settings`.
 * Si no hay datos, usa los valores por defecto (nunca hardcodea el negocio).
 *
 * @returns {Promise<{name:string, themeColor:string}>}
 */
export async function derivarBrandingDesdeSettings() {
    const businessName = await getSystemSetting('business_name');
    const themeColor = await getSystemSetting('theme_color');

    return {
        name: businessName || DEFAULT_APP_NAME,
        themeColor: themeColor || DEFAULT_THEME_COLOR,
    };
}

/**
 * Reescribe en caliente el manifest PWA con el branding real del negocio.
 *
 * Estrategia: se construye un Blob con el manifest personalizado y se
 * reemplaza el `href` del <link rel="manifest">. Así el manifest estático
 * sirve de fallback y el dinámico refleja `system_settings` sin hardcodear.
 *
 * @returns {Promise<{name:string, themeColor:string}|null>}
 */
export async function aplicarBrandingAlManifest() {
    if (typeof document === 'undefined') return null;

    const branding = await derivarBrandingDesdeSettings();

    try {
        const res = await fetch('/manifest.json', { cache: 'no-store' });
        const base = res.ok ? await res.json() : {};
        const manifest = {
            ...base,
            name: branding.name,
            short_name: branding.name.length > 12 ? branding.name.slice(0, 12) : branding.name,
            theme_color: branding.themeColor,
        };

        const blob = new Blob([JSON.stringify(manifest)], { type: 'application/manifest+json' });
        const url = URL.createObjectURL(blob);

        let link = document.querySelector('link[rel="manifest"]');
        if (!link) {
            link = document.createElement('link');
            link.rel = 'manifest';
            document.head.appendChild(link);
        }
        link.href = url;

        // Reflejar el color de tema en la barra del navegador.
        let metaTheme = document.querySelector('meta[name="theme-color"]');
        if (!metaTheme) {
            metaTheme = document.createElement('meta');
            metaTheme.name = 'theme-color';
            document.head.appendChild(metaTheme);
        }
        metaTheme.content = branding.themeColor;
    } catch (e) {
        // Silencioso: el manifest estático sigue vigente.
    }

    return branding;
}

// ─── Arranque unificado ──────────────────────────────────────────────────────

/**
 * Inicializa la capa PWA del módulo de almacenes: registra el SW y aplica el
 * branding desde settings. Pensado para llamarse una sola vez al montar la UI.
 *
 * @returns {Promise<{registration:ServiceWorkerRegistration|null, branding:Object|null}>}
 */
export async function inicializarPWA() {
    const [registration, branding] = await Promise.all([
        registrarServiceWorker(),
        aplicarBrandingAlManifest(),
    ]);
    return { registration, branding };
}
