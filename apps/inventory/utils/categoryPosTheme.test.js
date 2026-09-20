/**
 * v8 (POS-THEME): tests del tema visual del recuadro de categoría.
 *
 * Contrato: el FONDO lo dicta el POS (color SÓLIDO); el estado "activa" se
 * expresa con anillo + escala; el estado "oculta" conserva el MISMO color del
 * POS pero diluido al 40%. Así el usuario nunca pierde de vista a qué POS
 * pertenece una categoría.
 */
import { describe, it, expect } from 'vitest';
import {
    DEFAULT_POS_TARGET,
    HIDDEN_OPACITY_CLASS,
    POS_TARGETS,
    POS_TARGET_THEMES,
    buildCategoryTabClasses,
    buildCategoryTabTitle,
    isCategoryVisible,
    normalizePosTarget,
    resolveCategoryPosTheme,
} from './categoryPosTheme';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const CAT_PANADERIA = { id: 1, name: 'Panes', pos_target: 'PANADERIA', vision_enabled: true };
const CAT_HELADERIA = { id: 2, name: 'Bolas de Helado', pos_target: 'HELADERIA', vision_enabled: true };
const CAT_AMBOS = { id: 3, name: 'Postres', pos_target: 'AMBOS', vision_enabled: true };
const CAT_OCULTA = { id: 4, name: 'Temporada', pos_target: 'HELADERIA', vision_enabled: false };

// ─── Contrato de constantes ──────────────────────────────────────────────────

describe('Contrato de constantes', () => {
    it('expone los 3 destinos canónicos de POS', () => {
        expect(POS_TARGETS).toEqual({
            PANADERIA: 'PANADERIA',
            HELADERIA: 'HELADERIA',
            AMBOS: 'AMBOS',
        });
    });

    it('el destino por defecto es PANADERIA (el POS base del ERP)', () => {
        expect(DEFAULT_POS_TARGET).toBe(POS_TARGETS.PANADERIA);
    });

    it('la opacidad del estado oculto es 40%', () => {
        expect(HIDDEN_OPACITY_CLASS).toBe('opacity-40');
    });

    it('cada destino tiene un tema completo y distinto', () => {
        const keys = Object.keys(POS_TARGET_THEMES);
        expect(keys).toEqual(['PANADERIA', 'HELADERIA', 'AMBOS']);

        const fondos = keys.map((k) => POS_TARGET_THEMES[k].bg);
        expect(new Set(fondos).size).toBe(3);

        keys.forEach((k) => {
            const tema = POS_TARGET_THEMES[k];
            expect(tema.key).toBe(k);
            expect(tema.bg).toMatch(/^bg-/);
            expect(tema.text).toMatch(/^text-/);
            expect(tema.ring).toMatch(/^ring-/);
            expect(typeof tema.label).toBe('string');
            expect(typeof tema.shortLabel).toBe('string');
        });
    });

    it('NO se usa borde en ninguna variante (el color ya delimita el recuadro)', () => {
        Object.values(POS_TARGET_THEMES).forEach((tema) => {
            expect(tema.border).toBeUndefined();
        });
    });

    it('NO se usa puntito de color (el fondo sólido ya comunica el POS)', () => {
        Object.values(POS_TARGET_THEMES).forEach((tema) => {
            expect(tema.dot).toBeUndefined();
        });
    });

    it('los colores son SÓLIDOS (tono 700) y los acordados: naranja, rosa y morado', () => {
        expect(POS_TARGET_THEMES.PANADERIA.bg).toBe('bg-orange-700');
        expect(POS_TARGET_THEMES.HELADERIA.bg).toBe('bg-pink-700');
        expect(POS_TARGET_THEMES.AMBOS.bg).toBe('bg-purple-700');
    });

    it('el texto es blanco sobre el fondo sólido (contraste AA)', () => {
        Object.values(POS_TARGET_THEMES).forEach((tema) => {
            expect(tema.text).toBe('text-white');
        });
    });
});

// ─── normalizePosTarget ──────────────────────────────────────────────────────

describe('normalizePosTarget', () => {
    it('acepta los 3 valores canónicos', () => {
        expect(normalizePosTarget('PANADERIA')).toBe('PANADERIA');
        expect(normalizePosTarget('HELADERIA')).toBe('HELADERIA');
        expect(normalizePosTarget('AMBOS')).toBe('AMBOS');
    });

    it('normaliza minúsculas y espacios', () => {
        expect(normalizePosTarget('  heladeria  ')).toBe('HELADERIA');
        expect(normalizePosTarget('ambos')).toBe('AMBOS');
    });

    it('degrada a PANADERIA con valores ausentes o inválidos', () => {
        expect(normalizePosTarget(null)).toBe('PANADERIA');
        expect(normalizePosTarget(undefined)).toBe('PANADERIA');
        expect(normalizePosTarget('')).toBe('PANADERIA');
        expect(normalizePosTarget('CUALQUIERA')).toBe('PANADERIA');
        expect(normalizePosTarget(42)).toBe('PANADERIA');
        expect(normalizePosTarget({})).toBe('PANADERIA');
    });
});

// ─── resolveCategoryPosTheme ─────────────────────────────────────────────────

