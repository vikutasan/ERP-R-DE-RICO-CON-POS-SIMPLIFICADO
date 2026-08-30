import React, { useState, useEffect } from 'react';
import { hrService } from './hrService';

export const VacationsModal = ({ employee, onClose }) => {
    const [vacations, setVacations] = useState([]);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({ fecha_inicio: '', fecha_fin: '', observaciones: '' });
    const [saving, setSaving] = useState(false);

    useEffect(() => { load(); }, []);
    const load = async () => { setVacations(await hrService.getVacations(employee.id) || []); };

    const handleCreate = async () => {
        setSaving(true);
        await hrService.createVacation({ employee_id: employee.id, ...form });
        setShowForm(false); setForm({ fecha_inicio: '', fecha_fin: '', observaciones: '' });
        await load(); setSaving(false);
    };

    const ESTADO_COLORS = { pendiente: 'text-amber-400 bg-amber-500/10', aprobado: 'text-green-400 bg-green-500/10', rechazado: 'text-red-400 bg-red-500/10', completado: 'text-blue-400 bg-blue-500/10' };

    return (
        <div className="fixed inset-0 z-[99999] bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-[#111] border border-white/10 rounded-2xl p-6 max-w-lg w-full max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm font-black uppercase tracking-wider text-white">🏖️ Vacaciones — {employee.name}</h2>
                    <div className="flex gap-2">
                        <button onClick={() => setShowForm(!showForm)} className="px-3 py-1.5 rounded-lg bg-green-600/10 border border-green-500/20 text-green-400 text-[9px] font-bold uppercase hover:bg-green-600/20">+ Solicitar</button>
                        <button onClick={onClose} className="text-gray-500 hover:text-white text-xl">✕</button>
                    </div>
                </div>

                {showForm && (
                    <div className="bg-white/[0.02] border border-white/5 rounded-xl p-4 mb-4 space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                            <div><label className="block text-[9px] font-bold uppercase text-gray-500 mb-1">Inicio</label>
                                <input type="date" value={form.fecha_inicio} onChange={e => setForm(f => ({...f, fecha_inicio: e.target.value}))} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none" /></div>
                            <div><label className="block text-[9px] font-bold uppercase text-gray-500 mb-1">Fin</label>
                                <input type="date" value={form.fecha_fin} onChange={e => setForm(f => ({...f, fecha_fin: e.target.value}))} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none" /></div>
                        </div>
                        <textarea value={form.observaciones} onChange={e => setForm(f => ({...f, observaciones: e.target.value}))} placeholder="Observaciones..." className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-700 outline-none h-12 resize-none" />
                        <button onClick={handleCreate} disabled={!form.fecha_inicio || !form.fecha_fin || saving}
                            className={`w-full py-2 rounded-lg text-[10px] font-bold uppercase ${saving ? 'bg-gray-800 text-gray-600' : 'bg-green-600 text-white hover:bg-green-500'}`}>
                            {saving ? 'Registrando...' : 'Solicitar Vacaciones'}
                        </button>
                    </div>
                )}

                <div className="space-y-2">
                    {vacations.length === 0 ? <p className="text-gray-600 text-sm text-center py-6">Sin vacaciones registradas</p>
                    : vacations.map(v => (
                        <div key={v.id} className="bg-white/[0.02] border border-white/5 rounded-xl p-3 flex justify-between items-center">
                            <div>
                                <p className="text-xs font-bold text-white">📅 {v.fecha_inicio} → {v.fecha_fin}</p>
                                <p className="text-[9px] text-gray-500">{v.dias} días{v.observaciones ? ` • ${v.observaciones}` : ''}</p>
                            </div>
                            <span className={`text-[8px] font-bold px-2 py-0.5 rounded ${ESTADO_COLORS[v.estado] || ''}`}>{v.estado?.toUpperCase()}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};
