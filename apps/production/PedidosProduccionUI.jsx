import React, { useState, useEffect } from 'react';
import { 
    ArrowLeft, 
    RefreshCw, 
    Loader2, 
    Eye, 
    Play, 
    CheckCircle2, 
    Clock, 
    User, 
    Phone, 
    MapPin, 
    Package, 
    X, 
    ChevronRight,
    ClipboardList,
    Thermometer,
    Truck,
    Store
} from 'lucide-react';
import { CONFIG } from '../shared/config.js';

// v19 (Fase 19.2): URL del API desde la fuente unica de verdad.
const API_BASE = CONFIG.API_BASE_URL;

/**
 * CONFIGURACIÓN DE SECCIONES — ZONA DE PRODUCCIÓN
 * Este módulo solo muestra los estados de producción (PAGADO → LISTO_EMPAQUE).
 * Los estados de Pickup y Reparto se manejan en sus módulos respectivos.
 */
const SECTIONS = [
    { 
        id: 'asignacion', 
        title: 'EN ESPERA DE ASIGNACIÓN DE TURNO', 
        icon: <ClipboardList size={20} />, 
        color: 'text-blue-400',
        statuses: ['TENTATIVO', 'PAGADO'] 
    },
    { 
        id: 'espera', 
        title: 'CON TURNO ASIGNADO • EN ESPERA', 
        icon: <Clock size={20} />, 
        color: 'text-purple-400',
        statuses: ['TURNO_ASIGNADO'] 
    },
    { 
        id: 'produccion', 
        title: 'EN PRODUCCIÓN ACTIVA', 
        icon: <Play size={20} />, 
        color: 'text-orange-500', 
        statuses: ['EN_PREPARACION'] 
    },
    { 
        id: 'enfriamiento', 
        title: 'PRODUCIDOS • ENFRIAMIENTO Y REPOSO', 
        icon: <Thermometer size={20} />, 
        color: 'text-cyan-400', 
        statuses: ['PREPARADO_ENFRIAMIENTO', 'PREPARADO_REPOSO'] 
    },
    { 
        id: 'listos', 
        title: 'LISTOS PARA EMPAQUE O ENTREGA', 
        icon: <CheckCircle2 size={20} />, 
        color: 'text-[#c1d72e]', 
        statuses: ['LISTO_EMPAQUE'] 
    }
];

const STATUS_LABELS = {
    TENTATIVO: 'Por Pagar (Tentativo)',
    PAGADO: 'Pagado',
    TURNO_ASIGNADO: 'Turno Asignado',
    EN_PREPARACION: 'En Preparación',
    PREPARADO_ENFRIAMIENTO: 'Enfriamiento',
    PREPARADO_REPOSO: 'Reposo',
    LISTO_EMPAQUE: 'Listo Empaque',
    EN_EMPAQUE_PICKUP: 'Empacando (Pickup)',
    LISTO_PICKUP_SIN_EMPAQUE: 'Listo s/Empaque',
    LISTO_PICKUP_EMPACADO: 'Listo Pickup',
    EN_EMPAQUE_REPARTO: 'Empacando (Reparto)',
    LISTO_REPARTO_EMPACADO: 'Listo Reparto',
    EN_RUTA: 'En Ruta',
    ENTREGADO: 'Entregado',
    CANCELADO: 'Cancelado'
};


