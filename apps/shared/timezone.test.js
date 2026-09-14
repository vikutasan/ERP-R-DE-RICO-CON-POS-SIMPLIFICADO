/**
 * v20 (Fase 20.3): tests de las utilidades de zona horaria del frontend.
 *
 * Verifican el principio "Store UTC, Display Local": un timestamp UTC naive
 * del backend debe formatearse en la zona del negocio (America/Mexico_City).
 */
import { describe, it, expect } from 'vitest';
import {
    DEFAULT_TIMEZONE,
    normalizeTimezone,
    parseUtc,
    formatLocal,
    formatLocalTime,
    formatLocalDate,
    todayLocal,
} from './timezone';

const MX = 'America/Mexico_City';

describe('normalizeTimezone', () => {
    it('devuelve la zona por defecto si el valor es vacio/nulo', () => {
        expect(normalizeTimezone(null)).toBe(DEFAULT_TIMEZONE);
        expect(normalizeTimezone(undefined)).toBe(DEFAULT_TIMEZONE);
        expect(normalizeTimezone('')).toBe(DEFAULT_TIMEZONE);
        expect(normalizeTimezone('   ')).toBe(DEFAULT_TIMEZONE);
    });

    it('acepta una zona IANA valida', () => {
        expect(normalizeTimezone(MX)).toBe(MX);
        expect(normalizeTimezone('UTC')).toBe('UTC');
    });

    it('cae al default si la zona es invalida', () => {
        expect(normalizeTimezone('No/Existe')).toBe(DEFAULT_TIMEZONE);
        expect(normalizeTimezone('Mexico_City')).toBe(DEFAULT_TIMEZONE);
    });

    it('ignora valores no-string', () => {
        expect(normalizeTimezone(123)).toBe(DEFAULT_TIMEZONE);
        expect(normalizeTimezone({})).toBe(DEFAULT_TIMEZONE);
    });
});

describe('parseUtc', () => {
    it('trata un string naive como UTC (anexa Z)', () => {
        const d = parseUtc('2026-09-14T05:24:49.121932');
        expect(d).toBeInstanceOf(Date);
        expect(d.toISOString()).toBe('2026-09-14T05:24:49.121Z');
    });

    it('respeta un string que ya trae Z', () => {
        const d = parseUtc('2026-09-14T05:24:49Z');
        expect(d.toISOString()).toBe('2026-09-14T05:24:49.000Z');
    });

    it('respeta un string con offset explicito', () => {
        const d = parseUtc('2026-09-14T05:24:49-06:00');
        expect(d.toISOString()).toBe('2026-09-14T11:24:49.000Z');
    });

    it('acepta un Date y lo devuelve', () => {
        const src = new Date('2026-09-14T05:24:49Z');
        expect(parseUtc(src)).toBe(src);
    });

    it('acepta epoch ms numerico', () => {
        const d = parseUtc(1757830000000);
        expect(d).toBeInstanceOf(Date);
    });

    it('devuelve null para valores invalidos', () => {
        expect(parseUtc(null)).toBeNull();
        expect(parseUtc(undefined)).toBeNull();
        expect(parseUtc('')).toBeNull();
        expect(parseUtc('no-es-fecha')).toBeNull();
        expect(parseUtc({})).toBeNull();
    });
});

describe('formatLocalTime', () => {
    it('convierte UTC a hora local de Mexico (UTC-6)', () => {
        // 10:00 UTC -> 04:00 CST
        expect(formatLocalTime('2026-09-14T10:00:00', MX)).toBe('04:00');
    });

    it('maneja el cruce de medianoche hacia el dia anterior', () => {
        // 03:00 UTC -> 21:00 del dia anterior
        expect(formatLocalTime('2026-09-14T03:00:00', MX)).toBe('21:00');
    });

    it('devuelve UTC tal cual si la zona es UTC', () => {
        expect(formatLocalTime('2026-09-14T10:00:00', 'UTC')).toBe('10:00');
    });

    it('devuelve cadena vacia para valores invalidos', () => {
        expect(formatLocalTime(null, MX)).toBe('');
        expect(formatLocalTime('basura', MX)).toBe('');
    });
});

describe('formatLocalDate', () => {
    it('convierte UTC a fecha local YYYY-MM-DD', () => {
        expect(formatLocalDate('2026-09-14T10:00:00', MX)).toBe('2026-09-14');
    });

    it('retrocede un dia si el UTC cae antes de las 06:00', () => {
        // 03:00 UTC del 14 -> 21:00 del 13 en Mexico
        expect(formatLocalDate('2026-09-14T03:00:00', MX)).toBe('2026-09-13');
    });

    it('devuelve cadena vacia para valores invalidos', () => {
        expect(formatLocalDate(null, MX)).toBe('');
    });
});

describe('formatLocal', () => {
    it('formatea fecha y hora completas en la zona del negocio', () => {
        const out = formatLocal('2026-09-14T10:00:00', MX);
        expect(out).toContain('2026');
        expect(out).toContain('04:00');
    });

    it('acepta opciones personalizadas', () => {
        const out = formatLocal('2026-09-14T10:00:00', MX, {
            year: undefined,
            month: undefined,
            day: undefined,
            hour: '2-digit',
            minute: '2-digit',
            second: undefined,
        });
        expect(out).toBe('04:00');
    });

    it('devuelve cadena vacia para valores invalidos', () => {
        expect(formatLocal(null, MX)).toBe('');
    });
});

describe('todayLocal', () => {
    it('devuelve una fecha YYYY-MM-DD valida', () => {
        const out = todayLocal(MX);
        expect(out).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('usa la zona por defecto si no se provee', () => {
        const out = todayLocal();
        expect(out).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
});
