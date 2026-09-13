/**
 * tiendaConfigurator.test.js — Guardián del contrato de la Tienda Interactiva (V14, Fase 14.1).
 *
 * Estos tests fallan si alguien rompe:
 *   - el mapeo `STEP_TO_COMPONENT_TYPE` (paso UI → enum del backend),
 *   - el tope de sabores derivado de `max_scoops` del recipiente,
 *   - el cálculo de precio (que debe leer del menú, no de constantes),
 *   - la tolerancia a datos corruptos de `sessionStorage`.
 */
import { describe, it, expect } from 'vitest';
import {
    CONFIGURATOR_STEPS,
    STEP_TO_COMPONENT_TYPE,
    DEFAULT_CONFIGURATOR_STATE,
    getMenuItemsByType,
    getMaxSabores,
    canAdvanceStep,
    advanceStep,
    goBackStep,
    goToStep,
    selectBase,
    selectTamano,
    addFlavor,
    removeFlavor,
    toggleTopping,
    toggleExtra,
    setRecipientName,
    computeUnitPrice,
    validateConfiguratorState,
    normalizeConfiguratorState,
    buildPreComandaPayload,
    buildItemLabel,
} from './tiendaConfigurator';

// ─────────────────────────────────────────────────────────────
// Fixtures — simulan la respuesta real de GET /heladeria/menu
// ─────────────────────────────────────────────────────────────

const RECIPIENTE_VASO = {
    config_id: 1, product_id: 101, name: 'Vaso', price: '0',
    component_type: 'RECIPIENTE', is_available: true,
    max_scoops: 3, base_price: '45', price_per_scoop: '8', position: 0,
};
const RECIPIENTE_CONO = {
    config_id: 2, product_id: 102, name: 'Cono', price: '0',
    component_type: 'RECIPIENTE', is_available: true,
    max_scoops: 2, base_price: '40', price_per_scoop: '8', position: 1,
};
const TAMANO_GRANDE = {
    config_id: 3, product_id: 103, name: 'Grande', price: '10',
    component_type: 'TAMAÑO', is_available: true, position: 0,
};
const SABOR_CHOCOLATE = {
    config_id: 4, product_id: 104, name: 'Chocolate', price: '8',
    component_type: 'SABOR', is_available: true, position: 0,
};
const SABOR_FRESA = {
    config_id: 5, product_id: 105, name: 'Fresa', price: '8',
    component_type: 'SABOR', is_available: true, position: 1,
};
const SABOR_VAINILLA = {
    config_id: 6, product_id: 106, name: 'Vainilla', price: '8',
    component_type: 'SABOR', is_available: true, position: 2,
};
const SABOR_MANGO = {
    config_id: 7, product_id: 107, name: 'Mango', price: '9',
    component_type: 'SABOR', is_available: true, position: 3,
};
const TOPPING_CHISPAS = {
    config_id: 8, product_id: 108, name: 'Chispas', price: '5',
    component_type: 'EXTRA', is_available: true, position: 0,
};
const EXTRA_NUEZ = {
    config_id: 9, product_id: 109, name: 'Nuez', price: '7',
    component_type: 'EXTRA', is_available: true, position: 1,
};

const MENU = {
    groups: [
        { component_type: 'RECIPIENTE', items: [RECIPIENTE_VASO, RECIPIENTE_CONO] },
        { component_type: 'TAMAÑO', items: [TAMANO_GRANDE] },
        { component_type: 'SABOR', items: [SABOR_CHOCOLATE, SABOR_FRESA, SABOR_VAINILLA, SABOR_MANGO] },
        { component_type: 'EXTRA', items: [TOPPING_CHISPAS, EXTRA_NUEZ] },
        { component_type: 'BEBIDA_BASE', items: [] },
    ],
    total_items: 9,
};

/** Estado completo y válido: Vaso + Grande + 2 sabores + 1 topping + 1 extra. */
function estadoCompleto() {
    let s = { ...DEFAULT_CONFIGURATOR_STATE };
    s = selectBase(s, RECIPIENTE_VASO);
    s = selectTamano(s, TAMANO_GRANDE);
    s = addFlavor(s, SABOR_CHOCOLATE, 3);
    s = addFlavor(s, SABOR_FRESA, 3);
    s = toggleTopping(s, TOPPING_CHISPAS, 5);
    s = toggleExtra(s, EXTRA_NUEZ, 5);
    return s;
}

// ─────────────────────────────────────────────────────────────
// 1. Estructura y mapeo de pasos
// ─────────────────────────────────────────────────────────────

