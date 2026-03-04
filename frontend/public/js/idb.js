/**
 * SICOM PWA - IndexedDB Helper
 * Maneja la cola offline (outbox) para requests pendientes
 */

const IDB_CONFIG = {
    dbName: 'sicom-db',
    dbVersion: 1,
    stores: {
        outbox: 'outbox'
    }
};

/**
 * Abre o crea la base de datos IndexedDB
 * @returns {Promise<IDBDatabase>}
 */
function openDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(IDB_CONFIG.dbName, IDB_CONFIG.dbVersion);
        
        request.onerror = () => {
            console.error('[IDB] Error abriendo base de datos:', request.error);
            reject(request.error);
        };
        
        request.onsuccess = () => {
            console.log('[IDB] Base de datos abierta correctamente');
            resolve(request.result);
        };
        
        request.onupgradeneeded = (event) => {
            console.log('[IDB] Actualizando/creando esquema de base de datos');
            const db = event.target.result;
            
            // Crear store para outbox si no existe
            if (!db.objectStoreNames.contains(IDB_CONFIG.stores.outbox)) {
                const outboxStore = db.createObjectStore(IDB_CONFIG.stores.outbox, {
                    keyPath: 'id',
                    autoIncrement: true
                });
                
                // Índices para búsquedas eficientes
                outboxStore.createIndex('status', 'status', { unique: false });
                outboxStore.createIndex('createdAt', 'createdAt', { unique: false });
                outboxStore.createIndex('url', 'url', { unique: false });
                
                console.log('[IDB] Store outbox creado');
            }
        };
    });
}

/**
 * Estructura de un item en la outbox:
 * {
 *   id: number (autogenerado),
 *   createdAt: number (timestamp),
 *   url: string,
 *   method: string,
 *   headers: object,
 *   body: string (JSON serializado),
 *   contentType: string,
 *   retries: number,
 *   maxRetries: number,
 *   status: 'pending' | 'sending' | 'sent' | 'error',
 *   lastError: string | null,
 *   tempId: string (para tracking en UI)
 * }
 */

/**
 * Agrega una request a la cola offline
 * @param {Object} requestData - Datos de la request
 * @returns {Promise<Object>} - Item agregado con id y tempId
 */
async function addToOutbox(requestData) {
    const db = await openDatabase();
    
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([IDB_CONFIG.stores.outbox], 'readwrite');
        const store = transaction.objectStore(IDB_CONFIG.stores.outbox);
        
        const tempId = generateTempId();
        const item = {
            createdAt: Date.now(),
            url: requestData.url,
            method: requestData.method || 'POST',
            headers: requestData.headers || {},
            body: requestData.body || null,
            contentType: requestData.contentType || 'application/json',
            retries: 0,
            maxRetries: requestData.maxRetries || 5,
            status: 'pending',
            lastError: null,
            tempId: tempId
        };
        
        const request = store.add(item);
        
        request.onsuccess = () => {
            console.log('[IDB] Request agregada a outbox:', request.result);
            resolve({ ...item, id: request.result });
        };
        
        request.onerror = () => {
            console.error('[IDB] Error agregando a outbox:', request.error);
            reject(request.error);
        };
        
        transaction.oncomplete = () => db.close();
    });
}

/**
 * Obtiene todos los items pendientes en la outbox
 * @param {string} status - Estado a filtrar ('pending' por defecto)
 * @returns {Promise<Array>}
 */
async function getOutboxItems(status = 'pending') {
    const db = await openDatabase();
    
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([IDB_CONFIG.stores.outbox], 'readonly');
        const store = transaction.objectStore(IDB_CONFIG.stores.outbox);
        const index = store.index('status');
        const request = index.getAll(status);
        
        request.onsuccess = () => {
            // Ordenar por createdAt
            const items = request.result.sort((a, b) => a.createdAt - b.createdAt);
            console.log(`[IDB] ${items.length} items con status '${status}' en outbox`);
            resolve(items);
        };
        
        request.onerror = () => {
            console.error('[IDB] Error obteniendo items:', request.error);
            reject(request.error);
        };
        
        transaction.oncomplete = () => db.close();
    });
}

