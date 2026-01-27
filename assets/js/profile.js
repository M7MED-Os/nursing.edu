import { supabase } from "./supabaseClient.js";
import { showToast } from "./utils.js";
import { GRADES, TERMS, STREAMS } from "./constants.js";
import { setButtonLoading } from "./utils/dom.js";
import { openAvatarModal } from "./avatar-modal.js";
import { generateAvatar } from "./avatars.js";
import { createLevelBadge } from "./level-badge.js";

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

    // 2. Data to use
    const fullName = profile.full_name || meta.full_name || "";
    const email = currentUser.email || "";
    const grade = profile?.grade || meta.grade || "";
    const term = profile?.term || meta.term || "";
    const stream = profile?.stream || meta.stream || "";

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
    if (gradeField) {
        gradeField.value = grade;
        handleGradeChange(grade);
    }
    if (termField) termField.value = term;
    if (streamField) streamField.value = stream;

    // 4. Populate Info Display (The plain text view)
    const infoRows = document.getElementById("infoRows");
    if (infoRows) {
        let infoHtml = `
            <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #f1f5f9; padding-bottom: 0.5rem;">
                <span style="color: #64748b;">البريد الإلكتروني:</span>
                <span style="font-weight: 500;">${email}</span>
            </div>
            <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #f1f5f9; padding-bottom: 0.5rem;">
                <span style="color: #64748b;">السنة الدراسية:</span>
                <span style="font-weight: 500;">${GRADES[grade] || grade || '-'}</span>
            </div>
        `;

        // Show Term for all years
        if (term) {
            infoHtml += `
            <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #f1f5f9; padding-bottom: 0.5rem;">
                <span style="color: #64748b;">الترم:</span>
                <span style="font-weight: 500;">${TERMS[term] || term || '-'}</span>
            </div>`;
        }

        // Show Department for Year 3 & 4
        if ((grade === "3" || grade === "4") && stream) {
            infoHtml += `
            <div style="display: flex; justify-content: space-between;">
                <span style="color: #64748b;">القسم:</span>
                <span style="font-weight: 500;">${STREAMS[stream] || stream || '-'}</span>
            </div>`;
        }
        infoRows.innerHTML = infoHtml;
    }


    // 5. Subscription Card Logic
    if (profile && profile.role !== 'admin') {
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
    } else {
        const card = document.getElementById('subscriptionCard');
        if (card) card.style.display = 'none';
    }

    // Special Admin UI override (Optional: could show a button to reveal fields)
    const adminBtn = document.getElementById("adminNavBtn");
    if (isAdmin) {
        console.log("Admin logged in. All background fields are synced.");
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

    // 6. Display Avatar and Level Badge
    const avatarImg = document.getElementById('profileAvatar');
    const levelBadgeContainer = document.getElementById('profileLevelBadge');

    if (avatarImg) {
        const avatarUrl = profile.avatar_url || generateAvatar(fullName, 'initials');
        avatarImg.src = avatarUrl;
    }

    if (levelBadgeContainer && profile.points !== undefined) {
        levelBadgeContainer.innerHTML = createLevelBadge(profile.points, 'medium');
    }
}

// ==========================
// 4. Form Logic
// ==========================

function handleGradeChange(gradeVal) {
    const termGroup = document.getElementById("termGroup");
    const streamGroup = document.getElementById("streamGroup");

    // Reset displays
    termGroup.style.display = "none";
    streamGroup.style.display = "none";

    // All years have terms
    if (gradeVal === "1" || gradeVal === "2" || gradeVal === "3" || gradeVal === "4") {
        termGroup.style.display = "block";
    }

    // Years 3 & 4 also have departments
    if (gradeVal === "3" || gradeVal === "4") {
        streamGroup.style.display = "block";
    }
}

const gradeSelect = document.getElementById("grade");
if (gradeSelect) {
    gradeSelect.addEventListener("change", (e) => handleGradeChange(e.target.value));
}

const profileForm = document.getElementById("profileForm");
if (profileForm) {
    profileForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        const submitBtn = profileForm.querySelector('button[type="submit"]');
        setButtonLoading(submitBtn, true, 'جاري الحفظ...');

        const full_name = document.getElementById("fullname").value.trim();
        const grade = document.getElementById("grade").value;
        const term = document.getElementById("term").value;
        const stream = document.getElementById("stream").value;

        try {
            // Validation
            if (!full_name) throw new Error("الاسم مطلوب");
            if (!grade) throw new Error("السنة الدراسية مطلوبة");

            // Prepare Data
            const updates = {
                id: currentUser.id,
                full_name,
                email: currentUser.email,
                updated_at: new Date()
            };

            // Double Check Admin Status before allowing sensitive field updates
            const meta = currentUser.user_metadata || {};
            const isAdmin = meta.role === "admin" || meta.is_admin === true;

            if (isAdmin) {
                // Admin can update everything
                updates.grade = grade;

                // All years have terms
                updates.term = term || null;

                // Years 3 & 4 have departments
                if (grade === "3" || grade === "4") {
                    updates.stream = stream || null;
                } else {
                    updates.stream = null;
                }
            } else {
                // Student cannot change grade or stream - these fields are ignored or kept from original profile
                console.warn("Security Check: Student attempt to bypass field lock. Ignoring sensitive changes.");
            }

            // 1. Update 'profiles' table
            const { error: dbError } = await supabase
                .from('profiles')
                .upsert(updates);

            if (dbError) throw dbError;

            // 2. Update Auth Metadata (Best effort, keeps session in sync)
            const { error: authError } = await supabase.auth.updateUser({
                data: {
                    full_name,
                    grade,
                    term: updates.term,
                    stream: updates.stream
                }
            });

            if (authError) console.warn("Auth metadata update failed:", authError);

            showToast("تم تحديث البيانات بنجاح", "success");

            // Optional: Redirect to dashboard after short delay
            setTimeout(() => {
                // window.location.href = "dashboard.html"; 
            }, 1000);

        } catch (error) {
            console.error("Update error:", error);
            showToast(error.message || "حدث خطأ أثناء الحفظ", "error");
        } finally {
            setButtonLoading(submitBtn, false);
        }
    });
}

// Logout
const logoutBtn = document.getElementById("logoutBtn");
if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
        await supabase.auth.signOut();
        window.location.href = "login.html";
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
}

// Initialize
async function init() {
    await checkAuth();
    await loadProfile();
}

init();
