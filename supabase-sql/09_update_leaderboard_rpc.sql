-- Drop existing function first because we're changing the return type (adding squad_id)
DROP FUNCTION IF EXISTS get_top_students(integer, text, text, text);

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
    avatar_url TEXT,
    privacy_avatar TEXT,
    squad_id UUID
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
        p.avatar_url,
        p.privacy_avatar,
        sm.squad_id
    FROM profiles p
    LEFT JOIN squad_members sm ON p.id = sm.profile_id
    WHERE 
        (p_grade IS NULL OR p.grade = p_grade)
        AND (p_term IS NULL OR p.term = p_term)
        AND (p_stream IS NULL OR p.stream = p_stream)
    ORDER BY p.points DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;
