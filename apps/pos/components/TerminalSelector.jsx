import React, { useState, useEffect, useCallback } from 'react';
import { terminals, loadTerminalsConfig, saveTerminalsConfig } from '../utils/posConstants';
import { posService } from '../services/POSService';
import { resolveCardState } from '../utils/terminalCardState';
import { parseUtc } from '../../shared/timezone';

const PRESET_ICONS = [
    { label: 'Monitor', value: '🖥️' },
    { label: 'Caja', value: '/assets/pos_register.png' },
    { label: 'Laptop', value: '💻' },
    { label: 'Tablet', value: '📱' },
    { label: 'Servidor', value: '🖧' },
    { label: 'Impresora', value: '🖨️' },
];

const renderIcon = (icon) => {
    if (!icon) return <span className="text-4xl">🖥️</span>;
    if (icon.endsWith('.png') || icon.startsWith('data:'))
        return <img src={icon} alt="" className="w-16 h-16 object-contain" />;
    return <span className="text-4xl">{icon}</span>;
};

export const TerminalSelector = ({ currentUser, terminalStatuses, setTerminalStatuses, onTerminalSelected, assignedTerminal }) => {
    const [unlockingTerminal, setUnlockingTerminal] = useState(null);
    const [deniedModal, setDeniedModal] = useState(null);
    const [showManager, setShowManager] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(null);
    const [terminalList, setTerminalList] = useState(terminals);
    const [editingId, setEditingId] = useState(null);
    const [editName, setEditName] = useState('');
    const [editIcon, setEditIcon] = useState('');
    const [saving, setSaving] = useState(false);

    const userRole = (currentUser?.role || '').toUpperCase();
    const isAdmin = userRole === 'ADMIN';
    const isManager = userRole === 'MANAGER';
    const canAccessAny = isAdmin || currentUser?.permissions?.access_any_terminal === 'full';
    const canManage = isAdmin || currentUser?.permissions?.access_terminal_manager === 'full';

    // Estado de red por terminal (misma lógica que el Monitor de Red)
    const getNetStatus = useCallback((tid) => {
        const info = terminalStatuses[tid];
        if (!info || !info.occupier_id) return { color: '#555', label: 'DISPONIBLE' }; // gris
        if (info.stale_session) return { color: '#ef4444', label: 'SESIÓN EXPIRADA' }; // rojo
        // v20 (Fase 20.2): parseUtc normaliza el timestamp UTC naive del backend
        // (agrega 'Z' si falta) de forma centralizada y robusta.
        const safeDate = parseUtc(info.locked_at);
        const lockAge = info.locked_at ? (Date.now() - safeDate.getTime()) / 60000 : 999;
        if (lockAge < 25) return { color: '#4ade80', label: 'EN LÍNEA' }; // verde
        return { color: '#f59e0b', label: 'INACTIVA' }; // amarillo
    }, [terminalStatuses]);

    useEffect(() => {
        loadTerminalsConfig().then(c => setTerminalList([...c]));
    }, []);

    const isTerminalEnabled = useCallback((tid) => {
        if (!assignedTerminal) return true;
        if (canAccessAny) return true;
        return tid === assignedTerminal;
    }, [assignedTerminal, canAccessAny]);

    const copyUrl = (tid) => {
        const url = `http://${window.location.hostname}:${window.location.port}/?terminal=${tid}`;
        const ta = document.createElement('textarea');
        ta.value = url;
        ta.style.cssText = 'position:fixed;opacity:0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        setDeniedModal({ title: '✅ URL COPIADA', message: `${url}\n\nPega esta URL en el acceso directo de la máquina.` });
    };

    const startEdit = (t) => { setEditingId(t.id); setEditName(t.name); setEditIcon(t.icon); };
    const cancelEdit = () => { setEditingId(null); setEditName(''); setEditIcon(''); };

    const applyEdit = () => {
        setTerminalList(prev => prev.map(t => t.id === editingId ? { ...t, name: editName, icon: editIcon } : t));
        cancelEdit();
    };

    const addTerminal = (position = 'end') => {
        const nums = terminalList.filter(t => t.id.startsWith('T')).map(t => parseInt(t.id.replace('T','')) || 0);
        const nextNum = (nums.length > 0 ? Math.max(...nums) : 0) + 1;
        const newT = { id: `T${nextNum}`, name: `Terminal ${nextNum}`, icon: '🖥️' };
        setTerminalList(prev => position === 'start' ? [newT, ...prev] : [...prev, newT]);
    };

    const removeTerminal = (tid) => {
        // Protección: no eliminar terminal ocupada
        if (terminalStatuses[tid]?.occupier_id) {
            setDeniedModal({ title: '🔒 TERMINAL OCUPADA', message: `La terminal ${tid} está siendo usada por ${terminalStatuses[tid].occupier_name}.\n\nDebes esperar a que se desocupe antes de eliminarla.` });
            return;
        }
        // Protección: no eliminar tu propia terminal asignada
        if (assignedTerminal === tid) {
            setDeniedModal({ title: '⚠️ TU TERMINAL', message: `No puedes eliminar ${tid} porque es la terminal asignada a esta máquina.` });
            return;
        }
        setConfirmDelete(tid);
    };

    const executeDelete = () => {
        setTerminalList(prev => prev.filter(t => t.id !== confirmDelete));
        setConfirmDelete(null);
    };

    const handleSave = async () => {
        setSaving(true);
        const ok = await saveTerminalsConfig(terminalList);
        setSaving(false);
        if (ok) {
            setDeniedModal({ title: '✅ GUARDADO', message: 'La configuración de terminales se actualizó correctamente.' });
        } else {
            setDeniedModal({ title: '❌ ERROR', message: 'No se pudo guardar la configuración.' });
        }
    };

    const handleImageUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => setEditIcon(ev.target.result);
        reader.readAsDataURL(file);
    };



    // ==================== GESTOR WYSIWYG ====================
    if (showManager) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center p-10 animate-in fade-in zoom-in-95 duration-700">
                <div className="text-center mb-10">
                    <h3 className="text-orange-500 font-black uppercase tracking-[0.5em] text-xs mb-4">Administración</h3>
                    <h2 className="text-5xl font-black uppercase tracking-tighter italic">Gestor de <span className="text-white/20">Terminales</span></h2>
                </div>

                <div className="flex gap-4 max-w-7xl w-full items-start">
                    {/* Botón agregar izquierda */}
                    <button onClick={() => addTerminal('start')} className="shrink-0 w-20 rounded-[40px] border-2 border-dashed border-white/10 flex flex-col items-center justify-center py-16 hover:border-orange-500/40 hover:bg-orange-600/5 transition-all group" title="Agregar al inicio">
                        <span className="text-3xl group-hover:scale-125 transition-transform">+</span>
                        <span className="text-[7px] font-black uppercase tracking-widest text-gray-600 group-hover:text-orange-400 mt-2">Izq</span>
                    </button>

                    <div className="grid grid-cols-3 md:grid-cols-6 gap-8 flex-1">
                    {terminalList.map(t => {
                        const isEditing = editingId === t.id;
                        const status = terminalStatuses[t.id];
                        const isOccupied = !!status?.occupier_id;

                        return (
                            <div key={t.id} className="relative group">
                                {/* Card idéntica al selector */}
                                <div className={`transition-all duration-500 rounded-[40px] border flex flex-col items-center p-10 gap-6 shadow-2xl overflow-hidden ${isEditing ? 'bg-orange-600/10 border-orange-500/40' : 'bg-black/20 border-white/5'}`}>
                                    <div className="w-24 h-24 flex items-center justify-center bg-white/5 rounded-3xl">
                                        {renderIcon(isEditing ? editIcon : t.icon)}
                                    </div>
                                    <div className="text-center">
                                        {isEditing ? (
                                            <input
                                                value={editName}
                                                onChange={e => setEditName(e.target.value)}
                                                className="bg-transparent text-center text-xl font-black italic uppercase outline-none border-b border-orange-500 text-white w-full"
                                                autoFocus
                                            />
                                        ) : (
                                            <span className="block text-2xl font-black italic uppercase">
                                                {t.name === 'CAJA' ? 'CAJA' : (t.name.includes(' ') ? t.name.split(' ').pop() : t.name)}
                                            </span>
                                        )}
                                        <span className="text-[8px] font-bold text-gray-500 uppercase tracking-widest">
                                            ID: {t.id}
                                        </span>
                                    </div>
                                </div>

                                {/* Controles de edición (overlay) */}
                                {!isEditing ? (
                                    <div className="absolute inset-0 rounded-[40px] bg-black/70 opacity-0 group-hover:opacity-100 transition-all duration-300 flex flex-col items-center justify-center gap-2 backdrop-blur-sm">
                                        <button onClick={() => startEdit(t)} className="px-4 py-2 rounded-xl bg-orange-600 text-[9px] font-black uppercase tracking-widest text-white hover:scale-105 transition-all w-28">
                                            ✏️ Editar
                                        </button>
                                        <button onClick={() => copyUrl(t.id)} className="px-4 py-2 rounded-xl bg-white/10 text-[9px] font-black uppercase tracking-widest hover:bg-white/20 transition-all w-28">
                                            📋 Copiar URL
                                        </button>
                                        <button onClick={() => removeTerminal(t.id)} className="px-4 py-2 rounded-xl bg-red-600/20 text-red-400 text-[9px] font-black uppercase tracking-widest hover:bg-red-600 hover:text-white transition-all w-28">
                                            🗑 Eliminar
                                        </button>
                                        {isOccupied && (
                                            <span className="text-[8px] text-red-400 font-black mt-1">🔒 {status.occupier_name}</span>
                                        )}
                                    </div>
                                ) : (
                                    <div className="mt-3 space-y-2">
                                        <div className="flex flex-wrap gap-1 justify-center">
                                            {PRESET_ICONS.map(pi => (
                                                <button key={pi.label} onClick={() => setEditIcon(pi.value)}
                                                    className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm border transition-all ${editIcon === pi.value ? 'border-orange-500 bg-orange-600/20' : 'border-white/10 bg-black/30 hover:border-white/30'}`}
                                                    title={pi.label}>
                                                    {pi.value.endsWith('.png') ? <img src={pi.value} className="w-5 h-5" /> : pi.value}
                                                </button>
                                            ))}
                                            <label className="w-8 h-8 rounded-lg flex items-center justify-center text-sm border border-dashed border-white/20 bg-black/30 hover:border-orange-500 cursor-pointer transition-all" title="Subir imagen">
                                                📁
                                                <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                                            </label>
                                        </div>
                                        <div className="flex gap-1 justify-center">
                                            <button onClick={applyEdit} className="px-3 py-1.5 rounded-lg bg-green-600 text-[8px] font-black uppercase text-white">✓</button>
                                            <button onClick={cancelEdit} className="px-3 py-1.5 rounded-lg bg-white/10 text-[8px] font-black uppercase">✕</button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}

                    </div>

                    {/* Botón agregar derecha */}
                    <button onClick={() => addTerminal('end')} className="shrink-0 w-20 rounded-[40px] border-2 border-dashed border-white/10 flex flex-col items-center justify-center py-16 hover:border-orange-500/40 hover:bg-orange-600/5 transition-all group" title="Agregar al final">
                        <span className="text-3xl group-hover:scale-125 transition-transform">+</span>
                        <span className="text-[7px] font-black uppercase tracking-widest text-gray-600 group-hover:text-orange-400 mt-2">Der</span>
                    </button>
                </div>

                {/* Acciones */}
                <div className="flex gap-4 mt-10">
                    <button onClick={() => { setShowManager(false); setEditingId(null); }} className="px-8 py-3 rounded-2xl bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest hover:bg-white/10 transition-all">
                        ← Volver
                    </button>
                    <button onClick={handleSave} disabled={saving} className="px-8 py-3 rounded-2xl bg-orange-600 border border-orange-500 text-[10px] font-black uppercase tracking-widest text-white hover:scale-105 active:scale-95 transition-all shadow-xl shadow-orange-600/20 disabled:opacity-50">
                        {saving ? 'Guardando...' : '💾 Guardar Cambios'}
                    </button>
                </div>

                {deniedModal && (
                    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100]">
                        <div className="bg-gray-900 border border-white/10 p-8 rounded-[40px] max-w-sm w-full text-center">
                            <h2 className="text-xl font-black uppercase text-white mb-3">{deniedModal.title}</h2>
                            <p className="text-xs font-bold text-gray-400 mb-6 whitespace-pre-wrap">{deniedModal.message}</p>
                            <button onClick={() => setDeniedModal(null)} className="w-full py-3 rounded-2xl bg-orange-600/20 hover:bg-orange-600 border border-orange-500/30 font-black uppercase text-[10px] tracking-widest text-white transition-all">ENTENDIDO</button>
                        </div>
                    </div>
                )}

                {confirmDelete && (
                    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100] animate-in fade-in duration-300">
                        <div className="bg-gray-900 border border-white/10 p-8 rounded-[40px] shadow-[0_0_50px_rgba(255,0,0,0.2)] max-w-sm w-full text-center relative overflow-hidden">
                            <div className="absolute -top-20 -left-20 w-40 h-40 bg-red-600/20 rounded-full"></div>
                            <div className="text-6xl mb-4 relative z-10">⚠️</div>
                            <h2 className="text-xl font-black uppercase text-red-500 mb-2 relative z-10">ELIMINAR TERMINAL</h2>
                            <p className="text-sm font-bold text-gray-400 mb-2 relative z-10">
                                ¿Estás seguro de eliminar la terminal <span className="text-orange-400 font-black">{confirmDelete}</span>?
                            </p>
                            <p className="text-[10px] text-gray-600 mb-6 relative z-10">
                                Esta acción solo elimina la terminal del selector.<br/>
                                Los tickets y cortes de caja existentes <span className="text-green-400">NO se afectan</span>.
                            </p>
                            <div className="flex gap-4 relative z-10">
                                <button onClick={() => setConfirmDelete(null)} className="flex-1 py-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/5 font-bold uppercase text-[10px] tracking-widest transition-all">
                                    Cancelar
                                </button>
                                <button onClick={executeDelete} className="flex-1 py-3 rounded-2xl bg-red-600/80 hover:bg-red-500 border border-red-500/50 font-black uppercase text-[10px] tracking-widest text-white shadow-lg transition-all">
                                    SÍ, ELIMINAR
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    // ==================== SELECTOR NORMAL ====================
    return (
        <div className="flex-1 flex flex-col items-center justify-center p-20 animate-in fade-in zoom-in-95 duration-700 relative">
            {canManage && (
                <button onClick={() => setShowManager(true)}
                    className="absolute top-6 right-6 px-6 py-3 rounded-2xl bg-orange-600 border border-orange-500 text-[11px] font-black uppercase tracking-widest text-white hover:scale-105 hover:shadow-xl hover:shadow-orange-600/30 transition-all shadow-lg">
                    ⚙ GESTOR DE TERMINALES
                </button>
            )}
            <div className="text-center mb-16">
                <h3 className="text-orange-500 font-black uppercase tracking-[0.5em] text-xs mb-4">Configuracion de Estacion</h3>
                <h2 className="text-6xl font-black uppercase tracking-tighter italic">Selecciona tu <span className="text-white/20">Terminal</span></h2>
            </div>
            <div className="grid grid-cols-3 md:grid-cols-6 gap-8 max-w-7xl w-full">
                {terminalList.map(t => {
                    const isOccupied = terminalStatuses[t.id];
                    // v12 (Fase 12.1): clasificacion pura con TRES estados.
                    // Antes: isMine=true caia en el else y se pintaba como LIBRE.
                    const cardState = resolveCardState(isOccupied, currentUser?.id);
                    const isMine = cardState === 'mine';
                    const lockedByOther = cardState === 'occupied';
                    const enabled = isTerminalEnabled(t.id);

                    return (
                        <button key={t.id} disabled={!enabled && !lockedByOther}
                            onClick={async () => {
                                if (!enabled) return;
                                // v12 (Fase 12.1): si la terminal ya es MIA, re-entrar
                                // sin re-lockear (respeta la regla anti-ping-pong).
                                if (isMine) {
                                    onTerminalSelected(t.id);
                                    return;
                                }
                                if (lockedByOther) {
                                    const role = (currentUser?.role || '').toUpperCase();
                                    const hasUnlock = currentUser?.permissions?.pos_force_unlock === 'full' || currentUser?.permissions?.pos_force_unlock === true;
                                    const isCash = t.id === 'CAJA' || isOccupied.is_cash_register === true;
                                    const hasCashForce = currentUser?.permissions?.pos_force_cash_unlock === 'full' || currentUser?.permissions?.pos_force_cash_unlock === true;
                                    if (isCash && !hasCashForce) {
                                        setDeniedModal({ title: "SEGURIDAD FINANCIERA", message: "CAJA activa. Desbloqueo RESTRINGIDO." });
                                        return;
                                    }
                                    if (role === 'ADMIN' || hasUnlock || (isCash && hasCashForce)) {
                                        setUnlockingTerminal({ id: t.id, occupier: isOccupied.occupier_name, is_cash: isOccupied.is_cash_register });
                                    } else {
                                        setDeniedModal({ title: "PERMISOS INSUFICIENTES", message: `Ocupada por ${isOccupied.occupier_name}.\nSolicita apoyo de tu Gerente.` });
                                    }
                                    return;
                                }
                                try {
                                    await posService.lockTerminal(t.id, currentUser.id, currentUser.name);
                                    onTerminalSelected(t.id);
                                } catch (e) { setDeniedModal({ title: "ERROR", message: e.message }); }
                            }}
                            className={`group relative transition-all duration-500 rounded-[40px] border flex flex-col items-center shadow-2xl overflow-hidden
                            ${!enabled && !lockedByOther && !isMine ? 'opacity-25 cursor-not-allowed p-10 gap-6 bg-black/20 border-white/5 grayscale'
                                : lockedByOther ? 'cursor-not-allowed border-red-500/60 bg-[#1a0808]'
                                : isMine ? 'cursor-pointer border-amber-500/60 bg-[#1a1408] hover:border-amber-400 hover:scale-105'
                                : `p-10 gap-6 bg-black/20 hover:bg-orange-600 border-white/5 hover:border-orange-400 hover:scale-110 ${assignedTerminal === t.id ? 'ring-2 ring-orange-500/50' : ''}`}`}>
                            {isMine ? (
                                <div className="w-full flex flex-col relative">
                                    <div className="bg-amber-900/60 px-4 py-2 flex items-center justify-between">
                                        <span className="text-white font-black text-sm uppercase tracking-widest">{t.id}</span>
                                        <span className="text-[9px] font-black uppercase tracking-wider bg-amber-500 text-black px-2 py-0.5 rounded-full">
                                            TU SESIÓN
                                        </span>
                                    </div>
                                    <div className="px-4 py-5 flex flex-col items-center gap-3">
                                        <span className="text-5xl">🔑</span>
                                        <div className="text-center">
                                            <p className="text-[10px] font-bold uppercase tracking-widest text-amber-400 mb-1">Sesión activa</p>
                                            <p className="text-white font-black text-base uppercase leading-tight">{isOccupied.occupier_name}</p>
                                        </div>
                                    </div>
                                    {/* Circulito estado LAN — inferior derecha */}
                                    {(() => { const ns = getNetStatus(t.id); return (
                                        <div className="absolute bottom-2 right-3 flex items-center gap-1.5" title={ns.label}>
                                            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: ns.color, boxShadow: `0 0 6px ${ns.color}` }}></span>
                                            <span className="text-[7px] font-black uppercase tracking-wider" style={{ color: ns.color }}>{ns.label}</span>
                                        </div>
                                    ); })()}
                                </div>
                            ) : lockedByOther ? (
                                <div className="w-full flex flex-col relative">
                                    <div className="bg-red-900/60 px-4 py-2 flex items-center justify-between">
                                        <span className="text-white font-black text-sm uppercase tracking-widest">{t.id}</span>
                                        <span className="text-[9px] font-black uppercase tracking-wider bg-red-600 text-white px-2 py-0.5 rounded-full">
                                            {isOccupied.is_cash_register ? 'EN CAJA' : 'OCUPADA'}
                                        </span>
                                    </div>
                                    <div className="px-4 py-5 flex flex-col items-center gap-3">
                                        <span className="text-5xl">🔒</span>
                                        <div className="text-center">
                                            <p className="text-[10px] font-bold uppercase tracking-widest text-red-400 mb-1">En uso por</p>
                                            <p className="text-white font-black text-base uppercase leading-tight">{isOccupied.occupier_name}</p>
                                        </div>
                                    </div>
                                    {/* Circulito estado LAN — inferior derecha */}
                                    {(() => { const ns = getNetStatus(t.id); return (
                                        <div className="absolute bottom-2 right-3 flex items-center gap-1.5" title={ns.label}>
                                            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: ns.color, boxShadow: `0 0 6px ${ns.color}` }}></span>
                                            <span className="text-[7px] font-black uppercase tracking-wider" style={{ color: ns.color }}>{ns.label}</span>
                                        </div>
                                    ); })()}
                                </div>
                            ) : (
                                <>
                                    <div className="w-24 h-24 flex items-center justify-center bg-white/5 group-hover:bg-white/20 rounded-3xl transition-colors">
                                        {renderIcon(t.icon)}
                                    </div>
                                    <div className="text-center">
                                        <span className="block text-2xl font-black italic uppercase group-hover:text-white transition-colors">
                                            {t.name === 'CAJA' ? 'CAJA' : (t.name.includes(' ') ? t.name.split(' ').pop() : t.name)}
                                        </span>
                                        <span className="text-[8px] font-bold text-gray-500 uppercase tracking-widest group-hover:text-orange-200">
                                            {t.id === 'CAJA' ? 'Cajero Central' : 'Punto de Venta'}
                                        </span>
                                    </div>
                                </>
                            )}
                        </button>
                    );
                })}
            </div>


            {unlockingTerminal && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100]">
                    <div className="bg-gray-900 border border-white/10 p-8 rounded-[40px] max-w-sm w-full text-center relative overflow-hidden">
                        <div className="absolute -top-20 -left-20 w-40 h-40 bg-red-600/20 rounded-full"></div>
                        <div className="text-6xl mb-4 relative z-10">⚠️</div>
                        <h2 className="text-xl font-black uppercase text-white mb-2 relative z-10">FORZAR LIBERACION</h2>
                        <p className="text-sm font-bold text-gray-400 mb-6 relative z-10">
                            Ocupada por <span className="text-orange-400">{unlockingTerminal.occupier}</span>.<br/><br/>¿Forzar liberación?
                        </p>
                        <div className="flex gap-4 relative z-10">
                            <button onClick={() => setUnlockingTerminal(null)} className="flex-1 py-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/5 font-bold uppercase text-[10px] tracking-widest">Cancelar</button>
                            <button onClick={async () => {
                                try {
                                    await posService.forceUnlockTerminal(unlockingTerminal.id, currentUser.id, currentUser.name);
                                    const data = await posService.getTerminalsStatus();
                                    setTerminalStatuses(data);
                                    setUnlockingTerminal(null);
                                } catch(e) { console.error(e); }
                            }} className="flex-1 py-3 rounded-2xl bg-red-600/80 hover:bg-red-500 border border-red-500/50 font-black uppercase text-[10px] tracking-widest text-white shadow-lg">SÍ, FORZAR</button>
                        </div>
                    </div>
                </div>
            )}

            {deniedModal && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100]">
                    <div className="bg-gray-900 border border-white/10 p-8 rounded-[40px] max-w-sm w-full text-center relative overflow-hidden">
                        <div className="absolute -top-20 -left-20 w-40 h-40 bg-red-600/20 rounded-full"></div>
                        <h2 className="text-xl font-black uppercase text-red-500 mb-3 relative z-10">{deniedModal.title}</h2>
                        <p className="text-xs font-bold text-gray-400 mb-4 relative z-10 whitespace-pre-wrap">{deniedModal.message}</p>
                        <button onClick={() => setDeniedModal(null)} className="w-full py-4 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/5 font-black uppercase text-[10px] tracking-widest text-white relative z-10">ENTENDIDO</button>
                    </div>
                </div>
            )}
        </div>
    );
};
