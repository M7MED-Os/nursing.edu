/**
 * Admin Content Module
 * Chapter/Lesson/Exam tree management and editors
 */

import {
    supabase,
    currentContext,
    showView,
    openModal,
    closeModal,
    showWarningAlert,
    showErrorAlert,
    showSuccessAlert
} from './admin-core.js';

import { renderExamQuestions } from './admin-questions.js';

/**
 * Open subject manager view
 */
export async function openSubjectManager(subjectId) {
    const { data: subject } = await supabase.from('subjects').select('*').eq('id', subjectId).single();
    if (!subject) return;

    currentContext.subject = subject;
    document.getElementById('pageTitle').textContent = `الرئيسية > ${subject.name_ar}`;

    showView('subjectManagerView');
    await loadContentTree();
}

/**
 * Load content tree (chapters → lessons → exams)
 */
export async function loadContentTree() {
    const treeContainer = document.getElementById('contentTree');
    treeContainer.innerHTML = '<div class="spinner" style="width:20px; height:20px;"></div>';

    // Fetch all for this subject
    const { data: chapters } = await supabase.from('chapters')
        .select('*').eq('subject_id', currentContext.subject.id).order('order_index');

    const { data: lessons } = await supabase.from('lessons')
        .select('*').in('chapter_id', chapters.map(c => c.id)).order('order_index');

    const { data: exams } = await supabase.from('exams')
        .select('*')
        .eq('subject_id', currentContext.subject.id)
        .order('order_index', { ascending: true });

    // Build tree
    treeContainer.innerHTML = '';

    if (chapters.length === 0) {
        treeContainer.innerHTML = '<p class="empty-state" style="padding:1rem;">لا توجد أبواب.</p>';
        return;
    }

    chapters.forEach(chapter => {
        const chNode = createTreeNode({ type: 'chapter', data: chapter, label: chapter.title, icon: 'fa-folder' });
        treeContainer.appendChild(chNode);

        const chLessons = lessons.filter(l => l.chapter_id === chapter.id);
        const chExams = exams.filter(e => e.chapter_id === chapter.id);

        // Render lessons
        chLessons.forEach(lesson => {
            const lNode = createTreeNode({ type: 'lesson', data: lesson, label: lesson.title, icon: 'fa-book-open', indent: 1 });
            treeContainer.appendChild(lNode);

            // Lesson exams
            const lExams = exams.filter(e => e.lesson_id === lesson.id);
            lExams.forEach(exam => {
                const eNode = createTreeNode({ type: 'exam', data: exam, label: exam.title, icon: 'fa-file-alt', indent: 2 });
                treeContainer.appendChild(eNode);
            });
        });

        // Chapter exams (finals)
        chExams.forEach(exam => {
            const eNode = createTreeNode({ type: 'exam', data: exam, label: `${exam.title} (شامل)`, icon: 'fa-star', indent: 1, color: '#00bcd4' });
            treeContainer.appendChild(eNode);
        });
    });
}

/**
 * Create tree node element
 */
export function createTreeNode({ type, data, label, icon, indent = 0, color = '' }) {
    const div = document.createElement('div');
    div.className = `tree-node indent-${indent}`;
    if (color) div.style.color = color;

    div.innerHTML = `
        <div style="display:flex; align-items:center; flex:1;">
            <i class="fas ${icon} node-icon"></i>
            <span class="node-text">${label}</span>
        </div>
        <button class="action-btn-sm" style="background:transparent; color:#6b7280; opacity:0.5;" 
            onclick="event.stopPropagation(); window.openEditNodeModal('${type}', ${JSON.stringify(data).replace(/"/g, '&quot;')})">
            <i class="fas fa-pen" style="font-size:0.7rem;"></i>
        </button>
    `;

    div.onclick = () => {
        document.querySelectorAll('.tree-node').forEach(n => n.classList.remove('active'));
        div.classList.add('active');
        openEditor(type, data);
    };

    return div;
}

/**
 * Open add chapter modal
 */
export function openAddChapterModal() {
    if (!currentContext.subject) return showWarningAlert('تنبيه', 'اختر مادة أولاً');

    openModal({
        title: 'إضافة باب جديد',
        body: `
            <div class="form-group">
                <label>عنوان الباب</label>
                <input type="text" id="chTitle" class="form-control" required>
            </div>
            <div class="form-group">
                <label>الترتيب</label>
                <input type="number" id="chOrder" class="form-control" value="0">
            </div>
        `,
        onSave: async () => {
            const title = document.getElementById('chTitle').value;
            const order = document.getElementById('chOrder').value;

            const { error } = await supabase.from('chapters').insert({
                subject_id: currentContext.subject.id,
                title, order_index: order
            });

            if (error) showErrorAlert('خطأ', error.message);
            else { closeModal(); loadContentTree(); showSuccessAlert('تم', 'تمت الإضافة بنجاح'); }
        }
    });
}

/**
 * Open editor based on content type
 */
