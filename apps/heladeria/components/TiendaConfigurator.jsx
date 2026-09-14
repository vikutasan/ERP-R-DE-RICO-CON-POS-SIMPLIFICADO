/**
 * TiendaConfigurator.jsx — Configurador visual de doble columna (V14, Fase 14.2).
 * Estética editorial B&W: fondo blanco, divisores lineales, tipografía ultra-bold.
 *
 * Columna IZQUIERDA: pasos del armado (base → tamaño → sabores → toppings → extras).
 * Columna DERECHA: resumen en vivo (ConfiguratorSummary).
 *
 * BLINDAJE (prohibiciones absolutas del POS):
 *   - SIN `setInterval` / auto-save / timers.
 *   - SIN animaciones CSS infinitas.
 *   - SIN leer estado en callbacks async (todo es síncrono y local).
 *   - Toda la lógica de negocio vive en `utils/tiendaConfigurator.js` (puro).
 *
 * Responsive: en pantallas < 768px colapsa a una sola columna con tabs.
 */
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useHeladeriaMenu } from '../hooks/useHeladeriaMenu';
import { useTiendaCajaMode, TIENDA_MODES } from '../hooks/useTiendaCajaMode';
import { FlavorGrid } from './FlavorGrid';
import { ConfiguratorSummary } from './ConfiguratorSummary';
import {
    CONFIGURATOR_STEPS,
    STEP_LABELS,
    DEFAULT_CONFIGURATOR_STATE,
    getMenuItemsByType,
    getMaxSabores,
    getMaxToppings,
    canAdvanceStep,
    advanceStep,
    goBackStep,
    goToStep,
    selectBase,
    selectTamano,
    addFlavor,
    removeFlavor,
    toggleTopping,
    toggleExtra,
    setRecipientName,
    computeUnitPrice,
    validateConfiguratorState,
    buildPreComandaPayload,
    buildItemLabel,
} from '../utils/tiendaConfigurator';

const money = (n) => `$${(Number(n) || 0).toFixed(2)}`;

/** Tarjeta seleccionable genérica — estética editorial B&W */
const OpcionCard = ({ item, selected, onClick, disabled }) => (
    <button
        onClick={() => !disabled && onClick(item)}
        disabled={disabled}
        style={{
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '6px',
            padding: '24px 10px 16px',
            minHeight: '100px',
            cursor: disabled ? 'not-allowed' : 'pointer',
            background: selected ? '#0f0f0f' : '#ffffff',
            border: 'none',
            borderRight: '1px solid #e5e7eb',
            borderBottom: '1px solid #e5e7eb',
            opacity: disabled ? 0.4 : 1,
            transition: 'background 0.15s ease',
        }}
    >
        {/* Price badge */}
        <span style={{
            position: 'absolute', top: '8px', right: '8px',
            background: selected ? '#ffffff' : '#0f0f0f',
            color: selected ? '#0f0f0f' : '#ffffff',
            fontSize: '10px', fontWeight: '800',
            padding: '2px 8px', borderRadius: '100px',
        }}>
            {money(item.base_price !== null && item.base_price !== undefined ? item.base_price : item.price)}
        </span>
        <span style={{ fontSize: '28px', lineHeight: 1 }}>
            {item.image ? '🍨' : '🍦'}
        </span>
        <span style={{
            fontSize: '11px', fontWeight: '800',
            color: selected ? '#ffffff' : '#0f0f0f',
            textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.3px',
        }}>
            {item.name}
        </span>
        {item.max_scoops ? (
            <span style={{ fontSize: '9px', color: selected ? '#9ca3af' : '#9ca3af' }}>
                hasta {item.max_scoops} bolas
            </span>
        ) : null}
        {selected && (
            <span style={{
                position: 'absolute', bottom: '8px', right: '8px',
                color: '#ffffff', fontSize: '14px', fontWeight: '900',
            }}>✓</span>
        )}
    </button>
);

const Grid = ({ children }) => (
    <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
    }}>
        {children}
    </div>
);

