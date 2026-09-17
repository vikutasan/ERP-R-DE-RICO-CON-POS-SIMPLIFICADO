/**
 * heladeriaCategoryNav.test.js — Contrato de navegación por categoría del POS.
 *
 * v8 (POS-CATEGORIAS): el POS de Heladería navega por CATEGORÍA, igual que el
 * POS de Panadería. Estos tests blindan el contrato del helper puro que alimenta
 * esa navegación, incluyendo la degradación elegante ante respuestas antiguas.
 */
import { describe, it, expect } from 'vitest';
import {
    SIN_CATEGORIA_ID,
    SIN_CATEGORIA_NAME,
    flattenMenuItems,
    buildCategoryNav,
    getItemsByCategory,
    resolveInitialCategoryId,
} from './heladeriaCategoryNav';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const ITEM_HELADO = {
    config_id: 1,
    product_id: 101,
    name: 'Helado de Chocolate',
    price: 45,
    component_type: 'SABOR',
    is_available: true,
    category_id: 7,
    category_name: 'Helados',
};

const ITEM_CONO = {
    config_id: 2,
    product_id: 102,
    name: 'Cono Waffle',
    price: 20,
    component_type: 'RECIPIENTE',
    is_available: true,
    category_id: 8,
    category_name: 'Recipientes',
};

const ITEM_CHISPAS = {
    config_id: 3,
    product_id: 103,
    name: 'Chispas',
    price: 10,
    component_type: 'EXTRA',
    is_available: false,
    category_id: 9,
    category_name: 'Extras',
};

const ITEM_SIN_CATEGORIA = {
    config_id: 4,
    product_id: 104,
    name: 'Producto Huérfano',
    price: 15,
    component_type: 'SABOR',
    is_available: true,
};

/** Respuesta canónica del backend (con índice `categories`). */
const MENU_CON_INDICE = {
    groups: [
        { component_type: 'SABOR', items: [ITEM_HELADO] },
        { component_type: 'RECIPIENTE', items: [ITEM_CONO] },
        { component_type: 'EXTRA', items: [ITEM_CHISPAS] },
    ],
    total_items: 3,
    categories: [
        { id: 7, name: 'Helados', icon: '🍨', position: 1, item_count: 1 },
        { id: 8, name: 'Recipientes', icon: '🥤', position: 2, item_count: 1 },
        { id: 9, name: 'Extras', icon: '✨', position: 3, item_count: 1 },
    ],
};

/** Respuesta ANTIGUA (sin índice `categories`) — debe derivarse. */
const MENU_SIN_INDICE = {
    groups: [
        { component_type: 'SABOR', items: [ITEM_HELADO, ITEM_SIN_CATEGORIA] },
        { component_type: 'RECIPIENTE', items: [ITEM_CONO] },
    ],
    total_items: 3,
};

// ─── flattenMenuItems ────────────────────────────────────────────────────────

describe('flattenMenuItems', () => {
    it('aplana todos los grupos en una sola lista', () => {
        expect(flattenMenuItems(MENU_CON_INDICE)).toHaveLength(3);
    });

    it('devuelve [] con menú nulo o corrupto', () => {
        expect(flattenMenuItems(null)).toEqual([]);
        expect(flattenMenuItems({})).toEqual([]);
        expect(flattenMenuItems({ groups: null })).toEqual([]);
        expect(flattenMenuItems({ groups: [{ items: null }] })).toEqual([]);
    });
});

// ─── buildCategoryNav ────────────────────────────────────────────────────────

describe('buildCategoryNav', () => {
    it('prefiere el índice canónico del backend', () => {
        const nav = buildCategoryNav(MENU_CON_INDICE);
        expect(nav).toHaveLength(3);
        expect(nav[0]).toEqual({
            id: 7, name: 'Helados', icon: '🍨', position: 1, itemCount: 1,
        });
    });

    it('deriva las categorías cuando el backend no envía índice', () => {
        const nav = buildCategoryNav(MENU_SIN_INDICE);
        const names = nav.map((c) => c.name);
        expect(names).toContain('Helados');
        expect(names).toContain('Recipientes');
        expect(names).toContain(SIN_CATEGORIA_NAME);
    });

    it('agrupa los items sin categoría bajo "Sin categoría"', () => {
        const nav = buildCategoryNav(MENU_SIN_INDICE);
        const huerfana = nav.find((c) => c.id === SIN_CATEGORIA_ID);
        expect(huerfana).toBeDefined();
        expect(huerfana.name).toBe(SIN_CATEGORIA_NAME);
        expect(huerfana.itemCount).toBe(1);
    });

    it('devuelve [] con menú nulo', () => {
        expect(buildCategoryNav(null)).toEqual([]);
        expect(buildCategoryNav({})).toEqual([]);
    });

    it('NO depende de component_type para navegar', () => {
        // Dos categorías distintas con el MISMO component_type deben ser
        // dos entradas de navegación separadas.
        const menu = {
            groups: [
                {
                    component_type: 'SABOR',
                    items: [
                        { ...ITEM_HELADO, category_id: 1, category_name: 'Cremas' },
                        { ...ITEM_HELADO, config_id: 99, category_id: 2, category_name: 'Agua' },
                    ],
                },
            ],
            total_items: 2,
        };
        const nav = buildCategoryNav(menu);
        expect(nav).toHaveLength(2);
        expect(nav.map((c) => c.name).sort()).toEqual(['Agua', 'Cremas']);
    });
});

// ─── getItemsByCategory ──────────────────────────────────────────────────────

describe('getItemsByCategory', () => {
    it('filtra los items de la categoría indicada', () => {
        const items = getItemsByCategory(MENU_CON_INDICE, 7);
        expect(items).toHaveLength(1);
        expect(items[0].name).toBe('Helado de Chocolate');
    });

    it('devuelve la lista completa si categoryId es null', () => {
        expect(getItemsByCategory(MENU_CON_INDICE, null)).toHaveLength(3);
    });

    it('devuelve [] si la categoría no tiene items', () => {
        expect(getItemsByCategory(MENU_CON_INDICE, 999)).toEqual([]);
    });

    it('incluye los huérfanos al filtrar por SIN_CATEGORIA_ID', () => {
        const items = getItemsByCategory(MENU_SIN_INDICE, SIN_CATEGORIA_ID);
        expect(items).toHaveLength(1);
        expect(items[0].name).toBe('Producto Huérfano');
    });
});

// ─── resolveInitialCategoryId ────────────────────────────────────────────────

describe('resolveInitialCategoryId', () => {
    it('devuelve la primera categoría del índice', () => {
        expect(resolveInitialCategoryId(buildCategoryNav(MENU_CON_INDICE))).toBe(7);
    });

    it('devuelve null si el índice está vacío', () => {
        expect(resolveInitialCategoryId([])).toBeNull();
        expect(resolveInitialCategoryId(null)).toBeNull();
    });
});
