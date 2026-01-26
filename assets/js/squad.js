import { supabase } from "./supabaseClient.js";
import { getCache, setCache, getSWR } from "./utils.js";
import { GRADES, STREAMS } from "./constants.js";

// State
let readQueue = [];
let readTimeout = null;
let currentSquad = null;
let currentProfile = null;
let presenceChannel = null;
let syncTimer = null; // Smart Polling timer
let pomodoroInterval = null;
let pomodoroEnd = null;
let userResults = []; // Store user's completed exams for dynamic buttons
let examTimers = {}; // Store intervals for active exam cards
let globalSquadSettings = { join_mins: 60, grace_mins: 45, max_members: 10, success_threshold: 80 }; // Global challenge settings
let lastPomState = null; // Track Pomodoro state to avoid flicker

// DOM Elements
const views = {
    loading: document.getElementById('loadingView'),
    noSquad: document.getElementById('noSquadView'),
    mainSquad: document.getElementById('mainSquadView')
};

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    await initSquad();
});

async function initSquad() {
    showView('loading');

    // 1. Get User
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
        window.location.href = 'login.html';
        return;
    }

    // 2. Get Profile - Use Cache
    let profile = getCache(`profile_${user.id}`);
    if (!profile) {
        const { data: fetchedProfile } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
        profile = fetchedProfile;
        if (profile) setCache(`profile_${user.id}`, profile, 10);
    }
    currentProfile = profile;

    // 3. Check for Squad Membership - Use Cache (1 min short cache)
    let memberRecord = getCache(`squad_member_${user.id}`);
    if (!memberRecord) {
        const { data: records, error: memberError } = await supabase
            .from('squad_members')
            .select('squad_id, squads(*)')
            .eq('profile_id', user.id)
            .limit(1);

        if (memberError) console.error("Membership check error:", memberError);
        memberRecord = records && records.length > 0 ? records[0] : null;
        if (memberRecord) setCache(`squad_member_${user.id}`, memberRecord, 1);
    }


    if (memberRecord && memberRecord.squads) {
        currentSquad = memberRecord.squads;
        setupSquadUI();
        showView('mainSquad');
    } else {
        showView('noSquad');
    }
}

function showView(viewKey) {
    Object.keys(views).forEach(k => views[k].style.display = (k === viewKey ? 'block' : 'none'));
}

async function setupSquadUI() {
    const displayGrade = GRADES[currentSquad.academic_year] || currentSquad.academic_year || 'سنة غير محددة';
    const displayDept = STREAMS[currentSquad.department] || currentSquad.department || 'عام';

    document.getElementById('squadNameText').textContent = currentSquad.name;
    document.getElementById('squadInfo').textContent = `${displayGrade} - ${displayDept}`;
    document.getElementById('squadPoints').textContent = `رصيد الشلة: ${currentSquad.points || 0}`;
    document.getElementById('squadMemberCount').textContent = `0 عضو`; // Will be updated by loadMembers
    document.getElementById('squadCode').textContent = currentSquad.id.split('-')[0].toUpperCase();

    // Load Sub-components
    loadMembers();
    loadTasks();
    loadChat();
    loadPomodoro();
    setupPresence();

    // Show Clear Chat button to Squad Owner OR Global Admin
    const isOwner = currentSquad.owner_id === currentProfile.id;
    const isAdmin = currentProfile.role === 'admin';

    if (isOwner || isAdmin) {
        const clearBtn = document.getElementById('clearChatBtn');
        if (clearBtn) clearBtn.style.display = 'flex';

        // Show Edit Squad Name button
        const editBtn = document.getElementById('editSquadNameBtn');
        if (editBtn) editBtn.style.display = 'inline-block';
    }
}

// --- Squad Actions (Create/Join) ---
window.showCreateSquadModal = async () => {
    if (currentSquad) {
        Swal.fire('تنبيه', 'أنت بالفعل في شلة! اخرج منها أولاً لتتمكن من إنشاء واحدة جديدة.', 'warning');
        return;
    }
    const { value: name } = await Swal.fire({

        title: 'اسم شلتك الجديدة؟ 🚀',
        input: 'text',
        inputPlaceholder: 'ادخل اسم الشلة...',
        showCancelButton: true,
        confirmButtonText: 'إنشاء الشلة'
    });

    if (name) {
        try {
            // Mapping grade to Arabic name (Matching constants.js for Leaderboard consistency)
            const gradeLabel = { '1': 'الفرقة الأولى', '2': 'الفرقة الثانية', '3': 'الفرقة الثالثة', '4': 'الفرقة الرابعة' };
            const streamLabel = { 'pediatric': 'تمريض الأطفال', 'obs_gyn': 'تمريض نسا و التوليد', 'nursing_admin': 'إدارة التمريض', 'psychiatric': 'تمريض النفسية' };

            const academicYear = gradeLabel[currentProfile.grade] || currentProfile.grade;
            const department = streamLabel[currentProfile.stream] || currentProfile.stream || 'عام';

            const { data: squad, error } = await supabase.from('squads').insert({
                name: name,
                academic_year: academicYear,
                department: department,
                owner_id: currentProfile.id
            }).select().single();

            if (error) throw error;

            await supabase.from('squad_members').insert({
                squad_id: squad.id,
                profile_id: currentProfile.id
            });

            location.reload();
        } catch (err) {
            Swal.fire('خطأ', 'معرفناش نعمل الشلة.. جرب تاني', 'error');
        }
    }
};

