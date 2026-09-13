import React, { useEffect, useState } from 'react';
import {
    COMPONENT_TYPE_LABELS,
    COMPONENT_TYPE_ORDER,
    DEFAULT_DISPLAY_CONFIG,
    MIN_COLUMNS,
    MAX_COLUMNS,
    VALID_THEMES,
    normalizeDisplayConfig,
    validateDisplayConfig,
} from '../utils/displayMappers';
import { loadDisplayConfig, saveDisplayConfig } from '../services/displayConfigService';

/**
 * DisplayConfigPanel — Panel de administración del Display de Precios (V17, Fase 17.2).
 *
 * Permite al admin elegir:
 *   - qué grupos de `component_type` mostrar (vacío = todos),
 *   - número de columnas (1..6),
 *   - tema (LIGHT / DARK),
 *   - mostrar imágenes,
 *   - mostrar productos agotados.
 *
 * La configuración se persiste en `system_settings` bajo la clave
 * `heladeria_display_precios_config` vía PATCH (ver displayConfigService.js).
 *
 * NOTA (Incident 16.1): PROHIBIDO usar animaciones CSS infinitas en
 * indicadores estáticos. Este panel no define ningún @keyframes.
 */
export function DisplayConfigPanel({ onOpenOutput }) {
    const [config, setConfig] = useState({ ...DEFAULT_DISPLAY_CONFIG });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [feedback, setFeedback] = useState(null);

    // ── Carga inicial ────────────────────────────────────────
    useEffect(() => {
        let alive = true;
        (async () => {
            const loaded = await loadDisplayConfig();
            if (!alive) return;
            setConfig(normalizeDisplayConfig(loaded));
            setLoading(false);
        })();
        return () => { alive = false; };
    }, []);

    // ── Handlers ─────────────────────────────────────────────
    const toggleGroup = (componentType) => {
        setConfig((prev) => {
            const has = prev.groups.includes(componentType);
            const groups = has
                ? prev.groups.filter((g) => g !== componentType)
                : [...prev.groups, componentType];
            return { ...prev, groups };
        });
        setFeedback(null);
    };

    const setField = (field, value) => {
        setConfig((prev) => ({ ...prev, [field]: value }));
        setFeedback(null);
    };

    const handleSave = async () => {
        const { valid, errors } = validateDisplayConfig(config);
        if (!valid) {
            setFeedback({ type: 'error', text: errors.join(' · ') });
            return;
        }
        setSaving(true);
        try {
            const saved = await saveDisplayConfig(config);
            setConfig(saved);
            setFeedback({ type: 'success', text: 'Configuración guardada correctamente.' });
        } catch (err) {
            setFeedback({ type: 'error', text: err.message || 'No se pudo guardar.' });
        } finally {
            setSaving(false);
        }
    };

    const handleReset = () => {
        setConfig({ ...DEFAULT_DISPLAY_CONFIG });
        setFeedback({ type: 'info', text: 'Valores restaurados. Pulsa Guardar para aplicar.' });
    };

    // ── Render ───────────────────────────────────────────────
    if (loading) {
        return (
            <div style={styles.center}>
                <div style={{ color: '#38bdf8', fontSize: '14px', fontWeight: '700' }}>
                    Cargando configuración…
                </div>
            </div>
        );
    }

    return (
        <div style={styles.wrapper}>
            {/* ── Grupos visibles ── */}
            <section style={styles.card}>
                <h3 style={styles.cardTitle}>Grupos visibles</h3>
                <p style={styles.hint}>
                    Sin selección se muestran <strong>todos</strong> los grupos.
                </p>
                <div style={styles.chipRow}>
                    {COMPONENT_TYPE_ORDER.map((type) => {
                        const active = config.groups.includes(type);
                        return (
                            <button
                                key={type}
                                onClick={() => toggleGroup(type)}
                                style={{
                                    ...styles.chip,
                                    ...(active ? styles.chipActive : {}),
                                }}
                            >
                                {COMPONENT_TYPE_LABELS[type] || type}
                            </button>
                        );
                    })}
                </div>
                <div style={styles.counter}>
                    {config.groups.length === 0
                        ? 'Mostrando todos los grupos'
                        : `${config.groups.length} grupo(s) seleccionado(s)`}
                </div>
            </section>

            {/* ── Columnas ── */}
            <section style={styles.card}>
                <h3 style={styles.cardTitle}>Columnas</h3>
                <div style={styles.stepperRow}>
                    <button
                        style={styles.stepperBtn}
                        onClick={() => setField('columns', Math.max(MIN_COLUMNS, config.columns - 1))}
                        disabled={config.columns <= MIN_COLUMNS}
                    >
                        −
                    </button>
                    <span style={styles.stepperValue}>{config.columns}</span>
                    <button
                        style={styles.stepperBtn}
                        onClick={() => setField('columns', Math.min(MAX_COLUMNS, config.columns + 1))}
                        disabled={config.columns >= MAX_COLUMNS}
                    >
                        +
                    </button>
                    <span style={styles.stepperHint}>
                        ({MIN_COLUMNS}–{MAX_COLUMNS})
                    </span>
                </div>
            </section>

            {/* ── Tema ── */}
            <section style={styles.card}>
                <h3 style={styles.cardTitle}>Tema</h3>
                <div style={styles.chipRow}>
                    {VALID_THEMES.map((theme) => (
                        <button
                            key={theme}
                            onClick={() => setField('theme', theme)}
                            style={{
                                ...styles.chip,
                                ...(config.theme === theme ? styles.chipActive : {}),
                            }}
                        >
                            {theme === 'LIGHT' ? '☀️ Claro' : '🌙 Oscuro'}
                        </button>
                    ))}
                </div>
            </section>

            {/* ── Opciones ── */}
            <section style={styles.card}>
                <h3 style={styles.cardTitle}>Opciones</h3>
                <label style={styles.checkRow}>
                    <input
                        type="checkbox"
                        checked={config.showImages}
                        onChange={(e) => setField('showImages', e.target.checked)}
                        style={styles.checkbox}
                    />
                    <span>Mostrar imágenes de producto</span>
                </label>
                <label style={styles.checkRow}>
                    <input
                        type="checkbox"
                        checked={config.showUnavailable}
                        onChange={(e) => setField('showUnavailable', e.target.checked)}
                        style={styles.checkbox}
                    />
                    <span>Mostrar productos agotados (atenuados)</span>
                </label>
            </section>

            {/* ── Feedback ── */}
            {feedback && (
                <div style={{
                    ...styles.feedback,
                    ...(feedback.type === 'error' ? styles.feedbackError
                        : feedback.type === 'success' ? styles.feedbackSuccess
                            : styles.feedbackInfo),
                }}>
                    {feedback.text}
                </div>
            )}

            {/* ── Acciones ── */}
            <div style={styles.actions}>
                <button style={styles.btnGhost} onClick={handleReset} disabled={saving}>
                    Restaurar
                </button>
                <button style={styles.btnPrimary} onClick={handleSave} disabled={saving}>
                    {saving ? 'Guardando…' : 'Guardar configuración'}
                </button>
                {onOpenOutput && (
                    <button style={styles.btnOutput} onClick={onOpenOutput}>
                        🖥️ Abrir pantalla de precios
                    </button>
                )}
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
// Estilos (inline, siguiendo el patrón del módulo Heladería)
// ─────────────────────────────────────────────────────────────
const styles = {
    wrapper: {
        display: 'flex',
        flexDirection: 'column',
        gap: '18px',
        padding: '24px 30px',
        maxWidth: '900px',
        margin: '0 auto',
        width: '100%',
        boxSizing: 'border-box',
    },
    center: {
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
    },
    card: {
        background: 'rgba(15, 23, 42, 0.6)',
        border: '1px solid rgba(56, 189, 248, 0.15)',
        borderRadius: '16px',
        padding: '18px 20px',
    },
    cardTitle: {
        margin: '0 0 10px 0',
        fontFamily: "'Playfair Display', serif",
        fontSize: '1.1rem',
        color: '#f9fafb',
    },
    hint: {
        margin: '0 0 12px 0',
        color: '#9ca3af',
        fontSize: '12px',
    },
    chipRow: {
        display: 'flex',
        flexWrap: 'wrap',
        gap: '10px',
    },
    chip: {
        background: 'rgba(56, 189, 248, 0.08)',
        border: '1px solid rgba(56, 189, 248, 0.2)',
        color: '#9ca3af',
        padding: '9px 16px',
        borderRadius: '12px',
        cursor: 'pointer',
        fontWeight: '700',
        fontSize: '13px',
        transition: 'all 0.2s ease',
    },
    chipActive: {
        background: 'rgba(56, 189, 248, 0.22)',
        border: '1px solid #38bdf8',
        color: '#38bdf8',
    },
    counter: {
        marginTop: '12px',
        color: '#6b7280',
        fontSize: '12px',
        fontWeight: '600',
    },
    stepperRow: {
        display: 'flex',
        alignItems: 'center',
        gap: '14px',
    },
    stepperBtn: {
        width: '40px',
        height: '40px',
        borderRadius: '12px',
        background: 'rgba(56, 189, 248, 0.1)',
        border: '1px solid rgba(56, 189, 248, 0.25)',
        color: '#38bdf8',
        fontSize: '20px',
        fontWeight: '700',
        cursor: 'pointer',
    },
    stepperValue: {
        minWidth: '40px',
        textAlign: 'center',
        color: '#f9fafb',
        fontSize: '20px',
        fontWeight: '800',
    },
    stepperHint: {
        color: '#6b7280',
        fontSize: '12px',
    },
    checkRow: {
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        color: '#d1d5db',
        fontSize: '14px',
        padding: '8px 0',
        cursor: 'pointer',
    },
    checkbox: {
        width: '18px',
        height: '18px',
        accentColor: '#38bdf8',
        cursor: 'pointer',
    },
    feedback: {
        padding: '12px 16px',
        borderRadius: '12px',
        fontSize: '13px',
        fontWeight: '600',
    },
    feedbackError: {
        background: 'rgba(239, 68, 68, 0.12)',
        border: '1px solid rgba(239, 68, 68, 0.35)',
        color: '#fca5a5',
    },
    feedbackSuccess: {
        background: 'rgba(34, 197, 94, 0.12)',
        border: '1px solid rgba(34, 197, 94, 0.35)',
        color: '#86efac',
    },
    feedbackInfo: {
        background: 'rgba(56, 189, 248, 0.12)',
        border: '1px solid rgba(56, 189, 248, 0.35)',
        color: '#7dd3fc',
    },
    actions: {
        display: 'flex',
        flexWrap: 'wrap',
        gap: '12px',
        justifyContent: 'flex-end',
    },
    btnGhost: {
        background: 'transparent',
        border: '1px solid rgba(148, 163, 184, 0.3)',
        color: '#9ca3af',
        padding: '12px 20px',
        borderRadius: '12px',
        cursor: 'pointer',
        fontWeight: '700',
        fontSize: '13px',
    },
    btnPrimary: {
        background: 'linear-gradient(135deg, #38bdf8, #0ea5e9)',
        border: 'none',
        color: '#04121f',
        padding: '12px 24px',
        borderRadius: '12px',
        cursor: 'pointer',
        fontWeight: '800',
        fontSize: '13px',
    },
    btnOutput: {
        background: 'rgba(56, 189, 248, 0.1)',
        border: '1px solid rgba(56, 189, 248, 0.3)',
        color: '#38bdf8',
        padding: '12px 20px',
        borderRadius: '12px',
        cursor: 'pointer',
        fontWeight: '700',
        fontSize: '13px',
    },
};
