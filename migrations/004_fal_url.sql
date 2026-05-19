-- Add fal_url column to shoot_images so preview display can use the fal.ai CDN URL directly,
-- bypassing Supabase Storage egress for gallery views.
ALTER TABLE shoot_images ADD COLUMN IF NOT EXISTS fal_url TEXT;
