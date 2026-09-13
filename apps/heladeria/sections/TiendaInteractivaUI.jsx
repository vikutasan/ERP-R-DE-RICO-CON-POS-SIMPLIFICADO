/**
 * TiendaInteractivaUI.jsx — Sección 1 del Hub de Heladería (V14).
 *
 * Antes era un placeholder "Próximamente" con una animación `float infinite`
 * (prohibida por el blindaje del POS — Incidente 16.1 "Efecto Estrobo").
 * Ahora monta el configurador visual de doble columna.
 *
 * La sección está aislada: el POS de Panadería NO la importa, y la Barrera 2
 * (`SectionErrorBoundary` del Hub) contiene cualquier fallo.
 */
import React, { useCallback } from 'react';
import { TiendaConfigurator } from '../components/TiendaConfigurator';

export const TiendaInteractivaUI = ({ onBack, onPreComandaReady }) => {
    // El padre (Hub) puede inyectar el manejador real de la pre-comanda.
    // Si no lo hace, el configurador funciona igual (solo muestra el feedback).
    const handlePreComanda = useCallback(
        async (item) => {
            if (onPreComandaReady) {
                return onPreComandaReady(item);
            }
            // Sin manejador inyectado: no se envía a red, solo se registra.
            console.info('[TiendaInteractiva] Pre-comanda lista:', item);
            return item;
        },
        [onPreComandaReady],
    );

    return (
        <TiendaConfigurator
            onBack={onBack}
            onPreComandaReady={handlePreComanda}
        />
    );
};

export default TiendaInteractivaUI;
