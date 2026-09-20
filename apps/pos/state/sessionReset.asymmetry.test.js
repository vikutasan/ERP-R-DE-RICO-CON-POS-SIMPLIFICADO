/**
 * v17 — FASE 0: Test de REPRODUCCIÓN de la asimetría de limpieza de sesión.
 *
 * MISIÓN: verificar (o refutar) el hallazgo §1.4 del PLAN_CORRECCION_ESTADO_POS_V17.md.
 *
 * Hallazgo a verificar:
 *   La rama `success` de `handleTicketAction` (useTicketActions.js:289-301)
 *   limpia 10 cosas pero NO limpia:
 *     - savedTicketRef.current
 *     - showExitModal
 *     - pendingExitAction
 *   mientras que `handleExitWithoutSaving` (RetailVisionPOS.jsx:385-417)
 *   SÍ limpia `savedTicketRef.current` (línea 406).
 *
 * Este test es de CARACTERIZACIÓN: lee el código fuente real y afirma lo que
 * HOY ocurre. Si el código cambia, el test falla y obliga a revisar el plan.
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
 * Se ancla desde `clearCart();` (línea 289) hasta el `return { outcome: 'success'`.
 */
function extractSuccessBranch(source) {
    const start = source.indexOf('clearCart();\n                        setOriginalCapturer(null);');
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

    it('CONFIRMA: la rama success limpia el estado de captura básico', () => {
        // Estas 10 limpiezas SÍ están presentes hoy.
        expect(successBranch).toContain('clearCart();');
        expect(successBranch).toContain('setOriginalCapturer(null);');
        expect(successBranch).toContain("setCurrentAccountNum('');");
        expect(successBranch).toContain('setTicketVersion(null);');
        expect(successBranch).toContain('setOrderData(null);');
        expect(successBranch).toContain("setOrderType('VENTA_DIRECTA');");
        expect(successBranch).toContain("setLastSaveStatus('idle');");
        expect(successBranch).toContain('setLastSaveTime(null);');
        expect(successBranch).toContain('setShowCheckout(false);');
        expect(successBranch).toContain('setPaymentsHistory([]);');
    });

    it('REPRODUCE LA ASIMETRÍA: la rama success NO limpia savedTicketRef', () => {
        // Evidencia del defecto §1.4: la rama success no toca savedTicketRef.
        expect(successBranch).not.toContain('savedTicketRef.current = null');
    });

    it('REPRODUCE LA ASIMETRÍA: la rama success NO limpia showExitModal', () => {
        expect(successBranch).not.toContain('setShowExitModal(false)');
    });

    it('REPRODUCE LA ASIMETRÍA: la rama success NO limpia pendingExitAction', () => {
        expect(successBranch).not.toContain('setPendingExitAction(null)');
    });

    it('CONTRASTE: handleExitWithoutSaving SÍ limpia savedTicketRef', () => {
        // Esto es lo que hace la asimetría real: una ruta limpia, la otra no.
        expect(exitWithoutSaving).toContain('savedTicketRef.current = null');
    });

    it('CONTRASTE: handleExitWithoutSaving SÍ limpia showExitModal y pendingExitAction', () => {
        expect(exitWithoutSaving).toContain('setShowExitModal(false)');
        expect(exitWithoutSaving).toContain('setPendingExitAction(null)');
    });

    it('VEREDICTO: la asimetría es real y verificable en el código fuente', () => {
        // Resumen ejecutable del hallazgo:
        const successClearsSavedTicket = successBranch.includes('savedTicketRef.current = null');
        const exitClearsSavedTicket = exitWithoutSaving.includes('savedTicketRef.current = null');

        // La asimetría existe si una limpia y la otra no.
        expect(successClearsSavedTicket).toBe(false);
        expect(exitClearsSavedTicket).toBe(true);
        expect(successClearsSavedTicket).not.toBe(exitClearsSavedTicket);
    });
});
