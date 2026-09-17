import React, { useEffect, useRef, useState } from 'react';
import { CONFIG } from '../../pos/config';
import { withRetries } from '../../pos/utils/withRetries';
import {
    buildDisplayViewModel,
    normalizeDisplayScreens,
    normalizeScreenConfig,
    MAX_SCREENS,
} from '../utils/displayMappers';
import { applyTemplate } from '../utils/displayTemplates';
import { duplicateScreenConfig } from '../utils/displayConfigIO';
import { loadDisplayScreens, saveDisplayScreens } from '../services/displayConfigService';
import { DisplayConfigControls } from '../components/DisplayConfigControls';
import { DisplayPreciosPreview } from '../components/DisplayPreciosPreview';
import { DisplayTemplateControls } from '../components/DisplayTemplateControls';

/**
 * DisplayPreciosConfigUI — Configurador del Display de Precios (V8).
 *
 * Layout de dos columnas:
 *   - Izquierda: pestañas de pantalla + controles de diseño.
 *   - Derecha:   vista previa EN VIVO (misma que el kiosco).
 *
 * Persistencia: guarda el documento completo de pantallas vía
 * `saveDisplayScreens` (PATCH /settings/heladeria_display_screens).
 *
 * REGLAS:
 *   - CERO precios hardcodeados: el menú viene de la API.
 *   - CERO animaciones infinitas (Incident 16.1).
 *   - Comparación antes de setState en el polling (Incident 16.2).
 *
 * @param {function} props.onBack
 */
