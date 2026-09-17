import React from 'react';
import { DisplayPreciosBody, resolveTheme } from './DisplayPreciosBody';

/**
 * DisplayPreciosPreview — Vista previa EN VIVO del Display (V8).
 *
 * Envuelve a DisplayPreciosBody en un marco con proporción de pantalla
 * (16:9 por defecto) y lo escala para que quepa en el panel del Configurador.
 *
 * REGLAS:
 *   - CERO red. Recibe `viewModel` ya construido por el padre.
 *   - CERO animaciones infinitas (Incident 16.1).
 *   - Si no hay datos, muestra un estado vacío honesto (no un spinner infinito).
 *
 * @param {object}  props.viewModel  Salida de buildDisplayViewModel().
 * @param {object}  props.screen     Pantalla nombrada en edición.
 * @param {string}  [props.aspect='16:9'] Relación de aspecto del marco.
 * @param {number}  [props.scale=0.62]    Escala tipográfica interna.
 */
export function DisplayPreciosPreview({
    viewModel,
    screen,
    aspect = '16:9',
    scale = 0.62,
}) {
    const theme = resolveTheme(viewModel?.config?.theme);
    const isEmpty = !viewModel || viewModel.isEmpty;

    return (
        <div style={styles.wrapper}>
            <div style={styles.frameHeader}>
                <span style={styles.frameLabel}>VISTA PREVIA EN VIVO</span>
                <span style={styles.frameMeta}>
                    {aspect} · {viewModel?.config?.columns || 3} col
                </span>
            </div>

            <div style={{ ...styles.frame, aspectRatio: aspect.replace(':', ' / ') }}>
                {isEmpty ? (
                    <div style={{ ...styles.empty, background: theme.bg }}>
                        <div style={{ fontSize: '40px' }}>🍦</div>
                        <p style={{ ...styles.emptyText, color: theme.muted }}>
                            Sin productos visibles con la configuración actual.
                        </p>
                    </div>
                ) : (
                    <div style={styles.scaled}>
                        <DisplayPreciosBody
                            viewModel={viewModel}
                            theme={theme}
                            screen={screen}
                            scale={scale}
                            compact
                        />
                    </div>
                )}
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
// Estilos — B&W editorial
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
        border: '1px solid #0f0f0f',
        overflow: 'hidden',
        background: '#ffffff',
        position: 'relative',
    },
    scaled: {
        position: 'absolute',
        inset: 0,
        overflow: 'auto',
    },
    empty: {
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '10px',
        padding: '20px',
        textAlign: 'center',
    },
    emptyText: {
        margin: 0,
        fontSize: '12px',
        fontWeight: '600',
        lineHeight: 1.5,
    },
};
