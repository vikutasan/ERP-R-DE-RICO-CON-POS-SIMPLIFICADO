/**
 * v17 — FASE 2: Tests de EQUIVALENCIA de la limpieza de sesión.
 *
 * MISIÓN: probar que aplicar `buildResetPatch()` produce EXACTAMENTE el mismo
 * estado final que la limpieza manual anterior. Si el patch omite un valor que
 * la limpieza vieja sí ponía (o incluye uno que no debía), estos tests fallan.
 *
 * Estrategia: se modela el "estado de sesión" como un objeto plano y se aplican
 * reducers:
 *   - `legacyCleanup(state)`          → réplica de handleExitWithoutSaving v7.0.3.
 *   - `legacySuccessCleanup(state)`   → réplica de la rama success ANTES (10 claves).
 *   - `legacyTerminalExitCleanup(state)` → réplica de doTerminalExit ANTES (3 claves).
 *   - `patchedCleanup(state)`         → aplica buildResetPatch().
 * Luego se comparan los resultados con toEqual (equivalencia profunda).
 *
 * Ver PLAN_CORRECCION_ESTADO_POS_V17.md FASE 2 y §5 (riesgos).
 */
import { describe, it, expect } from 'vitest';
import { buildResetPatch } from './sessionReset.js';

/**
 * Estado de sesión de captura "sucio" (como quedaría tras capturar una cuenta).
 * Incluye TODAS las claves que las limpiezas tocan, más algunas que NO deben
 * tocarse (para verificar que ninguna las pisa).
 */
function dirtyState() {
    return {
        // --- Claves que la limpieza SÍ debe resetear ---
        currentAccountNum: 'A-123',
        originalCapturer: { id: 7, name: 'Ana' },
        ticketVersion: 3,
        orderType: 'PEDIDO_PROGRAMADO',
        orderData: { committed_at: '2026-09-20T00:00:00Z' },
        paymentsHistory: [{ id: 1, amount: 100 }],
        lastSaveStatus: 'saving',
        lastSaveTime: '2026-09-20T04:00:00Z',
        showCheckout: true,
        savedTicket: { id: 99, status: 'OPEN' },
        showExitModal: true,
        pendingExitAction: () => {},

        // --- Claves que NINGUNA limpieza debe tocar (límite §3.2) ---
        cart: [{ id: 1, quantity: 2 }],
        categories: [{ id: 'pan' }],
        printTicketData: { folio: 'X' },
        toastMessage: 'hola',
        viewMode: 'grid',
    };
}

/**
 * Réplica LITERAL de la limpieza manual v7.0.3 (handleExitWithoutSaving).
 * Es el "oráculo" contra el que se compara el patch.
 */
function legacyCleanup(state) {
    return {
        ...state,
        originalCapturer: null,
        currentAccountNum: '',
        ticketVersion: null,
        orderData: null,
        orderType: 'VENTA_DIRECTA',
        lastSaveStatus: 'idle',
        lastSaveTime: null,
        showCheckout: false,
        paymentsHistory: [],
        savedTicket: null,        // ← la limpieza vieja SÍ lo hacía
        showExitModal: false,     // ← la limpieza vieja SÍ lo hacía
        pendingExitAction: null,  // ← la limpieza vieja SÍ lo hacía
    };
}

/**
 * Limpieza NUEVA: aplica el patch de buildResetPatch().
 * Es el reducer compartido por las 3 rutas migradas (2a, 2b, 2c).
 */
function patchedCleanup(state) {
    const patch = buildResetPatch();
    return {
        ...state,
        originalCapturer: patch.originalCapturer,
        currentAccountNum: patch.currentAccountNum,
        ticketVersion: patch.ticketVersion,
        orderData: patch.orderData,
        orderType: patch.orderType,
        lastSaveStatus: patch.lastSaveStatus,
        lastSaveTime: patch.lastSaveTime,
        showCheckout: patch.showCheckout,
        paymentsHistory: patch.paymentsHistory,
        savedTicket: patch.savedTicket,
        showExitModal: patch.showExitModal,
        pendingExitAction: patch.pendingExitAction,
    };
}

/**
 * Réplica de la rama success ANTES de v17 (10 claves, sin las 3 asimétricas).
 */
function legacySuccessCleanup(state) {
    return {
        ...state,
        originalCapturer: null,
        currentAccountNum: '',
        ticketVersion: null,
        orderData: null,
        orderType: 'VENTA_DIRECTA',
        lastSaveStatus: 'idle',
        lastSaveTime: null,
        showCheckout: false,
        paymentsHistory: [],
        // NO limpia: savedTicket, showExitModal, pendingExitAction
    };
}

/**
 * Réplica de doTerminalExit ANTES de v17 (solo 3 claves a mano).
 */
function legacyTerminalExitCleanup(state) {
    return {
        ...state,
        currentAccountNum: '',
        originalCapturer: null,
        // NO limpia: ticketVersion, orderData, orderType, lastSaveStatus,
        // lastSaveTime, showCheckout, paymentsHistory, savedTicket,
        // showExitModal, pendingExitAction
    };
}

