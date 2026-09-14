import React, { useState, useRef, useEffect } from 'react';
import {
    ArrowLeft, Save, ChevronDown, ChevronRight, Plus,
    Trash2, Copy, GripVertical, Settings, Mic, ListOrdered, Info, X, Download, Upload, Table, AlertTriangle, Loader2
} from 'lucide-react';
import { CONFIG } from '../shared/config.js';

// v19 (Fase 19.2): URL del API desde la fuente unica de verdad.
const API_BASE = CONFIG.API_BASE_URL;

const FIELD_INFO_DATA = {
    'grupoMaquinaria': {
        title: 'Grupo Maquinaria',
        subtitle: 'Manual de Operación de Planta',
        desc: 'Es el Nombre y Apellido de la estación o máquina donde ocurre este paso (ej. G-MASA-15).',
        bullets: [
            { label: 'Cero Conflictos:', text: 'El sistema bloquea que dos procesos usen la misma máquina al mismo tiempo.' },
            { label: 'Guía del Agente:', text: 'Gemma usará este nombre para mandar al panadero a la estación correcta.' },
            { label: 'Estatus de Planta:', text: 'Permite saber en tiempo real qué máquinas están ocupadas.' }
        ]
    },
    'nombrePaso': {
        title: 'Nombre del Paso',
        subtitle: 'Identificador Principal',
        desc: 'El título general de la etapa productiva.',
        bullets: [
            { label: 'Visibilidad:', text: 'Aparece en los reportes de planta y cronogramas.' }
        ]
    },
    'nombreSubpaso': {
        title: 'Nombre del Subpaso',
        subtitle: 'Identificador Técnico',
        desc: 'El nombre técnico de la acción específica que se realizará en la pantalla.',
        bullets: [
            { label: 'Referencia visual:', text: 'Es el texto que lee el operador en la pantalla si no puede escuchar al agente.' }
        ]
    },
    'instruccionVoz': {
        title: 'Instrucción de Voz',
        subtitle: 'El guion del Agente',
        desc: 'El texto exacto, letra por letra, que Gemma le hablará al panadero a través del auricular.',
        bullets: [
            { label: 'Claridad:', text: 'Usa oraciones cortas y directas.' },
            { label: 'Tono:', text: 'Gemma ajustará su énfasis dependiendo de la Criticidad de este paso.' }
        ]
    },
    'tHumano': {
        title: 'Tiempo Humano',
        subtitle: 'Trabajo Físico',
        desc: 'Minutos que el operador requiere estar interactuando físicamente con los ingredientes o la máquina.',
        bullets: [
            { label: 'Métricas:', text: 'Afecta el cálculo de productividad y costo humano.' }
        ]
    },
    'tAutonomo': {
        title: 'Tiempo Autónomo',
        subtitle: 'Proceso Automático',
        desc: 'Minutos que la masa o máquina trabaja sola (ej. Fermentación, Batido).',
        bullets: [
            { label: 'Alertas:', text: 'Gemma usará este tiempo como temporizador y avisará cuando concluya.' }
        ]
    },
    'recurso': {
        title: 'Recurso Asignado',
        subtitle: 'Ubicación Física',
        desc: 'La máquina o mesa específica donde el panadero debe pararse.',
        bullets: [
            { label: 'Dirección:', text: 'Gemma dirá: "Ve a la Mesa 1" basada en este campo.' }
        ]
    },
    'nivelCritico': {
        title: 'Nivel de Criticidad',
        subtitle: 'Tono y Urgencia',
        desc: 'Define qué tan grave es equivocarse en este paso.',
        bullets: [
            { label: 'Modulación de Voz:', text: 'Si es ALTO, Gemma hablará más fuerte y enfática para asegurar atención total.' }
        ]
    },
    'operarioLibre': {
        title: 'Estado del Operario (Libre / Ocupado)',
        subtitle: 'Control de Multitasking',
        desc: 'Determina si el panadero debe permanecer físicamente en esta máquina (Ocupado) o si puede retirarse a realizar otra tarea (Libre).',
        bullets: [
            { label: 'Ocupado:', text: 'El panadero está anclado a la estación de trabajo prestando atención al proceso.' },
            { label: 'Libre:', text: 'Gemma dirá "Tienes X minutos libres, puedes avanzar otra receta" optimizando los tiempos muertos.' }
        ]
    },
    'confirmacionVoz': {
        title: 'Confirmación por Voz',
        subtitle: 'Escucha Activa',
        desc: 'Gemma esperará a que el panadero responda verbalmente (ej. "Listo" o "Hecho") antes de dictar el siguiente paso.',
        bullets: [
            { label: 'Uso:', text: 'Actívalo en pesajes críticos o cuando el panadero cambie de máquina.' }
        ]
    },
    'triggerInicio': {
        title: 'Trigger de Inicio',
        subtitle: 'Detonador del Paso',
        desc: 'La condición exacta que hace que Gemma comience a hablar o inicie el paso actual.',
        bullets: [
            { label: 'Autonomía:', text: 'Un paso no arrancará hasta que este evento se cumpla en el sistema.' }
        ]
    },
    'preguntaQA': {
        title: 'Pregunta de Calidad (QA)',
        subtitle: 'Validación Activa',
        desc: 'Pregunta específica de verificación que Gemma hará al finalizar el paso.',
        bullets: [
            { label: 'Auditoría:', text: 'Gemma podría preguntar: "¿A qué temperatura quedó la masa?"' }
        ]
    },
    'tipCoaching': {
        title: 'Tip de Coaching',
        subtitle: 'Pista Sensorial Extra',
        desc: 'Consejo de experto panadero que Gemma soltará de forma preventiva.',
        bullets: [
            { label: 'Ejemplo:', text: '"Recuerda que la masa debe verse lisa y brillante antes de sacarla".' }
        ]
    },
    'grupoInseparable': {
        title: 'Grupo Inseparable',
        subtitle: 'Pasos Vinculados',
        desc: 'Un ID en común para agrupar pasos que NO pueden interrumpirse entre sí.',
        bullets: [
            { label: 'Seguridad:', text: 'Evita que el sistema mande a un panadero a hacer otra cosa a la mitad de un amasado crítico.' }
        ]
    },
    'temperaturaObjetivo': {
        title: 'Temperatura Objetivo',
        subtitle: 'Parámetro Crítico',
        desc: 'Temperatura ideal (°C) a la que debe estar la masa al terminar este paso.',
        bullets: [
            { label: 'Verificación:', text: 'Gemma instruirá al panadero usar el termómetro y alcanzar esta meta térmica.' }
        ]
    },
    'senalesCompletado': {
        title: 'Señales Visuales/Táctiles',
        subtitle: 'Evaluación Organoléptica',
        desc: '¿Cómo se ve o se siente la masa si el paso se ejecutó perfectamente?',
        bullets: [
            { label: 'Orientación:', text: 'Gemma dice: "Busca que desarrolle la clásica red de gluten translúcida".' }
        ]
    },
    'erroresComunes': {
        title: 'Errores Comunes',
        subtitle: 'Prevención de Mermas',
        desc: 'Peligros típicos en este paso. Gemma advertirá sobre ellos antes de empezar.',
        bullets: [
            { label: 'Ejemplo:', text: '"No sobrebatas o quemarás irremediablemente la levadura".' }
        ]
    },
    'ingredientesRequeridos': {
        title: 'Ingredientes y Porcentajes',
        subtitle: 'Dosificación Técnica',
        desc: 'Selecciona los ingredientes específicos de la receta y el porcentaje de participación en este subpaso.',
        bullets: [
            { label: 'Precisión:', text: 'Permite al Agente Gemma dar instrucciones de pesaje exactas.' },
            { label: 'Filtro BOM:', text: 'Solo muestra ingredientes que diste de alta en la pestaña RECETA.' }
        ]
    },
    'dependenciaPasoPrevio': {
        title: 'Dependencia Obligatoria',
        subtitle: 'Orden Lógico Estricto',
        desc: 'ID o nombre de un paso que DEBE estar 100% terminado antes de iniciar este.',
        bullets: [
            { label: 'Flujo de Producción:', text: 'Impide que Gemma adelante el proceso si la etapa previa (ej. Prefermento) no ha concluido.' }
        ]
    }
};

