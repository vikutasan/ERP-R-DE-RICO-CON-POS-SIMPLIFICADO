/**
 * heladeriaTerminals.js — Gestión de terminales heladería (namespace H-).
 * Reutiliza el sistema de locks del POS con IDs H1, H2, H-CAJA.
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
 * Ocupa un terminal de heladería (lock persistente).
 */
export async function lockTerminal(terminalId, employeeId, employeeName) {
    return withRetries(async () => {
        const res = await fetch(`${CONFIG.API_BASE_URL}/pos/terminal-lock`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                terminal_id: terminalId,
                occupier_id: employeeId,
                occupier_name: employeeName,
            }),
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || `Error bloqueando terminal ${terminalId}`);
        }
        return res.json();
    }, { label: `lockTerminal(${terminalId})` });
}

/**
 * Libera un terminal de heladería.
 */
export async function unlockTerminal(terminalId) {
    return withRetries(async () => {
        const res = await fetch(`${CONFIG.API_BASE_URL}/pos/terminal-lock/${terminalId}`, {
            method: 'DELETE',
        });
        if (!res.ok && res.status !== 404) {
            throw new Error(`Error liberando terminal ${terminalId}`);
        }
        return true;
    }, { label: `unlockTerminal(${terminalId})` });
}

/**
 * Obtiene todos los locks activos (para mostrar cuáles están ocupados).
 */
export async function getAllLocks() {
    return withRetries(async () => {
        const res = await fetch(`${CONFIG.API_BASE_URL}/pos/terminal-locks`, { cache: 'no-store' });
        if (!res.ok) return [];
        const locks = await res.json();
        // Filtrar solo locks de heladería (prefix H)
        return (locks || []).filter(l => l.terminal_id && l.terminal_id.startsWith('H'));
    }, { label: 'getAllLocks' });
}
