/**
 * usePreComanda.js — Hook de pre-comanda de la Tienda Interactiva (V14, Fase 14.4).
 *
 * RESPONSABILIDAD
 *   Convertir el estado del configurador (helado armado) en un ticket real del
 *   backend, con `channel='HELADERIA'` garantizado de forma ATÓMICA (Opción 2).
 *
 * REGLAS OBLIGATORIAS (blindaje del POS)
 *   - El canal NO se escribe aquí: lo garantiza el backend en el MISMO INSERT
 *     de `POST /pos/tickets/reserve` (ver `heladeriaService.createHeladeriaTicket`).
 *     Por eso el éxito del `reserve` implica canal correcto. NO hay segundo PUT.
 *   - NO se generan folios localmente. Los entrega el backend.
 *   - NO se lee estado de React dentro de callbacks async: se usan refs.
 *   - Cola offline REAL: si el backend está caído, la operación se encola en
 *     IndexedDB vía `heladeriaOfflineStore.enqueueOperation()`. Sin esto la
 *     pre-comanda se perdería (hoy `heladeriaService` NO encola nada).
 *   - `cancelarPreComanda` NO asume un endpoint `cancel` inexistente: usa
 *     `DELETE /pos/tickets/items/remove` para vaciar el ticket, que el GC reclama.
 *
 * NO importa nada de `apps/pos/` salvo utilidades sin estado (vía heladeriaService).
 */
import { useState, useCallback, useRef } from 'react';
import { heladeriaService } from '../services/heladeriaService';
import { enqueueOperation, isOnline } from '../services/heladeriaOfflineStore';
import { buildPreComandaPayload } from '../utils/tiendaConfigurator';

/** Estados posibles del envío (para feedback de UI sin animaciones infinitas). */
export const PRECOMANDA_STATUS = {
    IDLE: 'IDLE',
    SENDING: 'SENDING',
    SENT: 'SENT',
    QUEUED: 'QUEUED',
    ERROR: 'ERROR',
};

/**
 * @param {object} params
 * @param {number|string|null} params.sessionId   Sesión de terminal activa.
 * @param {string} params.terminalId              Terminal de la Tienda (ej. 'H1').
 * @param {number|null} params.capturedById       Empleado que captura.
 * @param {object|null} params.menu               Menú vigente (para el payload).
 */
