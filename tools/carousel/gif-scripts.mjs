/**
 * A short GIF script for every post — the lines its story GIF says.
 *
 * Not the carousel's words, and not shortened automatically from them. A GIF in
 * an Instagram comment is about 200 pixels wide, so the engine (lib/gif-loop.ts)
 * sets three or four huge words per frame beside the photograph; a carousel
 * line of fifteen words would come out too small to read at that size. So each
 * post gets its own lines, written for that size: a hook, a turn, a reveal.
 *
 * How the GIF plays: the BEFORE photograph shows for every line until the last
 * one, where the AFTER dissolves in — so the last line is the payoff. The web
 * address is added after it by the server, on every GIF, because it is the one
 * thing a stranger who finds it in a comment can act on.
 *
 * Keep lines under about 22 characters. The server refuses anything over 32.
 * No emoji (the server draws them as outlines) and no ₦ (a price is the wrong
 * thing to make a stranger read in a comment).
 */

import { GIFS_S2 } from "./plan-season2.mjs";

/** Episodes carry the series name along the bottom of every frame. */
export const EPISODE_KICKER = "#PHOTOWAHALA";

export const GIF_SCRIPTS = {
  // ── Season 2 (p01–p88): written beside each story in season2/ ─────────
  ...GIFS_S2,

  // ── Season 1 (m01–m44) — four lines, the last is the reveal ─────────────
  m01: ["Tolu posted it", "214 people saw", "Orange. Dark.", "Same girl. New light"],
  m02: ["Guests, not ghosts?", "Kemi zoomed in", "Sent it at 1am", "Back by 2:14"],
  m03: ["She has the fix", "Tolu has no idea", "Then Tolu messaged", "Same gele. New light"],
  m04: ["Album day", "Kemi pressed send", "112 heart-eyes", "Chief bridesmaid"],
  m05: ["200 wigs", "Zero sales", "Same wig, sold for more", "Better photos win"],
  m06: ["One bad photo", "Duvet behind it", "Sent at 11:41pm", "Four angles back"],
  m07: ["Four clean angles", "31 DMs", "Rival slid in", "Same wig, clean"],
  m08: ["Rent paid early", "Prices raised", "Rival muted", "The secret: this"],
  m09: ["Mama turns 60", "Banner due 8am", "Only a kitchen photo", "Still exactly Mama"],
  m10: ["11 hours left", "One kitchen photo", "Sent at 9:14pm", "No pot. No steam."],
  m11: ["Aunty suspects", "She called Mama", "Surprise in danger", "Still exactly Mama"],
  m12: ["The banner unrolls", "Mama freezes", "Then she laughs", "Her face, framed"],
  m13: ["Her ex's wedding", "She went", "Cruel hall lights", "Same night. Glowing"],
  m14: ["40 perfect for her", "3 bad for Funmi", "Sent at 1:44am", "2:47am: a like"],
  m15: ["He liked it", "On his wedding night", "61 notifications", "Same night. New light"],
  m16: ["Her reply: I know", "Blocked", "Unblocked", "Main character"],
  m17: ["Got the job", "Headshot by 9am", "Only a wedding photo", "Corporate by morning"],
  m18: ["Cropped the cousin", "One photo", "Five came back", "On the website"],
  m19: ["CEO wants him", "First day", "Who took it?", "This photo"],
  m20: ["Told the truth", "One wedding photo", "CEO impressed", "Team project"],
  m21: ["Zero ad budget", "Rival: 2 million", "She typed GIF", "Her own sticker"],
  m22: ["Plain tray", "Styled tray", "Six words", "One sticker"],
  m23: ["400,000 followers", "Used her sticker", "63 DMs", "The sticker girl"],
  m24: ["Big caterer called", "Not to complain", "60 orders", "Made once"],
  m25: ["The flash died", "First dance", "300 dark shots", "Saved"],
  m26: ["Fake it for 200k?", "No: the real ones", "12 frames sent", "The dance, visible"],
  m27: ["12 frames back", "Rival on the sofa", "Do you have them?", "Every expression"],
  m28: ["The bride cried", "Book him again", "Who edited those?", "The real moment"],
  m29: ["Daddy's turn", "140 photos", "One clear one", "No washing machine"],
  m30: ["34 relatives waiting", "One photo", "Studio backdrop", "Same gap tooth"],
  m31: ["Two blue ticks", "Typing...", "Which studio?", "Canada calls"],
  m32: ["Happy tears", "Printed abroad", "Her father tried", "Daddy did it"],
  m33: ["Four years", "No photographer", "A cracked phone", "Her day, saved"],
  m34: ["For the parlour wall", "Least bad photo", "A set of five", "Looks like Mama"],
  m35: ["Sent all five", "No reply", "Three missed calls", "Then a photo"],
  m36: ["The parlour wall", "Already framed", "My daughter, the nurse", "Her portrait"],
  m37: ["She said yes", "Flash was off", "Two faint shapes", "Now you can see"],
  m38: ["Brother wants proof", "All black", "Four frames sent", "The yes, lit"],
  m39: ["Family meeting", "Wale looks first", "Arms folded", "The ring, lit"],
  m40: ["Wale scrolls", "He stops", "You did well", "Her happiest"],
  m41: ["Six years", "First class", "Squinting photos", "The day, saved"],
  m42: ["One photo", "Eyes open", "Ten portraits", "Year two's dream"],
  m43: ["6 years", "2 strikes", "1 first class", "0 regrets"],
  m44: ["She mocked her", "Needs a favour", "Sent the link", "On the wall"],
};

/** GIPHY tags beyond the brand ones the server always adds. */
export function gifTags(post) {
  const byProduct = {
    relight: ["relight", "phone photography", "lighting"],
    studio: ["studio portrait", "phone to studio", "portrait"],
    assets: ["product photography", "vendor", "fashion"],
    gif: ["sticker", "small business"],
    shoot: ["photoshoot", "headshots", "portrait"],
  };
  const base = ["nigeria", "naija", "before after", ...(byProduct[post.product] ?? [])];
  // Every post is a Photo Wahala episode now: Season 1 by its batch, Season 2
  // by its title ("P01 Photo Wahala S2 1.1: The 30th").
  if (post.batch === "microdrama" || /Photo Wahala/.test(String(post.title ?? ""))) {
    const story = String(post.title ?? "").replace(/^.*?:\s*/, "").toLowerCase();
    return ["photo wahala", "photowahala", "nigerian drama", "story", story, ...base].slice(0, 14);
  }
  return base;
}
