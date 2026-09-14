/**
 * totemSequencer.test.js — Guardián del contrato del Display Tótem (V16, Fase 16.1).
 *
 * Estos tests fallan si alguien cambia la semántica de la secuenciación, los
 * límites de configuración o la validación de archivos. Son la red de seguridad
 * del módulo puro `totemSequencer.js`.
 */

import { describe, it, expect } from 'vitest';
import {
    TRANSITION,
    FORMAT,
    VALID_TRANSITIONS,
    VALID_FORMATS,
    MIN_MACRO_COUNT,
    MAX_MACRO_COUNT,
    MIN_DURATION_SEC,
    MAX_DURATION_SEC,
    MIN_TRANSITION_MS,
    MAX_TRANSITION_MS,
    MAX_IMAGE_BYTES,
    ALLOWED_IMAGE_TYPES,
    DEFAULT_TOTEM_CONFIG,
    normalizeTotemConfig,
    normalizeTotemManifest,
    buildSequence,
    totalDurationSec,
    validateImageFile,
} from './totemSequencer';

// ─────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────

const MACRO_A = { id: 'm1', filename: 'a.jpg', url: '/media/totem/a.jpg', label: 'Textura', accentColor: '#ff0000' };
const MACRO_B = { id: 'm2', filename: 'b.jpg', url: '/media/totem/b.jpg', label: 'Chispas', accentColor: '#00ff00' };
const HERO_A = { id: 'h1', filename: 'h1.jpg', url: '/media/totem/h1.jpg', label: 'Cono', accentColor: '#0000ff' };
const HERO_B = { id: 'h2', filename: 'h2.jpg', url: '/media/totem/h2.jpg', label: 'Vaso', accentColor: '#ffff00' };

// ─────────────────────────────────────────────────────────────
// Constantes
// ─────────────────────────────────────────────────────────────

describe('Constantes del contrato', () => {
    it('TRANSITION tiene exactamente 3 valores finitos', () => {
        expect(Object.keys(TRANSITION)).toHaveLength(3);
        expect(VALID_TRANSITIONS).toEqual(['fade', 'slide', 'zoom']);
    });

    it('FORMAT tiene 2 valores', () => {
        expect(VALID_FORMATS).toEqual(['vertical', 'horizontal']);
    });

    it('los límites son coherentes', () => {
        expect(MIN_MACRO_COUNT).toBeLessThan(MAX_MACRO_COUNT);
        expect(MIN_DURATION_SEC).toBeLessThan(MAX_DURATION_SEC);
        expect(MIN_TRANSITION_MS).toBeLessThan(MAX_TRANSITION_MS);
    });

    it('MAX_IMAGE_BYTES es 8 MB', () => {
        expect(MAX_IMAGE_BYTES).toBe(8 * 1024 * 1024);
    });

    it('ALLOWED_IMAGE_TYPES incluye JPEG, PNG y WebP', () => {
        expect(ALLOWED_IMAGE_TYPES).toContain('image/jpeg');
        expect(ALLOWED_IMAGE_TYPES).toContain('image/png');
        expect(ALLOWED_IMAGE_TYPES).toContain('image/webp');
    });

    it('DEFAULT_TOTEM_CONFIG espeja el seed de la Fase 16.0', () => {
        expect(DEFAULT_TOTEM_CONFIG).toEqual({
            macroCount: 3,
            macroDurationSec: 4,
            heroDurationSec: 6,
            transition: 'fade',
            transitionMs: 800,
            format: 'vertical',
            accentColor: '#fbbf24',
        });
    });
});

// ─────────────────────────────────────────────────────────────
// normalizeTotemConfig
// ─────────────────────────────────────────────────────────────

