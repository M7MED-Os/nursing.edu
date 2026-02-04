/**
 * Subscription Service - Centralized Freemium Management
 * Handles all subscription checks, feature access, and content filtering
 */

import { supabase } from './supabaseClient.js';

class SubscriptionService {
    constructor() {
        this.userProfile = null;
        this.freemiumConfig = null;
        this.initialized = false;
        this.cache = {
            isPremium: null,
            config: null,
            timestamp: null
        };
    }

    /**
     * Initialize the service with user profile
     */
    async init(profile) {
        if (!profile) {
            console.warn('SubscriptionService: No profile provided');
            return false;
        }

        this.userProfile = profile;

        // Load freemium config
        await this.loadFreemiumConfig();

        this.initialized = true;
        return true;
    }

    /**
     * Load freemium configuration from database
     */
    async loadFreemiumConfig() {
        try {
            const { data, error } = await supabase.rpc('get_freemium_config');

            if (error) {
                console.error('Error loading freemium config:', error);
                // Default to all features enabled on error
                this.freemiumConfig = {
                    squads_enabled: true,
                    tasks_enabled: true,
                    leaderboard_enabled: true
                };
                return;
            }

            if (data && data.length > 0) {
                this.freemiumConfig = data[0];
            } else {
                // Default config
                this.freemiumConfig = {
                    squads_enabled: true,
                    tasks_enabled: true,
                    leaderboard_enabled: true
                };
            }

            // Cache config
            this.cache.config = this.freemiumConfig;
            this.cache.timestamp = Date.now();

        } catch (err) {
            console.error('Exception loading freemium config:', err);
            this.freemiumConfig = {
                squads_enabled: true,
                tasks_enabled: true,
                leaderboard_enabled: true
            };
        }
    }

    /**
     * Check if user has active premium subscription
     */
    isPremium() {
        if (!this.userProfile) return false;

        const { is_active, subscription_ends_at } = this.userProfile;

        // Check if subscription is active
        if (!is_active) return false;

        // Check if subscription has expired
        if (subscription_ends_at) {
            const expiryDate = new Date(subscription_ends_at);
            const now = new Date();
            if (now > expiryDate) return false;
        }

        return true;
    }

    /**
     * Check if user can access a specific feature
     * @param {string} featureName - 'squads', 'tasks', or 'leaderboard'
     */
    canAccessFeature(featureName) {
        if (!this.freemiumConfig) return true; // Default allow if config not loaded

        const isPremium = this.isPremium();

        switch (featureName) {
            case 'squads':
                return this.freemiumConfig.squads_enabled || isPremium;
            case 'tasks':
                return this.freemiumConfig.tasks_enabled || isPremium;
            case 'leaderboard':
                return this.freemiumConfig.leaderboard_enabled || isPremium;
            default:
                return true;
        }
    }

    /**
     * Check if user can access a lesson's content
     * @param {object} lesson - Lesson object with is_free property
     */
    canAccessLessonContent(lesson) {
        if (!lesson) return false;

        // Premium users can access everything
        if (this.isPremium()) return true;

        // Free users can only access free lessons
        return lesson.is_free === true;
    }

    /**
     * Check if user can access an exam
     * @param {object} lesson - Parent lesson object with is_free_exam property
     */
    canAccessExam(lesson) {
        if (!lesson) return false;

        // Premium users can access everything
        if (this.isPremium()) return true;

        // Free users can only access free exams
        return lesson.is_free_exam === true;
    }

    /**
     * Fetch accessible lessons for a chapter (using RPC)
     */
    async fetchAccessibleLessons(chapterId) {
        try {
            const { data, error } = await supabase.rpc('get_accessible_lessons', {
                p_chapter_id: chapterId
            });

            if (error) throw error;
            return data || [];
        } catch (err) {
            console.error('Error fetching accessible lessons:', err);
            return [];
        }
    }

    /**
     * Validate lesson access (server-side check)
     * @returns {object} { canAccess: boolean, lesson: object }
     */
    async validateLessonAccess(lessonId) {
        try {
            const { data, error } = await supabase.rpc('get_lesson_secure', {
                p_lesson_id: lessonId
            });

            if (error) throw error;

            if (!data || data.length === 0) {
                return { canAccess: false, lesson: null, error: 'Lesson not found' };
            }

            const lesson = data[0];
            return {
                canAccess: lesson.can_access,
                lesson: lesson,
                error: null
            };
        } catch (err) {
            console.error('Error validating lesson access:', err);
            return { canAccess: false, lesson: null, error: err.message };
        }
    }

    /**
     * Validate exam access (server-side check)
     * @returns {object} { canAccess: boolean, exam: object }
     */
    async validateExamAccess(examId) {
        try {
            const { data, error } = await supabase.rpc('get_exam_secure', {
                p_exam_id: examId
            });

            if (error) throw error;

            if (!data || data.length === 0) {
                return { canAccess: false, exam: null, error: 'Exam not found' };
            }

            const exam = data[0];
            return {
                canAccess: exam.can_access,
                exam: exam,
                isPremiumRequired: exam.is_premium_required,
                error: null
            };
        } catch (err) {
            console.error('Error validating exam access:', err);
            return { canAccess: false, exam: null, error: err.message };
        }
    }