describe('Estructura del configurador', () => {
    it('1. CONFIGURATOR_STEPS tiene los 5 pasos en orden', () => {
        expect(CONFIGURATOR_STEPS).toEqual(['base', 'tamano', 'sabores', 'toppings', 'extras']);
    });

    it('2. STEP_TO_COMPONENT_TYPE mapea cada paso al enum del backend', () => {
        expect(STEP_TO_COMPONENT_TYPE.base).toBe('RECIPIENTE');
        expect(STEP_TO_COMPONENT_TYPE.tamano).toBe('TAMAÑO');
        expect(STEP_TO_COMPONENT_TYPE.sabores).toBe('SABOR');
        expect(STEP_TO_COMPONENT_TYPE.toppings).toBe('EXTRA');
        expect(STEP_TO_COMPONENT_TYPE.extras).toBe('EXTRA');
    });

    it('3. NUNCA emite BEBIDA_BASE (no aplica a la Tienda Interactiva)', () => {
        const valores = Object.values(STEP_TO_COMPONENT_TYPE);
        expect(valores).not.toContain('BEBIDA_BASE');
    });

    it('4. getMenuItemsByType devuelve [] con menú nulo o corrupto', () => {
        expect(getMenuItemsByType(null, 'SABOR')).toEqual([]);
        expect(getMenuItemsByType({}, 'SABOR')).toEqual([]);
        expect(getMenuItemsByType({ groups: null }, 'SABOR')).toEqual([]);
        expect(getMenuItemsByType(MENU, 'SABOR')).toHaveLength(4);
    });
});

// ─────────────────────────────────────────────────────────────
// 2. Navegación de pasos
// ─────────────────────────────────────────────────────────────

describe('Navegación de pasos', () => {
    it('5. canAdvanceStep bloquea el avance si falta el recipiente', () => {
        const r = canAdvanceStep(DEFAULT_CONFIGURATOR_STATE, 'base');
        expect(r.ok).toBe(false);
        expect(r.reason).toMatch(/recipiente/i);
    });

    it('6. canAdvanceStep permite avanzar con recipiente seleccionado', () => {
        const s = selectBase(DEFAULT_CONFIGURATOR_STATE, RECIPIENTE_VASO);
        expect(canAdvanceStep(s, 'base').ok).toBe(true);
    });

    it('7. advanceStep NO avanza si el paso actual está incompleto', () => {
        const s = advanceStep(DEFAULT_CONFIGURATOR_STATE);
        expect(s.stepIndex).toBe(0);
    });

    it('8. advanceStep avanza y goBackStep retrocede', () => {
        let s = selectBase(DEFAULT_CONFIGURATOR_STATE, RECIPIENTE_VASO);
        s = advanceStep(s);
        expect(s.stepIndex).toBe(1);
        s = goBackStep(s);
        expect(s.stepIndex).toBe(0);
    });

    it('9. goBackStep no baja de 0 y goToStep salta a un paso válido', () => {
        expect(goBackStep(DEFAULT_CONFIGURATOR_STATE).stepIndex).toBe(0);
        expect(goToStep(DEFAULT_CONFIGURATOR_STATE, 'extras').stepIndex).toBe(4);
        expect(goToStep(DEFAULT_CONFIGURATOR_STATE, 'inexistente').stepIndex).toBe(0);
    });
});

// ─────────────────────────────────────────────────────────────
// 3. Tope de sabores (derivado de max_scoops, NO constante global)
// ─────────────────────────────────────────────────────────────

describe('Tope de sabores', () => {
    it('10. getMaxSabores lee max_scoops del recipiente seleccionado', () => {
        const vaso = selectBase(DEFAULT_CONFIGURATOR_STATE, RECIPIENTE_VASO);
        const cono = selectBase(DEFAULT_CONFIGURATOR_STATE, RECIPIENTE_CONO);
        expect(getMaxSabores(vaso)).toBe(3);
        expect(getMaxSabores(cono)).toBe(2);
    });

    it('11. addFlavor respeta el máximo: no permite 4 si max_scoops es 3', () => {
        let s = selectBase(DEFAULT_CONFIGURATOR_STATE, RECIPIENTE_VASO);
        s = addFlavor(s, SABOR_CHOCOLATE, 3);
        s = addFlavor(s, SABOR_FRESA, 3);
        s = addFlavor(s, SABOR_VAINILLA, 3);
        s = addFlavor(s, SABOR_MANGO, 3); // 4ª bola → debe ignorarse
        expect(s.sabores).toHaveLength(3);
        expect(s.sabores.map((x) => x.name)).toEqual(['Chocolate', 'Fresa', 'Vainilla']);
    });

    it('12. addFlavor no duplica el mismo sabor y removeFlavor lo quita', () => {
        let s = selectBase(DEFAULT_CONFIGURATOR_STATE, RECIPIENTE_VASO);
        s = addFlavor(s, SABOR_CHOCOLATE, 3);
        s = addFlavor(s, SABOR_CHOCOLATE, 3);
        expect(s.sabores).toHaveLength(1);
        s = removeFlavor(s, SABOR_CHOCOLATE.config_id);
        expect(s.sabores).toHaveLength(0);
    });

    it('13. cambiar de recipiente resetea los sabores (max_scoops puede cambiar)', () => {
        let s = selectBase(DEFAULT_CONFIGURATOR_STATE, RECIPIENTE_VASO);
        s = addFlavor(s, SABOR_CHOCOLATE, 3);
        s = addFlavor(s, SABOR_FRESA, 3);
        s = addFlavor(s, SABOR_VAINILLA, 3);
        s = selectBase(s, RECIPIENTE_CONO); // Cono: max 2
        expect(s.sabores).toHaveLength(0);
        expect(s.base.name).toBe('Cono');
    });
});

