/**
 * v7 (Fase 3.2): Mapeadores puros API (espanol) -> UI (ingles) y validadores
 * de formularios del modulo de almacenes.
 *
 * Estos helpers se extraen de WarehouseManagerUI.jsx para poder probarlos con
 * Vitest sin montar React. La UI los consume; los tests los verifican.
 *
 * Regla de oro (Cementerio de Bugs, BUG 1 y BUG 2): el backend habla espanol
 * (nombre, zona_termica, cantidad_actual, stock_minimo...) y la UI habla ingles
 * (name, type, stock, minStock...). Un desajuste aqui crashea la UI.
 */

/**
 * Resuelve el usuario_id que exige el backend. Nunca devuelve vacio.
 * @param {{id?: number|string}|null} currentUser
 * @returns {string}
 */
export const resolveUserId = (currentUser) => {
    if (currentUser && currentUser.id !== undefined && currentUser.id !== null) {
        return String(currentUser.id);
    }
    return 'SISTEMA';
};

/**
 * Deriva el icono de un almacen a partir de su zona termica.
 * @param {string} zonaTermica
 * @returns {string}
 */
export const iconForZonaTermica = (zonaTermica) => {
    if (zonaTermica === 'CONGELADO') return '❄️';
    if (zonaTermica === 'REFRIGERADO') return '🧊';
    return '📦';
};

/**
 * Mapea un almacen del API al shape que espera la UI.
 * @param {object} wh
 * @returns {object}
 */
export const mapWarehouseFromApi = (wh) => ({
    ...wh,
    name: wh.nombre || wh.name || 'Sin nombre',
    type: wh.zona_termica || wh.type || 'SECO',
    icon: iconForZonaTermica(wh.zona_termica),
    // v10: representacion visual del almacen. `fotoUrl` es la fotografia real
    // del espacio fisico (opcional) y `planogramaUrl` la infografia de acomodo
    // (opcional). Ambas columnas ya existian en el modelo desde v7; hasta ahora
    // la UI no las exponia. `pautasAcomodo` son las instrucciones escritas.
    fotoUrl: wh.foto_url || null,
    planogramaUrl: wh.planograma_url || null,
    pautasAcomodo: Array.isArray(wh.pautas_acomodo) ? wh.pautas_acomodo : [],
    capacity: 100,
    current: 0,
});

/**
 * Mapea una lista de almacenes del API.
 * @param {Array<object>} lista
 * @returns {Array<object>}
 */
export const mapWarehousesFromApi = (lista) =>
    (Array.isArray(lista) ? lista : []).map(mapWarehouseFromApi);

/**
 * Mapea una linea de stock del API al shape que espera la UI.
 * @param {object} item
 * @returns {object}
 */
export const mapStockFromApi = (item) => ({
    sku: item.item_id,
    name: item.item_name || item.item_id,
    category: item.item_type,
    stock: item.cantidad_actual,
    unit: item.item_unit || 'PZA',
    minStock: item.stock_minimo,
    alertDays: item.dias_anaquel_alerta || 0,
    presentation: '1 ' + (item.item_unit || 'PZA'),
    costPerPresentation: item.item_price || 0,
    imgUrl: item.item_image_url || null,
    provider: 'PROVEEDOR GENERAL', // Default temporal
});

/**
 * Mapea una lista de stock del API.
 * @param {Array<object>} lista
 * @returns {Array<object>}
 */
export const mapStockListFromApi = (lista) =>
    (Array.isArray(lista) ? lista : []).map(mapStockFromApi);

/**
 * Construye el payload de creacion de almacen (UI ingles -> API espanol).
 * @param {object} formData
 * @param {string|null} selectedZone
 * @param {string|null} subCategoryTab
 * @returns {object}
 */
export const buildWarehouseCreatePayload = (formData, selectedZone = null, subCategoryTab = null) => ({
    nombre: formData.name,
    zona_termica: formData.type || selectedZone || 'SECO',
    proposito: formData.proposito || subCategoryTab || 'EXHIBICION_VENTA',
    // v10: representacion visual y pautas de acomodo. Se envian siempre (aunque
    // sean null / lista vacia) para que el backend pueda limpiarlos al editar:
    // si se omitieran, `exclude_unset=True` en update_warehouse los dejaria
    // intactos y el operador no podria quitar una foto ya guardada.
    foto_url: formData.fotoUrl || null,
    planograma_url: formData.planogramaUrl || null,
    pautas_acomodo: Array.isArray(formData.pautasAcomodo) ? formData.pautasAcomodo : [],
    activo: true,
});

