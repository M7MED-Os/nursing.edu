// Squad Challenge System Module
import { supabase } from '../supabaseClient.js';
import { generateAvatar, calculateLevel, getLevelColor } from '../avatars.js';
import { createLevelBadge } from '../level-badge.js';
import { shouldShowAvatar } from '../privacy.js';
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

        // No active challenge, check for recently completed one to show summary
        checkRecentlyCompletedChallenge();
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
        .select('sender_id, text, profiles!sender_id(full_name, avatar_url, points, privacy_avatar)')
        .eq('challenge_id', activeChallenge.id)
        .like('text', '[CMD:%');

    // Process participants
    const participants = {};
    (cmdMessages || []).forEach(msg => {
        const userId = msg.sender_id;
        const profile = msg.profiles || {};
        const name = profile.full_name?.split(' ')[0] || 'طالب';
        const avatar_url = profile.avatar_url;
        const points = profile.points || 0;
        const privacy_avatar = profile.privacy_avatar;

        if (msg.text === '[CMD:JOIN]') {
            if (!participants[userId]) {
                participants[userId] = { user_id: userId, name, avatar_url, points, privacy_avatar, status: 'joined' };
            }
        } else if (msg.text.startsWith('[CMD:FINISH:')) {
            const score = msg.text.split(':')[2].replace(']', '');
            participants[userId] = { user_id: userId, name, avatar_url, points, privacy_avatar, status: 'finished', score };
        }
    });

    const participantList = Object.values(participants);
    const joinedList = participantList.filter(p => p.status === 'joined');
    const finishedList = participantList.filter(p => p.status === 'finished');

    // Sort finished list by score descending for leaderboard
    finishedList.sort((a, b) => (parseInt(b.score) || 0) - (parseInt(a.score) || 0));

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
                    <div style="margin-bottom: ${finishedList.length > 0 ? '20px' : '0'};">
                        <div style="font-size: 0.75rem; color: #6B7280; font-weight: 700; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.5px; display: flex; align-items: center; gap: 8px;">
                            <i class="fas fa-circle" style="font-size: 0.5rem; color: #3B82F6; animation: pulse 2s infinite;"></i>
                            بيحلوا دلوقتي (${joinedList.length})
                        </div>
                        <div style="display: flex; flex-direction: column; gap: 10px;">
                            ${joinedList.map(p => {
            const level = calculateLevel(p.points);
            const levelColor = getLevelColor(level);
            const levelBadgeHTML = createLevelBadge(p.points, 'xsmall');
            const showAvatar = shouldShowAvatar(p.privacy_avatar, p.user_id, myId, currentSquad.id, currentSquad.id);
            const avatarUrl = p.avatar_url || generateAvatar(p.name, 'initials');

            return `
                                    <div style="display: flex; align-items: center; gap: 12px; background: #F8FAFC; padding: 10px; border-radius: 12px; border: 1px solid #E2E8F0;">
                                        <div style="position: relative; display: inline-block;">
                                            <img src="${avatarUrl}" style="width: 38px; height: 38px; border-radius: 50%; border: 2px solid ${levelColor}; object-fit: cover; opacity: ${showAvatar ? '1' : '0.5'};" />
                                            <div style="position: absolute; bottom: -2px; left: -2px; z-index: 5;">${levelBadgeHTML}</div>
                                        </div>
                                        <span style="font-size: 0.85rem; color: #1e293b; font-weight: 700; flex: 1;">${p.name}</span>
                                        <span style="font-size: 0.7rem; color: #3B82F6; font-weight: 600; background: #DBEAFE; padding: 2px 8px; border-radius: 8px;">بيحل...</span>
                                    </div>
                                `;
        }).join('')}
                        </div>
                    </div>
                ` : ''}

                ${finishedList.length > 0 ? `
                    <div>
                        <div style="font-size: 0.75rem; color: #6B7280; font-weight: 700; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.5px; display: flex; align-items: center; gap: 8px;">
                            <i class="fas fa-trophy" style="font-size: 0.8rem; color: #F59E0B;"></i>
                            ترتيب النتائج (${finishedList.length})
                        </div>
                        <div style="display: flex; flex-direction: column; gap: 10px;">
                            ${finishedList.map((p, index) => {
            const level = calculateLevel(p.points);
            const levelColor = getLevelColor(level);
            const levelBadgeHTML = createLevelBadge(p.points, 'xsmall');
            const showAvatar = shouldShowAvatar(p.privacy_avatar, p.user_id, myId, currentSquad.id, currentSquad.id);
            const avatarUrl = p.avatar_url || generateAvatar(p.name, 'initials');
            const scoreText = p.score === 'HIDDEN' ? '' : `${p.score}%`;
            const isTop1 = index === 0;
            const isTop2 = index === 1;
            const isTop3 = index === 2;
            const isTopRank = index < 3;

            // High-intensity background and border logic
            let rowBg = `${levelColor}10`;
            let rowBorder = `${levelColor}25`;
            let animation = '';
            let flameSize = 'small';

            if (isTop1) {
                rowBg = 'linear-gradient(-45deg, #fff7ed, #ffedd5, #fef3c7, #fff7ed)';
                rowBorder = '#f97316';
                animation = 'magma-flow 3s ease infinite, fire-glow 2s infinite ease-in-out';
                flameSize = 'large';
            } else if (isTopRank) {
                rowBg = 'linear-gradient(to left, #fff7ed, #ffffff)';
                rowBorder = isTop2 ? '#fb923c' : '#fdba74';
                animation = 'fire-glow 3s infinite ease-in-out';
            }

            return `
                                    <div style="display: flex; align-items: center; gap: 12px; background: ${rowBg}; background-size: 400% 400%; padding: 12px 10px; border-radius: 14px; border: 2px solid ${rowBorder}; animation: ${animation}; position: relative; overflow: hidden; transition: all 0.3s ease;">
                                        ${isTop1 ? `<div style="position: absolute; left: 0; top: 0; height: 100%; width: 6px; background: linear-gradient(to bottom, #f97316, #fbbf24);"></div>` : ''}
                                        
                                        <div style="position: relative; display: inline-block;">
                                            <img src="${avatarUrl}" style="width: ${isTop1 ? '52' : '44'}px; height: ${isTop1 ? '52' : '44'}px; border-radius: 50%; border: ${isTop1 ? '4px' : '3px'} solid ${isTop1 ? '#f97316' : levelColor}; object-fit: cover; transition: transform 0.3s ease; ${isTop1 ? 'animation: pulse 2s infinite;' : ''}" />
                                            <div style="position: absolute; bottom: -4px; left: -4px; z-index: 5;">${levelBadgeHTML}</div>
                                        </div>

                                        <div style="flex: 1; display: flex; align-items: center; gap: 8px;">
                                            <div style="display: flex; flex-direction: column;">
                                                <span style="font-size: ${isTop1 ? '1.05rem' : '0.9rem'}; color: #1e293b; font-weight: 900;">${p.name}</span>
                                                ${isTopRank ? `<div style="display: flex; align-items: center; gap: 4px; font-size: 0.65rem; color: #f97316; font-weight: 800; text-transform: uppercase;">
                                                    <div class="squad-flame" style="width: 8px; height: 8px; box-shadow: 0 0 5px #f97316;"></div>
                                                    ${index + 1}st Rank
                                                </div>` : ''}
                                            </div>
                                        </div>

                                        <div style="display: flex; align-items: center; gap: 10px;">
                                            ${isTop1 ? '<div class="squad-flame" style="margin-left: 5px;"></div>' : ''}
                                            <div style="text-align: left;">
                                                ${scoreText ? `
                                                    <span style="background: linear-gradient(135deg, ${isTop1 ? '#f97316' : levelColor}, ${isTop1 ? '#ea580c' : levelColor}); color: #fff; padding: 6px 14px; border-radius: 12px; font-size: 0.95rem; font-weight: 900; box-shadow: 0 4px 6px ${isTop1 ? '#f9731650' : levelColor + '30'};">
                                                        ${scoreText}
                                                    </span>
                                                ` : '<i class="fas fa-check-circle" style="color: #10B981; font-size: 1.25rem;"></i>'}
                                            </div>
                                        </div>
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

/**
 * Check for the most recently completed challenge and show summary popup once
 */
export async function checkRecentlyCompletedChallenge() {
    try {
        // Fetch the last 2 challenges (to ensure we find the latest completed one)
        const { data: recentChallenges } = await supabase
            .from('squad_exam_challenges')
            .select(`
                id, exam_id, created_at, status, squad_points_awarded,
                exams(title, lessons(title, chapters(title, subjects(name_ar))))
            `)
            .eq('squad_id', currentSquad.id)
            .neq('status', 'active')
            .order('created_at', { ascending: false })
            .limit(1);

        if (!recentChallenges || recentChallenges.length === 0) return;

        const lastChallenge = recentChallenges[0];
        const storageKey = `squad_challenge_summary_${lastChallenge.id}`;

        // If we already showed this summary, stop
        if (localStorage.getItem(storageKey)) return;

        // Fetch results for this specific challenge
        const { data: cmdMessages } = await supabase
            .from('squad_chat_messages')
            .select('sender_id, text, profiles!sender_id(full_name, avatar_url, points, privacy_avatar)')
            .eq('challenge_id', lastChallenge.id)
            .like('text', '[CMD:%');

        if (!cmdMessages) return;

        // Process participants
        const participants = {};
        cmdMessages.forEach(msg => {
            const userId = msg.sender_id;
            const profile = msg.profiles || {};
            const name = profile.full_name?.split(' ')[0] || 'طالب';
            const avatarUrl = profile.avatar_url;
            const points = profile.points || 0;
            const privacyAvatar = profile.privacy_avatar;

            if (msg.text === '[CMD:JOIN]') {
                if (!participants[userId]) {
                    participants[userId] = { user_id: userId, name, avatarUrl, points, privacyAvatar, status: 'joined' };
                }
            } else if (msg.text.startsWith('[CMD:FINISH:')) {
                const score = msg.text.split(':')[2].replace(']', '');
                participants[userId] = { user_id: userId, name, avatarUrl, points, privacyAvatar, status: 'finished', score };
            }
        });

        const finishedList = Object.values(participants)
            .filter(p => p.status === 'finished')
            .sort((a, b) => (parseInt(b.score) || 0) - (parseInt(a.score) || 0));

        if (finishedList.length === 0) return;

        // Build Leaderboard HTML for the popup
        const myId = currentProfile.id;
        const examTitle = lastChallenge.exams?.title || 'امتحان الشلة';
        const pointsAwarded = lastChallenge.squad_points_awarded > 0;

        let leaderboardHtml = finishedList.map((p, index) => {
            const level = calculateLevel(p.points);
            const levelColor = getLevelColor(level);
            const showAvatar = shouldShowAvatar(p.privacyAvatar, p.user_id, myId, currentSquad.id, currentSquad.id);
            const avatarUrl = p.avatarUrl || generateAvatar(p.name, 'initials');
            const isTop1 = index === 0;
            const isTopRank = index < 3;

            return `
                <div style="display: flex; align-items: center; gap: 10px; background: ${isTop1 ? 'linear-gradient(135deg, #fff7ed, #fff)' : '#f8fafc'}; padding: 10px; border-radius: 12px; border: 1px solid ${isTop1 ? '#f97316' : '#e2e8f0'}; margin-bottom: 8px;">
                    <div style="position: relative;">
                        <img src="${avatarUrl}" style="width: 35px; height: 35px; border-radius: 50%; border: 2px solid ${levelColor};" />
                    </div>
                    <div style="flex: 1; text-align: right;">
                        <span style="font-weight: 800; font-size: 0.85rem;">${p.name}</span>
                        ${isTopRank ? '<i class="fas fa-fire" style="color: #ef4444; font-size: 0.7rem; margin-right: 4px;"></i>' : ''}
                    </div>
                    <span style="background: ${levelColor}; color: white; padding: 2px 8px; border-radius: 6px; font-size: 0.75rem; font-weight: 800;">
                        ${p.score === 'HIDDEN' ? '✓' : p.score + '%'}
                    </span>
                </div>
            `;
        }).join('');

        // Show Swal Summary
        await Swal.fire({
            title: '🏁 نتيجة الامتحان الجماعي',
            html: `
                <div style="text-align: center; margin-bottom: 15px;">
                    <div style="font-size: 0.9rem; color: #475569; margin-bottom: 10px;">${examTitle}</div>
                    ${pointsAwarded
                    ? '<div style="background: #ecfdf5; color: #065f46; padding: 8px; border-radius: 10px; font-weight: 700; font-size: 0.85rem;">✅ مبروك! الشلة حققت التحدي وأخدتوا النقط</div>'
                    : '<div style="background: #fef2f2; color: #991b1b; padding: 8px; border-radius: 10px; font-weight: 700; font-size: 0.85rem;">😔 للأسف محققتوش الحد الأدنى من المشاركات</div>'}
                </div>
                <div style="max-height: 300px; overflow-y: auto; padding: 5px;">
                    ${leaderboardHtml}
                </div>
            `,
            confirmButtonText: 'عاش ياشباب 🔥',
            confirmButtonColor: '#f97316',
            background: '#ffffff',
            customClass: {
                popup: 'rounded-2xl',
                title: 'text-xl font-black pt-4'
            }
        });

        // Mark as seen
        localStorage.setItem(storageKey, 'true');

    } catch (err) {
        console.error('Error in challenge summary popup:', err);
    }
}
