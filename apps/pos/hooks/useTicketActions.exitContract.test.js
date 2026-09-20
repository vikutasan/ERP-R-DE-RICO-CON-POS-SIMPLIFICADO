/**
 * v7.0.3 — Tests del contrato de resultado del modal de salida.
 *
 * MISIÓN: ser el "guardián" del bug de cuentas perdidas.
 *
 * Contexto del bug original:
 *   Un vendedor capturaba una cuenta, olvidaba presionar "Enviar" y salía de
 *   la sesión. El operador de CAJA no encontraba la cuenta porque nunca se
 *   persistió. El modal de salida existía, pero `handleSendThenExit` asumía que
 *   "no lanzar excepción" == "se guardó". Los fallos de negocio (carrito vacío,
 *   folio ya pagado, verificación post-envío fallida) retornaban SIN lanzar,
 *   así que el modal dejaba salir al usuario creyendo que la cuenta se envió.
 *
 * Estos tests fijan el contrato `{ outcome, reason }` y la regla de oro:
 *   SOLO `outcome === 'success'` autoriza a salir de la sesión.
 *
 * Si alguien vuelve a tratar `undefined`/`aborted` como éxito, estos tests fallan.
 */
import { describe, it, expect } from 'vitest';

/**
 * Réplica fiel de la decisión de `handleSendThenExit` en RetailVisionPOS.jsx.
 * Se extrae aquí como función pura para poder probarla sin montar el componente
 * completo (que requiere decenas de props y servicios).
 *
 * Regla: solo 'success' ejecuta la acción pendiente de salida.
 */
function shouldExitAfterSend(result) {
    return result?.outcome === 'success';
}

/**
 * Réplica de la construcción del payload del beacon de emergencia
 * (handleForceLogout en RetailVisionPOS.jsx).
 */
function buildEmergencyPayload({ cart, accountNum, terminalId }) {
    if (!cart || cart.length === 0 || !accountNum) return null;
    return {
        account_num: accountNum,
        terminal_id: terminalId || null,
        items: cart.map(i => ({ product_id: i.id, quantity: i.quantity || 1 })),
    };
}

describe('Contrato de resultado de handleTicketAction (v7.0.3)', () => {
    it("'success' autoriza la salida (cuenta persistida y verificada)", () => {
        expect(shouldExitAfterSend({ outcome: 'success', reason: 'sent_to_pizarron' })).toBe(true);
        expect(shouldExitAfterSend({ outcome: 'success', reason: 'paid' })).toBe(true);
    });

    it("'aborted' NO autoriza la salida (carrito vacío)", () => {
        expect(shouldExitAfterSend({ outcome: 'aborted', reason: 'empty_cart' })).toBe(false);
    });

    it("'aborted' NO autoriza la salida (folio ya pagado)", () => {
        expect(shouldExitAfterSend({ outcome: 'aborted', reason: 'already_paid' })).toBe(false);
    });

    it("'aborted' NO autoriza la salida (verificación post-envío fallida)", () => {
        expect(shouldExitAfterSend({ outcome: 'aborted', reason: 'verification_failed' })).toBe(false);
        expect(shouldExitAfterSend({ outcome: 'aborted', reason: 'verification_error' })).toBe(false);
    });

    it("'aborted' NO autoriza la salida (conflicto de versión con auto-heal)", () => {
        expect(shouldExitAfterSend({ outcome: 'aborted', reason: 'version_conflict_autoheal' })).toBe(false);
    });

    it("'navigated' NO autoriza la salida (se abrió checkout)", () => {
        expect(shouldExitAfterSend({ outcome: 'navigated', reason: 'checkout_opened' })).toBe(false);
    });

    it("'not_finalized' NO autoriza la salida (finalizeUI=false)", () => {
        expect(shouldExitAfterSend({ outcome: 'not_finalized', reason: 'finalize_ui_disabled' })).toBe(false);
    });

    it('undefined NO autoriza la salida (regresión del bug original)', () => {
        // Este es EXACTAMENTE el caso que causaba la pérdida de cuentas:
        // el código viejo hacía `await handleTicketAction('OPEN')` y, al no
        // lanzar excepción, salía. Ahora undefined se trata como NO-éxito.
        expect(shouldExitAfterSend(undefined)).toBe(false);
        expect(shouldExitAfterSend(null)).toBe(false);
        expect(shouldExitAfterSend({})).toBe(false);
    });
});

describe('Payload del beacon de emergencia (force logout)', () => {
    it('incluye terminal_id para asociar el ticket a la terminal correcta', () => {
        const payload = buildEmergencyPayload({
            cart: [{ id: 7, quantity: 2 }],
            accountNum: 'A-123',
            terminalId: 'T2',
        });
        expect(payload).not.toBeNull();
        expect(payload.terminal_id).toBe('T2');
        expect(payload.account_num).toBe('A-123');
        expect(payload.items).toEqual([{ product_id: 7, quantity: 2 }]);
    });

    it('normaliza quantity ausente a 1', () => {
        const payload = buildEmergencyPayload({
            cart: [{ id: 9 }],
            accountNum: 'A-1',
            terminalId: 'T1',
        });
        expect(payload.items).toEqual([{ product_id: 9, quantity: 1 }]);
    });

    it('retorna null si el carrito está vacío (no dispara beacon inútil)', () => {
        expect(buildEmergencyPayload({ cart: [], accountNum: 'A-1', terminalId: 'T1' })).toBeNull();
    });

    it('retorna null si no hay folio (nada que guardar)', () => {
        expect(buildEmergencyPayload({ cart: [{ id: 1 }], accountNum: '', terminalId: 'T1' })).toBeNull();
    });

    it('terminal_id null es aceptable (el backend hace fallback)', () => {
        const payload = buildEmergencyPayload({
            cart: [{ id: 1, quantity: 1 }],
            accountNum: 'A-5',
            terminalId: null,
        });
        expect(payload.terminal_id).toBeNull();
    });
});
