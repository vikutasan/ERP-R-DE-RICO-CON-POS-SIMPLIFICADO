import React, { useState, useMemo, useEffect } from 'react';
import ReactDOM from 'react-dom';

/**
 * R DE RICO - PRODUCT MASTER & CATALOG MANAGER (API SYNC)
 * 
 * Módulo central para la gestión de productos, recetas e inventario logístico.
 * Sincronizado en tiempo real con el servidor FastAPI.
 */

const INITIAL_INGREDIENTS = [
    { id: 'ing_harina', name: 'Harina de Trigo', unit: 'kg', costPerUnit: 18.5 },
    { id: 'ing_mantequilla', name: 'Mantequilla de Planta', unit: 'kg', costPerUnit: 120.0 },
    { id: 'ing_azucar', name: 'Azúcar Refinada', unit: 'kg', costPerUnit: 22.0 },
    { id: 'ing_levadura', name: 'Levadura Seca', unit: 'kg', costPerUnit: 85.0 },
    { id: 'ing_leche', name: 'Leche Entera', unit: 'lt', costPerUnit: 24.5 },
];

export const ProductMasterUI = ({ userPermissions = {} }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [activeCategory, setActiveCategory] = useState('TODOS');
    const [editingProduct, setEditingProduct] = useState(null);
    const [products, setProducts] = useState([]);
    const [grandezaConfigs, setGrandezaConfigs] = useState([]);
    const [categories, setCategories] = useState([]);
    const [masses, setMasses] = useState([]);
    const [globalIngredients, setGlobalIngredients] = useState(INITIAL_INGREDIENTS);
    const [showIngredientSelector, setShowIngredientSelector] = useState(false);
    const [showCategoryManager, setShowCategoryManager] = useState(false);
    const [newCategory, setNewCategory] = useState({ name: '' });
    const [renamingCategory, setRenamingCategory] = useState(null);
    const [renameValue, setRenameValue] = useState('');
    const [categoryToDelete, setCategoryToDelete] = useState(null);
    const [deleteOption, setDeleteOption] = useState('ONLY_CAT');
    const [showProductLinker, setShowProductLinker] = useState(false);
    const [linkerSearch, setLinkerSearch] = useState('');
    const [showUnlinkConfirm, setShowUnlinkConfirm] = useState(false);
    const [productToUnlink, setProductToUnlink] = useState(null);
    const [showPermanentDeleteConfirm, setShowPermanentDeleteConfirm] = useState(false);
    const [productToDeletePermanently, setProductToDeletePermanently] = useState(null);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [showCategoryNotEmptyModal, setShowCategoryNotEmptyModal] = useState(false);
    const [emptyErrorCount, setEmptyErrorCount] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [draggedCatIndex, setDraggedCatIndex] = useState(null);
    const [draggedProdIndex, setDraggedProdIndex] = useState(null);

    const API_BASE = `http://${window.location.hostname}:5001/api/v1/catalog`;

    // Sistema inteligente de de-hardcoding de imágenes para red local
    const resolveImageUrl = (url) => {
        if (!url) return null;
        if (url.startsWith('http')) {
            return url.replace(/localhost:\d+/g, `${window.location.hostname}:5001`)
                      .replace(/127\.0\.0\.1:\d+/g, `${window.location.hostname}:5001`)
                      .replace(/192\.168\.\d+\.\d+:\d+/g, `${window.location.hostname}:5001`);
        }
        return `http://${window.location.hostname}:5001${url.startsWith('/') ? '' : '/'}${url}`;
    };

    // Carga inicial de datos desde la API
    useEffect(() => {
        const fetchData = async () => {
            setIsLoading(true);
            try {
                // Categorías
                const catRes = await fetch(`${API_BASE}/categories`);
                if (catRes.ok) {
                    const catData = await catRes.json();
                    const normalized = catData.map(c => ({ ...c, icon: '' }));
                    setCategories(normalized);
                }

                // Masas (Producción)
                const massRes = await fetch(`${API_BASE.replace('/catalog', '/production')}/doughs`);
                if (massRes.ok) {
                    setMasses(await massRes.json());
                }

                // Grandeza Configs
                const grandRes = await fetch(`${API_BASE.replace('/catalog', '/grandeza')}/products`);
                let grandData = [];
                if (grandRes.ok) {
                    grandData = await grandRes.json();
                    setGrandezaConfigs(grandData);
                }

                // Normalizar Productos con Grandeza Config
                const prodRes = await fetch(`${API_BASE}/products`);
                if (prodRes.ok) {
                    const prodData = await prodRes.json();
                    const normalizedProds = prodData.map(p => {
                        const gConf = grandData.find(g => g.product_id === p.id);
                        return {
                            ...p,
                            categories: p.category ? [p.category.name] : [],
                            nature: p.nature || 'MANUFACTURADO',
                            technical_data: p.technical_sheet || {},
                            grandeza_enabled: gConf ? gConf.is_enabled : false,
                            grandeza_b2b_price: gConf ? gConf.b2b_price : p.price
                        };
                    });
                    setProducts(normalizedProds);
                }
            } catch (err) {
                console.error("Error fetching data:", err);
            } finally {
                setIsLoading(false);
            }
        };
        fetchData();
    }, []);

    // Filtrado de productos
    const filteredProducts = useMemo(() => {
        return products.filter(p => {
            const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                                 p.sku.toLowerCase().includes(searchTerm.toLowerCase());
            const matchesCategory = activeCategory === 'TODOS' || (p.categories && p.categories.includes(activeCategory));
            return matchesSearch && matchesCategory;
        });
    }, [searchTerm, activeCategory, products]);

    const refreshProducts = async () => {
        const grandRes = await fetch(`${API_BASE.replace('/catalog', '/grandeza')}/products`);
        let grandData = [];
        if (grandRes.ok) {
            grandData = await grandRes.json();
            setGrandezaConfigs(grandData);
        }

        const prodRes = await fetch(`${API_BASE}/products`);
        if (prodRes.ok) {
            const prodData = await prodRes.json();
            const normalizedProds = prodData.map(p => {
                const gConf = grandData.find(g => g.product_id === p.id);
                return {
                    ...p,
                    categories: p.category ? [p.category.name] : [],
                    nature: p.nature || 'MANUFACTURADO',
                    technical_data: p.technical_sheet || {},
                    grandeza_enabled: gConf ? gConf.is_enabled : false,
                    grandeza_b2b_price: gConf ? gConf.b2b_price : p.price
                };
            });
            setProducts(normalizedProds);
        }
    };

    const handleSaveProduct = async (updatedProduct) => {
        try {
            if (!updatedProduct) return;
            console.log("Iniciando guardado de:", updatedProduct);
            
            const catName = (updatedProduct.categories && updatedProduct.categories[0]) ? updatedProduct.categories[0].trim() : null;
            const dbCat = categories.find(c => c && c.name && c.name.trim().toUpperCase() === catName?.toUpperCase());
            
            if (catName && !dbCat) {
                console.warn("Categoría solicitada no encontrada:", catName);
            }
            
            // Sanitización de technical_data (Imperial Hardening)
            const rawTD = updatedProduct.technical_data || {};
            const techData = {
                ...rawTD,
                // IDs de Masa (Convertir "" a null para evitar errores de tipo int)
                primary_mass_id: rawTD.primary_mass_id && rawTD.primary_mass_id !== '' ? parseInt(rawTD.primary_mass_id) : null,
                secondary_mass_id: rawTD.secondary_mass_id && rawTD.secondary_mass_id !== '' ? parseInt(rawTD.secondary_mass_id) : null,
                tertiary_mass_id: rawTD.tertiary_mass_id && rawTD.tertiary_mass_id !== '' ? parseInt(rawTD.tertiary_mass_id) : null,
                
                // Gramajes (Convertir a float o null/0)
                primary_mass_grams: rawTD.primary_mass_grams && rawTD.primary_mass_grams !== '' ? parseFloat(rawTD.primary_mass_grams) : 0,
                secondary_mass_grams: rawTD.secondary_mass_grams && rawTD.secondary_mass_grams !== '' ? parseFloat(rawTD.secondary_mass_grams) : 0,
                tertiary_mass_grams: rawTD.tertiary_mass_grams && rawTD.tertiary_mass_grams !== '' ? parseFloat(rawTD.tertiary_mass_grams) : 0,
                
                // Otros parámetros numéricos
                weight_per_piece: rawTD.weight_per_piece && rawTD.weight_per_piece !== '' ? parseFloat(rawTD.weight_per_piece) : null,
                baking_temp_top: rawTD.baking_temp_top && rawTD.baking_temp_top !== '' ? parseFloat(rawTD.baking_temp_top) : null,
                baking_temp_bottom: rawTD.baking_temp_bottom && rawTD.baking_temp_bottom !== '' ? parseFloat(rawTD.baking_temp_bottom) : null,
                baking_time_min: rawTD.baking_time_min && rawTD.baking_time_min !== '' ? parseInt(rawTD.baking_time_min) : null,
                preparation_time_min: rawTD.preparation_time_min && rawTD.preparation_time_min !== '' ? parseInt(rawTD.preparation_time_min) : null,
                order_lead_time_hours: rawTD.order_lead_time_hours && rawTD.order_lead_time_hours !== '' ? parseInt(rawTD.order_lead_time_hours) : null,
                
                // Garantizar strings o nulls para textos
                recipe_procedure: rawTD.recipe_procedure || null,
                forming_procedure: rawTD.forming_procedure || null,
                provider: rawTD.provider || null,
                original_barcode: rawTD.original_barcode || null
            };
            
            const payload = {
                name: updatedProduct.name,
                price: parseFloat(updatedProduct.price) || 0,
                cost: parseFloat(updatedProduct.cost) || 0,
                stock: parseFloat(updatedProduct.stock) || 0,
                // v7 (Fase 0.5, D-WH): sin fallback hardcodeado. Si el producto
                // no tiene ubicacion asignada, se envia null y el backend no
                // inventa una sucursal. La ubicacion real vive en stock_almacen.
                warehouse: updatedProduct.warehouse || null,
                image_url: updatedProduct.image_url || null,
                sku: updatedProduct.sku,
                category_id: dbCat ? dbCat.id : null,
                nature: updatedProduct.nature || 'MANUFACTURADO',
                technical_data: techData
            };

            let res;
            if (updatedProduct.id) {
                res = await fetch(`${API_BASE}/products/${updatedProduct.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
            } else {
                res = await fetch(`${API_BASE}/products`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
            }

            if (res.ok) {
                const savedProduct = await res.json();
                console.log("Producto guardado exitosamente:", savedProduct);
                
                // Guardar configuración de Grandeza
                const productId = updatedProduct.id || savedProduct.id;
                if (productId) {
                    if (updatedProduct.grandeza_enabled) {
                        await fetch(`${API_BASE.replace('/catalog', '/grandeza')}/products`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                product_id: productId,
                                is_enabled: true,
                                b2b_price: parseFloat(updatedProduct.grandeza_b2b_price) || 0
                            })
                        });
                    } else {
                        await fetch(`${API_BASE.replace('/catalog', '/grandeza')}/products/${productId}`, {
                            method: 'DELETE'
                        });
                    }
                }

                await refreshProducts();
                setEditingProduct(null);
                // Notificación visual
                const notification = document.createElement('div');
                notification.className = 'fixed bottom-10 right-10 bg-[#c1d72e] text-black px-8 py-4 rounded-full font-black uppercase tracking-widest z-[1000] shadow-2xl animate-in slide-in-from-right-10 duration-500';
                notification.innerText = `✅ ${updatedProduct.name} Guardado`;
                document.body.appendChild(notification);
                setTimeout(() => notification.remove(), 3000);
            } else {
                const errorData = await res.json();
                const errorMsg = Array.isArray(errorData.detail) 
                    ? errorData.detail.map(e => `${e.loc.join('.')}: ${e.msg}`).join('\n')
                    : errorData.detail || 'Error desconocido';
                alert(`Error al guardar producto:\n${errorMsg}`);
            }
        } catch (err) {
            console.error("Save error:", err);
            alert(`Error CRÍTICO al guardar:\n${err.message}`);
        }
    };

    const handleCreateProduct = () => {
        const newProd = {
            sku: `SKU-${Math.floor(Math.random() * 10000)}`,
            name: 'NUEVO PRODUCTO',
            categories: activeCategory === 'TODOS' ? [(categories[0]?.name || '')] : [activeCategory],
            price: 0,
            cost: 0,
            stock: 0,
            // v7 (Fase 0.5, D-WH): sin hardcode de sucursal (principio SaaS).
            warehouse: null,
            image_url: '',
            nature: 'MANUFACTURADO',
            technical_data: {},
            grandeza_enabled: false,
            grandeza_b2b_price: 0,
            isNew: true
        };
        setEditingProduct(newProd);
    };

    const handlePermanentDelete = async (product) => {
        if (!product || !product.id) return;

        // Defensa en Profundidad: Verificar permisos antes de ejecutar
        if (userPermissions?.inventory_delete !== 'full' && userPermissions?.all !== 'full') {
            alert("Acceso Denegado: Tu perfil no tiene permiso para eliminar productos.");
            return;
        }

        try {
            const res = await fetch(`${API_BASE}/products/${product.id}`, { method: 'DELETE' });
            if (res.ok) {
                await refreshProducts();
                setShowDeleteConfirm(false);
                setProductToDeletePermanently(null);
                setEditingProduct(null);
            }
        } catch (err) {
            console.error("Delete error:", err);
        }
    };

    const handleQuitarProduct = async (product) => {
        if (!product || !product.id) return;
        
        const discontinuedCat = categories.find(c => c.name === 'DESCONTINUADOS');
        if (!discontinuedCat) {
            alert("Error: No se encontró la categoría de sistema 'DESCONTINUADOS'.");
            return;
        }

        try {
            const res = await fetch(`${API_BASE}/products/${product.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    category_id: discontinuedCat.id
                })
            });

            if (res.ok) {
                console.log("Producto movido a DESCONTINUADOS exitosamente");
                await refreshProducts();
                setEditingProduct(null);
                // Notificación visual de éxito
                const notification = document.createElement('div');
                notification.className = 'fixed bottom-10 left-1/2 -translate-x-1/2 bg-[#c1d72e] text-black px-8 py-4 rounded-full font-black uppercase tracking-widest z-[1000] shadow-2xl animate-bounce';
                notification.innerText = `📥 ${product.name} movido a DESCONTINUADOS`;
                document.body.appendChild(notification);
                setTimeout(() => notification.remove(), 3000);
            } else {
                const errorData = await res.json();
                const errorMsg = Array.isArray(errorData.detail) 
                    ? errorData.detail.map(e => `${e.loc.join('.')}: ${e.msg}`).join('\n')
                    : errorData.detail || 'Error desconocido';
                alert(`Error al mover producto:\n${errorMsg}`);
            }
        } catch (err) {
            console.error("Quitar error:", err);
        }
    };

    const handleImportData = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const importedData = JSON.parse(event.target.result);
                const productsToImport = importedData.products || [];
                
                if (productsToImport.length > 0) {
                    const res = await fetch(`${API_BASE}/import-json`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ products: productsToImport })
                    });
                    
                    if (res.ok) {
                        const result = await res.json();
                        alert(`✅ ${result.message}`);
                        window.location.reload(); // Recarga simple para asegurar sincronía total
                    } else {
                        alert("❌ Error en el servidor al importar.");
                    }
                }
            } catch (err) {
                alert("❌ Error al leer el archivo JSON.");
            }
        };
        reader.readAsText(file);
    };

    const handleExportJSON = () => {
        const dataStr = JSON.stringify({ products }, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        const dateStr = new Date().toISOString().split('T')[0];
        link.download = `productos_rderico_${dateStr}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const handleAddCategory = async () => {
        if (!newCategory.name) return;
        try {
            const res = await fetch(`${API_BASE}/categories`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newCategory.name, icon: newCategory.icon })
            });
            if (res.ok) {
                const catRes = await fetch(`${API_BASE}/categories`);
                const catData = await catRes.json();
                // Simplificamos: No usamos INITIAL_CATEGORIES_LOCAL
                setCategories(catData.map(c => ({ ...c, icon: c.icon || '' })));
                setNewCategory({ name: '', icon: '' });
                setShowCategoryManager(false);
            }
        } catch (err) {
            console.error("Add category error:", err);
        }
    };

    const handleDeleteCategory = async () => {
        const cat = categories.find(c => c.name === categoryToDelete);
        if (!cat) return;

        // 1. Verificar permisos
        if (userPermissions?.inventory_delete !== 'full' && userPermissions?.all !== 'full') {
            alert("No tienes autoridad para eliminar categorías del sistema.");
            return;
        }

        // 2. Verificar si la categoría está vacía en el estado local
        const productsInCat = products.filter(p => p.categories && p.categories.includes(cat.name));
        if (productsInCat.length > 0) {
            setEmptyErrorCount(productsInCat.length);
            setShowCategoryNotEmptyModal(true);
            setCategoryToDelete(null);
            return;
        }

        try {
            const res = await fetch(`${API_BASE}/categories/${cat.id}`, { method: 'DELETE' });
            if (res.ok) {
                setCategories(categories.filter(c => c.id !== cat.id));
                if (activeCategory === cat.name) setActiveCategory('TODOS');
                setCategoryToDelete(null);
                await refreshProducts();
            } else {
                const errData = await res.json();
                alert(`Error del servidor: ${errData.detail || 'No se pudo eliminar'}`);
            }
        } catch (err) {
            console.error("Delete category error:", err);
        }
    };

    const handleToggleCategoryVisibility = async (cat) => {
        try {
            const res = await fetch(`${API_BASE}/categories/${cat.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: cat.name,
                    icon: cat.icon,
                    vision_enabled: !cat.vision_enabled
                })
            });
            if (res.ok) {
                const updated = await res.json();
                setCategories(categories.map(c => c.id === cat.id ? updated : c));
                setRenamingCategory(prev => prev && prev.id === cat.id ? updated : prev);
            }
        } catch (err) {
            console.error("Toggle visibility error:", err);
        }
    };

    const handleRenameCategory = async () => {
        if (!renamingCategory || !renameValue) return;

        try {
            const res = await fetch(`${API_BASE}/categories/${renamingCategory.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: renameValue.toUpperCase(),
                    icon: '',
                    vision_enabled: renamingCategory.vision_enabled
                })
            });
            if (res.ok) {
                const updated = await res.json();
                const oldName = renamingCategory.name;
                const newName = updated.name;

                // 1. Actualizar lista de categorías
                setCategories(categories.map(c => c.id === renamingCategory.id ? updated : c));
                
                // 2. Sincronizar nombres en la lista de productos (Fichas)
                setProducts(products.map(p => {
                    if (p.categories && p.categories.includes(oldName)) {
                        return {
                            ...p,
                            categories: p.categories.map(cat => cat === oldName ? newName : cat)
                        };
                    }
                    return p;
                }));

                if (activeCategory === oldName) setActiveCategory(newName);
                setRenamingCategory(null);
            }
        } catch (err) {
            console.error("Rename category error:", err);
            alert("Error al renombrar categoría.");
        }
    };

    const handleOpenRenameModal = (cat) => {
        setRenamingCategory(cat);
        setRenameValue(cat.name);
    };

    // --- Drag & Drop Logic ---

    const handleCategoryDragStart = (e, index) => {
        setDraggedCatIndex(index);
        e.dataTransfer.effectAllowed = "move";
    };

    const handleCategoryDrop = async (e, targetIndex) => {
        e.preventDefault();
        if (draggedCatIndex === null || draggedCatIndex === targetIndex) return;

        const newCats = [...categories];
        const [movedCat] = newCats.splice(draggedCatIndex, 1);
        newCats.splice(targetIndex, 0, movedCat);
        
        setCategories(newCats);
        setDraggedCatIndex(null);

        // Sync with API
        try {
            const ids = newCats.map(c => c.id);
            await fetch(`${API_BASE}/reorder-categories`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(ids)
            });
        } catch (err) {
            console.error("Error reordering categories:", err);
        }
    };

    const handleProductDragStart = (e, index) => {
        setDraggedProdIndex(index);
        e.dataTransfer.effectAllowed = "move";
    };

    const handleProductDrop = async (e, targetIndex) => {
        e.preventDefault();
        if (draggedProdIndex === null || draggedProdIndex === targetIndex) return;
        if (activeCategory === 'TODOS') return; // Solo permitir reordenar dentro de categorías

        // Obtener productos visibles (filtrados por categoría activa)
        const visibleIndices = filteredProducts.map(p => products.findIndex(op => op.id === p.id));
        
        const newProducts = [...products];
        const sourceGlobalIndex = products.findIndex(p => p.id === filteredProducts[draggedProdIndex].id);
        const targetGlobalIndex = products.findIndex(p => p.id === filteredProducts[targetIndex].id);

        const [movedProd] = newProducts.splice(sourceGlobalIndex, 1);
        newProducts.splice(targetGlobalIndex, 0, movedProd);

        setProducts(newProducts);
        setDraggedProdIndex(null);

        // Sync with API (Enviar IDs de la categoría actual reordenados)
        try {
            const categoryProds = newProducts.filter(p => p.categories.includes(activeCategory));
            const ids = categoryProds.map(p => p.id);
            await fetch(`${API_BASE}/reorder-products`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(ids)
            });
        } catch (err) {
            console.error("Error reordering products:", err);
        }
    };

    return (
        <div className="bg-[#050505]/60 backdrop-blur-xl min-h-screen text-white p-8 font-sans flex gap-8">
            {/* Modal de Eliminación de Categoría */}
            {categoryToDelete && ReactDOM.createPortal(
                <div className="fixed inset-0 z-[200] flex items-start justify-center p-6 pt-20">
                    <div className="absolute inset-0 bg-black/90 backdrop-blur-xl" onClick={() => setCategoryToDelete(null)} />
                    <div className="relative w-full max-w-lg bg-gray-900 border border-red-900/30 rounded-[40px] p-10 shadow-2xl">
                        <h3 className="text-3xl font-black uppercase italic tracking-tighter text-red-500 mb-2 text-center">¿Eliminar Categoría?</h3>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-10 text-center">
                            Esta acción es irreversible y afectará el catálogo.
                        </p>
                        <div className="flex gap-4">
                            <button 
                                onClick={() => setCategoryToDelete(null)}
                                className="flex-1 py-4 bg-gray-800 rounded-2xl text-[10px] font-black uppercase hover:bg-gray-700 transition-all font-bold"
                            >
                                Cancelar
                            </button>
                            <button 
                                onClick={handleDeleteCategory}
                                className="flex-1 py-4 bg-red-600 rounded-2xl text-[10px] font-black uppercase hover:scale-105 active:scale-95 transition-all font-bold"
                            >
                                Confirmar Borrado
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* Modal de Opciones de Categoría */}
            {renamingCategory && ReactDOM.createPortal(
                <div className="fixed inset-0 z-[300] flex items-center justify-center p-6">
                    <div className="absolute inset-0 bg-black/90 backdrop-blur-xl" onClick={() => setRenamingCategory(null)} />
                    <div className="relative w-full max-w-md bg-gray-900 border border-indigo-900/30 rounded-[40px] p-10 shadow-2xl">
                        <h3 className="text-3xl font-black uppercase italic tracking-tighter text-indigo-400 mb-2 text-center">Opciones de Categoría</h3>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-8 text-center">
                            Modifica el nombre, visibilidad o elimina la categoría.
                        </p>
                        
                        <div className="space-y-6 mb-10">
                            <div>
                                <label className="text-[10px] font-black text-gray-500 uppercase block mb-2">Nombre de Categoría</label>
                                <input 
                                    className="w-full bg-black/40 border border-gray-800 p-4 rounded-2xl text-lg font-bold outline-none focus:border-indigo-500 uppercase text-center"
                                    value={renameValue}
                                    onChange={(e) => setRenameValue(e.target.value)}
                                    autoFocus
                                />
                            </div>
                            
                            <div className="flex items-center justify-between bg-black/40 border border-gray-800 p-4 rounded-2xl">
                                <div>
                                    <h4 className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Visibilidad en POS</h4>
                                    <p className="text-[8px] font-bold text-gray-500 uppercase mt-1">
                                        {renamingCategory.vision_enabled ? 'Actualmente visible' : 'Actualmente oculta'}
                                    </p>
                                </div>
                                <button 
                                    onClick={() => handleToggleCategoryVisibility(renamingCategory)}
                                    className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase transition-all flex items-center gap-2 ${
                                        renamingCategory.vision_enabled 
                                            ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 hover:bg-indigo-600 hover:text-white' 
                                            : 'bg-gray-800 text-gray-400 border border-gray-700 hover:bg-gray-700'
                                    }`}
                                >
                                    {renamingCategory.vision_enabled ? '👁️ Visible' : '🕶️ Oculta'}
                                </button>
                            </div>
                        </div>

                        <div className="flex flex-col gap-4">
                            <div className="flex gap-4">
                                <button 
                                    onClick={() => setRenamingCategory(null)}
                                    className="flex-1 py-4 bg-gray-800 rounded-2xl text-[10px] font-black uppercase hover:bg-gray-700 transition-all font-bold"
                                >
                                    Cancelar
                                </button>
                                <button 
                                    onClick={handleRenameCategory}
                                    className="flex-1 py-4 bg-indigo-600 rounded-2xl text-[10px] font-black uppercase hover:scale-105 active:scale-95 transition-all font-bold shadow-xl shadow-indigo-600/20"
                                >
                                    Guardar Cambios
                                </button>
                            </div>
                            
                            <button 
                                onClick={() => {
                                    setCategoryToDelete(renamingCategory.name);
                                    setRenamingCategory(null);
                                }}
                                className="w-full py-4 bg-red-900/20 border border-red-500/20 text-red-500 rounded-2xl text-[10px] font-black uppercase hover:bg-red-600 hover:text-white transition-all flex items-center justify-center gap-2"
                            >
                                <span>✕</span> Eliminar Categoría Permanentemente
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
            {showDeleteConfirm && ReactDOM.createPortal(
                <div className="fixed inset-0 z-[300] flex items-center justify-center p-6">
                    <div className="absolute inset-0 bg-black/95 backdrop-blur-2xl" onClick={() => setShowDeleteConfirm(false)} />
                    <div className="relative w-full max-w-md bg-[#0a0a0a] border border-red-900/50 rounded-[40px] p-10 shadow-[0_0_100px_-20px_rgba(220,38,38,0.3)] text-center animate-in zoom-in-95 duration-500">
                        <div className="w-20 h-20 bg-red-600/20 border-2 border-red-600 rounded-3xl mx-auto mb-8 flex items-center justify-center text-5xl animate-pulse">
                            ⚠️
                        </div>
                        <h3 className="text-3xl font-black uppercase italic tracking-tighter text-red-500 mb-4">¡ALERTA CRÍTICA!</h3>
                        <p className="text-xs text-gray-400 font-bold uppercase tracking-widest leading-loose mb-10">
                            Estás a punto de eliminar permanentemente el producto:<br/>
                            <span className="text-white text-sm block mt-2">"{productToDeletePermanently?.name}"</span>
                            <span className="text-red-400/60 text-[10px] block mt-4 italic">Esta acción no se puede deshacer y afectará inventarios y reportes históricos.</span>
                        </p>
                        <div className="flex gap-4">
                            <button 
                                onClick={() => setShowDeleteConfirm(false)}
                                className="flex-1 py-4 bg-gray-800 rounded-2xl text-[10px] font-black uppercase hover:bg-gray-700 transition-all font-bold"
                            >
                                Cancelar
                            </button>
                            <button 
                                onClick={() => handlePermanentDelete(productToDeletePermanently)}
                                className="flex-1 py-4 bg-red-600 rounded-2xl text-[10px] font-black uppercase hover:scale-105 active:scale-95 transition-all font-bold shadow-xl shadow-red-600/30"
                            >
                                Confirmar Destrucción
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* Modal de Error: Categoría No Vacía */}
            {showCategoryNotEmptyModal && ReactDOM.createPortal(
                <div className="fixed inset-0 z-[400] flex items-center justify-center p-6">
                    <div className="absolute inset-0 bg-black/95 backdrop-blur-xl" onClick={() => setShowCategoryNotEmptyModal(false)} />
                    <div className="relative w-full max-w-md bg-gray-900 border border-orange-900/40 rounded-[40px] p-10 shadow-2xl text-center">
                        <div className="w-20 h-20 bg-orange-600/10 border-2 border-orange-600 rounded-3xl mx-auto mb-6 flex items-center justify-center text-4xl">
                            🚫
                        </div>
                        <h3 className="text-2xl font-black uppercase italic tracking-tighter text-orange-400 mb-4">Categoría No Vacía</h3>
                        <p className="text-xs text-gray-400 font-bold uppercase tracking-widest leading-loose mb-10">
                            Esta categoría contiene <span className="text-white text-sm"> {emptyErrorCount} productos</span> actualmente.<br/><br/>
                            Por seguridad, es <span className="text-red-400">imposible eliminarla</span> hasta que esté completamente vacía.
                            <span className="block mt-4 italic text-[10px] text-gray-500">Usa el botón "Quitar del Catálogo" en cada producto para moverlo a DESCONTINUADOS.</span>
                        </p>
                        <button 
                            onClick={() => setShowCategoryNotEmptyModal(false)}
                            className="w-full py-4 bg-orange-600 rounded-2xl text-[10px] font-black uppercase hover:bg-orange-500 transition-all font-bold"
                        >
                            Entendido
                        </button>
                    </div>
                </div>,
                document.body
            )}
            {editingProduct && ReactDOM.createPortal(
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
                    <div className="absolute inset-0 bg-black/90 backdrop-blur-xl" onClick={() => setEditingProduct(null)} />
                    <div className="relative w-full max-w-xl bg-gray-900 border border-indigo-900/30 rounded-[40px] p-10 shadow-2xl">
                        <header className="mb-8 border-b border-gray-800 pb-6 flex gap-6 items-center">
                            {editingProduct.image_url ? (
                                <img src={resolveImageUrl(editingProduct.image_url)} alt="Preview" className="w-24 h-24 object-cover rounded-2xl border-2 border-indigo-500/50 shadow-xl shadow-indigo-500/10" />
                            ) : (
                                <div className="w-24 h-24 bg-gray-800/50 rounded-2xl border-2 border-dashed border-gray-700 flex items-center justify-center text-gray-500 text-3xl">📷</div>
                            )}
                            <div>
                                <h3 className="text-3xl font-black uppercase italic tracking-tighter text-indigo-400 leading-none mb-2">
                                    {editingProduct.id ? 'Editar Producto' : 'Nuevo Producto'}
                                </h3>
                                <p className="text-[10px] font-black text-[#c1d72e] uppercase tracking-widest bg-black/40 px-3 py-1 rounded-lg inline-block">ID: {editingProduct.sku}</p>
                            </div>
                        </header>

                        <div className="space-y-6 mb-10 max-h-[60vh] overflow-y-auto pr-4 custom-scrollbar">
                            <div className="grid grid-cols-2 gap-6 pb-6 border-b border-gray-800">
                                <div className="col-span-2">
                                    <label className="text-[10px] font-black text-indigo-400 uppercase tracking-widest block mb-2">Naturaleza del Artículo</label>
                                    <select 
                                        className="w-full bg-indigo-900/20 border border-indigo-500/50 p-4 rounded-2xl text-sm font-black text-indigo-300 outline-none focus:border-indigo-400 appearance-none cursor-pointer"
                                        value={editingProduct.nature || 'MANUFACTURADO'}
                                        onChange={(e) => setEditingProduct({...editingProduct, nature: e.target.value})}
                                    >
                                        <option value="MANUFACTURADO">🏭 MANUFACTURADO</option>
                                        <option value="PREPARADO AL MOMENTO">🧉 PREPARADO AL MOMENTO</option>
                                        <option value="REVENTA">🏷️ REVENTA</option>
                                        <option value="EMPAQUE">📦 EMPAQUE</option>
                                    </select>
                                </div>
                                <div className="col-span-2">
                                    <label className="text-[10px] font-black text-gray-500 uppercase block mb-2">Nombre Comercial</label>
                                    <input 
                                        className="w-full bg-black/40 border border-gray-800 p-4 rounded-2xl text-lg font-bold outline-none focus:border-[#c1d72e] transition-all"
                                        value={editingProduct.name}
                                        onChange={(e) => setEditingProduct({...editingProduct, name: e.target.value})}
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-gray-500 uppercase block mb-2">Precio Público ($)</label>
                                    <input 
                                        type="number"
                                        className="w-full bg-black/40 border border-gray-800 p-4 rounded-2xl text-lg font-bold outline-none focus:border-[#c1d72e] text-[#c1d72e] transition-all"
                                        value={editingProduct.price}
                                        onChange={(e) => setEditingProduct({...editingProduct, price: e.target.value})}
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-gray-500 uppercase block mb-2">Categoría POS</label>
                                    <select 
                                        className="w-full bg-black/40 border border-gray-800 p-4 rounded-2xl text-xs font-bold outline-none focus:border-[#c1d72e] appearance-none cursor-pointer"
                                        value={editingProduct.categories[0]}
                                        onChange={(e) => setEditingProduct({...editingProduct, categories: [e.target.value]})}
                                    >
                                        {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-gray-500 uppercase block mb-2">Costo Real ($)</label>
                                    <input 
                                        type="number"
                                        className="w-full bg-black/40 border border-red-900/40 p-4 rounded-2xl text-lg font-bold outline-none focus:border-red-500 text-red-500 transition-all"
                                        value={editingProduct.cost || ''}
                                        onChange={(e) => setEditingProduct({...editingProduct, cost: e.target.value})}
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-gray-400 uppercase block mb-2">Margen Utilidad (%)</label>
                                    <div className="w-full bg-green-900/10 border border-green-500/20 p-4 rounded-2xl text-lg font-black text-green-400 flex items-center h-[60px]">
                                        {(() => {
                                            const p = parseFloat(editingProduct.price) || 0;
                                            const c = parseFloat(editingProduct.cost) || 0;
                                            if (p <= 0) return "---";
                                            const margin = ((p - c) / p) * 100;
                                            return `${margin.toFixed(2)}%`;
                                        })()}
                                    </div>
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-gray-500 uppercase block mb-2">Inventario Físico (Pzas)</label>
                                    <input 
                                        type="number"
                                        className="w-full bg-black/40 border border-gray-800 p-4 rounded-2xl text-lg font-bold outline-none focus:border-indigo-500 text-white transition-all"
                                        value={editingProduct.stock || ''}
                                        onChange={(e) => setEditingProduct({...editingProduct, stock: e.target.value})}
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-gray-500 uppercase block mb-2">Almacén de Resguardo</label>
                                    <input 
                                        type="text"
                                        className="w-full bg-black/40 border border-gray-800 p-4 rounded-2xl text-sm font-bold outline-none focus:border-indigo-500 text-gray-300 transition-all uppercase"
                                        value={editingProduct.warehouse || ''}
                                        onChange={(e) => setEditingProduct({...editingProduct, warehouse: e.target.value})}
                                    />
                                </div>
                                <div className="col-span-2">
                                    <label className="text-[10px] font-black text-gray-500 uppercase block mb-2">Fotografía del Producto</label>
                                    <div className="flex gap-4">
                                        <input 
                                            type="text"
                                            placeholder="URL o sube una imagen..."
                                            className="flex-1 bg-black/40 border border-gray-800 p-4 rounded-2xl text-sm font-mono text-gray-400 outline-none focus:border-indigo-500 transition-all"
                                            value={editingProduct.image_url || ''}
                                            onChange={(e) => setEditingProduct({...editingProduct, image_url: e.target.value})}
                                        />
                                        <input 
                                            type="file"
                                            accept="image/*"
                                            id="imageUploadInput"
                                            className="hidden"
                                            onChange={async (e) => {
                                                const file = e.target.files[0];
                                                if (!file) return;
                                                const formData = new FormData();
                                                formData.append("file", file);
                                                try {
                                                    const res = await fetch(`${API_BASE}/upload-image`, {
                                                        method: "POST",
                                                        body: formData
                                                    });
                                                    if (res.ok) {
                                                        const data = await res.json();
                                                        setEditingProduct({...editingProduct, image_url: data.url});
                                                    } else {
                                                        alert("Error al subir la imagen");
                                                    }
                                                } catch (err) {
                                                    console.error("Upload error:", err);
                                                    alert("Error de red al subir la imagen");
                                                }
                                            }}
                                        />
                                        <button 
                                            onClick={() => document.getElementById('imageUploadInput').click()}
                                            className="bg-indigo-600/20 text-indigo-400 border border-indigo-500/50 px-6 py-4 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-indigo-600 hover:text-white transition-all flex items-center gap-2"
                                        >
                                            <span>📁</span> Subir
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* --- CONFIGURACIÓN REPARTO PAN GRANDEZA --- */}
                            <div className={`p-6 rounded-[24px] border transition-all ${editingProduct.grandeza_enabled ? 'bg-amber-900/10 border-amber-500/30' : 'bg-gray-900/20 border-gray-800'}`}>
                                <div className="flex items-center justify-between mb-2">
                                    <h4 className="text-xs font-black uppercase tracking-widest flex items-center gap-2 text-amber-400">
                                        <span>🍞</span> Reparto Pan Grandeza
                                    </h4>
                                    <label className="flex items-center cursor-pointer gap-2">
                                        <span className="text-[10px] font-black text-gray-500 uppercase">Habilitar</span>
                                        <div className={`relative w-12 h-6 rounded-full transition-colors ${editingProduct.grandeza_enabled ? 'bg-amber-500' : 'bg-gray-700'}`}>
                                            <input 
                                                type="checkbox" 
                                                className="sr-only"
                                                checked={editingProduct.grandeza_enabled}
                                                onChange={(e) => setEditingProduct({...editingProduct, grandeza_enabled: e.target.checked})}
                                            />
                                            <div className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform ${editingProduct.grandeza_enabled ? 'translate-x-6' : ''}`}></div>
                                        </div>
                                    </label>
                                </div>
                                {editingProduct.grandeza_enabled && (
                                    <div className="mt-4 pt-4 border-t border-amber-900/20">
                                        <label className="text-[10px] font-black text-amber-500 uppercase block mb-2">Establecer Precio B2B Grandeza ($)</label>
                                        <input 
                                            type="number"
                                            className="w-1/2 max-w-[200px] bg-black/40 border border-amber-900/50 p-4 rounded-2xl text-lg font-bold outline-none focus:border-amber-500 text-amber-400 transition-all"
                                            value={editingProduct.grandeza_b2b_price || ''}
                                            onChange={(e) => setEditingProduct({...editingProduct, grandeza_b2b_price: e.target.value})}
                                        />
                                    </div>
                                )}
                            </div>

                            {/* --- CAMPOS DINAMICOS POR NATURALEZA --- */}
                            
                            {editingProduct.nature === 'MANUFACTURADO' && (
                                <div className="space-y-6">
                                    <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                        <span>⚙️</span> Parámetros de Manufactura
                                    </h4>
                                    
                                    <div className="bg-gray-800/20 p-6 rounded-[32px] border border-gray-800 space-y-6">
                                        {/* Masa Primaria */}
                                        <div className="grid grid-cols-5 gap-4 items-end">
                                            <div className="col-span-3">
                                                <label className="text-[10px] font-black text-[#c1d72e] uppercase block mb-2">Masa Primaria (Base)</label>
                                                <select 
                                                    className="w-full bg-black/60 border border-gray-700 p-3 rounded-xl text-xs font-bold outline-none focus:border-[#c1d72e]"
                                                    value={editingProduct.technical_data?.primary_mass_id || ''}
                                                    onChange={(e) => setEditingProduct({
                                                        ...editingProduct, 
                                                        technical_data: {...editingProduct.technical_data, primary_mass_id: e.target.value}
                                                    })}
                                                >
                                                    <option value="">-- Sin Masa --</option>
                                                    {masses.filter(m => m.dough_type !== 'PREFERMENTO').map(m => (
                                                        <option key={m.id} value={m.id}>{m.name}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div className="col-span-2">
                                                <label className="text-[10px] font-black text-gray-500 uppercase block mb-2">Gramos</label>
                                                <div className="flex items-center gap-2 bg-black/40 border border-gray-700 p-3 rounded-xl">
                                                    <input 
                                                        type="number"
                                                        placeholder="0"
                                                        className="bg-transparent w-full text-sm font-bold outline-none text-center"
                                                        value={editingProduct.technical_data?.primary_mass_grams || ''}
                                                        onChange={(e) => setEditingProduct({
                                                            ...editingProduct, 
                                                            technical_data: {...editingProduct.technical_data, primary_mass_grams: e.target.value}
                                                        })}
                                                    />
                                                    <span className="text-[10px] font-black opacity-30">g</span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Masa Secundaria */}
                                        <div className="grid grid-cols-5 gap-4 items-end pt-4 border-t border-gray-800/50">
                                            <div className="col-span-3">
                                                <label className="text-[10px] font-black text-indigo-400 uppercase block mb-2">Masa Secundaria</label>
                                                <select 
                                                    className="w-full bg-black/60 border border-gray-700 p-3 rounded-xl text-xs font-bold outline-none focus:border-indigo-400"
                                                    value={editingProduct.technical_data?.secondary_mass_id || ''}
                                                    onChange={(e) => setEditingProduct({
                                                        ...editingProduct, 
                                                        technical_data: {...editingProduct.technical_data, secondary_mass_id: e.target.value}
                                                    })}
                                                >
                                                    <option value="">-- Sin Masa --</option>
                                                    {masses.filter(m => m.dough_type !== 'PREFERMENTO').map(m => (
                                                        <option key={m.id} value={m.id}>{m.name}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div className="col-span-2">
                                                <label className="text-[10px] font-black text-gray-500 uppercase block mb-2">Gramos</label>
                                                <div className="flex items-center gap-2 bg-black/40 border border-gray-700 p-3 rounded-xl">
                                                    <input 
                                                        type="number"
                                                        placeholder="0"
                                                        className="bg-transparent w-full text-sm font-bold outline-none text-center"
                                                        value={editingProduct.technical_data?.secondary_mass_grams || ''}
                                                        onChange={(e) => setEditingProduct({
                                                            ...editingProduct, 
                                                            technical_data: {...editingProduct.technical_data, secondary_mass_grams: e.target.value}
                                                        })}
                                                    />
                                                    <span className="text-[10px] font-black opacity-30">g</span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Masa Terciaria */}
                                        <div className="grid grid-cols-5 gap-4 items-end pt-4 border-t border-gray-800/50">
                                            <div className="col-span-3">
                                                <label className="text-[10px] font-black text-orange-400 uppercase block mb-2">Masa Terciaria</label>
                                                <select 
                                                    className="w-full bg-black/60 border border-gray-700 p-3 rounded-xl text-xs font-bold outline-none focus:border-orange-400"
                                                    value={editingProduct.technical_data?.tertiary_mass_id || ''}
                                                    onChange={(e) => setEditingProduct({
                                                        ...editingProduct, 
                                                        technical_data: {...editingProduct.technical_data, tertiary_mass_id: e.target.value}
                                                    })}
                                                >
                                                    <option value="">-- Sin Masa --</option>
                                                    {masses.filter(m => m.dough_type !== 'PREFERMENTO').map(m => (
                                                        <option key={m.id} value={m.id}>{m.name}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div className="col-span-2">
                                                <label className="text-[10px] font-black text-gray-500 uppercase block mb-2">Gramos</label>
                                                <div className="flex items-center gap-2 bg-black/40 border border-gray-700 p-3 rounded-xl">
                                                    <input 
                                                        type="number"
                                                        placeholder="0"
                                                        className="bg-transparent w-full text-sm font-bold outline-none text-center"
                                                        value={editingProduct.technical_data?.tertiary_mass_grams || ''}
                                                        onChange={(e) => setEditingProduct({
                                                            ...editingProduct, 
                                                            technical_data: {...editingProduct.technical_data, tertiary_mass_grams: e.target.value}
                                                        })}
                                                    />
                                                    <span className="text-[10px] font-black opacity-30">g</span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="pt-4 border-t border-gray-800 flex justify-between items-center">
                                            <label className="text-[10px] font-black text-gray-400 uppercase">Peso Total Final en Ficha</label>
                                            <div className="flex items-center gap-4">
                                                <input 
                                                    type="number"
                                                    placeholder="Total"
                                                    className="bg-black/60 border border-gray-700 p-3 rounded-xl text-sm font-black text-white w-32 text-center outline-none focus:border-green-500"
                                                    value={editingProduct.technical_data?.weight_per_piece || ''}
                                                    onChange={(e) => setEditingProduct({
                                                        ...editingProduct, 
                                                        technical_data: {...editingProduct.technical_data, weight_per_piece: e.target.value}
                                                    })}
                                                />
                                                <span className="text-xs font-black text-green-500">g</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-3 gap-4 bg-orange-900/10 p-5 rounded-[24px] border border-orange-900/30">
                                        <div>
                                            <label className="text-[9px] font-black text-orange-500 uppercase block mb-2">Temp Bóveda (°C)</label>
                                            <input type="number" className="w-full bg-black/40 border border-orange-900/50 p-3 rounded-xl text-sm text-center font-bold text-orange-200 outline-none"
                                                value={editingProduct.technical_data?.baking_temp_top || ''}
                                                onChange={(e) => setEditingProduct({...editingProduct, technical_data: {...editingProduct.technical_data, baking_temp_top: e.target.value}})}
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[9px] font-black text-orange-500 uppercase block mb-2">Temp Piso (°C)</label>
                                            <input type="number" className="w-full bg-black/40 border border-orange-900/50 p-3 rounded-xl text-sm text-center font-bold text-orange-200 outline-none"
                                                value={editingProduct.technical_data?.baking_temp_bottom || ''}
                                                onChange={(e) => setEditingProduct({...editingProduct, technical_data: {...editingProduct.technical_data, baking_temp_bottom: e.target.value}})}
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[9px] font-black text-orange-500 uppercase block mb-2">Tiempo (Min)</label>
                                            <input type="number" className="w-full bg-black/40 border border-orange-900/50 p-3 rounded-xl text-sm text-center font-bold text-orange-200 outline-none"
                                                value={editingProduct.technical_data?.baking_time_min || ''}
                                                onChange={(e) => setEditingProduct({...editingProduct, technical_data: {...editingProduct.technical_data, baking_time_min: e.target.value}})}
                                            />
                                        </div>
                                    </div>

                                    {/* Tiempo para Pedidos */}
                                    <div className="bg-purple-900/10 p-5 rounded-[24px] border border-purple-900/30">
                                        <label className="text-[10px] font-black text-purple-400 uppercase tracking-widest block mb-2">⏱️ Tiempo para Pedidos (Horas)</label>
                                        <p className="text-[8px] font-bold text-gray-600 uppercase tracking-wide mb-3">Horas de anticipación necesarias desde que se pide hasta que es posible su entrega</p>
                                        <input 
                                            type="number"
                                            placeholder="Ej: 12"
                                            className="w-full max-w-[200px] bg-black/40 border border-purple-900/50 p-3 rounded-xl text-sm font-bold text-purple-200 outline-none focus:border-purple-400"
                                            value={editingProduct.technical_data?.order_lead_time_hours || ''}
                                            onChange={(e) => setEditingProduct({...editingProduct, technical_data: {...editingProduct.technical_data, order_lead_time_hours: e.target.value}})}
                                        />
                                    </div>

                                    <div>
                                        <label className="text-[10px] font-black text-gray-500 uppercase block mb-2">Procedimiento de Formado</label>
                                        <textarea 
                                            className="w-full bg-black/40 border border-gray-800 p-4 rounded-2xl text-sm outline-none focus:border-indigo-500 min-h-[100px] resize-none custom-scrollbar"
                                            placeholder="Ej: Bolear a 80g, reposar 10 min, formar cuernito..."
                                            value={editingProduct.technical_data?.forming_procedure || ''}
                                            onChange={(e) => setEditingProduct({...editingProduct, technical_data: {...editingProduct.technical_data, forming_procedure: e.target.value}})}
                                        />
                                    </div>
                                </div>
                            )}

                            {editingProduct.nature === 'PREPARADO AL MOMENTO' && (
                                <div className="space-y-6 bg-blue-900/10 p-5 rounded-[24px] border border-blue-900/30">
                                    <h4 className="text-xs font-black text-blue-400 uppercase tracking-widest flex items-center gap-2">
                                        <span>🧉</span> Receta de Barra / Cocina
                                    </h4>
                                    <div>
                                        <label className="text-[10px] font-black text-blue-500 uppercase block mb-2">Tiempo Estándar Preparación (Min)</label>
                                        <input 
                                            type="number"
                                            className="w-full max-w-[150px] bg-black/40 border border-blue-900/50 p-3 rounded-xl text-sm font-bold text-blue-200 outline-none focus:border-blue-400"
                                            value={editingProduct.technical_data?.preparation_time_min || ''}
                                            onChange={(e) => setEditingProduct({...editingProduct, technical_data: {...editingProduct.technical_data, preparation_time_min: e.target.value}})}
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-black text-blue-500 uppercase block mb-2">Procedimiento / Receta</label>
                                        <textarea 
                                            className="w-full bg-black/40 border border-blue-900/50 p-4 rounded-2xl text-sm text-blue-100 outline-none focus:border-blue-400 min-h-[120px] resize-none custom-scrollbar"
                                            placeholder="Ej: Extraer 1 shot espresso, espumar leche a 65°C, verter con arte latte..."
                                            value={editingProduct.technical_data?.recipe_procedure || ''}
                                            onChange={(e) => setEditingProduct({...editingProduct, technical_data: {...editingProduct.technical_data, recipe_procedure: e.target.value}})}
                                        />
                                    </div>
                                </div>
                            )}

                            {editingProduct.nature === 'REVENTA' && (
                                <div className="space-y-6 bg-emerald-900/10 p-5 rounded-[24px] border border-emerald-900/30">
                                    <h4 className="text-xs font-black text-emerald-400 uppercase tracking-widest flex items-center gap-2">
                                        <span>🏷️</span> Datos de Reventa y Proveeduría
                                    </h4>
                                    <div className="grid grid-cols-2 gap-6">
                                        <div className="col-span-2">
                                            <label className="text-[10px] font-black text-emerald-500 uppercase block mb-2">Proveedor / Marca</label>
                                            <input 
                                                className="w-full bg-black/40 border border-emerald-900/50 p-3 rounded-xl text-sm font-bold text-emerald-200 outline-none focus:border-emerald-400"
                                                placeholder="Ej: Coca Cola Femsa"
                                                value={editingProduct.technical_data?.provider || ''}
                                                onChange={(e) => setEditingProduct({...editingProduct, technical_data: {...editingProduct.technical_data, provider: e.target.value}})}
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-black text-emerald-500 uppercase block mb-2">Código Barras Orig.</label>
                                            <input 
                                                className="w-full bg-black/40 border border-emerald-900/50 p-3 rounded-xl text-sm font-bold text-emerald-200 outline-none focus:border-emerald-400"
                                                value={editingProduct.technical_data?.original_barcode || ''}
                                                onChange={(e) => setEditingProduct({...editingProduct, technical_data: {...editingProduct.technical_data, original_barcode: e.target.value}})}
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-black text-emerald-500 uppercase block mb-2">Stock Mínimo Ideal</label>
                                            <input 
                                                type="number"
                                                className="w-full bg-black/40 border border-emerald-900/50 p-3 rounded-xl text-sm font-bold text-emerald-200 outline-none focus:border-emerald-400"
                                                value={editingProduct.technical_data?.min_stock || ''}
                                                onChange={(e) => setEditingProduct({...editingProduct, technical_data: {...editingProduct.technical_data, min_stock: e.target.value}})}
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}

                        </div>

                        <div className="flex gap-4">
                            {editingProduct.id && (
                                <>
                                    {/* Caso 1: Producto Activo -> Botón Quitar (Limbo) */}
                                    {editingProduct.categories[0] !== 'DESCONTINUADOS' ? (
                                        <button 
                                            onClick={() => handleQuitarProduct(editingProduct)}
                                            className="px-6 py-4 bg-orange-600/10 border border-orange-500/20 text-orange-500 rounded-2xl text-[10px] font-black uppercase hover:bg-orange-600 hover:text-white transition-all group relative overflow-hidden"
                                        >
                                            <span className="relative z-10 flex items-center gap-2">
                                                <span className="text-sm">📥</span> Quitar del Catálogo
                                            </span>
                                            <div className="absolute inset-0 bg-gradient-to-r from-orange-600 to-amber-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                                        </button>
                                    ) : (
                                        /* Caso 2: Producto en Limbo -> Botón Eliminar Permanente (Restringido) */
                                        (userPermissions.inventory_delete === 'full' || userPermissions.all === 'full') && (
                                            <button 
                                                onClick={() => {
                                                    setProductToDeletePermanently(editingProduct);
                                                    setShowDeleteConfirm(true);
                                                }}
                                                className="px-6 py-4 bg-red-600/10 border border-red-500/20 text-red-500 rounded-2xl text-[10px] font-black uppercase hover:bg-red-600 hover:text-white transition-all group relative overflow-hidden"
                                            >
                                                <span className="relative z-10 flex items-center gap-2">
                                                    <span className="text-sm">💀</span> Eliminación Permanente
                                                </span>
                                                <div className="absolute inset-0 bg-gradient-to-r from-red-600 to-rose-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                                            </button>
                                        )
                                    )}
                                </>
                            )}
                            <div className="flex-1 flex gap-4">
                                <button 
                                    onClick={() => setEditingProduct(null)}
                                    className="flex-1 py-4 bg-gray-800 rounded-2xl text-[10px] font-black uppercase hover:bg-gray-700 transition-all font-bold"
                                >
                                    Cerrar
                                </button>
                                <button 
                                    onClick={() => handleSaveProduct(editingProduct)}
                                    className="flex-1 py-4 bg-[#c1d72e] text-black rounded-2xl text-[10px] font-black uppercase hover:scale-105 active:scale-95 transition-all font-bold shadow-xl shadow-[#c1d72e]/20"
                                >
                                    Guardar Cambios
                                </button>
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* Area Principal */}
            <div className="flex-1 flex flex-col min-w-0">
                <header className="mb-8 flex justify-between items-start">
                    <div>
                        <h1 className="text-4xl font-black uppercase italic tracking-tighter text-indigo-500">Maestro de Productos</h1>
                        <p className="text-[10px] font-black text-gray-500 uppercase tracking-[0.4em] mt-2">MODO SEGURO | SINCRO API LIVE</p>
                    </div>
                    
                    <div className="flex gap-3">
                        {/* Botón Importar JSON */}
                        <label className="cursor-pointer bg-gray-900 border border-gray-800 px-6 py-4 rounded-2xl flex items-center gap-3 hover:border-indigo-500 transition-all group">
                            <span className="text-lg">📥</span>
                            <div className="text-left font-bold">
                                <p className="text-[10px] font-black uppercase italic leading-none mb-1">Importar JSON</p>
                                <p className="text-[7px] text-gray-600 font-black uppercase tracking-widest">Modo Aditivo (No Borra)</p>
                            </div>
                            <input type="file" className="hidden" accept=".json" onChange={handleImportData} />
                        </label>

                        {/* Botón Exportar JSON */}
                        <button 
                            onClick={handleExportJSON}
                            className="bg-indigo-600 border border-indigo-500 px-6 py-4 rounded-2xl flex items-center gap-3 hover:bg-indigo-500 transition-all group"
                        >
                            <span className="text-lg">📤</span>
                            <div className="text-left font-bold">
                                <p className="text-[10px] font-black uppercase italic leading-none mb-1 text-white">Exportar JSON</p>
                                <p className="text-[7px] text-indigo-200 font-black uppercase tracking-widest">Respaldo Local</p>
                            </div>
                        </button>
                    </div>
                </header>

                <div className="flex gap-4 mb-6">
                    <div className="flex-1 relative group">
                        <span className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-500">🔍</span>
                        <input 
                            type="text" 
                            placeholder="Buscar por nombre o SKU..."
                            className="w-full bg-black/40 border border-gray-800 p-4 pl-12 rounded-2xl outline-none focus:border-indigo-500 font-bold"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                {/* Filtro de Categorías */}
                <div className="flex gap-2 overflow-x-auto pb-4 mb-6 custom-scrollbar">
                    <button 
                        onClick={() => setActiveCategory('TODOS')}
                        className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all ${activeCategory === 'TODOS' ? 'bg-indigo-600 text-white shadow-lg' : 'bg-gray-900/50 text-gray-500 hover:text-white'}`}
                    >
                        Todos
                    </button>
                    {categories.map((cat, idx) => (
                        <div 
                            key={cat.id}
                            draggable
                            onDragStart={(e) => handleCategoryDragStart(e, idx)}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => handleCategoryDrop(e, idx)}
                            onClick={() => setActiveCategory(cat.name)}
                            className={`
                                group relative px-6 py-4 rounded-xl text-[10px] font-black uppercase tracking-widest text-center transition-all 
                                flex items-center justify-center min-w-[140px] h-auto min-h-[56px] whitespace-normal break-words cursor-pointer
                                ${activeCategory === cat.name 
                                    ? 'bg-indigo-600 text-white shadow-lg z-10 scale-105' 
                                    : cat.vision_enabled 
                                        ? 'bg-gray-800 text-gray-200 border border-gray-700 hover:border-indigo-500 shadow-md' 
                                        : 'bg-gray-900/40 text-gray-600 border border-gray-800/50 opacity-40 grayscale backdrop-blur-sm hover:opacity-100 hover:grayscale-0'}
                                ${draggedCatIndex === idx ? 'opacity-30' : ''}
                            `}
                        >
                            <span>{cat.name}</span>
                            
                            {/* Micro-controles Flotantes */}
                            {!cat.is_system && (
                                <div className="absolute right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 backdrop-blur-md px-2 py-1 rounded-lg">
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); handleOpenRenameModal(cat); }}
                                        className="hover:text-yellow-400 transition-colors"
                                        title="Opciones de Categoría"
                                    >✏️</button>
                                </div>
                            )}
                        </div>
                    ))}
                    
                    <button 
                        onClick={() => setShowCategoryManager(!showCategoryManager)}
                        className="px-4 py-3 rounded-xl text-[14px] font-black bg-gray-900/50 text-[#c1d72e] hover:bg-gray-800"
                    >
                        +
                    </button>

                    {showCategoryManager && (
                        <div className="flex gap-2 items-center bg-gray-900/80 p-2 rounded-xl border border-[#c1d72e]/30">
                            <input 
                                type="text"
                                placeholder="Nueva Cat..."
                                className="bg-black/60 border border-gray-800 p-2 rounded-lg text-[10px] uppercase font-black outline-none w-32"
                                value={newCategory.name}
                                onChange={(e) => setNewCategory({ name: e.target.value.toUpperCase() })}
                            />
                            <button onClick={handleAddCategory} className="bg-[#c1d72e] text-black px-3 py-2 rounded-lg text-[9px] font-black uppercase">OK</button>
                        </div>
                    )}
                </div>

                {isLoading ? (
                    <div className="flex-1 flex items-center justify-center text-indigo-500 font-black uppercase tracking-widest animate-pulse">Cargando Imperio Digital...</div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 overflow-y-auto pr-2 custom-scrollbar flex-1">
                        {filteredProducts.map((product, idx) => (
                            <div 
                                key={product.id || product.sku}
                                draggable={activeCategory !== 'TODOS'}
                                onDragStart={(e) => handleProductDragStart(e, idx)}
                                onDragOver={(e) => e.preventDefault()}
                                onDrop={(e) => handleProductDrop(e, idx)}
                                onClick={() => setEditingProduct(product)}
                                className={`bg-gray-900/40 border border-gray-800 p-6 rounded-[32px] hover:border-indigo-500 transition-all cursor-pointer group ${draggedProdIndex === idx ? 'opacity-30 scale-95 border-dashed border-indigo-500' : ''}`}
                            >
                                {product.image_url ? (
                                    <div className="h-32 w-full mb-4 rounded-xl overflow-hidden border border-gray-800 relative z-0">
                                        <img src={resolveImageUrl(product.image_url)} alt={product.name} className="w-full h-full object-cover opacity-50 group-hover:opacity-100 group-hover:scale-110 transition-all duration-500" />
                                    </div>
                                ) : (
                                    <div className="text-4xl mb-4 opacity-30 group-hover:opacity-100 transition-opacity">
                                        {(categories.find(c => c.name === product.categories[0])?.icon) || '📦'}
                                    </div>
                                )}
                                <h3 className="text-sm font-black uppercase italic tracking-tighter leading-none mb-1 group-hover:text-[#c1d72e] transition-colors">{product.name}</h3>
                                <div className="flex justify-between items-end">
                                    <div>
                                        <p className="text-[9px] font-mono text-gray-600 mb-2">{product.sku}</p>
                                        <div className="flex gap-1">
                                            {product.categories.map(c => (
                                                <span key={c} className="text-[7px] font-black uppercase bg-gray-800 px-2 py-0.5 rounded-full text-gray-500">{c}</span>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-xs font-black text-[#c1d72e]">${product.price}</p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                <div className="mt-6 flex justify-between items-center bg-indigo-600/5 p-6 rounded-3xl border border-indigo-500/10">
                    <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Total: {filteredProducts.length} productos en linea</p>
                </div>

                {/* Botón Flotante de Registro - Garantizado mediante Portal */}
                {ReactDOM.createPortal(
                    <button 
                        onClick={handleCreateProduct}
                        className="fixed bottom-10 right-10 z-[1000] bg-indigo-600 text-white px-8 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-[0_20px_40px_-10px_rgba(0,0,0,0.5),0_0_20px_rgba(79,70,229,0.3)] border border-indigo-400/20"
                    >
                        + Registrar Producto
                    </button>,
                    document.body
                )}
            </div>

            <style>{`
                .custom-scrollbar::-webkit-scrollbar { width: 4px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #1a1a1a; border-radius: 10px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #4f46e5; }
            `}</style>
        </div>
    );
};
