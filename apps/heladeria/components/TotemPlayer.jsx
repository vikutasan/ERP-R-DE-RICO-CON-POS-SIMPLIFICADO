import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    buildSequence,
    normalizeTotemManifest,
    totalDurationSec,
} from '../utils/totemSequencer';
import { totemContentService } from '../services/totemContentService';
import { TotemStage, TotemEmptyState } from './TotemStage';

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
            <TotemEmptyState>
                {onExit && (
                    <button type="button" style={styles.exitBtn} onClick={onExit}>
                        Salir
                    </button>
                )}
            </TotemEmptyState>
        );
    }

    const current = sequence[index % sequence.length];

    return (
        <div style={styles.stage}>
            <TotemStage
                step={current}
                config={manifest.config}
                visible={visible}
                index={index}
                total={sequence.length}
                totalSec={totalSec}
                source={source}
                style={styles.stageFill}
            />

            {onExit && (
                <div style={styles.exitBar}>
                    <button type="button" style={styles.exitBtnSmall} onClick={onExit}>
                        Salir
                    </button>
                </div>
            )}
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
    stageFill: {
        position: 'absolute',
        inset: 0,
    },
    loading: {
        color: '#94a3b8',
        fontSize: '18px',
    },
    exitBar: {
        position: 'absolute',
        top: '16px',
        right: '16px',
        zIndex: 2,
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
