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
