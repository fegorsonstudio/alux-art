/**
 * PHOTO WAHALA — Season 1. Posts m01 to m44, at 1pm.
 *
 * Began as an experiment beside the HVCO drafts. On 6 October 2026 the owner
 * made this microdrama style the house style for every carousel, and Season 2
 * (plan-season2.mjs) took over the 7pm slots those drafts held. Season 1
 * still loads with its own button in the studio, from a Monday the owner
 * picks, and leaves with its own button, which also withdraws any episode
 * already handed to the publisher.
 *
 * The style is the short-form serial behind China's microdrama apps: a cover
 * drops you into a fight already happening and ends on a question instead of
 * an answer.
 *
 * The architecture, from the brief:
 *
 *   ONE STORY A WEEK, FOUR EPISODES. Monday sets the stakes, Wednesday and
 *   Friday escalate, Sunday pays off — the villain gets theirs, the hero wins,
 *   and the last slide teases next Monday's story. Eleven stories, one season.
 *
 *   EVERY EPISODE STANDS ALONE. Episodes 2 to 4 open with a "Previously"
 *   card, because people meet a carousel in the middle of the feed, not in
 *   order.
 *
 *   END ON TENSION. The second-to-last card is the cliffhanger. The last card
 *   names the next episode's day, then asks for the one comment word — so the
 *   cliffhanger and the sale are two separate cards, and neither is muddled.
 *
 *   THE PHOTO IS THE FLASH-FORWARD. The app always puts the before and the
 *   after first. Here that is the ending shown up front; the story is how the
 *   character got there, and what it cost them socially along the way.
 *
 * Three rules for whoever edits this:
 *
 *   No emoji ON THE SLIDES. The local renderer draws plain emoji as flat
 *   outlines and splits a skin-toned one into a glyph and a box. Captions are
 *   drawn by Instagram, so emoji live there.
 *
 *   The people are invented and every caption says so ("The story is made up.
 *   The result is real."). So a person in these photos must be someone who
 *   agreed to play the part. A customer who said YES to the consent ask agreed
 *   to a before-and-after, not to being cast as the woman whose ex texted her.
 *
 *   No real businesses. Rivals are "the big page", "the big caterer". A named
 *   villain business could be somebody's real shop.
 */

export const BATCH = "microdrama";
const SERIES = "Photo Wahala";

/** The lunchtime slot. The main plan posts at 19:00, so the two never collide. */
const HOUR = 13;

const NEXT_DAY = { 1: "Wednesday", 2: "Friday", 3: "Sunday" };

const CAST =
  " Use someone who agreed to play this part — including AI-made story pictures of them: a model, " +
  "a friend, staff. Not a customer's photo from the consent ask. The same person in all four episodes.";
const NO_PERSON = " No person needed.";

/** What the final slide asks for. Each line matches what the bot actually replies. */
function commentBody(word) {
  if (word === "GIF") return "Comment GIF and we'll make yours together, right there in the chat.";
  // Shoots are priced by package — one, five or ten images — so the slide
  // sends people to the link rather than naming a per-photo figure. LIGHT,
  // ASSETS and STUDIO (the Gear Equalizer) are all ₦1,000 a photo.
  if (word === "BOOK") return "Comment BOOK and I'll send you the link. The packages and prices are on it.";
  return `Comment ${word} and I'll send you the link. One photo, ₦1,000, back the same day.`;
}
function captionCta(word) {
  if (word === "GIF") return "Comment GIF and we'll make yours right there in the chat.";
  if (word === "BOOK") return "Comment BOOK and I'll send you the link.";
  return `Comment ${word} and I'll send you the link. ₦1,000 a photo.`;
}

/**
 * One episode. Ep 1 carries three beats; eps 2 to 4 carry a "Previously" card
 * and two beats — six cards either way, eight slides with the photos, under
 * Instagram's ten.
 */
function episode(story, ep, s) {
  const e = s.eps[ep - 1];
  const cards = [{ headline: e.cover, body: `${SERIES} · Story ${story} · Ep ${ep} of 4` }];
  if (ep > 1) cards.push({ eyebrow: "Previously", headline: e.previously });
  for (const [eyebrow, headline, body] of e.beats) cards.push({ eyebrow, headline, body });
  cards.push({ eyebrow: e.twist[0], headline: e.twist[1], body: e.twist[2] ?? "" });
  cards.push({
    eyebrow: ep < 4 ? `To be continued · Ep ${ep + 1} on ${NEXT_DAY[ep]}`
           : story < 11 ? "New story · next Monday" : "Season 1 · The end",
    headline: e.close,
    body: commentBody(s.trigger),
  });

  const next = ep < 4 ? `Ep ${ep + 1} drops ${NEXT_DAY[ep]}. 👀\n\n`
             : story < 11 ? "A new story starts Monday. 👀\n\n" : "";
  const caption =
    `🎬 PHOTO WAHALA · Story ${story}, Ep ${ep}: ${s.title}\n\n` +
    `${e.caption}\n\n${next}` +
    `📸 ${e.ask} ${captionCta(s.trigger)}\n\n` +
    "The story is made up. The result is real.\n\n" +
    ["#photowahala", ...s.tags, "#aluxart"].join(" ");

  return {
    id: `m${String((story - 1) * 4 + ep).padStart(2, "0")}`,
    batch: BATCH, hour: HOUR,
    week: story, slot: "ABCD"[ep - 1],
    product: s.product, trigger: s.trigger,
    title: `${SERIES} ${story}.${ep}: ${s.title}`,
    photos: s.photos,
    cards, caption,
  };
}

