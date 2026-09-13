/**
 * displayMappers.test.js — Guardián del contrato del Display de Precios (V17, Fase 17.1).
 *
 * Estos tests fallan si alguien rompe:
 *   - la tolerancia a `price` como NÚMERO (65.0) y como STRING ("65.00"),
 *   - el orden visual de los grupos (COMPONENT_TYPE_ORDER),
 *   - el filtrado por `config.groups` (vacío = todos) y `showUnavailable`,
 *   - la tolerancia a respuestas corruptas de la API (null, {}, grupos basura),
 *   - la resolución del modo de la doble landing (?mode=output).
 */
import { describe, it, expect } from 'vitest';
import {
    COMPONENT_TYPE_LABELS,
    COMPONENT_TYPE_ORDER,
    DEFAULT_DISPLAY_CONFIG,
    MIN_COLUMNS,
    MAX_COLUMNS,
    DISPLAY_MODES,
    normalizeDisplayConfig,
    validateDisplayConfig,
    mapDisplayItem,
    mapDisplayMenuFromApi,
    groupItemsByComponentType,
    filterVisibleGroups,
    formatPrice,
    buildDisplayViewModel,
    resolveDisplayMode,
    serializeDisplayConfig,
} from './displayMappers';

// ─────────────────────────────────────────────────────────────
// Fixtures — simulan la respuesta REAL de GET /heladeria/display/menu
// (verificada en vivo: `price` llega como NÚMERO, no como string)
// ─────────────────────────────────────────────────────────────

const RECIPIENTE_VASO = {
    config_id: 1, product_id: 101, name: 'Vaso', price: 0,
    image: null, component_type: 'RECIPIENTE', is_available: true,
    max_scoops: 3, base_price: 45, price_per_scoop: 8, position: 0,
};
const RECIPIENTE_CONO = {
    config_id: 2, product_id: 102, name: 'Cono', price: 0,
    image: null, component_type: 'RECIPIENTE', is_available: true,
    max_scoops: 2, base_price: 40, price_per_scoop: 8, position: 1,
};
const SABOR_CHOCOLATE = {
    config_id: 3, product_id: 103, name: 'Chocolate', price: 65.0,
    image: '/assets/productos/Img1118_1.png', component_type: 'SABOR',
    is_available: true, position: 0,
};
const SABOR_FRESA = {
    config_id: 4, product_id: 104, name: 'Fresa', price: 65.0,
    image: null, component_type: 'SABOR', is_available: true, position: 1,
};
const SABOR_AGOTADO = {
    config_id: 5, product_id: 105, name: 'Mango', price: 65.0,
    image: null, component_type: 'SABOR', is_available: false, position: 2,
};
const TOPPING_CHISPAS = {
    config_id: 6, product_id: 106, name: 'Chispas', price: '12.50',
    image: null, component_type: 'EXTRA', is_available: true, position: 0,
};
const BEBIDA_LECHE = {
    config_id: 7, product_id: 107, name: 'Leche', price: 20,
    image: null, component_type: 'BEBIDA_BASE', is_available: true, position: 0,
};

/** Respuesta completa, con los grupos DESORDENADOS a propósito. */
const API_RESPONSE = {
    groups: [
        { component_type: 'SABOR', items: [SABOR_CHOCOLATE, SABOR_FRESA, SABOR_AGOTADO] },
        { component_type: 'BEBIDA_BASE', items: [BEBIDA_LECHE] },
        { component_type: 'RECIPIENTE', items: [RECIPIENTE_VASO, RECIPIENTE_CONO] },
        { component_type: 'EXTRA', items: [TOPPING_CHISPAS] },
    ],
    total_items: 7,
};

// ─────────────────────────────────────────────────────────────
// Constantes
// ─────────────────────────────────────────────────────────────

describe('Constantes del Display', () => {
    it('COMPONENT_TYPE_LABELS cubre los 5 tipos del backend', () => {
        expect(Object.keys(COMPONENT_TYPE_LABELS).sort()).toEqual(
            ['BEBIDA_BASE', 'EXTRA', 'RECIPIENTE', 'SABOR', 'TAMAÑO'].sort(),
        );
    });

    it('COMPONENT_TYPE_ORDER empieza por RECIPIENTE y termina por BEBIDA_BASE', () => {
        expect(COMPONENT_TYPE_ORDER[0]).toBe('RECIPIENTE');
        expect(COMPONENT_TYPE_ORDER[COMPONENT_TYPE_ORDER.length - 1]).toBe('BEBIDA_BASE');
    });

    it('DEFAULT_DISPLAY_CONFIG espeja el seed de FASE 17.0', () => {
        expect(DEFAULT_DISPLAY_CONFIG).toEqual({
            groups: [],
            columns: 3,
            theme: 'LIGHT',
            showImages: true,
            showUnavailable: true,
        });
    });
});

