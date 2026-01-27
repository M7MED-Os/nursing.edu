-- ============================================
-- Fix Avatars Storage RLS Policies
-- ============================================
-- This fixes the "new row violates row-level security policy" error
-- when uploading avatar images
-- ============================================

-- 1. Drop existing policies
DROP POLICY IF EXISTS "Allow authenticated users to upload avatars" ON storage.objects;
DROP POLICY IF EXISTS "Allow public read access to avatars" ON storage.objects;
DROP POLICY IF EXISTS "Allow users to update their own avatars" ON storage.objects;
DROP POLICY IF EXISTS "Allow users to delete their own avatars" ON storage.objects;

-- 2. Create new comprehensive policies

-- Allow INSERT (upload) for authenticated users
CREATE POLICY "Allow authenticated users to upload avatars"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'avatars');

-- Allow SELECT (read) for everyone (public access)
CREATE POLICY "Allow public read access to avatars"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'avatars');

-- Allow UPDATE for authenticated users (for their own files)
CREATE POLICY "Allow users to update their own avatars"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'avatars')
WITH CHECK (bucket_id = 'avatars');

-- Allow DELETE for authenticated users (for their own files)
CREATE POLICY "Allow users to delete their own avatars"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'avatars');

-- ============================================
-- Verify bucket exists and is public
-- ============================================

-- Make sure the bucket is public
UPDATE storage.buckets
SET public = true
WHERE id = 'avatars';
