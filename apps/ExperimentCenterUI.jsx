import React, { useState, useMemo } from 'react';

// Importación de módulos creados (Simulada para el demo)
import { B2BManagerUI } from './b2b/B2BManagerUI';
import { CakeConfiguratorUI } from './ecommerce/CakeConfiguratorUI';
import { LogisticsDashboardUI } from './logistics/LogisticsDashboardUI';
import { DriverAppUI } from './driver-app/DriverAppUI';
import { ProductionManagementUI } from "./production/ProductionManagementUI";
import { GestorPickupUI } from "./production/GestorPickupUI";
import { GestorRepartosUI } from "./production/GestorRepartosUI";
import { WaiterAppUI } from './waiter-app/WaiterAppUI';
import { LoginUI } from './auth/LoginUI';
import { SeguridadAccesoUI } from './auth/SeguridadAccesoUI';
import { FinancialHubUI } from './financials/FinancialHubUI';
import { InvoicingHubUI } from './financials/InvoicingHubUI';
import { CustomerInvoicingPortal } from './financials/CustomerInvoicingPortal';
import { EstadisticasVentasUI } from './analytics/EstadisticasVentasUI';
import { WarehouseHubUI } from './inventory/WarehouseHubUI';
import { PurchasingHubUI } from './inventory/PurchasingHubUI';
import { TableServicePOS } from './pos/TableServicePOS';
import { RetailVisionPOS } from './pos/RetailVisionPOS';
import { VisionTrainingUI } from './pos/VisionTrainingUI';
import { ProductMasterUI as ProductCatalogUI } from './inventory/ProductCatalogUI';
import { WarehouseManagerUI } from './inventory/WarehouseManagerUI';
import { PurchaseManagerUI } from './inventory/PurchaseManagerUI';
import { AuditoriaUI as AuditoriaControlUI } from './AuditoriaControlUI';
import { SystemSettingsUI } from './settings/SystemSettingsUI';
import { NetworkMonitorUI } from './network/NetworkMonitorUI';
import { RepartoPanGrandezaUI } from './pos/RepartoPanGrandezaUI';
import { RecursosHumanosUI } from './hr/RecursosHumanosUI';
import { CheckInWelcomeModal } from './hr/CheckInWelcomeModal';
import { CheckOutModal } from './hr/CheckOutModal';
import { hrService } from './hr/hrService';
import { CONFIG } from './pos/config';
import REAL_PRODUCTS from '../importar_productos_AQUI.json';

/**
 * R DE RICO - CENTRO DE EXPERIMENTACIÓN (DASHBOARD MAESTRO)
 * 
 * Este es el portal central para que el Socio Fundador experimente 
 * todo el ecosistema digital que hemos construido.
 */

const INITIAL_CATEGORIES = [
    { name: "1.-EMPAQUE Y PAN BLANCO", visionEnabled: true },
    { name: "2.-A - B", visionEnabled: true },
    { name: "3.-C - D", visionEnabled: true },
    { name: "4.-E - K", visionEnabled: true },
    { name: "5.-L - M", visionEnabled: true },
    { name: "6.-N - P", visionEnabled: true },
    { name: "7.-R - S", visionEnabled: true },
    { name: "8.-T - Z", visionEnabled: true },
    { name: "17.-ROSCA DE REYES", visionEnabled: true },
    { name: "9.-LACTEOS", visionEnabled: false },
    { name: "10.-SOBRE PEDIDO", visionEnabled: false },
    { name: "11.-ESPORADICOS", visionEnabled: false },
    { name: "12.-CAFES Y CHOCOLATES", visionEnabled: false },
    { name: "13.-SOUVENIRS", visionEnabled: false },
    { name: "14.-HELADOS", visionEnabled: false },
    { name: "15.-PALETAS", visionEnabled: false },
    { name: "16.-AGUAS Y MALTEADAS", visionEnabled: false }
];