/**
 * Valida el formulario de entrada masiva.
 * @param {string} bulkTargetWH
 * @param {Array<{cantidad: number|string}>} bulkEntryItems
 * @returns {{ok: boolean, error: string|null}}
 */
export const validateBulkEntry = (bulkTargetWH, bulkEntryItems) => {
    if (!bulkTargetWH || !bulkEntryItems || bulkEntryItems.length === 0) {
        return { ok: false, error: 'Selecciona un almacén destino y agrega al menos un insumo' };
    }
    const invalidItems = bulkEntryItems.filter((i) => !i.cantidad || i.cantidad <= 0);
    if (invalidItems.length > 0) {
        return { ok: false, error: 'Todos los items deben tener cantidad mayor a 0' };
    }
    return { ok: true, error: null };
};

/**
 * Construye el payload de entrada masiva.
 * @param {Array<object>} bulkEntryItems
 * @param {string} usuarioId
 * @returns {object}
 */
export const buildBulkEntryPayload = (bulkEntryItems, usuarioId) => ({
    items: (bulkEntryItems || []).map((i) => ({
        item_id: i.item_id,
        item_type: i.item_type || 'INSUMO',
        cantidad: parseFloat(i.cantidad),
        notas: i.notas || null,
    })),
    usuario_id: usuarioId,
});

/**
 * Valida el formulario de merma. Las notas/motivo son obligatorias.
 * @param {{almacen_id: string, item_id: string, cantidad: number|string, notas: string}} mermaForm
 * @returns {{ok: boolean, error: string|null}}
 */
export const validateMerma = (mermaForm) => {
    const { almacen_id, item_id, cantidad, notas } = mermaForm || {};
    if (!almacen_id || !item_id || !cantidad || !notas) {
        return { ok: false, error: 'Todos los campos son obligatorios (especialmente las notas/motivo)' };
    }
    return { ok: true, error: null };
};

/**
 * Valida el formulario de traspaso. Origen y destino deben diferir.
 * @param {{almacen_origen_id: string, almacen_destino_id: string, item_id: string, cantidad: number|string}} traspasoForm
 * @returns {{ok: boolean, error: string|null}}
 */
export const validateTraspaso = (traspasoForm) => {
    const { almacen_origen_id, almacen_destino_id, item_id, cantidad } = traspasoForm || {};
    if (!almacen_origen_id || !almacen_destino_id || !item_id || !cantidad) {
        return { ok: false, error: 'Todos los campos son obligatorios' };
    }
    if (almacen_origen_id === almacen_destino_id) {
        return { ok: false, error: 'Origen y destino no pueden ser el mismo almacén' };
    }
    return { ok: true, error: null };
};

/**
 * Calcula el estado de alerta PEPS de una linea de stock.
 * Reglas:
 *  - 'AGOTADO'  si stock <= 0
 *  - 'CRITICO'  si stock <= minStock
 *  - 'POR_VENCER' si alertDays > 0 y alertDays <= umbral (default 3)
 *  - 'OK'       en cualquier otro caso
 * @param {{stock: number, minStock: number, alertDays: number}} item
 * @param {number} umbralDias
 * @returns {'AGOTADO'|'CRITICO'|'POR_VENCER'|'OK'}
 */
export const calcularAlertaPEPS = (item, umbralDias = 3) => {
    const stock = Number(item?.stock ?? 0);
    const minStock = Number(item?.minStock ?? 0);
    const alertDays = Number(item?.alertDays ?? 0);

    if (stock <= 0) return 'AGOTADO';
    if (stock <= minStock) return 'CRITICO';
    if (alertDays > 0 && alertDays <= umbralDias) return 'POR_VENCER';
    return 'OK';
};

/**
 * Calcula el valor total de una linea de stock (stock * costo).
 * @param {{stock: number, costPerPresentation: number}} item
 * @returns {number}
 */
export const calcularValorLinea = (item) => {
    const stock = Number(item?.stock ?? 0);
    const costo = Number(item?.costPerPresentation ?? 0);
    return stock * costo;
};

// ============================================================================
// v7 (Fase 6.3): Escaner IA de Vision — human-in-the-loop
// ============================================================================

/**
 * Convierte las detecciones crudas del motor de vision (POS ORB) en propuestas
 * editables para el operador. La IA solo PROPONE; el humano confirma.
 *
 * @param {Array<{label: string, qty: number, confidence: number}>} detections
 * @param {Array<{id: string, nombre: string, unidad_base?: string}>} insumos
 * @returns {Array<{item_id: string, item_type: string, nombre: string, unidad: string, cantidad: number, confianza: number, confirmado: boolean}>}
 */
