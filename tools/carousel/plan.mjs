/**
 * Twelve weeks of carousels, written to the house formula.
 *
 * The copy structure is Sabri Suby's High-Value Content Offer, set out in
 * COPY-FORMULA.md next to this file: the cover uses one of four title formulas,
 * every body slide keeps the cover's promise, and the last slide is a directive.
 * `cards[0]` of every post is the cover. Do not improvise a cover.
 *
 * Two rules of this account sit on top of Suby, and both are enforced by the
 * app rather than left to whoever is typing:
 *
 *   The RENDERED slide 1 is a photograph, not the cover text. The app puts the
 *   before and after first and the cover card third, because slide one is the
 *   thumbnail — the 18 August post reached 20,907 opening on a photo, and the
 *   posts that opened on a text card reached 102 and 114. The cover's job is to
 *   hold the swipe that the photograph has already won.
 *
 *   The last card asks for ONE typed word. 444 comments carried that post, and
 *   comments are what Instagram spreads.
 *
 * `photos` names what the owner has to supply. Nothing renders without them,
 * which is deliberate: a carousel with no before/after is the kind of post that
 * reaches a hundred people.
 *
 * Four a week — Mon, Wed, Fri, Sun. Not fourteen: the account ran fourteen a
 * week for five weeks and then stopped dead for a month, and a pace nobody
 * keeps is worth less than a slower one they do.
 *
 * Every timeframe in here is one the studio can actually hit. "The same day"
 * and "by morning" are true; nothing claims an hour it cannot keep.
 */

/** The words that turn a scroll into a DM. One per product, never improvised. */
export const TRIGGERS = {
  studio: "STUDIO",
  relight: "LIGHT",
  assets: "ASSETS",
  gif: "GIF",
  // STUDIO, not SHOOT: the bot answers STUDIO with the shoot itself, and has
  // no SHOOT keyword — "Comment SHOOT" used to get silence.
  shoot: "STUDIO",
};

/** ₦1,000 a photo, said the same way every time so the price never looks invented. */
const PRICE = "₦1,000 for one photo. No subscription — you pay only for the photos you actually fix.";

/**
 * Suby's final slide: a directive, not a summary. One action, one word.
 *
 * The price line is a parameter because it is not the same for every product.
 * This card used to name ₦1,000 on every post, which quietly advertised a
 * five-image shoot and a GIF at the price of a single relit photo. Only the
 * per-photo products may carry PER_PHOTO; anything priced per package sends the
 * reader to the link for the real figure rather than guessing on the slide.
 */
const PER_PHOTO = `One photo, ₦1,000, back the same day.`;
const cta = (word, action, priceLine = PER_PHOTO) => ({
  eyebrow: "Do this now",
  headline: action,
  body: word === "GIF"
    // The GIF reply is not a link: the loop is made right there in the chat.
    ? "Comment GIF and we'll make it together, right there in the chat."
    : `Comment ${word} and I'll send you the link. ${priceLine}`,
});
/** For packages whose price depends on how many images you choose. */
const SEE_PRICES = "The link has the packages and what each one costs.";

