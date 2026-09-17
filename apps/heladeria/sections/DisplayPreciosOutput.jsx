import React, { useEffect, useRef, useState } from 'react';
import { CONFIG } from '../../pos/config';
import { withRetries } from '../../pos/utils/withRetries';
import {
    buildDisplayViewModel,
    DEFAULT_SCREEN_CONFIG,
    normalizeScreenConfig,
} from '../utils/displayMappers';
import {
    cacheDisplayMenu,
    getCachedDisplayMenu,
    getDisplayMenuCacheAge,
} from '../services/heladeriaOfflineStore';
import { loadDisplayScreens } from '../services/displayConfigService';
import { DisplayPreciosBody, resolveTheme } from '../components/DisplayPreciosBody';

/**
 * DisplayPreciosOutput — Pantalla de precios para clientes (V17 → V8 multi-pantalla).
 *
 * MODO KIOSCO: solo lectura, sin botones de navegación, pensada para un
 * monitor/tablet en la heladería. Se abre con `?mode=output&screen=<id>`.
 *
 * V8 — MULTI-PANTALLA:
 *   Cada TV puede proyectar una PANTALLA NOMBRADA distinta. El `screenId`
 *   llega por prop (resuelto desde el deep-link `?screen=`). Si no se
 *   especifica, se usa la primera pantalla habilitada.
 *
 * OFFLINE-FIRST:
 *   1. Intenta la red (GET /heladeria/display/menu).
 *   2. Si falla, usa el caché IndexedDB (TTL 24h, clave 'display_menu').
 *   3. Si no hay caché, muestra un estado vacío honesto.
 *
 * REFRESCO: cada 5 minutos. NO usa animaciones CSS infinitas (Incident 16.1).
 *
 * REGLA: CERO PRECIOS HARDCODEADOS. Todo precio viene del menú de la API.
 *
 * @param {function} [props.onExit]   Callback para salir del modo kiosco.
 * @param {string}   [props.screenId] Id de la pantalla nombrada a proyectar.
 */
const REFRESH_MS = 5 * 60 * 1000; // 5 minutos

