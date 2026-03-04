# Configuración de Páginas de Error - SICOM

## Archivos creados

```
frontend/public/errors/
├── errors.css       # Estilos compartidos
├── errors.js        # JavaScript compartido
├── 404.html         # Página no encontrada
├── 500.html         # Error interno del servidor
├── 502.html         # Bad Gateway
├── 503.html         # Servicio no disponible
├── 504.html         # Gateway Timeout
└── error.html       # Error genérico
```

## Personalización White Label

### En `errors.css` (variables CSS):

```css
:root {
    /* ========== BRAND CONFIGURATION ========== */
    --error-primary: #4F46E5;        /* Color principal */
    --error-primary-hover: #4338CA;
    --error-danger: #EF4444;         /* Color de peligro */
    --error-danger-hover: #DC2626;
    --error-warning: #F59E0B;        /* Color de advertencia */
    --error-success: #10B981;        /* Color de éxito */
    
    /* Cambiar estos para tu marca */
}
```

### En `errors.js` (configuración):

```javascript
const CONFIG = {
    productName: 'SICOM',                           // Nombre del producto
    logoPath: '../img/icons/logo.jpg',      // Ruta al logo (null para texto)
    homeUrl: '/',                                    // URL de inicio
    supportEmail: 'soporte@sicom.com',              // Email de soporte
    retryDelay: 3000,                               // Delay antes de re-intentar
    maxRetries: 3                                    // Máximo de reintentos
};
```

---

## Configuración del Servidor

### Apache (.htaccess)

Coloca este archivo en la raíz del sitio o en `frontend/public/`:

```apache
# Páginas de error personalizadas
ErrorDocument 400 /errors/error.html
ErrorDocument 401 /errors/error.html
ErrorDocument 403 /errors/error.html
ErrorDocument 404 /errors/404.html
ErrorDocument 500 /errors/500.html
ErrorDocument 502 /errors/502.html
ErrorDocument 503 /errors/503.html
ErrorDocument 504 /errors/504.html

# Opcional: pasar código de referencia
# ErrorDocument 500 /errors/500.html?ref=%{UNIQUE_ID}e
```

### Nginx

Agrega esto a tu configuración de servidor (normalmente en `/etc/nginx/sites-available/sicom`):

```nginx
server {
    # ... tu configuración existente ...

    # Páginas de error personalizadas
    error_page 400 401 403 /errors/error.html;
    error_page 404 /errors/404.html;
    error_page 500 /errors/500.html;
    error_page 502 /errors/502.html;
    error_page 503 /errors/503.html;
    error_page 504 /errors/504.html;

    # Permitir acceso a las páginas de error
    location /errors/ {
        internal;  # Solo accesible como error_page, no directamente
        # O quitar 'internal' si quieres acceso directo para pruebas
    }

    # Para APIs: devolver JSON en lugar de HTML
    location /api/ {
        # Tu configuración de API...
        
        # Errores en JSON para API
        error_page 500 502 503 504 =500 @api_error;
    }

    location @api_error {
        default_type application/json;
        return 500 '{"error": true, "message": "Error interno del servidor"}';
    }
}
```

### IIS (web.config)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<configuration>
    <system.webServer>
        <httpErrors errorMode="Custom" existingResponse="Replace">
            <remove statusCode="404"/>
            <remove statusCode="500"/>
            <remove statusCode="502"/>
            <remove statusCode="503"/>
            <remove statusCode="504"/>
            <error statusCode="404" path="/errors/404.html" responseMode="ExecuteURL"/>
            <error statusCode="500" path="/errors/500.html" responseMode="ExecuteURL"/>
            <error statusCode="502" path="/errors/502.html" responseMode="ExecuteURL"/>
            <error statusCode="503" path="/errors/503.html" responseMode="ExecuteURL"/>
            <error statusCode="504" path="/errors/504.html" responseMode="ExecuteURL"/>
        </httpErrors>
    </system.webServer>
</configuration>
```

---

## Integración con PHP Backend

Si quieres manejar errores desde PHP:

```php
<?php
// En tu archivo de manejo de errores o config.php

function showErrorPage($code, $message = null) {
    $errorPages = [
        404 => '/errors/404.html',
        500 => '/errors/500.html',
        502 => '/errors/502.html',
        503 => '/errors/503.html',
        504 => '/errors/504.html'
    ];
    
    http_response_code($code);
    
    // Si es una petición AJAX/API, devolver JSON
    if (isApiRequest()) {
        header('Content-Type: application/json');
        echo json_encode([
            'error' => true,
            'code' => $code,
            'message' => $message ?? 'Error del servidor'
        ]);
        exit;
    }
    
    // Para peticiones web, mostrar página HTML
    $errorFile = $errorPages[$code] ?? '/errors/error.html';
    $ref = uniqid('ERR-');
    
    // Redirigir a la página de error con referencia
    header("Location: {$errorFile}?ref={$ref}");
    exit;
}

