import React, { useState } from 'react';
import { resolveDisplayMode, DISPLAY_MODES } from '../utils/displayMappers';
import { DisplayConfigPanel } from '../components/DisplayConfigPanel';
import { DisplayPreciosOutput } from './DisplayPreciosOutput';
import { clearDisplayMenuCache } from '../services/heladeriaOfflineStore';

/**
 * DisplayPreciosUI — Doble landing del Display de Precios (V17, Fase 17.3).
 *
 * DOS MODOS (resueltos por `resolveDisplayMode`):
 *   - `?mode=output`  → DisplayPreciosOutput (kiosco, solo lectura, fullscreen).
 *   - sin parámetro   → Panel de administración (DisplayConfigPanel).
 *
 * El modo se resuelve UNA vez al montar (no reacciona a cambios de URL en
 * caliente: para cambiar de modo se recarga la página, que es el flujo real
 * del kiosco).
 *
 * NOTA (Incident 16.1): se ELIMINÓ la animación `float` infinita del
 * placeholder anterior. Este componente no define ningún @keyframes.
 */
export const DisplayPreciosUI = ({ onBack }) => {
    const [mode] = useState(() => resolveDisplayMode(window.location.search));
    const [cacheMsg, setCacheMsg] = useState(null);

    // ── Modo kiosco ──────────────────────────────────────────
    if (mode === DISPLAY_MODES.OUTPUT) {
        return <DisplayPreciosOutput onExit={onBack} />;
    }

    // ── Modo admin ───────────────────────────────────────────
    const openOutput = () => {
        // Abrimos la pantalla de precios en una pestaña/ventana nueva.
        const url = `${window.location.pathname}?mode=output`;
        window.open(url, '_blank', 'noopener');
    };

    const handleClearCache = async () => {
        try {
            await clearDisplayMenuCache();
            setCacheMsg('Caché del Display eliminado. Se recargará desde la red.');
        } catch {
            setCacheMsg('No se pudo limpiar el caché.');
        }
    };

    return (
        <div style={styles.wrapper}>
            {/* ── Encabezado ── */}
            <div style={styles.header}>
                <button
                    onClick={onBack}
                    style={styles.backBtn}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(56, 189, 248, 0.2)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(56, 189, 248, 0.1)'; }}
                >
                    ← Regresar
                </button>
                <h1 style={styles.title}>Display Pantalla de Precios</h1>
            </div>

            {/* ── Panel de configuración ── */}
            <div style={styles.scroll}>
                <DisplayConfigPanel onOpenOutput={openOutput} />

                {/* ── Utilidades de caché ── */}
                <section style={styles.cacheCard}>
                    <h3 style={styles.cacheTitle}>Caché offline</h3>
                    <p style={styles.cacheHint}>
                        La pantalla de precios guarda el menú en este dispositivo por 24 horas
                        para seguir funcionando sin internet. Usa este botón si cambiaste
                        precios y quieres forzar la actualización.
                    </p>
                    <button style={styles.cacheBtn} onClick={handleClearCache}>
                        🗑️ Limpiar caché del Display
                    </button>
                    {cacheMsg && <div style={styles.cacheMsg}>{cacheMsg}</div>}
                </section>
            </div>
        </div>
    );
};

// ─────────────────────────────────────────────────────────────
// Estilos
// ─────────────────────────────────────────────────────────────
const styles = {
    wrapper: {
        height: '100%',
        background: 'linear-gradient(135deg, #0a0a0a 0%, #08101a 50%, #0a0a0a 100%)',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: "'Inter', sans-serif",
    },
    header: {
        padding: '20px 30px',
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        borderBottom: '1px solid rgba(56, 189, 248, 0.15)',
    },
    backBtn: {
        background: 'rgba(56, 189, 248, 0.1)',
        border: '1px solid rgba(56, 189, 248, 0.2)',
        color: '#38bdf8',
        padding: '10px 20px',
        borderRadius: '12px',
        cursor: 'pointer',
        fontWeight: '700',
        fontSize: '13px',
        transition: 'background 0.2s ease',
    },
    title: {
        margin: 0,
        fontFamily: "'Playfair Display', serif",
        fontSize: '1.5rem',
        background: 'linear-gradient(135deg, #38bdf8, #0ea5e9)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
    },
    scroll: {
        flex: 1,
        overflowY: 'auto',
        paddingBottom: '32px',
    },
    cacheCard: {
        maxWidth: '900px',
        margin: '0 auto',
        width: '100%',
        boxSizing: 'border-box',
        padding: '18px 20px',
        background: 'rgba(15, 23, 42, 0.6)',
        border: '1px solid rgba(56, 189, 248, 0.15)',
        borderRadius: '16px',
    },
    cacheTitle: {
        margin: '0 0 10px 0',
        fontFamily: "'Playfair Display', serif",
        fontSize: '1.1rem',
        color: '#f9fafb',
    },
    cacheHint: {
        margin: '0 0 14px 0',
        color: '#9ca3af',
        fontSize: '12px',
        lineHeight: '1.6',
    },
    cacheBtn: {
        background: 'rgba(239, 68, 68, 0.1)',
        border: '1px solid rgba(239, 68, 68, 0.3)',
        color: '#fca5a5',
        padding: '10px 18px',
        borderRadius: '12px',
        cursor: 'pointer',
        fontWeight: '700',
        fontSize: '13px',
    },
    cacheMsg: {
        marginTop: '12px',
        color: '#7dd3fc',
        fontSize: '12px',
        fontWeight: '600',
    },
};
