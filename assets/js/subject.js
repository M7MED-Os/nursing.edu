import { supabase } from "./supabaseClient.js";
import { getCache, setCache, clearCache, getSWR } from "./utils.js";
import { APP_CONFIG } from "./constants.js";
import { checkAuth } from "./auth.js";

// Utility to get Query Params
const urlParams = new URLSearchParams(window.location.search);
const subjectId = urlParams.get('id');
const mode = urlParams.get('mode');
const squadIdInUrl = urlParams.get('squad_id');

async function loadSubjectContent() {
    if (!subjectId) {
        window.location.href = "dashboard.html";
        return;
    }

    // 1. Initial Auth Check (Ensures Realtime + Session)
    const auth = await checkAuth();
    if (!auth) return;

    const titleEl = document.getElementById("subjectTitle");
    const gridEl = document.getElementById("examsGrid");
    const loadingEl = document.getElementById("loading");

    // 2. Unified SWR Logic
    const cacheKey = `subject_data_${subjectId}`;

    getSWR(cacheKey,
        () => fetchSubjectFreshData(auth.user.id),
        APP_CONFIG.CACHE_TIME_SUBJECT_CONTENT,
        (data) => {
            if (data.subject) titleEl.textContent = data.subject.name_ar;
            renderContent(data.chapters, data.lessons, data.exams, gridEl, mode, squadIdInUrl, data.solvedExams || []);
            loadingEl.style.display = "none";
        }
    );
}

async function fetchSubjectFreshData(userId) {
    const { data: subject } = await supabase.from('subjects').select('name_ar').eq('id', subjectId).single();
    const { data: chapters } = await supabase.from('chapters').select('*').eq('subject_id', subjectId).order('order_index', { ascending: true });

    if (!chapters || chapters.length === 0) return { subject, chapters: [], lessons: [], exams: [], solvedExams: [] };

    const chapterIds = chapters.map(c => c.id);
    const { data: lessons } = await supabase.from('lessons').select('*').in('chapter_id', chapterIds).order('order_index', { ascending: true });

    // Optimized Exam Query
    const lessonIds = lessons.length ? lessons.map(l => l.id) : [];
    const orFilter = `chapter_id.in.(${chapterIds.join(',')})${lessonIds.length ? `,lesson_id.in.(${lessonIds.join(',')})` : ''}`;

    const { data: exams } = await supabase.from('exams')
        .select('*')
        .or(orFilter)
        .order('order_index', { ascending: true });

    let solvedExams = [];
    if (userId) {
        const { data: results } = await supabase.from('results').select('exam_id').eq('user_id', userId);
        solvedExams = (results || []).map(r => r.exam_id);
    }

    return { subject, chapters, lessons, exams, solvedExams };
}

function renderSkeletons(container) {
    container.innerHTML = `
        <div class="skeleton-container" style="direction: rtl;">
            ${[1, 2, 3].map(() => `
                <div class="chapter-card skeleton pulse" style="border:none; margin-bottom:1.5rem; background:#eee;">
                    <div class="skeleton-chapter skeleton"></div>
                </div>
            `).join('')}
        </div>
    `;
}

