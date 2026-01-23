import { supabase } from "./supabaseClient.js";
import { checkAuth } from "./auth.js";

document.addEventListener('DOMContentLoaded', async () => {
    // Check Auth
    const { user, profile } = await checkAuth();
    if (!user) return;

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
        // Fetch lesson details with join to chapter and subject
        const { data: lesson, error } = await supabase
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

        if (error || !lesson) throw error;

        // Update UI
        lectureTitle.textContent = lesson.title;
        courseName.textContent = lesson.chapters?.subjects?.name_ar || 'المادة';

        // Set Exam Link if exists
        if (lesson.exams && lesson.exams.length > 0) {
            examLink.href = `exam.html?id=${lesson.exams[0].id}`;
            examLink.style.display = 'inline-flex';
            examLink.style.alignItems = 'center';
            examLink.style.gap = '8px';
        }

        // Handle Video
        if (lesson.video_url) {
            let embedUrl = lesson.video_url;
            // Basic YouTube URL converter
            if (embedUrl.includes('youtube.com/watch?v=')) {
                embedUrl = embedUrl.replace('watch?v=', 'embed/');
            } else if (embedUrl.includes('youtu.be/')) {
                embedUrl = embedUrl.replace('youtu.be/', 'youtube.com/embed/');
            }
            lectureVideo.src = embedUrl;
            videoContainer.style.display = 'block';
        }

        // Render Content
        if (lesson.content) {
            lectureContent.innerHTML = lesson.content;

            // Clean up empty lines or fix structure if needed
            // But usually we expect the AI-generated HTML to be clean
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
    }
}
