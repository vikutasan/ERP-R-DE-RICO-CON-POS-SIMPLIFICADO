/**
 * TiendaConfigurator.jsx — Configurador visual de doble columna (V14, Fase 14.2).
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

/** Tarjeta seleccionable genérica (recipiente, tamaño, topping, extra). */
const OpcionCard = ({ item, selected, onClick, disabled }) => (
    <button
        onClick={() => !disabled && onClick(item)}
        disabled={disabled}
        style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '6px',
            padding: '14px 10px',
            minHeight: '86px',
            borderRadius: '14px',
            cursor: disabled ? 'not-allowed' : 'pointer',
            background: selected
                ? 'linear-gradient(135deg, rgba(244,114,182,0.25), rgba(192,132,252,0.25))'
                : 'rgba(255,255,255,0.04)',
            border: selected ? '2px solid #f472b6' : '2px solid rgba(255,255,255,0.08)',
            opacity: disabled ? 0.4 : 1,
            transition: 'all 0.2s ease',
        }}
    >
        <span style={{ fontSize: '22px' }}>{item.image ? '🍨' : '🍦'}</span>
        <span style={{
            fontSize: '11px',
            fontWeight: '800',
            color: '#f9fafb',
            textAlign: 'center',
            textTransform: 'uppercase',
            letterSpacing: '0.3px',
        }}>
            {item.name}
        </span>
        <span style={{ fontSize: '11px', color: '#f472b6', fontWeight: '700' }}>
            {money(item.base_price !== null && item.base_price !== undefined ? item.base_price : item.price)}
        </span>
        {item.max_scoops ? (
            <span style={{ fontSize: '9px', color: '#9ca3af' }}>
                hasta {item.max_scoops} bolas
            </span>
        ) : null}
    </button>
);

