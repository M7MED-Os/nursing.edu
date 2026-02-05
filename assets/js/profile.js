import { supabase } from "./supabaseClient.js";
import { showToast, showInputError } from './utils.js';
import { getAcademicYearLabel, getTermLabel, getDepartmentLabel } from './constants.js';
import { setButtonLoading } from "./utils/dom.js";
import { openAvatarModal } from "./avatar-modal.js";
import { generateAvatar, calculateLevel, getLevelColor, getLevelLegend, getLevelMetadata, LEVEL_MULTIPLIER } from './avatars.js';
import { createLevelBadge, createLevelProgress, applyLevelTheme } from './level-badge.js';

// ==========================
// 1. Current State
// ==========================

let currentUser = null;
let currentProfile = null;

import { checkAuth, refreshUserProfile } from "./auth.js";

async function loadProfile() {
    // 1. Central Auth & Sync
    const auth = await checkAuth({ forceRefresh: true });
    if (!auth) return;

    currentUser = auth.user;
    currentProfile = auth.profile;

    renderProfileUI(auth.profile, auth.user);
    loadPrivacySettings();

    // 2. Reactive updates
    window.addEventListener('profileUpdated', (e) => {
        currentProfile = e.detail;
        renderProfileUI(e.detail, currentUser);
    });
}

