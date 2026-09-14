import { CONFIG } from '../../shared/config.js';

// v19 (Fase 19.3): URL del API desde la fuente unica de verdad.
const API_BASE = CONFIG.API_BASE_URL;

export const INITIAL_CATEGORIES = [
    { name: "1.-EMPAQUE Y PAN BLANCO", icon: "🥖", visionEnabled: true },
    { name: "2.-A - B", icon: "🍪", visionEnabled: true },
    { name: "3.-C - D", icon: "🍩", visionEnabled: true },
    { name: "4.-E - K", icon: "🥐", visionEnabled: true },
    { name: "5.-L - M", icon: "🧁", visionEnabled: true },
    { name: "6.-N - P", icon: "🥧", visionEnabled: true },
    { name: "7.-R - S", icon: "🍰", visionEnabled: true },
    { name: "8.-T - Z", icon: "🥨", visionEnabled: true },
    { name: "17.-ROSCA DE REYES", icon: "👑", visionEnabled: true },
    { name: "9.-LACTEOS", icon: "🥛", visionEnabled: false },
    { name: "10.-SOBRE PEDIDO", icon: "🎂", visionEnabled: false },
    { name: "11.-ESPORADICOS", icon: "🎁", visionEnabled: false },
    { name: "12.-CAFES Y CHOCOLATES", icon: "☕", visionEnabled: false },
    { name: "13.-SOUVENIRS", icon: "🛍️", visionEnabled: false },
    { name: "14.-HELADOS", icon: "🍨", visionEnabled: false },
    { name: "15.-PALETAS", icon: "🍭", visionEnabled: false },
    { name: "16.-AGUAS Y MALTEADAS", icon: "🥤", visionEnabled: false }
];

export const getProductEmoji = (p) => {
    const name = (p.name || '').toUpperCase();
    const categoryObj = p.category;
    const catName = (typeof categoryObj === 'string' ? categoryObj : (categoryObj?.name || 'GENERAL')).toUpperCase();
    
    if (catName.includes('LACTEOS') || name.includes('LECHE')) return '🥛';
    if (name.includes('CAF')) return '☕';
    if (name.includes('AGUA')) return '💧';
    if (name.includes('HELADO')) return '🍨';
    if (name.includes('PALETA')) return '🍭';
    if (name.includes('MALTEADA')) return '🥤';
    if (name.includes('PASTEL') || name.includes('TARTA')) return '🍰';
    if (name.includes('ROSCA')) return '👑';
    if (name.includes('DONA')) return '🍩';
    if (name.includes('CONCHA')) return '🥯';
    if (name.includes('BOLILLO') || name.includes('TELERA') || name.includes('BAGUETTE')) return '🥖';
    if (name.includes('CROISSANT') || name.includes('CUERNITO')) return '🥐';
    if (name.includes('GALLETA') || name.includes('POLVORON')) return '🍪';
    if (name.includes('MUFFIN') || name.includes('MAGDALENA')) return '🧁';
    if (catName.includes('PAN')) return '🍞';
    return '📦';
};

// Fallback hardcoded (se usa si no hay config en BD)
export const DEFAULT_TERMINALS = [
    { id: 'T6', name: 'Terminal 6', icon: '🖥️' },
    { id: 'T5', name: 'Terminal 5', icon: '🖥️' },
    { id: 'T4', name: 'Terminal 4', icon: '🖥️' },
    { id: 'T3', name: 'Terminal 3', icon: '🖥️' },
    { id: 'T2', name: 'Terminal 2', icon: '🖥️' },
    { id: 'CAJA', name: 'CAJA', icon: '/assets/pos_register.png' }
];

// Referencia mutable — se actualiza dinámicamente al cargar config
export let terminals = [...DEFAULT_TERMINALS];

// Función para cargar configuración desde BD
export async function loadTerminalsConfig() {
    try {
        const res = await fetch(`${API_BASE}/settings/pos_terminals_config`, { cache: 'no-store' });
        if (res.ok) {
            const data = await res.json();
            const parsed = JSON.parse(data.value);
            if (Array.isArray(parsed) && parsed.length > 0) {
                terminals.length = 0;
                parsed.forEach(t => terminals.push(t));
                return parsed;
            }
        }
    } catch (e) {
        console.warn('Using default terminals config:', e);
    }
    return DEFAULT_TERMINALS;
}

// Función para guardar configuración en BD
export async function saveTerminalsConfig(newTerminals) {
    const res = await fetch(`${API_BASE}/settings/pos_terminals_config`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: JSON.stringify(newTerminals) })
    });
    if (res.ok) {
        terminals.length = 0;
        newTerminals.forEach(t => terminals.push(t));
        return true;
    }
    return false;
}