    /**
     * Fetch exam questions (with access check)
     */
    async fetchExamQuestions(examId) {
        try {
            const { data, error } = await supabase.rpc('get_exam_questions_secure', {
                p_exam_id: examId
            });

            if (error) throw error;
            return data || [];
        } catch (err) {
            console.error('Error fetching exam questions:', err);
            return [];
        }
    }

    /**
     * Show upgrade prompt modal
     */
    async showUpgradePrompt(contentType = 'content') {
        const messages = {
            lesson: {
                title: 'هذه المحاضرة للمشتركين فقط! 🔒',
                text: 'اشترك الآن للوصول لجميع المحاضرات والامتحانات'
            },
            exam: {
                title: 'هذا الامتحان للمشتركين فقط! 🔒',
                text: 'اشترك الآن لحل جميع الامتحانات وكسب النقاط'
            },
            feature: {
                title: 'هذه الميزة للمشتركين فقط! 🔒',
                text: 'اشترك الآن للاستمتاع بجميع مميزات المنصة'
            },
            content: {
                title: 'محتوى مدفوع! 🔒',
                text: 'اشترك الآن للوصول الكامل'
            }
        };

        const config = messages[contentType] || messages.content;

        return Swal.fire({
            title: config.title,
            html: `
                <p style="margin-bottom: 1.5rem;">${config.text}</p>
                <div style="background: #f0f9ff; padding: 1.5rem; border-radius: 12px; text-align: right; margin-bottom: 1rem;">
                    <h4 style="margin: 0 0 1rem; color: #0369a1; font-size: 1.1rem;">
                        ✨ مميزات الاشتراك
                    </h4>
                    <ul style="list-style: none; padding: 0; margin: 0;">
                        <li style="padding: 0.5rem 0; border-bottom: 1px solid #e0f2fe;">
                            <i class="fas fa-check-circle" style="color: #10b981; margin-left: 8px;"></i>
                            📚 وصول كامل لجميع المحاضرات والفيديوهات
                        </li>
                        <li style="padding: 0.5rem 0; border-bottom: 1px solid #e0f2fe;">
                            <i class="fas fa-check-circle" style="color: #10b981; margin-left: 8px;"></i>
                            📝 حل جميع الامتحانات وكسب النقاط
                        </li>
                        <li style="padding: 0.5rem 0; border-bottom: 1px solid #e0f2fe;">
                            <i class="fas fa-check-circle" style="color: #10b981; margin-left: 8px;"></i>
                            🏆 الظهور في لوحة الأوائل والمنافسة
                        </li>
                        <li style="padding: 0.5rem 0; border-bottom: 1px solid #e0f2fe;">
                            <i class="fas fa-check-circle" style="color: #10b981; margin-left: 8px;"></i>
                            👥 الانضمام للشلل والمذاكرة الجماعية
                        </li>
                        <li style="padding: 0.5rem 0;">
                            <i class="fas fa-check-circle" style="color: #10b981; margin-left: 8px;"></i>
                            ✅ نظام المهام والتنظيم الشخصي
                        </li>
                    </ul>
                </div>
            `,
            icon: 'info',
            showCancelButton: true,
            confirmButtonColor: '#0ea5e9',
            cancelButtonColor: '#64748b',
            confirmButtonText: '<i class="fas fa-crown"></i> اشترك الآن',
            cancelButtonText: 'ليس الآن',
            customClass: {
                popup: 'rtl-popup'
            }
        }).then((result) => {
            if (result.isConfirmed) {
                window.location.href = 'pending.html';
            }
        });
    }

    /**
     * Get user's subscription status for display
     */
    getSubscriptionStatus() {
        if (!this.userProfile) {
            return {
                isPremium: false,
                status: 'غير مشترك',
                expiryDate: null,
                daysRemaining: null
            };
        }

        const isPremium = this.isPremium();
        const { subscription_ends_at } = this.userProfile;

        if (!isPremium) {
            return {
                isPremium: false,
                status: 'غير مشترك',
                expiryDate: null,
                daysRemaining: null
            };
        }

        if (!subscription_ends_at) {
            return {
                isPremium: true,
                status: 'مشترك (دائم)',
                expiryDate: null,
                daysRemaining: null
            };
        }

        const expiryDate = new Date(subscription_ends_at);
        const now = new Date();
        const daysRemaining = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));

        return {
            isPremium: true,
            status: 'مشترك',
            expiryDate: expiryDate,
            daysRemaining: daysRemaining
        };
    }
}

// Create singleton instance
const subscriptionService = new SubscriptionService();

// Export service and helper functions for backward compatibility
export { subscriptionService };

export async function initSubscriptionService(profile) {
    return await subscriptionService.init(profile);
}

export function isPremiumUser() {
    return subscriptionService.isPremium();
}

export function canAccessFeature(featureName) {
    return subscriptionService.canAccessFeature(featureName);
}

export function canAccessLectureContent(lesson) {
    return subscriptionService.canAccessLessonContent(lesson);
}

export function canAccessExam(lesson) {
    return subscriptionService.canAccessExam(lesson);
}

export async function showUpgradePrompt(contentType) {
    return await subscriptionService.showUpgradePrompt(contentType);
}
