-- Nursing Academy Database Security & Logic Hardening (V2 - Based on Full Schema)
-- Run this in your Supabase SQL Editor

-- 1. Function to safely submit exam results and award points
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

    -- Insert result (Matches public.results table)
    INSERT INTO results (user_id, exam_id, score, total_questions, time_spent, answers)
    VALUES (v_user_id, p_exam_id, v_score, v_total_questions, p_time_spent, p_answers);

    -- Check if first attempt
    SELECT NOT EXISTS (
        SELECT 1 FROM results 
        WHERE user_id = v_user_id AND exam_id = p_exam_id 
        AND id != (SELECT id FROM results WHERE user_id = v_user_id AND exam_id = p_exam_id ORDER BY created_at DESC LIMIT 1)
    ) INTO v_is_first_attempt;

    -- Award points if first attempt
    IF v_is_first_attempt THEN
        UPDATE profiles SET points = COALESCE(points, 0) + v_score WHERE id = v_user_id;

        -- Squad Logic
        SELECT squad_id INTO v_squad_id FROM squad_members WHERE profile_id = v_user_id LIMIT 1;
        
        IF v_squad_id IS NOT NULL THEN
            UPDATE squads SET points = COALESCE(points, 0) + v_score WHERE id = v_squad_id;
            
            -- Update other members
            UPDATE profiles 
            SET points = COALESCE(points, 0) + v_score 
            WHERE id IN (SELECT profile_id FROM squad_members WHERE squad_id = v_squad_id AND profile_id != v_user_id);
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'score', v_score,
        'total', v_total_questions,
        'points_awarded', CASE WHEN v_is_first_attempt THEN v_score ELSE 0 END
    );
END;
$$;

-- 2. Secure Admin Delete Student (Clean & Accurate)
CREATE OR REPLACE FUNCTION admin_delete_student(p_student_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Only allow admins
    IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') THEN
        RAISE EXCEPTION 'Admins only';
    END IF;

    -- 1. results: user_id
    DELETE FROM results WHERE user_id = p_student_id;
    
    -- 2. todos: user_id (references auth.users, but ID is the same)
    DELETE FROM todos WHERE user_id = p_student_id;
    
    -- 3. squad message reads: profile_id
    DELETE FROM squad_message_reads WHERE profile_id = p_student_id;
    
    -- 4. squad completions: profile_id
    DELETE FROM squad_task_completions WHERE profile_id = p_student_id;
    
    -- 5. squad chat: sender_id
    DELETE FROM squad_chat_messages WHERE sender_id = p_student_id;
    
    -- 6. squad tasks: created_by
    DELETE FROM squad_tasks WHERE created_by = p_student_id;
    
    -- 7. squad membership: profile_id
    DELETE FROM squad_members WHERE profile_id = p_student_id;
    
    -- 8. squads ownership: owner_id
    DELETE FROM squads WHERE owner_id = p_student_id;
    
    -- 9. squad pomodoro: started_by
    DELETE FROM squad_pomodoro WHERE started_by = p_student_id;
    
    -- 10. squad exam sessions: NO creator column exists in your schema
    -- (If we need to delete sessions started by them, we'd need a column. 
    -- For now, we skip as sessions don't have a creator back-link)

    -- 11. Finally Profile
    DELETE FROM profiles WHERE id = p_student_id;
END;
$$;

-- 2.1 Secure Admin Delete Squad (Cascade Clean)
CREATE OR REPLACE FUNCTION admin_delete_squad(p_squad_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Only allow admins
    IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') THEN
        RAISE EXCEPTION 'Admins only';
    END IF;

    -- 1. Delete message reads (must be first because they reference messages)
    DELETE FROM squad_message_reads WHERE message_id IN (
        SELECT id FROM squad_chat_messages WHERE squad_id = p_squad_id
    );

    -- 2. Delete chat messages
    DELETE FROM squad_chat_messages WHERE squad_id = p_squad_id;

    -- 3. Delete task completions (must be before tasks)
    DELETE FROM squad_task_completions WHERE task_id IN (
        SELECT id FROM squad_tasks WHERE squad_id = p_squad_id
    );

    -- 4. Delete tasks
    DELETE FROM squad_tasks WHERE squad_id = p_squad_id;

    -- 5. Delete exam sessions
    DELETE FROM squad_exam_sessions WHERE squad_id = p_squad_id;

    -- 6. Delete pomodoro records
    DELETE FROM squad_pomodoro WHERE squad_id = p_squad_id;

    -- 7. Delete members
    DELETE FROM squad_members WHERE squad_id = p_squad_id;

    -- 8. Finally Delete the Squad
    DELETE FROM squads WHERE id = p_squad_id;
END;
$$;


-- 3. Field Protection Trigger
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
