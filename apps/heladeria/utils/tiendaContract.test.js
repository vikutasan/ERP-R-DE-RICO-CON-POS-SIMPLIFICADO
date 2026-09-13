/**
 * tiendaContract.test.js — Test de CONTRATO de la Tienda Interactiva (V14, Fase 14.4).
 *
 * OBJETIVO
 *   Fallar si alguien rompe el acuerdo entre el frontend y el backend:
 *     1. El payload de `buildPreComandaPayload` NO debe incluir `channel`
 *        (lo garantiza el backend de forma atómica en el reserve — Opción 2).
 *     2. El `component_type` de cada componente debe salir de
 *        `STEP_TO_COMPONENT_TYPE` (mapeo explícito, no strings sueltos).
 *     3. El item cabeza debe ser el RECIPIENTE (igual que el POS de Heladería).
 *     4. El contrato de `createHeladeriaTicket` debe enviar `channel:'HELADERIA'`
 *        en el MISMO request de reserva (verificado por inspección de fuente).
 *
 * Este test es el "guardián del contrato": si un refactor futuro cambia la
 * forma del payload sin actualizar el backend (o viceversa), aquí truena.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
    buildPreComandaPayload,
    STEP_TO_COMPONENT_TYPE,
    CONFIGURATOR_STEPS,
} from './tiendaConfigurator';

// ─────────────────────────────────────────────────────────────
// Fixtures mínimas (mismas formas que MenuItemResponse)
// ─────────────────────────────────────────────────────────────
const VASO = {
    config_id: 1, product_id: 101, name: 'Vaso', price: '0',
    component_type: 'RECIPIENTE', is_available: true,
    max_scoops: 3, base_price: '45', price_per_scoop: '8', position: 0,
};
const GRANDE = {
    config_id: 3, product_id: 103, name: 'Grande', price: '10',
    component_type: 'TAMAÑO', is_available: true, position: 0,
};
const CHOCOLATE = {
    config_id: 4, product_id: 104, name: 'Chocolate', price: '8',
    component_type: 'SABOR', is_available: true, position: 0,
};
const FRESA = {
    config_id: 5, product_id: 105, name: 'Fresa', price: '8',
    component_type: 'SABOR', is_available: true, position: 1,
};
const CHISPAS = {
    config_id: 8, product_id: 108, name: 'Chispas', price: '5',
    component_type: 'EXTRA', is_available: true, position: 0,
};
const NUEZ = {
    config_id: 9, product_id: 109, name: 'Nuez', price: '7',
    component_type: 'EXTRA', is_available: true, position: 1,
};

const MENU = {
    groups: [
        { component_type: 'RECIPIENTE', items: [VASO] },
        { component_type: 'TAMAÑO', items: [GRANDE] },
        { component_type: 'SABOR', items: [CHOCOLATE, FRESA] },
        { component_type: 'EXTRA', items: [CHISPAS, NUEZ] },
        { component_type: 'BEBIDA_BASE', items: [] },
    ],
};

function estadoCompleto() {
    return {
        stepIndex: 4,
        base: VASO,
        tamano: GRANDE,
        sabores: [CHOCOLATE, FRESA],
        toppings: [CHISPAS],
        extras: [NUEZ],
        recipientName: 'Ana',
    };
}

// ─────────────────────────────────────────────────────────────
// 1. El canal NO viaja en el payload del frontend
// ─────────────────────────────────────────────────────────────
describe('Contrato: el canal es responsabilidad del backend (Opción 2)', () => {
    it('1. buildPreComandaPayload NO incluye `channel` en el item', () => {
        const { ok, item } = buildPreComandaPayload(estadoCompleto(), MENU);
        expect(ok).toBe(true);
        expect(item).not.toHaveProperty('channel');
    });

    it('2. ningún componente incluye `channel`', () => {
        const { item } = buildPreComandaPayload(estadoCompleto(), MENU);
        item.components.forEach((c) => {
            expect(c).not.toHaveProperty('channel');
        });
    });

    it('3. createHeladeriaTicket envía channel=HELADERIA en el MISMO reserve (inspección de fuente)', () => {
        const src = readFileSync(
            resolve(__dirname, '../services/heladeriaService.js'),
            'utf8',
        );
        // Debe existir el reserve con channel HELADERIA...
        expect(src).toMatch(/\/pos\/tickets\/reserve/);
        expect(src).toMatch(/channel:\s*'HELADERIA'/);
        // ...y NO debe existir un segundo PUT que setee el canal (defecto cerrado).
        expect(src).not.toMatch(/method:\s*'PUT'/);
    });
});

// ─────────────────────────────────────────────────────────────
// 2. Mapeo de component_type por paso
// ─────────────────────────────────────────────────────────────
describe('Contrato: component_type por paso (STEP_TO_COMPONENT_TYPE)', () => {
    it('4. el mapeo cubre TODOS los pasos del configurador', () => {
        CONFIGURATOR_STEPS.forEach((step) => {
            expect(STEP_TO_COMPONENT_TYPE[step]).toBeTruthy();
        });
    });

    it('5. base → RECIPIENTE', () => {
        expect(STEP_TO_COMPONENT_TYPE.base).toBe('RECIPIENTE');
    });

    it('6. tamano → TAMAÑO', () => {
        expect(STEP_TO_COMPONENT_TYPE.tamano).toBe('TAMAÑO');
    });

    it('7. sabores → SABOR', () => {
        expect(STEP_TO_COMPONENT_TYPE.sabores).toBe('SABOR');
    });

    it('8. toppings y extras → EXTRA', () => {
        expect(STEP_TO_COMPONENT_TYPE.toppings).toBe('EXTRA');
        expect(STEP_TO_COMPONENT_TYPE.extras).toBe('EXTRA');
    });

    it('9. el payload emite exactamente los tipos esperados (1 RECIPIENTE, 1 TAMAÑO, 2 SABOR, 2 EXTRA)', () => {
        const { item } = buildPreComandaPayload(estadoCompleto(), MENU);
        const tipos = item.components.map((c) => c.component_type);
        expect(tipos.filter((t) => t === 'RECIPIENTE')).toHaveLength(1);
        expect(tipos.filter((t) => t === 'TAMAÑO')).toHaveLength(1);
        expect(tipos.filter((t) => t === 'SABOR')).toHaveLength(2);
        expect(tipos.filter((t) => t === 'EXTRA')).toHaveLength(2);
    });

    it('10. NUNCA emite BEBIDA_BASE (exclusivo de malteadas del POS)', () => {
        const { item } = buildPreComandaPayload(estadoCompleto(), MENU);
        const tipos = item.components.map((c) => c.component_type);
        expect(tipos).not.toContain('BEBIDA_BASE');
    });
});

// ─────────────────────────────────────────────────────────────
// 3. Forma del item cabeza (lo que consume items/add)
// ─────────────────────────────────────────────────────────────
describe('Contrato: item cabeza compatible con TicketItemAdd', () => {
    it('11. el product_id del item es el del RECIPIENTE', () => {
        const { item } = buildPreComandaPayload(estadoCompleto(), MENU);
        expect(item.product_id).toBe(VASO.product_id);
    });

    it('12. quantity es entero >= 1', () => {
        const { item } = buildPreComandaPayload(estadoCompleto(), MENU);
        expect(Number.isInteger(item.quantity)).toBe(true);
        expect(item.quantity).toBeGreaterThanOrEqual(1);
    });

    it('13. unit_price es numérico y coincide con computeUnitPrice', () => {
        const { item } = buildPreComandaPayload(estadoCompleto(), MENU);
        expect(typeof item.unit_price).toBe('number');
        // 45 (base) + 10 (tamaño) + 8 + 8 (sabores) + 5 (topping) + 7 (extra) = 83
        expect(item.unit_price).toBe(83);
    });

    it('14. cada componente tiene product_id, component_type, component_name, unit_price y quantity', () => {
        const { item } = buildPreComandaPayload(estadoCompleto(), MENU);
        item.components.forEach((c) => {
            expect(c.product_id).toBeGreaterThan(0);
            expect(typeof c.component_type).toBe('string');
            expect(typeof c.component_name).toBe('string');
            expect(typeof c.unit_price).toBe('number');
            expect(Number.isInteger(c.quantity)).toBe(true);
        });
    });

    it('15. recipient_name se propaga desde meta', () => {
        const { item } = buildPreComandaPayload(estadoCompleto(), MENU, { recipientName: 'Luis' });
        expect(item.recipient_name).toBe('Luis');
    });
});

// ─────────────────────────────────────────────────────────────
// 4. El hook usa la cola offline REAL
// ─────────────────────────────────────────────────────────────
describe('Contrato: cola offline real en usePreComanda', () => {
    it('16. usePreComanda importa enqueueOperation del offline store', () => {
        const src = readFileSync(
            resolve(__dirname, '../hooks/usePreComanda.js'),
            'utf8',
        );
        expect(src).toMatch(/heladeriaOfflineStore/);
        expect(src).toMatch(/enqueueOperation/);
    });

    it('17. usePreComanda NO genera folios localmente', () => {
        const src = readFileSync(
            resolve(__dirname, '../hooks/usePreComanda.js'),
            'utf8',
        );
        // No debe fabricar un account_num con Date.now()/Math.random().
        expect(src).not.toMatch(/account_num\s*[:=]\s*['"`]?\$\{?Date\.now/);
        expect(src).not.toMatch(/account_num\s*[:=]\s*Math\.random/);
    });

    it('18. cancelarPreComanda usa items/remove (no un endpoint cancel inexistente)', () => {
        const src = readFileSync(
            resolve(__dirname, '../hooks/usePreComanda.js'),
            'utf8',
        );
        expect(src).toMatch(/removeItemFromTicket/);
        expect(src).not.toMatch(/\/tickets\/cancel/);
    });
});
