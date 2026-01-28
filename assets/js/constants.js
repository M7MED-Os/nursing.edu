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
    CACHE_VERSION: 'v2.2', // Changing this clears local caches for all users
    // OLD: CACHE_TIME_PROFILE: 5, // 5 minutes
    CACHE_TIME_PROFILE: 1, // 1 minute
    // OLD: CACHE_TIME_STATS: 10,  // Reduced from 6h to 10m for better sync
    CACHE_TIME_STATS: 1,  // Reduced to 1m for better sync
    CACHE_TIME_SUBJECTS: 1440,
    CACHE_TIME_SUBJECT_CONTENT: 10,
    CACHE_TIME_LECTURES: 60,
    CACHE_TIME_ANNOUNCEMENTS: 3,
    CACHE_TIME_QUESTIONS: 3,
    CACHE_TIME_LEADERBOARD: 1,
    ACTIVE_CHECK_INTERVAL: 60000,
};

