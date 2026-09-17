import React, { useState } from 'react';
import { resolveDisplayMode, DISPLAY_MODES, resolveScreenFromQuery } from '../utils/displayMappers';
import { DisplayPreciosSuiteUI } from './DisplayPreciosSuiteUI';
import { DisplayPreciosConfigUI } from './DisplayPreciosConfigUI';
import { DisplayPreciosSelectorUI } from './DisplayPreciosSelectorUI';
import { DisplayPreciosOutput } from './DisplayPreciosOutput';

/**
 * DisplayPreciosUI — Enrutador de la sub-suite Display de Precios (V8).
 *
 * Reemplaza la antigua doble-landing por una navegación de 3 niveles:
 *   - `?mode=output&screen=<id>` → Kiosco (solo lectura, fullscreen).
 *   - (sin parámetro)            → Landing de la sub-suite (2 herramientas).
 *   - tool = 'config'            → Configurador (diseño + vista previa).
 *   - tool = 'selector'          → Selector de proyección.
 *
 * COMPATIBILIDAD: `?mode=output` sin `screen` sigue funcionando y proyecta
 * la pantalla por defecto (`screen_1`), igual que antes de la V8.
 *
 * NOTA (Incident 16.1): sin animaciones infinitas.
 *
 * @param {function} props.onBack
 */
export const DisplayPreciosUI = ({ onBack }) => {
    const [mode] = useState(() => resolveDisplayMode(window.location.search));
    const [tool, setTool] = useState(null); // null | 'config' | 'selector'

    // ── Modo kiosco (deep-link directo) ──────────────────────
    if (mode === DISPLAY_MODES.OUTPUT) {
        const screenId = resolveScreenFromQuery(window.location.search);
        return <DisplayPreciosOutput onExit={onBack} screenId={screenId} />;
    }

    // ── Herramienta: Configurador ────────────────────────────
    if (tool === 'config') {
        return <DisplayPreciosConfigUI onBack={() => setTool(null)} />;
    }

    // ── Herramienta: Selector ────────────────────────────────
    if (tool === 'selector') {
        return <DisplayPreciosSelectorUI onBack={() => setTool(null)} />;
    }

    // ── Landing de la sub-suite ──────────────────────────────
    return (
        <DisplayPreciosSuiteUI
            onBack={onBack}
            onSelectTool={(id) => setTool(id)}
        />
    );
};
