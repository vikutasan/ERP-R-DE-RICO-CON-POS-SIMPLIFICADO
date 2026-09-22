import React, { useRef, useState, useEffect, useCallback } from 'react';

/**
 * AnnotationCanvas - R de Rico (v7 Fase 8)
 *
 * Lienzo de anotacion de cajas delimitadoras (bounding boxes) sobre una
 * imagen del dataset. Es la pieza central de la herramienta de anotacion:
 * el operador dibuja una caja por cada pan visible; el backend las
 * convierte a formato YOLO.
 *
 * Coordenadas: SIEMPRE normalizadas 0..1 respecto a la imagen renderizada.
 * Esto desacopla el canvas del tamano real del archivo y hace que el
 * backend no necesite conocer las dimensiones de la imagen.
 *
 * Interaccion:
 *   - Arrastrar sobre la imagen  -> dibuja una caja nueva.
 *   - Clic en una caja           -> la selecciona.
 *   - Boton "Borrar" o tecla Del -> elimina la caja seleccionada.
 *   - Boton "Limpiar"            -> elimina todas las cajas.
 *
 * La IA solo PROPONE; el operador confirma. Este componente no persiste
 * nada: solo reporta las cajas via onChange.
 */

const COLOR_BASE = '#f97316'; // naranja R de Rico
const COLOR_SELECCION = '#22d3ee'; // cian para la caja activa

