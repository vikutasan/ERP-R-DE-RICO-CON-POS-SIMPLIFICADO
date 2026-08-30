import React, { useState } from 'react';

/**
 * Modal de Check-Out — Registro de Salida de Turno
 * 
 * Permite al empleado registrar su salida con motivo.
 * Se accede desde el botón "Registrar Salida" en el sidebar.
 */
export const CheckOutModal = ({ employeeName, onConfirm, onClose }) => {
    const [tipoSalida, setTipoSalida] = useState('normal');
    const [observaciones, setObservaciones] = useState('');
    const [processing, setProcessing] = useState(false);

    const tipos = [
        { value: 'normal', label: 'Fin de turno', icon: '✅', desc: 'Mi turno ha terminado normalmente' },
        { value: 'pro', label: 'PRO (Permiso para retirarse)', icon: '🚪', desc: 'Emergencia personal — requiere autorización del gerente' },
    ];

    const handleConfirm = async () => {
        setProcessing(true);
        try {
            await onConfirm(tipoSalida, observaciones || null);
        } finally {
            setProcessing(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[999999] bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
            <div className="max-w-md w-full bg-[#111] border border-white/10 rounded-2xl p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="text-center mb-5">
                    <div className="w-16 h-16 rounded-full bg-blue-600/20 flex items-center justify-center text-3xl mx-auto mb-3">👋</div>
                    <h2 className="text-xl font-black text-white">Registrar Salida</h2>
                    <p className="text-xs text-gray-500 mt-1">{employeeName}</p>
                </div>

                {/* Tipo de salida */}
                <div className="space-y-2 mb-4">
                    <p className="text-[9px] font-bold uppercase tracking-wider text-gray-500">Motivo de salida</p>
                    {tipos.map(t => (
                        <button
                            key={t.value}
                            onClick={() => setTipoSalida(t.value)}
                            className={`w-full text-left px-4 py-3 rounded-xl border transition-all flex items-center gap-3 ${
                                tipoSalida === t.value
                                    ? 'bg-blue-600/15 border-blue-500/30 text-white'
                                    : 'bg-white/5 border-white/5 text-gray-400 hover:bg-white/10'
                            }`}
                        >
                            <span className="text-xl">{t.icon}</span>
                            <div>
                                <p className="text-xs font-bold">{t.label}</p>
                                <p className="text-[9px] text-gray-500">{t.desc}</p>
                            </div>
                        </button>
                    ))}
                </div>

                {/* Observaciones */}
                {tipoSalida === 'pro' && (
                    <div className="mb-4">
                        <label className="block text-[9px] font-bold uppercase tracking-wider text-gray-500 mb-1">Motivo (obligatorio para PRO)</label>
                        <textarea
                            value={observaciones}
                            onChange={(e) => setObservaciones(e.target.value)}
                            placeholder="Describe la emergencia..."
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-700 outline-none focus:border-blue-500/50 h-20 resize-none"
                        />
                    </div>
                )}

                {/* Botones */}
                <div className="flex gap-3">
                    <button
                        onClick={onClose}
                        className="flex-1 py-3 rounded-xl bg-white/5 border border-white/10 text-gray-400 font-bold text-[10px] uppercase tracking-wider hover:bg-white/10 transition-all"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={processing || (tipoSalida === 'pro' && !observaciones)}
                        className={`flex-1 py-3 rounded-xl font-bold text-[10px] uppercase tracking-wider transition-all active:scale-95 ${
                            processing ? 'bg-gray-800 text-gray-600' : 'bg-blue-600 text-white hover:bg-blue-500'
                        }`}
                    >
                        {processing ? 'Registrando...' : 'Confirmar Salida'}
                    </button>
                </div>
            </div>
        </div>
    );
};