export const mapVisionDetectionsToProposals = (detections, insumos = []) => {
    const catalogo = Array.isArray(insumos) ? insumos : [];
    return (Array.isArray(detections) ? detections : []).map((det) => {
        const label = det?.label ?? '';
        const match = catalogo.find(
            (i) => i.id === label || (i.nombre || '').toLowerCase() === String(label).toLowerCase()
        );
        return {
            item_id: match ? match.id : label,
            item_type: 'INSUMO',
            nombre: match ? match.nombre : label,
            unidad: match?.unidad_base || 'PZA',
            cantidad: Number(det?.qty ?? 0),
            confianza: Number(det?.confidence ?? 0),
            // Regla human-in-the-loop: nada entra confirmado por defecto.
            confirmado: false,
        };
    });
};

/**
 * Valida que el operador haya confirmado al menos una propuesta con cantidad > 0.
 * @param {string} targetWH
 * @param {Array<{cantidad: number|string, confirmado: boolean}>} proposals
 * @returns {{ok: boolean, error: string|null}}
 */
export const validateVisionSnapshot = (targetWH, proposals) => {
    if (!targetWH) {
        return { ok: false, error: 'Selecciona un almacén destino para la entrada por visión' };
    }
    const confirmadas = (proposals || []).filter((p) => p.confirmado && Number(p.cantidad) > 0);
    if (confirmadas.length === 0) {
        return { ok: false, error: 'Confirma al menos una cantidad antes de registrar (la IA solo propone)' };
    }
    return { ok: true, error: null };
};

/**
 * Construye el payload de entrada por vision. Solo incluye las propuestas que el
 * operador confirmo explicitamente (human-in-the-loop).
 * @param {Array<object>} proposals
 * @param {string} usuarioId
 * @param {{imagen_ref?: string, modelo?: string}} meta
 * @returns {object}
 */
export const buildVisionSnapshotPayload = (proposals, usuarioId, meta = {}) => ({
    items: (proposals || [])
        .filter((p) => p.confirmado && Number(p.cantidad) > 0)
        .map((p) => ({
            item_id: p.item_id,
            item_type: p.item_type || 'INSUMO',
            cantidad: parseFloat(p.cantidad),
            confianza: p.confianza ?? null,
            notas: p.notas || null,
        })),
    usuario_id: usuarioId,
    imagen_ref: meta.imagen_ref || null,
    modelo: meta.modelo || null,
});

// ============================================================================
// v7 (Fase 6.5): Captura de Inventario por Voz — human-in-the-loop
// ============================================================================

/**
 * Umbral de confianza por debajo del cual la propuesta se marca para revision
 * visual (resaltado amarillo) y el operador DEBE revisar antes de confirmar.
 * La IA propone; el humano confirma (spec linea 664).
 */
export const VOICE_CONFIDENCE_THRESHOLD = 0.7;

/**
 * Convierte la intencion estructurada devuelta por
 * POST /api/v1/ai/voice/parse-intent en una propuesta editable para el operador.
 *
 * Contrato de entrada (apps/api/modules/ai/schemas.py VoiceParseIntentResponse):
 *   { intencion, sku, cantidad, unidad, confianza, texto_original, requiere_confirmacion }
 *
 * Reglas:
 *  - Nace SIEMPRE con `confirmado: false` (human-in-the-loop).
 *  - Si el SKU no se resuelve contra el catalogo, `sku_resuelto: false` y la UI
 *    muestra un selector para que el operador lo elija manualmente.
 *  - Si `confianza < VOICE_CONFIDENCE_THRESHOLD`, `revisar: true` (resaltado).
 *
 * @param {object} intent
 * @param {Array<{id: string, nombre: string, unidad_base?: string}>} insumos
 * @returns {object}
 */