export const AnnotationCanvas = ({
    imageUrl,
    boxes = [],
    onChange,
    label = 'concha',
    disabled = false,
}) => {
    const contenedorRef = useRef(null);
    const [dibujando, setDibujando] = useState(null); // { x0, y0, x1, y1 } normalizado
    const [seleccionada, setSeleccionada] = useState(null); // indice de la caja activa
    const [dimensiones, setDimensiones] = useState({ w: 0, h: 0 });

    // Medir el contenedor para convertir pixeles <-> normalizado.
    useEffect(() => {
        const medir = () => {
            if (contenedorRef.current) {
                const rect = contenedorRef.current.getBoundingClientRect();
                setDimensiones({ w: rect.width, h: rect.height });
            }
        };
        medir();
        window.addEventListener('resize', medir);
        return () => window.removeEventListener('resize', medir);
    }, [imageUrl]);

    // Al cambiar de imagen, limpiar la seleccion local.
    useEffect(() => {
        setSeleccionada(null);
        setDibujando(null);
    }, [imageUrl]);

    const aNormalizado = useCallback((clientX, clientY) => {
        const rect = contenedorRef.current.getBoundingClientRect();
        const x = (clientX - rect.left) / rect.width;
        const y = (clientY - rect.top) / rect.height;
        return {
            x: Math.min(Math.max(x, 0), 1),
            y: Math.min(Math.max(y, 0), 1),
        };
    }, []);

    const handlePointerDown = (e) => {
        if (disabled || !imageUrl) return;
        // Si el clic cae sobre una caja existente, seleccionarla en vez de dibujar.
        const objetivo = e.target;
        if (objetivo?.dataset?.boxIndex !== undefined) {
            setSeleccionada(Number(objetivo.dataset.boxIndex));
            return;
        }
        e.currentTarget.setPointerCapture?.(e.pointerId);
        const p = aNormalizado(e.clientX, e.clientY);
        setSeleccionada(null);
        setDibujando({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
    };

    const handlePointerMove = (e) => {
        if (!dibujando) return;
        const p = aNormalizado(e.clientX, e.clientY);
        setDibujando((prev) => (prev ? { ...prev, x1: p.x, y1: p.y } : prev));
    };

    const handlePointerUp = () => {
        if (!dibujando) return;
        const x = Math.min(dibujando.x0, dibujando.x1);
        const y = Math.min(dibujando.y0, dibujando.y1);
        const w = Math.abs(dibujando.x1 - dibujando.x0);
        const h = Math.abs(dibujando.y1 - dibujando.y0);
        setDibujando(null);

        // Descartar cajas accidentales (clic sin arrastre).
        if (w < 0.01 || h < 0.01) return;

        const nueva = { x, y, w, h, label };
        onChange?.([...boxes, nueva]);
        setSeleccionada(boxes.length);
    };

    const eliminarSeleccionada = () => {
        if (seleccionada === null) return;
        const restantes = boxes.filter((_, i) => i !== seleccionada);
        onChange?.(restantes);
        setSeleccionada(null);
    };

    const limpiarTodo = () => {
        onChange?.([]);
        setSeleccionada(null);
    };

    // Atajo de teclado: Supr/Backspace borra la caja seleccionada.
    useEffect(() => {
        const onKey = (e) => {
            if ((e.key === 'Delete' || e.key === 'Backspace') && seleccionada !== null) {
                e.preventDefault();
                eliminarSeleccionada();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [seleccionada, boxes]);

    const cajaEnCurso = dibujando
        ? {
              x: Math.min(dibujando.x0, dibujando.x1),
              y: Math.min(dibujando.y0, dibujando.y1),
              w: Math.abs(dibujando.x1 - dibujando.x0),
              h: Math.abs(dibujando.y1 - dibujando.y0),
          }
        : null;

    return (
        <div className="flex flex-col gap-3">
            <div
                ref={contenedorRef}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                className={`relative w-full select-none overflow-hidden rounded-2xl border border-white/10 bg-black ${
                    disabled ? 'cursor-not-allowed opacity-60' : 'cursor-crosshair'
                }`}
                style={{ touchAction: 'none' }}
            >
                {imageUrl ? (
                    <img
                        src={imageUrl}
                        alt="imagen a anotar"
                        draggable={false}
                        className="block w-full h-auto pointer-events-none"
                    />
                ) : (
                    <div className="flex h-64 items-center justify-center text-xs font-black uppercase tracking-widest text-gray-600">
                        Selecciona una imagen del dataset
                    </div>
                )}

                {/* Cajas ya confirmadas */}
                {imageUrl &&
                    boxes.map((b, i) => (
                        <div
                            key={i}
                            data-box-index={i}
                            onPointerDown={(e) => {
                                e.stopPropagation();
                                setSeleccionada(i);
                            }}
                            className="absolute border-2"
                            style={{
                                left: `${b.x * 100}%`,
                                top: `${b.y * 100}%`,
                                width: `${b.w * 100}%`,
                                height: `${b.h * 100}%`,
                                borderColor: seleccionada === i ? COLOR_SELECCION : COLOR_BASE,
                                backgroundColor:
                                    seleccionada === i
                                        ? 'rgba(34,211,238,0.15)'
                                        : 'rgba(249,115,22,0.12)',
                                cursor: 'pointer',
                            }}
                        >
                            <span
                                className="absolute -top-5 left-0 rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-black"
                                style={{
                                    backgroundColor:
                                        seleccionada === i ? COLOR_SELECCION : COLOR_BASE,
                                }}
                            >
                                {b.label || label}
                            </span>
                        </div>
                    ))}

                {/* Caja en curso */}
                {cajaEnCurso && (
                    <div
                        className="absolute border-2 border-dashed"
                        style={{
                            left: `${cajaEnCurso.x * 100}%`,
                            top: `${cajaEnCurso.y * 100}%`,
                            width: `${cajaEnCurso.w * 100}%`,
                            height: `${cajaEnCurso.h * 100}%`,
                            borderColor: COLOR_SELECCION,
                            backgroundColor: 'rgba(34,211,238,0.10)',
                        }}
                    />
                )}
            </div>

            {/* Barra de acciones */}
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <span className="rounded-lg bg-orange-600/15 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-orange-400">
                        {boxes.length} {boxes.length === 1 ? 'caja' : 'cajas'}
                    </span>
                    {seleccionada !== null && (
                        <span className="rounded-lg bg-cyan-500/15 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-cyan-300">
                            Caja #{seleccionada + 1} activa
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={eliminarSeleccionada}
                        disabled={seleccionada === null || disabled}
                        className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-gray-300 transition-all hover:bg-white/10 disabled:opacity-30"
                    >
                        Borrar caja
                    </button>
                    <button
                        type="button"
                        onClick={limpiarTodo}
                        disabled={boxes.length === 0 || disabled}
                        className="rounded-lg border border-red-500/20 bg-red-600/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-red-400 transition-all hover:bg-red-600/20 disabled:opacity-30"
                    >
                        Limpiar todo
                    </button>
                </div>
            </div>
            <p className="text-[9px] font-bold italic text-gray-600">
                Arrastra sobre la imagen para dibujar una caja por cada pan. Clic en una caja para
                seleccionarla; Supr para borrarla.
            </p>
        </div>
    );
};
