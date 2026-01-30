import { showSuccessAlert, showWarningAlert } from './utils/alerts.js';

// Wait for DOM to be ready before checking for elements
function initMainJS() {
    // Only run if we're on a page that needs main.js functionality
    const hasMainPageElements = document.querySelector('.menu-toggle') ||
        document.querySelector('.nav-links') ||
        document.getElementById('contactForm');

    if (!hasMainPageElements) {
        // Not a page that needs main.js, skip initialization
        return;
    }

    // Mobile Menu Toggle
    const menuToggle = document.querySelector('.menu-toggle');
    const navLinks = document.querySelector('.nav-links');

    if (menuToggle && navLinks) {
        menuToggle.addEventListener('click', () => {
            navLinks.classList.toggle('active');
            // Change icon if needed
            const icon = menuToggle.querySelector('i');
            if (icon) {
                if (navLinks.classList.contains('active')) {
                    icon.classList.remove('fa-bars');
                    icon.classList.add('fa-times');
                } else {
                    icon.classList.remove('fa-times');
                    icon.classList.add('fa-bars');
                }
            }
        });
    }

    // Smooth Scrolling for Anchor Links
    try {
        const anchors = document.querySelectorAll('a[href^="#"]');
        if (anchors && anchors.length > 0) {
            anchors.forEach(anchor => {
                anchor.addEventListener('click', function (e) {
                    const href = this.getAttribute('href');
                    if (href === '#' || href === '#!') return; // Ignore empty anchors

                    try {
                        const target = document.querySelector(href);
                        if (target) {
                            e.preventDefault();
                            target.scrollIntoView({
                                behavior: 'smooth'
                            });
                            // Close mobile menu if open
                            if (navLinks && navLinks.classList.contains('active')) {
                                navLinks.classList.remove('active');
                            }
                        }
                    } catch (err) {
                        // Invalid selector, ignore
                    }
                });
            });
        }
    } catch (err) {
        console.log('Smooth scroll not available on this page');
    }

    // Contact Form Validation
    const contactForm = document.getElementById('contactForm');
    if (contactForm) {
        contactForm.addEventListener('submit', (e) => {
            e.preventDefault();

            // Basic validation
            const name = document.getElementById('name').value;
            const email = document.getElementById('email').value;
            const message = document.getElementById('message').value;

            if (name && email && message) {
                // Simulate submission
                showSuccessAlert('تم الإرسال', 'شكراً لتواصلك معنا! سنقوم بالرد عليك في أقرب وقت.');
                contactForm.reset();
            } else {
                showWarningAlert('تنبيه', 'يرجى ملء جميع الحقول المطلوبة.');
            }
        });
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMainJS);
} else {
    // DOM already loaded
    initMainJS();
}

// PWA Installation Logic
let deferredPrompt;

window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent the mini-infobar from appearing on mobile
    e.preventDefault();
    // Stash the event so it can be triggered later.
    deferredPrompt = e;
    // Update UI notify the user they can install the PWA
    showInstallBanner();
});

function showInstallBanner() {
    // Check if we're already in standalone mode
    if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true) {
        return;
    }

    // Only show on dashboard or index pages to avoid being annoying
    const isHome = window.location.pathname === '/' || window.location.pathname.includes('index.html');
    const isDashboard = window.location.pathname.includes('dashboard.html');
    if (!isHome && !isDashboard) return;

    // Check if user dismissed it this session
    if (sessionStorage.getItem('pwa_banner_dismissed')) return;

    const banner = document.createElement('div');
    banner.id = 'pwa-install-banner';
    banner.className = 'pwa-banner';
    banner.innerHTML = `
        <div class="pwa-banner-content">
            <div class="pwa-banner-icon">
                <img src="assets/images/logo-icon.webp" alt="App Icon">
            </div>
            <div class="pwa-banner-text">
                <h3>نزل تطبيق تمريض بنها 📱</h3>
            </div>
            <div class="pwa-banner-actions">
                <button id="pwa-install-btn" class="btn btn-primary btn-sm">تثبيت الآن</button>
                <button id="pwa-dismiss-btn" class="btn-close-banner"><i class="fas fa-times"></i></button>
            </div>
        </div>
    `;

    document.body.appendChild(banner);

    // Install logic
    document.getElementById('pwa-install-btn').addEventListener('click', async () => {
        if (!deferredPrompt) return;

        // Show the install prompt
        deferredPrompt.prompt();

        // Wait for the user to respond to the prompt
        const { outcome } = await deferredPrompt.userChoice;
        console.log(`User response to the install prompt: ${outcome}`);

        // We've used the prompt, and can't use it again
        deferredPrompt = null;

        // Hide the banner
        banner.remove();
    });

    // Dismiss logic
    document.getElementById('pwa-dismiss-btn').addEventListener('click', () => {
        banner.remove();
        sessionStorage.setItem('pwa_banner_dismissed', 'true');
    });
}

window.addEventListener('appinstalled', (event) => {
    console.log('👍', 'appinstalled', event);
    // Clear the deferredPrompt so it can be garbage collected
    deferredPrompt = null;
    const banner = document.getElementById('pwa-install-banner');
    if (banner) banner.remove();
});

// PWA Service Worker Registration
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(registration => {
                // console.log('ServiceWorker registration successful with scope: ', registration.scope);
                console.log("Successful")
            })
            .catch(err => {
                // console.log('ServiceWorker registration failed: ', err);
                console.log('Failed')
            });
    });
}
