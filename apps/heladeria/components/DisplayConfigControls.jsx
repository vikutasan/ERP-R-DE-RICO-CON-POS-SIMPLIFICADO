import React from 'react';
import { COMPONENT_TYPE_LABELS, COMPONENT_TYPE_ORDER } from '../utils/displayMappers';
import { listPrintFormats } from '../utils/printFormats';

/**
 * DisplayConfigControls — Panel de PODER DE DISEÑO del Display (V8).
 *
 * Controles puros y controlados: reciben `screen` (pantalla nombrada) y
 * `onChange(patch)`; NO guardan estado propio ni tocan la red.
 *
 * Secciones:
 *   1. Encabezado   — título, subtítulo, badge, visibilidad.
 *   2. Imágenes     — mostrar, tamaño, forma, texto de respaldo.
 *   3. Diseño       — columnas, tema, mostrar agotados.
 *   4. Etiquetas    — renombrar categorías (groupLabels).
 *   5. Impresión    — formato de papel, orientación, margen.
 *
 * REGLAS:
 *   - CERO precios hardcodeados.
 *   - CERO animaciones infinitas (Incident 16.1).
 *   - Máx. 3 niveles de anidación; sub-componentes para respetarlo.
 *
 * @param {object}   props.screen    Pantalla nombrada en edición.
 * @param {function} props.onChange  (patch) => void — patch parcial de la pantalla.
 * @param {boolean}  [props.disabled=false]
 */
