-- نظام الشلة - الحل النهائي لمشكلة التكرار
-- ============================================
-- الحل: منع المشاركة المتكررة في نفس التحدي من الأساس
-- ============================================

-- 1. إضافة UNIQUE constraint على (challenge_id, profile_id)
-- ============================================

-- حذف أي تكرارات موجودة (الاحتفاظ بالأقدم فقط)
DELETE FROM challenge_participations
WHERE id NOT IN (
    SELECT MIN(id)
    FROM challenge_participations
    GROUP BY challenge_id, profile_id
);

-- إضافة الـ constraint
ALTER TABLE challenge_participations
DROP CONSTRAINT IF EXISTS unique_challenge_participation;

ALTER TABLE challenge_participations
ADD CONSTRAINT unique_challenge_participation 
UNIQUE (challenge_id, profile_id);


-- 2. دالة المراقبة (بدون تغيير)
-- ============================================

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
    v_success_threshold INTEGER := 50;
    v_expired_challenge RECORD;
BEGIN
    -- أولاً: فحص وإنهاء أي تحديات منتهية في كل الشلل
    FOR v_expired_challenge IN 
        SELECT id FROM squad_exam_challenges
        WHERE status = 'active' AND expires_at < NOW()
    LOOP
        PERFORM finalize_squad_challenge(v_expired_challenge.id);
    END LOOP;

    -- قراءة النسبة من الإعدادات
    BEGIN
        SELECT (value->>'success_threshold')::INTEGER INTO v_success_threshold
        FROM app_configs
        WHERE key = 'squad_settings';
    EXCEPTION WHEN OTHERS THEN
        v_success_threshold := 50;
    END;

    -- جلب معلومات التحدي الحالي
    SELECT squad_id, status INTO v_squad_id, v_challenge_status
    FROM squad_exam_challenges
    WHERE id = NEW.challenge_id;

    -- لو التحدي مش نشط، متعملش حاجة
    IF v_challenge_status != 'active' THEN
        RETURN NEW;
    END IF;

    -- حساب الأعداد
    SELECT COUNT(*) INTO v_member_count 
    FROM squad_members 
    WHERE squad_id = v_squad_id;

    SELECT COUNT(*) INTO v_solve_count 
    FROM challenge_participations 
    WHERE challenge_id = NEW.challenge_id;

    v_required_count := CEIL(v_member_count * v_success_threshold / 100.0);
    v_remaining_count := v_required_count - v_solve_count;

    -- التحقق: هل كل الأعضاء حلوا؟
    IF v_solve_count >= v_member_count THEN
        -- كل الأعضاء حلوا! ننهي التحدي فوراً
        PERFORM finalize_squad_challenge(NEW.challenge_id);
    ELSIF v_remaining_count > 0 THEN
        -- لسه محتاجين ناس
        INSERT INTO squad_chat_messages (squad_id, challenge_id, text)
        VALUES (
            v_squad_id, 
            NEW.challenge_id, 
            '📢 فاضل ' || v_remaining_count || ' على الأقل يحلوا عشان النقط تضاف لرصيد الشلة!'
        );
    ELSE
        -- وصلنا للحد الأدنى
        INSERT INTO squad_chat_messages (squad_id, challenge_id, text)
        VALUES (
            v_squad_id,
            NEW.challenge_id,
            '✅ تمام! وصلنا للحد الأدنى. مستنيين باقي الأعضاء أو انتهاء الوقت.'
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


-- 3. دالة إنهاء التحدي (مبسطة - بدون فحص التكرار)
-- ============================================

DROP FUNCTION IF EXISTS finalize_squad_challenge(UUID);

CREATE OR REPLACE FUNCTION finalize_squad_challenge(p_challenge_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_squad_id UUID;
    v_member_count INTEGER;
    v_solve_count INTEGER;
    v_required_count INTEGER;
    v_success_threshold INTEGER := 50;
    v_squad_points INTEGER;
    v_avg_score NUMERIC;
    v_is_success BOOLEAN;
    v_all_solved BOOLEAN;
    v_participant RECORD;
    v_personal_bonus INTEGER;
    v_current_status TEXT;
BEGIN
    -- التحقق من حالة التحدي
    SELECT status, squad_id INTO v_current_status, v_squad_id
    FROM squad_exam_challenges
    WHERE id = p_challenge_id;

    -- لو التحدي مش نشط، متعملش حاجة
    IF v_current_status != 'active' THEN
        RETURN;
    END IF;

    -- قراءة الإعدادات
    BEGIN
        SELECT (value->>'success_threshold')::INTEGER INTO v_success_threshold
        FROM app_configs
        WHERE key = 'squad_settings';
    EXCEPTION WHEN OTHERS THEN
        v_success_threshold := 50;
    END;

    -- حساب الأعداد
    SELECT COUNT(*) INTO v_member_count 
    FROM squad_members 
    WHERE squad_id = v_squad_id;

    SELECT COUNT(*) INTO v_solve_count 
    FROM challenge_participations 
    WHERE challenge_id = p_challenge_id;

    v_required_count := CEIL(v_member_count * v_success_threshold / 100.0);
    v_is_success := (v_solve_count >= v_required_count);
    v_all_solved := (v_solve_count >= v_member_count);

    -- حساب متوسط الدرجات
    SELECT COALESCE(AVG(score), 0) INTO v_avg_score
    FROM challenge_participations
    WHERE challenge_id = p_challenge_id;

    -- 1. إضافة نقاط للشلة (لو نجح التحدي)
    IF v_is_success THEN
        v_squad_points := FLOOR(v_avg_score * 2);
        
        UPDATE squads
        SET points = COALESCE(points, 0) + v_squad_points
        WHERE id = v_squad_id;
    END IF;

    -- 2. توزيع البونص الشخصي على المشاركين
    -- بما أن الـ UNIQUE constraint بيمنع التكرار، كل مشارك هنا أول مرة يشارك
    FOR v_participant IN 
        SELECT profile_id FROM challenge_participations WHERE challenge_id = p_challenge_id
    LOOP
        v_personal_bonus := 0;
        
        -- بونص النجاح: +3 نقط
        IF v_is_success THEN
            v_personal_bonus := v_personal_bonus + 3;
        END IF;
        
        -- بونص الإكمال: +5 نقط (لو كل الأعضاء حلوا)
        IF v_all_solved THEN
            v_personal_bonus := v_personal_bonus + 5;
        END IF;
        
        -- إضافة البونص للحساب الشخصي
        IF v_personal_bonus > 0 THEN
            UPDATE profiles
            SET points = COALESCE(points, 0) + v_personal_bonus
            WHERE id = v_participant.profile_id;
        END IF;
    END LOOP;

    -- 3. تحديث حالة التحدي
    UPDATE squad_exam_challenges
    SET status = 'completed'
    WHERE id = p_challenge_id;

    -- 4. إرسال رسالة النتيجة النهائية
    IF v_is_success THEN
        IF v_all_solved THEN
            INSERT INTO squad_chat_messages (squad_id, challenge_id, text)
            VALUES (
                v_squad_id,
                p_challenge_id,
                '🔥 إنجاز أسطوري! كل الأعضاء حلوا الامتحان!' || E'\n' ||
                '🎁 اتضاف ' || v_squad_points || ' نقطة لرصيد الشلة' || E'\n' ||
                '💰 كل واحد خد بونص 8 نقط (3 نجاح + 5 إكمال)'
            );
        ELSE
            INSERT INTO squad_chat_messages (squad_id, challenge_id, text)
            VALUES (
                v_squad_id,
                p_challenge_id,
                '🎉 عااااش! التحدي نجح!' || E'\n' ||
                '🎁 اتضاف ' || v_squad_points || ' نقطة لرصيد الشلة' || E'\n' ||
                '💰 كل مشارك خد بونص 3 نقط'
            );
        END IF;
    ELSE
        INSERT INTO squad_chat_messages (squad_id, challenge_id, text)
        VALUES (
            v_squad_id,
            p_challenge_id,
            '😔 للأسف التحدي فشل. كان لازم ' || v_required_count || ' على الأقل يحلوا.' || E'\n' ||
            'المرة الجاية هنعملها! 💪'
        );
    END IF;
END;
$$;


-- 4. Trigger لمنع التحديات المتعددة
-- ============================================

CREATE OR REPLACE FUNCTION prevent_multiple_challenges()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_active_count INTEGER;
BEGIN
    -- التحقق من وجود تحدي نشط في نفس الشلة
    SELECT COUNT(*) INTO v_active_count
    FROM squad_exam_challenges
    WHERE squad_id = NEW.squad_id
      AND status = 'active'
      AND id != NEW.id;

    IF v_active_count > 0 THEN
        RAISE EXCEPTION 'في تحدي نشط حالياً. لازم ينتهي الأول قبل ما تبدأ تحدي جديد.';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_multiple_challenges_trigger ON squad_exam_challenges;

CREATE TRIGGER prevent_multiple_challenges_trigger
    BEFORE INSERT ON squad_exam_challenges
    FOR EACH ROW
    EXECUTE FUNCTION prevent_multiple_challenges();


-- 5. دالة إنهاء يدوي (للزرار)
-- ============================================

CREATE OR REPLACE FUNCTION end_challenge_manually(p_challenge_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_squad_id UUID;
    v_user_id UUID;
    v_is_admin BOOLEAN;
BEGIN
    v_user_id := auth.uid();
    
    -- التحقق من الصلاحيات (أدمن أو منشئ التحدي)
    SELECT 
        sec.squad_id,
        (sec.created_by = v_user_id OR p.role = 'admin')
    INTO v_squad_id, v_is_admin
    FROM squad_exam_challenges sec
    LEFT JOIN profiles p ON p.id = v_user_id
    WHERE sec.id = p_challenge_id;

    IF NOT v_is_admin THEN
        RETURN jsonb_build_object('success', false, 'error', 'غير مصرح لك بإنهاء هذا التحدي');
    END IF;

    -- إنهاء التحدي
    PERFORM finalize_squad_challenge(p_challenge_id);

    RETURN jsonb_build_object('success', true, 'message', 'تم إنهاء التحدي بنجاح');
END;
$$;
