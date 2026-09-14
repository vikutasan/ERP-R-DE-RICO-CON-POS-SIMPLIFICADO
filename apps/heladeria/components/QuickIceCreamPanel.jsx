/**
 * QuickIceCreamPanel.jsx — Panel de armado rápido de helados.
 * Estética editorial B&W: blanco, divisores lineales, tipografía ultra-bold.
 */
import React from 'react';

export function QuickIceCreamPanel({
    recipiente, bolas, extras, subtotal, recipientName,
    onSetRecipientName, onRemoveBola, onToggleExtra, onAddToTicket, onReset,
    isValid, maxBolas, bolasRestantes, availableExtras = [],
}) {
    return (
        <div style={{
            background: '#ffffff',
            border: '1px solid #e5e7eb',
            borderLeft: '1px solid #0f0f0f',
            display: 'flex',
            flexDirection: 'column',
            gap: '0',
            height: '100%',
            overflow: 'hidden',
        }}>
            {/* Header */}
            <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '16px 20px',
                borderBottom: '1px solid #e5e7eb',
            }}>
                <span style={{
                    fontSize: '10px', fontWeight: '900', color: '#0f0f0f',
                    textTransform: 'uppercase', letterSpacing: '3px',
                }}>
                    Armado
                </span>
                {recipiente && (
                    <button onClick={onReset} style={{
                        background: 'none', border: '1px solid #e5e7eb',
                        color: '#6b7280', padding: '4px 10px', borderRadius: '100px',
                        fontSize: '10px', cursor: 'pointer', fontWeight: '700',
                    }}>
                        Limpiar
                    </button>
                )}
            </div>

            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>

                {/* 01 — Recipiente */}
                <div style={{ borderBottom: '1px solid #e5e7eb', padding: '16px 20px' }}>
                    <span style={{
                        fontSize: '9px', fontWeight: '900', color: '#9ca3af',
                        textTransform: 'uppercase', letterSpacing: '2px', display: 'block', marginBottom: '8px',
                    }}>
                        01 — Recipiente
                    </span>
                    <div style={{
                        background: recipiente ? '#0f0f0f' : '#f9fafb',
                        border: `1px solid ${recipiente ? '#0f0f0f' : '#e5e7eb'}`,
                        borderRadius: '8px', padding: '12px 14px', textAlign: 'center',
                        transition: 'all 0.15s ease',
                    }}>
                        <p style={{
                            margin: 0, fontSize: '14px', fontWeight: '800',
                            color: recipiente ? '#ffffff' : '#9ca3af',
                        }}>
                            {recipiente ? recipiente.name : '← Selecciona un recipiente'}
                        </p>
                    </div>
                </div>

                {/* 02 — Bolas */}
                <div style={{ borderBottom: '1px solid #e5e7eb', padding: '16px 20px' }}>
                    <span style={{
                        fontSize: '9px', fontWeight: '900', color: '#9ca3af',
                        textTransform: 'uppercase', letterSpacing: '2px', display: 'block', marginBottom: '8px',
                    }}>
                        02 — Sabores ({bolas.length}/{maxBolas})
                    </span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {bolas.map((bola, i) => (
                            <div key={i} style={{
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                background: '#f9fafb', border: '1px solid #e5e7eb',
                                borderRadius: '6px', padding: '8px 12px',
                            }}>
                                <span style={{ fontSize: '13px', color: '#0f0f0f', fontWeight: '700' }}>
                                    🍨 {bola.name}
                                </span>
                                <button onClick={() => onRemoveBola(i)} style={{
                                    background: 'none', border: 'none', color: '#9ca3af',
                                    cursor: 'pointer', fontSize: '16px', fontWeight: '900', lineHeight: 1,
                                }}>×</button>
                            </div>
                        ))}
                        {bolasRestantes > 0 && recipiente && (
                            <div style={{
                                border: '1px dashed #d1d5db', borderRadius: '6px',
                                padding: '8px', textAlign: 'center', color: '#9ca3af', fontSize: '11px', fontWeight: '600',
                            }}>
                                + {bolasRestantes} bola{bolasRestantes > 1 ? 's' : ''} restante{bolasRestantes > 1 ? 's' : ''}
                            </div>
                        )}
                    </div>
                </div>

                {/* 03 — Extras */}
                <div style={{ borderBottom: '1px solid #e5e7eb', padding: '16px 20px' }}>
                    <span style={{
                        fontSize: '9px', fontWeight: '900', color: '#9ca3af',
                        textTransform: 'uppercase', letterSpacing: '2px', display: 'block', marginBottom: '8px',
                    }}>
                        03 — Extras
                    </span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {availableExtras.map((extra) => {
                            const isSelected = extras.some(e => e.config_id === extra.config_id);
                            return (
                                <button
                                    key={extra.config_id}
                                    onClick={() => onToggleExtra(extra)}
                                    style={{
                                        background: isSelected ? '#0f0f0f' : '#ffffff',
                                        border: `1px solid ${isSelected ? '#0f0f0f' : '#d1d5db'}`,
                                        borderRadius: '100px', padding: '5px 12px',
                                        color: isSelected ? '#ffffff' : '#374151',
                                        fontSize: '11px', fontWeight: '700', cursor: 'pointer',
                                        transition: 'all 0.15s ease',
                                    }}
                                >
                                    {isSelected ? '✓ ' : ''}{extra.name} +${parseFloat(extra.price).toFixed(0)}
                                </button>
                            );
                        })}
                        {availableExtras.length === 0 && (
                            <span style={{ color: '#9ca3af', fontSize: '11px' }}>Sin extras disponibles</span>
                        )}
                    </div>
                </div>

                {/* 04 — Para */}
                <div style={{ padding: '16px 20px' }}>
                    <span style={{
                        fontSize: '9px', fontWeight: '900', color: '#9ca3af',
                        textTransform: 'uppercase', letterSpacing: '2px', display: 'block', marginBottom: '8px',
                    }}>
                        04 — Para (opcional)
                    </span>
                    <input
                        type="text"
                        value={recipientName}
                        onChange={(e) => onSetRecipientName(e.target.value)}
                        placeholder="Nombre..."
                        style={{
                            width: '100%', background: '#f9fafb',
                            border: '1px solid #e5e7eb', borderRadius: '8px',
                            padding: '10px 14px', color: '#0f0f0f', fontSize: '14px',
                            outline: 'none', fontWeight: '500', boxSizing: 'border-box',
                        }}
                    />
                </div>
            </div>

            {/* Footer — Subtotal + CTA */}
            <div style={{ borderTop: '1px solid #0f0f0f', padding: '16px 20px' }}>
                <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                    marginBottom: '12px',
                }}>
                    <span style={{ color: '#9ca3af', fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '1px' }}>
                        Subtotal
                    </span>
                    <span style={{ color: '#0f0f0f', fontSize: '28px', fontWeight: '900' }}>
                        ${subtotal.toFixed(2)}
                    </span>
                </div>
                <button
                    onClick={onAddToTicket}
                    disabled={!isValid}
                    style={{
                        width: '100%',
                        background: isValid ? '#0f0f0f' : '#f3f4f6',
                        border: 'none',
                        borderRadius: '8px',
                        padding: '16px',
                        color: isValid ? '#ffffff' : '#9ca3af',
                        fontSize: '13px',
                        fontWeight: '900',
                        textTransform: 'uppercase',
                        letterSpacing: '2px',
                        cursor: isValid ? 'pointer' : 'not-allowed',
                        transition: 'all 0.15s ease',
                    }}
                >
                    + AL TICKET →
                </button>
            </div>
        </div>
    );
}