// ─────────────────────────────────────────────────────────────
// 4. Precio (leído del menú, cero hardcodeo)
// ─────────────────────────────────────────────────────────────

describe('Cálculo de precio', () => {
    it('14. computeUnitPrice suma base + tamaño + sabores + toppings + extras', () => {
        const s = estadoCompleto();
        // Vaso base 45 + Grande 10 + Chocolate 8 + Fresa 8 + Chispas 5 + Nuez 7 = 83
        expect(computeUnitPrice(s, MENU)).toBe(83);
    });

    it('15. computeUnitPrice es 0 sin recipiente y usa `price` si no hay `base_price`', () => {
        expect(computeUnitPrice(DEFAULT_CONFIGURATOR_STATE, MENU)).toBe(0);
        const sinBasePrice = { ...RECIPIENTE_VASO, base_price: null, price: '50' };
        const s = selectBase(DEFAULT_CONFIGURATOR_STATE, sinBasePrice);
        expect(computeUnitPrice(s, MENU)).toBe(50);
    });

    it('16. computeUnitPrice tolera precios como string (Decimal serializado)', () => {
        const s = estadoCompleto();
        const precio = computeUnitPrice(s, MENU);
        expect(typeof precio).toBe('number');
        expect(Number.isFinite(precio)).toBe(true);
    });
});

// ─────────────────────────────────────────────────────────────
// 5. Validación y normalización
// ─────────────────────────────────────────────────────────────

describe('Validación y normalización', () => {
    it('17. validateConfiguratorState detecta estados incompletos', () => {
        const r = validateConfiguratorState(DEFAULT_CONFIGURATOR_STATE);
        expect(r.ok).toBe(false);
        expect(r.errors.length).toBeGreaterThanOrEqual(3);
    });

    it('18. validateConfiguratorState aprueba un estado completo', () => {
        const r = validateConfiguratorState(estadoCompleto());
        expect(r.ok).toBe(true);
        expect(r.errors).toEqual([]);
    });

    it('19. validateConfiguratorState rechaza exceso de sabores', () => {
        const s = {
            ...estadoCompleto(),
            sabores: [SABOR_CHOCOLATE, SABOR_FRESA, SABOR_VAINILLA, SABOR_MANGO],
        };
        const r = validateConfiguratorState(s);
        expect(r.ok).toBe(false);
        expect(r.errors.join(' ')).toMatch(/máximo de 3 sabores/i);
    });

    it('20. normalizeConfiguratorState no explota con null/undefined/basura', () => {
        expect(normalizeConfiguratorState(null)).toEqual(DEFAULT_CONFIGURATOR_STATE);
        expect(normalizeConfiguratorState(undefined)).toEqual(DEFAULT_CONFIGURATOR_STATE);
        expect(normalizeConfiguratorState('basura')).toEqual(DEFAULT_CONFIGURATOR_STATE);
        expect(normalizeConfiguratorState(42)).toEqual(DEFAULT_CONFIGURATOR_STATE);
        expect(normalizeConfiguratorState({})).toEqual(DEFAULT_CONFIGURATOR_STATE);
    });

    it('21. normalizeConfiguratorState filtra items corruptos y acota stepIndex', () => {
        const raw = {
            stepIndex: 99,
            base: RECIPIENTE_VASO,
            tamano: { sin: 'forma' },
            sabores: [SABOR_CHOCOLATE, null, 'basura', { config_id: 1 }],
            toppings: 'no-es-array',
            extras: undefined,
            recipientName: 123,
        };
        const s = normalizeConfiguratorState(raw);
        expect(s.stepIndex).toBe(CONFIGURATOR_STEPS.length - 1);
        expect(s.base).toEqual(RECIPIENTE_VASO);
        expect(s.tamano).toBeNull();
        expect(s.sabores).toHaveLength(1);
        expect(s.toppings).toEqual([]);
        expect(s.extras).toEqual([]);
        expect(s.recipientName).toBe('');
    });
});

