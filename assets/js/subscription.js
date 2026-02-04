import { supabase } from './supabaseClient.js';
import { getCache, setCache } from './utils.js';

/**
 * Subscription Service
 * Centralized logic for checking subscription status and feature access
 */

/**
 * Check if user has premium access (active subscription or admin)
 * @param {Object} profile - User profile object
 * @returns {boolean}
 */
export function isPremium(profile) {
    if (!profile) return false;

    // Admins always have premium access
    if (profile.role === 'admin') return true;

    // Check subscription status
    const now = new Date();
    const expiry = profile.subscription_ends_at ? new Date(profile.subscription_ends_at) : null;
    const isExpired = expiry && now > expiry;
    const isActive = profile.is_active;

    return isActive && !isExpired;
}

/**
 * Get app configuration from cache or database
 * @param {string} key - Config key
 * @returns {Promise<any>}
 */
async function getAppConfig(key) {
    const cacheKey = `app_config_${key}`;
    let config = getCache(cacheKey);

    if (!config) {
        const { data, error } = await supabase
            .from('app_configs')
            .select('value')
            .eq('key', key)
            .single();

        if (error || !data) {
            console.warn(`Config key "${key}" not found, using default`);
            return null;
        }

        config = data.value;
        // Cache for 5 minutes
        setCache(cacheKey, config, 5);
    }

    return config;
}

/**
 * Check if a specific feature is accessible to the user
 * @param {string} feature - Feature name ('squads', 'tasks', 'leaderboard')
 * @param {Object} profile - User profile
 * @returns {Promise<boolean>}
 */
export async function canAccessFeature(feature, profile) {
    // Admins can access everything
    if (profile?.role === 'admin') return true;

    // Get feature config
    const configKey = `${feature}_config`;
    const config = await getAppConfig(configKey);

    if (!config) {
        // If config doesn't exist, default to requiring premium
        return isPremium(profile);
    }

    // If feature is free, everyone can access
    if (config.is_free === true) return true;

    // Otherwise, require premium
    return isPremium(profile);
}

/**
 * Check if user can access lecture content
 * @param {Object} lesson - Lesson object with is_free property
 * @param {Object} profile - User profile
 * @returns {boolean}
 */
export function canAccessLectureContent(lesson, profile) {
    // Admins can access everything
    if (profile?.role === 'admin') return true;

    // If lesson is free, everyone can access
    if (lesson.is_free === true) return true;

    // Otherwise, require premium
    return isPremium(profile);
}

/**
 * Check if user can access exam/questions
 * @param {Object} lesson - Lesson object with is_free_exam property
 * @param {Object} profile - User profile
 * @returns {boolean}
 */
export function canAccessExam(lesson, profile) {
    // Admins can access everything
    if (profile?.role === 'admin') return true;

    // If exam is free, everyone can access
    if (lesson.is_free_exam === true) return true;

    // Otherwise, require premium
    return isPremium(profile);
}

/**
 * Check if user can earn points
 * Only premium users can earn points
 * @param {Object} profile - User profile
 * @returns {boolean}
 */
export function canEarnPoints(profile) {
    return isPremium(profile);
}

/**
 * Show upgrade prompt to user
 * @param {string} feature - Feature name for context
 */
export function showUpgradePrompt(feature = 'هذه الميزة') {
    const messages = {
        'lecture': 'هذه المحاضرة متاحة للمشتركين فقط',
        'exam': 'هذا الامتحان متاح للمشتركين فقط',
        'squads': 'نظام الشلة متاح للمشتركين فقط',
        'tasks': 'نظام المهام متاح للمشتركين فقط',
        'default': `${feature} متاح للمشتركين فقط`
    };

    const message = messages[feature] || messages.default;

    Swal.fire({
        icon: 'info',
        title: 'اشترك الآن! 🚀',
        html: `
            <div style="text-align: center; direction: rtl; padding: 1rem;">
                <p style="font-size: 1.1rem; margin-bottom: 1rem;">${message}</p>
                <div style="background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%); 
                            border-radius: 12px; padding: 1.5rem; margin: 1rem 0;">
                    <h4 style="color: #0369a1; margin-bottom: 1rem;">✨ مميزات الاشتراك</h4>
                    <ul style="text-align: right; list-style: none; padding: 0; color: #0c4a6e;">
                        <li style="margin: 0.5rem 0;">📚 وصول كامل لجميع المحاضرات والفيديوهات</li>
                        <li style="margin: 0.5rem 0;">📝 حل جميع الامتحانات والأسئلة</li>
                        <li style="margin: 0.5rem 0;">⭐ كسب النقاط والظهور في لوحة الأوائل</li>
                        <li style="margin: 0.5rem 0;">👥 الانضمام للشلل والمذاكرة الجماعية</li>
                        <li style="margin: 0.5rem 0;">✅ نظام المهام والتنظيم الشخصي</li>
                    </ul>
                </div>
            </div>
        `,
        confirmButtonText: 'اشترك الآن 💳',
        confirmButtonColor: '#0ea5e9',
        showCancelButton: true,
        cancelButtonText: 'ليس الآن',
        cancelButtonColor: '#64748b'
    }).then((result) => {
        if (result.isConfirmed) {
            window.location.href = 'pending.html';
        }
    });
}
