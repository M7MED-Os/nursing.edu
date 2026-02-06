import { supabase } from "./supabaseClient.js";
import { showToast, showInputError, clearInputError, getCache, setCache } from "./utils.js";
import { APP_CONFIG, ACADEMIC_YEARS, DEPARTMENTS, TERMS } from "./constants.js";
import { showSuccessAlert, showWarningAlert, showErrorAlert, showInputDialog } from "./utils/alerts.js";
import { validateEmail, validatePassword, validatePasswordConfirmation, validateRequired, validateSelect } from "./utils/validators.js";
import { setButtonLoading } from "./utils/dom.js";
import { PRESENCE_UPDATE_INTERVAL, REGISTRATION_REDIRECT_DELAY, SUCCESS_REDIRECT_DELAY } from "./constants/timings.js";

// ==========================
// 1. Auth State Management
// ==========================

// Global state
let currentSession = null;
let currentProfile = null;

/**
 * Enhanced Auth Check
 * Returns { user, profile } or redirects to login
 */
export async function checkAuth(options = { forceRefresh: false }) {
    try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (sessionError || !session) {
            handleUnauthorizedAccess();
            return null;
        }

        currentSession = session;
        const userId = session.user.id;

        // 1. Try Cache First for Instant UI
        let profile = getCache(`profile_${userId}`);

        // 2. Background Revalidation OR Initial Fetch
        if (!profile || options.forceRefresh) {
            profile = await refreshUserProfile(userId);
        } else {
            // Revalidate in background without blocking
            refreshUserProfile(userId);
        }

        currentProfile = profile;
        handleAccessControl(profile);
        updateUserPresence(userId);

        // 3. SECURE REALTIME SYNC (The "Senior" way)
        initRealtimeSync(userId);

        return { user: session.user, profile };
    } catch (err) {
        console.error("Auth Exception:", err);
        return null;
    }
}

/**
 * Single Source of Truth: Realtime Subscription
 */
let profileSubscription = null;
function initRealtimeSync(userId) {
    if (profileSubscription) return; // Already subscribed



    profileSubscription = supabase
        .channel(`public:profiles:id=eq.${userId}`)
        .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'profiles',
            filter: `id=eq.${userId}`
        }, (payload) => {

            const newProfile = payload.new;

            // Central Update: Update Cache + Dispatch Event
            setCache(`profile_${userId}`, newProfile, APP_CONFIG.CACHE_TIME_PROFILE);
            window.dispatchEvent(new CustomEvent('profileUpdated', { detail: newProfile }));
        })
        .subscribe();
}

/**
 * Centrally refreshes and caches user profile
 */