function renderProfileUI(profile, user) {
    if (!profile) return;

    // 1. Get Auth Metadata fallback
    const meta = user?.user_metadata || {};

    // 2. Data to use (new column names with fallback)
    const fullName = profile.full_name || meta.full_name || "";
    const email = currentUser.email || "";
    const academic_year = profile?.academic_year || meta.academic_year || "";
    const current_term = profile?.current_term || meta.current_term || "";
    const department = profile?.department || meta.department || "";

    // Check if Admin
    const isAdmin = profile?.role === "admin" || meta.role === "admin";

    // 3. Populate Form Inputs (Hidden or editable)
    document.getElementById("fullname").value = fullName;

    // Background inputs (keep synced for logic if needed)
    const emailField = document.getElementById("email");
    const gradeField = document.getElementById("grade");
    const streamField = document.getElementById("stream");
    const termField = document.getElementById("term");

    if (emailField) emailField.value = email;
    if (gradeField) gradeField.value = academic_year;
    if (termField) termField.value = current_term;
    if (streamField) streamField.value = department;

    // Display Bio
    const bioDisplay = document.getElementById('profileBioDisplay');
    if (bioDisplay) {
        bioDisplay.textContent = profile.bio || 'ضيف بايو';
        bioDisplay.style.opacity = profile.bio ? '1' : '0.7';
        bioDisplay.style.fontStyle = profile.bio ? 'italic' : 'normal';
    }

    // Preview Profile Button
    const previewBtn = document.getElementById('previewProfileBtn');
    if (previewBtn) {
        previewBtn.href = `student-profile.html?id=${currentUser.id}`;
    }


    // 4. Subscription Card Logic (Show for all users)
    const subStart = document.getElementById('subStart');
    const subEnd = document.getElementById('subEnd');
    const planName = document.getElementById('planName');
    const timeLeft = document.getElementById('timeLeft');

    if (subStart) subStart.textContent = profile.subscription_started_at ? new Date(profile.subscription_started_at).toLocaleString('ar-EG') : 'غير محدد';
    if (subEnd) subEnd.textContent = profile.subscription_ends_at ? new Date(profile.subscription_ends_at).toLocaleString('ar-EG') : 'غير محدد';
    if (planName) planName.textContent = profile.last_duration_text || 'خطة مخصصة';

    if (profile.subscription_ends_at && timeLeft) {
        const end = new Date(profile.subscription_ends_at);
        const now = new Date();
        const diff = end - now;

        if (diff > 0) {
            const days = Math.floor(diff / (1000 * 60 * 60 * 24));
            const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
            const mins = Math.floor((diff / (1000 * 60)) % 60);
            timeLeft.textContent = `${days} يوم و ${hours} ساعة و ${mins} دقيقة`;
        } else {
            timeLeft.textContent = 'منتهي';
            timeLeft.style.background = '#ef4444';
            timeLeft.style.color = 'white';
        }
    }


    // 5. Admin UI
    const adminBtn = document.getElementById("adminNavBtn");
    if (isAdmin) {
        // console.log("Admin logged in. All background fields are synced.");
        const adminNotice = document.getElementById("adminNotice");
        if (adminNotice) adminNotice.innerHTML = "<i class='fas fa-info-circle'></i> أنت تمتلك صلاحيات أدمن. الحقول مخفية للتبسيط.";

        if (adminBtn) adminBtn.style.display = 'block';

        const bottomAdminBtn = document.getElementById("bottomAdminBtn");
        if (bottomAdminBtn) bottomAdminBtn.style.display = 'flex';
    } else {
        if (adminBtn) adminBtn.remove();
        const bottomAdminBtn = document.getElementById("bottomAdminBtn");
        if (bottomAdminBtn) bottomAdminBtn.remove();
    }

    // 6. Display Avatar, Name, Email, and Level Badge
    const avatarImg = document.getElementById('profileAvatar');
    const levelBadgeContainer = document.getElementById('profileLevelBadge');
    const displayName = document.getElementById('profileDisplayName');
    const emailDisplay = document.getElementById('profileEmailDisplay');
    const statsGrid = document.getElementById('profileStatsGrid');

    if (avatarImg) {
        // Show cached avatar immediately if available
        const cachedAvatar = localStorage.getItem(`avatar_${currentUser.id}`);
        if (cachedAvatar && !avatarImg.src.includes('ui-avatars.com')) {
            avatarImg.src = cachedAvatar;
        }

        const avatarUrl = profile.avatar_url || generateAvatar(fullName, 'initials');
        avatarImg.src = avatarUrl;

        // Cache the new avatar URL
        if (profile.avatar_url) {
            localStorage.setItem(`avatar_${currentUser.id}`, profile.avatar_url);
        }

        // Update border color based on level
        if (profile.points !== undefined) {
            const levelMeta = applyLevelTheme(avatarImg, profile.points);
            avatarImg.style.border = `5px solid var(--level-color)`;
            avatarImg.style.boxShadow = `var(--level-shadow)`;
        }
    }

    if (levelBadgeContainer && profile.points !== undefined) {
        levelBadgeContainer.innerHTML = createLevelBadge(profile.points, 'medium');
    }

    if (displayName) {
        displayName.textContent = fullName || 'اسم الطالب';
    }

    if (emailDisplay) {
        emailDisplay.textContent = email || 'email@example.com';
    }

    // 6.5. Display Level Progress Bar
    const levelProgressContainer = document.getElementById('profileLevelProgress');
    if (levelProgressContainer && profile.points !== undefined) {
        levelProgressContainer.innerHTML = createLevelProgress(profile.points);
    }

    // 7. Display Stats in Premium Cards
    if (statsGrid) {
        let statsHtml = '';

        // Academic Year Card
        statsHtml += createStatCard(
            'السنة الدراسية',
            getAcademicYearLabel(academic_year) || academic_year || '-',
            'fa-graduation-cap',
            '#10b981',
            'linear-gradient(135deg, #10b981 0%, #059669 100%)'
        );

        // Term Card
        if (current_term) {
            statsHtml += createStatCard(
                'الترم',
                getTermLabel(current_term) || current_term || '-',
                'fa-calendar-alt',
                '#3b82f6',
                'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)'
            );
        }

        // Department Card (for Year 3 & 4)
        if ((academic_year === "third_year" || academic_year === "fourth_year") && department) {
            statsHtml += createStatCard(
                'القسم',
                getDepartmentLabel(department) || department || '-',
                'fa-user-md',
                '#8b5cf6',
                'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)'
            );
        }

        // Points Card
        if (profile.points !== undefined) {
            statsHtml += createStatCard(
                'النقاط',
                `${profile.points || 0} نقطة`,
                'fa-star',
                '#f59e0b',
                'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)'
            );
        }

        statsGrid.innerHTML = statsHtml;

        // Ensure grid centering on small screens
        statsGrid.style.justifyContent = 'center';
    }
}

