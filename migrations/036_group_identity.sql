-- Studio "Group picture" mode: the identity photo(s) contain more than one person
-- (e.g. a couple recreating an anniversary image). When true, the generation planner
-- preserves EACH person's identity and shows all of them together in every image.
ALTER TABLE shoots ADD COLUMN IF NOT EXISTS group_identity BOOLEAN NOT NULL DEFAULT FALSE;
