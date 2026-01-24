-- ===================================================================
-- Nursing Academy - Enhanced Points System V2
-- Features:
-- 1. Individual points for personal exams
-- 2. Collaborative exam points with 20% bonus
-- 3. Streak Bonus (7 days)
-- 4. Perfect Score Bonus
-- 5. Squad Boost (all members complete same exam)
-- ===================================================================

-- Main Function: Submit Exam Result with Enhanced Points
CREATE OR REPLACE FUNCTION submit_exam_result(
    p_exam_id UUID,
    p_answers JSONB,
    p_time_spent INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER 
AS $$
DECLARE
    v_user_id UUID;
    v_score INTEGER := 0;
    v_total_questions INTEGER;
    v_correct_answer TEXT;
    v_question_id UUID;
    v_is_first_attempt BOOLEAN;
    v_squad_id UUID;
    v_points_awarded INTEGER := 0;
    v_bonus_points INTEGER := 0;
    v_bonus_reasons TEXT[] := ARRAY[]::TEXT[];
    v_percentage NUMERIC;
    v_is_perfect BOOLEAN := FALSE;
    v_has_streak BOOLEAN := FALSE;
    v_squad_boost BOOLEAN := FALSE;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Calculate score server-side from questions table
    FOR v_question_id, v_correct_answer IN 
        SELECT id, correct_answer FROM questions WHERE exam_id = p_exam_id
    LOOP
        IF p_answers->>(v_question_id::TEXT) = v_correct_answer THEN
            v_score := v_score + 1;
        END IF;
    END LOOP;

    SELECT COUNT(*) INTO v_total_questions FROM questions WHERE exam_id = p_exam_id;
    v_percentage := (v_score::NUMERIC / NULLIF(v_total_questions, 0)) * 100;

    -- Insert result
    INSERT INTO results (user_id, exam_id, score, total_questions, time_spent, answers)
    VALUES (v_user_id, p_exam_id, v_score, v_total_questions, p_time_spent, p_answers);

    -- Check if first attempt
    SELECT NOT EXISTS (
        SELECT 1 FROM results 
        WHERE user_id = v_user_id AND exam_id = p_exam_id 
        AND id != (SELECT id FROM results WHERE user_id = v_user_id AND exam_id = p_exam_id ORDER BY created_at DESC LIMIT 1)
    ) INTO v_is_first_attempt;

    -- Award points only on first attempt
    IF v_is_first_attempt THEN
        v_points_awarded := v_score;

        -- ===== BONUS 1: Perfect Score =====
        IF v_percentage = 100 THEN
            v_is_perfect := TRUE;
            v_bonus_points := v_bonus_points + 10;
            v_bonus_reasons := array_append(v_bonus_reasons, 'Perfect Score +10');
        END IF;

        -- ===== BONUS 2: Streak Bonus (7 consecutive days) =====
        -- Check if user has results in last 7 days (one per day)
        DECLARE
            v_streak_count INTEGER;
        BEGIN
            SELECT COUNT(DISTINCT DATE(created_at)) INTO v_streak_count
            FROM results
            WHERE user_id = v_user_id
            AND created_at >= CURRENT_DATE - INTERVAL '7 days'
            AND created_at < CURRENT_DATE;

            IF v_streak_count >= 6 THEN -- 6 previous days + today = 7
                v_has_streak := TRUE;
                v_bonus_points := v_bonus_points + 5;
                v_bonus_reasons := array_append(v_bonus_reasons, '7-Day Streak +5');
            END IF;
        END;

        -- ===== Squad Logic =====
        SELECT squad_id INTO v_squad_id FROM squad_members WHERE profile_id = v_user_id LIMIT 1;
        
        IF v_squad_id IS NOT NULL THEN
            -- Add points to squad total
            UPDATE squads SET points = COALESCE(points, 0) + v_score WHERE id = v_squad_id;

            -- ===== BONUS 3: Collaborative Exam Bonus (20%) =====
            -- Check if this is a collaborative exam session
            DECLARE
                v_is_collaborative BOOLEAN := FALSE;
            BEGIN
                SELECT EXISTS(
                    SELECT 1 FROM squad_exam_sessions 
                    WHERE squad_id = v_squad_id 
                    AND exam_id = p_exam_id 
                    AND status = 'active'
                ) INTO v_is_collaborative;

                IF v_is_collaborative AND v_percentage >= 70 THEN
                    v_bonus_points := v_bonus_points + CEIL(v_score * 0.2);
                    v_bonus_reasons := array_append(v_bonus_reasons, 'Team Bonus +20%');
                END IF;
            END;

            -- ===== BONUS 4: Squad Boost =====
            -- Check if all squad members completed this exam today
            DECLARE
                v_total_members INTEGER;
                v_completed_today INTEGER;
            BEGIN
                SELECT COUNT(*) INTO v_total_members 
                FROM squad_members 
                WHERE squad_id = v_squad_id;

                SELECT COUNT(DISTINCT r.user_id) INTO v_completed_today
                FROM results r
                INNER JOIN squad_members sm ON r.user_id = sm.profile_id
                WHERE sm.squad_id = v_squad_id
                AND r.exam_id = p_exam_id
                AND DATE(r.created_at) = CURRENT_DATE;

                IF v_completed_today >= v_total_members THEN
                    v_squad_boost := TRUE;
                    v_bonus_points := v_bonus_points + 10;
                    v_bonus_reasons := array_append(v_bonus_reasons, 'Squad Boost +10');
                END IF;
            END;
        END IF;

        -- Apply total points (base + bonuses)
        UPDATE profiles 
        SET points = COALESCE(points, 0) + v_points_awarded + v_bonus_points 
        WHERE id = v_user_id;

        -- Apply Squad Boost to other members if applicable
        IF v_squad_boost AND v_squad_id IS NOT NULL THEN
            UPDATE profiles 
            SET points = COALESCE(points, 0) + 10
            WHERE id IN (
                SELECT profile_id FROM squad_members 
                WHERE squad_id = v_squad_id AND profile_id != v_user_id
            );
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'score', v_score,
        'total', v_total_questions,
        'points_awarded', v_points_awarded,
        'bonus_points', v_bonus_points,
        'total_points', v_points_awarded + v_bonus_points,
        'bonuses', v_bonus_reasons,
        'is_perfect', v_is_perfect,
        'has_streak', v_has_streak,
        'squad_boost', v_squad_boost
    );
END;
$$;

-- Keep the protection trigger as is
CREATE OR REPLACE FUNCTION protect_profile_fields()
RETURNS TRIGGER AS $$
BEGIN
    -- If not admin and not system
    IF (auth.jwt() ->> 'role' != 'service_role') AND 
       NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') THEN
        IF NEW.points != OLD.points THEN
            NEW.points := OLD.points;
        END IF;
        IF NEW.role != OLD.role THEN
            NEW.role := OLD.role;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_protect_profile_fields ON profiles;
CREATE TRIGGER tr_protect_profile_fields
BEFORE UPDATE ON profiles
FOR EACH ROW
EXECUTE FUNCTION protect_profile_fields();
