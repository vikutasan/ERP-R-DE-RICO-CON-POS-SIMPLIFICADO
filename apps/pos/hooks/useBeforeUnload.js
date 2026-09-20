import { useEffect, useRef } from 'react';

/**
 * Hook: useBeforeUnload
 * Protección ante cierre accidental de pestaña.
 * - Muestra diálogo nativo de confirmación si hay items no guardados.
 * - Intenta un Emergency Save via navigator.sendBeacon como último recurso.
 *
 * v12 (Fase 12.3): además libera el lock de la terminal al cerrar/navegar
 * fuera de la pestaña, para no dejar locks huérfanos esperando el TTL (20 min).
 * El camino de salida explícito (handleTerminalSwitch -> doTerminalExit) ya
 * libera el lock; este beacon cubre el caso de cierre de pestaña / navegación.
 *
 * IMPORTANTE (regla anti-ping-pong): este hook NUNCA re-adquiere un lock.
 * Solo libera el que el propio usuario posee.
 */
export const useBeforeUnload = (cartRef, accountNumRef, apiBaseUrl, selectedTerminal, currentUser) => {
    // Refs para evitar closures obsoletos: el listener se registra una sola vez
    // (deps vacías) pero siempre lee el valor vigente de la terminal/usuario.
    const selectedTerminalRef = useRef(selectedTerminal);
    const currentUserRef = useRef(currentUser);

    useEffect(() => {
        selectedTerminalRef.current = selectedTerminal;
    }, [selectedTerminal]);

    // v15: este efecto depende del OBJETO currentUser y se re-ejecuta si cambia
    // de referencia. Es INOFENSIVO: solo reasigna un ref (no hay timers ni fetch).
    // Se deja como está a propósito (auditoría v15, hallazgo D5).
    useEffect(() => {
        currentUserRef.current = currentUser;
    }, [currentUser]);

    useEffect(() => {
        const handleBeforeUnload = (e) => {
            if (cartRef.current.length > 0 && accountNumRef.current) {
                e.preventDefault();
                e.returnValue = '⚠️ Tiene productos en el ticket sin guardar. ¿Seguro que desea salir?';

                try {
                    // v15 (H3): incluir terminal_id para que el backend asocie el ticket
                    // a la terminal correcta (evita el fallback "cualquier sesión activa").
                    // Mismo contrato que el force logout de v7.0.3 (RetailVisionPOS.jsx:430).
                    const payload = JSON.stringify({
                        account_num: accountNumRef.current,
                        terminal_id: selectedTerminalRef.current || null,
                        items: cartRef.current.map(i => ({ product_id: i.id, quantity: i.quantity || 1 })),
                        status: 'OPEN',
                        emergency_save: true
                    });
                    navigator.sendBeacon(
                        `${apiBaseUrl}/pos/tickets/emergency-save`,
                        new Blob([payload], { type: 'application/json' })
                    );
                } catch (err) {
                    console.error('Emergency save falló:', err);
                }
            }

            // v12 (Fase 12.3): liberar el lock de la terminal al abandonar la pestaña.
            // sendBeacon es el único transporte fiable durante beforeunload.
            try {
                const terminal = selectedTerminalRef.current;
                const user = currentUserRef.current;
                if (terminal && user?.id) {
                    const unlockPayload = JSON.stringify({ occupier_id: user.id });
                    navigator.sendBeacon(
                        `${apiBaseUrl}/pos/terminals/${terminal}/unlock`,
                        new Blob([unlockPayload], { type: 'application/json' })
                    );
                }
            } catch (err) {
                console.error('Auto-unlock en beforeunload falló:', err);
            }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, []);
};
