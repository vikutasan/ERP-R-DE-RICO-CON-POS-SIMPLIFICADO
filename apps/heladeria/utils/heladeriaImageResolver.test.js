/**
 * Tests de la cascada de imágenes del POS de Heladería.
 *
 * Garantizan que el POS de Heladería resuelve imágenes EXACTAMENTE igual que
 * el POS de Panadería (`apps/pos/components/ProductCard.jsx`).
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../shared/config', () => ({
    CONFIG: { API_BASE_URL: 'http://localhost:5001/api/v1' },
}));

import {
    IMAGE_STEPS,
    resolveImageUrl,
    buildImageChain,
    resolveActiveImage,
    initialImageStatus,
} from './heladeriaImageResolver';

describe('heladeriaImageResolver', () => {
    describe('IMAGE_STEPS', () => {
        it('declara la cascada en el orden canónico', () => {
            expect(IMAGE_STEPS).toEqual([
                'API_IMG',
                'TRY_PNG',
                'TRY_JPG',
                'LEGACY_PNG',
                'LEGACY_JPG',
                'FALLBACK',
            ]);
        });
    });

    describe('resolveImageUrl', () => {
        it('devuelve null si no hay url', () => {
            expect(resolveImageUrl(null)).toBeNull();
            expect(resolveImageUrl('')).toBeNull();
            expect(resolveImageUrl(undefined)).toBeNull();
        });

        it('respeta URLs absolutas sin tocarlas', () => {
            const abs = 'https://cdn.example.com/foto.png';
            expect(resolveImageUrl(abs)).toBe(abs);
        });

        it('prefija el host cuando la ruta empieza con /', () => {
            expect(resolveImageUrl('/static/catalog/a.png')).toBe(
                'http://localhost:5001/static/catalog/a.png'
            );
        });

        it('añade la barra cuando la ruta es relativa sin /', () => {
            expect(resolveImageUrl('static/catalog/a.png')).toBe(
                'http://localhost:5001/static/catalog/a.png'
            );
        });
    });

    describe('buildImageChain', () => {
        it('construye los 5 candidatos con su next encadenado', () => {
            const chain = buildImageChain({ sku: 'SKU1', image: '/static/x.png' });

            expect(chain.map((c) => c.key)).toEqual([
                'API_IMG',
                'TRY_PNG',
                'TRY_JPG',
                'LEGACY_PNG',
                'LEGACY_JPG',
            ]);
            expect(chain[0].next).toBe('TRY_PNG');
            expect(chain[1].next).toBe('TRY_JPG');
            expect(chain[2].next).toBe('LEGACY_PNG');
            expect(chain[3].next).toBe('LEGACY_JPG');
            expect(chain[4].next).toBe('FALLBACK');
        });

        it('usa el SKU para las rutas de respaldo', () => {
            const chain = buildImageChain({ sku: 'ABC9', image: null });
            const byKey = Object.fromEntries(chain.map((c) => [c.key, c.src]));

            expect(byKey.TRY_PNG).toBe(
                'http://localhost:5001/static/catalog/ABC9.png'
            );
            expect(byKey.TRY_JPG).toBe(
                'http://localhost:5001/static/catalog/ABC9.jpg'
            );
            expect(byKey.LEGACY_PNG).toBe(
                'http://localhost:5001/static/catalog/Img1118_ABC9.png'
            );
            expect(byKey.LEGACY_JPG).toBe(
                'http://localhost:5001/static/catalog/Img1118_ABC9.jpg'
            );
        });

        it('cae al product_id cuando no hay SKU', () => {
            const chain = buildImageChain({ product_id: 500, image: null });
            const png = chain.find((c) => c.key === 'TRY_PNG');
            expect(png.src).toBe('http://localhost:5001/static/catalog/500.png');
        });

        it('deja API_IMG en null si el item no trae imagen', () => {
            const chain = buildImageChain({ sku: 'X', image: null });
            expect(chain[0].src).toBeNull();
        });

        it('tolera un item nulo sin lanzar', () => {
            expect(() => buildImageChain(null)).not.toThrow();
            const chain = buildImageChain(null);
            expect(chain).toHaveLength(5);
        });
    });

    describe('resolveActiveImage', () => {
        const chain = buildImageChain({ sku: 'S1', image: '/a.png' });

        it('devuelve el paso correspondiente al estado', () => {
            expect(resolveActiveImage(chain, 'TRY_JPG').key).toBe('TRY_JPG');
        });

        it('devuelve null en FALLBACK (señal de emoji)', () => {
            expect(resolveActiveImage(chain, 'FALLBACK')).toBeNull();
        });

        it('devuelve null si la cadena no es un arreglo', () => {
            expect(resolveActiveImage(null, 'API_IMG')).toBeNull();
        });

        it('devuelve null si el estado es desconocido', () => {
            expect(resolveActiveImage(chain, 'NOPE')).toBeNull();
        });
    });

    describe('initialImageStatus', () => {
        it('arranca en API_IMG cuando hay imagen', () => {
            expect(initialImageStatus({ image: '/a.png' })).toBe('API_IMG');
        });

        it('arranca en TRY_PNG cuando no hay imagen', () => {
            expect(initialImageStatus({ image: null })).toBe('TRY_PNG');
        });

        it('arranca en TRY_PNG si el item es nulo', () => {
            expect(initialImageStatus(null)).toBe('TRY_PNG');
        });
    });
});
