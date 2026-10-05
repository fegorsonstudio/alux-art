/**
 * Posts 45 to 88 — 21 December to 7 March.
 *
 * The second twelve weeks, written to the same house formula as plan.mjs:
 * Sabri Suby's HVCO cover, body slides that keep the cover's promise, a
 * directive last. COPY-FORMULA.md beside this file is the authority.
 *
 * Two things make this half different from the first, deliberately.
 *
 *   IT IS WEIGHTED TOWARDS THE FULL SHOOT. The first 44 sold relighting 22
 *   times and a full shoot 3 times — almost the whole quarter spent on the
 *   cheapest thing the studio makes. Here the shoot gets 9 slots and
 *   relighting 15, because a five or ten image package is worth several times
 *   a single relit photo and nothing was telling anybody it existed.
 *
 *   IT IS BUILT ON THE CALENDAR IT LANDS IN. Christmas Day, New Year's Day,
 *   Valentine's Day and Mothering Sunday each fall exactly on a slot, so those
 *   four are written for the day they go out. Harmattan runs through the
 *   middle of it — haze, dust and flat grey light are a real photographic
 *   problem here for three months, and nobody else is posting about it.
 *
 * A post priced per package never names a per-photo figure on the slide; it
 * sends the reader to the link. See the cta helper in plan.mjs for why.
 */

/** ₦1,000 a photo, said the same way every time so the price never looks invented. */
const PRICE = "₦1,000 for one photo. No subscription — you pay only for the photos you actually fix.";
const PER_PHOTO = "One photo, ₦1,000, back the same day.";
/** For packages whose price depends on how many images you choose. */
const SEE_PRICES = "The link has the packages and what each one costs.";

const cta = (word, action, priceLine = PER_PHOTO) => ({
  eyebrow: "Do this now",
  headline: action,
  body: word === "GIF"
    // The GIF reply is not a link: the loop is made right there in the chat.
    ? "Comment GIF and we'll make it together, right there in the chat."
    : `Comment ${word} and I'll send you the link. ${priceLine}`,
});