// ─────────────────────────────────────────────────────────────
// normalizeDisplayConfig
// ─────────────────────────────────────────────────────────────

describe('normalizeDisplayConfig', () => {
    it('devuelve los defaults ante null/undefined/basura', () => {
        expect(normalizeDisplayConfig(null)).toEqual(DEFAULT_DISPLAY_CONFIG);
        expect(normalizeDisplayConfig(undefined)).toEqual(DEFAULT_DISPLAY_CONFIG);
        expect(normalizeDisplayConfig(42)).toEqual(DEFAULT_DISPLAY_CONFIG);
        expect(normalizeDisplayConfig('no-es-json')).toEqual(DEFAULT_DISPLAY_CONFIG);
    });

    it('parsea el string JSON que entrega la API', () => {
        const raw = '{"groups":["SABOR"],"columns":4,"theme":"DARK","showImages":false,"showUnavailable":false}';
        expect(normalizeDisplayConfig(raw)).toEqual({
            groups: ['SABOR'],
            columns: 4,
            theme: 'DARK',
            showImages: false,
            showUnavailable: false,
        });
    });

    it('clampea columns fuera de rango y descarta temas inválidos', () => {
        expect(normalizeDisplayConfig({ columns: 99 }).columns).toBe(MAX_COLUMNS);
        expect(normalizeDisplayConfig({ columns: 0 }).columns).toBe(MIN_COLUMNS);
        expect(normalizeDisplayConfig({ columns: 'abc' }).columns).toBe(DEFAULT_DISPLAY_CONFIG.columns);
        expect(normalizeDisplayConfig({ theme: 'NEON' }).theme).toBe('LIGHT');
    });

    it('limpia groups: descarta no-strings, vacíos y duplicados', () => {
        const c = normalizeDisplayConfig({ groups: ['SABOR', 'SABOR', '', 7, null, ' EXTRA '] });
        expect(c.groups).toEqual(['SABOR', 'EXTRA']);
    });

    it('ignora booleanos no-booleanos (no hace coerción laxa)', () => {
        const c = normalizeDisplayConfig({ showImages: 'yes', showUnavailable: 0 });
        expect(c.showImages).toBe(true);
        expect(c.showUnavailable).toBe(true);
    });
});

// ─────────────────────────────────────────────────────────────
// validateDisplayConfig
// ─────────────────────────────────────────────────────────────

describe('validateDisplayConfig', () => {
    it('acepta la configuración por defecto', () => {
        expect(validateDisplayConfig(DEFAULT_DISPLAY_CONFIG)).toEqual({ valid: true, errors: [] });
    });

    it('acepta basura porque normaliza antes de validar', () => {
        expect(validateDisplayConfig(null).valid).toBe(true);
    });
});

// ─────────────────────────────────────────────────────────────
// mapDisplayItem — TOLERANCIA AL CONTRATO DE `price`
// ─────────────────────────────────────────────────────────────

describe('mapDisplayItem', () => {
    it('acepta price como NÚMERO (contrato real verificado en vivo)', () => {
        const it0 = mapDisplayItem(SABOR_CHOCOLATE);
        expect(it0.price).toBe(65);
        expect(it0.priceLabel).toBe('$65.00');
    });

    it('acepta price como STRING Decimal (contrato histórico)', () => {
        const it0 = mapDisplayItem(TOPPING_CHISPAS);
        expect(it0.price).toBe(12.5);
        expect(it0.priceLabel).toBe('$12.50');
    });

    it('normaliza camelCase y conserva la disponibilidad', () => {
        const it0 = mapDisplayItem(SABOR_AGOTADO);
        expect(it0.configId).toBe(5);
        expect(it0.productId).toBe(105);
        expect(it0.componentType).toBe('SABOR');
        expect(it0.isAvailable).toBe(false);
    });

    it('trata is_available ausente como disponible', () => {
        const it0 = mapDisplayItem({ name: 'X', price: 1, component_type: 'SABOR' });
        expect(it0.isAvailable).toBe(true);
    });

    it('devuelve null ante items inválidos', () => {
        expect(mapDisplayItem(null)).toBeNull();
        expect(mapDisplayItem({})).toBeNull();
        expect(mapDisplayItem({ name: '' })).toBeNull();
        expect(mapDisplayItem('texto')).toBeNull();
    });

    it('no inventa precio: price ausente ⇒ 0', () => {
        const it0 = mapDisplayItem({ name: 'Sin precio', component_type: 'SABOR' });
        expect(it0.price).toBe(0);
        expect(it0.priceLabel).toBe('$0.00');
    });
});

// ─────────────────────────────────────────────────────────────
// mapDisplayMenuFromApi
// ─────────────────────────────────────────────────────────────

