/**
 * v26 (CENTRO DE IA): Constantes de negocio del Centro de IA.
 *
 * REGLA DEL MANIFIESTO: las constantes de negocio viven en MAYUSCULAS en un
 * archivo de configuracion central. Antes, los parametros de captura de voz
 * estaban enterrados dentro de `useVoiceCart.js`; aqui quedan declarados para
 * que el Centro de IA pueda MOSTRARLOS (pestana Voz) y sean auditables.
 *
 * Este archivo NO importa nada: es la fuente de verdad. Los consumidores
 * (`useVoiceCart.js`, `AIVoicePanel.jsx`) lo importan desde aqui.
 */

/**
 * Parametros de la captura continua con auto-stop por silencio.
 *
 * FLUJO MANOS LIBRES: el operador presiona el boton UNA vez, dicta varios
 * productos y la grabacion se detiene SOLA cuando deja de hablar.
 */
export const VOZ_CONFIG = {
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
 * Etiquetas legibles de cada parametro de voz, para la pestana Voz.
 * El orden del array define el orden de presentacion en la UI.
 */
export const ETIQUETA_PARAMETRO_VOZ = [
    { clave: 'UMBRAL_RMS', etiqueta: 'Umbral de voz (RMS)', unidad: '' },
    { clave: 'SILENCIO_MS', etiqueta: 'Silencio para auto-detener', unidad: 'ms' },
    { clave: 'ESPERA_VOZ_MS', etiqueta: 'Espera antes de abortar', unidad: 'ms' },
    { clave: 'MAX_GRABACION_MS', etiqueta: 'Duracion maxima de grabacion', unidad: 'ms' },
    { clave: 'MIN_VOZ_MS', etiqueta: 'Voz minima para validar', unidad: 'ms' },
    { clave: 'INTERVALO_MUESTREO_MS', etiqueta: 'Frecuencia de muestreo', unidad: 'ms' },
];

/**
 * Intenciones que cada modulo acepta por voz (allowlist visible).
 *
 * DECISION DE DISENO (acordada con el negocio): en el POS el dictado por voz
 * sirve UNICAMENTE para capturar/agregar productos a la cuenta. Las acciones
 * destructivas o fiscales (cobrar, cancelar) pasan siempre por un toque
 * explicito del operador.
 */
export const INTENCIONES_POR_MODULO = {
    POS: ['agregar_item'],
    ALMACEN: ['entrada_insumo'],
};

/**
 * Etiqueta legible de cada modulo que usa voz, para la pestana Voz.
 */
export const ETIQUETA_MODULO_VOZ = {
    POS: 'Punto de Venta',
    ALMACEN: 'Gestion de Almacenes',
};

/**
 * Fases de la captura continua, con su etiqueta legible.
 * Debe coincidir con las fases que emite `useVoiceCart.js`.
 */
export const ETIQUETA_FASE_VOZ = {
    inactivo: 'Inactivo',
    esperando_voz: 'Esperando voz...',
    capturando: 'Escuchando...',
    procesando: 'Procesando...',
};
