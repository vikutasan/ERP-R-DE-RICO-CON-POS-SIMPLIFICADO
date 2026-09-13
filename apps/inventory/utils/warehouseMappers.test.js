/**
 * v7 (Fase 3.2): Tests Vitest del mapeo de campos API -> UI, validacion de
 * formularios y calculo de alertas PEPS del modulo de almacenes.
 *
 * Cubre los defectos historicos del Cementerio de Bugs:
 *  - BUG 1: crash de UI por desajuste de nombres de campos (API vs Frontend).
 *  - BUG 2: crash en el detalle del almacen por .map() (Stock UI vs Stock Backend).
 */
import { describe, it, expect } from 'vitest';
import {
    resolveUserId,
    iconForZonaTermica,
    mapWarehouseFromApi,
    mapWarehousesFromApi,
    mapStockFromApi,
    mapStockListFromApi,
    buildWarehouseCreatePayload,
    validateBulkEntry,
    buildBulkEntryPayload,
    validateMerma,
    validateTraspaso,
    calcularAlertaPEPS,
    calcularValorLinea,
} from './warehouseMappers.js';

// ---------------------------------------------------------------------------
// 1. Mapeo de campos API (espanol) -> UI (ingles)
// ---------------------------------------------------------------------------
describe('Mapeo de almacenes API -> UI', () => {
    it('mapea nombre -> name y zona_termica -> type', () => {
        const api = { id: 'alm_1', nombre: 'Bodega Seca', zona_termica: 'SECO' };
        const ui = mapWarehouseFromApi(api);
        expect(ui.name).toBe('Bodega Seca');
        expect(ui.type).toBe('SECO');
        expect(ui.id).toBe('alm_1');
    });

    it('conserva los campos originales del API (spread)', () => {
        const api = { id: 'alm_2', nombre: 'Congelador', zona_termica: 'CONGELADO', proposito: 'ALMACENAMIENTO' };
        const ui = mapWarehouseFromApi(api);
        expect(ui.proposito).toBe('ALMACENAMIENTO');
    });

    it('usa fallback "Sin nombre" cuando falta nombre', () => {
        const ui = mapWarehouseFromApi({ id: 'alm_3' });
        expect(ui.name).toBe('Sin nombre');
    });

    it('usa fallback SECO cuando falta zona_termica', () => {
        const ui = mapWarehouseFromApi({ id: 'alm_4', nombre: 'X' });
        expect(ui.type).toBe('SECO');
    });

    it('deriva el icono correcto por zona termica', () => {
        expect(iconForZonaTermica('CONGELADO')).toBe('❄️');
        expect(iconForZonaTermica('REFRIGERADO')).toBe('🧊');
        expect(iconForZonaTermica('SECO')).toBe('📦');
        expect(iconForZonaTermica(undefined)).toBe('📦');
    });

    it('inicializa capacity=100 y current=0', () => {
        const ui = mapWarehouseFromApi({ id: 'alm_5', nombre: 'Y', zona_termica: 'SECO' });
        expect(ui.capacity).toBe(100);
        expect(ui.current).toBe(0);
    });

    it('mapea una lista completa sin crashear (BUG 1)', () => {
        const lista = [
            { id: 'a', nombre: 'A', zona_termica: 'SECO' },
            { id: 'b', nombre: 'B', zona_termica: 'CONGELADO' },
        ];
        const ui = mapWarehousesFromApi(lista);
        expect(ui).toHaveLength(2);
        expect(ui[1].icon).toBe('❄️');
    });

    it('devuelve arreglo vacio si la entrada no es arreglo', () => {
        expect(mapWarehousesFromApi(null)).toEqual([]);
        expect(mapWarehousesFromApi(undefined)).toEqual([]);
    });
});

