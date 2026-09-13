/**
 * v13 (Fase 13.1): tests de los clasificadores puros del módulo de red.
 * Estos tests son el "guardián del contrato": si alguien cambia la lógica
 * de clasificación, aquí se rompe primero — antes de llegar al POS.
 */
import { describe, it, expect } from 'vitest';
import {
    TERMINAL_STATUS,
    DISCONNECT_SEVERITY,
    LOCK_TTL_MINUTES,
    RECONNECT_WINDOW_MS,
    normalizeUtcString,
    classifyTerminalStatus,
    classifyDisconnectSeverity,
    classifyEvents,
    summarizeSuspiciousIncidents,
} from './networkClassifiers';

// Timestamp fijo de referencia: 2026-09-13T17:00:00Z
const NOW = Date.parse('2026-09-13T17:00:00Z');
const minutesAgo = (m) => new Date(NOW - m * 60000).toISOString();

describe('normalizeUtcString', () => {
    it('agrega Z a un string sin zona', () => {
        expect(normalizeUtcString('2026-09-13T17:00:00')).toBe('2026-09-13T17:00:00Z');
    });

    it('respeta un string que ya termina en Z', () => {
        expect(normalizeUtcString('2026-09-13T17:00:00Z')).toBe('2026-09-13T17:00:00Z');
    });

    it('respeta un string con offset explícito', () => {
        expect(normalizeUtcString('2026-09-13T11:00:00-06:00')).toBe('2026-09-13T11:00:00-06:00');
    });

    it('devuelve null para valores vacíos', () => {
        expect(normalizeUtcString(null)).toBeNull();
        expect(normalizeUtcString(undefined)).toBeNull();
        expect(normalizeUtcString('')).toBeNull();
    });
});

describe('classifyTerminalStatus', () => {
    it('devuelve IDLE cuando no hay ocupante', () => {
        expect(classifyTerminalStatus(null, NOW)).toBe(TERMINAL_STATUS.IDLE);
        expect(classifyTerminalStatus({}, NOW)).toBe(TERMINAL_STATUS.IDLE);
        expect(classifyTerminalStatus({ occupier_id: null }, NOW)).toBe(TERMINAL_STATUS.IDLE);
    });

    it('devuelve STALE cuando la sesión está marcada como expirada', () => {
        const info = { occupier_id: 7, stale_session: true, locked_at: minutesAgo(1) };
        expect(classifyTerminalStatus(info, NOW)).toBe(TERMINAL_STATUS.STALE);
    });

    it('devuelve CASH_OPEN cuando la caja está sin operador', () => {
        const info = { occupier_id: 7, is_cash_register: true, operator_absent: true, locked_at: minutesAgo(1) };
        expect(classifyTerminalStatus(info, NOW)).toBe(TERMINAL_STATUS.CASH_OPEN);
    });

    it('devuelve CASH_OPEN cuando la caja no tiene lock', () => {
        const info = { occupier_id: 7, is_cash_register: true, locked_at: null };
        expect(classifyTerminalStatus(info, NOW)).toBe(TERMINAL_STATUS.CASH_OPEN);
    });

    it('devuelve ONLINE cuando el lock es reciente', () => {
        const info = { occupier_id: 7, locked_at: minutesAgo(5) };
        expect(classifyTerminalStatus(info, NOW)).toBe(TERMINAL_STATUS.ONLINE);
    });

    it('devuelve CASH_OPEN cuando el lock supera el TTL', () => {
        const info = { occupier_id: 7, locked_at: minutesAgo(LOCK_TTL_MINUTES + 1) };
        expect(classifyTerminalStatus(info, NOW)).toBe(TERMINAL_STATUS.CASH_OPEN);
    });

    it('interpreta locked_at sin Z como UTC (no como hora local)', () => {
        // 17:00 UTC sin 'Z' => debe leerse como UTC => edad 0 => ONLINE
        const info = { occupier_id: 7, locked_at: '2026-09-13T17:00:00' };
        expect(classifyTerminalStatus(info, NOW)).toBe(TERMINAL_STATUS.ONLINE);
    });

    it('respeta un ttlMinutes personalizado', () => {
        const info = { occupier_id: 7, locked_at: minutesAgo(10) };
        expect(classifyTerminalStatus(info, NOW, 5)).toBe(TERMINAL_STATUS.CASH_OPEN);
        expect(classifyTerminalStatus(info, NOW, 15)).toBe(TERMINAL_STATUS.ONLINE);
    });
});

