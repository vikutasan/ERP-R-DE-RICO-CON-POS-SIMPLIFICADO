/**
 * PosHeladeriaUI.jsx — Punto de Venta Heladería.
 * UI optimizada para rapidez del personal de mostrador.
 * Layout: [Recipientes + Sabores + Extras] | [Armado Rápido] | [Ticket]
 */
import React, { useState, useCallback } from 'react';
import { useHeladeriaMenu } from '../hooks/useHeladeriaMenu';
import { useQuickBuilder } from '../hooks/useQuickBuilder';
import { useHeladeriaCart } from '../hooks/useHeladeriaCart';
import { FlavorGrid } from '../components/FlavorGrid';
import { QuickIceCreamPanel } from '../components/QuickIceCreamPanel';
import { HeladeriaTicketPanel } from '../components/HeladeriaTicketPanel';
import { FlavorAvailabilityToggle } from '../components/FlavorAvailabilityToggle';

export function PosHeladeriaUI({ onBack, terminalId = 'H1', employeeId = null, employeeName = '' }) {
    const { recipientes, sabores, extras, loading, error, refresh } = useHeladeriaMenu();
    const builder = useQuickBuilder();
    const cart = useHeladeriaCart({
        sessionId: null,
        terminalId,
        capturedById: employeeId,
    });
    
    const [activeTab, setActiveTab] = useState('sabores');
    const [showAvailability, setShowAvailability] = useState(false);

    const handleAddToTicket = useCallback(async () => {
        const summary = builder.getSummary();
        if (!summary) return;
        try {
            await cart.addBuiltIceCream(summary);
            builder.reset();
        } catch (err) {
            console.error('Error agregando al ticket:', err);
        }
    }, [builder, cart]);

    if (loading) {
        return (
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                height: '100vh', background: '#0a0a0a', color: '#f9a8d4',
                fontSize: '18px', fontWeight: '600', gap: '12px',
            }}>
                <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>🍦</span>
                Cargando menú...
                <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
            </div>
        );
    }

    if (error) {
        return (
            <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', height: '100vh', background: '#0a0a0a',
                color: '#ef4444', gap: '16px',
            }}>
                <span style={{ fontSize: '48px' }}>⚠️</span>
                <p style={{ fontWeight: '700' }}>{error}</p>
                <button onClick={refresh} style={{
                    background: '#f43f5e', color: '#fff', border: 'none',
                    padding: '12px 24px', borderRadius: '12px', fontWeight: '800',
                    cursor: 'pointer', fontSize: '14px',
                }}>
                    Reintentar
                </button>
            </div>
        );
    }

    return (
        <div style={{
            height: '100vh', background: '#0a0a0a', color: '#fff',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
            fontFamily: "'Inter', -apple-system, sans-serif",
        }}>
            {/* ═══ TOP BAR ═══ */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 20px',
                background: 'linear-gradient(135deg, rgba(244,63,94,0.15), rgba(236,72,153,0.1))',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <button onClick={onBack} style={{
                        background: 'rgba(255,255,255,0.08)', border: 'none', color: '#fff',
                        padding: '8px 16px', borderRadius: '10px', cursor: 'pointer',
                        fontSize: '13px', fontWeight: '700',
                    }}>
                        ← Hub
                    </button>
                    <h1 style={{
                        fontSize: '16px', fontWeight: '900', margin: 0,
                        background: 'linear-gradient(135deg, #f43f5e, #ec4899)',
                        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                        letterSpacing: '1px',
                    }}>
                        ⚡ POS HELADERÍA
                    </h1>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{
                        background: 'rgba(244,63,94,0.15)', color: '#f43f5e',
                        padding: '6px 14px', borderRadius: '10px',
                        fontSize: '11px', fontWeight: '800',
                    }}>
                        📟 {terminalId}
                    </span>
                    {employeeName && (
                        <span style={{
                            background: 'rgba(255,255,255,0.05)', color: '#ccc',
                            padding: '6px 14px', borderRadius: '10px',
                            fontSize: '11px', fontWeight: '600',
                        }}>
                            👤 {employeeName}
                        </span>
                    )}
                    <button
                        onClick={() => setShowAvailability(!showAvailability)}
                        style={{
                            background: showAvailability ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.08)',
                            border: showAvailability ? '1px solid rgba(239,68,68,0.3)' : '1px solid rgba(255,255,255,0.1)',
                            color: showAvailability ? '#ef4444' : '#999',
                            padding: '6px 14px', borderRadius: '10px',
                            fontSize: '11px', fontWeight: '800', cursor: 'pointer',
                            textTransform: 'uppercase',
                        }}
                    >
                        ⛔ Agotar Sabor
                    </button>
                </div>
            </div>

            {/* ═══ MAIN CONTENT (3 columnas) ═══ */}
            <div style={{
                flex: 1, display: 'grid',
                gridTemplateColumns: '1fr 320px 320px',
                gap: '16px', padding: '16px',
                overflow: 'hidden',
            }}>
                {/* COLUMNA 1: Catálogo (Recipientes → Sabores → Extras) */}
                <div style={{
                    display: 'flex', flexDirection: 'column', gap: '12px',
                    overflowY: 'auto',
                }}>
                    {/* Tabs de navegación */}
                    <div style={{ display: 'flex', gap: '6px' }}>
                        {[
                            { key: 'recipientes', label: '🥤 Recipientes', count: recipientes.length },
                            { key: 'sabores', label: '🍨 Sabores', count: sabores.length },
                            { key: 'extras', label: '✨ Extras', count: extras.length },
                        ].map(tab => (
                            <button
                                key={tab.key}
                                onClick={() => setActiveTab(tab.key)}
                                style={{
                                    background: activeTab === tab.key
                                        ? 'linear-gradient(135deg, #f43f5e, #ec4899)'
                                        : 'rgba(255,255,255,0.05)',
                                    border: activeTab === tab.key
                                        ? 'none'
                                        : '1px solid rgba(255,255,255,0.08)',
                                    borderRadius: '12px',
                                    padding: '10px 18px',
                                    color: activeTab === tab.key ? '#fff' : '#888',
                                    fontSize: '12px',
                                    fontWeight: '800',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s ease',
                                }}
                            >
                                {tab.label} ({tab.count})
                            </button>
                        ))}
                    </div>

                    {/* Contenido del tab activo */}
                    <div style={{ flex: 1, overflowY: 'auto', paddingRight: '4px' }}>
                        {activeTab === 'recipientes' && (
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                                gap: '10px',
                            }}>
                                {recipientes.map(r => {
                                    const isSelected = builder.recipiente?.config_id === r.config_id;
                                    return (
                                        <button
                                            key={r.config_id}
                                            onClick={() => builder.selectRecipiente({
                                                ...r,
                                                config_id: r.config_id,
                                                product_id: r.product_id,
                                            })}
                                            style={{
                                                background: isSelected
                                                    ? 'linear-gradient(135deg, rgba(244,63,94,0.2), rgba(236,72,153,0.15))'
                                                    : 'rgba(255,255,255,0.04)',
                                                border: isSelected
                                                    ? '2px solid #f43f5e'
                                                    : '1px solid rgba(255,255,255,0.08)',
                                                borderRadius: '16px',
                                                padding: '20px 14px',
                                                color: '#fff',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                alignItems: 'center',
                                                gap: '8px',
                                                transition: 'all 0.2s ease',
                                                transform: isSelected ? 'scale(1.03)' : 'scale(1)',
                                                boxShadow: isSelected ? '0 0 20px rgba(244,63,94,0.2)' : 'none',
                                            }}
                                        >
                                            <span style={{ fontSize: '28px' }}>🥤</span>
                                            <span style={{ fontSize: '13px', fontWeight: '800' }}>{r.name}</span>
                                            <span style={{ fontSize: '11px', color: '#f59e0b', fontWeight: '700' }}>
                                                ${parseFloat(r.base_price || r.price).toFixed(0)}
                                            </span>
                                            {r.max_scoops && (
                                                <span style={{ fontSize: '10px', color: '#888' }}>
                                                    Máx {r.max_scoops} bolas
                                                </span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        )}

                        {activeTab === 'sabores' && (
                            <>
                                {/* Panel de Agotar Sabor (condicional) */}
                                {showAvailability && (
                                    <div style={{
                                        background: 'rgba(239,68,68,0.05)',
                                        border: '1px solid rgba(239,68,68,0.15)',
                                        borderRadius: '14px',
                                        padding: '14px',
                                        marginBottom: '12px',
                                    }}>
                                        <span style={{
                                            fontSize: '11px', color: '#ef4444', fontWeight: '800',
                                            textTransform: 'uppercase', letterSpacing: '1px',
                                            display: 'block', marginBottom: '10px',
                                        }}>
                                            ⛔ Control de Disponibilidad
                                        </span>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                            {sabores.map(s => (
                                                <FlavorAvailabilityToggle
                                                    key={s.config_id}
                                                    configId={s.config_id}
                                                    name={s.name}
                                                    isAvailable={s.is_available}
                                                    onToggled={() => refresh()}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                )}
                                <FlavorGrid
                                    sabores={sabores}
                                    onSelect={(sabor) => builder.addBola({
                                        config_id: sabor.config_id,
                                        product_id: sabor.product_id,
                                        name: sabor.name,
                                        price: sabor.price,
                                    })}
                                    selectedBolas={builder.bolas}
                                    maxBolas={builder.maxBolas}
                                />
                            </>
                        )}

                        {activeTab === 'extras' && (
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
                                gap: '10px',
                            }}>
                                {extras.map(e => {
                                    const isSelected = builder.extras.some(x => x.config_id === e.config_id);
                                    return (
                                        <button
                                            key={e.config_id}
                                            onClick={() => builder.toggleExtra({
                                                config_id: e.config_id,
                                                product_id: e.product_id,
                                                name: e.name,
                                                price: e.price,
                                            })}
                                            disabled={!e.is_available}
                                            style={{
                                                background: isSelected
                                                    ? 'rgba(244,63,94,0.15)'
                                                    : 'rgba(255,255,255,0.04)',
                                                border: isSelected
                                                    ? '2px solid #f43f5e'
                                                    : '1px solid rgba(255,255,255,0.08)',
                                                borderRadius: '14px',
                                                padding: '16px 10px',
                                                color: isSelected ? '#f43f5e' : e.is_available ? '#fff' : '#555',
                                                cursor: e.is_available ? 'pointer' : 'not-allowed',
                                                display: 'flex', flexDirection: 'column',
                                                alignItems: 'center', gap: '6px',
                                                opacity: e.is_available ? 1 : 0.4,
                                                transition: 'all 0.2s ease',
                                            }}
                                        >
                                            <span style={{ fontSize: '22px' }}>✨</span>
                                            <span style={{ fontSize: '12px', fontWeight: '700' }}>{e.name}</span>
                                            <span style={{ fontSize: '11px', color: '#f59e0b', fontWeight: '600' }}>
                                                +${parseFloat(e.price).toFixed(0)}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                {/* COLUMNA 2: Armado Rápido */}
                <QuickIceCreamPanel
                    recipiente={builder.recipiente}
                    bolas={builder.bolas}
                    extras={builder.extras}
                    subtotal={builder.subtotal}
                    recipientName={builder.recipientName}
                    onSetRecipientName={builder.setRecipientName}
                    onRemoveBola={builder.removeBola}
                    onToggleExtra={builder.toggleExtra}
                    onAddToTicket={handleAddToTicket}
                    onReset={builder.reset}
                    isValid={builder.isValid}
                    maxBolas={builder.maxBolas}
                    bolasRestantes={builder.bolasRestantes}
                    availableExtras={extras.filter(e => e.is_available)}
                />

                {/* COLUMNA 3: Ticket */}
                <HeladeriaTicketPanel
                    ticket={cart.ticket}
                    items={cart.items}
                    total={cart.total}
                    onRemoveItem={cart.removeItem}
                    onCheckout={() => {/* TODO: integrar checkout existente */}}
                    onClearCart={cart.clearCart}
                    itemCount={cart.itemCount}
                />
            </div>
        </div>
    );
}
