import React, { useState, useEffect, useRef } from 'react';
import {
    ArrowLeft, Plus, Search, Loader2, Settings2, Trash2, Save, X, Image as ImageIcon,
    Settings, Box, Key, Hash, FileText, Info, MapPin, Wrench, Sparkles, GripVertical, Activity
} from 'lucide-react';
import { CONFIG } from '../shared/config.js';

// v19 (Fase 19.2): URL del API desde la fuente unica de verdad.
const API_BASE = CONFIG.API_BASE_URL;
// Origen del API (sin /api/v1) para reescribir URLs de imagenes.
const API_ORIGIN = CONFIG.API_BASE_URL.replace(/\/api\/v1\/?$/, '');

const compressImage = (base64Str, maxWidth = 800, maxHeight = 800) => {
    return new Promise((resolve) => {
        const img = new Image();
        img.src = base64Str;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;

            if (width > height) {
                if (width > maxWidth) {
                    height *= maxWidth / width;
                    width = maxWidth;
                }
            } else {
                if (height > maxHeight) {
                    width *= maxHeight / height;
                    height = maxHeight;
                }
            }
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', 0.7)); // 70% calidad
        };
        img.onerror = () => resolve(base64Str);
    });
};

const THEMES = {
    'MAQUINARIA': { bg: '#DBEAFE', text: '#1E3A8A', input: 'rgba(255,255,255,0.4)', border: '#BFDBFE', pure: '#3B82F6' },
    'MOBILIARIO': { bg: '#FEF3C7', text: '#92400E', input: 'rgba(255,255,255,0.4)', border: '#FDE68A', pure: '#F59E0B' },
    'RECIPIENTE': { bg: '#DCFCE7', text: '#166534', input: 'rgba(255,255,255,0.4)', border: '#BBF7D0', pure: '#22C55E' },
    'UTENSILIO':  { bg: '#F3E8FF', text: '#6B21A8', input: 'rgba(255,255,255,0.4)', border: '#E9D5FF', pure: '#A855F7' },
};