function renderContent(chapters, lessons, exams, container, mode, squadId, solvedExams = []) {
    container.innerHTML = "";
    container.className = ""; // Remove grid class for accordion layout

    // Style adjustments for Accordion
    const accordionStyle = document.createElement('style');
    accordionStyle.innerHTML = `
        .chapter-card {
            background: white;
            border-radius: var(--radius-md);
            margin-bottom: 1.5rem;
            box-shadow: var(--shadow-sm);
            overflow: hidden;
            border: 1px solid #E5E7EB;
            direction: ltr;
            text-align: left;
        }
        .chapter-header {
            padding: 1.5rem;
            background: var(--bg-white);
            cursor: pointer;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1px solid transparent;
            transition: all 0.3s ease;
            direction: ltr;
        }
        .chapter-header:hover {
            background: #F9FAFB;
        }
        .chapter-header.active {
            background: var(--primary-color);
            color: white;
            border-bottom-color: rgba(255,255,255,0.1);
        }
        .chapter-header h2 {
            font-size: 1.4rem;
            margin: 0;
            display: flex;
            align-items: center;
            gap: 10px;
            flex-direction: row;
        }
        .chapter-body {
            display: none;
            padding: 1.5rem;
            background: white;
            animation: fadeIn 0.3s ease;
            direction: ltr;
            text-align: left;
        }
        .chapter-body.show {
            display: block;
        }
        /* Lesson Item */
        .lesson-item {
            padding: 1rem;
            border-bottom: 1px solid #eee;
            margin-bottom: 0.5rem;
        }
        .lesson-item:last-child {
            border-bottom: none;
        }
        .lesson-title {
            font-weight: bold;
            font-size: 1.1rem;
            color: var(--text-dark);
            margin-bottom: 0.8rem;
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }
        .exam-buttons {
            display: flex;
            gap: 0.8rem;
            flex-wrap: wrap;
            align-items: center;
        }
        .exam-btn-sm {
            padding: 0.4rem 1rem;
            font-size: 0.85rem;
            background: white;
            border: 1px solid var(--primary-color);
            color: var(--primary-color);
            border-radius: 20px;
            text-decoration: none;
            transition: all 0.2s;
            display: inline-flex;
            align-items: center;
            gap: 5px;
        }
        .exam-btn-sm:hover {
            background: var(--primary-color);
            color: white;
        }
        .lecture-btn-sm {
            padding: 0.4rem 1.2rem;
            font-size: 0.85rem;
            background: var(--primary-color);
            color: white;
            border-radius: 20px;
            text-decoration: none;
            transition: all 0.2s;
            display: inline-flex;
            align-items: center;
            gap: 5px;
            font-weight: 700;
        }
        .lecture-btn-sm:hover {
            background: var(--primary-dark);
            transform: translateY(-2px);
            box-shadow: 0 4px 8px rgba(30, 179, 245, 0.3);
        }
        .lecture-btn-sm.disabled {
            background: #e5e7eb;
            color: #9ca3af;
            border-color: #d1d5db;
            cursor: not-allowed;
            pointer-events: none;
            box-shadow: none;
            transform: none;
        }
        .chapter-exam-section {
            margin-top: 1.5rem;
            padding-top: 1.5rem;
            border-top: 2px dashed #eee;
        }
    `;
    document.head.appendChild(accordionStyle);

    if (!chapters || chapters.length === 0) {
        const noMsgEl = document.getElementById("noExamsMessage");
        if (noMsgEl) noMsgEl.style.display = "block";
        container.innerHTML = ""; // Clear skeletons
        return;
    }

    // Hide no message if it was showing
    const noMsgEl = document.getElementById("noExamsMessage");
    if (noMsgEl) noMsgEl.style.display = "none";

    chapters.forEach((chapter, index) => {
        const chapterLessons = lessons.filter(l => l.chapter_id === chapter.id);
        const chapterExams = exams.filter(e => e.chapter_id === chapter.id); // Exams directly on chapter

        const div = document.createElement("div");
        div.className = "chapter-card";

        // Generate HTML for Lessons
        let lessonsHtml = "";
        if (chapterLessons.length > 0) {
            chapterLessons.forEach(lesson => {
                // Find exams for this specific lesson
                const lessonExams = exams.filter(e => e.lesson_id === lesson.id);
                let examsHtml = "";

                if (lessonExams.length > 0) {
                    lessonExams.forEach((exam, idx) => {
                        const isSquadMode = mode === 'squad';
                        const isSolved = solvedExams.includes(exam.id);
                        const iconClass = isSquadMode ? 'fa-users' : (isSolved ? 'fa-check-circle' : 'fa-pen');
                        const iconColor = (!isSquadMode && isSolved) ? '#10b981' : 'inherit';
                        const examTitle = exam.title || `نموذج أسئلة ${idx + 1}`;

                        if (isSquadMode) {
                            examsHtml += `
                                <a href="javascript:void(0)" onclick="selectSquadExam('${exam.id}', '${examTitle}', '${squadId}')" class="exam-btn-sm">
                                    <i class="fas ${iconClass}"></i> ${examTitle}
                                </a>`;
                        } else {
                            examsHtml += `
                                <a href="exam.html?id=${exam.id}" class="exam-btn-sm" style="${isSolved ? 'border-color:#10b981; color:#10b981;' : ''}">
                                    <i class="fas ${iconClass}" style="color: ${iconColor}"></i> ${examTitle}
                                </a>`;
                        }
                    });
                } else {
                    examsHtml = `<span style="font-size:0.8rem; color:#999;">لا توجد اسئلة حالياً</span>`;
                }

                lessonsHtml += `
                    <div class="lesson-item">
                        <div class="lesson-title">
                            <i class="fas fa-book-open" style="color: var(--secondary-color);"></i>
                            ${lesson.title}
                        </div>
                        <div class="exam-buttons">
                            <a href="${lesson.content ? `lecture.html?id=${lesson.id}` : '#'}" 
                               class="lecture-btn-sm ${!lesson.content ? 'disabled' : ''}">
                                ${lesson.content ? 'عرض المحاضرة' : 'المحاضرة قريباً'}
                            </a>
                            ${examsHtml}
                        </div>
                    </div>
                `;
            });
        } else {
            lessonsHtml = `<p style="text-align: center; color: #999;">جاري إضافة الدروس...</p>`;
        }

        // Generate HTML for Chapter-Level Exams
        let chapterExamsHtml = "";
        if (chapterExams.length > 0) {
            chapterExamsHtml = `<div class="chapter-exam-section">
                <h4 style="margin-bottom: 1rem; color: var(--primary-dark);">
                    <i class="fas fa-award"></i> امتحانات شاملة على الباب
                </h4>
                <div class="exam-buttons">`;

            chapterExams.forEach(exam => {
                const isSquadMode = mode === 'squad';
                const isSolved = solvedExams.includes(exam.id);
                const iconClass = isSquadMode ? 'fa-users' : (isSolved ? 'fa-check-circle' : 'fa-star');
                const iconColor = (!isSquadMode && isSolved) ? '#10b981' : 'inherit';
                const examTitle = exam.title;

                if (isSquadMode) {
                    chapterExamsHtml += `
                        <a href="javascript:void(0)" onclick="selectSquadExam('${exam.id}', '${examTitle}', '${squadId}')" class="exam-btn-sm" style="background: var(--bg-light); border-color: var(--text-light); color: var(--text-dark);">
                            <i class="fas ${iconClass}"></i> ${examTitle}
                        </a>`;
                } else {
                    chapterExamsHtml += `
                        <a href="exam.html?id=${exam.id}" class="exam-btn-sm" style="background: var(--bg-light); border-color: ${isSolved ? '#10b981' : 'var(--text-light)'}; color: ${isSolved ? '#10b981' : 'var(--text-dark)'};">
                            <i class="fas ${iconClass}" style="color: ${iconColor}"></i> ${examTitle}
                        </a>`;
                }
            });

            chapterExamsHtml += `</div></div>`;
        }

        div.innerHTML = `
            <div class="chapter-header" onclick="this.classList.toggle('active'); this.nextElementSibling.classList.toggle('show');">
                <h2>
                    <span style="background: var(--primary-color); color: white; width: 35px; height: 35px; border-radius: 5px; display: flex; align-items: center; justify-content: center; font-size: 1rem;">
                        ${index + 1}
                    </span>
                    ${chapter.title}
                </h2>
                <i class="fas fa-chevron-down"></i>
            </div>
            <div class="chapter-body ${chapter.id ? '' : 'show'}"> <!-- Show first one by default if needed, logic can be added -->
                ${lessonsHtml}
                ${chapterExamsHtml}
            </div>
        `;

        container.appendChild(div);
    });
}

