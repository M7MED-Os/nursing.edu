# Privacy Settings Implementation Guide

## نظرة عامة
دليل كامل لتنفيذ نظام إعدادات الخصوصية للبروفايلات والشلل.

---

## ✅ ما تم إنجازه

### 1. قاعدة البيانات (Database)
**الملف**: `supabase-sql/08_add_privacy_settings.sql`

تم إنشاء ملف SQL يضيف الأعمدة التالية:

#### للبروفايلات (profiles):
- `privacy_avatar`: (public, squad, private)
- `privacy_bio`: (public, squad, private)
- `privacy_stats`: (public, squad, private)
- `privacy_progress`: (public, squad, private)

#### للشلل (squads):
- `privacy_avatar`: (public, members, private)
- `privacy_bio`: (public, members, private)
- `privacy_stats`: (public, members, private)
- `privacy_members`: (public, members, private)

**خطوة مطلوبة**: تنفيذ هذا الـ SQL في Supabase Dashboard.

### 2. دوال المساعدة (Helper Functions)
**الملف**: `assets/js/privacy.js`

تم إنشاء ملف يحتوي على:
- `isInSameSquad()`: فحص إذا كان مستخدمين في نفس الشلة
- `isSquadMember()`: فحص إذا كان مستخدم عضو في شلة معينة
- `isVisible()`: فحص رؤية عنصر بناءً على إعدادات الخصوصية
- `createLockedElement()`: إنشاء HTML لعنصر مخفي
- `createLockedAvatar()`: إنشاء أفاتار مخفي
- `PRIVACY_OPTIONS`: خيارات الخصوصية للواجهة

---

## 🔨 ما يجب تنفيذه

### المرحلة 1: واجهة إعدادات الخصوصية في البروفايل

#### 1.1 إضافة قسم الخصوصية في `profile.html`
**الموقع**: قبل "Subscription Card" (حوالي سطر 262)

```html
<!-- Privacy Settings Card -->
<div class="profile-card" style="margin-bottom: 2rem;">
    <div style="position: relative; z-index: 1;">
        <!-- Header -->
        <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1.5rem;">
            <div style="
                width: 48px;
                height: 48px;
                border-radius: 12px;
                background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%);
                display: flex;
                align-items: center;
                justify-content: center;
                box-shadow: 0 4px 12px rgba(139, 92, 246, 0.4);
            ">
                <i class="fas fa-shield-alt" style="font-size: 1.5rem; color: white;"></i>
            </div>
            <h3 style="margin: 0; font-size: 1.25rem; font-weight: 700;">إعدادات الخصوصية</h3>
        </div>

        <!-- Privacy Options -->
        <div style="display: grid; gap: 1rem;">
            <!-- Avatar Privacy -->
            <div class="privacy-setting">
                <label style="display: block; font-weight: 600; margin-bottom: 0.5rem;">
                    <i class="fas fa-user-circle" style="color: #8b5cf6;"></i>
                    الصورة الشخصية
                </label>
                <select id="privacyAvatar" class="form-control">
                    <option value="public">الكل</option>
                    <option value="squad">الشلة فقط</option>
                    <option value="private">أنا فقط</option>
                </select>
            </div>

            <!-- Bio Privacy -->
            <div class="privacy-setting">
                <label style="display: block; font-weight: 600; margin-bottom: 0.5rem;">
                    <i class="fas fa-comment-dots" style="color: #8b5cf6;"></i>
                    النبذة
                </label>
                <select id="privacyBio" class="form-control">
                    <option value="public">الكل</option>
                    <option value="squad">الشلة فقط</option>
                    <option value="private">أنا فقط</option>
                </select>
            </div>

            <!-- Stats Privacy -->
            <div class="privacy-setting">
                <label style="display: block; font-weight: 600; margin-bottom: 0.5rem;">
                    <i class="fas fa-chart-bar" style="color: #8b5cf6;"></i>
                    الإحصائيات
                </label>
                <select id="privacyStats" class="form-control">
                    <option value="public">الكل</option>
                    <option value="squad">الشلة فقط</option>
                    <option value="private">أنا فقط</option>
                </select>
            </div>

            <!-- Progress Privacy -->
            <div class="privacy-setting">
                <label style="display: block; font-weight: 600; margin-bottom: 0.5rem;">
                    <i class="fas fa-chart-line" style="color: #8b5cf6;"></i>
                    التقدم
                </label>
                <select id="privacyProgress" class="form-control">
                    <option value="public">الكل</option>
                    <option value="squad">الشلة فقط</option>
                    <option value="private">أنا فقط</option>
                </select>
            </div>
        </div>

        <!-- Save Button -->
        <button id="savePrivacyBtn" onclick="savePrivacySettings()" style="
            width: 100%;
            margin-top: 1.5rem;
            padding: 0.75rem;
            background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%);
            color: white;
            border: none;
            border-radius: 8px;
            font-weight: 700;
            cursor: pointer;
        ">
            <i class="fas fa-save"></i>
            حفظ إعدادات الخصوصية
        </button>
    </div>
</div>
```

#### 1.2 إضافة دوال JavaScript في `profile.js`

