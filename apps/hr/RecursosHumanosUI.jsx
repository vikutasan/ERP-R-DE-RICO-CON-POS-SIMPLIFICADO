import React, { useState, useEffect, useMemo } from 'react';
import { hrService } from './hrService';
import { RegulationsPanel } from './RegulationsPanel';
import { EmployeeProfileModal } from './EmployeeProfileModal';
import { CheckOutModal } from './CheckOutModal';
import { ConfigSuite } from './ConfigSuite';
import { IncidentsModal } from './IncidentsModal';
import { UniformDepositModal } from './UniformDepositModal';
import { CoverageFundModal } from './CoverageFundModal';
import { PayrollModal } from './PayrollModal';
import { PSGModal } from './PSGModal';
import { VacationsModal } from './VacationsModal';
import { PsychometricModal } from './PsychometricModal';
import { KPIsModal } from './KPIsModal';
import { ExitSurveyModal } from './ExitSurveyModal';
import { SeveranceModal } from './SeveranceModal';

/**
 * R DE RICO — MÓDULO DE RECURSOS HUMANOS
 * 
 * Landing principal con:
 * - Header: 4 botones (Horarios, Empleado del Mes, Cumpleaños, Reglamento)
 * - Tabla dinámica: 16 columnas con celdas-botón
 * - Columnas fijas (#, Puesto, Nombre, Semestre) + scroll horizontal
 */

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

