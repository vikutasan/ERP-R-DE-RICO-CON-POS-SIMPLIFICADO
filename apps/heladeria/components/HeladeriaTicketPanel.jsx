/**
 * HeladeriaTicketPanel.jsx — Panel de ticket del POS.
 * Estética editorial B&W: blanco, divisores lineales, total ultra-bold.
 */
import React from 'react';

export function HeladeriaTicketPanel({
    ticket, items, total, onRemoveItem, onCheckout, onClearCart, itemCount,
}) {
    return (
        <div style={{
            background: '#ffffff',
            border: '1px solid #e5e7eb',
            borderLeft: '1px solid #0f0f0f',
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            overflow: 'hidden',
        }}>
            {/* Header */}
            <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '16px 20px',
                borderBottom: '1px solid #e5e7eb',
            }}>
                <div>
                    <span style={{
                        fontSize: '10px', fontWeight: '900', color: '#0f0f0f',
                        textTransform: 'uppercase', letterSpacing: '3px',
                    }}>
                        Ticket
                    </span>
                    {ticket && (
                        <span style={{ display: 'block', fontSize: '10px', color: '#9ca3af', fontWeight: '600', marginTop: '2px' }}>
                            {ticket.account_num}
                        </span>
                    )}
                </div>
                <span style={{
                    background: '#0f0f0f', color: '#ffffff',
                    padding: '3px 12px', borderRadius: '100px',
                    fontSize: '11px', fontWeight: '800',
                }}>
                    {itemCount} item{itemCount !== 1 ? 's' : ''}
                </span>
            </div>

            {/* Items */}
            <div style={{
                flex: 1, overflowY: 'auto',
                display: 'flex', flexDirection: 'column',
            }}>
                {items.length === 0 ? (
                    <div style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center',
                        justifyContent: 'center', flex: 1, color: '#d1d5db',
                        gap: '12px', padding: '40px',
                    }}>
                        <span style={{ fontSize: '48px', opacity: 0.4 }}>🍦</span>
                        <span style={{ fontSize: '12px', fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '1px' }}>
                            Arma un helado
                        </span>
                    </div>
                ) : (
                    items.map((item, index) => (
                        <div key={item.id || index} style={{
                            padding: '14px 20px',
                            borderBottom: '1px solid #f3f4f6',
                        }}>
                            <div style={{
                                display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                            }}>
                                <div style={{ flex: 1 }}>
                                    <span style={{
                                        fontSize: '13px', fontWeight: '800', color: '#0f0f0f',
                                        display: 'block', marginBottom: '2px',
                                    }}>
                                        {item.label}
                                    </span>
                                    {item.recipientName && (
                                        <span style={{
                                            fontSize: '11px', color: '#6b7280', fontWeight: '600', display: 'block',
                                        }}>
                                            Para: {item.recipientName}
                                        </span>
                                    )}
                                    {item.bolas && (
                                        <span style={{ fontSize: '10px', color: '#9ca3af', display: 'block', marginTop: '2px' }}>
                                            {item.bolas.map(b => b.name).join(' · ')}
                                            {item.extras?.length > 0 && ` + ${item.extras.map(e => e.name).join(', ')}`}
                                        </span>
                                    )}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginLeft: '12px' }}>
                                    <span style={{
                                        color: '#0f0f0f', fontWeight: '900', fontSize: '15px', whiteSpace: 'nowrap',
                                    }}>
                                        ${parseFloat(item.subtotal).toFixed(2)}
                                    </span>
                                    <button onClick={() => onRemoveItem(index)} style={{
                                        background: 'none', border: '1px solid #e5e7eb',
                                        color: '#9ca3af', cursor: 'pointer', fontSize: '14px',
                                        fontWeight: '700', padding: '2px 8px', borderRadius: '6px',
                                        lineHeight: 1,
                                    }}>
                                        ×
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Footer — Total + Acciones */}
            <div style={{ borderTop: '1px solid #0f0f0f', padding: '16px 20px' }}>
                <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                    marginBottom: '14px',
                }}>
                    <span style={{ color: '#9ca3af', fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '1px' }}>
                        Total
                    </span>
                    <span style={{ color: '#0f0f0f', fontSize: '32px', fontWeight: '900' }}>
                        ${total.toFixed(2)}
                    </span>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                        onClick={onClearCart}
                        disabled={items.length === 0}
                        style={{
                            flex: 1, background: '#ffffff',
                            border: '1px solid #e5e7eb', borderRadius: '8px',
                            padding: '12px', color: items.length > 0 ? '#374151' : '#d1d5db',
                            fontSize: '11px', fontWeight: '800', textTransform: 'uppercase',
                            letterSpacing: '1px', cursor: items.length > 0 ? 'pointer' : 'not-allowed',
                        }}
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={onCheckout}
                        disabled={items.length === 0}
                        style={{
                            flex: 2,
                            background: items.length > 0 ? '#0f0f0f' : '#f3f4f6',
                            border: 'none', borderRadius: '8px', padding: '12px',
                            color: items.length > 0 ? '#ffffff' : '#9ca3af',
                            fontSize: '13px', fontWeight: '900', textTransform: 'uppercase',
                            letterSpacing: '2px',
                            cursor: items.length > 0 ? 'pointer' : 'not-allowed',
                        }}
                    >
                        Cobrar
                    </button>
                </div>
            </div>
        </div>
    );
}