export function DisplayConfigControls({ screen, onChange, disabled = false }) {
    if (!screen) return null;

    // La forma canónica es { id, name, enabled, config }. `header`, `images` y
    // `print` viven DENTRO de `config`; leerlos en la raíz devolvía siempre los
    // defaults y hacía que los patches se escribieran en el nivel equivocado.
    const config = screen.config || {};
    const header = config.header || {};
    const images = config.images || {};
    const print = config.print || {};
    const groupLabels = config.groupLabels || {};

    const patchConfig = (patch) => onChange({ config: { ...config, ...patch } });
    const patchHeader = (patch) => patchConfig({ header: { ...header, ...patch } });
    const patchImages = (patch) => patchConfig({ images: { ...images, ...patch } });
    const patchPrint = (patch) => patchConfig({ print: { ...print, ...patch } });

    const patchGroupLabel = (type, value) => {
        const next = { ...groupLabels };
        if (value.trim().length === 0) delete next[type];
        else next[type] = value;
        patchConfig({ groupLabels: next });
    };

    return (
        <div style={styles.wrapper}>
            {/* ── 1. Encabezado ── */}
            <Section title="Encabezado">
                <CheckRow
                    label="Mostrar encabezado"
                    checked={header.show !== false}
                    disabled={disabled}
                    onChange={(v) => patchHeader({ show: v })}
                />
                <TextField
                    label="Título"
                    value={header.title || ''}
                    placeholder="R de Rico — Precios"
                    disabled={disabled}
                    onChange={(v) => patchHeader({ title: v })}
                />
                <TextField
                    label="Subtítulo"
                    value={header.subtitle || ''}
                    placeholder="Opcional"
                    disabled={disabled}
                    onChange={(v) => patchHeader({ subtitle: v })}
                />
                <TextField
                    label="Etiqueta (badge)"
                    value={header.badge || ''}
                    placeholder="Opcional"
                    disabled={disabled}
                    onChange={(v) => patchHeader({ badge: v })}
                />
            </Section>

            {/* ── 2. Imágenes ── */}
            <Section title="Imágenes de producto">
                <CheckRow
                    label="Mostrar imágenes"
                    checked={images.enabled !== false}
                    disabled={disabled}
                    onChange={(v) => patchImages({ enabled: v })}
                />
                <ChipRow
                    label="Tamaño"
                    value={images.size || 'MEDIUM'}
                    options={[
                        { key: 'SMALL', label: 'Pequeña' },
                        { key: 'MEDIUM', label: 'Mediana' },
                        { key: 'LARGE', label: 'Grande' },
                    ]}
                    disabled={disabled}
                    onChange={(v) => patchImages({ size: v })}
                />
                <ChipRow
                    label="Forma"
                    value={images.shape || 'ROUNDED'}
                    options={[
                        { key: 'SQUARE', label: 'Cuadrada' },
                        { key: 'ROUNDED', label: 'Redondeada' },
                        { key: 'CIRCLE', label: 'Circular' },
                    ]}
                    disabled={disabled}
                    onChange={(v) => patchImages({ shape: v })}
                />
                <ChipRow
                    label="Si falta la imagen"
                    value={images.fallback || 'INITIALS'}
                    options={[
                        { key: 'NONE', label: 'Ocultar' },
                        { key: 'INITIALS', label: 'Mostrar iniciales' },
                    ]}
                    disabled={disabled}
                    onChange={(v) => patchImages({ fallback: v })}
                />
            </Section>

            {/* ── 3. Diseño ── */}
            <Section title="Diseño">
                <Stepper
                    label="Columnas"
                    value={screen.config?.columns || 3}
                    min={1}
                    max={6}
                    disabled={disabled}
                    onChange={(v) => patchConfig({ columns: v })}
                />
                <ChipRow
                    label="Tema"
                    value={screen.config?.theme || 'LIGHT'}
                    options={[
                        { key: 'LIGHT', label: 'Claro' },
                        { key: 'DARK', label: 'Oscuro' },
                    ]}
                    disabled={disabled}
                    onChange={(v) => patchConfig({ theme: v })}
                />
                <CheckRow
                    label="Mostrar productos agotados"
                    checked={screen.config?.showUnavailable !== false}
                    disabled={disabled}
                    onChange={(v) => patchConfig({ showUnavailable: v })}
                />
            </Section>

            {/* ── 4. Etiquetas de categoría ── */}
            <Section title="Etiquetas de categoría">
                <p style={styles.hint}>
                    Renombra cómo se muestra cada categoría en la carta.
                    Déjalo vacío para usar el nombre original.
                </p>
                {COMPONENT_TYPE_ORDER.map((type) => (
                    <TextField
                        key={type}
                        label={COMPONENT_TYPE_LABELS[type] || type}
                        value={groupLabels[type] || ''}
                        placeholder={COMPONENT_TYPE_LABELS[type] || type}
                        disabled={disabled}
                        onChange={(v) => patchGroupLabel(type, v)}
                    />
                ))}
            </Section>

            {/* ── 5. Impresión ── */}
            <Section title="Impresión (PDF para taller)">
                <ChipRow
                    label="Formato de papel"
                    value={print.format || 'LETTER'}
                    options={listPrintFormats().map((f) => ({ key: f.key, label: f.label }))}
                    disabled={disabled}
                    onChange={(v) => patchPrint({ format: v })}
                />
                <ChipRow
                    label="Orientación"
                    value={print.orientation || 'PORTRAIT'}
                    options={[
                        { key: 'PORTRAIT', label: 'Vertical' },
                        { key: 'LANDSCAPE', label: 'Horizontal' },
                    ]}
                    disabled={disabled}
                    onChange={(v) => patchPrint({ orientation: v })}
                />
                <Stepper
                    label="Margen (mm)"
                    value={print.marginMm ?? 12}
                    min={0}
                    max={40}
                    disabled={disabled}
                    onChange={(v) => patchPrint({ marginMm: v })}
                />
            </Section>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
// Sub-componentes (mantienen la anidación ≤ 3 niveles)
// ─────────────────────────────────────────────────────────────

function Section({ title, children }) {
    return (
        <section style={styles.section}>
            <h3 style={styles.sectionTitle}>{title}</h3>
            <div style={styles.sectionBody}>{children}</div>
        </section>
    );
}

function TextField({ label, value, placeholder, disabled, onChange }) {
    return (
        <label style={styles.field}>
            <span style={styles.fieldLabel}>{label}</span>
            <input
                type="text"
                value={value}
                placeholder={placeholder}
                disabled={disabled}
                onChange={(e) => onChange(e.target.value)}
                style={styles.input}
            />
        </label>
    );
}

function CheckRow({ label, checked, disabled, onChange }) {
    return (
        <label style={styles.checkRow}>
            <input
                type="checkbox"
                checked={checked}
                disabled={disabled}
                onChange={(e) => onChange(e.target.checked)}
                style={styles.checkbox}
            />
            <span style={styles.checkLabel}>{label}</span>
        </label>
    );
}

function ChipRow({ label, value, options, disabled, onChange }) {
    return (
        <div style={styles.field}>
            <span style={styles.fieldLabel}>{label}</span>
            <div style={styles.chipRow}>
                {options.map((opt) => (
                    <button
                        key={opt.key}
                        type="button"
                        disabled={disabled}
                        onClick={() => onChange(opt.key)}
                        style={{
                            ...styles.chip,
                            ...(value === opt.key ? styles.chipActive : null),
                        }}
                    >
                        {opt.label}
                    </button>
                ))}
            </div>
        </div>
    );
}

function Stepper({ label, value, min, max, disabled, onChange }) {
    const clamp = (v) => Math.min(max, Math.max(min, v));
    return (
        <div style={styles.field}>
            <span style={styles.fieldLabel}>{label}</span>
            <div style={styles.stepperRow}>
                <button
                    type="button"
                    disabled={disabled || value <= min}
                    onClick={() => onChange(clamp(value - 1))}
                    style={styles.stepperBtn}
                >
                    −
                </button>
                <span style={styles.stepperValue}>{value}</span>
                <button
                    type="button"
                    disabled={disabled || value >= max}
                    onClick={() => onChange(clamp(value + 1))}
                    style={styles.stepperBtn}
                >
                    +
                </button>
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
        gap: '0',
    },
    section: {
        borderTop: '1px solid #e5e5e5',
        padding: '16px 0',
    },
    sectionTitle: {
        margin: '0 0 12px 0',
        fontSize: '11px',
        fontWeight: '900',
        letterSpacing: '1.5px',
        textTransform: 'uppercase',
        color: '#0f0f0f',
    },
    sectionBody: {
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
    },
    hint: {
        margin: 0,
        fontSize: '11px',
        lineHeight: 1.5,
        color: '#6b6b6b',
    },
    field: {
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
    },
    fieldLabel: {
        fontSize: '11px',
        fontWeight: '700',
        letterSpacing: '0.5px',
        color: '#0f0f0f',
    },
    input: {
        width: '100%',
        padding: '8px 10px',
        border: '1px solid #d4d4d4',
        borderRadius: '0',
        fontSize: '13px',
        fontFamily: "'Inter', sans-serif",
        color: '#0f0f0f',
        background: '#ffffff',
        boxSizing: 'border-box',
    },
    checkRow: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        cursor: 'pointer',
    },
    checkbox: {
        width: '16px',
        height: '16px',
        accentColor: '#0f0f0f',
    },
    checkLabel: {
        fontSize: '12px',
        fontWeight: '600',
        color: '#0f0f0f',
    },
    chipRow: {
        display: 'flex',
        flexWrap: 'wrap',
        gap: '6px',
    },
    chip: {
        padding: '6px 12px',
        border: '1px solid #d4d4d4',
        background: '#ffffff',
        color: '#0f0f0f',
        fontSize: '11px',
        fontWeight: '700',
        letterSpacing: '0.3px',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
    },
    chipActive: {
        background: '#0f0f0f',
        color: '#ffffff',
        borderColor: '#0f0f0f',
    },
    stepperRow: {
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
    },
    stepperBtn: {
        width: '30px',
        height: '30px',
        border: '1px solid #0f0f0f',
        background: '#ffffff',
        color: '#0f0f0f',
        fontSize: '16px',
        fontWeight: '700',
        cursor: 'pointer',
        lineHeight: 1,
    },
    stepperValue: {
        minWidth: '28px',
        textAlign: 'center',
        fontSize: '14px',
        fontWeight: '800',
        color: '#0f0f0f',
    },
};
