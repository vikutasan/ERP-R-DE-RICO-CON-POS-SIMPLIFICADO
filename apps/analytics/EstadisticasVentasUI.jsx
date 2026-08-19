import React, { useState, useEffect, useMemo } from 'react';
import {
  Activity, BarChart2, BarChart, PieChart as PieChartIcon,
  Lock, Eye, EyeOff, Settings, Plus, Trash2, Edit3, Copy,
  ChevronUp, ChevronDown, ArrowLeft, TrendingUp, TrendingDown,
  List, Table, Zap, Target, DollarSign, Package, Percent, X, Check,
  LayoutDashboard, Sparkles, Calendar
} from 'lucide-react';
import { CONFIG } from '../pos/config';
import ProductStatsView from './ProductStatsView';
import {
  COLOR_PALETTES, DATA_PARAMETERS, CHART_TYPES, TEMPORALITY_OPTIONS,
  QUICK_PRESETS, DEFAULT_SECTIONS, STORAGE_KEY,
  generateId, getColors, getDataValue, formatValue, processData,
  loadSections, saveSections
} from './analyticsConfig';

const API_BASE = CONFIG.API_BASE_URL;

// ── WIDGETS ────────────────────────────────────────────────

const HorizontalBarWidget = ({ data, colors, showMonetary, section }) => {
  const maxVal = Math.max(...data.map(d => getDataValue(d, section.dataParameter)), 1);
  return (
    <div className="flex flex-col gap-4 w-full">
      {data.map((item, i) => {
        const val = getDataValue(item, section.dataParameter);
        const w = (val / maxVal) * 100;
        const color = colors[i % colors.length];
        return (
          <div key={i} className="group flex flex-col gap-1.5 w-full">
            <div className="flex justify-between text-sm font-semibold">
              <span className="text-slate-600 truncate pr-4">{item.product_name || item.name}</span>
              <span className="shrink-0 font-bold" style={{color}}>{formatValue(val, section.dataParameter, showMonetary)}</span>
            </div>
            <div className="w-full bg-slate-50 h-5 rounded-md overflow-hidden relative">
              <div className="h-full rounded-md transition-all duration-700 ease-out group-hover:brightness-110" style={{width:`${Math.max(2,w)}%`, backgroundColor: color}} />
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-end pr-2">
                <span className="text-[10px] font-bold text-white drop-shadow">{formatValue(val, section.dataParameter, showMonetary)}</span>
              </div>
            </div>
          </div>
        );
      })}
      {data.length === 0 && <p className="text-slate-400 text-sm italic text-center py-8">Sin datos disponibles</p>}
    </div>
  );
};

const VerticalBarWidget = ({ data, colors, showMonetary, section }) => {
  const maxVal = Math.max(...data.map(d => getDataValue(d, section.dataParameter)), 1);
  return (
    <div className="flex items-end gap-2 h-52 w-full pt-6">
      {data.map((item, i) => {
        const val = getDataValue(item, section.dataParameter);
        const h = (val / maxVal) * 100;
        const color = colors[i % colors.length];
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-1 group relative min-w-0">
            <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-6 bg-slate-800 text-white text-[9px] font-bold px-2 py-1 rounded-md whitespace-nowrap z-10">
              {formatValue(val, section.dataParameter, showMonetary)}
            </div>
            <div className="w-full rounded-t-md transition-all duration-700 ease-out group-hover:brightness-110" style={{height:`${Math.max(4,h)}%`, backgroundColor: color}} />
            <span className="text-[9px] text-slate-400 font-semibold truncate w-full text-center">{(item.product_name||item.name||'').slice(0,8)}</span>
          </div>
        );
      })}
    </div>
  );
};

