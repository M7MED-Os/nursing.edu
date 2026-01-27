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

// PWA Service Worker Registration
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(registration => {
                console.log('ServiceWorker registration successful with scope: ', registration.scope);
            })
            .catch(err => {
                console.log('ServiceWorker registration failed: ', err);
            });
    });
}