export async function refreshUserProfile(userId) {
    const { data: profile, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
    if (error) return null;

    setCache(`profile_${userId}`, profile, APP_CONFIG.CACHE_TIME_PROFILE);

    // Trigger Global Event for UI updates
    window.dispatchEvent(new CustomEvent('profileUpdated', { detail: profile }));

    return profile;
}

function handleUnauthorizedAccess() {
    const protectedPages = ["dashboard.html", "subject.html", "leaderboard.html", "profile.html", "squad.html"];
    const currentPage = window.location.pathname.split("/").pop();
    if (protectedPages.includes(currentPage) || currentPage === "") {
        window.location.href = "login.html";
    }
}

function handleAccessControl(profile) {
    if (!profile) return;

    const currentPage = window.location.pathname.split("/").pop();
    const now = new Date();
    const expiry = profile.subscription_ends_at ? new Date(profile.subscription_ends_at) : null;
    const isExpired = expiry && now > expiry;
    const isActive = profile.is_active;

    // PROACTIVE EXPIRY: Update database if subscription expired but is_active is still true
    if (isExpired && isActive && profile.role !== 'admin') {
        console.log("Subscription expired: Updating status...");
        supabase.from('profiles')
            .update({ is_active: false })
            .eq('id', profile.id)
            .then(() => {
                profile.is_active = false;
                // Force reload or redirect to dashboard to trigger access control if needed
                if (window.location.pathname.includes('dashboard.html')) {
                    window.location.reload();
                }
            })
            .catch(e => console.error("Auto-expiry update failed", e));
    }

    const hasPremium = (profile.role === 'admin') || (profile.is_active && !isExpired);

    // Redirect logged in users away from auth pages
    const authPages = ["login.html", "register.html"];
    if (authPages.includes(currentPage)) {
        window.location.href = "dashboard.html";
    }

    // Pending page auto-redirect for premium users
    if (currentPage === "pending.html" && hasPremium) {
        window.location.href = "dashboard.html";
    }

    // Expiry Warnings (show on dashboard for premium users nearing expiry)
    if (currentPage === "dashboard.html" && expiry && !isExpired) {
        const diffMs = expiry - now;
        const diffDays = diffMs / (1000 * 60 * 60 * 24);
        if (diffDays <= 3) showSubscriptionWarning(expiry);
    }
}

function updateUserPresence(userId) {
    const lastUpdate = sessionStorage.getItem('last_presence_update');
    const now = new Date().getTime();
    if (!lastUpdate || now - parseInt(lastUpdate) > PRESENCE_UPDATE_INTERVAL) {
        supabase.from('profiles').update({ last_seen: new Date().toISOString() }).eq('id', userId)
            .then(() => sessionStorage.setItem('last_presence_update', now.toString()))
            .catch(e => console.warn("Presence update failed", e));
    }
}


export function showSubscriptionWarning(expiry) {
    const parent = document.querySelector('header.dashboard-header .container') || document.body;

    // Check if already exists
    if (document.getElementById('expiryWarning')) return;

    // Add modern styles if not already present
    if (!document.getElementById('expiryWarningStyles')) {
        const style = document.createElement('style');
        style.id = 'expiryWarningStyles';
        style.textContent = `
            @keyframes slideInDown {
                from { transform: translate(-50%, -100%); opacity: 0; }
                to { transform: translate(-50%, 0); opacity: 1; }
            }
            .expiry-alert {
                position: fixed;
                top: 20px;
                left: 50%;
                transform: translateX(-50%);
                width: calc(100% - 30px);
                max-width: 600px;
                background: rgba(255, 255, 255, 0.95);
                backdrop-filter: blur(10px);
                border: 1px solid rgba(251, 140, 0, 0.3);
                border-right: 6px solid #fb8c00;
                border-radius: 20px;
                padding: 1rem 1.25rem;
                display: flex;
                align-items: center;
                gap: 16px;
                box-shadow: 0 15px 35px rgba(251, 140, 0, 0.15), 0 5px 15px rgba(0, 0, 0, 0.05);
                z-index: 10000;
                animation: slideInDown 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                transition: all 0.4s ease;
            }
            .expiry-alert-icon {
                background: linear-gradient(135deg, #fb8c00 0%, #ffab40 100%);
                color: white;
                width: 48px;
                height: 48px;
                min-width: 48px;
                border-radius: 14px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 1.5rem;
                box-shadow: 0 4px 12px rgba(251, 140, 0, 0.3);
            }
            .expiry-alert-text {
                flex: 1;
            }
            .expiry-alert-text h4 {
                margin: 0;
                font-size: 1.05rem;
                font-weight: 800;
                color: #e65100;
            }
            .expiry-alert-text p {
                margin: 4px 0 0;
                font-size: 0.85rem;
                color: #ef6c00;
                opacity: 0.9;
            }
            .expiry-alert-btn {
                background: #fb8c00;
                color: white !important;
                padding: 10px 20px;
                border-radius: 14px;
                text-decoration: none;
                font-size: 0.9rem;
                font-weight: 700;
                transition: 0.3s;
                white-space: nowrap;
                display: inline-block;
                box-shadow: 0 4px 10px rgba(251, 140, 0, 0.2);
            }
            .expiry-alert-btn:hover {
                background: #f57c00;
                transform: translateY(-2px);
                box-shadow: 0 6px 15px rgba(251, 140, 0, 0.3);
            }
            .expiry-alert-close {
                background: rgba(230, 81, 0, 0.05);
                border: none;
                color: #e65100;
                cursor: pointer;
                padding: 8px;
                border-radius: 10px;
                font-size: 1.1rem;
                opacity: 0.6;
                transition: 0.2s;
            }
            .expiry-alert-close:hover {
                opacity: 1;
                background: rgba(230, 81, 0, 0.1);
            }

            @media (max-width: 500px) {
                .expiry-alert {
                    flex-direction: column;
                    text-align: center;
                    padding: 1.5rem;
                    gap: 12px;
                }
                .expiry-alert-icon {
                    margin: 0 auto;
                }
                .expiry-alert-btn {
                    width: 100%;
                }
                .expiry-alert-close {
                    position: absolute;
                    top: 10px;
                    left: 10px;
                }
            }
        `;
        document.head.appendChild(style);
    }

    const dateStr = expiry.toLocaleDateString('ar-EG', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        hour: 'numeric',
        minute: 'numeric'
    });

    const banner = document.createElement('div');
    banner.id = 'expiryWarning';
    banner.className = 'expiry-alert';

    banner.innerHTML = `
        <div class="expiry-alert-icon">
            <i class="fas fa-hourglass-half"></i>
        </div>
        <div class="expiry-alert-text">
            <h4>اشتراكك قرب يخلص! ⏳</h4>
            <p>اشتراكك هيخلص في: <b>${dateStr}</b></p>
        </div>
        <a href="pending.html" class="expiry-alert-btn">جدد الاشتراك</a>
        <button id="closeExpiryWarning" class="expiry-alert-close">
            <i class="fas fa-times"></i>
        </button>
    `;

    document.body.appendChild(banner);

    // Add close functionality with animation
    document.getElementById('closeExpiryWarning').addEventListener('click', () => {
        banner.style.opacity = '0';
        banner.style.transform = 'translate(-50%, -20px)';
        setTimeout(() => banner.remove(), 400);
    });
}



// ==========================
// 2. Logout
// ==========================

export async function handleLogout(e) {
    if (e) e.preventDefault();
    const { error } = await supabase.auth.signOut();
    if (error) {
        console.error("Logout error:", error);
    } else {
        window.location.href = "login.html";
    }
}

