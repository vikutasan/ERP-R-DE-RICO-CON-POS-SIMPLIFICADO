import React, { useState, useRef, useCallback } from 'react';
import { CONFIG } from '../../shared/config';

/**
 * AIOcrPanel — v27.4 (CENTRO DE IA)
 *
 * Pestaña «📷 Lector». Expone la capacidad OCR del Centro de IA de forma
 * AUTÓNOMA: el operador sube una captura de WhatsApp y ve, en un solo lugar:
 *   1. El TEXTO CRUDO que Tesseract logró leer (diagnóstico).
 *   2. La PROPUESTA estructurada (cliente + renglones producto/cantidad).
 *   3. El resultado del match contra el catálogo REAL del ERP.
 *
 * DIFERENCIA CON LA PESTAÑA GRANDEZA «Programación de Pedidos»:
 *   - Aquí el panel es de DIAGNÓSTICO/LECTURA: muestra lo que la IA entendió.
 *   - Allá el panel es de CAPTURA: confirma y guarda el pedido en la matriz.
 *   Este panel NO guarda nada (no hay botón «Confirmar»): respeta el contrato
 *   human-in-the-loop. Para registrar el pedido, el operador va a Grandeza.
 *
 * CONTRATO DE DATOS: usa el endpoint del ERP
 *   POST /grandeza/order-requests/ocr-extract
 * que ya resuelve cliente + productos contra el catálogo real. El motor de IA
 * NUNCA decide un `client_id` ni un `product_id`.
 *
 * RESPONSABILIDAD ÚNICA: presentar el resultado del OCR. Cero lógica de negocio.
 */

/** Convierte un File a base64 SIN el prefijo `data:...;base64,`. */
const fileABase64 = (file) =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const resultado = String(reader.result || '');
            const coma = resultado.indexOf(',');
            resolve(coma >= 0 ? resultado.slice(coma + 1) : resultado);
        };
        reader.onerror = () => reject(new Error('No se pudo leer el archivo.'));
        reader.readAsDataURL(file);
    });

/** Fila de metadato: etiqueta + valor. */
const FilaMeta = ({ etiqueta, valor, acento = 'text-white' }) => (
    <div className="flex items-center justify-between border-b border-white/10 py-2">
        <span className="text-xs text-slate-400">{etiqueta}</span>
        <span className={`font-mono text-xs font-semibold ${acento}`}>{valor}</span>
    </div>
);

