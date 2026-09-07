import React, { useState } from 'react';
import { TiendaInteractivaUI } from './sections/TiendaInteractivaUI';
import { KdsHeladosUI } from './sections/KdsHeladosUI';
import { KdsMalteadasUI } from './sections/KdsMalteadasUI';
import { DisplayTotemUI } from './sections/DisplayTotemUI';
import { DisplayPreciosUI } from './sections/DisplayPreciosUI';

/**
 * HeladeriaHubUI — Landing Page del Módulo Heladería
 * Hub de acceso a todas las secciones de la heladería R de Rico.
 * Estética de heladería de alta gama (Häagen-Dazs / Amorino).
 */

const SECCIONES = [
    {
        id: 'tienda',
        nombre: 'Tienda Interactiva',
        descripcion: 'Experiencia táctil para clientes en mostrador',
        icono: '🍦',
        gradiente: 'linear-gradient(135deg, #ec4899, #f472b6)',
        glowColor: 'rgba(236, 72, 153, 0.3)',
        borderColor: 'rgba(244, 114, 182, 0.3)',
    },
    {
        id: 'kds_helados',
        nombre: 'KDS Estación de Helados',
        descripcion: 'Pantalla de preparación para helados artesanales',
        icono: '📋',
        gradiente: 'linear-gradient(135deg, #14b8a6, #5eead4)',
        glowColor: 'rgba(94, 234, 212, 0.3)',
        borderColor: 'rgba(94, 234, 212, 0.3)',
    },
    {
        id: 'kds_malteadas',
        nombre: 'KDS Malteadas y Aguas Frescas',
        descripcion: 'Pantalla de preparación para bebidas y malteadas',
        icono: '🥤',
        gradiente: 'linear-gradient(135deg, #8b5cf6, #c4b5fd)',
        glowColor: 'rgba(196, 181, 253, 0.3)',
        borderColor: 'rgba(196, 181, 253, 0.3)',
    },
    {
        id: 'totem',
        nombre: 'Display Tótem Sugestivo',
        descripcion: 'Contenido visual para atraer clientes',
        icono: '📺',
        gradiente: 'linear-gradient(135deg, #f59e0b, #fbbf24)',
        glowColor: 'rgba(251, 191, 36, 0.3)',
        borderColor: 'rgba(251, 191, 36, 0.3)',
    },
    {
        id: 'precios',
        nombre: 'Display Pantalla de Precios',
        descripcion: 'Menú digital con precios en tiempo real',
        icono: '💰',
        gradiente: 'linear-gradient(135deg, #0ea5e9, #38bdf8)',
        glowColor: 'rgba(56, 189, 248, 0.3)',
        borderColor: 'rgba(56, 189, 248, 0.3)',
    },
];

