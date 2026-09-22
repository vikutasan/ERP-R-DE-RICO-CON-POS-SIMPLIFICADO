import React, { useState, useEffect, useCallback } from 'react';
import { AICenterService } from '../services/AICenterService';

/**
 * AIEngineStatusPanel — v26 (CENTRO DE IA)
 *
 * Pestana "Estado del Motor". Muestra el semaforo del AI Gateway usando el
 * endpoint EXISTENTE `GET /ai/status` (no se creo ningun endpoint nuevo).
 *
 * CONTRATO DEL GATEWAY (apps/api/modules/ai/service.py):
 *   { habilitada, configurada, disponible, codigo_fallback }
 *
 * DEGRADACION: si el motor esta caido, el gateway responde 503
 * `IA_NO_DISPONIBLE`. Este panel lo interpreta como "motor no disponible"
 * (semaforo rojo), NO como un crash. Esa es la politica unica del gateway.
 *
 * RESPONSABILIDAD UNICA: presentar el estado. Cero logica de negocio.
 */

// Estados posibles del semaforo, con su color y etiqueta.
const ESTADO_MOTOR = {
    CONSULTANDO: { color: 'bg-slate-500', texto: 'Consultando…' },
    OPERATIVO: { color: 'bg-emerald-500', texto: 'Operativo' },
    APAGADO: { color: 'bg-amber-500', texto: 'Apagado (modo manual)' },
    CAIDO: { color: 'bg-red-500', texto: 'No disponible' },
};

/**
 * Traduce la respuesta del gateway (o el error) a un estado del semaforo.
 * @returns {'OPERATIVO'|'APAGADO'|'CAIDO'}
 */
const resolverEstado = (estado) => {
    if (!estado) return 'CAIDO';
    if (!estado.habilitada) return 'APAGADO';
    if (!estado.configurada) return 'APAGADO';
    return estado.disponible ? 'OPERATIVO' : 'CAIDO';
};

/** Fila de dato: etiqueta a la izquierda, valor a la derecha. */
const FilaDato = ({ etiqueta, valor, mono = false }) => (
    <div className="flex items-center justify-between border-b border-white/10 py-2">
        <span className="text-sm text-slate-400">{etiqueta}</span>
        <span className={`text-sm font-semibold text-white ${mono ? 'font-mono' : ''}`}>
            {valor}
        </span>
    </div>
);

export const AIEngineStatusPanel = ({ activo = true }) => {
    const [estado, setEstado] = useState(null);
    const [error, setError] = useState(null);
    const [consultando, setConsultando] = useState(false);

    const consultar = useCallback(async () => {
        setConsultando(true);
        setError(null);
        try {
            setEstado(await AICenterService.getGatewayStatus());
        } catch (err) {
            setEstado(null);
            setError(err);
        } finally {
            setConsultando(false);
        }
    }, []);

    // Lazy fetch: solo consulta cuando la pestana esta visible.
    useEffect(() => {
        if (activo && !estado && !error) consultar();
    }, [activo, estado, error, consultar]);

    const clave = consultando && !estado ? 'CONSULTANDO' : resolverEstado(estado);
    const meta = ESTADO_MOTOR[clave];
    const esCaido = clave === 'CAIDO';

    return (
        <div className="h-full overflow-y-auto bg-slate-900 p-6">
            <div className="mx-auto max-w-2xl">
                <h2 className="mb-1 text-xl font-bold text-white">Estado del Motor de IA</h2>
                <p className="mb-6 text-sm text-slate-400">
                    Diagnostico del AI Gateway. La IA solo PROPONE; el operador CONFIRMA.
                </p>

                {/* Semaforo principal */}
                <div className="mb-6 flex items-center gap-4 rounded-xl border border-white/10 bg-slate-800 p-5">
                    <span className={`h-4 w-4 shrink-0 rounded-full ${meta.color}`} />
                    <div className="flex-1">
                        <p className="text-lg font-semibold text-white">{meta.texto}</p>
                        <p className="text-xs text-slate-400">
                            {esCaido
                                ? 'El sistema continua en modo manual sin afectar el POS.'
                                : 'El gateway responde correctamente.'}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={consultar}
                        disabled={consultando}
                        className="rounded-lg bg-[#c1d72e] px-4 py-2 text-sm font-semibold text-slate-900 transition hover:brightness-110 disabled:opacity-50"
                    >
                        {consultando ? 'Probando…' : 'Probar conexión'}
                    </button>
                </div>

                {/* Detalle del gateway */}
                <div className="rounded-xl border border-white/10 bg-slate-800 p-5">
                    <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-400">
                        Gateway
                    </h3>
                    <FilaDato etiqueta="Habilitada" valor={estado ? (estado.habilitada ? 'Sí' : 'No') : '—'} />
                    <FilaDato etiqueta="Configurada" valor={estado ? (estado.configurada ? 'Sí' : 'No') : '—'} />
                    <FilaDato etiqueta="Disponible" valor={estado ? (estado.disponible ? 'Sí' : 'No') : '—'} />
                    <FilaDato etiqueta="Código de fallback" valor={estado?.codigo_fallback || '—'} mono />
                </div>

                {/* Error (503 IA_NO_DISPONIBLE o fallo de red) */}
                {error && (
                    <div className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 p-4">
                        <p className="text-sm font-semibold text-red-300">
                            {error.esNoDisponible ? 'Motor de IA no disponible' : 'Error de conexión'}
                        </p>
                        <p className="mt-1 text-xs text-red-200/80">{error.message}</p>
                    </div>
                )}

                <p className="mt-6 text-xs text-slate-500">
                    La URL del motor y el timeout se configuran en el archivo <code>.env</code> del
                    servidor (<code>AI_LOCAL_URL</code>, <code>AI_LOCAL_TIMEOUT</code>).
                </p>
            </div>
        </div>
    );
};

export default AIEngineStatusPanel;
