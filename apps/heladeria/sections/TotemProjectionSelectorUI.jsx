import React, { useEffect, useRef, useState } from 'react';
import { totemContentService } from '../services/totemContentService';
import {
    buildSequence,
    normalizeTotemManifest,
    totalDurationSec,
} from '../utils/totemSequencer';

/**
 * TotemProjectionSelectorUI — Sala de control de proyección del Tótem (V16).
 *
 * El Tótem tiene UN solo manifiesto, pero puede necesitarse en VARIOS monitores
 * a la vez (entrada, barra, terraza). Este selector abre N ventanas
 * independientes del mismo contenido, cada una a pantalla completa.
 *
 * Cada tarjeta abre una ventana con:
 *   `?module=heladeria&mode=output&totem=<slot>`
 *
 * El parámetro `totem` es solo una etiqueta de slot: el reproductor ignora su
 * valor y siempre lee el manifiesto único. Sirve para que el operador sepa qué
 * ventana corresponde a qué monitor.
 *
 * REGLAS:
 *   - CERO animaciones infinitas (Incident 16.1).
 *   - CERO construcción manual de URLs: se usa `buildTotemProjectionUrl`.
 *   - No abre nada si el manifiesto no tiene contenido (evita proyectar vacío).
 *
 * @param {function} props.onBack
 */