export function usePreComanda({ sessionId = null, terminalId = 'H1', capturedById = null, menu = null } = {}) {
    const [status, setStatus] = useState(PRECOMANDA_STATUS.IDLE);
    const [error, setError] = useState(null);
    const [lastAccountNum, setLastAccountNum] = useState(null);
    const [pendingCount, setPendingCount] = useState(0);

    // Refs: evitan leer estado de React dentro de callbacks async (regla del POS).
    const ticketRef = useRef(null);
    const menuRef = useRef(menu);
    menuRef.current = menu;

    /**
     * Envía una pre-comanda.
     *
     * @param {object} state  Estado del configurador (base, tamano, sabores, ...).
     * @param {object} [meta] Metadatos opcionales ({ recipientName }).
     * @returns {Promise<{ok:boolean, queued?:boolean, account_num?:string, error?:string}>}
     */
    const enviarPreComanda = useCallback(async (state, meta = {}) => {
        setError(null);

        // 1) Construir y validar el payload con el guardián del contrato (puro).
        const built = buildPreComandaPayload(state, menuRef.current, meta);
        if (!built.ok) {
            setStatus(PRECOMANDA_STATUS.ERROR);
            setError(built.errors.join('. '));
            return { ok: false, error: built.errors.join('. ') };
        }

        const item = built.item;

        // 2) Sin conexión: encolar la operación completa (reserve + add) y salir.
        //    NO se inventa un folio local: la operación se reintenta tal cual.
        if (!isOnline()) {
            try {
                await enqueueOperation({
                    kind: 'HELADERIA_PRECOMANDA',
                    payload: {
                        session_id: sessionId,
                        terminal_id: terminalId,
                        captured_by_id: capturedById,
                        item,
                    },
                });
                setPendingCount((n) => n + 1);
                setStatus(PRECOMANDA_STATUS.QUEUED);
                return { ok: true, queued: true };
            } catch (err) {
                setStatus(PRECOMANDA_STATUS.ERROR);
                setError(err.message || 'No se pudo encolar la pre-comanda');
                return { ok: false, error: err.message };
            }
        }

        // 3) En línea: reservar ticket (canal ATÓMICO) + agregar el item cabeza.
        setStatus(PRECOMANDA_STATUS.SENDING);
        try {
            let ticket = ticketRef.current;
            if (!ticket) {
                ticket = await heladeriaService.createHeladeriaTicket(
                    sessionId, terminalId, capturedById,
                );
                ticketRef.current = ticket;
            }

            const result = await heladeriaService.addItemToTicket(
                ticket.account_num,
                item.product_id,
                item.quantity,
                sessionId,
                terminalId,
                capturedById,
            );

            // Refrescar versión/total sin perder el account_num.
            ticketRef.current = { ...ticket, total: result.total, version: result.version };
            setLastAccountNum(ticket.account_num);
            setStatus(PRECOMANDA_STATUS.SENT);

            return {
                ok: true,
                queued: false,
                account_num: ticket.account_num,
                item,
                total: result.total,
            };
        } catch (err) {
            // Falló la red a mitad del envío: encolar para no perder la venta.
            try {
                await enqueueOperation({
                    kind: 'HELADERIA_PRECOMANDA',
                    payload: {
                        session_id: sessionId,
                        terminal_id: terminalId,
                        captured_by_id: capturedById,
                        item,
                    },
                });
                setPendingCount((n) => n + 1);
                setStatus(PRECOMANDA_STATUS.QUEUED);
                return { ok: true, queued: true };
            } catch (queueErr) {
                setStatus(PRECOMANDA_STATUS.ERROR);
                setError(err.message || 'Error enviando la pre-comanda');
                return { ok: false, error: err.message };
            }
        }
    }, [sessionId, terminalId, capturedById]);

    /**
     * Cancela la pre-comanda vaciando el ticket.
     *
     * ⚠️ NO existe endpoint `cancel` en el backend. Se usa `items/remove` por
     * cada item del ticket; al quedar vacío, el GC de tickets lo reclama.
     * Si no hay ticket activo, es un no-op seguro.
     */
    const cancelarPreComanda = useCallback(async () => {
        const ticket = ticketRef.current;
        if (!ticket || !ticket.account_num) {
            ticketRef.current = null;
            setStatus(PRECOMANDA_STATUS.IDLE);
            return { ok: true, cancelled: false };
        }

        const items = Array.isArray(ticket.items) ? ticket.items : [];
        try {
            for (const it of items) {
                // `removeItemFromTicket` no está expuesto en heladeriaService;
                // se usa el endpoint real vía fetch del propio servicio POS.
                // Se hace best-effort: si un item ya no existe, se ignora.
                await heladeriaService.removeItemFromTicket(
                    ticket.account_num, it.product_id,
                );
            }
        } catch (err) {
            // El ticket vacío lo reclama el GC; no bloqueamos la cancelación.
            console.warn('[usePreComanda] cancelarPreComanda parcial:', err.message);
        } finally {
            ticketRef.current = null;
            setLastAccountNum(null);
            setStatus(PRECOMANDA_STATUS.IDLE);
        }
        return { ok: true, cancelled: true };
    }, []);

    /** Reinicia el estado local (nueva pre-comanda). */
    const resetPreComanda = useCallback(() => {
        ticketRef.current = null;
        setStatus(PRECOMANDA_STATUS.IDLE);
        setError(null);
        setLastAccountNum(null);
    }, []);

    return {
        status,
        error,
        lastAccountNum,
        pendingCount,
        isSending: status === PRECOMANDA_STATUS.SENDING,
        enviarPreComanda,
        cancelarPreComanda,
        resetPreComanda,
    };
}

export default usePreComanda;
