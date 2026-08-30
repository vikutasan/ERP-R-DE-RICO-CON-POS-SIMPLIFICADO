import React, { useState, useEffect } from 'react';

const API_BASE = `http://${window.location.hostname}:5001/api/v1`;

// Módulos del sistema para la matriz de permisos
const SYSTEM_MODULES = [
    { id: 'pos_force_unlock', name: 'Desbloqueo de Terminales', icon: '🔓' },
    { id: 'pos_force_cash_unlock', name: 'Forzar Desbloqueo de Caja', icon: '💰🔐' },
    { id: 'access_any_terminal', name: 'Acceso a Cualquier Terminal', icon: '🖥️' },
    { id: 'access_terminal_manager', name: 'Acceso a Gestor de Terminales', icon: '⚙️' },
    { id: 'pos_retail', name: 'Punto de Venta IA', icon: '🛒' },
    { id: 'inventory', name: 'Gestión de Productos', icon: '📦' },
    { id: 'inventory_delete', name: 'Eliminar Productos', icon: '🗑️' },
    { id: 'warehouse', name: 'Gestión de Almacenes', icon: '🏬' },
    { id: 'vision_train', name: 'Entrenamiento IA', icon: '👁️' },
    { id: 'production', name: 'Maestro Panadero', icon: '🍞' },
    { id: 'financials', name: 'Módulo Financiero', icon: '📈' },
    { id: 'invoicing', name: 'Facturación CFDI', icon: '🧾' },
    { id: 'purchasing', name: 'Gestión de Compras', icon: '🛒' },
    { id: 'logistics', name: 'Logística de Rutas', icon: '🚚' },
    { id: 'pos_tables', name: 'TPV Mesas & KDS', icon: '🍽️' },
    { id: 'waiter', name: 'App Mesero', icon: '📱' },
    { id: 'driver', name: 'App Repartidor', icon: '📱' },
    { id: 'settings', name: 'Ajustes del Sistema', icon: '⚙️' },
    { id: 'procurement', name: 'B2B Procurement', icon: '📦🏢' },
    { id: 'seguridad_acceso', name: 'Seguridad y Acceso', icon: '🔑' },
    { id: 'auditoria', name: 'Auditoría y Control', icon: '📋' },
    { id: 'analytics_financial_data', name: 'Cifras Monetarias', icon: '💰' },
    { id: 'grandeza_params', name: 'Herramienta Administrador Grandeza', icon: '📋🍞' },
    { id: 'grandeza_daily', name: 'Herramienta Gerente Grandeza', icon: '📅🍞' },
    { id: 'grandeza_driver', name: 'Herramienta Repartidor Grandeza', icon: '🚗🍞' },
    { id: 'grandeza_edit_clients', name: 'Editar Información de Clientes Pan Grandeza', icon: '✏️👥' },
    { id: 'editar_info_negocio', name: 'Editar Info del Negocio en Vista General', icon: '🏪' },
];

