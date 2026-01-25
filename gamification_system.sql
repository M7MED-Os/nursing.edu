-- Squad Gamification & Advanced Points System
-- Run this in your Supabase SQL Editor

-- 1. Track Squad Exam Challenges
CREATE TABLE IF NOT EXISTS squad_exam_challenges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    squad_id UUID REFERENCES squads(id) ON DELETE CASCADE,
    exam_id UUID REFERENCES exams(id) ON DELETE CASCADE,
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    expires_at TIMESTAMPTZ DEFAULT (now() + interval '24 hours'),
    unlocked_at TIMESTAMPTZ, -- When 80% is reached
    squad_points_awarded INTEGER DEFAULT 0,
    status TEXT DEFAULT 'active' -- active, completed, expired
);

-- 1.1 Link messages to challenges
ALTER TABLE squad_chat_messages ADD COLUMN IF NOT EXISTS challenge_id UUID REFERENCES squad_exam_challenges(id) ON DELETE SET NULL;

-- 2. Track solve history for participation within challenges
CREATE TABLE IF NOT EXISTS challenge_participations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    challenge_id UUID REFERENCES squad_exam_challenges(id) ON DELETE CASCADE,
    profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    score INTEGER NOT NULL,
    solved_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(challenge_id, profile_id)
);

-- 3. Track User Streaks
CREATE TABLE IF NOT EXISTS user_streaks (
    profile_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
    current_streak INTEGER DEFAULT 0,
    last_solved_date DATE,
    streak_points_claimed_at TIMESTAMPTZ
);

