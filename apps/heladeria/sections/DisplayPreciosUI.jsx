import React, { useState } from 'react';
import { resolveDisplayMode, DISPLAY_MODES } from '../utils/displayMappers';
import { DisplayConfigPanel } from '../components/DisplayConfigPanel';
import { DisplayPreciosOutput } from './DisplayPreciosOutput';
import { clearDisplayMenuCache } from '../services/heladeriaOfflineStore';

/**
 * DisplayPreciosUI — Doble landing del Display de Precios (V17, Fase 17.3).
 * Estética editorial B&W: fondo blanco, divisores lineales.
 *
 * DOS MODOS (resueltos por `resolveDisplayMode`):
 *   - `?mode=output`  → DisplayPreciosOutput (kiosco, solo lectura, fullscreen).
 *   - sin parámetro   → Panel de administración (DisplayConfigPanel).
 *
 * NOTA (Incident 16.1): sin animaciones infinitas.
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
                <button onClick={onBack} style={styles.backBtn}>
                    ← Regresar
                </button>
                <h1 style={styles.title}>Display de Precios</h1>
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
// Estilos — B&W editorial
// ─────────────────────────────────────────────────────────────
const styles = {
    wrapper: {
        height: '100%',
        background: '#ffffff',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: "'Inter', sans-serif",
    },
    header: {
        padding: '0 30px',
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        borderBottom: '1px solid #0f0f0f',
        minHeight: '56px',
    },
    backBtn: {
        background: 'none',
        border: '1px solid #d1d5db',
        color: '#6b7280',
        padding: '6px 16px',
        borderRadius: '100px',
        cursor: 'pointer',
        fontWeight: '700',
        fontSize: '12px',
        letterSpacing: '0.5px',
    },
    title: {
        margin: 0,
        fontSize: '13px',
        fontWeight: '900',
        color: '#0f0f0f',
        textTransform: 'uppercase',
        letterSpacing: '3px',
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
        padding: '20px 24px',
        background: '#f9fafb',
        border: '1px solid #e5e7eb',
        borderRadius: '8px',
        marginTop: '16px',
    },
    cacheTitle: {
        margin: '0 0 10px 0',
        fontSize: '14px',
        fontWeight: '800',
        color: '#0f0f0f',
        textTransform: 'uppercase',
        letterSpacing: '1px',
    },
    cacheHint: {
        margin: '0 0 14px 0',
        color: '#6b7280',
        fontSize: '13px',
        lineHeight: '1.6',
        fontWeight: '400',
    },
    cacheBtn: {
        background: '#ffffff',
        border: '1px solid #0f0f0f',
        color: '#0f0f0f',
        padding: '10px 18px',
        borderRadius: '100px',
        cursor: 'pointer',
        fontWeight: '800',
        fontSize: '12px',
        textTransform: 'uppercase',
        letterSpacing: '1px',
    },
    cacheMsg: {
        marginTop: '12px',
        color: '#374151',
        fontSize: '12px',
        fontWeight: '600',
    },
};
