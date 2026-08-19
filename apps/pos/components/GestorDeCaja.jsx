import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { cashService, securityService } from '../services/cashService';
import { CorteTicketTemplate } from './CorteTicketTemplate';
import { CONFIG } from '../config';

// ─── Componentes de UI reutilizables ─────────────────────────────────────────

const SeccionHeader = ({ icon, titulo }) => (
    <div className="flex items-center gap-4 mb-6 group">
        <div className="w-10 h-10 rounded-2xl bg-[#c1d72e] flex items-center justify-center text-black text-xl shadow-lg shadow-[#c1d72e]/10 group-hover:scale-110 transition-all duration-500">
            {icon}
        </div>
        <div>
            <h3 className="text-[10px] font-black uppercase tracking-[0.25em] text-white/80 italic">{titulo}</h3>
            <div className="h-0.5 w-6 bg-[#c1d72e]/20 mt-1 rounded-full group-hover:w-12 transition-all duration-500"></div>
        </div>
    </div>
);

const CampoMoneda = ({ label, valor, className = '' }) => (
    <div className={`flex justify-between items-center py-2 border-b border-white/5 ${className}`}>
        <span className="text-xs font-bold text-white/50 uppercase tracking-wider">{label}</span>
        <span className="text-lg font-black font-mono text-white">${(valor || 0).toFixed(2)}</span>
    </div>
);

const FilaDiferencia = ({ label, esperado, capturado, onChange, onFocus, active }) => {
    const diferencia = (parseFloat(capturado) || 0) - (esperado || 0);
    const colorDif = diferencia === 0 ? 'text-green-400' : diferencia > 0 ? 'text-yellow-400' : 'text-red-400';
    return (
        <div className={`grid grid-cols-3 gap-2 items-center py-3 border-b border-white/5 transition-all ${active ? 'bg-white/5 px-2 -mx-2 rounded-xl' : ''}`}>
            <span className="text-xs font-bold text-white/50 uppercase">{label}</span>
            <div className="flex flex-col">
                <span className="text-[9px] text-white/30 uppercase">Esperado</span>
                <span className="text-sm font-black font-mono text-white">${(esperado || 0).toFixed(2)}</span>
            </div>
            <div className="flex flex-col gap-1">
                <input
                    type="number"
                    step="0.01"
                    readOnly
                    value={capturado}
                    onClick={onFocus}
                    className={`bg-black/40 border ${active ? 'border-[#c1d72e]' : 'border-white/20'} rounded-lg px-2 py-1.5 text-sm font-mono text-white w-full focus:outline-none`}
                    placeholder="0.00"
                />
                {capturado !== '' && (
                    <span className={`text-[10px] font-bold font-mono ${colorDif}`}>
                        {diferencia >= 0 ? '+' : ''}{diferencia.toFixed(2)}
                    </span>
                )}
            </div>
        </div>
    );
};

const AlertaInterna = ({ mensaje, tipo = 'error', onClose }) => {
    const estilos = {
        error: 'bg-red-900/50 border-red-500 text-red-200',
        success: 'bg-green-900/50 border-green-500 text-green-200',
        warning: 'bg-yellow-900/50 border-yellow-500 text-yellow-200',
    };
    return (
        <div className={`flex justify-between items-center px-4 py-3 rounded-xl border text-sm font-bold mb-3 ${estilos[tipo]}`}>
            <span>{mensaje}</span>
            {onClose && <button onClick={onClose} className="ml-4 opacity-60 hover:opacity-100">✕</button>}
        </div>
    );
};

// ─── Componente Principal ─────────────────────────────────────────────────────

