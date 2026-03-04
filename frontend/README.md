# SICOM Frontend

Frontend PWA (Progressive Web App) del Sistema de Punto de Venta SICOM.

## Estructura del Proyecto

```
frontend/
├── public/
│   ├── css/
│   │   ├── vendor/
│   │   │   ├── bootstrap/      # Bootstrap 5 CSS
│   │   │   ├── datatables/     # DataTables CSS
│   │   │   └── select2/        # Select2 CSS
│   │   ├── cssGeneral.css      # Estilos generales
│   │   ├── cssMenu.css         # Estilos del menú lateral
│   │   ├── estilos.css         # Estilos principales
│   │   ├── select2.css         # Estilos Select2 personalizados
│   │   └── select2-bootstrap.css
│   │
│   ├── js/
│   │   ├── vendor/
│   │   │   ├── bootstrap/      # Bootstrap JS
│   │   │   ├── datatables/     # DataTables JS
│   │   │   ├── jquery/         # jQuery
│   │   │   └── select2/        # Select2 JS
│   │   └── app.js              # Lógica principal de la aplicación
│   │
│   ├── img/
│   │   ├── icons/              # Iconos PWA
│   │   └── productos/          # Imágenes de productos
│   │
│   ├── fonts/                  # Fuentes personalizadas
│   │
│   ├── index.html              # Página de login
│   ├── dashboard.html          # Dashboard principal
│   ├── offline.html            # Página para modo offline
│   ├── manifest.json           # Manifest PWA
│   └── sw.js                   # Service Worker
│
└── README.md
```

## Características

### PWA (Progressive Web App)
- **Instalable**: Se puede instalar como aplicación de escritorio o móvil
- **Offline**: Funcionalidad básica disponible sin conexión
- **Responsive**: Diseño adaptable a cualquier dispositivo

### Tecnologías Utilizadas
- **HTML5 / CSS3**: Estructura y estilos
- **JavaScript ES6+**: Lógica del cliente
- **Bootstrap 5**: Framework CSS
- **jQuery**: Manipulación DOM
- **DataTables**: Tablas interactivas
- **Select2**: Selectores avanzados
- **Service Worker**: Caché y soporte offline

## Configuración de la API

La configuración de la API se encuentra en `js/app.js`:

```javascript
const APP_CONFIG = {
    apiBaseUrl: '../backend/api',
    appName: 'SICOM',
    version: '1.0.0'
};
```

Ajusta `apiBaseUrl` según la ubicación de tu backend.

## Endpoints de API Requeridos

El frontend espera los siguientes endpoints en el backend:

### Autenticación
- `POST /api/auth/login.php` - Iniciar sesión

### Negocios
- `GET /api/negocios/listar.php` - Listar negocios

### Espacios
- `GET /api/espacios/listar.php` - Listar espacios por negocio

### Dashboard
- `GET /api/dashboard/resumen.php` - Estadísticas del día

### Ventas
- `GET /api/ventas/ultimas.php` - Últimas ventas
- `POST /api/ventas/crear.php` - Crear nueva venta

### Productos
- `GET /api/productos/listar.php` - Listar productos
- `POST /api/productos/crear.php` - Crear producto

### Stock
- `GET /api/stock/listar.php` - Listar inventario
- `POST /api/stock/entrada.php` - Registrar entrada

### Clientes
- `GET /api/clientes/listar.php` - Listar clientes

## Uso

### Desarrollo

1. Sirve el directorio `public/` con un servidor web local:
   ```bash
   # Con Python
   cd frontend/public
   python -m http.server 8080
   
   # Con PHP
   cd frontend/public
   php -S localhost:8080
   
   # Con Node.js (npx serve)
   cd frontend/public
   npx serve
   ```

2. Accede a `http://localhost:8080`

### Producción

1. Configura tu servidor web (Apache/Nginx) para servir el directorio `public/`
2. Asegúrate de que el backend esté accesible en la ruta configurada
3. Configura HTTPS para habilitar las funciones PWA completas

## Iconos PWA

Para generar los iconos en los tamaños requeridos, usa el archivo `img/icons/icon.svg` como base y genera PNG en los siguientes tamaños:

- 72x72
- 96x96
- 128x128
- 144x144
- 152x152
- 192x192
- 384x384
- 512x512

Puedes usar herramientas como:
- [RealFaviconGenerator](https://realfavicongenerator.net/)
- [PWA Asset Generator](https://github.com/nickvmiller/pwa-asset-generator)

## Service Worker

El Service Worker (`sw.js`) implementa las siguientes estrategias de caché:

- **Cache First**: Para recursos estáticos (CSS, JS, imágenes)
- **Network First**: Para llamadas a la API
- **Stale While Revalidate**: Para otros recursos

### Actualizar Caché

Para forzar una actualización del caché:

```javascript
// Desde la consola del navegador
navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_CACHE' });
```

## Módulos de la Aplicación

El archivo `app.js` expone el objeto global `SICOM` con los siguientes módulos:

```javascript
window.SICOM = {
    APP_CONFIG,   // Configuración
    AppState,     // Estado de la aplicación
    Utils,        // Utilidades (formateo, etc.)
    API,          // Cliente HTTP para la API
    Storage,      // Manejo de localStorage
    Session,      // Manejo de sesión
    UI,           // Componentes de UI (toasts, modals)
    Logger        // Logger con niveles
};
```

## Soporte de Navegadores

- Chrome 60+
- Firefox 55+
- Safari 12+
- Edge 79+

## Licencia

Este proyecto es propiedad de Soluciones TI.

---

Desarrollado por Soluciones TI - 2026
