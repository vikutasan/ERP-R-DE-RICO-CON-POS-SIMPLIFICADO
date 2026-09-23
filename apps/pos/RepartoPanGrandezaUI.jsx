import React, { useState } from 'react';
import { GrandezaParamsUI } from './GrandezaParamsUI';
import { GrandezaDailyUI } from './GrandezaDailyUI';
import { GrandezaDriverUI } from './GrandezaDriverUI';
import { CONFIG } from './config';

/**
 * REPARTO PAN GRANDEZA — Landing Page
 * Módulo del ERP R de Rico para gestión de repartos de Pan Grandeza.
 * 
 * 3 sub-suites controladas por permisos:
 * - Parámetros Generales (Supervisor) — grandeza_params
 * - Gestión Diaria (Gerente) — grandeza_daily
 * - Herramienta Repartidor (Repartidor) — grandeza_driver
 */
export const RepartoPanGrandezaUI = ({ onBack, userPermissions = {}, userRole = '' }) => {
    const isDriverTerminal = new URLSearchParams(window.location.search).get('terminal') === 'DRIVER';
    const initialSuite = (userRole === 'DRIVER' || isDriverTerminal) ? 'driver' : null;
    
    const [activeSuite, setActiveSuite] = useState(initialSuite);
    const LOGO_URL = `${CONFIG.API_BASE_URL.replace('/api/v1', '')}/static/images/grandeza/logo.png`;

    // Helper: verificar permiso (Master Access o permiso específico o Rol legado)
    const hasPermission = (permId) => {
        if (userRole === 'ADMIN') return true;
        if (userRole === 'DRIVER' && permId === 'grandeza_driver') return true;
        if (userPermissions && Object.keys(userPermissions).length > 0) {
            return userPermissions.all === 'full' || userPermissions[permId] === 'full';
        }
        return false;
    };

    // Definición de las 3 sub-suites
    const suites = [
        {
            id: 'params',
            permissionId: 'grandeza_params',
            icon: '📋',
            title: 'Herramienta Administrador Grandeza',
            subtitle: '',
            description: '',
            color: 'from-blue-500 to-indigo-700',
            shadow: 'shadow-blue-500/20',
            accent: 'text-blue-400',
        },
        {
            id: 'daily',
            permissionId: 'grandeza_daily',
            icon: '📅',
            title: 'Herramienta Gerente Grandeza',
            subtitle: '',
            description: '',
            color: 'from-emerald-500 to-green-700',
            shadow: 'shadow-emerald-500/20',
            accent: 'text-emerald-400',
        },
        {
            id: 'driver',
            permissionId: 'grandeza_driver',
            icon: '🚗',
            title: 'Herramienta Repartidor Grandeza',
            subtitle: '',
            description: '',
            color: 'from-amber-500 to-orange-700',
            shadow: 'shadow-amber-500/20',
            accent: 'text-amber-400',
        },
    ];

    // Si hay una suite activa, renderizarla
    if (activeSuite) {
        if (activeSuite === 'params') {
            return <GrandezaParamsUI onBack={() => setActiveSuite(null)} />;
        }
        if (activeSuite === 'daily') {
            return <GrandezaDailyUI onBack={() => setActiveSuite(null)} />;
        }
        if (activeSuite === 'driver') {
            return <GrandezaDriverUI onBack={() => setActiveSuite(null)} userPermissions={userPermissions} />;
        }
        
        // Placeholder para la suite del repartidor (Fase 3)
        const suite = suites.find(s => s.id === activeSuite);
        return (
            <div className="h-full flex flex-col bg-gradient-to-br from-[#0a0a0a] via-[#111] to-[#0a0a0a] text-white overflow-hidden">
                {/* Header de sub-suite */}
                <div className="p-4 md:p-8 pb-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4 md:gap-6">
                            <div className={`w-12 h-12 md:w-16 md:h-16 bg-gradient-to-br ${suite.color} rounded-2xl md:rounded-3xl flex items-center justify-center text-xl md:text-3xl shadow-2xl ${suite.shadow}`}>
                                {suite.icon}
                            </div>
                            <div>
                                <h1 className="text-xl md:text-3xl font-black uppercase tracking-tighter text-white leading-none">
                                    {suite.title}
                                </h1>
                                <p className={`text-[10px] md:text-sm font-bold uppercase tracking-widest mt-1 ${suite.accent}`}>
                                    {suite.subtitle}
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={() => setActiveSuite(null)}
                            className="px-4 py-2 md:px-6 md:py-3 bg-white/5 border border-white/10 rounded-xl md:rounded-2xl text-[10px] md:text-sm font-black uppercase tracking-widest text-gray-400 hover:text-white hover:bg-white/10 transition-all"
                        >
                            ← Volver
                        </button>
                    </div>
                </div>

                {/* Contenido de la sub-suite — Placeholder (se llena en fases 1-5) */}
                <div className="flex-1 flex items-center justify-center p-8">
                    <div className="text-center space-y-6">
                        <div className="text-5xl md:text-7xl">{suite.icon}</div>
                        <h2 className={`text-xl md:text-2xl font-black uppercase tracking-tighter ${suite.accent}`}>
                            {suite.title}
                        </h2>
                        <p className="text-gray-500 text-xs md:text-base font-medium max-w-md mx-auto">
                            Suite en preparación. La infraestructura de datos ya está lista.
                        </p>
                        <div className="flex items-center justify-center gap-2 mt-4">
                            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                            <span className="text-[10px] md:text-xs font-bold text-emerald-500/60 uppercase tracking-widest">Backend Conectado</span>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Landing Page — 3 botones
    return (
        <div className="h-full flex flex-col text-white overflow-y-auto overflow-x-hidden relative" style={{ backgroundColor: '#3a2e1e' }}>
            {/* Header */}
            <div className="relative z-20 pt-4 pb-2 px-4 md:pt-8 md:px-10 bg-black border-b border-white/10 shadow-2xl">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-4 md:gap-8">
                        <div className="w-16 h-16 md:w-40 md:h-40 shrink-0 rounded-2xl md:rounded-[48px] overflow-hidden shadow-2xl shadow-orange-500/20 border-2 border-amber-500/30 flex items-center justify-center">
                            <img src={LOGO_URL} alt="Grandeza" className="w-full h-full object-cover scale-[1.35]" />
                        </div>
                        <div>
                            <h1 className="text-2xl md:text-6xl font-black uppercase tracking-tighter text-white leading-none">
                                Reparto <span className="text-amber-400">Pan Grandeza</span>
                            </h1>
                        </div>
                    </div>
                    {onBack && (
                        <button
                            onClick={onBack}
                            className="w-full md:w-auto px-6 py-3 md:px-8 md:py-4 bg-white/5 border border-white/10 rounded-xl md:rounded-2xl text-xs md:text-base font-black uppercase tracking-widest text-gray-400 hover:text-white hover:bg-white/10 transition-all"
                        >
                            ← Volver
                        </button>
                    )}
                </div>
            </div>

            {/* 3 Botones de Acceso */}
            <div className="relative z-10 flex-1 flex items-center justify-center p-8">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl w-full">
                    {suites.map(suite => {
                        const permitted = hasPermission(suite.permissionId);
                        return (
                            <button
                                key={suite.id}
                                onClick={() => permitted && setActiveSuite(suite.id)}
                                disabled={!permitted}
                                className={`group relative p-8 rounded-[32px] border-2 transition-all duration-500 text-left flex flex-col items-center
                                    ${permitted 
                                        ? 'bg-[#2a2016]/80 border-[#5a4530] hover:border-amber-600/60 hover:bg-[#352a1c]/90 hover:scale-[1.02] active:scale-[0.98] cursor-pointer backdrop-blur-sm' 
                                        : 'bg-[#1a1510]/40 border-[#3a2e22] opacity-30 cursor-not-allowed'
                                    }`}
                            >
                                {/* Icono */}
                                <div className={`w-20 h-20 rounded-3xl overflow-hidden shadow-2xl ${suite.shadow} mb-6 border border-white/10
                                    ${permitted ? 'group-hover:scale-110 group-hover:rotate-3' : ''} transition-all duration-500`}>
                                    <img src={LOGO_URL} alt="Grandeza" className="w-full h-full object-cover" />
                                </div>

                                {/* Texto */}
                                <h3 className="text-lg font-black uppercase tracking-tight text-white text-center leading-tight mb-1">
                                    {suite.title}
                                </h3>
                                {suite.subtitle && (
                                    <p className={`text-xs font-bold uppercase tracking-widest mb-4 ${suite.accent}`}>
                                        {suite.subtitle}
                                    </p>
                                )}
                                {suite.description && (
                                    <p className="text-xs text-gray-500 font-medium text-center leading-relaxed">
                                        {suite.description}
                                    </p>
                                )}

                                {/* Badge de estado */}
                                {!permitted && (
                                    <div className="absolute top-4 right-4 px-3 py-1 bg-red-500/10 border border-red-500/20 rounded-full">
                                        <span className="text-[9px] font-black text-red-400 uppercase tracking-widest">Sin Acceso</span>
                                    </div>
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>

            <style>{`
                @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
                @keyframes zoom-in-95 { from { transform: scale(0.95); opacity: 0; } to { transform: scale(1); opacity: 1; } }
            `}</style>

            {/* Capa de textura de madera */}
            <div className="absolute inset-0 z-0 pointer-events-none" style={{
                backgroundImage: 'url("/assets/wood_bg.jpg")',
                backgroundSize: 'cover',
                backgroundPosition: 'center'
            }} />
        </div>
    );
};