const PieChartWidget = ({ data, colors, showMonetary, section }) => {
  const total = data.reduce((a, d) => a + (d.value || 0), 0);
  if (total === 0) return <p className="text-slate-400 text-sm italic text-center py-8">Sin datos</p>;
  let cumPct = 0;
  const gradientParts = data.map((d, i) => {
    const pct = (d.value / total) * 100;
    const start = cumPct;
    cumPct += pct;
    return `${colors[i % colors.length]} ${start}% ${cumPct}%`;
  });
  const gradient = `conic-gradient(${gradientParts.join(', ')})`;
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="w-44 h-44 rounded-full shadow-inner" style={{background: gradient}} />
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 w-full">
        {data.map((d, i) => (
          <div key={i} className="flex items-center gap-2 group">
            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{backgroundColor: colors[i%colors.length]}} />
            <div className="flex flex-col min-w-0">
              <span className="text-[11px] font-semibold text-slate-500 truncate">{d.name}</span>
              <span className="text-[10px] font-bold text-slate-700">{showMonetary ? formatValue(d.value, section.dataParameter, true) : '•••'}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const DonutChartWidget = ({ data, colors, showMonetary, section }) => {
  const total = data.reduce((a, d) => a + (d.value || 0), 0);
  if (total === 0) return <p className="text-slate-400 text-sm italic text-center py-8">Sin datos</p>;
  let cumPct = 0;
  const gradientParts = data.map((d, i) => {
    const pct = (d.value / total) * 100;
    const start = cumPct;
    cumPct += pct;
    return `${colors[i % colors.length]} ${start}% ${cumPct}%`;
  });
  const gradient = `conic-gradient(${gradientParts.join(', ')})`;
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative w-44 h-44">
        <div className="w-full h-full rounded-full shadow-inner" style={{background: gradient}} />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-24 h-24 rounded-full bg-white shadow-sm flex items-center justify-center">
            <span className="text-lg font-bold text-slate-700">{showMonetary ? formatValue(total, section.dataParameter, true) : '•••'}</span>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 w-full">
        {data.map((d, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{backgroundColor: colors[i%colors.length]}} />
            <div className="flex flex-col min-w-0">
              <span className="text-[11px] font-semibold text-slate-500 truncate">{d.name}</span>
              <span className="text-[10px] font-bold text-slate-700">{showMonetary ? `${((d.value/total)*100).toFixed(1)}%` : '•••'}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ── Table, List, KPI widgets + Section Router ──

const TableWidget = ({ data, colors, showMonetary, section }) => {
  const [sortKey, setSortKey] = useState(section.dataParameter);
  const [sortDir, setSortDir] = useState('desc');
  const handleSort = (k) => { if(sortKey===k) setSortDir(d=>d==='desc'?'asc':'desc'); else { setSortKey(k); setSortDir('desc'); } };
  const sorted = [...data].sort((a,b) => { const va=getDataValue(a,sortKey), vb=getDataValue(b,sortKey); return sortDir==='desc'?vb-va:va-vb; });
  return (
    <div className="overflow-auto max-h-80 custom-scrollbar-light rounded-xl">
      <table className="w-full text-left text-sm border-collapse">
        <thead className="bg-slate-50 sticky top-0 z-10">
          <tr>
            <th className="p-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider w-8">#</th>
            <th className="p-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider cursor-pointer hover:text-blue-600" onClick={()=>handleSort('revenue')}>Producto</th>
            <th className="p-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Categoría</th>
            <th className="p-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right cursor-pointer hover:text-blue-600" onClick={()=>handleSort(section.dataParameter)}>
              {DATA_PARAMETERS.find(p=>p.id===section.dataParameter)?.label || 'Valor'}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {sorted.map((item, i) => (
            <tr key={i} className="hover:bg-slate-50/80 transition-colors">
              <td className="p-3"><span className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white" style={{backgroundColor:colors[i%colors.length]}}>{i+1}</span></td>
              <td className="p-3 font-bold text-slate-700 truncate max-w-[200px]">{item.product_name}</td>
              <td className="p-3 text-slate-500 font-medium text-xs">{item.category_name||'—'}</td>
              <td className="p-3 text-right font-bold" style={{color: showMonetary||!DATA_PARAMETERS.find(p=>p.id===section.dataParameter)?.isMoney ? colors[0] : '#94A3B8'}}>
                {formatValue(getDataValue(item, section.dataParameter), section.dataParameter, showMonetary)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const ListWidget = ({ data, colors, showMonetary, section }) => {
  const maxVal = Math.max(...data.map(d => getDataValue(d, section.dataParameter)), 1);
  return (
    <div className="flex flex-col gap-3">
      {data.map((item, i) => {
        const val = getDataValue(item, section.dataParameter);
        const w = (val / maxVal) * 100;
        return (
          <div key={i} className="flex items-center gap-3 group">
            <span className="text-2xl font-extralight text-slate-300 w-7 text-right">{i+1}</span>
            <div className="flex-1 min-w-0">
              <div className="flex justify-between items-baseline mb-1">
                <span className="text-sm font-semibold text-slate-600 truncate pr-2">{item.product_name||item.name}</span>
                <span className="text-xs font-bold shrink-0" style={{color:colors[i%colors.length]}}>{formatValue(val, section.dataParameter, showMonetary)}</span>
              </div>
              <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-700" style={{width:`${Math.max(3,w)}%`, backgroundColor:colors[i%colors.length]}} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

const KPICardWidget = ({ data, colors, showMonetary, section }) => {
  let mainValue = 0;
  if (section.dataParameter === 'margin_pct' || section.dataParameter === 'avg_price') {
    const vals = data.map(d => getDataValue(d, section.dataParameter)).filter(v => v > 0);
    mainValue = vals.length ? vals.reduce((a,b)=>a+b,0) / vals.length : 0;
  } else {
    mainValue = data.reduce((a, d) => a + getDataValue(d, section.dataParameter), 0);
  }
  // Trend: compare first half vs second half
  const half = Math.floor(data.length / 2);
  const firstHalf = data.slice(0, half).reduce((a,d) => a + getDataValue(d, section.dataParameter), 0);
  const secondHalf = data.slice(half).reduce((a,d) => a + getDataValue(d, section.dataParameter), 0);
  const trendUp = secondHalf >= firstHalf;
  return (
    <div className="flex items-center justify-between h-full">
      <div className="flex flex-col">
        <span className="text-slate-500 text-xs font-semibold mb-2">{section.title}</span>
        <span className="text-4xl font-extralight tracking-tight text-slate-800 leading-none">
          {formatValue(mainValue, section.dataParameter, showMonetary)}
        </span>
        <div className="flex items-center gap-1 mt-2">
          {trendUp ? <TrendingUp size={14} className="text-emerald-500" /> : <TrendingDown size={14} className="text-red-400" />}
          <span className={`text-[10px] font-bold ${trendUp ? 'text-emerald-500' : 'text-red-400'}`}>
            {trendUp ? 'Tendencia positiva' : 'Tendencia a la baja'}
          </span>
        </div>
      </div>
      <div className="flex items-end gap-1.5 h-14 opacity-60">
        <div className="w-3 rounded-t-sm" style={{height:'40%', backgroundColor:colors[0]}} />
        <div className="w-3 rounded-t-sm" style={{height:'70%', backgroundColor:colors[1]||colors[0]}} />
        <div className="w-3 rounded-t-sm" style={{height:'100%', backgroundColor:colors[2]||colors[0]}} />
      </div>
    </div>
  );
};

const DashboardSection = ({ section, allData, showMonetary, index, timeSeriesMetrics }) => {
  const data = useMemo(() => processData(allData, section, timeSeriesMetrics), [allData, section, timeSeriesMetrics]);
  const colors = getColors(section);
  const props = { data, colors, showMonetary, section };
  const Widget = { horizontal_bar: HorizontalBarWidget, vertical_bar: VerticalBarWidget, pie: PieChartWidget, donut: DonutChartWidget, table: TableWidget, list: ListWidget, kpi_card: KPICardWidget }[section.chartType] || HorizontalBarWidget;
  const isKPI = section.chartType === 'kpi_card';
  return (
    <div className="bg-white rounded-2xl shadow-[0_5px_20px_rgba(0,0,0,0.03)] border border-slate-100 p-6 flex flex-col dashboard-section-enter" style={{animationDelay:`${index*100}ms`}}>
      {!isKPI && <h3 className="text-slate-800 font-bold text-base mb-5">{section.title}</h3>}
      <div className="flex-1"><Widget {...props} /></div>
    </div>
  );
};

// ── SECTION EDITOR MODAL ──────────────────────────────────

const SectionEditorModal = ({ section, onSave, onClose, allData }) => {
  const [form, setForm] = useState(section || {
    title: '', dataParameter: 'revenue', sortDirection: 'desc', limit: 10,
    chartType: 'horizontal_bar', temporality: 30, colorPalette: 'vibrant',
    customColors: [], gridSpan: 'full'
  });
  const upd = (k, v) => setForm(f => ({...f, [k]: v}));
  const previewSection = { ...form, id: 'preview' };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/20 backdrop-blur-md" onClick={onClose}>
      <div className="w-full max-w-5xl max-h-[90vh] overflow-auto bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/50 p-8" onClick={e=>e.stopPropagation()}>
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-slate-800">{section ? 'Editar Sección' : 'Nueva Sección'}</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl transition-colors"><X size={20} className="text-slate-400"/></button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Form */}
          <div className="space-y-5">
            {/* Title */}
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Título de la Sección</label>
              <input value={form.title} onChange={e=>upd('title',e.target.value)} placeholder="Ej: Top 10 Productos por Ingreso"
                className="w-full border border-slate-200 bg-slate-50 rounded-xl p-3 text-sm font-semibold text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-500/10" />
            </div>

            {/* Data Parameter */}
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Parámetro de Datos</label>
              <div className="grid grid-cols-3 gap-2">
                {DATA_PARAMETERS.map(p => {
                  const Icon = p.icon;
                  return (
                    <button key={p.id} onClick={()=>upd('dataParameter',p.id)}
                      className={`flex items-center gap-2 p-2.5 rounded-xl text-xs font-bold transition-all border ${form.dataParameter===p.id ? 'bg-blue-50 border-blue-300 text-blue-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
                      <Icon size={14}/> {p.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Chart Type */}
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Tipo de Gráfico</label>
              <div className="grid grid-cols-4 gap-2">
                {CHART_TYPES.map(ct => {
                  const Icon = ct.icon;
                  return (
                    <button key={ct.id} onClick={()=>upd('chartType',ct.id)}
                      className={`flex flex-col items-center gap-1 p-3 rounded-xl text-[10px] font-bold transition-all border ${form.chartType===ct.id ? 'bg-blue-50 border-blue-300 text-blue-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
                      <Icon size={18}/> {ct.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Row: Sort + Limit + Temporality */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Orden</label>
                <select value={form.sortDirection} onChange={e=>upd('sortDirection',e.target.value)} className="w-full border border-slate-200 bg-slate-50 rounded-xl p-2.5 text-xs font-semibold text-slate-700 focus:outline-none">
                  <option value="desc">Mayor → Menor</option>
                  <option value="asc">Menor → Mayor</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Límite</label>
                <select value={form.limit} onChange={e=>upd('limit',Number(e.target.value))} className="w-full border border-slate-200 bg-slate-50 rounded-xl p-2.5 text-xs font-semibold text-slate-700 focus:outline-none">
                  <option value={0}>Todos</option>
                  {[3,5,7,10,15,20,25,50].map(n=><option key={n} value={n}>{n} items</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Temporalidad</label>
                <select value={form.temporality} onChange={e=>upd('temporality',Number(e.target.value))} className="w-full border border-slate-200 bg-slate-50 rounded-xl p-2.5 text-xs font-semibold text-slate-700 focus:outline-none">
                  {TEMPORALITY_OPTIONS.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
            </div>

            {/* Grid Span */}
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Tamaño en Dashboard</label>
              <div className="flex gap-2">
                {[{v:'third',l:'Tercio'},{v:'half',l:'Medio'},{v:'full',l:'Completo'}].map(s=>(
                  <button key={s.v} onClick={()=>upd('gridSpan',s.v)} className={`flex-1 p-2.5 rounded-xl text-xs font-bold border transition-all ${form.gridSpan===s.v?'bg-blue-50 border-blue-300 text-blue-700':'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>{s.l}</button>
                ))}
              </div>
            </div>

            {/* Color Palette */}
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Paleta de Colores</label>
              <div className="grid grid-cols-3 gap-2">
                {Object.entries(COLOR_PALETTES).map(([k, pal]) => (
                  <button key={k} onClick={()=>upd('colorPalette',k)} className={`flex items-center gap-2 p-2.5 rounded-xl border transition-all ${form.colorPalette===k?'border-blue-300 bg-blue-50':'border-slate-200 hover:bg-slate-50'}`}>
                    <div className="flex gap-0.5">{pal.colors.slice(0,4).map((c,j)=><div key={j} className="w-3 h-3 rounded-full" style={{backgroundColor:c}}/>)}</div>
                    <span className="text-[10px] font-bold text-slate-600">{pal.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Preview */}
          <div className="flex flex-col">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">Vista Previa</label>
            <div className="flex-1 border-2 border-dashed border-slate-200 rounded-2xl p-4 bg-slate-50/50 min-h-[300px]">
              {(allData?.length > 0 || form.dataParameter === 'time_series_dow') ? (
                <DashboardSection section={previewSection} allData={allData} showMonetary={true} index={0} timeSeriesMetrics={timeSeriesMetrics} />
              ) : (
                <div className="flex items-center justify-center h-full text-slate-400 text-sm">Cargando datos para preview...</div>
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 mt-6 pt-6 border-t border-slate-100">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 transition-colors">Cancelar</button>
          <button onClick={()=>{if(!form.title.trim())return;onSave({...form,id:form.id||generateId(),customColors:form.customColors||[],order:form.order||0});}} className="flex-1 py-3 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700 transition-colors shadow-md shadow-blue-600/20 flex items-center justify-center gap-2"><Check size={16}/> Guardar Sección</button>
        </div>
      </div>
    </div>
  );
};

// ── SALES KPIs VIEW ───────────────────────────────────────

const SalesKPIsView = ({ allData, showMonetary, ticketMetrics, timeSeriesMetrics, period, onEditPeriod }) => {
  // Métricas principales memoizadas
  const { totalRev, totalUnits, avgMargin, totalTickets, ticketAvg, totalCost } = useMemo(() => {
    const totalRev = allData.reduce((a, d) => a + (d.total_revenue||0), 0);
    const totalUnits = allData.reduce((a, d) => a + (d.total_quantity||0), 0);
    const validMargins = allData.filter(p => typeof p.margin_percentage === 'number' && p.margin_percentage > 0);
    const avgMargin = validMargins.length ? validMargins.reduce((a,p) => a + p.margin_percentage, 0) / validMargins.length : 0;
    const totalTickets = ticketMetrics?.total_tickets || 0;
    const ticketAvg = totalTickets > 0 ? totalRev / totalTickets : 0;
    const totalCost = allData.reduce((a,d) => a + ((d.total_revenue||0) * (1 - (d.margin_percentage||0)/100)), 0);
    return { totalRev, totalUnits, avgMargin, totalTickets, ticketAvg, totalCost };
  }, [allData, ticketMetrics]);

  // Time Series memoizada
  const { dowChartData, maxDowRev } = useMemo(() => {
    const byDate = timeSeriesMetrics?.by_date || [];
    const maxDowRev = Math.max(...byDate.map(d => d.revenue), 1);
    const dowChartData = byDate.map(d => {
      const dateObj = new Date(d.date + "T12:00:00"); 
      const dayName = dateObj.toLocaleDateString('es-MX', { weekday: 'short' });
      const dayNum = dateObj.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit' });
      return { name: `${dayName} ${dayNum}`, revenue: d.revenue, quantity: d.quantity || 0 };
    });
    return { dowChartData, maxDowRev };
  }, [timeSeriesMetrics]);

  // Rankings y categorías memoizados
  const { topRevenue, topVolume, bottomMargin, catData, catTotal } = useMemo(() => {
    const topRevenue = [...allData].sort((a,b) => b.total_revenue - a.total_revenue).slice(0,10);
    const topVolume = [...allData].sort((a,b) => b.total_quantity - a.total_quantity).slice(0,10);
    const bottomMargin = [...allData].filter(p => p.margin_percentage > 0).sort((a,b) => a.margin_percentage - b.margin_percentage).slice(0,5);
    const catMap = {};
    allData.forEach(it => {
      const c = it.category_name || 'Sin Categoría';
      if (!catMap[c]) catMap[c] = { name: c, value: 0 };
      catMap[c].value += it.total_revenue || 0;
    });
    const catData = Object.values(catMap).sort((a,b) => b.value - a.value);
    const catTotal = catData.reduce((a,d) => a + d.value, 0);
    return { topRevenue, topVolume, bottomMargin, catData, catTotal };
  }, [allData]);

  const COLS = COLOR_PALETTES.vibrant.colors;
  const OCEAN = COLOR_PALETTES.ocean.colors;


  const KPICard = ({ label, value, subtitle, color, icon: Icon }) => (
    <div className="bg-white rounded-2xl p-6 shadow-[0_5px_20px_rgba(0,0,0,0.03)] border border-slate-100 flex flex-col justify-between dashboard-section-enter">
      <div className="flex items-start justify-between mb-4">
        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{label}</span>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{backgroundColor: color + '15'}}>
          <Icon size={18} style={{color}} />
        </div>
      </div>
      <div>
        <span className="text-3xl font-extralight tracking-tight text-slate-800 leading-none">{showMonetary ? value : '•••'}</span>
        {subtitle && <p className="text-[10px] font-semibold text-slate-400 mt-2">{subtitle}</p>}
      </div>
    </div>
  );

  const maxRev = Math.max(...topRevenue.map(d => d.total_revenue), 1);
  const maxVol = Math.max(...topVolume.map(d => d.total_quantity), 1);

  return (
    <div className="max-w-[1600px] mx-auto space-y-8">
      {/* Period Indicator */}
      {period && (
        <div className="flex justify-end -mt-4 mb-2">
          <button 
            onClick={onEditPeriod}
            className="inline-flex items-center gap-2 bg-blue-50 hover:bg-blue-100 text-blue-700 px-3 py-1.5 rounded-lg text-xs font-bold border border-blue-100 transition-colors shadow-sm cursor-pointer group"
            title="Cambiar periodo de análisis"
          >
            <Calendar size={14} className="group-hover:scale-110 transition-transform" />
            <span>{new Date(period.start).toLocaleDateString()} — {new Date(period.end).toLocaleDateString()}</span>
            <Edit3 size={12} className="opacity-50 ml-1 group-hover:opacity-100" />
          </button>
        </div>
      )}

      {/* KPI Cards Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        <KPICard label="Ingreso Bruto Total" value={`$${totalRev.toLocaleString()}`} subtitle={`${allData.length} productos activos`} color="#10B981" icon={DollarSign} />
        <KPICard label="Volumen Desplazado" value={`${totalUnits.toLocaleString()} uds`} subtitle="Unidades vendidas en el periodo" color="#3B82F6" icon={Package} />
        <KPICard label="Ticket Promedio" value={`$${ticketAvg.toLocaleString(undefined,{maximumFractionDigits:0})}`} subtitle={`${totalTickets.toLocaleString()} tickets en el periodo`} color="#8B5CF6" icon={Zap} />
        <KPICard label="Margen Promedio" value={`${avgMargin.toFixed(1)}%`} subtitle={showMonetary ? `Costo acumulado: $${totalCost.toLocaleString(undefined,{maximumFractionDigits:0})}` : ''} color="#F59E0B" icon={Percent} />
      </div>

      {/* Row 2: Top Revenue + Category Donut */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Top 10 Revenue */}
        <div className="lg:col-span-3 bg-white rounded-2xl p-6 shadow-[0_5px_20px_rgba(0,0,0,0.03)] border border-slate-100 dashboard-section-enter" style={{animationDelay:'100ms'}}>
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-bold text-slate-800">Top 10 por Ingresos</h3>
            <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full uppercase tracking-wide">Revenue</span>
          </div>
          <div className="space-y-3">
            {topRevenue.map((p, i) => {
              const w = (p.total_revenue / maxRev) * 100;
              return (
                <div key={i} className="group">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-semibold text-slate-600 truncate pr-3">{p.product_name}</span>
                    <span className="font-bold shrink-0" style={{color:COLS[i%COLS.length]}}>{showMonetary ? `$${p.total_revenue.toLocaleString()}` : '•••'}</span>
                  </div>
                  <div className="w-full bg-slate-50 h-4 rounded-md overflow-hidden">
                    <div className="h-full rounded-md transition-all duration-700 group-hover:brightness-110" style={{width:`${Math.max(2,w)}%`, backgroundColor:COLS[i%COLS.length]}} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Category Donut */}
        <div className="lg:col-span-2 bg-white rounded-2xl p-6 shadow-[0_5px_20px_rgba(0,0,0,0.03)] border border-slate-100 dashboard-section-enter" style={{animationDelay:'200ms'}}>
          <h3 className="font-bold text-slate-800 mb-6">Distribución por Categoría</h3>
          {catTotal > 0 && (
            <div className="flex flex-col items-center gap-5">
              <div className="relative w-40 h-40">
                <div className="w-full h-full rounded-full shadow-inner" style={{background: `conic-gradient(${catData.map((d,i) => { const pct = (d.value/catTotal)*100; const start = catData.slice(0,i).reduce((a,x)=>(a+(x.value/catTotal)*100),0); return `${COLS[i%COLS.length]} ${start}% ${start+pct}%`; }).join(', ')})`}} />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-20 h-20 rounded-full bg-white shadow-sm flex items-center justify-center flex-col">
                    <span className="text-xs font-bold text-slate-700">{catData.length}</span>
                    <span className="text-[9px] text-slate-400 font-semibold">categorías</span>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 w-full">
                {catData.slice(0,8).map((d,i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{backgroundColor:COLS[i%COLS.length]}} />
                    <div className="flex flex-col min-w-0">
                      <span className="text-[10px] font-semibold text-slate-500 truncate">{d.name}</span>
                      <span className="text-[10px] font-bold text-slate-700">{showMonetary ? `${((d.value/catTotal)*100).toFixed(1)}%` : '•••'}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Row 3: Top Volume + Bottom Margin */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pb-8">
        {/* Top 10 Volume */}
        <div className="bg-white rounded-2xl p-6 shadow-[0_5px_20px_rgba(0,0,0,0.03)] border border-slate-100 dashboard-section-enter" style={{animationDelay:'300ms'}}>
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-bold text-slate-800">Top 10 por Volumen</h3>
            <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full uppercase tracking-wide">Unidades</span>
          </div>
          <div className="space-y-3">
            {topVolume.map((p, i) => {
              const w = (p.total_quantity / maxVol) * 100;
              return (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-xl font-extralight text-slate-300 w-6 text-right">{i+1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-baseline mb-1">
                      <span className="text-sm font-semibold text-slate-600 truncate pr-2">{p.product_name}</span>
                      <span className="text-xs font-bold shrink-0" style={{color:OCEAN[i%OCEAN.length]}}>{p.total_quantity.toLocaleString()} u</span>
                    </div>
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-700" style={{width:`${Math.max(3,w)}%`, backgroundColor:OCEAN[i%OCEAN.length]}} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Bottom 5 Margin — Alert Style */}
        <div className="bg-white rounded-2xl p-6 shadow-[0_5px_20px_rgba(0,0,0,0.03)] border border-slate-100 dashboard-section-enter" style={{animationDelay:'400ms'}}>
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-bold text-slate-800">⚠️ Productos con Menor Margen</h3>
            <span className="text-[10px] font-bold text-red-500 bg-red-50 px-2.5 py-1 rounded-full uppercase tracking-wide">Alerta</span>
          </div>
          <div className="space-y-3">
            {bottomMargin.map((p, i) => {
              const marginColor = p.margin_percentage < 20 ? '#EF4444' : p.margin_percentage < 35 ? '#F59E0B' : '#10B981';
              const bgColor = p.margin_percentage < 20 ? 'bg-red-50' : p.margin_percentage < 35 ? 'bg-amber-50' : 'bg-emerald-50';
              return (
                <div key={i} className={`flex items-center gap-4 p-3 rounded-xl ${bgColor} transition-all hover:shadow-sm`}>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{backgroundColor: marginColor + '20'}}>
                    <span className="text-sm font-bold" style={{color: marginColor}}>{showMonetary ? `${p.margin_percentage.toFixed(0)}%` : '•••'}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-bold text-slate-700 block truncate">{p.product_name}</span>
                    <span className="text-[10px] text-slate-500 font-semibold">{p.category_name || 'Sin categoría'}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-bold text-slate-600 block">{showMonetary ? `$${p.total_revenue.toLocaleString()}` : '•••'}</span>
                    <span className="text-[10px] text-slate-400 font-semibold">{p.total_quantity} uds</span>
                  </div>
                </div>
              );
            })}
            {bottomMargin.length === 0 && <p className="text-slate-400 text-sm italic text-center py-6">Sin datos de margen disponibles</p>}
          </div>
        </div>
      </div>

      {/* Row 4: Time Series Charts */}
      {timeSeriesMetrics && (
        <div className="bg-white rounded-2xl p-6 shadow-[0_5px_20px_rgba(0,0,0,0.03)] border border-slate-100 dashboard-section-enter" style={{animationDelay:'500ms'}}>
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-bold text-slate-800">Ventas Diarias (Tendencia Cronológica)</h3>
            <span className="text-[10px] font-bold text-purple-600 bg-purple-50 px-2.5 py-1 rounded-full uppercase tracking-wide">Tendencias</span>
          </div>
          <div className="flex items-end justify-start gap-3 h-64 w-full pt-4 overflow-x-auto pb-4 custom-scrollbar-light">
            {dowChartData.map((d, i) => {
              const h = (d.revenue / maxDowRev) * 100;
              return (
                <div key={i} className="flex flex-col items-center justify-end gap-2 group relative h-full min-w-[60px]">
                  {/* Tooltip Hover */}
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-10 bg-slate-800 text-white text-[10px] font-bold px-2.5 py-1.5 rounded-lg whitespace-nowrap z-10 shadow-lg pointer-events-none flex flex-col items-center">
                    <span>{showMonetary ? `$${d.revenue.toLocaleString(undefined,{maximumFractionDigits:0})}` : '•••'}</span>
                    <span className="text-white/70 text-[9px]">{d.quantity} uds</span>
                  </div>
                  
                  {/* Bar */}
                  <div 
                    className="w-full rounded-t-xl transition-all duration-700 ease-out group-hover:brightness-110 bg-gradient-to-t from-purple-600 to-indigo-400 flex flex-col justify-start items-center pt-2 overflow-hidden" 
                    style={{height:`${Math.max(10,h)}%`}}
                  >
                    {/* Inner Text (Revenue) */}
                    {h > 15 && (
                        <span className="text-white text-[10px] font-black tracking-tighter opacity-90 truncate w-full text-center px-1">
                            {showMonetary ? `$${d.revenue > 999 ? (d.revenue/1000).toFixed(1)+'k' : d.revenue.toFixed(0)}` : '•••'}
                        </span>
                    )}
                    {/* Inner Text (Units) */}
                    {h > 25 && (
                        <span className="text-white/70 text-[9px] font-bold mt-1">
                            {d.quantity} u.
                        </span>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-500 font-bold w-full text-center whitespace-nowrap leading-tight">{d.name.split(' ')[0]}<br/>{d.name.split(' ')[1]}</span>
                </div>
              );
            })}
            {dowChartData.length === 0 && <p className="text-slate-400 text-sm italic w-full text-center py-6">Sin datos cronológicos en este periodo</p>}
          </div>
        </div>
      )}

      {/* C3: Peak Hours — Horario Pico */}
      {timeSeriesMetrics?.by_hour?.length > 0 && (() => {
        const byHour = timeSeriesMetrics.by_hour;
        const maxHourRev = Math.max(...byHour.map(h => h.revenue), 1);
        const peakHour = byHour.reduce((best, h) => h.revenue > best.revenue ? h : best, byHour[0]);
        // Solo mostrar horas de operación (5 AM - 21 PM)
        const opHours = [];
        for (let h = 5; h <= 21; h++) {
          const found = byHour.find(x => x.hour === h);
          opHours.push({ hour: h, revenue: found ? found.revenue : 0 });
        }
        return (
          <div className="bg-white rounded-2xl p-6 shadow-[0_5px_20px_rgba(0,0,0,0.03)] border border-slate-100 dashboard-section-enter" style={{ animationDelay: '250ms' }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-black text-slate-800 text-lg flex items-center gap-2">
                🕐 Horario de Ventas
              </h3>
              <span className="text-[10px] font-bold bg-amber-50 text-amber-700 px-2.5 py-1 rounded-full border border-amber-200">
                ⭐ Hora pico: {peakHour.hour}:00 — {showMonetary ? `$${Math.round(peakHour.revenue).toLocaleString()}` : '•••'}
              </span>
            </div>
            <div className="flex items-end gap-[3px] h-28">
              {opHours.map(h => {
                const pct = maxHourRev > 0 ? (h.revenue / maxHourRev) : 0;
                const isPeak = h.hour === peakHour.hour;
                let bg = 'bg-slate-100';
                if (pct > 0.8) bg = 'bg-emerald-500';
                else if (pct > 0.5) bg = 'bg-blue-400';
                else if (pct > 0.25) bg = 'bg-blue-300';
                else if (pct > 0.05) bg = 'bg-slate-200';
                return (
                  <div key={h.hour} className="flex-1 flex flex-col items-center justify-end h-full group relative">
                    <div
                      className={`w-full rounded-t-md transition-all duration-300 ${bg} ${isPeak ? 'ring-2 ring-amber-400 ring-offset-1' : ''} group-hover:opacity-80`}
                      style={{ height: `${Math.max(pct * 100, 2)}%` }}
                      title={`${h.hour}:00 — $${Math.round(h.revenue).toLocaleString()}`}
                    />
                    <span className={`text-[8px] mt-1 font-bold ${isPeak ? 'text-amber-600' : 'text-slate-400'}`}>
                      {h.hour}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-4 mt-3 justify-center">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-emerald-500" />
                <span className="text-[9px] font-bold text-slate-400">Alta</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-blue-400" />
                <span className="text-[9px] font-bold text-slate-400">Media</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-blue-300" />
                <span className="text-[9px] font-bold text-slate-400">Moderada</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-slate-200" />
                <span className="text-[9px] font-bold text-slate-400">Baja</span>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

// ── MAIN COMPONENT ────────────────────────────────────────

export const EstadisticasVentasUI = ({ userPermissions = {} }) => {
  const [activeView, setActiveView] = useState('dashboard');
  const [dashboardTab, setDashboardTab] = useState('dashboard');
  const [sections, setSections] = useState(() => loadSections());
  const canViewMonetary = userPermissions.all === 'full' || !!userPermissions.analytics_financial_data;
  const [showMonetary, setShowMonetary] = useState(canViewMonetary);
  const [allData, setAllData] = useState([]);
  const [ticketMetrics, setTicketMetrics] = useState(null);
  const [timeSeriesMetrics, setTimeSeriesMetrics] = useState(null);
  const [period, setPeriod] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [editingSection, setEditingSection] = useState(null);
  const [showEditor, setShowEditor] = useState(false);
  const [customDateRange, setCustomDateRange] = useState(null);
  const [showDateModal, setShowDateModal] = useState(false);

  const updateSections = (newSections) => { setSections(newSections); saveSections(newSections); };

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        let url = `${API_BASE}/analytics/rankings?`;
        if (customDateRange) {
          url += `start=${customDateRange.start}&end=${customDateRange.end}`;
        } else {
          const temps = [...new Set(sections.map(s => s.temporality))];
          const maxTemp = Math.max(...temps, 30);
          url += `days=${maxTemp}`;
        }
        
        const resp = await fetch(url);
        if (resp.ok) { 
          const d = await resp.json(); 
          setAllData(d.all || []); 
          setTicketMetrics(d.ticket_metrics || null);
          setTimeSeriesMetrics(d.time_series_metrics || null);
          setPeriod(d.period || null);
        }
      } catch(e) { console.error(e); }
      finally { setIsLoading(false); }
    };
    fetchData();
  }, [sections.map(s=>s.temporality).join(','), customDateRange]);

  const addSection = (config) => {
    const newSec = { ...config, id: config.id || generateId(), order: sections.length };
    updateSections([...sections, newSec]);
  };
  const removeSection = (id) => updateSections(sections.filter(s => s.id !== id));
  const duplicateSection = (id) => {
    const orig = sections.find(s => s.id === id);
    if (orig) addSection({ ...orig, id: generateId(), title: `${orig.title} (copia)` });
  };
  const moveSection = (id, dir) => {
    const idx = sections.findIndex(s => s.id === id);
    if ((dir === -1 && idx === 0) || (dir === 1 && idx === sections.length - 1)) return;
    const arr = [...sections];
    [arr[idx], arr[idx + dir]] = [arr[idx + dir], arr[idx]];
    updateSections(arr.map((s, i) => ({ ...s, order: i })));
  };
  const saveEditedSection = (sec) => {
    const exists = sections.find(s => s.id === sec.id);
    if (exists) updateSections(sections.map(s => s.id === sec.id ? sec : s));
    else addSection(sec);
    setShowEditor(false); setEditingSection(null);
  };

  const sortedSections = [...sections].sort((a, b) => (a.order || 0) - (b.order || 0));

  // ── DASHBOARD VIEW ──
  if (activeView === 'dashboard') return (
    <div className="flex flex-col h-full bg-[#FAFBFA] text-slate-700 font-sans">
      <header className="flex flex-wrap items-center justify-between px-8 py-5 bg-white border-b border-slate-100/50 shadow-[0_2px_15px_rgba(0,0,0,0.02)] z-20">
        <div className="flex items-center gap-8">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-slate-800">Estadísticas de Ventas</h1>
            <p className="text-xs font-semibold text-slate-400 mt-0.5">Analítica de rendimiento y proyección de valor</p>
          </div>
          <div className="flex items-center bg-slate-100 p-1 rounded-xl">
            <button onClick={()=>setDashboardTab('dashboard')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${dashboardTab==='dashboard'?'bg-white text-blue-600 shadow-sm':'text-slate-400 hover:text-slate-600'}`}>
              Dashboard
            </button>
            <button onClick={()=>setDashboardTab('kpis')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${dashboardTab==='kpis'?'bg-white text-blue-600 shadow-sm':'text-slate-400 hover:text-slate-600'}`}>
              KPIs de Ventas
            </button>
            <button onClick={()=>setDashboardTab('product_stats')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${dashboardTab==='product_stats'?'bg-white text-blue-600 shadow-sm':'text-slate-400 hover:text-slate-600'}`}>
              Estadística de Productos
            </button>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button disabled={!canViewMonetary} onClick={()=>setShowMonetary(!showMonetary)}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-bold transition-all ${!canViewMonetary?'text-slate-400 bg-slate-100 cursor-not-allowed opacity-60':showMonetary?'bg-[#E0F2FE] text-[#0284C7] shadow-sm':'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
            title={!canViewMonetary?"Sin permisos":"Alternar cifras"}>
            {!canViewMonetary?<Lock size={16}/>:showMonetary?<Eye size={16}/>:<EyeOff size={16}/>}
            {showMonetary?'Cifras Visibles':'Cifras Ocultas'}
          </button>
          <button onClick={()=>setActiveView('manager')}
            className="px-5 py-2.5 flex items-center gap-2 bg-blue-600 text-white hover:bg-blue-700 rounded-xl transition-all shadow-md shadow-blue-600/20 font-bold text-sm">
            <Settings size={16}/> Gestionar Dashboard de Ventas
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-8 custom-scrollbar-light">
        {isLoading && dashboardTab !== 'product_stats' ? (
          <div className="flex items-center justify-center h-full"><Activity className="animate-spin text-blue-500" size={40}/></div>
        ) : dashboardTab === 'product_stats' ? (
          <ProductStatsView period={period} showMonetary={showMonetary} onEditPeriod={() => setShowDateModal(true)} />
        ) : dashboardTab === 'kpis' ? (
          <SalesKPIsView allData={allData} showMonetary={showMonetary} ticketMetrics={ticketMetrics} timeSeriesMetrics={timeSeriesMetrics} period={period} onEditPeriod={() => setShowDateModal(true)} />
        ) : sortedSections.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-6">
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-blue-100 to-indigo-100 flex items-center justify-center animate-pulse">
              <LayoutDashboard size={40} className="text-blue-400"/>
            </div>
            <div className="text-center">
              <h2 className="text-2xl font-bold text-slate-700 mb-2">Tu dashboard está vacío</h2>
              <p className="text-slate-400 font-medium">Configura tus secciones para visualizar tus métricas de ventas</p>
            </div>
            <button onClick={()=>setActiveView('manager')} className="px-8 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/20 flex items-center gap-2">
              <Sparkles size={18}/> Diseña tu primer dashboard
            </button>
          </div>
        ) : (
          <div className="max-w-[1600px] mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {sortedSections.map((sec, i) => (
              <div key={sec.id} className={sec.gridSpan==='full'?'col-span-full':sec.gridSpan==='half'?'md:col-span-1 lg:col-span-1':'col-span-1'} style={sec.gridSpan==='half'?{gridColumn:'span 1'}:{}}>
                <DashboardSection section={sec} allData={allData} showMonetary={showMonetary} index={i} timeSeriesMetrics={timeSeriesMetrics}/>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Date Range Modal */}
      {showDateModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-[100] animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 animate-in slide-in-from-bottom-8">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-black text-slate-800 flex items-center gap-2"><Calendar size={20} className="text-blue-500"/> Rango de Análisis</h2>
              <button onClick={() => setShowDateModal(false)} className="text-slate-400 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl p-2 transition-colors"><X size={20}/></button>
            </div>
            
            <form onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.target);
              const s = fd.get('start');
              const ed = fd.get('end');
              if(s && ed) {
                setCustomDateRange({start: s, end: ed});
                setShowDateModal(false);
              }
            }} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">Fecha Inicial</label>
                  <input type="date" name="start" required defaultValue={customDateRange?.start || period?.start} className="w-full bg-slate-50 border border-slate-200 text-slate-700 text-sm font-bold rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">Fecha Final</label>
                  <input type="date" name="end" required defaultValue={customDateRange?.end || period?.end} className="w-full bg-slate-50 border border-slate-200 text-slate-700 text-sm font-bold rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all" />
                </div>
              </div>
              <div className="pt-4 flex items-center gap-3">
                <button type="button" onClick={() => { setCustomDateRange(null); setShowDateModal(false); }} className="flex-1 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl text-sm hover:bg-slate-200 transition-colors">Usar Automático</button>
                <button type="submit" className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl text-sm hover:bg-blue-700 shadow-md shadow-blue-600/20 transition-all">Aplicar Filtro</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style>{STYLES_CSS}</style>
    </div>
  );

  // ── MANAGER VIEW ──
  return (
    <div className="flex flex-col h-full bg-[#FAFBFA] text-slate-700 font-sans">
      <header className="flex items-center justify-between px-8 py-5 bg-white border-b border-slate-100/50 shadow-[0_2px_15px_rgba(0,0,0,0.02)] z-20">
        <div className="flex items-center gap-4">
          <button onClick={()=>setActiveView('dashboard')} className="p-2.5 hover:bg-slate-100 rounded-xl transition-colors"><ArrowLeft size={20} className="text-slate-500"/></button>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-slate-800">Gestor de Dashboard de Ventas</h1>
            <p className="text-xs font-semibold text-slate-400 mt-0.5">Configura las secciones y visualizaciones de tu dashboard</p>
          </div>
        </div>
        <span className="text-xs font-bold text-slate-400 bg-slate-100 px-3 py-1.5 rounded-full">{sections.length} secciones</span>
      </header>

      <div className="flex-1 overflow-auto p-8 custom-scrollbar-light">
        <div className="max-w-4xl mx-auto space-y-8">
          {/* Presets */}
          <div>
            <h3 className="text-sm font-bold text-slate-500 mb-3 flex items-center gap-2"><Sparkles size={14} className="text-amber-500"/> Presets Rápidos</h3>
            <div className="flex flex-wrap gap-2">
              {QUICK_PRESETS.map((p, i) => (
                <button key={i} onClick={()=>addSection({...p.config, id:generateId(), customColors:[], order:sections.length})}
                  className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 transition-all shadow-sm">
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Sections List */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-slate-500 mb-3">Secciones del Dashboard</h3>
            {sortedSections.length === 0 && <p className="text-slate-400 text-sm italic py-8 text-center">No hay secciones. Usa un preset rápido o crea una personalizada.</p>}
            {sortedSections.map((sec, i) => {
              const ctLabel = CHART_TYPES.find(c=>c.id===sec.chartType)?.label || sec.chartType;
              const dpLabel = DATA_PARAMETERS.find(p=>p.id===sec.dataParameter)?.label || sec.dataParameter;
              const tmpLabel = TEMPORALITY_OPTIONS.find(t=>t.value===sec.temporality)?.label || `${sec.temporality}d`;
              return (
                <div key={sec.id} className="flex items-center gap-4 p-4 bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all group">
                  <div className="flex flex-col gap-0.5 w-6 shrink-0">
                    <button onClick={()=>moveSection(sec.id,-1)} disabled={i===0} className="text-slate-300 hover:text-slate-600 disabled:opacity-30 transition-colors"><ChevronUp size={16}/></button>
                    <button onClick={()=>moveSection(sec.id,1)} disabled={i===sortedSections.length-1} className="text-slate-300 hover:text-slate-600 disabled:opacity-30 transition-colors"><ChevronDown size={16}/></button>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-slate-700 truncate">{sec.title || 'Sin título'}</h4>
                    <div className="flex gap-2 mt-1.5 flex-wrap">
                      <span className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded-md text-[10px] font-bold">{ctLabel}</span>
                      <span className="px-2 py-0.5 bg-emerald-50 text-emerald-600 rounded-md text-[10px] font-bold">{dpLabel}</span>
                      <span className="px-2 py-0.5 bg-amber-50 text-amber-600 rounded-md text-[10px] font-bold">{tmpLabel}</span>
                      <span className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded-md text-[10px] font-bold">{sec.gridSpan==='full'?'Completo':sec.gridSpan==='half'?'Medio':'Tercio'}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={()=>{setEditingSection(sec);setShowEditor(true);}} className="p-2 hover:bg-blue-50 rounded-lg transition-colors" title="Editar"><Edit3 size={15} className="text-blue-500"/></button>
                    <button onClick={()=>duplicateSection(sec.id)} className="p-2 hover:bg-slate-100 rounded-lg transition-colors" title="Duplicar"><Copy size={15} className="text-slate-400"/></button>
                    <button onClick={()=>removeSection(sec.id)} className="p-2 hover:bg-red-50 rounded-lg transition-colors" title="Eliminar"><Trash2 size={15} className="text-red-400"/></button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Add Custom */}
          <button onClick={()=>{setEditingSection(null);setShowEditor(true);}}
            className="w-full py-4 border-2 border-dashed border-slate-200 rounded-2xl text-slate-400 font-bold text-sm hover:border-blue-300 hover:text-blue-500 hover:bg-blue-50/30 transition-all flex items-center justify-center gap-2">
            <Plus size={18}/> Agregar Sección Personalizada
          </button>
        </div>
      </div>

      {showEditor && <SectionEditorModal section={editingSection} onSave={saveEditedSection} onClose={()=>{setShowEditor(false);setEditingSection(null);}} allData={allData} timeSeriesMetrics={timeSeriesMetrics}/>}
      
      {/* Date Range Modal */}
      {showDateModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-[100] animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 animate-in slide-in-from-bottom-8">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-black text-slate-800 flex items-center gap-2"><Calendar size={20} className="text-blue-500"/> Rango de Análisis</h2>
              <button onClick={() => setShowDateModal(false)} className="text-slate-400 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl p-2 transition-colors"><X size={20}/></button>
            </div>
            
            <form onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.target);
              const s = fd.get('start');
              const ed = fd.get('end');
              if(s && ed) {
                setCustomDateRange({start: s, end: ed});
                setShowDateModal(false);
              }
            }} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">Fecha Inicial</label>
                  <input type="date" name="start" required defaultValue={customDateRange?.start || period?.start} className="w-full bg-slate-50 border border-slate-200 text-slate-700 text-sm font-bold rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">Fecha Final</label>
                  <input type="date" name="end" required defaultValue={customDateRange?.end || period?.end} className="w-full bg-slate-50 border border-slate-200 text-slate-700 text-sm font-bold rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all" />
                </div>
              </div>
              <div className="pt-4 flex items-center gap-3">
                <button type="button" onClick={() => { setCustomDateRange(null); setShowDateModal(false); }} className="flex-1 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl text-sm hover:bg-slate-200 transition-colors">Usar Automático (Dashboard)</button>
                <button type="submit" className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl text-sm hover:bg-blue-700 shadow-md shadow-blue-600/20 transition-all">Aplicar Filtro</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style>{STYLES_CSS}</style>
    </div>
  );
};

const STYLES_CSS = `
  @keyframes fadeInUp { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
  .dashboard-section-enter { animation: fadeInUp 0.5s ease-out both; }
  .custom-scrollbar-light::-webkit-scrollbar { width:6px; }
  .custom-scrollbar-light::-webkit-scrollbar-track { background:transparent; }
  .custom-scrollbar-light::-webkit-scrollbar-thumb { background:#E2E8F0; border-radius:6px; }
  .custom-scrollbar-light::-webkit-scrollbar-thumb:hover { background:#CBD5E1; }
  .product-stats-scroll::-webkit-scrollbar { width:8px; height:8px; }
  .product-stats-scroll::-webkit-scrollbar-track { background:#F8FAFC; border-radius:8px; }
  .product-stats-scroll::-webkit-scrollbar-thumb { background:#CBD5E1; border-radius:8px; }
  .product-stats-scroll::-webkit-scrollbar-thumb:hover { background:#94A3B8; }
  .product-stats-scroll::-webkit-scrollbar-corner { background:#F8FAFC; }
  @keyframes stockChartEnter { from { opacity:0; transform:scale(0.95) translateY(10px); } to { opacity:1; transform:scale(1) translateY(0); } }
  .stock-chart-enter { animation: stockChartEnter 0.3s ease-out both; }
  .stock-chart-dot { transition: r 0.15s ease; }
  .stock-chart-dot:hover { r: 6; }
  .atypical-cell {
    background: repeating-linear-gradient(
      -45deg,
      #F1F5F9,
      #F1F5F9 3px,
      #E2E8F0 3px,
      #E2E8F0 4px
    ) !important;
  }
`;
