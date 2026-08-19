-- Choosing which images get retouched.
--
-- The first cut billed the whole shoot: ask for retouching and every finished
-- image was in, at 1,000 naira each. That was fine when a five-image shoot had
-- five images. It stops being fine the moment a buyer only wants their best two,
-- and it stops making sense entirely once every photo comes back twice — once
-- from each model — because then "all of them" means paying to retouch a version
-- they were never going to use.
--
-- So the selection becomes explicit and stored, rather than a count that has to
-- be taken on trust.
--
-- BACKWARD COMPATIBILITY MATTERS HERE. One order already exists and is already
-- delivered (a free trial, five images). It has no rows in this table and must
-- keep working exactly as it does today. Everything that reads the selection
-- therefore treats "no rows" as "the whole shoot", which is what that order
-- meant when it was made. Nothing backfills it — inventing rows for a delivered
-- order would be rewriting history to match a schema that came later.

CREATE TABLE IF NOT EXISTS shoot_retouch_items (
  shoot_id   uuid NOT NULL REFERENCES shoots(id) ON DELETE CASCADE,
  -- The generated image this retouch was ordered for. Kept as a plain uuid
  -- rather than a foreign key into shoot_images: retention sweeps generated
  -- output on its own clock, and a paid retouch order must not be deleted from
  -- underneath the buyer because the source image aged out.
  image_id   uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (shoot_id, image_id)
);

CREATE INDEX IF NOT EXISTS shoot_retouch_items_shoot_idx
  ON shoot_retouch_items (shoot_id);
