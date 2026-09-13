import React, { useState, useMemo, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import axios from 'axios';
import REAL_PRODUCTS from '../../importar_productos_AQUI.json';
import { PROVIDERS_MASTER } from './PurchaseManagerUI';
import { CONFIG } from '../pos/config';
// v7 (Fase 3.2): mapeadores y validadores puros, cubiertos por Vitest.
import {
    resolveUserId,
    mapWarehousesFromApi,
    mapStockListFromApi,
    buildWarehouseCreatePayload,
    validateBulkEntry,
    buildBulkEntryPayload,
    validateMerma,
    validateTraspaso,
    // v7 (Fase 6.3): escáner IA de visión (human-in-the-loop).
    mapVisionDetectionsToProposals,
    validateVisionSnapshot,
    buildVisionSnapshotPayload,
    // v7 (Fase 6.5): captura de inventario por voz (human-in-the-loop).
    mapVoiceIntentToProposal,
    validateVoiceEntry,
    buildVoiceEntryPayload,
    // v8 (Fase 8.6): subcategorías de almacén gestionables (warehouse_propositos).
    ICONOS_SUBCATEGORIA,
    CODIGO_CUARENTENA,
    mapPropositosFromApi,
    sortPropositos,
    propositosParaBarra,
    codigoDesdeLabel,
    validatePropositoForm,
    buildPropositoCreatePayload,
    validatePropositoDelete,
    buildTrasladoSubcategoriaPayload,
    // v11 (Fase 11.3, Deuda 3): vigilancia visible de SIN_CLASIFICAR.
    mapEventosSinAlmacenFromApi,
    etiquetaMotivoSinAlmacen,
    accionSugeridaSinAlmacen,
    contarEventosSinAlmacen,
    agruparEventosSinAlmacenPorSku,
} from './utils/warehouseMappers';
// v7 (Fase 4): capa PWA offline del módulo de almacenes. Aislada del POS.
import {
    createWarehouseNetworkMonitor,
    getPendingCount,
    enqueueOperacion,
} from './services/offlineQueue';
import { inicializarPWA } from './services/pwaRuntime';

const API_BASE = CONFIG.API_BASE_URL.replace('/api/v1', '');

/**
 * v7 (D11): logger estructurado en lugar de console.error suelto.
 *
 * Los console.error dispersos no llevan contexto ni se pueden silenciar en
 * producción. Este helper centraliza el prefijo del módulo y respeta el modo
 * de producción (solo emite en desarrollo), evitando ruido en la consola del
 * operador durante la jornada.
 */
const LOG_PREFIX = '[Warehouse]';
const logger = {
    error: (message, error) => {
        if (import.meta.env.DEV) {
            console.error(`${LOG_PREFIX} ${message}`, error);
        }
    },
    warn: (message, error) => {
        if (import.meta.env.DEV) {
            console.warn(`${LOG_PREFIX} ${message}`, error);
        }
    },
};

/**
 * R DE RICO - WAREHOUSE & STORAGE MANAGER
 * 
 * Hub visual para gestión de ubicaciones físicas, stock por almacén
 * y control de accesos operativos.
 */

const INITIAL_WAREHOUSES = [
    { id: 'wh_ex_pan', name: 'VITRINA PRINCIPAL', type: 'EX_PT', icon: '🥖', capacity: 100, current: 45 },
    { id: 'wh_ex_pal', name: 'CONGELADOR EXHIBICIÓN PALETAS', type: 'EX_PAL', icon: '🍭', capacity: 80, current: 30 },
    { id: 'wh_alm_pan', name: 'BODEGA HARINAS Y MATERIA PRIMA', type: 'AL_INS_PAN', icon: '📦', capacity: 500, current: 320 },
    { id: 'wh_alm_lim', name: 'BODEGA LIMPIEZA', type: 'AL_LIM', icon: '🧹', capacity: 150, current: 60 },
];

const INITIAL_SUPPLIES = [
    { sku: 'ing_harina', name: 'Harina de Trigo', unit: 'kg', price: 18.5, category: 'INSUMOS' },
    { sku: 'ing_mantequilla', name: 'Mantequilla de Planta', unit: 'kg', price: 120.0, category: 'INSUMOS' },
    { sku: 'ing_azucar', name: 'Azúcar Refinada', unit: 'kg', price: 22.0, category: 'INSUMOS' },
    { sku: 'ing_levadura', name: 'Levadura Seca', unit: 'kg', price: 85.0, category: 'INSUMOS' },
    { sku: 'ing_leche', name: 'Leche Entera', unit: 'lt', price: 24.5, category: 'INSUMOS' },
    { sku: 'ing_huevo', name: 'Huevo Limpio', unit: 'kg', price: 38.0, category: 'INSUMOS' },
    { sku: 'ing_sal', name: 'Sal de Grano', unit: 'kg', price: 12.0, category: 'INSUMOS' },
];

const UNIT_OPTIONS = {
    "Conteo": ["PZA", "DOCENA", "CAJA", "PAQUETE", "BOLSA", "SUBBOLSA RECICLABLE", "SUBBOLSA DESECHABLE", "BARRA", "PAR"],
    "Masa": ["KG", "G", "MG", "LB", "OZ"],
    "Volumen": ["LT", "ML", "GAL", "OZ FL", "COPA"]
};

// v7 (Fase 3.2): `resolveUserId` y los mapeadores/validadores puros viven en
// ./utils/warehouseMappers y están cubiertos por Vitest. Se importan arriba
// para que los tests validen el código realmente en uso (no código muerto).

export const WarehouseManagerUI = ({ currentUser = null }) => {
    const usuarioId = resolveUserId(currentUser);
    const [warehouses, setWarehouses] = useState([]);
    const [showAiScanner, setShowAiScanner] = useState(false);
    
    const fetchWarehouses = async () => {
        try {
            const res = await axios.get(`${API_BASE}/api/v1/warehouse`);
            // v7 (Fase 3.2): mapeo API (español) → UI (inglés) delegado al
            // módulo puro cubierto por Vitest.
            setWarehouses(mapWarehousesFromApi(res.data));
        } catch(e) {
            logger.error('Error fetching warehouses:', e);
        }
    };

    // v8 (Fase 8.6): subcategorías gestionables (warehouse_propositos).
    // La barra de filtros y el modal de gestión leen de aquí, no de una
    // constante hardcodeada, para que crear/borrar se refleje al instante.
    const fetchPropositos = async () => {
        try {
            const res = await axios.get(`${API_BASE}/api/v1/warehouse/subcategorias`);
            setPropositos(sortPropositos(mapPropositosFromApi(res.data)));
        } catch(e) {
            logger.error('Error fetching subcategorias:', e);
        }
    };

    // v11 (Fase 11.3, Deuda 3): VIGILANCIA VISIBLE DE SIN_CLASIFICAR.
    // El endpoint `/warehouse/diagnostico/sin-almacen` existia desde v7 pero
    // NADIE lo consumia: un SKU que no se pudo descontar quedaba invisible.
    // Aqui se consulta y se expone al operador (badge + panel). El mapeo y las
    // etiquetas viven en funciones puras cubiertas por Vitest.
    const fetchEventosSinAlmacen = async () => {
        try {
            const res = await axios.get(`${API_BASE}/api/v1/warehouse/diagnostico/sin-almacen`);
            setEventosSinAlmacen(mapEventosSinAlmacenFromApi(res.data));
        } catch(e) {
            logger.error('Error fetching eventos sin almacen:', e);
        }
    };

    useEffect(() => {
        fetchWarehouses();
        fetchPropositos();
        fetchEventosSinAlmacen();
    }, []);

    // --- v7 (Fase 4): estado de red y cola offline ---
    // Incidente 16.1: el indicador NO usa animaciones de bucle infinito.
    // Solo transiciones de montaje único (animate-in) para evitar efecto estrobo.
    const [isOnline, setIsOnline] = useState(
        typeof navigator !== 'undefined' ? navigator.onLine : true
    );
    const [pendingOps, setPendingOps] = useState(0);
    const [syncNotice, setSyncNotice] = useState(null); // { text, type }

    useEffect(() => {
        // Inicializa la capa PWA (SW + manifest desde system_settings).
        inicializarPWA();

        const refrescarPendientes = async () => {
            try {
                const n = await getPendingCount();
                setPendingOps(n);
            } catch (e) {
                // IndexedDB no disponible: se ignora silenciosamente.
            }
        };
        refrescarPendientes();

        const monitor = createWarehouseNetworkMonitor({
            onStatusChange: (online) => {
                setIsOnline(online);
                if (online) refrescarPendientes();
            },
            onSync: (resultado) => {
                refrescarPendientes();
                if (resultado && resultado.synced > 0) {
                    setSyncNotice({
                        text: `Sincronizadas ${resultado.synced} operación(es) pendiente(s).`,
                        type: 'success',
                    });
                }
                if (resultado && resultado.conflicts && resultado.conflicts.length > 0) {
                    setSyncNotice({
                        text: `${resultado.conflicts.length} operación(es) con conflicto; revísalas en el historial.`,
                        type: 'error',
                    });
                }
            },
        });

        return () => monitor.destroy();
    }, []);

    const [selectedWH, setSelectedWH] = useState(null);
    const [activeTab, setActiveTab] = useState('existencias');
    const [selectedZone, setSelectedZone] = useState(null); // null = landing, 'SECO'|'REFRIGERADO'|'CONGELADO' = suite
    const [suiteTab, setSuiteTab] = useState('existencias'); // Pestaña activa en la suite de zona
    const [subCategoryTab, setSubCategoryTab] = useState('EXHIBICION_VENTA'); // Subcategoría activa (codigo de warehouse_propositos)

    const [showItemPicker, setShowItemPicker] = useState(false);
    const [pickerSearch, setPickerSearch] = useState('');
    const [showWHEditor, setShowWHEditor] = useState(false);
    const [editingWHData, setEditingWHData] = useState(null);
    // v10 (Fase 10.3): modal anidado de infografia de acomodo. Es un estado
    // aparte para que cerrarlo NO cierre el editor de almacen que lo abrio.
    const [showPlanograma, setShowPlanograma] = useState(false);
    const [whToDelete, setWhToDelete] = useState(null);
    const [editingItem, setEditingItem] = useState(null); // { whId, productSku, data }

    // --- v8 (Fase 8.6): Gestión de subcategorías de almacén ---
    const [propositos, setPropositos] = useState([]);
    // v11 (Fase 11.3, Deuda 3): SKUs que no se pudieron descontar del stock.
    // Alimentan el badge rojo de la cuarentena y el panel de diagnostico.
    const [eventosSinAlmacen, setEventosSinAlmacen] = useState([]);
    const [showSinAlmacenPanel, setShowSinAlmacenPanel] = useState(false);
    const [showSubcatManager, setShowSubcatManager] = useState(false);
    const [subcatForm, setSubcatForm] = useState({ label: '', icon: '📦' });
    const [subcatEditing, setSubcatEditing] = useState(null); // proposito en edición o null
    const [subcatError, setSubcatError] = useState('');
    const [subcatSaving, setSubcatSaving] = useState(false);
    // Diálogo de borrado con traslado obligatorio (decisión 1 del plan v8)
    const [subcatDeleteDialog, setSubcatDeleteDialog] = useState(null); // { proposito, motivo, requiereTraslado }
    const [subcatTrasladoDestino, setSubcatTrasladoDestino] = useState(CODIGO_CUARENTENA);

    // --- Fase 1F: Estados operativos ---
    const [insumos, setInsumos] = useState([]);
    const [movements, setMovements] = useState([]);
    const [loadingOp, setLoadingOp] = useState(false);
    const [opMessage, setOpMessage] = useState({ text: '', type: '' }); // type: 'success' | 'error'
    // Entrada Masiva
    const [bulkEntryItems, setBulkEntryItems] = useState([]);
    const [bulkTargetWH, setBulkTargetWH] = useState('');
    const [bulkInsumoSearch, setBulkInsumoSearch] = useState('');
    // v7 (Fase 6.3): Escáner IA de Visión (human-in-the-loop)
    const [visionTargetWH, setVisionTargetWH] = useState('');
    const [visionProposals, setVisionProposals] = useState([]);
    const [visionScanning, setVisionScanning] = useState(false);
    const [visionPreview, setVisionPreview] = useState(null);
    const visionFileRef = useRef(null);
    // v7 (Fase 6.5): Captura de Inventario por Voz (human-in-the-loop)
    const [voiceTargetWH, setVoiceTargetWH] = useState('');
    const [voiceRecording, setVoiceRecording] = useState(false);
    const [voiceTranscribing, setVoiceTranscribing] = useState(false);
    const [voiceTranscript, setVoiceTranscript] = useState('');
    const [voiceProposal, setVoiceProposal] = useState(null);
    const [voiceAvailable, setVoiceAvailable] = useState(true);
    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);
    // Mermas
    const [mermaForm, setMermaForm] = useState({ almacen_id: '', item_id: '', item_type: 'INSUMO', cantidad: '', notas: '' });
    // Traspasos
    const [traspasoForm, setTraspasoForm] = useState({ almacen_origen_id: '', almacen_destino_id: '', item_id: '', item_type: 'INSUMO', cantidad: '' });
    // Historial filtro
    const [historialFilter, setHistorialFilter] = useState('ALL');

    // Bóveda de Insumos Descontinuados
    const [discontinuedItems, setDiscontinuedItems] = useState([]);
    const [showDiscontinuedVault, setShowDiscontinuedVault] = useState(false);

    // Modales de UI Customizados (Reemplazos nativos)
    const [confirmArchiveDialog, setConfirmArchiveDialog] = useState({ isOpen: false, whId: null, productSku: null, itemName: '' });
    const [confirmDestroyDialog, setConfirmDestroyDialog] = useState({ isOpen: false, itemIndex: null, itemName: '' });
    const [restoreDialog, setRestoreDialog] = useState({ isOpen: false, itemIndex: null, itemName: '', originalWhId: '', targetWhId: '' });

    // --- Fase 1F: Fetch Functions ---
    const fetchInsumos = async () => {
        try {
            const res = await axios.get(`${API_BASE}/api/v1/warehouse/insumos`);
            setInsumos(res.data || []);
        } catch(e) { logger.error('Error fetching insumos:', e); }
    };

    const fetchMovements = async (almacenId = null) => {
        try {
            const url = almacenId 
                ? `${API_BASE}/api/v1/warehouse/movimientos?almacen_id=${almacenId}&limit=200`
                : `${API_BASE}/api/v1/warehouse/movimientos?limit=200`;
            const res = await axios.get(url);
            setMovements(res.data || []);
        } catch(e) { logger.error('Error fetching movements:', e); }
    };

    const fetchWarehouseStock = async (whId) => {
        try {
            const res = await axios.get(`${API_BASE}/api/v1/warehouse/${whId}/stock`);
            return res.data || [];
        } catch(e) { logger.error('Error fetching stock:', e); return []; }
    };

    // Cargar insumos al montar
    useEffect(() => { fetchInsumos(); }, []);

    // Cargar movimientos cuando cambia a pestaña historial
    useEffect(() => {
        if (suiteTab === 'historial') fetchMovements();
    }, [suiteTab]);

    // --- Fase 1F: Submit Functions ---
    const showOpMessage = (text, type = 'success') => {
        setOpMessage({ text, type });
        setTimeout(() => setOpMessage({ text: '', type: '' }), 4000);
    };

    /**
     * v7 (Fase 4.1): intenta una escritura contra el backend y, si no hay red,
     * la encola en IndexedDB para sincronizarla al reconectar. La UI nunca se
     * bloquea: aplica optimista y reconcilia al sincronizar.
     *
     * @returns {Promise<{offline:boolean, error?:string}>}
     */
    const ejecutarOEncolar = async ({ ruta, body, label, exitoMsg }) => {
        // Sin red conocida: encolar directamente sin intentar la petición.
        if (!isOnline) {
            await enqueueOperacion({ ruta, body, label, sucursalId: usuarioId });
            const n = await getPendingCount();
            setPendingOps(n);
            showOpMessage(`📥 Sin conexión: ${exitoMsg} (en cola para sincronizar)`);
            return { offline: true };
        }
        try {
            await axios.post(`${API_BASE}/api/v1/warehouse${ruta}`, body);
            showOpMessage(`✅ ${exitoMsg}`);
            return { offline: false };
        } catch (e) {
            // Fallo de red (no respuesta del servidor): encolar para reintento.
            const esFalloDeRed = !e.response;
            if (esFalloDeRed) {
                await enqueueOperacion({ ruta, body, label, sucursalId: usuarioId });
                const n = await getPendingCount();
                setPendingOps(n);
                setIsOnline(false);
                showOpMessage(`📥 Sin conexión: ${exitoMsg} (en cola para sincronizar)`);
                return { offline: true };
            }
            // Error de negocio (4xx/5xx con respuesta): reportar al operador.
            showOpMessage(`❌ Error: ${e.response?.data?.detail || e.message}`, 'error');
            return { offline: false, error: e.response?.data?.detail || e.message };
        }
    };

    const handleSubmitBulkEntry = async () => {
        // v7 (Fase 3.2): validación y armado del payload delegados al módulo
        // puro cubierto por Vitest.
        const { ok, error } = validateBulkEntry(bulkTargetWH, bulkEntryItems);
        if (!ok) {
            showOpMessage(error, 'error');
            return;
        }
        setLoadingOp(true);
        try {
            const payload = buildBulkEntryPayload(bulkEntryItems, usuarioId);
            await ejecutarOEncolar({
                ruta: `/${bulkTargetWH}/entrada-masiva`,
                body: payload,
                label: `Entrada masiva (${bulkEntryItems.length} items)`,
                exitoMsg: `Entrada masiva registrada: ${bulkEntryItems.length} items en lote`,
            });
            setBulkEntryItems([]);
            setBulkTargetWH('');
        } finally { setLoadingOp(false); }
    };

    const handleSubmitMerma = async () => {
        const { almacen_id, item_id, item_type, cantidad, notas } = mermaForm;
        // v7 (Fase 3.2): validación delegada al módulo puro cubierto por Vitest.
        const { ok, error } = validateMerma(mermaForm);
        if (!ok) {
            showOpMessage(error, 'error');
            return;
        }
        setLoadingOp(true);
        try {
            await ejecutarOEncolar({
                ruta: `/${almacen_id}/mermas`,
                body: { item_id, item_type, cantidad: parseFloat(cantidad), notas, usuario_id: usuarioId },
                label: `Merma de ${cantidad} ${item_type === 'INSUMO' ? 'insumo' : 'producto'}`,
                exitoMsg: 'Merma registrada correctamente',
            });
            setMermaForm({ almacen_id: '', item_id: '', item_type: 'INSUMO', cantidad: '', notas: '' });
        } finally { setLoadingOp(false); }
    };

    const handleSubmitTraspaso = async () => {
        const { almacen_origen_id, almacen_destino_id, item_id, item_type, cantidad } = traspasoForm;
        // v7 (Fase 3.2): validación delegada al módulo puro cubierto por Vitest.
        const { ok, error } = validateTraspaso(traspasoForm);
        if (!ok) {
            showOpMessage(error, 'error');
            return;
        }
        setLoadingOp(true);
        try {
            await ejecutarOEncolar({
                ruta: '/traspasos',
                body: {
                    almacen_origen_id, almacen_destino_id, item_id, item_type,
                    cantidad: parseFloat(cantidad), usuario_id: usuarioId,
                },
                label: `Traspaso de ${cantidad} unidades`,
                exitoMsg: 'Traspaso ejecutado correctamente',
            });
            setTraspasoForm({ almacen_origen_id: '', almacen_destino_id: '', item_id: '', item_type: 'INSUMO', cantidad: '' });
        } finally { setLoadingOp(false); }
    };

    const addBulkItem = (insumo) => {
        if (bulkEntryItems.find(i => i.item_id === insumo.id)) return;
        setBulkEntryItems([...bulkEntryItems, {
            item_id: insumo.id,
            item_type: 'INSUMO',
            nombre: insumo.nombre,
            unidad: insumo.unidad_base,
            cantidad: '',
            notas: ''
        }]);
        setBulkInsumoSearch('');
    };

    const updateBulkItem = (index, field, value) => {
        const updated = [...bulkEntryItems];
        updated[index] = { ...updated[index], [field]: value };
        setBulkEntryItems(updated);
    };

    const removeBulkItem = (index) => {
        setBulkEntryItems(bulkEntryItems.filter((_, i) => i !== index));
    };

    // --- v7 (Fase 6.3): Escáner IA de Visión (human-in-the-loop) ---
    // Regla de oro (spec línea 537): la IA PROPONE, el operador CONFIRMA.
    // Nunca se registra stock automáticamente sin confirmación humana.

    /**
     * Abre la cámara trasera del dispositivo (o el selector de archivos en
     * escritorio) mediante un <input type="file" capture="environment">.
     */
    const handleVisionCapture = () => {
        if (visionFileRef.current) visionFileRef.current.click();
    };

    /**
     * Lee la imagen elegida como DataURL, la guarda para la vista previa y
     * dispara el análisis contra el motor ORB existente del POS.
     */
    const handleVisionFileChange = async (e) => {
        const file = e.target.files?.[0];
        // Permite volver a elegir el mismo archivo dos veces seguidas.
        e.target.value = '';
        if (!file) return;
        const dataUrl = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
        setVisionPreview(dataUrl);
        await handleVisionAnalyze(dataUrl);
    };

    /**
     * Envía la imagen al endpoint de detección. Si el motor no está
     * disponible (IA apagada) el backend responde engine="unavailable" y
     * aquí solo se avisa al operador: el flujo manual sigue intacto.
     */
    const handleVisionAnalyze = async (dataUrl) => {
        setVisionScanning(true);
        try {
            const base64 = String(dataUrl).split(',')[1] || '';
            const res = await axios.post(`${API_BASE}/api/v1/pos/vision/predict`, {
                image: base64,
                terminal_id: 'ALMACEN',
            });
            const data = res.data || {};
            if (data.engine === 'unavailable' || !data.detections?.length) {
                setVisionProposals([]);
                showOpMessage('🤖 La IA no detectó productos. Captura manualmente o reintenta.', 'error');
                return;
            }
            // La IA solo propone: todo llega con confirmado=false.
            setVisionProposals(mapVisionDetectionsToProposals(data.detections, insumos));
            showOpMessage(`🤖 IA propuso ${data.detections.length} línea(s). Confirma las cantidades.`);
        } catch (err) {
            logger.error('Error en análisis de visión:', err);
            setVisionProposals([]);
            showOpMessage('❌ No se pudo analizar la imagen. Usa la captura manual.', 'error');
        } finally {
            setVisionScanning(false);
        }
    };

    /** Alterna la confirmación humana de una propuesta detectada. */
    const handleVisionConfirm = (index) => {
        const updated = [...visionProposals];
        updated[index] = { ...updated[index], confirmado: !updated[index].confirmado };
        setVisionProposals(updated);
    };

    /** Permite corregir la cantidad propuesta por la IA antes de confirmar. */
    const handleVisionQtyChange = (index, value) => {
        const updated = [...visionProposals];
        updated[index] = { ...updated[index], cantidad: value };
        setVisionProposals(updated);
    };

    /** Descarta una propuesta que el operador no reconoce. */
    const handleVisionDiscard = (index) => {
        setVisionProposals(visionProposals.filter((_, i) => i !== index));
    };

    /** Limpia por completo el estado del escáner de visión. */
    const resetVisionScanner = () => {
        setVisionProposals([]);
        setVisionPreview(null);
        setVisionScanning(false);
    };

    /**
     * Registra la entrada SOLO con las líneas confirmadas explícitamente por
     * el operador. La validación y el armado del payload viven en el módulo
     * puro cubierto por Vitest.
     */
    const handleSubmitVisionEntry = async () => {
        const { ok, error } = validateVisionSnapshot(visionTargetWH, visionProposals);
        if (!ok) {
            showOpMessage(error, 'error');
            return;
        }
        setLoadingOp(true);
        try {
            const confirmadas = visionProposals.filter(p => p.confirmado && Number(p.cantidad) > 0);
            const payload = buildVisionSnapshotPayload(visionProposals, usuarioId, {
                imagen_ref: visionPreview ? 'captura_charola' : null,
                modelo: 'orb-local',
            });
            await ejecutarOEncolar({
                ruta: `/${visionTargetWH}/entrada-vision`,
                body: payload,
                label: `Entrada por visión (${confirmadas.length} items)`,
                exitoMsg: `Entrada por visión registrada: ${confirmadas.length} items confirmados`,
            });
            resetVisionScanner();
            setVisionTargetWH('');
        } finally { setLoadingOp(false); }
    };

    // --- v7 (Fase 6.5): Captura de Inventario por Voz (human-in-the-loop) ---
    // Regla de oro (spec línea 664): la IA PROPONE, el operador CONFIRMA.
    // Nunca se registra stock automáticamente por voz. Si la IA local no está
    // instalada, el flujo manual sigue funcionando (spec línea 692).

    const resetVoiceCapture = () => {
        setVoiceProposal(null);
        setVoiceTranscript('');
        setVoiceRecording(false);
        setVoiceTranscribing(false);
        audioChunksRef.current = [];
    };

    /**
     * Fase 6.5.2: inicia la grabación con MediaRecorder.
     * Fase 6.5.3: si el navegador no soporta audio o el permiso falla, se
     * degrada al flujo manual sin romper la UI.
     */
    const handleVoiceStart = async () => {
        if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
            setVoiceAvailable(false);
            showOpMessage('🎙️ Dictado por voz no disponible en este dispositivo. Capture manualmente.', 'error');
            return;
        }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            audioChunksRef.current = [];
            const recorder = new MediaRecorder(stream);
            recorder.ondataavailable = (e) => {
                if (e.data && e.data.size > 0) audioChunksRef.current.push(e.data);
            };
            recorder.onstop = async () => {
                stream.getTracks().forEach((t) => t.stop());
                const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
                await handleVoiceTranscribe(blob);
            };
            mediaRecorderRef.current = recorder;
            recorder.start();
            setVoiceRecording(true);
            setVoiceProposal(null);
            setVoiceTranscript('');
        } catch (err) {
            logger.error('Error al iniciar grabación de voz:', err);
            setVoiceAvailable(false);
            showOpMessage('🎙️ No se pudo acceder al micrófono. Capture manualmente.', 'error');
        }
    };

    const handleVoiceStop = () => {
        const recorder = mediaRecorderRef.current;
        if (recorder && recorder.state !== 'inactive') {
            recorder.stop();
        }
        setVoiceRecording(false);
    };

    /**
     * Fase 6.5.3: transcribe el audio y luego pide la intención estructurada.
     * Fallback 503 IA_NO_DISPONIBLE => toast informativo, sin congelar la UI.
     */
    const handleVoiceTranscribe = async (blob) => {
        setVoiceTranscribing(true);
        try {
            const base64 = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
            const res = await axios.post(`${API_BASE}/api/v1/ai/voice/transcribe`, {
                audio_base64: base64,
                idioma: 'es',
                formato: blob.type || 'audio/webm',
            });
            const texto = (res.data?.texto || '').trim();
            if (!texto) {
                showOpMessage('🎙️ No se entendió el dictado. Intenta de nuevo o captura manualmente.', 'error');
                return;
            }
            setVoiceTranscript(texto);
            await handleVoiceParseIntent(texto);
        } catch (err) {
            const status = err?.response?.status;
            if (status === 503) {
                setVoiceAvailable(false);
                showOpMessage('🎙️ Dictado por voz no disponible (IA local apagada). Capture manualmente.', 'error');
            } else {
                logger.error('Error al transcribir voz:', err);
                showOpMessage('🎙️ No se pudo procesar el audio. Capture manualmente.', 'error');
            }
        } finally {
            setVoiceTranscribing(false);
        }
    };

    /**
     * Fase 6.5.5: convierte el texto en una intención estructurada y la mapea a
     * una propuesta editable. La confianza baja marca la línea para revisión.
     */
    const handleVoiceParseIntent = async (texto) => {
        try {
            const res = await axios.post(`${API_BASE}/api/v1/ai/voice/parse-intent`, {
                texto,
                almacen_id: voiceTargetWH || null,
                skus_disponibles: (insumos || []).map((i) => i.id),
            });
            const propuesta = mapVoiceIntentToProposal(res.data, insumos);
            setVoiceProposal(propuesta);
            if (!propuesta.sku_resuelto) {
                showOpMessage('🎙️ La IA no reconoció el insumo. Selecciónalo manualmente.', 'error');
            } else if (propuesta.revisar) {
                showOpMessage('🎙️ Confianza baja: revisa la cantidad y el insumo antes de confirmar.', 'error');
            } else {
                showOpMessage('🎙️ Dictado interpretado. Confirma los datos antes de registrar.');
            }
        } catch (err) {
            const status = err?.response?.status;
            if (status === 503) {
                setVoiceAvailable(false);
                showOpMessage('🎙️ Interpretación por voz no disponible (IA local apagada). Capture manualmente.', 'error');
            } else {
                logger.error('Error al interpretar la intención de voz:', err);
                showOpMessage('🎙️ No se pudo interpretar el dictado. Capture manualmente.', 'error');
            }
        }
    };

    // Fase 6.5.4: el operador edita SKU, cantidad y unidad antes de confirmar.
    const handleVoiceProposalChange = (field, value) => {
        setVoiceProposal((prev) => {
            if (!prev) return prev;
            if (field === 'item_id') {
                const match = (insumos || []).find((i) => i.id === value);
                return {
                    ...prev,
                    item_id: value,
                    nombre: match ? match.nombre : value,
                    unidad: match?.unidad_base || prev.unidad,
                    sku_resuelto: Boolean(match),
                };
            }
            return { ...prev, [field]: value };
        });
    };

    const handleVoiceConfirm = () => {
        setVoiceProposal((prev) => (prev ? { ...prev, confirmado: !prev.confirmado } : prev));
    };

    /**
     * Fase 6.5.6: registra el movimiento con metodo_captura = VOZ y conserva
     * texto_original para trazabilidad. Solo si el operador confirmó.
     */
    const handleSubmitVoiceEntry = async () => {
        const { ok, error } = validateVoiceEntry(voiceTargetWH, voiceProposal);
        if (!ok) {
            showOpMessage(error, 'error');
            return;
        }
        setLoadingOp(true);
        try {
            const payload = buildVoiceEntryPayload(voiceProposal, usuarioId);
            await ejecutarOEncolar({
                ruta: `/${voiceTargetWH}/stock`,
                body: payload,
                label: `Entrada por voz (${voiceProposal.nombre})`,
                exitoMsg: `Entrada por voz registrada: ${voiceProposal.cantidad} ${voiceProposal.unidad} de ${voiceProposal.nombre}`,
            });
            resetVoiceCapture();
            setVoiceTargetWH('');
        } finally { setLoadingOp(false); }
    };

    // Helpers de movimiento
    const MOV_TYPE_META = {
        ENTRADA_COMPRA: { label: 'Entrada Compra', color: 'text-emerald-400', bg: 'bg-emerald-500/15', icon: '📥' },
        PRODUCCION_ENTRADA: { label: 'Producción', color: 'text-lime-400', bg: 'bg-lime-500/15', icon: '🏭' },
        TRASPASO_SALIDA: { label: 'Traspaso Salida', color: 'text-blue-400', bg: 'bg-blue-500/15', icon: '📤' },
        TRASPASO_ENTRADA: { label: 'Traspaso Entrada', color: 'text-blue-300', bg: 'bg-blue-400/15', icon: '📥' },
        SALIDA_VENTA: { label: 'Venta', color: 'text-purple-400', bg: 'bg-purple-500/15', icon: '🛒' },
        MERMA: { label: 'Merma', color: 'text-orange-400', bg: 'bg-orange-500/15', icon: '⚠️' },
        AJUSTE_INVENTARIO: { label: 'Ajuste', color: 'text-gray-400', bg: 'bg-gray-500/15', icon: '🔧' },
    };

    // === v8 (Fase 8.6): HANDLERS DE SUBCATEGORÍAS ===
    // La gestión vive en el backend (tabla warehouse_propositos). Los handlers
    // de tipos en memoria (handleAddType/handleRenameType) se eliminaron por
    // ser código muerto: nunca se persistían.
    const handleSaveSubcat = async () => {
        const err = validatePropositoForm(subcatForm, propositos, subcatEditing);
        if (err) { setSubcatError(err); return; }
        setSubcatError('');
        setSubcatSaving(true);
        try {
            if (subcatEditing) {
                const payload = buildPropositoCreatePayload(subcatForm);
                await axios.put(`${API_BASE}/api/v1/warehouse/subcategorias/${subcatEditing}`, payload);
                showOpMessage(`Subcategoría "${subcatForm.label}" actualizada`);
            } else {
                const payload = buildPropositoCreatePayload(subcatForm);
                await axios.post(`${API_BASE}/api/v1/warehouse/subcategorias`, payload);
                showOpMessage(`Subcategoría "${subcatForm.label}" creada`);
            }
            setSubcatEditing(null);
            setSubcatForm({ label: '', icon: '📦' });
            await fetchPropositos();
        } catch (e) {
            logger.error('Error guardando subcategoría:', e);
            const detalle = e?.response?.data?.detail;
            setSubcatError(typeof detalle === 'string' ? detalle : 'No se pudo guardar la subcategoría.');
        } finally { setSubcatSaving(false); }
    };

    const handleDeleteSubcat = (proposito) => {
        const guard = validatePropositoDelete(proposito);
        if (!guard.ok) { setSubcatError(guard.mensaje); return; }
        setSubcatError('');
        setSubcatTrasladoDestino(CODIGO_CUARENTENA);
        setSubcatDeleteDialog(proposito);
    };

    const handleConfirmDeleteSubcat = async () => {
        if (!subcatDeleteDialog) return;
        setSubcatSaving(true);
        try {
            const { codigo, almacenesCount } = subcatDeleteDialog;
            if (almacenesCount > 0) {
                const payload = buildTrasladoSubcategoriaPayload(codigo, subcatTrasladoDestino);
                await axios.post(`${API_BASE}/api/v1/warehouse/subcategorias/trasladar`, payload);
            }
            await axios.delete(`${API_BASE}/api/v1/warehouse/subcategorias/${codigo}`);
            showOpMessage(`Subcategoría "${subcatDeleteDialog.label}" eliminada`);
            setSubcatDeleteDialog(null);
            if (subCategoryTab === codigo) setSubCategoryTab(CODIGO_CUARENTENA);
            await fetchPropositos();
        } catch (e) {
            logger.error('Error eliminando subcategoría:', e);
            const detalle = e?.response?.data?.detail;
            setSubcatError(typeof detalle === 'string' ? detalle : 'No se pudo eliminar la subcategoría.');
            setSubcatDeleteDialog(null);
        } finally { setSubcatSaving(false); }
    };

    // Productos filtrados para el seleccionador (Incluye Insumos)
    const catalogProducts = useMemo(() => {
        const combined = [...REAL_PRODUCTS, ...INITIAL_SUPPLIES];
        return combined.filter(p => 
            p.name.toLowerCase().includes(pickerSearch.toLowerCase()) || 
            p.sku.toLowerCase().includes(pickerSearch.toLowerCase())
        );
    }, [pickerSearch]);

    // Mock de inventario dentro de un almacén
    const [whInventories, setWhInventories] = useState({});

    // Cargar el stock real del almacén seleccionado
    useEffect(() => {
        const loadStock = async () => {
            if (selectedWH) {
                const stockData = await fetchWarehouseStock(selectedWH.id);
                // v7 (Fase 3.2): mapeo de stock API (español) → UI (inglés)
                // delegado al módulo puro cubierto por Vitest.
                const mappedStock = mapStockListFromApi(stockData);
                setWhInventories(prev => ({ ...prev, [selectedWH.id]: mappedStock }));
            }
        };
        loadStock();
    }, [selectedWH]);

    const getWHContent = (whId) => {
        return whInventories[whId] || [];
    };

    // v9: la categoria (zona_termica) y la subcategoria (proposito) NO se
    // eligen en el modal: ya fueron elegidas por el operador al navegar
    // (zona -> pestana de subcategoria). El modal solo las muestra como
    // contexto informativo de solo lectura. Ver Fase 9.2.
    const handleOpenCreateWH = () => {
        setEditingWHData({
            name: '',
            type: selectedZone || 'SECO',
            icon: '📦',
            capacity: 100,
            proposito: subCategoryTab,
            // v10: representacion visual y pautas de acomodo.
            fotoUrl: null,
            planogramaUrl: null,
            pautasAcomodo: [],
        });
        setShowWHEditor(true);
    };

    // v10 (Fase 10.2): sube la fotografia real del almacen reutilizando el
    // endpoint /warehouse/upload-image que ya existia. El resultado se guarda
    // en `fotoUrl` y se persiste como `foto_url` al guardar el almacen.
    const handleWarehousePhotoUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const formData = new FormData();
        formData.append('file', file);
        try {
            const res = await axios.post(`${API_BASE}/api/v1/warehouse/upload-image`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            setEditingWHData(prev => ({ ...prev, fotoUrl: res.data.image_url }));
        } catch (err) {
            logger.error('Error al subir la fotografia del almacen:', err);
            showOpMessage('Error al subir la fotografia', 'error');
        }
    };

    // v10 (Fase 10.3): sube la infografia de acomodo (planograma). Mismo
    // endpoint, distinto destino: `planograma_url`.
    const handlePlanogramaUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const formData = new FormData();
        formData.append('file', file);
        try {
            const res = await axios.post(`${API_BASE}/api/v1/warehouse/upload-image`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            setEditingWHData(prev => ({ ...prev, planogramaUrl: res.data.image_url }));
        } catch (err) {
            logger.error('Error al subir la infografia de acomodo:', err);
            showOpMessage('Error al subir la infografia', 'error');
        }
    };

    // v10 (Fase 10.3): las pautas de acomodo se capturan como lineas de texto
    // (una por linea) y se persisten en la columna JSON `pautas_acomodo`.
    const handlePautasChange = (texto) => {
        const lineas = texto
            .split('\n')
            .map(l => l.trim())
            .filter(Boolean);
        setEditingWHData(prev => ({ ...prev, pautasAcomodo: lineas }));
    };

    const handleSaveWH = async (formData) => {
        try {
            if (formData.id && !formData.id.startsWith('wh_')) {
                await axios.put(`${API_BASE}/api/v1/warehouse/${formData.id}`, formData);
            } else {
                // v7 (Fase 3.2): armado del payload delegado al módulo puro
                // cubierto por Vitest.
                const payload = buildWarehouseCreatePayload(formData, selectedZone, subCategoryTab);
                await axios.post(`${API_BASE}/api/v1/warehouse`, payload);
            }
            fetchWarehouses();
            fetchPropositos();
            setShowWHEditor(false);
            setEditingWHData(null);
        } catch(e) {
            logger.error('Error guardando almacén:', e);
            showOpMessage(e.response?.data?.detail || 'Error guardando almacén', 'error');
        }
    };

    const handleDeleteWH = async (whId) => {
        try {
            await axios.delete(`${API_BASE}/api/v1/warehouse/${whId}`);
            setWarehouses(warehouses.filter(wh => wh.id !== whId));
            setWhToDelete(null);
            setSelectedWH(null);
        } catch(e) {
            logger.error('Error eliminando almacén:', e);
            showOpMessage(e.response?.data?.detail || 'Error eliminando almacén', 'error');
        }
    };

    const addItemToWH = async (product) => {
        // v7 (D5): el endpoint POST /{id}/items NO existe en el router.
        // El endpoint real es POST /{warehouse_id}/stock y espera el contrato
        // MovimientoInventarioCreate (item_id, item_type, cantidad, tipo_movimiento,
        // metodo_captura, usuario_id). Se registra un movimiento de entrada con
        // cantidad 0 para "dar de alta" el SKU en el almacén sin alterar existencias.
        const payload = {
            almacen_origen_id: null,
            almacen_destino_id: selectedWH.id,
            item_id: product.sku,
            item_type: 'PRODUCTO',
            cantidad: 0,
            tipo_movimiento: 'AJUSTE',
            metodo_captura: 'MANUAL',
            usuario_id: usuarioId,
            notas: `Alta de artículo en almacén: ${product.name}`
        };
        try {
            await axios.post(`${API_BASE}/api/v1/warehouse/${selectedWH.id}/stock`, payload);
            fetchWarehouses();
            
            const res = await axios.get(`${API_BASE}/api/v1/warehouse`);
            const updated = res.data.find(w => w.id === selectedWH.id);
            if(updated) setSelectedWH(updated);
            
            setShowItemPicker(false);
        } catch(e) {
            logger.error('Error agregando artículo:', e);
            showOpMessage(e.response?.data?.detail || 'Error agregando artículo', 'error');
        }
    };

    const handleUpdateItemInventory = (whId, sku, updatedData) => {
        // Motor de Validación de Ficha Técnica
        const validateTechnicalData = (data) => {
            const errors = [];
            if (!data.unit || data.unit.trim() === '') errors.push("Unidad de Consumo (Producción) requerida.");
            if (!data.buyUnit || data.buyUnit.trim() === '') errors.push("Unidad de Compra (Proveedor) requerida.");
            if (!data.conversionFactor || data.conversionFactor <= 0) errors.push("Factor de Conversión debe ser mayor a 0.");
            if (data.minStock === undefined || data.minStock === null || data.minStock < 0) errors.push("Stock Mínimo inválido. Debe ser 0 o mayor.");
            if (data.storageType && data.storageType !== 'SECO' && !data.optTemp) errors.push("La Temperatura Óptima es requerida para almacenes en refrigeración/congelación.");

            return errors;
        };

        const validationErrors = validateTechnicalData(updatedData);
        if (validationErrors.length > 0) {
            // v7 (D11): toast en lugar de alert() nativo (bloquea el hilo de UI).
            showOpMessage("No se puede guardar la ficha técnica. Faltan datos críticos: " + validationErrors.join(" · "), 'error');
            return;
        }

        const currentContent = getWHContent(whId);
        const newContent = currentContent.map(item => item.sku === sku ? { ...item, ...updatedData } : item);
        setWhInventories({
            ...whInventories,
            [whId]: newContent
        });
        setEditingItem(null);
    };

    const handleImageUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const formData = new FormData();
        formData.append('file', file);
        try {
            const res = await axios.post(`${API_BASE}/api/v1/warehouse/upload-image`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            setEditingItem({
                ...editingItem,
                data: { ...editingItem.data, imgUrl: res.data.image_url }
            });
        } catch(err) {
            logger.error('Error al subir imagen:', err);
            showOpMessage("Error al subir imagen", 'error');
        }
    };

    const handleRemoveItemFromWH = (whId, sku, itemName) => {
        setConfirmArchiveDialog({
            isOpen: true,
            whId: whId,
            productSku: sku,
            itemName: itemName
        });
    };

    const executeArchiveItem = () => {
        const { whId, productSku } = confirmArchiveDialog;
        const currentContent = getWHContent(whId);
        
        // Encontrar el item para mandarlo a la bóveda
        const itemToArchive = currentContent.find(item => item.sku === productSku);
        if (itemToArchive) {
            setDiscontinuedItems([...discontinuedItems, { ...itemToArchive, archivedFromWhId: whId, archiveDate: new Date().toISOString() }]);
        }

        const newContent = currentContent.filter(item => item.sku !== productSku);
        setWhInventories({
            ...whInventories,
            [whId]: newContent
        });
        
        setConfirmArchiveDialog({ isOpen: false, whId: null, productSku: null, itemName: '' });
    };

    const executeDestroyItem = () => {
        const { itemIndex } = confirmDestroyDialog;
        setDiscontinuedItems(discontinuedItems.filter((_, i) => i !== itemIndex));
        setConfirmDestroyDialog({ isOpen: false, itemIndex: null, itemName: '' });
    };

    const executeRestoreItem = () => {
        const { itemIndex, targetWhId } = restoreDialog;
        if (!targetWhId) {
            showOpMessage("Selecciona un Almacén Destino", 'error');
            return;
        }

        const currentWhContent = getWHContent(targetWhId);
        if(!currentWhContent) {
            showOpMessage("ID de Almacén inválido.", 'error');
            return;
        }

        const itemToRestore = discontinuedItems[itemIndex];
        
        // Restaurar al WH orgánico (quitando la info de archivo para limpiarlo)
        const { archivedFromWhId, archiveDate, ...cleanItem } = itemToRestore;

        setWhInventories({
            ...whInventories,
            [targetWhId]: [...currentWhContent, cleanItem]
        });
        
        // Eliminar de Bóveda
        setDiscontinuedItems(discontinuedItems.filter((_, i) => i !== itemIndex));
        setRestoreDialog({ isOpen: false, itemIndex: null, itemName: '', originalWhId: '', targetWhId: '' });
    };

    const calculateItemValue = (item) => {
        const presentation = (item.presentation || 'UNIDAD').toUpperCase();
        const costPerUnit = presentation.includes('CAJA') 
            ? (item.costPerPresentation / (item.unitsPerBox || 1)) 
            : item.costPerPresentation;
        return (item.stock * costPerUnit).toFixed(2);
    };

    const whContent = selectedWH ? getWHContent(selectedWH.id) : [];

    // Estilo base Acero Inoxidable Satinado / Cepillado Claro (Luminoso, elegante y 100% opaco)
    const INOX_CONTAINER_STYLE = {
        backgroundColor: '#4a5260',
        backgroundImage: `
            repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.04) 0px, rgba(255, 255, 255, 0.04) 1px, transparent 1px, transparent 4px),
            repeating-linear-gradient(0deg, rgba(0, 0, 0, 0.06) 0px, rgba(0, 0, 0, 0.06) 1px, transparent 1px, transparent 4px),
            radial-gradient(ellipse at 50% 12%, rgba(255, 255, 255, 0.30) 0%, transparent 65%),
            linear-gradient(135deg, #687284 0%, #505868 25%, #3e4552 50%, #5b6474 75%, #464e5c 100%)
        `,
        boxShadow: 'inset 0 0 70px rgba(0, 0, 0, 0.4)'
    };

    // --- Datos compartidos entre Landing y Suite ---
    const ZONES = [
        { key: 'SECO', label: 'ALMACENES SECOS', icon: '📦', desc: 'Harinas, azúcar, empaques, pan', cardBg: 'linear-gradient(145deg, rgba(58, 50, 40, 0.88) 0%, rgba(36, 32, 26, 0.95) 100%)', border: 'border-amber-400/50', accent: 'text-amber-300', badge: 'bg-amber-400/20 text-amber-200 border-amber-400/40', count: warehouses.filter(w => (w.zona_termica || w.type) === 'SECO').length },
        { key: 'REFRIGERADO', label: 'ALMACENES REFRIGERADOS', icon: '🧊', desc: 'Lácteos, mantequilla, cremas', cardBg: 'linear-gradient(145deg, rgba(42, 56, 78, 0.88) 0%, rgba(26, 36, 52, 0.95) 100%)', border: 'border-blue-400/50', accent: 'text-blue-300', badge: 'bg-blue-400/20 text-blue-200 border-blue-400/40', count: warehouses.filter(w => (w.zona_termica || w.type) === 'REFRIGERADO').length },
        { key: 'CONGELADO', label: 'ALMACENES CONGELADOS', icon: '❄️', desc: 'Helados, paletas, cámara fría', cardBg: 'linear-gradient(145deg, rgba(35, 62, 74, 0.88) 0%, rgba(22, 42, 50, 0.95) 100%)', border: 'border-cyan-300/50', accent: 'text-cyan-200', badge: 'bg-cyan-400/20 text-cyan-100 border-cyan-300/40', count: warehouses.filter(w => (w.zona_termica || w.type) === 'CONGELADO').length },
    ];
    const SUITE_TABS = [
        { key: 'existencias', label: 'Existencias', icon: '📊' },
        { key: 'entrada', label: 'Entrada Masiva', icon: '📥' },
        { key: 'mermas', label: 'Mermas', icon: '⚠️' },
        { key: 'traspasos', label: 'Traspasos', icon: '🔄' },
        { key: 'historial', label: 'Historial', icon: '📜' },
    ];

    // --- SUITE: Almacenes filtrados por zona + subcategoría ---
    const zoneWarehouses = selectedZone ? warehouses.filter(w => (w.zona_termica || w.type) === selectedZone) : [];
    const subCatWarehouses = zoneWarehouses.filter(w => (w.proposito || 'EXHIBICION_VENTA') === subCategoryTab);

    // v8 (Fase 8.6): la barra se alimenta de la BD. `propositosParaBarra`
    // excluye la cuarentena SIN_CLASIFICAR (decisión vinculante §10.2).
    const subCategoriasBarra = propositosParaBarra(propositos);

    // v11 (Fase 11.3, Deuda 3): vigilancia visible de la cuarentena.
    // `sinAlmacenCount` alimenta el badge rojo; `sinAlmacenAgrupado` alimenta
    // el panel de diagnostico (una fila por SKU, no por intento).
    const sinAlmacenCount = contarEventosSinAlmacen(eventosSinAlmacen);
    const sinAlmacenAgrupado = agruparEventosSinAlmacenPorSku(eventosSinAlmacen);
    const ZONE_META = {
        SECO: { icon: '📦', accent: 'text-amber-300', label: 'SECOS', badge: 'bg-amber-400/20 text-amber-200 border-amber-400/40' },
        REFRIGERADO: { icon: '🧊', accent: 'text-blue-300', label: 'REFRIGERADOS', badge: 'bg-blue-400/20 text-blue-200 border-blue-400/40' },
        CONGELADO: { icon: '❄️', accent: 'text-cyan-200', label: 'CONGELADOS', badge: 'bg-cyan-400/20 text-cyan-100 border-cyan-300/40' }
    };
    const zoneMeta = ZONE_META[selectedZone] || ZONE_META.SECO;

    // v9 (Fase 9.2): contexto informativo del modal de almacén.
    // Al CREAR se refleja la navegación (zona + pestaña de subcategoría).
    // Al EDITAR se reflejan los valores reales del almacén, no la navegación.
    const categoriaInfo = (() => {
        const codigo = editingWHData?.id
            ? (editingWHData.zona_termica || editingWHData.type)
            : (selectedZone || editingWHData?.type);
        const meta = ZONE_META[codigo] || ZONE_META.SECO;
        return { icon: meta.icon, label: meta.label };
    })();
    const subcategoriaInfo = (() => {
        const codigo = editingWHData?.id
            ? editingWHData.proposito
            : (subCategoryTab || editingWHData?.proposito);
        const found = propositos.find(p => p.codigo === codigo);
        return {
            icon: found?.icon || '📦',
            label: found?.label || codigo || 'SIN CLASIFICAR',
        };
    })();

    return (
        <div className="w-full min-h-screen text-white p-8 font-sans" style={INOX_CONTAINER_STYLE}>

            {/* === v7 (Fase 4.4): INDICADOR DE ESTADO DE RED ===
                Incidente 16.1: PROHIBIDO animate-pulse u otras animaciones de
                bucle infinito. Solo `animate-in` de montaje único para evitar
                el efecto estrobo en el operador. */}
            <div className="fixed top-4 right-4 z-[60] flex flex-col items-end gap-2 pointer-events-none">
                <div
                    className={`animate-in fade-in slide-in-from-top-2 duration-300 flex items-center gap-2 px-3 py-1.5 rounded-full border text-[10px] font-black uppercase tracking-widest backdrop-blur-md shadow-lg ${
                        isOnline
                            ? 'bg-emerald-950/70 border-emerald-500/40 text-emerald-300'
                            : 'bg-amber-950/80 border-amber-500/50 text-amber-300'
                    }`}
                >
                    <span
                        className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-400' : 'bg-amber-400'}`}
                        aria-hidden="true"
                    />
                    {isOnline ? 'En línea' : 'Sin conexión'}
                    {pendingOps > 0 && (
                        <span className="ml-1 px-1.5 py-0.5 rounded-full bg-black/40 border border-white/10">
                            {pendingOps} en cola
                        </span>
                    )}
                </div>
                {syncNotice && (
                    <div
                        className={`animate-in fade-in slide-in-from-top-2 duration-300 px-3 py-1.5 rounded-xl border text-[10px] font-bold backdrop-blur-md shadow-lg max-w-[260px] text-right ${
                            syncNotice.type === 'success'
                                ? 'bg-emerald-950/70 border-emerald-500/40 text-emerald-200'
                                : 'bg-rose-950/80 border-rose-500/50 text-rose-200'
                        }`}
                    >
                        {syncNotice.text}
                    </div>
                )}
            </div>

            {/* === HEADER CONDICIONAL === */}
            {!selectedZone ? (
                <div className="text-center mb-10 pt-8">
                    <h1 className="text-5xl font-black uppercase italic tracking-tighter bg-gradient-to-r from-white via-slate-100 to-slate-200 bg-clip-text text-transparent drop-shadow-[0_4px_12px_rgba(0,0,0,0.5)]">
                        GESTIÓN DE ALMACENES
                    </h1>
                    <div className="mt-4">
                        <span className="inline-block px-4 py-1.5 rounded-full bg-slate-900/40 border border-slate-300/40 text-[10px] font-black uppercase tracking-[0.3em] text-slate-100 shadow-sm backdrop-blur-md">
                            CENTRO LOGÍSTICO DE INVENTARIOS | R DE RICO
                        </span>
                    </div>
                    <p className="text-slate-200 text-sm mt-4 font-bold drop-shadow-sm">{warehouses.length} almacenes registrados</p>
                </div>
            ) : (
                <div className="mb-8 flex items-center gap-5">
                    <button
                        onClick={() => { setSelectedZone(null); setSelectedWH(null); }}
                        className="flex items-center gap-2 text-slate-200 hover:text-white transition-colors text-sm font-bold bg-slate-900/50 hover:bg-slate-800/80 px-4 py-2 rounded-xl border border-slate-400/40 shadow-sm backdrop-blur-md"
                    >
                        <span className="text-xl">←</span> Volver
                    </button>
                    <div>
                        <h1 className="text-6xl md:text-7xl font-black uppercase italic tracking-tighter bg-gradient-to-r from-white via-slate-100 to-slate-300 bg-clip-text text-transparent drop-shadow-lg">
                            Almacenes {zoneMeta.label}
                        </h1>
                    </div>
                </div>
            )}

            {/* === LANDING: Barra Operativa + Tarjetas de Zona === */}
            {!selectedZone && (
                <div className="max-w-5xl mx-auto">
                    <div className="mb-6 flex items-center gap-1 bg-slate-900/60 border border-slate-500/30 rounded-2xl p-1.5 backdrop-blur-md shadow-inner overflow-x-auto">
                        {SUITE_TABS.map(tab => (
                            <button
                                key={tab.key}
                                onClick={() => { setSuiteTab(tab.key); setSelectedWH(null); }}
                                className={`flex items-center gap-2 px-5 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${
                                    suiteTab === tab.key
                                        ? 'bg-slate-700/80 text-white shadow-md border border-slate-400/30'
                                        : 'text-slate-300 hover:text-white hover:bg-slate-800/50'
                                }`}
                            >
                                <span className="text-sm">{tab.icon}</span>
                                {tab.label}
                            </button>
                        ))}
                    </div>
                    {suiteTab === 'existencias' && (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                            {ZONES.map(zone => (
                                <button
                                    key={zone.key}
                                    onClick={() => setSelectedZone(zone.key)}
                                    style={{ background: zone.cardBg, boxShadow: '0 16px 36px -8px rgba(0, 0, 0, 0.5), inset 0 1px 2px 0 rgba(255, 255, 255, 0.4), inset 0 -2px 6px 0 rgba(0, 0, 0, 0.4)', backdropFilter: 'blur(12px)' }}
                                    className={`group relative border ${zone.border} rounded-[32px] p-10 text-left transition-all duration-300 hover:scale-[1.03] hover:shadow-2xl active:scale-[0.98]`}
                                >
                                    <div className="text-6xl mb-6 group-hover:scale-110 transition-transform duration-300 filter drop-shadow-md">{zone.icon}</div>
                                    <h2 className={`text-xl font-black uppercase tracking-tight ${zone.accent} drop-shadow-sm`}>{zone.label}</h2>
                                    <p className="text-slate-200 text-xs mt-2 font-medium leading-relaxed">{zone.desc}</p>
                                    <div className="mt-8 flex items-center justify-between pt-4 border-t border-white/20">
                                        <span className={`text-4xl font-black ${zone.accent} drop-shadow-sm`}>{zone.count}</span>
                                        <span className="text-slate-300 text-[10px] font-black uppercase tracking-widest group-hover:text-white transition-colors">ALMACENES →</span>
                                    </div>
                                    <div className={`absolute inset-0 rounded-[32px] border-2 ${zone.border} opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none`} />
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}
            
            {/* Modal: Seleccionador de Productos del Catálogo */}
            {selectedZone && showItemPicker && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 animate-in fade-in duration-300">
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setShowItemPicker(false)} />
                    <div className="relative w-full max-w-4xl bg-[#0a0a0a] border border-gray-800 rounded-[40px] shadow-2xl flex flex-col max-h-[80vh] overflow-hidden">
                        <header className="p-8 border-b border-gray-800">
                            <div className="flex justify-between items-center mb-6">
                                <div>
                                    <h3 className="text-2xl font-black uppercase italic tracking-tighter text-[#c1d72e]">Vincular Producto del Catálogo</h3>
                                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mt-1">Solo puedes agregar artículos autorizados a este almacén de PT</p>
                                </div>
                                <button onClick={() => setShowItemPicker(false)} className="text-gray-500 hover:text-white text-2xl">✕</button>
                            </div>
                            <input 
                                type="text" 
                                placeholder="Buscar en el catálogo maestro por nombre o SKU..."
                                className="w-full bg-black/60 border border-gray-800 p-4 rounded-2xl outline-none focus:border-[#c1d72e] font-bold"
                                value={pickerSearch}
                                onChange={(e) => setPickerSearch(e.target.value)}
                                autoFocus
                            />
                        </header>
                        <div className="flex-1 overflow-y-auto p-4 grid grid-cols-1 md:grid-cols-2 gap-3 custom-scrollbar">
                            {catalogProducts.slice(0, 50).map(p => (
                                <div 
                                    key={p.sku}
                                    onClick={() => addItemToWH(p)}
                                    className="bg-gray-900/40 border border-gray-800 p-4 rounded-2xl hover:border-[#c1d72e] hover:bg-indigo-600/10 cursor-pointer transition-all flex items-center gap-4 group"
                                >
                                    <div className="w-12 h-12 bg-black/40 rounded-xl flex items-center justify-center text-xl">🥖</div>
                                    <div className="flex-1">
                                        <p className="text-xs font-black uppercase italic group-hover:text-[#c1d72e]">{p.name}</p>
                                        <div className="flex justify-between mt-1">
                                            <span className="text-[8px] font-black text-gray-600 uppercase tracking-widest">{p.category}</span>
                                            <span className="text-[9px] font-mono text-indigo-400">{p.sku}</span>
                                        </div>
                                    </div>
                                    <span className="text-indigo-500 font-black text-lg opacity-0 group-hover:opacity-100">+</span>
                                </div>
                            ))}
                            {catalogProducts.length === 0 && (
                                <div className="col-span-full py-20 text-center">
                                    <p className="text-gray-500 font-black uppercase tracking-widest text-xs mb-4">No se encontró el artículo en el catálogo</p>
                                    <button 
                                        onClick={() => addItemToWH({ 
                                            sku: `MAN-${Date.now()}`, 
                                            name: pickerSearch.toUpperCase() || 'NUEVO ARTÍCULO', 
                                            unit: 'PZA', 
                                            price: 0, 
                                            category: 'MANUAL' 
                                        })}
                                        className="bg-indigo-600 px-8 py-4 rounded-xl text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-all"
                                    >
                                        + Crear Entrada Manual
                                    </button>
                                </div>
                            )}
                        </div>
                        <footer className="p-8 border-t border-gray-800 bg-black/20 flex justify-between items-center text-[9px] font-black uppercase text-gray-500 tracking-widest">
                            <span>Buscando en {catalogProducts.length} artículos del sistema</span>
                            <button 
                                onClick={() => addItemToWH({ 
                                    sku: `MAN-${Date.now()}`, 
                                    name: 'ARTÍCULO SIN CATALOGAR', 
                                    unit: 'PZA', 
                                    price: 0, 
                                    category: 'MANUAL' 
                                })}
                                className="text-indigo-400 hover:text-white transition-colors"
                            >
                                ¿No está en la lista? Ingreso Manual
                            </button>
                        </footer>
                    </div>
                </div>
            )}

            {/* === v8 (Fase 8.6): BARRA DE SUBCATEGORÍAS + ENGRANE ===
                La barra se alimenta de la BD (warehouse_propositos). El engrane
                vive aquí, junto a la barra que realmente controla (decisión §10).
                `propositosParaBarra` excluye la cuarentena SIN_CLASIFICAR. */}
            {selectedZone && suiteTab === 'existencias' && (
            <div className="mb-4 flex items-center gap-2">
                <div className="bg-slate-900/50 border border-slate-500/30 rounded-2xl p-1.5 flex gap-1 w-max backdrop-blur-md overflow-x-auto custom-scrollbar no-scrollbar">
                    {subCategoriasBarra.map(sc => (
                        <button
                            key={sc.codigo}
                            onClick={() => setSubCategoryTab(sc.codigo)}
                            className={`flex items-center gap-2 px-5 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${
                                subCategoryTab === sc.codigo
                                    ? 'bg-slate-700/80 text-white shadow-md border border-slate-400/30'
                                    : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                            }`}
                        >
                            <span className="text-sm">{sc.icon}</span>
                            {sc.label}
                        </button>
                    ))}
                    {subCategoriasBarra.length === 0 && (
                        <span className="px-5 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500">
                            Sin subcategorías
                        </span>
                    )}
                    {/* v11 (Fase 11.3, Deuda 3): CUARENTENA VISIBLE.
                        La barra excluye SIN_CLASIFICAR (decisión vinculante §10.2),
                        pero la cuarentena NO puede quedar invisible: si hay SKUs
                        huerfanos, se muestra un acceso directo con badge rojo.
                        El badge NO usa animate-pulse (Incidente 16.1: prohibido
                        el bucle infinito de animaciones). */}
                    {sinAlmacenCount > 0 && (
                        <button
                            onClick={() => setShowSinAlmacenPanel(true)}
                            className="flex items-center gap-2 px-5 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap bg-red-900/40 text-red-200 border border-red-500/40 hover:bg-red-800/50"
                            title="SKUs que no se pudieron descontar del stock"
                        >
                            <span className="text-sm">🚨</span>
                            Cuarentena
                            <span className="ml-1 px-2 py-0.5 bg-red-500 text-white text-[10px] font-black rounded-full">
                                {sinAlmacenCount}
                            </span>
                        </button>
                    )}
                </div>
                <button
                    onClick={() => { setSubcatError(''); setSubcatEditing(null); setSubcatForm({ label: '', icon: '📦' }); setShowSubcatManager(true); }}
                    className="w-12 h-12 shrink-0 bg-slate-800/80 border border-slate-500/30 rounded-2xl flex items-center justify-center hover:border-slate-300 transition-all text-xs"
                    title="Gestionar Subcategorías"
                >
                    ⚙️
                </button>
            </div>
            )}

            {/* Toast de operación */}
            {opMessage.text && (
                <div className={`mb-4 px-6 py-3 rounded-xl font-bold text-sm border backdrop-blur-md transition-all animate-in fade-in slide-in-from-top-2 duration-300 ${
                    opMessage.type === 'error' 
                        ? 'bg-red-900/60 border-red-500/40 text-red-200' 
                        : 'bg-emerald-900/60 border-emerald-500/40 text-emerald-200'
                }`}>
                    {opMessage.text}
                </div>
            )}

            {/* ===== PESTAÑA: EXISTENCIAS (contenido original) ===== */}
            {suiteTab === 'existencias' && selectedZone && (
                <>
            {/* Header y Filtros */}
            {!selectedWH ? (
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {subCatWarehouses.map(wh => {
                            const fillPercent = (wh.current / wh.capacity) * 100;
                            const subcatInfo = propositos.find(p => p.codigo === wh.proposito);

                            return (
                                <div 
                                    key={wh.id}
                                    onClick={() => setSelectedWH(wh)}
                                    className={`group relative bg-slate-900/50 border border-slate-500/25 p-8 rounded-[40px] hover:bg-slate-800/60 transition-all cursor-pointer overflow-hidden`}
                                >
                                    <div className="flex justify-between items-start mb-6">
                                        {/* v10 (Fase 10.5): la fotografia real tiene prioridad
                                            visual sobre el icono. Si no hay foto, se cae al
                                            emoji de la zona termica (comportamiento previo). */}
                                        {wh.fotoUrl ? (
                                            <img
                                                src={wh.fotoUrl}
                                                alt={wh.name}
                                                className="w-20 h-20 rounded-2xl object-cover border border-slate-500/25 group-hover:scale-105 transition-transform duration-500"
                                            />
                                        ) : (
                                            <span className="text-5xl group-hover:scale-110 transition-transform duration-500">{wh.icon}</span>
                                        )}
                                        <span className="text-[8px] font-black uppercase px-3 py-1 rounded-full bg-slate-500/10 text-slate-300 tracking-widest">
                                            {subcatInfo ? `${subcatInfo.icon} ${subcatInfo.label}` : (wh.proposito || 'Sin clasificar')}
                                        </span>
                                    </div>

                                    <h3 className="text-xl font-black uppercase italic tracking-tighter mb-2 group-hover:text-slate-100 transition-colors">
                                        {wh.name}
                                    </h3>
                                    
                                    <div className="mt-8 space-y-2">
                                        <div className="flex justify-between text-[9px] font-black uppercase text-slate-400">
                                            <span>Ocupación</span>
                                            <span className={fillPercent > 90 ? 'text-red-400' : 'text-white'}>{wh.current} / {wh.capacity}</span>
                                        </div>
                                        <div className="h-2 bg-black/40 rounded-full overflow-hidden">
                                            <div 
                                                className={`h-full transition-all duration-1000 ${fillPercent > 90 ? 'bg-red-500' : 'bg-slate-400'}`} 
                                                style={{ width: `${fillPercent}%` }}
                                            />
                                        </div>
                                    </div>

                                    <div className="absolute -bottom-4 -right-4 text-8xl opacity-[0.03] group-hover:opacity-[0.07] transition-opacity pointer-events-none">
                                        {wh.icon}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            ) : (
                /* Vista Detalle: Dentro del Almacén */
                <div className="animate-in slide-in-from-right-8 duration-500 flex flex-col h-full bg-slate-900/50 rounded-[48px] border border-slate-500/25 overflow-hidden">
                    <header className="p-10 border-b border-slate-600/30 flex justify-between items-center bg-slate-900/30">
                        <div className="flex items-center gap-6">
                            <button 
                                onClick={() => setSelectedWH(null)}
                                className="w-12 h-12 rounded-2xl bg-slate-700 flex items-center justify-center hover:bg-slate-600 transition-all group"
                            >
                                <span className="text-xl group-hover:scale-125 transition-transform">←</span>
                            </button>
                            <div>
                                <div className="flex items-center gap-3 mb-1">
                                    {/* v10 (Fase 10.5): foto real con fallback al icono. */}
                                    {selectedWH.fotoUrl ? (
                                        <img
                                            src={selectedWH.fotoUrl}
                                            alt={selectedWH.name}
                                            className="w-14 h-14 rounded-2xl object-cover border border-slate-500/25"
                                        />
                                    ) : (
                                        <span className="text-3xl">{selectedWH.icon}</span>
                                    )}
                                    <h2 className="text-2xl font-black uppercase italic tracking-tighter">{selectedWH.name}</h2>
                                    <span className="text-[8px] font-black uppercase px-2 py-0.5 rounded bg-slate-500/10 text-slate-300">
                                        {propositos.find(p => p.codigo === selectedWH.proposito)?.label || selectedWH.proposito || 'Sin clasificar'}
                                    </span>
                                </div>
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Explorando contenido y existencias</p>
                            </div>
                        </div>
                        <div className="flex gap-4">
                            <button
                                onClick={() => {
                                    // v10: normalizamos los campos visuales para que
                                    // el modal nunca reciba undefined (un almacen
                                    // creado antes de v10 no tiene estos valores).
                                    setEditingWHData({
                                        ...selectedWH,
                                        fotoUrl: selectedWH.fotoUrl || null,
                                        planogramaUrl: selectedWH.planogramaUrl || null,
                                        pautasAcomodo: Array.isArray(selectedWH.pautasAcomodo)
                                            ? selectedWH.pautasAcomodo
                                            : [],
                                    });
                                    setShowWHEditor(true);
                                }}
                                className="bg-slate-700 h-14 px-8 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-600 transition-all"
                            >
                                Editar Almacén
                            </button>
                            <button 
                                onClick={() => setWhToDelete(selectedWH)}
                                className="bg-red-600/20 border border-red-500/30 h-14 w-14 rounded-2xl flex items-center justify-center text-red-500 hover:bg-red-600 hover:text-white transition-all"
                                title="Eliminar Almacén"
                            >
                                🗑️
                            </button>
                            <button 
                                onClick={() => setShowDiscontinuedVault(true)}
                                className="bg-orange-600/20 border border-orange-500/30 px-6 h-14 rounded-2xl flex items-center justify-center text-orange-400 hover:bg-orange-600 hover:text-white transition-all font-black text-[10px] uppercase tracking-widest"
                                title="Ver Bóveda de Descontinuados"
                            >
                                📦⬇️ Bóveda ({discontinuedItems.length})
                            </button>
                            {(selectedWH.type === 'EXHIBIDOR_PAN_DULCE' || selectedWH.type === 'EXHIBIDOR_PAN_BLANCO') && (
                                <button 
                                    onClick={() => setShowAiScanner(true)}
                                    className="bg-pink-600 h-14 px-8 rounded-2xl text-[10px] font-black uppercase tracking-widest text-white hover:scale-105 active:scale-95 transition-all shadow-xl shadow-pink-600/20 flex items-center gap-2"
                                >
                                    <span>👁️</span> Escáner IA
                                </button>
                            )}
                            <button 
                                onClick={() => setShowItemPicker(true)}
                                className="bg-[#c1d72e] h-14 px-8 rounded-2xl text-[10px] font-black uppercase tracking-widest text-black hover:scale-105 active:scale-95 transition-all"
                            >
                                + Seleccionar Colección / Catálogo
                            </button>
                        </div>
                    </header>

                    <div className="flex-1 overflow-y-auto p-10 custom-scrollbar">
                        <table className="w-full text-left border-separate border-spacing-y-4">
                            <thead>
                                <tr className="text-[9px] font-black uppercase text-slate-400 tracking-[0.2em]">
                                    <th className="px-6 pb-2">Imagen</th>
                                    <th className="px-6 pb-2">Artículo</th>
                                    <th className="px-6 pb-2">SKU</th>
                                    <th className="px-6 pb-2">Existencias</th>
                                    <th className="px-6 pb-2">Presentación</th>
                                    <th className="px-6 pb-2">Costo (x Pres)</th>
                                    <th className="px-6 pb-2">Valor Total</th>
                                    <th className="px-6 pb-2">Proveedor</th>
                                    <th className="px-6 pb-2">Logística</th>
                                </tr>
                            </thead>
                            <tbody>
                                {whContent.map(item => (
                                    <tr key={item.sku} className="bg-slate-900/40 hover:bg-slate-800/60 transition-all group rounded-2xl overflow-hidden">
                                        <td className="px-6 py-4 rounded-l-3xl">
                                            <div className="w-12 h-12 bg-slate-800/60 border border-slate-600/30 rounded-xl flex items-center justify-center text-xl overflow-hidden shadow-inner uppercase">
                                                {item.imgUrl ? <img src={item.imgUrl} alt={item.name} className="w-full h-full object-cover" /> : '📦'}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <p className="text-sm font-black uppercase italic">{item.name}</p>
                                            <p className="text-[8px] text-slate-400 font-black uppercase">{item.category}</p>
                                        </td>
                                        <td className="px-6 py-4 font-mono text-[10px] text-slate-400">{item.sku}</td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col gap-1">
                                                <div className="flex items-center gap-2">
                                                    <span className={`text-sm font-bold ${item.stock <= (item.minStock || 0) ? 'text-red-500' : 'text-white'}`}>{item.stock}</span>
                                                    <span className="text-[9px] font-black text-slate-500 uppercase">{item.unit}</span>
                                                </div>
                                                {item.stock <= (item.minStock || 0) && (
                                                    <span className="text-[7px] font-black text-red-600 uppercase tracking-widest whitespace-nowrap bg-red-500/10 px-1 py-0.5 rounded border border-red-500/20 w-max">⚠️ CRÍTICO ({item.minStock})</span>
                                                )}
                                                {(item.alertDays > 0) && (
                                                    <span className="text-[7px] font-black text-pink-500 uppercase tracking-widest whitespace-nowrap bg-pink-500/10 px-1 py-0.5 rounded border border-pink-500/20 w-max">⏳ REVISAR CADUCIDAD</span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400`}>
                                                {item.presentation}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 font-mono text-sm text-emerald-400 font-bold">${item.costPerPresentation}</td>
                                        <td className="px-6 py-4 font-mono text-sm text-[#c1d72e] font-black">${calculateItemValue(item)}</td>
                                        <td className="px-6 py-4 text-[10px] font-bold text-slate-300">{item.provider}</td>
                                        <td className="px-6 py-4 rounded-r-3xl">
                                            <div className="flex gap-2">
                                                <button 
                                                    onClick={() => setEditingItem({ whId: selectedWH.id, productSku: item.sku, data: { ...item } })}
                                                    className="text-[9px] font-black uppercase text-indigo-400 hover:text-white transition-colors bg-indigo-500/10 px-3 py-2 rounded-lg border border-indigo-500/20 hover:bg-indigo-600/20"
                                                >
                                                    📝 Editar
                                                </button>
                                                <button 
                                                    onClick={() => handleRemoveItemFromWH(selectedWH.id, item.sku, item.name)}
                                                    className="text-[9px] font-black uppercase text-orange-500 hover:text-white transition-colors bg-orange-500/10 px-3 py-2 rounded-lg border border-orange-500/20 hover:bg-orange-600/20"
                                                    title="Archivar en la Bóveda"
                                                >
                                                    📦⬇️
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* v9 (Fase 9.1): botón flotante de creación de almacén.
                Se monta vía Portal en document.body para que el `fixed` no
                quede atrapado por el contexto de apilamiento ni por el
                `overflow-hidden` de los contenedores ancestros (mismo patrón
                ya probado en ProductCatalogUI). Solo visible en la vista de
                lista: al entrar al detalle de un almacén desaparece. */}
            {!selectedWH && ReactDOM.createPortal(
                <button
                    onClick={handleOpenCreateWH}
                    className="fixed bottom-10 right-10 z-[1000] bg-slate-600 text-white px-8 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-[0_20px_40px_-10px_rgba(0,0,0,0.5),0_0_20px_rgba(100,116,139,0.3)] border border-slate-400/20"
                >
                    + Nuevo Almacén
                </button>,
                document.body
            )}
                </>
            )}

            {/* ===== PESTAÑA: ENTRADA MASIVA ===== */}
            {suiteTab === 'entrada' && (
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="bg-slate-900/50 border border-slate-500/25 rounded-[32px] p-8">
                        <h2 className="text-2xl font-black uppercase italic tracking-tighter mb-1 bg-gradient-to-r from-emerald-300 to-emerald-500 bg-clip-text text-transparent">📥 Entrada Masiva de Mercancía</h2>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-8">Registra lotes completos de insumos recibidos de proveedores</p>

                        {/* Selector de almacén destino */}
                        <div className="mb-6">
                            <label className="text-[9px] font-black uppercase text-slate-400 mb-2 block tracking-widest">Almacén Destino</label>
                            <select 
                                value={bulkTargetWH}
                                onChange={(e) => setBulkTargetWH(e.target.value)}
                                className="w-full max-w-md bg-slate-800/80 border border-slate-500/30 p-4 rounded-2xl font-bold text-sm outline-none focus:border-emerald-400 appearance-none text-white"
                            >
                                <option value="">Selecciona un almacén...</option>
                                {selectedZone ? (
                                    warehouses.filter(w => (w.zona_termica || w.type) === selectedZone).map(wh => (
                                        <option key={wh.id} value={wh.id}>{wh.icon} {wh.name}</option>
                                    ))
                                ) : (
                                    ZONES.map(zone => (
                                        <optgroup key={zone.key} label={`${zone.icon} ${zone.label}`}>
                                            {warehouses.filter(w => (w.zona_termica || w.type) === zone.key).map(wh => (
                                                <option key={wh.id} value={wh.id}>{wh.name}</option>
                                            ))}
                                        </optgroup>
                                    ))
                                )}
                            </select>
                        </div>

                        {/* Buscador de insumos */}
                        <div className="mb-6">
                            <label className="text-[9px] font-black uppercase text-slate-400 mb-2 block tracking-widest">Agregar Insumo al Lote</label>
                            <input 
                                type="text"
                                placeholder="Buscar insumo por nombre..."
                                className="w-full max-w-md bg-slate-800/80 border border-slate-500/30 p-4 rounded-2xl font-bold text-sm outline-none focus:border-emerald-400 text-white placeholder-slate-400"
                                value={bulkInsumoSearch}
                                onChange={(e) => setBulkInsumoSearch(e.target.value)}
                            />
                            {bulkInsumoSearch && (
                                <div className="mt-2 max-w-md bg-slate-800 border border-slate-600/40 rounded-xl overflow-hidden max-h-48 overflow-y-auto shadow-xl">
                                    {insumos.filter(i => (i.nombre || '').toLowerCase().includes(bulkInsumoSearch.toLowerCase())).map(ins => (
                                        <button
                                            key={ins.id}
                                            onClick={() => addBulkItem(ins)}
                                            className="w-full text-left px-4 py-3 hover:bg-emerald-600/20 transition-colors flex justify-between items-center border-b border-slate-700/50"
                                        >
                                            <span className="text-sm font-bold text-white">{ins.nombre}</span>
                                            <span className="text-[9px] text-slate-400 uppercase">{ins.unidad_base}</span>
                                        </button>
                                    ))}
                                    {insumos.filter(i => (i.nombre || '').toLowerCase().includes(bulkInsumoSearch.toLowerCase())).length === 0 && (
                                        <p className="px-4 py-3 text-slate-500 text-sm">No se encontraron insumos</p>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Tabla de items en el lote */}
                        {bulkEntryItems.length > 0 && (
                            <div className="mb-6">
                                <label className="text-[9px] font-black uppercase text-slate-400 mb-3 block tracking-widest">Items en el Lote ({bulkEntryItems.length})</label>
                                <div className="space-y-3">
                                    {bulkEntryItems.map((item, idx) => (
                                        <div key={idx} className="flex items-center gap-4 bg-slate-800/60 border border-slate-600/30 rounded-xl p-4">
                                            <span className="text-sm font-bold text-white flex-1">{item.nombre}</span>
                                            <input
                                                type="number"
                                                placeholder="Cantidad"
                                                value={item.cantidad}
                                                onChange={(e) => updateBulkItem(idx, 'cantidad', e.target.value)}
                                                className="w-28 bg-slate-900/80 border border-slate-500/30 p-2 rounded-lg text-sm font-mono text-center outline-none focus:border-emerald-400 text-white"
                                            />
                                            <span className="text-[9px] font-black text-slate-400 uppercase w-12">{item.unidad}</span>
                                            <input
                                                type="text"
                                                placeholder="Notas (opcional)"
                                                value={item.notas}
                                                onChange={(e) => updateBulkItem(idx, 'notas', e.target.value)}
                                                className="flex-1 bg-slate-900/80 border border-slate-500/30 p-2 rounded-lg text-sm outline-none focus:border-emerald-400 text-white placeholder-slate-500"
                                            />
                                            <button onClick={() => removeBulkItem(idx)} className="text-red-400 hover:text-red-300 text-lg">✕</button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <button
                            onClick={handleSubmitBulkEntry}
                            disabled={loadingOp || bulkEntryItems.length === 0}
                            className="bg-emerald-600 text-white px-8 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-500 hover:scale-105 active:scale-95 transition-all shadow-lg shadow-emerald-600/20 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loadingOp ? '⏳ Procesando...' : `📥 Registrar Entrada (${bulkEntryItems.length} items)`}
                        </button>
                    </div>

                    {/* ===== v7 (Fase 6.3): ESCÁNER IA DE VISIÓN ===== */}
                    <div className="mt-6 bg-slate-900/50 border border-cyan-500/25 rounded-[32px] p-8">
                        <h2 className="text-2xl font-black uppercase italic tracking-tighter mb-1 bg-gradient-to-r from-cyan-300 to-cyan-500 bg-clip-text text-transparent">📷 Escanear Charola (IA)</h2>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">La IA propone cantidades · tú confirmas antes de registrar</p>
                        <p className="text-[10px] font-bold text-cyan-300/80 uppercase tracking-widest mb-8">🔒 Regla human-in-the-loop: nunca se registra stock sin tu confirmación</p>

                        {/* Input oculto: cámara trasera en móvil, selector en escritorio */}
                        <input
                            ref={visionFileRef}
                            type="file"
                            accept="image/*"
                            capture="environment"
                            onChange={handleVisionFileChange}
                            className="hidden"
                        />

                        {/* Selector de almacén destino */}
                        <div className="mb-6">
                            <label className="text-[9px] font-black uppercase text-slate-400 mb-2 block tracking-widest">Almacén Destino</label>
                            <select
                                value={visionTargetWH}
                                onChange={(e) => setVisionTargetWH(e.target.value)}
                                className="w-full max-w-md bg-slate-800/80 border border-slate-500/30 p-4 rounded-2xl font-bold text-sm outline-none focus:border-cyan-400 appearance-none text-white"
                            >
                                <option value="">Selecciona un almacén...</option>
                                {warehouses.map(wh => (
                                    <option key={wh.id} value={wh.id}>{wh.icon} {wh.name}</option>
                                ))}
                            </select>
                        </div>

                        {/* Botón de captura */}
                        <button
                            onClick={handleVisionCapture}
                            disabled={visionScanning}
                            className="bg-cyan-600 text-white px-8 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-cyan-500 hover:scale-105 active:scale-95 transition-all shadow-lg shadow-cyan-600/20 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {visionScanning ? '⏳ Analizando imagen...' : '📷 Escanear Charola'}
                        </button>

                        {/* Vista previa de la captura */}
                        {visionPreview && (
                            <div className="mt-6">
                                <label className="text-[9px] font-black uppercase text-slate-400 mb-2 block tracking-widest">Vista Previa</label>
                                <img
                                    src={visionPreview}
                                    alt="Captura de charola"
                                    className="max-w-xs rounded-2xl border border-cyan-500/30 shadow-lg"
                                />
                            </div>
                        )}

                        {/* Panel de confirmación human-in-the-loop */}
                        {visionProposals.length > 0 && (
                            <div className="mt-8">
                                <label className="text-[9px] font-black uppercase text-cyan-300 mb-3 block tracking-widest">
                                    Propuestas de la IA ({visionProposals.filter(p => p.confirmado).length}/{visionProposals.length} confirmadas)
                                </label>
                                <div className="space-y-3">
                                    {visionProposals.map((p, idx) => (
                                        <div
                                            key={idx}
                                            className={`flex items-center gap-4 border rounded-xl p-4 transition-colors ${p.confirmado ? 'bg-cyan-900/30 border-cyan-400/50' : 'bg-slate-800/60 border-slate-600/30'}`}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={!!p.confirmado}
                                                onChange={() => handleVisionConfirm(idx)}
                                                className="w-5 h-5 accent-cyan-500 cursor-pointer"
                                                title="Confirmar esta línea"
                                            />
                                            <div className="flex-1">
                                                <span className="text-sm font-bold text-white block">{p.nombre}</span>
                                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                                                    Confianza IA: {Math.round((p.confianza || 0) * 100)}%
                                                </span>
                                            </div>
                                            <input
                                                type="number"
                                                min="0"
                                                step="any"
                                                value={p.cantidad}
                                                onChange={(e) => handleVisionQtyChange(idx, e.target.value)}
                                                className="w-28 bg-slate-900/80 border border-slate-500/30 p-2 rounded-lg text-sm font-mono text-center outline-none focus:border-cyan-400 text-white"
                                            />
                                            <span className="text-[9px] font-black text-slate-400 uppercase w-12">{p.unidad}</span>
                                            <button
                                                onClick={() => handleVisionDiscard(idx)}
                                                className="text-red-400 hover:text-red-300 text-lg"
                                                title="Descartar propuesta"
                                            >✕</button>
                                        </div>
                                    ))}
                                </div>

                                <div className="flex items-center gap-4 mt-6">
                                    <button
                                        onClick={handleSubmitVisionEntry}
                                        disabled={loadingOp || visionProposals.filter(p => p.confirmado && Number(p.cantidad) > 0).length === 0}
                                        className="bg-cyan-600 text-white px-8 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-cyan-500 hover:scale-105 active:scale-95 transition-all shadow-lg shadow-cyan-600/20 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {loadingOp ? '⏳ Procesando...' : `✅ Registrar Confirmadas (${visionProposals.filter(p => p.confirmado && Number(p.cantidad) > 0).length})`}
                                    </button>
                                    <button
                                        onClick={resetVisionScanner}
                                        className="text-slate-400 hover:text-white px-6 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-colors"
                                    >
                                        Descartar todo
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* v7 (Fase 6.5): Captura de Inventario por Voz (human-in-the-loop) */}
                    <div className="mt-6 bg-slate-900/50 border border-violet-500/25 rounded-[32px] p-8">
                        <h2 className="text-2xl font-black uppercase italic tracking-tighter mb-1 bg-gradient-to-r from-violet-300 to-violet-500 bg-clip-text text-transparent">🎙️ Dictar Entrada (Voz)</h2>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">La IA propone · tú confirmas antes de registrar</p>
                        <p className="text-[10px] text-slate-500 mb-6">
                            Requiere la IA local instalada. Si no está disponible, usa la captura manual de arriba.
                        </p>

                        {!voiceAvailable && (
                            <div className="mb-6 bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4">
                                <p className="text-[10px] font-black text-amber-300 uppercase tracking-widest">
                                    ⚠️ Dictado por voz no disponible (IA local apagada). El flujo manual sigue funcionando.
                                </p>
                            </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                            <div>
                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-2">Almacén destino</label>
                                <select
                                    value={voiceTargetWH}
                                    onChange={(e) => setVoiceTargetWH(e.target.value)}
                                    className="w-full bg-slate-900/80 border border-slate-500/30 p-3 rounded-xl text-sm font-bold text-white outline-none focus:border-violet-400"
                                >
                                    <option value="">— Selecciona almacén —</option>
                                    {warehouses.map((wh) => (
                                        <option key={wh.id} value={wh.id}>{wh.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="flex items-end">
                                <button
                                    onClick={voiceRecording ? handleVoiceStop : handleVoiceStart}
                                    disabled={voiceTranscribing || !voiceAvailable}
                                    className={`w-full px-8 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed ${
                                        voiceRecording
                                            ? 'bg-red-600 text-white hover:bg-red-500 shadow-red-600/20 animate-pulse'
                                            : 'bg-violet-600 text-white hover:bg-violet-500 hover:scale-105 active:scale-95 shadow-violet-600/20'
                                    }`}
                                >
                                    {voiceTranscribing
                                        ? '⏳ Procesando audio...'
                                        : voiceRecording
                                            ? '⏹ Detener y procesar'
                                            : '🎙️ Grabar dictado'}
                                </button>
                            </div>
                        </div>

                        {voiceTranscript && (
                            <div className="mb-6 bg-slate-950/60 border border-slate-500/20 rounded-2xl p-4">
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Texto reconocido</p>
                                <p className="text-sm text-slate-200 italic">"{voiceTranscript}"</p>
                            </div>
                        )}

                        {voiceProposal && (
                            <div className={`border rounded-2xl p-6 ${voiceProposal.revisar ? 'bg-amber-500/10 border-amber-500/40' : 'bg-slate-950/60 border-violet-500/25'}`}>
                                <div className="flex items-center justify-between mb-4">
                                    <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">
                                        Propuesta de la IA — revisa y confirma
                                    </p>
                                    <span className={`text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-full ${
                                        voiceProposal.revisar ? 'bg-amber-500/20 text-amber-300' : 'bg-emerald-500/20 text-emerald-300'
                                    }`}>
                                        Confianza {Math.round((voiceProposal.confianza || 0) * 100)}%
                                    </span>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                                    <div>
                                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-2">Insumo</label>
                                        <select
                                            value={voiceProposal.item_id}
                                            onChange={(e) => handleVoiceProposalChange('item_id', e.target.value)}
                                            className={`w-full bg-slate-900/80 border p-3 rounded-xl text-sm font-bold text-white outline-none ${
                                                voiceProposal.sku_resuelto ? 'border-slate-500/30 focus:border-violet-400' : 'border-amber-500/60'
                                            }`}
                                        >
                                            {!voiceProposal.sku_resuelto && (
                                                <option value={voiceProposal.item_id}>⚠️ {voiceProposal.item_id || 'Sin reconocer'}</option>
                                            )}
                                            {(insumos || []).map((i) => (
                                                <option key={i.id} value={i.id}>{i.nombre}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-2">Cantidad</label>
                                        <input
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            value={voiceProposal.cantidad}
                                            onChange={(e) => handleVoiceProposalChange('cantidad', e.target.value)}
                                            className="w-full bg-slate-900/80 border border-slate-500/30 p-3 rounded-xl text-sm font-mono text-center text-white outline-none focus:border-violet-400"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-2">Unidad</label>
                                        <input
                                            type="text"
                                            value={voiceProposal.unidad}
                                            onChange={(e) => handleVoiceProposalChange('unidad', e.target.value)}
                                            className="w-full bg-slate-900/80 border border-slate-500/30 p-3 rounded-xl text-sm font-bold text-center text-white outline-none focus:border-violet-400"
                                        />
                                    </div>
                                </div>

                                <label className="flex items-center gap-3 cursor-pointer mb-4">
                                    <input
                                        type="checkbox"
                                        checked={voiceProposal.confirmado}
                                        onChange={handleVoiceConfirm}
                                        className="w-5 h-5 accent-violet-500"
                                    />
                                    <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">
                                        Confirmo que estos datos son correctos
                                    </span>
                                </label>

                                <div className="flex items-center gap-4">
                                    <button
                                        onClick={handleSubmitVoiceEntry}
                                        disabled={loadingOp || !voiceProposal.confirmado}
                                        className="bg-violet-600 text-white px-8 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-violet-500 hover:scale-105 active:scale-95 transition-all shadow-lg shadow-violet-600/20 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {loadingOp ? '⏳ Procesando...' : '✅ Registrar Entrada por Voz'}
                                    </button>
                                    <button
                                        onClick={resetVoiceCapture}
                                        className="text-slate-400 hover:text-white px-6 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-colors"
                                    >
                                        Descartar dictado
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ===== PESTAÑA: MERMAS ===== */}
            {suiteTab === 'mermas' && (
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="bg-slate-900/50 border border-slate-500/25 rounded-[32px] p-8 max-w-2xl">
                        <h2 className="text-2xl font-black uppercase italic tracking-tighter mb-1 bg-gradient-to-r from-orange-300 to-orange-500 bg-clip-text text-transparent">⚠️ Registro de Mermas</h2>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-8">Documenta pérdidas, desperdicios o productos dañados con motivo auditable</p>

                        <div className="space-y-6">
                            <div>
                                <label className="text-[9px] font-black uppercase text-slate-400 mb-2 block tracking-widest">Almacén</label>
                                <select 
                                    value={mermaForm.almacen_id}
                                    onChange={(e) => setMermaForm({...mermaForm, almacen_id: e.target.value})}
                                    className="w-full bg-slate-800/80 border border-slate-500/30 p-4 rounded-2xl font-bold text-sm outline-none focus:border-orange-400 appearance-none text-white"
                                >
                                    <option value="">Selecciona un almacén...</option>
                                    {selectedZone ? (
                                        warehouses.filter(w => (w.zona_termica || w.type) === selectedZone).map(wh => (
                                            <option key={wh.id} value={wh.id}>{wh.icon} {wh.name}</option>
                                        ))
                                    ) : (
                                        ZONES.map(zone => (
                                            <optgroup key={zone.key} label={`${zone.icon} ${zone.label}`}>
                                                {warehouses.filter(w => (w.zona_termica || w.type) === zone.key).map(wh => (
                                                    <option key={wh.id} value={wh.id}>{wh.name}</option>
                                                ))}
                                            </optgroup>
                                        ))
                                    )}
                                </select>
                            </div>
                            <div>
                                <label className="text-[9px] font-black uppercase text-slate-400 mb-2 block tracking-widest">Insumo / Producto</label>
                                <select 
                                    value={mermaForm.item_id}
                                    onChange={(e) => setMermaForm({...mermaForm, item_id: e.target.value})}
                                    className="w-full bg-slate-800/80 border border-slate-500/30 p-4 rounded-2xl font-bold text-sm outline-none focus:border-orange-400 appearance-none text-white"
                                >
                                    <option value="">Selecciona un insumo...</option>
                                    {insumos.map(ins => (
                                        <option key={ins.id} value={ins.id}>{ins.nombre} ({ins.unidad_base})</option>
                                    ))}
                                </select>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[9px] font-black uppercase text-slate-400 mb-2 block tracking-widest">Cantidad</label>
                                    <input 
                                        type="number"
                                        value={mermaForm.cantidad}
                                        onChange={(e) => setMermaForm({...mermaForm, cantidad: e.target.value})}
                                        placeholder="0"
                                        className="w-full bg-slate-800/80 border border-slate-500/30 p-4 rounded-2xl font-mono text-sm outline-none focus:border-orange-400 text-white"
                                    />
                                </div>
                                <div>
                                    <label className="text-[9px] font-black uppercase text-slate-400 mb-2 block tracking-widest">Tipo de Item</label>
                                    <select 
                                        value={mermaForm.item_type}
                                        onChange={(e) => setMermaForm({...mermaForm, item_type: e.target.value})}
                                        className="w-full bg-slate-800/80 border border-slate-500/30 p-4 rounded-2xl font-bold text-sm outline-none focus:border-orange-400 appearance-none text-white"
                                    >
                                        <option value="INSUMO">Insumo</option>
                                        <option value="PRODUCTO">Producto</option>
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label className="text-[9px] font-black uppercase text-slate-400 mb-2 block tracking-widest">Motivo / Notas (Obligatorio) ⚠️</label>
                                <textarea 
                                    value={mermaForm.notas}
                                    onChange={(e) => setMermaForm({...mermaForm, notas: e.target.value})}
                                    placeholder="Describe el motivo de la merma: caducidad, rotura, producción excedente, etc."
                                    rows={3}
                                    className="w-full bg-slate-800/80 border border-orange-500/30 p-4 rounded-2xl font-bold text-sm outline-none focus:border-orange-400 text-white placeholder-slate-500 resize-none"
                                />
                            </div>
                        </div>

                        <button
                            onClick={handleSubmitMerma}
                            disabled={loadingOp}
                            className="mt-6 bg-orange-600 text-white px-8 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-orange-500 hover:scale-105 active:scale-95 transition-all shadow-lg shadow-orange-600/20 disabled:opacity-50"
                        >
                            {loadingOp ? '⏳ Procesando...' : '⚠️ Registrar Merma'}
                        </button>
                    </div>
                </div>
            )}

            {/* ===== PESTAÑA: TRASPASOS ===== */}
            {suiteTab === 'traspasos' && (
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="bg-slate-900/50 border border-slate-500/25 rounded-[32px] p-8 max-w-2xl">
                        <h2 className="text-2xl font-black uppercase italic tracking-tighter mb-1 bg-gradient-to-r from-blue-300 to-blue-500 bg-clip-text text-transparent">🔄 Traspasos entre Almacenes</h2>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-8">Mueve insumos o productos de un almacén a otro con trazabilidad completa</p>

                        <div className="space-y-6">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[9px] font-black uppercase text-slate-400 mb-2 block tracking-widest">Almacén Origen</label>
                                    <select 
                                        value={traspasoForm.almacen_origen_id}
                                        onChange={(e) => setTraspasoForm({...traspasoForm, almacen_origen_id: e.target.value})}
                                        className="w-full bg-slate-800/80 border border-slate-500/30 p-4 rounded-2xl font-bold text-sm outline-none focus:border-blue-400 appearance-none text-white"
                                    >
                                        <option value="">Origen...</option>
                                        {warehouses.map(wh => (
                                            <option key={wh.id} value={wh.id}>{wh.icon} {wh.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[9px] font-black uppercase text-slate-400 mb-2 block tracking-widest">Almacén Destino</label>
                                    <select 
                                        value={traspasoForm.almacen_destino_id}
                                        onChange={(e) => setTraspasoForm({...traspasoForm, almacen_destino_id: e.target.value})}
                                        className="w-full bg-slate-800/80 border border-slate-500/30 p-4 rounded-2xl font-bold text-sm outline-none focus:border-blue-400 appearance-none text-white"
                                    >
                                        <option value="">Destino...</option>
                                        {warehouses.map(wh => (
                                            <option key={wh.id} value={wh.id}>{wh.icon} {wh.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label className="text-[9px] font-black uppercase text-slate-400 mb-2 block tracking-widest">Insumo / Producto</label>
                                <select 
                                    value={traspasoForm.item_id}
                                    onChange={(e) => setTraspasoForm({...traspasoForm, item_id: e.target.value})}
                                    className="w-full bg-slate-800/80 border border-slate-500/30 p-4 rounded-2xl font-bold text-sm outline-none focus:border-blue-400 appearance-none text-white"
                                >
                                    <option value="">Selecciona un insumo...</option>
                                    {insumos.map(ins => (
                                        <option key={ins.id} value={ins.id}>{ins.nombre} ({ins.unidad_base})</option>
                                    ))}
                                </select>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[9px] font-black uppercase text-slate-400 mb-2 block tracking-widest">Cantidad</label>
                                    <input 
                                        type="number"
                                        value={traspasoForm.cantidad}
                                        onChange={(e) => setTraspasoForm({...traspasoForm, cantidad: e.target.value})}
                                        placeholder="0"
                                        className="w-full bg-slate-800/80 border border-slate-500/30 p-4 rounded-2xl font-mono text-sm outline-none focus:border-blue-400 text-white"
                                    />
                                </div>
                                <div>
                                    <label className="text-[9px] font-black uppercase text-slate-400 mb-2 block tracking-widest">Tipo</label>
                                    <select 
                                        value={traspasoForm.item_type}
                                        onChange={(e) => setTraspasoForm({...traspasoForm, item_type: e.target.value})}
                                        className="w-full bg-slate-800/80 border border-slate-500/30 p-4 rounded-2xl font-bold text-sm outline-none focus:border-blue-400 appearance-none text-white"
                                    >
                                        <option value="INSUMO">Insumo</option>
                                        <option value="PRODUCTO">Producto</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        {traspasoForm.almacen_origen_id && traspasoForm.almacen_destino_id && traspasoForm.almacen_origen_id === traspasoForm.almacen_destino_id && (
                            <div className="mt-4 px-4 py-2 bg-red-900/30 border border-red-500/30 rounded-xl text-red-300 text-sm font-bold">
                                ⚠️ Origen y destino son el mismo almacén
                            </div>
                        )}

                        <button
                            onClick={handleSubmitTraspaso}
                            disabled={loadingOp}
                            className="mt-6 bg-blue-600 text-white px-8 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-500 hover:scale-105 active:scale-95 transition-all shadow-lg shadow-blue-600/20 disabled:opacity-50"
                        >
                            {loadingOp ? '⏳ Procesando...' : '🔄 Ejecutar Traspaso'}
                        </button>
                    </div>
                </div>
            )}

            {/* ===== PESTAÑA: HISTORIAL ===== */}
            {suiteTab === 'historial' && (
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="bg-slate-900/50 border border-slate-500/25 rounded-[32px] p-8">
                        <div className="flex justify-between items-center mb-6">
                            <div>
                                <h2 className="text-2xl font-black uppercase italic tracking-tighter mb-1 bg-gradient-to-r from-slate-200 to-slate-400 bg-clip-text text-transparent">📜 Historial de Movimientos</h2>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Bitácora completa y auditable de todas las operaciones</p>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => fetchMovements()}
                                    className="bg-slate-700 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-600 transition-all text-white"
                                >
                                    🔄 Actualizar
                                </button>
                            </div>
                        </div>

                        {/* Filtros de tipo */}
                        <div className="flex gap-2 mb-6 flex-wrap">
                            <button 
                                onClick={() => setHistorialFilter('ALL')}
                                className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${historialFilter === 'ALL' ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-white bg-slate-800/50'}`}
                            >
                                Todos
                            </button>
                            {Object.entries(MOV_TYPE_META).map(([key, meta]) => (
                                <button 
                                    key={key}
                                    onClick={() => setHistorialFilter(key)}
                                    className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-1 ${historialFilter === key ? `${meta.bg} ${meta.color} border border-current` : 'text-slate-400 hover:text-white bg-slate-800/50'}`}
                                >
                                    {meta.icon} {meta.label}
                                </button>
                            ))}
                        </div>

                        {/* Tabla de movimientos */}
                        <div className="overflow-x-auto max-h-[60vh] overflow-y-auto custom-scrollbar">
                            <table className="w-full text-left border-separate border-spacing-y-2">
                                <thead className="sticky top-0 z-10">
                                    <tr className="text-[9px] font-black uppercase text-slate-400 tracking-[0.15em]">
                                        <th className="px-4 pb-2 bg-slate-900/90 backdrop-blur-md rounded-l-lg">Fecha</th>
                                        <th className="px-4 pb-2 bg-slate-900/90 backdrop-blur-md">Tipo</th>
                                        <th className="px-4 pb-2 bg-slate-900/90 backdrop-blur-md">Item</th>
                                        <th className="px-4 pb-2 bg-slate-900/90 backdrop-blur-md">Cantidad</th>
                                        <th className="px-4 pb-2 bg-slate-900/90 backdrop-blur-md">Método</th>
                                        <th className="px-4 pb-2 bg-slate-900/90 backdrop-blur-md">Usuario</th>
                                        <th className="px-4 pb-2 bg-slate-900/90 backdrop-blur-md rounded-r-lg">Notas</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {movements
                                        .filter(m => historialFilter === 'ALL' || m.tipo_movimiento === historialFilter)
                                        .map((mov, idx) => {
                                            const meta = MOV_TYPE_META[mov.tipo_movimiento] || MOV_TYPE_META.AJUSTE_INVENTARIO;
                                            return (
                                                <tr key={mov.id || idx} className="bg-slate-800/40 hover:bg-slate-700/50 transition-all">
                                                    <td className="px-4 py-3 rounded-l-xl text-[10px] text-slate-300 font-mono">
                                                        {mov.timestamp ? new Date(mov.timestamp).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[8px] font-black uppercase tracking-wider ${meta.bg} ${meta.color} border border-current/20`}>
                                                            {meta.icon} {meta.label}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 text-xs font-bold text-white">
                                                        {mov.item_id}
                                                        <span className="text-[8px] text-slate-500 ml-1 uppercase">({mov.item_type})</span>
                                                    </td>
                                                    <td className="px-4 py-3 font-mono text-sm font-bold text-white">{mov.cantidad}</td>
                                                    <td className="px-4 py-3 text-[9px] font-bold text-slate-400 uppercase">{mov.metodo_captura}</td>
                                                    <td className="px-4 py-3 text-[10px] font-bold text-slate-300">{mov.usuario_id}</td>
                                                    <td className="px-4 py-3 rounded-r-xl text-[10px] text-slate-400 max-w-[200px] truncate">{mov.notas || '—'}</td>
                                                </tr>
                                            );
                                        })
                                    }
                                </tbody>
                            </table>
                            {movements.length === 0 && (
                                <div className="text-center py-16">
                                    <p className="text-slate-500 text-4xl mb-4">📜</p>
                                    <p className="text-slate-400 font-bold">No hay movimientos registrados aún</p>
                                    <p className="text-slate-500 text-sm mt-1">Los movimientos aparecerán aquí cuando se registren entradas, mermas o traspasos</p>
                                </div>
                            )}
                        </div>

                        <div className="mt-4 text-[9px] font-black text-slate-500 uppercase tracking-widest">
                            {movements.filter(m => historialFilter === 'ALL' || m.tipo_movimiento === historialFilter).length} movimientos • Filtro: {historialFilter === 'ALL' ? 'TODOS' : MOV_TYPE_META[historialFilter]?.label || historialFilter}
                        </div>
                    </div>
                </div>
            )}

            <footer className="fixed bottom-6 left-10 text-[8px] text-slate-500 font-black uppercase tracking-[0.4em] flex items-center gap-4 pointer-events-none">
                <span>R DE RICO ERP | WAREHOUSE LOGISTICS V3.0</span>
                <div className="w-1 h-1 bg-slate-600 rounded-full" />
                <span className="text-slate-600">Acero Inoxidable Satinado - Planta Central</span>
            </footer>

            {/* Modal: Editor de Almacén (Crear/Editar) */}
            {showWHEditor && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 animate-in fade-in duration-300">
                    <div className="absolute inset-0 bg-black/90 backdrop-blur-xl" onClick={() => setShowWHEditor(false)} />
                    <div className="relative w-full max-w-lg bg-gray-900 border border-indigo-900/30 rounded-[40px] p-10 shadow-2xl overflow-hidden">
                        <div className="absolute top-0 left-0 w-full h-1 bg-indigo-600/50" />
                        <h3 className="text-2xl font-black uppercase italic tracking-tighter text-indigo-400 mb-8">
                            {editingWHData.id ? 'Editar Almacén' : 'Nuevo Almacén'}
                        </h3>
                        
                        {/* v10 (Fase 10.1): orden de lectura tipo ficha.
                            1) contexto (Categoria/Subcategoria) 2) identidad (Nombre)
                            3) representacion visual (Icono/Foto) 4) parametro (Capacidad)
                            5) pautas de acomodo (Infografia). */}
                        {/* v10 (fix): `custom-scrollbar` para que la barra use el
                            pulgar naranja translucido del proyecto en lugar del
                            gris claro por defecto del navegador, que contrastaba
                            de forma agresiva contra el modal oscuro. */}
                        <div className="space-y-6 max-h-[60vh] overflow-y-auto pr-1 custom-scrollbar">
                            {/* v9 (Fase 9.2): Categoría y Subcategoría son INFORMATIVAS.
                                El operador ya las eligió al navegar (zona -> pestaña de
                                subcategoría); el modal no debe volver a preguntarlas ni
                                permitir contradecir la navegación. Al editar se muestran
                                los valores reales del almacén. */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[9px] font-black uppercase text-gray-600 mb-2 block tracking-widest">Categoría</label>
                                    <div className="w-full bg-black/40 border border-gray-800/60 p-4 rounded-2xl font-black text-[10px] uppercase text-gray-400 flex items-center gap-2">
                                        <span className="text-base">{categoriaInfo.icon}</span>
                                        {categoriaInfo.label}
                                    </div>
                                </div>
                                <div>
                                    <label className="text-[9px] font-black uppercase text-gray-600 mb-2 block tracking-widest">Subcategoría</label>
                                    <div className="w-full bg-black/40 border border-gray-800/60 p-4 rounded-2xl font-black text-[10px] uppercase text-gray-400 flex items-center gap-2">
                                        <span className="text-base">{subcategoriaInfo.icon}</span>
                                        {subcategoriaInfo.label}
                                    </div>
                                </div>
                            </div>

                            <div>
                                <label className="text-[9px] font-black uppercase text-gray-600 mb-2 block tracking-widest">Nombre del Almacén</label>
                                <input
                                    type="text"
                                    value={editingWHData.name}
                                    onChange={(e) => setEditingWHData({...editingWHData, name: e.target.value.toUpperCase()})}
                                    className="w-full bg-black/60 border border-gray-800 p-4 rounded-2xl font-bold text-sm outline-none focus:border-indigo-500"
                                    placeholder="EJ: CONGELADOR 4"
                                />
                            </div>

                            <div>
                                <label className="text-[9px] font-black uppercase text-gray-600 mb-2 block tracking-widest">Icono</label>
                                <div className="flex gap-2">
                                    {['📦', '🥛', '🪜', '🧊', '🧹', '🥖', '⚡'].map(icon => (
                                        <button
                                            key={icon}
                                            onClick={() => setEditingWHData({...editingWHData, icon})}
                                            className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl transition-all ${editingWHData.icon === icon ? 'bg-indigo-600 scale-110 shadow-lg' : 'bg-black/40 border border-gray-800 hover:border-indigo-500'}`}
                                        >
                                            {icon}
                                        </button>
                                    ))}
                                </div>
                                <p className="text-[8px] font-bold text-gray-600 uppercase tracking-widest mt-2">
                                    El icono se usa cuando el almacén no tiene fotografía.
                                </p>
                            </div>

                            {/* v10 (Fase 10.2): fotografia real del almacen. Opcional.
                                Cuando existe, tiene prioridad visual sobre el icono en
                                las tarjetas y en el detalle. */}
                            <div>
                                <label className="text-[9px] font-black uppercase text-gray-600 mb-2 block tracking-widest">Fotografía del Almacén (Opcional)</label>
                                {editingWHData.fotoUrl ? (
                                    <div className="relative rounded-2xl overflow-hidden border border-gray-800">
                                        <img
                                            src={editingWHData.fotoUrl}
                                            alt="Fotografía del almacén"
                                            className="w-full h-40 object-cover"
                                        />
                                        <button
                                            onClick={() => setEditingWHData({...editingWHData, fotoUrl: null})}
                                            className="absolute top-3 right-3 bg-red-600/90 hover:bg-red-600 text-white w-9 h-9 rounded-xl text-xs font-black transition-all"
                                            title="Quitar fotografía"
                                        >
                                            ✕
                                        </button>
                                    </div>
                                ) : (
                                    <label className="w-full bg-black/40 border border-dashed border-gray-700 hover:border-indigo-500 p-6 rounded-2xl flex flex-col items-center justify-center gap-2 cursor-pointer transition-all">
                                        <span className="text-2xl">📷</span>
                                        <span className="text-[9px] font-black uppercase text-gray-500 tracking-widest">Subir fotografía del ordenador</span>
                                        <input
                                            type="file"
                                            accept="image/*"
                                            onChange={handleWarehousePhotoUpload}
                                            className="hidden"
                                        />
                                    </label>
                                )}
                            </div>

                            <div>
                                <label className="text-[9px] font-black uppercase text-gray-600 mb-2 block tracking-widest">Capacidad Máxima (Items)</label>
                                <input
                                    type="number"
                                    value={editingWHData.capacity}
                                    onChange={(e) => setEditingWHData({...editingWHData, capacity: parseInt(e.target.value) || 0})}
                                    className="w-full bg-black/60 border border-gray-800 p-4 rounded-2xl font-mono text-sm outline-none focus:border-indigo-500"
                                />
                            </div>

                            {/* v10 (Fase 10.3): acceso al modal de infografia de acomodo.
                                Se muestra un resumen del estado para que el operador sepa
                                si ya hay infografia y cuantas pautas hay capturadas. */}
                            <div>
                                <label className="text-[9px] font-black uppercase text-gray-600 mb-2 block tracking-widest">Infografía de Acomodo</label>
                                <button
                                    onClick={() => setShowPlanograma(true)}
                                    className="w-full bg-black/40 border border-gray-800 hover:border-indigo-500 p-4 rounded-2xl flex items-center justify-between transition-all"
                                >
                                    <span className="flex items-center gap-3">
                                        <span className="text-xl">🗺️</span>
                                        <span className="text-[10px] font-black uppercase text-gray-300 tracking-widest">
                                            {editingWHData.planogramaUrl ? 'Infografía cargada' : 'Sin infografía'}
                                        </span>
                                    </span>
                                    <span className="text-[9px] font-black uppercase text-indigo-400 tracking-widest">
                                        {editingWHData.pautasAcomodo?.length
                                            ? `${editingWHData.pautasAcomodo.length} pauta(s) • Abrir`
                                            : 'Abrir'}
                                    </span>
                                </button>
                            </div>
                        </div>

                        <div className="flex gap-4 mt-12">
                            <button 
                                onClick={() => setShowWHEditor(false)}
                                className="flex-1 py-5 bg-gray-800 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-gray-700 transition-all"
                            >
                                Cancelar
                            </button>
                            <button 
                                onClick={() => handleSaveWH(editingWHData)}
                                className="flex-1 py-5 bg-indigo-600 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-xl shadow-indigo-600/20"
                            >
                                {editingWHData.id ? 'Guardar Cambios' : 'Crear Almacén'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* v10 (Fase 10.3): Modal ANIDADO de Infografía de Acomodo.
                Decisiones de diseño deliberadas:
                - z-[400]: por encima del editor (z-[200]) y del dialogo de
                  eliminacion (z-[300]), para que nunca quede tapado.
                - El backdrop NO cierra el modal: si el operador esta a media
                  carga de una imagen, un clic mal dado no debe perder el trabajo.
                  Solo se cierra con el boton "Listo".
                - stopPropagation en el backdrop evita que el clic burbujee al
                  backdrop del editor y lo cierre tambien. */}
            {showPlanograma && editingWHData && (
                <div className="fixed inset-0 z-[400] flex items-center justify-center p-6 animate-in fade-in duration-300">
                    <div className="absolute inset-0 bg-black/95 backdrop-blur-2xl" onClick={(e) => e.stopPropagation()} />
                    <div className="relative w-full max-w-2xl bg-gray-900 border border-indigo-900/30 rounded-[40px] p-10 shadow-2xl overflow-hidden">
                        <div className="absolute top-0 left-0 w-full h-1 bg-indigo-600/50" />
                        <h3 className="text-2xl font-black uppercase italic tracking-tighter text-indigo-400 mb-2">
                            Infografía de Acomodo
                        </h3>
                        <p className="text-[9px] font-black text-gray-600 uppercase tracking-widest mb-8">
                            {editingWHData.name || 'Almacén sin nombre'} • Cómo debe acomodarse el producto
                        </p>

                        {/* v10 (fix): mismo `custom-scrollbar` que el editor para
                            mantener coherencia visual en el modal anidado. */}
                        <div className="space-y-6 max-h-[55vh] overflow-y-auto pr-1 custom-scrollbar">
                            {/* Imagen de la infografia (planograma) */}
                            <div>
                                <label className="text-[9px] font-black uppercase text-gray-600 mb-2 block tracking-widest">Imagen de la Infografía</label>
                                {editingWHData.planogramaUrl ? (
                                    <div className="relative rounded-2xl overflow-hidden border border-gray-800">
                                        <img
                                            src={editingWHData.planogramaUrl}
                                            alt="Infografía de acomodo"
                                            className="w-full max-h-72 object-contain bg-black/60"
                                        />
                                        <button
                                            onClick={() => setEditingWHData({...editingWHData, planogramaUrl: null})}
                                            className="absolute top-3 right-3 bg-red-600/90 hover:bg-red-600 text-white w-9 h-9 rounded-xl text-xs font-black transition-all"
                                            title="Quitar infografía"
                                        >
                                            ✕
                                        </button>
                                    </div>
                                ) : (
                                    <label className="w-full bg-black/40 border border-dashed border-gray-700 hover:border-indigo-500 p-8 rounded-2xl flex flex-col items-center justify-center gap-2 cursor-pointer transition-all">
                                        <span className="text-3xl">🗺️</span>
                                        <span className="text-[9px] font-black uppercase text-gray-500 tracking-widest">Subir infografía del ordenador</span>
                                        <span className="text-[8px] font-bold text-gray-700 uppercase tracking-widest">JPG, PNG o WEBP</span>
                                        <input
                                            type="file"
                                            accept="image/*"
                                            onChange={handlePlanogramaUpload}
                                            className="hidden"
                                        />
                                    </label>
                                )}
                            </div>

                            {/* Pautas de acomodo en texto (columna JSON pautas_acomodo) */}
                            <div>
                                <label className="text-[9px] font-black uppercase text-gray-600 mb-2 block tracking-widest">Instrucciones de Acomodo (Una por Línea)</label>
                                <textarea
                                    value={(editingWHData.pautasAcomodo || []).join('\n')}
                                    onChange={(e) => handlePautasChange(e.target.value)}
                                    rows={5}
                                    className="w-full bg-black/60 border border-gray-800 p-4 rounded-2xl font-bold text-xs outline-none focus:border-indigo-500 resize-none"
                                    placeholder={"EJ:\nPRODUCTO PESADO EN LA PARTE INFERIOR\nROTACIÓN PEPS DE IZQUIERDA A DERECHA\nNO APILAR MÁS DE 3 CAJAS"}
                                />
                                <p className="text-[8px] font-bold text-gray-600 uppercase tracking-widest mt-2">
                                    {(editingWHData.pautasAcomodo || []).length} pauta(s) capturada(s)
                                </p>
                            </div>
                        </div>

                        <div className="flex gap-4 mt-10">
                            <button
                                onClick={() => setShowPlanograma(false)}
                                className="flex-1 py-5 bg-indigo-600 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-xl shadow-indigo-600/20"
                            >
                                Listo
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal: Confirmar Eliminación */}
            {whToDelete && (
                <div className="fixed inset-0 z-[300] flex items-center justify-center p-6 animate-in fade-in duration-300">
                    <div className="absolute inset-0 bg-black/95 backdrop-blur-2xl" onClick={() => setWhToDelete(null)} />
                    <div className="relative w-full max-w-md bg-gray-900 border border-red-900/30 rounded-[40px] p-10 shadow-2xl overflow-hidden">
                        <div className="absolute top-0 left-0 w-full h-1 bg-red-600/50" />
                        <h3 className="text-2xl font-black uppercase italic tracking-tighter text-red-500 mb-4">Eliminar Almacén</h3>
                        <p className="text-sm font-bold text-gray-300 mb-2">¿Estás seguro de que deseas eliminar "{whToDelete.name}"?</p>
                        <p className="text-[10px] font-black text-red-900 uppercase tracking-widest mb-10 leading-relaxed">
                            Esta acción borrará la ubicación física y desconectará sus registros de inventario. No se puede deshacer.
                        </p>
                        <div className="flex gap-4">
                            <button 
                                onClick={() => setWhToDelete(null)}
                                className="flex-1 py-5 bg-gray-800 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-gray-700 transition-all"
                            >
                                Cancelar
                            </button>
                            <button 
                                onClick={() => handleDeleteWH(whToDelete.id)}
                                className="flex-1 py-5 bg-red-600 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-xl shadow-red-600/20"
                            >
                                Aceptar y Eliminar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* === v11 (Fase 11.3, Deuda 3): PANEL DE DIAGNÓSTICO SIN_CLASIFICAR ===
                Muestra los SKUs que no se pudieron descontar del stock. Antes
                quedaban invisibles (el endpoint existía pero nadie lo consumía).
                Cada fila ofrece una ACCIÓN SUGERIDA, nunca automática: respeta la
                regla rectora "la IA propone, el operador confirma". */}
            {showSinAlmacenPanel && (
                <div className="fixed inset-0 z-[300] flex items-center justify-center p-6 animate-in fade-in duration-300">
                    <div className="absolute inset-0 bg-black/95 backdrop-blur-2xl" onClick={() => setShowSinAlmacenPanel(false)} />
                    <div className="relative w-full max-w-4xl bg-[#0a0a0a] border border-red-900/40 rounded-[40px] shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
                        <header className="p-10 border-b border-gray-800 flex justify-between items-start">
                            <div>
                                <h3 className="text-2xl font-black uppercase italic tracking-tighter text-red-400">Cuarentena de Inventario</h3>
                                <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mt-2">
                                    SKUs que no se pudieron descontar del stock. Requieren tu revisión.
                                </p>
                            </div>
                            <button
                                onClick={() => setShowSinAlmacenPanel(false)}
                                className="w-10 h-10 rounded-full bg-gray-800 hover:bg-gray-700 transition-all text-gray-400 hover:text-white"
                                title="Cerrar"
                            >
                                ✕
                            </button>
                        </header>

                        <div className="p-10 overflow-y-auto custom-scrollbar">
                            {sinAlmacenAgrupado.length === 0 ? (
                                <div className="text-center py-16">
                                    <span className="text-5xl">✅</span>
                                    <p className="mt-6 text-sm font-black uppercase tracking-widest text-emerald-400">
                                        Sin incidencias
                                    </p>
                                    <p className="mt-2 text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                                        Todos los SKUs se descontaron correctamente.
                                    </p>
                                </div>
                            ) : (
                                <table className="w-full text-left">
                                    <thead>
                                        <tr className="text-[9px] font-black uppercase tracking-widest text-gray-500 border-b border-gray-800">
                                            <th className="pb-4">SKU</th>
                                            <th className="pb-4">Motivo</th>
                                            <th className="pb-4 text-center">Ocurrencias</th>
                                            <th className="pb-4 text-center">Cantidad</th>
                                            <th className="pb-4">Última vez</th>
                                            <th className="pb-4 text-right">Acción sugerida</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {sinAlmacenAgrupado.map((fila, idx) => {
                                            const accion = accionSugeridaSinAlmacen(fila.evento);
                                            return (
                                                <tr key={`${fila.sku || 'sin-sku'}-${idx}`} className="border-b border-gray-900/60 hover:bg-red-950/10 transition-colors">
                                                    <td className="py-5 text-xs font-black text-white tracking-wider">
                                                        {fila.sku || <span className="text-gray-500 italic">SIN SKU</span>}
                                                    </td>
                                                    <td className="py-5 text-[10px] font-bold text-red-300 uppercase tracking-widest">
                                                        {etiquetaMotivoSinAlmacen(fila.motivo)}
                                                    </td>
                                                    <td className="py-5 text-center text-xs font-black text-gray-300">
                                                        {fila.ocurrencias}
                                                    </td>
                                                    <td className="py-5 text-center text-xs font-black text-gray-300">
                                                        {fila.cantidadTotal}
                                                    </td>
                                                    <td className="py-5 text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                                                        {fila.ultimaFecha ? String(fila.ultimaFecha).replace('T', ' ').slice(0, 16) : '—'}
                                                    </td>
                                                    <td className="py-5 text-right">
                                                        <span className="inline-block px-4 py-2 rounded-xl bg-red-900/30 border border-red-500/30 text-[9px] font-black uppercase tracking-widest text-red-200">
                                                            {accion.label}
                                                        </span>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            )}
                        </div>

                        <footer className="p-8 border-t border-gray-800 bg-black/20 flex justify-between items-center text-[9px] font-black uppercase text-gray-500 tracking-widest">
                            <span>{sinAlmacenCount} incidencia(s) sin resolver</span>
                            <button
                                onClick={() => { setShowSinAlmacenPanel(false); fetchEventosSinAlmacen(); }}
                                className="text-red-400 hover:text-white transition-colors"
                            >
                                Actualizar
                            </button>
                        </footer>
                    </div>
                </div>
            )}

            {/* === v8 (Fase 8.6): MODAL GESTOR DE SUBCATEGORÍAS ===
                Persiste en la BD vía /api/v1/warehouse/subcategorias.
                - Paleta curada de 12 iconos (decisión §10.4).
                - Las de sistema (esSistema) no se pueden borrar ni desactivar.
                - Borrado con bloqueo preventivo + traslado a cuarentena (§10.1). */}
            {showSubcatManager && (
                <div className="fixed inset-0 z-[300] flex items-center justify-center p-6 animate-in fade-in duration-300">
                    <div className="absolute inset-0 bg-black/95 backdrop-blur-2xl" onClick={() => setShowSubcatManager(false)} />
                    <div className="relative w-full max-w-2xl bg-[#0a0a0a] border border-gray-800 rounded-[40px] shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
                        <header className="p-10 border-b border-gray-800 flex justify-between items-center">
                            <div>
                                <h3 className="text-2xl font-black uppercase italic tracking-tighter text-indigo-400">Gestionar Subcategorías</h3>
                                <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mt-2">Crea, renombra o elimina subcategorías de almacén</p>
                            </div>
                            <button onClick={() => setShowSubcatManager(false)} className="text-gray-500 hover:text-white">✕</button>
                        </header>

                        <div className="flex-1 overflow-y-auto p-10 space-y-4 custom-scrollbar">
                            {/* Formulario crear / editar */}
                            <div className="bg-white/5 border border-white/10 rounded-3xl p-6 space-y-4">
                                <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest">
                                    {subcatEditing ? `Editando: ${subcatEditing}` : 'Nueva subcategoría'}
                                </p>
                                <input
                                    type="text"
                                    placeholder="Nombre (ej: Cava de Vinos)"
                                    className="w-full bg-black border border-gray-800 p-4 rounded-2xl text-sm font-bold outline-none focus:border-indigo-500"
                                    value={subcatForm.label}
                                    onChange={(e) => setSubcatForm({ ...subcatForm, label: e.target.value })}
                                />
                                <div>
                                    <p className="text-[9px] font-black text-gray-600 uppercase tracking-widest mb-3">Icono</p>
                                    <div className="flex flex-wrap gap-2">
                                        {ICONOS_SUBCATEGORIA.map(ic => (
                                            <button
                                                key={ic}
                                                onClick={() => setSubcatForm({ ...subcatForm, icon: ic })}
                                                className={`w-11 h-11 rounded-xl flex items-center justify-center text-lg transition-all ${subcatForm.icon === ic ? 'bg-indigo-600 scale-110 shadow-lg' : 'bg-black/40 border border-gray-800 hover:border-indigo-500'}`}
                                            >
                                                {ic}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                {subcatError && (
                                    <p className="text-[10px] font-black uppercase tracking-widest text-red-400">{subcatError}</p>
                                )}
                                <div className="flex gap-3">
                                    {subcatEditing && (
                                        <button
                                            onClick={() => { setSubcatEditing(null); setSubcatForm({ label: '', icon: '📦' }); setSubcatError(''); }}
                                            className="flex-1 py-4 bg-gray-800 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-gray-700 transition-all"
                                        >
                                            Cancelar
                                        </button>
                                    )}
                                    <button
                                        onClick={handleSaveSubcat}
                                        disabled={subcatSaving}
                                        className="flex-1 py-4 bg-indigo-600 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all disabled:opacity-50"
                                    >
                                        {subcatSaving ? 'Guardando…' : (subcatEditing ? 'Guardar Cambios' : '+ Añadir')}
                                    </button>
                                </div>
                            </div>

                            {/* Listado */}
                            <div className="space-y-3">
                                <p className="text-[9px] font-black text-gray-600 uppercase tracking-widest mb-4">Subcategorías Existentes</p>
                                {sortPropositos(propositos).map(p => (
                                    <div key={p.codigo} className="bg-white/5 border border-white/10 p-4 rounded-2xl flex items-center justify-between gap-3">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <span className="text-xl">{p.icon}</span>
                                            <div className="min-w-0">
                                                <p className="text-xs font-black uppercase italic text-gray-200 truncate">{p.label}</p>
                                                <p className="text-[8px] font-mono text-gray-600 uppercase">
                                                    {p.codigo} · {p.almacenesCount} almacén(es)
                                                    {p.esSistema && ' · SISTEMA'}
                                                    {p.esCuarentena && ' · CUARENTENA'}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            <button
                                                onClick={() => { setSubcatEditing(p.codigo); setSubcatForm({ label: p.label, icon: p.icon }); setSubcatError(''); }}
                                                className="px-3 py-2 rounded-xl bg-slate-700/60 text-[9px] font-black uppercase tracking-widest hover:bg-slate-600 transition-all"
                                                title="Renombrar"
                                            >
                                                ✏️
                                            </button>
                                            <button
                                                onClick={() => handleDeleteSubcat(p)}
                                                disabled={p.esSistema}
                                                className="px-3 py-2 rounded-xl bg-red-900/40 text-[9px] font-black uppercase tracking-widest hover:bg-red-800/60 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                                                title={p.esSistema ? 'Las subcategorías de sistema no se pueden eliminar' : 'Eliminar'}
                                            >
                                                🗑️
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <footer className="p-8 bg-black/40 border-t border-gray-800 flex justify-end">
                            <button
                                onClick={() => setShowSubcatManager(false)}
                                className="bg-[#c1d72e] px-10 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest text-black hover:scale-105 active:scale-95 transition-all"
                            >
                                Listo
                            </button>
                        </footer>
                    </div>
                </div>
            )}

            {/* === v8 (Fase 8.6): DIÁLOGO DE TRASLADO / BORRADO ===
                Si la subcategoría tiene almacenes, se ofrece trasladarlos a otra
                subcategoría (por defecto la cuarentena SIN_CLASIFICAR) antes de
                borrar. Human-in-the-loop: el operador decide el destino. */}
            {subcatDeleteDialog && (
                <div className="fixed inset-0 z-[400] flex items-center justify-center p-6 animate-in fade-in duration-300">
                    <div className="absolute inset-0 bg-black/95 backdrop-blur-2xl" onClick={() => setSubcatDeleteDialog(null)} />
                    <div className="relative w-full max-w-lg bg-gray-900 border border-red-900/30 rounded-[40px] p-10 shadow-2xl">
                        <div className="absolute top-0 left-0 w-full h-1 bg-red-600/50 rounded-t-[40px]" />
                        <h3 className="text-2xl font-black uppercase italic tracking-tighter text-red-500 mb-4">Eliminar Subcategoría</h3>
                        <p className="text-sm font-bold text-gray-300 mb-2">
                            ¿Eliminar "{subcatDeleteDialog.label}"?
                        </p>
                        <p className="text-[10px] font-black text-red-900 uppercase tracking-widest mb-6 leading-relaxed">
                            {subcatDeleteDialog.almacenesCount > 0
                                ? `Tiene ${subcatDeleteDialog.almacenesCount} almacén(es) asignado(s). Elige a dónde trasladarlos antes de borrar.`
                                : 'No tiene almacenes asignados. Se eliminará de forma permanente.'}
                        </p>

                        {subcatDeleteDialog.almacenesCount > 0 && (
                            <div className="mb-8">
                                <label className="text-[9px] font-black uppercase text-gray-500 mb-2 block tracking-widest">Trasladar almacenes a</label>
                                <select
                                    value={subcatTrasladoDestino}
                                    onChange={(e) => setSubcatTrasladoDestino(e.target.value)}
                                    className="w-full bg-black/60 border border-gray-800 p-4 rounded-2xl font-black text-[10px] uppercase outline-none focus:border-indigo-500 appearance-none"
                                >
                                    {sortPropositos(propositos)
                                        .filter(p => p.codigo !== subcatDeleteDialog.codigo)
                                        .map(p => (
                                            <option key={p.codigo} value={p.codigo}>{p.icon} {p.label}</option>
                                        ))}
                                </select>
                            </div>
                        )}

                        <div className="flex gap-4">
                            <button
                                onClick={() => setSubcatDeleteDialog(null)}
                                className="flex-1 py-5 bg-gray-800 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-gray-700 transition-all"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleConfirmDeleteSubcat}
                                disabled={subcatSaving}
                                className="flex-1 py-5 bg-red-600 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-xl shadow-red-600/20 disabled:opacity-50"
                            >
                                {subcatSaving ? 'Procesando…' : 'Aceptar y Eliminar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Escáner IA */}
            {showAiScanner && (
                <div className="fixed inset-0 z-[500] flex items-center justify-center p-6 animate-in fade-in duration-300">
                    <div className="absolute inset-0 bg-black/95 backdrop-blur-2xl" onClick={() => setShowAiScanner(false)} />
                    <div className="relative w-full max-w-2xl bg-[#0a0a0a] border border-pink-900/50 rounded-[40px] shadow-2xl overflow-hidden flex flex-col h-[70vh]">
                        <header className="p-8 border-b border-gray-800">
                            <h3 className="text-2xl font-black uppercase italic tracking-tighter text-pink-500">Escáner IA de Charolas</h3>
                            <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mt-1">Conteo automatizado mediante Visión Computacional</p>
                        </header>
                        <div className="flex-1 flex flex-col items-center justify-center p-10 relative">
                            <div className="w-full h-full border-2 border-dashed border-pink-500/30 rounded-3xl flex items-center justify-center relative overflow-hidden bg-black/40">
                                <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10 animate-pulse"></div>
                                <div className="text-center z-10">
                                    <span className="text-6xl block mb-4">📷</span>
                                    <h4 className="text-white font-bold mb-2">Apuntando a charola...</h4>
                                    <p className="text-xs text-gray-400">La cámara está lista para procesar el conteo</p>
                                </div>
                                <div className="absolute top-0 left-0 w-full h-1 bg-pink-500 animate-[scan_2s_ease-in-out_infinite]" />
                            </div>
                        </div>
                        <footer className="p-8 border-t border-gray-800 bg-black/40 flex justify-end gap-4">
                            <button onClick={() => setShowAiScanner(false)} className="px-6 py-3 rounded-xl bg-gray-800 text-xs font-bold hover:bg-gray-700 text-white">Cancelar</button>
                            <button className="px-8 py-3 rounded-xl bg-pink-600 text-xs font-bold hover:bg-pink-500 shadow-lg shadow-pink-600/20 text-white" onClick={() => {
                                // v7 (D11): MOCK pendiente de Fase 6. Se reemplazará por la
                                // llamada real a POST /api/v1/pos/vision/predict con
                                // human-in-the-loop. Se usa toast en lugar de alert() nativo.
                                showOpMessage('Simulando escaneo: 12 piezas de Concha Blanca detectadas.', 'success');
                                setShowAiScanner(false);
                            }}>Capturar y Contar</button>
                        </footer>
                    </div>
                </div>
            )}

            {/* Modal: Ficha Técnica de Artículo (Logística) */}
            {editingItem && (
                <div className="fixed inset-0 z-[400] flex items-center justify-center p-6 animate-in fade-in zoom-in duration-300">
                    <div className="absolute inset-0 bg-black/95 backdrop-blur-3xl" onClick={() => setEditingItem(null)} />
                    <div className="relative w-full max-w-5xl bg-[#0a0a0a] border border-gray-800 rounded-[48px] shadow-2xl overflow-hidden flex flex-col max-h-[95vh]">
                        
                        {/* Cabecera Fija: Identidad Visual y Resumen */}
                        <header className="p-8 border-b border-gray-800 flex flex-col gap-6 bg-gradient-to-r from-indigo-900/20 to-[#0a0a0a]">
                            <div className="flex justify-between items-start">
                                <div className="flex items-start gap-8">
                                    {/* Zona de Identidad (Foto + QR) */}
                                    <div className="flex flex-col gap-3 items-center">
                                        <div className="w-32 h-32 bg-black/40 rounded-[32px] flex items-center justify-center text-5xl border border-gray-800 shadow-inner relative overflow-hidden group">
                                            {editingItem.data.imgUrl ? 
                                                <img src={editingItem.data.imgUrl} alt="Product" className="w-full h-full object-cover" /> : 
                                                <span className="opacity-40 italic">📸</span>
                                            }
                                            {editingItem.data.stock <= (editingItem.data.minStock || 0) && (
                                                <div className="absolute inset-0 border-4 border-red-600/50 rounded-[32px] animate-pulse pointer-events-none" />
                                            )}
                                        </div>
                                        <div className="flex gap-2">
                                            <button className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all text-white">
                                                <span className="text-xl">🔲</span> QR
                                            </button>
                                            <input type="file" id="imageUpload" style={{display: 'none'}} onChange={handleImageUpload} />
                                            <button onClick={() => document.getElementById('imageUpload').click()} className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all text-white">
                                                <span className="text-xl">📷</span> FOTO
                                            </button>
                                        </div>
                                    </div>
                                    
                                    {/* Datos Maestros */}
                                    <div className="pt-2">
                                        <div className="flex items-center gap-3 mb-2">
                                            <span className="text-[10px] font-mono text-indigo-400 bg-indigo-500/10 px-3 py-1 rounded-full border border-indigo-500/20">
                                                SKU: {editingItem.data.sku}
                                            </span>
                                            <span className={`text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full border ${editingItem.data.stock <= (editingItem.data.minStock || 0) ? 'bg-red-500/10 text-red-400 border-red-500/20' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'}`}>
                                                {editingItem.data.stock <= (editingItem.data.minStock || 0) ? 'Crítico' : 'Activo'}
                                            </span>
                                        </div>
                                        <h3 className="text-4xl font-black uppercase italic tracking-tighter text-[#c1d72e] leading-none mb-2">{editingItem.data.name}</h3>
                                        <p className="text-[10px] font-black text-gray-500 uppercase tracking-[0.5em]">
                                            Categoría: {editingItem.data.category || 'NO DEFINIDA'}
                                        </p>

                                        {/* URL de la Imagen */}
                                        <div className="mt-4 flex items-center gap-3">
                                            <span className="text-[9px] font-black uppercase tracking-widest text-gray-600">URL Foto:</span>
                                            <input 
                                                type="text" 
                                                placeholder="https://ejemplo.com/foto.jpg"
                                                value={editingItem.data.imgUrl || ''}
                                                onChange={(e) => setEditingItem({...editingItem, data: {...editingItem.data, imgUrl: e.target.value}})}
                                                className="bg-black/60 border border-gray-800 px-4 py-2 rounded-xl text-xs font-mono outline-none focus:border-[#c1d72e] w-72 text-gray-300 placeholder-gray-800 transition-all font-bold"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Resumen Financiero */}
                                <div className="text-right flex flex-col items-end gap-2">
                                    <button onClick={() => setEditingItem(null)} className="w-10 h-10 rounded-full bg-gray-900 border border-gray-800 flex items-center justify-center text-gray-500 hover:text-white transition-all mb-4">✕</button>
                                    <div className="bg-black/60 border border-[#c1d72e]/20 p-4 rounded-3xl min-w-[200px]">
                                        <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-1">Valor en Stock</p>
                                        <p className="text-3xl font-black font-mono tracking-tighter text-[#c1d72e]">
                                            ${calculateItemValue(editingItem.data)}
                                        </p>
                                    </div>
                                </div>
                            </div>
                            
                            {/* Navegación de Pestañas (Tabs) */}
                            <div className="flex gap-2 p-1 bg-black/40 rounded-2xl border border-gray-800 self-start mt-4 overflow-x-auto w-full max-w-full custom-scrollbar no-scrollbar">
                                <button 
                                    onClick={() => setActiveTab('existencias')}
                                    className={`px-6 py-4 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 whitespace-nowrap ${activeTab === 'existencias' ? 'bg-indigo-600 shadow-lg text-white' : 'text-gray-500 hover:text-white hover:bg-white/5'}`}
                                >
                                    <span>📦</span> Existencias y Conversiones
                                </button>
                                <button 
                                    onClick={() => setActiveTab('conservacion')}
                                    className={`px-6 py-4 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 whitespace-nowrap ${activeTab === 'conservacion' ? 'bg-indigo-600 shadow-lg text-white' : 'text-gray-500 hover:text-white hover:bg-white/5'}`}
                                >
                                    <span>❄️</span> Conservación y Almacenaje
                                </button>
                                <button 
                                    onClick={() => setActiveTab('logistica')}
                                    className={`px-6 py-4 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 whitespace-nowrap ${activeTab === 'logistica' ? 'bg-indigo-600 shadow-lg text-white' : 'text-gray-500 hover:text-white hover:bg-white/5'}`}
                                >
                                    <span>🚦</span> Logística y Flujos
                                </button>
                            </div>
                        </header>


                        <div className="flex-1 overflow-y-auto p-12 custom-scrollbar space-y-12">
                            
                            {/* Pestaña: Existencias y Conversiones */}
                            {activeTab === 'existencias' && (
                                <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                    {/* Bloque 1: Presentación y Formatos */}
                                    <section className="grid grid-cols-2 gap-10">
                                        <div className="space-y-4">
                                            <h4 className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.3em] mb-4 flex items-center gap-3">
                                                <span className="w-8 h-px bg-indigo-500/30" /> Presentación y Consumo
                                            </h4>
                                            
                                            <div className="bg-black/40 border border-gray-800 p-6 rounded-[24px] space-y-6">
                                                {/* Unidad de Compra (Sourcing) */}
                                                <div className="space-y-2">
                                                    <label className="text-[9px] font-black text-emerald-400 uppercase tracking-widest flex items-center gap-2">
                                                        <span>1. Unidad de Compra (Proveedor)</span>
                                                    </label>
                                                    <select 
                                                        value={(editingItem.data.buyUnit || 'CAJA').toUpperCase()}
                                                        onChange={(e) => setEditingItem({...editingItem, data: {...editingItem.data, buyUnit: e.target.value}})}
                                                        className="w-full bg-black border border-emerald-900/50 p-4 rounded-2xl font-black text-xs uppercase outline-none focus:border-emerald-500 cursor-pointer text-emerald-400"
                                                    >
                                                        <option value="UNIDAD">📦 UNIDAD / PIEZA</option>
                                                        <option value="CAJA">🏢 CAJA MULTIPACK</option>
                                                        <option value="SACO">🌾 SACO</option>
                                                        <option value="CUBETA">🪣 CUBETA</option>
                                                    </select>
                                                </div>

                                                {/* Unidad de Consumo (Producción) */}
                                                <div className="space-y-2 pt-4 border-t border-gray-800">
                                                    <label className="text-[9px] font-black text-indigo-400 uppercase tracking-widest flex items-center gap-2">
                                                        <span>2. Unidad de Consumo (Producción)</span>
                                                    </label>
                                                    <div className="grid grid-cols-2 gap-4">
                                                        <select 
                                                            value={(editingItem.data.unit || 'PZA').toUpperCase()}
                                                            onChange={(e) => setEditingItem({...editingItem, data: {...editingItem.data, unit: e.target.value}})}
                                                            className="w-full bg-black border border-indigo-900/50 p-4 rounded-2xl font-black text-xs uppercase outline-none focus:border-indigo-500 cursor-pointer text-indigo-400"
                                                        >
                                                            {Object.entries(UNIT_OPTIONS).map(([group, units]) => (
                                                                <optgroup key={group} label={group} className="bg-black text-[9px]">
                                                                    {units.map(u => <option key={u} value={u}>{u}</option>)}
                                                                </optgroup>
                                                            ))}
                                                        </select>
                                                    </div>
                                                </div>

                                                {/* Factor de Conversión */}
                                                <div className="bg-indigo-600/10 border border-indigo-500/20 p-5 rounded-[20px] mt-4 relative overflow-hidden group">
                                                    <div className="absolute -right-4 -top-4 text-6xl opacity-10 group-hover:scale-110 transition-transform">⚙️</div>
                                                    <label className="text-[9px] font-black text-indigo-300 uppercase tracking-widest">3. Factor de Conversión</label>
                                                    <p className="text-[8px] font-bold text-gray-400 mb-3 leading-relaxed">¿Cuántas unidades de producción equivale 1 unidad de compra?</p>
                                                    
                                                    <div className="flex items-center gap-4">
                                                        <div className="bg-black/60 px-4 py-3 rounded-xl border border-gray-800 font-mono text-xs text-gray-500">
                                                            1 {editingItem.data.buyUnit || 'CAJA'} =
                                                        </div>
                                                        <input 
                                                            type="number" 
                                                            step="0.01"
                                                            value={editingItem.data.conversionFactor || 1}
                                                            onChange={(e) => setEditingItem({...editingItem, data: {...editingItem.data, conversionFactor: parseFloat(e.target.value) || 1}})}
                                                            className="flex-1 bg-black border border-indigo-500/50 p-3 rounded-xl font-mono text-lg font-black outline-none focus:border-indigo-400 text-white"
                                                        />
                                                        <div className="text-[10px] font-black text-indigo-400">{editingItem.data.unit || 'PZA'}</div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="space-y-4">
                                            <h4 className="text-[10px] font-black text-emerald-400 uppercase tracking-[0.3em] mb-4 flex items-center gap-3">
                                                <span className="w-8 h-px bg-emerald-500/30" /> Valorización Autocalculada
                                            </h4>
                                            
                                            <div className="grid gap-6">
                                                {/* Costo de Factura */}
                                                <div className="bg-black/40 border border-gray-800 p-6 rounded-[24px]">
                                                    <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest block mb-4">Costo por {editingItem.data.buyUnit || 'CAJA'} (Factura)</label>
                                                    <div className="relative">
                                                        <span className="absolute left-6 top-1/2 -translate-y-1/2 text-gray-600 font-black text-xl">$</span>
                                                        <input 
                                                            type="number" 
                                                            step="0.01"
                                                            value={editingItem.data.costPerPresentation || 0}
                                                            onChange={(e) => setEditingItem({...editingItem, data: {...editingItem.data, costPerPresentation: parseFloat(e.target.value) || 0}})}
                                                            className="w-full bg-black border border-emerald-900/50 p-6 pl-12 rounded-[20px] font-mono text-3xl font-black outline-none focus:border-emerald-500 text-emerald-400"
                                                        />
                                                    </div>
                                                </div>

                                                {/* Costo Unitario Autocalculado */}
                                                <div className="bg-emerald-900/10 border border-emerald-500/20 p-6 rounded-[24px]">
                                                    <label className="text-[9px] font-black text-emerald-500 uppercase tracking-widest block mb-4">Costo Real por {editingItem.data.unit || 'PZA'}</label>
                                                    <div className="flex items-center gap-4">
                                                        <div className="bg-black/60 px-6 py-4 rounded-2xl flex-1 flex items-center justify-between">
                                                            <span className="text-3xl font-black font-mono text-emerald-300">
                                                                ${((editingItem.data.costPerPresentation || 0) / (editingItem.data.conversionFactor || 1)).toFixed(4)}
                                                            </span>
                                                            <span className="text-xs text-emerald-500/50">MXN</span>
                                                        </div>
                                                    </div>
                                                    <p className="text-[8px] font-bold text-gray-500 uppercase mt-3">Utilizado en el recetario principal para costeo.</p>
                                                </div>
                                            </div>
                                        </div>
                                    </section>

                                    {/* Bloque 2: Inventario Directo y Stock Mínimo */}
                                    <section className="bg-white/5 rounded-[40px] p-10 border border-white/5">
                                        <h4 className="text-[10px] font-black text-[#c1d72e] uppercase tracking-[0.3em] mb-8 flex items-center gap-3">
                                            <span className="w-8 h-px bg-[#c1d72e]/30" /> Control Físico de Inventario
                                        </h4>
                                        <div className="grid grid-cols-3 gap-8">
                                            <div className="space-y-3">
                                                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest flex justify-between">
                                                    <span>Stock Actual ({editingItem.data.buyUnit || 'CAJA'})</span>
                                                    <span className="text-gray-600">Físico</span>
                                                </label>
                                                <input 
                                                    type="number" 
                                                    step="0.01"
                                                    value={editingItem.data.stock}
                                                    onChange={(e) => setEditingItem({...editingItem, data: {...editingItem.data, stock: parseFloat(e.target.value) || 0}})}
                                                    className="w-full bg-black border border-gray-800 p-6 rounded-[24px] font-mono text-4xl font-black outline-none focus:border-[#c1d72e] text-center"
                                                />
                                            </div>
                                            <div className="space-y-3">
                                                <label className="text-[9px] font-black text-red-400 uppercase tracking-widest flex justify-between">
                                                    <span>Punto de Reorden (Min)</span>
                                                    <span className="text-red-900/50">Alerta</span>
                                                </label>
                                                <input 
                                                    type="number" 
                                                    step="0.01"
                                                    value={editingItem.data.minStock || 0}
                                                    onChange={(e) => setEditingItem({...editingItem, data: {...editingItem.data, minStock: parseFloat(e.target.value) || 0}})}
                                                    className="w-full bg-black border border-red-900/50 p-6 rounded-[24px] font-mono text-4xl font-black outline-none focus:border-red-500 text-red-500 text-center"
                                                />
                                            </div>
                                            <div className="space-y-3">
                                                <label className="text-[9px] font-black text-indigo-400 uppercase tracking-widest flex justify-between">
                                                    <span>Límite de Bodega (Max)</span>
                                                    <span className="text-indigo-900/50">Tope</span>
                                                </label>
                                                <input 
                                                    type="number" 
                                                    step="0.01"
                                                    value={editingItem.data.maxStock || 0}
                                                    onChange={(e) => setEditingItem({...editingItem, data: {...editingItem.data, maxStock: parseFloat(e.target.value) || 0}})}
                                                    className="w-full bg-black border border-indigo-900/50 p-6 rounded-[24px] font-mono text-4xl font-black outline-none focus:border-indigo-500 text-indigo-400 text-center"
                                                />
                                            </div>
                                        </div>
                                    </section>
                                </div>
                            )}


                            {/* Pestaña: Conservación y Almacenaje */}
                            {activeTab === 'conservacion' && (
                                <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                    <section className="grid grid-cols-2 gap-10">
                                        <div className="space-y-6">
                                            <h4 className="text-[10px] font-black text-sky-400 uppercase tracking-[0.3em] mb-4 flex items-center gap-3">
                                                <span className="w-8 h-px bg-sky-500/30" /> Control Ambiental
                                            </h4>
                                            
                                            <div className="bg-sky-900/10 border border-sky-500/20 p-8 rounded-[32px] space-y-6">
                                                <div className="space-y-2">
                                                    <label className="text-[9px] font-black text-sky-400 uppercase tracking-widest block">Tipo de Almacén</label>
                                                    <select 
                                                        value={(editingItem.data.storageType || 'SECO')}
                                                        onChange={(e) => setEditingItem({...editingItem, data: {...editingItem.data, storageType: e.target.value}})}
                                                        className="w-full bg-black border border-sky-900/50 p-5 rounded-2xl font-black text-sm uppercase outline-none focus:border-sky-500 cursor-pointer text-sky-400"
                                                    >
                                                        <option value="SECO">📦 ALMACÉN DE SECOS (A/C O AMBIENTE)</option>
                                                        <option value="REFRIGERACION">❄️ REFRIGERACIÓN (2°C A 8°C)</option>
                                                        <option value="CONGELACION">🧊 CONGELACIÓN (-18°C)</option>
                                                        <option value="CONTROLADO">🌡️ TEMPERATURA CONTROLADA ESTRICTA</option>
                                                    </select>
                                                </div>

                                                <div className="grid grid-cols-2 gap-6 pt-4 border-t border-sky-900/30">
                                                    <div className="space-y-2">
                                                        <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Temp. Óptima (°C)</label>
                                                        <input 
                                                            type="number" 
                                                            step="0.1"
                                                            placeholder="Ej. 4.0"
                                                            value={editingItem.data.optTemp || ''}
                                                            onChange={(e) => setEditingItem({...editingItem, data: {...editingItem.data, optTemp: parseFloat(e.target.value)}})}
                                                            className="w-full bg-black border border-gray-800 p-5 rounded-2xl font-mono text-2xl font-black outline-none focus:border-sky-500 text-sky-300 placeholder-gray-700"
                                                        />
                                                    </div>
                                                    <div className="space-y-2">
                                                        <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Humedad Relativa (%)</label>
                                                        <input 
                                                            type="number" 
                                                            min="0" max="100"
                                                            placeholder="Ej. 60"
                                                            value={editingItem.data.relHumidity || ''}
                                                            onChange={(e) => setEditingItem({...editingItem, data: {...editingItem.data, relHumidity: parseInt(e.target.value)}})}
                                                            className="w-full bg-black border border-gray-800 p-5 rounded-2xl font-mono text-2xl font-black outline-none focus:border-sky-500 text-sky-300 placeholder-gray-700"
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="space-y-6">
                                            <h4 className="text-[10px] font-black text-amber-400 uppercase tracking-[0.3em] mb-4 flex items-center gap-3">
                                                <span className="w-8 h-px bg-amber-500/30" /> Manejo de Físicos
                                            </h4>
                                            
                                            <div className="bg-amber-900/10 border border-amber-500/20 p-8 rounded-[32px] space-y-6 flex flex-col h-full">
                                                <div className="space-y-2">
                                                    <label className="text-[9px] font-black text-amber-500 uppercase tracking-widest block">Apilamiento Máximo</label>
                                                    <div className="flex items-center gap-4">
                                                        <input 
                                                            type="number" 
                                                            placeholder="Ej. 5"
                                                            value={editingItem.data.maxStacking || ''}
                                                            onChange={(e) => setEditingItem({...editingItem, data: {...editingItem.data, maxStacking: parseInt(e.target.value)}})}
                                                            className="w-32 bg-black border border-amber-900/50 p-5 rounded-2xl font-mono text-2xl font-black outline-none focus:border-amber-500 text-amber-400 placeholder-gray-700 text-center"
                                                        />
                                                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Unidades / Cajas hacia arriba</span>
                                                    </div>
                                                </div>

                                                <div className="space-y-3 pt-4 border-t border-amber-900/30 flex-1">
                                                    <label className="text-[9px] font-black text-amber-500 uppercase tracking-widest block">Restricciones Categóricas</label>
                                                    <div className="flex flex-wrap gap-2">
                                                        {['Sensible a Luz', 'No voltear', 'Frágil', 'Lejos de Químicos', 'Ventilación Requerida'].map(tag => {
                                                            const isSelected = (editingItem.data.restrictions || []).includes(tag);
                                                            return (
                                                                <button
                                                                    key={tag}
                                                                    onClick={() => {
                                                                        const current = editingItem.data.restrictions || [];
                                                                        const next = isSelected ? current.filter(t => t !== tag) : [...current, tag];
                                                                        setEditingItem({...editingItem, data: {...editingItem.data, restrictions: next}});
                                                                    }}
                                                                    className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${isSelected ? 'bg-amber-500 text-black border border-amber-400' : 'bg-black/60 text-gray-500 border border-gray-800 hover:border-amber-500/50'}`}
                                                                >
                                                                    {tag}
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </section>
                                </div>
                            )}

                            {/* Pestaña: Logística y Flujos */}
                            {activeTab === 'logistica' && (
                                <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                    <section className="grid grid-cols-2 gap-10">
                                        <div className="space-y-6">
                                            <h4 className="text-[10px] font-black text-gray-500 uppercase tracking-[0.3em] flex items-center gap-3">
                                                <span className="w-8 h-px bg-gray-500/30" /> Abastecimiento
                                            </h4>

                                            <div className="space-y-2 bg-gray-900/40 p-8 rounded-[32px] border border-gray-800 h-full flex flex-col">
                                                <div className="flex-1 space-y-2">
                                                    <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest block mb-2">Proveedor Principal</label>
                                                    <select 
                                                        value={editingItem.data.provider || ''}
                                                        onChange={(e) => setEditingItem({...editingItem, data: {...editingItem.data, provider: e.target.value}})}
                                                        className="w-full bg-black border border-gray-800 p-5 rounded-2xl font-black text-xl uppercase outline-none focus:border-indigo-500 cursor-pointer text-indigo-400"
                                                    >
                                                        <option value="">-- SELECCIONAR PROVEEDOR --</option>
                                                        {PROVIDERS_MASTER.map(p => (
                                                            <option key={p.id} value={p.name}>{p.name} ({p.category})</option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div className="mt-6 flex flex-col gap-4">
                                                    <div className="space-y-2">
                                                        <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Lead Time (Tiempo de Entrega)</label>
                                                        <div className="flex items-center gap-3">
                                                            <input 
                                                                type="number" 
                                                                min="0"
                                                                placeholder="Ej. 3"
                                                                value={editingItem.data.leadTimeDays || ''}
                                                                onChange={(e) => setEditingItem({...editingItem, data: {...editingItem.data, leadTimeDays: parseInt(e.target.value)}})}
                                                                className="w-24 bg-black border border-gray-800 p-4 rounded-xl font-mono text-xl font-black outline-none focus:border-indigo-500 text-white text-center"
                                                            />
                                                            <span className="text-[10px] font-bold text-gray-500 uppercase">Días</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="space-y-6">
                                            <h4 className="text-[10px] font-black text-pink-400 uppercase tracking-[0.3em] flex items-center gap-3">
                                                <span className="w-8 h-px bg-pink-500/30" /> Alertas de Frescura y Caducidad
                                            </h4>
                                            
                                            <div className="bg-pink-900/10 border border-pink-500/20 p-8 rounded-[32px] space-y-6 h-full flex flex-col">
                                                <div className="space-y-4 flex-1">
                                                    <div className="space-y-2">
                                                        <label className="text-[9px] font-black text-pink-500 uppercase tracking-widest block">Periodo de Vida Útil (Shelf Life Máximo)</label>
                                                        <div className="flex gap-4 items-center">
                                                            <input 
                                                                type="number" 
                                                                min="0"
                                                                placeholder="Ej. 30"
                                                                value={editingItem.data.shelfLifeDays || ''}
                                                                onChange={(e) => setEditingItem({...editingItem, data: {...editingItem.data, shelfLifeDays: parseInt(e.target.value)}})}
                                                                className="w-24 bg-black border border-pink-900/50 p-4 rounded-xl font-mono text-xl font-black outline-none focus:border-pink-500 text-pink-400 text-center"
                                                            />
                                                            <span className="text-[10px] font-bold text-gray-400 uppercase">Días totales</span>
                                                        </div>
                                                    </div>

                                                    <div className="space-y-2 pt-6 border-t border-pink-900/30">
                                                        <label className="text-[9px] font-black text-pink-500 uppercase tracking-widest block">Días Previos para Alerta Visual Roja</label>
                                                        <div className="flex gap-4 items-center">
                                                            <input 
                                                                type="number" 
                                                                min="0"
                                                                placeholder="Ej. 5"
                                                                value={editingItem.data.alertDays || ''}
                                                                onChange={(e) => setEditingItem({...editingItem, data: {...editingItem.data, alertDays: parseInt(e.target.value)}})}
                                                                className="w-24 bg-black border border-red-900/50 p-4 rounded-xl font-mono text-xl font-black outline-none focus:border-red-500 text-red-500 text-center"
                                                            />
                                                            <p className="text-[10px] font-bold text-gray-400 leading-relaxed flex-1">
                                                                Avisar si caduca en <span className="text-red-400 font-bold">{editingItem.data.alertDays || 0}</span> días o menos. La ficha se pintará de rojo en el dashboard.
                                                            </p>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </section>
                                </div>
                            )}
                        </div>

                        <footer className="p-10 bg-black/40 border-t border-gray-800 flex justify-end gap-6">
                            <button 
                                onClick={() => setEditingItem(null)}
                                className="px-10 py-5 bg-gray-900 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-gray-800 transition-all border border-gray-800"
                            >
                                Cancelar
                            </button>
                            <button 
                                onClick={() => handleUpdateItemInventory(editingItem.whId, editingItem.productSku, editingItem.data)}
                                className="px-12 py-5 bg-indigo-600 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-xl shadow-indigo-600/20"
                            >
                                Guardar Ficha Logística
                            </button>
                        </footer>
                    </div>
                </div>
            )}

            {/* Modal: Bóveda de Insumos Descontinuados */}
            {showDiscontinuedVault && (
                <div className="fixed inset-0 z-[300] flex items-center justify-center p-6 animate-in fade-in zoom-in duration-300">
                    <div className="absolute inset-0 bg-black/95 backdrop-blur-3xl" onClick={() => setShowDiscontinuedVault(false)} />
                    <div className="relative w-full max-w-5xl bg-[#0a0a0a] border border-orange-900/30 rounded-[48px] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                        
                        <header className="p-8 border-b border-orange-900/30 flex justify-between items-center bg-gradient-to-r from-orange-900/20 to-black">
                            <div className="flex items-center gap-6">
                                <div className="w-16 h-16 bg-orange-500/10 rounded-2xl flex items-center justify-center text-3xl border border-orange-500/20">
                                    📦
                                </div>
                                <div>
                                    <h3 className="text-3xl font-black uppercase italic tracking-tighter text-orange-400">Bóveda Magnética</h3>
                                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mt-1">Insumos y Formatos Descontinuados (Soft Delete)</p>
                                </div>
                            </div>
                            <button onClick={() => setShowDiscontinuedVault(false)} className="text-gray-500 hover:text-white text-3xl">✕</button>
                        </header>

                        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar bg-black">
                            {discontinuedItems.length === 0 ? (
                                <div className="h-64 flex flex-col items-center justify-center text-center opacity-50">
                                    <span className="text-6xl mb-6 grayscale">🗑️</span>
                                    <h4 className="text-xl font-black text-gray-400 uppercase tracking-widest">Bóveda Vacía</h4>
                                    <p className="text-xs text-gray-600 font-bold uppercase mt-2">No hay insumos archivados temporalmente</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 gap-4">
                                    {discontinuedItems.map((item, index) => (
                                        <div key={item.sku + index} className="bg-gray-900/40 border border-gray-800 p-6 rounded-3xl flex items-center justify-between group hover:border-orange-500/30 transition-all">
                                            <div className="flex flex-col gap-1">
                                                <div className="flex items-center gap-3">
                                                    <span className="text-xs font-mono text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded border border-orange-500/20">
                                                        SKU: {item.sku}
                                                    </span>
                                                    <span className="text-[9px] font-black text-gray-600 uppercase">
                                                        Archivado el: {new Date(item.archiveDate).toLocaleDateString()}
                                                    </span>
                                                </div>
                                                <h4 className="text-xl font-black uppercase italic text-white">{item.name}</h4>
                                                <p className="text-[10px] font-bold text-gray-500 uppercase">
                                                    Stock Restante: {item.stock} {item.unit} | Original de: Almacén {item.archivedFromWhId}
                                                </p>
                                            </div>
                                            
                                            <div className="flex gap-4">
                                                <button 
                                                    onClick={() => {
                                                        setRestoreDialog({
                                                            isOpen: true,
                                                            itemIndex: index,
                                                            itemName: item.name,
                                                            originalWhId: item.archivedFromWhId,
                                                            targetWhId: item.archivedFromWhId
                                                        });
                                                    }}
                                                    className="bg-indigo-600/20 border border-indigo-500/30 px-6 py-3 rounded-xl flex items-center gap-2 text-indigo-400 hover:bg-indigo-600 hover:text-white transition-all font-black text-[10px] uppercase tracking-widest"
                                                >
                                                    <span>♻️ Restaurar</span>
                                                </button>
                                                
                                                <button 
                                                    onClick={() => {
                                                        setConfirmDestroyDialog({
                                                            isOpen: true,
                                                            itemIndex: index,
                                                            itemName: item.name
                                                        });
                                                    }}
                                                    className="bg-red-600/10 border border-red-500/20 px-6 py-3 rounded-xl flex items-center gap-2 text-red-500 hover:bg-red-600 hover:text-white transition-all font-black text-[10px] uppercase tracking-widest"
                                                >
                                                    <span>💥 Destruir</span>
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de Confirmación: ARCHIVAR */}
            {confirmArchiveDialog.isOpen && (
                <div className="fixed inset-0 z-[400] flex items-center justify-center p-6 animate-in fade-in duration-200">
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setConfirmArchiveDialog({...confirmArchiveDialog, isOpen: false})} />
                    <div className="relative w-full max-w-sm bg-gray-900 border border-orange-500/30 rounded-3xl p-8 shadow-2xl text-center">
                        <div className="w-20 h-20 bg-orange-500/10 rounded-full flex items-center justify-center text-4xl mx-auto mb-6 border border-orange-500/20">📦</div>
                        <h3 className="text-xl font-black uppercase italic tracking-tighter mb-2">¿Archivar Artículo?</h3>
                        <p className="text-sm text-gray-400 mb-6">
                            Estás a punto de mover <span className="text-orange-400 font-bold">{confirmArchiveDialog.itemName}</span> a la Bóveda Magnética. Podrás restaurarlo después.
                        </p>
                        <div className="flex gap-4">
                            <button 
                                onClick={() => setConfirmArchiveDialog({...confirmArchiveDialog, isOpen: false})}
                                className="flex-1 bg-gray-800 text-white p-4 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-gray-700 transition"
                            >
                                Cancelar
                            </button>
                            <button 
                                onClick={executeArchiveItem}
                                className="flex-1 bg-orange-600 text-white p-4 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-orange-500 transition shadow-lg shadow-orange-600/30"
                            >
                                Archivar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de Confirmación: DESTRUIR */}
            {confirmDestroyDialog.isOpen && (
                <div className="fixed inset-0 z-[400] flex items-center justify-center p-6 animate-in fade-in duration-200">
                    <div className="absolute inset-0 bg-red-950/80 backdrop-blur-md" onClick={() => setConfirmDestroyDialog({...confirmDestroyDialog, isOpen: false})} />
                    <div className="relative w-full max-w-md bg-[#0a0a0a] border border-red-500/50 rounded-3xl p-8 shadow-2xl text-center">
                        <div className="w-24 h-24 bg-red-500/10 rounded-full flex items-center justify-center text-5xl mx-auto mb-6 border border-red-500/30 animate-pulse">⚠️</div>
                        <h3 className="text-2xl font-black uppercase italic tracking-tighter text-red-500 mb-2">Destrucción Permanente</h3>
                        <p className="text-sm text-gray-400 mb-6 leading-relaxed">
                            Vas a eliminar <span className="text-white font-bold">{confirmDestroyDialog.itemName}</span> de todo el sistema de forma definitiva. <strong className="text-red-400">Esta acción no se puede deshacer y puede afectar históricos de costeo.</strong>
                        </p>
                        <div className="flex gap-4">
                            <button 
                                onClick={() => setConfirmDestroyDialog({...confirmDestroyDialog, isOpen: false})}
                                className="flex-1 bg-gray-800 text-white p-4 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-gray-700 transition"
                            >
                                Abortar
                            </button>
                            <button 
                                onClick={executeDestroyItem}
                                className="flex-1 bg-red-600 text-white p-4 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-red-500 transition shadow-lg shadow-red-600/30"
                            >
                                Confirmar Destrucción
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de Interacción: RESTAURAR */}
            {restoreDialog.isOpen && (
                <div className="fixed inset-0 z-[400] flex items-center justify-center p-6 animate-in fade-in duration-200">
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setRestoreDialog({...restoreDialog, isOpen: false})} />
                    <div className="relative w-full max-w-md bg-gray-900 border border-indigo-500/30 rounded-3xl p-8 shadow-2xl">
                        <div className="flex items-center gap-4 mb-6">
                            <div className="w-14 h-14 bg-indigo-500/10 rounded-2xl flex items-center justify-center text-2xl border border-indigo-500/20">♻️</div>
                            <div>
                                <h3 className="text-xl font-black uppercase italic tracking-tighter">Restaurar Insumo</h3>
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{restoreDialog.itemName}</p>
                            </div>
                        </div>
                        
                        <div className="mb-6">
                            <label className="text-[9px] font-black uppercase text-gray-600 mb-2 block tracking-widest">Almacén Destino</label>
                            <select 
                                value={restoreDialog.targetWhId}
                                onChange={(e) => setRestoreDialog({...restoreDialog, targetWhId: e.target.value})}
                                className="w-full bg-black/60 border border-gray-800 p-4 rounded-2xl font-black text-xs outline-none focus:border-indigo-500 appearance-none text-white"
                            >
                                <option value="" disabled>Selecciona un almacén...</option>
                                {warehouses.map(wh => (
                                    <option key={wh.id} value={wh.id}>
                                        {wh.id === restoreDialog.originalWhId ? `★ ${wh.name} (Origen Original)` : wh.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="flex gap-4">
                            <button 
                                onClick={() => setRestoreDialog({...restoreDialog, isOpen: false})}
                                className="flex-1 bg-gray-800 text-white p-4 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-gray-700 transition"
                            >
                                Cancelar
                            </button>
                            <button 
                                onClick={executeRestoreItem}
                                className="flex-1 bg-indigo-600 text-white p-4 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-500 transition shadow-lg shadow-indigo-600/30"
                            >
                                Ejecutar Restauración
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
