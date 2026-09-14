import React, { useState, useEffect } from 'react';
import {
    ArrowLeft, RefreshCw, Loader2, Eye, ChevronRight, X,
    Clock, User, Phone, Package, CheckCircle2, Truck, MapPin, Navigation
} from 'lucide-react';
import { CONFIG } from '../shared/config.js';
import { useTimezone } from '../shared/TimezoneContext';
import { formatLocalTime, formatLocal } from '../shared/timezone';

// v19 (Fase 19.2): URL del API desde la fuente unica de verdad.
const API_BASE = CONFIG.API_BASE_URL;

/**
 * GESTOR DE REPARTOS — Zona de Despacho por Domicilio
 * Consulta la tabla `orders` en PostgreSQL filtrando por delivery_type = DOMICILIO
 * y estados de la zona Reparto.
 */

const SECTIONS = [
    {
        id: 'empaque',
        title: 'EN PROCESO DE EMPAQUE PARA REPARTO',
        icon: <Package size={20} />,
        color: 'text-blue-400',
        statuses: ['EN_EMPAQUE_REPARTO']
    },
    {
        id: 'listos',
        title: 'EMPACADOS Y LISTOS PARA REPARTO',
        icon: <CheckCircle2 size={20} />,
        color: 'text-[#c1d72e]',
        statuses: ['LISTO_REPARTO_EMPACADO']
    },
    {
        id: 'en_ruta',
        title: 'EN RUTA • CON EL REPARTIDOR',
        icon: <Truck size={20} />,
        color: 'text-orange-500',
        statuses: ['EN_RUTA']
    }
];

const STATUS_LABELS = {
    EN_EMPAQUE_REPARTO: 'Empacando',
    LISTO_REPARTO_EMPACADO: 'Listo para Repartidor',
    EN_RUTA: 'En Ruta',
    ENTREGADO: 'Entregado'
};

