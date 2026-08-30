import React, { useState, useEffect } from 'react';
import { hrService } from './hrService';

/**
 * Modal de Fondo de Cobertura — Saldo + tabla de % por anticipación + Movimientos
 */
const TABLA_PCT = [
    { dias: 'No avisó', pct: '100%', color: 'text-red-400' },
    { dias: '0 días (avisa)', pct: '90%', color: 'text-red-300' },
    { dias: '1 día', pct: '80%', color: 'text-amber-400' },
    { dias: '2 días', pct: '70%', color: 'text-amber-300' },
    { dias: '3 días', pct: '60%', color: 'text-yellow-400' },
    { dias: '4 días', pct: '50%', color: 'text-yellow-300' },
    { dias: '5+ días', pct: '40%', color: 'text-green-400' },
];

export const CoverageFundModal = ({ employee, onClose }) => {
    const [data, setData] = useState(null);

    useEffect(() => { load(); }, []);

    const load = async () => {
        const d = await hrService.getCoverage(employee.id);
        setData(d);
    };

    const crearFondo = async () => {
        await hrService.createCoverage({ employee_id: employee.id });
        await load();
    };

    if (!data) return null;

    const fund = data.fondo;

    return (
        <div className="fixed inset-0 z-[99999] bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-[#111] border border-white/10 rounded-2xl p-6 max-w-lg w-full max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm font-black uppercase tracking-wider text-white">🛡️ Fondo de Cobertura — {employee.name}</h2>
                    <button onClick={onClose} className="text-gray-500 hover:text-white text-xl">✕</button>
                </div>

                {!fund ? (
                    <div className="text-center py-8">
                        <p className="text-gray-500 text-sm mb-4">Sin fondo registrado</p>
                        <button onClick={crearFondo} className="px-4 py-2 rounded-xl bg-teal-600 text-white text-[10px] font-bold uppercase hover:bg-teal-500 transition-all">
                            + Crear Fondo ($600)
                        </button>
                    </div>
                ) : (
                    <>
                        {/* Estado del fondo */}
                        <div className="bg-white/[0.02] border border-white/5 rounded-xl p-4 mb-4">
                            <div className="flex justify-between text-[9px] font-bold uppercase text-gray-500 mb-2">
                                <span>Fondo de Cobertura</span>
                                <span className={fund.estado === 'cubierto' ? 'text-green-400' : 'text-amber-400'}>{fund.estado.toUpperCase()}</span>
                            </div>
                            <div className="w-full h-3 bg-white/5 rounded-full overflow-hidden mb-1">
                                <div className={`h-full rounded-full transition-all ${fund.estado === 'cubierto' ? 'bg-green-500' : 'bg-blue-500'}`}
                                    style={{ width: `${Math.min(100, (fund.monto_cubierto / fund.monto_requerido) * 100)}%` }} />
                            </div>
                            <div className="flex justify-between text-[10px]">
                                <span className="text-gray-400">Cubierto: <span className="text-white font-bold">${fund.monto_cubierto.toFixed(0)}</span></span>
                                <span className="text-gray-400">Pendiente: <span className="text-amber-400 font-bold">${fund.pendiente.toFixed(0)}</span></span>
                            </div>
                        </div>

                        {/* Tabla de porcentajes */}
                        <div className="bg-white/[0.02] border border-white/5 rounded-xl p-3 mb-4">
                            <p className="text-[9px] font-bold uppercase text-gray-500 mb-2">Tabla de aplicación por anticipación</p>
                            <div className="grid grid-cols-7 gap-1">
                                {TABLA_PCT.map((t, i) => (
                                    <div key={i} className="text-center">
                                        <p className={`text-[10px] font-black ${t.color}`}>{t.pct}</p>
                                        <p className="text-[8px] text-gray-600">{t.dias}</p>
                                    </div>
                                ))}
                            </div>
                            <p className="text-[8px] text-gray-700 text-center mt-2">Reposición en 3 exhibiciones semanales</p>
                        </div>

                        {/* Movimientos */}
                        <div className="space-y-1">
                            <p className="text-[9px] font-bold uppercase text-gray-500 mb-1">Movimientos</p>
                            {(data.movimientos || []).map(m => (
                                <div key={m.id} className="flex justify-between items-center bg-white/[0.02] rounded-lg px-3 py-1.5 text-[10px]">
                                    <span className="text-gray-400">{m.fecha}</span>
                                    <span className="text-gray-300 flex-1 mx-2 truncate">{m.concepto}</span>
                                    {m.porcentaje && <span className="text-gray-500 mr-2">{(m.porcentaje * 100).toFixed(0)}%</span>}
                                    <span className={m.tipo === 'abono' ? 'text-green-400 font-bold' : 'text-red-400 font-bold'}>
                                        {m.tipo === 'abono' ? '+' : '-'}${m.monto}
                                    </span>
                                </div>
                            ))}
                            {(data.movimientos || []).length === 0 && <p className="text-gray-700 text-[10px] text-center py-2">Sin movimientos</p>}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};