export const PedidosProduccionUI = ({ onBack }) => {
    const [orders, setOrders] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedOrder, setSelectedOrder] = useState(null);

    const loadOrders = async () => {
        setIsLoading(true);
        try {
            // Pedidos POS
            const resp = await fetch(`${API_BASE}/orders/pendientes`);
            let posOrders = [];
            if (resp.ok) posOrders = (await resp.json()).map(o => ({ ...o, source: 'POS' }));

            // Pedidos Grandeza
            let gOrders = [];
            try {
                const gResp = await fetch(`${API_BASE}/grandeza/orders`);
                if (gResp.ok) {
                    const raw = await gResp.json();
                    gOrders = raw
                        .filter(o => !['ENTREGADO','CANCELADO'].includes(o.status))
                        .map(o => ({
                            id: `G-${o.id}`,
                            _grandeza_id: o.id,
                            source: 'GRANDEZA',
                            status: o.status,
                            customer_name: o.client_name || 'Cliente Grandeza',
                            delivery_type: 'REPARTO_GRANDEZA',
                            committed_at: o.delivery_time ? `${o.delivery_date}T${o.delivery_time}` : o.delivery_date,
                            packaging_type: 'PROPIO',
                            notes: o.notes,
                            total_amount: o.total_amount,
                            advance_payment: o.advance_payment || 0,
                            balance_due: o.balance_due || 0,
                            payment_status: o.payment_status || 'PENDIENTE',
                            payment_method: o.payment_method,
                            ticket: {
                                account_num: `🍞G-${o.id}`,
                                items: (o.items || []).map(it => ({
                                    quantity: it.qty,
                                    product: { name: it.product_name, sku: '' },
                                    product_id: it.product_id
                                }))
                            }
                        }));
                }
            } catch(e) {}

            setOrders([...posOrders, ...gOrders]);
        } catch (e) { console.error('Error cargando pedidos:', e); }
        finally { setIsLoading(false); }
    };

    useEffect(() => {
        loadOrders();
        const timer = setInterval(loadOrders, 30000); // Polling cada 30s
        return () => clearInterval(timer);
    }, []);

    const updateStatus = async (orderId, newStatus) => {
        try {
            // Detectar si es pedido Grandeza
            if (String(orderId).startsWith('G-')) {
                const gId = String(orderId).replace('G-', '');
                const resp = await fetch(`${API_BASE}/grandeza/orders/${gId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: newStatus })
                });
                if (resp.ok) loadOrders();
            } else {
                const resp = await fetch(`${API_BASE}/orders/${orderId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: newStatus })
                });
                if (resp.ok) loadOrders();
            }
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
            {/* Capa de Grano Industrial Sutil (Acabado Metálico/Piedra) */}
            <div className="absolute inset-0 opacity-[0.05] pointer-events-none' bg-[url('https://www.transparenttextures.com/patterns/pinstriped-suit.png')]" />

            {/* Cabecera Cristal (Light Industrial Style) */}
            <div className="relative z-20 flex items-center justify-between p-8 border-b border-black/10 bg-white/70 backdrop-blur-3xl shadow-md">
                <div className="flex items-center gap-8">
                    {onBack && (
                        <button onClick={onBack} className="w-12 h-12 rounded-full border border-black/20 flex items-center justify-center text-gray-700 hover:text-black hover:bg-black/5 transition-all group">
                            <ArrowLeft size={24} className="group-hover:-translate-x-1 transition-transform" />
                        </button>
                    )}
                    <div>
                        <h1 className="text-4xl font-black italic uppercase tracking-tighter text-black leading-none">
                            PEDIDOS EN <span className="text-orange-500">PRODUCCIÓN</span>
                        </h1>
                        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.5em] mt-1">
                            Línea de Ensamblaje Maestras • R de Rico
                        </p>
                    </div>
                </div>
                
                <div className="flex items-center gap-4">
                    <button onClick={loadOrders} className="flex items-center gap-3 bg-black text-white px-8 py-4 rounded-[30px] text-xs font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-xl">
                        {isLoading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                        Actualizar Planta
                    </button>
                </div>
            </div>

            {/* Contenido principal por secciones */}
            <div className="relative z-10 flex-1 overflow-auto p-12 custom-scrollbar space-y-16 pb-32">
                {isLoading && orders.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64 gap-6">
                        <Loader2 className="animate-spin text-orange-500" size={64} />
                        <p className="text-sm font-black text-white/20 uppercase tracking-[0.3em]">Sincronizando con planta...</p>
                    </div>
                ) : (
                    SECTIONS.map(section => (
                        <SectionView 
                            key={section.id} 
                            config={section} 
                            orders={orders.filter(o => section.statuses.includes(o.status))}
                            onViewDetails={setSelectedOrder}
                            onUpdateStatus={updateStatus}
                        />
                    ))
                )}
            </div>

            {/* Modal de Detalles */}
            {selectedOrder && (
                <OrderDetailsModal 
                    order={selectedOrder} 
                    onClose={() => setSelectedOrder(null)} 
                />
            )}
        </div>
    );
};

