/**
 * Módulo: Monitoreo de Red — Clasificadores puros
 * v13 (Fase 13.1): funciones puras extraídas de NetworkMonitorUI.jsx.
 *
 * REGLA DE ORO: este archivo NO importa React, NO toca el DOM y NO hace fetch.
 * Son funciones deterministas: misma entrada => misma salida. Esto las hace
 * testeables con vitest sin montar componentes ni simular red.
 *
 * Gobernado por: DOCUMENTACION_MODULO_MONITOREO_DE_RED.md
 */

// Estados posibles de una terminal en el dashboard.
export const TERMINAL_STATUS = {
    ONLINE: 'online',
    CASH_OPEN: 'cash_open',
    STALE: 'stale',
    IDLE: 'idle',
};

// Severidad de un evento de desconexión.
export const DISCONNECT_SEVERITY = {
    NORMAL: 'normal',
    SUSPICIOUS: 'suspicious',
};

// TTL del lock de terminal (minutos) + margen. Debe coincidir con
// pos_terminal_lock_ttl_m (20) + 5 min de holgura.
export const LOCK_TTL_MINUTES = 25;

// Ventana (ms) para considerar una reconexión como "rápida" (no sospechosa).
export const RECONNECT_WINDOW_MS = 120000;

/**
 * Normaliza un string de fecha UTC agregando 'Z' si no trae zona.
 * v12 (Fase 12.4): la API ya normaliza con 'Z'; este parche es defensivo
 * para no depender del navegador (que interpretaría sin 'Z' como hora local).
 *
 * @param {string|null|undefined} value
 * @returns {string|null}
 */
export const normalizeUtcString = (value) => {
    if (!value) return null;
    const str = String(value);
    // Ya trae zona si termina en 'Z' o si tras la hora hay un offset (+HH:MM / -HH:MM).
    // Se busca el offset solo después de la 'T' para no confundirlo con los guiones de la fecha.
    const timePart = str.includes('T') ? str.slice(str.indexOf('T')) : str;
    const hasOffset = str.endsWith('Z') || timePart.includes('+') || timePart.includes('-');
    return hasOffset ? str : str + 'Z';
};

/**
 * Clasifica el estado de una terminal a partir de la info cruda de la API.
 *
 * @param {object|null|undefined} info - registro de la terminal (occupier_id, stale_session, is_cash_register, operator_absent, locked_at)
 * @param {number} nowMs - timestamp actual en ms (inyectable para tests)
 * @param {number} ttlMinutes - TTL del lock en minutos
 * @returns {string} uno de TERMINAL_STATUS
 */
export const classifyTerminalStatus = (info, nowMs = Date.now(), ttlMinutes = LOCK_TTL_MINUTES) => {
    const isOccupied = !!(info && info.occupier_id);
    if (!isOccupied) return TERMINAL_STATUS.IDLE;

    if (info.stale_session) return TERMINAL_STATUS.STALE;

    if (info.is_cash_register && (info.operator_absent || !info.locked_at)) {
        return TERMINAL_STATUS.CASH_OPEN;
    }

    const safeDate = normalizeUtcString(info.locked_at);
    const lockAge = safeDate
        ? (nowMs - new Date(safeDate).getTime()) / 60000
        : 999;

    return lockAge < ttlMinutes ? TERMINAL_STATUS.ONLINE : TERMINAL_STATUS.CASH_OPEN;
};

/**
 * Clasifica la severidad de un evento de desconexión.
 * Una desconexión es "normal" si hubo una reconexión de la MISMA terminal
 * dentro de la ventana (RECONNECT_WINDOW_MS). Los eventos vienen en orden
 * DESC, por lo que la reconexión más reciente está en un índice MENOR.
 *
 * @param {object} evt - evento actual ({ rawType, terminal, timestamp })
 * @param {Array<object>} allEvents - lista completa de eventos
 * @param {number} idx - índice de evt dentro de allEvents
 * @param {number} windowMs - ventana de reconexión en ms
 * @returns {string} DISCONNECT_SEVERITY
 */
export const classifyDisconnectSeverity = (evt, allEvents, idx, windowMs = RECONNECT_WINDOW_MS) => {
    if (!evt || evt.rawType !== 'disconnect') return DISCONNECT_SEVERITY.NORMAL;

    const reconnect = (allEvents || []).find((e, j) =>
        j < idx &&
        e.terminal === evt.terminal &&
        e.rawType === 'reconnect' &&
        Math.abs(e.timestamp - evt.timestamp) < windowMs
    );

    return reconnect ? DISCONNECT_SEVERITY.NORMAL : DISCONNECT_SEVERITY.SUSPICIOUS;
};

/**
 * Aplica classifyDisconnectSeverity a toda la lista, devolviendo una copia
 * con el campo `severity` agregado.
 *
 * @param {Array<object>} events
 * @param {number} windowMs
 * @returns {Array<object>}
 */
export const classifyEvents = (events, windowMs = RECONNECT_WINDOW_MS) =>
    (events || []).map((evt, idx) => ({
        ...evt,
        severity: classifyDisconnectSeverity(evt, events, idx, windowMs),
    }));

/**
 * Cuenta las desconexiones sospechosas por terminal.
 *
 * @param {Array<object>} events - eventos ya clasificados (con `severity`)
 * @returns {Record<string, number>}
 */
export const summarizeSuspiciousIncidents = (events) => {
    const summary = {};
    (events || []).forEach(evt => {
        if (evt.rawType === 'disconnect' && evt.severity === DISCONNECT_SEVERITY.SUSPICIOUS) {
            summary[evt.terminal] = (summary[evt.terminal] || 0) + 1;
        }
    });
    return summary;
};
