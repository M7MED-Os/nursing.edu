import { supabase } from "./supabaseClient.js";
import { showToast, getCache, setCache, getSWR } from "./utils.js";
import { APP_CONFIG } from "./constants.js";
import { checkAuth } from "./auth.js";

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Initialize Auth & Sync
    const auth = await checkAuth();
    if (!auth) return;

    // 2. Initial UI Render from SSOT
    updateDashboardProfileUI(auth.profile);

    // 3. Reactive updates (Realtime Push)
    window.addEventListener('profileUpdated', (e) => {
        updateDashboardProfileUI(e.detail);
    });

    // 4. Load Other Components
    loadAnnouncements(auth.profile);
    loadDashboardStats(auth.user.id);
});

function updateDashboardProfileUI(profile) {
    if (!profile) return;

    // Points (Unified Source)
    const pointsEl = document.getElementById('stats-points');
    if (pointsEl) pointsEl.textContent = profile.points || 0;

    const nameEl = document.getElementById("studentName");
    if (nameEl) nameEl.textContent = profile.full_name.split(' ')[0];
}

async function loadDashboardStats(userId) {
    const statsKey = `user_stats_${userId}`;

    // Use SWR for Stats RPC
    getSWR(statsKey,
        () => supabase.rpc('get_user_stats', { p_user_id: userId }).then(res => res.data[0]),
        APP_CONFIG.CACHE_TIME_STATS,
        (stats) => renderStatsUI(stats)
    );

    // Use SWR for History
    getSWR(`recent_history_${userId}`,
        () => supabase.from('results').select('*, exams(*)').eq('user_id', userId).order('created_at', { ascending: false }).limit(5).then(res => res.data),
        APP_CONFIG.CACHE_TIME_STATS,
        (history) => renderHistoryUI(history)
    );
}

function renderStatsUI(stats) {
    if (!stats) return;
    const qEl = document.getElementById('stats-questions');
    const eEl = document.getElementById('stats-exams');
    const aEl = document.getElementById('stats-accuracy');

    const accuracy = stats.total_possible_questions > 0
        ? Math.round((stats.total_solved_questions / stats.total_possible_questions) * 100)
        : 0;

    if (qEl) qEl.textContent = stats.total_solved_questions || 0;
    if (eEl) eEl.textContent = stats.total_exams || 0;
    if (aEl) aEl.textContent = `%${accuracy}`;
}

function renderHistoryUI(history) {
    const section = document.getElementById('resultsSection');
    const container = document.getElementById('resultsContainer');
    if (!section || !container || !history || history.length === 0) return;

    section.style.display = 'block';
    container.innerHTML = history.map(item => `
        <div class="result-card">
            <div class="result-header">
                <strong>${item.exams?.title || 'امتحان مفقود'}</strong>
                <span class="badge ${item.percentage >= 50 ? 'success' : 'danger'}">${item.percentage}%</span>
            </div>
            <div class="result-footer">
                <small>${new Date(item.created_at).toLocaleDateString('ar-EG')}</small>
            </div>
        </div>
    `).join('');
}

async function loadAnnouncements(profile) {
    const container = document.getElementById('announcements-container');
    if (!container || !profile) return;

    const userId = profile.id;
    const cacheKey = `announcements_${userId}`;

    getSWR(cacheKey, async () => {
        // Use RPC function to get announcements for user
        const { data, error } = await supabase
            .rpc('get_announcements_for_user', { p_user_id: userId });

        if (error) {
            console.error('Error loading announcements:', error);
            container.innerHTML = '<p style="text-align: center; color: var(--text-light);">حدث خطأ في تحميل الإعلانات</p>';
            return null;
        }

        return data || [];
    }, APP_CONFIG.CACHE_TIME_ANNOUNCEMENTS, (announcements) => {
        if (!announcements || announcements.length === 0) {
            container.style.display = 'none';
            return;
        }
        renderAnnouncements(announcements, container);
    });
}

function renderAnnouncements(announcements, container) {
    if (!announcements || announcements.length === 0) return;

    const dismissed = JSON.parse(localStorage.getItem('dismissed_announcements') || '[]');
    const valid = announcements.filter(a => !dismissed.includes(a.id));

    // Hide container if no valid announcements
    if (valid.length === 0) {
        container.style.display = 'none';
        return;
    }

    container.style.display = 'block';
    container.innerHTML = valid.map(ann => `
        <div class="announcement-toast announcement-${ann.type || 'info'}" id="ann-${ann.id}">
             <strong>${ann.title}</strong>
             <p>${ann.message}</p>
             <button onclick="dismissAnnouncement('${ann.id}')">×</button>
        </div>
    `).join('');
}

window.dismissAnnouncement = (id) => {
    const el = document.getElementById(`ann-${id}`);
    if (el) el.remove();
    const dismissed = JSON.parse(localStorage.getItem('dismissed_announcements') || '[]');
    dismissed.push(id);
    localStorage.setItem('dismissed_announcements', JSON.stringify(dismissed));
};

window.showPointsExplanation = () => {
    Swal.fire({
        title: '<span style="font-weight: 800; color: #1e293b; font-size: 1.2rem;">إزاي تجمع نقط؟ 🎯</span>',
        html: `
            <div style="text-align: right; direction: rtl; font-family: 'Cairo', sans-serif; line-height: 1.6;">
                <div style="background: #f0f9ff; padding: 15px; border-radius: 12px; border-right: 4px solid #03A9F4; color: #334155; font-size: 1rem;">
                    كل امتحان بتحله بتزيد في النقط نقطة لكل سؤال صح (لو دي أول مرة تحل الامتحان). 
                    <br>
                    وفي نقط زيادة لو قفلت، ولو حليت كل يوم امتحان لمدة 3 و 5 و 7 أيام.
                    <br>
                    كل ما تزيد في النقط و المتسوى هتظهر في قايمة الاوائل😂
                </div>
            </div>
        `,
        confirmButtonText: 'تمام، فهمت!',
        confirmButtonColor: '#03A9F4',
        width: '380px',
        padding: '1.5rem',
        borderRadius: '20px'
    });
};
