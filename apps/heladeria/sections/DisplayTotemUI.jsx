import React, { useEffect, useState } from 'react';
import { TotemContentManager } from '../components/TotemContentManager';
import { TotemPlayer } from '../components/TotemPlayer';

/**
 * DisplayTotemUI — Sección del Display Tótem Sugestivo (V16, Fase 16.4).
 *
 * DOBLE LANDING (mismo patrón que el Display de Precios V17):
 *   - `?mode=output`  → TotemPlayer (modo kiosco, solo lectura).
 *   - sin parámetro   → TotemContentManager (gestor de contenido para el admin).
 *
 * ANIMACIONES (Incident 16.1 — Efecto Estrobo):
 *   Se ELIMINÓ el `@keyframes float` del placeholder anterior. Esta sección no
 *   define ninguna animación CSS infinita.
 */
export const DisplayTotemUI = ({ onBack }) => {
    const [mode, setMode] = useState(() => resolveMode());

    // Reacciona a cambios de URL (p.ej. si el admin abre la salida en otra pestaña).
    useEffect(() => {
        const onPop = () => setMode(resolveMode());
        window.addEventListener('popstate', onPop);
        return () => window.removeEventListener('popstate', onPop);
    }, []);

    const openOutput = () => {
        const url = new URL(window.location.href);
        url.searchParams.set('mode', 'output');
        window.open(url.toString(), '_blank', 'noopener');
    };

    const exitOutput = () => {
        const url = new URL(window.location.href);
        url.searchParams.delete('mode');
        window.history.replaceState({}, '', url.toString());
        setMode('manager');
    };

    if (mode === 'output') {
        return <TotemPlayer onExit={exitOutput} />;
    }

    return (
        <div style={styles.wrapper}>
            <div style={styles.header}>
                <button
                    type="button"
                    onClick={onBack}
                    style={styles.backBtn}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(251, 191, 36, 0.2)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(251, 191, 36, 0.1)'; }}
                >
                    ← Regresar
                </button>
                <h1 style={styles.title}>Display Tótem Sugestivo</h1>
            </div>
            <div style={styles.scroll}>
                <TotemContentManager onOpenOutput={openOutput} />
            </div>
        </div>
    );
};

/** Determina el modo a partir del query string (`?mode=output`). */
function resolveMode() {
    try {
        const params = new URLSearchParams(window.location.search);
        return params.get('mode') === 'output' ? 'output' : 'manager';
    } catch {
        return 'manager';
    }
}

const styles = {
    wrapper: {
        height: '100%',
        background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1008 50%, #0a0a0a 100%)',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: "'Inter', sans-serif",
    },
    header: {
        padding: '20px 30px',
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        borderBottom: '1px solid rgba(251, 191, 36, 0.15)',
    },
    backBtn: {
        background: 'rgba(251, 191, 36, 0.1)',
        border: '1px solid rgba(251, 191, 36, 0.2)',
        color: '#fbbf24',
        padding: '10px 20px',
        borderRadius: '12px',
        cursor: 'pointer',
        fontWeight: 700,
        fontSize: '13px',
        transition: 'background 0.3s ease',
    },
    title: {
        margin: 0,
        fontFamily: "'Playfair Display', serif",
        fontSize: '1.5rem',
        background: 'linear-gradient(135deg, #fbbf24, #f59e0b)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
    },
    scroll: {
        flex: 1,
        overflowY: 'auto',
    },
};

export default DisplayTotemUI;
