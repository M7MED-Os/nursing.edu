-- ============================================
-- Update RPC Functions to Include Avatar URL
-- ============================================
-- This ensures that leaderboard and chat display
-- user avatars correctly
-- ============================================

-- 1. Update get_top_students function
CREATE OR REPLACE FUNCTION get_top_students(
    p_limit INT DEFAULT 50,
    p_grade TEXT DEFAULT NULL,
    p_term TEXT DEFAULT NULL,
    p_stream TEXT DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    full_name TEXT,
    points INT,
    grade TEXT,
    term TEXT,
    stream TEXT,
    avatar_url TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.id,
        p.full_name,
        p.points,
        p.grade,
        p.term,
        p.stream,
        p.avatar_url
    FROM profiles p
    WHERE 
        p.show_on_leaderboard = TRUE
        AND p.role != 'admin'
        AND (p_grade IS NULL OR p.grade = p_grade)
        AND (p_term IS NULL OR p.term = p_term)
        AND (p_stream IS NULL OR p.stream = p_stream)
    ORDER BY p.points DESC, p.created_at ASC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- 2. Update get_top_squads function (if needed)
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
    member_count BIGINT
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
        (SELECT COUNT(*) FROM squad_members sm WHERE sm.squad_id = s.id) as member_count
    FROM squads s
    WHERE 
        (p_academic_year IS NULL OR s.academic_year = p_academic_year)
    ORDER BY s.points DESC, s.created_at ASC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;
