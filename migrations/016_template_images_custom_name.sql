-- Add custom_name column to template_images for labeled tagged references
ALTER TABLE template_images ADD COLUMN IF NOT EXISTS custom_name text;
