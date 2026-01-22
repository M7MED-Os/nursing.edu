import { supabase } from "./supabaseClient.js";

// State
let currentSquad = null;
let currentProfile = null;
let chatSubscription = null;
let taskSubscription = null;
let pomodoroInterval = null;
let pomodoroEnd = null;
let membersSubscription = null;
let pomodoroSubscription = null;

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

    // 2. Get Profile
    const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
    currentProfile = profile;

    // 3. Check for Squad Membership
    // Use .maybeSingle() instead of .single() to avoid 406/500 errors if not found
    const { data: memberRecord, error: memberError } = await supabase
        .from('squad_members')
        .select('squad_id, squads(*)')
        .eq('profile_id', user.id)
        .maybeSingle();

    if (memberError) {
        console.error("Membership check error:", memberError);
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
    document.getElementById('squadName').textContent = currentSquad.name;
    document.getElementById('squadInfo').textContent = `${currentSquad.academic_year || 'سنة غير محددة'} - ${currentSquad.department || 'عام'}`;
    document.getElementById('squadPoints').textContent = `رصيد الشلة: ${currentSquad.points || 0} نقطة 🔥`;
    document.getElementById('squadCode').textContent = currentSquad.id.split('-')[0].toUpperCase();

    // Load Sub-components
    loadMembers();
    loadTasks();
    loadChat();
    loadPomodoro();
    setupRealtime();
    setupPresence(); // New: Presence track
}

// --- Squad Actions (Create/Join) ---
window.showCreateSquadModal = async () => {
    const { value: name } = await Swal.fire({
        title: 'اسم شلتك الجديدة؟ 🚀',
        input: 'text',
        inputPlaceholder: 'ادخل اسم الشلة...',
        showCancelButton: true,
        confirmButtonText: 'إنشاء الشلة'
    });

    if (name) {
        try {
            // Mapping grade to Arabic name
            const gradeLabel = { '1': 'الأولى', '2': 'الثانية', '3': 'الثالثة', '4': 'الرابعة' };
            const streamLabel = { 'pediatric': 'أطفال', 'obs_gyn': 'نسا', 'nursing_admin': 'إدارة', 'psychiatric': 'نفسية' };

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

// --- Presence (نظام التواجد) ---
function setupPresence() {
    const channel = supabase.channel(`squad_presence_${currentSquad.id}`);

    channel
        .on('presence', { event: 'sync' }, () => {
            const state = channel.presenceState();
            updateMembersStatusUI(state);
        })
        .on('presence', { event: 'join', key: 'user' }, ({ newPresences }) => {
            console.log('Joined:', newPresences);
        })
        .subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
                await channel.track({
                    user_id: currentProfile.id,
                    online_at: new Date().toISOString(),
                });
            }
        });
}

function updateMembersStatusUI(presenceState) {
    const onlineUserIds = Object.values(presenceState).flat().map(p => p.user_id);
    document.querySelectorAll('.member-item').forEach(item => {
        const userId = item.dataset.userid;
        const dot = item.querySelector('.status-dot');
        if (onlineUserIds.includes(userId)) {
            dot.classList.add('online');
        } else {
            dot.classList.remove('online');
        }
    });
}

window.showJoinSquadModal = async () => {
    const { value: code } = await Swal.fire({
        title: 'ادخل كود الشلة',
        input: 'text',
        inputPlaceholder: 'مثال: ABCD (أول 4 حروف من الآيدي)',
        showCancelButton: true
    });

    if (code) {
        // Search by prefix
        const { data: squads } = await supabase.from('squads').select('*').ilike('id', `${code}%`);

        if (squads && squads.length > 0) {
            const squad = squads[0];
            await supabase.from('squad_members').insert({
                squad_id: squad.id,
                profile_id: currentProfile.id
            });
            location.reload();
        } else {
            Swal.fire('مش لاقيينها!', 'اتأكد من الكود يا بطل', 'warning');
        }
    }
};

