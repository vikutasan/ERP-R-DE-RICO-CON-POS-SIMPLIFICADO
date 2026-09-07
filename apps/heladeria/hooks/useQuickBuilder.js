/**
 * useQuickBuilder.js — Hook para el "Armado Rápido" de helados.
 * Estado en memoria: recipiente seleccionado, bolas, extras, precio.
 * No persiste hasta presionar [+ AL TICKET].
 */
import { useState, useCallback, useMemo } from 'react';

const INITIAL_STATE = {
    recipiente: null,    // { config_id, name, price, max_scoops, base_price, price_per_scoop }
    bolas: [],           // [{ config_id, product_id, name, price }]
    extras: [],          // [{ config_id, product_id, name, price }]
    recipientName: '',   // Nombre del integrante (OPCIONAL)
};

export function useQuickBuilder() {
    const [state, setState] = useState(INITIAL_STATE);

    // ─── Seleccionar recipiente ─────────────────────
    const selectRecipiente = useCallback((item) => {
        setState(prev => ({
            ...prev,
            recipiente: item,
            bolas: [], // Reset bolas al cambiar recipiente
            extras: [],
        }));
    }, []);

    // ─── Agregar bola de sabor ──────────────────────
    const addBola = useCallback((item) => {
        setState(prev => {
            const maxBolas = prev.recipiente?.max_scoops || 3;
            if (prev.bolas.length >= maxBolas) return prev;
            return { ...prev, bolas: [...prev.bolas, item] };
        });
    }, []);

    // ─── Quitar última bola ─────────────────────────
    const removeBola = useCallback((index) => {
        setState(prev => ({
            ...prev,
            bolas: prev.bolas.filter((_, i) => i !== index),
        }));
    }, []);

    // ─── Toggle extra ───────────────────────────────
    const toggleExtra = useCallback((item) => {
        setState(prev => {
            const exists = prev.extras.find(e => e.config_id === item.config_id);
            if (exists) {
                return { ...prev, extras: prev.extras.filter(e => e.config_id !== item.config_id) };
            }
            return { ...prev, extras: [...prev.extras, item] };
        });
    }, []);

    // ─── Nombre del integrante ──────────────────────
    const setRecipientName = useCallback((name) => {
        setState(prev => ({ ...prev, recipientName: name }));
    }, []);

    // ─── Calcular subtotal ──────────────────────────
    const subtotal = useMemo(() => {
        const basePrice = parseFloat(state.recipiente?.base_price || 0);
        const bolasPrice = state.bolas.reduce((sum, b) => sum + parseFloat(b.price || 0), 0);
        const extrasPrice = state.extras.reduce((sum, e) => sum + parseFloat(e.price || 0), 0);
        return basePrice + bolasPrice + extrasPrice;
    }, [state.recipiente, state.bolas, state.extras]);

    // ─── ¿Helado válido para agregar al ticket? ─────
    const isValid = useMemo(() => {
        return state.recipiente !== null && state.bolas.length > 0;
    }, [state.recipiente, state.bolas]);

    // ─── Obtener resumen para el ticket ─────────────
    const getSummary = useCallback(() => {
        if (!state.recipiente) return null;
        const bolaNames = state.bolas.map(b => b.name).join('+');
        const extraNames = state.extras.map(e => e.name).join('+');
        return {
            label: `${state.recipiente.name} ${bolaNames}${extraNames ? ' +' + extraNames : ''}`,
            recipiente: state.recipiente,
            bolas: [...state.bolas],
            extras: [...state.extras],
            recipientName: state.recipientName,
            subtotal,
        };
    }, [state, subtotal]);

    // ─── Reset completo ─────────────────────────────
    const reset = useCallback(() => {
        setState(INITIAL_STATE);
    }, []);

    return {
        // Estado
        recipiente: state.recipiente,
        bolas: state.bolas,
        extras: state.extras,
        recipientName: state.recipientName,
        subtotal,
        isValid,

        // Acciones
        selectRecipiente,
        addBola,
        removeBola,
        toggleExtra,
        setRecipientName,
        getSummary,
        reset,

        // Info
        maxBolas: state.recipiente?.max_scoops || 3,
        bolasRestantes: (state.recipiente?.max_scoops || 3) - state.bolas.length,
    };
}
