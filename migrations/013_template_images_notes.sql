-- Add note field to template_images for creator styling direction per reference image
ALTER TABLE template_images ADD COLUMN IF NOT EXISTS note TEXT;
