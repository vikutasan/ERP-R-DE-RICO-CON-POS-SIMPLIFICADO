/**
 * Módulo: Heladería — KDS Inteligente — Lógica pura de urgencia
 * V15 (Fase 15.1): clasificación de urgencia por tiempo transcurrido.
 *
 * REGLA DE ORO: este archivo NO importa React, NO toca el DOM y NO hace fetch.
 * Son funciones deterministas: misma entrada => misma salida. Esto las hace
 * testeables con vitest sin montar componentes ni simular red.
 *
 * Gobernado por: plans/PLAN_HELADERIA_V15_KDS_INTELIGENTE.md (Revisión 2)
 *
 * ⚠️ INCIDENTE 16.1 (Efecto Estrobo): la urgencia se comunica SOLO con COLOR.
 *    PROHIBIDO devolver propiedades de animación (animation/animate/transition).
 *
 * ⚠️ D2 (zona horaria): `created_at` llega del backend como hora LOCAL del
 *    contenedor, SIN sufijo 'Z' ni offset (naive). Por eso NO se usa
 *    `new Date(iso)` directamente; se usa el offset del servidor.
 */

// Niveles de urgencia posibles.
export const URGENCY_LEVELS = {
    NORMAL: 'NORMAL',
    WARNING: 'WARNING',
    CRITICAL: 'CRITICAL',
};

// Umbrales por defecto (segundos). 3 min → WARNING, 7 min → CRITICAL.
export const DEFAULT_URGENCY_THRESHOLDS = {
    warningSec: 180,
    criticalSec: 420,
};

// Offset por defecto (horas) si el setting no existe o es inválido.
export const DEFAULT_TZ_OFFSET_HOURS = 0;

// Rango válido de offsets (UTC-12 .. UTC+14).
const MIN_TZ_OFFSET = -12;
const MAX_TZ_OFFSET = 14;

// Paleta semántica de urgencia. SOLO color — sin animación (Incidente 16.1).
const URGENCY_COLORS = {
    NORMAL: { bg: 'rgba(34,197,94,0.10)', border: '#22c55e', text: '#22c55e', label: 'Normal' },
    WARNING: { bg: 'rgba(245,158,11,0.14)', border: '#f59e0b', text: '#f59e0b', label: 'Atención' },
    CRITICAL: { bg: 'rgba(239,68,68,0.16)', border: '#ef4444', text: '#ef4444', label: 'Crítico' },
};

/**
 * Normaliza el offset de zona horaria del servidor.
 * Acepta número o string numérico. Fuera de rango o inválido → DEFAULT_TZ_OFFSET_HOURS.
 *
 * @param {number|string|null|undefined} raw
 * @returns {number} offset en horas dentro de [-12, 14]
 */
export function normalizeTzOffset(raw) {
    if (raw === null || raw === undefined || raw === '') return DEFAULT_TZ_OFFSET_HOURS;
    const num = typeof raw === 'number' ? raw : Number(String(raw).trim());
    if (!Number.isFinite(num)) return DEFAULT_TZ_OFFSET_HOURS;
    if (num < MIN_TZ_OFFSET || num > MAX_TZ_OFFSET) return DEFAULT_TZ_OFFSET_HOURS;
    return num;
}

/**
 * Normaliza los umbrales de urgencia.
 * Aplica defaults si faltan, son inválidos o están invertidos.
 *
 * @param {object|null|undefined} raw - { warningSec, criticalSec }
 * @returns {{warningSec:number, criticalSec:number}}
 */
export function normalizeThresholds(raw) {
    const fallback = { ...DEFAULT_URGENCY_THRESHOLDS };
    if (!raw || typeof raw !== 'object') return fallback;

    const warning = Number(raw.warningSec);
    const critical = Number(raw.criticalSec);

    const warningOk = Number.isFinite(warning) && warning > 0;
    const criticalOk = Number.isFinite(critical) && critical > 0;

    if (!warningOk && !criticalOk) return fallback;
    if (!warningOk) return { warningSec: fallback.warningSec, criticalSec: critical };
    if (!criticalOk) return { warningSec: warning, criticalSec: fallback.criticalSec };

    // Si están invertidos o son iguales, se descarta el par completo.
    if (warning >= critical) return fallback;

    return { warningSec: warning, criticalSec: critical };
}

/**
 * Calcula los segundos transcurridos desde que se pagó el pedido.
 *
 * El backend emite `created_at` como hora LOCAL del contenedor (naive, sin 'Z').
 * Para obtener el instante UTC real se interpreta el string como UTC ('Z') y se
 * le resta el offset del servidor.
 *
 * @param {string|null|undefined} createdAtNaiveIso - p.ej. "2026-09-14T18:44:27"
 * @param {number} serverOffsetHours - offset del servidor (horas), p.ej. -6
 * @param {number} nowMs - timestamp actual en ms (inyectable para tests)
 * @returns {number|null} segundos transcurridos (>= 0) o null si el ISO es inválido
 */
