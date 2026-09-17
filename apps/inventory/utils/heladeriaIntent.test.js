/**
 * v8 (HEL-P): tests del contrato de proyección producto → heladeria_product_config.
 *
 * Estos tests son el ESPEJO de apps/api/tests/test_heladeria_sync.py.
 * Si uno cambia, el otro debe cambiar: son el mismo contrato en dos lenguajes.
 */
import { describe, it, expect } from 'vitest';
import {
    COMPONENT_TYPE_OPTIONS,
    HELADERIA_KEYS,
    VALID_COMPONENT_TYPES,
    isHeladeriaCategory,
    patchHeladeriaIntent,
    readHeladeriaIntent,
    shouldShowHeladeriaBlock,
    validateHeladeriaIntent,
} from './heladeriaIntent';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const CATEGORIA_HELADERIA = { id: 7, name: 'Sabores', heladeria_enabled: true };
const CATEGORIA_PANADERIA = { id: 3, name: 'Panes', heladeria_enabled: false };

const PRODUCTO_SABOR = {
    id: 1,
    name: 'Chocolate Belga',
    category: CATEGORIA_HELADERIA,
    technical_data: {
        heladeria_enabled: true,
        heladeria_component_type: 'SABOR',
    },
};

const PRODUCTO_SIN_INTENCION = {
    id: 2,
    name: 'Concha',
    category: CATEGORIA_PANADERIA,
    technical_data: {},
};

// ─── Contrato de constantes ──────────────────────────────────────────────────

describe('Contrato de constantes', () => {
    it('expone las 5 claves canónicas de technical_data', () => {
        expect(HELADERIA_KEYS).toEqual({
            ENABLED: 'heladeria_enabled',
            COMPONENT_TYPE: 'heladeria_component_type',
        });
    });

    it('VALID_COMPONENT_TYPES se deriva de las opciones (una sola fuente)', () => {
        expect(VALID_COMPONENT_TYPES).toEqual(
            COMPONENT_TYPE_OPTIONS.map((o) => o.value)
        );
    });

    it('respeta el orden canónico RECIPIENTE → TAMAÑO → SABOR → EXTRA → BEBIDA_BASE', () => {
        expect(VALID_COMPONENT_TYPES).toEqual([
            'RECIPIENTE',
            'TAMAÑO',
            'SABOR',
            'EXTRA',
            'BEBIDA_BASE',
        ]);
    });

    it('cada opción tiene value y label no vacíos', () => {
        COMPONENT_TYPE_OPTIONS.forEach((opt) => {
            expect(opt.value).toBeTruthy();
            expect(opt.label).toBeTruthy();
        });
    });
});

// ─── isHeladeriaCategory ─────────────────────────────────────────────────────

describe('isHeladeriaCategory', () => {
    it('devuelve true si la categoría anidada está marcada', () => {
        expect(isHeladeriaCategory(PRODUCTO_SABOR)).toBe(true);
    });

    it('devuelve false si la categoría anidada no está marcada', () => {
        expect(isHeladeriaCategory(PRODUCTO_SIN_INTENCION)).toBe(false);
    });

    it('devuelve false si el producto es null', () => {
        expect(isHeladeriaCategory(null)).toBe(false);
    });

    it('devuelve false si no hay categoría anidada', () => {
        expect(isHeladeriaCategory({ id: 9 })).toBe(false);
    });

    it('devuelve false si la categoría es un array de nombres y no hay catálogo', () => {
        expect(isHeladeriaCategory({ categories: ['Sabores'] })).toBe(false);
    });

    it('resuelve por nombre contra el catálogo y devuelve true si está marcada', () => {
        const catalogo = [
            { id: 1, name: 'Panadería', heladeria_enabled: false },
            { id: 2, name: 'Sabores', heladeria_enabled: true },
        ];
        expect(isHeladeriaCategory({ categories: ['Sabores'] }, catalogo)).toBe(true);
    });

    it('resuelve por nombre contra el catálogo y devuelve false si no está marcada', () => {
        const catalogo = [
            { id: 1, name: 'Panadería', heladeria_enabled: false },
            { id: 2, name: 'Sabores', heladeria_enabled: true },
        ];
        expect(isHeladeriaCategory({ categories: ['Panadería'] }, catalogo)).toBe(false);
    });

    it('la resolución por nombre ignora mayúsculas y espacios', () => {
        const catalogo = [{ id: 2, name: 'Sabores', heladeria_enabled: true }];
        expect(isHeladeriaCategory({ categories: ['  sAbOrEs  '] }, catalogo)).toBe(true);
    });

    it('devuelve false si el nombre no existe en el catálogo', () => {
        const catalogo = [{ id: 2, name: 'Sabores', heladeria_enabled: true }];
        expect(isHeladeriaCategory({ categories: ['Inexistente'] }, catalogo)).toBe(false);
    });

    it('tolera un catálogo con entradas nulas', () => {
        const catalogo = [null, { id: 2, name: 'Sabores', heladeria_enabled: true }];
        expect(isHeladeriaCategory({ categories: ['Sabores'] }, catalogo)).toBe(true);
    });
});

// ─── readHeladeriaIntent ─────────────────────────────────────────────────────