// Helper function to create stat cards
function createStatCard(label, value, icon, color, gradient) {
    return `
        <div class="stat-card" style="
            background: white;
            border-radius: 16px;
            padding: 1.25rem;
            box-shadow: 0 4px 12px rgba(0,0,0,0.08);
            transition: all 0.3s;
            cursor: default;
            border: 2px solid transparent;
            position: relative;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            min-width: 140px;
        "
        onmouseover="this.style.transform='translateY(-4px)'; this.style.boxShadow='0 8px 20px rgba(0,0,0,0.12)'; this.style.borderColor='${color}'"
        onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 12px rgba(0,0,0,0.08)'; this.style.borderColor='transparent'">
            <!-- Icon Badge -->
            <div style="
                width: 48px;
                height: 48px;
                border-radius: 12px;
                background: ${gradient};
                display: flex;
                align-items: center;
                justify-content: center;
                margin-bottom: 0.75rem;
                box-shadow: 0 4px 12px ${color}40;
            ">
                <i class="fas ${icon}" style="color: white; font-size: 1.25rem;"></i>
            </div>
            
            <!-- Label -->
            <div style="
                color: #64748b;
                font-size: 0.75rem;
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                margin-bottom: 0.25rem;
            ">${label}</div>
            
            <!-- Value -->
            <div style="
                color: #1e293b;
                font-size: 1.1rem;
                font-weight: 700;
                line-height: 1.2;
            ">${value}</div>
        </div>
    `;
}

// Logout
const logoutBtn = document.getElementById("logoutBtn");
if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
        await supabase.auth.signOut();
        window.location.href = "login.html";
    });
}

// Edit Name Button
const editNameBtn = document.getElementById("editNameBtn");
if (editNameBtn) {
    editNameBtn.addEventListener("click", async () => {
        if (!currentProfile || !currentUser) {
            showToast('جاري تحميل البيانات...', 'info');
            return;
        }

        const { value: newName } = await Swal.fire({
            title: 'تعديل الاسم',
            input: 'text',
            inputValue: currentProfile.full_name,
            inputPlaceholder: 'اكتب اسمك الكامل',
            showCancelButton: true,
            confirmButtonText: 'حفظ',
            cancelButtonText: 'إلغاء',
            confirmButtonColor: '#03A9F4',
            inputValidator: (value) => {
                if (!value || value.trim().length < 3) {
                    return 'الاسم يجب أن يكون 3 أحرف على الأقل';
                }
            }
        });
        const infoHTML = `
            <div class="info-item">
                <i class="fas fa-user"></i>
                <span>${profile.full_name || '-'}</span>
            </div>
            <div class="info-item">
                <i class="fas fa-envelope"></i>
                <span>${profile.email || '-'}</span>
            </div>
            <div class="info-item">
                <i class="fas fa-graduation-cap"></i>
                <span>${getAcademicYearLabel(academic_year) || academic_year || '-'
            }</span>
            </div>
            <div class="info-item">
                <i class="fas fa-calendar-alt"></i>
                <span>${getTermLabel(current_term) || current_term || '-'
            }</span>
            </div>
            <div class="info-item">
                <i class="fas fa-building"></i>
                <span>${getDepartmentLabel(department) || department || '-'
            }</span>
            </div>
            <div class="info-item">
                <i class="fas fa-phone"></i>
                <span>${profile.phone || '-'}</span>
            </div>
        `;
        if (newName && newName.trim() !== currentProfile.full_name) {
            try {
                Swal.fire({
                    title: 'جاري الحفظ...',
                    allowOutsideClick: false,
                    didOpen: () => Swal.showLoading()
                });

                const { error } = await supabase
                    .from('profiles')
                    .update({ full_name: newName.trim() })
                    .eq('id', currentUser.id);

                if (error) throw error;

                // Update auth metadata
                await supabase.auth.updateUser({
                    data: { full_name: newName.trim() }
                });

                Swal.fire({
                    icon: 'success',
                    title: 'تم الحفظ بنجاح!',
                    showConfirmButton: false,
                    timer: 1500
                });

                // Update UI
                currentProfile.full_name = newName.trim();
                document.getElementById('profileDisplayName').textContent = newName.trim();
                document.getElementById('fullname').value = newName.trim();

                // Trigger global update
                window.dispatchEvent(new CustomEvent('profileUpdated', { detail: currentProfile }));

            } catch (error) {
                console.error(error);
                Swal.fire('خطأ', 'حصل خطأ في الحفظ', 'error');
            }
        }
    });
}

