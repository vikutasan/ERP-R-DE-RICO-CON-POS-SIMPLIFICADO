import React, { useState, useEffect, useRef } from 'react';
import { CONFIG } from '../pos/config';
import { useTimezone } from '../shared/TimezoneContext';
import { todayLocal, formatLocalTime, parseUtc } from '../shared/timezone';
import {
    classifyTerminalStatus,
    classifyEvents,
    summarizeSuspiciousIncidents,
} from './utils/networkClassifiers';

/**
 * Módulo: Monitoreo de Red
 * Dashboard de salud de red para el ERP R de Rico.
 * Muestra el estado de todas las terminales, latencia en tiempo real,
 * y un historial de eventos de desconexión de las últimas 24 horas.
 */

// v13 (Fase 13.2): única fuente de verdad de la URL del API (Incidente 16.6).
// PROHIBIDO reconstruir la URL con window.location.hostname + ':5001'.
const API_BASE = CONFIG.API_BASE_URL;

const TERMINALS = ['T6', 'T5', 'T4', 'T3', 'T2', 'CAJA'];

const STATUS_CONFIG = {
    online:    { color: '#4ade80', bg: 'rgba(74,222,128,0.08)', border: 'rgba(74,222,128,0.25)', label: 'EN LÍNEA',         icon: '●' },
    cash_open: { color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.25)', label: 'CAJA ABIERTA',     icon: '◐' },
    stale:     { color: '#ef4444', bg: 'rgba(239,68,68,0.08)',   border: 'rgba(239,68,68,0.25)',   label: 'SESIÓN EXPIRADA', icon: '○' },
    slow:      { color: '#facc15', bg: 'rgba(250,204,21,0.08)',  border: 'rgba(250,204,21,0.25)',  label: 'RED LENTA',       icon: '◐' },
    offline:   { color: '#ef4444', bg: 'rgba(239,68,68,0.08)',   border: 'rgba(239,68,68,0.25)',   label: 'SIN CONEXIÓN',   icon: '○' },
    idle:      { color: '#555',    bg: 'rgba(85,85,85,0.08)',     border: 'rgba(85,85,85,0.25)',    label: 'DISPONIBLE',     icon: '○' },
};


