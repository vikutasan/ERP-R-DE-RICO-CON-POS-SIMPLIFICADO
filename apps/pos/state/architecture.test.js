/**
 * v17 — Tests de ARQUITECTURA (best-effort).
 *
 * MISIÓN:
 *   Fijar dos invariantes arquitectónicas que, si se rompen, reintroducen
 *   bugs ya corregidos en versiones anteriores (v15 y v7.0.3):
 *
 *     1. v15 (H2): el backend POS NO debe usar `datetime.now()` (hora local
 *        naive). Debe usar el helper UTC centralizado
 *        (`apps/api/core/timestamps.py` -> `utcnow()`). Si alguien reintroduce
 *        `datetime.now()` en código vivo, los timestamps vuelven a depender de
 *        la zona horaria del contenedor.
 *
 *     2. v7.0.3: el payload del beacon de emergencia (`handleForceLogout`) DEBE
 *        incluir `terminal_id` DENTRO del `JSON.stringify(...)`, para que el
 *        ticket de emergencia quede asociado a la terminal correcta.
 *
 * -----------------------------------------------------------------------------
 * ALCANCE — LEER ANTES DE CONFIAR EN ESTOS TESTS
 * -----------------------------------------------------------------------------
 *   Estos tests son BEST-EFFORT. Analizan el TEXTO del código fuente, no el AST.
 *   Por lo tanto:
 *     - NO cubren alias (`from datetime import datetime as dt`).
 *     - NO cubren imports indirectos ni re-exports.
 *     - NO distinguen código muerto de código vivo.
 *     - La detección de comentarios es heurística (por prefijo de línea).
 *
 *   Su valor es el de un "detector de humo": atrapan la regresión OBVIA
 *   (volver a escribir `datetime.now()` a mano, o mover `terminal_id` fuera
 *   del payload). NO sustituyen una revisión de código ni un linter con AST.
 *
 *   Si alguno de estos tests falla, NO lo "arregles" relajando la regex:
 *   primero investiga si es un hallazgo real (código nuevo que viola la regla)
 *   o un falso positivo (comentario/documentación). Documenta el resultado.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const POS_API_DIR = resolve(REPO_ROOT, 'apps', 'api', 'modules', 'pos');
const POS_ROOT = resolve(__dirname, '..');

/**
 * Normaliza CRLF -> LF para que las anclas de búsqueda sean independientes
 * del estilo de fin de línea del archivo (Windows/Unix).
 */
function normalize(text) {
    return text.replace(/\r\n/g, '\n');
}

function readSource(absolutePath) {
    return normalize(readFileSync(absolutePath, 'utf8'));
}

/**
 * Lista recursivamente los archivos `.py` de un directorio.
 */
function listPythonFiles(dir) {
    const out = [];
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
            out.push(...listPythonFiles(full));
        } else if (entry.endsWith('.py')) {
            out.push(full);
        }
    }
    return out;
}

/**
 * Devuelve las líneas de código VIVO (excluye comentarios y docstrings simples).
 *
 * Heurística (best-effort):
 *   - Descarta líneas cuyo primer carácter no-blanco sea `#` (comentario Python).
 *   - Descarta líneas dentro de un bloque `"""..."""` (docstring).
 *   - Conserva comentarios INLINE (`x = 1  # nota`) porque el código de la
 *     izquierda sí es vivo; la regex de `datetime.now()` no matchea el texto
 *     del comentario inline salvo que lo contenga, que es justo lo que
 *     queremos detectar.
 *
 * LIMITACIÓN CONOCIDA: no maneja docstrings de una sola línea con contenido
 * a ambos lados, ni strings multilínea anidados. Es suficiente para este repo.
 */