// Change Avatar Button
const changeAvatarBtn = document.getElementById("changeAvatarBtn");
if (changeAvatarBtn) {
    changeAvatarBtn.addEventListener("click", async () => {
        if (!currentProfile || !currentUser) {
            showToast('جاري تحميل البيانات...', 'info');
            return;
        }

        await openAvatarModal('user', currentUser.id, currentProfile.full_name, (newAvatarUrl) => {
            // Update UI immediately
            const avatarImg = document.getElementById('profileAvatar');
            if (avatarImg) avatarImg.src = newAvatarUrl;

            // Update current profile
            currentProfile.avatar_url = newAvatarUrl;

            // Trigger global profile update event
            window.dispatchEvent(new CustomEvent('profileUpdated', { detail: currentProfile }));
        });
    });

    // Edit Bio Button
    const editBioBtn = document.getElementById('editBioBtn');
    if (editBioBtn) {
        editBioBtn.addEventListener('click', async () => {
            if (!currentUser || !currentProfile) {
                showToast('جاري تحميل البيانات...', 'info');
                return;
            }

            const { value: newBio } = await Swal.fire({
                title: 'تعديل النبذة المختصرة',
                input: 'textarea',
                inputLabel: 'اكتب نبذة مختصرة عنك (اختياري)',
                inputPlaceholder: 'صلي على النبي',
                inputValue: currentProfile.bio || '',
                inputAttributes: {
                    maxlength: 200,
                    'aria-label': 'النبذة المختصرة'
                },
                showCancelButton: true,
                confirmButtonText: 'حفظ',
                cancelButtonText: 'إلغاء',
                confirmButtonColor: 'var(--primary-color)',
                inputValidator: (value) => {
                    if (value && value.length > 200) {
                        return 'النبذة طويلة جداً! الحد الأقصى 200 حرف';
                    }
                }
            });

            if (newBio !== undefined) {
                try {
                    const { error } = await supabase
                        .from('profiles')
                        .update({ bio: newBio || null })
                        .eq('id', currentUser.id);

                    if (error) throw error;

                    // Update UI
                    const bioDisplay = document.getElementById('profileBioDisplay');
                    if (bioDisplay) {
                        bioDisplay.textContent = newBio || 'ضيف بايو';
                        bioDisplay.style.opacity = newBio ? '1' : '0.7';
                        bioDisplay.style.fontStyle = newBio ? 'italic' : 'normal';
                    }

                    currentProfile.bio = newBio;
                    showToast('تم تحديث النبذة بنجاح!', 'success');

                    // Trigger global profile update
                    window.dispatchEvent(new CustomEvent('profileUpdated', { detail: currentProfile }));
                } catch (err) {
                    console.error('Error updating bio:', err);
                    showToast('حدث خطأ أثناء التحديث', 'error');
                }
            }
        });
    }
}

// ==========================
// Privacy Settings Functions
// ==========================

async function loadPrivacySettings() {
    if (!currentProfile) return;

    try {
        const { data: profile } = await supabase
            .from('profiles')
            .select('privacy_avatar, privacy_bio, privacy_stats, privacy_progress, privacy_squad')
            .eq('id', currentProfile.id)
            .single();

        if (profile) {
            // Wait for modal to load if needed
            setTimeout(() => {
                const avatarEl = document.getElementById('privacyAvatar');
                const bioEl = document.getElementById('privacyBio');
                const levelEl = document.getElementById('privacyLevel');
                const squadEl = document.getElementById('privacySquad');

                if (avatarEl) avatarEl.value = profile.privacy_avatar || 'public';
                if (bioEl) bioEl.value = profile.privacy_bio || 'public';
                // Consolidate level/stats/progress settings
                if (levelEl) levelEl.value = profile.privacy_stats || 'public';
                if (squadEl) squadEl.value = profile.privacy_squad || 'public';
            }, 100);
        }
    } catch (err) {
        console.error('Error loading privacy settings:', err);
    }
}

