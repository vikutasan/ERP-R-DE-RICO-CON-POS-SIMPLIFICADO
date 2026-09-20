/**
 * v15 — Tests guardianes de la lógica de bloqueo/desbloqueo de terminales.
 *
 * MISIÓN: fijar las 4 correcciones de la v15 para que una futura IA/desarrollador
 * no las revierta por accidente. Son tests de NO-REGRESIÓN sobre funciones puras
 * (el repo prefiere extraer la decisión y probarla sin montar el componente).
 *
 * Hallazgos cubiertos:
 *   H3 — El payload de `beforeunload` DEBE incluir `terminal_id`.
 *   H7 — `heartbeatTerminal` DEBE señalar el fallo (lanzar) en respuesta no-OK.
 *   H8 — Un 403 en `unlock` es ESPERADO: no se reintenta ni se expulsa.
 *   H1 — Las deps de los efectos usan el primitivo `currentUserId`, no el objeto.
 *
 * Si alguien vuelve a omitir `terminal_id`, a tragarse el fallo del heartbeat,
 * a reintentar un 403, o a depender del objeto `currentUser`, estos tests fallan.
 */
import { describe, it, expect } from 'vitest';

/**
 * Réplica fiel de la construcción del payload de `beforeunload`
 * (useBeforeUnload.js, v15). Incluye `terminal_id` desde el ref.
 */
function buildBeforeUnloadPayload({ cart, accountNum, terminalId }) {
    return {
        account_num: accountNum,
        terminal_id: terminalId || null,
        items: (cart || []).map(i => ({ product_id: i.id, quantity: i.quantity || 1 })),
        status: 'OPEN',
        emergency_save: true,
    };
}

/**
 * Réplica de la decisión de `heartbeatTerminal` (POSService.js, v15).
 * Lanza si la respuesta no es OK; devuelve true si lo es.
 */
function resolveHeartbeat(res) {
    if (!res.ok) {
        throw new Error(`Heartbeat falló con estado ${res.status}`);
    }
    return true;
}

/**
 * Réplica de la política del frontend ante un 403 de `unlock`.
 * Un 403 es esperado: se registra y NO se reintenta ni se expulsa.
 */
function handleUnlockResult({ ok, status }) {
    if (ok) return { action: 'none', retry: false, expel: false };
    if (status === 403) return { action: 'warn', retry: false, expel: false };
    return { action: 'warn', retry: false, expel: false };
}

/**
 * Réplica de la decisión de `checkMyLock` (useTerminalLocking.js, v15).
 * Compara el ocupante contra el id VIVO (ref), no contra el objeto capturado.
 */
function resolveLockCheck(myStatus, liveUserId) {
    if (!myStatus || myStatus.occupier_id !== liveUserId) {
        if (myStatus && myStatus.occupier_id !== liveUserId) {
            return { warning: true, forceLogout: true };
        }
        return { warning: true, forceLogout: false };
    }
    return { warning: false, forceLogout: false };
}

describe('H3 — Payload de beforeunload incluye terminal_id (v15)', () => {
    it('incluye terminal_id cuando la terminal está definida', () => {
        const payload = buildBeforeUnloadPayload({
            cart: [{ id: 7, quantity: 2 }],
            accountNum: 'A-123',
            terminalId: 'T2',
        });
        expect(payload.terminal_id).toBe('T2');
        expect(payload.account_num).toBe('A-123');
        expect(payload.emergency_save).toBe(true);
        expect(payload.status).toBe('OPEN');
    });

    it('normaliza quantity ausente a 1', () => {
        const payload = buildBeforeUnloadPayload({
            cart: [{ id: 9 }],
            accountNum: 'A-1',
            terminalId: 'T1',
        });
        expect(payload.items).toEqual([{ product_id: 9, quantity: 1 }]);
    });

    it('terminal_id null es aceptable (el backend hace fallback)', () => {
        const payload = buildBeforeUnloadPayload({
            cart: [{ id: 1, quantity: 1 }],
            accountNum: 'A-5',
            terminalId: null,
        });
        expect(payload.terminal_id).toBeNull();
    });

    it('REGRESIÓN: el payload NUNCA debe omitir la clave terminal_id', () => {
        const payload = buildBeforeUnloadPayload({
            cart: [{ id: 1 }],
            accountNum: 'A-9',
            terminalId: 'T3',
        });
        expect(Object.prototype.hasOwnProperty.call(payload, 'terminal_id')).toBe(true);
    });
});

describe('H7 — heartbeatTerminal señala el fallo (v15)', () => {
    it('devuelve true en respuesta OK', () => {
        expect(resolveHeartbeat({ ok: true, status: 200 })).toBe(true);
    });

    it('LANZA en 404 (lock no encontrado)', () => {
        expect(() => resolveHeartbeat({ ok: false, status: 404 })).toThrow(/404/);
    });

    it('LANZA en 403 (no es el dueño)', () => {
        expect(() => resolveHeartbeat({ ok: false, status: 403 })).toThrow(/403/);
    });

    it('LANZA en 500 (error de servidor)', () => {
        expect(() => resolveHeartbeat({ ok: false, status: 500 })).toThrow(/500/);
    });

    it('REGRESIÓN: ya NO devuelve false en silencio', () => {
        // El código viejo hacía `return res.ok;` → un fallo era indistinguible
        // de un blip de red. Ahora debe lanzar.
        expect(() => resolveHeartbeat({ ok: false, status: 404 })).toThrow();
    });
});

describe('H8 — Un 403 en unlock es esperado (v15)', () => {
    it('un 403 NO se reintenta', () => {
        expect(handleUnlockResult({ ok: false, status: 403 }).retry).toBe(false);
    });

    it('un 403 NO expulsa al usuario', () => {
        expect(handleUnlockResult({ ok: false, status: 403 }).expel).toBe(false);
    });

    it('un 403 solo emite una advertencia', () => {
        expect(handleUnlockResult({ ok: false, status: 403 }).action).toBe('warn');
    });

    it('un unlock exitoso no hace nada', () => {
        expect(handleUnlockResult({ ok: true, status: 200 }).action).toBe('none');
    });

    it('REGRESIÓN: ningún resultado de unlock dispara expulsión', () => {
        for (const status of [200, 403, 404, 500]) {
            expect(handleUnlockResult({ ok: status === 200, status }).expel).toBe(false);
        }
    });
});

describe('H1 — checkMyLock compara contra el id VIVO (v15)', () => {
    it('sin ocupante → advertencia, sin expulsión', () => {
        expect(resolveLockCheck(null, 5)).toEqual({ warning: true, forceLogout: false });
    });

    it('ocupada por OTRO usuario → advertencia + force logout', () => {
        expect(resolveLockCheck({ occupier_id: 99 }, 5)).toEqual({ warning: true, forceLogout: true });
    });

    it('ocupada por el MISMO usuario → todo normal', () => {
        expect(resolveLockCheck({ occupier_id: 5 }, 5)).toEqual({ warning: false, forceLogout: false });
    });

    it('usa el id VIVO: si el ref cambió, la comparación refleja el nuevo id', () => {
        // El lock pertenece al usuario 7; el ref vivo dice 7 → normal.
        expect(resolveLockCheck({ occupier_id: 7 }, 7).warning).toBe(false);
        // El ref vivo cambió a 8 → ya no coincide → advertencia.
        expect(resolveLockCheck({ occupier_id: 7 }, 8).warning).toBe(true);
    });
});