export function DisplayPreciosOutput({ onExit, screenId = 'screen_1' }) {
    const [viewModel, setViewModel] = useState({
        groups: [],
        totalItems: 0,
        config: { ...DEFAULT_SCREEN_CONFIG },
        isEmpty: true,
    });
    const [screen, setScreen] = useState(null);
    const [source, setSource] = useState('loading'); // 'network' | 'cache' | 'empty'
    const [cacheAge, setCacheAge] = useState(null);
    const [now, setNow] = useState(Date.now());
    const mountedRef = useRef(true);

    // ── Carga de datos (pantalla → menú) ─────────────────────
    const loadData = async () => {
        let resolvedScreen = null;
        try {
            const doc = await loadDisplayScreens();
            // Defensivo: `loadDisplayScreens` puede devolver un documento sin
            // `screens` si la API responde algo inesperado (Incident 16.8).
            const screens = Array.isArray(doc?.screens) ? doc.screens : [];
            const found = screens.find((s) => s.id === screenId);
            resolvedScreen = found || screens[0] || null;
        } catch {
            // Sin documento: seguimos con los defaults (el Display nunca se bloquea).
        }

        const config = resolvedScreen
            ? normalizeScreenConfig(resolvedScreen.config)
            : { ...DEFAULT_SCREEN_CONFIG };

        let menuData = null;
        let src = 'empty';

        try {
            menuData = await withRetries(async () => {
                const res = await fetch(
                    `${CONFIG.API_BASE_URL}/heladeria/display/menu`,
                    { cache: 'no-store' },
                );
                if (!res.ok) throw new Error('Error cargando menú del Display');
                return res.json();
            }, { label: 'displayOutput.getMenu' });
            src = 'network';
            // Persistimos para el próximo arranque offline.
            await cacheDisplayMenu(menuData);
        } catch {
            // Fallback offline.
            menuData = await getCachedDisplayMenu();
            if (menuData) src = 'cache';
        }

        if (!mountedRef.current) return;

        setScreen(resolvedScreen);
        setViewModel(buildDisplayViewModel(menuData, config));
        setSource(src);
        setCacheAge(src === 'cache' ? await getDisplayMenuCacheAge() : null);
    };

    // ── Ciclo de vida ────────────────────────────────────────
    useEffect(() => {
        mountedRef.current = true;
        loadData();

        const refreshTimer = setInterval(loadData, REFRESH_MS);
        // Reloj para el indicador "Actualizado hace X".
        const clockTimer = setInterval(() => setNow(Date.now()), 30000);

        return () => {
            mountedRef.current = false;
            clearInterval(refreshTimer);
            clearInterval(clockTimer);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [screenId]);

    // ── Helpers de presentación ──────────────────────────────
    const theme = resolveTheme(viewModel.config.theme);

    const formatAge = (ms) => {
        if (ms == null) return '';
        const min = Math.floor(ms / 60000);
        if (min < 1) return 'hace unos segundos';
        if (min < 60) return `hace ${min} min`;
        const hrs = Math.floor(min / 60);
        return `hace ${hrs} h`;
    };

    // ── Render ───────────────────────────────────────────────
    if (source === 'loading') {
        return (
            <div style={{ ...styles.fullscreen, position: onExit ? 'absolute' : 'fixed', background: theme.bg }}>
                <div style={{ ...styles.statusText, color: theme.accent }}>
                    Cargando precios…
                </div>
            </div>
        );
    }

    if (viewModel.isEmpty) {
        return (
            <div style={{ ...styles.fullscreen, position: onExit ? 'absolute' : 'fixed', background: theme.bg }}>
                <div style={styles.emptyBox}>
                    <div style={{ fontSize: '64px' }}>🍦</div>
                    <h2 style={{ ...styles.emptyTitle, color: theme.text }}>
                        Sin productos para mostrar
                    </h2>
                    <p style={{ ...styles.emptyHint, color: theme.muted }}>
                        {source === 'empty'
                            ? 'No hay conexión y aún no se ha guardado un menú en este dispositivo.'
                            : 'La configuración actual no incluye ningún grupo visible.'}
                    </p>
                    {onExit && (
                        <button
                            style={{ ...styles.exitBtn, color: theme.accent, borderColor: theme.accent }}
                            onClick={onExit}
                        >
                            Salir del modo pantalla
                        </button>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div style={{ ...styles.fullscreen, position: onExit ? 'absolute' : 'fixed', background: theme.bg }}>
            {/* ── Barra de estado (solo kiosco) ── */}
            <div style={styles.statusBar}>
                {source === 'cache' && (
                    <span style={{ ...styles.badge, color: theme.warn, borderColor: theme.warn }}>
                        Sin conexión · {formatAge(cacheAge)}
                    </span>
                )}
                {source === 'network' && (
                    <span style={{ ...styles.badge, color: theme.ok, borderColor: theme.ok }}>
                        En línea
                    </span>
                )}
                {onExit && (
                    <button
                        style={{ ...styles.exitBtn, color: theme.muted, borderColor: theme.border }}
                        onClick={onExit}
                    >
                        Salir
                    </button>
                )}
            </div>

            {/* ── Cuerpo compartido (mismo diseño que la vista previa) ── */}
            <div style={styles.bodyScroll}>
                <DisplayPreciosBody
                    viewModel={viewModel}
                    theme={theme}
                    screen={screen}
                    scale={1}
                />
            </div>

            {/* ── Pie de estado ── */}
            <footer
                style={{
                    ...styles.footer,
                    borderTop: `1px solid ${theme.border}`,
                    color: theme.muted,
                }}
            >
                {viewModel.totalItems} producto(s) · Actualizado {formatAge(now - (cacheAge ?? 0)) || 'ahora'}
            </footer>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
// Estilos
// ─────────────────────────────────────────────────────────────
const styles = {
    fullscreen: {
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        fontFamily: "'Inter', sans-serif",
        overflow: 'hidden',
    },
    statusText: {
        margin: 'auto',
        fontSize: '18px',
        fontWeight: '700',
    },
    statusBar: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: '12px',
        padding: '10px 24px',
    },
    badge: {
        padding: '6px 14px',
        borderRadius: '20px',
        border: '1px solid',
        fontSize: '12px',
        fontWeight: '700',
        letterSpacing: '0.5px',
    },
    exitBtn: {
        background: 'transparent',
        border: '1px solid',
        padding: '8px 16px',
        borderRadius: '10px',
        cursor: 'pointer',
        fontWeight: '700',
        fontSize: '12px',
    },
    bodyScroll: {
        flex: 1,
        overflowY: 'auto',
    },
    footer: {
        padding: '12px 32px',
        fontSize: '12px',
        fontWeight: '600',
        textAlign: 'center',
    },
    emptyBox: {
        margin: 'auto',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '16px',
        maxWidth: '460px',
        textAlign: 'center',
    },
    emptyTitle: {
        margin: 0,
        fontFamily: "'Playfair Display', serif",
        fontSize: '1.8rem',
    },
    emptyHint: {
        margin: 0,
        fontSize: '14px',
        lineHeight: '1.6',
    },
};
