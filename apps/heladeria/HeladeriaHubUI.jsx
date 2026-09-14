import React, { useState, Suspense } from 'react';

// ═══ LAZY IMPORTS — Aislamiento de secciones ═══
// Si una sección falla, las demás siguen funcionando.
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
                    ← Volver al Hub
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
 */

const SECCIONES = [
    {
        id: 'pos_heladeria',
        nombre: 'POS Heladería',
        descripcion: 'Punto de venta rápido para el personal de mostrador',
        icono: '⚡',
        num: '01',
    },
    {
        id: 'tienda',
        nombre: 'Tienda Interactiva',
        descripcion: 'Experiencia táctil para clientes en mostrador',
        icono: '🍦',
        num: '02',
    },
    {
        id: 'kds_helados',
        nombre: 'KDS Estación Helados',
        descripcion: 'Pantalla de preparación para helados artesanales',
        icono: '📋',
        num: '03',
    },
    {
        id: 'kds_malteadas',
        nombre: 'KDS Malteadas y Aguas',
        descripcion: 'Pantalla de preparación para bebidas y malteadas',
        icono: '🥤',
        num: '04',
    },
    {
        id: 'totem',
        nombre: 'Display Tótem',
        descripcion: 'Contenido visual sugestivo para atraer clientes',
        icono: '📺',
        num: '05',
    },
    {
        id: 'precios',
        nombre: 'Display de Precios',
        descripcion: 'Menú digital con precios en tiempo real',
        icono: '💰',
        num: '06',
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

export const HeladeriaHubUI = ({ onBack }) => {
    const [activeSection, setActiveSection] = useState(null);

    if (activeSection) return renderSection(activeSection, () => setActiveSection(null));

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
                    Let's make<br />life sweeter.
                </h1>
                <p style={{
                    margin: '16px 0 0',
                    fontSize: '14px', color: '#6b7280', fontWeight: '500',
                }}>
                    Centro de control — selecciona una sección para comenzar
                </p>
            </div>

            {/* Sections grid */}
            <div style={{
                flex: 1,
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                borderTop: 'none',
            }}>
                {SECCIONES.map((sec, idx) => (
                    <SeccionCard
                        key={sec.id}
                        seccion={sec}
                        idx={idx}
                        total={SECCIONES.length}
                        onClick={() => setActiveSection(sec.id)}
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
 * SeccionCard — Tarjeta editorial para cada sección
 */
const SeccionCard = ({ seccion, idx, total, onClick }) => {
    const [isHovered, setIsHovered] = useState(false);
    const isLastRow = idx >= total - (total % 3 || 3);

    return (
        <button
            onClick={onClick}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            style={{
                background: isHovered ? '#0f0f0f' : '#ffffff',
                border: 'none',
                borderRight: '1px solid #e5e7eb',
                borderBottom: '1px solid #e5e7eb',
                padding: '32px 28px',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                gap: '12px',
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
                    {seccion.num}
                </span>
                <span style={{ fontSize: '28px', lineHeight: 1 }}>{seccion.icono}</span>
            </div>

            {/* Name */}
            <h3 style={{
                margin: 0,
                fontSize: '1.1rem',
                fontWeight: '900',
                color: isHovered ? '#ffffff' : '#0f0f0f',
                lineHeight: '1.2',
                letterSpacing: '-0.3px',
                transition: 'color 0.15s',
            }}>
                {seccion.nombre}
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
                {seccion.descripcion}
            </p>

            {/* Arrow */}
            <span style={{
                fontSize: '18px',
                color: isHovered ? '#ffffff' : '#d1d5db',
                transition: 'color 0.15s, transform 0.15s',
                transform: isHovered ? 'translateX(4px)' : 'translateX(0)',
                display: 'inline-block',
            }}>
                →
            </span>
        </button>
    );
};