/**
 * Obtiene todos los items de la outbox (cualquier status)
 * @returns {Promise<Array>}
 */
async function getAllOutboxItems() {
    const db = await openDatabase();
    
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([IDB_CONFIG.stores.outbox], 'readonly');
        const store = transaction.objectStore(IDB_CONFIG.stores.outbox);
        const request = store.getAll();
        
        request.onsuccess = () => {
            const items = request.result.sort((a, b) => a.createdAt - b.createdAt);
            resolve(items);
        };
        
        request.onerror = () => reject(request.error);
        transaction.oncomplete = () => db.close();
    });
}

/**
 * Actualiza un item en la outbox
 * @param {number} id - ID del item
 * @param {Object} updates - Campos a actualizar
 * @returns {Promise<Object>}
 */
async function updateOutboxItem(id, updates) {
    const db = await openDatabase();
    
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([IDB_CONFIG.stores.outbox], 'readwrite');
        const store = transaction.objectStore(IDB_CONFIG.stores.outbox);
        
        // Primero obtener el item existente
        const getRequest = store.get(id);
        
        getRequest.onsuccess = () => {
            const item = getRequest.result;
            if (!item) {
                reject(new Error(`Item ${id} no encontrado`));
                return;
            }
            
            // Actualizar campos
            const updatedItem = { ...item, ...updates };
            const putRequest = store.put(updatedItem);
            
            putRequest.onsuccess = () => {
                console.log('[IDB] Item actualizado:', id, updates);
                resolve(updatedItem);
            };
            
            putRequest.onerror = () => reject(putRequest.error);
        };
        
        getRequest.onerror = () => reject(getRequest.error);
        transaction.oncomplete = () => db.close();
    });
}

/**
 * Elimina un item de la outbox
 * @param {number} id - ID del item a eliminar
 * @returns {Promise<void>}
 */
async function removeFromOutbox(id) {
    const db = await openDatabase();
    
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([IDB_CONFIG.stores.outbox], 'readwrite');
        const store = transaction.objectStore(IDB_CONFIG.stores.outbox);
        const request = store.delete(id);
        
        request.onsuccess = () => {
            console.log('[IDB] Item eliminado de outbox:', id);
            resolve();
        };
        
        request.onerror = () => {
            console.error('[IDB] Error eliminando item:', request.error);
            reject(request.error);
        };
        
        transaction.oncomplete = () => db.close();
    });
}

/**
 * Cuenta items por status
 * @returns {Promise<Object>} - Conteo por status
 */
async function getOutboxStats() {
    const db = await openDatabase();
    
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([IDB_CONFIG.stores.outbox], 'readonly');
        const store = transaction.objectStore(IDB_CONFIG.stores.outbox);
        const request = store.getAll();
        
        request.onsuccess = () => {
            const stats = {
                pending: 0,
                sending: 0,
                sent: 0,
                error: 0,
                total: request.result.length
            };
            
            request.result.forEach(item => {
                if (stats.hasOwnProperty(item.status)) {
                    stats[item.status]++;
                }
            });
            
            resolve(stats);
        };
        
        request.onerror = () => reject(request.error);
        transaction.oncomplete = () => db.close();
    });
}

/**
 * Limpia items enviados o con error antiguo
 * @param {number} maxAge - Edad máxima en ms (por defecto 24h)
 * @returns {Promise<number>} - Número de items eliminados
 */
