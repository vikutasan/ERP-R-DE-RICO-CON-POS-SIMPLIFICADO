/**
 * PosHeladeriaUI.jsx — Punto de Venta Heladería.
 * Estética editorial B&W: blanco, divisores lineales, sin gradientes.
 * Layout: [Catálogo] | [Armado Rápido] | [Ticket]
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
                height: '100vh', background: '#ffffff', color: '#0f0f0f',
                fontSize: '16px', fontWeight: '800', gap: '12px',
                fontFamily: "'Inter', sans-serif",
            }}>
                🍦 Cargando menú...
            </div>
        );
    }

    if (error) {
        return (
            <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', height: '100vh', background: '#ffffff',
                color: '#0f0f0f', gap: '16px', fontFamily: "'Inter', sans-serif",
            }}>
                <span style={{ fontSize: '48px' }}>⚠️</span>
                <p style={{ fontWeight: '700' }}>{error}</p>
                <button onClick={refresh} style={{
                    background: '#0f0f0f', color: '#fff', border: 'none',
                    padding: '12px 24px', borderRadius: '8px', fontWeight: '900',
                    cursor: 'pointer', fontSize: '13px', letterSpacing: '1px',
                }}>
                    Reintentar
                </button>
            </div>
        );
    }

    const TABS = [
        { key: 'recipientes', label: 'Recipientes', count: recipientes.length },
        { key: 'sabores', label: 'Sabores', count: sabores.length },
        { key: 'extras', label: 'Extras', count: extras.length },
    ];

    return (
        <div style={{
            height: '100vh', background: '#ffffff', color: '#0f0f0f',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
            fontFamily: "'Inter', -apple-system, sans-serif",
        }}>
            {/* ═══ TOP BAR ═══ */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '0 20px',
                borderBottom: '1px solid #0f0f0f',
                minHeight: '52px',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <button onClick={onBack} style={{
                        background: 'none', border: '1px solid #d1d5db', color: '#6b7280',
                        padding: '6px 16px', borderRadius: '100px', cursor: 'pointer',
                        fontSize: '12px', fontWeight: '700',
                    }}>
                        ← Hub
                    </button>
                    <h1 style={{
                        fontSize: '13px', fontWeight: '900', margin: 0,
                        color: '#0f0f0f', textTransform: 'uppercase', letterSpacing: '3px',
                    }}>
                        POS Heladería
                    </h1>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{
                        background: '#0f0f0f', color: '#ffffff',
                        padding: '4px 12px', borderRadius: '100px',
                        fontSize: '11px', fontWeight: '800', letterSpacing: '1px',
                    }}>
                        {terminalId}
                    </span>
                    {employeeName && (
                        <span style={{
                            border: '1px solid #e5e7eb', color: '#6b7280',
                            padding: '4px 12px', borderRadius: '100px',
                            fontSize: '11px', fontWeight: '600',
                        }}>
                            {employeeName}
                        </span>
                    )}
                    <button
                        onClick={() => setShowAvailability(!showAvailability)}
                        style={{
                            background: showAvailability ? '#0f0f0f' : '#ffffff',
                            border: '1px solid #0f0f0f',
                            color: showAvailability ? '#ffffff' : '#0f0f0f',
                            padding: '6px 14px', borderRadius: '100px',
                            fontSize: '11px', fontWeight: '800', cursor: 'pointer',
                            textTransform: 'uppercase', letterSpacing: '0.5px',
                        }}
                    >
                        ⛔ Agotar Sabor
                    </button>
                </div>
            </div>

            {/* ═══ MAIN CONTENT (3 columnas) ═══ */}
            <div style={{
                flex: 1, display: 'grid',
                gridTemplateColumns: '1fr 300px 300px',
                overflow: 'hidden',
            }}>
                {/* COLUMNA 1: Catálogo */}
                <div style={{
                    display: 'flex', flexDirection: 'column',
                    borderRight: '1px solid #0f0f0f',
                    overflow: 'hidden',
                }}>
                    {/* Tabs */}
                    <div style={{
                        display: 'flex', borderBottom: '1px solid #e5e7eb',
                    }}>
                        {TABS.map(tab => (
                            <button
                                key={tab.key}
                                onClick={() => setActiveTab(tab.key)}
                                style={{
                                    flex: 1,
                                    background: activeTab === tab.key ? '#0f0f0f' : '#ffffff',
                                    border: 'none',
                                    borderRight: '1px solid #e5e7eb',
                                    padding: '14px 8px',
                                    color: activeTab === tab.key ? '#ffffff' : '#6b7280',
                                    fontSize: '11px',
                                    fontWeight: '800',
                                    textTransform: 'uppercase',
                                    letterSpacing: '1px',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease',
                                }}
                            >
                                {tab.label}
                                <span style={{
                                    display: 'block', fontSize: '16px', fontWeight: '900',
                                    color: activeTab === tab.key ? '#ffffff' : '#9ca3af',
                                    marginTop: '2px',
                                }}>
                                    {tab.count}
                                </span>
                            </button>
                        ))}
                    </div>

                    {/* Contenido */}
                    <div style={{ flex: 1, overflowY: 'auto' }}>
                        {activeTab === 'recipientes' && (
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
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
                                                position: 'relative',
                                                background: isSelected ? '#0f0f0f' : '#ffffff',
                                                border: 'none',
                                                borderRight: '1px solid #e5e7eb',
                                                borderBottom: '1px solid #e5e7eb',
                                                padding: '28px 14px 20px',
                                                cursor: 'pointer',
                                                display: 'flex', flexDirection: 'column',
                                                alignItems: 'center', gap: '8px',
                                                transition: 'all 0.15s ease',
                                                minHeight: '110px',
                                            }}
                                        >
                                            {/* Price badge */}
                                            <span style={{
                                                position: 'absolute', top: '10px', right: '10px',
                                                background: isSelected ? '#ffffff' : '#0f0f0f',
                                                color: isSelected ? '#0f0f0f' : '#ffffff',
                                                fontSize: '10px', fontWeight: '800',
                                                padding: '3px 9px', borderRadius: '100px',
                                            }}>
                                                ${parseFloat(r.base_price || r.price).toFixed(0)}
                                            </span>
                                            <span style={{ fontSize: '32px' }}>🥤</span>
                                            <span style={{
                                                fontSize: '12px', fontWeight: '800',
                                                color: isSelected ? '#ffffff' : '#0f0f0f',
                                                textAlign: 'center', lineHeight: '1.2',
                                            }}>
                                                {r.name}
                                            </span>
                                            {r.max_scoops && (
                                                <span style={{
                                                    fontSize: '10px',
                                                    color: isSelected ? '#9ca3af' : '#9ca3af',
                                                }}>
                                                    Máx {r.max_scoops} bolas
                                                </span>
                                            )}
                                            {isSelected && (
                                                <span style={{
                                                    position: 'absolute', bottom: '8px', right: '10px',
                                                    color: '#ffffff', fontSize: '14px', fontWeight: '900',
                                                }}>✓</span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        )}

                        {activeTab === 'sabores' && (
                            <>
                                {/* Panel disponibilidad */}
                                {showAvailability && (
                                    <div style={{
                                        background: '#fef2f2',
                                        borderBottom: '1px solid #fecaca',
                                        padding: '14px 16px',
                                    }}>
                                        <span style={{
                                            fontSize: '10px', color: '#ef4444', fontWeight: '800',
                                            textTransform: 'uppercase', letterSpacing: '2px',
                                            display: 'block', marginBottom: '10px',
                                        }}>
                                            Control de Disponibilidad
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
                                                position: 'relative',
                                                background: isSelected ? '#0f0f0f' : '#ffffff',
                                                border: 'none',
                                                borderRight: '1px solid #e5e7eb',
                                                borderBottom: '1px solid #e5e7eb',
                                                padding: '28px 14px 20px',
                                                color: isSelected ? '#fff' : e.is_available ? '#0f0f0f' : '#9ca3af',
                                                cursor: e.is_available ? 'pointer' : 'not-allowed',
                                                display: 'flex', flexDirection: 'column',
                                                alignItems: 'center', gap: '8px',
                                                opacity: e.is_available ? 1 : 0.45,
                                                transition: 'all 0.15s ease',
                                                minHeight: '110px',
                                            }}
                                        >
                                            <span style={{
                                                position: 'absolute', top: '10px', right: '10px',
                                                background: isSelected ? '#ffffff' : '#0f0f0f',
                                                color: isSelected ? '#0f0f0f' : '#ffffff',
                                                fontSize: '10px', fontWeight: '800',
                                                padding: '3px 9px', borderRadius: '100px',
                                            }}>
                                                +${parseFloat(e.price).toFixed(0)}
                                            </span>
                                            <span style={{ fontSize: '32px' }}>✨</span>
                                            <span style={{ fontSize: '12px', fontWeight: '800', textAlign: 'center' }}>
                                                {e.name}
                                            </span>
                                            {isSelected && (
                                                <span style={{
                                                    position: 'absolute', bottom: '8px', right: '10px',
                                                    color: '#ffffff', fontSize: '14px', fontWeight: '900',
                                                }}>✓</span>
                                            )}
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