describe('classifyDisconnectSeverity', () => {
    it('marca NORMAL un evento que no es disconnect', () => {
        const evt = { rawType: 'reconnect', terminal: 'T2', timestamp: NOW };
        expect(classifyDisconnectSeverity(evt, [evt], 0)).toBe(DISCONNECT_SEVERITY.NORMAL);
    });

    it('marca SOSPECHOSA una desconexión sin reconexión cercana', () => {
        const events = [
            { rawType: 'disconnect', terminal: 'T2', timestamp: NOW },
        ];
        expect(classifyDisconnectSeverity(events[0], events, 0)).toBe(DISCONNECT_SEVERITY.SUSPICIOUS);
    });

    it('marca NORMAL una desconexión con reconexión dentro de la ventana', () => {
        // Orden DESC: reconexión (índice 0) es más reciente que la desconexión (índice 1)
        const events = [
            { rawType: 'reconnect', terminal: 'T2', timestamp: NOW },
            { rawType: 'disconnect', terminal: 'T2', timestamp: NOW - 60000 },
        ];
        expect(classifyDisconnectSeverity(events[1], events, 1)).toBe(DISCONNECT_SEVERITY.NORMAL);
    });

    it('marca SOSPECHOSA si la reconexión es de OTRA terminal', () => {
        const events = [
            { rawType: 'reconnect', terminal: 'T3', timestamp: NOW },
            { rawType: 'disconnect', terminal: 'T2', timestamp: NOW - 60000 },
        ];
        expect(classifyDisconnectSeverity(events[1], events, 1)).toBe(DISCONNECT_SEVERITY.SUSPICIOUS);
    });

    it('marca SOSPECHOSA si la reconexión está fuera de la ventana', () => {
        const events = [
            { rawType: 'reconnect', terminal: 'T2', timestamp: NOW },
            { rawType: 'disconnect', terminal: 'T2', timestamp: NOW - RECONNECT_WINDOW_MS - 1000 },
        ];
        expect(classifyDisconnectSeverity(events[1], events, 1)).toBe(DISCONNECT_SEVERITY.SUSPICIOUS);
    });
});

describe('classifyEvents', () => {
    it('agrega severity a cada evento sin mutar el original', () => {
        const events = [
            { rawType: 'reconnect', terminal: 'T2', timestamp: NOW },
            { rawType: 'disconnect', terminal: 'T2', timestamp: NOW - 60000 },
            { rawType: 'disconnect', terminal: 'T5', timestamp: NOW - 300000 },
        ];
        const result = classifyEvents(events);
        expect(result).toHaveLength(3);
        expect(result[1].severity).toBe(DISCONNECT_SEVERITY.NORMAL);
        expect(result[2].severity).toBe(DISCONNECT_SEVERITY.SUSPICIOUS);
        expect(events[1].severity).toBeUndefined();
    });

    it('devuelve arreglo vacío para entrada nula', () => {
        expect(classifyEvents(null)).toEqual([]);
    });
});

describe('summarizeSuspiciousIncidents', () => {
    it('cuenta solo desconexiones sospechosas por terminal', () => {
        const events = [
            { rawType: 'disconnect', terminal: 'T2', severity: DISCONNECT_SEVERITY.SUSPICIOUS },
            { rawType: 'disconnect', terminal: 'T2', severity: DISCONNECT_SEVERITY.SUSPICIOUS },
            { rawType: 'disconnect', terminal: 'T2', severity: DISCONNECT_SEVERITY.NORMAL },
            { rawType: 'disconnect', terminal: 'T5', severity: DISCONNECT_SEVERITY.SUSPICIOUS },
            { rawType: 'reconnect', terminal: 'T5', severity: DISCONNECT_SEVERITY.NORMAL },
        ];
        expect(summarizeSuspiciousIncidents(events)).toEqual({ T2: 2, T5: 1 });
    });

    it('devuelve objeto vacío cuando no hay sospechosas', () => {
        expect(summarizeSuspiciousIncidents([])).toEqual({});
        expect(summarizeSuspiciousIncidents(null)).toEqual({});
    });
});
