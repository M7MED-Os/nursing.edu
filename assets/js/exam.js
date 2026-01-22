import { supabase } from "./supabaseClient.js";

const urlParams = new URLSearchParams(window.location.search);
const examId = urlParams.get('id');

let currentQuestions = [];
let currentQuestionIndex = 0;
let userAnswers = {}; // { questionId: 'a' }
let examTitle = "";
let hierarchyInfo = { chapter: "", lesson: "" };
let flaggedQuestions = new Set();
let timerInterval = null;
let timeElapsed = 0; // in seconds
let totalTime = 0; // calculated based on questions
let squadId = urlParams.get('squad_id');
let squadSessionId = null;

const loadingEl = document.getElementById("loading");
const examView = document.getElementById("examView");
const resultView = document.getElementById("resultView");
const reviewView = document.getElementById("reviewView");
const questionsContainer = document.getElementById("questionsContainer");
const reviewContainer = document.getElementById("reviewContainer");
const examTitleMobile = document.getElementById("examTitleMobile");
const progressBar = document.getElementById("progressBar");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const submitBtn = document.getElementById("submitBtn");
const timerDisplay = document.getElementById("timerDisplay");
const timerBox = document.getElementById("timerBox");
const reviewBtn = document.getElementById("reviewBtn");
const backToResultBtn = document.getElementById("backToResultBtn");
const examFooter = document.getElementById("examFooter");
const headerFinishBtn = document.getElementById("headerFinishBtn");
const desktopNavGrid = document.getElementById("desktopNavGrid");
const mobileNavGrid = document.getElementById("mobileNavGrid");

// Check Auth & ID
if (!examId) {
    Swal.fire({
        icon: 'error',
        title: 'خطأ',
        text: 'امتحان غير موجود',
        confirmButtonText: 'عودة'
    }).then(() => {
        window.location.href = "dashboard.html";
    });
}

async function initExam() {
    try {
        // 0. Check SessionStorage Cache for Questions
        const cacheKey = `exam_cache_${examId}`;
        const cachedData = sessionStorage.getItem(cacheKey);

        if (cachedData) {
            const parsed = JSON.parse(cachedData);
            currentQuestions = parsed.questions;
            examTitle = parsed.title;
            hierarchyInfo = parsed.hierarchy;

            // Restore answers from local storage to keep progress on refresh
            const savedAnswers = localStorage.getItem(`exam_progress_${examId}`);
            if (savedAnswers) {
                userAnswers = JSON.parse(savedAnswers);
            }

            console.log("Exam loaded from cache");
        } else {
            // 1. Fetch Exam Details
            const { data: exam, error: examError } = await supabase
                .from('exams')
                .select('*')
                .eq('id', examId)
                .single();

            if (examError || !exam) throw new Error("Exam not found");
            examTitle = exam.title;

            // Fetch hierarchy
            if (exam.lesson_id) {
                const { data: lesson } = await supabase.from('lessons').select('title, chapter_id').eq('id', exam.lesson_id).single();
                if (lesson) {
                    hierarchyInfo.lesson = lesson.title;
                    const { data: chapter } = await supabase.from('chapters').select('title').eq('id', lesson.chapter_id).single();
                    if (chapter) hierarchyInfo.chapter = chapter.title;
                }
            } else if (exam.chapter_id) {
                const { data: chapter } = await supabase.from('chapters').select('title').eq('id', exam.chapter_id).single();
                if (chapter) hierarchyInfo.chapter = chapter.title;
            }

            // 2. Fetch Questions
            const { data: questions, error: qError } = await supabase
                .from('questions')
                .select('*')
                .eq('exam_id', examId);

            if (qError) throw qError;
            if (!questions || questions.length === 0) {
                loadingEl.innerHTML = "<p>عفواً، لا توجد أسئلة في هذا الامتحان.</p>";
                return;
            }

            currentQuestions = shuffleArray(questions);

            // Save to sessionStorage
            sessionStorage.setItem(cacheKey, JSON.stringify({
                questions: currentQuestions,
                title: examTitle,
                hierarchy: hierarchyInfo
            }));
        }

        if (examTitleMobile) examTitleMobile.textContent = "الامتحان";
        totalTime = currentQuestions.length * 60;

        renderQuestions();
        renderNavigator();
        showQuestion(currentQuestionIndex); // Start from saved index or 0
        startTimer();

        if (squadId) {
            setupSquadSession();
            const badge = document.getElementById('squadModeBadge');
            if (badge) badge.style.display = 'block';
        }

        loadingEl.style.display = "none";
        examView.style.display = "block";
        if (examFooter) examFooter.style.display = "flex";

    } catch (err) {
        console.error("Error:", err);
        loadingEl.innerHTML = `<p style="color:red">حدث خطأ: ${err.message}</p>`;
    }
}