describe('resolveCategoryPosTheme', () => {
    it('resuelve el tema de cada destino', () => {
        expect(resolveCategoryPosTheme(CAT_PANADERIA)).toBe(POS_TARGET_THEMES.PANADERIA);
        expect(resolveCategoryPosTheme(CAT_HELADERIA)).toBe(POS_TARGET_THEMES.HELADERIA);
        expect(resolveCategoryPosTheme(CAT_AMBOS)).toBe(POS_TARGET_THEMES.AMBOS);
    });

    it('nunca lanza: null, undefined o sin pos_target → Panadería', () => {
        expect(resolveCategoryPosTheme(null)).toBe(POS_TARGET_THEMES.PANADERIA);
        expect(resolveCategoryPosTheme(undefined)).toBe(POS_TARGET_THEMES.PANADERIA);
        expect(resolveCategoryPosTheme({ id: 9, name: 'Sin destino' })).toBe(POS_TARGET_THEMES.PANADERIA);
    });

    it('un pos_target inválido degrada a Panadería', () => {
        expect(resolveCategoryPosTheme({ pos_target: 'INVENTADO' })).toBe(POS_TARGET_THEMES.PANADERIA);
    });
});

// ─── isCategoryVisible ───────────────────────────────────────────────────────

describe('isCategoryVisible', () => {
    it('vision_enabled=true es visible', () => {
        expect(isCategoryVisible(CAT_PANADERIA)).toBe(true);
    });

    it('vision_enabled=false es oculta', () => {
        expect(isCategoryVisible(CAT_OCULTA)).toBe(false);
    });

    it('sin vision_enabled se considera visible (compatibilidad)', () => {
        expect(isCategoryVisible({ id: 5, name: 'Legacy' })).toBe(true);
        expect(isCategoryVisible(null)).toBe(true);
    });
});

// ─── buildCategoryTabClasses ─────────────────────────────────────────────────

describe('buildCategoryTabClasses', () => {
    it('una categoría visible lleva el color SÓLIDO de su POS', () => {
        const clases = buildCategoryTabClasses(CAT_HELADERIA);
        expect(clases).toContain('bg-pink-700');
        expect(clases).toContain('text-white');
        expect(clases).not.toContain(HIDDEN_OPACITY_CLASS);
    });

    it('NO se usa borde en ninguna variante', () => {
        const visible = buildCategoryTabClasses(CAT_HELADERIA);
        const activa = buildCategoryTabClasses(CAT_HELADERIA, { isActive: true });
        const oculta = buildCategoryTabClasses(CAT_OCULTA);
        [visible, activa, oculta].forEach((clases) => {
            expect(clases).not.toMatch(/\bborder-/);
        });
    });

    it('la categoría activa conserva el color del POS y añade anillo + escala', () => {
        const clases = buildCategoryTabClasses(CAT_AMBOS, { isActive: true });
        expect(clases).toContain('bg-purple-700');
        expect(clases).toContain('ring-2');
        expect(clases).toContain('ring-purple-400');
        expect(clases).toContain('scale-105');
    });

    it('la categoría oculta CONSERVA el color de su POS, diluido al 40%', () => {
        const clases = buildCategoryTabClasses(CAT_OCULTA);
        expect(clases).toContain('bg-pink-700');
        expect(clases).toContain(HIDDEN_OPACITY_CLASS);
    });

    it('la categoría oculta NO usa gris ni grayscale (el POS sigue mandando)', () => {
        const clases = buildCategoryTabClasses(CAT_OCULTA);
        expect(clases).not.toContain('grayscale');
        expect(clases).not.toMatch(/\bbg-gray-/);
    });

    it('la categoría oculta y activa conserva el color del POS + anillo', () => {
        const clases = buildCategoryTabClasses(CAT_OCULTA, { isActive: true });
        expect(clases).toContain('bg-pink-700');
        expect(clases).toContain(HIDDEN_OPACITY_CLASS);
        expect(clases).toContain('ring-2');
        expect(clases).not.toMatch(/\bbg-gray-/);
    });

    it('el arrastre atenúa el recuadro', () => {
        const clases = buildCategoryTabClasses(CAT_PANADERIA, { isDragging: true });
        expect(clases).toContain('opacity-30');
    });

    it('sin categoría no lanza y devuelve clases utilizables', () => {
        const clases = buildCategoryTabClasses(null);
        expect(typeof clases).toBe('string');
        expect(clases).toContain('bg-orange-700');
        expect(clases).toContain('cursor-pointer');
    });

    it('una categoría sin vision_enabled se considera visible (compatibilidad)', () => {
        const clases = buildCategoryTabClasses({ id: 5, name: 'Legacy', pos_target: 'HELADERIA' });
        expect(clases).toContain('bg-pink-700');
        expect(clases).not.toContain(HIDDEN_OPACITY_CLASS);
    });
});

// ─── buildCategoryTabTitle ───────────────────────────────────────────────────

describe('buildCategoryTabTitle', () => {
    it('describe nombre, destino y visibilidad', () => {
        expect(buildCategoryTabTitle(CAT_HELADERIA)).toBe(
            'Bolas de Helado — POS Heladería — Visible en POS'
        );
    });

    it('marca las categorías ocultas', () => {
        expect(buildCategoryTabTitle(CAT_OCULTA)).toBe(
            'Temporada — POS Heladería — Oculta en POS'
        );
    });

    it('nunca lanza con datos parciales', () => {
        expect(buildCategoryTabTitle(null)).toBe('Categoría — POS Panadería — Visible en POS');
        expect(buildCategoryTabTitle({})).toBe('Categoría — POS Panadería — Visible en POS');
    });
});
