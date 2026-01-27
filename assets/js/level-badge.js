// ============================================
// Level Badge Component
// ============================================
// عرض المستوى كـ Badge ملون جنب اسم الطالب/الشلة
// ============================================

import { calculateLevel, getLevelColor, getLevelBadge } from './avatars.js';

/**
 * إنشاء HTML للـ Level Badge (دايرة صغيرة بالرقم فقط - زي الألعاب)
 * @param {number} points - النقاط
 * @param {string} size - الحجم: 'small', 'medium', 'large'
 * @returns {string} HTML
 */
export function createLevelBadge(points, size = 'small') {
    const level = calculateLevel(points);
    const color = getLevelColor(level);

    const sizes = {
        small: { width: '28px', height: '28px', fontSize: '0.75rem' },
        medium: { width: '36px', height: '36px', fontSize: '0.9rem' },
        large: { width: '44px', height: '44px', fontSize: '1.1rem' }
    };

    const s = sizes[size];

    return `
        <div class="level-badge-circle" style="
            width: ${s.width};
            height: ${s.height};
            border-radius: 50%;
            background: ${color};
            color: white;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            font-size: ${s.fontSize};
            font-weight: 900;
            box-shadow: 0 2px 8px ${color}60;
            border: 2px solid white;
        ">
            ${level}
        </div>
    `;
}

/**
 * إنشاء HTML للأفاتار مع Border ملون حسب المستوى + دايرة المستوى
 * @param {string} avatarUrl - رابط الصورة
 * @param {number} points - النقاط
 * @param {string} size - الحجم بالـ px
 * @param {boolean} showLevel - عرض دايرة المستوى
 * @returns {string} HTML
 */
export function createLevelAvatar(avatarUrl, points, size = '70px', showLevel = true) {
    const level = calculateLevel(points);
    const color = getLevelColor(level);
    const levelBadgeSize = parseInt(size) > 80 ? 'medium' : 'small';

    return `
        <div class="level-avatar" style="
            position: relative;
            width: ${size};
            height: ${size};
        ">
            <img src="${avatarUrl}" alt="Avatar" style="
                width: 100%;
                height: 100%;
                border-radius: 50%;
                object-fit: cover;
                border: 4px solid ${color};
                box-shadow: 0 4px 12px ${color}40;
            ">
            ${showLevel ? `
                <div style="
                    position: absolute;
                    bottom: 0;
                    left: 0;
                    z-index: 10;
                    filter: drop-shadow(0 2px 4px rgba(0,0,0,0.2));
                ">
                    ${createLevelBadge(points, levelBadgeSize)}
                </div>
            ` : ''}
        </div>
    `;
}

/**
 * إنشاء HTML لشريط التقدم للمستوى التالي
 * @param {number} currentPoints - النقاط الحالية
 * @returns {string} HTML
 */
export function createLevelProgress(currentPoints) {
    const currentLevel = calculateLevel(currentPoints);
    const currentLevelPoints = Math.pow(currentLevel, 2) * 5;
    const nextLevelPoints = Math.pow(currentLevel + 1, 2) * 5;
    const progress = ((currentPoints - currentLevelPoints) / (nextLevelPoints - currentLevelPoints)) * 100;
    const progressClamped = Math.min(Math.max(progress, 0), 100);
    const pointsNeeded = nextLevelPoints - currentPoints;
    const color = getLevelColor(currentLevel);

    return `
        <div class="level-progress" style="margin-top: 8px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                <span style="font-size: 0.75rem; color: #64748b; font-weight: 600;">
                    التقدم للمستوى ${currentLevel + 1}
                </span>
                <span style="font-size: 0.75rem; color: ${color}; font-weight: 700;">
                    ${pointsNeeded} نقطة متبقية
                </span>
            </div>
            <div style="
                width: 100%;
                height: 8px;
                background: #e2e8f0;
                border-radius: 10px;
                overflow: hidden;
            ">
                <div style="
                    width: ${progressClamped}%;
                    height: 100%;
                    background: linear-gradient(90deg, ${color} 0%, ${color}cc 100%);
                    border-radius: 10px;
                    transition: width 0.3s ease;
                "></div>
            </div>
        </div>
    `;
}

/**
 * إنشاء كارت كامل للمستوى (للبروفايل)
 * @param {number} points - النقاط
 * @param {string} userName - اسم المستخدم
 * @returns {string} HTML
 */
export function createLevelCard(points, userName) {
    const level = calculateLevel(points);
    const color = getLevelColor(level);
    const emoji = getLevelBadge(level);

    return `
        <div class="level-card" style="
            background: linear-gradient(135deg, ${color}15 0%, ${color}05 100%);
            border: 2px solid ${color}40;
            border-radius: 16px;
            padding: 1.5rem;
            margin-bottom: 1.5rem;
        ">
            <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem;">
                <div style="
                    font-size: 3rem;
                    width: 60px;
                    height: 60px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: ${color}20;
                    border-radius: 50%;
                ">
                    ${emoji}
                </div>
                <div>
                    <h3 style="margin: 0; color: ${color}; font-size: 1.5rem; font-weight: 800;">
                        المستوى ${level}
                    </h3>
                    <p style="margin: 0; color: #64748b; font-size: 0.9rem;">
                        ${points} نقطة إجمالي
                    </p>
                </div>
            </div>
            ${createLevelProgress(points)}
        </div>
    `;
}
