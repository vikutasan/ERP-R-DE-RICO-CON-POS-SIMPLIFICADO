/**
 * V15 (Fase 15.1): tests del módulo puro de urgencia del KDS.
 *
 * Patrón "Guardián del contrato": se prueba la lógica sin montar React.
 * Gobernado por: plans/PLAN_HELADERIA_V15_KDS_INTELIGENTE.md (Revisión 2)
 */
import { describe, it, expect } from 'vitest';
import {
    URGENCY_LEVELS,
    DEFAULT_URGENCY_THRESHOLDS,
    DEFAULT_TZ_OFFSET_HOURS,
    normalizeTzOffset,
    normalizeThresholds,
    computeElapsedSec,
    classifyUrgency,
    urgencyColor,
    formatElapsed,
    sortOrdersByUrgency,
    countByUrgency,
} from './kdsUrgency';

const TH = { warningSec: 180, criticalSec: 420 };

// Instante fijo de referencia: 2026-09-14T18:00:00Z
const NOW_MS = Date.parse('2026-09-14T18:00:00Z');

/** Construye un ISO naive (hora local del servidor) a partir de un instante UTC y un offset. */
function naiveIsoFromUtc(utcMs, offsetHours) {
    const localMs = utcMs + offsetHours * 3600000;
    return new Date(localMs).toISOString().replace('Z', '');
}

describe('normalizeTzOffset', () => {
    it('acepta un número válido', () => {
        expect(normalizeTzOffset(-6)).toBe(-6);
        expect(normalizeTzOffset(5)).toBe(5);
    });

    it('acepta un string numérico', () => {
        expect(normalizeTzOffset('6')).toBe(6);
        expect(normalizeTzOffset('6.0')).toBe(6);
    });

    it('cae al default con basura o fuera de rango', () => {
        expect(normalizeTzOffset(null)).toBe(DEFAULT_TZ_OFFSET_HOURS);
        expect(normalizeTzOffset(undefined)).toBe(DEFAULT_TZ_OFFSET_HOURS);
        expect(normalizeTzOffset('abc')).toBe(DEFAULT_TZ_OFFSET_HOURS);
        expect(normalizeTzOffset(-99)).toBe(DEFAULT_TZ_OFFSET_HOURS);
        expect(normalizeTzOffset(99)).toBe(DEFAULT_TZ_OFFSET_HOURS);
    });
});

describe('normalizeThresholds', () => {
    it('devuelve los defaults con null o no-objeto', () => {
        expect(normalizeThresholds(null)).toEqual(DEFAULT_URGENCY_THRESHOLDS);
        expect(normalizeThresholds(undefined)).toEqual(DEFAULT_URGENCY_THRESHOLDS);
        expect(normalizeThresholds('x')).toEqual(DEFAULT_URGENCY_THRESHOLDS);
    });

    it('devuelve los defaults con valores negativos', () => {
        expect(normalizeThresholds({ warningSec: -1, criticalSec: -5 })).toEqual(DEFAULT_URGENCY_THRESHOLDS);
    });

    it('devuelve los defaults si warningSec >= criticalSec', () => {
        expect(normalizeThresholds({ warningSec: 500, criticalSec: 400 })).toEqual(DEFAULT_URGENCY_THRESHOLDS);
        expect(normalizeThresholds({ warningSec: 400, criticalSec: 400 })).toEqual(DEFAULT_URGENCY_THRESHOLDS);
    });

    it('acepta un par válido', () => {
        expect(normalizeThresholds({ warningSec: 60, criticalSec: 120 })).toEqual({ warningSec: 60, criticalSec: 120 });
    });
});

describe('computeElapsedSec', () => {
    it('calcula correctamente con offset 0', () => {
        const iso = naiveIsoFromUtc(NOW_MS - 200000, 0); // hace 200 s
        expect(computeElapsedSec(iso, 0, NOW_MS)).toBe(200);
    });

    it('calcula correctamente con offset -6 (México)', () => {
        const iso = naiveIsoFromUtc(NOW_MS - 300000, -6); // hace 300 s
        expect(computeElapsedSec(iso, -6, NOW_MS)).toBe(300);
    });

    it('calcula correctamente con offset +5', () => {
        const iso = naiveIsoFromUtc(NOW_MS - 120000, 5); // hace 120 s
        expect(computeElapsedSec(iso, 5, NOW_MS)).toBe(120);
    });

    it('devuelve null con ISO inválido o vacío', () => {
        expect(computeElapsedSec('no-es-fecha', 0, NOW_MS)).toBeNull();
        expect(computeElapsedSec('', 0, NOW_MS)).toBeNull();
        expect(computeElapsedSec(null, 0, NOW_MS)).toBeNull();
    });

    it('nunca devuelve negativo (fecha futura → 0)', () => {
        const iso = naiveIsoFromUtc(NOW_MS + 600000, 0); // dentro de 10 min
        expect(computeElapsedSec(iso, 0, NOW_MS)).toBe(0);
    });
});