window.showJoinSquadModal = async () => {
    if (currentSquad) {
        Swal.fire('تنبيه', 'انت في شلة دلوقتي! اخرج منها الاول عشان تعرف تخش شلة تانية.', 'warning');
        return;
    }
    const { value: code } = await Swal.fire({
        title: 'ادخل كود الشلة',
        input: 'text',
        inputPlaceholder: 'اكتب كود الشلة هنا...',
        showCancelButton: true
    });

    if (code && code.trim()) {
        const searchCode = code.trim().toLowerCase();

        // Use RPC to search by prefix (Fixes UUID casting error)
        const { data: squads, error } = await supabase.rpc('get_squad_by_prefix', { p_prefix: searchCode });

        if (error) {

            console.error("Search error:", error);
            Swal.fire('خطأ', 'حصل مشكلة في البحث عن الشلة.', 'error');
            return;
        }

        if (squads && squads.length > 0) {
            const squad = squads[0];

            // --- NEW: Check Max Members Limit ---
            const { count: currentMemberCount } = await supabase
                .from('squad_members')
                .select('*', { count: 'exact', head: true })
                .eq('squad_id', squad.id);

            // Fetch current settings if not already loaded (Safety)
            let limit = globalSquadSettings.max_members || 10;

            if (currentMemberCount >= limit) {
                Swal.fire('الشلة مليانة!', `للأسف الشلة دي وصلت للحد الأقصى (${limit} طلاب).`, 'error');
                return;
            }
            // --- End of Limit Check ---

            const { error: joinError } = await supabase.from('squad_members').insert({
                squad_id: squad.id,
                profile_id: currentProfile.id
            });

            if (joinError) {
                Swal.fire('خطأ', 'مقدرناش نضيفك للشلة.. جرب تاني', 'error');
            } else {
                location.reload();
            }
        } else {
            Swal.fire('مش لاقيينها!', 'اتأكد من الكود (اكتب الكود اللي ظهر لصاحبك)', 'warning');
        }
    }
};


// --- Realtime ---
// --- Realtime Sync Logic (Legacy RLS issues workaround) ---
// Note: We use Smart Polling instead of Postgres Channels for better reliability.

// Global Set to track online users from Presence
let onlineUsersSet = new Set();

// --- Presence (نظام التواجد) ---
function setupPresence() {
    if (presenceChannel) supabase.removeChannel(presenceChannel);

    presenceChannel = supabase.channel(`squad_presence_${currentSquad.id}`);
    presenceChannel
        .on('presence', { event: 'sync' }, () => {
            const state = presenceChannel.presenceState();
            updateMembersStatusUI(state);
        })
        .subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
                await presenceChannel.track({
                    user_id: currentProfile.id,
                    online_at: new Date().toISOString(),
                });
                // Update DB for "Last Active" persistence
                await supabase.from('profiles').update({ updated_at: new Date().toISOString() }).eq('id', currentProfile.id);
            }
        });
}

function updateMembersStatusUI(presenceState) {
    const onlineUserIds = Object.values(presenceState).flat().map(p => p.user_id);
    onlineUsersSet = new Set(onlineUserIds);

    // Refresh list to update UI text based on new online status
    loadMembers();
}

// --- Time Ago Helper ---
function timeAgo(dateString) {
    if (!dateString) return 'غير معروف';
    const date = new Date(dateString);
    const now = new Date();
    const diffSeconds = Math.floor((now - date) / 1000);

    if (diffSeconds < 60) return 'منذ لحظات';

    const minutes = Math.floor(diffSeconds / 60);
    if (minutes < 60) return `منذ ${minutes} دقيقة`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `منذ ${hours} ساعة`;

    const days = Math.floor(hours / 24);
    return `منذ ${days} يوم`;
}

// --- Members ---
async function loadMembers() {
    const cacheKey = `squad_members_${currentSquad.id}`;

    getSWR(cacheKey, async () => {
        const { data } = await supabase
            .from('squad_members')
            .select('profile_id, profiles(full_name, points, updated_at)')
            .eq('squad_id', currentSquad.id);
        return data;
    }, 1, (members) => {
        renderMembersUI(members);
    });
}

function renderMembersUI(members) {
    if (!members) return;

    // Sort: Online first, then by updated_at descending
    members.sort((a, b) => {
        const aOnline = onlineUsersSet.has(a.profile_id);
        const bOnline = onlineUsersSet.has(b.profile_id);
        if (aOnline && !bOnline) return -1;
        if (!aOnline && bOnline) return 1;
        return new Date(b.profiles.updated_at || 0) - new Date(a.profiles.updated_at || 0);
    });

    const list = document.getElementById('memberList');
    document.getElementById('squadMemberCount').textContent = `${members.length} أعضاء`;

    const isOwner = currentSquad.owner_id === currentProfile.id;

    list.innerHTML = members.map(m => {
        const isOnline = onlineUsersSet.has(m.profile_id);
        let actions = '';

        if (isOwner && m.profile_id !== currentProfile.id) {
            actions = `
                <div class="member-actions" style="margin-right:auto; display:flex; gap:5px;">
                    <i class="fas fa-user-shield" title="نقل الإدارة" onclick="transferOwnership('${m.profile_id}')" style="color:#0ea5e9; cursor:pointer;"></i>
                    <i class="fas fa-user-minus" title="طرد" onclick="kickMember('${m.profile_id}')" style="color:#ef4444; cursor:pointer;"></i>
                </div>
            `;
        } else if (m.profile_id === currentSquad.owner_id) {
            actions = '<span style="font-size:0.6rem; color:#f59e0b; margin-right:auto;">مالك الشلة ⭐</span>';
        }

        let activeText = isOnline ? 'نشط الآن' : (m.profiles.updated_at ? timeAgo(m.profiles.updated_at) : 'غير نَشِط');

        return `
            <div class="member-item" data-userid="${m.profile_id}" style="display:flex; align-items:center; gap:10px;">
                <div class="status-dot ${isOnline ? 'online' : ''}"></div>
                <div style="flex:1">
                    <div style="font-weight:700; font-size:0.9rem;">${m.profiles.full_name}</div>
                    <div style="font-size:0.75rem; color:#64748b; display: flex; gap: 10px;">
                        <span>${m.profiles.points} نقطة</span>
                        <span class="active-status" style="font-size: 0.7rem; color: ${isOnline ? '#10b981' : '#94a3b8'};">
                            • ${activeText}
                        </span>
                    </div>
                </div>
                ${actions}
            </div>
        `;
    }).join('');
}

// Auto-refresh members status every minute to update "Time Ago"
setInterval(loadMembers, 60000);

window.kickMember = async (userId) => {
    const { isConfirmed } = await Swal.fire({
        title: 'طرد العضو؟',
        text: 'متأكد إنك عاوز تشيل الطالب ده من الشلة؟',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444'
    });
    if (isConfirmed) {
        await supabase.from('squad_members').delete().eq('squad_id', currentSquad.id).eq('profile_id', userId);
        loadMembers();
    }
};