export const ProcesoProduccionMasaUI = ({ masaId, masaNombre, theme, onClose, onSave, onSaveDB, initialData, recipeMatrix, onOpenGlobalAgent }) => {
    // If theme is not provided (safety fallback), we use a default neutral theme
    const activeTheme = theme || { bg: '#f3f4f6', input: '#ffffff', text: '#1f2937', border: '#e5e7eb' };

    // Initial state matching the 28-column schema we defined
    const [infoModalField, setInfoModalField] = useState(null);
    const [equipments, setEquipments] = useState([]);
    const [saveStatus, setSaveStatus] = useState('idle'); // 'idle' | 'saving' | 'saved'
    const [subpasoToDelete, setSubpasoToDelete] = useState(null);
    const [pasoToDelete, setPasoToDelete] = useState(null);

    useEffect(() => {
        const fetchEquipments = async () => {
            try {
                const resp = await fetch(`${API_BASE}/production/equipment`);
                if (resp.ok) setEquipments(await resp.json());
            } catch (e) { console.error('Error fetching equipments:', e); }
        };
        fetchEquipments();
    }, []);

    const FieldLabel = ({ id, text, isMain = false }) => (
        <div className="flex items-center gap-2 mb-1">
            <label style={{ color: activeTheme.text }} className={`${isMain ? 'text-[10px]' : 'text-xs'} font-black uppercase tracking-widest opacity-80 flex items-center`}>
                {text}
            </label>
            <button 
                onClick={(e) => { e.stopPropagation(); setInfoModalField(id); }}
                className="w-4 h-4 rounded-full bg-orange-500 text-white flex items-center justify-center hover:scale-125 transition-all shadow-sm shrink-0"
                title="Saber más"
            >
                <Info size={10} fill="currentColor" />
            </button>
        </div>
    );

    const DualTimeInput = ({ value, onChange }) => {
        const totalMinutes = parseFloat(value) || 0;
        const mins = Math.floor(totalMinutes);
        const secs = Math.round((totalMinutes - mins) * 60);

        const updateTime = (m, s) => {
            const final = parseFloat(m) + (parseFloat(s) / 60);
            onChange(final.toFixed(4)); // Alta precisión para evitar errores de redondeo
        };

        return (
            <div className="flex items-center gap-2 bg-black/10 p-1 rounded-2xl border border-black/10 shadow-inner">
                <div className="flex-1 flex flex-col">
                    <input 
                        type="number" 
                        min="0"
                        placeholder="0"
                        style={{ color: activeTheme.text }} 
                        value={mins || ''} 
                        onChange={e => updateTime(e.target.value || 0, secs)} 
                        className="w-full bg-transparent p-2 outline-none font-black text-center text-sm placeholder-black/20" 
                    />
                    <span className="text-[8px] uppercase font-black text-center -mt-1 pb-1 opacity-60" style={{ color: activeTheme.text }}>MIN.</span>
                </div>
                <div className="font-black text-xl mb-3 opacity-30" style={{ color: activeTheme.text }}>:</div>
                <div className="flex-1 flex flex-col">
                    <input 
                        type="number" 
                        min="0"
                        max="59"
                        placeholder="0"
                        style={{ color: activeTheme.text }} 
                        value={secs || ''} 
                        onChange={e => {
                            let s = parseInt(e.target.value) || 0;
                            if (s > 59) s = 59;
                            updateTime(mins, s);
                        }} 
                        className="w-full bg-transparent p-2 outline-none font-black text-center text-sm placeholder-black/20" 
                    />
                    <span className="text-[8px] uppercase font-black text-center -mt-1 pb-1 opacity-60" style={{ color: activeTheme.text }}>SEG.</span>
                </div>
            </div>
        );
    };

    const MilitaryTimeInput = ({ value, onChange }) => {
        const [hh, mm] = (value || "00:00").split(':');

        const updateTime = (h, m) => {
            const final = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
            onChange(final);
        };

        return (
            <div className="flex items-center gap-2 bg-black/10 p-1 rounded-2xl border border-black/10 shadow-inner">
                <div className="flex-1 flex flex-col">
                    <input 
                        type="number" min="0" max="23" placeholder="00"
                        style={{ color: activeTheme.text }} 
                        value={hh} 
                        onChange={e => {
                            let h = parseInt(e.target.value) || 0;
                            if (h > 23) h = 23;
                            updateTime(h, mm);
                        }} 
                        className="w-full bg-transparent p-2 outline-none font-black text-center text-sm placeholder-black/20" 
                    />
                    <span className="text-[8px] uppercase font-black text-center -mt-1 pb-1 opacity-60" style={{ color: activeTheme.text }}>HRS.</span>
                </div>
                <div className="font-black text-xl mb-3 opacity-30" style={{ color: activeTheme.text }}>:</div>
                <div className="flex-1 flex flex-col">
                    <input 
                        type="number" min="0" max="59" placeholder="00"
                        style={{ color: activeTheme.text }} 
                        value={mm} 
                        onChange={e => {
                            let m = parseInt(e.target.value) || 0;
                            if (m > 59) m = 59;
                            updateTime(hh, m);
                        }} 
                        className="w-full bg-transparent p-2 outline-none font-black text-center text-sm placeholder-black/20" 
                    />
                    <span className="text-[8px] uppercase font-black text-center -mt-1 pb-1 opacity-60" style={{ color: activeTheme.text }}>MIN.</span>
                </div>
            </div>
        );
    };

    const HoursMinutesInput = ({ value, onChange }) => {
        const totalMinutes = parseFloat(value) || 0;
        const hrs = Math.floor(totalMinutes / 60);
        const mins = Math.round(totalMinutes % 60);

        const updateTime = (h, m) => {
            const final = (parseFloat(h) * 60) + parseFloat(m);
            onChange(final.toFixed(4));
        };

        return (
            <div className="flex items-center gap-2 bg-black/10 p-1 rounded-2xl border border-black/10 shadow-inner">
                <div className="flex-1 flex flex-col">
                    <input 
                        type="number" min="0" placeholder="0"
                        style={{ color: activeTheme.text }} 
                        value={hrs || ''} 
                        onChange={e => updateTime(e.target.value || 0, mins)} 
                        className="w-full bg-transparent p-2 outline-none font-black text-center text-sm placeholder-black/20" 
                    />
                    <span className="text-[8px] uppercase font-black text-center -mt-1 pb-1 opacity-60" style={{ color: activeTheme.text }}>HRS.</span>
                </div>
                <div className="font-black text-xl mb-3 opacity-30" style={{ color: activeTheme.text }}>:</div>
                <div className="flex-1 flex flex-col">
                    <input 
                        type="number" min="0" max="59" placeholder="0"
                        style={{ color: activeTheme.text }} 
                        value={mins || ''} 
                        onChange={e => {
                            let m = parseInt(e.target.value) || 0;
                            if (m > 59) m = 59;
                            updateTime(hrs, m);
                        }} 
                        className="w-full bg-transparent p-2 outline-none font-black text-center text-sm placeholder-black/20" 
                    />
                    <span className="text-[8px] uppercase font-black text-center -mt-1 pb-1 opacity-60" style={{ color: activeTheme.text }}>MIN.</span>
                </div>
            </div>
        );
    };

    const [pasos, setPasos] = useState(() => {
        const masaName = masaId || 'la masa en cuestión';
        const defaultInstruccion = `Revisa la orden. ¿Cuántas preparaciones de ${masaName} harás hoy?`;
        const defaultQA = `¿Cuántas preparaciones de ${masaName} harás hoy?`;

        let data = [];
        if (initialData && initialData.length > 0) {
            data = JSON.parse(JSON.stringify(initialData));
            if (data[0].subpasos && data[0].subpasos.length > 0) {
                const sub = data[0].subpasos[0];
                if (sub.instruccionVoz?.includes('¿Cuántas preparaciones harás hoy?') || sub.instruccionVoz?.includes('¿Cuántas preparaciones de masa') || sub.instruccionVoz?.includes('¿Cuántas preparaciones de MASA')) {
                    sub.instruccionVoz = defaultInstruccion;
                    sub.preguntaQA = defaultQA;
                }
            }
        } else {
            data = [
                {
                    id: '1',
                    nombre: 'IDENTIFICAR EL MEP',
                    idBloque: 'G-MASA-15',
                    isExpanded: true,
                    subpasos: [
                        {
                            id: '1.1',
                            nombre: 'Revisar orden de producción',
                            instruccionVoz: defaultInstruccion,
                            tHumano: 1.0,
                            tAutonomo: 0.0,
                            recurso: '',
                            recursoConfigs: {},
                            nivelCritico: 'bajo',
                            operarioLibre: false,
                            confirmacionVoz: true,
                            triggerInicio: 'inicio_turno',
                            preguntaQA: defaultQA,
                            tipCoaching: '',
                            grupoInseparable: '',
                            temperaturaObjetivo: '',
                            senalesCompletado: '',
                            erroresComunes: '',
                            ingredientesRequeridos: '',
                            dependenciaPasoPrevio: '',
                            tiempoHorneadoRelativo: 0,
                            horaFijaProgramada: '00:00',
                            habilitarComandos: true,
                            palabraInicio: 'VOY',
                            palabraPausa: 'PAUSA',
                            showAdvanced: false
                        }
                    ]
                }
            ];
        }

        // ASEGURAR QUE TODOS TENGAN INTERNAL ID
        return data.map(p => ({
            ...p,
            internalId: p.internalId || crypto.randomUUID?.() || Math.random().toString(36).substring(7),
            subpasos: (p.subpasos || []).map(sp => ({
                ...sp,
                internalId: sp.internalId || crypto.randomUUID?.() || Math.random().toString(36).substring(7)
            }))
        }));
    });

    // SINCRONIZADOR: Si initialData cambia (por un guardado exitoso), actualizar pasos localmente
    useEffect(() => {
        if (initialData && initialData.length > 0) {
            const syncedPasos = initialData.map(p => ({
                ...p,
                internalId: p.internalId || crypto.randomUUID?.() || Math.random().toString(36).substring(7),
                subpasos: (p.subpasos || []).map(sp => ({
                    ...sp,
                    internalId: sp.internalId || crypto.randomUUID?.() || Math.random().toString(36).substring(7)
                }))
            }));
            setPasos(syncedPasos);
        }
    }, [initialData]);

    const fileInputRef = useRef(null);

    const generateVoiceInstruction = (pasoId, spId) => {
        const paso = pasos.find(p => p.id === pasoId);
        if (!paso) return;
        const sp = paso.subpasos.find(s => s.id === spId);
        if (!sp) return;

        const eq = equipments.find(e => String(e.id) === String(sp.recurso));
        const eqName = eq ? eq.name.toLowerCase() : 'la máquina';
        const estado = sp.recursoConfigs?.estado || '';
        const parseTime = (val) => {
            const total = parseFloat(val) || 0;
            const m = Math.floor(total);
            const s = Math.round((total - m) * 60);
            return [m, s];
        };

        const [min, seg] = parseTime(sp.recursoConfigs?.tiempo_operacion);
        const accion = sp.recursoConfigs?.accionAlConcluir || '';

        let text = "";

        // 1. Acción inicial
        if (estado.startsWith("ENCENDER A ")) {
            text += `Enciende la ${eqName} en ${estado.replace("ENCENDER A ", "").toLowerCase()}. `;
        } else if (estado.startsWith("SIN APAGAR, CAMBIAR A ")) {
            text += `Sin apagar, cambia la ${eqName} a ${estado.replace("SIN APAGAR, CAMBIAR A ", "").toLowerCase()}. `;
        } else if (estado === "APAGADA") {
            text += `Apaga la ${eqName}. `;
        }

        // 2. Tiempo
        if (estado !== "APAGADA" && (min > 0 || seg > 0)) {
            const timeText = min > 0 ? `${min} min${seg > 0 ? ` y ${seg} seg` : ''}` : `${seg} seg`;
            text = text.trim() + `. Programaré ${timeText} y `;
        }

        // 3. Fase 2 (Si existe)
        if (accion === "AVISAR AL OPERARIO Y NUEVA VELOCIDAD SIN APAGAR" && sp.recursoConfigs?.nextVelocidad) {
            const nextVel = sp.recursoConfigs.nextVelocidad.replace("SIN APAGAR, CAMBIAR A ", "").toLowerCase();
            const [nMin, nSeg] = parseTime(sp.recursoConfigs.nextTiempo);
            const nextAccion = sp.recursoConfigs.nextAccion || '';

            const timeText = min > 0 ? `${min} min${seg > 0 ? ` y ${seg} seg` : ''}` : `${seg} seg`;
            text = `Enciende la ${eqName} en ${estado.replace("ENCENDER A ", "").toLowerCase()}. Programaré ${timeText} y te avisaré para que, sin apagar, cambies a ${nextVel}. `;
            
            const nextTimeText = nMin > 0 ? `${nMin} min${nSeg > 0 ? ` y ${nSeg} seg` : ''}` : `${nSeg} seg`;
            text += `Programaré ${nextTimeText} más y `;

            // 4. Conclusión Fase 2
            if (nextAccion === "AVISAR AL OPERARIO Y APAGAR") {
                text += "te avisaré para que apagues.";
            } else if (nextAccion === "AVISAR AL OPERARIO Y ADICIONAR INGREDIENTE SIN APAGAR") {
                text += "te avisaré para añadir ingredientes.";
            } else {
                text += "te avisaré al concluir.";
            }
        } else {
            // 4. Conclusión Fase 1 (Solo si no hay Fase 2)
            if (estado.startsWith("ENCENDER A ")) {
                text = `Enciende la ${eqName} en ${estado.replace("ENCENDER A ", "").toLowerCase()}. `;
            } else if (estado.startsWith("SIN APAGAR, CAMBIAR A ")) {
                text = `Sin apagar, cambia la ${eqName} a ${estado.replace("SIN APAGAR, CAMBIAR A ", "").toLowerCase()}. `;
            } else if (estado === "APAGADA") {
                text = `Apaga la ${eqName}. `;
            }

            if (estado !== "APAGADA" && (min > 0 || seg > 0)) {
                const timeText = min > 0 ? `${min} min${seg > 0 ? ` y ${seg} seg` : ''}` : `${seg} seg`;
                text += `Programaré ${timeText} y `;
            }

            if (accion === "AVISAR AL OPERARIO Y APAGAR") {
                text += "te avisaré para que apagues.";
            } else if (accion === "AVISAR AL OPERARIO Y NUEVA VELOCIDAD SIN APAGAR") {
                text += "te avisaré para el cambio de velocidad.";
            } else if (accion === "AVISAR AL OPERARIO Y ADICIONAR INGREDIENTE SIN APAGAR") {
                text += "te avisaré para añadir ingredientes.";
            }
        }

        if (text) {
            handleSubpasoChange(pasoId, spId, 'instruccionVoz', text.trim());
        }
    };

    const handleExport = () => {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(pasos, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", `config_agente_${masaId || 'plantilla'}.json`);
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    };

    const handleExportCSV = () => {
        const headers = [
            "Paso_ID", "Nombre_Paso", "Grupo_Maquinaria",
            "Subpaso_ID", "Nombre_Subpaso", "Instruccion_Voz",
            "T_Humano_min", "T_Autonomo_min", "Recurso", "Config_Recurso", "Nivel_Critico",
            "Operario_Libre", "Confirmacion_Voz", "Trigger_Inicio",
            "Pregunta_QA", "Tip_Coaching", "Grupo_Inseparable",
            "Temperatura_Objetivo", "Senales_Completado", "Errores_Comunes",
            "Ingredientes", "Dependencia"
        ];

        let csvContent = headers.join(",") + "\n";

        pasos.forEach(paso => {
            const pasoId = `"${paso.id || ''}"`;
            const nombrePaso = `"${(paso.nombre || '').replace(/"/g, '""')}"`;
            const grupo = `"${(paso.idBloque || '').replace(/"/g, '""')}"`;

            if (paso.subpasos && paso.subpasos.length > 0) {
                paso.subpasos.forEach(sp => {
                    const row = [
                        pasoId, nombrePaso, grupo,
                        `"${sp.id || ''}"`,
                        `"${(sp.nombre || '').replace(/"/g, '""')}"`,
                        `"${(sp.instruccionVoz || '').replace(/"/g, '""')}"`,
                        sp.tHumano || 0,
                        sp.tAutonomo || 0,
                        `"${(sp.recurso || '').replace(/"/g, '""')}"`,
                        `"${(JSON.stringify(sp.recursoConfigs || {})).replace(/"/g, '""')}"`,
                        `"${(sp.nivelCritico || '').replace(/"/g, '""')}"`,
                        sp.operarioLibre ? "SI" : "NO",
                        sp.confirmacionVoz ? "SI" : "NO",
                        `"${(sp.triggerInicio || '').replace(/"/g, '""')}"`,
                        `"${(sp.preguntaQA || '').replace(/"/g, '""')}"`,
                        `"${(sp.tipCoaching || '').replace(/"/g, '""')}"`,
                        `"${(sp.grupoInseparable || '').replace(/"/g, '""')}"`,
                        `"${(sp.temperaturaObjetivo || '').replace(/"/g, '""')}"`,
                        `"${(sp.senalesCompletado || '').replace(/"/g, '""')}"`,
                        `"${(sp.erroresComunes || '').replace(/"/g, '""')}"`,
                        `"${(sp.ingredientesRequeridos || '').replace(/"/g, '""')}"`,
                        `"${(sp.dependenciaPasoPrevio || '').replace(/"/g, '""')}"`
                    ];
                    csvContent += row.join(",") + "\n";
                });
            } else {
                const row = [pasoId, nombrePaso, grupo, "","","","","","","","","","","","","","","","","","",""];
                csvContent += row.join(",") + "\n";
            }
        });

        // BOM para asegurar que Excel lea UTF-8 (Acentos y Ñ) correctamente
        const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", `config_agente_${masaId || 'reporte'}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleImportClick = () => {
        if (fileInputRef.current) {
            fileInputRef.current.click();
        }
    };

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const importedData = JSON.parse(event.target.result);
                if (Array.isArray(importedData)) {
                    setPasos(importedData);
                    e.target.value = null; 
                } else {
                    alert("El archivo no tiene el formato correcto (se esperaba un arreglo de pasos).");
                }
            } catch (err) {
                alert("Error al leer el archivo JSON: " + err.message);
            }
        };
        reader.readAsText(file);
    };

    const handleSubpasoChange = (pasoId, subpasoId, field, value) => {
        setPasos(pasos.map(p => {
            if (p.id !== pasoId) return p;
            return {
                ...p,
                subpasos: p.subpasos.map(sp => {
                    if (sp.id !== subpasoId) return sp;
                    return { ...sp, [field]: value };
                })
            };
        }));
    };

    const handleRecursoConfigChange = (pasoId, subpasoId, key, value) => {
        setPasos(pasos.map(p => {
            if (p.id !== pasoId) return p;
            return {
                ...p,
                subpasos: p.subpasos.map(sp => {
                    if (sp.id !== subpasoId) return sp;
                    return { 
                        ...sp, 
                        recursoConfigs: { ...(sp.recursoConfigs || {}), [key]: value } 
                    };
                })
            };
        }));
    };

    const toggleStep = (pasoId) => {
        setPasos(pasos.map(p => 
            p.id === pasoId ? { ...p, isExpanded: !p.isExpanded } : p
        ));
    };

    const toggleAdvanced = (pasoId, subpasoId) => {
        setPasos(pasos.map(p => {
            if (p.id !== pasoId) return p;
            return {
                ...p,
                subpasos: p.subpasos.map(sp => {
                    if (sp.id !== subpasoId) return sp;
                    return { ...sp, showAdvanced: !sp.showAdvanced };
                })
            };
        }));
    };

    const addSubpaso = (pasoId) => {
        setPasos(pasos.map(p => {
            if (p.id !== pasoId) return p;
            const newId = `${p.id}.${p.subpasos.length + 1}`;
            return {
                ...p,
                subpasos: [...p.subpasos, {
                    id: newId,
                    internalId: crypto.randomUUID?.() || Math.random().toString(36).substring(7),
                    nombre: 'Nuevo Subpaso',
                    instruccionVoz: '',
                    tHumano: 0.5,
                    tAutonomo: 0.0,
                    recurso: '',
                    recursoConfigs: {},
                    nivelCritico: 'bajo',
                    operarioLibre: false, // Default to 'Ocupado' as requested by user
                    confirmacionVoz: true,
                    triggerInicio: 'confirmacion_anterior',
                    preguntaQA: 'LISTO',
                    tipCoaching: '',
                    habilitarComandos: true,
                    palabraInicio: 'VOY',
                    palabraPausa: 'PAUSA',
                    grupoInseparable: '',
                    temperaturaObjetivo: '',
                    senalesCompletado: '',
                    erroresComunes: '',
                    ingredientesRequeridos: '',
                    dependenciaPasoPrevio: '',
                    tiempoHorneadoRelativo: 0,
                    horaFijaProgramada: '00:00',
                    showAdvanced: false
                }]
            };
        }));
    };

    const addPaso = () => {
        const newId = `${pasos.length + 1}`;
        setPasos([...pasos, {
            id: newId,
            internalId: crypto.randomUUID?.() || Math.random().toString(36).substring(7),
            nombre: 'Nuevo Paso',
            idBloque: '',
            isExpanded: true,
            subpasos: []
        }]);
    };

    const removeSubpaso = (pasoId, subpasoId) => {
        setPasos(pasos.map(p => {
            if (p.id !== pasoId) return p;
            return {
                ...p,
                subpasos: p.subpasos.filter(sp => sp.id !== subpasoId)
            };
        }));
    };

    const handlePasoReorder = (pasoInternalId, newOrderStr) => {
        let newOrder = parseInt(newOrderStr);
        if (isNaN(newOrder) || newOrder < 1) return;
        
        const oldIndex = pasos.findIndex(p => p.internalId === pasoInternalId);
        if (oldIndex === -1) return;

        let targetIndex = newOrder - 1;
        if (targetIndex >= pasos.length) targetIndex = pasos.length - 1;

        const newPasos = [...pasos];
        const [movedItem] = newPasos.splice(oldIndex, 1);
        newPasos.splice(targetIndex, 0, movedItem);

        // Renormalizar IDs basados en el nuevo orden de la matriz
        const normalized = newPasos.map((p, idx) => {
            const newId = `${idx + 1}`;
            const newSubpasos = (p.subpasos || []).map((sp, spIdx) => ({
                ...sp,
                id: `${newId}.${spIdx + 1}`
            }));
            return { ...p, id: newId, subpasos: newSubpasos };
        });

        setPasos(normalized);
    };

    const handleSubpasoReorder = (oldPasoInternalId, subpasoInternalId, newFullOrderStr) => {
        let targetPasoId = "";
        let targetSubOrder = 0;

        if (newFullOrderStr.includes('.')) {
            const parts = newFullOrderStr.split('.');
            targetPasoId = parts[0].trim();
            targetSubOrder = parseInt(parts[1]) || 0;
        } else {
            // Si solo ponen un número, asumimos que es el mismo paso actual
            const currentPaso = pasos.find(p => p.internalId === oldPasoInternalId);
            targetPasoId = currentPaso?.id || "";
            targetSubOrder = parseInt(newFullOrderStr) || 0;
        }

        if (targetSubOrder < 1) return;

        // 1. Verificar que el paso destino existe
        const targetPasoExists = pasos.some(p => p.id === targetPasoId);
        if (!targetPasoExists) return;

        // 2. Extraer el subpaso
        let movedSubpaso = null;
        const pasosWithoutSub = pasos.map(p => {
            const idx = p.subpasos.findIndex(sp => sp.internalId === subpasoInternalId);
            if (idx === -1) return p;
            
            const subs = [...p.subpasos];
            [movedSubpaso] = subs.splice(idx, 1);
            return { ...p, subpasos: subs };
        });

        if (!movedSubpaso) return;

        // 3. Insertar en destino
        const pasosWithSub = pasosWithoutSub.map(p => {
            if (p.id !== targetPasoId) return p;

            const subs = [...p.subpasos];
            let targetIdx = targetSubOrder - 1;
            if (targetIdx > subs.length) targetIdx = subs.length;
            
            subs.splice(targetIdx, 0, movedSubpaso);
            return { ...p, subpasos: subs };
        });

        // 4. Renormalizar TODO
        const normalized = pasosWithSub.map((p, idx) => {
            const newId = `${idx + 1}`;
            const newSubpasos = (p.subpasos || []).map((sp, spIdx) => ({
                ...sp,
                id: `${newId}.${spIdx + 1}`
            }));
            return { ...p, id: newId, subpasos: newSubpasos };
        });

        setPasos(normalized);
    };

    const duplicateSubpaso = (pasoId, subpaso) => {
        setPasos(pasos.map(p => {
            if (p.id !== pasoId) return p;
            const newId = `${p.id}.${p.subpasos.length + 1}`;
            // Deep copy to avoid reference issues
            const duplicated = JSON.parse(JSON.stringify(subpaso));
            duplicated.id = newId;
            duplicated.nombre = `${duplicated.nombre} (Copia)`;
            return {
                ...p,
                subpasos: [...p.subpasos, duplicated]
            };
        }));
    };

    return (
        <div style={{ backgroundColor: activeTheme.bg }} className="absolute inset-0 z-50 overflow-y-auto w-full h-full transition-colors duration-500">
            <input 
                type="file" 
                ref={fileInputRef} 
                style={{ display: 'none' }} 
                accept=".json" 
                onChange={handleFileChange} 
            />
            <div className="max-w-[1400px] mx-auto p-8">
                
                {/* HEADER */}
                <div style={{ backgroundColor: activeTheme.input, borderColor: activeTheme.border }} className="flex flex-col xl:flex-row justify-between xl:items-center gap-6 mb-8 p-6 rounded-2xl shadow-sm border">
                    <div className="flex-1 min-w-0">
                        <h1 style={{ color: activeTheme.text }} className="text-3xl md:text-4xl font-black italic uppercase">Configuración del Agente</h1>
                        <div className="mt-2 flex flex-wrap items-center gap-4">
                            <span style={{ backgroundColor: 'rgba(0,0,0,0.1)', color: activeTheme.text }} className="px-3 py-1.5 rounded-xl text-[12px] font-black uppercase tracking-widest shrink-0">{masaId || 'N/A'}</span>
                            <span style={{ color: activeTheme.text }} className="font-black text-lg md:text-xl uppercase tracking-tight">{masaNombre || 'Masa Seleccionada'}</span>
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-4 shrink-0">
                        <div className="flex flex-wrap gap-2 xl:mr-4 xl:border-r border-black/10 xl:pr-4">
                            <button 
                                onClick={onOpenGlobalAgent} 
                                style={{ backgroundColor: activeTheme.text, color: activeTheme.bg }} 
                                className="px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-all flex items-center gap-2 shadow-lg"
                                title="Ajustar Parámetros Generales de Voz"
                            >
                                <Mic size={14}/> Parámetros Generales
                            </button>
                            <button 
                                onClick={handleImportClick}
                                style={{ color: activeTheme.text, backgroundColor: 'rgba(0,0,0,0.05)' }}
                                className="px-4 py-3 rounded-2xl hover:bg-black/10 flex items-center gap-2 font-black uppercase text-[10px] tracking-widest transition-all"
                                title="Importar configuración desde un archivo JSON"
                            >
                                <Upload size={14} /> Importar
                            </button>
                            <button 
                                onClick={handleExport}
                                style={{ color: activeTheme.text, backgroundColor: 'rgba(0,0,0,0.05)' }}
                                className="px-4 py-3 rounded-2xl hover:bg-black/10 flex items-center gap-2 font-black uppercase text-[10px] tracking-widest transition-all"
                                title="Exportar configuración a un archivo JSON"
                            >
                                <Download size={14} /> JSON
                            </button>
                            <button 
                                onClick={handleExportCSV}
                                style={{ color: '#10b981', backgroundColor: '#ecfdf5' }}
                                className="px-4 py-3 rounded-2xl hover:bg-[#d1fae5] flex items-center gap-2 font-black uppercase text-[10px] tracking-widest transition-all shadow-sm border border-[#a7f3d0]"
                                title="Exportar configuración a Excel (CSV)"
                            >
                                <Download size={14} /> Excel
                            </button>
                        </div>
                        <button 
                            onClick={onClose}
                            style={{ color: activeTheme.text, borderColor: activeTheme.text }}
                            className="px-6 py-3 border-2 rounded-2xl hover:opacity-70 flex items-center gap-2 font-black uppercase text-xs tracking-widest transition-all"
                        >
                            <ArrowLeft size={16} /> Volver
                        </button>
                        <button 
                            onClick={async () => { 
                                setSaveStatus('saving');
                                try {
                                    if(onSaveDB) await onSaveDB(pasos);
                                    else if(onSave) onSave(pasos);
                                    setSaveStatus('saved');
                                    setTimeout(() => { setSaveStatus('idle'); onClose(); }, 1000);
                                } catch(e) {
                                    setSaveStatus('idle');
                                }
                            }}
                            style={{ backgroundColor: activeTheme.text, color: activeTheme.bg }}
                            className="px-6 py-3 rounded-2xl hover:scale-105 transition-all flex items-center gap-2 font-black uppercase text-xs tracking-widest shadow-xl"
                        >
                            <Save size={16} /> Guardar
                        </button>
                    </div>
                </div>

                {/* PASOS */}
                {pasos.map((paso, index) => (
                    <div key={paso.internalId} style={{ backgroundColor: activeTheme.input, borderColor: activeTheme.border }} className="border rounded-3xl mb-6 shadow-sm overflow-hidden transition-all duration-300">
                        {/* Step Header */}
                        <div 
                            style={{ borderBottomColor: activeTheme.border }}
                            className="p-6 border-b flex items-center gap-4 cursor-pointer hover:opacity-80 transition-opacity"
                            onClick={(e) => {
                                if(e.target.tagName !== 'INPUT') toggleStep(paso.id);
                            }}
                        >
                            <div style={{ backgroundColor: activeTheme.text, color: activeTheme.bg }} className="w-12 h-12 rounded-xl flex items-center justify-center font-black italic shrink-0 shadow-md overflow-hidden">
                                <input 
                                    type="text"
                                    className="w-full h-full bg-transparent text-center outline-none cursor-text focus:bg-white/20"
                                    defaultValue={paso.id}
                                    key={`paso-id-${paso.id}`}
                                    onClick={e => e.stopPropagation()}
                                    onBlur={e => handlePasoReorder(paso.internalId, e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && handlePasoReorder(paso.internalId, e.target.value)}
                                />
                            </div>
                            <div className="flex-1 flex flex-col max-w-[500px]">
                                <FieldLabel id="nombrePaso" text="Nombre del Paso Principal" isMain />
                                <input 
                                    type="text" 
                                    style={{ color: activeTheme.text }}
                                    className="w-full p-3 border border-black/5 rounded-xl bg-white/50 focus:bg-white outline-none transition-all font-black text-sm" 
                                    value={paso.nombre}
                                    onChange={e => setPasos(pasos.map(p => p.id === paso.id ? {...p, nombre: e.target.value} : p))}
                                />
                            </div>
                            <div className="flex-1 flex flex-col max-w-[200px]">
                                <FieldLabel id="grupoMaquinaria" text="Grupo Maquinaria" isMain />
                                <input 
                                    type="text" 
                                    style={{ color: activeTheme.text }}
                                    placeholder="Ej. G-MASA-15"
                                    className="w-full p-3 border border-black/5 rounded-xl bg-white/50 focus:bg-white outline-none transition-all font-black text-sm placeholder-black/30" 
                                    value={(!paso.idBloque || String(paso.idBloque).toUpperCase() === 'NAN') ? '' : paso.idBloque}
                                    onChange={e => setPasos(pasos.map(p => p.id === paso.id ? {...p, idBloque: e.target.value} : p))}
                                />
                            </div>
                            <div className="flex-1"></div>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setPasoToDelete({ id: paso.id, nombre: paso.nombre });
                                }}
                                className="w-10 h-10 rounded-xl bg-red-500/10 text-red-500 flex items-center justify-center hover:bg-red-500 hover:text-white transition-all mr-2 shrink-0"
                                title="Eliminar Paso Principal"
                            >
                                <X size={20} />
                            </button>
                            {paso.isExpanded ? <ChevronDown size={24} style={{ color: activeTheme.text }} className="shrink-0" /> : <ChevronRight size={24} style={{ color: activeTheme.text }} className="shrink-0" />}
                        </div>

                        {/* Step Body (Subpasos) */}
                        {paso.isExpanded && (
                            <div className="p-8 bg-white/40 border-t border-black/5">
                                <h4 style={{ color: activeTheme.text }} className="text-xs font-black uppercase tracking-widest mb-6 flex items-center gap-2 opacity-70">
                                    <ListOrdered size={16} /> LISTA DE SUBPASOS
                                </h4>

                                {paso.subpasos.map((sp, spIndex) => {
                                    const tH = parseFloat(sp.tHumano) || 0;
                                    const tA = parseFloat(sp.tAutonomo) || 0;
                                    const totalTime = tH + tA;
                                    const humanPct = totalTime > 0 ? (tH / totalTime) * 100 : 0;
                                    const autoPct = totalTime > 0 ? (tA / totalTime) * 100 : 0;

                                    return (
                                        <div key={sp.internalId} style={{ backgroundColor: 'rgba(255,255,255,0.6)', borderColor: activeTheme.border }} className="border rounded-2xl p-4 mb-4 flex gap-4 shadow-sm relative transition-all">
                                            {sp.operarioLibre && (
                                                <div className="absolute left-0 top-0 bottom-0 w-1 bg-green-500 rounded-l-2xl"></div>
                                            )}
                                            
                                            <div style={{ color: activeTheme.text }} className="cursor-grab py-2 flex items-center select-none opacity-40 hover:opacity-100 transition-opacity">
                                                <GripVertical size={20} />
                                            </div>
                                            
                                            <div className="flex-1 flex flex-col gap-4">
                                                {/* ========================================= */}
                                                {/* SÚPER SECCIÓN: PARÁMETROS DEL SUBPASO     */}
                                                {/* ========================================= */}
                                                <div>
                                                    <h5 style={{ color: activeTheme.text }} className="text-[10px] font-black uppercase tracking-[0.2em] opacity-50 border-b pb-1 mb-4">
                                                        Parámetros del Subpaso
                                                    </h5>
                                                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                                                        <div className="col-span-2 flex flex-col">
                                                            <FieldLabel id="nombreSubpaso" text="Nombre del Subpaso" />
                                                            <div className="flex gap-2">
                                                                <div style={{ backgroundColor: activeTheme.text, color: '#fff' }} className="flex items-center justify-center rounded-xl font-black text-lg shadow-md shrink-0 tracking-widest w-28 overflow-hidden group">
                                                                    <input 
                                                                        type="text"
                                                                        className="w-full bg-transparent outline-none text-center px-2 hover:bg-white/10 transition-colors"
                                                                        defaultValue={sp.id}
                                                                        key={`sub-id-${sp.id}`}
                                                                        onBlur={e => handleSubpasoReorder(paso.internalId, sp.internalId, e.target.value)}
                                                                        onKeyDown={e => e.key === 'Enter' && handleSubpasoReorder(paso.internalId, sp.internalId, e.target.value)}
                                                                    />
                                                                </div>
                                                                <input type="text" style={{ color: activeTheme.text, borderColor: activeTheme.border }} value={sp.nombre} onChange={e => handleSubpasoChange(paso.id, sp.id, 'nombre', e.target.value)} className="w-full p-4 border rounded-xl bg-white outline-none font-bold text-sm flex-1 min-w-0" />
                                                            </div>
                                                        </div>
                                                        <div className="flex flex-col col-span-2 md:col-span-1 lg:col-span-1">
                                                            <FieldLabel id="triggerInicio" text="Trigger de Inicio" />
                                                            <select style={{ color: activeTheme.text, borderColor: activeTheme.border }} value={sp.triggerInicio} onChange={e => handleSubpasoChange(paso.id, sp.id, 'triggerInicio', e.target.value)} className="w-full p-4 border rounded-xl bg-white outline-none font-bold text-sm truncate">
                                                                <option value="confirmacion_anterior">CONFIRMACIÓN ANTERIOR</option>
                                                                <option value="inicio_turno">INICIO DE TURNO</option>
                                                                <option value="fin_temporizador">FIN TEMPORIZADOR AUTÓNOMO</option>
                                                                <option value="temp_alcanzada">TEMPERATURA ALCANZADA</option>
                                                                <option value="paso_externo">FIN DE PASO EN OTRA MASA</option>
                                                                <option value="hora_fija">HORA FIJA / PROGRAMADA</option>
                                                                <option value="ia_coach_decision">A CONSIDERACIÓN DEL COACH DE IA</option>
                                                                <option value="tiempo_horneado">A X TIEMPO DE INICIO DE HORNEADO</option>
                                                            </select>
                                                        </div>

                                                        {sp.triggerInicio === 'tiempo_horneado' && (
                                                            <div className="flex flex-col col-span-2 md:col-span-1 lg:col-span-1 animate-in slide-in-from-top-2">
                                                                <FieldLabel id="tiempoHorneadoRelativo" text="Anticipación (H:M)" />
                                                                <HoursMinutesInput 
                                                                    value={sp.tiempoHorneadoRelativo || 0} 
                                                                    onChange={val => handleSubpasoChange(paso.id, sp.id, 'tiempoHorneadoRelativo', val)} 
                                                                />
                                                            </div>
                                                        )}

                                                        {sp.triggerInicio === 'hora_fija' && (
                                                            <div className="flex flex-col col-span-2 md:col-span-1 lg:col-span-1 animate-in slide-in-from-top-2">
                                                                <FieldLabel id="horaFijaProgramada" text="Hora Inicio (24h)" />
                                                                <MilitaryTimeInput 
                                                                    value={sp.horaFijaProgramada || "00:00"} 
                                                                    onChange={val => handleSubpasoChange(paso.id, sp.id, 'horaFijaProgramada', val)} 
                                                                />
                                                            </div>
                                                        )}
                                                        <div className="flex flex-col col-span-2 md:col-span-1 lg:col-span-1">
                                                            <FieldLabel id="dependenciaPasoPrevio" text="Dependencia (Opc.)" />
                                                            <select style={{ color: activeTheme.text, borderColor: activeTheme.border }} value={sp.dependenciaPasoPrevio || ''} onChange={e => handleSubpasoChange(paso.id, sp.id, 'dependenciaPasoPrevio', e.target.value)} className="w-full p-4 border rounded-xl bg-white outline-none font-bold text-sm truncate">
                                                                <option value="">NINGUNO</option>
                                                                <option value="inmediato_anterior">INMEDIATO ANTERIOR</option>
                                                            </select>
                                                        </div>
                                                        <div className="flex flex-col col-span-2 md:col-span-1 lg:col-span-1">
                                                            <FieldLabel id="grupoInseparable" text="Grupo Inseparable" />
                                                            <input type="text" style={{ color: activeTheme.text, borderColor: activeTheme.border }} placeholder="Ej. G-VEL-1" value={sp.grupoInseparable} onChange={e => handleSubpasoChange(paso.id, sp.id, 'grupoInseparable', e.target.value)} className="w-full p-4 border rounded-xl bg-white outline-none font-bold text-sm placeholder-black/30" />
                                                        </div>
                                                        <div className="flex flex-col col-span-2 md:col-span-1 lg:col-span-1">
                                                            <FieldLabel id="nivelCritico" text="Nivel de Criticidad" />
                                                            <select style={{ color: activeTheme.text, borderColor: activeTheme.border }} value={sp.nivelCritico} onChange={e => handleSubpasoChange(paso.id, sp.id, 'nivelCritico', e.target.value)} className="w-full p-4 border rounded-xl bg-white outline-none font-bold text-sm truncate">
                                                                <option value="bajo">BAJO (NORMAL)</option>
                                                                <option value="medio">MEDIO (FIRME)</option>
                                                                <option value="alto">ALTO (ENFÁTICO)</option>
                                                            </select>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* ========================================= */}
                                                {/* SÚPER SECCIÓN: INTERACCIONES CON EL OPERARIO */}
                                                {/* ========================================= */}
                                                <div>
                                                    <h5 style={{ color: activeTheme.text }} className="text-[10px] font-black uppercase tracking-[0.2em] opacity-50 border-b pb-1 mb-4">
                                                        Interacciones con el Operario
                                                    </h5>
                                                    
                                                    <div className="flex flex-col relative mb-4">
                                                        <FieldLabel id="instruccionVoz" text={<span><Mic size={14} className="inline mr-1"/> Instrucción de Voz Principal</span>} />
                                                        <div className="relative">
                                                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                                                <Mic size={18} style={{ color: activeTheme.text }} className="opacity-50" />
                                                            </div>
                                                            <input 
                                                                type="text" 
                                                                style={{ color: activeTheme.text, borderColor: activeTheme.text }}
                                                                value={sp.instruccionVoz} 
                                                                onChange={e => handleSubpasoChange(paso.id, sp.id, 'instruccionVoz', e.target.value)} 
                                                                className="w-full py-4 pl-12 pr-16 border rounded-xl bg-white outline-none border-l-4 font-black text-sm shadow-sm" 
                                                            />
                                                            <button 
                                                                onClick={() => generateVoiceInstruction(paso.id, sp.id)}
                                                                title="Auto-generar instrucción con IA"
                                                                className="absolute inset-y-0 right-0 px-4 flex items-center text-orange-500 hover:text-orange-600 hover:scale-125 transition-all"
                                                            >
                                                                <Wand2 size={20} className="drop-shadow-sm" />
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {/* BOTÓN DE OPCIONES AVANZADAS (ÚNICO CONTROL DE ESTA SECCIÓN AHORA) */}
                                                    <div className="flex justify-end mt-2">
                                                        <button onClick={() => toggleAdvanced(paso.id, sp.id)} style={{ color: activeTheme.text }} className="text-xs font-black uppercase tracking-widest hover:underline flex items-center gap-1 opacity-70">
                                                            <Settings size={14} /> {sp.showAdvanced ? 'Ocultar' : 'Mostrar'} Parámetros de Calidad y Coaching
                                                        </button>
                                                    </div>

                                                    {sp.showAdvanced && (
                                                        <div style={{ borderColor: activeTheme.border }} className="grid grid-cols-2 gap-4 mt-2 pt-4 border-t border-dashed animate-in slide-in-from-top-2">
                                                            <div className="col-span-2"><h5 style={{ color: activeTheme.text }} className="text-[10px] font-black uppercase tracking-[0.2em] opacity-50 border-b pb-1">Parámetros de Calidad y Coaching</h5></div>

                                                            <div className="flex flex-col">
                                                                <FieldLabel id="preguntaQA" text="Pregunta de Validación (QA)" />
                                                                <input type="text" placeholder="Ej. ¿A qué temperatura quedó?" style={{ color: activeTheme.text, borderColor: activeTheme.border }} value={sp.preguntaQA || ''} onChange={e => handleSubpasoChange(paso.id, sp.id, 'preguntaQA', e.target.value)} className="w-full p-4 border rounded-xl bg-white outline-none font-bold text-sm" />
                                                            </div>
                                                            <div className="flex flex-col">
                                                                <FieldLabel id="temperaturaObjetivo" text="Temperatura Objetivo (°C)" />
                                                                <input type="text" placeholder="Ej. 24°C" style={{ color: activeTheme.text, borderColor: activeTheme.border }} value={sp.temperaturaObjetivo || ''} onChange={e => handleSubpasoChange(paso.id, sp.id, 'temperaturaObjetivo', e.target.value)} className="w-full p-4 border rounded-xl bg-white outline-none font-bold text-sm" />
                                                            </div>

                                                            <div className="col-span-2 flex flex-col">
                                                                <FieldLabel id="tipCoaching" text="Tip de Coaching Sensorial (Voz)" />
                                                                <input type="text" style={{ color: activeTheme.text, borderColor: activeTheme.border }} placeholder="Ej. La masa debe verse brillante..." value={sp.tipCoaching} onChange={e => handleSubpasoChange(paso.id, sp.id, 'tipCoaching', e.target.value)} className="w-full p-4 border rounded-xl bg-white outline-none font-bold text-sm placeholder-black/30" />
                                                            </div>

                                                            <div className="col-span-2 flex flex-col">
                                                                <FieldLabel id="senalesCompletado" text="Señales Visuales de Completado" />
                                                                <input type="text" style={{ color: activeTheme.text, borderColor: activeTheme.border }} placeholder="Ej. Se forma una tela delgada y translúcida al estirar." value={sp.senalesCompletado || ''} onChange={e => handleSubpasoChange(paso.id, sp.id, 'senalesCompletado', e.target.value)} className="w-full p-4 border rounded-xl bg-white outline-none font-bold text-sm placeholder-black/30" />
                                                            </div>

                                                            <div className="col-span-2 flex flex-col">
                                                                <FieldLabel id="erroresComunes" text="Errores Comunes a Prevenir" />
                                                                <input type="text" style={{ color: activeTheme.text, borderColor: activeTheme.border }} placeholder="Ej. Sobre-batido (rompe gluten), agua muy caliente." value={sp.erroresComunes || ''} onChange={e => handleSubpasoChange(paso.id, sp.id, 'erroresComunes', e.target.value)} className="w-full p-4 border rounded-xl bg-white outline-none font-bold text-sm placeholder-black/30" />
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* ========================================= */}
                                                {/* SÚPER SECCIÓN: RECURSOS                   */}
                                                {/* ========================================= */}
                                                <div>
                                                    <h5 style={{ color: activeTheme.text }} className="text-[10px] font-black uppercase tracking-[0.2em] opacity-50 border-b pb-1 mb-4">
                                                        Recursos
                                                    </h5>
                                                    
                                                    {/* SECCIÓN: RECURSO HUMANO */}
                                                    <div className="bg-white/40 border border-dashed rounded-xl p-4 mb-4" style={{ borderColor: activeTheme.border }}>
                                                        <div className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-3 text-emerald-700">Recurso Humano</div>
                                                        <div className="flex items-center justify-between gap-6">
                                                            <div className="flex flex-col w-44 shrink-0">
                                                                <FieldLabel id="tHumano" text="T. Humano" />
                                                                <DualTimeInput value={sp.tHumano} onChange={val => handleSubpasoChange(paso.id, sp.id, 'tHumano', val)} />
                                                            </div>
                                                            
                                                            {/* BOTÓN OPERARIO LIBRE / OCUPADO */}
                                                            <div className="flex flex-col items-center justify-center flex-1">
                                                                <div className="flex items-center gap-2 mt-4">
                                                                    <button 
                                                                        type="button"
                                                                        onClick={() => handleSubpasoChange(paso.id, sp.id, 'operarioLibre', !sp.operarioLibre)}
                                                                        className="relative flex items-center w-72 h-10 rounded-full bg-black/5 overflow-hidden cursor-pointer shadow-inner border border-black/10 transition-all focus:outline-none focus:ring-2 focus:ring-orange-500/50"
                                                                    >
                                                                        <div 
                                                                            className="absolute top-0 bottom-0 rounded-full transition-transform duration-300 ease-out shadow-md"
                                                                            style={{ 
                                                                                transform: sp.operarioLibre ? 'translateX(100%)' : 'translateX(0)',
                                                                                backgroundColor: sp.operarioLibre ? '#10b981' : '#f59e0b',
                                                                                margin: '2px',
                                                                                height: 'calc(100% - 4px)',
                                                                                width: 'calc(50% - 2px)'
                                                                            }}
                                                                        />
                                                                        <div className="relative z-10 flex w-full h-full text-[11px] font-black uppercase tracking-wider select-none">
                                                                            <div className={`flex-1 flex items-center justify-center transition-colors duration-300 ${!sp.operarioLibre ? 'text-white' : 'text-black/40'}`}>
                                                                                Operario Ocupado
                                                                            </div>
                                                                            <div className={`flex-1 flex items-center justify-center transition-colors duration-300 ${sp.operarioLibre ? 'text-white' : 'text-black/40'}`}>
                                                                                Operario Libre
                                                                            </div>
                                                                        </div>
                                                                    </button>
                                                                    <button onClick={(e) => { e.stopPropagation(); setInfoModalField('operarioLibre'); }} className="w-5 h-5 rounded-full bg-orange-500 text-white flex items-center justify-center hover:scale-125 transition-all shadow-sm shrink-0">
                                                                        <Info size={12} fill="currentColor" />
                                                                    </button>
                                                                </div>
                                                            </div>

                                                            <div className="flex flex-col w-44 shrink-0">
                                                                <FieldLabel id="tAutonomo" text="T. Autónomo" />
                                                                <DualTimeInput value={sp.tAutonomo} onChange={val => handleSubpasoChange(paso.id, sp.id, 'tAutonomo', val)} />
                                                            </div>
                                                        </div>
                                                        
                                                        {/* TIMELINE BAR */}
                                                        <div className="mt-4">
                                                            <div style={{ color: activeTheme.text }} className="flex justify-between text-[9px] font-black uppercase tracking-widest opacity-70 mb-1">
                                                                <span>Línea de Tiempo Estimada</span>
                                                                <span>{totalTime.toFixed(1)} min total</span>
                                                            </div>
                                                            <div className="w-full h-2 bg-slate-200 rounded-full flex overflow-hidden">
                                                                <div style={{width: `${humanPct}%`}} className="bg-amber-500 h-full transition-all" title="Humano"></div>
                                                                <div style={{width: `${autoPct}%`}} className="bg-emerald-500 h-full transition-all" title="Autónomo"></div>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* SECCIÓN: RECURSOS MATERIALES */}
                                                    <div className="bg-white/40 border border-dashed rounded-xl p-4 mb-4" style={{ borderColor: activeTheme.border }}>
                                                        <div className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-3 text-cyan-700">Recursos Materiales</div>
                                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                                            <div className="flex flex-col">
                                                                <FieldLabel id="recurso" text="Recurso Asignado" />
                                                                <select style={{ color: activeTheme.text, borderColor: activeTheme.border }} value={sp.recurso} onChange={e => {
                                                                    setPasos(pasos.map(p => p.id === paso.id ? {
                                                                        ...p,
                                                                        subpasos: p.subpasos.map(subp => subp.id === sp.id ? { ...subp, recurso: e.target.value, recursoConfigs: {} } : subp)
                                                                    } : p));
                                                                }} className="w-full p-4 border rounded-xl bg-white outline-none font-bold text-sm">
                                                                    <option value="">(SELECCIONA EQUIPO)</option>
                                                                    {equipments.map(eq => (
                                                                        <option key={eq.id} value={eq.id}>{eq.name} {eq.model_ref ? `(${eq.model_ref})` : ''}</option>
                                                                    ))}
                                                                </select>
                                                            </div>
                                                            
                                                            {/* DYNAMIC RECURSO CONFIGS */}
                                                            {(() => {
                                                                const selEq = equipments.find(eq => String(eq.id) === String(sp.recurso));
                                                                if (!selEq) return null;
                                                                
                                                                let dynSpecs = selEq.dynamic_specs || {};
                                                                if (typeof dynSpecs === 'string') {
                                                                    try { dynSpecs = JSON.parse(dynSpecs); } catch(e) { dynSpecs = {}; }
                                                                }
                                                                
                                                                const tipo = dynSpecs.tipo_maquina || '';
                                                                const validTypes = ['BATIDORA', 'AMASADORA', 'REFINADORA', 'REVOLVEDORA', 'CORTADORA', 'MESA DE TRABAJO'];
                                                                const isMesa = tipo === 'MESA DE TRABAJO' || (selEq.name && selEq.name.toUpperCase().includes('MESA'));
                                                                
                                                                if (!validTypes.includes(tipo) && !dynSpecs.accesorios && !isMesa) return null;

                                                                return (
                                                                    <>
                                                                        {dynSpecs.accesorios && (
                                                                            <div className="flex flex-col">
                                                                                <FieldLabel id="accesorio" text="Accesorio a Usar" />
                                                                                <select style={{ color: activeTheme.text, borderColor: activeTheme.border }} value={sp.recursoConfigs?.accesorio || ''} onChange={e => handleRecursoConfigChange(paso.id, sp.id, 'accesorio', e.target.value)} className="w-full p-3 border rounded-xl bg-white outline-none font-bold text-sm">
                                                                                    <option value="">(SELECCIONA ACCESORIO)</option>
                                                                                    {dynSpecs.accesorios.split(',').map(a => a.trim()).filter(Boolean).map(acc => (
                                                                                        <option key={acc} value={acc}>{acc.toUpperCase()}</option>
                                                                                    ))}
                                                                                </select>
                                                                            </div>
                                                                        )}
                                                                        
                                                                        {['BATIDORA', 'AMASADORA', 'REFINADORA', 'REVOLVEDORA'].includes(tipo) && (
                                                                            <>
                                                                                <div className="flex flex-col">
                                                                                    <FieldLabel id="estado" text="Estado / Velocidad" />
                                                                                    <select style={{ color: activeTheme.text, borderColor: activeTheme.border }} value={sp.recursoConfigs?.estado || ''} onChange={e => handleRecursoConfigChange(paso.id, sp.id, 'estado', e.target.value)} className="w-full p-3 border rounded-xl bg-white outline-none font-bold text-sm">
                                                                                        <option value="">(SELECCIONA ESTADO)</option>
                                                                                        <option value="APAGADA">APAGADA</option>
                                                                                        <option value="ENCENDER A VELOCIDAD 1">ENCENDER A VELOCIDAD 1</option>
                                                                                        <option value="ENCENDER A VELOCIDAD 2">ENCENDER A VELOCIDAD 2</option>
                                                                                        <option value="ENCENDER A VELOCIDAD 3">ENCENDER A VELOCIDAD 3</option>
                                                                                        <option value="SIN APAGAR, CAMBIAR A VELOCIDAD 1">SIN APAGAR, CAMBIAR A VELOCIDAD 1</option>
                                                                                        <option value="SIN APAGAR, CAMBIAR A VELOCIDAD 2">SIN APAGAR, CAMBIAR A VELOCIDAD 2</option>
                                                                                        <option value="SIN APAGAR, CAMBIAR A VELOCIDAD 3">SIN APAGAR, CAMBIAR A VELOCIDAD 3</option>
                                                                                    </select>
                                                                                </div>

                                                                                {sp.recursoConfigs?.estado && sp.recursoConfigs?.estado !== 'APAGADA' && (
                                                                                    <>
                                                                                        <div className="flex flex-col animate-in fade-in slide-in-from-left-2 duration-300">
                                                                                            <FieldLabel id="tiempo_operacion" text="Tiempo de Operación" />
                                                                                            <DualTimeInput 
                                                                                                value={sp.recursoConfigs?.tiempo_operacion} 
                                                                                                onChange={val => handleRecursoConfigChange(paso.id, sp.id, 'tiempo_operacion', val)} 
                                                                                            />
                                                                                        </div>

                                                                                        <div className="flex flex-col animate-in fade-in slide-in-from-left-2 duration-300">
                                                                                            <FieldLabel id="accion_concluir" text="Acción al Concluir" />
                                                                                            <select 
                                                                                                style={{ color: activeTheme.text, borderColor: activeTheme.border }} 
                                                                                                value={sp.recursoConfigs?.accionAlConcluir || ''} 
                                                                                                onChange={e => handleRecursoConfigChange(paso.id, sp.id, 'accionAlConcluir', e.target.value)} 
                                                                                                className="w-full p-4 border rounded-xl bg-white outline-none font-bold text-[10px] uppercase tracking-tighter"
                                                                                            >
                                                                                                <option value="">(SELECCIONA ACCIÓN)</option>
                                                                                                <option value="AVISAR AL OPERARIO Y APAGAR">AVISAR AL OPERARIO Y APAGAR</option>
                                                                                                <option value="AVISAR AL OPERARIO Y NUEVA VELOCIDAD SIN APAGAR">AVISAR AL OPERARIO Y NUEVA VELOCIDAD SIN APAGAR</option>
                                                                                                <option value="AVISAR AL OPERARIO Y ADICIONAR INGREDIENTE SIN APAGAR">AVISAR AL OPERARIO Y ADICIONAR INGREDIENTE SIN APAGAR</option>
                                                                                            </select>
                                                                                        </div>

                                                                                        {/* FASE 2: CONTINUACIÓN DE SECUENCIA */}
                                                                                        {sp.recursoConfigs?.accionAlConcluir === "AVISAR AL OPERARIO Y NUEVA VELOCIDAD SIN APAGAR" && (
                                                                                            <div className="col-span-1 md:col-span-2 lg:col-span-4 mt-2 p-4 bg-orange-500/5 border border-dashed border-orange-500/30 rounded-2xl animate-in zoom-in-95 duration-300">
                                                                                                <div className="flex items-center gap-2 mb-3">
                                                                                                    <div className="w-6 h-6 rounded-full bg-orange-500 text-white flex items-center justify-center text-[10px] font-black">2</div>
                                                                                                    <span className="text-[10px] font-black uppercase tracking-widest text-orange-600">Fase 2 (Continuación de Secuencia)</span>
                                                                                                </div>
                                                                                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                                                                                    <div className="flex flex-col">
                                                                                                        <FieldLabel id="nextVelocidad" text="Nueva Velocidad" />
                                                                                                        <select 
                                                                                                            style={{ color: activeTheme.text, borderColor: activeTheme.border }} 
                                                                                                            value={sp.recursoConfigs?.nextVelocidad || ''} 
                                                                                                            onChange={e => handleRecursoConfigChange(paso.id, sp.id, 'nextVelocidad', e.target.value)} 
                                                                                                            className="w-full p-3 border rounded-xl bg-white outline-none font-bold text-[10px] uppercase"
                                                                                                        >
                                                                                                            <option value="">(SELECCIONA VELOCIDAD)</option>
                                                                                                            <option value="SIN APAGAR, CAMBIAR A VELOCIDAD 1">SIN APAGAR, CAMBIAR A VELOCIDAD 1</option>
                                                                                                            <option value="SIN APAGAR, CAMBIAR A VELOCIDAD 2">SIN APAGAR, CAMBIAR A VELOCIDAD 2</option>
                                                                                                            <option value="SIN APAGAR, CAMBIAR A VELOCIDAD 3">SIN APAGAR, CAMBIAR A VELOCIDAD 3</option>
                                                                                                        </select>
                                                                                                    </div>
                                                                                                    <div className="flex flex-col">
                                                                                                        <FieldLabel id="nextTiempo" text="Tiempo Fase 2" />
                                                                                                        <DualTimeInput 
                                                                                                            value={sp.recursoConfigs?.nextTiempo} 
                                                                                                            onChange={val => handleRecursoConfigChange(paso.id, sp.id, 'nextTiempo', val)} 
                                                                                                        />
                                                                                                    </div>
                                                                                                    <div className="flex flex-col">
                                                                                                        <FieldLabel id="nextAccion" text="Acción al Concluir Fase 2" />
                                                                                                        <select 
                                                                                                            style={{ color: activeTheme.text, borderColor: activeTheme.border }} 
                                                                                                            value={sp.recursoConfigs?.nextAccion || ''} 
                                                                                                            onChange={e => handleRecursoConfigChange(paso.id, sp.id, 'nextAccion', e.target.value)} 
                                                                                                            className="w-full p-3 border rounded-xl bg-white outline-none font-bold text-[10px] uppercase"
                                                                                                        >
                                                                                                            <option value="">(SELECCIONA ACCIÓN)</option>
                                                                                                            <option value="AVISAR AL OPERARIO Y APAGAR">AVISAR AL OPERARIO Y APAGAR</option>
                                                                                                            <option value="AVISAR AL OPERARIO Y ADICIONAR INGREDIENTE SIN APAGAR">AVISAR AL OPERARIO Y ADICIONAR INGREDIENTE SIN APAGAR</option>
                                                                                                        </select>
                                                                                                    </div>
                                                                                                </div>
                                                                                            </div>
                                                                                        )}
                                                                                    </>
                                                                                )}
                                                                            </>
                                                                        )}

                                                                        {isMesa && (
                                                                            <div className="flex flex-col">
                                                                                <FieldLabel id="cuadrante" text="Número de Cuadrante" />
                                                                                <select style={{ color: activeTheme.text, borderColor: activeTheme.border }} value={sp.recursoConfigs?.cuadrante || ''} onChange={e => handleRecursoConfigChange(paso.id, sp.id, 'cuadrante', e.target.value)} className="w-full p-3 border rounded-xl bg-white outline-none font-bold text-sm">
                                                                                    <option value="">(SELECCIONA CUADRANTE)</option>
                                                                                    {dynSpecs.cuadrantes ? (
                                                                                        Array.from({ length: parseInt(dynSpecs.cuadrantes) || 0 }).map((_, i) => (
                                                                                            <option key={`c${i+1}`} value={`Cuadrante ${i+1}`}>CUADRANTE {i+1}</option>
                                                                                        ))
                                                                                    ) : (
                                                                                        <>
                                                                                            <option value="Cuadrante 1">CUADRANTE 1</option>
                                                                                            <option value="Cuadrante 2">CUADRANTE 2</option>
                                                                                            <option value="Cuadrante 3">CUADRANTE 3</option>
                                                                                            <option value="Cuadrante 4">CUADRANTE 4</option>
                                                                                            <option value="Cuadrante 5">CUADRANTE 5</option>
                                                                                            <option value="Cuadrante 6">CUADRANTE 6</option>
                                                                                        </>
                                                                                    )}
                                                                                </select>
                                                                            </div>
                                                                        )}
                                                                    </>
                                                                );
                                                            })()}
                                                        </div>
                                                    </div>

                                                    {/* SECCIÓN: INGREDIENTES */}
                                                    <div className="bg-white/40 border border-dashed rounded-xl p-4" style={{ borderColor: activeTheme.border }}>
                                                        <div className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-3 text-orange-700">Ingredientes</div>
                                                        <div className="flex flex-col">
                                                            <div className="space-y-2">
                                                                {(() => {
                                                                    let ings = sp.ingredientesRequeridos;
                                                                    if (typeof ings === 'string') ings = ings ? ings.split(',').map(i => ({ ingrediente: i.trim(), porcentaje: 100 })) : [];
                                                                    if (!Array.isArray(ings)) ings = [];
                                                                    
                                                                    const hiddenCols = recipeMatrix?.hidden_system_cols || [];
                                                                    const availableIngs = (recipeMatrix?.columns || [])
                                                                        .filter(c => c && c.id && c.name && !hiddenCols.includes(c.id))
                                                                        .map(c => c.name)
                                                                        .filter(Boolean);

                                                                    const usageMap = {};
                                                                    pasos.forEach(p => {
                                                                        p.subpasos?.forEach(subp => {
                                                                            let iReq = subp.ingredientesRequeridos;
                                                                            if (typeof iReq === 'string') return;
                                                                            if (Array.isArray(iReq)) {
                                                                                iReq.forEach(ir => {
                                                                                    if (ir.ingrediente && ir.unidad === '%') {
                                                                                        usageMap[ir.ingrediente] = (usageMap[ir.ingrediente] || 0) + (parseFloat(ir.porcentaje) || 0);
                                                                                    }
                                                                                });
                                                                            }
                                                                        });
                                                                    });

                                                                    return (
                                                                        <>
                                                                            {ings.map((item, idx) => (
                                                                                <div key={idx} className="flex gap-2 animate-in slide-in-from-left-2 duration-200">
                                                                                    <select 
                                                                                        value={item?.ingrediente || ''} 
                                                                                        onChange={e => {
                                                                                            const newIngs = [...ings];
                                                                                            newIngs[idx] = { ...newIngs[idx], ingrediente: e.target.value };
                                                                                            handleSubpasoChange(paso.id, sp.id, 'ingredientesRequeridos', newIngs);
                                                                                        }}
                                                                                        className="flex-1 py-1 px-2 border rounded-xl bg-white outline-none font-bold text-base"
                                                                                        style={{ color: activeTheme.text, borderColor: activeTheme.border }}
                                                                                    >
                                                                                        <option value="">Seleccionar ingrediente...</option>
                                                                                        {availableIngs.map(name => (
                                                                                            <option key={name} value={name}>{name}</option>
                                                                                        ))}
                                                                                    </select>
                                                                                    <div className="flex flex-col gap-1">
                                                                                        <div style={{ borderColor: activeTheme.border }} className={`flex w-44 border-2 rounded-xl overflow-hidden h-14 bg-white shadow-sm transition-all focus-within:ring-2 ${parseFloat(usageMap[item.ingrediente]) > 100 ? 'ring-red-500/20 border-red-500' : 'focus-within:ring-orange-500/20'}`}>
                                                                                            <input 
                                                                                                type="number" 
                                                                                                placeholder="0" 
                                                                                                value={item?.porcentaje || ''} 
                                                                                                onChange={e => {
                                                                                                    const newIngs = [...ings];
                                                                                                    newIngs[idx] = { ...newIngs[idx], porcentaje: e.target.value };
                                                                                                    handleSubpasoChange(paso.id, sp.id, 'ingredientesRequeridos', newIngs);
                                                                                                }}
                                                                                                className="w-16 shrink-0 bg-transparent px-1 py-1 font-mono font-black text-sm outline-none text-right"
                                                                                                style={{ color: activeTheme.text }}
                                                                                            />
                                                                                            <div className="relative flex-1 h-full flex items-center justify-center border-l border-black/10 bg-black/5 group overflow-hidden">
                                                                                                <div style={{ color: activeTheme.text }} className="font-black uppercase text-center px-1 pointer-events-none break-words w-full leading-[1.1] tracking-tighter opacity-80 text-[11px]">
                                                                                                    {item?.unidad || '%'}
                                                                                                </div>
                                                                                                <select 
                                                                                                    value={item?.unidad || '%'} 
                                                                                                    onChange={e => {
                                                                                                        const newIngs = [...ings];
                                                                                                        newIngs[idx] = { ...newIngs[idx], unidad: e.target.value };
                                                                                                        handleSubpasoChange(paso.id, sp.id, 'ingredientesRequeridos', newIngs);
                                                                                                    }}
                                                                                                    className="absolute inset-0 opacity-0 cursor-pointer w-full"
                                                                                                >
                                                                                                    <option style={{ color: '#000' }} value="%">%</option>
                                                                                                    <option style={{ color: '#000' }} value="G">G</option>
                                                                                                    <option style={{ color: '#000' }} value="KG">KG</option>
                                                                                                    <option style={{ color: '#000' }} value="ML">ML</option>
                                                                                                    <option style={{ color: '#000' }} value="L">L</option>
                                                                                                    <option style={{ color: '#000' }} value="PIEZA">PIEZA</option>
                                                                                                    <option style={{ color: '#000' }} value="BOTE">BOTE</option>
                                                                                                    <option style={{ color: '#000' }} value="CUBETA">CUBETA</option>
                                                                                                    <option style={{ color: '#000' }} value="COSTAL">COSTAL</option>
                                                                                                    <option style={{ color: '#000' }} value="BOLSA DESECHABLE">BOLSA DESECHABLE</option>
                                                                                                    <option style={{ color: '#000' }} value="BOLSA RECICLABLE LIMPIA">BOLSA RECICLABLE LIMPIA</option>
                                                                                                    <option style={{ color: '#000' }} value="BOLSA RECICLABLE SEMISUCIA">BOLSA RECICLABLE SEMISUCIA</option>
                                                                                                </select>
                                                                                            </div>
                                                                                        </div>
                                                                                        {item.ingrediente && item.unidad === '%' && (() => {
                                                                                            const totalUsed = usageMap[item.ingrediente] || 0;
                                                                                            const otherStepsUsage = totalUsed - (parseFloat(item.porcentaje) || 0);
                                                                                            const remaining = Math.max(0, 100 - otherStepsUsage);
                                                                                            
                                                                                            if (totalUsed > 100) {
                                                                                                return (
                                                                                                    <div className="flex items-center gap-1 text-[9px] font-black text-red-600 animate-pulse">
                                                                                                        <AlertTriangle size={10} /> EXCESO: {totalUsed}% USADO
                                                                                                    </div>
                                                                                                );
                                                                                            }
                                                                                            return (
                                                                                                <div className="text-[9px] font-black opacity-40 uppercase tracking-widest pl-2">
                                                                                                    Remanente: {remaining}% disponible
                                                                                                </div>
                                                                                            );
                                                                                        })()}
                                                                                    </div>
                                                                                    <button 
                                                                                        onClick={() => {
                                                                                            const newIngs = ings.filter((_, i) => i !== idx);
                                                                                            handleSubpasoChange(paso.id, sp.id, 'ingredientesRequeridos', newIngs);
                                                                                        }}
                                                                                        className="p-3 text-red-500 hover:bg-red-50 rounded-xl transition-colors"
                                                                                    >
                                                                                        <Trash2 size={16} />
                                                                                    </button>
                                                                                </div>
                                                                            ))}
                                                                            <button 
                                                                                onClick={() => {
                                                                                    const newIngs = [...ings, { ingrediente: '', porcentaje: 100 }];
                                                                                    handleSubpasoChange(paso.id, sp.id, 'ingredientesRequeridos', newIngs);
                                                                                }}
                                                                                className="text-[10px] font-black uppercase tracking-widest text-orange-600 flex items-center gap-1 hover:underline p-2"
                                                                            >
                                                                                <Plus size={14} /> Añadir Ingrediente de Receta
                                                                            </button>
                                                                        </>
                                                                    );
                                                                })()}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>

                                            </div>
                                            
                                            {/* Actions Side */}
                                            <div className="flex flex-col gap-2 pt-1">
                                                <button onClick={async () => { 
                                                    setSaveStatus('saving');
                                                    try {
                                                        if(onSaveDB) await onSaveDB(pasos);
                                                        else if(onSave) onSave(pasos);
                                                        setSaveStatus('saved');
                                                        setTimeout(() => setSaveStatus('idle'), 1500);
                                                    } catch (e) {
                                                        setSaveStatus('idle');
                                                    }
                                                }} style={{ color: '#10b981', borderColor: '#a7f3d0' }} className="p-2 border rounded-xl hover:scale-110 bg-white/50 hover:bg-emerald-50 transition-all shadow-sm" title="Guardar Respaldo Rápido">
                                                    <Save size={16} />
                                                </button>
                                                <button onClick={() => duplicateSubpaso(paso.id, sp)} style={{ color: activeTheme.text, borderColor: activeTheme.border }} className="p-2 border rounded-xl hover:scale-110 bg-white/50 hover:bg-white transition-all shadow-sm" title="Duplicar Subpaso">
                                                    <Copy size={16} />
                                                </button>
                                                <button onClick={() => setSubpasoToDelete({ pasoId: paso.id, subpasoId: sp.id, nombre: sp.nombre })} style={{ color: '#ef4444', borderColor: '#fca5a5' }} className="p-2 border rounded-xl hover:scale-110 bg-white/50 hover:bg-red-50 transition-all shadow-sm" title="Eliminar">
                                                    <X size={18} />
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}

                                <button onClick={() => addSubpaso(paso.id)} style={{ color: activeTheme.text, borderColor: activeTheme.border }} className="w-full py-4 border-2 border-dashed rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-black/5 transition-colors flex items-center justify-center gap-2">
                                    <Plus size={16} /> Agregar Subpaso
                                </button>
                            </div>
                        )}
                    </div>
                ))}

                <button onClick={addPaso} style={{ color: activeTheme.text, backgroundColor: activeTheme.input, borderColor: activeTheme.border }} className="w-full py-6 border-2 border-dashed rounded-3xl font-black text-sm uppercase tracking-widest hover:scale-[1.01] transition-all flex items-center justify-center gap-2 shadow-sm mb-20">
                    <Plus size={20} /> AGREGAR NUEVO PASO PRINCIPAL
                </button>
            </div>

            {/* DYNAMIC INFO MODAL */}
            {infoModalField && FIELD_INFO_DATA[infoModalField] && (() => {
                const info = FIELD_INFO_DATA[infoModalField];
                return (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/60 backdrop-blur-md animate-in fade-in duration-300" onClick={() => setInfoModalField(null)}>
                        <div 
                            style={{ backgroundColor: activeTheme.input }} 
                            className="w-full max-w-xl rounded-[40px] p-10 border border-black/10 shadow-2xl relative overflow-hidden max-h-[90vh] overflow-y-auto"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="absolute top-0 left-0 w-full h-2 bg-orange-500 shadow-[0_0_20px_rgba(249,115,22,0.5)]"></div>
                            <div className="flex justify-between items-start mb-8">
                                <div className="flex items-center gap-4">
                                    <div className="w-14 h-14 shrink-0 rounded-2xl bg-orange-500/10 flex items-center justify-center text-orange-500">
                                        <Info size={32} />
                                    </div>
                                    <div>
                                        <h3 style={{ color: activeTheme.text }} className="text-3xl font-black italic uppercase tracking-tighter leading-tight">{info.title}</h3>
                                        <p className="text-[10px] font-black uppercase tracking-[0.4em] text-orange-500/60 mt-1">{info.subtitle}</p>
                                    </div>
                                </div>
                                <button onClick={() => setInfoModalField(null)} className="w-10 h-10 shrink-0 bg-black/5 flex items-center justify-center rounded-full transition-all hover:bg-red-500 hover:text-white">
                                    <X size={24} />
                                </button>
                            </div>
                            
                            <div className="space-y-6">
                                <div className="p-6 bg-orange-500/5 rounded-[30px] border border-orange-500/10">
                                    <p style={{ color: activeTheme.text }} className="text-xs font-black uppercase tracking-[0.2em] mb-2 opacity-50">¿Qué es exactamente?</p>
                                    <p style={{ color: activeTheme.text }} className="text-lg font-bold leading-tight italic">
                                        {info.desc}
                                    </p>
                                </div>
                                
                                {info.bullets && info.bullets.length > 0 && (
                                    <div className="p-6 bg-black/5 rounded-[30px]">
                                        <p style={{ color: activeTheme.text }} className="text-xs font-black uppercase tracking-[0.2em] mb-4 opacity-50">Impacto en Producción</p>
                                        <ul style={{ color: activeTheme.text }} className="text-base font-bold space-y-4 list-none">
                                            {info.bullets.map((b, idx) => (
                                                <li key={idx} className="flex gap-3">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-orange-500 mt-2 shrink-0"></div>
                                                    <span><span className="text-orange-600 uppercase tracking-tighter italic mr-1">{b.label}</span> {b.text}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </div>

                            <button 
                                onClick={() => setInfoModalField(null)}
                                style={{ backgroundColor: activeTheme.text, color: activeTheme.bg }}
                                className="w-full mt-10 py-6 rounded-[25px] font-black text-sm uppercase tracking-[0.3em] hover:scale-[1.02] active:scale-95 transition-all shadow-2xl shadow-black/20"
                            >
                                Entendido, cerrar guía
                            </button>
                        </div>
                    </div>
                );
            })()}

            {/* SAVE STATUS MODAL */}
            {saveStatus !== 'idle' && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-[30px] p-8 shadow-2xl flex flex-col items-center justify-center min-w-[300px] border border-black/10">
                        {saveStatus === 'saving' ? (
                            <>
                                <Loader2 size={48} className="animate-spin text-emerald-500 mb-4" />
                                <h3 className="text-xl font-black italic uppercase text-slate-800 tracking-tighter">Guardando...</h3>
                                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mt-2">Respaldando progreso</p>
                            </>
                        ) : (
                            <>
                                <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mb-4">
                                    <Save size={32} className="text-emerald-500" />
                                </div>
                                <h3 className="text-xl font-black italic uppercase text-slate-800 tracking-tighter">¡Guardado!</h3>
                                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mt-2">Respaldo exitoso</p>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* DELETE CONFIRMATION MODAL (SUBPASO) */}
            {subpasoToDelete && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
                    <div style={{ backgroundColor: activeTheme.input }} className="max-w-md w-full rounded-[30px] p-8 shadow-2xl border border-black/10 relative overflow-hidden text-center">
                        <div className="absolute top-0 left-0 w-full h-2 bg-red-500"></div>
                        <div className="w-20 h-20 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
                            <AlertTriangle size={40} />
                        </div>
                        <h3 style={{ color: activeTheme.text }} className="text-2xl font-black italic uppercase tracking-tighter mb-2">
                            ¿Borrar Subpaso?
                        </h3>
                        <p className="text-sm font-bold opacity-70 mb-6" style={{ color: activeTheme.text }}>
                            Estás a punto de eliminar el subpaso <span className="text-red-500 uppercase">"{subpasoToDelete.nombre}"</span>. Esta acción no se puede deshacer.
                        </p>
                        <div className="flex gap-4">
                            <button 
                                onClick={() => setSubpasoToDelete(null)}
                                style={{ color: activeTheme.text, borderColor: activeTheme.border }}
                                className="flex-1 py-4 rounded-2xl font-black text-xs uppercase tracking-widest border-2 hover:bg-black/5 transition-colors"
                            >
                                Cancelar
                            </button>
                            <button 
                                onClick={() => {
                                    removeSubpaso(subpasoToDelete.pasoId, subpasoToDelete.subpasoId);
                                    setSubpasoToDelete(null);
                                }}
                                className="flex-1 py-4 rounded-2xl font-black text-xs uppercase tracking-widest bg-red-500 text-white hover:bg-red-600 hover:scale-[1.02] active:scale-95 transition-all shadow-lg shadow-red-500/30"
                            >
                                Sí, borrar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* DELETE CONFIRMATION MODAL (PASO PRINCIPAL) */}
            {pasoToDelete && (
                <div className="fixed inset-0 z-[210] flex items-center justify-center p-6 bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
                    <div style={{ backgroundColor: activeTheme.input }} className="max-w-md w-full rounded-[30px] p-8 shadow-2xl border border-black/10 relative overflow-hidden text-center">
                        <div className="absolute top-0 left-0 w-full h-2 bg-red-600"></div>
                        <div className="w-20 h-20 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6">
                            <AlertTriangle size={40} />
                        </div>
                        <h3 style={{ color: activeTheme.text }} className="text-2xl font-black italic uppercase tracking-tighter mb-2">
                            ¿Eliminar Paso Principal?
                        </h3>
                        <p className="text-sm font-bold opacity-70 mb-6" style={{ color: activeTheme.text }}>
                            Borrarás el paso <span className="text-red-600 uppercase font-black">"{pasoToDelete.nombre}"</span> y TODOS sus subpasos asociados. Esta acción es definitiva.
                        </p>
                        <div className="flex gap-4">
                            <button 
                                onClick={() => setPasoToDelete(null)}
                                style={{ color: activeTheme.text, borderColor: activeTheme.border }}
                                className="flex-1 py-4 rounded-2xl font-black text-xs uppercase tracking-widest border-2 hover:bg-black/5 transition-colors"
                            >
                                Mantener
                            </button>
                            <button 
                                onClick={() => {
                                    setPasos(pasos.filter(p => p.id !== pasoToDelete.id));
                                    setPasoToDelete(null);
                                }}
                                className="flex-1 py-4 rounded-2xl font-black text-xs uppercase tracking-widest bg-red-600 text-white hover:bg-red-700 hover:scale-[1.02] active:scale-95 transition-all shadow-lg shadow-red-600/30"
                            >
                                Confirmar Borrado
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
