/**
 * useHeladeriaCart.js — Hook para gestión del ticket de heladería.
 * Reutiliza el sistema de tickets del POS con channel='HELADERIA'.
 */
import { useState, useCallback } from 'react';
import { heladeriaService } from '../services/heladeriaService';

export function useHeladeriaCart({ sessionId, terminalId, capturedById }) {
    const [ticket, setTicket] = useState(null);
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // ─── Crear / obtener ticket activo ──────────────
    const ensureTicket = useCallback(async () => {
        if (ticket) return ticket;
        setLoading(true);
        try {
            const newTicket = await heladeriaService.createHeladeriaTicket(
                sessionId, terminalId, capturedById
            );
            setTicket(newTicket);
            setItems(newTicket.items || []);
            return newTicket;
        } catch (err) {
            setError(err.message);
            throw err;
        } finally {
            setLoading(false);
        }
    }, [ticket, sessionId, terminalId, capturedById]);

    // ─── Agregar helado armado al ticket ────────────
    const addBuiltIceCream = useCallback(async (summary) => {
        setLoading(true);
        setError(null);
        try {
            const currentTicket = await ensureTicket();
            
            // El helado se agrega como un producto del recipiente
            // Los componentes (bolas, extras) se guardan como TicketItemComponents
            const result = await heladeriaService.addItemToTicket(
                currentTicket.account_num,
                summary.recipiente.product_id,
                1,
                sessionId,
                terminalId,
                capturedById,
            );

            // Actualizar estado local
            setTicket(prev => ({
                ...prev,
                total: result.total,
                version: result.version,
            }));

            // Agregar item visual al carrito local
            setItems(prev => [...prev, {
                id: Date.now(), // ID temporal para la UI
                label: summary.label,
                recipientName: summary.recipientName,
                subtotal: summary.subtotal,
                bolas: summary.bolas,
                extras: summary.extras,
                recipiente: summary.recipiente,
            }]);

            return result;
        } catch (err) {
            setError(err.message);
            throw err;
        } finally {
            setLoading(false);
        }
    }, [ensureTicket, sessionId, terminalId, capturedById]);

    // ─── Eliminar item del ticket ───────────────────
    const removeItem = useCallback(async (index) => {
        setItems(prev => prev.filter((_, i) => i !== index));
        // TODO: Llamar al endpoint de remove cuando se implemente con componentes
    }, []);

    // ─── Obtener total ──────────────────────────────
    const total = items.reduce((sum, item) => sum + (parseFloat(item.subtotal) || 0), 0);

    // ─── Reset carrito ──────────────────────────────
    const clearCart = useCallback(() => {
        setTicket(null);
        setItems([]);
        setError(null);
    }, []);

    return {
        ticket,
        items,
        total,
        loading,
        error,
        addBuiltIceCream,
        removeItem,
        clearCart,
        itemCount: items.length,
    };
}