export function TiendaConfigurator({ onBack, onPreComandaReady, onCajaHabilitada, onCajaDeshabilitada }) {
    const { menu, loading, error, refresh } = useHeladeriaMenu();
    const [state, setState] = useState(DEFAULT_CONFIGURATOR_STATE);
    const [submitting, setSubmitting] = useState(false);
    const [feedback, setFeedback] = useState(null);
    const [isNarrow, setIsNarrow] = useState(
        typeof window !== 'undefined' ? window.innerWidth < 768 : false,
    );

    // Fase 14.3: switch Kiosco/Caja.
    const caja = useTiendaCajaMode({ onCajaHabilitada, onCajaDeshabilitada });

    // Detección de ancho (listener, NO timer).
    useEffect(() => {
        const onResize = () => setIsNarrow(window.innerWidth < 768);
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    // ─── Datos derivados del menú ───
    const recipientes = useMemo(() => getMenuItemsByType(menu, 'RECIPIENTE'), [menu]);
    const tamanos = useMemo(() => getMenuItemsByType(menu, 'TAMAÑO'), [menu]);
    const sabores = useMemo(() => getMenuItemsByType(menu, 'SABOR'), [menu]);
    const extras = useMemo(() => getMenuItemsByType(menu, 'EXTRA'), [menu]);

    const maxSabores = useMemo(() => getMaxSabores(state), [state]);
    const maxToppings = useMemo(() => getMaxToppings(menu), [menu]);
    const unitPrice = useMemo(() => computeUnitPrice(state, menu), [state, menu]);
    const validation = useMemo(() => validateConfiguratorState(state), [state]);
    const currentStep = CONFIGURATOR_STEPS[state.stepIndex];
    const advanceCheck = useMemo(() => canAdvanceStep(state, currentStep), [state, currentStep]);

    // ─── Acciones (síncronas) ───
    const handleSelectBase = useCallback((item) => setState((s) => selectBase(s, item)), []);
    const handleSelectTamano = useCallback((item) => setState((s) => selectTamano(s, item)), []);
    const handleAddFlavor = useCallback(
        (item) => setState((s) => addFlavor(s, item, getMaxSabores(s))), [],
    );
    const handleRemoveFlavor = useCallback(
        (item) => setState((s) => removeFlavor(s, item.config_id)), [],
    );
    const handleToggleTopping = useCallback(
        (item) => setState((s) => toggleTopping(s, item, maxToppings)), [maxToppings],
    );
    const handleToggleExtra = useCallback(
        (item) => setState((s) => toggleExtra(s, item, maxToppings)), [maxToppings],
    );
    const handleNext = useCallback(() => setState((s) => advanceStep(s)), []);
    const handleBack = useCallback(() => setState((s) => goBackStep(s)), []);
    const handleGoTo = useCallback((stepId) => setState((s) => goToStep(s, stepId)), []);
    const handleClear = useCallback(() => { setState(DEFAULT_CONFIGURATOR_STATE); setFeedback(null); }, []);

    // ─── Envío de la pre-comanda ───
    const handleSubmit = useCallback(async () => {
        const payload = buildPreComandaPayload(state, menu, { recipientName: state.recipientName });
        if (!payload.ok) {
            setFeedback({ tipo: 'error', texto: payload.errors.join(' · ') });
            return;
        }
        setSubmitting(true);
        setFeedback(null);
        try {
            if (onPreComandaReady) {
                await onPreComandaReady({
                    ...payload.item,
                    label: buildItemLabel(state),
                    // Fase 14.3: el modo viaja con la pre-comanda.
                    mode: caja.mode,
                });
            }
            setFeedback({
                tipo: 'ok',
                texto: caja.isCajaEnabled
                    ? 'Pre-comanda lista para cobro en Caja'
                    : 'Pre-comanda enviada a cocina',
            });
            setState(DEFAULT_CONFIGURATOR_STATE);
        } catch (err) {
            setFeedback({ tipo: 'error', texto: err?.message || 'No se pudo enviar la pre-comanda' });
        } finally {
            setSubmitting(false);
        }
    }, [state, menu, onPreComandaReady, caja.mode, caja.isCajaEnabled]);

    // ─── Render del paso activo ───
    const renderPaso = () => {
        if (loading) {
            return <div style={{ color: '#9ca3af', fontSize: '13px', padding: '20px' }}>Cargando menú…</div>;
        }
        if (error) {
            return (
                <div style={{ color: '#ef4444', fontSize: '13px', padding: '20px' }}>
                    No se pudo cargar el menú: {error}
                    <button onClick={refresh} style={{
                        marginLeft: '10px', background: '#0f0f0f', border: 'none',
                        color: '#ffffff', borderRadius: '100px', padding: '4px 12px',
                        cursor: 'pointer', fontWeight: '700', fontSize: '11px',
                    }}>
                        Reintentar
                    </button>
                </div>
            );
        }

        switch (currentStep) {
            case 'base':
                return (
                    <Grid>
                        {recipientes.map((r) => (
                            <OpcionCard key={r.config_id} item={r}
                                selected={state.base?.config_id === r.config_id}
                                onClick={handleSelectBase} disabled={!r.is_available} />
                        ))}
                    </Grid>
                );
            case 'tamano':
                return (
                    <Grid>
                        {tamanos.map((t) => (
                            <OpcionCard key={t.config_id} item={t}
                                selected={state.tamano?.config_id === t.config_id}
                                onClick={handleSelectTamano} disabled={!t.is_available} />
                        ))}
                    </Grid>
                );
            case 'sabores':
                return (
                    <div>
                        <div style={{ fontSize: '11px', color: '#9ca3af', padding: '10px 16px', borderBottom: '1px solid #f3f4f6' }}>
                            Máximo {maxSabores} bola{maxSabores === 1 ? '' : 's'} según el recipiente.
                        </div>
                        <FlavorGrid
                            sabores={sabores}
                            onSelect={handleAddFlavor}
                            selectedBolas={state.sabores}
                            maxBolas={maxSabores}
                        />
                    </div>
                );
            case 'toppings':
                return (
                    <Grid>
                        {extras.map((e) => (
                            <OpcionCard key={e.config_id} item={e}
                                selected={state.toppings.some((t) => t.config_id === e.config_id)}
                                onClick={handleToggleTopping} disabled={!e.is_available} />
                        ))}
                    </Grid>
                );
            case 'extras':
                return (
                    <Grid>
                        {extras.map((e) => (
                            <OpcionCard key={e.config_id} item={e}
                                selected={state.extras.some((x) => x.config_id === e.config_id)}
                                onClick={handleToggleExtra} disabled={!e.is_available} />
                        ))}
                    </Grid>
                );
            default:
                return null;
        }
    };

    // ─── Tabs (solo en pantallas angostas) ───
    const renderTabs = () => (
        <div style={{ display: 'flex', overflowX: 'auto', borderBottom: '1px solid #e5e7eb' }}>
            {CONFIGURATOR_STEPS.map((stepId, idx) => {
                const active = idx === state.stepIndex;
                return (
                    <button key={stepId} onClick={() => handleGoTo(stepId)} style={{
                        flex: '0 0 auto', padding: '10px 14px',
                        cursor: 'pointer', fontSize: '11px', fontWeight: '800',
                        textTransform: 'uppercase', letterSpacing: '0.5px',
                        background: active ? '#0f0f0f' : '#ffffff',
                        color: active ? '#ffffff' : '#9ca3af',
                        border: 'none', borderRight: '1px solid #e5e7eb',
                    }}>
                        {idx + 1}. {STEP_LABELS[stepId]}
                    </button>
                );
            })}
        </div>
    );

    const NavButtons = ({ compact = false }) => (
        <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={handleBack} disabled={state.stepIndex === 0} style={{
                padding: compact ? '10px 16px' : '8px 16px',
                borderRadius: '100px', background: 'transparent',
                border: '1px solid #d1d5db',
                color: state.stepIndex === 0 ? '#d1d5db' : '#374151',
                cursor: state.stepIndex === 0 ? 'not-allowed' : 'pointer',
                fontWeight: '700', fontSize: '12px',
                flex: compact ? 1 : undefined,
            }}>← Atrás</button>
            <button
                onClick={handleNext}
                disabled={!advanceCheck.ok || state.stepIndex === CONFIGURATOR_STEPS.length - 1}
                style={{
                    padding: compact ? '10px 16px' : '8px 16px',
                    borderRadius: '100px', border: 'none',
                    background: advanceCheck.ok && state.stepIndex < CONFIGURATOR_STEPS.length - 1
                        ? '#0f0f0f' : '#f3f4f6',
                    color: advanceCheck.ok && state.stepIndex < CONFIGURATOR_STEPS.length - 1
                        ? '#ffffff' : '#9ca3af',
                    cursor: advanceCheck.ok && state.stepIndex < CONFIGURATOR_STEPS.length - 1
                        ? 'pointer' : 'not-allowed',
                    fontWeight: '800', fontSize: '12px',
                    flex: compact ? 1 : undefined,
                }}
            >Siguiente →</button>
        </div>
    );

    const columnaIzquierda = (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
            {isNarrow && renderTabs()}

            {/* Step header */}
            <div style={{
                display: 'flex', alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 16px',
                borderBottom: '1px solid #e5e7eb',
            }}>
                <div>
                    <div style={{
                        fontSize: '9px', fontWeight: '800', letterSpacing: '2px',
                        textTransform: 'uppercase', color: '#9ca3af',
                    }}>
                        Paso {state.stepIndex + 1} de {CONFIGURATOR_STEPS.length}
                    </div>
                    <div style={{ fontSize: '1.1rem', fontWeight: '900', color: '#0f0f0f', marginTop: '2px' }}>
                        {STEP_LABELS[currentStep]}
                    </div>
                </div>
                {!isNarrow && <NavButtons />}
            </div>

            <div style={{ flex: 1, overflowY: 'auto' }}>{renderPaso()}</div>

            {/* Nombre integrante */}
            <div style={{ padding: '12px 16px', borderTop: '1px solid #e5e7eb' }}>
                <input
                    type="text"
                    value={state.recipientName}
                    onChange={(e) => setState((s) => setRecipientName(s, e.target.value))}
                    placeholder="Nombre del integrante (opcional)"
                    style={{
                        width: '100%', padding: '10px 14px', borderRadius: '8px',
                        background: '#f9fafb', border: '1px solid #e5e7eb',
                        color: '#0f0f0f', fontSize: '13px', outline: 'none',
                        boxSizing: 'border-box',
                    }}
                />
            </div>

            {!advanceCheck.ok && (
                <div style={{ padding: '0 16px 10px', fontSize: '12px', color: '#9ca3af', fontWeight: '600' }}>
                    {advanceCheck.reason}
                </div>
            )}

            {isNarrow && (
                <div style={{ padding: '12px 16px', borderTop: '1px solid #0f0f0f' }}>
                    <NavButtons compact />
                </div>
            )}
        </div>
    );

    return (
        <div style={{
            height: '100%', display: 'flex', flexDirection: 'column',
            background: '#ffffff', fontFamily: "'Inter', sans-serif",
        }}>
            {/* Header */}
            <div style={{
                padding: '0 24px', display: 'flex', alignItems: 'center',
                gap: '16px', borderBottom: '1px solid #0f0f0f', minHeight: '56px',
            }}>
                <button onClick={onBack} style={{
                    background: 'none', border: '1px solid #d1d5db', color: '#6b7280',
                    padding: '6px 16px', borderRadius: '100px', cursor: 'pointer',
                    fontWeight: '700', fontSize: '12px',
                }}>← Regresar</button>
                <h1 style={{
                    margin: 0, fontSize: '13px', fontWeight: '900',
                    color: '#0f0f0f', textTransform: 'uppercase', letterSpacing: '3px',
                }}>Tienda Interactiva</h1>

                {/* Fase 14.3: switch Kiosco/Caja — indicador ESTÁTICO (sin animaciones). */}
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{
                        fontSize: '10px', fontWeight: '800', letterSpacing: '1px',
                        textTransform: 'uppercase',
                        color: caja.isCajaEnabled ? '#166534' : '#9ca3af',
                    }}>
                        {caja.isCajaEnabled ? 'Modo Caja' : 'Modo Kiosco'}
                    </span>
                    <button
                        onClick={() => caja.toggleCaja()}
                        style={{
                            padding: '6px 16px', borderRadius: '100px', cursor: 'pointer',
                            fontWeight: '800', fontSize: '11px',
                            background: caja.isCajaEnabled ? '#0f0f0f' : '#ffffff',
                            color: caja.isCajaEnabled ? '#ffffff' : '#0f0f0f',
                            border: '1px solid #0f0f0f',
                            textTransform: 'uppercase', letterSpacing: '0.5px',
                        }}
                    >
                        {caja.isCajaEnabled ? 'Volver a Kiosco' : 'Habilitar como Caja'}
                    </button>
                </div>
            </div>

            {/* Feedback */}
            {feedback && (
                <div style={{
                    margin: '12px 24px 0', padding: '10px 14px', borderRadius: '8px',
                    fontSize: '12px', fontWeight: '700',
                    background: feedback.tipo === 'ok' ? '#f0fdf4' : '#fef2f2',
                    border: feedback.tipo === 'ok' ? '1px solid #bbf7d0' : '1px solid #fecaca',
                    color: feedback.tipo === 'ok' ? '#166534' : '#b91c1c',
                }}>
                    {feedback.texto}
                </div>
            )}

            {/* Cuerpo: doble columna */}
            <div style={{
                flex: 1,
                display: 'grid',
                gridTemplateColumns: isNarrow ? '1fr' : 'minmax(0, 1.6fr) minmax(280px, 1fr)',
                gap: '0',
                overflow: 'hidden',
                borderTop: feedback ? '1px solid #e5e7eb' : 'none',
                marginTop: feedback ? '12px' : '0',
            }}>
                <div style={{ borderRight: isNarrow ? 'none' : '1px solid #0f0f0f', overflow: 'hidden' }}>
                    {columnaIzquierda}
                </div>
                <div style={{ padding: '16px', overflow: 'hidden' }}>
                    <ConfiguratorSummary
                        state={state}
                        unitPrice={unitPrice}
                        maxSabores={maxSabores}
                        canSubmit={validation.ok}
                        submitting={submitting}
                        onSubmit={handleSubmit}
                        onRemoveFlavor={handleRemoveFlavor}
                        onRemoveTopping={handleToggleTopping}
                        onRemoveExtra={handleToggleExtra}
                        onClear={handleClear}
                        submitLabel={caja.isCajaEnabled ? 'Enviar a Caja' : 'Agregar a la pre-comanda'}
                    />
                </div>
            </div>
        </div>
    );
}

export default TiendaConfigurator;