export const PLAN = [
  // ───────────────────────── MONTH 1 — rebuild the habit ─────────────────────
  {
    id: "p01", week: 1, slot: "A", product: "studio", trigger: "STUDIO",
    title: "Phone to studio — the party dress",
    photos: "A child photographed at home against a plain wall, and the same photo turned into a studio portrait",
    cards: [
      { headline: "3 Ways to Get a Studio Portrait of Your Child Without Ever Leaving Your Sitting Room",
        body: "Same dress. Same child. Same day." },
      { eyebrow: "The problem",
        headline: "A sitting room is not a studio.",
        body: "One window, a wall two feet behind her, and nothing separating child from background. That is why it reads as a snapshot instead of a portrait." },
      { eyebrow: "Way 1",
        headline: "Move the background back.",
        body: "A studio sets the backdrop metres behind you. We do it afterwards, so she stands apart from the wall instead of against it." },
      { eyebrow: "Way 2",
        headline: "Light her from the side.",
        body: "Side light is what gives a face shape. Your window gave her flat light from one direction and shadow everywhere else." },
      { eyebrow: "Way 3",
        headline: "Change the room, never the child.",
        body: "Same face, same dress, same smile. If the child changes, the job was done wrong." },
      { eyebrow: "What it costs",
        headline: "No studio. No appointment. No dressing up twice.",
        body: PRICE },
      cta("STUDIO", "Send me the photo you already took."),
    ],
    caption:
      "3 ways to get a studio portrait of your child without ever leaving your sitting room.\n\n" +
      "You already took the photo. It just happened to be taken against the nearest wall.\n\n" +
      "A studio does three things a house cannot. It sets the background metres back so she stands apart from it. It lights her from the side, which is what gives a face shape. And it changes nothing at all about the child.\n\n" +
      "All three can happen after the photo is taken. Same dress, same day.\n\n" +
      "₦1,000 for one photo.\n\n" +
      "💬 Comment STUDIO and I'll send you the link.\n\n" +
      "#abujaphotographer #nigerianchildren #studioportrait #kiddiesfashion #aluxart",
  },
  {
    id: "p02", week: 1, slot: "B", product: "relight", trigger: "LIGHT",
    title: "Relight — the club photo",
    photos: "A photo taken in a dark club or bar under coloured light, and the relit version",
    cards: [
      { headline: "How to Fix Every Dark Club Photo on Your Phone Without a Camera, a Flash or a Reshoot — The Same Day",
        body: "Same night. Same outfit. Lit like you brought a flash." },
      { eyebrow: "The problem",
        headline: "It was never your phone's fault.",
        body: "A small sensor in a dark room has two options: hold the shutter open, or turn up the gain. One gives you blur, the other noise. Yours did both." },
      { eyebrow: "Why editing fails",
        headline: "Brightening a dark photo is not the same as lighting it.",
        body: "Turning up the exposure lifts the noise with it and leaves the colour wrong. The light has to be put back where it should have come from." },
      { eyebrow: "The fix",
        headline: "The flash arrives afterwards.",
        body: "Nobody carries a flash to a club. So the light is added later — from the side, where it gives your face shape instead of flattening it." },
      { eyebrow: "What it costs",
        headline: "No camera. No flash. No second night out.",
        body: PRICE },
      cta("LIGHT", "Send me the darkest photo on your phone."),
    ],
    caption:
      "How to fix every dark club photo on your phone without a camera, a flash or a reshoot — the same day.\n\n" +
      "The club was too dark for your phone, and that was never your fault. A small sensor in a dark room either holds the shutter open or cranks the gain. One gives you blur, the other noise.\n\n" +
      "Brightening it afterwards does not help, because brightening lifts the noise too and leaves the colour wrong. The light has to be put back where it should have come from in the first place.\n\n" +
      "Which can happen after the night is over. Same outfit, same night, lit like you brought a flash.\n\n" +
      "₦1,000 for one photo.\n\n" +
      "💬 Comment LIGHT and I'll send you the link.\n\n" +
      "#lagosnightlife #nigerianphotographer #phonephotography #lowlightphotography #aluxart",
  },
  {
    id: "p03", week: 1, slot: "C", product: "assets", trigger: "ASSETS",
    title: "Asset extractor — the dress on a hanger",
    photos: "A garment photographed on a hanger or rail, and the same garment extracted on its own",
    cards: [
      { headline: "Photograph Your Stock Like a Big Brand Even Without a Model, a Mannequin or a Studio",
        body: "One photo on a hanger in. Four clean angles out." },
      { eyebrow: "The problem",
        headline: "Buyers cannot picture it from a hanger.",
        body: "A garment on a rail reads as stock. A garment with shape reads as something you could wear on Saturday." },
      { eyebrow: "What a brand has that you don't",
        headline: "Front, three-quarter, side, back.",
        body: "That is the set every big label shoots, and it is the set that answers a buyer's questions before they have to type them." },
      { eyebrow: "What you send",
        headline: "One photo of the item. That is all.",
        body: "On a hanger, on a rail, on your bed. The garment is lifted out and rebuilt with real shape and real fabric fall." },
      { eyebrow: "It is not only clothes",
        headline: "Wigs, shoes, bags, jewellery, nails.",
        body: "Anything you sell. ₦1,000 per photo." },
      cta("ASSETS", "Send me one photo of your best piece."),
    ],
    caption:
      "Photograph your stock like a big brand even without a model, a mannequin or a studio.\n\n" +
      "Your dress is beautiful. The hanger is doing it no favours.\n\n" +
      "A buyer scrolling cannot tell how a garment falls from a photo of it hanging flat, so they ask — and half of them never ask, they just scroll. What a big label has that you don't is the four-angle set: front, three-quarter, side, back.\n\n" +
      "Send one photo of the item and that set comes back. No model, no mannequin, no reshoot.\n\n" +
      "₦1,000 per photo.\n\n" +
      "💬 Comment ASSETS and I'll send you the link.\n\n" +
      "#nigerianfashion #abujavendor #onlinevendor #fashionbusiness #aluxart",
  },
  {
    id: "p04", week: 1, slot: "D", product: "relight", trigger: "LIGHT",
    title: "Best pair of the week",
    photos: "Whichever before/after you have this week that reads most clearly at thumbnail size",
    cards: [
      { headline: "Get a Photo Worth Posting Without Taking a Single New One",
        body: "Same room. Same phone. One light moved." },
      { eyebrow: "That is the whole service",
        headline: "You send the photo you already have.",
        body: PRICE },
      cta("LIGHT", "Send me one."),
    ],
    caption:
      "Get a photo worth posting without taking a single new one.\n\n" +
      "Same room. Same phone. One light moved.\n\n" +
      "₦1,000 for one photo, back the same day.\n\n" +
      "💬 Comment LIGHT and I'll send you the link.\n\n#aluxart #nigerianphotographer",
  },
  {
    id: "p05", week: 2, slot: "A", product: "studio", trigger: "STUDIO",
    title: "Phone to studio — the staircase",
    photos: "Someone photographed on a staircase or corridor at home, and the studio version",
    cards: [
      { headline: "Get a Proper Family Portrait in One Day Even if the Only Clean Wall in Your House Is the Staircase",
        body: "Keep the outfit. Keep the day. Change the room." },
      { eyebrow: "The problem",
        headline: "Standing against a wall flattens a photograph.",
        body: "Light hits you and the wall equally, so nothing separates you from the background and the picture reads flat." },
      { eyebrow: "What a studio actually does",
        headline: "It creates depth.",
        body: "The backdrop sits metres back and is lit on its own. That separation is the thing no filter can fake." },
      { eyebrow: "Done afterwards",
        headline: "Nobody has to get dressed twice.",
        body: "Same outfit, same faces, same afternoon — in a room that does them justice." },
      { eyebrow: "What it costs",
        headline: "One photo, back the same day.",
        body: PRICE },
      cta("STUDIO", "Send me your staircase photo."),
    ],
    caption:
      "Get a proper family portrait in one day even if the only clean wall in your house is the staircase.\n\n" +
      "Every Nigerian family has this photo. The outfit is beautiful, everyone is finally ready, and the only clear background in the house is the stairs.\n\n" +
      "The problem is not the staircase. It is that you are standing against it — light falls on you and the wall together, so there is no separation and the picture goes flat.\n\n" +
      "A studio solves it by moving the background back and lighting it on its own. That can be done after the photo is taken, and nobody has to get dressed twice.\n\n" +
      "₦1,000 for one photo.\n\n" +
      "💬 Comment STUDIO and I'll send you the link.\n\n" +
      "#abujaphotographer #studioportrait #nigerianfamily #aluxart",
  },
  {
    id: "p06", week: 2, slot: "B", product: "relight", trigger: "LIGHT",
    title: "Relight — owambe yellow",
    photos: "An owambe or hall photo with a yellow cast, and the corrected version",
    cards: [
      { headline: "How to Get Your Real Skin Tone Back From Any Owambe Photo Without Filters, Apps or Editing Skills",
        body: "The hall was yellow. You are not." },
      { eyebrow: "The problem",
        headline: "Canopy bulbs wash the whole room.",
        body: "Hall lighting is warm, cheap and everywhere, so every face under it picks up the same orange." },
      { eyebrow: "Then it gets worse",
        headline: "Your phone balances for the brightest thing in frame.",
        body: "Usually a white canopy. Which pushes every person in the photo further orange, not less." },
      { eyebrow: "Why a filter won't do it",
        headline: "This is a colour problem, not a brightness problem.",
        body: "No amount of brightening corrects a cast. The light has to be rebuilt neutral, and then your real skin tone comes back on its own." },
      { eyebrow: "What it costs",
        headline: "Your skin tone is not a filter setting.",
        body: PRICE },
      cta("LIGHT", "Send me your asoebi photo."),
    ],
    caption:
      "How to get your real skin tone back from any owambe photo without filters, apps or editing skills.\n\n" +
      "Owambe light is yellow. Your skin is not.\n\n" +
      "Those warm canopy bulbs wash every face in the hall the same colour, and your phone makes it worse by balancing for the brightest thing in frame — usually a white canopy. You come out orange.\n\n" +
      "No filter fixes that, because it is a colour problem and not a brightness one. Rebuild the light neutral and your real skin tone comes back by itself.\n\n" +
      "₦1,000 for one photo.\n\n" +
      "💬 Comment LIGHT and I'll send you the link.\n\n" +
      "#owambe #nigerianwedding #asoebi #lagosparty #aluxart",
  },
  {
    id: "p07", week: 2, slot: "C", product: "gif", trigger: "GIF",
    title: "GIF maker — what it is",
    photos: "A before/after pair that will become the GIF itself",
    cards: [
      { headline: "4 Ways to Advertise Your Business All Year Without Paying for a Single Ad",
        body: "One sticker. Your pictures, your words." },
      { eyebrow: "The problem",
        headline: "An advert stops working the day you stop paying.",
        body: "A sticker does not. People keep using it long after you made it." },
      { eyebrow: "Way 1",
        headline: "It goes where you cannot.",
        body: "Into other people's stories, under other people's posts. Your words travel with it." },
      { eyebrow: "Way 2",
        headline: "Your message is built in.",
        body: "Up to six scenes — your pictures, your lines, your website on the last frame." },
      { eyebrow: "Way 3",
        headline: "People search for it.",
        body: "You pick the tags. Anybody looking for that word finds your business." },
      { eyebrow: "Way 4",
        headline: "It costs you once.",
        body: "Made in a chat in about two minutes. Send the pictures, type the words, post it." },
      cta("GIF", "Send me two pictures and your tagline.", SEE_PRICES),
    ],
    caption:
      "4 ways to advertise your business all year without paying for a single ad.\n\n" +
      "Most adverts stop working the moment you stop paying. A sticker does not.\n\n" +
      "One: it goes into other people's stories, where you could never buy a place. Two: your words and your website are built into it. Three: you choose the search tags, so people looking for that word find you. Four: you make it once.\n\n" +
      "Send two pictures and the lines you want on them, and it comes back ready to post — about two minutes of work in a chat.\n\n" +
      "💬 Comment GIF and we'll make yours right there in the chat.\n\n" +
      "#instagramstickers #smallbusinessnigeria #aluxart",
  },
  {
    id: "p08", week: 2, slot: "D", product: "relight", trigger: "LIGHT",
    title: "Best pair of the week",
    photos: "The strongest before/after you have this week",
    cards: [
      { headline: "Turn the Photo You Were About to Delete Into the One You Post — Without Taking It Again",
        body: "You already took it. Only the light changed." },
      { eyebrow: "Why it works",
        headline: "Dark is not the same as ruined.",
        body: "The detail is usually still there, under the noise. " + PRICE },
      cta("LIGHT", "Send me the one you were about to delete."),
    ],
    caption:
      "Turn the photo you were about to delete into the one you post — without taking it again.\n\n" +
      "Dark is not the same as ruined. The detail is usually still in there, buried under noise and the wrong colour.\n\n" +
      "₦1,000 for one photo, back the same day.\n\n" +
      "💬 Comment LIGHT and I'll send you the link.\n\n#aluxart",
  },
  {
    id: "p09", week: 3, slot: "A", product: "studio", trigger: "STUDIO",
    title: "Phone to studio — the birthday",
    photos: "A birthday photo taken at home, and the studio version",
    cards: [
      { headline: "Give Your Child a Birthday Portrait Worth Framing Even Though the Party Is Already Over",
        body: "No second birthday required." },
      { eyebrow: "The problem",
        headline: "Nobody plans the background on a birthday.",
        body: "There is a cake, there is an outfit, and there is whatever wall happened to be free." },
      { eyebrow: "Why it matters",
        headline: "This is the photo you keep for twenty years.",
        body: "It is worth more than the wall it was taken against — and the wall is the only part you will wish were different." },
      { eyebrow: "Nothing is staged twice",
        headline: "The same moment, in a room that does it justice.",
        body: "Same cake, same face, same laugh. Only the room and the light are new." },
      { eyebrow: "What it costs",
        headline: "One photo, back the same day.",
        body: PRICE },
      cta("STUDIO", "Send me last birthday's photo."),
    ],
    caption:
      "Give your child a birthday portrait worth framing even though the party is already over.\n\n" +
      "Nobody plans the background on a birthday. There is a cake, there is an outfit, and there is whatever wall happened to be free.\n\n" +
      "Twenty years from now the wall is the only part you will wish were different. So keep the moment and change the room.\n\n" +
      "₦1,000 for one photo.\n\n" +
      "💬 Comment STUDIO and I'll send you the link.\n\n" +
      "#kidsbirthday #abujamums #studioportrait #aluxart",
  },
  {
    id: "p10", week: 3, slot: "B", product: "relight", trigger: "LIGHT",
    title: "Relight — church windows",
    photos: "A church or hall photo with blown-out highlights, and the relit version",
    cards: [
      { headline: "How to Save Every Church Photo Where the Windows Won — Without Reshooting a Thing",
        body: "Keep the window. Get the face back." },
      { eyebrow: "The problem",
        headline: "High windows are the hardest light there is.",
        body: "The light comes from far above, so eyes drop into shadow while foreheads and cheekbones blow out white." },
      { eyebrow: "Why your phone failed",
        headline: "It has to choose one or the other.",
        body: "Expose for the window and faces go dark. Expose for faces and the window burns out. A phone cannot hold both." },
      { eyebrow: "The fix",
        headline: "Afterwards, both can be held.",
        body: "The window keeps its detail and the faces get light that comes from in front of them instead of above." },
      { eyebrow: "What it costs",
        headline: "No reshoot. No second ceremony.",
        body: PRICE },
      cta("LIGHT", "Send me your church photo."),
    ],
    caption:
      "How to save every church photo where the windows won — without reshooting a thing.\n\n" +
      "Church light is the hardest light in Nigeria. It comes from high windows far above everyone, so eyes fall into shadow while foreheads go white.\n\n" +
      "Your phone had to choose: keep the window or keep the face. It cannot keep both.\n\n" +
      "Afterwards, both can be kept.\n\n₦1,000 for one photo.\n\n" +
      "💬 Comment LIGHT and I'll send you the link.\n\n" +
      "#churchwedding #nigerianchurch #dedication #aluxart",
  },
  {
    id: "p11", week: 3, slot: "C", product: "shoot", trigger: "STUDIO",
    title: "Full shoot — one photo, five images",
    photos: "One uploaded photo, and a grid of the five images it produced",
    cards: [
      { headline: "Get a Full Photoshoot in One Day Even if You've Never Set Foot in a Studio",
        body: "One photo in. Five images out." },
      { eyebrow: "The problem",
        headline: "A shoot costs a day and a deposit.",
        body: "Booking, travelling across the city, taking time off, and hoping the light is right when you get there." },
      { eyebrow: "What you send",
        headline: "One photo of yourself.",
        body: "That is the entire upload. No studio, no appointment, no second outfit." },
      { eyebrow: "What comes back",
        headline: "Five images, five setups.",
        body: "Different poses, framing and lighting — the same person throughout." },
      { eyebrow: "You choose the look",
        headline: "Portrait, editorial or corporate.",
        body: "The archive holds 197 lighting styles. Your identity is locked to your photo, never a lookalike." },
      cta("STUDIO", "Send me one photo of yourself.", SEE_PRICES),
    ],
    caption:
      "Get a full photoshoot in one day even if you've never set foot in a studio.\n\n" +
      "A shoot costs a deposit, a day off and a drive across the city, before anyone has taken a picture.\n\n" +
      "Send a single photo of yourself instead and it comes back as a set: five images, different poses, framing and lighting, the same face throughout. You pick the look — portrait, editorial or corporate.\n\n" +
      "💬 Comment STUDIO and I'll send you the link.\n\n" +
      "#portraitphotography #corporateheadshot #lagosbusiness #aluxart",
  },
  {
    id: "p12", week: 3, slot: "D", product: "relight", trigger: "LIGHT",
    title: "Best pair of the week",
    photos: "The strongest before/after you have this week",
    cards: [
      { headline: "Fix Last Night's Photo Before Lunch Today Even if You Have No Camera and No Editing Skills",
        body: "Send it in a chat. It comes back in the same chat." },
      { eyebrow: "What it costs",
        headline: "One photo. One thousand naira.",
        body: "No app to download, no account to make." },
      cta("LIGHT", "Send me last night's photo."),
    ],
    caption:
      "Fix last night's photo before lunch today even if you have no camera and no editing skills.\n\n" +
      "Send it in the chat, pay in the chat, get it back in the chat. ₦1,000.\n\n" +
      "💬 Comment LIGHT and I'll send you the link.\n\n#aluxart",
  },
  {
    id: "p13", week: 4, slot: "A", product: "studio", trigger: "STUDIO",
    title: "Phone to studio — two children",
    photos: "Two children photographed together at home, and the studio version",
    cards: [
      { headline: "Photograph Two Children Like a Studio Would Even Though They Only Sat Still Once",
        body: "You get one chance. The room gets fixed afterwards." },
      { eyebrow: "The problem",
        headline: "Getting both of them to look is the hard part.",
        body: "Still, both facing the camera, nobody crying. Nobody is reshooting that because of a wall." },
      { eyebrow: "So fix the other thing",
        headline: "The moment stays. The room changes.",
        body: "Same faces, same pose, same afternoon — with a backdrop that belongs behind them." },
      { eyebrow: "Both faces stay theirs",
        headline: "Two children, two identities, locked.",
        body: "Neither face is averaged, swapped or softened into the other." },
      { eyebrow: "What it costs",
        headline: "One photo is all it takes.",
        body: PRICE },
      cta("STUDIO", "Send me the one where they both looked."),
    ],
    caption:
      "Photograph two children like a studio would even though they only sat still once.\n\n" +
      "Getting two children to look at the camera at the same time is the hard part. Nobody is doing that twice because of a wall.\n\n" +
      "So keep the moment and change the room. Same faces, same pose, same afternoon.\n\n" +
      "₦1,000 for one photo.\n\n" +
      "💬 Comment STUDIO and I'll send you the link.\n\n" +
      "#siblings #nigerianchildren #familyportrait #aluxart",
  },
  {
    id: "p14", week: 4, slot: "B", product: "relight", trigger: "LIGHT",
    title: "Relight — direct flash",
    photos: "A direct-flash photo with flat skin and a black background, and the relit version",
    cards: [
      { headline: "How to Undo Everything Your Phone Flash Did to Your Face — Without Taking the Photo Again",
        body: "The flash fired. That was the problem." },
      { eyebrow: "The problem",
        headline: "A phone flash sits beside the lens.",
        body: "So the light hits you head-on, flattens every feature and drops anything behind you to black." },
      { eyebrow: "What you lost",
        headline: "Your cheekbones and your jawline.",
        body: "Shape in a face comes from shadow. Light from directly in front leaves nowhere for a shadow to fall." },
      { eyebrow: "The fix",
        headline: "Light from the side, added later.",
        body: "Same night, same outfit — lit the way a studio would have lit you, with the background back in the frame." },
      { eyebrow: "What it costs",
        headline: "No camera. No softbox. No reshoot.",
        body: PRICE },
      cta("LIGHT", "Send me a flash photo you hated."),
    ],
    caption:
      "How to undo everything your phone flash did to your face — without taking the photo again.\n\n" +
      "Your flash made you look like a suspect, and here is why. It sits right beside the lens, so it fires straight at you. Light from directly in front flattens every feature — no cheekbone, no jawline, nothing for a shadow to fall on — and anything more than a metre behind you goes black.\n\n" +
      "Shape in a face comes from side light. That can be added afterwards.\n\n" +
      "₦1,000 for one photo.\n\n" +
      "💬 Comment LIGHT and I'll send you the link.\n\n#aluxart #phonephotography",
  },
  {
    id: "p15", week: 4, slot: "C", product: "assets", trigger: "ASSETS",
    title: "Asset extractor — the bag",
    photos: "A bag, shoe or accessory photographed on a sofa or table, and the extracted version",
    cards: [
      { headline: "Sell Bags, Shoes and Wigs Like a Boutique Even Without a Shop, a Model or a Studio",
        body: "Photographed on your sofa. Sold like a shop window." },
      { eyebrow: "The problem",
        headline: "Your background is part of the sale.",
        body: "A product on a sofa reads as second-hand. The same product on a clean ground reads as stock." },
      { eyebrow: "What a boutique has",
        headline: "One item, one frame, nothing else.",
        body: "That is the whole trick, and it is the thing a busy vendor never has time to set up." },
      { eyebrow: "What you send",
        headline: "One photo, wherever it is sitting.",
        body: "The item is lifted out and comes back from four angles, ready to list." },
      { eyebrow: "What it costs",
        headline: "Per piece, not per shoot.",
        body: PRICE },
      cta("ASSETS", "Send me a photo of your best-selling item."),
    ],
    caption:
      "Sell bags, shoes and wigs like a boutique even without a shop, a model or a studio.\n\n" +
      "The bag is lovely. Your sofa is not part of the sale.\n\n" +
      "A clean product shot is the single thing that separates a listing people trust from one they scroll past, and it is the thing small vendors never have time to set up.\n\n" +
      "Send one photo of the item wherever it is sitting. It comes back on its own, from four angles.\n\n" +
      "₦1,000 per photo.\n\n" +
      "💬 Comment ASSETS and I'll send you the link.\n\n" +
      "#nigerianvendor #bagsforsale #onlinebusiness #aluxart",
  },
  {
    id: "p16", week: 4, slot: "D", product: "relight", trigger: "LIGHT",
    title: "Best pair of the week",
    photos: "The strongest before/after you have this week",
    cards: [
      { headline: "Get Better Light on a Photo You Already Took Without Buying a Better Camera",
        body: "You never needed the camera. You needed the light." },
      { eyebrow: "And it can arrive late",
        headline: "The photo is already taken.",
        body: PRICE },
      cta("LIGHT", "Send me one photo."),
    ],
    caption:
      "Get better light on a photo you already took without buying a better camera.\n\n" +
      "You never needed the camera. You needed the light — and it can arrive afterwards.\n\n" +
      "₦1,000 for one photo.\n\n💬 Comment LIGHT and I'll send you the link.\n\n#aluxart",
  },

  // ───────────────────────── MONTH 2 — trust and objections ──────────────────
  {
    id: "p17", week: 5, slot: "A", product: "studio", trigger: "STUDIO",
    title: "Phone to studio — a customer's result",
    photos: "A customer's own before/after, posted with their permission after the three-week hold",
    cards: [
      { headline: "Get a Studio Portrait in One Day Even Without Leaving Your Desk at Work",
        body: "She sent this from her phone on her lunch break." },
      { eyebrow: "The problem",
        headline: "Everybody is too busy for a studio.",
        body: "A session means a booking, a drive and half a day. Which is why the photo never gets taken." },
      { eyebrow: "What she did",
        headline: "She sent one photo in a chat.",
        body: "No appointment, no travelling, no second outfit. Nothing else was asked of her." },
      { eyebrow: "Her words, not mine",
        headline: "Add the customer's actual message here.",
        body: "Paste exactly what they wrote. Do not tidy it up — the typing is the proof." },
      { eyebrow: "What it costs",
        headline: "Back the same day.",
        body: PRICE },
      cta("STUDIO", "Send me a photo on your next break."),
    ],
    caption:
      "Get a studio portrait in one day even without leaving your desk at work.\n\n" +
      "A customer sent this from her phone on her lunch break. No appointment, no studio, no second outfit — one photo in a chat, back before she got home.\n\n" +
      "Everybody is too busy for a session. That is exactly why the photo never gets taken.\n\n" +
      "₦1,000 for one photo.\n\n💬 Comment STUDIO and I'll send you the link.\n\n#aluxart",
  },
  {
    id: "p18", week: 5, slot: "B", product: "relight", trigger: "LIGHT",
    title: "Relight — she almost didn't send it",
    photos: "A customer's before/after where the before looked unpromising",
    cards: [
      { headline: "How to Save the Photo You Thought Was Too Dark to Save — Without a Camera or a Reshoot",
        body: "She almost didn't send this one." },
      { eyebrow: "The problem",
        headline: "People delete the photos most worth fixing.",
        body: "If it looks hopeless on the phone screen, it goes. Usually it was not hopeless at all." },
      { eyebrow: "Why it wasn't hopeless",
        headline: "Dark is not the same as ruined.",
        body: "The detail is still in the file, buried under noise and the wrong colour. Buried is recoverable. Missing is not." },
      { eyebrow: "The one real limit",
        headline: "Out of focus cannot be fixed.",
        body: "Dark can. Orange can. Blurry cannot — and I will tell you before you pay, not after." },
      { eyebrow: "What it costs",
        headline: "Nothing to lose by asking.",
        body: PRICE },
      cta("LIGHT", "Send me the one you were about to delete."),
    ],
    caption:
      "How to save the photo you thought was too dark to save — without a camera or a reshoot.\n\n" +
      "She almost didn't send this. She thought it was too far gone.\n\n" +
      "Dark is not the same as ruined. The detail is still in the file, buried under noise and the wrong colour, and buried is recoverable.\n\n" +
      "The one thing that cannot be fixed is focus. If a photo is blurry I will tell you before you pay, not after.\n\n" +
      "₦1,000 for one photo.\n\n💬 Comment LIGHT and I'll send you the link.\n\n#aluxart",
  },
  {
    id: "p19", week: 5, slot: "C", product: "assets", trigger: "ASSETS",
    title: "Asset extractor — the rail shot",
    photos: "A vendor's rail or wardrobe shot, and the extracted product angles",
    cards: [
      { headline: "4 Ways to Answer a Buyer's Questions Without Ever Typing a Reply",
        body: "One photo of the rail in. Four angles out." },
      { eyebrow: "The problem",
        headline: "Every DM question is one your photo didn't answer.",
        body: "And half the people who would have asked never ask. They just scroll." },
      { eyebrow: "Answer 1 — the front",
        headline: "How does it actually sit?",
        body: "Shape, length and where it falls on a real body, not on a hanger." },
      { eyebrow: "Answer 2 — the three-quarter",
        headline: "Is it fitted or loose?",
        body: "The angle that shows the cut without anybody having to ask for a side photo." },
      { eyebrow: "Answers 3 and 4 — side and back",
        headline: "What does the back look like?",
        body: "The most asked question in Nigerian fashion DMs, answered before it is typed." },
      cta("ASSETS", "Send me one photo from your rail."),
    ],
    caption:
      "4 ways to answer a buyer's questions without ever typing a reply.\n\n" +
      "Every question in your DMs is a question your photo did not answer. How does it fall? Is it fitted? What does the back look like? And half the people who would have asked never ask — they scroll.\n\n" +
      "Four clean angles answer all of it before anybody types.\n\n" +
      "₦1,000 per photo.\n\n💬 Comment ASSETS and I'll send you the link.\n\n" +
      "#nigerianfashion #onlinevendor #aluxart",
  },
  {
    id: "p20", week: 5, slot: "D", product: "relight", trigger: "LIGHT",
    title: "Best pair of the week",
    photos: "The strongest before/after you have this week",
    cards: [
      { headline: "Get a Night-Out Photo Worth Posting Without Going Back Out",
        body: "Same photo. Different night, apparently." },
      { eyebrow: "What it costs",
        headline: "One photo, back the same day.",
        body: PRICE },
      cta("LIGHT", "Send me one from the weekend."),
    ],
    caption:
      "Get a night-out photo worth posting without going back out.\n\n" +
      "Same photo. Different night, apparently. ₦1,000.\n\n" +
      "💬 Comment LIGHT and I'll send you the link.\n\n#aluxart",
  },
  {
    id: "p21", week: 6, slot: "A", product: "studio", trigger: "STUDIO",
    title: "Will it still look like me?",
    photos: "A before/after cropped tight on the face, so identity is obviously preserved",
    cards: [
      { headline: "Change the Room and the Light Without Changing a Single Thing About Your Face",
        body: "The question everybody asks, answered honestly." },
      { eyebrow: "The fear",
        headline: "“Will it still look like her?”",
        body: "It is the right question to ask, and most people are too polite to ask it out loud." },
      { eyebrow: "Proof 1",
        headline: "Crop in and compare.",
        body: "Same eyes, same nose, same gap in the teeth, same hairline. Look at the face, not the room." },
      { eyebrow: "Proof 2",
        headline: "The face is locked to your photo.",
        body: "Not a lookalike, not an average of a thousand faces. Your actual features, held in place." },
      { eyebrow: "What may change",
        headline: "The room, the light, the pose.",
        body: "Nothing else. If the person changes, the job was done badly and I will redo it." },
      cta("STUDIO", "Send me a photo and judge it yourself."),
    ],
    caption:
      "Change the room and the light without changing a single thing about your face.\n\n" +
      "“Will it still look like me?” is the question I get most, and it is the right one to ask.\n\n" +
      "Crop in close on these two and compare. Same eyes, same nose, same smile, same hairline. What changes is the room, the light and the pose. Nothing else.\n\n" +
      "If the person changes, the job was done badly and I redo it.\n\n" +
      "💬 Comment STUDIO and I'll send you the link.\n\n#aluxart",
  },
  {
    id: "p22", week: 6, slot: "B", product: "relight", trigger: "LIGHT",
    title: "Three photos, one payment",
    photos: "Three before/afters from the same night, shown together",
    cards: [
      { headline: "Fix Every Photo From One Night in a Single Payment Without Sending Them One at a Time",
        body: "Three photos. One link. ₦3,000." },
      { eyebrow: "The problem",
        headline: "Nobody wants three payment links.",
        body: "Three photos used to mean three conversations and three transfers. That is why people only ever sent one." },
      { eyebrow: "How it works now",
        headline: "Send them all at once.",
        body: "The chat counts them, adds them up and sends a single link for the lot." },
      { eyebrow: "It asks first",
        headline: "“Are these all the pictures you want to relight?”",
        body: "Say yes and the total is locked. Anything you send after the link is a fresh request, never a surprise charge." },
      { eyebrow: "What it costs",
        headline: "₦1,000 each. Nothing hidden.",
        body: "Three photos is ₦3,000. That is the whole sum." },
      cta("LIGHT", "Send me everything from one night."),
    ],
    caption:
      "Fix every photo from one night in a single payment without sending them one at a time.\n\n" +
      "Send every photo from the night at once. The chat counts them, adds them up and gives you one link for the lot.\n\n" +
      "It asks first — “are these all the pictures you want to relight?” — and once you say yes the total is locked. Anything you send after that is a new request, never a surprise charge.\n\n" +
      "Three photos, ₦3,000, one link.\n\n" +
      "💬 Comment LIGHT and I'll send you the link.\n\n#aluxart #dettydecember",
  },
  {
    id: "p23", week: 6, slot: "C", product: "gif", trigger: "GIF",
    title: "GIF maker — a customer's sticker",
    photos: "A customer's finished GIF, shown as before/after stills",
    cards: [
      { headline: "Get Other People to Advertise Your Business for You Without Paying Any of Them",
        body: "She made this in a chat in two minutes." },
      { eyebrow: "The problem",
        headline: "You can buy reach, or you can be worth sharing.",
        body: "Only one of those keeps working after the money stops." },
      { eyebrow: "What she sent",
        headline: "Two pictures and four lines.",
        body: "That was the whole job. Her words, her website, her search tags." },
      { eyebrow: "What happened next",
        headline: "Strangers started using it.",
        body: "In their stories, under their posts. Her business travelled with it, into feeds she could never have bought." },
      { eyebrow: "What it costs",
        headline: "Once. Then never again.",
        body: "Made in a chat, in about two minutes." },
      cta("GIF", "Send me two pictures and your tagline.", SEE_PRICES),
    ],
    caption:
      "Get other people to advertise your business for you without paying any of them.\n\n" +
      "She made this in a chat with two pictures and four lines of her own words.\n\n" +
      "Now strangers use it in their stories and her business goes with it, into feeds she could never have bought. That is advertising that keeps working after you stop paying for it.\n\n" +
      "💬 Comment GIF and we'll make yours right there in the chat.\n\n#smallbusinessnigeria #aluxart",
  },
  {
    id: "p24", week: 6, slot: "D", product: "relight", trigger: "LIGHT",
    title: "Best pair of the week",
    photos: "The strongest before/after you have this week",
    cards: [
      { headline: "Get the Light You Should Have Had Without the Studio, the Flash or the Reshoot",
        body: "Nothing in this photo was taken twice." },
      { eyebrow: "What it costs",
        headline: "One photo, back the same day.",
        body: PRICE },
      cta("LIGHT", "Send me one."),
    ],
    caption:
      "Get the light you should have had without the studio, the flash or the reshoot.\n\n" +
      "Nothing here was taken twice. ₦1,000 for one photo.\n\n" +
      "💬 Comment LIGHT and I'll send you the link.\n\n#aluxart",
  },
  {
    id: "p25", week: 7, slot: "A", product: "studio", trigger: "STUDIO",
    title: "Phone to studio — not just children",
    photos: "An adult photographed at home, and the studio portrait",
    cards: [
      { headline: "Get the Profile Picture You Keep Putting Off in One Day Even Without Booking a Session",
        body: "Not only for children. Same wall, same problem, same fix." },
      { eyebrow: "The problem",
        headline: "You have been meaning to do this for a year.",
        body: "A proper photo of yourself always loses to everything else on the list." },
      { eyebrow: "You already have the photo",
        headline: "Everybody has one they actually like.",
        body: "Almost always taken somewhere with terrible light, which is the only thing wrong with it." },
      { eyebrow: "What it becomes",
        headline: "A profile picture, a company page, a frame.",
        body: "The thing you keep putting off, done from a photo already on your phone." },
      { eyebrow: "What it costs",
        headline: "One photo, back the same day.",
        body: PRICE },
      cta("STUDIO", "Send me the photo of yourself you like."),
    ],
    caption:
      "Get the profile picture you keep putting off in one day even without booking a session.\n\n" +
      "Everybody has one photo of themselves they actually like, and it is almost always taken somewhere with terrible light. That is the only thing wrong with it.\n\n" +
      "Cheaper than booking a session for a photo you already have.\n\n" +
      "₦1,000 for one photo.\n\n💬 Comment STUDIO and I'll send you the link.\n\n#aluxart #portrait",
  },
  {
    id: "p26", week: 7, slot: "B", product: "relight", trigger: "LIGHT",
    title: "Relight — the old photo",
    photos: "A genuinely old photo, and the relit version",
    cards: [
      { headline: "Bring a Five-Year-Old Photo Back to Life Without Changing a Single Face in It",
        body: "This photo is five years old. The light is from this week." },
      { eyebrow: "The problem",
        headline: "The day cannot happen again.",
        body: "Old photos are the ones most worth fixing, because nobody is ever reshooting them." },
      { eyebrow: "What stays",
        headline: "Everyone, exactly as they were.",
        body: "Same faces, same clothes, same room, same day. The memory is not edited." },
      { eyebrow: "What changes",
        headline: "Only the light.",
        body: "Put back the way it should have fallen, so you can finally see the people in it." },
      { eyebrow: "What it costs",
        headline: "One photo, back the same day.",
        body: PRICE },
      cta("LIGHT", "Send me one from years ago."),
    ],
    caption:
      "Bring a five-year-old photo back to life without changing a single face in it.\n\n" +
      "This photo is five years old. The light on it is from this week.\n\n" +
      "Old photos are the ones most worth doing, because nobody is reshooting them and the day cannot happen again. Everyone stays exactly as they were. Only the light changes.\n\n" +
      "₦1,000 for one photo.\n\n💬 Comment LIGHT and I'll send you the link.\n\n#throwback #aluxart",
  },
  {
    id: "p27", week: 7, slot: "C", product: "shoot", trigger: "STUDIO",
    title: "Full shoot — ten images",
    photos: "One source photo and a grid of ten varied results",
    cards: [
      { headline: "Get Ten Studio Images in One Day Without a Deposit, a Day Off or a Drive Across Lagos",
        body: "One photo in. Ten images out." },
      { eyebrow: "What a studio day really costs",
        headline: "More than the invoice.",
        body: "A deposit, a day off work, travel across the city, and hoping the light is right when you arrive." },
      { eyebrow: "What this costs",
        headline: "One photo and a few minutes in a chat.",
        body: "No booking, no travelling, no taking the afternoon off." },
      { eyebrow: "What comes back",
        headline: "Ten images, ten setups.",
        body: "Different poses, framing and lighting. The same face in every one of them." },
      cta("STUDIO", "Send me one photo of yourself.", SEE_PRICES),
    ],
    caption:
      "Get ten studio images in one day without a deposit, a day off or a drive across Lagos.\n\n" +
      "A studio day costs more than the invoice: a deposit, time off work, travel across the city, and hoping the light is right when you get there.\n\n" +
      "Send one photo instead and get back a full set — ten images, different poses, framing and lighting, the same face throughout.\n\n" +
      "💬 Comment STUDIO and I'll send you the link.\n\n#lagosbusiness #headshots #aluxart",
  },
  {
    id: "p28", week: 7, slot: "D", product: "relight", trigger: "LIGHT",
    title: "Best pair of the week",
    photos: "The strongest before/after you have this week",
    cards: [
      { headline: "Get the Photo Your Phone Could Not Take Even if Your Phone Is All You Own",
        body: "It did its best. It just had nothing to work with." },
      { eyebrow: "What it costs",
        headline: "One photo, back the same day.",
        body: PRICE },
      cta("LIGHT", "Send me one."),
    ],
    caption:
      "Get the photo your phone could not take even if your phone is all you own.\n\n" +
      "It did its best. It just had nothing to work with. ₦1,000.\n\n" +
      "💬 Comment LIGHT and I'll send you the link.\n\n#aluxart",
  },
  {
    id: "p29", week: 8, slot: "A", product: "studio", trigger: "STUDIO",
    title: "Phone to studio — the christening",
    photos: "A christening or naming ceremony photo at home, and the studio version",
    cards: [
      { headline: "Give a Naming Ceremony the Studio Portrait It Deserved Even Though the Day Is Over",
        body: "The outfit was planned for weeks. The photo took thirty seconds." },
      { eyebrow: "The problem",
        headline: "Nobody budgets for the photograph.",
        body: "Lace, shoes, caterers, hall. Then the picture is taken against whatever wall was free." },
      { eyebrow: "Why it matters most here",
        headline: "These are the photos families keep longest.",
        body: "Namings, christenings, first birthdays. They outlive everything else on your phone." },
      { eyebrow: "What you get",
        headline: "One photo worth printing.",
        body: "A sitting-room wall behind it will not survive being framed. A proper backdrop will." },
      { eyebrow: "What it costs",
        headline: "Less than the lace.",
        body: PRICE },
      cta("STUDIO", "Send me the photo from the day."),
    ],
    caption:
      "Give a naming ceremony the studio portrait it deserved even though the day is over.\n\n" +
      "The outfit was planned for weeks. The photo was taken in thirty seconds against whatever wall was free.\n\n" +
      "These are the pictures families keep longest, and they cost less to fix than the lace cost to buy.\n\n" +
      "₦1,000 for one photo.\n\n💬 Comment STUDIO and I'll send you the link.\n\n#naming #christening #aluxart",
  },
  {
    id: "p30", week: 8, slot: "B", product: "relight", trigger: "LIGHT",
    title: "Relight — restaurant dinner",
    photos: "A dim restaurant photo, and the relit version",
    cards: [
      { headline: "How to Rescue Every Restaurant Photo Without Candlelight, a Flash or a Second Dinner",
        body: "Dinner looked better than this." },
      { eyebrow: "The problem",
        headline: "Restaurants light the table, not your face.",
        body: "The light sits directly above you, so your eyes fall into shadow and the room behind you disappears." },
      { eyebrow: "The thing nobody expects",
        headline: "Candlelight is worse than it looks.",
        body: "Beautiful to sit in. Almost nothing for a phone sensor to actually use." },
      { eyebrow: "Why the flash made it worse",
        headline: "It killed the room you came for.",
        body: "Fire the flash and the restaurant goes black behind you. Keep the room and you go dark. The fix keeps both." },
      { eyebrow: "What it costs",
        headline: "Keep the evening. Lose the shadows.",
        body: PRICE },
      cta("LIGHT", "Send me a photo from dinner."),
    ],
    caption:
      "How to rescue every restaurant photo without candlelight, a flash or a second dinner.\n\n" +
      "Restaurants light the table, not your face. The light sits directly above you, so your eyes fall into shadow and everything behind you goes black.\n\n" +
      "Candlelight makes it worse — lovely to sit in, almost nothing for a phone to work with. And the flash kills the room you came for.\n\n" +
      "Afterwards you can keep both.\n\n₦1,000 for one photo.\n\n" +
      "💬 Comment LIGHT and I'll send you the link.\n\n#datenight #lagosrestaurants #aluxart",
  },
  {
    id: "p31", week: 8, slot: "C", product: "assets", trigger: "ASSETS",
    title: "Asset extractor — wigs and beauty",
    photos: "A wig on a mannequin or stand, and the extracted version",
    cards: [
      { headline: "Show Every Detail of a Wig, Lash or Nail Set Even Without a Model, a Studio or a Ring Light",
        body: "On a mannequin. Sold like it's on a person." },
      { eyebrow: "The problem",
        headline: "Beauty sells on four details.",
        body: "Texture, length, parting and colour. A cluttered background hides every one of them." },
      { eyebrow: "What a mannequin costs you",
        headline: "It reads as stock, not as hair.",
        body: "Buyers want to see how it falls, not how it sits on a plastic head in your bedroom." },
      { eyebrow: "What you send",
        headline: "One photo, wherever it is.",
        body: "It comes back lifted clean, from four angles, with the texture still readable." },
      { eyebrow: "Everything small",
        headline: "Wigs, nails, lashes, jewellery.",
        body: "Anything easily lost against a busy room. ₦1,000 per photo." },
      cta("ASSETS", "Send me a photo of one piece."),
    ],
    caption:
      "Show every detail of a wig, lash or nail set even without a model, a studio or a ring light.\n\n" +
      "Beauty products sell on four things — texture, length, parting and colour — and a busy background hides all four.\n\n" +
      "Send one photo of the piece and it comes back clean, from four angles, with the texture still readable.\n\n" +
      "₦1,000 per photo.\n\n💬 Comment ASSETS and I'll send you the link.\n\n" +
      "#wigsnigeria #beautybusiness #aluxart",
  },
  {
    id: "p32", week: 8, slot: "D", product: "relight", trigger: "LIGHT",
    title: "Best pair of the week",
    photos: "The strongest before/after you have this week",
    cards: [
      { headline: "Fix One Photo for ₦1,000 Without a Subscription, an App or an Account",
        body: "That is the entire offer." },
      { eyebrow: "How it works",
        headline: "It all happens in the chat.",
        body: "Send the photo, pay, get it back. Nothing to download." },
      cta("LIGHT", "Send me one photo."),
    ],
    caption:
      "Fix one photo for ₦1,000 without a subscription, an app or an account.\n\n" +
      "Send it in the chat, pay in the chat, get it back in the chat. That is the entire offer.\n\n" +
      "💬 Comment LIGHT and I'll send you the link.\n\n#aluxart",
  },

  // ───────────────────────── MONTH 3 — own December ──────────────────────────
  {
    id: "p33", week: 9, slot: "A", product: "studio", trigger: "STUDIO",
    title: "December — the Christmas outfit",
    photos: "A child or family in Christmas clothes at home, and the studio version",
    cards: [
      { headline: "Get a Christmas Portrait Worth Printing in One Day Even Though Every Studio Is Fully Booked",
        body: "The outfit everyone planned for. The background nobody did." },
      { eyebrow: "The problem",
        headline: "December is when the photos happen.",
        body: "New clothes, family together, everyone home — and all of it shot in a sitting room under one bulb." },
      { eyebrow: "Why booking won't save you",
        headline: "Every studio in town is full.",
        body: "And the ones that are not are charging December prices for a slot in January." },
      { eyebrow: "What you do instead",
        headline: "Take the photo at home. Send it the same day.",
        body: "The room is replaced afterwards. Nobody has to get dressed twice or wait for a slot." },
      { eyebrow: "What it costs",
        headline: "One photo, back the same day.",
        body: PRICE },
      cta("STUDIO", "Send me your Christmas photo."),
    ],
    caption:
      "Get a Christmas portrait worth printing in one day even though every studio is fully booked.\n\n" +
      "Everyone plans the outfit. Nobody plans the background.\n\n" +
      "December is when the most photographs of the year get taken, almost all of them in a sitting room under one overhead bulb — and every studio in town is full.\n\n" +
      "Take the photo at home and send it. The room is replaced afterwards.\n\n" +
      "₦1,000 for one photo.\n\n💬 Comment STUDIO and I'll send you the link.\n\n" +
      "#christmas #dettydecember #aluxart",
  },
  {
    id: "p34", week: 9, slot: "B", product: "relight", trigger: "LIGHT",
    title: "December — every photo will be too dark",
    photos: "A December club or street photo, and the relit version",
    cards: [
      { headline: "How to Save Every December Night Photo Without a Camera, a Flash or a Single Reshoot",
        body: "Every photo you take this month will be too dark. Take them anyway." },
      { eyebrow: "The problem",
        headline: "December happens at night.",
        body: "Clubs, streets, halls, car parks. All of them harder for a phone than any daylight shot." },
      { eyebrow: "What most people do",
        headline: "They stop taking photos.",
        body: "Which is the only mistake here that cannot be undone later." },
      { eyebrow: "What to do instead",
        headline: "Take the photo anyway.",
        body: "A dark photo of something that happened beats a perfect photo of nothing at all." },
      { eyebrow: "Then",
        headline: "Send it tonight or in January.",
        body: "The light can be put back whenever you get round to it." },
      cta("LIGHT", "Send me one from last night."),
    ],
    caption:
      "How to save every December night photo without a camera, a flash or a single reshoot.\n\n" +
      "Every photo you take this month will be too dark, and that is not a reason to stop taking them.\n\n" +
      "December happens at night — clubs, streets, halls, car parks. Take the photo anyway. A dark photo of something that happened beats a perfect photo of nothing.\n\n" +
      "Then send it. Tonight, or in January.\n\n₦1,000 for one photo.\n\n" +
      "💬 Comment LIGHT and I'll send you the link.\n\n#dettydecember #lagosnightlife #aluxart",
  },
  {
    id: "p35", week: 9, slot: "C", product: "gif", trigger: "GIF",
    title: "December — a sticker for your business",
    photos: "A December-themed before/after that becomes the GIF",
    cards: [
      { headline: "Be the Advert People Share This December Without Paying for a Single Impression",
        body: "Everybody is shouting. Be the thing people reuse." },
      { eyebrow: "The problem",
        headline: "December is the most expensive month to buy reach.",
        body: "Every business in Nigeria is bidding for the same feed at the same time." },
      { eyebrow: "What gets through",
        headline: "The things people pass around themselves.",
        body: "A sticker in somebody's story costs you nothing and reaches people no budget could buy." },
      { eyebrow: "What you send",
        headline: "Your pictures and your words.",
        body: "Up to six scenes, your tags, your website on the last frame." },
      cta("GIF", "Send me two pictures before the rush.", SEE_PRICES),
    ],
    caption:
      "Be the advert people share this December without paying for a single impression.\n\n" +
      "December is the most expensive month in Nigeria to buy reach — every business is bidding for the same feed at the same time.\n\n" +
      "What gets through is what people pass around themselves. Make a sticker with your own pictures and words, and let other people's stories carry it.\n\n" +
      "💬 Comment GIF and we'll make yours right there in the chat.\n\n#dettydecember #smallbusinessnigeria #aluxart",
  },
  {
    id: "p36", week: 9, slot: "D", product: "relight", trigger: "LIGHT",
    title: "Best pair of the week",
    photos: "The strongest before/after you have this week",
    cards: [
      { headline: "Get Last Night's Photo Back Before Lunch Today Even Without a Camera",
        body: "Taken last night. Fixed this morning." },
      { eyebrow: "What it costs",
        headline: "One photo, ₦1,000.",
        body: "Sent and returned in the same chat." },
      cta("LIGHT", "Send me last night's."),
    ],
    caption:
      "Get last night's photo back before lunch today even without a camera.\n\n" +
      "Taken last night. Fixed this morning. ₦1,000.\n\n" +
      "💬 Comment LIGHT and I'll send you the link.\n\n#dettydecember #aluxart",
  },
  {
    id: "p37", week: 10, slot: "A", product: "studio", trigger: "STUDIO",
    title: "December — the family portrait",
    photos: "A family group photographed at home, and the studio version",
    cards: [
      { headline: "Get the Whole Family Into One Good Portrait Even Though You Only Got Them Still Once",
        body: "Everyone is home for once. Take the photo." },
      { eyebrow: "The problem",
        headline: "Getting everybody together is the hard part.",
        body: "One month a year, and about ninety seconds of everyone standing still at the same time." },
      { eyebrow: "So do not waste it",
        headline: "Nobody is repeating that because of a wall.",
        body: "Take the picture wherever they are standing. The room is somebody else's problem." },
      { eyebrow: "Every face stays itself",
        headline: "Six people, six identities, locked.",
        body: "Nobody is averaged, smoothed or turned into a sibling." },
      { eyebrow: "What it costs",
        headline: "One group photo, properly finished.",
        body: PRICE },
      cta("STUDIO", "Send me the one where everyone looked."),
    ],
    caption:
      "Get the whole family into one good portrait even though you only got them still once.\n\n" +
      "December is the one month everybody is in the same place, and you get about ninety seconds of all of them standing still. Nobody is repeating that because of a wall.\n\n" +
      "Take the photo wherever they are standing. The room is my problem.\n\n" +
      "₦1,000 for one photo.\n\n💬 Comment STUDIO and I'll send you the link.\n\n" +
      "#familyportrait #christmas #aluxart",
  },
  {
    id: "p38", week: 10, slot: "B", product: "relight", trigger: "LIGHT",
    title: "December — concert and show photos",
    photos: "A concert or show photo, and the relit version",
    cards: [
      { headline: "Get Yourself Out of the Shadows in Every Concert Photo Without Standing Any Closer",
        body: "The stage was lit. You were not." },
      { eyebrow: "The problem",
        headline: "Stage light points away from the crowd.",
        body: "Everything on stage is bright, and everything in front of it is a silhouette. Including you." },
      { eyebrow: "Why moving closer wouldn't help",
        headline: "It is not about distance.",
        body: "The light is aimed at the performer. Ten rows forward and you are still lit from behind." },
      { eyebrow: "The fix",
        headline: "Light added from the front, afterwards.",
        body: "The stage keeps its colour and you come out of the dark in the same frame." },
      { eyebrow: "What it costs",
        headline: "You were there. The photo should say so.",
        body: PRICE },
      cta("LIGHT", "Send me a photo from the show."),
    ],
    caption:
      "Get yourself out of the shadows in every concert photo without standing any closer.\n\n" +
      "Stage lighting is built for the stage. It points away from you, so the performance is bright and the crowd is a silhouette — and moving forward does not help, because the light is aimed at the performer either way.\n\n" +
      "You were there. The photo should say so.\n\n₦1,000 for one photo.\n\n" +
      "💬 Comment LIGHT and I'll send you the link.\n\n#dettydecember #concert #aluxart",
  },
  {
    id: "p39", week: 10, slot: "C", product: "assets", trigger: "ASSETS",
    title: "December — sell through the season",
    photos: "December stock on a rail, and the extracted product angles",
    cards: [
      { headline: "Photograph a Whole December Rail in One Day Even Without a Model or a Studio",
        body: "One photo per piece. Four angles back." },
      { eyebrow: "The problem",
        headline: "Your busiest month is your least free month.",
        body: "December is when you sell most and have least time to photograph anything properly." },
      { eyebrow: "What that costs you",
        headline: "Stock nobody can picture does not move.",
        body: "And by January the season is over and it is last year's." },
      { eyebrow: "What you do",
        headline: "One photo of each piece, however it hangs.",
        body: "Clean product shots come back from four angles, same day, ready to post." },
      { eyebrow: "What it costs",
        headline: "Per piece, so you choose what matters.",
        body: PRICE },
      cta("ASSETS", "Send me a photo of your December stock."),
    ],
    caption:
      "Photograph a whole December rail in one day even without a model or a studio.\n\n" +
      "December is the month you sell most and have least time to photograph anything. Stock nobody can picture does not move, and by January it is last year's.\n\n" +
      "Send one photo of each piece and clean product shots come back from four angles, same day.\n\n" +
      "₦1,000 per photo.\n\n💬 Comment ASSETS and I'll send you the link.\n\n" +
      "#dettydecember #nigerianvendor #aluxart",
  },
  {
    id: "p40", week: 10, slot: "D", product: "relight", trigger: "LIGHT",
    title: "Best pair of the week",
    photos: "The strongest before/after you have this week",
    cards: [
      { headline: "Get Better Light on That Dress Without Wearing It Again",
        body: "Same dress. Same night. Different light." },
      { eyebrow: "What it costs",
        headline: "One photo, back the same day.",
        body: PRICE },
      cta("LIGHT", "Send me one from the party."),
    ],
    caption:
      "Get better light on that dress without wearing it again.\n\n" +
      "Same dress. Same night. Different light. ₦1,000.\n\n" +
      "💬 Comment LIGHT and I'll send you the link.\n\n#aluxart",
  },
  {
    id: "p41", week: 11, slot: "A", product: "studio", trigger: "STUDIO",
    title: "December — the photo you will want in twenty years",
    photos: "An older relative photographed at home, and the studio portrait",
    cards: [
      { headline: "Get the Portrait You'll Want in Twenty Years This Christmas Without Booking Anything",
        body: "Everyone is still home. Take it now, properly." },
      { eyebrow: "The problem",
        headline: "Nobody photographs the people they see every day.",
        body: "Then one day a snapshot is the only picture you have of them." },
      { eyebrow: "The window",
        headline: "This month everybody is in one place.",
        body: "It will not be true again until next December, and sometimes not even then." },
      { eyebrow: "What to do",
        headline: "Sit them down. Take one photo.",
        body: "Anywhere in the house. The room and the light are handled afterwards." },
      { eyebrow: "What it costs",
        headline: "One thousand naira for something irreplaceable.",
        body: "A small price, and the only one you will never regret." },
      cta("STUDIO", "Take one of them this week and send it."),
    ],
    caption:
      "Get the portrait you'll want in twenty years this Christmas without booking anything.\n\n" +
      "Nobody takes proper photographs of the people they see every day. Then one day a snapshot is the only picture you have of them.\n\n" +
      "This month everybody is in one place. Sit them down, take one photo anywhere in the house, and send it. The room and the light are handled afterwards.\n\n" +
      "₦1,000 for one photo.\n\n💬 Comment STUDIO and I'll send you the link.\n\n#family #aluxart",
  },
  {
    id: "p42", week: 11, slot: "B", product: "relight", trigger: "LIGHT",
    title: "December — send tonight, have it by morning",
    photos: "A night photo and its relit version, emphasising turnaround",
    cards: [
      { headline: "Send a Photo Tonight and Have It Back by Morning Even if You Have No Camera and No Editing Skills",
        body: "Usually much sooner than morning." },
      { eyebrow: "The problem",
        headline: "By the time you'd have fixed it, nobody cares.",
        body: "A party photo posted a week late is a photo nobody engages with." },
      { eyebrow: "Step 1",
        headline: "Send the photo in the chat.",
        body: "No app to download, no account to make, no file sizes to worry about." },
      { eyebrow: "Step 2",
        headline: "Pay in the same chat.",
        body: "One link, ₦1,000 a photo, however many you send at once." },
      { eyebrow: "Step 3",
        headline: "It comes back to the same conversation.",
        body: "Usually within the hour. By morning at the very worst." },
      cta("LIGHT", "Send me tonight's photo before you sleep."),
    ],
    caption:
      "Send a photo tonight and have it back by morning even if you have no camera and no editing skills.\n\n" +
      "A party photo posted a week late is a photo nobody engages with.\n\n" +
      "So: send it in the chat, pay in the chat, get it back in the chat. No app to download, no account to make. Usually within the hour, by morning at the very worst.\n\n" +
      "₦1,000 for one photo.\n\n💬 Comment LIGHT and I'll send you the link.\n\n#dettydecember #aluxart",
  },
  {
    id: "p43", week: 11, slot: "C", product: "shoot", trigger: "STUDIO",
    title: "December — a set for the new year",
    photos: "One photo and the ten-image set it produced",
    cards: [
      { headline: "Get a Full Set of New Year Photos in One Day Even Without a Studio, a Stylist or a Day Off",
        body: "One photo now. Ten images ready for January." },
      { eyebrow: "The problem",
        headline: "Everybody updates their profile in January.",
        body: "Most people use a cropped photo from a party, because there is nothing else on the phone." },
      { eyebrow: "What you do now",
        headline: "Send one photo this week.",
        body: "While you are off work and actually have five minutes." },
      { eyebrow: "What you have in January",
        headline: "Ten images, ten setups.",
        body: "Profile, company page, LinkedIn, WhatsApp. The same face in all of them." },
      cta("STUDIO", "Send me one photo before the year ends.", SEE_PRICES),
    ],
    caption:
      "Get a full set of New Year photos in one day even without a studio, a stylist or a day off.\n\n" +
      "Everybody updates their profile in January, and most people use a cropped photo from a party because there is nothing else on the phone.\n\n" +
      "Send one photo this week, while you are off work, and have the full set ready: ten images, different poses and lighting, the same face throughout.\n\n" +
      "💬 Comment STUDIO and I'll send you the link.\n\n#newyear #headshots #aluxart",
  },
  {
    id: "p44", week: 11, slot: "D", product: "relight", trigger: "LIGHT",
    title: "The year in before and afters",
    photos: "A grid of the year's strongest before/after pairs",
    cards: [
      { headline: "Rescue the Photo You Were About to Delete Without Ever Taking It Again",
        body: "A year of photographs nobody was going to keep. All of them, kept." },
      { eyebrow: "Every one of these",
        headline: "Was nearly deleted.",
        body: "Too dark, too orange, too flat. Not one of them was actually beyond saving." },
      { eyebrow: "What it costs",
        headline: "Yours can be next.",
        body: PRICE },
      cta("LIGHT", "Send me the one you were about to delete."),
    ],
    caption:
      "Rescue the photo you were about to delete without ever taking it again.\n\n" +
      "A year of photographs that were nearly deleted. Too dark, too orange, too flat — and not one of them beyond saving.\n\n" +
      "Send me the one you were about to delete.\n\n₦1,000 for one photo.\n\n" +
      "💬 Comment LIGHT and I'll send you the link.\n\n#aluxart",
  },
];

/**
 * When each post goes out.
 *
 * Mon / Wed / Fri / Sun at 19:00 Lagos — the slot that performed best in the
 * audit. Lagos is UTC+1 all year, so this is simple arithmetic rather than a
 * timezone library.
 */
export function scheduleFor(startMonday, week, slot) {
  const dayOffset = { A: 0, B: 2, C: 4, D: 6 }[slot] ?? 0;
  const d = new Date(startMonday);
  d.setDate(d.getDate() + (week - 1) * 7 + dayOffset);
  d.setHours(19, 0, 0, 0);
  return d;
}
