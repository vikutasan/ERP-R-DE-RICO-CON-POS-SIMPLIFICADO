/**
 * TiendaInteractivaUI.jsx — Sección 1 del Hub de Heladería (V14).
 *
 * Antes era un placeholder "Próximamente" con una animación `float infinite`
 * (prohibida por el blindaje del POS — Incidente 16.1 "Efecto Estrobo").
 * Ahora monta el configurador visual de doble columna y lo cablea al hook
 * real de pre-comanda (`usePreComanda`), que reserva el ticket con
 * `channel='HELADERIA'` de forma ATÓMICA y encola offline si no hay red.
 *
 * La sección está aislada: el POS de Panadería NO la importa, y la Barrera 2
 * (`SectionErrorBoundary` del Hub) contiene cualquier fallo.
 */
import React, { useCallback } from 'react';
import { TiendaConfigurator } from '../components/TiendaConfigurator';
import { usePreComanda } from '../hooks/usePreComanda';

export const TiendaInteractivaUI = ({
    onBack,
    onPreComandaReady,
    sessionId = null,
    terminalId = 'H1',
    capturedById = null,
    menu = null,
}) => {
    // Hook real: reserva atómica + cola offline. El canal lo garantiza el backend.
    const preComanda = usePreComanda({ sessionId, terminalId, capturedById, menu });

    const handlePreComanda = useCallback(
        async (state, meta) => {
            // 1) Enviar por el canal real (o encolar si no hay red).
            const result = await preComanda.enviarPreComanda(state, meta);

            // 2) Notificar al padre (Hub) si inyectó un manejador.
            if (onPreComandaReady) {
                try {
                    await onPreComandaReady({ ...result, state, meta });
                } catch (err) {
                    // Un fallo del consumidor NO debe romper la Tienda.
                    console.warn('[TiendaInteractiva] onPreComandaReady falló:', err.message);
                }
            }

            return result;
        },
        [preComanda, onPreComandaReady],
    );

    return (
        <TiendaConfigurator
            onBack={onBack}
            onPreComandaReady={handlePreComanda}
        />
    );
};

export default TiendaInteractivaUI;
