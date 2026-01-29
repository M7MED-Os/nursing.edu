// ============================================
// Level Badge Component
// ============================================
// عرض المستوى كـ Badge ملون جنب اسم الطالب/الشلة
// ============================================

import { getLevelColor, getLevelBadge, LEVEL_MULTIPLIER, SQUAD_LEVEL_MULTIPLIER, getLevelMetadata } from './avatars.js';

/**
 * تطبيق "ثيم" المستوى على عنصر معين باستخدام CSS Variables
 * بيخليك تستخدم var(--level-color) في الـ CSS بدال ما تغير كل شوية بالـ JS
 */
export function applyLevelTheme(element, points, multiplier = LEVEL_MULTIPLIER) {
    if (!element) return null;
    const meta = getLevelMetadata(points, multiplier);
    element.style.setProperty('--level-color', meta.color);
    element.style.setProperty('--level-next-color', meta.nextColor);
    element.style.setProperty('--level-shadow', `0 4px 15px ${meta.color}50`);
    return meta;
}

/**
 * الحصول على الـ style الموحد للبوردر والظل حسب النقاط
 * @param {number} points - النقاط
 * @param {string} borderWidth - عرض البوردر (مثل '3px', '5px')
 * @param {number} multiplier - المعامل (default: LEVEL_MULTIPLIER)
 * @returns {object} - كائن يحتوي على border و boxShadow
 */
export function getLevelBorderStyle(points, borderWidth = '3px', multiplier = LEVEL_MULTIPLIER) {
    const meta = getLevelMetadata(points, multiplier);
    return {
        border: `${borderWidth} solid ${meta.color}`,
        boxShadow: `0 4px 12px ${meta.color}40`,
        color: meta.color
    };
}

/**
 * نفس الـ function لكن للشلل
 */
export function getSquadLevelBorderStyle(points, borderWidth = '3px') {
    return getLevelBorderStyle(points, borderWidth, SQUAD_LEVEL_MULTIPLIER);
}

/**
 * إنشاء HTML للـ Level Badge (دايرة صغيرة بالرقم فقط - زي الألعاب)
 */
