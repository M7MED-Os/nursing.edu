// Squad Chat Module - Complete Implementation
import { supabase } from '../supabaseClient.js';
import { getSWR } from '../utils.js';
import { generateAvatar, calculateLevel, getLevelColor } from '../avatars.js';
import { shouldShowAvatar } from '../privacy.js';
import { currentSquad, currentProfile, userResults, examTimers, readQueue, readTimeout } from './state.js';
import { setUserResults } from './state.js';

/**
 * Load chat messages with results and challenges
 */
export async function loadChat() {
    // 1. Clear existing exam timers before reload
    Object.values(examTimers).forEach(t => clearInterval(t));
    Object.keys(examTimers).forEach(key => delete examTimers[key]);

    const box = document.getElementById('chatBox');
    if (!box) return;

    const cacheKey = `squad_chat_data_${currentSquad.id}`;

    getSWR(cacheKey, async () => {
        const [{ data: results }, { data: challenges }, { data: msgs }] = await Promise.all([
            supabase.from('results').select('exam_id, created_at').eq('user_id', currentProfile.id),
            supabase.from('squad_exam_challenges').select('id, status, squad_points_awarded').eq('squad_id', currentSquad.id),
            supabase.from('squad_chat_messages').select('*, profiles!sender_id(full_name, avatar_url, points, privacy_avatar)').eq('squad_id', currentSquad.id).order('created_at', { ascending: false }).limit(50)
        ]);

        const freshMsgs = (msgs || []).reverse();
        return {
            results: results || [],
            challenges: challenges || [],
            msgs: freshMsgs
        };
    }, 15, (data) => {
        setUserResults(data.results);
        window.currentChallenges = data.challenges;
        renderChat(data.msgs);
    });
}

/**
 * Render chat skeletons (loading state)
 */