describe('Mapeo de stock API -> UI', () => {
    const apiItem = {
        item_id: 'TEST_SKU_A',
        item_name: 'Harina Premium',
        item_type: 'INSUMO',
        cantidad_actual: 42.5,
        item_unit: 'KG',
        stock_minimo: 10,
        dias_anaquel_alerta: 2,
        item_price: 25.5,
        item_image_url: 'https://cdn/x.png',
    };

    it('mapea item_id -> sku y cantidad_actual -> stock', () => {
        const ui = mapStockFromApi(apiItem);
        expect(ui.sku).toBe('TEST_SKU_A');
        expect(ui.stock).toBe(42.5);
    });

    it('mapea stock_minimo -> minStock y dias_anaquel_alerta -> alertDays', () => {
        const ui = mapStockFromApi(apiItem);
        expect(ui.minStock).toBe(10);
        expect(ui.alertDays).toBe(2);
    });

    it('mapea item_unit -> unit y construye presentation', () => {
        const ui = mapStockFromApi(apiItem);
        expect(ui.unit).toBe('KG');
        expect(ui.presentation).toBe('1 KG');
    });

    it('mapea item_price -> costPerPresentation e item_image_url -> imgUrl', () => {
        const ui = mapStockFromApi(apiItem);
        expect(ui.costPerPresentation).toBe(25.5);
        expect(ui.imgUrl).toBe('https://cdn/x.png');
    });

    it('usa fallbacks cuando faltan campos opcionales', () => {
        const ui = mapStockFromApi({ item_id: 'SKU_MIN', cantidad_actual: 5 });
        expect(ui.name).toBe('SKU_MIN');
        expect(ui.unit).toBe('PZA');
        expect(ui.alertDays).toBe(0);
        expect(ui.costPerPresentation).toBe(0);
        expect(ui.imgUrl).toBeNull();
        expect(ui.provider).toBe('PROVEEDOR GENERAL');
    });

    it('mapea una lista de stock sin crashear (BUG 2)', () => {
        const ui = mapStockListFromApi([apiItem, { item_id: 'B', cantidad_actual: 1 }]);
        expect(ui).toHaveLength(2);
        expect(ui[0].sku).toBe('TEST_SKU_A');
        expect(ui[1].sku).toBe('B');
    });

    it('devuelve arreglo vacio si la entrada no es arreglo', () => {
        expect(mapStockListFromApi(undefined)).toEqual([]);
    });
});

// ---------------------------------------------------------------------------
// 2. Validacion de formularios
// ---------------------------------------------------------------------------
describe('resolveUserId', () => {
    it('convierte el id numerico a string', () => {
        expect(resolveUserId({ id: 7 })).toBe('7');
    });

    it('devuelve SISTEMA si no hay usuario', () => {
        expect(resolveUserId(null)).toBe('SISTEMA');
        expect(resolveUserId(undefined)).toBe('SISTEMA');
        expect(resolveUserId({})).toBe('SISTEMA');
    });

    it('devuelve SISTEMA si el id es null', () => {
        expect(resolveUserId({ id: null })).toBe('SISTEMA');
    });
});

describe('Validacion de entrada masiva', () => {
    it('rechaza si no hay almacen destino', () => {
        const r = validateBulkEntry('', [{ cantidad: 5 }]);
        expect(r.ok).toBe(false);
        expect(r.error).toMatch(/almacén destino/i);
    });

    it('rechaza si no hay items', () => {
        const r = validateBulkEntry('alm_1', []);
        expect(r.ok).toBe(false);
    });

    it('rechaza cantidades <= 0', () => {
        const r = validateBulkEntry('alm_1', [{ cantidad: 0 }, { cantidad: -3 }]);
        expect(r.ok).toBe(false);
        expect(r.error).toMatch(/mayor a 0/i);
    });

    it('acepta un lote valido', () => {
        const r = validateBulkEntry('alm_1', [{ cantidad: 5 }, { cantidad: '2.5' }]);
        expect(r.ok).toBe(true);
        expect(r.error).toBeNull();
    });

    it('construye el payload con cantidad numerica y usuario_id', () => {
        const payload = buildBulkEntryPayload(
            [{ item_id: 'SKU_A', item_type: 'INSUMO', cantidad: '3.5', notas: 'lote' }],
            '7'
        );
        expect(payload.usuario_id).toBe('7');
        expect(payload.items[0].cantidad).toBe(3.5);
        expect(payload.items[0].notas).toBe('lote');
    });

    it('usa item_type INSUMO y notas null por defecto', () => {
        const payload = buildBulkEntryPayload([{ item_id: 'SKU_B', cantidad: '1' }], 'SISTEMA');
        expect(payload.items[0].item_type).toBe('INSUMO');
        expect(payload.items[0].notas).toBeNull();
    });
});

describe('Validacion de merma', () => {
    const base = { almacen_id: 'alm_1', item_id: 'SKU_A', item_type: 'INSUMO', cantidad: '2', notas: 'caduco' };

    it('acepta un formulario completo', () => {
        expect(validateMerma(base).ok).toBe(true);
    });

    it('exige las notas/motivo', () => {
        const r = validateMerma({ ...base, notas: '' });
        expect(r.ok).toBe(false);
        expect(r.error).toMatch(/notas\/motivo/i);
    });

    it('exige almacen, item y cantidad', () => {
        expect(validateMerma({ ...base, almacen_id: '' }).ok).toBe(false);
        expect(validateMerma({ ...base, item_id: '' }).ok).toBe(false);
        expect(validateMerma({ ...base, cantidad: '' }).ok).toBe(false);
    });

    it('no crashea con formulario nulo', () => {
        expect(validateMerma(null).ok).toBe(false);
    });
});