export const HeladeriaHubUI = ({ onBack }) => {
    const [activeSection, setActiveSection] = useState(null);

    if (activeSection === 'tienda') return <TiendaInteractivaUI onBack={() => setActiveSection(null)} />;
    if (activeSection === 'kds_helados') return <KdsHeladosUI onBack={() => setActiveSection(null)} />;
    if (activeSection === 'kds_malteadas') return <KdsMalteadasUI onBack={() => setActiveSection(null)} />;
    if (activeSection === 'totem') return <DisplayTotemUI onBack={() => setActiveSection(null)} />;
    if (activeSection === 'precios') return <DisplayPreciosUI onBack={() => setActiveSection(null)} />;

    return (
        <div style={{
            height: '100%',
            background: 'linear-gradient(160deg, #0a0a0a 0%, #120818 30%, #0d0a1a 60%, #0a0a0a 100%)',
            display: 'flex',
            flexDirection: 'column',
            fontFamily: "'Inter', sans-serif",
            overflow: 'auto',
        }}>
            {/* Google Fonts */}
            <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700;800;900&family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet" />

            {/* Header */}
            <div style={{
                padding: '30px 40px 20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                    <button
                        onClick={onBack}
                        style={{
                            background: 'rgba(255,255,255,0.05)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            color: '#9ca3af',
                            padding: '10px 20px',
                            borderRadius: '12px',
                            cursor: 'pointer',
                            fontWeight: '700',
                            fontSize: '13px',
                            transition: 'all 0.3s ease',
                        }}
                        onMouseEnter={e => { e.target.style.background = 'rgba(255,255,255,0.1)'; e.target.style.color = '#fff'; }}
                        onMouseLeave={e => { e.target.style.background = 'rgba(255,255,255,0.05)'; e.target.style.color = '#9ca3af'; }}
                    >
                        ← Dashboard
                    </button>
                    <div>
                        <h1 style={{
                            margin: 0,
                            fontFamily: "'Playfair Display', serif",
                            fontSize: '2.2rem',
                            fontWeight: '800',
                            background: 'linear-gradient(135deg, #f9a8d4, #c084fc, #93c5fd)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            letterSpacing: '-0.5px',
                        }}>
                            Heladería R de Rico
                        </h1>
                        <p style={{
                            margin: '4px 0 0',
                            color: '#6b7280',
                            fontSize: '13px',
                            fontWeight: '500',
                            letterSpacing: '3px',
                            textTransform: 'uppercase',
                        }}>
                            Centro de Control
                        </p>
                    </div>
                </div>
                <div style={{
                    fontSize: '48px',
                    filter: 'drop-shadow(0 0 20px rgba(244, 114, 182, 0.4))',
                    animation: 'gentlePulse 4s ease-in-out infinite',
                }}>
                    🍨
                </div>
            </div>

            {/* Divider */}
            <div style={{
                margin: '0 40px',
                height: '1px',
                background: 'linear-gradient(90deg, transparent, rgba(244, 114, 182, 0.2), rgba(196, 181, 253, 0.2), transparent)',
            }} />

            {/* Cards Grid */}
            <div style={{
                flex: 1,
                padding: '30px 40px 40px',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: '24px',
                alignContent: 'start',
            }}>
                {SECCIONES.map((seccion) => (
                    <SeccionCard
                        key={seccion.id}
                        seccion={seccion}
                        onClick={() => setActiveSection(seccion.id)}
                    />
                ))}
            </div>

            {/* Footer */}
            <div style={{
                padding: '16px 40px',
                textAlign: 'center',
                borderTop: '1px solid rgba(255,255,255,0.03)',
            }}>
                <p style={{
                    margin: 0,
                    color: '#374151',
                    fontSize: '11px',
                    fontWeight: '500',
                    letterSpacing: '2px',
                    textTransform: 'uppercase',
                }}>
                    Heladería R de Rico — Toluca, México
                </p>
            </div>

            <style>{`
                @keyframes gentlePulse {
                    0%, 100% { transform: scale(1); opacity: 1; }
                    50% { transform: scale(1.08); opacity: 0.9; }
                }
                @keyframes cardEntry {
                    from { opacity: 0; transform: translateY(20px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}</style>
        </div>
    );
};

/**
 * SeccionCard — Tarjeta premium para cada sección de la heladería
 */
const SeccionCard = ({ seccion, onClick }) => {
    const [isHovered, setIsHovered] = useState(false);

    return (
        <button
            onClick={onClick}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            style={{
                background: isHovered
                    ? 'rgba(255, 255, 255, 0.06)'
                    : 'rgba(255, 255, 255, 0.02)',
                border: `1px solid ${isHovered ? seccion.borderColor : 'rgba(255,255,255,0.06)'}`,
                borderRadius: '20px',
                padding: '32px 28px',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                gap: '16px',
                transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                transform: isHovered ? 'translateY(-4px) scale(1.02)' : 'translateY(0) scale(1)',
                boxShadow: isHovered
                    ? `0 20px 40px -12px ${seccion.glowColor}, 0 0 0 1px ${seccion.borderColor}`
                    : '0 4px 20px -4px rgba(0,0,0,0.3)',
                animation: 'cardEntry 0.6s ease-out both',
                backdropFilter: 'blur(12px)',
                textAlign: 'left',
                outline: 'none',
            }}
        >
            {/* Icono */}
            <div style={{
                fontSize: '40px',
                width: '72px',
                height: '72px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '18px',
                background: isHovered
                    ? `linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02))`
                    : 'rgba(255,255,255,0.03)',
                border: `1px solid ${isHovered ? seccion.borderColor : 'rgba(255,255,255,0.05)'}`,
                transition: 'all 0.4s ease',
                transform: isHovered ? 'rotate(-3deg) scale(1.1)' : 'rotate(0) scale(1)',
            }}>
                {seccion.icono}
            </div>

            {/* Texto */}
            <div>
                <h3 style={{
                    margin: '0 0 6px',
                    fontFamily: "'Playfair Display', serif",
                    fontSize: '1.25rem',
                    fontWeight: '700',
                    color: '#f9fafb',
                    transition: 'all 0.3s ease',
                }}>
                    {seccion.nombre}
                </h3>
                <p style={{
                    margin: 0,
                    color: '#6b7280',
                    fontSize: '13px',
                    lineHeight: '1.5',
                    fontWeight: '400',
                }}>
                    {seccion.descripcion}
                </p>
            </div>

            {/* Accent line */}
            <div style={{
                width: isHovered ? '60px' : '30px',
                height: '3px',
                borderRadius: '3px',
                background: seccion.gradiente,
                transition: 'all 0.4s ease',
                opacity: isHovered ? 1 : 0.4,
            }} />
        </button>
    );
};
