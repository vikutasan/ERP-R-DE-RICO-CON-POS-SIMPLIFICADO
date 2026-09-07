import React from 'react';

/**
 * KdsMalteadasUI — Placeholder premium
 * Futura pantalla KDS para la estación de malteadas y aguas frescas
 */
export const KdsMalteadasUI = ({ onBack }) => {
    return (
        <div style={{
            height: '100%',
            background: 'linear-gradient(135deg, #0a0a0a 0%, #1a0a20 50%, #0a0a0a 100%)',
            display: 'flex',
            flexDirection: 'column',
            fontFamily: "'Inter', sans-serif",
        }}>
            <div style={{
                padding: '20px 30px',
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                borderBottom: '1px solid rgba(196, 181, 253, 0.15)',
            }}>
                <button
                    onClick={onBack}
                    style={{
                        background: 'rgba(196, 181, 253, 0.1)',
                        border: '1px solid rgba(196, 181, 253, 0.2)',
                        color: '#c4b5fd',
                        padding: '10px 20px',
                        borderRadius: '12px',
                        cursor: 'pointer',
                        fontWeight: '700',
                        fontSize: '13px',
                        transition: 'all 0.3s ease',
                    }}
                    onMouseEnter={e => { e.target.style.background = 'rgba(196, 181, 253, 0.2)'; e.target.style.transform = 'scale(1.05)'; }}
                    onMouseLeave={e => { e.target.style.background = 'rgba(196, 181, 253, 0.1)'; e.target.style.transform = 'scale(1)'; }}
                >
                    ← Regresar
                </button>
                <h1 style={{
                    margin: 0,
                    fontFamily: "'Playfair Display', serif",
                    fontSize: '1.5rem',
                    background: 'linear-gradient(135deg, #c4b5fd, #a78bfa)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                }}>
                    KDS — Malteadas y Aguas Frescas
                </h1>
            </div>

            <div style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'column',
                gap: '24px',
            }}>
                <div style={{ fontSize: '80px', animation: 'float 3s ease-in-out infinite' }}>🥤</div>
                <h2 style={{
                    fontFamily: "'Playfair Display', serif",
                    fontSize: '2rem',
                    color: '#f9fafb',
                    margin: 0,
                    textAlign: 'center',
                }}>Estación de Malteadas y Aguas Frescas</h2>
                <p style={{
                    color: '#9ca3af',
                    fontSize: '1rem',
                    maxWidth: '400px',
                    textAlign: 'center',
                    lineHeight: '1.6',
                }}>
                    Kitchen Display System para malteadas, smoothies y aguas frescas. Los pedidos de bebidas aparecerán aquí en tiempo real.
                </p>
                <div style={{
                    padding: '10px 24px',
                    background: 'rgba(196, 181, 253, 0.1)',
                    border: '1px solid rgba(196, 181, 253, 0.2)',
                    borderRadius: '20px',
                    color: '#c4b5fd',
                    fontSize: '12px',
                    fontWeight: '700',
                    letterSpacing: '2px',
                    textTransform: 'uppercase',
                }}>Próximamente</div>
            </div>

            <style>{`
                @keyframes float {
                    0%, 100% { transform: translateY(0px); }
                    50% { transform: translateY(-15px); }
                }
            `}</style>
        </div>
    );
};
