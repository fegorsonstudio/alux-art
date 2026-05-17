# AGENTS.md — Alux Art Photo Studio: AI Handoff & Test Instructions

## Implementation Status

### Locked Base Reference (Stage 1.5) — Backend Complete, UI Pending

#### Complete
- `migrations/001_character_bases.sql` — DB schema for `character_bases`, shoots ALTER, indexes
- `lib/types.ts` — `CharacterBase`, `BaseLockStatus`, `StylingBrief`, `QualityGateResult`, extended `Shoot`
- `lib/base-lock.ts` — cache key, feature flag, vision pre-pass, base prompt, fal.ai call, quality gate, storage save, signed URL
- `lib/airtable.ts` — `logBaseLockAttempt`, `logBaseLockResult`
- `app/api/shoots/[id]/base-lock/route.ts` — Stage 1.5 main handler (internal-secret auth, cache hit, generate, gate, retry/review logic)
- `app/api/shoots/[id]/base-lock/approve/route.ts` — user approves base, fires `/start`
- `app/api/shoots/[id]/base-lock/reject/route.ts` — user rejects base, re-rolls or terminates after 5 attempts
- `app/api/characters/route.ts` — GET character library
- `app/api/characters/[id]/route.ts` — GET/POST/PATCH/DELETE single character base
- `app/api/shoots/[id]/start/route.ts` — base-lock dispatch branch, status guards
- `app/api/shoots/route.ts` — `characterBaseId` input, skips Stages 1+1.5
- `lib/generate.ts` — scene-only shoot brief when base present, base-anchored `imageUrls` for fal.ai, locked-base prompt assembly
- `vercel.json` — `maxDuration` for all new routes

#### Pending (UI)
- `app/page.tsx` — needs:
  1. Base status badge in gallery row (spinner for `BASE_LOCKING`, review prompt for `BASE_REVIEW`, rejected banner for `BASE_REJECTED`)
  2. Approval modal: show base image + identity refs side-by-side; "Approve" calls `POST /api/shoots/[id]/base-lock/approve`; "Re-roll" calls `POST /api/shoots/[id]/base-lock/reject`
  3. Character library panel above identity upload zone: GET `/api/characters`, show thumbnail grid, click to set `selectedCharacterBase`; pass `characterBaseId` in shoot POST body

#### Pending (Manual Steps — user must do these in Supabase dashboard)
1. Run `migrations/001_character_bases.sql` in Supabase SQL Editor
2. Create storage bucket named `character-bases` (private, no public access)

#### Pending (Vercel env vars to add)
```
LOCKED_BASE_ENABLED=true
LOCKED_BASE_ROLLOUT_PERCENT=10
QUALITY_GATE_PROVIDER=claude
```
Start at 10% rollout. Increase after monitoring logs.

---

## Architecture Summary

### Generation Pipeline Stages

```
Stage 1    Identity analysis (Claude vision → identity_profile text)
Stage 1.5  Base lock: generate full-body white-backdrop character ref (fal.ai)
           → Quality gate (Claude vision) → AUTO_APPROVED / PENDING_USER_APPROVAL / HARD_FAIL
Stage 2    Shoot brief: scene-only JSON per slot (when base present) or full prompts (no base)
Stage 3    Slot generation: fal.ai with [base, background?, lighting?, color_grade?]
```

### Shoot Status Flow

```
PENDING_PAYMENT → QUEUED (after payment / admin bypass)
QUEUED → BASE_LOCKING (feature flag on, no saved base)
QUEUED → PROCESSING (feature flag off, or saved base provided)
BASE_LOCKING → BASE_REVIEW (borderline quality gate, user must approve/reject)
BASE_LOCKING → QUEUED (auto-approved, fires /start)
BASE_REVIEW → BASE_LOCKING (user rejected, re-roll)
BASE_REVIEW → BASE_REJECTED (5 attempts exhausted)
PROCESSING → COMPLETE / FAILED
```

### Character Base Cache

Cache key = SHA-256 of `sorted(identity_paths) | outfit? | hairstyle? | makeup? | nail? | sorted(accessory_paths) | sorted(custom_tag_paths)`.

Same identity + same tagged refs → cache hit → skips generation entirely → attaches existing approved base.

### Quality Gate Bands

| Score | Action |
|-------|--------|
| identity_match >= 0.85 AND technical_quality >= 0.75 | AUTO_APPROVED → fires /start |
| identity_match 0.70–0.85 OR borderline quality | PENDING_USER_APPROVAL → BASE_REVIEW |
| identity_match < 0.70 OR technical_quality < 0.60 | HARD_FAIL → auto-retry (up to 3) |

### Prompt Assembly (locked-base shoots)

`buildShootBrief` receives `characterBaseUrl` and emits per-slot scene objects:
```json
{
  "background": "...",
  "lighting": "...",
  "mood_vibe": "...",
  "photography_style": "...",
  "pose": "...",
  "shot_type": "...",
  "scene_exclusions": "do not transfer white studio backdrop..."
}
```

`startGenerationWorker` assembles the final fal.ai prompt as:
```
Scene: <background>. <lighting>. <mood_vibe>.
Shot: <shot_type>. Photography style: <photography_style>.
Subject: [BASE REFERENCE] — identity and wardrobe anchor. Pose: <pose>.
Important Details: Realistic skin texture, natural asymmetry, editorial lens feel.
Use Case: editorial photography / fashion portrait.
Constraints: Preserve exact identity from base reference. <scene_exclusions>.
```

---

## Functional Tests

