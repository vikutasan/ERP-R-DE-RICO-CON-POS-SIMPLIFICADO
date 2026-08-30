import React, { useState, useEffect } from 'react';
import { hrService } from './hrService';

/**
 * Modal de Fianza de Uniforme — Saldo + Movimientos + Abonos
 */
export const UniformDepositModal = ({ employee, onClose }) => {
    const [data, setData] = useState(null);
    const [showAbono, setShowAbono] = useState(false);
    const [monto, setMonto] = useState(100);

    useEffect(() => { load(); }, []);

    const load = async () => {
        const d = await hrService.getUniform(employee.id);
        setData(d);
    };

    const crearFianza = async () => {
        await hrService.createUniform({ employee_id: employee.id });
        await load();
    };

    const registrarAbono = async (depositId) => {
        await hrService.addUniformMovement(depositId, { monto, tipo: 'abono', concepto: 'Descuento semanal' });
        setShowAbono(false);
        await load();
    };

    if (!data) return null;

    return (
        <div className="fixed inset-0 z-[99999] bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-[#111] border border-white/10 rounded-2xl p-6 max-w-lg w-full max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm font-black uppercase tracking-wider text-white">👔 Fianza Uniforme — {employee.name}</h2>
                    <button onClick={onClose} className="text-gray-500 hover:text-white text-xl">✕</button>
                </div>

                {data.uniformes.length === 0 ? (
                    <div className="text-center py-8">
                        <p className="text-gray-500 text-sm mb-4">Sin uniforme registrado</p>
                        <button onClick={crearFianza} className="px-4 py-2 rounded-xl bg-teal-600 text-white text-[10px] font-bold uppercase hover:bg-teal-500 transition-all">
                            + Registrar Uniforme ($600)
                        </button>
                    </div>
                ) : data.uniformes.map(uni => (
                    <div key={uni.id} className="mb-4">
                        {/* Barra de progreso */}
                        <div className="bg-white/[0.02] border border-white/5 rounded-xl p-4 mb-3">
                            <div className="flex justify-between text-[9px] font-bold uppercase text-gray-500 mb-2">
                                <span>Uniforme #{uni.uniforme_numero}</span>
                                <span className={uni.estado === 'cubierto' ? 'text-green-400' : 'text-amber-400'}>{uni.estado.toUpperCase()}</span>
                            </div>
                            <div className="w-full h-3 bg-white/5 rounded-full overflow-hidden mb-1">
                                <div className={`h-full rounded-full transition-all ${uni.estado === 'cubierto' ? 'bg-green-500' : 'bg-amber-500'}`}
                                    style={{ width: `${Math.min(100, (uni.pagado / uni.fianza_total) * 100)}%` }} />
                            </div>
                            <div className="flex justify-between text-[10px]">
                                <span className="text-gray-400">Pagado: <span className="text-white font-bold">${uni.pagado.toFixed(0)}</span></span>
                                <span className="text-gray-400">Pendiente: <span className="text-amber-400 font-bold">${uni.pendiente.toFixed(0)}</span></span>
                                <span className="text-gray-400">Total: ${uni.fianza_total}</span>
                            </div>
                        </div>

                        {/* Botón abonar */}
                        {uni.estado === 'pendiente' && (
                            <div className="mb-3">
                                {showAbono ? (
                                    <div className="flex gap-2">
                                        <input type="number" value={monto} onChange={e => setMonto(Number(e.target.value))}
                                            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none" />
                                        <button onClick={() => registrarAbono(uni.id)} className="px-4 py-2 rounded-lg bg-green-600 text-white text-[10px] font-bold uppercase hover:bg-green-500">Abonar</button>
                                        <button onClick={() => setShowAbono(false)} className="px-3 py-2 rounded-lg bg-white/5 text-gray-400 text-[10px]">✕</button>
                                    </div>
                                ) : (
                                    <button onClick={() => setShowAbono(true)} className="w-full py-2 rounded-lg bg-green-600/10 border border-green-500/20 text-green-400 text-[9px] font-bold uppercase hover:bg-green-600/20 transition-all">
                                        + Registrar Abono
                                    </button>
                                )}
                            </div>
                        )}

                        {/* Movimientos */}
                        <div className="space-y-1">
                            <p className="text-[9px] font-bold uppercase text-gray-500 mb-1">Movimientos</p>
                            {(uni.movimientos || []).map(m => (
                                <div key={m.id} className="flex justify-between items-center bg-white/[0.02] rounded-lg px-3 py-1.5 text-[10px]">
                                    <span className="text-gray-400">{m.fecha}</span>
                                    <span className="text-gray-300">{m.concepto}</span>
                                    <span className={m.tipo === 'abono' ? 'text-green-400 font-bold' : 'text-red-400 font-bold'}>
                                        {m.tipo === 'abono' ? '+' : '-'}${m.monto}
                                    </span>
                                </div>
                            ))}
                            {(uni.movimientos || []).length === 0 && <p className="text-gray-700 text-[10px] text-center py-2">Sin movimientos</p>}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
