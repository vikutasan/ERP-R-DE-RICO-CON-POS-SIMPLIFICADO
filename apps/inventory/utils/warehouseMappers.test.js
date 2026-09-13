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
    ICONOS_SUBCATEGORIA,
    CODIGO_CUARENTENA,
    mapPropositoFromApi,
    mapPropositosFromApi,
    sortPropositos,
    propositosParaBarra,
    codigoDesdeLabel,
    validatePropositoForm,
    buildPropositoCreatePayload,
    validatePropositoDelete,
    buildTrasladoSubcategoriaPayload,
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

    // v9 (Fase 9.3): la categoria y la subcategoria provienen de la NAVEGACION
    // (zona -> pestana de subcategoria), no de campos editables del modal.
    // Estos casos blindan ese contrato: si alguien vuelve a introducir un
    // selector editable en el modal, el payload dejaria de reflejar la
    // navegacion y estas pruebas fallarian.
    it('v9: refleja la navegacion cuando el modal no trae type ni proposito', () => {
        const payload = buildWarehouseCreatePayload(
            { name: 'CAMARA 1', icon: '🧊', capacity: 50 },
            'CONGELADO',
            'ALMACENAMIENTO',
        );
        expect(payload.zona_termica).toBe('CONGELADO');
        expect(payload.proposito).toBe('ALMACENAMIENTO');
    });

    it('v9: la subcategoria de navegacion se conserva aunque sea la cuarentena', () => {
        const payload = buildWarehouseCreatePayload(
            { name: 'SIN ASIGNAR' },
            'SECO',
            'SIN_CLASIFICAR',
        );
        expect(payload.zona_termica).toBe('SECO');
        expect(payload.proposito).toBe('SIN_CLASIFICAR');
    });

    it('v9: el type explicito del formulario gana sobre selectedZone', () => {
        const payload = buildWarehouseCreatePayload(
            { name: 'X', type: 'REFRIGERADO' },
            'SECO',
            'ALMACENAMIENTO',
        );
        expect(payload.zona_termica).toBe('REFRIGERADO');
        expect(payload.proposito).toBe('ALMACENAMIENTO');
    });

    // v10 (Fase 10.4): representacion visual y pautas de acomodo. Las columnas
    // foto_url, planograma_url y pautas_acomodo ya existian en el modelo desde
    // v7; v10 las expone en la UI. Se envian SIEMPRE (aunque sean null / []),
    // porque update_warehouse usa exclude_unset=True: omitirlas impediria al
    // operador quitar una foto ya guardada.
    it('v10: envia foto_url, planograma_url y pautas_acomodo cuando existen', () => {
        const payload = buildWarehouseCreatePayload({
            name: 'CAMARA 1',
            fotoUrl: '/static/inventory/alm_abc123.jpg',
            planogramaUrl: '/static/inventory/alm_def456.png',
            pautasAcomodo: ['PESADO ABAJO', 'ROTACION PEPS'],
        });
        expect(payload.foto_url).toBe('/static/inventory/alm_abc123.jpg');
        expect(payload.planograma_url).toBe('/static/inventory/alm_def456.png');
        expect(payload.pautas_acomodo).toEqual(['PESADO ABAJO', 'ROTACION PEPS']);
    });

    it('v10: normaliza a null y lista vacia cuando no hay representacion visual', () => {
        const payload = buildWarehouseCreatePayload({ name: 'X' });
        expect(payload.foto_url).toBeNull();
        expect(payload.planograma_url).toBeNull();
        expect(payload.pautas_acomodo).toEqual([]);
    });

    it('v10: tolera pautasAcomodo corrupto (no-array) sin romper el payload', () => {
        const payload = buildWarehouseCreatePayload({
            name: 'X',
            pautasAcomodo: 'NO ES UN ARRAY',
        });
        expect(payload.pautas_acomodo).toEqual([]);
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

// ---------------------------------------------------------------------------
// v8 (Fase 8.5): Subcategorias de almacen (warehouse_propositos)
// ---------------------------------------------------------------------------

describe('v8: mapeo de subcategorias API -> UI', () => {
    it('mapea snake_case -> camelCase y conserva el icono', () => {
        const api = {
            id: 'wpr_1',
            codigo: 'EXHIBICION_VENTA',
            label: 'Almacenes/Exhibidores',
            icon: '🏪',
            orden: 1,
            es_sistema: true,
            es_cuarentena: false,
            activo: true,
            almacenes_count: 3,
        };
        const ui = mapPropositoFromApi(api);
        expect(ui.codigo).toBe('EXHIBICION_VENTA');
        expect(ui.label).toBe('Almacenes/Exhibidores');
        expect(ui.icon).toBe('🏪');
        expect(ui.esSistema).toBe(true);
        expect(ui.esCuarentena).toBe(false);
        expect(ui.almacenesCount).toBe(3);
    });

    it('no crashea con entrada nula y aplica valores seguros', () => {
        const ui = mapPropositoFromApi(null);
        expect(ui.codigo).toBeUndefined();
        expect(ui.label).toBe('Sin nombre');
        expect(ui.icon).toBe('📦');
        expect(ui.orden).toBe(0);
        expect(ui.almacenesCount).toBe(0);
        expect(ui.esSistema).toBe(false);
        expect(ui.activo).toBe(true);
    });

    it('mapPropositosFromApi devuelve arreglo vacio si la API no responde lista', () => {
        expect(mapPropositosFromApi(null)).toEqual([]);
        expect(mapPropositosFromApi(undefined)).toEqual([]);
    });
});

describe('v8: orden y filtrado de la barra de subcategorias', () => {
    it('sortPropositos ordena por orden y no muta el arreglo original', () => {
        const original = [
            { codigo: 'C', orden: 30 },
            { codigo: 'A', orden: 10 },
            { codigo: 'B', orden: 20 },
        ];
        const copia = [...original];
        const ordenado = sortPropositos(original);
        expect(ordenado.map((p) => p.codigo)).toEqual(['A', 'B', 'C']);
        expect(original).toEqual(copia);
    });

    it('propositosParaBarra excluye la cuarentena y las inactivas', () => {
        const lista = [
            { codigo: 'EXHIBICION_VENTA', orden: 1, activo: true, esCuarentena: false },
            { codigo: CODIGO_CUARENTENA, orden: 999, activo: true, esCuarentena: true },
            { codigo: 'OBSOLETA', orden: 5, activo: false, esCuarentena: false },
            { codigo: 'ALMACENAMIENTO', orden: 2, activo: true, esCuarentena: false },
        ];
        const barra = propositosParaBarra(lista);
        expect(barra.map((p) => p.codigo)).toEqual(['EXHIBICION_VENTA', 'ALMACENAMIENTO']);
    });
});

describe('v8: normalizacion de codigo desde label', () => {
    it('quita acentos, mayusculas y reemplaza no alfanumericos por guion bajo', () => {
        expect(codigoDesdeLabel('Almacén de Insumos')).toBe('ALMACEN_DE_INSUMOS');
        expect(codigoDesdeLabel('Almacenes/Exhibidores')).toBe('ALMACENES_EXHIBIDORES');
    });

    it('antepone SUB_ cuando no inicia con letra y respeta el limite de 40', () => {
        expect(codigoDesdeLabel('123 Refrigerados')).toBe('SUB_123_REFRIGERADOS');
        const largo = codigoDesdeLabel('A'.repeat(80));
        expect(largo.length).toBeLessThanOrEqual(40);
    });
});

describe('v8: validacion del formulario de subcategoria', () => {
    it('rechaza label demasiado corto y acepta uno valido', () => {
        expect(validatePropositoForm({ label: 'A', icon: '📦' }).ok).toBe(false);
        expect(validatePropositoForm({ label: 'Refrigerados', icon: '🧊' }).ok).toBe(true);
    });

    it('rechaza un icono fuera de la paleta curada', () => {
        const r = validatePropositoForm({ label: 'Refrigerados', icon: '🚀' });
        expect(r.ok).toBe(false);
        expect(ICONOS_SUBCATEGORIA).toContain('🧊');
    });

    it('detecta codigo duplicado salvo cuando se esta editando el mismo', () => {
        const existentes = [{ codigo: 'ALMACENAMIENTO' }];
        const dup = validatePropositoForm(
            { label: 'Almacenamiento', icon: '📦' },
            existentes,
            null
        );
        expect(dup.ok).toBe(false);
        const mismo = validatePropositoForm(
            { label: 'Almacenamiento', icon: '📦' },
            existentes,
            'ALMACENAMIENTO'
        );
        expect(mismo.ok).toBe(true);
    });

    it('buildPropositoCreatePayload arma el contrato snake_case', () => {
        const payload = buildPropositoCreatePayload({ label: 'Refrigerados', icon: '🧊' });
        expect(payload.codigo).toBe('REFRIGERADOS');
        expect(payload.label).toBe('Refrigerados');
        expect(payload.icon).toBe('🧊');
    });
});

describe('v8: guardas de borrado de subcategoria', () => {
    it('bloquea el borrado de una subcategoria de sistema', () => {
        const r = validatePropositoDelete({
            codigo: 'ALMACENAMIENTO',
            esSistema: true,
            esCuarentena: false,
            almacenesCount: 0,
        });
        expect(r.puedeBorrar).toBe(false);
        expect(r.requiereTraslado).toBe(false);
    });

    it('exige traslado cuando la subcategoria tiene almacenes', () => {
        const r = validatePropositoDelete({
            codigo: 'REFRI',
            esSistema: false,
            esCuarentena: false,
            almacenesCount: 4,
        });
        expect(r.puedeBorrar).toBe(false);
        expect(r.requiereTraslado).toBe(true);
    });

    it('permite borrar una subcategoria vacia y no de sistema', () => {
        const r = validatePropositoDelete({
            codigo: 'REFRI',
            esSistema: false,
            esCuarentena: false,
            almacenesCount: 0,
        });
        expect(r.puedeBorrar).toBe(true);
    });

    it('buildTrasladoSubcategoriaPayload arma origen y destino', () => {
        const payload = buildTrasladoSubcategoriaPayload('REFRI', CODIGO_CUARENTENA);
        expect(payload.origen_codigo).toBe('REFRI');
        expect(payload.destino_codigo).toBe('SIN_CLASIFICAR');
    });
});