// Squad Exam Selection System
window.selectSquadExam = async (examId, examTitle, squadId) => {
    try {
        const { isConfirmed } = await Swal.fire({
            title: 'عاوز تبدأ الامتحان ده مع صحابك؟',
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'آيوة، يلا بينا!',
            cancelButtonText: 'إلغاء',
            confirmButtonColor: '#10b981'
        });

        if (!isConfirmed) return;

        Swal.fire({
            title: 'جاري البدء...',
            didOpen: () => {
                Swal.showLoading();
            }
        });

        // 1. Get User
        const { data: { user } } = await supabase.auth.getUser();

        // 2. Check if already solved by the squad
        const { data: completedChallenges } = await supabase
            .from('squad_exam_challenges')
            .select('id')
            .eq('squad_id', squadId)
            .eq('exam_id', examId)
            .eq('status', 'completed')
            .limit(1);

        if (completedChallenges && completedChallenges.length > 0) {
            const { isConfirmed: proceedAnyway } = await Swal.fire({
                title: 'تنبيه !',
                text: 'انتو حليتو الامتحان ده مع بعض قبل كده النقط مش هتتحسب تاني.',
                icon: 'warning',
                showCancelButton: true,
                confirmButtonText: 'عارف ابدأ',
                cancelButtonText: 'لا خلاص',
                confirmButtonColor: '#10b981',
                cancelButtonColor: '#64748b'
            });

            if (!proceedAnyway) return;
        }

        // 2. Create Challenge (New System)
        const expiresAt = new Date(Date.now() + (60 * 60 * 1000)).toISOString(); // 1 Hour
        const { data: challenge, error: challError } = await supabase
            .from('squad_exam_challenges')
            .insert({
                squad_id: squadId,
                exam_id: examId,
                created_by: user.id,
                expires_at: expiresAt,
                status: 'active'
            })
            .select()
            .single();

        if (challError) throw challError;

        // 3. Notify in chat with Challenge ID
        await supabase.from('squad_chat_messages').insert({
            squad_id: squadId,
            sender_id: user.id,
            challenge_id: challenge.id,
            text: `انا بدأت امتحان مين هيحل معايا؟ [SQUAD_EXAM:${examId}:${challenge.id}]`
        });

        // 4. Success & Redirect
        await Swal.fire({
            icon: 'success',
            title: 'التحدي بدأ! 🚀',
            text: 'أصحابك في الشلة هيوصلهم إشعار دلوقتي في الشات.',
            timer: 2000,
            showConfirmButton: false
        });

        window.location.href = 'squad.html';

    } catch (err) {
        console.error(err);
        Swal.fire('خطأ', 'مقدرناش نبدأ التحدي.. جرب تاني', 'error');
    }
};

