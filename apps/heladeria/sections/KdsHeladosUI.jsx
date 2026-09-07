/**
 * KdsHeladosUI.jsx — Kitchen Display para estación HELADOS.
 * Muestra pedidos pagados con items de helado, polling automático.
 * Estilo dark mode premium con estados visuales claros.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { heladeriaService } from '../services/heladeriaService';

const STATUS_COLORS = {
    PENDING: { bg: 'rgba(245,158,11,0.12)', border: '#f59e0b', text: '#f59e0b', label: '⏳ Pendiente' },
    IN_PROGRESS: { bg: 'rgba(59,130,246,0.12)', border: '#3b82f6', text: '#3b82f6', label: '🔥 En Preparación' },
    READY: { bg: 'rgba(34,197,94,0.12)', border: '#22c55e', text: '#22c55e', label: '✅ Listo' },
};

export function KdsHeladosUI({ onBack }) {
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);

    const loadOrders = useCallback(async () => {
        try {
            const data = await heladeriaService.getKdsOrders('HELADOS');
            setOrders(data || []);
        } catch (err) {
            console.error('Error KDS helados:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    // Polling cada 5 segundos
    useEffect(() => {
        loadOrders();
        const interval = setInterval(loadOrders, 5000);
        return () => clearInterval(interval);
    }, [loadOrders]);

    const handleStatusChange = async (itemId, newStatus) => {
        try {
            await heladeriaService.updateKdsItemStatus(itemId, newStatus);
            await loadOrders(); // Refresh
        } catch (err) {
            console.error('Error actualizando estado:', err);
        }
    };

    return (
        <div style={{
            height: '100vh', background: '#0a0a0a', color: '#fff',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
            fontFamily: "'Inter', -apple-system, sans-serif",
        }}>
            {/* Header */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '16px 24px',
                background: 'linear-gradient(135deg, rgba(245,158,11,0.1), rgba(59,130,246,0.05))',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <button onClick={onBack} style={{
                        background: 'rgba(255,255,255,0.08)', border: 'none', color: '#fff',
                        padding: '8px 16px', borderRadius: '10px', cursor: 'pointer',
                        fontSize: '13px', fontWeight: '700',
                    }}>← Hub</button>
                    <h1 style={{
                        fontSize: '18px', fontWeight: '900', margin: 0,
                        color: '#f59e0b', letterSpacing: '1px',
                    }}>
                        🍨 KDS HELADOS
                    </h1>
                </div>
                <div style={{
                    background: 'rgba(245,158,11,0.1)', padding: '6px 16px',
                    borderRadius: '10px', fontSize: '12px', fontWeight: '800', color: '#f59e0b',
                }}>
                    {orders.length} pedido{orders.length !== 1 ? 's' : ''}
                </div>
            </div>

            {/* Orders Grid */}
            <div style={{
                flex: 1, overflowY: 'auto', padding: '20px',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                gap: '16px', alignContent: 'start',
            }}>
                {loading && (
                    <div style={{ gridColumn: '1 / -1', textAlign: 'center', color: '#888', padding: '40px' }}>
                        🍨 Cargando pedidos...
                    </div>
                )}

                {!loading && orders.length === 0 && (
                    <div style={{
                        gridColumn: '1 / -1', textAlign: 'center', color: '#444',
                        padding: '80px 20px', display: 'flex', flexDirection: 'column',
                        alignItems: 'center', gap: '16px',
                    }}>
                        <span style={{ fontSize: '64px', opacity: 0.2 }}>🍦</span>
                        <span style={{ fontSize: '16px', fontWeight: '700' }}>Sin pedidos pendientes</span>
                    </div>
                )}

                {orders.map(order => (
                    <div key={order.ticket_id} style={{
                        background: 'rgba(255,255,255,0.03)',
                        borderRadius: '18px',
                        border: '1px solid rgba(255,255,255,0.08)',
                        overflow: 'hidden',
                    }}>
                        {/* Order Header */}
                        <div style={{
                            padding: '14px 18px',
                            background: 'rgba(255,255,255,0.02)',
                            borderBottom: '1px solid rgba(255,255,255,0.06)',
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        }}>
                            <div>
                                <span style={{ fontSize: '16px', fontWeight: '900', color: '#f59e0b' }}>
                                    #{order.account_num}
                                </span>
                                {order.customer_group_name && (
                                    <span style={{
                                        display: 'block', fontSize: '11px', color: '#f9a8d4',
                                        fontWeight: '600', marginTop: '2px',
                                    }}>
                                        👥 {order.customer_group_name}
                                    </span>
                                )}
                            </div>
                            <span style={{ fontSize: '10px', color: '#666' }}>
                                {order.terminal_id}
                            </span>
                        </div>

                        {/* Items */}
                        <div style={{ padding: '12px 18px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {order.items.map(item => {
                                const statusInfo = STATUS_COLORS[item.item_status] || STATUS_COLORS.PENDING;
                                return (
                                    <div key={item.item_id} style={{
                                        background: statusInfo.bg,
                                        border: `1px solid ${statusInfo.border}40`,
                                        borderRadius: '12px',
                                        padding: '12px',
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div>
                                                <span style={{ fontSize: '14px', fontWeight: '700', color: '#fff' }}>
                                                    🍦 {item.product_name} ×{item.quantity}
                                                </span>
                                                {item.recipient_name && (
                                                    <span style={{
                                                        display: 'block', fontSize: '11px', color: '#f9a8d4',
                                                        fontWeight: '600', marginTop: '2px',
                                                    }}>
                                                        👤 {item.recipient_name}
                                                    </span>
                                                )}
                                                {/* Componentes */}
                                                {item.components?.length > 0 && (
                                                    <div style={{ marginTop: '6px', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                                        {item.components.map(c => (
                                                            <span key={c.id} style={{
                                                                background: 'rgba(255,255,255,0.08)',
                                                                borderRadius: '6px', padding: '2px 8px',
                                                                fontSize: '10px', color: '#ccc', fontWeight: '600',
                                                            }}>
                                                                {c.component_name}
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                            <span style={{
                                                fontSize: '10px', fontWeight: '800',
                                                color: statusInfo.text, textTransform: 'uppercase',
                                            }}>
                                                {statusInfo.label}
                                            </span>
                                        </div>
                                        {/* Botones de acción */}
                                        <div style={{ display: 'flex', gap: '6px', marginTop: '10px' }}>
                                            {item.item_status === 'PENDING' && (
                                                <button onClick={() => handleStatusChange(item.item_id, 'IN_PROGRESS')} style={{
                                                    flex: 1, background: 'rgba(59,130,246,0.2)', border: '1px solid rgba(59,130,246,0.3)',
                                                    borderRadius: '8px', padding: '8px', color: '#3b82f6',
                                                    fontWeight: '800', fontSize: '11px', cursor: 'pointer',
                                                }}>
                                                    🔥 Preparar
                                                </button>
                                            )}
                                            {item.item_status === 'IN_PROGRESS' && (
                                                <button onClick={() => handleStatusChange(item.item_id, 'READY')} style={{
                                                    flex: 1, background: 'rgba(34,197,94,0.2)', border: '1px solid rgba(34,197,94,0.3)',
                                                    borderRadius: '8px', padding: '8px', color: '#22c55e',
                                                    fontWeight: '800', fontSize: '11px', cursor: 'pointer',
                                                }}>
                                                    ✅ ¡Listo!
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
