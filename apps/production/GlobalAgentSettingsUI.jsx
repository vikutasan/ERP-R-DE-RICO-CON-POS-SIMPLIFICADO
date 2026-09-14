import React, { useState, useEffect } from 'react';
import { X, Save, Mic, RotateCcw, Clock, Info, CheckSquare, Square } from 'lucide-react';
import { CONFIG } from '../shared/config.js';

const GlobalAgentSettingsUI = ({ onClose, activeTheme }) => {
    const [settings, setSettings] = useState({
        ai_agent_start_word: 'VOY',
        ai_agent_completion_word: 'LISTO',
        ai_agent_pause_word: 'PAUSA',
        ai_agent_start_retry_mins: '1.0',
        ai_agent_completion_retry_mins: '2.0',
        ai_agent_start_moment: 'IMMEDIATE_AFTER_INSTRUCTION',
        ai_agent_completion_moment: 'AFTER_TIME_OR_PROACTIVE',
        ai_agent_start_ack: 'COPIADO',
        ai_agent_completion_ack: 'COPIADO',
        ai_agent_inform_time: 'true'
    });
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [infoTarget, setInfoTarget] = useState(null);

    // v19 (Fase 19.2): URL del API desde la fuente unica de verdad.
    const API_BASE = CONFIG.API_BASE_URL;

    useEffect(() => {
        fetchSettings();
    }, []);

    const fetchSettings = async () => {
        try {
            const resp = await fetch(`${API_BASE}/settings/`);
            const data = await resp.json();
            const aiSettings = {};
            data.forEach(s => {
                if (s.key.startsWith('ai_agent_')) {
                    aiSettings[s.key] = s.value;
                }
            });
            setSettings(prev => ({ ...prev, ...aiSettings }));
        } catch (error) {
            console.error("Error al cargar ajustes:", error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            for (const [key, value] of Object.entries(settings)) {
                await fetch(`${API_BASE}/settings/${key}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ value: String(value) })
                });
            }
            onClose();
        } catch (error) {
            alert("Error al guardar ajustes");
        } finally {
            setIsSaving(false);
        }
    };

    const infoContent = {
        confirmation: {
            title: "Palabra de Confirmación",
            text: "Es la palabra 'llave'. Sirve para que el operario active o termine una tarea. Si se dice antes de que el tiempo termine, se activa el Fast-Track: el Coach interrumpe su espera y lanza la validación final inmediatamente.",
            icon: <Mic size={48} />,
            color: "orange"
        },
        pause: {
            title: "Palabra de Pausa",
            text: "Es el comando de 'freno'. Si el operario no está listo cuando el Coach pregunta, esta palabra detiene al Agente, quien entrará en un estado de espera hasta el próximo ciclo de reintento.",
            icon: <RotateCcw size={48} />,
            color: "gray"
        },
        retry: {
            title: "Repreguntar (Pausa)",
            text: "Define la 'paciencia' del Coach. Es el tiempo exacto que el Agente esperará antes de volver a lanzar la pregunta si el operario usó la palabra de Pausa o no respondió.",
            icon: <Clock size={48} />,
            color: "emerald"
        },
        ack: {
            title: "Palabra de Enterado",
            text: "Es lo que el Agente dirá una vez que haya procesado tu confirmación. Ayuda a cerrar el ciclo de comunicación y asegurar al operario que su comando fue recibido.",
            icon: <Mic size={48} />,
            color: "blue"
        },
        inform_time: {
            title: "Informar Tiempo Disponible",
            text: "Si esta casilla está activa, el Agente de IA le dirá al operario cuánto tiempo tiene para realizar la actividad (ej: 'Tienes 15 minutos'). Esto ayuda a que el operario conozca el ritmo esperado.",
            icon: <Clock size={48} />,
            color: "orange"
        }
    };

    const DualTimeInput = ({ value, onChange, label, onInfo }) => {
        const totalMinutes = parseFloat(value) || 0;
        const mm = Math.floor(totalMinutes);
        const ss = Math.round((totalMinutes - mm) * 60);

        const update = (m, s) => {
            const final = parseFloat(m) + (parseFloat(s) / 60);
            onChange(final.toFixed(4));
        };

        return (
            <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between w-full pr-1">
                    <span style={{ color: activeTheme.text }} className="text-[9px] font-black uppercase tracking-widest opacity-40">{label}</span>
                    <button onClick={onInfo} className="text-blue-500 opacity-60 hover:opacity-100 transition-all p-1">
                        <Info size={14} />
                    </button>
                </div>
                <div className="flex items-center gap-1 bg-black/5 p-1 rounded-xl border border-black/5">
                    <div className="flex flex-col items-center">
                        <input 
                            type="number" min="0" value={mm} 
                            onChange={e => update(e.target.value || 0, ss)}
                            style={{ color: '#1a1a1a' }}
                            className="w-10 bg-transparent text-center font-black text-xs outline-none"
                        />
                        <span style={{ color: activeTheme.text }} className="text-[7px] font-black opacity-60 mt-[-2px]">MIN.</span>
                    </div>
                    <span style={{ color: activeTheme.text }} className="opacity-40 text-xs mb-3">:</span>
                    <div className="flex flex-col items-center">
                        <input 
                            type="number" min="0" max="59" value={ss} 
                            onChange={e => update(mm, e.target.value || 0)}
                            style={{ color: '#1a1a1a' }}
                            className="w-10 bg-transparent text-center font-black text-xs outline-none"
                        />
                        <span style={{ color: activeTheme.text }} className="text-[7px] font-black opacity-60 mt-[-2px]">SEG.</span>
                    </div>
                </div>
            </div>
        );
    };

    if (isLoading) return null;

    return (
        <div style={{ backgroundColor: activeTheme.bg }} className="absolute inset-0 z-[110] overflow-y-auto w-full h-full p-8 transition-all animate-in fade-in duration-300">
            <div className="max-w-6xl mx-auto">
                {/* HEADER */}
                <div className="flex justify-between items-center mb-8 bg-white/50 p-6 rounded-[30px] border border-black/5 shadow-xl backdrop-blur-md">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-black text-white flex items-center justify-center shadow-lg">
                            <Mic size={24} />
                        </div>
                        <div>
                            <h1 style={{ color: activeTheme.text }} className="text-2xl font-black italic uppercase tracking-tight">Parámetros Generales del Agente de IA</h1>
                            <p style={{ color: activeTheme.text }} className="text-[10px] font-bold uppercase tracking-[0.3em] opacity-40">Suite de Configuración Maestra Industrial</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <button onClick={onClose} style={{ color: activeTheme.text }} className="p-4 rounded-2xl bg-black/5 hover:bg-black/10 transition-all">
                            <X size={20} />
                        </button>
                    </div>
                </div>

                <div className="space-y-8">
                    {/* SECCIÓN: INTERACCIONES GENERALES */}
                    <div className="bg-white/80 p-8 rounded-[40px] border border-black/5 shadow-2xl relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-8 opacity-5">
                            <Mic size={120} />
                        </div>
                        
                        <h2 style={{ color: activeTheme.text }} className="text-sm font-black uppercase tracking-[0.4em] mb-12 flex items-center gap-3 opacity-60">
                            <span className="w-8 h-[2px] bg-black"></span> Interacciones Generales con el Operario
                        </h2>

                        <div className="space-y-16">
                            {/* SECCIÓN 1: PARA INICIAR SUBPASO */}
                            <div className="space-y-4">
                                <h3 className="text-xl font-black uppercase tracking-[0.3em] pl-6 text-black flex items-center gap-4">
                                    <span className="w-1.5 h-6 bg-orange-500 rounded-full"></span> PARA INICIAR SUBPASO
                                </h3>
                                <div className="relative group bg-black/5 p-8 rounded-[30px] border border-transparent group-hover:border-black/10 transition-all">
                                    <div className="flex flex-col gap-8">
                                        <div className="flex flex-col md:flex-row items-center gap-10">
                                            {/* SELECCIÓN DE MOMENTO */}
                                            <div className="flex-1 flex flex-col gap-2">
                                                <span className="text-[9px] font-black uppercase tracking-widest opacity-40">Momento de la Pregunta</span>
                                                <select 
                                                    value={settings.ai_agent_start_moment}
                                                    onChange={e => setSettings({...settings, ai_agent_start_moment: e.target.value})}
                                                    className="bg-white border-2 border-black/5 rounded-2xl p-4 text-xs font-black uppercase tracking-tight w-full outline-none text-black shadow-sm"
                                                >
                                                    <option value="IMMEDIATE_AFTER_INSTRUCTION">SE HACE INMEDIATAMENTE DESPUÉS DE QUE SE HA DADO LA INSTRUCCIÓN DE VOZ DEL SUBPASO</option>
                                                </select>
                                            </div>

                                            {/* NOTIFICACIÓN DE TIEMPO */}
                                            <div className="flex flex-col gap-2">
                                                <div className="flex items-center justify-between mb-1 pr-2">
                                                    <span className="text-[9px] font-black uppercase tracking-widest opacity-40">Notificación de Tiempo</span>
                                                    <button onClick={() => setInfoTarget('inform_time')} className="text-blue-500 opacity-60 hover:opacity-100 transition-all">
                                                        <Info size={12} />
                                                    </button>
                                                </div>
                                                <button 
                                                    onClick={() => setSettings({...settings, ai_agent_inform_time: settings.ai_agent_inform_time === 'true' ? 'false' : 'true'})}
                                                    className="flex items-center gap-3 px-6 py-4 rounded-2xl border-2 border-black/5 bg-white transition-all shadow-sm active:scale-95"
                                                >
                                                    <div className={settings.ai_agent_inform_time === 'true' ? 'text-orange-500' : 'text-black/10'}>
                                                        {settings.ai_agent_inform_time === 'true' ? <CheckSquare size={24} fill="currentColor" fillOpacity={0.1} /> : <Square size={24} />}
                                                    </div>
                                                    <span className="text-[10px] font-black uppercase tracking-widest text-black">Informar al Operario el Tiempo Disponible</span>
                                                </button>
                                            </div>
                                        </div>

                                        <div className="flex flex-col md:flex-row items-end gap-6">
                                            <div className="flex-1 flex flex-col gap-3">
                                                <div className="flex items-center justify-between w-full">
                                                    <label style={{ color: activeTheme.text }} className="text-[10px] font-black uppercase tracking-widest opacity-60 flex items-center gap-2">
                                                        <RotateCcw size={14} className="text-orange-500" /> Pregunta de Confirmación de Inicio
                                                    </label>
                                                    <button onClick={() => setInfoTarget('confirmation')} className="text-blue-500 opacity-60 hover:opacity-100 transition-all p-1">
                                                        <Info size={16} />
                                                    </button>
                                                </div>
                                                <div className="p-4 bg-white rounded-2xl border border-black/5 font-black text-xs italic tracking-wide text-orange-900 shadow-inner">
                                                    {`SI ESTÁS LISTO DI "${settings.ai_agent_start_word}", SI NO ESTÁS LISTO DI "${settings.ai_agent_pause_word}".`}
                                                    {settings.ai_agent_inform_time === 'true' && (
                                                        <span className="block mt-2 opacity-60 text-[10px] uppercase font-black tracking-widest">
                                                            + [TIEMPO CALCULADO] MINUTOS
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-4">
                                                <div className="flex flex-col gap-1">
                                                    <span style={{ color: activeTheme.text }} className="text-[9px] font-black uppercase tracking-widest opacity-40">P. Confirmación Inicio</span>
                                                    <input 
                                                        type="text" 
                                                        value={settings.ai_agent_start_word}
                                                        onChange={e => setSettings({...settings, ai_agent_start_word: e.target.value.toUpperCase()})}
                                                        style={{ color: '#1a1a1a' }}
                                                        className="w-32 p-3 bg-white border border-black/10 rounded-xl font-black text-xs uppercase text-center focus:ring-2 ring-orange-500/20 outline-none"
                                                    />
                                                </div>

                                                <div className="flex flex-col gap-1">
                                                    <div className="flex items-center justify-between w-full">
                                                        <span style={{ color: activeTheme.text }} className="text-[9px] font-black uppercase tracking-widest opacity-40">Palabra de Pausa</span>
                                                        <button onClick={() => setInfoTarget('pause')} className="text-blue-500 opacity-60 hover:opacity-100 transition-all">
                                                            <Info size={14} />
                                                        </button>
                                                    </div>
                                                    <input 
                                                        type="text" 
                                                        value={settings.ai_agent_pause_word}
                                                        onChange={e => setSettings({...settings, ai_agent_pause_word: e.target.value.toUpperCase()})}
                                                        style={{ color: '#1a1a1a' }}
                                                        className="w-32 p-3 bg-white border border-black/10 rounded-xl font-black text-xs uppercase text-center focus:ring-2 ring-orange-500/20 outline-none"
                                                    />
                                                </div>

                                                <div className="flex flex-col gap-1">
                                                    <div className="flex items-center justify-between w-full">
                                                        <span style={{ color: activeTheme.text }} className="text-[9px] font-black uppercase tracking-widest opacity-40">Enterado (Agente)</span>
                                                        <button onClick={() => setInfoTarget('ack')} className="text-blue-500 opacity-60 hover:opacity-100 transition-all">
                                                            <Info size={14} />
                                                        </button>
                                                    </div>
                                                    <select 
                                                        value={settings.ai_agent_start_ack}
                                                        onChange={e => setSettings({...settings, ai_agent_start_ack: e.target.value})}
                                                        style={{ color: '#1a1a1a' }}
                                                        className="w-32 p-3 bg-white border border-black/10 rounded-xl font-black text-xs uppercase text-center focus:ring-2 ring-blue-500/20 outline-none"
                                                    >
                                                        <option value="COPIADO">COPIADO</option>
                                                        <option value="OK">OK</option>
                                                        <option value="ENTERADO">ENTERADO</option>
                                                    </select>
                                                </div>

                                                <DualTimeInput 
                                                    label="Repreguntar (Pausa)"
                                                    value={settings.ai_agent_start_retry_mins}
                                                    onChange={val => setSettings({...settings, ai_agent_start_retry_mins: val})}
                                                    onInfo={() => setInfoTarget('retry')}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* SECCIÓN 2: PARA CERRAR SUBPASO */}
                            <div className="space-y-4">
                                <h3 className="text-xl font-black uppercase tracking-[0.3em] pl-6 text-black flex items-center gap-4">
                                    <span className="w-1.5 h-6 bg-emerald-500 rounded-full"></span> PARA CERRAR SUBPASO
                                </h3>
                                <div className="relative group bg-black/5 p-8 rounded-[30px] border border-transparent group-hover:border-black/10 transition-all">
                                    <div className="flex flex-col gap-8">
                                        <div className="flex flex-col gap-2">
                                            <span className="text-[9px] font-black uppercase tracking-widest opacity-40">Momento de la Pregunta</span>
                                            <select 
                                                value={settings.ai_agent_completion_moment}
                                                onChange={e => setSettings({...settings, ai_agent_completion_moment: e.target.value})}
                                                className="bg-white border-2 border-black/5 rounded-2xl p-4 text-xs font-black uppercase tracking-tight w-full max-w-2xl outline-none text-black shadow-sm"
                                            >
                                                <option value="AFTER_TIME_OR_PROACTIVE">SE HACE INMEDIATAMENTE DESPUÉS DE QUE SE HA AGOTADO EL TIEMPO ESTABLECIDO COMO DISPONIBLE O ANTES SI EL OPERARIO DICE LA PALABRA DE CUMPLIMIENTO</option>
                                            </select>
                                        </div>

                                        <div className="flex flex-col md:flex-row items-end gap-6">
                                            <div className="flex-1 flex flex-col gap-3">
                                                <div className="flex items-center justify-between w-full">
                                                    <label style={{ color: activeTheme.text }} className="text-[10px] font-black uppercase tracking-widest opacity-60 flex items-center gap-2">
                                                        <Clock size={14} className="text-emerald-500" /> Pregunta de Confirmación de Cumplimiento
                                                    </label>
                                                    <button onClick={() => setInfoTarget('confirmation')} className="text-blue-500 opacity-60 hover:opacity-100 transition-all p-1">
                                                        <Info size={16} />
                                                    </button>
                                                </div>
                                                <div className="p-4 bg-white rounded-2xl border border-black/5 font-black text-xs italic tracking-wide text-emerald-900 shadow-inner">
                                                    {`SI TERMINASTE DI "${settings.ai_agent_completion_word}", SI NO HAS TERMINADO DI "${settings.ai_agent_pause_word}".`}
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-4">
                                                <div className="flex flex-col gap-1">
                                                    <span style={{ color: activeTheme.text }} className="text-[9px] font-black uppercase tracking-widest opacity-40">P. Cumplimiento</span>
                                                    <input 
                                                        type="text" 
                                                        value={settings.ai_agent_completion_word}
                                                        onChange={e => setSettings({...settings, ai_agent_completion_word: e.target.value.toUpperCase()})}
                                                        style={{ color: '#1a1a1a' }}
                                                        className="w-32 p-3 bg-white border border-black/10 rounded-xl font-black text-xs uppercase text-center focus:ring-2 ring-emerald-500/20 outline-none"
                                                    />
                                                </div>

                                                <div className="flex flex-col gap-1">
                                                    <div className="flex items-center justify-between w-full">
                                                        <span style={{ color: activeTheme.text }} className="text-[9px] font-black uppercase tracking-widest opacity-40">Palabra de Pausa</span>
                                                        <button onClick={() => setInfoTarget('pause')} className="text-blue-500 opacity-60 hover:opacity-100 transition-all">
                                                            <Info size={14} />
                                                        </button>
                                                    </div>
                                                    <input 
                                                        type="text" 
                                                        value={settings.ai_agent_pause_word}
                                                        onChange={e => setSettings({...settings, ai_agent_pause_word: e.target.value.toUpperCase()})}
                                                        style={{ color: '#1a1a1a' }}
                                                        className="w-32 p-3 bg-white border border-black/10 rounded-xl font-black text-xs uppercase text-center focus:ring-2 ring-orange-500/20 outline-none"
                                                    />
                                                </div>

                                                <div className="flex flex-col gap-1">
                                                    <div className="flex items-center justify-between w-full">
                                                        <span style={{ color: activeTheme.text }} className="text-[9px] font-black uppercase tracking-widest opacity-40">Enterado (Agente)</span>
                                                        <button onClick={() => setInfoTarget('ack')} className="text-blue-500 opacity-60 hover:opacity-100 transition-all">
                                                            <Info size={14} />
                                                        </button>
                                                    </div>
                                                    <select 
                                                        value={settings.ai_agent_completion_ack}
                                                        onChange={e => setSettings({...settings, ai_agent_completion_ack: e.target.value})}
                                                        style={{ color: '#1a1a1a' }}
                                                        className="w-32 p-3 bg-white border border-black/10 rounded-xl font-black text-xs uppercase text-center focus:ring-2 ring-blue-500/20 outline-none"
                                                    >
                                                        <option value="COPIADO">COPIADO</option>
                                                        <option value="OK">OK</option>
                                                        <option value="ENTERADO">ENTERADO</option>
                                                    </select>
                                                </div>

                                                <DualTimeInput 
                                                    label="Repreguntar (Pausa)"
                                                    value={settings.ai_agent_completion_retry_mins}
                                                    onChange={val => setSettings({...settings, ai_agent_completion_retry_mins: val})}
                                                    onInfo={() => setInfoTarget('retry')}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="mt-12 flex justify-end">
                            <button 
                                onClick={handleSave}
                                disabled={isSaving}
                                className="bg-black text-white px-10 py-5 rounded-[25px] font-black uppercase text-xs tracking-[0.2em] hover:scale-105 active:scale-95 transition-all shadow-2xl flex items-center gap-3 disabled:opacity-50"
                            >
                                {isSaving ? <RotateCcw size={18} className="animate-spin" /> : <Save size={18} />}
                                Guardar Parámetros Maestros
                            </button>
                        </div>
                    </div>

                    <div className="bg-emerald-50 border border-emerald-200 p-6 rounded-[30px] flex gap-4 items-start">
                        <div className="p-3 bg-emerald-500 text-white rounded-2xl shadow-lg shrink-0">
                            <Info size={20} />
                        </div>
                        <div>
                            <h4 className="font-black text-emerald-900 uppercase text-xs tracking-wider mb-1">Impacto Global Detectado</h4>
                            <p className="text-[10px] font-bold text-emerald-700/80 leading-relaxed uppercase tracking-widest">
                                Los cambios realizados en esta suite afectarán a todos los procesos de producción y masas activas de la planta. 
                                La IA del Coach actualizará sus árboles de decisión de voz automáticamente.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
            
            {/* MODAL CONTEXTUAL DE INFORMACIÓN */}
            {infoTarget && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center p-8 backdrop-blur-sm">
                    <div className="absolute inset-0 bg-black/70" onClick={() => setInfoTarget(null)} />
                    <div className="relative bg-white rounded-[50px] shadow-2xl max-w-2xl w-full p-12 overflow-hidden border-4 border-black/5 animate-in zoom-in-95 duration-300">
                        <div className="absolute -top-10 -right-10 opacity-5 text-black scale-150">
                            {infoContent[infoTarget].icon}
                        </div>
                        
                        <div className="flex items-center gap-6 mb-10">
                            <div className="w-20 h-20 rounded-[30px] bg-black text-white flex items-center justify-center shadow-2xl">
                                {infoContent[infoTarget].icon}
                            </div>
                            <div>
                                <h3 className="text-4xl font-black italic uppercase tracking-tight leading-none mb-2">{infoContent[infoTarget].title}</h3>
                                <p className="text-xs font-black uppercase tracking-[0.3em] opacity-40">Ayuda Contextual del Agente</p>
                            </div>
                        </div>

                        <div className="space-y-6 relative z-10">
                            <div className={`bg-${infoContent[infoTarget].color === 'gray' ? 'gray' : infoContent[infoTarget].color}-50 p-10 rounded-[40px] border-2 border-${infoContent[infoTarget].color === 'gray' ? 'gray' : infoContent[infoTarget].color}-100 shadow-inner`}>
                                <p className="text-2xl font-bold leading-snug italic text-gray-900">
                                    {infoContent[infoTarget].text}
                                </p>
                            </div>
                        </div>

                        <div className="mt-10 flex justify-end">
                            <button 
                                onClick={() => setInfoTarget(null)}
                                className="bg-black text-white px-12 py-6 rounded-[30px] font-black uppercase text-sm tracking-[0.3em] hover:scale-105 active:scale-95 transition-all shadow-xl"
                            >
                                Entendido
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default GlobalAgentSettingsUI;
