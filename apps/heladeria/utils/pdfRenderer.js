/**
 * pdfRenderer.js — Renderizador PDF vectorial del Display de Precios (V8, §5.16).
 *
 * FILOSOFÍA (v7): NO imprimimos. Generamos un PDF vectorial listo para enviar
 * a un taller de imprenta. Esta herramienta NO toca ninguna impresora —
 * ni las térmicas del POS ni ninguna otra.
 *
 * SEPARACIÓN PURA/IMPURA:
 *   - `layoutPrintDocument` (puro, testeable) calcula TODA la geometría.
 *   - `renderPdf` (impuro, usa jspdf) solo DIBUJA lo que el layout ya decidió.
 *   Así la lógica de paginación se prueba sin abrir un PDF.
 *
 * DEPENDENCIA: `jspdf` (única dependencia nueva, ~350 KB).
 *
 * REGLAS:
 *   - CERO precios hardcodeados: todo viene en el `viewModel`.
 *   - CERO llamadas a `window.print()` ni a APIs de impresora.
 *   - El PDF es VECTORIAL (texto seleccionable), no una captura de pantalla.
 */
import { jsPDF } from 'jspdf';
import { layoutPrintDocument, buildFileName, ITEM_TYPES } from './layoutPrintDocument';
import { getFontSpec } from './displayFonts';

/** Colores del PDF (RGB). */
const COLORS = {
    text: [15, 15, 15],
    muted: [107, 107, 107],
    accent: [15, 15, 15],
    border: [212, 212, 212],
    white: [255, 255, 255],
};

/** Tamaños tipográficos en puntos. */
const FONT_SIZES = {
    headerTitle: 22,
    headerSubtitle: 10,
    groupTitle: 13,
    cardName: 9,
    cardPrice: 12,
    footer: 8,
};

/**
 * Genera el PDF de una pantalla y dispara la descarga.
 *
 * @param {object} viewModel    Salida de `buildDisplayViewModel`.
 * @param {object} screen       Pantalla nombrada (config completa + name).
 * @param {Date}   [now]        Fecha para el nombre del archivo.
 * @returns {{fileName: string, pageCount: number}}
 */
export function renderPdf(viewModel, screen, now = new Date()) {
    const screenConfig = screen.config || screen;
    const doc = layoutPrintDocument(viewModel, screenConfig);

    const pdf = new jsPDF({
        unit: 'pt',
        format: [doc.pageSizePt.width, doc.pageSizePt.height],
        orientation: doc.pageSizePt.width > doc.pageSizePt.height ? 'landscape' : 'portrait',
    });

    const fontSpec = getFontSpec(doc.fontFamily);

    doc.pages.forEach((page, index) => {
        if (index > 0) pdf.addPage([doc.pageSizePt.width, doc.pageSizePt.height]);
        drawPage(pdf, page, doc, fontSpec);
    });

    const fileName = buildFileName(screenConfig, screen.name, now);
    pdf.save(fileName);

    return { fileName, pageCount: doc.pages.length };
}

/**
 * Dibuja una página completa (header + items + footer).
 */
function drawPage(pdf, page, doc, fontSpec) {
    const { marginPt, pageSizePt } = doc;

    for (const item of page.items) {
        if (item.type === ITEM_TYPES.HEADER) {
            drawHeader(pdf, item, doc, fontSpec);
        } else if (item.type === ITEM_TYPES.GROUP_TITLE) {
            drawGroupTitle(pdf, item, doc, fontSpec);
        } else if (item.type === ITEM_TYPES.CARD) {
            drawCard(pdf, item, doc, fontSpec);
        } else if (item.type === ITEM_TYPES.FOOTER) {
            drawFooter(pdf, item, doc, fontSpec);
        }
    }

    // Marco de recorte (crop marks) si se pidió.
    if (doc.footer && doc.footer.showCropMarks) {
        pdf.setDrawColor(...COLORS.border);
        pdf.setLineWidth(0.5);
        pdf.rect(marginPt / 2, marginPt / 2,
            pageSizePt.width - marginPt, pageSizePt.height - marginPt);
    }
}

/**
 * Dibuja el encabezado (título + subtítulo) alineado según config.
 */