export const RecursosHumanosUI = ({ userId, userName }) => {
    const [employees, setEmployees] = useState([]);
    const [positions, setPositions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activePanel, setActivePanel] = useState(null); // 'reglamento' | 'cumpleaños' | 'empleado_mes' | 'horarios'
    const [selectedEmployee, setSelectedEmployee] = useState(null);
    const [birthdays, setBirthdays] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [activeModal, setActiveModal] = useState(null); // 'incidents' | 'uniform' | 'coverage' | 'payroll' | 'psg'
    const [modalEmployee, setModalEmployee] = useState(null);
    const [configType, setConfigType] = useState(null); // For ConfigSuite

    const openModal = (type, emp) => { setActiveModal(type); setModalEmployee(emp); };
    const closeModal = () => { setActiveModal(null); setModalEmployee(null); };

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            setLoading(true);
            const [emps, poss] = await Promise.all([
                hrService.listEmployees(),
                hrService.listPositions(),
            ]);
            setEmployees(emps || []);
            setPositions(poss || []);
        } catch (err) {
            console.error('Error cargando datos HR:', err);
        } finally {
            setLoading(false);
        }
    };

    const loadBirthdays = async () => {
        try {
            const bdays = await hrService.getBirthdays();
            setBirthdays(bdays || []);
            setActivePanel('cumpleaños');
        } catch (err) {
            console.error('Error cargando cumpleaños:', err);
        }
    };

    // Agrupar empleados por puesto
    const groupedEmployees = useMemo(() => {
        let filtered = employees;
        if (searchTerm) {
            filtered = employees.filter(e => 
                e.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                String(e.employee_number || '').includes(searchTerm)
            );
        }

        const groups = {};
        filtered.forEach(emp => {
            const posName = emp.position_name || emp.role || 'Sin asignar';
            if (!groups[posName]) groups[posName] = [];
            groups[posName].push(emp);
        });

        // Ordenar dentro de cada grupo alfabéticamente
        Object.keys(groups).forEach(key => {
            groups[key].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        });

        return groups;
    }, [employees, searchTerm]);

    const mesActual = MESES[new Date().getMonth()];
    const añoActual = new Date().getFullYear();

    if (loading) {
        return (
            <div className="h-full flex items-center justify-center bg-[#0a0a0a]">
                <div className="text-center">
                    <div className="w-16 h-16 border-4 border-teal-500/30 border-t-teal-500 rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-gray-500 text-xs font-bold uppercase tracking-widest">Cargando Recursos Humanos...</p>
                </div>
            </div>
        );
    }

    // --- Panels ---
    if (activePanel === 'reglamento') {
        return <RegulationsPanel onBack={() => setActivePanel(null)} />;
    }

    if (selectedEmployee) {
        return (
            <EmployeeProfileModal
                employee={selectedEmployee}
                positions={positions}
                onClose={() => setSelectedEmployee(null)}
                onSave={async (data) => {
                    try {
                        await hrService.createEmployeeHR(selectedEmployee.id, data);
                        await loadData();
                        setSelectedEmployee(null);
                    } catch (err) {
                        console.error('Error guardando:', err);
                    }
                }}
            />
        );
    }

    return (
        <div className="h-full flex flex-col bg-[#0a0a0a] text-white overflow-hidden">
            {/* ==================== HEADER ==================== */}
            <div className="shrink-0 border-b border-white/5 bg-[#0a0a0a]">
                <div className="flex items-center justify-between px-6 py-4">
                    {/* Título */}
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-teal-600/20 flex items-center justify-center text-xl">👥</div>
                        <div>
                            <h1 className="text-lg font-black uppercase tracking-tight text-white">Recursos Humanos</h1>
                            <p className="text-[9px] font-bold text-gray-600 uppercase tracking-widest">{mesActual} {añoActual} • {employees.length} colaboradores</p>
                        </div>
                    </div>

                    {/* Botones del Header */}
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setActivePanel('horarios')}
                            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600/10 border border-blue-500/20 text-blue-400 hover:bg-blue-600/20 transition-all text-[10px] font-bold uppercase tracking-wider"
                        >
                            <span>📅</span> Horarios
                        </button>
                        <button
                            onClick={() => setActivePanel('empleado_mes')}
                            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-600/10 border border-amber-500/20 text-amber-400 hover:bg-amber-600/20 transition-all text-[10px] font-bold uppercase tracking-wider"
                        >
                            <span>🏆</span> Empleado del Mes
                        </button>
                        <button
                            onClick={loadBirthdays}
                            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-pink-600/10 border border-pink-500/20 text-pink-400 hover:bg-pink-600/20 transition-all text-[10px] font-bold uppercase tracking-wider"
                        >
                            <span>🎂</span> Cumpleaños
                        </button>
                        <button
                            onClick={() => setActivePanel('reglamento')}
                            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-teal-600/10 border border-teal-500/20 text-teal-400 hover:bg-teal-600/20 transition-all text-[10px] font-bold uppercase tracking-wider"
                        >
                            <span>📋</span> Reglamento
                        </button>
                    </div>
                </div>

                {/* Buscador */}
                <div className="px-6 pb-3">
                    <input
                        type="text"
                        placeholder="Buscar por nombre o número de empleado..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full max-w-md bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm text-white placeholder-gray-600 outline-none focus:border-teal-500/50 transition-all"
                    />
                </div>
            </div>

            {/* ==================== CUMPLEAÑOS MODAL ==================== */}
            {activePanel === 'cumpleaños' && (
                <div className="fixed inset-0 z-[99999] bg-black/70 flex items-center justify-center p-4" onClick={() => setActivePanel(null)}>
                    <div className="bg-[#111] border border-white/10 rounded-2xl p-6 max-w-lg w-full max-h-[80vh] overflow-auto" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-black text-white flex items-center gap-2">🎂 Cumpleaños de {mesActual} {añoActual}</h2>
                            <button onClick={() => setActivePanel(null)} className="text-gray-500 hover:text-white text-xl">✕</button>
                        </div>
                        {birthdays.length === 0 ? (
                            <p className="text-gray-500 text-sm text-center py-8">No hay cumpleaños este mes</p>
                        ) : (
                            <div className="space-y-2">
                                {birthdays.map((b, i) => (
                                    <div key={i} className="flex items-center gap-3 bg-white/5 rounded-xl p-3 border border-white/5">
                                        <div className="w-10 h-10 rounded-full bg-pink-600/20 flex items-center justify-center text-lg">🎂</div>
                                        <div className="flex-1">
                                            <p className="text-sm font-bold text-white">{b.name}</p>
                                            <p className="text-[10px] text-gray-500">#{b.employee_number} • Día {b.dia} • Cumple {b.edad} años</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                        <p className="text-[9px] text-gray-600 text-center mt-4">Festejo: Última junta del mes • La empresa pone el pastel 🎂</p>
                    </div>
                </div>
            )}

            {/* ==================== TABLA DINÁMICA ==================== */}
            <div className="flex-1 overflow-hidden flex">
                {/* Columnas fijas (izquierda) */}
                <div className="shrink-0 border-r border-white/5 overflow-y-auto" style={{ width: '420px' }}>
                    {/* Header de columnas fijas */}
                    <div className="sticky top-0 z-10 bg-[#0f0f0f] border-b border-white/10">
                        <div className="grid grid-cols-[60px_1fr_200px_70px] gap-0">
                            <div className="px-3 py-3 text-[9px] font-black uppercase tracking-wider text-gray-500 border-r border-white/5">#</div>
                            <div className="px-3 py-3 text-[9px] font-black uppercase tracking-wider text-gray-500 border-r border-white/5">Puesto</div>
                            <div className="px-3 py-3 text-[9px] font-black uppercase tracking-wider text-gray-500 border-r border-white/5">Nombre</div>
                            <div className="px-3 py-3 text-[9px] font-black uppercase tracking-wider text-gray-500">Sem.</div>
                        </div>
                    </div>

                    {/* Filas agrupadas por puesto */}
                    {Object.entries(groupedEmployees).map(([posName, emps]) => (
                        <div key={posName}>
                            {/* Separador de grupo */}
                            <div className="bg-teal-900/20 border-y border-teal-500/10 px-3 py-1.5">
                                <span className="text-[9px] font-black uppercase tracking-wider text-teal-400">{posName} ({emps.length})</span>
                            </div>
                            {emps.map((emp) => (
                                <div key={emp.id} className="grid grid-cols-[60px_1fr_200px_70px] gap-0 border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                                    <div className="px-3 py-2.5 text-xs font-mono text-gray-400 border-r border-white/5">
                                        {String(emp.employee_number || emp.id).padStart(3, '0')}
                                    </div>
                                    <div className="px-3 py-2.5 text-[10px] text-gray-500 border-r border-white/5 truncate">
                                        {posName}
                                    </div>
                                    <div className="px-3 py-2.5 text-xs font-semibold text-white border-r border-white/5 truncate">
                                        {emp.name}
                                    </div>
                                    <div className="px-3 py-2.5 text-xs text-center text-gray-400">
                                        {emp.hr?.semestre_actual || 1}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ))}
                </div>

                {/* Columnas con scroll horizontal (derecha) */}
                <div className="flex-1 overflow-auto">
                    {/* Header de columnas scrollable */}
                    <div className="sticky top-0 z-10 bg-[#0f0f0f] border-b border-white/10">
                        <div className="flex whitespace-nowrap">
                            {[
                                { name: 'Info General', cfg: null },
                                { name: 'Asistencia', cfg: null },
                                { name: 'Incidencias', cfg: 'incidents' },
                                { name: 'Fianza Uniforme', cfg: 'uniform' },
                                { name: 'Fondo Cobertura', cfg: 'coverage' },
                                { name: 'Nómina', cfg: 'payroll' },
                                { name: 'PSGs', cfg: 'psg' },
                                { name: 'Vacaciones', cfg: 'vacations' },
                                { name: 'Psicométricos', cfg: 'psychometrics' },
                                { name: 'KPIs', cfg: 'kpis' },
                                { name: 'Enc. Salida', cfg: 'exit_survey' },
                                { name: 'Finiquito', cfg: 'severance' },
                            ].map((col) => (
                                <div key={col.name} className="w-[130px] shrink-0 px-3 py-3 border-r border-white/5 flex items-center justify-between">
                                    <span className="text-[9px] font-black uppercase tracking-wider text-gray-500">{col.name}</span>
                                    {col.cfg && (
                                        <button onClick={() => setConfigType(col.cfg)} className="w-5 h-5 rounded bg-white/5 flex items-center justify-center text-[8px] text-gray-600 hover:text-teal-400 hover:bg-teal-500/10 transition-all" title="Configurar">
                                            ⚙️
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Filas (deben alinearse con las columnas fijas) */}
                    {Object.entries(groupedEmployees).map(([posName, emps]) => (
                        <div key={posName}>
                            {/* Espacio del separador de grupo */}
                            <div className="bg-teal-900/20 border-y border-teal-500/10 h-[30px]"></div>
                            {emps.map((emp) => (
                                <div key={emp.id} className="flex whitespace-nowrap border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                                    {/* Info General */}
                                    <div className="w-[130px] shrink-0 px-2 py-2 border-r border-white/5">
                                        <button
                                            onClick={() => setSelectedEmployee(emp)}
                                            className="w-full py-1 rounded-lg bg-teal-600/10 border border-teal-500/20 text-[9px] font-bold text-teal-400 hover:bg-teal-600/20 transition-all"
                                        >
                                            📋 Ver Ficha
                                        </button>
                                    </div>
                                    {/* Asistencia */}
                                    <div className="w-[130px] shrink-0 px-2 py-2 border-r border-white/5">
                                        <button className="w-full py-1 rounded-lg bg-blue-600/10 border border-blue-500/20 text-[9px] font-bold text-blue-400 hover:bg-blue-600/20 transition-all">
                                            📅 Calendario
                                        </button>
                                    </div>
                                    {/* Incidencias */}
                                    <div className="w-[130px] shrink-0 px-2 py-2 border-r border-white/5">
                                        <button onClick={() => openModal('incidents', emp)} className="w-full py-1 rounded-lg bg-amber-600/10 border border-amber-500/20 text-[9px] font-bold text-amber-400 hover:bg-amber-600/20 transition-all">⚡ Ver</button>
                                    </div>
                                    {/* Fianza Uniforme */}
                                    <div className="w-[130px] shrink-0 px-2 py-2 border-r border-white/5">
                                        <button onClick={() => openModal('uniform', emp)} className="w-full py-1 rounded-lg bg-purple-600/10 border border-purple-500/20 text-[9px] font-bold text-purple-400 hover:bg-purple-600/20 transition-all">👔 Ver</button>
                                    </div>
                                    {/* Fondo Cobertura */}
                                    <div className="w-[130px] shrink-0 px-2 py-2 border-r border-white/5">
                                        <button onClick={() => openModal('coverage', emp)} className="w-full py-1 rounded-lg bg-cyan-600/10 border border-cyan-500/20 text-[9px] font-bold text-cyan-400 hover:bg-cyan-600/20 transition-all">🛡️ Ver</button>
                                    </div>
                                    {/* Nómina */}
                                    <div className="w-[130px] shrink-0 px-2 py-2 border-r border-white/5">
                                        <button onClick={() => openModal('payroll', emp)} className="w-full py-1 rounded-lg bg-green-600/10 border border-green-500/20 text-[9px] font-bold text-green-400 hover:bg-green-600/20 transition-all">💰 Ver</button>
                                    </div>
                                    {/* PSGs */}
                                    <div className="w-[130px] shrink-0 px-2 py-2 border-r border-white/5">
                                        <button onClick={() => openModal('psg', emp)} className="w-full py-1 rounded-lg bg-blue-600/10 border border-blue-500/20 text-[9px] font-bold text-blue-400 hover:bg-blue-600/20 transition-all">📝 Ver</button>
                                    </div>
                                    {/* Vacaciones */}
                                    <div className="w-[130px] shrink-0 px-2 py-2 border-r border-white/5">
                                        <button onClick={() => openModal('vacations', emp)} className="w-full py-1 rounded-lg bg-teal-600/10 border border-teal-500/20 text-[9px] font-bold text-teal-400 hover:bg-teal-600/20 transition-all">🏖️ Ver</button>
                                    </div>
                                    {/* Psicométricos */}
                                    <div className="w-[130px] shrink-0 px-2 py-2 border-r border-white/5">
                                        <button onClick={() => openModal('psychometrics', emp)} className="w-full py-1 rounded-lg bg-violet-600/10 border border-violet-500/20 text-[9px] font-bold text-violet-400 hover:bg-violet-600/20 transition-all">🧠 Ver</button>
                                    </div>
                                    {/* KPIs */}
                                    <div className="w-[130px] shrink-0 px-2 py-2 border-r border-white/5">
                                        <button onClick={() => openModal('kpis', emp)} className="w-full py-1 rounded-lg bg-emerald-600/10 border border-emerald-500/20 text-[9px] font-bold text-emerald-400 hover:bg-emerald-600/20 transition-all">📊 Ver</button>
                                    </div>
                                    {/* Encuesta Salida */}
                                    <div className="w-[130px] shrink-0 px-2 py-2 border-r border-white/5">
                                        <button onClick={() => openModal('exit_survey', emp)} className="w-full py-1 rounded-lg bg-orange-600/10 border border-orange-500/20 text-[9px] font-bold text-orange-400 hover:bg-orange-600/20 transition-all">📋 Ver</button>
                                    </div>
                                    {/* Finiquito */}
                                    <div className="w-[130px] shrink-0 px-2 py-2 border-r border-white/5">
                                        <button onClick={() => openModal('severance', emp)} className="w-full py-1 rounded-lg bg-rose-600/10 border border-rose-500/20 text-[9px] font-bold text-rose-400 hover:bg-rose-600/20 transition-all">💼 Ver</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
            </div>

            {/* === Modales Fase 2 === */}
            {activeModal === 'incidents' && modalEmployee && <IncidentsModal employee={modalEmployee} onClose={closeModal} />}
            {activeModal === 'uniform' && modalEmployee && <UniformDepositModal employee={modalEmployee} onClose={closeModal} />}
            {activeModal === 'coverage' && modalEmployee && <CoverageFundModal employee={modalEmployee} onClose={closeModal} />}
            {activeModal === 'payroll' && modalEmployee && <PayrollModal employee={modalEmployee} onClose={closeModal} />}
            {activeModal === 'psg' && modalEmployee && <PSGModal employee={modalEmployee} onClose={closeModal} />}

            {/* === Modales Fase 3 === */}
            {activeModal === 'vacations' && modalEmployee && <VacationsModal employee={modalEmployee} onClose={closeModal} />}
            {activeModal === 'psychometrics' && modalEmployee && <PsychometricModal employee={modalEmployee} onClose={closeModal} />}
            {activeModal === 'kpis' && modalEmployee && <KPIsModal employee={modalEmployee} onClose={closeModal} />}
            {activeModal === 'exit_survey' && modalEmployee && <ExitSurveyModal employee={modalEmployee} onClose={closeModal} />}
            {activeModal === 'severance' && modalEmployee && <SeveranceModal employee={modalEmployee} onClose={closeModal} />}

            {/* ConfigSuite genérica */}
            {configType && <ConfigSuite configType={configType} onClose={() => setConfigType(null)} />}
        </div>
    );
};
