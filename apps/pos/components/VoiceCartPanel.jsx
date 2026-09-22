import React from 'react';
import { POS_VOICE_INTENTS } from '../utils/voiceCartMapper';

/**
 * VoiceCartPanel — v24 (VOZ-POS)
 *
 * Panel de dictado por voz para el carrito del POS. Muestra:
 *   1. El boton de microfono (alterna grabacion).
 *   2. El texto transcrito por Whisper.
 *   3. La propuesta editable de la IA (lineas con producto + cantidad).
 *   4. El boton de confirmacion (human-in-the-loop).
 *
 * REGLA: Solo presentacion y callbacks. Cero logica de negocio.
 * Toda la logica vive en `useVoiceCart` y `voiceCartMapper`.
 */
export const VoiceCartPanel = ({
    // Estado (de useVoiceCart)
    grabando,
    transcribiendo,
    texto,
    propuesta,
    disponible,
    error,
    // Datos
    productos = [],
    // Callbacks
    onToggleRecording,
    onEditLine,
    onRemoveLine,
    onToggleConfirm,
    onApply,
    onCancel,
}) => {
    const lineas = propuesta?.lineas || [];
    const esCobrar = propuesta?.intencion === POS_VOICE_INTENTS.COBRAR;
    const esCancelar = propuesta?.intencion === POS_VOICE_INTENTS.CANCELAR;
    const esDesconocida = propuesta?.intencion === POS_VOICE_INTENTS.DESCONOCIDA;
    const esQuitar = propuesta?.intencion === POS_VOICE_INTENTS.QUITAR_ITEM;

    const etiquetaIntencion = () => {
        switch (propuesta?.intencion) {
            case POS_VOICE_INTENTS.AGREGAR_ITEM: return '🛒 Agregar al carrito';
            case POS_VOICE_INTENTS.QUITAR_ITEM: return '🗑️ Quitar del carrito';
            case POS_VOICE_INTENTS.COBRAR: return '💵 Cobrar cuenta';
            case POS_VOICE_INTENTS.CANCELAR: return '❌ Cancelar venta';
            default: return '❓ No entendido';
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="bg-zinc-900 border border-white/10 rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden">
                {/* Encabezado */}
                <div className="bg-black/60 px-6 py-4 border-b border-white/10 flex items-center justify-between">
                    <div>
                        <h2 className="text-xl font-black uppercase tracking-widest text-white">
                            🎙️ Dictado por <span className="text-[#c1d72e]">Voz</span>
                        </h2>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-white/40 mt-0.5">
                            La IA propone · Tú confirmas
                        </p>
                    </div>
                    <button
                        onClick={onCancel}
                        className="text-white/50 hover:text-white text-2xl font-black leading-none px-2"
                        title="Cerrar"
                    >
                        ×
                    </button>
                </div>

                <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                    {/* Aviso de no disponibilidad */}
                    {!disponible && (
                        <div className="bg-amber-500/15 border border-amber-500/30 rounded-2xl px-4 py-3">
                            <p className="text-amber-300 text-xs font-bold uppercase tracking-wider">
                                ⚠️ Dictado por voz no disponible. Usa la captura manual.
                            </p>
                        </div>
                    )}

                    {/* Boton de microfono */}
                    {disponible && (
                        <div className="flex flex-col items-center gap-3 py-2">
                            <button
                                onClick={onToggleRecording}
                                disabled={transcribiendo}
                                className={`w-24 h-24 rounded-full flex items-center justify-center text-4xl transition-all shadow-2xl ${
                                    grabando
                                        ? 'bg-red-500 animate-pulse scale-110'
                                        : transcribiendo
                                            ? 'bg-zinc-700 cursor-wait'
                                            : 'bg-[#c1d72e] hover:scale-105'
                                }`}
                                title={grabando ? 'Detener' : 'Dictar'}
                            >
                                {transcribiendo ? '⏳' : grabando ? '⏹️' : '🎙️'}
                            </button>
                            <p className="text-[11px] font-black uppercase tracking-widest text-white/60">
                                {grabando
                                    ? 'Grabando… presiona para detener'
                                    : transcribiendo
                                        ? 'Transcribiendo…'
                                        : 'Presiona y dicta: "agrega 3 conchas y 12 bolillos"'}
                            </p>
                        </div>
                    )}

                    {/* Texto transcrito */}
                    {texto && (
                        <div className="bg-black/40 border border-white/10 rounded-2xl px-4 py-3">
                            <p className="text-[9px] font-black uppercase tracking-widest text-white/40 mb-1">
                                Transcripción
                            </p>
                            <p className="text-white text-sm italic">"{texto}"</p>
                        </div>
                    )}

                    {/* Error / aviso */}
                    {error && (
                        <div className="bg-red-500/15 border border-red-500/30 rounded-2xl px-4 py-3">
                            <p className="text-red-300 text-xs font-bold">{error}</p>
                        </div>
                    )}

                    {/* Propuesta de la IA */}
                    {propuesta && (
                        <div className={`rounded-2xl border px-4 py-3 ${
                            propuesta.revisar
                                ? 'bg-amber-500/10 border-amber-500/30'
                                : 'bg-emerald-500/10 border-emerald-500/30'
                        }`}>
                            <div className="flex items-center justify-between mb-3">
                                <p className="text-[11px] font-black uppercase tracking-widest text-white">
                                    {etiquetaIntencion()}
                                </p>
                                <span className={`text-[10px] font-black uppercase tracking-widest ${
                                    propuesta.revisar ? 'text-amber-400' : 'text-emerald-400'
                                }`}>
                                    Confianza {Math.round((propuesta.confianza || 0) * 100)}%
                                </span>
                            </div>

                            {/* Lineas editables */}
                            {!esCobrar && !esCancelar && !esDesconocida && (
                                <div className="space-y-2">
                                    {lineas.map((l, i) => (
                                        <div
                                            key={i}
                                            className={`flex items-center gap-2 rounded-xl px-3 py-2 ${
                                                l.resuelto ? 'bg-black/40' : 'bg-red-500/20 border border-red-500/40'
                                            }`}
                                        >
                                            {/* Selector de producto */}
                                            <select
                                                value={l.producto_id || ''}
                                                onChange={(e) => onEditLine(i, 'producto_id', e.target.value)}
                                                className="flex-1 bg-zinc-800 border border-white/10 rounded-lg px-2 py-1.5 text-white text-xs font-bold"
                                            >
                                                <option value="">
                                                    {l.resuelto ? '— Selecciona —' : `⚠️ "${l.sku_dictado}" no reconocido`}
                                                </option>
                                                {productos.map((p) => (
                                                    <option key={p.id} value={p.id}>
                                                        {p.name}
                                                    </option>
                                                ))}
                                            </select>

                                            {/* Cantidad */}
                                            <input
                                                type="number"
                                                min="1"
                                                step="1"
                                                value={l.cantidad}
                                                onChange={(e) => onEditLine(i, 'cantidad', e.target.value)}
                                                className="w-20 bg-zinc-800 border border-white/10 rounded-lg px-2 py-1.5 text-white text-xs font-black text-center"
                                            />

                                            {/* Precio */}
                                            <span className="text-[#c1d72e] text-xs font-black w-16 text-right">
                                                ${(Number(l.precio || 0) * Number(l.cantidad || 0)).toFixed(2)}
                                            </span>

                                            {/* Quitar linea */}
                                            <button
                                                onClick={() => onRemoveLine(i)}
                                                className="text-red-400 hover:text-red-300 text-lg font-black px-1"
                                                title="Quitar línea"
                                            >
                                                ×
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Mensajes para intenciones sin lineas */}
                            {esCobrar && (
                                <p className="text-white text-sm">
                                    El operador pidió <strong>cobrar la cuenta</strong>. Confirma para abrir el cobro.
                                </p>
                            )}
                            {esCancelar && (
                                <p className="text-white text-sm">
                                    El operador pidió <strong>cancelar la venta</strong>. Confirma para vaciar el carrito.
                                </p>
                            )}
                            {esDesconocida && (
                                <p className="text-white text-sm">
                                    No se entendió el dictado. Cierra e intenta de nuevo.
                                </p>
                            )}

                            {/* Checkbox de confirmacion (human-in-the-loop) */}
                            {!esDesconocida && (
                                <label className="flex items-center gap-2 mt-4 cursor-pointer select-none">
                                    <input
                                        type="checkbox"
                                        checked={Boolean(propuesta.confirmado)}
                                        onChange={onToggleConfirm}
                                        className="w-5 h-5 accent-[#c1d72e]"
                                    />
                                    <span className="text-[11px] font-black uppercase tracking-widest text-white/80">
                                        Confirmo que los datos son correctos
                                    </span>
                                </label>
                            )}
                        </div>
                    )}
                </div>

                {/* Pie de acciones */}
                <div className="bg-black/60 px-6 py-4 border-t border-white/10 flex justify-end gap-3">
                    <button
                        onClick={onCancel}
                        className="px-6 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white text-[11px] font-black uppercase tracking-widest transition-all"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={onApply}
                        disabled={!propuesta || !propuesta.confirmado || esDesconocida}
                        className={`px-6 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${
                            propuesta && propuesta.confirmado && !esDesconocida
                                ? esQuitar
                                    ? 'bg-red-500 hover:bg-red-400 text-white'
                                    : 'bg-[#c1d72e] hover:bg-[#d4e84a] text-black'
                                : 'bg-zinc-800 text-white/30 cursor-not-allowed'
                        }`}
                    >
                        {esQuitar ? 'Quitar del carrito' : esCobrar ? 'Cobrar' : esCancelar ? 'Cancelar venta' : 'Agregar al carrito'}
                    </button>
                </div>
            </div>
        </div>
    );
};
