/**
 * SICOM PWA - Service Worker
 * Maneja el caché de recursos estáticos y la funcionalidad offline
 * Incluye cola offline (outbox) para requests POST
 */

// Importar helper de IndexedDB
importScripts('/js/idb.js');

// VERSIÓN 6 - Fuerza limpieza de cache viejo (resuelve 404 login.js fantasma)
const CACHE_NAME = 'sicom-pwa-v6';
const STATIC_CACHE = 'sicom-static-v6';
const DYNAMIC_CACHE = 'sicom-dynamic-v6';
const API_CACHE = 'sicom-api-v6';

// Configuración de sincronización offline
const SYNC_CONFIG = {
    syncTag: 'sync-outbox',
    maxRetries: 5,
    retryDelay: 1000 // ms entre reintentos
};

// Flag para evitar flush concurrente
let isFlushingOutbox = false;

// Helper para obtener página de error según código
async function getErrorPage(statusCode) {
    const errorPages = {
        500: '/errors/500.html',
        502: '/errors/502.html',
        503: '/errors/503.html',
        504: '/errors/504.html'
    };
    
    const pagePath = errorPages[statusCode] || '/errors/error.html';
    return caches.match(pagePath);
}

// Recursos estáticos para cachear durante la instalación
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/offline.html',
    '/manifest.json',
    
    // CSS
    '/css/theme.css',
    '/css/estilos.css',
    '/css/cssGeneral.css',
    '/css/cssMenu.css',
    '/css/select2.css',
    '/css/select2-bootstrap.css',
    '/css/vendor/bootstrap/bootstrap.min.css',
    '/css/vendor/datatables/dataTables.bootstrap.css',
    '/css/vendor/datatables/jquery.dataTables.min.css',
    '/css/vendor/select2/select2.css',
    
    // JavaScript
    '/js/app.js',
    '/js/idb.js',
    '/js/vendor/jquery/jquery.min.js',
    '/js/vendor/bootstrap/bootstrap.bundle.min.js',
    '/js/vendor/datatables/jquery.dataTables.min.js',
    '/js/vendor/datatables/dataTables.bootstrap.min.js',
    '/js/vendor/select2/select2.js',
    
    // Error Pages
    '/errors/errors.css',
    '/errors/errors.js',
    '/errors/404.html',
    '/errors/500.html',
    '/errors/502.html',
    '/errors/503.html',
    '/errors/504.html',
    '/errors/error.html',
    
    // Icons
    '/img/icons/logo.jpg'
];

// Instalación del Service Worker
self.addEventListener('install', event => {
    console.log('[SW] Instalando Service Worker...');
    
    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then(cache => {
                console.log('[SW] Cacheando recursos estáticos...');
                // Cachear recursos uno por uno para manejar errores individualmente
                return Promise.allSettled(
                    STATIC_ASSETS.map(url => 
                        cache.add(url).catch(err => {
                            console.warn(`[SW] Error cacheando ${url}:`, err);
                        })
                    )
                );
            })
            .then(() => {
                console.log('[SW] Instalación completada');
                return self.skipWaiting();
            })
            .catch(error => {
                console.error('[SW] Error durante instalación:', error);
            })
    );
});

// Activación del Service Worker
self.addEventListener('activate', event => {
    console.log('[SW] Activando Service Worker...');
    
    event.waitUntil(
        caches.keys()
            .then(cacheNames => {
                return Promise.all(
                    cacheNames
                        .filter(name => {
                            // Eliminar cachés antiguos
                            return name.startsWith('sicom-') && 
                                   name !== STATIC_CACHE && 
                                   name !== DYNAMIC_CACHE &&
                                   name !== API_CACHE;
                        })
                        .map(name => {
                            console.log('[SW] Eliminando caché antiguo:', name);
                            return caches.delete(name);
                        })
                );
            })
            .then(() => {
                console.log('[SW] Activación completada');
                return self.clients.claim();
            })
    );
});

