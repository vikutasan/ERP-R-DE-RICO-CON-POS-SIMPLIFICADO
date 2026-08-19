import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Activity, ArrowLeft, TrendingUp, TrendingDown, X, Calendar,
  ChevronLeft, ChevronRight, Filter, BarChart2, Search, Download
} from 'lucide-react';
import { CONFIG } from '../pos/config';

const API_BASE = CONFIG.API_BASE_URL;

// Anchos fijos para columnas sticky (evita desalineación entre thead/tbody)
const COL_NUM_W = 44;    // columna #
const COL_PROD_W = 200;  // columna Producto
const COL_AVG_W = 72;    // columna Promedio
const COL_PROD_LEFT = COL_NUM_W;              // 44px
const COL_AVG_LEFT = COL_NUM_W + COL_PROD_W;  // 244px

const DAYS_OF_WEEK = [
  { value: null, label: 'Todos', short: 'Todos' },
  { value: 0, label: 'Lunes', short: 'Lun' },
  { value: 1, label: 'Martes', short: 'Mar' },
  { value: 2, label: 'Miércoles', short: 'Mié' },
  { value: 3, label: 'Jueves', short: 'Jue' },
  { value: 4, label: 'Viernes', short: 'Vie' },
  { value: 5, label: 'Sábado', short: 'Sáb' },
  { value: 6, label: 'Domingo', short: 'Dom' },
];

const SCOPE_OPTIONS = [
  { value: null, label: 'Todos' },
  { value: 4, label: 'Últ 4' },
  { value: 8, label: 'Últ 8' },
  { value: 12, label: 'Últ 12' },
];

const CATEGORY_ALL = '__ALL__';

// ── Utilidades ──

const formatDateHeader = (dateStr) => {
  const d = new Date(dateStr + 'T12:00:00');
  const dayName = d.toLocaleDateString('es-MX', { weekday: 'short' });
  const dayMonth = d.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit' });
  return `${dayName} ${dayMonth}`;
};

const getCellHeatColor = (value, maxValue) => {
  if (value === 0 || maxValue === 0) return 'rgba(241, 245, 249, 0.6)';
  const intensity = Math.min(value / maxValue, 1);
  if (intensity > 0.7) return `rgba(16, 185, 129, ${0.15 + intensity * 0.25})`;
  if (intensity > 0.4) return `rgba(59, 130, 246, ${0.08 + intensity * 0.15})`;
  if (intensity > 0.15) return `rgba(251, 191, 36, ${0.08 + intensity * 0.12})`;
  return 'rgba(241, 245, 249, 0.5)';
};

// ── Gráfico tipo Acción Bursátil con Zoom (SVG puro) ──

