import { useState, useRef, useCallback } from 'react';
import { CONFIG } from '../config';
import {
    mapVoiceIntentToCartProposal,
    POS_VOICE_INTENTS,
} from '../utils/voiceCartMapper';

/**
 * v25 (VOZ-POS v2): Parametros de la captura continua con auto-stop por silencio.
 *
 * FLUJO MANOS LIBRES: el operador presiona el boton UNA vez, dicta varios
 * productos ("3 conchas, 12 bolillos, 2 conchas...") y la grabacion se detiene
 * SOLA cuando deja de hablar. No hay que volver a tocar la pantalla.
 */
const VOZ_CONFIG = {
    // RMS minimo (0..1) para considerar que hay voz. Por debajo = silencio.
    UMBRAL_RMS: 0.02,
    // ms de silencio continuo tras haber hablado -> detener y transcribir.
    SILENCIO_MS: 1500,
    // ms maximos esperando a que el operador empiece a hablar antes de abortar.
    ESPERA_VOZ_MS: 6000,
    // ms maximos de grabacion total (red de seguridad anti-olvido).
    MAX_GRABACION_MS: 30000,
    // ms minimos de voz acumulada para considerar el dictado valido.
    MIN_VOZ_MS: 300,
    // Cada cuanto se muestrea el nivel de audio (ms).
    INTERVALO_MUESTREO_MS: 100,
};

/**
 * v24/v25 (VOZ-POS): Hook de dictado por voz para el carrito del POS.
 *
 * Encapsula el pipeline completo:
 *   1. MediaRecorder captura audio del microfono (manos libres / headset).
 *   2. POST /api/v1/ai/voice/transcribe  -> Whisper local -> texto.
 *   3. POST /api/v1/ai/voice/parse-intent -> Ollama local -> intencion JSON.
 *   4. mapVoiceIntentToCartProposal -> propuesta editable (NO aplicada aun).
 *
 * v25 (VOZ-POS v2): CAPTURA CONTINUA. Al pulsar el boton una sola vez, el hook
 * abre un `AudioContext` + `AnalyserNode` y vigila el nivel RMS del microfono:
 *   - Fase `esperando_voz`: aun no habla. Si no habla en ESPERA_VOZ_MS, aborta.
 *   - Fase `capturando`:    esta hablando. Cada vez que el RMS supera el umbral
 *                           se reinicia el temporizador de silencio.
 *   - Auto-stop:            tras SILENCIO_MS sin voz, detiene y transcribe.
 *   - Red de seguridad:     MAX_GRABACION_MS corta la grabacion pase lo que pase.
 *
 * REGLA DE ORO (spec linea 664): la IA PROPONE, el operador CONFIRMA.
 * Este hook NUNCA toca el carrito. Solo produce una `propuesta` que la UI
 * muestra para que el operador la revise y confirme.
 *
 * DEGRADACION ELEGANTE (spec linea 692): si el navegador no soporta audio o
 * la IA local esta apagada (503), el hook expone `disponible=false` y el POS
 * sigue funcionando en modo manual.
 *
 * @param {Array<{id: string, name: string, price: number}>} productos Catalogo POS.
 * @returns {object} Estado y acciones del dictado.
 */
