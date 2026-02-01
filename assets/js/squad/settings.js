// Squad Settings & Management Module (Placeholder)
import { supabase } from '../supabaseClient.js';
import { currentSquad, currentProfile, setCurrentSquad } from './state.js';

/**
 * Edit squad info (Name & Bio combined)
 */
export async function editSquadName() {
    const result = await Swal.fire({
        title: 'إعدادات الشلة ⚙️',
        html: `
            <div style="text-align: right; direction: rtl;">
                <div style="margin-bottom: 1.25rem;">
                    <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: #475569; font-size: 0.9rem;">اسم الشلة</label>
                    <input id="swal-squad-name" class="swal2-input" value="${currentSquad.name}" placeholder="اسم الشلة..." style="width: 100%; margin: 0; height: 45px; font-size: 1rem; border-radius: 10px;">
                </div>
                <div>
                    <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: #475569; font-size: 0.9rem;">وصف الشلة (Bio)</label>
                    <textarea id="swal-squad-bio" class="swal2-textarea" placeholder="صلي على النبي..." rows="3" style="width: 100%; margin: 0; resize: none; height: 100px; font-size: 0.95rem; border-radius: 12px; padding: 10px;">${currentSquad.bio || ''}</textarea>
                </div>
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'حفظ التعديلات',
        cancelButtonText: 'تراجع',
        confirmButtonColor: '#10b981',
        cancelButtonColor: '#64748b',
        preConfirm: () => {
            const name = document.getElementById('swal-squad-name').value;
            const bio = document.getElementById('swal-squad-bio').value;

            if (!name || !name.trim()) {
                Swal.showValidationMessage('لازم تكتب اسم للشلة!');
                return false;
            }
            if (name.trim().length < 3) {
                Swal.showValidationMessage('الاسم لازم يكون 3 حروف على الأقل');
                return false;
            }
            if (name.trim().length > 50) {
                Swal.showValidationMessage('الاسم طويل أوي! (أقصى حد 50 حرف)');
                return false;
            }

            return { name: name.trim(), bio: bio.trim() };
        }
    });

    if (result.isConfirmed && result.value) {
        const { name: newName, bio: newBio } = result.value;

        // Check if anything changed
        if (newName === currentSquad.name && newBio === (currentSquad.bio || '')) {
            return;
        }

        try {
            Swal.fire({
                title: 'جاري الحفظ...',
                allowOutsideClick: false,
                didOpen: () => Swal.showLoading()
            });

            const { error } = await supabase
                .from('squads')
                .update({
                    name: newName,
                    bio: newBio || null
                })
                .eq('id', currentSquad.id);

            if (error) throw error;

            // Update local state
            currentSquad.name = newName;
            currentSquad.bio = newBio;
            setCurrentSquad(currentSquad);

            // Update UI
            document.getElementById('squadNameText').textContent = newName;

            // Update bio display in main UI
            const bioDisplay = document.querySelector('#squadBioDisplay .bio-text');
            if (bioDisplay) {
                if (newBio) {
                    bioDisplay.textContent = newBio;
                    bioDisplay.classList.remove('empty');
                    bioDisplay.style.fontStyle = 'italic';
                    bioDisplay.style.opacity = '1';
                } else {
                    bioDisplay.textContent = 'مفيش بايو';
                    bioDisplay.classList.add('empty');
                    bioDisplay.style.fontStyle = 'normal';
                    bioDisplay.style.opacity = '0.7';
                }
            }

            Swal.fire({
                icon: 'success',
                title: 'تم الحفظ!',
                text: 'إعدادات الشلة اتحدثت بنجاح 🎉',
                timer: 1500,
                showConfirmButton: false
            });

        } catch (err) {
            console.error('Error updating squad settings:', err);
            Swal.fire('خطأ', 'حصلت مشكلة وأحنا بنحفظ البيانات.. حاول تاني', 'error');
        }
    }
}

/**
 * Legacy wrapper for bio edit button if kept
 */
export async function editSquadBio() {
    await editSquadName();
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

    if (code && code.trim()) {
        const searchCode = code.trim().toLowerCase();

        // Use RPC to search by prefix (Fixes UUID casting error)
        const { data: squads, error } = await supabase.rpc('get_squad_by_prefix', { p_prefix: searchCode });

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
                const levelEl = document.getElementById('squadPrivacyLevel');
                const membersEl = document.getElementById('squadPrivacyMembers');

                if (avatarEl) avatarEl.value = squad.privacy_avatar || 'public';
                if (bioEl) bioEl.value = squad.privacy_bio || 'public';
                if (levelEl) levelEl.value = squad.privacy_stats || 'public';
                if (membersEl) membersEl.value = squad.privacy_members || 'public';
            }, 50);
        }
    } catch (err) {
        console.error('Error loading squad privacy:', err);
    }
}

window.saveSquadPrivacySettings = async function () {
    if (!currentSquad) return;

    const levelValue = document.getElementById('squadPrivacyLevel').value;
    const updates = {
        privacy_avatar: document.getElementById('squadPrivacyAvatar').value,
        privacy_bio: document.getElementById('squadPrivacyBio').value,
        privacy_stats: levelValue,
        privacy_progress: levelValue,
        privacy_members: document.getElementById('squadPrivacyMembers').value
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
        title: '<span style="font-weight: 800; color: #1e293b; font-size: 1.25rem;">مرشد الشلة 👨‍🏫</span>',
        html: `
            <div style="text-align: right; direction: rtl; font-family: 'Cairo', sans-serif;">
                <div style="background: #f0f9ff; padding: 12px; border-radius: 10px; margin-bottom: 15px; border-right: 4px solid #03A9F4; font-size: 1rem; line-height: 1.5;">
                    <strong>توضيح:</strong><br>
                 ابعت الكود اللي في الاخر لصحابك و هما هيخشو يبحثو بيه و يخشو الشلة معاك.
                </div>
                
                <p style="font-weight: 700; color: #334155; font-size: 1.1rem; margin-bottom: 10px;">إيه اللي تقدرو تعملوه مع بعض؟</p>
                
                <div style="display: flex; flex-direction: column; gap: 10px; max-height: 400px; overflow-y: auto; padding-left: 6px; scrollbar-width: thin;">
                    <div style="display: flex; align-items: flex-start; gap: 12px; padding: 10px; background: #fffbeb; border-radius: 10px; border: 1px solid #fef3c7;">
                        <i class="fas fa-stopwatch" style="color: #f59e0b; margin-top: 4px; font-size: 1rem;"></i>
                        <span style="font-size: 0.95rem; line-height: 1.5;">لو حد فيكو ظبط تايمر هيظهر للكل و تبدئو تذاكرو مع بعض.</span>
                    </div>

                    <div style="display: flex; align-items: flex-start; gap: 12px; padding: 10px; background: #f0fdf4; border-radius: 10px; border: 1px solid #dcfce7;">
                        <i class="fas fa-tasks" style="color: #16a34a; margin-top: 4px; font-size: 1rem;"></i>
                        <span style="font-size: 0.95rem; line-height: 1.5;">الـ To-Do List لو حد عمل حاجة فيها بتظهر للكل ولو حد خلص وعلم إنه خلص هيظهر اسمه تحتها لباقي الشلة.</span>
                    </div>

                    <div style="display: flex; align-items: flex-start; gap: 12px; padding: 10px; background: #eff6ff; border-radius: 10px; border: 1px solid #dbeafe;">
                        <i class="fas fa-graduation-cap" style="color: #2563eb; margin-top: 4px; font-size: 1rem;"></i>
                        <div style="font-size: 0.95rem; line-height: 1.5;">
                            <strong>امتحان جماعي:</strong> بتبدئوه عادي زي أي امتحان وتبدئو تحلو.<br>
                            - ده لما تحلو مع بعض النقط بتاعت الشلة بتزيد وبنحسب متوسط الدرجات ونضربها في 2.<br>
                            - بيبقى في كام حاجة كده أول حاجة وقت دخول الامتحان ده لازم تخش قبل ما الوقت ده يخلص.<br>
                            - كمان في شرط مثلاً إن 50% على الأقل من الشلة تحل الامتحان يعني لو الشلة فيها مثلاً 6 لازم على الأقل 3 يحلو عشان نقط الشلة تزيد.
                        </div>
                    </div>

                    <div style="display: flex; align-items: flex-start; gap: 12px; padding: 10px; background: #f5f3ff; border-radius: 10px; border: 1px solid #ede9fe;">
                        <i class="fas fa-comments" style="color: #7c3aed; margin-top: 4px; font-size: 1rem;"></i>
                        <span style="font-size: 0.95rem; line-height: 1.5;">في شات ممكن تتكلمو فيه مع بعض وكمان تشوف مين من صحابك أونلاين وبيتبعت فيه شوية رسايل تلقائية.</span>
                    </div>
                </div>
            </div>
        `,
        confirmButtonText: 'يلا بينا! 🚀',
        confirmButtonColor: '#03A9F4',
        width: '450px',
        padding: '1.5rem',
        borderRadius: '24px'
    });
};