export const ExperimentCenterUI = () => {
    const initialTerminal = new URLSearchParams(window.location.search).get('terminal');
    const defaultModule = initialTerminal === 'DRIVER' ? 'reparto_grandeza' : 'overview';
    const defaultSidebar = initialTerminal === 'DRIVER' || window.innerWidth < 768;

    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [categories, setCategories] = useState(INITIAL_CATEGORIES);
    const [userRole, setUserRole] = useState('ADMIN'); 
    const [userName, setUserName] = useState('');
    const [userId, setUserId] = useState(null);
    const [activeModule, setActiveModule] = useState(defaultModule);
    const [userPermissions, setUserPermissions] = useState({});
    const [userProfileId, setUserProfileId] = useState(null);
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(defaultSidebar);
    const [showCheckInModal, setShowCheckInModal] = useState(false);
    const [showCheckOutModal, setShowCheckOutModal] = useState(false);
    const [checkInData, setCheckInData] = useState(null);

    const handleLogin = async (user) => {
        // 1. Login normal (siempre funciona)
        setUserRole(user.role);
        setUserName(user.name || '');
        setUserId(user.id);
        setUserProfileId(user.profile_id);
        setUserPermissions(user.permissions || {});
        setIsAuthenticated(true);

        // 2. Check-in HR (si falla, no pasa nada — el ERP funciona igual)
        try {
            const result = await hrService.checkIn(user.id);
            if (result && result.is_first_login) {
                setCheckInData(result);
                setShowCheckInModal(true);
            }
        } catch (err) {
            console.warn('Check-in HR no disponible:', err);
        }
    };

    const handleUpdatePermissions = (updatedProfile) => {
        // Si el perfil editado es el mismo que tiene el usuario actual, actualizamos permisos en vivo
        if (updatedProfile.id === userProfileId) {
            console.log("Sincronizando permisos en vivo para:", updatedProfile.name);
            setUserPermissions(updatedProfile.permissions);
        }
    };

    if (!isAuthenticated) return <LoginUI onLogin={handleLogin} />;

    const allModules = [
        { id: 'pos_retail', name: 'Punto de Venta IA', color: 'bg-orange-600', icon: '🛒', access: ['ADMIN', 'MANAGER'] },
        { id: 'inventory', name: 'Gestión de Productos', color: 'bg-indigo-600', icon: '🥐', access: ['ADMIN', 'MANAGER'] },
        { id: 'warehouse', name: 'Gestión de Almacenes', color: 'bg-slate-700', icon: '🏬', access: ['ADMIN', 'MANAGER'] },
        { id: 'vision_train', name: 'Entrenamiento IA', color: 'bg-[#c1d72e]', icon: '👁️', access: ['ADMIN', 'MANAGER'] },
        { id: 'production', name: 'Gestión de la Producción', color: 'bg-amber-800', icon: '🥣', access: ['ADMIN', 'BAKER'] },
        { id: 'pickup', name: 'Gestión de Pickup', color: 'bg-orange-600', icon: '🏪', access: ['ADMIN', 'MANAGER', 'BAKER'] },
        { id: 'repartos', name: 'Gestión de Repartos', color: 'bg-blue-700', icon: '🚗', access: ['ADMIN', 'MANAGER', 'LOGISTICS'] },
        { id: 'financials', name: 'Módulo Financiero', color: 'bg-emerald-800', icon: '📈', access: ['ADMIN', 'MANAGER'] },
        { id: 'analytics', name: 'Estadísticas de Ventas', color: 'bg-indigo-700', icon: '📊', access: ['ADMIN', 'MANAGER'] },
        { id: 'invoicing', name: 'Facturación CFDI', color: 'bg-blue-600', icon: '🧾', access: ['ADMIN', 'MANAGER', 'CASHIER'] },
        { id: 'purchasing', name: 'Gestión de Compras', color: 'bg-indigo-900', icon: '🛒', access: ['ADMIN', 'MANAGER'] },
        { id: 'procurement', name: 'B2B Procurement', color: 'bg-blue-900', icon: '🤝', access: ['ADMIN', 'MANAGER'] },
        { id: 'logistics', name: 'Logística de Rutas', color: 'bg-blue-600', icon: '🚚', access: ['ADMIN', 'MANAGER', 'LOGISTICS'] },
        { id: 'pos_tables', name: 'TPV Mesas & KDS', color: 'bg-orange-600', icon: '🍽️', access: ['ADMIN', 'MANAGER', 'WAITER'] },
        { id: 'waiter', name: 'App Mesero', color: 'bg-rose-700', icon: '📱', access: ['ADMIN', 'WAITER'] },
        { id: 'driver', name: 'App Repartidor', color: 'bg-gray-800', icon: '📱', access: ['ADMIN', 'DRIVER', 'LOGISTICS'] },
        { id: 'seguridad_acceso', name: 'Seguridad y Acceso', color: 'bg-indigo-900', icon: '🔑', access: ['ADMIN', 'MANAGER'] },
        { id: 'recursos_humanos', name: 'Recursos Humanos', color: 'bg-teal-800', icon: '👥', access: ['ADMIN', 'MANAGER'] },
        { id: 'auditoria', name: 'Auditoría y Control', color: 'bg-slate-900', icon: '📋', access: ['ADMIN', 'MANAGER'] },
        { id: 'settings', name: 'Ajustes del Sistema', color: 'bg-red-900', icon: '⚙️', access: ['ADMIN'] },
        { id: 'network_monitor', name: 'Monitoreo de Red', color: 'bg-cyan-900', icon: '📡', access: ['ADMIN', 'MANAGER'] },
        { id: 'reparto_grandeza', name: 'Reparto Pan Grandeza', color: 'bg-amber-700', icon: `${CONFIG.API_BASE_URL.replace(/\/api\/v1$/, '')}/static/images/grandeza/logo.png`, access: ['ADMIN', 'MANAGER', 'LOGISTICS', 'DRIVER'] },
    ];


    // Filtrado inteligente por rol y permisos granulares
    const visibleModules = allModules.filter(mod => {
        if (userRole === 'ADMIN') return true;
        
        // Si el usuario tiene una configuración de permisos granulares (objeto no vacío),
        // esa es la fuente de verdad absoluta para este usuario.
        if (userPermissions && Object.keys(userPermissions).length > 0) {
            if (userPermissions.all === 'full') return true;
            return userPermissions[mod.id] === 'full';
        }
        
        // Solo si no hay permisos granulares cargados, usamos la lógica de roles legacy.
        return mod.access.includes(userRole);
    });


    const mockData = {
        pendingDeliveries: [
            { id: 'ORD-001', customerName: 'Restaurante Gaucho', deliveryAddress: 'Av. Juárez 45, Toluca', deliveryDate: new Date(), status: 'READY' },
            { id: 'ORD-002', customerName: 'Hotel Marriott', deliveryAddress: 'Paseo Tollocan', deliveryDate: new Date(), status: 'READY' }
        ],
        vehicles: [{ id: 'V1', model: 'Toyota Hilux', plate: 'RDR-001' }],
        drivers: [{ id: 'D1', firstName: 'Juan', lastName: 'Pérez' }],
        dailyPlan: [
            { productName: 'Brownie Signature', suggestedBySales: 150, customerOrders: 20, totalRequired: 170, batchesToProduce: 5, totalToProduce: 200 },
            { productName: 'Pay de Queso', suggestedBySales: 40, customerOrders: 5, totalRequired: 45, batchesToProduce: 3, totalToProduce: 45 }
        ],
        clients: [
            { id: 'C1', restaurantName: 'Restaurante El Gaucho', contactName: 'Chef Alberto', phone: '722-123-4567', address: 'Toluca Centro' },
            { id: 'C2', restaurantName: 'Pizzería Napolitana', contactName: 'Mario Rossi', phone: '722-987-6543', address: 'Metepec' }
        ]
    };

    // Helper para interceptar navegación si el POS tiene cuentas sin guardar
    const attemptNavigation = (action) => {
        if (activeModule === 'pos_retail' && window.requestPOSExit) {
            const needsModal = window.requestPOSExit(action);
            if (!needsModal) action();
        } else {
            action();
        }
    };

    return (
        <div className="bg-[#050505] h-screen text-white font-sans flex overflow-hidden relative">

            {/* Sidebar de Control */}
            <aside className={`
                ${isSidebarCollapsed ? 'md:w-20 pointer-events-none md:pointer-events-auto' : 'w-80 pointer-events-auto'} 
                md:relative h-full bg-[#050505] md:bg-black/40 border-r border-gray-800 p-8 flex flex-col backdrop-blur-3xl transition-all duration-500 ease-in-out group shadow-2xl md:shadow-none
            `}
            style={{
                position: window.innerWidth < 768 ? 'fixed' : 'relative',
                top: 0,
                left: window.innerWidth < 768 ? (isSidebarCollapsed ? '-100%' : '0') : 'auto',
                zIndex: 999990
            }}>

                {/* Botón para Cerrar en MÓVIL */}
                <button
                    onClick={() => setIsSidebarCollapsed(true)}
                    className={`absolute right-4 top-10 w-10 h-10 bg-orange-600 rounded-full md:hidden flex items-center justify-center border border-white/10 shadow-xl hover:scale-110 active:scale-95 transition-all text-sm z-[99999] ${isSidebarCollapsed ? 'hidden' : 'flex'} text-white outline-none focus:outline-none pointer-events-auto`}
                    style={{ WebkitTapHighlightColor: 'transparent' }}
                >
                    ←
                </button>

                {/* Medio-Botón para ESCRITORIO (Cortado a la mitad exactamente en el borde) */}
                <div className="hidden md:block absolute right-0 top-10 w-4 h-8 overflow-hidden z-[99999]">
                    <button
                        onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                        className="absolute left-0 top-0 w-8 h-8 bg-orange-600 rounded-full flex items-center justify-center border border-white/10 shadow-xl hover:scale-110 active:scale-95 transition-all text-[10px] text-white outline-none focus:outline-none"
                        style={{ WebkitTapHighlightColor: 'transparent' }}
                    >
                        {isSidebarCollapsed ? '→' : '←'}
                    </button>
                </div>

                <div className="mb-12 flex items-center gap-4 group/logo cursor-pointer overflow-hidden">
                    <div className="w-16 h-16 bg-transparent flex items-center justify-center overflow-hidden transition-all group-hover/logo:scale-110 shrink-0">
                        <img src="/assets/logo.png" alt="R de Rico Logo" className="w-16 h-16 object-contain" />
                    </div>
                    {!isSidebarCollapsed && (
                        <div className="animate-in fade-in slide-in-from-left-4 duration-500">
                            <h2 className="text-xl font-black uppercase tracking-tighter text-orange-500">R de Rico</h2>
                            <p className="text-[8px] text-gray-500 font-bold uppercase tracking-[0.3em]">Imperial ERP</p>
                        </div>
                    )}
                </div>

                <nav className="flex-1 space-y-2 overflow-y-auto overflow-x-hidden pr-2 custom-scrollbar">
                    <button
                        onClick={() => attemptNavigation(() => setActiveModule('overview'))}
                        className={`w-full text-left p-4 rounded-2xl text-xs font-black uppercase tracking-widest transition-all overflow-hidden ${activeModule === 'overview' ? 'bg-orange-500/10 text-orange-500 border border-orange-500/20 shadow-2xl shadow-orange-500/10' : 'text-gray-500 hover:text-white'}`}
                    >
                        {isSidebarCollapsed ? '🏠' : '🏠 Vista General'}
                    </button>

                    <div className="h-px bg-gray-900 my-6" />

                    {visibleModules.map(mod => (
                        <button
                            key={mod.id}
                            onClick={() => attemptNavigation(() => setActiveModule(mod.id))}
                            title={mod.name}
                            className={`w-full text-left p-4 rounded-2xl flex items-center gap-4 transition-all group overflow-hidden ${activeModule === mod.id ? `${mod.color} text-white shadow-2xl shadow-current` : 'hover:bg-gray-900 text-gray-400'}`}
                        >
                            <span className="text-xl shrink-0 flex items-center justify-center">
                                {mod.icon.endsWith('.png') ? (
                                    <img src={mod.icon} alt={mod.name} className="w-12 h-12 object-cover rounded-full border border-amber-500/40 shadow-lg" />
                                ) : (
                                    mod.icon
                                )}
                            </span>
                            {!isSidebarCollapsed && <span className="text-[10px] font-black uppercase tracking-widest truncate">{mod.name}</span>}
                        </button>
                    ))}


                </nav>

                <div className={`mt-auto transition-all duration-500 ${isSidebarCollapsed ? 'opacity-0 scale-0 h-0 overflow-hidden' : 'opacity-100 scale-100'}`}>
                    <div className="p-6 bg-orange-600/10 border border-orange-500/20 rounded-[30px] relative overflow-hidden group">
                        <div className="absolute -top-10 -right-10 w-32 h-32 bg-orange-500/10 rounded-full" />
                        <p className="text-[10px] font-black uppercase text-orange-400 mb-2 tracking-widest">Usuario</p>
                        <p className="text-sm font-black leading-relaxed uppercase italic truncate text-white">{userName || 'Administrador'}</p>
                    </div>
                </div>

                {/* Botón de Salida de Turno (HR) */}
                {!isSidebarCollapsed && (
                    <div className="mt-2 px-4">
                        <button
                            onClick={() => setShowCheckOutModal(true)}
                            className="w-full p-3 font-bold uppercase tracking-widest transition-all rounded-2xl flex items-center justify-center gap-2 border bg-teal-500/10 text-teal-400 border-teal-500/20 hover:bg-teal-500/20 text-[9px]"
                            title="Registrar salida de turno"
                        >
                            👋 Registrar Salida de Turno
                        </button>
                    </div>
                )}

                <div className="mt-2 px-4 pb-4">
                    <button
                        onClick={() => attemptNavigation(() => setIsAuthenticated(false))}
                        className={`w-full p-4 font-black uppercase tracking-widest transition-all rounded-2xl flex items-center justify-center gap-2 border 
                            ${isSidebarCollapsed 
                                ? 'bg-red-500/10 text-red-500 border-red-500/20 hover:bg-red-500 hover:text-white text-lg' 
                                : 'bg-red-500/10 text-red-400 border-red-500/30 hover:bg-red-500 hover:text-white hover:border-red-500 text-[11px] shadow-[0_0_15px_rgba(239,68,68,0.15)] hover:shadow-[0_0_25px_rgba(239,68,68,0.4)]'
                            }`}
                        title="Cerrar sesión correctamente"
                    >
                        {isSidebarCollapsed ? '🚪' : '🚪 SALIR DEL SISTEMA'}
                    </button>
                </div>
            </aside>

            {/* Area de Experiencia */}
            <main 
                className="flex-1 overflow-y-auto relative custom-scrollbar bg-cover bg-center transition-all duration-700" 
                style={{ 
                    backgroundImage: activeModule === 'settings' 
                        ? `radial-gradient(circle at 50% 50%, rgba(249, 115, 22, 0.03), transparent 70%),
                           linear-gradient(rgba(255, 255, 255, 0.015) 1px, transparent 1px),
                           linear-gradient(90deg, rgba(255, 255, 255, 0.015) 1px, transparent 1px)`
                        : 'url("/assets/wood_bg.jpg")',
                    backgroundColor: activeModule === 'settings' ? '#050505' : 'transparent',
                    backgroundSize: activeModule === 'settings' ? '100% 100%, 50px 50px, 50px 50px' : 'cover'
                }}
            >

                <div className="relative z-10 h-full">
                    {activeModule === 'overview' && (
                        <div className="p-20 max-w-6xl mx-auto space-y-20 animate-in fade-in zoom-in-95 duration-700">
                            <section>
                                <h2 className="text-8xl font-black uppercase tracking-tighter leading-none mb-10">Tu Imperio <br /> <span className="text-orange-500 underline decoration-orange-600/30">Digital</span>.</h2>
                                <p className="text-2xl text-gray-400 font-medium max-w-2xl leading-relaxed">
                                    Socio, has construido una arquitectura de nivel mundial. Selecciona un módulo en el panel izquierdo para vivir la experiencia de **R de Rico**.
                                </p>
                            </section>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                                <div className="p-10 bg-gray-900/40 rounded-[50px] border border-gray-800">
                                    <h3 className="text-2xl font-black uppercase mb-4 text-orange-400">Planta Toluca</h3>
                                    <div className="space-y-4">
                                        <div className="flex justify-between items-center"><span className="text-gray-500 font-bold italic">Producción hoy:</span> <span className="font-black">100%</span></div>
                                        <div className="flex justify-between items-center"><span className="text-gray-500 font-bold italic">Mermas:</span> <span className="text-red-500 font-black">1.2%</span></div>
                                        <div className="flex justify-between items-center"><span className="text-gray-500 font-bold italic">Pedidos B2B:</span> <span className="font-black text-indigo-400">12</span></div>
                                    </div>
                                </div>
                                <div className="p-10 bg-gray-900/40 rounded-[50px] border border-gray-800">
                                    <h3 className="text-2xl font-black uppercase mb-4 text-blue-400">Logística</h3>
                                    <div className="space-y-4">
                                        <div className="flex justify-between items-center"><span className="text-gray-500 font-bold italic">Rutas Activas:</span> <span className="font-black">4</span></div>
                                        <div className="flex justify-between items-center"><span className="text-gray-500 font-bold italic">Vehículos en Campo:</span> <span className="font-black text-blue-500">2</span></div>
                                        <div className="flex justify-between items-center"><span className="text-gray-500 font-bold italic">Entregas Hoy:</span> <span className="text-green-500 font-black">28 / 30</span></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Area de Experiencia real */}
                    <div className="h-full">
                        {activeModule === 'financials' && <FinancialHubUI />}
                        {activeModule === 'analytics' && <EstadisticasVentasUI userPermissions={userPermissions} />}
                        {activeModule === 'invoicing' && <InvoicingHubUI />}
                        {activeModule === 'portal' && <CustomerInvoicingPortal />}
                        {activeModule === 'pos_tables' && <div className="h-full"><TableServicePOS /></div>}
                        {activeModule === 'pos_retail' && (
                            <div className="h-full">
                                <RetailVisionPOS 
                                    initialCategories={categories} 
                                    initialProducts={REAL_PRODUCTS}
                                    currentUser={{ id: userId, name: userName, role: userRole, permissions: userPermissions }}
                                    onForceLogout={() => setIsAuthenticated(false)}
                                    assignedTerminal={new URLSearchParams(window.location.search).get('terminal')}
                                />
                            </div>
                        )}
                        {activeModule === 'vision_train' && (
                            <div className="h-full">
                                <VisionTrainingUI 
                                    products={REAL_PRODUCTS} 
                                    categories={categories} 
                                    onCategoriesChange={setCategories} 
                                />
                            </div>
                        )}
                        {activeModule === 'ecommerce' && <CakeConfiguratorUI />}
                        {activeModule === 'production' && <ProductionManagementUI dailyPlan={mockData.dailyPlan} />}
                        {activeModule === 'pickup' && <GestorPickupUI onBack={() => setActiveModule('overview')} />}
                        {activeModule === 'repartos' && <GestorRepartosUI onBack={() => setActiveModule('overview')} />}
                        {activeModule === 'b2b' && <B2BManagerUI clients={mockData.clients} products={[]} />}
                        {activeModule === 'inventory' && <ProductCatalogUI userPermissions={userPermissions} />}
                        {activeModule === 'warehouse' && <WarehouseManagerUI />}
                        {activeModule === 'purchasing' && <PurchaseManagerUI />}
                        { activeModule === 'procurement' && <PurchasingHubUI /> }
                        { activeModule === 'logistics' && <LogisticsDashboardUI pendingDeliveries={mockData.pendingDeliveries} vehicles={mockData.vehicles} drivers={mockData.drivers} /> }
                        {activeModule === 'driver' && <DriverAppUI activeRoute={{ orders: [] }} currentDriver={{ name: 'Juan Pérez' }} />}
                        {activeModule === 'seguridad_acceso' && (
                            <SeguridadAccesoUI onPermissionsUpdate={handleUpdatePermissions} />
                        )}
                        {activeModule === 'auditoria' && <AuditoriaControlUI />}
                        {activeModule === 'settings' && <SystemSettingsUI />}
                        {activeModule === 'network_monitor' && <NetworkMonitorUI />}
                        {activeModule === 'reparto_grandeza' && <RepartoPanGrandezaUI onBack={() => setActiveModule('overview')} userPermissions={userPermissions} userRole={userRole} />}
                        {activeModule === 'recursos_humanos' && <RecursosHumanosUI userId={userId} userName={userName} />}
                    </div>

                </div>
            </main>

            {/* Pestañita flotante para móviles cuando está cerrado - DIAGNÓSTICO */}
            {isSidebarCollapsed && (
                <button
                    onClick={() => setIsSidebarCollapsed(false)}
                    className="flex items-center justify-center bg-orange-600 text-white text-lg border border-l-0 border-white/20 shadow-[0_0_30px_rgba(234,88,12,0.8)] outline-none focus:outline-none"
                    style={{ 
                        position: 'fixed',
                        left: '0px', 
                        top: '40px', 
                        width: '25px', 
                        height: '50px', 
                        borderTopRightRadius: '25px',
                        borderBottomRightRadius: '25px',
                        zIndex: 2147483647,
                        WebkitTapHighlightColor: 'transparent'
                    }}
                >
                    <span className="pr-1">▶</span>
                </button>
            )}

            {/* Modals de HR (check-in / check-out) */}
            {showCheckInModal && checkInData && (
                <CheckInWelcomeModal
                    data={checkInData}
                    onClose={() => { setShowCheckInModal(false); setCheckInData(null); }}
                />
            )}
            {showCheckOutModal && (
                <CheckOutModal
                    employeeName={userName}
                    onConfirm={async (tipo, obs) => {
                        try {
                            await hrService.checkOut(userId, tipo, obs);
                            setShowCheckOutModal(false);
                        } catch (err) {
                            console.error('Error en check-out:', err);
                        }
                    }}
                    onClose={() => setShowCheckOutModal(false)}
                />
            )}

            <style>{`
                .custom-scrollbar::-webkit-scrollbar { width: 6px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #333; border-radius: 10px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #f97316; }
            `}</style>
        </div >
    );
};