describe('mapDisplayMenuFromApi', () => {
    it('mapea la respuesta completa y cuenta los items', () => {
        const { groups, totalItems } = mapDisplayMenuFromApi(API_RESPONSE);
        expect(groups).toHaveLength(4);
        expect(totalItems).toBe(7);
    });

    it('asigna la etiqueta legible a cada grupo', () => {
        const { groups } = mapDisplayMenuFromApi(API_RESPONSE);
        const sabor = groups.find((g) => g.componentType === 'SABOR');
        expect(sabor.label).toBe(COMPONENT_TYPE_LABELS.SABOR);
    });

    it('tolera null, {} y grupos corruptos sin lanzar', () => {
        expect(mapDisplayMenuFromApi(null)).toEqual({ groups: [], totalItems: 0 });
        expect(mapDisplayMenuFromApi({})).toEqual({ groups: [], totalItems: 0 });
        expect(mapDisplayMenuFromApi({ groups: 'no-array' })).toEqual({ groups: [], totalItems: 0 });
        expect(mapDisplayMenuFromApi({ groups: [null, 7, { items: [] }] }))
            .toEqual({ groups: [], totalItems: 0 });
    });

    it('descarta grupos sin items (no pinta encabezados vacíos)', () => {
        const { groups } = mapDisplayMenuFromApi({
            groups: [{ component_type: 'TAMAÑO', items: [] }],
        });
        expect(groups).toHaveLength(0);
    });

    it('usa el component_type crudo si no hay etiqueta conocida', () => {
        const { groups } = mapDisplayMenuFromApi({
            groups: [{ component_type: 'NUEVO_TIPO', items: [{ name: 'X', price: 1 }] }],
        });
        expect(groups[0].label).toBe('NUEVO_TIPO');
    });
});

// ─────────────────────────────────────────────────────────────
// groupItemsByComponentType
// ─────────────────────────────────────────────────────────────

describe('groupItemsByComponentType', () => {
    it('ordena según COMPONENT_TYPE_ORDER (RECIPIENTE primero)', () => {
        const { groups } = mapDisplayMenuFromApi(API_RESPONSE);
        const ordered = groupItemsByComponentType(groups);
        expect(ordered.map((g) => g.componentType)).toEqual([
            'RECIPIENTE', 'SABOR', 'EXTRA', 'BEBIDA_BASE',
        ]);
    });

    it('coloca los tipos desconocidos al final, alfabéticamente', () => {
        const ordered = groupItemsByComponentType([
            { componentType: 'ZZZ', items: [] },
            { componentType: 'AAA', items: [] },
            { componentType: 'SABOR', items: [] },
        ]);
        expect(ordered.map((g) => g.componentType)).toEqual(['SABOR', 'AAA', 'ZZZ']);
    });

    it('no muta el arreglo de entrada', () => {
        const input = [{ componentType: 'SABOR' }, { componentType: 'RECIPIENTE' }];
        const copy = [...input];
        groupItemsByComponentType(input);
        expect(input).toEqual(copy);
    });

    it('tolera entradas no-array', () => {
        expect(groupItemsByComponentType(null)).toEqual([]);
        expect(groupItemsByComponentType('x')).toEqual([]);
    });
});

// ─────────────────────────────────────────────────────────────
// filterVisibleGroups
// ─────────────────────────────────────────────────────────────

describe('filterVisibleGroups', () => {
    const mapped = () => groupItemsByComponentType(mapDisplayMenuFromApi(API_RESPONSE).groups);

    it('groups vacío ⇒ muestra TODOS los grupos', () => {
        const out = filterVisibleGroups(mapped(), { groups: [] });
        expect(out).toHaveLength(4);
    });

    it('groups con valores ⇒ muestra SOLO esos grupos', () => {
        const out = filterVisibleGroups(mapped(), { groups: ['SABOR'] });
        expect(out).toHaveLength(1);
        expect(out[0].componentType).toBe('SABOR');
    });

    it('showUnavailable=false ⇒ oculta los agotados', () => {
        const out = filterVisibleGroups(mapped(), { groups: ['SABOR'], showUnavailable: false });
        expect(out[0].items.map((i) => i.name)).toEqual(['Chocolate', 'Fresa']);
    });

    it('showUnavailable=true ⇒ conserva los agotados', () => {
        const out = filterVisibleGroups(mapped(), { groups: ['SABOR'], showUnavailable: true });
        expect(out[0].items).toHaveLength(3);
    });

    it('descarta grupos que quedan sin items visibles', () => {
        const out = filterVisibleGroups(mapped(), { groups: ['SABOR'], showUnavailable: false });
        expect(out.every((g) => g.items.length > 0)).toBe(true);
    });

    it('tolera entradas no-array', () => {
        expect(filterVisibleGroups(null, {})).toEqual([]);
    });
});

