// Squad Settings & Management Module (Placeholder)
import { supabase } from '../supabaseClient.js';
import { currentSquad, currentProfile, setCurrentSquad } from './state.js';

/**
 * Edit squad name
 * TODO: Extract full implementation from squad.js lines 1575-1669
 */
export async function editSquadName() {
    const { value: newName } = await Swal.fire({
        title: 'تعديل اسم الشلة',
        input: 'text',
        inputValue: currentSquad.name,
        inputPlaceholder: 'اسم الشلة الجديد',
        showCancelButton: true,
        confirmButtonText: 'حفظ',
        cancelButtonText: 'إلغاء',
        inputValidator: (value) => {
            if (!value || value.trim().length < 3) {
                return 'الاسم لازم يكون 3 حروف على الأقل';
            }
        }
    });

    if (newName) {
        const { error } = await supabase
            .from('squads')
            .update({ name: newName.trim() })
            .eq('id', currentSquad.id);

        if (!error) {
            currentSquad.name = newName.trim();
            setCurrentSquad(currentSquad);
            document.getElementById('squadNameText').textContent = newName.trim();
            Swal.fire('تم!', 'تم تحديث اسم الشلة', 'success');
        } else {
            Swal.fire('خطأ', 'حدث خطأ أثناء التحديث', 'error');
        }
    }
}

/**
 * Edit squad bio
 */
export async function editSquadBio() {
    const { value: newBio } = await Swal.fire({
        title: 'تعديل البايو',
        input: 'textarea',
        inputValue: currentSquad.bio || '',
        inputPlaceholder: 'اكتب بايو الشلة...',
        showCancelButton: true,
        confirmButtonText: 'حفظ',
        cancelButtonText: 'إلغاء'
    });

    if (newBio !== undefined) {
        const { error } = await supabase
            .from('squads')
            .update({ bio: newBio.trim() })
            .eq('id', currentSquad.id);

        if (!error) {
            currentSquad.bio = newBio.trim();
            setCurrentSquad(currentSquad);

            const bioDisplay = document.querySelector('#squadBioDisplay .bio-text');
            if (bioDisplay) {
                if (newBio.trim()) {
                    bioDisplay.textContent = newBio.trim();
                    bioDisplay.classList.remove('empty');
                } else {
                    bioDisplay.textContent = 'مفيش بايو';
                    bioDisplay.classList.add('empty');
                }
            }

            Swal.fire('تم!', 'تم تحديث البايو', 'success');
        } else {
            Swal.fire('خطأ', 'حدث خطأ أثناء التحديث', 'error');
        }
    }
}

/**
 * Show create squad modal
 */
export async function showCreateSquadModal() {
    const { value: formValues } = await Swal.fire({
        title: 'إنشاء شلة جديدة',
        html: `
            <input id="squad-name" class="swal2-input" placeholder="اسم الشلة">
            <select id="squad-year" class="swal2-input">
                <option value="">اختر السنة الدراسية</option>
                <option value="first_year">السنة الأولى</option>
                <option value="second_year">السنة الثانية</option>
                <option value="third_year">السنة الثالثة</option>
                <option value="fourth_year">السنة الرابعة</option>
            </select>
            <select id="squad-dept" class="swal2-input">
                <option value="">اختر القسم</option>
                <option value="general">عام</option>
                <option value="medical_surgical">باطني جراحي</option>
                <option value="pediatric">أطفال</option>
                <option value="maternity">أمومة وطفولة</option>
                <option value="psychiatric">نفسي</option>
                <option value="community">مجتمع</option>
            </select>
        `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: 'إنشاء',
        cancelButtonText: 'إلغاء',
        preConfirm: () => {
            const name = document.getElementById('squad-name').value;
            const year = document.getElementById('squad-year').value;
            const dept = document.getElementById('squad-dept').value;

            if (!name || !year || !dept) {
                Swal.showValidationMessage('من فضلك املأ جميع الحقول');
                return false;
            }

            return { name, year, dept };
        }
    });

    if (formValues) {
        const { data: newSquad, error } = await supabase
            .from('squads')
            .insert({
                name: formValues.name,
                academic_year: formValues.year,
                department: formValues.dept,
                owner_id: currentProfile.id
            })
            .select()
            .single();

        if (!error && newSquad) {
            await supabase.from('squad_members').insert({
                squad_id: newSquad.id,
                profile_id: currentProfile.id
            });

            Swal.fire('تم!', 'تم إنشاء الشلة بنجاح', 'success');
            window.location.reload();
        } else {
            Swal.fire('خطأ', error?.message || 'حدث خطأ', 'error');
        }
    }
}