export const PerfilesAccessSuite = ({ onClose, onPermissionsUpdate }) => {
    const [profiles, setProfiles] = useState([]);
    const [selectedProfile, setSelectedProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [statusModal, setStatusModal] = useState(null); // { type: 'success' | 'error' | 'confirm', title, message, onConfirm? }
    const [promptModal, setPromptModal] = useState(null); // { isOpen: boolean, value: string }
    
    // Estado de edición
    const [editData, setEditData] = useState({
        name: '',
        description: '',
        permissions: {}
    });

    useEffect(() => {
        fetchProfiles();
    }, []);

    const fetchProfiles = async () => {
        try {
            const resp = await fetch(`${API_BASE}/security/profiles`);
            const data = await resp.json();
            
            // Ordenamiento Maestro: ADMINISTRADOR -> MANAGER -> CAJERO -> OTROS
            const priorityMap = { 'ADMIN': 1, 'ADMINISTRADOR': 1, 'MANAGER': 2, 'CAJERO': 3 };
            const sortedData = data.sort((a, b) => {
                const priorityA = priorityMap[a.name] || 99;
                const priorityB = priorityMap[b.name] || 99;
                if (priorityA !== priorityB) return priorityA - priorityB;
                return a.name.localeCompare(b.name);
            });

            setProfiles(sortedData);
            if (sortedData.length > 0 && !selectedProfile) {
                handleSelectProfile(sortedData[0]);
            }
            setLoading(false);
        } catch (error) {
            console.error("Error fetching profiles:", error);
            setLoading(false);
        }
    };

    const handleSelectProfile = (profile) => {
        setSelectedProfile(profile);
        setEditData({
            name: profile.name,
            description: profile.description || '',
            permissions: profile.permissions || {}
        });
    };

    const handleTogglePermission = (moduleId) => {
        if (moduleId === 'all') {
            // Al activar Master Access: activar TODOS. Al desactivar: limpiar TODOS.
            const newState = editData.permissions.all ? null : 'full';
            const newPerms = { all: newState };
            SYSTEM_MODULES.forEach(m => { newPerms[m.id] = newState; });
            setEditData(prev => ({ ...prev, permissions: newPerms }));
        } else {
            // Si Master Access está activo, no permitir desactivar módulos individuales
            if (editData.permissions.all === 'full') return;
            setEditData(prev => ({
                ...prev,
                permissions: {
                    ...prev.permissions,
                    [moduleId]: prev.permissions[moduleId] ? null : 'full'
                }
            }));
        }
    };

    // Helper: un módulo está activo si tiene permiso propio O si Master Access está ON
    const isModuleActive = (moduleId) => {
        return editData.permissions.all === 'full' || !!editData.permissions[moduleId];
    };

    const handleSave = async () => {
        if (!selectedProfile) return;
        setSaving(true);
        try {
            const resp = await fetch(`${API_BASE}/security/profiles/${selectedProfile.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(editData)
            });
            
            if (resp.ok) {
                const updatedProfile = await resp.json();
                await fetchProfiles();
                setSelectedProfile(updatedProfile); // Actualizar referencia local
                setStatusModal({
                    type: 'success',
                    title: 'Sincronización Exitosa',
                    message: 'Los privilegios del perfil han sido actualizados en la colmena central.'
                });
                // Sincronización en caliente si es el usuario actual
                if (onPermissionsUpdate) {
                    onPermissionsUpdate(updatedProfile);
                }
            } else {
                const errorData = await resp.json();
                setStatusModal({
                    type: 'error',
                    title: 'Fallo de Seguridad',
                    message: errorData.detail || "No se pudo guardar el perfil"
                });
            }
        } catch (error) {
            console.error("Save error:", error);
            setStatusModal({
                type: 'error',
                title: 'Error de Red',
                message: 'No se pudo establecer conexión con el núcleo de seguridad.'
            });
        } finally {
            setSaving(false);
        }
    };

    const handleCreateNew = () => {
        setPromptModal({ isOpen: true, value: '' });
    };

    const confirmCreateNew = async (name) => {
        setPromptModal(null);
        if (!name || !name.trim()) return;
        
        try {
            const resp = await fetch(`${API_BASE}/security/profiles`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: name.trim().toUpperCase(),
                    description: 'Nuevo perfil personalizado',
                    permissions: {}
                })
            });
            if (resp.ok) {
                const newProfile = await resp.json();
                await fetchProfiles();
                handleSelectProfile(newProfile);
            }
        } catch (error) {
            console.error("Create error:", error);
            setStatusModal({
                type: 'error',
                title: 'Error de Creación',
                message: 'No se pudo generar el nuevo perfil de seguridad.'
            });
        }
    };

    const handleDeleteProfile = async (profile) => {
        // Bloqueo preventivo: Si hay empleados, no mostrar confirmación
        if (profile.employee_count > 0) {
            setStatusModal({
                type: 'error',
                title: 'Acción Restringida',
                message: `Este perfil tiene ${profile.employee_count} colaborador(es) activo(s). Debe reasignarlos o desactivarlos antes de eliminar el perfil.`
            });
            return;
        }

        setStatusModal({
            type: 'confirm',
            title: 'Protocolo de Eliminación',
            message: `¿Está seguro de que desea eliminar el perfil "${profile.name}"? Esta acción es irreversible.`,
            onConfirm: async () => {
                try {
                    const resp = await fetch(`${API_BASE}/security/profiles/${profile.id}`, {
                        method: 'DELETE'
                    });

                    if (resp.ok) {
                        await fetchProfiles();
                        if (selectedProfile?.id === profile.id) {
                            setSelectedProfile(null);
                        }
                        setStatusModal({
                            type: 'success',
                            title: 'Perfil Eliminado',
                            message: 'El perfil ha sido purgado del sistema correctamente.'
                        });
                    } else {
                        const errorData = await resp.json();
                        setStatusModal({
                            type: 'error',
                            title: 'Acceso Denegado',
                            message: errorData.detail || "No se pudo eliminar el perfil"
                        });
                    }
                } catch (error) {
                    console.error("Delete error:", error);
                    setStatusModal({
                        type: 'error',
                        title: 'Error de Sistema',
                        message: 'Fallo crítico al intentar eliminar el perfil.'
                    });
                }
            }
        });
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-12 animate-in fade-in duration-500">
            {/* Overlay con desenfoque profundo */}
            <div className="absolute inset-0 bg-black/80 backdrop-blur-[40px]" onClick={onClose}></div>

            {/* Contenedor Principal de la Suite - Ultra Compact v4.2 - Jerarquía Corregida */}
            <div 
                className="relative w-full max-w-4xl bg-[#0a0a0a]/95 border border-white/10 rounded-[30px] shadow-[0_50px_100px_-20px_rgba(0,0,0,1)] overflow-hidden flex flex-col animate-in zoom-in-95 duration-700"
                style={{ 
                    height: 'auto',
                    maxHeight: '85vh',
                }}
            >
                {/* Header Global Superior */}
                <header className="px-8 py-5 border-b border-white/5 bg-black/50 flex justify-between items-center">
                    <div>
                        <h1 className="text-2xl font-black uppercase italic tracking-tighter text-white">
                            GESTOR DE <span className="text-[#c1d72e]">PERFILES</span>
                        </h1>
                        <p className="text-[8px] font-black text-white/20 uppercase tracking-[0.5em] mt-1">Configuración Imperial de Accesos</p>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="h-8 w-[1px] bg-white/10"></div>
                        <button
                            onClick={onClose}
                            className="w-8 h-8 rounded-full border border-white/10 flex items-center justify-center hover:bg-red-500 hover:text-white transition-all text-xs"
                        >
                            ✕
                        </button>
                    </div>
                </header>

                <div className="flex flex-1 overflow-hidden">
                    {/* Panel Lateral: Selección de Perfiles - Compacto */}
                    <aside className="w-56 border-r border-white/5 flex flex-col p-5 bg-black/40">
                        <div className="mb-6">
                            <h2 className="text-xs font-black uppercase italic tracking-widest text-[#c1d72e]">PERFILES</h2>
                            <div className="h-[2px] w-6 bg-[#c1d72e] mt-1 shadow-[0_0_10px_#c1d72e]"></div>
                        </div>

                    <div className="flex-1 space-y-1.5 overflow-y-auto pr-2 custom-scrollbar">
                        {profiles.map(p => (
                            <button
                                key={p.id}
                                onClick={() => handleSelectProfile(p)}
                                className={`w-full text-left p-3 rounded-xl transition-all duration-300 group relative overflow-hidden border ${selectedProfile?.id === p.id ? 'bg-[#f97316] border-[#f97316] shadow-[0_10px_30px_-10px_rgba(249,115,22,0.6)]' : 'bg-transparent border-transparent text-gray-500 hover:bg-white/5 hover:text-white/40'}`}
                            >
                                <div className="flex justify-between items-center relative z-10 transition-colors">
                                    <div className="flex flex-col">
                                        <span className={`font-black uppercase tracking-widest text-[13px] ${selectedProfile?.id === p.id ? 'text-white' : ''}`}>{p.name}</span>
                                        {p.is_system && (
                                            <span className={`text-[8px] font-black px-1.5 py-0.5 rounded-full border mt-1 w-fit ${selectedProfile?.id === p.id ? 'border-white/40 text-white bg-black/10' : 'border-white/5 bg-white/5 opacity-30'}`}>SISTEMA</span>
                                        )}
                                    </div>
                                    {!p.is_system && (
                                        <button 
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDeleteProfile(p);
                                            }}
                                            className="opacity-0 group-hover:opacity-100 p-2 hover:bg-black/20 rounded-full transition-all text-white/40 hover:text-red-500"
                                            title="Eliminar Perfil"
                                        >
                                            <span className="text-xs">✕</span>
                                        </button>
                                    )}
                                </div>
                            </button>
                        ))}

                        <button 
                            onClick={handleCreateNew}
                            className="w-full p-4 rounded-[20px] border border-dashed border-white/10 text-white/40 hover:border-[#c1d72e] hover:text-[#c1d72e] transition-all flex items-center justify-center gap-2 group italic font-black uppercase tracking-widest text-[11px]"
                        >
                            <span className="text-lg group-hover:scale-125 transition-transform">+</span> Nuevo Perfil
                        </button>
                    </div>
                </aside>

                    {/* Área Principal: Matriz de Permisos */}
                    <main className="flex-1 flex flex-col p-6 bg-black/10 overflow-hidden">
                        <header className="flex justify-between items-center mb-6">
                            <div className="flex-1">
                                <span className="text-[7px] font-black text-white/20 uppercase tracking-[0.4em] mb-1 block">Configurando</span>
                                <input 
                                    value={editData.name}
                                    onChange={(e) => setEditData({...editData, name: e.target.value})}
                                    disabled={selectedProfile?.is_system}
                                    className="bg-transparent text-xl font-black uppercase italic tracking-tighter text-white outline-none focus:text-[#c1d72e] transition-colors disabled:opacity-50 w-full"
                                    placeholder="Nombre del Perfil"
                                />
                                <div className="flex items-center gap-2 mt-1">
                                    <div className="w-1 h-1 rounded-full bg-[#c1d72e] animate-pulse"></div>
                                    <p className="text-[9px] text-white/30 font-bold uppercase tracking-widest">Panel de Privilegios Granulares</p>
                                </div>
                            </div>
                        </header>

                    {/* Matriz de Permisos */}
                    <div className="flex-1 overflow-y-auto pr-3 custom-scrollbar">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-white/20 font-black uppercase tracking-[0.3em] text-[8px]">Módulos del Sistema</h3>
                            <span className="text-[7px] font-black text-[#c1d72e] bg-[#c1d72e]/10 px-2 py-0.5 rounded-full uppercase tracking-widest">Control IA</span>
                        </div>

                        {/* Master Access Switch - AGREGADO PARA TOTAL TRANSPARENCIA */}
                        <div 
                            onClick={() => handleTogglePermission('all')}
                            className={`p-6 mb-4 rounded-[32px] border-2 transition-all duration-700 cursor-pointer group flex items-center justify-between ${editData.permissions.all === 'full' ? 'bg-[#f97316]/5 border-[#f97316]/40 shadow-[0_0_50px_-10px_rgba(249,115,22,0.2)]' : 'bg-white/[0.01] border-white/5 opacity-40 hover:opacity-100 hover:border-white/20'}`}
                        >
                            <div className="flex items-center gap-4">
                                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl transition-all duration-700 border-2 ${editData.permissions.all === 'full' ? 'bg-[#f97316] text-white border-[#f97316] shadow-[0_0_20px_#f97316] rotate-3' : 'bg-black/40 text-white/20 border-white/5 group-hover:rotate-6'}`}>
                                    🛡️
                                </div>
                                <div>
                                    <p className={`font-black uppercase tracking-[0.2em] text-[13px] transition-colors ${editData.permissions.all === 'full' ? 'text-white' : 'text-gray-500 group-hover:text-white'}`}>ADMINISTRADOR TOTAL (Master Access)</p>
                                    <p className="text-[9px] font-bold text-[#f97316]/60 uppercase tracking-tighter mt-1">Habilita acceso absoluto a todas las funciones sin restricciones</p>
                                </div>
                            </div>
                            <div className={`w-10 h-5 rounded-full p-1 transition-all duration-500 shrink-0 ${editData.permissions.all === 'full' ? 'bg-[#f97316]' : 'bg-white/10'}`}>
                                <div className={`w-3 h-3 bg-white rounded-full shadow-lg transition-transform duration-500 ${editData.permissions.all === 'full' ? 'translate-x-5' : 'translate-x-0'}`}></div>
                            </div>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-2.5">
                            {SYSTEM_MODULES.map(module => (
                                <div 
                                    key={module.id}
                                    onClick={() => handleTogglePermission(module.id)}
                                    className={`p-4 rounded-3xl border transition-all duration-500 cursor-pointer group flex items-center justify-between ${isModuleActive(module.id) ? 'bg-white/[0.04] border-white/20 shadow-[0_10px_40px_-10px_rgba(255,255,255,0.05)]' : 'bg-white/[0.01] border-white/5 opacity-30 hover:opacity-100 hover:border-white/10'}`}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-lg transition-all duration-500 border ${isModuleActive(module.id) ? 'bg-[#c1d72e] text-black border-[#c1d72e] shadow-xl rotate-2' : 'bg-black/40 text-white/20 border-white/5 group-hover:rotate-6'}`}>
                                            {module.icon}
                                        </div>
                                        <div>
                                            <p className={`font-black uppercase tracking-widest text-[10px] transition-colors ${isModuleActive(module.id) ? 'text-white' : 'text-white/20 group-hover:text-white/40'}`}>{module.name}</p>
                                            <p className="text-[8px] font-bold text-white/10 uppercase tracking-tighter mt-0.5">Acceso {(isModuleActive(module.id) ? 'FULL' : 'Nulo').toUpperCase()}</p>
                                        </div>
                                    </div>
                                    
                                    {/* Switch Premium Refinado */}
                                    <div className={`w-7 h-3.5 rounded-full p-0.5 transition-all duration-500 shrink-0 ${isModuleActive(module.id) ? 'bg-[#c1d72e]' : 'bg-white/10'}`}>
                                        <div className={`w-2.5 h-2.5 bg-white rounded-full shadow-lg transition-transform duration-500 ${isModuleActive(module.id) ? 'translate-x-3.5' : 'translate-x-0'}`}></div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Footer de Acciones - Compacto */}
                    <footer className="mt-6 flex justify-end gap-4 border-t border-white/5 pt-4">
                        <button
                            onClick={onClose}
                            className="px-6 py-2 border border-white/10 text-white/40 font-black uppercase tracking-[0.2em] text-[8px] rounded-full hover:bg-white/5"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="px-8 py-2 bg-[#c1d72e] text-black font-black uppercase tracking-[0.2em] text-[8px] rounded-full hover:scale-105 active:scale-95 transition-all shadow-xl shadow-[#c1d72e]/20 disabled:opacity-50"
                        >
                            {saving ? 'Guardando...' : 'Aplicar Cambios'}
                        </button>
                    </footer>
                </main>
            </div>

            {/* Input Prompt Modal Premium */}
            {promptModal?.isOpen && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 animate-in fade-in duration-300">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={() => setPromptModal(null)}></div>
                    <div className="relative bg-[#0a0a0a] border border-white/10 p-8 rounded-[30px] shadow-2xl max-w-sm w-full animate-in zoom-in-95 duration-500">
                        <h2 className="text-xl font-black uppercase italic tracking-tighter text-white mb-2">Nuevo Perfil</h2>
                        <p className="text-[10px] text-white/40 uppercase tracking-widest mb-6">Ingrese el nombre del nuevo perfil de seguridad</p>
                        
                        <input
                            type="text"
                            autoFocus
                            value={promptModal.value}
                            onChange={(e) => setPromptModal({ ...promptModal, value: e.target.value })}
                            onKeyDown={(e) => { if (e.key === 'Enter') confirmCreateNew(promptModal.value); if (e.key === 'Escape') setPromptModal(null); }}
                            className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white uppercase font-bold tracking-widest outline-none focus:border-[#c1d72e] transition-colors mb-8"
                            placeholder="EJ: SUPERVISOR"
                        />
                        
                        <div className="flex gap-3 justify-end">
                            <button 
                                onClick={() => setPromptModal(null)}
                                className="px-6 py-2 rounded-full border border-white/10 text-white/40 font-black uppercase tracking-widest text-[9px] hover:bg-white/5 transition-all"
                            >
                                Cancelar
                            </button>
                            <button 
                                onClick={() => confirmCreateNew(promptModal.value)}
                                className="px-8 py-2 rounded-full bg-[#c1d72e] text-black font-black uppercase tracking-widest text-[9px] hover:scale-105 transition-all shadow-lg shadow-[#c1d72e]/20"
                            >
                                Crear
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Status Modal Premium */}
            {statusModal && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 animate-in fade-in duration-300">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={() => setStatusModal(null)}></div>
                    <div className="relative bg-[#0a0a0a] border border-white/10 p-8 rounded-[30px] shadow-2xl max-w-sm w-full text-center animate-in zoom-in-95 duration-500">
                        <div className={`w-16 h-16 rounded-2xl mx-auto mb-6 flex items-center justify-center text-3xl border ${
                            statusModal.type === 'success' ? 'bg-[#c1d72e]/20 border-[#c1d72e] text-[#c1d72e]' :
                            statusModal.type === 'error' ? 'bg-red-500/20 border-red-500 text-red-500' :
                            'bg-orange-500/20 border-orange-500 text-orange-500'
                        }`}>
                            {statusModal.type === 'success' ? '✓' : statusModal.type === 'error' ? '✕' : '⚠'}
                        </div>
                        <h2 className="text-xl font-black uppercase italic tracking-tighter text-white mb-2">{statusModal.title}</h2>
                        <p className="text-xs text-white/60 font-medium leading-relaxed mb-8">{statusModal.message}</p>
                        
                        <div className="flex gap-3 justify-center">
                            {statusModal.type === 'confirm' ? (
                                <>
                                    <button 
                                        onClick={() => setStatusModal(null)}
                                        className="px-6 py-2 rounded-full border border-white/10 text-white/40 font-black uppercase tracking-widest text-[9px] hover:bg-white/5 transition-all"
                                    >
                                        Cancelar
                                    </button>
                                    <button 
                                        onClick={() => {
                                            statusModal.onConfirm();
                                            // El modal se cierra tras la acción o se actualiza
                                        }}
                                        className="px-8 py-2 rounded-full bg-red-500 text-white font-black uppercase tracking-widest text-[9px] hover:scale-105 transition-all shadow-lg shadow-red-500/20"
                                    >
                                        Confirmar
                                    </button>
                                </>
                            ) : (
                                <button 
                                    onClick={() => setStatusModal(null)}
                                    className="px-10 py-2 rounded-full bg-[#c1d72e] text-black font-black uppercase tracking-widest text-[9px] hover:scale-105 transition-all shadow-lg shadow-[#c1d72e]/20"
                                >
                                    Entendido
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <style>{`
                .custom-scrollbar::-webkit-scrollbar { width: 4px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #333; border-radius: 10px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #c1d72e; }
                
                @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
                @keyframes zoom-in-95 { from { transform: scale(0.95); opacity: 0; } to { transform: scale(1); opacity: 1; } }
            `}</style>
        </div>
    </div>
);
};