export const PLAN2 = [
  // ───────────────── WEEK 12 — Christmas week (21–27 Dec) ────────────────────
  {
    id: "p45", week: 12, slot: "A", product: "studio", trigger: "STUDIO",
    title: "Christmas week — the last-minute portrait",
    photos: "A family in Christmas clothes photographed at home this week, and the studio version",
    cards: [
      { headline: "Get a Christmas Portrait This Week Even Though It Is Already Too Late to Book One",
        body: "Everyone is dressed. Take the photo at home." },
      { eyebrow: "The problem",
        headline: "Nobody is getting a studio slot now.",
        body: "Every photographer in town was booked out weeks ago, and the ones who are not are charging double." },
      { eyebrow: "What you have instead",
        headline: "Everyone, dressed, in one house.",
        body: "That is the hard part of a portrait and you already have it. The room is the easy part." },
      { eyebrow: "What to do",
        headline: "Stand them anywhere and take one photo.",
        body: "Hallway, bedroom, against a curtain. It makes no difference to what comes back." },
      { eyebrow: "What it costs",
        headline: "Back the same day, all week.",
        body: PRICE },
      cta("STUDIO", "Take one today and send it."),
    ],
    caption:
      "Get a Christmas portrait this week even though it is already too late to book one.\n\n" +
      "Every studio in town was booked out weeks ago. But the hard part of a portrait is not the studio — it is getting everybody dressed and in one place, and this week you already have that.\n\n" +
      "Stand them anywhere, take one photo, send it. The room is handled afterwards.\n\n" +
      "₦1,000 for one photo.\n\n💬 Comment STUDIO and I'll send you the link.\n\n" +
      "#christmas #nigerianfamily #abujaphotographer #aluxart",
  },
  {
    id: "p46", week: 12, slot: "B", product: "relight", trigger: "LIGHT",
    title: "Christmas week — carol night and midnight service",
    photos: "A dark photo from a carol service or night church, and the relit version",
    cards: [
      { headline: "How to Save Every Carol Night Photo Without a Flash, a Camera or a Second Service",
        body: "Candles and a dark hall are the worst thing a phone can be handed." },
      { eyebrow: "The problem",
        headline: "Carol services are lit for atmosphere.",
        body: "Low light, candles, a bright altar and a dark congregation. Beautiful to sit in, almost nothing for a phone." },
      { eyebrow: "And the flash makes it worse",
        headline: "It kills the candles.",
        body: "Fire it and the atmosphere you came for disappears, leaving a flat face against a black hall." },
      { eyebrow: "The fix",
        headline: "The candles stay. You come out of the dark.",
        body: "Light added from the front afterwards, with the room's own glow left exactly where it was." },
      { eyebrow: "What it costs",
        headline: "No reshoot. The service is over.",
        body: PRICE },
      cta("LIGHT", "Send me one from the service."),
    ],
    caption:
      "How to save every carol night photo without a flash, a camera or a second service.\n\n" +
      "Carol services are lit for atmosphere — candles, a bright altar, a dark congregation. Lovely to sit in and almost nothing for a phone to work with. And firing the flash kills the candles you came for.\n\n" +
      "Afterwards you can keep both.\n\n₦1,000 for one photo.\n\n" +
      "💬 Comment LIGHT and I'll send you the link.\n\n#carolnight #nigerianchurch #christmas #aluxart",
  },
  {
    id: "p47", week: 12, slot: "C", product: "studio", trigger: "STUDIO",
    title: "CHRISTMAS DAY — the photo taken today",
    photos: "A photo taken on Christmas Day at home, and the studio version",
    cards: [
      { headline: "Get a Studio Portrait Out of Today Without Anyone Leaving the House",
        body: "Merry Christmas. Take one photo before the day runs out." },
      { eyebrow: "Today only happens once",
        headline: "This is the fullest the house will be all year.",
        body: "Everyone dressed, everyone home, everyone in a good mood at the same time." },
      { eyebrow: "What nobody does",
        headline: "Takes one proper photograph of all of it.",
        body: "There will be two hundred pictures of the food and none of everybody together." },
      { eyebrow: "So do that now",
        headline: "One photo. Anywhere in the house.",
        body: "Send it whenever you like — today, tomorrow, next week. The day keeps." },
      cta("STUDIO", "Take the one photo. Enjoy your day."),
    ],
    caption:
      "Merry Christmas from Alux Art 🎄\n\n" +
      "Get a studio portrait out of today without anyone leaving the house.\n\n" +
      "This is the fullest your house will be all year — everyone dressed, everyone home, everyone in a good mood at once. And there will be two hundred photos of the food and none of all of you together.\n\n" +
      "Take the one photo. Send it whenever you like.\n\n" +
      "💬 Comment STUDIO and I'll send you the link.\n\n#christmasday #merrychristmas #nigerianfamily #aluxart",
  },
  {
    id: "p48", week: 12, slot: "D", product: "studio", trigger: "STUDIO",
    title: "Best pair of the week",
    photos: "The strongest Christmas before/after you have this week",
    cards: [
      { headline: "Get a Portrait Out of a Photo Taken Against a Curtain Without Taking It Again",
        body: "Taken at home on Boxing Day." },
      { eyebrow: "What it costs",
        headline: "One photo, back the same day.",
        body: PRICE },
      cta("STUDIO", "Send me one from Christmas."),
    ],
    caption:
      "Get a portrait out of a photo taken against a curtain without taking it again.\n\n" +
      "₦1,000 for one photo.\n\n💬 Comment STUDIO and I'll send you the link.\n\n#christmas #aluxart",
  },

  // ───────────────── WEEK 13 — year end (28 Dec – 3 Jan) ─────────────────────
  {
    id: "p49", week: 13, slot: "A", product: "shoot", trigger: "STUDIO",
    title: "Ten images for a business page",
    photos: "One source photo and the ten-image set it produced",
    cards: [
      { headline: "Get Ten Images for Your Business Page in One Day Even if You Have Never Been Photographed for Work",
        body: "One photo in. Ten, all different." },
      { eyebrow: "The problem",
        headline: "One photo is not a business page.",
        body: "You need a profile picture, a banner, something for the about page and something to post. Most people have one blurry selfie doing all four jobs." },
      { eyebrow: "What a set gives you",
        headline: "Ten setups, not ten copies.",
        body: "Different poses, framing and lighting, so you are not posting the same face in a different crop every week." },
      { eyebrow: "And it is you",
        headline: "The face is locked to your photo.",
        body: "Not a lookalike, not an average. Your features in every one of the ten." },
      { eyebrow: "Done while the office is closed",
        headline: "Ready before anybody is back at work.",
        body: "Send the photo this week and start January with a page that looks like a business." },
      cta("STUDIO", "Send me one photo of yourself.", SEE_PRICES),
    ],
    caption:
      "Get ten images for your business page in one day even if you have never been photographed for work.\n\n" +
      "One photo is not a business page. You need a profile picture, a banner, something for the about page and something to post — and most people have one blurry selfie doing all four jobs.\n\n" +
      "Send one photo and get back ten: different poses, framing and lighting, the same face throughout.\n\n" +
      "💬 Comment STUDIO and I'll send you the link.\n\n#smallbusinessnigeria #branding #lagosbusiness #aluxart",
  },
  {
    id: "p50", week: 13, slot: "B", product: "relight", trigger: "LIGHT",
    title: "Clear December before January",
    photos: "Several December before/afters shown together",
    cards: [
      { headline: "Fix Every Photo From December Before January Without Sending Them One at a Time",
        body: "Your camera roll is full of nights you cannot see." },
      { eyebrow: "The problem",
        headline: "December leaves a backlog.",
        body: "Four weeks of parties, halls and car parks, and most of it too dark to post. So none of it ever gets posted." },
      { eyebrow: "The deadline is real",
        headline: "By February nobody wants to see December.",
        body: "A party photo has a shelf life. Post it now or it was never worth taking." },
      { eyebrow: "Send them together",
        headline: "One link for the whole month.",
        body: "The chat counts them, adds them up and asks you first. ₦1,000 each, nothing hidden." },
      { eyebrow: "What it costs",
        headline: "Ten photos is ₦10,000. That is the whole sum.",
        body: "And you choose which ten are worth it." },
      cta("LIGHT", "Send me your December photos."),
    ],
    caption:
      "Fix every photo from December before January without sending them one at a time.\n\n" +
      "Four weeks of parties, halls and car parks, and most of it too dark to post — so none of it gets posted, and by February nobody wants to see December anyway.\n\n" +
      "Send them together. The chat counts them, adds them up and asks you before it charges anything. ₦1,000 each.\n\n" +
      "💬 Comment LIGHT and I'll send you the link.\n\n#dettydecember #lagosnightlife #aluxart",
  },
  {
    id: "p51", week: 13, slot: "C", product: "shoot", trigger: "STUDIO",
    title: "NEW YEAR'S DAY — start the year with a photo of yourself",
    photos: "One photo and the set it produced",
    cards: [
      { headline: "Start the Year With a Photo of Yourself You Actually Like — Without a Studio or a Resolution",
        body: "Happy New Year. One photo is the whole task." },
      { eyebrow: "The problem",
        headline: "Everybody updates their profile today.",
        body: "And almost everybody uses a cropped photo from a party, because there is nothing else on the phone." },
      { eyebrow: "Why it matters more than it sounds",
        headline: "It is the first thing people see all year.",
        body: "On your WhatsApp, your Instagram, your work page, every time somebody looks you up." },
      { eyebrow: "What it takes",
        headline: "One photo and a few minutes today.",
        body: "No studio to book, no day off, no waiting until you have lost weight." },
      cta("STUDIO", "Send me one photo today.", SEE_PRICES),
    ],
    caption:
      "Happy New Year 🎇\n\n" +
      "Start the year with a photo of yourself you actually like — without a studio or a resolution.\n\n" +
      "Everybody updates their profile today, and almost everybody uses a cropped photo from a party because there is nothing else on the phone. It is the first thing people will see of you all year.\n\n" +
      "One photo, today, is the whole task.\n\n" +
      "💬 Comment STUDIO and I'll send you the link.\n\n#newyear2027 #newyearnewme #aluxart",
  },
  {
    id: "p52", week: 13, slot: "D", product: "shoot", trigger: "STUDIO",
    title: "Best of the year",
    photos: "A grid of the year's best results across all products",
    cards: [
      { headline: "Get a Year of Photographs You Are Proud Of Without Owning a Camera",
        body: "Everything on this page started as somebody's phone photo." },
      { eyebrow: "That is the whole point",
        headline: "None of these people hired a photographer.",
        body: "They sent one picture in a chat." },
      cta("STUDIO", "Start with one photo.", SEE_PRICES),
    ],
    caption:
      "Get a year of photographs you are proud of without owning a camera.\n\n" +
      "Every single one of these started as somebody's phone photo, sent in a chat.\n\n" +
      "💬 Comment STUDIO and I'll send you the link.\n\n#newyear #aluxart",
  },

  // ───────────────── WEEK 14 — back to work (4–10 Jan) ───────────────────────
  {
    id: "p53", week: 14, slot: "A", product: "studio", trigger: "STUDIO",
    title: "School resumption",
    photos: "A child in school uniform photographed at home, and the studio version",
    cards: [
      { headline: "Get a Proper School Portrait Without Waiting for the School Photographer",
        body: "First day back. New uniform. One photo at the door." },
      { eyebrow: "The problem",
        headline: "The school photo comes once and it is never good.",
        body: "A queue of two hundred children, a blue sheet and forty seconds each. Nobody smiles on cue." },
      { eyebrow: "What you have",
        headline: "The morning of the first day.",
        body: "New uniform, shoes polished, before anybody is tired. That is the photo worth keeping." },
      { eyebrow: "Take it at the door",
        headline: "Anywhere in the house works.",
        body: "The background is replaced afterwards, so the hallway behind her does not matter." },
      { eyebrow: "What it costs",
        headline: "One photo, back the same day.",
        body: PRICE },
      cta("STUDIO", "Take one on the first morning."),
    ],
    caption:
      "Get a proper school portrait without waiting for the school photographer.\n\n" +
      "The school photo comes once a year: a queue of two hundred children, a blue sheet, forty seconds each. Nobody smiles on cue.\n\n" +
      "The photo worth keeping is the first morning — new uniform, shoes polished, before anybody is tired. Take it at the door. The hallway behind her does not matter.\n\n" +
      "₦1,000 for one photo.\n\n💬 Comment STUDIO and I'll send you the link.\n\n" +
      "#backtoschool #nigerianchildren #schoolresumption #aluxart",
  },
  {
    id: "p54", week: 14, slot: "B", product: "relight", trigger: "LIGHT",
    title: "Harmattan haze",
    photos: "A hazy, flat harmattan photo and the relit version",
    cards: [
      { headline: "How to Clear Harmattan Out of Your Photos Without Waiting for March",
        body: "The dust is in the air, not in your camera." },
      { eyebrow: "The problem",
        headline: "Harmattan flattens everything.",
        body: "Dust in the air scatters the light, so there is no direction to it. No shadows, no shape, no depth — just a grey wash over the whole frame." },
      { eyebrow: "Why it looks like a bad phone",
        headline: "It is not your phone. It is the air.",
        body: "A ten million naira camera photographs the same haze. The light simply has nothing left in it." },
      { eyebrow: "What gets fixed",
        headline: "Direction is put back.",
        body: "Light from one side again, so faces have shape and the background has depth instead of fog." },
      { eyebrow: "Three months of this",
        headline: "December to February, every year.",
        body: PRICE },
      cta("LIGHT", "Send me a hazy one."),
    ],
    caption:
      "How to clear harmattan out of your photos without waiting for March.\n\n" +
      "The dust is in the air, not in your camera. It scatters the light so there is no direction left in it — no shadows, no shape, no depth, just a grey wash over everything.\n\n" +
      "That is why every photo looks flat this month, and why a better phone would not help. A ten million naira camera photographs the same haze.\n\n" +
      "Putting the direction back is the whole job. ₦1,000 for one photo.\n\n" +
      "💬 Comment LIGHT and I'll send you the link.\n\n#harmattan #nigeriaweather #phonephotography #aluxart",
  },
  {
    id: "p55", week: 14, slot: "C", product: "assets", trigger: "ASSETS",
    title: "January sale stock",
    photos: "Leftover December stock on a rail, and the extracted product angles",
    cards: [
      { headline: "Clear Your December Stock in January Even Without a Model, a Studio or New Photos",
        body: "Same pieces. Photographed like they are worth buying." },
      { eyebrow: "The problem",
        headline: "January stock looks like leftovers.",
        body: "Same tired rail photo you posted in November. Buyers can tell, and they scroll." },
      { eyebrow: "What actually changed",
        headline: "Nothing about the clothes.",
        body: "Only the photograph. A piece shot clean from four angles reads as new stock, not as what nobody wanted." },
      { eyebrow: "And January is the month for it",
        headline: "People are broke and still shopping.",
        body: "They are looking harder and buying more carefully. A clear photo is what wins that." },
      { eyebrow: "What it costs",
        headline: "Per piece, so you pick what to push.",
        body: PRICE },
      cta("ASSETS", "Send me a photo of what did not sell."),
    ],
    caption:
      "Clear your December stock in January even without a model, a studio or new photos.\n\n" +
      "January stock looks like leftovers because it is the same tired rail photo you posted in November. Buyers can tell.\n\n" +
      "Nothing about the clothes has to change — only the photograph. Shot clean from four angles, a piece reads as new stock instead of as what nobody wanted.\n\n" +
      "₦1,000 per photo.\n\n💬 Comment ASSETS and I'll send you the link.\n\n" +
      "#januarysale #nigerianvendor #onlinevendor #aluxart",
  },
  {
    id: "p56", week: 14, slot: "D", product: "relight", trigger: "LIGHT",
    title: "Best pair of the week",
    photos: "The strongest before/after you have this week",
    cards: [
      { headline: "Get Shape Back Into a Flat Photo Without Retaking It in Better Weather",
        body: "Both taken on the same dusty afternoon." },
      { eyebrow: "What it costs",
        headline: "One photo, back the same day.",
        body: PRICE },
      cta("LIGHT", "Send me one."),
    ],
    caption:
      "Get shape back into a flat photo without retaking it in better weather.\n\n" +
      "Both of these were taken on the same dusty afternoon. ₦1,000.\n\n" +
      "💬 Comment LIGHT and I'll send you the link.\n\n#harmattan #aluxart",
  },

  // ───────────────── WEEK 15 — January is long (11–17 Jan) ───────────────────
  {
    id: "p57", week: 15, slot: "A", product: "shoot", trigger: "STUDIO",
    title: "The job hunt headshot",
    photos: "One casual photo and the corporate set it produced",
    cards: [
      { headline: "Get a Corporate Headshot in One Day Even if You Own Nothing Corporate to Wear",
        body: "January is when everybody starts looking." },
      { eyebrow: "The problem",
        headline: "Your profile photo is costing you interviews.",
        body: "A recruiter looks at the picture before the CV. A cropped party photo answers a question you did not want asked." },
      { eyebrow: "The usual barrier",
        headline: "A headshot session costs more than the suit.",
        body: "Booking, travelling, a day off, and a photographer who wants payment before you have the job." },
      { eyebrow: "What you send",
        headline: "One photo, in whatever you are wearing.",
        body: "The wardrobe, the room and the light are all built afterwards. You do not need to own a suit." },
      { eyebrow: "What comes back",
        headline: "A set you can use everywhere.",
        body: "LinkedIn, the CV, the company page, the email signature. Same face in all of them." },
      cta("STUDIO", "Send me one photo of yourself.", SEE_PRICES),
    ],
    caption:
      "Get a corporate headshot in one day even if you own nothing corporate to wear.\n\n" +
      "A recruiter looks at your picture before your CV, and a cropped party photo answers a question you did not want asked.\n\n" +
      "But a headshot session costs more than the suit — booking, travel, a day off, and payment before you have the job. Send one photo in whatever you are wearing instead. The wardrobe, the room and the light are built afterwards.\n\n" +
      "💬 Comment STUDIO and I'll send you the link.\n\n#jobsearch #linkedin #careers #lagosjobs #aluxart",
  },
  {
    id: "p58", week: 15, slot: "B", product: "relight", trigger: "LIGHT",
    title: "January is long",
    photos: "A before/after that shows a big change for a small price",
    cards: [
      { headline: "Get One Thing That Looks Expensive This Month Without Spending Like It",
        body: "January is long. This is ₦1,000." },
      { eyebrow: "We all know",
        headline: "Nobody is buying anything right now.",
        body: "Rent, school fees, and a salary that has to reach the end of the longest month of the year." },
      { eyebrow: "So the honest pitch",
        headline: "This is the cheapest thing on the list.",
        body: "One photo, one thousand naira, no subscription and nothing to cancel later." },
      { eyebrow: "And you choose",
        headline: "One photo or none.",
        body: "There is no package you have to buy, no minimum, and no month where you keep paying for nothing." },
      cta("LIGHT", "Send one photo. Just one."),
    ],
    caption:
      "Get one thing that looks expensive this month without spending like it.\n\n" +
      "January is long and nobody is buying anything. So, honestly: this is the cheapest thing on the list.\n\n" +
      "One photo, ₦1,000. No subscription, no minimum, nothing to cancel in March. Send one or send none.\n\n" +
      "💬 Comment LIGHT and I'll send you the link.\n\n#januaryinnigeria #aluxart",
  },
  {
    id: "p59", week: 15, slot: "C", product: "gif", trigger: "GIF",
    title: "Advertising with no budget",
    photos: "A before/after pair that becomes the GIF",
    cards: [
      { headline: "Advertise Your Business All January Without Spending a Naira on Ads",
        body: "A sticker other people use for you." },
      { eyebrow: "The problem",
        headline: "January is the month you cannot afford to advertise.",
        body: "And the month you most need to, because everybody else went quiet too." },
      { eyebrow: "What costs nothing to run",
        headline: "Something people choose to use.",
        body: "A sticker in somebody's story is a placement you could not have bought, and they put it there themselves." },
      { eyebrow: "What is in it",
        headline: "Your pictures, your words, your website.",
        body: "Up to six scenes, and you pick the search tags so people find it." },
      cta("GIF", "Send me two pictures and your tagline.", SEE_PRICES),
    ],
    caption:
      "Advertise your business all January without spending a naira on ads.\n\n" +
      "January is the month you cannot afford to advertise and the month you most need to, because everyone else went quiet as well.\n\n" +
      "A sticker costs nothing to run. Somebody puts it in their story and that is a placement you could never have bought.\n\n" +
      "💬 Comment GIF and we'll make yours right there in the chat.\n\n#smallbusinessnigeria #marketing #aluxart",
  },
  {
    id: "p60", week: 15, slot: "D", product: "relight", trigger: "LIGHT",
    title: "Best pair of the week",
    photos: "The strongest before/after you have this week",
    cards: [
      { headline: "Get a Photo Worth Posting This Month Without Buying Anything Else",
        body: "One thousand naira. That is the whole bill." },
      { eyebrow: "How it works",
        headline: "Send it in the chat, pay in the chat.",
        body: "Nothing to download, no account to make." },
      cta("LIGHT", "Send me one."),
    ],
    caption:
      "Get a photo worth posting this month without buying anything else.\n\n" +
      "One thousand naira. That is the whole bill.\n\n" +
      "💬 Comment LIGHT and I'll send you the link.\n\n#aluxart",
  },

  // ───────────────── WEEK 16 — professional (18–24 Jan) ──────────────────────
  {
    id: "p61", week: 16, slot: "A", product: "studio", trigger: "STUDIO",
    title: "The profile photo people judge you by",
    photos: "A casual phone photo of an adult, and the studio portrait",
    cards: [
      { headline: "Get the Profile Photo People Trust Without Hiring Anyone to Take It",
        body: "Same person. Same shirt. Taken at home." },
      { eyebrow: "The problem",
        headline: "People decide about you before they read a word.",
        body: "Clients, recruiters, customers. The picture goes first and it is usually a cropped group photo." },
      { eyebrow: "What a good one actually has",
        headline: "Clean light and a plain background.",
        body: "That is the entire difference. Not a better face — a background that is not somebody's kitchen." },
      { eyebrow: "What you send",
        headline: "The photo of yourself you already like.",
        body: "Whatever you are wearing, wherever it was taken." },
      { eyebrow: "What it costs",
        headline: "One photo, back the same day.",
        body: PRICE },
      cta("STUDIO", "Send me the one you already like."),
    ],
    caption:
      "Get the profile photo people trust without hiring anyone to take it.\n\n" +
      "Clients, recruiters and customers all decide something about you before they read a word, and the picture doing that work is usually a cropped group photo.\n\n" +
      "What a good one actually has is clean light and a plain background. That is the whole difference.\n\n" +
      "₦1,000 for one photo.\n\n💬 Comment STUDIO and I'll send you the link.\n\n" +
      "#profilepicture #personalbrand #aluxart",
  },
  {
    id: "p62", week: 16, slot: "B", product: "relight", trigger: "LIGHT",
    title: "Harmattan skin",
    photos: "A photo where skin reads dull and ashy, and the corrected version",
    cards: [
      { headline: "How to Stop Looking Ashy in Every Photo This Season Without Changing Anything You Use",
        body: "Your skin is fine. The light is doing it." },
      { eyebrow: "The problem",
        headline: "Flat light makes every skin tone look grey.",
        body: "Harmattan scatters the light so evenly that nothing reflects off the skin. No highlight, no glow, no life." },
      { eyebrow: "It is not the cream",
        headline: "The same skin photographs fine in May.",
        body: "Nothing about you changed between November and January. The air did." },
      { eyebrow: "What puts it back",
        headline: "One source of light, from the side.",
        body: "That is what makes skin catch the light and read as skin instead of paper." },
      { eyebrow: "What it costs",
        headline: "Every photo until March.",
        body: PRICE },
      cta("LIGHT", "Send me one from this week."),
    ],
    caption:
      "How to stop looking ashy in every photo this season without changing anything you use.\n\n" +
      "Your skin is fine. Harmattan scatters the light so evenly that nothing reflects off it — no highlight, no glow — and every skin tone comes out grey.\n\n" +
      "The same skin photographs fine in May. Nothing about you changed. The air did.\n\n" +
      "One light from the side puts it back. ₦1,000 for one photo.\n\n" +
      "💬 Comment LIGHT and I'll send you the link.\n\n#harmattan #melaninskin #aluxart",
  },
  {
    id: "p63", week: 16, slot: "C", product: "assets", trigger: "ASSETS",
    title: "Wigs and beauty for the new year",
    photos: "A wig or beauty product photographed at home, and the extracted version",
    cards: [
      { headline: "Photograph Your Wigs Like a Salon Even Without a Model, a Ring Light or a Studio",
        body: "Shot on a stand in your bedroom. Sold like a salon shot it." },
      { eyebrow: "The problem",
        headline: "January is when people change their look.",
        body: "New year, new hair. They are shopping right now and comparing you against salons with real photographers." },
      { eyebrow: "What they are looking for",
        headline: "Texture, length, parting, colour.",
        body: "Four things, and a bedroom background hides all four." },
      { eyebrow: "What you send",
        headline: "One photo, on whatever stand you have.",
        body: "It comes back lifted clean, from four angles, with the texture still readable." },
      { eyebrow: "What it costs",
        headline: "Per piece, so you push your best units.",
        body: PRICE },
      cta("ASSETS", "Send me a photo of one unit."),
    ],
    caption:
      "Photograph your wigs like a salon even without a model, a ring light or a studio.\n\n" +
      "January is when people change their look, and right now they are comparing your bedroom photo against salons with real photographers.\n\n" +
      "What buyers want to see is texture, length, parting and colour — and a cluttered background hides all four.\n\n" +
      "₦1,000 per photo.\n\n💬 Comment ASSETS and I'll send you the link.\n\n" +
      "#wigsnigeria #hairvendor #beautybusiness #aluxart",
  },
  {
    id: "p64", week: 16, slot: "D", product: "studio", trigger: "STUDIO",
    title: "Best pair of the week",
    photos: "The strongest studio before/after you have this week",
    cards: [
      { headline: "Get a Studio Background Behind You Without Standing in a Studio",
        body: "She has not left her sitting room." },
      { eyebrow: "What it costs",
        headline: "One photo, back the same day.",
        body: PRICE },
      cta("STUDIO", "Send me one of yourself."),
    ],
    caption:
      "Get a studio background behind you without standing in a studio.\n\n" +
      "She has not left her sitting room. ₦1,000.\n\n" +
      "💬 Comment STUDIO and I'll send you the link.\n\n#aluxart",
  },

  // ───────────────── WEEK 17 — business (25–31 Jan) ──────────────────────────
  {
    id: "p65", week: 17, slot: "A", product: "shoot", trigger: "STUDIO",
    title: "A set for a service business",
    photos: "One photo and the ten-image set it produced",
    cards: [
      { headline: "Look Like an Established Business in One Day Even if You Started Last Month",
        body: "One photo of you. Ten images for everything." },
      { eyebrow: "The problem",
        headline: "New businesses look new.",
        body: "One photo, used everywhere, slightly blurry. Customers read that before they read your prices." },
      { eyebrow: "What established looks like",
        headline: "Consistency, not expense.",
        body: "The same person, photographed properly, appearing the same way everywhere you show up." },
      { eyebrow: "What you send",
        headline: "One photo of yourself.",
        body: "No studio, no stylist, no second outfit, no day off." },
      { eyebrow: "What you get",
        headline: "Ten images, ten setups.",
        body: "Enough to run a page for months without repeating yourself." },
      cta("STUDIO", "Send me one photo of yourself.", SEE_PRICES),
    ],
    caption:
      "Look like an established business in one day even if you started last month.\n\n" +
      "New businesses look new: one photo, used everywhere, slightly blurry. Customers read that before they read your prices.\n\n" +
      "What established actually looks like is consistency — the same person, photographed properly, appearing the same way everywhere you show up.\n\n" +
      "💬 Comment STUDIO and I'll send you the link.\n\n#smallbusinessnigeria #entrepreneur #aluxart",
  },
  {
    id: "p66", week: 17, slot: "B", product: "relight", trigger: "LIGHT",
    title: "Office lighting",
    photos: "A photo under office fluorescent light, and the relit version",
    cards: [
      { headline: "How to Fix Every Photo Taken at Work Without Finding a Window First",
        body: "Office light is built for paperwork, not for faces." },
      { eyebrow: "The problem",
        headline: "Fluorescent tubes sit directly overhead.",
        body: "So the light comes straight down: shadows under your eyes, under your nose, under your chin. It is the least flattering angle there is." },
      { eyebrow: "And the colour",
        headline: "Office tubes are green.",
        body: "Not visibly, until a camera sees it. Then every skin tone picks up a tinge nobody can name but everybody notices." },
      { eyebrow: "The fix",
        headline: "Light from the front, colour corrected.",
        body: "The same photo, at the same desk, lit the way a portrait should be." },
      { eyebrow: "What it costs",
        headline: "No window seat required.",
        body: PRICE },
      cta("LIGHT", "Send me one from the office."),
    ],
    caption:
      "How to fix every photo taken at work without finding a window first.\n\n" +
      "Office lighting is built for paperwork. Fluorescent tubes sit directly overhead, so the light falls straight down — shadows under your eyes, your nose and your chin, the least flattering angle there is.\n\n" +
      "And office tubes are slightly green. You cannot see it until a camera does.\n\n" +
      "₦1,000 for one photo.\n\n💬 Comment LIGHT and I'll send you the link.\n\n" +
      "#worklife #lagosbusiness #aluxart",
  },
  {
    id: "p67", week: 17, slot: "C", product: "gif", trigger: "GIF",
    title: "A sticker for a service business",
    photos: "A service-business before/after that becomes the GIF",
    cards: [
      { headline: "Get Your Business Name Into Strangers' Stories Without Asking Anyone a Favour",
        body: "They use it because they want to." },
      { eyebrow: "The problem",
        headline: "Asking people to share your post is begging.",
        body: "And it works once, from people who already know you." },
      { eyebrow: "What works instead",
        headline: "Make something they want to use.",
        body: "A sticker gets picked because it says what they were already trying to say. Your name rides along." },
      { eyebrow: "What is in it",
        headline: "Your pictures, your words, your website.",
        body: "Up to six scenes and the search tags you choose." },
      cta("GIF", "Send me two pictures and your tagline.", SEE_PRICES),
    ],
    caption:
      "Get your business name into strangers' stories without asking anyone a favour.\n\n" +
      "Asking people to share your post is begging, and it works once, from people who already know you.\n\n" +
      "A sticker gets picked up because it says what somebody was already trying to say. Your name rides along for free.\n\n" +
      "💬 Comment GIF and we'll make yours right there in the chat.\n\n#smallbusinessnigeria #instagramstickers #aluxart",
  },
  {
    id: "p68", week: 17, slot: "D", product: "shoot", trigger: "STUDIO",
    title: "Best set of the week",
    photos: "One source photo and the set it produced",
    cards: [
      { headline: "Get Five Different Photos of Yourself Without Being Photographed Five Times",
        body: "All of these came from the one on the left." },
      { eyebrow: "Same face, every time",
        headline: "Locked to your photo, not a lookalike.",
        body: "Different pose, framing and light in each one." },
      cta("STUDIO", "Send me one photo.", SEE_PRICES),
    ],
    caption:
      "Get five different photos of yourself without being photographed five times.\n\n" +
      "All of these came from the one on the left.\n\n" +
      "💬 Comment STUDIO and I'll send you the link.\n\n#aluxart",
  },

  // ───────────────── WEEK 18 — run-up to Valentine's (1–7 Feb) ───────────────
  {
    id: "p69", week: 18, slot: "A", product: "studio", trigger: "STUDIO",
    title: "The couple portrait",
    photos: "A couple photographed at home, and the studio version",
    cards: [
      { headline: "Get a Couple Portrait Before Valentine's Without Booking a Couple Shoot",
        body: "Two weeks' notice is enough. So is one photo." },
      { eyebrow: "The problem",
        headline: "Couple shoots are booked out by now.",
        body: "And the ones that are not cost more than the dinner, the gift and the hotel together." },
      { eyebrow: "What you actually need",
        headline: "One photo of the two of you.",
        body: "Standing anywhere. Most couples do not have a single good one of just them." },
      { eyebrow: "Both faces stay theirs",
        headline: "Two identities, locked.",
        body: "Neither face is averaged, smoothed or made to look like the other." },
      { eyebrow: "What it costs",
        headline: "Less than the flowers.",
        body: PRICE },
      cta("STUDIO", "Take one of the two of you."),
    ],
    caption:
      "Get a couple portrait before Valentine's without booking a couple shoot.\n\n" +
      "Couple shoots are booked out by now, and the ones that are not cost more than the dinner, the gift and the hotel put together.\n\n" +
      "Most couples do not have a single good photograph of just the two of them. Take one, standing anywhere.\n\n" +
      "₦1,000 for one photo.\n\n💬 Comment STUDIO and I'll send you the link.\n\n" +
      "#valentines #couplegoals #nigeriancouples #aluxart",
  },
  {
    id: "p70", week: 18, slot: "B", product: "relight", trigger: "LIGHT",
    title: "The date night photo",
    photos: "A dim date-night photo and the relit version",
    cards: [
      { headline: "How to Rescue Every Date Night Photo Without Asking the Waiter to Take It Again",
        body: "The evening was better than the picture." },
      { eyebrow: "The problem",
        headline: "The nicer the restaurant, the darker it is.",
        body: "Mood lighting is the enemy of a phone camera, and the places worth photographing have the most of it." },
      { eyebrow: "And the one photo you got",
        headline: "A stranger took it, in a hurry.",
        body: "Nobody asks a waiter twice. You get one frame and you are stuck with it." },
      { eyebrow: "The fix",
        headline: "That one frame, properly lit.",
        body: "The room keeps its warmth and both of you come out of the shadow." },
      { eyebrow: "What it costs",
        headline: "No second dinner.",
        body: PRICE },
      cta("LIGHT", "Send me one from date night."),
    ],
    caption:
      "How to rescue every date night photo without asking the waiter to take it again.\n\n" +
      "The nicer the restaurant, the darker it is — mood lighting is the enemy of a phone camera, and the places worth photographing have the most of it.\n\n" +
      "And nobody asks a waiter twice. You get one frame and you are stuck with it.\n\n" +
      "That one frame can be properly lit afterwards. ₦1,000.\n\n" +
      "💬 Comment LIGHT and I'll send you the link.\n\n#datenight #valentines #lagosrestaurants #aluxart",
  },
  {
    id: "p71", week: 18, slot: "C", product: "assets", trigger: "ASSETS",
    title: "Valentine's stock",
    photos: "Valentine's stock photographed at home, and the extracted product angles",
    cards: [
      { headline: "Sell Out Your Valentine's Stock Even Without a Model, a Studio or More Time",
        body: "Ten days to sell it. One photo per piece." },
      { eyebrow: "The problem",
        headline: "Valentine's stock has a deadline.",
        body: "On 15 February it is worth a third of what it was worth on the 13th. There is no second chance at it." },
      { eyebrow: "What is slowing you down",
        headline: "The photographs, not the products.",
        body: "You have the stock. What you do not have is time to shoot every piece properly before the date." },
      { eyebrow: "What you send",
        headline: "One photo per piece, however it sits.",
        body: "Clean product shots come back the same day, from four angles, ready to post." },
      { eyebrow: "What it costs",
        headline: "Per piece, so you shoot the sellers first.",
        body: PRICE },
      cta("ASSETS", "Send me your Valentine's pieces."),
    ],
    caption:
      "Sell out your Valentine's stock even without a model, a studio or more time.\n\n" +
      "Valentine's stock has a hard deadline. On 15 February it is worth a third of what it was worth on the 13th, and there is no second chance at it.\n\n" +
      "What is slowing you down is not the products, it is the photographs. Send one per piece and clean shots come back the same day.\n\n" +
      "₦1,000 per photo.\n\n💬 Comment ASSETS and I'll send you the link.\n\n" +
      "#valentines #nigerianvendor #giftsnigeria #aluxart",
  },
  {
    id: "p72", week: 18, slot: "D", product: "relight", trigger: "LIGHT",
    title: "Best pair of the week",
    photos: "The strongest before/after you have this week",
    cards: [
      { headline: "Get the Photo You Wish You Had Taken Without Going Back There",
        body: "Same evening. Same table." },
      { eyebrow: "What it costs",
        headline: "One photo, back the same day.",
        body: PRICE },
      cta("LIGHT", "Send me one."),
    ],
    caption:
      "Get the photo you wish you had taken without going back there.\n\n" +
      "Same evening. Same table. ₦1,000.\n\n" +
      "💬 Comment LIGHT and I'll send you the link.\n\n#aluxart",
  },

  // ───────────────── WEEK 19 — Valentine's week (8–14 Feb) ───────────────────
  {
    id: "p73", week: 19, slot: "A", product: "shoot", trigger: "STUDIO",
    title: "A couple's set",
    photos: "One photo of a couple and the set it produced",
    cards: [
      { headline: "Get a Full Couple's Shoot This Week Even Though Every Photographer Is Booked",
        body: "One photo of the two of you. A whole set back." },
      { eyebrow: "The problem",
        headline: "Nobody has a slot left before Saturday.",
        body: "Valentine's week is the busiest week of the year for every photographer in the country." },
      { eyebrow: "What you send",
        headline: "One photo of the two of you together.",
        body: "Taken anywhere, today, on a phone." },
      { eyebrow: "What comes back",
        headline: "A set, not a single frame.",
        body: "Different poses, framing and light — both faces held exactly as they are throughout." },
      { eyebrow: "In time for the day",
        headline: "Sent this week, ready for Saturday.",
        body: "Print one, or just have something worth posting." },
      cta("STUDIO", "Send me one photo of the two of you.", SEE_PRICES),
    ],
    caption:
      "Get a full couple's shoot this week even though every photographer is booked.\n\n" +
      "Valentine's week is the busiest week of the year for photographers in this country. Nobody has a slot left before Saturday.\n\n" +
      "Send one photo of the two of you, taken anywhere, today. A whole set comes back — different poses, framing and light, both faces exactly as they are.\n\n" +
      "💬 Comment STUDIO and I'll send you the link.\n\n#valentines #couplesshoot #nigeriancouples #aluxart",
  },
  {
    id: "p74", week: 19, slot: "B", product: "relight", trigger: "LIGHT",
    title: "The surprise, photographed in the dark",
    photos: "A dark photo of a proposal or surprise, and the relit version",
    cards: [
      { headline: "How to Save the Photo of a Moment That Only Happened Once — Without a Flash or a Reshoot",
        body: "Proposals happen at night. Phones do not." },
      { eyebrow: "The problem",
        headline: "The best moments are badly lit.",
        body: "Candles, a restaurant, a dark garden, a surprise at night. Nobody sets up lighting for something meant to be a secret." },
      { eyebrow: "And it cannot be staged again",
        headline: "You get one frame of it, forever.",
        body: "Whoever was holding the phone got what they got, and it is the only record there will ever be." },
      { eyebrow: "That is why it is worth fixing",
        headline: "Nothing about the moment changes.",
        body: "Same faces, same place, same second. Only the light, put where it should have been." },
      { eyebrow: "What it costs",
        headline: "For something irreplaceable.",
        body: PRICE },
      cta("LIGHT", "Send me the one that matters."),
    ],
    caption:
      "How to save the photo of a moment that only happened once — without a flash or a reshoot.\n\n" +
      "Proposals happen at night. Nobody sets up lighting for something meant to be a secret, so whoever was holding the phone got what they got — and it is the only record there will ever be.\n\n" +
      "Nothing about the moment changes. Same faces, same place, same second. Only the light.\n\n" +
      "₦1,000 for one photo.\n\n💬 Comment LIGHT and I'll send you the link.\n\n" +
      "#proposal #valentines #engaged #aluxart",
  },
  {
    id: "p75", week: 19, slot: "C", product: "gif", trigger: "GIF",
    title: "A Valentine's sticker",
    photos: "A Valentine's-themed before/after that becomes the GIF",
    cards: [
      { headline: "Get Your Business Into Everybody's Valentine's Stories Without Buying a Single Ad",
        body: "Two days of the loudest stories of the year." },
      { eyebrow: "The problem",
        headline: "Everyone posts on Valentine's.",
        body: "Which makes it the hardest day of the year to be seen and the most expensive to buy reach." },
      { eyebrow: "What gets through",
        headline: "The sticker on top of their photo.",
        body: "People decorating their own posts will reach for one. That is a placement nobody can outbid you for." },
      { eyebrow: "Make it today",
        headline: "Two pictures and your words.",
        body: "About two minutes in a chat, ready before the weekend." },
      cta("GIF", "Send me two pictures today.", SEE_PRICES),
    ],
    caption:
      "Get your business into everybody's Valentine's stories without buying a single ad.\n\n" +
      "Everyone posts on Valentine's, which makes it the hardest day of the year to be seen and the most expensive day to buy reach.\n\n" +
      "What gets through is the sticker on top of their photo — a placement nobody can outbid you for, because they put it there themselves.\n\n" +
      "💬 Comment GIF and we'll make yours right there in the chat.\n\n#valentines #smallbusinessnigeria #aluxart",
  },
  {
    id: "p76", week: 19, slot: "D", product: "studio", trigger: "STUDIO",
    title: "VALENTINE'S DAY — best couple pair",
    photos: "The strongest couple before/after you have",
    cards: [
      { headline: "Get a Portrait of the Two of You Today Without Either of You Leaving the House",
        body: "Happy Valentine's Day." },
      { eyebrow: "One photo is enough",
        headline: "Taken today, on a phone, anywhere.",
        body: "Both faces kept exactly as they are. " + PRICE },
      cta("STUDIO", "Take one of the two of you today."),
    ],
    caption:
      "Happy Valentine's Day ❤️\n\n" +
      "Get a portrait of the two of you today without either of you leaving the house.\n\n" +
      "One photo, taken anywhere, on a phone. ₦1,000.\n\n" +
      "💬 Comment STUDIO and I'll send you the link.\n\n#valentinesday #couplegoals #aluxart",
  },

  // ───────────────── WEEK 20 — after the rush (15–21 Feb) ────────────────────
  {
    id: "p77", week: 20, slot: "A", product: "studio", trigger: "STUDIO",
    title: "The photo you took yesterday",
    photos: "A Valentine's photo taken at home, and the studio version",
    cards: [
      { headline: "Get a Portrait Out of Yesterday Without Having Planned Anything",
        body: "You dressed up. Somebody took a photo. That is all it needed." },
      { eyebrow: "The problem",
        headline: "The effort went into the day, not the picture.",
        body: "Outfit, booking, gift, hair. Then one rushed photo against a wall at the end of it." },
      { eyebrow: "The good news",
        headline: "The hard part is already done.",
        body: "You will not look like that again for a while. The photograph is the only part still fixable." },
      { eyebrow: "What you send",
        headline: "Whatever you ended up with.",
        body: "Rushed, badly lit, taken in a corridor. It makes no difference." },
      { eyebrow: "What it costs",
        headline: "One photo, back the same day.",
        body: PRICE },
      cta("STUDIO", "Send me yesterday's photo."),
    ],
    caption:
      "Get a portrait out of yesterday without having planned anything.\n\n" +
      "All the effort went into the day — the outfit, the booking, the hair — and then one rushed photo against a wall at the end of it.\n\n" +
      "The hard part is already done, and you will not look like that again for a while. The photograph is the only part still fixable.\n\n" +
      "₦1,000 for one photo.\n\n💬 Comment STUDIO and I'll send you the link.\n\n#valentines #aluxart",
  },
  {
    id: "p78", week: 20, slot: "B", product: "relight", trigger: "LIGHT",
    title: "A good photo of your partner",
    photos: "A casual photo of one person, and the relit version",
    cards: [
      { headline: "Get One Good Photograph of Somebody You Love Without Them Knowing You Are Trying",
        body: "Taken while she was not looking." },
      { eyebrow: "The problem",
        headline: "The people closest to you are the worst photographed.",
        body: "Hundreds of pictures, none of them good, because nobody is setting up a portrait of the person they see every day." },
      { eyebrow: "What that means later",
        headline: "The casual one becomes the only one.",
        body: "And it was taken in a kitchen, under one bulb, while they were doing something else." },
      { eyebrow: "The fix",
        headline: "Keep the moment, change the light.",
        body: "They stay exactly as they were — unposed, not looking, mid-laugh. Just lit properly." },
      { eyebrow: "What it costs",
        headline: "One photo, back the same day.",
        body: PRICE },
      cta("LIGHT", "Send me one of them."),
    ],
    caption:
      "Get one good photograph of somebody you love without them knowing you are trying.\n\n" +
      "The people closest to you are the worst photographed — hundreds of pictures, none of them good, because nobody sets up a portrait of the person they see every day.\n\n" +
      "Then the casual one becomes the only one, and it was taken in a kitchen under one bulb.\n\n" +
      "Keep the moment. Change the light. ₦1,000.\n\n" +
      "💬 Comment LIGHT and I'll send you the link.\n\n#aluxart",
  },
  {
    id: "p79", week: 20, slot: "C", product: "assets", trigger: "ASSETS",
    title: "Restocking after Valentine's",
    photos: "New stock photographed at home, and the extracted product angles",
    cards: [
      { headline: "Get New Stock Online the Day It Arrives Without Waiting for a Photoshoot",
        body: "Unbox it, photograph it, list it." },
      { eyebrow: "The problem",
        headline: "Stock sits in bags waiting to be photographed.",
        body: "Every day it is not listed is a day it is not selling, and the shoot keeps getting pushed to the weekend." },
      { eyebrow: "What that actually costs",
        headline: "Two weeks of a season you paid for.",
        body: "By the time the photos are done, the people who wanted it have bought elsewhere." },
      { eyebrow: "What you do instead",
        headline: "One photo as you unbox it.",
        body: "On the floor, on the bed, in the bag. Clean shots come back the same day." },
      { eyebrow: "What it costs",
        headline: "Per piece, as the stock arrives.",
        body: PRICE },
      cta("ASSETS", "Send me a photo of what just arrived."),
    ],
    caption:
      "Get new stock online the day it arrives without waiting for a photoshoot.\n\n" +
      "Stock sits in bags waiting to be photographed, and every day it is not listed is a day it is not selling. By the time the shoot happens, the people who wanted it have bought elsewhere.\n\n" +
      "Photograph it as you unbox it — on the floor, in the bag, anywhere. Clean shots come back the same day.\n\n" +
      "₦1,000 per photo.\n\n💬 Comment ASSETS and I'll send you the link.\n\n" +
      "#nigerianvendor #restock #onlinebusiness #aluxart",
  },
  {
    id: "p80", week: 20, slot: "D", product: "relight", trigger: "LIGHT",
    title: "Best pair of the week",
    photos: "The strongest before/after you have this week",
    cards: [
      { headline: "Get a Photo of Somebody Looking Their Best Without Asking Them to Pose",
        body: "She was not even looking at the camera." },
      { eyebrow: "What it costs",
        headline: "One photo, back the same day.",
        body: PRICE },
      cta("LIGHT", "Send me one."),
    ],
    caption:
      "Get a photo of somebody looking their best without asking them to pose.\n\n" +
      "She was not even looking at the camera. ₦1,000.\n\n" +
      "💬 Comment LIGHT and I'll send you the link.\n\n#aluxart",
  },

  // ───────────────── WEEK 21 — how it works (22–28 Feb) ──────────────────────
  {
    id: "p81", week: 21, slot: "A", product: "shoot", trigger: "STUDIO",
    title: "One, five or ten",
    photos: "One source photo shown against a one-image, five-image and ten-image result",
    cards: [
      { headline: "Get Exactly as Many Photos as You Need Without Paying for a Whole Session",
        body: "One, five or ten. You choose before you pay." },
      { eyebrow: "The problem",
        headline: "A studio sells you a session, not photos.",
        body: "You pay for the hour whether you needed one good picture or twenty." },
      { eyebrow: "One image",
        headline: "For a profile picture or a frame.",
        body: "The smallest thing you can buy, and often all anybody needs." },
      { eyebrow: "Five images",
        headline: "For a page that has to keep posting.",
        body: "Enough variety that you are not repeating the same face every week." },
      { eyebrow: "Ten images",
        headline: "For a business, a brand or a whole year.",
        body: "Profile, banner, about page, posts, email signature — covered." },
      cta("STUDIO", "Pick the size that fits.", SEE_PRICES),
    ],
    caption:
      "Get exactly as many photos as you need without paying for a whole session.\n\n" +
      "A studio sells you an hour whether you needed one good picture or twenty.\n\n" +
      "Here you choose first: one image for a profile picture, five for a page that has to keep posting, ten for a business that needs a profile, a banner, an about page and a year of posts.\n\n" +
      "💬 Comment STUDIO and I'll send you the link with what each one costs.\n\n" +
      "#aluxart #lagosbusiness #headshots",
  },
  {
    id: "p82", week: 21, slot: "B", product: "relight", trigger: "LIGHT",
    title: "The family archive",
    photos: "A genuinely old family photograph and the relit version",
    cards: [
      { headline: "Bring Back a Photograph of Someone Who Is Gone Without Changing Their Face",
        body: "The only picture left, and it was badly lit." },
      { eyebrow: "The problem",
        headline: "Old family photos were taken carelessly.",
        body: "Nobody knew it would be the last one. So it was taken on a phone, indoors, in a hurry." },
      { eyebrow: "What that leaves you",
        headline: "One dark picture and no second chance.",
        body: "There is no reshoot, no better angle, no asking them to stand somewhere else." },
      { eyebrow: "What we do and do not touch",
        headline: "Only the light. Never the face.",
        body: "Same features, same expression, same moment. Nobody is smoothed, straightened or made younger." },
      { eyebrow: "What it costs",
        headline: "For the only one you have.",
        body: PRICE },
      cta("LIGHT", "Send me the one you cannot replace."),
    ],
    caption:
      "Bring back a photograph of someone who is gone without changing their face.\n\n" +
      "Nobody knows which photo will be the last one, so it gets taken on a phone, indoors, in a hurry. Then there is no reshoot and no better angle.\n\n" +
      "Only the light is changed. Never the face. Same features, same expression, same moment — nobody is smoothed, straightened or made younger.\n\n" +
      "₦1,000 for one photo.\n\n💬 Comment LIGHT and I'll send you the link.\n\n#family #memories #aluxart",
  },
  {
    id: "p83", week: 21, slot: "C", product: "gif", trigger: "GIF",
    title: "A sticker that works all year",
    photos: "A before/after that becomes the GIF",
    cards: [
      { headline: "Make One Advert That Still Works in December Without Paying for It Every Month",
        body: "Made once. Used by other people, indefinitely." },
      { eyebrow: "The problem",
        headline: "Everything else you pay for stops.",
        body: "The ad stops when the budget stops. The post sinks in a day. The flyer is in a bin by Tuesday." },
      { eyebrow: "What does not stop",
        headline: "Something that lives in the sticker search.",
        body: "Somebody types your word in nine months' time and your business is still there." },
      { eyebrow: "You choose the words",
        headline: "The tags are yours to pick.",
        body: "Your name, your service, your city. Up to six scenes and your website at the end." },
      cta("GIF", "Send me two pictures and your tagline.", SEE_PRICES),
    ],
    caption:
      "Make one advert that still works in December without paying for it every month.\n\n" +
      "The ad stops when the budget stops. The post sinks in a day. The flyer is in a bin by Tuesday.\n\n" +
      "A sticker sits in the search. Somebody types your word nine months from now and your business is still there — and you chose the word.\n\n" +
      "💬 Comment GIF and we'll make yours right there in the chat.\n\n#smallbusinessnigeria #aluxart",
  },
  {
    id: "p84", week: 21, slot: "D", product: "assets", trigger: "ASSETS",
    title: "Best product shot of the week",
    photos: "The strongest product before/after you have this week",
    cards: [
      { headline: "Get a Shop-Window Product Shot Without a Shop, a Window or a Studio",
        body: "Photographed on a bed. Sold like a boutique." },
      { eyebrow: "What it costs",
        headline: "Per piece, back the same day.",
        body: PRICE },
      cta("ASSETS", "Send me one piece."),
    ],
    caption:
      "Get a shop-window product shot without a shop, a window or a studio.\n\n" +
      "Photographed on a bed. ₦1,000 per photo.\n\n" +
      "💬 Comment ASSETS and I'll send you the link.\n\n#nigerianvendor #aluxart",
  },

  // ───────────────── WEEK 22 — Mother's Day week (1–7 Mar) ───────────────────
  {
    id: "p85", week: 22, slot: "A", product: "studio", trigger: "STUDIO",
    title: "A portrait of your mother",
    photos: "An older woman photographed at home, and the studio portrait",
    cards: [
      { headline: "Get a Proper Portrait of Your Mother This Week Without Taking Her Anywhere",
        body: "She will say no to a studio. She will sit for one photo." },
      { eyebrow: "The problem",
        headline: "She will not go to a photographer.",
        body: "It is a fuss, it costs money, and she does not think she needs it. You will not win that argument." },
      { eyebrow: "What she will agree to",
        headline: "One photo, in her own sitting room.",
        body: "Thirty seconds, no fuss, nobody watching. That is a conversation you can win." },
      { eyebrow: "What she gets back",
        headline: "The portrait she would never have booked.",
        body: "Printed, framed, given to her on Sunday." },
      { eyebrow: "What it costs",
        headline: "One photo, back the same day.",
        body: PRICE },
      cta("STUDIO", "Take one of her this week."),
    ],
    caption:
      "Get a proper portrait of your mother this week without taking her anywhere.\n\n" +
      "She will not go to a photographer. It is a fuss, it costs money, and she does not think she needs it. You will not win that argument.\n\n" +
      "But she will sit for one photo in her own sitting room. Thirty seconds, nobody watching. Then she gets the portrait she would never have booked.\n\n" +
      "₦1,000 for one photo.\n\n💬 Comment STUDIO and I'll send you the link.\n\n" +
      "#mothersday #nigerianmothers #aluxart",
  },
  {
    id: "p86", week: 22, slot: "B", product: "relight", trigger: "LIGHT",
    title: "An old photo of her",
    photos: "An old photograph of a mother, and the relit version",
    cards: [
      { headline: "Give Her Back a Photograph From Thirty Years Ago Without Altering a Thing About It",
        body: "Her own photo, finally visible." },
      { eyebrow: "The gift nobody thinks of",
        headline: "She already has the photograph.",
        body: "In an album, in a drawer, faded and dark. She has not looked at it properly in years." },
      { eyebrow: "What is wrong with it",
        headline: "It was badly lit in 1996.",
        body: "And then it faded. Neither of those is damage to the picture — both are fixable." },
      { eyebrow: "What stays exactly as it is",
        headline: "Her face, her hair, her clothes, the room.",
        body: "Nothing is modernised, smoothed or invented. It is her photograph, lit properly." },
      { eyebrow: "What it costs",
        headline: "Less than a card.",
        body: PRICE },
      cta("LIGHT", "Photograph a page of her album and send it."),
    ],
    caption:
      "Give her back a photograph from thirty years ago without altering a thing about it.\n\n" +
      "She already has the photograph. It is in an album, faded and dark, and she has not looked at it properly in years.\n\n" +
      "It was badly lit in 1996 and then it faded. Neither of those is damage — both are fixable, and nothing about her face, her clothes or the room changes.\n\n" +
      "₦1,000 for one photo.\n\n💬 Comment LIGHT and I'll send you the link.\n\n" +
      "#mothersday #throwback #family #aluxart",
  },
  {
    id: "p87", week: 22, slot: "C", product: "shoot", trigger: "STUDIO",
    title: "A set for her",
    photos: "One photo of a mother and the set it produced",
    cards: [
      { headline: "Give Her a Full Photoshoot for Mother's Day Even Though She Would Never Book One Herself",
        body: "One photo of her. A whole set back, by Sunday." },
      { eyebrow: "The problem",
        headline: "She has spent thirty years behind the camera.",
        body: "Every birthday, every Christmas, every school event. There are a thousand photos in that house and almost none of her." },
      { eyebrow: "And she will not fix it",
        headline: "She would never spend money on herself for this.",
        body: "Which is exactly why it works as a gift and not as a suggestion." },
      { eyebrow: "What you need",
        headline: "One photo of her. That is all.",
        body: "An old one, a recent one, one you take this week while she is not paying attention." },
      { eyebrow: "What she gets",
        headline: "A set of portraits of herself.",
        body: "Different poses, framing and lighting. The first proper photographs of her in years." },
      cta("STUDIO", "Send me one photo of her.", SEE_PRICES),
    ],
    caption:
      "Give her a full photoshoot for Mother's Day even though she would never book one herself.\n\n" +
      "She has spent thirty years behind the camera — every birthday, every Christmas, every school event. There are a thousand photographs in that house and almost none of her.\n\n" +
      "And she would never spend money on herself for this, which is exactly why it works as a gift.\n\n" +
      "One photo of her is all you need.\n\n" +
      "💬 Comment STUDIO and I'll send you the link.\n\n#mothersday #nigerianmothers #aluxart",
  },
  {
    id: "p88", week: 22, slot: "D", product: "studio", trigger: "STUDIO",
    title: "MOTHERING SUNDAY — mother and child",
    photos: "The strongest mother-and-child before/after you have",
    cards: [
      { headline: "Get a Portrait of You and Your Mother Today Without Planning It in Advance",
        body: "Happy Mother's Day. One photo, taken today." },
      { eyebrow: "If you are with her today",
        headline: "Ask somebody to take one of the two of you.",
        body: "Anywhere in the house. It is the photo you will want later. " + PRICE },
      cta("STUDIO", "Take one with her today."),
    ],
    caption:
      "Happy Mother's Day 🤍\n\n" +
      "Get a portrait of you and your mother today without planning it in advance.\n\n" +
      "If you are with her, ask somebody to take one of the two of you, anywhere in the house. It is the photo you will want later.\n\n" +
      "₦1,000 for one photo.\n\n💬 Comment STUDIO and I'll send you the link.\n\n" +
      "#mothersday #mothersday2027 #nigerianmothers #aluxart",
  },
];