export const mapVoiceIntentToProposal = (intent, insumos = []) => {
    const catalogo = Array.isArray(insumos) ? insumos : [];
    const data = intent || {};
    const skuRaw = data.sku ?? '';
    const match = catalogo.find(
        (i) =>
            i.id === skuRaw ||
            (i.nombre || '').toLowerCase() === String(skuRaw).toLowerCase()
    );
    const confianza = Number(data.confianza ?? 0);
    const intencion = String(data.intencion || '').toUpperCase();

    return {
        intencion: ['ENTRADA', 'MERMA', 'CONTEO'].includes(intencion) ? intencion : 'ENTRADA',
        item_id: match ? match.id : skuRaw,
        item_type: 'INSUMO',
        nombre: match ? match.nombre : skuRaw,
        unidad: data.unidad || match?.unidad_base || 'PZA',
        cantidad: Number(data.cantidad ?? 0),
        confianza,
        texto_original: data.texto_original || '',
        sku_resuelto: Boolean(match),
        revisar: confianza < VOICE_CONFIDENCE_THRESHOLD,
        // Regla human-in-the-loop: nada entra confirmado por defecto.
        confirmado: false,
    };
};

/**
 * Valida que exista almacen destino, SKU resuelto y cantidad > 0 antes de
 * registrar el movimiento por voz.
 * @param {string} targetWH
 * @param {object} proposal
 * @returns {{ok: boolean, error: string|null}}
 */
export const validateVoiceEntry = (targetWH, proposal) => {
    if (!targetWH) {
        return { ok: false, error: 'Selecciona un almacén destino para la entrada por voz' };
    }
    if (!proposal) {
        return { ok: false, error: 'No hay dictado que registrar' };
    }
    if (!proposal.sku_resuelto || !proposal.item_id) {
        return { ok: false, error: 'Selecciona el insumo correcto: la IA no pudo resolver el SKU dictado' };
    }
    if (!(Number(proposal.cantidad) > 0)) {
        return { ok: false, error: 'Indica una cantidad mayor a cero' };
    }
    if (!proposal.confirmado) {
        return { ok: false, error: 'Confirma el dictado antes de registrar (la IA solo propone)' };
    }
    return { ok: true, error: null };
};

/**
 * Construye el payload de entrada por voz. Incluye `texto_original` para
 * trazabilidad (spec linea 6.5.6) y `metodo_captura: 'VOZ'`.
 * @param {object} proposal
 * @param {string} usuarioId
 * @returns {object}
 */
export const buildVoiceEntryPayload = (proposal, usuarioId) => {
    const p = proposal || {};
    return {
        item_id: p.item_id,
        item_type: p.item_type || 'INSUMO',
        cantidad: parseFloat(p.cantidad),
        unidad: p.unidad || 'PZA',
        usuario_id: usuarioId,
        metodo_captura: 'VOZ',
        confianza: p.confianza ?? null,
        texto_original: p.texto_original || null,
    };
};

// ---------------------------------------------------------------------------
// v8: Subcategorias de almacen (catalogo warehouse_propositos)
// ---------------------------------------------------------------------------

/**
 * v8 (decision 4): paleta curada de 12 emojis para las subcategorias.
 * Se limita a proposito para que la barra no se vuelva un caos visual y para
 * que todos los iconos tengan el mismo peso optico.
 */
export const ICONOS_SUBCATEGORIA = [
    '📦', '🏪', '🔧', '🗂️', '🧊', '❄️',
    '🥖', '🍰', '🧁', '🥤', '🧴', '🧹',
];

/**
 * v8: codigo de la subcategoria de cuarentena. NUNCA se muestra en la barra
 * de filtros; solo aparece dentro del modal de gestion.
 */
export const CODIGO_CUARENTENA = 'SIN_CLASIFICAR';

/**
 * Mapea una subcategoria del API al shape que espera la UI.
 * @param {object} p
 * @returns {object}
 */
export const mapPropositoFromApi = (p) => {
    const item = p || {};
    return {
        id: item.id,
        codigo: item.codigo,
        label: item.label || item.codigo || 'Sin nombre',
        icon: item.icon || '📦',
        orden: typeof item.orden === 'number' ? item.orden : 0,
        esSistema: Boolean(item.es_sistema),
        esCuarentena: Boolean(item.es_cuarentena),
        activo: item.activo !== false,
        almacenesCount: typeof item.almacenes_count === 'number' ? item.almacenes_count : 0,
    };
};

/**
 * Mapea la lista completa de subcategorias del API.
 * @param {Array<object>} lista
 * @returns {Array<object>}
 */
export const mapPropositosFromApi = (lista) =>
    (Array.isArray(lista) ? lista : []).map(mapPropositoFromApi);

/**
 * Ordena subcategorias por `orden` y, a igualdad, por label.
 * No muta el arreglo original.
 * @param {Array<object>} lista
 * @returns {Array<object>}
 */