// Load Subject-Specific Results
async function loadSubjectResults() {
    try {
        // Get current user
        const { data: { user }, error: userError } = await supabase.auth.getUser();

        if (userError || !user) return;

        // Fetch results for this subject only
        const { data: results, error } = await supabase
            .from('results')
            .select(`
                *,
                exams!inner (
                    id,
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
            .eq('user_id', user.id)
            .eq('exams.subject_id', subjectId)
            .order('created_at', { ascending: false });

        if (error) throw error;

        if (!results || results.length === 0) {
            // No results for this subject yet
            return;
        }

        // Show results section
        const resultsSection = document.getElementById('subjectResultsSection');
        if (resultsSection) resultsSection.style.display = 'block';

        // Group by exam_id
        const examGroups = {};
        results.forEach(result => {
            if (!examGroups[result.exam_id]) {
                examGroups[result.exam_id] = [];
            }
            examGroups[result.exam_id].push(result);
        });

        // Render results
        renderSubjectResults(examGroups);

    } catch (err) {
        console.error("Error loading subject results:", err);
    }
}

function renderSubjectResults(examGroups) {
    const container = document.getElementById('subjectResultsContainer');
    if (!container) return;

    container.innerHTML = '';

    Object.values(examGroups).forEach(attempts => {
        // Sort by date: Newest first
        attempts.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        const currentAttempt = attempts[0];
        const previousAttempt = attempts[1] || null;

        const examData = currentAttempt.exams || {};
        const examTitle = examData.title || 'امتحان';
        const chapterTitle = examData.chapters?.title || examData.lessons?.chapters?.title || "بدون باب";
        const lessonTitle = examData.lessons?.title || "";

        const card = document.createElement('div');
        card.className = 'card';
        card.style.cssText = 'margin-bottom: 1.5rem; padding: 1.5rem; border-right: 4px solid var(--primary-color);';

        if (!previousAttempt) {
            // Single attempt
            card.innerHTML = `
                <div style="font-size: 0.95rem; font-weight: bold; color: var(--primary-color); margin-bottom: 0.2rem;">
                    <i class="fas fa-folder-open"></i> ${chapterTitle}
                </div>
                <h4 style="font-size: 0.85rem; margin: 0 0 1rem 0; color: var(--text-light); font-weight: normal; line-height: 1.4;">
                    ${lessonTitle ? lessonTitle + ' - ' : ''}${examTitle}
                </h4>
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
                    <div>
                        <span style="font-size: 2rem; font-weight: 900; color: var(--primary-color);">
                            ${currentAttempt.percentage}%
                        </span>
                        <span style="display: block; font-size: 0.9rem; color: var(--text-light); margin-top: 0.3rem;">
                            الدرجة: ${currentAttempt.score} من ${currentAttempt.total_questions} صح
                        </span>
                    </div>
                    <div style="text-align: left;">
                        <span style="font-size: 0.85rem; color: var(--text-light);">
                            <i class="far fa-calendar-alt"></i> ${new Date(currentAttempt.created_at).toLocaleDateString('ar-EG')}
                        </span>
                    </div>
                </div>
            `;
        } else {
            // Multiple attempts (Latest 2)
            const diff = currentAttempt.percentage - previousAttempt.percentage;
            const icon = diff > 0 ? '📈' : diff < 0 ? '📉' : '➖';
            const color = diff > 0 ? '#10B981' : diff < 0 ? '#EF4444' : '#94A3B8';
            const sign = diff > 0 ? '+' : '';

            card.innerHTML = `
                <div style="font-size: 0.95rem; font-weight: bold; color: var(--primary-color); margin-bottom: 0.2rem;">
                    <i class="fas fa-folder-open"></i> ${chapterTitle}
                </div>
                <h4 style="font-size: 0.85rem; margin: 0 0 1rem 0; color: var(--text-light); font-weight: normal; line-height: 1.4;">
                    ${lessonTitle ? lessonTitle + ' - ' : ''}${examTitle}
                </h4>
                <div style="display: grid; grid-template-columns: 1fr auto 1fr; gap: 1rem; align-items: center;">
                    <!-- Previous Attempt -->
                    <div style="text-align: center; padding: 1rem; background: var(--bg-light); border-radius: var(--radius-sm);">
                        <div style="font-size: 0.75rem; color: var(--text-light); margin-bottom: 0.5rem;">المرة السابقة</div>
                        <div style="font-size: 1.8rem; font-weight: 900; color: var(--text-dark);">${previousAttempt.percentage}%</div>
                        <div style="font-size: 0.7rem; color: var(--text-light); margin-top: 0.3rem;">🕒 ${new Date(previousAttempt.created_at).toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' })}</div>
                    </div>

                    <!-- Improvement Arrow -->
                    <div style="text-align: center; font-size: 2rem;">
                        ${icon}
                        <div style="font-size: 0.9rem; font-weight: bold; color: ${color}; margin-top: 0.3rem;">
                            ${sign}${diff}%
                        </div>
                    </div>

                    <!-- Current Attempt -->
                    <div style="text-align: center; padding: 1rem; background: #f0fdf4; border-radius: var(--radius-sm); border: 2px solid var(--primary-color);">
                        <div style="font-size: 0.75rem; color: var(--text-light); margin-bottom: 0.5rem;">آخر محاولة</div>
                        <div style="font-size: 1.8rem; font-weight: 900; color: var(--primary-color);">${currentAttempt.percentage}%</div>
                        <div style="font-size: 0.7rem; color: var(--text-light); margin-top: 0.3rem;">🆕 ${new Date(currentAttempt.created_at).toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' })}</div>
                    </div>
                </div>
            `;
        }

        container.appendChild(card);
    });
}


document.addEventListener("DOMContentLoaded", () => {
    loadSubjectContent();
    loadSubjectResults();
});
