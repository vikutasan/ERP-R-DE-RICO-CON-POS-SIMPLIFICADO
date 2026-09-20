import { useState, useEffect, useCallback, useRef } from 'react';
import { posService } from '../services/POSService';
import { generateTicketHTML, combineOrderTicketsForPrint } from '../utils/ticketGenerator';
import { withRetries } from '../utils/withRetries';
import { buildResetPatch } from '../state/sessionReset';

/**
 * Hook: useTicketActions
 * 
 * SIMPLIFICACIÓN v6.0 — Modelo SaaS
 * 
 * UN SOLO CAMINO DE ESCRITURA:
 * - handleAddToCart: persiste cada item atómicamente (Fase 2)
 * - handleTicketAction: SOLO para acciones EXPLÍCITAS del usuario
 *   (enviar al pizarrón = OPEN, cobrar = PAID)
 * 
 * SE ELIMINÓ:
 * - Auto-save bulk (causaba race condition con Fase 2)
 * - resilientCreateTicket / cola offline
 * - FLUSH de seguridad en handleRecoverAccount
 * - CollisionModal (auto-heal inline es suficiente)
 * - handleLoadDraft / handleDiscardDraft (pizarrón de borradores eliminado)
 */
export const useTicketActions = ({
    // Estado compartido
    selectedTerminal,
    currentUser,
    currentAccountNum,
    orderType,
    orderData,
    cashSessionId,
    // Refs compartidas
    cartRef,
    accountNumRef,
    originalCapturerRef,
    ticketVersionRef,
    isGeneratingFolioRef,
    isRecoveringRef,
    actionMutexRef,
    savedTicketRef,
    // Funciones del carrito
    addToCart: cartAddToCart,
    setCart,
    clearCart,
    cart,
    total,
    // initialProducts para mapeo de recovery
    initialProducts,
    // Funciones de sesión
    generateNewAccountNum,
    // Setters de estado UI
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
    // v17: setters del modal de salida — necesarios para que la rama success
    // limpie la asimetría verificada (showExitModal / pendingExitAction).
    setShowExitModal,
    setPendingExitAction,
    // Estado de pagos
    paymentsHistory,
}) => {
    const [printTicketData, setPrintTicketData] = useState(null);

    // --- Impresión de Ticket ---
    const handlePrintTicket = useCallback((ticketData = null) => {
        const activeTicket = ticketData || printTicketData || { 
            account_num: currentAccountNum,
            items: cart.map(i => ({ product: { name: i.name }, quantity: i.quantity, unit_price: i.price })),
            total: total,
            payment_details: paymentsHistory,
            captured_by: originalCapturerRef.current || { id: currentUser?.id, name: currentUser?.name || 'SISTEMA' },
            cashed_by: { id: currentUser?.id, name: currentUser?.name || 'SISTEMA' },
            terminal_id: selectedTerminal,
            created_at: new Date().toISOString()
        };
        
        // PEDIDO pagado: doble copia (CLIENTE + COMERCIO) en un solo print
        // VENTA DIRECTA: copia única estándar
        const html = (activeTicket.order_type === 'PEDIDO')
            ? combineOrderTicketsForPrint(activeTicket)
            : generateTicketHTML(activeTicket);

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
            setTimeout(() => {
                document.body.removeChild(iframe);
            }, 1000);
        }, 500); 
    }, [printTicketData, currentAccountNum, cart, total, currentUser, selectedTerminal]);

    // --- Acción principal de Tickets (SOLO para acciones EXPLÍCITAS: OPEN o PAID) ---
    // v7.0.3: Contrato de resultado discriminado.
    // outcome: 'success'   → el ticket quedó persistido y verificado en el servidor
    //          'aborted'   → no se persistió (vacío, sin pago, error de negocio, verificación fallida)
    //          'navigated' → se abrió otra pantalla (checkout) sin persistir
    //          'not_finalized' → se persistió pero finalizeUI=false (no se limpió la UI)
    // reason: string opcional para diagnóstico/tests (ej. 'empty_cart', 'already_paid')
    const handleTicketAction = async (status, paymentData = null, finalizeUI = true) => {
        // Adquirir Lock Mutex para evitar self-collisions
        const previousPromise = actionMutexRef.current;
        let releaseMutex;
        actionMutexRef.current = new Promise(resolve => releaseMutex = resolve);
        
        await previousPromise;

        try {
            // Leer SIEMPRE de refs DESPUÉS de adquirir el lock
            const liveCart = cartRef.current;
            const liveAccountNum = accountNumRef.current;
            const liveCapturer = originalCapturerRef.current;
            const liveVersion = ticketVersionRef.current;

            if (liveCart.length === 0) {
                setToastMessage("⚠️ El ticket está vacío.");
                setTimeout(() => setToastMessage(null), 3000);
                return { outcome: 'aborted', reason: 'empty_cart' };
            }
            
            // Si no hay datos de pago y se intenta cobrar, abrir pantalla de pago
            if (status === 'PAID' && (!paymentData || paymentData.length === 0)) {
                setShowCheckout(true);
                return { outcome: 'navigated', reason: 'checkout_opened' };
            }

            // Loading visual para envío al Pizarrón
            if (finalizeUI && status === 'OPEN') setIsSendingToPizarron(true);

            try {
                let targetAccountNum = liveAccountNum;
                if (!targetAccountNum) {
                    targetAccountNum = await generateNewAccountNum();
                }

                if (paymentData) setPaymentsHistory(paymentData);
                const terminalId = selectedTerminal || 'T1';
                let session = await posService.getActiveSession(terminalId);
                if (!session) session = await posService.createSession(terminalId);

                let payload = {
                    account_num: targetAccountNum,
                    session_id: session.id,
                    items: liveCart.map(i => ({ product_id: i.id, quantity: i.quantity || 1 })),
                    status: status,
                    payment_details: paymentData,
                    cash_session_id: cashSessionId,
                    captured_by_id: liveCapturer?.id || currentUser?.id || null,
                    cashed_by_id: status === 'PAID' ? (currentUser?.id || null) : null,
                    order_type: orderType,
                    version: liveVersion
                };

                // Inyectar data del OMS si es pedido
                if (orderType === 'PEDIDO' && orderData) {
                    payload = { 
                        ...payload, 
                        ...orderData,
                        order_notes: orderData.notes // Ensure notes are mapped properly for backend schema
                    };
                }

                let savedTicket = null;
                // v7.0.2: Retries para errores de red. Errores de negocio (409, folio pagado) NO se reintentan.
                const isBusinessError = (err) => {
                    const msg = err?.message || '';
                    return msg.includes('ya ha sido pagado') || msg.includes('Conflicto de versión');
                };
                try {
                    savedTicket = await withRetries(
                        () => posService.createTicket(payload),
                        {
                            maxRetries: 3,
                            shouldRetry: (err) => !isBusinessError(err),
                            label: status === 'PAID' ? 'Cobro' : 'Envío a Pizarrón',
                        }
                    );
                } catch (err) {
                    const errorMessage = err.message || "";

                    if (errorMessage.includes("ya ha sido pagado")) {
                        // Folio ya pagado — informar al cajero claramente
                        setToastMessage(`⚠️ El folio ${targetAccountNum} ya fue cobrado. Recupere la cuenta del Pizarrón o inicie una nueva.`);
                        setTimeout(() => setToastMessage(null), 8000);
                        return { outcome: 'aborted', reason: 'already_paid' };

                    } else if (errorMessage.includes("Conflicto de versión")) {
                        // AUTO-HEAL: Descargar versión fresca del servidor
                        if (targetAccountNum) {
                            try {
                                console.log(`🔄 Auto-Heal: Descargando versión fresca de ${targetAccountNum}...`);
                                const liveTicket = await posService.getTicketByAccountNum(targetAccountNum);
                                if (liveTicket && liveTicket.items) {
                                    isRecoveringRef.current = true;
                                    
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
                                    
                                    setToastMessage("⚠️ ¡Atención! Otro vendedor modificó esta cuenta. Totales actualizados.");
                                    setTimeout(() => setToastMessage(null), 5000);
                                    setShowCheckout(false);
                                    setIsSendingToPizarron(false);
                                    
                                    requestAnimationFrame(() => {
                                        isRecoveringRef.current = false;
                                    });
                                    // Abortar — el usuario puede reintentar con datos frescos
                                    return { outcome: 'aborted', reason: 'version_conflict_autoheal' };
                                }
                            } catch (e) {
                                console.error("Error auto-recovering ticket", e);
                            }
                        }
                        // Si auto-heal falla, mostrar error claro
                        throw err;

                    } else {
                        throw err;
                    }
                }
                
                // Actualizar versión SINCRÓNICAMENTE en la ref
                if (savedTicket?.version) {
                    ticketVersionRef.current = savedTicket.version;
                    setTicketVersion(savedTicket.version);
                }
                
                setPrintTicketData(savedTicket);
                savedTicketRef.current = savedTicket;
                
                // El carrito solo se limpia DESPUÉS de confirmar el guardado
                // + VERIFICACIÓN POST-ENVÍO (v6.1): confirmar que el ticket existe en el servidor
                if (finalizeUI) {
                    if (status === 'PAID') {
                        handlePrintTicket(savedTicket);
                    }
                    if (savedTicket) {
                        // 🔒 VERIFICACIÓN: Antes de limpiar, confirmar que el ticket está en la DB
                        if (status === 'OPEN') {
                            try {
                                const verification = await posService.getTicketByAccountNum(targetAccountNum);
                                if (!verification || verification.status !== 'OPEN') {
                                    console.error('⚠️ VERIFICACIÓN FALLÓ: El ticket no se encontró en el servidor después de guardarlo');
                                    setToastMessage('⚠️ ¡ATENCIÓN! El envío pareció exitoso pero el ticket NO se encontró en el servidor. NO se limpió el carrito. Intente de nuevo.');
                                    setTimeout(() => setToastMessage(null), 10000);
                                    // NO limpiar el carrito — el ticket puede no haberse guardado
                                    return { outcome: 'aborted', reason: 'verification_failed' };
                                }
                            } catch (verifyErr) {
                                console.error('⚠️ Error verificando ticket post-envío:', verifyErr);
                                setToastMessage('⚠️ No se pudo verificar el envío. El carrito NO se limpió por seguridad. Intente de nuevo.');
                                setTimeout(() => setToastMessage(null), 10000);
                                // NO limpiar — mejor seguro que perder datos
                                return { outcome: 'aborted', reason: 'verification_error' };
                            }
                        }

                        // v17: Limpieza centralizada vía buildResetPatch() (fuente única de
                        // verdad). Antes esta rama limpiaba 10 cosas a mano y OMITÍA
                        // savedTicketRef / showExitModal / pendingExitAction, mientras
                        // handleExitWithoutSaving SÍ los limpiaba (asimetría verificada en
                        // FASE 0). Ahora ambas rutas limpian exactamente lo mismo.
                        // Las REFS se sincronizan a mano: buildResetPatch() es pura.
                        const patch = buildResetPatch();
                        clearCart();
                        savedTicketRef.current = null;
                        setOriginalCapturer(patch.originalCapturer);
                        setCurrentAccountNum(patch.currentAccountNum);
                        setTicketVersion(patch.ticketVersion);
                        setOrderData(patch.orderData);
                        setOrderType(patch.orderType);
                        setLastSaveStatus(patch.lastSaveStatus);
                        setLastSaveTime(patch.lastSaveTime);
                        try {
                            if (selectedTerminal) localStorage.removeItem(`pos_session_${selectedTerminal}`);
                        } catch (e) { console.warn("Error al limpiar persistencia:", e); }
                        setShowCheckout(patch.showCheckout);
                        setPaymentsHistory(patch.paymentsHistory);
                        setShowExitModal(patch.showExitModal);
                        setPendingExitAction(patch.pendingExitAction);
                        if (status === 'PAID') {
                            setToastMessage('✅ Venta finalizada exitosamente. Ticket impreso.');
                            setTimeout(() => setToastMessage(null), 4000);
                        }
                        if (status === 'OPEN') {
                            setToastMessage('📌 Cuenta guardada en el Pizarrón exitosamente. ✅ Verificado.');
                            setTimeout(() => setToastMessage(null), 3000);
                        }
                        return { outcome: 'success', reason: status === 'PAID' ? 'paid' : 'sent_to_pizarron' };
                    }
                    // finalizeUI=false: se persistió pero NO se limpió la UI (uso interno)
                    return { outcome: 'not_finalized', reason: 'finalize_ui_disabled' };
                }
                // finalizeUI=false y sin savedTicket: nada persistido
                return { outcome: 'not_finalized', reason: 'finalize_ui_disabled' };
            } catch (error) {
                console.error("Ticket action error:", error);
                if (finalizeUI) {
                    const errMsg = error.detail || error.message || "";
                    if (!errMsg.includes("Conflicto de versión")) {
                        setToastMessage(`❌ ${errMsg || "Error al procesar el ticket."}`);
                        setTimeout(() => setToastMessage(null), 5000);
                    }
                }
                throw error;
            } finally {
                setIsSendingToPizarron(false);
            }
        } finally {
            releaseMutex(); // Liberar el candado
        }
    };

    // --- Agregar al carrito con PERSISTENCIA INMEDIATA (Fase 2 — Estilo SaaS) ---
    const handleAddToCart = async (product) => {
        cartAddToCart(product); // UI reacciona instantáneamente (optimistic update)

        let targetAccount = accountNumRef.current;
        if (!targetAccount) {
            try {
                targetAccount = await generateNewAccountNum();
            } catch (e) {
                console.error('⚠️ Error generando folio:', e);
                setLastSaveStatus('failed');
                return;
            }
        }

        if (!targetAccount) return;

        // v7.0.2: withRetries centralizado (misma utilidad que update/remove)
        try {
            const result = await withRetries(async () => {
                const terminalId = selectedTerminal || 'T1';
                let session = await posService.getActiveSession(terminalId);
                if (!session) session = await posService.createSession(terminalId);

                return await posService.addItemToTicket({
                    account_num: targetAccount,
                    product_id: product.id,
                    quantity: product.quantity || 1,
                    session_id: session.id,
                    terminal_id: terminalId,
                    captured_by_id: originalCapturerRef.current?.id || currentUser?.id,
                    version: ticketVersionRef.current
                });
            }, { label: 'addItem' });

            // Sincronizar versión del servidor
            if (result?.version) {
                ticketVersionRef.current = result.version;
                setTicketVersion(result.version);
            }
            setLastSaveStatus('saved');
            setLastSaveTime(new Date());
        } catch (e) {
            setLastSaveStatus('failed');
            setToastMessage('⚠️ No se pudo guardar el último producto. Verifique la conexión.');
            setTimeout(() => setToastMessage(null), 5000);
        }
    };

    // --- Recuperación de Cuenta del Pizarrón (SIMPLIFICADA — sin FLUSH) ---
    const handleRecoverAccount = async (account) => {
        // v6.0: FLUSH ELIMINADO. Con Fase 2, cada operación ya está en el servidor.
        // Si el carrito local tiene items, ya están persistidos en la DB como DRAFT.
        // No necesitamos guardar nada extra — la DB YA es la fuente de verdad.

        // Bloquear auto-save (por compatibilidad con refs)
        isRecoveringRef.current = true;

        // Obtener siempre la versión más fresca directamente del servidor
        let freshItems = account.rawItems;
        let freshVersion = account.version;
        let freshCapturer = account.capturedById ? { id: account.capturedById, name: account.capturedByName } : null;
        
        try {
            const liveTicket = await posService.getTicketByAccountNum(account.accountNum);
            if (liveTicket && liveTicket.items) {
                console.log("⚡ Cuenta recuperada (Live Data):", liveTicket);
                freshItems = liveTicket.items;
                freshVersion = liveTicket.version;
                freshCapturer = liveTicket.captured_by_id ? { id: liveTicket.captured_by_id, name: liveTicket.captured_by_name || liveTicket.captured_by?.name } : freshCapturer;
            }
        } catch (e) {
            console.warn("⚠️ No se pudo obtener la versión fresca del ticket, usando datos del Pizarrón", e);
        }

        if (!freshItems?.length) {
            setToastMessage("⚠️ Cuenta vacía.");
            setTimeout(() => setToastMessage(null), 3000);
            isRecoveringRef.current = false;
            return;
        }

        const recovered = freshItems.map(i => {
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
        accountNumRef.current = account.accountNum;
        setCurrentAccountNum(account.accountNum);
        
        originalCapturerRef.current = freshCapturer || currentUser;
        setOriginalCapturer(freshCapturer || currentUser);
        ticketVersionRef.current = freshVersion || null;
        setTicketVersion(freshVersion || null);
        
        // Restaurar Order Data si la cuenta es un PEDIDO
        if (account.orderType === 'PEDIDO') {
            setOrderType('PEDIDO');
            setOrderData({
                order_type: account.orderType,
                delivery_type: account.deliveryType,
                customer_name: account.clientName,
                customer_phone: account.customerPhone,
                committed_at: account.committedAt,
                packaging_type: account.packagingType,
                delivery_address: account.deliveryAddress,
                notes: account.orderNotes
            });
        } else {
            setOrderType('VENTA_DIRECTA');
            setOrderData(null);
        }

        setShowCorkboard(false);

        // Desbloquear refs después de que React procese todos los setState
        requestAnimationFrame(() => {
            isRecoveringRef.current = false;
        });
    };

    return {
        handleTicketAction,
        handlePrintTicket,
        handleAddToCart,
        handleRecoverAccount,
        printTicketData,
    };
};
