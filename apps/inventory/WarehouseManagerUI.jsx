import React, { useState, useMemo, useEffect, useRef } from 'react';
import axios from 'axios';
import REAL_PRODUCTS from '../../importar_productos_AQUI.json';
import { PROVIDERS_MASTER } from './PurchaseManagerUI';
import { CONFIG } from '../pos/config';

const API_BASE = CONFIG.API_BASE_URL.replace('/api/v1', '');

/**
 * R DE RICO - WAREHOUSE & STORAGE MANAGER
 * 
 * Hub visual para gestión de ubicaciones físicas, stock por almacén
 * y control de accesos operativos.
 */

const INITIAL_TYPES = {
    ALMACEN: { label: 'Almacén General', color: 'text-indigo-400', bg: 'bg-indigo-500/10', border: 'border-indigo-500/20' },
    ALMACEN_EXHIBIDOR: { label: 'Almacén/Exhibidor', color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
    EXHIBIDOR_PAN_DULCE: { label: 'Exhibidor Pan Dulce', color: 'text-pink-400', bg: 'bg-pink-500/10', border: 'border-pink-500/20' },
    EXHIBIDOR_PAN_BLANCO: { label: 'Exhibidor Pan Blanco', color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/20' },
};

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

export const WarehouseManagerUI = () => {
    const [warehouses, setWarehouses] = useState([]);
    const [showAiScanner, setShowAiScanner] = useState(false);
    
    const fetchWarehouses = async () => {
        try {
            const res = await axios.get(`${API_BASE}/api/v1/warehouse`);
            // Mapear campos API (español) → campos UI (inglés)
            const mapped = res.data.map(wh => ({
                ...wh,
                name: wh.nombre || wh.name || 'Sin nombre',
                type: wh.zona_termica || wh.type || 'SECO',
                icon: wh.zona_termica === 'CONGELADO' ? '❄️' : wh.zona_termica === 'REFRIGERADO' ? '🧊' : '📦',
                capacity: 100,
                current: 0
            }));
            setWarehouses(mapped);
        } catch(e) {
            console.error(e);
        }
    };

    useEffect(() => {
        fetchWarehouses();
    }, []);
    const [warehouseTypes, setWarehouseTypes] = useState(INITIAL_TYPES);
    const [selectedWH, setSelectedWH] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterType, setFilterType] = useState('ALL');
    const [activeTab, setActiveTab] = useState('existencias');
    const [selectedZone, setSelectedZone] = useState(null); // null = landing, 'SECO'|'REFRIGERADO'|'CONGELADO' = suite
    const [suiteTab, setSuiteTab] = useState('existencias'); // Pestaña activa en la suite de zona
    const [subCategoryTab, setSubCategoryTab] = useState('EXHIBICION_VENTA'); // Subcategoría activa: EXHIBICION_VENTA | ALMACENAMIENTO | EQUIPAMIENTO

    const [showItemPicker, setShowItemPicker] = useState(false);
    const [pickerSearch, setPickerSearch] = useState('');
    const [showWHEditor, setShowWHEditor] = useState(false);
    const [showTypeManager, setShowTypeManager] = useState(false);
    const [editingWHData, setEditingWHData] = useState(null);
    const [whToDelete, setWhToDelete] = useState(null);
    const [newTypeLabel, setNewTypeLabel] = useState('');
    const [editingItem, setEditingItem] = useState(null); // { whId, productSku, data }

    // --- Fase 1F: Estados operativos ---
    const [insumos, setInsumos] = useState([]);
    const [movements, setMovements] = useState([]);
    const [loadingOp, setLoadingOp] = useState(false);
    const [opMessage, setOpMessage] = useState({ text: '', type: '' }); // type: 'success' | 'error'
    // Entrada Masiva
    const [bulkEntryItems, setBulkEntryItems] = useState([]);
    const [bulkTargetWH, setBulkTargetWH] = useState('');
    const [bulkInsumoSearch, setBulkInsumoSearch] = useState('');
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
        } catch(e) { console.error('Error fetching insumos:', e); }
    };

    const fetchMovements = async (almacenId = null) => {
        try {
            const url = almacenId 
                ? `${API_BASE}/api/v1/warehouse/movimientos?almacen_id=${almacenId}&limit=200`
                : `${API_BASE}/api/v1/warehouse/movimientos?limit=200`;
            const res = await axios.get(url);
            setMovements(res.data || []);
        } catch(e) { console.error('Error fetching movements:', e); }
    };

    const fetchWarehouseStock = async (whId) => {
        try {
            const res = await axios.get(`${API_BASE}/api/v1/warehouse/${whId}/stock`);
            return res.data || [];
        } catch(e) { console.error('Error fetching stock:', e); return []; }
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

    const handleSubmitBulkEntry = async () => {
        if (!bulkTargetWH || bulkEntryItems.length === 0) {
            showOpMessage('Selecciona un almacén destino y agrega al menos un insumo', 'error');
            return;
        }
        const invalidItems = bulkEntryItems.filter(i => !i.cantidad || i.cantidad <= 0);
        if (invalidItems.length > 0) {
            showOpMessage('Todos los items deben tener cantidad mayor a 0', 'error');
            return;
        }
        setLoadingOp(true);
        try {
            const payload = {
                items: bulkEntryItems.map(i => ({
                    item_id: i.item_id,
                    item_type: i.item_type || 'INSUMO',
                    cantidad: parseFloat(i.cantidad),
                    notas: i.notas || null
                })),
                usuario_id: 'VICTOR'
            };
            await axios.post(`${API_BASE}/api/v1/warehouse/${bulkTargetWH}/entrada-masiva`, payload);
            showOpMessage(`✅ Entrada masiva registrada: ${bulkEntryItems.length} items en lote`);
            setBulkEntryItems([]);
            setBulkTargetWH('');
        } catch(e) {
            showOpMessage(`❌ Error: ${e.response?.data?.detail || e.message}`, 'error');
        } finally { setLoadingOp(false); }
    };

    const handleSubmitMerma = async () => {
        const { almacen_id, item_id, item_type, cantidad, notas } = mermaForm;
        if (!almacen_id || !item_id || !cantidad || !notas) {
            showOpMessage('Todos los campos son obligatorios (especialmente las notas/motivo)', 'error');
            return;
        }
        setLoadingOp(true);
        try {
            await axios.post(`${API_BASE}/api/v1/warehouse/${almacen_id}/mermas`, {
                item_id, item_type, cantidad: parseFloat(cantidad), notas, usuario_id: 'VICTOR'
            });
            showOpMessage(`✅ Merma registrada correctamente`);
            setMermaForm({ almacen_id: '', item_id: '', item_type: 'INSUMO', cantidad: '', notas: '' });
        } catch(e) {
            showOpMessage(`❌ Error: ${e.response?.data?.detail || e.message}`, 'error');
        } finally { setLoadingOp(false); }
    };

    const handleSubmitTraspaso = async () => {
        const { almacen_origen_id, almacen_destino_id, item_id, item_type, cantidad } = traspasoForm;
        if (!almacen_origen_id || !almacen_destino_id || !item_id || !cantidad) {
            showOpMessage('Todos los campos son obligatorios', 'error');
            return;
        }
        if (almacen_origen_id === almacen_destino_id) {
            showOpMessage('Origen y destino no pueden ser el mismo almacén', 'error');
            return;
        }
        setLoadingOp(true);
        try {
            await axios.post(`${API_BASE}/api/v1/warehouse/traspasos`, {
                almacen_origen_id, almacen_destino_id, item_id, item_type,
                cantidad: parseFloat(cantidad), usuario_id: 'VICTOR'
            });
            showOpMessage(`✅ Traspaso ejecutado correctamente`);
            setTraspasoForm({ almacen_origen_id: '', almacen_destino_id: '', item_id: '', item_type: 'INSUMO', cantidad: '' });
        } catch(e) {
            showOpMessage(`❌ Error: ${e.response?.data?.detail || e.message}`, 'error');
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

    const filteredWH = warehouses.filter(wh => {
        const matchesSearch = (wh.name || '').toLowerCase().includes(searchTerm.toLowerCase());
        const matchesType = filterType === 'ALL' || wh.type === filterType;
        const matchesZone = !selectedZone || (wh.zona_termica || wh.type) === selectedZone;
        return matchesSearch && matchesType && matchesZone;
    });

    const handleAddType = () => {
        if (!newTypeLabel.trim()) return;
        const key = `TYPE_${Date.now()}`;
        const colors = [
            { color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
            { color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
            { color: 'text-pink-400', bg: 'bg-pink-500/10', border: 'border-pink-500/20' },
            { color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20' },
            { color: 'text-indigo-400', bg: 'bg-indigo-500/10', border: 'border-indigo-500/20' },
            { color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' }
        ];
        const randomColor = colors[Math.floor(Math.random() * colors.length)];
        
        setWarehouseTypes({
            ...warehouseTypes,
            [key]: { label: newTypeLabel, ...randomColor }
        });
        setNewTypeLabel('');
    };

    const handleRenameType = (key, newLabel) => {
        setWarehouseTypes({
            ...warehouseTypes,
            [key]: { ...warehouseTypes[key], label: newLabel }
        });
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
                const mappedStock = stockData.map(item => ({
                    sku: item.item_id,
                    name: item.item_name || item.item_id,
                    category: item.item_type,
                    stock: item.cantidad_actual,
                    unit: item.item_unit || 'PZA',
                    minStock: item.stock_minimo,
                    alertDays: item.dias_anaquel_alerta || 0,
                    presentation: '1 ' + (item.item_unit || 'PZA'),
                    costPerPresentation: item.item_price || 0,
                    imgUrl: item.item_image_url || null,
                    provider: 'PROVEEDOR GENERAL' // Default temporal
                }));
                setWhInventories(prev => ({ ...prev, [selectedWH.id]: mappedStock }));
            }
        };
        loadStock();
    }, [selectedWH]);

    const getWHContent = (whId) => {
        return whInventories[whId] || [];
    };

    const handleSaveWH = async (formData) => {
        try {
            if (formData.id && !formData.id.startsWith('wh_')) {
                await axios.put(`${API_BASE}/api/v1/warehouse/${formData.id}`, formData);
            } else {
                const payload = {
                    nombre: formData.name,
                    zona_termica: formData.type || selectedZone || 'SECO',
                    proposito: formData.proposito || subCategoryTab || 'EXHIBICION_VENTA',
                    activo: true
                };
                await axios.post(`${API_BASE}/api/v1/warehouse`, payload);
            }
            fetchWarehouses();
            setShowWHEditor(false);
            setEditingWHData(null);
        } catch(e) {
            alert('Error guardando almacén');
        }
    };

    const handleDeleteWH = async (whId) => {
        try {
            await axios.delete(`${API_BASE}/api/v1/warehouse/${whId}`);
            setWarehouses(warehouses.filter(wh => wh.id !== whId));
            setWhToDelete(null);
            setSelectedWH(null);
        } catch(e) {
            alert(e.response?.data?.detail || 'Error eliminando almacén');
        }
    };

    const addItemToWH = async (product) => {
        const payload = {
            sku: product.sku,
            name: product.name,
            quantity: 0,
            unit: product.unit || 'PZA',
            category: product.category || 'NA',
            price: product.price || 0
        };
        try {
            await axios.post(`${API_BASE}/api/v1/warehouse/${selectedWH.id}/items`, payload);
            fetchWarehouses();
            
            const res = await axios.get(`${API_BASE}/api/v1/warehouse`);
            const updated = res.data.find(w => w.id === selectedWH.id);
            if(updated) setSelectedWH(updated);
            
            setShowItemPicker(false);
        } catch(e) {
            alert('Error agregando artículo');
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
            alert("⚠️ No se puede guardar la ficha técnica. Faltan datos críticos:\n\n" + validationErrors.map(e => "• " + e).join("\n"));
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
            alert("Error al subir imagen");
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
            alert("Selecciona un Almacén Destino");
            return;
        }

        const currentWhContent = getWHContent(targetWhId);
        if(!currentWhContent) { 
            alert("ID de Almacén inválido."); 
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

    const SUB_CATEGORIES = [
        { key: 'EXHIBICION_VENTA', label: 'Almacenes / Exhibidores', icon: '🏪' },
        { key: 'ALMACENAMIENTO', label: 'Almacenes de Insumos', icon: '📦' },
        { key: 'EQUIPAMIENTO', label: 'Almacenes de Equipamiento', icon: '🔧' },
    ];
    const ZONE_META = { 
        SECO: { icon: '📦', accent: 'text-amber-300', label: 'SECOS', badge: 'bg-amber-400/20 text-amber-200 border-amber-400/40' }, 
        REFRIGERADO: { icon: '🧊', accent: 'text-blue-300', label: 'REFRIGERADOS', badge: 'bg-blue-400/20 text-blue-200 border-blue-400/40' }, 
        CONGELADO: { icon: '❄️', accent: 'text-cyan-200', label: 'CONGELADOS', badge: 'bg-cyan-400/20 text-cyan-100 border-cyan-300/40' } 
    };
    const zoneMeta = ZONE_META[selectedZone] || ZONE_META.SECO;

    return (
        <div className="w-full min-h-screen text-white p-8 font-sans" style={INOX_CONTAINER_STYLE}>

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

            {/* === BARRA DE SUBCATEGORÍAS (solo en Existencias con zona) === */}
            {selectedZone && suiteTab === 'existencias' && (
            <div className="mb-4 bg-slate-900/50 border border-slate-500/30 rounded-2xl p-1.5 flex gap-1 w-max backdrop-blur-md">
                {SUB_CATEGORIES.map(sc => (
                    <button
                        key={sc.key}
                        onClick={() => setSubCategoryTab(sc.key)}
                        className={`flex items-center gap-2 px-5 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${
                            subCategoryTab === sc.key
                                ? 'bg-slate-700/80 text-white shadow-md border border-slate-400/30'
                                : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                        }`}
                    >
                        <span className="text-sm">{sc.icon}</span>
                        {sc.label}
                    </button>
                ))}
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
                    <header className="mb-12 flex justify-between items-end">
                        <div className="flex gap-4 flex-1 justify-end max-w-[70%]">
                            <div className="bg-slate-900/50 border border-slate-500/30 rounded-2xl p-1 flex overflow-x-auto custom-scrollbar no-scrollbar flex-1">
                                <button 
                                    onClick={() => setFilterType('ALL')}
                                    className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${filterType === 'ALL' ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-white'}`}
                                >
                                    Todos
                                </button>
                                {Object.entries(warehouseTypes).map(([key, info]) => (
                                    <button 
                                        key={key}
                                        onClick={() => setFilterType(key)}
                                        className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${filterType === key ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-white'}`}
                                    >
                                        {info.label}
                                    </button>
                                ))}
                            </div>
                            <button 
                                onClick={() => setShowTypeManager(true)}
                                className="w-12 h-12 bg-slate-800/80 border border-slate-500/30 rounded-2xl flex items-center justify-center hover:border-slate-300 transition-all text-xs"
                                title="Gestionar Categorías"
                            >
                                ⚙️
                            </button>
                            <button 
                                onClick={() => {
                                    setEditingWHData({ name: '', type: selectedZone || 'SECO', icon: '📦', capacity: 100, proposito: subCategoryTab });
                                    setShowWHEditor(true);
                                }}
                                className="bg-slate-600 px-6 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-xl shadow-slate-600/20 whitespace-nowrap text-white"
                            >
                                + Nuevo Almacén
                            </button>
                        </div>
                    </header>

                    <div className="mb-8 overflow-hidden">
                        <input 
                            type="text" 
                            placeholder="Buscar almacén por nombre..."
                            className="w-full bg-slate-900/50 border border-slate-500/30 p-6 rounded-[32px] outline-none focus:border-slate-300 font-bold text-lg transition-all text-white placeholder-slate-400"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {subCatWarehouses.filter(wh => {
                            const matchesSearch = (wh.name || '').toLowerCase().includes(searchTerm.toLowerCase());
                            const matchesType = filterType === 'ALL' || wh.type === filterType;
                            return matchesSearch && matchesType;
                        }).map(wh => {
                            const typeInfo = warehouseTypes[wh.type] || { label: wh.type, color: 'text-gray-400', bg: 'bg-gray-500/10', border: 'border-gray-500/20' };
                            const fillPercent = (wh.current / wh.capacity) * 100;
                            
                            return (
                                <div 
                                    key={wh.id}
                                    onClick={() => setSelectedWH(wh)}
                                    className={`group relative bg-slate-900/50 border border-slate-500/25 p-8 rounded-[40px] hover:bg-slate-800/60 transition-all cursor-pointer overflow-hidden`}
                                >
                                    <div className="flex justify-between items-start mb-6">
                                        <span className="text-5xl group-hover:scale-110 transition-transform duration-500">{wh.icon}</span>
                                        <span className={`text-[8px] font-black uppercase px-3 py-1 rounded-full ${typeInfo.bg} ${typeInfo.color} tracking-widest`}>
                                            {typeInfo.label}
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
                                    <span className="text-3xl">{selectedWH.icon}</span>
                                    <h2 className="text-2xl font-black uppercase italic tracking-tighter">{selectedWH.name}</h2>
                                    <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded ${warehouseTypes[selectedWH.type]?.bg || 'bg-gray-500/10'} ${warehouseTypes[selectedWH.type]?.color || 'text-gray-400'}`}>
                                        {warehouseTypes[selectedWH.type]?.label || selectedWH.type}
                                    </span>
                                </div>
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Explorando contenido y existencias</p>
                            </div>
                        </div>
                        <div className="flex gap-4">
                            <button 
                                onClick={() => {
                                    setEditingWHData(selectedWH);
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
                        
                        <div className="space-y-6">
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

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[9px] font-black uppercase text-gray-600 mb-2 block tracking-widest">Tipo de Almacén</label>
                                    <select 
                                        value={editingWHData.type}
                                        onChange={(e) => setEditingWHData({...editingWHData, type: e.target.value})}
                                        className="w-full bg-black/60 border border-gray-800 p-4 rounded-2xl font-black text-[10px] uppercase outline-none focus:border-indigo-500 appearance-none"
                                    >
                                        {Object.entries(warehouseTypes).map(([val, info]) => (
                                            <option key={val} value={val}>{info.label}</option>
                                        ))}
                                    </select>
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
                                </div>
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

            {/* Modal: Gestor de Categorías (WAREHOUSE_TYPES) */}
            {showTypeManager && (
                <div className="fixed inset-0 z-[300] flex items-center justify-center p-6 animate-in fade-in duration-300">
                    <div className="absolute inset-0 bg-black/95 backdrop-blur-2xl" onClick={() => setShowTypeManager(false)} />
                    <div className="relative w-full max-w-2xl bg-[#0a0a0a] border border-gray-800 rounded-[40px] shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
                        <header className="p-10 border-b border-gray-800 flex justify-between items-center">
                            <div>
                                <h3 className="text-2xl font-black uppercase italic tracking-tighter text-indigo-400">Gestionar Categorías</h3>
                                <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mt-2">Personaliza los tipos de almacén en el sistema</p>
                            </div>
                            <button onClick={() => setShowTypeManager(false)} className="text-gray-500 hover:text-white">✕</button>
                        </header>
                        
                        <div className="flex-1 overflow-y-auto p-10 space-y-4 custom-scrollbar">
                            <div className="flex gap-4 mb-8">
                                <input 
                                    type="text" 
                                    placeholder="Nueva categoría (ej: Cava de Vinos)"
                                    className="flex-1 bg-black border border-gray-800 p-4 rounded-2xl text-sm font-bold outline-none focus:border-indigo-500"
                                    value={newTypeLabel}
                                    onChange={(e) => setNewTypeLabel(e.target.value.toUpperCase())}
                                />
                                <button 
                                    onClick={handleAddType}
                                    className="bg-indigo-600 px-8 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-all"
                                >
                                    + Añadir
                                </button>
                            </div>

                            <div className="space-y-3">
                                <p className="text-[9px] font-black text-gray-600 uppercase tracking-widest mb-4">Categorías Existentes</p>
                                {Object.entries(warehouseTypes).map(([key, info]) => (
                                    <div key={key} className="bg-white/5 border border-white/10 p-4 rounded-2xl flex items-center justify-between group">
                                        <input 
                                            type="text" 
                                            value={info.label}
                                            onChange={(e) => handleRenameType(key, e.target.value.toUpperCase())}
                                            className="bg-transparent border-none outline-none text-xs font-black uppercase italic text-gray-300 focus:text-white w-full mr-4"
                                        />
                                        <div className="flex items-center gap-3">
                                            <div className={`w-3 h-3 rounded-full ${info.bg.replace('10', '40')}`} />
                                            <span className="text-[8px] font-black text-gray-600 font-mono opacity-0 group-hover:opacity-100 transition-opacity uppercase">{key}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <footer className="p-8 bg-black/40 border-t border-gray-800 flex justify-end">
                            <button 
                                onClick={() => setShowTypeManager(false)}
                                className="bg-[#c1d72e] px-10 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest text-black hover:scale-105 active:scale-95 transition-all"
                            >
                                Listo
                            </button>
                        </footer>
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
                                alert('Simulando escaneo: 12 piezas de Concha Blanca detectadas.');
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
