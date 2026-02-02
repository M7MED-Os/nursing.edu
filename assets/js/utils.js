
// ==========================
// Shared Utility Functions
// ==========================

/**
 * Shows a toast notification at the bottom of the screen.
 * @param {string} message - The message to display.
 * @param {string} type - 'success' or 'error'
 */
export function showToast(message, type = "success") {
    // 1. Get or Create Container
    let container = document.querySelector(".toast-container");
    if (!container) {
        container = document.createElement("div");
        container.className = "toast-container";
        document.body.appendChild(container);
    }

    // 2. Create Toast
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;

    // Add content (Icon + Message)
    const iconClass = type === "success" ? "fa-check-circle" : "fa-exclamation-circle";
    toast.innerHTML = `
        <i class="fas ${iconClass}"></i>
        <span class="toast-message">${message}</span>
    `;

    // 3. Append to Container
    container.appendChild(toast);

    // 4. Handle Removal (Animation is handled by CSS keyframes on mount)
    setTimeout(() => {
        toast.style.animation = "fadeOut 0.4s ease forwards";
        toast.addEventListener("animationend", () => {
            toast.remove();
            if (container.children.length === 0) {
                container.remove(); // Cleanup container if empty
            }
        });
    }, 3000); // 3 seconds delay
}

/**
 * Displays an error message below an input field and marks it as invalid.
 * @param {HTMLElement} inputElement - The input DOM element.
 * @param {string} message - The error message.
 */
export function showInputError(inputElement, message) {
    if (!inputElement) return;
    clearInputError(inputElement);
    inputElement.classList.add("input-error");
    const errorMsg = document.createElement("small");
    errorMsg.className = "error-message";
    errorMsg.textContent = message;
    inputElement.parentNode.insertBefore(errorMsg, inputElement.nextSibling);

    // Auto-clear on input
    inputElement.addEventListener("input", () => clearInputError(inputElement), {
        once: true,
    });
}

/**
 * Clears error state and message from an input field.
 * @param {HTMLElement} inputElement - The input DOM element.
 */
export function clearInputError(inputElement) {
    if (!inputElement) return;
    inputElement.classList.remove("input-error");
    const errorMsg = inputElement.parentNode.querySelector(".error-message");
    if (errorMsg) errorMsg.remove();
}

// ==========================
// Smart Caching System
// ==========================

/**
 * Stores data in localStorage with an expiry timestamp
 * @param {string} key - Unique key for the cache
 * @param {any} data - Data to store
 * @param {number} expireInMinutes - Expiry time in minutes
 */
export function setCache(key, data, expireInMinutes = 30) {
    const expiredAt = new Date().getTime() + (expireInMinutes * 60 * 1000);
    const cacheData = {
        data: data,
        expiredAt: expiredAt
    };
    localStorage.setItem(`cache_${key}`, JSON.stringify(cacheData));
}

/**
 * Retrieves valid data from localStorage, returns null if expired or missing
 * @param {string} key - Unique key for the cache
 * @returns {any|null}
 */
export function getCache(key) {
    const rawData = localStorage.getItem(`cache_${key}`);
    if (!rawData) return null;

    try {
        const cache = JSON.parse(rawData);
        const now = new Date().getTime();

        if (now > cache.expiredAt) {
            localStorage.removeItem(`cache_${key}`);
            return null;
        }
        return cache.data;
    } catch (e) {
        return null;
    }
}

/**
 * Manually clear a specific cache
 */
export function clearCache(key) {
    localStorage.removeItem(`cache_${key}`);
}

/**
 * Clears all cache items that match a specific pattern (e.g., 'leaderboard_')
 * @param {string} pattern - String to look for in keys
 */
export function clearCacheByPattern(pattern) {
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.includes(`cache_${pattern}`)) {
            keysToRemove.push(key);
        }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
}
/**
 * SWR Pattern: Get Data from Cache immediately, then fetch and update
 * @param {string} key - Cache key
 * @param {Function} fetcher - Async function to get fresh data
 * @param {number} ttl - TTL in minutes
 * @param {Function} onFreshData - Callback when fresh data arrives
 */
export async function getSWR(key, fetcher, ttl, onFreshData) {
    const cached = getCache(key);

    // 1. Return cached data immediately if exists
    if (cached && onFreshData) {
        onFreshData(cached, true); // true = from cache
    }

    // 2. Background Revalidation
    try {
        const fresh = await fetcher();
        if (fresh) {
            // 3. Update cache if different or no cache
            if (!cached || JSON.stringify(cached) !== JSON.stringify(fresh)) {
                setCache(key, fresh, ttl);
                if (onFreshData) onFreshData(fresh, false); // false = fresh from network
            }
        }
        return fresh;
    } catch (err) {
        console.error(`[SWR] Error fetching ${key}:`, err);
        return cached;
    }
}