// Function to attach logout listeners
function initLogout() {
    const logoutBtn = document.getElementById("logoutBtn");
    if (logoutBtn) logoutBtn.addEventListener("click", handleLogout);

    // const bottomLogoutBtn = document.getElementById("bottomLogoutBtn");
    // if (bottomLogoutBtn) bottomLogoutBtn.addEventListener("click", handleLogout);

    const pwaLogoutBtn = document.getElementById("pwaLogoutBtn");
    if (pwaLogoutBtn) pwaLogoutBtn.addEventListener("click", handleLogout);
}

// Initialize on load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLogout);
} else {
    initLogout();
}

// ==========================

// ==========================
// 5. Registration Form
// ==========================

const registerForm = document.getElementById("registerForm");
if (registerForm) {
    const academicYearSelect = document.getElementById("academicYear");
    const termGroup = document.getElementById("termGroup");
    const departmentGroup = document.getElementById("departmentGroup");

    // Dynamic field visibility & Options Population
    if (academicYearSelect) {
        academicYearSelect.addEventListener("change", () => {
            const academicYear = academicYearSelect.value;
            const departmentSelect = document.getElementById("department");

            // Reset Department Options
            departmentSelect.innerHTML = '<option value="" disabled selected>اختر القسم</option>';

            // Show term for all years
            if (academicYear) {
                termGroup.style.display = "block";

                // Show department only for third_year and fourth_year
                if (academicYear === "third_year") {
                    departmentGroup.style.display = "block";

                    // Third year departments: Pediatric and Maternity only
                    const thirdYearDepts = [
                        { value: "pediatric", label: "تمريض أطفال" },
                        { value: "maternity", label: "تمريض نسا وتوليد" }
                    ];

                    thirdYearDepts.forEach(dept => {
                        const option = document.createElement('option');
                        option.value = dept.value;
                        option.textContent = dept.label;
                        departmentSelect.appendChild(option);
                    });
                } else if (academicYear === "fourth_year") {
                    departmentGroup.style.display = "block";

                    // Fourth year departments: Psychiatric and Community only
                    const fourthYearDepts = [
                        { value: "psychiatric", label: "تمريض نفسية" },
                        { value: "community", label: "تمريض إدارة" }
                    ];

                    fourthYearDepts.forEach(dept => {
                        const option = document.createElement('option');
                        option.value = dept.value;
                        option.textContent = dept.label;
                        departmentSelect.appendChild(option);
                    });
                } else {
                    // First and second year: hide department field (will default to "general")
                    departmentGroup.style.display = "none";
                }
            } else {
                termGroup.style.display = "none";
                departmentGroup.style.display = "none";
            }
        });
    }

    registerForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        const full_name_input = document.getElementById("fullname");
        const email_input = document.getElementById("email");
        const password_input = document.getElementById("password");
        const academicYear_input = document.getElementById("academicYear");
        const currentTerm_input = document.getElementById("currentTerm");
        const department_input = document.getElementById("department");

        const full_name = full_name_input.value.trim();
        const email = email_input.value.trim();
        const password = password_input.value;
        const academic_year = academicYear_input.value;
        const current_term = currentTerm_input.value;
        // Set department: "general" for first/second year, selected value for third/fourth year
        const department = (academic_year === "first_year" || academic_year === "second_year")
            ? "general"
            : department_input.value;

        let isValid = true;

        // Validate full name
        const fullNameValidation = validateRequired(full_name, 'اسمك بالكامل');
        if (!fullNameValidation.isValid) {
            showInputError(full_name_input, fullNameValidation.error);
            isValid = false;
        }

        // Validate email
        const emailValidation = validateEmail(email);
        if (!emailValidation.isValid) {
            showInputError(email_input, emailValidation.error);
            isValid = false;
        }

        // Validate password
        const passwordValidation = validatePassword(password);
        if (!passwordValidation.isValid) {
            showInputError(password_input, passwordValidation.error);
            isValid = false;
        }

        // Validate academic year
        const academicYearValidation = validateSelect(academic_year, 'السنة الدراسية');
        if (!academicYearValidation.isValid) {
            showInputError(academicYear_input, academicYearValidation.error);
            isValid = false;
        } else {
            // Validate Term (Required for all years)
            const termValidation = validateSelect(current_term, 'الترم');
            if (!termValidation.isValid) {
                showInputError(currentTerm_input, termValidation.error);
                isValid = false;
            }

            // Validate Department (Required for Year 3 & 4)
            if (academic_year === "third_year" || academic_year === "fourth_year") {
                const departmentValidation = validateSelect(department, 'القسم');
                if (!departmentValidation.isValid) {
                    showInputError(department_input, departmentValidation.error);
                    isValid = false;
                }
            }
        }

        // Validate Password Confirmation
        const confirm_password_input = document.getElementById("confirmPassword");
        if (confirm_password_input) {
            const confirm_password = confirm_password_input.value;
            const confirmValidation = validatePasswordConfirmation(password, confirm_password);
            if (!confirmValidation.isValid) {
                showInputError(confirm_password_input, confirmValidation.error);
                isValid = false;
            }
        }

        if (!isValid) return;

        const submitBtn = registerForm.querySelector('button[type="submit"]');
        setButtonLoading(submitBtn, true, 'جاري التسجيل...');

        try {
            const { data, error } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    data: {
                        full_name,
                        academic_year,
                        current_term: current_term || null,
                        department: department || null,
                        show_on_leaderboard: true,
                    },
                    emailRedirectTo: `${window.location.origin}/login.html`
                },
            });

            if (error) {
                if (error.message.includes("User already registered") || error.status === 422) {
                    throw new Error("الإيميل ده متسجل عندنا قبل كده، جرب تسجل دخول");
                }
                throw error;
            }

            // Note: If email confirmation is ON, data.user might exist but data.session will be null
            if (data?.user && data?.user?.identities?.length === 0) {
                // This happens in some Supabase configs when user already exists but discovery is off
                throw new Error("الإيميل ده متسجل عندنا قبل كده، جرب تسجل دخول");
            }

            showToast("تم التسجيل بنجاح! تحقق من إيميلك لتفعيل الحساب.", "success");
            setTimeout(() => {
                window.location.href = "login.html";
            }, 2000);
        } catch (error) {
            console.error("Registration error:", error);
            let userMsg = error.message;
            if (userMsg.includes("rate limit")) userMsg = "حاولت كتير في وقت قصير، استنى دقايق وجرب تاني";

            showToast(userMsg || "حدث خطأ أثناء التسجيل", "error");
        } finally {
            setButtonLoading(submitBtn, false);
        }
    });
}