window.transferOwnership = async (userId) => {
    const { isConfirmed } = await Swal.fire({
        title: 'نقل الإدارة؟',
        text: 'هتنقل إدارة الشلة للطالب ده، وهتفقد صلاحيات الأونر.',
        icon: 'warning',
        showCancelButton: true
    });
    if (isConfirmed) {
        await supabase.from('squads').update({ owner_id: userId }).eq('id', currentSquad.id);
        location.reload();
    }
};

// --- Tasks ---
async function loadTasks() {
    const cacheKey = `squad_tasks_${currentSquad.id}`;

    getSWR(cacheKey, async () => {
        const { data } = await supabase
            .from('squad_tasks')
            .select('*, squad_task_completions(profile_id, profiles(full_name))')
            .eq('squad_id', currentSquad.id)
            .order('created_at', { ascending: true });
        return data;
    }, 5, (tasks) => {
        // Pre-process tasks for local individual state
        tasks.forEach(t => {
            t.is_done_by_me = t.squad_task_completions.some(c => c.profile_id === currentProfile.id);
            t.others_who_done = t.squad_task_completions.filter(c => c.profile_id !== currentProfile.id);
        });

        const mainTasks = tasks.filter(t => !t.parent_id);
        const subTasks = tasks.filter(t => t.parent_id);

        updateProgressBar(tasks);
        renderTasks(mainTasks, subTasks);
    });
}

function updateProgressBar(tasks) {
    const mainTasks = tasks.filter(t => !t.parent_id);
    if (!mainTasks || mainTasks.length === 0) {
        document.getElementById('squadProgressBar').style.width = '0%';
        document.getElementById('squadProgressPercent').textContent = '0%';
        return;
    }

    let totalProgress = 0;
    const weightPerMain = 100 / mainTasks.length;

    mainTasks.forEach(mt => {
        const subtasks = tasks.filter(st => st.parent_id === mt.id);
        if (subtasks.length === 0) {
            // No subtasks, count the main task directly
            if (mt.is_done_by_me) totalProgress += weightPerMain;
        } else {
            // Has subtasks, calculate based on subtasks only
            const doneSubs = subtasks.filter(st => st.is_done_by_me).length;
            totalProgress += (doneSubs / subtasks.length) * weightPerMain;
        }
    });

    const finalPercent = Math.min(100, Math.round(totalProgress));
    document.getElementById('squadProgressBar').style.width = `${finalPercent}%`;
    document.getElementById('squadProgressPercent').textContent = `${finalPercent}%`;

    // Massive Celebration trigger when reaching 100%
    if (finalPercent === 100) {
        const lastCelebration = sessionStorage.getItem('squad_100_celebration');
        if (lastCelebration !== 'true') {
            triggerCelebration('massive');
            sessionStorage.setItem('squad_100_celebration', 'true');
        }
    } else {
        sessionStorage.removeItem('squad_100_celebration');
    }
}

const triggerCelebration = (type) => {
    if (type === 'massive') {
        // Massive Celebration (Side Bursts) - Matches Todo
        var duration = 5 * 1000;
        var end = Date.now() + duration;
        (function frame() {
            confetti({ particleCount: 7, angle: 60, spread: 55, origin: { x: 0 }, colors: ['#03A9F4', '#10b981'] });
            confetti({ particleCount: 7, angle: 120, spread: 55, origin: { x: 1 }, colors: ['#03A9F4', '#10b981'] });
            if (Date.now() < end) requestAnimationFrame(frame);
        }());
    } else if (type === 'main') {
        // Matches Todo Main Task
        confetti({
            particleCount: 300,
            spread: 120,
            origin: { y: 0.6 },
            gravity: 1,
            scalar: 1.4,
            ticks: 100,
            colors: ['#03A9F4', '#FFC107', '#4CAF50', '#E91E63', '#9C27B0']
        });
    } else {
        // Matches Todo Subtask
        confetti({
            particleCount: 80,
            spread: 60,
            origin: { y: 0.7 },
            scalar: 1.1,
            colors: ['#03A9F4', '#64B5F6']
        });
    }
};

function renderTasks(mainTasks, subTasks) {
    const list = document.getElementById('squadTaskList');
    if (!mainTasks || mainTasks.length === 0) {
        list.innerHTML = `<div class="text-center" style="color: #94a3b8; padding: 1rem;">مفيش أهداف لسة.. حط هدف لشلتك!</div>`;
        return;
    }

    const isOwner = currentSquad.owner_id === currentProfile.id;

    list.innerHTML = mainTasks.map(t => {
        const children = subTasks.filter(st => st.parent_id === t.id);

        const renderOthers = (others) => {
            if (!others || others.length === 0) return '';
            const names = others.map(o => {
                const parts = o.profiles.full_name.split(' ');
                return parts.slice(0, 2).join(' '); // Show first two names
            });
            return `<div style="font-size:0.6rem; color:#94a3b8; margin-right:8px;"><i class="fas fa-check-double"></i> أنجزها: ${names.join('، ')}</div>`;
        };

        const childrenHTML = children.map(st => `
            <div class="task-group sub-task" style="margin-right: 35px;">
                <div class="todo-item" style="background: #fff; border: 1px solid #f1f5f9; padding: 6px 10px; font-size:0.85rem; display:flex; align-items:center;">
                    <input type="checkbox" class="todo-checkbox" ${st.is_done_by_me ? 'checked' : ''} onchange="toggleSquadTask('${st.id}', this.checked, false)">
                    <span class="todo-text ${st.is_done_by_me ? 'done' : ''}">${st.title}</span>
                    <div style="display:flex; gap:5px; align-items:center; margin-right:auto;">
                        <i class="fas fa-edit" title="تعديل" onclick="editSquadTask('${st.id}', '${st.title}')" style="color:#94a3b8; cursor:pointer; font-size:0.75rem;"></i>
                        <i class="fas fa-trash-alt delete-btn" onclick="deleteSquadTask('${st.id}')" style="font-size:0.7rem;"></i>
                    </div>
                </div>
                ${renderOthers(st.others_who_done)}
            </div>
        `).join('');

        return `
            <div class="task-group" style="margin-bottom: 20px;">
                <div class="todo-item" style="background:#f8fafc; border: 1px solid #e2e8f0; display:flex; align-items:center;">
                    <input type="checkbox" class="todo-checkbox" ${t.is_done_by_me ? 'checked' : ''} onchange="toggleSquadTask('${t.id}', this.checked, true)">
                    <span class="todo-text ${t.is_done_by_me ? 'done' : ''}">${t.title}</span>
                    <div style="display:flex; gap:8px; align-items:center;">
                        <i class="fas fa-plus-circle" title="مهمة فرعية" onclick="addSquadTask('${t.id}')" style="color:#10b981; cursor:pointer;"></i>
                        <i class="fas fa-edit" title="تعديل" onclick="editSquadTask('${t.id}', '${t.title}')" style="color:#64748b; cursor:pointer;"></i>
                        <i class="fas fa-trash delete-btn" onclick="deleteSquadTask('${t.id}')"></i>
                    </div>
                </div>
                ${renderOthers(t.others_who_done)}
                ${childrenHTML}
            </div>
        `;
    }).join('');
}

