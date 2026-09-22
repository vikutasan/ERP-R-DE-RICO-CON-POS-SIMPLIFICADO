import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
    VOZ_CONFIG,
    ETIQUETA_PARAMETRO_VOZ,
    INTENCIONES_POR_MODULO,
    ETIQUETA_MODULO_VOZ,
} from '../utils/aiCenterConstants';

/**
 * AIVoicePanel — v26 (CENTRO DE IA)
 *
 * Pestana "Voz". Muestra:
 *   1. Los parametros de captura (VOZ_CONFIG, centralizados en aiCenterConstants).
 *   2. La allowlist de intenciones por modulo (que puede dictarse y donde).
 *   3. Una prueba de microfono en vivo (medidor de nivel RMS).
 *
 * El medidor replica EXACTAMENTE la logica de `useVoiceCart.js` (fftSize 2048,
 * getByteTimeDomainData, RMS normalizado, nivel = min(1, rms * 4)) para que lo
 * que el operador ve aqui sea lo mismo que vera en el POS.
 *
 * RESPONSABILIDAD UNICA: presentar y probar. Cero logica de negocio.
 */

/** Fila de parametro: etiqueta, valor y unidad. */
const FilaParametro = ({ etiqueta, valor, unidad }) => (
    <div className="flex items-center justify-between border-b border-white/10 py-2">
        <span className="text-sm text-slate-400">{etiqueta}</span>
        <span className="font-mono text-sm font-semibold text-white">
            {valor}
            {unidad ? <span className="ml-1 text-xs text-slate-500">{unidad}</span> : null}
        </span>
    </div>
);

