/**
 * MÓDULO: offlineQueue.js
 * MISIÓN: Cola de sincronización offline para el módulo de ALMACENES (v7 Fase 4.1).
 *
 * Capacidades:
 *   - Ver almacenes y stock desde caché local (IndexedDB)
 *   - Registrar entrada de stock y merma sin red (cola local)
 *   - Auto-sync al reconectar, sin duplicados (uuid de cliente)
 *
 * REGLAS DE DISEÑO OBLIGATORIAS (plan v7, sección 4.1):
 *   - Cada operación encolada lleva: uuid de cliente, timestamp_local,
 *     sucursal_id y origen: 'warehouse_offline'.
 *   - Las URLs se derivan de CONFIG.API_BASE_URL — PROHIBIDO construirlas a
 *     mano (Incidente 16.6). Si el host cambia, este módulo se adapta solo.
 *   - Detección de conectividad vía navigator.onLine + heartbeat real.
 *   - La cola NO bloquea la UI: se aplica optimista y se reconcilia al sincronizar.
 *   - Idempotencia: el uuid de cliente viaja al backend para deduplicación.
 *
 * AISLAMIENTO (regla crítica de seguridad):
 *   Este módulo SOLO habla con /api/v1/warehouse/. NUNCA toca /api/v1/pos/.
 *   El POS es el corazón económico del negocio y no debe compartir cola ni
 *   caché con el módulo de almacenes.
 *
 * REGLA: Este módulo NO importa React. Es lógica pura de persistencia + red.
 */

import { CONFIG } from '../../pos/config';

// ─── Constantes ──────────────────────────────────────────────────────────────

const DB_NAME = 'rderico_warehouse_offline';
const DB_VERSION = 1;
const STORE_CACHE = 'warehouse_cache';
const STORE_QUEUE = 'warehouse_queue';

const HEARTBEAT_INTERVAL_MS = 30000; // 30 s
const HEARTBEAT_TIMEOUT_MS = 5000;   // 5 s sin respuesta => offline

/** Prefijo de API derivado de la config central (Incidente 16.6). */
const API_BASE_URL = CONFIG.API_BASE_URL; // p. ej. http://192.168.1.117:5001/api/v1

/** Prefijo de rutas del módulo de almacenes. Aislado del POS por diseño. */
const WAREHOUSE_PREFIX = `${API_BASE_URL}/warehouse`;

/** Origen que se estampa en cada operación encolada. */
export const ORIGEN_OFFLINE = 'warehouse_offline';

// ─── Utilidades ──────────────────────────────────────────────────────────────

/**
 * Genera un UUID v4 de cliente para deduplicación en el backend.
 * Usa crypto.randomUUID cuando está disponible (navegadores modernos) y
 * cae a un generador manual para entornos sin esa API.
 */
export function generarUuidCliente() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    // Fallback RFC4122 v4
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

/**
 * Timestamp local en ISO 8601. Se guarda el instante real de captura para que
 * el backend pueda ordenar movimientos aunque lleguen tarde.
 */
export function timestampLocal() {
    return new Date().toISOString();
}

/**
 * Deriva una URL absoluta del módulo de almacenes a partir de una ruta
 * relativa. Prohibido concatenar hosts a mano (Incidente 16.6).
 *
 * @param {string} ruta - p. ej. '/123/mermas' o '/stock-por-sku/ing_harina'
 * @returns {string} URL absoluta bajo /api/v1/warehouse
 */
export function urlAlmacen(ruta) {
    const limpia = String(ruta || '').replace(/^\/+/, '');
    return `${WAREHOUSE_PREFIX}/${limpia}`;
}

// ─── IndexedDB: apertura y helpers genéricos ─────────────────────────────────

function openDB() {
    return new Promise((resolve, reject) => {
        if (typeof indexedDB === 'undefined') {
            reject(new Error('IndexedDB no disponible en este entorno'));
            return;
        }
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_CACHE)) {
                db.createObjectStore(STORE_CACHE, { keyPath: 'key' });
            }
            if (!db.objectStoreNames.contains(STORE_QUEUE)) {
                db.createObjectStore(STORE_QUEUE, { keyPath: 'uuid' });
            }
        };
    });
}

