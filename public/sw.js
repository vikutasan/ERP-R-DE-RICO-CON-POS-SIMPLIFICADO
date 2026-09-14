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

// v19.3 (14 Sep 2026): MODO DEV — el SW NO debe cachear el app shell en desarrollo.
//
// HISTORIA DEL BUG (pagina en blanco persistente):
//   El SW cacheaba el app shell (HTML + scripts) con estrategia cache-first.
//   En Vite DEV, cada modulo se sirve con un hash de version en la query
//   (p.ej. /node_modules/.vite/deps/react.js?v=e6b2a3a9). Al editar un modulo,
//   Vite cambia el hash, pero el SW seguia devolviendo la copia cacheada ANTIGUA
//   de /main.jsx y /apps/ExperimentCenterUI.jsx, que apuntaban a modulos ya
//   inexistentes -> error de modulo -> pagina en blanco.
//   Ctrl+Shift+R NO ayuda: bypassa el cache HTTP pero NO el Service Worker.
//
// SOLUCION: en desarrollo (Vite dev server) el SW se auto-desregistra y borra
//   todas sus caches. El app shell se sirve SIEMPRE por red (network-only).
//   El cache-first del app shell solo aplica en PRODUCCION (build estatico).
const CACHE_VERSION = 'rderico-warehouse-v3';
const APP_SHELL_CACHE = `${CACHE_VERSION}-shell`;
const API_CACHE = `${CACHE_VERSION}-api`;

/**
 * ¿Estamos en el servidor de desarrollo de Vite?
 * El dev server corre en el puerto 3000 (contenedor) / 5000 (host) y sirve
 * los modulos con /@vite/client. En produccion el build estatico NO tiene
 * /@vite/client, por lo que esta deteccion es fiable.
 */
const ES_DEV = (() => {
    try {
        const host = self.location.hostname;
        const port = self.location.port;
        // Puertos del dev server (contenedor 3000, host 5000) o cualquier host
        // que no sea el dominio de produccion.
        const puertosDev = ['3000', '5000', '5173'];
        if (puertosDev.includes(port)) return true;
        // localhost / IPs privadas => entorno de desarrollo.
        if (host === 'localhost' || host === '127.0.0.1') return true;
        if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return true;
        return false;
    } catch (e) {
        return false;
    }
})();

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
    // En DEV no se precachea nada: el app shell se sirve siempre por red.
    if (ES_DEV) {
        self.skipWaiting();
        return;
    }
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
    // En DEV: borrar TODAS las caches y auto-desregistrar el SW.
    // Esto purga cualquier SW/cache stale de sesiones anteriores que estuviera
    // sirviendo modulos JS antiguos (causa de la pagina en blanco).
    if (ES_DEV) {
        event.waitUntil(
            caches.keys()
                .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
                .then(() => self.registration.unregister())
                .then(() => self.clients.matchAll({ type: 'window' }))
                .then((clients) => {
                    // Recargar las pestanas para que tomen el control sin SW.
                    clients.forEach((client) => {
                        if ('navigate' in client) client.navigate(client.url);
                    });
                })
                .catch(() => {})
        );
        return;
    }
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

    // App shell: cache-first con revalidación (SOLO en producción).
    // En DEV se deja pasar (network-only) para que Vite sirva siempre los
    // módulos frescos y nunca se sirva un app shell stale.
    if (!ES_DEV && esAppShell(request, url)) {
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
