import React, { useState, useEffect } from 'react';
import { hrService } from './hrService';

/**
 * Panel de Reglamento Interno — 11 secciones
 * 
 * Renderiza las secciones del reglamento en pestañas navegables.
 * El contenido viene del backend (seeded en startup).
 */

export const RegulationsPanel = ({ onBack }) => {
    const [regulations, setRegulations] = useState([]);
    const [activeSection, setActiveSection] = useState(1);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadRegulations();
    }, []);

    const loadRegulations = async () => {
        try {
            const regs = await hrService.listRegulations();
            setRegulations(regs || []);
        } catch (err) {
            console.error('Error cargando reglamento:', err);
        } finally {
            setLoading(false);
        }
    };

    const activeReg = regulations.find(r => r.seccion_numero === activeSection);

    // Parsear markdown básico a JSX
    const renderContent = (text) => {
        if (!text) return null;
        return text.split('\n').map((line, i) => {
            // Headers
            if (line.startsWith('**') && line.endsWith('**')) {
                return <p key={i} className="font-black text-white text-sm mt-3 mb-1">{line.replace(/\*\*/g, '')}</p>;
            }
            // Bullets
            if (line.startsWith('- ')) {
                const content = line.substring(2);
                // Check for emoji markers
                if (content.startsWith('🚫')) {
                    return <div key={i} className="flex items-start gap-2 py-0.5 pl-2"><span className="text-red-400 text-sm">🚫</span><span className="text-gray-300 text-xs">{content.substring(2)}</span></div>;
                }
                if (content.startsWith('✅')) {
                    return <div key={i} className="flex items-start gap-2 py-0.5 pl-2"><span className="text-green-400 text-sm">✅</span><span className="text-gray-300 text-xs">{content.substring(2)}</span></div>;
                }
                return <div key={i} className="flex items-start gap-2 py-0.5 pl-2"><span className="text-teal-500">•</span><span className="text-gray-300 text-xs">{content}</span></div>;
            }
            // Numbered items
            if (/^\d+\./.test(line)) {
                return <div key={i} className="flex items-start gap-2 py-0.5 pl-2"><span className="text-teal-400 font-mono text-xs w-4">{line.match(/^\d+/)[0]}.</span><span className="text-gray-300 text-xs">{line.replace(/^\d+\.\s*/, '')}</span></div>;
            }
            // Bold inline
            if (line.includes('**')) {
                const parts = line.split('**');
                return <p key={i} className="text-gray-300 text-xs mt-1">{parts.map((part, j) => j % 2 === 1 ? <strong key={j} className="text-white font-bold">{part}</strong> : part)}</p>;
            }
            // Empty line
            if (line.trim() === '') return <div key={i} className="h-2"></div>;
            // Normal text
            return <p key={i} className="text-gray-300 text-xs mt-1">{line}</p>;
        });
    };

    if (loading) {
        return (
            <div className="h-full flex items-center justify-center bg-[#0a0a0a]">
                <div className="w-12 h-12 border-4 border-teal-500/30 border-t-teal-500 rounded-full animate-spin"></div>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col bg-[#0a0a0a] text-white overflow-hidden">
            {/* Header */}
            <div className="shrink-0 border-b border-white/5 px-6 py-4 flex items-center gap-4">
                <button
                    onClick={onBack}
                    className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-all text-sm"
                >
                    ←
                </button>
                <div>
                    <h1 className="text-lg font-black uppercase tracking-tight">📋 Reglamento Interior de Trabajo</h1>
                    <p className="text-[9px] font-bold text-gray-600 uppercase tracking-widest">R de Rico • Observancia general y obligatoria</p>
                </div>
            </div>

            <div className="flex-1 flex overflow-hidden">
                {/* Sidebar de secciones */}
                <div className="w-72 shrink-0 border-r border-white/5 overflow-y-auto bg-black/20 p-3 space-y-1">
                    {regulations.map((reg) => (
                        <button
                            key={reg.seccion_numero}
                            onClick={() => setActiveSection(reg.seccion_numero)}
                            className={`w-full text-left px-3 py-2.5 rounded-xl transition-all flex items-center gap-2.5 group ${
                                activeSection === reg.seccion_numero
                                    ? 'bg-teal-600/20 border border-teal-500/30 text-teal-300'
                                    : 'hover:bg-white/5 text-gray-400 border border-transparent'
                            }`}
                        >
                            <span className="text-base shrink-0">{reg.icono}</span>
                            <div className="min-w-0">
                                <p className={`text-[10px] font-bold truncate ${activeSection === reg.seccion_numero ? 'text-teal-300' : 'text-gray-300'}`}>
                                    {reg.titulo}
                                </p>
                                <p className="text-[8px] text-gray-600 font-bold">Sección {reg.seccion_numero}</p>
                            </div>
                        </button>
                    ))}
                </div>

                {/* Contenido de la sección activa */}
                <div className="flex-1 overflow-y-auto p-6">
                    {activeReg ? (
                        <div className="max-w-2xl">
                            <div className="flex items-center gap-3 mb-6">
                                <div className="w-12 h-12 rounded-xl bg-teal-600/20 flex items-center justify-center text-2xl">{activeReg.icono}</div>
                                <div>
                                    <h2 className="text-xl font-black text-white">{activeReg.titulo}</h2>
                                    <p className="text-[9px] text-gray-500 font-bold uppercase tracking-widest">Sección {activeReg.seccion_numero} del Reglamento Interior</p>
                                </div>
                            </div>
                            <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-6">
                                {renderContent(activeReg.contenido)}
                            </div>
                        </div>
                    ) : (
                        <p className="text-gray-600 text-center">Selecciona una sección</p>
                    )}
                </div>
            </div>
        </div>
    );
};
