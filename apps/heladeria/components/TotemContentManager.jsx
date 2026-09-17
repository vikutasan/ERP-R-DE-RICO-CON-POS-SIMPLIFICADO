import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    DEFAULT_TOTEM_CONFIG,
    FORMAT,
    MAX_DURATION_SEC,
    MAX_MACRO_COUNT,
    MAX_TRANSITION_MS,
    MIN_DURATION_SEC,
    MIN_MACRO_COUNT,
    MIN_TRANSITION_MS,
    TRANSITION,
    VALID_FORMATS,
    VALID_TRANSITIONS,
    buildSequence,
    normalizeTotemManifest,
    totalDurationSec,
    validateImageFile,
} from '../utils/totemSequencer';
import { totemContentService } from '../services/totemContentService';
import { TotemPreview } from './TotemPreview';

/**
 * TotemContentManager — Gestor de contenido del Display Tótem (V16, Fase 16.3).
 *
 * Permite al admin:
 *   - subir imágenes macro (tomas de producto) y hero (tomas de marca),
 *   - borrar imágenes (backend + manifiesto),
 *   - ajustar la configuración de reproducción (macroCount, duraciones,
 *     transición, formato, color de acento),
 *   - guardar el manifiesto en `system_settings` (clave `heladeria_totem_content`).
 *
 * Toda la lógica de secuenciación/validación vive en `totemSequencer.js`
 * (guardián del contrato). Este componente solo orquesta UI + red.
 *
 * NOTA (Incident 16.1): PROHIBIDO usar animaciones CSS infinitas. Este panel
 * no define ningún @keyframes; las transiciones del reproductor son finitas.
 */