// ==========================
// 6. Login Form
// ==========================

const loginForm = document.getElementById("loginForm");
if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        const email_input = document.getElementById("email");
        const password_input = document.getElementById("password");

        const email = email_input.value.trim();
        const password = password_input.value;

        let isValid = true;

        // Validate email
        const emailValidation = validateEmail(email);
        if (!emailValidation.isValid) {
            showInputError(email_input, emailValidation.error);
            isValid = false;
        }

        // Validate password
        const passwordValidation = validatePassword(password);
        if (!passwordValidation.isValid) {
            showInputError(password_input, passwordValidation.error);
            isValid = false;
        }

        if (!isValid) return;

        const submitBtn = loginForm.querySelector('button[type="submit"]');
        setButtonLoading(submitBtn, true, 'جاري تسجيل الدخول...');

        try {
            const { data, error } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (error) {
                if (error.message.includes("Email not confirmed")) {
                    // Show a specialized SweetAlert with a resend button
                    Swal.fire({
                        icon: 'warning',
                        title: 'تفعيل الحساب',
                        text: 'لازم تفعل حسابك الأول من الإيميل اللي وصلك.',
                        footer: `<button class="btn btn-outline btn-sm" onclick="resendVerification('${email}')">إعادة إرسال إيميل التفعيل</button>`,
                        confirmButtonText: 'حسناً'
                    });
                    return;
                } else if (error.message.includes("Invalid login credentials")) {
                    throw new Error("الإيميل أو كلمة السر غلط");
                }
                throw error;
            }

            showToast("تم تسجيل الدخول بنجاح!", "success");
            setTimeout(() => {
                window.location.href = "dashboard.html";
            }, 1000);
        } catch (error) {
            console.error("Login error:", error);
            let userMsg = error.message;
            if (userMsg.includes("rate limit")) userMsg = "براحة شوية! حاولت كتير في وقت قصير، استنى دقايق وجرب تاني";
            showToast(userMsg || "حدث خطأ أثناء تسجيل الدخول", "error");
        } finally {
            setButtonLoading(submitBtn, false);
        }
    });
}

/**
 * Resend Verification Email
 */
window.resendVerification = async (email) => {
    try {
        const { error } = await supabase.auth.resend({
            type: 'signup',
            email: email,
            options: {
                emailRedirectTo: `${window.location.origin}/login.html`
            }
        });

        if (error) throw error;

        Swal.fire({
            icon: 'success',
            title: 'تم الإرسال',
            text: 'تم إعادة إرسال رابط التفعيل لإيميلك بنجاح!',
            confirmButtonText: 'ممتاز'
        });
    } catch (err) {
        console.error("Resend error:", err);
        let userMsg = err.message;
        if (userMsg.includes("rate limit")) userMsg = "تم إرسال إيميلات كتير، استنى دقايق وجرب تاني";
        showToast(userMsg || "فشل إعادة الإرسال", "error");
    }
};

// ==========================
// 7. Forgot Password (طلب استعادة)
// ==========================
const forgotForm = document.getElementById("forgotPasswordForm");
if (forgotForm) {
    forgotForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const emailInput = document.getElementById("email");
        const email = emailInput.value.trim();

        if (!email) {
            showInputError(emailInput, "برجاء كتابة البريد الإلكتروني");
            return;
        }

        const btn = forgotForm.querySelector('button[type="submit"]');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الإرسال...';

        try {
            const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: `${window.location.origin}/reset-password.html`,
            });

            if (error) throw error;

            showToast("تم إرسال رابط الاستعادة لإيميلك بنجاح!", "success");
            emailInput.value = "";
        } catch (err) {
            console.error("Reset request error:", err);
            showToast(err.message || "حدث خطأ أثناء الإرسال", "error");
        } finally {
            btn.disabled = false;
            btn.textContent = "إرسال رابط إعادة التعيين";
        }
    });
}

