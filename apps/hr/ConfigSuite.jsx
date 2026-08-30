import React, { useState, useEffect } from 'react';
import { hrService } from './hrService';

/**
 * ConfigSuite — Componente GENÉRICO de configuración
 * 
 * 1 componente → 10 suites. Recibe el tipo y renderiza automáticamente.
 * Se abre al hacer clic en el ⚙️ del encabezado de cada columna.
 */

const SUITE_SCHEMAS = {
    incidents: {
        title: '⚡ Configuración de Incidencias',
        params: [
            { key: 'llamadas_para_acta', label: 'Llamadas para generar Acta', type: 'number', default: 3 },
            { key: 'actas_para_baja', label: 'Actas para Baja', type: 'number', default: 3 },
            { key: 'dias_suspension_acta', label: 'Días de suspensión por Acta', type: 'number', default: 8 },
            { key: 'motivos_acta_directa', label: 'Motivos que saltan a Acta (separar con coma)', type: 'text', default: 'alcohol,drogas,agresion_verbal,provocacion' },
            { key: 'motivos_baja_directa', label: 'Motivos de Baja inmediata (separar con coma)', type: 'text', default: 'hurto,robo,agresion_fisica' },
        ]
    },
    uniform: {
        title: '👔 Configuración de Uniforme',
        params: [
            { key: 'fianza_total', label: 'Fianza total por uniforme ($)', type: 'number', default: 600 },
            { key: 'descuento_semanal', label: 'Descuento semanal ($)', type: 'number', default: 100 },
            { key: 'juegos_por_empleado', label: 'Juegos de uniforme por empleado', type: 'number', default: 2 },
            { key: 'prendas', label: 'Prendas del uniforme (separar con coma)', type: 'text', default: 'Paliacate,Mandil,Camiseta,Pantalón,Calzado antiderrapante café' },
        ]
    },
    coverage: {
        title: '🛡️ Configuración de Fondo de Cobertura',
        params: [
            { key: 'monto_total', label: 'Monto total del fondo ($)', type: 'number', default: 600 },
            { key: 'exhibiciones_reposicion', label: 'Exhibiciones para reposición', type: 'number', default: 3 },
            { key: 'tabla_porcentajes', label: 'Tabla: 0 días no avisa = 100%, avisa = 90%, 1d=80%, 2d=70%, 3d=60%, 4d=50%, 5d+=40%', type: 'text', default: '100,90,80,70,60,50,40' },
        ]
    },
    payroll: {
        title: '💰 Configuración de Nómina',
        params: [
            { key: 'dia_corte', label: 'Día de corte semanal', type: 'text', default: 'Domingo' },
            { key: 'dia_pago', label: 'Día de pago', type: 'text', default: 'Viernes' },
            { key: 'sueldo_dia_default', label: 'Sueldo/día default (RsG) ($)', type: 'number', default: 190 },
            { key: 'bono_sem1', label: 'Bono/día Semestre 1 ($)', type: 'number', default: 50 },
            { key: 'bono_sem2', label: 'Bono/día Semestre 2 ($)', type: 'number', default: 100 },
            { key: 'bono_sem3', label: 'Bono/día Semestre 3 ($)', type: 'number', default: 150 },
            { key: 'bono_sem4', label: 'Bono/día Semestre 4 ($)', type: 'number', default: 200 },
            { key: 'bono_sem5', label: 'Bono/día Semestre 5 ($)', type: 'number', default: 250 },
            { key: 'bono_sem6', label: 'Bono/día Semestre 6 ($)', type: 'number', default: 300 },
            { key: 'tolerancia_minutos', label: 'Tolerancia de puntualidad (minutos)', type: 'number', default: 15 },
            { key: 'retardos_para_falta', label: 'Retardos para 1 falta', type: 'number', default: 3 },
            { key: 'faltas_para_baja', label: 'Faltas para baja', type: 'number', default: 3 },
        ]
    },
    psg: {
        title: '📝 Configuración de PSGs',
        params: [
            { key: 'max_por_contrato', label: 'Máximo PSGs por contrato', type: 'number', default: 3 },
            { key: 'dias_anticipacion_requeridos', label: 'Días de anticipación requeridos', type: 'number', default: 6 },
            { key: 'dias_alta_demanda', label: 'Días de alta demanda (no PSG)', type: 'text', default: 'Fiestas patrias, Navidad, Día de muertos' },
        ]
    },
    vacations: {
        title: '🏖️ Configuración de Vacaciones',
        params: [
            { key: 'dias_primer_año', label: 'Días de vacaciones 1er año', type: 'number', default: 12 },
            { key: 'incremento_anual', label: 'Incremento anual (días)', type: 'number', default: 2 },
            { key: 'max_dias', label: 'Máximo días anuales', type: 'number', default: 20 },
            { key: 'prima_vacacional_pct', label: 'Prima vacacional (%)', type: 'number', default: 25 },
        ]
    },
    psychometrics: {
        title: '🧠 Configuración de Psicométricos',
        params: [
            { key: 'tests_obligatorios', label: 'Tests obligatorios (separar con coma)', type: 'text', default: 'disc,valores' },
            { key: 'frecuencia_meses', label: 'Frecuencia de evaluación (meses)', type: 'number', default: 6 },
        ]
    },
    kpis: {
        title: '📊 Configuración de KPIs',
        params: [
            { key: 'rubros', label: 'Rubros a evaluar (separar con coma)', type: 'text', default: 'Puntualidad,Actitud,Productividad,Limpieza,Trabajo en equipo,Atención al cliente' },
            { key: 'score_minimo', label: 'Score mínimo aceptable', type: 'number', default: 60 },
            { key: 'frecuencia', label: 'Frecuencia de evaluación', type: 'text', default: 'Mensual' },
        ]
    },
    exit_survey: {
        title: '📋 Configuración de Enc. Salida',
        params: [
            { key: 'obligatoria', label: 'Encuesta obligatoria al salir', type: 'text', default: 'Sí' },
            { key: 'preguntas_extra', label: 'Preguntas adicionales (separar con |)', type: 'text', default: '' },
        ]
    },
    severance: {
        title: '💼 Configuración de Finiquito',
        params: [
            { key: 'dias_aguinaldo', label: 'Días de aguinaldo anuales', type: 'number', default: 15 },
            { key: 'prima_vacacional_pct', label: 'Prima vacacional (%)', type: 'number', default: 25 },
            { key: 'descuento_uniforme_pendiente', label: 'Descontar uniforme pendiente', type: 'text', default: 'Sí' },
            { key: 'descuento_fondo_pendiente', label: 'Descontar fondo pendiente', type: 'text', default: 'Sí' },
        ]
    },
};