// Estrategias de caché
const cacheStrategies = {
    // Cache First - Para recursos estáticos
    cacheFirst: async (request) => {
        const cached = await caches.match(request);
        if (cached) {
            return cached;
        }
        
        try {
            const response = await fetch(request);
            if (response.ok) {
                const cache = await caches.open(DYNAMIC_CACHE);
                cache.put(request, response.clone());
            }
            return response;
        } catch (error) {
            return caches.match('/offline.html');
        }
    },
    
    // Network First - Para datos de la API
    networkFirst: async (request) => {
        try {
            const response = await fetch(request);
            if (response.ok) {
                const cache = await caches.open(API_CACHE);
                cache.put(request, response.clone());
            }
            return response;
        } catch (error) {
            const cached = await caches.match(request);
            if (cached) {
                return cached;
            }
            // Retornar respuesta de error para API
            return new Response(
                JSON.stringify({ 
                    success: false, 
                    error: 'Sin conexión', 
                    offline: true,
                    message: 'No hay conexión a internet'
                }),
                { 
                    headers: { 'Content-Type': 'application/json' },
                    status: 503
                }
            );
        }
    },
    
    // Navigate - Para peticiones de navegación (páginas HTML)
    navigate: async (request) => {
        try {
            const response = await fetch(request);
            
            // Si es 404, servir página de error 404
            if (response.status === 404) {
                const error404 = await caches.match('/errors/404.html');
                return error404 || response;
            }
            
            // Si es error de servidor (5xx), servir página correspondiente
            if (response.status >= 500) {
                const errorPage = await getErrorPage(response.status);
                return errorPage || response;
            }
            
            // Cachear respuesta exitosa
            if (response.ok) {
                const cache = await caches.open(DYNAMIC_CACHE);
                cache.put(request, response.clone());
            }
            
            return response;
        } catch (error) {
            // Sin conexión - intentar cache primero
            const cached = await caches.match(request);
            if (cached) {
                return cached;
            }
            
            // Si no hay cache, mostrar página offline
            return caches.match('/offline.html');
        }
    },
    
    // Stale While Revalidate - Para contenido que puede estar desactualizado
    staleWhileRevalidate: async (request) => {
        const cached = await caches.match(request);
        
        const fetchPromise = fetch(request).then(async response => {
            if (response.ok) {
                const responseClone = response.clone();
                const cache = await caches.open(DYNAMIC_CACHE);
                cache.put(request, responseClone);
            }
            return response;
        }).catch(() => cached);
        
        return cached || fetchPromise;
    }
};

// Interceptar solicitudes
self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);
    
    // Ignorar solicitudes de extensiones de Chrome
    if (url.protocol === 'chrome-extension:') {
        return;
    }
    
    // Manejar requests POST (para cola offline)
    if (request.method === 'POST') {
        event.respondWith(handlePostRequest(request));
        return;
    }
    
    // Ignorar solicitudes que no sean GET
    if (request.method !== 'GET') {
        return;
    }
    
    // Determinar estrategia según el tipo de recurso
    let strategy;
    
    // Peticiones de navegación (páginas) - usar estrategia navigate
    if (request.mode === 'navigate') {
        strategy = cacheStrategies.navigate;
    } else if (url.pathname.endsWith('.php') || url.hostname === 'ventas.betto.com.mx') {
        // API calls - Network First
        strategy = cacheStrategies.networkFirst;
    } else if (
        url.pathname.endsWith('.html') ||
        url.pathname.endsWith('.css') ||
        url.pathname.endsWith('.js') ||
        url.pathname.includes('/img/') ||
        url.pathname.includes('/fonts/') ||
        url.pathname.includes('/errors/')
    ) {
        // Recursos estáticos y páginas de error - Cache First
        strategy = cacheStrategies.cacheFirst;
    } else {
        // Otros recursos - Stale While Revalidate
        strategy = cacheStrategies.staleWhileRevalidate;
    }
    
    event.respondWith(strategy(request));
});

