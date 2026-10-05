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

/** Episodes carry the series name along the bottom of every frame. */
export const EPISODE_KICKER = "#PHOTOWAHALA";

export const GIF_SCRIPTS = {
  // ── Main plan, Oct–Dec ────────────────────────────────────────────────────
  p01: ["Taken at home", "Against a wall", "Now a studio portrait"],
  p02: ["Too dark to post", "Same night", "Now it's lit"],
  p03: ["Shot on a hanger", "Same dress", "Four clean angles"],
  p04: ["Same room", "Same phone", "One light moved"],
  p05: ["Shot on the stairs", "Same outfit", "Now a studio"],
  p06: ["The hall was yellow", "You are not", "Real skin tone back"],
  p07: ["Two pictures", "Your words", "One sticker"],
  p08: ["Almost deleted it", "Same photo", "New light"],
  p09: ["Birthday at home", "Same smile", "Worth framing now"],
  p10: ["The windows won", "Same ceremony", "Faces back"],
  p11: ["One photo in", "Five images out", "Same face in all"],
  p12: ["Last night's photo", "Fixed by lunch", "New light"],
  p13: ["They sat still once", "Same moment", "Studio portrait"],
  p14: ["The flash fired", "Flat and dark", "Lit from the side"],
  p15: ["Shot on a sofa", "Same bag", "Boutique shot"],
  p16: ["No new camera", "Same photo", "Better light"],
  p17: ["Sent on her break", "One photo", "Studio portrait"],
  p18: ["Too dark to save?", "Not really", "Saved"],
  p19: ["One photo of the rail", "Four angles out", "Questions answered"],
  p20: ["Same night out", "Same photo", "Different light"],
  p21: ["Will it look like me?", "Same face", "New room, new light"],
  p22: ["Three photos", "One link", "All fixed"],
  p23: ["Two pictures", "Four lines", "Now everyone uses it"],
  p24: ["No studio", "No reshoot", "The right light"],
  p25: ["The photo you like", "Bad light", "Now a portrait"],
  p26: ["Five years old", "Same faces", "New light"],
  p27: ["One photo", "Ten setups", "Same face"],
  p28: ["Phone did its best", "Same photo", "Better light"],
  p29: ["Naming day photo", "Against a wall", "Worth printing now"],
  p30: ["Dinner in the dark", "Same table", "Faces lit"],
  p31: ["On a mannequin", "Same wig", "Clean, four angles"],
  p32: ["One photo", "No app needed", "Fixed in the chat"],
  p33: ["Christmas at home", "Same outfit", "Studio portrait"],
  p34: ["December nights", "Too dark", "Saved"],
  p35: ["Two pictures", "Your words", "Shared all December"],
  p36: ["Taken last night", "Same photo", "Fixed this morning"],
  p37: ["Everyone home once", "One photo", "Family portrait"],
  p38: ["Lost in the dark", "Same concert", "You, lit"],
  p39: ["December stock", "One photo each", "Four clean angles"],
  p40: ["Same dress", "Same night", "Better light"],
  p41: ["Take it now", "One photo", "A portrait to keep"],
  p42: ["Sent tonight", "Back by morning", "Lit properly"],
  p43: ["One photo now", "Ten for January", "Same face"],
  p44: ["Almost deleted", "All year long", "All kept"],

  // ── Main plan, Dec–Mar ────────────────────────────────────────────────────
  p45: ["Too late to book", "Shot at home", "Christmas portrait"],
  p46: ["Carol night", "Too dark", "Faces lit"],
  p47: ["Christmas Day", "Everyone home", "One proper photo"],
  p48: ["Against a curtain", "Same photo", "Now a portrait"],
  p49: ["One selfie", "Doing every job", "Ten proper images"],
  p50: ["December backlog", "Too dark to post", "All fixed"],
  p51: ["New year", "Old party photo", "A photo you like"],
  p52: ["Phone photos", "All year", "Studio results"],
  p53: ["First day back", "At the door", "School portrait"],
  p54: ["Harmattan haze", "Flat and grey", "Shape back"],
  p55: ["Leftover stock", "Same pieces", "Looks new"],
  p56: ["Dusty afternoon", "Same photo", "Shape back"],
  p57: ["Party photo profile", "Same face", "Corporate headshot"],
  p58: ["January is long", "One photo", "Looks expensive"],
  p59: ["No ad budget", "Two pictures", "Free reach"],
  p60: ["One photo", "One fix", "Worth posting"],
  p61: ["Kitchen behind you", "Same shirt", "Profile photo"],
  p62: ["Looking ashy?", "It's the light", "Glow back"],
  p63: ["Bedroom photo", "Same unit", "Salon shot"],
  p64: ["Sitting room", "Same woman", "Studio backdrop"],
  p65: ["Started last month", "One photo", "Looks established"],
  p66: ["Office lights", "Green and flat", "Lit properly"],
  p67: ["Your name", "Their stories", "No favours asked"],
  p68: ["One photo", "Five setups", "Same face"],
  p69: ["All booked out", "One photo of you two", "Couple portrait"],
  p70: ["Date night, dark", "One frame", "Lit warm"],
  p71: ["Ten days to sell", "One photo each", "Ready to post"],
  p72: ["Same evening", "Same table", "Better light"],
  p73: ["Every slot gone", "One photo", "A full set"],
  p74: ["She said yes", "Too dark to see", "Now you can"],
  p75: ["Valentine's noise", "Your sticker", "In their stories"],
  p76: ["Valentine's Day", "One photo", "You two, a portrait"],
  p77: ["Rushed photo", "Same outfit", "Now a portrait"],
  p78: ["Not looking", "Same moment", "Lit properly"],
  p79: ["Still in bags", "One photo each", "Listed today"],
  p80: ["Not posing", "Same photo", "Her best"],
  p81: ["One photo", "Pick 1, 5 or 10", "Your set"],
  p82: ["The only photo", "Badly lit", "Face unchanged"],
  p83: ["Made once", "Searched all year", "Still working"],
  p84: ["Shot on a bed", "Same piece", "Shop window"],
  p85: ["She won't go", "One photo at home", "Her portrait"],
  p86: ["Thirty years old", "Same photo", "Finally visible"],
  p87: ["Behind the camera", "Thirty years", "Her own portraits"],
  p88: ["Mother's Day", "One photo today", "You and her"],

  // ── Photo Wahala — four lines, the last is the reveal ────────────────────
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
  if (post.batch === "microdrama") {
    const story = String(post.title ?? "").replace(/^.*?:\s*/, "").toLowerCase();
    return ["photo wahala", "photowahala", "nigerian drama", "story", story, ...base].slice(0, 14);
  }
  return base;
}