const Grid = ({ children }) => (
    <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
        gap: '10px',
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

    // Fase 14.3: switch Kiosco/Caja. Replica el contrato de GestorDeCaja
    // (onCajaHabilitada / onCajaDeshabilitada) SIN importarlo. NO toca terminal_locks.
    const caja = useTiendaCajaMode({ onCajaHabilitada, onCajaDeshabilitada });

    // Detección de ancho (listener, NO timer). Se limpia al desmontar.
    useEffect(() => {
        const onResize = () => setIsNarrow(window.innerWidth < 768);
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    // ─── Datos derivados del menú (fuente de verdad: Gestión de Productos) ───
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

    // ─── Acciones (todas síncronas, sin efectos colaterales de red) ───
    const handleSelectBase = useCallback((item) => setState((s) => selectBase(s, item)), []);
    const handleSelectTamano = useCallback((item) => setState((s) => selectTamano(s, item)), []);
    const handleAddFlavor = useCallback(
        (item) => setState((s) => addFlavor(s, item, getMaxSabores(s))),
        [],
    );
    const handleRemoveFlavor = useCallback(
        (item) => setState((s) => removeFlavor(s, item.config_id)),
        [],
    );
    const handleToggleTopping = useCallback(
        (item) => setState((s) => toggleTopping(s, item, maxToppings)),
        [maxToppings],
    );
    const handleToggleExtra = useCallback(
        (item) => setState((s) => toggleExtra(s, item, maxToppings)),
        [maxToppings],
    );
    const handleNext = useCallback(() => setState((s) => advanceStep(s)), []);
    const handleBack = useCallback(() => setState((s) => goBackStep(s)), []);
    const handleGoTo = useCallback((stepId) => setState((s) => goToStep(s, stepId)), []);
    const handleClear = useCallback(() => {
        setState(DEFAULT_CONFIGURATOR_STATE);
        setFeedback(null);
    }, []);

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
            // El canal 'HELADERIA' lo garantiza el backend de forma atómica (Fase 14.4).
            // Aquí solo se delega al padre, que conoce la sesión/terminal.
            if (onPreComandaReady) {
                await onPreComandaReady({
                    ...payload.item,
                    label: buildItemLabel(state),
                    // Fase 14.3: el modo viaja con la pre-comanda para que el
                    // consumidor decida si va directo al KDS (Kiosco) o pasa a cobro (Caja).
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

    // ─── Render de la columna izquierda según el paso ───
    const renderPaso = () => {
        if (loading) {
            return <div style={{ color: '#9ca3af', fontSize: '13px' }}>Cargando menú…</div>;
        }
        if (error) {
            return (
                <div style={{ color: '#f87171', fontSize: '13px' }}>
                    No se pudo cargar el menú: {error}
                    <button
                        onClick={refresh}
                        style={{
                            marginLeft: '10px',
                            background: 'rgba(244,114,182,0.15)',
                            border: '1px solid rgba(244,114,182,0.3)',
                            color: '#f472b6',
                            borderRadius: '8px',
                            padding: '4px 10px',
                            cursor: 'pointer',
                            fontWeight: '700',
                            fontSize: '11px',
                        }}
                    >
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
                            <OpcionCard
                                key={r.config_id}
                                item={r}
                                selected={state.base?.config_id === r.config_id}
                                onClick={handleSelectBase}
                                disabled={!r.is_available}
                            />
                        ))}
                    </Grid>
                );
            case 'tamano':
                return (
                    <Grid>
                        {tamanos.map((t) => (
                            <OpcionCard
                                key={t.config_id}
                                item={t}
                                selected={state.tamano?.config_id === t.config_id}
                                onClick={handleSelectTamano}
                                disabled={!t.is_available}
                            />
                        ))}
                    </Grid>
                );
            case 'sabores':
                return (
                    <div>
                        <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '10px' }}>
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
                            <OpcionCard
                                key={e.config_id}
                                item={e}
                                selected={state.toppings.some((t) => t.config_id === e.config_id)}
                                onClick={handleToggleTopping}
                                disabled={!e.is_available}
                            />
                        ))}
                    </Grid>
                );
            case 'extras':
                return (
                    <Grid>
                        {extras.map((e) => (
                            <OpcionCard
                                key={e.config_id}
                                item={e}
                                selected={state.extras.some((x) => x.config_id === e.config_id)}
                                onClick={handleToggleExtra}
                                disabled={!e.is_available}
                            />
                        ))}
                    </Grid>
                );
            default:
                return null;
        }
    };

    // ─── Tabs (solo en pantallas angostas) ───
    const renderTabs = () => (
        <div style={{
            display: 'flex',
            gap: '6px',
            overflowX: 'auto',
            paddingBottom: '10px',
            marginBottom: '12px',
        }}>
            {CONFIGURATOR_STEPS.map((stepId, idx) => {
                const active = idx === state.stepIndex;
                return (
                    <button
                        key={stepId}
                        onClick={() => handleGoTo(stepId)}
                        style={{
                            flex: '0 0 auto',
                            padding: '8px 14px',
                            borderRadius: '20px',
                            cursor: 'pointer',
                            fontSize: '11px',
                            fontWeight: '800',
                            textTransform: 'uppercase',
                            letterSpacing: '0.5px',
                            background: active ? 'linear-gradient(135deg, #f472b6, #c084fc)' : 'rgba(255,255,255,0.05)',
                            color: active ? '#0a0a0a' : '#9ca3af',
                            border: active ? 'none' : '1px solid rgba(255,255,255,0.08)',
                        }}
                    >
                        {idx + 1}. {STEP_LABELS[stepId]}
                    </button>
                );
            })}
        </div>
    );

    const columnaIzquierda = (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {isNarrow && renderTabs()}

            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '14px',
            }}>
                <div>
                    <div style={{
                        fontSize: '10px',
                        fontWeight: '800',
                        letterSpacing: '1.5px',
                        textTransform: 'uppercase',
                        color: '#9ca3af',
                    }}>
                        Paso {state.stepIndex + 1} de {CONFIGURATOR_STEPS.length}
                    </div>
                    <div style={{
                        fontFamily: "'Playfair Display', serif",
                        fontSize: '1.3rem',
                        color: '#f9fafb',
                    }}>
                        {STEP_LABELS[currentStep]}
                    </div>
                </div>
                {!isNarrow && (
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                            onClick={handleBack}
                            disabled={state.stepIndex === 0}
                            style={{
                                padding: '8px 16px',
                                borderRadius: '10px',
                                background: 'transparent',
                                border: '1px solid rgba(255,255,255,0.12)',
                                color: state.stepIndex === 0 ? '#4b5563' : '#e5e7eb',
                                cursor: state.stepIndex === 0 ? 'not-allowed' : 'pointer',
                                fontWeight: '700',
                                fontSize: '12px',
                            }}
                        >
                            ← Atrás
                        </button>
                        <button
                            onClick={handleNext}
                            disabled={!advanceCheck.ok || state.stepIndex === CONFIGURATOR_STEPS.length - 1}
                            style={{
                                padding: '8px 16px',
                                borderRadius: '10px',
                                border: 'none',
                                background: advanceCheck.ok && state.stepIndex < CONFIGURATOR_STEPS.length - 1
                                    ? 'linear-gradient(135deg, #f472b6, #c084fc)'
                                    : 'rgba(255,255,255,0.06)',
                                color: advanceCheck.ok && state.stepIndex < CONFIGURATOR_STEPS.length - 1
                                    ? '#0a0a0a'
                                    : '#6b7280',
                                cursor: advanceCheck.ok && state.stepIndex < CONFIGURATOR_STEPS.length - 1
                                    ? 'pointer'
                                    : 'not-allowed',
                                fontWeight: '800',
                                fontSize: '12px',
                            }}
                        >
                            Siguiente →
                        </button>
                    </div>
                )}
            </div>

            <div style={{ flex: 1, overflowY: 'auto' }}>{renderPaso()}</div>

            {/* Nombre del integrante (opcional) */}
            <div style={{ marginTop: '14px' }}>
                <input
                    type="text"
                    value={state.recipientName}
                    onChange={(e) => setState((s) => setRecipientName(s, e.target.value))}
                    placeholder="Nombre del integrante (opcional)"
                    style={{
                        width: '100%',
                        padding: '10px 14px',
                        borderRadius: '10px',
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        color: '#f9fafb',
                        fontSize: '13px',
                        outline: 'none',
                    }}
                />
            </div>

            {!advanceCheck.ok && (
                <div style={{ marginTop: '10px', fontSize: '12px', color: '#fbbf24' }}>
                    {advanceCheck.reason}
                </div>
            )}

            {isNarrow && (
                <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                    <button
                        onClick={handleBack}
                        disabled={state.stepIndex === 0}
                        style={{
                            flex: 1,
                            padding: '12px',
                            borderRadius: '10px',
                            background: 'transparent',
                            border: '1px solid rgba(255,255,255,0.12)',
                            color: state.stepIndex === 0 ? '#4b5563' : '#e5e7eb',
                            cursor: state.stepIndex === 0 ? 'not-allowed' : 'pointer',
                            fontWeight: '700',
                            fontSize: '12px',
                        }}
                    >
                        ← Atrás
                    </button>
                    <button
                        onClick={handleNext}
                        disabled={!advanceCheck.ok || state.stepIndex === CONFIGURATOR_STEPS.length - 1}
                        style={{
                            flex: 1,
                            padding: '12px',
                            borderRadius: '10px',
                            border: 'none',
                            background: advanceCheck.ok && state.stepIndex < CONFIGURATOR_STEPS.length - 1
                                ? 'linear-gradient(135deg, #f472b6, #c084fc)'
                                : 'rgba(255,255,255,0.06)',
                            color: advanceCheck.ok && state.stepIndex < CONFIGURATOR_STEPS.length - 1
                                ? '#0a0a0a'
                                : '#6b7280',
                            cursor: advanceCheck.ok && state.stepIndex < CONFIGURATOR_STEPS.length - 1
                                ? 'pointer'
                                : 'not-allowed',
                            fontWeight: '800',
                            fontSize: '12px',
                        }}
                    >
                        Siguiente →
                    </button>
                </div>
            )}
        </div>
    );

    return (
        <div style={{
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            background: 'linear-gradient(135deg, #0a0a0a 0%, #1a0a1a 50%, #0a0a0a 100%)',
            fontFamily: "'Inter', sans-serif",
        }}>
            {/* Header */}
            <div style={{
                padding: '18px 26px',
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                borderBottom: '1px solid rgba(244,114,182,0.15)',
            }}>
                <button
                    onClick={onBack}
                    style={{
                        background: 'rgba(244,114,182,0.1)',
                        border: '1px solid rgba(244,114,182,0.2)',
                        color: '#f472b6',
                        padding: '10px 20px',
                        borderRadius: '12px',
                        cursor: 'pointer',
                        fontWeight: '700',
                        fontSize: '13px',
                    }}
                >
                    ← Regresar
                </button>
                <h1 style={{
                    margin: 0,
                    fontFamily: "'Playfair Display', serif",
                    fontSize: '1.5rem',
                    background: 'linear-gradient(135deg, #f472b6, #c084fc)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                }}>
                    Tienda Interactiva
                </h1>

                {/* Fase 14.3: switch Kiosco/Caja (contrato replicado de GestorDeCaja).
                    Indicador ESTÁTICO: sin animaciones infinitas (Incidente 16.1). */}
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{
                        fontSize: '10px',
                        fontWeight: '800',
                        letterSpacing: '1px',
                        textTransform: 'uppercase',
                        color: caja.isCajaEnabled ? '#4ade80' : '#9ca3af',
                    }}>
                        {caja.isCajaEnabled ? 'Modo Caja' : 'Modo Kiosco'}
                    </span>
                    <button
                        onClick={() => caja.toggleCaja()}
                        style={{
                            padding: '9px 16px',
                            borderRadius: '10px',
                            cursor: 'pointer',
                            fontWeight: '800',
                            fontSize: '12px',
                            background: caja.isCajaEnabled
                                ? 'linear-gradient(135deg, #22c55e, #16a34a)'
                                : 'rgba(255,255,255,0.06)',
                            color: caja.isCajaEnabled ? '#0a0a0a' : '#e5e7eb',
                            border: caja.isCajaEnabled ? 'none' : '1px solid rgba(255,255,255,0.12)',
                        }}
                    >
                        {caja.isCajaEnabled ? 'Volver a Kiosco' : 'Habilitar como Caja'}
                    </button>
                </div>
            </div>

            {/* Feedback */}
            {feedback && (
                <div style={{
                    margin: '12px 26px 0',
                    padding: '10px 14px',
                    borderRadius: '10px',
                    fontSize: '12px',
                    fontWeight: '700',
                    background: feedback.tipo === 'ok' ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
                    border: feedback.tipo === 'ok'
                        ? '1px solid rgba(34,197,94,0.3)'
                        : '1px solid rgba(239,68,68,0.3)',
                    color: feedback.tipo === 'ok' ? '#4ade80' : '#f87171',
                }}>
                    {feedback.texto}
                </div>
            )}

            {/* Cuerpo: doble columna (o una sola en móvil) */}
            <div style={{
                flex: 1,
                display: 'grid',
                gridTemplateColumns: isNarrow ? '1fr' : 'minmax(0, 1.6fr) minmax(280px, 1fr)',
                gap: '18px',
                padding: '18px 26px 26px',
                overflow: 'hidden',
            }}>
                {columnaIzquierda}
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
    );
}

export default TiendaConfigurator;
