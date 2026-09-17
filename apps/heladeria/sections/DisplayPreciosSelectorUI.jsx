import React, { useEffect, useRef, useState } from 'react';
import {
    buildScreenProjectionUrl,
    normalizeDisplayScreens,
    MAX_SCREENS,
} from '../utils/displayMappers';
import { loadDisplayScreens } from '../services/displayConfigService';

/**
 * DisplayPreciosSelectorUI — Sala de control de proyección (V8).
 *
 * Permite abrir CADA pantalla nombrada en su propio monitor/tablet.
 * Resuelve el problema original: proyectar "Menú Completo" en la caja y
 * "Solo Helados" en la barra SIMULTÁNEAMENTE.
 *
 * Cada tarjeta abre una ventana con:
 *   `?module=heladeria&mode=output&screen=<id>`
 *
 * REGLAS:
 *   - CERO animaciones infinitas (Incident 16.1).
 *   - No abre pantallas deshabilitadas (evita proyectar algo vacío).
 *
 * @param {function} props.onBack
 */
export const DisplayPreciosSelectorUI = ({ onBack }) => {
    const [doc, setDoc] = useState(null);
    const [status, setStatus] = useState('loading');
    const mountedRef = useRef(true);

    useEffect(() => {
        mountedRef.current = true;
        const load = async () => {
            try {
                const screensDoc = await loadDisplayScreens();
                if (!mountedRef.current) return;
                // Defensivo: nunca asumir que `screens` existe (Incident 16.8).
                setDoc(Array.isArray(screensDoc?.screens)
                    ? screensDoc
                    : normalizeDisplayScreens(screensDoc));
                setStatus('ready');
            } catch {
                if (!mountedRef.current) return;
                setDoc(normalizeDisplayScreens(null));
                setStatus('error');
            }
        };
        load();
        return () => { mountedRef.current = false; };
    }, []);

    const openScreen = (screenId) => {
        const url = buildScreenProjectionUrl(window.location.pathname, screenId);
        window.open(url, '_blank', 'noopener');
    };

    if (status === 'loading' || !doc) {
        return (
            <div style={styles.center}>
                <span style={styles.centerText}>Cargando pantallas…</span>
            </div>
        );
    }

    const screens = (Array.isArray(doc?.screens) ? doc.screens : []).slice(0, MAX_SCREENS);

    return (
        <div style={styles.wrapper}>
            {/* ── Encabezado ── */}
            <div style={styles.header}>
                <button onClick={onBack} style={styles.backBtn}>← Regresar</button>
                <div style={styles.headerText}>
                    <h1 style={styles.title}>Selector de proyección</h1>
                    <p style={styles.subtitle}>
                        Abre cada pantalla en su propio monitor o tablet
                    </p>
                </div>
            </div>

            {/* ── Tarjetas de pantalla ── */}
            <div style={styles.scroll}>
                <div style={styles.grid}>
                    {screens.map((s) => (
                        <div
                            key={s.id}
                            style={{
                                ...styles.card,
                                opacity: s.enabled ? 1 : 0.5,
                            }}
                        >
                            <div style={styles.cardTop}>
                                <span style={styles.cardName}>{s.name}</span>
                                <span
                                    style={{
                                        ...styles.statusDot,
                                        background: s.enabled ? '#16a34a' : '#d4d4d4',
                                    }}
                                />
                            </div>
                            <span style={styles.cardMeta}>
                                {s.enabled ? 'Habilitada' : 'Deshabilitada'}
                                {' · '}
                                {s.config?.columns || 3} columnas
                                {' · '}
                                {s.config?.theme === 'DARK' ? 'Oscuro' : 'Claro'}
                            </span>
                            <button
                                onClick={() => openScreen(s.id)}
                                disabled={!s.enabled}
                                style={{
                                    ...styles.openBtn,
                                    opacity: s.enabled ? 1 : 0.4,
                                    cursor: s.enabled ? 'pointer' : 'not-allowed',
                                }}
                            >
                                📺 Proyectar en pantalla completa
                            </button>
                        </div>
                    ))}
                </div>

                <p style={styles.hint}>
                    Consejo: abre cada pantalla en el monitor que corresponda y pulsa
                    F11 para pantalla completa. Las pantallas deshabilitadas no se
                    pueden proyectar.
                </p>
            </div>
        </div>
    );
};

// ─────────────────────────────────────────────────────────────
// Estilos — B&W editorial
// ─────────────────────────────────────────────────────────────
const styles = {
    wrapper: {
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: '#ffffff',
        fontFamily: "'Inter', sans-serif",
    },
    center: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        background: '#ffffff',
    },
    centerText: {
        fontSize: '14px',
        fontWeight: '700',
        color: '#6b6b6b',
    },
    header: {
        display: 'flex',
        alignItems: 'center',
        gap: '20px',
        padding: '20px 32px',
        borderBottom: '1px solid #0f0f0f',
    },
    backBtn: {
        background: 'transparent',
        border: '1px solid #0f0f0f',
        color: '#0f0f0f',
        padding: '8px 16px',
        fontSize: '12px',
        fontWeight: '700',
        cursor: 'pointer',
    },
    headerText: {
        display: 'flex',
        flexDirection: 'column',
        gap: '2px',
    },
    title: {
        margin: 0,
        fontSize: '20px',
        fontWeight: '900',
        letterSpacing: '-0.3px',
        color: '#0f0f0f',
    },
    subtitle: {
        margin: 0,
        fontSize: '12px',
        fontWeight: '600',
        color: '#6b6b6b',
    },
    scroll: {
        flex: 1,
        overflowY: 'auto',
        padding: '32px',
    },
    grid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
        gap: '20px',
        maxWidth: '1000px',
    },
    card: {
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        padding: '24px',
        border: '1px solid #0f0f0f',
        background: '#ffffff',
    },
    cardTop: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '10px',
    },
    cardName: {
        fontSize: '16px',
        fontWeight: '900',
        color: '#0f0f0f',
    },
    statusDot: {
        width: '10px',
        height: '10px',
        borderRadius: '50%',
        flexShrink: 0,
    },
    cardMeta: {
        fontSize: '11px',
        fontWeight: '700',
        letterSpacing: '0.3px',
        color: '#6b6b6b',
    },
    openBtn: {
        marginTop: '4px',
        background: '#0f0f0f',
        color: '#ffffff',
        border: '1px solid #0f0f0f',
        padding: '12px 16px',
        fontSize: '12px',
        fontWeight: '800',
        letterSpacing: '0.5px',
    },
    hint: {
        marginTop: '24px',
        maxWidth: '640px',
        fontSize: '12px',
        lineHeight: 1.6,
        color: '#6b6b6b',
    },
};
