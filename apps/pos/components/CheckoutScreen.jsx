import React, { useState, useEffect } from 'react';
import { formatLocal } from '../../shared/timezone';

export const CheckoutScreen = ({ cart = [], total, onConfirm, onClose, orderData = null }) => {
    const [payments, setPayments] = useState([]);
    const [receivedAmount, setReceivedAmount] = useState('');
    const [paymentMethod, setPaymentMethod] = useState('EFECTIVO');
    const [cardType, setCardType] = useState('DEBITO'); // DEBITO, CREDITO, QR
    const [isProcessing, setIsProcessing] = useState(false);
    const [editingPaymentId, setEditingPaymentId] = useState(null);
    const [tempEditValue, setTempEditValue] = useState('');
    const [errorMessage, setErrorMessage] = useState(null); // Toast no-bloqueante para errores
    
    const totalPaid = payments.reduce((acc, p) => acc + p.amount, 0);
    const pendingAmount = Math.max(0, total - totalPaid);
    const change = Math.max(0, (parseFloat(receivedAmount) || 0) + totalPaid - total);

    const handleNumberClick = (num) => {
        if (receivedAmount.includes('.') && num === '.') return;
        setReceivedAmount(prev => prev + num);
    };

    const handleClear = () => setReceivedAmount('');

    const handleAddPayment = () => {
        if (isProcessing) return;
        const amount = parseFloat(receivedAmount);
        if (!amount || amount <= 0) return;

        const newPayment = {
            method: paymentMethod,
            amount: Math.min(amount, pendingAmount + change), 
            displayAmount: amount,
            type: paymentMethod === 'TARJETA' ? cardType : null,
            id: Date.now()
        };

        if (paymentMethod === 'EFECTIVO') {
            const realAbono = Math.min(amount, pendingAmount);
            const cambioEntregado = Math.max(0, amount - realAbono);
            setPayments([...payments, { 
                ...newPayment, 
                amount: realAbono,
                received: amount,
                cambio: cambioEntregado
            }]);
        } else {
            setPayments([...payments, { ...newPayment, amount: Math.min(amount, pendingAmount) }]);
        }
        
        setReceivedAmount('');
    };

    const handleDeletePayment = (id) => {
        if (isProcessing) return;
        setPayments(payments.filter(p => p.id !== id));
        if (editingPaymentId === id) setEditingPaymentId(null);
    };

    const handleStartEdit = (p) => {
        if (isProcessing) return;
        setEditingPaymentId(p.id);
        setTempEditValue(p.amount.toString());
    };

    const handleSaveEdit = (id) => {
        const newVal = parseFloat(tempEditValue);
        if (isNaN(newVal) || newVal < 0) {
            setEditingPaymentId(null);
            return;
        }

        setPayments(payments.map(p => {
            if (p.id === id) {
                const realReceived = p.received || p.amount;
                const newAbono = Math.min(newVal, realReceived);
                return {
                    ...p,
                    amount: newAbono,
                    cambio: Math.max(0, realReceived - newAbono)
                };
            }
            return p;
        }));
        setEditingPaymentId(null);
    };

    const handleFinalize = async () => {
        if (isProcessing) return;
        
        let finalPayments = [...payments];
        const entered = parseFloat(receivedAmount) || 0;
        const currentPending = Math.max(0, total - finalPayments.reduce((s, p) => s + p.amount, 0));
        
        if (currentPending > 0 && entered > 0) {
            const realAbono = Math.min(entered, currentPending);
            finalPayments = [...finalPayments, {
                method: paymentMethod,
                amount: realAbono,
                received: entered,
                cambio: Math.max(0, entered - realAbono),
                displayAmount: entered,
                type: paymentMethod === 'TARJETA' ? cardType : null,
                id: Date.now()
            }];
        }
        
        const totalFinalPaid = finalPayments.reduce((s, p) => s + p.amount, 0);
        
        if (totalFinalPaid >= total) {
            setIsProcessing(true); // ANTES del await — previene double-click
            try {
                // Al confirmar, el padre (finalizeUI=true) cerrará este modal y limpiará el carrito
                await onConfirm(finalPayments);
                // El componente se desmonta aquí — NO hacer setState
            } catch (error) {
                console.error("Error liquidando:", error);
                setIsProcessing(false); // Re-habilitar en caso de error
                setErrorMessage('Error al liquidar la cuenta. Intente de nuevo.');
                setTimeout(() => setErrorMessage(null), 5000);
            }
        } else {
            setErrorMessage('Aún queda saldo pendiente por cubrir.');
            setTimeout(() => setErrorMessage(null), 4000);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-xl animate-in fade-in duration-300">
            <div className={`bg-[#1a1a1a] rounded-[50px] border shadow-[0_0_100px_rgba(193,215,46,0.1)] overflow-hidden flex flex-col transition-all duration-300 ${
                orderData
                    ? 'w-[1100px] border-orange-500/20'
                    : 'w-[800px] border-white/10'
            }`}>
                {/* Header */}
                <div className="p-8 border-b border-white/5 flex justify-between items-center bg-black/20">
                    <div>
                        <h2 className="text-3xl font-black uppercase italic tracking-tighter text-white">SUITE DE <span className="text-[#c1d72e]">COBRO</span></h2>
                        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.4em] mt-1 italic">Gestión de Pagos Mixtos</p>
                    </div>
                    <button onClick={onClose} className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center text-2xl hover:bg-red-500/20 hover:text-red-500 transition-all">✕</button>
                </div>

                <div className="flex flex-row flex-1 overflow-hidden">
                    {/* Left Panel: Payment Entry */}
                    <div className="w-1/2 p-10 border-r border-white/5 space-y-6">
                        {/* Status Display */}
                        <div className="flex flex-col bg-black/40 p-5 rounded-3xl border border-white/5">
                            <div className="flex justify-between items-center opacity-50 mb-1">
                                <span className="text-[9px] font-black uppercase tracking-widest text-gray-400">Total Original</span>
                                <span className="text-sm font-bold font-mono">${total.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between items-end">
                                <span className="text-[10px] font-black uppercase text-[#c1d72e] tracking-widest">Saldo Pendiente</span>
                                <span className="text-4xl font-black text-[#c1d72e] font-mono tracking-tighter">${pendingAmount.toFixed(2)}</span>
                            </div>
                        </div>

                        {/* Method Selector */}
                        <div className="grid grid-cols-2 gap-3">
                            <button 
                                onClick={() => setPaymentMethod('EFECTIVO')}
                                className={`py-4 rounded-2xl border-2 transition-all flex items-center justify-center gap-3 ${paymentMethod === 'EFECTIVO' ? 'border-[#c1d72e] bg-[#c1d72e]/10 text-[#c1d72e]' : 'border-white/5 bg-white/5 text-gray-400'}`}
                            >
                                <span className="text-xl">💵</span>
                                <span className="text-[9px] font-black uppercase tracking-widest">Efectivo</span>
                            </button>
                            <button 
                                onClick={() => setPaymentMethod('TARJETA')}
                                className={`py-4 rounded-2xl border-2 transition-all flex items-center justify-center gap-3 ${paymentMethod === 'TARJETA' ? 'border-orange-500 bg-orange-500/10 text-orange-500' : 'border-white/5 bg-white/5 text-gray-400'}`}
                            >
                                <span className="text-xl">💳</span>
                                <span className="text-[9px] font-black uppercase tracking-widest">Tarjeta</span>
                            </button>
                        </div>

                        {paymentMethod === 'TARJETA' && (
                            <div className="grid grid-cols-3 gap-2 animate-in fade-in zoom-in-95 duration-300">
                                {['DEBITO', 'CREDITO', 'QR'].map(t => (
                                    <button 
                                        key={t}
                                        onClick={() => setCardType(t)}
                                        className={`py-2 rounded-xl text-[8px] font-black uppercase tracking-widest border transition-all ${cardType === t ? 'bg-orange-500 text-black border-orange-500 shadow-lg shadow-orange-500/20' : 'bg-white/5 text-gray-500 border-white/5 hover:border-white/20'}`}
                                    >
                                        {t}
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* Input Area */}
                        <div className="space-y-4">
                            <div className="bg-white text-black p-4 rounded-2xl text-4xl font-black text-right shadow-inner min-h-[70px] flex flex-col justify-center relative">
                                <span className="text-[8px] absolute top-2 left-3 font-black uppercase text-gray-400">Importe a Recibir</span>
                                {receivedAmount ? `$${receivedAmount}` : '$0.00'}
                            </div>

                            <div className="flex gap-2">
                                <div className="grid grid-cols-3 gap-2 flex-grow">
                                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, '.', 0].map((num) => (
                                        <button 
                                            key={num}
                                            disabled={isProcessing}
                                            onClick={() => handleNumberClick(num.toString())}
                                            className={`h-12 rounded-xl border text-lg font-black transition-all ${isProcessing ? 'bg-white/5 border-white/5 text-gray-700 cursor-not-allowed' : 'bg-white/5 border-white/10 hover:bg-white/10 active:scale-90 text-white'}`}
                                        >
                                            {num}
                                        </button>
                                    ))}
                                    <button disabled={isProcessing} onClick={handleClear} className={`h-12 rounded-xl text-[10px] font-black uppercase transition-all ${isProcessing ? 'bg-red-500/5 text-red-500/20 cursor-not-allowed' : 'bg-red-500/10 text-red-500 hover:bg-red-500/20'}`}>C</button>
                                </div>
                                
                                <button 
                                    disabled={!receivedAmount || pendingAmount <= 0 || isProcessing}
                                    onClick={handleAddPayment}
                                    className={`w-24 rounded-xl border transition-all flex flex-col items-center justify-center gap-1 active:scale-95 ${(!receivedAmount || pendingAmount <= 0 || isProcessing) ? 'bg-white/5 border-white/5 text-gray-700 cursor-not-allowed' : 'bg-white/5 border-white/10 hover:bg-white/10 text-white shadow-xl'}`}
                                >
                                    <span className={`text-2xl mb-0.5 ${(!receivedAmount || pendingAmount <= 0 || isProcessing) ? 'opacity-20' : 'opacity-100'}`}>➕</span>
                                    <div className="flex flex-col items-center leading-none">
                                        <span className="text-[12px] font-black uppercase tracking-tighter">Abonar</span>
                                        <span className="text-[12px] font-black uppercase tracking-tighter">Pago</span>
                                    </div>
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Right Panel: Payments List */}
                    <div className="w-1/2 p-10 bg-black/10 flex flex-col">
                        <h3 className="text-[11px] font-black uppercase tracking-[0.3em] text-gray-500 mb-8 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-orange-500"></span>
                            Resumen de Pagos
                        </h3>

                        <div className="flex-1 space-y-4 overflow-y-auto custom-scrollbar pr-2">
                            {payments.map(p => (
                                <div key={p.id} className="bg-white/5 border border-white/10 p-8 rounded-[30px] flex justify-between items-center group relative overflow-hidden animate-in slide-in-from-right-4 duration-300">
                                    <div className="flex flex-col gap-1">
                                        <p className="text-[13px] font-black uppercase text-white tracking-tight">{p.method} {p.type && `(${p.type})`}</p>
                                        <div className="flex items-center gap-1.5">
                                            <span className="w-1.5 h-1.5 rounded-full bg-[#c1d72e]"></span>
                                            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Procesado</p>
                                        </div>
                                    </div>
                                    <div className="flex flex-col items-end gap-2">
                                        {!isProcessing && (
                                            <button 
                                                onClick={() => handleDeletePayment(p.id)}
                                                className="w-10 h-10 flex items-center justify-center text-[16px] text-white/40 hover:text-red-500 hover:bg-red-500/10 rounded-full transition-all"
                                                title="Eliminar abono"
                                            >
                                                ✕
                                            </button>
                                        )}
                                        {p.method === 'EFECTIVO' ? (
                                            <div className="flex flex-col items-end leading-[1.2]">
                                                <div className="flex items-center gap-2 justify-end w-full">
                                                    <span className="text-[10px] font-black text-gray-500 uppercase tracking-tighter">Recibo</span>
                                                    <span className="text-[14px] font-black text-white/80 font-mono">${p.received.toFixed(2)}</span>
                                                </div>
                                                <div className="flex items-center gap-2 justify-end w-full mt-2 group/edit">
                                                    <span className="text-[11px] font-black text-[#c1d72e] uppercase tracking-tighter">Abona</span>
                                                    {editingPaymentId === p.id ? (
                                                        <input 
                                                            type="number"
                                                            autoFocus
                                                            className="w-28 bg-white/10 border border-[#c1d72e] text-2xl font-black text-[#c1d72e] font-mono rounded px-2 outline-none"
                                                            value={tempEditValue}
                                                            onChange={(e) => setTempEditValue(e.target.value)}
                                                            onBlur={() => handleSaveEdit(p.id)}
                                                            onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit(p.id)}
                                                        />
                                                    ) : (
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-3xl font-black text-[#c1d72e] font-mono tracking-tight">${p.amount.toFixed(2)}</span>
                                                            {!isProcessing && (
                                                                <button 
                                                                    onClick={() => handleStartEdit(p)}
                                                                    className="p-1.5 opacity-0 group-hover/edit:opacity-100 text-white/40 hover:text-[#c1d72e] transition-all"
                                                                    title="Editar abono"
                                                                >
                                                                    ✏️
                                                                </button>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-2 justify-end w-full mt-2">
                                                    <span className="text-[10px] font-black text-orange-500 uppercase tracking-tighter">Cambio</span>
                                                    <span className="text-[14px] font-black text-orange-400 font-mono">${p.cambio.toFixed(2)}</span>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-3">
                                                <span className="text-[11px] font-black text-[#c1d72e] uppercase tracking-tighter">Abona</span>
                                                <span className="text-3xl font-black text-[#c1d72e] font-mono tracking-tight">${p.amount.toFixed(2)}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                            {payments.length === 0 && (
                                <div className="h-full flex flex-col items-center justify-center text-gray-700 text-center px-4">
                                    <span className="text-4xl mb-4 opacity-10">🎫</span>
                                    <p className="text-[9px] font-black uppercase tracking-widest opacity-30 italic leading-relaxed">No hay abonos registrados para esta cuenta</p>
                                </div>
                            )}
                        </div>

                        {change > 0 && (
                            <div className="mt-4 p-4 bg-[#c1d72e] rounded-2xl animate-in zoom-in-95 duration-300">
                                <div className="flex justify-between items-center">
                                    <span className="text-[9px] font-black uppercase text-black/60 tracking-widest">Cambio a entregar</span>
                                    <span className="text-xl font-black text-black font-mono">-${change.toFixed(2)}</span>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Panel Condicional: Detalles del Pedido (solo si es PEDIDO) */}
                    {orderData && (
                        <div className="w-[320px] flex-shrink-0 p-8 bg-orange-500/5 border-l border-orange-500/20 flex flex-col gap-4 animate-in slide-in-from-right-4 duration-300">
                            <div className="flex items-center gap-2 mb-2">
                                <span className="w-2 h-2 rounded-full bg-orange-500"></span>
                                <h3 className="text-[11px] font-black uppercase tracking-[0.3em] text-orange-400">Confirmar con el Cliente</h3>
                            </div>

                            {/* Tipo de entrega */}
                            <div className="bg-orange-500/10 border border-orange-500/20 rounded-2xl px-4 py-3 text-center">
                                <p className="text-[9px] font-black uppercase text-orange-400/60 tracking-widest mb-1">Tipo de Entrega</p>
                                <p className="text-xl font-black text-orange-300">
                                    {orderData.delivery_type === 'PICKUP' ? '🏪 Pick Up' : '🚗 Domicilio'}
                                </p>
                            </div>

                            {/* Datos clave */}
                            <div className="space-y-3">
                                <OrderDetailRow label="Cliente" value={orderData.customer_name} />
                                <OrderDetailRow label="Teléfono" value={orderData.customer_phone} />
                                <OrderDetailRow
                                    label="Entrega Compromiso"
                                    value={orderData.committed_at
                                        ? formatLocal(orderData.committed_at, undefined, {
                                            weekday: 'short', day: '2-digit', month: 'short',
                                            hour: '2-digit', minute: '2-digit'
                                          })
                                        : '---'}
                                    highlight
                                />
                                <OrderDetailRow
                                    label="Contenido del Pedido"
                                    value={
                                        <div className="flex flex-col items-end text-xs space-y-1">
                                            {cart.filter(i => i.nature !== 'EMPAQUE').length > 0 ? (
                                                cart.filter(i => i.nature !== 'EMPAQUE').map((i, idx) => (
                                                    <span key={idx} className="text-white/80"><span className="text-[#c1d72e] font-black">{i.quantity}x</span> {i.name}</span>
                                                ))
                                            ) : (
                                                <span className="text-white/40">Sin productos principales</span>
                                            )}
                                        </div>
                                    }
                                />
                                <OrderDetailRow
                                    label="Empaque"
                                    value={
                                        orderData.packaging_type === 'PROPIO' 
                                            ? '🛍️ Empaque del Cliente' 
                                            : (<div className="flex flex-col items-end text-xs space-y-1">
                                                <span className="text-orange-400 font-black mb-1">📦 Se Vende Empaque:</span>
                                                {cart.filter(i => i.nature === 'EMPAQUE').length > 0 ? (
                                                    cart.filter(i => i.nature === 'EMPAQUE').map((i, idx) => (
                                                        <span key={idx} className="text-white/80"><span className="text-orange-500">{i.quantity}x</span> {i.name}</span>
                                                    ))
                                                ) : (
                                                    <span className="text-white/60">Se cobran según captura adicional</span>
                                                )}
                                               </div>)
                                    }
                                />
                                {orderData.delivery_type === 'DOMICILIO' && orderData.delivery_address && (
                                    <OrderDetailRow label="Dirección" value={orderData.delivery_address} />
                                )}
                                {orderData.notes && (
                                    <div className="bg-amber-500/15 border border-amber-500/30 rounded-xl px-4 py-3">
                                        <p className="text-[9px] font-black uppercase text-amber-400/80 tracking-widest mb-1 flex items-center gap-1">📝 Notas del Pedido</p>
                                        <p className="text-sm font-black leading-snug text-amber-200">{orderData.notes}</p>
                                    </div>
                                )}
                            </div>

                            {/* Aviso PAGADO */}
                            {isProcessing && (
                                <div className="mt-auto bg-[#c1d72e] rounded-2xl px-4 py-3 text-center animate-in zoom-in-95 duration-300">
                                    <p className="text-[10px] font-black uppercase text-black/60 tracking-widest">Estado del Pedido</p>
                                    <p className="text-lg font-black text-black uppercase tracking-tight">✅ PAGADO — EN ESPERA DE PRODUCCIÓN</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer Action */}
                <div className="p-8 bg-black/40 border-t border-white/5 flex gap-4">
                    <button 
                        onClick={handleFinalize}
                        disabled={isProcessing}
                        className={`flex-1 py-5 rounded-[25px] text-lg font-black uppercase italic tracking-tighter transition-all shadow-2xl active:scale-95 ${isProcessing ? 'bg-[#c1d72e] text-black cursor-default' : (pendingAmount <= 0 || (receivedAmount && parseFloat(receivedAmount) >= pendingAmount) ? 'bg-[#c1d72e] text-black shadow-[#c1d72e]/20' : 'bg-gray-800 text-gray-500 grayscale cursor-not-allowed')}`}
                    >
                        {isProcessing ? 'PROCESANDO PAGO...' : 'Liquidar Cuenta'}
                    </button>
                </div>

                {/* Toast de error no-bloqueante */}
                {errorMessage && (
                    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[300] animate-in slide-in-from-bottom-4 fade-in duration-500">
                        <div className="bg-red-600 text-white px-8 py-3 rounded-2xl shadow-[0_20px_60px_rgba(220,38,38,0.4)] font-black text-xs uppercase tracking-wider flex items-center gap-2">
                            ⚠️ {errorMessage}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

const OrderDetailRow = ({ label, value, highlight = false }) => (
    <div className="bg-white/5 border border-white/5 rounded-xl px-4 py-2.5">
        <p className="text-[9px] font-black uppercase text-gray-600 tracking-widest mb-0.5">{label}</p>
        <p className={`text-sm font-black leading-tight ${highlight ? 'text-orange-300' : 'text-white/80'}`}>
            {value || '—'}
        </p>
    </div>
);
