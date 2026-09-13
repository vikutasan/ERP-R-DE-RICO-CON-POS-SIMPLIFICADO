/**
 * SERVICE WORKER — Módulo de ALMACENES (v7 Fase 4.2)
 *
 * ⚠️ REGLA CRÍTICA DE SEGURIDAD ⚠️
 * Este Service Worker NUNCA debe interceptar ni cachear endpoints de
 * `/api/v1/pos/`. El POS es el corazón económico del negocio: un SW mal
 * scopeado puede romper el cobro. Toda petición al POS se deja pasar
 * intacta (early-return) antes de cualquier lógica de caché.
 *
 * Estrategia de caché:
 *   - App shell (HTML, JS, CSS)      → cache-first con revalidación en background
 *   - GET /api/v1/warehouse/         → stale-while-revalidate
 *   - GET /api/v1/warehouse/{id}/stock → stale-while-revalidate
 *   - POST/PUT/DELETE                → network-only (delega a offlineQueue.js)
 *
 * El scope de este SW se limita estrictamente al módulo de almacenes.
 */

const CACHE_VERSION = 'rderico-warehouse-v1';
const APP_SHELL_CACHE = `${CACHE_VERSION}-shell`;
const API_CACHE = `${CACHE_VERSION}-api`;

/** Rutas del POS que JAMÁS deben tocarse. */
const POS_PATH_PREFIX = '/api/v1/pos/';

/** Prefijo de la API de almacenes que sí se puede cachear (solo GET). */
const WAREHOUSE_API_PREFIX = '/api/v1/warehouse';

/** Recursos mínimos del app shell para arrancar sin red. */
const APP_SHELL_ASSETS = [
    '/',
    '/index.html',
    '/manifest.json',
];

// ─── Instalación ─────────────────────────────────────────────────────────────

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(APP_SHELL_CACHE)
            .then((cache) => cache.addAll(APP_SHELL_ASSETS))
            .catch(() => {
                // Si algún asset no está disponible, no se aborta la instalación.
            })
    );
    self.skipWaiting();
});

// ─── Activación: limpiar cachés de versiones anteriores ─────────────────────

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys
                    .filter((key) => !key.startsWith(CACHE_VERSION))
                    .map((key) => caches.delete(key))
            )
        )
    );
    self.clients.claim();
});

// ─── Utilidades ──────────────────────────────────────────────────────────────

/** ¿La URL pertenece al POS? Entonces el SW no debe tocarla. */
function esRutaPOS(url) {
    return url.pathname.startsWith(POS_PATH_PREFIX);
}

/** ¿Es una lectura cacheable del módulo de almacenes? */
function esLecturaAlmacenes(request, url) {
    if (request.method !== 'GET') return false;
    return url.pathname.startsWith(WAREHOUSE_API_PREFIX);
}

/** ¿Es un recurso del app shell (documento, script, estilo, fuente, imagen)? */
function esAppShell(request, url) {
    if (url.origin !== self.location.origin) return false;
    if (url.pathname.startsWith('/api/')) return false;
    const destino = request.destination;
    return (
        destino === 'document' ||
        destino === 'script' ||
        destino === 'style' ||
        destino === 'font' ||
        destino === 'image' ||
        url.pathname === '/' ||
        url.pathname.endsWith('.html')
    );
}

/**
 * Stale-while-revalidate: responde del caché al instante y actualiza en
 * background. Si no hay caché, va a red y guarda la respuesta.
 */
async function staleWhileRevalidate(request) {
    const cache = await caches.open(API_CACHE);
    const cached = await cache.match(request);

    const fetchPromise = fetch(request)
        .then((response) => {
            if (response && response.ok) {
                cache.put(request, response.clone());
            }
            return response;
        })
        .catch(() => null);

    return cached || (await fetchPromise) || new Response(
        JSON.stringify({ detail: 'Sin conexión y sin datos en caché' }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
}

/**
 * Cache-first con revalidación en background para el app shell.
 */
async function cacheFirstShell(request) {
    const cache = await caches.open(APP_SHELL_CACHE);
    const cached = await cache.match(request);
    if (cached) {
        // Revalidar en background sin bloquear la respuesta.
        fetch(request)
            .then((response) => {
                if (response && response.ok) cache.put(request, response.clone());
            })
            .catch(() => {});
        return cached;
    }
    try {
        const response = await fetch(request);
        if (response && response.ok) cache.put(request, response.clone());
        return response;
    } catch (e) {
        // Último recurso: servir el index cacheado para navegaciones SPA.
        const fallback = await cache.match('/index.html');
        if (fallback) return fallback;
        throw e;
    }
}

// ─── Intercepción de peticiones ──────────────────────────────────────────────

self.addEventListener('fetch', (event) => {
    const { request } = event;
    let url;
    try {
        url = new URL(request.url);
    } catch (e) {
        return; // URL no parseable: dejar pasar.
    }

    // ⛔ GUARDA DE SEGURIDAD: el POS nunca se intercepta ni se cachea.
    if (esRutaPOS(url)) {
        return; // network-only implícito: el navegador maneja la petición.
    }

    // Escrituras del módulo de almacenes: network-only. La resiliencia offline
    // la gestiona offlineQueue.js (IndexedDB), no el SW.
    if (url.pathname.startsWith(WAREHOUSE_API_PREFIX) && request.method !== 'GET') {
        return;
    }

    // Lecturas del módulo de almacenes: stale-while-revalidate.
    if (esLecturaAlmacenes(request, url)) {
        event.respondWith(staleWhileRevalidate(request));
        return;
    }

    // App shell: cache-first con revalidación.
    if (esAppShell(request, url)) {
        event.respondWith(cacheFirstShell(request));
        return;
    }

    // Cualquier otra petición (incluidas APIs ajenas al POS): dejar pasar.
});

// ─── Mensajería desde la UI ──────────────────────────────────────────────────

self.addEventListener('message', (event) => {
    const data = event.data || {};
    if (data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
    if (data.type === 'CLEAR_WAREHOUSE_CACHE') {
        event.waitUntil(
            caches.keys().then((keys) =>
                Promise.all(
                    keys
                        .filter((key) => key.startsWith(CACHE_VERSION))
                        .map((key) => caches.delete(key))
                )
            )
        );
    }
});
