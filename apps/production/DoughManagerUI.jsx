import React, { useState, useEffect, useRef } from 'react';
import { 
    ArrowLeft, Plus, Search, Filter, Loader2, ChefHat, Info, 
    Save, X, ChevronRight, ChevronLeft, Beaker, Zap, Timer, Mic,
    Scale, Trash2, ListOrdered, Settings2, Package, ArrowRight, Edit2, GripVertical, ClipboardList,
    Eye, EyeOff, Download, Table, Upload
} from 'lucide-react';
import { PedidosPendientesUI } from './PedidosPendientesUI';
import { ProcesoProduccionMasaUI } from './ProcesoProduccionMasaUI';
import GlobalAgentSettingsUI from './GlobalAgentSettingsUI';

/**
 * DOUGH MANAGER UI (INDUSTRIAL EDITION)
 * 
 * Basado en la Matriz de Producción R de Rico.
 * Maneja MEP, Procedimientos y Rendimientos.
 */

export const MASTER_PALETTE = {
    'C01': { name: "Rojo Intenso", bg: "#FEE2E2", input: "#F7A6A6", text: "#3D0A0A", pure: "#EF4444" },
    'C02': { name: "Carmesí", bg: "#FFF1F2", input: "#FEECEF", text: "#3F0716", pure: "#FB7185" },
    'C03': { name: "Ladrillo", bg: "#FEF2F2", input: "#E87373", text: "#320B0B", pure: "#DC2626" },
    'C04': { name: "Coral", bg: "#FFEDD5", input: "#FDCDA6", text: "#3D1407", pure: "#FB923C" },
    'C05': { name: "Naranja Fuego", bg: "#FFF7ED", input: "#FBAA72", text: "#311207", pure: "#F97316" },
    'C06': { name: "Ámbar", bg: "#FEF3C7", input: "#FCDB86", text: "#3A1905", pure: "#FBBF24" },
    'C07': { name: "Ocre", bg: "#FFFBEB", input: "#F8C061", text: "#301506", pure: "#F59E0B" },
    'C08': { name: "Amarillo Sol", bg: "#FEFCE8", input: "#FBE071", text: "#351E05", pure: "#FACC15" },
    'C09': { name: "Lima", bg: "#F7FEE7", input: "#CBF08D", text: "#152108", pure: "#A3E635" },
    'C10': { name: "Chartreuse", bg: "#ECFCCB", input: "#A9EB46", text: "#192707", pure: "#84CC16" },
    'C11': { name: "Verde Bosque", bg: "#DCFCE7", input: "#56E189", text: "#082112", pure: "#22C55E" },
    'C12': { name: "Esmeralda", bg: "#D1FAE5", input: "#23ECA9", text: "#021F17", pure: "#10B981" },
    'C13': { name: "Turquesa", bg: "#CCFBF1", input: "#2BE7D3", text: "#062F2C", pure: "#14B8A6" },
    'C14': { name: "Cian", bg: "#CFFAFE", input: "#2DDBF9", text: "#081F27", pure: "#06B6D4" },
    'C15': { name: "Celeste", bg: "#E0F2FE", input: "#9EDFFB", text: "#022335", pure: "#38BDF8" },
    'C16': { name: "Azul Real", bg: "#DBEAFE", input: "#A1C3FA", text: "#0C1946", pure: "#3B82F6" },
    'C17': { name: "Azul Cobalto", bg: "#E0E7FF", input: "#D0D1FA", text: "#131233", pure: "#6366F1" },
    'C18': { name: "Índigo", bg: "#EEF2FF", input: "#A6A1F1", text: "#161341", pure: "#4F46E5" },
    'C19': { name: "Violeta", bg: "#EDE9FE", input: "#DACCFC", text: "#1E0B3B", pure: "#8B5CF6" },
    'C20': { name: "Púrpura", bg: "#F5F3FF", input: "#E0C3FC", text: "#230B36", pure: "#A855F7" },
    'C21': { name: "Fucsia", bg: "#FAE8FF", input: "#EDA9F7", text: "#2C0A2E", pure: "#D946EF" },
    'C22': { name: "Rosa Neón", bg: "#FDF2F8", input: "#F6A9CF", text: "#34091A", pure: "#EC4899" },
    'C23': { name: "Rosa Pastel", bg: "#FFF1F2", input: "#FEFFFF", text: "#3F0716", pure: "#FDA4AF" },
    'C24': { name: "Vino", bg: "#FFE4E6", input: "#EB6A87", text: "#1E0109", pure: "#E11D48" },
    'C25': { name: "Pizarra", bg: "#F1F5F9", input: "#929EB0", text: "#060910", pure: "#64748B" },
    'C26': { name: "Gris Humo", bg: "#F8FAFC", input: "#D9DFE6", text: "#141A22", pure: "#94A3B8" },
    'C27': { name: "Zinc", bg: "#F4F4F5", input: "#9A9AA2", text: "#09090A", pure: "#71717A" },
    'C28': { name: "Piedra", bg: "#F5F5F4", input: "#9F9994", text: "#100E0E", pure: "#78716C" },
    'C29': { name: "Bronce", bg: "#FFFAF0", input: "#F99D33", text: "#1B0A01", pure: "#D97706" },
    'C30': { name: "Salvia", bg: "#F0FDF4", input: "#A1EDBD", text: "#082814", pure: "#4ADE80" },
    'C31': { name: "Menta", bg: "#F0FDFA", input: "#77E3D5", text: "#062523", pure: "#2DD4BF" },
    'C32': { name: "Cielo Profundo", bg: "#F0F9FF", input: "#58C4F4", text: "#041D2C", pure: "#0EA5E9" },
    'C33': { name: "Lavanda", bg: "#F5F3FF", input: "#DACCFC", text: "#1A1551", pure: "#8B5CF6" },
    'C34': { name: "Amatista", bg: "#FAF5FF", input: "#FFFFFF", text: "#2A0D43", pure: "#C084FC" },
    'C35': { name: "Chocolate", bg: "#FAF7F5", input: "#D98409", text: "#1A0C02", pure: "#A16207" },
    'C36': { name: "Canela", bg: "#FFF7ED", input: "#F68C55", text: "#311207", pure: "#EA580C" },
    'C37': { name: "Oliva", bg: "#F7FEE7", input: "#88DC11", text: "#0A1202", pure: "#65A30D" },
    'C38': { name: "Marino", bg: "#EFF6FF", input: "#7CA1F3", text: "#0C1737", pure: "#2563EB" },
    'C39': { name: "Ciruela", bg: "#FDF4FF", input: "#D76BE4", text: "#1D011F", pure: "#C026D3" },
    'C40': { name: "Carbón", bg: "#E2E8F0", input: "#5F728D", text: "#000209", pure: "#475569" },
};

export const getTheme = (theme_id) => {
    if (theme_id && MASTER_PALETTE[theme_id]) {
        const c = MASTER_PALETTE[theme_id];
        return {
            bg: c.bg,
            input: c.input,
            text: c.text,
            pure: c.pure,
            border: c.input
        };
    }
    // Fallback default
    return {
        bg: '#f8fafc',
        input: '#cbd5e1',
        text: '#0f172a',
        pure: '#94a3b8',
        border: '#94a3b8'
    };
};

// v19 (Fase 19.2): URL del API desde la fuente unica de verdad.
const API_BASE = CONFIG.API_BASE_URL;
// Origen del API (sin /api/v1) para reescribir URLs de imagenes.
const API_ORIGIN = CONFIG.API_BASE_URL.replace(/\/api\/v1\/?$/, '');
console.log("R de Rico API Base detectada:", API_BASE);

