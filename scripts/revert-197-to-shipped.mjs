#!/usr/bin/env node
/**
 * revert-197-to-shipped.mjs — put look 197 back to the version that produced the
 * result the owner actually liked.
 *
 * The text is not reconstructed from a memory of which edits were made. It is
 * lifted out of shoot_images.prompt for shoot ab4cd010 — the prompt that was
 * genuinely sent to fal for the picture being judged — between the
 * "ONLY NOW, THE NEW LIGHTING:" marker and the wrapper block that follows it.
 * That is the only version of "the original" that cannot be wrong.
 *
 * Reverting drops three later changes:
 *
 *   EXAGGERATE THE WARMTH — the room block, and the reason for the revert: it
 *   was repainting walls instead of relighting them. Two attempts at wording it
 *   failed the same way, and a rule the model keeps over-reading is a rule that
 *   does not belong in a look this specific.
 *
 *   FLASH-REVEALED SKIN TEXTURE — the pore fix, which the owner liked. It goes
 *   only because it arrived after the good result and cannot be proven innocent
 *   of the wall problem without another paid generation.
 *
 *   and restores "clipping toward white", which fights pore detail. That is the
 *   cost of going back to a known-good state rather than a guessed-good one.
 *
 * Run ON THE VPS. Backs the current version up first, writes with sql.json()
 * (never JSON.stringify()+::jsonb, which stores a JSON string and replaced all
 * 197 looks with one quoted blob), then re-reads and asserts the count.
 */
