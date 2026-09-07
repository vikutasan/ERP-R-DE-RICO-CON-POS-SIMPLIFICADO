/**
 * FlavorAvailabilityToggle.jsx — Botón AGOTAR SABOR.
 * Toggle instantáneo con feedback visual.
 * Ubicado en la UI del POS Heladería (cajeros).
 */
import React, { useState } from 'react';
import { heladeriaService } from '../services/heladeriaService';

export function FlavorAvailabilityToggle({ configId, name, isAvailable, onToggled }) {
    const [toggling, setToggling] = useState(false);
    const [available, setAvailable] = useState(isAvailable);

    const handleToggle = async () => {
        setToggling(true);
        try {
            const result = await heladeriaService.toggleAvailability(configId, !available);
            setAvailable(result.is_available);
            if (onToggled) onToggled(configId, result.is_available);
        } catch (err) {
            console.error('Error toggling availability:', err);
        } finally {
            setToggling(false);
        }
    };

    return (
        <button
            onClick={handleToggle}
            disabled={toggling}
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: available
                    ? 'rgba(239,68,68,0.1)'
                    : 'rgba(34,197,94,0.1)',
                border: `1px solid ${available ? 'rgba(239,68,68,0.3)' : 'rgba(34,197,94,0.3)'}`,
                borderRadius: '10px',
                padding: '8px 14px',
                color: available ? '#ef4444' : '#22c55e',
                fontSize: '11px',
                fontWeight: '800',
                textTransform: 'uppercase',
                cursor: toggling ? 'wait' : 'pointer',
                opacity: toggling ? 0.6 : 1,
                transition: 'all 0.2s ease',
                letterSpacing: '0.5px',
            }}
        >
            {toggling ? '⏳' : available ? '⛔' : '✅'}
            {toggling 
                ? 'Procesando...' 
                : available 
                    ? `Agotar ${name}` 
                    : `Habilitar ${name}`
            }
        </button>
    );
}
