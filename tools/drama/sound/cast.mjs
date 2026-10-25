/**
 * Which voice id each role uses (tools/drama/sound/voices.mjs + designed-voices.json).
 *
 *   resolveVoices(slug) → { role: voiceId } or throws, naming every role without a voice
 *
 * A standard voice is its name; a designed (Nigerian) voice is the `voice_…` id that
 * design-voices.mjs stored. A designed role that has not been made yet is an error,
 * never a silent swap: the episode then posts without sound and the owner is told.
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import VOICES from "./voices.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REGISTRY = path.join(HERE, "designed-voices.json");

export function registry() {
  return existsSync(REGISTRY) ? JSON.parse(readFileSync(REGISTRY, "utf8")) : {};
}

/** `overrides` = { role: voiceId } for roles a fan plays with their own replicated voice (drama_cast.voice_id); they win. */
export function resolveVoices(slug, overrides = {}) {
  const spec = VOICES[slug];
  if (!spec) throw new Error(`no voices for the story "${slug}"`);
  const reg = registry();
  const out = {}, missing = [];
  for (const [role, v] of Object.entries(spec)) {
    if (overrides[role]) out[role] = overrides[role];
    else if (typeof v === "string") out[role] = v;
    else if (reg[`${slug}/${role}`]?.id && reg[`${slug}/${role}`].description === (v.nigerian ?? v.designed)) out[role] = reg[`${slug}/${role}`].id;
    else missing.push(role);
  }
  if (missing.length) throw new Error(`voices not designed yet for ${slug}: ${missing.join(", ")} (run tools/drama/sound/design-voices.mjs ${slug})`);
  return out;
}
