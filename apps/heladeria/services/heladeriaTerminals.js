/**
 * heladeriaTerminals.js — Gestión de terminales heladería (namespace H-).
 * Reutiliza el sistema de locks del POS con IDs H1, H2, H-CAJA.
 *
 * v14 (FASE 0): REPARADO. Antes llamaba a 3 endpoints INEXISTENTES:
 *   - POST   /pos/terminal-lock          (no existe)
 *   - DELETE /pos/terminal-lock/{id}     (no existe)
 *   - GET    /pos/terminal-locks         (no existe)
 * Ahora usa los endpoints REALES de apps/api/modules/pos/router.py:
 *   - POST /pos/terminals/{id}/lock      (línea 309)
 *   - POST /pos/terminals/{id}/unlock    (línea 323)
 *   - GET  /pos/terminals/status         (línea 230)
 *
 * Contrato verificado contra el backend:
 *   - lock/unlock reciben `LockRequest` = { occupier_id, occupier_name }.
 *   - /terminals/status devuelve un MAPA { terminal_id: { occupier_id,
 *     occupier_name, locked_at, is_cash_register? } }, NO una lista.
 */
import { CONFIG } from '../../pos/config';
import { withRetries } from '../../pos/utils/withRetries';

const SETTINGS_KEY = 'heladeria_terminals_config';

/**
 * Obtiene la configuración de terminales desde SystemSettings.
 */
export async function getTerminalConfig() {
    return withRetries(async () => {
        const res = await fetch(`${CONFIG.API_BASE_URL}/settings`, { cache: 'no-store' });
        if (!res.ok) throw new Error('Error cargando configuración');
        const settings = await res.json();
        const config = settings.find(s => s.key === SETTINGS_KEY);
        if (!config) return { terminals: ['H1', 'H2', 'H-CAJA'], max_terminals: 6 };
        return typeof config.value === 'string' ? JSON.parse(config.value) : config.value;
    }, { label: 'getTerminalConfig' });
}

/**
 * Ocupa un terminal de heladería (lock persistente en PostgreSQL).
 * Endpoint real: POST /pos/terminals/{terminal_id}/lock
 */
export async function lockTerminal(terminalId, employeeId, employeeName) {
    return withRetries(async () => {
        const res = await fetch(`${CONFIG.API_BASE_URL}/pos/terminals/${encodeURIComponent(terminalId)}/lock`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                occupier_id: employeeId,
                occupier_name: employeeName,
            }),
        });
        if (!res.ok) {
            let detail = `Error bloqueando terminal ${terminalId}`;
            try {
                const err = await res.json();
                if (err && err.detail) detail = err.detail;
            } catch (_) { /* respuesta sin JSON */ }
            throw new Error(detail);
        }
        return res.json();
    }, { label: `lockTerminal(${terminalId})` });
}

/**
 * Libera un terminal de heladería.
 * Endpoint real: POST /pos/terminals/{terminal_id}/unlock
 * Requiere `occupier_id` (el backend valida la propiedad del lock).
 */
export async function unlockTerminal(terminalId, employeeId) {
    return withRetries(async () => {
        const res = await fetch(`${CONFIG.API_BASE_URL}/pos/terminals/${encodeURIComponent(terminalId)}/unlock`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                occupier_id: employeeId,
            }),
        });
        // 403 = el lock pertenece a otra persona; no es un error de red.
        if (!res.ok && res.status !== 403) {
            throw new Error(`Error liberando terminal ${terminalId}`);
        }
        return true;
    }, { label: `unlockTerminal(${terminalId})` });
}

/**
 * Obtiene todos los locks activos (para mostrar cuáles están ocupados).
 * Endpoint real: GET /pos/terminals/status
 *
 * ⚠️ El backend devuelve un MAPA { terminal_id: {...} }, no una lista.
 * Se normaliza a un array de objetos con `terminal_id` incluido, y se
 * filtran solo los locks de heladería (prefijo 'H').
 */
export async function getAllLocks() {
    return withRetries(async () => {
        const res = await fetch(`${CONFIG.API_BASE_URL}/pos/terminals/status`, { cache: 'no-store' });
        if (!res.ok) return [];
        const data = await res.json();
        const mapa = data && typeof data === 'object' ? data : {};
        return Object.entries(mapa)
            .map(([terminalId, info]) => ({ terminal_id: terminalId, ...(info || {}) }))
            .filter(l => l.terminal_id && l.terminal_id.startsWith('H'));
    }, { label: 'getAllLocks' });
}
