import React from 'react';
import { listTemplates } from '../utils/displayTemplates';

/**
 * DisplayTemplatePicker — Selector de plantilla de diseño (V8, §5.14).
 *
 * Muestra las 5 plantillas (CLASSIC, MINIMAL, KIDS, RETRO, PRICE_ONLY) como
 * tarjetas. Al elegir una, el padre aplica `applyTemplate` sobre la pantalla.
 *
 * PURO: sin estado, sin red. Solo props → JSX.
 *
 * @param {string}   props.value     Plantilla activa (o null si es personalizada).
 * @param {function} props.onSelect  (templateKey) => void.
 * @param {boolean}  [props.disabled=false]
 */
export function DisplayTemplatePicker({ value, onSelect, disabled = false }) {
    const templates = listTemplates();

    return (
        <div style={styles.wrapper}>
            <span style={styles.label}>Plantilla de diseño</span>
            <div style={styles.grid}>
                {templates.map((tpl) => (
                    <button
                        key={tpl.key}
                        type="button"
                        disabled={disabled}
                        onClick={() => onSelect(tpl.key)}
                        style={{
                            ...styles.card,
                            ...(value === tpl.key ? styles.cardActive : null),
                        }}
                    >
                        <span style={styles.cardLabel}>{tpl.label}</span>
                        <span style={styles.cardDesc}>{tpl.description}</span>
                    </button>
                ))}
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
    label: {
        fontSize: '11px',
        fontWeight: '900',
        letterSpacing: '1.5px',
        textTransform: 'uppercase',
        color: '#0f0f0f',
    },
    grid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
        gap: '8px',
    },
    card: {
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        padding: '12px',
        border: '1px solid #d4d4d4',
        background: '#ffffff',
        textAlign: 'left',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        fontFamily: "'Inter', sans-serif",
    },
    cardActive: {
        borderColor: '#0f0f0f',
        background: '#0f0f0f',
        color: '#ffffff',
    },
    cardLabel: {
        fontSize: '12px',
        fontWeight: '900',
        letterSpacing: '0.3px',
    },
    cardDesc: {
        fontSize: '10px',
        lineHeight: 1.4,
        opacity: 0.75,
    },
};
