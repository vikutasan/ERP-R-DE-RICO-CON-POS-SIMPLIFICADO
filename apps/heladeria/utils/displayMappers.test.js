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
    MAX_SCREENS,
    DEFAULT_IMAGES,
    DEFAULT_PRINT,
    DEFAULT_SCREEN_CONFIG,
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
    resolveGroupLabel,
    resolveImagePresentation,
    normalizeDisplayScreens,
    serializeDisplayScreens,
} from './displayMappers';
import {
    mmToPt,
    getPageSizePt,
    normalizePrintConfig,
} from './printFormats';
import { collectUsedFonts } from './displayFonts';
import { layoutPrintDocument, buildFileName } from './layoutPrintDocument';
import { applyTemplate } from './displayTemplates';
import {
    exportScreen,
    exportScreenToJson,
    importScreen,
    duplicateScreenConfig,
} from './displayConfigIO';

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

    it('DEFAULT_DISPLAY_CONFIG espeja el seed de FASE 17.0 (+ groupLabels v8)', () => {
        expect(DEFAULT_DISPLAY_CONFIG).toEqual({
            groups: [],
            columns: 3,
            theme: 'LIGHT',
            showImages: true,
            showUnavailable: true,
            groupLabels: {},
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
            groupLabels: {},
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
            groupLabels: {},
        });
    });

    it('es idempotente (normalizar dos veces da lo mismo)', () => {
        const once = serializeDisplayConfig({ columns: 2 });
        const twice = serializeDisplayConfig(JSON.parse(once));
        expect(twice).toBe(once);
    });
});

// ═════════════════════════════════════════════════════════════
// V8 — Sub-suite multi-pantalla, diseño y exportación a PDF
// (casos 9 → 21). NO modifican los 43 tests anteriores.
// ═════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────
// 9. resolveGroupLabel — etiqueta personalizada por grupo
// ─────────────────────────────────────────────────────────────

describe('resolveGroupLabel', () => {
    it('usa la etiqueta personalizada si existe', () => {
        expect(resolveGroupLabel('SABOR', { SABOR: 'Nuestros Sabores' }))
            .toBe('Nuestros Sabores');
    });

    it('cae al label por defecto si no hay personalizada', () => {
        expect(resolveGroupLabel('SABOR', {})).toBe(COMPONENT_TYPE_LABELS.SABOR);
    });

    it('tolera groupLabels nulo o basura', () => {
        expect(resolveGroupLabel('SABOR', null)).toBe(COMPONENT_TYPE_LABELS.SABOR);
        expect(resolveGroupLabel('SABOR', 'basura')).toBe(COMPONENT_TYPE_LABELS.SABOR);
    });

    it('ignora etiquetas vacías o solo espacios', () => {
        expect(resolveGroupLabel('SABOR', { SABOR: '   ' }))
            .toBe(COMPONENT_TYPE_LABELS.SABOR);
    });
});

// ─────────────────────────────────────────────────────────────
// 10. resolveImagePresentation — imagen, tamaño y forma
// ─────────────────────────────────────────────────────────────

describe('resolveImagePresentation', () => {
    const item = { name: 'Chocolate', image: '/img/choco.png' };

    it('devuelve url null si images.enabled es false', () => {
        const r = resolveImagePresentation(item, { enabled: false });
        expect(r.url).toBeNull();
    });

    it('devuelve url null si el item no tiene image', () => {
        const r = resolveImagePresentation({ name: 'X' }, { enabled: true });
        expect(r.url).toBeNull();
    });

    it('devuelve la url con tamaño y forma normalizados', () => {
        const r = resolveImagePresentation(item, {
            enabled: true, size: 'LARGE', shape: 'CIRCLE',
        });
        expect(r.url).toBe('/img/choco.png');
        expect(r.size).toBe('LARGE');
        expect(r.shape).toBe('CIRCLE');
    });

    it('normaliza tamaño/forma inválidos a los defaults', () => {
        const r = resolveImagePresentation(item, {
            enabled: true, size: 'GIGANTE', shape: 'TRIANGULO',
        });
        expect(r.size).toBe(DEFAULT_IMAGES.size);
        expect(r.shape).toBe(DEFAULT_IMAGES.shape);
    });

    it('genera fallbackText con la inicial si fallback=INITIALS', () => {
        const r = resolveImagePresentation({ name: 'fresa' }, {
            enabled: true, fallback: 'INITIALS',
        });
        expect(r.fallbackText).toBe('F');
    });
});

// ─────────────────────────────────────────────────────────────
// 11. printFormats — mmToPt y getPageSizePt
// ─────────────────────────────────────────────────────────────

