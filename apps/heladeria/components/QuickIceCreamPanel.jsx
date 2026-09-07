/**
 * QuickIceCreamPanel.jsx — Panel izquierdo de "Armado Rápido".
 * Muestra recipiente seleccionado, bolas elegidas, extras, y subtotal.
 * Botón [+ AL TICKET] para confirmar.
 */
import React from 'react';

export function QuickIceCreamPanel({
    recipiente, bolas, extras, subtotal, recipientName,
    onSetRecipientName, onRemoveBola, onToggleExtra, onAddToTicket, onReset,
    isValid, maxBolas, bolasRestantes, availableExtras = [],
}) {
    return (
        <div style={{
            background: 'rgba(255,255,255,0.03)',
            borderRadius: '20px',
            border: '1px solid rgba(255,255,255,0.08)',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            height: '100%',
        }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{
                    fontSize: '13px', fontWeight: '900', color: '#f9a8d4',
                    textTransform: 'uppercase', letterSpacing: '2px', margin: 0,
                    fontFamily: "'Inter', sans-serif",
                }}>
                    🍦 Armado Rápido
                </h3>
                {recipiente && (
                    <button onClick={onReset} style={{
                        background: 'rgba(255,255,255,0.08)', border: 'none', color: '#999',
                        padding: '4px 10px', borderRadius: '8px', fontSize: '10px',
                        cursor: 'pointer', fontWeight: '700',
                    }}>
                        ✕ Limpiar
                    </button>
                )}
            </div>

            {/* Recipiente */}
            <div style={{
                background: recipiente ? 'rgba(244,63,94,0.1)' : 'rgba(255,255,255,0.02)',
                border: `1px dashed ${recipiente ? '#f43f5e' : 'rgba(255,255,255,0.1)'}`,
                borderRadius: '12px', padding: '12px', textAlign: 'center',
            }}>
                <span style={{ fontSize: '10px', color: '#888', textTransform: 'uppercase', fontWeight: '700' }}>
                    Recipiente
                </span>
                <p style={{
                    margin: '4px 0 0', fontSize: '16px', fontWeight: '800',
                    color: recipiente ? '#fff' : '#555',
                }}>
                    {recipiente ? recipiente.name : '← Selecciona'}
                </p>
            </div>

            {/* Bolas */}
            <div>
                <span style={{ fontSize: '10px', color: '#888', textTransform: 'uppercase', fontWeight: '700' }}>
                    Bolas ({bolas.length}/{maxBolas})
                </span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '6px' }}>
                    {bolas.map((bola, i) => (
                        <div key={i} style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            background: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '8px 12px',
                        }}>
                            <span style={{ fontSize: '13px', color: '#fff', fontWeight: '600' }}>
                                🍨 {bola.name}
                            </span>
                            <button onClick={() => onRemoveBola(i)} style={{
                                background: 'none', border: 'none', color: '#ef4444',
                                cursor: 'pointer', fontSize: '14px', fontWeight: '700',
                            }}>✕</button>
                        </div>
                    ))}
                    {bolasRestantes > 0 && recipiente && (
                        <div style={{
                            border: '1px dashed rgba(255,255,255,0.1)', borderRadius: '8px',
                            padding: '8px', textAlign: 'center', color: '#555', fontSize: '11px',
                        }}>
                            + {bolasRestantes} bola{bolasRestantes > 1 ? 's' : ''} restante{bolasRestantes > 1 ? 's' : ''}
                        </div>
                    )}
                </div>
            </div>

            {/* Extras */}
            <div>
                <span style={{ fontSize: '10px', color: '#888', textTransform: 'uppercase', fontWeight: '700' }}>
                    Extras
                </span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                    {availableExtras.map((extra) => {
                        const isSelected = extras.some(e => e.config_id === extra.config_id);
                        return (
                            <button
                                key={extra.config_id}
                                onClick={() => onToggleExtra(extra)}
                                disabled={!extra.is_available}
                                style={{
                                    background: isSelected ? 'rgba(244,63,94,0.2)' : 'rgba(255,255,255,0.05)',
                                    border: isSelected ? '2px solid #f43f5e' : '1px solid rgba(255,255,255,0.1)',
                                    borderRadius: '10px', padding: '6px 12px',
                                    color: isSelected ? '#f43f5e' : extra.is_available ? '#ccc' : '#555',
                                    fontSize: '11px', fontWeight: '700', cursor: extra.is_available ? 'pointer' : 'not-allowed',
                                    opacity: extra.is_available ? 1 : 0.4,
                                    transition: 'all 0.15s ease',
                                }}
                            >
                                {isSelected ? '✓ ' : ''}{extra.name} ${parseFloat(extra.price).toFixed(0)}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Nombre integrante (OPCIONAL) */}
            <div>
                <span style={{ fontSize: '10px', color: '#888', textTransform: 'uppercase', fontWeight: '700' }}>
                    Para (opcional)
                </span>
                <input
                    type="text"
                    value={recipientName}
                    onChange={(e) => onSetRecipientName(e.target.value)}
                    placeholder="Nombre..."
                    style={{
                        width: '100%', background: 'rgba(255,255,255,0.05)',
                        border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px',
                        padding: '10px 14px', color: '#fff', fontSize: '14px',
                        outline: 'none', marginTop: '4px', fontWeight: '500',
                        boxSizing: 'border-box',
                    }}
                />
            </div>

            {/* Spacer */}
            <div style={{ flex: 1 }} />

            {/* Subtotal + Botón */}
            <div style={{
                borderTop: '1px solid rgba(255,255,255,0.08)',
                paddingTop: '16px',
            }}>
                <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    marginBottom: '12px',
                }}>
                    <span style={{ color: '#888', fontSize: '12px', fontWeight: '700', textTransform: 'uppercase' }}>
                        Subtotal
                    </span>
                    <span style={{
                        color: '#f59e0b', fontSize: '24px', fontWeight: '900',
                        fontFamily: "'Inter', sans-serif",
                    }}>
                        ${subtotal.toFixed(2)}
                    </span>
                </div>
                <button
                    onClick={onAddToTicket}
                    disabled={!isValid}
                    style={{
                        width: '100%',
                        background: isValid
                            ? 'linear-gradient(135deg, #f43f5e, #ec4899)'
                            : 'rgba(255,255,255,0.05)',
                        border: 'none',
                        borderRadius: '14px',
                        padding: '16px',
                        color: isValid ? '#fff' : '#555',
                        fontSize: '14px',
                        fontWeight: '900',
                        textTransform: 'uppercase',
                        letterSpacing: '1px',
                        cursor: isValid ? 'pointer' : 'not-allowed',
                        transition: 'all 0.2s ease',
                        boxShadow: isValid ? '0 4px 20px rgba(244,63,94,0.3)' : 'none',
                    }}
                >
                    + AL TICKET →
                </button>
            </div>
        </div>
    );
}
