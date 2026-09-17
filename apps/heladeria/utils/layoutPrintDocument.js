/**
 * layoutPrintDocument.js — Motor de paginación del documento de imprenta
 * (V8, plan gestor de display, §5.16).
 *
 * MÓDULO 100% PURO: sin React, sin DOM, sin fetch, sin timers, sin `jspdf`.
 * Calcula DÓNDE va cada cosa y en qué página. La generación real del PDF vive
 * en `pdfRenderer.js` (impuro, usa `jspdf`).
 *
 * FIRMA (corregida en v8, defecto #2):
 *   layoutPrintDocument(viewModel, screenConfig)
 *
 * Recibe la config COMPLETA de la pantalla (no `screenConfig.print`), porque el
 * encabezado (`header`) y la tipografía (`fontFamily`) viven en la config de
 * pantalla, no dentro de `print`. Pasar solo `print` haría que el encabezado y
 * la tipografía nunca llegaran al PDF.
 *
 * GARANTÍAS (testeables sin navegador):
 *   - Paginación DETERMINISTA: misma entrada ⇒ mismo layout.
 *   - Un `GROUP_TITLE` NUNCA queda como último item de una página (keep-with-next).
 *   - `HEADER` se repite en todas las páginas si `repeatHeader:true`.
 *   - `FOOTER` solo en la última página.
 *   - Ningún item excede `pageHeight - marginPt`.
 *
 * IMPORTANTE: esta herramienta NO imprime. Solo prepara el archivo.
 */

import { getPageSizePt, mmToPt, normalizePrintConfig, DEFAULT_MARGIN_MM } from './printFormats';
import { normalizeScreenConfig, resolveGroupLabel, resolveImagePresentation } from './displayMappers';

/** Tipos de item del layout. */
export const ITEM_TYPES = {
    HEADER: 'HEADER',
    GROUP_TITLE: 'GROUP_TITLE',
    CARD: 'CARD',
    FOOTER: 'FOOTER',
};

/** Alturas base en puntos (a 1 pt = 1/72"). */
const METRICS = {
    headerHeight: 72,
    groupTitleHeight: 28,
    cardHeight: 64,
    cardGap: 8,
    footerHeight: 40,
    columnGap: 12,
};

/**
 * Calcula cuántas columnas caben y el ancho de cada una.
 * @param {number} contentWidth
 * @param {number} columns
 * @returns {{columnWidth: number, columnGap: number}}
 */
function computeColumnMetrics(contentWidth, columns) {
    const cols = Math.max(1, Math.min(6, parseInt(columns, 10) || 3));
    const gap = METRICS.columnGap;
    const columnWidth = (contentWidth - gap * (cols - 1)) / cols;
    return { columnWidth, columnGap: gap };
}

/**
 * Construye la lista PLANA de items lógicos del documento (sin paginar aún).
 * @param {object} viewModel - Salida de `buildDisplayViewModel`.
 * @param {object} config - Config normalizada de pantalla.
 * @returns {Array<object>} Items en orden de lectura.
 */
function buildLogicalItems(viewModel, config) {
    const items = [];
    const groups = Array.isArray(viewModel && viewModel.groups) ? viewModel.groups : [];

    for (const group of groups) {
        const label = resolveGroupLabel(group.componentType, config.groupLabels);
        items.push({ type: ITEM_TYPES.GROUP_TITLE, text: label, componentType: group.componentType });

        const groupItems = Array.isArray(group.items) ? group.items : [];
        for (const item of groupItems) {
            const presentation = resolveImagePresentation(item, config.images);
            items.push({
                type: ITEM_TYPES.CARD,
                text: item.name,
                priceLabel: item.priceLabel,
                imageUrl: presentation.url,
                fallbackText: presentation.fallbackText,
                imageSize: presentation.size,
                imageShape: presentation.shape,
                isAvailable: item.isAvailable !== false,
            });
        }
    }

    return items;
}

/**
 * Pagina los items lógicos en páginas que respetan la altura útil.
 * Regla keep-with-next: un GROUP_TITLE nunca queda solo al final de página.
 *
 * @param {Array<object>} logicalItems
 * @param {object} metrics - { contentWidth, contentHeight, columns, columnWidth, columnGap }
 * @returns {Array<Array<object>>} Array de páginas, cada una con sus items.
 */