export const TotemProjectionSelectorUI = ({ onBack }) => {
    const [manifest, setManifest] = useState(() => normalizeTotemManifest(null));
    const [status, setStatus] = useState('loading');
    const [slots, setSlots] = useState(1);
    const mountedRef = useRef(true);

    useEffect(() => {
        mountedRef.current = true;
        const load = async () => {
            try {
                const raw = await totemContentService.getManifest();
                if (!mountedRef.current) return;
                setManifest(normalizeTotemManifest(raw));
                setStatus('ready');
            } catch {
                if (!mountedRef.current) return;
                setManifest(normalizeTotemManifest(null));
                setStatus('error');
            }
        };
        load();
        return () => { mountedRef.current = false; };
    }, []);

    const sequence = buildSequence(manifest.macros, manifest.heroes, manifest.config);
    const totalSec = totalDurationSec(sequence);
    const hasContent = sequence.length > 0;

    const openSlot = (slotIndex) => {
        const url = buildTotemProjectionUrl(window.location.pathname, slotIndex);
        window.open(url, '_blank', 'noopener');
    };

    const openAll = () => {
        for (let i = 0; i < slots; i += 1) openSlot(i);
    };

    if (status === 'loading') {
        return (
            <div style={styles.center}>
                <span style={styles.centerText}>Cargando contenido del tótem…</span>
            </div>
        );
    }

    return (
        <div style={styles.wrapper}>
            {/* ── Encabezado ── */}
            <div style={styles.header}>
                <button onClick={onBack} style={styles.backBtn}>← Regresar</button>
                <div style={styles.headerText}>
                    <h1 style={styles.title}>Selector de proyección</h1>
                    <p style={styles.subtitle}>
                        Abre el tótem en varios monitores a la vez
                    </p>
                </div>
            </div>

            {/* ── Resumen del contenido ── */}
            <div style={styles.summary}>
                <span style={styles.summaryItem}>
                    <strong>{sequence.length}</strong> pasos
                </span>
                <span style={styles.summaryItem}>
                    <strong>{totalSec}s</strong> de ciclo
                </span>
                <span style={styles.summaryItem}>
                    Formato <strong>{manifest.config.format === 'horizontal' ? 'Horizontal' : 'Vertical'}</strong>
                </span>
                <span
                    style={{
                        ...styles.statusDot,
                        background: hasContent ? '#16a34a' : '#d4d4d4',
                    }}
                />
                <span style={styles.summaryItem}>
                    {hasContent ? 'Listo para proyectar' : 'Sin contenido'}
                </span>
            </div>

            {!hasContent && (
                <p style={styles.warning}>
                    El tótem no tiene imágenes. Sube tomas macro o hero desde el gestor
                    de contenido antes de proyectar.
                </p>
            )}

            {/* ── Control de número de monitores ── */}
            <div style={styles.slotControl}>
                <span style={styles.slotLabel}>Monitores a abrir</span>
                <div style={styles.stepperRow}>
                    <button
                        type="button"
                        style={styles.stepperBtn}
                        onClick={() => setSlots((n) => Math.max(MIN_SLOTS, n - 1))}
                        disabled={slots <= MIN_SLOTS}
                    >
                        −
                    </button>
                    <span style={styles.stepperValue}>{slots}</span>
                    <button
                        type="button"
                        style={styles.stepperBtn}
                        onClick={() => setSlots((n) => Math.min(MAX_SLOTS, n + 1))}
                        disabled={slots >= MAX_SLOTS}
                    >
                        +
                    </button>
                </div>
                <button
                    type="button"
                    style={{
                        ...styles.openAllBtn,
                        opacity: hasContent ? 1 : 0.4,
                        cursor: hasContent ? 'pointer' : 'not-allowed',
                    }}
                    onClick={openAll}
                    disabled={!hasContent}
                >
                    📺 Abrir {slots} {slots === 1 ? 'monitor' : 'monitores'}
                </button>
            </div>

            {/* ── Tarjetas de slot ── */}
            <div style={styles.scroll}>
                <div style={styles.grid}>
                    {Array.from({ length: slots }, (_, i) => (
                        <div key={i} style={styles.card}>
                            <div style={styles.cardTop}>
                                <span style={styles.cardName}>Monitor {i + 1}</span>
                                <span
                                    style={{
                                        ...styles.statusDot,
                                        background: hasContent ? '#16a34a' : '#d4d4d4',
                                    }}
                                />
                            </div>
                            <span style={styles.cardMeta}>
                                {manifest.config.format === 'horizontal' ? '16:9' : '9:16'}
                                {' · '}
                                {sequence.length} pasos
                                {' · '}
                                {totalSec}s
                            </span>
                            <button
                                type="button"
                                onClick={() => openSlot(i)}
                                disabled={!hasContent}
                                style={{
                                    ...styles.openBtn,
                                    opacity: hasContent ? 1 : 0.4,
                                    cursor: hasContent ? 'pointer' : 'not-allowed',
                                }}
                            >
                                📺 Proyectar en pantalla completa
                            </button>
                        </div>
                    ))}
                </div>

                <p style={styles.hint}>
                    Consejo: abre cada monitor en la pantalla que corresponda y pulsa
                    F11 para pantalla completa. Todas las ventanas reproducen el mismo
                    contenido del tótem.
                </p>
            </div>
        </div>
    );
};

const MIN_SLOTS = 1;
const MAX_SLOTS = 6;

/**
 * Construye la URL de proyección del tótem. Contiene SIEMPRE los tres
 * parámetros (`module`, `mode`, `totem`); si falta `module=heladeria`, el
 * kiosco monta el Dashboard en vez del Display (Incident 16.6/16.8).
 *
 * @param {string} pathname - `window.location.pathname`.
 * @param {number} slotIndex - Índice del monitor (0-based).
 * @returns {string}
 */
export function buildTotemProjectionUrl(pathname, slotIndex = 0) {
    const base = typeof pathname === 'string' && pathname.length > 0 ? pathname : '/';
    const slot = Number.isInteger(slotIndex) && slotIndex >= 0 ? slotIndex : 0;
    return `${base}?module=heladeria&mode=output&totem=${slot}`;
}

