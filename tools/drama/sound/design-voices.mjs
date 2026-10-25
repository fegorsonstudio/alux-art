#!/usr/bin/env node
/**
 * Makes a story's designed voices (Nigerian ones, and designed narrators) with Gemini 3.8 voice design, once.
 *
 *   node --env-file=.env.local tools/drama/sound/design-voices.mjs <story slug>
 *
 * The work is in design.mjs (shared with the sound job, which designs any
 * missing voice by itself). Samples go to R2 admin/sound-tests/voice-designs/<slug>/,
 * ids to designed-voices.json. Standard-voice roles are left alone.
 */
import VOICES from "./voices.mjs";
import { designMissing, missingVoices } from "./design.mjs";

const slug = process.argv[2];
if (!slug || !VOICES[slug]) { console.error(`usage: design-voices.mjs <slug> (one of ${Object.keys(VOICES).join(", ")})`); process.exit(1); }
const missing = missingVoices(slug);
if (!missing.length) { console.log(`${slug}: every designed voice is already made`); process.exit(0); }
const made = await designMissing(slug, { log: (m) => console.log(m) });
console.log(`${made.length} of ${missing.length} voice(s) designed for ${slug}`);
