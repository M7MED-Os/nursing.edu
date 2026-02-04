import { supabase } from "./supabaseClient.js";
import { checkAuth } from "./auth.js";
import { APP_CONFIG } from "./constants.js";
import { getCache, setCache } from "./utils.js";
import { canAccessLectureContent, canAccessExam, showUpgradePrompt } from "./subscription.js";

document.addEventListener('DOMContentLoaded', async () => {
    // Check Auth
    const { user, profile } = await checkAuth();
    if (!user) return;

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
        // Check cache first (1 hour cache)
        const cacheKey = `lecture_${lessonId}`;
        let lesson = getCache(cacheKey);

        if (!lesson) {
            // Fetch lesson details with join to chapter and subject
            const { data, error } = await supabase
                .from('lessons')
                .select(`
                    *,
                    chapters (
                        title,
                        subjects (name_ar)
                    ),
                    exams (id)
                `)
                .eq('id', lessonId)
                .single();

            if (error || !data) throw error;
            lesson = data;

            // Cache for 1 hour
            setCache(cacheKey, lesson, APP_CONFIG.CACHE_TIME_LECTURES);
        }

        // Update UI
        lectureTitle.textContent = lesson.title;
        courseName.textContent = lesson.chapters?.subjects?.name_ar || 'المادة';

        // Check content access
        const hasContentAccess = canAccessLectureContent(lesson, window.currentUserProfile);
        const hasExamAccess = canAccessExam(lesson, window.currentUserProfile);

        // Set Exam Link if exists
        if (lesson.exams && lesson.exams.length > 0) {
            if (hasExamAccess) {
                examLink.href = `exam.html?id=${lesson.exams[0].id}`;
                examLink.style.display = 'inline-flex';
                examLink.style.alignItems = 'center';
                examLink.style.gap = '8px';
            } else {
                // Show locked exam button
                examLink.href = '#';
                examLink.style.display = 'inline-flex';
                examLink.style.alignItems = 'center';
                examLink.style.gap = '8px';
                examLink.style.opacity = '0.6';
                examLink.innerHTML = '<i class="fas fa-lock"></i> الامتحان (للمشتركين)';
                examLink.onclick = (e) => {
                    e.preventDefault();
                    showUpgradePrompt('exam');
                };
            }
        }

        // Handle Video
        if (lesson.video_url) {
            if (hasContentAccess) {
                let embedUrl = lesson.video_url;
                // Basic YouTube URL converter
                if (embedUrl.includes('youtube.com/watch?v=')) {
                    embedUrl = embedUrl.replace('watch?v=', 'embed/');
                } else if (embedUrl.includes('youtu.be/')) {
                    embedUrl = embedUrl.replace('youtu.be/', 'youtube.com/embed/');
                }
                lectureVideo.src = embedUrl;
                videoContainer.style.display = 'block';
            } else {
                // Show locked video placeholder
                videoContainer.style.display = 'block';
                videoContainer.innerHTML = `
                    <div style="
                        background: linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%);
                        border-radius: 12px;
                        padding: 3rem;
                        text-align: center;
                        cursor: pointer;
                    " onclick="window.showUpgradePrompt('lecture')">
                        <i class="fas fa-lock" style="font-size: 3rem; color: #64748b; margin-bottom: 1rem;"></i>
                        <h3 style="color: #334155; margin-bottom: 0.5rem;">هذا الفيديو متاح للمشتركين فقط</h3>
                        <p style="color: #64748b; margin-bottom: 1rem;">اشترك الآن للوصول الكامل لجميع المحاضرات</p>
                        <button class="btn btn-primary" style="margin-top: 1rem;">
                            <i class="fas fa-crown"></i> اشترك الآن
                        </button>
                    </div>
                `;
            }
        }

        // Render Content
        if (lesson.content) {
            if (hasContentAccess) {
                lectureContent.innerHTML = lesson.content;

                // Wrap tables for horizontal scroll
                lectureContent.querySelectorAll('table').forEach(table => {
                    const wrapper = document.createElement('div');
                    wrapper.className = 'table-wrapper';
                    table.parentNode.insertBefore(wrapper, table);
                    wrapper.appendChild(table);
                });
            } else {
                // Show locked content with preview
                const preview = lesson.content.substring(0, 300);
                lectureContent.innerHTML = `
                    <div style="position: relative;">
                        <div style="
                            max-height: 200px;
                            overflow: hidden;
                            filter: blur(3px);
                            opacity: 0.5;
                        ">${preview}...</div>
                        <div style="
                            position: absolute;
                            top: 50%;
                            left: 50%;
                            transform: translate(-50%, -50%);
                            background: white;
                            padding: 2rem;
                            border-radius: 16px;
                            box-shadow: 0 10px 40px rgba(0,0,0,0.2);
                            text-align: center;
                            min-width: 300px;
                        ">
                            <i class="fas fa-lock" style="font-size: 2.5rem; color: #0ea5e9; margin-bottom: 1rem;"></i>
                            <h3 style="margin-bottom: 0.5rem;">محتوى مدفوع 🔒</h3>
                            <p style="color: #64748b; margin-bottom: 1.5rem;">اشترك للوصول الكامل للمحاضرة</p>
                            <button class="btn btn-primary" onclick="window.showUpgradePrompt('lecture')">
                                <i class="fas fa-crown"></i> اشترك الآن
                            </button>
                        </div>
                    </div>
                `;
            }
        } else {
            lectureContent.innerHTML = `
                <div class="text-center py-5">
                    <i class="fas fa-book-open fa-3x mb-3 text-muted"></i>
                    <p>لا يوجد محتوى لهذه المحاضرة حالياً.</p>
                </div>
            `;
        }

        // Set Page Title
        document.title = `${lesson.title} | Nursing Academy`;

    } catch (error) {
        console.error('Error loading lecture:', error);
        lectureContent.innerHTML = `
            <div class="alert alert-danger text-center">
                حدث خطأ أثناء تحميل المحاضرة. يرجى المحاولة مرة أخرى.
            </div>
        `;
    } finally {
        // Hide Loading Overlay
        const loading = document.getElementById('loading');
        if (loading) {
            loading.style.opacity = '0';
            setTimeout(() => {
                loading.style.display = 'none';
            }, 300);
        }
    }
}

// Make showUpgradePrompt globally accessible
window.showUpgradePrompt = showUpgradePrompt;
