/**
 * R de Rico - Agente de Voz (Gemini Live Integration)
 *
 * ⚠️⚠️⚠️ ADVERTENCIA CRÍTICA — ESTE MÓDULO ES UN MOCK, NO UNA IMPLEMENTACIÓN REAL ⚠️⚠️⚠️
 *
 * v7 (Fase 6.5.1): Auditoría ejecutada. Este archivo NO debe usarse en producción
 * ni tomarse como referencia de comportamiento. Hallazgos:
 *
 *   1. NO captura audio. `processQuery(voiceInput)` recibe TEXTO ya transcrito;
 *      no hay integración con micrófono ni con MediaRecorder.
 *   2. NO consulta la base de datos. Todos los métodos devuelven datos
 *      HARDCODEADOS (p. ej. "margen del 34%", "Harina Extra Fina 15kg").
 *      Esto VIOLA la regla SaaS de no hardcodear datos de negocio.
 *   3. NO tiene NLU real. Es una cadena de `if (input.includes(...))`, no
 *      comprensión de lenguaje natural.
 *   4. Devuelve INFORMACIÓN FALSA al usuario (cifras inventadas presentadas
 *      como reales), lo cual es peor que no responder.
 *
 * RUTA CORRECTA (v7): la captura de inventario por voz se implementa en el
 * módulo de almacenes usando los endpoints reales del AI Gateway:
 *   - POST /api/v1/ai/voice/transcribe   (audio → texto; Whisper local)
 *   - POST /api/v1/ai/voice/parse-intent (texto → JSON estructurado; LLM local)
 * con confirmación human-in-the-loop y `metodo_captura = VOZ`.
 * Ver `plans/PLAN_MAESTRO_ALMACENES_V7.md` secciones 6.5.1 a 6.5.9.
 *
 * Este archivo se conserva únicamente como referencia histórica de la
 * estructura de intenciones. NO importar desde código nuevo.
 *
 * ---
 * Descripción original (obsoleta):
 * Este módulo permite al socio administrador interactuar con el ERP
 * mediante lenguaje natural y voz.
 *
 * Funciones clave:
 * 1. Consultas de Margen de Utilidad en tiempo real.
 * 2. Estatus de producción (Próximas tandas).
 * 3. Alertas de inventario crítico.
 */

export const VoiceAgentService = {
    /**
     * Procesa la intención de voz del usuario y consulta la base de datos local (Edge).
     */
    async processQuery(voiceInput) {
        const input = voiceInput.toLowerCase();

        // Consultas de Manuales y Tareas (Personal con Manos Libres)
        if (input.includes("qué me toca") || input.includes("mi tarea") || input.includes("mi manual")) {
            return await this.getCurrentActivity(input);
        }

        if (input.includes("completada") || input.includes("listo") || input.includes("ya lo hice")) {
            return await this.logActivitySuccess(input);
        }

        if (input.includes("no pude") || input.includes("me salté") || input.includes("no voy a terminar")) {
            return await this.logActivityFailure(input);
        }

        // Consultas de Negocio (Administración)
        if (input.includes("margen") || input.includes("utilidad")) {
            return await this.getTodaysMargin();
        }

        // Consultas de Producción (Manufactura)
        if (input.includes("tanda") || input.includes("pizzas")) {
            return await this.getNextBatchStatus();
        }

        // Consultas de Inventario (Logística)
        if (input.includes("falta") || input.includes("comprar")) {
            return await this.getCriticalInventory();
        }


        return "Lo siento, ¿podrías repetirlo? Estoy aprendiendo los detalles de R de Rico.";
    },

    async getTodaysMargin() {
        // Aquí el agente consulta el modelo 'Transaction' y 'Recipe'
        return {
            message: "Hola socio. El margen de utilidad hoy en Toluca es del 34%. Las conchas de vainilla son tu producto más rentable hoy, con un 52% de margen.",
            data: { margin: 0.34, topProduct: "Concha Vainilla" }
        };
    },

    async getNextBatchStatus() {
        // Consulta 'ProductionPlan' y 'KDS'
        return {
            message: "La próxima tanda de 24 Pizzas Pepperoni sale del horno en 8 minutos.",
            data: { nextBatch: "Pizza", timeLeft: 8 }
        };
    },

    async getCriticalInventory() {
        // Consulta 'Ingredient' con stock <= minStock
        return {
            message: "Atención: El stock de Harina Extra Fina está bajo (15kg). Te sugiero pedir 2 bultos más hoy.",
            data: { lowStock: ["Harina Extra Fina"], current: 15 }
        };
    },

    // --- LÓGICA DE MANUALES OPERATIVOS POR VOZ ---

    async getCurrentActivity(input) {
        // En un entorno real, aquí se identifica al empleado por su dispositivo o login de voz
        // Se consulta el OperationalManual para su rol y la hora actual
        return {
            message: "Hola Gerardo. Según tu manual del lunes, te toca: 'Encendido de Hornos y Precalentado'. Es una tarea FUNDAMENTAL de 20 minutos. ¿Necesitas que te lea el detalle del procedimiento?",
            activityId: "act-123"
        };
    },

    async logActivitySuccess(input) {
        // Registro en ActivityLog con status COMPLETED
        return {
            message: "Excelente. Actividad registrada como completada exitosamente. He notificado a la gerencia de Toluca.",
            status: "COMPLETED"
        };
    },

    async logActivityFailure(input) {
        // Registro en ActivityLog con status SKIPPED/FAILED y captura de razón
        return {
            message: "Entendido. He marcado la tarea como pendiente. Por favor, asegúrate de informarle a tu gerente operativo para que lo registre en el reporte de incidencias.",
            status: "SKIPPED"
        };
    }
};

