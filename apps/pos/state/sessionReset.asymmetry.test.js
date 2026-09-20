/**
 * v17 — Test de la asimetría de limpieza de sesión.
 *
 * HISTORIA:
 *   - FASE 0 (commit 27c3469): este test REPRODUJO la asimetría. Afirmaba que
 *     la rama `success` de `handleTicketAction` NO limpiaba savedTicketRef /
 *     showExitModal / pendingExitAction, mientras `handleExitWithoutSaving` SÍ.
 *   - FASE 2b (este commit): la asimetría se CORRIGIÓ. La rama success ahora
 *     aplica buildResetPatch() y limpia las 3 claves. El test se actualiza para
 *     afirmar el comportamiento CORREGIDO (guardián de la regresión).
 *
 * MISIÓN ACTUAL: garantizar que la asimetría NO reaparezca. Si alguien vuelve
 * a limpiar la rama success a mano y olvida las 3 claves, este test falla.
 *
 * IMPORTANTE: este test NO prueba comportamiento en runtime (eso requiere
 * montar el componente con 30 props). Prueba la PRESENCIA/AUSENCIA de las
 * sentencias de limpieza en el código fuente. Es la evidencia más fuerte
 * disponible sin un harness de integración completo.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const POS_ROOT = resolve(__dirname, '..');

function readSource(relativePath) {
    // Normaliza CRLF → LF para que las anclas de búsqueda sean
    // independientes del estilo de fin de línea del archivo (Windows/Unix).
    return readFileSync(resolve(POS_ROOT, relativePath), 'utf8').replace(/\r\n/g, '\n');
}

/**
 * Extrae el bloque de la rama `success` de `handleTicketAction`.
 * Se ancla desde la construcción del patch hasta el `return { outcome: 'success'`.
 * (Tras FASE 2b, la rama usa buildResetPatch().)
 */
function extractSuccessBranch(source) {
    const start = source.indexOf('const patch = buildResetPatch();');
    if (start === -1) return null;
    const end = source.indexOf("return { outcome: 'success'", start);
    if (end === -1) return null;
    return source.slice(start, end);
}

/**
 * Extrae el cuerpo de `handleExitWithoutSaving`.
 */
function extractExitWithoutSaving(source) {
    const start = source.indexOf('const handleExitWithoutSaving = () => {');
    if (start === -1) return null;
    const end = source.indexOf('const handleForceLogout', start);
    if (end === -1) return null;
    return source.slice(start, end);
}

describe('FASE 0 — Reproducción de la asimetría de limpieza (v17)', () => {
    const ticketActionsSrc = readSource('hooks/useTicketActions.js');
    const posSrc = readSource('RetailVisionPOS.jsx');

    const successBranch = extractSuccessBranch(ticketActionsSrc);
    const exitWithoutSaving = extractExitWithoutSaving(posSrc);

    it('los bloques de código se localizan (el test no es vacuo)', () => {
        expect(successBranch, 'rama success de handleTicketAction').not.toBeNull();
        expect(exitWithoutSaving, 'handleExitWithoutSaving').not.toBeNull();
        expect(successBranch.length).toBeGreaterThan(100);
        expect(exitWithoutSaving.length).toBeGreaterThan(100);
    });

    it('CONFIRMA: la rama success usa buildResetPatch() (fuente única)', () => {
        expect(successBranch).toContain('const patch = buildResetPatch();');
        expect(successBranch).toContain('clearCart();');
    });

    it('CORREGIDO: la rama success AHORA limpia savedTicketRef', () => {
        // FASE 2b corrigió la asimetría: ya no queda residuo.
        expect(successBranch).toContain('savedTicketRef.current = null');
    });

    it('CORREGIDO: la rama success AHORA limpia showExitModal', () => {
        expect(successBranch).toContain('setShowExitModal(patch.showExitModal)');
    });

    it('CORREGIDO: la rama success AHORA limpia pendingExitAction', () => {
        expect(successBranch).toContain('setPendingExitAction(patch.pendingExitAction)');
    });

    it('CONTRASTE: handleExitWithoutSaving también limpia savedTicketRef', () => {
        expect(exitWithoutSaving).toContain('savedTicketRef.current = null');
    });

    it('CONTRASTE: handleExitWithoutSaving también limpia showExitModal y pendingExitAction', () => {
        expect(exitWithoutSaving).toContain('setShowExitModal(patch.showExitModal)');
        expect(exitWithoutSaving).toContain('setPendingExitAction(patch.pendingExitAction)');
    });

    it('VEREDICTO: la asimetría está CORREGIDA — ambas rutas limpian lo mismo', () => {
        // Guardián de regresión: si alguien vuelve a limpiar a mano y olvida
        // las 3 claves, este test falla.
        const successClearsSavedTicket = successBranch.includes('savedTicketRef.current = null');
        const exitClearsSavedTicket = exitWithoutSaving.includes('savedTicketRef.current = null');

        // Ya NO hay asimetría: ambas limpian.
        expect(successClearsSavedTicket).toBe(true);
        expect(exitClearsSavedTicket).toBe(true);
        expect(successClearsSavedTicket).toBe(exitClearsSavedTicket);
    });
});