const StockChartModal = ({ product, dates, onClose }) => {
  const [viewStart, setViewStart] = useState(0);
  const [viewEnd, setViewEnd] = useState(dates?.length ? dates.length - 1 : 0);

  if (!product || !dates?.length) return null;

  const allDataPoints = dates.map(d => ({
    date: d,
    value: product.daily_sales[d] || 0
  }));

  const safeStart = Math.max(0, Math.min(viewStart, allDataPoints.length - 2));
  const safeEnd = Math.max(safeStart + 1, Math.min(viewEnd, allDataPoints.length - 1));
  const dataPoints = allDataPoints.slice(safeStart, safeEnd + 1);

  const visibleCount = safeEnd - safeStart + 1;
  const canZoomIn = visibleCount > 5;
  const canZoomOut = visibleCount < allDataPoints.length;
  const canPanLeft = safeStart > 0;
  const canPanRight = safeEnd < allDataPoints.length - 1;

  const zoomIn = () => {
    const shrink = Math.max(1, Math.floor(visibleCount * 0.2));
    setViewStart(Math.min(safeStart + shrink, safeEnd - 4));
    setViewEnd(Math.max(safeEnd - shrink, safeStart + 4));
  };
  const zoomOut = () => {
    const grow = Math.max(1, Math.floor(visibleCount * 0.25));
    setViewStart(Math.max(0, safeStart - grow));
    setViewEnd(Math.min(allDataPoints.length - 1, safeEnd + grow));
  };
  const panLeft = () => {
    const step = Math.max(1, Math.floor(visibleCount * 0.3));
    const newStart = Math.max(0, safeStart - step);
    const shift = safeStart - newStart;
    setViewStart(newStart);
    setViewEnd(safeEnd - shift);
  };
  const panRight = () => {
    const step = Math.max(1, Math.floor(visibleCount * 0.3));
    const newEnd = Math.min(allDataPoints.length - 1, safeEnd + step);
    const shift = newEnd - safeEnd;
    setViewEnd(newEnd);
    setViewStart(safeStart + shift);
  };
  const resetZoom = () => { setViewStart(0); setViewEnd(allDataPoints.length - 1); };

  const movingAvg = dataPoints.map((point, i) => {
    const globalIdx = safeStart + i;
    const ws = Math.max(0, globalIdx - 6);
    const w = allDataPoints.slice(ws, globalIdx + 1);
    return { date: point.date, value: w.reduce((s, p) => s + p.value, 0) / w.length };
  });

  const vals = dataPoints.map(p => p.value);
  const maxVal = Math.max(...vals, 1);
  const minVal = Math.min(...vals);
  const avgVal = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;

  const fH = vals.slice(0, Math.floor(vals.length / 2));
  const sH = vals.slice(Math.floor(vals.length / 2));
  const fA = fH.length ? fH.reduce((a, b) => a + b, 0) / fH.length : 0;
  const sA = sH.length ? sH.reduce((a, b) => a + b, 0) / sH.length : 0;
  const trendUp = sA >= fA;
  const trendPct = fA > 0 ? ((sA - fA) / fA * 100).toFixed(1) : '0.0';

  const cW = 800, cH = 300, pL = 55, pR = 15, pT = 15, pB = 40;
  const plotW = cW - pL - pR, plotH = cH - pT - pB;
  const yR = maxVal - minVal || 1;
  const getX = (i) => pL + (i / Math.max(dataPoints.length - 1, 1)) * plotW;
  const getY = (v) => pT + plotH - ((v - minVal) / yR) * plotH;

  const mainP = dataPoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${getX(i)},${getY(p.value)}`).join(' ');
  const areaP = `${mainP} L${getX(dataPoints.length - 1)},${pT + plotH} L${pL},${pT + plotH} Z`;
  const maP = movingAvg.map((p, i) => `${i === 0 ? 'M' : 'L'}${getX(i)},${getY(p.value)}`).join(' ');

  const ySteps = 4;
  const yGrid = Array.from({ length: ySteps + 1 }, (_, i) => ({ y: getY(minVal + (yR / ySteps) * i), label: Math.round(minVal + (yR / ySteps) * i) }));
  const xInt = Math.max(1, Math.floor(dataPoints.length / 10));

  // Mini overview
  const ovH = 32, ovW = plotW;
  const ovMax = Math.max(...allDataPoints.map(p => p.value), 1);
  const ovX = (i) => pL + (i / Math.max(allDataPoints.length - 1, 1)) * ovW;
  const ovY = (v) => ovH - (v / ovMax) * (ovH - 4);
  const ovLine = allDataPoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${ovX(i)},${ovY(p.value)}`).join(' ');
  const ovArea = `${ovLine} L${ovX(allDataPoints.length - 1)},${ovH} L${pL},${ovH} Z`;
  const wL = ovX(safeStart), wR = ovX(safeEnd);

  // Atajos de teclado: ←→ pan, +- zoom, Home reset, Esc cerrar
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); panLeft(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); panRight(); }
      else if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomIn(); }
      else if (e.key === '-') { e.preventDefault(); zoomOut(); }
      else if (e.key === 'Home') { e.preventDefault(); resetZoom(); }
      else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-md" onClick={onClose}>
      <div className="w-full max-w-4xl bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/50 p-8 stock-chart-enter" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex justify-between items-start mb-5">
          <div>
            <h2 className="text-2xl font-black text-slate-800 tracking-tight">{product.product_name}</h2>
            <p className="text-xs font-semibold text-slate-400 mt-1">
              {product.category_name} — {visibleCount === allDataPoints.length ? 'Todos los datos' : `${visibleCount} de ${allDataPoints.length} días`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center bg-slate-100 rounded-xl p-1 gap-0.5">
              <button onClick={panLeft} disabled={!canPanLeft} className="p-1.5 rounded-lg hover:bg-white disabled:opacity-30 transition-all" title="← Anterior">
                <ChevronLeft size={14} className="text-slate-500" />
              </button>
              <button onClick={zoomIn} disabled={!canZoomIn} className="px-2 py-1.5 rounded-lg hover:bg-white disabled:opacity-30 transition-all text-xs font-bold text-slate-500" title="Zoom +">+</button>
              <button onClick={resetZoom} className="px-2 py-1.5 rounded-lg hover:bg-white transition-all text-[10px] font-bold text-slate-400" title="Ver todo">1:1</button>
              <button onClick={zoomOut} disabled={!canZoomOut} className="px-2 py-1.5 rounded-lg hover:bg-white disabled:opacity-30 transition-all text-xs font-bold text-slate-500" title="Zoom −">−</button>
              <button onClick={panRight} disabled={!canPanRight} className="p-1.5 rounded-lg hover:bg-white disabled:opacity-30 transition-all" title="Siguiente →">
                <ChevronRight size={14} className="text-slate-500" />
              </button>
            </div>
            <button onClick={onClose} className="p-2.5 hover:bg-slate-100 rounded-xl transition-colors">
              <X size={20} className="text-slate-400" />
            </button>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-4 gap-3 mb-5">
          <div className="bg-slate-50 rounded-xl p-3">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Promedio</span>
            <p className="text-xl font-extralight text-slate-800 mt-0.5">{avgVal.toFixed(1)}</p>
          </div>
          <div className="bg-slate-50 rounded-xl p-3">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Máximo</span>
            <p className="text-xl font-extralight text-emerald-600 mt-0.5">{maxVal}</p>
          </div>
          <div className="bg-slate-50 rounded-xl p-3">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Mínimo</span>
            <p className="text-xl font-extralight text-red-400 mt-0.5">{minVal}</p>
          </div>
          <div className={`rounded-xl p-3 ${trendUp ? 'bg-emerald-50' : 'bg-red-50'}`}>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Tendencia</span>
            <div className="flex items-center gap-2 mt-0.5">
              {trendUp ? <TrendingUp size={16} className="text-emerald-500" /> : <TrendingDown size={16} className="text-red-400" />}
              <span className={`text-xl font-extralight ${trendUp ? 'text-emerald-600' : 'text-red-500'}`}>{trendPct}%</span>
            </div>
          </div>
        </div>

        {/* Chart */}
        <div className="bg-slate-50/50 rounded-2xl p-4 border border-slate-100">
          <svg viewBox={`0 0 ${cW} ${cH}`} className="w-full h-auto" style={{ maxHeight: '310px' }}>
            <defs>
              <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.3" />
                <stop offset="100%" stopColor="#3B82F6" stopOpacity="0.02" />
              </linearGradient>
            </defs>
            {yGrid.map((g, i) => (
              <g key={i}>
                <line x1={pL} y1={g.y} x2={cW - pR} y2={g.y} stroke="#E2E8F0" strokeWidth="1" strokeDasharray="4,4" />
                <text x={pL - 8} y={g.y + 4} textAnchor="end" fontSize="10" fill="#94A3B8" fontWeight="600">{g.label}</text>
              </g>
            ))}
            {dataPoints.filter((_, i) => i % xInt === 0 || i === dataPoints.length - 1).map((p, i) => {
              const idx = dataPoints.indexOf(p);
              const d = new Date(p.date + 'T12:00:00');
              return <text key={i} x={getX(idx)} y={cH - 5} textAnchor="middle" fontSize="9" fill="#94A3B8" fontWeight="600">{d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}</text>;
            })}
            <line x1={pL} y1={getY(avgVal)} x2={cW - pR} y2={getY(avgVal)} stroke="#F59E0B" strokeWidth="1.5" strokeDasharray="6,4" opacity="0.5" />
            <path d={areaP} fill="url(#areaGrad)" />
            <path d={mainP} fill="none" stroke="#3B82F6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            <path d={maP} fill="none" stroke="#8B5CF6" strokeWidth="1.5" strokeDasharray="4,3" opacity="0.7" />
            {dataPoints.map((p, i) => (
              <g key={i}>
                <circle cx={getX(i)} cy={getY(p.value)} r={visibleCount <= 30 ? 4 : 2.5} fill="white" stroke="#3B82F6" strokeWidth="2" className="stock-chart-dot" />
                <circle cx={getX(i)} cy={getY(p.value)} r="12" fill="transparent" className="cursor-pointer">
                  <title>{`${formatDateHeader(p.date)}: ${p.value} piezas`}</title>
                </circle>
              </g>
            ))}
          </svg>

          {/* Mini Overview */}
          <div className="mt-2 px-1">
            <svg viewBox={`0 0 ${cW} ${ovH + 2}`} className="w-full" style={{ maxHeight: '36px' }}>
              <rect x={pL} y="0" width={ovW} height={ovH} fill="#F8FAFC" rx="3" />
              <path d={ovArea} fill="rgba(59, 130, 246, 0.08)" />
              <path d={ovLine} fill="none" stroke="#94A3B8" strokeWidth="1" />
              <rect x={pL} y="0" width={Math.max(0, wL - pL)} height={ovH} fill="rgba(100,116,139,0.12)" rx="2" />
              <rect x={wR} y="0" width={Math.max(0, pL + ovW - wR)} height={ovH} fill="rgba(100,116,139,0.12)" rx="2" />
              <rect x={wL} y="0" width={Math.max(4, wR - wL)} height={ovH} fill="none" stroke="#3B82F6" strokeWidth="1.5" rx="3" opacity="0.6" />
              <line x1={wL} y1="0" x2={wL} y2={ovH} stroke="#3B82F6" strokeWidth="2" />
              <line x1={wR} y1="0" x2={wR} y2={ovH} stroke="#3B82F6" strokeWidth="2" />
            </svg>
          </div>

          {/* Legend */}
          <div className="flex items-center justify-center gap-6 mt-2">
            <div className="flex items-center gap-2">
              <div className="w-5 h-0.5 bg-blue-500 rounded-full" />
              <span className="text-[10px] font-bold text-slate-400">Ventas</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-5 h-0.5 bg-purple-500 rounded-full" style={{ backgroundImage: 'repeating-linear-gradient(90deg, #8B5CF6 0px, #8B5CF6 3px, transparent 3px, transparent 6px)' }} />
              <span className="text-[10px] font-bold text-slate-400">Prom. móvil 7d</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-5 h-0.5 bg-amber-400 rounded-full" style={{ backgroundImage: 'repeating-linear-gradient(90deg, #F59E0B 0px, #F59E0B 4px, transparent 4px, transparent 8px)' }} />
              <span className="text-[10px] font-bold text-slate-400">Promedio</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};


