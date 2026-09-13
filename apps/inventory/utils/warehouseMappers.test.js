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
    mapVisionDetectionsToProposals,
    validateVisionSnapshot,
    buildVisionSnapshotPayload,
    VOICE_CONFIDENCE_THRESHOLD,
    mapVoiceIntentToProposal,
    validateVoiceEntry,
    buildVoiceEntryPayload,
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

// ============================================================================
// v7 (Fase 6.3): Escaner IA de Vision — human-in-the-loop
// ============================================================================
describe('Vision: mapeo de detecciones a propuestas', () => {
    const insumos = [
        { id: 'INS-HARINA', nombre: 'Harina', unidad_base: 'KG' },
        { id: 'INS-AZUCAR', nombre: 'Azucar', unidad_base: 'KG' },
    ];

    it('resuelve el insumo por id (label == id)', () => {
        const props = mapVisionDetectionsToProposals(
            [{ label: 'INS-HARINA', qty: 3, confidence: 0.98 }],
            insumos
        );
        expect(props).toHaveLength(1);
        expect(props[0].item_id).toBe('INS-HARINA');
        expect(props[0].nombre).toBe('Harina');
        expect(props[0].unidad).toBe('KG');
        expect(props[0].cantidad).toBe(3);
        expect(props[0].confianza).toBe(0.98);
    });

    it('resuelve el insumo por nombre (case-insensitive)', () => {
        const props = mapVisionDetectionsToProposals(
            [{ label: 'azucar', qty: 2, confidence: 0.9 }],
            insumos
        );
        expect(props[0].item_id).toBe('INS-AZUCAR');
        expect(props[0].nombre).toBe('Azucar');
    });

    it('deja el label crudo si no hay match en el catalogo', () => {
        const props = mapVisionDetectionsToProposals(
            [{ label: 'DESCONOCIDO', qty: 1, confidence: 0.5 }],
            insumos
        );
        expect(props[0].item_id).toBe('DESCONOCIDO');
        expect(props[0].unidad).toBe('PZA');
    });

    it('nunca marca una propuesta como confirmada por defecto (human-in-the-loop)', () => {
        const props = mapVisionDetectionsToProposals(
            [{ label: 'INS-HARINA', qty: 3, confidence: 0.98 }],
            insumos
        );
        expect(props[0].confirmado).toBe(false);
    });

    it('no crashea con entradas nulas', () => {
        expect(mapVisionDetectionsToProposals(null, null)).toEqual([]);
        expect(mapVisionDetectionsToProposals(undefined, insumos)).toEqual([]);
    });
});

describe('Vision: validacion de entrada confirmada', () => {
    it('exige almacen destino', () => {
        const r = validateVisionSnapshot('', [{ cantidad: 1, confirmado: true }]);
        expect(r.ok).toBe(false);
        expect(r.error).toMatch(/almacén destino/i);
    });

    it('exige al menos una propuesta confirmada con cantidad > 0', () => {
        const r = validateVisionSnapshot('alm_1', [
            { cantidad: 3, confirmado: false },
            { cantidad: 0, confirmado: true },
        ]);
        expect(r.ok).toBe(false);
        expect(r.error).toMatch(/confirma/i);
    });

    it('acepta cuando hay una confirmada valida', () => {
        const r = validateVisionSnapshot('alm_1', [
            { cantidad: 3, confirmado: true },
            { cantidad: 5, confirmado: false },
        ]);
        expect(r.ok).toBe(true);
    });

    it('no crashea con propuestas nulas', () => {
        expect(validateVisionSnapshot('alm_1', null).ok).toBe(false);
    });
});

describe('Vision: payload de entrada por vision', () => {
    it('solo incluye las propuestas confirmadas con cantidad > 0', () => {
        const payload = buildVisionSnapshotPayload(
            [
                { item_id: 'A', item_type: 'INSUMO', cantidad: 3, confianza: 0.9, confirmado: true },
                { item_id: 'B', item_type: 'INSUMO', cantidad: 5, confianza: 0.8, confirmado: false },
                { item_id: 'C', item_type: 'INSUMO', cantidad: 0, confianza: 0.7, confirmado: true },
            ],
            'USR-1'
        );
        expect(payload.items).toHaveLength(1);
        expect(payload.items[0].item_id).toBe('A');
        expect(payload.items[0].cantidad).toBe(3);
        expect(payload.usuario_id).toBe('USR-1');
    });

    it('propaga la metadata de trazabilidad (imagen_ref y modelo)', () => {
        const payload = buildVisionSnapshotPayload(
            [{ item_id: 'A', cantidad: 1, confirmado: true }],
            'USR-1',
            { imagen_ref: 'sha256:abc', modelo: 'local-orb' }
        );
        expect(payload.imagen_ref).toBe('sha256:abc');
        expect(payload.modelo).toBe('local-orb');
    });

    it('usa null como metadata por defecto', () => {
        const payload = buildVisionSnapshotPayload([], 'USR-1');
        expect(payload.imagen_ref).toBeNull();
        expect(payload.modelo).toBeNull();
        expect(payload.items).toEqual([]);
    });
});

