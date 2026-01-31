export const GRADES = {
    "1": "الفرقة الأولى",
    "2": "الفرقة الثانية",
    "3": "الفرقة الثالثة",
    "4": "الفرقة الرابعة"
};

export const TERMS = {
    "1": "الترم الأول",
    "2": "الترم الثاني"
};

export const STREAMS = {
    "pediatric": "تمريض الأطفال",
    "obs_gyn": "تمريض نسا و التوليد",
    "nursing_admin": "إدارة التمريض",
    "psychiatric": "تمريض النفسية"
};

export const GRADE_STREAMS = {
    "3": ["pediatric", "obs_gyn"],
    "4": ["nursing_admin", "psychiatric"]
};

export const APP_CONFIG = {
    CACHE_VERSION: 'v2.9', // Changing this clears local caches for all users
    CACHE_TIME_PROFILE: 1, // 1 minute
    CACHE_TIME_STATS: 1,  // 1 minute for better sync
    CACHE_TIME_SUBJECTS: 1440, // 24 hours (static content)
    CACHE_TIME_SUBJECT_CONTENT: 60, // 1 hour (was 10 min) - content rarely changes
    CACHE_TIME_LECTURES: 1440, // 24 hours (was 60 min) - static content
    CACHE_TIME_ANNOUNCEMENTS: 3, // 3 minutes
    CACHE_TIME_QUESTIONS: 3, // 3 minutes
    CACHE_TIME_LEADERBOARD: 1, // 1 minute
    CACHE_TIME_EXAMS: 60, // 1 hour - new cache for exam lists
    CACHE_TIME_APP_CONFIGS: 1440, // 24 hours - new cache for app configs
    ACTIVE_CHECK_INTERVAL: 60000,
};

