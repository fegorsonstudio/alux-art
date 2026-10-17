-- Road tiles for Bounty Run (2026-10-17): the real streets around a point,
-- fetched once from OpenStreetMap's Overpass API and kept, so a race never
-- waits on Overpass twice and never depends on it being up. Keyed by the
-- centre rounded to about 100 m. Refreshed when older than 30 days.
--
-- Apply on the VPS by hand:  psql "$DATABASE_URL" -f migrations/075_road_tiles.sql

CREATE TABLE IF NOT EXISTS road_tiles (
  key        text PRIMARY KEY,
  lat        double precision NOT NULL,
  lng        double precision NOT NULL,
  radius_m   int NOT NULL,
  data       jsonb NOT NULL,
  roads      int NOT NULL DEFAULT 0,
  buildings  int NOT NULL DEFAULT 0,
  fetched_at timestamptz NOT NULL DEFAULT now()
);
