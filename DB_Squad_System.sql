-- ============================================
-- نظام الشلة المحسّن (Squad Challenge System)
-- ============================================

-- الجزء 1: تحديث دالة submit_exam_secure (تنظيف من كود الشات)
-- ============================================

DROP FUNCTION IF EXISTS submit_exam_secure(UUID, JSONB, INTEGER, UUID);

CREATE OR REPLACE FUNCTION submit_exam_secure(
    p_exam_id UUID,
    p_answers JSONB,
    p_time_spent INTEGER,
    p_challenge_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_score INTEGER := 0;
    v_total_questions INTEGER := 0;
    v_question_id UUID;
    v_correct_answer TEXT;
    v_is_first_attempt BOOLEAN;
    v_points_to_user INTEGER := 0;
    v_bonus_perfect INTEGER := 0;
    v_bonus_streak INTEGER := 0;
    v_today DATE := CURRENT_DATE;
    v_streak_count INTEGER := 0;
BEGIN
    -- أ. التحقق من المستخدم
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'User not authenticated';
    END IF;

    -- ب. حساب الدرجة (تصحيح الامتحان)
    FOR v_question_id, v_correct_answer IN 
        SELECT id, correct_answer FROM questions WHERE exam_id = p_exam_id
    LOOP
        IF (p_answers->>(v_question_id::TEXT)) = v_correct_answer THEN
            v_score := v_score + 1;
        END IF;
    END LOOP;

    SELECT COUNT(*) INTO v_total_questions FROM questions WHERE exam_id = p_exam_id;

    -- ج. منطق النقاط الشخصية (هل هذه أول مرة؟)
    SELECT NOT EXISTS (
        SELECT 1 FROM results WHERE user_id = v_user_id AND exam_id = p_exam_id
    ) INTO v_is_first_attempt;

    IF v_is_first_attempt THEN
        v_points_to_user := v_score;
        
        -- بونص التقفيل
        IF v_score = v_total_questions AND v_total_questions > 0 THEN
            v_bonus_perfect := 10;
        END IF;
    END IF;

    -- د. تحديث الاستمرارية (Streaks)
    INSERT INTO user_streaks (profile_id, current_streak, last_solved_date)
    VALUES (v_user_id, 1, v_today)
    ON CONFLICT (profile_id) DO UPDATE
    SET 
        current_streak = CASE 
            WHEN user_streaks.last_solved_date = v_today THEN user_streaks.current_streak
            WHEN user_streaks.last_solved_date = v_today - 1 THEN user_streaks.current_streak + 1
            ELSE 1
        END,
        last_solved_date = v_today
    RETURNING current_streak INTO v_streak_count;

    -- هـ. بونص الاستمرارية
    IF v_streak_count > 0 AND (v_streak_count % 3 = 0) THEN
        IF NOT EXISTS (
            SELECT 1 FROM user_streaks 
            WHERE profile_id = v_user_id 
              AND streak_points_claimed_at::DATE = v_today
        ) THEN
            v_bonus_streak := 5;
            UPDATE user_streaks SET streak_points_claimed_at = NOW() WHERE profile_id = v_user_id;
        END IF;
    END IF;

    -- و. تسجيل المشاركة في التحدي (لو موجود)
    -- هنا بس نسجل، الـ Trigger هو اللي هيبعت الرسائل
    IF p_challenge_id IS NOT NULL THEN
        INSERT INTO challenge_participations (challenge_id, profile_id, score)
        VALUES (p_challenge_id, v_user_id, v_score)
        ON CONFLICT (challenge_id, profile_id) DO NOTHING;
    END IF;

    -- ز. تحديث النقاط الشخصية في البروفايل
    IF (v_points_to_user + v_bonus_perfect + v_bonus_streak) > 0 THEN
        UPDATE profiles 
        SET points = COALESCE(points, 0) + v_points_to_user + v_bonus_perfect + v_bonus_streak 
        WHERE id = v_user_id;
    END IF;

    -- ح. حفظ نتيجة الامتحان
    INSERT INTO results (user_id, exam_id, score, total_questions, time_spent, answers)
    VALUES (v_user_id, p_exam_id, v_score, v_total_questions, p_time_spent, p_answers);

    -- ط. إرجاع النتيجة للواجهة
    RETURN jsonb_build_object(
        'score', v_score,
        'total', v_total_questions,
        'points_exam', v_points_to_user,
        'bonus_perfect', v_bonus_perfect,
        'bonus_streak', v_bonus_streak,
        'total_earned', (v_points_to_user + v_bonus_perfect + v_bonus_streak)
    );

EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Error in submit_exam_secure: %', SQLERRM;
END;
$$;


-- الجزء 2: دالة مراقبة التحديات (Squad Challenge Monitor)
-- ============================================

CREATE OR REPLACE FUNCTION monitor_squad_challenge()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_squad_id UUID;
    v_member_count INTEGER;
    v_solve_count INTEGER;
    v_required_count INTEGER;
    v_remaining_count INTEGER;
    v_challenge_status TEXT;
    v_squad_points INTEGER;
    v_avg_score NUMERIC;
BEGIN
    -- أ. جلب معلومات التحدي
    SELECT squad_id, status INTO v_squad_id, v_challenge_status
    FROM squad_exam_challenges
    WHERE id = NEW.challenge_id;

    -- لو التحدي مكتمل أو ملغي، متعملش حاجة
    IF v_challenge_status IN ('completed', 'cancelled') THEN
        RETURN NEW;
    END IF;

    -- ب. حساب الأعداد
    SELECT COUNT(*) INTO v_member_count 
    FROM squad_members 
    WHERE squad_id = v_squad_id;

    SELECT COUNT(*) INTO v_solve_count 
    FROM challenge_participations 
    WHERE challenge_id = NEW.challenge_id;

    -- النسبة المطلوبة (80% من الأعضاء)
    v_required_count := CEIL(v_member_count * 0.8);
    v_remaining_count := v_required_count - v_solve_count;

    -- ج. التحقق من الحالة
    IF v_remaining_count > 0 THEN
        -- لسه محتاجين ناس تحل
        INSERT INTO squad_chat_messages (squad_id, challenge_id, text)
        VALUES (
            v_squad_id, 
            NEW.challenge_id, 
            '📢 فاضل ' || v_remaining_count || ' على الأقل يحلوا عشان النقط تضاف لرصيد الشلة!'
        );
    ELSE
        -- التحدي اكتمل! 🎉
        
        -- حساب متوسط الدرجات
        SELECT AVG(score) INTO v_avg_score
        FROM challenge_participations
        WHERE challenge_id = NEW.challenge_id;

        -- حساب نقاط الشلة (مثلاً: متوسط الدرجات × 2)
        v_squad_points := FLOOR(v_avg_score * 2);

        -- إضافة النقاط لرصيد الشلة
        UPDATE squads
        SET total_points = COALESCE(total_points, 0) + v_squad_points
        WHERE id = v_squad_id;

        -- تحديث حالة التحدي
        UPDATE squad_exam_challenges
        SET status = 'completed'
        WHERE id = NEW.challenge_id;

        -- إرسال رسالة النجاح
        INSERT INTO squad_chat_messages (squad_id, challenge_id, text)
        VALUES (
            v_squad_id,
            NEW.challenge_id,
            '🎉 عااااش! التحدي نجح واتضاف ' || v_squad_points || ' نقطة لرصيد الشلة! 🔥'
        );
    END IF;

    RETURN NEW;
END;
$$;


-- الجزء 3: إنشاء الـ Trigger
-- ============================================

DROP TRIGGER IF EXISTS after_challenge_participation ON challenge_participations;

CREATE TRIGGER after_challenge_participation
    AFTER INSERT ON challenge_participations
    FOR EACH ROW
    EXECUTE FUNCTION monitor_squad_challenge();


-- الجزء 4: دالة فحص التحديات المنتهية (للـ Cron Job)
-- ============================================

CREATE OR REPLACE FUNCTION check_expired_challenges()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_challenge RECORD;
    v_squad_id UUID;
    v_member_count INTEGER;
    v_solve_count INTEGER;
    v_required_count INTEGER;
BEGIN
    -- البحث عن التحديات النشطة اللي وقتها خلص
    FOR v_challenge IN 
        SELECT id, squad_id, expires_at
        FROM squad_exam_challenges
        WHERE status = 'active'
          AND expires_at < NOW()
    LOOP
        -- حساب النسبة
        SELECT COUNT(*) INTO v_member_count 
        FROM squad_members 
        WHERE squad_id = v_challenge.squad_id;

        SELECT COUNT(*) INTO v_solve_count 
        FROM challenge_participations 
        WHERE challenge_id = v_challenge.id;

        v_required_count := CEIL(v_member_count * 0.8);

        -- لو محققوش الهدف
        IF v_solve_count < v_required_count THEN
            -- تحديث الحالة
            UPDATE squad_exam_challenges
            SET status = 'expired'
            WHERE id = v_challenge.id;

            -- إرسال رسالة
            INSERT INTO squad_chat_messages (squad_id, challenge_id, text)
            VALUES (
                v_challenge.squad_id,
                v_challenge.id,
                '⏰ للأسف الوقت خلص. المرة الجاية لازم ' || v_required_count || ' على الأقل يحلوا الامتحان عشان النقط تضاف لرصيد الشلة.'
            );
        END IF;
    END LOOP;
END;
$$;

-- ملحوظة: دالة check_expired_challenges() محتاجة Cron Job يشغلها كل ساعة
-- ممكن تستخدم pg_cron أو Supabase Edge Functions
