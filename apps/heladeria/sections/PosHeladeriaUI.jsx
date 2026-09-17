/**
 * PosHeladeriaUI.jsx — Punto de Venta Heladería.
 * Estética editorial B&W: blanco, divisores lineales, sin gradientes.
 * Layout: [Catálogo] | [Armado Rápido] | [Ticket]
 *
 * v8 (POS-CATEGORIAS): la navegación es por CATEGORÍA, igual que el POS de
 * Panadería. Ya NO existen las tres secciones fijas (Recipientes/Sabores/
 * Extras): el usuario crea las categorías en el Maestro de Productos y arrastra
 * los productos. `component_type` se conserva como COMPORTAMIENTO del item al
 * armar el helado (receta), no como eje de navegación.
 */
import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useHeladeriaMenu } from '../hooks/useHeladeriaMenu';
import { useQuickBuilder } from '../hooks/useQuickBuilder';
import { useHeladeriaCart } from '../hooks/useHeladeriaCart';
import { FlavorGrid } from '../components/FlavorGrid';
import { QuickIceCreamPanel } from '../components/QuickIceCreamPanel';
import { HeladeriaTicketPanel } from '../components/HeladeriaTicketPanel';
import { FlavorAvailabilityToggle } from '../components/FlavorAvailabilityToggle';
import {
    buildCategoryNav,
    getItemsByCategory,
    resolveInitialCategoryId,
} from '../utils/heladeriaCategoryNav';
import {
    buildImageChain,
    resolveActiveImage,
    initialImageStatus,
} from '../utils/heladeriaImageResolver';

/** Emoji por rol de receta (comportamiento), no por categoría. */
const ROLE_EMOJI = {
    RECIPIENTE: '🥤',
    TAMAÑO: '📐',
    SABOR: '🍨',
    EXTRA: '✨',
    BEBIDA_BASE: '🥛',
};

