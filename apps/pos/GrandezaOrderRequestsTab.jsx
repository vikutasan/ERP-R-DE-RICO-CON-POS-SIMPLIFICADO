import React, { useState, useEffect, useCallback } from 'react';
import { CONFIG } from './config';

const API_BASE = CONFIG.API_BASE_URL;

const DAYS = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO', 'DOMINGO'];

// Espejo de MSG_SELECTORES_VALIDOS del backend.
const SELECTORES = [
    { id: 'TODOS', label: 'Todos los clientes' },
    { id: 'ACTIVOS', label: 'Solo activos' },
    { id: 'INACTIVOS', label: 'Solo inactivos' },
    { id: 'LUNES', label: 'Clientes de Lunes' },
    { id: 'MARTES', label: 'Clientes de Martes' },
    { id: 'MIERCOLES', label: 'Clientes de Miércoles' },
    { id: 'JUEVES', label: 'Clientes de Jueves' },
    { id: 'VIERNES', label: 'Clientes de Viernes' },
    { id: 'SABADO', label: 'Clientes de Sábado' },
    { id: 'DOMINGO', label: 'Clientes de Domingo' },
    { id: 'PROXIMA_EXTEMPORANEA', label: 'Próxima ruta extemporánea' },
];

const hoyISO = () => {
    const d = new Date();
    const off = d.getTimezoneOffset();
    return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
};

/**
 * 5ª pestaña: Programación de Pedidos.
 *
 * - Configura día/hora límite, día de entrega y selector.
 * - Muestra la matriz clientes × productos + fila de totales.
 * - Permite editar cantidades y guardar cada pedido (UPSERT).
 * - Envía la matriz confirmada al módulo de Producción.
 *
 * IMPORTANTE (D-4): solo aparecen los clientes que RESPONDIERON. Los que no
 * respondieron no se integran a la tabla.
 */