export const AIOcrPanel = ({ activo = true }) => {
    const [preview, setPreview] = useState(null);
    const [cargando, setCargando] = useState(false);
    const [error, setError] = useState(null);
    const [propuesta, setPropuesta] = useState(null);
    const fileInputRef = useRef(null);

    /** Limpia el estado y libera la URL de la vista previa. */
    const limpiar = useCallback(() => {
        if (preview) URL.revokeObjectURL(preview);
        setPreview(null);
        setPropuesta(null);
        setError(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    }, [preview]);

    const handleUpload = async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;

        // Vista previa local (no se sube a ningún lado hasta el POST).
        if (preview) URL.revokeObjectURL(preview);
        setPreview(URL.createObjectURL(file));
        setPropuesta(null);
        setError(null);
        setCargando(true);

        try {
            const imagen_base64 = await fileABase64(file);

            // Catálogos reales que el ERP usa como pistas de match. El endpoint
            // del ERP los recalcula, pero se envían para mantener el contrato.
            const [resProd, resCli] = await Promise.all([
                fetch(`${CONFIG.API_BASE_URL}/grandeza/products`),
                fetch(`${CONFIG.API_BASE_URL}/grandeza/clients?active_only=true`),
            ]);
            const productos = resProd.ok ? await resProd.json() : [];
            const clientes = resCli.ok ? await resCli.json() : [];

            const res = await fetch(`${CONFIG.API_BASE_URL}/grandeza/order-requests/ocr-extract`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    imagen_base64,
                    productos_catalogo: (productos || [])
                        .map((p) => p.name || p.product_name || '')
                        .filter(Boolean),
                    clientes_catalogo: (clientes || []).map((c) => c.name).filter(Boolean),
                }),
            });

            if (!res.ok) {
                const detalle = await res.json().catch(() => ({}));
                const msg =
                    detalle?.detail?.mensaje ||
                    detalle?.detail ||
                    `El lector respondió con error ${res.status}.`;
                setError(typeof msg === 'string' ? msg : 'No se pudo leer la captura.');
                return;
            }

            const data = await res.json();
            setPropuesta(data);
            if (!data.ok) {
                setError(data.notas || 'El OCR no encontró texto legible en la captura.');
            }
        } catch (e) {
            console.error('Error en el lector OCR:', e);
            setError('Error de red al leer la captura. Revisa que el motor de IA esté encendido.');
        } finally {
            setCargando(false);
        }
    };

    const confianzaPct = (v) => `${Math.round((v || 0) * 100)}%`;

    return (
        <div className="h-full overflow-y-auto bg-slate-900 p-6">
            <div className="mx-auto max-w-5xl space-y-6">
                {/* Encabezado */}
                <header className="space-y-2">
                    <h1 className="text-2xl font-black uppercase tracking-widest text-white">
                        📷 Lector de Capturas (OCR + IA)
                    </h1>
                    <p className="text-sm leading-relaxed text-slate-300">
                        Sube una <strong className="text-amber-300">captura de pantalla</strong> de un
                        chat de WhatsApp y el lector mostrará el{' '}
                        <strong className="text-amber-300">texto que logró leer</strong> y la{' '}
                        <strong className="text-amber-300">propuesta estructurada</strong> (cliente +
                        renglones). Este panel es de <strong>diagnóstico</strong>: no guarda nada. Para
                        registrar el pedido, usa la pestaña «📋 Programación de Pedidos» en Reparto
                        Grandeza.
                    </p>
                </header>

                {/* Controles */}
                <div className="flex flex-wrap items-center gap-3">
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleUpload}
                        className="hidden"
                    />
                    <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={cargando}
                        className="rounded-xl bg-amber-500 px-5 py-2.5 text-xs font-black uppercase tracking-widest text-black transition-all hover:bg-amber-400 disabled:opacity-50"
                    >
                        📷 Subir captura
                    </button>
                    {(preview || propuesta || error) && (
                        <button
                            type="button"
                            onClick={limpiar}
                            disabled={cargando}
                            className="rounded-xl border border-white/20 px-5 py-2.5 text-xs font-black uppercase tracking-widest text-slate-200 transition-all hover:bg-white/5 disabled:opacity-50"
                        >
                            ✕ Limpiar
                        </button>
                    )}
                </div>

                {/* Cargando */}
                {cargando && (
                    <div className="animate-pulse rounded-2xl border-2 border-purple-400/60 bg-black p-6 text-center text-sm font-black uppercase tracking-widest text-white">
                        🔍 Leyendo la captura con OCR + IA…
                    </div>
                )}

                {/* Error */}
                {!cargando && error && (
                    <div className="rounded-2xl border-2 border-red-400/70 bg-red-950/60 p-5">
                        <p className="text-sm font-bold text-white">{error}</p>
                        <p className="mt-2 text-xs text-slate-300">
                            Si el motor de IA está apagado, enciéndelo con{' '}
                            <code className="rounded bg-black/50 px-1.5 py-0.5 font-mono text-amber-300">
                                docker compose -f docker-compose.ai.yml up -d
                            </code>
                            .
                        </p>
                    </div>
                )}

                {/* Resultado */}
                {!cargando && (preview || propuesta) && (
                    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                        {/* Vista previa + metadatos */}
                        <div className="space-y-4 lg:col-span-1">
                            {preview && (
                                <div className="overflow-hidden rounded-2xl border-2 border-white/20 bg-black">
                                    <img
                                        src={preview}
                                        alt="Captura subida"
                                        className="max-h-80 w-full object-contain"
                                    />
                                </div>
                            )}
                            {propuesta && (
                                <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
                                    <h3 className="mb-2 text-xs font-black uppercase tracking-widest text-amber-300">
                                        Diagnóstico
                                    </h3>
                                    <FilaMeta
                                        etiqueta="Confianza OCR"
                                        valor={confianzaPct(propuesta.confianza_ocr)}
                                        acento="text-amber-300"
                                    />
                                    <FilaMeta
                                        etiqueta="Confianza IA"
                                        valor={confianzaPct(propuesta.confianza_llm)}
                                        acento="text-amber-300"
                                    />
                                    <FilaMeta
                                        etiqueta="Motor OCR"
                                        valor={propuesta.motor_ocr || '—'}
                                    />
                                    <FilaMeta
                                        etiqueta="Motor IA"
                                        valor={propuesta.motor_llm || '—'}
                                    />
                                    <FilaMeta
                                        etiqueta="Cliente (match)"
                                        valor={propuesta.cliente_match || '—'}
                                        acento={
                                            propuesta.cliente_match === 'manual'
                                                ? 'text-red-300'
                                                : 'text-green-300'
                                        }
                                    />
                                </div>
                            )}
                        </div>

                        {/* Texto crudo + propuesta */}
                        <div className="space-y-4 lg:col-span-2">
                            {/* Texto crudo que leyó Tesseract */}
                            {propuesta && (
                                <details
                                    className="rounded-2xl border border-white/10 bg-black/40 p-4"
                                    open
                                >
                                    <summary className="cursor-pointer text-xs font-black uppercase tracking-widest text-amber-300 hover:text-amber-200">
                                        🔎 Texto crudo que leyó el OCR
                                    </summary>
                                    <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-black/60 p-3 font-mono text-xs text-slate-200">
                                        {propuesta.texto_crudo || '(sin texto legible)'}
                                    </pre>
                                </details>
                            )}

                            {/* Cliente detectado */}
                            {propuesta && (
                                <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
                                    <h3 className="mb-2 text-xs font-black uppercase tracking-widest text-amber-300">
                                        Cliente detectado
                                    </h3>
                                    <p className="text-sm font-bold text-white">
                                        {propuesta.cliente_nombre || '(no detectado)'}
                                    </p>
                                    {propuesta.cliente_telefono && (
                                        <p className="mt-1 font-mono text-xs text-slate-400">
                                            📱 {propuesta.cliente_telefono}
                                        </p>
                                    )}
                                    {propuesta.cliente_id ? (
                                        <p className="mt-1 text-xs text-green-300">
                                            ✓ Resuelto contra el directorio (id {propuesta.cliente_id})
                                        </p>
                                    ) : (
                                        <p className="mt-1 text-xs text-red-300">
                                            ✗ No se pudo resolver; el operador debe elegirlo en Grandeza.
                                        </p>
                                    )}
                                </div>
                            )}

                            {/* Renglones propuestos */}
                            {propuesta && (
                                <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
                                    <h3 className="mb-3 text-xs font-black uppercase tracking-widest text-amber-300">
                                        Renglones propuestos ({(propuesta.items || []).length})
                                    </h3>
                                    {(propuesta.items || []).length === 0 ? (
                                        <p className="text-xs text-slate-400">
                                            La IA no detectó renglones de producto.
                                        </p>
                                    ) : (
                                        <ul className="space-y-2">
                                            {propuesta.items.map((it, i) => (
                                                <li
                                                    key={`${it.producto}-${i}`}
                                                    className={`flex items-center justify-between rounded-lg border px-3 py-2 ${
                                                        it.requiere_revision
                                                            ? 'border-amber-400/60 bg-amber-950/30'
                                                            : 'border-white/10 bg-white/5'
                                                    }`}
                                                >
                                                    <div className="min-w-0">
                                                        <p className="truncate text-sm font-bold text-white">
                                                            {it.producto}
                                                        </p>
                                                        <p className="text-[10px] uppercase tracking-widest text-slate-400">
                                                            {it.producto_id
                                                                ? `✓ id ${it.producto_id}`
                                                                : '✗ sin match'}
                                                            {it.requiere_revision ? ' · revisar' : ''}
                                                        </p>
                                                    </div>
                                                    <span className="ml-3 shrink-0 font-mono text-sm font-black text-amber-300">
                                                        ×{it.cantidad}
                                                    </span>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            )}

                            {/* Notas de la IA */}
                            {propuesta?.notas && (
                                <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
                                    <h3 className="mb-2 text-xs font-black uppercase tracking-widest text-amber-300">
                                        Notas de la IA
                                    </h3>
                                    <p className="text-xs leading-relaxed text-slate-300">
                                        {propuesta.notas}
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Estado vacío */}
                {!cargando && !preview && !propuesta && !error && (
                    <div className="rounded-2xl border-2 border-dashed border-white/15 bg-black/20 p-10 text-center">
                        <p className="text-sm font-bold text-slate-300">
                            Aún no has subido ninguna captura.
                        </p>
                        <p className="mt-2 text-xs text-slate-500">
                            Presiona «📷 Subir captura» para probar el lector.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AIOcrPanel;