export const GestorRepartosUI = ({ onBack }) => {
    // v20 (Fase 20.4): zona horaria del negocio para formatear timestamps UTC.
    const { timezone } = useTimezone();
    const [orders, setOrders] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedOrder, setSelectedOrder] = useState(null);

    const loadOrders = async () => {
        setIsLoading(true);
        try {
            const resp = await fetch(`${API_BASE}/orders/repartos`);
            if (resp.ok) setOrders(await resp.json());
        } catch (e) { console.error('Error cargando repartos:', e); }
        finally { setIsLoading(false); }
    };

    useEffect(() => {
        loadOrders();
        const timer = setInterval(loadOrders, 30000);
        return () => clearInterval(timer);
    }, []);

    const updateStatus = async (orderId, newStatus) => {
        try {
            const resp = await fetch(`${API_BASE}/orders/${orderId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus })
            });
            if (resp.ok) loadOrders();
        } catch (e) { console.error('Error actualizando estado:', e); }
    };

    return (
        <div 
            style={{ 
                backgroundColor: '#b2b2b2',
                backgroundImage: 'radial-gradient(circle at center, #d1d1d1 0%, #b2b2b2 100%)'
            }}
            className="flex-1 flex flex-col h-full animate-in fade-in duration-500 overflow-hidden relative"
        >
            <div className="absolute inset-0 opacity-[0.05] pointer-events-none" />

            {/* Cabecera */}
            <div className="relative z-20 flex items-center justify-between p-8 border-b border-black/10 bg-white/70 backdrop-blur-3xl shadow-md">
                <div className="flex items-center gap-8">
                    {onBack && (
                        <button onClick={onBack} className="w-12 h-12 rounded-full border border-black/20 flex items-center justify-center text-gray-700 hover:text-black hover:bg-black/5 transition-all group">
                            <ArrowLeft size={24} className="group-hover:-translate-x-1 transition-transform" />
                        </button>
                    )}
                    <div>
                        <h1 className="text-4xl font-black italic uppercase tracking-tighter text-black leading-none">
                            GESTOR DE <span className="text-blue-500">REPARTOS</span>
                        </h1>
                        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.5em] mt-1">
                            Despacho de Entregas a Domicilio • R de Rico
                        </p>
                    </div>
                </div>
                
                <div className="flex items-center gap-4">
                    <div className="bg-white/50 border border-black/10 px-6 py-3 rounded-2xl shadow-sm">
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{orders.length} reparto{orders.length !== 1 ? 's' : ''} activo{orders.length !== 1 ? 's' : ''}</span>
                    </div>
                    <button onClick={loadOrders} className="flex items-center gap-3 bg-black text-white px-8 py-4 rounded-[30px] text-xs font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-xl">
                        {isLoading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                        Actualizar
                    </button>
                </div>
            </div>

            {/* Contenido */}
            <div className="relative z-10 flex-1 overflow-auto p-12 custom-scrollbar space-y-16 pb-32">
                {isLoading && orders.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64 gap-6">
                        <Loader2 className="animate-spin text-blue-500" size={64} />
                        <p className="text-sm font-black text-black/20 uppercase tracking-[0.3em]">Cargando repartos...</p>
                    </div>
                ) : orders.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64 gap-6">
                        <Truck className="text-black/10" size={80} />
                        <p className="text-sm font-black text-black/20 uppercase tracking-[0.3em]">No hay repartos pendientes</p>
                    </div>
                ) : (
                    SECTIONS.map(section => {
                        const sectionOrders = orders.filter(o => section.statuses.includes(o.status));
                        if (sectionOrders.length === 0) return null;
                        return (
                            <div key={section.id} className="animate-in slide-in-from-bottom-4 duration-700">
                                <div className="flex items-center gap-4 mb-8 pl-4">
                                    <div className={`w-10 h-10 rounded-xl bg-white/40 flex items-center justify-center ${section.color} border border-black/5 shadow-sm`}>
                                        {section.icon}
                                    </div>
                                    <h3 className="text-lg font-black italic uppercase tracking-widest text-black/80">
                                        {section.title} <span className="text-black/20 ml-2 font-normal">[{sectionOrders.length}]</span>
                                    </h3>
                                    <div className="flex-1 h-px bg-gradient-to-r from-black/10 to-transparent ml-4" />
                                </div>
                                <div className="space-y-4">
                                    {sectionOrders.map(order => (
                                        <RepartoRow
                                            key={order.id}
                                            order={order}
                                            color={section.color}
                                            onViewDetails={() => setSelectedOrder(order)}
                                            onUpdateStatus={updateStatus}
                                            timezone={timezone}
                                        />
                                    ))}
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {selectedOrder && <RepartoDetailsModal order={selectedOrder} onClose={() => setSelectedOrder(null)} timezone={timezone} />}
        </div>
    );
};

const RepartoRow = ({ order, color, onViewDetails, onUpdateStatus, timezone }) => {
    const getAction = (current) => {
        if (current === 'EN_EMPAQUE_REPARTO') return { next: 'LISTO_REPARTO_EMPACADO', label: 'Avanzar' };
        if (current === 'LISTO_REPARTO_EMPACADO') return { next: 'EN_RUTA', label: 'Salió Repartidor' };
        if (current === 'EN_RUTA') return { next: 'ENTREGADO', label: 'Entregado' };
        return null;
    };

    const action = getAction(order.status);

    return (
        <div className="group relative bg-white/40 border border-black/5 rounded-2xl p-4 flex items-center gap-6 hover:bg-white/60 hover:shadow-xl hover:translate-x-1 transition-all duration-500 shadow-md">
            <div className="w-2 h-12 rounded-full bg-blue-500 opacity-30 hidden md:block" />

            <div className="w-24 flex-shrink-0">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-tighter">Folio</p>
                <p className="text-xl font-black text-black italic tracking-tighter">{order.ticket?.account_num || `#${order.id}`}</p>
            </div>

            <div className="flex-1 min-w-0">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-1">Cliente / Destino</p>
                <h4 className="text-sm font-bold text-black truncate uppercase tracking-tight">
                    {order.customer_name || 'Sin nombre'}
                </h4>
                <div className="flex items-center gap-4 mt-1 text-[10px] font-bold text-gray-500 italic">
                    <span className="flex items-center gap-1">
                        <MapPin size={10} className="text-blue-600" />
                        <span className="truncate max-w-[200px]">{order.delivery_address || 'Sin dirección'}</span>
                    </span>
                    <span className="flex items-center gap-1 text-orange-600">
                        <Clock size={10} />
                        {order.committed_at ? formatLocalTime(order.committed_at, timezone) : '---'}
                    </span>
                </div>
            </div>

            <div className="hidden lg:flex flex-col items-center px-4 border-l border-black/5">
                <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Teléfono</span>
                <span className="text-xs font-black text-black mt-1">{order.customer_phone || '---'}</span>
            </div>

            <div className="hidden lg:flex flex-col items-center px-6 border-l border-black/5">
                <span className={`text-[9px] font-black uppercase tracking-widest ${color}`}>
                    {STATUS_LABELS[order.status] || order.status}
                </span>
            </div>

            <div className="flex items-center gap-3">
                <button 
                    onClick={onViewDetails}
                    className="h-10 px-4 rounded-xl bg-white/50 border border-black/10 text-gray-700 hover:text-black hover:bg-white transition-all flex items-center gap-2 text-[10px] font-black uppercase tracking-widest shadow-sm"
                >
                    <Eye size={14} /> Detalles
                </button>

                {action && (
                    <button 
                        onClick={() => onUpdateStatus(order.id, action.next)}
                        className={`h-10 px-6 rounded-xl border transition-all flex items-center gap-2 text-[10px] font-black uppercase tracking-widest shadow-lg group/next ${
                            action.label === 'Entregado' 
                                ? 'bg-[#c1d72e]/10 border-[#c1d72e]/30 text-[#8fa600] hover:bg-[#c1d72e] hover:text-black'
                                : action.label === 'Salió Repartidor'
                                ? 'bg-blue-500/10 border-blue-500/30 text-blue-400 hover:bg-blue-500 hover:text-white'
                                : 'bg-orange-500/10 border-orange-500/30 text-orange-400 hover:bg-orange-500 hover:text-black'
                        }`}
                    >
                        {action.label === 'Entregado' ? <CheckCircle2 size={16} /> : 
                         action.label === 'Salió Repartidor' ? <Navigation size={16} /> :
                         <ChevronRight size={16} className="group-hover/next:translate-x-1 transition-transform" />}
                        {action.label}
                    </button>
                )}
            </div>
        </div>
    );
};

const RepartoDetailsModal = ({ order, onClose, timezone }) => (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-8 bg-black/60 backdrop-blur-md animate-in fade-in duration-300">
        <div className="w-full max-w-2xl bg-[#e5e5e5] border border-black/10 rounded-[40px] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-8 border-b border-black/5 bg-white/60 flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-black italic text-black tracking-tighter uppercase leading-none">
                        Reparto <span className="text-blue-500">{order.ticket?.account_num || `#${order.id}`}</span>
                    </h2>
                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-[0.4em] mt-2">Detalle de Entrega a Domicilio</p>
                </div>
                <button onClick={onClose} className="w-12 h-12 rounded-full bg-black/5 flex items-center justify-center text-gray-500 hover:text-black hover:bg-black/10 transition-all">
                    <X size={24} />
                </button>
            </div>

            <div className="flex-1 overflow-auto p-10 custom-scrollbar space-y-8">
                <div className="grid grid-cols-2 gap-8">
                    <DetailItem icon={<User size={16}/>} label="Cliente" value={order.customer_name} />
                    <DetailItem icon={<Phone size={16}/>} label="Teléfono" value={order.customer_phone} />
                    <DetailItem icon={<Clock size={16}/>} label="Hora Compromiso" value={order.committed_at ? formatLocal(order.committed_at, timezone, { weekday: 'long', hour: '2-digit', minute: '2-digit' }) : '---'} highlight />
                    <DetailItem icon={<Package size={16}/>} label="Empaque" value={order.packaging_type === 'PROPIO' ? '🛍️ Propio' : '📦 Vendido'} />
                </div>

                {/* Dirección destacada */}
                <div className="p-6 rounded-3xl bg-blue-500/5 border border-blue-500/10 shadow-sm">
                    <div className="flex items-center gap-2 text-blue-500 mb-2">
                        <MapPin size={16} />
                        <span className="text-[9px] font-black uppercase tracking-widest">Dirección de Entrega</span>
                    </div>
                    <p className="text-sm font-extrabold text-black/80 uppercase">{order.delivery_address || 'Sin dirección registrada'}</p>
                </div>

                <div className="space-y-4">
                    <div className="flex items-center gap-2 mb-2">
                        <Package size={16} className="text-blue-500" />
                        <h4 className="text-[11px] font-black text-black/60 uppercase tracking-widest">Productos</h4>
                    </div>
                    <div className="bg-white/40 rounded-3xl border border-black/5 overflow-hidden shadow-sm">
                        {order.ticket?.items?.map((item, idx) => (
                            <div key={idx} className="p-4 flex items-center justify-between border-b border-black/5 last:border-0 hover:bg-white/60 transition-colors">
                                <div className="flex items-center gap-4">
                                    <span className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-600 flex items-center justify-center text-xs font-black">{item.quantity}</span>
                                    <span className="text-sm font-bold text-black uppercase tracking-tight">{item.product?.name || `Producto #${item.product_id}`}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {order.notes && (
                    <div className="space-y-2">
                        <h4 className="text-[11px] font-black text-black/60 uppercase tracking-widest">Notas</h4>
                        <p className="text-sm text-gray-600 italic bg-white/40 p-6 rounded-3xl border border-dashed border-black/10">"{order.notes}"</p>
                    </div>
                )}
            </div>

            <div className="p-8 bg-black/5 border-t border-black/5 flex justify-end">
                <button onClick={onClose} className="px-8 py-4 rounded-2xl bg-black text-white font-black text-xs uppercase tracking-widest hover:scale-105 transition-all shadow-lg">
                    Cerrar
                </button>
            </div>
        </div>
    </div>
);

const DetailItem = ({ icon, label, value, highlight = false }) => (
    <div className="space-y-1">
        <div className="flex items-center gap-2 text-gray-400 truncate">
            {icon}
            <span className="text-[9px] font-black uppercase tracking-widest">{label}</span>
        </div>
        <p className={`text-sm font-extrabold uppercase truncate ${highlight ? 'text-orange-600' : 'text-black/80'}`}>
            {value || '---'}
        </p>
    </div>
);