async function putRecord(storeName, record) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        tx.objectStore(storeName).put(record);
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
    });
}

async function getRecord(storeName, key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const req = tx.objectStore(storeName).get(key);
        req.onsuccess = () => { db.close(); resolve(req.result || null); };
        req.onerror = () => { db.close(); reject(req.error); };
    });
}

async function getAllRecords(storeName) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const req = tx.objectStore(storeName).getAll();
        req.onsuccess = () => { db.close(); resolve(req.result || []); };
        req.onerror = () => { db.close(); reject(req.error); };
    });
}

async function deleteRecord(storeName, key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        tx.objectStore(storeName).delete(key);
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
    });
}

// ─── Caché de lectura (almacenes y stock) ────────────────────────────────────

/**
 * Guarda un snapshot de los almacenes para lectura offline.
 * @param {Array} almacenes - lista ya mapeada a formato UI
 */
export async function cacheAlmacenes(almacenes) {
    await putRecord(STORE_CACHE, {
        key: 'almacenes',
        data: almacenes || [],
        cachedAt: Date.now(),
    });
}

/** Devuelve el snapshot de almacenes o null si nunca se cacheó. */
export async function getCachedAlmacenes() {
    const rec = await getRecord(STORE_CACHE, 'almacenes');
    return rec ? rec.data : null;
}

/**
 * Guarda el stock de un almacén concreto para lectura offline.
 * @param {string|number} whId
 * @param {Array} stock - lista de stock ya mapeada a formato UI
 */
export async function cacheStock(whId, stock) {
    await putRecord(STORE_CACHE, {
        key: `stock:${whId}`,
        data: stock || [],
        cachedAt: Date.now(),
    });
}

/** Devuelve el stock cacheado de un almacén o null. */
export async function getCachedStock(whId) {
    const rec = await getRecord(STORE_CACHE, `stock:${whId}`);
    return rec ? rec.data : null;
}

// ─── Cola de operaciones ─────────────────────────────────────────────────────

/**
 * Encola una operación de escritura del módulo de almacenes.
 *
 * @param {Object} op
 * @param {string} op.ruta        - ruta relativa bajo /api/v1/warehouse
 * @param {string} [op.method]    - verbo HTTP (default POST)
 * @param {Object} op.body        - cuerpo de la petición
 * @param {string} op.label       - descripción legible para la UI
 * @param {number|string} [op.sucursalId] - sucursal de origen
 * @returns {Promise<string>} uuid de cliente asignado
 */
export async function enqueueOperacion({ ruta, method = 'POST', body, label, sucursalId = null }) {
    const uuid = generarUuidCliente();
    const registro = {
        uuid,
        ruta,
        method,
        body: body || {},
        label: label || 'Operación de almacén pendiente',
        sucursal_id: sucursalId,
        origen: ORIGEN_OFFLINE,
        timestamp_local: timestampLocal(),
        intentos: 0,
    };
    await putRecord(STORE_QUEUE, registro);
    return uuid;
}

/** Número de operaciones pendientes de sincronizar. */
export async function getPendingCount() {
    const items = await getAllRecords(STORE_QUEUE);
    return items.length;
}

/** Lista completa de operaciones pendientes (para pintar en la UI). */
export async function getPendingOperations() {
    return await getAllRecords(STORE_QUEUE);
}

/**
 * Procesa toda la cola contra el backend.
 *
 * Política de errores:
 *   - 2xx            => éxito, se elimina de la cola.
 *   - 409/422/404    => conflicto definitivo (duplicado, dato inválido o
 *                       inexistente): se elimina y se reporta para que el
 *                       operador lo revise. Reintentar no ayuda.
 *   - 5xx / red caída => se conserva en cola y se reintenta después.
 *
 * @returns {Promise<{synced:number, failed:number, conflicts:Array}>}
 */