-- 4. Main RPC to submit result with all logic
CREATE OR REPLACE FUNCTION submit_exam_complex(
    p_exam_id UUID,
    p_answers JSONB,
    p_time_spent INTEGER,
    p_challenge_id UUID DEFAULT NULL -- Pass this if solved from a squad challenge card
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID;
    v_squad_id UUID;
    v_score INTEGER := 0;
    v_total_questions INTEGER;
    v_correct_answer TEXT;
    v_question_id UUID;
    v_is_first_attempt BOOLEAN;
    v_points_to_user INTEGER := 0;
    v_bonus_points INTEGER := 0;
    v_streak_awarded BOOLEAN := FALSE;
    v_perfect_score_awarded BOOLEAN := FALSE;
    v_squad_boost_awarded BOOLEAN := FALSE;
    v_today DATE := CURRENT_DATE;
    v_streak_count INTEGER;
    v_last_date DATE;
    v_member_count INTEGER;
    v_solve_count INTEGER;
    v_avg_score FLOAT;
    v_engagement_bonus INTEGER := 0;
    v_final_squad_points INTEGER := 0;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

    -- 1. Calculate Score
    FOR v_question_id, v_correct_answer IN 
        SELECT id, correct_answer FROM questions WHERE exam_id = p_exam_id
    LOOP
        IF p_answers->>(v_question_id::TEXT) = v_correct_answer THEN
            v_score := v_score + 1;
        END IF;
    END LOOP;
    SELECT COUNT(*) INTO v_total_questions FROM questions WHERE exam_id = p_exam_id;

    -- 2. Check First Attempt Logic
    SELECT NOT EXISTS (
        SELECT 1 FROM results WHERE user_id = v_user_id AND exam_id = p_exam_id
    ) INTO v_is_first_attempt;

    IF v_is_first_attempt THEN
        v_points_to_user := v_score;
    END IF;

    -- 3. Bonus Logic: Perfect Score (+10)
    IF v_score = v_total_questions AND v_total_questions > 0 THEN
        v_bonus_points := v_bonus_points + 10;
        v_perfect_score_awarded := TRUE;
    END IF;

    -- 4. Bonus Logic: Streak (+5 every 3 days)
    INSERT INTO user_streaks (profile_id, current_streak, last_solved_date)
    VALUES (v_user_id, 1, v_today)
    ON CONFLICT (profile_id) DO UPDATE SET
        current_streak = CASE 
            WHEN user_streaks.last_solved_date = v_today THEN user_streaks.current_streak -- Already updated today
            WHEN user_streaks.last_solved_date = v_today - 1 THEN user_streaks.current_streak + 1
            ELSE 1 
        END,
        last_solved_date = v_today;

    SELECT current_streak INTO v_streak_count FROM user_streaks WHERE profile_id = v_user_id;
    IF v_streak_count % 3 = 0 AND (SELECT (streak_points_claimed_at::DATE != v_today OR streak_points_claimed_at IS NULL) FROM user_streaks WHERE profile_id = v_user_id) THEN
        v_bonus_points := v_bonus_points + 5;
        v_streak_awarded := TRUE;
        UPDATE user_streaks SET streak_points_claimed_at = now() WHERE profile_id = v_user_id;
    END IF;

    -- 5. Challenge Logic (The Core)
    IF p_challenge_id IS NOT NULL THEN
        -- Record participation
        INSERT INTO challenge_participations (challenge_id, profile_id, score)
        VALUES (p_challenge_id, v_user_id, v_score)
        ON CONFLICT (challenge_id, profile_id) DO NOTHING;

        -- Notify in Chat about completion
        INSERT INTO squad_chat_messages (squad_id, sender_id, text)
        VALUES (
            v_squad_id, 
            v_user_id, 
            '✅ خلصت التحدي وجبت ' || v_score || '/' || v_total_questions || '! يلا يا شباب الهمة.'
        );

        -- Check Participation threshold (80%)
        SELECT squad_id INTO v_squad_id FROM squad_exam_challenges WHERE id = p_challenge_id;
        SELECT COUNT(*) INTO v_member_count FROM squad_members WHERE squad_id = v_squad_id;
        SELECT COUNT(*) INTO v_solve_count FROM challenge_participations WHERE challenge_id = p_challenge_id;

        -- If threshold reached and points not yet awarded
        IF (v_solve_count::float / v_member_count::float) >= 0.8 AND 
           (SELECT squad_points_awarded FROM squad_exam_challenges WHERE id = p_challenge_id) = 0 THEN
            
            -- Calculate Avg Score
            SELECT AVG(score) INTO v_avg_score FROM challenge_participations WHERE challenge_id = p_challenge_id;
            
            -- Engagement Bonus
            v_engagement_bonus := 5; -- 80% bonus
            IF v_solve_count = v_member_count THEN
                v_engagement_bonus := 10; -- 100% bonus
                v_squad_boost_awarded := TRUE;
            END IF;

            v_final_squad_points := ROUND(v_avg_score) + v_engagement_bonus;

            -- Update Squad Points
            UPDATE squads SET points = COALESCE(points, 0) + v_final_squad_points WHERE id = v_squad_id;
            UPDATE squad_exam_challenges SET 
                squad_points_awarded = v_final_squad_points, 
                unlocked_at = now(),
                status = 'completed'
            WHERE id = p_challenge_id;
            
            -- Reward all squad members (+3 for Squad Boost) if 100%
            IF v_solve_count = v_member_count THEN
                UPDATE profiles SET points = COALESCE(points, 0) + 3 
                WHERE id IN (SELECT profile_id FROM squad_members WHERE squad_id = v_squad_id);
            END IF;
        END IF;
    END IF;

    -- Update User Profile with Final Points
    UPDATE profiles SET points = COALESCE(points, 0) + v_points_to_user + v_bonus_points WHERE id = v_user_id;

    -- Record in standard results table
    INSERT INTO results (user_id, exam_id, score, total_questions, time_spent, answers)
    VALUES (v_user_id, p_exam_id, v_score, v_total_questions, p_time_spent, p_answers);

    RETURN jsonb_build_object(
        'score', v_score,
        'total', v_total_questions,
        'points_earned', v_points_to_user,
        'bonus_earned', v_bonus_points,
        'streak_reached', v_streak_count,
        'is_perfect', v_perfect_score_awarded,
        'challenge_unlocked', v_final_squad_points > 0,
        'squad_points_awarded', v_final_squad_points
    );
END;
$$;