// Sistema inteligente de de-hardcoding de imágenes para red local
const resolveImageUrl = (url) => {
    if (!url) return null;
    if (url.startsWith('http')) {
        return url.replace(/localhost:\d+/g, API_ORIGIN.replace(/^https?:\/\//, ''))
                  .replace(/127\.0\.0\.1:\d+/g, API_ORIGIN.replace(/^https?:\/\//, ''))
                  .replace(/192\.168\.\d+\.\d+:\d+/g, API_ORIGIN.replace(/^https?:\/\//, ''));
    }
    return `${API_ORIGIN}${url.startsWith('/') ? '' : '/'}${url}`;
};

export const DoughManagerUI = ({ onBack }) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedDough, setSelectedDough] = useState(null);
    const [doughs, setDoughs] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [draggedIdx, setDraggedIdx] = useState(null);
    const [view, setView] = useState('MAIN'); // 'MAIN' | 'PEDIDOS_PENDIENTES'

    const loadDoughs = async () => {
        try {
            const resp = await fetch(`${API_BASE}/production/doughs`);
            if (resp.ok) setDoughs(await resp.json());
        } catch (e) { console.error(e); }
        finally { setIsLoading(false); }
    };

    useEffect(() => { loadDoughs(); }, []);

    const handleDragStart = (e, index) => {
        setDraggedIdx(index);
        e.dataTransfer.effectAllowed = "move";
        e.target.style.opacity = '0.5';
    };

    const handleDragOver = (e, index) => {
        e.preventDefault();
        if (draggedIdx === index) return;

        const items = [...doughs];
        const draggedItem = items[draggedIdx];
        items.splice(draggedIdx, 1);
        items.splice(index, 0, draggedItem);

        setDraggedIdx(index);
        setDoughs(items);
    };

    const handleDragEnd = (e) => {
        e.target.style.opacity = '1';
        setDraggedIdx(null);
        // Persistir usando el estado más reciente
        setDoughs(current => {
            saveOrder(current.map(d => d.id));
            return current;
        });
    };

    const saveOrder = async (orderIds) => {
        try {
            await fetch(`${API_BASE}/production/doughs/reorder`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ order: orderIds })
            });
        } catch (e) { console.error("Error saving order:", e); }
    };

    const handleGlobalExportCSV = () => {
        const headers = [
            "Masa_ID", "Masa_Nombre", "Masa_Clave",
            "Paso_ID", "Nombre_Paso", "Grupo_Maquinaria",
            "Subpaso_ID", "Nombre_Subpaso", "Instruccion_Voz",
            "T_Humano_min", "T_Autonomo_min", "Recurso", "Nivel_Critico",
            "Operario_Libre", "Confirmacion_Voz", "Trigger_Inicio",
            "Pregunta_QA", "Tip_Coaching", "Grupo_Inseparable",
            "Temperatura_Objetivo", "Senales_Completado", "Errores_Comunes",
            "Ingredientes", "Dependencia"
        ];

        let csvContent = headers.join(",") + "\n";

        doughs.forEach(dough => {
            const mId = `"${dough.id || ''}"`;
            const mName = `"${(dough.name || '').replace(/"/g, '""')}"`;
            const mCode = `"${(dough.code || '').replace(/"/g, '""')}"`;

            const process = dough.production_process || [];
            if (process.length === 0) {
                const row = [mId, mName, mCode, "","","","","","","","","","","","","","","","","","","","",""];
                csvContent += row.join(",") + "\n";
            } else {
                process.forEach(paso => {
                    const pasoId = `"${paso.id || ''}"`;
                    const nombrePaso = `"${(paso.nombre || '').replace(/"/g, '""')}"`;
                    const grupo = `"${(paso.idBloque || '').replace(/"/g, '""')}"`;

                    if (paso.subpasos && paso.subpasos.length > 0) {
                        paso.subpasos.forEach(sp => {
                            const row = [
                                mId, mName, mCode,
                                pasoId, nombrePaso, grupo,
                                `"${sp.id || ''}"`,
                                `"${(sp.nombre || '').replace(/"/g, '""')}"`,
                                `"${(sp.instruccionVoz || '').replace(/"/g, '""')}"`,
                                sp.tHumano || 0,
                                sp.tAutonomo || 0,
                                `"${(sp.recurso || '').replace(/"/g, '""')}"`,
                                `"${(sp.nivelCritico || '').replace(/"/g, '""')}"`,
                                sp.operarioLibre ? "SI" : "NO",
                                sp.confirmacionVoz ? "SI" : "NO",
                                `"${(sp.triggerInicio || '').replace(/"/g, '""')}"`,
                                `"${(sp.preguntaQA || '').replace(/"/g, '""')}"`,
                                `"${(sp.tipCoaching || '').replace(/"/g, '""')}"`,
                                `"${(sp.grupoInseparable || '').replace(/"/g, '""')}"`,
                                `"${(sp.temperaturaObjetivo || '').replace(/"/g, '""')}"`,
                                `"${(sp.senalesCompletado || '').replace(/"/g, '""')}"`,
                                `"${(sp.erroresComunes || '').replace(/"/g, '""')}"`,
                                `"${(sp.ingredientesRequeridos || '').replace(/"/g, '""')}"`,
                                `"${(sp.dependenciaPasoPrevio || '').replace(/"/g, '""')}"`
                            ];
                            csvContent += row.join(",") + "\n";
                        });
                    } else {
                        const row = [mId, mName, mCode, pasoId, nombrePaso, grupo, "","","","","","","","","","","","","","","","","",""];
                        csvContent += row.join(",") + "\n";
                    }
                });
            }
        });

        const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", `Master_Agente_Completo.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleGlobalExportJSON = () => {
        const fullConfig = doughs.map(d => ({
            id: d.id,
            name: d.name,
            code: d.code,
            production_process: d.production_process || []
        }));
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(fullConfig, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", `Master_Agente_Completo.json`);
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    };

    const globalFileInputRef = useRef(null);
    const [isGlobalImporting, setIsGlobalImporting] = useState(false);

    const handleGlobalImportClick = () => {
        if (globalFileInputRef.current) {
            globalFileInputRef.current.click();
        }
    };

    const handleGlobalFileChange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const importedData = JSON.parse(event.target.result);
                if (!Array.isArray(importedData)) {
                    alert("El archivo no tiene el formato correcto (se esperaba un arreglo de masas).");
                    return;
                }

                if (!window.confirm(`Estás a punto de importar la configuración de procesos para ${importedData.length} masas. Esto actualizará directamente la base de datos. ¿Deseas continuar?`)) {
                    e.target.value = null;
                    return;
                }

                setIsGlobalImporting(true);

                let updatedCount = 0;
                for (const imported of importedData) {
                    const targetDough = doughs.find(d => d.id === imported.id || (imported.code && d.code === imported.code));
                    
                    if (targetDough && imported.production_process) {
                        const payload = {
                            ...targetDough,
                            production_process: imported.production_process,
                            batches: targetDough.batches || [],
                            ingredients: targetDough.ingredients || [],
                            dough_relations: targetDough.dough_relations || []
                        };

                        const resp = await fetch(`${API_BASE}/production/doughs/${targetDough.id}`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(payload)
                        });

                        if (resp.ok) {
                            updatedCount++;
                        }
                    }
                }

                alert(`¡Importación Global Exitosa! Se actualizaron los procesos de ${updatedCount} masas.`);
                loadDoughs(); 
                
            } catch (err) {
                alert("Error al procesar el archivo: " + err.message);
            } finally {
                setIsGlobalImporting(false);
                e.target.value = null;
            }
        };
        reader.readAsText(file);
    };

    if (view === 'PEDIDOS_PENDIENTES') {
        return <PedidosPendientesUI onBack={() => setView('MAIN')} />;
    }

    return (
        <div 
            style={{ 
                backgroundColor: '#b2b2b2',
                backgroundImage: 'radial-gradient(circle at center, #d1d1d1 0%, #b2b2b2 100%)'
            }}
            className="flex-1 flex flex-col h-full animate-in fade-in duration-700 overflow-hidden relative"
        >
            <input 
                type="file" 
                ref={globalFileInputRef} 
                style={{ display: 'none' }} 
                accept=".json" 
                onChange={handleGlobalFileChange} 
            />

            {/* Capa de Grano Industrial Sutil (Acabado Metálico/Piedra) */}
            <div className="absolute inset-0 opacity-[0.05] pointer-events-none' bg-[url('https://www.transparenttextures.com/patterns/pinstriped-suit.png')]" />
            
            {/* Header: GESTOR DE MASAS (Cristal Industrial) */}
            <div className="relative z-10 flex items-center justify-between p-8 border-b border-black/10 bg-white/70 backdrop-blur-3xl shadow-md">
                <div className="flex items-center gap-6">
                    {onBack && (
                        <button 
                            onClick={onBack}
                            className="w-10 h-10 rounded-full border border-black/20 flex items-center justify-center text-gray-700 hover:text-black hover:bg-black/5 transition-all"
                        >
                            <ArrowLeft size={20} />
                        </button>
                    )}
                    <div>
                        <h1 className="text-4xl font-black italic uppercase tracking-tighter text-black">
                            GESTOR DE <span className="text-orange-500">MASAS</span>
                        </h1>
                        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.4em] mt-1">
                            Control de Materia Prima • R de Rico
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <div className="flex gap-2 mr-2 border-r border-black/10 pr-6">
                        <button 
                            onClick={handleGlobalImportClick}
                            disabled={isGlobalImporting}
                            className={`${isGlobalImporting ? 'opacity-50 cursor-wait' : 'hover:bg-white'} bg-white/40 text-gray-700 px-4 py-3 rounded-2xl flex items-center gap-2 font-black uppercase text-[10px] tracking-widest transition-all shadow-sm border border-black/5`}
                            title="Importar y actualizar múltiples configuraciones de masas desde JSON"
                        >
                            {isGlobalImporting ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} 
                            Global Import
                        </button>
                        <button 
                            onClick={handleGlobalExportJSON}
                            className="bg-white/40 text-gray-700 px-4 py-3 rounded-2xl hover:bg-white flex items-center gap-2 font-black uppercase text-[10px] tracking-widest transition-all shadow-sm border border-black/5"
                            title="Exportar todas las configuraciones a JSON"
                        >
                            <Download size={14} /> Global JSON
                        </button>
                        <button 
                            onClick={handleGlobalExportCSV}
                            className="bg-[#ecfdf5] text-[#10b981] px-4 py-3 rounded-2xl hover:bg-[#d1fae5] flex items-center gap-2 font-black uppercase text-[10px] tracking-widest transition-all shadow-sm border border-[#a7f3d0]"
                            title="Exportar Reporte Maestro a Excel (CSV)"
                        >
                            <Download size={14} /> Maestro Excel
                        </button>
                    </div>

                    <div className="relative group">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-black/30 group-focus-within:text-black transition-colors" size={16} />
                        <input 
                            type="text" 
                            placeholder="Buscar masa o clave..."
                            className="bg-white/40 border border-black/5 rounded-[20px] py-3 pl-12 pr-6 text-xs font-bold text-black focus:outline-none focus:bg-white/60 w-64 transition-all placeholder-black/20"
                        />
                    </div>
                    <button
                        onClick={() => { setSelectedDough({ name: '', code: '', dough_type: 'MASA SALADA', theoretical_yield: 0, expected_waste: 0, ingredients: [], procedure_steps: [], requires_rest: false, rest_time_mins: 0, rest_container: '', dough_relations: [], product_relations: [], themeIdx: doughs.length }); setIsModalOpen(true); }}
                        className="bg-black text-white px-8 py-4 rounded-[30px] text-xs font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-xl flex items-center gap-3"
                    >
                        <Plus size={20} /> AGREGAR MASA
                    </button>
                </div>
            </div>

            {/* Listado de Masas */}
            <div className="flex-1 overflow-auto p-8 custom-scrollbar">
                {isLoading ? (
                    <div className="flex flex-col items-center justify-center h-64 space-y-4">
                        <Loader2 className="animate-spin text-orange-500" size={48} />
                        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Sincronizando Archivo Maestro...</p>
                    </div>
                ) : (
                    <div className="flex flex-col gap-4 max-w-5xl mx-auto">
                        {doughs.map((dough, idx) => {
                            const theme = getTheme(dough.theme_id);
                            return (
                                <div
                                    key={dough.id}
                                    draggable
                                    onDragStart={(e) => handleDragStart(e, idx)}
                                    onDragOver={(e) => handleDragOver(e, idx)}
                                    onDragEnd={handleDragEnd}
                                    onClick={() => { setSelectedDough({...dough}); setIsModalOpen(true); }}
                                    style={{ 
                                        backgroundColor: theme.bg,
                                        transform: draggedIdx === idx ? 'scale(0.98)' : 'scale(1)',
                                        zIndex: draggedIdx === idx ? 50 : 1
                                    }}
                                    className="group relative border border-black/5 rounded-2xl p-4 hover:shadow-2xl transition-all duration-300 cursor-pointer overflow-hidden flex items-center gap-6 active:cursor-grabbing"
                                >
                                    <div className="flex items-center gap-3">
                                        <div 
                                            className="w-5 h-5 rounded-full border border-black/10 shadow-[0_0_10px_rgba(0,0,0,0.05)] shrink-0"
                                            style={{ backgroundColor: theme.pure }}
                                        />
                                        <div className="opacity-20 group-hover:opacity-60 transition-opacity">
                                            <GripVertical size={20} style={{ color: theme.text }} />
                                        </div>
                                    </div>
                                    {/* Nombre de la Masa (Cromática Total) */}
                                    <div className="relative z-10 flex flex-1 items-center justify-between">
                                        <div className="flex items-center gap-4 min-w-0 pr-12">
                                            <span style={{ backgroundColor: 'rgba(0,0,0,0.1)', color: theme.text }} className="px-3 py-1.5 rounded-xl text-[12px] font-black uppercase tracking-widest opacity-60">
                                                {dough.code || idx + 1}
                                            </span>
                                            <span style={{ color: theme.text }} className="text-lg font-black uppercase tracking-tight truncate leading-none">
                                                {dough.name}
                                            </span>
                                        </div>

                                        <div className="opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-center gap-2">
                                            <span style={{ color: theme.text }} className="text-[9px] font-black uppercase tracking-widest italic opacity-60">Gestionar</span>
                                            <ArrowRight size={16} style={{ color: theme.text }} />
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {isModalOpen && (
                <DoughWizardModal
                    initialData={selectedDough}
                    allDoughs={doughs}
                    onClose={() => { setIsModalOpen(false); setSelectedDough(null); }}
                    onSuccess={() => { setIsModalOpen(false); setSelectedDough(null); loadDoughs(); }}
                />
            )}
        </div>
    );
};

/**
 * WIZARD MODAL: ADN PANADERO
 */
const DoughWizardModal = ({ onClose, onSuccess, initialData, allDoughs = [] }) => {
    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);
    const [editingColumnId, setEditingColumnId] = useState(null);
    const [isConfiguringProduction, setIsConfiguringProduction] = useState(false);
    const [isConfiguringGlobalAgent, setIsConfiguringGlobalAgent] = useState(false);
    const [showColorPicker, setShowColorPicker] = useState(false);
    const [showMepSelector, setShowMepSelector] = useState(false);

    const _baseMatrix = {
        columns: [
            { id: 'mep_polvos', name: 'MEP POLVOS', type: 'POLVOS' },
            { id: 'sub_mep_polvos', name: 'SUB-MEP POLVOS', type: 'SUB-MEP POLVOS' },
            { id: 'mep_polvos_solidos', name: 'MEP POLVOS/SOLIDOS', type: 'MEP POLVOS/SOLIDOS' },
            { id: 'mep_solidos', name: 'MEP SOLIDOS', type: 'SOLIDOS' },
            { id: 'sub_mep_solidos', name: 'SUB-MEP SOLIDOS', type: 'SUB-MEP SOLIDOS' },
            { id: 'mep_granulados', name: 'MEP GRANULADOS', type: 'GRANULADOS' },
            { id: 'sub_mep_granulados', name: 'SUB-MEP GRANULADOS', type: 'SUB-MEP GRANULADOS' },
            { id: 'mep_liquidos', name: 'MEP-LIQUIDOS', type: 'LIQUIDOS' },
            { id: 'mep_liquidos_amarillos', name: 'MEP LIQUIDOS AMARILLOS', type: 'MEP LIQUIDOS AMARILLOS' },
            { id: 'mep_liquidos_cafes', name: 'MEP LIQUIDOS CAFES', type: 'MEP LIQUIDOS CAFES' },
            { id: 'mep_liquidos_claros', name: 'MEP LIQUIDOS CLAROS', type: 'MEP LIQUIDOS CLAROS' },
            { id: 'sub_mep_levadura', name: 'SUB-MEP LEVADURA', type: 'SUB-MEP LEVADURA' },
            { id: 'mep_pan_duro', name: 'MEP PAN DURO', type: 'MEP PAN DURO' },
            { id: 'mep_grasa', name: 'MEP GRASA', type: 'MEP GRASA' }
        ],
        rows: [
            { id: 'row_base_reference', name: 'RECETA BASE', baston_qty: 1, unit: 'BST', values: {} }
        ]
    };
    
    // Legacy Data Reconstruction Logic
    if (!initialData?.recipe_matrix && initialData?.batches?.length) {
        // 1. Identify unique ingredients to create columns
        const legacyIngs = initialData.ingredients || [];
        legacyIngs.forEach(ing => {
            const isStandardMEP = ['POLVOS', 'SUB-MEP POLVOS', 'MEP POLVOS/SOLIDOS', 'SOLIDOS', 'SUB-MEP SOLIDOS', 'GRANULADOS', 'SUB-MEP GRANULADOS', 'LIQUIDOS', 'MEP LIQUIDOS AMARILLOS', 'MEP LIQUIDOS CAFES', 'MEP LIQUIDOS CLAROS', 'SUB-MEP LEVADURA', 'MEP PAN DURO', 'MEP GRASA'].includes(ing.mep_type);
            if (!isStandardMEP) {
                const colId = `c_${ing.name.replace(/\s+/g, '_').toLowerCase()}`;
                if (!_baseMatrix.columns.some(c => c.name === ing.name.toUpperCase())) {
                    _baseMatrix.columns.push({ id: colId, name: ing.name.toUpperCase(), type: ing.mep_type });
                }
            }
        });

        // 2. Create rows for each batch (including Base Reference)
        const batchesToMap = [
            { name: 'RECETA BASE', baston_qty: 1, unit: 'BST', isBase: true },
            ...initialData.batches
        ];

        _baseMatrix.rows = batchesToMap.map((b, bIdx) => {
             const row = { 
                id: b.isBase ? 'row_base_reference' : 'r_'+bIdx+'_'+Date.now(), 
                name: b.name, 
                baston_qty: b.baston_qty, 
                unit: b.unit || 'BST', 
                values: {} 
             };
             
             // Populate columns
             _baseMatrix.columns.forEach(col => {
                 if (col.id === 'mep_polvos') {
                     const sum = legacyIngs.filter(i => i.mep_type === 'POLVOS').reduce((acc, curr) => acc + (curr.qty_per_baston * b.baston_qty), 0);
                     row.values[col.id] = { qty: Math.round(sum * 100) / 100, unit: 'g' };
                 } else if (col.id === 'mep_liquidos') {
                     const sum = legacyIngs.filter(i => i.mep_type === 'LIQUIDOS').reduce((acc, curr) => acc + (curr.qty_per_baston * b.baston_qty), 0);
                     row.values[col.id] = { qty: Math.round(sum * 100) / 100, unit: 'g' };
                 } else {
                     // Find the corresponding custom ingredient
                     const match = legacyIngs.find(i => i.name.toUpperCase() === col.name);
                     row.values[col.id] = { 
                        qty: match ? Math.round(match.qty_per_baston * b.baston_qty * 100) / 100 : 0, 
                        unit: match?.unit || 'g' 
                     };
                 }
             });
             return row;
        });
    }

    // Standard columns for upgrade/sync
    const standardCols = [
        { id: 'mep_polvos', name: 'MEP POLVOS', type: 'POLVOS' },
        { id: 'sub_mep_polvos', name: 'SUB-MEP POLVOS', type: 'SUB-MEP POLVOS' },
        { id: 'mep_polvos_solidos', name: 'MEP POLVOS/SOLIDOS', type: 'MEP POLVOS/SOLIDOS' },
        { id: 'mep_solidos', name: 'MEP SOLIDOS', type: 'SOLIDOS' },
        { id: 'sub_mep_solidos', name: 'SUB-MEP SOLIDOS', type: 'SUB-MEP SOLIDOS' },
        { id: 'mep_granulados', name: 'MEP GRANULADOS', type: 'GRANULADOS' },
        { id: 'sub_mep_granulados', name: 'SUB-MEP GRANULADOS', type: 'SUB-MEP GRANULADOS' },
        { id: 'mep_liquidos', name: 'MEP-LIQUIDOS', type: 'LIQUIDOS' },
        { id: 'mep_liquidos_amarillos', name: 'MEP LIQUIDOS AMARILLOS', type: 'MEP LIQUIDOS AMARILLOS' },
        { id: 'mep_liquidos_cafes', name: 'MEP LIQUIDOS CAFES', type: 'MEP LIQUIDOS CAFES' },
        { id: 'mep_liquidos_claros', name: 'MEP LIQUIDOS CLAROS', type: 'MEP LIQUIDOS CLAROS' },
        { id: 'sub_mep_levadura', name: 'SUB-MEP LEVADURA', type: 'SUB-MEP LEVADURA' },
        { id: 'mep_pan_duro', name: 'MEP PAN DURO', type: 'MEP PAN DURO' },
        { id: 'mep_grasa', name: 'MEP GRASA', type: 'MEP GRASA' }
    ];

    let initialMatrix = (initialData && initialData.recipe_matrix) ? JSON.parse(JSON.stringify(initialData.recipe_matrix)) : JSON.parse(JSON.stringify(_baseMatrix));

    // Migration map: old MEP IDs -> new MEP IDs (for data saved with the previous 5-column schema)
    const legacyIdMap = {
        'mep_levadura': 'sub_mep_levadura',
    };
    // All IDs that are part of the standard system (old and new) to prevent them from appearing as custom columns
    const allKnownSystemIds = new Set([
        ...standardCols.map(sc => sc.id),
        ...Object.keys(legacyIdMap),
        ...Object.values(legacyIdMap),
    ]);

    // Migrate old column IDs in row values
    initialMatrix.rows.forEach(r => {
        if (!r.values) r.values = {};
        Object.keys(legacyIdMap).forEach(oldId => {
            if (r.values[oldId] && !r.values[legacyIdMap[oldId]]) {
                r.values[legacyIdMap[oldId]] = r.values[oldId];
            }
            delete r.values[oldId];
        });
    });

    // Also migrate hidden_system_cols references
    if (initialMatrix.hidden_system_cols) {
        initialMatrix.hidden_system_cols = initialMatrix.hidden_system_cols.map(id => legacyIdMap[id] || id);
    }

    // Ensure all standard columns exist and are in the correct order (Upgrade Path)
    const currentCols = initialMatrix.columns || [];
    const finalCols = [];
    standardCols.forEach(sCol => {
        finalCols.push(sCol);
        initialMatrix.rows.forEach(r => {
            if (!r.values) r.values = {};
            if (!r.values[sCol.id]) r.values[sCol.id] = { qty: 0, unit: 'g' };
        });
    });
    currentCols.forEach(cCol => {
        if (!allKnownSystemIds.has(cCol.id) && cCol.id !== 'row_base_reference') {
            finalCols.push(cCol);
        }
    });
    initialMatrix.columns = finalCols;

    // Sanitize units (Remove BST/TND from ingredients only if they are incorrect)
    initialMatrix.rows.forEach(r => {
        if (r.values) {
            Object.keys(r.values).forEach(colId => {
                const currentUnit = r.values[colId].unit;
                // Si la unidad es de tipo 'Tanda' o está vacía, ponemos 'g' por defecto, 
                // pero si es 'KG', 'L', 'ML', etc, la RESPETAMOS.
                const isBatchUnit = ['BST', 'BASTÓN', 'TANDA', 'TND', '1/2 TANDA', '1/2 TND'].includes(currentUnit?.toUpperCase());
                if (!currentUnit || isBatchUnit) {
                    r.values[colId].unit = 'g';
                }
            });
        }
    });

    const [formData, setFormData] = useState({
        ...initialData,
        code: initialData?.code || '', 
        name: initialData?.name || '', 
        dough_type: initialData?.dough_type || 'MASA SALADA', 
        description: initialData?.description || '',
        theoretical_yield: initialData?.theoretical_yield || 0, 
        expected_waste: initialData?.expected_waste || 0,
        requires_rest: initialData?.requires_rest || false, 
        rest_container: initialData?.rest_container || '', 
        rest_warehouse: initialData?.rest_warehouse || '', 
        rest_time_min: initialData?.rest_time_min || 0,
        ingredients: initialData?.ingredients || [], 
        procedure_steps: initialData?.procedure_steps || [],
        batches: initialData?.batches || [], 
        pasosProduccion: initialData?.production_process || [],
        recipe_matrix: {
            ...initialMatrix,
            hidden_system_cols: initialMatrix.hidden_system_cols || standardCols.map(sc => sc.id)
        },
        product_relations: initialData?.product_relations || [],
        dough_relations: initialData?.dough_relations || [],
        theme_id: initialData?.theme_id || null,
    });

    // Aseguramos consistencia post-merge de initialData
    useEffect(() => {
        if (!formData?.recipe_matrix?.columns) {
            setFormData(prev => ({ ...prev, recipe_matrix: _baseMatrix }));
        }
    }, [formData]);

    // Auto-calcula la RECETA BASE (1 Unidad) basada en el promedio de las tandas activas
    useEffect(() => {
        if (!formData?.recipe_matrix?.rows) return;
        const rows = formData.recipe_matrix.rows;
        const columns = formData.recipe_matrix.columns;
        const productionRows = rows.filter(r => r.id !== 'row_base_reference');
        
        if (productionRows.length === 0) return;

        const baseRow = rows.find(r => r.id === 'row_base_reference');
        if (!baseRow) return;

        let needsUpdate = false;
        const newBaseValues = { ...baseRow.values };

        columns.forEach(col => {
            let totalRatio = 0;
            let validRowsCount = 0;

            productionRows.forEach(row => {
                const qty = row.baston_qty || 0;
                const val = row.values[col.id]?.qty || 0;
                if (qty > 0 && val > 0) {
                    totalRatio += (val / qty);
                    validRowsCount++;
                }
            });

            const avgRatio = validRowsCount > 0 ? Math.round((totalRatio / validRowsCount) * 100) / 100 : 0;
            
            // Sincronizar unidad con la primera tanda disponible
            const firstUnit = productionRows.find(r => r.values[col.id]?.unit)?.values[col.id]?.unit || 'g';
            
            if (newBaseValues[col.id]?.qty !== avgRatio || newBaseValues[col.id]?.unit !== firstUnit) {
                newBaseValues[col.id] = { ...newBaseValues[col.id], qty: avgRatio, unit: firstUnit };
                needsUpdate = true;
            }
        });

        if (needsUpdate) {
            const newRows = rows.map(r => r.id === 'row_base_reference' ? { ...r, values: newBaseValues } : r);
            setFormData(prev => ({ ...prev, recipe_matrix: { ...prev.recipe_matrix, rows: newRows } }));
        }
    }, [formData?.recipe_matrix?.rows]);

    const [catalog, setCatalog] = useState({ products: [], doughs: [] });
    const [searchTerm, setSearchTerm] = useState('');

    const loadCatalog = async () => {
        try {
            const [pResp, dResp] = await Promise.all([
                fetch(`${API_BASE}/catalog/products`),
                fetch(`${API_BASE}/production/doughs`)
            ]);
            if (pResp.ok && dResp.ok) {
                setCatalog({
                    products: await pResp.json(),
                    doughs: await dResp.json()
                });
            }
        } catch (e) { console.error("Error loading catalog:", e); }
    };

    useEffect(() => { loadCatalog(); }, []);

    const addMatrixRow = () => {
        if (!formData?.recipe_matrix?.columns) return;
        const newRowId = 'r_' + Date.now();
        const newRow = { id: newRowId, name: '', baston_qty: 1, unit: 'BST', values: {} };
        formData.recipe_matrix.columns.forEach(col => {
            newRow.values[col.id] = { qty: 0, unit: 'g' };
        });
        setFormData({...formData, recipe_matrix: { ...formData.recipe_matrix, rows: [...(formData.recipe_matrix.rows || []), newRow] } });
    };

    const addMatrixColumn = () => {
        if (!formData?.recipe_matrix?.rows) return;
        const newColId = 'c_' + Date.now();
        const newCol = { id: newColId, name: 'NUEVO INSUMO', type: 'INGREDIENTE DIRECTO' };
        
        const newRows = formData.recipe_matrix.rows.map(r => ({
            ...r,
            values: { ...r.values, [newColId]: { qty: 0, unit: 'g' } }
        }));
        
        setFormData({...formData, recipe_matrix: { ...formData.recipe_matrix, columns: [...(formData.recipe_matrix.columns || []), newCol], rows: newRows } });
        setEditingColumnId(newColId);
    };

    const addStep = () => {
        setFormData({
            ...formData,
            procedure_steps: [...formData.procedure_steps, {
                step_number: formData.procedure_steps.length + 1,
                task: 'REVOLVER', description: '', equipment: '', speed: '1', time_minutes: 0
            }]
        });
    };

    const [notification, setNotification] = useState(null);

    const showNotify = (title, msg, type = 'error') => {
        setNotification({ title, msg, type });
        if (type === 'success') setTimeout(() => setNotification(null), 3000);
    };

    const handleSave = async (overrideData = null, silent = false) => {
        setLoading(true);
        try {
            const dataToSave = overrideData || formData;
            
            // LIMPIEZA QUIRÚRGICA: Purificamos cada campo para cumplir estrictamente con el esquema del servidor
            const cleanPayload = () => {
                const source = dataToSave;
                
                // SEGURO DE INTEGRIDAD: Si los campos críticos están vacíos o corruptos, ABORTAMOS
                if (!source.code || !source.name || source.code === 'undefined' || source.name === 'undefined') {
                    console.error("ERROR DE INTEGRIDAD: Datos críticos corruptos.");
                    return null;
                }

                // 0. SINCRONIZACIÓN DE MATRIZ: Vaciamos la matriz en los campos de persistencia
                const rows = source.recipe_matrix?.rows || [];
                const columns = source.recipe_matrix?.columns || [];
                const baseRow = rows.find(r => r.id === 'row_base_reference');
                
                let ingredients = [];
                if (baseRow) {
                    columns.forEach(col => {
                        const cell = baseRow.values[col.id];
                        if (cell) {
                            // LOGICA DE PROMEDIADO: Si la base está en 0 pero hay tandas, promediamos
                            let finalQty = parseFloat(cell.qty) || 0;
                            if (finalQty === 0) {
                                let totalFromBatches = 0;
                                let totalBatchesQty = 0;
                                rows.filter(r => r.id !== 'row_base_reference').forEach(r => {
                                    const batchCell = r.values[col.id];
                                    if (batchCell && batchCell.qty > 0) {
                                        totalFromBatches += (parseFloat(batchCell.qty) || 0);
                                        totalBatchesQty += (parseFloat(r.baston_qty) || 1);
                                    }
                                });
                                if (totalBatchesQty > 0) finalQty = totalFromBatches / totalBatchesQty;
                            }

                            ingredients.push({
                                name: col.name.trim().toUpperCase(),
                                qty_per_baston: finalQty,
                                unit: cell.unit || 'g',
                                mep_type: col.type || 'INGREDIENTE DIRECTO'
                            });
                        }
                    });
                }

                const batches = rows.filter(r => r.id !== 'row_base_reference').map(r => ({
                    name: r.name,
                    baston_qty: r.baston_qty,
                    unit: r.unit || 'BST'
                }));

                // 1. Purificar Proceso de Producción (JSONB)
                const rawPasos = source.pasosProduccion || source.production_process || [];
                const production_process = rawPasos.map(p => ({
                    id: String(p.id),
                    nombre: String(p.nombre || ''),
                    idBloque: String(p.idBloque || ''),
                    subpasos: (p.subpasos || []).map(sp => {
                        const cleanSp = {};
                        const safeFields = [
                            'id', 'nombre', 'instruccionVoz', 'tHumano', 'tAutonomo', 
                            'recurso', 'recursoConfigs', 'nivelCritico', 'operarioLibre', 
                            'confirmacionVoz', 'triggerInicio', 'preguntaQA', 'tipCoaching', 
                            'grupoInseparable', 'temperaturaObjetivo', 'senalesCompletado', 
                            'erroresComunes', 'ingredientesRequeridos', 'dependenciaPasoPrevio', 
                            'tiempoHorneadoRelativo', 'horaFijaProgramada', 'habilitarComandos', 
                            'palabraInicio', 'palabraPausa'
                        ];
                        safeFields.forEach(f => {
                            if (sp[f] !== undefined) {
                                if (f === 'tHumano' || f === 'tAutonomo') cleanSp[f] = parseFloat(sp[f]) || 0;
                                else cleanSp[f] = sp[f];
                            }
                        });
                        return cleanSp;
                    })
                }));

                if (production_process.length === 0 && rawPasos.length > 0) return null;

                const product_relations = (source.product_relations || []).map(r => ({
                    product_id: parseInt(r.product_id),
                    grams_per_piece: parseFloat(r.grams_per_piece) || 0,
                    pieces_per_baston: r.pieces_per_baston ? parseInt(r.pieces_per_baston) : null
                }));

                return {
                    id: source.id || initialData?.id,
                    code: String(source.code),
                    name: String(source.name),
                    description: source.description || '',
                    dough_type: source.dough_type || 'MASA SALADA',
                    requires_rest: !!source.requires_rest,
                    rest_time_min: parseInt(source.rest_time_min) || 0,
                    theoretical_yield: parseFloat(source.theoretical_yield) || 0,
                    expected_waste: parseFloat(source.expected_waste) || 0,
                    theme_id: source.theme_id || 'C01',
                    production_process,
                    ingredients,
                    batches,
                    product_relations,
                    recipe_matrix: source.recipe_matrix 
                };
            };

            const payload = cleanPayload();
            if (!payload) {
                setLoading(false);
                return;
            }

            console.log(`DEBUG: Enviando ${payload.production_process.length} pasos al servidor.`);

            console.log(`DEBUG: Enviando ${payload.production_process.length} pasos al servidor.`);

            const isUpdate = !!(formData?.id || initialData?.id);
            const targetId = formData?.id || initialData?.id;
            
            if (!targetId && isUpdate) {
                console.error("Falta ID para actualización");
                throw new Error("ID_MISSING");
            }
            const url = isUpdate
                ? `${API_BASE}/production/doughs/${targetId}`
                : `${API_BASE}/production/doughs`;

            console.log(`Intentando guardar en: ${url}`);
            
            const resp = await fetch(url, {
                method: isUpdate ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (resp.ok) {
                const resData = await resp.json();
                
                // SINCRONIZACIÓN CRÍTICA: Actualizar el estado local con la respuesta del servidor
                const syncedData = {
                    ...formData,
                    ...resData,
                    pasosProduccion: resData.production_process || resData.pasosProduccion || formData.pasosProduccion
                };
                setFormData(syncedData);

                if (!silent) {
                    showNotify("ÉXITO", "Masa guardada correctamente", "success");
                    setTimeout(onSuccess, 1500);
                }
                return true;
            } else {
                const err = await resp.json();
                showNotify("ERROR DE MOTOR", err.detail || "No se pudo guardar la masa", "error");
                throw new Error("Save failed");
            }
        } catch (e) {
            console.error("Error en handleSave:", e);
            const urlAttempted = isUpdate ? `${API_BASE}/production/doughs/${targetId}` : `${API_BASE}/production/doughs`;
            
            // FORZAR ALERTA SIEMPRE PARA DIAGNÓSTICO
            alert("❌ ERROR DE CONEXIÓN DETECTADO\n\nDestino: " + urlAttempted + "\n\nSi ves este mensaje, el navegador no pudo llegar al servidor. Verifica que estés en la red correcta.");
            
            if (!silent) {
                showNotify("ERROR DE CONEXIÓN", "Error interno en el guardado.", "error");
            }
            throw e;
        } finally {
            setLoading(false);
        }
    };

    const steps = [
        { id: 1, label: 'GENERAL', icon: Info },
        { id: 2, label: 'RECETA (BOM)', icon: Beaker },
        { id: 3, label: 'PROCESO DE REVOLTURA', icon: ListOrdered },
        { id: 4, label: 'REPOSO', icon: Timer },
        { id: 5, label: 'VÍNCULOS', icon: Zap }
    ];

    // Blindaje de seguridad para el tema visual
    const themeId = formData?.theme_id || initialData?.theme_id || 'C01';
    const theme = getTheme(themeId) || MASTER_PALETTE['C01'];

    return (
        <>
        {isConfiguringProduction && (
            <ProcesoProduccionMasaUI 
                masaId={formData.code || initialData?.id} 
                masaNombre={formData.name} 
                theme={theme}
                initialData={formData.pasosProduccion}
                recipeMatrix={formData.recipe_matrix}
                onSave={(pasos) => setFormData({...formData, pasosProduccion: pasos})}
                onSaveDB={async (pasos) => {
                    const newData = {...formData, pasosProduccion: pasos};
                    setFormData(newData);
                    await handleSave(newData, true);
                }}
                onClose={() => setIsConfiguringProduction(false)} 
                onOpenGlobalAgent={() => setIsConfiguringGlobalAgent(true)}
            />
        )}
        
        {isConfiguringGlobalAgent && (
            <GlobalAgentSettingsUI 
                activeTheme={theme} 
                onClose={() => setIsConfiguringGlobalAgent(false)} 
            />
        )}
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ display: isConfiguringProduction ? 'none' : 'flex' }}>
            <div className="absolute inset-0 bg-black/80 backdrop-blur-xl" onClick={onClose} />

            <div
                style={{ backgroundColor: theme.bg }}
                className="relative w-full max-w-6xl h-[95vh] border border-black/10 rounded-[40px] flex flex-col overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300"
            >
                {/* Modal Header - Theme aware */}
                <div className="px-6 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-6">
                        <div>
                            <h2 style={{ color: theme.text }} className="text-5xl font-black italic uppercase tracking-tighter">
                                {formData.name || 'NUEVA MASA'}
                            </h2>
                        </div>
                    </div>
                    <button onClick={onClose} style={{ backgroundColor: theme.input, color: theme.text }} className="p-3 rounded-full hover:scale-110 transition-all">
                        <X size={24} />
                    </button>
                </div>

                {/* Stepper Progress - Theme aware */}
                <div className="px-5 py-1 flex gap-2">
                    {steps.map(s => (
                        <button
                            key={s.id}
                            onClick={() => setStep(s.id)}
                            style={{
                                backgroundColor: step === s.id ? theme.text : theme.input,
                                color: step === s.id ? theme.bg : theme.text,
                                borderColor: 'rgba(0,0,0,0.1)'
                            }}
                            className={`flex-1 flex items-center justify-center gap-2 px-2 py-1.5 rounded-xl border transition-all`}
                        >
                            <div className={`p-1 rounded-lg ${step === s.id ? 'bg-white/20' : 'bg-black/5'}`}>
                                <s.icon size={18} />
                            </div>
                            <span className="text-[15px] font-black uppercase tracking-tight">{s.label}</span>
                        </button>
                    ))}
                </div>

                {/* Form Content - Truly Centered Distribution */}
                <div className="flex-1 overflow-auto px-5 relative flex flex-col justify-start min-h-0 custom-scrollbar py-3">
                    <div className="max-w-5xl mx-auto w-full">
                        {step === 1 && (
                            <div className="grid grid-cols-2 gap-8 animate-in slide-in-from-bottom-4 duration-500">
                                <div className="space-y-6">
                                    <label className="block">
                                        <span style={{ color: theme.text }} className="text-[16px] font-black uppercase tracking-widest pl-2">Nombre de la Masa</span>
                                        <input
                                            type="text"
                                            value={formData.name}
                                            onChange={e => setFormData({...formData, name: e.target.value})}
                                            placeholder="Ej: MASA DE FUERZA REFINADA"
                                            style={{ backgroundColor: theme.input, color: theme.text }}
                                            className="w-full border border-black/5 rounded-3xl p-5 mt-2 outline-none font-black text-[20px] placeholder-black/30"
                                        />
                                    </label>
                                    <label className="block">
                                        <span style={{ color: theme.text }} className="text-[16px] font-black uppercase tracking-widest pl-2">Clave Maestra</span>
                                        <input
                                            type="text"
                                            value={formData.code}
                                            onChange={e => setFormData({...formData, code: e.target.value})}
                                            placeholder="Ej: MF-01"
                                            style={{ backgroundColor: theme.input, color: theme.text }}
                                            className="w-full border border-black/5 rounded-3xl p-5 mt-2 outline-none font-mono font-black text-[20px] placeholder-black/30"
                                        />
                                    </label>
                                    <label className="block">
                                        <span style={{ color: theme.text }} className="text-[16px] font-black uppercase tracking-widest pl-2">Descripción</span>
                                        <textarea
                                            value={formData.description || ''}
                                            onChange={e => setFormData({...formData, description: e.target.value})}
                                            placeholder="Descripción o notas de la masa..."
                                            style={{ backgroundColor: theme.input, color: theme.text }}
                                            className="w-full border border-black/5 rounded-3xl p-5 mt-2 outline-none font-bold text-[18px] placeholder-black/30 resize-none h-24"
                                        />
                                    </label>
                                </div>
                                <div className="space-y-6">
                                    <label className="block">
                                        <span style={{ color: theme.text }} className="text-[16px] font-black uppercase tracking-widest pl-2">Tipo de Masa</span>
                                        <select
                                            value={formData.dough_type}
                                            onChange={e => setFormData({...formData, dough_type: e.target.value})}
                                            style={{ backgroundColor: theme.input, color: theme.text }}
                                            className="w-full border border-black/5 rounded-3xl p-5 mt-2 focus:ring-1 focus:ring-orange-500/50 outline-none font-black text-[20px] appearance-none uppercase"
                                        >
                                            <option value="PREFERMENTO">PREFERMENTO</option>
                                            <option value="MASA SALADA">MASA SALADA</option>
                                            <option value="MASA DULCE">MASA DULCE</option>
                                        </select>
                                    </label>
                                    <div className="grid grid-cols-2 gap-4">
                                        <label className="block">
                                            <span style={{ color: theme.text }} className="text-[16px] font-black uppercase tracking-widest pl-2">Rend. Teórico (g)</span>
                                            <input
                                                type="number"
                                                value={formData.theoretical_yield}
                                                onChange={e => setFormData({...formData, theoretical_yield: Number(e.target.value)})}
                                                style={{ backgroundColor: theme.input, color: theme.text }}
                                                className="w-full border border-black/5 rounded-3xl p-5 mt-2 outline-none font-mono font-black text-[20px]"
                                            />
                                        </label>
                                        <label className="block">
                                            <span style={{ color: theme.text }} className="text-[16px] font-black uppercase tracking-widest pl-2">% Merma Esperada</span>
                                            <input
                                                type="number"
                                                value={formData.expected_waste}
                                                onChange={e => setFormData({...formData, expected_waste: Number(e.target.value)})}
                                                style={{ backgroundColor: theme.input, color: theme.text }}
                                                className="w-full border border-black/5 rounded-3xl p-5 mt-2 outline-none font-mono font-black text-[20px]"
                                            />
                                        </label>
                                    </div>

                                    {/* Color Picker Popover */}
                                    <div className="mt-6 relative">
                                        <span style={{ color: theme.text }} className="text-[16px] font-black uppercase tracking-widest pl-2 mb-2 block">Identidad Visual (Color)</span>
                                        
                                        {!showColorPicker ? (
                                            <button
                                                onClick={() => setShowColorPicker(true)}
                                                className="w-full flex items-center gap-4 p-4 rounded-3xl border border-black/5 hover:scale-[1.01] transition-all"
                                                style={{ backgroundColor: theme.input }}
                                            >
                                                {formData.theme_id && MASTER_PALETTE[formData.theme_id] ? (
                                                    <>
                                                        <div 
                                                            className="w-10 h-10 rounded-full border-2 flex items-center justify-center"
                                                            style={{ 
                                                                backgroundColor: MASTER_PALETTE[formData.theme_id].bg,
                                                                borderColor: MASTER_PALETTE[formData.theme_id].text
                                                            }}
                                                        >
                                                            <div className="w-4 h-4 rounded-full" style={{ backgroundColor: MASTER_PALETTE[formData.theme_id].text }}></div>
                                                        </div>
                                                        <span style={{ color: theme.text }} className="font-black text-[20px]">
                                                            {MASTER_PALETTE[formData.theme_id].name}
                                                        </span>
                                                        <span className="ml-auto opacity-50" style={{ color: theme.text }}>Cambiar</span>
                                                    </>
                                                ) : (
                                                    <span style={{ color: theme.text }} className="font-bold text-lg opacity-50">Seleccionar Color...</span>
                                                )}
                                            </button>
                                        ) : (
                                            <div className="p-4 rounded-3xl border border-black/5 flex flex-col gap-4 animate-in fade-in" style={{ backgroundColor: theme.input }}>
                                                <div className="flex justify-between items-center px-2">
                                                    <span style={{ color: theme.text }} className="text-sm font-bold opacity-70">Selecciona un color de la matriz (10x4)</span>
                                                    <button onClick={() => setShowColorPicker(false)} className="opacity-50 hover:opacity-100" style={{ color: theme.text }}>
                                                        <X size={20} />
                                                    </button>
                                                </div>
                                                <div className="grid grid-cols-10 gap-2">
                                                    {Object.entries(MASTER_PALETTE).map(([cid, colorData]) => {
                                                        const isUsed = allDoughs.some(d => d.id !== initialData?.id && d.theme_id === cid);
                                                        const isSelected = formData.theme_id === cid;
                                                        
                                                        return (
                                                            <button
                                                                key={cid}
                                                                disabled={isUsed}
                                                                onClick={() => {
                                                                    setFormData({...formData, theme_id: cid});
                                                                    setShowColorPicker(false);
                                                                }}
                                                                className={`w-full aspect-square rounded-full border-2 transition-all flex items-center justify-center relative
                                                                    ${isUsed ? 'cursor-not-allowed grayscale opacity-30' : 'hover:scale-110'}`}
                                                                style={{ 
                                                                    backgroundColor: colorData.bg,
                                                                    borderColor: isSelected ? colorData.text : colorData.input,
                                                                }}
                                                                title={isUsed ? `${colorData.name} (Ocupado)` : colorData.name}
                                                            >
                                                                {isSelected && <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: colorData.text }}></div>}
                                                                {isUsed && (
                                                                    <div className="absolute inset-0 flex items-center justify-center">
                                                                        <X size={14} className="text-black/50" />
                                                                    </div>
                                                                )}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {step === 2 && (
                            <div className="space-y-4 animate-in fade-in duration-500 flex flex-col h-full">
                                <div className="flex justify-between items-center mb-2 shrink-0 gap-4">
                                    <h3 style={{ color: theme.text }} className="text-2xl font-black italic uppercase border-b border-black/10 pb-2 flex-1">Receta por <span className="opacity-40 ml-2">Tandas</span></h3>
                                    
                                    <div className="relative">
                                        <button 
                                            onClick={() => setShowMepSelector(!showMepSelector)} 
                                            style={{ backgroundColor: theme.input, color: theme.text }} 
                                            className="px-4 py-2 rounded-2xl text-[13px] font-black uppercase tracking-widest hover:scale-105 transition-all flex items-center gap-2 border border-black/10"
                                        >
                                            <Eye size={16}/> MEPS DEL SISTEMA
                                        </button>
                                        
                                        {showMepSelector && (
                                            <>
                                            <div className="fixed inset-0 z-[109]" onClick={() => setShowMepSelector(false)} />
                                            <div className="absolute top-full right-0 mt-2 w-64 bg-white rounded-3xl shadow-2xl border border-black/5 p-4 z-[110] animate-in fade-in slide-in-from-top-2 duration-200">
                                                <div className="flex items-center justify-between mb-4 border-b border-black/5 pb-2">
                                                    <span className="text-[10px] font-black uppercase tracking-widest opacity-40">Visibilidad MEPs</span>
                                                    <button onClick={() => setShowMepSelector(false)} className="opacity-40 hover:opacity-100"><X size={14}/></button>
                                                </div>
                                                <div className="space-y-2 max-h-[50vh] overflow-y-auto custom-scrollbar pr-2">
                                                    {standardCols.map(sc => {
                                                        const isHidden = formData.recipe_matrix.hidden_system_cols?.includes(sc.id);
                                                        return (
                                                            <button 
                                                                key={sc.id}
                                                                onClick={() => {
                                                                    const current = formData.recipe_matrix.hidden_system_cols || [];
                                                                    const next = isHidden ? current.filter(id => id !== sc.id) : [...current, sc.id];
                                                                    setFormData({
                                                                        ...formData,
                                                                        recipe_matrix: { ...formData.recipe_matrix, hidden_system_cols: next }
                                                                    });
                                                                }}
                                                                className={`w-full flex items-center justify-between p-3 rounded-xl transition-all ${isHidden ? 'bg-gray-100 text-gray-500' : 'bg-green-500/10 text-green-700'}`}
                                                            >
                                                                <span className="text-[12px] font-black uppercase text-current">{sc.name}</span>
                                                                {isHidden ? <EyeOff size={14}/> : <Eye size={14}/>}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                            </>
                                        )}
                                    </div>

                                    <button onClick={addMatrixColumn} style={{ backgroundColor: theme.text, color: theme.bg }} className="px-4 py-2 rounded-2xl text-[13px] font-black uppercase tracking-widest hover:scale-105 transition-all flex items-center gap-2">
                                        <Plus size={16}/> AGREGAR INSUMO (COLUMNA)
                                    </button>
                                </div>
                                <div className="flex-1 overflow-auto custom-scrollbar bg-black/5 rounded-[20px] border border-black/5 p-2 relative w-full">
                                    <div className="min-w-max">
                                        {/* Table Header */}
                                        <div className="flex gap-1 mb-1">
                                            <div className="w-72 shrink-0 flex items-end pb-1">
                                                <span style={{ color: theme.text }} className="text-[11px] font-black uppercase tracking-tighter opacity-60 leading-none">Matriz de Producción</span>
                                            </div>
                                            {formData.recipe_matrix.columns.filter(col => !standardCols.some(sc => sc.id === col.id) || !formData.recipe_matrix.hidden_system_cols?.includes(col.id)).map((col, cIdx) => (
                                                <div key={col.id} className="w-56 shrink-0 relative group flex items-stretch gap-1">
                                                    <div style={{ backgroundColor: theme.input }} className="flex-1 px-0.5 py-0.5 text-center rounded-xl border-2 border-black/20 flex flex-col justify-center min-h-[3rem] shadow-sm relative overflow-hidden">
                                                        {editingColumnId === col.id ? (
                                                            <input 
                                                                autoFocus
                                                                className="bg-transparent text-[18px] font-black uppercase text-center outline-none w-full border-b-2 border-orange-500"
                                                                style={{ color: theme.text }}
                                                                value={col.name}
                                                                onBlur={() => setEditingColumnId(null)}
                                                                onKeyDown={e => e.key === 'Enter' && setEditingColumnId(null)}
                                                                onChange={e => {
                                                                    const newCols = [...formData.recipe_matrix.columns];
                                                                    const realIdx = newCols.findIndex(c => c.id === col.id);
                                                                    if (realIdx !== -1) {
                                                                        newCols[realIdx].name = e.target.value.toUpperCase();
                                                                        setFormData({...formData, recipe_matrix: {...formData.recipe_matrix, columns: newCols}});
                                                                    }
                                                                }}
                                                            />
                                                        ) : (
                                                            <>
                                                                <span style={{ color: theme.text }} className="text-[18px] leading-[1] font-black uppercase tracking-tighter break-words w-full">{col.name}</span>
                                                                {!standardCols.some(sc => sc.id === col.id) && (
                                                                    <div className="absolute inset-0 bg-white/95 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-2 transition-all">
                                                                        <button 
                                                                            onClick={() => setEditingColumnId(col.id)}
                                                                            className="p-1.5 bg-black text-white rounded-lg hover:scale-110 transition-all"
                                                                        >
                                                                            <Edit2 size={12}/>
                                                                        </button>
                                                                        <button 
                                                                            onClick={() => {
                                                                                const newCols = formData.recipe_matrix.columns.filter(c => c.id !== col.id);
                                                                                setFormData({...formData, recipe_matrix: {...formData.recipe_matrix, columns: newCols}});
                                                                            }}
                                                                            className="p-1.5 bg-red-500 text-white rounded-lg hover:scale-110 transition-all"
                                                                        >
                                                                            <X size={12}/>
                                                                        </button>
                                                                    </div>
                                                                )}
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>

                                        {/* Table Rows */}
                                        <div className="space-y-1">
                                            {formData.recipe_matrix.rows.length === 0 && (
                                                <div className="py-20 text-center opacity-30">
                                                    <p className="font-black uppercase tracking-widest text-xs">Añade tu primera Fila/Tanda</p>
                                                </div>
                                            )}
                                            {formData.recipe_matrix.rows.map((row, rIdx) => (
                                                <div key={row.id} className="flex gap-1 items-center group">
                                                    {/* Batch Config */}
                                                    <div 
                                                        style={{ 
                                                            backgroundColor: row.id === 'row_base_reference' ? theme.text : theme.input,
                                                            borderColor: row.id === 'row_base_reference' ? theme.text : 'rgba(0,0,0,0.2)'
                                                        }} 
                                                        className={`w-72 shrink-0 flex items-center gap-1 p-1 rounded-xl border-2 shadow-sm relative transition-all h-24`}
                                                    >
                                                        {row.id === 'row_base_reference' ? (
                                                            <div className="bg-transparent font-black text-[22px] w-36 shrink-0 text-center text-white flex items-center justify-center">BASE</div>
                                                        ) : (
                                                            <div
                                                                contentEditable
                                                                suppressContentEditableWarning
                                                                onBlur={e => {
                                                                    const newRows = [...formData.recipe_matrix.rows];
                                                                    newRows[rIdx].name = e.target.innerText.toUpperCase();
                                                                    setFormData({...formData, recipe_matrix: {...formData.recipe_matrix, rows: newRows}});
                                                                }}
                                                                style={{ color: '#000' }}
                                                                className="bg-transparent font-black text-[22px] w-36 shrink-0 outline-none text-center leading-tight break-words cursor-text empty:before:content-['Tanda'] empty:before:text-black/30"
                                                            >
                                                                {row.name}
                                                            </div>
                                                        )}
                                                        

                                                        
                                                        {row.id === 'row_base_reference' ? (
                                                            <div style={{ color: theme.bg }} className="bg-transparent font-black text-2xl w-8 shrink-0 text-center leading-none flex items-center justify-center">1</div>
                                                        ) : (
                                                            <input 
                                                                type="number"
                                                                value={row.baston_qty || ''}
                                                                onChange={e => {
                                                                    const val = Number(e.target.value);
                                                                    const newRows = [...formData.recipe_matrix.rows];
                                                                    newRows[rIdx].baston_qty = val;
                                                                    
                                                                    // AUTO-ESCALADO: Al cambiar bastones, escalamos ingredientes basado en la Base
                                                                    const baseRow = newRows.find(r => r.id === 'row_base_reference');
                                                                    if (baseRow) {
                                                                        Object.keys(baseRow.values).forEach(colId => {
                                                                            const baseCell = baseRow.values[colId];
                                                                            if (baseCell) {
                                                                                newRows[rIdx].values[colId] = {
                                                                                    ...newRows[rIdx].values[colId],
                                                                                    qty: Math.round(baseCell.qty * val * 100) / 100
                                                                                };
                                                                            }
                                                                        });
                                                                    }
                                                                    
                                                                    setFormData({...formData, recipe_matrix: {...formData.recipe_matrix, rows: newRows}});
                                                                }}
                                                                style={{ color: '#000' }}
                                                                className="bg-transparent font-black text-2xl w-8 shrink-0 outline-none text-center leading-none"
                                                            />
                                                        )}

                                                        <select
                                                            value={row.unit || 'BST'}
                                                            onChange={e => {
                                                                const newRows = [...formData.recipe_matrix.rows];
                                                                newRows[rIdx].unit = e.target.value;
                                                                setFormData({...formData, recipe_matrix: {...formData.recipe_matrix, rows: newRows}});
                                                            }}
                                                            style={{ color: row.id === 'row_base_reference' ? '#fff' : '#000', backgroundColor: 'transparent' }}
                                                            className="bg-transparent text-[16px] font-black uppercase tracking-tight outline-none appearance-none cursor-pointer text-left pl-1 flex-1"
                                                        >
                                                            <option style={{ color: '#000' }} value="BST">BST</option>
                                                            <option style={{ color: '#000' }} value="TND">TND</option>
                                                            <option style={{ color: '#000' }} value="1/2 TND">1/2 TND</option>
                                                        </select>
                                                        
                                                        {row.id !== 'row_base_reference' && (
                                                            <button 
                                                                onClick={() => {
                                                                    const newRows = formData.recipe_matrix.rows.filter((_, i) => i !== rIdx);
                                                                    setFormData({...formData, recipe_matrix: {...formData.recipe_matrix, rows: newRows}});
                                                                }}
                                                                className="absolute -left-4 p-1 bg-red-500 rounded-lg text-white opacity-0 group-hover:opacity-100 transition-all hover:scale-110"
                                                            >
                                                                <X size={12}/>
                                                            </button>
                                                        )}
                                                    </div>

                                                    {/* Ingredient Cells */}
                                                    {formData.recipe_matrix.columns.filter(col => !standardCols.some(sc => sc.id === col.id) || !formData.recipe_matrix.hidden_system_cols?.includes(col.id)).map(col => {
                                                        const cell = row.values[col.id] || { qty: 0, unit: 'g' };
                                                        const isBase = row.id === 'row_base_reference';
                                                        return (
                                                            <div 
                                                                key={col.id} 
                                                                style={{ 
                                                                    backgroundColor: isBase ? theme.text : 'white',
                                                                    borderColor: isBase ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'
                                                                }}
                                                                className={`w-56 shrink-0 flex items-center border-2 rounded-xl overflow-hidden h-24 ${isBase ? '' : 'focus-within:ring-2 focus-within:ring-orange-500/20 focus-within:border-black'} transition-all shadow-sm`}
                                                            >
                                                                <input 
                                                                    type="number"
                                                                    value={cell.qty === 0 ? '' : cell.qty}
                                                                    placeholder="0"
                                                                    onChange={e => {
                                                                        const val = Number(e.target.value);
                                                                        const newRows = [...formData.recipe_matrix.rows];
                                                                        
                                                                        // Actualizar la celda actual
                                                                        newRows[rIdx].values[col.id] = { ...cell, qty: val };
                                                                        
                                                                        // SINCRONIZACIÓN BIDIRECCIONAL
                                                                        if (isBase) {
                                                                            // Base -> Tanda (Efecto Espejo)
                                                                            newRows.forEach((r, idx) => {
                                                                                if (idx !== rIdx) {
                                                                                    const currentBatchCell = r.values[col.id] || { qty: 0, unit: 'g' };
                                                                                    r.values[col.id] = { 
                                                                                        ...currentBatchCell, 
                                                                                        qty: Math.round(val * (r.baston_qty || 1) * 100) / 100 
                                                                                    };
                                                                                }
                                                                            });
                                                                        } else {
                                                                            // Tanda -> Base (Promediado Inverso)
                                                                            const baseRowIdx = newRows.findIndex(r => r.id === 'row_base_reference');
                                                                            if (baseRowIdx !== -1) {
                                                                                const currentBatchQty = val;
                                                                                const currentBatchBastones = newRows[rIdx].baston_qty || 1;
                                                                                const calculatedBaseQty = Math.round((currentBatchQty / currentBatchBastones) * 100) / 100;
                                                                                
                                                                                newRows[baseRowIdx].values[col.id] = { 
                                                                                    ...newRows[baseRowIdx].values[col.id], 
                                                                                    qty: calculatedBaseQty 
                                                                                };
                                                                            }
                                                                        }
                                                                        
                                                                        setFormData({...formData, recipe_matrix: {...formData.recipe_matrix, rows: newRows}});
                                                                    }}
                                                                    style={{ color: isBase ? theme.bg : '#000' }}
                                                                    className="w-24 shrink-0 bg-transparent px-1 py-1 font-mono font-black text-2xl outline-none text-right leading-none"
                                                                />
                                                                <div className="relative flex-1 h-full flex items-center justify-center border-l border-black/10 bg-black/5 overflow-hidden">
                                                                    <div style={{ color: isBase ? '#fff' : '#000' }} className="font-black uppercase text-center px-1 pointer-events-none break-words w-full leading-[1.1] tracking-tighter text-[15px]">
                                                                        {cell.unit}
                                                                    </div>
                                                                    <select 
                                                                        value={cell.unit}
                                                                        onChange={e => {
                                                                            const newRows = [...formData.recipe_matrix.rows];
                                                                            newRows[rIdx].values[col.id] = { ...cell, unit: e.target.value };
                                                                            setFormData({...formData, recipe_matrix: {...formData.recipe_matrix, rows: newRows}});
                                                                        }}
                                                                        style={{ color: '#000', backgroundColor: '#fff' }}
                                                                        className="absolute inset-0 opacity-0 cursor-pointer w-full h-full appearance-none"
                                                                    >
                                                                        <option style={{ color: '#000', backgroundColor: '#fff' }} value="G">G</option>
                                                                        <option style={{ color: '#000', backgroundColor: '#fff' }} value="KG">KG</option>
                                                                        <option style={{ color: '#000', backgroundColor: '#fff' }} value="ML">ML</option>
                                                                        <option style={{ color: '#000', backgroundColor: '#fff' }} value="L">L</option>
                                                                        <option style={{ color: '#000', backgroundColor: '#fff' }} value="PIEZA">PIEZA</option>
                                                                        <option style={{ color: '#000', backgroundColor: '#fff' }} value="BOTE">BOTE</option>
                                                                        <option style={{ color: '#000', backgroundColor: '#fff' }} value="CUBETA">CUBETA</option>
                                                                        <option style={{ color: '#000', backgroundColor: '#fff' }} value="COSTAL">COSTAL</option>
                                                                        <option style={{ color: '#000', backgroundColor: '#fff' }} value="BLOQUE">BLOQUE</option>
                                                                        <option style={{ color: '#000', backgroundColor: '#fff' }} value="BOLSA DESECHABLE">BOLSA DESECHABLE</option>
                                                                        <option style={{ color: '#000', backgroundColor: '#fff' }} value="BOLSA RECICLABLE LIMPIA">BOLSA RECICLABLE LIMPIA</option>
                                                                        <option style={{ color: '#000', backgroundColor: '#fff' }} value="BOLSA RECICLABLE SEMILIMPIA">BOLSA RECICLABLE SEMILIMPIA</option>
                                                                    </select>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            ))}

                                            <button 
                                                onClick={addMatrixRow}
                                                className="w-56 p-3 rounded-2xl border-2 border-dashed border-black/20 text-black/40 hover:border-black/50 hover:text-black hover:bg-black/5 transition-all text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 mt-2"
                                            >
                                                <Plus size={14}/> Fila (Tanda)
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {step === 3 && (
                            <div className="space-y-4 animate-in fade-in duration-500 flex flex-col h-full">
                                <div className="flex flex-col items-center justify-center mb-2 shrink-0">
                                    <h3 style={{ color: theme.text }} className="text-5xl font-black italic uppercase text-center mb-1">PROCESO DE REVOLTURA</h3>
                                    
                                    <button 
                                        onClick={() => setIsConfiguringProduction(true)} 
                                        style={{ color: theme.text }} 
                                        className="px-3 py-1.5 rounded-lg border border-current opacity-40 hover:opacity-100 hover:bg-black/5 text-[10px] font-bold uppercase tracking-widest transition-all flex items-center gap-2"
                                    >
                                        <Settings2 size={12}/> Establecer Proceso
                                    </button>
                                </div>
                                
                                <div className="space-y-6 max-w-4xl mx-auto pb-10">
                                    {((formData.pasosProduccion || formData.production_process || [])).length === 0 ? (
                                        <div style={{ backgroundColor: theme.input }} className="p-12 rounded-[40px] border border-dashed border-black/20 text-center">
                                            <ClipboardList size={48} className="mx-auto mb-4 opacity-20" style={{ color: theme.text }}/>
                                            <p style={{ color: theme.text }} className="text-xs font-black uppercase tracking-widest opacity-40">No se ha definido el proceso de producción detallado</p>
                                        </div>
                                    ) : (
                                        (formData.pasosProduccion || formData.production_process || []).map((p, pIdx) => (
                                            <div key={p.id} style={{ backgroundColor: theme.input }} className="p-8 rounded-[40px] border border-black/5 shadow-sm">
                                                <div className="flex items-center gap-4 mb-4">
                                                    <div style={{ backgroundColor: theme.text, color: theme.bg }} className="w-10 h-10 rounded-xl flex items-center justify-center text-xl font-black italic shrink-0">
                                                        {pIdx + 1}
                                                    </div>
                                                    <h4 style={{ color: theme.text }} className="text-lg font-black uppercase italic">{String(p.nombre || '').replace(/nan/gi, '')}</h4>
                                                    <div className="ml-auto flex items-center gap-3">
                                                        <div className="px-4 py-1.5 rounded-full bg-black/5 border border-black/5 text-[10px] font-black uppercase tracking-widest opacity-60">
                                                            {(!p.idBloque || String(p.idBloque).toUpperCase() === 'NAN') ? '---' : p.idBloque}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="grid grid-cols-1 gap-3 pl-12">
                                                    {(p.subpasos || []).map((s, sIdx) => (
                                                        <div key={s.id} className="flex items-center justify-between p-4 bg-white/40 rounded-2xl border border-black/5">
                                                            <div className="flex-1 flex flex-col gap-1">
                                                                <div className="flex items-center gap-4">
                                                                    <span style={{ color: theme.text }} className="text-sm font-black opacity-80">{pIdx + 1}.{sIdx + 1}</span>
                                                                    <span style={{ color: theme.text }} className="text-sm font-black uppercase tracking-tight">{String(s.nombre || '').replace(/nan/gi, '')}</span>
                                                                </div>
                                                                {s.instruccionVoz && (
                                                                    <p style={{ color: theme.text }} className="text-[10px] font-bold opacity-50 italic pl-7 leading-tight">{s.instruccionVoz}</p>
                                                                )}
                                                            </div>
                                                            <div className="flex items-center gap-6">
                                                                <div className="flex items-center gap-2">
                                                                    <Timer size={18} style={{ color: theme.text }}/>
                                                                    <span style={{ color: theme.text }} className="text-base font-black tracking-tight">{(parseFloat(s.tHumano) || 0) + (parseFloat(s.tAutonomo) || 0)}m</span>
                                                                </div>
                                                                {s.confirmacionVoz && (
                                                                    <div className="w-5 h-5 rounded-lg bg-green-500/20 flex items-center justify-center text-green-600">
                                                                        <Zap size={10} fill="currentColor"/>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        )}

                        {step === 4 && (
                            <div className="animate-in fade-in duration-500 max-w-2xl mx-auto w-full">
                                <div className="space-y-8">
                                    <div style={{ backgroundColor: 'rgba(255,255,255,0.1)' }} className="p-8 border border-black/5 rounded-[40px] space-y-8">
                                        <div className="flex items-center gap-4 px-2">
                                            <h3 style={{ color: theme.text }} className="text-[20px] font-black uppercase tracking-widest">REQUIERE REPOSO</h3>
                                            <button 
                                                onClick={() => setFormData({...formData, requires_rest: !formData.requires_rest})}
                                                className={`w-16 h-8 rounded-full transition-all relative ${formData.requires_rest ? 'bg-black/80' : 'bg-black/10'}`}
                                            >
                                                <div className={`absolute top-1 w-6 h-6 rounded-full bg-white transition-all ${formData.requires_rest ? 'left-9' : 'left-1'}`} />
                                            </button>
                                        </div>
                                        <hr className="border-black/5" />
                                        <div className="space-y-4">
                                            <label className="block">
                                                <span style={{ color: theme.text }} className="text-[16px] font-black uppercase tracking-widest pl-2">Contenedor de Reposo</span>
                                                <input 
                                                    type="text" 
                                                    value={formData.rest_container}
                                                    onChange={e => setFormData({...formData, rest_container: e.target.value})}
                                                    placeholder="Ej: CUBETA AMARILLA 20L / CHAROLA"
                                                    style={{ backgroundColor: theme.input, color: theme.text }}
                                                    className="w-full border border-black/5 rounded-3xl p-5 mt-2 outline-none font-black text-[20px] placeholder-black/30"
                                                />
                                            </label>
                                            <div className="grid grid-cols-2 gap-4">
                                                <label className="block">
                                                    <span style={{ color: theme.text }} className="text-[16px] font-black uppercase tracking-widest pl-2">Almacén de Destino</span>
                                                    <input 
                                                        type="text" 
                                                        value={formData.rest_warehouse}
                                                        onChange={e => setFormData({...formData, rest_warehouse: e.target.value})}
                                                        placeholder="Ej: CÁMARA 1"
                                                        style={{ backgroundColor: theme.input, color: theme.text }}
                                                        className="w-full border border-black/5 rounded-3xl p-5 mt-2 outline-none font-black text-[20px] placeholder-black/30"
                                                    />
                                                </label>
                                                <label className="block">
                                                    <span style={{ color: theme.text }} className="text-[16px] font-black uppercase tracking-widest pl-2">Tiempo de Reposo</span>
                                                    <div className="grid grid-cols-2 gap-4 mt-2">
                                                        <div className="space-y-1">
                                                            <span style={{ color: theme.text }} className="text-[16px] font-black uppercase tracking-widest pl-2">Horas</span>
                                                            <div style={{ backgroundColor: theme.input }} className="flex items-center gap-2 border border-black/5 rounded-[20px] px-4 py-3">
                                                                <input 
                                                                    type="number" 
                                                                    placeholder="0"
                                                                    value={Math.floor(formData.rest_time_min / 60) || ''}
                                                                    onChange={e => {
                                                                        const hours = Number(e.target.value);
                                                                        const mins = formData.rest_time_min % 60;
                                                                        setFormData({...formData, rest_time_min: (hours * 60) + mins});
                                                                    }}
                                                                    style={{ color: theme.text }}
                                                                    className="bg-transparent font-mono font-black text-[20px] w-full outline-none text-center"
                                                                />
                                                                <span style={{ color: theme.text }} className="text-[9px] font-black opacity-40 uppercase tracking-widest">HRS</span>
                                                            </div>
                                                        </div>
                                                        <div className="space-y-1">
                                                            <span style={{ color: theme.text }} className="text-[16px] font-black uppercase tracking-widest pl-2">Minutos</span>
                                                            <div style={{ backgroundColor: theme.input }} className="flex-1 flex items-center gap-2 border border-black/5 rounded-[20px] px-4 py-3">
                                                                <input 
                                                                    type="number" 
                                                                    placeholder="0"
                                                                    value={formData.rest_time_min % 60 || ''}
                                                                    onChange={e => {
                                                                        const mins = Number(e.target.value);
                                                                        const hours = Math.floor(formData.rest_time_min / 60);
                                                                        setFormData({...formData, rest_time_min: (hours * 60) + mins});
                                                                    }}
                                                                    style={{ color: theme.text }}
                                                                    className="bg-transparent font-mono font-black text-[20px] w-full outline-none text-center"
                                                                />
                                                                <span style={{ color: theme.text }} className="text-[9px] font-black opacity-40 uppercase tracking-widest">MIN</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </label>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {step === 5 && (
                            <div className="animate-in fade-in duration-500 pt-6 max-w-4xl mx-auto w-full">
                                <div className="space-y-8">
                                    <div className="text-center">
                                        <h3 style={{ color: theme.text }} className="text-3xl font-black tracking-tighter uppercase italic">
                                            {formData.dough_type === 'PREFERMENTO' || formData.dough_type === 'PRE-FERMENTO' ? 'Masas que emplean este pre-fermento' : 'Productos que emplean esta masa'}
                                        </h3>
                                    </div>

                                    <div className="bg-white/5 border border-black/5 rounded-[40px] p-8">
                                        {(() => {
                                            const isPreferment = formData.dough_type === 'PREFERMENTO' || formData.dough_type === 'PRE-FERMENTO';
                                            
                                            if (isPreferment) {
                                                const linkedDoughs = (catalog.doughs || []).filter(d => 
                                                    d.ingredients?.some(ing => ing.mep_type === 'PRE-FERMENTO' && ing.related_dough_id === initialData?.id)
                                                );

                                                if (linkedDoughs.length === 0) {
                                                    return (
                                                        <div className="text-center py-20 opacity-30">
                                                            <Zap size={48} className="mx-auto mb-4" />
                                                            <p className="font-bold uppercase tracking-widest text-xs">No hay masas vinculadas a este prefermento</p>
                                                        </div>
                                                    );
                                                }

                                                return (
                                                    <div className="grid grid-cols-1 gap-4">
                                                        {linkedDoughs.map(d => (
                                                            <div key={d.id} className="flex items-center justify-between bg-white rounded-3xl p-6 shadow-sm border border-black/5">
                                                                <div className="flex items-center gap-4">
                                                                    <div className="w-12 h-12 bg-black/5 rounded-2xl flex items-center justify-center font-black text-xs">DOU</div>
                                                                    <div>
                                                                        <div className="font-black uppercase tracking-tighter text-lg">{d.name}</div>
                                                                        <div className="text-[10px] font-bold opacity-40 uppercase tracking-widest">{d.code}</div>
                                                                    </div>
                                                                </div>
                                                                <div className="bg-black/5 px-4 py-2 rounded-xl font-black text-[10px] uppercase opacity-60">USADO EN RECETA</div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                );
                                            } else {
                                                const linkedProducts = (catalog.products || []).filter(p => {
                                                    const ts = p.technical_sheet || p.technical_data;
                                                    if (!ts) return false;
                                                    return (
                                                        ts.primary_mass_id?.toString() === initialData?.id?.toString() ||
                                                        ts.secondary_mass_id?.toString() === initialData?.id?.toString() ||
                                                        ts.tertiary_mass_id?.toString() === initialData?.id?.toString()
                                                    );
                                                });

                                                if (linkedProducts.length === 0) {
                                                    return (
                                                        <div className="text-center py-20 opacity-30">
                                                            <Zap size={48} className="mx-auto mb-4" />
                                                            <p className="font-bold uppercase tracking-widest text-xs">No hay productos vinculados a esta masa</p>
                                                            <p className="text-[10px] mt-2 opacity-60 italic">Vincúlalos desde el Maestro de Productos</p>
                                                        </div>
                                                    );
                                                }

                                                return (
                                                    <div className="grid grid-cols-1 gap-4">
                                                        {linkedProducts.map(p => {
                                                            const ts = p.technical_sheet || p.technical_data || {};
                                                            let grams = 0;
                                                            if (ts.primary_mass_id?.toString() === initialData?.id?.toString()) grams = ts.primary_mass_grams;
                                                            else if (ts.secondary_mass_id?.toString() === initialData?.id?.toString()) grams = ts.secondary_mass_grams;
                                                            else if (ts.tertiary_mass_id?.toString() === initialData?.id?.toString()) grams = ts.tertiary_mass_grams;

                                                            return (
                                                                <div key={p.id} className="flex items-center justify-between bg-white rounded-2xl p-4 shadow-sm border border-black/5 hover:translate-x-1 transition-transform group">
                                                                    <div className="flex items-center gap-4">
                                                                        <div className="w-10 h-10 bg-black/5 rounded-xl flex items-center justify-center overflow-hidden shadow-inner">
                                                                            {p.image_url ? (
                                                                                <img src={resolveImageUrl(p.image_url)} alt="" className="w-full h-full object-cover" />
                                                                            ) : (
                                                                                <div style={{ backgroundColor: theme.input }} className="w-full h-full flex items-center justify-center font-black text-[9px] opacity-30">PRO</div>
                                                                            )}
                                                                        </div>
                                                                        <div>
                                                                            <div style={{ color: theme.text }} className="font-black uppercase tracking-tighter text-base leading-none">{p.name || 'SIN NOMBRE'}</div>
                                                                            <div style={{ color: theme.text }} className="text-[9px] font-bold opacity-30 uppercase tracking-widest">{p.sku || 'SIN SKU'}</div>
                                                                        </div>
                                                                    </div>
                                                                    <div className="flex items-center gap-4">
                                                                        <div className="flex items-baseline gap-2 bg-black/5 px-4 py-2 rounded-xl">
                                                                            <div style={{ color: theme.text }} className="text-xl font-mono font-black">{parseFloat(grams) || 0}<span className="text-[10px] ml-1 opacity-40">g</span></div>
                                                                            <div style={{ color: theme.text }} className="text-[11px] font-black opacity-60 uppercase tracking-wider leading-none">/ UNIDAD</div>
                                                                        </div>
                                                                        <div style={{ backgroundColor: theme.bg, color: theme.text }} className="w-8 h-8 rounded-full flex items-center justify-center shadow-md border border-black/5 group-hover:scale-110 transition-transform">
                                                                            <ChevronRight size={16} />
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                );
                                            }
                                        })()}
                                    </div>
                                    
                                    <div className="flex items-center gap-3 justify-center text-[10px] font-black uppercase tracking-widest opacity-30 italic">
                                        <div className="w-8 h-[1px] bg-black/50" />
                                        La vinculación se gestiona automáticamente desde el Maestro de Productos
                                        <div className="w-8 h-[1px] bg-black/50" />
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer Navigation - Slim */}
                <div style={{ backgroundColor: 'rgba(0,0,0,0.05)' }} className="p-6 border-t border-black/5 flex justify-end items-center">
                    <div className="flex gap-3">
                        {step > 1 && (
                            <button 
                                onClick={() => setStep(step - 1)}
                                style={{ backgroundColor: theme.input, color: theme.text }}
                                className="px-8 py-5 rounded-3xl text-sm font-black uppercase tracking-widest hover:scale-105 transition-all flex items-center gap-2"
                            >
                                <ChevronLeft size={18}/> Anterior
                            </button>
                        )}
 
                        {step < 5 && (
                            <button 
                                onClick={() => setStep(step + 1)}
                                style={{ backgroundColor: theme.text, color: theme.bg }}
                                className="px-8 py-5 rounded-3xl text-sm font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all flex items-center gap-2"
                            >
                                Siguiente <ChevronRight size={18}/>
                            </button>
                        )}
                        
                        <button 
                            onClick={() => handleSave()}
                            disabled={loading || !formData.name}
                            style={{ 
                                backgroundColor: loading || !formData.name ? 'rgba(0,0,0,0.1)' : theme.text,
                                color: loading || !formData.name ? 'rgba(0,0,0,0.3)' : theme.bg
                            }}
                            className="px-10 py-5 rounded-3xl text-sm font-black uppercase tracking-widest transition-all flex items-center gap-2 shadow-xl hover:scale-105 active:scale-95"
                        >
                            {loading ? <Loader2 className="animate-spin" size={18}/> : <Save size={18}/>}
                            GUARDAR MASA
                        </button>
                    </div>
                </div>

                {/* NOTIFICACIÓN "IMPERIAL" */}
                {notification && (
                    <div className="absolute top-10 left-1/2 -translate-x-1/2 z-[110] animate-in fade-in slide-in-from-top-8 duration-500">
                        <div style={{ backgroundColor: theme.bg }} className={`px-10 py-6 rounded-[30px] border border-black/10 backdrop-blur-3xl shadow-2xl flex items-center gap-6 min-w-[400px]`}>
                            <div style={{ backgroundColor: theme.input, color: theme.text }} className={`w-12 h-12 rounded-2xl flex items-center justify-center`}>
                                {notification.type === 'error' ? <X size={24}/> : <Plus size={24}/>}
                            </div>
                            <div>
                                <p style={{ color: theme.text }} className="text-[10px] font-black uppercase tracking-[0.3em] opacity-60 mb-1">{notification.title}</p>
                                <p style={{ color: theme.text }} className="text-sm font-black uppercase italic tracking-tight">{notification.msg}</p>
                            </div>
                            {notification.type === 'error' && (
                                <button onClick={() => setNotification(null)} style={{ color: theme.text }} className="ml-auto p-2 hover:bg-black/5 rounded-full transition-all">
                                    <X size={16}/>
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
        </>
    );
};