// --- Members ---
async function loadMembers() {
    const { data: members } = await supabase
        .from('squad_members')
        .select('profile_id, profiles(full_name, points)')
        .eq('squad_id', currentSquad.id);

    const list = document.getElementById('memberList');
    document.getElementById('squadMemberCount').textContent = `${members.length} أعضاء`;

    const isOwner = currentSquad.owner_id === currentProfile.id;

    list.innerHTML = members.map(m => {
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

        return `
            <div class="member-item" data-userid="${m.profile_id}" style="display:flex; align-items:center; gap:10px;">
                <div class="status-dot"></div>
                <div style="flex:1">
                    <div style="font-weight:700; font-size:0.9rem;">${m.profiles.full_name}</div>
                    <div style="font-size:0.75rem; color:#64748b;">${m.profiles.points} نقطة</div>
                </div>
                ${actions}
            </div>
        `;
    }).join('');
}

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
    const { data: tasks } = await supabase
        .from('squad_tasks')
        .select('*, squad_task_completions(profile_id, profiles(full_name))')
        .eq('squad_id', currentSquad.id)
        .order('created_at', { ascending: true });

    // Pre-process tasks for local individual state
    tasks.forEach(t => {
        t.is_done_by_me = t.squad_task_completions.some(c => c.profile_id === currentProfile.id);
        t.others_who_done = t.squad_task_completions.filter(c => c.profile_id !== currentProfile.id);
    });

    const mainTasks = tasks.filter(t => !t.parent_id);
    const subTasks = tasks.filter(t => t.parent_id);

    updateProgressBar(tasks);
    renderTasks(mainTasks, subTasks);
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
}

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
            confetti({ particleCount: 150, spread: 100, origin: { y: 0.6 }, colors: ['#03A9F4', '#10b981', '#f59e0b'] });
        } else {
            confetti({ particleCount: 40, spread: 50, origin: { y: 0.7 } });
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
    const { data: msgs } = await supabase
        .from('squad_chat_messages')
        .select('*, profiles!sender_id(full_name)')
        .eq('squad_id', currentSquad.id)
        .order('created_at', { ascending: false })
        .limit(50);

    renderChat(msgs.reverse());
}

async function renderChat(msgs) {
    const box = document.getElementById('chatBox');
    const myId = currentProfile.id;

    // Fetch read markers for these messages
    const msgIds = msgs.map(m => m.id);
    const { data: allReads } = await supabase.from('squad_message_reads').select('message_id, profiles!profile_id(full_name)').in('message_id', msgIds);

    box.innerHTML = msgs.map(m => {
        const time = new Date(m.created_at).toLocaleTimeString('ar-EG', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });

        // Mark as read if not mine and not already marked
        if (m.sender_id !== myId) {
            markAsRead(m.id);
        }

        const readers = allReads?.filter(r => r.message_id === m.id).map(r => r.profiles.full_name.split(' ')[0]) || [];
        const seenIcon = readers.length > 0 ? `<div class="msg-seen"><i class="fas fa-check-double"></i> شوهد: ${readers.join('، ')}</div>` : '';

        return `
            <div class="msg ${m.sender_id === myId ? 'sent' : 'received'}" data-msgid="${m.id}">
                <span class="msg-sender">${m.profiles.full_name}</span>
                <div class="msg-content">${m.text}</div>
                <span class="msg-time">${time}</span>
                ${m.sender_id === myId ? seenIcon : ''}
            </div>
        `;
    }).join('');
    box.scrollTop = box.scrollHeight;
}

async function markAsRead(msgId) {
    await supabase.from('squad_message_reads').upsert({ message_id: msgId, profile_id: currentProfile.id }, { onConflict: 'message_id,profile_id' });
}

document.getElementById('chatForm').onsubmit = async (e) => {
    e.preventDefault();
    const input = document.getElementById('chatInput');
    const text = input.value.trim();
    if (!text) return;

    input.value = '';
    await supabase.from('squad_chat_messages').insert({
        squad_id: currentSquad.id,
        sender_id: currentProfile.id,
        text
    });
};