window.savePrivacySettings = async function () {
    if (!currentProfile) return;

    const levelValue = document.getElementById('privacyLevel').value;

    const privacySettings = {
        privacy_avatar: document.getElementById('privacyAvatar').value,
        privacy_bio: document.getElementById('privacyBio').value,
        privacy_stats: levelValue,
        privacy_progress: levelValue,
        privacy_squad: document.getElementById('privacySquad').value
    };

    try {
        const { error } = await supabase
            .from('profiles')
            .update(privacySettings)
            .eq('id', currentProfile.id);

        if (error) throw error;

        // Close modal if it exists
        if (typeof closePrivacyModal === 'function') {
            closePrivacyModal();
        }

        showToast('تم حفظ إعدادات الخصوصية بنجاح', 'success');
    } catch (err) {
        console.error('Error saving privacy settings:', err);
        showToast('حدث خطأ أثناء الحفظ', 'error');
    }
};

// Modal control functions
window.openPrivacyModal = function () {
    const modal = document.getElementById('privacyModal');
    if (modal) {
        modal.style.display = 'block';
        document.body.style.overflow = 'hidden';
        loadPrivacySettings();
    }
};

window.closePrivacyModal = function () {
    const modal = document.getElementById('privacyModal');
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = 'auto';
    }
};

// Level Guide Button
const showLevelGuideBtn = document.getElementById('showLevelGuideBtn');
if (showLevelGuideBtn) {
    showLevelGuideBtn.addEventListener('click', () => {
        const legend = getLevelLegend();

        let html = `
            <div style="text-align: right; direction: rtl; font-family: 'Cairo', sans-serif;">
                <div style="display: flex; flex-direction: column; gap: 6px; max-height: 380px; overflow-y: auto; padding-left: 4px; scrollbar-width: thin;">
        `;

        legend.reverse().forEach(tier => {
            html += `
                <div style="
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 8px 12px;
                    background: white;
                    border-radius: 10px;
                    border: 1px solid #f1f5f9;
                    transition: border-color 0.2s;
                " onmouseover="this.style.borderColor='${tier.color}60'"
                   onmouseout="this.style.borderColor='#f1f5f9'">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <span style="
                            font-size: 1rem;
                            width: 28px;
                            height: 28px;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            background: ${tier.color}15;
                            border-radius: 8px;
                        ">${tier.icon}</span>
                        <div style="font-weight: 700; color: #334155; font-size: 0.85rem;">${tier.name}</div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 4px;">
                        <span style="font-weight: 800; color: ${tier.color}; font-size: 0.95rem;">${tier.points.toLocaleString()}</span>
                        <span style="font-size: 0.65rem; color: #94a3b8; font-weight: 600;">XP</span>
                    </div>
                </div>
            `;
        });

        html += `
                </div>
                <div style="
                    margin-top: 1rem;
                    padding: 10px;
                    background: #f8fafc;
                    border-radius: 8px;
                    border: 1px dashed #e2e8f0;
                    color: #94a3b8;
                    font-size: 0.75rem;
                    text-align: center;
                ">
                    بتتحسب كده: (المستوى × المستوى) × ${LEVEL_MULTIPLIER}
                </div>
            </div>
        `;

        Swal.fire({
            title: '<span style="font-weight: 800; color: #1e293b; font-size: 1.1rem;"> المستويات</span>',
            html: html,
            showConfirmButton: true,
            confirmButtonText: 'إغلاق',
            confirmButtonColor: '#03A9F4',
            width: '360px',
            padding: '1.25rem',
            background: '#ffffff',
            borderRadius: '20px'
        });
    });
}

// Initialize
async function init() {
    await checkAuth();
    await loadProfile();
}

init();
