-- تحديث دالة monitor_squad_challenge لتكون ديناميكية
-- النسبة المطلوبة تُقرأ من app_configs (success_threshold)
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
    v_success_threshold INTEGER := 50; -- القيمة الافتراضية
BEGIN
    -- أ. قراءة النسبة المطلوبة من الإعدادات
    BEGIN
        SELECT (value->>'success_threshold')::INTEGER INTO v_success_threshold
        FROM app_configs
        WHERE key = 'squad_settings';
    EXCEPTION WHEN OTHERS THEN
        v_success_threshold := 50; -- لو حصل خطأ، استخدم 50%
    END;

    -- ب. جلب معلومات التحدي
    SELECT squad_id, status INTO v_squad_id, v_challenge_status
    FROM squad_exam_challenges
    WHERE id = NEW.challenge_id;

    -- لو التحدي مكتمل أو ملغي، متعملش حاجة
    IF v_challenge_status IN ('completed', 'cancelled', 'expired') THEN
        RETURN NEW;
    END IF;

    -- ج. حساب الأعداد
    SELECT COUNT(*) INTO v_member_count 
    FROM squad_members 
    WHERE squad_id = v_squad_id;

    SELECT COUNT(*) INTO v_solve_count 
    FROM challenge_participations 
    WHERE challenge_id = NEW.challenge_id;

    -- حساب العدد المطلوب بناءً على النسبة الديناميكية
    -- نستخدم CEIL عشان نقرب لفوق (مثلاً: 50% من 3 = 1.5 → 2)
    v_required_count := CEIL(v_member_count * v_success_threshold / 100.0);
    v_remaining_count := v_required_count - v_solve_count;

    -- د. التحقق من الحالة
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

        -- حساب نقاط الشلة (متوسط الدرجات × 2)
        v_squad_points := FLOOR(v_avg_score * 2);

        -- إضافة النقاط لرصيد الشلة
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


-- تحديث دالة check_expired_challenges لتكون ديناميكية أيضاً
-- ================================

DROP FUNCTION IF EXISTS check_expired_challenges();

CREATE OR REPLACE FUNCTION check_expired_challenges()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_challenge RECORD;
    v_member_count INTEGER;
    v_solve_count INTEGER;
    v_required_count INTEGER;
    v_success_threshold INTEGER := 50;
BEGIN
    -- قراءة النسبة من الإعدادات
    BEGIN
        SELECT (value->>'success_threshold')::INTEGER INTO v_success_threshold
        FROM app_configs
        WHERE key = 'squad_settings';
    EXCEPTION WHEN OTHERS THEN
        v_success_threshold := 50;
    END;

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

        v_required_count := CEIL(v_member_count * v_success_threshold / 100.0);

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
