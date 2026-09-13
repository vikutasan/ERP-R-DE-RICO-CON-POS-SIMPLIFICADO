/**
 * useTiendaCajaMode.js — Switch Kiosco/Caja de la Tienda Interactiva (V14, Fase 14.3).
 *
 * Modos:
 *   - KIOSCO (default): el cliente arma su helado y envía la pre-comanda directo al KDS.
 *   - CAJA: el empleado arma, revisa y cobra (flujo del POS de Heladería).
 *
 * BLINDAJE (prohibiciones absolutas del POS):
 *   - NO toca `terminal_locks` del POS. El modo Caja es SOLO de la Tienda.
 *   - NO usa timers ni auto-save.
 *   - Persiste en `sessionStorage` (NO `localStorage`): si el kiosco se reinicia,
 *     vuelve a modo Kiosco por defecto (más seguro). Ver Nota de Diseño #4 del plan V14.
 *
 * CONTRATO REPLICADO (NO importado):
 *   Se replica el contrato de props de `apps/pos/components/GestorDeCaja.jsx`
 *   (`onCajaHabilitada` / `onCajaDeshabilitada`) SIN importarlo, porque ese
 *   componente vive en `apps/pos/` y es UI con estado: importarlo rompería la
 *   Barrera 1 de aislamiento. Esta es la estrategia única aprobada (Nota #5 del
 *   plan maestro y Nota #1 del plan V14).
 */
import { useState, useCallback, useEffect } from 'react';

const STORAGE_KEY = 'heladeria_tienda_caja_mode';

/** Modos válidos. Cualquier otro valor se normaliza a KIOSCO. */
export const TIENDA_MODES = {
    KIOSCO: 'KIOSCO',
    CAJA: 'CAJA',
};

/**
 * Lee el modo persistido. Tolerante a `sessionStorage` corrupto o ausente
 * (SSR, modo privado, cuota llena). Nunca lanza.
 */
function leerModoPersistido() {
    try {
        if (typeof window === 'undefined' || !window.sessionStorage) return TIENDA_MODES.KIOSCO;
        const raw = window.sessionStorage.getItem(STORAGE_KEY);
        return raw === TIENDA_MODES.CAJA ? TIENDA_MODES.CAJA : TIENDA_MODES.KIOSCO;
    } catch (_) {
        return TIENDA_MODES.KIOSCO;
    }
}

/** Escribe el modo. Nunca lanza (cuota llena / modo privado). */
function persistirModo(modo) {
    try {
        if (typeof window === 'undefined' || !window.sessionStorage) return;
        window.sessionStorage.setItem(STORAGE_KEY, modo);
    } catch (_) {
        /* silencioso: el modo sigue vivo en memoria */
    }
}

/**
 * Hook del switch Kiosco/Caja.
 *
 * @param {Object} [options]
 * @param {Function} [options.onCajaHabilitada]   — callback al pasar a CAJA (contrato replicado de GestorDeCaja).
 * @param {Function} [options.onCajaDeshabilitada] — callback al volver a KIOSCO (contrato replicado de GestorDeCaja).
 * @returns {{
 *   mode: string,
 *   isCajaEnabled: boolean,
 *   isKiosco: boolean,
 *   enableCaja: (sessionId?: string) => void,
 *   disableCaja: () => void,
 *   toggleCaja: (sessionId?: string) => void,
 * }}
 */
export function useTiendaCajaMode({ onCajaHabilitada, onCajaDeshabilitada } = {}) {
    const [mode, setMode] = useState(leerModoPersistido);

    // Sincroniza el estado inicial con lo persistido (por si otra pestaña lo cambió).
    useEffect(() => {
        setMode(leerModoPersistido());
    }, []);

    const enableCaja = useCallback((sessionId = null) => {
        setMode(TIENDA_MODES.CAJA);
        persistirModo(TIENDA_MODES.CAJA);
        // NO se toca terminal_locks del POS. Solo se notifica al consumidor.
        if (typeof onCajaHabilitada === 'function') {
            try {
                onCajaHabilitada({ sessionId });
            } catch (_) {
                /* un fallo del consumidor jamás debe romper la Tienda */
            }
        }
    }, [onCajaHabilitada]);

    const disableCaja = useCallback(() => {
        setMode(TIENDA_MODES.KIOSCO);
        persistirModo(TIENDA_MODES.KIOSCO);
        if (typeof onCajaDeshabilitada === 'function') {
            try {
                onCajaDeshabilitada();
            } catch (_) {
                /* silencioso */
            }
        }
    }, [onCajaDeshabilitada]);

    const toggleCaja = useCallback((sessionId = null) => {
        setMode((prev) => {
            const siguiente = prev === TIENDA_MODES.CAJA ? TIENDA_MODES.KIOSCO : TIENDA_MODES.CAJA;
            persistirModo(siguiente);
            if (siguiente === TIENDA_MODES.CAJA) {
                if (typeof onCajaHabilitada === 'function') {
                    try { onCajaHabilitada({ sessionId }); } catch (_) { /* silencioso */ }
                }
            } else if (typeof onCajaDeshabilitada === 'function') {
                try { onCajaDeshabilitada(); } catch (_) { /* silencioso */ }
            }
            return siguiente;
        });
    }, [onCajaHabilitada, onCajaDeshabilitada]);

    return {
        mode,
        isCajaEnabled: mode === TIENDA_MODES.CAJA,
        isKiosco: mode === TIENDA_MODES.KIOSCO,
        enableCaja,
        disableCaja,
        toggleCaja,
    };
}

export default useTiendaCajaMode;