### Test 1: Feature flag off (standard shoot, no base)
1. Set `LOCKED_BASE_ENABLED=false` (or unset it) on Vercel
2. Create a shoot with 3 identity + 1 inspiration image, pay (or admin bypass)
3. Fire `/api/shoots/[id]/start`
4. Expected: shoot goes `QUEUED → PROCESSING`, slots generate normally, no `character_bases` row created

### Test 2: Feature flag on — auto-approve flow
1. Set `LOCKED_BASE_ENABLED=true`, `LOCKED_BASE_ROLLOUT_PERCENT=100`
2. Create and pay for a shoot (or admin bypass)
3. Fire `/api/shoots/[id]/start`
4. Expected: shoot goes `QUEUED → BASE_LOCKING`
5. Watch Vercel logs — `/api/shoots/[id]/base-lock` fires
6. Expected (if quality gate passes): `character_bases` row with `status=AUTO_APPROVED`, shoot returns to `QUEUED`, `/start` fires automatically, slots generate with base ref
7. Check Airtable "Base Lock Attempts" and "Base Lock Results" tables — rows must appear

### Test 3: User approval flow
1. Set `FAL_TEST_MODE=1` to force a borderline result (you may need to temporarily lower gate thresholds in `lib/base-lock.ts` to trigger `PENDING_USER_APPROVAL`)
2. Watch shoot enter `BASE_REVIEW`
3. Call `POST /api/shoots/[id]/base-lock/approve` with session cookie
4. Expected: base status → `USER_APPROVED`, shoot → `QUEUED`, `/start` fires, generation proceeds

### Test 4: Reject + re-roll
1. While shoot is in `BASE_REVIEW`, call `POST /api/shoots/[id]/base-lock/reject`
2. Expected: current base marked `USER_REJECTED`, shoot → `BASE_LOCKING`, new `/base-lock` fires
3. Reject 4 more times (total 5 attempts)
4. Expected: shoot → `BASE_REJECTED`, generation_events row with failure reason

### Test 5: Saved character library reuse
1. After any shoot completes with an approved base, call `POST /api/characters/[baseId]` with a label
2. Call `GET /api/characters` — base must appear in list
3. Create a new shoot with `characterBaseId` in the POST body
4. Expected: shoot inserts with `character_base_id` set and `base_lock_status=USER_APPROVED`; `/start` skips BASE_LOCKING entirely

### Test 6: Cache hit
1. Create two shoots with identical identity image storage paths
2. After the first shoot's base is approved, start the second shoot
3. Expected: `/base-lock` for second shoot hits cache, attaches the existing `character_bases` row, does not call fal.ai

---

## Security Tests

### Auth boundary
- `POST /api/shoots/[id]/base-lock` — must reject requests without `x-internal-secret` header (returns 401)
- `POST /api/shoots/[id]/base-lock/approve` — must reject other users' shoots (returns 403); must reject without session (401)
- `GET /api/characters` — must only return the authenticated user's bases (not others')
- `DELETE /api/characters/[id]` — must block other users from archiving another user's base (403)

### Injection check
- `characterBaseId` in POST `/api/shoots` is validated: must be a UUID string, must belong to the authenticated user, must have approved status — reject anything else with 400

### Secret exposure
- `INTERNAL_API_SECRET`, `ANTHROPIC_API_KEY`, `FAL_KEY` must never appear in browser network responses
- Signed storage URLs expire in 48 hours max; no permanent public URLs issued

---

## Performance / Speed Tests

### Baseline (no base)
- Single slot generation: target < 30s (fal.ai call)
- Full 10-slot shoot with self-continuation: target < 5 min total

### With locked base
- Base generation (Stage 1.5): target < 90s (fal.ai call + quality gate Claude call)
- Cache hit path: should add < 2s (only a Supabase SELECT + signed URL)
- Per-slot generation with base: same 30s target — imageUrls is just [base, scene_refs]

### Vercel function durations (all set in vercel.json)
| Route | maxDuration |
|-------|-------------|
| `/api/shoots/[id]/start` | 300s |
| `/api/shoots/[id]/base-lock` | 300s |
| `/api/shoots/[id]/base-lock/approve` | 30s |
| `/api/shoots/[id]/base-lock/reject` | 30s |
| `/api/shoots/[id]/events` | 300s |

---

## Environment Variables Reference

| Variable | Where | Purpose |
|----------|-------|---------|
| `LOCKED_BASE_ENABLED` | Vercel | Master on/off switch for Stage 1.5 |
| `LOCKED_BASE_ROLLOUT_PERCENT` | Vercel | 0–100 gradual rollout (default 100 if unset) |
| `QUALITY_GATE_PROVIDER` | Vercel | `claude` (default) |
| `INTERNAL_API_SECRET` | Vercel | Auth header for inter-route fire-and-forget |
| `ANTHROPIC_API_KEY` | Vercel | Claude API for identity analysis + quality gate |
| `FAL_KEY` | Vercel | fal.ai generation |
| `FAL_TEST_MODE` | Local `.env.local` only — NEVER Vercel production | Use Pollinations.ai stub |

---

## What the Next Agent Should Do

1. **UI changes in `app/page.tsx`** — three additions listed above (badge, modal, library panel)
2. **Run the SQL migration** — share the file with the user and ask them to paste it in Supabase SQL Editor
3. **Create `character-bases` bucket** — Supabase Storage → New Bucket → name `character-bases`, private
4. **Add Vercel env vars** — `LOCKED_BASE_ENABLED`, `LOCKED_BASE_ROLLOUT_PERCENT`, `QUALITY_GATE_PROVIDER`
5. **Deploy** — `npx vercel --prod` from the `codex/complete-photo-studio-fixes` branch
6. **Monitor** — watch Vercel Function logs for `[base-lock]` entries; watch Airtable "Base Lock Attempts" table