describe('normalizeTotemConfig', () => {
    it('devuelve los defaults con entrada vacía', () => {
        expect(normalizeTotemConfig({})).toEqual(DEFAULT_TOTEM_CONFIG);
    });

    it('devuelve los defaults con null/undefined', () => {
        expect(normalizeTotemConfig(null)).toEqual(DEFAULT_TOTEM_CONFIG);
        expect(normalizeTotemConfig(undefined)).toEqual(DEFAULT_TOTEM_CONFIG);
    });

    it('clampea macroCount al rango', () => {
        expect(normalizeTotemConfig({ macroCount: 0 }).macroCount).toBe(MIN_MACRO_COUNT);
        expect(normalizeTotemConfig({ macroCount: 999 }).macroCount).toBe(MAX_MACRO_COUNT);
        expect(normalizeTotemConfig({ macroCount: 5 }).macroCount).toBe(5);
    });

    it('clampea las duraciones al rango', () => {
        expect(normalizeTotemConfig({ macroDurationSec: 0 }).macroDurationSec).toBe(MIN_DURATION_SEC);
        expect(normalizeTotemConfig({ heroDurationSec: 99 }).heroDurationSec).toBe(MAX_DURATION_SEC);
    });

    it('clampea transitionMs al rango', () => {
        expect(normalizeTotemConfig({ transitionMs: 10 }).transitionMs).toBe(MIN_TRANSITION_MS);
        expect(normalizeTotemConfig({ transitionMs: 99999 }).transitionMs).toBe(MAX_TRANSITION_MS);
    });

    it('rechaza transición inválida y usa el default', () => {
        expect(normalizeTotemConfig({ transition: 'explode' }).transition).toBe(DEFAULT_TOTEM_CONFIG.transition);
        expect(normalizeTotemConfig({ transition: 'slide' }).transition).toBe('slide');
    });

    it('rechaza formato inválido y usa el default (corrige D12)', () => {
        expect(normalizeTotemConfig({ format: 'diagonal' }).format).toBe(DEFAULT_TOTEM_CONFIG.format);
        expect(normalizeTotemConfig({ format: 'horizontal' }).format).toBe('horizontal');
    });

    it('valida el color hexadecimal', () => {
        expect(normalizeTotemConfig({ accentColor: '#ABCDEF' }).accentColor).toBe('#abcdef');
        expect(normalizeTotemConfig({ accentColor: 'rojo' }).accentColor).toBe(DEFAULT_TOTEM_CONFIG.accentColor);
        expect(normalizeTotemConfig({ accentColor: '#fff' }).accentColor).toBe(DEFAULT_TOTEM_CONFIG.accentColor);
    });

    it('ignora valores no numéricos', () => {
        expect(normalizeTotemConfig({ macroCount: 'abc' }).macroCount).toBe(DEFAULT_TOTEM_CONFIG.macroCount);
    });
});

// ─────────────────────────────────────────────────────────────
// normalizeTotemManifest
// ─────────────────────────────────────────────────────────────

describe('normalizeTotemManifest', () => {
    it('devuelve estructura vacía con entrada inválida', () => {
        const m = normalizeTotemManifest(null);
        expect(m.macros).toEqual([]);
        expect(m.heroes).toEqual([]);
        expect(m.config).toEqual(DEFAULT_TOTEM_CONFIG);
    });

    it('conserva imágenes válidas', () => {
        const m = normalizeTotemManifest({ macros: [MACRO_A], heroes: [HERO_A] });
        expect(m.macros).toHaveLength(1);
        expect(m.macros[0].url).toBe('/media/totem/a.jpg');
        expect(m.heroes).toHaveLength(1);
    });

    it('descarta entradas sin url', () => {
        const m = normalizeTotemManifest({ macros: [{ id: 'x' }, MACRO_A, null] });
        expect(m.macros).toHaveLength(1);
    });

    it('asigna id por defecto si falta', () => {
        const m = normalizeTotemManifest({ macros: [{ url: '/media/totem/z.jpg' }] });
        expect(m.macros[0].id).toBe('img_0');
    });

    it('normaliza el color de acento individual', () => {
        const m = normalizeTotemManifest({ macros: [{ url: '/x.jpg', accentColor: 'malo' }] });
        expect(m.macros[0].accentColor).toBe(DEFAULT_TOTEM_CONFIG.accentColor);
    });
});

// ─────────────────────────────────────────────────────────────
// buildSequence
// ─────────────────────────────────────────────────────────────

