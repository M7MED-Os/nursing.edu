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
    CACHE_TIME_PROFILE: 3, // 3 minutes for faster activation/expiry sync
    CACHE_TIME_STATS: 1440, // 24 hours
    ACTIVE_CHECK_INTERVAL: 60000, // 1 minute
};