function renderChatSkeletons(box) {
    box.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:12px; width:100%;">
            <div class="skeleton pulse" style="width:70%; height:40px; border-radius:12px; border-top-left-radius:2px; align-self:flex-start;"></div>
            <div class="skeleton pulse" style="width:50%; height:40px; border-radius:12px; border-top-right-radius:2px; align-self:flex-end;"></div>
            <div class="skeleton pulse" style="width:60%; height:60px; border-radius:12px; border-top-left-radius:2px; align-self:flex-start;"></div>
            <div class="skeleton pulse" style="width:40%; height:40px; border-radius:12px; border-top-right-radius:2px; align-self:flex-end;"></div>
        </div>
    `;
}

/**
 * Render chat messages
 */
async function renderChat(msgs) {
    const box = document.getElementById('chatBox');
    if (!box) return;
    const myId = currentProfile.id;

    // Fetch read markers
    const msgIds = msgs.map(m => m.id);
    const { data: allReads } = await supabase.from('squad_message_reads').select('message_id, profile_id, profiles!profile_id(full_name)').in('message_id', msgIds);

    // Filter out CMD signals and SQUAD_EXAM messages from chat display
    const chatMsgs = msgs.filter(m => {
        // Hide CMD signals
        if (m.challenge_id && m.text.startsWith('[CMD:')) return false;
        // Hide SQUAD_EXAM messages
        if (m.text.match(/\[SQUAD_EXAM:([a-z0-9-]+):?([a-z0-9-]+)?\]/i)) return false;
        return true;
    });

    box.innerHTML = chatMsgs.map(m => {
        const time = new Date(m.created_at).toLocaleTimeString('ar-EG', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });

        // Check if I have already read this message
        const isReadByMe = allReads?.some(r => r.message_id === m.id && r.profile_id === myId);

        // Mark as read ONLY if not mine and I haven't read it yet
        if (m.sender_id !== myId && !isReadByMe) {
            markAsRead(m.id);
        }

        const readers = allReads?.filter(r => r.message_id === m.id && r.profile_id !== m.sender_id) || [];
        const isReadByOthers = readers.length > 0;
        const readerNames = readers.map(r => r.profiles.full_name.split(' ')[0]).join('، ');

        const readerNamesList = readers.map(r => r.profiles.full_name).join('<br>');
        const fullReaderNames = readerNamesList || 'لا يوجد أحد شاهدها بعد';

        const ticks = m.sender_id === myId ? `
            <div class="msg-seen-status ${isReadByOthers ? 'read' : 'sent'}" title="${isReadByOthers ? 'شوهد بواسطة: ' + readerNames : 'تم الإرسال'}">
                <i class="fas fa-check-double"></i>
            </div>
        ` : '';

        // Sender level and color
        const level = m.profiles ? calculateLevel(m.profiles.points || 0) : 0;
        const levelColor = m.profiles ? getLevelColor(level) : '#03A9F4';

        // Privacy check for avatar using helper function
        const showAvatar = m.profiles ? shouldShowAvatar(
            m.profiles.privacy_avatar,
            m.sender_id,
            myId,
            currentSquad.id, // All chat members are in the same squad
            currentSquad.id
        ) : true;

        const defaultAvatar = m.profiles ? generateAvatar(m.profiles.full_name, 'initials') : 'assets/images/favicon-48x48.png';
        const avatarUrl = showAvatar && m.profiles?.avatar_url ? m.profiles.avatar_url : defaultAvatar;

        return `
            <div class="msg-wrapper ${m.sender_id === myId ? 'sent' : 'received'}">
                <div class="chat-avatar-container">
                    <img src="${avatarUrl}" class="chat-avatar" style="border-color: ${levelColor};" title="${m.profiles?.full_name || 'System'}">
                </div>
                <div class="msg ${m.sender_id === myId ? 'sent' : 'received'}" 
                     ${m.sender_id === myId ? `onclick="showReadBy('${fullReaderNames}')"` : ''} 
                     style="${m.sender_id === myId ? 'cursor:pointer;' : ''}">
                    <span class="msg-sender">${m.profiles ? m.profiles.full_name : 'M7MED'}</span>
                    <div class="msg-content">
                        ${m.text}
                    </div>
                    <div class="msg-footer">
                        <span class="msg-time">${time}</span>
                        ${ticks}
                    </div>
                </div>
            </div>
        `;
    }).join('');
    box.scrollTop = box.scrollHeight;
}

/**
 * Show who read the message
 */
window.showReadBy = (names) => {
    Swal.fire({
        title: '<div style="font-size: 1.1rem; font-weight: 700; margin-bottom: 0px;">مين شاف الرساله</div>',
        html: `<div style="text-align: right; direction: rtl; font-size: 0.9rem; margin-top: 10px; color: #64748b;">${names}</div>`,
        confirmButtonText: 'إغلاق',
        confirmButtonColor: '#64748b',
        width: '280px',
        padding: '1rem',
        customClass: {
            title: 'swal-small-title',
            confirmButton: 'swal-small-btn'
        }
    });
};

/**
 * Mark message as read (batched)
 */
async function markAsRead(msgId) {
    if (!readQueue.includes(msgId)) {
        readQueue.push(msgId);
    }

    if (readTimeout) clearTimeout(readTimeout);

    const timeout = setTimeout(async () => {
        const batch = [...readQueue];
        readQueue.length = 0; // Clear array

        if (batch.length === 0) return;

        try {
            const updates = batch.map(id => ({
                message_id: id,
                profile_id: currentProfile.id
            }));

            await supabase.from('squad_message_reads').upsert(updates, { onConflict: 'message_id,profile_id' });
        } catch (e) {
            console.error("Batch read update failed", e);
        }
    }, 2000); // Wait 2 seconds of silence to batch
}

/**
 * Handle chat form submission
 */
export async function handleChatSubmit(e) {
    e.preventDefault();
    const input = document.getElementById('chatInput');
    const text = input.value.trim();
    if (!text) return;

    input.value = '';
    const { error } = await supabase.from('squad_chat_messages').insert({
        squad_id: currentSquad.id,
        sender_id: currentProfile.id,
        text
    });

    if (error) {
        console.error("Msg send error:", error);
    } else {
        await loadChat(); // Immediate update after sending
    }
}
