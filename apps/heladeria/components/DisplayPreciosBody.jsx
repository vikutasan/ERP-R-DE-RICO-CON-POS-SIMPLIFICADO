import React from 'react';
import { resolveGroupLabel, resolveImagePresentation } from '../utils/displayMappers';

/**
 * DisplayPreciosBody — Renderizador PURO del Display de Precios (V8).
 *
 * Es el ÚNICO lugar donde se dibuja el cuerpo del Display (encabezado, grupos,
 * tarjetas, pie). Lo consumen DOS componentes:
 *   - DisplayPreciosPreview (vista previa en vivo dentro del Configurador).
 *   - DisplayPreciosOutput  (modo kiosco a pantalla completa).
 *
 * DRY: si el diseño cambia, cambia aquí y ambos quedan sincronizados.
 *
 * REGLAS:
 *   - CERO estado. CERO efectos. CERO red. Solo props → JSX.
 *   - CERO precios hardcodeados: todo viene en `viewModel`.
 *   - Sin animaciones CSS infinitas (Incident 16.1).
 *   - `scale` permite embeber el mismo diseño en un contenedor pequeño
 *     (vista previa) sin duplicar estilos.
 *
 * @param {object} props.viewModel  Salida de buildDisplayViewModel().
 * @param {object} props.theme      Paleta resuelta (darkTheme | lightTheme).
 * @param {object} props.screen     Pantalla nombrada (header/footer/print).
 * @param {number} [props.scale=1]  Factor de escala tipográfica.
 * @param {boolean} [props.compact=false] Reduce paddings (vista previa).
 */
export function DisplayPreciosBody({
    viewModel,
    theme,
    screen,
    scale = 1,
    compact = false,
}) {
    const config = viewModel.config || {};
    // La forma canónica de una pantalla es { id, name, enabled, config }.
    // `header`/`images`/`print` viven DENTRO de `config`, no en la raíz.
    // Se acepta también la forma plana por compatibilidad defensiva.
    const screenConfig = (screen && screen.config) || {};
    const header = screenConfig.header || (screen && screen.header) || {};
    const footer = screenConfig.footer || (screen && screen.footer) || {};
    const images = screenConfig.images || (screen && screen.images) || {};
    const groupLabels = config.groupLabels || screenConfig.groupLabels || {};

    const showHeader = header.show !== false;
    const showFooter = footer.show !== false;

    const px = (value) => `${Math.round(value * scale)}px`;

    return (
        <div
            style={{
                ...styles.root,
                background: theme.bg,
                padding: compact ? '16px' : '0',
            }}
        >
            {showHeader && (
                <header
                    style={{
                        ...styles.header,
                        borderBottom: `1px solid ${theme.border}`,
                        padding: compact ? '12px 16px' : '18px 32px',
                    }}
                >
                    <div style={styles.headerLeft}>
                        <h1
                            style={{
                                ...styles.brand,
                                color: theme.text,
                                fontSize: px(compact ? 20 : 26),
                            }}
                        >
                            {header.title || 'R de Rico — Precios'}
                        </h1>
                        {header.subtitle && (
                            <span
                                style={{
                                    ...styles.subtitle,
                                    color: theme.muted,
                                    fontSize: px(compact ? 11 : 13),
                                }}
                            >
                                {header.subtitle}
                            </span>
                        )}
                    </div>
                    {header.badge && (
                        <span
                            style={{
                                ...styles.badge,
                                color: theme.accent,
                                borderColor: theme.accent,
                                fontSize: px(compact ? 10 : 12),
                            }}
                        >
                            {header.badge}
                        </span>
                    )}
                </header>
            )}

            <main
                style={{
                    ...styles.main,
                    padding: compact ? '16px' : '24px 32px',
                    gap: px(compact ? 20 : 32),
                }}
            >
                {viewModel.groups.map((group) => (
                    <section key={group.componentType} style={styles.group}>
                        <h2
                            style={{
                                ...styles.groupTitle,
                                color: theme.accent,
                                fontSize: px(compact ? 16 : 22),
                            }}
                        >
                            {resolveGroupLabel(group.componentType, groupLabels)
                                || group.label}
                        </h2>
                        <div
                            style={{
                                ...styles.grid,
                                gap: px(compact ? 10 : 16),
                                gridTemplateColumns: `repeat(${config.columns || 3}, minmax(0, 1fr))`,
                            }}
                        >
                            {group.items.map((item) => (
                                <DisplayCard
                                    key={`${group.componentType}-${item.configId ?? item.productId ?? item.name}`}
                                    item={item}
                                    theme={theme}
                                    images={images}
                                    showImages={config.showImages}
                                    scale={scale}
                                    compact={compact}
                                />
                            ))}
                        </div>
                    </section>
                ))}
            </main>

            {showFooter && (
                <footer
                    style={{
                        ...styles.footer,
                        borderTop: `1px solid ${theme.border}`,
                        color: theme.muted,
                        fontSize: px(compact ? 10 : 12),
                        padding: compact ? '10px 16px' : '12px 32px',
                    }}
                >
                    {footer.text
                        || `${viewModel.totalItems} producto(s) en carta`}
                </footer>
            )}
        </div>
    );
}

