# ✅ إصلاح Bulk Add Error (renderExamQuestions)

## المشكلة
ظهور خطأ `ReferenceError: renderExamQuestions is not defined` عند استخدام "Bulk Add" لإضافة مجموعة أسئلة، رغم أن الأسئلة تضاف بنجاح.

## السبب
دالة `openBulkAddModal` موجودة في `admin.js`، وعند نجاح العملية تحاول استدعاء `renderExamQuestions` لتحديث الصفحة. لكن `renderExamQuestions` تم نقلها لملف `admin-questions.js` ولم تكن مستوردة في `admin.js`.

## الحل
✅ تم استيراد `renderExamQuestions` في ملف `admin.js`.

```javascript
import { renderExamQuestions } from "./admin/admin-questions.js";
```

✅ تم تحديث Service Worker إلى `v38` لضمان تحديث الكاش.

## النتيجة
الآن عند إضافة أسئلة بالجملة (Bulk Add)، ستختفي رسالة الخطأ وسيتم تحديث قائمة الأسئلة تلقائياً.

---

**ملاحظة:** يرجى عمل Hard Refresh للصفحة للتأكد من تحميل الملفات الجديدة.
