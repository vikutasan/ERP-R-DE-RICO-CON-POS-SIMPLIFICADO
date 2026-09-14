import React, { useState, useEffect } from 'react';
import { ArrowLeft, Package, Clock, User, Phone, MapPin, RefreshCw, CheckCircle, Loader2 } from 'lucide-react';
import { CONFIG } from '../shared/config.js';

// v19 (Fase 19.2): URL del API desde la fuente unica de verdad.
const API_BASE = CONFIG.API_BASE_URL;

const STATUS_CONFIG = {
    TENTATIVO:      { label: 'Tentativo',       color: 'text-gray-400',   bg: 'bg-gray-500/10',   border: 'border-gray-500/20' },
    PAGADO:         { label: 'Pagado',           color: 'text-blue-400',   bg: 'bg-blue-500/10',   border: 'border-blue-500/20' },
    EN_PRODUCCION:  { label: 'En Producción',   color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20' },
    LISTO:          { label: 'Listo',            color: 'text-green-400',  bg: 'bg-green-500/10',  border: 'border-green-500/20' },
    ENTREGADO:      { label: 'Entregado',        color: 'text-[#c1d72e]',  bg: 'bg-[#c1d72e]/10',  border: 'border-[#c1d72e]/20' },
    CANCELADO:      { label: 'Cancelado',        color: 'text-red-400',    bg: 'bg-red-500/10',    border: 'border-red-500/20' },
};

/**
 * SUITE: Pedidos Pendientes
 * MISIÓN: Mostrar todos los pedidos activos para que el equipo de producción
 * los tenga visibles y listos para cuando se cree el generador de órdenes de producción.
 */
export const PedidosPendientesUI = ({ onBack }) => {
    const [orders, setOrders] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    const loadOrders = async () => {
        setIsLoading(true);
        try {
            const resp = await fetch(`${API_BASE}/orders/pendientes`);
            if (resp.ok) setOrders(await resp.json());
        } catch (e) { console.error('Error cargando pedidos pendientes:', e); }
        finally { setIsLoading(false); }
    };

    useEffect(() => { loadOrders(); }, []);

    const updateStatus = async (orderId, newStatus) => {
        try {
            await fetch(`${API_BASE}/orders/${orderId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus })
            });
            loadOrders();
        } catch (e) { console.error('Error actualizando estado:', e); }
    };

    return (
        <div
            style={{ backgroundColor: '#1a1a2e', backgroundImage: 'radial-gradient(circle at 20% 50%, #16213e 0%, #1a1a2e 100%)' }}
            className="flex-1 flex flex-col h-full animate-in fade-in duration-500 overflow-hidden"
        >
            {/* Header */}
            <div className="flex items-center justify-between p-8 border-b border-white/5 bg-white/5 backdrop-blur-xl">
                <div className="flex items-center gap-6">
                    {onBack && (
                        <button onClick={onBack} className="w-10 h-10 rounded-full border border-white/20 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-all">
                            <ArrowLeft size={20} />
                        </button>
                    )}
                    <div>
                        <h1 className="text-4xl font-black italic uppercase tracking-tighter text-white">
                            Pedidos <span className="text-orange-400">Pendientes</span>
                        </h1>
                        <p className="text-[10px] font-bold text-white/30 uppercase tracking-[0.4em] mt-1">
                            Bandeja de Producción • R de Rico
                        </p>
                    </div>
                </div>
                <button onClick={loadOrders} className="flex items-center gap-2 bg-white/5 border border-white/10 px-5 py-2 rounded-xl text-white/60 hover:text-white hover:bg-white/10 transition-all text-xs font-black uppercase tracking-widest">
                    <RefreshCw size={14} /> Actualizar
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-8 custom-scrollbar">
                {isLoading ? (
                    <div className="flex flex-col items-center justify-center h-64 gap-4">
                        <Loader2 className="animate-spin text-orange-400" size={48} />
                        <p className="text-[10px] font-black text-white/30 uppercase tracking-widest">Cargando pedidos...</p>
                    </div>
                ) : orders.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64 gap-4">
                        <span className="text-6xl opacity-20">📦</span>
                        <p className="text-[11px] font-black text-white/20 uppercase tracking-widest">No hay pedidos pendientes</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 max-w-7xl mx-auto">
                        {orders.map(order => (
                            <OrderCard key={order.id} order={order} onStatusChange={updateStatus} />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

/** Tarjeta individual de pedido. SRP: solo renderiza y delega cambios de estado. */
const OrderCard = ({ order, onStatusChange }) => {
    const cfg = STATUS_CONFIG[order.status] || STATUS_CONFIG.TENTATIVO;
    const isPickup = order.delivery_type === 'PICKUP';
    const nextStatus = { PAGADO: 'EN_PRODUCCION', EN_PRODUCCION: 'LISTO' }[order.status];

    return (
        <div className={`bg-white/5 border ${cfg.border} rounded-[30px] p-6 flex flex-col gap-4 hover:bg-white/8 transition-all`}>
            {/* Badge tipo + estado */}
            <div className="flex items-center justify-between">
                <span className="text-lg">{isPickup ? '🏪 Pick Up' : '🚗 Domicilio'}</span>
                <span className={`text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full ${cfg.bg} ${cfg.color} border ${cfg.border}`}>
                    {cfg.label}
                </span>
            </div>

            {/* Cliente */}
            <div className="space-y-2">
                <Row icon={<User size={13}/>} value={order.customer_name || '---'} />
                <Row icon={<Phone size={13}/>} value={order.customer_phone || '---'} />
                <Row icon={<Clock size={13}/>} value={formatDT(order.committed_at)} highlight />
                {!isPickup && order.delivery_address && (
                    <Row icon={<MapPin size={13}/>} value={order.delivery_address} />
                )}
                <Row icon={<Package size={13}/>} value={order.packaging_type === 'PROPIO' ? 'Empaque propio' : '📦 Vender empaque'} />
                {order.notes && (
                    <p className="text-[10px] text-white/30 italic pl-5">{order.notes}</p>
                )}
            </div>

            {/* Acción de avance de estado */}
            {nextStatus && (
                <button
                    onClick={() => onStatusChange(order.id, nextStatus)}
                    className="mt-auto w-full py-3 rounded-2xl bg-orange-500/20 border border-orange-500/30 text-orange-300 text-[11px] font-black uppercase tracking-widest hover:bg-orange-500/30 transition-all flex items-center justify-center gap-2"
                >
                    <CheckCircle size={14} />
                    Marcar como {STATUS_CONFIG[nextStatus].label}
                </button>
            )}
            {order.status === 'LISTO' && (
                <button
                    onClick={() => onStatusChange(order.id, 'ENTREGADO')}
                    className="mt-auto w-full py-3 rounded-2xl bg-[#c1d72e]/20 border border-[#c1d72e]/30 text-[#c1d72e] text-[11px] font-black uppercase tracking-widest hover:bg-[#c1d72e]/30 transition-all flex items-center justify-center gap-2"
                >
                    ✅ Marcar como Entregado
                </button>
            )}
        </div>
    );
};

const Row = ({ icon, value, highlight = false }) => (
    <div className="flex items-start gap-2">
        <span className="text-white/30 mt-0.5 flex-shrink-0">{icon}</span>
        <span className={`text-xs font-bold leading-tight ${highlight ? 'text-orange-300' : 'text-white/70'}`}>{value}</span>
    </div>
);

const formatDT = (dt) => {
    if (!dt) return '---';
    return new Date(dt).toLocaleString('es-MX', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};