```javascript
// في أول الملف، أضف import
import { isVisible, createLockedElement, createLockedAvatar } from './privacy.js';

// دالة تحميل إعدادات الخصوصية
async function loadPrivacySettings() {
    const { data: profile } = await supabase
        .from('profiles')
        .select('privacy_avatar, privacy_bio, privacy_stats, privacy_progress')
        .eq('id', currentUser.id)
        .single();

    if (profile) {
        document.getElementById('privacyAvatar').value = profile.privacy_avatar || 'public';
        document.getElementById('privacyBio').value = profile.privacy_bio || 'public';
        document.getElementById('privacyStats').value = profile.privacy_stats || 'public';
        document.getElementById('privacyProgress').value = profile.privacy_progress || 'public';
    }
}

// دالة حفظ إعدادات الخصوصية
window.savePrivacySettings = async function() {
    const privacySettings = {
        privacy_avatar: document.getElementById('privacyAvatar').value,
        privacy_bio: document.getElementById('privacyBio').value,
        privacy_stats: document.getElementById('privacyStats').value,
        privacy_progress: document.getElementById('privacyProgress').value
    };

    try {
        const { error } = await supabase
            .from('profiles')
            .update(privacySettings)
            .eq('id', currentUser.id);

        if (error) throw error;

        Swal.fire({
            icon: 'success',
            title: 'تم الحفظ!',
            text: 'تم تحديث إعدادات الخصوصية بنجاح',
            timer: 2000,
            showConfirmButton: false
        });
    } catch (err) {
        console.error('Error saving privacy settings:', err);
        Swal.fire('خطأ', 'حدث خطأ أثناء الحفظ', 'error');
    }
};

// استدعاء loadPrivacySettings() في دالة init
```

---

### المرحلة 2: تطبيق الخصوصية في صفحة المعاينة

#### 2.1 تحديث `student-profile.html`

```javascript
// في أول الملف
import { isInSameSquad, isVisible, createLockedElement, createLockedAvatar } from './assets/js/privacy.js';

// في دالة loadStudentProfile
async function loadStudentProfile() {
    const urlParams = new URLSearchParams(window.location.search);
    const studentId = urlParams.get('id');
    
    // جلب بيانات الطالب مع إعدادات الخصوصية
    const { data: student } = await supabase
        .from('profiles')
        .select('*, privacy_avatar, privacy_bio, privacy_stats, privacy_progress')
        .eq('id', studentId)
        .single();

    // جلب المستخدم الحالي
    const { data: { user } } = await supabase.auth.getUser();
    
    // فحص العلاقة
    const isOwner = user && user.id === studentId;
    const isSameSquad = user ? await isInSameSquad(studentId, user.id) : false;

    // عرض الأفاتار
    const avatarContainer = document.querySelector('.profile-avatar-container');
    if (isVisible(student.privacy_avatar, isOwner, isSameSquad)) {
        // عرض الأفاتار العادي
        avatarContainer.innerHTML = `<img src="${avatarUrl}" ...>`;
    } else {
        // عرض أفاتار مخفي
        avatarContainer.innerHTML = createLockedAvatar();
    }

    // عرض البايو
    const bioContainer = document.querySelector('.profile-bio-container');
    if (isVisible(student.privacy_bio, isOwner, isSameSquad)) {
        bioContainer.innerHTML = `<div class="bio-text">${student.bio || 'مفيش بايو'}</div>`;
    } else {
        bioContainer.innerHTML = createLockedElement('bio');
    }

    // عرض الإحصائيات
    const statsContainer = document.getElementById('profileStats');
    if (isVisible(student.privacy_stats, isOwner, isSameSquad)) {
        // عرض الإحصائيات العادية
        renderStats(student);
    } else {
        statsContainer.innerHTML = createLockedElement('stats');
    }

    // عرض التقدم
    const progressContainer = document.getElementById('profileLevelProgress');
    if (isVisible(student.privacy_progress, isOwner, isSameSquad)) {
        renderLevelProgress(student.points);
    } else {
        progressContainer.innerHTML = createLockedElement('progress');
    }
}
```

---

### المرحلة 3: إعدادات الخصوصية للشلة

#### 3.1 إضافة واجهة في `squad.html`
نفس الفكرة لكن في صفحة الشلة، نضيف قسم إعدادات الخصوصية (للمالك فقط).

#### 3.2 تحديث `squad.js`
إضافة دوال حفظ وتحميل إعدادات الخصوصية للشلة.

#### 3.3 تطبيق الخصوصية في `squad-profile.html`
نفس منطق `student-profile.html` لكن بفحص `isSquadMember` بدل `isInSameSquad`.

---

## 📊 ملخص الخطوات المطلوبة

### خطوات فورية:
1. ✅ تنفيذ SQL في Supabase
2. ⏳ إضافة واجهة الخصوصية في `profile.html`
3. ⏳ إضافة دوال JS في `profile.js`
4. ⏳ تطبيق منطق الخصوصية في `student-profile.html`

### خطوات لاحقة:
5. إضافة إعدادات الخصوصية للشلة
6. تطبيق منطق الخصوصية في `squad-profile.html`
7. اختبار شامل
8. تحديث الكاش

---

## 🎯 الخطوة التالية

**هل تريد:**
1. أن أنفذ كل شيء دفعة واحدة (قد يستغرق وقتاً)؟
2. أن ننفذ على مراحل (البروفايل الشخصي أولاً)؟
3. أن تنفذ SQL أولاً وتخبرني عند الانتهاء؟

**اختر الطريقة المناسبة لك!**
