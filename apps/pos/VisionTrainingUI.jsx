import React, { useState, useEffect, useCallback } from 'react';
import { VisionScanner } from './VisionScanner';
import { CategoryEditor } from './CategoryEditor';
import { AnnotationCanvas } from './components/AnnotationCanvas';
import { posService } from './services/POSService';
import { CONFIG } from './config';

/**
 * VisionTrainingUI - R de Rico (v7 Fase 8)
 *
 * Modulo para entrenar la "Mente" de la IA. Tiene DOS pestañas:
 *
 *   1. CAPTURA   - Seleccionar producto, capturar rafagas de fotos y
 *                  subirlas al dataset. (Comportamiento original.)
 *   2. ANOTACION - Elegir una imagen del dataset y dibujar una caja por
 *                  cada pan visible. El backend las guarda en formato
 *                  YOLO (.txt) para el fine-tuning de ultralytics.
 *
 * La IA solo PROPONE; el operador confirma. Nada se auto-etiqueta.
 */

const TABS = {
    CAPTURA: 'captura',
    ANOTACION: 'anotacion',
};

export const VisionTrainingUI = ({ products, categories = [], onCategoriesChange }) => {
    const [tab, setTab] = useState(TABS.CAPTURA);
    const [selectedProduct, setSelectedProduct] = useState(null);
    const [isEditingCategories, setIsEditingCategories] = useState(false);

    // --- Estado de captura ---
    const [capturedImages, setCapturedImages] = useState([]);
    const [isCapturing, setIsCapturing] = useState(false);
    const [syncProgress, setSyncProgress] = useState(0);

    // --- Estado de anotacion ---
    const [dataset, setDataset] = useState(null);
    const [datasetLoading, setDatasetLoading] = useState(false);
    const [datasetError, setDatasetError] = useState('');
    const [activeImage, setActiveImage] = useState(null);
    const [boxes, setBoxes] = useState([]);
    const [savingAnnotation, setSavingAnnotation] = useState(false);
    const [annotationMsg, setAnnotationMsg] = useState('');

    // --- Estado de entrenamiento (v7 Fase 8) ---
    const [training, setTraining] = useState(false);
    const [trainMsg, setTrainMsg] = useState('');
    const [trainError, setTrainError] = useState('');
    const [epochs, setEpochs] = useState(50);

    // ------------------------------------------------------------------
    // Captura
    // ------------------------------------------------------------------
    const handleFrameCaptured = (frameData) => {
        if (isCapturing && capturedImages.length < 20) {
            setCapturedImages((prev) => [
                ...prev,
                {
                    id: Date.now() + prev.length,
                    url: frameData,
                    timestamp: new Date().toLocaleTimeString(),
                },
            ]);

            if (capturedImages.length + 1 >= 20) {
                setIsCapturing(false);
            }
        }
    };

    const handleCapture = () => {
        if (!selectedProduct) return;
        setCapturedImages([]);
        setIsCapturing(true);
    };

    const handleSync = async () => {
        if (!selectedProduct || capturedImages.length === 0) return;

        try {
            setSyncProgress(10);
            const imageUrls = capturedImages.map((img) => img.url);
            await posService.uploadTrainingImages(selectedProduct.sku, imageUrls);
            setSyncProgress(100);
            setTimeout(() => {
                setSyncProgress(0);
                setCapturedImages([]);
            }, 3000);
        } catch (error) {
            console.error('Error sincronizando dataset:', error);
            alert('Error al subir imágenes al servidor corporativo.');
            setSyncProgress(0);
        }
    };

    // ------------------------------------------------------------------
    // Anotacion
    // ------------------------------------------------------------------
    const cargarDataset = useCallback(async (sku) => {
        if (!sku) return;
        setDatasetLoading(true);
        setDatasetError('');
        setActiveImage(null);
        setBoxes([]);
        try {
            const data = await posService.listTrainingDataset(sku);
            setDataset(data);
        } catch (error) {
            console.error('Error cargando dataset:', error);
            setDatasetError('No se pudo cargar el dataset de este producto.');
            setDataset(null);
        } finally {
            setDatasetLoading(false);
        }
    }, []);

    // Al entrar a la pestaña de anotacion con un producto elegido, cargar su dataset.
    useEffect(() => {
        if (tab === TABS.ANOTACION && selectedProduct?.sku) {
            cargarDataset(selectedProduct.sku);
        }
    }, [tab, selectedProduct, cargarDataset]);

    const seleccionarImagen = (img) => {
        setActiveImage(img);
        setBoxes([]);
        setAnnotationMsg('');
    };

    const guardarAnotacion = async () => {
        if (!selectedProduct || !activeImage) return;
        setSavingAnnotation(true);
        setAnnotationMsg('');
        try {
            const res = await posService.saveAnnotations(
                selectedProduct.sku,
                activeImage.filename,
                boxes
            );
            setAnnotationMsg(
                `✅ Guardado: ${res.box_count} ${res.box_count === 1 ? 'caja' : 'cajas'} en ${res.filename}`
            );
            // Refrescar el dataset para actualizar el estado "anotada".
            await cargarDataset(selectedProduct.sku);
            setActiveImage(null);
            setBoxes([]);
        } catch (error) {
            console.error('Error guardando anotación:', error);
            setAnnotationMsg('❌ No se pudo guardar la anotación.');
        } finally {
            setSavingAnnotation(false);
        }
    };

    // ------------------------------------------------------------------
    // Entrenamiento (v7 Fase 8) — fine-tuning de YOLO
    // ------------------------------------------------------------------
    const iniciarEntrenamiento = async () => {
        if (!selectedProduct) return;
        setTraining(true);
        setTrainMsg('');
        setTrainError('');
        try {
            // Entrena SOLO con el SKU seleccionado (el operador anota por producto).
            const res = await posService.trainVision({
                skus: [selectedProduct.sku],
                epochs,
            });
            if (res.ok) {
                setTrainMsg(
                    `✅ Entrenamiento completado (${res.resumen?.imagenes ?? '?'} imágenes). Modelo recargado.`
                );
            } else {
                setTrainError(res.error || res.mensaje || 'El entrenamiento falló.');
            }
        } catch (error) {
            console.error('Error entrenando:', error);
            // 503 = motor de IA caído; 400/409 = dataset o concurrencia.
            setTrainError(
                error.status === 503
                    ? 'El motor de IA Local no está disponible. Entrena más tarde.'
                    : error.message || 'No se pudo iniciar el entrenamiento.'
            );
        } finally {
            setTraining(false);
        }
    };

    if (isEditingCategories) {
        return (
            <CategoryEditor
                categories={categories}
                onSave={(newCats) => {
                    onCategoriesChange?.(newCats);
                    setIsEditingCategories(false);
                }}
                onCancel={() => setIsEditingCategories(false)}
            />
        );
    }

    // URL absoluta de la imagen para el canvas (el backend la sirve en /static/training).
    const imageUrlAbsoluta = activeImage
        ? `${CONFIG.API_BASE_URL.replace(/\/api\/v1\/?$/, '')}${activeImage.url}`
        : null;

    return (
        <div className="flex h-full bg-[#080808] text-white">
            {/* Panel de Control */}
            <div className="w-[450px] p-10 border-r border-white/5 flex flex-col backdrop-blur-3xl bg-black/40 shadow-2xl">
                <div className="mb-6 flex justify-between items-start">
                    <div>
                        <h2 className="text-4xl font-black uppercase tracking-tighter italic">
                            <span className="text-orange-500">Training</span> Mode
                        </h2>
                        <p className="text-[10px] text-gray-500 font-bold uppercase tracking-[0.4em] mt-2">
                            Dataset Collector v2.0
                        </p>
                    </div>
                    <button
                        onClick={() => setIsEditingCategories(true)}
                        className="p-3 bg-white/5 border border-white/10 rounded-2xl hover:bg-white/10 transition-all group"
                        title="Configurar Categorías"
                    >
                        <span className="text-xl">⚙️</span>
                    </button>
                </div>

                {/* Pestañas */}
                <div className="mb-8 grid grid-cols-2 gap-2 rounded-2xl bg-white/5 p-1.5">
                    <button
                        onClick={() => setTab(TABS.CAPTURA)}
                        className={`rounded-xl py-3 text-[10px] font-black uppercase tracking-widest transition-all ${
                            tab === TABS.CAPTURA
                                ? 'bg-orange-600 text-white shadow-lg'
                                : 'text-gray-500 hover:text-gray-300'
                        }`}
                    >
                        📸 Captura
                    </button>
                    <button
                        onClick={() => setTab(TABS.ANOTACION)}
                        className={`rounded-xl py-3 text-[10px] font-black uppercase tracking-widest transition-all ${
                            tab === TABS.ANOTACION
                                ? 'bg-orange-600 text-white shadow-lg'
                                : 'text-gray-500 hover:text-gray-300'
                        }`}
                    >
                        🎯 Anotación
                    </button>
                </div>

                <div className="space-y-8 flex-1 overflow-y-auto custom-scrollbar pr-1">
                    {/* 1. Selección de Objetivo (compartido) */}
                    <div className="space-y-3">
                        <label className="text-[10px] font-black uppercase text-gray-500 tracking-widest">
                            1. Seleccionar Producto
                        </label>
                        <select
                            value={selectedProduct?.sku || ''}
                            onChange={(e) =>
                                setSelectedProduct(products.find((p) => p.sku === e.target.value))
                            }
                            className="w-full bg-white/5 border border-white/10 p-5 rounded-2xl font-black uppercase tracking-tight text-sm outline-none focus:border-orange-500/50 custom-scrollbar"
                        >
                            <option value="">-- Elige un producto --</option>
                            {[...new Set(products.map((p) => p.category))].sort().map((cat) => (
                                <optgroup
                                    key={cat}
                                    label={cat}
                                    className="bg-[#0a0a0a] text-[#c1d72e]"
                                >
                                    {products
                                        .filter((p) => p.category === cat)
                                        .sort((a, b) => a.name.localeCompare(b.name))
                                        .map((p) => (
                                            <option key={p.sku} value={p.sku} className="text-white">
                                                {p.name}
                                            </option>
                                        ))}
                                </optgroup>
                            ))}
                        </select>
                    </div>

                    {tab === TABS.CAPTURA && (
                        <>
                            {selectedProduct && (
                                <div className="p-6 bg-orange-600/10 border border-orange-500/20 rounded-3xl animate-in fade-in zoom-in-95 duration-500">
                                    <div className="flex justify-between items-center mb-4">
                                        <span className="text-[10px] font-black uppercase text-orange-500">
                                            Muestras Capturadas
                                        </span>
                                        <span className="text-2xl font-black italic">
                                            {capturedImages.length}{' '}
                                            <span className="text-xs text-gray-500 font-medium">
                                                / 20
                                            </span>
                                        </span>
                                    </div>
                                    <div className="h-2 bg-gray-900 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-orange-500 transition-all duration-700"
                                            style={{
                                                width: `${Math.min(
                                                    (capturedImages.length / 20) * 100,
                                                    100
                                                )}%`,
                                            }}
                                        ></div>
                                    </div>
                                    <p className="text-[9px] text-gray-500 mt-2 font-bold italic">
                                        Se recomiendan al menos 20 fotos por producto.
                                    </p>
                                </div>
                            )}

                            <div className="space-y-4 pt-4">
                                <button
                                    disabled={!selectedProduct || isCapturing}
                                    onClick={handleCapture}
                                    className="w-full bg-white text-black font-black py-5 rounded-2xl uppercase tracking-widest text-xs shadow-2xl hover:scale-105 transition-all disabled:opacity-20 disabled:grayscale active:scale-95"
                                >
                                    {isCapturing ? '👁️ Capturando ráfaga...' : '👁️ Tomar Muestras'}
                                </button>

                                <button
                                    disabled={capturedImages.length === 0 || syncProgress > 0}
                                    onClick={handleSync}
                                    className="w-full bg-orange-600 font-black py-5 rounded-2xl uppercase tracking-widest text-xs shadow-2xl hover:bg-orange-500 transition-all disabled:opacity-20 active:scale-95"
                                >
                                    {syncProgress > 0 && syncProgress < 100
                                        ? `☁️ Sincronizando (${syncProgress}%)...`
                                        : syncProgress === 100
                                        ? '✅ Sincronizado'
                                        : '☁️ Subir al Dataset'}
                                </button>
                            </div>
                        </>
                    )}

                    {tab === TABS.ANOTACION && (
                        <>
                            {!selectedProduct && (
                                <div className="p-6 bg-white/5 border border-white/10 rounded-3xl text-center">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">
                                        Elige un producto para ver su dataset
                                    </p>
                                </div>
                            )}

                            {selectedProduct && datasetLoading && (
                                <div className="p-6 bg-white/5 border border-white/10 rounded-3xl text-center">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-500 animate-pulse">
                                        Cargando dataset...
                                    </p>
                                </div>
                            )}

                            {selectedProduct && datasetError && (
                                <div className="p-6 bg-red-600/10 border border-red-500/20 rounded-3xl">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-red-400">
                                        {datasetError}
                                    </p>
                                </div>
                            )}

                            {selectedProduct && dataset && !datasetLoading && (
                                <div className="p-6 bg-orange-600/10 border border-orange-500/20 rounded-3xl">
                                    <div className="flex justify-between items-center mb-3">
                                        <span className="text-[10px] font-black uppercase text-orange-500">
                                            Progreso de Anotación
                                        </span>
                                        <span className="text-2xl font-black italic">
                                            {dataset.annotated}{' '}
                                            <span className="text-xs text-gray-500 font-medium">
                                                / {dataset.total}
                                            </span>
                                        </span>
                                    </div>
                                    <div className="h-2 bg-gray-900 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-orange-500 transition-all duration-700"
                                            style={{
                                                width: `${
                                                    dataset.total > 0
                                                        ? (dataset.annotated / dataset.total) * 100
                                                        : 0
                                                }%`,
                                            }}
                                        ></div>
                                    </div>
                                    <p className="text-[9px] text-gray-500 mt-2 font-bold italic">
                                        {dataset.total === 0
                                            ? 'No hay imágenes. Captura muestras primero.'
                                            : 'Anota cada imagen para entrenar el conteo.'}
                                    </p>
                                </div>
                            )}

                            {activeImage && (
                                <div className="space-y-4 pt-2">
                                    <button
                                        disabled={savingAnnotation}
                                        onClick={guardarAnotacion}
                                        className="w-full bg-orange-600 font-black py-5 rounded-2xl uppercase tracking-widest text-xs shadow-2xl hover:bg-orange-500 transition-all disabled:opacity-20 active:scale-95"
                                    >
                                        {savingAnnotation
                                            ? '💾 Guardando...'
                                            : `💾 Guardar Anotación (${boxes.length})`}
                                    </button>
                                    {annotationMsg && (
                                        <p className="text-[10px] font-black uppercase tracking-widest text-center text-gray-400">
                                            {annotationMsg}
                                        </p>
                                    )}
                                </div>
                            )}

                            {/* v7 (Fase 8): fine-tuning de YOLO con el dataset anotado */}
                            {dataset && dataset.annotated > 0 && (
                                <div className="space-y-3 pt-4 border-t border-white/5">
                                    <label className="text-[10px] font-black uppercase text-gray-500 tracking-widest">
                                        Entrenar el Modelo (Fine-tuning)
                                    </label>
                                    <div className="flex items-center gap-3">
                                        <span className="text-[9px] font-black uppercase tracking-widest text-gray-500">
                                            Épocas
                                        </span>
                                        <input
                                            type="number"
                                            min={1}
                                            max={500}
                                            value={epochs}
                                            disabled={training}
                                            onChange={(e) => setEpochs(Number(e.target.value) || 1)}
                                            className="w-24 bg-white/5 border border-white/10 p-3 rounded-xl font-black text-sm outline-none focus:border-indigo-500/50 disabled:opacity-40"
                                        />
                                    </div>
                                    <button
                                        disabled={training}
                                        onClick={iniciarEntrenamiento}
                                        className="w-full bg-indigo-600 font-black py-5 rounded-2xl uppercase tracking-widest text-xs shadow-2xl hover:bg-indigo-500 transition-all disabled:opacity-40 active:scale-95"
                                    >
                                        {training
                                            ? '🧠 Entrenando... (puede tardar minutos)'
                                            : `🧠 Entrenar con ${dataset.annotated} imagen(es)`}
                                    </button>
                                    {training && (
                                        <p className="text-[9px] font-bold italic text-gray-500 text-center">
                                            El motor sigue operando con el modelo anterior mientras entrena.
                                        </p>
                                    )}
                                    {trainMsg && (
                                        <p className="text-[10px] font-black uppercase tracking-widest text-center text-green-400">
                                            {trainMsg}
                                        </p>
                                    )}
                                    {trainError && (
                                        <p className="text-[10px] font-black uppercase tracking-widest text-center text-red-400">
                                            {trainError}
                                        </p>
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </div>

                <div className="mt-6 p-6 glass rounded-3xl border-indigo-500/20">
                    <p className="text-[9px] font-black uppercase text-indigo-400 mb-2 italic">
                        {tab === TABS.CAPTURA ? 'Tip de Entrenamiento' : 'Tip de Anotación'}
                    </p>
                    <p className="text-[10px] font-bold leading-relaxed text-gray-400">
                        {tab === TABS.CAPTURA
                            ? 'Mueve el producto y cambia la iluminación para que la IA aprenda a reconocerlo en cualquier condición.'
                            : 'Dibuja una caja por cada pan visible, incluyendo los parcialmente tapados. La IA solo propone; tú confirmas.'}
                    </p>
                </div>
            </div>

            {/* Panel de Visualización */}
            <div className="flex-1 p-10 flex flex-col overflow-hidden">
                {tab === TABS.CAPTURA ? (
                    <>
                        <div className="h-3/5 mb-8">
                            <VisionScanner
                                onCaptureFrame={isCapturing ? handleFrameCaptured : null}
                            />
                        </div>

                        <div className="flex-1 overflow-y-auto custom-scrollbar">
                            <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-gray-500 mb-6">
                                Muestras del Periodo Actual
                            </h3>
                            <div className="grid grid-cols-5 gap-6">
                                {capturedImages.map((img, idx) => (
                                    <div
                                        key={idx}
                                        className="aspect-square glass rounded-2xl overflow-hidden border border-white/5 relative group animate-in slide-in-from-bottom-2 duration-300"
                                    >
                                        <img
                                            src={img.url}
                                            alt="sample"
                                            className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                                        />
                                        <div className="absolute inset-x-0 bottom-0 bg-black/60 p-2 text-[8px] font-black text-center text-orange-500 backdrop-blur-sm">
                                            IMG_{idx + 1}
                                        </div>
                                    </div>
                                ))}
                                {capturedImages.length === 0 && (
                                    <div className="col-span-5 h-40 border-2 border-dashed border-white/5 rounded-3xl flex items-center justify-center text-gray-700 font-black uppercase tracking-widest text-xs italic">
                                        Esperando capturas...
                                    </div>
                                )}
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex flex-col overflow-hidden">
                        <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-gray-500 mb-6">
                            Anotación de Cajas (YOLO)
                        </h3>

                        {!selectedProduct ? (
                            <div className="flex-1 flex items-center justify-center border-2 border-dashed border-white/5 rounded-3xl">
                                <p className="text-gray-700 font-black uppercase tracking-widest text-xs italic">
                                    Selecciona un producto para comenzar
                                </p>
                            </div>
                        ) : (
                            <div className="flex-1 grid grid-cols-[1fr_320px] gap-8 overflow-hidden">
                                {/* Canvas de anotacion */}
                                <div className="overflow-y-auto custom-scrollbar pr-2">
                                    <AnnotationCanvas
                                        imageUrl={imageUrlAbsoluta}
                                        boxes={boxes}
                                        onChange={setBoxes}
                                        label={selectedProduct.name || 'concha'}
                                        disabled={!activeImage}
                                    />
                                </div>

                                {/* Lista de imagenes del dataset */}
                                <div className="flex flex-col overflow-hidden">
                                    <p className="text-[9px] font-black uppercase tracking-widest text-gray-500 mb-3">
                                        Imágenes del Dataset
                                    </p>
                                    <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2">
                                        {dataset?.images?.map((img) => (
                                            <button
                                                key={img.filename}
                                                onClick={() => seleccionarImagen(img)}
                                                className={`w-full flex items-center gap-3 rounded-xl border p-2 text-left transition-all ${
                                                    activeImage?.filename === img.filename
                                                        ? 'border-orange-500/60 bg-orange-600/10'
                                                        : 'border-white/5 bg-white/5 hover:bg-white/10'
                                                }`}
                                            >
                                                <img
                                                    src={`${CONFIG.API_BASE_URL.replace(
                                                        /\/api\/v1\/?$/,
                                                        ''
                                                    )}${img.url}`}
                                                    alt={img.filename}
                                                    className="h-12 w-12 rounded-lg object-cover"
                                                />
                                                <div className="min-w-0 flex-1">
                                                    <p className="truncate text-[9px] font-bold text-gray-300">
                                                        {img.filename}
                                                    </p>
                                                    <p
                                                        className={`text-[9px] font-black uppercase tracking-wider ${
                                                            img.annotated
                                                                ? 'text-green-400'
                                                                : 'text-gray-600'
                                                        }`}
                                                    >
                                                        {img.annotated
                                                            ? `✓ ${img.box_count} cajas`
                                                            : 'Sin anotar'}
                                                    </p>
                                                </div>
                                            </button>
                                        ))}
                                        {dataset && dataset.images.length === 0 && (
                                            <div className="h-32 border-2 border-dashed border-white/5 rounded-2xl flex items-center justify-center text-gray-700 font-black uppercase tracking-widest text-[9px] italic text-center px-4">
                                                Sin imágenes. Captura muestras primero.
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};