function isApiRequest() {
    return (
        strpos($_SERVER['REQUEST_URI'], '/api/') !== false ||
        strpos($_SERVER['HTTP_ACCEPT'] ?? '', 'application/json') !== false ||
        !empty($_SERVER['HTTP_X_REQUESTED_WITH'])
    );
}

// Uso:
// showErrorPage(404); 
// showErrorPage(500, 'Database connection failed');
```

---

## Checklist de Pruebas

### 1. Probar Error 404
```bash
# Navega a una URL que no existe
http://localhost:3000/pagina-que-no-existe

# O desde terminal
curl -I http://localhost:3000/pagina-que-no-existe
```

### 2. Probar Errores 502/503/504 (Simular)

**Opción A: Con PHP**
```php
<?php
// Crear archivo test_error.php
$code = $_GET['code'] ?? 500;
http_response_code($code);
header("Location: /errors/{$code}.html");
exit;
```

**Opción B: Con Python (servidor de prueba)**
```python
# test_errors.py
from http.server import HTTPServer, SimpleHTTPRequestHandler

class TestHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if '/test-500' in self.path:
            self.send_error(500, 'Test Error')
        elif '/test-502' in self.path:
            self.send_error(502, 'Bad Gateway Test')
        elif '/test-503' in self.path:
            self.send_error(503, 'Service Unavailable Test')
        elif '/test-504' in self.path:
            self.send_error(504, 'Gateway Timeout Test')
        else:
            super().do_GET()

HTTPServer(('', 8080), TestHandler).serve_forever()
```

### 3. Probar Modo Offline

1. Abre la página de error en el navegador
2. Abre DevTools (F12) → Network → Offline checkbox
3. Verifica que aparece el banner "Estás sin conexión"
4. Desactiva Offline y verifica que recarga automáticamente

### 4. Probar Código de Referencia

```
http://localhost:3000/errors/500.html?ref=ERR-12345
```
Debe mostrar: "Código de referencia: ERR-12345"

### 5. Probar Botón Reintentar

1. Ve a cualquier página de error con botón "Reintentar"
2. Click en "Reintentar"
3. Si hay conexión, debe redirigir al inicio
4. Si no hay conexión, debe mostrar toast de error

---

## Notas de Accesibilidad

✅ **Implementado:**
- Contraste de colores WCAG AA
- Navegación por teclado (botones focusables)
- Textos legibles (mínimo 14px)
- Responsive (mobile-first)
- Estados hover/focus visibles
- ARIA implícito en estructura semántica

**Recomendaciones adicionales:**
- Agregar `role="alert"` al contenedor de estado si se actualiza dinámicamente
- Agregar `aria-live="polite"` para toasts
---

## Integración en SICOM

### Archivos Creados/Modificados

```
frontend/public/
├── .htaccess                 # Configuración Apache con ErrorDocument
├── sw.js                     # Service Worker v4 con fallback de errores
└── js/app.js                 # ErrorHandler global para JS

backend/
├── .htaccess                 # Protección y configuración para API
└── bootstrap.php             # Manejador global de errores PHP (JSON)
```

### Service Worker (sw.js)

El SW ahora maneja errores de navegación automáticamente:

1. **404**: Sirve `/errors/404.html` desde cache
2. **5xx**: Sirve la página de error correspondiente
3. **Offline**: Sirve `/offline.html`

### Error Handling JavaScript (app.js)

Nuevos handlers globales:

```javascript
// Captura errores no manejados
window.onerror → Loggea y muestra toast

// Captura promesas rechazadas
window.onunhandledrejection → Loggea y muestra toast

// API para uso manual
SICOM.ErrorHandler.handleCriticalError(error)  // Redirige a error.html
SICOM.ErrorHandler.showErrorToast(message)     // Solo muestra toast
SICOM.ErrorHandler.handleApiError(response)    // Maneja 401/403/404/5xx
```

### Backend Bootstrap (bootstrap.php)

Para usarlo en endpoints existentes:

```php
<?php
// Al inicio de cada endpoint API
require_once __DIR__ . '/../../bootstrap.php';

// ... resto del código
```

El bootstrap asegura:
- Errores PHP se convierten en respuestas JSON
- Errores fatales devuelven JSON (no HTML)
- Genera código de referencia para debugging

### Checklist de Pruebas Completo

1. **404 Frontend**: Navega a `/pagina-inexistente`
2. **404 API**: `GET /backend/api/inexistente.php`
3. **Error JS**: Abre consola y ejecuta `throw new Error('Test')`
4. **Offline**: DevTools → Network → Offline
5. **Error API 500**: Simula error en endpoint PHP