describe('buildSequence', () => {
    it('devuelve vacío si no hay imágenes', () => {
        expect(buildSequence([], [], {})).toEqual([]);
    });

    it('solo macros cuando no hay heroes', () => {
        const seq = buildSequence([MACRO_A, MACRO_B], [], { macroDurationSec: 4 });
        expect(seq).toHaveLength(2);
        expect(seq.every((s) => s.kind === 'macro')).toBe(true);
        expect(seq[0].durationSec).toBe(4);
    });

    it('solo heroes cuando no hay macros', () => {
        const seq = buildSequence([], [HERO_A, HERO_B], { heroDurationSec: 6 });
        expect(seq).toHaveLength(2);
        expect(seq.every((s) => s.kind === 'hero')).toBe(true);
        expect(seq[0].durationSec).toBe(6);
    });

    it('intercala macroCount macros por cada hero', () => {
        const seq = buildSequence([MACRO_A, MACRO_B], [HERO_A], { macroCount: 2 });
        // Cada imagen aparece UNA sola vez: 2 macros + 1 hero = 3 pasos.
        expect(seq).toHaveLength(3);
        expect(seq.filter((s) => s.kind === 'hero')).toHaveLength(1);
        expect(seq.filter((s) => s.kind === 'macro')).toHaveLength(2);
    });

    it('con 4 macros y 2 heroes y macroCount=2 produce 6 pasos', () => {
        const macros = [MACRO_A, MACRO_B, { ...MACRO_A, id: 'm3' }, { ...MACRO_B, id: 'm4' }];
        const seq = buildSequence(macros, [HERO_A, HERO_B], { macroCount: 2 });
        expect(seq).toHaveLength(6);
        expect(seq.filter((s) => s.kind === 'hero')).toHaveLength(2);
        expect(seq.filter((s) => s.kind === 'macro')).toHaveLength(4);
    });

    it('el primer hero aparece tras macroCount macros', () => {
        const seq = buildSequence([MACRO_A, MACRO_B], [HERO_A], { macroCount: 2 });
        expect(seq[0].kind).toBe('macro');
        expect(seq[1].kind).toBe('macro');
        expect(seq[2].kind).toBe('hero');
    });

    it('no entra en bucle infinito con listas pequeñas', () => {
        const seq = buildSequence([MACRO_A], [HERO_A], { macroCount: 10 });
        expect(seq.length).toBeGreaterThan(0);
        expect(seq.length).toBeLessThan(100);
    });

    it('cada paso tiene image y durationSec', () => {
        const seq = buildSequence([MACRO_A], [HERO_A], {});
        seq.forEach((step) => {
            expect(step.image).toBeDefined();
            expect(typeof step.durationSec).toBe('number');
        });
    });
});

// ─────────────────────────────────────────────────────────────
// totalDurationSec
// ─────────────────────────────────────────────────────────────

describe('totalDurationSec', () => {
    it('devuelve 0 para entrada inválida', () => {
        expect(totalDurationSec(null)).toBe(0);
        expect(totalDurationSec([])).toBe(0);
    });

    it('suma las duraciones', () => {
        const seq = [
            { durationSec: 4 },
            { durationSec: 6 },
            { durationSec: 4 },
        ];
        expect(totalDurationSec(seq)).toBe(14);
    });

    it('ignora duraciones no numéricas', () => {
        expect(totalDurationSec([{ durationSec: 4 }, { durationSec: 'x' }])).toBe(4);
    });
});

// ─────────────────────────────────────────────────────────────
// validateImageFile
// ─────────────────────────────────────────────────────────────

describe('validateImageFile', () => {
    it('rechaza archivo inválido', () => {
        expect(validateImageFile(null).ok).toBe(false);
    });

    it('acepta JPEG, PNG y WebP', () => {
        expect(validateImageFile({ type: 'image/jpeg', size: 1000 }).ok).toBe(true);
        expect(validateImageFile({ type: 'image/png', size: 1000 }).ok).toBe(true);
        expect(validateImageFile({ type: 'image/webp', size: 1000 }).ok).toBe(true);
    });

    it('rechaza tipos no permitidos', () => {
        const r = validateImageFile({ type: 'image/gif', size: 1000 });
        expect(r.ok).toBe(false);
        expect(r.error).toMatch(/Formato/);
    });

    it('rechaza archivos mayores a 8 MB', () => {
        const r = validateImageFile({ type: 'image/png', size: MAX_IMAGE_BYTES + 1 });
        expect(r.ok).toBe(false);
        expect(r.error).toMatch(/8 MB/);
    });

    it('acepta exactamente 8 MB', () => {
        expect(validateImageFile({ type: 'image/png', size: MAX_IMAGE_BYTES }).ok).toBe(true);
    });
});