/**
 * DisplayCard — Tarjeta individual de producto (sub-componente puro).
 * Aislado para mantener DisplayPreciosBody por debajo de 3 niveles de anidación.
 */
function DisplayCard({ item, theme, images, showImages, scale, compact }) {
    const presentation = resolveImagePresentation(item, images);
    const px = (value) => `${Math.round(value * scale)}px`;

    return (
        <article
            style={{
                ...styles.card,
                background: theme.card,
                border: `1px solid ${theme.border}`,
                opacity: item.isAvailable ? 1 : 0.45,
            }}
        >
            {showImages && presentation.url && (
                <img
                    src={presentation.url}
                    alt={item.name}
                    style={{
                        ...styles.cardImage,
                        height: px(compact ? 70 : 110),
                        borderRadius: presentation.shape === 'CIRCLE' ? '50%' : '0',
                        objectFit: presentation.shape === 'CIRCLE' ? 'cover' : 'cover',
                    }}
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
            )}
            {showImages && !presentation.url && presentation.fallbackText && (
                <div
                    style={{
                        ...styles.cardFallback,
                        color: theme.muted,
                        fontSize: px(compact ? 10 : 12),
                    }}
                >
                    {presentation.fallbackText}
                </div>
            )}
            <div
                style={{
                    ...styles.cardBody,
                    padding: compact ? '10px 12px' : '14px 16px',
                }}
            >
                <span
                    style={{
                        ...styles.cardName,
                        color: theme.text,
                        fontSize: px(compact ? 12 : 15),
                    }}
                >
                    {item.name}
                </span>
                <span
                    style={{
                        ...styles.cardPrice,
                        color: theme.accent,
                        fontSize: px(compact ? 16 : 22),
                    }}
                >
                    {item.priceLabel}
                </span>
            </div>
            {!item.isAvailable && (
                <span
                    style={{
                        ...styles.agotado,
                        color: theme.warn,
                        fontSize: px(compact ? 8 : 10),
                    }}
                >
                    AGOTADO
                </span>
            )}
        </article>
    );
}

// ─────────────────────────────────────────────────────────────
// Estilos
// ─────────────────────────────────────────────────────────────
const styles = {
    root: {
        minHeight: '100%',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: "'Inter', sans-serif",
        boxSizing: 'border-box',
    },
    header: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '16px',
    },
    headerLeft: {
        display: 'flex',
        flexDirection: 'column',
        gap: '2px',
    },
    brand: {
        margin: 0,
        fontFamily: "'Playfair Display', serif",
        lineHeight: 1.15,
    },
    subtitle: {
        fontWeight: '600',
        letterSpacing: '0.3px',
    },
    badge: {
        padding: '6px 14px',
        borderRadius: '20px',
        border: '1px solid',
        fontWeight: '700',
        letterSpacing: '0.5px',
        whiteSpace: 'nowrap',
    },
    main: {
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
    },
    group: {
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
    },
    groupTitle: {
        margin: 0,
        fontFamily: "'Playfair Display', serif",
    },
    grid: {
        display: 'grid',
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
    },
    cardFallback: {
        padding: '10px 12px',
        fontWeight: '700',
        letterSpacing: '0.5px',
        textTransform: 'uppercase',
    },
    cardBody: {
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
    },
    cardName: {
        fontWeight: '700',
    },
    cardPrice: {
        fontWeight: '800',
    },
    agotado: {
        position: 'absolute',
        top: '10px',
        right: '10px',
        fontWeight: '800',
        letterSpacing: '1px',
        background: 'rgba(0,0,0,0.55)',
        padding: '4px 8px',
        borderRadius: '8px',
    },
};

// ─────────────────────────────────────────────────────────────
// Temas (compartidos con DisplayPreciosOutput)
// ─────────────────────────────────────────────────────────────
export const darkTheme = {
    bg: 'linear-gradient(135deg, #0a0a0a 0%, #08101a 50%, #0a0a0a 100%)',
    card: 'rgba(15, 23, 42, 0.7)',
    text: '#f9fafb',
    muted: '#9ca3af',
    accent: '#38bdf8',
    border: 'rgba(56, 189, 248, 0.18)',
    ok: '#4ade80',
    warn: '#fbbf24',
};

export const lightTheme = {
    bg: 'linear-gradient(135deg, #f8fafc 0%, #e0f2fe 50%, #f8fafc 100%)',
    card: 'rgba(255, 255, 255, 0.9)',
    text: '#0f172a',
    muted: '#64748b',
    accent: '#0284c7',
    border: 'rgba(2, 132, 199, 0.18)',
    ok: '#16a34a',
    warn: '#d97706',
};

/**
 * resolveTheme — Devuelve la paleta según el tema de la configuración.
 * @param {string} themeKey 'DARK' | 'LIGHT'
 */
export function resolveTheme(themeKey) {
    return themeKey === 'DARK' ? darkTheme : lightTheme;
}
