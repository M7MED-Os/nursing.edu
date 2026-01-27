-- ============================================
-- نظام الصور الشخصية والمستويات
-- ============================================
-- الهدف: إضافة صور شخصية للطلاب والشلل + نظام المستويات
-- ============================================

-- 1. إضافة عمود الصورة الشخصية للطلاب
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS avatar_url TEXT DEFAULT NULL;

-- 2. إضافة عمود الصورة للشلل
ALTER TABLE squads 
ADD COLUMN IF NOT EXISTS avatar_url TEXT DEFAULT NULL;

-- 3. إضافة عمود الكود للشلل (للانضمام)
ALTER TABLE squads 
ADD COLUMN IF NOT EXISTS code TEXT UNIQUE;

-- 4. توليد أكواد عشوائية للشلل الموجودة (لو مفيش كود)
UPDATE squads 
SET code = UPPER(SUBSTRING(MD5(RANDOM()::TEXT || id::TEXT) FROM 1 FOR 6))
WHERE code IS NULL;

-- 5. دالة حساب المستوى من النقاط (للطلاب)
CREATE OR REPLACE FUNCTION calculate_user_level(points INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
    -- المعادلة: Level = Floor(SquareRoot(Points / 5))
    RETURN FLOOR(SQRT(GREATEST(points, 0)::NUMERIC / 5));
END;
$$;

-- 4. دالة حساب المستوى للشلة (أبطأ شوية)
CREATE OR REPLACE FUNCTION calculate_squad_level(points INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
    -- المعادلة: Level = Floor(SquareRoot(Points / 10))
    -- الشلة محتاجة نقط أكتر عشان تطلع لفل
    RETURN FLOOR(SQRT(GREATEST(points, 0)::NUMERIC / 10));
END;
$$;

-- 5. View لعرض الطلاب مع المستويات (اختياري - للاستعلامات)
CREATE OR REPLACE VIEW profiles_with_levels AS
SELECT 
    id,
    full_name,
    email,
    points,
    avatar_url,
    calculate_user_level(COALESCE(points, 0)) as level,
    role,
    academic_year,
    current_term,
    department
FROM profiles;

-- 6. View لعرض الشلل مع المستويات
CREATE OR REPLACE VIEW squads_with_levels AS
SELECT 
    id,
    name,
    code,
    points,
    avatar_url,
    calculate_squad_level(COALESCE(points, 0)) as level,
    owner_id,
    created_at
FROM squads;

-- ============================================
-- تم الانتهاء! 🎉
-- ============================================
-- الآن:
-- ✅ كل طالب وشلة عندهم عمود avatar_url
-- ✅ دوال جاهزة لحساب المستوى من النقاط
-- ✅ Views جاهزة للاستعلام السريع
-- ============================================