// ─────────────────────────────────────────────────────────────
// Estilos — B&W editorial
// ─────────────────────────────────────────────────────────────
const styles = {
    wrapper: {
        minHeight: '100vh',
        background: '#ffffff',
        color: '#0f0f0f',
        fontFamily: "'Inter', sans-serif",
        display: 'flex',
        flexDirection: 'column',
    },
    center: {
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#ffffff',
    },
    centerText: {
        fontSize: '13px',
        fontWeight: '700',
        letterSpacing: '1px',
        color: '#6b6b6b',
    },
    header: {
        display: 'flex',
        alignItems: 'flex-start',
        gap: '20px',
        padding: '24px 28px',
        borderBottom: '1px solid #0f0f0f',
    },
    backBtn: {
        padding: '8px 14px',
        border: '1px solid #0f0f0f',
        background: '#ffffff',
        color: '#0f0f0f',
        fontSize: '11px',
        fontWeight: '900',
        letterSpacing: '1px',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
    },
    headerText: {
        flex: 1,
    },
    title: {
        margin: 0,
        fontSize: '22px',
        fontWeight: '900',
        letterSpacing: '-0.5px',
    },
    subtitle: {
        margin: '4px 0 0',
        fontSize: '12px',
        fontWeight: '600',
        color: '#6b6b6b',
    },
    summary: {
        display: 'flex',
        alignItems: 'center',
        gap: '18px',
        padding: '14px 28px',
        borderBottom: '1px solid #e5e5e5',
        flexWrap: 'wrap',
    },
    summaryItem: {
        fontSize: '11px',
        fontWeight: '700',
        letterSpacing: '0.5px',
        color: '#6b6b6b',
    },
    statusDot: {
        width: '8px',
        height: '8px',
        borderRadius: '50%',
        display: 'inline-block',
    },
    warning: {
        margin: 0,
        padding: '12px 28px',
        fontSize: '12px',
        fontWeight: '700',
        color: '#0f0f0f',
        background: '#f5f5f5',
        borderBottom: '1px solid #e5e5e5',
    },
    slotControl: {
        display: 'flex',
        alignItems: 'center',
        gap: '18px',
        padding: '18px 28px',
        borderBottom: '1px solid #e5e5e5',
        flexWrap: 'wrap',
    },
    slotLabel: {
        fontSize: '11px',
        fontWeight: '900',
        letterSpacing: '1px',
        textTransform: 'uppercase',
    },
    stepperRow: {
        display: 'flex',
        alignItems: 'center',
        border: '1px solid #0f0f0f',
    },
    stepperBtn: {
        width: '34px',
        height: '34px',
        border: 'none',
        background: '#ffffff',
        color: '#0f0f0f',
        fontSize: '16px',
        fontWeight: '900',
        cursor: 'pointer',
    },
    stepperValue: {
        minWidth: '40px',
        textAlign: 'center',
        fontSize: '14px',
        fontWeight: '900',
        borderLeft: '1px solid #0f0f0f',
        borderRight: '1px solid #0f0f0f',
        lineHeight: '34px',
    },
    openAllBtn: {
        padding: '10px 18px',
        border: '1px solid #0f0f0f',
        background: '#0f0f0f',
        color: '#ffffff',
        fontSize: '11px',
        fontWeight: '900',
        letterSpacing: '1px',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
    },
    scroll: {
        flex: 1,
        overflowY: 'auto',
        padding: '24px 28px 40px',
    },
    grid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
        gap: '16px',
    },
    card: {
        border: '1px solid #0f0f0f',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        background: '#ffffff',
    },
    cardTop: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    cardName: {
        fontSize: '14px',
        fontWeight: '900',
        letterSpacing: '-0.3px',
    },
    cardMeta: {
        fontSize: '10px',
        fontWeight: '700',
        letterSpacing: '0.5px',
        color: '#6b6b6b',
    },
    openBtn: {
        marginTop: '4px',
        padding: '10px 14px',
        border: '1px solid #0f0f0f',
        background: '#ffffff',
        color: '#0f0f0f',
        fontSize: '11px',
        fontWeight: '900',
        letterSpacing: '0.5px',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
    },
    hint: {
        margin: '24px 0 0',
        fontSize: '11px',
        fontWeight: '600',
        lineHeight: 1.6,
        color: '#6b6b6b',
        maxWidth: '620px',
    },
};

export default TotemProjectionSelectorUI;