window.addSquadTask = async (parentId = null) => {
    const { value: title } = await Swal.fire({
        title: parentId ? 'مهمة فرعية جديدة' : 'إيه الهدف المشترك؟',
        input: 'text',
        showCancelButton: true
    });

    if (title) {
        await supabase.from('squad_tasks').insert({
            squad_id: currentSquad.id,
            title,
            created_by: currentProfile.id,
            parent_id: parentId
        });
        loadTasks();
    }
};

window.editSquadTask = async (id, oldTitle) => {
    const { value: title } = await Swal.fire({
        title: 'تعديل المهمة',
        input: 'text',
        inputValue: oldTitle,
        showCancelButton: true
    });

    if (title && title !== oldTitle) {
        await supabase.from('squad_tasks').update({ title }).eq('id', id);
        loadTasks();
    }
};

window.toggleSquadTask = async (id, isDone, isMain = false) => {
    // 1. Update individual completion
    if (isDone) {
        await supabase.from('squad_task_completions').upsert({ task_id: id, profile_id: currentProfile.id });
    } else {
        await supabase.from('squad_task_completions').delete().eq('task_id', id).eq('profile_id', currentProfile.id);
    }

    // 2. Confetti & Smart Logic
    let triggerBigConfetti = isMain && isDone;

    if (isMain && isDone) {
        // If finish main, finish all subs for me
        const { data: subs } = await supabase.from('squad_tasks').select('id').eq('parent_id', id);
        if (subs.length > 0) {
            const ins = subs.map(s => ({ task_id: s.id, profile_id: currentProfile.id }));
            await supabase.from('squad_task_completions').upsert(ins);
        }
    } else if (!isMain) {
        const { data: currentTask } = await supabase.from('squad_tasks').select('parent_id').eq('id', id).single();
        if (currentTask.parent_id) {
            // Check siblings
            const { data: totalSubs } = await supabase.from('squad_tasks').select('id').eq('parent_id', currentTask.parent_id);
            const { data: doneSubs } = await supabase.from('squad_task_completions')
                .select('task_id')
                .eq('profile_id', currentProfile.id)
                .in('task_id', totalSubs.map(s => s.id));

            if (doneSubs.length === totalSubs.length) {
                await supabase.from('squad_task_completions').upsert({ task_id: currentTask.parent_id, profile_id: currentProfile.id });
                triggerBigConfetti = true;
            }
        }
    }

    // 3. Execution of Celebration
    if (isDone) {
        if (triggerBigConfetti) {
            triggerCelebration('main');
        } else {
            triggerCelebration('sub');
        }
    }

    loadTasks();
};

window.deleteSquadTask = async (id) => {
    const { isConfirmed } = await Swal.fire({
        title: 'حذف الهدف؟',
        text: 'متأكد إنك عاوز تشيل الهدف ده من الشلة؟',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'آيوة، احذفه'
    });

    if (isConfirmed) {
        await supabase.from('squad_tasks').delete().eq('id', id);
        loadTasks();
    }
};

// --- Chat ---
async function loadChat() {
    // 1. Clear existing exam timers before reload
    Object.values(examTimers).forEach(t => clearInterval(t));
    examTimers = {};

    const box = document.getElementById('chatBox');
    if (!box) return;

    const cacheKey = `squad_chat_data_${currentSquad.id}`;

    getSWR(cacheKey, async () => {
        const [{ data: results }, { data: challenges }, { data: msgs }] = await Promise.all([
            supabase.from('results').select('exam_id, created_at').eq('user_id', currentProfile.id),
            supabase.from('squad_exam_challenges').select('id, status, squad_points_awarded').eq('squad_id', currentSquad.id),
            supabase.from('squad_chat_messages').select('*, profiles!sender_id(full_name)').eq('squad_id', currentSquad.id).order('created_at', { ascending: false }).limit(50)
        ]);

        const freshMsgs = (msgs || []).reverse();
        return {
            results: results || [],
            challenges: challenges || [],
            msgs: freshMsgs
        };
    }, 15, (data) => {
        userResults = data.results;
        window.currentChallenges = data.challenges;
        renderChat(data.msgs);
    });
}

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

async function renderChat(msgs) {
    const box = document.getElementById('chatBox');
    if (!box) return;
    const myId = currentProfile.id;

    // Fetch read markers
    const msgIds = msgs.map(m => m.id);
    const { data: allReads } = await supabase.from('squad_message_reads').select('message_id, profile_id, profiles!profile_id(full_name)').in('message_id', msgIds);

    box.innerHTML = msgs.map(m => {
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

        return `
            <div class="msg ${m.sender_id === myId ? 'sent' : 'received'}" 
                 ${m.sender_id === myId ? `onclick="showReadBy('${fullReaderNames}')"` : ''} 
                 style="${m.sender_id === myId ? 'cursor:pointer;' : ''}">
                <span class="msg-sender">${m.profiles ? m.profiles.full_name : 'M7MED'}</span>
                <div class="msg-content">
                    ${renderMessageContent(m, myId)}
                </div>
                <div class="msg-footer">
                    <span class="msg-time">${time}</span>
                    ${ticks}
                </div>
            </div>
        `;
    }).join('');
    box.scrollTop = box.scrollHeight;
}

