export const GRADES = {
    // Old format (numeric)
    "1": "الفرقة الأولى",
    "2": "الفرقة الثانية",
    "3": "الفرقة الثالثة",
    "4": "الفرقة الرابعة",
    // New format (text)
    "first_year": "الفرقة الأولى",
    "second_year": "الفرقة الثانية",
    "third_year": "الفرقة الثالثة",
    "fourth_year": "الفرقة الرابعة"
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

// Squad-specific mappings (use database values)
export const SQUAD_YEARS = {
    "first_year": "الفرقة الأولى",
    "second_year": "الفرقة الثانية",
    "third_year": "الفرقة الثالثة",
    "fourth_year": "الفرقة الرابعة"
};

export const SQUAD_DEPARTMENTS = {
    "general": "عام",
    "medical_surgical": "باطني جراحي",
    "pediatric": "أطفال",
    "obs_gyn": "أمومة وطفولة",
    "maternity": "أمومة وطفولة",
    "psychiatric": "نفسي",
    "community": "مجتمع"
};

// Profile to Squad year mapping
export const PROFILE_TO_SQUAD_YEAR = {
    "1": "first_year",
    "2": "second_year",
    "3": "third_year",
    "4": "fourth_year"
};

// Reverse mapping for database queries (subjects table uses numeric 'grade')
export const YEAR_TO_GRADE = {
    "first_year": "1",
    "second_year": "2",
    "third_year": "3",
    "fourth_year": "4"
};


export const GRADE_STREAMS = {
    "3": ["pediatric", "obs_gyn"],
    "4": ["nursing_admin", "psychiatric"]
};

export const APP_CONFIG = {
    CACHE_VERSION: 'v3.1', // Changing this clears local caches for all users
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

