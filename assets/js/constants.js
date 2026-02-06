// ========================================
// UNIFIED SCHEMA CONSTANTS
// All values use new text-based schema
// ========================================

// Academic Years (unified - text only)
export const ACADEMIC_YEARS = {
    "first_year": "الفرقة الأولى",
    "second_year": "الفرقة الثانية",
    "third_year": "الفرقة الثالثة",
    "fourth_year": "الفرقة الرابعة"
};

// Terms (unified - text only)
export const TERMS = {
    "first_term": "الترم الأول",
    "second_term": "الترم الثاني"
};

// Departments (unified - text only)
export const DEPARTMENTS = {
    "general": "عام",
    "pediatric": "أطفال",
    "maternity": "نسا وتوليد",
    "psychiatric": "نفسية",
    "community": "إدارة"
};

// ========================================
// APP CONFIGURATION
// ========================================

export const APP_CONFIG = {
    CACHE_VERSION: 'v3.3', // Incremented for Phase 2 cleanup
    CACHE_TIME_PROFILE: 1, // 1 minute
    CACHE_TIME_STATS: 1,  // 1 minute for better sync
    CACHE_TIME_SUBJECTS: 1440, // 24 hours (static content)
    CACHE_TIME_SUBJECT_CONTENT: 60, // 1 hour
    CACHE_TIME_LECTURES: 1440, // 24 hours
    CACHE_TIME_ANNOUNCEMENTS: 3, // 3 minutes
    CACHE_TIME_QUESTIONS: 3, // 3 minutes
    CACHE_TIME_LEADERBOARD: 1, // 1 minute
    CACHE_TIME_EXAMS: 60, // 1 hour
    CACHE_TIME_APP_CONFIGS: 1440, // 24 hours
    ACTIVE_CHECK_INTERVAL: 60000,
};

// ========================================
// HELPER FUNCTIONS
// ========================================

// Get display name for academic year
export function getAcademicYearLabel(value) {
    return ACADEMIC_YEARS[value] || value;
}

// Get display name for term
export function getTermLabel(value) {
    return TERMS[value] || value;
}

// Get display name for department
export function getDepartmentLabel(value) {
    return DEPARTMENTS[value] || value;
}