export function PosHeladeriaUI({ onBack, terminalId = 'H1', employeeId = null, employeeName = '' }) {
    const { menu, loading, error, refresh } = useHeladeriaMenu();
    const builder = useQuickBuilder();
    const cart = useHeladeriaCart({
        sessionId: null,
        terminalId,
        capturedById: employeeId,
    });

    const [activeCategoryId, setActiveCategoryId] = useState(null);
    const [showAvailability, setShowAvailability] = useState(false);

    // Índice de navegación por categoría (derivado del menú).
    const nav = useMemo(() => buildCategoryNav(menu), [menu]);

    // Fijar la categoría activa cuando el menú llega o cambia.
    useEffect(() => {
        if (nav.length === 0) {
            setActiveCategoryId(null);
            return;
        }
        const stillExists = nav.some((c) => c.id === activeCategoryId);
        if (!stillExists) setActiveCategoryId(resolveInitialCategoryId(nav));
    }, [nav, activeCategoryId]);

    // Items de la categoría activa.
    const visibleItems = useMemo(
        () => getItemsByCategory(menu, activeCategoryId),
        [menu, activeCategoryId]
    );

    // Sabores visibles (para el panel de disponibilidad y el armado rápido).
    const visibleSabores = useMemo(
        () => visibleItems.filter((i) => i.component_type === 'SABOR'),
        [visibleItems]
    );

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
                        ⛔ Agotar Producto
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
                    <CategoryBar
                        nav={nav}
                        activeCategoryId={activeCategoryId}
                        onSelect={setActiveCategoryId}
                    />

                    {/* Contenido */}
                    <div style={{ flex: 1, overflowY: 'auto' }}>
                        {showAvailability && visibleSabores.length > 0 && (
                            <AvailabilityPanel
                                sabores={visibleSabores}
                                onToggled={refresh}
                            />
                        )}

                        {visibleItems.length === 0 ? (
                            <EmptyCategory />
                        ) : (
                            <ItemGrid
                                items={visibleItems}
                                builder={builder}
                            />
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
                    availableExtras={visibleItems.filter(
                        (i) => i.component_type === 'EXTRA' && i.is_available
                    )}
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

/**
 * Barra de categorías — espeja el comportamiento del POS de Panadería.
 * Se alimenta del índice `nav` derivado del menú.
 */
function CategoryBar({ nav, activeCategoryId, onSelect }) {
    if (nav.length === 0) return null;

    return (
        <div style={{
            display: 'flex', borderBottom: '1px solid #e5e7eb',
            overflowX: 'auto', flexShrink: 0,
        }}>
            {nav.map((cat) => {
                const isActive = cat.id === activeCategoryId;
                return (
                    <button
                        key={cat.id}
                        onClick={() => onSelect(cat.id)}
                        style={{
                            flex: '1 0 auto',
                            background: isActive ? '#0f0f0f' : '#ffffff',
                            border: 'none',
                            borderRight: '1px solid #e5e7eb',
                            padding: '14px 16px',
                            color: isActive ? '#ffffff' : '#6b7280',
                            fontSize: '11px',
                            fontWeight: '800',
                            textTransform: 'uppercase',
                            letterSpacing: '1px',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                            whiteSpace: 'nowrap',
                        }}
                    >
                        {cat.icon ? `${cat.icon} ` : ''}{cat.name}
                        <span style={{
                            display: 'block', fontSize: '16px', fontWeight: '900',
                            color: isActive ? '#ffffff' : '#9ca3af',
                            marginTop: '2px',
                        }}>
                            {cat.itemCount}
                        </span>
                    </button>
                );
            })}
        </div>
    );
}

/** Panel de control de disponibilidad (Agotar Producto). */
function AvailabilityPanel({ sabores, onToggled }) {
    return (
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
                {sabores.map((s) => (
                    <FlavorAvailabilityToggle
                        key={s.config_id}
                        configId={s.config_id}
                        name={s.name}
                        isAvailable={s.is_available}
                        onToggled={onToggled}
                    />
                ))}
            </div>
        </div>
    );
}

/** Estado vacío cuando una categoría no tiene productos. */
function EmptyCategory() {
    return (
        <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', padding: '60px 20px', gap: '10px',
            color: '#9ca3af',
        }}>
            <span style={{ fontSize: '40px' }}>📦</span>
            <span style={{ fontSize: '12px', fontWeight: '700', letterSpacing: '1px' }}>
                SIN PRODUCTOS EN ESTA CATEGORÍA
            </span>
            <span style={{ fontSize: '11px', textAlign: 'center', maxWidth: '280px' }}>
                Agrega productos desde el Maestro de Productos y arrástralos a esta categoría.
            </span>
        </div>
    );
}

/**
 * Grid de items de la categoría activa.
 * El comportamiento al hacer clic se decide por `component_type` (receta):
 *   - RECIPIENTE / TAMAÑO → selecciona el recipiente del armado
 *   - SABOR               → agrega una bola
 *   - EXTRA               → alterna el extra
 *   - BEBIDA_BASE         → agrega una bola (base líquida)
 */
function ItemGrid({ items, builder }) {
    return (
        <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
        }}>
            {items.map((item) => {
                const role = item.component_type;
                const isSelected = isItemSelected(item, builder, role);
                const disabled = !item.is_available;

                return (
                    <button
                        key={item.config_id}
                        onClick={() => handleItemClick(item, builder, role)}
                        disabled={disabled}
                        style={{
                            position: 'relative',
                            background: isSelected ? '#0f0f0f' : '#ffffff',
                            border: 'none',
                            borderRight: '1px solid #e5e7eb',
                            borderBottom: '1px solid #e5e7eb',
                            padding: '28px 14px 20px',
                            color: isSelected ? '#fff' : disabled ? '#9ca3af' : '#0f0f0f',
                            cursor: disabled ? 'not-allowed' : 'pointer',
                            display: 'flex', flexDirection: 'column',
                            alignItems: 'center', gap: '8px',
                            opacity: disabled ? 0.45 : 1,
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
                            ${parseFloat(item.base_price || item.price).toFixed(0)}
                        </span>
                        <ItemThumb item={item} role={role} />
                        <span style={{
                            fontSize: '12px', fontWeight: '800',
                            textAlign: 'center', lineHeight: '1.2',
                        }}>
                            {item.name}
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
    );
}

/**
 * Miniatura del item: cascada de imágenes idéntica al POS de Panadería
 * (API → SKU.png → SKU.jpg → Legacy → Emoji). Si toda la cascada falla,
 * cae al emoji del rol de receta.
 */
function ItemThumb({ item, role }) {
    const [status, setStatus] = useState(() => initialImageStatus(item));
    const chain = useMemo(() => buildImageChain(item), [item]);
    const active = resolveActiveImage(chain, status);

    if (!active) {
        return <span style={{ fontSize: '32px' }}>{ROLE_EMOJI[role] || '🍦'}</span>;
    }

    return (
        <img
            src={active.src}
            alt={item.name}
            onError={() => setStatus(active.next)}
            style={{
                width: '56px', height: '56px',
                objectFit: 'contain',
            }}
        />
    );
}

/** ¿El item ya está seleccionado en el armado actual? */
function isItemSelected(item, builder, role) {
    if (role === 'RECIPIENTE' || role === 'TAMAÑO') {
        return builder.recipiente?.config_id === item.config_id;
    }
    if (role === 'EXTRA') {
        return builder.extras.some((x) => x.config_id === item.config_id);
    }
    return builder.bolas.some((b) => b.config_id === item.config_id);
}

/** Despacha la acción de armado según el rol de receta del item. */
function handleItemClick(item, builder, role) {
    const payload = {
        config_id: item.config_id,
        product_id: item.product_id,
        name: item.name,
        price: item.price,
    };

    if (role === 'RECIPIENTE' || role === 'TAMAÑO') {
        builder.selectRecipiente(payload);
        return;
    }
    if (role === 'EXTRA') {
        builder.toggleExtra(payload);
        return;
    }
    builder.addBola(payload);
}
