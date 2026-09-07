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

    const [showItemPicker, setShowItemPicker] = useState(false);
    const [pickerSearch, setPickerSearch] = useState('');
    const [showWHEditor, setShowWHEditor] = useState(false);
    const [showTypeManager, setShowTypeManager] = useState(false);
    const [editingWHData, setEditingWHData] = useState(null);
    const [whToDelete, setWhToDelete] = useState(null);
    const [newTypeLabel, setNewTypeLabel] = useState('');
    const [editingItem, setEditingItem] = useState(null); // { whId, productSku, data }

    // Bóveda de Insumos Descontinuados
    const [discontinuedItems, setDiscontinuedItems] = useState([]);
    const [showDiscontinuedVault, setShowDiscontinuedVault] = useState(false);

    // Modales de UI Customizados (Reemplazos nativos)
    const [confirmArchiveDialog, setConfirmArchiveDialog] = useState({ isOpen: false, whId: null, productSku: null, itemName: '' });
    const [confirmDestroyDialog, setConfirmDestroyDialog] = useState({ isOpen: false, itemIndex: null, itemName: '' });
    const [restoreDialog, setRestoreDialog] = useState({ isOpen: false, itemIndex: null, itemName: '', originalWhId: '', targetWhId: '' });

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

    const getWHContent = (whId) => {
        const wh = warehouses.find(w => w.id === whId);
        return wh ? wh.items : [];
    };

    const handleSaveWH = async (formData) => {
        try {
            if (formData.id && !formData.id.startsWith('wh_')) {
                await axios.put(`${API_BASE}/api/v1/warehouse/${formData.id}`, formData);
            } else {
                const payload = {
                    name: formData.name,
                    type: formData.type,
                    icon: formData.icon,
                    capacity: formData.capacity,
                    active: true
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

    // --- LANDING: Selección de Zona Térmica ---
    if (!selectedZone) {
        const ZONES = [
            { key: 'SECO', label: 'ALMACENES SECOS', icon: '📦', desc: 'Harinas, azúcar, empaques, pan', color: 'from-amber-900/40 to-amber-700/10', border: 'border-amber-600/30', accent: 'text-amber-400', count: warehouses.filter(w => (w.zona_termica || w.type) === 'SECO').length },
            { key: 'REFRIGERADO', label: 'ALMACENES REFRIGERADOS', icon: '🧊', desc: 'Lácteos, mantequilla, cremas', color: 'from-blue-900/40 to-blue-700/10', border: 'border-blue-500/30', accent: 'text-blue-400', count: warehouses.filter(w => (w.zona_termica || w.type) === 'REFRIGERADO').length },
            { key: 'CONGELADO', label: 'ALMACENES CONGELADOS', icon: '❄️', desc: 'Helados, paletas, cámara fría', color: 'from-cyan-900/40 to-cyan-700/10', border: 'border-cyan-400/30', accent: 'text-cyan-300', count: warehouses.filter(w => (w.zona_termica || w.type) === 'CONGELADO').length },
        ];
        return (
            <div className="bg-gradient-to-br from-[#2b2f36] via-[#1f2228] to-[#35393f] min-h-screen text-white p-8 font-sans" style={{backgroundImage: 'linear-gradient(135deg, rgba(255,255,255,0.03) 0%, transparent 50%, rgba(255,255,255,0.02) 100%)'}}>
                <div className="max-w-5xl mx-auto">
                    <div className="text-center mb-16 pt-8">
                        <h1 className="text-5xl font-black uppercase italic tracking-tighter bg-gradient-to-r from-gray-200 via-white to-gray-300 bg-clip-text text-transparent" style={{textShadow: '0 0 40px rgba(255,255,255,0.1)'}}>GESTIÓN DE ALMACENES</h1>
                        <p className="text-[11px] font-black text-gray-400 uppercase tracking-[0.4em] mt-4">CENTRO LOGÍSTICO DE INVENTARIOS | R DE RICO</p>
                        <p className="text-gray-500 text-sm mt-2">{warehouses.length} almacenes registrados</p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        {ZONES.map(zone => (
                            <button
                                key={zone.key}
                                onClick={() => setSelectedZone(zone.key)}
                                className={`group relative bg-gradient-to-br ${zone.color} border ${zone.border} rounded-[32px] p-10 text-left transition-all duration-300 hover:scale-[1.03] hover:shadow-2xl active:scale-[0.98]`}
                            >
                                <div className="text-6xl mb-6 group-hover:scale-110 transition-transform duration-300">{zone.icon}</div>
                                <h2 className={`text-xl font-black uppercase tracking-tight ${zone.accent}`}>{zone.label}</h2>
                                <p className="text-gray-500 text-xs mt-2 font-medium">{zone.desc}</p>
                                <div className={`mt-6 flex items-center justify-between`}>
                                    <span className={`text-4xl font-black ${zone.accent}`}>{zone.count}</span>
                                    <span className="text-gray-600 text-[10px] font-black uppercase tracking-widest">ALMACENES →</span>
                                </div>
                                <div className={`absolute inset-0 rounded-[32px] border-2 ${zone.border} opacity-0 group-hover:opacity-100 transition-opacity duration-300`} />
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    // --- SUITE: Almacenes filtrados por zona ---
    const zoneWarehouses = warehouses.filter(w => (w.zona_termica || w.type) === selectedZone);
    const ZONE_META = { SECO: { icon: '📦', accent: 'text-amber-400', label: 'SECOS' }, REFRIGERADO: { icon: '🧊', accent: 'text-blue-400', label: 'REFRIGERADOS' }, CONGELADO: { icon: '❄️', accent: 'text-cyan-300', label: 'CONGELADOS' } };
    const zoneMeta = ZONE_META[selectedZone] || ZONE_META.SECO;

    return (
        <div className="bg-gradient-to-br from-[#2b2f36] via-[#1f2228] to-[#35393f] min-h-screen text-white p-8 font-sans" style={{backgroundImage: 'linear-gradient(135deg, rgba(255,255,255,0.03) 0%, transparent 50%, rgba(255,255,255,0.02) 100%)'}}>            {/* Botón Volver */}
            <button
                onClick={() => { setSelectedZone(null); setSelectedWH(null); }}
                className="mb-6 flex items-center gap-3 text-gray-500 hover:text-white transition-colors text-sm font-bold"
            >
                <span className="text-xl">←</span> Volver a Zonas Térmicas
            </button>
            
            {/* Modal: Seleccionador de Productos del Catálogo */}
            {showItemPicker && (
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

            {/* Header y Filtros */}
            {!selectedWH ? (
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <header className="mb-12 flex justify-between items-end">
                        <div>
                            <h1 className="text-5xl font-black uppercase italic tracking-tighter text-indigo-500">Gestión de Almacenes</h1>
                            <p className="text-[10px] font-black text-gray-500 uppercase tracking-[0.4em] mt-2">Centro Logístico de Inventarios | R DE RICO</p>
                        </div>
                        <div className="flex gap-4 flex-1 justify-end max-w-[70%]">
                            <div className="bg-black/40 border border-gray-800 rounded-2xl p-1 flex overflow-x-auto custom-scrollbar no-scrollbar flex-1">
                                <button 
                                    onClick={() => setFilterType('ALL')}
                                    className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${filterType === 'ALL' ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:text-white'}`}
                                >
                                    Todos
                                </button>
                                {Object.entries(warehouseTypes).map(([key, info]) => (
                                    <button 
                                        key={key}
                                        onClick={() => setFilterType(key)}
                                        className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${filterType === key ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:text-white'}`}
                                    >
                                        {info.label}
                                    </button>
                                ))}
                            </div>
                            <button 
                                onClick={() => setShowTypeManager(true)}
                                className="w-12 h-12 bg-gray-900 border border-gray-800 rounded-2xl flex items-center justify-center hover:border-indigo-500 transition-all text-xs"
                                title="Gestionar Categorías"
                            >
                                ⚙️
                            </button>
                            <button 
                                onClick={() => {
                                    setEditingWHData({ name: '', type: 'EX_PT', icon: '📦', capacity: 100 });
                                    setShowWHEditor(true);
                                }}
                                className="bg-indigo-600 px-6 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-xl shadow-indigo-600/20 whitespace-nowrap"
                            >
                                + Nuevo Almacén
                            </button>
                        </div>
                    </header>

                    <div className="mb-8 overflow-hidden">
                        <input 
                            type="text" 
                            placeholder="Buscar almacén por nombre..."
                            className="w-full bg-black/40 border border-gray-800 p-6 rounded-[32px] outline-none focus:border-indigo-500 font-bold text-lg transition-all"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {filteredWH.map(wh => {
                            const typeInfo = warehouseTypes[wh.type] || { label: wh.type, color: 'text-gray-400', bg: 'bg-gray-500/10', border: 'border-gray-500/20' };
                            const fillPercent = (wh.current / wh.capacity) * 100;
                            
                            return (
                                <div 
                                    key={wh.id}
                                    onClick={() => setSelectedWH(wh)}
                                    className={`group relative bg-gray-900/40 border ${typeInfo.border} p-8 rounded-[40px] hover:bg-gray-900/60 transition-all cursor-pointer overflow-hidden`}
                                >
                                    <div className="flex justify-between items-start mb-6">
                                        <span className="text-5xl group-hover:scale-110 transition-transform duration-500">{wh.icon}</span>
                                        <span className={`text-[8px] font-black uppercase px-3 py-1 rounded-full ${typeInfo.bg} ${typeInfo.color} tracking-widest`}>
                                            {typeInfo.label}
                                        </span>
                                    </div>

                                    <h3 className="text-xl font-black uppercase italic tracking-tighter mb-2 group-hover:text-indigo-400 transition-colors">
                                        {wh.name}
                                    </h3>
                                    
                                    <div className="mt-8 space-y-2">
                                        <div className="flex justify-between text-[9px] font-black uppercase text-gray-500">
                                            <span>Ocupación</span>
                                            <span className={fillPercent > 90 ? 'text-red-500' : 'text-white'}>{wh.current} / {wh.capacity}</span>
                                        </div>
                                        <div className="h-2 bg-black/60 rounded-full overflow-hidden">
                                            <div 
                                                className={`h-full transition-all duration-1000 ${fillPercent > 90 ? 'bg-red-500' : 'bg-indigo-500'}`} 
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
                <div className="animate-in slide-in-from-right-8 duration-500 flex flex-col h-full bg-gray-900/60 rounded-[48px] border border-gray-800 overflow-hidden">
                    <header className="p-10 border-b border-gray-800 flex justify-between items-center bg-black/20">
                        <div className="flex items-center gap-6">
                            <button 
                                onClick={() => setSelectedWH(null)}
                                className="w-12 h-12 rounded-2xl bg-gray-800 flex items-center justify-center hover:bg-indigo-600 transition-all group"
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
                                <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Explorando contenido y existencias</p>
                            </div>
                        </div>
                        <div className="flex gap-4">
                            <button 
                                onClick={() => {
                                    setEditingWHData(selectedWH);
                                    setShowWHEditor(true);
                                }}
                                className="bg-gray-800 h-14 px-8 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-gray-700 transition-all font-black"
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
                                <tr className="text-[9px] font-black uppercase text-gray-600 tracking-[0.2em]">
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
                                    <tr key={item.sku} className="bg-black/40 hover:bg-black/60 transition-all group rounded-2xl overflow-hidden">
                                        <td className="px-6 py-4 rounded-l-3xl">
                                            <div className="w-12 h-12 bg-black/40 border border-gray-800 rounded-xl flex items-center justify-center text-xl overflow-hidden shadow-inner uppercase">
                                                {item.imgUrl ? <img src={item.imgUrl} alt={item.name} className="w-full h-full object-cover" /> : '📦'}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <p className="text-sm font-black uppercase italic">{item.name}</p>
                                            <p className="text-[8px] text-gray-500 font-black uppercase">{item.category}</p>
                                        </td>
                                        <td className="px-6 py-4 font-mono text-[10px] text-gray-500">{item.sku}</td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col gap-1">
                                                <div className="flex items-center gap-2">
                                                    <span className={`text-sm font-bold ${item.stock <= (item.minStock || 0) ? 'text-red-500' : 'text-white'}`}>{item.stock}</span>
                                                    <span className="text-[9px] font-black text-gray-600 uppercase">{item.unit}</span>
                                                </div>
                                                {item.stock <= (item.minStock || 0) && (
                                                    <span className="text-[7px] font-black text-red-600 uppercase tracking-widest whitespace-nowrap bg-red-500/10 px-1 py-0.5 rounded border border-red-500/20 w-max">⚠️ CRÍTICO ({item.minStock})</span>
                                                )}
                                                {/* Simulación de alerta de caducidad si los alertDays > 0 (asumiendo que hay una caducidad en el futuro cercano, aquí se valida estáticamente por ahora) */}
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
                                        <td className="px-6 py-4 text-[10px] font-bold text-gray-400">{item.provider}</td>
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

            <footer className="fixed bottom-6 left-10 text-[8px] text-gray-700 font-black uppercase tracking-[0.4em] flex items-center gap-4 pointer-events-none">
                <span>R DE RICO ERP | WAREHOUSE LOGISTICS V2.0</span>
                <div className="w-1 h-1 bg-gray-900 rounded-full" />
                <span className="text-emerald-900/40">Sincronizado - Planta Central</span>
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