// ==========================
// 8. Reset Password (تعيين الكلمة الجديدة)
// ==========================
const resetForm = document.getElementById("resetPasswordForm");
if (resetForm) {
    resetForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const passInput = document.getElementById("newPassword");
        const confirmInput = document.getElementById("confirmPassword");

        const password = passInput.value;
        const confirm = confirmInput.value;

        let isValid = true;
        if (password.length < 6) {
            showInputError(passInput, "كلمة السر يجب أن تكون 6 أحرف على الأقل");
            isValid = false;
        }
        if (password !== confirm) {
            showInputError(confirmInput, "كلمات السر غير متطابقة");
            isValid = false;
        }

        if (!isValid) return;

        const btn = resetForm.querySelector('button[type="submit"]');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري التحديث...';

        try {
            const { error } = await supabase.auth.updateUser({ password });
            if (error) throw error;

            showToast("تم تحديث كلمة السر بنجاح!", "success");

            // Check if user is logged in to decide where to redirect
            const { data: { session } } = await supabase.auth.getSession();
            setTimeout(() => {
                if (session) {
                    window.location.href = "profile.html";
                } else {
                    window.location.href = "login.html";
                }
            }, 2000);
        } catch (err) {
            console.error("Update password error:", err);
            showToast(err.message || "فشل تحديث كلمة السر", "error");
        } finally {
            btn.disabled = false;
            btn.textContent = "تأكيد كلمة المرور";
        }
    });
}

// ==========================
// 9. Dashboard - Load User Profile
// ==========================

async function loadUserProfile() {
    try {
        const authData = await checkAuth();
        if (!authData) return;

        const { user, profile } = authData;

        // Initial Render
        updateDashboardUI(profile || user.user_metadata);

        // Listen for background updates from auth.js
        window.addEventListener('profileUpdated', (e) => {
            updateDashboardUI(e.detail);
        });

        // Parallel Execution for other components
        renderSubjects(profile || user.user_metadata);
        loadUserDashboardData(user.id);

    } catch (err) {
        console.error("Dashboard Load Error:", err);
    } finally {
        const loadingEl = document.getElementById("loading");
        if (loadingEl) {
            loadingEl.style.opacity = "0";
            setTimeout(() => {
                if (loadingEl.parentNode) loadingEl.remove();
            }, 500);
        }
    }
}

function updateDashboardUI(profile) {
    if (!profile) return;

    // 1. Name
    const firstName = (profile.full_name || "الطالب").split(" ")[0];
    const nameEl = document.getElementById("studentName");
    if (nameEl) nameEl.textContent = firstName;

    // 2. Points (Unified Source)
    const pointsEl = document.getElementById('stats-points');
    if (pointsEl) pointsEl.textContent = profile.points || 0;

    // 3. Admin Access
    const isAdmin = profile.role === 'admin';
    const adminNavBtn = document.getElementById('adminNavBtn');
    const bottomAdminBtn = document.getElementById('bottomAdminBtn');

    if (isAdmin) {
        if (adminNavBtn) adminNavBtn.style.display = 'block';
        if (bottomAdminBtn) bottomAdminBtn.style.display = 'flex';
    } else {
        if (adminNavBtn) adminNavBtn.remove();
        if (bottomAdminBtn) bottomAdminBtn.remove();
    }
}


// fetchLeaderboard is now handled in leaderboard.html via direct script


async function loadUserDashboardData(userId) {
    try {
        const cacheKey = `user_stats_${userId}`;
        const cachedStats = getCache(cacheKey);

        // 1. Show Cache for Instant UI
        if (cachedStats) {
            renderStatsUI(cachedStats);
        }

        // 2. Background Revalidation
        const { data: rpcData, error } = await supabase.rpc('get_user_stats', { p_user_id: userId });
        if (error) throw error;

        const freshStats = rpcData[0];
        if (freshStats) {
            // 3. Update UI only if data is different
            if (!cachedStats || JSON.stringify(cachedStats) !== JSON.stringify(freshStats)) {
                renderStatsUI(freshStats);
                setCache(cacheKey, freshStats, APP_CONFIG.CACHE_TIME_STATS);
            }
        }
    } catch (err) {
        console.error("Dashboard Stats Error:", err);
    }

    try {
        const { data: recentResults, error: historyError } = await supabase
            .from('results')
            .select(`
                *,
                exams (
                    title,
                    subject_id,
                    chapter_id,
                    lesson_id,
                    chapters:chapter_id (title),
                    lessons:lesson_id (
                        title,
                        chapters:chapter_id (title)
                    )
                )
            `)
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(5);

        if (historyError) throw historyError;

        if (recentResults && recentResults.length > 0) {
            const resultsSection = document.getElementById('resultsSection');
            if (resultsSection) resultsSection.style.display = 'block';

            const examGroups = {};
            recentResults.forEach(result => {
                if (!examGroups[result.exam_id]) examGroups[result.exam_id] = [];
                examGroups[result.exam_id].push(result);
            });

            renderResultsList(examGroups, recentResults);
        }
    } catch (err) {
        console.error("Dashboard History Error:", err);
    }
}

