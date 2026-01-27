-- فحص وإصلاح نظام الشلة
-- ================================

-- 1. التأكد من وجود عمود total_points في جدول squads
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'squads' AND column_name = 'total_points'
    ) THEN
        ALTER TABLE squads ADD COLUMN total_points INTEGER DEFAULT 0;
    END IF;
END $$;

-- 2. فحص الـ Trigger
SELECT 
    trigger_name, 
    event_manipulation, 
    event_object_table,
    action_statement
FROM information_schema.triggers
WHERE trigger_name = 'after_challenge_participation';

-- 3. فحص آخر المشاركات والتحديات
SELECT 
    cp.challenge_id,
    cp.profile_id,
    cp.score,
    cp.created_at,
    sec.squad_id,
    sec.status,
    (SELECT COUNT(*) FROM challenge_participations WHERE challenge_id = cp.challenge_id) as total_participants,
    (SELECT COUNT(*) FROM squad_members WHERE squad_id = sec.squad_id) as total_members
FROM challenge_participations cp
JOIN squad_exam_challenges sec ON sec.id = cp.challenge_id
ORDER BY cp.created_at DESC
LIMIT 5;

-- 4. فحص رسائل الشات الأخيرة
SELECT 
    text,
    challenge_id,
    created_at
FROM squad_chat_messages
WHERE challenge_id IS NOT NULL
ORDER BY created_at DESC
LIMIT 10;
