import React, { useState, useEffect } from 'react';
import { hrService } from './hrService';

/**
 * Modal de Incidencias — Historial + Registro
 */
const TIPOS = [
    { value: 'llamada_atencion', label: '⚠️ Llamada de Atención', color: 'text-amber-400 bg-amber-600/10 border-amber-500/20' },
    { value: 'acta_administrativa', label: '📋 Acta Administrativa', color: 'text-red-400 bg-red-600/10 border-red-500/20' },
    { value: 'baja', label: '❌ Baja', color: 'text-red-500 bg-red-700/10 border-red-600/20' },
];

export const IncidentsModal = ({ employee, onClose }) => {
    const [incidents, setIncidents] = useState([]);
    const [summary, setSummary] = useState(null);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({ tipo: 'llamada_atencion', motivo: '', descripcion: '' });
    const [saving, setSaving] = useState(false);

    useEffect(() => { load(); }, []);

    const load = async () => {
        const [inc, sum] = await Promise.all([
            hrService.getIncidents(employee.id),
            hrService.getIncidentSummary(employee.id),
        ]);
        setIncidents(inc || []);
        setSummary(sum);
    };

    const handleSave = async () => {
        setSaving(true);
        await hrService.createIncident({ employee_id: employee.id, ...form });
        setShowForm(false);
        setForm({ tipo: 'llamada_atencion', motivo: '', descripcion: '' });
        await load();
        setSaving(false);
    };

    return (
        <div className="fixed inset-0 z-[99999] bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-[#111] border border-white/10 rounded-2xl p-6 max-w-2xl w-full max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h2 className="text-sm font-black uppercase tracking-wider text-white">⚡ Incidencias — {employee.name}</h2>
                        {summary && (
                            <p className="text-[9px] text-gray-500 mt-1">
                                Llamadas: {summary.llamadas_atencion} | Actas: {summary.actas_administrativas} | Bajas: {summary.bajas}
                                {summary.alerta && <span className="ml-2 text-red-400 font-bold">🔴 {summary.alerta}</span>}
                            </p>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={() => setShowForm(!showForm)} className="px-3 py-1.5 rounded-lg bg-amber-600/10 border border-amber-500/20 text-amber-400 text-[9px] font-bold uppercase hover:bg-amber-600/20 transition-all">
                            + Nueva
                        </button>
                        <button onClick={onClose} className="text-gray-500 hover:text-white text-xl">✕</button>
                    </div>
                </div>

                {/* Formulario */}
                {showForm && (
                    <div className="bg-white/[0.02] border border-white/5 rounded-xl p-4 mb-4 space-y-3">
                        <div className="flex gap-2">
                            {TIPOS.map(t => (
                                <button key={t.value} onClick={() => setForm(f => ({...f, tipo: t.value}))}
                                    className={`flex-1 py-2 rounded-lg border text-[9px] font-bold transition-all ${form.tipo === t.value ? t.color : 'bg-white/5 border-white/5 text-gray-600'}`}>
                                    {t.label}
                                </button>
                            ))}
                        </div>
                        <input value={form.motivo} onChange={e => setForm(f => ({...f, motivo: e.target.value}))} placeholder="Motivo de la incidencia..."
                            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-700 outline-none" />
                        <textarea value={form.descripcion} onChange={e => setForm(f => ({...f, descripcion: e.target.value}))} placeholder="Descripción detallada (opcional)..."
                            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-700 outline-none h-16 resize-none" />
                        <button onClick={handleSave} disabled={!form.motivo || saving}
                            className={`w-full py-2 rounded-lg text-[10px] font-bold uppercase transition-all ${saving || !form.motivo ? 'bg-gray-800 text-gray-600' : 'bg-amber-600 text-white hover:bg-amber-500'}`}>
                            {saving ? 'Registrando...' : 'Registrar Incidencia'}
                        </button>
                    </div>
                )}

                {/* Historial */}
                <div className="space-y-2">
                    {incidents.length === 0 ? (
                        <p className="text-gray-600 text-sm text-center py-6">Sin incidencias registradas ✅</p>
                    ) : incidents.map(inc => {
                        const tipoInfo = TIPOS.find(t => t.value === inc.tipo) || TIPOS[0];
                        return (
                            <div key={inc.id} className={`rounded-xl p-3 border ${tipoInfo.color} flex items-start gap-3`}>
                                <div className="shrink-0 mt-0.5 text-lg">{inc.tipo === 'baja' ? '❌' : inc.tipo === 'acta_administrativa' ? '📋' : '⚠️'}</div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <p className="text-xs font-bold text-white">{inc.motivo}</p>
                                        {inc.auto_generada && <span className="text-[8px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded font-bold">AUTO</span>}
                                    </div>
                                    {inc.descripcion && <p className="text-[10px] text-gray-400 mt-0.5">{inc.descripcion}</p>}
                                    <p className="text-[9px] text-gray-600 mt-1">{inc.fecha}{inc.dias_suspension > 0 ? ` • Suspensión: ${inc.dias_suspension} días` : ''}</p>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};
