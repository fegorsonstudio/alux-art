-- Retouching: hand-finished versions of images a buyer already generated.
--
-- Sold per image on top of a finished shoot. The studio retouches by hand in
-- Photoshop, uploads the results, and the buyer gets an email; the files sit in
-- a second gallery inside the same shoot and unlock when the retouch is paid
-- for.
--
-- WHY TWO NEW TABLES INSTEAD OF ROWS IN shoot_images.
--
-- shoot_images is read without a `kind` filter in the places that matter — the
-- shoot API does `SELECT * FROM shoot_images WHERE shoot_id = $1`, and the
-- gallery, the progress count, the ZIP and the retry logic all work off that
-- result. A retouched row added there would appear as a sixth image in a
-- five-image shoot, be counted in progress, and be swept into the ZIP the buyer
-- has already paid for. Separate tables cannot do any of that: nothing existing
-- selects from them.
--
-- The retention cleanup is deliberately NOT extended here. It sweeps generated
-- output on a 7-day clock, and retouching is paid work delivered days after the
-- shoot — the two clocks are different and want a decision of their own.

CREATE TABLE IF NOT EXISTS shoot_retouch (
  shoot_id           uuid PRIMARY KEY REFERENCES shoots(id) ON DELETE CASCADE,
  -- REQUESTED once the buyer asks, DELIVERED once files are uploaded. The
  -- studio does the work between those two, by hand.
  status             text NOT NULL DEFAULT 'REQUESTED',
  -- What this retouch costs, fixed at the price in force when it was ordered so
  -- a later price change cannot alter a bill the buyer already agreed to.
  price_ngn          integer NOT NULL DEFAULT 0,
  image_count        integer NOT NULL DEFAULT 0,
  -- Either of these opens the download. `free` is for comped work: a trial, an
  -- apology, a sample. It is recorded rather than faked as a payment so the
  -- revenue figures stay honest.
  paid               boolean NOT NULL DEFAULT false,
  free               boolean NOT NULL DEFAULT false,
  paystack_reference text,
  delivered_at       timestamptz,
  paid_at            timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS shoot_retouched_images (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shoot_id        uuid NOT NULL REFERENCES shoots(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL,
  -- Which generated image this is a retouch of, where that is known. Nullable
  -- because the studio may deliver a file that does not map to one slot.
  slot            integer,
  storage_bucket  text NOT NULL,
  storage_path    text NOT NULL,
  file_size       bigint,
  width           integer,
  height          integer,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS shoot_retouched_images_shoot_idx
  ON shoot_retouched_images (shoot_id, slot);

-- One upload of the same file twice would show the buyer a duplicate tile.
CREATE UNIQUE INDEX IF NOT EXISTS shoot_retouched_images_path_key
  ON shoot_retouched_images (shoot_id, storage_path);