// Manejar mensajes del cliente
self.addEventListener('message', event => {
    console.log('[SW] Mensaje recibido:', event.data);
    
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
    
    if (event.data && event.data.type === 'CLEAR_CACHE') {
        event.waitUntil(
            caches.keys().then(names => 
                Promise.all(names.map(name => caches.delete(name)))
            )
        );
    }
    
    // Flush manual de outbox (fallback cuando Background Sync no está disponible)
    if (event.data && event.data.type === 'FLUSH_OUTBOX') {
        console.log('[SW] Flush manual de outbox solicitado');
        event.waitUntil(
            flushOutbox().then(result => {
                // Notificar al cliente del resultado
                notifyClients({
                    type: 'OUTBOX_FLUSHED',
                    result: result
                });
            })
        );
    }
    
    // Obtener estadísticas de la outbox
    if (event.data && event.data.type === 'GET_OUTBOX_STATS') {
        event.waitUntil(
            self.IDB.getOutboxStats().then(stats => {
                notifyClients({
                    type: 'OUTBOX_STATS',
                    stats: stats
                });
            })
        );
    }
});

// Sincronización en segundo plano (Background Sync)
self.addEventListener('sync', event => {
    console.log('[SW] Evento de sincronización:', event.tag);
    
    if (event.tag === SYNC_CONFIG.syncTag) {
        event.waitUntil(
            flushOutbox().then(result => {
                console.log('[SW] Sync completado:', result);
                notifyClients({
                    type: 'OUTBOX_FLUSHED',
                    result: result
                });
            }).catch(error => {
                console.error('[SW] Error en sync:', error);
            })
        );
    }
});

/**
 * Maneja requests POST - intenta enviar, si falla guarda en outbox
 * @param {Request} request - Request original
 * @returns {Promise<Response>}
 */
async function handlePostRequest(request) {
    const url = request.url;
    console.log('[SW] Interceptando POST:', url);
    
    // Clonar request para poder leer el body múltiples veces
    const requestClone = request.clone();
    
    // Si estamos offline, encolar directamente
    if (!navigator.onLine) {
        console.log('[SW] Offline detectado, encolando request');
        return enqueueRequest(requestClone);
    }
    
    // Intentar enviar la request
    try {
        const response = await fetch(request);
        
        // Si la respuesta es exitosa, retornarla
        if (response.ok) {
            return response;
        }
        
        // Si es error de servidor (5xx), encolar para reintentar
        if (response.status >= 500) {
            console.log('[SW] Error de servidor, encolando para reintento');
            return enqueueRequest(requestClone, `Server error: ${response.status}`);
        }
        
        // Errores 4xx son errores de validación, retornar como están
        return response;
        
    } catch (error) {
        // Error de red (Failed to fetch), encolar
        console.log('[SW] Error de red, encolando request:', error.message);
        return enqueueRequest(requestClone, error.message);
    }
}

/**
 * Encola una request para envío posterior
 * @param {Request} request - Request a encolar
 * @param {string} errorMessage - Mensaje de error si aplica
 * @returns {Promise<Response>}
 */