function renderMessageContent(m, myId) {
    const examMatch = m.text.match(/\[SQUAD_EXAM:([a-z0-9-]+):?([a-z0-9-]+)?\]/i);
    if (examMatch) {
        const examId = examMatch[1];
        const challengeId = examMatch[2] || null;
        const textPart = m.text.split('[')[0].trim();

        const resultsForThisExam = userResults.filter(r => r.exam_id === examId);
        const challengeData = window.currentChallenges?.find(c => c.id === challengeId);
        const isCompleted = challengeData?.status === 'completed' || challengeData?.squad_points_awarded > 0;

        const msgAt = new Date(m.created_at);
        const expiresAt = msgAt.getTime() + (globalSquadSettings.join_mins * 60 * 1000);
        const gracePeriod = expiresAt + (globalSquadSettings.grace_mins * 60 * 1000);
        const isExpired = Date.now() > expiresAt;
        const isGraceEnded = Date.now() > gracePeriod;

        const hasSessionResult = resultsForThisExam.some(r => new Date(r.created_at) > msgAt);
        const hasOldResult = resultsForThisExam.length > 0;

        let btnState = 'fresh'; // Default
        if (isExpired) {
            btnState = 'expired';
        } else if (hasSessionResult) {
            btnState = 'completed';
        } else if (hasOldResult) {
            btnState = 'help';
        }

        const btnConfigs = {
            'fresh': { text: 'خش دلوقتي 🚀', class: 'btn-primary', onclick: `window.joinSquadExamMessenger(event, '${examId}', '${currentSquad.id}', 'fresh', ${expiresAt}, '${challengeId}')`, notice: '' },
            'help': { text: 'خش ساعد 🤝', class: 'btn-secondary', onclick: `window.joinSquadExamMessenger(event, '${examId}', '${currentSquad.id}', 'help', ${expiresAt}, '${challengeId}')`, notice: '<div style="font-size: 0.7rem; color: #64748b; margin-top: 6px; text-align: center;">مش هتاخد النقط كامله هتاخد البونص بس</div>' },
            'completed': { text: 'انت حليت الامتحان ✅', class: 'btn-outline', onclick: 'void(0)', disabled: true, notice: '' },
            'expired': {
                text: 'الوقت خلص⏱️',
                class: 'btn-outline',
                onclick: 'void(0)',
                disabled: true,
                notice: `<div style="font-size: 0.7rem; color: #ef4444; margin-top: 6px; text-align: center;">الجلسة بدأت من أكتر من ${globalSquadSettings.join_mins} دقيقة.</div>`
            }
        };

        const config = btnConfigs[btnState];

        // Timer runs until expired - Runs for everyone to track progress and send reminders
        if (!isExpired && !isCompleted) {
            setTimeout(() => startExamCardTimer(m.id, expiresAt, challengeId), 10);
        }

        let statusHtml = isCompleted ? `
            <div style="font-size:0.75rem; color:#10b981; margin-bottom:8px; font-weight:700;">
                <i class="fas fa-check-circle"></i> تم تحقيق الهدف لشلتكم! 🎉
            </div>` : '';

        let countdownHtml = '';
        if (isGraceEnded) {
            countdownHtml = `<div style="font-size:0.75rem; color:#ef4444; margin-bottom:8px; font-weight:700;"><i class="fas fa-hourglass-end"></i> انتهى التحدي بالكامل</div>`;
        } else if (isExpired) {
            countdownHtml = `<div style="font-size:0.75rem; color:#ef4444; margin-bottom:8px; font-weight:700;"><i class="fas fa-user-clock"></i> باب الانضمام قفل - متاح فقط للي جوه يخلصوا</div>`;
        } else if (!isCompleted) {
            countdownHtml = `
                <div id="countdown-${m.id}" style="font-size:0.75rem; color:#f59e0b; margin-bottom:8px; font-weight:700;">
                    <i class="fas fa-clock"></i> ينتهي الانضمام خلال: <span class="timer-val">..:..</span>
                </div>`;
        }

        return `
            <div class="msg-exam-card" style="background:#fff; border:1px solid #e2e8f0; border-radius:12px; padding:12px; margin-top:8px; box-shadow:0 2px 4px rgba(0,0,0,0.05);">
                <div style="color:var(--primary-color); font-weight:700; font-size:0.85rem; margin-bottom:8px; display:flex; align-items:center; gap:6px;">
                    <i class="fas fa-graduation-cap"></i> تحدي جماعي
                </div>
                ${statusHtml}
                ${countdownHtml}
                <div style="font-size:0.9rem; color:#1e293b; line-height:1.5; margin-bottom:12px;">${textPart}</div>
                <button class="btn ${config.class}" id="btn-exam-${m.id}" style="width:100%; padding:8px; font-size:0.85rem;" 
                        onclick="event.stopPropagation(); ${config.onclick}" ${config.disabled ? 'disabled' : ''}>
                    ${config.text}
                </button>
                ${config.notice}
            </div>
        `;
    }

    // Normal text message
    return m.text;
}

