/**
 * v17 — FASE 1: Tests de `buildResetPatch()`.
 *
 * Estos tests fijan el CONTRATO de la fuente única de verdad de limpieza
 * de sesión del POS. Son el guardián de que:
 *   1. Devuelve exactamente las 12 claves esperadas.
 *   2. Cada valor es el "vacío" correcto.
 *   3. NO incluye claves prohibidas (carrito, catálogo, impresión, UI efímera).
 *   4. Es PURA (dos llamadas → mismo contenido, distinta referencia).
 *
 * Ver PLAN_CORRECCION_ESTADO_POS_V17.md §3.1, §3.2 y FASE 1.
 */
import { describe, it, expect } from 'vitest';
import {
    buildResetPatch,
    RESET_PATCH_KEYS,
    FORBIDDEN_PATCH_KEYS,
} from './sessionReset.js';

describe('buildResetPatch() — contrato de limpieza de sesión (v17)', () => {
    it('devuelve exactamente las 12 claves esperadas', () => {
        const patch = buildResetPatch();
        expect(Object.keys(patch).sort()).toEqual([...RESET_PATCH_KEYS].sort());
        expect(Object.keys(patch)).toHaveLength(12);
    });

    it('cada valor es el "vacío" correcto', () => {
        const patch = buildResetPatch();

        // Identidad de la cuenta
        expect(patch.currentAccountNum).toBe('');
        expect(patch.originalCapturer).toBeNull();
        expect(patch.ticketVersion).toBeNull();

        // Tipo y datos del pedido
        expect(patch.orderType).toBe('VENTA_DIRECTA');
        expect(patch.orderData).toBeNull();

        // Cobro
        expect(patch.paymentsHistory).toEqual([]);
        expect(patch.showCheckout).toBe(false);

        // Estado de guardado
        expect(patch.lastSaveStatus).toBe('idle');
        expect(patch.lastSaveTime).toBeNull();

        // Asimetría verificada en FASE 0
        expect(patch.savedTicket).toBeNull();
        expect(patch.showExitModal).toBe(false);
        expect(patch.pendingExitAction).toBeNull();
    });

    it('NO incluye claves prohibidas (test de límite §3.2)', () => {
        const patch = buildResetPatch();
        const keys = Object.keys(patch);

        for (const forbidden of FORBIDDEN_PATCH_KEYS) {
            expect(keys).not.toContain(forbidden);
        }

        // Verificación explícita de las 4 más críticas:
        expect(keys).not.toContain('cart');            // vive en useCart (Anti-Wipe)
        expect(keys).not.toContain('categories');      // es catálogo
        expect(keys).not.toContain('printTicketData'); // es impresión
        expect(keys).not.toContain('toastMessage');    // es efímero
    });

    it('es PURA: dos llamadas devuelven objetos iguales pero NO la misma referencia', () => {
        const a = buildResetPatch();
        const b = buildResetPatch();

        // Mismo contenido
        expect(a).toEqual(b);

        // Distinta referencia (objeto raíz)
        expect(a).not.toBe(b);

        // Distinta referencia del array (evita mutación compartida)
        expect(a.paymentsHistory).not.toBe(b.paymentsHistory);

        // Mutar una no afecta a la otra
        a.paymentsHistory.push({ id: 1 });
        a.currentAccountNum = 'MUTADO';
        expect(b.paymentsHistory).toEqual([]);
        expect(b.currentAccountNum).toBe('');
    });
});