/**
 * Show join squad modal
 */
export async function showJoinSquadModal() {
    const { value: code } = await Swal.fire({
        title: 'انضم لشلة',
        input: 'text',
        inputPlaceholder: 'كود الشلة',
        showCancelButton: true,
        confirmButtonText: 'انضم',
        cancelButtonText: 'إلغاء'
    });

    if (code) {
        const { data: squads } = await supabase
            .from('squads')
            .select('*')
            .ilike('id', `${code}%`)
            .limit(1);

        if (squads && squads.length > 0) {
            const squad = squads[0];

            // Check member limit
            const { data: members } = await supabase
                .from('squad_members')
                .select('profile_id')
                .eq('squad_id', squad.id);

            const limit = 10; // Default limit
            if (members && members.length >= limit) {
                Swal.fire('الشلة مليانة!', `للأسف الشلة دي وصلت للحد الأقصى (${limit} طلاب).`, 'error');
                return;
            }

            const { error } = await supabase.from('squad_members').insert({
                squad_id: squad.id,
                profile_id: currentProfile.id
            });

            if (!error) {
                Swal.fire('تم!', 'تم الانضمام للشلة بنجاح', 'success');
                window.location.reload();
            } else {
                Swal.fire('خطأ', 'حدث خطأ أثناء الانضمام', 'error');
            }
        } else {
            Swal.fire('خطأ', 'الكود غير صحيح', 'error');
        }
    }
}

// Expose functions globally
window.editSquadName = editSquadName;
window.editSquadBio = editSquadBio;
window.showCreateSquadModal = showCreateSquadModal;
window.showJoinSquadModal = showJoinSquadModal;

/**
 * Squad Privacy Settings
 */
window.openSquadPrivacyModal = async function () {
    // Load modal if not exists
    if (!document.getElementById('squadPrivacyModal')) {
        try {
            const response = await fetch('components/squad-privacy-modal.html');
            const html = await response.text();
            document.body.insertAdjacentHTML('beforeend', html);
        } catch (err) {
            console.error('Error loading modal:', err);
            return;
        }
    }

    const modal = document.getElementById('squadPrivacyModal');
    if (modal) {
        modal.style.display = 'block';
        document.body.style.overflow = 'hidden';
        loadSquadPrivacySettings();
    }
};

window.closeSquadPrivacyModal = function () {
    const modal = document.getElementById('squadPrivacyModal');
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = 'auto';
    }
};

async function loadSquadPrivacySettings() {
    if (!currentSquad) return;

    try {
        const { data: squad } = await supabase
            .from('squads')
            .select('privacy_avatar, privacy_bio, privacy_stats, privacy_members, privacy_progress')
            .eq('id', currentSquad.id)
            .single();

        if (squad) {
            // Update currentSquad object locally
            Object.assign(currentSquad, squad);

            // Wait for modal DOM to be ready
            setTimeout(() => {
                const avatarEl = document.getElementById('squadPrivacyAvatar');
                const bioEl = document.getElementById('squadPrivacyBio');
                const statsEl = document.getElementById('squadPrivacyStats');
                const membersEl = document.getElementById('squadPrivacyMembers');
                const progressEl = document.getElementById('squadPrivacyProgress');

                if (avatarEl) avatarEl.value = squad.privacy_avatar || 'public';
                if (bioEl) bioEl.value = squad.privacy_bio || 'public';
                if (statsEl) statsEl.value = squad.privacy_stats || 'public';
                if (membersEl) membersEl.value = squad.privacy_members || 'public';
                if (progressEl) progressEl.value = squad.privacy_progress || 'public';
            }, 50);
        }
    } catch (err) {
        console.error('Error loading squad privacy:', err);
    }
}

window.saveSquadPrivacySettings = async function () {
    if (!currentSquad) return;

    const updates = {
        privacy_avatar: document.getElementById('squadPrivacyAvatar').value,
        privacy_bio: document.getElementById('squadPrivacyBio').value,
        privacy_stats: document.getElementById('squadPrivacyStats').value,
        privacy_members: document.getElementById('squadPrivacyMembers').value,
        privacy_progress: document.getElementById('squadPrivacyProgress').value
    };

    try {
        const { error } = await supabase
            .from('squads')
            .update(updates)
            .eq('id', currentSquad.id);

        if (error) throw error;

        // Update local state
        Object.assign(currentSquad, updates);

        window.closeSquadPrivacyModal();

        Swal.fire({
            icon: 'success',
            title: 'تم الحفظ',
            text: 'تم تحديث إعدادات الخصوصية بنجاح',
            timer: 2000,
            showConfirmButton: false,
            confirmButtonColor: '#10b981'
        });
    } catch (err) {
        console.error('Error saving squad privacy:', err);
        Swal.fire('خطأ', 'حدث خطأ أثناء حفظ الإعدادات', 'error');
    }
};

