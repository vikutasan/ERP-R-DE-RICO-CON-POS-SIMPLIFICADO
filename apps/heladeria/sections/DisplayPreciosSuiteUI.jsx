import React, { useState } from 'react';

/**
 * DisplayPreciosSuiteUI — Landing de la sub-suite "Display de Precios".
 *
 * Utiliza exactamente el mismo patrón de diseño (GestorSuiteUI) que las
 * otras suites del Hub de Heladería para mantener consistencia visual.
 *
 * @param {function} props.onBack        Volver al nivel superior.
 * @param {function} props.onSelectTool  (toolId) => void.
 */
export const DisplayPreciosSuiteUI = ({ onBack, onSelectTool }) => {
    const [hoveredIdx, setHoveredIdx] = useState(null);

    const tools = [
        {
            id: 'config',
            nombre: 'Configurador de Displays',
            descripcion: 'Diseña tus pantallas: columnas, temas y visibilidad. Hasta 3 pantallas nombradas con vista previa en vivo.',
            icono: '🎨',
        },
        {
            id: 'selector',
            nombre: 'Displays de Precios',
            descripcion: 'Elige qué pantalla proyectar en cada TV. Abre cada menú en su propio monitor independiente.',
            icono: '📺',
        },
    ];

    return (
        <div style={{
            height: '100%',
            background: '#ffffff',
            display: 'flex',
            flexDirection: 'column',
            fontFamily: "'Inter', -apple-system, sans-serif",
            overflow: 'auto',
        }}>
            <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />

            {/* Top strip con botón volver */}
            <div style={{
                borderBottom: '1px solid #0f0f0f',
                padding: '12px 40px',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
                <button
                    onClick={onBack}
                    style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        fontSize: '12px', fontWeight: '800', color: '#0f0f0f',
                        letterSpacing: '1px', textTransform: 'uppercase',
                        display: 'flex', alignItems: 'center', gap: '6px',
                        padding: 0,
                    }}
                >
                    ← Volver
                </button>
                <span style={{
                    fontSize: '11px', fontWeight: '800', color: '#0f0f0f',
                    textTransform: 'uppercase', letterSpacing: '3px',
                    textDecoration: 'underline', textUnderlineOffset: '4px',
                }}>
                    Hub de Heladería
                </span>
            </div>

            {/* Suite header */}
            <div style={{
                padding: '48px 40px 32px',
                borderBottom: '1px solid #0f0f0f',
            }}>
                <span style={{
                    fontSize: '11px', fontWeight: '800', color: '#d1d5db',
                    letterSpacing: '2px', textTransform: 'uppercase',
                    display: 'block', marginBottom: '12px',
                }}>
                    03 — Suite
                </span>
                <h1 style={{
                    margin: 0,
                    fontSize: 'clamp(2rem, 4vw, 3.5rem)',
                    fontWeight: '900',
                    color: '#0f0f0f',
                    lineHeight: '1.05',
                    letterSpacing: '-1.5px',
                }}>
                    Gestor de Displays de Precios
                </h1>
                <p style={{
                    margin: '16px 0 0',
                    fontSize: '28px', color: '#6b7280', fontWeight: '500',
                }}>
                    Sub-suite de diseño y proyección de cartas
                </p>
            </div>

            {/* Tools grid — 2 cards */}
            <div style={{
                flex: 1,
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
            }}>
                {tools.map((tool, idx) => (
                    <button
                        key={tool.id}
                        onClick={() => onSelectTool(tool.id)}
                        onMouseEnter={() => setHoveredIdx(idx)}
                        onMouseLeave={() => setHoveredIdx(null)}
                        style={{
                            background: hoveredIdx === idx ? '#0f0f0f' : '#ffffff',
                            border: 'none',
                            borderRight: idx === 0 ? '1px solid #e5e7eb' : 'none',
                            borderBottom: '1px solid #e5e7eb',
                            padding: '48px 36px',
                            cursor: 'pointer',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'flex-start',
                            gap: '16px',
                            transition: 'background 0.15s ease',
                            textAlign: 'left',
                            outline: 'none',
                        }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'flex-start' }}>
                            <span style={{
                                fontSize: '11px', fontWeight: '800',
                                color: hoveredIdx === idx ? '#6b7280' : '#d1d5db',
                                letterSpacing: '1px', transition: 'color 0.15s',
                            }}>
                                {String(idx + 1).padStart(2, '0')}
                            </span>
                            <span style={{ fontSize: '32px', lineHeight: 1 }}>{tool.icono}</span>
                        </div>

                        <h3 style={{
                            margin: 0,
                            fontSize: '1.3rem',
                            fontWeight: '900',
                            color: hoveredIdx === idx ? '#ffffff' : '#0f0f0f',
                            lineHeight: '1.2',
                            letterSpacing: '-0.3px',
                            transition: 'color 0.15s',
                        }}>
                            {tool.nombre}
                        </h3>

                        <p style={{
                            margin: 0,
                            color: hoveredIdx === idx ? '#9ca3af' : '#6b7280',
                            fontSize: '13px',
                            lineHeight: '1.5',
                            fontWeight: '400',
                            transition: 'color 0.15s',
                        }}>
                            {tool.descripcion}
                        </p>

                        <span style={{
                            fontSize: '20px',
                            color: hoveredIdx === idx ? '#ffffff' : '#d1d5db',
                            transition: 'color 0.15s, transform 0.15s',
                            transform: hoveredIdx === idx ? 'translateX(4px)' : 'translateX(0)',
                            display: 'inline-block',
                            marginTop: 'auto',
                        }}>
                            →
                        </span>
                    </button>
                ))}
            </div>
        </div>
    );
};
