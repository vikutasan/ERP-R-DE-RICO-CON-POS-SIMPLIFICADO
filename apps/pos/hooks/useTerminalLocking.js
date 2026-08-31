import { useState, useEffect, useRef, useCallback } from 'react';
import { posService } from '../services/POSService';

/**
 * Custom Hook: useTerminalLocking
 * Encapsula toda la lógica de ocupación de terminales:
 * - Polling de estados de terminales (en pantalla de selección)
 * - Advertencia visual si un Admin rompe nuestro bloqueo (SIN auto-expulsión)
 * - Limpieza automática al desmontar (liberar terminal)
 * - Heartbeat para renovar TTL del candado
 * 
 * CAMBIO CRÍTICO (v4.4): Ya NO expulsa automáticamente al usuario.
 * Solo el admin puede forzar la desconexión via force_unlock.
 * El polling de seguridad ahora solo muestra una advertencia visual.
 * ANTI-PING-PONG: Ya no intenta re-adquirir candados automáticamente.
 */
export const useTerminalLocking = (selectedTerminal, currentUser) => {
    const [terminalStatuses, setTerminalStatuses] = useState({});
    const [forceLogoutModal, setForceLogoutModal] = useState(false);
    const [lockWarning, setLockWarning] = useState(false); // Advertencia visual (sin expulsión)

    const [settings, setSettings] = useState({
        statusPolling: 5000,
        checkLockPolling: 15000,
        heartbeatInterval: 20000
    });

    // Refs para el cleanup � evita que el efecto dependa de currentUser/selectedTerminal
    // y dispare unlocks espurios al cambiar la referencia del objeto (Bug Terminal Fantasma v2)
    const selectedTerminalRef = useRef(selectedTerminal);
    const currentUserRef = useRef(currentUser);
    selectedTerminalRef.current = selectedTerminal;
    currentUserRef.current = currentUser;

    // Cargar ajustes del sistema al montar
    useEffect(() => {
        posService.getSystemSettings()
            .then(data => {
                if (!Array.isArray(data)) {
                    console.warn("Respuesta de ajustes no es un array, usando valores por defecto.");
                    return;
                }
                const s = {};
                try {
                    data.forEach(item => {
                        if (item.key === 'pos_terminal_status_polling_ms') s.statusPolling = parseInt(item.value);
                        if (item.key === 'pos_heartbeat_interval_ms') s.heartbeatInterval = parseInt(item.value);
                        if (item.key === 'pos_terminal_check_lock_interval_ms') s.checkLockPolling = parseInt(item.value);
                    });
                    if (Object.keys(s).length > 0) {
                        setSettings(prev => ({ ...prev, ...s }));
                    }
                } catch (e) { console.error("Error procesando ajustes del sistema:", e); }
            })
            .catch(e => console.warn("Error conectando con ajustes, usando intervalos por defecto", e));
    }, []);

    // Polling en pantalla principal para ver quién ocupa las terminales
    useEffect(() => {
        let interval;
        const fetchStatuses = async () => {
            if (!selectedTerminal) {
                try {
                    const data = await posService.getTerminalsStatus();
                    setTerminalStatuses(data);
                } catch (e) {
                    console.error("Error fetching terminal status", e);
                }
            }
        };
        fetchStatuses();
        interval = setInterval(fetchStatuses, settings.statusPolling);
        return () => clearInterval(interval);
    }, [selectedTerminal, settings.statusPolling]);

    // Polling de Seguridad: verifica si un Admin forzó la liberación de nuestro candado
    // CAMBIO: Ya NO expulsa automáticamente. Solo muestra advertencia visual.
    // La expulsión real solo ocurre si el Admin usa force_unlock y el usuario confirma.
    useEffect(() => {
        if (!selectedTerminal || forceLogoutModal) return;
        
        const checkMyLock = async () => {
            try {
                const data = await posService.getTerminalsStatus();
                const myStatus = data[selectedTerminal];
                
                if (!myStatus || myStatus.occupier_id !== currentUser?.id) {
                    // El candado se perdió (por TTL o inicio de sesión en otra terminal).
                    // NO re-adquirimos silenciosamente para evitar efecto "ping-pong".
                    console.warn("Candado no encontrado en servidor o ocupado por otra persona.");
                    setLockWarning(true);
                    
                    // Verificar si fue un force_unlock explícito del admin
                    // (la terminal ahora pertenece a otra persona)
                    if (myStatus && myStatus.occupier_id !== currentUser?.id) {
                        // Un admin transfirió la terminal a otra persona → expulsar
                        setForceLogoutModal(true);
                    }
                } else {
                    setLockWarning(false); // Todo normal
                }
            } catch (e) {
                // Error de red puro — NO hacer nada, no expulsar
                console.error("Error en polling de seguridad (Capa Red):", e);
            }
        };
        
        const intervalId = setInterval(checkMyLock, settings.checkLockPolling);
        return () => clearInterval(intervalId);
    }, [selectedTerminal, currentUser, forceLogoutModal, settings.checkLockPolling]);

    // Limpieza al desmontar: liberar terminal si el usuario cierra sesion o cierra la pestana
    // SOLO se ejecuta al desmontar el componente ([] vacio) � usa refs para leer valores actuales
    // sin causar re-ejecuciones del efecto que disparen unlocks espurios (Bug Terminal Fantasma v2)
    useEffect(() => {
        return () => {
            const terminal = selectedTerminalRef.current;
            const user = currentUserRef.current;
            if (terminal && user?.id) {
                posService.unlockTerminal(terminal, user.id).catch(e => console.warn("Auto-unlock en limpieza fallo", e));
            }
        };
    }, []); // Dependencias vacias: solo se ejecuta al DESMONTAR

    // Heartbeat: renueva el timestamp del candado para evitar que expire por TTL
    useEffect(() => {
        if (!selectedTerminal || !currentUser?.id) return;
        
        const sendHeartbeat = () => {
            posService.heartbeatTerminal(selectedTerminal, currentUser.id)
                .catch(e => {
                    console.warn("Heartbeat network request failed:", e);
                    // No intentamos re-adquirir el candado aquí para evitar 
                    // robo involuntario si el usuario se movió de terminal.
                });
        };

        // Enviar heartbeat inmediatamente al seleccionar terminal
        sendHeartbeat();
        const intervalId = setInterval(sendHeartbeat, settings.heartbeatInterval); 
        return () => clearInterval(intervalId);
    }, [selectedTerminal, currentUser, settings.heartbeatInterval]);

    return { terminalStatuses, setTerminalStatuses, forceLogoutModal, setForceLogoutModal, lockWarning };
};