// ============================================================================
// v7 (Fase 6.5): Captura de Inventario por Voz — human-in-the-loop
// ============================================================================
describe('Voz: mapeo de intencion a propuesta', () => {
    const insumos = [
        { id: 'INS-HARINA', nombre: 'Harina', unidad_base: 'KG' },
        { id: 'INS-AZUCAR', nombre: 'Azucar', unidad_base: 'KG' },
    ];

    it('resuelve el insumo por SKU exacto', () => {
        const p = mapVoiceIntentToProposal(
            {
                intencion: 'ENTRADA',
                sku: 'INS-HARINA',
                cantidad: 5,
                unidad: 'KG',
                confianza: 0.95,
                texto_original: 'entrada de cinco kilos de harina',
            },
            insumos
        );
        expect(p.item_id).toBe('INS-HARINA');
        expect(p.nombre).toBe('Harina');
        expect(p.cantidad).toBe(5);
        expect(p.sku_resuelto).toBe(true);
        expect(p.revisar).toBe(false);
    });

    it('resuelve el insumo por nombre (case-insensitive)', () => {
        const p = mapVoiceIntentToProposal(
            { intencion: 'ENTRADA', sku: 'azucar', cantidad: 2, confianza: 0.9 },
            insumos
        );
        expect(p.item_id).toBe('INS-AZUCAR');
        expect(p.sku_resuelto).toBe(true);
    });

    it('marca sku_resuelto=false si el SKU no existe en el catalogo', () => {
        const p = mapVoiceIntentToProposal(
            { intencion: 'ENTRADA', sku: 'NO-EXISTE', cantidad: 1, confianza: 0.9 },
            insumos
        );
        expect(p.sku_resuelto).toBe(false);
        expect(p.item_id).toBe('NO-EXISTE');
    });

    it('marca revisar=true cuando la confianza es menor al umbral', () => {
        const p = mapVoiceIntentToProposal(
            { intencion: 'ENTRADA', sku: 'INS-HARINA', cantidad: 1, confianza: 0.4 },
            insumos
        );
        expect(p.confianza).toBe(0.4);
        expect(p.revisar).toBe(true);
        expect(VOICE_CONFIDENCE_THRESHOLD).toBe(0.7);
    });

    it('nunca marca la propuesta como confirmada por defecto (human-in-the-loop)', () => {
        const p = mapVoiceIntentToProposal(
            { intencion: 'ENTRADA', sku: 'INS-HARINA', cantidad: 5, confianza: 0.99 },
            insumos
        );
        expect(p.confirmado).toBe(false);
    });

    it('normaliza una intencion desconocida a ENTRADA', () => {
        const p = mapVoiceIntentToProposal(
            { intencion: 'INVENTAR', sku: 'INS-HARINA', cantidad: 1, confianza: 0.9 },
            insumos
        );
        expect(p.intencion).toBe('ENTRADA');
    });

    it('conserva el texto_original para trazabilidad', () => {
        const p = mapVoiceIntentToProposal(
            {
                intencion: 'MERMA',
                sku: 'INS-HARINA',
                cantidad: 1,
                confianza: 0.8,
                texto_original: 'merma de un kilo de harina',
            },
            insumos
        );
        expect(p.intencion).toBe('MERMA');
        expect(p.texto_original).toBe('merma de un kilo de harina');
    });

    it('no crashea con entradas nulas', () => {
        const p = mapVoiceIntentToProposal(null, null);
        expect(p.confirmado).toBe(false);
        expect(p.cantidad).toBe(0);
        expect(p.sku_resuelto).toBe(false);
    });
});

describe('Voz: validacion de entrada dictada', () => {
    const base = {
        item_id: 'INS-HARINA',
        cantidad: 5,
        sku_resuelto: true,
        confirmado: true,
    };

    it('exige almacen destino', () => {
        const r = validateVoiceEntry('', base);
        expect(r.ok).toBe(false);
        expect(r.error).toMatch(/almacén destino/i);
    });

    it('exige que el SKU este resuelto', () => {
        const r = validateVoiceEntry('alm_1', { ...base, sku_resuelto: false });
        expect(r.ok).toBe(false);
        expect(r.error).toMatch(/insumo correcto/i);
    });

    it('exige cantidad mayor a cero', () => {
        const r = validateVoiceEntry('alm_1', { ...base, cantidad: 0 });
        expect(r.ok).toBe(false);
        expect(r.error).toMatch(/cantidad/i);
    });

    it('exige confirmacion explicita del operador', () => {
        const r = validateVoiceEntry('alm_1', { ...base, confirmado: false });
        expect(r.ok).toBe(false);
        expect(r.error).toMatch(/confirma/i);
    });

    it('acepta una propuesta completa y confirmada', () => {
        expect(validateVoiceEntry('alm_1', base).ok).toBe(true);
    });

    it('no crashea con propuesta nula', () => {
        expect(validateVoiceEntry('alm_1', null).ok).toBe(false);
    });
});

describe('Voz: payload de entrada por voz', () => {
    it('incluye metodo_captura VOZ y el texto_original', () => {
        const payload = buildVoiceEntryPayload(
            {
                item_id: 'INS-HARINA',
                item_type: 'INSUMO',
                cantidad: '5',
                unidad: 'KG',
                confianza: 0.93,
                texto_original: 'entrada de cinco kilos de harina',
            },
            'USR-1'
        );
        expect(payload.item_id).toBe('INS-HARINA');
        expect(payload.cantidad).toBe(5);
        expect(payload.unidad).toBe('KG');
        expect(payload.usuario_id).toBe('USR-1');
        expect(payload.metodo_captura).toBe('VOZ');
        expect(payload.texto_original).toBe('entrada de cinco kilos de harina');
    });

    it('usa valores por defecto seguros cuando faltan campos', () => {
        const payload = buildVoiceEntryPayload({ item_id: 'X', cantidad: 1 }, 'USR-2');
        expect(payload.item_type).toBe('INSUMO');
        expect(payload.unidad).toBe('PZA');
        expect(payload.confianza).toBeNull();
        expect(payload.texto_original).toBeNull();
    });

    it('no crashea con propuesta nula', () => {
        const payload = buildVoiceEntryPayload(null, 'USR-3');
        expect(payload.metodo_captura).toBe('VOZ');
        expect(payload.usuario_id).toBe('USR-3');
    });
});
