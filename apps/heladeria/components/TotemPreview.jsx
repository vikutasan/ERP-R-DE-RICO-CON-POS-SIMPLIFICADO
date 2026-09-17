import React, { useEffect, useMemo, useState } from 'react';
import { TotemStage, TotemEmptyState } from './TotemStage';
import { buildSequence, totalDurationSec } from '../utils/totemSequencer';

/**
 * TotemPreview — Vista previa EN VIVO del Display Tótem (V16).
 *
 * Envuelve a `TotemStage` en un marco con la proporción real del monitor
 * (vertical 9:16 u horizontal 16:9, según `config.format`) y reproduce la
 * secuencia en bucle para que el admin vea el resultado EXACTO sin abrir
 * una pestaña nueva.
 *
 * REGLAS:
 *   - CERO red. Recibe `manifest` ya normalizado por el padre.
 *   - CERO animaciones infinitas (Incident 16.1). El avance lo gobierna un
 *     `setTimeout` finito, igual que en `TotemPlayer`.
 *   - Si no hay contenido, muestra el mismo estado vacío que el reproductor.
 *
 * @param {object} props.manifest  Manifiesto normalizado del tótem.
 * @param {number} [props.scale=1] Escala interna del escenario.
 */
export function TotemPreview({ manifest, scale = 1 }) {
    const [index, setIndex] = useState(0);
    const [visible, setVisible] = useState(true);

    const sequence = useMemo(
        () => buildSequence(manifest.macros, manifest.heroes, manifest.config),
        [manifest],
    );
    const totalSec = useMemo(() => totalDurationSec(sequence), [sequence]);

    // Reiniciar la reproducción cuando cambia la secuencia (edición en vivo).
    useEffect(() => {
        setIndex(0);
        setVisible(true);
    }, [sequence.length, manifest.config.transitionMs]);

    // Motor de reproducción FINITO (espejo del reproductor real).
    useEffect(() => {
        if (sequence.length === 0) return undefined;
        const step = sequence[index % sequence.length];
        const durationMs = Math.max(1, Number(step?.durationSec) || 1) * 1000;
        const transitionMs = Math.max(0, Number(manifest.config.transitionMs) || 0);

        setVisible(false);
        const hideTimer = setTimeout(() => {
            setIndex((prev) => (prev + 1) % sequence.length);
            setVisible(true);
        }, transitionMs);
        const advanceTimer = setTimeout(() => {
            setIndex((prev) => (prev + 1) % sequence.length);
        }, durationMs);

        return () => {
            clearTimeout(hideTimer);
            clearTimeout(advanceTimer);
        };
    }, [index, sequence, manifest.config.transitionMs]);

    const isHorizontal = manifest.config.format === 'horizontal';
    const aspect = isHorizontal ? '16:9' : '9:16';
    const current = sequence.length > 0 ? sequence[index % sequence.length] : null;

    return (
        <div style={styles.wrapper}>
            <div style={styles.frameHeader}>
                <span style={styles.frameLabel}>VISTA PREVIA EN VIVO</span>
                <span style={styles.frameMeta}>
                    {aspect} · {sequence.length} pasos · {totalSec}s
                </span>
            </div>

            <div style={{ ...styles.frame, aspectRatio: aspect.replace(':', ' / ') }}>
                {sequence.length === 0 || !current ? (
                    <TotemEmptyState style={styles.fill} />
                ) : (
                    <div style={{ ...styles.scaled, fontSize: `${scale}em` }}>
                        <TotemStage
                            step={current}
                            config={manifest.config}
                            visible={visible}
                            index={index}
                            total={sequence.length}
                            totalSec={totalSec}
                            source="preview"
                            compact
                            style={styles.fill}
                        />
                    </div>
                )}
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
// Estilos — B&W editorial (marco) + escenario oscuro (contenido)
// ─────────────────────────────────────────────────────────────
const styles = {
    wrapper: {
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
    },
    frameHeader: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    frameLabel: {
        fontSize: '10px',
        fontWeight: '900',
        letterSpacing: '1.5px',
        color: '#0f0f0f',
    },
    frameMeta: {
        fontSize: '10px',
        fontWeight: '700',
        letterSpacing: '0.5px',
        color: '#6b6b6b',
    },
    frame: {
        width: '100%',
        maxHeight: '420px',
        border: '1px solid #0f0f0f',
        overflow: 'hidden',
        background: '#0a0a0a',
        position: 'relative',
    },
    scaled: {
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
    },
    fill: {
        position: 'absolute',
        inset: 0,
    },
};

export default TotemPreview;
