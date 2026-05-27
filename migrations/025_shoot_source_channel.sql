-- Track which channel originated a shoot (web | whatsapp) and the customer phone
-- for WhatsApp-originated shoots.
ALTER TABLE shoots ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'web';
ALTER TABLE shoots ADD COLUMN IF NOT EXISTS customer_phone TEXT;
