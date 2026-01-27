-- إصلاح دالة monitor_squad_challenge
-- المشكلة: العمود في جدول squads اسمه points مش total_points
-- ================================

DROP FUNCTION IF EXISTS monitor_squad_challenge() CASCADE;

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

        -- إضافة النقاط لرصيد الشلة (العمود الصحيح: points)
        UPDATE squads
        SET points = COALESCE(points, 0) + v_squad_points
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

-- إعادة إنشاء الـ Trigger
DROP TRIGGER IF EXISTS after_challenge_participation ON challenge_participations;

CREATE TRIGGER after_challenge_participation
    AFTER INSERT ON challenge_participations
    FOR EACH ROW
    EXECUTE FUNCTION monitor_squad_challenge();