export function computeElapsedSec(createdAtNaiveIso, serverOffsetHours = DEFAULT_TZ_OFFSET_HOURS, nowMs = Date.now()) {
    if (!createdAtNaiveIso || typeof createdAtNaiveIso !== 'string') return null;

    const offset = normalizeTzOffset(serverOffsetHours);
    const raw = createdAtNaiveIso.trim();
    if (!raw) return null;

    // Se interpreta el naive como UTC y se corrige con el offset del servidor.
    const asUtcMs = Date.parse(raw.endsWith('Z') ? raw : raw + 'Z');
    if (!Number.isFinite(asUtcMs)) return null;

    const createdUtcMs = asUtcMs - offset * 3600000;
    const now = Number.isFinite(nowMs) ? nowMs : Date.now();
    const elapsedSec = Math.floor((now - createdUtcMs) / 1000);

    // Nunca negativo (relojes desincronizados o fecha futura).
    return Math.max(0, elapsedSec);
}

/**
 * Clasifica la urgencia de un pedido según los segundos transcurridos.
 *
 * @param {number|null} elapsedSec
 * @param {object} thresholds - { warningSec, criticalSec }
 * @returns {string} uno de URGENCY_LEVELS
 */
export function classifyUrgency(elapsedSec, thresholds = DEFAULT_URGENCY_THRESHOLDS) {
    if (elapsedSec === null || elapsedSec === undefined || !Number.isFinite(elapsedSec)) {
        return URGENCY_LEVELS.NORMAL;
    }
    const { warningSec, criticalSec } = normalizeThresholds(thresholds);
    if (elapsedSec >= criticalSec) return URGENCY_LEVELS.CRITICAL;
    if (elapsedSec >= warningSec) return URGENCY_LEVELS.WARNING;
    return URGENCY_LEVELS.NORMAL;
}

/**
 * Devuelve la paleta de color para un nivel de urgencia.
 * SOLO color — sin animación (Incidente 16.1).
 *
 * @param {string} level - uno de URGENCY_LEVELS
 * @returns {{bg:string, border:string, text:string, label:string}}
 */
export function urgencyColor(level) {
    return URGENCY_COLORS[level] || URGENCY_COLORS.NORMAL;
}

/**
 * Formatea los segundos transcurridos en texto legible.
 * - < 60 s  → "45s"
 * - < 1 h   → "3m 20s"
 * - >= 1 h  → "1h 05m"  (D9)
 *
 * @param {number|null} elapsedSec
 * @returns {string}
 */
export function formatElapsed(elapsedSec) {
    if (elapsedSec === null || elapsedSec === undefined || !Number.isFinite(elapsedSec)) return '—';
    const total = Math.max(0, Math.floor(elapsedSec));

    if (total < 60) return `${total}s`;

    if (total < 3600) {
        const min = Math.floor(total / 60);
        const sec = total % 60;
        return `${min}m ${String(sec).padStart(2, '0')}s`;
    }

    const hours = Math.floor(total / 3600);
    const min = Math.floor((total % 3600) / 60);
    return `${hours}h ${String(min).padStart(2, '0')}m`;
}

/**
 * Ordena pedidos por urgencia: CRITICAL → WARNING → NORMAL.
 * Desempate: el más antiguo primero. NO muta el array de entrada.
 *
 * @param {Array} orders - pedidos con `created_at`
 * @param {object} thresholds
 * @param {number} serverOffsetHours
 * @param {number} nowMs
 * @returns {Array} nuevo array ordenado
 */
export function sortOrdersByUrgency(orders, thresholds = DEFAULT_URGENCY_THRESHOLDS, serverOffsetHours = DEFAULT_TZ_OFFSET_HOURS, nowMs = Date.now()) {
    if (!Array.isArray(orders)) return [];

    const rank = { CRITICAL: 0, WARNING: 1, NORMAL: 2 };

    return orders
        .map((order, idx) => {
            const elapsedSec = computeElapsedSec(order?.created_at, serverOffsetHours, nowMs);
            const level = classifyUrgency(elapsedSec, thresholds);
            return { order, idx, level, elapsedSec: elapsedSec === null ? -1 : elapsedSec };
        })
        .sort((a, b) => {
            const byLevel = rank[a.level] - rank[b.level];
            if (byLevel !== 0) return byLevel;
            // Desempate: el más antiguo (mayor elapsedSec) primero.
            const byAge = b.elapsedSec - a.elapsedSec;
            if (byAge !== 0) return byAge;
            return a.idx - b.idx; // Estable.
        })
        .map((entry) => entry.order);
}

/**
 * Cuenta pedidos por nivel de urgencia (para el contador del header).
 *
 * @param {Array} orders
 * @param {object} thresholds
 * @param {number} serverOffsetHours
 * @param {number} nowMs
 * @returns {{NORMAL:number, WARNING:number, CRITICAL:number}}
 */
export function countByUrgency(orders, thresholds = DEFAULT_URGENCY_THRESHOLDS, serverOffsetHours = DEFAULT_TZ_OFFSET_HOURS, nowMs = Date.now()) {
    const counts = { NORMAL: 0, WARNING: 0, CRITICAL: 0 };
    if (!Array.isArray(orders)) return counts;

    for (const order of orders) {
        const elapsedSec = computeElapsedSec(order?.created_at, serverOffsetHours, nowMs);
        const level = classifyUrgency(elapsedSec, thresholds);
        counts[level] += 1;
    }
    return counts;
}
