/**
 * ConfiguratorSummary.jsx — Panel derecho del configurador (V14, Fase 14.2).
 *
 * Componente PRESENTACIONAL y AISLADO: no hace fetch, no tiene timers,
 * no tiene animaciones infinitas. Recibe el estado ya calculado y lo pinta.
 * Aislarlo facilita tests futuros y evita acoplar el resumen a la lógica.
 */
import React from 'react';

const money = (n) => `$${(Number(n) || 0).toFixed(2)}`;

/** Fila de un grupo de selección (sabores, toppings, extras). */
const FilaGrupo = ({ icono, titulo, items, vacio, onQuitar }) => (
    <div style={{ marginBottom: '14px' }}>
        <div style={{
            fontSize: '10px',
            fontWeight: '800',
            letterSpacing: '1.5px',
            textTransform: 'uppercase',
            color: '#9ca3af',
            marginBottom: '6px',
        }}>
            {icono} {titulo}
        </div>
        {items.length === 0 ? (
            <div style={{ fontSize: '12px', color: '#4b5563', fontStyle: 'italic' }}>{vacio}</div>
        ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {items.map((it) => (
                    <div
                        key={it.config_id}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '8px',
                            background: 'rgba(255,255,255,0.04)',
                            border: '1px solid rgba(255,255,255,0.07)',
                            borderRadius: '8px',
                            padding: '6px 10px',
                        }}
                    >
                        <span style={{ fontSize: '12px', color: '#e5e7eb', fontWeight: '600' }}>
                            {it.name}
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '11px', color: '#9ca3af' }}>{money(it.price)}</span>
                            {onQuitar && (
                                <button
                                    onClick={() => onQuitar(it)}
                                    title={`Quitar ${it.name}`}
                                    style={{
                                        background: 'rgba(239,68,68,0.12)',
                                        border: '1px solid rgba(239,68,68,0.25)',
                                        color: '#f87171',
                                        borderRadius: '6px',
                                        width: '20px',
                                        height: '20px',
                                        lineHeight: '1',
                                        cursor: 'pointer',
                                        fontSize: '12px',
                                        fontWeight: '900',
                                        padding: 0,
                                    }}
                                >
                                    ×
                                </button>
                            )}
                        </span>
                    </div>
                ))}
            </div>
        )}
    </div>
);

export function ConfiguratorSummary({
    state,
    unitPrice,
    maxSabores,
    canSubmit,
    submitting,
    onSubmit,
    onRemoveFlavor,
    onRemoveTopping,
    onRemoveExtra,
    onClear,
    submitLabel = 'Agregar a la pre-comanda',
}) {
    const sabores = state?.sabores || [];
    const toppings = state?.toppings || [];
    const extras = state?.extras || [];

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(244,114,182,0.15)',
            borderRadius: '16px',
            padding: '18px',
            overflowY: 'auto',
        }}>
            <div style={{
                fontFamily: "'Playfair Display', serif",
                fontSize: '1.1rem',
                color: '#f9fafb',
                marginBottom: '14px',
            }}>
                🧾 Tu helado
            </div>

            {/* Recipiente + tamaño */}
            <FilaGrupo
                icono="🍧"
                titulo="Recipiente"
                items={state?.base ? [state.base] : []}
                vacio="Sin elegir"
            />
            <FilaGrupo
                icono="📏"
                titulo="Tamaño"
                items={state?.tamano ? [state.tamano] : []}
                vacio="Sin elegir"
            />

            {/* Sabores con contador */}
            <div style={{ marginBottom: '14px' }}>
                <div style={{
                    fontSize: '10px',
                    fontWeight: '800',
                    letterSpacing: '1.5px',
                    textTransform: 'uppercase',
                    color: '#9ca3af',
                    marginBottom: '6px',
                }}>
                    🍨 Sabores ({sabores.length}/{maxSabores})
                </div>
                {sabores.length === 0 ? (
                    <div style={{ fontSize: '12px', color: '#4b5563', fontStyle: 'italic' }}>
                        Elige al menos uno
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {sabores.map((s) => (
                            <div
                                key={s.config_id}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    gap: '8px',
                                    background: 'rgba(255,255,255,0.04)',
                                    border: '1px solid rgba(255,255,255,0.07)',
                                    borderRadius: '8px',
                                    padding: '6px 10px',
                                }}
                            >
                                <span style={{ fontSize: '12px', color: '#e5e7eb', fontWeight: '600' }}>
                                    {s.name}
                                </span>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ fontSize: '11px', color: '#9ca3af' }}>{money(s.price)}</span>
                                    <button
                                        onClick={() => onRemoveFlavor && onRemoveFlavor(s)}
                                        title={`Quitar ${s.name}`}
                                        style={{
                                            background: 'rgba(239,68,68,0.12)',
                                            border: '1px solid rgba(239,68,68,0.25)',
                                            color: '#f87171',
                                            borderRadius: '6px',
                                            width: '20px',
                                            height: '20px',
                                            lineHeight: '1',
                                            cursor: 'pointer',
                                            fontSize: '12px',
                                            fontWeight: '900',
                                            padding: 0,
                                        }}
                                    >
                                        ×
                                    </button>
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <FilaGrupo
                icono="🍫"
                titulo="Toppings"
                items={toppings}
                vacio="Opcional"
                onQuitar={onRemoveTopping}
            />
            <FilaGrupo
                icono="✨"
                titulo="Extras"
                items={extras}
                vacio="Opcional"
                onQuitar={onRemoveExtra}
            />

            {/* Total */}
            <div style={{
                marginTop: 'auto',
                paddingTop: '14px',
                borderTop: '1px solid rgba(255,255,255,0.08)',
            }}>
                <div style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    justifyContent: 'space-between',
                    marginBottom: '12px',
                }}>
                    <span style={{
                        fontSize: '11px',
                        fontWeight: '800',
                        letterSpacing: '1.5px',
                        textTransform: 'uppercase',
                        color: '#9ca3af',
                    }}>
                        Total
                    </span>
                    <span style={{
                        fontFamily: "'Playfair Display', serif",
                        fontSize: '1.8rem',
                        color: '#f472b6',
                        fontWeight: '700',
                    }}>
                        {money(unitPrice)}
                    </span>
                </div>

                <button
                    onClick={onSubmit}
                    disabled={!canSubmit || submitting}
                    style={{
                        width: '100%',
                        padding: '14px',
                        borderRadius: '12px',
                        border: 'none',
                        cursor: canSubmit && !submitting ? 'pointer' : 'not-allowed',
                        background: canSubmit && !submitting
                            ? 'linear-gradient(135deg, #f472b6, #c084fc)'
                            : 'rgba(255,255,255,0.06)',
                        color: canSubmit && !submitting ? '#0a0a0a' : '#6b7280',
                        fontWeight: '900',
                        fontSize: '13px',
                        letterSpacing: '1px',
                        textTransform: 'uppercase',
                    }}
                >
                    {submitting ? 'Enviando…' : submitLabel}
                </button>

                <button
                    onClick={onClear}
                    disabled={submitting}
                    style={{
                        width: '100%',
                        marginTop: '8px',
                        padding: '10px',
                        borderRadius: '10px',
                        background: 'transparent',
                        border: '1px solid rgba(255,255,255,0.1)',
                        color: '#9ca3af',
                        cursor: submitting ? 'not-allowed' : 'pointer',
                        fontWeight: '700',
                        fontSize: '11px',
                        letterSpacing: '1px',
                        textTransform: 'uppercase',
                    }}
                >
                    Limpiar
                </button>
            </div>
        </div>
    );
}

export default ConfiguratorSummary;