describe('printFormats (mmToPt / getPageSizePt)', () => {
    it('convierte mm a puntos (1 mm = 2.8346 pt)', () => {
        expect(mmToPt(10)).toBeCloseTo(28.346, 2);
        expect(mmToPt(0)).toBe(0);
    });

    it('devuelve LETTER vertical 612×792 pt', () => {
        expect(getPageSizePt('LETTER', 'PORTRAIT')).toEqual({ width: 612, height: 792 });
    });

    it('intercambia ancho/alto en LANDSCAPE', () => {
        expect(getPageSizePt('LETTER', 'LANDSCAPE')).toEqual({ width: 792, height: 612 });
    });

    it('soporta A4 con decimales', () => {
        const a4 = getPageSizePt('A4', 'PORTRAIT');
        expect(a4.width).toBeCloseTo(595.28, 2);
        expect(a4.height).toBeCloseTo(841.89, 2);
    });

    it('cae a LETTER ante formato desconocido', () => {
        expect(getPageSizePt('NO_EXISTE', 'PORTRAIT')).toEqual({ width: 612, height: 792 });
    });
});

// ─────────────────────────────────────────────────────────────
// 12. normalizePrintConfig — tolerancia a basura
// ─────────────────────────────────────────────────────────────

describe('normalizePrintConfig', () => {
    it('devuelve defaults ante null', () => {
        expect(normalizePrintConfig(null)).toEqual(DEFAULT_PRINT);
    });

    it('normaliza formato y orientación inválidos', () => {
        const r = normalizePrintConfig({ format: 'XX', orientation: 'DIAGONAL' });
        expect(r.format).toBe(DEFAULT_PRINT.format);
        expect(r.orientation).toBe(DEFAULT_PRINT.orientation);
    });

    it('conserva valores válidos', () => {
        const r = normalizePrintConfig({
            format: 'TABLOID', orientation: 'LANDSCAPE', footerNote: 'Precios con IVA',
        });
        expect(r.format).toBe('TABLOID');
        expect(r.orientation).toBe('LANDSCAPE');
        expect(r.footerNote).toBe('Precios con IVA');
    });

    it('showQr por defecto es false (no se imprime QR salvo petición)', () => {
        expect(normalizePrintConfig({}).showQr).toBe(false);
    });
});

// ─────────────────────────────────────────────────────────────
// 13. layoutPrintDocument — paginación pura
// ─────────────────────────────────────────────────────────────

describe('layoutPrintDocument', () => {
    const screenConfig = {
        columns: 2,
        print: { format: 'LETTER', orientation: 'PORTRAIT' },
        header: { title: 'Heladería', subtitle: 'Menú', align: 'CENTER' },
        fontFamily: 'CLASSIC',
    };

    it('devuelve la geometría de página correcta', () => {
        const doc = layoutPrintDocument(API_RESPONSE, screenConfig);
        expect(doc.pageSizePt).toEqual({ width: 612, height: 792 });
        expect(doc.columns).toBe(2);
        expect(doc.columnGap).toBeGreaterThan(0);
    });

    it('produce al menos una página con items', () => {
        const doc = layoutPrintDocument(API_RESPONSE, screenConfig);
        expect(Array.isArray(doc.pages)).toBe(true);
        expect(doc.pages.length).toBeGreaterThanOrEqual(1);
        expect(Array.isArray(doc.pages[0].items)).toBe(true);
        expect(doc.pages[0].items.length).toBeGreaterThan(0);
    });

    it('cada página incluye HEADER y la última incluye FOOTER', () => {
        const doc = layoutPrintDocument(API_RESPONSE, screenConfig);
        const first = doc.pages[0].items;
        expect(first[0].type).toBe('HEADER');
        const lastPage = doc.pages[doc.pages.length - 1];
        expect(lastPage.isLast).toBe(true);
        expect(lastPage.items.some((i) => i.type === 'FOOTER')).toBe(true);
    });

    it('tolera viewModel vacío sin lanzar', () => {
        const doc = layoutPrintDocument({ groups: [] }, screenConfig);
        expect(doc.pages.length).toBeGreaterThanOrEqual(1);
    });

    it('tolera screenConfig nulo usando defaults', () => {
        const doc = layoutPrintDocument(API_RESPONSE, null);
        expect(doc.pageSizePt).toEqual({ width: 612, height: 792 });
    });

    it('respeta la orientación LANDSCAPE', () => {
        const doc = layoutPrintDocument(API_RESPONSE, {
            ...screenConfig,
            print: { format: 'LETTER', orientation: 'LANDSCAPE' },
        });
        expect(doc.pageSizePt).toEqual({ width: 792, height: 612 });
    });
});

// ─────────────────────────────────────────────────────────────
// 14. buildFileName — nombre de archivo seguro
// ─────────────────────────────────────────────────────────────

