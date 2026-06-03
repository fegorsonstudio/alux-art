-- Creator waitlist status
ALTER TABLE creators ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending';

-- Set existing active creators to approved so they keep access
UPDATE creators SET status = 'approved' WHERE is_active = true AND status = 'pending';

-- WhatsApp Business Cloud API columns
ALTER TABLE creators ADD COLUMN IF NOT EXISTS whatsapp_phone_number_id text;
ALTER TABLE creators ADD COLUMN IF NOT EXISTS whatsapp_access_token text;
ALTER TABLE creators ADD COLUMN IF NOT EXISTS whatsapp_verify_token text;

-- WhatsApp booking sessions
CREATE TABLE IF NOT EXISTS whatsapp_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid REFERENCES creators(id),
  customer_phone text NOT NULL,
  state text NOT NULL DEFAULT 'IDLE',
  template_id uuid,
  shoot_id uuid,
  selfie_count int DEFAULT 0,
  selfie_paths text[] DEFAULT '{}',
  inspiration_path text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(creator_id, customer_phone)
);