describe('Validacion de traspaso', () => {
    const base = {
        almacen_origen_id: 'alm_1',
        almacen_destino_id: 'alm_2',
        item_id: 'SKU_A',
        item_type: 'INSUMO',
        cantidad: '5',
    };

    it('acepta un traspaso valido', () => {
        expect(validateTraspaso(base).ok).toBe(true);
    });

    it('rechaza origen igual a destino', () => {
        const r = validateTraspaso({ ...base, almacen_destino_id: 'alm_1' });
        expect(r.ok).toBe(false);
        expect(r.error).toMatch(/mismo almacén/i);
    });

    it('exige todos los campos', () => {
        expect(validateTraspaso({ ...base, almacen_origen_id: '' }).ok).toBe(false);
        expect(validateTraspaso({ ...base, almacen_destino_id: '' }).ok).toBe(false);
        expect(validateTraspaso({ ...base, item_id: '' }).ok).toBe(false);
        expect(validateTraspaso({ ...base, cantidad: '' }).ok).toBe(false);
    });

    it('no crashea con formulario nulo', () => {
        expect(validateTraspaso(null).ok).toBe(false);
    });
});

describe('Payload de creacion de almacen', () => {
    it('mapea name -> nombre y type -> zona_termica', () => {
        const payload = buildWarehouseCreatePayload({ name: 'Bodega', type: 'REFRIGERADO' });
        expect(payload.nombre).toBe('Bodega');
        expect(payload.zona_termica).toBe('REFRIGERADO');
        expect(payload.activo).toBe(true);
    });

    it('usa selectedZone y subCategoryTab como fallback', () => {
        const payload = buildWarehouseCreatePayload({ name: 'X' }, 'CONGELADO', 'ALMACENAMIENTO');
        expect(payload.zona_termica).toBe('CONGELADO');
        expect(payload.proposito).toBe('ALMACENAMIENTO');
    });

    it('usa SECO y EXHIBICION_VENTA como ultimo fallback', () => {
        const payload = buildWarehouseCreatePayload({ name: 'X' });
        expect(payload.zona_termica).toBe('SECO');
        expect(payload.proposito).toBe('EXHIBICION_VENTA');
    });
});

// ---------------------------------------------------------------------------
// 3. Calculo de alertas PEPS
// ---------------------------------------------------------------------------
describe('Calculo de alertas PEPS', () => {
    it('AGOTADO cuando stock <= 0', () => {
        expect(calcularAlertaPEPS({ stock: 0, minStock: 5, alertDays: 0 })).toBe('AGOTADO');
        expect(calcularAlertaPEPS({ stock: -1, minStock: 5, alertDays: 0 })).toBe('AGOTADO');
    });

    it('CRITICO cuando stock <= minStock', () => {
        expect(calcularAlertaPEPS({ stock: 5, minStock: 5, alertDays: 0 })).toBe('CRITICO');
        expect(calcularAlertaPEPS({ stock: 3, minStock: 10, alertDays: 0 })).toBe('CRITICO');
    });

    it('POR_VENCER cuando alertDays esta dentro del umbral', () => {
        expect(calcularAlertaPEPS({ stock: 50, minStock: 10, alertDays: 2 })).toBe('POR_VENCER');
        expect(calcularAlertaPEPS({ stock: 50, minStock: 10, alertDays: 3 })).toBe('POR_VENCER');
    });

    it('OK cuando hay stock suficiente y sin vencimiento proximo', () => {
        expect(calcularAlertaPEPS({ stock: 50, minStock: 10, alertDays: 0 })).toBe('OK');
        expect(calcularAlertaPEPS({ stock: 50, minStock: 10, alertDays: 30 })).toBe('OK');
    });

    it('respeta un umbral personalizado', () => {
        expect(calcularAlertaPEPS({ stock: 50, minStock: 10, alertDays: 5 }, 7)).toBe('POR_VENCER');
        expect(calcularAlertaPEPS({ stock: 50, minStock: 10, alertDays: 5 }, 3)).toBe('OK');
    });

    it('prioriza AGOTADO sobre CRITICO y POR_VENCER', () => {
        expect(calcularAlertaPEPS({ stock: 0, minStock: 10, alertDays: 1 })).toBe('AGOTADO');
    });

    it('prioriza CRITICO sobre POR_VENCER', () => {
        expect(calcularAlertaPEPS({ stock: 2, minStock: 10, alertDays: 1 })).toBe('CRITICO');
    });

    it('no crashea con item nulo', () => {
        expect(calcularAlertaPEPS(null)).toBe('AGOTADO');
    });
});

describe('Calculo de valor de linea', () => {
    it('multiplica stock por costo', () => {
        expect(calcularValorLinea({ stock: 10, costPerPresentation: 2.5 })).toBe(25);
    });

    it('devuelve 0 con datos faltantes', () => {
        expect(calcularValorLinea({})).toBe(0);
        expect(calcularValorLinea(null)).toBe(0);
    });
});
