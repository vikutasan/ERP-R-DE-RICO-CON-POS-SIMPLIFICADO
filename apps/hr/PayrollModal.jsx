import React, { useState, useEffect } from 'react';
import { hrService } from './hrService';

/**
 * Modal de Nómina — Desglose semanal con percepciones y deducciones
 */
export const PayrollModal = ({ employee, onClose }) => {
    const [payrolls, setPayrolls] = useState([]);
    const [calculating, setCalculating] = useState(false);

    useEffect(() => { load(); }, []);

    const load = async () => {
        const p = await hrService.getPayroll(employee.id);
        setPayrolls(p || []);
    };

    const calcularSemanaActual = async () => {
        setCalculating(true);
        const now = new Date();
        const start = new Date(now.getFullYear(), 0, 1);
        const diff = now - start;
        const oneWeek = 604800000;
        const semana = Math.ceil(diff / oneWeek);
        await hrService.calculatePayroll(employee.id, semana, now.getFullYear());
        await load();
        setCalculating(false);
    };

    const Row = ({ label, value, bold, color = 'text-white' }) => (
        <div className={`flex justify-between py-1 ${bold ? 'border-t border-white/10 mt-1 pt-2' : ''}`}>
            <span className="text-[10px] text-gray-400">{label}</span>
            <span className={`text-[10px] font-bold ${color}`}>{value}</span>
        </div>
    );

    return (
        <div className="fixed inset-0 z-[99999] bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-[#111] border border-white/10 rounded-2xl p-6 max-w-lg w-full max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm font-black uppercase tracking-wider text-white">💰 Nómina — {employee.name}</h2>
                    <button onClick={onClose} className="text-gray-500 hover:text-white text-xl">✕</button>
                </div>

                <button onClick={calcularSemanaActual} disabled={calculating}
                    className={`w-full py-2 rounded-xl text-[10px] font-bold uppercase mb-4 transition-all ${calculating ? 'bg-gray-800 text-gray-600' : 'bg-green-600/10 border border-green-500/20 text-green-400 hover:bg-green-600/20'}`}>
                    {calculating ? 'Calculando...' : '🔄 Calcular Semana Actual'}
                </button>

                {payrolls.length === 0 ? (
                    <p className="text-gray-600 text-sm text-center py-6">Sin nóminas calculadas. Presiona el botón para calcular.</p>
                ) : payrolls.map(p => (
                    <div key={p.id} className="bg-white/[0.02] border border-white/5 rounded-xl p-4 mb-3">
                        <div className="flex justify-between items-center mb-3">
                            <span className="text-[9px] font-bold uppercase text-gray-500">Semana {p.semana} / {p.año}</span>
                            <span className={`text-[8px] font-bold px-2 py-0.5 rounded ${p.aprobado ? 'bg-green-500/20 text-green-400' : 'bg-amber-500/20 text-amber-400'}`}>
                                {p.aprobado ? '✅ Aprobada' : '⏳ Pendiente'}
                            </span>
                        </div>

                        <div className="grid grid-cols-4 gap-2 mb-3 text-center">
                            <div className="bg-white/5 rounded-lg p-2">
                                <p className="text-lg font-black text-white">{p.dias_trabajados}</p>
                                <p className="text-[8px] text-gray-500 uppercase">Trabajados</p>
                            </div>
                            <div className="bg-green-500/10 rounded-lg p-2">
                                <p className="text-lg font-black text-green-400">{p.dias_puntuales}</p>
                                <p className="text-[8px] text-gray-500 uppercase">Puntuales</p>
                            </div>
                            <div className="bg-amber-500/10 rounded-lg p-2">
                                <p className="text-lg font-black text-amber-400">{p.dias_retardo}</p>
                                <p className="text-[8px] text-gray-500 uppercase">Retardos</p>
                            </div>
                            <div className="bg-red-500/10 rounded-lg p-2">
                                <p className="text-lg font-black text-red-400">{p.dias_falta || 0}</p>
                                <p className="text-[8px] text-gray-500 uppercase">Faltas</p>
                            </div>
                        </div>

                        <Row label="Salario base" value={`$${p.salario_base.toFixed(2)}`} />
                        <Row label="Bono puntualidad" value={`+$${p.bono_puntualidad.toFixed(2)}`} color="text-green-400" />
                        <Row label="Total percepciones" value={`$${p.total_percepciones.toFixed(2)}`} bold />

                        {(p.deduccion_uniforme > 0 || p.deduccion_fondo > 0 || p.deduccion_otros > 0) && (
                            <>
                                {p.deduccion_uniforme > 0 && <Row label="(-) Fianza uniforme" value={`-$${p.deduccion_uniforme.toFixed(2)}`} color="text-red-400" />}
                                {p.deduccion_fondo > 0 && <Row label="(-) Fondo cobertura" value={`-$${p.deduccion_fondo.toFixed(2)}`} color="text-red-400" />}
                                {p.deduccion_otros > 0 && <Row label="(-) Otros" value={`-$${p.deduccion_otros.toFixed(2)}`} color="text-red-400" />}
                                <Row label="Total deducciones" value={`-$${p.total_deducciones.toFixed(2)}`} color="text-red-400" bold />
                            </>
                        )}

                        <div className="mt-2 pt-2 border-t border-white/10 flex justify-between">
                            <span className="text-xs font-black uppercase text-gray-300">NETO A PAGAR</span>
                            <span className="text-lg font-black text-green-400">${p.neto.toFixed(2)}</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
