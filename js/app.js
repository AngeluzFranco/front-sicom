/**
 * SICOM PWA - Aplicación Principal
 * Sistema de Punto de Venta
 * Con soporte offline y sincronización automática
 */

// Configuración global - API siempre apunta a producción
const APP_CONFIG = {
    // URL del backend en producción
    apiBaseUrl: 'https://ventas.betto.com.mx',
    appName: 'SICOM',
    version: '1.0.0',
    debug: true
};

// Estado de la aplicación
const AppState = {
    isOnline: navigator.onLine,
    user: null,
    negocio: null,
    espacio: null,
    token: null,
    pendingSyncCount: 0 // Contador de operaciones pendientes de sincronizar
};

// Logger con niveles
const Logger = {
    log: (...args) => APP_CONFIG.debug && console.log('[SICOM]', ...args),
    warn: (...args) => APP_CONFIG.debug && console.warn('[SICOM]', ...args),
    error: (...args) => console.error('[SICOM]', ...args)
};

// Utilidades
const Utils = {
    // Formatear moneda
    formatCurrency: (amount, currency = 'MXN') => {
        return new Intl.NumberFormat('es-MX', {
            style: 'currency',
            currency: currency
        }).format(amount);
    },
    
    // Formatear fecha
    formatDate: (date, options = {}) => {
        const defaultOptions = { 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        };
        return new Intl.DateTimeFormat('es-MX', { ...defaultOptions, ...options })
            .format(new Date(date));
    },
    
    // Formatear fecha y hora
    formatDateTime: (date) => {
        return new Intl.DateTimeFormat('es-MX', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        }).format(new Date(date));
    },
    
    // Debounce para optimizar eventos
    debounce: (func, wait) => {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },
    
    // Generar ID único
    generateId: () => {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    },
    
    // Sanitizar HTML
    sanitizeHTML: (str) => {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
};

