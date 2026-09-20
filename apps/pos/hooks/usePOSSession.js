import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { posService } from '../services/POSService';
import { INITIAL_CATEGORIES, getProductEmoji } from '../utils/posConstants';

/**
 * Hook: usePOSSession
 * 
 * Maneja la inicialización de la sesión POS:
 * - Carga de categorías y productos desde el servidor
 * - Generación/reserva de folios (account_num) con retry
 * - Persistencia de metadatos de sesión en localStorage
 * - Zero-Auto-Restore: terminal siempre inicia en blanco
 * - Memo PRODUCTS con emoji y normalización
 * 
 * Extraído de RetailVisionPOS.jsx (v5.3 Modularización)
 */
export const usePOSSession = ({
    selectedTerminal,
    currentUser,
    clearCartRef, // Ref al clearCart (resuelve dependencia circular: usePOSSession se llama antes que useCart)
    // Refs compartidas (el componente padre las provee para mantener refs cruzadas con tickets/drafts)
    accountNumRef,
    originalCapturerRef,
    ticketVersionRef,
    isGeneratingFolioRef,
    // Setters del padre (estado compartido)
    setCurrentAccountNum,
    setOriginalCapturer,
    setTicketVersion,
    setToastMessage,
    setOrderType,
    setOrderData,
}) => {
    // --- Estado local del catálogo ---
    const [categories, setCategories] = useState([]);
    const [initialProducts, setInitialProducts] = useState([]);
    const [activeCategory, setActiveCategory] = useState(null);

    // v15 (H1/D4): primitivo estable para las deps del useCallback de folio.
    // Evita que un cambio de REFERENCIA del objeto currentUser invalide el callback.
    const currentUserId = currentUser?.id;

    // --- PRODUCTS memo: normalización para el grid ---
    const PRODUCTS = useMemo(() => initialProducts.map(p => ({
        ...p,
        id: p.id, 
        image: p.image_url,
        emoji: getProductEmoji(p),
        hasRealImage: !!p.image_url,
        category: p.category ? (typeof p.category === 'string' ? p.category : p.category.name) : 'OTROS'
    })), [initialProducts]);

    // --- Zero-Auto-Restore: Terminal SIEMPRE inicia en blanco ---
    useEffect(() => {
        if (!selectedTerminal) return;
        
        // REGLA DE NEGOCIO (Zero-Auto-Restore): 
        // A petición del usuario, la terminal SIEMPRE inicia en blanco.
        // Si hubo un corte de luz, un F5, o el usuario salió de golpe, 
        // NO se recupera la cuenta automáticamente en la pantalla principal.
        // Todo trabajo interrumpido queda como DRAFT en el servidor gracias
        // al auto-save, y DEBE ser recuperado manualmente desde el 
        // Pizarrón de Borradores.
        
        console.log(`🧹 Inicializando Terminal ${selectedTerminal}. Descartando caché local para iniciar en blanco...`);
        
        localStorage.removeItem(`pos_session_${selectedTerminal}`);
        localStorage.removeItem(`pos_cart_${selectedTerminal}`);
        
        if (clearCartRef.current) clearCartRef.current();
        setCurrentAccountNum('');
        setOriginalCapturer(null);
        setOrderType('VENTA_DIRECTA');
        setOrderData(null);
        
    }, [selectedTerminal]); // EJECUTAR SOLO AL INICIAR LA TERMINAL

    // --- Persistencia de Metadatos de Sesión ---
    // (Necesitamos leer estos valores del padre vía parámetro en cada render)
    // Se usa un efecto separado que depende de los valores del padre
    // NOTA: currentAccountNum, orderType, orderData, originalCapturer son del padre

    // --- Efectos de Carga ---
    useEffect(() => {
        const loadInitialData = async () => {
            try {
                const catData = await posService.getCategories();
                const normalized = catData
                    .filter(c => c.name.trim().toUpperCase() !== 'TODOS' && c.name.trim().toUpperCase() !== 'DESCONTINUADOS')
                    .map(c => {
                        const original = INITIAL_CATEGORIES.find(ic => ic.name === c.name);
                        return { ...c, icon: c.icon || (original ? original.icon : '📦') };
                    });
                setCategories(normalized);
                if (normalized.length > 0 && !activeCategory) setActiveCategory(normalized[0].name);

                const prodData = await posService.getProducts();
                // Ocultar productos que estén en el Limbo (DESCONTINUADOS)
                const activeProducts = prodData.filter(p => {
                    const catName = p.category ? (typeof p.category === 'string' ? p.category : p.category.name) : '';
                    return catName !== 'DESCONTINUADOS';
                });
                setInitialProducts(activeProducts);
            } catch (error) {
                console.error("Fetch error:", error);
                setToastMessage("❌ Error conectando con el ERP. Verifique el servidor.");
                setTimeout(() => setToastMessage(null), 5000);
            }
        };
        loadInitialData();
    }, []);

    // --- Generación de Folio (Account Num) con retry ---
    const accountGenPromise = useRef(null);
    const generateNewAccountNum = useCallback(async () => {
        if (accountGenPromise.current) return accountGenPromise.current;
        
        isGeneratingFolioRef.current = true; // Bloquear auto-save durante generación
        const promise = (async () => {
            const terminalId = selectedTerminal || 'T1';
            
            for (let attempt = 1; attempt <= 3; attempt++) {
                try {
                    const ticket = await posService.reserveTicket(terminalId, currentUserId || null);
                    // v4.3 ANTI-RACE: Sync refs ANTES del setState para que handleTicketAction
                    // nunca lea un accountNum vacío y genere un folio duplicado.
                    accountNumRef.current = ticket.account_num;
                    setCurrentAccountNum(ticket.account_num);
                    
                    // v4.4 Bugfix: Sincronizar versión del ticket reciclado para evitar 
                    // que el primer auto-save envíe version=null y rompa el tracking
                    const v = ticket.version || 1;
                    ticketVersionRef.current = v;
                    setTicketVersion(v);

                    const cap = ticket.captured_by
                        ? { id: ticket.captured_by.id, name: ticket.captured_by.name }
                        : currentUser;
                    originalCapturerRef.current = cap;
                    setOriginalCapturer(cap);
                    return ticket.account_num;
                } catch (error) {
                    console.error(`Error reservando cuenta (intento ${attempt}/3):`, error);
                    if (attempt < 3) {
                        await new Promise(r => setTimeout(r, 1000));
                    }
                }
            }
            
            setToastMessage("⚠️ Error de conexión. No se pudo reservar folio.");
            setTimeout(() => setToastMessage(null), 5000);
            throw new Error("No se pudo reservar cuenta después de 3 intentos");
        })();

        accountGenPromise.current = promise;
        try {
            return await promise;
        } finally {
            accountGenPromise.current = null;
            isGeneratingFolioRef.current = false; // Desbloquear auto-save
        }
    }, [selectedTerminal, currentUserId]);

    return {
        // Catálogo
        categories,
        initialProducts,
        PRODUCTS,
        activeCategory,
        setActiveCategory,
        // Folio
        generateNewAccountNum,
    };
};