export const DisplayPreciosConfigUI = ({ onBack }) => {
    const [doc, setDoc] = useState(null);
    const [activeId, setActiveId] = useState('screen_1');
    const [menuData, setMenuData] = useState(null);
    const [status, setStatus] = useState('loading'); // loading | ready | error
    const [feedback, setFeedback] = useState(null);
    const [saving, setSaving] = useState(false);
    const mountedRef = useRef(true);

    // ── Carga inicial ────────────────────────────────────────
    useEffect(() => {
        mountedRef.current = true;

        const load = async () => {
            try {
                const screensDoc = await loadDisplayScreens();
                if (!mountedRef.current) return;
                // Defensivo: nunca asumir que `screens` existe (Incident 16.8).
                const safeDoc = Array.isArray(screensDoc?.screens)
                    ? screensDoc
                    : normalizeDisplayScreens(screensDoc);
                setDoc(safeDoc);
                setActiveId(safeDoc.screens[0]?.id || 'screen_1');
                setStatus('ready');
            } catch {
                if (!mountedRef.current) return;
                setDoc(normalizeDisplayScreens(null));
                setStatus('error');
            }

            try {
                const menu = await withRetries(async () => {
                    const res = await fetch(
                        `${CONFIG.API_BASE_URL}/heladeria/display/menu`,
                        { cache: 'no-store' },
                    );
                    if (!res.ok) throw new Error('Error cargando menú');
                    return res.json();
                }, { label: 'displayConfig.getMenu' });
                if (mountedRef.current) setMenuData(menu);
            } catch {
                // Sin menú: la vista previa mostrará el estado vacío honesto.
            }
        };

        load();
        return () => { mountedRef.current = false; };
    }, []);

    // ── Derivados ────────────────────────────────────────────
    // Defensivo: `doc` puede llegar sin `screens` (p. ej. una respuesta
    // inesperada de la API). El encadenamiento opcional debe cubrir AMBOS
    // eslabones (`doc` y `doc.screens`), no solo el primero.
    const screens = Array.isArray(doc?.screens) ? doc.screens : [];
    const activeScreen = screens.find((s) => s.id === activeId) || screens[0] || null;
    const viewModel = activeScreen
        ? buildDisplayViewModel(menuData, normalizeScreenConfig(activeScreen.config))
        : null;

    // ── Handlers ─────────────────────────────────────────────
    const patchActiveScreen = (patch) => {
        setDoc((prev) => {
            if (!prev) return prev;
            const screens = prev.screens.map((s) =>
                s.id === activeId ? { ...s, ...patch } : s,
            );
            return { ...prev, screens };
        });
        setFeedback(null);
    };

    const renameScreen = (name) => patchActiveScreen({ name });

    const handleApplyTemplate = (templateKey) => {
        setDoc((prev) => {
            if (!prev) return prev;
            const screens = prev.screens.map((s) => {
                if (s.id !== activeId) return s;
                const nextConfig = applyTemplate(s.config, templateKey);
                return { ...s, template: templateKey, config: nextConfig };
            });
            return { ...prev, screens };
        });
        setFeedback(null);
    };

    const handleImportScreen = (imported) => {
        setDoc((prev) => {
            if (!prev) return prev;
            const screens = prev.screens.map((s) =>
                s.id === activeId
                    ? { ...s, config: imported.config, template: imported.template || null }
                    : s,
            );
            return { ...prev, screens };
        });
        setFeedback(null);
    };

    const handleDuplicate = (fromId, toId) => {
        setDoc((prev) => {
            if (!prev) return prev;
            return duplicateScreenConfig(prev, fromId, toId);
        });
        setFeedback(null);
    };

    const toggleEnabled = (id) => {
        setDoc((prev) => {
            if (!prev) return prev;
            const screens = prev.screens.map((s) =>
                s.id === id ? { ...s, enabled: !s.enabled } : s,
            );
            return { ...prev, screens };
        });
        setFeedback(null);
    };

    const handleSave = async () => {
        if (!doc) return;
        setSaving(true);
        setFeedback(null);
        try {
            const saved = await saveDisplayScreens(doc);
            if (!mountedRef.current) return;
            setDoc(saved);
            setFeedback({ type: 'ok', text: 'Pantallas guardadas correctamente.' });
        } catch (err) {
            if (!mountedRef.current) return;
            setFeedback({ type: 'error', text: err.message || 'No se pudo guardar.' });
        } finally {
            if (mountedRef.current) setSaving(false);
        }
    };

    // ── Render ───────────────────────────────────────────────
    if (status === 'loading' || !doc || !activeScreen) {
        return (
            <div style={styles.center}>
                <span style={styles.centerText}>Cargando configurador…</span>
            </div>
        );
    }

    return (
        <div style={styles.wrapper}>
            {/* ── Encabezado ── */}
            <div style={styles.header}>
                <button onClick={onBack} style={styles.backBtn}>← Regresar</button>
                <h1 style={styles.title}>Configurador de Display</h1>
                <div style={styles.headerActions}>
                    {feedback && (
                        <span
                            style={{
                                ...styles.feedback,
                                color: feedback.type === 'ok' ? '#16a34a' : '#dc2626',
                            }}
                        >
                            {feedback.text}
                        </span>
                    )}
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        style={{ ...styles.saveBtn, opacity: saving ? 0.5 : 1 }}
                    >
                        {saving ? 'Guardando…' : 'Guardar cambios'}
                    </button>
                </div>
            </div>

            {/* ── Pestañas de pantalla ── */}
            <div style={styles.tabs}>
                {screens.slice(0, MAX_SCREENS).map((s) => (
                    <button
                        key={s.id}
                        onClick={() => setActiveId(s.id)}
                        style={{
                            ...styles.tab,
                            ...(s.id === activeId ? styles.tabActive : null),
                        }}
                    >
                        <span style={styles.tabName}>{s.name}</span>
                        <span
                            onClick={(e) => { e.stopPropagation(); toggleEnabled(s.id); }}
                            style={{
                                ...styles.tabDot,
                                background: s.enabled ? '#16a34a' : '#d4d4d4',
                            }}
                            title={s.enabled ? 'Habilitada' : 'Deshabilitada'}
                        />
                    </button>
                ))}
            </div>

            {/* ── Cuerpo: controles + vista previa ── */}
            <div style={styles.body}>
                <div style={styles.controlsCol}>
                    <label style={styles.nameField}>
                        <span style={styles.nameLabel}>Nombre de la pantalla</span>
                        <input
                            type="text"
                            value={activeScreen.name}
                            onChange={(e) => renameScreen(e.target.value)}
                            style={styles.nameInput}
                        />
                    </label>
                    <DisplayConfigControls
                        screen={activeScreen}
                        onChange={patchActiveScreen}
                    />
                    <DisplayTemplateControls
                        doc={doc}
                        activeScreen={activeScreen}
                        viewModel={viewModel}
                        onApplyTemplate={handleApplyTemplate}
                        onImportScreen={handleImportScreen}
                        onDuplicate={handleDuplicate}
                    />
                </div>

                <div style={styles.previewCol}>
                    <DisplayPreciosPreview
                        viewModel={viewModel}
                        screen={activeScreen}
                    />
                </div>
            </div>
        </div>
    );
};

