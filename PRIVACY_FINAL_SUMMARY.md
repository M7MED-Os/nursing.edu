# Privacy Settings - Complete Implementation Summary

## 📊 الوضع الحالي

### ✅ تم إنجازه:
1. **قاعدة البيانات**: 
   - ملف SQL جاهز (`08_add_privacy_settings.sql`)
   - يضيف 5 أعمدة للبروفايل: avatar, bio, stats, progress, **squad**
   - **مطلوب**: تنفيذ SQL في Supabase

2. **ملف المساعدة**: 
   - `assets/js/privacy.js` - دوال جاهزة

3. **Modal احترافي**:
   - `components/privacy-modal.html` - تصميم مميز جاهز

4. **التطبيق الجزئي**:
   - `profile.js`: دوال load/save جاهزة (تحتاج تحديث لـ privacy_squad)
   - `student-profile.html`: منطق الخصوصية مطبق جزئياً

---

## 🔧 ما يحتاج تنفيذ

### المشكلة الحالية:
- الكارد القديم في `profile.html` (سطور 262-335) يحتاج استبدال بزرار + modal
- الملف كبير والتعديل صعب بالأدوات الحالية

### الحلول المقترحة:

#### **الحل 1: التعديل اليدوي (الأسرع)**
1. افتح `profile.html`
2. احذف السطور 262-335 (الكارد القديم)
3. استبدلها بالكود ده:

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

4. قبل `</body>` مباشرة، أضف:

```html
<!-- Privacy Modal Container -->
<div id="privacyModalContainer"></div>
<script>
    fetch('components/privacy-modal.html')
        .then(r => r.text())
        .then(html => document.getElementById('privacyModalContainer').innerHTML = html);
</script>
```

#### **الحل 2: إنشاء ملف جديد**
أعمل `profile-v2.html` بالتصميم الجديد وننقل المستخدمين تدريجياً.

---

## 📝 التحديثات المطلوبة في `profile.js`

### 1. تحديث `loadPrivacySettings()`:

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
            // Wait for modal to load
            setTimeout(() => {
                const avatarEl = document.getElementById('privacyAvatar');
                const bioEl = document.getElementById('privacyBio');
                const statsEl = document.getElementById('privacyStats');
                const progressEl = document.getElementById('privacyProgress');
                const squadEl = document.getElementById('privacySquad');

                if (avatarEl) avatarEl.value = profile.privacy_avatar || 'public';
                if (bioEl) bioEl.value = profile.privacy_bio || 'public';
                if (statsEl) statsEl.value = profile.privacy_stats || 'public';
                if (progressEl) progressEl.value = profile.privacy_progress || 'public';
                if (squadEl) squadEl.value = profile.privacy_squad || 'public';
            }, 500);
        }
    } catch (err) {
        console.error('Error loading privacy settings:', err);
    }
}
```

### 2. تحديث `savePrivacySettings()`:

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

### 3. إضافة دوال Modal:

```javascript
window.openPrivacyModal = function() {
    const modal = document.getElementById('privacyModal');
    if (modal) {
        modal.style.display = 'block';
        document.body.style.overflow = 'hidden';
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

// Close on outside click
window.addEventListener('click', function(e) {
    const modal = document.getElementById('privacyModal');
    if (e.target === modal) {
        closePrivacyModal();
    }
});
```

---

## 🎯 تطبيق الخصوصية في الصفحات الأخرى

### في `student-profile.html`:

#### 1. تحديث جلب البيانات:
```javascript
const { data: student, error } = await supabase
    .from('profiles')
    .select('*, privacy_avatar, privacy_bio, privacy_stats, privacy_progress, privacy_squad')
    .eq('id', studentId)
    .single();
```

#### 2. تحديث privacyContext:
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

#### 3. تحديث `renderSquad()`:
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

### في `leaderboard.html`:

```javascript
// عند عرض كل طالب في الجدول
students.forEach(student => {
    const showAvatar = isVisible(student.privacy_avatar, false, false); // الكل يشوف الأوائل
    const avatarHTML = showAvatar 
        ? `<img src="${student.avatar_url}" ...>` 
        : `<div class="locked-avatar">🔒</div>`;
    
    // ... باقي الكود
});
```

---

## 🚀 خطة التنفيذ المقترحة

### المرحلة 1 (الأساسية):
1. ✅ تنفيذ SQL في Supabase
2. ⏳ تعديل `profile.html` (زرار + modal)
3. ⏳ تحديث `profile.js` (الدوال الثلاثة)
4. ⏳ تحديث `student-profile.html` (privacy_squad)

### المرحلة 2 (التوسع):
5. تطبيق الخصوصية في `leaderboard.html`
6. تطبيق الخصوصية في `squad.html`
7. اختبار شامل
8. تحديث الكاش

---

## 💡 ملاحظات مهمة

1. **الأولوية**: البروفايل الشخصي أولاً، ثم باقي الصفحات
2. **التصميم**: المودال الجديد احترافي ومميز كما طلبت
3. **الخيار الجديد**: "الشلة الحالية" متضمن
4. **التوافقية**: كل الكود متوافق مع الموجود

---

## ❓ السؤال

**هل تريد:**
1. أن تعدل `profile.html` يدوياً (أسرع)؟
2. أن أحاول التعديل مرة أخرى بطريقة مختلفة؟
3. أن أعمل ملف `profile-v2.html` جديد؟

**أخبرني بالخيار المناسب!** 🎯
