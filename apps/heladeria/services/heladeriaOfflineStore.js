/**
 * heladeriaOfflineStore.js — Cache IndexedDB + Cola de Sync para heladería.
 * Garantiza operación offline: menú cacheado localmente + operaciones
 * pendientes encoladas para sync cuando se recupere la conexión.
 */

const DB_NAME = 'heladeria_offline';
const DB_VERSION = 1;
const STORES = {
    MENU: 'menu_cache',
    SYNC_QUEUE: 'sync_queue',
};

let dbInstance = null;

async function getDB() {
    if (dbInstance) return dbInstance;
    
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORES.MENU)) {
                db.createObjectStore(STORES.MENU, { keyPath: 'key' });
            }
            if (!db.objectStoreNames.contains(STORES.SYNC_QUEUE)) {
                const store = db.createObjectStore(STORES.SYNC_QUEUE, { keyPath: 'id', autoIncrement: true });
                store.createIndex('timestamp', 'timestamp', { unique: false });
            }
        };
        
        request.onsuccess = (event) => {
            dbInstance = event.target.result;
            resolve(dbInstance);
        };
        
        request.onerror = () => reject(request.error);
    });
}

// ═══════════════════════════════════════════════════════
// CACHE DE MENÚ
// ═══════════════════════════════════════════════════════

export async function cacheMenu(menuData) {
    const db = await getDB();
    const tx = db.transaction(STORES.MENU, 'readwrite');
    const store = tx.objectStore(STORES.MENU);
    store.put({ key: 'full_menu', data: menuData, cachedAt: Date.now() });
    return new Promise((resolve) => { tx.oncomplete = resolve; });
}

export async function getCachedMenu() {
    const db = await getDB();
    const tx = db.transaction(STORES.MENU, 'readonly');
    const store = tx.objectStore(STORES.MENU);
    const request = store.get('full_menu');
    return new Promise((resolve) => {
        request.onsuccess = () => {
            const result = request.result;
            if (result) {
                // Cache válido por 30 minutos
                const age = Date.now() - result.cachedAt;
                const MAX_AGE = 30 * 60 * 1000;
                resolve(age < MAX_AGE ? result.data : null);
            } else {
                resolve(null);
            }
        };
        request.onerror = () => resolve(null);
    });
}

// ═══════════════════════════════════════════════════════
// CACHE DEL DISPLAY DE PRECIOS (V17, Fase 17.3)
// ═══════════════════════════════════════════════════════
//
// Reutiliza el MISMO store `menu_cache` con la clave 'display_menu'.
// NO se crea un store nuevo ⇒ NO se incrementa DB_VERSION ⇒ no hay
// migración de IndexedDB en los kioscos ya desplegados.
//
// TTL de 24h (a diferencia de los 30 min del menú operativo): el Display
// de Precios es una pantalla de solo lectura que debe sobrevivir un corte
// de red prolongado. El admin fuerza la actualización con el botón
// "Limpiar caché" (ver DisplayPreciosUI.jsx).

const DISPLAY_MENU_KEY = 'display_menu';
const DISPLAY_MENU_MAX_AGE = 24 * 60 * 60 * 1000; // 24 horas

export async function cacheDisplayMenu(menuData) {
    const db = await getDB();
    const tx = db.transaction(STORES.MENU, 'readwrite');
    const store = tx.objectStore(STORES.MENU);
    store.put({ key: DISPLAY_MENU_KEY, data: menuData, cachedAt: Date.now() });
    return new Promise((resolve) => { tx.oncomplete = resolve; });
}

export async function getCachedDisplayMenu() {
    const db = await getDB();
    const tx = db.transaction(STORES.MENU, 'readonly');
    const store = tx.objectStore(STORES.MENU);
    const request = store.get(DISPLAY_MENU_KEY);
    return new Promise((resolve) => {
        request.onsuccess = () => {
            const result = request.result;
            if (result) {
                const age = Date.now() - result.cachedAt;
                resolve(age < DISPLAY_MENU_MAX_AGE ? result.data : null);
            } else {
                resolve(null);
            }
        };
        request.onerror = () => resolve(null);
    });
}

/**
 * Devuelve la antigüedad (ms) del caché del Display, o null si no existe.
 * La UI la usa para mostrar "Actualizado hace X".
 */
export async function getDisplayMenuCacheAge() {
    const db = await getDB();
    const tx = db.transaction(STORES.MENU, 'readonly');
    const store = tx.objectStore(STORES.MENU);
    const request = store.get(DISPLAY_MENU_KEY);
    return new Promise((resolve) => {
        request.onsuccess = () => {
            const result = request.result;
            resolve(result ? Date.now() - result.cachedAt : null);
        };
        request.onerror = () => resolve(null);
    });
}

/** Borra el caché del Display (botón "Limpiar caché" del admin). */
export async function clearDisplayMenuCache() {
    const db = await getDB();
    const tx = db.transaction(STORES.MENU, 'readwrite');
    const store = tx.objectStore(STORES.MENU);
    store.delete(DISPLAY_MENU_KEY);
    return new Promise((resolve) => { tx.oncomplete = resolve; });
}

// ═══════════════════════════════════════════════════════
// COLA DE SYNC (operaciones pendientes)
// ═══════════════════════════════════════════════════════

export async function enqueueOperation(operation) {
    const db = await getDB();
    const tx = db.transaction(STORES.SYNC_QUEUE, 'readwrite');
    const store = tx.objectStore(STORES.SYNC_QUEUE);
    store.add({
        ...operation,
        timestamp: Date.now(),
        status: 'PENDING',
    });
    return new Promise((resolve) => { tx.oncomplete = resolve; });
}

export async function getPendingOperations() {
    const db = await getDB();
    const tx = db.transaction(STORES.SYNC_QUEUE, 'readonly');
    const store = tx.objectStore(STORES.SYNC_QUEUE);
    const request = store.getAll();
    return new Promise((resolve) => {
        request.onsuccess = () => {
            const ops = request.result || [];
            resolve(ops.filter(op => op.status === 'PENDING'));
        };
        request.onerror = () => resolve([]);
    });
}

export async function markOperationDone(id) {
    const db = await getDB();
    const tx = db.transaction(STORES.SYNC_QUEUE, 'readwrite');
    const store = tx.objectStore(STORES.SYNC_QUEUE);
    store.delete(id);
    return new Promise((resolve) => { tx.oncomplete = resolve; });
}

// ═══════════════════════════════════════════════════════
// DETECTOR DE CONEXIÓN
// ═══════════════════════════════════════════════════════

export function onConnectionChange(callback) {
    window.addEventListener('online', () => callback(true));
    window.addEventListener('offline', () => callback(false));
    // Estado inicial
    callback(navigator.onLine);
}

export function isOnline() {
    return navigator.onLine;
}
