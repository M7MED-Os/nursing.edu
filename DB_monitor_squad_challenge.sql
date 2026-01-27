
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
    -- أولاً: فحص وإنهاء أي تحديات منتهية (فحص ذكي عند كل مشاركة)
    FOR v_expired_challenge IN 
        SELECT id FROM squad_exam_challenges
        WHERE status = 'active' AND expires_at < NOW()
    LOOP
        PERFORM finalize_squad_challenge(v_expired_challenge.id);
    END LOOP;

    -- قراءة النسبة المطلوبة من الإعدادات
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

    SELECT COUNT(DISTINCT profile_id) INTO v_solve_count 
    FROM challenge_participations 
    WHERE challenge_id = NEW.challenge_id;

    v_required_count := CEIL(v_member_count * v_success_threshold / 100.0);
    v_remaining_count := v_required_count - v_solve_count;

    -- التحقق من الحالة
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
            '✅ تمام! وصلنا للحد الأدنى. مستنيين باقي الشلة أو او الوقت يخلص.'
        );
    END IF;

    RETURN NEW;
END;
