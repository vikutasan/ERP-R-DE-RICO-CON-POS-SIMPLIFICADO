/**
 * FlavorAvailabilityToggle.jsx — Botón AGOTAR SABOR.
 * Estética editorial B&W: borde negro, inversión al agotar.
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
                gap: '6px',
                background: available ? '#0f0f0f' : '#ffffff',
                border: '1px solid #0f0f0f',
                borderRadius: '100px',
                padding: '6px 14px',
                color: available ? '#ffffff' : '#0f0f0f',
                fontSize: '11px',
                fontWeight: '800',
                textTransform: 'uppercase',
                cursor: toggling ? 'wait' : 'pointer',
                opacity: toggling ? 0.6 : 1,
                transition: 'all 0.15s ease',
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
