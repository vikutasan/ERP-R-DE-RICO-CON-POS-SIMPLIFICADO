import { useState, useRef, useCallback } from 'react';
import { CONFIG } from '../config';
import {
    mapVoiceIntentToCartProposal,
    POS_VOICE_INTENTS,
} from '../utils/voiceCartMapper';

/**
 * v24 (VOZ-POS): Hook de dictado por voz para el carrito del POS.
 *
 * Encapsula el pipeline completo:
 *   1. MediaRecorder captura audio del microfono (manos libres / headset).
 *   2. POST /api/v1/ai/voice/transcribe  -> Whisper local -> texto.
 *   3. POST /api/v1/ai/voice/parse-intent -> Ollama local -> intencion JSON.
 *   4. mapVoiceIntentToCartProposal -> propuesta editable (NO aplicada aun).
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

    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);
    // Ref para leer el catalogo mas reciente sin re-crear los callbacks.
    const productosRef = useRef(productos);
    productosRef.current = productos;

    const reset = useCallback(() => {
        setPropuesta(null);
        setTexto('');
        setGrabando(false);
        setTranscribiendo(false);
        setError(null);
        audioChunksRef.current = [];
    }, []);

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
        }
    }, [interpretar]);

    /**
     * Inicia la grabacion con MediaRecorder.
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
            audioChunksRef.current = [];
            const recorder = new MediaRecorder(stream);
            recorder.ondataavailable = (e) => {
                if (e.data && e.data.size > 0) audioChunksRef.current.push(e.data);
            };
            recorder.onstop = async () => {
                stream.getTracks().forEach((t) => t.stop());
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
        } catch (err) {
            console.error('useVoiceCart: error al iniciar grabacion', err);
            setDisponible(false);
            setError('No se pudo acceder al microfono. Captura manualmente.');
        }
    }, [transcribir]);

    /**
     * Detiene la grabacion. El `onstop` dispara la transcripcion.
     */
    const detener = useCallback(() => {
        const recorder = mediaRecorderRef.current;
        if (recorder && recorder.state !== 'inactive') {
            recorder.stop();
        }
        setGrabando(false);
    }, []);

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