export const AIVoicePanel = ({ activo = true }) => {
    const [probando, setProbando] = useState(false);
    const [nivel, setNivel] = useState(0);
    const [error, setError] = useState(null);

    const audioContextRef = useRef(null);
    const analyserRef = useRef(null);
    const streamRef = useRef(null);
    const monitorTimerRef = useRef(null);

    /** Libera todos los recursos de audio. Idempotente. */
    const limpiarAudio = useCallback(() => {
        if (monitorTimerRef.current) {
            clearInterval(monitorTimerRef.current);
            monitorTimerRef.current = null;
        }
        if (audioContextRef.current) {
            try {
                audioContextRef.current.close();
            } catch {
                // El contexto ya estaba cerrado; ignorar.
            }
            audioContextRef.current = null;
        }
        analyserRef.current = null;
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((t) => t.stop());
            streamRef.current = null;
        }
        setNivel(0);
    }, []);

    // Al desmontar o al ocultarse la pestana, liberar el microfono.
    useEffect(() => {
        if (!activo) {
            limpiarAudio();
            setProbando(false);
        }
        return limpiarAudio;
    }, [activo, limpiarAudio]);

    const detenerPrueba = useCallback(() => {
        limpiarAudio();
        setProbando(false);
    }, [limpiarAudio]);

    const iniciarPrueba = useCallback(async () => {
        if (!navigator.mediaDevices?.getUserMedia) {
            setError('Este dispositivo no permite acceder al micrófono.');
            return;
        }
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) {
            setError('Este navegador no soporta la medición de audio.');
            return;
        }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;
            const ctx = new AudioCtx();
            audioContextRef.current = ctx;
            const source = ctx.createMediaStreamSource(stream);
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 2048;
            source.connect(analyser);
            analyserRef.current = analyser;

            const buffer = new Uint8Array(analyser.fftSize);
            setError(null);
            setProbando(true);
            monitorTimerRef.current = setInterval(() => {
                const a = analyserRef.current;
                if (!a) return;
                a.getByteTimeDomainData(buffer);
                let suma = 0;
                for (let i = 0; i < buffer.length; i += 1) {
                    const v = (buffer[i] - 128) / 128;
                    suma += v * v;
                }
                const rms = Math.sqrt(suma / buffer.length);
                setNivel(Math.min(1, rms * 4));
            }, VOZ_CONFIG.INTERVALO_MUESTREO_MS);
        } catch {
            limpiarAudio();
            setError('No se pudo acceder al micrófono. Revisa los permisos del navegador.');
        }
    }, [limpiarAudio]);

    const anchoNivel = `${Math.max(4, Math.min(100, Math.round((nivel || 0) * 100)))}%`;
    const superaUmbral = (nivel || 0) >= VOZ_CONFIG.UMBRAL_RMS;

    return (
        <div className="h-full overflow-y-auto bg-slate-900 p-6">
            <div className="mx-auto max-w-2xl">
                <h2 className="mb-1 text-xl font-bold text-white">Voz</h2>
                <p className="mb-6 text-sm text-slate-400">
                    Parametros de la captura continua y prueba de micrófono en vivo.
                </p>

                {/* Prueba de microfono */}
                <div className="mb-6 rounded-xl border border-white/10 bg-slate-800 p-5">
                    <div className="mb-3 flex items-center justify-between">
                        <h3 className="text-sm font-bold uppercase tracking-wide text-slate-400">
                            Prueba de micrófono
                        </h3>
                        <button
                            type="button"
                            onClick={probando ? detenerPrueba : iniciarPrueba}
                            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                                probando
                                    ? 'bg-red-500 text-white hover:brightness-110'
                                    : 'bg-[#c1d72e] text-slate-900 hover:brightness-110'
                            }`}
                        >
                            {probando ? 'Detener' : 'Probar micrófono'}
                        </button>
                    </div>
                    <div className="h-3 w-full overflow-hidden rounded-full bg-slate-700">
                        <div
                            className={`h-full rounded-full transition-all duration-100 ${
                                superaUmbral ? 'bg-emerald-500' : 'bg-slate-500'
                            }`}
                            style={{ width: anchoNivel }}
                        />
                    </div>
                    <p className="mt-2 text-xs text-slate-500">
                        {probando
                            ? superaUmbral
                                ? 'Se detecta voz.'
                                : 'Habla para ver el nivel.'
                            : 'Presiona "Probar micrófono" para verificar el dispositivo.'}
                    </p>
                    {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
                </div>

                {/* Parametros de captura */}
                <div className="mb-6 rounded-xl border border-white/10 bg-slate-800 p-5">
                    <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-400">
                        Parámetros de captura
                    </h3>
                    {ETIQUETA_PARAMETRO_VOZ.map(({ clave, etiqueta, unidad }) => (
                        <FilaParametro
                            key={clave}
                            etiqueta={etiqueta}
                            valor={VOZ_CONFIG[clave]}
                            unidad={unidad}
                        />
                    ))}
                </div>

                {/* Allowlist por modulo */}
                <div className="rounded-xl border border-white/10 bg-slate-800 p-5">
                    <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-400">
                        Intenciones permitidas por módulo
                    </h3>
                    {Object.entries(INTENCIONES_POR_MODULO).map(([modulo, intenciones]) => (
                        <div
                            key={modulo}
                            className="flex items-center justify-between border-b border-white/10 py-2 last:border-b-0"
                        >
                            <span className="text-sm text-slate-400">
                                {ETIQUETA_MODULO_VOZ[modulo] || modulo}
                            </span>
                            <span className="flex gap-2">
                                {intenciones.map((intencion) => (
                                    <span
                                        key={intencion}
                                        className="rounded-full bg-[#c1d72e]/20 px-3 py-1 font-mono text-xs font-semibold text-[#c1d72e]"
                                    >
                                        {intencion}
                                    </span>
                                ))}
                            </span>
                        </div>
                    ))}
                    <p className="mt-3 text-xs text-slate-500">
                        Cualquier otra intención se degrada a <code>DESCONOCIDA</code>: la IA
                        propone, el operador confirma.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default AIVoicePanel;
