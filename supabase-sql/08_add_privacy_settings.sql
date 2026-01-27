-- ============================================
-- Privacy Settings for Profiles and Squads
-- ============================================
-- إضافة إعدادات الخصوصية للبروفايلات والشلل
-- ============================================

-- Add privacy columns to profiles table
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS privacy_avatar TEXT DEFAULT 'public' CHECK (privacy_avatar IN ('public', 'squad', 'private')),
ADD COLUMN IF NOT EXISTS privacy_bio TEXT DEFAULT 'public' CHECK (privacy_bio IN ('public', 'squad', 'private')),
ADD COLUMN IF NOT EXISTS privacy_stats TEXT DEFAULT 'public' CHECK (privacy_stats IN ('public', 'squad', 'private')),
ADD COLUMN IF NOT EXISTS privacy_progress TEXT DEFAULT 'public' CHECK (privacy_progress IN ('public', 'squad', 'private')),
ADD COLUMN IF NOT EXISTS privacy_squad TEXT DEFAULT 'public' CHECK (privacy_squad IN ('public', 'squad', 'private'));

-- Add privacy columns to squads table
ALTER TABLE squads
ADD COLUMN IF NOT EXISTS privacy_avatar TEXT DEFAULT 'public' CHECK (privacy_avatar IN ('public', 'members', 'private')),
ADD COLUMN IF NOT EXISTS privacy_bio TEXT DEFAULT 'public' CHECK (privacy_bio IN ('public', 'members', 'private')),
ADD COLUMN IF NOT EXISTS privacy_stats TEXT DEFAULT 'public' CHECK (privacy_stats IN ('public', 'members', 'private')),
ADD COLUMN IF NOT EXISTS privacy_members TEXT DEFAULT 'public' CHECK (privacy_members IN ('public', 'members', 'private')),
ADD COLUMN IF NOT EXISTS privacy_progress TEXT DEFAULT 'public' CHECK (privacy_progress IN ('public', 'members', 'private'));

-- Add comments for documentation
COMMENT ON COLUMN profiles.privacy_avatar IS 'Avatar visibility: public (everyone), squad (squad members only), private (only me)';
COMMENT ON COLUMN profiles.privacy_bio IS 'Bio visibility: public (everyone), squad (squad members only), private (only me)';
COMMENT ON COLUMN profiles.privacy_stats IS 'Stats visibility: public (everyone), squad (squad members only), private (only me)';
COMMENT ON COLUMN profiles.privacy_progress IS 'Level progress visibility: public (everyone), squad (squad members only), private (only me)';
COMMENT ON COLUMN profiles.privacy_squad IS 'Squad visibility: public (everyone), squad (squad members only), private (only me)';

COMMENT ON COLUMN squads.privacy_avatar IS 'Squad avatar visibility: public (everyone), members (members only), private (owner only)';
COMMENT ON COLUMN squads.privacy_bio IS 'Squad bio visibility: public (everyone), members (members only), private (owner only)';
COMMENT ON COLUMN squads.privacy_stats IS 'Squad stats visibility: public (everyone), members (members only), private (owner only)';
COMMENT ON COLUMN squads.privacy_members IS 'Members list visibility: public (everyone), members (members only), private (owner only)';
COMMENT ON COLUMN squads.privacy_progress IS 'Squad level progress visibility: public (everyone), members (members only), private (owner only)';
