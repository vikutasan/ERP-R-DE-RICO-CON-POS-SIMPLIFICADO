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
import { RESET_PATCH_KEYS } from './sessionReset.js';

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

/**
 * v20 — Elimina comentarios de JavaScript (`//` y `/* ... *​/`) para que las
 * aserciones `toContain` solo vean CÓDIGO VIVO.
 *
 * MOTIVO (hallazgo de la prueba de mutación de v20):
 *   La primera versión del guardián usaba `toContain` sobre el bloque crudo.
 *   Al comentar temporalmente `setPendingExitAction(patch.pendingExitAction)`
 *   con `//`, el substring SEGUÍA presente en el comentario y el test PASABA
 *   (falso verde). Este helper cierra ese agujero.
 *
 * LIMITACIÓN CONOCIDA: no es un parser. No maneja `//` dentro de strings
 * (p. ej. `'http://...'`) ni regex literales. Para este repo (los bloques de
 * limpieza no contienen URLs ni regex) es suficiente. Es un detector de humo.
 */
function stripJsComments(source) {
    // 1) Elimina comentarios de bloque (multilínea).
    let out = source.replace(/\/\*[\s\S]*?\*\//g, '');
    // 2) Elimina comentarios de línea, preservando el salto de línea.
    out = out
        .split('\n')
        .map(line => line.replace(/\/\/.*$/, ''))
        .join('\n');
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

/**
 * v20 — Guardián de SIMETRÍA de la aplicación del patch de limpieza.
 *
 * PROBLEMA (frágil por acumulación):
 *   `buildResetPatch()` (v17) centraliza los VALORES de la limpieza, pero cada
 *   una de las 4 rutas de salida los APLICA a mano (11 setters + refs). Si en
 *   el futuro se añade una clave a `RESET_PATCH_KEYS`, es fácil olvidar
 *   aplicarla en alguna de las 4 rutas → desincronización silenciosa.
 *
 * MISIÓN:
 *   Verificar que las 4 rutas aplican EXACTAMENTE el mismo conjunto de setters
 *   derivado de `RESET_PATCH_KEYS`. El guardián es ADITIVO: no toca código de
 *   producción ni modifica tests existentes.
 *
 * LAS 4 RUTAS:
 *   1. doTerminalExit          (RetailVisionPOS.jsx)
 *   2. handleExitWithoutSaving (RetailVisionPOS.jsx)
 *   3. handleForceLogout       (RetailVisionPOS.jsx)
 *   4. rama success            (useTicketActions.js)
 *
 * ASIMETRÍA ACEPTADA (v19, A3):
 *   La rama success aplica SOLO 1 ref (`savedTicketRef`), mientras las otras 3
 *   aplican 5. NO es un bug: el useEffect de RetailVisionPOS.jsx:95
 *   (`cartRef.current = cart`) re-sincroniza `cartRef` tras `clearCart()`, y
 *   `accountNumRef` / `originalCapturerRef` / `ticketVersionRef` se re-sincronizan
 *   al montar la siguiente cuenta. Por eso este guardián verifica SETTERS
 *   (simetría estricta) y solo exige el ref `savedTicketRef` (el único que las
 *   4 rutas deben limpiar explícitamente).
 *
 * ALCANCE (best-effort): analiza el TEXTO de los bloques. NO distingue código
 * muerto. Su valor es el de un detector de humo.
 */
describe('Arquitectura POS — v20: las 4 rutas aplican el mismo patch (simetría)', () => {
    const posSource = readSource(resolve(POS_ROOT, 'RetailVisionPOS.jsx'));
    const ticketActionsSource = readSource(resolve(POS_ROOT, 'hooks', 'useTicketActions.js'));

    /**
     * Deriva el nombre del setter a partir de la clave del patch.
     * `currentAccountNum` -> `setCurrentAccountNum`
     */
    function setterNameFor(key) {
        return 'set' + key.charAt(0).toUpperCase() + key.slice(1);
    }

    /**
     * Claves del patch que NO se aplican con un setter sino con una ref.
     * `savedTicket` -> `savedTicketRef.current = null`
     */
    const REF_KEYS = { savedTicket: 'savedTicketRef' };

    /**
     * Extrae un bloque desde su declaración hasta el cierre `\n    };` y le
     * quita los comentarios JS (para que `toContain` solo vea código vivo).
     */
    function extractBlock(source, declaration) {
        const start = source.indexOf(declaration);
        if (start === -1) return null;
        const end = source.indexOf('\n    };', start);
        if (end === -1) return null;
        return stripJsComments(source.slice(start, end + '\n    };'.length));
    }

    /**
     * Extrae la rama success de `handleTicketAction` (useTicketActions.js) y le
     * quita los comentarios JS.
     * Ancla: desde `const patch = buildResetPatch();` hasta el `return` de
     * éxito (`return { outcome: 'success'`).
     */
    function extractSuccessBranch(source) {
        const start = source.indexOf('const patch = buildResetPatch();');
        if (start === -1) return null;
        const end = source.indexOf("return { outcome: 'success'", start);
        if (end === -1) return null;
        return stripJsComments(source.slice(start, end));
    }

    // Las 4 rutas con su extractor y su archivo de origen.
    const ROUTES = [
        {
            name: 'doTerminalExit',
            file: 'RetailVisionPOS.jsx',
            block: extractBlock(posSource, 'const doTerminalExit = async () => {'),
        },
        {
            name: 'handleExitWithoutSaving',
            file: 'RetailVisionPOS.jsx',
            block: extractBlock(posSource, 'const handleExitWithoutSaving = () => {'),
        },
        {
            name: 'handleForceLogout',
            file: 'RetailVisionPOS.jsx',
            block: extractBlock(posSource, 'const handleForceLogout = () => {'),
        },
        {
            name: 'rama success (handleTicketAction)',
            file: 'useTicketActions.js',
            block: extractSuccessBranch(ticketActionsSource),
        },
    ];

    // Test 1 (sanidad): las 4 rutas se localizan y no son vacuas.
    it('1. sanidad: las 4 rutas se localizan y no son vacuas', () => {
        for (const route of ROUTES) {
            expect(route.block, `No se encontró la ruta ${route.name} en ${route.file}`).not.toBeNull();
            expect(route.block.length, `La ruta ${route.name} es sospechosamente corta`).toBeGreaterThan(100);
        }
    });

    // Test 2 (contrato): las 4 rutas parten de buildResetPatch().
    it('2. contrato: las 4 rutas contienen `const patch = buildResetPatch();`', () => {
        for (const route of ROUTES) {
            expect(route.block, `Ruta ${route.name}: no parte de buildResetPatch()`)
                .toContain('const patch = buildResetPatch();');
        }
    });

    // Test 3 (simetría — el guardián): cada ruta aplica TODOS los setters.
    it('3. simetría: cada ruta aplica los 11 setters derivados de RESET_PATCH_KEYS', () => {
        for (const route of ROUTES) {
            for (const key of RESET_PATCH_KEYS) {
                if (REF_KEYS[key]) continue; // se verifica en el Test 4
                const setter = setterNameFor(key);
                expect(
                    route.block,
                    `Ruta ${route.name} (${route.file}): falta aplicar ${setter}(patch.${key})`
                ).toContain(`${setter}(patch.${key})`);
            }
        }
    });

    // Test 4 (refs): las 4 rutas limpian explícitamente savedTicketRef.
    it('4. refs: las 4 rutas limpian savedTicketRef.current = null', () => {
        for (const route of ROUTES) {
            expect(
                route.block,
                `Ruta ${route.name} (${route.file}): falta savedTicketRef.current = null`
            ).toContain('savedTicketRef.current = null');
        }
    });

    // Test 5 (cobertura): el guardián no es vacuo — cubre las 12 claves.
    it('5. cobertura: RESET_PATCH_KEYS tiene 12 claves (11 setters + 1 ref)', () => {
        expect(RESET_PATCH_KEYS.length).toBe(12);
        const refCount = RESET_PATCH_KEYS.filter(k => REF_KEYS[k]).length;
        expect(refCount).toBe(1);
        expect(RESET_PATCH_KEYS.length - refCount).toBe(11);
    });

    // Test 6 (anti-regresión): ninguna ruta aplica un setter FUERA del patch.
    it('6. anti-regresión: ninguna ruta aplica un setter ajeno al patch', () => {
        const allowed = new Set(RESET_PATCH_KEYS.map(setterNameFor));
        for (const route of ROUTES) {
            const matches = route.block.match(/set[A-Z]\w*\(patch\.\w+\)/g) || [];
            for (const call of matches) {
                const setter = call.slice(0, call.indexOf('('));
                expect(
                    allowed.has(setter),
                    `Ruta ${route.name} (${route.file}): aplica ${call}, que NO está en RESET_PATCH_KEYS`
                ).toBe(true);
            }
        }
    });
});

/**
 * Arquitectura POS — v21: guardián del useEffect de re-sincronización de refs.
 *
 * CONTEXTO (asimetría A3, aceptada como estilo en v19):
 *   La rama `success` de `handleTicketAction` (useTicketActions.js) aplica
 *   buildResetPatch() y limpia explícitamente 1 ref (`savedTicketRef`), pero
 *   NO las otras 4 refs (`cartRef`, `accountNumRef`, `originalCapturerRef`,
 *   `ticketVersionRef`) porque no tiene acceso a ellas (viven en
 *   RetailVisionPOS.jsx y no se le pasan al hook).
 *
 *   Esas 4 refs se limpian de forma IMPLÍCITA: al cambiar el state, los 4
 *   useEffect de re-sincronización (RetailVisionPOS.jsx) copian el nuevo
 *   valor del state a la ref. Si alguien BORRA o COMENTA esos useEffect, la
 *   rama `success` deja de limpiar 4 refs EN SILENCIO (fuga de estado entre
 *   tickets). Este guardián cierra ese riesgo real.
 *
 * ALCANCE (best-effort): analiza el TEXTO del bloque de re-sincronización.
 * No ejecuta React. Es un detector de humo, igual que el guardián de v20.
 */
describe('Arquitectura POS — v21: guardián del useEffect de re-sincronización de refs', () => {
    const posSource = readSource(resolve(POS_ROOT, 'RetailVisionPOS.jsx'));

    /**
     * Extrae el bloque de los 4 useEffect de re-sincronización y le quita los
     * comentarios JS (para que `toContain` solo vea código vivo).
     * Ancla: desde `// --- Mantener refs sincronizadas con state` hasta el
     * siguiente bloque `// --- v7.0.2`.
     */
    function extractRefSyncBlock(source) {
        const start = source.indexOf('// --- Mantener refs sincronizadas con state');
        if (start === -1) return null;
        const end = source.indexOf('// --- v7.0.2', start);
        if (end === -1) return null;
        return stripJsComments(source.slice(start, end));
    }

    // Las 4 refs que la rama success NO limpia manualmente y que dependen del
    // useEffect. Cada una con su state fuente y su dependencia declarada.
    const REF_SYNC = [
        { ref: 'cartRef', state: 'cart' },
        { ref: 'accountNumRef', state: 'currentAccountNum' },
        { ref: 'originalCapturerRef', state: 'originalCapturer' },
        { ref: 'ticketVersionRef', state: 'ticketVersion' },
    ];

    const block = extractRefSyncBlock(posSource);

    // Test 1 (sanidad): el bloque se localiza y no es vacuo.
    it('1. sanidad: el bloque de re-sincronización se localiza y no es vacuo', () => {
        expect(block, 'No se encontró el bloque de useEffect de re-sincronización').not.toBeNull();
        expect(block.length, 'El bloque de re-sincronización es sospechosamente corto').toBeGreaterThan(100);
    });

    // Test 2 (existencia): los 4 useEffect existen con su cuerpo exacto.
    it('2. existencia: los 4 useEffect re-sincronizan su ref con su state', () => {
        for (const { ref, state } of REF_SYNC) {
            expect(
                block,
                `Falta el useEffect que re-sincroniza ${ref}.current = ${state}`
            ).toContain(`${ref}.current = ${state};`);
        }
    });

    // Test 3 (dependencias): cada useEffect declara la dependencia correcta.
    it('3. dependencias: cada useEffect declara [state] como dependencia', () => {
        for (const { ref, state } of REF_SYNC) {
            expect(
                block,
                `El useEffect de ${ref} no declara [${state}] como dependencia`
            ).toContain(`}, [${state}]);`);
        }
    });

    // Test 4 (anti-regresión): el bloque NO está comentado (falso verde de v20).
    it('4. anti-regresión: el bloque de re-sincronización no está comentado', () => {
        // stripJsComments() ya eliminó los comentarios; si el bloque estuviera
        // comentado, las sentencias NO aparecerían en el texto limpio.
        for (const { ref, state } of REF_SYNC) {
            expect(
                block,
                `El useEffect de ${ref} está comentado o eliminado (falso verde)`
            ).toContain(`${ref}.current = ${state};`);
        }
    });

    // Test 5 (cobertura): las 4 refs re-sincronizadas son exactamente las 4
    // que la rama success NO limpia manualmente.
    it('5. cobertura: las 4 refs re-sincronizadas son las 4 que success no limpia', () => {
        expect(REF_SYNC.length).toBe(4);
        // La rama success SÍ limpia savedTicketRef manualmente; las otras 4
        // dependen del useEffect. Si esta lista cambia, el guardián debe
        // revisarse (acoplamiento implícito documentado en REGLA 21).
        const refs = REF_SYNC.map(r => r.ref);
        expect(refs).toEqual(['cartRef', 'accountNumRef', 'originalCapturerRef', 'ticketVersionRef']);
        expect(refs).not.toContain('savedTicketRef');
    });
});