export const ProductionEquipmentUI = ({ onBack }) => {
    const [equipments, setEquipments] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedEquip, setSelectedEquip] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [draggedItemIndex, setDraggedItemIndex] = useState(null);

    const loadEquipments = async () => {
        try {
            const resp = await fetch(`${API_BASE}/production/equipment`);
            if (resp.ok) {
                const data = await resp.json();
                const sorted = data.sort((a, b) => {
                    const idxA = a.dynamic_specs?.order_index || 0;
                    const idxB = b.dynamic_specs?.order_index || 0;
                    return idxA - idxB;
                });
                setEquipments(sorted);
            }
        } catch (e) { console.error(e); }
        finally { setIsLoading(false); }
    };

    useEffect(() => { loadEquipments(); }, []);

    const handleDragStart = (e, index) => {
        setDraggedItemIndex(index);
        e.dataTransfer.effectAllowed = 'move';
        // Required for Firefox:
        e.dataTransfer.setData('text/plain', index.toString());
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };

    const handleDragEnd = () => {
        setDraggedItemIndex(null);
    };

    const handleDrop = async (e, dropIndex) => {
        e.preventDefault();
        if (draggedItemIndex === null || draggedItemIndex === dropIndex) return;

        const newEquipments = [...equipments];
        const draggedItem = newEquipments[draggedItemIndex];
        
        newEquipments.splice(draggedItemIndex, 1);
        newEquipments.splice(dropIndex, 0, draggedItem);
        
        setEquipments(newEquipments);
        setDraggedItemIndex(null);

        // Guardado silencioso en background
        try {
            await Promise.all(newEquipments.map((eq, idx) => {
                const updatedSpecs = { ...eq.dynamic_specs, order_index: idx };
                const payload = { ...eq, dynamic_specs: updatedSpecs };
                return fetch(`${API_BASE}/production/equipment/${eq.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
            }));
        } catch (error) {
            console.error("Error guardando orden:", error);
        }
    };

    const filtered = equipments.filter(e => 
        e.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        (e.model_ref && e.model_ref.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (e.serial_number && e.serial_number.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    return (
        <div 
            style={{ 
                backgroundColor: '#b2b2b2',
                backgroundImage: 'radial-gradient(circle at center, #d1d1d1 0%, #b2b2b2 100%)'
            }}
            className="flex-1 flex flex-col h-full animate-in fade-in duration-700 overflow-hidden relative"
        >
            <div className="absolute inset-0 opacity-[0.05] pointer-events-none bg-[url('https://www.transparenttextures.com/patterns/pinstriped-suit.png')]" />
            
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
                            EQUIPAMIENTO DE <span className="text-cyan-500">PRODUCCIÓN</span>
                        </h1>
                        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.4em] mt-1">
                            Catálogo de Activos Físicos • R de Rico
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <div className="relative group">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-black/30 group-focus-within:text-black transition-colors" size={16} />
                        <input 
                            type="text" 
                            placeholder="Buscar nombre, modelo o S/N..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="bg-white/40 border border-black/5 rounded-[20px] py-3 pl-12 pr-6 text-xs font-bold text-black focus:outline-none focus:bg-white/60 w-64 transition-all placeholder-black/20"
                        />
                    </div>
                    <button
                        onClick={() => { 
                            setSelectedEquip({ 
                                name: '', model_ref: '', serial_number: '', 
                                description: '', nature: 'MAQUINARIA', 
                                image_url: '', dynamic_specs: {} 
                            }); 
                            setIsModalOpen(true); 
                        }}
                        className="bg-black text-white px-8 py-4 rounded-[30px] text-xs font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-xl flex items-center gap-3 hover:bg-black/80"
                    >
                        <Plus size={20} /> AGREGAR EQUIPO
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-auto p-8 custom-scrollbar">
                {isLoading ? (
                    <div className="flex flex-col items-center justify-center h-64 space-y-4">
                        <Loader2 className="animate-spin text-cyan-500" size={48} />
                    </div>
                ) : (
                    <div className="flex flex-col gap-4 max-w-5xl mx-auto">
                        {filtered.map((equip, index) => {
                            const theme = THEMES[equip.nature] || THEMES['MAQUINARIA'];
                            return (
                                <div 
                                    key={equip.id}
                                    draggable={!searchTerm}
                                    onDragStart={(e) => !searchTerm && handleDragStart(e, index)}
                                    onDragOver={!searchTerm ? handleDragOver : undefined}
                                    onDragEnter={(e) => e.preventDefault()}
                                    onDragEnd={handleDragEnd}
                                    onDrop={(e) => !searchTerm && handleDrop(e, index)}
                                    onClick={() => { setSelectedEquip({...equip}); setIsModalOpen(true); }}
                                    style={{ backgroundColor: theme.bg }}
                                    className={`group relative border border-black/5 rounded-2xl p-4 hover:shadow-2xl transition-all duration-300 cursor-pointer overflow-hidden flex items-center gap-6 ${draggedItemIndex === index ? 'opacity-30 border-dashed border-2 border-cyan-500 scale-[0.98]' : ''}`}
                                >
                                    {/* Handle Drag */}
                                    {!searchTerm && (
                                        <div className="opacity-20 group-hover:opacity-60 cursor-grab active:cursor-grabbing hover:scale-125 transition-all text-black shrink-0 -ml-2" onClick={e => e.stopPropagation()}>
                                            <GripVertical size={20} />
                                        </div>
                                    )}

                                    {/* Icon / Image */}
                                    <div className="w-12 h-12 rounded-xl bg-white/40 border border-black/5 flex items-center justify-center overflow-hidden shrink-0 shadow-sm">
                                        {equip.image_url ? (
                                            <img src={equip.image_url.startsWith('http') || equip.image_url.startsWith('data:') ? equip.image_url : `${API_ORIGIN}${equip.image_url}`} alt={equip.name} className="w-full h-full object-cover" />
                                        ) : (
                                            <ImageIcon size={20} style={{ color: theme.text }} className="opacity-50" />
                                        )}
                                    </div>

                                    {/* Main Info */}
                                    <div className="relative z-10 flex flex-1 items-center justify-between">
                                        <div className="flex items-center gap-4 min-w-0 pr-12">
                                            <span style={{ backgroundColor: 'rgba(0,0,0,0.1)', color: theme.text }} className="px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest opacity-60 shrink-0">
                                                {equip.nature}
                                            </span>
                                            <span style={{ color: theme.text }} className="text-lg font-black uppercase tracking-tight truncate leading-none">
                                                {equip.name}
                                            </span>
                                            {equip.model_ref && (
                                                <span style={{ color: theme.text }} className="text-xs font-bold opacity-60 truncate shrink-0">
                                                    MOD: {equip.model_ref}
                                                </span>
                                            )}
                                            {equip.dynamic_specs?.estado_actual && (
                                                <span className={`px-2 py-1 rounded-md text-[9px] font-black uppercase tracking-widest text-white shrink-0 shadow-sm ${
                                                    equip.dynamic_specs.estado_actual === 'LISTO' ? 'bg-green-500' :
                                                    equip.dynamic_specs.estado_actual === 'OCUPADO' ? 'bg-red-500' :
                                                    equip.dynamic_specs.estado_actual === 'EN LIMPIEZA' ? 'bg-yellow-500' :
                                                    equip.dynamic_specs.estado_actual === 'EN MANTENIMIENTO' ? 'bg-orange-500' :
                                                    'bg-gray-500'
                                                }`}>
                                                    {equip.dynamic_specs.estado_actual === 'LISTO' ? 'LISTO' : equip.dynamic_specs.estado_actual}
                                                </span>
                                            )}
                                        </div>

                                        <div className="opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-center gap-4">
                                            {equip.serial_number && (
                                                <div className="bg-white/40 px-3 py-1.5 rounded-xl border border-black/5 flex items-center shrink-0">
                                                    <span style={{ color: theme.text }} className="text-[10px] font-bold uppercase tracking-widest opacity-60">S/N:</span>
                                                    <span style={{ color: theme.text }} className="text-[10px] font-mono font-black truncate ml-2">{equip.serial_number}</span>
                                                </div>
                                            )}
                                            <div className="flex items-center gap-2 shrink-0">
                                                <span style={{ color: theme.text }} className="text-[9px] font-black uppercase tracking-widest italic opacity-60">Gestionar</span>
                                                <Settings2 size={16} style={{ color: theme.text }} />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {isModalOpen && selectedEquip && (
                <EquipmentWizardModal 
                    initialData={selectedEquip}
                    onClose={() => { setIsModalOpen(false); setSelectedEquip(null); }}
                    onSuccess={() => { setIsModalOpen(false); setSelectedEquip(null); loadEquipments(); }}
                />
            )}
        </div>
    );
};

const EquipmentWizardModal = ({ initialData, onClose, onSuccess }) => {
    const [formData, setFormData] = useState({
        ...initialData,
        dynamic_specs: initialData.dynamic_specs || {}
    });
    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);
    const fileInputRef = useRef(null);
    const [uploadingImage, setUploadingImage] = useState(false);

    const theme = THEMES[formData.nature] || THEMES['MAQUINARIA'];

    const steps = [
        { id: 1, label: 'INFORMACIÓN GENERAL', icon: Info },
        { id: 2, label: formData.nature === 'MAQUINARIA' ? 'PARÁMETROS DE OPERACIÓN' : 'ESPECIFICACIONES', icon: Settings },
        { id: 3, label: 'UBICACIÓN', icon: MapPin },
        { id: 4, label: 'LIMPIEZA', icon: Sparkles },
        { id: 5, label: 'MANTENIMIENTO', icon: Wrench },
        { id: 6, label: 'ESTADO ACTUAL', icon: Activity }
    ];

    const handleSpecChange = (key, value) => {
        setFormData({
            ...formData,
            dynamic_specs: {
                ...formData.dynamic_specs,
                [key]: value
            }
        });
    };

    const handleImageUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setUploadingImage(true);
        try {
            const reader = new FileReader();
            reader.onloadend = async () => {
                const compressed = await compressImage(reader.result);
                setFormData({...formData, image_url: compressed});
                setUploadingImage(false);
            };
            reader.readAsDataURL(file);
        } catch (error) {
            console.error("Error al procesar imagen:", error);
            setUploadingImage(false);
        }
    };

    const handleSave = async () => {
        const cleanName = (formData.name || '').trim();
        const cleanSN = (formData.serial_number || '').trim();

        if (!cleanName || !cleanSN) {
            alert("Por favor completa los campos obligatorios (Nombre y S/N).");
            return;
        }

        setLoading(true);
        try {
            const isUpdate = !!formData.id;
            const url = isUpdate 
                ? `${API_BASE}/production/equipment/${formData.id}`
                : `${API_BASE}/production/equipment`;
            
            const payload = {
                ...formData,
                name: cleanName,
                serial_number: cleanSN
            };

            const resp = await fetch(url, {
                method: isUpdate ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (resp.ok) {
                onSuccess();
            } else {
                const errorData = await resp.json().catch(() => ({}));
                const msg = errorData.detail || "Error interno del servidor";
                alert(`Error al guardar equipo: ${msg}`);
            }
        } catch (e) {
            console.error("SAVE ERROR:", e);
            alert("Error de conexión con el servidor. " + (e.message || "Verifica que el sistema esté en línea."));
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!formData.id) return;
        if (!window.confirm("¿Seguro que deseas eliminar este equipo permanentemente?")) return;
        
        setLoading(true);
        try {
            const resp = await fetch(`${API_BASE}/production/equipment/${formData.id}`, {
                method: 'DELETE'
            });
            if (resp.ok) onSuccess();
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-8">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-xl" onClick={onClose} />
            
            <div 
                style={{ backgroundColor: theme.bg }}
                className="relative w-full max-w-6xl h-[90vh] border border-black/10 rounded-[60px] flex flex-col overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300"
            >
                {/* Modal Header */}
                <div className="p-8 pb-4 flex items-center justify-between">
                    <div className="flex items-center gap-6">
                        <div>
                            <h2 style={{ color: theme.text }} className="text-5xl font-black italic uppercase tracking-tighter">
                                {formData.name || 'NUEVO EQUIPO'}
                            </h2>
                            <p style={{ color: theme.text }} className="text-[10px] font-bold uppercase tracking-[0.4em] mt-1 opacity-60">Ficha Técnica de Activo</p>
                        </div>
                    </div>
                    <button onClick={onClose} style={{ backgroundColor: theme.input, color: theme.text }} className="p-4 rounded-full hover:scale-110 transition-all">
                        <X size={24} />
                    </button>
                </div>

                {/* Stepper Progress */}
                <div className="px-10 py-2 flex gap-3">
                    {steps.map(s => (
                        <button
                            key={s.id}
                            onClick={() => setStep(s.id)}
                            style={{
                                backgroundColor: step === s.id ? theme.text : theme.input,
                                color: step === s.id ? theme.bg : theme.text,
                                borderColor: 'rgba(0,0,0,0.1)'
                            }}
                            className={`flex-1 flex items-center gap-3 p-3 rounded-2xl border transition-all`}
                        >
                            <div className={`p-1.5 rounded-lg ${step === s.id ? 'bg-white/20' : 'bg-black/5'}`}>
                                <s.icon size={16} />
                            </div>
                            <span className="text-[13px] font-black uppercase tracking-wider">{s.label}</span>
                        </button>
                    ))}
                </div>

                {/* Content */}
                <div className="flex-1 overflow-auto px-10 relative flex flex-col justify-start min-h-0 custom-scrollbar py-6">
                    <div className="max-w-5xl mx-auto w-full grid grid-cols-3 gap-12 animate-in slide-in-from-right-4 duration-500" key={step}>
                        
                        {/* PESTAÑA 1: GENERAL */}
                        {step === 1 && (
                            <>
                                {/* Columna Izquierda: Fotografía */}
                                <div className="col-span-1 space-y-6">
                                    <div className="space-y-2">
                                        <span style={{ color: theme.text }} className="text-[13px] font-black uppercase opacity-60 tracking-widest pl-2">Fotografía Física</span>
                                        <div 
                                            onClick={() => fileInputRef.current?.click()}
                                            style={{ backgroundColor: theme.input }}
                                            className="w-full aspect-square rounded-3xl border-2 border-dashed border-black/10 hover:border-black/30 flex flex-col items-center justify-center cursor-pointer overflow-hidden relative group transition-all"
                                        >
                                            {formData.image_url ? (
                                                <>
                                                    <img src={formData.image_url} alt="preview" className="w-full h-full object-cover group-hover:opacity-50 transition-opacity" />
                                                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <span className="bg-black/50 text-white px-4 py-2 rounded-xl text-xs font-bold backdrop-blur-sm">Cambiar Foto</span>
                                                    </div>
                                                </>
                                            ) : (
                                                <div style={{ color: theme.text }} className="flex flex-col items-center gap-2 opacity-50 group-hover:opacity-100 transition-opacity">
                                                    {uploadingImage ? <Loader2 className="animate-spin" size={32} /> : <ImageIcon size={32} />}
                                                    <span className="text-[10px] font-bold uppercase tracking-wider">Subir Imagen</span>
                                                </div>
                                            )}
                                        </div>
                                        <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleImageUpload} />
                                    </div>
                                </div>

                                {/* Columna Derecha: Datos Generales */}
                                <div className="col-span-2 space-y-8">
                                    <div className="space-y-6">
                                        <div className="flex items-center gap-2 border-b border-black/10 pb-2">
                                            <FileText size={16} style={{ color: theme.text }} className="opacity-60" />
                                            <h3 style={{ color: theme.text }} className="text-xs font-black uppercase tracking-widest">Información General</h3>
                                        </div>
                                        <div className="grid grid-cols-2 gap-6">
                                            <label className="block">
                                                <span style={{ color: theme.text }} className="text-[13px] font-black uppercase opacity-60 tracking-widest pl-2">Naturaleza del Equipo</span>
                                                <select
                                                    value={formData.nature}
                                                    onChange={e => {
                                                        setFormData({...formData, nature: e.target.value});
                                                    }}
                                                    style={{ backgroundColor: theme.input, color: theme.text }}
                                                    className="w-full border border-black/5 rounded-3xl p-5 mt-2 outline-none font-black uppercase tracking-wider"
                                                >
                                                    <option value="MAQUINARIA">Maquinaria</option>
                                                    <option value="MOBILIARIO">Mobiliario</option>
                                                    <option value="RECIPIENTE">Recipiente</option>
                                                    <option value="UTENSILIO">Utensilio</option>
                                                </select>
                                            </label>

                                            {formData.nature === 'MAQUINARIA' && (
                                                <label className="block">
                                                    <span style={{ color: theme.text }} className="text-[13px] font-black uppercase opacity-60 tracking-widest pl-2">Tipo de Máquina</span>
                                                    <select 
                                                        value={formData.dynamic_specs?.tipo_maquina || ''} 
                                                        onChange={e => handleSpecChange('tipo_maquina', e.target.value)} 
                                                        style={{ backgroundColor: theme.input, color: theme.text }} 
                                                        className="w-full border border-black/5 rounded-3xl p-5 mt-2 outline-none font-bold uppercase"
                                                    >
                                                        <option value="">(Seleccionar)</option>
                                                        <option value="BATIDORA">Batidora</option>
                                                        <option value="AMASADORA">Amasadora</option>
                                                        <option value="REFINADORA">Refinadora</option>
                                                        <option value="LICUADORA">Licuadora</option>
                                                        <option value="LAMINADORA">Laminadora</option>
                                                        <option value="CORTADORA">Cortadora</option>
                                                        <option value="BASCULA">Báscula</option>
                                                    </select>
                                                </label>
                                            )}

                                            {formData.nature === 'MOBILIARIO' && (
                                                <label className="block">
                                                    <span style={{ color: theme.text }} className="text-[13px] font-black uppercase opacity-60 tracking-widest pl-2">Tipo de Mobiliario</span>
                                                    <select 
                                                        value={formData.dynamic_specs?.tipo_mobiliario || ''} 
                                                        onChange={e => handleSpecChange('tipo_mobiliario', e.target.value)} 
                                                        style={{ backgroundColor: theme.input, color: theme.text }} 
                                                        className="w-full border border-black/5 rounded-3xl p-5 mt-2 outline-none font-bold uppercase"
                                                    >
                                                        <option value="">(Seleccionar)</option>
                                                        <option value="MESA DE TRABAJO">Mesa de Trabajo</option>
                                                        <option value="CARRITO DE INSUMOS">Carrito de Insumos</option>
                                                        <option value="CARRO ESPIGUERO">Carro Espiguero</option>
                                                        <option value="CARRO DE RECICLAJE">Carro de Reciclaje</option>
                                                    </select>
                                                </label>
                                            )}

                                            {(formData.nature === 'RECIPIENTE' || formData.nature === 'UTENSILIO') && (
                                                <div className="block"></div>
                                            )}

                                            <label className="block col-span-2">
                                                <span style={{ color: theme.text }} className="text-[13px] font-black uppercase opacity-60 tracking-widest pl-2">
                                                    Nombre del Activo <span className="text-red-500">*</span>
                                                </span>
                                                <input 
                                                    type="text" 
                                                    value={formData.name} 
                                                    onChange={e => setFormData({...formData, name: e.target.value})} 
                                                    style={{ backgroundColor: theme.input, color: theme.text }}
                                                    className="w-full border border-black/5 rounded-3xl p-5 mt-2 outline-none font-bold placeholder-black/30" 
                                                    placeholder="Ej: Amasadora Espiral 50kg" 
                                                />
                                            </label>
                                            <label className="block">
                                                <span style={{ color: theme.text }} className="text-[13px] font-black uppercase opacity-60 tracking-widest pl-2">Modelo / Ref</span>
                                                <input 
                                                    type="text" 
                                                    value={formData.model_ref} 
                                                    onChange={e => setFormData({...formData, model_ref: e.target.value})} 
                                                    style={{ backgroundColor: theme.input, color: theme.text }}
                                                    className="w-full border border-black/5 rounded-3xl p-5 mt-2 outline-none font-bold placeholder-black/30" 
                                                    placeholder="Ej: SM-50" 
                                                />
                                            </label>
                                            <label className="block">
                                                <span style={{ color: theme.text }} className="text-[13px] font-black uppercase opacity-60 tracking-widest pl-2">
                                                    S/N Físico <span className="text-red-500">*</span>
                                                </span>
                                                <input 
                                                    type="text" 
                                                    value={formData.serial_number} 
                                                    onChange={e => setFormData({...formData, serial_number: e.target.value})} 
                                                    style={{ backgroundColor: theme.input, color: theme.text }}
                                                    className="w-full border border-black/5 rounded-3xl p-5 mt-2 outline-none font-mono font-bold placeholder-black/30" 
                                                    placeholder="S/N Único" 
                                                />
                                            </label>
                                            <label className="block col-span-2">
                                                <span style={{ color: theme.text }} className="text-[13px] font-black uppercase opacity-60 tracking-widest pl-2">Descripción</span>
                                                <textarea 
                                                    value={formData.description} 
                                                    onChange={e => setFormData({...formData, description: e.target.value})} 
                                                    style={{ backgroundColor: theme.input, color: theme.text }}
                                                    className="w-full border border-black/5 rounded-3xl p-5 mt-2 outline-none font-bold placeholder-black/30 resize-none h-24" 
                                                    placeholder="Notas sobre el estado, ubicación o uso..." 
                                                />
                                            </label>

                                            {formData.nature === 'MAQUINARIA' && (
                                                <>
                                                    <label className="block">
                                                        <span style={{ color: theme.text }} className="text-[13px] font-black uppercase opacity-60 tracking-widest pl-2">Voltaje (V)</span>
                                                        <input type="text" value={formData.dynamic_specs?.voltaje || ''} onChange={e => handleSpecChange('voltaje', e.target.value)} style={{ backgroundColor: theme.input, color: theme.text }} className="w-full border border-black/5 rounded-3xl p-5 mt-2 outline-none font-bold placeholder-black/30" placeholder="Ej: 220V Trifásico" />
                                                    </label>
                                                    <label className="block">
                                                        <span style={{ color: theme.text }} className="text-[13px] font-black uppercase opacity-60 tracking-widest pl-2">Potencia (HP/kW)</span>
                                                        <input type="text" value={formData.dynamic_specs?.potencia || ''} onChange={e => handleSpecChange('potencia', e.target.value)} style={{ backgroundColor: theme.input, color: theme.text }} className="w-full border border-black/5 rounded-3xl p-5 mt-2 outline-none font-bold placeholder-black/30" placeholder="Ej: 5 HP" />
                                                    </label>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </>
                        )}

                        {/* PESTAÑA 2: PARÁMETROS / ESPECIFICACIONES */}
                        {step === 2 && (
                            <div className="col-span-3 space-y-8">
                                <div className="space-y-6">
                                    <div className="flex items-center gap-2 border-b border-black/10 pb-2">
                                        <Settings size={16} style={{ color: theme.text }} className="opacity-60" />
                                        <h3 style={{ color: theme.text }} className="text-xs font-black uppercase tracking-widest">
                                            {formData.nature === 'MAQUINARIA' ? 'Parámetros de Operación' : 'Especificaciones Técnicas'} ({formData.nature})
                                        </h3>
                                    </div>
                                    
                                    <div className="grid grid-cols-3 gap-6">
                                        {formData.nature === 'MAQUINARIA' && (
                                            <>
                                                {/* Lógica Condicional para Batidora */}
                                                {formData.dynamic_specs?.tipo_maquina === 'BATIDORA' && (
                                                    <div className="col-span-3 grid grid-cols-2 gap-6 mt-4 p-6 rounded-[40px] border border-black/10" style={{ backgroundColor: theme.input }}>
                                                        <div className="col-span-2 flex items-center gap-2 mb-2">
                                                            <Box size={16} style={{ color: theme.text }} />
                                                            <h4 style={{ color: theme.text }} className="text-xs font-black uppercase tracking-widest opacity-80">Configuración de Batidora</h4>
                                                        </div>
                                                        <label className="block">
                                                            <span style={{ color: theme.text }} className="text-[11px] font-black uppercase opacity-60 tracking-widest pl-2">Capacidad del Bowl</span>
                                                            <input type="text" value={formData.dynamic_specs?.bowl_capacidad || ''} onChange={e => handleSpecChange('bowl_capacidad', e.target.value)} style={{ backgroundColor: theme.input, color: theme.text }} className="w-full border border-black/5 rounded-3xl p-4 mt-2 outline-none font-bold placeholder-black/30" placeholder="Ej: 60 Litros" />
                                                        </label>
                                                        <div className="block">
                                                            <span style={{ color: theme.text }} className="text-[11px] font-black uppercase opacity-60 tracking-widest pl-2 block mb-2">Accesorios Disponibles</span>
                                                            <div className="flex gap-2">
                                                                {['GLOBO', 'PALETA', 'GANCHO'].map(acc => {
                                                                    const current = (formData.dynamic_specs?.accesorios || '').split(',').map(a => a.trim()).filter(Boolean);
                                                                    const isSelected = current.includes(acc);
                                                                    return (
                                                                        <button
                                                                            key={acc}
                                                                            onClick={() => {
                                                                                const newAcc = isSelected ? current.filter(a => a !== acc) : [...current, acc];
                                                                                handleSpecChange('accesorios', newAcc.join(', '));
                                                                            }}
                                                                            style={{
                                                                                backgroundColor: isSelected ? theme.text : theme.input,
                                                                                color: isSelected ? theme.bg : theme.text,
                                                                                borderColor: isSelected ? 'transparent' : 'rgba(0,0,0,0.1)'
                                                                            }}
                                                                            className="flex-1 py-3 px-2 rounded-2xl text-[11px] font-black uppercase tracking-wider border transition-all"
                                                                        >
                                                                            {acc}
                                                                        </button>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                        <label className="block">
                                                            <span style={{ color: theme.text }} className="text-[11px] font-black uppercase opacity-60 tracking-widest pl-2">Velocidades</span>
                                                            <input type="text" value={formData.dynamic_specs?.velocidades || ''} onChange={e => handleSpecChange('velocidades', e.target.value)} style={{ backgroundColor: theme.input, color: theme.text }} className="w-full border border-black/5 rounded-3xl p-4 mt-2 outline-none font-bold placeholder-black/30" placeholder="Ej: 3 (Lenta, Media, Rápida)" />
                                                        </label>
                                                        <label className="block">
                                                            <span style={{ color: theme.text }} className="text-[11px] font-black uppercase opacity-60 tracking-widest pl-2">¿Parar para cambiar vel?</span>
                                                            <select 
                                                                value={formData.dynamic_specs?.parar_velocidad || 'SI'} 
                                                                onChange={e => handleSpecChange('parar_velocidad', e.target.value)} 
                                                                style={{ backgroundColor: theme.input, color: theme.text }} 
                                                                className="w-full border border-black/5 rounded-3xl p-4 mt-2 outline-none font-black uppercase"
                                                            >
                                                                <option value="SI">SÍ, ES OBLIGATORIO PARAR</option>
                                                                <option value="NO">NO, CAMBIO EN CALIENTE</option>
                                                            </select>
                                                        </label>
                                                    </div>
                                                )}

                                                {(formData.dynamic_specs?.tipo_maquina === 'AMASADORA' || formData.dynamic_specs?.tipo_maquina === 'REFINADORA') && (
                                                    <div className="col-span-3 grid grid-cols-2 gap-6 mt-4 p-6 rounded-[40px] border border-black/10" style={{ backgroundColor: theme.input }}>
                                                        <div className="col-span-2 flex items-center gap-2 mb-2">
                                                            <Box size={16} style={{ color: theme.text }} />
                                                            <h4 style={{ color: theme.text }} className="text-xs font-black uppercase tracking-widest opacity-80">
                                                                Configuración de {formData.dynamic_specs?.tipo_maquina === 'AMASADORA' ? 'Amasadora' : 'Refinadora'}
                                                            </h4>
                                                        </div>
                                                        <label className="block">
                                                            <span style={{ color: theme.text }} className="text-[11px] font-black uppercase opacity-60 tracking-widest pl-2">Capacidad de la Tolva</span>
                                                            <input type="text" value={formData.dynamic_specs?.tolva_capacidad || ''} onChange={e => handleSpecChange('tolva_capacidad', e.target.value)} style={{ backgroundColor: theme.input, color: theme.text }} className="w-full border border-black/5 rounded-3xl p-4 mt-2 outline-none font-bold placeholder-black/30" placeholder="Ej: 50 kg" />
                                                        </label>
                                                        <label className="block">
                                                            <span style={{ color: theme.text }} className="text-[11px] font-black uppercase opacity-60 tracking-widest pl-2">Velocidades</span>
                                                            <input type="text" value={formData.dynamic_specs?.velocidades || ''} onChange={e => handleSpecChange('velocidades', e.target.value)} style={{ backgroundColor: theme.input, color: theme.text }} className="w-full border border-black/5 rounded-3xl p-4 mt-2 outline-none font-bold placeholder-black/30" placeholder="Ej: 2 (Baja, Alta)" />
                                                        </label>
                                                        <label className="block col-span-2">
                                                            <span style={{ color: theme.text }} className="text-[11px] font-black uppercase opacity-60 tracking-widest pl-2">¿Parar para cambiar vel?</span>
                                                            <select 
                                                                value={formData.dynamic_specs?.parar_velocidad || 'SI'} 
                                                                onChange={e => handleSpecChange('parar_velocidad', e.target.value)} 
                                                                style={{ backgroundColor: theme.input, color: theme.text }} 
                                                                className="w-full border border-black/5 rounded-3xl p-4 mt-2 outline-none font-black uppercase"
                                                            >
                                                                <option value="SI">SÍ, ES OBLIGATORIO PARAR</option>
                                                                <option value="NO">NO, CAMBIO EN CALIENTE</option>
                                                            </select>
                                                        </label>
                                                    </div>
                                                )}
                                            </>
                                        )}

                                        {formData.nature === 'RECIPIENTE' && (
                                            <>
                                                <label className="block col-span-3 md:col-span-1">
                                                    <span style={{ color: theme.text }} className="text-[13px] font-black uppercase opacity-60 tracking-widest pl-2">Capacidad</span>
                                                    <input type="text" value={formData.dynamic_specs?.capacidad || ''} onChange={e => handleSpecChange('capacidad', e.target.value)} style={{ backgroundColor: theme.input, color: theme.text }} className="w-full border border-black/5 rounded-3xl p-5 mt-2 outline-none font-bold placeholder-black/30" placeholder="Ej: 40 Litros" />
                                                </label>
                                                <label className="block col-span-3 md:col-span-2">
                                                    <span style={{ color: theme.text }} className="text-[13px] font-black uppercase opacity-60 tracking-widest pl-2">Material</span>
                                                    <input type="text" value={formData.dynamic_specs?.material || ''} onChange={e => handleSpecChange('material', e.target.value)} style={{ backgroundColor: theme.input, color: theme.text }} className="w-full border border-black/5 rounded-3xl p-5 mt-2 outline-none font-bold placeholder-black/30" placeholder="Ej: Acero Inox 304" />
                                                </label>
                                            </>
                                        )}

                                        {formData.nature === 'MOBILIARIO' && (
                                            <>
                                                <label className="block col-span-3 md:col-span-1">
                                                    <span style={{ color: theme.text }} className="text-[13px] font-black uppercase opacity-60 tracking-widest pl-2">Dimensiones</span>
                                                    <input type="text" value={formData.dynamic_specs?.dimensiones || ''} onChange={e => handleSpecChange('dimensiones', e.target.value)} style={{ backgroundColor: theme.input, color: theme.text }} className="w-full border border-black/5 rounded-3xl p-5 mt-2 outline-none font-bold placeholder-black/30" placeholder="Ej: 200x100x90 cm" />
                                                </label>
                                                <label className="block col-span-3 md:col-span-2">
                                                    <span style={{ color: theme.text }} className="text-[13px] font-black uppercase opacity-60 tracking-widest pl-2">Material Superficie</span>
                                                    <input type="text" value={formData.dynamic_specs?.material || ''} onChange={e => handleSpecChange('material', e.target.value)} style={{ backgroundColor: theme.input, color: theme.text }} className="w-full border border-black/5 rounded-3xl p-5 mt-2 outline-none font-bold placeholder-black/30" placeholder="Ej: Placa Acero" />
                                                </label>
                                                {formData.dynamic_specs?.tipo_mobiliario === 'MESA DE TRABAJO' && (
                                                    <label className="block col-span-3">
                                                        <span style={{ color: theme.text }} className="text-[13px] font-black uppercase opacity-60 tracking-widest pl-2">Número de Cuadrantes</span>
                                                        <input type="number" min="1" value={formData.dynamic_specs?.cuadrantes || ''} onChange={e => handleSpecChange('cuadrantes', e.target.value)} style={{ backgroundColor: theme.input, color: theme.text }} className="w-full border border-black/5 rounded-3xl p-5 mt-2 outline-none font-bold placeholder-black/30" placeholder="Ej: 6" />
                                                        <span className="text-[10px] uppercase font-bold opacity-40 ml-4 mt-2 block">Permite a Gemma asignar el espacio de trabajo específico (Ej: "Usa el cuadrante 6").</span>
                                                    </label>
                                                )}
                                            </>
                                        )}

                                        {formData.nature === 'UTENSILIO' && (
                                            <>
                                                <label className="block col-span-3 md:col-span-1">
                                                    <span style={{ color: theme.text }} className="text-[13px] font-black uppercase opacity-60 tracking-widest pl-2">Tipo de Uso</span>
                                                    <input type="text" value={formData.dynamic_specs?.tipo_uso || ''} onChange={e => handleSpecChange('tipo_uso', e.target.value)} style={{ backgroundColor: theme.input, color: theme.text }} className="w-full border border-black/5 rounded-3xl p-5 mt-2 outline-none font-bold placeholder-black/30" placeholder="Ej: Corte pesado" />
                                                </label>
                                                <label className="block col-span-3 md:col-span-2">
                                                    <span style={{ color: theme.text }} className="text-[13px] font-black uppercase opacity-60 tracking-widest pl-2">Material Principal</span>
                                                    <input type="text" value={formData.dynamic_specs?.material || ''} onChange={e => handleSpecChange('material', e.target.value)} style={{ backgroundColor: theme.input, color: theme.text }} className="w-full border border-black/5 rounded-3xl p-5 mt-2 outline-none font-bold placeholder-black/30" placeholder="Ej: Silicón Alta Temp" />
                                                </label>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* PESTAÑA 3: UBICACIÓN Y TRAZABILIDAD */}
                        {step === 3 && (
                            <div className="col-span-3 space-y-8">
                                <div className="space-y-6">
                                    <div className="flex items-center gap-2 border-b border-black/10 pb-2">
                                        <MapPin size={16} style={{ color: theme.text }} className="opacity-60" />
                                        <h3 style={{ color: theme.text }} className="text-xs font-black uppercase tracking-widest">
                                            Control de Ubicación y Trazabilidad
                                        </h3>
                                    </div>
                                    
                                    <div className="grid grid-cols-2 gap-6">
                                        {(formData.nature === 'MAQUINARIA' || formData.nature === 'MOBILIARIO') && (
                                            <>
                                                <label className="block">
                                                    <span style={{ color: theme.text }} className="text-[13px] font-black uppercase opacity-60 tracking-widest pl-2">¿Es Ubicación Fija?</span>
                                                    <select 
                                                        value={formData.dynamic_specs?.ubicacion_fija || 'SI'} 
                                                        onChange={e => handleSpecChange('ubicacion_fija', e.target.value)} 
                                                        style={{ backgroundColor: theme.input, color: theme.text }} 
                                                        className="w-full border border-black/5 rounded-3xl p-5 mt-2 outline-none font-black uppercase"
                                                    >
                                                        <option value="SI">Sí, Anclado o Fijo</option>
                                                        <option value="NO">No, Es Móvil</option>
                                                    </select>
                                                </label>
                                                <label className="block">
                                                    <span style={{ color: theme.text }} className="text-[13px] font-black uppercase opacity-60 tracking-widest pl-2">Ubicación / Área</span>
                                                    <input type="text" value={formData.dynamic_specs?.ubicacion || ''} onChange={e => handleSpecChange('ubicacion', e.target.value)} style={{ backgroundColor: theme.input, color: theme.text }} className="w-full border border-black/5 rounded-3xl p-5 mt-2 outline-none font-bold placeholder-black/30" placeholder="Ej: Área de Amasado Norte" />
                                                </label>
                                            </>
                                        )}

                                        {(formData.nature === 'RECIPIENTE' || formData.nature === 'UTENSILIO') && (
                                            <>
                                                <label className="block col-span-2">
                                                    <span style={{ color: theme.text }} className="text-[13px] font-black uppercase opacity-60 tracking-widest pl-2">Ubicación de Almacenamiento Base</span>
                                                    <input type="text" value={formData.dynamic_specs?.ubicacion_almacenamiento || ''} onChange={e => handleSpecChange('ubicacion_almacenamiento', e.target.value)} style={{ backgroundColor: theme.input, color: theme.text }} className="w-full border border-black/5 rounded-3xl p-5 mt-2 outline-none font-bold placeholder-black/30" placeholder="Ej: Estante 4, Nivel Superior" />
                                                </label>

                                                <label className="block">
                                                    <span style={{ color: theme.text }} className="text-[13px] font-black uppercase opacity-60 tracking-widest pl-2">Utilizado En (Área Física)</span>
                                                    <input type="text" value={formData.dynamic_specs?.utilizado_en || ''} onChange={e => handleSpecChange('utilizado_en', e.target.value)} style={{ backgroundColor: theme.input, color: theme.text }} className="w-full border border-black/5 rounded-3xl p-5 mt-2 outline-none font-bold placeholder-black/30" placeholder="Ej: Mesa de Acero Inox Central" />
                                                </label>
                                                <label className="block">
                                                    <span style={{ color: theme.text }} className="text-[13px] font-black uppercase opacity-60 tracking-widest pl-2">Utilizado Para (Proceso)</span>
                                                    <input type="text" value={formData.dynamic_specs?.utilizado_para || ''} onChange={e => handleSpecChange('utilizado_para', e.target.value)} style={{ backgroundColor: theme.input, color: theme.text }} className="w-full border border-black/5 rounded-3xl p-5 mt-2 outline-none font-bold placeholder-black/30" placeholder="Ej: Corte de masa salada" />
                                                </label>

                                                <div className="col-span-2 grid grid-cols-3 gap-6 mt-4 p-6 rounded-[40px] border border-black/10" style={{ backgroundColor: theme.input }}>
                                                    <div className="col-span-3 flex items-center gap-2 mb-2">
                                                        <Key size={16} style={{ color: theme.text }} />
                                                        <h4 style={{ color: theme.text }} className="text-xs font-black uppercase tracking-widest opacity-80">Asignación de Responsabilidades</h4>
                                                    </div>
                                                    
                                                    <label className="block">
                                                        <span style={{ color: theme.text }} className="text-[11px] font-black uppercase opacity-60 tracking-widest pl-2">Utilizado Por</span>
                                                        <input type="text" value={formData.dynamic_specs?.utilizado_por || ''} onChange={e => handleSpecChange('utilizado_por', e.target.value)} style={{ backgroundColor: theme.input, color: theme.text }} className="w-full border border-black/5 rounded-3xl p-4 mt-2 outline-none font-bold placeholder-black/30" placeholder="Ej: Maestro Panadero" />
                                                    </label>
                                                    <label className="block">
                                                        <span style={{ color: theme.text }} className="text-[11px] font-black uppercase opacity-60 tracking-widest pl-2">Lavado Por</span>
                                                        <input type="text" value={formData.dynamic_specs?.lavado_por || ''} onChange={e => handleSpecChange('lavado_por', e.target.value)} style={{ backgroundColor: theme.input, color: theme.text }} className="w-full border border-black/5 rounded-3xl p-4 mt-2 outline-none font-bold placeholder-black/30" placeholder="Ej: Ayudante General" />
                                                    </label>
                                                    <label className="block">
                                                        <span style={{ color: theme.text }} className="text-[11px] font-black uppercase opacity-60 tracking-widest pl-2">Reacomodado Por</span>
                                                        <input type="text" value={formData.dynamic_specs?.reacomodado_por || ''} onChange={e => handleSpecChange('reacomodado_por', e.target.value)} style={{ backgroundColor: theme.input, color: theme.text }} className="w-full border border-black/5 rounded-3xl p-4 mt-2 outline-none font-bold placeholder-black/30" placeholder="Ej: Supervisor de Turno" />
                                                    </label>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* PESTAÑA 4: LIMPIEZA */}
                        {step === 4 && (
                            <div className="col-span-3 space-y-8">
                                <div className="space-y-6">
                                    <div className="flex items-center gap-2 border-b border-black/10 pb-2">
                                        <Sparkles size={16} style={{ color: theme.text }} className="opacity-60" />
                                        <h3 style={{ color: theme.text }} className="text-xs font-black uppercase tracking-widest">
                                            Gestión de Limpieza
                                        </h3>
                                    </div>
                                    
                                    <div className="grid grid-cols-2 gap-6">
                                        <label className="block">
                                            <span style={{ color: theme.text }} className="text-[13px] font-black uppercase opacity-60 tracking-widest pl-2">Encargado de Limpieza</span>
                                            <input type="text" value={formData.dynamic_specs?.encargado_limpieza || ''} onChange={e => handleSpecChange('encargado_limpieza', e.target.value)} style={{ backgroundColor: theme.input, color: theme.text }} className="w-full border border-black/5 rounded-3xl p-5 mt-2 outline-none font-bold placeholder-black/30" placeholder="Ej: Ayudante General, Auxiliar de Limpieza" />
                                        </label>
                                        <label className="block">
                                            <span style={{ color: theme.text }} className="text-[13px] font-black uppercase opacity-60 tracking-widest pl-2">Material / Productos de Limpieza</span>
                                            <input type="text" value={formData.dynamic_specs?.productos_limpieza || ''} onChange={e => handleSpecChange('productos_limpieza', e.target.value)} style={{ backgroundColor: theme.input, color: theme.text }} className="w-full border border-black/5 rounded-3xl p-5 mt-2 outline-none font-bold placeholder-black/30" placeholder="Ej: Desengrasante, Esponja suave, Jabón neutro" />
                                        </label>
                                        <label className="block col-span-2">
                                            <span style={{ color: theme.text }} className="text-[13px] font-black uppercase opacity-60 tracking-widest pl-2">Procedimiento / Ciclo de Limpieza</span>
                                            <textarea value={formData.dynamic_specs?.procedimiento_limpieza || ''} onChange={e => handleSpecChange('procedimiento_limpieza', e.target.value)} style={{ backgroundColor: theme.input, color: theme.text }} className="w-full border border-black/5 rounded-3xl p-5 mt-2 outline-none font-bold placeholder-black/30 h-32 resize-none" placeholder="Ej: Lavado diario al finalizar turno. No usar fibras metálicas." />
                                        </label>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* PESTAÑA 5: MANTENIMIENTO */}
                        {step === 5 && (
                            <div className="col-span-3 space-y-8">
                                <div className="space-y-6">
                                    <div className="flex items-center gap-2 border-b border-black/10 pb-2">
                                        <Wrench size={16} style={{ color: theme.text }} className="opacity-60" />
                                        <h3 style={{ color: theme.text }} className="text-xs font-black uppercase tracking-widest">
                                            Gestión de Mantenimiento
                                        </h3>
                                    </div>
                                    
                                    <div className="grid grid-cols-2 gap-6">
                                        <label className="block">
                                            <span style={{ color: theme.text }} className="text-[13px] font-black uppercase opacity-60 tracking-widest pl-2">Encargado de Mantenimiento</span>
                                            <input type="text" value={formData.dynamic_specs?.encargado_mantenimiento || ''} onChange={e => handleSpecChange('encargado_mantenimiento', e.target.value)} style={{ backgroundColor: theme.input, color: theme.text }} className="w-full border border-black/5 rounded-3xl p-5 mt-2 outline-none font-bold placeholder-black/30" placeholder="Ej: Ing. Mecánico Externo, Técnico de Planta" />
                                        </label>
                                        <label className="block">
                                            <span style={{ color: theme.text }} className="text-[13px] font-black uppercase opacity-60 tracking-widest pl-2">Área de Mantenimiento</span>
                                            <input type="text" value={formData.dynamic_specs?.area_mantenimiento || ''} onChange={e => handleSpecChange('area_mantenimiento', e.target.value)} style={{ backgroundColor: theme.input, color: theme.text }} className="w-full border border-black/5 rounded-3xl p-5 mt-2 outline-none font-bold placeholder-black/30" placeholder="Ej: Taller Norte, In-situ" />
                                        </label>
                                        <label className="block col-span-2">
                                            <span style={{ color: theme.text }} className="text-[13px] font-black uppercase opacity-60 tracking-widest pl-2">Procedimiento / Ciclo de Mantenimiento</span>
                                            <textarea value={formData.dynamic_specs?.procedimiento_mantenimiento || formData.dynamic_specs?.mantenimiento || ''} onChange={e => {
                                                handleSpecChange('procedimiento_mantenimiento', e.target.value);
                                                // Clear the old one if it existed so we migrate fully
                                                if (formData.dynamic_specs?.mantenimiento) {
                                                    handleSpecChange('mantenimiento', '');
                                                }
                                            }} style={{ backgroundColor: theme.input, color: theme.text }} className="w-full border border-black/5 rounded-3xl p-5 mt-2 outline-none font-bold placeholder-black/30 h-32 resize-none" placeholder="Ej: Engrasado semanal de poleas. Cambio de baleros cada 6 meses. Limpieza profunda diaria." />
                                        </label>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* PESTAÑA 6: ESTADO ACTUAL */}
                        {step === 6 && (
                            <div className="col-span-3 space-y-8">
                                <div className="space-y-6">
                                    <div className="flex items-center gap-2 border-b border-black/10 pb-2">
                                        <Activity size={16} style={{ color: theme.text }} className="opacity-60" />
                                        <h3 style={{ color: theme.text }} className="text-xs font-black uppercase tracking-widest">
                                            Estado Actual del Equipo
                                        </h3>
                                    </div>
                                    
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                                        {[
                                            { id: 'LISTO', label: 'LISTO PARA USAR', color: 'bg-green-500', text: 'text-white' },
                                            { id: 'OCUPADO', label: 'OCUPADO POR...', color: 'bg-red-500', text: 'text-white' },
                                            { id: 'EN LIMPIEZA', label: 'EN LIMPIEZA', color: 'bg-yellow-500', text: 'text-black' },
                                            { id: 'EN MANTENIMIENTO', label: 'EN MANTENIMIENTO', color: 'bg-orange-500', text: 'text-white' },
                                            { id: 'DESHABILITADO', label: 'DESHABILITADO', color: 'bg-gray-500', text: 'text-white' }
                                        ].map(st => (
                                            <button
                                                key={st.id}
                                                onClick={() => handleSpecChange('estado_actual', st.id)}
                                                className={`p-4 rounded-3xl border-2 transition-all flex flex-col items-center justify-center gap-3 ${
                                                    formData.dynamic_specs?.estado_actual === st.id 
                                                    ? `${st.color} ${st.text} border-transparent shadow-lg scale-105` 
                                                    : 'bg-white/40 border-black/10 hover:border-black/30'
                                                }`}
                                            >
                                                <div className={`w-4 h-4 rounded-full ${formData.dynamic_specs?.estado_actual === st.id ? 'bg-current opacity-50' : st.color}`} />
                                                <span className={`text-[10px] font-black uppercase tracking-widest text-center ${formData.dynamic_specs?.estado_actual === st.id ? '' : 'text-gray-600'}`}>{st.label}</span>
                                            </button>
                                        ))}
                                    </div>

                                    {formData.dynamic_specs?.estado_actual === 'OCUPADO' && (
                                        <div className="col-span-3 grid grid-cols-2 gap-6 mt-4 p-6 rounded-[40px] border border-black/10 animate-in slide-in-from-top-4" style={{ backgroundColor: theme.input }}>
                                            <label className="block">
                                                <span style={{ color: theme.text }} className="text-[11px] font-black uppercase opacity-60 tracking-widest pl-2">¿Quién lo está usando?</span>
                                                <input type="text" value={formData.dynamic_specs?.estado_ocupado_por || ''} onChange={e => handleSpecChange('estado_ocupado_por', e.target.value)} style={{ backgroundColor: theme.input, color: theme.text }} className="w-full border border-black/5 rounded-3xl p-4 mt-2 outline-none font-bold placeholder-black/30" placeholder="Ej: Maestro Juan" />
                                            </label>
                                            <label className="block">
                                                <span style={{ color: theme.text }} className="text-[11px] font-black uppercase opacity-60 tracking-widest pl-2">Detalles / Proceso en curso</span>
                                                <input type="text" value={formData.dynamic_specs?.estado_detalles || ''} onChange={e => handleSpecChange('estado_detalles', e.target.value)} style={{ backgroundColor: theme.input, color: theme.text }} className="w-full border border-black/5 rounded-3xl p-4 mt-2 outline-none font-bold placeholder-black/30" placeholder="Ej: Amasando masa de bisquet" />
                                            </label>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div style={{ backgroundColor: theme.input }} className="p-6 px-10 flex justify-between items-center border-t border-black/5 mt-auto">
                    {formData.id ? (
                        <button onClick={handleDelete} disabled={loading} style={{ color: theme.text }} className="hover:bg-white/20 p-4 rounded-2xl transition-colors font-black text-xs uppercase flex items-center gap-2">
                            <Trash2 size={16} /> Dar de Baja
                        </button>
                    ) : (
                        <div />
                    )}
                    <button 
                        onClick={handleSave} 
                        disabled={loading}
                        className="bg-black text-white px-10 py-5 rounded-3xl font-black uppercase text-sm tracking-widest flex items-center gap-3 hover:scale-105 active:scale-95 transition-all shadow-xl disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                    >
                        {loading ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                        GUARDAR ACTIVO
                    </button>
                </div>
            </div>
        </div>
    );
};