function startExamCardTimer(msgId, expiresAt, challengeId) {
    if (examTimers[msgId]) clearInterval(examTimers[msgId]);

    const updateTimer = () => {
        const el = document.getElementById(`countdown-${msgId}`);
        if (!el) {
            clearInterval(examTimers[msgId]);
            return;
        }

        const diff = expiresAt - Date.now();
        if (diff <= 0) {
            clearInterval(examTimers[msgId]);

            // Note: The actual points calculation happened in the background via RPC if everyone finished.
            // If they didn't, we wait for a "Grace Period" (extra X mins) before sending failure alert.
            const gracePeriod = expiresAt + (globalSquadSettings.grace_mins * 60 * 1000);
            const checkGrace = async () => {
                if (Date.now() > gracePeriod) {
                    if (challengeId) {
                        const { error } = await supabase.rpc('finalize_squad_challenge', { p_challenge_id: challengeId });
                        // Ignore 409 Conflict (means already finalized by another peer)
                        if (!error || error.code === '409' || error.status === 409) {
                            loadChat();
                        }
                    }
                } else {
                    // Check again in 10s until grace is over
                    setTimeout(checkGrace, 10000);
                }
            };
            checkGrace();

            el.innerHTML = '<span style="color:#ef4444;">قفل باب الانضمام 🚪</span>';
            const btn = document.getElementById(`btn-exam-${msgId}`);
            if (btn) {
                btn.disabled = true;
                btn.textContent = 'الوقت خلص⏱️';
                btn.className = 'btn btn-outline';
            }
            return;
        }

        const mins = Math.floor(diff / (1000 * 60));
        const secs = Math.floor((diff / 1000) % 60);

        const timerVal = el.querySelector('.timer-val');
        if (timerVal) timerVal.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    updateTimer();
    examTimers[msgId] = setInterval(updateTimer, 1000);
}

// End of Exam Timers Logic

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


async function markAsRead(msgId) {
    if (!readQueue.includes(msgId)) {
        readQueue.push(msgId);
    }

    if (readTimeout) clearTimeout(readTimeout);

    readTimeout = setTimeout(async () => {
        const batch = [...readQueue];
        readQueue = [];

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

document.getElementById('chatForm').onsubmit = async (e) => {
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
};

// --- Pomodoro Logic ---
async function loadPomodoro() {
    const { data: pom } = await supabase
        .from('squad_pomodoro')
        .select('*')
        .eq('squad_id', currentSquad.id)
        .maybeSingle();

    if (pom && pom.status === 'running') {
        // Semantic check: Only reset timer if the specific session record changed
        const currentStateKey = `${pom.start_time}_${pom.duration}_${pom.status}`;
        if (lastPomState === currentStateKey) return;

        lastPomState = currentStateKey;
        const startTime = new Date(pom.start_time).getTime();
        const durationMs = (pom.duration || 25) * 60 * 1000;
        pomodoroEnd = startTime + durationMs;

        if (pomodoroEnd > Date.now()) {
            startLocalTimer(pom);
        } else {
            lastPomState = null;
            resetPomodoroUI();
        }
    } else {
        if (lastPomState !== null) {
            lastPomState = null;
            resetPomodoroUI();
        }
    }
}

function startLocalTimer(pomData) {
    if (pomodoroInterval) clearInterval(pomodoroInterval);

    const isStarterOrOwner = pomData.started_by === currentProfile.id || currentSquad.owner_id === currentProfile.id;

    const stopBtn = document.getElementById('startPomodoroBtn');
    if (isStarterOrOwner) {
        stopBtn.disabled = false;
        stopBtn.textContent = 'إيقاف المذاكرة 🛑';
        stopBtn.onclick = endPomodoro;
    } else {
        stopBtn.disabled = true;
        stopBtn.textContent = 'جاري المذاكرة... 🔥';
    }

    pomodoroInterval = setInterval(() => {
        const now = Date.now();
        const diff = pomodoroEnd - now;

        if (diff <= 0) {
            clearInterval(pomodoroInterval);
            resetPomodoroUI();
            return;
        }

        const mins = Math.floor(diff / (1000 * 60));
        const secs = Math.floor((diff / 1000) % 60);
        document.getElementById('pomodoroTimer').textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }, 1000);
}

async function endPomodoro() {
    await supabase.from('squad_pomodoro').update({ status: 'finished' }).eq('squad_id', currentSquad.id);
    resetPomodoroUI();
}

function resetPomodoroUI() {
    if (pomodoroInterval) clearInterval(pomodoroInterval);
    document.getElementById('pomodoroTimer').textContent = '25:00';
    const btn = document.getElementById('startPomodoroBtn');
    if (!btn) return;
    btn.disabled = false;
    btn.textContent = 'ابدأ المذاكرة 🔥';
    btn.onclick = startPomodoroFlow;
}

window.startPomodoroFlow = async () => {
    const { value: duration } = await Swal.fire({
        title: 'مدة المذاكرة؟ ⏱️',
        input: 'select',
        inputOptions: {
            '25': '25 دقيقة',
            '60': 'ساعة كاملة',
            '90': 'ساعة ونصف',
            '120': 'ساعتين',
            '180': '3 ساعات',
            '240': '4 ساعات'
        },
        inputPlaceholder: 'اختار الوقت...',
        showCancelButton: true
    });

    if (!duration) return;

    const { data: existing } = await supabase.from('squad_pomodoro').select('*').eq('squad_id', currentSquad.id).maybeSingle();
    const startTime = new Date().toISOString();

    const pomData = {
        status: 'running',
        start_time: startTime,
        duration: parseInt(duration),
        started_by: currentProfile.id
    };

    if (existing) {
        await supabase.from('squad_pomodoro').update(pomData).eq('squad_id', currentSquad.id);
    } else {
        await supabase.from('squad_pomodoro').insert({ ...pomData, squad_id: currentSquad.id });
    }

    await supabase.from('squad_chat_messages').insert({
        squad_id: currentSquad.id,
        sender_id: currentProfile.id,
        text: `مين جاي ${duration} دقيقة مذاكرة؟ 📚`
    });
};

document.getElementById('startPomodoroBtn').onclick = startPomodoroFlow;

// --- Collaborative Exams ---
window.startSharedExam = async () => {
    try {
        // 0. Fetch FRESH settings before starting any challenge selection
        await loadGlobalSettings();

        const grade = currentProfile.grade;
        const term = currentProfile.term;
        const stream = currentProfile.stream;

        if (!grade || !term) {
            Swal.fire('تنبيه', 'يرجى تحديث بياناتك الدراسية من البروفايل أولاً.', 'warning');
            return;
        }

        // 1. Fetch Subjects for this grade
        const { data: allSubjects, error } = await supabase
            .from('subjects')
            .select('*')
            .eq('is_active', true)
            .eq('grade', grade)
            .order('order_index');

        if (error) throw error;

        // 2. Filter subjects (same logic as dashboard)
        const mySubjects = allSubjects.filter(s => {
            // Shared Subjects: Same Term & No Stream
            const isShared = s.term === term && (!s.stream || s.stream === '');
            // Department Subjects: Same Stream & (Same Term OR No Term)
            const isDept = stream && s.stream === stream && (!s.term || s.term === term);

            return isShared || isDept;
        });

        if (mySubjects.length === 0) {
            Swal.fire('تنبيه', 'لا توجد مواد متاحة لسنتم الدراسية حالياً.', 'info');
            return;
        }

        const { value: subjId } = await Swal.fire({
            title: 'اختار المادة 📚',
            input: 'select',
            inputOptions: Object.fromEntries(mySubjects.map(s => [s.id, s.name_ar || s.title])),
            inputPlaceholder: 'اختار المادة...',
            showCancelButton: true,
            confirmButtonText: 'التالي',
            cancelButtonText: 'إلغاء'
        });

        if (!subjId) return;

        // 3. Show transitional popup
        await Swal.fire({
            title: 'لحظة واحدة...',
            text: 'هيتم تحويلك لصفحة المادة عشان تختار الامتحان اللي عاوزه.',
            icon: 'info',
            timer: 2000,
            showConfirmButton: false,
            allowOutsideClick: false,
            didOpen: () => {
                Swal.showLoading();
            }
        });

        // 4. Redirect to subject.html in squad mode
        window.location.href = `subject.html?id=${subjId}&mode=squad&squad_id=${currentSquad.id}`;

    } catch (err) {
        console.error(err);
        Swal.fire('خطأ', 'فشل في تحميل المواد الدراسية.', 'error');
    }
};

// --- Utils ---
window.copySquadCode = () => {
    const code = document.getElementById('squadCode').textContent;
    navigator.clipboard.writeText(code);
    Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'success',
        title: 'تم نسخ الكود!',
        showConfirmButton: false,
        timer: 1500
    });
};

window.editSquadName = async () => {
    const { value: newName } = await Swal.fire({
        title: 'تغيير اسم الشلة',
        input: 'text',
        inputValue: currentSquad.name,
        inputPlaceholder: 'اكتب الاسم الجديد...',
        showCancelButton: true,
        confirmButtonText: 'حفظ',
        cancelButtonText: 'إلغاء',
        inputValidator: (value) => {
            if (!value || !value.trim()) {
                return 'لازم تكتب اسم للشلة!';
            }
            if (value.trim().length < 3) {
                return 'الاسم لازم يكون 3 حروف على الأقل';
            }
            if (value.trim().length > 50) {
                return 'الاسم طويل أوي! (أقصى حد 50 حرف)';
            }
        }
    });

    if (newName && newName.trim() !== currentSquad.name) {
        try {
            const { error } = await supabase
                .from('squads')
                .update({ name: newName.trim() })
                .eq('id', currentSquad.id);

            if (error) throw error;

            // Update local state
            currentSquad.name = newName.trim();
            document.getElementById('squadNameText').textContent = newName.trim();

            Swal.fire({
                icon: 'success',
                title: 'تم التحديث!',
                text: 'اسم الشلة اتغير بنجاح 🎉',
                timer: 2000,
                showConfirmButton: false
            });
        } catch (err) {
            console.error('Error updating squad name:', err);
            Swal.fire('خطأ', 'مقدرناش نغير الاسم.. جرب تاني', 'error');
        }
    }
};

window.shareSquadOnWhatsapp = () => {
    const code = document.getElementById('squadCode').textContent;
    const text = `كود الشلة: ${code}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`);
};

window.clearSquadChat = async () => {
    const result = await Swal.fire({
        title: 'هل أنت متأكد؟',
        text: "سيتم حذف جميع رسائل الشات الحالية نهائياً من قاعدة البيانات!",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#64748b',
        confirmButtonText: 'نعم، امسح الكل',
        cancelButtonText: 'تراجع'
    });

    if (result.isConfirmed) {
        try {
            const { error } = await supabase
                .from('squad_chat_messages')
                .delete()
                .eq('squad_id', currentSquad.id);

            if (error) throw error;

            Swal.fire({
                icon: 'success',
                title: 'تم المسح',
                text: 'تم حذف محادثات الشلة بنجاح.',
                timer: 1500,
                showConfirmButton: false
            });

            loadChat();

        } catch (err) {
            Swal.fire('خطأ', 'فشل في مسح الشات: ' + err.message, 'error');
        }
    }
};

// --- Smart Refresh System ---
const REFRESH_CONFIG = {
    todo: { duration: 10 * 60 * 1000, btnId: 'refreshTodoBtn', loadFn: () => loadTasks() },
    chat: { duration: 3 * 60 * 1000, btnId: 'refreshChatBtn', loadFn: () => loadChat() }
};

window.smartRefresh = async (type) => {
    const config = REFRESH_CONFIG[type];
    const btn = document.getElementById(config.btnId);
    if (!btn || btn.classList.contains('cooldown')) return;

    // 1. Perform Refresh
    try {
        btn.querySelector('i').classList.add('fa-spin');
        await config.loadFn();

        // 2. Set Cooldown
        const expireAt = Date.now() + config.duration;
        localStorage.setItem(`refresh_cooldown_${type}`, expireAt);
        startCooldownUI(type, expireAt);

    } catch (err) {
        console.error("Refresh failed", err);
    } finally {
        setTimeout(() => btn.querySelector('i').classList.remove('fa-spin'), 500);
    }
};

function startCooldownUI(type, expireAt) {
    const config = REFRESH_CONFIG[type];
    const btn = document.getElementById(config.btnId);
    if (!btn) return;

    btn.classList.add('cooldown');

    const interval = setInterval(() => {
        const remaining = expireAt - Date.now();
        if (remaining <= 0) {
            clearInterval(interval);
            btn.classList.remove('cooldown');
            btn.style.setProperty('--p', '0%');
            return;
        }

        const percent = (remaining / config.duration) * 100;
        btn.style.setProperty('--p', `${percent}%`);
    }, 1000);
}

// Restore active cooldowns on load
function restoreCooldowns() {
    ['todo', 'chat'].forEach(type => {
        const expireAt = parseInt(localStorage.getItem(`refresh_cooldown_${type}`));
        if (expireAt && expireAt > Date.now()) {
            startCooldownUI(type, expireAt);
        }
    });
}

// Handler for joining squad exams via chat
window.joinSquadExamMessenger = async (event, examId, squadId, state = 'fresh', expiresAt, challengeId) => {
    if (event) event.stopPropagation();

    // STRICT Joining Window Enforcement
    if (expiresAt && Date.now() > expiresAt) {
        Swal.fire({
            title: 'الوقت خلص⏱️',
            text: 'معلش باب الانضمام قفل من شوية، كان قدامكم ساعة واحدة بس من بداية التحدي.',
            icon: 'warning',
            confirmButtonText: 'ماشي'
        });
        return;
    }

    try {
        // 1. Send Message "انا دخلت"
        await supabase.from('squad_chat_messages').insert({
            squad_id: squadId,
            sender_id: currentProfile.id,
            challenge_id: (challengeId && challengeId !== 'null' && challengeId !== 'undefined') ? challengeId : null,
            text: `انا دخلت`
        });

        // 2. Redirect to exam
        let url = `exam.html?id=${examId}&squad_id=${squadId}`;
        if (challengeId && challengeId !== 'null' && challengeId !== 'undefined') url += `&challenge_id=${challengeId}`;
        window.location.href = url;
    } catch (err) {
        console.error("Error joining exam via messenger:", err);
        window.location.href = `exam.html?id=${examId}&squad_id=${squadId}`;
    }
};

// --- Rules Info Modal ---
window.showSquadRules = () => {
    Swal.fire({
        title: '💡ازاي النقط بتتحسب؟',
        html: `
            <div style="text-align: right; direction: rtl; font-size: 0.9rem; line-height: 1.6; color: #334155;">
                
                <!-- Individual Rewards -->
                <div style="margin-bottom: 1.5rem; background: #f0f9ff; padding: 12px; border-radius: 12px; border: 1px solid #bae6fd;">
                    <h4 style="color: #0369a1; margin-bottom: 8px; display: flex; align-items: center; gap: 8px;">
                        <i class="fas fa-user-circle"></i>نقط لك انت:
                    </h4>
                    <ul style="list-style: none; padding: 0; display: flex; flex-direction: column; gap: 8px;">
                        <li><b>مجهودك:</b> درجتك في الامتحان بتنضاف على طول لنقطك الشخصية (لو دي أول محاولة).</li>
                        <li><b>بونص التقفيل:</b> لو جبت الدرجة النهائية، السيستم بيبعتلك <span style="color:#10b981; font-weight:800;">+10 نقط إضافية</span>.</li>
                        <li><b>بونص الاستمرارية:</b> حل امتحان كل يوم، وكل 3 أيام ورا بعض هتاخد <span style="color:#f59e0b; font-weight:800;">+5 نقط إضافية</span>.</li>
                    </ul>
                </div>

                <!-- Squad Challenge Logic -->
                <div style="margin-bottom: 1.5rem; background: #fff7ed; padding: 12px; border-radius: 12px; border: 1px solid #ffedd5;">
                    <h4 style="color: #c2410c; margin-bottom: 8px; display: flex; align-items: center; gap: 8px;">
                        <i class="fas fa-bullseye"></i>نقط للشلة:
                    </h4>
                    <p style="margin-bottom: 10px; font-size: 0.85rem; color: #ea580c;">* النقط بتنضاف للشلة في نهاية الـ ${globalSquadSettings.join_mins} دقيقة بس!</p>
                    <ul style="list-style: none; padding: 0; display: flex; flex-direction: column; gap: 8px;">
                        <li><b>الشرط:</b> لازم <span style="color:#ef4444; font-weight:800;">${globalSquadSettings.success_threshold}%</span> من أعضاء الشلة يحلوا الامتحان قبل ما الوقت يخلص.</li>
                        <li><b>النقط:</b> بنحسب متوسط درجاتكم + بونص تفاعل <span style="color:#10b981; font-weight:800;">(+5)</span>.</li>
                        <li><b>الكل شارك:</b> لو 100% حلوا، البونص بيبقى <span style="color:#10b981; font-weight:800;">(+10)</span>.</li>
                    </ul>
                </div>

                <!-- Big Gift -->
                <div style="background: #f5f3ff; padding: 12px; border-radius: 12px; border: 1px dashed #8b5cf6; text-align: center;">
                    <h4 style="color: #6d28d9; margin-bottom: 5px;">🎁 هدية الـ 100% مشاركة</h4>
                    <p>لو كل الشلة حلت الامتحان، النظام بيدي <span style="color:#7c3aed; font-weight:800;">+3 نقط بونص</span> لكل واحد فيكم في حسابه الشخصي!</p>
                </div>

            </div>
        `,
        confirmButtonText: 'فهمت الدنيا، يلا بينا! 🚀',
        confirmButtonColor: 'var(--primary-color)',
        width: '450px',
        padding: '1.25rem'
    });
};

// ==========================
// --- Background Sync Manager (Senior Pattern) ---
// ==========================
/**
 * Orchestrates background synchronization for squad components.
 */
async function loadGlobalSettings() {
    try {
        const { data: config } = await supabase.from('app_configs').select('value').eq('key', 'squad_settings').maybeSingle();
        if (config?.value) {
            globalSquadSettings.join_mins = config.value.join_mins || 60;
            globalSquadSettings.grace_mins = config.value.grace_mins || 45;
            globalSquadSettings.max_members = config.value.max_members || 10;
            globalSquadSettings.success_threshold = config.value.success_threshold || 80;
        }
    } catch (e) { console.error("Config fetch fail:", e); }
}

function startSyncManager() {
    if (syncTimer) clearTimeout(syncTimer);

    const FAST_INTERVAL = 20000; // 20s for Chat/Timer
    const SLOW_INTERVAL = 60000; // 60s for Tasks/Members
    const SETTINGS_INTERVAL = 300000; // 5 mins (Reduced from 1hr so users catch up faster on changes)

    let lastSlowSync = 0;
    let lastSettingsSync = 0;

    const performSync = async () => {
        if (document.visibilityState !== 'visible') {
            syncTimer = setTimeout(performSync, FAST_INTERVAL);
            return;
        }

        const now = Date.now();
        const shouldDoSlowSync = (now - lastSlowSync) >= SLOW_INTERVAL;
        const shouldDoSettingsSync = (now - lastSettingsSync) >= SETTINGS_INTERVAL;

        try {
            const tasks = [loadChat(), loadPomodoro()];

            if (shouldDoSlowSync) {
                tasks.push(loadTasks(), loadMembers());
                lastSlowSync = now;
            }

            if (shouldDoSettingsSync || lastSettingsSync === 0) {
                tasks.push(loadGlobalSettings());
                lastSettingsSync = now;
            }

            await Promise.allSettled(tasks);
        } catch (err) {
            console.error('[SyncManager] Sync failed:', err);
        }

        syncTimer = setTimeout(performSync, FAST_INTERVAL);
    };

    // Kick off initial sync
    syncTimer = setTimeout(performSync, FAST_INTERVAL);

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') performSync();
    });
}

// Add to DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
    restoreCooldowns();
    startSyncManager();
});

