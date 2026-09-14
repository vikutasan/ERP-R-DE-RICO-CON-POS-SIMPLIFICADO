/**
 * v20 (Fase 20.3): Contexto de zona horaria del frontend.
 *
 * Provee la zona horaria del negocio (business_timezone) a toda la app, junto
 * con helpers de formateo ya ligados a esa zona. Se obtiene del endpoint
 * GET /api/v1/settings/timezone (creado en la Fase 20.0).
 *
 * USO:
 *   const { timezone, formatLocal, formatLocalTime, formatLocalDate } = useTimezone();
 *   <span>{formatLocalTime(ticket.created_at)}</span>
 *
 * FALLBACK: si el endpoint falla o aun no responde, se usa America/Mexico_City
 * (DEFAULT_TIMEZONE) para no bloquear el render ni mostrar horas incorrectas.
 */
import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react';
import { CONFIG } from './config';
import {
    DEFAULT_TIMEZONE,
    normalizeTimezone,
    formatLocal as _formatLocal,
    formatLocalTime as _formatLocalTime,
    formatLocalDate as _formatLocalDate,
    todayLocal as _todayLocal,
} from './timezone';

const TimezoneContext = createContext(null);

/**
 * Provider que resuelve y expone la zona horaria del negocio.
 * @param {{ children: React.ReactNode, initialTimezone?: string }} props
 */
export function TimezoneProvider({ children, initialTimezone }) {
    const [timezone, setTimezone] = useState(() => normalizeTimezone(initialTimezone));
    const [offsetHours, setOffsetHours] = useState(null);
    const [ready, setReady] = useState(false);

    useEffect(() => {
        let cancelled = false;

        const fetchTimezone = async () => {
            try {
                const res = await fetch(`${CONFIG.API_BASE_URL}/settings/timezone`);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data = await res.json();
                if (cancelled) return;
                setTimezone(normalizeTimezone(data?.timezone));
                setOffsetHours(
                    typeof data?.offset_hours === 'number' ? data.offset_hours : null
                );
            } catch {
                // Fallback silencioso: la app sigue funcionando con la zona por defecto.
                if (!cancelled) setTimezone(DEFAULT_TIMEZONE);
            } finally {
                if (!cancelled) setReady(true);
            }
        };

        fetchTimezone();
        return () => {
            cancelled = true;
        };
    }, []);

    // Helpers ligados a la zona actual (memoizados para no recrear en cada render).
    const formatLocal = useCallback(
        (value, options) => _formatLocal(value, timezone, options),
        [timezone]
    );
    const formatLocalTime = useCallback(
        (value) => _formatLocalTime(value, timezone),
        [timezone]
    );
    const formatLocalDate = useCallback(
        (value) => _formatLocalDate(value, timezone),
        [timezone]
    );
    const todayLocal = useCallback(() => _todayLocal(timezone), [timezone]);

    const value = useMemo(
        () => ({
            timezone,
            offsetHours,
            ready,
            formatLocal,
            formatLocalTime,
            formatLocalDate,
            todayLocal,
        }),
        [timezone, offsetHours, ready, formatLocal, formatLocalTime, formatLocalDate, todayLocal]
    );

    return <TimezoneContext.Provider value={value}>{children}</TimezoneContext.Provider>;
}

/**
 * Hook de acceso al contexto de zona horaria.
 * Si se usa fuera del provider, devuelve un fallback funcional (no lanza) para
 * no romper componentes que se rendericen aislados (p.ej. en tests).
 */
export function useTimezone() {
    const ctx = useContext(TimezoneContext);
    if (ctx) return ctx;

    // Fallback: helpers ligados a la zona por defecto.
    return {
        timezone: DEFAULT_TIMEZONE,
        offsetHours: null,
        ready: false,
        formatLocal: (value, options) => _formatLocal(value, DEFAULT_TIMEZONE, options),
        formatLocalTime: (value) => _formatLocalTime(value, DEFAULT_TIMEZONE),
        formatLocalDate: (value) => _formatLocalDate(value, DEFAULT_TIMEZONE),
        todayLocal: () => _todayLocal(DEFAULT_TIMEZONE),
    };
}

export default TimezoneContext;
