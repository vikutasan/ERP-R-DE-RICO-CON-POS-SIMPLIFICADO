import React, { useState, useEffect, useCallback, useRef } from 'react';
import { OpenAccountsCorkboard } from './OpenAccountsCorkboard';
import { posService } from './services/POSService';
import { useCart } from './hooks/useCart';
import { useVision } from './hooks/useVision';
import { useTerminalLocking } from './hooks/useTerminalLocking';
import { useBeforeUnload } from './hooks/useBeforeUnload';
import { useBarcodeScanner } from './hooks/useBarcodeScanner';
import { useNetworkHealth } from './hooks/useNetworkHealth';
import { usePOSSession } from './hooks/usePOSSession';
import { useTicketActions } from './hooks/useTicketActions';
import { buildResetPatch } from './state/sessionReset';
import { CONFIG } from './config';

// Sub-componentes
import { ProductGrid } from './components/ProductGrid';
import { SalesReceipt } from './components/SalesReceipt';
import { VisionVisor } from './components/VisionVisor';
import { CheckoutScreen } from './components/CheckoutScreen';
import { GestorDeCaja } from './components/GestorDeCaja';
import { TerminalSelector } from './components/TerminalSelector';
import { ProgramacionPedidoModal } from './components/ProgramacionPedidoModal';
import { ForceLogoutModal, ToastNotification } from './components/POSOverlays';
import { POSHeader } from './components/POSHeader';
import { cashService } from './services/cashService';

import { generateTicketHTML } from './utils/ticketGenerator';
import { withRetries } from './utils/withRetries';

