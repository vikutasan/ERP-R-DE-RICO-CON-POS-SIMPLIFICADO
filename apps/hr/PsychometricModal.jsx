import React, { useState, useEffect } from 'react';
import { hrService } from './hrService';

const DISC_LABELS = { D: 'Dominancia', I: 'Influencia', S: 'Estabilidad', C: 'Cumplimiento' };
const DISC_COLORS = { D: '#ef4444', I: '#f59e0b', S: '#22c55e', C: '#3b82f6' };

export const PsychometricModal = ({ employee, onClose }) => {
    const [tests, setTests] = useState([]);
    const [showForm, setShowForm] = useState(false);
    const [testTipo, setTestTipo] = useState('disc');
    const [results, setResults] = useState({ D: 50, I: 50, S: 50, C: 50 });
    const [recomendacion, setRecomendacion] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => { load(); }, []);
    const load = async () => { setTests(await hrService.getPsychometrics(employee.id) || []); };

    const handleCreate = async () => {
        setSaving(true);
        await hrService.createPsychometric({ employee_id: employee.id, test_tipo: testTipo, resultados: results, recomendacion });
        setShowForm(false); await load(); setSaving(false);
    };

    return (
        <div className="fixed inset-0 z-[99999] bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-[#111] border border-white/10 rounded-2xl p-6 max-w-lg w-full max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm font-black uppercase tracking-wider text-white">🧠 Psicométricos — {employee.name}</h2>
                    <div className="flex gap-2">
                        <button onClick={() => setShowForm(!showForm)} className="px-3 py-1.5 rounded-lg bg-violet-600/10 border border-violet-500/20 text-violet-400 text-[9px] font-bold uppercase hover:bg-violet-600/20">+ Test</button>
                        <button onClick={onClose} className="text-gray-500 hover:text-white text-xl">✕</button>
                    </div>
                </div>

                {showForm && (
                    <div className="bg-white/[0.02] border border-white/5 rounded-xl p-4 mb-4 space-y-3">
                        <div className="flex gap-2">
                            {['disc', 'valores', 'aptitud'].map(t => (
                                <button key={t} onClick={() => setTestTipo(t)} className={`flex-1 py-2 rounded-lg border text-[9px] font-bold uppercase ${testTipo === t ? 'bg-violet-600/15 border-violet-500/30 text-violet-300' : 'bg-white/5 border-white/5 text-gray-600'}`}>
                                    {t === 'disc' ? '🎯 DISC' : t === 'valores' ? '💎 Valores' : '📊 Aptitud'}
                                </button>
                            ))}
                        </div>
                        {testTipo === 'disc' && Object.keys(DISC_LABELS).map(key => (
                            <div key={key} className="flex items-center gap-3">
                                <span className="text-[10px] font-bold w-24" style={{ color: DISC_COLORS[key] }}>{DISC_LABELS[key]}</span>
                                <input type="range" min="0" max="100" value={results[key] || 50} onChange={e => setResults(r => ({...r, [key]: Number(e.target.value)}))} className="flex-1 accent-violet-500" />
                                <span className="text-xs font-black text-white w-8 text-right">{results[key]}</span>
                            </div>
                        ))}
                        {testTipo !== 'disc' && (
                            <textarea value={JSON.stringify(results)} onChange={e => { try { setResults(JSON.parse(e.target.value)); } catch {} }}
                                placeholder='{"criterio1": 80, "criterio2": 60}' className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-700 outline-none h-20 resize-none font-mono" />
                        )}
                        <textarea value={recomendacion} onChange={e => setRecomendacion(e.target.value)} placeholder="Recomendación del evaluador..."
                            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-700 outline-none h-12 resize-none" />
                        <button onClick={handleCreate} disabled={saving} className={`w-full py-2 rounded-lg text-[10px] font-bold uppercase ${saving ? 'bg-gray-800 text-gray-600' : 'bg-violet-600 text-white hover:bg-violet-500'}`}>
                            {saving ? 'Guardando...' : 'Guardar Test'}
                        </button>
                    </div>
                )}

                <div className="space-y-2">
                    {tests.length === 0 ? <p className="text-gray-600 text-sm text-center py-6">Sin tests registrados</p>
                    : tests.map(t => (
                        <div key={t.id} className="bg-white/[0.02] border border-white/5 rounded-xl p-3">
                            <div className="flex justify-between items-center mb-2">
                                <span className="text-xs font-bold text-white">{t.test_tipo === 'disc' ? '🎯 DISC' : t.test_tipo === 'valores' ? '💎 Valores' : '📊 Aptitud'}</span>
                                <span className="text-[9px] text-gray-500">{t.fecha}</span>
                            </div>
                            {t.test_tipo === 'disc' && t.resultados && (
                                <div className="grid grid-cols-4 gap-1">
                                    {Object.entries(DISC_LABELS).map(([key, label]) => (
                                        <div key={key} className="text-center">
                                            <div className="relative h-16 bg-white/5 rounded-lg overflow-hidden">
                                                <div className="absolute bottom-0 w-full rounded-b-lg transition-all" style={{ height: `${t.resultados[key] || 0}%`, background: DISC_COLORS[key] }} />
                                            </div>
                                            <p className="text-[8px] font-bold mt-1" style={{ color: DISC_COLORS[key] }}>{key}: {t.resultados[key] || 0}</p>
                                        </div>
                                    ))}
                                </div>
                            )}
                            {t.recomendacion && <p className="text-[10px] text-gray-400 mt-2 italic">💡 {t.recomendacion}</p>}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};