export async function processQueue() {
    const items = await getAllRecords(STORE_QUEUE);
    const result = { synced: 0, failed: 0, conflicts: [] };

    for (const item of items) {
        try {
            const res = await fetch(urlAlmacen(item.ruta), {
                method: item.method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(item.body),
            });

            if (res.ok) {
                await deleteRecord(STORE_QUEUE, item.uuid);
                result.synced++;
            } else if (res.status === 409 || res.status === 422 || res.status === 404) {
                await deleteRecord(STORE_QUEUE, item.uuid);
                result.conflicts.push({
                    uuid: item.uuid,
                    label: item.label,
                    status: res.status,
                    detail: await res.text().catch(() => 'Sin detalle'),
                });
            } else {
                result.failed++;
            }
        } catch (e) {
            // Red aún no disponible: se conserva para el siguiente intento.
            result.failed++;
        }
    }

    return result;
}

/** Vacía la cola por completo (uso administrativo / pruebas). */
export async function clearQueue() {
    const items = await getAllRecords(STORE_QUEUE);
    for (const item of items) {
        await deleteRecord(STORE_QUEUE, item.uuid);
    }
}

// ─── Monitor de conectividad ─────────────────────────────────────────────────

/**
 * Crea un monitor de red con doble verificación:
 *   1. Eventos nativos online/offline (detección instantánea)
 *   2. Heartbeat real contra /health (evita falsos positivos de WiFi)
 *
 * Al recuperar la conexión dispara automáticamente `processQueue()`.
 *
 * @param {Object} [opts]
 * @param {Function} [opts.onStatusChange] - callback (isOnline) => void
 * @param {Function} [opts.onSync]         - callback (resultado) => void
 * @returns {{isOnline:Function, checkNow:Function, destroy:Function}}
 */
export function createWarehouseNetworkMonitor({ onStatusChange, onSync } = {}) {
    let currentStatus = typeof navigator !== 'undefined' ? navigator.onLine : true;
    let heartbeatTimer = null;
    let syncing = false;

    const notify = (nuevo) => {
        if (nuevo !== currentStatus) {
            currentStatus = nuevo;
            if (typeof onStatusChange === 'function') onStatusChange(currentStatus);
        }
    };

    const intentarSync = async () => {
        if (syncing) return;
        syncing = true;
        try {
            const resultado = await processQueue();
            if (typeof onSync === 'function') onSync(resultado);
        } catch (e) {
            // Silencioso: la cola se conserva y se reintenta en el próximo ciclo.
        } finally {
            syncing = false;
        }
    };

    const doHeartbeat = async () => {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), HEARTBEAT_TIMEOUT_MS);
            // /health vive en la raíz del host, no bajo /api/v1.
            const healthUrl = `${API_BASE_URL.replace(/\/api\/v1\/?$/, '')}/health`;
            const res = await fetch(healthUrl, {
                method: 'GET',
                signal: controller.signal,
                cache: 'no-store',
            });
            clearTimeout(timeout);
            const estabaOffline = !currentStatus;
            notify(res.ok);
            if (res.ok && estabaOffline) await intentarSync();
        } catch (e) {
            notify(false);
        }
    };

    const handleOnline = () => { doHeartbeat(); };
    const handleOffline = () => { notify(false); };

    if (typeof window !== 'undefined') {
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
    }

    doHeartbeat();
    heartbeatTimer = setInterval(doHeartbeat, HEARTBEAT_INTERVAL_MS);

    return {
        isOnline: () => currentStatus,
        checkNow: () => doHeartbeat(),
        syncNow: () => intentarSync(),
        destroy: () => {
            if (typeof window !== 'undefined') {
                window.removeEventListener('online', handleOnline);
                window.removeEventListener('offline', handleOffline);
            }
            if (heartbeatTimer) clearInterval(heartbeatTimer);
        },
    };
}
