/**
 * SICOM - Error Pages JavaScript
 * White Label - Easy to customize
 */

(function() {
    'use strict';

    // ========== BRAND CONFIGURATION ==========
    // Modify these values to customize your error pages
    const CONFIG = {
        productName: 'SICOM',
        logoPath: '../img/icons/logo.jpg', // Set to null to use text logo
        homeUrl: '/',
        supportEmail: 'soporte@sicom.com',
        retryDelay: 3000, // ms before auto-retry countdown
        maxRetries: 3
    };

    // ========== INITIALIZATION ==========
    document.addEventListener('DOMContentLoaded', function() {
        initErrorPage();
    });

    function initErrorPage() {
        // Setup logo
        setupLogo();
        
        // Handle reference code from URL
        handleReferenceCode();
        
        // Setup online/offline detection
        setupConnectivityDetection();
        
        // Setup retry functionality
        setupRetryButton();
        
        // Setup back button
        setupBackButton();
        
        // Update footer year
        updateFooterYear();
    }

    // ========== LOGO SETUP ==========
    function setupLogo() {
        const logoContainer = document.querySelector('.error-logo');
        if (!logoContainer) return;

        if (CONFIG.logoPath) {
            // Check if logo image exists
            const img = new Image();
            img.onload = function() {
                logoContainer.innerHTML = `<img src="${CONFIG.logoPath}" alt="${CONFIG.productName}">`;
            };
            img.onerror = function() {
                // Fallback to text logo
                logoContainer.innerHTML = `<span class="error-logo-text">${CONFIG.productName}</span>`;
            };
            img.src = CONFIG.logoPath;
        } else {
            logoContainer.innerHTML = `<span class="error-logo-text">${CONFIG.productName}</span>`;
        }
    }

    // ========== REFERENCE CODE ==========
    function handleReferenceCode() {
        const refContainer = document.querySelector('.error-ref');
        if (!refContainer) return;

        const urlParams = new URLSearchParams(window.location.search);
        const refCode = urlParams.get('ref') || urlParams.get('reference') || urlParams.get('id');

        if (refCode) {
            refContainer.innerHTML = `Código de referencia: <code>${escapeHtml(refCode)}</code>`;
            refContainer.style.display = 'block';
        } else {
            refContainer.style.display = 'none';
        }
    }

    // ========== CONNECTIVITY DETECTION ==========
    function setupConnectivityDetection() {
        const offlineBanner = document.querySelector('.offline-banner');
        const statusIndicator = document.querySelector('.error-status');
        
        function updateConnectivityUI() {
            const isOffline = !navigator.onLine;
            
            if (offlineBanner) {
                offlineBanner.classList.toggle('is-visible', isOffline);
            }
            
            if (statusIndicator) {
                if (isOffline) {
                    statusIndicator.classList.add('error-status--offline');
                    statusIndicator.classList.remove('error-status--online');
                    const textEl = statusIndicator.querySelector('span:not(.error-status-dot)');
                    if (textEl) textEl.textContent = 'Sin conexión';
                } else {
                    statusIndicator.classList.remove('error-status--offline');
                    statusIndicator.classList.add('error-status--online');
                    const textEl = statusIndicator.querySelector('span:not(.error-status-dot)');
                    if (textEl) textEl.textContent = 'Conectado';
                }
            }
        }

        // Initial check
        updateConnectivityUI();

        // Listen for changes
        window.addEventListener('online', function() {
            updateConnectivityUI();
            // Auto reload when connection is restored
            showToast('¡Conexión restaurada!', 'success');
            setTimeout(function() {
                window.location.reload();
            }, 1500);
        });

        window.addEventListener('offline', function() {
            updateConnectivityUI();
            showToast('Se perdió la conexión', 'warning');
        });
    }

    // ========== RETRY FUNCTIONALITY ==========
    function setupRetryButton() {
        const retryBtn = document.querySelector('[data-action="retry"]');
        if (!retryBtn) return;

        let retryCount = 0;

        retryBtn.addEventListener('click', function(e) {
            e.preventDefault();
            
            if (retryCount >= CONFIG.maxRetries) {
                showToast('Demasiados intentos. Por favor, espera un momento.', 'warning');
                return;
            }

            retryCount++;
            const originalText = retryBtn.innerHTML;
            
            // Show loading state
            retryBtn.disabled = true;
            retryBtn.innerHTML = `
                <span class="error-spinner"></span>
                Reintentando...
            `;

            // Attempt to fetch the current page or home
            const testUrl = window.location.href.split('?')[0].replace(/\/errors\/\d+\.html$/, '/');
            
            fetch(testUrl, { 
                method: 'HEAD', 
                cache: 'no-store',
                headers: { 'Cache-Control': 'no-cache' }
            })
            .then(function(response) {
                if (response.ok) {
                    showToast('¡Conexión exitosa! Redirigiendo...', 'success');
                    setTimeout(function() {
                        window.location.href = CONFIG.homeUrl;
                    }, 500);
                } else {
                    throw new Error('Server error');
                }
            })
            .catch(function() {
                retryBtn.disabled = false;
                retryBtn.innerHTML = originalText;
                showToast(`Intento ${retryCount}/${CONFIG.maxRetries} fallido`, 'error');
            });
        });
    }

    // ========== BACK BUTTON ==========
    function setupBackButton() {
        const backBtn = document.querySelector('[data-action="back"]');
        if (!backBtn) return;

        backBtn.addEventListener('click', function(e) {
            e.preventDefault();
            
            // Try to go back in history, or go home if no history
            if (window.history.length > 1) {
                window.history.back();
            } else {
                window.location.href = CONFIG.homeUrl;
            }
        });
    }

    // ========== FOOTER YEAR ==========
    function updateFooterYear() {
        const yearEl = document.querySelector('[data-year]');
        if (yearEl) {
            yearEl.textContent = new Date().getFullYear();
        }

        const productNameEl = document.querySelector('[data-product-name]');
        if (productNameEl) {
            productNameEl.textContent = CONFIG.productName;
        }
    }

    // ========== TOAST NOTIFICATIONS ==========
    function showToast(message, type = 'info') {
        // Remove existing toast
        const existingToast = document.querySelector('.error-toast');
        if (existingToast) {
            existingToast.remove();
        }

        const colors = {
            success: { bg: '#D1FAE5', text: '#065F46', border: '#10B981' },
            error: { bg: '#FEE2E2', text: '#991B1B', border: '#EF4444' },
            warning: { bg: '#FEF3C7', text: '#92400E', border: '#F59E0B' },
            info: { bg: '#E0E7FF', text: '#3730A3', border: '#4F46E5' }
        };

        const color = colors[type] || colors.info;

        const toast = document.createElement('div');
        toast.className = 'error-toast';
        toast.style.cssText = `
            position: fixed;
            bottom: 24px;
            left: 50%;
            transform: translateX(-50%);
            padding: 12px 20px;
            background: ${color.bg};
            color: ${color.text};
            border: 1px solid ${color.border};
            border-radius: 8px;
            font-size: 14px;
            font-weight: 500;
            z-index: 1000;
            animation: slideUp 0.3s ease;
            font-family: var(--error-font-family, sans-serif);
        `;
        toast.textContent = message;

        // Add animation
        const style = document.createElement('style');
        style.textContent = `
            @keyframes slideUp {
                from { transform: translateX(-50%) translateY(20px); opacity: 0; }
                to { transform: translateX(-50%) translateY(0); opacity: 1; }
            }
        `;
        document.head.appendChild(style);
        document.body.appendChild(toast);

        // Auto remove after 4 seconds
        setTimeout(function() {
            toast.style.opacity = '0';
            toast.style.transition = 'opacity 0.3s ease';
            setTimeout(function() {
                toast.remove();
            }, 300);
        }, 4000);
    }

    // ========== UTILITIES ==========
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Expose CONFIG for external modification if needed
    window.ErrorPageConfig = CONFIG;

})();
