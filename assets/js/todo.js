/**
 * Todo List Manager - V4.2 (Subtask Popup Updated)
 */
import { supabase } from "./supabaseClient.js";

document.addEventListener('DOMContentLoaded', async () => {
    const mainInput = document.getElementById('mainTaskInput');
    const addTaskBtn = document.getElementById('addTaskBtn');
    const todoList = document.getElementById('todoList');
    const emptyState = document.getElementById('emptyState');
    const progressBar = document.getElementById('progressBarFill');
    const progressPercent = document.getElementById('progressPercentage');
    const summaryText = document.getElementById('taskCountSummary');
    const greetingText = document.getElementById('greetingText');

    // Modals
    const deleteModal = document.getElementById('deleteModal');
    const confirmDeleteBtn = document.getElementById('confirmDelete');
    const cancelDeleteBtn = document.getElementById('cancelDelete');

    const editModal = document.getElementById('editModal');
    const editTaskInput = document.getElementById('editTaskInput');
    const confirmEditBtn = document.getElementById('confirmEdit');
    const cancelEditBtn = document.getElementById('cancelEdit');

    // Add Subtask Modal
    const addSubModal = document.getElementById('addSubModal');
    const addSubInput = document.getElementById('addSubInput');
    const confirmAddSubBtn = document.getElementById('confirmAddSub');
    const cancelAddSubBtn = document.getElementById('cancelAddSub');

    let tasks = [];
    let editingTarget = { tIdx: null, sIdx: null }; // Track what is being edited
    let deletionTarget = { tIdx: null, sIdx: null }; // Track what is being deleted
    let addingSubTarget = null; // Track which task we are adding a subtask to (index)

    const init = async () => {
        // Greeting logic removed as new header is used
        // const greetings = ["صباح الخير يا بطل! 🌞", "جاهز لإنجاز أهدافك؟ ✨", "يوم جديد.. بداية قوية! 💪", "ركز على هدفك اليوم 🎯"];
        // if (greetingText) greetingText.textContent = greetings[Math.floor(Math.random() * greetings.length)];
        await loadTasksFromDB();
    };

    const loadTasksFromDB = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data, error } = await supabase
            .from('todos')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });

        if (error) {
            console.error("Error loading tasks:", error);
            return;
        }

        tasks = data || [];
        renderTasks();
    };

    const renderTasks = () => {
        todoList.innerHTML = '';
        if (tasks.length === 0) {
            emptyState.style.display = 'flex';
        } else {
            emptyState.style.display = 'none';
            tasks.forEach((task, index) => {
                todoList.appendChild(createTaskElement(task, index));
            });
        }
        updateGlobalProgress();
    };

    const createTaskElement = (task, index) => {
        const card = document.createElement('div');
        card.className = `task-card ${task.completed ? 'completed' : ''}`;
        card.dataset.color = index % 5;

        // Subtasks Logic
        let subtasksHTML = '';
        if (task.subtasks && task.subtasks.length > 0) {
            subtasksHTML = `<div class="subtasks-wrapper">`;
            (task.subtasks || []).forEach((sub, subIndex) => {
                subtasksHTML += `
                        <div class="subtask-item ${sub.completed ? 'completed' : ''}">
                            <div class="sub-checkbox" onclick="window.toggleSubtask(${index}, ${subIndex})">
                                <i class="fas fa-check"></i>
                            </div>
                            <span class="sub-text" onclick="window.toggleSubtask(${index}, ${subIndex})">${sub.text}</span>
                            <div class="task-actions">
                                <button class="action-btn" onclick="window.startEdit(${index}, ${subIndex})" title="تعديل"><i class="fas fa-edit"></i></button>
                                <button class="action-btn delete" onclick="window.deleteSubtask(${index}, ${subIndex})" title="حذف"><i class="fas fa-trash-alt"></i></button>
                            </div>
                        </div>
                `;
            });
            subtasksHTML += `</div>`;
        }

        card.innerHTML = `
            <div class="task-main">
                <div class="task-checkbox-wrapper" onclick="window.toggleTask(${index})">
                    <div class="task-checkbox">
                        <i class="fas fa-check"></i>
                    </div>
                </div>
                <div class="task-text" onclick="window.toggleTask(${index})">${task.text}</div>
                <div class="task-actions">
                    <button class="action-btn add-sub" onclick="window.startAddSub(${index})" title="إضافة مهمة فرعية"><i class="fas fa-plus"></i></button>
                    <button class="action-btn" onclick="window.startEdit(${index}, null)" title="تعديل"><i class="fas fa-edit"></i></button>
                    <button class="action-btn delete" onclick="window.deleteTask(${index})" title="حذف"><i class="fas fa-trash-alt"></i></button>
                </div>
            </div>
            ${subtasksHTML}
        `;

        return card;
    };

    // --- Core Operations ---
    const addTask = async () => {
        const text = mainInput.value.trim();
        if (!text) return;

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data, error } = await supabase
            .from('todos')
            .insert({ text, user_id: user.id, completed: false, subtasks: [] })
            .select()
            .single();

        if (error) {
            console.error("Error adding task:", error);
            return;
        }

        tasks.unshift(data);
        mainInput.value = '';
        renderTasks();
    };

    window.toggleTask = async (index) => {
        const task = tasks[index];
        const newStatus = !task.completed;

        let subtasks = task.subtasks || [];
        // If marking main task as completed, mark all subtasks as completed too
        if (newStatus && subtasks.length > 0) {
            subtasks = subtasks.map(s => ({ ...s, completed: true }));
        }

        const updates = { completed: newStatus, subtasks: subtasks };
        const { error } = await supabase.from('todos').update(updates).eq('id', task.id);

        if (error) return console.error(error);
        task.completed = newStatus;
        task.subtasks = subtasks;

        if (task.completed) triggerCelebration('main');
        renderTasks();
    };

    // ... (Rest of file)

    const triggerCelebration = (type) => {
        if (type === 'massive') {
            // Massive Celebration (Side Bursts)
            var duration = 5 * 1000;
            var end = Date.now() + duration;
            (function frame() {
                confetti({ particleCount: 7, angle: 60, spread: 55, origin: { x: 0 }, colors: ['#03A9F4', '#10b981'] });
                confetti({ particleCount: 7, angle: 120, spread: 55, origin: { x: 1 }, colors: ['#03A9F4', '#10b981'] });
                if (Date.now() < end) requestAnimationFrame(frame);
            }());
        } else if (type === 'main') {
            // Increased main task celebration
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
            // Increased Subtask celebration
            confetti({
                particleCount: 80,
                spread: 60,
                origin: { y: 0.7 },
                scalar: 1.1,
                colors: ['#03A9F4', '#64B5F6']
            });
        }
    };

    // --- Edit Popup Logic ---
    window.startEdit = (tIdx, sIdx) => {
        editingTarget = { tIdx, sIdx };
        const task = tasks[tIdx];
        const val = sIdx === null ? task.text : task.subtasks[sIdx].text;
        editTaskInput.value = val;
        editModal.style.display = 'flex';
        setTimeout(() => editTaskInput.focus(), 50);
    };

    confirmEditBtn.addEventListener('click', async () => {
        const { tIdx, sIdx } = editingTarget;
        const newVal = editTaskInput.value.trim();
        if (!newVal) return;

        const task = tasks[tIdx];
        if (sIdx === null) {
            const { error } = await supabase.from('todos').update({ text: newVal }).eq('id', task.id);
            if (error) return console.error(error);
            task.text = newVal;
        } else {
            const newSubtasks = [...task.subtasks];
            newSubtasks[sIdx].text = newVal;
            const { error } = await supabase.from('todos').update({ subtasks: newSubtasks }).eq('id', task.id);
            if (error) return console.error(error);
            task.subtasks = newSubtasks;
        }

        editModal.style.display = 'none';
        renderTasks();
    });

    cancelEditBtn.addEventListener('click', () => editModal.style.display = 'none');
    editTaskInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') confirmEditBtn.click(); });

    // --- Add Subtask Popup Logic ---
    window.startAddSub = (index) => {
        addingSubTarget = index;
        addSubInput.value = '';
        addSubModal.style.display = 'flex';
        setTimeout(() => addSubInput.focus(), 50);
    };

    confirmAddSubBtn.addEventListener('click', async () => {
        if (addingSubTarget === null) return;
        const subText = addSubInput.value.trim();
        if (!subText) return;

        const task = tasks[addingSubTarget];
        const newSubtasks = [...(task.subtasks || []), { text: subText, completed: false }];

        // If main task completed, marking it incomplete? Optional. Let's keep it simple.
        // Actually often adding a subtask means the main task is not "done" yet or expanded.
        // Let's uncheck main task just in case.
        const updates = { subtasks: newSubtasks };
        if (task.completed) updates.completed = false;

        const { error } = await supabase.from('todos').update(updates).eq('id', task.id);
        if (error) return console.error(error);

        task.subtasks = newSubtasks;
        if (task.completed) task.completed = false;

        addSubModal.style.display = 'none';
        renderTasks();
    });

    cancelAddSubBtn.addEventListener('click', () => addSubModal.style.display = 'none');
    addSubInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') confirmAddSubBtn.click(); });


    // --- Deletion Logic ---
    window.deleteTask = (index) => {
        deletionTarget = { tIdx: index, sIdx: null };
        deleteModal.style.display = 'flex';
    };

    window.deleteSubtask = (tIdx, sIdx) => {
        deletionTarget = { tIdx, sIdx };
        deleteModal.style.display = 'flex';
    };

    confirmDeleteBtn.addEventListener('click', async () => {
        const { tIdx, sIdx } = deletionTarget;
        const task = tasks[tIdx];

        if (sIdx === null) {
            const { error } = await supabase.from('todos').delete().eq('id', task.id);
            if (error) return console.error(error);
            tasks.splice(tIdx, 1);
        } else {
            const newSubtasks = [...task.subtasks];
            newSubtasks.splice(sIdx, 1);
            const { error } = await supabase.from('todos').update({ subtasks: newSubtasks }).eq('id', task.id);
            if (error) return console.error(error);
            task.subtasks = newSubtasks;
        }

        deleteModal.style.display = 'none';
        renderTasks();
    });

    cancelDeleteBtn.addEventListener('click', () => deleteModal.style.display = 'none');

    // --- Subtask Toggle Logic ---
    window.toggleSubtask = async (tIdx, sIdx) => {
        const task = tasks[tIdx];
        const newSubtasks = [...task.subtasks];
        newSubtasks[sIdx].completed = !newSubtasks[sIdx].completed;

        let newStatus = task.completed;
        if (newSubtasks[sIdx].completed) {
            triggerCelebration('sub');
            if (newSubtasks.every(s => s.completed)) {
                newStatus = true;
                triggerCelebration('main');
            }
        } else {
            newStatus = false;
        }

        const { error } = await supabase.from('todos').update({ subtasks: newSubtasks, completed: newStatus }).eq('id', task.id);
        if (error) return console.error(error);

        task.subtasks = newSubtasks;
        task.completed = newStatus;
        renderTasks();
    };

    // --- Progress & Analytics ---
    const updateGlobalProgress = () => {
        if (tasks.length === 0) {
            progressBar.style.width = '0%'; progressPercent.textContent = '0%';
            summaryText.textContent = 'ابدأ بإضافة مهامك اليوم!'; return;
        }
        let totalProgress = 0;
        const mainTaskWeight = 1 / tasks.length;
        tasks.forEach(task => {
            if (!task.subtasks || task.subtasks.length === 0) {
                if (task.completed) totalProgress += mainTaskWeight;
            } else {
                let subProgressValue = 0;
                task.subtasks.forEach(s => { if (s.completed) subProgressValue += (1 / task.subtasks.length); });
                totalProgress += subProgressValue * mainTaskWeight;
            }
        });
        const percentage = Math.round(totalProgress * 100);
        progressBar.style.width = `${percentage}%`;
        progressPercent.textContent = `${percentage}%`;
        if (percentage === 100) {
            summaryText.textContent = "عاش يا بطل! خلصت كل اللي عليك🏆";
            // Trigger custom massive celebration once per session
            if (sessionStorage.getItem('todo_100_celebration') !== 'true') {
                triggerCelebration('massive');
                sessionStorage.setItem('todo_100_celebration', 'true');
            }
        } else {
            summaryText.textContent = "ذاكر و خلص اللي وراك🌟";
            sessionStorage.removeItem('todo_100_celebration');
        }
    };

    function randomInRange(min, max) {
        return Math.random() * (max - min) + min;
    }


    // --- Pomodoro Logic (Local) ---
    let pomodoroInterval = null;
    let pomodoroEndTime = null;

    const initPomodoro = () => {
        const btn = document.getElementById('startPomodoroBtn');
        if (btn) btn.onclick = startPomodoroFlow;

        // Check for running timer in localStorage
        const savedEnd = localStorage.getItem('personal_pomodoro_end');
        if (savedEnd) {
            const now = Date.now();
            if (parseInt(savedEnd) > now) {
                pomodoroEndTime = parseInt(savedEnd);
                startLocalTimerDisplay();
                btn.textContent = 'إيقاف المذاكرة 🛑';
                btn.onclick = stopPomodoro;
            } else {
                localStorage.removeItem('personal_pomodoro_end');
            }
        }
    };

    const startPomodoroFlow = async () => {
        const { value: duration } = await Swal.fire({
            title: 'مدة المذاكرة؟ ⏱️',
            input: 'select',
            inputOptions: {
                '25': '25 دقيقة',
                '50': '50 دقيقة',
                '60': 'ساعة كاملة',
                '90': 'ساعة ونصف',
                '120': 'ساعتين',
                '150': 'ساعتين ونصف',
                '180': '3 ساعات',
                '210': '3 ساعات ونصف',
                '240': '4 ساعات',
            },
            inputPlaceholder: 'اختار الوقت...',
            showCancelButton: true,
            confirmButtonText: 'ابدأ',
            cancelButtonText: 'إلغاء'
        });

        if (!duration) return;

        const durationMs = parseInt(duration) * 60 * 1000;
        pomodoroEndTime = Date.now() + durationMs;
        localStorage.setItem('personal_pomodoro_end', pomodoroEndTime);

        startLocalTimerDisplay();

        const btn = document.getElementById('startPomodoroBtn');
        btn.textContent = 'وقف المذاكرة 🛑';
        btn.onclick = stopPomodoro;
    };

    const stopPomodoro = () => {
        if (pomodoroInterval) clearInterval(pomodoroInterval);
        pomodoroEndTime = null;
        localStorage.removeItem('personal_pomodoro_end');
        document.getElementById('pomodoroTimer').textContent = '25:00';

        const btn = document.getElementById('startPomodoroBtn');
        btn.textContent = 'ابدأ المذاكرة 🔥';
        btn.onclick = startPomodoroFlow;
    };

    const startLocalTimerDisplay = () => {
        if (pomodoroInterval) clearInterval(pomodoroInterval);

        const tick = () => {
            const now = Date.now();
            const diff = pomodoroEndTime - now;

            if (diff <= 0) {
                stopPomodoro();
                Swal.fire('عاش يا بطل! 🎉', 'خلصت مذاكرة.', 'success');
                return;
            }

            const mins = Math.floor(diff / (1000 * 60));
            const secs = Math.floor((diff / 1000) % 60);
            document.getElementById('pomodoroTimer').textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        };

        tick(); // Immediate update
        pomodoroInterval = setInterval(tick, 1000);
    };

    initPomodoro();

    addTaskBtn.addEventListener('click', addTask);
    mainInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') addTask(); });

    init();
});
