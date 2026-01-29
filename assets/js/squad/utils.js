// Squad Utility Functions
import { supabase } from '../supabaseClient.js';
import { currentSquad } from './state.js';

/**
 * Show a view and hide others
 */
export function showView(viewKey, views) {
    Object.keys(views).forEach(k => views[k].style.display = (k === viewKey ? 'block' : 'none'));
}

/**
 * Format time ago string in Arabic
 */
export function timeAgo(dateString) {
    if (!dateString) return 'غير معروف';

    const now = Date.now();
    const past = new Date(dateString).getTime();
    const diff = now - past;

    const seconds = Math.floor(diff / 1000);
    if (seconds < 60) return 'الآن';

    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `منذ ${minutes} دقيقة`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `منذ ${hours} ساعة`;

    const days = Math.floor(hours / 24);
    return `منذ ${days} يوم`;
}

/**
 * Copy squad code to clipboard
 */
export async function copySquadCode() {
    if (!currentSquad) return;

    const code = currentSquad.id.split('-')[0].toUpperCase();
    try {
        await navigator.clipboard.writeText(code);
        Swal.fire({
            icon: 'success',
            title: 'تم النسخ!',
            text: `كود الشلة: ${code}`,
            timer: 1500,
            showConfirmButton: false
        });
    } catch (err) {
        console.error('Copy failed:', err);
    }
}

/**
 * Show read-by modal
 */
export function showReadBy(names) {
    if (!names || names.length === 0) {
        Swal.fire('لا يوجد', 'لم يقرأها أحد بعد', 'info');
        return;
    }

    Swal.fire({
        title: 'شافوها',
        html: `<div style="text-align:right; direction:rtl;">${names.map(n => `<div>• ${n}</div>`).join('')}</div>`,
        confirmButtonText: 'تمام'
    });
}

/**
 * Trigger celebration animation
 */
export function triggerCelebration(type = 'task') {
    const messages = {
        task: ['🎉 رهيب!', '💪 عظمة!', '⭐ تمام كده!', '🔥 نار!'],
        challenge: ['🏆 مبروك!', '🎊 إنجاز رائع!', '✨ أسطورة!'],
        pomodoro: ['⏰ خلصت!', '💯 تمام!', '🎯 مركز!']
    };

    const msgs = messages[type] || messages.task;
    const msg = msgs[Math.floor(Math.random() * msgs.length)];

    // Simple toast notification
    const toast = document.createElement('div');
    toast.textContent = msg;
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: linear-gradient(135deg, #10B981, #059669);
        color: white;
        padding: 16px 24px;
        border-radius: 12px;
        font-size: 1.2rem;
        font-weight: 800;
        z-index: 10000;
        animation: slideIn 0.3s ease-out;
        box-shadow: 0 10px 25px rgba(16, 185, 129, 0.3);
    `;

    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease-in';
        setTimeout(() => toast.remove(), 300);
    }, 2000);
}

/**
 * Load global squad settings from database
 */
export async function loadGlobalSettings() {
    try {
        const { data: config } = await supabase
            .from('app_configs')
            .select('value')
            .eq('key', 'squad_settings')
            .maybeSingle();

        if (config?.value) {
            const settings = {};
            if (config.value.join_mins !== undefined) settings.join_mins = Number(config.value.join_mins);
            if (config.value.grace_mins !== undefined) settings.grace_mins = Number(config.value.grace_mins);
            if (config.value.max_members !== undefined) settings.max_members = Number(config.value.max_members);
            if (config.value.success_threshold !== undefined) settings.success_threshold = Number(config.value.success_threshold);
            return settings;
        }
        return {};
    } catch (e) {
        console.error("Config fetch fail:", e);
        return {};
    }
}