async function enqueueRequest(request, errorMessage = null) {
    try {
        // Serializar la request
        const serialized = await self.IDB.serializeRequestBody(request);
        
        // Verificar si tiene archivos (no soportado)
        if (serialized.hasFiles) {
            console.warn('[SW] Request con archivos no soportada para cola offline');
            return new Response(
                JSON.stringify({
                    success: false,
                    queued: false,
                    error: 'Archivos no soportados en modo offline. Por favor, intenta cuando tengas conexión.',
                    offline: true
                }),
                {
                    headers: { 'Content-Type': 'application/json' },
                    status: 400
                }
            );
        }
        
        // Extraer headers relevantes
        const headers = self.IDB.extractRelevantHeaders(request);
        
        // Agregar a la outbox
        const queuedItem = await self.IDB.addToOutbox({
            url: request.url,
            method: request.method,
            headers: headers,
            body: serialized.body,
            contentType: serialized.contentType,
            maxRetries: SYNC_CONFIG.maxRetries
        });
        
        console.log('[SW] Request encolada con tempId:', queuedItem.tempId);
        
        // Registrar sync si está disponible
        if ('sync' in self.registration) {
            try {
                await self.registration.sync.register(SYNC_CONFIG.syncTag);
                console.log('[SW] Background Sync registrado');
            } catch (syncError) {
                console.warn('[SW] No se pudo registrar Background Sync:', syncError);
            }
        }
        
        // Notificar al cliente
        notifyClients({
            type: 'REQUEST_QUEUED',
            tempId: queuedItem.tempId,
            url: request.url
        });
        
        // Retornar respuesta de éxito con indicador de encolado
        return new Response(
            JSON.stringify({
                success: true,
                queued: true,
                message: 'Guardado offline. Se enviará al reconectar.',
                tempId: queuedItem.tempId,
                offline: true
            }),
            {
                headers: { 'Content-Type': 'application/json' },
                status: 202 // Accepted
            }
        );
        
    } catch (error) {
        console.error('[SW] Error encolando request:', error);
        return new Response(
            JSON.stringify({
                success: false,
                queued: false,
                error: 'Error guardando operación offline: ' + error.message,
                offline: true
            }),
            {
                headers: { 'Content-Type': 'application/json' },
                status: 500
            }
        );
    }
}

/**
 * Procesa la cola de requests pendientes
 * @returns {Promise<Object>} - Resultado del flush
 */
async function flushOutbox() {
    // Evitar concurrencia
    if (isFlushingOutbox) {
        console.log('[SW] Flush ya en progreso, ignorando');
        return { skipped: true, reason: 'already_flushing' };
    }
    
    isFlushingOutbox = true;
    console.log('[SW] Iniciando flush de outbox');
    
    const result = {
        processed: 0,
        success: 0,
        failed: 0,
        skipped: 0,
        errors: []
    };
    
    try {
        // Obtener items pendientes
        const pendingItems = await self.IDB.getOutboxItems('pending');
        
        if (pendingItems.length === 0) {
            console.log('[SW] No hay items pendientes en outbox');
            isFlushingOutbox = false;
            return result;
        }
        
        console.log(`[SW] Procesando ${pendingItems.length} items pendientes`);
        
        // Procesar cada item secuencialmente
        for (const item of pendingItems) {
            result.processed++;
            
            // Marcar como enviando
            await self.IDB.updateOutboxItem(item.id, { status: 'sending' });
            
            try {
                // Preparar headers
                const headers = { ...item.headers };
                if (item.contentType) {
                    headers['Content-Type'] = item.contentType;
                }
                
                // Hacer la request
                const response = await fetch(item.url, {
                    method: item.method,
                    headers: headers,
                    body: item.body
                });
                
                if (response.ok) {
                    // Éxito - eliminar de la cola
                    console.log(`[SW] Item ${item.id} enviado exitosamente`);
                    await self.IDB.removeFromOutbox(item.id);
                    result.success++;
                    
                    // Notificar éxito
                    notifyClients({
                        type: 'REQUEST_SYNCED',
                        tempId: item.tempId,
                        url: item.url,
                        success: true
                    });
                    
                } else if (response.status >= 400 && response.status < 500) {
                    // Error de validación (4xx) - no reintentar
                    const errorText = await response.text();
                    console.warn(`[SW] Item ${item.id} rechazado (${response.status}):`, errorText);
                    
                    await self.IDB.updateOutboxItem(item.id, {
                        status: 'error',
                        lastError: `HTTP ${response.status}: ${errorText.substring(0, 200)}`
                    });
                    
                    result.failed++;
                    result.errors.push({
                        id: item.id,
                        tempId: item.tempId,
                        error: `Validación fallida: ${response.status}`
                    });
                    
                    notifyClients({
                        type: 'REQUEST_SYNCED',
                        tempId: item.tempId,
                        url: item.url,
                        success: false,
                        error: `Error de validación: ${response.status}`
                    });
                    
                } else {
                    // Error de servidor (5xx) - reintentar
                    throw new Error(`Server error: ${response.status}`);
                }
                
            } catch (fetchError) {
                // Error de red o servidor
                console.error(`[SW] Error procesando item ${item.id}:`, fetchError);
                
                const newRetries = item.retries + 1;
                
                if (newRetries >= item.maxRetries) {
                    // Máximo de reintentos alcanzado
                    await self.IDB.updateOutboxItem(item.id, {
                        status: 'error',
                        retries: newRetries,
                        lastError: `Max retries (${item.maxRetries}) alcanzado: ${fetchError.message}`
                    });
                    
                    result.failed++;
                    result.errors.push({
                        id: item.id,
                        tempId: item.tempId,
                        error: 'Máximo de reintentos alcanzado'
                    });
                    
                    notifyClients({
                        type: 'REQUEST_SYNCED',
                        tempId: item.tempId,
                        url: item.url,
                        success: false,
                        error: 'Máximo de reintentos alcanzado'
                    });
                    
                } else {
                    // Volver a pending para siguiente intento
                    await self.IDB.updateOutboxItem(item.id, {
                        status: 'pending',
                        retries: newRetries,
                        lastError: fetchError.message
                    });
                    
                    result.skipped++;
                }
            }
            
            // Pequeña pausa entre requests
            await new Promise(r => setTimeout(r, SYNC_CONFIG.retryDelay));
        }
        
        console.log('[SW] Flush completado:', result);
        
        // Limpiar items enviados antiguos
        await self.IDB.cleanupOutbox();
        
        return result;
        
    } catch (error) {
        console.error('[SW] Error en flush:', error);
        result.errors.push({ error: error.message });
        return result;
    } finally {
        isFlushingOutbox = false;
    }
}

