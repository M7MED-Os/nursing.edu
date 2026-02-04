import { supabase } from "./supabaseClient.js";
import { checkAuth } from "./auth.js";
import { APP_CONFIG } from "./constants.js";
import { getCache, setCache } from "./utils.js";
import { subscriptionService, initSubscriptionService, showUpgradePrompt } from "./subscription.js";

document.addEventListener('DOMContentLoaded', async () => {
    // Check Auth
    const { user, profile } = await checkAuth();
    if (!user) return;

    // Initialize subscription service
    await initSubscriptionService(profile);

    // Store profile globally for access checks
    window.currentUserProfile = profile;

    // Update Navigation UI
    if (profile) {
        // Admin Buttons
        if (profile.role === 'admin') {
            const adminNavBtn = document.getElementById('adminNavBtn');
            if (adminNavBtn) adminNavBtn.style.display = 'block';
        }
    }

    // Get Lesson ID from URL
    const urlParams = new URLSearchParams(window.location.search);
    const lessonId = urlParams.get('id');

    if (!lessonId) {
        window.location.href = 'dashboard.html';
        return;
    }

    await loadLecture(lessonId);
});

async function loadLecture(lessonId) {
    const lectureContent = document.getElementById('lectureContent');
    const lectureTitle = document.getElementById('lectureTitle');
    const courseName = document.getElementById('courseName');
    const examLink = document.getElementById('examLink');
    const videoContainer = document.getElementById('videoContainer');
    const lectureVideo = document.getElementById('lectureVideo');

    try {
        // ✅ STEP 1: Validate access using RPC function
        const accessCheck = await subscriptionService.validateLessonAccess(lessonId);

        if (!accessCheck.canAccess) {
            // User doesn't have access - show upgrade prompt
            await showUpgradePrompt('lesson');
            window.location.href = 'dashboard.html';
            return;
        }

        const lesson = accessCheck.lesson;

        // ✅ STEP 2: Update UI with lesson data
        lectureTitle.textContent = lesson.title;
        courseName.textContent = lesson.subject_name || 'المادة';

        // ✅ STEP 3: Display content (already filtered by RPC)
        if (lesson.content) {
            lectureContent.innerHTML = lesson.content;
        } else {
            lectureContent.innerHTML = '<p style="text-align: center; color: #64748b;">لا يوجد محتوى متاح</p>';
        }

        // ✅ STEP 4: Display video (already filtered by RPC)
        if (lesson.video_url) {
            const videoId = extractYouTubeID(lesson.video_url);
            if (videoId) {
                lectureVideo.src = `https://www.youtube.com/embed/${videoId}`;
                videoContainer.style.display = 'block';
            }
        } else {
            videoContainer.style.display = 'none';
        }

        // ✅ STEP 5: Handle exam link
        // Fetch exams for this lesson
        const { data: exams, error: examsError } = await supabase
            .from('exams')
            .select('id, title')
            .eq('lesson_id', lessonId);

        if (!examsError && exams && exams.length > 0) {
            const firstExam = exams[0];

            // Check if user can access exam
            const examAccessCheck = await subscriptionService.validateExamAccess(firstExam.id);

            if (examAccessCheck.canAccess) {
                // User can access exam
                examLink.href = `exam.html?id=${firstExam.id}`;
                examLink.style.display = 'inline-flex';
                examLink.style.alignItems = 'center';
                examLink.style.gap = '8px';
                examLink.style.opacity = '1';
                examLink.innerHTML = '<i class="fas fa-clipboard-check"></i> ابدأ الامتحان';
                examLink.onclick = null;
            } else {
                // User cannot access exam - show locked state
                examLink.href = '#';
                examLink.style.display = 'inline-flex';
                examLink.style.alignItems = 'center';
                examLink.style.gap = '8px';
                examLink.style.opacity = '0.6';
                examLink.style.cursor = 'not-allowed';
                examLink.innerHTML = '<i class="fas fa-lock"></i> الامتحان (للمشتركين)';
                examLink.onclick = (e) => {
                    e.preventDefault();
                    showUpgradePrompt('exam');
                };
            }
        } else {
            examLink.style.display = 'none';
        }

    } catch (err) {
        console.error('Error loading lecture:', err);
        Swal.fire({
            icon: 'error',
            title: 'خطأ',
            text: 'حدث خطأ أثناء تحميل المحاضرة',
            confirmButtonText: 'حسناً'
        }).then(() => {
            window.location.href = 'dashboard.html';
        });
    }
}

/**
 * Extract YouTube video ID from URL
 */
function extractYouTubeID(url) {
    if (!url) return null;
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
}