export const NetworkMonitorUI = () => {
    // v20 (Fase 20.4): la zona horaria del negocio viene del TimezoneProvider.
    const { timezone } = useTimezone();
    const [serverLatency, setServerLatency] = useState(null);
    const [serverStatus, setServerStatus] = useState('offline');
    const [terminalData, setTerminalData] = useState({});
    const [eventLog, setEventLog] = useState([]);
    const [selectedDate, setSelectedDate] = useState(() => todayLocal(timezone));
    const [incidentSummary, setIncidentSummary] = useState({});
    const [showInfoModal, setShowInfoModal] = useState(false);
    const [uptimeStart, setUptimeStart] = useState(null);
    const prevStatusRef = useRef({});

    // Ping al servidor API
    useEffect(() => {
        const pingServer = async () => {
            const start = performance.now();
            try {
                const res = await fetch(`${API_BASE}/settings`, {
                    cache: 'no-store',
                    signal: AbortSignal.timeout(5000)
                });
                const elapsed = Math.round(performance.now() - start);
                setServerLatency(elapsed);
                setServerStatus(elapsed > 500 ? 'slow' : res.ok ? 'online' : 'offline');
                if (!uptimeStart) setUptimeStart(new Date());
            } catch (e) {
                setServerLatency(-1);
                setServerStatus('offline');
            }
        };
        pingServer();
        const id = setInterval(pingServer, 10000);
        return () => clearInterval(id);
    }, [uptimeStart]);

    // Estado de terminales
    useEffect(() => {
        const fetchTerminals = async () => {
            try {
                const res = await fetch(`${API_BASE}/pos/terminals/status`, { cache: 'no-store' });
                if (!res.ok) return;
                const data = await res.json();
                const now = new Date();

                const newData = {};
                TERMINALS.forEach(tid => {
                    const info = data[tid];
                    const isOccupied = info && info.occupier_id;

                    // v13 (Fase 13.1): clasificación delegada a función pura testeada.
                    const termStatus = classifyTerminalStatus(info, Date.now());

                    newData[tid] = {
                        status: termStatus,
                        occupier: isOccupied ? info.occupier_name : null,
                        lockedAt: info?.locked_at || null,
                        hasCash: info?.is_cash_register || false,
                    };

                    // Detectar cambios de estado para el log
                    const prevOccupier = prevStatusRef.current[tid]?.occupier;
                    const wasOccupied = !!prevOccupier;

                    if (wasOccupied && !isOccupied) {
                        const evt = {
                            time: formatLocalTime(now, timezone),
                            timestamp: now.getTime(),
                            terminal: tid,
                            type: 'disconnect',
                            rawType: 'disconnect',
                            severity: 'normal',
                            message: `${prevOccupier || 'Usuario'} se desconectó`,
                            user: prevOccupier || 'Desconocido',
                        };
                        setEventLog(prev => [evt, ...prev].slice(0, 100));
                        // Guardar en BD
                        fetch(`${API_BASE}/network/incidents`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                terminal_id: tid,
                                incident_type: 'disconnect',
                                user_logged: prevOccupier || null,
                                details: 'Terminal desconectada — sesión perdida'
                            })
                        }).catch(() => {});
                    } else if (!wasOccupied && isOccupied) {
                        const evt = {
                            time: formatLocalTime(now, timezone),
                            timestamp: now.getTime(),
                            terminal: tid,
                            type: 'connect',
                            rawType: 'reconnect',
                            severity: 'normal',
                            message: `${info.occupier_name} se conectó`,
                            user: info.occupier_name,
                        };
                        setEventLog(prev => [evt, ...prev].slice(0, 100));
                        fetch(`${API_BASE}/network/incidents`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                terminal_id: tid,
                                incident_type: 'reconnect',
                                user_logged: info.occupier_name,
                                details: 'Terminal reconectada'
                            })
                        }).catch(() => {});
                    }
                });

                prevStatusRef.current = newData;
                setTerminalData(newData);
            } catch (e) { /* Network error */ }
        };
        fetchTerminals();
        const id = setInterval(fetchTerminals, 5000);
        return () => clearInterval(id);
    }, []);

    // Cargar incidentes por fecha desde BD
    const loadIncidents = async (date) => {
        try {
            const res = await fetch(`${API_BASE}/network/incidents?date=${date}&limit=200`);
            if (!res.ok) return;
            const data = await res.json();

            // v20 (Fase 20.4): formateo delegado a formatLocalTime (zona del negocio).
            const mapped = data.map(inc => {
                const localDate = parseUtc(inc.created_at);
                return {
                    time: formatLocalTime(inc.created_at, timezone),
                    timestamp: localDate ? localDate.getTime() : 0,
                    terminal: inc.terminal_id,
                    rawType: inc.incident_type,
                    type: inc.incident_type === 'disconnect' ? 'disconnect' : 'connect',
                    message: inc.details || inc.incident_type,
                    user: inc.user_logged || 'Sistema',
                };
            });

            // v13 (Fase 13.1): clasificación y resumen delegados a funciones puras testeadas.
            const classified = classifyEvents(mapped);

            setEventLog(classified);
            setIncidentSummary(summarizeSuspiciousIncidents(classified));
        } catch (e) { console.warn('Could not load incidents:', e); }
    };

    useEffect(() => {
        loadIncidents(selectedDate);
    }, [selectedDate]);

    const activeCount = Object.values(terminalData).filter(t => t.status === 'online').length;
    const srvCfg = STATUS_CONFIG[serverStatus];

    const formatUptime = () => {
        if (!uptimeStart) return '--:--:--';
        const diff = Math.floor((Date.now() - uptimeStart.getTime()) / 1000);
        const h = String(Math.floor(diff / 3600)).padStart(2, '0');
        const m = String(Math.floor((diff % 3600) / 60)).padStart(2, '0');
        const s = String(diff % 60).padStart(2, '0');
        return `${h}:${m}:${s}`;
    };

    const [, forceUpdate] = useState(0);
    useEffect(() => {
        const id = setInterval(() => forceUpdate(c => c + 1), 1000);
        return () => clearInterval(id);
    }, []);

    return (
        <div className="h-full overflow-y-auto custom-scrollbar" style={{ background: 'linear-gradient(135deg, #050505 0%, #0a0f1a 100%)' }}>
            <div className="max-w-7xl mx-auto p-10 space-y-8">

                {/* Header */}
                <div>
                    <h1 className="text-4xl font-black uppercase tracking-tight text-white">
                        Monitoreo de Red
                    </h1>
                    <p className="text-sm text-gray-500 font-medium mt-1">
                        Estado en tiempo real de la infraestructura LAN
                    </p>
                </div>

                {/* KPIs Row */}
                <div className="grid grid-cols-3 gap-4">
                    {/* Server Status */}
                    <div className="rounded-2xl p-6 border" style={{ background: srvCfg.bg, borderColor: srvCfg.border }}>
                        <p className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">Servidor API</p>
                        <div className="flex items-center gap-3">
                            <span className="text-3xl" style={{ color: srvCfg.color }}>{srvCfg.icon}</span>
                            <div>
                                <p className="text-xl font-black uppercase" style={{ color: srvCfg.color }}>{srvCfg.label}</p>
                                <p className="text-sm text-gray-500 font-bold tabular-nums">
                                    {serverLatency > 0 ? `${serverLatency}ms` : 'Sin respuesta'}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Active Terminals */}
                    <div className="rounded-2xl p-6 border" style={{ background: 'rgba(74,222,128,0.05)', borderColor: 'rgba(74,222,128,0.15)' }}>
                        <p className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">Terminales Activas</p>
                        <p className="text-4xl font-black text-green-400 tabular-nums">{activeCount}<span className="text-lg text-gray-600">/6</span></p>
                    </div>

                    {/* Latency — color matches diagnostic guide */}
                    {(() => {
                        const lc = serverLatency > 100 || serverLatency <= 0 
                            ? { color: '#f87171', bg: 'rgba(248,113,113,0.05)', border: 'rgba(248,113,113,0.2)' }
                            : serverLatency > 50 
                            ? { color: '#facc15', bg: 'rgba(250,204,21,0.05)', border: 'rgba(250,204,21,0.2)' }
                            : { color: '#4ade80', bg: 'rgba(74,222,128,0.05)', border: 'rgba(74,222,128,0.2)' };
                        return (
                            <div className="rounded-2xl p-6 border transition-all duration-500" style={{ background: lc.bg, borderColor: lc.border }}>
                                <div className="flex items-center gap-2 mb-2">
                                    <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Latencia Servidor</p>
                                    <button onClick={() => setShowInfoModal(true)} className="w-5 h-5 rounded-full border text-[10px] font-black hover:text-white transition-all" style={{ background: `${lc.color}20`, borderColor: `${lc.color}50`, color: lc.color }}>i</button>
                                </div>
                                <p className="text-4xl font-black tabular-nums" style={{ color: lc.color }}>
                                    {serverLatency > 0 ? `${serverLatency}` : '--'}<span className="text-lg text-gray-600">ms</span>
                                </p>
                            </div>
                        );
                    })()}
                </div>

                {/* Terminals Grid + Per-terminal incident log */}
                <div>
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-base font-black uppercase tracking-widest text-gray-500">Estado por Terminal</h2>
                        <div className="flex items-center gap-4">
                            <input
                                type="date"
                                value={selectedDate}
                                onChange={(e) => setSelectedDate(e.target.value)}
                                className="bg-black/40 border border-gray-700 rounded-xl px-3 py-1.5 text-sm text-white font-bold focus:border-orange-500 outline-none"
                            />
                            {selectedDate !== todayLocal(timezone) && (
                                <button onClick={() => setSelectedDate(todayLocal(timezone))}
                                    className="text-xs font-bold text-orange-400 hover:text-orange-300 uppercase tracking-widest">
                                    Hoy
                                </button>
                            )}
                            <span className="text-sm font-bold text-gray-600">
                                {eventLog.length} eventos
                            </span>
                        </div>
                    </div>
                    {/* Row 1: Status cards */}
                    <div className="grid grid-cols-6 gap-3">
                        {TERMINALS.map(tid => {
                            const t = terminalData[tid] || { status: 'idle' };
                            const cfg = STATUS_CONFIG[t.status];
                            return (
                                <div key={tid} className="rounded-2xl p-5 border transition-all duration-500 h-[130px]"
                                    style={{ background: cfg.bg, borderColor: cfg.border }}>
                                    <div className="flex items-center justify-between mb-3">
                                        <span className="text-sm font-black uppercase tracking-widest text-gray-400">
                                            {tid === 'CAJA' ? 'Caja' : tid}
                                        </span>
                                        <span className={`w-3 h-3 rounded-full ${t.status === 'online' ? 'animate-pulse' : ''}`}
                                            style={{ backgroundColor: cfg.color }} />
                                    </div>
                                    <p className="text-sm font-bold uppercase truncate" style={{ color: cfg.color }}>{cfg.label}</p>
                                    {t.occupier && (
                                        <p className="text-xs text-gray-400 font-bold mt-1 truncate" title={t.occupier}>👤 {t.occupier}</p>
                                    )}
                                    {t.hasCash && (
                                        <p className="text-xs text-green-400 font-bold mt-0.5">💰 Caja Activa</p>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {/* Row 2: Incident counters */}
                    <div className="grid grid-cols-6 gap-3 mt-2">
                        {TERMINALS.map(tid => {
                            const totalDisc = incidentSummary[tid] || 0;
                            return (
                                <div key={tid} className={`rounded-xl px-3 py-2 border text-center ${
                                    totalDisc > 5 ? 'border-red-500/30 bg-red-500/5' : totalDisc > 0 ? 'border-red-500/20 bg-red-500/5' : 'border-gray-800/30 bg-black/20'
                                }`}>
                                    <span className={`text-lg font-black ${totalDisc > 5 ? 'text-red-400' : totalDisc > 0 ? 'text-red-400' : 'text-gray-700'}`}>
                                        {totalDisc}
                                    </span>
                                    <span className="text-[9px] text-gray-600 font-bold ml-1">fallas</span>
                                </div>
                            );
                        })}
                    </div>

                    {/* Row 3: Per-terminal event lists */}
                    <div className="grid grid-cols-6 gap-3 mt-2">
                        {TERMINALS.map(tid => {
                            const termEvents = eventLog.filter(e => e.terminal === tid);
                            return (
                                <div key={tid} className="rounded-xl border border-gray-800/40 overflow-hidden h-[200px]" style={{ background: 'rgba(0,0,0,0.25)' }}>
                                    {termEvents.length === 0 ? (
                                        <div className="h-full flex items-center justify-center">
                                            <p className="text-[10px] text-gray-700 font-bold">Sin incidentes</p>
                                        </div>
                                    ) : (
                                        <div className="h-full overflow-y-auto custom-scrollbar">
                                            {termEvents.map((evt, i) => (
                                                <div key={i} className="flex items-center gap-2 px-3 py-2 border-b border-gray-800/30 hover:bg-white/[0.02]">
                                                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                                        evt.type === 'connect' ? 'bg-green-400' 
                                                        : evt.severity === 'suspicious' ? 'bg-red-400' 
                                                        : 'bg-blue-400'
                                                    }`}></span>
                                                    <span className="text-[11px] font-bold text-gray-500 tabular-nums shrink-0">{evt.time}</span>
                                                    <span className="text-[11px] font-bold text-orange-400 truncate">{evt.user}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Modal de información */}
                {showInfoModal && (
                    <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[100]">
                        <div className="bg-gray-900 border border-white/10 p-8 rounded-[40px] max-w-lg w-full relative">
                            <h2 className="text-xl font-black uppercase text-indigo-400 mb-6">💡 Guía de Diagnóstico de Red</h2>
                            <h3 className="text-xs font-black uppercase tracking-widest text-gray-500 mb-3">Color del KPI "Latencia Servidor"</h3>
                            <div className="space-y-4 mb-6">
                                <div className="border-l-4 border-green-500 pl-4">
                                    <p className="text-sm font-black text-green-400 mb-1">Verde — Menor a 50ms</p>
                                    <p className="text-sm text-gray-400">Conexión normal. Todo funciona correctamente.</p>
                                </div>
                                <div className="border-l-4 border-yellow-500 pl-4">
                                    <p className="text-sm font-black text-yellow-400 mb-1">Amarillo — Entre 50ms y 100ms</p>
                                    <p className="text-sm text-gray-400">Red lenta. Puede haber mucho tráfico o cables en mal estado.</p>
                                </div>
                                <div className="border-l-4 border-red-500 pl-4">
                                    <p className="text-sm font-black text-red-400 mb-1">Rojo — Mayor a 100ms o sin respuesta</p>
                                    <p className="text-sm text-gray-400">Problema serio. Revisa cables RJ-45, switch, y que Docker Desktop esté corriendo.</p>
                                </div>
                            </div>
                            <h3 className="text-base font-black uppercase text-gray-400 mt-6 mb-4">Estado de las Terminales</h3>
                            <div className="space-y-3">
                                <div className="flex items-center gap-3">
                                    <span className="w-3 h-3 rounded-full bg-green-400 shrink-0"></span>
                                    <p className="text-sm text-gray-400"><span className="font-black text-green-400">Verde (En Línea)</span> — La terminal está activa, conectada y en uso.</p>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="w-3 h-3 rounded-full bg-yellow-500 shrink-0"></span>
                                    <p className="text-sm text-gray-400"><span className="font-black text-yellow-500">Amarillo (Caja Abierta)</span> — La máquina está inactiva/apagada, pero su sesión está protegida porque <span className="text-white font-bold">no se ha sacado el corte de caja</span>.</p>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="w-3 h-3 rounded-full bg-red-500 shrink-0"></span>
                                    <p className="text-sm text-gray-400"><span className="font-black text-red-500">Rojo (Expirada/Caída)</span> — Pérdida total de conexión con una sesión ocupada.</p>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="w-3 h-3 rounded-full bg-gray-500 shrink-0"></span>
                                    <p className="text-sm text-gray-400"><span className="font-black text-gray-400">Gris (Disponible)</span> — Terminal vacía y lista para ser usada.</p>
                                </div>
                            </div>

                            <h3 className="text-base font-black uppercase text-gray-400 mt-6 mb-4">Colores del Historial</h3>
                            <div className="space-y-3">
                                <div className="flex items-center gap-3">
                                    <span className="w-3 h-3 rounded-full bg-green-400 shrink-0"></span>
                                    <p className="text-sm text-gray-400"><span className="font-black text-green-400">Verde</span> — Conexión. El usuario entró a la terminal.</p>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="w-3 h-3 rounded-full bg-blue-400 shrink-0"></span>
                                    <p className="text-sm text-gray-400"><span className="font-black text-blue-400">Azul</span> — Desconexión normal. El usuario salió ordenadamente. No es falla.</p>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="w-3 h-3 rounded-full bg-red-400 shrink-0"></span>
                                    <p className="text-sm text-gray-400"><span className="font-black text-red-400">Rojo</span> — Desconexión sospechosa sin reconexión. Posible falla de red. Éstas SÍ cuentan como fallas.</p>
                                </div>
                            </div>
                            <button onClick={() => setShowInfoModal(false)} className="mt-6 w-full py-3 rounded-2xl bg-indigo-600/20 hover:bg-indigo-600 border border-indigo-500/30 font-black uppercase text-[10px] tracking-widest text-white transition-all">ENTENDIDO</button>
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
};