// ── Componente Principal ──

const ProductStatsView = ({ period, showMonetary, onEditPeriod }) => {
  const [rawData, setRawData] = useState(null);  // datos crudos del servidor
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);
  const [selectedDay, setSelectedDay] = useState(null);
  const [scope, setScope] = useState(null);
  const [showPrevYear, setShowPrevYear] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [categoryFilter, setCategoryFilter] = useState(CATEGORY_ALL);
  const [searchTerm, setSearchTerm] = useState('');

  // Fetch UNA sola vez (sin filtros de día/alcance) — los filtros se aplican client-side
  const fetchData = useCallback(async () => {
    const mexicoDateFormatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit'
    });
    // Regla de día de negocio: antes de las 5 AM México, usar "ayer" como hoy
    // (la panadería está cerrada, no hay ventas — evita columna de puros ceros)
    const now = new Date();
    const mexicoHour = parseInt(new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Mexico_City', hour: 'numeric', hour12: false
    }).format(now));
    const effectiveNow = mexicoHour < 5 ? new Date(now.getTime() - 24*60*60*1000) : now;
    const todayStr = period?.end || mexicoDateFormatter.format(effectiveNow);
    const thirtyAgo = new Date(effectiveNow.getTime() - 30 * 24 * 60 * 60 * 1000);
    const thirtyAgoStr = period?.start || mexicoDateFormatter.format(thirtyAgo);

    setIsLoading(true);
    setFetchError(null);
    try {
      const url = `${API_BASE}/analytics/product-daily-sales?start=${thirtyAgoStr}&end=${todayStr}&include_prev_year=true`;
      const resp = await fetch(url);
      if (!resp.ok) {
        const detail = resp.status === 400 ? (await resp.json())?.detail : `Error ${resp.status}`;
        throw new Error(detail || `Error del servidor (${resp.status})`);
      }
      const d = await resp.json();
      setRawData(d);
    } catch (e) {
      console.error('Error fetching product daily sales:', e);
      setFetchError(e.message || 'No se pudo conectar con el servidor');
    } finally {
      setIsLoading(false);
    }
  }, [period]); // ← solo re-fetch cuando cambia el periodo, NO con cada filtro

  useEffect(() => { fetchData(); }, [fetchData]);

  // Filtrado client-side: día de la semana + alcance (instantáneo, sin fetch)
  const data = useMemo(() => {
    if (!rawData?.dates?.length || !rawData?.products?.length) return rawData;

    let filteredDates = rawData.dates;

    // Filtrar por día de la semana
    if (selectedDay !== null) {
      filteredDates = filteredDates.filter(dateStr => {
        const d = new Date(dateStr + 'T12:00:00');
        return d.getDay() === (selectedDay + 1) % 7; // JS getDay: 0=Dom, Python: 0=Lun
      });
    }

    // Aplicar last_n (solo últimas N fechas)
    if (scope !== null && filteredDates.length > scope) {
      filteredDates = filteredDates.slice(-scope);
    }

    // Recalcular productos con fechas filtradas
    const filteredDateSet = new Set(filteredDates);
    const products = rawData.products
      .map(p => {
        const filteredSales = {};
        filteredDates.forEach(d => {
          if (p.daily_sales[d] !== undefined) filteredSales[d] = p.daily_sales[d];
        });
        const values = Object.values(filteredSales).filter(v => v > 0);
        const average = values.length > 0 ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10 : 0;
        return { ...p, daily_sales: filteredSales, average };
      })
      .filter(p => Object.keys(p.daily_sales).length > 0 || selectedDay === null)
      .sort((a, b) => b.average - a.average);

    return { dates: filteredDates, products, prev_year: rawData.prev_year, atypical_dates: rawData.atypical_dates || {} };
  }, [rawData, selectedDay, scope]);

  // Extraer categorías únicas (de datos crudos para que no cambien con filtros)
  const categories = useMemo(() => {
    if (!rawData?.products?.length) return [];
    const cats = [...new Set(rawData.products.map(p => p.category_name))].sort();
    return cats;
  }, [rawData]);

  // Filtrar productos por categoría y búsqueda
  const filteredProducts = useMemo(() => {
    if (!data?.products) return [];
    let prods = data.products;
    if (categoryFilter !== CATEGORY_ALL) {
      prods = prods.filter(p => p.category_name === categoryFilter);
    }
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase().trim();
      prods = prods.filter(p => p.product_name.toLowerCase().includes(term));
    }
    return prods;
  }, [data, categoryFilter, searchTerm]);

  const dates = data?.dates || [];
  const atypicalDates = data?.atypical_dates || {};

  // Calcular máximo global para heatmap
  const globalMax = useMemo(() => {
    if (!filteredProducts.length || !dates.length) return 1;
    let max = 0;
    filteredProducts.forEach(p => {
      dates.forEach(d => {
        const val = p.daily_sales[d] || 0;
        if (val > max) max = val;
      });
    });
    return max || 1;
  }, [filteredProducts, dates]);

  // C4: Detectar productos con caída abrupta (últimos 7 días vs promedio general)
  const dropAlerts = useMemo(() => {
    if (!rawData?.dates?.length || !rawData?.products?.length) return {};
    const allDates = rawData.dates;
    if (allDates.length < 10) return {}; // necesita suficientes datos para comparar
    const last7 = allDates.slice(-7);
    const alerts = {};
    rawData.products.forEach(p => {
      // Promedio general (todos los días con venta)
      const allVals = allDates.map(d => p.daily_sales[d] || 0).filter(v => v > 0);
      const overallAvg = allVals.length > 0 ? allVals.reduce((a, b) => a + b, 0) / allVals.length : 0;
      if (overallAvg < 1) return; // ignorar productos con promedio < 1
      // Promedio últimos 7 días
      const recentVals = last7.map(d => p.daily_sales[d] || 0);
      const recentAvg = recentVals.reduce((a, b) => a + b, 0) / recentVals.length;
      // Comparar
      const dropPct = ((recentAvg - overallAvg) / overallAvg) * 100;
      if (dropPct <= -50) {
        alerts[p.product_id] = Math.round(dropPct);
      }
    });
    return alerts;
  }, [rawData]);

  // C5: Comparativa interanual (promedio actual vs año anterior)
  const yearOverYear = useMemo(() => {
    if (!rawData?.prev_year?.products) return {};
    const prevProds = rawData.prev_year.products;
    const prevDates = rawData.prev_year.dates || [];
    if (!prevDates.length) return {};
    const deltas = {};
    // Calcular promedio del año anterior por producto
    for (const [pidStr, pData] of Object.entries(prevProds)) {
      const pid = parseInt(pidStr);
      const sales = prevDates.map(d => pData.daily_sales[d] || 0);
      const nonZero = sales.filter(v => v > 0);
      const prevAvg = nonZero.length > 0 ? nonZero.reduce((a, b) => a + b, 0) / nonZero.length : 0;
      if (prevAvg >= 1) {
        deltas[pid] = prevAvg;
      }
    }
    return deltas;
  }, [rawData]);
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Activity className="animate-spin text-blue-500" size={40} />
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
        <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center">
          <X size={32} className="text-red-400" />
        </div>
        <div>
          <p className="text-sm font-bold text-slate-700">Error al cargar datos</p>
          <p className="text-xs text-slate-400 mt-1 max-w-sm">{fetchError}</p>
        </div>
        <button
          onClick={fetchData}
          className="px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-xl hover:bg-blue-700 transition-colors shadow-md"
        >
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-[1800px] mx-auto space-y-6">
      {/* Period indicator */}
      {period && (
        <div className="flex justify-end -mt-4 mb-2">
          <button
            onClick={onEditPeriod}
            className="inline-flex items-center gap-2 bg-blue-50 hover:bg-blue-100 text-blue-700 px-3 py-1.5 rounded-lg text-xs font-bold border border-blue-100 transition-colors shadow-sm cursor-pointer group"
          >
            <Calendar size={14} className="group-hover:scale-110 transition-transform" />
            <span>{new Date(period.start).toLocaleDateString()} — {new Date(period.end).toLocaleDateString()}</span>
          </button>
        </div>
      )}

      {/* Filter Bar */}
      <div className="bg-white rounded-2xl p-5 shadow-[0_5px_20px_rgba(0,0,0,0.03)] border border-slate-100 space-y-4 dashboard-section-enter">
        {/* Nivel 1: Día de la semana */}
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider shrink-0">Día:</span>
          <div className="flex items-center bg-slate-100 p-1 rounded-xl">
            {DAYS_OF_WEEK.map(day => (
              <button
                key={day.label}
                onClick={() => { setSelectedDay(day.value); if (day.value === null) setScope(null); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  selectedDay === day.value
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                {day.short}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="ml-auto flex items-center gap-3">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Buscar producto..."
                className="pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/10 w-48"
              />
            </div>
            {/* Category filter */}
            <select
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-600 focus:outline-none focus:border-blue-400"
            >
              <option value={CATEGORY_ALL}>Todas las categorías</option>
              {categories.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            {/* CSV Export */}
            <button
              onClick={() => {
                const header = ['#', 'Producto', 'Categoría', 'Promedio', ...dates.map(d => formatDateHeader(d))];
                const rows = filteredProducts.map((p, i) => [
                  i + 1,
                  `"${p.product_name}"`,
                  `"${p.category_name || ''}"`,
                  p.average,
                  ...dates.map(d => {
                    const val = p.daily_sales[d] || 0;
                    const isAtyp = !!atypicalDates[d];
                    return isAtyp && val === 0 ? 'X*' : val;
                  })
                ]);
                const hasAtypical = Object.keys(atypicalDates).length > 0;
                const footer = hasAtypical ? ['\n"* X = Día atípico (cerrado/festivo). Los valores en estas fechas no representan demanda real."'] : [];
                const csvContent = '\uFEFF' + [header.join(','), ...rows.map(r => r.join(',')), ...footer].join('\n');
                const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `estadistica_productos_${new Date().toISOString().slice(0,10)}.csv`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="flex items-center gap-1.5 px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-bold transition-colors"
              title="Exportar datos visibles a CSV"
            >
              <Download size={14} /> CSV
            </button>
          </div>
        </div>

        {/* Nivel 2: Alcance (solo si hay un día específico seleccionado) */}
        {selectedDay !== null && (
          <div className="flex items-center gap-3 pl-12 dashboard-section-enter">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider shrink-0">
              Mostrando: <span className="text-blue-600">{DAYS_OF_WEEK.find(d => d.value === selectedDay)?.label}</span>
            </span>
            <span className="text-slate-300">|</span>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Alcance:</span>
            <div className="flex items-center bg-slate-100 p-1 rounded-xl">
              {SCOPE_OPTIONS.map(opt => (
                <button
                  key={opt.label}
                  onClick={() => setScope(opt.value)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    scope === opt.value
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-slate-400 hover:text-slate-600'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {/* TODO: Habilitar cuando se implemente la renderización de columnas comparativas del año anterior
            <span className="text-slate-300 ml-2">|</span>
            <button
              onClick={() => setShowPrevYear(!showPrevYear)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                showPrevYear
                  ? 'bg-amber-50 border-amber-200 text-amber-700'
                  : 'border-slate-200 text-slate-400 hover:bg-slate-50 hover:text-slate-600'
              }`}
            >
              📅 vs. Año Anterior
            </button>
            */}
          </div>
        )}
      </div>

      {/* Results summary + Pareto + Export */}
      <div className="flex items-center justify-between px-1 flex-wrap gap-2">
        <div className="flex items-center gap-4 flex-wrap">
          <span className="text-xs font-bold text-slate-400">
            {filteredProducts.length} productos • {dates.length} {selectedDay !== null ? DAYS_OF_WEEK.find(d => d.value === selectedDay)?.label + 's' : 'días'}
          </span>
          {selectedDay !== null && (
            <span className="text-[10px] font-bold text-blue-500 bg-blue-50 px-2.5 py-1 rounded-full">
              Filtro: {DAYS_OF_WEEK.find(d => d.value === selectedDay)?.label}
              {scope ? ` (Últ ${scope})` : ''}
            </span>
          )}
          {/* Pareto ABC indicator */}
          {filteredProducts.length >= 5 && (() => {
            const sorted = [...filteredProducts].sort((a, b) => b.average - a.average);
            const totalAvg = sorted.reduce((s, p) => s + p.average, 0);
            if (totalAvg === 0) return null;
            const top20count = Math.max(1, Math.ceil(sorted.length * 0.2));
            const top20sum = sorted.slice(0, top20count).reduce((s, p) => s + p.average, 0);
            const pct = Math.round((top20sum / totalAvg) * 100);
            return (
              <span className="text-[10px] font-bold text-purple-600 bg-purple-50 px-2.5 py-1 rounded-full flex items-center gap-1.5" title={`Los primeros ${top20count} productos (20%) generan el ${pct}% del volumen promedio`}>
                <span>📊 Top {top20count} → {pct}%</span>
                <span className="w-12 h-1.5 bg-purple-200 rounded-full overflow-hidden inline-block">
                  <span className="h-full bg-purple-500 rounded-full block" style={{width: `${pct}%`}} />
                </span>
              </span>
            );
          })()}
          {/* Drop alerts count */}
          {Object.keys(dropAlerts).length > 0 && (
            <span className="text-[10px] font-bold text-red-600 bg-red-50 px-2.5 py-1 rounded-full" title="Productos con caída >50% en los últimos 7 días">
              ⚠️ {Object.keys(dropAlerts).length} en caída
            </span>
          )}
        </div>
        {filteredProducts.length > 0 && (
          <button
            onClick={() => {
              // Generar CSV client-side
              const headers = ['#', 'Producto', 'Categoría', 'Promedio', ...dates.map(d => formatDateHeader(d))];
              const rows = filteredProducts.map((p, i) => [
                i + 1,
                `"${p.product_name}"`,
                `"${p.category_name}"`,
                p.average,
                ...dates.map(d => p.daily_sales[d] || 0)
              ]);
              const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
              const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `estadistica_productos_${new Date().toISOString().split('T')[0]}.csv`;
              a.click();
              URL.revokeObjectURL(url);
            }}
            className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-xs font-bold border border-emerald-200 transition-colors"
          >
            <Download size={14} /> Exportar CSV
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-[0_5px_20px_rgba(0,0,0,0.03)] border border-slate-100 overflow-hidden dashboard-section-enter" style={{ animationDelay: '100ms' }}>
        <div className="overflow-auto max-h-[70vh] product-stats-scroll">
          <table className="w-full text-left text-sm border-collapse">
            <thead className="sticky top-0 z-20">
              <tr className="bg-slate-800 text-white">
                {/* Fixed columns with calculated widths */}
                <th className="p-3 text-[10px] font-bold uppercase tracking-wider sticky left-0 z-30 bg-slate-800" style={{width: COL_NUM_W, minWidth: COL_NUM_W}}>#</th>
                <th className="p-3 text-[10px] font-bold uppercase tracking-wider sticky z-30 bg-slate-800" style={{left: COL_PROD_LEFT, width: COL_PROD_W, minWidth: COL_PROD_W}}>Producto</th>
                <th className="p-3 text-[10px] font-bold uppercase tracking-wider text-center sticky z-30 bg-slate-800" style={{left: COL_AVG_LEFT, width: COL_AVG_W, minWidth: COL_AVG_W}}>
                  <div className="flex flex-col items-center">
                    <span>Prom</span>
                    <span className="text-[8px] font-semibold text-slate-400 normal-case">diario</span>
                  </div>
                </th>
                {/* Dynamic date columns */}
                {dates.map(d => {
                  const isAtypical = !!atypicalDates[d];
                  const atypicalInfo = atypicalDates[d];
                  return (
                    <th key={d} className="p-2 text-[10px] font-bold uppercase tracking-wider text-center min-w-[70px] bg-slate-800">
                      <div className="flex flex-col items-center leading-tight relative">
                        <span>{formatDateHeader(d).split(' ')[0]}</span>
                        <span className="text-[9px] font-semibold text-slate-400">{formatDateHeader(d).split(' ')[1]}</span>
                        {isAtypical && (
                          <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-red-400" title={atypicalInfo?.holiday || atypicalInfo?.notes || 'Día atípico'} />
                        )}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={3 + dates.length} className="text-center py-16 text-slate-400 text-sm italic">
                    {searchTerm ? 'No se encontraron productos con ese nombre' : 'Sin datos de ventas para el periodo seleccionado'}
                  </td>
                </tr>
              ) : (
                filteredProducts.map((product, i) => {
                  return (
                    <tr key={product.product_id} className="hover:bg-blue-50/30 transition-colors group">
                      {/* # */}
                      <td className="p-3 sticky left-0 z-10 bg-white group-hover:bg-blue-50/30 transition-colors" style={{width: COL_NUM_W, minWidth: COL_NUM_W}}>
                        <span className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-500">
                          {i + 1}
                        </span>
                      </td>
                      {/* Product Name (clickable) */}
                      <td className="p-3 sticky z-10 bg-white group-hover:bg-blue-50/30 transition-colors" style={{left: COL_PROD_LEFT, width: COL_PROD_W, minWidth: COL_PROD_W}}>
                        <button
                          onClick={() => setSelectedProduct(product)}
                          className="text-left group/name"
                        >
                          <span className="font-bold text-slate-700 group-hover/name:text-blue-600 transition-colors text-sm truncate block max-w-[180px]">
                            {product.product_name}
                          </span>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-slate-400 font-semibold">
                              {product.category_name}
                            </span>
                            {dropAlerts[product.product_id] && (
                              <span
                                className="text-[9px] font-black text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-full leading-none"
                                title={`Caída de ${Math.abs(dropAlerts[product.product_id])}% en los últimos 7 días vs su promedio del periodo`}
                              >
                                ↓ {dropAlerts[product.product_id]}%
                              </span>
                            )}
                          </div>
                        </button>
                      </td>
                      {/* Average + YoY delta */}
                      <td className="p-3 text-center sticky z-10 bg-white group-hover:bg-blue-50/30 transition-colors" style={{left: COL_AVG_LEFT, width: COL_AVG_W, minWidth: COL_AVG_W}}>
                        <span className="font-black text-blue-600 text-sm">{product.average}</span>
                        {yearOverYear[product.product_id] != null && (() => {
                          const prevAvg = yearOverYear[product.product_id];
                          const delta = ((product.average - prevAvg) / prevAvg) * 100;
                          if (Math.abs(delta) < 5) return null; // ignore insignificant changes
                          const isUp = delta > 0;
                          return (
                            <span
                              className={`block text-[8px] font-bold mt-0.5 ${isUp ? 'text-emerald-600' : 'text-red-500'}`}
                              title={`Año anterior: ${prevAvg.toFixed(1)} prom/día`}
                            >
                              {isUp ? '↑' : '↓'} {Math.abs(Math.round(delta))}% vs '25
                            </span>
                          );
                        })()}
                      </td>
                      {/* Daily values */}
                      {dates.map(d => {
                        const val = product.daily_sales[d] || 0;
                        const isAtypical = !!atypicalDates[d];
                        const atypicalInfo = atypicalDates[d];
                        const bgColor = isAtypical && val === 0
                          ? undefined  // manejado por className
                          : getCellHeatColor(val, globalMax);
                        return (
                          <td
                            key={d}
                            className={`p-2 text-center transition-colors ${isAtypical && val === 0 ? 'atypical-cell' : ''}`}
                            style={bgColor ? { backgroundColor: bgColor } : undefined}
                            title={isAtypical ? `⚠️ ${atypicalInfo?.holiday || atypicalInfo?.notes || 'Día atípico'}` : undefined}
                          >
                            <span className={`text-xs font-bold ${
                              isAtypical && val === 0 ? 'text-slate-400 italic' 
                              : val === 0 ? 'text-slate-300' 
                              : 'text-slate-700'
                            }`}>
                              {isAtypical && val === 0 ? '✕' : val === 0 ? '—' : val}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Stock Chart Modal */}
      {selectedProduct && (
        <StockChartModal
          product={selectedProduct}
          dates={dates}
          onClose={() => setSelectedProduct(null)}
        />
      )}
    </div>
  );
};

export default ProductStatsView;
