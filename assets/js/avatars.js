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

// حساب المستوى من النقاط
export function calculateLevel(points) {
    return Math.floor(Math.sqrt(Math.max(points || 0, 0) / 5));
}

// حساب مستوى الشلة
export function calculateSquadLevel(points) {
    return Math.floor(Math.sqrt(Math.max(points || 0, 0) / 10));
}

// الحصول على لون المستوى
export function getLevelColor(level) {
    if (level >= 10) return '#FFD700'; // ذهبي
    if (level >= 7) return '#8B5CF6';  // بنفسجي
    if (level >= 4) return '#03A9F4';  // أزرق
    return '#94A3B8';                   // رمادي
}

// الحصول على أيقونة المستوى
export function getLevelBadge(level) {
    if (level >= 10) return '👑'; // تاج
    if (level >= 7) return '💎';  // ماسة
    if (level >= 4) return '⭐';  // نجمة
    return '🔰';                   // مبتدئ
}

// حساب النقاط المطلوبة للمستوى التالي
export function getPointsForNextLevel(currentPoints) {
    const currentLevel = calculateLevel(currentPoints);
    const nextLevel = currentLevel + 1;
    const pointsNeeded = Math.pow(nextLevel, 2) * 5;
    return pointsNeeded - currentPoints;
}

// نسبة التقدم للمستوى التالي
export function getLevelProgress(currentPoints) {
    const currentLevel = calculateLevel(currentPoints);
    const currentLevelPoints = Math.pow(currentLevel, 2) * 5;
    const nextLevelPoints = Math.pow(currentLevel + 1, 2) * 5;
    const progress = ((currentPoints - currentLevelPoints) / (nextLevelPoints - currentLevelPoints)) * 100;
    return Math.min(Math.max(progress, 0), 100);
}
