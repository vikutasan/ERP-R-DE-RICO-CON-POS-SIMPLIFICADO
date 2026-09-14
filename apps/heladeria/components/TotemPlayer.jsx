import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    buildSequence,
    normalizeTotemManifest,
    totalDurationSec,
} from '../utils/totemSequencer';
import { totemContentService } from '../services/totemContentService';

/**
 * TotemPlayer — Reproductor del Display Tótem (V16, Fase 16.4).
 *
 * MODO KIOSCO: solo lectura, sin botones de navegación. Pensado para un monitor
 * vertical u horizontal en la heladería.
 *
 * OFFLINE-FIRST:
 *   1. Intenta leer el manifiesto de la red (GET /settings/).
 *   2. Si falla, usa el último manifiesto guardado en localStorage.
 *   3. Si no hay nada, muestra un estado vacío honesto.
 *
 * ANIMACIONES (Incident 16.1 — Efecto Estrobo):
 *   PROHIBIDO `animation: ... infinite`. Las transiciones entre tomas son
 *   FINITAS (fade/slide/zoom) y se aplican con `transition` de CSS, no con
 *   `@keyframes`. El avance de la secuencia lo gobierna un `setTimeout`.
 *
 * La lógica de secuenciación vive en `totemSequencer.js` (guardián del contrato).
 */
const MANIFEST_CACHE_KEY = 'heladeria_totem_manifest_cache';