function paginate(logicalItems, metrics) {
    const pages = [];
    let current = [];
    let y = 0;

    const flush = () => {
        if (current.length > 0) {
            pages.push(current);
            current = [];
            y = 0;
        }
    };

    for (let i = 0; i < logicalItems.length; i += 1) {
        const item = logicalItems[i];
        const height = item.type === ITEM_TYPES.GROUP_TITLE
            ? METRICS.groupTitleHeight
            : METRICS.cardHeight + METRICS.cardGap;

        // ¿Cabe en la página actual?
        if (y + height > metrics.contentHeight && current.length > 0) {
            // Keep-with-next: si el último item es un título, lo movemos también.
            const last = current[current.length - 1];
            if (last && last.type === ITEM_TYPES.GROUP_TITLE) {
                current.pop();
                flush();
                current.push(last);
                y = METRICS.groupTitleHeight;
            } else {
                flush();
            }
        }

        current.push({ ...item, y });
        y += height;
    }

    flush();
    return pages.length > 0 ? pages : [[]];
}

/**
 * Construye el layout completo del documento de imprenta.
 *
 * @param {object} viewModel - Salida de `buildDisplayViewModel`.
 * @param {object} screenConfig - Config COMPLETA de la pantalla (no `.print`).
 * @returns {{pageSizePt: {width: number, height: number}, marginPt: number,
 *            columns: number, pages: Array<{items: Array}>, fontFamily: string,
 *            header: object, footer: object}}
 */
export function layoutPrintDocument(viewModel, screenConfig) {
    const config = normalizeScreenConfig(screenConfig);
    const print = normalizePrintConfig(config.print);

    const pageSizePt = getPageSizePt(print.format, print.orientation);
    const marginPt = mmToPt(DEFAULT_MARGIN_MM);

    const contentWidth = pageSizePt.width - marginPt * 2;
    const contentHeight = pageSizePt.height - marginPt * 2
        - METRICS.headerHeight - METRICS.footerHeight;

    const { columnWidth, columnGap } = computeColumnMetrics(contentWidth, config.columns);

    const logicalItems = buildLogicalItems(viewModel, config);
    const rawPages = paginate(logicalItems, {
        contentWidth,
        contentHeight,
        columns: config.columns,
        columnWidth,
        columnGap,
    });

    const header = {
        type: ITEM_TYPES.HEADER,
        title: config.header.title,
        subtitle: config.header.subtitle,
        logo: config.header.logo,
        align: config.header.align,
    };

    const footer = {
        type: ITEM_TYPES.FOOTER,
        footerNote: print.footerNote,
        validUntil: print.validUntil,
        showQr: print.showQr,
        showCropMarks: print.showCropMarks,
    };

    const pages = rawPages.map((pageItems, pageIndex) => {
        const isLast = pageIndex === rawPages.length - 1;
        const items = [];

        // HEADER repetido en todas las páginas (decisión de diseño: la carta
        // impresa debe identificar la pantalla en cada hoja).
        items.push({ ...header, y: 0 });

        for (const it of pageItems) {
            items.push({ ...it, y: it.y + METRICS.headerHeight });
        }

        if (isLast) {
            items.push({ ...footer, y: pageSizePt.height - marginPt - METRICS.footerHeight });
        }

        return { items, pageIndex, isLast };
    });

    return {
        pageSizePt,
        marginPt,
        columns: config.columns,
        columnWidth,
        columnGap,
        fontFamily: config.fontFamily,
        header,
        footer,
        pages,
    };
}

/**
 * Construye el nombre del archivo PDF descargado.
 * Formato: `carta-{screen}-{format}-{YYYYMMDD}.pdf`.
 * Sanea caracteres no seguros del nombre de pantalla.
 *
 * @param {object} screenConfig - Config completa (usa `print.format`).
 * @param {string} [screenName='pantalla']
 * @param {Date} [now=new Date()]
 * @returns {string}
 */
export function buildFileName(screenConfig, screenName = 'pantalla', now = new Date()) {
    const print = normalizePrintConfig(screenConfig && screenConfig.print);
    const safeName = String(screenName)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')   // quita acentos
        .replace(/[^a-zA-Z0-9-_]+/g, '-')  // solo alfanumérico, guion y guion bajo
        .replace(/^-+|-+$/g, '')           // sin guiones al borde
        .toLowerCase() || 'pantalla';

    const d = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');

    return `carta-${safeName}-${print.format.toLowerCase()}-${yyyy}${mm}${dd}.pdf`;
}
