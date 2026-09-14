import React, { useState, useEffect } from 'react';
import { CONFIG } from '../shared/config.js';

// v19 (Fase 19.2): URL del API desde la fuente unica de verdad.
const API_BASE = CONFIG.API_BASE_URL;

export const SystemSettingsUI = () => {
    const [settings, setSettings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedSetting, setSelectedSetting] = useState(null);
    const [newValue, setNewValue] = useState("");
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        fetchSettings();
    }, []);

    const fetchSettings = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API_BASE}/settings/`);
            const data = await res.json();
            setSettings(data);
        } catch (e) {
            console.error("Error fetching settings", e);
        } finally {
            setLoading(false);
        }
    };

    const handleUpdate = async () => {
        if (!selectedSetting) return;
        setIsSaving(true);
        try {
            const res = await fetch(`${API_BASE}/settings/${selectedSetting.key}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ value: newValue })
            });
            if (res.ok) {
                await fetchSettings();
                setSelectedSetting(null);
            }
        } catch (e) {
            console.error("Error updating setting", e);
        } finally {
            setIsSaving(false);
        }
    };

    const getImpactExplanation = (setting, value) => {
        const val = parseInt(value);
        if (setting.key.includes('polling_ms')) {
            if (val < 1000) return "⚠️ ADVERTENCIA: Polling muy agresivo. Aumentará significativamente la carga del servidor y el tráfico de red.";
            if (val > 10000) return "ℹ️ NOTA: Polling lento. El sistema tardará más en reflejar cambios de estado (terminales ocupadas/libres).";
            return "✅ Balance óptimo entre tiempo real y carga de servidor.";
        }
        if (setting.key.includes('ttl_m')) {
            if (val < 5) return "⚠️ CUIDADO: TTL muy corto. Los usuarios podrían ser expulsados ante el más mínimo retraso de red.";
            if (val > 60) return "ℹ️ NOTA: TTL largo. Si un usuario cierra mal su sesión, la terminal quedará bloqueada por mucho tiempo.";
            return "✅ Margen de seguridad estándar para sesiones activas.";
        }
        if (setting.key.includes('heartbeat_interval_ms')) {
            if (val < 10000) return "⚠️ ADVERTENCIA: Corazón muy rápido. Generará muchas peticiones POST innecesarias.";
            return "✅ Asegura que el servidor sepa que el usuario sigue activo.";
        }
        return "Cambio de parámetro del sistema.";
    };

    if (loading) return <div className="p-20 text-center animate-pulse text-orange-500 font-black">CARGANDO AJUSTES...</div>;

    const categories = [...new Set(settings.map(s => s.category))].filter(cat => cat !== 'ai_agent');

    return (
        <div className="p-10 max-w-6xl mx-auto space-y-10 animate-in fade-in duration-700">
            <header className="flex justify-between items-end">
                <div>
                    <h1 className="text-6xl font-black uppercase tracking-tighter">Ajustes del <span className="text-orange-500">Sistema</span></h1>
                    <p className="text-gray-400 mt-2 font-medium italic">Control maestro de parámetros críticos de operación.</p>
                </div>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {categories.map(cat => (
                    <div key={cat} className="bg-gray-900/40 p-8 rounded-[40px] border border-gray-800 backdrop-blur-xl">
                        <h2 className="text-2xl font-black uppercase text-orange-400 mb-6 flex items-center gap-3">
                            {cat === 'polling' ? '🕒' : '🛡️'} {cat.toUpperCase()}
                        </h2>
                        <div className="space-y-4">
                            {settings.filter(s => s.category === cat).map(s => (
                                <div key={s.key} className="p-6 bg-black/40 rounded-3xl border border-white/5 hover:border-orange-500/30 transition-all group">
                                    <div className="flex justify-between items-start mb-2">
                                        <h3 className="font-bold text-gray-200 uppercase text-xs tracking-widest">{s.key.replace(/_/g, ' ')}</h3>
                                        <span className="bg-orange-600/20 text-orange-500 px-3 py-1 rounded-full text-[10px] font-black">{s.value}</span>
                                    </div>
                                    <p className="text-[10px] text-gray-500 mb-4">{s.description}</p>
                                    <button 
                                        onClick={() => {
                                            setSelectedSetting(s);
                                            setNewValue(s.value);
                                        }}
                                        className="text-[9px] font-black uppercase tracking-widest text-orange-500 hover:text-white transition-colors"
                                    >
                                        [ AJUSTAR ]
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            {/* Modal de Ajuste */}
            {selectedSetting && (
                <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[100] flex items-center justify-center p-6 animate-in fade-in duration-300">
                    <div className="bg-[#0f0f10] border border-orange-500/30 p-12 rounded-[50px] max-w-lg w-full shadow-2xl shadow-orange-500/10">
                        <h2 className="text-3xl font-black uppercase mb-2 tracking-tighter text-white">AJUSTAR {selectedSetting.key.replace(/_/g, ' ')}</h2>
                        <p className="text-gray-500 text-sm mb-8">{selectedSetting.description}</p>
                        
                        <div className="space-y-6">
                            <div>
                                <label className="text-[10px] font-black uppercase text-gray-400 mb-2 block tracking-widest">Nuevo Valor</label>
                                <input 
                                    type={selectedSetting.input_type || "text"}
                                    value={newValue}
                                    onChange={(e) => setNewValue(e.target.value)}
                                    className="w-full bg-black border border-gray-800 rounded-2xl p-4 text-xl font-black text-orange-500 focus:outline-none focus:border-orange-500 transition-all shadow-inner"
                                />
                            </div>

                            <div className="p-6 bg-orange-600/5 border border-orange-500/20 rounded-3xl">
                                <p className="text-[10px] font-black uppercase text-orange-500 mb-2 tracking-widest italic">💡 EXPLICATIVO DEL CAMBIO:</p>
                                <p className="text-xs text-gray-300 leading-relaxed font-medium">
                                    {getImpactExplanation(selectedSetting, newValue)}
                                </p>
                            </div>

                            <div className="flex gap-4">
                                <button 
                                    onClick={() => setSelectedSetting(null)}
                                    className="flex-1 p-4 rounded-2xl border border-gray-800 text-[10px] font-black uppercase tracking-widest hover:bg-gray-900 transition-all"
                                >
                                    Cancelar
                                </button>
                                <button 
                                    onClick={handleUpdate}
                                    disabled={isSaving}
                                    className="flex-1 p-4 rounded-2xl bg-orange-600 text-black text-[10px] font-black uppercase tracking-widest hover:bg-white transition-all shadow-xl shadow-orange-600/20"
                                >
                                    {isSaving ? "Guardando..." : "Guardar Cambios"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
