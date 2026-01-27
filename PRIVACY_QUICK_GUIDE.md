# Privacy Settings - Quick Implementation Guide

## ✅ تم إنجازه:

1. **SQL Update**: أضفنا عمود `privacy_squad` - **نفذ الـ SQL في Supabase**
2. **Premium Modal**: تم إنشاء `components/privacy-modal.html`

## 📝 خطوات التنفيذ السريعة:

### 1. في `profile.html`:

**أ) احذف الكارد القديم** (السطور 262-329) واستبدله بزرار بسيط:

```html
<!-- Privacy Settings Button -->
<div style="margin-bottom: 2rem; text-align: center;">
    <button onclick="openPrivacyModal()" style="
        background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%);
        color: white;
        border: none;
        padding: 0.875rem 2rem;
        border-radius: 12px;
        font-weight: 700;
        font-size: 0.95rem;
        cursor: pointer;
        transition: all 0.3s ease;
        box-shadow: 0 4px 12px rgba(139, 92, 246, 0.3);
        display: inline-flex;
        align-items: center;
        gap: 0.75rem;
    " onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 6px 20px rgba(139, 92, 246, 0.5)'"
       onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 12px rgba(139, 92, 246, 0.3)'">
        <i class="fas fa-shield-alt" style="font-size: 1.1rem;"></i>
        <span>إعدادات الخصوصية</span>
        <i class="fas fa-cog" style="font-size: 0.9rem; opacity: 0.8;"></i>
    </button>
</div>
```

**ب) قبل `</body>`، أضف:**

```html
<!-- Include Privacy Modal -->
<div id="privacyModalContainer"></div>
<script>
    // Load privacy modal
    fetch('components/privacy-modal.html')
        .then(r => r.text())
        .then(html => {
            document.getElementById('privacyModalContainer').innerHTML = html;
        });
</script>
```

### 2. في `profile.js`:

**أ) حدّث `loadPrivacySettings()`:**

```javascript
async function loadPrivacySettings() {
    if (!currentProfile) return;

    try {
        const { data: profile } = await supabase
            .from('profiles')
            .select('privacy_avatar, privacy_bio, privacy_stats, privacy_progress, privacy_squad')
            .eq('id', currentProfile.id)
            .single();

        if (profile) {
            document.getElementById('privacyAvatar').value = profile.privacy_avatar || 'public';
            document.getElementById('privacyBio').value = profile.privacy_bio || 'public';
            document.getElementById('privacyStats').value = profile.privacy_stats || 'public';
            document.getElementById('privacyProgress').value = profile.privacy_progress || 'public';
            document.getElementById('privacySquad').value = profile.privacy_squad || 'public';
        }
    } catch (err) {
        console.error('Error loading privacy settings:', err);
    }
}
```

**ب) حدّث `savePrivacySettings()`:**

```javascript
window.savePrivacySettings = async function() {
    if (!currentProfile) return;

    const privacySettings = {
        privacy_avatar: document.getElementById('privacyAvatar').value,
        privacy_bio: document.getElementById('privacyBio').value,
        privacy_stats: document.getElementById('privacyStats').value,
        privacy_progress: document.getElementById('privacyProgress').value,
        privacy_squad: document.getElementById('privacySquad').value
    };

    try {
        const { error } = await supabase
            .from('profiles')
            .update(privacySettings)
            .eq('id', currentProfile.id);

        if (error) throw error;

        closePrivacyModal();
        showToast('تم حفظ إعدادات الخصوصية بنجاح', 'success');
    } catch (err) {
        console.error('Error saving privacy settings:', err);
        showToast('حدث خطأ أثناء الحفظ', 'error');
    }
};
```

**ج) أضف دوال فتح/إغلاق المودال:**

```javascript
window.openPrivacyModal = function() {
    const modal = document.getElementById('privacyModal');
    if (modal) {
        modal.style.display = 'block';
        document.body.style.overflow = 'hidden';
        // Load current settings
        loadPrivacySettings();
    }
};

window.closePrivacyModal = function() {
    const modal = document.getElementById('privacyModal');
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = 'auto';
    }
};
```

### 3. في `student-profile.html`:

**حدّث `loadStudentProfile()` لجلب `privacy_squad`:**

```javascript
const { data: student, error } = await supabase
    .from('profiles')
    .select('*, privacy_avatar, privacy_bio, privacy_stats, privacy_progress, privacy_squad')
    .eq('id', studentId)
    .single();
```

**حدّث `privacyContext`:**

```javascript
window.privacyContext = {
    isOwner,
    isSameSquad,
    privacySettings: {
        avatar: student.privacy_avatar || 'public',
        bio: student.privacy_bio || 'public',
        stats: student.privacy_stats || 'public',
        progress: student.privacy_progress || 'public',
        squad: student.privacy_squad || 'public'
    }
};
```

**في `renderSquad()`، أضف فحص الخصوصية:**

```javascript
async function renderSquad(userId) {
    const ctx = window.privacyContext;
    const showSquad = ctx && isVisible(ctx.privacySettings.squad, ctx.isOwner, ctx.isSameSquad);

    const squadEl = document.getElementById('profileSquad');
    if (!squadEl) return;

    if (!showSquad) {
        squadEl.innerHTML = createLockedElement('squad');
        return;
    }

    // ... باقي الكود العادي
}
```

### 4. تطبيق الخصوصية في صفحات أخرى:

**في `leaderboard.html` و `squad.html`:**
- استخدم نفس منطق `isVisible()` قبل عرض أي معلومات
- اجلب `privacy_*` مع البيانات
- اعرض `createLockedElement()` لو المحتوى مخفي

---

## 🎯 الخطوة التالية:

هل تريد أن:
1. أنفذ التعديلات دي يدوياً في الملفات؟
2. تنفذ أنت SQL الجديد وأكمل أنا الباقي؟

**أخبرني عشان أكمل!** 🚀
