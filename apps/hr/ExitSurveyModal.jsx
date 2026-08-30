import React, { useState, useEffect } from 'react';
import { hrService } from './hrService';

const PREGUNTAS = [
    { key: 'motivo', label: '¿Cuál es tu motivo principal de salida?', type: 'select', options: ['Renuncia voluntaria', 'Mejor oferta laboral', 'Motivos personales', 'Inconformidad con el trato', 'Horarios', 'Salario', 'Otro'] },
    { key: 'ambiente', label: '¿Cómo calificarías el ambiente laboral? (1-10)', type: 'range' },
    { key: 'liderazgo', label: '¿Cómo calificarías a tu gerente/líder? (1-10)', type: 'range' },
    { key: 'crecimiento', label: '¿Sentiste oportunidades de crecimiento? (1-10)', type: 'range' },
    { key: 'recomendaria', label: '¿Recomendarías R de Rico como lugar de trabajo?', type: 'select', options: ['Sí, totalmente', 'Sí, con reservas', 'No'] },
    { key: 'sugerencias', label: '¿Qué mejorarías de la empresa?', type: 'text' },
];

export const ExitSurveyModal = ({ employee, onClose }) => {
    const [data, setData] = useState(null);
    const [showForm, setShowForm] = useState(false);
    const [respuestas, setRespuestas] = useState({});
    const [saving, setSaving] = useState(false);

    useEffect(() => { load(); initForm(); }, []);
    const load = async () => { setData(await hrService.getExitSurvey(employee.id)); };
    const initForm = () => { const r = {}; PREGUNTAS.forEach(p => r[p.key] = p.type === 'range' ? 5 : ''); setRespuestas(r); };

    const handleCreate = async () => {
        setSaving(true);
        await hrService.createExitSurvey({ employee_id: employee.id, motivo_salida: respuestas.motivo || 'Renuncia voluntaria', respuestas });
        setShowForm(false); await load(); setSaving(false);
    };

    const survey = data?.encuesta;

    return (
        <div className="fixed inset-0 z-[99999] bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-[#111] border border-white/10 rounded-2xl p-6 max-w-lg w-full max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm font-black uppercase tracking-wider text-white">📋 Encuesta de Salida — {employee.name}</h2>
                    <div className="flex gap-2">
                        {!survey && <button onClick={() => setShowForm(!showForm)} className="px-3 py-1.5 rounded-lg bg-orange-600/10 border border-orange-500/20 text-orange-400 text-[9px] font-bold uppercase hover:bg-orange-600/20">+ Aplicar</button>}
                        <button onClick={onClose} className="text-gray-500 hover:text-white text-xl">✕</button>
                    </div>
                </div>

                {showForm && (
                    <div className="bg-white/[0.02] border border-white/5 rounded-xl p-4 mb-4 space-y-4">
                        {PREGUNTAS.map(p => (
                            <div key={p.key}>
                                <label className="block text-[9px] font-bold uppercase text-gray-500 mb-1">{p.label}</label>
                                {p.type === 'select' ? (
                                    <select value={respuestas[p.key]} onChange={e => setRespuestas(r => ({...r, [p.key]: e.target.value}))}
                                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none">
                                        <option value="">Seleccionar...</option>
                                        {p.options.map(o => <option key={o} value={o}>{o}</option>)}
                                    </select>
                                ) : p.type === 'range' ? (
                                    <div className="flex items-center gap-3">
                                        <input type="range" min="1" max="10" value={respuestas[p.key]} onChange={e => setRespuestas(r => ({...r, [p.key]: Number(e.target.value)}))} className="flex-1 accent-orange-500" />
                                        <span className="text-sm font-black text-white w-6">{respuestas[p.key]}</span>
                                    </div>
                                ) : (
                                    <textarea value={respuestas[p.key]} onChange={e => setRespuestas(r => ({...r, [p.key]: e.target.value}))} placeholder="Escribe tu respuesta..."
                                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-700 outline-none h-16 resize-none" />
                                )}
                            </div>
                        ))}
                        <button onClick={handleCreate} disabled={saving} className={`w-full py-2 rounded-lg text-[10px] font-bold uppercase ${saving ? 'bg-gray-800 text-gray-600' : 'bg-orange-600 text-white hover:bg-orange-500'}`}>
                            {saving ? 'Guardando...' : 'Guardar Encuesta'}
                        </button>
                    </div>
                )}

                {survey ? (
                    <div className="bg-white/[0.02] border border-white/5 rounded-xl p-4 space-y-3">
                        <p className="text-[9px] text-gray-500">Fecha: {survey.fecha} • Motivo: <span className="text-white font-bold">{survey.motivo_salida}</span></p>
                        {Object.entries(survey.respuestas || {}).map(([key, val]) => {
                            const pregunta = PREGUNTAS.find(p => p.key === key);
                            return (
                                <div key={key}>
                                    <p className="text-[9px] font-bold text-gray-500">{pregunta?.label || key}</p>
                                    <p className="text-xs text-white">{typeof val === 'number' ? `${val}/10` : val}</p>
                                </div>
                            );
                        })}
                    </div>
                ) : !showForm && (
                    <p className="text-gray-600 text-sm text-center py-6">Sin encuesta de salida registrada</p>
                )}
            </div>
        </div>
    );
};
