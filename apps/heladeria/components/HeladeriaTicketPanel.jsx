/**
 * HeladeriaTicketPanel.jsx — Panel derecho del POS: ticket en construcción.
 * Muestra items agregados, total, y botones de acción.
 */
import React from 'react';

export function HeladeriaTicketPanel({
    ticket, items, total, onRemoveItem, onCheckout, onClearCart, itemCount,
}) {
    return (
        <div style={{
            background: 'rgba(255,255,255,0.03)',
            borderRadius: '20px',
            border: '1px solid rgba(255,255,255,0.08)',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
        }}>
            {/* Header */}
            <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                marginBottom: '16px',
            }}>
                <div>
                    <h3 style={{
                        fontSize: '13px', fontWeight: '900', color: '#f59e0b',
                        textTransform: 'uppercase', letterSpacing: '2px', margin: 0,
                    }}>
                        🛒 Ticket
                    </h3>
                    {ticket && (
                        <span style={{ fontSize: '11px', color: '#666', fontWeight: '600' }}>
                            {ticket.account_num}
                        </span>
                    )}
                </div>
                <span style={{
                    background: 'rgba(245,158,11,0.15)', color: '#f59e0b',
                    padding: '4px 12px', borderRadius: '20px',
                    fontSize: '11px', fontWeight: '800',
                }}>
                    {itemCount} item{itemCount !== 1 ? 's' : ''}
                </span>
            </div>

            {/* Items */}
            <div style={{
                flex: 1, overflowY: 'auto',
                display: 'flex', flexDirection: 'column', gap: '8px',
                marginBottom: '16px',
            }}>
                {items.length === 0 ? (
                    <div style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center',
                        justifyContent: 'center', flex: 1, color: '#444',
                        gap: '8px',
                    }}>
                        <span style={{ fontSize: '40px', opacity: 0.3 }}>🍦</span>
                        <span style={{ fontSize: '12px', fontWeight: '600' }}>Arma un helado y agrégalo</span>
                    </div>
                ) : (
                    items.map((item, index) => (
                        <div key={item.id || index} style={{
                            background: 'rgba(255,255,255,0.04)',
                            borderRadius: '14px',
                            padding: '14px',
                            border: '1px solid rgba(255,255,255,0.06)',
                        }}>
                            <div style={{
                                display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                            }}>
                                <div style={{ flex: 1 }}>
                                    <span style={{
                                        fontSize: '13px', fontWeight: '700', color: '#fff',
                                        display: 'block', marginBottom: '4px',
                                    }}>
                                        🍦 {item.label}
                                    </span>
                                    {item.recipientName && (
                                        <span style={{
                                            fontSize: '11px', color: '#f9a8d4', fontWeight: '600',
                                            display: 'block',
                                        }}>
                                            👤 {item.recipientName}
                                        </span>
                                    )}
                                    {item.bolas && (
                                        <span style={{ fontSize: '10px', color: '#888', display: 'block', marginTop: '2px' }}>
                                            {item.bolas.map(b => b.name).join(' + ')}
                                            {item.extras?.length > 0 && ` +${item.extras.map(e => e.name).join('+')}`}
                                        </span>
                                    )}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <span style={{
                                        color: '#f59e0b', fontWeight: '800', fontSize: '14px',
                                        whiteSpace: 'nowrap',
                                    }}>
                                        ${parseFloat(item.subtotal).toFixed(2)}
                                    </span>
                                    <button onClick={() => onRemoveItem(index)} style={{
                                        background: 'rgba(239,68,68,0.15)', border: 'none',
                                        color: '#ef4444', cursor: 'pointer', fontSize: '12px',
                                        fontWeight: '700', padding: '4px 8px', borderRadius: '8px',
                                    }}>
                                        ✕
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Footer — Total + Acciones */}
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '16px' }}>
                <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    marginBottom: '14px',
                }}>
                    <span style={{
                        color: '#888', fontSize: '14px', fontWeight: '800', textTransform: 'uppercase',
                    }}>
                        Total
                    </span>
                    <span style={{
                        color: '#f59e0b', fontSize: '28px', fontWeight: '900',
                        fontFamily: "'Inter', sans-serif",
                    }}>
                        ${total.toFixed(2)}
                    </span>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                        onClick={onClearCart}
                        disabled={items.length === 0}
                        style={{
                            flex: 1, background: 'rgba(255,255,255,0.05)',
                            border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px',
                            padding: '14px', color: items.length > 0 ? '#fff' : '#555',
                            fontSize: '12px', fontWeight: '800', textTransform: 'uppercase',
                            cursor: items.length > 0 ? 'pointer' : 'not-allowed',
                        }}
                    >
                        🗑 Cancelar
                    </button>
                    <button
                        onClick={onCheckout}
                        disabled={items.length === 0}
                        style={{
                            flex: 2,
                            background: items.length > 0
                                ? 'linear-gradient(135deg, #16a34a, #22c55e)'
                                : 'rgba(255,255,255,0.05)',
                            border: 'none', borderRadius: '12px', padding: '14px',
                            color: items.length > 0 ? '#fff' : '#555',
                            fontSize: '14px', fontWeight: '900', textTransform: 'uppercase',
                            letterSpacing: '1px',
                            cursor: items.length > 0 ? 'pointer' : 'not-allowed',
                            boxShadow: items.length > 0 ? '0 4px 20px rgba(22,163,74,0.3)' : 'none',
                        }}
                    >
                        💰 Cobrar
                    </button>
                </div>
            </div>
        </div>
    );
}
