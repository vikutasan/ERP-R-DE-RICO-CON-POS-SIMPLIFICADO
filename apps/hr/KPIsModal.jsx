import React, { useState, useEffect } from 'react';
import { hrService } from './hrService';

const KPI_RUBROS = [
    { key: 'puntualidad', label: 'Puntualidad', icon: '⏰', max: 100 },
    { key: 'actitud', label: 'Actitud', icon: '😊', max: 100 },
    { key: 'productividad', label: 'Productividad', icon: '📈', max: 100 },
    { key: 'limpieza', label: 'Limpieza', icon: '🧹', max: 100 },
    { key: 'trabajo_equipo', label: 'Trabajo en equipo', icon: '🤝', max: 100 },
    { key: 'atencion_cliente', label: 'Atención al cliente', icon: '💬', max: 100 },
];

export const KPIsModal = ({ employee, onClose }) => {
    const [kpis, setKpis] = useState([]);
    const [showForm, setShowForm] = useState(false);
    const [detalle, setDetalle] = useState({});
    const [saving, setSaving] = useState(false);

    useEffect(() => { load(); initForm(); }, []);
    const load = async () => { setKpis(await hrService.getKPIs(employee.id) || []); };
    const initForm = () => { const d = {}; KPI_RUBROS.forEach(r => d[r.key] = 50); setDetalle(d); };

    const handleCreate = async () => {
        setSaving(true);
        const now = new Date();
        await hrService.createKPI({ employee_id: employee.id, mes: now.getMonth() + 1, año: now.getFullYear(), detalle });
        setShowForm(false); initForm(); await load(); setSaving(false);
    };

    const scoreColor = (s) => s >= 80 ? 'text-green-400' : s >= 60 ? 'text-amber-400' : 'text-red-400';

    return (
        <div className="fixed inset-0 z-[99999] bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-[#111] border border-white/10 rounded-2xl p-6 max-w-lg w-full max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm font-black uppercase tracking-wider text-white">📊 KPIs — {employee.name}</h2>
                    <div className="flex gap-2">
                        <button onClick={() => setShowForm(!showForm)} className="px-3 py-1.5 rounded-lg bg-emerald-600/10 border border-emerald-500/20 text-emerald-400 text-[9px] font-bold uppercase hover:bg-emerald-600/20">+ Evaluar</button>
                        <button onClick={onClose} className="text-gray-500 hover:text-white text-xl">✕</button>
                    </div>
                </div>

                {showForm && (
                    <div className="bg-white/[0.02] border border-white/5 rounded-xl p-4 mb-4 space-y-3">
                        {KPI_RUBROS.map(r => (
                            <div key={r.key} className="flex items-center gap-3">
                                <span className="text-[10px] font-bold text-gray-400 w-36">{r.icon} {r.label}</span>
                                <input type="range" min="0" max="100" value={detalle[r.key] || 0} onChange={e => setDetalle(d => ({...d, [r.key]: Number(e.target.value)}))} className="flex-1 accent-emerald-500" />
                                <span className={`text-xs font-black w-8 text-right ${scoreColor(detalle[r.key] || 0)}`}>{detalle[r.key]}</span>
                            </div>
                        ))}
                        <div className="text-center pt-2 border-t border-white/5">
                            <span className="text-[9px] text-gray-500 uppercase">Score promedio: </span>
                            <span className={`text-lg font-black ${scoreColor(Object.values(detalle).reduce((a,b) => a+b, 0) / Object.values(detalle).length)}`}>
                                {(Object.values(detalle).reduce((a,b) => a+b, 0) / Object.values(detalle).length).toFixed(0)}
                            </span>
                        </div>
                        <button onClick={handleCreate} disabled={saving} className={`w-full py-2 rounded-lg text-[10px] font-bold uppercase ${saving ? 'bg-gray-800 text-gray-600' : 'bg-emerald-600 text-white hover:bg-emerald-500'}`}>
                            {saving ? 'Guardando...' : 'Guardar Evaluación'}
                        </button>
                    </div>
                )}

                <div className="space-y-2">
                    {kpis.length === 0 ? <p className="text-gray-600 text-sm text-center py-6">Sin evaluaciones registradas</p>
                    : kpis.map(k => (
                        <div key={k.id} className="bg-white/[0.02] border border-white/5 rounded-xl p-3">
                            <div className="flex justify-between items-center mb-2">
                                <span className="text-[9px] text-gray-500 font-bold uppercase">{['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'][k.mes]} {k.año}</span>
                                <span className={`text-lg font-black ${scoreColor(k.score_total)}`}>{k.score_total.toFixed(0)}</span>
                            </div>
                            <div className="grid grid-cols-6 gap-1">
                                {KPI_RUBROS.map(r => (
                                    <div key={r.key} className="text-center">
                                        <div className="text-sm">{r.icon}</div>
                                        <p className={`text-[9px] font-bold ${scoreColor(k.detalle?.[r.key] || 0)}`}>{k.detalle?.[r.key] || '-'}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};