// --- Squad Collaborative Functions ---
async function setupSquadSession() {
    // Check if session exists or create one
    const { data: session } = await supabase
        .from('squad_exam_sessions')
        .select('*')
        .eq('squad_id', squadId)
        .eq('exam_id', examId)
        .eq('status', 'active')
        .single();

    if (session) {
        squadSessionId = session.id;
        userAnswers = session.answers_json || {};
        // Note: we'll render questions first, then initExam will call showQuestion
    } else {
        const { data: newSession } = await supabase
            .from('squad_exam_sessions')
            .insert({
                squad_id: squadId,
                exam_id: examId,
                status: 'active',
                answers_json: {}
            })
            .select()
            .single();
        squadSessionId = newSession.id;
    }

    // Subscribe to Realtime Session
    supabase.channel(`exam_session_${squadSessionId}`)
        .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'squad_exam_sessions',
            filter: `id=eq.${squadSessionId}`
        }, payload => {
            const newAnswers = payload.new.answers_json;
            syncAnswersFromSquad(newAnswers);
        })
        .subscribe();
}

function syncAnswersFromSquad(newAnswers) {
    Object.keys(newAnswers).forEach(qId => {
        if (newAnswers[qId] !== userAnswers[qId]) {
            userAnswers[qId] = newAnswers[qId];
            updateQuestionUI(qId, newAnswers[qId]);
        }
    });
}

function updateQuestionUI(qId, answer) {
    const radio = document.querySelector(`input[name="q_${qId}"][value="${answer}"]`);
    if (radio) {
        radio.checked = true;
        // UI highlight
        const label = document.getElementById(`label-${qId}-${answer}`);
        if (label) {
            // Uncheck others first
            document.querySelectorAll(`label[id^="label-${qId}-"]`).forEach(l => l.classList.remove('checked'));
            label.classList.add('checked');
        }

        // Update dots
        const index = currentQuestions.findIndex(q => q.id === qId);
        const dots = document.querySelectorAll(`.nav-dot[data-qindex="${index}"]`);
        dots.forEach(dot => dot.classList.add('answered'));
    }
}

