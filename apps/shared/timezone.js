/**
 * v20 (Fase 20.3): Utilidades de zona horaria del frontend.
 *
 * PRINCIPIO RECTOR: "Store UTC, Display Local".
 *   - El backend SIEMPRE persiste timestamps en UTC (naive, sin tzinfo).
 *   - El frontend SIEMPRE los formatea en la zona horaria del negocio
 *     (business_timezone, p.ej. America/Mexico_City).
 *
 * PROBLEMA QUE RESUELVE:
 *   Antes de V20, el frontend hacia `new Date(created_at)` sobre un string UTC
 *   naive (sin 'Z'). El navegador lo interpretaba como hora LOCAL, por lo que
 *   un ticket creado a las 10:00 UTC se mostraba como "10:00" en lugar de
 *   "04:00" (CST). El KDS calculaba "6 horas de antiguedad" en tickets nuevos.
 *
 * CONTRATO DE ENTRADA:
 *   Los timestamps del backend llegan como string ISO SIN sufijo de zona
 *   (p.ej. "2026-09-14T05:24:49.121932"). Estas utilidades los tratan como UTC
 *   y los convierten a la zona del negocio para MOSTRARLOS.
 *
 * IMPORTANTE: estas funciones son PURAS y no dependen de React, para poder
 * testearlas con vitest sin montar componentes.
 */

/** Zona horaria por defecto si no se provee ninguna (Toluca, Mexico). */
export const DEFAULT_TIMEZONE = 'America/Mexico_City';

/**
 * Normaliza un nombre de zona horaria a uno valido para Intl.
 * Si el valor es vacio, nulo o invalido, devuelve DEFAULT_TIMEZONE.
 *
 * @param {string} tz - Nombre IANA (p.ej. "America/Mexico_City").
 * @returns {string} Zona horaria valida.
 */
export function normalizeTimezone(tz) {
    if (!tz || typeof tz !== 'string') return DEFAULT_TIMEZONE;
    const trimmed = tz.trim();
    if (!trimmed) return DEFAULT_TIMEZONE;
    try {
        // Valida que Intl reconozca la zona; si no, lanza RangeError.
        Intl.DateTimeFormat('en-US', { timeZone: trimmed });
        return trimmed;
    } catch {
        return DEFAULT_TIMEZONE;
    }
}

/**
 * Convierte un timestamp del backend (UTC naive o ISO con zona) a un Date
 * cuyo instante absoluto es correcto.
 *
 * Reglas:
 *   - Si el string YA trae zona (termina en 'Z' o tiene +/-HH:MM), se respeta.
 *   - Si es naive (sin zona), se asume UTC y se le anexa 'Z'.
 *   - Si es un Date, se devuelve tal cual.
 *   - Si es numero (epoch ms), se usa directamente.
 *
 * @param {string|number|Date} value - Timestamp del backend.
 * @returns {Date|null} Date con el instante correcto, o null si es invalido.
 */
export function parseUtc(value) {
    if (value === null || value === undefined || value === '') return null;
    if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
    if (typeof value === 'number') {
        const d = new Date(value);
        return isNaN(d.getTime()) ? null : d;
    }
    if (typeof value !== 'string') return null;

    let s = value.trim();
    if (!s) return null;

    // Detecta si ya trae informacion de zona horaria.
    const hasZone = /[zZ]$/.test(s) || /[+-]\d{2}:?\d{2}$/.test(s);
    if (!hasZone) {
        // Normaliza el separador de espacio a 'T' y anexa 'Z' (UTC).
        s = s.replace(' ', 'T');
        s = `${s}Z`;
    }

    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
}

/**
 * Formatea un timestamp UTC a la zona del negocio.
 *
 * @param {string|number|Date} value - Timestamp del backend (UTC).
 * @param {string} tz - Zona horaria del negocio.
 * @param {Intl.DateTimeFormatOptions} options - Opciones de formato.
 * @returns {string} Cadena formateada, o '' si el valor es invalido.
 */
export function formatLocal(value, tz = DEFAULT_TIMEZONE, options = {}) {
    const d = parseUtc(value);
    if (!d) return '';
    const zone = normalizeTimezone(tz);
    const opts = {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
        ...options,
        timeZone: zone,
    };
    try {
        return new Intl.DateTimeFormat('es-MX', opts).format(d);
    } catch {
        return d.toISOString();
    }
}

/**
 * Formatea SOLO la hora (HH:MM) de un timestamp UTC en la zona del negocio.
 *
 * @param {string|number|Date} value - Timestamp del backend (UTC).
 * @param {string} tz - Zona horaria del negocio.
 * @returns {string} Hora local "HH:MM", o '' si el valor es invalido.
 */
export function formatLocalTime(value, tz = DEFAULT_TIMEZONE) {
    return formatLocal(value, tz, {
        year: undefined,
        month: undefined,
        day: undefined,
        hour: '2-digit',
        minute: '2-digit',
        second: undefined,
        hour12: false,
    });
}

/**
 * Formatea SOLO la fecha (YYYY-MM-DD) de un timestamp UTC en la zona del negocio.
 * Usa 'en-CA' porque produce el formato ISO YYYY-MM-DD de forma nativa.
 *
 * @param {string|number|Date} value - Timestamp del backend (UTC).
 * @param {string} tz - Zona horaria del negocio.
 * @returns {string} Fecha local "YYYY-MM-DD", o '' si el valor es invalido.
 */
export function formatLocalDate(value, tz = DEFAULT_TIMEZONE) {
    const d = parseUtc(value);
    if (!d) return '';
    const zone = normalizeTimezone(tz);
    try {
        return new Intl.DateTimeFormat('en-CA', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            timeZone: zone,
        }).format(d);
    } catch {
        return d.toISOString().slice(0, 10);
    }
}

/**
 * Devuelve la fecha local "hoy" (YYYY-MM-DD) en la zona del negocio.
 * Util para filtros por defecto (p.ej. Monitor de Red).
 *
 * @param {string} tz - Zona horaria del negocio.
 * @returns {string} Fecha local "YYYY-MM-DD".
 */
export function todayLocal(tz = DEFAULT_TIMEZONE) {
    return formatLocalDate(new Date(), tz);
}