function renderStatsUI(stats) {
    const qEl = document.getElementById('stats-questions');
    const eEl = document.getElementById('stats-exams');
    const aEl = document.getElementById('stats-accuracy');

    const accuracy = stats.total_possible_questions > 0
        ? Math.round((stats.total_solved_questions / stats.total_possible_questions) * 100)
        : 0;

    if (qEl) qEl.textContent = stats.total_solved_questions || 0;
    if (eEl) eEl.textContent = stats.total_exams || 0;
    if (aEl) aEl.textContent = `%${accuracy}`;

    // Also update bottom summary cards
    renderResultsStats(stats.total_exams, Math.round(stats.avg_percentage), Math.round(stats.best_percentage));
}


// Helper to keep UI update logic DRY
function updateNameUI(name) {
    const firstName = name.split(" ")[0];
    const studentNameEl = document.getElementById("studentName");

    if (studentNameEl) studentNameEl.textContent = firstName;
    // navUserName text is now static "البروفايل" as per user request
}

// ==========================
// 10. Dynamic Subject Rendering (Database-Driven)
// ==========================

async function loadSubjectsFromDB(academic_year) {
    // Use academic_year directly (no more mapping needed)
    const cacheKey = academic_year ? `subjects_${academic_year}` : 'subjects_all';
    const cachedData = getCache(cacheKey);
    if (cachedData) return cachedData;

    let query = supabase
        .from('subjects')
        .select('*')
        .eq('is_active', true)
        .order('order_index');

    if (academic_year) {
        // Query using new 'academic_year' column
        query = query.eq('academic_year', academic_year);
    }

    const { data: subjects, error } = await query;

    if (error) {
        console.error('Error loading subjects:', error);
        return [];
    }

    setCache(cacheKey, subjects, APP_CONFIG.CACHE_TIME_SUBJECTS); // Cache subjects for 24 hours
    return subjects;
}

async function renderSubjects(userMetadata) {
    const grid = document.getElementById("subjectsGrid");
    if (!grid) return;

    grid.innerHTML = ""; // Clear content

    // Use new column names with fallback to old names for backward compatibility
    const academic_year = userMetadata?.academic_year;
    const department = userMetadata?.department;
    const current_term = userMetadata?.current_term;

    if (!academic_year || !current_term) {
        grid.innerHTML = `<p style="grid-column: 1/-1; text-align: center; color: var(--text-light); padding: 2rem;">يرجى تحديث بياناتك الدراسية</p>`;
        return;
    }

    // Load ALL subjects for this academic year
    const allSubjects = await loadSubjectsFromDB(academic_year);

    let sharedSubjects = [];
    let departmentSubjects = [];

    allSubjects.forEach(s => {
        // Must match academic year (subjects table now uses 'academic_year' column)
        if (s.academic_year !== academic_year) return;

        // 1. Shared Subjects Logic:
        // Must match Student's Term AND Have NO Department
        if (s.current_term === current_term && (!s.department || s.department === '' || s.department === 'general')) {
            sharedSubjects.push(s);
        }

        // 2. Department Subjects Logic (Only if student has a department)
        // Must match Student's Department
        if (department && s.department === department) {
            // If subject has a term defined, it MUST match Student's Term.
            // If subject has NO term (i.e. term-agnostic department subject), show it.
            if (!s.current_term || s.current_term === current_term) {
                departmentSubjects.push(s);
            }
        }
    });

    // Render sections
    let hasSubjects = false;

    // Section 1: Shared Subjects
    if (sharedSubjects.length > 0) {
        renderSection("المواد المشتركة", sharedSubjects, grid);
        hasSubjects = true;
    }

    // Section 2: Department Subjects
    if (departmentSubjects.length > 0) {
        const deptNames = {
            'pediatric': 'قسم الأطفال',
            'obs_gyn': 'قسم النسا والتوليد',
            'maternity': 'قسم النسا والتوليد',
            'nursing_admin': 'قسم الإدارة',
            'psychiatric': 'قسم النفسية'
        };
        const deptName = deptNames[department] || department;
        renderSection(`مواد ${deptName}`, departmentSubjects, grid);
        hasSubjects = true;
    }

    // Empty State
    if (!hasSubjects) {
        grid.innerHTML = `<p style="grid-column: 1/-1; text-align: center; color: var(--text-light); padding: 2rem;">لا توجد مواد مضافة لهذا الترم/القسم بعد.</p>`;
    }
}


