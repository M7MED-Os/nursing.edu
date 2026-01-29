# Squad System Migration Guide

## 🎯 Quick Start

### Step 1: Update HTML Import
في ملف `squad.html`، استبدل:

```html
<!-- القديم -->
<script type="module" src="assets/js/squad.js"></script>
```

بـ:

```html
<!-- الجديد -->
<script type="module" src="assets/js/squad/index.js"></script>
```

### Step 2: Test the Application
1. افتح `squad.html` في المتصفح
2. تأكد من أن جميع الوظائف تعمل:
   - ✅ تحميل الشلة
   - ✅ عرض الأعضاء
   - ✅ التحديات النشطة
   - ✅ الدردشة
   - ✅ المهام
   - ✅ البومودورو

### Step 3: Check Console for Errors
افتح Developer Console (F12) وتأكد من عدم وجود أخطاء.

---

## 📦 What Changed?

### Before (Monolithic)
```
squad.js (2026 lines, 86KB)
└── Everything in one file
```

### After (Modular)
```
squad/
├── index.js (88 lines)
├── state.js (68 lines)
├── utils.js (144 lines)
├── init.js (184 lines)
├── challenge.js (464 lines)
├── members.js (154 lines)
├── tasks.js (106 lines)
├── chat.js (93 lines)
├── pomodoro.js (115 lines)
├── exams.js (71 lines)
├── presence.js (44 lines)
├── settings.js (171 lines)
└── sync.js (50 lines)
```

**Total:** ~1,752 lines across 13 focused modules

---

## 🔧 Troubleshooting

### Issue: "Failed to load module"
**Solution:** تأكد من أن جميع الملفات موجودة في `assets/js/squad/`

### Issue: "currentSquad is not defined"
**Solution:** تأكد من استيراد `state.js` في الملف الذي تستخدمه:
```javascript
import { currentSquad } from './state.js';
```

### Issue: "Function is not defined"
**Solution:** تأكد من أن الدالة معرّفة على `window` للاستخدام في HTML:
```javascript
// في الملف المناسب
window.functionName = async () => {
    // ...
};
```

---

## 🎨 Adding New Features

### Example: Add a new function to members.js

```javascript
// في members.js
export async function promoteToAdmin(userId) {
    const { error } = await supabase
        .from('squads')
        .update({ 
            admins: [...(currentSquad.admins || []), userId] 
        })
        .eq('id', currentSquad.id);
    
    if (!error) {
        currentSquad.admins = [...(currentSquad.admins || []), userId];
        loadMembers();
    }
}

// اجعلها متاحة عالمياً
window.promoteToAdmin = promoteToAdmin;
```

### Example: Use the function in HTML

```html
<button onclick="promoteToAdmin('user-id-here')">
    ترقية لمشرف
</button>
```

---

## 📊 Performance Benefits

### Before
- ❌ تحميل 86KB في كل مرة
- ❌ صعوبة في الصيانة
- ❌ تعارضات محتملة

### After
- ✅ تحميل فقط ما تحتاجه (Tree-shaking)
- ✅ سهولة في الصيانة والتطوير
- ✅ عزل أفضل للأخطاء
- ✅ إمكانية العمل الجماعي

---

## 🚀 Next Steps

1. ✅ اختبر جميع الوظائف
2. ⏳ احذف `squad.js` القديم بعد التأكد من عمل كل شيء
3. ⏳ قم بتحسين الوحدات الأساسية (tasks, chat, pomodoro) إذا لزم الأمر
4. ⏳ أضف اختبارات (tests) للوحدات المهمة

---

## 💡 Tips

- استخدم `import` بدلاً من `require`
- احتفظ بالحالة (state) في `state.js` فقط
- استخدم `export` للدوال التي تحتاجها وحدات أخرى
- استخدم `window.functionName` للدوال المستخدمة في HTML

---

## 📞 Support

إذا واجهت أي مشاكل:
1. تحقق من Console للأخطاء
2. راجع هذا الدليل
3. تحقق من `README.md` في نفس المجلد
