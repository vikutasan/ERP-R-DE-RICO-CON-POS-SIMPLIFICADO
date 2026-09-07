import React, { useState, useEffect } from 'react';
import { generateTicketHTML } from './pos/utils/ticketGenerator';
import { CONFIG } from './pos/config';

const API_BASE = CONFIG.API_BASE_URL; // Corregido: usar CONFIG en lugar de window.location.hostname

export const AuditoriaUI = () => {
    const [activeTab, setActiveTab] = useState('ventas'); // 'ventas', 'cortes' o 'reporte_diario'
    const [tickets, setTickets] = useState([]);
    const [cortes, setCortes] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [searchDate, setSearchDate] = useState('');
    const [selectedTicket, setSelectedTicket] = useState(null);
    const [selectedCorte, setSelectedCorte] = useState(null);
    const [reporteDate, setReporteDate] = useState(new Date().toISOString().split('T')[0]);
    const [reporteData, setReporteData] = useState(null);
    const [reporteLoading, setReporteLoading] = useState(false);

    useEffect(() => {
        if (activeTab === 'ventas') fetchTickets(searchTerm, searchDate);
        else fetchCortes(searchDate);
    }, [activeTab]);

    const fetchTickets = async (search = '', sDate = '') => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (search) params.append('search', search);
            if (sDate) params.append('search_date', sDate);
            const qs = params.toString();
            const url = qs ? `${API_BASE}/pos/tickets?${qs}` : `${API_BASE}/pos/tickets`;
            const resp = await fetch(url);
            const data = await resp.json();
            const arr = Array.isArray(data) ? data : [];
            const sorted = arr.sort((a, b) => new Date(b.created_at + 'Z') - new Date(a.created_at + 'Z'));
            setTickets(sorted);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const fetchCortes = async (sDate = '') => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (sDate) params.append('search_date', sDate);
            const qs = params.toString();
            const url = qs ? `${API_BASE}/cash/sessions/history?${qs}` : `${API_BASE}/cash/sessions/history`;
            const resp = await fetch(url);
            const data = await resp.json();
            setCortes(Array.isArray(data) ? data : []);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handlePrintTicket = (ticketData) => {
        const html = generateTicketHTML(ticketData);
        const iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = '0';
        document.body.appendChild(iframe);
        const doc = iframe.contentWindow.document;
        doc.open();
        doc.write(html);
        doc.close();
        setTimeout(() => {
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
            setTimeout(() => document.body.removeChild(iframe), 1000);
        }, 500);
    };

    const handleSearch = (e) => {
        e.preventDefault();
        if (activeTab === 'ventas') {
            fetchTickets(searchTerm, searchDate);
        } else {
            fetchCortes(searchDate);
        }
    };

    return (
        <div className="flex flex-col h-full bg-white text-gray-900 font-sans">
            {/* Header */}
            <div className="p-8 border-b border-gray-100 flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-black uppercase tracking-tighter italic">Auditoría y <span className="text-gray-300">Control</span></h1>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">Centro de monitoreo operativo - R de Rico</p>
                </div>
                
                <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
                    <button 
                        onClick={() => setActiveTab('ventas')}
                        className={`px-6 py-2 rounded-lg text-xs font-black uppercase transition-all ${activeTab === 'ventas' ? 'bg-white shadow-sm text-black' : 'text-gray-400 hover:text-gray-600'}`}
                    >
                        Tickets
                    </button>
                    <button 
                        onClick={() => setActiveTab('cortes')}
                        className={`px-6 py-2 rounded-lg text-xs font-black uppercase transition-all ${activeTab === 'cortes' ? 'bg-white shadow-sm text-black' : 'text-gray-400 hover:text-gray-600'}`}
                    >
                        Cortes de Caja
                    </button>
                    <button 
                        onClick={() => setActiveTab('reporte_diario')}
                        className={`px-6 py-2 rounded-lg text-xs font-black uppercase transition-all ${activeTab === 'reporte_diario' ? 'bg-white shadow-sm text-black' : 'text-gray-400 hover:text-gray-600'}`}
                    >
                        📊 Reporte Diario
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-hidden flex">
                <div className="flex-1 flex flex-col p-8 overflow-hidden">
                    <form onSubmit={handleSearch} className="mb-6 flex gap-4 shrink-0">
                        {activeTab === 'ventas' && (
                            <input 
                                type="text" 
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder="Buscar por folio (ej. V0015)..."
                                className="flex-1 bg-gray-50 border border-gray-200 px-6 py-4 rounded-2xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all shadow-inner min-w-[200px]"
                            />
                        )}
                        <input
                            type="date"
                            value={searchDate}
                            onChange={(e) => setSearchDate(e.target.value)}
                            className={`${activeTab === 'cortes' ? 'flex-1' : ''} bg-gray-50 border border-gray-200 px-6 py-4 rounded-2xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all shadow-inner`}
                        />
                        <button type="submit" className="bg-black text-white px-8 py-4 rounded-2xl font-black uppercase text-xs hover:bg-orange-600 transition-all shadow-lg active:scale-95 shrink-0">Buscar</button>
                        {(searchTerm || searchDate) && (
                            <button type="button" onClick={() => { setSearchTerm(''); setSearchDate(''); if (activeTab === 'ventas') fetchTickets('', ''); else fetchCortes(''); }} className="bg-gray-200 text-gray-700 px-6 py-4 rounded-2xl font-black uppercase text-xs hover:bg-gray-300 transition-all shadow active:scale-95 shrink-0">Limpiar</button>
                        )}
                    </form>

                    {activeTab === 'ventas' ? (
                        <div className="flex flex-col h-full min-h-0">
                            <div className="bg-white rounded-3xl border border-gray-100 shadow-xl flex-1 overflow-y-auto">
                                <table className="w-full text-left relative">
                                    <thead className="bg-gray-50/95 backdrop-blur-sm border-b border-gray-100 sticky top-0 z-10 shadow-[0_4px_10px_-4px_rgba(0,0,0,0.05)]">
                                        <tr className="text-[10px] font-black uppercase text-gray-400 tracking-widest">
                                            <th className="px-6 py-4">Folio</th>
                                            <th className="px-6 py-4">Terminal</th>
                                            <th className="px-6 py-4">Fecha</th>
                                            <th className="px-6 py-4">Capturó</th>
                                            <th className="px-6 py-4">Cobró</th>
                                            <th className="px-6 py-4">Estado</th>
                                            <th className="px-6 py-4 text-right">Total</th>
                                            <th className="px-6 py-4"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        {tickets.map(t => (
                                            <tr key={t.id} className="hover:bg-gray-50/80 transition-colors group">
                                                <td className="px-6 py-4 font-black">{t.account_num}</td>
                                                <td className="px-6 py-4 font-bold text-gray-500">{t.terminal_id}</td>
                                                <td className="px-6 py-4 text-xs font-bold text-gray-400">{new Date(t.created_at + 'Z').toLocaleString()}</td>
                                                <td className="px-6 py-4">
                                                    <span className="text-[10px] font-black uppercase text-gray-600 truncate max-w-[80px] block">{t.captured_by_name || '---'}</span>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className="text-[10px] font-black uppercase text-gray-600 truncate max-w-[80px] block">{t.cashed_by_name || '---'}</span>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase border ${t.status === 'PAID' ? 'bg-green-50 text-green-600 border-green-100' : 'bg-orange-50 text-orange-600 border-orange-100'}`}>
                                                        {t.status === 'PAID' ? 'Pagado' : 'Abierto'}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-right font-black text-lg">${t.total.toFixed(2)}</td>
                                                <td className="px-6 py-4 text-right">
                                                    <button onClick={() => setSelectedTicket(t)} className="opacity-0 group-hover:opacity-100 bg-black text-white px-4 py-2 rounded-lg text-[9px] font-black uppercase transition-all">Detalle</button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ) : (
                        <div className="flex-1 overflow-y-auto">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-8">
                                {cortes.map(c => (
                                    <div key={c.id} onClick={() => setSelectedCorte(c)} className="bg-white border border-gray-100 p-6 rounded-3xl shadow-lg hover:shadow-2xl hover:border-orange-500/20 transition-all cursor-pointer group">
                                        <div className="flex justify-between items-start mb-4">
                                            <div>
                                                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Corte #{c.id}</p>
                                                <h3 className="text-xl font-black italic uppercase leading-tight tracking-tighter">Terminal {c.terminal_id}</h3>
                                            </div>
                                            <div className="bg-orange-50 text-orange-600 p-2 rounded-xl border border-orange-100">📋</div>
                                        </div>
                                        <div className="space-y-2 mb-6">
                                            <div className="flex justify-between text-xs font-bold text-gray-500">
                                                <span>Responsable:</span>
                                                <span className="text-black">{c.employee_name}</span>
                                            </div>
                                            <div className="flex justify-between text-xs font-bold text-gray-500">
                                                <span>Cierre:</span>
                                                <span className="text-black">{new Date(c.closed_at + 'Z').toLocaleString()}</span>
                                            </div>
                                        </div>
                                        <div className="border-t border-dashed border-gray-100 pt-4 flex justify-between items-end">
                                            <div>
                                                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Efectivo Real</p>
                                                <p className="text-2xl font-black italic">${c.physical_cash?.toFixed(2)}</p>
                                            </div>
                                            <span className="text-[10px] font-black uppercase text-orange-500 opacity-0 group-hover:opacity-100 transition-all">Ver Más →</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Panel Lateral de Detalle */}
                {(selectedTicket || selectedCorte) && (
                    <div className="w-[400px] border-l border-gray-100 bg-gray-50/50 p-8 overflow-y-auto animate-in slide-in-from-right-10 duration-500">
                        <button onClick={() => { setSelectedTicket(null); setSelectedCorte(null); }} className="mb-6 text-[10px] font-black uppercase text-gray-400 hover:text-black transition-colors flex items-center gap-2">← Regresar</button>
                        
                        {selectedTicket && (
                            <div className="space-y-8">
                                <div className="text-center">
                                    <div className="text-6xl mb-4">🧾</div>
                                    <h2 className="text-2xl font-black italic uppercase tracking-tighter">Venta {selectedTicket.account_num}</h2>
                                    <p className="text-gray-400 text-xs font-bold">{new Date(selectedTicket.created_at + 'Z').toLocaleString()}</p>
                                </div>

                                <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-4">
                                    <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em] border-b border-gray-50 pb-2">Artículos</h3>
                                    {selectedTicket.items?.map((i, idx) => (
                                        <div key={idx} className="flex justify-between items-start">
                                            <div className="flex-1">
                                                <p className="font-black text-xs uppercase leading-tight">{i.product?.name}</p>
                                                <p className="text-[10px] font-bold text-gray-400">{i.quantity}x ${i.unit_price.toFixed(2)}</p>
                                            </div>
                                            <p className="font-black text-sm">${i.subtotal.toFixed(2)}</p>
                                        </div>
                                    ))}
                                    <div className="border-t border-dashed border-gray-100 pt-4 flex justify-between items-baseline">
                                        <span className="text-xs font-black uppercase">Total</span>
                                        <span className="text-2xl font-black italic text-orange-600">${selectedTicket.total.toFixed(2)}</span>
                                    </div>
                                </div>

                                <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
                                    <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em] border-b border-gray-50 pb-2 mb-4">Trazabilidad de la Cuenta</h3>
                                    <div className="space-y-4">
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center text-xl">👤</div>
                                            <div>
                                                <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Capturado por</p>
                                                <p className="text-xs font-black uppercase">{selectedTicket.captured_by_name || 'SISTEMA'}</p>
                                                <p className="text-[9px] font-bold text-gray-400">Rol: ---</p>
                                            </div>
                                        </div>
                                        {selectedTicket.status === 'PAID' && (
                                            <div className="flex items-center gap-4 border-t border-gray-50 pt-4">
                                                <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center text-xl text-orange-600">💰</div>
                                                <div>
                                                    <p className="text-[8px] font-black text-orange-500 uppercase tracking-widest">Cobrado por</p>
                                                    <p className="text-xs font-black uppercase">{selectedTicket.cashed_by_name || 'ADMIN'}</p>
                                                    <p className="text-[9px] font-bold text-gray-400">Rol: ---</p>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
                                    <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em] border-b border-gray-50 pb-2 mb-4">Historial de Pago</h3>
                                    {selectedTicket.payment_details?.map((p, idx) => (
                                        <div key={idx} className="flex justify-between items-center mb-2">
                                            <span className="text-xs font-bold uppercase text-gray-600">{p.method} {p.type ? `(${p.type})` : ''}</span>
                                            <span className="text-xs font-black">${p.amount.toFixed(2)}</span>
                                        </div>
                                    ))}
                                </div>
                                <button 
                                    onClick={() => handlePrintTicket(selectedTicket)}
                                    className="w-full mt-6 bg-black hover:bg-orange-600 text-white py-4 rounded-2xl font-black uppercase tracking-widest text-xs transition-all shadow-[0_10px_20px_rgba(0,0,0,0.2)] hover:shadow-[0_10px_20px_rgba(234,88,12,0.4)] flex justify-center items-center gap-2"
                                >
                                    REIMPRIMIR TICKET
                                </button>
                            </div>
                        )}

                        {selectedCorte && (
                            <div className="space-y-6">
                                <div className="text-center">
                                    <div className="text-5xl mb-3">💰</div>
                                    <h2 className="text-xl font-black italic uppercase tracking-tighter leading-none mt-2">Arqueo de Caja</h2>
                                    <p className="text-gray-400 text-[10px] font-bold uppercase tracking-widest mt-1">ID #{selectedCorte.id} | {selectedCorte.terminal_id}</p>
                                </div>

                                {/* Tabla Comparativa */}
                                <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
                                    <table className="w-full text-left text-[11px]">
                                        <thead className="bg-gray-50 text-gray-400 font-black uppercase tracking-widest">
                                            <tr>
                                                <th className="px-4 py-3">Concepto</th>
                                                <th className="px-4 py-3">Sistema</th>
                                                <th className="px-4 py-3">Físico</th>
                                                <th className="px-4 py-3 text-right">Dif.</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-50">
                                            {[
                                                { label: 'Efectivo', sys: selectedCorte.resumen?.efectivo_esperado, real: selectedCorte.physical_cash },
                                                { label: 'T. Crédito', sys: selectedCorte.resumen?.total_credito, real: selectedCorte.physical_credit },
                                                { label: 'T. Débito', sys: selectedCorte.resumen?.total_debito, real: selectedCorte.physical_debit },
                                            ].map((row, idx) => {
                                                const diff = (row.real || 0) - (row.sys || 0);
                                                return (
                                                    <tr key={idx} className="font-bold">
                                                        <td className="px-4 py-3 text-gray-500">{row.label}</td>
                                                        <td className="px-4 py-3">${row.sys?.toFixed(2)}</td>
                                                        <td className="px-4 py-3">${row.real?.toFixed(2)}</td>
                                                        <td className={`px-4 py-3 text-right font-black ${diff < 0 ? 'text-red-500' : diff > 0 ? 'text-green-500' : 'text-gray-300'}`}>
                                                            ${diff.toFixed(2)}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Movimientos Adicionales */}
                                <div className="bg-gray-50/50 p-5 rounded-3xl border border-gray-100 space-y-3">
                                    <h3 className="text-[9px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-200/50 pb-2">Flujo de Efectivo</h3>
                                    <div className="flex justify-between text-xs">
                                        <span className="font-bold text-gray-500">Fondo Inicial:</span>
                                        <span className="font-black">${selectedCorte.opening_float?.toFixed(2)}</span>
                                    </div>
                                    <div className="flex justify-between text-xs">
                                        <span className="font-bold text-gray-500">Entradas (+):</span>
                                        <span className="font-black text-green-600">${selectedCorte.resumen?.total_entradas?.toFixed(2)}</span>
                                    </div>
                                    <div className="flex justify-between text-xs">
                                        <span className="font-bold text-gray-500">Salidas (-):</span>
                                        <span className="font-black text-red-500">${selectedCorte.resumen?.total_salidas?.toFixed(2)}</span>
                                    </div>
                                </div>

                                {/* Resumen Negro */}
                                <div className="bg-black text-white p-6 rounded-[35px] shadow-xl relative overflow-hidden group">
                                    <div className="absolute top-0 right-0 w-24 h-24 bg-orange-600/10 blur-3xl -mr-10 -mt-10"></div>
                                    
                                    <div className="grid grid-cols-2 gap-4 mb-4">
                                        <div>
                                            <p className="text-[8px] font-black text-orange-500 uppercase tracking-widest mb-1">Total Ventas</p>
                                            <p className="text-xl font-black italic">${selectedCorte.resumen?.total_ventas?.toFixed(2)}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-[8px] font-black text-gray-500 uppercase tracking-widest mb-1">Transacciones</p>
                                            <p className="text-xl font-black italic">{selectedCorte.resumen?.num_transacciones}</p>
                                        </div>
                                    </div>

                                    <button 
                                        onClick={() => {
                                            // Navegar a tickets filtrados por este corte
                                            setTickets(selectedCorte.tickets || []);
                                            setActiveTab('ventas');
                                            setSelectedCorte(null);
                                        }}
                                        className="w-full bg-white/10 hover:bg-orange-600 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border border-white/5"
                                    >
                                        VER CUENTAS DEL CORTE
                                    </button>
                                </div>

                                <div className="text-center">
                                    <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Cajere: {selectedCorte.employee_name}</p>
                                    <p className="text-[8px] text-gray-300 mt-1">{new Date(selectedCorte.closed_at + 'Z').toLocaleString()}</p>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* ═══ TAB: REPORTE DIARIO CONSOLIDADO ═══ */}
            {activeTab === 'reporte_diario' && (
                <div className="flex-1 overflow-y-auto p-8">
                    <div className="flex gap-4 items-center mb-6">
                        <input
                            type="date"
                            value={reporteDate}
                            onChange={(e) => setReporteDate(e.target.value)}
                            className="bg-gray-50 border border-gray-200 px-6 py-4 rounded-2xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                        />
                        <button
                            onClick={async () => {
                                setReporteLoading(true);
                                try {
                                    const res = await fetch(`${API_BASE}/cash/daily-report/${reporteDate}`);
                                    if (res.ok) setReporteData(await res.json());
                                } catch(e) { console.error(e); }
                                finally { setReporteLoading(false); }
                            }}
                            className="bg-black text-white px-8 py-4 rounded-2xl font-black uppercase text-xs hover:bg-gray-800 transition-all shadow active:scale-95"
                        >
                            {reporteLoading ? '⏳ Cargando...' : '📊 Generar Reporte'}
                        </button>
                    </div>

                    {reporteData && (
                        <div className="space-y-6">
                            {/* Gran Total */}
                            <div className="bg-gradient-to-r from-gray-900 to-gray-800 text-white rounded-3xl p-8 shadow-xl">
                                <h2 className="text-sm font-black uppercase tracking-widest text-gray-400 mb-4">Gran Total Sucursal — {reporteData.fecha}</h2>
                                <div className="flex items-baseline gap-4">
                                    <span className="text-5xl font-black">${parseFloat(reporteData.gran_total).toLocaleString('es-MX', {minimumFractionDigits: 2})}</span>
                                    <span className="text-gray-400 text-sm font-bold">{reporteData.total_tickets} tickets · {reporteData.turnos_cerrados} turnos cerrados</span>
                                </div>
                                {reporteData.diferencia_total !== 0 && (
                                    <p className={`text-sm font-bold mt-2 ${reporteData.diferencia_total < 0 ? 'text-red-400' : 'text-green-400'}`}>
                                        Diferencia total: ${reporteData.diferencia_total.toFixed(2)}
                                    </p>
                                )}
                            </div>

                            {/* Por Canal */}
                            <div className="grid grid-cols-2 gap-4">
                                {Object.entries(reporteData.por_canal || {}).map(([canal, data]) => (
                                    <div key={canal} className="bg-white rounded-2xl border border-gray-100 p-6 shadow-lg">
                                        <h3 className="text-xs font-black uppercase tracking-widest text-gray-400 mb-3">
                                            {canal === 'PANADERIA' ? '🍞 Panadería' : '🍦 Heladería'}
                                        </h3>
                                        <p className="text-3xl font-black">${parseFloat(data.total).toLocaleString('es-MX', {minimumFractionDigits: 2})}</p>
                                        <p className="text-xs text-gray-400 font-bold mt-1">{data.tickets} tickets</p>
                                    </div>
                                ))}
                            </div>

                            {/* Turnos */}
                            <div className="bg-white rounded-3xl border border-gray-100 shadow-xl overflow-hidden">
                                <div className="px-6 py-4 bg-gray-50 border-b border-gray-100">
                                    <h3 className="text-xs font-black uppercase tracking-widest text-gray-400">Detalle por Turno</h3>
                                </div>
                                <table className="w-full text-left text-sm">
                                    <thead className="text-[10px] font-black uppercase text-gray-400 tracking-widest bg-gray-50">
                                        <tr>
                                            <th className="px-6 py-3">Cajero</th>
                                            <th className="px-6 py-3">Terminal</th>
                                            <th className="px-6 py-3">Ventas</th>
                                            <th className="px-6 py-3">Tickets</th>
                                            <th className="px-6 py-3">Diferencia</th>
                                            <th className="px-6 py-3">Estado</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(reporteData.turnos || []).map(t => (
                                            <tr key={t.session_id} className="border-b border-gray-50 hover:bg-gray-50/50">
                                                <td className="px-6 py-3 font-bold">{t.employee_name}</td>
                                                <td className="px-6 py-3 font-mono text-xs">{t.terminal_id}</td>
                                                <td className="px-6 py-3 font-black">${parseFloat(t.total_ventas).toLocaleString('es-MX', {minimumFractionDigits: 2})}</td>
                                                <td className="px-6 py-3 text-gray-500">{t.num_tickets}</td>
                                                <td className={`px-6 py-3 font-bold ${t.diferencia < 0 ? 'text-red-500' : t.diferencia > 0 ? 'text-green-500' : 'text-gray-400'}`}>
                                                    ${t.diferencia.toFixed(2)}
                                                </td>
                                                <td className="px-6 py-3">
                                                    <span className={`px-2 py-1 rounded-full text-[10px] font-black uppercase ${t.is_closed ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                                        {t.is_closed ? '✅ Cerrado' : '⏳ Abierto'}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Alertas */}
                            {reporteData.alertas?.length > 0 && (
                                <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-6">
                                    <h3 className="text-xs font-black uppercase text-yellow-700 mb-3">⚠️ Alertas</h3>
                                    <ul className="space-y-1">
                                        {reporteData.alertas.map((a, i) => (
                                            <li key={i} className="text-sm text-yellow-800 font-semibold">• {a}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
