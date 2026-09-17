/**
 * printFormats.js — Catálogo de formatos de papel para la exportación a imprenta
 * (V8, plan gestor de display, §5.14).
 *
 * MÓDULO 100% PURO: sin React, sin DOM, sin fetch, sin timers, sin `jspdf`.
 * Solo calcula tamaños de página en PUNTOS (1 pt = 1/72 pulgada), que es la
 * unidad nativa de PDF. La generación real del archivo vive en `pdfRenderer.js`
 * (impuro, usa `jspdf`).
 *
 * Esta separación permite testear TODA la lógica de formato/paginación sin
 * generar un PDF real (patrón "guardián del contrato" del proyecto).
 *
 * IMPORTANTE: esta herramienta NO imprime. Solo prepara el archivo que se
 * descarga y se envía a un taller de imprenta. No toca ninguna impresora.
 */

/** Pulgadas → puntos (1 pt = 1/72"). */
const PT_PER_INCH = 72;

/** Milímetros → puntos (1" = 25.4 mm). */
const MM_PER_INCH = 25.4;

/**
 * Catálogo de formatos estándar, en PUNTOS, en orientación vertical (PORTRAIT).
 * Las medidas horizontales (LANDSCAPE) se obtienen intercambiando ancho/alto.
 *
 * Referencias:
 *   LETTER        8.5" × 11"   = 612 × 792 pt
 *   LEGAL         8.5" × 14"   = 612 × 1008 pt
 *   TABLOID       11" × 17"    = 792 × 1224 pt
 *   DOUBLE_LETTER 17" × 11"    = 1224 × 792 pt (ya es horizontal por naturaleza)
 *   A4            210 × 297 mm = 595.28 × 841.89 pt
 *   A3            297 × 420 mm = 841.89 × 1190.55 pt
 */
export const PRINT_FORMATS = {
    LETTER: { label: 'Carta (8.5" × 11")', width: 612, height: 792 },
    LEGAL: { label: 'Oficio (8.5" × 14")', width: 612, height: 1008 },
    TABLOID: { label: 'Tabloide (11" × 17")', width: 792, height: 1224 },
    DOUBLE_LETTER: { label: 'Doble carta (17" × 11")', width: 1224, height: 792 },
    A4: { label: 'A4 (210 × 297 mm)', width: 595.28, height: 841.89 },
    A3: { label: 'A3 (297 × 420 mm)', width: 841.89, height: 1190.55 },
};

/** Orientaciones válidas. */
export const VALID_ORIENTATIONS = ['PORTRAIT', 'LANDSCAPE'];

/** Formato por defecto. */
export const DEFAULT_FORMAT = 'LETTER';

/** Orientación por defecto. */
export const DEFAULT_ORIENTATION = 'PORTRAIT';

/** Margen por defecto del documento, en milímetros. */
export const DEFAULT_MARGIN_MM = 12;

/**
 * Convierte milímetros a puntos.
 * @param {number} mm
 * @returns {number} Puntos (redondeado a 4 decimales para evitar ruido flotante).
 */
export function mmToPt(mm) {
    const n = Number(mm);
    if (!Number.isFinite(n)) return 0;
    return Math.round((n * PT_PER_INCH / MM_PER_INCH) * 10000) / 10000;
}

/**
 * Devuelve el tamaño de página en puntos para un formato y orientación.
 * Si el formato es inválido, cae a LETTER. Si la orientación es inválida, cae
 * a PORTRAIT. En LANDSCAPE se intercambian ancho y alto.
 *
 * @param {string} format - Clave de PRINT_FORMATS.
 * @param {string} [orientation='PORTRAIT']
 * @returns {{width: number, height: number}}
 */
export function getPageSizePt(format, orientation = DEFAULT_ORIENTATION) {
    const spec = PRINT_FORMATS[format] || PRINT_FORMATS[DEFAULT_FORMAT];
    const isLandscape = orientation === 'LANDSCAPE';
    return isLandscape
        ? { width: spec.height, height: spec.width }
        : { width: spec.width, height: spec.height };
}

/**
 * Normaliza una configuración de impresión cruda. NUNCA lanza.
 * Espejo de `normalizePrint` de `displayMappers.js`, pero sin dependencias
 * cruzadas (este módulo es autónomo para poder testearse aislado).
 *
 * @param {object|null} raw
 * @returns {{format: string, orientation: string, footerNote: string,
 *            validUntil: string|null, showQr: boolean, showCropMarks: boolean}}
 */
export function normalizePrintConfig(raw) {
    const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    return {
        format: Object.prototype.hasOwnProperty.call(PRINT_FORMATS, src.format)
            ? src.format
            : DEFAULT_FORMAT,
        orientation: VALID_ORIENTATIONS.includes(src.orientation)
            ? src.orientation
            : DEFAULT_ORIENTATION,
        footerNote: typeof src.footerNote === 'string' ? src.footerNote : '',
        validUntil: typeof src.validUntil === 'string' && src.validUntil.length > 0
            ? src.validUntil
            : null,
        showQr: typeof src.showQr === 'boolean' ? src.showQr : false,
        showCropMarks: typeof src.showCropMarks === 'boolean' ? src.showCropMarks : false,
    };
}

/**
 * Lista de formatos disponibles para poblar un `<select>` en la UI.
 * @returns {Array<{value: string, label: string}>}
 */
export function listPrintFormats() {
    return Object.keys(PRINT_FORMATS).map((key) => ({
        value: key,
        label: PRINT_FORMATS[key].label,
    }));
}
