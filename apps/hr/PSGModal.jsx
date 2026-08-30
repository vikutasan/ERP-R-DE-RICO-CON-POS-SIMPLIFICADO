import React, { useState, useEffect } from 'react';
import { hrService } from './hrService';

/**
 * Modal de PSGs — Permisos Sin Goce de Sueldo
 * Max 3 por contrato de 6 meses. Muestra días de anticipación y uso del fondo.
 */
export const PSGModal = ({ employee, onClose }) => {
    const [psgs, setPsgs] = useState([]);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({ fecha_permiso: '', observaciones: '' });
    const [saving, setSaving] = useState(false);

    useEffect(() => { load(); }, []);

    const load = async () => {
        const p = await hrService.getPSGs(employee.id);
        setPsgs(p || []);
    };

    const handleCreate = async () => {
        setSaving(true);
        try {
            const result = await hrService.createPSG({
                employee_id: employee.id,
                fecha_permiso: form.fecha_permiso,
                fecha_solicitado: new Date().toISOString().split('T')[0],
                observaciones: form.observaciones,
            });
            if (result.message) {
                setShowForm(false);
                setForm({ fecha_permiso: '', observaciones: '' });
                await load();
            }
        } catch (err) {
            console.error(err);
        }
        setSaving(false);
    };

    const usados = psgs.length;
    const restantes = Math.max(0, 3 - usados);

    return (
        <div className="fixed inset-0 z-[99999] bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-[#111] border border-white/10 rounded-2xl p-6 max-w-lg w-full max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h2 className="text-sm font-black uppercase tracking-wider text-white">📝 PSGs — {employee.name}</h2>
                        <p className="text-[9px] text-gray-500 mt-0.5">
                            Usados: <span className="text-white font-bold">{usados}/3</span> • 
                            Restantes: <span className={`font-bold ${restantes === 0 ? 'text-red-400' : 'text-green-400'}`}>{restantes}</span>
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        {restantes > 0 && (
                            <button onClick={() => setShowForm(!showForm)} className="px-3 py-1.5 rounded-lg bg-blue-600/10 border border-blue-500/20 text-blue-400 text-[9px] font-bold uppercase hover:bg-blue-600/20 transition-all">
                                + Solicitar
                            </button>
                        )}
                        <button onClick={onClose} className="text-gray-500 hover:text-white text-xl">✕</button>
                    </div>
                </div>

                {/* Indicador visual de PSGs */}
                <div className="flex gap-2 mb-4">
                    {[1, 2, 3].map(i => (
                        <div key={i} className={`flex-1 h-2 rounded-full ${i <= usados ? 'bg-amber-500' : 'bg-white/10'}`} />
                    ))}
                </div>

                {/* Formulario */}
                {showForm && (
                    <div className="bg-white/[0.02] border border-white/5 rounded-xl p-4 mb-4 space-y-3">
                        <div>
                            <label className="block text-[9px] font-bold uppercase text-gray-500 mb-1">Fecha del permiso</label>
                            <input type="date" value={form.fecha_permiso} onChange={e => setForm(f => ({...f, fecha_permiso: e.target.value}))}
                                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none" />
                        </div>
                        <div>
                            <label className="block text-[9px] font-bold uppercase text-gray-500 mb-1">Observaciones</label>
                            <textarea value={form.observaciones} onChange={e => setForm(f => ({...f, observaciones: e.target.value}))} placeholder="Motivo del permiso..."
                                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-700 outline-none h-16 resize-none" />
                        </div>
                        <p className="text-[8px] text-gray-600">⚠️ Solicitar con mínimo 6 días de anticipación. Los días de anticipación determinan el % del fondo de cobertura que se aplica.</p>
                        <button onClick={handleCreate} disabled={!form.fecha_permiso || saving}
                            className={`w-full py-2 rounded-lg text-[10px] font-bold uppercase transition-all ${saving || !form.fecha_permiso ? 'bg-gray-800 text-gray-600' : 'bg-blue-600 text-white hover:bg-blue-500'}`}>
                            {saving ? 'Registrando...' : 'Registrar PSG'}
                        </button>
                    </div>
                )}

                {/* Historial */}
                <div className="space-y-2">
                    {psgs.length === 0 ? (
                        <p className="text-gray-600 text-sm text-center py-6">Sin PSGs registrados</p>
                    ) : psgs.map(p => (
                        <div key={p.id} className="bg-white/[0.02] border border-white/5 rounded-xl p-3">
                            <div className="flex justify-between items-start">
                                <div>
                                    <p className="text-xs font-bold text-white">📅 {p.fecha_permiso}</p>
                                    <p className="text-[9px] text-gray-500">Solicitado: {p.fecha_solicitado} • {p.dias_anticipacion} días de anticipación</p>
                                    {p.observaciones && <p className="text-[10px] text-gray-400 mt-1">{p.observaciones}</p>}
                                </div>
                                <div className="text-right">
                                    {p.uso_fondo && (
                                        <p className="text-[9px] text-amber-400 font-bold">Fondo: {(p.porcentaje_fondo * 100).toFixed(0)}% (${p.monto_fondo.toFixed(0)})</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};