export function TotemPlayer({ onExit }) {
    const [manifest, setManifest] = useState(() => normalizeTotemManifest(null));
    const [source, setSource] = useState('loading'); // 'network' | 'cache' | 'empty'
    const [index, setIndex] = useState(0);
    const [visible, setVisible] = useState(true);
    const mountedRef = useRef(true);
    const timerRef = useRef(null);

    // ── Carga del manifiesto (red → caché local) ─────────────
    useEffect(() => {
        mountedRef.current = true;
        (async () => {
            let raw = null;
            let src = 'empty';
            try {
                raw = await totemContentService.getManifest();
                if (raw) {
                    src = 'network';
                    try {
                        localStorage.setItem(MANIFEST_CACHE_KEY, JSON.stringify(raw));
                    } catch { /* almacenamiento lleno o bloqueado: ignorar */ }
                }
            } catch {
                // Fallback offline.
                try {
                    const cached = localStorage.getItem(MANIFEST_CACHE_KEY);
                    if (cached) {
                        raw = JSON.parse(cached);
                        src = 'cache';
                    }
                } catch { /* caché corrupto: ignorar */ }
            }
            if (!mountedRef.current) return;
            setManifest(normalizeTotemManifest(raw));
            setSource(src);
        })();
        return () => { mountedRef.current = false; };
    }, []);

    // ── Secuencia derivada ───────────────────────────────────
    const sequence = useMemo(
        () => buildSequence(manifest.macros, manifest.heroes, manifest.config),
        [manifest],
    );
    const totalSec = useMemo(() => totalDurationSec(sequence), [sequence]);

    // ── Motor de reproducción ────────────────────────────────
    useEffect(() => {
        if (sequence.length === 0) return undefined;
        const step = sequence[index % sequence.length];
        const durationMs = Math.max(1, Number(step?.durationSec) || 1) * 1000;
        const transitionMs = Math.max(0, Number(manifest.config.transitionMs) || 0);

        // 1) Ocultar (transición finita de salida).
        setVisible(false);
        const hideTimer = setTimeout(() => {
            if (!mountedRef.current) return;
            // 2) Avanzar y mostrar (transición finita de entrada).
            setIndex((prev) => (prev + 1) % sequence.length);
            setVisible(true);
        }, transitionMs);

        // 3) Programar el siguiente paso.
        timerRef.current = setTimeout(() => {
            if (!mountedRef.current) return;
            setIndex((prev) => (prev + 1) % sequence.length);
        }, durationMs);

        return () => {
            clearTimeout(hideTimer);
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [index, sequence, manifest.config.transitionMs]);

    // ── Estilos de transición (FINITOS, sin @keyframes) ──────
    const transitionMs = Math.max(0, Number(manifest.config.transitionMs) || 0);
    const isHorizontal = manifest.config.format === 'horizontal';
    const current = sequence.length > 0 ? sequence[index % sequence.length] : null;

    const transitionStyle = {
        transition: `opacity ${transitionMs}ms ease, transform ${transitionMs}ms ease`,
        opacity: visible ? 1 : 0,
        transform: visible
            ? 'translate(0, 0) scale(1)'
            : manifest.config.transition === 'slide'
                ? 'translateX(40px)'
                : manifest.config.transition === 'zoom'
                    ? 'scale(0.92)'
                    : 'translate(0, 0) scale(1)',
    };

    // ── Render ───────────────────────────────────────────────
    if (source === 'loading') {
        return (
            <div style={styles.stage}>
                <div style={styles.loading}>Cargando contenido del tótem…</div>
            </div>
        );
    }

    if (sequence.length === 0) {
        return (
            <div style={styles.stage}>
                <div style={styles.emptyBox}>
                    <div style={styles.emptyIcon}>📺</div>
                    <h2 style={styles.emptyTitle}>Tótem sin contenido</h2>
                    <p style={styles.emptyText}>
                        Sube imágenes macro y hero desde el gestor de contenido del tótem.
                    </p>
                    {onExit && (
                        <button type="button" style={styles.exitBtn} onClick={onExit}>
                            Salir
                        </button>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div style={styles.stage}>
            <div
                style={{
                    ...styles.frame,
                    flexDirection: isHorizontal ? 'row' : 'column',
                }}
            >
                <div style={{ ...styles.mediaWrap, ...transitionStyle }}>
                    <img
                        src={current.image.url}
                        alt={current.image.label || 'tótem'}
                        style={styles.media}
                    />
                </div>
                {current.image.label && (
                    <div
                        style={{
                            ...styles.caption,
                            borderColor: current.image.accentColor || manifest.config.accentColor,
                        }}
                    >
                        <span
                            style={{
                                ...styles.captionText,
                                color: current.image.accentColor || manifest.config.accentColor,
                            }}
                        >
                            {current.image.label}
                        </span>
                        <span style={styles.captionKind}>
                            {current.kind === 'hero' ? 'DESTACADO' : 'PRODUCTO'}
                        </span>
                    </div>
                )}
            </div>

            {/* Barra de progreso FINITA (sin animación infinita). */}
            <div style={styles.progressTrack}>
                <div
                    style={{
                        ...styles.progressFill,
                        width: `${((index + 1) / sequence.length) * 100}%`,
                        background: manifest.config.accentColor,
                    }}
                />
            </div>

            <div style={styles.footer}>
                <span style={styles.footerText}>
                    {index + 1} / {sequence.length} · {totalSec}s · {source === 'cache' ? 'offline' : 'en línea'}
                </span>
                {onExit && (
                    <button type="button" style={styles.exitBtnSmall} onClick={onExit}>
                        Salir
                    </button>
                )}
            </div>
        </div>
    );
}

const styles = {
    stage: {
        height: '100%',
        width: '100%',
        background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1008 50%, #0a0a0a 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: "'Inter', sans-serif",
        overflow: 'hidden',
        position: 'relative',
    },
    loading: {
        color: '#94a3b8',
        fontSize: '18px',
    },
    emptyBox: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '16px',
        textAlign: 'center',
        padding: '32px',
    },
    emptyIcon: {
        fontSize: '72px',
    },
    emptyTitle: {
        margin: 0,
        fontFamily: "'Playfair Display', serif",
        fontSize: '2rem',
        color: '#f9fafb',
    },
    emptyText: {
        margin: 0,
        color: '#9ca3af',
        maxWidth: '420px',
        lineHeight: 1.6,
    },
    frame: {
        flex: 1,
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '24px',
        padding: '32px',
        boxSizing: 'border-box',
    },
    mediaWrap: {
        maxWidth: '90%',
        maxHeight: '80%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        willChange: 'opacity, transform',
    },
    media: {
        maxWidth: '100%',
        maxHeight: '70vh',
        objectFit: 'contain',
        borderRadius: '16px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
    },
    caption: {
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        padding: '16px 24px',
        borderLeft: '4px solid #fbbf24',
        background: 'rgba(0,0,0,0.35)',
        borderRadius: '12px',
    },
    captionText: {
        fontFamily: "'Playfair Display', serif",
        fontSize: '1.6rem',
        fontWeight: 700,
    },
    captionKind: {
        fontSize: '11px',
        letterSpacing: '2px',
        color: '#9ca3af',
        textTransform: 'uppercase',
    },
    progressTrack: {
        width: '80%',
        height: '4px',
        background: 'rgba(255,255,255,0.1)',
        borderRadius: '2px',
        overflow: 'hidden',
        marginBottom: '12px',
    },
    progressFill: {
        height: '100%',
        transition: 'width 400ms ease',
    },
    footer: {
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        paddingBottom: '16px',
    },
    footerText: {
        color: '#64748b',
        fontSize: '12px',
        letterSpacing: '1px',
    },
    exitBtn: {
        padding: '10px 20px',
        borderRadius: '10px',
        border: '1px solid rgba(251,191,36,0.3)',
        background: 'rgba(251,191,36,0.1)',
        color: '#fbbf24',
        cursor: 'pointer',
        fontWeight: 700,
    },
    exitBtnSmall: {
        padding: '6px 12px',
        borderRadius: '8px',
        border: '1px solid rgba(251,191,36,0.2)',
        background: 'transparent',
        color: '#fbbf24',
        cursor: 'pointer',
        fontSize: '12px',
    },
};

export default TotemPlayer;
