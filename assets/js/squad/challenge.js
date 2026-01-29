// Squad Challenge System Module
import { supabase } from '../supabaseClient.js';
import { generateAvatar } from '../avatars.js';
import {
    currentSquad, currentProfile, userResults, globalSquadSettings,
    challengeTimerInterval, setChallengeTimerInterval
} from './state.js';

/**
 * Load and display active challenge
 */
export async function loadActiveChallenge() {
    const { data: activeChallenge } = await supabase
        .from('squad_exam_challenges')
        .select(`
            id, exam_id, created_at, expires_at, status, squad_points_awarded,
            exams(
                title,
                lessons(title, chapters(title, subjects(name_ar)))
            )
        `)
        .eq('squad_id', currentSquad.id)
        .eq('status', 'active')
        .maybeSingle();

    const defaultState = document.getElementById('defaultChallengeState');
    const activeState = document.getElementById('activeChallengeState');

    if (!activeChallenge) {
        defaultState.style.display = 'block';
        activeState.style.display = 'none';
        return;
    }

    defaultState.style.display = 'none';
    activeState.style.display = 'block';

    // Build exam hierarchy
    const exam = activeChallenge.exams;
    const lesson = exam?.lessons;
    const chapter = lesson?.chapters;
    const subject = chapter?.subjects;

    // Fetch participants with profile data
    const { data: cmdMessages } = await supabase
        .from('squad_chat_messages')
        .select('sender_id, text, profiles!sender_id(full_name, avatar_url)')
        .eq('challenge_id', activeChallenge.id)
        .like('text', '[CMD:%');

    // Process participants
    const participants = {};
    (cmdMessages || []).forEach(msg => {
        const userId = msg.sender_id;
        const name = msg.profiles?.full_name?.split(' ')[0] || 'طالب';
        const avatar_url = msg.profiles?.avatar_url;

        if (msg.text === '[CMD:JOIN]') {
            if (!participants[userId]) {
                participants[userId] = { user_id: userId, name, avatar_url, status: 'joined' };
            }
        } else if (msg.text.startsWith('[CMD:FINISH:')) {
            const score = msg.text.split(':')[2].replace(']', '');
            participants[userId] = { user_id: userId, name, avatar_url, status: 'finished', score };
        }
    });

    const participantList = Object.values(participants);
    const joinedList = participantList.filter(p => p.status === 'joined');
    const finishedList = participantList.filter(p => p.status === 'finished');

    // Calculate progress - Using Dynamic Settings from Database
    const totalMembers = currentSquad.members?.length || 1;
    const progressPercent = Math.min(100, Math.round((finishedList.length / totalMembers) * 100));

    // Get success threshold from database settings (default to 50% if not set)
    const successThresholdPercent = globalSquadSettings.success_threshold || 50;

    // Calculate required number of finishers based on threshold percentage
    const requiredFinishers = Math.ceil((successThresholdPercent / 100) * totalMembers);

    // Time calculations
    const expiresAt = new Date(activeChallenge.expires_at).getTime();
    const now = Date.now();
    const diff = expiresAt - now;
    const isExpired = diff <= 0;
    const mins = Math.floor(Math.max(0, diff) / (1000 * 60));
    const secs = Math.floor((Math.max(0, diff) / 1000) % 60);

    // Determine user status
    const myId = currentProfile.id;
    const myParticipation = participants[myId];
    const isAdmin = currentSquad.owner_id === myId || currentSquad.admins?.includes(myId);
    const resultsForThisExam = userResults.filter(r => r.exam_id === activeChallenge.exam_id);
    const hasOldResult = resultsForThisExam.length > 0;

    // Determine button state
    let btnState = 'fresh';
    if (isExpired) {
        btnState = 'expired';
    } else if (myParticipation?.status === 'finished') {
        btnState = 'completed';
    } else if (myParticipation?.status === 'joined') {
        btnState = 'resume';
    } else if (hasOldResult) {
        btnState = 'help';
    }

    // Button configurations
    const btnConfigs = {
        'fresh': {
            text: 'خش دلوقتي 🚀',
            class: 'btn-primary',
            disabled: false
        },
        'resume': {
            text: 'كمل الامتحان ↩️',
            class: 'btn-secondary',
            disabled: false,
            notice: '<div style="background: #EFF6FF; border: 1px solid #BFDBFE; border-radius: 10px; padding: 12px; margin-top: 12px; font-size: 0.85rem; color: #1E40AF; font-weight: 600; text-align: center;">💡 أنت سجلت دخول بالفعل.. كمل حلك</div>'
        },
        'help': {
            text: 'خش ساعد 🤝',
            class: 'btn-secondary',
            disabled: false,
            notice: '<div style="background: #F8FAFC; border: 1px solid #CBD5E1; border-radius: 10px; padding: 12px; margin-top: 12px; font-size: 0.85rem; color: #475569; font-weight: 600; text-align: center;">ℹ️ مش هتاخد النقط كاملة، هتاخد البونص بس</div>'
        },
        'completed': {
            text: 'تم الحل ✅',
            class: 'btn-outline',
            disabled: true
        },
        'expired': {
            text: 'الوقت خلص ⏱️',
            class: 'btn-outline',
            disabled: true
        }
    };

    const config = btnConfigs[btnState];

    // Build exam details (subject bold)
    const examTitleParts = [];
    if (subject?.name_ar) examTitleParts.push(`<strong style="font-weight: 800;">${subject.name_ar}</strong>`);
    if (chapter?.title) examTitleParts.push(chapter.title);
    if (lesson?.title) examTitleParts.push(lesson.title);
    if (exam?.title) examTitleParts.push(exam.title);
    const fullExamTitle = examTitleParts.join(' • ');

    // Build participants HTML
    let participantsHtml = '';
    if (participantList.length > 0) {
        participantsHtml = `
            <div style="background: #fff; border-radius: 16px; padding: 20px; margin-top: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid #E5E7EB;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <i class="fas fa-users" style="color: #6B7280; font-size: 1rem;"></i>
                        <span style="font-size: 0.9rem; color: #1F2937; font-weight: 700;">المشاركين</span>
                    </div>
                    <span style="background: #E5E7EB; color: #4B5563; padding: 4px 12px; border-radius: 12px; font-size: 0.75rem; font-weight: 700;">${participantList.length}</span>
                </div>

                ${joinedList.length > 0 ? `
                    <div style="margin-bottom: ${finishedList.length > 0 ? '16px' : '0'};">
                        <div style="font-size: 0.75rem; color: #6B7280; font-weight: 700; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.5px;">
                            <i class="fas fa-circle" style="font-size: 0.4rem; color: #3B82F6; margin-left: 6px; animation: pulse 2s infinite;"></i>
                            بيحلوا دلوقتي (${joinedList.length})
                        </div>
                        <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                            ${joinedList.map(p => {
            const avatarUrl = p.avatar_url || generateAvatar(p.name, 'bottts');
            return `
                                    <div style="display: inline-flex; align-items: center; gap: 6px; background: #EFF6FF; padding: 6px 10px; border-radius: 20px; border: 1px solid #DBEAFE;">
                                        <img src="${avatarUrl}" style="width: 20px; height: 20px; border-radius: 50%;" />
                                        <span style="font-size: 0.75rem; color: #1E40AF; font-weight: 600;">${p.name}</span>
                                    </div>
                                `;
        }).join('')}
                        </div>
                    </div>
                ` : ''}

                ${finishedList.length > 0 ? `
                    <div>
                        <div style="font-size: 0.75rem; color: #6B7280; font-weight: 700; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.5px;">
                            <i class="fas fa-check" style="font-size: 0.6rem; color: #10B981; margin-left: 6px;"></i>
                            خلصوا (${finishedList.length})
                        </div>
                        <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                            ${finishedList.map(p => {
            const avatarUrl = p.avatar_url || generateAvatar(p.name, 'bottts');
            const scoreText = p.score === 'HIDDEN' ? '✓' : `${p.score}%`;
            const isPerfect = p.score === '100';
            return `
                                    <div style="display: inline-flex; align-items: center; gap: 6px; background: ${isPerfect ? '#FEF3C7' : '#ECFDF5'}; padding: 6px 10px; border-radius: 20px; border: 1px solid ${isPerfect ? '#FDE68A' : '#D1FAE5'};">
                                        <img src="${avatarUrl}" style="width: 20px; height: 20px; border-radius: 50%;" />
                                        <span style="font-size: 0.75rem; color: ${isPerfect ? '#92400E' : '#065F46'}; font-weight: 600;">${p.name}</span>
                                        <span style="background: ${isPerfect ? '#F59E0B' : '#10B981'}; color: #fff; padding: 2px 6px; border-radius: 8px; font-size: 0.65rem; font-weight: 800;">${scoreText}</span>
                                    </div>
                                `;
        }).join('')}
                        </div>
                    </div>
                ` : ''}
            </div>
        `;
    }

    // Render active challenge UI
    activeState.innerHTML = `
        <div style="">
            
            <!-- Header -->
            <div style="background: linear-gradient(135deg, #06B6D4, #0891B2); color: #fff; padding: 16px 20px; border-radius: 16px; margin-bottom: 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); text-align: center;">
                <div style="font-size: 0.85rem; font-weight: 700; opacity: 0.95; letter-spacing: 0.5px;">
                    <i class="fas fa-fire-alt" style="margin-left: 6px;"></i>
                    امتحان جماعي شغال دلوقتي
                </div>
            </div>

            <!-- Exam Info + Timer (Side by Side) -->
            <div class="challenge-header-flex">
                
                <!-- Exam Details -->
                <div class="exam-details">
                    <div style="font-size: 0.75rem; color: #6B7280; font-weight: 700; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px;">
                        <i class="fas fa-book-open" style="margin-left: 6px; color: #06B6D4;"></i>
                        تفاصيل الامتحان
                    </div>
                    <div style="font-size: 0.9rem; color: #1F2937; font-weight: 600; line-height: 1.5;">
                        ${fullExamTitle}
                    </div>
                </div>

                <!-- Status Box (Timer or Expired) -->
                <div class="status-box" style="border: ${isExpired ? '1px solid #FCA5A5' : 'none'};">
                    ${!isExpired ? `
                        <i class="fas fa-clock" style="color: #3B82F6; font-size: 1.2rem;"></i>
                        <div id="challenge-countdown" style="font-size: 1.5rem; color: #1F2937; font-weight: 900; font-family: 'Courier New', monospace; letter-spacing: 1px;">
                            <span class="timer-val">${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}</span>
                        </div>
                    ` : `
                        <i class="fas fa-hourglass-end" style="color: #DC2626; font-size: 1.1rem;"></i>
                        <div style="font-size: 0.8rem; font-weight: 700; color: #DC2626; line-height: 1.2; text-align: center;">الوقت خلص ⏱️</div>
                    `}
                </div>
            </div>

            <!-- Progress Card -->
            <div style="background: #fff; padding: 20px; border-radius: 16px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                
                <!-- Progress Bar -->
                <div style="position: relative; margin-bottom: 12px;">
                    <div style="height: 16px; background: #F3F4F6; border-radius: 8px; overflow: visible; position: relative;">
                        <div style="position: absolute; left: 0; top: 0; height: 100%; width: ${progressPercent}%; background: linear-gradient(to left, #10B981, #059669); border-radius: 8px; transition: width 1s ease;"></div>
                        
                        <!-- Threshold Marker - FIXED VISIBILITY -->
                        <div style="position: absolute; left: ${successThresholdPercent}%; top: 50%; transform: translate(-50%, -50%); z-index: 100;">
                            <div style="border: 7px solid; border-color: #EF4444 transparent transparent; position: relative; top: -7px;"></div>
                            <div style="position: absolute; top: -26px; left: 50%; transform: translateX(-50%); background: #EF4444; color: #fff; padding: 3px 8px; border-radius: 6px; font-size: 0.65rem; font-weight: 800; white-space: nowrap;">
                                ${successThresholdPercent}%
                            </div>
                        </div>
                    </div>
                    
                    <div style="display: flex; justify-content: space-between; margin-top: 8px; font-size: 0.7rem; font-weight: 600; color: #6B7280;">
                        <span>التقدم: ${progressPercent}%</span>
                        <span>المطلوب: ${requiredFinishers}</span>
                    </div>
                </div>
                
                <!-- Action Buttons (Side by Side) -->
                <div style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
                    <button class="btn ${config.class}" 
                            style="padding: 12px 24px; font-size: 0.9rem; font-weight: 800; border-radius: 12px; display: flex; align-items: center; gap: 6px;" 
                            onclick="window.joinChallengeExam('${activeChallenge.exam_id}', '${activeChallenge.id}', '${btnState}')"
                            ${config.disabled ? 'disabled' : ''}>
                        ${config.text}
                    </button>
                    ${isAdmin ? `
                        <button class="btn btn-danger" 
                                style="padding: 12px 24px; font-size: 0.85rem; font-weight: 700; border-radius: 12px; display: flex; align-items: center; gap: 6px;" 
                                onclick="window.endActiveChallenge('${activeChallenge.id}')">
                            <i class="fas fa-times-circle"></i> انهي الامتحان
                        </button>
                    ` : ''}
                </div>

                ${config.notice || ''}
            </div>

            <!-- Participants -->
            ${participantsHtml}
        </div>
    `;

    // Start timer if not expired
    if (!isExpired) {
        startChallengeTimer(expiresAt, activeChallenge.id);
    }
}