// --- Realtime ---
function setupRealtime() {
    // Squad Global Activity Channel
    supabase.channel('squad_activity')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'squad_chat_messages', filter: `squad_id=eq.${currentSquad.id}` }, () => {
            console.log('New message received!');
            loadChat();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'squad_tasks', filter: `squad_id=eq.${currentSquad.id}` }, () => loadTasks())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'squad_task_completions' }, () => {
            console.log('Task completion updated!');
            loadTasks();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'squad_members', filter: `squad_id=eq.${currentSquad.id}` }, () => loadMembers())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'squad_pomodoro', filter: `squad_id=eq.${currentSquad.id}` }, () => loadPomodoro())
        .subscribe((status) => {
            console.log('Realtime Status:', status);
        });
}

// --- Pomodoro Logic ---
async function loadPomodoro() {
    const { data: pom } = await supabase
        .from('squad_pomodoro')
        .select('*')
        .eq('squad_id', currentSquad.id)
        .maybeSingle();

    if (pom && pom.status === 'running') {
        const startTime = new Date(pom.start_time).getTime();
        const durationMs = (pom.duration || 25) * 60 * 1000;
        pomodoroEnd = startTime + durationMs;

        if (pomodoroEnd > Date.now()) {
            startLocalTimer(pom);
        } else {
            resetPomodoroUI();
        }
    } else {
        resetPomodoroUI();
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
        text: `📢 بدأت جلسة مذاكرة بومودورو لمدة ${duration} دقيقة.. من سينضم؟`
    });
};

document.getElementById('startPomodoroBtn').onclick = startPomodoroFlow;

// --- Collaborative Exams ---
window.startSharedExam = async () => {
    try {
        // 1. Fetch Subjects
        const { data: subjects } = await supabase.from('subjects').select('*');

        const { value: subjId } = await Swal.fire({
            title: 'اختار المادة 📚',
            input: 'select',
            inputOptions: Object.fromEntries(subjects.map(s => [s.id, s.title])),
            inputPlaceholder: 'اختار المادة...',
            showCancelButton: true
        });

        if (!subjId) return;

        // 2. Fetch Exams for this Subject
        const { data: exams } = await supabase.from('exams').select('*').eq('subject_id', subjId);

        if (!exams || exams.length === 0) {
            Swal.fire('تنبيه', 'المادة دي مفيش فيها امتحانات لسة.', 'info');
            return;
        }

        const { value: examId } = await Swal.fire({
            title: 'اختار الامتحان 📝',
            input: 'select',
            inputOptions: Object.fromEntries(exams.map(e => [e.id, e.title])),
            inputPlaceholder: 'اختار الامتحان...',
            showCancelButton: true
        });

        if (!examId) return;

        // 3. Create Session (if doesn't exist)
        const { data: session } = await supabase
            .from('squad_exam_sessions')
            .insert({
                squad_id: currentSquad.id,
                exam_id: examId,
                status: 'active',
                started_by: currentProfile.id
            })
            .select()
            .single();

        // 4. Notify in chat with a link
        const examName = exams.find(e => e.id == examId).title;
        await supabase.from('squad_chat_messages').insert({
            squad_id: currentSquad.id,
            sender_id: currentProfile.id,
            text: `🎯 أطلق تحدي جماعي جديد في امتحان: [${examName}]! يلا ادخلوا وحلوا سوا.`
        });

        // 5. Redirect starter
        window.location.href = `exam.html?id=${examId}&squad_id=${currentSquad.id}`;

    } catch (err) {
        console.error(err);
        Swal.fire('خطأ', 'فشل في بدء التحدي الجماعي.', 'error');
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

window.shareSquadOnWhatsapp = () => {
    const code = document.getElementById('squadCode').textContent;
    const text = `يا بطل! تعال انضم لشلتي في "تمريض بنها" ونذاكر مع بعض.. كود الشلة: ${code}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`);
};
