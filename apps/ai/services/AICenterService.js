import { CONFIG } from '../../shared/config';

/**
 * v26 (CENTRO DE IA): Servicio de datos del Centro de IA.
 *
 * RESPONSABILIDAD UNICA: hablar con el AI Gateway para diagnostico.
 * NO se mezcla con `POSService.js` (ese es del flujo de venta; este es de
 * observacion del motor de IA).
 *
 * REGLA DE ORO: el ERP nunca importa torch/whisper/ultralytics. Solo conoce
 * `CONFIG.API_BASE_URL` y habla HTTP contra el gateway.
 *
 * DEGRADACION: el gateway responde 503 `IA_NO_DISPONIBLE` cuando el motor esta
 * caido. Este servicio NO lo oculta: lo propaga como un error tipado para que
 * la UI lo traduzca a "motor no disponible" en lugar de un crash.
 */

/**
 * Error tipado del Centro de IA. Conserva el status HTTP y el codigo del
 * gateway para que la UI distinga "IA apagada" (503) de "error de red".
 */
export class AICenterError extends Error {
    constructor(mensaje, { status = 0, codigo = null } = {}) {
        super(mensaje);
        this.name = 'AICenterError';
        this.status = status;
        this.codigo = codigo;
    }

    /** true si el gateway reporto que la IA no esta disponible (503). */
    get esNoDisponible() {
        return this.status === 503;
    }
}

/**
 * Extrae el mensaje accionable del cuerpo de error del gateway.
 * El gateway usa `detail: { codigo, mensaje }`; si no, cae al texto crudo.
 */
const leerDetalleError = async (res) => {
    try {
        const cuerpo = await res.json();
        const detalle = cuerpo && cuerpo.detail;
        if (detalle && typeof detalle === 'object') {
            return { mensaje: detalle.mensaje || null, codigo: detalle.codigo || null };
        }
        if (typeof detalle === 'string') {
            return { mensaje: detalle, codigo: null };
        }
    } catch {
        // Sin cuerpo JSON; se usa el mensaje por defecto.
    }
    return { mensaje: null, codigo: null };
};

/**
 * GET generico contra el gateway. Lanza `AICenterError` si la respuesta no es ok.
 */
const getJson = async (ruta, mensajePorDefecto) => {
    let res;
    try {
        res = await fetch(`${CONFIG.API_BASE_URL}${ruta}`, { cache: 'no-store' });
    } catch {
        throw new AICenterError('No se pudo contactar al servidor.', { status: 0 });
    }
    if (res.ok) return res.json();
    const { mensaje, codigo } = await leerDetalleError(res);
    throw new AICenterError(mensaje || mensajePorDefecto, { status: res.status, codigo });
};

export const AICenterService = {
    /**
     * Estado del gateway. Devuelve `{habilitada, configurada, disponible,
     * codigo_fallback}`. Es el unico endpoint que necesita la pestana Estado.
     */
    async getGatewayStatus() {
        return getJson('/ai/status', 'No se pudo consultar el estado de la IA.');
    },

    /** Resumen del dataset anotado (pre-validacion antes de entrenar). */
    async getDatasetSummary() {
        return getJson('/ai/vision/dataset-summary', 'No se pudo consultar el dataset.');
    },

    /** Estado del entrenamiento en curso (o del ultimo). */
    async getTrainStatus() {
        return getJson('/ai/vision/train/status', 'No se pudo consultar el entrenamiento.');
    },
};

export default AICenterService;