describe('FASE 2a — Equivalencia de handleExitWithoutSaving (v17)', () => {
    it('el patch produce EXACTAMENTE el mismo estado que la limpieza manual', () => {
        const legacy = legacyCleanup(dirtyState());
        const patched = patchedCleanup(dirtyState());
        expect(patched).toEqual(legacy);
    });

    it('ambas limpiezas resetean las 12 claves de sesión', () => {
        const result = patchedCleanup(dirtyState());
        expect(result.currentAccountNum).toBe('');
        expect(result.originalCapturer).toBeNull();
        expect(result.ticketVersion).toBeNull();
        expect(result.orderType).toBe('VENTA_DIRECTA');
        expect(result.orderData).toBeNull();
        expect(result.paymentsHistory).toEqual([]);
        expect(result.lastSaveStatus).toBe('idle');
        expect(result.lastSaveTime).toBeNull();
        expect(result.showCheckout).toBe(false);
        expect(result.savedTicket).toBeNull();
        expect(result.showExitModal).toBe(false);
        expect(result.pendingExitAction).toBeNull();
    });

    it('ambas limpiezas PRESERVAN el estado fuera de alcance (límite §3.2)', () => {
        const legacy = legacyCleanup(dirtyState());
        const patched = patchedCleanup(dirtyState());

        // El carrito, catálogo, impresión y UI NO se tocan.
        expect(patched.cart).toEqual(legacy.cart);
        expect(patched.categories).toEqual(legacy.categories);
        expect(patched.printTicketData).toEqual(legacy.printTicketData);
        expect(patched.toastMessage).toBe(legacy.toastMessage);
        expect(patched.viewMode).toBe(legacy.viewMode);

        // Y siguen teniendo su valor original (no se vaciaron).
        expect(patched.cart).toEqual([{ id: 1, quantity: 2 }]);
        expect(patched.categories).toEqual([{ id: 'pan' }]);
        expect(patched.viewMode).toBe('grid');
    });

    it('el patch NO muta el estado de entrada (pureza)', () => {
        const input = dirtyState();
        patchedCleanup(input);
        // El objeto de entrada no cambió.
        expect(input.currentAccountNum).toBe('A-123');
        expect(input.showExitModal).toBe(true);
        expect(input.paymentsHistory).toEqual([{ id: 1, amount: 100 }]);
        expect(input.savedTicket).toEqual({ id: 99, status: 'OPEN' });
        expect(input.originalCapturer).toEqual({ id: 7, name: 'Ana' });
    });
});

describe('FASE 2b — La rama success AHORA limpia la asimetría (v17)', () => {
    it('ANTES: la rama success dejaba 3 residuos (reproduce la asimetría)', () => {
        const before = legacySuccessCleanup(dirtyState());
        expect(before.savedTicket).toEqual({ id: 99, status: 'OPEN' }); // residuo
        expect(before.showExitModal).toBe(true);                        // residuo
        expect(before.pendingExitAction).not.toBeNull();                // residuo
    });

    it('DESPUÉS: la rama success ya no deja residuos (corrige la asimetría)', () => {
        const after = patchedCleanup(dirtyState());
        expect(after.savedTicket).toBeNull();
        expect(after.showExitModal).toBe(false);
        expect(after.pendingExitAction).toBeNull();
    });

    it('DESPUÉS: la rama success limpia igual que handleExitWithoutSaving', () => {
        const success = patchedCleanup(dirtyState());
        const exitWithoutSaving = patchedCleanup(dirtyState());
        expect(success).toEqual(exitWithoutSaving);
    });
});

describe('FASE 2c — doTerminalExit unifica el contrato (v17)', () => {
    it('ANTES: doTerminalExit dejaba 10 residuos (contrato incompleto)', () => {
        const before = legacyTerminalExitCleanup(dirtyState());
        expect(before.ticketVersion).toBe(3);              // residuo
        expect(before.orderData).not.toBeNull();           // residuo
        expect(before.paymentsHistory).toHaveLength(1);    // residuo
        expect(before.savedTicket).not.toBeNull();         // residuo
        expect(before.showExitModal).toBe(true);           // residuo
    });

    it('DESPUÉS: doTerminalExit limpia el mismo conjunto que las demás rutas', () => {
        const terminalExit = patchedCleanup(dirtyState());
        const exitWithoutSaving = patchedCleanup(dirtyState());
        const success = patchedCleanup(dirtyState());

        // Las 3 rutas producen el MISMO estado final.
        expect(terminalExit).toEqual(exitWithoutSaving);
        expect(terminalExit).toEqual(success);
    });

    it('DESPUÉS: doTerminalExit preserva el estado fuera de alcance', () => {
        const result = patchedCleanup(dirtyState());
        expect(result.cart).toEqual([{ id: 1, quantity: 2 }]);
        expect(result.categories).toEqual([{ id: 'pan' }]);
        expect(result.printTicketData).toEqual({ folio: 'X' });
        expect(result.viewMode).toBe('grid');
    });
});