const STORIES = [
  // ── 1 ─────────────────────────────────────────────────────────────────────
  {
    title: "The Asoebi Group Chat", product: "relight", trigger: "LIGHT",
    tags: ["#asoebi", "#owambe", "#naijawedding"],
    photos: "A woman in asoebi photographed under bad hall lighting, and the relit version." + CAST,
    eps: [
      { cover: "Tolu posted Kemi's worst photo to 214 people.",
        beats: [
          ["Bride's Squad · 11:42 PM", "“Kemi, is this you or your shadow?”",
           "Tolu. Group admin. Has never once posted a photo of herself."],
          ["11:43 PM", "47 laughing emojis in one minute.",
           "Orange skin. Black background. Eyes half shut. The hall lights did that, not Kemi."],
          ["11:51 PM", "Kemi types “delete it.” Deletes it. Types it again.",
           "Leaving the group would be worse. Everyone would know why."],
        ],
        twist: ["11:58 PM", "Then the bride's mother replied."],
        close: "Send me the photo the hall lights ruined.",
        caption: "Tolu posted Kemi's worst photo to 214 people at 11:42pm.\nOrange skin. Black background. Eyes half shut.\nThe hall lights did that. Not Kemi.\n\nAt 11:58pm, the bride's mother replied. 😳",
        ask: "Got a photo the hall lights ruined?" },
      { cover: "The bride's mother has spoken. 214 people are watching.",
        previously: "Tolu posted Kemi's worst wedding photo to the group chat.",
        beats: [
          ["Mummy Bride · 11:58 PM", "“Who is this? I invited guests, not ghosts.”",
           "Tolu replies with a crown. Kemi wants the floor to open."],
          ["1:07 AM", "Kemi zooms in. Then zooms in again.",
           "Makeup perfect. Gele perfect. The light was the only thing wrong."],
        ],
        twist: ["1:12 AM", "She sends the photo to be relit. ₦1,000.", "At 2:14 AM, her phone buzzes."],
        close: "Send me the one you're hiding.",
        caption: "“Who is this? I invited guests, not ghosts.” The bride's mother, to 214 people. 💀\n\nKemi's makeup was perfect. Her gele was perfect. The light was the only thing wrong.\n\nAt 1:12am she sent it off. At 2:14am, her phone buzzed.",
        ask: "Hiding a photo like Kemi's?" },
      { cover: "Kemi has the fixed photo. Tolu has no idea.",
        previously: "Tolu mocked Kemi's photo in front of 214 people. Kemi sent it to be relit at 1 AM.",
        beats: [
          ["2:14 AM", "Same gele. Same face. Different light.",
           "Her real skin tone. The hall glowing warm behind her instead of black."],
          ["Next morning", "Kemi doesn't post it. Not yet.",
           "The bride shares the official album on Saturday. The whole squad will be in the chat."],
        ],
        twist: ["Day 3 · 10:03 PM · Private message", "“Kemi... where did you get your photos fixed?”",
                "It's Tolu. Her own photos came out darker than anyone's."],
        close: "Fix yours before the album drops.",
        caption: "Kemi has her photo back. Same gele, same face, her real skin tone.\n\nShe's not posting it yet. The official album drops Saturday and the whole squad will be watching.\n\nThen, on day 3, a private message. From Tolu. 👀",
        ask: "Want yours fixed before the album drops?" },
      { cover: "Album day. Kemi presses send.",
        previously: "Tolu mocked Kemi's photo, then secretly asked who fixed it.",
        beats: [
          ["Bride's Squad · 6:31 PM", "Kemi posts the photo. The chat goes silent.",
           "Then 112 heart-eyes. Then the bride: “THIS is my chief bridesmaid.”"],
          ["Mummy Bride · 6:40 PM", "“Kemi, send me this one. It's going in the frame.”",
           "Tolu changes her profile picture to a flower."],
        ],
        twist: ["And Tolu?", "Kemi sent her the link. On Tuesday.",
                "Next Monday: 200 wigs, 9 days to pay rent, and a rival selling the same hair for more."],
        close: "Your turn to win the group chat.",
        caption: "Album day. Kemi posted her photo. Silence. Then 112 heart-eyes. 😍\n\nThe bride's mother wants it in a frame. Tolu changed her profile picture to a flower. 🌸\n\nAnd yes, Kemi sent Tolu the link. On Tuesday. 😌",
        ask: "Your turn to win the group chat." },
    ],
  },

  // ── 2 ─────────────────────────────────────────────────────────────────────
  {
    title: "200 Wigs", product: "assets", trigger: "ASSETS",
    tags: ["#wigvendor", "#hairbusiness", "#lagosvendor"],
    photos: "Your best wig or hair unit photographed on a bed or a mannequin head, and the clean four-angle version." + NO_PERSON,
    eps: [
      { cover: "200 wigs. 9 days to pay rent. Zero sales this week.",
        beats: [
          ["Monday · 8:14 AM", "Amaka's landlord sends one word: “Friday?”",
           "Her stock is good. Bone straight, burgundy, 22-inch. Sitting in bags."],
          ["Customer · 10:02 AM", "“Sis, is this the same wig the big page sells? Theirs looks better.”",
           "It IS the same wig. Same supplier. Different photos."],
          ["10:05 AM", "Amaka opens the big page. 80,000 followers.",
           "Her exact burgundy unit. Shot clean, four angles. ₦15,000 dearer than hers."],
        ],
        twist: ["10:06 AM", "Under it, a comment from Amaka's best customer.", "“Ordered!”"],
        close: "Stop losing sales to better photos.",
        caption: "Amaka has 200 wigs, 9 days to pay rent, and zero sales this week.\n\nThen she finds the big page selling her exact burgundy unit for ₦15,000 more. Same supplier. Better photos.\n\nAnd under it, a comment from her best customer: “Ordered!” 💔",
        ask: "Losing sales to better photos?" },
      { cover: "Same wig. Same supplier. The big page is winning on photos.",
        previously: "Amaka's rival sells her exact wigs for ₦15,000 more, with better photos.",
        beats: [
          ["Monday · 11:30 PM", "Amaka lays her best unit on the bed. One photo.",
           "Bad light. Duvet behind it. It's all she's got."],
          ["11:41 PM", "She sends it to be extracted. ₦1,000.",
           "“If this doesn't work,” she tells her sister, “I'm selling at a loss.”"],
        ],
        twist: ["12:20 AM", "What comes back isn't one photo.", "It's four."],
        close: "Send me the piece nobody can see properly.",
        caption: "One photo. Her best unit, lying on a duvet, in bad light.\n\n“If this doesn't work,” Amaka tells her sister, “I'm selling at a loss.”\n\nAt 12:20am the photos came back. Not one. Four. 👀",
        ask: "Got stock nobody can see properly?" },
      { cover: "Front. Three-quarter. Side. Back. From one photo on a bed.",
        previously: "Amaka sent one bad photo of her best wig. Four clean angles came back.",
        beats: [
          ["Tuesday · 7:00 AM", "She posts all four. Same price as before.",
           "No model. No mannequin. Just the hair, clean, from every side."],
          ["Tuesday · 7:00 PM", "31 DMs. 9 orders. One question, over and over.",
           "“Is the back really like that?” Yes. That's the whole point."],
        ],
        twist: ["Thursday · 11:12 PM", "Then the big page slides into her DMs.",
                "“Hi dear. Who does your product photos?”"],
        close: "Get the four angles before your rival does.",
        caption: "Amaka posted all four angles. Same price as before.\n\n31 DMs. 9 orders. And one question again and again: “Is the back really like that?”\n\nThen on Thursday night, the big page messaged her. “Hi dear. Who does your product photos?” 😏",
        ask: "Want the four angles before your rival does?" },
      { cover: "Rent paid. The big page is still waiting for a reply.",
        previously: "Amaka's new photos sold her wigs. Then her rival asked who took them.",
        beats: [
          ["Friday · 9:00 AM", "Amaka pays rent. Two days early.",
           "Then she raises her prices to match the big page. Orders don't slow down."],
          ["Her reply to the big page", "“A good vendor never reveals her secrets.”",
           "Then she mutes them."],
        ],
        twist: ["Next Monday on Photo Wahala", "Mama turns 60 on Saturday. The printer needs her photo by 8 AM.",
                "The only good photo of Mama was taken in the kitchen."],
        close: "Here's the secret she didn't share.",
        caption: "Rent: paid. Two days early.\nPrices: raised to match the big page.\nOrders: still coming.\n\nAnd the big page? “A good vendor never reveals her secrets.” Muted. 💅🏾\n\nThe secret is one photo in, four angles out.",
        ask: "Want the secret?" },
    ],
  },

  // ── 3 ─────────────────────────────────────────────────────────────────────
  {
    title: "Mama's 60th", product: "studio", trigger: "STUDIO",
    tags: ["#60thbirthday", "#nigerianmum", "#surpriseparty"],
    photos: "An older woman photographed at home, a kitchen or sitting room is ideal, and the studio version." + CAST,
    eps: [
      { cover: "Mama turns 60 on Saturday. She has no idea what's coming.",
        beats: [
          ["Tuesday · 7:40 PM", "The printer: “Send the photo by 8 AM or no banner.”",
           "Chioma has 600 photos of Mama. Blurry, cropped, or in the kitchen."],
          ["Planning group · 8:02 PM", "Aunty Nkechi: “This is why I said use MY photographer.”",
           "₦250,000. And Mama would have to go to a studio. Mama does not go to studios."],
          ["8:30 PM", "Chioma picks the one of Mama laughing at the stove.",
           "Steam behind her. A pot in the corner. The only photo that looks like her."],
        ],
        twist: ["8:31 PM", "Aunty Nkechi: “If that kitchen photo goes on the banner, I'm not coming.”"],
        close: "Send me the photo that actually looks like her.",
        caption: "Mama turns 60 on Saturday. The printer needs her photo by 8am.\n\nThe only one that looks like her: laughing at the stove, steam behind her, a pot in the corner.\n\nAunty Nkechi has made her position clear: “If that kitchen photo goes on the banner, I'm not coming.” 🙄",
        ask: "Is your best photo of someone you love taken in a kitchen?" },
      { cover: "11 hours to the printer's deadline. One kitchen photo.",
        previously: "Mama's 60th banner needs a photo by 8 AM. The only good one was taken in the kitchen.",
        beats: [
          ["9:14 PM", "Chioma sends the kitchen photo off.",
           "Same laugh. Same wrapper. She asks for a studio backdrop, nothing else."],
          ["10:02 PM", "It comes back. Chioma covers her mouth.",
           "No pot. No steam. Mama, laughing, in front of a clean backdrop. Still exactly Mama."],
        ],
        twist: ["10:05 PM", "She posts it in the planning group. Aunty Nkechi is typing...",
                "“Which studio is this? I know my sister. She did not go to any studio.”"],
        close: "Send me the one taken in the kitchen.",
        caption: "Chioma sent the kitchen photo off at 9:14pm. At 10:02pm it came back. No pot. No steam. Mama, laughing, in front of a studio backdrop. Still exactly Mama. 🥹\n\nShe posted it in the planning group.\n\nAunty Nkechi: “Which studio is this? I know my sister. She did not go to any studio.” 👀",
        ask: "Got a kitchen photo of someone you love?" },
      { cover: "Aunty Nkechi is about to ruin the surprise.",
        previously: "Chioma turned a kitchen photo of Mama into a studio portrait. Aunty Nkechi got suspicious.",
        beats: [
          ["Wednesday · 7:15 AM", "Aunty Nkechi calls Mama. “Have you been to a studio?”",
           "Chioma hears it from the next room. Mama: “Studio? Me? For what?”"],
          ["7:16 AM", "Mama goes quiet. Then: “Chioma. Come here.”",
           "Chioma walks in holding her phone like evidence."],
        ],
        twist: ["7:17 AM", "“Are you people planning something for me?”"],
        close: "Get the photo ready before anyone suspects.",
        caption: "Aunty Nkechi called Mama at 7:15am: “Have you been to a studio?”\n\nMama: “Studio? Me? For what?”\n\nThen silence. Then: “Chioma. Come here.”\n\n“Are you people planning something for me?” 😬",
        ask: "Planning a surprise of your own?" },
      { cover: "Saturday. The banner unrolls. Mama sees her own face.",
        previously: "The surprise almost leaked. Chioma told Mama the photo was for church.",
        beats: [
          ["Saturday · 4:00 PM", "The banner unrolls. 120 guests. Mama freezes.",
           "Then she laughs, the exact laugh in the photo. Half the hall is crying."],
          ["Aunty Nkechi · 6:45 PM", "“Chioma, my dear. Send me that photographer's number.”",
           "She turns 63 in March."],
        ],
        twist: ["Next Monday on Photo Wahala", "Funmi's ex is getting married. She's invited. She's going.",
                "And the hall lighting is about to make it personal."],
        close: "Give someone you love the portrait they'd never book.",
        caption: "The banner unrolled in front of 120 guests. Mama froze. Then she laughed, the exact laugh in the photo. Half the hall cried. 😭\n\nAt 6:45pm, a message from Aunty Nkechi: “Chioma, my dear. Send me that photographer's number.” 😂\n\nShe turns 63 in March.",
        ask: "Got someone who would never book a portrait?" },
    ],
  },

  // ── 4 ─────────────────────────────────────────────────────────────────────
  {
    title: "The Ex's Wedding", product: "relight", trigger: "LIGHT",
    tags: ["#weddingguest", "#naijawedding", "#glowup"],
    photos: "A woman dressed up at an evening event, photographed under poor hall lighting, and the relit version." + CAST,
    eps: [
      { cover: "Her ex is getting married on Saturday. She's going.",
        beats: [
          ["Monday · 9:00 PM", "Funmi RSVPs yes. Her best friend calls at once.",
           "“Are you mad? Why would you go?” “Because I look good now.”"],
          ["Saturday · 3:00 PM", "Emerald gown. Fresh braids. She looks incredible.",
           "In the mirror. In person. Everywhere except one place."],
          ["Saturday · 8:40 PM", "The hall lights. Yellow. Dim. Straight down.",
           "Every photo of her: tired, orange, shadows under her eyes."],
        ],
        twist: ["9:15 PM", "The bride's photographer posts 40 flawless photos.", "Funmi's friends post hers."],
        close: "Send me the night the lights got wrong.",
        caption: "Funmi's ex got married on Saturday. She went. Emerald gown, fresh braids, looking incredible.\n\nIn the mirror. In person. Everywhere except one place: the hall lights. Yellow, dim, straight down.\n\nThen the bride's photographer posted 40 flawless photos. And Funmi's friends posted hers. 😭",
        ask: "Did the lights get your big night wrong?" },
      { cover: "40 perfect photos of the bride. 3 terrible ones of Funmi.",
        previously: "Funmi looked incredible at her ex's wedding. The hall lights disagreed.",
        beats: [
          ["Sunday · 1:30 AM", "Funmi can't sleep. She scrolls the wedding hashtag.",
           "214 posts. She's in three. Looking like a candle in a blackout."],
          ["1:44 AM", "“I am not letting this be how they remember me.”",
           "She sends her best one to be relit. ₦1,000."],
        ],
        twist: ["2:31 AM", "It comes back. She posts it. At 2:47 AM, it gets a like.", "From the groom."],
        close: "Fix yours before the hashtag does the damage.",
        caption: "1:30am. Funmi scrolls the wedding hashtag. 214 posts. She's in three, looking like a candle in a blackout.\n\n“I am not letting this be how they remember me.”\n\nShe sent her best one to be relit and posted it. At 2:47am it got a like. From the groom. 😳",
        ask: "Is a hashtag remembering you wrong?" },
      { cover: "Her ex liked the photo at 2:47 AM. On his wedding night.",
        previously: "Funmi relit her photo from her ex's wedding. He liked it at 2:47 AM.",
        beats: [
          ["Sunday · 9:00 AM", "Funmi's phone has 61 notifications.",
           "Emerald gown, glowing skin, the hall warm behind her. Same night. Different woman."],
          ["Best friend · 9:02 AM", "“FUNMI. He liked it?? On his WEDDING NIGHT??”",
           "Funmi makes tea. She is calm. She is so calm."],
        ],
        twist: ["Sunday · 11:58 PM · Message request", "“You looked amazing last night.”", "From him."],
        close: "Send me the photo you want them to remember.",
        caption: "61 notifications by 9am. Same night, same gown, different woman. ✨\n\nHer best friend: “FUNMI. He liked it?? On his WEDDING NIGHT??”\n\nFunmi made tea. She was calm. So calm.\n\nThen, at 11:58pm, a message request. 👀",
        ask: "Want them to remember you right?" },
      { cover: "Funmi has typed her reply to her ex. Here it is.",
        previously: "Funmi's ex messaged her the night after his own wedding.",
        beats: [
          ["Monday · 7:30 AM · Her reply", "“I know. Congratulations to you and Rita.”",
           "Then she blocks him. Unblocks him so he sees her next post. Blocks him again."],
          ["Monday · 8:00 AM", "The photo becomes her profile picture.",
           "Not for him. For the woman in the emerald gown who nearly let a light bulb tell her story."],
        ],
        twist: ["Next Monday on Photo Wahala", "Tunde got the job. Then HR asked for a headshot by 9 AM.",
                "His only good photo has half his cousin's hand in it."],
        close: "Your turn to look like the main character.",
        caption: "Her reply: “I know. Congratulations to you and Rita.” 😌\n\nThen she blocked him. Unblocked him so he'd see her next post. Blocked him again.\n\nThe photo is her profile picture now. Not for him. For the woman in the emerald gown, who nearly let a light bulb tell her story.",
        ask: "Your turn to be the main character." },
    ],
  },

  // ── 5 ─────────────────────────────────────────────────────────────────────
  {
    title: "The Headshot", product: "shoot", trigger: "BOOK",
    tags: ["#newjob", "#corporatenigeria", "#headshots"],
    photos: "A young man's casual phone photo (a cropped event photo is perfect), and the five-image professional set it became." + CAST,
    eps: [
      { cover: "Tunde got the job. Now HR wants a headshot by 9 AM.",
        beats: [
          ["Thursday · 6:12 PM", "“Welcome aboard! Please send a professional headshot for our website.”",
           "Tunde screams into a pillow. Then opens his gallery."],
          ["6:20 PM", "His best photo: a wedding. Agbada. Half his cousin's hand on his shoulder.",
           "Second best: a selfie in a danfo."],
          ["Cousin Bayo · 6:41 PM", "“Just use your passport photo. Nobody looks at those things.”",
           "Everybody looks at those things."],
        ],
        twist: ["6:58 PM", "Tunde calls a studio. ₦80,000. Next free slot: two weeks.", "He starts on Monday."],
        close: "Send me one photo of yourself tonight.",
        caption: "Tunde got the job. 🎉 Then HR asked for a professional headshot by 9am.\n\nHis best photo: a wedding, agbada, half his cousin's hand on his shoulder. His second best: a selfie in a danfo.\n\nThe studio wants ₦80,000 and two weeks. He starts Monday. 😩",
        ask: "No proper photo of yourself?" },
      { cover: "15 hours. One cropped wedding photo. A whole company waiting.",
        previously: "Tunde's new job needs a headshot by 9 AM. Every studio is booked.",
        beats: [
          ["Thursday · 9:10 PM", "Tunde crops out his cousin's hand. Uploads the photo.",
           "Picks a style. Chooses five images. Pays."],
          ["9:40 PM", "Five come back. Different poses. Different light.",
           "Same Tunde in every one. A suit he doesn't own. An office he's never been in."],
        ],
        twist: ["Friday · 8:51 AM", "He emails HR the best one. By 9 AM it's on the website.",
                "At 9:30 AM, the CEO sees it."],
        close: "Send me the photo you've been cropping for years.",
        caption: "Tunde cropped out his cousin's hand and uploaded the photo. Picked a style. Five images.\n\nThey came back at 9:40pm. Different poses, different light, the same Tunde in every one. 🔥\n\nBy 9am it was on the company website. By 9:30am, the CEO had seen it. 😬",
        ask: "Been cropping the same photo for years?" },
      { cover: "First day. Four hours in. The CEO wants to see Tunde.",
        previously: "Tunde turned a cropped wedding photo into a corporate headshot. The CEO noticed.",
        beats: [
          ["Monday · 10:15 AM", "“Tunde? The CEO wants you in her office.”",
           "His stomach drops through the floor."],
          ["10:18 AM", "She has the website open. His headshot fills the screen.",
           "“Is this you?” “Yes ma.” “Who took it?”"],
        ],
        twist: ["10:19 AM", "Tell the truth, or pretend he owns a suit?"],
        close: "Get the headshot before the boss asks.",
        caption: "Day one. Four hours in. “Tunde? The CEO wants you in her office.”\n\nHis headshot is on her screen.\n\n“Is this you?” “Yes ma.” “Who took it?”\n\nTruth? Or pretend he owns a suit? 😅",
        ask: "Need the headshot before the boss asks?" },
      { cover: "Tunde told the CEO the truth. She called the whole office in.",
        previously: "The CEO asked who took Tunde's headshot. He had to answer.",
        beats: [
          ["10:20 AM", "“I took one photo at a wedding, ma. The rest was done online.”",
           "Silence. Then: “Our website photos cost us two million naira last year.”"],
          ["10:25 AM", "She puts him in charge of the team's new headshots.",
           "Day one. Four hours in. He has a project."],
        ],
        twist: ["Next Monday on Photo Wahala", "Bisi has no money for ads. The big caterer has two million.",
                "And she's about to go viral by accident."],
        close: "Your turn to look like you already got the job.",
        caption: "“I took one photo at a wedding, ma. The rest was done online.”\n\nSilence. Then: “Our website photos cost us two million naira last year.”\n\nDay one, four hours in, and Tunde is in charge of the whole team's new headshots. 😎",
        ask: "Your turn to look like you already got the job." },
    ],
  },

  // ── 6 ─────────────────────────────────────────────────────────────────────
  {
    title: "The Sticker", product: "gif", trigger: "GIF",
    tags: ["#smallchops", "#ibadanbusiness", "#smallbusinessnigeria"],
    photos: "A plain phone photo of something you sell and a styled photo of the same thing: the two pictures that become the GIF." + NO_PERSON,
    eps: [
      { cover: "Bisi has ₦0 for ads. The big caterer has ₦2 million.",
        beats: [
          ["Monday · 9:00 AM", "Bisi makes the best small chops in Ibadan.",
           "Ask anyone who's tasted it. Almost nobody has tasted it."],
          ["9:05 AM", "The big caterer's advert. Again. Third time today.",
           "Puff-puff glowing like gold. A jingle she now hears in her sleep."],
          ["9:30 AM", "Bisi's Instagram: 214 followers. 11 are her cousins.",
           "She can't outspend them. So she stops trying."],
        ],
        twist: ["10:02 AM", "She types one word in a DM: GIF.", "What comes back changes her month."],
        close: "Make one thing other people share for you.",
        caption: "Bisi makes the best small chops in Ibadan. Ask anyone who's tasted it. Almost nobody has.\n\nThe big caterer's advert is everywhere. ₦2 million of it. Bisi has 214 followers and 11 of them are her cousins. 😅\n\nShe can't outspend them. So she types one word in a DM: GIF.",
        ask: "Can't outspend the big players?" },
      { cover: "Two pictures. A handful of words. One sticker.",
        previously: "Bisi can't afford ads, so she decided to make a sticker instead.",
        beats: [
          ["10:15 AM", "Picture one: a plain tray of puff-puff on her counter.",
           "Picture two: the same tray, styled and glowing."],
          ["10:20 AM", "Her words: “Small chops by Bisi. Taste first.”",
           "Her tags: smallchops, puffpuff, ibadan, party. Two minutes, start to finish."],
        ],
        twist: ["Thursday · 8:47 PM", "Someone with 400,000 followers uses it in their story.",
                "Bisi has no idea who they are. Yet."],
        close: "Send me your two pictures.",
        caption: "Picture one: a plain tray of puff-puff. Picture two: the same tray, styled. Her words: “Small chops by Bisi. Taste first.” Her tags: smallchops, puffpuff, ibadan.\n\nTwo minutes in a chat.\n\nThen on Thursday night, someone with 400,000 followers put it in their story. 😳",
        ask: "Got two pictures and something to sell?" },
      { cover: "A stranger with 400,000 followers just used Bisi's sticker.",
        previously: "Bisi made a GIF sticker. A huge account used it in their story.",
        beats: [
          ["8:51 PM", "It's a comedian, searching “puff puff” for a skit.",
           "Bisi's sticker was the top result. Her name just reached 400,000 people."],
          ["11:00 PM", "63 DMs. Her phone is hot in her hand.",
           "“Do you deliver to Bodija?” “Can you do 300 pieces?” “Are you the sticker girl?”"],
        ],
        twist: ["Friday · 9:12 AM", "Then her phone rings. Unknown number.", "It's the big caterer."],
        close: "Get your business into strangers' stories.",
        caption: "It was a comedian, searching “puff puff” for a skit. Bisi's sticker was the top result.\n\n63 DMs by 11pm. “Do you deliver to Bodija?” “Can you do 300 pieces?” “Are you the sticker girl?” 😂\n\nThen on Friday morning, her phone rang. The big caterer. 📞",
        ask: "Want strangers carrying your name?" },
      { cover: "The big caterer called Bisi. Not to complain.",
        previously: "Bisi's sticker went everywhere. Then the big caterer called.",
        beats: [
          ["Friday · 9:13 AM", "“We have a 500-guest wedding. Our kitchen can't cover the small chops.”",
           "“We want to subcontract to you.”"],
          ["One month later", "60 orders. Two new helpers. A real price list.",
           "The sticker is still out there, still working. She made it once."],
        ],
        twist: ["Next Monday on Photo Wahala", "Dayo's flash died during the first dance. He didn't notice for four minutes.",
                "And a senior photographer is circling."],
        close: "Let other people's stories carry your name.",
        caption: "“We have a 500-guest wedding and our kitchen can't cover the small chops. We want to subcontract to you.” 🤯\n\nOne month later: 60 orders, two new helpers, a real price list.\n\nThe sticker is still out there, still working. She made it once. 🍢",
        ask: "Let other people's stories carry your name." },
    ],
  },

  // ── 7 ─────────────────────────────────────────────────────────────────────
  {
    title: "The Flash Died", product: "relight", trigger: "LIGHT",
    tags: ["#weddingphotographer", "#naijaphotographers", "#photographylife"],
    photos: "A dark, underexposed reception or first-dance photo from a real shoot, and the relit version. Both people in it must have agreed to appear in a story." + CAST,
    eps: [
      { cover: "Dayo's flash died during the first dance. He didn't notice for four minutes.",
        beats: [
          ["Saturday · 9:47 PM", "The most important four minutes of the wedding.",
           "The couple. The spotlight. Dayo in position, shooting fast."],
          ["9:51 PM", "He checks his screen. Black. Black. Black.",
           "The flash battery died on the second frame. 300 shots of shadows."],
          ["Senior photographer · 9:53 PM", "“This is what happens when couples hire small boys.”",
           "Femi. Thirty years in the game. Shooting the same wedding for the groom's family."],
        ],
        twist: ["Sunday · 10:00 AM · The bride", "“Dayo, can we see the first-dance photos? We're posting tonight.”"],
        close: "Photographers: send me the frames your flash ruined.",
        caption: "Photographers, you know this feeling. 😰\n\nDayo's flash died during the first dance and he didn't notice for four minutes. 300 shots of shadows. The most important four minutes of the wedding.\n\nFemi, thirty years in the game: “This is what happens when couples hire small boys.”\n\nThen the bride: “We're posting the first-dance photos tonight.”",
        ask: "Photographers: got frames your flash ruined?" },
      { cover: "The bride wants the first-dance photos tonight. All 300 are black.",
        previously: "Dayo's flash died during the first dance. The bride wants the photos tonight.",
        beats: [
          ["Sunday · 10:30 AM", "Femi calls the couple. “I can restage the first dance. ₦200,000.”",
           "Same outfits. Same hall. A fake version of the real moment."],
          ["11:00 AM", "Dayo picks his 12 best dark frames. The real ones.",
           "Her eyes closed, laughing. His hand on her back. Real, and too dark to see."],
        ],
        twist: ["11:04 AM", "He sends all 12 to be relit.", "The couple has given Femi until 6 PM."],
        close: "Send me the moment you can't restage.",
        caption: "Femi called the couple: “I can restage the first dance. ₦200,000.” Same outfits, same hall, a fake version of the real moment. 🙄\n\nDayo picked his 12 best dark frames instead. Her eyes closed, laughing. His hand on her back. Real, and too dark to see.\n\nHe sent them off. The couple gave Femi until 6pm. ⏳",
        ask: "Got a moment you can't restage?" },
      { cover: "Twelve relit frames. And Femi is already in the couple's living room.",
        previously: "Dayo sent 12 dark first-dance frames to be relit. Femi offered to fake the moment.",
        beats: [
          ["Sunday · 4:10 PM", "The 12 frames come back. The dance is visible again.",
           "Spotlight on them. Warm hall behind. Every expression exactly as it happened."],
          ["4:30 PM", "Dayo drives to the couple's house. Femi's car is outside.",
           "Femi is showing them his portfolio. On a tablet. With a stand."],
        ],
        twist: ["4:41 PM", "The bride turns to Dayo. “Well? Do you have them or not?”"],
        close: "Get the frames back before the deadline.",
        caption: "4:10pm. The 12 frames came back. Spotlight on the couple, the hall warm behind them, every expression exactly as it happened.\n\nDayo drove straight over. Femi's car was already outside. Portfolio on a tablet. With a stand. 🙄\n\nThe bride turned to Dayo: “Well? Do you have them or not?”",
        ask: "Racing a deadline with dark frames?" },
      { cover: "Dayo hands the bride his phone. Femi leans in to see.",
        previously: "Dayo's relit photos arrived just as Femi tried to take his clients.",
        beats: [
          ["4:42 PM", "The bride sees frame one and starts crying.",
           "“That's exactly how it felt.” The groom: “Book him for our anniversary.”"],
          ["Femi · 4:50 PM · The driveway", "“Small boy... who edited those?”",
           "Dayo smiles and gets in his car."],
        ],
        twist: ["Next Monday on Photo Wahala", "Emeka's wife is abroad. Their daughter turns five. He has one job.",
                "And his mother-in-law is in the family group chat."],
        close: "Photographers: send me the frames your flash ruined.",
        caption: "The bride saw frame one and started crying. “That's exactly how it felt.” 😭\n\nThe groom: “Book him for our anniversary.”\n\nAnd in the driveway, Femi, thirty years in the game: “Small boy... who edited those?” 😏\n\nDayo smiled and got in his car.",
        ask: "Photographers: got frames your flash ruined?" },
    ],
  },

  // ── 8 ─────────────────────────────────────────────────────────────────────
  {
    title: "Daddy's Turn", product: "studio", trigger: "STUDIO",
    tags: ["#girldad", "#nigerianfamily", "#kidsbirthday"],
    photos: "A child's birthday photo taken at home by a parent, cluttered background welcome, and the studio version. You need the parent's permission for a child." + CAST,
    eps: [
      { cover: "His wife is in Canada. Their daughter turns five today. Emeka has one job.",
        beats: [
          ["Video call · 7:00 AM", "“Take proper photos, Emeka. Not your usual ones.”",
           "“My usual ones are fine.” They are not fine."],
          ["Saturday · 3:00 PM", "Cake. Balloons. Nine children. One dad.",
           "He takes 140 photos, between cutting cake and stopping a balloon fight."],
          ["9:12 PM", "He checks them. Blurry. Blurry. Thumb. Blurry.",
           "One clear one: Adaeze in her dress, laughing, in front of the washing machine."],
        ],
        twist: ["Family group · 9:20 PM", "His mother-in-law: “Emeka, we are waiting for the photos. ALL of us.”",
                "34 relatives. Online."],
        close: "Send me the one clear photo you've got.",
        caption: "Emeka's wife is in Canada. Their daughter turns five. He had one job: “Take proper photos. Not your usual ones.”\n\n140 photos later: blurry, blurry, thumb, blurry. One clear one, with a washing machine in it. 🫠\n\nThen the family group: “Emeka, we are waiting for the photos. ALL of us.” 34 relatives. Online.",
        ask: "Got one clear photo with a washing machine in it?" },
      { cover: "34 relatives are waiting. Emeka has one photo. It has a washing machine in it.",
        previously: "Emeka's only clear photo of his daughter's fifth birthday has a washing machine in it.",
        beats: [
          ["9:31 PM", "He sends that one photo off. Asks for a studio backdrop.",
           "His note: “Please. My mother-in-law is in the group.”"],
          ["10:05 PM", "It comes back. Adaeze, laughing, in a real studio portrait.",
           "Same dress. Same gap in her teeth. No washing machine."],
        ],
        twist: ["10:06 PM", "His mother-in-law is online. He hovers over send.", "He presses it."],
        close: "Send me the photo with the washing machine in it.",
        caption: "Emeka sent off the one clear photo. Request: studio backdrop. Note: “Please. My mother-in-law is in the group.” 😂\n\n10:05pm: Adaeze, laughing, in a real studio portrait. Same dress. Same gap in her teeth. No washing machine.\n\nHis mother-in-law was online. He pressed send.",
        ask: "Got the photo with the washing machine in it?" },
      { cover: "Emeka sent the photo. His mother-in-law has seen it.",
        previously: "Emeka turned a laundry-room photo into a studio portrait and sent it to the family.",
        beats: [
          ["10:06 PM", "Two blue ticks. Mother-in-law: typing...",
           "34 relatives watching the same three dots."],
          ["10:09 PM", "“Emeka. Which studio did you take her to?”",
           "He didn't take her anywhere. He was stopping a balloon fight."],
        ],
        twist: ["10:10 PM", "Then his phone rings. It's Canada.", "His wife. Crying."],
        close: "Get the photo that makes someone cry the good tears.",
        caption: "Two blue ticks. Mother-in-law: typing... 34 relatives watching the same three dots. 😬\n\n“Emeka. Which studio did you take her to?”\n\nHe didn't take her anywhere. He was busy stopping a balloon fight.\n\nThen his phone rang. Canada. His wife. Crying.",
        ask: "Want the photo that makes someone cry the good tears?" },
      { cover: "His wife is crying in Canada. Happy tears.",
        previously: "Emeka's studio portrait of their daughter reached his wife abroad.",
        beats: [
          ["Video call · 10:11 PM", "“Emeka... you did this? You?”",
           "She's printing it tomorrow. For her desk. 9,000 kilometres away."],
          ["Family group · 10:30 PM", "His mother-in-law changes her profile picture.",
           "It's Adaeze's portrait. Her status: “My grandchild. Her father tried.”"],
        ],
        twist: ["Next Monday on Photo Wahala", "Ngozi waited four years for her induction. The photographer never showed up.",
                "Her mother travelled six hours to be there."],
        close: "Your turn to be the parent who got the photo.",
        caption: "“Emeka... you did this? YOU?” 😭\n\nShe's printing it for her desk, 9,000 kilometres away.\n\nAnd his mother-in-law? New profile picture. Adaeze's portrait. Status: “My grandchild. Her father tried.” 😂❤️",
        ask: "Your turn to be the parent who got the photo." },
    ],
  },

  // ── 9 ─────────────────────────────────────────────────────────────────────
  {
    title: "The Induction", product: "shoot", trigger: "BOOK",
    tags: ["#nursesofnigeria", "#inductionday", "#nursing"],
    photos: "A nurse in uniform: one imperfect phone photo from a ceremony, and the set of five the shoot produced." + CAST,
    eps: [
      { cover: "Four years of nursing school. The photographer never showed up.",
        beats: [
          ["Induction day · 9:00 AM", "Ngozi's white uniform is ironed to a blade.",
           "Her mother left the village at 3 AM to be here. Six hours by bus."],
          ["11:30 AM", "The class photographer's phone is switched off.",
           "Everyone paid him ₦15,000 in March."],
          ["1:00 PM", "The ceremony ends. The only photos are on her cousin's cracked phone.",
           "Ngozi, squinting in the noon sun. Cap crooked. Her mother cut off at the shoulder."],
        ],
        twist: ["Bus park · 4:00 PM", "Her mother: “Send me one for the parlour wall. The one everyone will see.”",
                "Ngozi has nothing she'd put on a wall."],
        close: "Send me the one photo from the day.",
        caption: "Four years of nursing school. Uniform ironed to a blade. Her mother left the village at 3am to be there. 🩺\n\nThe class photographer? Phone switched off. Everyone paid him in March.\n\nThe only photos are on a cousin's cracked phone. And at the bus park, her mother says: “Send me one for the parlour wall.”",
        ask: "Only got cracked-phone photos of your big day?" },
      { cover: "Her mother wants one for the parlour wall. Ngozi has nothing.",
        previously: "Ngozi's induction photographer vanished. Her only photos are on a cracked phone.",
        beats: [
          ["Monday · 10:00 PM", "Ngozi picks the least bad one. Squinting, but smiling.",
           "The uniform is right. That's what matters. Everything else can change."],
          ["10:20 PM", "She uploads it. Chooses a set of five.",
           "Cap straight. Proper light. No squinting."],
        ],
        twist: ["10:50 PM", "Five come back. In the third one, she looks exactly like her mother.",
                "She has never seen it before."],
        close: "Send me the photo the photographer should have taken.",
        caption: "Ngozi picked the least bad one. Squinting, but smiling. The uniform was right, and that's what mattered.\n\nShe uploaded it and chose a set of five.\n\nAt 10:50pm they came back. And in the third one, she looks exactly like her mother. She'd never seen it before. 🥹",
        ask: "Want the photo the photographer should have taken?" },
      { cover: "In one of the five photos, Ngozi looks exactly like her mother.",
        previously: "Ngozi turned one cracked-phone induction photo into a set of five portraits.",
        beats: [
          ["Tuesday · 7:00 AM", "She sends all five to her mother. No caption.",
           "Delivered. Delivered. Read."],
          ["Tuesday · noon", "No reply all morning.",
           "Her mother replies to everything within a minute. Even forwarded messages."],
        ],
        twist: ["4:00 PM", "Three missed calls from the village.", "Then a photo arrives."],
        close: "Get the portrait your family will frame.",
        caption: "Ngozi sent all five to her mother. No caption. Delivered. Read.\n\nThen nothing. All morning. From a woman who replies to forwarded messages within a minute. 😟\n\nAt 4pm: three missed calls from the village. Then a photo arrives.",
        ask: "Want the portrait your family will frame?" },
      { cover: "The photo from the village. Ngozi opens it.",
        previously: "Ngozi sent her induction portraits home. Her mother went silent all day.",
        beats: [
          ["4:02 PM", "It's the parlour wall. Her portrait, already framed.",
           "Her mother took the bus to town to print it. That's why she didn't reply."],
          ["4:05 PM · Voice note", "“Everybody who enters this house will see my daughter, the nurse.”",
           "Ngozi plays it eleven times."],
        ],
        twist: ["Next Monday on Photo Wahala", "Seyi proposed on a rooftop at night. She said yes. The photos said nothing.",
                "And her brother never liked him."],
        close: "Give your family the photo they've been waiting for.",
        caption: "The photo from the village: the parlour wall. Ngozi's portrait, already framed. Her mother had taken the bus to town to print it. That's why she was silent. 😭\n\nThen a voice note: “Everybody who enters this house will see my daughter, the nurse.”\n\nNgozi played it eleven times.",
        ask: "Give your family the photo they've been waiting for." },
    ],
  },

  // ── 10 ────────────────────────────────────────────────────────────────────
  {
    title: "The Proposal in the Dark", product: "relight", trigger: "LIGHT",
    tags: ["#shesaidyes", "#proposal", "#naijalove"],
    photos: "A couple photographed at night, too dark to see, and the relit version. Both people must have agreed to appear in a story." + CAST,
    eps: [
      { cover: "He proposed on a rooftop at night. She said yes. The photos said nothing.",
        beats: [
          ["Friday · 9:40 PM", "Seyi on one knee. Ronke's hands over her mouth.",
           "City lights behind them. His friend Kunle hiding behind a plant, shooting everything."],
          ["9:42 PM", "“SHE SAID YES!” The whole rooftop claps.",
           "Kunle gives Seyi a thumbs up. A confident thumbs up."],
          ["11:15 PM", "Seyi opens the photos. Black sky. Black rooftop. Two faint shapes.",
           "Kunle: “Ah. The flash was off.”"],
        ],
        twist: ["Her brother Wale · 11:30 PM", "“Congratulations. So where are the pictures? Or there's no photographer?”",
                "Wale has never liked Seyi."],
        close: "Send me the moment you can never redo.",
        caption: "Seyi on one knee. Ronke's hands over her mouth. City lights behind them. “SHE SAID YES!” 💍\n\nHis friend Kunle shot everything from behind a plant. Confident thumbs up.\n\n11:15pm: black sky, black rooftop, two faint shapes. “Ah. The flash was off.” 🤦🏾‍♂️\n\nThen her brother Wale: “So where are the pictures?”",
        ask: "Got a moment you can never redo, in the dark?" },
      { cover: "Her brother wants the proposal photos. Every one of them is black.",
        previously: "Seyi's proposal photos came out completely dark. Ronke's brother is asking for them.",
        beats: [
          ["12:10 AM", "Ronke: “Don't worry. Nobody needs to see them.”",
           "Seyi: “Your entire family needs to see them.” He's right about her family."],
          ["12:30 AM", "He picks four frames. Her face. The ring. The yes.",
           "Every one of them a shadow. Every one of them real."],
        ],
        twist: ["12:34 AM", "He sends them to be relit. Then a message from Wale.",
                "“Family meeting. Sunday. Bring your pictures.”"],
        close: "Send me your photos before the family meeting.",
        caption: "Ronke: “Don't worry. Nobody needs to see them.”\nSeyi: “Your entire family needs to see them.”\n\nHe picked four frames. Her face. The ring. The yes. Every one a shadow. Every one real.\n\nHe sent them off. Then Wale: “Family meeting. Sunday. Bring your pictures.” 😬",
        ask: "Got photos the family needs to see?" },
      { cover: "Family meeting. Sunday. Seyi has to bring the pictures.",
        previously: "Seyi sent his dark proposal photos to be relit. Ronke's brother called a family meeting.",
        beats: [
          ["Saturday · 1:22 AM", "The four frames come back. Seyi sits up in bed.",
           "Ronke's face, lit warm. The ring catching light. The city glowing behind them."],
          ["Sunday · 5:00 PM", "Uncles. Aunties. Wale by the door, arms folded.",
           "Ronke's mother: “Show us the pictures, my son.”"],
        ],
        twist: ["5:01 PM", "Wale steps forward. “I'll look first.”"],
        close: "Get the photos ready before anyone asks.",
        caption: "1:22am: the four frames came back. Ronke's face lit warm. The ring catching the light. The city glowing behind them. ✨\n\nSunday, 5pm. Uncles. Aunties. Wale by the door, arms folded.\n\n“Show us the pictures, my son.”\n\nWale steps forward: “I'll look first.” 😳",
        ask: "Get the photos ready before anyone asks." },
      { cover: "Wale is looking at the proposal photos. The room is silent.",
        previously: "Seyi brought his relit proposal photos to the family meeting. Wale looked first.",
        beats: [
          ["5:02 PM", "Wale scrolls. Stops. Scrolls back. Stops again.",
           "His sister on a rooftop, saying yes. He has never seen her this happy."],
          ["5:04 PM", "“...You did well.”",
           "Three words from Wale. Later, at the gate, he asks who fixed the photos. His wedding is in March."],
        ],
        twist: ["Next Monday · Season finale", "Six years for a four-year degree. Zainab finally graduates.",
                "And her convocation photos are a disaster."],
        close: "Send me the night you'll tell your grandchildren about.",
        caption: "Wale scrolled. Stopped. Scrolled back. His sister on a rooftop, saying yes.\n\n“...You did well.”\n\nThree words. Ronke's mother had to sit down. 😂\n\nLater, at the gate, Wale quietly asked Seyi who fixed the photos. His own wedding is in March.",
        ask: "Got a night you'll tell your grandchildren about?" },
    ],
  },

  // ── 11 — season finale ────────────────────────────────────────────────────
  {
    title: "Six Years, First Class", product: "shoot", trigger: "BOOK",
    tags: ["#convocation", "#firstclass", "#nigeriangraduate"],
    photos: "A graduate in gown photographed in harsh midday sun, and the set the shoot produced." + CAST,
    eps: [
      { cover: "A four-year degree took six years. Zainab finally graduates.",
        beats: [
          ["Convocation · 12:30 PM", "Two strikes. One lecturer who lost her project. Twice.",
           "First class anyway."],
          ["1:10 PM", "The official photographer: “₦20,000 per print. Smile!”",
           "Noon sun, straight down. Everybody squinting like they're being questioned."],
          ["1:45 PM", "Her family photos: squinting. Mum's hand over her eyes.",
           "Zainab can't see her own face in a single one."],
        ],
        twist: ["Her old classmate · 9:00 PM", "“Congrats o. At least you finally finished.”",
                "She graduated two years ago. Second class lower."],
        close: "Send me the photo from the day you earned.",
        caption: "A four-year degree. It took six years. Two strikes. One lecturer who lost her project. Twice.\n\nFirst class anyway. 🎓\n\nThe photos: noon sun, everybody squinting like they're being questioned, Mum's hand over her eyes.\n\nThen her old classmate: “Congrats o. At least you finally finished.” 🙃",
        ask: "Did the sun ruin the day you earned?" },
      { cover: "Six years of work. One squinting photo to show for it.",
        previously: "Zainab graduated with a first after six years. Her convocation photos are a disaster.",
        beats: [
          ["Sunday · 11:00 PM", "Zainab finds one photo where her eyes are open.",
           "Gown on. Cap straight. Mum blinking beside her. It's enough."],
          ["11:15 PM", "She orders a set of ten from that one photo.",
           "Same face. Same gown. Light that doesn't blind anyone."],
        ],
        twist: ["11:58 PM", "The set lands. She opens the first one and stops breathing.",
                "It's the photo she pictured in year two, the week she nearly quit."],
        close: "Send me the one photo where your eyes are open.",
        caption: "She found one photo where her eyes were open. Gown on, cap straight, Mum blinking beside her. Enough.\n\nShe ordered a set of ten from it.\n\nAt 11:58pm she opened the first one and stopped breathing. It was the photo she'd pictured in year two, the week she nearly quit. 🥹",
        ask: "Got one photo where your eyes are open?" },
      { cover: "Ten portraits. One post. Six years in a caption.",
        previously: "Zainab turned her one good convocation photo into a set of ten portraits.",
        beats: [
          ["Monday · 7:00 AM", "She writes her caption. Deletes it. Writes it again.",
           "Final version: “6 years. 2 strikes. 1 first class. 0 regrets.”"],
          ["7:01 AM", "She posts all ten. Puts her phone face down.",
           "By 7:40 AM: 400 likes. By noon: 3,000."],
        ],
        twist: ["12:15 PM", "A message from the classmate who mocked her.", "“Zainab... can I ask you something?”"],
        close: "Get the portraits you earned.",
        caption: "“6 years. 2 strikes. 1 first class. 0 regrets.” 🎓\n\nShe posted all ten and put her phone face down.\n\nBy 7:40am: 400 likes. By noon: 3,000.\n\nThen a message from the classmate who mocked her: “Zainab... can I ask you something?” 👀",
        ask: "Get the portraits you earned." },
      { cover: "The classmate who mocked Zainab needs a favour.",
        previously: "Zainab's graduation post went everywhere. Then her old classmate messaged her.",
        beats: [
          ["12:16 PM", "“Who did your photos? I have an interview on Friday and I look like a passport.”",
           "Zainab sends the link. With a smiley. A big one."],
          ["One week later", "Her mum prints the third portrait. The big size.",
           "Six years of work, on the wall, where the whole family can see it."],
        ],
        twist: ["That's the end of Season 1", "Which story was yours? Tell us in the comments.",
                "Season 2 is on now, every night at 7."],
        close: "Your story deserves a better photo too.",
        caption: "“Who did your photos? I have an interview on Friday and I look like a passport.” 😂\n\nZainab sent the link. With a smiley. A big one. 😊\n\nOne week later, the third portrait went up on her mum's wall. The big size.\n\nThat's the end of Season 1 of Photo Wahala. Which story was yours? Tell us in the comments. Season 2 is on now, every night at 7. 🎬",
        ask: "Your story deserves a better photo too." },
    ],
  },
];

export const PLAN3 = STORIES.flatMap((s, i) => [1, 2, 3, 4].map((ep) => episode(i + 1, ep, s)));