window.showSquadGuide = () => {
    Swal.fire({
        title: '<span style="color: var(--primary-color);">مرشد الشلة 👨‍🏫</span>',
        html: `
            <div style="text-align: right; direction: rtl; line-height: 1.6; font-size: 0.95rem;">
                <div style="background: #f0f9ff; padding: 12px; border-radius: 12px; margin-bottom: 15px; border-right: 4px solid var(--primary-color);">
                    <strong>ليه تكون في شلة؟</strong><br>
                    المذاكرة مع الصحاب بتشجعك وتخليك تلتزم أكتر. ضيف صحابك ب الكود وذاكرو مع بعض وشوفوا مين بيذاكر ومين مكسل! 😉
                </div>
                
                <ul style="list-style: none; padding: 0;">
                    <li style="margin-bottom: 12px; display: flex; align-items: flex-start; gap: 10px;">
                        <i class="fas fa-tasks" style="color: #03A9F4; margin-top: 5px;"></i>
                        <span><strong>أهداف مشتركة:</strong> لما أي حد يخلص مهمة في الـ To-Do List بتظهر لكل الشلة على طول. وده بيحمس الكل يخلص اللي وراه.</span>
                    </li>
                    <li style="margin-bottom: 12px; display: flex; align-items: flex-start; gap: 10px;">
                        <i class="fas fa-stopwatch" style="color: #f59e0b; margin-top: 5px;"></i>
                        <span><strong>تايمر موحد:</strong> شغلوا التايمر مع بعض عشان تذاكروا في نفس الوقت (واحد بس يشغل التايمر هيظهر للكل و نفس النظام في ال todo list).</span>
                    </li>
                    <li style="margin-bottom: 12px; display: flex; align-items: flex-start; gap: 10px;">
                        <i class="fas fa-graduation-cap" style="color: #10b981; margin-top: 5px;"></i>
                        <span><strong>امتحانات الشلة:</strong> تقدروا تحلوا امتحانات مع بعض عشان تزودوا نقاط الشلة. رصيد الشلة بيتحسب كدة: (متوسط درجاتكم × 2) بس لازم تحققو الشرط اللي بيظهر اللي هو 75% من الشلة تحل الامتحان</span>
                    </li>
                    <li style="margin-bottom: 12px; display: flex; align-items: flex-start; gap: 10px;">
                        <i class="fas fa-gift" style="color: #ef4444; margin-top: 5px;"></i>
                        <span><strong>نقاط بونص ليك:</strong> 
                            <br>• بتاخد <strong>3 نقط</strong> بونص لو حققتو الشرط و 75% من الشلة حلوا الامتحان.
                            <br>• بتاخد <strong>8 نقط</strong> بونص لو كلكو (100%) حليتوا الامتحان.
                        </span>
                    </li>
                    <li style="margin-bottom: 12px; display: flex; align-items: flex-start; gap: 10px;">
                        <i class="fas fa-comments" style="color: #8b5cf6; margin-top: 5px;"></i>
                        <span><strong>شات الشلة:</strong> هنا هيظهر تفاصيل كل امتحان هتحلوه مع بعض و الزرار اللي بيدخلكو الامتحان و كل ما واحد يحل بيتبعت رساله فاضل كام واحد عشان الشرط يتحقق و في الاخر يقولك حققتو الشرط ولا لا و بتاخدو النقط.</span>
                    </li>
                    <li style="margin-bottom: 12px; display: flex; align-items: flex-start; gap: 10px;">
                        <i class="fas fa-user-clock" style="color: #10b981; margin-top: 5px;"></i>
                        <span><strong>صحابك أونلاين:</strong> لو صاحبك خرج من صفحة الشلة هيظهر لك على طول انه بقى اوفلاين و مش بيذاكر😂</span>
                    </li>
                </ul>
            </div>
        `,
        confirmButtonText: 'فهمت، يلا بينا! 🚀',
        confirmButtonColor: '#03A9F4',
        width: '500px',
        padding: '1rem'
    });
};
