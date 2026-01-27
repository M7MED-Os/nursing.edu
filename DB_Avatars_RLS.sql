-- ============================================
-- RLS Policies للـ Views الجديدة
-- ============================================

-- 1. تفعيل RLS على الـ Views
ALTER VIEW profiles_with_levels SET (security_invoker = true);
ALTER VIEW squads_with_levels SET (security_invoker = true);

-- ملحوظة: الـ Views بترث الـ RLS من الجداول الأصلية (profiles & squads)
-- لكن عشان نتأكد، هنضيف Policies للجداول الأصلية لو مش موجودة

-- 2. RLS للـ profiles (قراءة للجميع، تعديل للمستخدم نفسه فقط)
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON profiles;
CREATE POLICY "Profiles are viewable by everyone"
ON profiles FOR SELECT
USING (true);

DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile"
ON profiles FOR UPDATE
USING (auth.uid() = id);

-- 3. RLS للـ squads (قراءة للجميع، تعديل للمالك فقط)
DROP POLICY IF EXISTS "Squads are viewable by everyone" ON squads;
CREATE POLICY "Squads are viewable by everyone"
ON squads FOR SELECT
USING (true);

DROP POLICY IF EXISTS "Squad owners can update" ON squads;
CREATE POLICY "Squad owners can update"
ON squads FOR UPDATE
USING (auth.uid() = owner_id);

-- ============================================
-- تم الانتهاء! 🎉
-- ============================================
