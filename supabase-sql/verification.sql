-- Simplified verification script (returns actual table)
SELECT 
    'RPC: get_squad_by_prefix' as check_name,
    CASE 
        WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_squad_by_prefix') 
        THEN '✅ EXISTS' 
        ELSE '❌ MISSING' 
    END as status
UNION ALL
SELECT 
    'Trigger: prevent_multiple_challenges',
    CASE 
        WHEN EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'prevent_multiple_challenges') 
        THEN '✅ EXISTS' 
        ELSE '❌ MISSING' 
    END
UNION ALL
SELECT 
    'Indexes Created',
    '✅ ' || COUNT(*)::text || '/9 indexes'
FROM pg_indexes
WHERE schemaname = 'public'
AND indexname IN (
    'idx_results_user_exam',
    'idx_results_user_created',
    'idx_squad_members_squad',
    'idx_squad_chat_squad_time',
    'idx_todos_user_completed',
    'idx_announcements_active',
    'idx_squad_tasks_squad',
    'idx_exams_subject',
    'idx_lessons_chapter'
)
UNION ALL
SELECT 
    'RLS Policies on profiles',
    '✅ ' || COUNT(*)::text || ' policies'
FROM pg_policies
WHERE schemaname = 'public'
AND tablename = 'profiles';
