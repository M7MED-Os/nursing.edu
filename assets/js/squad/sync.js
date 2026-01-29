// Squad Sync Manager - EXACT COPY from original squad.js
import { syncTimer } from './state.js';
import { setSyncTimer } from './state.js';
import { loadChat } from './chat.js';
import { loadPomodoro } from './pomodoro.js';
import { loadTasks } from './tasks.js';
import { loadMembers } from './members.js';
import { loadActiveChallenge } from './challenge.js';
import { loadGlobalSettings } from './utils.js';

/**
 * Restore cooldowns from sessionStorage
 */
export function restoreCooldowns() {
    const keys = Object.keys(sessionStorage);
    keys.forEach(k => {
        if (k.startsWith('cooldown_')) {
            const expiry = parseInt(sessionStorage.getItem(k), 10);
            if (expiry > Date.now()) {
                const remaining = Math.ceil((expiry - Date.now()) / 1000);
                console.log(`Cooldown restored: ${k}, ${remaining}s left`);
            } else {
                sessionStorage.removeItem(k);
            }
        }
    });
}

/**
 * Start Sync Manager - EXACT COPY
 * Orchestrates background synchronization for squad components.
 */
export function startSyncManager() {
    if (syncTimer) clearTimeout(syncTimer);

    const FAST_INTERVAL = 20000; // 20s for Chat/Timer
    const SLOW_INTERVAL = 60000; // 60s for Tasks/Members
    const SETTINGS_INTERVAL = 300000; // 5 mins (Reduced from 1hr so users catch up faster on changes)

    let lastSlowSync = 0;
    let lastSettingsSync = 0;

    const performSync = async () => {
        if (document.visibilityState !== 'visible') {
            setSyncTimer(setTimeout(performSync, FAST_INTERVAL));
            return;
        }

        const now = Date.now();
        const shouldDoSlowSync = (now - lastSlowSync) >= SLOW_INTERVAL;
        const shouldDoSettingsSync = (now - lastSettingsSync) >= SETTINGS_INTERVAL;

        try {
            const tasks = [loadChat(), loadPomodoro(), loadActiveChallenge()];

            if (shouldDoSlowSync) {
                tasks.push(loadTasks(), loadMembers());
                lastSlowSync = now;
            }

            if (shouldDoSettingsSync || lastSettingsSync === 0) {
                tasks.push(loadGlobalSettings());
                lastSettingsSync = now;
            }

            await Promise.allSettled(tasks);
        } catch (err) {
            console.error('[SyncManager] Sync failed:', err);
        }

        setSyncTimer(setTimeout(performSync, FAST_INTERVAL));
    };

    // Kick off initial sync
    setSyncTimer(setTimeout(performSync, FAST_INTERVAL));

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') performSync();
    });
}