// Cliente API
const API = {
    // Configuración base para fetch
    defaultHeaders: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
    },
    
    // Obtener headers con token
    getHeaders: () => {
        const headers = { ...API.defaultHeaders };
        const token = localStorage.getItem('token');
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        return headers;
    },
    
    // GET request
    get: async (endpoint, params = {}) => {
        try {
            const url = new URL(`${APP_CONFIG.apiBaseUrl}${endpoint}`, window.location.origin);
            Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));
            
            const response = await fetch(url, {
                method: 'GET',
                headers: API.getHeaders()
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            return await response.json();
        } catch (error) {
            Logger.error('API GET Error:', error);
            throw error;
        }
    },
    
    // POST request
    post: async (endpoint, data = {}) => {
        try {
            const response = await fetch(`${APP_CONFIG.apiBaseUrl}${endpoint}`, {
                method: 'POST',
                headers: API.getHeaders(),
                body: JSON.stringify(data)
            });
            
            const result = await response.json();
            
            // Verificar si fue encolado offline
            if (result.queued === true) {
                Logger.log('Request encolada offline:', result.tempId);
                AppState.pendingSyncCount++;
                OfflineSync.updateSyncBadge();
                
                // Retornar con indicador de éxito para que la UI lo trate correctamente
                return {
                    ...result,
                    _offlineQueued: true
                };
            }
            
            if (!response.ok && !result.queued) {
                throw new Error(result.error || `HTTP ${response.status}: ${response.statusText}`);
            }
            
            return result;
        } catch (error) {
            Logger.error('API POST Error:', error);
            throw error;
        }
    },
    
    // PUT request
    put: async (endpoint, data = {}) => {
        try {
            const response = await fetch(`${APP_CONFIG.apiBaseUrl}${endpoint}`, {
                method: 'PUT',
                headers: API.getHeaders(),
                body: JSON.stringify(data)
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            return await response.json();
        } catch (error) {
            Logger.error('API PUT Error:', error);
            throw error;
        }
    },
    
    // DELETE request
    delete: async (endpoint) => {
        try {
            const response = await fetch(`${APP_CONFIG.apiBaseUrl}${endpoint}`, {
                method: 'DELETE',
                headers: API.getHeaders()
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            return await response.json();
        } catch (error) {
            Logger.error('API DELETE Error:', error);
            throw error;
        }
    }
};

// Gestor de Storage local
const Storage = {
    set: (key, value) => {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (error) {
            Logger.error('Storage set error:', error);
            return false;
        }
    },
    
    get: (key, defaultValue = null) => {
        try {
            const item = localStorage.getItem(key);
            return item ? JSON.parse(item) : defaultValue;
        } catch (error) {
            Logger.error('Storage get error:', error);
            return defaultValue;
        }
    },
    
    remove: (key) => {
        try {
            localStorage.removeItem(key);
            return true;
        } catch (error) {
            Logger.error('Storage remove error:', error);
            return false;
        }
    },
    
    clear: () => {
        try {
            localStorage.clear();
            return true;
        } catch (error) {
            Logger.error('Storage clear error:', error);
            return false;
        }
    }
};

// Gestor de sesión
const Session = {
    // Iniciar sesión
    login: (userData) => {
        AppState.user = userData.usuario;
        AppState.negocio = userData.negocio;
        AppState.espacio = userData.espacio;
        AppState.token = userData.token;
        
        Storage.set('session', {
            usuario: userData.usuario,
            negocio: userData.negocio,
            espacio: userData.espacio,
            token: userData.token,
            timestamp: Date.now()
        });
        
        Logger.log('Sesión iniciada:', userData.usuario);
    },
    
    // Cerrar sesión
    logout: () => {
        AppState.user = null;
        AppState.negocio = null;
        AppState.espacio = null;
        AppState.token = null;
        
        Storage.remove('session');
        Storage.remove('token');
        
        Logger.log('Sesión cerrada');
        window.location.href = '/index.html';
    },
    
    // Verificar si hay sesión válida
    isLoggedIn: () => {
        const session = Storage.get('session');
        if (!session) return false;
        
        // Verificar si la sesión ha expirado (8 horas)
        const maxAge = 8 * 60 * 60 * 1000;
        if (Date.now() - session.timestamp > maxAge) {
            Session.logout();
            return false;
        }
        
        AppState.user = session.usuario;
        AppState.negocio = session.negocio;
        AppState.espacio = session.espacio;
        AppState.token = session.token;
        
        return true;
    },
    
    // Obtener datos de sesión
    getData: () => {
        return Storage.get('session');
    }
};

// Módulo de Autenticación - Comunicación con backend usando endpoints originales
const Auth = {
    /**
     * Login de usuario usando FormData (compatible con PHP $_POST)
     * @param {Object} credentials - {usuario, password, cod_negocio, cod_espacio}
     * @returns {Promise<Object>} - Respuesta del servidor
     */
    login: async (credentials) => {
        const formData = new FormData();
        formData.append('usuario', credentials.usuario);
        formData.append('password', credentials.password);
        formData.append('cod_negocio', credentials.cod_negocio);
        formData.append('cod_espacio', credentials.cod_espacio);
        
        try {
            const response = await fetch(`${APP_CONFIG.apiBaseUrl}/index.php?format=json`, {
                method: 'POST',
                body: formData,
                credentials: 'include' // Importante para cookies de sesión
            });
            
            const result = await response.json();
            
            if (response.ok && result.success) {
                // Guardar sesión localmente
                Session.login({
                    usuario: result.data.usuario,
                    negocio: result.data.negocio,
                    espacio: result.data.espacio,
                    token: result.data.token || ''
                });
                return result;
            } else {
                throw new Error(result.message || 'Error de autenticación');
            }
        } catch (error) {
            Logger.error('Auth.login error:', error);
            throw error;
        }
    },
    
    /**
     * Logout de usuario
     * @returns {Promise<Object>} - Respuesta del servidor
     */
    logout: async () => {
        try {
            const response = await fetch(`${APP_CONFIG.apiBaseUrl}/sistema/src/logout.php?format=json`, {
                method: 'POST',
                credentials: 'include'
            });
            
            const result = await response.json();
            
            // Limpiar sesión local independientemente de la respuesta
            Session.logout();
            
            return result;
        } catch (error) {
            Logger.error('Auth.logout error:', error);
            // Aún así limpiar sesión local
            Session.logout();
            throw error;
        }
    },
    
    /**
     * Obtener espacios por negocio
     * @param {string|number} codNegocio - Código del negocio
     * @param {string} usuario - ID del usuario (opcional, afecta filtrado)
     * @returns {Promise<Array>} - Lista de espacios
     */
    getEspacios: async (codNegocio, usuario = '') => {
        try {
            const params = new URLSearchParams({
                cod_negocio: codNegocio,
                usuario: usuario,
                format: 'json'
            });
            
            const response = await fetch(`${APP_CONFIG.apiBaseUrl}/get_espacios.php?${params}`, {
                method: 'GET',
                credentials: 'include'
            });
            
            const result = await response.json();
            
            if (response.ok && result.success) {
                return result.data;
            } else {
                throw new Error(result.message || 'Error al obtener espacios');
            }
        } catch (error) {
            Logger.error('Auth.getEspacios error:', error);
            throw error;
        }
    },
    
    /**
     * Verificar si el usuario tiene sesión activa en el servidor
     * @returns {Promise<boolean>}
     */
    checkSession: async () => {
        // Primero verificar sesión local
        if (!Session.isLoggedIn()) {
            return false;
        }
        
        // Opcionalmente verificar con el servidor
        // Por ahora confiamos en la sesión local
        return true;
    }
};

// Exportar Auth al objeto global SICOM
if (typeof window.SICOM === 'undefined') {
    window.SICOM = {};
}
window.SICOM.Auth = Auth;

// ============================================
// API CLIENT LEGACY - Para endpoints tipo formulario
// ============================================
/**
 * Cliente API para endpoints legacy que usan FormData
 * Compatible con los endpoints del sistema original
 */
const ApiClientLegacy = {
    /**
     * URL base para endpoints legacy (sistema/src/...)
     */
    getBaseUrl: () => `${APP_CONFIG.apiBaseUrl}/sistema/src/productos`,

    /**
     * Realiza petición GET con querystring
     * @param {string} endpoint - Nombre del archivo PHP
     * @param {Object} params - Parámetros para querystring
     * @returns {Promise<Object>}
     */
    get: async (endpoint, params = {}) => {
        params.format = 'json'; // Siempre pedir JSON
        const queryString = new URLSearchParams(params).toString();
        const url = `${ApiClientLegacy.getBaseUrl()}/${endpoint}?${queryString}`;
        
        try {
            const response = await fetch(url, {
                method: 'GET',
                credentials: 'include',
                headers: {
                    'Accept': 'application/json'
                }
            });
            
            const result = await response.json();
            
            if (!response.ok) {
                throw new Error(result.message || `Error ${response.status}`);
            }
            
            return result;
        } catch (error) {
            Logger.error('ApiClientLegacy.get error:', error);
            throw error;
        }
    },

    /**
     * Realiza petición POST con FormData
     * @param {string} endpoint - Nombre del archivo PHP
     * @param {Object} data - Datos a enviar
     * @returns {Promise<Object>}
     */
    post: async (endpoint, data = {}) => {
        const formData = new FormData();
        
        // Convertir objeto a FormData, manejando arrays como forma_pago[]
        for (const [key, value] of Object.entries(data)) {
            if (Array.isArray(value)) {
                value.forEach((v, i) => formData.append(`${key}[]`, v));
            } else if (typeof value === 'object' && value !== null) {
                // Para objetos como forma_pago[123] = 'EFE'
                for (const [subKey, subValue] of Object.entries(value)) {
                    formData.append(`${key}[${subKey}]`, subValue);
                }
            } else {
                formData.append(key, value);
            }
        }
        
        // Agregar formato JSON
        formData.append('format', 'json');
        
        try {
            const response = await fetch(`${ApiClientLegacy.getBaseUrl()}/${endpoint}`, {
                method: 'POST',
                body: formData,
                credentials: 'include',
                headers: {
                    'Accept': 'application/json'
                }
            });
            
            const result = await response.json();
            
            if (!response.ok && !result.success) {
                throw new Error(result.message || `Error ${response.status}`);
            }
            
            return result;
        } catch (error) {
            Logger.error('ApiClientLegacy.post error:', error);
            throw error;
        }
    }
};

// ============================================
// MÓDULO DE PRODUCTOS/VENTAS
// ============================================
const Productos = {
    /**
     * Listar productos paginados
     * @param {number} pagina - Número de página
     * @returns {Promise<Object>} { productos[], paginacion, carrito_count }
     */
    listar: async (pagina = 1) => {
        try {
            const result = await ApiClientLegacy.get('productos.php', { pagina });
            return result.data;
        } catch (error) {
            Logger.error('Productos.listar error:', error);
            throw error;
        }
    },

    /**
     * Agregar producto al carrito
     * @param {number} codProducto - Código del producto
     * @param {number} cantidad - Cantidad a agregar
     * @returns {Promise<Object>}
     */
    agregarAlCarrito: async (codProducto, cantidad = 1) => {
        try {
            const result = await ApiClientLegacy.post('productos.php', {
                agregar: '1',
                producto: codProducto,
                cantidad: cantidad
            });
            return result.data;
        } catch (error) {
            Logger.error('Productos.agregarAlCarrito error:', error);
            throw error;
        }
    }
};

const Carrito = {
    /**
     * Obtener contenido del carrito
     * @returns {Promise<Object>} { items[], total, carrito_count, puede_usar_cupon }
     */
    obtener: async () => {
        try {
            const result = await ApiClientLegacy.get('ver_carrito.php');
            return result.data;
        } catch (error) {
            Logger.error('Carrito.obtener error:', error);
            throw error;
        }
    },

    /**
     * Quitar producto del carrito
     * @param {number} codProducto - Código del producto a quitar
     * @returns {Promise<Object>}
     */
    quitarProducto: async (codProducto) => {
        try {
            const result = await ApiClientLegacy.get('ver_carrito.php', { quitar: codProducto });
            return result.data;
        } catch (error) {
            Logger.error('Carrito.quitarProducto error:', error);
            throw error;
        }
    },

    /**
     * Vaciar el carrito completo
     * @returns {Promise<Object>}
     */
    vaciar: async () => {
        try {
            const result = await ApiClientLegacy.post('ver_carrito.php', { vaciar_carrito: '1' });
            return result.data;
        } catch (error) {
            Logger.error('Carrito.vaciar error:', error);
            throw error;
        }
    },

    /**
     * Validar código de cupón
     * @param {string} codigo - Código del cupón
     * @returns {Promise<Object>} { valido, tipo, valor, descuento, mensaje }
     */
    validarCupon: async (codigo) => {
        try {
            const formData = new FormData();
            formData.append('codigo', codigo);
            
            const response = await fetch(`${ApiClientLegacy.getBaseUrl()}/validar_cupon.php`, {
                method: 'POST',
                body: formData,
                credentials: 'include'
            });
            
            return await response.json();
        } catch (error) {
            Logger.error('Carrito.validarCupon error:', error);
            throw error;
        }
    },

    /**
     * Realizar venta
     * @param {Object} formasPago - Objeto { cod_producto: forma_pago }
     * @param {string} cupon - Código de cupón (opcional)
     * @returns {Promise<Object>} { cod_movimiento, total, redirect }
     */
    realizarVenta: async (formasPago, cupon = '') => {
        try {
            const data = {
                realizar_venta: '1',
                forma_pago: formasPago
            };
            if (cupon) {
                data.cupon = cupon;
            }
            
            const result = await ApiClientLegacy.post('ver_carrito.php', data);
            return result.data;
        } catch (error) {
            Logger.error('Carrito.realizarVenta error:', error);
            throw error;
        }
    }
};

const Ventas = {
    /**
     * Obtener detalle de una venta
     * @param {number} movimiento - Código de movimiento
     * @returns {Promise<Object>} { venta, detalle[], totales_por_forma }
     */
    obtenerDetalle: async (movimiento) => {
        try {
            const result = await ApiClientLegacy.get('detalle_venta.php', { mov: movimiento });
            return result.data;
        } catch (error) {
            Logger.error('Ventas.obtenerDetalle error:', error);
            throw error;
        }
    },

    /**
     * Obtener detalle para cliente (sin autenticación completa)
     * @param {number} movimiento - Código de movimiento
     * @returns {Promise<Object>}
     */
    obtenerDetalleCliente: async (movimiento) => {
        try {
            const result = await ApiClientLegacy.get('detalle_cliente.php', { mov: movimiento });
            return result.data;
        } catch (error) {
            Logger.error('Ventas.obtenerDetalleCliente error:', error);
            throw error;
        }
    },

    /**
     * Enviar ticket por correo
     * @param {number} movimiento - Código de movimiento
     * @param {string} correo - Email destino
     * @returns {Promise<Object>}
     */
    enviarTicket: async (movimiento, correo) => {
        try {
            const result = await ApiClientLegacy.post('detalle_venta.php', {
                mov: movimiento,
                correoDestino: correo
            });
            return result.data;
        } catch (error) {
            Logger.error('Ventas.enviarTicket error:', error);
            throw error;
        }
    }
};

// Exportar módulos al objeto global SICOM
window.SICOM.ApiClientLegacy = ApiClientLegacy;
window.SICOM.Productos = Productos;
window.SICOM.Carrito = Carrito;
window.SICOM.Ventas = Ventas;

// ============================================
// MÓDULO DE DECANTS
// Reutiliza la lógica de productos pero con endpoints /decants/
// ============================================
const ApiClientLegacyDecants = {
    getBaseUrl: () => `${APP_CONFIG.apiBaseUrl}/sistema/src/decants`,

    get: async (endpoint, params = {}) => {
        try {
            params.format = 'json';
            const queryString = new URLSearchParams(params).toString();
            const url = `${ApiClientLegacyDecants.getBaseUrl()}/${endpoint}?${queryString}`;
            
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
                },
                credentials: 'include'
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            return await response.json();
        } catch (error) {
            Logger.error('ApiClientLegacyDecants.get error:', error);
            throw error;
        }
    },

    post: async (endpoint, data = {}) => {
        try {
            data.format = 'json';
            const formData = new FormData();
            
            for (const [key, value] of Object.entries(data)) {
                if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                    for (const [subKey, subValue] of Object.entries(value)) {
                        formData.append(`${key}[${subKey}]`, subValue);
                    }
                } else {
                    formData.append(key, value);
                }
            }
            
            const response = await fetch(`${ApiClientLegacyDecants.getBaseUrl()}/${endpoint}`, {
                method: 'POST',
                body: formData,
                credentials: 'include'
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            return await response.json();
        } catch (error) {
            Logger.error('ApiClientLegacyDecants.post error:', error);
            throw error;
        }
    }
};

const Decants = {
    listar: async (pagina = 1) => {
        try {
            const result = await ApiClientLegacyDecants.get('productos.php', { pagina });
            return result.data;
        } catch (error) {
            Logger.error('Decants.listar error:', error);
            throw error;
        }
    },

    agregarAlCarrito: async (codProducto, cantidad = 1) => {
        try {
            const result = await ApiClientLegacyDecants.post('productos.php', {
                agregar: '1',
                producto: codProducto,
                cantidad: cantidad
            });
            return result.data;
        } catch (error) {
            Logger.error('Decants.agregarAlCarrito error:', error);
            throw error;
        }
    }
};

const CarritoDecants = {
    obtener: async () => {
        try {
            const result = await ApiClientLegacyDecants.get('ver_carrito.php');
            return result.data;
        } catch (error) {
            Logger.error('CarritoDecants.obtener error:', error);
            throw error;
        }
    },

    quitarProducto: async (codProducto) => {
        try {
            const result = await ApiClientLegacyDecants.get('ver_carrito.php', { quitar: codProducto });
            return result.data;
        } catch (error) {
            Logger.error('CarritoDecants.quitarProducto error:', error);
            throw error;
        }
    },

    vaciar: async () => {
        try {
            const result = await ApiClientLegacyDecants.post('ver_carrito.php', { vaciar_carrito: '1' });
            return result.data;
        } catch (error) {
            Logger.error('CarritoDecants.vaciar error:', error);
            throw error;
        }
    },

    validarCupon: async (codigo) => {
        try {
            const formData = new FormData();
            formData.append('codigo', codigo);
            
            // Reutiliza el validador de cupones de productos
            const response = await fetch(`${APP_CONFIG.apiBaseUrl}/sistema/src/productos/validar_cupon.php`, {
                method: 'POST',
                body: formData,
                credentials: 'include'
            });
            
            return await response.json();
        } catch (error) {
            Logger.error('CarritoDecants.validarCupon error:', error);
            throw error;
        }
    },

    realizarVenta: async (formasPago, cupon = '') => {
        try {
            const data = {
                realizar_venta: '1',
                forma_pago: formasPago
            };
            if (cupon) {
                data.cupon = cupon;
            }
            
            const result = await ApiClientLegacyDecants.post('ver_carrito.php', data);
            return result.data;
        } catch (error) {
            Logger.error('CarritoDecants.realizarVenta error:', error);
            throw error;
        }
    }
};

const VentasDecants = {
    obtenerDetalle: async (movimiento) => {
        try {
            const result = await ApiClientLegacyDecants.get('detalle_venta.php', { mov: movimiento });
            return result.data;
        } catch (error) {
            Logger.error('VentasDecants.obtenerDetalle error:', error);
            throw error;
        }
    },

    obtenerDetalleCliente: async (movimiento) => {
        try {
            const result = await ApiClientLegacyDecants.get('detalle_cliente.php', { mov: movimiento });
            return result.data;
        } catch (error) {
            Logger.error('VentasDecants.obtenerDetalleCliente error:', error);
            throw error;
        }
    },

    enviarTicket: async (movimiento, correo) => {
        try {
            const result = await ApiClientLegacyDecants.post('detalle_venta.php', {
                mov: movimiento,
                correoDestino: correo
            });
            return result.data;
        } catch (error) {
            Logger.error('VentasDecants.enviarTicket error:', error);
            throw error;
        }
    }
};

// Exportar módulos de Decants
window.SICOM.ApiClientLegacyDecants = ApiClientLegacyDecants;
window.SICOM.Decants = Decants;
window.SICOM.CarritoDecants = CarritoDecants;
window.SICOM.VentasDecants = VentasDecants;

// ==========================================
// API Client Legacy Stock
// ==========================================
const ApiClientLegacyStock = {
    getBaseUrl: () => `${APP_CONFIG.apiBaseUrl}/sistema/src/stock`,
    
    get: async (endpoint, params = {}) => {
        try {
            params.format = 'json';
            const queryString = new URLSearchParams(params).toString();
            const url = `${ApiClientLegacyStock.getBaseUrl()}/${endpoint}?${queryString}`;
            
            const response = await fetch(url, {
                method: 'GET',
                credentials: 'include',
                headers: {
                    'Accept': 'application/json'
                }
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            return await response.json();
        } catch (error) {
            Logger.error('ApiClientLegacyStock.get error:', error);
            throw error;
        }
    },

    post: async (endpoint, data = {}) => {
        try {
            const formData = new FormData();
            for (const [key, value] of Object.entries(data)) {
                if (value !== null && value !== undefined) {
                    formData.append(key, value);
                }
            }
            
            const response = await fetch(`${ApiClientLegacyStock.getBaseUrl()}/${endpoint}?format=json`, {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Accept': 'application/json'
                },
                body: formData
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            return await response.json();
        } catch (error) {
            Logger.error('ApiClientLegacyStock.post error:', error);
            throw error;
        }
    }
};

// Módulo Stock - Gestión de inventario
const Stock = {
    /**
     * Listar stock del espacio seleccionado
     * @param {string} espacio - Código del espacio (opcional, usa el de sesión si no se envía)
     */
    listar: async (espacio = null) => {
        try {
            const params = {};
            if (espacio) {
                params.espacio = espacio;
            }
            const result = await ApiClientLegacyStock.get('gestorStock.php', params);
            return result.data;
        } catch (error) {
            Logger.error('Stock.listar error:', error);
            throw error;
        }
    },

    /**
     * Cambiar espacio seleccionado
     * @param {string} espacio - Código del espacio
     */
    cambiarEspacio: async (espacio) => {
        try {
            const result = await ApiClientLegacyStock.post('gestorStock.php', {
                espacio: espacio
            });
            return result.data;
        } catch (error) {
            Logger.error('Stock.cambiarEspacio error:', error);
            throw error;
        }
    },

    /**
     * Agregar stock de producto
     * @param {Object} datos - { producto, cantidad, precioCompra, precioVenta }
     */
    agregar: async (datos) => {
        try {
            const result = await ApiClientLegacyStock.post('gestorStock.php', {
                accion: 'agregar',
                producto: datos.producto,
                cantidad: datos.cantidad,
                precioCompra: datos.precioCompra,
                precioVenta: datos.precioVenta,
                espacio: datos.espacio
            });
            return result.data;
        } catch (error) {
            Logger.error('Stock.agregar error:', error);
            throw error;
        }
    },

    /**
     * Eliminar stock de producto
     * @param {string} producto - Código del producto
     * @param {string} espacio - Código del espacio
     */
    eliminar: async (producto, espacio) => {
        try {
            const result = await ApiClientLegacyStock.post('gestorStock.php', {
                accion: 'eliminar',
                producto: producto,
                espacio: espacio
            });
            return result.data;
        } catch (error) {
            Logger.error('Stock.eliminar error:', error);
            throw error;
        }
    },

    /**
     * Actualizar cantidad de stock
     * @param {string} producto - Código del producto
     * @param {number} cantidad - Nueva cantidad
     * @param {string} espacio - Código del espacio
     */
    actualizar: async (producto, cantidad, espacio) => {
        try {
            const result = await ApiClientLegacyStock.post('gestorStock.php', {
                accion: 'actualizar',
                producto: producto,
                cantidad: cantidad,
                espacio: espacio
            });
            return result.data;
        } catch (error) {
            Logger.error('Stock.actualizar error:', error);
            throw error;
        }
    },

    /**
     * Transferir stock a otro espacio
     * @param {string} producto - Código del producto
     * @param {string} espacioOrigen - Código del espacio origen
     * @param {string} espacioDestino - Código del espacio destino
     */
    transferir: async (producto, espacioOrigen, espacioDestino) => {
        try {
            const result = await ApiClientLegacyStock.post('gestorStock.php', {
                accion: 'transferir',
                producto: producto,
                espacio: espacioOrigen,
                espacioDestino: espacioDestino
            });
            return result.data;
        } catch (error) {
            Logger.error('Stock.transferir error:', error);
            throw error;
        }
    },

    /**
     * Enviar reporte de stock por correo
     * @param {string} negocio - Código del negocio
     * @param {string} espacio - Código del espacio
     * @param {string} correo - Correo destinatario
     */
    enviarCorreo: async (negocio, espacio, correo) => {
        try {
            const result = await ApiClientLegacyStock.post('enviarStockCorreo.php', {
                negocio: negocio,
                espacio: espacio,
                correo: correo
            });
            return result.data;
        } catch (error) {
            Logger.error('Stock.enviarCorreo error:', error);
            throw error;
        }
    }
};

// Exportar módulos de Stock
window.SICOM.ApiClientLegacyStock = ApiClientLegacyStock;
window.SICOM.Stock = Stock;

// ==========================================
// API Client Legacy Catálogos
// ==========================================
const ApiClientLegacyCatalogos = {
    getBaseUrl: () => `${APP_CONFIG.apiBaseUrl}/sistema/src/catalogos`,
    
    get: async (endpoint, params = {}) => {
        try {
            params.format = 'json';
            const queryString = new URLSearchParams(params).toString();
            const url = `${ApiClientLegacyCatalogos.getBaseUrl()}/${endpoint}?${queryString}`;
            
            const response = await fetch(url, {
                method: 'GET',
                credentials: 'include',
                headers: {
                    'Accept': 'application/json'
                }
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            return await response.json();
        } catch (error) {
            Logger.error('ApiClientLegacyCatalogos.get error:', error);
            throw error;
        }
    },

    post: async (endpoint, data = {}) => {
        try {
            const formData = new FormData();
            for (const [key, value] of Object.entries(data)) {
                if (value !== null && value !== undefined) {
                    formData.append(key, value);
                }
            }
            
            const response = await fetch(`${ApiClientLegacyCatalogos.getBaseUrl()}/${endpoint}?format=json`, {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Accept': 'application/json'
                },
                body: formData
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            return await response.json();
        } catch (error) {
            Logger.error('ApiClientLegacyCatalogos.post error:', error);
            throw error;
        }
    }
};

// Módulo Menú Catálogos
const MenuCatalogos = {
    /**
     * Obtener opciones del menú de catálogos
     */
    obtenerOpciones: async () => {
        try {
            const result = await ApiClientLegacyCatalogos.get('menuCatalogos.php');
            return result.data;
        } catch (error) {
            Logger.error('MenuCatalogos.obtenerOpciones error:', error);
            throw error;
        }
    }
};

// Módulo Cupones - CRUD
const Cupones = {
    /**
     * Listar todos los cupones
     */
    listar: async () => {
        try {
            const result = await ApiClientLegacyCatalogos.get('cupones/frmCupon.php');
            return result.data;
        } catch (error) {
            Logger.error('Cupones.listar error:', error);
            throw error;
        }
    },

    /**
     * Insertar nuevo cupón
     * @param {Object} datos - { codigo, tipo, valor, cantidad, fecha_inicio, fecha_fin, estatus }
     */
    insertar: async (datos) => {
        try {
            const result = await ApiClientLegacyCatalogos.post('cupones/frmCupon.php', {
                accion: 'insertar',
                codigo: datos.codigo,
                tipo: datos.tipo,
                valor: datos.valor,
                cantidad: datos.cantidad,
                fecha_inicio: datos.fecha_inicio,
                fecha_fin: datos.fecha_fin,
                estatus: datos.estatus
            });
            return result;
        } catch (error) {
            Logger.error('Cupones.insertar error:', error);
            throw error;
        }
    },

    /**
     * Actualizar cupón existente
     * @param {Object} datos - { cod_cupon, codigo, tipo, valor, cantidad, fecha_inicio, fecha_fin, estatus }
     */
    actualizar: async (datos) => {
        try {
            const result = await ApiClientLegacyCatalogos.post('cupones/frmCupon.php', {
                accion: 'actualizar',
                cod_cupon: datos.cod_cupon,
                codigo: datos.codigo,
                tipo: datos.tipo,
                valor: datos.valor,
                cantidad: datos.cantidad,
                fecha_inicio: datos.fecha_inicio,
                fecha_fin: datos.fecha_fin,
                estatus: datos.estatus
            });
            return result;
        } catch (error) {
            Logger.error('Cupones.actualizar error:', error);
            throw error;
        }
    },

    /**
     * Eliminar cupón
     * @param {string} codCupon - Código del cupón
     */
    eliminar: async (codCupon) => {
        try {
            const result = await ApiClientLegacyCatalogos.post('cupones/frmCupon.php', {
                accion: 'eliminar',
                cod_cupon: codCupon
            });
            return result;
        } catch (error) {
            Logger.error('Cupones.eliminar error:', error);
            throw error;
        }
    }
};

// Módulo Promociones - CRUD
const Promociones = {
    /**
     * Listar todas las promociones (con lista de productos disponibles)
     */
    listar: async () => {
        try {
            const result = await ApiClientLegacyCatalogos.get('promociones/catalogoPromociones.php');
            return result.data;
        } catch (error) {
            Logger.error('Promociones.listar error:', error);
            throw error;
        }
    },

    /**
     * Obtener una promoción para editar
     * @param {string} codPromocion - Código de la promoción
     * @param {string} codProducto - Código del producto
     */
    obtener: async (codPromocion, codProducto) => {
        try {
            const result = await ApiClientLegacyCatalogos.get('promociones/catalogoPromociones.php', {
                editar: 1,
                cod_promocion: codPromocion,
                cod_producto: codProducto
            });
            return result.data;
        } catch (error) {
            Logger.error('Promociones.obtener error:', error);
            throw error;
        }
    },

    /**
     * Insertar nueva promoción
     * @param {Object} datos - { cod_promocion, cod_producto, activa, fecha_inicio, fecha_fin, descripcion }
     */
    insertar: async (datos) => {
        try {
            const result = await ApiClientLegacyCatalogos.post('promociones/catalogoPromociones.php', {
                guardar: 1,
                modo: 'nuevo',
                cod_promocion: datos.cod_promocion,
                cod_producto: datos.cod_producto,
                activa: datos.activa ? 1 : 0,
                fecha_inicio: datos.fecha_inicio,
                fecha_fin: datos.fecha_fin,
                descripcion: datos.descripcion
            });
            return result;
        } catch (error) {
            Logger.error('Promociones.insertar error:', error);
            throw error;
        }
    },

    /**
     * Actualizar promoción existente
     * @param {Object} datos - { cod_promocion, cod_producto, activa, fecha_inicio, fecha_fin, descripcion }
     */
    actualizar: async (datos) => {
        try {
            const result = await ApiClientLegacyCatalogos.post('promociones/catalogoPromociones.php', {
                guardar: 1,
                modo: 'editar',
                cod_promocion: datos.cod_promocion,
                cod_producto: datos.cod_producto,
                activa: datos.activa ? 1 : 0,
                fecha_inicio: datos.fecha_inicio,
                fecha_fin: datos.fecha_fin,
                descripcion: datos.descripcion
            });
            return result;
        } catch (error) {
            Logger.error('Promociones.actualizar error:', error);
            throw error;
        }
    },

    /**
     * Eliminar promoción
     * @param {string} codPromocion - Código de la promoción
     * @param {string} codProducto - Código del producto
     */
    eliminar: async (codPromocion, codProducto) => {
        try {
            const result = await ApiClientLegacyCatalogos.post('promociones/catalogoPromociones.php', {
                accion: 'eliminar',
                cod_promocion: codPromocion,
                cod_producto: codProducto
            });
            return result;
        } catch (error) {
            Logger.error('Promociones.eliminar error:', error);
            throw error;
        }
    }
};

// Exportar módulos de Catálogos
window.SICOM.ApiClientLegacyCatalogos = ApiClientLegacyCatalogos;
window.SICOM.MenuCatalogos = MenuCatalogos;
window.SICOM.Cupones = Cupones;
window.SICOM.Promociones = Promociones;

// ============================================
// MÓDULO 6: REPORTES DE VENTAS
// ============================================

/**
 * Cliente API para endpoints de Reportes
 * Base URL: /sistema/src/ventas
 */
const ApiClientLegacyReportes = {
    getBaseUrl: () => `${APP_CONFIG.apiBaseUrl}/sistema/src/ventas`,
    
    /**
     * GET request con soporte JSON
     */
    get: async (endpoint, params = {}) => {
        const url = new URL(`${ApiClientLegacyReportes.getBaseUrl()}/${endpoint}`);
        params.format = 'json';
        Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));
        
        const response = await fetch(url, {
            method: 'GET',
            credentials: 'include',
            headers: {
                'Accept': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        return response.json();
    },
    
    /**
     * POST request con FormData
     */
    post: async (endpoint, data = {}) => {
        const url = `${ApiClientLegacyReportes.getBaseUrl()}/${endpoint}?format=json`;
        const formData = new FormData();
        
        Object.keys(data).forEach(key => {
            if (data[key] !== undefined && data[key] !== null) {
                formData.append(key, data[key]);
            }
        });
        
        const response = await fetch(url, {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Accept': 'application/json'
            },
            body: formData
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        return response.json();
    }
};

/**
 * Módulo Menú Reportes
 */
const MenuReportes = {
    /**
     * Obtener opciones del menú de reportes
     */
    obtenerOpciones: async () => {
        return ApiClientLegacyReportes.get('frmMenuReportes.php');
    }
};

/**
 * Módulo Ventas por Día (detallado)
 */
const VentasPorDia = {
    /**
     * Obtener datos del formulario (usuarios)
     */
    obtenerFormulario: async () => {
        return ApiClientLegacyReportes.get('ventasPorDia.php');
    },
    
    /**
     * Consultar ventas de un día específico
     * @param {string} fecha - Fecha en formato YYYY-MM-DD
     * @param {number} usuario - Código del usuario/vendedor
     */
    consultar: async (fecha, usuario) => {
        return ApiClientLegacyReportes.post('ventasPorDia.php', {
            fecha: fecha,
            usuario: usuario
        });
    }
};

/**
 * Módulo Ventas por Rango
 */
const VentasPorRango = {
    /**
     * Obtener datos del formulario (usuarios)
     */
    obtenerFormulario: async () => {
        return ApiClientLegacyReportes.get('ventasPorRango.php');
    },
    
    /**
     * Consultar ventas en un rango de fechas
     * @param {string} fechaInicio - Fecha inicio YYYY-MM-DD
     * @param {string} fechaFin - Fecha fin YYYY-MM-DD
     * @param {number|string} usuario - Código usuario ('' = todos)
     */
    consultar: async (fechaInicio, fechaFin, usuario = '') => {
        return ApiClientLegacyReportes.post('ventasPorRango.php', {
            fecha_inicio: fechaInicio,
            fecha_fin: fechaFin,
            usuario_sel: usuario
        });
    }
};

/**
 * Módulo Reporte de Ganancias
 */
const ReporteGanancias = {
    /**
     * Obtener datos del formulario (usuarios)
     */
    obtenerFormulario: async () => {
        return ApiClientLegacyReportes.get('reporteGanancias.php');
    },
    
    /**
     * Consultar ganancias por periodo
     * @param {string} fecha1 - Fecha inicio
     * @param {string} fecha2 - Fecha fin
     * @param {number} usuario - Código del vendedor
     */
    consultar: async (fecha1, fecha2, usuario) => {
        return ApiClientLegacyReportes.post('reporteGanancias.php', {
            fecha1: fecha1,
            fecha2: fecha2,
            usuario: usuario
        });
    }
};

/**
 * Módulo Reporte de Ingresos por Día de Semana
 */
const ReporteIngresoPorDia = {
    /**
     * Obtener datos del formulario (usuarios)
     */
    obtenerFormulario: async () => {
        return ApiClientLegacyReportes.get('reporteIngresoPorDia.php');
    },
    
    /**
     * Consultar ingresos agrupados por día de la semana
     * @param {string} fecha1 - Fecha inicio
     * @param {string} fecha2 - Fecha fin
     * @param {number} usuario - Código del empleado
     */
    consultar: async (fecha1, fecha2, usuario) => {
        return ApiClientLegacyReportes.post('reporteIngresoPorDia.php', {
            fecha1: fecha1,
            fecha2: fecha2,
            usuario: usuario
        });
    }
};

/**
 * Módulo Reporte de Promedio de Ventas
 */
const ReportePromedio = {
    /**
     * Obtener datos del formulario
     */
    obtenerFormulario: async () => {
        return ApiClientLegacyReportes.get('reportePromedio.php');
    },
    
    /**
     * Consultar promedio diario de ventas
     * @param {string} fecha1 - Fecha inicio
     * @param {string} fecha2 - Fecha fin
     */
    consultar: async (fecha1, fecha2) => {
        return ApiClientLegacyReportes.post('reportePromedio.php', {
            fecha1: fecha1,
            fecha2: fecha2
        });
    }
};

// Exportar módulos de Reportes
window.SICOM.ApiClientLegacyReportes = ApiClientLegacyReportes;
window.SICOM.MenuReportes = MenuReportes;
window.SICOM.VentasPorDia = VentasPorDia;
window.SICOM.VentasPorRango = VentasPorRango;
window.SICOM.ReporteGanancias = ReporteGanancias;
window.SICOM.ReporteIngresoPorDia = ReporteIngresoPorDia;
window.SICOM.ReportePromedio = ReportePromedio;

// ============================================================
// MÓDULO EMAILING - Catálogo de Correos
// Endpoint: /sistema/src/emailing
// ============================================================

const ApiClientLegacyEmailing = {
    getBaseUrl: () => `${APP_CONFIG.apiBaseUrl}/sistema/src/emailing`,
    
    async get(endpoint, params = {}) {
        const url = new URL(`${this.getBaseUrl()}/${endpoint}`, window.location.origin);
        params.format = 'json';
        Object.keys(params).forEach(key => {
            if (params[key] !== undefined && params[key] !== '') {
                url.searchParams.append(key, params[key]);
            }
        });
        
        const response = await fetch(url.toString(), {
            method: 'GET',
            credentials: 'include',
            headers: { 'Accept': 'application/json' }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        return response.json();
    }
};

// Módulo Emailing - Catálogo de correos
const Emailing = {
    listar: async (busqueda = '') => {
        return ApiClientLegacyEmailing.get('emailing.php', { busqueda });
    }
};

// Exportar módulos de Emailing
window.SICOM.ApiClientLegacyEmailing = ApiClientLegacyEmailing;
window.SICOM.Emailing = Emailing;

// ============================================================
// MÓDULO UPLOAD - Subida de Imágenes
// Endpoint: /upload.php
// ============================================================

const Upload = {
    /**
     * Sube una imagen al servidor
     * @param {File} archivo - Archivo de imagen a subir
     * @returns {Promise<{status: string, archivo: string, url: string}>}
     */
    subirImagen: async (archivo) => {
        const formData = new FormData();
        formData.append('imagen', archivo);
        
        const url = `${APP_CONFIG.apiBaseUrl}/upload.php?format=json`;
        
        const response = await fetch(url, {
            method: 'POST',
            credentials: 'include',
            body: formData
        });
        
        const data = await response.json();
        
        if (!response.ok || data.status === 'error') {
            throw new Error(data.mensaje || 'Error al subir imagen');
        }
        
        return data;
    },
    
    /**
     * Valida un archivo antes de subirlo (client-side)
     * @param {File} archivo - Archivo a validar
     * @returns {{valid: boolean, error?: string}}
     */
    validar: (archivo) => {
        const maxSize = 5 * 1024 * 1024; // 5MB
        const tiposPermitidos = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        
        if (!archivo) {
            return { valid: false, error: 'No se seleccionó ningún archivo' };
        }
        
        if (!tiposPermitidos.includes(archivo.type)) {
            return { valid: false, error: 'Tipo de archivo no permitido. Solo imágenes JPG, PNG, GIF, WEBP' };
        }
        
        if (archivo.size > maxSize) {
            return { valid: false, error: 'El archivo excede el tamaño máximo de 5MB' };
        }
        
        return { valid: true };
    }
};

// Exportar módulo de Upload
window.SICOM.Upload = Upload;

// Componentes de UI (Design System Minimalista)
const UI = {
    // Mostrar notificación toast
    toast: (message, type = 'info', duration = 3000) => {
        // Obtener o crear contenedor
        let container = document.getElementById('toastContainer');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toastContainer';
            container.className = 'toast-container';
            document.body.appendChild(container);
        }
        
        // Iconos por tipo
        const icons = {
            success: 'bi-check-circle-fill',
            error: 'bi-x-circle-fill',
            warning: 'bi-exclamation-triangle-fill',
            info: 'bi-info-circle-fill'
        };
        
        // Crear toast
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `
            <span class="toast-icon"><i class="bi ${icons[type] || icons.info}"></i></span>
            <span class="toast-message">${message}</span>
            <button class="toast-close" aria-label="Cerrar">
                <i class="bi bi-x"></i>
            </button>
        `;
        
        // Agregar al contenedor
        container.appendChild(toast);
        
        // Función para remover toast
        const removeToast = () => {
            toast.classList.add('toast-out');
            setTimeout(() => toast.remove(), 200);
        };
        
        // Evento de cerrar
        toast.querySelector('.toast-close').addEventListener('click', removeToast);
        
        // Auto cerrar
        if (duration > 0) {
            setTimeout(removeToast, duration);
        }
        
        return toast;
    },
    
    // Modal de confirmación mejorado
    confirm: (message, onConfirm, onCancel = () => {}, options = {}) => {
        const {
            title = 'Confirmar',
            confirmText = 'Confirmar',
            cancelText = 'Cancelar',
            confirmClass = 'btn-danger', // Botón de confirmar/eliminar en rojo por defecto
            icon = 'bi-question-circle'
        } = options;
        
        // Verificar si existe modal en el DOM (para dashboard)
        const existingModal = document.getElementById('confirmModal');
        const existingBackdrop = document.getElementById('modalBackdrop');
        
        if (existingModal && existingBackdrop) {
            // Usar modal existente
            const modalTitle = document.getElementById('modalTitle');
            const modalMessage = document.getElementById('modalMessage');
            const modalConfirm = document.getElementById('modalConfirm');
            const modalCancel = document.getElementById('modalCancel');
            const modalClose = document.getElementById('modalClose');
            
            if (modalTitle) modalTitle.textContent = title;
            if (modalMessage) modalMessage.textContent = message;
            if (modalConfirm) {
                modalConfirm.textContent = confirmText;
                modalConfirm.className = `btn ${confirmClass}`;
            }
            if (modalCancel) modalCancel.textContent = cancelText;
            
            existingBackdrop.classList.add('show');
            existingModal.classList.add('show');
            
            const closeModal = () => {
                existingBackdrop.classList.remove('show');
                existingModal.classList.remove('show');
            };
            
            modalConfirm.onclick = () => { closeModal(); onConfirm(); };
            modalCancel.onclick = () => { closeModal(); onCancel(); };
            modalClose.onclick = closeModal;
            existingBackdrop.onclick = closeModal;
            
            return;
        }
        
        // Crear modal dinámico
        const backdrop = document.createElement('div');
        backdrop.className = 'modal-backdrop show';
        backdrop.style.cssText = `
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,0.5);
            backdrop-filter: blur(4px);
            z-index: 400;
            display: flex;
            align-items: center;
            justify-content: center;
        `;
        
        const modal = document.createElement('div');
        modal.className = 'modal show';
        modal.style.cssText = `
            position: relative;
            background: white;
            border-radius: 16px;
            max-width: 400px;
            width: 90%;
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
            animation: slideUp 0.2s ease;
        `;
        
        modal.innerHTML = `
            <div style="padding: 24px; border-bottom: 1px solid #e5e7eb; display: flex; align-items: center; justify-content: space-between;">
                <h3 style="margin: 0; font-size: 18px; font-weight: 600;">${title}</h3>
                <button class="modal-close-btn" style="background: none; border: none; cursor: pointer; font-size: 20px; color: #9ca3af; padding: 4px;">
                    <i class="bi bi-x-lg"></i>
                </button>
            </div>
            <div style="padding: 24px;">
                <div style="display: flex; align-items: flex-start; gap: 16px;">
                    <div style="width: 48px; height: 48px; border-radius: 50%; background: #fee2e2; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                        <i class="bi ${icon}" style="font-size: 24px; color: #ef4444;"></i>
                    </div>
                    <p style="margin: 0; font-size: 15px; color: #374151; line-height: 1.5;">${message}</p>
                </div>
            </div>
            <div style="padding: 16px 24px; border-top: 1px solid #e5e7eb; display: flex; justify-content: flex-end; gap: 12px;">
                <button class="btn-cancel" style="padding: 10px 20px; border-radius: 8px; border: 1px solid #d1d5db; background: #f3f4f6; color: #374151; font-size: 14px; font-weight: 500; cursor: pointer;">
                    ${cancelText}
                </button>
                <button class="btn-confirm" style="padding: 10px 20px; border-radius: 8px; border: none; background: #ef4444; color: white; font-size: 14px; font-weight: 500; cursor: pointer;">
                    ${confirmText}
                </button>
            </div>
        `;
        
        backdrop.appendChild(modal);
        document.body.appendChild(backdrop);
        
        const closeModal = () => {
            backdrop.style.opacity = '0';
            setTimeout(() => backdrop.remove(), 200);
        };
        
        modal.querySelector('.btn-confirm').onclick = () => { closeModal(); onConfirm(); };
        modal.querySelector('.btn-cancel').onclick = () => { closeModal(); onCancel(); };
        modal.querySelector('.modal-close-btn').onclick = closeModal;
        backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeModal(); });
    },
    
    // Spinner de carga (usa loader del DOM si existe)
    showLoading: (message = 'Cargando...') => {
        // Buscar loader existente en el DOM
        let loader = document.getElementById('loaderOverlay');
        let loaderText = document.getElementById('loaderText');
        
        if (loader) {
            // Usar loader existente
            if (loaderText) loaderText.textContent = message;
            loader.classList.add('show');
            return;
        }
        
        // Crear loader dinámico con nuevo diseño
        loader = document.getElementById('globalLoader');
        if (!loader) {
            loader = document.createElement('div');
            loader.id = 'globalLoader';
            loader.className = 'loader-overlay show';
            loader.style.cssText = `
                position: fixed;
                inset: 0;
                background: rgba(255,255,255,0.95);
                backdrop-filter: blur(4px);
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                z-index: 500;
            `;
            loader.innerHTML = `
                <div class="spinner" style="width: 48px; height: 48px; border: 3px solid #e5e7eb; border-top-color: #4F46E5; border-radius: 50%; animation: spin 0.8s linear infinite;"></div>
                <p id="loaderMessage" style="margin-top: 16px; color: #6b7280; font-size: 14px;">${message}</p>
            `;
            
            // Agregar keyframes si no existen
            if (!document.getElementById('spinnerKeyframes')) {
                const style = document.createElement('style');
                style.id = 'spinnerKeyframes';
                style.textContent = '@keyframes spin { to { transform: rotate(360deg); } }';
                document.head.appendChild(style);
            }
            
            document.body.appendChild(loader);
        } else {
            const msgEl = loader.querySelector('#loaderMessage');
            if (msgEl) msgEl.textContent = message;
            loader.style.display = 'flex';
            loader.classList.add('show');
        }
    },
    
    hideLoading: () => {
        // Intentar ocultar loader del DOM
        const loaderOverlay = document.getElementById('loaderOverlay');
        if (loaderOverlay) {
            loaderOverlay.classList.remove('show');
        }
        
        // Ocultar loader dinámico
        const globalLoader = document.getElementById('globalLoader');
        if (globalLoader) {
            globalLoader.classList.remove('show');
            globalLoader.style.display = 'none';
        }
    },
    
    // Helper para estado de botones (loading state)
    setButtonLoading: (button, loading, loadingText = 'Procesando...') => {
        if (!button) return;
        
        if (loading) {
            button.dataset.originalText = button.innerHTML;
            button.classList.add('btn-loading');
            button.disabled = true;
            button.innerHTML = `<span class="sr-only">${loadingText}</span>`;
        } else {
            button.classList.remove('btn-loading');
            button.disabled = false;
            if (button.dataset.originalText) {
                button.innerHTML = button.dataset.originalText;
            }
        }
    },
    
    // Helper para validación de inputs
    setInputError: (input, errorMessage = '') => {
        if (!input) return;
        
        // Remover estado previo
        input.classList.remove('is-valid', 'is-invalid');
        
        // Remover mensaje de error previo
        const existingError = input.parentElement.querySelector('.form-error');
        if (existingError) existingError.remove();
        
        if (errorMessage) {
            input.classList.add('is-invalid');
            const errorEl = document.createElement('span');
            errorEl.className = 'form-error';
            errorEl.textContent = errorMessage;
            input.parentElement.appendChild(errorEl);
        }
    },
    
    setInputValid: (input) => {
        if (!input) return;
        input.classList.remove('is-invalid');
        input.classList.add('is-valid');
        
        const existingError = input.parentElement.querySelector('.form-error');
        if (existingError) existingError.remove();
    },
    
    clearInputState: (input) => {
        if (!input) return;
        input.classList.remove('is-valid', 'is-invalid');
        
        const existingError = input.parentElement.querySelector('.form-error');
        if (existingError) existingError.remove();
    }
};

// Manejador de eventos de conectividad
const NetworkStatus = {
    init: () => {
        window.addEventListener('online', () => {
            AppState.isOnline = true;
            Logger.log('Conexión restaurada');
            UI.toast('Conexión restaurada', 'success');
            document.body.classList.remove('offline');
            
            // Ocultar banner offline
            const offlineBanner = document.getElementById('offlineBanner');
            if (offlineBanner) offlineBanner.classList.remove('show');
            
            // Solicitar flush de la cola offline
            OfflineSync.requestFlush();
        });
        
        window.addEventListener('offline', () => {
            AppState.isOnline = false;
            Logger.warn('Sin conexión');
            UI.toast('Sin conexión a internet', 'warning');
            document.body.classList.add('offline');
            
            // Mostrar banner offline
            const offlineBanner = document.getElementById('offlineBanner');
            if (offlineBanner) offlineBanner.classList.add('show');
        });
    }
};

// Gestor de sincronización offline
const OfflineSync = {
    // Inicializar escucha de mensajes del Service Worker
    init: () => {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.addEventListener('message', OfflineSync.handleSWMessage);
            
            // Verificar estado inicial de la outbox
            OfflineSync.getStats();
        }
        
        // Agregar badge de sincronización al DOM
        OfflineSync.createSyncBadge();
        
        Logger.log('OfflineSync inicializado');
    },
    
    // Maneja mensajes del Service Worker
    handleSWMessage: (event) => {
        const { data } = event;
        Logger.log('Mensaje del SW:', data);
        
        switch (data.type) {
            case 'REQUEST_QUEUED':
                AppState.pendingSyncCount++;
                OfflineSync.updateSyncBadge();
                Logger.log(`Request encolada: ${data.tempId}`);
                break;
                
            case 'REQUEST_SYNCED':
                if (data.success) {
                    Logger.log(`Request sincronizada: ${data.tempId}`);
                    UI.toast('Operación sincronizada correctamente', 'success', 2000);
                } else {
                    Logger.warn(`Error sincronizando: ${data.tempId}`, data.error);
                    UI.toast(`Error sincronizando: ${data.error}`, 'error', 4000);
                }
                OfflineSync.getStats();
                break;
                
            case 'OUTBOX_FLUSHED':
                const { result } = data;
                if (result && !result.skipped) {
                    const msg = `Sincronización: ${result.success} enviados, ${result.failed} errores`;
                    Logger.log(msg);
                    if (result.success > 0) {
                        UI.toast(`${result.success} operación(es) sincronizada(s)`, 'success', 3000);
                    }
                    if (result.failed > 0) {
                        UI.toast(`${result.failed} operación(es) con error`, 'warning', 4000);
                    }
                }
                OfflineSync.getStats();
                break;
                
            case 'OUTBOX_STATS':
                AppState.pendingSyncCount = data.stats.pending;
                OfflineSync.updateSyncBadge();
                Logger.log('Outbox stats:', data.stats);
                break;
        }
    },
    
    // Solicitar flush de la outbox al SW
    requestFlush: () => {
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
            Logger.log('Solicitando flush de outbox');
            navigator.serviceWorker.controller.postMessage({
                type: 'FLUSH_OUTBOX'
            });
        }
    },
    
    // Obtener estadísticas de la outbox
    getStats: () => {
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({
                type: 'GET_OUTBOX_STATS'
            });
        }
    },
    
    // Crear badge de sincronización (visual)
    createSyncBadge: () => {
        if (document.getElementById('syncBadge')) return;
        
        const badge = document.createElement('div');
        badge.id = 'syncBadge';
        badge.style.cssText = `
            position: fixed;
            bottom: 70px;
            right: 20px;
            background: #ff9800;
            color: white;
            padding: 8px 16px;
            border-radius: 20px;
            font-size: 14px;
            font-weight: bold;
            display: none;
            z-index: 9999;
            box-shadow: 0 2px 8px rgba(0,0,0,0.2);
            cursor: pointer;
            transition: transform 0.2s;
        `;
        badge.innerHTML = `
            <span id="syncBadgeIcon">⏳</span>
            <span id="syncBadgeCount">0</span> pendiente(s)
        `;
        
        badge.addEventListener('click', () => {
            if (AppState.isOnline) {
                OfflineSync.requestFlush();
                UI.toast('Sincronizando...', 'info', 2000);
            } else {
                UI.toast('Sin conexión. Se sincronizará al reconectar.', 'warning');
            }
        });
        
        badge.addEventListener('mouseenter', () => {
            badge.style.transform = 'scale(1.05)';
        });
        badge.addEventListener('mouseleave', () => {
            badge.style.transform = 'scale(1)';
        });
        
        document.body.appendChild(badge);
    },
    
    // Actualizar badge de sincronización
    updateSyncBadge: () => {
        const badge = document.getElementById('syncBadge');
        const countEl = document.getElementById('syncBadgeCount');
        
        if (badge && countEl) {
            countEl.textContent = AppState.pendingSyncCount;
            badge.style.display = AppState.pendingSyncCount > 0 ? 'block' : 'none';
        }
    },
    
    // Verificar si una respuesta fue encolada offline
    isQueued: (response) => {
        return response && (response.queued === true || response._offlineQueued === true);
    }
};

// Inicialización de la aplicación
document.addEventListener('DOMContentLoaded', () => {
    Logger.log(`${APP_CONFIG.appName} v${APP_CONFIG.version} iniciando...`);
    
    // Inicializar monitoreo de red
    NetworkStatus.init();
    
    // Inicializar sincronización offline
    OfflineSync.init();
    
    // Verificar sesión en páginas protegidas
    const publicPages = ['index.html', 'login.html', 'offline.html', '404.html', '500.html', '502.html', '503.html', '504.html', 'error.html'];
    const currentPage = window.location.pathname.split('/').pop();
    
    if (!publicPages.includes(currentPage) && !Session.isLoggedIn()) {
        Logger.warn('Sesión requerida, redirigiendo a login');
        window.location.href = '/index.html';
        return;
    }
    
    // Añadir estilos de animación
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideUp {
            from { opacity: 0; transform: translate(-50%, 20px); }
            to { opacity: 1; transform: translate(-50%, 0); }
        }
        @keyframes slideDown {
            from { opacity: 1; transform: translate(-50%, 0); }
            to { opacity: 0; transform: translate(-50%, 20px); }
        }
        body.offline::after {
            content: 'Sin conexión';
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            background: #ffc107;
            color: #333;
            text-align: center;
            padding: 5px;
            font-size: 12px;
            z-index: 9999;
        }
    `;
    document.head.appendChild(style);
    
    Logger.log('Aplicación inicializada correctamente');
});

// Exportar para uso global
window.SICOM = {
    APP_CONFIG,
    AppState,
    Utils,
    API,
    Storage,
    Session,
    UI,
    Logger,
    OfflineSync,
    // Módulos de autenticación y ventas
    Auth,
    ApiClientLegacy,
    Productos,
    Carrito,
    Ventas
};

// ============================================
// GLOBAL ERROR HANDLING
// ============================================
const ErrorHandler = {
    // Genera referencia única para el error
    generateRef: () => {
        const timestamp = Date.now().toString(36);
        const random = Math.random().toString(36).substring(2, 8);
        return `ERR-${timestamp}-${random}`.toUpperCase();
    },
    
    // Log del error
    logError: (error, context = {}) => {
        const ref = ErrorHandler.generateRef();
        const errorData = {
            ref,
            message: error?.message || String(error),
            stack: error?.stack,
            url: window.location.href,
            timestamp: new Date().toISOString(),
            userAgent: navigator.userAgent,
            online: navigator.onLine,
            ...context
        };
        
        console.error(`[SICOM Error ${ref}]`, errorData);
        
        // Guardar en sessionStorage para referencia
        try {
            const errors = JSON.parse(sessionStorage.getItem('sicom_errors') || '[]');
            errors.push(errorData);
            // Mantener solo los últimos 10 errores
            if (errors.length > 10) errors.shift();
            sessionStorage.setItem('sicom_errors', JSON.stringify(errors));
        } catch (e) {
            // Ignorar errores de storage
        }
        
        return ref;
    },
    
    // Manejar errores críticos que requieren redirigir
    handleCriticalError: (error, context = {}) => {
        const ref = ErrorHandler.logError(error, context);
        
        // Guardar ref para la página de error
        sessionStorage.setItem('sicom_last_error_ref', ref);
        
        // Redirigir a página de error genérica
        window.location.href = `/errors/error.html?ref=${ref}`;
    },
    
    // Mostrar toast de error (no crítico)
    showErrorToast: (message, error = null) => {
        if (error) {
            ErrorHandler.logError(error, { toastMessage: message });
        }
        
        if (typeof UI !== 'undefined' && UI.toast) {
            UI.toast(message, 'error', 5000);
        } else {
            alert(message);
        }
    },
    
    // Manejar errores de API
    handleApiError: (response, context = {}) => {
        const status = response?.status || 0;
        
        // 401 Unauthorized - Sesión expirada
        if (status === 401) {
            ErrorHandler.logError(new Error('Sesión expirada'), context);
            if (typeof Session !== 'undefined') {
                Session.logout();
            } else {
                localStorage.removeItem('session');
                localStorage.removeItem('token');
                window.location.href = '/index.html';
            }
            return;
        }
        
        // 403 Forbidden
        if (status === 403) {
            ErrorHandler.showErrorToast('No tienes permiso para realizar esta acción');
            return;
        }
        
        // 404 Not Found
        if (status === 404) {
            ErrorHandler.showErrorToast('El recurso solicitado no existe');
            return;
        }
        
        // 5xx Server errors
        if (status >= 500) {
            const ref = ErrorHandler.logError(new Error(`Server Error ${status}`), context);
            ErrorHandler.showErrorToast(`Error del servidor. Ref: ${ref}`);
            return;
        }
        
        // Otros errores
        ErrorHandler.showErrorToast('Ha ocurrido un error. Por favor, intenta de nuevo.');
    }
};

// Manejador global de errores de JavaScript
window.onerror = function(message, source, lineno, colno, error) {
    const context = {
        type: 'uncaught',
        source,
        line: lineno,
        column: colno
    };
    
    // Log del error
    const ref = ErrorHandler.logError(error || new Error(message), context);
    
    // Mostrar toast si la UI está disponible
    if (typeof UI !== 'undefined' && UI.toast) {
        UI.toast(`Error inesperado. Ref: ${ref}`, 'error', 5000);
    }
    
    // No redirigir automáticamente para no interrumpir la experiencia
    // El usuario puede seguir usando la app si el error no es fatal
    
    return false; // No prevenir el log en consola
};

// Manejador de promesas rechazadas no capturadas
window.onunhandledrejection = function(event) {
    const error = event.reason;
    const context = {
        type: 'unhandledRejection'
    };
    
    const ref = ErrorHandler.logError(error, context);
    
    // Mostrar toast si la UI está disponible
    if (typeof UI !== 'undefined' && UI.toast) {
        UI.toast(`Error inesperado. Ref: ${ref}`, 'error', 5000);
    }
    
    // Prevenir el log por defecto en consola (ya lo logeamos)
    event.preventDefault();
};

// Exportar ErrorHandler
window.SICOM.ErrorHandler = ErrorHandler;