// ─────────────────────────────────────────────────────────────
// 6. Payload de pre-comanda (contrato con el backend)
// ─────────────────────────────────────────────────────────────

describe('buildPreComandaPayload', () => {
    it('22. produce la forma exacta que espera el backend', () => {
        const s = estadoCompleto();
        const r = buildPreComandaPayload(s, MENU, { recipientName: 'Ana' });
        expect(r.ok).toBe(true);
        expect(r.item).not.toBeNull();
        expect(r.item.product_id).toBe(RECIPIENTE_VASO.product_id);
        expect(r.item.quantity).toBe(1);
        expect(r.item.unit_price).toBe(83);
        expect(r.item.recipient_name).toBe('Ana');
        expect(Array.isArray(r.item.components)).toBe(true);
    });

    it('23. emite el component_type correcto por cada paso (verifica el mapeo)', () => {
        const s = estadoCompleto();
        const { item } = buildPreComandaPayload(s, MENU);
        const tipos = item.components.map((c) => c.component_type);
        // 1 RECIPIENTE + 1 TAMAÑO + 2 SABOR + 1 EXTRA (topping) + 1 EXTRA (extra)
        expect(tipos).toEqual(['RECIPIENTE', 'TAMAÑO', 'SABOR', 'SABOR', 'EXTRA', 'EXTRA']);
        expect(tipos).not.toContain('BEBIDA_BASE');
    });

    it('24. cada componente lleva product_id, component_name y unit_price numérico', () => {
        const s = estadoCompleto();
        const { item } = buildPreComandaPayload(s, MENU);
        item.components.forEach((c) => {
            expect(c.product_id).toBeGreaterThan(0);
            expect(typeof c.component_name).toBe('string');
            expect(c.component_name.length).toBeGreaterThan(0);
            expect(typeof c.unit_price).toBe('number');
            expect(c.quantity).toBe(1);
        });
    });

    it('25. falla con estado incompleto y NO produce item', () => {
        const r = buildPreComandaPayload(DEFAULT_CONFIGURATOR_STATE, MENU);
        expect(r.ok).toBe(false);
        expect(r.item).toBeNull();
        expect(r.errors.length).toBeGreaterThan(0);
    });

    it('26. NO incluye `channel` en el payload (lo garantiza el backend, Opción 2)', () => {
        const s = estadoCompleto();
        const { item } = buildPreComandaPayload(s, MENU);
        expect(item.channel).toBeUndefined();
        expect(JSON.stringify(item)).not.toMatch(/HELADERIA/);
    });
});

// ─────────────────────────────────────────────────────────────
// 7. Etiqueta y selecciones auxiliares
// ─────────────────────────────────────────────────────────────

describe('Etiqueta y selecciones', () => {
    it('27. buildItemLabel arma una etiqueta legible', () => {
        const s = estadoCompleto();
        const label = buildItemLabel(s);
        expect(label).toContain('Vaso');
        expect(label).toContain('Grande');
        expect(label).toContain('Chocolate');
        expect(label).toContain('Chispas');
        expect(label).toContain('Nuez');
    });

    it('28. toggleTopping y toggleExtra alternan (agregan y quitan)', () => {
        let s = { ...DEFAULT_CONFIGURATOR_STATE };
        s = toggleTopping(s, TOPPING_CHISPAS, 5);
        expect(s.toppings).toHaveLength(1);
        s = toggleTopping(s, TOPPING_CHISPAS, 5);
        expect(s.toppings).toHaveLength(0);

        s = toggleExtra(s, EXTRA_NUEZ, 5);
        expect(s.extras).toHaveLength(1);
        s = toggleExtra(s, EXTRA_NUEZ, 5);
        expect(s.extras).toHaveLength(0);
    });

    it('29. setRecipientName solo acepta strings', () => {
        expect(setRecipientName(DEFAULT_CONFIGURATOR_STATE, 'Luis').recipientName).toBe('Luis');
        expect(setRecipientName(DEFAULT_CONFIGURATOR_STATE, 123).recipientName).toBe('');
        expect(setRecipientName(DEFAULT_CONFIGURATOR_STATE, null).recipientName).toBe('');
    });

    it('30. selectBase ignora un item nulo y no muta el estado original', () => {
        const original = { ...DEFAULT_CONFIGURATOR_STATE };
        const s = selectBase(original, null);
        expect(s).toBe(original);
        const s2 = selectBase(original, RECIPIENTE_VASO);
        expect(original.base).toBeNull();
        expect(s2.base).toEqual(RECIPIENTE_VASO);
    });
});
