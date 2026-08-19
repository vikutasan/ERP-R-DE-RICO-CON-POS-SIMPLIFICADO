// ── Configuración y constantes del módulo de Estadísticas de Ventas ──
import {
  DollarSign, Package, TrendingUp, Percent, Target, Zap, Activity,
  BarChart2, BarChart, PieChart as PieChartIcon, Table, List
} from 'lucide-react';

export const COLOR_PALETTES = {
  vibrant:    { name: 'Vibrante',      colors: ['#FBBF24','#10B981','#3B82F6','#8B5CF6','#F97316','#06B6D4','#EF4444','#EC4899','#14B8A6','#F59E0B'] },
  ocean:      { name: 'Océano',        colors: ['#0EA5E9','#06B6D4','#14B8A6','#10B981','#22D3EE','#67E8F9','#0284C7','#0369A1','#155E75','#164E63'] },
  sunset:     { name: 'Atardecer',     colors: ['#F97316','#EF4444','#F59E0B','#EC4899','#FB923C','#FBBF24','#F472B6','#E11D48','#D97706','#DC2626'] },
  forest:     { name: 'Bosque',        colors: ['#10B981','#059669','#34D399','#6EE7B7','#047857','#A7F3D0','#065F46','#14B8A6','#0D9488','#0F766E'] },
  monochrome: { name: 'Monocromático', colors: ['#1E293B','#334155','#475569','#64748B','#94A3B8','#CBD5E1','#E2E8F0','#0F172A','#1E293B','#334155'] },
  royal:      { name: 'Royal',         colors: ['#7C3AED','#6D28D9','#8B5CF6','#A78BFA','#C4B5FD','#4C1D95','#5B21B6','#DDD6FE','#EDE9FE','#581C87'] },
};

export const DATA_PARAMETERS = [
  { id: 'revenue',    label: 'Ingresos Brutos',     icon: DollarSign, isMoney: true },
  { id: 'volume',     label: 'Volumen (Unidades)',   icon: Package,    isMoney: false },
  { id: 'margin',     label: 'Margen Absoluto ($)',  icon: TrendingUp, isMoney: true },
  { id: 'margin_pct', label: 'Margen (%)',           icon: Percent,    isMoney: true },
  { id: 'cost',       label: 'Costo Acumulado',      icon: Target,     isMoney: true },
  { id: 'avg_price',  label: 'Precio Promedio',      icon: Zap,        isMoney: true },
  { id: 'time_series_dow', label: 'Tendencia por Día', icon: Activity, isMoney: true },
];

export const CHART_TYPES = [
  { id: 'horizontal_bar', label: 'Barras Horizontales', icon: BarChart2,    desc: 'Ideal para rankings' },
  { id: 'vertical_bar',   label: 'Barras Verticales',   icon: BarChart,     desc: 'Comparativas' },
  { id: 'pie',            label: 'Circular',            icon: PieChartIcon, desc: 'Distribución %' },
  { id: 'donut',          label: 'Donut',               icon: PieChartIcon, desc: 'Con indicador central' },
  { id: 'table',          label: 'Tabla',               icon: Table,        desc: 'Análisis detallado' },
  { id: 'list',           label: 'Lista',               icon: List,         desc: 'Rankings rápidos' },
  { id: 'kpi_card',       label: 'Tarjeta KPI',         icon: TrendingUp,   desc: 'Indicador grande' },
];

export const TEMPORALITY_OPTIONS = [
  { value: 7, label: '7 Días' }, { value: 14, label: '14 Días' },
  { value: 30, label: '30 Días' }, { value: 60, label: '60 Días' },
  { value: 90, label: '90 Días' }, { value: 180, label: '6 Meses' },
  { value: 365, label: '1 Año' },
];

export const QUICK_PRESETS = [
  { label: '🏆 Top 10 Ingresos', config: { title: 'Top 10 Productos por Ingreso', dataParameter: 'revenue', sortDirection: 'desc', limit: 10, chartType: 'horizontal_bar', temporality: 30, colorPalette: 'vibrant', gridSpan: 'full' }},
  { label: '📦 Top 10 Volumen', config: { title: 'Top 10 por Volumen', dataParameter: 'volume', sortDirection: 'desc', limit: 10, chartType: 'horizontal_bar', temporality: 30, colorPalette: 'ocean', gridSpan: 'full' }},
  { label: '🥧 Categorías', config: { title: 'Distribución por Categorías', dataParameter: 'revenue', sortDirection: 'desc', limit: 15, chartType: 'donut', temporality: 30, colorPalette: 'vibrant', gridSpan: 'half' }},
  { label: '📉 Bottom 5 Margen', config: { title: 'Menor Margen', dataParameter: 'margin_pct', sortDirection: 'asc', limit: 5, chartType: 'list', temporality: 30, colorPalette: 'sunset', gridSpan: 'half' }},
  { label: '💰 Top 5 Rentables', config: { title: 'Más Rentables', dataParameter: 'margin_pct', sortDirection: 'desc', limit: 5, chartType: 'vertical_bar', temporality: 30, colorPalette: 'forest', gridSpan: 'half' }},
  { label: '📊 Tabla Completa', config: { title: 'Análisis Detallado', dataParameter: 'revenue', sortDirection: 'desc', limit: 50, chartType: 'table', temporality: 30, colorPalette: 'monochrome', gridSpan: 'full' }},
  { label: '⚡ KPI Ingreso', config: { title: 'Ingreso Total', dataParameter: 'revenue', sortDirection: 'desc', limit: 0, chartType: 'kpi_card', temporality: 30, colorPalette: 'vibrant', gridSpan: 'third' }},
  { label: '📦 KPI Volumen', config: { title: 'Volumen Total', dataParameter: 'volume', sortDirection: 'desc', limit: 0, chartType: 'kpi_card', temporality: 30, colorPalette: 'ocean', gridSpan: 'third' }},
  { label: '📈 KPI Margen', config: { title: 'Margen Promedio', dataParameter: 'margin_pct', sortDirection: 'desc', limit: 0, chartType: 'kpi_card', temporality: 30, colorPalette: 'forest', gridSpan: 'third' }},
];

