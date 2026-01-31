import { supabase } from "./supabaseClient.js";
import { getCache, setCache, getSWR } from "./utils.js";
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

    const cacheKey = `announcements_${profile.grade}`;

    getSWR(cacheKey, async () => {
        const gradeTarget = `grade_${profile.grade}`;
        const { data } = await supabase.from('announcements')
            .select('*')
            .eq('is_active', true)
            .or(`target.eq.all,target.eq.${gradeTarget}`)
            .lte('scheduled_for', new Date().toISOString())
            .order('created_at', { ascending: false });
        return data;
    }, APP_CONFIG.CACHE_TIME_ANNOUNCEMENTS, (data) => renderAnnouncements(data, container));
}

function renderAnnouncements(announcements, container) {
    if (!announcements || announcements.length === 0) return;

    const dismissed = JSON.parse(localStorage.getItem('dismissed_announcements') || '[]');
    const valid = announcements.filter(a => !dismissed.includes(a.id));

    // Styling logic handled in dashboard.js original (skipping detailed CSS for brevity in logic proof)
    container.innerHTML = valid.map(ann => `
        <div class="announcement-toast" id="ann-${ann.id}">
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
        title: '<span style="color: var(--primary-color);">إزاي تجمع نقط؟ 🎯</span>',
        html: `
            <div style="text-align: right; direction: rtl; line-height: 1.6; font-size: 0.95rem;">
                <div style="background: #f0f9ff; padding: 12px; border-radius: 12px; margin-bottom: 15px; border-right: 4px solid var(--primary-color);">
                    <strong>النقاط هي مستواك في المنصة!</strong><br>
                    كل ما تجمع نقط أكتر، المستوى بتاعك هيزيد في المنصه، وبتظهر في قايمة الاوائل اللي ان شاء الله هيبقى فيها فلوس😂
                </div>
                
                <ul style="list-style: none; padding: 0;">
                    <li style="margin-bottom: 12px; display: flex; align-items: flex-start; gap: 10px;">
                        <i class="fas fa-pen-nib" style="color: #03A9F4; margin-top: 5px;"></i>
                        <span><strong>حل الامتحانات:</strong> بتاخد نقط على حسب درجتك في كل امتحان بتحله كل سؤال صح بتزيد نقطه (بس في حالة ان ده اول مره تحل الامتحان)</span>
                    </li>
                    <li style="margin-bottom: 12px; display: flex; align-items: flex-start; gap: 10px;">
                        <i class="fas fa-crown" style="color: #FFD700; margin-top: 5px;"></i>
                        <span><strong>بونص التقفيل:</strong> لو قفلت الامتحان من أول مرة بتاخد 10 نقط بونص فوق درجتك! 👑</span>
                    </li>
                    <li style="margin-bottom: 12px; display: flex; align-items: flex-start; gap: 10px;">
                        <i class="fas fa-users" style="color: #10b981; margin-top: 5px;"></i>
                        <span><strong>تحديات الشلة:</strong> حل الامتحان مع شلتك بتاخد بونص إضافي (3 أو 8 نقط).</span>
                    </li>
                    <li style="margin-bottom: 12px; display: flex; align-items: flex-start; gap: 10px;">
                        <i class="fas fa-check-double" style="color: #f59e0b; margin-top: 5px;"></i>
                        <span><strong>الالتزام اليومي:</strong> لو ذاكرت كل يوم و حليت امتحان هتاخد نقط زيادة بتفضل تزيد لحد ما تبطل تذاكر هتبدأ من الاول</span>
                    </li>
                </ul>
            </div>
        `,
        confirmButtonText: 'تمام',
        confirmButtonColor: '#03A9F4',
        width: '500px',
        padding: '1rem'
    });
};