export const sortPropositos = (lista) =>
    [...(Array.isArray(lista) ? lista : [])].sort((a, b) => {
        const oa = typeof a?.orden === 'number' ? a.orden : 0;
        const ob = typeof b?.orden === 'number' ? b.orden : 0;
        if (oa !== ob) return oa - ob;
        return String(a?.label || '').localeCompare(String(b?.label || ''));
    });

/**
 * v8 (decision 2): subcategorias visibles en la barra de filtros.
 * Excluye la cuarentena y las inactivas. La cuarentena solo se ve en el modal.
 * @param {Array<object>} lista
 * @returns {Array<object>}
 */
export const propositosParaBarra = (lista) =>
    sortPropositos(lista).filter((p) => p.activo && !p.esCuarentena);

/**
 * Normaliza un label a un codigo valido para el backend.
 * El backend exige ^[A-Z][A-Z0-9_]{1,39}$.
 * @param {string} label
 * @returns {string}
 */
export const codigoDesdeLabel = (label) => {
    const base = String(label || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // quita acentos
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .replace(/_{2,}/g, '_');
    if (!base) return '';
    // Debe iniciar con letra; si no, se prefija con SUB_.
    const conLetra = /^[A-Z]/.test(base) ? base : `SUB_${base}`;
    return conLetra.slice(0, 40);
};

/**
 * Valida el formulario de creacion/edicion de subcategoria.
 * @param {{label?: string, codigo?: string, icon?: string}} form
 * @param {Array<object>} existentes
 * @param {string|null} editandoCodigo
 * @returns {{ok: boolean, error: string|null, codigo: string}}
 */
export const validatePropositoForm = (form, existentes = [], editandoCodigo = null) => {
    const f = form || {};
    const label = String(f.label || '').trim();

    if (label.length < 2) {
        return { ok: false, error: 'El nombre debe tener al menos 2 caracteres', codigo: '' };
    }
    if (label.length > 60) {
        return { ok: false, error: 'El nombre no puede exceder 60 caracteres', codigo: '' };
    }

    const icon = String(f.icon || '').trim();
    if (icon && !ICONOS_SUBCATEGORIA.includes(icon)) {
        return { ok: false, error: 'Selecciona un icono de la paleta', codigo: '' };
    }

    const codigo = codigoDesdeLabel(f.codigo || label);
    if (!codigo || codigo.length < 2) {
        return { ok: false, error: 'No se pudo derivar un código válido del nombre', codigo: '' };
    }

    // En edicion el codigo no cambia, asi que no se compara contra si mismo.
    if (editandoCodigo === null || editandoCodigo === undefined) {
        const duplicado = (Array.isArray(existentes) ? existentes : [])
            .some((p) => p.codigo === codigo);
        if (duplicado) {
            return { ok: false, error: `Ya existe una subcategoría con el código ${codigo}`, codigo };
        }
    }

    return { ok: true, error: null, codigo };
};

/**
 * Construye el payload de creacion de subcategoria (UI ingles -> API espanol).
 * @param {{label: string, icon?: string, orden?: number}} form
 * @returns {object}
 */
export const buildPropositoCreatePayload = (form) => {
    const f = form || {};
    return {
        codigo: codigoDesdeLabel(f.codigo || f.label),
        label: String(f.label || '').trim(),
        icon: f.icon || '📦',
        orden: typeof f.orden === 'number' ? f.orden : 100,
    };
};

/**
 * v8 (decision 1): decide si una subcategoria puede borrarse y por que no.
 * @param {object} proposito
 * @returns {{puedeBorrar: boolean, motivo: string|null, requiereTraslado: boolean}}
 */
export const validatePropositoDelete = (proposito) => {
    const p = proposito || {};

    if (p.esSistema) {
        return {
            puedeBorrar: false,
            motivo: 'Las subcategorías del sistema no pueden eliminarse',
            requiereTraslado: false,
        };
    }

    const count = typeof p.almacenesCount === 'number' ? p.almacenesCount : 0;
    if (count > 0) {
        return {
            puedeBorrar: false,
            motivo: `Tiene ${count} almacén(es). Trasládalos primero a otra subcategoría.`,
            requiereTraslado: true,
        };
    }

    return { puedeBorrar: true, motivo: null, requiereTraslado: false };
};

/**
 * v8: construye el payload del traslado masivo de almacenes.
 * @param {string} origenCodigo
 * @param {string} destinoCodigo
 * @returns {object}
 */
export const buildTrasladoSubcategoriaPayload = (origenCodigo, destinoCodigo) => ({
    origen_codigo: origenCodigo,
    destino_codigo: destinoCodigo || CODIGO_CUARENTENA,
});
