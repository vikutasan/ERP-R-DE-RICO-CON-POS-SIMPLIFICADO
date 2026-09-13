/**
 * heladeriaService.js — Cliente HTTP del módulo Heladería.
 * 
 * REGLAS OBLIGATORIAS:
 * - Usar CONFIG.API_BASE_URL (prohibido window.location.hostname)
 * - Usar withRetries para todas las operaciones de red
 * - Reutilizar posService para tickets y caja (no duplicar)
 */
import { CONFIG } from '../../pos/config';
import { withRetries } from '../../pos/utils/withRetries';

class HeladeriaService {

    // ═══════════════════════════════════════════════════
    // MENÚ DINÁMICO
    // ═══════════════════════════════════════════════════

    async getMenu() {
        return withRetries(async () => {
            const res = await fetch(`${CONFIG.API_BASE_URL}/heladeria/menu`, { cache: 'no-store' });
            if (!res.ok) throw new Error('Error cargando menú de heladería');
            return res.json();
        }, { label: 'getMenu' });
    }

    // ═══════════════════════════════════════════════════
    // TOGGLE DISPONIBILIDAD (AGOTAR SABOR)
    // ═══════════════════════════════════════════════════

    async toggleAvailability(configId, isAvailable) {
        return withRetries(async () => {
            const res = await fetch(`${CONFIG.API_BASE_URL}/heladeria/availability/${configId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ is_available: isAvailable }),
            });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.detail || 'Error actualizando disponibilidad');
            }
            return res.json();
        }, { label: 'toggleAvailability' });
    }

    // ═══════════════════════════════════════════════════
    // KDS (Kitchen Display System)
    // ═══════════════════════════════════════════════════

    async getKdsOrders(station) {
        return withRetries(async () => {
            const res = await fetch(`${CONFIG.API_BASE_URL}/heladeria/kds/${station}`, { cache: 'no-store' });
            if (!res.ok) throw new Error(`Error cargando KDS estación ${station}`);
            return res.json();
        }, { label: `getKdsOrders(${station})` });
    }

    async updateKdsItemStatus(itemId, status) {
        return withRetries(async () => {
            const res = await fetch(`${CONFIG.API_BASE_URL}/heladeria/kds/items/${itemId}/status`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ item_status: status }),
            });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.detail || 'Error actualizando estado de item');
            }
            return res.json();
        }, { label: 'updateKdsItemStatus' });
    }

    // ═══════════════════════════════════════════════════
    // DISPLAY DATA
    // ═══════════════════════════════════════════════════

    async getDisplayFlavors() {
        return withRetries(async () => {
            const res = await fetch(`${CONFIG.API_BASE_URL}/heladeria/display/flavors`, { cache: 'no-store' });
            if (!res.ok) throw new Error('Error cargando sabores para display');
            return res.json();
        }, { label: 'getDisplayFlavors' });
    }

    async getDisplayMenu() {
        return withRetries(async () => {
            const res = await fetch(`${CONFIG.API_BASE_URL}/heladeria/display/menu`, { cache: 'no-store' });
            if (!res.ok) throw new Error('Error cargando menú para display');
            return res.json();
        }, { label: 'getDisplayMenu' });
    }

    // ═══════════════════════════════════════════════════
    // TICKETS (reutiliza POS existente con channel=HELADERIA)
    // ═══════════════════════════════════════════════════

    async createHeladeriaTicket(sessionId, terminalId, capturedById = null) {
        // v14 (Opcion 2): el canal viaja en la MISMA petición de reserva, así el
        // ticket nace con channel='HELADERIA' de forma ATÓMICA. Se eliminó el PUT
        // posterior (cuyo res.ok no se verificaba) que dejaba tickets huérfanos
        // con channel=NULL visibles en el POS de Panadería.
        return withRetries(async () => {
            const res = await fetch(`${CONFIG.API_BASE_URL}/pos/tickets/reserve`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    terminal_id: terminalId,
                    captured_by_id: capturedById,
                    channel: 'HELADERIA',
                }),
            });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.detail || 'Error reservando ticket de heladería');
            }
            return await res.json();
        }, { label: 'createHeladeriaTicket' });
    }

    async addItemToTicket(accountNum, productId, quantity, sessionId, terminalId, capturedById = null) {
        return withRetries(async () => {
            const res = await fetch(`${CONFIG.API_BASE_URL}/pos/tickets/items/add`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    account_num: accountNum,
                    product_id: productId,
                    quantity,
                    session_id: sessionId,
                    terminal_id: terminalId,
                    captured_by_id: capturedById,
                }),
            });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.detail || 'Error agregando item');
            }
            return res.json();
        }, { label: 'addItemToTicket' });
    }
}

export const heladeriaService = new HeladeriaService();
