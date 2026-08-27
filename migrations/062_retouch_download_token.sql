-- A login-free download link for a retouched file.
--
-- A retouch is delivered into a chat, and a chat compresses pictures: what
-- lands is not the 4K file the customer paid extra for. The main shoot already
-- solves this with shoot_images.download_token and /d/<token>; the retouched
-- copy had no equivalent, so the best version of the work was the one nobody
-- could actually get.
--
-- The token is minted only after payment clears. See app/d/[token]/ — every
-- route there refuses a retouched file whose order is neither paid nor free.
ALTER TABLE shoot_retouched_images
  ADD COLUMN IF NOT EXISTS download_token text;

CREATE UNIQUE INDEX IF NOT EXISTS shoot_retouched_images_token_idx
  ON shoot_retouched_images (download_token)
  WHERE download_token IS NOT NULL;