function renderSection(title, subjects, container) {
    if (!subjects || subjects.length === 0) return;

    // Render Section Title (if provided)
    if (title) {
        const titleEl = document.createElement("h3");
        titleEl.textContent = title;
        titleEl.className = "section-header";
        // Ensure it spans full width in CSS Grid
        titleEl.style.cssText = "grid-column: 1 / -1; margin-top: 1.5rem; margin-bottom: 0.5rem; font-size: 1.25rem; color: var(--primary-dark); border-bottom: 2px solid #eee; padding-bottom: 0.5rem;";

        // Remove top margin for the first item if grid is empty
        if (container.children.length === 0) {
            titleEl.style.marginTop = "0";
        }

        container.appendChild(titleEl);
    }

    // Render Cards
    subjects.forEach(subject => {
        const card = document.createElement("div");
        card.className = "card subject-card";
        // Default icon if none provided (though DB redesign didn't enforce icon, let's assume valid FA class or default)
        const iconClass = subject.icon || "fa-book";

        card.innerHTML = `
            <div class="subject-header">
                <i class="fas ${iconClass} subject-icon"></i>
                <h3>${subject.name_ar}</h3>
            </div>
            <div class="subject-body">
                <a href="subject.html?id=${subject.id}" class="btn btn-primary subject-btn">دخول المادة</a>
            </div>
        `;
        container.appendChild(card);
    });
}

// ==========================
// 11. Results Display
// ==========================

// Heavily modified to accept data directly instead of fetching


function renderResultsStats(totalExams, avgScore, bestScore) {
    const statsGrid = document.getElementById('resultsStatsGrid');
    if (!statsGrid) return;

    statsGrid.innerHTML = `
        <div class="stat-card">
            <span class="stat-number">${totalExams}</span>
            <span class="stat-label">امتحانات مختلفة</span>
        </div>
        <div class="stat-card">
            <span class="stat-number">${avgScore}%</span>
            <span class="stat-label">متوسط الدرجات</span>
        </div>
        <div class="stat-card">
            <span class="stat-number">${bestScore}%</span>
            <span class="stat-label">أفضل درجة</span>
        </div>
    `;
}

