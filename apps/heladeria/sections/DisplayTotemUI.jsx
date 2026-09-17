import React, { useEffect, useState } from 'react';
import { TotemContentManager } from '../components/TotemContentManager';
import { TotemPlayer } from '../components/TotemPlayer';
import { DisplayTotemSuiteUI } from './DisplayTotemSuiteUI';
import { TotemProjectionSelectorUI } from './TotemProjectionSelectorUI';

/**
 * DisplayTotemUI — Enrutador de la sub-suite Display Tótem (V16, Fase 16.4).
 *
 * NAVEGACIÓN DE 3 NIVELES (mismo patrón que el Display de Precios V8):
 *   - `?mode=output`   → TotemPlayer (kiosco, solo lectura, fullscreen).
 *   - `?mode=selector` → TotemProjectionSelectorUI (abrir en varios monitores).
 *   - (sin parámetro)  → Landing de la sub-suite (2 herramientas).
 *   - tool = 'config'  → TotemContentManager (configurador de contenido).
 *   - tool = 'selector'→ TotemProjectionSelectorUI.
 *
 * COMPATIBILIDAD: `?mode=output` sin `totem` sigue funcionando y proyecta el
 * único manifiesto del tótem, igual que antes de la suite.
 *
 * ANIMACIONES (Incident 16.1 — Efecto Estrobo):
 *   Se ELIMINÓ el `@keyframes float` del placeholder anterior. Esta sección no
 *   define ninguna animación CSS infinita.
 *
 * @param {function} props.onBack
 */
export const DisplayTotemUI = ({ onBack }) => {
    const [mode, setMode] = useState(() => resolveMode());
    const [tool, setTool] = useState(null); // null | 'config' | 'selector'

    // Reacciona a cambios de URL (p.ej. si el admin abre la salida en otra pestaña).
    useEffect(() => {
        const onPop = () => setMode(resolveMode());
        window.addEventListener('popstate', onPop);
        return () => window.removeEventListener('popstate', onPop);
    }, []);

    const exitOutput = () => {
        const url = new URL(window.location.href);
        url.searchParams.delete('mode');
        window.history.replaceState({}, '', url.toString());
        setMode('manager');
    };

    // ── Modo kiosco (deep-link directo) ──────────────────────
    if (mode === 'output') {
        return <TotemPlayer onExit={exitOutput} />;
    }

    // ── Herramienta: Selector de proyección ──────────────────
    if (mode === 'selector' || tool === 'selector') {
        return <TotemProjectionSelectorUI onBack={() => { setTool(null); setMode('manager'); }} />;
    }

    // ── Herramienta: Configurador de contenido ───────────────
    if (tool === 'config') {
        return (
            <TotemContentManager
                onBack={() => setTool(null)}
                onOpenSelector={() => setTool('selector')}
            />
        );
    }

    // ── Landing de la sub-suite ──────────────────────────────
    return (
        <DisplayTotemSuiteUI
            onBack={onBack}
            onSelectTool={(id) => setTool(id)}
        />
    );
};

/** Determina el modo a partir del query string (`?mode=output|selector`). */
function resolveMode() {
    try {
        const params = new URLSearchParams(window.location.search);
        const value = params.get('mode');
        if (value === 'output') return 'output';
        if (value === 'selector') return 'selector';
        return 'manager';
    } catch {
        return 'manager';
    }
}

export default DisplayTotemUI;