export function TotemContentManager({ onBack, onOpenOutput, onOpenSelector }) {
    const [manifest, setManifest] = useState(() => normalizeTotemManifest(null));
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(null); // 'macro' | 'hero' | null
    const [feedback, setFeedback] = useState(null);
    const macroInputRef = useRef(null);
    const heroInputRef = useRef(null);

    // ── Carga inicial ────────────────────────────────────────
    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const raw = await totemContentService.getManifest();
                if (!alive) return;
                setManifest(normalizeTotemManifest(raw));
            } catch (err) {
                if (!alive) return;
                setFeedback({ type: 'error', text: err.message || 'No se pudo cargar el manifiesto.' });
            } finally {
                if (alive) setLoading(false);
            }
        })();
        return () => { alive = false; };
    }, []);

    // ── Handlers de configuración ────────────────────────────
    const setConfigField = (field, value) => {
        setManifest((prev) => ({ ...prev, config: { ...prev.config, [field]: value } }));
        setFeedback(null);
    };

    // ── Handlers de imágenes ─────────────────────────────────
    const handleUpload = async (kind, file) => {
        if (!file) return;
        const check = validateImageFile(file);
        if (!check.ok) {
            setFeedback({ type: 'error', text: check.error });
            return;
        }
        setUploading(kind);
        setFeedback(null);
        try {
            const result = await totemContentService.uploadImage(file);
            const newImage = {
                id: `${kind}_${Date.now()}`,
                filename: result.filename,
                url: result.url,
                label: file.name.replace(/\.[^.]+$/, ''),
                accentColor: manifest.config.accentColor,
            };
            setManifest((prev) => ({
                ...prev,
                [kind === 'macro' ? 'macros' : 'heroes']: [
                    ...(kind === 'macro' ? prev.macros : prev.heroes),
                    newImage,
                ],
            }));
            setFeedback({ type: 'success', text: 'Imagen subida. Pulsa Guardar para persistir el manifiesto.' });
        } catch (err) {
            setFeedback({ type: 'error', text: err.message || 'No se pudo subir la imagen.' });
        } finally {
            setUploading(null);
            if (kind === 'macro' && macroInputRef.current) macroInputRef.current.value = '';
            if (kind === 'hero' && heroInputRef.current) heroInputRef.current.value = '';
        }
    };

    const handleRemoveImage = async (kind, image) => {
        const listKey = kind === 'macro' ? 'macros' : 'heroes';
        setFeedback(null);
        // 1) Quitar del manifiesto local (inmediato, UX).
        setManifest((prev) => ({
            ...prev,
            [listKey]: prev[listKey].filter((img) => img.id !== image.id),
        }));
        // 2) Borrar el archivo físico del backend (best-effort).
        if (image.filename) {
            try {
                await totemContentService.deleteImage(image.filename);
            } catch (err) {
                setFeedback({
                    type: 'info',
                    text: `Imagen quitada del manifiesto, pero no se pudo borrar el archivo: ${err.message}`,
                });
            }
        }
    };

    const handleLabelChange = (kind, id, label) => {
        const listKey = kind === 'macro' ? 'macros' : 'heroes';
        setManifest((prev) => ({
            ...prev,
            [listKey]: prev[listKey].map((img) => (img.id === id ? { ...img, label } : img)),
        }));
        setFeedback(null);
    };

    // ── Guardar ──────────────────────────────────────────────
    const handleSave = async () => {
        setSaving(true);
        setFeedback(null);
        try {
            await totemContentService.saveManifest(manifest);
            setFeedback({ type: 'success', text: 'Manifiesto guardado correctamente.' });
        } catch (err) {
            setFeedback({ type: 'error', text: err.message || 'No se pudo guardar el manifiesto.' });
        } finally {
            setSaving(false);
        }
    };

    const handleReset = () => {
        setManifest((prev) => ({ ...prev, config: { ...DEFAULT_TOTEM_CONFIG } }));
        setFeedback({ type: 'info', text: 'Configuración restaurada. Pulsa Guardar para aplicar.' });
    };

    // ── Derivados (memoizados: buildSequence es puro y costoso) ──
    const sequence = useMemo(
        () => buildSequence(manifest.macros, manifest.heroes, manifest.config),
        [manifest],
    );
    const totalSec = useMemo(() => totalDurationSec(sequence), [sequence]);

    // ── Render ───────────────────────────────────────────────
    if (loading) {
        return (
            <div style={styles.wrapper}>
                <div style={styles.loading}>Cargando manifiesto del tótem…</div>
            </div>
        );
    }

    return (
        <div style={styles.wrapper}>
            {onBack && (
                <button type="button" style={styles.backBtn} onClick={onBack}>
                    ← Volver a la suite
                </button>
            )}
            <div style={styles.header}>
                <div>
                    <h2 style={styles.title}>Contenido del Tótem</h2>
                    <p style={styles.subtitle}>
                        Sube imágenes macro y hero, ajusta la reproducción y guarda el manifiesto.
                    </p>
                </div>
                <div style={styles.headerActions}>
                    {onOpenSelector && (
                        <button type="button" style={styles.selectorBtn} onClick={onOpenSelector}>
                            Selector de proyección
                        </button>
                    )}
                    {onOpenOutput && (
                        <button type="button" style={styles.outputBtn} onClick={onOpenOutput}>
                            Abrir salida del tótem
                        </button>
                    )}
                </div>
            </div>

            {feedback && (
                <div style={{ ...styles.feedback, ...(styles[`feedback_${feedback.type}`] || {}) }}>
                    {feedback.text}
                </div>
            )}

            {/* ── Vista previa EN VIVO (mismo renderizador que el kiosco) ── */}
            <section style={styles.previewSection}>
                <TotemPreview manifest={manifest} />
            </section>

            {/* ── Imágenes MACRO ── */}
            <section style={styles.section}>
                <div style={styles.sectionHead}>
                    <h3 style={styles.sectionTitle}>Tomas Macro ({manifest.macros.length})</h3>
                    <label style={styles.uploadBtn}>
                        {uploading === 'macro' ? 'Subiendo…' : '+ Subir macro'}
                        <input
                            ref={macroInputRef}
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            style={{ display: 'none' }}
                            disabled={uploading !== null}
                            onChange={(e) => handleUpload('macro', e.target.files?.[0])}
                        />
                    </label>
                </div>
                {manifest.macros.length === 0 ? (
                    <p style={styles.empty}>Sin tomas macro. Sube al menos una imagen de producto.</p>
                ) : (
                    <div style={styles.grid}>
                        {manifest.macros.map((img) => (
                            <ImageCard
                                key={img.id}
                                image={img}
                                onLabelChange={(v) => handleLabelChange('macro', img.id, v)}
                                onRemove={() => handleRemoveImage('macro', img)}
                            />
                        ))}
                    </div>
                )}
            </section>

            {/* ── Imágenes HERO ── */}
            <section style={styles.section}>
                <div style={styles.sectionHead}>
                    <h3 style={styles.sectionTitle}>Tomas Hero ({manifest.heroes.length})</h3>
                    <label style={styles.uploadBtn}>
                        {uploading === 'hero' ? 'Subiendo…' : '+ Subir hero'}
                        <input
                            ref={heroInputRef}
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            style={{ display: 'none' }}
                            disabled={uploading !== null}
                            onChange={(e) => handleUpload('hero', e.target.files?.[0])}
                        />
                    </label>
                </div>
                {manifest.heroes.length === 0 ? (
                    <p style={styles.empty}>Sin tomas hero. Sube al menos una imagen de marca.</p>
                ) : (
                    <div style={styles.grid}>
                        {manifest.heroes.map((img) => (
                            <ImageCard
                                key={img.id}
                                image={img}
                                onLabelChange={(v) => handleLabelChange('hero', img.id, v)}
                                onRemove={() => handleRemoveImage('hero', img)}
                            />
                        ))}
                    </div>
                )}
            </section>

            {/* ── Configuración ── */}
            <section style={styles.section}>
                <h3 style={styles.sectionTitle}>Reproducción</h3>
                <div style={styles.configGrid}>
                    <SliderField
                        label={`Macros por hero: ${manifest.config.macroCount}`}
                        min={MIN_MACRO_COUNT}
                        max={MAX_MACRO_COUNT}
                        step={1}
                        value={manifest.config.macroCount}
                        onChange={(v) => setConfigField('macroCount', Number(v))}
                    />
                    <SliderField
                        label={`Duración macro: ${manifest.config.macroDurationSec}s`}
                        min={MIN_DURATION_SEC}
                        max={MAX_DURATION_SEC}
                        step={1}
                        value={manifest.config.macroDurationSec}
                        onChange={(v) => setConfigField('macroDurationSec', Number(v))}
                    />
                    <SliderField
                        label={`Duración hero: ${manifest.config.heroDurationSec}s`}
                        min={MIN_DURATION_SEC}
                        max={MAX_DURATION_SEC}
                        step={1}
                        value={manifest.config.heroDurationSec}
                        onChange={(v) => setConfigField('heroDurationSec', Number(v))}
                    />
                    <SliderField
                        label={`Transición: ${manifest.config.transitionMs}ms`}
                        min={MIN_TRANSITION_MS}
                        max={MAX_TRANSITION_MS}
                        step={100}
                        value={manifest.config.transitionMs}
                        onChange={(v) => setConfigField('transitionMs', Number(v))}
                    />
                    <SelectField
                        label="Transición"
                        value={manifest.config.transition}
                        options={VALID_TRANSITIONS.map((t) => ({ value: t, label: t }))}
                        onChange={(v) => setConfigField('transition', v)}
                    />
                    <SelectField
                        label="Formato"
                        value={manifest.config.format}
                        options={VALID_FORMATS.map((f) => ({ value: f, label: f }))}
                        onChange={(v) => setConfigField('format', v)}
                    />
                    <div style={styles.field}>
                        <label style={styles.fieldLabel}>Color de acento</label>
                        <input
                            type="color"
                            value={manifest.config.accentColor}
                            onChange={(e) => setConfigField('accentColor', e.target.value)}
                            style={styles.colorInput}
                        />
                    </div>
                </div>
                <p style={styles.summary}>
                    Secuencia: <strong>{sequence.length}</strong> pasos · Duración total:{' '}
                    <strong>{totalSec}s</strong>
                </p>
            </section>

            {/* ── Acciones ── */}
            <div style={styles.actions}>
                <button type="button" style={styles.resetBtn} onClick={handleReset} disabled={saving}>
                    Restaurar valores
                </button>
                <button type="button" style={styles.saveBtn} onClick={handleSave} disabled={saving}>
                    {saving ? 'Guardando…' : 'Guardar manifiesto'}
                </button>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
// Subcomponentes
// ─────────────────────────────────────────────────────────────

function ImageCard({ image, onLabelChange, onRemove }) {
    return (
        <div style={styles.card}>
            <div style={styles.thumbWrap}>
                <img src={image.url} alt={image.label || 'imagen'} style={styles.thumb} />
            </div>
            <input
                type="text"
                value={image.label}
                placeholder="Etiqueta"
                onChange={(e) => onLabelChange(e.target.value)}
                style={styles.labelInput}
            />
            <button type="button" style={styles.removeBtn} onClick={onRemove}>
                Quitar
            </button>
        </div>
    );
}

function SliderField({ label, min, max, step, value, onChange }) {
    return (
        <div style={styles.field}>
            <label style={styles.fieldLabel}>{label}</label>
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                style={styles.range}
            />
        </div>
    );
}

function SelectField({ label, value, options, onChange }) {
    return (
        <div style={styles.field}>
            <label style={styles.fieldLabel}>{label}</label>
            <select value={value} onChange={(e) => onChange(e.target.value)} style={styles.select}>
                {options.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
            </select>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
// Estilos (inline, sin @keyframes — Incident 16.1)
// ─────────────────────────────────────────────────────────────

const styles = {
    wrapper: {
        padding: '24px',
        maxWidth: '1100px',
        margin: '0 auto',
        color: '#f8fafc',
    },
    backBtn: {
        alignSelf: 'flex-start',
        background: 'transparent',
        border: 'none',
        color: '#94a3b8',
        cursor: 'pointer',
        fontSize: '12px',
        fontWeight: 700,
        letterSpacing: '0.5px',
        padding: '0 0 12px',
        textTransform: 'uppercase',
    },
    loading: {
        padding: '48px',
        textAlign: 'center',
        color: '#94a3b8',
    },
    header: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: '16px',
        marginBottom: '20px',
    },
    title: {
        margin: 0,
        fontSize: '24px',
        fontWeight: 700,
    },
    subtitle: {
        margin: '6px 0 0',
        fontSize: '28px',
        color: '#94a3b8',
        fontWeight: 500,
    },
    headerActions: {
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        flexShrink: 0,
    },
    selectorBtn: {
        padding: '10px 16px',
        borderRadius: '8px',
        border: '1px solid #334155',
        background: 'transparent',
        color: '#cbd5e1',
        cursor: 'pointer',
        fontWeight: 600,
    },
    outputBtn: {
        padding: '10px 16px',
        borderRadius: '8px',
        border: '1px solid #fbbf24',
        background: 'transparent',
        color: '#fbbf24',
        cursor: 'pointer',
        fontWeight: 600,
    },
    feedback: {
        padding: '10px 14px',
        borderRadius: '8px',
        marginBottom: '16px',
        fontSize: '14px',
        background: '#1e293b',
        border: '1px solid #334155',
    },
    feedback_success: { background: '#052e16', border: '1px solid #16a34a', color: '#86efac' },
    feedback_error: { background: '#450a0a', border: '1px solid #dc2626', color: '#fca5a5' },
    feedback_info: { background: '#0c4a6e', border: '1px solid #0284c7', color: '#7dd3fc' },
    previewSection: {
        background: '#0f172a',
        border: '1px solid #1e293b',
        borderRadius: '12px',
        padding: '18px',
        marginBottom: '18px',
        display: 'flex',
        justifyContent: 'center',
    },
    section: {
        background: '#0f172a',
        border: '1px solid #1e293b',
        borderRadius: '12px',
        padding: '18px',
        marginBottom: '18px',
    },
    sectionHead: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '12px',
    },
    sectionTitle: {
        margin: 0,
        fontSize: '16px',
        fontWeight: 600,
    },
    uploadBtn: {
        padding: '8px 14px',
        borderRadius: '8px',
        background: '#fbbf24',
        color: '#0f172a',
        cursor: 'pointer',
        fontWeight: 600,
        fontSize: '13px',
    },
    empty: {
        margin: 0,
        color: '#64748b',
        fontSize: '14px',
    },
    grid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
        gap: '12px',
    },
    card: {
        background: '#1e293b',
        borderRadius: '10px',
        padding: '10px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
    },
    thumbWrap: {
        width: '100%',
        aspectRatio: '1 / 1',
        overflow: 'hidden',
        borderRadius: '8px',
        background: '#0f172a',
    },
    thumb: {
        width: '100%',
        height: '100%',
        objectFit: 'cover',
    },
    labelInput: {
        padding: '6px 8px',
        borderRadius: '6px',
        border: '1px solid #334155',
        background: '#0f172a',
        color: '#f8fafc',
        fontSize: '13px',
    },
    removeBtn: {
        padding: '6px 8px',
        borderRadius: '6px',
        border: '1px solid #dc2626',
        background: 'transparent',
        color: '#fca5a5',
        cursor: 'pointer',
        fontSize: '13px',
    },
    configGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
        gap: '16px',
    },
    field: {
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
    },
    fieldLabel: {
        fontSize: '13px',
        color: '#cbd5e1',
    },
    range: {
        width: '100%',
    },
    select: {
        padding: '8px',
        borderRadius: '6px',
        border: '1px solid #334155',
        background: '#0f172a',
        color: '#f8fafc',
    },
    colorInput: {
        width: '100%',
        height: '38px',
        border: '1px solid #334155',
        borderRadius: '6px',
        background: '#0f172a',
        cursor: 'pointer',
    },
    summary: {
        marginTop: '14px',
        fontSize: '14px',
        color: '#94a3b8',
    },
    actions: {
        display: 'flex',
        justifyContent: 'flex-end',
        gap: '12px',
    },
    resetBtn: {
        padding: '10px 16px',
        borderRadius: '8px',
        border: '1px solid #334155',
        background: 'transparent',
        color: '#cbd5e1',
        cursor: 'pointer',
    },
    saveBtn: {
        padding: '10px 20px',
        borderRadius: '8px',
        border: 'none',
        background: '#fbbf24',
        color: '#0f172a',
        cursor: 'pointer',
        fontWeight: 700,
    },
};

export default TotemContentManager;