describe('classifyUrgency', () => {
    it('respeta los límites exactos', () => {
        expect(classifyUrgency(179, TH)).toBe(URGENCY_LEVELS.NORMAL);
        expect(classifyUrgency(180, TH)).toBe(URGENCY_LEVELS.WARNING);
        expect(classifyUrgency(181, TH)).toBe(URGENCY_LEVELS.WARNING);
        expect(classifyUrgency(419, TH)).toBe(URGENCY_LEVELS.WARNING);
        expect(classifyUrgency(420, TH)).toBe(URGENCY_LEVELS.CRITICAL);
        expect(classifyUrgency(421, TH)).toBe(URGENCY_LEVELS.CRITICAL);
    });

    it('devuelve NORMAL con null o no finito', () => {
        expect(classifyUrgency(null, TH)).toBe(URGENCY_LEVELS.NORMAL);
        expect(classifyUrgency(undefined, TH)).toBe(URGENCY_LEVELS.NORMAL);
        expect(classifyUrgency(NaN, TH)).toBe(URGENCY_LEVELS.NORMAL);
    });
});

describe('urgencyColor', () => {
    it('devuelve una paleta por nivel', () => {
        expect(urgencyColor(URGENCY_LEVELS.NORMAL).border).toBe('#22c55e');
        expect(urgencyColor(URGENCY_LEVELS.WARNING).border).toBe('#f59e0b');
        expect(urgencyColor(URGENCY_LEVELS.CRITICAL).border).toBe('#ef4444');
    });

    it('cae a NORMAL con un nivel desconocido', () => {
        expect(urgencyColor('LOQUESEA')).toEqual(urgencyColor(URGENCY_LEVELS.NORMAL));
    });

    it('GUARDIÁN: no devuelve ninguna propiedad de animación (Incidente 16.1)', () => {
        for (const level of Object.values(URGENCY_LEVELS)) {
            const color = urgencyColor(level);
            const keys = Object.keys(color).map((k) => k.toLowerCase());
            expect(keys).not.toContain('animation');
            expect(keys).not.toContain('animate');
            expect(keys).not.toContain('transition');
        }
    });
});

describe('formatElapsed', () => {
    it('formatea segundos, minutos y horas', () => {
        expect(formatElapsed(0)).toBe('0s');
        expect(formatElapsed(59)).toBe('59s');
        expect(formatElapsed(60)).toBe('1m 00s');
        expect(formatElapsed(200)).toBe('3m 20s');
        expect(formatElapsed(3599)).toBe('59m 59s');
        expect(formatElapsed(3600)).toBe('1h 00m');
        expect(formatElapsed(7325)).toBe('2h 02m');
    });

    it('devuelve "—" con null o no finito', () => {
        expect(formatElapsed(null)).toBe('—');
        expect(formatElapsed(NaN)).toBe('—');
    });
});

describe('sortOrdersByUrgency', () => {
    it('ordena CRITICAL → WARNING → NORMAL', () => {
        const orders = [
            { ticket_id: 1, created_at: naiveIsoFromUtc(NOW_MS - 10000, 0) },   // NORMAL
            { ticket_id: 2, created_at: naiveIsoFromUtc(NOW_MS - 600000, 0) },  // CRITICAL
            { ticket_id: 3, created_at: naiveIsoFromUtc(NOW_MS - 200000, 0) },  // WARNING
        ];
        const sorted = sortOrdersByUrgency(orders, TH, 0, NOW_MS);
        expect(sorted.map((o) => o.ticket_id)).toEqual([2, 3, 1]);
    });

    it('desempata por antigüedad (el más viejo primero)', () => {
        const orders = [
            { ticket_id: 1, created_at: naiveIsoFromUtc(NOW_MS - 500000, 0) },
            { ticket_id: 2, created_at: naiveIsoFromUtc(NOW_MS - 900000, 0) },
        ];
        const sorted = sortOrdersByUrgency(orders, TH, 0, NOW_MS);
        expect(sorted.map((o) => o.ticket_id)).toEqual([2, 1]);
    });

    it('GUARDIÁN: no muta el array de entrada', () => {
        const orders = [
            { ticket_id: 1, created_at: naiveIsoFromUtc(NOW_MS - 10000, 0) },
            { ticket_id: 2, created_at: naiveIsoFromUtc(NOW_MS - 600000, 0) },
        ];
        const snapshot = orders.map((o) => o.ticket_id);
        sortOrdersByUrgency(orders, TH, 0, NOW_MS);
        expect(orders.map((o) => o.ticket_id)).toEqual(snapshot);
    });

    it('devuelve [] con entrada no-array', () => {
        expect(sortOrdersByUrgency(null, TH, 0, NOW_MS)).toEqual([]);
    });
});

describe('countByUrgency', () => {
    it('cuenta pedidos por nivel', () => {
        const orders = [
            { ticket_id: 1, created_at: naiveIsoFromUtc(NOW_MS - 10000, 0) },   // NORMAL
            { ticket_id: 2, created_at: naiveIsoFromUtc(NOW_MS - 600000, 0) },  // CRITICAL
            { ticket_id: 3, created_at: naiveIsoFromUtc(NOW_MS - 200000, 0) },  // WARNING
            { ticket_id: 4, created_at: naiveIsoFromUtc(NOW_MS - 700000, 0) },  // CRITICAL
        ];
        expect(countByUrgency(orders, TH, 0, NOW_MS)).toEqual({ NORMAL: 1, WARNING: 1, CRITICAL: 2 });
    });

    it('devuelve ceros con entrada no-array', () => {
        expect(countByUrgency(null, TH, 0, NOW_MS)).toEqual({ NORMAL: 0, WARNING: 0, CRITICAL: 0 });
    });
});