function liveCodeLines(source) {
    const lines = source.split('\n');
    const out = [];
    let inDocstring = false;

    for (const rawLine of lines) {
        const trimmed = rawLine.trim();

        // Alterna el estado de docstring al encontrar `"""` (par o impar).
        const tripleQuotes = (trimmed.match(/"""/g) || []).length;
        if (tripleQuotes > 0) {
            if (tripleQuotes % 2 === 1) {
                inDocstring = !inDocstring;
            }
            // La línea que abre/cierra un docstring no es código vivo.
            continue;
        }
        if (inDocstring) continue;

        // Comentario puro.
        if (trimmed.startsWith('#')) continue;

        out.push(rawLine);
    }
    return out;
}

describe('Arquitectura POS — v15 (H2): sin datetime.now() en código vivo', () => {
    const files = listPythonFiles(POS_API_DIR);

    it('encuentra archivos Python en apps/api/modules/pos/ (sanity check)', () => {
        // Si esto falla, la ruta cambió y el test de abajo pasaría "en vacío".
        expect(files.length).toBeGreaterThan(0);
    });

    it('ningún archivo .py usa datetime.now() fuera de comentarios/docstrings', () => {
        // Regex ANCLADA: exige el nombre completo `datetime.now(`.
        // No matchea `utcnow()`, ni `now()`, ni `datetime.now` sin paréntesis.
        const ANCHORED = /\bdatetime\.now\s*\(/;

        const violations = [];
        for (const file of files) {
            const source = readSource(file);
            const live = liveCodeLines(source);
            live.forEach((line, idx) => {
                if (ANCHORED.test(line)) {
                    violations.push(
                        `${file.replace(REPO_ROOT, '').replace(/\\/g, '/')}:${idx + 1} -> ${line.trim()}`
                    );
                }
            });
        }

        // Mensaje de fallo útil: lista exacta de violaciones.
        expect(
            violations,
            `Se encontró datetime.now() en código vivo. Usa utcnow() de apps/api/core/timestamps.py.\n` +
            `Violaciones:\n${violations.join('\n')}`
        ).toEqual([]);
    });

    it('el helper UTC centralizado existe y exporta utcnow()', () => {
        // Guardián del "otro lado" de la regla: si alguien borra el helper,
        // el test de arriba seguiría pasando pero la regla quedaría huérfana.
        const helperPath = resolve(REPO_ROOT, 'apps', 'api', 'core', 'timestamps.py');
        const source = readSource(helperPath);
        expect(source).toMatch(/def\s+utcnow\s*\(/);
    });

    it('los comentarios que MENCIONAN datetime.now() no cuentan como violación', () => {
        // Regresión del falso positivo: occupancy.py documenta el cambio a
        // utcnow() mencionando el viejo datetime.now() en un comentario.
        const occupancy = resolve(POS_API_DIR, 'occupancy.py');
        const source = readSource(occupancy);
        const live = liveCodeLines(source);
        const liveText = live.join('\n');

        // El comentario existe en el archivo...
        expect(source).toContain('datetime.now()');
        // ...pero NO en el código vivo.
        expect(liveText).not.toMatch(/\bdatetime\.now\s*\(/);
    });
});

describe('Arquitectura POS — v7.0.3: terminal_id dentro del payload de emergencia', () => {
    const posSource = readSource(resolve(POS_ROOT, 'RetailVisionPOS.jsx'));

    /**
     * Extrae el bloque `JSON.stringify({ ... })` de `handleForceLogout`.
     * Se ancla desde el nombre de la función hasta el cierre del beacon.
     */
    function extractForceLogoutBlock(source) {
        const start = source.indexOf('const handleForceLogout = () => {');
        if (start === -1) return null;
        const end = source.indexOf('onForceLogout();', start);
        if (end === -1) return null;
        return source.slice(start, end);
    }

    /**
     * Extrae el contenido del `JSON.stringify({ ... })` dentro de un bloque.
     * Devuelve el texto ENTRE las llaves del objeto, o null si no lo encuentra.
     */
    function extractStringifyObject(block) {
        const marker = 'JSON.stringify({';
        const start = block.indexOf(marker);
        if (start === -1) return null;
        const bodyStart = start + marker.length;
        const end = block.indexOf('})', bodyStart);
        if (end === -1) return null;
        return block.slice(bodyStart, end);
    }

    it('handleForceLogout existe y construye un JSON.stringify', () => {
        const block = extractForceLogoutBlock(posSource);
        expect(block, 'No se encontró handleForceLogout en RetailVisionPOS.jsx').not.toBeNull();
        expect(block).toContain('JSON.stringify({');
    });

    it('terminal_id está DENTRO del objeto JSON.stringify (no en un comentario)', () => {
        const block = extractForceLogoutBlock(posSource);
        expect(block).not.toBeNull();

        const payloadBody = extractStringifyObject(block);
        expect(payloadBody, 'No se pudo aislar el objeto del JSON.stringify').not.toBeNull();

        // Anclado a la CLAVE del objeto: `terminal_id:` (con dos puntos).
        // Esto evita matchear la palabra en un comentario o en un string.
        expect(payloadBody).toMatch(/\bterminal_id\s*:/);
    });

    it('el payload de emergencia incluye account_num e items (contrato completo)', () => {
        const block = extractForceLogoutBlock(posSource);
        const payloadBody = extractStringifyObject(block);
        expect(payloadBody).not.toBeNull();

        expect(payloadBody).toMatch(/\baccount_num\s*:/);
        expect(payloadBody).toMatch(/\bitems\s*:/);
    });

    it('el endpoint del beacon apunta a /pos/tickets/emergency-save', () => {
        const block = extractForceLogoutBlock(posSource);
        expect(block).not.toBeNull();
        expect(block).toContain('/pos/tickets/emergency-save');
    });
});

describe('Arquitectura POS — v18: handleForceLogout aplica buildResetPatch() (cierre del contrato)', () => {
    const posSource = readSource(resolve(POS_ROOT, 'RetailVisionPOS.jsx'));

    /**
     * Extrae el bloque de `handleForceLogout` EXCLUYENDO `onForceLogout();`.
     * (slice(start, end) es exclusivo en `end`.) Se usa para los tests 1-6.
     */
    function extractForceLogoutBlock(source) {
        const start = source.indexOf('const handleForceLogout = () => {');
        if (start === -1) return null;
        const end = source.indexOf('onForceLogout();', start);
        if (end === -1) return null;
        return source.slice(start, end);
    }

    /**
     * NUEVO extractor (P1) — incluye el cierre de la función, por lo que SÍ
     * contiene `onForceLogout();`. Se usa SOLO para el test de última sentencia.
     */
    function extractForceLogoutFull(source) {
        const start = source.indexOf('const handleForceLogout = () => {');
        if (start === -1) return null;
        const end = source.indexOf('\n    };', start);   // cierre de la arrow function
        if (end === -1) return null;
        return source.slice(start, end + '\n    };'.length);
    }

    // Test 1 (O8, P2 — PERMANENTE): sanidad "no vacuo".
    // PASA en FASE 0 y FASE 1. Su misión es evitar que los demás tests pasen
    // sobre un bloque vacío, NO detectar la migración.
    it('1. sanidad: el bloque de handleForceLogout no es vacuo (length > 100)', () => {
        const block = extractForceLogoutBlock(posSource);
        expect(block, 'No se encontró handleForceLogout en RetailVisionPOS.jsx').not.toBeNull();
        expect(block.length).toBeGreaterThan(100);
    });

    // Test 2 (presencia): el bloque aplica la fuente única de verdad.
    it('2. presencia: handleForceLogout contiene buildResetPatch()', () => {
        const block = extractForceLogoutBlock(posSource);
        expect(block).not.toBeNull();
        expect(block).toContain('const patch = buildResetPatch();');
    });

    // Test 3 (D1, P7 — best-effort): el beacon se construye ANTES de limpiar.
    it('3. ORDEN: el beacon (JSON.stringify) se construye antes del patch', () => {
        const block = extractForceLogoutBlock(posSource);
        expect(block).not.toBeNull();
        const beaconIdx = block.indexOf('JSON.stringify({');
        const patchIdx = block.indexOf('const patch = buildResetPatch()');
        expect(beaconIdx, 'No se encontró el beacon JSON.stringify').toBeGreaterThan(-1);
        expect(patchIdx, 'No se encontró const patch = buildResetPatch()').toBeGreaterThan(-1);
        expect(beaconIdx).toBeLessThan(patchIdx);
    });

    // Test 4 (refs): sincroniza las 5 refs.
    it('4. refs: sincroniza las 5 refs de sesión', () => {
        const block = extractForceLogoutBlock(posSource);
        expect(block).not.toBeNull();
        expect(block).toContain('cartRef.current = []');
        expect(block).toContain("accountNumRef.current = ''");
        expect(block).toContain('originalCapturerRef.current = null');
        expect(block).toContain('ticketVersionRef.current = null');
        expect(block).toContain('savedTicketRef.current = null');
    });

    // Test 5 (claves de la asimetría A2): las claves que v17 corrigió.
    it('5. claves de asimetría: limpia showExitModal, pendingExitAction y savedTicketRef', () => {
        const block = extractForceLogoutBlock(posSource);
        expect(block).not.toBeNull();
        expect(block).toContain('setShowExitModal(patch.showExitModal)');
        expect(block).toContain('setPendingExitAction(patch.pendingExitAction)');
        expect(block).toContain('savedTicketRef.current = null');
    });

    // Test 6 (D2, P3 — por STRING, no regex): NO duplica la clave del carrito.
    // PASA en FASE 0 (el código actual no tiene ningún removeItem) y debe seguir
    // pasando: es un guardián de no-duplicación.
    it('6. no duplica la clave del carrito (solo borra la de sesión)', () => {
        const block = extractForceLogoutBlock(posSource);
        expect(block).not.toBeNull();
        expect(block).not.toContain('removeItem(`pos_cart_');
        expect(block).toContain('removeItem(`pos_session_');
    });

    // Test 7 (N3, P1 — usa extractForceLogoutFull): onForceLogout() es la última sentencia.
    it('7. última sentencia: onForceLogout(); cierra la función', () => {
        const full = extractForceLogoutFull(posSource);
        expect(full, 'No se pudo extraer el bloque completo de handleForceLogout').not.toBeNull();
        expect(full.trimEnd().endsWith('onForceLogout();\n    };')).toBe(true);
    });

    // Test 8 (P4 — lee DOS archivos): las 4 rutas de limpieza aplican el patch.
    it('8. contraste: las 4 rutas de limpieza contienen buildResetPatch()', () => {
        const ticketActionsSource = readSource(resolve(POS_ROOT, 'hooks/useTicketActions.js'));
        expect(posSource).toContain('const patch = buildResetPatch();');
        expect(ticketActionsSource).toContain('const patch = buildResetPatch();');
    });
});

/**
 * v19 — Guardián de la redundancia de `doTerminalExit`.
 *
 * HISTORIA:
 *   `doTerminalExit` borraba a mano `pos_cart_${selectedTerminal}` (línea 360)
 *   ANTES de llamar a `clearCart()`. Pero `clearCart()` YA borra esa misma
 *   clave (ver useCart.js: `localStorage.removeItem(storageKey)` donde
 *   `storageKey = pos_cart_${terminalId}`). Era una redundancia histórica.
 *
 * MISIÓN ACTUAL: garantizar que la redundancia NO reaparezca. Si alguien
 * vuelve a añadir un `removeItem(\`pos_cart_\`)` en `doTerminalExit`, este
 * test falla.
 *
 * ALCANCE (best-effort): analiza el TEXTO del bloque de `doTerminalExit`.
 * NO distingue código muerto. Su valor es el de un detector de humo.
 *
 * NOTA (v19): este test es la ÚNICA corrección real de v19. La asimetría A3
 * (la rama success aplica 1 ref, las otras 3 aplican 5) se documenta como
 * inconsistencia de estilo ACEPTADA, no como bug: el useEffect de
 * RetailVisionPOS.jsx:95 (cartRef.current = cart) ya re-sincroniza cartRef
 * tras clearCart(). NO se toca la rama success (ruta de cada venta).
 */
describe('Arquitectura POS — v19: doTerminalExit NO duplica la clave del carrito', () => {
    const posSource = readSource(resolve(POS_ROOT, 'RetailVisionPOS.jsx'));

    /**
     * Extrae el bloque de `doTerminalExit` desde su declaración hasta el
     * cierre de la función (`\n    };`).
     */
    function extractDoTerminalExit(source) {
        const start = source.indexOf('const doTerminalExit = async () => {');
        if (start === -1) return null;
        const end = source.indexOf('\n    };', start);
        if (end === -1) return null;
        return source.slice(start, end + '\n    };'.length);
    }

    // Test 1 (sanidad): el bloque se localiza y no es vacuo.
    it('1. sanidad: el bloque de doTerminalExit no es vacuo (length > 100)', () => {
        const block = extractDoTerminalExit(posSource);
        expect(block, 'No se encontró doTerminalExit en RetailVisionPOS.jsx').not.toBeNull();
        expect(block.length).toBeGreaterThan(100);
    });

    // Test 2 (presencia): sigue aplicando la fuente única de verdad.
    it('2. presencia: doTerminalExit contiene buildResetPatch()', () => {
        const block = extractDoTerminalExit(posSource);
        expect(block).not.toBeNull();
        expect(block).toContain('const patch = buildResetPatch();');
    });

    // Test 3 (v19 — el guardián): NO duplica la clave del carrito.
    it('3. NO duplica la clave del carrito (clearCart() ya la borra)', () => {
        const block = extractDoTerminalExit(posSource);
        expect(block).not.toBeNull();
        expect(block).not.toContain('removeItem(`pos_cart_');
    });

    // Test 4 (contraste): SÍ borra la clave de sesión (esa NO la borra clearCart).
    it('4. SÍ borra la clave de sesión (pos_session_)', () => {
        const block = extractDoTerminalExit(posSource);
        expect(block).not.toBeNull();
        expect(block).toContain('removeItem(`pos_session_');
    });

    // Test 5 (contraste): sigue llamando a clearCart() (que borra pos_cart_).
    it('5. sigue llamando a clearCart() (fuente real del borrado del carrito)', () => {
        const block = extractDoTerminalExit(posSource);
        expect(block).not.toBeNull();
        expect(block).toContain('clearCart();');
    });
});
