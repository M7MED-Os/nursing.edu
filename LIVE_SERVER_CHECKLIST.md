# ملفات لازم تترفع على Live Server

## ملفات جديدة (مهمة جداً):
- ✅ assets/js/admin/admin-core.js
- ✅ assets/js/admin/admin-questions.js
- ✅ assets/js/admin/admin-subjects.js
- ✅ assets/js/admin/admin-content.js
- ✅ assets/js/constants/timings.js

## ملفات معدّلة:
- ✅ admin.js (تم تعديله بالكامل)
- ✅ admin.html (type="module" لـ main.js)
- ✅ sw.js (v34)
- ✅ جميع HTML files (18 ملف - type="module")

## طريقة التأكد:
1. افتح: https://your-domain.com/assets/js/admin/admin-core.js
2. لو طلع 404 → الملف مش مرفوع ❌
3. لو ظهر الكود → تمام ✅

## بعد الرفع:
1. امسح Service Worker من live site:
   - افتح DevTools > Application > Service Workers
   - اضغط "Unregister"
   
2. امسح Cache Storage:
   - Application > Cache Storage
   - احذف "nursing-edu-v**"

3. Hard Refresh:
   - Ctrl+Shift+R (Windows)
   - Cmd+Shift+R (Mac)