/**
 * Notifica a todos los clientes conectados
 * @param {Object} message - Mensaje a enviar
 */
async function notifyClients(message) {
    const clients = await self.clients.matchAll({ type: 'window' });
    
    clients.forEach(client => {
        client.postMessage(message);
    });
}

// Función para sincronizar ventas pendientes (legacy - mantener compatibilidad)
async function syncPendingVentas() {
    try {
        // Obtener datos pendientes del IndexedDB o localStorage
        const pendingData = await getPendingData('ventas');
        
        if (pendingData && pendingData.length > 0) {
            for (const venta of pendingData) {
                await fetch('https://ventas.betto.com.mx/ventas/crear.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(venta)
                });
            }
            // Limpiar datos sincronizados
            await clearPendingData('ventas');
        }
    } catch (error) {
        console.error('[SW] Error sincronizando ventas:', error);
    }
}

// Funciones de ayuda para datos pendientes (placeholder)
async function getPendingData(type) {
    // Implementar con IndexedDB si es necesario
    return [];
}

async function clearPendingData(type) {
    // Implementar con IndexedDB si es necesario
}

// Notificaciones push
self.addEventListener('push', event => {
    const data = event.data ? event.data.json() : {};
    
    const options = {
        body: data.body || 'Nueva notificación de SICOM',
        icon: '/img/icons/logo.jpg',
        badge: '/img/icons/icon-72x72.png',
        vibrate: [100, 50, 100],
        data: {
            url: data.url || '/'
        },
        actions: [
            { action: 'open', title: 'Abrir' },
            { action: 'close', title: 'Cerrar' }
        ]
    };
    
    event.waitUntil(
        self.registration.showNotification(data.title || 'SICOM', options)
    );
});

// Click en notificación
self.addEventListener('notificationclick', event => {
    event.notification.close();
    
    if (event.action === 'open' || !event.action) {
        const urlToOpen = event.notification.data.url || '/';
        
        event.waitUntil(
            clients.matchAll({ type: 'window', includeUncontrolled: true })
                .then(clientList => {
                    // Buscar ventana existente
                    for (const client of clientList) {
                        if (client.url === urlToOpen && 'focus' in client) {
                            return client.focus();
                        }
                    }
                    // Abrir nueva ventana
                    if (clients.openWindow) {
                        return clients.openWindow(urlToOpen);
                    }
                })
        );
    }
});

console.log('[SW] Service Worker cargado');