import React from 'react';

/**
 * Modal de bienvenida al registrar check-in (primer login del día).
 * Se muestra DESPUÉS de que el login fue exitoso (zona segura).
 */
export const CheckInWelcomeModal = ({ data, onClose }) => {
    if (!data) return null;

    const isPuntual = data.bono_puntualidad;

    return (
        <div className="fixed inset-0 z-[999999] bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
            <div
                className={`max-w-md w-full rounded-3xl p-8 border shadow-2xl text-center transform transition-all animate-in fade-in zoom-in-95 duration-500 ${
                    isPuntual
                        ? 'bg-gradient-to-b from-teal-900/90 to-[#111] border-teal-500/30'
                        : 'bg-gradient-to-b from-amber-900/90 to-[#111] border-amber-500/30'
                }`}
                onClick={e => e.stopPropagation()}
            >
                {/* Icono */}
                <div className={`w-20 h-20 rounded-full mx-auto mb-4 flex items-center justify-center text-4xl ${
                    isPuntual ? 'bg-teal-600/30' : 'bg-amber-600/30'
                }`}>
                    {isPuntual ? '✅' : '⚠️'}
                </div>

                {/* Saludo */}
                <h2 className="text-2xl font-black text-white mb-1">
                    {isPuntual ? '¡Bienvenido!' : 'Bienvenido'}
                </h2>
                <p className="text-lg font-bold text-white/80 mb-4">{data.employee_name}</p>

                {/* Info del turno */}
                <div className={`rounded-xl p-4 mb-4 ${isPuntual ? 'bg-teal-600/10 border border-teal-500/20' : 'bg-amber-600/10 border border-amber-500/20'}`}>
                    <div className="grid grid-cols-2 gap-3 text-left">
                        <div>
                            <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wider">Hora de entrada</p>
                            <p className="text-lg font-black text-white">{data.hora_entrada} hrs</p>
                        </div>
                        <div>
                            <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wider">Turno</p>
                            <p className="text-lg font-black text-white capitalize">{data.turno_asignado || '—'}</p>
                        </div>
                        {data.hora_inicio_turno && (
                            <div>
                                <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wider">Inicio de turno</p>
                                <p className="text-sm font-bold text-white">{data.hora_inicio_turno} hrs</p>
                            </div>
                        )}
                        {data.posicion_asignada && (
                            <div>
                                <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wider">Posición</p>
                                <p className="text-sm font-bold text-white">{data.posicion_asignada}</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Mensaje de puntualidad */}
                <div className={`rounded-xl p-3 mb-6 ${isPuntual ? 'bg-teal-500/10' : 'bg-red-500/10'}`}>
                    {isPuntual ? (
                        <p className="text-xs font-bold text-teal-400">✅ Puedes gozar de tu bono de puntualidad. ¡Excelente turno! 💪</p>
                    ) : (
                        <p className="text-xs font-bold text-amber-400">⚠️ Lamentablemente has perdido tu bono de puntualidad. Te exhortamos a ser más puntual.</p>
                    )}
                </div>

                {/* Botón */}
                <button
                    onClick={onClose}
                    className={`w-full py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all active:scale-95 ${
                        isPuntual
                            ? 'bg-teal-600 text-white hover:bg-teal-500'
                            : 'bg-amber-600 text-white hover:bg-amber-500'
                    }`}
                >
                    ¡A trabajar!
                </button>
            </div>
        </div>
    );
};
