import React, { useState, Suspense } from 'react';

// ═══ LAZY IMPORTS — Aislamiento de secciones ═══
const PosHeladeriaUI = React.lazy(() => import('./sections/PosHeladeriaUI').then(m => ({default: m.PosHeladeriaUI})));
const TiendaInteractivaUI = React.lazy(() => import('./sections/TiendaInteractivaUI').then(m => ({default: m.TiendaInteractivaUI})));
const KdsHeladosUI = React.lazy(() => import('./sections/KdsHeladosUI').then(m => ({default: m.KdsHeladosUI})));
const KdsMalteadasUI = React.lazy(() => import('./sections/KdsMalteadasUI').then(m => ({default: m.KdsMalteadasUI})));
const DisplayTotemUI = React.lazy(() => import('./sections/DisplayTotemUI').then(m => ({default: m.DisplayTotemUI})));
const DisplayPreciosUI = React.lazy(() => import('./sections/DisplayPreciosUI').then(m => ({default: m.DisplayPreciosUI})));

// ErrorBoundary local para secciones internas
class SectionErrorBoundary extends React.Component {
    constructor(props) { super(props); this.state = { hasError: false, error: null }; }
    static getDerivedStateFromError(error) { return { hasError: true, error }; }
    render() {
        if (this.state.hasError) return (
            <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', height: '100%', gap: '16px', padding: '40px',
                background: '#ffffff', fontFamily: "'Inter', sans-serif",
            }}>
                <span style={{ fontSize: '48px' }}>⚠️</span>
                <h3 style={{ margin: 0, color: '#0f0f0f', fontWeight: '900' }}>Error en {this.props.name}</h3>
                <pre style={{ color: '#ef4444', fontSize: '11px', maxWidth: '500px', overflow: 'auto' }}>
                    {this.state.error?.toString()}
                </pre>
                <button onClick={this.props.onBack} style={{
                    background: '#0f0f0f', color: '#fff', border: 'none',
                    padding: '12px 24px', borderRadius: '8px', cursor: 'pointer',
                    fontWeight: '900', fontSize: '13px', letterSpacing: '1px',
                }}>
                    ← Volver
                </button>
            </div>
        );
        return this.props.children;
    }
}

const SectionLoader = () => (
    <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100%', color: '#0f0f0f', fontSize: '14px', gap: '12px',
        fontFamily: "'Inter', sans-serif", fontWeight: '700', background: '#ffffff',
    }}>
        <span>🍦</span> Cargando...
    </div>
);

/**
 * HeladeriaHubUI — Landing Page del Módulo Heladería
 * Estética editorial B&W — blanco, tipografía ultra-bold, divisores lineales.
 *
 * Estructura de navegación:
 *   Landing (3 gestores) → Sub-suite (2 herramientas cada una) → Herramienta real
 */

// ═══ Definición de los 3 gestores y sus herramientas internas ═══
const GESTORES = [
    {
        id: 'gestor_pos',
        nombre: 'Gestor de Puntos de Venta de Heladería',
        nombreCorto: 'Puntos de Venta',
        descripcion: 'Administra los puntos de venta y la tienda interactiva',
        icono: '⚡',
        num: '01',
        herramientas: [
            {
                id: 'pos_heladeria',
                nombre: 'POS Heladería',
                descripcion: 'Punto de venta rápido para el personal de mostrador',
                icono: '⚡',
            },
            {
                id: 'tienda',
                nombre: 'Tienda Interactiva',
                descripcion: 'Experiencia táctil para clientes en mostrador',
                icono: '🍦',
            },
        ],
    },
    {
        id: 'gestor_kds',
        nombre: 'Gestor de KDS de Heladería',
        nombreCorto: 'KDS',
        descripcion: 'Pantallas de preparación para estaciones de producción',
        icono: '📋',
        num: '02',
        herramientas: [
            {
                id: 'kds_helados',
                nombre: 'KDS Estación Helados',
                descripcion: 'Pantalla de preparación para helados artesanales',
                icono: '📋',
            },
            {
                id: 'kds_malteadas',
                nombre: 'KDS Malteadas y Aguas',
                descripcion: 'Pantalla de preparación para bebidas y malteadas',
                icono: '🥤',
            },
        ],
    },
    {
        id: 'gestor_displays',
        nombre: 'Gestor de Displays de Heladería',
        nombreCorto: 'Displays',
        descripcion: 'Pantallas de contenido visual y precios para clientes',
        icono: '📺',
        num: '03',
        herramientas: [
            {
                id: 'totem',
                nombre: 'Display Tótem',
                descripcion: 'Contenido visual sugestivo para atraer clientes',
                icono: '📺',
            },
            {
                id: 'precios',
                nombre: 'Display de Precios',
                descripcion: 'Menú digital con precios en tiempo real',
                icono: '💰',
            },
        ],
    },
];

