/**
 * HR Service — Cliente API para el módulo de Recursos Humanos
 * 
 * Centraliza todas las llamadas al backend HR.
 * Usa la misma URL base que el resto del ERP.
 */
import { CONFIG } from '../pos/config';

const API_BASE = CONFIG.API_BASE_URL.replace('/api/v1', '');

export const hrService = {

    // --- Health ---
    health: async () => {
        const res = await fetch(`${API_BASE}/api/v1/hr/health`);
        return res.json();
    },

    // --- Check-In / Check-Out ---
    checkIn: async (employeeId) => {
        const res = await fetch(`${API_BASE}/api/v1/hr/attendance/check-in`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ employee_id: employeeId })
        });
        if (!res.ok) throw new Error('Check-in failed');
        return res.json();
    },

    checkOut: async (employeeId, tipoSalida = 'normal', observaciones = null) => {
        const res = await fetch(`${API_BASE}/api/v1/hr/attendance/check-out`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ employee_id: employeeId, tipo_salida: tipoSalida, observaciones })
        });
        if (!res.ok) throw new Error('Check-out failed');
        return res.json();
    },

    // --- Employees ---
    listEmployees: async () => {
        const res = await fetch(`${API_BASE}/api/v1/hr/employees`);
        return res.json();
    },

    getEmployee: async (id) => {
        const res = await fetch(`${API_BASE}/api/v1/hr/employees/${id}`);
        return res.json();
    },

    updateEmployeeHR: async (employeeId, data) => {
        const res = await fetch(`${API_BASE}/api/v1/hr/employees/${employeeId}/hr-data`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        return res.json();
    },

    createEmployeeHR: async (employeeId, data) => {
        const res = await fetch(`${API_BASE}/api/v1/hr/employees/${employeeId}/hr-data`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ employee_id: employeeId, ...data })
        });
        return res.json();
    },

    // --- Positions ---
    listPositions: async () => {
        const res = await fetch(`${API_BASE}/api/v1/hr/positions`);
        return res.json();
    },

    createPosition: async (data) => {
        const res = await fetch(`${API_BASE}/api/v1/hr/positions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        return res.json();
    },

    // --- Regulations ---
    listRegulations: async () => {
        const res = await fetch(`${API_BASE}/api/v1/hr/regulations`);
        return res.json();
    },

    // --- Attendance ---
    getAttendance: async (employeeId, mes = null, año = null) => {
        let url = `${API_BASE}/api/v1/hr/attendance/${employeeId}`;
        const params = [];
        if (mes) params.push(`mes=${mes}`);
        if (año) params.push(`año=${año}`);
        if (params.length) url += '?' + params.join('&');
        const res = await fetch(url);
        return res.json();
    },

    // --- Birthdays ---
    getBirthdays: async (mes = null) => {
        let url = `${API_BASE}/api/v1/hr/birthdays`;
        if (mes) url += `?mes=${mes}`;
        const res = await fetch(url);
        return res.json();
    },

    // === FASE 2 ===

    // --- Incidents ---
    getIncidents: async (employeeId) => {
        const res = await fetch(`${API_BASE}/api/v1/hr/incidents/${employeeId}`);
        return res.json();
    },
    getIncidentSummary: async (employeeId) => {
        const res = await fetch(`${API_BASE}/api/v1/hr/incidents/${employeeId}/summary`);
        return res.json();
    },
    createIncident: async (data) => {
        const res = await fetch(`${API_BASE}/api/v1/hr/incidents`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
        return res.json();
    },

    // --- Uniform ---
    getUniform: async (employeeId) => {
        const res = await fetch(`${API_BASE}/api/v1/hr/uniform/${employeeId}`);
        return res.json();
    },
    createUniform: async (data) => {
        const res = await fetch(`${API_BASE}/api/v1/hr/uniform`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
        return res.json();
    },
    addUniformMovement: async (depositId, data) => {
        const res = await fetch(`${API_BASE}/api/v1/hr/uniform/${depositId}/movement`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
        return res.json();
    },

    // --- Coverage Fund ---
    getCoverage: async (employeeId) => {
        const res = await fetch(`${API_BASE}/api/v1/hr/coverage/${employeeId}`);
        return res.json();
    },
    createCoverage: async (data) => {
        const res = await fetch(`${API_BASE}/api/v1/hr/coverage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
        return res.json();
    },
    addCoverageMovement: async (fundId, data) => {
        const res = await fetch(`${API_BASE}/api/v1/hr/coverage/${fundId}/movement`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
        return res.json();
    },

    // --- Salary Tables ---
    getSalaryTables: async () => {
        const res = await fetch(`${API_BASE}/api/v1/hr/salary-tables`);
        return res.json();
    },
    saveSalaryTable: async (data) => {
        const res = await fetch(`${API_BASE}/api/v1/hr/salary-tables`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
        return res.json();
    },

    // --- Payroll ---
    getPayroll: async (employeeId, semana = null, año = null) => {
        let url = `${API_BASE}/api/v1/hr/payroll/${employeeId}`;
        const params = [];
        if (semana) params.push(`semana=${semana}`);
        if (año) params.push(`año=${año}`);
        if (params.length) url += '?' + params.join('&');
        const res = await fetch(url);
        return res.json();
    },
    calculatePayroll: async (employeeId, semana, año) => {
        const res = await fetch(`${API_BASE}/api/v1/hr/payroll/calculate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ employee_id: employeeId, semana, año }) });
        return res.json();
    },

    // --- PSG ---
    getPSGs: async (employeeId) => {
        const res = await fetch(`${API_BASE}/api/v1/hr/psg/${employeeId}`);
        return res.json();
    },
    createPSG: async (data) => {
        const res = await fetch(`${API_BASE}/api/v1/hr/psg`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
        return res.json();
    },

    // --- Config (generic) ---
    getConfig: async (type) => {
        const res = await fetch(`${API_BASE}/api/v1/hr/config/${type}`);
        return res.json();
    },
    saveConfig: async (type, parametro, valor) => {
        const res = await fetch(`${API_BASE}/api/v1/hr/config/${type}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ parametro, valor }) });
        return res.json();
    },

    // === FASE 3 ===

    // --- Vacations ---
    getVacations: async (employeeId) => {
        const res = await fetch(`${API_BASE}/api/v1/hr/vacations/${employeeId}`);
        return res.json();
    },
    createVacation: async (data) => {
        const res = await fetch(`${API_BASE}/api/v1/hr/vacations`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
        return res.json();
    },

    // --- Psychometrics ---
    getPsychometrics: async (employeeId) => {
        const res = await fetch(`${API_BASE}/api/v1/hr/psychometrics/${employeeId}`);
        return res.json();
    },
    createPsychometric: async (data) => {
        const res = await fetch(`${API_BASE}/api/v1/hr/psychometrics`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
        return res.json();
    },

    // --- KPIs ---
    getKPIs: async (employeeId) => {
        const res = await fetch(`${API_BASE}/api/v1/hr/kpis/${employeeId}`);
        return res.json();
    },
    createKPI: async (data) => {
        const res = await fetch(`${API_BASE}/api/v1/hr/kpis`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
        return res.json();
    },

    // --- Exit Survey ---
    getExitSurvey: async (employeeId) => {
        const res = await fetch(`${API_BASE}/api/v1/hr/exit-survey/${employeeId}`);
        return res.json();
    },
    createExitSurvey: async (data) => {
        const res = await fetch(`${API_BASE}/api/v1/hr/exit-survey`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
        return res.json();
    },

    // --- Severance ---
    getSeverance: async (employeeId) => {
        const res = await fetch(`${API_BASE}/api/v1/hr/severance/${employeeId}`);
        return res.json();
    },
    calculateSeverance: async (data) => {
        const res = await fetch(`${API_BASE}/api/v1/hr/severance/calculate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
        return res.json();
    },
};