/**
 * Start challenge countdown timer
 */
function startChallengeTimer(expiresAt, challengeId) {
    if (challengeTimerInterval) clearInterval(challengeTimerInterval);

    const updateTimer = () => {
        const el = document.getElementById('challenge-countdown');
        if (!el) {
            clearInterval(challengeTimerInterval);
            return;
        }

        const diff = expiresAt - Date.now();
        if (diff <= 0) {
            clearInterval(challengeTimerInterval);

            // Trigger grace period check
            const gracePeriod = expiresAt + (globalSquadSettings.grace_mins * 60 * 1000);
            const checkGrace = async () => {
                if (Date.now() > gracePeriod) {
                    if (challengeId) {
                        await supabase.rpc('finalize_squad_challenge', { p_challenge_id: challengeId });
                        loadActiveChallenge();
                    }
                } else {
                    setTimeout(checkGrace, 10000);
                }
            };
            checkGrace();

            el.innerHTML = '<span>الوقت خلص</span>';
            return;
        }

        const mins = Math.floor(diff / (1000 * 60));
        const secs = Math.floor((diff / 1000) % 60);

        const timerVal = el.querySelector('.timer-val');
        if (timerVal) timerVal.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    setChallengeTimerInterval(interval);
}

/**
 * Join challenge exam
 */
window.joinChallengeExam = async (examId, challengeId, state) => {
    // Check if expired
    const { data: challenge } = await supabase
        .from('squad_exam_challenges')
        .select('expires_at')
        .eq('id', challengeId)
        .single();

    if (challenge && Date.now() > new Date(challenge.expires_at).getTime()) {
        Swal.fire({
            title: 'الوقت خلص⏱️',
            text: 'معلش باب الانضمام قفل من شوية',
            icon: 'warning',
            confirmButtonText: 'ماشي'
        });
        return;
    }

    // Send CMD:JOIN signal if fresh join
    if (state === 'fresh' || state === 'help') {
        await supabase.from('squad_chat_messages').insert({
            squad_id: currentSquad.id,
            sender_id: currentProfile.id,
            challenge_id: challengeId,
            text: '[CMD:JOIN]'
        });
    }

    // Redirect to exam
    window.location.href = `exam.html?id=${examId}&squad_id=${currentSquad.id}&challenge_id=${challengeId}`;
};

/**
 * End active challenge (admin only)
 */
window.endActiveChallenge = async (challengeId) => {
    if (!challengeId) return;

    const { isConfirmed } = await Swal.fire({
        title: 'إنهاء التحدي؟',
        text: 'هيتم حساب النقاط وتوزيع المكافآت على المشاركين.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'نعم، أنهي التحدي',
        cancelButtonText: 'إلغاء'
    });

    if (isConfirmed) {
        const { data, error } = await supabase.rpc('end_challenge_manually', { p_challenge_id: challengeId });

        if (error) {
            Swal.fire('خطأ', error.message || 'حصل خطأ في إنهاء التحدي', 'error');
        } else if (data?.success) {
            Swal.fire('تم!', 'تم إنهاء التحدي بنجاح 🎉', 'success');
            loadActiveChallenge();
            const { loadChat } = await import('./chat.js');
            loadChat(); // Refresh chat to show completion message
        } else {
            Swal.fire('خطأ', data?.error || 'حصل خطأ', 'error');
        }
    }
};