// Utility: Fisher-Yates Shuffle
function shuffleArray(array) {
    let currentIndex = array.length, randomIndex;
    while (currentIndex != 0) {
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;
        [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
    }
    return array;
}

function renderQuestions() {
    questionsContainer.innerHTML = "";

    currentQuestions.forEach((q, index) => {
        const card = document.createElement("div");
        card.className = "question-card";
        card.dataset.index = index;
        card.id = `q-card-${index}`;

        card.innerHTML = `
            <div class="q-meta">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <span class="q-tag">سؤال ${index + 1}</span>
                    <button class="flag-btn" onclick="toggleFlag(${index})" id="flag-btn-${index}">
                        <i class="far fa-bookmark"></i> علم السؤال
                    </button>
                </div>
                <span style="color: #718096; font-size: 0.9rem;">${currentQuestions.length} سؤال كلي</span>
            </div>
            <div class="question-text">${q.question_text || ''}</div>
            ${q.question_image ? `<img src="${q.question_image}" class="question-img" alt="سؤال" onclick="openLightbox(this.src)">` : ''}
            <div class="options-list">
                ${['a', 'b', 'c', 'd'].map(opt => {
            const isChecked = userAnswers[q.id] === opt;
            return `
                    <label class="option-label ${isChecked ? 'checked' : ''}" id="label-${q.id}-${opt}">
                         <input type="radio" name="q_${q.id}" value="${opt}" class="option-radio" 
                                ${isChecked ? 'checked' : ''} 
                                onchange="handleAnswerChange('${q.id}', '${opt}', ${index})">
                         <div class="option-content">
                            <span class="option-text">${q[`choice_${opt}`] || ''}</span>
                            ${q[`choice_${opt}_image`] ? `<img src="${q[`choice_${opt}_image`]}" class="choice-img" alt="خيار" onclick="event.preventDefault(); openLightbox(this.src)">` : ''}
                         </div>
                    </label>
                `;
        }).join('')}
            </div>
        `;
        questionsContainer.appendChild(card);
    });
}

function renderNavigator() {
    const grids = [desktopNavGrid, mobileNavGrid];
    grids.forEach(grid => {
        if (!grid) return;
        grid.innerHTML = "";
        currentQuestions.forEach((_, index) => {
            const dot = document.createElement("div");
            dot.className = "nav-dot";
            dot.dataset.qindex = index;
            dot.textContent = index + 1;

            // Restore state if answered
            if (userAnswers[currentQuestions[index].id]) {
                dot.classList.add('answered');
            }

            dot.onclick = () => {
                showQuestion(index);
                if (window.toggleDrawer && grid === mobileNavGrid) window.toggleDrawer();
            };
            grid.appendChild(dot);
        });
    });
}

window.handleAnswerChange = (qId, answer, index) => {
    saveAnswer(qId, answer);

    // UI Update: Highlight option
    const options = document.querySelectorAll(`input[name="q_${qId}"]`);
    options.forEach(opt => {
        const label = document.getElementById(`label-${qId}-${opt.value}`);
        if (label) label.classList.toggle('checked', opt.checked);
    });

    // Update navigator across both grids using data attribute
    const dots = document.querySelectorAll(`.nav-dot[data-qindex="${index}"]`);
    dots.forEach(dot => dot.classList.add('answered'));

    // Show Save Feedback
    showSaveIndicator();
};

window.toggleFlag = (index) => {
    const btn = document.getElementById(`flag-btn-${index}`);
    const dots = document.querySelectorAll(`.nav-dot[data-qindex="${index}"]`);

    if (flaggedQuestions.has(index)) {
        flaggedQuestions.delete(index);
        btn.classList.remove('active');
        btn.innerHTML = '<i class="far fa-bookmark"></i> علم السؤال';
        dots.forEach(dot => dot.classList.remove('flagged'));
    } else {
        flaggedQuestions.add(index);
        btn.classList.add('active');
        btn.innerHTML = '<i class="fas fa-bookmark"></i> مُعلّم';
        dots.forEach(dot => dot.classList.add('flagged'));
    }
}

function showSaveIndicator() {
    const badge = document.getElementById('saveBadge');
    if (!badge) return;
    badge.classList.add('show');
    setTimeout(() => badge.classList.remove('show'), 1500);
}

window.saveAnswer = async (qId, answer) => {
    userAnswers[qId] = answer;

    // Save to progress cache
    localStorage.setItem(`exam_progress_${examId}`, JSON.stringify(userAnswers));

    if (squadSessionId) {
        await supabase.from('squad_exam_sessions').update({
            answers_json: userAnswers
        }).eq('id', squadSessionId);
    }
};

function showQuestion(index) {
    if (index < 0 || index >= currentQuestions.length) return;

    const allCards = document.querySelectorAll(".question-card");
    allCards.forEach(c => c.classList.remove("active"));

    const targetCard = document.getElementById(`q-card-${index}`);
    if (targetCard) targetCard.classList.add("active");

    currentQuestionIndex = index;

    const progress = ((index + 1) / currentQuestions.length) * 100;
    progressBar.style.width = `${progress}%`;

    // Update Navigator Active State across both grids
    const allDots = document.querySelectorAll(".nav-dot");
    allDots.forEach(d => d.classList.remove("active"));
    const activeDots = document.querySelectorAll(`.nav-dot[data-qindex="${index}"]`);
    activeDots.forEach(d => d.classList.add("active"));

    // Nav Buttons
    prevBtn.style.opacity = index === 0 ? "0.3" : "1";
    prevBtn.style.pointerEvents = index === 0 ? "none" : "auto";

    if (index === currentQuestions.length - 1) {
        nextBtn.style.display = "none";
        submitBtn.style.display = "inline-block";
    } else {
        nextBtn.style.display = "inline-block";
        submitBtn.style.display = "none";
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Timer Functions
function startTimer() {
    timerInterval = setInterval(() => {
        timeElapsed++;
        updateTimerDisplay();

        // Warning when 2 minutes left
        if (totalTime - timeElapsed <= 120 && totalTime - timeElapsed > 0) {
            timerBox.classList.add('warning');
        }

        // Auto-submit when time is up
        if (timeElapsed >= totalTime) {
            clearInterval(timerInterval);
            calculateResult();
        }
    }, 1000);
}

function updateTimerDisplay() {
    const remaining = Math.max(0, totalTime - timeElapsed);
    const minutes = Math.floor(remaining / 60);
    const seconds = remaining % 60;
    timerDisplay.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${String(secs).padStart(2, '0')}`;
}

// Navigation Events
prevBtn.addEventListener("click", () => showQuestion(currentQuestionIndex - 1));
nextBtn.addEventListener("click", () => showQuestion(currentQuestionIndex + 1));

// Submit Logic with Warning
function handleFinishExam() {
    const totalQ = currentQuestions.length;
    const answeredQ = Object.keys(userAnswers).length;

    if (answeredQ < totalQ) {
        // Show Warning Modal
        document.getElementById('warningModal').style.display = 'flex';
        document.getElementById('warningOverlay').style.display = 'block';
    } else {
        calculateResult();
    }
}

submitBtn.addEventListener("click", handleFinishExam);
if (headerFinishBtn) {
    headerFinishBtn.addEventListener("click", handleFinishExam);
}

// Warning Modal Buttons
document.getElementById('continueExamBtn').addEventListener('click', () => {
    document.getElementById('warningModal').style.display = 'none';
    document.getElementById('warningOverlay').style.display = 'none';
});

document.getElementById('confirmSubmitAnywayBtn').addEventListener('click', () => {
    document.getElementById('warningModal').style.display = 'none';
    document.getElementById('warningOverlay').style.display = 'none';
    calculateResult();
});

async function calculateResult() {
    clearInterval(timerInterval);

    // UI Cleanup
    if (examFooter) examFooter.style.display = "none";
    if (headerFinishBtn) headerFinishBtn.style.display = "none";
    const progressWrapper = document.querySelector('.progress-wrapper');
    if (progressWrapper) progressWrapper.style.display = "none";
    const sidebar = document.querySelector('.nav-sidebar');
    const mobileToggle = document.querySelector('.mobile-nav-toggle');
    if (sidebar) sidebar.style.display = "none";
    if (mobileToggle) mobileToggle.style.display = "none";

    // Show Loading inside result view
    examView.style.display = "none";
    resultView.style.display = "block";
    const scoreValEl = document.getElementById("scoreValue");
    scoreValEl.innerHTML = '<i class="fas fa-spinner fa-spin" style="font-size:2rem;"></i>';

    try {
        // --- CLIENT SIDE CALCULATION ---
        let score = 0;
        let totalQuestions = currentQuestions.length;

        currentQuestions.forEach(q => {
            const userAnswer = userAnswers[q.id];
            if (userAnswer && userAnswer === q.correct_answer) {
                score++;
            }
        });

        const percentage = totalQuestions > 0 ? Math.round((score / totalQuestions) * 100) : 0;

        // 1. Get User ID
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("User not authenticated");

        // 2. Check Previous Attempts (BEFORE Inserting New Result)
        let isFirstAttempt = false;
        try {
            const { data: previousAttempts, error: checkError } = await supabase
                .from('results')
                .select('id')
                .eq('user_id', user.id)
                .eq('exam_id', examId)
                .limit(1);

            if (!checkError && (!previousAttempts || previousAttempts.length === 0)) {
                isFirstAttempt = true;
            }
        } catch (checkErr) {
            console.warn("Error checking attempts:", checkErr);
        }

        // 3. Insert Result
        const { error: insertError } = await supabase
            .from('results')
            .insert({
                user_id: user.id,
                exam_id: examId,
                score: score,
                total_questions: totalQuestions,
                answers: userAnswers,
                time_spent: timeElapsed
            });

        if (insertError) throw insertError;

        // 4. Update Points (If First Attempt)
        if (isFirstAttempt) {
            try {
                // Fetch current points
                const { data: profile } = await supabase.from('profiles').select('points').eq('id', user.id).single();
                const currentPoints = profile?.points || 0;
                const newPoints = currentPoints + score;

                // Update points for user
                await supabase.from('profiles').update({ points: newPoints }).eq('id', user.id);

                // SQUAD LOGIC: Award points to ALL squad members if in squad mode
                if (squadSessionId) {
                    const { data: members } = await supabase.from('squad_members').select('profile_id').eq('squad_id', squadId);

                    for (const member of members) {
                        if (member.profile_id === user.id) continue; // Already updated

                        const { data: mProfile } = await supabase.from('profiles').select('points').eq('id', member.profile_id).single();
                        const mPoints = (mProfile?.points || 0) + score;
                        await supabase.from('profiles').update({ points: mPoints }).eq('id', member.profile_id);
                    }

                    // Update squad total points
                    const { data: squad } = await supabase.from('squads').select('points').eq('id', squadId).single();
                    await supabase.from('squads').update({ points: (squad?.points || 0) + score }).eq('id', squadId);

                    // Close squad session
                    await supabase.from('squad_exam_sessions').update({ status: 'finished' }).eq('id', squadSessionId);
                }

                console.log(`Points awarded: ${score}. First attempt detected.`);

                // Show dedicated toast for points
                Swal.fire({
                    toast: true,
                    position: 'top-end',
                    icon: 'success',
                    title: `مبروك! كسبت ${score} نقطة 🎉`,
                    showConfirmButton: false,
                    timer: 3000
                });

            } catch (pointErr) {
                console.error("Points update logic failed:", pointErr);
            }
        } else {
            console.log("No points awarded. Not the first attempt.");
        }

        // --- 5. Clear Caches ---
        sessionStorage.removeItem(`exam_cache_${examId}`);
        localStorage.removeItem(`exam_progress_${examId}`);

        // --- UI UPDATES ---
        document.getElementById("correctCount").textContent = score;
        document.getElementById("wrongCount").textContent = totalQuestions - score;
        document.getElementById("timeSpent").textContent = formatTime(timeElapsed);

        // Show Hierarchy and Original Title
        const hierarchyEl = document.getElementById("examHierarchy");
        if (hierarchyEl) {
            let hText = "";
            if (hierarchyInfo.chapter) hText += hierarchyInfo.chapter;
            if (hierarchyInfo.lesson) hText += " ❯ " + hierarchyInfo.lesson;
            hText += " ❯ " + examTitle;
            hierarchyEl.textContent = hText;
        }

        if (examTitleMobile) {
            examTitleMobile.innerHTML = `${examTitle} <span style="font-size:0.75rem; color:var(--primary-color); font-weight:normal; margin-right:5px;">(مراجعة)</span>`;
        }

        if (timerBox) {
            timerBox.style.display = "flex";
            timerBox.innerHTML = `<i class="fas fa-chart-line" style="font-size:0.8rem;"></i> <span style="font-weight:900;">${percentage}%</span>`;
        }

        // Animate Score
        let currentCountAnim = 0;
        scoreValEl.textContent = "0%";
        const animTimer = setInterval(() => {
            if (percentage === 0) {
                scoreValEl.textContent = "0%";
                clearInterval(animTimer);
                return;
            }
            currentCountAnim += 1;
            scoreValEl.textContent = `${currentCountAnim}%`;
            if (currentCountAnim >= percentage) clearInterval(animTimer);
        }, 15);

        const resultTitle = document.getElementById("resultTitle");
        const resultMsg = document.getElementById("resultMessage");

        if (percentage >= 85) {
            resultTitle.textContent = "ممتاز يا بطل! 🥇";
            resultTitle.style.color = "var(--primary-color)";
            resultMsg.textContent = `جبت ${score} من ${totalQuestions}. أداء رائع، كمل بنفس المستوى!`;
        } else if (percentage >= 50) {
            resultTitle.textContent = "جيد جداً 👍";
            resultTitle.style.color = "var(--secondary-color)";
            resultMsg.textContent = `جبت ${score} من ${totalQuestions}. محتاج شوية تركيز المرة الجاية.`;
        } else {
            resultTitle.textContent = "محتاج تذاكر تاني 📚";
            resultTitle.style.color = "#EF4444";
            resultMsg.textContent = `جبت ${score} من ${totalQuestions}. راجع الدرس وحاول تاني.`;
        }

    } catch (err) {
        console.error("Submission Error:", err);
        Swal.fire({
            icon: 'error',
            title: 'خطأ',
            text: 'فشل في إرسال النتيجة. تأكد من اتصال الإنترنت.',
            confirmButtonText: 'حسناً'
        });
        scoreValEl.innerHTML = '<span style="color:red; font-size:1rem;">فشل الإرسال</span>';
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Note: saveResultToDatabase is now handled server-side via RPC submit_exam


// Review Functions
function renderReview() {
    reviewContainer.innerHTML = "";

    const wrongQuestions = [];
    const unansweredQuestions = [];
    const correctQuestions = [];

    currentQuestions.forEach(q => {
        const userAnswer = userAnswers[q.id];
        const isCorrect = userAnswer === q.correct_answer;

        if (!userAnswer) {
            unansweredQuestions.push(q);
        } else if (isCorrect) {
            correctQuestions.push(q);
        } else {
            wrongQuestions.push(q);
        }
    });

    // 1. Wrong Questions
    if (wrongQuestions.length > 0) {
        renderSection("إجابات خاطئة ❌", "wrong", wrongQuestions);
    }

    // 2. Unanswered Questions
    if (unansweredQuestions.length > 0) {
        renderSection("أسئلة لم يتم حلها ⚠️", "unanswered", unansweredQuestions);
    }

    // 3. Correct Questions
    if (correctQuestions.length > 0) {
        renderSection("إجابات صحيحة ✅", "correct", correctQuestions);
    }
}

function renderSection(title, type, questions) {
    const sectionTitle = document.createElement("div");
    sectionTitle.className = "review-section-title";
    const icon = type === 'wrong' ? 'fa-times-circle' : (type === 'correct' ? 'fa-check-circle' : 'fa-exclamation-circle');
    const color = type === 'wrong' ? '#ef4444' : (type === 'correct' ? '#10b981' : '#f59e0b');

    sectionTitle.innerHTML = `<i class="fas ${icon}" style="color: ${color}"></i> ${title}`;
    reviewContainer.appendChild(sectionTitle);

    questions.forEach((q) => {
        const index = currentQuestions.findIndex(origQ => origQ.id === q.id);
        const userAnswer = userAnswers[q.id];
        const correctAnswer = q.correct_answer;
        const isCorrect = userAnswer === correctAnswer;

        const reviewCard = document.createElement("div");
        reviewCard.className = `review-question ${isCorrect ? 'correct' : (userAnswer ? 'wrong' : 'unanswered')}`;

        // Build options HTML
        let optionsHTML = '';
        const choiceKeys = ['a', 'b', 'c', 'd'];

        for (const key of choiceKeys) {
            let optionClass = '';
            let icon = '';
            const text = q[`choice_${key}`] || '';
            const img = q[`choice_${key}_image`];

            if (key === correctAnswer) {
                optionClass = 'correct-answer';
                icon = '<i class="fas fa-check-circle" style="color: #10B981; margin-left: 0.5rem;"></i>';
            } else if (key === userAnswer) {
                optionClass = 'user-wrong';
                icon = '<i class="fas fa-times-circle" style="color: #EF4444; margin-left: 0.5rem;"></i>';
            }

            let content = '';
            content += `<span style="margin-left:5px;">${text}</span>`;
            if (img) content += `<img src="${img}" class="choice-img" style="margin-right:5px;" onclick="openLightbox(this.src)">`;

            optionsHTML += `<div class="review-option ${optionClass}" style="display: flex; align-items: center; justify-content: space-between;">
                <div style="display:flex; align-items:center;">${content}</div>
                ${icon}
            </div>`;
        }

        let explanationHTML = q.explanation ? `<div class="review-explanation"><strong><i class="fas fa-lightbulb"></i> الشرح:</strong> ${q.explanation}</div>` : '';

        reviewCard.innerHTML = `
            <div class="review-header">
                <span style="font-weight: bold; color: var(--text-dark);">سؤال ${index + 1}</span>
                <span class="review-status ${isCorrect ? 'correct' : (userAnswer ? 'wrong' : 'unanswered')}">
                    ${isCorrect ? '✓ إجابة صحيحة' : (userAnswer ? '✗ إجابة خاطئة' : '⚠️ لم يتم الحل')}
                </span>
            </div>
            <div class="question-text" style="font-size: 1rem; margin-bottom: 1rem;">${q.question_text || ''}</div>
            ${q.question_image ? `<img src="${q.question_image}" class="question-img" style="max-height:200px; margin-top:0.5rem;" onclick="openLightbox(this.src)">` : ''}
            ${optionsHTML}
            ${explanationHTML}
        `;
        reviewContainer.appendChild(reviewCard);
    });
}

// Scroll Top Logic
const scrollTopBtn = document.getElementById("scrollTopBtn");
const mainWrapper = document.querySelector('.main-wrapper');

if (mainWrapper && scrollTopBtn) {
    mainWrapper.onscroll = function () {
        if (mainWrapper.scrollTop > 500) {
            scrollTopBtn.classList.add("show");
        } else {
            scrollTopBtn.classList.remove("show");
        }
    };

    scrollTopBtn.onclick = function () {
        mainWrapper.scrollTo({ top: 0, behavior: 'smooth' });
    };
}

// Event Listeners for Review
if (reviewBtn) {
    reviewBtn.addEventListener("click", () => {
        resultView.style.display = "none";
        reviewView.style.display = "block";
        renderReview();
        window.scrollTo(0, 0);
    });
}

if (backToResultBtn) {
    backToResultBtn.addEventListener("click", () => {
        reviewView.style.display = "none";
        resultView.style.display = "block";
        window.scrollTo(0, 0);
    });
}

// Init
initExam();

// Lightbox Logic
window.openLightbox = (src) => {
    let lightbox = document.getElementById('imageLightbox');
    if (!lightbox) {
        lightbox = document.createElement('div');
        lightbox.id = 'imageLightbox';
        lightbox.innerHTML = `
            <span class="close-lightbox" onclick="closeLightbox()">&times;</span>
            <img class="lightbox-content" id="lightboxImg">
        `;
        document.body.appendChild(lightbox);

        // Close on background click
        lightbox.addEventListener('click', (e) => {
            if (e.target === lightbox) closeLightbox();
        });
    }
    const img = document.getElementById('lightboxImg');
    img.src = src;
    lightbox.style.display = 'block';
};

window.closeLightbox = () => {
    const lightbox = document.getElementById('imageLightbox');
    if (lightbox) lightbox.style.display = 'none';
};
