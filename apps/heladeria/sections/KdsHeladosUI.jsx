/**
 * KdsHeladosUI.jsx — Kitchen Display para estación HELADOS.
 * Estética editorial B&W: fondo blanco, tipografía ultra-bold, borde izquierdo de urgencia.
 * La lógica de urgencia (kdsUrgency.js) se conserva 100% intacta.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { heladeriaService } from '../services/heladeriaService';
import {
    computeElapsedSec,
    classifyUrgency,
    urgencyColor,
    formatElapsed,
    countByUrgency,
    normalizeThresholds,
    normalizeTzOffset,
    DEFAULT_URGENCY_THRESHOLDS,
} from '../utils/kdsUrgency';

// Estado del item: texto y color del badge en B&W editorial
const STATUS_META = {
    PENDING:     { label: 'Pendiente',    bg: '#fefce8', border: '#fde68a', text: '#92400e' },
    IN_PROGRESS: { label: 'Preparando',  bg: '#eff6ff', border: '#bfdbfe', text: '#1e40af' },
    READY:       { label: 'Listo',        bg: '#f0fdf4', border: '#bbf7d0', text: '#166534' },
};

export function KdsHeladosUI({ onBack }) {
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    // V15 (Fase 15.3): reloj de urgencia (1 s) separado del polling de datos (5 s).
    const [nowMs, setNowMs] = useState(() => Date.now());
    const [thresholds, setThresholds] = useState(DEFAULT_URGENCY_THRESHOLDS);
    const [serverOffsetHours, setServerOffsetHours] = useState(0);

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

    // V15 (Fase 15.3): reloj de urgencia — solo actualiza el timestamp, sin refetch.
    useEffect(() => {
        const tick = setInterval(() => setNowMs(Date.now()), 1000);
        return () => clearInterval(tick);
    }, []);

    // V15 (Fase 15.4): umbrales + offset desde system_settings, con fallback silencioso.
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const cfg = await heladeriaService.getKdsUrgencyConfig();
                if (cancelled) return;
                setThresholds(normalizeThresholds(cfg?.thresholds));
                setServerOffsetHours(normalizeTzOffset(cfg?.tzOffsetHours));
            } catch (err) {
                // Fallback: nunca bloquear el render del KDS por un fallo de settings.
                console.warn('KDS helados: usando umbrales por defecto', err);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    const handleStatusChange = async (itemId, newStatus) => {
        try {
            await heladeriaService.updateKdsItemStatus(itemId, newStatus);
            await loadOrders();
        } catch (err) {
            console.error('Error actualizando estado:', err);
        }
    };

    return (
        <div style={{
            height: '100vh', background: '#ffffff', color: '#0f0f0f',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
            fontFamily: "'Inter', -apple-system, sans-serif",
        }}>
            {/* Header */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '0 24px',
                borderBottom: '1px solid #0f0f0f',
                minHeight: '56px',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <button onClick={onBack} style={{
                        background: 'none', border: '1px solid #d1d5db', color: '#6b7280',
                        padding: '6px 16px', borderRadius: '100px', cursor: 'pointer',
                        fontSize: '12px', fontWeight: '700',
                    }}>← Hub</button>
                    <h1 style={{
                        fontSize: '13px', fontWeight: '900', margin: 0,
                        color: '#0f0f0f', textTransform: 'uppercase', letterSpacing: '3px',
                    }}>
                        🍨 KDS — Helados
                    </h1>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    {/* V15 (Fase 15.3): contador de urgencia — solo color, sin animación. */}
                    {(() => {
                        const counts = countByUrgency(orders, thresholds, serverOffsetHours, nowMs);
                        return (
                            <div style={{ display: 'flex', gap: '8px', fontSize: '11px', fontWeight: '800' }}>
                                <span style={{ color: '#6b7280' }}>{counts.NORMAL} normal</span>
                                <span style={{ color: '#9ca3af' }}>·</span>
                                <span style={{ color: urgencyColor('WARNING').text }}>{counts.WARNING} atención</span>
                                <span style={{ color: '#9ca3af' }}>·</span>
                                <span style={{ color: urgencyColor('CRITICAL').text }}>{counts.CRITICAL} crítico</span>
                            </div>
                        );
                    })()}
                    <span style={{
                        background: '#0f0f0f', color: '#ffffff',
                        padding: '4px 14px', borderRadius: '100px',
                        fontSize: '12px', fontWeight: '800',
                    }}>
                        {orders.length} pedido{orders.length !== 1 ? 's' : ''}
                    </span>
                </div>
            </div>

            {/* Orders Grid */}
            <div style={{
                flex: 1, overflowY: 'auto', padding: '20px',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                gap: '16px', alignContent: 'start',
            }}>
                {loading && (
                    <div style={{ gridColumn: '1 / -1', textAlign: 'center', color: '#9ca3af', padding: '40px', fontWeight: '700' }}>
                        🍨 Cargando pedidos...
                    </div>
                )}

                {!loading && orders.length === 0 && (
                    <div style={{
                        gridColumn: '1 / -1', textAlign: 'center',
                        padding: '80px 20px', display: 'flex', flexDirection: 'column',
                        alignItems: 'center', gap: '16px',
                    }}>
                        <span style={{ fontSize: '64px', opacity: 0.15 }}>🍦</span>
                        <span style={{ fontSize: '16px', fontWeight: '900', color: '#d1d5db', textTransform: 'uppercase', letterSpacing: '2px' }}>
                            Sin pedidos pendientes
                        </span>
                    </div>
                )}

                {orders.map(order => {
                    // V15 (Fase 15.3): urgencia por tiempo transcurrido (solo color).
                    const elapsedSec = computeElapsedSec(order.created_at, serverOffsetHours, nowMs);
                    const level = classifyUrgency(elapsedSec, thresholds);
                    const uColor = urgencyColor(level);
                    return (
                        <div key={order.ticket_id} style={{
                            background: '#ffffff',
                            border: '1px solid #e5e7eb',
                            borderLeft: `4px solid ${uColor.border}`,
                            borderRadius: '4px',
                            overflow: 'hidden',
                        }}>
                            {/* Order Header */}
                            <div style={{
                                padding: '12px 16px',
                                background: '#f9fafb',
                                borderBottom: '1px solid #e5e7eb',
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            }}>
                                <div>
                                    <span style={{ fontSize: '18px', fontWeight: '900', color: '#0f0f0f' }}>
                                        #{order.account_num}
                                    </span>
                                    {order.customer_group_name && (
                                        <span style={{
                                            display: 'block', fontSize: '11px', color: '#6b7280',
                                            fontWeight: '600', marginTop: '2px',
                                        }}>
                                            👥 {order.customer_group_name}
                                        </span>
                                    )}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    {/* V15 (Fase 15.3): badge de tiempo transcurrido. */}
                                    <span style={{
                                        background: uColor.bg || '#f3f4f6',
                                        border: `1px solid ${uColor.border}`,
                                        borderRadius: '100px', padding: '3px 10px',
                                        fontSize: '11px', fontWeight: '800', color: uColor.text,
                                    }}>
                                        ⏱ {formatElapsed(elapsedSec)}
                                    </span>
                                    <span style={{ fontSize: '10px', color: '#9ca3af', fontWeight: '600' }}>
                                        {order.terminal_id}
                                    </span>
                                </div>
                            </div>

                            {/* Items */}
                            <div style={{ padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {order.items.map(item => {
                                    const s = STATUS_META[item.item_status] || STATUS_META.PENDING;
                                    return (
                                        <div key={item.item_id} style={{
                                            background: s.bg,
                                            border: `1px solid ${s.border}`,
                                            borderRadius: '6px',
                                            padding: '12px',
                                        }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                <div>
                                                    <span style={{ fontSize: '14px', fontWeight: '800', color: '#0f0f0f' }}>
                                                        🍦 {item.product_name} ×{item.quantity}
                                                    </span>
                                                    {item.recipient_name && (
                                                        <span style={{
                                                            display: 'block', fontSize: '11px', color: '#6b7280',
                                                            fontWeight: '600', marginTop: '2px',
                                                        }}>
                                                            👤 {item.recipient_name}
                                                        </span>
                                                    )}
                                                    {item.components?.length > 0 && (
                                                        <div style={{ marginTop: '6px', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                                            {item.components.map(c => (
                                                                <span key={c.id} style={{
                                                                    background: '#ffffff',
                                                                    border: '1px solid #e5e7eb',
                                                                    borderRadius: '4px', padding: '2px 8px',
                                                                    fontSize: '10px', color: '#374151', fontWeight: '700',
                                                                }}>
                                                                    {c.component_name}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                                <span style={{
                                                    fontSize: '10px', fontWeight: '800',
                                                    color: s.text, textTransform: 'uppercase',
                                                    letterSpacing: '0.5px', whiteSpace: 'nowrap',
                                                    background: '#ffffff', border: `1px solid ${s.border}`,
                                                    padding: '3px 8px', borderRadius: '100px',
                                                }}>
                                                    {s.label}
                                                </span>
                                            </div>
                                            {/* Botones */}
                                            <div style={{ display: 'flex', gap: '6px', marginTop: '10px' }}>
                                                {item.item_status === 'PENDING' && (
                                                    <button onClick={() => handleStatusChange(item.item_id, 'IN_PROGRESS')} style={{
                                                        flex: 1, background: '#0f0f0f', border: 'none',
                                                        borderRadius: '6px', padding: '8px', color: '#ffffff',
                                                        fontWeight: '800', fontSize: '11px', cursor: 'pointer',
                                                        textTransform: 'uppercase', letterSpacing: '1px',
                                                    }}>
                                                        Preparar →
                                                    </button>
                                                )}
                                                {item.item_status === 'IN_PROGRESS' && (
                                                    <button onClick={() => handleStatusChange(item.item_id, 'READY')} style={{
                                                        flex: 1, background: '#166534', border: 'none',
                                                        borderRadius: '6px', padding: '8px', color: '#ffffff',
                                                        fontWeight: '800', fontSize: '11px', cursor: 'pointer',
                                                        textTransform: 'uppercase', letterSpacing: '1px',
                                                    }}>
                                                        ✓ Listo
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
