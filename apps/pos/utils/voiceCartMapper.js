/**
 * v24 (VOZ-POS): Mapper de intenciones de voz -> propuestas de carrito.
 *
 * Este modulo es el ESPEJO POS de `apps/inventory/utils/warehouseMappers.js`.
 * La diferencia clave: aqui el catalogo son PRODUCTOS de venta (con precio),
 * no insumos de almacen.
 *
 * REGLA DE ORO (spec linea 664): la IA PROPONE, el operador CONFIRMA.
 *   - Ninguna propuesta nace confirmada.
 *   - Si el SKU/nombre no se resuelve contra el catalogo, `resuelto: false`
 *     y la UI obliga a elegir manualmente.
 *   - Si la confianza es baja, `revisar: true` (resaltado ambar).
 *
 * El LLM NUNCA ejecuta acciones: solo devuelve JSON validado por Pydantic
 * en el motor (ai-local) y en el gateway (apps/api/modules/ai).
 */

/**
 * Umbral de confianza por debajo del cual la propuesta se marca para revision
 * visual. La IA propone; el humano confirma.
 */
export const VOICE_CART_CONFIDENCE_THRESHOLD = 0.7;

/**
 * Intenciones de venta soportadas por el POS.
 * Las de almacen (registrar_entrada, contar_stock) NO se ejecutan aqui.
 */
export const POS_VOICE_INTENTS = {
    AGREGAR_ITEM: 'AGREGAR_ITEM',
    QUITAR_ITEM: 'QUITAR_ITEM',
    COBRAR: 'COBRAR',
    CANCELAR: 'CANCELAR',
    DESCONOCIDA: 'DESCONOCIDA',
};

/**
 * v25 (VOZ-POS v2): Allowlist de intenciones que el POS acepta por voz.
 *
 * DECISION DE DISENO (acordada con el negocio): en el POS el dictado por voz
 * sirve UNICAMENTE para capturar/agregar productos a la cuenta. No se dictan
 * cobros, cancelaciones ni bajas: esas acciones son destructivas o fiscales y
 * deben pasar siempre por un toque explicito del operador.
 *
 * Cualquier intencion fuera de esta lista se degrada a DESCONOCIDA, de modo
 * que la UI muestre "no entendido" en lugar de ofrecer una accion peligrosa.
 */
export const POS_ALLOWED_INTENTS = new Set([POS_VOICE_INTENTS.AGREGAR_ITEM]);

/**
 * Normaliza un texto para comparar nombres de producto de forma tolerante
 * (minusculas, sin acentos, sin signos).
 * @param {string} texto
 * @returns {string}
 */