async function cleanupOutbox(maxAge = 24 * 60 * 60 * 1000) {
    const db = await openDatabase();
    
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([IDB_CONFIG.stores.outbox], 'readwrite');
        const store = transaction.objectStore(IDB_CONFIG.stores.outbox);
        const request = store.getAll();
        
        request.onsuccess = () => {
            const now = Date.now();
            let deleted = 0;
            
            request.result.forEach(item => {
                const age = now - item.createdAt;
                // Eliminar items enviados o errores viejos
                if (item.status === 'sent' || (item.status === 'error' && age > maxAge)) {
                    store.delete(item.id);
                    deleted++;
                }
            });
            
            console.log(`[IDB] Cleanup: ${deleted} items eliminados`);
            resolve(deleted);
        };
        
        request.onerror = () => reject(request.error);
        transaction.oncomplete = () => db.close();
    });
}

/**
 * Genera un ID temporal único para tracking
 * @returns {string}
 */
function generateTempId() {
    return 'temp_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 9);
}

/**
 * Serializa el body de una request para almacenamiento
 * Soporta JSON y FormData (solo texto, no archivos)
 * @param {Request} request - Request original
 * @returns {Promise<{body: string, contentType: string, hasFiles: boolean}>}
 */
async function serializeRequestBody(request) {
    const contentType = request.headers.get('Content-Type') || '';
    
    // JSON
    if (contentType.includes('application/json')) {
        try {
            const text = await request.text();
            return {
                body: text,
                contentType: 'application/json',
                hasFiles: false
            };
        } catch (e) {
            return { body: null, contentType: 'application/json', hasFiles: false };
        }
    }
    
    // FormData
    if (contentType.includes('multipart/form-data') || contentType.includes('application/x-www-form-urlencoded')) {
        try {
            const formData = await request.formData();
            const data = {};
            let hasFiles = false;
            
            for (const [key, value] of formData.entries()) {
                if (value instanceof File) {
                    hasFiles = true;
                    // No podemos almacenar archivos de forma sencilla
                    // Guardamos solo metadata
                    data[key] = {
                        _isFile: true,
                        name: value.name,
                        type: value.type,
                        size: value.size
                    };
                } else {
                    data[key] = value;
                }
            }
            
            return {
                body: JSON.stringify(data),
                contentType: 'application/x-www-form-urlencoded',
                hasFiles: hasFiles,
                originalContentType: contentType
            };
        } catch (e) {
            console.error('[IDB] Error serializando FormData:', e);
            return { body: null, contentType: contentType, hasFiles: false };
        }
    }
    
    // Texto plano u otro
    try {
        const text = await request.text();
        return {
            body: text,
            contentType: contentType || 'text/plain',
            hasFiles: false
        };
    } catch (e) {
        return { body: null, contentType: 'text/plain', hasFiles: false };
    }
}

/**
 * Extrae headers relevantes de una request
 * @param {Request} request - Request original
 * @returns {Object}
 */
function extractRelevantHeaders(request) {
    const headers = {};
    const relevantHeaders = ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With'];
    
    relevantHeaders.forEach(name => {
        const value = request.headers.get(name);
        if (value) {
            headers[name] = value;
        }
    });
    
    return headers;
}

// Exportar para uso en Service Worker y app
if (typeof self !== 'undefined' && self.constructor.name === 'ServiceWorkerGlobalScope') {
    // Estamos en el Service Worker
    self.IDB = {
        openDatabase,
        addToOutbox,
        getOutboxItems,
        getAllOutboxItems,
        updateOutboxItem,
        removeFromOutbox,
        getOutboxStats,
        cleanupOutbox,
        generateTempId,
        serializeRequestBody,
        extractRelevantHeaders
    };
} else if (typeof window !== 'undefined') {
    // Estamos en el navegador
    window.IDB = {
        openDatabase,
        addToOutbox,
        getOutboxItems,
        getAllOutboxItems,
        updateOutboxItem,
        removeFromOutbox,
        getOutboxStats,
        cleanupOutbox,
        generateTempId,
        serializeRequestBody,
        extractRelevantHeaders
    };
}
