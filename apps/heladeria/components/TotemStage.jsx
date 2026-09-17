import React from 'react';

/**
 * TotemStage — Renderizador PURO del escenario del Display Tótem (V16).
 *
 * Es la ÚNICA fuente de verdad visual del tótem. Lo consumen:
 *   - `TotemPlayer`  → modo kiosco a pantalla completa.
 *   - `TotemPreview` → vista previa en vivo dentro del gestor de contenido.
 *
 * Al ser puro (sin estado, sin red, sin timers) garantiza que lo que el admin
 * ve en la vista previa sea EXACTAMENTE lo que se proyecta en el monitor.
 *
 * ANIMACIONES (Incident 16.1 — Efecto Estrobo):
 *   PROHIBIDO `animation: ... infinite` y `@keyframes`. Aquí solo se aplican
 *   `transition` de CSS FINITAS (fade/slide/zoom). El avance de la secuencia
 *   lo gobierna el contenedor con `setTimeout`.
 *
 * @param {object|null} step      Paso actual de la secuencia (de `buildSequence`).
 * @param {object}      config    Configuración normalizada del tótem.
 * @param {boolean}     visible   Si el paso está visible (transición de entrada/salida).
 * @param {number}      index     Índice actual (0-based) para la barra de progreso.
 * @param {number}      total     Total de pasos de la secuencia.
 * @param {number}      totalSec  Duración total de la secuencia en segundos.
 * @param {string}      source    'network' | 'cache' | 'empty' | 'preview'.
 * @param {boolean}     compact   Si es true, oculta el pie de metadatos (vista previa).
 * @param {object}      style     Estilos extra para el contenedor raíz.
 */
export function TotemStage({
    step,
    config,
    visible = true,
    index = 0,
    total = 0,
    totalSec = 0,
    source = 'network',
    compact = false,
    style,
}) {
    const accent = (step && step.image && step.image.accentColor) || config.accentColor;
    const transitionMs = Math.max(0, Number(config.transitionMs) || 0);
    const isHorizontal = config.format === 'horizontal';

    const transitionStyle = {
        transition: `opacity ${transitionMs}ms ease, transform ${transitionMs}ms ease`,
        opacity: visible ? 1 : 0,
        transform: visible ? 'translate(0, 0) scale(1)' : exitTransform(config.transition),
    };

    return (
        <div style={{ ...styles.stage, ...style }}>
            <div style={{ ...styles.frame, flexDirection: isHorizontal ? 'row' : 'column' }}>
                <div style={{ ...styles.mediaWrap, ...transitionStyle }}>
                    <img
                        src={step.image.url}
                        alt={step.image.label || 'tótem'}
                        style={styles.media}
                    />
                </div>
                {step.image.label && (
                    <div style={{ ...styles.caption, borderColor: accent }}>
                        <span style={{ ...styles.captionText, color: accent }}>
                            {step.image.label}
                        </span>
                        <span style={styles.captionKind}>
                            {step.kind === 'hero' ? 'DESTACADO' : 'PRODUCTO'}
                        </span>
                    </div>
                )}
            </div>

            {/* Barra de progreso FINITA (sin animación infinita). */}
            <div style={styles.progressTrack}>
                <div
                    style={{
                        ...styles.progressFill,
                        width: `${total > 0 ? ((index + 1) / total) * 100 : 0}%`,
                        background: config.accentColor,
                    }}
                />
            </div>

            {!compact && (
                <div style={styles.footer}>
                    <span style={styles.footerText}>
                        {index + 1} / {total} · {totalSec}s · {source === 'cache' ? 'offline' : 'en línea'}
                    </span>
                </div>
            )}
        </div>
    );
}

/**
 * Desplazamiento de salida según el tipo de transición. Función pura.
 */
function exitTransform(transition) {
    if (transition === 'slide') return 'translateX(40px)';
    if (transition === 'zoom') return 'scale(0.92)';
    return 'translate(0, 0) scale(1)';
}

/**
 * Estado vacío honesto del tótem. Se expone para que el reproductor y la
 * vista previa muestren el mismo mensaje.
 */
export function TotemEmptyState({ children, style }) {
    return (
        <div style={{ ...styles.stage, ...style }}>
            <div style={styles.emptyBox}>
                <div style={styles.emptyIcon}>📺</div>
                <h2 style={styles.emptyTitle}>Tótem sin contenido</h2>
                <p style={styles.emptyText}>
                    Sube imágenes macro y hero desde el gestor de contenido del tótem.
                </p>
                {children}
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
        minHeight: 0,
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
};

export default TotemStage;