describe('readHeladeriaIntent', () => {
    it('devuelve el component_type cuando la intención es válida', () => {
        expect(readHeladeriaIntent(PRODUCTO_SABOR)).toBe('SABOR');
    });

    it('devuelve null si no hay technical_data', () => {
        expect(readHeladeriaIntent({ id: 1 })).toBeNull();
    });

    it('devuelve null si el producto es null', () => {
        expect(readHeladeriaIntent(null)).toBeNull();
    });

    it('devuelve null si el flag está apagado', () => {
        expect(readHeladeriaIntent({
            technical_data: { heladeria_enabled: false, heladeria_component_type: 'SABOR' },
        })).toBeNull();
    });

    it('devuelve null si el flag está ausente', () => {
        expect(readHeladeriaIntent({
            technical_data: { heladeria_component_type: 'SABOR' },
        })).toBeNull();
    });

    it('devuelve null si el component_type está ausente', () => {
        expect(readHeladeriaIntent({
            technical_data: { heladeria_enabled: true },
        })).toBeNull();
    });

    it('devuelve null si el component_type es inválido', () => {
        expect(readHeladeriaIntent({
            technical_data: { heladeria_enabled: true, heladeria_component_type: 'PIZZA' },
        })).toBeNull();
    });

    it.each(VALID_COMPONENT_TYPES)('acepta el tipo canónico %s', (tipo) => {
        expect(readHeladeriaIntent({
            technical_data: { heladeria_enabled: true, heladeria_component_type: tipo },
        })).toBe(tipo);
    });
});

// ─── shouldShowHeladeriaBlock ────────────────────────────────────────────────

describe('shouldShowHeladeriaBlock', () => {
    it('muestra el bloque si la categoría está marcada', () => {
        expect(shouldShowHeladeriaBlock(PRODUCTO_SABOR)).toBe(true);
    });

    it('oculta el bloque en producto de panadería sin intención', () => {
        expect(shouldShowHeladeriaBlock(PRODUCTO_SIN_INTENCION)).toBe(false);
    });

    it('muestra el bloque si ya existe una proyección activa aunque la categoría no esté recargada', () => {
        expect(shouldShowHeladeriaBlock({
            id: 5,
            technical_data: { heladeria_enabled: true, heladeria_component_type: 'EXTRA' },
        })).toBe(true);
    });

    it('devuelve false si el producto es null', () => {
        expect(shouldShowHeladeriaBlock(null)).toBe(false);
    });
});

// ─── patchHeladeriaIntent ────────────────────────────────────────────────────

describe('patchHeladeriaIntent', () => {
    it('preserva las claves ajenas de technical_data', () => {
        const resultado = patchHeladeriaIntent(
            { primary_mass_id: 4, weight_per_piece: 80 },
            true,
            'SABOR'
        );
        expect(resultado.primary_mass_id).toBe(4);
        expect(resultado.weight_per_piece).toBe(80);
    });

    it('escribe enabled y component_type al activar', () => {
        const resultado = patchHeladeriaIntent({}, true, 'SABOR');
        expect(resultado.heladeria_enabled).toBe(true);
        expect(resultado.heladeria_component_type).toBe('SABOR');
    });

    it('fuerza component_type a null al desactivar (para que el backend borre la fila)', () => {
        const resultado = patchHeladeriaIntent(
            { heladeria_enabled: true, heladeria_component_type: 'SABOR' },
            false,
            'SABOR'
        );
        expect(resultado.heladeria_enabled).toBe(false);
        expect(resultado.heladeria_component_type).toBeNull();
    });

    it('normaliza enabled a booleano estricto', () => {
        expect(patchHeladeriaIntent({}, 'si', 'SABOR').heladeria_enabled).toBe(true);
        expect(patchHeladeriaIntent({}, 0, 'SABOR').heladeria_enabled).toBe(false);
    });

    it('tolera technical_data nulo', () => {
        const resultado = patchHeladeriaIntent(null, true, 'EXTRA');
        expect(resultado.heladeria_enabled).toBe(true);
        expect(resultado.heladeria_component_type).toBe('EXTRA');
    });

    it('no muta el objeto original', () => {
        const original = { heladeria_enabled: false };
        patchHeladeriaIntent(original, true, 'SABOR');
        expect(original.heladeria_enabled).toBe(false);
    });
});

// ─── validateHeladeriaIntent ─────────────────────────────────────────────────

describe('validateHeladeriaIntent', () => {
    it('no valida nada si el flag está apagado', () => {
        expect(validateHeladeriaIntent({ heladeria_enabled: false })).toBeNull();
    });

    it('exige component_type cuando el flag está encendido', () => {
        expect(validateHeladeriaIntent({ heladeria_enabled: true }))
            .toBe('Selecciona el tipo de componente de heladería.');
    });

    it('rechaza un component_type inválido', () => {
        expect(validateHeladeriaIntent({
            heladeria_enabled: true,
            heladeria_component_type: 'PIZZA',
        })).toContain('inválido');
    });

    it('acepta una intención completa y válida', () => {
        expect(validateHeladeriaIntent({
            heladeria_enabled: true,
            heladeria_component_type: 'SABOR',
        })).toBeNull();
    });

    it('tolera technical_data nulo', () => {
        expect(validateHeladeriaIntent(null)).toBeNull();
    });
});

// ─── Paridad con el backend ──────────────────────────────────────────────────

describe('Paridad con sync.py', () => {
    it('un producto marcado produce una intención que el backend aceptaría', () => {
        const patched = patchHeladeriaIntent({}, true, 'RECIPIENTE');
        expect(validateHeladeriaIntent(patched)).toBeNull();
        expect(readHeladeriaIntent({ technical_data: patched })).toBe('RECIPIENTE');
    });

    it('un producto desmarcado produce una intención que el backend borraría', () => {
        const patched = patchHeladeriaIntent(
            { heladeria_enabled: true, heladeria_component_type: 'SABOR' },
            false,
            'SABOR'
        );
        expect(readHeladeriaIntent({ technical_data: patched })).toBeNull();
    });
});