export function openEditor(type, data) {
    const panel = document.getElementById('editorPanel');

    if (type === 'chapter') {
        panel.innerHTML = `
            <h3>تعديل الباب: ${data.title}</h3>
            <div class="form-actions" style="margin-bottom:2rem;">
                 <button class="btn btn-primary btn-sm" onclick="window.openAddLessonModal('${data.id}')">
                    <i class="fas fa-plus"></i> إضافة درس
                </button>
                 <button class="btn btn-outline btn-sm" onclick="window.openAddExamModal('chapter', '${data.id}')">
                    <i class="fas fa-plus"></i> إضافة امتحان شامل
                </button>
                 <button class="btn btn-outline btn-sm" style="color:red; float:left;" onclick="window.deleteItem('chapters', '${data.id}')">
                    <i class="fas fa-trash"></i> حذف الباب
                </button>
            </div>
        `;
    }
    else if (type === 'lesson') {
        panel.innerHTML = `
            <h3>تعديل الدرس: ${data.title}</h3>
            
            <div class="card card-admin mb-4 mt-3" style="padding: 1.5rem; border: 1px solid #e2e8f0; background: #fff;">
                <h4 style="margin-bottom: 1rem;"><i class="fas fa-graduation-cap"></i> محتوى المحاضرة</h4>
                
                <div class="form-group mb-3">
                    <label>رابط الفيديو (YouTube)</label>
                    <input type="text" id="lessonVideoUrl" class="form-control" value="${data.video_url || ''}" placeholder="https://www.youtube.com/watch?v=...">
                </div>

                <div class="form-group mb-3">
                    <label>نص المحاضرة (HTML المترجم)</label>
                    <textarea id="lessonContent" class="form-control" rows="15" placeholder="" style="font-family: monospace; font-size: 0.9rem;">${data.content || ''}</textarea>
                </div>

                <button class="btn btn-primary w-100" onclick="window.saveLectureData('${data.id}')">
                    <i class="fas fa-save"></i> حفظ المحتوى والفيديو
                </button>
            </div>

            <div class="form-actions" style="margin-top:2rem; padding-top: 1rem; border-top: 1px solid #eee;">
                 <button class="btn btn-outline btn-sm" onclick="window.openAddExamModal('lesson', '${data.id}')">
                    <i class="fas fa-plus"></i> إضافة امتحان
                </button>
                 <button class="btn btn-outline btn-sm" style="color:red; float:left;" onclick="window.deleteItem('lessons', '${data.id}')">
                    <i class="fas fa-trash"></i> حذف الدرس
                </button>
            </div>
        `;
    }
    else if (type === 'exam') {
        renderExamQuestions(data);
    }
}

/**
 * Open add lesson modal
 */
export function openAddLessonModal(chapterId) {
    openModal({
        title: 'إضافة درس',
        body: `<div class="form-group"><label>العنوان</label><input id="lTitle" class="form-control"></div>`,
        onSave: async () => {
            await supabase.from('lessons').insert({
                chapter_id: chapterId,
                title: document.getElementById('lTitle').value
            });
            closeModal(); loadContentTree();
        }
    });
}

/**
 * Open add exam modal
 */
export function openAddExamModal(parentType, parentId) {
    openModal({
        title: 'إضافة امتحان',
        body: `<div class="form-group"><label>العنوان</label><input id="eTitle" class="form-control"></div>`,
        onSave: async () => {
            const payload = {
                title: document.getElementById('eTitle').value,
                subject_id: currentContext.subject.id
            };
            if (parentType === 'lesson') payload.lesson_id = parentId;
            else payload.chapter_id = parentId;

            await supabase.from('exams').insert(payload);
            closeModal(); loadContentTree();
        }
    });
}

/**
 * Delete item with confirmation
 */
export async function deleteItem(table, id) {
    const result = await Swal.fire({
        title: 'هل أنت متأكد؟',
        text: "لا يمكن التراجع عن هذا الإجراء!",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'نعم، احذف',
        cancelButtonText: 'إلغاء'
    });

    if (!result.isConfirmed) return;

    await supabase.from(table).delete().eq('id', id);
    loadContentTree();
    document.getElementById('editorPanel').innerHTML = '';
    showSuccessAlert('تم الحذف!', 'تم حذف العنصر بنجاح.', 1500);
}

/**
 * Open edit node modal
 */
export function openEditNodeModal(type, data) {
    const labels = { 'chapter': 'الباب', 'lesson': 'الدرس', 'exam': 'الامتحان' };
    const tables = { 'chapter': 'chapters', 'lesson': 'lessons', 'exam': 'exams' };

    openModal({
        title: `تعديل اسم ${labels[type]}`,
        body: `
            <div class="form-group">
                <label>العنوان الجديد</label>
                <input type="text" id="editNodeTitle" class="form-control" value="${data.title}">
            </div>
            <div class="form-group">
                <label>الترتيب</label>
                <input type="number" id="editNodeOrder" class="form-control" value="${data.order_index || 0}">
            </div>
        `,
        onSave: async () => {
            const newTitle = document.getElementById('editNodeTitle').value;
            const newOrder = document.getElementById('editNodeOrder').value;
            if (!newTitle) return showWarningAlert('تنبيه', 'العنوان مطلوب');

            const { error } = await supabase.from(tables[type]).update({
                title: newTitle,
                order_index: newOrder
            }).eq('id', data.id);

            if (error) showErrorAlert('خطأ', error.message);
            else {
                closeModal();
                loadContentTree();
                showSuccessAlert('تم', 'تم التعديل بنجاح');
            }
        }
    });
}

/**
 * Save lecture data (content + video)
 */
export async function saveLectureData(lessonId) {
    const content = document.getElementById('lessonContent').value;
    const videoUrl = document.getElementById('lessonVideoUrl').value;

    const { error } = await supabase.from('lessons').update({
        content: content,
        video_url: videoUrl
    }).eq('id', lessonId);

    if (error) {
        showErrorAlert('خطأ', 'تعذر حفظ البيانات: ' + error.message);
    } else {
        showSuccessAlert('تم الحفظ', 'تم تحديث محتوى المحاضرة والفيديو بنجاح', 1500);
    }
}

// Expose functions globally for onclick handlers
window.openSubjectManager = openSubjectManager;
window.openAddChapterModal = openAddChapterModal;
window.openAddLessonModal = openAddLessonModal;
window.openAddExamModal = openAddExamModal;
window.deleteItem = deleteItem;
window.openEditNodeModal = openEditNodeModal;
window.saveLectureData = saveLectureData;