const renderSection = (id, onBack) => {
    const wrapped = (Component, name) => (
        <Suspense fallback={<SectionLoader />}>
            <SectionErrorBoundary name={name} onBack={onBack}>
                <Component onBack={onBack} />
            </SectionErrorBoundary>
        </Suspense>
    );

    switch(id) {
        case 'pos_heladeria': return wrapped(PosHeladeriaUI, 'POS Heladería');
        case 'tienda': return wrapped(TiendaInteractivaUI, 'Tienda Interactiva');
        case 'kds_helados': return wrapped(KdsHeladosUI, 'KDS Helados');
        case 'kds_malteadas': return wrapped(KdsMalteadasUI, 'KDS Malteadas');
        case 'totem': return wrapped(DisplayTotemUI, 'Display Tótem');
        case 'precios': return wrapped(DisplayPreciosUI, 'Display Precios');
        default: return null;
    }
};

// ═══ Sub-Suite — Vista intermedia dentro de un gestor ═══
const GestorSuiteUI = ({ gestor, onBack, onSelectTool }) => {
    const [hoveredIdx, setHoveredIdx] = useState(null);

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
                    Heladería R de Rico
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
                    {gestor.num} — Suite
                </span>
                <h1 style={{
                    margin: 0,
                    fontSize: 'clamp(2rem, 4vw, 3.5rem)',
                    fontWeight: '900',
                    color: '#0f0f0f',
                    lineHeight: '1.05',
                    letterSpacing: '-1.5px',
                }}>
                    {gestor.nombre}
                </h1>
                <p style={{
                    margin: '16px 0 0',
                    fontSize: '14px', color: '#6b7280', fontWeight: '500',
                }}>
                    {gestor.descripcion}
                </p>
            </div>

            {/* Tools grid — 2 cards */}
            <div style={{
                flex: 1,
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
            }}>
                {gestor.herramientas.map((tool, idx) => (
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

            {/* Footer */}
            <div style={{
                borderTop: '1px solid #e5e7eb',
                padding: '14px 40px',
                display: 'flex', justifyContent: 'space-between',
            }}>
                <span style={{ fontSize: '11px', color: '#9ca3af', fontWeight: '500' }}>
                    R de Rico — Toluca, México
                </span>
                <span style={{ fontSize: '11px', color: '#9ca3af', fontWeight: '500' }}>
                    {gestor.nombre}
                </span>
            </div>
        </div>
    );
};

// ═══ Landing principal ═══
export const HeladeriaHubUI = ({ onBack }) => {
    // Navegación de dos niveles: gestor activo → herramienta activa
    const [activeGestor, setActiveGestor] = useState(null);
    const [activeTool, setActiveTool] = useState(null);

    // Nivel 3: Herramienta real (POS, KDS, etc.)
    if (activeTool) {
        return renderSection(activeTool, () => setActiveTool(null));
    }

    // Nivel 2: Sub-suite del gestor
    if (activeGestor) {
        const gestor = GESTORES.find(g => g.id === activeGestor);
        return (
            <GestorSuiteUI
                gestor={gestor}
                onBack={() => setActiveGestor(null)}
                onSelectTool={(toolId) => setActiveTool(toolId)}
            />
        );
    }

    // Nivel 1: Landing con 3 gestores
    return (
        <div style={{
            height: '100%',
            background: '#ffffff',
            display: 'flex',
            flexDirection: 'column',
            fontFamily: "'Inter', -apple-system, sans-serif",
            overflow: 'auto',
        }}>
            {/* Google Fonts */}
            <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />

            {/* Top strip */}
            <div style={{
                borderBottom: '1px solid #0f0f0f',
                padding: '12px 40px',
                display: 'flex', justifyContent: 'flex-end', alignItems: 'center',
            }}>
                <span style={{
                    fontSize: '11px', fontWeight: '800', color: '#0f0f0f',
                    textTransform: 'uppercase', letterSpacing: '3px',
                    textDecoration: 'underline', textUnderlineOffset: '4px',
                }}>
                    Heladería R de Rico
                </span>
            </div>

            {/* Hero headline */}
            <div style={{
                padding: '48px 40px 32px',
                borderBottom: '1px solid #0f0f0f',
            }}>
                <h1 style={{
                    margin: 0,
                    fontSize: 'clamp(3rem, 6vw, 5.5rem)',
                    fontWeight: '900',
                    color: '#0f0f0f',
                    lineHeight: '1.0',
                    letterSpacing: '-2px',
                }}>
                    Heladería<br />R de Rico.
                </h1>
                <p style={{
                    margin: '16px 0 0',
                    fontSize: '14px', color: '#6b7280', fontWeight: '500',
                }}>
                    Haciendo tu vida más dulce.
                </p>
            </div>

            {/* Gestores grid — 3 cards */}
            <div style={{
                flex: 1,
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                borderTop: 'none',
            }}>
                {GESTORES.map((gestor, idx) => (
                    <GestorCard
                        key={gestor.id}
                        gestor={gestor}
                        idx={idx}
                        total={GESTORES.length}
                        onClick={() => setActiveGestor(gestor.id)}
                    />
                ))}
            </div>

            {/* Footer */}
            <div style={{
                borderTop: '1px solid #e5e7eb',
                padding: '14px 40px',
                display: 'flex', justifyContent: 'space-between',
            }}>
                <span style={{ fontSize: '11px', color: '#9ca3af', fontWeight: '500' }}>
                    R de Rico — Toluca, México
                </span>
                <span style={{ fontSize: '11px', color: '#9ca3af', fontWeight: '500' }}>
                    Módulo Heladería
                </span>
            </div>
        </div>
    );
};

/**
 * GestorCard — Tarjeta editorial para cada gestor en la landing
 */
const GestorCard = ({ gestor, idx, total, onClick }) => {
    const [isHovered, setIsHovered] = useState(false);

    return (
        <button
            onClick={onClick}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            style={{
                background: isHovered ? '#0f0f0f' : '#ffffff',
                border: 'none',
                borderRight: idx < total - 1 ? '1px solid #e5e7eb' : 'none',
                borderBottom: '1px solid #e5e7eb',
                padding: '40px 32px',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                gap: '14px',
                transition: 'background 0.15s ease',
                textAlign: 'left',
                outline: 'none',
            }}
        >
            {/* Number + icon row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'flex-start' }}>
                <span style={{
                    fontSize: '11px', fontWeight: '800', color: isHovered ? '#6b7280' : '#d1d5db',
                    letterSpacing: '1px', transition: 'color 0.15s',
                }}>
                    {gestor.num}
                </span>
                <span style={{ fontSize: '28px', lineHeight: 1 }}>{gestor.icono}</span>
            </div>

            {/* Name */}
            <h3 style={{
                margin: 0,
                fontSize: '1.15rem',
                fontWeight: '900',
                color: isHovered ? '#ffffff' : '#0f0f0f',
                lineHeight: '1.2',
                letterSpacing: '-0.3px',
                transition: 'color 0.15s',
            }}>
                {gestor.nombre}
            </h3>

            {/* Description */}
            <p style={{
                margin: 0,
                color: isHovered ? '#9ca3af' : '#6b7280',
                fontSize: '12px',
                lineHeight: '1.5',
                fontWeight: '400',
                transition: 'color 0.15s',
            }}>
                {gestor.descripcion}
            </p>

            {/* Chip with tool count */}
            <span style={{
                fontSize: '10px',
                fontWeight: '800',
                color: isHovered ? '#9ca3af' : '#6b7280',
                background: isHovered ? '#1a1a1a' : '#f3f4f6',
                padding: '4px 10px',
                borderRadius: '20px',
                letterSpacing: '0.5px',
                textTransform: 'uppercase',
                transition: 'all 0.15s',
            }}>
                {gestor.herramientas.length} herramientas
            </span>

            {/* Arrow */}
            <span style={{
                fontSize: '18px',
                color: isHovered ? '#ffffff' : '#d1d5db',
                transition: 'color 0.15s, transform 0.15s',
                transform: isHovered ? 'translateX(4px)' : 'translateX(0)',
                display: 'inline-block',
                marginTop: 'auto',
            }}>
                →
            </span>
        </button>
    );
};
