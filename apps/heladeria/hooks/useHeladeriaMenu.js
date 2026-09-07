/**
 * useHeladeriaMenu.js — Hook para cargar menú dinámico de heladería.
 * Intenta cache offline primero, luego API, cachea resultado.
 */
import { useState, useEffect, useCallback } from 'react';
import { heladeriaService } from '../services/heladeriaService';
import { getCachedMenu, cacheMenu } from '../services/heladeriaOfflineStore';

export function useHeladeriaMenu() {
    const [menu, setMenu] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const loadMenu = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            // Intentar cache primero
            const cached = await getCachedMenu();
            if (cached) {
                setMenu(cached);
                setLoading(false);
                // Refresh en background
                heladeriaService.getMenu().then(fresh => {
                    setMenu(fresh);
                    cacheMenu(fresh);
                }).catch(() => {}); // Si falla el refresh, usar cache
                return;
            }
            
            // Sin cache — cargar del API
            const fresh = await heladeriaService.getMenu();
            setMenu(fresh);
            await cacheMenu(fresh);
        } catch (err) {
            setError(err.message);
            console.error('Error cargando menú heladería:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadMenu(); }, [loadMenu]);

    // Agrupar items por tipo para acceso rápido
    const recipientes = menu?.groups?.find(g => g.component_type === 'RECIPIENTE')?.items || [];
    const sabores = menu?.groups?.find(g => g.component_type === 'SABOR')?.items || [];
    const extras = menu?.groups?.find(g => g.component_type === 'EXTRA')?.items || [];
    const bebidas = menu?.groups?.find(g => g.component_type === 'BEBIDA_BASE')?.items || [];
    const tamanos = menu?.groups?.find(g => g.component_type === 'TAMAÑO')?.items || [];

    return {
        menu,
        recipientes,
        sabores,
        extras,
        bebidas,
        tamanos,
        loading,
        error,
        refresh: loadMenu,
    };
}