export function createLevelBadge(points, size = 'small', multiplier = LEVEL_MULTIPLIER) {
    const meta = getLevelMetadata(points, multiplier);
    const color = meta.color;

    const sizes = {
        xsmall: { width: '22px', height: '22px', fontSize: '0.65rem' },
        small: { width: '28px', height: '28px', fontSize: '0.75rem' },
        medium: { width: '36px', height: '36px', fontSize: '0.9rem' },
        large: { width: '44px', height: '44px', fontSize: '1.1rem' }
    };

    const s = sizes[size] || sizes.small;

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
            ${meta.level}
        </div>
    `;
}

/**
 * إنشاء بادج الشلة
 */
export function createSquadLevelBadge(points, size = 'small') {
    return createLevelBadge(points, size, SQUAD_LEVEL_MULTIPLIER);
}

/**
 * إنشاء HTML للأفاتار مع Border ملون حسب المستوى + دايرة المستوى
 */
export function createLevelAvatar(avatarUrl, points, size = '70px', showLevel = true, multiplier = LEVEL_MULTIPLIER) {
    const meta = getLevelMetadata(points, multiplier);
    const badgeSize = parseInt(size) > 80 ? 'medium' : parseInt(size) > 45 ? 'small' : 'xsmall';

    return `
        <div class="level-avatar" style="
            position: relative;
            width: ${size};
            height: ${size};
            --avatar-level-color: ${meta.color};
        ">
            <img src="${avatarUrl}" alt="Avatar" style="
                width: 100%;
                height: 100%;
                border-radius: 50%;
                object-fit: cover;
                border: 4px solid var(--avatar-level-color);
                box-shadow: 0 4px 12px ${meta.color}40;
            ">
            ${showLevel ? `
                <div style="
                    position: absolute;
                    bottom: 0;
                    left: 0;
                    z-index: 10;
                    filter: drop-shadow(0 2px 4px rgba(0,0,0,0.2));
                ">
                    ${createLevelBadge(points, badgeSize, multiplier)}
                </div>
            ` : ''}
        </div>
    `;
}

/**
 * إنشاء أفاتار الشلة
 */
export function createSquadLevelAvatar(avatarUrl, points, size = '70px', showLevel = true) {
    return createLevelAvatar(avatarUrl, points, size, showLevel, SQUAD_LEVEL_MULTIPLIER);
}

/**
 * إنشاء HTML لشريط التقدم للمستوى التالي
 * @param {number} currentPoints - النقاط الحالية
 * @returns {string} HTML
 */
export function createLevelProgress(currentPoints, multiplier = LEVEL_MULTIPLIER) {
    const meta = getLevelMetadata(currentPoints, multiplier);

    return `
        <div class="level-progress" style="margin-top: 8px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                <span style="font-size: 0.8rem; color: rgba(255,255,255,0.9); font-weight: 600;">
                    التقدم للمستوى ${meta.nextLevel}
                </span>
                <span style="font-size: 0.8rem; color: white; font-weight: 700; background: rgba(255,255,255,0.15); padding: 2px 8px; border-radius: 8px;">
                    ${meta.pointsNeeded} نقطة
                </span>
            </div>
            <div style="
                width: 100%;
                height: 10px;
                background: rgba(255,255,255,0.2);
                border-radius: 10px;
                overflow: hidden;
                box-shadow: inset 0 2px 4px rgba(0,0,0,0.1);
            ">
                <div style="
                    width: ${meta.progress}%;
                    height: 100%;
                    background: linear-gradient(90deg, ${meta.nextColor} 0%, ${meta.nextColor}dd 100%);
                    border-radius: 10px;
                    transition: width 0.3s ease;
                    box-shadow: 0 0 10px ${meta.nextColor}80;
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

/**
 * إنشاء HTML لشريط التقدم لمستوى الشلة
 * @param {number} currentPoints - النقاط الحالية
 * @returns {string} HTML
 */
export function createSquadLevelProgress(currentPoints) {
    const meta = getLevelMetadata(currentPoints, SQUAD_LEVEL_MULTIPLIER);

    return `
        <div class="level-progress-card" style="margin-top: 1.5rem; background: rgba(255,255,255,0.05); padding: 1.25rem; border-radius: 16px; border: 1px solid rgba(255,255,255,0.1);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
                <div style="display: flex; align-items: center; gap: 0.5rem;">
                    <span style="font-size: 1.1rem; color: #fbbf24;">
                        <i class="fas fa-crown"></i>
                    </span>
                    <span style="font-size: 0.95rem; color: rgba(255,255,255,0.9); font-weight: 700;">
                        المستوى ${meta.level}
                    </span>
                </div>
                <span style="font-size: 0.8rem; color: ${meta.nextColor}; font-weight: 700; background: rgba(255,255,255,0.1); padding: 4px 10px; border-radius: 20px;">
                    فاضل ${meta.pointsNeeded} نقطة
                </span>
            </div>
            
            <div style="position: relative; height: 16px; background: rgba(0,0,0,0.3); border-radius: 20px; overflow: hidden; box-shadow: inset 0 2px 4px rgba(0,0,0,0.2);">
                <div style="
                    width: ${meta.progress}%;
                    height: 100%;
                    background: linear-gradient(90deg, ${meta.color} 0%, ${meta.nextColor} 100%);
                    border-radius: 20px;
                    transition: width 1s ease-in-out;
                    box-shadow: 0 0 15px ${meta.nextColor}60;
                "></div>
            </div>
            
            <div style="display: flex; justify-content: space-between; margin-top: 0.5rem; font-size: 0.75rem; color: rgba(255,255,255,0.5); font-family: monospace;">
                <span>${meta.points} XP</span>
                <span>${meta.nextLevelPoints} XP</span>
            </div>
        </div>
    `;
}
