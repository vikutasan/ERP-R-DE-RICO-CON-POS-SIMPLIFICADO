/**
 * v12 (Fase 12.1): Tests de la clasificacion pura del estado visual de terminal.
 *
 * Estos tests son el "guardian" del bug CAJA: si alguien vuelve a colapsar
 * 'mine' dentro de 'free' (o elimina el estado intermedio), fallan.
 */
import { describe, it, expect } from 'vitest';
import { resolveCardState } from './terminalCardState';

describe('resolveCardState (v12 Fase 12.1)', () => {
    it("devuelve 'free' cuando no hay info de la terminal", () => {
        expect(resolveCardState(undefined, 1)).toBe('free');
        expect(resolveCardState(null, 1)).toBe('free');
    });

    it("devuelve 'free' cuando la info existe pero no tiene occupier_id", () => {
        expect(resolveCardState({}, 1)).toBe('free');
        expect(resolveCardState({ occupier_id: null }, 1)).toBe('free');
        expect(resolveCardState({ occupier_id: 0 }, 1)).toBe('free');
    });

    it("devuelve 'mine' cuando el ocupante es el usuario actual (BUG CAJA)", () => {
        const info = { occupier_id: 1, occupier_name: 'VICTOR' };
        expect(resolveCardState(info, 1)).toBe('mine');
    });

    it("devuelve 'occupied' cuando el ocupante es otro usuario", () => {
        const info = { occupier_id: 3, occupier_name: 'Alfa' };
        expect(resolveCardState(info, 1)).toBe('occupied');
    });

    it("devuelve 'occupied' cuando hay lock pero no sabemos quien es el usuario actual", () => {
        const info = { occupier_id: 3, occupier_name: 'Alfa' };
        expect(resolveCardState(info, null)).toBe('occupied');
        expect(resolveCardState(info, undefined)).toBe('occupied');
    });

    it("no confunde 'mine' con 'free' (regresion del bug dependiente del observador)", () => {
        const info = { occupier_id: 1, occupier_name: 'VICTOR' };
        const state = resolveCardState(info, 1);
        expect(state).not.toBe('free');
        expect(state).toBe('mine');
    });

    it('compara ids de forma estricta (string vs number no colisionan)', () => {
        const info = { occupier_id: 1, occupier_name: 'VICTOR' };
        expect(resolveCardState(info, '1')).toBe('occupied');
    });
});
