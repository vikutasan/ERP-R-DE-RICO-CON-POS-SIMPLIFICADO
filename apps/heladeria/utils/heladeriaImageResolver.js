/**
 * heladeriaImageResolver.js — Cascada de resolución de imágenes de producto.
 *
 * Réplica EXACTA de la lógica de `apps/pos/components/ProductCard.jsx` para que
 * el POS de Heladería muestre las imágenes igual que el POS de Panadería.
 *
 * Cascada: API → SKU.png → SKU.jpg → Legacy PNG → Legacy JPG → Emoji fallback.
 *
 * Función pura: no toca red ni estado. Testeable de forma aislada.
 */
import { CONFIG } from '../../shared/config';

/** Claves de la cascada, en orden de intento. */
export const IMAGE_STEPS = [
    'API_IMG',
    'TRY_PNG',
    'TRY_JPG',
    'LEGACY_PNG',
    'LEGACY_JPG',
    'FALLBACK',
];

/**
 * Convierte una ruta relativa del backend en URL absoluta.
 * Respeta URLs absolutas (http/https) sin tocarlas.
 */
export function resolveImageUrl(url) {
    if (!url) return null;
    if (url.startsWith('http')) return url;
    const hostBase = CONFIG.API_BASE_URL.replace('/api/v1', '');
    return `${hostBase}${url.startsWith('/') ? '' : '/'}${url}`;
}

/**
 * Construye la cascada de candidatos de imagen para un item del menú.
 * Devuelve un arreglo de `{ key, src, next }` donde `next` es la clave del
 * siguiente intento (o 'FALLBACK' si es el último recurso).
 */
export function buildImageChain(item) {
    const baseStaticUrl = CONFIG.API_BASE_URL.replace('/api/v1', '/static/catalog');
    const sku = item?.sku || item?.product_id || '';
    const apiImage = resolveImageUrl(item?.image);

    const candidates = [
        { key: 'API_IMG', src: apiImage },
        { key: 'TRY_PNG', src: `${baseStaticUrl}/${sku}.png` },
        { key: 'TRY_JPG', src: `${baseStaticUrl}/${sku}.jpg` },
        { key: 'LEGACY_PNG', src: `${baseStaticUrl}/Img1118_${sku}.png` },
        { key: 'LEGACY_JPG', src: `${baseStaticUrl}/Img1118_${sku}.jpg` },
    ];

    return candidates.map((candidate, idx) => ({
        ...candidate,
        next: candidates[idx + 1]?.key || 'FALLBACK',
    }));
}

/**
 * Devuelve el paso activo de la cascada para un estado dado.
 * Si el estado es 'FALLBACK' (o desconocido) devuelve null, señal de que se
 * debe renderizar el emoji de respaldo.
 */
export function resolveActiveImage(chain, status) {
    if (!Array.isArray(chain)) return null;
    if (status === 'FALLBACK') return null;
    return chain.find((step) => step.key === status) || null;
}

/**
 * Estado inicial de la cascada: si el item trae imagen de API arrancamos ahí;
 * si no, saltamos directo a la búsqueda por SKU.
 */
export function initialImageStatus(item) {
    return item?.image ? 'API_IMG' : 'TRY_PNG';
}
