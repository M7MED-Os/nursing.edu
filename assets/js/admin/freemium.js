import { supabase } from '../supabaseClient.js';
import { showSuccessAlert, showErrorAlert, showLoadingAlert } from '../utils/alerts.js';

/**
 * Freemium Settings Management Module
 * Handles global feature toggles for squads, tasks, and leaderboard
 */

/**
 * Show Freemium Settings View
 */
export function showFreemiumSettingsView() {
    // Remove active class from all nav items
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));

    // Add active class to freemium nav item
    const navItem = document.getElementById('navFreemium');
    if (navItem) navItem.classList.add('active');

    // Update page title
    const pageTitle = document.getElementById('pageTitle');
    if (pageTitle) pageTitle.textContent = 'الرئيسية > إعدادات Freemium';

    // Hide all views
    document.querySelectorAll('.view-section, .admin-view').forEach(v => v.style.display = 'none');

    // Show freemium settings view
    const view = document.getElementById('freemiumSettingsView');
    if (view) {
        view.style.display = 'block';
        loadFreemiumSettings();
    }
}

/**
 * Load current freemium settings from database
 */
async function loadFreemiumSettings() {
    try {
        // Fetch from freemium_config table (not app_configs!)
        const { data, error } = await supabase
            .from('freemium_config')
            .select('*')
            .limit(1)
            .single();

        if (error) {
            console.error('Error loading freemium settings:', error);
            showErrorAlert('خطأ', 'فشل تحميل الإعدادات');
            return;
        }

        // Update toggles
        const squadsToggle = document.getElementById('squadsFreemiumToggle');
        const tasksToggle = document.getElementById('tasksFreemiumToggle');
        const leaderboardToggle = document.getElementById('leaderboardFreemiumToggle');

        if (squadsToggle) squadsToggle.checked = data?.squads_config || false;
        if (tasksToggle) tasksToggle.checked = data?.tasks_config || false;
        if (leaderboardToggle) leaderboardToggle.checked = data?.leaderboard_config || false;

    } catch (err) {
        console.error('Exception loading freemium settings:', err);
        showErrorAlert('خطأ', 'حدث خطأ في تحميل الإعدادات');
    }
}

/**
 * Save freemium settings with audit logging
 */
export async function saveFreemiumSettings() {
    const squadsToggle = document.getElementById('squadsFreemiumToggle');
    const tasksToggle = document.getElementById('tasksFreemiumToggle');
    const leaderboardToggle = document.getElementById('leaderboardFreemiumToggle');

    try {
        showLoadingAlert('جاري الحفظ...');

        // Get current values for audit log
        const { data: oldData } = await supabase
            .from('freemium_config')
            .select('*')
            .limit(1)
            .single();

        const newValues = {
            squads_config: squadsToggle.checked,
            tasks_config: tasksToggle.checked,
            leaderboard_config: leaderboardToggle.checked,
            updated_at: new Date().toISOString()
        };

        // Update freemium_config table
        const { error: updateError } = await supabase
            .from('freemium_config')
            .update(newValues)
            .eq('id', oldData.id);

        if (updateError) throw updateError;

        // Log the change in audit log
        const { data: { user } } = await supabase.auth.getUser();
        await supabase.from('freemium_audit_log').insert({
            admin_id: user.id,
            action: 'update_freemium_config',
            old_value: {
                squads_config: oldData.squads_config,
                tasks_config: oldData.tasks_config,
                leaderboard_config: oldData.leaderboard_config
            },
            new_value: newValues
        });

        showSuccessAlert('تم الحفظ', 'تم تحديث إعدادات Freemium بنجاح');

    } catch (err) {
        console.error('Error saving freemium settings:', err);
        showErrorAlert('خطأ', 'فشل حفظ الإعدادات. تأكد من صلاحياتك كمسؤول.');
    }
}

// Initialize event listeners
document.addEventListener('DOMContentLoaded', () => {
    const saveBtn = document.getElementById('saveFreemiumSettingsBtn');
    if (saveBtn) {
        saveBtn.addEventListener('click', saveFreemiumSettings);
    }
});
