import { supabase } from '../supabaseClient.js';
import { showSuccessAlert, showErrorAlert, showLoadingAlert } from '../utils/alerts.js';
import { clearCacheByPattern } from '../utils.js';

/**
 * Freemium Settings Management Module
 * Handles global feature toggles and lecture-level access controls
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
        // Fetch all config keys
        const { data, error } = await supabase
            .from('app_configs')
            .select('*')
            .in('key', ['squads_config', 'tasks_config', 'leaderboard_config']);

        if (error) throw error;

        // Parse and populate UI
        const configs = {};
        data.forEach(row => {
            configs[row.key] = row.value;
        });

        // Update toggles
        const squadsToggle = document.getElementById('squadsFreemiumToggle');
        const tasksToggle = document.getElementById('tasksFreemiumToggle');
        const leaderboardToggle = document.getElementById('leaderboardFreemiumToggle');

        if (squadsToggle) squadsToggle.checked = configs.squads_config?.is_free || false;
        if (tasksToggle) tasksToggle.checked = configs.tasks_config?.is_free || false;
        if (leaderboardToggle) leaderboardToggle.checked = configs.leaderboard_config?.visible_to_free || false;

    } catch (err) {
        console.error('Error loading freemium settings:', err);
        showErrorAlert('خطأ', 'فشل تحميل الإعدادات');
    }
}

/**
 * Save freemium settings
 */
export async function saveFreemiumSettings() {
    const squadsToggle = document.getElementById('squadsFreemiumToggle');
    const tasksToggle = document.getElementById('tasksFreemiumToggle');
    const leaderboardToggle = document.getElementById('leaderboardFreemiumToggle');

    try {
        showLoadingAlert('جاري الحفظ...');

        // Update squads config
        await supabase
            .from('app_configs')
            .update({ value: { is_free: squadsToggle.checked } })
            .eq('key', 'squads_config');

        // Update tasks config
        await supabase
            .from('app_configs')
            .update({ value: { is_free: tasksToggle.checked } })
            .eq('key', 'tasks_config');

        // Update leaderboard config
        await supabase
            .from('app_configs')
            .update({ value: { visible_to_free: leaderboardToggle.checked } })
            .eq('key', 'leaderboard_config');

        // Clear all config caches
        clearCacheByPattern('app_config_');

        showSuccessAlert('تم الحفظ', 'تم تحديث إعدادات Freemium بنجاح');

    } catch (err) {
        console.error('Error saving freemium settings:', err);
        showErrorAlert('خطأ', 'فشل حفظ الإعدادات');
    }
}

/**
 * Update lecture freemium settings in the edit modal
 * This function should be called when editing a lesson
 */
export function addFreemiumControlsToLectureModal(lesson) {
    const modalContent = document.querySelector('#editLessonModal .modal-body');
    if (!modalContent) return;

    // Check if controls already exist
    if (document.getElementById('freemiumControlsSection')) return;

    // Create freemium controls section
    const section = document.createElement('div');
    section.id = 'freemiumControlsSection';
    section.style.cssText = `
        margin-top: 1.5rem;
        padding: 1rem;
        background: #f8fafc;
        border-radius: 8px;
        border: 1px solid #e2e8f0;
    `;

    section.innerHTML = `
        <h4 style="font-size: 0.95rem; margin-bottom: 1rem; color: #334155;">
            <i class="fas fa-lock"></i> إعدادات الوصول (Freemium)
        </h4>
        <div style="display: flex; flex-direction: column; gap: 0.75rem;">
            <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                <input type="checkbox" id="lessonContentFreeToggle" 
                    ${lesson?.is_free ? 'checked' : ''}
                    style="width: 18px; height: 18px; cursor: pointer;">
                <span style="font-size: 0.9rem;">المحتوى والفيديو مجاني (متاح لغير المشتركين)</span>
            </label>
            <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                <input type="checkbox" id="lessonExamFreeToggle" 
                    ${lesson?.is_free_exam ? 'checked' : ''}
                    style="width: 18px; height: 18px; cursor: pointer;">
                <span style="font-size: 0.9rem;">الامتحان مجاني (متاح لغير المشتركين)</span>
            </label>
        </div>
        <p style="font-size: 0.75rem; color: #64748b; margin-top: 0.5rem; margin-bottom: 0;">
            💡 إذا كانت الخيارات غير محددة، سيكون المحتوى متاحاً للمشتركين فقط
        </p>
    `;

    // Insert before the save button
    const saveBtn = modalContent.querySelector('.btn-primary');
    if (saveBtn && saveBtn.parentElement) {
        saveBtn.parentElement.insertBefore(section, saveBtn);
    } else {
        modalContent.appendChild(section);
    }
}

/**
 * Get freemium values from lecture modal
 */
export function getFreemiumValuesFromModal() {
    const contentFree = document.getElementById('lessonContentFreeToggle');
    const examFree = document.getElementById('lessonExamFreeToggle');

    return {
        is_free: contentFree ? contentFree.checked : false,
        is_free_exam: examFree ? examFree.checked : false
    };
}

// Initialize event listeners
document.addEventListener('DOMContentLoaded', () => {
    const saveBtn = document.getElementById('saveFreemiumSettingsBtn');
    if (saveBtn) {
        saveBtn.addEventListener('click', saveFreemiumSettings);
    }
});
