import React, { useEffect, useRef, useState } from 'react';
import { CONFIG } from '../../pos/config';
import { withRetries } from '../../pos/utils/withRetries';
import {
    buildDisplayViewModel,
    DEFAULT_DISPLAY_CONFIG,
    normalizeDisplayConfig,
} from '../utils/displayMappers';
import {
    cacheDisplayMenu,
    getCachedDisplayMenu,
    getDisplayMenuCacheAge,
} from '../services/heladeriaOfflineStore';
import { fetchDisplayConfig } from '../services/displayConfigService';

/**
 * DisplayPreciosOutput — Pantalla de precios para clientes (V17, Fase 17.3).
 *
 * MODO KIOSCO: solo lectura, sin botones de navegación, pensada para un
 * monitor/tablet en la heladería. Se abre con `?mode=output`.
 *
 * OFFLINE-FIRST:
 *   1. Intenta la red (GET /heladeria/display/menu).
 *   2. Si falla, usa el caché IndexedDB (TTL 24h, clave 'display_menu').
 *   3. Si no hay caché, muestra un estado vacío honesto.
 *
 * REFRESCO: cada 5 minutos (configurable). NO usa animaciones CSS infinitas
 * (Incident 16.1 — Efecto Estrobo).
 *
 * REGLA: CERO PRECIOS HARDCODEADOS. Todo precio viene del menú de la API.
 */
const REFRESH_MS = 5 * 60 * 1000; // 5 minutos

export function DisplayPreciosOutput({ onExit }) {
    const [viewModel, setViewModel] = useState({
        groups: [],
        totalItems: 0,
        config: { ...DEFAULT_DISPLAY_CONFIG },
        isEmpty: true,
    });
    const [source, setSource] = useState('loading'); // 'network' | 'cache' | 'empty'
    const [cacheAge, setCacheAge] = useState(null);
    const [now, setNow] = useState(Date.now());
    const mountedRef = useRef(true);

    // ── Carga de datos (red → caché) ─────────────────────────
    const loadData = async () => {
        let config = { ...DEFAULT_DISPLAY_CONFIG };
        try {
            const cfgRes = await fetchDisplayConfig();
            config = normalizeDisplayConfig(cfgRes.config);
        } catch {
            // Sin config: seguimos con los defaults (el Display nunca se bloquea).
        }

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
    }, []);

    // ── Helpers de presentación ──────────────────────────────
    const isDark = viewModel.config.theme === 'DARK';
    const theme = isDark ? darkTheme : lightTheme;

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
            <div style={{ ...styles.fullscreen, background: theme.bg }}>
                <div style={{ ...styles.statusText, color: theme.accent }}>
                    Cargando precios…
                </div>
            </div>
        );
    }

    if (viewModel.isEmpty) {
        return (
            <div style={{ ...styles.fullscreen, background: theme.bg }}>
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
                        <button style={{ ...styles.exitBtn, color: theme.accent, borderColor: theme.accent }} onClick={onExit}>
                            Salir del modo pantalla
                        </button>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div style={{ ...styles.fullscreen, background: theme.bg }}>
            {/* ── Encabezado ── */}
            <header style={{ ...styles.header, borderBottom: `1px solid ${theme.border}` }}>
                <h1 style={{ ...styles.brand, color: theme.text }}>
                    🍦 R de Rico — Precios
                </h1>
                <div style={styles.headerRight}>
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
            </header>

            {/* ── Grupos ── */}
            <main style={styles.main}>
                {viewModel.groups.map((group) => (
                    <section key={group.componentType} style={styles.group}>
                        <h2 style={{ ...styles.groupTitle, color: theme.accent }}>
                            {group.label}
                        </h2>
                        <div
                            style={{
                                ...styles.grid,
                                gridTemplateColumns: `repeat(${viewModel.config.columns}, minmax(0, 1fr))`,
                            }}
                        >
                            {group.items.map((item) => (
                                <article
                                    key={`${group.componentType}-${item.configId ?? item.productId ?? item.name}`}
                                    style={{
                                        ...styles.card,
                                        background: theme.card,
                                        border: `1px solid ${theme.border}`,
                                        opacity: item.isAvailable ? 1 : 0.45,
                                    }}
                                >
                                    {viewModel.config.showImages && item.image && (
                                        <img
                                            src={item.image}
                                            alt={item.name}
                                            style={styles.cardImage}
                                            onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                        />
                                    )}
                                    <div style={styles.cardBody}>
                                        <span style={{ ...styles.cardName, color: theme.text }}>
                                            {item.name}
                                        </span>
                                        <span style={{ ...styles.cardPrice, color: theme.accent }}>
                                            {item.priceLabel}
                                        </span>
                                    </div>
                                    {!item.isAvailable && (
                                        <span style={{ ...styles.agotado, color: theme.warn }}>
                                            AGOTADO
                                        </span>
                                    )}
                                </article>
                            ))}
                        </div>
                    </section>
                ))}
            </main>

            {/* ── Pie ── */}
            <footer style={{ ...styles.footer, borderTop: `1px solid ${theme.border}`, color: theme.muted }}>
                {viewModel.totalItems} producto(s) · Actualizado {formatAge(now - (cacheAge ?? 0)) || 'ahora'}
            </footer>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
// Temas
// ─────────────────────────────────────────────────────────────
const darkTheme = {
    bg: 'linear-gradient(135deg, #0a0a0a 0%, #08101a 50%, #0a0a0a 100%)',
    card: 'rgba(15, 23, 42, 0.7)',
    text: '#f9fafb',
    muted: '#9ca3af',
    accent: '#38bdf8',
    border: 'rgba(56, 189, 248, 0.18)',
    ok: '#4ade80',
    warn: '#fbbf24',
};

const lightTheme = {
    bg: 'linear-gradient(135deg, #f8fafc 0%, #e0f2fe 50%, #f8fafc 100%)',
    card: 'rgba(255, 255, 255, 0.9)',
    text: '#0f172a',
    muted: '#64748b',
    accent: '#0284c7',
    border: 'rgba(2, 132, 199, 0.18)',
    ok: '#16a34a',
    warn: '#d97706',
};

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
    header: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '18px 32px',
        gap: '16px',
    },
    headerRight: {
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
    },
    brand: {
        margin: 0,
        fontFamily: "'Playfair Display', serif",
        fontSize: '1.6rem',
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
    main: {
        flex: 1,
        overflowY: 'auto',
        padding: '24px 32px',
        display: 'flex',
        flexDirection: 'column',
        gap: '32px',
    },
    group: {
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
    },
    groupTitle: {
        margin: 0,
        fontFamily: "'Playfair Display', serif",
        fontSize: '1.4rem',
    },
    grid: {
        display: 'grid',
        gap: '16px',
    },
    card: {
        borderRadius: '16px',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
    },
    cardImage: {
        width: '100%',
        height: '110px',
        objectFit: 'cover',
    },
    cardBody: {
        padding: '14px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
    },
    cardName: {
        fontSize: '15px',
        fontWeight: '700',
    },
    cardPrice: {
        fontSize: '22px',
        fontWeight: '800',
    },
    agotado: {
        position: 'absolute',
        top: '10px',
        right: '10px',
        fontSize: '10px',
        fontWeight: '800',
        letterSpacing: '1px',
        background: 'rgba(0,0,0,0.55)',
        padding: '4px 8px',
        borderRadius: '8px',
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
