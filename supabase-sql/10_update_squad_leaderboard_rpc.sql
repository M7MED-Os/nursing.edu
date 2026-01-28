-- ============================================
-- Update Squad Leaderboard RPC (v2)
-- ============================================
-- تحديث دالة قائمة أوائل الشلل لإضافة حقول الخصوصية وعدد الأعضاء
-- ============================================

DROP FUNCTION IF EXISTS get_top_squads(integer, text);

CREATE OR REPLACE FUNCTION get_top_squads(
    p_limit INT DEFAULT 10,
    p_academic_year TEXT DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    name TEXT,
    points INT,
    academic_year TEXT,
    department TEXT,
    avatar_url TEXT,
    member_count BIGINT,
    privacy_avatar TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        s.id,
        s.name,
        s.points,
        s.academic_year,
        s.department,
        s.avatar_url,
        (SELECT COUNT(*) FROM squad_members sm WHERE sm.squad_id = s.id) as member_count,
        s.privacy_avatar
    FROM squads s
    WHERE 
        p_academic_year IS NULL 
        OR s.academic_year = p_academic_year -- تطابق مباشر (نص مع نص)
        OR (p_academic_year = '1' AND s.academic_year = 'الفرقة الأولى')
        OR (p_academic_year = '2' AND s.academic_year = 'الفرقة الثانية')
        OR (p_academic_year = '3' AND s.academic_year = 'الفرقة الثالثة')
        OR (p_academic_year = '4' AND s.academic_year = 'الفرقة الرابعة')
    ORDER BY s.points DESC, s.created_at ASC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;