describe('buildFileName', () => {
    const now = new Date('2026-09-16T12:00:00Z');

    it('genera un nombre con formato y fecha', () => {
        const name = buildFileName(
            { print: { format: 'LETTER' } }, 'Menú Completo', now,
        );
        expect(name).toMatch(/^carta-menu-completo-letter-\d{8}\.pdf$/);
    });

    it('sanea acentos y caracteres especiales', () => {
        const name = buildFileName({ print: { format: 'A4' } }, 'Bebidas/Frías #1', now);
        expect(name).not.toMatch(/[\/#]/);
        expect(name).toMatch(/\.pdf$/);
    });

    it('tolera nombre vacío', () => {
        const name = buildFileName({ print: { format: 'LETTER' } }, '', now);
        expect(name).toMatch(/^carta-.*\.pdf$/);
    });
});

// ─────────────────────────────────────────────────────────────
// 15. collectUsedFonts — subconjunto único de tipografías
// ─────────────────────────────────────────────────────────────

describe('collectUsedFonts', () => {
    it('devuelve las fuentes únicas usadas por las pantallas', () => {
        const fonts = collectUsedFonts([
            { config: { fontFamily: 'CLASSIC' } },
            { config: { fontFamily: 'FUN' } },
            { config: { fontFamily: 'CLASSIC' } },
        ]);
        expect(fonts.sort()).toEqual(['CLASSIC', 'FUN']);
    });

    it('cae a CLASSIC si no hay pantallas', () => {
        expect(collectUsedFonts([])).toEqual(['CLASSIC']);
    });

    it('ignora fuentes desconocidas', () => {
        const fonts = collectUsedFonts([{ config: { fontFamily: 'COMIC_SANS' } }]);
        expect(fonts).toEqual(['CLASSIC']);
    });
});

// ─────────────────────────────────────────────────────────────
// 16. normalizeDisplayConfig — regresión v4 (no romper contrato)
// ─────────────────────────────────────────────────────────────

describe('normalizeDisplayConfig (regresión v4 + groupLabels v8)', () => {
    it('devuelve las claves del contrato base más groupLabels', () => {
        const r = normalizeDisplayConfig({});
        expect(Object.keys(r).sort()).toEqual(
            ['columns', 'groupLabels', 'groups', 'showImages', 'showUnavailable', 'theme'],
        );
    });

    it('no añade claves de diseño/impresión al contrato base', () => {
        const r = normalizeDisplayConfig({ columns: 3 });
        expect(r.header).toBeUndefined();
        expect(r.print).toBeUndefined();
    });

    it('sanea groupLabels descartando valores vacíos o no-string', () => {
        const r = normalizeDisplayConfig({
            groupLabels: { SABOR: 'Sabores', EXTRA: '', TAMAÑO: 42 },
        });
        expect(r.groupLabels).toEqual({ SABOR: 'Sabores' });
    });
});

// ─────────────────────────────────────────────────────────────
// 17. applyTemplate — cambia presentación, preserva grupos
// ─────────────────────────────────────────────────────────────

describe('applyTemplate', () => {
    it('aplica la plantilla KIDS (fuente FUN, imágenes CIRCLE)', () => {
        const r = applyTemplate({ groups: ['SABOR'] }, 'KIDS');
        expect(r.fontFamily).toBe('FUN');
        expect(r.images.shape).toBe('CIRCLE');
    });

    it('preserva los grupos seleccionados', () => {
        const r = applyTemplate({ groups: ['SABOR', 'EXTRA'] }, 'MINIMAL');
        expect(r.groups).toEqual(['SABOR', 'EXTRA']);
    });

    it('preserva groupLabels personalizados', () => {
        const r = applyTemplate(
            { groups: ['SABOR'], groupLabels: { SABOR: 'Sabores' } }, 'RETRO',
        );
        expect(r.groupLabels.SABOR).toBe('Sabores');
    });

    it('ante plantilla inválida devuelve config normalizada sin cambios', () => {
        const r = applyTemplate({ groups: ['SABOR'] }, 'NO_EXISTE');
        expect(r.groups).toEqual(['SABOR']);
    });

    it('PRICE_ONLY desactiva imágenes y sube columnas', () => {
        const r = applyTemplate({ groups: ['SABOR'] }, 'PRICE_ONLY');
        expect(r.showImages).toBe(false);
        expect(r.columns).toBeGreaterThanOrEqual(4);
    });
});

// ─────────────────────────────────────────────────────────────
// 18. duplicateScreenConfig — copiar config entre pantallas
// ─────────────────────────────────────────────────────────────

describe('duplicateScreenConfig', () => {
    const doc = {
        version: 1,
        screens: [
            { id: 'screen_1', name: 'Menú', enabled: true, config: { columns: 3, groups: ['SABOR'] } },
            { id: 'screen_2', name: 'Bebidas', enabled: false, config: { columns: 2, groups: [] } },
        ],
    };

    it('copia la config de origen al destino', () => {
        const r = duplicateScreenConfig(doc, 'screen_1', 'screen_2');
        const target = r.screens.find((s) => s.id === 'screen_2');
        expect(target.config.columns).toBe(3);
        expect(target.config.groups).toEqual(['SABOR']);
    });

    it('preserva id y nombre del destino', () => {
        const r = duplicateScreenConfig(doc, 'screen_1', 'screen_2');
        const target = r.screens.find((s) => s.id === 'screen_2');
        expect(target.id).toBe('screen_2');
        expect(target.name).toBe('Bebidas');
    });

    it('es no-op si origen y destino son iguales', () => {
        const r = duplicateScreenConfig(doc, 'screen_1', 'screen_1');
        expect(r.screens[0].config.columns).toBe(3);
    });

    it('es no-op si el destino no existe', () => {
        const r = duplicateScreenConfig(doc, 'screen_1', 'screen_9');
        expect(r.screens.length).toBe(2);
    });
});

// ─────────────────────────────────────────────────────────────
// 19. exportScreen — documento de exportación
// ─────────────────────────────────────────────────────────────

describe('exportScreen', () => {
    const screen = {
        id: 'screen_1',
        name: 'Menú Completo',
        enabled: true,
        config: { columns: 3, groups: ['SABOR'] },
    };

    it('incluye versión, fecha y pantalla', () => {
        const doc = exportScreen(screen, new Date('2026-09-16T12:00:00Z'));
        expect(doc.version).toBe(1);
        expect(doc.exportedAt).toBeTruthy();
        expect(doc.screen.name).toBe('Menú Completo');
    });

    it('no incluye el id en el documento exportado', () => {
        const doc = exportScreen(screen);
        expect(doc.screen.id).toBeUndefined();
    });

    it('exportScreenToJson produce JSON re-parseable', () => {
        const json = exportScreenToJson(screen);
        expect(() => JSON.parse(json)).not.toThrow();
    });
});

// ─────────────────────────────────────────────────────────────
// 20. importScreen — validación de entrada
// ─────────────────────────────────────────────────────────────

describe('importScreen', () => {
    it('acepta un documento válido', () => {
        const json = exportScreenToJson({
            id: 'screen_1', name: 'Menú', config: { columns: 3 },
        });
        const r = importScreen(json);
        expect(r.ok).toBe(true);
        expect(r.screen.name).toBe('Menú');
    });

    it('rechaza JSON inválido', () => {
        const r = importScreen('{no es json');
        expect(r.ok).toBe(false);
        expect(r.error).toBeTruthy();
    });

    it('rechaza un documento que no es objeto', () => {
        const r = importScreen(JSON.stringify([1, 2, 3]));
        expect(r.ok).toBe(false);
    });

    it('ignora el id del archivo y asigna el id canónico', () => {
        const json = JSON.stringify({
            version: 1, screen: { id: 'screen_9', name: 'X', config: {} },
        });
        const r = importScreen(json);
        expect(r.ok).toBe(true);
        expect(r.screen.id).toBe('screen_1');
    });

    it('acepta un documento plano sin envoltorio `screen`', () => {
        const r = importScreen(JSON.stringify({ name: 'Plano', config: { columns: 2 } }));
        expect(r.ok).toBe(true);
        expect(r.screen.name).toBe('Plano');
    });
});

// ─────────────────────────────────────────────────────────────
// 21. normalizeDisplayScreens — contrato multi-pantalla
// ─────────────────────────────────────────────────────────────

describe('normalizeDisplayScreens', () => {
    it('siempre devuelve exactamente 3 pantallas', () => {
        const r = normalizeDisplayScreens(null);
        expect(r.screens.length).toBe(MAX_SCREENS);
    });

    it('asigna ids canónicos screen_1..screen_3', () => {
        const r = normalizeDisplayScreens(null);
        expect(r.screens.map((s) => s.id)).toEqual(['screen_1', 'screen_2', 'screen_3']);
    });

    it('tolera basura y rellena con defaults', () => {
        const r = normalizeDisplayScreens({ screens: 'basura' });
        expect(r.screens.length).toBe(MAX_SCREENS);
        expect(r.screens[0].config.columns).toBe(DEFAULT_SCREEN_CONFIG.columns);
    });

    it('conserva nombres y configs válidos', () => {
        const r = normalizeDisplayScreens({
            screens: [{ id: 'screen_1', name: 'Caja', config: { columns: 4 } }],
        });
        expect(r.screens[0].name).toBe('Caja');
        expect(r.screens[0].config.columns).toBe(4);
    });

    it('serializeDisplayScreens es idempotente', () => {
        const once = serializeDisplayScreens(null);
        const twice = serializeDisplayScreens(JSON.parse(once));
        expect(twice).toBe(once);
    });
});
