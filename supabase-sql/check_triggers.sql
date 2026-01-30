-- Check all triggers on squad_exam_challenges table
SELECT 
    tgname as trigger_name,
    tgtype,
    tgenabled
FROM pg_trigger
WHERE tgrelid = 'squad_exam_challenges'::regclass
AND tgname NOT LIKE 'RI_%'; -- Exclude foreign key triggers
