/**
 * FlavorGrid.jsx — Grid de sabores con colores representativos.
 * Sabores agotados aparecen en gris con badge rojo.
 * Estética Häagen-Dazs premium dark mode.
 */
import React from 'react';

// Mapa de colores por nombre de sabor (fallback a rosa)
const SABOR_COLORS = {
    'chocolate': '#5C3D2E',
    'vainilla': '#F3E5AB',
    'fresa': '#E8474C',
    'mango': '#FFB347',
    'cookies': '#C4A882',
    'nuez': '#8B6914',
    'pistache': '#93C572',
    'cafe': '#6F4E37',
    'oreo': '#2C2C2C',
    'chicle': '#FF69B4',
    'limon': '#FFF44F',
    'coco': '#FFFDD0',
    'mora': '#4B0082',
    'guanabana': '#C8E6C9',
    'queso': '#FFD700',
};

function getColorForFlavor(name) {
    const lower = (name || '').toLowerCase();
    for (const [key, color] of Object.entries(SABOR_COLORS)) {
        if (lower.includes(key)) return color;
    }
    return '#f9a8d4'; // Rosa default
}

function isLightColor(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return (r * 299 + g * 587 + b * 114) / 1000 > 128;
}

export function FlavorGrid({ sabores, onSelect, selectedBolas = [], maxBolas = 3 }) {
    const isFull = selectedBolas.length >= maxBolas;

    return (
        <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))',
            gap: '10px',
        }}>
            {sabores.map((sabor) => {
                const color = getColorForFlavor(sabor.name);
                const isLight = isLightColor(color);
                const isDisabled = !sabor.is_available;
                const isSelected = selectedBolas.some(b => b.config_id === sabor.config_id);
                const cantSelect = isFull && !isSelected;

                return (
                    <button
                        key={sabor.config_id}
                        onClick={() => !isDisabled && !cantSelect && onSelect(sabor)}
                        disabled={isDisabled || cantSelect}
                        style={{
                            position: 'relative',
                            background: isDisabled
                                ? 'rgba(255,255,255,0.05)'
                                : `linear-gradient(135deg, ${color}, ${color}dd)`,
                            border: isSelected
                                ? '3px solid #f43f5e'
                                : '2px solid rgba(255,255,255,0.1)',
                            borderRadius: '16px',
                            padding: '16px 8px',
                            cursor: isDisabled || cantSelect ? 'not-allowed' : 'pointer',
                            opacity: isDisabled ? 0.4 : cantSelect ? 0.6 : 1,
                            transition: 'all 0.2s ease',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '6px',
                            minHeight: '90px',
                            transform: isSelected ? 'scale(1.05)' : 'scale(1)',
                            boxShadow: isSelected
                                ? '0 0 20px rgba(244,63,94,0.4)'
                                : '0 2px 8px rgba(0,0,0,0.2)',
                        }}
                    >
                        {isDisabled && (
                            <span style={{
                                position: 'absolute',
                                top: '-6px',
                                right: '-6px',
                                background: '#ef4444',
                                color: '#fff',
                                fontSize: '9px',
                                fontWeight: '900',
                                padding: '2px 6px',
                                borderRadius: '8px',
                                textTransform: 'uppercase',
                                letterSpacing: '0.5px',
                            }}>
                                Agotado
                            </span>
                        )}
                        <span style={{
                            fontSize: '24px',
                            filter: isDisabled ? 'grayscale(1)' : 'none',
                        }}>
                            🍨
                        </span>
                        <span style={{
                            fontSize: '11px',
                            fontWeight: '800',
                            color: isDisabled ? '#666' : isLight ? '#1a1a1a' : '#fff',
                            textAlign: 'center',
                            lineHeight: '1.2',
                            textTransform: 'uppercase',
                            letterSpacing: '0.3px',
                        }}>
                            {sabor.name}
                        </span>
                        <span style={{
                            fontSize: '10px',
                            color: isDisabled ? '#555' : isLight ? '#333' : 'rgba(255,255,255,0.7)',
                            fontWeight: '600',
                        }}>
                            ${parseFloat(sabor.price).toFixed(0)}
                        </span>
                    </button>
                );
            })}
        </div>
    );
}
