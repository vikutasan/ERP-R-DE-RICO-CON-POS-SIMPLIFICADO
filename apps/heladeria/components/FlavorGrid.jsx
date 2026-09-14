/**
 * FlavorGrid.jsx — Grid de sabores estilo editorial B&W.
 * Inspirado en menús artesanales premium: fondo blanco, divisores lineales,
 * badge de precio en píldora oscura, inversión total al seleccionar.
 */
import React from 'react';

export function FlavorGrid({ sabores, onSelect, selectedBolas = [], maxBolas = 3 }) {
    const isFull = selectedBolas.length >= maxBolas;

    return (
        <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
        }}>
            {sabores.map((sabor, idx) => {
                const isDisabled = !sabor.is_available;
                const isSelected = selectedBolas.some(b => b.config_id === sabor.config_id);
                const cantSelect = isFull && !isSelected;
                const col = idx % Math.ceil(Math.sqrt(sabores.length));

                return (
                    <button
                        key={sabor.config_id}
                        onClick={() => !isDisabled && !cantSelect && onSelect(sabor)}
                        disabled={isDisabled || cantSelect}
                        style={{
                            position: 'relative',
                            background: isSelected ? '#0f0f0f' : '#ffffff',
                            border: 'none',
                            borderRight: '1px solid #e5e7eb',
                            borderBottom: '1px solid #e5e7eb',
                            padding: '28px 16px 20px',
                            cursor: isDisabled || cantSelect ? 'not-allowed' : 'pointer',
                            opacity: isDisabled ? 0.45 : cantSelect ? 0.55 : 1,
                            transition: 'background 0.15s ease, color 0.15s ease',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '10px',
                            minHeight: '120px',
                        }}
                    >
                        {/* Price badge */}
                        <span style={{
                            position: 'absolute',
                            top: '10px',
                            right: '10px',
                            background: isSelected ? '#ffffff' : '#0f0f0f',
                            color: isSelected ? '#0f0f0f' : '#ffffff',
                            fontSize: '10px',
                            fontWeight: '800',
                            padding: '3px 9px',
                            borderRadius: '100px',
                            letterSpacing: '0.3px',
                        }}>
                            ${parseFloat(sabor.price).toFixed(0)}
                        </span>

                        {/* Agotado badge */}
                        {isDisabled && (
                            <span style={{
                                position: 'absolute',
                                top: '10px',
                                left: '10px',
                                background: '#ef4444',
                                color: '#fff',
                                fontSize: '8px',
                                fontWeight: '900',
                                padding: '2px 7px',
                                borderRadius: '100px',
                                textTransform: 'uppercase',
                                letterSpacing: '0.5px',
                            }}>
                                Agotado
                            </span>
                        )}

                        {/* Emoji */}
                        <span style={{
                            fontSize: '36px',
                            filter: isDisabled ? 'grayscale(1)' : 'none',
                            lineHeight: 1,
                        }}>
                            🍨
                        </span>

                        {/* Name */}
                        <span style={{
                            fontSize: '12px',
                            fontWeight: '700',
                            color: isSelected ? '#ffffff' : '#0f0f0f',
                            textAlign: 'center',
                            lineHeight: '1.2',
                            letterSpacing: '0.2px',
                        }}>
                            {sabor.name}
                        </span>

                        {/* Selected checkmark */}
                        {isSelected && (
                            <span style={{
                                position: 'absolute',
                                bottom: '8px',
                                right: '10px',
                                color: '#ffffff',
                                fontSize: '14px',
                                fontWeight: '900',
                            }}>✓</span>
                        )}
                    </button>
                );
            })}
        </div>
    );
}