async function renderResultsList(examGroups) {
    const container = document.getElementById('resultsContainer');
    if (!container) return;

    container.innerHTML = '';

    // Load subjects for name lookup
    const subjects = await loadSubjectsFromDB();
    const subjectsMap = {};
    subjects.forEach(s => subjectsMap[s.id] = s);

    // Get all latest attempts (one per exam)
    const latestAttempts = [];
    Object.values(examGroups).forEach(attempts => {
        // Sort by date and get the latest
        attempts.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        latestAttempts.push(attempts[0]);
    });

    // Sort by most recent and take top 5
    latestAttempts.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const recentFive = latestAttempts.slice(0, 5);

    if (recentFive.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--text-light);">لم تحل أي امتحانات بعد</p>';
        return;
    }

    recentFive.forEach(result => {
        const examData = result.exams || {};
        const examTitle = examData.title || 'امتحان';
        const subjectId = examData.subject_id || '';
        const subjectName = subjectsMap[subjectId]?.name_ar || 'مادة';

        // Hierarchy logic: Check exam's direct chapter, then lesson's chapter
        const chapterTitle = examData.chapters?.title || examData.lessons?.chapters?.title || "";
        const lessonTitle = examData.lessons?.title || "";

        // Final Hierarchy: Chapter - Lesson - Exam
        let hierarchyParts = [];
        if (chapterTitle) hierarchyParts.push(chapterTitle);
        if (lessonTitle) hierarchyParts.push(lessonTitle);
        hierarchyParts.push(examTitle);
        const hierarchyText = hierarchyParts.join(" - ");

        const attempts = examGroups[result.exam_id] || [];
        attempts.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        let comparisonHTML = '';
        let datesHTML = `<div style="font-size: 0.75rem; color: var(--text-light);"><i class="far fa-calendar-alt"></i> ${new Date(result.created_at).toLocaleDateString('ar-EG')}</div>`;

        if (attempts.length >= 2) {
            const current = attempts[0].percentage;
            const previous = attempts[1].percentage;
            const diff = current - previous;

            const icon = diff > 0 ? '📈' : diff < 0 ? '📉' : '➖';
            const color = diff > 0 ? '#10B981' : diff < 0 ? '#EF4444' : '#94A3B8';
            const sign = diff > 0 ? '+' : '';

            comparisonHTML = `<div style="font-size: 0.85rem; font-weight: bold; color: ${color}; margin-top: 4px;">${icon} ${sign}${diff}%</div>`;

            datesHTML = `
                <div style="font-size: 0.7rem; color: var(--text-light); text-align: left;">
                    <div title="آخر محاولة">🆕 ${new Date(attempts[0].created_at).toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' })}</div>
                    <div title="المحاولة السابقة" style="opacity: 0.7;">🕒 ${new Date(attempts[1].created_at).toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' })}</div>
                </div>
            `;
        }

        const card = document.createElement('div');
        card.className = 'card';
        card.style.cssText = 'margin-bottom: 1rem; padding: 1.2rem; border-right: 4px solid var(--primary-color);';

        const percentageColor = result.percentage >= 85 ? '#10B981' : result.percentage >= 50 ? 'var(--secondary-color)' : '#EF4444';

        if (attempts.length === 1) {
            // Single attempt
            card.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
                    <div style="flex: 1; min-width: 200px;">
                        <div style="font-weight: bold; color: var(--primary-color); margin-bottom: 0.2rem;">
                            <i class="fas fa-book"></i> ${subjectName}
                        </div>
                        <h4 style="font-size: 0.8rem; margin: 0; color: var(--text-light); font-weight: normal; line-height: 1.4;">
                            ${hierarchyText}
                        </h4>
                    </div>
                    <div style="text-align: center; min-width: 80px;">
                        <div style="font-size: 1.8rem; font-weight: 900; color: ${percentageColor}; line-height: 1;">
                            ${result.percentage}%
                        </div>
                    </div>
                    <div style="min-width: 100px;">
                        ${datesHTML}
                    </div>
                </div>
            `;
        } else {
            // Multiple attempts - Unified Grid Layout matching subject page
            const current = attempts[0];
            const previous = attempts[1];
            const diff = current.percentage - previous.percentage;
            const icon = diff > 0 ? '📈' : diff < 0 ? '📉' : '➖';
            const color = diff > 0 ? '#10B981' : diff < 0 ? '#EF4444' : '#94A3B8';
            const sign = diff > 0 ? '+' : '';

            card.innerHTML = `
                <div style="margin-bottom: 1rem;">
                    <div style="font-size: 0.95rem; font-weight: bold; color: var(--primary-color); margin-bottom: 0.2rem;">
                        <i class="fas fa-book"></i> ${subjectName}
                    </div>
                    <h4 style="font-size: 0.8rem; margin: 0; color: var(--text-light); font-weight: normal; line-height: 1.4;">
                        ${hierarchyText}
                    </h4>
                </div>
                <div style="display: grid; grid-template-columns: 1fr auto 1fr; gap: 1rem; align-items: center;">
                    <!-- Previous Attempt -->
                    <div style="text-align: center; padding: 0.8rem; background: var(--bg-light); border-radius: var(--radius-sm);">
                        <div style="font-size: 0.7rem; color: var(--text-light); margin-bottom: 0.3rem;">المرة السابقة</div>
                        <div style="font-size: 1.5rem; font-weight: 900; color: var(--text-dark);">${previous.percentage}%</div>
                        <div style="font-size: 0.65rem; color: var(--text-light); margin-top: 0.2rem;">🕒 ${new Date(previous.created_at).toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' })}</div>
                    </div>

                    <!-- Trend Column -->
                    <div style="text-align: center;">
                        <div style="font-size: 1.5rem;">${icon}</div>
                        <div style="font-size: 0.8rem; font-weight: bold; color: ${color};">${sign}${diff}%</div>
                    </div>

                    <!-- Current Attempt -->
                    <div style="text-align: center; padding: 0.8rem; background: #f0fdf4; border-radius: var(--radius-sm); border: 2px solid var(--primary-color);">
                        <div style="font-size: 0.7rem; color: var(--text-light); margin-bottom: 0.3rem;">آخر محاولة</div>
                        <div style="font-size: 1.5rem; font-weight: 900; color: var(--primary-color);">${current.percentage}%</div>
                        <div style="font-size: 0.65rem; color: var(--text-light); margin-top: 0.2rem;">🆕 ${new Date(current.created_at).toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' })}</div>
                    </div>
                </div>
            `;
        }

        container.appendChild(card);
    });

    // Add "View All" link if there are more results
    if (latestAttempts.length > 5) {
        const viewAllDiv = document.createElement('div');
        viewAllDiv.style.cssText = 'text-align: center; margin-top: 1rem;';
        viewAllDiv.innerHTML = `
            <a href="#" class="btn btn-outline" style="font-size: 0.9rem;">
                عرض كل النتائج (${latestAttempts.length})
            </a>
        `;
        container.appendChild(viewAllDiv);
    }
}

// ==========================
// 12. Initialize
// ==========================

const protectedPages = ["dashboard.html", "subject.html", "leaderboard.html", "profile.html", "todo.html", "squad.html", "exam.html", "lecture.html"];
let currentPageName = window.location.pathname.split("/").pop();

// Handle empty path (which usually loads dashboard.html)
if (!currentPageName || currentPageName === "") {
    currentPageName = "dashboard.html";
}

if (protectedPages.includes(currentPageName)) {
    loadUserProfile();
    startSecurityMonitor();
} else {
    checkAuth();
}

/**
 * Background security monitor
 * Handles real-time expiry and renewal synchronization
 */
function startSecurityMonitor() {
    setInterval(async () => {
        const protectedPages = ["dashboard.html", "subject.html", "leaderboard.html", "profile.html", "squad.html", "exam.html", "lecture.html"];
        const currentPage = window.location.pathname.split("/").pop() || "dashboard.html";

        if (protectedPages.includes(currentPage)) {
            // Re-check auth periodically. 
            // This handles expiry (at the exact minute) and renewal (within 3 mins via cache rotation)
            await checkAuth();
        }
    }, APP_CONFIG.ACTIVE_CHECK_INTERVAL || 60000);
}

// End of file