export const ConfigSuite = ({ configType, onClose }) => {
    const [values, setValues] = useState({});
    const [saving, setSaving] = useState(false);
    const [loaded, setLoaded] = useState(false);

    const schema = SUITE_SCHEMAS[configType];
    if (!schema) return null;

    useEffect(() => {
        loadConfig();
    }, [configType]);

    const loadConfig = async () => {
        try {
            const configs = await hrService.getConfig(configType);
            const vals = {};
            // Populate from saved configs
            for (const c of configs) {
                vals[c.parametro] = c.valor;
            }
            // Fill defaults for missing params
            for (const p of schema.params) {
                if (vals[p.key] === undefined) {
                    vals[p.key] = p.default;
                }
            }
            setValues(vals);
        } catch (err) {
            // Load defaults
            const vals = {};
            for (const p of schema.params) {
                vals[p.key] = p.default;
            }
            setValues(vals);
        }
        setLoaded(true);
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            for (const p of schema.params) {
                await hrService.saveConfig(configType, p.key, values[p.key]);
            }
        } catch (err) {
            console.error('Error guardando config:', err);
        }
        setSaving(false);
    };

    if (!loaded) return null;

    return (
        <div className="fixed inset-0 z-[99999] bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-[#111] border border-white/10 rounded-2xl p-6 max-w-lg w-full max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-5">
                    <h2 className="text-sm font-black uppercase tracking-wider text-white">{schema.title}</h2>
                    <button onClick={onClose} className="text-gray-500 hover:text-white text-xl">✕</button>
                </div>

                <div className="space-y-3">
                    {schema.params.map((p) => (
                        <div key={p.key}>
                            <label className="block text-[9px] font-bold uppercase tracking-wider text-gray-500 mb-1">{p.label}</label>
                            <input
                                type={p.type}
                                value={values[p.key] ?? ''}
                                onChange={(e) => setValues(prev => ({ ...prev, [p.key]: p.type === 'number' ? Number(e.target.value) : e.target.value }))}
                                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-teal-500/50 transition-all"
                            />
                        </div>
                    ))}
                </div>

                <div className="flex gap-3 mt-5">
                    <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-white/5 border border-white/10 text-gray-400 text-[10px] font-bold uppercase hover:bg-white/10 transition-all">Cancelar</button>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className={`flex-1 py-2.5 rounded-xl font-bold text-[10px] uppercase transition-all ${saving ? 'bg-gray-800 text-gray-600' : 'bg-teal-600 text-white hover:bg-teal-500'}`}
                    >
                        {saving ? 'Guardando...' : '💾 Guardar'}
                    </button>
                </div>
            </div>
        </div>
    );
};