export const RetailVisionPOS = ({ currentUser, onForceLogout, assignedTerminal }) => {
    // --- Estado ---
    const [selectedTerminal, setSelectedTerminal] = useState(null);
    const [showCorkboard, setShowCorkboard] = useState(false);
    const [currentAccountNum, setCurrentAccountNum] = useState('');
    const [viewMode, setViewMode] = useState('CAMERA');
    const [currentPage, setCurrentPage] = useState(1);
    const [allOpenAccounts, setAllOpenAccounts] = useState([]);
    const [showCheckout, setShowCheckout] = useState(false);
    const [paymentsHistory, setPaymentsHistory] = useState([]);
    const [originalCapturer, setOriginalCapturer] = useState(null);
    const [toastMessage, setToastMessage] = useState(null);
    // Estado de guardado y loading
    const [lastSaveStatus, setLastSaveStatus] = useState('idle');
    const [lastSaveTime, setLastSaveTime] = useState(null);
    const [isSendingToPizarron, setIsSendingToPizarron] = useState(false);
    const [ticketVersion, setTicketVersion] = useState(null);
    const [showExitModal, setShowExitModal] = useState(false);
    const [pendingExitAction, setPendingExitAction] = useState(null);
    const savedTicketRef = React.useRef(null);
    const cartRef = React.useRef([]);
    const accountNumRef = React.useRef('');
    const originalCapturerRef = React.useRef(null);
    const isGeneratingFolioRef = React.useRef(false);
    const isRecoveringRef = React.useRef(false);
    const ticketVersionRef = React.useRef(null);
    const actionMutexRef = React.useRef(Promise.resolve());

    // --- Estado de Ocupación de Terminales (Custom Hook) ---
    const { terminalStatuses, setTerminalStatuses, forceLogoutModal, setForceLogoutModal } = useTerminalLocking(selectedTerminal, currentUser);
    const { status: netStatus, latency: netLatency } = useNetworkHealth(15000, selectedTerminal, currentUser);

    // --- Estado del Gestor de Caja ---
    const [isCashEnabled, setIsCashEnabled] = useState(false);
    const [showGestorCaja, setShowGestorCaja] = useState(false);
    const [cashSessionId, setCashSessionId] = useState(null);

    // --- Estado de Tipo de Venta (Venta Directa vs Pedido) ---
    const [orderType, setOrderType] = useState('VENTA_DIRECTA');
    const [showProgramacion, setShowProgramacion] = useState(false);
    const [orderData, setOrderData] = useState(null);

    // --- Hook de Sesión: catálogo, folio, inicialización ---
    const clearCartRef = React.useRef(null);
    const { categories, initialProducts, PRODUCTS, activeCategory, setActiveCategory, generateNewAccountNum } = usePOSSession({
        selectedTerminal,
        currentUser,
        clearCartRef,
        accountNumRef,
        originalCapturerRef,
        ticketVersionRef,
        isGeneratingFolioRef,
        setCurrentAccountNum,
        setOriginalCapturer,
        setTicketVersion,
        setToastMessage,
        setOrderType,
        setOrderData,
    });

    const { cart, setCart, total, addToCart, updateQuantity, removeFromCart, clearCart } = useCart(PRODUCTS, selectedTerminal);
    clearCartRef.current = clearCart;
    const { isScanning, setIsScanning } = useVision();

    // --- Mantener refs sincronizadas con state (anti-stale-closure) ---
    React.useEffect(() => { cartRef.current = cart; }, [cart]);
    React.useEffect(() => { accountNumRef.current = currentAccountNum; }, [currentAccountNum]);
    React.useEffect(() => { originalCapturerRef.current = originalCapturer; }, [originalCapturer]);
    React.useEffect(() => { ticketVersionRef.current = ticketVersion; }, [ticketVersion]);

    // --- v7.0.2: Auto-reconciliación al recuperar conexión (fix V1 + V2) ---
    // Cuando lastSaveStatus es 'failed', espera 10s y luego intenta reconciliar el carrito
    // con la fuente de verdad del servidor. Se re-programa con cada cambio de netStatus.
    // NO es un timer de auto-save (prohibido) — es un mecanismo de RECOVERY post-fallo.
    const reconciliationTimerRef = useRef(null);
    useEffect(() => {
        if (lastSaveStatus !== 'failed') {
            if (reconciliationTimerRef.current) {
                clearTimeout(reconciliationTimerRef.current);
                reconciliationTimerRef.current = null;
            }
            return;
        }

        if (reconciliationTimerRef.current) clearTimeout(reconciliationTimerRef.current);

        reconciliationTimerRef.current = setTimeout(async () => {
            // 1. Verificar que el servidor responde antes de reconciliar
            try {
                await fetch(`${CONFIG.API_BASE_URL}/settings`, {
                    cache: 'no-store',
                    signal: AbortSignal.timeout(3000)
                });
            } catch {
                return; // Servidor aún no disponible — esperar al siguiente ciclo de netStatus
            }

            // 2. Sin cuenta activa → solo resetear estado
            if (!accountNumRef.current) {
                setLastSaveStatus('idle');
                return;
            }

            // 3. Reconciliar: el servidor es la fuente de verdad (filosofía Hub & Spoke)
            try {
                const liveTicket = await posService.getTicketByAccountNum(accountNumRef.current);
                if (liveTicket && liveTicket.items) {
                    const recovered = liveTicket.items.map(i => {
                        const originalProd = initialProducts.find(p => p.id === i.product.id) || {};
                        return {
                            id: i.product.id,
                            name: i.product.name,
                            price: i.product.price,
                            quantity: i.quantity,
                            category: i.product.category?.name || 'OTROS',
                            nature: i.product.nature || originalProd.nature || 'PRODUCTO'
                        };
                    });
                    cartRef.current = recovered;
                    setCart(recovered);
                    ticketVersionRef.current = liveTicket.version;
                    setTicketVersion(liveTicket.version);
                    setLastSaveStatus('saved');
                    setLastSaveTime(new Date());
                    setToastMessage('🔄 Conexión recuperada. Carrito sincronizado con el servidor.');
                } else {
                    // Ticket no existe en servidor — los items nunca se persistieron
                    setLastSaveStatus('idle');
                    setToastMessage('🔄 Conexión recuperada. Los cambios previos no llegaron al servidor — reintente.');
                }
                setTimeout(() => setToastMessage(null), 5000);
            } catch (e) {
                console.warn('⚠️ Reconciliación post-reconexión falló:', e);
            }
        }, 10000);

        return () => {
            if (reconciliationTimerRef.current) {
                clearTimeout(reconciliationTimerRef.current);
                reconciliationTimerRef.current = null;
            }
        };
    }, [lastSaveStatus, netStatus]);

    // --- Persistencia de Metadatos de Sesión ---
    useEffect(() => {
        if (!selectedTerminal) return;
        const sessionKey = `pos_session_${selectedTerminal}`;
        try {
            const sessionData = { 
                currentAccountNum, 
                orderType, 
                orderData: (orderData && typeof orderData === 'object') ? orderData : null, 
                originalCapturer: (originalCapturer && typeof originalCapturer === 'object') 
                    ? { id: originalCapturer.id, name: originalCapturer.name } 
                    : null 
            };
            localStorage.setItem(sessionKey, JSON.stringify(sessionData));
        } catch (e) { 
            console.warn("No se pudo guardar la persistencia de sesión:", e); 
        }
    }, [selectedTerminal, currentAccountNum, orderType, orderData, originalCapturer]);

    // --- Hook de Tickets: toda la lógica de negocio ---
    const { handleTicketAction, handlePrintTicket, handleAddToCart, handleRecoverAccount } = useTicketActions({
        selectedTerminal,
        currentUser,
        currentAccountNum,
        orderType,
        orderData,
        cashSessionId,
        cartRef,
        accountNumRef,
        originalCapturerRef,
        ticketVersionRef,
        isGeneratingFolioRef,
        isRecoveringRef,
        actionMutexRef,
        savedTicketRef,
        addToCart,
        setCart,
        clearCart,
        cart,
        total,
        initialProducts,
        generateNewAccountNum,
        setCurrentAccountNum,
        setOriginalCapturer,
        setTicketVersion,
        setToastMessage,
        setLastSaveStatus,
        setLastSaveTime,
        setShowCheckout,
        setIsSendingToPizarron,
        setPaymentsHistory,
        setOrderType,
        setOrderData,
        setShowCorkboard,
        setAllOpenAccounts,
        // v17: setters del modal de salida — la rama success los limpia para
        // corregir la asimetría verificada en FASE 0.
        setShowExitModal,
        setPendingExitAction,
        paymentsHistory,
    });

    // --- Efectos de sincronización ---
    useEffect(() => {
        if (selectedTerminal) {
            const syncCashState = async () => {
                try {
                    const session = await cashService.obtenerSesionActiva(selectedTerminal);
                    if (session) {
                        setIsCashEnabled(true);
                        setCashSessionId(session.id);
                    } else {
                        setIsCashEnabled(false);
                        setCashSessionId(null);
                    }
                } catch (e) {
                    console.error("Error sincronizando estado de caja:", e);
                }
            };
            syncCashState();
        }
    }, [selectedTerminal, currentAccountNum, generateNewAccountNum]);

    // v12 (Fase 12.3): se pasan selectedTerminal y currentUser para liberar
    // el lock huérfano al cerrar/navegar fuera de la pestaña.
    useBeforeUnload(cartRef, accountNumRef, CONFIG.API_BASE_URL, selectedTerminal, currentUser);

    useBarcodeScanner(PRODUCTS, handleAddToCart);

    // --- Polling de Cuentas Abiertas (optimizado: solo actualiza si hay cambios reales) ---
    const lastAccountsHashRef = useRef('');
    useEffect(() => {
        if (!showCorkboard) return;
        const fetchOpenAccounts = () => {
            posService.getOpenTickets().then(data => {
                const mapped = data.map(t => ({
                    id: t.account_num,
                    accountNum: t.account_num,
                    terminal: t.terminal_id || 'T1',
                    total: t.total,
                    items: t.items.length,
                    rawItems: t.items,
                    timestamp: t.created_at,
                    capturedById: t.captured_by_id,
                    capturedByName: t.captured_by_name || t.captured_by?.name || 'Desconocido',
                    cashierName: t.cashed_by_name || t.cashed_by?.name || '---',
                    clientName: t.customer_name || 'Público General',
                    version: t.version || 1,
                    orderType: t.order_type,
                    orderStatus: t.order_status,
                    deliveryType: t.delivery_type,
                    customerPhone: t.customer_phone,
                    committedAt: t.committed_at,
                    packagingType: t.packaging_type,
                    deliveryAddress: t.delivery_address,
                    orderNotes: t.order_notes
                }));
                // Solo actualizar estado si los datos realmente cambiaron
                const newHash = JSON.stringify(mapped.map(a => a.id + a.total + a.version));
                if (newHash !== lastAccountsHashRef.current) {
                    lastAccountsHashRef.current = newHash;
                    setAllOpenAccounts(mapped);
                }
            }).catch(console.error);
        };
        fetchOpenAccounts();
        const interval = setInterval(fetchOpenAccounts, 5000);
        return () => clearInterval(interval);
    }, [showCorkboard]);

    const visibleAccounts = allOpenAccounts;

    // Hook global para que ExperimentCenterUI pueda preguntar antes de desmontar
    useEffect(() => {
        window.requestPOSExit = (actionCallback) => {
            if (cartRef.current.length > 0 && accountNumRef.current) {
                setPendingExitAction(() => actionCallback);
                setShowExitModal(true);
                return true; // Interceptado, mostrando modal
            }
            return false; // Puede salir directo
        };
        return () => {
            delete window.requestPOSExit;
        };
    }, []);

    // --- Renderizado ---
    if (!selectedTerminal) {
        return (
            <TerminalSelector 
                currentUser={currentUser}
                terminalStatuses={terminalStatuses}
                setTerminalStatuses={setTerminalStatuses}
                onTerminalSelected={setSelectedTerminal}
                assignedTerminal={assignedTerminal}
            />
        );
    }

    // --- Lógica de salida con protección contra olvido ---
    const canSwitchTerminal = !assignedTerminal || currentUser?.role === 'ADMIN' || currentUser?.permissions?.access_any_terminal === 'full';

    const handleTerminalSwitch = () => {
        if (!canSwitchTerminal) return;
        // Si tiene items en el carrito, mostrar modal de confirmación
        if (cartRef.current.length > 0 && accountNumRef.current) {
            setPendingExitAction(() => doTerminalExit);
            setShowExitModal(true);
            return;
        }
        // Sin items — salir directo
        doTerminalExit();
    };

    const doTerminalExit = async () => {
        setShowExitModal(false);
        try {
            await posService.unlockTerminal(selectedTerminal, currentUser?.id);
        } catch(e) { console.error("Could not unlock terminal", e); }
        try {
            localStorage.removeItem(`pos_session_${selectedTerminal}`);
            localStorage.removeItem(`pos_cart_${selectedTerminal}`);
            clearCart();
            setCurrentAccountNum('');
            setOriginalCapturer(null);
        } catch(e) {}
        setSelectedTerminal(null);
    };

    const handleSendThenExit = async () => {
        setShowExitModal(false);
        try {
            // v7.0.3: Contrato de resultado. NO basta con que no lance excepción:
            // los fallos de negocio (vacío, ya pagado, verificación fallida) retornan
            // 'aborted' SIN lanzar. Solo 'success' garantiza persistencia verificada.
            const result = await handleTicketAction('OPEN');
            if (result?.outcome === 'success') {
                // Enviado y verificado: ejecutar la acción pendiente (logout, cambiar tab, o doTerminalExit)
                if (pendingExitAction) {
                    pendingExitAction();
                    setPendingExitAction(null);
                }
            } else {
                // No se persistió: NO salir. Mantener la sesión y avisar al usuario.
                console.warn('⚠️ Envío no confirmado antes de salir:', result?.outcome, result?.reason);
                setToastMessage('❌ No se pudo enviar al Pizarrón. La cuenta sigue abierta. Intente de nuevo.');
                setTimeout(() => setToastMessage(null), 5000);
            }
        } catch (e) {
            console.error('Error enviando al pizarrón antes de salir:', e);
            setToastMessage('❌ No se pudo enviar al Pizarrón. Intente de nuevo.');
            setTimeout(() => setToastMessage(null), 4000);
        }
    };

    const handleExitWithoutSaving = () => {
        setShowExitModal(false);
        // v17: La limpieza de sesión se centraliza en buildResetPatch() (fuente única
        // de verdad). Antes era un "espejo" manual que podía desincronizarse de la
        // rama success de handleTicketAction (asimetría verificada en FASE 0).
        // Las REFS se siguen sincronizando a mano: buildResetPatch() es pura y no
        // puede tocarlas. La función define los VALORES; aquí se APLICAN.
        try {
            const patch = buildResetPatch();
            clearCart();
            cartRef.current = [];
            accountNumRef.current = '';
            originalCapturerRef.current = null;
            ticketVersionRef.current = null;
            savedTicketRef.current = null;
            setOriginalCapturer(patch.originalCapturer);
            setCurrentAccountNum(patch.currentAccountNum);
            setTicketVersion(patch.ticketVersion);
            setOrderData(patch.orderData);
            setOrderType(patch.orderType);
            setLastSaveStatus(patch.lastSaveStatus);
            setLastSaveTime(patch.lastSaveTime);
            setShowCheckout(patch.showCheckout);
            setPaymentsHistory(patch.paymentsHistory);
            setShowExitModal(patch.showExitModal);
            setPendingExitAction(patch.pendingExitAction);
            try {
                if (selectedTerminal) localStorage.removeItem(`pos_session_${selectedTerminal}`);
            } catch (e) { console.warn("Error al limpiar persistencia:", e); }
        } catch (cleanupErr) {
            console.error('Error limpiando estado al salir sin enviar:', cleanupErr);
        }
        if (pendingExitAction) {
            pendingExitAction();
            setPendingExitAction(null);
        }
    };

    // v7.0.3: Force logout (la terminal fue tomada por otro usuario).
    // Se dispara un sendBeacon de emergencia SIN await para no bloquear el logout
    // (evita la espera de hasta 6.5s del mutex + reintentos). El beacon incluye
    // terminal_id para que el backend asocie el ticket a la terminal correcta.
    const handleForceLogout = () => {
        try {
            const liveCart = cartRef.current;
            const liveAccountNum = accountNumRef.current;
            if (liveCart && liveCart.length > 0 && liveAccountNum) {
                const payload = JSON.stringify({
                    account_num: liveAccountNum,
                    terminal_id: selectedTerminal || null,
                    items: liveCart.map(i => ({ product_id: i.id, quantity: i.quantity || 1 })),
                });
                const url = `${CONFIG.API_BASE_URL}/pos/tickets/emergency-save`;
                if (navigator.sendBeacon) {
                    navigator.sendBeacon(url, new Blob([payload], { type: 'application/json' }));
                } else {
                    fetch(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: payload,
                        keepalive: true,
                    }).catch(() => {});
                }
            }
        } catch (e) {
            console.warn('Force logout: no se pudo enviar beacon de emergencia:', e);
        }
        // Delegar el logout real (no se espera el beacon — fire-and-forget)
        onForceLogout();
    };

    // --- FASE 2: Wrappers con persistencia inmediata ---
    // v7.0.2: withRetries centralizado — las 3 operaciones usan la misma utilidad DRY

    const handleUpdateQuantity = async (productId, newQuantity) => {
        updateQuantity(productId, newQuantity); // UI instantánea
        if (!accountNumRef.current) return;
        try {
            const result = await withRetries(
                () => posService.updateItemQuantity({
                    account_num: accountNumRef.current,
                    product_id: productId,
                    new_quantity: newQuantity,
                    version: ticketVersionRef.current
                }),
                { label: 'updateQuantity' }
            );
            if (result?.version) {
                ticketVersionRef.current = result.version;
                setTicketVersion(result.version);
            }
            setLastSaveStatus('saved');
            setLastSaveTime(new Date());
        } catch (e) {
            setLastSaveStatus('failed');
        }
    };

    const handleRemoveFromCart = async (productId) => {
        removeFromCart(productId); // UI instantánea
        if (!accountNumRef.current) return;
        try {
            const result = await withRetries(
                () => posService.removeItemFromTicket({
                    account_num: accountNumRef.current,
                    product_id: productId,
                    version: ticketVersionRef.current
                }),
                { label: 'removeItem' }
            );
            if (result?.version) {
                ticketVersionRef.current = result.version;
                setTicketVersion(result.version);
            }
            setLastSaveStatus('saved');
            setLastSaveTime(new Date());
        } catch (e) {
            setLastSaveStatus('failed');
        }
    };

    return (
        <div className="flex flex-col h-full bg-transparent text-white overflow-hidden">
            <POSHeader
                selectedTerminal={selectedTerminal}
                currentUser={currentUser}
                assignedTerminal={assignedTerminal}
                netStatus={netStatus}
                netLatency={netLatency}
                currentAccountNum={currentAccountNum}
                cartLength={cart.length}
                orderType={orderType}
                orderData={orderData}
                isCashEnabled={isCashEnabled}
                visibleAccountsCount={visibleAccounts.length}
                lastSaveStatus={lastSaveStatus}
                lastSaveTime={lastSaveTime}
                categories={categories}
                activeCategory={activeCategory}
                viewMode={viewMode}
                onTerminalSwitch={handleTerminalSwitch}
                onOrderTypeChange={setOrderType}
                onOrderDataClear={() => setOrderData(null)}
                onOpenProgramacion={() => setShowProgramacion(true)}
                onOpenGestorCaja={() => setShowGestorCaja(true)}
                onOpenCorkboard={() => setShowCorkboard(true)}
                onCategoryChange={setActiveCategory}
                onViewModeChange={setViewMode}
                onPageChange={setCurrentPage}
            />

            {/* Main Content */}
            <div className="flex-1 flex overflow-hidden">
                <div className="flex-1 flex flex-col p-4 pt-0 pb-24 bg-transparent overflow-hidden">
                    {viewMode === 'CAMERA' ? (
                        <VisionVisor 
                            isScanning={isScanning} 
                            setIsScanning={setIsScanning} 
                            addToCart={handleAddToCart} 
                            products={PRODUCTS} 
                            categories={categories} 
                        />
                    ) : (
                        <div className="flex-1 flex flex-col animate-in fade-in slide-in-from-left-4 duration-500">
                            <ProductGrid 
                                products={PRODUCTS} 
                                category={activeCategory} 
                                currentPage={currentPage} 
                                setCurrentPage={setCurrentPage} 
                                onAddToCart={handleAddToCart} 
                            />
                        </div>
                    )}
                </div>

                <SalesReceipt 
                    cart={cart} 
                    removeFromCart={handleRemoveFromCart} 
                    updateQuantity={handleUpdateQuantity}
                    total={total} 
                    currentAccountNum={currentAccountNum} 
                    selectedTerminal={selectedTerminal} 
                    handleCheckout={(method) => handleTicketAction('PAID', method)} 
                    handleHoldAccount={() => handleTicketAction('OPEN')}
                    cashEnabled={isCashEnabled}
                    isSendingToPizarron={isSendingToPizarron}
                    lastSaveStatus={lastSaveStatus}
                />
            </div>

            {showCheckout && (
                <CheckoutScreen 
                    cart={cart}
                    total={total}
                    orderData={orderData}
                    onConfirm={async (method) => {
                        await handleTicketAction('PAID', method, true);
                    }}
                    onClose={() => setShowCheckout(false)}
                />
            )}

            {showCorkboard && (
                <OpenAccountsCorkboard
                    openAccounts={visibleAccounts}
                    onSelectAccount={handleRecoverAccount}
                    onClose={() => setShowCorkboard(false)}
                />
            )}

            {showGestorCaja && (
                <GestorDeCaja
                    terminalId={selectedTerminal}
                    currentUser={currentUser}
                    onCajaHabilitada={(sessionId) => {
                        setIsCashEnabled(true);
                        setCashSessionId(sessionId);
                    }}
                    onCajaDeshabilitada={() => {
                        setIsCashEnabled(false);
                        setCashSessionId(null);
                    }}
                    onClose={() => setShowGestorCaja(false)}
                />
            )}

            {showProgramacion && (
                <ProgramacionPedidoModal
                    cart={cart}
                    allProducts={initialProducts}
                    currentAccountNum={currentAccountNum}
                    initialData={orderData}
                    onClose={() => setShowProgramacion(false)}
                    onAddToCart={addToCart}
                    onSave={(data) => {
                        setOrderData(data);
                        setShowProgramacion(false);
                    }}
                />
            )}

            <ForceLogoutModal visible={forceLogoutModal} onForceLogout={handleForceLogout} />
            <ToastNotification message={toastMessage} />

            {/* Modal de Confirmación de Salida */}
            {showExitModal && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 animate-in fade-in duration-300">
                    {/* v7.0.3: el backdrop debe limpiar pendingExitAction igual que "Cancelar",
                        para que una acción pendiente no se dispare en una salida posterior. */}
                    <div
                        className="absolute inset-0 bg-black/70"
                        onClick={() => {
                            setShowExitModal(false);
                            setPendingExitAction(null);
                        }}
                    />
                    <div className="relative bg-gradient-to-b from-zinc-800 to-zinc-900 rounded-3xl p-8 max-w-md w-full shadow-2xl border border-white/10">
                        {/* Icono de advertencia */}
                        <div className="text-center mb-6">
                            <span className="text-6xl">⚠️</span>
                        </div>
                        
                        <h3 className="text-xl font-black text-white text-center mb-2 uppercase tracking-wider">
                            Cuenta sin enviar
                        </h3>
                        <p className="text-zinc-400 text-center text-sm mb-2">
                            La cuenta <span className="font-bold text-amber-400">{currentAccountNum}</span> con{' '}
                            <span className="font-bold text-white">{cart.length} producto{cart.length !== 1 ? 's' : ''}</span>{' '}
                            (${total.toFixed(2)}) no fue enviada al Pizarrón.
                        </p>
                        <p className="text-zinc-500 text-center text-xs mb-8">
                            Si sale sin enviar, esta cuenta se perderá.
                        </p>

                        {/* Botones */}
                        <div className="space-y-3">
                            <button
                                onClick={handleSendThenExit}
                                className="w-full h-14 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black uppercase tracking-wider text-sm flex items-center justify-center gap-3 transition-all hover:scale-[1.02] active:scale-95 shadow-lg"
                            >
                                📌 Enviar al Pizarrón y salir
                            </button>
                            <button
                                onClick={handleExitWithoutSaving}
                                className="w-full h-12 rounded-2xl bg-red-600/20 hover:bg-red-600/40 text-red-400 hover:text-red-300 font-bold uppercase tracking-wider text-xs flex items-center justify-center gap-2 transition-all border border-red-600/30"
                            >
                                🚪 Salir sin enviar — perder cuenta
                            </button>
                            <button
                                onClick={() => {
                                    setShowExitModal(false);
                                    setPendingExitAction(null);
                                }}
                                className="w-full h-10 rounded-xl text-zinc-500 hover:text-zinc-300 font-medium text-xs uppercase tracking-widest transition-all"
                            >
                                Cancelar — quedarme
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
