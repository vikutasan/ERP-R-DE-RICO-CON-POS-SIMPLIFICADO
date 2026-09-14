/**
 * ConfiguratorSummary.jsx — Panel derecho del configurador (V14, Fase 14.2).
 * Estética editorial B&W: blanco, divisores lineales, total ultra-bold negro.
 *
 * Componente PRESENTACIONAL y AISLADO: no hace fetch, no tiene timers,
 * no tiene animaciones infinitas. Recibe el estado ya calculado y lo pinta.
 */
import React from 'react';

const money = (n) => `$${(Number(n) || 0).toFixed(2)}`;

/** Fila de un grupo de selección (sabores, toppings, extras). */
const FilaGrupo = ({ titulo, items, vacio, onQuitar }) => (
    <div style={{ borderBottom: '1px solid #f3f4f6', paddingBottom: '12px', marginBottom: '12px' }}>
        <div style={{
            fontSize: '9px', fontWeight: '900', letterSpacing: '2px',
            textTransform: 'uppercase', color: '#9ca3af', marginBottom: '8px',
        }}>
            {titulo}
        </div>
        {items.length === 0 ? (
            <div style={{ fontSize: '12px', color: '#d1d5db', fontStyle: 'italic' }}>{vacio}</div>
        ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {items.map((it) => (
                    <div key={it.config_id} style={{
                        display: 'flex', alignItems: 'center',
                        justifyContent: 'space-between', gap: '8px',
                        background: '#f9fafb', border: '1px solid #e5e7eb',
                        borderRadius: '6px', padding: '6px 10px',
                    }}>
                        <span style={{ fontSize: '12px', color: '#0f0f0f', fontWeight: '700' }}>
                            {it.name}
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '11px', color: '#6b7280', fontWeight: '600' }}>
                                {money(it.price)}
                            </span>
                            {onQuitar && (
                                <button
                                    onClick={() => onQuitar(it)}
                                    title={`Quitar ${it.name}`}
                                    style={{
                                        background: 'none', border: '1px solid #e5e7eb',
                                        color: '#9ca3af', borderRadius: '4px',
                                        width: '20px', height: '20px', lineHeight: '1',
                                        cursor: 'pointer', fontSize: '14px', fontWeight: '900', padding: 0,
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
    state, unitPrice, maxSabores, canSubmit, submitting,
    onSubmit, onRemoveFlavor, onRemoveTopping, onRemoveExtra, onClear,
    submitLabel = 'Agregar a la pre-comanda',
}) {
    const sabores = state?.sabores || [];
    const toppings = state?.toppings || [];
    const extras = state?.extras || [];

    return (
        <div style={{
            display: 'flex', flexDirection: 'column', height: '100%',
            background: '#ffffff',
            border: '1px solid #0f0f0f',
            borderRadius: '4px',
            overflow: 'hidden',
        }}>
            {/* Header */}
            <div style={{
                padding: '14px 18px',
                borderBottom: '1px solid #e5e7eb',
            }}>
                <span style={{
                    fontSize: '10px', fontWeight: '900', color: '#0f0f0f',
                    textTransform: 'uppercase', letterSpacing: '3px',
                }}>
                    Tu helado
                </span>
            </div>

            {/* Content */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px' }}>
                <FilaGrupo
                    titulo="Recipiente"
                    items={state?.base ? [state.base] : []}
                    vacio="Sin elegir"
                />
                <FilaGrupo
                    titulo="Tamaño"
                    items={state?.tamano ? [state.tamano] : []}
                    vacio="Sin elegir"
                />

                {/* Sabores con contador */}
                <div style={{ borderBottom: '1px solid #f3f4f6', paddingBottom: '12px', marginBottom: '12px' }}>
                    <div style={{
                        fontSize: '9px', fontWeight: '900', letterSpacing: '2px',
                        textTransform: 'uppercase', color: '#9ca3af', marginBottom: '8px',
                    }}>
                        Sabores ({sabores.length}/{maxSabores})
                    </div>
                    {sabores.length === 0 ? (
                        <div style={{ fontSize: '12px', color: '#d1d5db', fontStyle: 'italic' }}>
                            Elige al menos uno
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            {sabores.map((s) => (
                                <div key={s.config_id} style={{
                                    display: 'flex', alignItems: 'center',
                                    justifyContent: 'space-between', gap: '8px',
                                    background: '#f9fafb', border: '1px solid #e5e7eb',
                                    borderRadius: '6px', padding: '6px 10px',
                                }}>
                                    <span style={{ fontSize: '12px', color: '#0f0f0f', fontWeight: '700' }}>
                                        {s.name}
                                    </span>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{ fontSize: '11px', color: '#6b7280', fontWeight: '600' }}>
                                            {money(s.price)}
                                        </span>
                                        <button
                                            onClick={() => onRemoveFlavor && onRemoveFlavor(s)}
                                            title={`Quitar ${s.name}`}
                                            style={{
                                                background: 'none', border: '1px solid #e5e7eb',
                                                color: '#9ca3af', borderRadius: '4px',
                                                width: '20px', height: '20px', lineHeight: '1',
                                                cursor: 'pointer', fontSize: '14px', fontWeight: '900', padding: 0,
                                            }}
                                        >×</button>
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <FilaGrupo titulo="Toppings" items={toppings} vacio="Opcional" onQuitar={onRemoveTopping} />
                <FilaGrupo titulo="Extras" items={extras} vacio="Opcional" onQuitar={onRemoveExtra} />
            </div>

            {/* Footer — Total + CTA */}
            <div style={{ borderTop: '1px solid #0f0f0f', padding: '16px 18px' }}>
                <div style={{
                    display: 'flex', alignItems: 'baseline',
                    justifyContent: 'space-between', marginBottom: '14px',
                }}>
                    <span style={{
                        fontSize: '10px', fontWeight: '900', letterSpacing: '2px',
                        textTransform: 'uppercase', color: '#9ca3af',
                    }}>
                        Total
                    </span>
                    <span style={{ fontSize: '2rem', color: '#0f0f0f', fontWeight: '900' }}>
                        {money(unitPrice)}
                    </span>
                </div>

                <button
                    onClick={onSubmit}
                    disabled={!canSubmit || submitting}
                    style={{
                        width: '100%', padding: '14px', borderRadius: '8px', border: 'none',
                        cursor: canSubmit && !submitting ? 'pointer' : 'not-allowed',
                        background: canSubmit && !submitting ? '#0f0f0f' : '#f3f4f6',
                        color: canSubmit && !submitting ? '#ffffff' : '#9ca3af',
                        fontWeight: '900', fontSize: '12px', letterSpacing: '2px',
                        textTransform: 'uppercase',
                    }}
                >
                    {submitting ? 'Enviando…' : submitLabel}
                </button>

                <button
                    onClick={onClear}
                    disabled={submitting}
                    style={{
                        width: '100%', marginTop: '8px', padding: '10px',
                        borderRadius: '8px', background: 'transparent',
                        border: '1px solid #e5e7eb', color: '#9ca3af',
                        cursor: submitting ? 'not-allowed' : 'pointer',
                        fontWeight: '700', fontSize: '11px', letterSpacing: '1px',
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