// ─────────────────────────────────────────────────────────────
// formatPrice
// ─────────────────────────────────────────────────────────────

describe('formatPrice', () => {
    it('formatea números y strings con 2 decimales', () => {
        expect(formatPrice(65)).toBe('$65.00');
        expect(formatPrice(65.0)).toBe('$65.00');
        expect(formatPrice('65.00')).toBe('$65.00');
        expect(formatPrice('12.5')).toBe('$12.50');
    });

    it('redondea correctamente', () => {
        expect(formatPrice(12.505)).toBe('$12.51');
        expect(formatPrice(0.1 + 0.2)).toBe('$0.30');
    });

    it('devuelve $0.00 ante valores inválidos', () => {
        expect(formatPrice(null)).toBe('$0.00');
        expect(formatPrice(undefined)).toBe('$0.00');
        expect(formatPrice('abc')).toBe('$0.00');
        expect(formatPrice(NaN)).toBe('$0.00');
    });

    it('respeta la moneda indicada', () => {
        expect(formatPrice(10, 'USD')).toBe('USD 10.00');
    });
});

// ─────────────────────────────────────────────────────────────
// buildDisplayViewModel
// ─────────────────────────────────────────────────────────────

describe('buildDisplayViewModel', () => {
    it('encadena mapeo + orden + filtrado', () => {
        const vm = buildDisplayViewModel(API_RESPONSE, DEFAULT_DISPLAY_CONFIG);
        expect(vm.groups.map((g) => g.componentType)).toEqual([
            'RECIPIENTE', 'SABOR', 'EXTRA', 'BEBIDA_BASE',
        ]);
        expect(vm.totalItems).toBe(7);
        expect(vm.isEmpty).toBe(false);
    });

    it('marca isEmpty cuando no hay nada visible', () => {
        const vm = buildDisplayViewModel(API_RESPONSE, { groups: ['NO_EXISTE'] });
        expect(vm.isEmpty).toBe(true);
        expect(vm.totalItems).toBe(0);
    });

    it('devuelve la config normalizada dentro del ViewModel', () => {
        const vm = buildDisplayViewModel(API_RESPONSE, { columns: 99, theme: 'X' });
        expect(vm.config.columns).toBe(MAX_COLUMNS);
        expect(vm.config.theme).toBe('LIGHT');
    });

    it('tolera una respuesta nula', () => {
        const vm = buildDisplayViewModel(null, DEFAULT_DISPLAY_CONFIG);
        expect(vm.isEmpty).toBe(true);
        expect(vm.groups).toEqual([]);
    });
});

// ─────────────────────────────────────────────────────────────
// resolveDisplayMode — doble landing
// ─────────────────────────────────────────────────────────────

describe('resolveDisplayMode', () => {
    it('?mode=output ⇒ kiosco', () => {
        expect(resolveDisplayMode('?mode=output')).toBe(DISPLAY_MODES.OUTPUT);
        expect(resolveDisplayMode('mode=output')).toBe(DISPLAY_MODES.OUTPUT);
        expect(resolveDisplayMode('?foo=1&mode=output')).toBe(DISPLAY_MODES.OUTPUT);
        expect(resolveDisplayMode('?mode=OUTPUT')).toBe(DISPLAY_MODES.OUTPUT);
    });

    it('sin parámetro o con otro valor ⇒ admin', () => {
        expect(resolveDisplayMode('')).toBe(DISPLAY_MODES.ADMIN);
        expect(resolveDisplayMode(null)).toBe(DISPLAY_MODES.ADMIN);
        expect(resolveDisplayMode('?mode=admin')).toBe(DISPLAY_MODES.ADMIN);
        expect(resolveDisplayMode('?mode=otro')).toBe(DISPLAY_MODES.ADMIN);
        expect(resolveDisplayMode('?foo=bar')).toBe(DISPLAY_MODES.ADMIN);
    });
});

// ─────────────────────────────────────────────────────────────
// serializeDisplayConfig
// ─────────────────────────────────────────────────────────────

describe('serializeDisplayConfig', () => {
    it('produce JSON normalizado y re-parseable', () => {
        const json = serializeDisplayConfig({ groups: ['SABOR', 'SABOR'], columns: 99 });
        expect(JSON.parse(json)).toEqual({
            groups: ['SABOR'],
            columns: MAX_COLUMNS,
            theme: 'LIGHT',
            showImages: true,
            showUnavailable: true,
        });
    });

    it('es idempotente (normalizar dos veces da lo mismo)', () => {
        const once = serializeDisplayConfig({ columns: 2 });
        const twice = serializeDisplayConfig(JSON.parse(once));
        expect(twice).toBe(once);
    });
});