function drawHeader(pdf, item, doc, fontSpec) {
    const { marginPt, pageSizePt } = doc;
    const align = item.align || 'CENTER';
    const centerX = pageSizePt.width / 2;

    pdf.setFont(fontSpec.googleFamily, 'bold');
    pdf.setFontSize(FONT_SIZES.headerTitle);
    pdf.setTextColor(...COLORS.text);

    const titleY = marginPt + 26;
    if (align === 'CENTER') {
        pdf.text(item.title || '', centerX, titleY, { align: 'center' });
    } else if (align === 'RIGHT') {
        pdf.text(item.title || '', pageSizePt.width - marginPt, titleY, { align: 'right' });
    } else {
        pdf.text(item.title || '', marginPt, titleY);
    }

    if (item.subtitle) {
        pdf.setFont(fontSpec.googleFamily, 'normal');
        pdf.setFontSize(FONT_SIZES.headerSubtitle);
        pdf.setTextColor(...COLORS.muted);
        const subY = titleY + 14;
        if (align === 'CENTER') {
            pdf.text(item.subtitle, centerX, subY, { align: 'center' });
        } else if (align === 'RIGHT') {
            pdf.text(item.subtitle, pageSizePt.width - marginPt, subY, { align: 'right' });
        } else {
            pdf.text(item.subtitle, marginPt, subY);
        }
    }

    // Línea divisoria bajo el encabezado.
    pdf.setDrawColor(...COLORS.border);
    pdf.setLineWidth(0.75);
    pdf.line(marginPt, marginPt + 40, pageSizePt.width - marginPt, marginPt + 40);
}

/**
 * Dibuja el título de un grupo (categoría).
 */
function drawGroupTitle(pdf, item, doc, fontSpec) {
    const { marginPt } = doc;
    pdf.setFont(fontSpec.googleFamily, 'bold');
    pdf.setFontSize(FONT_SIZES.groupTitle);
    pdf.setTextColor(...COLORS.accent);
    pdf.text(item.label || '', marginPt, item.y + 16);
}

/**
 * Dibuja una tarjeta de producto (nombre + precio + AGOTADO).
 */
function drawCard(pdf, item, doc, fontSpec) {
    const { columnWidth } = doc;
    const x = item.x;
    const y = item.y;

    // Nombre del producto.
    pdf.setFont(fontSpec.googleFamily, 'bold');
    pdf.setFontSize(FONT_SIZES.cardName);
    pdf.setTextColor(...COLORS.text);
    const name = truncate(pdf, item.name || '', columnWidth - 8);
    pdf.text(name, x, y + 14);

    // Precio.
    pdf.setFont(fontSpec.googleFamily, 'bold');
    pdf.setFontSize(FONT_SIZES.cardPrice);
    pdf.setTextColor(...COLORS.accent);
    pdf.text(item.priceLabel || '', x, y + 30);

    // Marca de AGOTADO.
    if (item.isAvailable === false) {
        pdf.setFont(fontSpec.googleFamily, 'normal');
        pdf.setFontSize(7);
        pdf.setTextColor(...COLORS.muted);
        pdf.text('AGOTADO', x + columnWidth - 8, y + 14, { align: 'right' });
    }

    // Línea divisoria entre tarjetas.
    pdf.setDrawColor(...COLORS.border);
    pdf.setLineWidth(0.4);
    pdf.line(x, y + 40, x + columnWidth - 8, y + 40);
}

/**
 * Dibuja el pie de página (nota + vigencia).
 */
function drawFooter(pdf, item, doc, fontSpec) {
    const { marginPt, pageSizePt } = doc;
    pdf.setFont(fontSpec.googleFamily, 'normal');
    pdf.setFontSize(FONT_SIZES.footer);
    pdf.setTextColor(...COLORS.muted);

    const parts = [];
    if (item.footerNote) parts.push(item.footerNote);
    if (item.validUntil) parts.push(`Vigente hasta: ${item.validUntil}`);
    const text = parts.join('  ·  ');

    if (text) {
        pdf.text(text, pageSizePt.width / 2, item.y + 20, { align: 'center' });
    }
}

/**
 * Trunca un texto para que quepa en `maxWidth` puntos.
 * @returns {string}
 */
function truncate(pdf, text, maxWidth) {
    if (pdf.getTextWidth(text) <= maxWidth) return text;
    let out = text;
    while (out.length > 1 && pdf.getTextWidth(`${out}…`) > maxWidth) {
        out = out.slice(0, -1);
    }
    return `${out}…`;
}