export const GestorDeCaja = ({ terminalId, onCajaHabilitada, onCajaDeshabilitada, onClose, sesionInicial, currentUser }) => {
    // Estado de la sesión
    const [sesion, setSesion] = useState(sesionInicial || null);
    const [resumen, setResumen] = useState(null);

    // Estado Sección A - Apertura de turno
    const [pinInput, setPinInput] = useState('');
    const [empleado, setEmpleado] = useState(currentUser || null);
    const [fondoInput, setFondoInput] = useState('');
    const [fondoConfirmado, setFondoConfirmado] = useState(!!sesionInicial);
    const [confirmandoFondo, setConfirmandoFondo] = useState(false);

    // Estado Sección B - Movimientos
    const [tipoMovimiento, setTipoMovimiento] = useState('SALIDA');
    const [montoMovimiento, setMontoMovimiento] = useState('');
    const [conceptoMovimiento, setConceptoMovimiento] = useState('');
    const [movimientos, setMovimientos] = useState(sesionInicial?.movements || []);

    // Estado Sección D - Cierre
    const [turnoVisible, setTurnoVisible] = useState(true);
    const [turnoFinalizado, setTurnoFinalizado] = useState(false);
    const [capturandoFisico, setCapturandoFisico] = useState(false);
    const [confirmandoCierre, setConfirmandoCierre] = useState(false);
    const [fisicoCash, setFisicoCash] = useState('');
    const [fisicoCredito, setFisicoCredito] = useState('');
    const [fisicoDebito, setFisicoDebito] = useState('');

    // Estado: Contexto diario post-cierre (no bloqueante)
    const [showDailyContext, setShowDailyContext] = useState(false);
    const [dailyContextSaved, setDailyContextSaved] = useState(false);
    const [ctxWeather, setCtxWeather] = useState(null);
    const [ctxAtypical, setCtxAtypical] = useState(false);
    const [ctxNotes, setCtxNotes] = useState('');

    // Estado general
    const [cargando, setCargando] = useState(false);
    const [refrescando, setRefrescando] = useState(false);
    const [alerta, setAlerta] = useState(null);
    const [focusedField, setFocusedField] = useState(null); // 'fondo', 'movimiento', 'cash', 'credit', 'debit'
    const cortePrintRef = useRef();

    const handleKeypadPress = (val) => {
        if (!focusedField) return;
        
        let currentVal = '';
        let setter = null;

        if (focusedField === 'fondo') { currentVal = fondoInput; setter = setFondoInput; }
        else if (focusedField === 'movimiento') { currentVal = montoMovimiento; setter = setMontoMovimiento; }
        else if (focusedField === 'cash') { currentVal = fisicoCash; setter = setFisicoCash; }
        else if (focusedField === 'credit') { currentVal = fisicoCredito; setter = setFisicoCredito; }
        else if (focusedField === 'debit') { currentVal = fisicoDebito; setter = setFisicoDebito; }

        if (!setter) return;

        if (val === 'C') {
            setter('');
        } else if (val === '←') {
            setter(currentVal.toString().slice(0, -1));
        } else if (val === 'ENTER') {
            if (focusedField === 'fondo') handleRegistrarFondo();
            else if (focusedField === 'movimiento') handleAgregarMovimiento();
            else if (focusedField === 'cash') setFocusedField('credit');
            else if (focusedField === 'credit') setFocusedField('debit');
            else if (focusedField === 'debit') setFocusedField(null);
        } else {
            if (val === '.' && currentVal.toString().includes('.')) return;
            // Limitar decimales a 2
            if (currentVal.toString().includes('.') && currentVal.toString().split('.')[1].length >= 2) return;
            setter(currentVal.toString() + val);
        }
    };

    const mostrarAlerta = (mensaje, tipo = 'error') => {
        setAlerta({ mensaje, tipo });
        setTimeout(() => setAlerta(null), 5000);
    };

    const handlePrintCorte = () => {
        const printContent = cortePrintRef.current;
        if (!printContent) return;
        
        const iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = '0';
        document.body.appendChild(iframe);

        const doc = iframe.contentWindow.document;
        doc.open();
        doc.write('<html><head><title>Reporte de Corte</title>');
        doc.write('<link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">');
        doc.write('</head><body>');
        doc.write(printContent.innerHTML);
        doc.write('</body></html>');
        doc.close();

        setTimeout(() => {
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
            setTimeout(() => {
                document.body.removeChild(iframe);
            }, 1000);
        }, 250);
    };

    const actualizarResumen = useCallback(async () => {
        if (!sesion) return;
        setRefrescando(true);
        try {
            const datos = await cashService.obtenerResumen(sesion.id);
            setResumen(datos);
        } catch {
            // El resumen no es crítico, silenciar el error
        } finally {
            setTimeout(() => setRefrescando(false), 600);
        }
    }, [sesion]);

    // Cargar sesión activa al montar
    useEffect(() => {
        const cargarSesionActiva = async () => {
            setCargando(true);
            try {
                const sesionActiva = await cashService.obtenerSesionActiva(terminalId);
                if (sesionActiva) {
                    setSesion(sesionActiva);
                    setFondoConfirmado(true);
                    setTurnoVisible(true);
                    // Actualizar el estado del padre
                    onCajaHabilitada(sesionActiva.id);
                    // Si hay sesión, cargar su resumen inmediatamente
                    const datos = await cashService.obtenerResumen(sesionActiva.id);
                    setResumen(datos);
                    setMovimientos(sesionActiva.movements || []);
                    // Simular que el empleado está cargado para la UI
                    setEmpleado({ id: sesionActiva.employee_id, name: sesionActiva.employee_name, role: ' CAJERO' });
                }
            } catch (e) {
                console.error("Error cargando sesion activa:", e);
            } finally {
                setCargando(false);
            }
        };
        cargarSesionActiva();
    }, [terminalId]); // Quitamos onCajaHabilitada de dependencias para evitar loops infinitos

    // Actualizar resumen cada 10 segundos si hay sesión activa
    useEffect(() => {
        if (!sesion || turnoFinalizado) return;
        actualizarResumen(); // Carga inmediata al detectar sesion
        const intervalo = setInterval(actualizarResumen, 10000);
        return () => clearInterval(intervalo);
    }, [sesion, turnoFinalizado, actualizarResumen]);

    // ── Sección A: Validar PIN ────────────────────────────────────────────────
    const handleValidarPin = async () => {
        if (!pinInput.trim()) return mostrarAlerta('Ingrese el PIN del colaborador');
        setCargando(true);
        try {
            const datos = await securityService.validarPin(pinInput);
            setEmpleado(datos);
            setAlerta({ mensaje: `✓ ${datos.name} — ${datos.role}`, tipo: 'success' });
        } catch (e) {
            mostrarAlerta(e.message);
        } finally {
            setCargando(false);
        }
    };

    // ── Sección A: Registrar fondo ────────────────────────────────────────────
    const handleRegistrarFondo = async () => {
        const monto = parseFloat(fondoInput);
        if (!empleado) return mostrarAlerta('Primero valide el PIN del colaborador');
        if (isNaN(monto) || monto < 0) return mostrarAlerta('Ingrese un monto válido');
        setConfirmandoFondo(true);
    };

    const handleConfirmarFondo = async () => {
        const monto = parseFloat(fondoInput);
        setCargando(true);
        try {
            const nuevaSesion = await cashService.abrirSesion({
                terminal_id: terminalId,
                employee_id: empleado.id,
                employee_name: empleado.name,
                opening_float: monto,
            });
            setSesion(nuevaSesion);
            setFondoConfirmado(true);
            setConfirmandoFondo(false);
            onCajaHabilitada(nuevaSesion.id);
            await actualizarResumen();
            mostrarAlerta(`✓ Fondo de $${monto.toFixed(2)} registrado. Caja habilitada.`, 'success');
        } catch (e) {
            // Si el error es que ya existe una sesión, intentar recuperarla
            const msg = e.message.toLowerCase();
            if (msg.includes('ya existe') || msg.includes('activa')) {
                mostrarAlerta('Sincronizando con turno abierto...', 'warning');
                const sesionActiva = await cashService.obtenerSesionActiva(terminalId);
                if (sesionActiva) {
                    setSesion(sesionActiva);
                    setFondoConfirmado(true);
                    onCajaHabilitada(sesionActiva.id);
                    const datos = await cashService.obtenerResumen(sesionActiva.id);
                    setResumen(datos);
                }
            } else {
                mostrarAlerta(e.message);
            }
            setConfirmandoFondo(false);
        } finally {
            setCargando(false);
        }
    };

    // ── Sección B: Agregar movimiento ─────────────────────────────────────────
    const handleAgregarMovimiento = async () => {
        const monto = parseFloat(montoMovimiento);
        if (!sesion) return mostrarAlerta('Primero abra el turno registrando el fondo');
        if (isNaN(monto) || monto <= 0) return mostrarAlerta('Ingrese un monto válido');
        if (!conceptoMovimiento.trim()) return mostrarAlerta('Ingrese el concepto del movimiento');
        setCargando(true);
        try {
            const movimiento = await cashService.agregarMovimiento(sesion.id, {
                movement_type: tipoMovimiento,
                amount: monto,
                concept: conceptoMovimiento.trim(),
            });
            setMovimientos(prev => [...prev, movimiento]);
            setMontoMovimiento('');
            setConceptoMovimiento('');
            await actualizarResumen();
        } catch (e) {
            mostrarAlerta(e.message);
        } finally {
            setCargando(false);
        }
    };

    const handleEliminarMovimiento = async (movimientoId) => {
        try {
            await cashService.eliminarMovimiento(sesion.id, movimientoId);
            setMovimientos(prev => prev.filter(m => m.id !== movimientoId));
            await actualizarResumen();
        } catch (e) {
            mostrarAlerta(e.message);
        }
    };

    // ── Sección D: Cerrar turno ───────────────────────────────────────────────
    const handleIniciarCierre = async () => {
        if (!sesion) return;
        await actualizarResumen();
        setCapturandoFisico(true);
        setFocusedField('cash');
    };

    const handleConfirmarCantidades = () => {
        setConfirmandoCierre(true);
    };

    const handleConfirmarCierre = async () => {
        setCargando(true);
        try {
            const resultado = await cashService.cerrarSesion(sesion.id, {
                physical_cash: parseFloat(fisicoCash) || 0,
                physical_credit: parseFloat(fisicoCredito) || 0,
                physical_debit: parseFloat(fisicoDebito) || 0,
            });
            setTurnoFinalizado(true);
            setConfirmandoCierre(false);
            setResumen(resultado.resumen);
            onCajaDeshabilitada();
            setShowDailyContext(true); // Mostrar popup de contexto diario
            
            // Disparar impresión automática del corte
            setTimeout(handlePrintCorte, 500);
        } catch (e) {
            mostrarAlerta(e.message);
            setConfirmandoCierre(false);
        } finally {
            setCargando(false);
        }
    };

    // Guardar contexto diario (fire-and-forget, no bloquea nada)
    const handleSaveDailyContext = async () => {
        try {
            const mexicoDate = new Intl.DateTimeFormat('en-CA', {
                timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit'
            }).format(new Date());
            await fetch(`${CONFIG.API_BASE_URL}/analytics/context?target_date=${mexicoDate}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    target_date: mexicoDate,
                    is_atypical: ctxAtypical,
                    weather_condition: ctxWeather,
                    notes: ctxNotes || null
                })
            });
            setDailyContextSaved(true);
        } catch (e) {
            console.error('Error guardando contexto diario:', e);
            // No mostrar error al cajero — no es crítico
        }
        setShowDailyContext(false);
    };

    const handleNuevoTurno = () => {
        setSesion(null);
        setResumen(null);
        setEmpleado(null);
        setPinInput('');
        setFondoInput('');
        setFondoConfirmado(false);
        setMovimientos([]);
        setTurnoFinalizado(false);
        setCapturandoFisico(false);
        setConfirmandoCierre(false);
        setFisicoCash('');
        setFisicoCredito('');
        setFisicoDebito('');
        setShowDailyContext(false);
        setDailyContextSaved(false);
        setCtxWeather(null);
        setCtxAtypical(false);
        setCtxNotes('');
    };

    const formatHora = (iso) => {
        if (!iso) return '';
        return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-500">
            <div className="bg-[#0d0d0d] border border-white/10 rounded-[50px] shadow-2xl w-full max-w-7xl max-h-[95vh] overflow-hidden flex flex-col scale-100 animate-in zoom-in-95 duration-500">

                {/* Header Premium Refinado */}
                <div className="sticky top-0 bg-[#0d0d0d] flex justify-between items-center px-10 py-10 border-b border-white/5 z-20 backdrop-blur-3xl">
                    <div className="flex flex-col">
                        <h1 className="text-5xl font-black uppercase italic tracking-tighter text-white/90 leading-none">
                            Gestor de <span className="text-[#c1d72e]">Caja</span>
                        </h1>
                        <p className="text-[10px] font-black text-white/20 uppercase tracking-[0.4em] mt-3">
                            Terminal {terminalId} {sesion ? `· ${sesion.employee_name} · Desde ${formatHora(sesion.opened_at)}` : '· Control de Operaciones'}
                        </p>
                    </div>
                    
                    <button 
                        onClick={onClose} 
                        className="w-16 h-16 rounded-[25px] bg-white/5 hover:bg-[#c1d72e]/10 border border-white/10 hover:border-[#c1d72e]/30 flex items-center justify-center text-white/30 hover:text-[#c1d72e] transition-all duration-300 group shadow-lg"
                    >
                        <span className="text-2xl group-hover:rotate-90 transition-transform duration-300">✕</span>
                    </button>
                </div>

                {/* Alerta global */}
                {alerta && (
                    <div className="px-8 pt-4">
                        <AlertaInterna mensaje={alerta.mensaje} tipo={alerta.tipo} onClose={() => setAlerta(null)} />
                    </div>
                )}

                <div className="flex-1 overflow-y-auto flex">
                    {/* Cuerpo Principal */}
                    <div className="flex-1 grid grid-cols-2 gap-8 p-10 border-r border-white/5">

                    {/* ── COLUMNA IZQUIERDA: A + B ── */}
                    <div className="flex flex-col gap-6">

                        {/* SECCIÓN A — APERTURA DE TURNO */}
                        <div className="bg-white/3 border border-white/5 rounded-[40px] p-8 backdrop-blur-xl hover:border-[#c1d72e]/20 transition-all duration-500">
                            <SeccionHeader icon="👤" titulo="Apertura de Turno" />

                            {/* Campo 1: PIN del cajero */}
                            <div className="mb-4">
                                <label className="text-[10px] font-black uppercase tracking-widest text-white/40 block mb-2">
                                    Colaborador Responsable
                                </label>
                                {!empleado ? (
                                    <div className="flex gap-2">
                                        <input
                                            type="password"
                                            value={pinInput}
                                            onChange={e => setPinInput(e.target.value)}
                                            onKeyDown={e => e.key === 'Enter' && handleValidarPin()}
                                            placeholder="Ingrese clave"
                                            className="flex-1 bg-black/40 border border-white/20 rounded-xl px-4 py-3 text-white font-mono text-sm focus:outline-none focus:border-[#c1d72e]"
                                        />
                                        <button
                                            onClick={handleValidarPin}
                                            disabled={cargando}
                                            className="bg-[#c1d72e] text-black font-black px-4 py-3 rounded-xl hover:opacity-90 transition disabled:opacity-50"
                                        >
                                            ✓
                                        </button>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-3 bg-green-900/20 border border-green-500/30 rounded-xl px-4 py-3">
                                        <span className="text-green-400 text-lg">👤</span>
                                        <div>
                                            <p className="text-white font-black text-sm">{empleado.name}</p>
                                            <p className="text-green-400 text-[10px] uppercase font-bold">{empleado.role}</p>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Campo 2: Fondo de caja */}
                            <div>
                                <label className="text-[10px] font-black uppercase tracking-widest text-white/40 block mb-2">
                                    Fondo de Caja
                                </label>
                                {!fondoConfirmado ? (
                                    confirmandoFondo ? (
                                        <div className="bg-yellow-900/20 border border-yellow-500/30 rounded-xl p-4">
                                            <p className="text-yellow-300 text-sm font-bold mb-3">
                                                ⚠ ¿Confirma el fondo de <span className="text-white font-black">${parseFloat(fondoInput).toFixed(2)}</span>?
                                                <br/><span className="text-yellow-500/70 text-xs">Esta cantidad no podrá modificarse.</span>
                                            </p>
                                            <div className="flex gap-2">
                                                <button onClick={handleConfirmarFondo} disabled={cargando} className="flex-1 bg-[#c1d72e] text-black font-black py-2 rounded-xl hover:opacity-90 transition disabled:opacity-50">
                                                    Sí, confirmar
                                                </button>
                                                <button onClick={() => setConfirmandoFondo(false)} className="flex-1 bg-white/10 text-white font-bold py-2 rounded-xl hover:bg-white/20 transition">
                                                    Cancelar
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex gap-4">
                                            <div className="relative flex-1">
                                                <span className={`absolute left-4 top-1/2 -translate-y-1/2 font-bold ${focusedField === 'fondo' ? 'text-[#c1d72e]' : 'text-white/40'}`}>$</span>
                                                <input
                                                    type="number"
                                                    readOnly
                                                    value={fondoInput}
                                                    onClick={() => setFocusedField('fondo')}
                                                    disabled={!empleado}
                                                    placeholder="0.00"
                                                    className={`w-full bg-black/40 border ${focusedField === 'fondo' ? 'border-[#c1d72e]' : 'border-white/20'} rounded-2xl pl-8 pr-4 py-4 text-white font-mono text-lg focus:outline-none disabled:opacity-30`}
                                                />
                                            </div>
                                            <button
                                                onClick={handleRegistrarFondo}
                                                disabled={!empleado || cargando}
                                                className="bg-[#c1d72e] text-black font-black px-6 py-4 rounded-2xl hover:opacity-90 transition disabled:opacity-50 shadow-lg shadow-[#c1d72e]/20"
                                            >
                                                VALIDAR
                                            </button>
                                        </div>
                                    )
                                ) : (
                                    <div className="flex items-center gap-3 bg-green-900/20 border border-green-500/30 rounded-xl px-4 py-3">
                                        <span className="text-green-400 text-lg">💵</span>
                                        <div>
                                            <p className="text-white font-black text-xl font-mono">${sesion?.opening_float?.toFixed(2) || fondoInput}</p>
                                            <p className="text-green-400 text-[10px] uppercase font-bold">Fondo Registrado · Caja Activa</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* SECCIÓN B — ENTRADAS Y SALIDAS */}
                        <div className="bg-white/3 border border-white/5 rounded-[40px] p-8 backdrop-blur-xl flex-1 hover:border-[#c1d72e]/20 transition-all duration-500">
                            <SeccionHeader icon="💸" titulo="Flujo de Efectivo" />

                            {/* Formulario de movimiento */}
                            <div className="space-y-3 mb-4">
                                <div className="flex gap-2">
                                    {['SALIDA', 'ENTRADA'].map(tipo => (
                                        <button
                                            key={tipo}
                                            onClick={() => setTipoMovimiento(tipo)}
                                            className={`flex-1 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition ${
                                                tipoMovimiento === tipo
                                                    ? tipo === 'SALIDA' ? 'bg-red-600 text-white' : 'bg-green-600 text-white'
                                                    : 'bg-white/5 text-white/40 hover:bg-white/10'
                                            }`}
                                        >
                                            {tipo === 'SALIDA' ? '↑ Salida' : '↓ Entrada'}
                                        </button>
                                    ))}
                                </div>
                                <div className="relative">
                                    <span className={`absolute left-4 top-1/2 -translate-y-1/2 font-bold ${focusedField === 'movimiento' ? 'text-[#c1d72e]' : 'text-white/40'}`}>$</span>
                                    <input
                                        type="number"
                                        readOnly
                                        value={montoMovimiento}
                                        onClick={() => setFocusedField('movimiento')}
                                        disabled={!fondoConfirmado}
                                        placeholder="Monto"
                                        className={`w-full bg-black/40 border ${focusedField === 'movimiento' ? 'border-[#c1d72e]' : 'border-white/20'} rounded-xl pl-8 pr-4 py-3 text-white font-mono text-sm focus:outline-none disabled:opacity-30`}
                                    />
                                </div>
                                <input
                                    type="text"
                                    value={conceptoMovimiento}
                                    onChange={e => setConceptoMovimiento(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && handleAgregarMovimiento()}
                                    disabled={!fondoConfirmado}
                                    placeholder="Concepto (ej: Retiro propinas)"
                                    className="w-full bg-black/40 border border-white/20 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-[#c1d72e] disabled:opacity-30"
                                />
                                <button
                                    onClick={handleAgregarMovimiento}
                                    disabled={!fondoConfirmado || cargando}
                                    className="w-full bg-white/10 hover:bg-white/20 text-white font-black py-2.5 rounded-xl text-xs uppercase tracking-wider transition disabled:opacity-30"
                                >
                                    + Registrar Movimiento
                                </button>
                            </div>

                            {/* Lista de movimientos */}
                            {movimientos.length === 0 ? (
                                <p className="text-center text-white/20 text-xs py-4">Sin movimientos registrados</p>
                            ) : (
                                <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                                    {movimientos.map(m => (
                                        <div key={m.id} className="flex justify-between items-center py-2 border-b border-white/5">
                                            <div className="flex items-center gap-2">
                                                <span className={`text-xs font-black ${m.movement_type === 'SALIDA' ? 'text-red-400' : 'text-green-400'}`}>
                                                    {m.movement_type === 'SALIDA' ? '↑' : '↓'}
                                                </span>
                                                <div>
                                                    <p className="text-xs text-white font-bold">{m.concept}</p>
                                                    <p className="text-[10px] text-white/30">{formatHora(m.created_at)}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className={`text-sm font-black font-mono ${m.movement_type === 'SALIDA' ? 'text-red-400' : 'text-green-400'}`}>
                                                    {m.movement_type === 'SALIDA' ? '-' : '+'}${m.amount.toFixed(2)}
                                                </span>
                                                {!turnoFinalizado && (
                                                    <button onClick={() => handleEliminarMovimiento(m.id)} className="text-white/20 hover:text-red-400 text-xs transition">✕</button>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* ── COLUMNA DERECHA: D + C ── */}
                    <div className="flex flex-col gap-6">

                        {/* SECCIÓN D — CORTE Y CIERRE */}
                        <div className="bg-white/3 border border-white/5 rounded-[40px] p-8 backdrop-blur-xl hover:border-[#c1d72e]/20 transition-all duration-500">
                            <SeccionHeader icon="🔒" titulo="Cierre de Turno" />

                            {!turnoFinalizado ? (
                                <>
                                    {!capturandoFisico ? (
                                        <button
                                            onClick={handleIniciarCierre}
                                            disabled={!fondoConfirmado || cargando}
                                            className="w-full bg-red-600/20 hover:bg-red-600/40 border border-red-500/30 text-red-300 font-black py-3 rounded-xl uppercase tracking-widest text-xs transition disabled:opacity-30"
                                        >
                                            🔒 Cerrar Turno
                                        </button>
                                    ) : (
                                        <>
                                            <div className="bg-yellow-900/20 border border-yellow-500/30 rounded-xl px-4 py-3 mb-4">
                                                <p className="text-yellow-400 text-xs font-black uppercase tracking-wider">Paso 1: Declare el dinero físico</p>
                                            </div>

                                            {/* Campos de captura física (siempre visibles en este paso) */}
                                            <div className="space-y-1 mb-4">
                                                <div className="grid grid-cols-3 gap-2 mb-2">
                                                    <span className="text-[10px] text-white/30 uppercase font-bold">Rubro</span>
                                                    <span className="text-[10px] text-white/30 uppercase font-bold">Sistema</span>
                                                    <span className="text-[10px] text-white/30 uppercase font-bold">En Caja / Dif.</span>
                                                </div>
                                                <FilaDiferencia label="Efectivo" esperado={resumen?.efectivo_esperado} capturado={fisicoCash} onFocus={() => setFocusedField('cash')} active={focusedField === 'cash'} />
                                                <FilaDiferencia label="Crédito" esperado={resumen?.total_credito} capturado={fisicoCredito} onFocus={() => setFocusedField('credit')} active={focusedField === 'credit'} />
                                                <FilaDiferencia label="Débito" esperado={resumen?.total_debito} capturado={fisicoDebito} onFocus={() => setFocusedField('debit')} active={focusedField === 'debit'} />
                                            </div>

                                            {!confirmandoCierre ? (
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={handleConfirmarCantidades}
                                                        className="flex-1 bg-[#c1d72e] text-black font-black py-3 rounded-xl uppercase tracking-widest text-xs transition shadow-lg shadow-[#c1d72e]/20"
                                                    >
                                                        Confirmar Cantidades
                                                    </button>
                                                    <button
                                                        onClick={() => { setCapturandoFisico(false); setFocusedField(null); }}
                                                        className="w-12 bg-white/10 hover:bg-white/20 text-white font-black py-3 rounded-xl uppercase transition flex items-center justify-center"
                                                    >
                                                        ✕
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="bg-red-900/20 border border-red-500/30 rounded-xl p-4 mt-2">
                                                    <p className="text-red-300 text-sm font-bold mb-1">⚠ ¿Cerrar definitivamente?</p>
                                                    <p className="text-red-500/70 text-[10px] mb-3 leading-tight">Efectivo declarado: ${fisicoCash || '0.00'} <br/> Esta acción deshabilita la caja en automático.</p>
                                                    <div className="flex gap-2">
                                                        <button onClick={handleConfirmarCierre} disabled={cargando} className="flex-1 bg-red-600 text-white font-black py-2.5 rounded-xl uppercase tracking-wider text-[10px] hover:opacity-90 disabled:opacity-50">
                                                            Sí, cerrar turno
                                                        </button>
                                                        <button onClick={() => { setConfirmandoCierre(false); setFocusedField('cash'); }} className="flex-1 bg-white/10 hover:bg-white/20 text-white font-bold py-2.5 rounded-xl uppercase tracking-wider text-[10px]">
                                                            Regresar
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </>
                                    )}
                                </>
                            ) : (
                                <>
                                    <div className="bg-green-900/20 border border-green-500/30 rounded-xl px-4 py-3 mb-4">
                                        <p className="text-green-400 text-xs font-black uppercase tracking-wider">✓ Turno Cerrado · Resumen Final</p>
                                    </div>

                                    {/* Campos de captura física (sólo lectura tras el cierre) */}
                                    <div className="space-y-1 mb-4 opacity-70 pointer-events-none">
                                        <div className="grid grid-cols-3 gap-2 mb-2">
                                            <span className="text-[10px] text-white/30 uppercase font-bold">Rubro</span>
                                            <span className="text-[10px] text-white/30 uppercase font-bold">Sistema</span>
                                            <span className="text-[10px] text-white/30 uppercase font-bold">En Caja / Dif.</span>
                                        </div>
                                        <FilaDiferencia label="Efectivo" esperado={resumen?.efectivo_esperado} capturado={fisicoCash} active={false} />
                                        <FilaDiferencia label="Crédito" esperado={resumen?.total_credito} capturado={fisicoCredito} active={false} />
                                        <FilaDiferencia label="Débito" esperado={resumen?.total_debito} capturado={fisicoDebito} active={false} />
                                    </div>

                                    {/* Contexto diario post-cierre (no bloqueante) */}
                                    {showDailyContext && !dailyContextSaved && (
                                        <div className="bg-blue-500/10 border border-blue-400/20 rounded-2xl p-4 mb-4 space-y-3 animate-pulse-once">
                                            <p className="text-xs font-black text-blue-300 uppercase tracking-widest">📝 ¿Cómo estuvo el día?</p>
                                            <div className="flex items-center gap-2">
                                                {[
                                                    { val: 'SOLEADO', emoji: '☀️' },
                                                    { val: 'NUBLADO', emoji: '🌤️' },
                                                    { val: 'LLUVIA', emoji: '🌧️' },
                                                    { val: 'TORMENTA', emoji: '⛈️' },
                                                    { val: 'MUCHO_CALOR', emoji: '🥵' },
                                                    { val: 'FRIO', emoji: '❄️' }
                                                ].map(w => (
                                                    <button
                                                        key={w.val}
                                                        onClick={() => setCtxWeather(ctxWeather === w.val ? null : w.val)}
                                                        className={`text-2xl p-2 rounded-xl transition-all ${
                                                            ctxWeather === w.val
                                                                ? 'bg-white/20 ring-2 ring-blue-400 scale-110'
                                                                : 'hover:bg-white/10 opacity-60 hover:opacity-100'
                                                        }`}
                                                        title={w.val.replace('_', ' ')}
                                                    >
                                                        {w.emoji}
                                                    </button>
                                                ))}
                                                <span className="text-white/20 mx-2">|</span>
                                                <button
                                                    onClick={() => setCtxAtypical(!ctxAtypical)}
                                                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all border ${
                                                        ctxAtypical
                                                            ? 'bg-red-500/20 border-red-400/30 text-red-300'
                                                            : 'border-white/10 text-white/30 hover:text-white/60'
                                                    }`}
                                                >
                                                    ⚠️ Atípico
                                                </button>
                                            </div>
                                            <input
                                                type="text"
                                                value={ctxNotes}
                                                onChange={e => setCtxNotes(e.target.value)}
                                                placeholder="Notas del día (opcional)..."
                                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white/80 placeholder-white/20 font-bold focus:outline-none focus:border-blue-400/50"
                                            />
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={handleSaveDailyContext}
                                                    className="flex-1 bg-blue-500/20 hover:bg-blue-500/40 border border-blue-400/30 text-blue-300 font-black py-2.5 rounded-xl uppercase tracking-widest text-[10px] transition"
                                                >
                                                    ✓ Guardar
                                                </button>
                                                <button
                                                    onClick={() => setShowDailyContext(false)}
                                                    className="flex-1 bg-white/5 hover:bg-white/10 text-white/40 font-black py-2.5 rounded-xl uppercase tracking-widest text-[10px] transition"
                                                >
                                                    Omitir →
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                    {dailyContextSaved && (
                                        <div className="bg-emerald-500/10 border border-emerald-400/20 rounded-2xl px-4 py-3 mb-4 text-center">
                                            <p className="text-xs font-black text-emerald-400">✅ Contexto del día registrado</p>
                                        </div>
                                    )}

                                    <div className="flex gap-2">
                                        <button
                                            onClick={handlePrintCorte}
                                            className="flex-1 bg-white/10 hover:bg-white/20 text-white font-black py-3 rounded-xl uppercase tracking-widest text-[10px] transition"
                                        >
                                            📄 Imprimir Reporte
                                        </button>
                                        <button
                                            onClick={handleNuevoTurno}
                                            className="flex-1 bg-[#c1d72e]/10 hover:bg-[#c1d72e]/20 border border-[#c1d72e]/30 text-[#c1d72e] font-black py-3 rounded-xl uppercase tracking-widest text-[10px] transition"
                                        >
                                            + Nuevo Turno
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Plantilla de Impresión (Oculta) */}
                        <div style={{ display: 'none' }}>
                            <CorteTicketTemplate 
                                ref={cortePrintRef} 
                                resumen={resumen} 
                                sesion={sesion}
                                capturado={{ cash: fisicoCash, credit: fisicoCredito, debit: fisicoDebito }}
                            />
                        </div>

                        {/* SECCIÓN C — INFORMACIÓN SEGÚN SISTEMA */}
                        <div className="bg-white/3 border border-white/5 rounded-[40px] p-8 backdrop-blur-xl flex-1 hover:border-[#c1d72e]/20 transition-all duration-500">
                            <div className="flex items-center justify-between mb-2">
                                <SeccionHeader icon="📊" titulo="Balance" />
                                {sesion && !turnoFinalizado && (
                                    <button 
                                        onClick={actualizarResumen} 
                                        disabled={refrescando}
                                        className={`text-[9px] flex items-center gap-1.5 font-black uppercase tracking-widest transition-all ${
                                            refrescando ? 'text-[#c1d72e] opacity-100' : 'text-white/20 hover:text-white/50'
                                        }`}
                                    >
                                        <span className={refrescando ? 'animate-spin inline-block' : ''}>↻</span>
                                        {refrescando ? 'Sync...' : 'Actualizar'}
                                    </button>
                                )}
                            </div>

                            {!resumen ? (
                                <p className="text-center text-white/20 text-xs py-8">
                                    {fondoConfirmado ? 'Cargando datos...' : 'Disponible después de abrir el turno'}
                                </p>
                            ) : (
                                <div className="space-y-1">
                                    <CampoMoneda label="Fondo Inicial" valor={resumen.fondo_inicial} />
                                    <CampoMoneda label="Entradas" valor={resumen.total_entradas} className="text-green-400" />
                                    <CampoMoneda label="Salidas" valor={resumen.total_salidas} className="text-red-400" />
                                    <div className="border-t border-white/10 pt-3 mt-3">
                                        <CampoMoneda label="💵 Efectivo Esperado" valor={resumen.efectivo_esperado} />
                                        <CampoMoneda label="💳 Tarjeta Crédito" valor={resumen.total_credito} />
                                        <CampoMoneda label="💳 Tarjeta Débito" valor={resumen.total_debito} />
                                    </div>
                                    <div className="border-t border-white/10 pt-3 mt-3">
                                        <CampoMoneda label="Total Ventas" valor={resumen.total_ventas} />
                                        <div className="flex justify-between items-center py-2">
                                            <span className="text-xs font-bold text-white/50 uppercase tracking-wider">Transacciones</span>
                                            <span className="text-lg font-black text-white">{resumen.num_transacciones}</span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* ── COLUMNA TECLADO TÁCTIL ── */}
                <div className="w-[380px] bg-white/3 p-10 flex flex-col">
                    <SeccionHeader icon="⌨" titulo="Teclado Táctil" />
                    
                    <div className="flex-1 flex flex-col justify-center">
                        <div className="mb-8 text-center bg-black/40 border border-white/10 rounded-2xl py-6">
                            <p className="text-[10px] font-black uppercase text-white/30 tracking-widest mb-1">Valor en Pantalla</p>
                            <p className="text-4xl font-black text-[#c1d72e] font-mono tracking-tighter">
                                ${focusedField ? (
                                    focusedField === 'fondo' ? fondoInput :
                                    focusedField === 'movimiento' ? montoMovimiento :
                                    focusedField === 'cash' ? fisicoCash :
                                    focusedField === 'credit' ? fisicoCredito :
                                    fisicoDebito
                                ) || '0.00' : '---'}
                            </p>
                        </div>

                        <div className="grid grid-cols-3 gap-3">
                            {[1, 2, 3, 4, 5, 6, 7, 8, 9, '.', 0, '←'].map((key) => (
                                <button
                                    key={key}
                                    onClick={() => handleKeypadPress(key)}
                                    className={`h-20 rounded-2xl font-black text-2xl transition-all border flex items-center justify-center ${
                                        key === '←' 
                                            ? 'bg-red-600/20 border-red-500/30 text-red-400 hover:bg-red-600/40' 
                                            : 'bg-white/5 border-white/10 text-white hover:bg-white/15'
                                    }`}
                                >
                                    {key}
                                </button>
                            ))}
                            <button
                                onClick={() => handleKeypadPress('C')}
                                className="h-20 rounded-2xl bg-white/10 border border-white/20 text-white font-black text-xs uppercase tracking-widest hover:bg-white/20 transition-all"
                            >
                                C
                            </button>
                            <button
                                onClick={() => handleKeypadPress('ENTER')}
                                className="col-span-2 h-20 rounded-2xl bg-[#c1d72e] border border-[#c1d72e]/50 text-black font-black text-xs uppercase tracking-[0.2em] hover:opacity-90 transition-all shadow-lg shadow-[#c1d72e]/20"
                            >
                                ENTER / CONTINUAR
                            </button>
                        </div>
                    </div>

                    <div className="mt-8 pt-8 border-t border-white/5 text-center">
                        <p className="text-[9px] font-bold text-white/20 uppercase tracking-[0.3em]">Smart Touch Interface v2.5</p>
                    </div>
                </div>
            </div>
        </div>
    </div>
);
};
