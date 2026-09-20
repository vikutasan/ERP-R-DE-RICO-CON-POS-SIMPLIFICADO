import { CONFIG } from '../config';

class POSService {
    async getCategories() {
        const res = await fetch(`${CONFIG.API_BASE_URL}/catalog/categories`, { cache: 'no-store' });
        if (!res.ok) throw new Error("Error cargando categorías");
        return res.json();
    }

    async getProducts() {
        const res = await fetch(`${CONFIG.API_BASE_URL}/catalog/products`, { cache: 'no-store' });
        if (!res.ok) throw new Error("Error cargando productos");
        return res.json();
    }

    async getActiveSession(terminalId) {
        const res = await fetch(`${CONFIG.API_BASE_URL}/pos/sessions/${terminalId}/active`, { cache: 'no-store' });
        if (res.ok) return res.json();
        return null;
    }

    async createSession(terminalId) {
        const res = await fetch(`${CONFIG.API_BASE_URL}/pos/sessions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ terminal_id: terminalId })
        });
        if (!res.ok) throw new Error("Error creando sesión");
        return res.json();
    }

    async createTicket(ticketData) {
        const res = await fetch(`${CONFIG.API_BASE_URL}/pos/tickets`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(ticketData)
        });
        if (!res.ok) {
            const error = await res.json();
            throw new Error(error.detail || "Error registrando ticket");
        }
        return res.json();
    }

    async reserveTicket(terminalId, capturedById = null) {
        const res = await fetch(`${CONFIG.API_BASE_URL}/pos/tickets/reserve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ terminal_id: terminalId, captured_by_id: capturedById })
        });
        if (!res.ok) throw new Error("Error reservando ticket. Verifique conexión ERP.");
        return res.json();
    }

    async getOpenTickets() {
        const res = await fetch(`${CONFIG.API_BASE_URL}/pos/tickets/open`, { cache: 'no-store' });
        if (!res.ok) throw new Error("Error cargando pizarron");
        return res.json();
    }

    async getTicketByAccountNum(accountNum) {
        const res = await fetch(`${CONFIG.API_BASE_URL}/pos/tickets/by-account/${encodeURIComponent(accountNum)}`, { cache: 'no-store' });
        if (!res.ok) {
            if (res.status === 404) return null;
            throw new Error("Error obteniendo ticket fresco");
        }
        return res.json();
    }

    async getTerminalDrafts(terminalId) {
        const res = await fetch(`${CONFIG.API_BASE_URL}/pos/tickets/drafts/${encodeURIComponent(terminalId)}`, { cache: 'no-store' });
        if (!res.ok) return [];
        return res.json();
    }

    async getTerminalsStatus() {
        const res = await fetch(`${CONFIG.API_BASE_URL}/pos/terminals/status`, { cache: 'no-store' });
        if (!res.ok) throw new Error("Error cargando estado de terminales");
        return res.json();
    }

    async lockTerminal(terminalId, occupierId, occupierName) {
        const res = await fetch(`${CONFIG.API_BASE_URL}/pos/terminals/${terminalId}/lock`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ occupier_id: occupierId, occupier_name: occupierName }),
            keepalive: true
        });
        if (!res.ok) {
            const error = await res.json();
            throw new Error(error.detail || "Error bloqueando terminal");
        }
        return res.json();
    }

    async unlockTerminal(terminalId, occupierId) {
        const res = await fetch(`${CONFIG.API_BASE_URL}/pos/terminals/${terminalId}/unlock`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ occupier_id: occupierId, occupier_name: "release" }),
            keepalive: true
        });
        if (!res.ok) throw new Error("Error liberando terminal");
        return res.json();
    }

    async forceUnlockTerminal(terminalId, occupierId, occupierName) {
        const res = await fetch(`${CONFIG.API_BASE_URL}/pos/terminals/${terminalId}/force_unlock`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ occupier_id: occupierId, occupier_name: occupierName })
        });
        if (!res.ok) throw new Error("Error forzando liberación");
        return res.json();
    }

    async heartbeatTerminal(terminalId, occupierId) {
        const res = await fetch(`${CONFIG.API_BASE_URL}/pos/terminals/${terminalId}/heartbeat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ occupier_id: occupierId, occupier_name: "heartbeat" })
        });
        // v15 (H7): señalar el fallo explícitamente. Antes devolvía `false` en silencio,
        // por lo que un candado perdido (404/403) era indistinguible de un blip de red.
        // El llamador (useTerminalLocking) captura el error y NO re-adquiere el candado
        // (regla anti-ping-pong), pero ahora puede registrarlo/observarlo.
        if (!res.ok) {
            throw new Error(`Heartbeat falló con estado ${res.status}`);
        }
        return true;
    }

    // ── FASE 2: Persistencia Inmediata ──────────────────────────────────
    async addItemToTicket(data) {
        const res = await fetch(`${CONFIG.API_BASE_URL}/pos/tickets/items/add`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!res.ok) { const err = await res.json(); throw new Error(err.detail || "Error agregando item"); }
        return res.json();
    }

    async updateItemQuantity(data) {
        const res = await fetch(`${CONFIG.API_BASE_URL}/pos/tickets/items/update`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!res.ok) { const err = await res.json(); throw new Error(err.detail || "Error actualizando item"); }
        return res.json();
    }

    async removeItemFromTicket(data) {
        const res = await fetch(`${CONFIG.API_BASE_URL}/pos/tickets/items/remove`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!res.ok) { const err = await res.json(); throw new Error(err.detail || "Error eliminando item"); }
        return res.json();
    }

    async getSystemSettings() {
        const res = await fetch(`${CONFIG.API_BASE_URL}/settings`, { cache: 'no-store' });
        if (!res.ok) throw new Error("Error cargando ajustes");
        return res.json();
    }

    async uploadTrainingImages(sku, images) {
        const res = await fetch(`${CONFIG.API_BASE_URL}/pos/vision/training/upload`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sku, images })
        });
        if (!res.ok) throw new Error("Error subiendo imágenes de entrenamiento");
        return res.json();
    }

    async predictVision(image, terminalId = 'T1') {
        const res = await fetch(`${CONFIG.API_BASE_URL}/pos/vision/predict`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image, terminal_id: terminalId })
        });
        if (!res.ok) throw new Error("Error en predicción local");
        return res.json();
    }
}

export const posService = new POSService();