const normalizar = (texto) =>
    String(texto || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

/**
 * Resuelve un SKU/nombre dictado contra el catalogo de productos del POS.
 *
 * Estrategia en cascada (de mas estricta a mas laxa):
 *   1. Coincidencia exacta por `id` (SKU).
 *   2. Coincidencia exacta por `name` normalizado.
 *   3. El nombre del producto CONTIENE lo dictado (ej. "concha" -> "CONCHA VAINILLA").
 *   4. Lo dictado CONTIENE el nombre del producto.
 *
 * @param {string} skuRaw
 * @param {Array<{id: string, name: string, price: number}>} productos
 * @returns {object|null} El producto encontrado o null.
 */
export const resolverProductoPorVoz = (skuRaw, productos = []) => {
    const catalogo = Array.isArray(productos) ? productos : [];
    const crudo = String(skuRaw || '').trim();
    if (!crudo) return null;

    // 1. SKU exacto
    const porId = catalogo.find((p) => String(p.id) === crudo);
    if (porId) return porId;

    const objetivo = normalizar(crudo);
    if (!objetivo) return null;

    // 2. Nombre exacto normalizado
    const porNombre = catalogo.find((p) => normalizar(p.name) === objetivo);
    if (porNombre) return porNombre;

    // 3. El nombre del producto contiene lo dictado
    const contiene = catalogo.find((p) => normalizar(p.name).includes(objetivo));
    if (contiene) return contiene;

    // 4. Lo dictado contiene el nombre del producto
    const contenido = catalogo.find((p) => {
        const n = normalizar(p.name);
        return n.length > 2 && objetivo.includes(n);
    });
    if (contenido) return contenido;

    return null;
};

/**
 * Convierte la respuesta de POST /api/v1/ai/voice/parse-intent en una
 * propuesta editable de carrito para el operador.
 *
 * Contrato de entrada (apps/api/modules/ai/schemas.py VoiceParseIntentResponse):
 *   { intencion, items: [{sku, cantidad, unidad}], sku, cantidad, unidad,
 *     confianza, texto_original, requiere_confirmacion }
 *
 * @param {object} intent
 * @param {Array<{id: string, name: string, price: number}>} productos
 * @returns {object} Propuesta con `lineas` editables.
 */
export const mapVoiceIntentToCartProposal = (intent, productos = []) => {
    const data = intent || {};
    const catalogo = Array.isArray(productos) ? productos : [];
    const confianza = Number(data.confianza ?? 0);

    // Normalizar la intencion al vocabulario del POS.
    const intencionCruda = String(data.intencion || '').toUpperCase();
    const intencionNormalizada = POS_VOICE_INTENTS[intencionCruda] || POS_VOICE_INTENTS.DESCONOCIDA;
    // v25 (VOZ-POS v2): el POS SOLO acepta AGREGAR_ITEM por voz. Cualquier otra
    // intencion (cobrar, cancelar, quitar) se degrada a DESCONOCIDA para que la
    // UI no ofrezca una accion destructiva/fiscal por dictado.
    const intencion = POS_ALLOWED_INTENTS.has(intencionNormalizada)
        ? intencionNormalizada
        : POS_VOICE_INTENTS.DESCONOCIDA;

    // Construir la lista de items: usar `items` si viene; si no, el campo plano.
    let itemsCrudos = Array.isArray(data.items) ? data.items : [];
    if (itemsCrudos.length === 0 && data.sku) {
        itemsCrudos = [{ sku: data.sku, cantidad: data.cantidad, unidad: data.unidad }];
    }

    const lineas = itemsCrudos
        .map((it) => {
            const skuRaw = it?.sku ?? '';
            const match = resolverProductoPorVoz(skuRaw, catalogo);
            const cantidad = Number(it?.cantidad ?? 0);
            return {
                // Identidad de la linea (para edicion en UI)
                sku_dictado: skuRaw,
                producto_id: match ? match.id : null,
                nombre: match ? match.name : String(skuRaw || ''),
                precio: match ? Number(match.price || 0) : 0,
                cantidad: cantidad > 0 ? cantidad : 1,
                unidad: it?.unidad || 'pieza',
                resuelto: Boolean(match),
                // Regla human-in-the-loop: nada entra confirmado por defecto.
                confirmado: false,
            };
        })
        // Descartar lineas completamente vacias (sin SKU ni cantidad).
        .filter((l) => l.sku_dictado || l.producto_id);

    const hayNoResueltos = lineas.some((l) => !l.resuelto);

    return {
        intencion,
        lineas,
        confianza,
        texto_original: data.texto_original || '',
        // La UI resalta en ambar si la confianza es baja o hay lineas sin resolver.
        revisar: confianza < VOICE_CART_CONFIDENCE_THRESHOLD || hayNoResueltos,
        hay_no_resueltos: hayNoResueltos,
        // Regla human-in-the-loop: la propuesta completa nace sin confirmar.
        confirmado: false,
    };
};

/**
 * Valida que la propuesta pueda aplicarse al carrito.
 * @param {object} proposal
 * @returns {{ok: boolean, error: string|null}}
 */
export const validateVoiceCartProposal = (proposal) => {
    if (!proposal) {
        return { ok: false, error: 'No hay dictado que aplicar al carrito' };
    }
    if (proposal.intencion === POS_VOICE_INTENTS.DESCONOCIDA) {
        return {
            ok: false,
            error: 'Por voz solo puedo agregar productos a la cuenta. Intenta de nuevo o captura manualmente.',
        };
    }
    // v25 (VOZ-POS v2): el POS solo acepta AGREGAR_ITEM. Cualquier otra intencion
    // ya fue degradada a DESCONOCIDA en el mapper; este guard es defensa en profundidad.
    if (!POS_ALLOWED_INTENTS.has(proposal.intencion)) {
        return {
            ok: false,
            error: 'Por voz solo puedo agregar productos a la cuenta. Usa los botones para otras acciones.',
        };
    }
    const lineas = Array.isArray(proposal.lineas) ? proposal.lineas : [];
    if (lineas.length === 0) {
        return { ok: false, error: 'El dictado no contiene productos reconocibles' };
    }
    const sinResolver = lineas.filter((l) => !l.resuelto);
    if (sinResolver.length > 0) {
        return {
            ok: false,
            error: `Selecciona el producto correcto: la IA no reconocio "${sinResolver[0].sku_dictado}"`,
        };
    }
    const invalidas = lineas.filter((l) => !(Number(l.cantidad) > 0));
    if (invalidas.length > 0) {
        return { ok: false, error: 'Todas las cantidades deben ser mayores a cero' };
    }
    if (!proposal.confirmado) {
        return { ok: false, error: 'Confirma el dictado antes de aplicarlo (la IA solo propone)' };
    }
    return { ok: true, error: null };
};

/**
 * Convierte las lineas confirmadas en productos listos para `addToCart`.
 * @param {object} proposal
 * @returns {Array<{id: string, name: string, price: number, quantity: number}>}
 */
export const buildCartItemsFromProposal = (proposal) => {
    const lineas = Array.isArray(proposal?.lineas) ? proposal.lineas : [];
    return lineas
        .filter((l) => l.resuelto && Number(l.cantidad) > 0)
        .map((l) => ({
            id: l.producto_id,
            name: l.nombre,
            price: Number(l.precio || 0),
            quantity: Number(l.cantidad),
        }));
};
