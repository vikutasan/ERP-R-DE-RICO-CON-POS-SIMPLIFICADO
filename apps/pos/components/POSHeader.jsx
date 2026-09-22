import React from 'react';
import { CategoryBar } from './CategoryBar';

/**
 * POSHeader — Barra superior del POS extraída de RetailVisionPOS.jsx
 * 
 * Contiene 3 zonas:
 * - IZQUIERDA: Botón de terminal + indicador de red
 * - CENTRO: Estado de transacción + toggle Venta/Pedido + botón programación
 * - DERECHA: Botón Caja + botón Pizarrón con badge de guardado
 * + CategoryBar al fondo
 * 
 * REGLA: Solo presentación y callbacks. Cero lógica de negocio.
 */
export const POSHeader = ({
    // Datos
    selectedTerminal,
    currentUser,
    assignedTerminal,
    netStatus,
    netLatency,
    currentAccountNum,
    cartLength,
    orderType,
    orderData,
    isCashEnabled,
    visibleAccountsCount,
    lastSaveStatus,
    lastSaveTime,
    categories,
    activeCategory,
    viewMode,
    // Callbacks
    onTerminalSwitch,
    onOrderTypeChange,
    onOrderDataClear,
    onOpenProgramacion,
    onOpenGestorCaja,
    onOpenCorkboard,
    onCategoryChange,
    onViewModeChange,
    onPageChange,
    onOpenVoice,
    voiceAvailable = true,
}) => {
    const canSwitch = !assignedTerminal || currentUser?.role === 'ADMIN' || currentUser?.permissions?.access_any_terminal === 'full';

    return (
        <div className="p-4 pb-2 z-20">
            <div className="flex justify-between items-center mb-3">
                {/* IZQUIERDA: Terminal */}
                <div className="flex-shrink-0">
                    <button onClick={onTerminalSwitch} className={`bg-zinc-900/90 border border-white/5 px-6 py-2 rounded-xl flex items-center transition-all group shadow-2xl ${!canSwitch ? 'cursor-default' : 'hover:bg-zinc-800'}`}>
                        <div className="text-left">
                            <p className="text-[18px] font-black uppercase text-white tracking-widest leading-none mb-1">
                                {selectedTerminal === 'CAJA' ? 'Caja Central' : `Terminal ${selectedTerminal}`}
                            </p>
                            {canSwitch && (
                            <p className="text-[14px] font-black text-orange-500 uppercase tracking-tighter leading-none">
                                Cambiar Estación
                            </p>
                            )}
                            <p className={`text-[9px] font-black uppercase tracking-widest leading-none mt-1 flex items-center gap-1 ${netStatus === 'good' ? 'text-green-400' : netStatus === 'slow' ? 'text-yellow-400' : 'text-red-500'}`}>
                                <span className={`inline-block w-1.5 h-1.5 rounded-full ${netStatus === 'good' ? 'bg-green-400' : netStatus === 'slow' ? 'bg-yellow-400' : 'bg-red-500'}`}></span>
                                {netStatus === 'good' ? `RED OK` : netStatus === 'slow' ? 'RED LENTA' : 'SIN RED'}
                                {netStatus === 'good' && netLatency > 0 ? ` ${netLatency}ms` : ''}
                            </p>
                        </div>
                    </button>
                </div>

                {/* CENTRO: Cuenta + Toggle Tipo + Botón Programación */}
                <div className="flex items-center gap-3 flex-1 justify-center">
                    {/* Número de cuenta */}
                    <div className="bg-black border border-white/10 px-8 py-2 rounded-3xl shadow-2xl flex flex-col items-center">
                        <span className="text-[7px] font-black uppercase text-white tracking-[0.5em] mb-0.5">ESTADO DE TRANSACCION</span>
                        <span className={`text-4xl font-black uppercase tracking-tighter italic drop-shadow-[0_0_12px_rgba(193,215,46,0.4)] ${
                            currentAccountNum
                                ? orderData ? 'text-orange-400' : 'text-[#c1d72e]'
                                : 'text-orange-500'
                        }`}>
                            {currentAccountNum
                                ? `CTA ${currentAccountNum}`
                                : 'NUEVA VENTA'}
                        </span>
                        {/* v5.0 DRAFT: Badge BORRADOR cuando el ticket aún no se envía al pizarrón */}
                        {currentAccountNum && cartLength > 0 && !orderData && (
                            <span className="text-[8px] font-black text-amber-400 uppercase tracking-widest mt-0.5">📝 BORRADOR</span>
                        )}
                        {orderData && (
                            <span className="text-[8px] font-black text-orange-400 uppercase tracking-widest mt-0.5">📦 PEDIDO TENTATIVO</span>
                        )}
                    </div>

                    {/* Toggle: Venta Directa / Pedido */}
                    <div className="flex bg-black/60 border border-white/10 rounded-2xl p-1 gap-1">
                        <button
                            id="btn-venta-directa"
                            onClick={() => { onOrderTypeChange('VENTA_DIRECTA'); onOrderDataClear(); }}
                            className={`px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${
                                orderType === 'VENTA_DIRECTA'
                                    ? 'bg-[#c1d72e] text-black shadow-lg'
                                    : 'text-white/50 hover:text-white'
                            }`}
                        >
                            Venta Directa
                        </button>
                        <button
                            id="btn-pedido"
                            onClick={() => onOrderTypeChange('PEDIDO')}
                            className={`px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${
                                orderType === 'PEDIDO'
                                    ? 'bg-orange-500 text-white shadow-lg'
                                    : 'text-white/50 hover:text-white'
                            }`}
                        >
                            📦 Pedido
                        </button>
                    </div>

                    {/* Botón Programación del Pedido — solo visible en modo PEDIDO */}
                    {orderType === 'PEDIDO' && (
                        <button
                            id="btn-programacion-pedido"
                            onClick={onOpenProgramacion}
                            className="bg-orange-500/20 border border-orange-500/60 px-5 py-2 rounded-xl flex items-center gap-2 hover:bg-orange-500/30 hover:border-orange-400 transition-all shadow-xl animate-in fade-in duration-300"
                        >
                            <div className="text-left">
                                <p className="text-[13px] font-black uppercase text-white tracking-widest leading-none mb-0.5">Programación</p>
                                <p className="text-[11px] font-black text-orange-400 uppercase tracking-tighter leading-none">del Pedido</p>
                            </div>
                            <span className="text-xl">🗓️</span>
                        </button>
                    )}
                </div>

                {/* DERECHA: Voz + Caja + Pizarron */}
                <div className="flex-shrink-0 flex gap-2">
                    {/* v24 (VOZ-POS): dictado por voz al carrito */}
                    <button
                        id="btn-dictado-voz"
                        onClick={onOpenVoice}
                        disabled={!voiceAvailable}
                        className={`px-5 py-2 rounded-xl flex items-center transition-all shadow-xl border ${
                            voiceAvailable
                                ? 'bg-black/60 border-[#c1d72e]/40 hover:bg-[#c1d72e]/20 hover:border-[#c1d72e]'
                                : 'bg-black/40 border-white/5 cursor-not-allowed opacity-40'
                        }`}
                        title={voiceAvailable ? 'Dictar productos por voz' : 'Dictado por voz no disponible'}
                    >
                        <div className="text-left">
                            <p className="text-[18px] font-black uppercase text-white tracking-widest leading-none mb-1">Voz</p>
                            <p className="text-[14px] font-black text-[#c1d72e] uppercase tracking-tighter leading-none">
                                🎙️ Dictar
                            </p>
                        </div>
                    </button>

                    <button
                        onClick={onOpenGestorCaja}
                        className="bg-black/60 border border-[#c1d72e]/40 px-6 py-2 rounded-xl flex items-center hover:bg-[#c1d72e]/20 hover:border-[#c1d72e] transition-all shadow-xl"
                        title={isCashEnabled ? 'Gestionar Caja (Activa)' : 'Habilitar como Caja'}
                    >
                        <div className="text-left">
                            <p className="text-[18px] font-black uppercase text-white tracking-widest leading-none mb-1">Caja</p>
                            <p className={`text-[14px] font-black uppercase tracking-tighter leading-none ${isCashEnabled ? 'text-[#c1d72e]' : 'text-[#c1d72e]/60'}`}>
                                {isCashEnabled ? '● Activa' : '○ Habilitar'}
                            </p>
                        </div>
                    </button>

                    <button
                        onClick={onOpenCorkboard}
                        className="bg-[#2d1e13] border border-orange-900/40 px-6 py-2 rounded-xl flex items-center hover:bg-[#3d2b1f] hover:border-orange-500/50 transition-all group shadow-xl"
                    >
                        <div className="text-left">
                            <p className="text-[18px] font-black uppercase text-white tracking-widest leading-none mb-1">Pizarron</p>
                            <p className="text-[14px] font-black text-orange-500 uppercase tracking-tighter leading-none">
                                {visibleAccountsCount} {selectedTerminal === 'CAJA' ? 'TOTALES' : 'MIAS'}
                            </p>
                            {/* v4.0 ZERO-LOSS: Badge de estado de guardado */}
                            {lastSaveStatus === 'failed' && cartLength > 0 && (
                                <p className="text-[10px] font-black text-red-500 uppercase tracking-tighter leading-none mt-0.5">
                                    ⚠️ SIN GUARDAR
                                </p>
                            )}
                            {lastSaveStatus === 'saving' && (
                                <p className="text-[10px] font-black text-yellow-400 uppercase tracking-tighter leading-none mt-0.5">
                                    ⏳ Guardando...
                                </p>
                            )}
                            {/* v5.1: Estado 'queued' = guardado offline localmente */}
                            {lastSaveStatus === 'queued' && (
                                <p className="text-[10px] font-black text-amber-400 uppercase tracking-tighter leading-none mt-0.5">
                                    📥 GUARDADO LOCAL
                                </p>
                            )}
                            {lastSaveStatus === 'saved' && lastSaveTime && (
                                <p className="text-[10px] font-black text-green-400 uppercase tracking-tighter leading-none mt-0.5">
                                    ✅ {lastSaveTime.toLocaleTimeString('es-MX', {hour:'2-digit', minute:'2-digit'})}
                                </p>
                            )}
                        </div>
                    </button>
                </div>
            </div>

            <CategoryBar 
                categories={categories} 
                activeCategory={activeCategory} 
                setActiveCategory={onCategoryChange} 
                viewMode={viewMode} 
                setViewMode={onViewModeChange} 
                setCurrentPage={onPageChange} 
            />
        </div>
    );
};