const SectionView = ({ config, orders, onViewDetails, onUpdateStatus }) => {
    if (orders.length === 0) return null;

    return (
        <div className="animate-in slide-in-from-bottom-4 duration-700">
            <div className="flex items-center gap-4 mb-8 pl-4">
                <div className={`w-10 h-10 rounded-xl bg-white/40 flex items-center justify-center ${config.color} border border-black/5 shadow-sm`}>
                    {config.icon}
                </div>
                <h3 className="text-lg font-black italic uppercase tracking-widest text-black/80">
                    {config.title} <span className="text-black/20 ml-2 font-normal">[{orders.length}]</span>
                </h3>
                <div className="flex-1 h-px bg-gradient-to-r from-black/10 to-transparent ml-4" />
            </div>

            <div className="space-y-4">
                {orders.map(order => (
                    <OrderRow 
                        key={order.id} 
                        order={order} 
                        color={config.color}
                        onViewDetails={() => onViewDetails(order)}
                        onUpdateStatus={onUpdateStatus}
                    />
                ))}
            </div>
        </div>
    );
};

const OrderRow = ({ order, color, onViewDetails, onUpdateStatus }) => {
    const isPickup = order.delivery_type === 'PICKUP';
    
    // Lógica de avance rápido — flujo lineal de producción
    const getNextStatus = (current) => {
        const flow = [
            'PAGADO', 'TURNO_ASIGNADO', 'EN_PREPARACION', 
            'PREPARADO_ENFRIAMIENTO', 'PREPARADO_REPOSO', 'LISTO_EMPAQUE'
        ];
        const idx = flow.indexOf(current);
        return idx !== -1 && idx < flow.length - 1 ? flow[idx + 1] : null;
    };

    const nextStatus = getNextStatus(order.status);

    // Bifurcación en LISTO_EMPAQUE: enviar a la zona correcta según delivery_type
    const getBifurcationAction = () => {
        if (order.status !== 'LISTO_EMPAQUE') return null;
        if (isPickup) {
            // Si el empaque es PROPIO, va directo a "listo sin empaque"
            if (order.packaging_type === 'PROPIO') {
                return { next: 'LISTO_PICKUP_SIN_EMPAQUE', label: 'Listo (sin empaque)', icon: '🏪' };
            }
            return { next: 'EN_EMPAQUE_PICKUP', label: 'Enviar a Pickup', icon: '🏪' };
        } else {
            return { next: 'EN_EMPAQUE_REPARTO', label: 'Enviar a Reparto', icon: '🚗' };
        }
    };

    const bifurcation = getBifurcationAction();

    return (
        <div className="group relative bg-white/40 border border-black/5 rounded-2xl p-4 flex items-center gap-6 hover:bg-white/60 hover:shadow-xl hover:translate-x-1 transition-all duration-500 shadow-md">
            {/* Indicador de Tipo */}
            <div className={`w-2 h-12 rounded-full hidden md:block ${isPickup ? 'bg-orange-500' : 'bg-blue-500'} opacity-30`} />

            {/* Folio y Cliente */}
            <div className="w-24 flex-shrink-0">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-tighter">Folio</p>
                <p className="text-xl font-black text-black italic tracking-tighter">
                    {order.ticket?.account_num || `#${order.id}`}
                    {order.source === 'GRANDEZA' && <span className="text-xs ml-1 text-amber-600 not-italic">🍞</span>}
                </p>
            </div>

            <div className="flex-1 min-w-0">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-1">Cliente / Destino</p>
                <h4 className="text-sm font-bold text-black truncate uppercase tracking-tight">
                    {order.customer_name || 'Sin nombre'}
                </h4>
                <div className="flex items-center gap-4 mt-1 text-[10px] font-bold text-gray-500 italic">
                    <span className="flex items-center gap-1">
                        {order.source === 'GRANDEZA' 
                            ? <><span className="text-amber-600">🍞</span> Reparto Grandeza</>
                            : <>{isPickup ? <Store size={10} className="text-orange-600" /> : <Truck size={10} className="text-blue-600" />}
                            {isPickup ? 'Pick Up' : 'Domicilio'}</>}
                    </span>
                    <span className="flex items-center gap-1 text-orange-600">
                        <Clock size={10} />
                        {order.committed_at ? new Date(order.committed_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : '---'}
                    </span>
                    {order.source === 'GRANDEZA' && order.payment_status && (
                        <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase not-italic ${
                            order.payment_status === 'PAGADO' ? 'bg-green-100 text-green-700' :
                            order.payment_status === 'ANTICIPO' ? 'bg-amber-100 text-amber-700' :
                            'bg-red-100 text-red-700'
                        }`}>
                            {order.payment_status === 'ANTICIPO' ? `Anticipo $${order.advance_payment} · Resta $${order.balance_due}` : order.payment_status}
                        </span>
                    )}
                </div>
            </div>

            {/* Estado Actual Badge */}
            <div className="hidden lg:flex flex-col items-center px-6 border-l border-black/5">
                <span className={`text-[9px] font-black uppercase tracking-widest ${color}`}>
                    {STATUS_LABELS[order.status] || order.status}
                </span>
            </div>

            {/* Botones de Acción */}
            <div className="flex items-center gap-3">
                <button 
                    onClick={onViewDetails}
                    className="h-10 px-4 rounded-xl bg-white/50 border border-black/10 text-gray-700 hover:text-black hover:bg-white transition-all flex items-center gap-2 text-[10px] font-black uppercase tracking-widest group/btn shadow-sm"
                >
                    <Eye size={14} className="group-hover/btn:scale-110 transition-transform" />
                    Detalles
                </button>

                {/* Botón Avanzar (estados intermedios de producción) */}
                {nextStatus && (
                    <button 
                        onClick={() => onUpdateStatus(order.id, nextStatus)}
                        className="h-10 px-6 rounded-xl bg-orange-500/10 border border-orange-500/30 text-orange-400 hover:bg-orange-500 hover:text-black hover:border-transparent transition-all flex items-center gap-2 text-[10px] font-black uppercase tracking-widest shadow-lg shadow-orange-500/10 group/next"
                    >
                        <ChevronRight size={16} className="group-hover/next:translate-x-1 transition-transform" />
                        Avanzar
                    </button>
                )}

                {/* Botón Bifurcación (LISTO_EMPAQUE → Pickup o Reparto) */}
                {bifurcation && (
                    <button 
                        onClick={() => onUpdateStatus(order.id, bifurcation.next)}
                        className={`h-10 px-6 rounded-xl border transition-all flex items-center gap-2 text-[10px] font-black uppercase tracking-widest shadow-lg group/bif ${
                            isPickup 
                                ? 'bg-orange-500/10 border-orange-500/30 text-orange-500 hover:bg-orange-500 hover:text-white'
                                : 'bg-blue-500/10 border-blue-500/30 text-blue-500 hover:bg-blue-500 hover:text-white'
                        }`}
                    >
                        <span>{bifurcation.icon}</span>
                        {bifurcation.label}
                    </button>
                )}
            </div>
        </div>
    );
};

const OrderDetailsModal = ({ order, onClose }) => {
    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-8 bg-black/60 backdrop-blur-md animate-in fade-in duration-300">
            <div className="w-full max-w-2xl bg-[#e5e5e5] border border-black/10 rounded-[40px] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                
                {/* Header Modal */}
                <div className="p-8 border-b border-black/5 bg-white/60 flex items-center justify-between">
                    <div>
                        <h2 className="text-3xl font-black italic text-black tracking-tighter uppercase leading-none">
                            Pedido <span className="text-orange-500">{order.ticket?.account_num || `#${order.id}`}</span>
                        </h2>
                        <p className="text-[10px] font-black text-gray-500 uppercase tracking-[0.4em] mt-2">Detalle Completo de Producción</p>
                    </div>
                    <button onClick={onClose} className="w-12 h-12 rounded-full bg-black/5 flex items-center justify-center text-gray-500 hover:text-black hover:bg-black/10 transition-all">
                        <X size={24} />
                    </button>
                </div>

                {/* Body Modal */}
                <div className="flex-1 overflow-auto p-10 custom-scrollbar space-y-10">
                    
                    {/* Grid Información */}
                    <div className="grid grid-cols-2 gap-8">
                        <DetailItem icon={<User size={16}/>} label="Cliente" value={order.customer_name} />
                        <DetailItem icon={<Phone size={16}/>} label="Teléfono" value={order.customer_phone} />
                        <DetailItem icon={<Clock size={16}/>} label="Compromiso" value={new Date(order.committed_at).toLocaleString('es-MX', { weekday: 'long', hour: '2-digit', minute: '2-digit' })} highlight />
                        <DetailItem 
                            icon={order.delivery_type === 'PICKUP' ? <Store size={16}/> : <Truck size={16}/>} 
                            label="Tipo de Entrega" 
                            value={order.source === 'GRANDEZA' ? '🍞 Reparto Grandeza' : (order.delivery_type === 'PICKUP' ? 'Pick Up en Tienda' : 'Entrega a Domicilio')} 
                        />
                    </div>

                    {/* Info Financiera Grandeza */}
                    {order.source === 'GRANDEZA' && (
                        <div className="p-6 rounded-3xl bg-amber-50/60 border border-amber-200/50 shadow-sm">
                            <h4 className="text-[11px] font-black text-amber-700/60 uppercase tracking-widest mb-4 flex items-center gap-2">
                                <span>💰</span> Información de Pago
                            </h4>
                            <div className="grid grid-cols-3 gap-6">
                                <div>
                                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Total</p>
                                    <p className="text-lg font-black text-black">${order.total_amount?.toFixed(2)}</p>
                                </div>
                                <div>
                                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Anticipo</p>
                                    <p className="text-lg font-black text-green-600">${(order.advance_payment || 0).toFixed(2)}</p>
                                </div>
                                <div>
                                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Resta</p>
                                    <p className={`text-lg font-black ${(order.balance_due || 0) > 0 ? 'text-red-600' : 'text-green-600'}`}>${(order.balance_due || 0).toFixed(2)}</p>
                                </div>
                            </div>
                            <div className="mt-3">
                                <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${
                                    order.payment_status === 'PAGADO' ? 'bg-green-100 text-green-700' :
                                    order.payment_status === 'ANTICIPO' ? 'bg-amber-100 text-amber-700' :
                                    'bg-red-100 text-red-700'
                                }`}>{order.payment_status}</span>
                            </div>
                        </div>
                    )}

                    {order.delivery_type === 'DOMICILIO' && (
                        <div className="p-6 rounded-3xl bg-white/40 border border-black/5 shadow-sm">
                            <DetailItem icon={<MapPin size={16}/>} label="Dirección de Entrega" value={order.delivery_address} />
                        </div>
                    )}

                    {/* Lista de Productos */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 mb-2">
                            <Package size={16} className="text-orange-500" />
                            <h4 className="text-[11px] font-black text-black/60 uppercase tracking-widest">Productos del Pedido</h4>
                        </div>
                        <div className="bg-white/40 rounded-3xl border border-black/5 overflow-hidden shadow-sm">
                            {order.ticket?.items?.map((item, idx) => (
                                <div key={idx} className="p-4 flex items-center justify-between border-b border-black/5 last:border-0 hover:bg-white/60 transition-colors">
                                    <div className="flex items-center gap-4">
                                        <span className="w-8 h-8 rounded-lg bg-orange-500/10 text-orange-600 flex items-center justify-center text-xs font-black">
                                            {item.quantity}
                                        </span>
                                        <span className="text-sm font-bold text-black uppercase tracking-tight">
                                            {item.product?.name || `Producto #${item.product_id}`}
                                        </span>
                                    </div>
                                    <span className="text-[10px] font-bold text-gray-400 italic">
                                        Ref: {item.product?.sku || 'N/A'}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Notas */}
                    {order.notes && (
                        <div className="space-y-2">
                            <h4 className="text-[11px] font-black text-black/60 uppercase tracking-widest">Notas Especiales</h4>
                            <p className="text-sm text-gray-600 italic bg-white/40 p-6 rounded-3xl border border-dashed border-black/10">
                                "{order.notes}"
                            </p>
                        </div>
                    )}
                </div>

                {/* Footer Modal */}
                <div className="p-8 bg-black/5 border-t border-black/5 flex justify-end">
                    <button 
                        onClick={onClose}
                        className="px-8 py-4 rounded-2xl bg-black text-white font-black text-xs uppercase tracking-widest hover:scale-105 transition-all shadow-lg"
                    >
                        Cerrar Vista
                    </button>
                </div>
            </div>
        </div>
    );
};

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
