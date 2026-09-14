import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { cacheRouteData, getCachedRouteData, updateCachedVisits, enqueueOperation, processQueue, getPendingCount, bufferGPSPoint, flushGPSBuffer } from './services/offlineStore';
import { createNetworkMonitor } from './services/networkMonitor';
import { CONFIG } from './config';
import { securityService } from './services/securityService';
import { formatLocalTime } from '../shared/timezone';

// ─── Hook: Borrador de visita en localStorage ───
// Previene pérdida de datos cuando el SO del móvil mata la pestaña
// al cambiar de app (WhatsApp, llamada, etc.)
const VISIT_DRAFT_KEY = 'grandeza_visit_draft';

const useVisitDraft = () => {
    const saveDraft = (data) => {
        try { localStorage.setItem(VISIT_DRAFT_KEY, JSON.stringify(data)); }
        catch (e) { /* localStorage lleno o no disponible — falla silenciosa */ }
    };
    const loadDraft = () => {
        try {
            const raw = localStorage.getItem(VISIT_DRAFT_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (e) { return null; }
    };
    const clearDraft = () => {
        try { localStorage.removeItem(VISIT_DRAFT_KEY); } catch (e) {}
    };
    return { saveDraft, loadDraft, clearDraft };
};

const DriverBackground = () => (
    <>
        <div className="absolute inset-0 z-0 pointer-events-none" style={{
            backgroundImage: 'url("/assets/wood_bg.jpg")',
            backgroundSize: 'cover',
            backgroundPosition: 'center'
        }} />
        <div className="absolute inset-0 z-0 pointer-events-none bg-black/75" />
    </>
);

/**
 * HERRAMIENTA REPARTIDOR — Pan Grandeza (Fase 3)
 * UI optimizada para smartphone. El repartidor la usa en ruta.
 */
export const GrandezaDriverUI = ({ onBack, userPermissions = {} }) => {
    const API = CONFIG.API_BASE_URL;
    const LOGO_URL = `${CONFIG.API_BASE_URL.replace('/api/v1', '')}/static/images/grandeza/logo.png`;

    // ─── State ───
    const [loading, setLoading] = useState(true);
    const [journey, setJourney] = useState(null);
    const [grandezaProducts, setGrandezaProducts] = useState([]);
    const [initialInventory, setInitialInventory] = useState([]);
    const [clients, setClients] = useState([]);
    const [routeSlots, setRouteSlots] = useState([]);
    const [routeType, setRouteType] = useState('REGULAR');  // REGULAR | EXTRAORDINARIA
    const [routeLabel, setRouteLabel] = useState(null);     // Etiqueta de la ruta extraordinaria
    const [visits, setVisits] = useState([]);  // Visitas completadas hoy
    const [activeVisit, setActiveVisit] = useState(null); // Visita abierta
    const [visitItems, setVisitItems] = useState([]);
    const [paymentReceived, setPaymentReceived] = useState('');
    const [incidentNotes, setIncidentNotes] = useState('');
    const [extClientName, setExtClientName] = useState('');
    const [extClientPhone, setExtClientPhone] = useState('');
    const [toast, setToast] = useState(null);
    const [saving, setSaving] = useState(false);
    const [view, setView] = useState('route'); // route | visit | summary | order | expenses
    const [expenses, setExpenses] = useState([]);
    const [expDesc, setExpDesc] = useState('');
    const [expAmount, setExpAmount] = useState('');
    const [expSaving, setExpSaving] = useState(false);
    const [editingClient, setEditingClient] = useState(null);
    const [isOnline, setIsOnline] = useState(true);
    const [pendingSyncCount, setPendingSyncCount] = useState(0);
    const [lastVisitResult, setLastVisitResult] = useState(null); // Para modal post-visita
    const [showPaymentWarning, setShowPaymentWarning] = useState(false); // Modal aviso de pago faltante
    const [selectedVisitDetail, setSelectedVisitDetail] = useState(null); // Para modal detalle de visita en Resumen
    const [pinInput, setPinInput] = useState('');
    const networkMonitorRef = useRef(null);
    const canEditClients = userPermissions.all === 'full' || userPermissions.grandeza_edit_clients === 'full';

    const todayStr = () => {
        const formatter = new Intl.DateTimeFormat('en-US', {
            timeZone: 'America/Mexico_City',
            year: 'numeric', month: '2-digit', day: '2-digit'
        });
        const parts = formatter.formatToParts(new Date());
        const year = parts.find(p => p.type === 'year').value;
        const month = parts.find(p => p.type === 'month').value;
        const day = parts.find(p => p.type === 'day').value;
        return `${year}-${month}-${day}`;
    };

    const dayNames = { 0:'DOMINGO',1:'LUNES',2:'MARTES',3:'MIERCOLES',4:'JUEVES',5:'VIERNES',6:'SABADO' };
    const getTodayDay = () => {
        const mxDateStr = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Mexico_City', weekday: 'short' }).format(new Date());
        const mapping = { 'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6 };
        return dayNames[mapping[mxDateStr]] || 'LUNES';
    };
    const todayDay = getTodayDay();

    const showToast = (msg, type='success') => { setToast({msg,type}); setTimeout(()=>setToast(null), 3000); };

    // ─── Borrador de visita (anti-kill de pestaña móvil) ───
    const { saveDraft, loadDraft, clearDraft } = useVisitDraft();

    // Restaurar borrador al montar (si el SO mató la pestaña)
    useEffect(() => {
        const draft = loadDraft();
        if (draft && draft.activeVisit) {
            setVisitItems(draft.visitItems || []);
            setPaymentReceived(draft.paymentReceived || '');
            setIncidentNotes(draft.incidentNotes || '');
            setActiveVisit(draft.activeVisit);
            setExtClientName(draft.extClientName || '');
            setExtClientPhone(draft.extClientPhone || '');
            setView('visit');
        }
    }, []);

    // Persistir borrador en cada cambio mientras la visita está activa
    useEffect(() => {
        if (view === 'visit' && activeVisit) {
            saveDraft({ visitItems, paymentReceived, incidentNotes, activeVisit, extClientName, extClientPhone });
        }
    }, [visitItems, paymentReceived, incidentNotes, activeVisit, extClientName, extClientPhone, view]);

    // Cargar gastos al entrar a la vista de gastos o resumen
    const fetchExpenses = async () => {
        if (!journey?.id) return;
        try {
            const res = await fetch(`${API}/grandeza/journeys/${journey.id}/expenses`);
            if (res.ok) setExpenses(await res.json());
        } catch(e) { console.error(e); }
    };
    useEffect(() => {
        if ((view === 'expenses' || view === 'summary') && journey?.id) fetchExpenses();
    }, [view, journey?.id]);


    // ─── GPS: Guardar ubicación de un cliente ───
    const saveClientLocation = async (clientId) => {
        if (!navigator.geolocation) {
            showToast('⚠️ GPS no disponible en este dispositivo', 'error');
            return;
        }
        showToast('📡 Capturando ubicación...', 'success');
        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                const lat = pos.coords.latitude;
                const lng = pos.coords.longitude;
                const url = `https://www.google.com/maps?q=${lat},${lng}`;
                try {
                    const res = await fetch(`${API}/grandeza/clients/${clientId}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ google_maps_url: url })
                    });
                    if (res.ok) {
                        showToast('✅ Ubicación guardada correctamente');
                        // Actualizar clientes en memoria
                        setClients(prev => prev.map(c => c.id === clientId ? { ...c, google_maps_url: url } : c));
                    } else {
                        showToast('❌ Error al guardar ubicación', 'error');
                    }
                } catch (e) {
                    showToast('❌ Error de red al guardar', 'error');
                }
            },
            (err) => {
                showToast('❌ No se pudo obtener GPS. Activa la ubicación.', 'error');
            },
            { enableHighAccuracy: true, timeout: 10000 }
        );
    };

    // ─── Load ───
    useEffect(() => { loadAll(); }, []);

    // ─── Monitor de Red + Auto-Sync ───
    useEffect(() => {
        const apiHost = CONFIG.API_BASE_URL.replace(/\/api\/v1$/, '');
        const monitor = createNetworkMonitor(apiHost);
        networkMonitorRef.current = monitor;
        setIsOnline(monitor.isOnline());

        monitor.onStatusChange(async (online) => {
            setIsOnline(online);
            if (online) {
                // Sincronizar cola de operaciones pendientes
                const result = await processQueue();
                if (result.synced > 0) {
                    showToast(`✅ ${result.synced} operación(es) sincronizada(s)`);
                    await loadAll();
                }
                if (result.conflicts.length > 0) {
                    result.conflicts.forEach(c => {
                        showToast(`⚠️ ${c.label}: No se pudo sincronizar`, 'error');
                    });
                }
                // Enviar GPS buffereado
                const gpsSent = await flushGPSBuffer(API);
                if (gpsSent > 0) console.log(`GPS: ${gpsSent} puntos sincronizados`);
                // Actualizar contador
                setPendingSyncCount(await getPendingCount());
            }
        });

        // Cargar contador inicial de pendientes
        getPendingCount().then(setPendingSyncCount);

        return () => monitor.destroy();
    }, []);

    // ─── GPS cada 60 seg ───
    useEffect(() => {
        if (!journey || journey.status !== 'EN_RUTA') return;
        const sendGPS = () => {
            if (!navigator.geolocation) return;
            navigator.geolocation.getCurrentPosition(pos => {
                const { latitude: lat, longitude: lng, accuracy } = pos.coords;
                fetch(`${API}/grandeza/journeys/${journey.id}/location`, {
                    method: 'POST', headers: {'Content-Type':'application/json'},
                    body: JSON.stringify({ lat, lng, accuracy })
                }).catch(() => {
                    // Sin red: guardar en buffer local para enviar después
                    bufferGPSPoint({ journey_id: journey.id, lat, lng, accuracy });
                });
            }, () => {}, { enableHighAccuracy: false, maximumAge: 30000 });
        };
        sendGPS();
        const interval = setInterval(sendGPS, 60000);
        return () => clearInterval(interval);
    }, [journey]);


    const loadAll = async () => {
        setLoading(true);
        try {
            const prodRes = await fetch(`${API}/grandeza/products`);
            const prods = prodRes.ok ? (await prodRes.json()).filter(p => p.is_enabled) : [];
            setGrandezaProducts(prods);

            const jRes = await fetch(`${API}/grandeza/journeys/${todayStr()}`);
            
            const cliRes = await fetch(`${API}/grandeza/clients`);
            const clis = cliRes.ok ? await cliRes.json() : [];
            setClients(clis);

            const routeRes = await fetch(`${API}/grandeza/routes/effective/${todayStr()}`);
            const routeData = routeRes.ok ? await routeRes.json() : { type: 'REGULAR', slots: [] };
            const rSlots = routeData.slots || [];
            setRouteType(routeData.type || 'REGULAR');
            setRouteLabel(routeData.label || null);
            setRouteSlots(rSlots);

            let j = null, inv = [], vis = [];
            if (jRes.ok) {
                j = await jRes.json();
                setJourney(j);
                const invRes = await fetch(`${API}/grandeza/journeys/${j.id}/inventory?inventory_type=INITIAL`);
                if (invRes.ok) inv = await invRes.json();
                setInitialInventory(inv);
                
                const visRes = await fetch(`${API}/grandeza/journeys/${j.id}/visits`);
                if (visRes.ok) vis = await visRes.json();
                setVisits(vis);
            }

            // Cachear todo en IndexedDB para uso offline
            await cacheRouteData({ journey: j, products: prods, clients: clis, inventory: inv, routeSlots: rSlots, visits: vis });
            setPendingSyncCount(await getPendingCount());
        } catch(e) {
            console.error('Red no disponible, intentando caché local:', e.message);
            // Fallback: leer datos cacheados de IndexedDB
            const cached = await getCachedRouteData();
            if (cached) {
                setJourney(cached.journey);
                setGrandezaProducts(cached.products || []);
                setClients(cached.clients || []);
                setInitialInventory(cached.inventory || []);
                setRouteSlots(cached.routeSlots || []);
                setVisits(cached.visits || []);
                showToast('📡 Cargado desde caché local', 'warning');
            } else {
                showToast('❌ Sin conexión y sin datos locales', 'error');
            }
        }
        finally { setLoading(false); }
    };

    // ─── Cálculos en vivo ───
    const getProductInfo = (pid) => grandezaProducts.find(p => p.product_id === pid) || {};
    const getClientInfo = (cid) => clients.find(c => c.id === cid) || {};

    const completedVisits = visits;

    const runningTotals = useMemo(() => {
        let totalCash = parseFloat(journey?.cash_fund || 0);
        let totalExchangePieces = 0;
        let freshRemaining = {};
        // Inicializar piezas frescas restantes
        initialInventory.forEach(i => { freshRemaining[i.product_id] = i.fresh_qty; });
        // Restar de visitas completadas
        completedVisits.forEach(v => {
            totalCash += (v.sale_amount || 0);
            (v.items || []).forEach(it => {
                totalExchangePieces += it.exchange_qty || 0;
                if (freshRemaining[it.product_id] !== undefined) {
                    freshRemaining[it.product_id] -= it.actual_fresh_qty || 0;
                }
            });
        });
        return { totalCash, totalExchangePieces, freshRemaining, freshTotal: Object.values(freshRemaining).reduce((a,b)=>a+b, 0) };
    }, [journey, initialInventory, completedVisits]);

    // ─── Visita: Abrir ───
    const openVisit = async (slot, isExt = false) => {
        const client = isExt ? null : getClientInfo(slot.client_id);
        // Obtener sugerencias del historial
        let suggestions = [];
        if (!isExt && slot.client_id) {
            try {
                const sgRes = await fetch(`${API}/grandeza/clients/${slot.client_id}/suggestions`);
                if (sgRes.ok) suggestions = await sgRes.json();
            } catch(e) {}
        }
        const items = grandezaProducts.map(gp => {
            const sg = suggestions.find(s => s.product_id === gp.product_id);
            return {
                product_id: gp.product_id, product_name: gp.product_name,
                product_sku: gp.product_sku, b2b_price: gp.b2b_price,
                exchange_qty: 0,
                suggested_fresh_qty: sg ? sg.suggested_qty : 0,
                last_fresh_qty: sg ? (sg.last_fresh_qty || 0) : 0, // Frescas dejadas la visita anterior
                actual_fresh_qty: 0, missing_qty: 0,
            };
        });
        setVisitItems(items);
        setPaymentReceived(''); setIncidentNotes('');
        setExtClientName(isExt ? null : (client?.name || ''));
        setExtClientPhone('');
        setActiveVisit({ client_id: isExt ? null : slot.client_id, client,
            visit_order: isExt ? 999 : slot.visit_order,
            visit_type: isExt ? 'EXTEMPORANEA' : 'PROGRAMADA', slot });
        setView('visit');
    };

    // ─── Visita: Cálculos ───
    const visitCalc = useMemo(() => {
        let exchangeTotal = 0, freshTotal = 0;
        visitItems.forEach(it => {
            exchangeTotal += (it.exchange_qty || 0) * (it.b2b_price || 0);
            freshTotal += (it.actual_fresh_qty || 0) * (it.b2b_price || 0);
        });
        const saleAmount = freshTotal - exchangeTotal;
        const change = (parseFloat(paymentReceived) || 0) - saleAmount;
        return { exchangeTotal, freshTotal, saleAmount, change };
    }, [visitItems, paymentReceived]);

    const updateItem = (pid, field, value) => {
        setVisitItems(prev => prev.map(it =>
            it.product_id === pid ? { ...it, [field]: parseInt(value) || 0 } : it
        ));
    };

    // ─── Firma del Repartidor (Cambio de ESPERANDO_FIRMA a EN_RUTA) ───
    const handleFirmarRuta = async () => {
        if (!pinInput) {
            showToast('⚠️ Ingresa tu PIN para firmar', 'error');
            return;
        }
        setSaving(true);
        try {
            const validation = await securityService.validatePin(pinInput);
            if (validation.id !== journey.driver_user_id) {
                showToast(`❌ El PIN no coincide con el repartidor asignado a esta ruta`, 'error');
                setSaving(false);
                return;
            }

            // Cambiar estado a EN_RUTA
            await fetch(`${API}/grandeza/journeys/${journey.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'EN_RUTA' })
            });

            showToast('✅ ¡Ruta aceptada y en curso!');
            setPinInput('');
            await loadAll();
        } catch (e) {
            showToast(`❌ Error al firmar: ${e.message}`, 'error');
        } finally {
            setSaving(false);
        }
    };

    // ─── Visita: Validar pago antes de guardar ───
    const handleCompleteVisit = () => {
        if (visitCalc.saleAmount > 0 && (!paymentReceived || parseFloat(paymentReceived) <= 0)) {
            setShowPaymentWarning(true);
            return;
        }
        saveVisit();
    };

    // ─── Visita: Guardar (persiste en API o encola offline) ───
    const saveVisit = async () => {
        setSaving(true);
        const payload = {
            client_id: activeVisit.client_id,
            visit_order: activeVisit.visit_order,
            visit_type: activeVisit.visit_type,
            ext_client_name: activeVisit.visit_type === 'EXTEMPORANEA' ? extClientName : null,
            ext_client_phone: activeVisit.visit_type === 'EXTEMPORANEA' ? (extClientPhone || null) : null,
            items: visitItems.filter(it => it.exchange_qty > 0 || it.actual_fresh_qty > 0).map(it => ({
                product_id: it.product_id, exchange_qty: it.exchange_qty,
                suggested_fresh_qty: it.suggested_fresh_qty, actual_fresh_qty: it.actual_fresh_qty,
                missing_qty: it.missing_qty, unit_price: it.b2b_price,
            })),
            sale_amount: visitCalc.saleAmount,
            payment_received: parseFloat(paymentReceived) || 0,
            change_given: Math.max(0, visitCalc.change),
            total_exchange_amount: visitCalc.exchangeTotal,
            total_fresh_amount: visitCalc.freshTotal,
            incident_notes: incidentNotes || null,
        };
        const clientLabel = activeVisit.client?.name || extClientName || 'Cliente';
        try {
            const res = await fetch(`${API}/grandeza/journeys/${journey.id}/visits`, {
                method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload)
            });
            if (res.ok) {
                clearDraft();
                const visRes = await fetch(`${API}/grandeza/journeys/${journey.id}/visits`);
                if (visRes.ok) setVisits(await visRes.json());
                setLastVisitResult({ clientLabel, saleAmount: visitCalc.saleAmount, wasOffline: false,
                    whatsappURL: buildWhatsAppURL({ client: activeVisit?.client, clientName: extClientName, extPhone: extClientPhone, items: visitItems, saleAmount: visitCalc.saleAmount, paymentRec: parseFloat(paymentReceived) || 0, change: visitCalc.change, notes: incidentNotes }),
                });
                showToast(`✅ Visita registrada — Venta: $${visitCalc.saleAmount.toFixed(2)}`);
                setView('route'); setActiveVisit(null);
            } else if (res.status === 409) {
                // Visita duplicada — el cliente ya fue visitado en esta jornada
                clearDraft();
                showToast('⚠️ Este cliente ya fue visitado hoy. La visita anterior se conserva.', 'error');
                const visRes = await fetch(`${API}/grandeza/journeys/${journey.id}/visits`);
                if (visRes.ok) setVisits(await visRes.json());
                setView('route'); setActiveVisit(null);
            } else { showToast('❌ Error del servidor', 'error'); }
        } catch(e) {
            // Sin red: encolar para sincronizar después
            await enqueueOperation({
                method: 'POST',
                url: `${API}/grandeza/journeys/${journey.id}/visits`,
                body: payload,
                label: `Visita a ${clientLabel}`,
            });
            // Actualizar estado local optimistamente
            const localVisit = {
                ...payload, id: `local_${Date.now()}`, status: 'COMPLETADA',
                client_name: clientLabel, arrived_at: new Date().toISOString(),
                completed_at: new Date().toISOString(),
            };
            setVisits(prev => [...prev, localVisit]);
            await updateCachedVisits(localVisit);
            setPendingSyncCount(await getPendingCount());
            clearDraft();
            setLastVisitResult({ clientLabel, saleAmount: visitCalc.saleAmount, wasOffline: true,
                whatsappURL: buildWhatsAppURL({ client: activeVisit?.client, clientName: extClientName, extPhone: extClientPhone, items: visitItems, saleAmount: visitCalc.saleAmount, paymentRec: parseFloat(paymentReceived) || 0, change: visitCalc.change, notes: incidentNotes }),
            });
            showToast('📡 Visita guardada localmente. Se enviará al recuperar señal.', 'warning');
            setView('route'); setActiveVisit(null);
        } finally { setSaving(false); }
    };

    // ─── WhatsApp: Generar URL con datos de la visita ───
    const buildWhatsAppURL = ({ client, clientName, extPhone, items, saleAmount, paymentRec, change, notes }) => {
        const phone = (client?.phone || extPhone || '')?.replace(/\D/g, '');
        const phoneClean = phone && phone.length === 10 ? phone : (phone && phone.length > 10 ? phone.slice(-10) : null);

        let msg = `*NOTA DE VENTA*\n`;
        msg += `📅 ${todayStr()} | Cliente: *${client?.business_name || client?.name || clientName || 'General'}*\n`;
        msg += `────────────────\n`;
        msg += `*PRODUCTOS:*\n`;

        const activeItems = items.filter(it => it.actual_fresh_qty > 0 || it.exchange_qty > 0);
        if (activeItems.length === 0) return null;

        activeItems.forEach(it => {
            const exAmount = (it.exchange_qty || 0) * (it.b2b_price || 0);
            const frAmount = (it.actual_fresh_qty || 0) * (it.b2b_price || 0);
            const netAmount = frAmount - exAmount;
            
            msg += `• *${it.product_name}* ($${it.b2b_price.toFixed(2)})\n  `;
            let details = [];
            if (it.actual_fresh_qty > 0) details.push(`+${it.actual_fresh_qty} entregas`);
            if (it.exchange_qty > 0) details.push(`-${it.exchange_qty} recompras`);
            details.push(`Neto: $${netAmount.toFixed(2)}`);
            
            msg += details.join(' | ') + `\n`;
        });

        msg += `────────────────\n`;
        msg += `*TOTAL A PAGAR: $${saleAmount.toFixed(2)}*\n`;
        if (paymentRec > 0) {
            msg += `Recibido: $${paymentRec.toFixed(2)}\n`;
            if (change > 0) msg += `Cambio: $${change.toFixed(2)}\n`;
            else if (change < 0) msg += `Pendiente: $${Math.abs(change).toFixed(2)}\n`;
        }
        if (notes) msg += `\nNota: ${notes}\n`;
        msg += `\n_¡Gracias por su preferencia!_\n📞 Servicio al cliente: 7226101395`;

        return phoneClean ? `https://wa.me/52${phoneClean}?text=${encodeURIComponent(msg)}` : `https://wa.me/?text=${encodeURIComponent(msg)}`;
    };

    /** Enviar WhatsApp desde la vista de visita activa (antes de guardar) */
    const sendWhatsApp = () => {
        const url = buildWhatsAppURL({
            client: activeVisit?.client,
            clientName: extClientName,
            extPhone: extClientPhone,
            items: visitItems,
            saleAmount: visitCalc.saleAmount,
            paymentRec: parseFloat(paymentReceived) || 0,
            change: visitCalc.change,
            notes: incidentNotes,
        });
        if (!url) { showToast('⚠️ No hay productos en la cuenta', 'error'); return; }
        window.open(url, '_blank');
    };

    // ─── Render: Loading ───
    if (loading) return (
        <div className="h-screen flex items-center justify-center relative" style={{ backgroundColor: '#3a2e1e' }}>
            <DriverBackground />
            <div className="relative z-10 text-center"><img src={LOGO_URL} alt="Grandeza" className="w-20 h-20 rounded-2xl object-cover mx-auto mb-4 animate-pulse border border-amber-500/30 shadow-2xl" /><p className="text-amber-400 font-bold text-sm uppercase tracking-widest animate-pulse drop-shadow-md">Cargando ruta...</p></div>
        </div>
    );

    // ─── Render: No journey o PREPARANDO ───
    if (!journey || journey.status === 'PREPARANDO') return (
        <div className="h-screen flex flex-col text-white relative" style={{ backgroundColor: '#3a2e1e' }}>
            <DriverBackground />
            <div className="relative z-20 p-4 border-b border-white/10 bg-black shadow-2xl">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl overflow-hidden shadow-2xl shadow-orange-500/20 border-2 border-amber-500/30 flex items-center justify-center shrink-0">
                            <img src={LOGO_URL} alt="Grandeza" className="w-full h-full object-cover scale-[1.35]" />
                        </div>
                        <div>
                            <h1 className="font-black text-xl uppercase tracking-tighter text-white leading-none">Sin <span className="text-amber-400">Ruta</span></h1>
                        </div>
                    </div>
                    <button onClick={onBack} className="text-xs text-gray-400 font-bold uppercase px-4 py-3 bg-white/5 border border-white/10 rounded-xl hover:text-white hover:bg-white/10 transition-all shrink-0">← Salir</button>
                </div>
            </div>
            <div className="relative z-10 flex-1 flex items-center justify-center p-8">
                <div className="text-center space-y-4">
                    <div className="text-6xl drop-shadow-2xl">⏳</div>
                    <h2 className="text-xl font-black uppercase tracking-tighter text-amber-400 drop-shadow-lg">Sin ruta activa</h2>
                    <p className="text-sm text-amber-100/70 font-medium">{journey ? 'La jornada está en preparación. Espera a que el gerente asigne la ruta.' : 'No hay jornada abierta para hoy.'}</p>
                </div>
            </div>
        </div>
    );

    // ─── Render: Firma de Repartidor (Nuevo Flujo) ───
    if (journey.status === 'ESPERANDO_FIRMA') {
        return (
            <div className="h-screen flex flex-col text-white relative overflow-hidden" style={{ backgroundColor: '#3a2e1e' }}>
                <DriverBackground />
                <div className="relative z-20 p-4 border-b border-white/10 bg-black shadow-2xl">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl overflow-hidden shadow-2xl shadow-orange-500/20 border-2 border-amber-500/30 flex items-center justify-center shrink-0">
                                <img src={LOGO_URL} alt="Grandeza" className="w-full h-full object-cover scale-[1.35]" />
                            </div>
                            <div>
                                <h1 className="font-black text-xl uppercase tracking-tighter text-white leading-none">Nueva <span className="text-amber-400">Ruta</span></h1>
                            </div>
                        </div>
                        <button onClick={onBack} className="text-xs text-gray-400 font-bold uppercase px-4 py-3 bg-white/5 border border-white/10 rounded-xl hover:text-white hover:bg-white/10 transition-all shrink-0">← Salir</button>
                    </div>
                </div>

                <div className="relative z-10 flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar">
                    <div className="max-w-md mx-auto space-y-6 pb-8">
                        <div className="text-center mt-2">
                            <div className="text-5xl mb-2 animate-bounce">📦</div>
                            <h2 className="text-xl font-black uppercase tracking-tighter text-amber-400 drop-shadow-lg">Revisar Carga</h2>
                            <p className="text-sm text-amber-100/70 font-medium mt-1">Verifica lo que estás recibiendo del gerente.</p>
                        </div>

                        <div className="bg-black/70 backdrop-blur-md border border-white/10 rounded-[24px] p-6 space-y-4">
                            <div className="flex justify-between items-center border-b border-white/10 pb-4">
                                <span className="text-sm font-black uppercase tracking-widest text-white">💰 Fondo de Caja</span>
                                <span className="text-xl font-black text-emerald-400">${parseFloat(journey.cash_fund || 0).toFixed(2)}</span>
                            </div>
                            
                            <div>
                                <h3 className="text-sm font-black uppercase tracking-widest text-amber-400 mb-3">🍞 Inventario Asignado</h3>
                                <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar pr-2">
                                    {initialInventory.filter(i => i.fresh_qty > 0).map(item => {
                                        const prod = getProductInfo(item.product_id);
                                        return (
                                            <div key={item.product_id} className="flex justify-between items-center text-sm font-bold border-b border-white/5 pb-2 last:border-0 last:pb-0">
                                                <span className="text-gray-300">{prod.product_name || `Producto #${item.product_id}`}</span>
                                                <span className="text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-md">{item.fresh_qty} pz</span>
                                            </div>
                                        );
                                    })}
                                    {initialInventory.length === 0 && <p className="text-gray-500 text-xs text-center py-2">Sin inventario físico</p>}
                                </div>
                            </div>
                        </div>

                        <div className="bg-black/90 backdrop-blur-xl border border-amber-500/30 rounded-[24px] p-6 space-y-4 shadow-[0_0_30px_rgba(245,158,11,0.15)]">
                            <label className="text-[10px] font-black uppercase tracking-widest text-amber-400 block text-center">
                                Ingresa tu PIN para firmar de conformidad
                            </label>
                            <div className="bg-black/50 border border-white/10 rounded-2xl h-14 flex items-center justify-center text-2xl font-mono tracking-[0.5em] text-white">
                                {pinInput.replace(/./g, '•') || <span className="text-white/20">PIN</span>}
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 'C', 0, '←'].map(val => (
                                    <button
                                        key={val}
                                        onClick={() => {
                                            if (val === 'C') setPinInput('');
                                            else if (val === '←') setPinInput(prev => prev.slice(0, -1));
                                            else if (pinInput.length < 8) setPinInput(prev => String(prev) + val);
                                        }}
                                        className="h-12 bg-white/5 border border-white/10 rounded-xl text-lg font-black text-white hover:bg-white/10 active:scale-95 transition-all"
                                    >
                                        {val}
                                    </button>
                                ))}
                            </div>
                            <button
                                onClick={handleFirmarRuta}
                                disabled={saving || !pinInput}
                                className="w-full py-4 bg-gradient-to-r from-amber-500 to-orange-600 rounded-xl font-black uppercase tracking-widest text-white hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:grayscale mt-2 shadow-xl shadow-amber-500/20"
                            >
                                {saving ? 'VERIFICANDO...' : 'FIRMAR Y RECIBIR'}
                            </button>
                        </div>
                    </div>
                </div>

                {toast && <div className={`fixed top-4 left-4 right-4 px-4 py-3 rounded-xl font-bold text-sm z-[100] text-center ${toast.type==='error'?'bg-red-500 text-white':'bg-emerald-500 text-black'}`}>{toast.msg}</div>}

                {/* Modal Editar Cliente (En vista de Visita) */}
                {editingClient && (
                    <EditClientModal 
                        client={editingClient} 
                        onClose={() => setEditingClient(null)} 
                        onSave={(updated) => {
                            setClients(prev => prev.map(c => c.id === updated.id ? updated : c));
                            setEditingClient(null);
                            showToast('✅ Cliente actualizado');
                            if (activeVisit?.client?.id === updated.id) {
                                setActiveVisit(prev => ({ ...prev, client: updated }));
                            }
                        }}
                        API={API}
                    />
                )}
            </div>
        );
    }

    // ─── Render: Vista de Visita Activa ───
    if (view === 'visit' && activeVisit) {
        const client = activeVisit.client;
        const isExt = activeVisit.visit_type === 'EXTEMPORANEA';
        return (
            <div className="h-screen flex flex-col text-white overflow-hidden relative" style={{ backgroundColor: '#3a2e1e' }}>
                <DriverBackground />
                {/* Header visita */}
                <div className="relative z-20 p-4 border-b border-white/10 bg-black shadow-2xl">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl overflow-hidden shadow-2xl shadow-orange-500/20 border-2 border-amber-500/30 flex items-center justify-center shrink-0">
                                <img src={LOGO_URL} alt="Grandeza" className="w-full h-full object-cover scale-[1.35]" />
                            </div>
                            <div>
                                <h1 className="font-black text-xl uppercase tracking-tighter text-white leading-none"><span className="text-amber-400">{isExt ? 'Venta No Programada' : `Visita #${activeVisit.visit_order}`}</span></h1>
                            </div>
                        </div>
                        <button onClick={() => { clearDraft(); setView('route'); setActiveVisit(null); }} className="text-xs text-gray-400 font-bold uppercase px-4 py-3 bg-white/5 border border-white/10 rounded-xl hover:text-white hover:bg-white/10 transition-all shrink-0">← Ruta</button>
                    </div>
                </div>

                <div className="relative z-10 flex-1 overflow-y-auto pb-32">
                    {/* Info cliente */}
                    <div className="p-4 border-b border-amber-500/20 bg-black/20">
                        {isExt ? (
                            <div>
                                <label className="text-[10px] font-black text-amber-400/80 uppercase mb-1 block">Nombre del cliente</label>
                                <select value={activeVisit.client_id ? String(activeVisit.client_id) : (extClientName !== null ? 'CUSTOM' : '')} onChange={e => {
                                    if (e.target.value === 'CUSTOM') {
                                        setExtClientName('');
                                        setActiveVisit(prev => ({ ...prev, client_id: null }));
                                    } else if (e.target.value === '') {
                                        setExtClientName(null);
                                        setActiveVisit(prev => ({ ...prev, client_id: null }));
                                    } else {
                                        const sel = clients.find(c => c.id === parseInt(e.target.value));
                                        setExtClientName(sel?.name || '');
                                        setActiveVisit(prev => ({ ...prev, client_id: parseInt(e.target.value) }));
                                    }
                                }} className="w-full bg-black border border-white/10 rounded-xl p-3 text-white font-bold outline-none" style={{ colorScheme: 'dark' }}>
                                    <option value="" style={{ background: '#000', color: '#fff' }}>Seleccionar cliente...</option>
                                    <option value="CUSTOM" style={{ background: '#000', color: '#fbbf24' }}>✏️ Cliente no registrado (escribir nombre)</option>
                                    {clients.map(c => <option key={c.id} value={c.id} style={{ background: '#000', color: '#fff' }}>{c.name} {c.business_name ? `(${c.business_name})` : ''}</option>)}
                                </select>
                                {(!activeVisit.client_id && extClientName !== null) && (
                                    <>
                                        <input value={extClientName || ''} onChange={e => setExtClientName(e.target.value)} placeholder="¿A quién le vendes?" className="w-full bg-black border border-amber-500/30 rounded-xl p-3 text-white font-bold outline-none mt-2 placeholder:text-gray-500 focus:border-amber-500" autoFocus />
                                        <input value={extClientPhone || ''} onChange={e => setExtClientPhone(e.target.value)} placeholder="📱 Teléfono (para ticket WhatsApp)" type="tel" inputMode="tel" className="w-full bg-black border border-amber-500/30 rounded-xl p-3 text-white font-bold outline-none mt-2 placeholder:text-gray-500 focus:border-amber-500" />
                                    </>
                                )}
                            </div>
                        ) : (
                            <div className="flex gap-3">
                                {client?.facade_photo_url && <img src={`${CONFIG.API_BASE_URL.replace(/\/api\/v1\/?$/, '')}${client.facade_photo_url}`} className="w-16 h-16 rounded-xl object-cover border border-white/10" />}
                                <div className="flex-1 min-w-0">
                                    <h3 className="font-black text-lg leading-tight truncate">{client?.name}</h3>
                                    <p className="text-xs text-amber-200/60 truncate">{client?.business_name}</p>
                                    <div className="flex gap-2 mt-2 flex-wrap">
                                        {client?.phone && <a href={`tel:${client.phone}`} className="text-xs bg-blue-500/20 text-blue-400 px-3 py-1 rounded-lg font-bold">📞 Llamar</a>}
                                        {client?.google_maps_url ? (
                                            <a href={client.google_maps_url} target="_blank" className="text-xs bg-emerald-500/20 text-emerald-400 px-3 py-1 rounded-lg font-bold">📍 Navegar</a>
                                        ) : (
                                            <button onClick={() => saveClientLocation(client.id)} className="text-xs bg-amber-500/20 text-amber-400 px-3 py-1 rounded-lg font-bold">📍 Guardar Ubicación</button>
                                        )}
                                        {canEditClients && <button onClick={() => setEditingClient(client)} className="text-xs bg-white/5 text-gray-400 px-3 py-1 rounded-lg font-bold">✏️</button>}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Productos */}
                    <div className="p-4 space-y-3">
                        <h4 className="text-xs font-black text-amber-400/80 uppercase tracking-widest">Productos</h4>
                        {visitItems.map(it => {
                            const exAmount = (it.exchange_qty || 0) * (it.b2b_price || 0);
                            const frAmount = (it.actual_fresh_qty || 0) * (it.b2b_price || 0);
                            const netTotal = frAmount - exAmount;
                            return (
                                <div key={it.product_id} className="bg-white/[0.02] border border-white/5 rounded-xl p-3 flex flex-col gap-2">
                                    {/* Renglón 1: Nombre, Precio, Sugerido */}
                                    <div className="flex justify-between items-center border-b border-white/10 pb-2">
                                        <div className="font-black text-sm uppercase text-amber-400 truncate pr-2 leading-none">{it.product_name}</div>
                                        <div className="flex gap-3 text-xs font-bold text-gray-300 shrink-0 leading-none">
                                            <span>${it.b2b_price?.toFixed(2)}</span>
                                            {(() => {
                                                // Sugerencia dinámica: si hay cambios ingresados Y datos de la visita anterior,
                                                // recalcular basado en lo que el cliente realmente vendió
                                                const hasDynamic = it.last_fresh_qty > 0 && it.exchange_qty > 0;
                                                const dynamicSuggestion = hasDynamic 
                                                    ? Math.max(0, it.last_fresh_qty - it.exchange_qty)
                                                    : it.suggested_fresh_qty;
                                                const isDynamic = hasDynamic && dynamicSuggestion !== it.suggested_fresh_qty;
                                                return (
                                                    <span className={`border-l border-white/10 pl-3 ${isDynamic ? 'text-cyan-400' : 'text-blue-400'}`}>
                                                        {isDynamic ? '⚡' : ''} Sugerido: {dynamicSuggestion}
                                                    </span>
                                                );
                                            })()}
                                        </div>
                                    </div>
                                    {/* Renglón 2: Controles y Total */}
                                    <div className="flex justify-between items-end gap-2 mt-1">
                                        {/* Cambios */}
                                        <div className="flex flex-col gap-1 flex-1">
                                            <div className="flex justify-between text-[9px] font-black text-red-400 uppercase px-1"><span>Cambios</span><span>-${exAmount.toFixed(2)}</span></div>
                                            <div className="flex items-center gap-1">
                                                <button onClick={() => updateItem(it.product_id, 'exchange_qty', Math.max(0, it.exchange_qty - 1))} className="w-8 h-8 rounded-lg bg-red-500/20 text-red-400 font-black flex items-center justify-center active:scale-95">−</button>
                                                <input type="number" value={it.exchange_qty} onChange={e => updateItem(it.product_id, 'exchange_qty', e.target.value)} className="w-12 bg-black/60 border border-white/10 rounded-lg text-center font-black text-white h-8 outline-none text-xs" />
                                                <button onClick={() => updateItem(it.product_id, 'exchange_qty', it.exchange_qty + 1)} className="w-8 h-8 rounded-lg bg-red-500/20 text-red-400 font-black flex items-center justify-center active:scale-95">+</button>
                                            </div>
                                        </div>
                                        {/* Frescas */}
                                        <div className="flex flex-col gap-1 flex-1 border-l border-white/10 pl-2">
                                            <div className="flex justify-between text-[9px] font-black text-emerald-400 uppercase px-1"><span>Frescas</span><span>+${frAmount.toFixed(2)}</span></div>
                                            <div className="flex items-center gap-1">
                                                <button onClick={() => updateItem(it.product_id, 'actual_fresh_qty', Math.max(0, it.actual_fresh_qty - 1))} className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 font-black flex items-center justify-center active:scale-95">−</button>
                                                <input type="number" value={it.actual_fresh_qty} onChange={e => updateItem(it.product_id, 'actual_fresh_qty', e.target.value)} className="w-12 bg-black/60 border border-white/10 rounded-lg text-center font-black text-white h-8 outline-none text-xs" />
                                                <button onClick={() => updateItem(it.product_id, 'actual_fresh_qty', it.actual_fresh_qty + 1)} className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 font-black flex items-center justify-center active:scale-95">+</button>
                                            </div>
                                        </div>
                                        {/* Total Neto */}
                                        <div className="flex flex-col gap-1 shrink-0 text-right border-l border-white/10 pl-2 pb-1 min-w-[50px]">
                                            <span className="text-[9px] font-black text-gray-400 uppercase">Total</span>
                                            <span className={`text-base font-black leading-none ${netTotal < 0 ? 'text-red-400' : 'text-emerald-400'}`}>${netTotal.toFixed(2)}</span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Resumen Financiero */}
                    <div className="p-4 space-y-2">
                        <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-4 space-y-2">
                            <div className="flex justify-between text-sm"><span className="text-red-400">🔄 Cambios (recompra)</span><span className="font-black text-red-400">-${visitCalc.exchangeTotal.toFixed(2)}</span></div>
                            <div className="flex justify-between text-sm"><span className="text-emerald-400">🍞 Frescas</span><span className="font-black text-emerald-400">${visitCalc.freshTotal.toFixed(2)}</span></div>
                            <div className="border-t border-white/10 pt-2 flex justify-between text-lg"><span className="font-black">TOTAL VENTA</span><span className="font-black text-white">${visitCalc.saleAmount.toFixed(2)}</span></div>
                        </div>
                        {/* Pago */}
                        <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-4">
                            <label className="text-[10px] font-black text-amber-400 uppercase block mb-2">💵 Dinero Recibido</label>
                            <input type="number" value={paymentReceived} onChange={e => setPaymentReceived(e.target.value)} placeholder="0.00" className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-xl font-black text-white outline-none focus:border-amber-500" />
                            
                            <div className="mt-3 flex flex-col gap-2">
                                {visitCalc.change > 0 && <div className="text-sm font-black text-amber-400">🔙 Cambio: ${visitCalc.change.toFixed(2)}</div>}
                                {visitCalc.change < 0 && parseFloat(paymentReceived) > 0 && <div className="text-sm font-black text-red-400">⚠️ Faltan: ${Math.abs(visitCalc.change).toFixed(2)}</div>}
                                
                                <button onClick={sendWhatsApp} className="w-full py-3 bg-[#128C7E] rounded-xl text-xs font-black text-white uppercase active:scale-95 transition-all flex justify-center items-center gap-2 mt-2 shadow-[0_0_15px_rgba(18,140,126,0.3)] border border-[#075E54]">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="white">
                                      <path d="M12.031 0C5.385 0 0 5.385 0 12.031c0 2.128.547 4.204 1.587 6.035L.057 24l6.104-1.602c1.782.99 3.79 1.512 5.87 1.512 6.645 0 12.03-5.385 12.03-12.03S18.676 0 12.031 0zM12.03 21.905c-1.802 0-3.57-.484-5.118-1.403l-.367-.217-3.805.998 1.015-3.708-.238-.378c-.987-1.564-1.507-3.376-1.507-5.234 0-5.54 4.51-10.05 10.05-10.05 5.54 0 10.05 4.51 10.05 10.05 0 5.54-4.51 10.05-10.05 10.05zm5.55-7.558c-.304-.152-1.796-.886-2.074-.988-.278-.101-.482-.152-.685.152-.202.304-.783.988-.96 1.19-.177.202-.355.228-.66.076-.304-.152-1.282-.472-2.443-1.507-.905-.806-1.516-1.802-1.693-2.106-.177-.304-.019-.468.133-.62.137-.137.304-.354.456-.532.152-.177.202-.304.304-.506.101-.202.051-.38-.025-.532-.076-.152-.685-1.646-.937-2.253-.247-.594-.497-.514-.684-.523-.177-.009-.38-.01-.583-.01-.202 0-.532.076-.81.38-.278.304-1.064 1.038-1.064 2.531 0 1.494 1.089 2.937 1.24 3.14.152.202 2.14 3.266 5.185 4.582.724.312 1.289.498 1.73.638.727.231 1.388.198 1.91.12.584-.087 1.796-.734 2.05-1.443.253-.71.253-1.317.177-1.443-.076-.126-.278-.202-.582-.354z"/>
                                    </svg>
                                    Enviar ticket por WhatsApp
                                </button>
                            </div>
                        </div>
                        {/* Incidentes */}
                        <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-4">
                            <label className="text-[10px] font-black text-gray-300 uppercase block mb-2">📝 Notas / Incidente</label>
                            <textarea value={incidentNotes} onChange={e => setIncidentNotes(e.target.value)} placeholder="Opcional: documenta cualquier incidente..." className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-sm text-white outline-none focus:border-white/30 min-h-[60px] resize-none" />
                        </div>
                    </div>
                </div>

                {/* Barra de acciones fija */}
                <div className="fixed bottom-0 left-0 right-0 bg-black/95 backdrop-blur-xl border-t border-white/10 p-4 flex z-50">
                    <button onClick={handleCompleteVisit} disabled={saving} className="w-full py-4 bg-[#A04000] rounded-xl text-sm font-black text-white uppercase shadow-lg disabled:opacity-50 active:scale-95 transition-all">
                        {saving ? 'Guardando...' : '✅ Completar Visita'}
                    </button>
                </div>

                {/* Toast */}
                {toast && <div className={`fixed top-4 left-4 right-4 px-4 py-3 rounded-xl font-bold text-sm z-[100] text-center ${toast.type==='error'?'bg-red-500 text-white': toast.type==='warning'?'bg-amber-500 text-black':'bg-emerald-500 text-black'}`}>{toast.msg}</div>}

                {/* Modal: Aviso de pago faltante */}
                {showPaymentWarning && (
                    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
                        <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowPaymentWarning(false)}></div>
                        <div className="relative bg-[#1a1a1a] border border-red-500/30 rounded-[24px] p-6 max-w-sm w-full shadow-2xl text-center">
                            <div className="text-5xl mb-4">💰</div>
                            <h3 className="text-xl font-black text-white uppercase tracking-tight mb-2">Pago no registrado</h3>
                            <p className="text-sm text-gray-400 mb-2">La venta es de <span className="text-white font-black">${visitCalc.saleAmount.toFixed(2)}</span> pero no has registrado ningún pago.</p>
                            <p className="text-xs text-red-400 font-bold mb-6">Captura el monto recibido en el campo "💵 Dinero Recibido" antes de completar la visita.</p>
                            <button onClick={() => setShowPaymentWarning(false)} className="w-full py-3 bg-amber-500 rounded-xl text-sm font-black text-black uppercase tracking-widest active:scale-95 transition-all">Entendido</button>
                        </div>
                    </div>
                )}

                {/* Modal Editar Cliente (en vista de Visita) */}
                {editingClient && (
                    <EditClientModal 
                        client={editingClient} 
                        onClose={() => setEditingClient(null)} 
                        onSave={(updated) => {
                            setClients(prev => prev.map(c => c.id === updated.id ? updated : c));
                            setEditingClient(null);
                            showToast('✅ Cliente actualizado');
                            if (activeVisit?.client?.id === updated.id) {
                                setActiveVisit(prev => ({ ...prev, client: updated }));
                            }
                        }}
                        API={API}
                    />
                )}
            </div>
        );
    }

    // ─── Render: Vista de Resumen ───
    if (view === 'summary') {
        const totalVentas = visits.reduce((s,v) => s + (v.sale_amount||0), 0);
        const totalCobrado = visits.reduce((s,v) => s + (v.payment_received||0), 0);
        const totalCambiosDado = visits.reduce((s,v) => s + (v.change_given||0), 0);
        const totalGastos = expenses.reduce((s,e) => s + (e.amount||0), 0);
        const fondoCaja = journey?.cash_fund || 0;
        const efectivoEsperado = fondoCaja + totalVentas - totalGastos;
        return (
            <div className="h-screen flex flex-col text-white overflow-hidden relative" style={{ backgroundColor: '#3a2e1e' }}>
                <DriverBackground />
                <div className="relative z-20 p-4 border-b border-white/10 bg-black shadow-2xl">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl overflow-hidden shadow-2xl shadow-orange-500/20 border-2 border-amber-500/30 flex items-center justify-center shrink-0">
                                <img src={LOGO_URL} alt="Grandeza" className="w-full h-full object-cover scale-[1.35]" />
                            </div>
                            <div>
                                <h1 className="font-black text-xl uppercase tracking-tighter text-white leading-none"><span className="text-emerald-400">Resumen</span></h1>
                            </div>
                        </div>
                        <button onClick={() => setView('route')} className="text-xs text-gray-400 font-bold uppercase px-4 py-3 bg-white/5 border border-white/10 rounded-xl hover:text-white hover:bg-white/10 transition-all shrink-0">← Ruta</button>
                    </div>
                </div>
                <div className="relative z-10 flex-1 overflow-y-auto p-4 space-y-3">
                    {/* Tabla de Inventario en Tiempo Real */}
                    <h4 className="text-xs font-black text-amber-400/80 uppercase tracking-widest">Inventario en Ruta</h4>
                    <div className="bg-white/[0.02] border border-white/5 rounded-2xl overflow-hidden">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-[8px] font-black uppercase text-gray-400 bg-white/[0.03]">
                                    <th className="text-left py-2 px-3">Producto</th>
                                    <th className="text-center py-2 px-1 text-blue-400">Inic.</th>
                                    <th className="text-center py-2 px-1 text-emerald-400">Vend.</th>
                                    <th className="text-center py-2 px-1 text-red-400">Camb.</th>
                                    <th className="text-center py-2 px-1 text-amber-400">Rest.</th>
                                </tr>
                            </thead>
                            <tbody>
                                {grandezaProducts.map(gp => {
                                    const invItem = initialInventory.find(i => i.product_id === gp.product_id);
                                    const inicial = invItem ? invItem.fresh_qty : 0;
                                    let vendidas = 0, cambios = 0;
                                    completedVisits.forEach(v => {
                                        (v.items || []).forEach(it => {
                                            if (it.product_id === gp.product_id) {
                                                vendidas += it.actual_fresh_qty || 0;
                                                cambios += it.exchange_qty || 0;
                                            }
                                        });
                                    });
                                    const restantes = inicial - vendidas;
                                    return (
                                        <tr key={gp.product_id} className="border-t border-white/5">
                                            <td className="py-2 px-3 font-bold text-white text-xs">{gp.product_name}</td>
                                            <td className="py-2 px-1 text-center font-black text-blue-300">{inicial}</td>
                                            <td className="py-2 px-1 text-center font-black text-emerald-300">{vendidas}</td>
                                            <td className="py-2 px-1 text-center font-black text-red-300">{cambios}</td>
                                            <td className={`py-2 px-1 text-center font-black ${restantes > 0 ? 'text-amber-400' : restantes === 0 ? 'text-gray-500' : 'text-red-500'}`}>{restantes}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                    <h4 className="text-xs font-black text-amber-400/80 uppercase tracking-widest pt-2">Detalle de Visitas</h4>
                    {visits.map((v, i) => (
                        <div key={v.id || i} className="bg-white/[0.02] border border-white/5 rounded-xl p-3 flex justify-between items-center">
                            <div className="flex-1 min-w-0">
                                <div className="font-bold text-sm truncate">{v.client_name || v.ext_client_name || `Visita ${i+1}`}</div>
                                <div className="text-xs text-gray-300">{v.visit_type === 'EXTEMPORANEA' ? '⚡ Extemporánea' : `📋 Programada`}</div>
                            </div>
                            <div className="font-black text-emerald-400 text-sm mx-2">${(v.sale_amount||0).toFixed(2)}</div>
                            <button onClick={() => setSelectedVisitDetail(v)} className="w-8 h-8 rounded-full bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 font-black text-sm shrink-0 active:scale-90 transition-all hover:bg-amber-500/40">+</button>
                        </div>
                    ))}
                    {visits.length === 0 && <p className="text-center text-gray-400 py-8 font-bold text-sm">Aún no hay visitas registradas</p>}

                    {/* Arqueo de Caja */}
                    <h4 className="text-xs font-black text-amber-400/80 uppercase tracking-widest pt-2">💰 Arqueo de Caja</h4>
                    <div className="bg-white/[0.02] border border-white/5 rounded-2xl overflow-hidden">
                        <table className="w-full text-sm">
                            <tbody>
                                <tr className="border-b border-white/5">
                                    <td className="py-3 px-3 font-bold text-gray-300">Fondo de Caja</td>
                                    <td className="py-3 px-3 text-right font-black text-blue-400">${fondoCaja.toFixed(2)}</td>
                                </tr>
                                <tr className="border-b border-white/5">
                                    <td className="py-3 px-3 font-bold text-gray-300">(+) Dinero de las Ventas</td>
                                    <td className="py-3 px-3 text-right font-black text-emerald-400">${totalVentas.toFixed(2)}</td>
                                </tr>
                                <tr className="border-b border-white/5">
                                    <td className="py-3 px-3 font-bold text-gray-300">(-) Gastos Operativos</td>
                                    <td className="py-3 px-3 text-right font-black text-red-400">-${totalGastos.toFixed(2)}</td>
                                </tr>
                                <tr className="bg-white/[0.04]">
                                    <td className="py-3 px-3 font-black text-white uppercase text-xs">= Efectivo Esperado</td>
                                    <td className={`py-3 px-3 text-right font-black text-lg ${efectivoEsperado >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>${efectivoEsperado.toFixed(2)}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                </div>

                {/* Modal Detalle de Visita */}
                {selectedVisitDetail && (
                    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[200] flex items-center justify-center p-4" onClick={() => setSelectedVisitDetail(null)}>
                        <div className="bg-[#2a2015] border border-amber-500/20 rounded-2xl w-full max-w-md max-h-[85vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
                            {/* Header del modal */}
                            <div className="p-4 border-b border-white/10">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <h3 className="font-black text-lg text-white">{selectedVisitDetail.client_name || selectedVisitDetail.ext_client_name || 'Cliente'}</h3>
                                        <p className="text-xs text-gray-400 mt-1">
                                            {selectedVisitDetail.visit_type === 'EXTEMPORANEA' ? '⚡ Extemporánea' : '📋 Programada'}
                                            {selectedVisitDetail.arrived_at && ` — ${formatLocalTime(selectedVisitDetail.arrived_at)}`}
                                        </p>
                                    </div>
                                    <button onClick={() => setSelectedVisitDetail(null)} className="text-gray-400 hover:text-white text-xl font-black px-2">✕</button>
                                </div>
                            </div>

                            {/* Tabla de productos */}
                            {selectedVisitDetail.items && selectedVisitDetail.items.length > 0 ? (
                                <div className="p-4">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="text-[9px] font-black uppercase text-gray-400">
                                                <th className="text-left pb-2">Producto</th>
                                                <th className="text-center pb-2 text-cyan-400">Sug.</th>
                                                <th className="text-center pb-2 text-emerald-400">Frescas</th>
                                                <th className="text-center pb-2 text-red-400">Cambios</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {selectedVisitDetail.items.map((item, idx) => (
                                                <tr key={idx} className="border-t border-white/5">
                                                    <td className="py-2 font-bold text-white text-xs">{item.product_name || grandezaProducts.find(gp => gp.product_id === item.product_id)?.product_name || `Prod #${item.product_id}`}</td>
                                                    <td className="py-2 text-center font-black text-cyan-300">{item.suggested_fresh_qty || 0}</td>
                                                    <td className="py-2 text-center font-black text-emerald-300">{item.actual_fresh_qty || 0}</td>
                                                    <td className="py-2 text-center font-black text-red-300">{item.exchange_qty || 0}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <div className="p-4 text-center text-gray-500 text-sm font-bold">Sin productos registrados</div>
                            )}

                            {/* Resumen financiero */}
                            <div className="p-4 border-t border-white/10 space-y-2">
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-400">Venta total</span>
                                    <span className="font-black text-emerald-400">${(selectedVisitDetail.sale_amount||0).toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-400">Dinero recibido</span>
                                    <span className="font-black text-white">${(selectedVisitDetail.payment_received||0).toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-400">Cambio dado</span>
                                    <span className="font-black text-amber-400">${(selectedVisitDetail.change_given||0).toFixed(2)}</span>
                                </div>
                                {selectedVisitDetail.incident_notes && (
                                    <div className="mt-2 pt-2 border-t border-white/5">
                                        <span className="text-[9px] font-black text-gray-400 uppercase">Notas:</span>
                                        <p className="text-xs text-gray-300 mt-1">{selectedVisitDetail.incident_notes}</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    // ─── Render: Vista de Gastos ───
    if (view === 'expenses') {
        const totalGastosView = expenses.reduce((s,e) => s + (e.amount||0), 0);

        const submitExpense = async () => {
            if (!expDesc.trim()) { showToast('⚠️ Escribe una descripción del gasto', 'error'); return; }
            if (!expAmount || parseFloat(expAmount) <= 0) { showToast('⚠️ Ingresa el monto del gasto', 'error'); return; }
            setExpSaving(true);
            try {
                const res = await fetch(`${API}/grandeza/journeys/${journey.id}/expenses`, {
                    method: 'POST', headers: {'Content-Type':'application/json'},
                    body: JSON.stringify({ description: expDesc.trim(), amount: parseFloat(expAmount) })
                });
                if (res.ok) {
                    const newExp = await res.json();
                    setExpenses(prev => [...prev, newExp]);
                    setExpDesc(''); setExpAmount('');
                    showToast('✅ Gasto registrado');
                } else { showToast('❌ Error al registrar gasto', 'error'); }
            } catch(e) { showToast('❌ Error de red', 'error'); }
            finally { setExpSaving(false); }
        };

        const deleteExpense = async (expenseId) => {
            try {
                const res = await fetch(`${API}/grandeza/expenses/${expenseId}`, { method: 'DELETE' });
                if (res.ok) {
                    setExpenses(prev => prev.filter(e => e.id !== expenseId));
                    showToast('✅ Gasto eliminado');
                }
            } catch(e) { showToast('❌ Error al eliminar', 'error'); }
        };

        return (
            <div className="h-screen flex flex-col text-white overflow-hidden relative" style={{ backgroundColor: '#3a2e1e' }}>
                <DriverBackground />
                <div className="relative z-20 p-4 border-b border-white/10 bg-black shadow-2xl">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl overflow-hidden shadow-2xl shadow-orange-500/20 border-2 border-amber-500/30 flex items-center justify-center shrink-0">
                                <img src={LOGO_URL} alt="Grandeza" className="w-full h-full object-cover scale-[1.35]" />
                            </div>
                            <div>
                                <h1 className="font-black text-xl uppercase tracking-tighter text-white leading-none"><span className="text-red-400">Gastos</span></h1>
                            </div>
                        </div>
                        <button onClick={() => setView('route')} className="text-xs text-gray-400 font-bold uppercase px-4 py-3 bg-white/5 border border-white/10 rounded-xl hover:text-white hover:bg-white/10 transition-all shrink-0">← Ruta</button>
                    </div>
                </div>
                <div className="relative z-10 flex-1 overflow-y-auto p-4 space-y-3 pb-60">
                    {/* Total de gastos */}
                    <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 flex justify-between items-center">
                        <span className="text-sm font-black text-red-300 uppercase">Total Gastos del Día</span>
                        <span className="text-2xl font-black text-red-400">${totalGastosView.toFixed(2)}</span>
                    </div>

                    {/* Lista de gastos */}
                    {expenses.length > 0 ? expenses.map(exp => (
                        <div key={exp.id} className="bg-white/[0.02] border border-white/5 rounded-xl p-3 flex justify-between items-center">
                            <div className="flex-1 min-w-0">
                                <div className="font-bold text-sm text-white truncate">{exp.description}</div>
                                <div className="text-[10px] text-gray-400">{exp.created_at ? formatLocalTime(exp.created_at) : ''}</div>
                            </div>
                            <div className="font-black text-red-400 text-sm mx-3">${exp.amount.toFixed(2)}</div>
                            <button onClick={() => deleteExpense(exp.id)} className="w-8 h-8 rounded-full bg-red-500/20 border border-red-500/30 flex items-center justify-center text-red-400 font-black text-xs shrink-0 active:scale-90 transition-all">✕</button>
                        </div>
                    )) : (
                        <p className="text-center text-gray-400 py-8 font-bold text-sm">No hay gastos registrados hoy</p>
                    )}
                </div>

                {/* Formulario fijo abajo */}
                <div className="fixed bottom-0 left-0 right-0 bg-black/95 backdrop-blur-xl border-t border-white/10 p-4 z-50 space-y-2">
                    <label className="text-[10px] font-black text-amber-400 uppercase block">Registrar Nuevo Gasto</label>
                    <input type="text" value={expDesc} onChange={e => setExpDesc(e.target.value)} placeholder="Ej: Gasolina, Caseta, Comida..." className="w-full bg-black border border-white/10 rounded-xl p-3 text-white font-bold outline-none placeholder:text-gray-500 focus:border-amber-500" />
                    <div className="flex gap-2">
                        <input type="number" inputMode="decimal" value={expAmount} onChange={e => setExpAmount(e.target.value)} placeholder="$0.00" className="flex-1 bg-black border border-white/10 rounded-xl p-3 text-white font-bold outline-none placeholder:text-gray-500 focus:border-amber-500" />
                        <button onClick={submitExpense} disabled={expSaving} className="px-6 py-3 bg-red-500 rounded-xl text-sm font-black text-white uppercase active:scale-95 transition-all disabled:opacity-50 shrink-0">
                            {expSaving ? '...' : '+ Agregar'}
                        </button>
                    </div>
                </div>

                {toast && <div className={`fixed top-4 left-4 right-4 px-4 py-3 rounded-xl font-bold text-sm z-[100] text-center ${toast.type==='error'?'bg-red-500 text-white': toast.type==='warning'?'bg-amber-500 text-black':'bg-emerald-500 text-black'}`}>{toast.msg}</div>}
            </div>
        );
    }

    // ─── Render: Vista de Pedido ───
    if (view === 'order') {
        return <OrderView API={API} clients={clients} grandezaProducts={grandezaProducts} onBack={() => setView('route')} showToast={showToast} />;
    }

    // ─── Render: Vista de Ruta (principal) ───
    const visitedIds = new Set(visits.map(v => v.client_id));

    return (
        <div className="h-screen flex flex-col text-white overflow-hidden relative" style={{ backgroundColor: '#3a2e1e' }}>
            <DriverBackground />

            {/* Banner discreto de estado offline */}
            {!isOnline && (
                <div className="fixed top-0 left-0 right-0 z-[200] bg-amber-600/90 text-black text-[10px] font-black uppercase tracking-widest text-center py-1.5 flex items-center justify-center gap-2">
                    <span className="inline-block w-2 h-2 rounded-full bg-black animate-pulse" />
                    📡 Sin conexión — Modo local activo
                </div>
            )}
            {isOnline && pendingSyncCount > 0 && (
                <div className="fixed top-0 left-0 right-0 z-[200] bg-blue-600/90 text-white text-[10px] font-black uppercase tracking-widest text-center py-1.5">
                    ⏳ Sincronizando {pendingSyncCount} operación(es) pendiente(s)...
                </div>
            )}
            {/* Header */}
            <div className="relative z-20 p-4 border-b border-white/10 bg-black shadow-2xl">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="w-16 h-16 rounded-2xl overflow-hidden shadow-2xl shadow-orange-500/20 border-2 border-amber-500/30 flex items-center justify-center shrink-0">
                            <img src={LOGO_URL} alt="Grandeza" className="w-full h-full object-cover scale-[1.35]" />
                        </div>
                        <div>
                            <h1 className="font-black text-2xl uppercase tracking-tighter text-white leading-none">Herramienta <span className="text-amber-400">Repartidor</span></h1>
                        </div>
                    </div>
                    <button onClick={onBack} className="text-xs text-gray-400 font-bold uppercase px-4 py-3 bg-white/5 border border-white/10 rounded-xl hover:text-white hover:bg-white/10 transition-all shrink-0">← Salir</button>
                </div>
                <p className="text-sm font-black text-amber-200/80 uppercase tracking-wide mt-3">Ruta {todayDay} {todayStr().split('-').reverse().join('-')}</p>
                {routeType === 'EXTRAORDINARIA' && (
                    <div className="mt-2 px-3 py-1.5 bg-purple-600/20 border border-purple-500/30 rounded-xl inline-flex items-center gap-2">
                        <span className="text-purple-400 text-sm">⚡</span>
                        <span className="text-[10px] font-black text-purple-300 uppercase tracking-widest">
                            Ruta Extraordinaria{routeLabel ? ` — ${routeLabel}` : ''}
                        </span>
                    </div>
                )}
            </div>

            {/* Lista de clientes en ruta */}
            <div className="relative z-10 flex-1 overflow-y-auto p-4 space-y-2 pb-24">
                {routeSlots.map((slot, idx) => {
                    const client = getClientInfo(slot.client_id);
                    const done = visitedIds.has(slot.client_id);
                    return (
                        <button key={slot.slot_id || idx} onClick={() => !done && openVisit(slot)} disabled={done}
                            className={`w-full text-left p-4 rounded-2xl border transition-all ${done ? 'bg-emerald-500/5 border-emerald-500/20 opacity-60' : 'bg-black/60 border-amber-500/20 active:scale-[0.98]'}`}>
                            <div className="flex items-center gap-3">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black ${done ? 'bg-emerald-500 text-black' : 'bg-amber-500 text-black'}`}>
                                    {done ? '✓' : idx + 1}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="font-black text-white text-base truncate">{client?.name || `Cliente #${slot.client_id}`}</div>
                                    <div className="text-xs text-amber-200 truncate font-medium">{client?.business_name || ''}</div>
                                </div>
                                {client?.google_maps_url ? (
                                    <a href={client.google_maps_url} target="_blank" onClick={e => e.stopPropagation()} className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center text-sm" title="Navegar">📍</a>
                                ) : (
                                    <button onClick={(e) => { e.stopPropagation(); saveClientLocation(slot.client_id); }} className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-sm opacity-40" title="Guardar ubicación">📍</button>
                                )}
                            </div>
                        </button>
                    );
                })}

                {routeSlots.length === 0 && (
                    <div className="text-center py-12 text-amber-200">
                        <div className="text-3xl mb-2">🗺️</div>
                        <p className="font-bold text-sm">No hay clientes en la ruta de hoy</p>
                    </div>
                )}
            </div>

            {/* Barra inferior fija */}
            <div className="fixed bottom-0 left-0 right-0 bg-black/95 backdrop-blur-xl border-t border-white/10 p-2 sm:p-3 flex gap-2 z-50">
                <button onClick={() => openVisit({client_id: null, visit_order: 999}, true)}
                    className="flex-1 py-3 px-1 bg-amber-500/10 border border-amber-500/30 rounded-xl text-[10px] sm:text-xs font-black text-amber-400 uppercase leading-tight flex flex-col items-center justify-center text-center">
                    <span>+ Venta</span><span>Extra</span>
                </button>
                <button onClick={() => setView('order')}
                    className="flex-1 py-3 px-1 bg-blue-500/10 border border-blue-500/30 rounded-xl text-[10px] sm:text-xs font-black text-blue-400 uppercase leading-tight flex flex-col items-center justify-center text-center">
                    <span>📋</span><span>Pedido</span>
                </button>
                <button onClick={() => { setView('expenses'); }}
                    className="flex-1 py-3 px-1 bg-red-500/10 border border-red-500/30 rounded-xl text-[10px] sm:text-xs font-black text-red-400 uppercase leading-tight flex flex-col items-center justify-center text-center">
                    <span>🧾</span><span>Gastos</span>
                </button>
                <button onClick={() => setView('summary')}
                    className="flex-1 py-3 px-1 bg-white/5 border border-white/10 rounded-xl text-[10px] sm:text-xs font-black text-gray-300 uppercase leading-tight flex flex-col items-center justify-center text-center">
                    <span>📊</span><span>Resumen</span>
                </button>
            </div>

            {/* Modal Post-Visita (WhatsApp + Confirmación) */}
            {lastVisitResult && (
                <div className="fixed inset-0 z-[150] flex items-end justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setLastVisitResult(null)}>
                    <div className="bg-[#1a1510] border border-amber-500/20 rounded-3xl p-6 w-full max-w-md shadow-2xl mb-16 space-y-4" onClick={e => e.stopPropagation()}>
                        <div className="text-center">
                            <div className="text-4xl mb-2">{lastVisitResult.wasOffline ? '📡' : '✅'}</div>
                            <h3 className="text-lg font-black uppercase tracking-tighter text-white">
                                {lastVisitResult.wasOffline ? 'Guardada Localmente' : 'Visita Completada'}
                            </h3>
                            <p className="text-sm text-amber-200/70 font-medium mt-1">
                                {lastVisitResult.clientLabel} — <span className="text-emerald-400 font-black">${lastVisitResult.saleAmount.toFixed(2)}</span>
                            </p>
                            {lastVisitResult.wasOffline && (
                                <p className="text-xs text-amber-400/60 mt-1">Se sincronizará al recuperar señal</p>
                            )}
                        </div>
                        {lastVisitResult.whatsappURL && (
                            <button
                                onClick={() => { window.open(lastVisitResult.whatsappURL, '_blank'); setLastVisitResult(null); }}
                                className="w-full py-4 bg-[#128C7E] rounded-2xl text-sm font-black text-white uppercase tracking-widest active:scale-95 transition-all flex justify-center items-center gap-3 shadow-[0_0_20px_rgba(18,140,126,0.3)] border border-[#075E54]"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="white"><path d="M12.031 0C5.385 0 0 5.385 0 12.031c0 2.128.547 4.204 1.587 6.035L.057 24l6.104-1.602c1.782.99 3.79 1.512 5.87 1.512 6.645 0 12.03-5.385 12.03-12.03S18.676 0 12.031 0zM12.03 21.905c-1.802 0-3.57-.484-5.118-1.403l-.367-.217-3.805.998 1.015-3.708-.238-.378c-.987-1.564-1.507-3.376-1.507-5.234 0-5.54 4.51-10.05 10.05-10.05 5.54 0 10.05 4.51 10.05 10.05 0 5.54-4.51 10.05-10.05 10.05z"/></svg>
                                Enviar Ticket por WhatsApp
                            </button>
                        )}
                        <button
                            onClick={() => setLastVisitResult(null)}
                            className="w-full py-3 bg-white/5 border border-white/10 rounded-xl text-xs font-bold text-gray-400 uppercase tracking-widest"
                        >
                            Continuar sin enviar
                        </button>
                    </div>
                </div>
            )}

            {/* Toast */}
            {toast && <div className={`fixed ${!isOnline ? 'top-10' : 'top-4'} left-4 right-4 px-4 py-3 rounded-xl font-bold text-sm z-[100] text-center ${toast.type==='error'?'bg-red-500 text-white': toast.type==='warning'?'bg-amber-500 text-black':'bg-emerald-500 text-black'}`}>{toast.msg}</div>}

            {/* Modal Editar Cliente */}
            {editingClient && (
                <EditClientModal 
                    client={editingClient} 
                    onClose={() => setEditingClient(null)} 
                    onSave={(updated) => {
                        setClients(prev => prev.map(c => c.id === updated.id ? updated : c));
                        setEditingClient(null);
                        showToast('✅ Cliente actualizado');
                    }}
                    API={API}
                />
            )}
        </div>
    );
};

// ─── Sub-Componente: Editar Cliente ──────────────────────────────────────────
const EditClientModal = ({ client, onClose, onSave, API }) => {
    const [name, setName] = useState(client.name || '');
    const [businessName, setBusinessName] = useState(client.business_name || '');
    const [phone, setPhone] = useState(client.phone || '');
    const [saving, setSaving] = useState(false);

    const handleSave = async () => {
        setSaving(true);
        try {
            const res = await fetch(`${API}/grandeza/clients/${client.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, business_name: businessName, phone })
            });
            if (!res.ok) throw new Error('Error al guardar');
            onSave({ ...client, name, business_name: businessName, phone });
        } catch (e) {
            alert('Error al guardar: ' + e.message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-[#1a1510] border border-white/10 rounded-3xl p-6 w-full max-w-md shadow-2xl">
                <h3 className="text-xl font-black text-white uppercase tracking-tighter mb-4">Editar Cliente</h3>
                <div className="space-y-4">
                    <div>
                        <label className="text-[10px] font-black text-amber-500 uppercase tracking-widest">Nombre del Cliente</label>
                        <input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full bg-black/50 border border-white/10 rounded-xl p-3 text-white font-bold outline-none mt-1" />
                    </div>
                    <div>
                        <label className="text-[10px] font-black text-amber-500 uppercase tracking-widest">Nombre del Negocio</label>
                        <input type="text" value={businessName} onChange={e => setBusinessName(e.target.value)} className="w-full bg-black/50 border border-white/10 rounded-xl p-3 text-white font-bold outline-none mt-1" />
                    </div>
                    <div>
                        <label className="text-[10px] font-black text-amber-500 uppercase tracking-widest">Teléfono</label>
                        <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} className="w-full bg-black/50 border border-white/10 rounded-xl p-3 text-white font-bold outline-none mt-1" />
                    </div>
                </div>
                <div className="flex gap-3 mt-6">
                    <button onClick={onClose} className="flex-1 py-3 bg-white/5 border border-white/10 rounded-xl text-xs font-bold text-gray-400 uppercase tracking-widest">Cancelar</button>
                    <button onClick={handleSave} disabled={saving} className="flex-1 py-3 bg-amber-500 rounded-xl text-xs font-black text-black uppercase tracking-widest shadow-xl shadow-amber-500/20">{saving ? 'Guardando...' : 'Guardar'}</button>
                </div>
            </div>
        </div>
    );
};

// ─── Sub-Componente: Levantar Pedido ─────────────────────────────────────────
const OrderView = ({ API, clients, grandezaProducts, onBack, showToast }) => {
    const LOGO_URL = `${API.replace('/api/v1', '')}/static/images/grandeza/logo.png`;
    const [selectedClient, setSelectedClient] = useState('');
    const [customClientName, setCustomClientName] = useState('');
    const [customClientPhone, setCustomClientPhone] = useState('');
    const [orderItems, setOrderItems] = useState(grandezaProducts.map(gp => ({ product_id: gp.product_id, product_name: gp.product_name, qty: 0, unit_price: gp.b2b_price, lead_time_hours: gp.order_lead_time_hours || 0 })));
    const [deliveryDate, setDeliveryDate] = useState('');
    const [deliveryTime, setDeliveryTime] = useState('');
    const [paymentStatus, setPaymentStatus] = useState('PAGADO'); // PENDIENTE, ANTICIPO, PAGADO
    const [advancePaymentStr, setAdvancePaymentStr] = useState('');
    const [payMethod, setPayMethod] = useState('EFECTIVO');
    const [notes, setNotes] = useState('');
    const [saving, setSaving] = useState(false);

    const totalAmount = orderItems.reduce((s, it) => s + (it.qty * it.unit_price), 0);

    // Calcular la fecha mínima de entrega según el lead time más largo de los productos seleccionados
    const selectedItems = orderItems.filter(it => it.qty > 0);
    const maxLeadTimeHours = selectedItems.length > 0 ? Math.max(...selectedItems.map(it => it.lead_time_hours || 0)) : 0;
    const now = new Date();
    const earliestDelivery = new Date(now.getTime() + maxLeadTimeHours * 60 * 60 * 1000);
    const earliestDateStr = earliestDelivery.toISOString().split('T')[0];
    const earliestTimeStr = earliestDelivery.toTimeString().slice(0, 5);

    // Auto-rellenar la fecha sugerida cuando cambian los productos seleccionados (solo si está vacío)
    useEffect(() => {
        if (selectedItems.length > 0 && maxLeadTimeHours > 0) {
            // Solo auto-llenar si está completamente vacío, para no borrar la captura manual del usuario
            if (!deliveryDate) {
                setDeliveryDate(earliestDateStr);
                setDeliveryTime(earliestTimeStr);
            }
        }
    }, [maxLeadTimeHours]);

    // Validar si la fecha seleccionada es válida respecto al lead time
    const isDateTooEarly = deliveryDate && maxLeadTimeHours > 0 && (deliveryDate < earliestDateStr || (deliveryDate === earliestDateStr && deliveryTime && deliveryTime < earliestTimeStr));
    const advanceAmount = paymentStatus === 'PAGADO' ? totalAmount : (paymentStatus === 'ANTICIPO' ? (parseFloat(advancePaymentStr) || 0) : 0);
    const balanceDue = Math.max(0, totalAmount - advanceAmount);
    const client = clients.find(c => c.id === parseInt(selectedClient));

    const submitOrder = async () => {
        if (!deliveryDate) { showToast('⚠️ Selecciona fecha de entrega', 'error'); return; }
        if (totalAmount <= 0) { showToast('⚠️ Agrega productos al pedido', 'error'); return; }
        if (isDateTooEarly) { showToast(`⚠️ La fecha no alcanza. Se requieren ${maxLeadTimeHours}h de producción`, 'error'); return; }
        setSaving(true);
        try {
            const res = await fetch(`${API}/grandeza/orders`, {
                method: 'POST', headers: {'Content-Type':'application/json'},
                body: JSON.stringify({
                    client_id: selectedClient === 'CUSTOM' ? null : (parseInt(selectedClient) || null),
                    client_name: selectedClient === 'CUSTOM' ? (customClientName || 'Cliente no registrado') : (client?.name || 'Cliente en ruta'),
                    client_phone: selectedClient === 'CUSTOM' ? (customClientPhone || null) : (client?.phone || null),
                    items: orderItems.filter(it => it.qty > 0),
                    total_amount: totalAmount,
                    advance_payment: advanceAmount,
                    payment_method: payMethod,
                    delivery_date: deliveryDate,
                    delivery_time: deliveryTime || null,
                    notes: notes || null,
                })
            });
            if (res.ok) {
                showToast('✅ Pedido levantado exitosamente');
                onBack();
            } else { showToast('❌ Error al crear pedido', 'error'); }
        } catch(e) { showToast('❌ Error de red', 'error'); }
        finally { setSaving(false); }
    };

    return (
        <div className="h-screen flex flex-col text-white overflow-hidden relative" style={{ backgroundColor: '#3a2e1e' }}>
            <DriverBackground />
            <div className="relative z-20 p-4 border-b border-white/10 bg-black shadow-2xl">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl overflow-hidden shadow-2xl shadow-orange-500/20 border-2 border-amber-500/30 flex items-center justify-center shrink-0">
                            <img src={LOGO_URL} alt="Grandeza" className="w-full h-full object-cover scale-[1.35]" />
                        </div>
                        <div>
                            <h1 className="font-black text-xl uppercase tracking-tighter text-white leading-none"><span className="text-blue-400">Pedido</span></h1>
                        </div>
                    </div>
                    <button onClick={onBack} className="text-xs text-gray-400 font-bold uppercase px-4 py-3 bg-white/5 border border-white/10 rounded-xl hover:text-white hover:bg-white/10 transition-all shrink-0">← Ruta</button>
                </div>
            </div>
            <div className="relative z-10 flex-1 overflow-y-auto p-4 space-y-4 pb-28">
                {/* Cliente */}
                <div>
                    <label className="text-[10px] font-black text-amber-400/80 uppercase block mb-1">Cliente</label>
                    <select value={selectedClient} onChange={e => { setSelectedClient(e.target.value); if (e.target.value !== 'CUSTOM') { setCustomClientName(''); setCustomClientPhone(''); } }} className="w-full bg-black border border-white/10 rounded-xl p-3 text-white font-bold outline-none" style={{ colorScheme: 'dark' }}>
                        <option value="" style={{ background: '#000', color: '#fff' }}>Seleccionar cliente...</option>
                        <option value="CUSTOM" style={{ background: '#000', color: '#fbbf24' }}>✏️ Cliente no registrado (escribir nombre)</option>
                        {clients.map(c => <option key={c.id} value={c.id} style={{ background: '#000', color: '#fff' }}>{c.name} {c.business_name ? `(${c.business_name})` : ''}</option>)}
                    </select>
                    {selectedClient === 'CUSTOM' && (
                        <>
                            <input type="text" value={customClientName} onChange={e => setCustomClientName(e.target.value)} placeholder="¿Cómo se llama el cliente?" className="w-full bg-black border border-amber-500/30 rounded-xl p-3 text-white font-bold outline-none mt-2 placeholder:text-gray-500" autoFocus />
                            <input type="tel" inputMode="tel" value={customClientPhone} onChange={e => setCustomClientPhone(e.target.value)} placeholder="📱 Teléfono (para ticket WhatsApp)" className="w-full bg-black border border-amber-500/30 rounded-xl p-3 text-white font-bold outline-none mt-2 placeholder:text-gray-500" />
                        </>
                    )}
                </div>
                {/* Fecha y Hora de entrega */}
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="text-[10px] font-black text-amber-400/80 uppercase block mb-1">Fecha Entrega</label>
                        <input type="date" value={deliveryDate} min={earliestDateStr} onChange={e => setDeliveryDate(e.target.value)} className={`w-full bg-white/5 border rounded-xl p-3 text-white font-bold outline-none ${isDateTooEarly ? 'border-red-500/50' : 'border-white/10'}`} style={{ colorScheme: 'dark' }} />
                    </div>
                    <div>
                        <label className="text-[10px] font-black text-amber-400/80 uppercase block mb-1">Hora Entrega</label>
                        <input type="time" value={deliveryTime} onChange={e => setDeliveryTime(e.target.value)} className={`w-full bg-white/5 border rounded-xl p-3 text-white font-bold outline-none ${isDateTooEarly ? 'border-red-500/50' : 'border-white/10'}`} style={{ colorScheme: 'dark' }} />
                    </div>
                </div>
                {maxLeadTimeHours > 0 && (
                    <div className={`flex items-start gap-2 p-3 rounded-xl text-[10px] font-bold ${isDateTooEarly ? 'bg-red-500/10 border border-red-500/30 text-red-400' : 'bg-purple-500/10 border border-purple-500/20 text-purple-300'}`}>
                        <span className="text-sm mt-[-2px]">{isDateTooEarly ? '⚠️' : '⏱️'}</span>
                        <div>
                            {isDateTooEarly ? (
                                <span>La fecha seleccionada no alcanza. Los productos de este pedido requieren <strong>{maxLeadTimeHours}h</strong> de producción. Fecha más próxima: <strong>{earliestDateStr} {earliestTimeStr}</strong></span>
                            ) : (
                                <span>Según tiempos de producción ({maxLeadTimeHours}h), la entrega más próxima es el <strong>{earliestDateStr}</strong> a las <strong>{earliestTimeStr}</strong></span>
                            )}
                        </div>
                    </div>
                )}
                
                {/* Cobro del Pedido */}
                <div className="bg-black/30 p-4 rounded-2xl border border-white/5 space-y-4">
                    <div>
                        <label className="text-[10px] font-black text-amber-400/80 uppercase block mb-2">¿Se cobró el pedido?</label>
                        <div className="flex gap-2">
                            {['PAGADO', 'ANTICIPO', 'PENDIENTE'].map(status => (
                                <button key={status} onClick={() => setPaymentStatus(status)} className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider border ${paymentStatus === status ? 'bg-amber-500/20 border-amber-500/40 text-amber-400' : 'bg-white/5 border-white/10 text-gray-400'}`}>
                                    {status === 'PAGADO' ? 'Pagado Total' : status === 'ANTICIPO' ? 'Dio Anticipo' : 'No Cobrado'}
                                </button>
                            ))}
                        </div>
                    </div>

                    {paymentStatus !== 'PENDIENTE' && (
                        <div>
                            <label className="text-[10px] font-black text-gray-400 uppercase block mb-2">Forma de Pago</label>
                            <div className="flex gap-2">
                                {['EFECTIVO','TRANSFERENCIA'].map(m => (
                                    <button key={m} onClick={() => setPayMethod(m)} className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase border ${payMethod === m ? 'bg-blue-500/20 border-blue-500/40 text-blue-400' : 'bg-white/5 border-white/10 text-gray-400'}`}>{m === 'EFECTIVO' ? '💵 EFECTIVO' : '📲 TRANSF.'}</button>
                                ))}
                            </div>
                        </div>
                    )}

                    {paymentStatus === 'ANTICIPO' && (
                        <div>
                            <label className="text-[10px] font-black text-amber-400/80 uppercase block mb-1">Monto del Anticipo Recibido</label>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold">$</span>
                                <input type="number" step="0.01" value={advancePaymentStr} onChange={e => setAdvancePaymentStr(e.target.value)} placeholder="0.00" className="w-full bg-black border border-white/10 rounded-xl p-3 pl-8 text-white font-bold outline-none" />
                            </div>
                        </div>
                    )}
                    
                    <div className="flex justify-between items-center border-t border-white/10 pt-3">
                        <span className="text-xs text-gray-400 font-bold uppercase">Total Pedido:</span>
                        <span className="text-sm font-black text-white">${totalAmount.toFixed(2)}</span>
                    </div>
                    {paymentStatus === 'ANTICIPO' && (
                        <div className="flex justify-between items-center">
                            <span className="text-xs text-amber-400/80 font-bold uppercase">Resta por Cobrar:</span>
                            <span className="text-sm font-black text-amber-400">${balanceDue.toFixed(2)}</span>
                        </div>
                    )}
                </div>

                {/* Productos */}
                <div>
                    <label className="text-[10px] font-black text-amber-400/80 uppercase block mb-2">Productos</label>
                    {orderItems.map(it => (
                        <div key={it.product_id} className="flex items-center justify-between bg-white/[0.02] border border-white/5 rounded-xl p-3 mb-2">
                            <div className="flex-1"><div className="font-bold text-sm">{it.product_name}</div><div className="text-xs text-gray-300">${it.unit_price.toFixed(2)}</div></div>
                            <div className="flex items-center gap-1">
                                <button onClick={() => setOrderItems(prev => prev.map(x => x.product_id === it.product_id ? {...x, qty: Math.max(0, x.qty-1)} : x))} className="w-8 h-8 rounded-lg bg-white/5 text-white font-bold">−</button>
                                <input type="number" value={it.qty} onChange={e => setOrderItems(prev => prev.map(x => x.product_id === it.product_id ? {...x, qty: parseInt(e.target.value)||0} : x))} className="w-14 bg-black/40 border border-white/10 rounded-lg text-center font-black text-white p-2 outline-none" />
                                <button onClick={() => setOrderItems(prev => prev.map(x => x.product_id === it.product_id ? {...x, qty: x.qty+1} : x))} className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-400 font-bold">+</button>
                            </div>
                        </div>
                    ))}
                </div>
                <div>
                    <label className="text-[10px] font-black text-amber-400/80 uppercase block mb-1">Notas</label>
                    <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Instrucciones especiales..." className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-sm text-white outline-none resize-none min-h-[50px]" />
                </div>
            </div>
            {/* Barra fija */}
            <div className="fixed bottom-0 left-0 right-0 bg-black/95 backdrop-blur-xl border-t border-white/10 p-4 z-50">
                <div className="flex justify-between items-center mb-3">
                    <span className="font-black text-lg">Total: <span className="text-blue-400">${totalAmount.toFixed(2)}</span></span>
                    <span className="text-xs text-gray-300 font-bold">{payMethod}</span>
                </div>
                <button onClick={submitOrder} disabled={saving} className="w-full py-4 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-xl text-sm font-black text-white uppercase shadow-lg disabled:opacity-50">
                    {saving ? 'Procesando...' : '📋 Confirmar Pedido'}
                </button>
            </div>
        </div>
    );
};
