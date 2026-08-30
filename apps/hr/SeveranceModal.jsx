import React, { useState, useEffect } from 'react';
import { hrService } from './hrService';

const MOTIVOS = [
    { value: 'renuncia', label: 'Renuncia voluntaria', icon: '🚪' },
    { value: 'baja_disciplinaria', label: 'Baja disciplinaria', icon: '❌' },
    { value: 'termino_contrato', label: 'Término de contrato', icon: '📄' },
    { value: 'mutuo_acuerdo', label: 'Mutuo acuerdo', icon: '🤝' },
];

export const SeveranceModal = ({ employee, onClose }) => {
    const [data, setData] = useState(null);
    const [motivo, setMotivo] = useState('renuncia');
    const [calculating, setCalculating] = useState(false);

    useEffect(() => { load(); }, []);
    const load = async () => { setData(await hrService.getSeverance(employee.id)); };

    const calcular = async () => {
        setCalculating(true);
        const result = await hrService.calculateSeverance({ employee_id: employee.id, motivo_salida: motivo });
        setData({ finiquito: result });
        setCalculating(false);
    };

    const fin = data?.finiquito;

    const Row = ({ label, value, color = 'text-white', bold }) => (
        <div className={`flex justify-between py-1 ${bold ? 'border-t border-white/10 mt-1 pt-2' : ''}`}>
            <span className="text-[10px] text-gray-400">{label}</span>
            <span className={`text-[10px] font-bold ${color}`}>{value}</span>
        </div>
    );

    return (
        <div className="fixed inset-0 z-[99999] bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-[#111] border border-white/10 rounded-2xl p-6 max-w-lg w-full max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm font-black uppercase tracking-wider text-white">💼 Finiquito — {employee.name}</h2>
                    <button onClick={onClose} className="text-gray-500 hover:text-white text-xl">✕</button>
                </div>

                {/* Selector de motivo + botón calcular */}
                <div className="grid grid-cols-2 gap-2 mb-4">
                    {MOTIVOS.map(m => (
                        <button key={m.value} onClick={() => setMotivo(m.value)}
                            className={`py-2 px-3 rounded-xl border text-[9px] font-bold text-left transition-all ${motivo === m.value ? 'bg-orange-600/15 border-orange-500/30 text-orange-300' : 'bg-white/5 border-white/5 text-gray-600 hover:bg-white/10'}`}>
                            {m.icon} {m.label}
                        </button>
                    ))}
                </div>

                <button onClick={calcular} disabled={calculating}
                    className={`w-full py-2.5 rounded-xl text-[10px] font-bold uppercase mb-4 transition-all ${calculating ? 'bg-gray-800 text-gray-600' : 'bg-orange-600 text-white hover:bg-orange-500 active:scale-95'}`}>
                    {calculating ? 'Calculando...' : '🧮 Calcular Finiquito'}
                </button>

                {fin && (
                    <div className="bg-white/[0.02] border border-white/5 rounded-xl p-4">
                        {/* Header info */}
                        <div className="grid grid-cols-3 gap-2 mb-4 text-center">
                            <div className="bg-white/5 rounded-lg p-2">
                                <p className="text-lg font-black text-white">{fin.dias_trabajados || '—'}</p>
                                <p className="text-[8px] text-gray-500 uppercase">Días trabajados</p>
                            </div>
                            <div className="bg-white/5 rounded-lg p-2">
                                <p className="text-lg font-black text-blue-400">{fin.años_servicio || '—'}</p>
                                <p className="text-[8px] text-gray-500 uppercase">Años servicio</p>
                            </div>
                            <div className="bg-white/5 rounded-lg p-2">
                                <p className="text-lg font-black text-amber-400">${fin.sueldo_dia || '—'}</p>
                                <p className="text-[8px] text-gray-500 uppercase">Sueldo/día</p>
                            </div>
                        </div>

                        {/* Percepciones */}
                        <p className="text-[9px] font-black uppercase text-green-400 mb-1">📈 Percepciones</p>
                        {fin.percepciones && Object.entries(fin.percepciones).map(([k, v]) => (
                            <Row key={k} label={k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())} value={`$${v.toFixed(2)}`} color="text-green-400" />
                        ))}
                        <Row label="TOTAL PERCEPCIONES" value={`$${fin.total_percepciones?.toFixed(2)}`} color="text-green-400" bold />

                        {/* Deducciones */}
                        {fin.deducciones && Object.keys(fin.deducciones).length > 0 && (
                            <>
                                <p className="text-[9px] font-black uppercase text-red-400 mt-3 mb-1">📉 Deducciones</p>
                                {Object.entries(fin.deducciones).map(([k, v]) => (
                                    <Row key={k} label={k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())} value={`-$${v.toFixed(2)}`} color="text-red-400" />
                                ))}
                                <Row label="TOTAL DEDUCCIONES" value={`-$${fin.total_deducciones?.toFixed(2)}`} color="text-red-400" bold />
                            </>
                        )}

                        {/* Neto */}
                        <div className="mt-3 pt-3 border-t border-white/10 flex justify-between items-center">
                            <span className="text-sm font-black uppercase text-gray-300">NETO A PAGAR</span>
                            <span className="text-2xl font-black text-green-400">${fin.neto?.toFixed(2)}</span>
                        </div>
                    </div>
                )}

                {!fin && !calculating && <p className="text-gray-600 text-sm text-center py-6">Selecciona motivo y calcula el finiquito</p>}
            </div>
        </div>
    );
};