export const DEFAULT_SECTIONS = [
  { id: 'dk1', title: 'Ingreso Total Bruto', dataParameter: 'revenue', sortDirection: 'desc', limit: 0, chartType: 'kpi_card', temporality: 30, colorPalette: 'vibrant', customColors: [], gridSpan: 'third', order: 0 },
  { id: 'dk2', title: 'Volumen Desplazado', dataParameter: 'volume', sortDirection: 'desc', limit: 0, chartType: 'kpi_card', temporality: 30, colorPalette: 'ocean', customColors: [], gridSpan: 'third', order: 1 },
  { id: 'dk3', title: 'Margen Promedio', dataParameter: 'margin_pct', sortDirection: 'desc', limit: 0, chartType: 'kpi_card', temporality: 30, colorPalette: 'forest', customColors: [], gridSpan: 'third', order: 2 },
  { id: 'dt1', title: 'Top 10 Productos por Ingreso', dataParameter: 'revenue', sortDirection: 'desc', limit: 10, chartType: 'horizontal_bar', temporality: 30, colorPalette: 'vibrant', customColors: [], gridSpan: 'full', order: 3 },
  { id: 'dd1', title: 'Distribución por Categorías', dataParameter: 'revenue', sortDirection: 'desc', limit: 15, chartType: 'donut', temporality: 30, colorPalette: 'vibrant', customColors: [], gridSpan: 'half', order: 4 },
  { id: 'dl1', title: 'Top 5 por Volumen', dataParameter: 'volume', sortDirection: 'desc', limit: 5, chartType: 'list', temporality: 30, colorPalette: 'ocean', customColors: [], gridSpan: 'half', order: 5 },
];

export const STORAGE_KEY = 'rderico_sales_dashboard_v2';

// ── Utilidades ──
export const generateId = () => `s${Date.now()}_${Math.random().toString(36).substr(2,6)}`;

export const getColors = (sec) => sec.colorPalette === 'custom' && sec.customColors?.length ? sec.customColors : (COLOR_PALETTES[sec.colorPalette]?.colors || COLOR_PALETTES.vibrant.colors);

export const getDataValue = (item, param) => {
  switch(param) {
    case 'revenue': return item.total_revenue || 0;
    case 'volume': return item.total_quantity || 0;
    case 'margin': return item.margin_absolute || 0;
    case 'margin_pct': return item.margin_percentage || 0;
    case 'cost': return item.total_revenue ? item.total_revenue * (1 - (item.margin_percentage||0)/100) : 0;
    case 'avg_price': return item.total_quantity > 0 ? item.total_revenue / item.total_quantity : 0;
    case 'time_series_dow': return item.total_revenue || 0;
    default: return 0;
  }
};

export const formatValue = (val, param, show) => {
  const p = DATA_PARAMETERS.find(x => x.id === param);
  if (p?.isMoney && !show) return '•••';
  if (param === 'margin_pct') return `${val.toFixed(1)}%`;
  if (param === 'volume') return val.toLocaleString();
  return `$${val.toLocaleString(undefined,{minimumFractionDigits:0,maximumFractionDigits:0})}`;
};

export const processData = (allData, sec, timeSeriesMetrics) => {
  if (sec.dataParameter === 'time_series_dow') {
    const byDow = timeSeriesMetrics?.by_day_of_week || [];
    const daysOfWeek = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    return daysOfWeek.map((name, i) => {
      const found = byDow.find(d => d.day_index === i);
      return { name, product_name: name, total_revenue: found ? found.revenue : 0 };
    });
  }

  if (!allData?.length) return [];
  if (sec.chartType === 'kpi_card') return allData;
  if (sec.chartType === 'pie' || sec.chartType === 'donut') {
    const m = {};
    allData.forEach(it => {
      const c = it.category_name || 'Sin Categoría';
      if (!m[c]) m[c] = { name: c, value: 0 };
      m[c].value += getDataValue(it, sec.dataParameter);
    });
    return Object.values(m).sort((a,b) => sec.sortDirection==='desc'? b.value-a.value : a.value-b.value).slice(0, sec.limit||15);
  }
  const sorted = [...allData].sort((a,b) => {
    const va = getDataValue(a, sec.dataParameter), vb = getDataValue(b, sec.dataParameter);
    return sec.sortDirection==='desc'? vb-va : va-vb;
  });
  return sec.limit > 0 ? sorted.slice(0, sec.limit) : sorted;
};

export const loadSections = () => { try { const r = localStorage.getItem(STORAGE_KEY); if(r) return JSON.parse(r); } catch(e){} return [...DEFAULT_SECTIONS]; };
export const saveSections = (s) => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch(e){} };
