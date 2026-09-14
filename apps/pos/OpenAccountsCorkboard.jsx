import React from 'react';
import { formatLocalTime } from '../shared/timezone';

/**
 * R DE RICO - PIZARRÓN DE CUENTAS ABIERTAS
 * 
 * Interfaz estilo corcho con Post-its para gestionar ventas en espera.
 */

export const OpenAccountsCorkboard = ({ openAccounts, onSelectAccount, onClose }) => {
    // Ordenar por número de cuenta (de mayor a menor)
    const sortedAccounts = [...openAccounts].sort((a, b) => {
        const numA = parseInt(a.id.replace(/[^0-9]/g, '')) || 0;
        const numB = parseInt(b.id.replace(/[^0-9]/g, '')) || 0;
        return numB - numA;
    });

    const getRandomRotation = (index) => {
        const rotations = ['-rotate-1', 'rotate-1', '-rotate-2', 'rotate-2', '-rotate-3', 'rotate-3'];
        return rotations[index % rotations.length];
    };

    const getPostItColor = (terminal) => {
        const colors = {
            'T6': 'bg-yellow-200',
            'T5': 'bg-blue-200',
            'T4': 'bg-green-200',
            'T3': 'bg-pink-200',
            'T2': 'bg-purple-200',
            'CAJA': 'bg-orange-200'
        };
        return colors[terminal] || 'bg-yellow-100';
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-10">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/90" onClick={onClose} />

            {/* El Pizarrón de Corcho */}
            <div className="relative w-full max-w-6xl aspect-[16/9] rounded-[40px] shadow-[0_50px_100px_-20px_rgba(0,0,0,0.5)] border-[20px] border-[#3d2b1f] overflow-hidden flex flex-col">

                {/* Textura de Corcho (Simulada con CSS) */}
                <div className="absolute inset-0 opacity-80" style={{
                    backgroundColor: '#bc8a5f',
                    backgroundImage: `
                        radial-gradient(circle at 2px 2px, rgba(0,0,0,0.15) 1px, transparent 0),
                        radial-gradient(circle at 10px 10px, rgba(255,255,255,0.05) 1px, transparent 0)
                    `,
                    backgroundSize: '15px 15px, 40px 40px'
                }} />

                {/* Encabezado del Pizarrón */}
                <div className="relative z-10 p-8 border-b border-black/10 flex justify-between items-center bg-black/5">
                    <div>
                        <h2 className="text-4xl font-black uppercase tracking-tighter italic text-[#2d1e13]">Cuentas en <span className="opacity-40">Espera</span></h2>
                        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#4a3221]">Pizarrón de Control R de Rico</p>
                    </div>
                    <div className="flex gap-4">
                        <button
                            onClick={onClose}
                            className="w-12 h-12 rounded-full bg-[#2d1e13] text-white flex items-center justify-center font-black hover:scale-110 active:scale-95 transition-all shadow-xl"
                        >
                            ✕
                        </button>
                    </div>
                </div>

                {/* Grid de Post-its */}
                <div className="relative z-10 flex-1 p-12 overflow-y-auto custom-scrollbar grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-12 content-start">
                    {sortedAccounts.map((acc, index) => (
                        <div
                            key={acc.id}
                            onClick={() => onSelectAccount(acc)}
                            className={`group relative p-6 aspect-square ${getPostItColor(acc.terminal)} ${getRandomRotation(index)} shadow-[5px_15px_30px_-5px_rgba(0,0,0,0.3)] hover:shadow-[10px_25px_50px_-10px_rgba(0,0,0,0.4)] hover:-translate-y-2 transition-all cursor-pointer flex flex-col justify-between`}
                        >
                            {/* Alfiler (Pin) */}
                            <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-red-600 shadow-inner border border-red-700 z-20">
                                <div className="absolute top-1 left-1 w-1.5 h-1.5 bg-white/40 rounded-full" />
                            </div>

                            {/* Contenido del Post-it */}
                            <div className="text-[#3d2b1f] flex flex-col">
                                <div className="flex justify-between items-start mb-4">
                                    <span className="text-5xl font-black font-mono">#{acc.id.slice(-3)}</span>
                                    <span className="text-sm font-black bg-black/5 px-2 py-1 rounded-md uppercase tracking-widest opacity-60">{acc.terminal}</span>
                                </div>
                                
                                {acc.orderType === 'PEDIDO' ? (
                                    <div className="mb-4">
                                        <span className="inline-block bg-orange-600 text-white text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded shadow-sm mb-1">
                                            📦 PEDIDO TENTATIVO
                                        </span>
                                        <h4 className="text-xl font-black uppercase tracking-tighter leading-none mb-1 text-black">
                                            {acc.clientName}
                                        </h4>
                                        <p className="text-[10px] font-bold text-orange-900 uppercase">
                                            {acc.deliveryType === 'DOMICILIO' ? '🚗 DOMICILIO' : '🏪 PICK UP'}
                                        </p>
                                    </div>
                                ) : (
                                    <h4 className="text-lg font-black uppercase tracking-tight leading-tight mb-4 opacity-35">
                                        CLIENTE LOCAL
                                    </h4>
                                )}

                                <div className="space-y-1 opacity-50 mt-auto">
                                    <p className="text-[11px] font-black uppercase flex items-center gap-2">
                                        📝 {acc.capturedByName}
                                    </p>
                                    <p className="text-[11px] font-bold italic uppercase flex items-center gap-2">
                                        🕒 {formatLocalTime(acc.timestamp)}
                                    </p>
                                </div>
                            </div>

                            <div className="mt-4 pt-4 border-t border-[#3d2b1f]/10 flex justify-between items-end">
                                <span className="text-xl font-black font-mono tracking-tighter text-[#3d2b1f] opacity-45">${acc.total.toFixed(2)}</span>
                                <span className="text-[8px] font-black uppercase tracking-widest opacity-30">Ver Cuenta →</span>
                            </div>

                            {/* Efecto de sombra para el papel */}
                            <div className="absolute bottom-0 right-0 w-8 h-8 bg-gradient-to-br from-black/0 to-black/5 rounded-br-sm" />
                        </div>
                    ))}

                    {sortedAccounts.length === 0 && (
                        <div className="col-span-full h-full flex flex-col items-center justify-center opacity-20 space-y-4 py-20">
                            <span className="text-9xl italic font-black">VACÍO</span>
                            <p className="text-[10px] font-black uppercase tracking-[0.5em]">No hay cuentas pendientes en el pizarrón</p>
                        </div>
                    )}
                </div>
            </div>

            <style>{`
                .custom-scrollbar::-webkit-scrollbar { width: 6px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: rgba(0,0,0,0.05); }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.1); border-radius: 10px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(0,0,0,0.2); }
            `}</style>
        </div>
    );
};