export const useVoiceCart = (productos = []) => {
    const [grabando, setGrabando] = useState(false);
    const [transcribiendo, setTranscribiendo] = useState(false);
    const [texto, setTexto] = useState('');
    const [propuesta, setPropuesta] = useState(null);
    const [disponible, setDisponible] = useState(true);
    const [error, setError] = useState(null);
    // v25: fase de la captura continua para feedback visual en la UI.
    // 'inactivo' | 'esperando_voz' | 'capturando' | 'procesando'
    const [fase, setFase] = useState('inactivo');
    // v25: nivel de audio normalizado (0..1) para el medidor visual.
    const [nivel, setNivel] = useState(0);

    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);
    // Ref para leer el catalogo mas reciente sin re-crear los callbacks.
    const productosRef = useRef(productos);
    productosRef.current = productos;

    // --- v25: refs del monitoreo de silencio (Web Audio API) ---
    const audioContextRef = useRef(null);
    const analyserRef = useRef(null);
    const streamRef = useRef(null);
    const monitorTimerRef = useRef(null);
    const maxTimerRef = useRef(null);
    const silencioAcumuladoRef = useRef(0);
    const vozAcumuladaRef = useRef(0);
    const habloRef = useRef(false);

    /**
     * v25: Libera TODOS los recursos de audio (contexto, stream, timers).
     * Idempotente: se puede llamar varias veces sin efectos secundarios.
     */
    const limpiarAudio = useCallback(() => {
        if (monitorTimerRef.current) {
            clearInterval(monitorTimerRef.current);
            monitorTimerRef.current = null;
        }
        if (maxTimerRef.current) {
            clearTimeout(maxTimerRef.current);
            maxTimerRef.current = null;
        }
        if (audioContextRef.current) {
            try {
                audioContextRef.current.close();
            } catch (e) {
                // El contexto ya estaba cerrado; ignorar.
            }
            audioContextRef.current = null;
        }
        analyserRef.current = null;
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((t) => t.stop());
            streamRef.current = null;
        }
        silencioAcumuladoRef.current = 0;
        vozAcumuladaRef.current = 0;
        habloRef.current = false;
        setNivel(0);
    }, []);

    const reset = useCallback(() => {
        limpiarAudio();
        setPropuesta(null);
        setTexto('');
        setGrabando(false);
        setTranscribiendo(false);
        setError(null);
        setFase('inactivo');
        audioChunksRef.current = [];
    }, [limpiarAudio]);

    /**
     * Envia el texto transcrito al NLU y construye la propuesta editable.
     * @param {string} textoDictado
     */
    const interpretar = useCallback(async (textoDictado) => {
        try {
            const res = await fetch(`${CONFIG.API_BASE_URL}/ai/voice/parse-intent`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    texto: textoDictado,
                    contexto: 'pos',
                    skus_disponibles: (productosRef.current || []).map((p) => p.id).slice(0, 50),
                }),
            });
            if (!res.ok) {
                const status = res.status;
                if (status === 503) {
                    setDisponible(false);
                    setError('Dictado por voz no disponible (IA local apagada). Captura manualmente.');
                } else {
                    setError('No se pudo interpretar el dictado. Captura manualmente.');
                }
                return;
            }
            const data = await res.json();
            const nueva = mapVoiceIntentToCartProposal(data, productosRef.current);
            setPropuesta(nueva);
            if (nueva.intencion === POS_VOICE_INTENTS.DESCONOCIDA) {
                setError('La IA no entendio el dictado. Intenta de nuevo o captura manualmente.');
            } else if (nueva.hay_no_resueltos) {
                setError('La IA no reconocio algun producto. Seleccionalo manualmente.');
            } else if (nueva.revisar) {
                setError('Confianza baja: revisa los productos y cantidades antes de confirmar.');
            } else {
                setError(null);
            }
        } catch (err) {
            console.error('useVoiceCart: error al interpretar intencion', err);
            setError('No se pudo interpretar el dictado. Captura manualmente.');
        }
    }, []);

    /**
     * Transcribe el audio grabado y dispara la interpretacion.
     * @param {Blob} blob
     */
    const transcribir = useCallback(async (blob) => {
        setTranscribiendo(true);
        setFase('procesando');
        try {
            const base64 = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
            const res = await fetch(`${CONFIG.API_BASE_URL}/ai/voice/transcribe`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    audio_base64: base64,
                    idioma: 'es',
                    formato: blob.type || 'audio/webm',
                }),
            });
            if (!res.ok) {
                if (res.status === 503) {
                    setDisponible(false);
                    setError('Dictado por voz no disponible (IA local apagada). Captura manualmente.');
                } else {
                    setError('No se pudo procesar el audio. Captura manualmente.');
                }
                return;
            }
            const data = await res.json();
            const textoDictado = String(data?.texto || '').trim();
            if (!textoDictado) {
                setError('No se entendio el dictado. Intenta de nuevo o captura manualmente.');
                return;
            }
            setTexto(textoDictado);
            await interpretar(textoDictado);
        } catch (err) {
            console.error('useVoiceCart: error al transcribir', err);
            setError('No se pudo procesar el audio. Captura manualmente.');
        } finally {
            setTranscribiendo(false);
            setFase('inactivo');
        }
    }, [interpretar]);

    /**
     * v25: Detiene la grabacion y libera el monitoreo de audio.
     * El `onstop` del MediaRecorder dispara la transcripcion.
     */
    const detener = useCallback(() => {
        const recorder = mediaRecorderRef.current;
        limpiarAudio();
        if (recorder && recorder.state !== 'inactive') {
            recorder.stop();
        }
        setGrabando(false);
    }, [limpiarAudio]);

    /**
     * Inicia la grabacion con MediaRecorder + captura continua (v25).
     * Degrada a modo manual si el navegador no soporta audio o el permiso falla.
     */
    const iniciar = useCallback(async () => {
        if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
            setDisponible(false);
            setError('Dictado por voz no disponible en este dispositivo. Captura manualmente.');
            return;
        }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;
            audioChunksRef.current = [];
            const recorder = new MediaRecorder(stream);
            recorder.ondataavailable = (e) => {
                if (e.data && e.data.size > 0) audioChunksRef.current.push(e.data);
            };
            recorder.onstop = async () => {
                // v25: el stream y el AudioContext ya se liberaron en `detener`.
                const blob = new Blob(audioChunksRef.current, {
                    type: recorder.mimeType || 'audio/webm',
                });
                await transcribir(blob);
            };
            mediaRecorderRef.current = recorder;
            recorder.start();
            setGrabando(true);
            setPropuesta(null);
            setTexto('');
            setError(null);
            setFase('esperando_voz');

            // --- v25: monitoreo de silencio con Web Audio API ---
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) {
                // Sin Web Audio no hay auto-stop: se comporta como v24 (manual).
                return;
            }
            const ctx = new AudioCtx();
            audioContextRef.current = ctx;
            const source = ctx.createMediaStreamSource(stream);
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 2048;
            source.connect(analyser);
            analyserRef.current = analyser;

            const buffer = new Uint8Array(analyser.fftSize);
            silencioAcumuladoRef.current = 0;
            vozAcumuladaRef.current = 0;
            habloRef.current = false;

            monitorTimerRef.current = setInterval(() => {
                const a = analyserRef.current;
                if (!a) return;
                a.getByteTimeDomainData(buffer);
                // RMS normalizado: 128 es el centro (silencio digital).
                let suma = 0;
                for (let i = 0; i < buffer.length; i += 1) {
                    const v = (buffer[i] - 128) / 128;
                    suma += v * v;
                }
                const rms = Math.sqrt(suma / buffer.length);
                setNivel(Math.min(1, rms * 4));
                const hayVoz = rms >= VOZ_CONFIG.UMBRAL_RMS;

                if (hayVoz) {
                    habloRef.current = true;
                    vozAcumuladaRef.current += VOZ_CONFIG.INTERVALO_MUESTREO_MS;
                    silencioAcumuladoRef.current = 0;
                    setFase('capturando');
                    return;
                }

                // Silencio: acumular.
                silencioAcumuladoRef.current += VOZ_CONFIG.INTERVALO_MUESTREO_MS;

                // Caso A: nunca hablo -> abortar por timeout de espera.
                if (!habloRef.current && silencioAcumuladoRef.current >= VOZ_CONFIG.ESPERA_VOZ_MS) {
                    setError('No se detecto voz. Intenta de nuevo o captura manualmente.');
                    detener();
                    return;
                }

                // Caso B: ya hablo y lleva suficiente silencio -> auto-stop.
                if (habloRef.current && silencioAcumuladoRef.current >= VOZ_CONFIG.SILENCIO_MS) {
                    // Si hablo muy poco, probablemente fue ruido: abortar sin transcribir.
                    if (vozAcumuladaRef.current < VOZ_CONFIG.MIN_VOZ_MS) {
                        setError('No se detecto voz. Intenta de nuevo o captura manualmente.');
                        detener();
                        return;
                    }
                    detener();
                }
            }, VOZ_CONFIG.INTERVALO_MUESTREO_MS);

            // Red de seguridad: cortar la grabacion pase lo que pase.
            maxTimerRef.current = setTimeout(() => {
                detener();
            }, VOZ_CONFIG.MAX_GRABACION_MS);
        } catch (err) {
            console.error('useVoiceCart: error al iniciar grabacion', err);
            limpiarAudio();
            setDisponible(false);
            setError('No se pudo acceder al microfono. Captura manualmente.');
        }
    }, [transcribir, detener, limpiarAudio]);

    /**
     * Alterna grabacion (un solo boton en la UI).
     */
    const alternar = useCallback(() => {
        if (grabando) {
            detener();
        } else {
            iniciar();
        }
    }, [grabando, iniciar, detener]);

    /**
     * Edita una linea de la propuesta (producto o cantidad).
     * @param {number} index
     * @param {string} field
     * @param {any} value
     */
    const editarLinea = useCallback((index, field, value) => {
        setPropuesta((prev) => {
            if (!prev) return prev;
            const lineas = prev.lineas.map((l, i) => {
                if (i !== index) return l;
                if (field === 'producto_id') {
                    const match = (productosRef.current || []).find((p) => String(p.id) === String(value));
                    return {
                        ...l,
                        producto_id: value,
                        nombre: match ? match.name : l.nombre,
                        precio: match ? Number(match.price || 0) : l.precio,
                        resuelto: Boolean(match),
                    };
                }
                if (field === 'cantidad') {
                    return { ...l, cantidad: value };
                }
                return { ...l, [field]: value };
            });
            const hayNoResueltos = lineas.some((l) => !l.resuelto);
            return { ...prev, lineas, hay_no_resueltos: hayNoResueltos };
        });
    }, []);

    /**
     * Quita una linea de la propuesta.
     * @param {number} index
     */
    const quitarLinea = useCallback((index) => {
        setPropuesta((prev) => {
            if (!prev) return prev;
            const lineas = prev.lineas.filter((_, i) => i !== index);
            return { ...prev, lineas, hay_no_resueltos: lineas.some((l) => !l.resuelto) };
        });
    }, []);

    /**
     * Marca/desmarca la propuesta como confirmada por el operador.
     */
    const alternarConfirmacion = useCallback(() => {
        setPropuesta((prev) => (prev ? { ...prev, confirmado: !prev.confirmado } : prev));
    }, []);

    return {
        // Estado
        grabando,
        transcribiendo,
        texto,
        propuesta,
        disponible,
        error,
        // v25 (VOZ-POS v2): fase de la captura continua + nivel de audio (0..1)
        // para que la UI muestre "escuchando / capturando / procesando" y un
        // medidor de volumen en vivo.
        fase,
        nivel,
        // Acciones
        iniciar,
        detener,
        alternar,
        reset,
        editarLinea,
        quitarLinea,
        alternarConfirmacion,
    };
};