export const GrandezaOrderRequestsTab = ({ onStatus }) => {
    const [config, setConfig] = useState({
        enabled: false,
        deadline_day: 'MIERCOLES',
        deadline_time: '18:00',
        delivery_day: 'JUEVES',
        selector: 'TODOS',
    });
    const [deliveryDate, setDeliveryDate] = useState(hoyISO());
    const [matrix, setMatrix] = useState(null);
    const [loading, setLoading] = useState(false);
    const [savingCfg, setSavingCfg] = useState(false);
    const [savedOk, setSavedOk] = useState(false);
    const [dirty, setDirty] = useState({});      // client_id -> { product_id: qty }
    const [savingRow, setSavingRow] = useState(null);
    const [dispatching, setDispatching] = useState(false);
    const [dispatchResult, setDispatchResult] = useState(null);

    // ── OCR (Fase B, Ruta A) ──────────────────────────────────────────────
    // La IA PROPONE; el operador CONFIRMA. Nunca se guarda sin revisión.
    const [ocrLoading, setOcrLoading] = useState(false);
    const [ocrPropuesta, setOcrPropuesta] = useState(null);   // respuesta del backend
    const [ocrError, setOcrError] = useState(null);
    const [ocrPreview, setOcrPreview] = useState(null);       // dataURL de la captura
    const [ocrEdit, setOcrEdit] = useState(null);             // { cliente_id, items: [{producto_id, cantidad}] }
    const [ocrSaving, setOcrSaving] = useState(false);
    // Captura MANUAL de un pedido (sin captura de pantalla). Reutiliza el
    // mismo editor que el panel OCR: cliente + renglones producto/cantidad.
    // Necesario porque la matriz superior solo muestra a quienes YA pidieron
    // (D-4), así que no hay forma de dar de alta un pedido desde cero.
    const [manualMode, setManualMode] = useState(false);
    const fileInputRef = React.useRef(null);

    // Directorio COMPLETO de clientes activos de Grandeza.
    // El selector de cliente del panel OCR NO puede usar `matrix.rows`: la
    // matriz solo trae clientes que YA tienen pedido para esa fecha (D-4).
    // Al capturar un pedido nuevo (el caso normal del OCR), ese cliente no
    // está en la matriz y el dropdown quedaría vacío. Por eso se carga el
    // directorio aparte, una sola vez.
    const [clientesDirectorio, setClientesDirectorio] = useState([]);

    const notify = (text, type = 'success') => {
        if (onStatus) onStatus(text, type);
    };

    // ─── Carga ────────────────────────────────────────────────────────────────

    const fetchConfig = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE}/grandeza/order-requests/config`);
            if (res.ok) {
                const data = await res.json();
                setConfig({
                    enabled: !!data.enabled,
                    deadline_day: data.deadline_day || 'MIERCOLES',
                    deadline_time: data.deadline_time || '18:00',
                    delivery_day: data.delivery_day || 'JUEVES',
                    selector: data.selector || 'TODOS',
                });
            }
        } catch (e) {
            console.error('Error fetching order config:', e);
        }
    }, []);

    const fetchMatrix = useCallback(async (fecha) => {
        setLoading(true);
        try {
            const res = await fetch(`${API_BASE}/grandeza/order-requests/matrix/${fecha}`);
            if (res.ok) {
                setMatrix(await res.json());
                setDirty({});
            } else {
                setMatrix(null);
            }
        } catch (e) {
            console.error('Error fetching order matrix:', e);
            setMatrix(null);
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchClientesDirectorio = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE}/grandeza/clients?active_only=true`);
            if (res.ok) {
                const data = await res.json();
                setClientesDirectorio(Array.isArray(data) ? data : []);
            }
        } catch (e) {
            console.error('Error fetching clientes directorio:', e);
        }
    }, []);

    useEffect(() => { fetchConfig(); }, [fetchConfig]);
    useEffect(() => { fetchMatrix(deliveryDate); }, [deliveryDate, fetchMatrix]);
    useEffect(() => { fetchClientesDirectorio(); }, [fetchClientesDirectorio]);

    // ─── Config ───────────────────────────────────────────────────────────────

    const saveConfig = async () => {
        setSavingCfg(true);
        try {
            const res = await fetch(`${API_BASE}/grandeza/order-requests/config`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config),
            });
            if (res.ok) {
                setConfig(await res.json());
                setSavedOk(true);
                setTimeout(() => setSavedOk(false), 4000);
                notify('Configuración de pedidos guardada');
            } else {
                notify('No se pudo guardar la configuración', 'error');
            }
        } catch (e) {
            console.error(e);
            notify('Error de red al guardar la configuración', 'error');
        } finally {
            setSavingCfg(false);
        }
    };

    // ─── Edición de celdas ────────────────────────────────────────────────────

    const qtyOf = (row, productId) => {
        const d = dirty[row.client_id];
        if (d && d[productId] !== undefined) return d[productId];
        return (row.quantities && row.quantities[String(productId)]) || 0;
    };

    const setQty = (row, productId, value) => {
        const num = value === '' ? 0 : Math.max(0, Number(value));
        setDirty(prev => ({
            ...prev,
            [row.client_id]: {
                ...(prev[row.client_id] || {}),
                [productId]: num,
            },
        }));
    };

    const rowTotal = (row) => {
        if (!matrix) return 0;
        return matrix.products.reduce((acc, p) => acc + Number(qtyOf(row, p.product_id) || 0), 0);
    };

    const grandTotal = () => {
        if (!matrix) return 0;
        return matrix.rows.reduce((acc, r) => acc + rowTotal(r), 0);
    };

    // ─── Compartir la matriz por WhatsApp ─────────────────────────────────────
    // Arma un texto legible (monoespaciado) con la matriz completa: una línea
    // por cliente con sus cantidades por producto, más la fila de totales.
    // NO envía nada por sí sola: abre WhatsApp con el texto precargado para que
    // el operador elija el destinatario y confirme (humano-en-el-bucle).
    const buildMatrixWhatsAppText = () => {
        if (!matrix || !matrix.rows || matrix.rows.length === 0) return '';

        const productos = matrix.products || [];
        const fecha = deliveryDate || hoyISO();

        const lineas = [];
        lineas.push(`📋 *MATRIZ DE PEDIDOS* — ${fecha}`);
        lineas.push('');

        // Encabezado de productos (abreviado a 4 letras para que quepa).
        const abrev = (nombre) => String(nombre || '').slice(0, 4).toUpperCase();
        const cabecera = ['CLIENTE', ...productos.map(p => abrev(p.product_name)), 'TOTAL'];
        lineas.push(cabecera.join(' | '));
        lineas.push('-'.repeat(cabecera.join(' | ').length));

        // Una línea por cliente.
        matrix.rows.forEach(row => {
            const celdas = productos.map(p => String(qtyOf(row, p.product_id) || 0));
            lineas.push([row.client_name, ...celdas, String(rowTotal(row))].join(' | '));
        });

        // Fila de totales por producto.
        lineas.push('-'.repeat(cabecera.join(' | ').length));
        const totales = (matrix.totals || []).map(t => String(t.total));
        lineas.push(['TOTAL', ...totales, String(grandTotal())].join(' | '));
        lineas.push('');
        lineas.push(`👥 ${matrix.total_clients} clientes · 🧮 ${grandTotal()} piezas`);

        return lineas.join('\n');
    };

    const enviarMatrizWhatsApp = () => {
        const texto = buildMatrixWhatsAppText();
        if (!texto) {
            notify('No hay matriz para enviar', 'error');
            return;
        }
        // Sin destinatario fijo: WhatsApp abre el selector de contacto.
        window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank');
    };

    // ─── Guardar una fila (UPSERT) ────────────────────────────────────────────

    const saveRow = async (row) => {
        if (!matrix) return;
        setSavingRow(row.client_id);
        try {
            const items = matrix.products
                .map(p => ({
                    product_id: p.product_id,
                    quantity: Number(qtyOf(row, p.product_id) || 0),
                }))
                .filter(i => i.quantity > 0);

            const payload = {
                client_id: row.client_id,
                delivery_date: matrix.delivery_date,
                selector_used: matrix.selector || 'TODOS',
                source: row.source || 'MANUAL',
                status: 'CONFIRMADO',
                items,
            };

            const res = await fetch(`${API_BASE}/grandeza/order-requests`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (res.ok) {
                notify(`Pedido de ${row.client_name} guardado`);
                await fetchMatrix(deliveryDate);
            } else {
                notify(`No se pudo guardar el pedido de ${row.client_name}`, 'error');
            }
        } catch (e) {
            console.error(e);
            notify('Error de red al guardar el pedido', 'error');
        } finally {
            setSavingRow(null);
        }
    };

    const deleteRow = async (row) => {
        if (!row.request_id) return;
        try {
            const res = await fetch(`${API_BASE}/grandeza/order-requests/${row.request_id}`, {
                method: 'DELETE',
            });
            if (res.ok) {
                notify(`Pedido de ${row.client_name} eliminado`);
                await fetchMatrix(deliveryDate);
            } else {
                notify('No se pudo eliminar el pedido', 'error');
            }
        } catch (e) {
            console.error(e);
            notify('Error de red al eliminar', 'error');
        }
    };

    // ─── Despacho a Producción ────────────────────────────────────────────────

    const dispatchToProduction = async () => {
        if (!matrix) return;
        setDispatching(true);
        setDispatchResult(null);
        try {
            const res = await fetch(`${API_BASE}/grandeza/order-requests/dispatch`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    delivery_date: matrix.delivery_date,
                    dispatched_by: 'Parámetros Grandeza',
                }),
            });
            if (res.ok) {
                const data = await res.json();
                setDispatchResult(data);
                notify(`Enviado a Producción: ${data.orders_created} nuevas, ${data.orders_updated} actualizadas`);
                await fetchMatrix(deliveryDate);
            } else {
                notify('No se pudo enviar a Producción', 'error');
            }
        } catch (e) {
            console.error(e);
            notify('Error de red al enviar a Producción', 'error');
        } finally {
            setDispatching(false);
        }
    };

    // ─── OCR: subir captura de WhatsApp (Fase B, Ruta A) ──────────────────────

    /**
     * Convierte un File a base64 (sin el prefijo `data:...;base64,`).
     * El backend espera la imagen "pelada".
     */
    const fileABase64 = (file) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const raw = String(reader.result || '');
            const coma = raw.indexOf(',');
            resolve(coma >= 0 ? raw.slice(coma + 1) : raw);
        };
        reader.onerror = () => reject(new Error('No se pudo leer la imagen'));
        reader.readAsDataURL(file);
    });

    const handleOcrUpload = async (event) => {
        const file = event.target.files && event.target.files[0];
        if (!file) return;

        // Vista previa local (no se sube a ningún lado más que al motor).
        const previewUrl = URL.createObjectURL(file);
        setOcrPreview(previewUrl);
        setOcrError(null);
        setOcrPropuesta(null);
        setOcrEdit(null);
        setOcrLoading(true);

        try {
            const imagen_base64 = await fileABase64(file);

            // Catálogos reales para que el ERP haga el match en cascada.
            const productos_catalogo = (matrix?.products || []).map(p => p.product_name);
            // El match de cliente se hace contra el directorio COMPLETO, no
            // contra la matriz (que solo trae a quienes ya pidieron).
            const clientes_catalogo = clientesDirectorio.map(c => c.name);

            const res = await fetch(`${API_BASE}/grandeza/order-requests/ocr-extract`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    imagen_base64,
                    productos_catalogo,
                    clientes_catalogo,
                }),
            });

            if (res.status === 503) {
                const detalle = await res.json().catch(() => ({}));
                setOcrError(
                    detalle?.detail?.mensaje
                    || 'El motor de IA no está disponible. Captura el pedido a mano.'
                );
                notify('Motor de IA no disponible (captura manual)', 'error');
                return;
            }

            if (!res.ok) {
                setOcrError('No se pudo leer la captura.');
                notify('Error al procesar la captura', 'error');
                return;
            }

            const data = await res.json();
            setOcrPropuesta(data);

            if (!data.ok) {
                setOcrError(data.notas || 'El OCR no encontró texto legible en la captura.');
                return;
            }

            // Pre-carga el editor con la propuesta (el operador la corrige).
            setOcrEdit({
                cliente_id: data.cliente_id || '',
                items: (data.items || []).map(it => ({
                    producto_id: it.producto_id || '',
                    producto: it.producto,
                    cantidad: Number(it.cantidad || 0),
                    confianza: it.confianza,
                    requiere_revision: !!it.requiere_revision,
                })),
            });

            notify(
                `Captura leída: ${(data.items || []).length} renglón(es) propuestos. Revisa y confirma.`
            );
        } catch (e) {
            console.error(e);
            setOcrError('Error de red al procesar la captura.');
            notify('Error de red al procesar la captura', 'error');
        } finally {
            setOcrLoading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const cancelarOcr = () => {
        setOcrPropuesta(null);
        setOcrEdit(null);
        setOcrError(null);
        setManualMode(false);
        if (ocrPreview) URL.revokeObjectURL(ocrPreview);
        setOcrPreview(null);
    };

    /**
     * Abre el editor en modo CAPTURA MANUAL (sin captura de pantalla).
     * Arranca con un renglón vacío para que el operador lo llene.
     */
    const abrirManual = () => {
        setOcrPropuesta(null);
        setOcrError(null);
        setManualMode(true);
        setOcrEdit({
            cliente_id: '',
            items: [{ producto_id: '', producto: '', cantidad: 0, confianza: 0, requiere_revision: false }],
        });
    };

    const setOcrItemField = (index, field, value) => {
        setOcrEdit(prev => {
            if (!prev) return prev;
            const items = prev.items.map((it, i) => (
                i === index ? { ...it, [field]: value } : it
            ));
            return { ...prev, items };
        });
    };

    const quitarOcrItem = (index) => {
        setOcrEdit(prev => {
            if (!prev) return prev;
            return { ...prev, items: prev.items.filter((_, i) => i !== index) };
        });
    };

    const agregarOcrItem = () => {
        setOcrEdit(prev => {
            if (!prev) return prev;
            return {
                ...prev,
                items: [...prev.items, { producto_id: '', producto: '', cantidad: 0, confianza: 0, requiere_revision: true }],
            };
        });
    };

    /**
     * Confirma la propuesta OCR y la guarda como pedido real (UPSERT).
     * Aquí es donde el humano cierra el ciclo: nada se guardó antes.
     */
    const confirmarOcr = async () => {
        if (!ocrEdit || !matrix) return;
        if (!ocrEdit.cliente_id) {
            notify('Selecciona el cliente antes de confirmar', 'error');
            return;
        }
        const items = (ocrEdit.items || [])
            .filter(it => it.producto_id && Number(it.cantidad) > 0)
            .map(it => ({ product_id: Number(it.producto_id), quantity: Number(it.cantidad) }));

        if (items.length === 0) {
            notify('Agrega al menos un producto con cantidad', 'error');
            return;
        }

        setOcrSaving(true);
        try {
            const payload = {
                client_id: Number(ocrEdit.cliente_id),
                delivery_date: matrix.delivery_date,
                selector_used: matrix.selector || 'TODOS',
                source: 'OCR',
                status: 'CONFIRMADO',
                items,
            };
            const res = await fetch(`${API_BASE}/grandeza/order-requests`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (res.ok) {
                notify('Pedido OCR confirmado y guardado');
                cancelarOcr();
                await fetchMatrix(deliveryDate);
            } else {
                notify('No se pudo guardar el pedido OCR', 'error');
            }
        } catch (e) {
            console.error(e);
            notify('Error de red al guardar el pedido OCR', 'error');
        } finally {
            setOcrSaving(false);
        }
    };

    // ─── Render ───────────────────────────────────────────────────────────────

    return (
        <div className="space-y-6 animate-[fade-in_0.3s_ease-in]">

            {/* ── Configuración ── */}
            <div className="bg-[#0d0b09] border-2 border-amber-500/30 rounded-3xl p-6 shadow-2xl">
                <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
                    <h2 className="text-lg font-black uppercase tracking-widest text-amber-400">
                        ⚙️ Configuración de Pedidos
                    </h2>
                    <div className="flex items-center gap-3">
                        {savedOk && (
                            <span className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-green-500/15 border border-green-500/40 text-green-400 text-xs font-black uppercase tracking-widest animate-pulse">
                                ✓ Configuración guardada
                            </span>
                        )}
                        <button
                            onClick={saveConfig}
                            disabled={savingCfg}
                            className="px-6 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black rounded-xl text-xs font-black uppercase tracking-widest transition-all"
                        >
                            {savingCfg ? 'Guardando…' : 'Guardar Configuración'}
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div>
                        <label className="block text-[10px] font-black uppercase tracking-widest text-orange-400 mb-2">
                            Día límite de pedidos
                        </label>
                        <select
                            value={config.deadline_day || ''}
                            onChange={(e) => setConfig({ ...config, deadline_day: e.target.value })}
                            className="w-full bg-black/50 border-2 border-white/25 rounded-xl px-4 py-3 text-sm font-bold text-white focus:border-amber-400 outline-none"
                        >
                            {DAYS.map(d => <option key={d} value={d} className="bg-gray-900">{d}</option>)}
                        </select>
                    </div>

                    <div>
                        <label className="block text-[10px] font-black uppercase tracking-widest text-orange-400 mb-2">
                            Hora límite
                        </label>
                        <input
                            type="time"
                            value={config.deadline_time || ''}
                            onChange={(e) => setConfig({ ...config, deadline_time: e.target.value })}
                            className="w-full bg-black/50 border-2 border-white/25 rounded-xl px-4 py-3 text-sm font-bold text-white focus:border-amber-400 outline-none"
                        />
                    </div>

                    <div>
                        <label className="block text-[10px] font-black uppercase tracking-widest text-orange-400 mb-2">
                            Día de entrega
                        </label>
                        <select
                            value={config.delivery_day || ''}
                            onChange={(e) => setConfig({ ...config, delivery_day: e.target.value })}
                            className="w-full bg-black/50 border-2 border-white/25 rounded-xl px-4 py-3 text-sm font-bold text-white focus:border-amber-400 outline-none"
                        >
                            {DAYS.map(d => <option key={d} value={d} className="bg-gray-900">{d}</option>)}
                        </select>
                    </div>

                    <div>
                        <label className="block text-[10px] font-black uppercase tracking-widest text-orange-400 mb-2">
                            Selector de clientes
                        </label>
                        <select
                            value={config.selector || 'TODOS'}
                            onChange={(e) => setConfig({ ...config, selector: e.target.value })}
                            className="w-full bg-black/50 border-2 border-white/25 rounded-xl px-4 py-3 text-sm font-bold text-white focus:border-amber-400 outline-none"
                        >
                            {SELECTORES.map(s => <option key={s.id} value={s.id} className="bg-gray-900">{s.label}</option>)}
                        </select>
                    </div>
                </div>

                <label className="flex items-center gap-3 mt-5 cursor-pointer w-fit">
                    <input
                        type="checkbox"
                        checked={!!config.enabled}
                        onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
                        className="w-5 h-5 accent-amber-500"
                    />
                    <span className="text-xs font-black uppercase tracking-widest text-orange-400">
                        Programación de pedidos activa
                    </span>
                </label>
            </div>

            {/* ── Matriz ──
                Fondo SÓLIDO casi negro (no translúcido) para máximo contraste
                sobre el fondo de madera. Encabezados en blanco/ámbar vivo,
                inputs con fondo sólido y bordes visibles. */}
            <div className="bg-[#0d0b09] border-2 border-amber-500/30 rounded-3xl p-6 shadow-2xl">
                <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
                    <h2 className="text-lg font-black uppercase tracking-widest text-amber-400">
                        📋 Matriz de Pedidos
                    </h2>
                    <div className="flex items-center gap-3 flex-wrap">
                        <label className="text-[10px] font-black uppercase tracking-widest text-orange-400">
                            Fecha de entrega
                        </label>
                        <input
                            type="date"
                            value={deliveryDate}
                            onChange={(e) => setDeliveryDate(e.target.value)}
                            className="bg-black/50 border-2 border-white/25 rounded-xl px-4 py-2.5 text-sm font-bold text-white focus:border-amber-400 outline-none"
                        />
                        <button
                            onClick={() => fetchMatrix(deliveryDate)}
                            className="px-4 py-2.5 bg-white/5 border border-orange-400/40 rounded-xl text-xs font-black uppercase tracking-widest text-orange-400 hover:text-white hover:bg-orange-500/20 transition-all"
                        >
                            ⟳ Recargar
                        </button>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            onChange={handleOcrUpload}
                            className="hidden"
                        />
                        <button
                            onClick={() => fileInputRef.current && fileInputRef.current.click()}
                            disabled={ocrLoading}
                            className="px-5 py-2.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all"
                            title="Sube una captura del chat de WhatsApp y la IA propondrá el pedido"
                        >
                            {ocrLoading ? '🔍 Leyendo…' : '📷 Subir captura'}
                        </button>
                        <button
                            onClick={abrirManual}
                            disabled={ocrLoading}
                            className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black rounded-xl text-xs font-black uppercase tracking-widest transition-all"
                            title="Captura un pedido a mano, sin captura de pantalla"
                        >
                            ✍️ Pedido manual
                        </button>
                        <button
                            onClick={dispatchToProduction}
                            disabled={dispatching || !matrix || matrix.rows.length === 0}
                            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all"
                        >
                            {dispatching ? 'Enviando…' : '📤 Enviar a Producción'}
                        </button>
                        {/* v7.6.9: comparte la matriz completa por WhatsApp.
                            Abre WhatsApp con el texto precargado; el operador
                            elige el destinatario y confirma (humano-en-el-bucle). */}
                        <button
                            onClick={enviarMatrizWhatsApp}
                            disabled={!matrix || matrix.rows.length === 0}
                            className="px-5 py-2.5 bg-green-600 hover:bg-green-500 disabled:opacity-40 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all"
                            title="Abre WhatsApp con la matriz completa lista para enviar"
                        >
                            🟢 Enviar por WhatsApp
                        </button>
                    </div>
                </div>

                {loading && (
                    <div className="text-center py-10 text-amber-300 text-sm font-bold uppercase tracking-widest animate-pulse">
                        Cargando matriz…
                    </div>
                )}

                {!loading && matrix && matrix.rows.length === 0 && (
                    <div className="text-center py-12 border-2 border-dashed border-amber-500/30 rounded-2xl bg-black/30">
                        <p className="text-white text-sm font-bold uppercase tracking-widest">
                            Sin pedidos registrados para esta fecha
                        </p>
                        <p className="text-gray-300 text-xs mt-2">
                            Solo aparecen los clientes que respondieron (D-4).
                        </p>
                    </div>
                )}

                {!loading && matrix && matrix.rows.length > 0 && (
                    /* v7.6.8 (Ergonomía): SOLO la parte de ARRIBA queda fija.
                       - El contenedor tiene scroll VERTICAL (barra a la derecha)
                         y HORIZONTAL (barra abajo), con altura acotada
                         (`max-h-[70vh]`) para que ambas barras sean alcanzables.
                       - El `<thead>` es `sticky top-0`: la fila Cliente / NUEZ /
                         HIGO / PASAS / ESPOLVOREADO / MINIS / Total / Acciones
                         NUNCA se pierde de vista al desplazar los clientes.
                       - La columna «Cliente» YA NO es fija (`sticky left-0`
                         retirado): se desplaza con el resto de columnas.
                       - El `<tfoot>` (totales) tampoco es fijo: se desplaza con
                         el cuerpo. */
                    <div className="overflow-auto custom-scrollbar max-h-[70vh] rounded-2xl border border-amber-500/20">
                        <table className="w-full text-sm border-collapse">
                            <thead className="sticky top-0 z-20">
                                <tr className="border-b-2 border-amber-500/40 bg-[#1a1410]">
                                    <th className="text-left px-3 py-3 text-[10px] font-black uppercase tracking-widest text-amber-300 bg-[#1a1410]">
                                        Cliente
                                    </th>
                                    {matrix.products.map(p => (
                                        <th key={p.product_id} className="px-3 py-3 text-center text-[10px] font-black uppercase tracking-widest text-amber-300 min-w-[90px] bg-[#1a1410]">
                                            {p.product_name}
                                        </th>
                                    ))}
                                    <th className="px-3 py-3 text-center text-[10px] font-black uppercase tracking-widest text-amber-400 min-w-[70px] bg-[#1a1410]">
                                        Total
                                    </th>
                                    <th className="px-3 py-3 text-center text-[10px] font-black uppercase tracking-widest text-amber-300 min-w-[110px] bg-[#1a1410]">
                                        Acciones
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {matrix.rows.map(row => (
                                    <tr key={row.client_id} className="border-b border-white/10 hover:bg-amber-500/10">
                                        <td className="px-3 py-2">
                                            <div className="font-bold text-white text-xs">{row.client_name}</div>
                                            <div className="flex items-center gap-2 mt-0.5">
                                                {row.phone && <span className="text-[10px] text-gray-300">{row.phone}</span>}
                                                {row.source === 'OCR' && (
                                                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 font-black uppercase">
                                                        OCR
                                                    </span>
                                                )}
                                                {row.status === 'ENVIADO' && (
                                                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 font-black uppercase">
                                                        Enviado
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        {matrix.products.map(p => (
                                            <td key={p.product_id} className="px-2 py-2 text-center">
                                                <input
                                                    type="number"
                                                    min="0"
                                                    value={qtyOf(row, p.product_id)}
                                                    onChange={(e) => setQty(row, p.product_id, e.target.value)}
                                                    className="w-16 bg-black/50 border-2 border-white/25 rounded-lg px-2 py-1.5 text-center text-sm font-bold text-white focus:border-amber-400 focus:bg-black/70 outline-none"
                                                />
                                            </td>
                                        ))}
                                        <td className="px-3 py-2 text-center font-black text-amber-400 text-sm">
                                            {rowTotal(row)}
                                        </td>
                                        <td className="px-3 py-2 text-center">
                                            <div className="flex items-center justify-center gap-2">
                                                <button
                                                    onClick={() => saveRow(row)}
                                                    disabled={savingRow === row.client_id}
                                                    className="px-3 py-1.5 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white rounded-lg text-[10px] font-black uppercase tracking-widest transition-all"
                                                >
                                                    {savingRow === row.client_id ? '…' : 'Guardar'}
                                                </button>
                                                {row.request_id && (
                                                    <button
                                                        onClick={() => deleteRow(row)}
                                                        className="px-3 py-1.5 bg-red-600/70 hover:bg-red-500 text-white rounded-lg text-[10px] font-black uppercase tracking-widest transition-all"
                                                    >
                                                        ✕
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            {/* v7.6.7 (Ergonomía): la fila de totales YA NO es
                                fija. El usuario pidió que SOLO el encabezado
                                quede fijo; los totales se desplazan con el
                                cuerpo. Se conserva el NOMBRE del producto sobre
                                su total para no perder la referencia de qué
                                producto suma cada columna. */}
                            <tfoot>
                                <tr className="border-t-2 border-amber-500/40 bg-[#1a1410]">
                                    <td className="px-3 py-3 text-[10px] font-black uppercase tracking-widest text-amber-400">
                                        TOTAL POR PRODUCTO
                                    </td>
                                    {matrix.totals.map(t => (
                                        <td key={t.product_id} className="px-3 py-2 text-center bg-[#1a1410]">
                                            <div className="text-[9px] font-black uppercase tracking-widest text-amber-300/80 leading-tight truncate max-w-[90px] mx-auto">
                                                {t.product_name}
                                            </div>
                                            <div className="font-black text-amber-400 text-sm">
                                                {t.total}
                                            </div>
                                        </td>
                                    ))}
                                    <td className="px-3 py-3 text-center font-black text-amber-400 text-base bg-[#1a1410]">
                                        {grandTotal()}
                                    </td>
                                    <td className="px-3 py-3 text-center text-[10px] font-black uppercase tracking-widest text-amber-300 bg-[#1a1410]">
                                        {matrix.total_clients} clientes
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                )}

                {dispatchResult && (
                    <div className="mt-5 p-4 rounded-2xl bg-blue-500/10 border border-blue-500/30">
                        <p className="text-xs font-black uppercase tracking-widest text-blue-300 mb-2">
                            Resultado del envío a Producción
                        </p>
                        <p className="text-sm text-white font-semibold">
                            {dispatchResult.orders_created} órdenes nuevas · {dispatchResult.orders_updated} actualizadas · {dispatchResult.total_units} piezas
                        </p>
                    </div>
                )}
            </div>

            {/* ── Panel de confirmación OCR (Fase B, Ruta A) ──
                Fondo SÓLIDO casi negro (no translúcido) para máximo contraste
                sobre el fondo de madera. Todo el texto es blanco puro o de
                tono muy claro; los bordes son gruesos y de color vivo. */}
            {(ocrLoading || ocrError || ocrPropuesta || manualMode) && (
                <div className="bg-black border-2 border-purple-400 rounded-3xl p-6 shadow-2xl shadow-purple-900/60">
                    <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
                        <h2 className="text-lg font-black uppercase tracking-widest text-white">
                            {manualMode ? '✍️ Captura Manual de Pedido' : '📷 Lectura de Captura (IA)'}
                        </h2>
                        <button
                            onClick={cancelarOcr}
                            className="px-4 py-2 bg-black/60 border-2 border-white/50 rounded-xl text-xs font-black uppercase tracking-widest text-white hover:bg-white/20 transition-all"
                        >
                            ✕ Descartar
                        </button>
                    </div>

                    <p className="text-xs text-white mb-4 leading-relaxed">
                        {manualMode ? (
                            <>
                                Elige el <strong className="text-amber-300">cliente</strong> y agrega
                                los <strong className="text-amber-300">renglones</strong> de producto
                                con su cantidad. Nada se registra hasta que presiones
                                «Confirmar pedido».
                            </>
                        ) : (
                            <>
                                La IA <strong className="text-amber-300">propone</strong>; tú{' '}
                                <strong className="text-amber-300">confirmas</strong>. Revisa el cliente y las
                                cantidades antes de guardar. Nada se registra hasta que presiones
                                «Confirmar pedido».
                            </>
                        )}
                    </p>

                    {ocrLoading && (
                        <div className="text-center py-10 text-white text-sm font-black uppercase tracking-widest animate-pulse">
                            🔍 Leyendo la captura con OCR + IA…
                        </div>
                    )}

                    {!ocrLoading && ocrError && (
                        <div className="p-4 rounded-2xl bg-red-950 border-2 border-red-400">
                            <p className="text-xs font-black uppercase tracking-widest text-red-200 mb-1">
                                No se pudo interpretar
                            </p>
                            <p className="text-sm font-bold text-white">{ocrError}</p>
                            <p className="text-xs text-white mt-2">
                                Puedes capturar el pedido a mano con el botón de abajo.
                            </p>
                            <button
                                onClick={abrirManual}
                                className="mt-3 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black rounded-xl text-xs font-black uppercase tracking-widest transition-all"
                            >
                                ✍️ Capturar pedido manualmente
                            </button>

                            {/* Diagnóstico: qué leyó realmente el OCR.
                                Sirve para distinguir "la imagen no tiene texto
                                legible" de "el OCR leyó pero la IA no entendió". */}
                            {ocrPropuesta && (ocrPropuesta.texto_crudo || (ocrPropuesta.lineas || []).length > 0) && (
                                <details className="mt-3">
                                    <summary className="cursor-pointer text-xs font-black uppercase tracking-widest text-amber-300 hover:text-amber-200">
                                        🔎 Ver lo que el OCR sí leyó ({Math.round((ocrPropuesta.confianza_ocr || 0) * 100)}% confianza)
                                    </summary>
                                    <div className="mt-2 p-3 rounded-xl bg-black border-2 border-white/30 max-h-56 overflow-auto">
                                        <pre className="text-[11px] leading-relaxed text-white whitespace-pre-wrap break-words font-mono">
                                            {ocrPropuesta.texto_crudo || '(sin texto)'}
                                        </pre>
                                    </div>
                                    <p className="text-[10px] text-white/70 mt-2 leading-relaxed">
                                        Si aquí aparece el texto correcto pero arriba dice que no se
                                        pudo interpretar, el problema es del modelo de IA, no de la
                                        imagen. Si aquí sale vacío o basura, la captura necesita más
                                        resolución o menos recorte.
                                    </p>
                                </details>
                            )}
                        </div>
                    )}

                    {!ocrLoading && ocrEdit && (ocrPropuesta || manualMode) && (
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            {/* Vista previa + metadatos (solo en modo OCR) */}
                            {ocrPropuesta && (
                            <div className="lg:col-span-1 space-y-4">
                                {ocrPreview && (
                                    <img
                                        src={ocrPreview}
                                        alt="Captura subida"
                                        className="w-full rounded-2xl border border-white/10 max-h-72 object-contain bg-black/40"
                                    />
                                )}
                                <div className="grid grid-cols-2 gap-2 text-[10px] font-black uppercase tracking-widest">
                                    <div className="p-2 rounded-lg bg-black/60 border-2 border-white/40">
                                        <div className="text-white">Confianza OCR</div>
                                        <div className="text-amber-300 text-sm">
                                            {Math.round((ocrPropuesta.confianza_ocr || 0) * 100)}%
                                        </div>
                                    </div>
                                    <div className="p-2 rounded-lg bg-black/60 border-2 border-white/40">
                                        <div className="text-white">Confianza IA</div>
                                        <div className="text-amber-300 text-sm">
                                            {Math.round((ocrPropuesta.confianza_llm || 0) * 100)}%
                                        </div>
                                    </div>
                                </div>
                                {ocrPropuesta.cliente_match && (
                                    <div className="p-2 rounded-lg bg-black/60 border-2 border-white/40 text-[10px] font-black uppercase tracking-widest">
                                        <div className="text-white">Match de cliente</div>
                                        <div className="text-amber-300">{ocrPropuesta.cliente_match}</div>
                                    </div>
                                )}
                                {ocrPropuesta.notas && (
                                    <div className="p-3 rounded-lg bg-amber-950 border-2 border-amber-400">
                                        <div className="text-[10px] font-black uppercase tracking-widest text-amber-300 mb-1">
                                            Notas de la IA
                                        </div>
                                        <p className="text-xs font-bold text-white">{ocrPropuesta.notas}</p>
                                    </div>
                                )}
                            </div>
                            )}

                            {/* Editor de la propuesta */}
                            <div className={ocrPropuesta ? 'lg:col-span-2 space-y-4' : 'lg:col-span-3 space-y-4'}>
                                <div>
                                    <label className="block text-xs font-black uppercase tracking-widest text-orange-400 mb-2">
                                        Cliente
                                    </label>
                                    <select
                                        value={ocrEdit.cliente_id || ''}
                                        onChange={(e) => setOcrEdit({ ...ocrEdit, cliente_id: e.target.value })}
                                        className="w-full bg-black/60 border-2 border-white/40 rounded-xl px-4 py-3 text-sm font-bold text-white focus:border-amber-400 outline-none"
                                    >
                                        <option value="" className="bg-gray-900">— Selecciona un cliente —</option>
                                        {clientesDirectorio.map(c => (
                                            <option key={c.id} value={c.id} className="bg-gray-900">
                                                {c.name}{c.phone ? ` · ${c.phone}` : ''}
                                            </option>
                                        ))}
                                    </select>
                                    {clientesDirectorio.length === 0 && (
                                        <p className="text-xs font-bold text-red-300 mt-1">
                                            No hay clientes activos en el directorio de Grandeza.
                                            Agrégalos en la pestaña «Clientes» antes de capturar pedidos.
                                        </p>
                                    )}
                                    {ocrPropuesta && ocrPropuesta.cliente_nombre && !ocrEdit.cliente_id && (
                                        <p className="text-xs font-bold text-amber-300 mt-1">
                                            La IA propuso: «{ocrPropuesta.cliente_nombre}»
                                            {ocrPropuesta.cliente_telefono ? ` (${ocrPropuesta.cliente_telefono})` : ''}
                                            {' '}— no se encontró en el directorio. Selecciónalo manualmente.
                                        </p>
                                    )}
                                </div>

                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <label className="text-xs font-black uppercase tracking-widest text-orange-400">
                                            Renglones propuestos
                                        </label>
                                        <button
                                            onClick={agregarOcrItem}
                                            className="px-3 py-1.5 bg-black/60 border-2 border-white/50 rounded-lg text-[10px] font-black uppercase tracking-widest text-white hover:bg-white/20 transition-all"
                                        >
                                            + Agregar renglón
                                        </button>
                                    </div>

                                    <div className="space-y-2">
                                        {ocrEdit.items.length === 0 && (
                                            <p className="text-xs font-bold text-white py-3 text-center border-2 border-dashed border-white/50 rounded-xl bg-black/40">
                                                Sin renglones. Agrega uno manualmente.
                                            </p>
                                        )}
                                        {ocrEdit.items.map((it, idx) => (
                                            <div
                                                key={idx}
                                                className={`flex items-center gap-2 p-2 rounded-xl border-2 ${
                                                    it.requiere_revision
                                                        ? 'bg-amber-950 border-amber-400'
                                                        : 'bg-black/60 border-white/40'
                                                }`}
                                            >
                                                <select
                                                    value={it.producto_id || ''}
                                                    onChange={(e) => setOcrItemField(idx, 'producto_id', e.target.value)}
                                                    className="flex-1 bg-black border-2 border-white/30 rounded-lg px-3 py-2 text-xs font-bold text-white focus:border-amber-400 outline-none"
                                                >
                                                    <option value="" className="bg-gray-900">— Producto —</option>
                                                    {(matrix?.products || []).map(p => (
                                                        <option key={p.product_id} value={p.product_id} className="bg-gray-900">
                                                            {p.product_name}
                                                        </option>
                                                    ))}
                                                </select>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    value={it.cantidad}
                                                    onChange={(e) => setOcrItemField(idx, 'cantidad', e.target.value)}
                                                    className="w-20 bg-black border-2 border-white/30 rounded-lg px-2 py-2 text-center text-xs font-bold text-white focus:border-amber-400 outline-none"
                                                />
                                                {it.requiere_revision && (
                                                    <span
                                                        className="text-[9px] px-1.5 py-0.5 rounded bg-amber-400 text-black font-black uppercase"
                                                        title={`Leído como: ${it.producto || '(vacío)'}`}
                                                    >
                                                        Revisar
                                                    </span>
                                                )}
                                                <button
                                                    onClick={() => quitarOcrItem(idx)}
                                                    className="px-2.5 py-2 bg-red-600/70 hover:bg-red-500 text-white rounded-lg text-[10px] font-black transition-all"
                                                >
                                                    ✕
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="flex items-center justify-end gap-3 pt-2">
                                    <button
                                        onClick={cancelarOcr}
                                        className="px-5 py-2.5 bg-black/60 border-2 border-white/50 rounded-xl text-xs font-black uppercase tracking-widest text-white hover:bg-white/20 transition-all"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        onClick={confirmarOcr}
                                        disabled={ocrSaving}
                                        className="px-6 py-2.5 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white rounded-xl text-xs font-black uppercase tracking-widest border-2 border-green-400 transition-all"
                                    >
                                        {ocrSaving ? 'Guardando…' : '✓ Confirmar pedido'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default GrandezaOrderRequestsTab;