// ─────────────────────────────────────────────────────────────
// Estilos — B&W editorial
// ─────────────────────────────────────────────────────────────
const styles = {
    wrapper: {
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: '#ffffff',
        fontFamily: "'Inter', sans-serif",
    },
    center: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        background: '#ffffff',
    },
    centerText: {
        fontSize: '14px',
        fontWeight: '700',
        color: '#6b6b6b',
    },
    header: {
        display: 'flex',
        alignItems: 'center',
        gap: '20px',
        padding: '16px 32px',
        borderBottom: '1px solid #0f0f0f',
    },
    backBtn: {
        background: 'transparent',
        border: '1px solid #0f0f0f',
        color: '#0f0f0f',
        padding: '8px 16px',
        fontSize: '12px',
        fontWeight: '700',
        cursor: 'pointer',
    },
    title: {
        margin: 0,
        fontSize: '18px',
        fontWeight: '900',
        letterSpacing: '-0.3px',
        color: '#0f0f0f',
    },
    headerActions: {
        marginLeft: 'auto',
        display: 'flex',
        alignItems: 'center',
        gap: '14px',
    },
    feedback: {
        fontSize: '12px',
        fontWeight: '700',
    },
    saveBtn: {
        background: '#0f0f0f',
        color: '#ffffff',
        border: '1px solid #0f0f0f',
        padding: '10px 20px',
        fontSize: '12px',
        fontWeight: '800',
        letterSpacing: '0.5px',
        cursor: 'pointer',
    },
    tabs: {
        display: 'flex',
        gap: '0',
        borderBottom: '1px solid #e5e5e5',
        padding: '0 32px',
    },
    tab: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '12px 18px',
        background: 'transparent',
        border: 'none',
        borderBottom: '2px solid transparent',
        color: '#6b6b6b',
        fontSize: '13px',
        fontWeight: '700',
        cursor: 'pointer',
    },
    tabActive: {
        color: '#0f0f0f',
        borderBottom: '2px solid #0f0f0f',
    },
    tabName: {
        whiteSpace: 'nowrap',
    },
    tabDot: {
        width: '8px',
        height: '8px',
        borderRadius: '50%',
        display: 'inline-block',
    },
    body: {
        flex: 1,
        display: 'grid',
        gridTemplateColumns: 'minmax(320px, 420px) 1fr',
        gap: '0',
        overflow: 'hidden',
    },
    controlsCol: {
        overflowY: 'auto',
        padding: '20px 32px',
        borderRight: '1px solid #e5e5e5',
    },
    nameField: {
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        paddingBottom: '16px',
    },
    nameLabel: {
        fontSize: '11px',
        fontWeight: '900',
        letterSpacing: '1.5px',
        textTransform: 'uppercase',
        color: '#0f0f0f',
    },
    nameInput: {
        width: '100%',
        padding: '10px 12px',
        border: '1px solid #0f0f0f',
        fontSize: '14px',
        fontWeight: '700',
        fontFamily: "'Inter', sans-serif",
        color: '#0f0f0f',
        boxSizing: 'border-box',
    },
    previewCol: {
        overflowY: 'auto',
        padding: '20px 32px',
        background: '#fafafa',
    },
};
