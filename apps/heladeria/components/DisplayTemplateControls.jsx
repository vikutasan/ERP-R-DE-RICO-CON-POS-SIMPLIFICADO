import React, { useRef, useState } from 'react';
import { applyTemplate } from '../utils/displayTemplates';
import {
    exportScreenToJson,
    importScreen,
    duplicateScreenConfig,
} from '../utils/displayConfigIO';
import { renderPdf } from '../utils/pdfRenderer';
import { DisplayTemplatePicker } from './DisplayTemplatePicker';

/**
 * DisplayTemplateControls — Plantillas, import/export y PDF (V8, §5.14–5.16).
 *
 * Agrupa las acciones "de archivo" del Configurador:
 *   1. Elegir plantilla (aplica `applyTemplate` sobre la pantalla activa).
 *   2. Exportar la pantalla a JSON (respaldo / compartir).
 *   3. Importar una pantalla desde JSON.
 *   4. Duplicar una pantalla a otra ranura.
 *   5. Descargar el PDF vectorial para el taller de imprenta.
 *
 * IMPORTANTE: NO imprime. Solo genera un archivo PDF descargable.
 * Esta herramienta NO toca ninguna impresora (ni las térmicas del POS).
 *
 * @param {object}   props.doc           Documento completo de pantallas.
 * @param {object}   props.activeScreen  Pantalla en edición.
 * @param {object}   props.viewModel     ViewModel para el PDF.
 * @param {function} props.onApplyTemplate (templateKey) => void.
 * @param {function} props.onImportScreen  (screen) => void.
 * @param {function} props.onDuplicate     (fromId, toId) => void.
 * @param {boolean}  [props.disabled=false]
 */
export function DisplayTemplateControls({
    doc,
    activeScreen,
    viewModel,
    onApplyTemplate,
    onImportScreen,
    onDuplicate,
    disabled = false,
}) {
    const fileRef = useRef(null);
    const [feedback, setFeedback] = useState(null);
    const [busy, setBusy] = useState(false);

    const handleExport = () => {
        try {
            const json = exportScreenToJson(activeScreen);
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `pantalla-${activeScreen.id}.json`;
            a.click();
            URL.revokeObjectURL(url);
            setFeedback({ type: 'ok', text: 'Pantalla exportada.' });
        } catch {
            setFeedback({ type: 'error', text: 'No se pudo exportar.' });
        }
    };

    const handleImportClick = () => fileRef.current?.click();

    const handleFileChange = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const text = await file.text();
            const result = importScreen(text);
            if (!result.ok) {
                setFeedback({ type: 'error', text: result.error });
                return;
            }
            onImportScreen(result.screen);
            setFeedback({ type: 'ok', text: 'Pantalla importada.' });
        } catch {
            setFeedback({ type: 'error', text: 'Archivo inválido.' });
        } finally {
            if (fileRef.current) fileRef.current.value = '';
        }
    };

    const handleDuplicate = () => {
        const screens = Array.isArray(doc?.screens) ? doc.screens : [];
        const target = screens.find((s) => s.id !== activeScreen.id);
        if (!target) {
            setFeedback({ type: 'error', text: 'No hay otra ranura disponible.' });
            return;
        }
        onDuplicate(activeScreen.id, target.id);
        setFeedback({ type: 'ok', text: `Duplicada a "${target.name}".` });
    };

    const handlePdf = () => {
        if (!viewModel || viewModel.isEmpty) {
            setFeedback({ type: 'error', text: 'No hay productos para exportar.' });
            return;
        }
        setBusy(true);
        setFeedback(null);
        try {
            const { fileName, pageCount } = renderPdf(viewModel, activeScreen);
            setFeedback({
                type: 'ok',
                text: `PDF generado: ${fileName} (${pageCount} pág.).`,
            });
        } catch {
            setFeedback({ type: 'error', text: 'No se pudo generar el PDF.' });
        } finally {
            setBusy(false);
        }
    };

    return (
        <div style={styles.wrapper}>
            <DisplayTemplatePicker
                value={activeScreen.template || null}
                onSelect={onApplyTemplate}
                disabled={disabled}
            />

            <div style={styles.actions}>
                <button
                    type="button"
                    onClick={handlePdf}
                    disabled={disabled || busy}
                    style={{ ...styles.btnPrimary, opacity: busy ? 0.5 : 1 }}
                >
                    {busy ? 'Generando…' : '⬇️ Descargar PDF para imprenta'}
                </button>
                <button
                    type="button"
                    onClick={handleExport}
                    disabled={disabled}
                    style={styles.btnGhost}
                >
                    Exportar JSON
                </button>
                <button
                    type="button"
                    onClick={handleImportClick}
                    disabled={disabled}
                    style={styles.btnGhost}
                >
                    Importar JSON
                </button>
                <button
                    type="button"
                    onClick={handleDuplicate}
                    disabled={disabled}
                    style={styles.btnGhost}
                >
                    Duplicar a otra ranura
                </button>
                <input
                    ref={fileRef}
                    type="file"
                    accept="application/json,.json"
                    onChange={handleFileChange}
                    style={styles.hiddenInput}
                />
            </div>

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

            <p style={styles.note}>
                El PDF es vectorial y está listo para enviar a un taller de imprenta.
                Esta herramienta no imprime ni toca ninguna impresora del negocio.
            </p>
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
        gap: '14px',
        paddingTop: '16px',
        borderTop: '1px solid #e5e5e5',
    },
    actions: {
        display: 'flex',
        flexWrap: 'wrap',
        gap: '8px',
    },
    btnPrimary: {
        background: '#0f0f0f',
        color: '#ffffff',
        border: '1px solid #0f0f0f',
        padding: '10px 16px',
        fontSize: '12px',
        fontWeight: '800',
        letterSpacing: '0.3px',
        cursor: 'pointer',
        fontFamily: "'Inter', sans-serif",
    },
    btnGhost: {
        background: '#ffffff',
        color: '#0f0f0f',
        border: '1px solid #0f0f0f',
        padding: '10px 16px',
        fontSize: '12px',
        fontWeight: '700',
        cursor: 'pointer',
        fontFamily: "'Inter', sans-serif",
    },
    hiddenInput: {
        display: 'none',
    },
    feedback: {
        fontSize: '12px',
        fontWeight: '700',
    },
    note: {
        margin: 0,
        fontSize: '11px',
        lineHeight: 1.5,
        color: '#6b6b6b',
    },
};
