// ============================================
// نظام الأفاتارات الجاهزة
// ============================================

export const AVATAR_STYLES = {
    avataaars: 'أفاتارات كرتونية',
    bottts: 'روبوتات ملونة',
    personas: 'وجوه بسيطة',
    initials: 'الحروف الأولى'
};

// توليد أفاتار من DiceBear
export function generateAvatar(seed, style = 'avataaars') {
    if (style === 'initials') {
        // استخدام UI Avatars للحروف الأولى
        const name = encodeURIComponent(seed);
        return `https://ui-avatars.com/api/?name=${name}&background=03A9F4&color=fff&size=200&bold=true&font-size=0.4`;
    }

    // استخدام DiceBear للأنماط الأخرى
    const encodedSeed = encodeURIComponent(seed);
    return `https://api.dicebear.com/7.x/${style}/svg?seed=${encodedSeed}`;
}

// توليد مجموعة من الأفاتارات الجاهزة للاختيار
export function generateAvatarOptions(userName, count = 12) {
    const options = [];
    const styles = ['avataaars', 'bottts', 'personas'];

    // أفاتار بالاسم الحقيقي
    options.push({
        id: 'user-name',
        url: generateAvatar(userName, 'avataaars'),
        label: 'أفاتارك الشخصي'
    });

    // أفاتار بالحروف الأولى
    options.push({
        id: 'initials',
        url: generateAvatar(userName, 'initials'),
        label: 'الحروف الأولى'
    });

    // أفاتارات عشوائية
    for (let i = 0; i < count - 2; i++) {
        const style = styles[i % styles.length];
        const seed = `${userName}-${i}`;
        options.push({
            id: `avatar-${i}`,
            url: generateAvatar(seed, style),
            label: `خيار ${i + 1}`
        });
    }

    return options;
}

// الإعدادات الأساسية للمستويات (عشان نغير في مكان واحد بس)
export const LEVEL_MULTIPLIER = 25;       // المعامل الشخصي
export const SQUAD_LEVEL_MULTIPLIER = 50; // معامل الشلة

// 1. المستويات الشخصية (المعامل 25)

// المستوى 1: 25 نقطة.
// المستوى 2: 100 نقطة.
// المستوى 3: 225 نقطة.
// المستوى 4 (نشط 🌟): 400 نقطة.
// المستوى 5: 625 نقطة.
// المستوى 7 (متقدم ⭐): 1,225 نقطة.
// المستوى 10 (الماسة 💎): 2,500 نقطة.
// المستوى 15 (المحترف 🏆): 5,625 نقطة.
// المستوى 20 (البطل 👑): 10,000 نقطة.
// المستوى 25 (الأسطورة 🔥): 15,625 نقطة.
// 2. مستويات الشلة (المعامل 50)

// بما أن أعضاء الشلة (حتى 10 أفراد) يجمعون النقاط سوياً، فالأرقام مضاعفة:

// المستوى 1: 50 نقطة.
// المستوى 2: 200 نقطة.
// المستوى 3: 450 نقطة.
// المستوى 4: 800 نقطة.
// المستوى 5: 1,250 نقطة.
// المستوى 10: 5,000 نقطة.
// المستوى 15: 11,250 نقطة.
// المستوى 20: 20,000 نقطة.

// حساب المستوى من النقاط
export function calculateLevel(points) {
    return Math.floor(Math.sqrt(Math.max(points || 0, 0) / LEVEL_MULTIPLIER));
}

// حساب مستوى الشلة
export function calculateSquadLevel(points) {
    return Math.floor(Math.sqrt(Math.max(points || 0, 0) / SQUAD_LEVEL_MULTIPLIER));
}

// الحصول على لون المستوى (نظام التدرج الطبيعي - 7 رتب)
export function getLevelColor(level) {
    if (level >= 25) return '#dc2626'; // أحمر داكن - أسطوري 🔥
    if (level >= 20) return '#f97316'; // برتقالي - بطل 👑
    if (level >= 15) return '#eab308'; // ذهبي - محترف 🏆
    if (level >= 10) return '#22c55e'; // أخضر - متفوق 💎
    if (level >= 7) return '#3b82f6'; // أزرق - متقدم ⭐
    if (level >= 4) return '#8b5cf6'; // بنفسجي - نشط 🌟
    return '#94a3b8';                  // رمادي - مبتدئ 🔰
}

// الحصول على أيقونة المستوى
export function getLevelBadge(level) {
    if (level >= 25) return '🔥'; // شعلة أسطورية
    if (level >= 20) return '👑'; // تاج ذهبي
    if (level >= 15) return '🏆'; // كأس
    if (level >= 10) return '💎'; // ماسة
    if (level >= 7) return '⭐'; // نجمة
    if (level >= 4) return '🌟'; // نجمة لامعة
    return '🔰';                  // مبتدئ
}

// حساب النقاط المطلوبة للمستوى التالي
export function getPointsForNextLevel(currentPoints) {
    const currentLevel = calculateLevel(currentPoints);
    const nextLevel = currentLevel + 1;
    const pointsNeeded = Math.pow(nextLevel, 2) * LEVEL_MULTIPLIER;
    return pointsNeeded - currentPoints;
}

// نسبة التقدم للمستوى التالي
export function getLevelProgress(currentPoints) {
    const currentLevel = calculateLevel(currentPoints);
    const currentLevelPoints = Math.pow(currentLevel, 2) * LEVEL_MULTIPLIER;
    const nextLevelPoints = Math.pow(currentLevel + 1, 2) * LEVEL_MULTIPLIER;

    // تجنب القسمة على صفر
    const range = nextLevelPoints - currentLevelPoints;
    if (range === 0) return 0;

    const progress = ((currentPoints - currentLevelPoints) / range) * 100;
    return Math.min(Math.max(progress, 0), 100);
}
