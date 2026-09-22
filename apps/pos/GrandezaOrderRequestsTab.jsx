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
    const fileInputRef = React.useRef(null);

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

    useEffect(() => { fetchConfig(); }, [fetchConfig]);
    useEffect(() => { fetchMatrix(deliveryDate); }, [deliveryDate, fetchMatrix]);

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
            const clientes_catalogo = (matrix?.rows || []).map(r => r.client_name);

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
        if (ocrPreview) URL.revokeObjectURL(ocrPreview);
        setOcrPreview(null);
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
            <div className="bg-black/40 border border-white/10 rounded-3xl p-6 backdrop-blur-sm">
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
                        <label className="block text-[10px] font-black uppercase tracking-widest text-gray-500 mb-2">
                            Día límite de pedidos
                        </label>
                        <select
                            value={config.deadline_day || ''}
                            onChange={(e) => setConfig({ ...config, deadline_day: e.target.value })}
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm font-bold text-white focus:border-amber-400 outline-none"
                        >
                            {DAYS.map(d => <option key={d} value={d} className="bg-gray-900">{d}</option>)}
                        </select>
                    </div>

                    <div>
                        <label className="block text-[10px] font-black uppercase tracking-widest text-gray-500 mb-2">
                            Hora límite
                        </label>
                        <input
                            type="time"
                            value={config.deadline_time || ''}
                            onChange={(e) => setConfig({ ...config, deadline_time: e.target.value })}
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm font-bold text-white focus:border-amber-400 outline-none"
                        />
                    </div>

                    <div>
                        <label className="block text-[10px] font-black uppercase tracking-widest text-gray-500 mb-2">
                            Día de entrega
                        </label>
                        <select
                            value={config.delivery_day || ''}
                            onChange={(e) => setConfig({ ...config, delivery_day: e.target.value })}
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm font-bold text-white focus:border-amber-400 outline-none"
                        >
                            {DAYS.map(d => <option key={d} value={d} className="bg-gray-900">{d}</option>)}
                        </select>
                    </div>

                    <div>
                        <label className="block text-[10px] font-black uppercase tracking-widest text-gray-500 mb-2">
                            Selector de clientes
                        </label>
                        <select
                            value={config.selector || 'TODOS'}
                            onChange={(e) => setConfig({ ...config, selector: e.target.value })}
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm font-bold text-white focus:border-amber-400 outline-none"
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
                    <span className="text-xs font-black uppercase tracking-widest text-gray-400">
                        Programación de pedidos activa
                    </span>
                </label>
            </div>

            {/* ── Matriz ── */}
            <div className="bg-black/40 border border-white/10 rounded-3xl p-6 backdrop-blur-sm">
                <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
                    <h2 className="text-lg font-black uppercase tracking-widest text-amber-400">
                        📋 Matriz de Pedidos
                    </h2>
                    <div className="flex items-center gap-3 flex-wrap">
                        <label className="text-[10px] font-black uppercase tracking-widest text-gray-500">
                            Fecha de entrega
                        </label>
                        <input
                            type="date"
                            value={deliveryDate}
                            onChange={(e) => setDeliveryDate(e.target.value)}
                            className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm font-bold text-white focus:border-amber-400 outline-none"
                        />
                        <button
                            onClick={() => fetchMatrix(deliveryDate)}
                            className="px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-xs font-black uppercase tracking-widest text-gray-400 hover:text-white hover:bg-white/10 transition-all"
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
                            onClick={dispatchToProduction}
                            disabled={dispatching || !matrix || matrix.rows.length === 0}
                            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all"
                        >
                            {dispatching ? 'Enviando…' : '📤 Enviar a Producción'}
                        </button>
                    </div>
                </div>

                {loading && (
                    <div className="text-center py-10 text-gray-500 text-sm font-bold uppercase tracking-widest animate-pulse">
                        Cargando matriz…
                    </div>
                )}

                {!loading && matrix && matrix.rows.length === 0 && (
                    <div className="text-center py-12 border border-dashed border-white/10 rounded-2xl">
                        <p className="text-gray-500 text-sm font-bold uppercase tracking-widest">
                            Sin pedidos registrados para esta fecha
                        </p>
                        <p className="text-gray-600 text-xs mt-2">
                            Solo aparecen los clientes que respondieron (D-4).
                        </p>
                    </div>
                )}

                {!loading && matrix && matrix.rows.length > 0 && (
                    <div className="overflow-x-auto custom-scrollbar">
                        <table className="w-full text-sm border-collapse">
                            <thead>
                                <tr className="border-b border-white/10">
                                    <th className="text-left px-3 py-3 text-[10px] font-black uppercase tracking-widest text-gray-500 sticky left-0 bg-[#1a1410] z-10">
                                        Cliente
                                    </th>
                                    {matrix.products.map(p => (
                                        <th key={p.product_id} className="px-3 py-3 text-center text-[10px] font-black uppercase tracking-widest text-gray-500 min-w-[90px]">
                                            {p.product_name}
                                        </th>
                                    ))}
                                    <th className="px-3 py-3 text-center text-[10px] font-black uppercase tracking-widest text-amber-400 min-w-[70px]">
                                        Total
                                    </th>
                                    <th className="px-3 py-3 text-center text-[10px] font-black uppercase tracking-widest text-gray-500 min-w-[110px]">
                                        Acciones
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {matrix.rows.map(row => (
                                    <tr key={row.client_id} className="border-b border-white/5 hover:bg-white/[0.02]">
                                        <td className="px-3 py-2 sticky left-0 bg-[#1a1410] z-10">
                                            <div className="font-bold text-white text-xs">{row.client_name}</div>
                                            <div className="flex items-center gap-2 mt-0.5">
                                                {row.phone && <span className="text-[10px] text-gray-500">{row.phone}</span>}
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
                                                    className="w-16 bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-center text-sm font-bold text-white focus:border-amber-400 outline-none"
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
                            <tfoot>
                                <tr className="border-t-2 border-amber-500/40 bg-amber-500/5">
                                    <td className="px-3 py-3 sticky left-0 bg-[#1a1410] z-10 text-[10px] font-black uppercase tracking-widest text-amber-400">
                                        TOTAL POR PRODUCTO
                                    </td>
                                    {matrix.totals.map(t => (
                                        <td key={t.product_id} className="px-3 py-3 text-center font-black text-amber-400 text-sm">
                                            {t.total}
                                        </td>
                                    ))}
                                    <td className="px-3 py-3 text-center font-black text-amber-400 text-base">
                                        {grandTotal()}
                                    </td>
                                    <td className="px-3 py-3 text-center text-[10px] font-black uppercase tracking-widest text-gray-500">
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
                        <p className="text-sm text-gray-300">
                            {dispatchResult.orders_created} órdenes nuevas · {dispatchResult.orders_updated} actualizadas · {dispatchResult.total_units} piezas
                        </p>
                    </div>
                )}
            </div>

            {/* ── Panel de confirmación OCR (Fase B, Ruta A) ── */}
            {(ocrLoading || ocrError || ocrPropuesta) && (
                <div className="bg-purple-950/30 border border-purple-500/30 rounded-3xl p-6 backdrop-blur-sm">
                    <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
                        <h2 className="text-lg font-black uppercase tracking-widest text-purple-300">
                            📷 Lectura de Captura (IA)
                        </h2>
                        <button
                            onClick={cancelarOcr}
                            className="px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-xs font-black uppercase tracking-widest text-gray-400 hover:text-white hover:bg-white/10 transition-all"
                        >
                            ✕ Descartar
                        </button>
                    </div>

                    <p className="text-[11px] text-purple-300/80 mb-4 leading-relaxed">
                        La IA <strong>propone</strong>; tú <strong>confirmas</strong>. Revisa el cliente y las
                        cantidades antes de guardar. Nada se registra hasta que presiones
                        «Confirmar pedido».
                    </p>

                    {ocrLoading && (
                        <div className="text-center py-10 text-purple-300 text-sm font-bold uppercase tracking-widest animate-pulse">
                            🔍 Leyendo la captura con OCR + IA…
                        </div>
                    )}

                    {!ocrLoading && ocrError && (
                        <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/30">
                            <p className="text-xs font-black uppercase tracking-widest text-red-300 mb-1">
                                No se pudo interpretar
                            </p>
                            <p className="text-sm text-gray-300">{ocrError}</p>
                            <p className="text-xs text-gray-500 mt-2">
                                Puedes capturar el pedido a mano en la matriz de arriba.
                            </p>
                        </div>
                    )}

                    {!ocrLoading && ocrPropuesta && ocrEdit && (
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            {/* Vista previa + metadatos */}
                            <div className="lg:col-span-1 space-y-4">
                                {ocrPreview && (
                                    <img
                                        src={ocrPreview}
                                        alt="Captura subida"
                                        className="w-full rounded-2xl border border-white/10 max-h-72 object-contain bg-black/40"
                                    />
                                )}
                                <div className="grid grid-cols-2 gap-2 text-[10px] font-black uppercase tracking-widest">
                                    <div className="p-2 rounded-lg bg-white/5 border border-white/10">
                                        <div className="text-gray-500">Confianza OCR</div>
                                        <div className="text-purple-300 text-sm">
                                            {Math.round((ocrPropuesta.confianza_ocr || 0) * 100)}%
                                        </div>
                                    </div>
                                    <div className="p-2 rounded-lg bg-white/5 border border-white/10">
                                        <div className="text-gray-500">Confianza IA</div>
                                        <div className="text-purple-300 text-sm">
                                            {Math.round((ocrPropuesta.confianza_llm || 0) * 100)}%
                                        </div>
                                    </div>
                                </div>
                                {ocrPropuesta.cliente_match && (
                                    <div className="p-2 rounded-lg bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest">
                                        <div className="text-gray-500">Match de cliente</div>
                                        <div className="text-purple-300">{ocrPropuesta.cliente_match}</div>
                                    </div>
                                )}
                                {ocrPropuesta.notas && (
                                    <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
                                        <div className="text-[10px] font-black uppercase tracking-widest text-amber-400 mb-1">
                                            Notas de la IA
                                        </div>
                                        <p className="text-xs text-gray-300">{ocrPropuesta.notas}</p>
                                    </div>
                                )}
                            </div>

                            {/* Editor de la propuesta */}
                            <div className="lg:col-span-2 space-y-4">
                                <div>
                                    <label className="block text-[10px] font-black uppercase tracking-widest text-gray-500 mb-2">
                                        Cliente
                                    </label>
                                    <select
                                        value={ocrEdit.cliente_id || ''}
                                        onChange={(e) => setOcrEdit({ ...ocrEdit, cliente_id: e.target.value })}
                                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm font-bold text-white focus:border-purple-400 outline-none"
                                    >
                                        <option value="" className="bg-gray-900">— Selecciona un cliente —</option>
                                        {(matrix?.rows || []).map(r => (
                                            <option key={r.client_id} value={r.client_id} className="bg-gray-900">
                                                {r.client_name}{r.phone ? ` · ${r.phone}` : ''}
                                            </option>
                                        ))}
                                    </select>
                                    {ocrPropuesta.cliente_nombre && !ocrEdit.cliente_id && (
                                        <p className="text-[11px] text-amber-400 mt-1">
                                            La IA propuso: «{ocrPropuesta.cliente_nombre}»
                                            {ocrPropuesta.cliente_telefono ? ` (${ocrPropuesta.cliente_telefono})` : ''}
                                            {' '}— no se encontró en el directorio. Selecciónalo manualmente.
                                        </p>
                                    )}
                                </div>

                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <label className="text-[10px] font-black uppercase tracking-widest text-gray-500">
                                            Renglones propuestos
                                        </label>
                                        <button
                                            onClick={agregarOcrItem}
                                            className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-[10px] font-black uppercase tracking-widest text-gray-400 hover:text-white hover:bg-white/10 transition-all"
                                        >
                                            + Agregar renglón
                                        </button>
                                    </div>

                                    <div className="space-y-2">
                                        {ocrEdit.items.length === 0 && (
                                            <p className="text-xs text-gray-500 py-3 text-center border border-dashed border-white/10 rounded-xl">
                                                Sin renglones. Agrega uno manualmente.
                                            </p>
                                        )}
                                        {ocrEdit.items.map((it, idx) => (
                                            <div
                                                key={idx}
                                                className={`flex items-center gap-2 p-2 rounded-xl border ${
                                                    it.requiere_revision
                                                        ? 'bg-amber-500/10 border-amber-500/40'
                                                        : 'bg-white/5 border-white/10'
                                                }`}
                                            >
                                                <select
                                                    value={it.producto_id || ''}
                                                    onChange={(e) => setOcrItemField(idx, 'producto_id', e.target.value)}
                                                    className="flex-1 bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-xs font-bold text-white focus:border-purple-400 outline-none"
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
                                                    className="w-20 bg-black/30 border border-white/10 rounded-lg px-2 py-2 text-center text-xs font-bold text-white focus:border-purple-400 outline-none"
                                                />
                                                {it.requiere_revision && (
                                                    <span
                                                        className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-black uppercase"
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
                                        className="px-5 py-2.5 bg-white/5 border border-white/10 rounded-xl text-xs font-black uppercase tracking-widest text-gray-400 hover:text-white hover:bg-white/10 transition-all"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        onClick={confirmarOcr}
                                        disabled={ocrSaving}
                                        className="px-6 py-2.5 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all"
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
