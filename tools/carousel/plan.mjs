/**
 * Twelve weeks of carousels, written out.
 *
 * Every post here passes the seven-point gate the audit produced, and the two
 * rules that matter most are structural rather than editorial, so they are
 * enforced by the app rather than left to whoever is typing:
 *
 *   Slide 1 is a photograph. Slide 2 is the same subject transformed. The
 *   18 August post reached 20,907 opening that way; the posts that opened on a
 *   text card reached 102 and 114.
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
 */

/** The words that turn a scroll into a DM. One per product, never improvised. */
export const TRIGGERS = {
  studio: "STUDIO",
  relight: "LIGHT",
  assets: "ASSETS",
  gif: "GIF",
  shoot: "SHOOT",
};

const cta = (word) => ({
  eyebrow: "Start today",
  headline: word === "STUDIO" ? "Send me one photo."
          : word === "ASSETS" ? "Send me one photo of it."
          : word === "GIF" ? "Let's make yours."
          : word === "SHOOT" ? "No studio. No appointment."
          : "Send me a dark one.",
  body: `Comment ${word} and I'll send you the link.`,
});

/** ₦1,000 a photo, said the same way every time so the price never looks invented. */
const PRICE = "₦1,000 for one photo. No subscription — you pay for the photos you actually fix.";

export const PLAN = [
  // ───────────────────────── MONTH 1 — rebuild the habit ─────────────────────
  {
    id: "p01", week: 1, slot: "A", product: "studio", trigger: "STUDIO",
    title: "Phone to studio — the party dress",
    photos: "A child photographed at home against a plain wall, and the same photo turned into a studio portrait",
    cards: [
      { headline: "Taken against a wall at home.", body: "Same dress. Same child. A studio behind her." },
      { headline: "A sitting room is not a studio.", body: "One window, a wall two feet behind her, and nothing separating child from background. That is why it looks like a snapshot." },
      { headline: "Nothing about her changed.", body: "Same face, same outfit, same smile. Only the room and the light are new." },
      { headline: "No studio. No appointment. No dressing up twice.", body: PRICE },
      cta("STUDIO"),
    ],
    caption:
      "You already took the photo. It just happened to be taken in your sitting room.\n\n" +
      "A studio does two things a house cannot: it puts a clean backdrop far enough behind you that you stand apart from it, and it lights you from the side instead of straight on. That is the whole difference. Not a better camera — a better room.\n\n" +
      "Same dress. Same child. ₦1,000 for one photo.\n\n" +
      "💬 Comment STUDIO and I'll send you the link.\n\n" +
      "#abujaphotographer #nigerianchildren #studioportrait #kiddiesfashion #aluxart",
  },
  {
    id: "p02", week: 1, slot: "B", product: "relight", trigger: "LIGHT",
    title: "Relight — the club photo",
    photos: "A photo taken in a dark club or bar under coloured light, and the relit version",
    cards: [
      { headline: "Too dark for your phone.", body: "Same photo. The flash arrived afterwards." },
      { headline: "It was never your phone's fault.", body: "A small sensor in a dark room has two options: hold the shutter open, or turn up the gain. One gives you blur, the other noise. Yours did both." },
      { headline: "The only cure for a dark room is more light.", body: "Nobody carries a flash to a club. So the light arrives after — same night, same outfit, lit like you brought one." },
      { headline: "No camera. No flash. No reshoot.", body: PRICE },
      cta("LIGHT"),
    ],
    caption:
      "The club was too dark for your phone. That was never your fault.\n\n" +
      "In a dark room your phone holds the shutter open longer and cranks the gain, so you get noise and blur. Then it “helps” by lifting the brightness, which is where the orange comes from. Add a coloured LED wash and your skin is somebody else's colour.\n\n" +
      "The fix was never a better phone. It was a flash — and that can arrive after the night is over.\n\n" +
      "₦1,000 for one photo.\n\n" +
      "💬 Comment LIGHT and I'll send you the link.\n\n" +
      "#lagosnightlife #nigerianphotographer #phonephotography #lowlightphotography #aluxart",
  },
  {
    id: "p03", week: 1, slot: "C", product: "assets", trigger: "ASSETS",
    title: "Asset extractor — the dress on a hanger",
    photos: "A garment photographed on a hanger or rail, and the same garment extracted on its own",
    cards: [
      { headline: "Shot on a hanger. Sold like one.", body: "Same dress, lifted off the rail." },
      { headline: "Buyers cannot picture it from a hanger.", body: "A garment on a rail reads as stock. A garment with shape, front and back, reads as something you could wear on Saturday." },
      { headline: "One photo in. Four angles out.", body: "Front, three-quarter, side and back — from a single picture. No model, no mannequin, no reshoot." },
      { headline: "It lifts more than clothes.", body: "Wigs, shoes, bags, jewellery, nails. Anything you sell." },
      cta("ASSETS"),
    ],
    caption:
      "Your dress is beautiful. The hanger is doing it no favours.\n\n" +
      "A buyer scrolling cannot tell how a garment falls from a photo of it hanging flat. They need to see shape — front, side, back — and most vendors cannot afford a model for every piece.\n\n" +
      "Send one photo of the item and it comes back on its own, from four angles.\n\n" +
      "₦1,000 per photo.\n\n" +
      "💬 Comment ASSETS and I'll send you the link.\n\n" +
      "#nigerianfashion #abujavendor #onlinevendor #fashionbusiness #aluxart",
  },
  {
    id: "p04", week: 1, slot: "D", product: "relight", trigger: "LIGHT",
    title: "Best pair of the week",
    photos: "Whichever before/after you have this week that reads most clearly at thumbnail size",
    cards: [
      { headline: "Same room. Same phone.", body: "One light moved." },
      { headline: "That is the whole service.", body: PRICE },
      cta("LIGHT"),
    ],
    caption:
      "Same room. Same phone. One light moved.\n\n₦1,000 for one photo.\n\n" +
      "💬 Comment LIGHT and I'll send you the link.\n\n#aluxart #nigerianphotographer",
  },
  {
    id: "p05", week: 2, slot: "A", product: "studio", trigger: "STUDIO",
    title: "Phone to studio — the staircase",
    photos: "Someone photographed on a staircase or corridor at home, and the studio version",
    cards: [
      { headline: "The staircase was the only clean spot in the house.", body: "We gave her somewhere better to stand." },
      { headline: "Home walls flatten a photograph.", body: "Stand close to a wall and the light hits you and the wall equally. Nothing separates you from the background, so the picture reads flat." },
      { headline: "Depth is the thing you cannot fake with a filter.", body: "A backdrop set back, lit separately, is what makes a portrait look taken rather than snapped." },
      { headline: "Same outfit. Same day.", body: PRICE },
      cta("STUDIO"),
    ],
    caption:
      "Every Nigerian family has this photo. The outfit is beautiful, everyone is ready, and the only clean background in the house is the staircase.\n\n" +
      "The problem is not the staircase. It is that you are standing against it. Light falls on you and the wall together, so there is no separation and the picture goes flat.\n\n" +
      "A studio solves it by moving the background back and lighting it separately. We can do that afterwards.\n\n" +
      "₦1,000 for one photo.\n\n" +
      "💬 Comment STUDIO and I'll send you the link.\n\n" +
      "#abujaphotographer #studioportrait #nigerianfamily #aluxart",
  },
  {
    id: "p06", week: 2, slot: "B", product: "relight", trigger: "LIGHT",
    title: "Relight — owambe yellow",
    photos: "An owambe or hall photo with a yellow cast, and the corrected version",
    cards: [
      { headline: "The hall was yellow. You are not.", body: "Same photo, with your actual skin back." },
      { headline: "Canopy bulbs are the problem.", body: "Hall lighting is warm, cheap and everywhere, so every face in the room picks up the same orange wash." },
      { headline: "Your phone then makes it worse.", body: "It tries to balance for the brightest thing in frame — usually a white canopy — and pushes everyone else further orange." },
      { headline: "Your skin tone is not a filter setting.", body: PRICE },
      cta("LIGHT"),
    ],
    caption:
      "Owambe light is yellow. Your skin is not.\n\n" +
      "Those warm canopy bulbs wash every face in the hall the same colour, and your phone makes it worse by balancing for the brightest thing in frame. You come out orange, and no amount of brightening fixes a colour problem.\n\n" +
      "Relighting it properly puts your real skin tone back.\n\n" +
      "₦1,000 for one photo.\n\n" +
      "💬 Comment LIGHT and I'll send you the link.\n\n" +
      "#owambe #nigerianwedding #asoebi #lagosparty #aluxart",
  },
  {
    id: "p07", week: 2, slot: "C", product: "gif", trigger: "GIF",
    title: "GIF maker — what it is",
    photos: "A before/after pair that will become the GIF itself",
    cards: [
      { headline: "A sticker that sells for you.", body: "Two photos, your words, one loop." },
      { headline: "It goes where you cannot.", body: "People use it in their own stories and under other people's posts. Your words travel with it." },
      { headline: "You choose every frame.", body: "Up to six scenes. Your pictures, your lines, your website at the end." },
      { headline: "Made in a chat, in two minutes.", body: "Send the pictures, type the words, and it comes back ready to post." },
      cta("GIF"),
    ],
    caption:
      "Most adverts stop working the moment you stop paying. A sticker does not.\n\n" +
      "Send two pictures and the words you want on them, and you get back a short loop you can use as an Instagram sticker — the kind people drop into their own stories and under other people's posts. Your message travels with it, for free, for as long as people keep using it.\n\n" +
      "💬 Comment GIF and I'll send you the link.\n\n" +
      "#instagramstickers #smallbusinessnigeria #aluxart",
  },
  {
    id: "p08", week: 2, slot: "D", product: "relight", trigger: "LIGHT",
    title: "Best pair of the week",
    photos: "The strongest before/after you have this week",
    cards: [
      { headline: "You already took the photo.", body: "We only changed the light." },
      { headline: "Nothing was reshot.", body: PRICE },
      cta("LIGHT"),
    ],
    caption:
      "You already took the photo. We only changed the light.\n\n₦1,000 for one photo.\n\n" +
      "💬 Comment LIGHT and I'll send you the link.\n\n#aluxart",
  },
  {
    id: "p09", week: 3, slot: "A", product: "studio", trigger: "STUDIO",
    title: "Phone to studio — the birthday",
    photos: "A birthday photo taken at home, and the studio version",
    cards: [
      { headline: "The birthday photo everybody takes.", body: "Cake, outfit, and whatever wall was nearest." },
      { headline: "You will keep this one for twenty years.", body: "It is worth more than the wall it was taken against." },
      { headline: "Nothing staged. Nothing repeated.", body: "The same moment, in a room that does it justice." },
      { headline: "No second birthday needed.", body: PRICE },
      cta("STUDIO"),
    ],
    caption:
      "Nobody plans the background on a birthday. There is a cake, there is an outfit, and there is whatever wall happened to be behind her.\n\n" +
      "Twenty years from now the wall is the only part you will wish were different.\n\n" +
      "Send me the photo and she keeps the day, in a room that does it justice.\n\n" +
      "₦1,000 for one photo.\n\n" +
      "💬 Comment STUDIO and I'll send you the link.\n\n" +
      "#kidsbirthday #abujamums #studioportrait #aluxart",
  },
  {
    id: "p10", week: 3, slot: "B", product: "relight", trigger: "LIGHT",
    title: "Relight — church windows",
    photos: "A church or hall photo with blown-out highlights, and the relit version",
    cards: [
      { headline: "The windows won.", body: "Same photo, with her face back." },
      { headline: "High windows are the hardest light there is.", body: "The light comes from far above, so eyes fall into shadow while foreheads and cheekbones blow out white." },
      { headline: "Your phone picks one or the other.", body: "Expose for the window and faces go dark. Expose for faces and the window burns. It cannot do both." },
      { headline: "We can do both, afterwards.", body: PRICE },
      cta("LIGHT"),
    ],
    caption:
      "Church light is the hardest light in Nigeria.\n\n" +
      "It comes from high windows, far above everyone, so eyes fall into shadow while foreheads go white. Your phone has to choose: keep the window or keep the face. It cannot keep both.\n\n" +
      "Afterwards, we can.\n\n₦1,000 for one photo.\n\n" +
      "💬 Comment LIGHT and I'll send you the link.\n\n" +
      "#churchwedding #nigerianchurch #dedication #aluxart",
  },
  {
    id: "p11", week: 3, slot: "C", product: "shoot", trigger: "SHOOT",
    title: "Full shoot — one photo, five images",
    photos: "One uploaded photo, and a grid of the five images it produced",
    cards: [
      { headline: "One photo in. Five images out.", body: "Different poses, framing and light — the same person throughout." },
      { headline: "A shoot without the shoot.", body: "No studio booking, no travelling across Lagos, no taking a day off." },
      { headline: "You pick the look.", body: "Portrait, editorial, corporate. The archive has 197 lighting styles." },
      { headline: "Same face. Every time.", body: "Identity is locked to your photo — not a lookalike, not an average." },
      cta("SHOOT"),
    ],
    caption:
      "A photoshoot costs a day and a deposit. This costs one photo.\n\n" +
      "Send a single picture of yourself and it comes back as a set — different poses, different framing, different lighting, the same face throughout.\n\n" +
      "💬 Comment SHOOT and I'll send you the link.\n\n" +
      "#portraitphotography #corporateheadshot #lagosbusiness #aluxart",
  },
  {
    id: "p12", week: 3, slot: "D", product: "relight", trigger: "LIGHT",
    title: "Best pair of the week",
    photos: "The strongest before/after you have this week",
    cards: [
      { headline: "Before. After.", body: "₦1,000." },
      cta("LIGHT"),
    ],
    caption:
      "Before. After. ₦1,000.\n\n💬 Comment LIGHT and I'll send you the link.\n\n#aluxart",
  },
  {
    id: "p13", week: 4, slot: "A", product: "studio", trigger: "STUDIO",
    title: "Phone to studio — two children",
    photos: "Two children photographed together at home, and the studio version",
    cards: [
      { headline: "Getting both of them to look is hard enough.", body: "The background should not be another problem." },
      { headline: "You get one chance with children.", body: "They are still, both looking, nobody crying. Nobody is reshooting that." },
      { headline: "So we fix the room instead.", body: "Same moment, same faces, a backdrop that belongs behind them." },
      { headline: "One photo is all it takes.", body: PRICE },
      cta("STUDIO"),
    ],
    caption:
      "Getting two children to look at the camera at the same time is the hard part. Nobody is doing that twice because of a wall.\n\n" +
      "So keep the moment and change the room.\n\n₦1,000 for one photo.\n\n" +
      "💬 Comment STUDIO and I'll send you the link.\n\n" +
      "#siblings #nigerianchildren #familyportrait #aluxart",
  },
  {
    id: "p14", week: 4, slot: "B", product: "relight", trigger: "LIGHT",
    title: "Relight — direct flash",
    photos: "A direct-flash photo with flat skin and a black background, and the relit version",
    cards: [
      { headline: "The flash fired. That was the problem.", body: "Same photo, lit properly." },
      { headline: "A phone flash sits next to the lens.", body: "So the light hits you straight on, flattens every feature, and drops the background to black." },
      { headline: "Good light comes from the side.", body: "That is what gives a face shape — a cheekbone, a jawline, somewhere for a shadow to fall." },
      { headline: "Same night. Different light.", body: PRICE },
      cta("LIGHT"),
    ],
    caption:
      "Your flash made you look like a suspect. Here is why.\n\n" +
      "A phone's flash sits right beside the lens, so it fires straight at you. Light coming from directly in front flattens every feature — no cheekbone, no jawline, nothing for a shadow to fall on — and anything more than a metre behind you goes black.\n\n" +
      "Light from the side is what gives a face shape. That can be added later.\n\n" +
      "₦1,000 for one photo.\n\n" +
      "💬 Comment LIGHT and I'll send you the link.\n\n#aluxart #phonephotography",
  },
  {
    id: "p15", week: 4, slot: "C", product: "assets", trigger: "ASSETS",
    title: "Asset extractor — the bag",
    photos: "A bag, shoe or accessory photographed on a sofa or table, and the extracted version",
    cards: [
      { headline: "Photographed on a sofa. Sold like it.", body: "Same bag, on its own." },
      { headline: "Background is the difference between a post and a product.", body: "A clean cut-out is what makes a listing look like a shop rather than a WhatsApp status." },
      { headline: "Bags, shoes, wigs, nails, jewellery.", body: "If you sell it, it can be lifted out." },
      { headline: "One photo. No studio.", body: PRICE },
      cta("ASSETS"),
    ],
    caption:
      "The bag is lovely. Your sofa is not part of the sale.\n\n" +
      "A clean product shot is the single thing that separates a listing people trust from one they scroll past, and it is the thing small vendors never have time for.\n\n" +
      "Send one photo of the item.\n\n₦1,000 per photo.\n\n" +
      "💬 Comment ASSETS and I'll send you the link.\n\n" +
      "#nigerianvendor #bagsforsale #onlinebusiness #aluxart",
  },
  {
    id: "p16", week: 4, slot: "D", product: "relight", trigger: "LIGHT",
    title: "Best pair of the week",
    photos: "The strongest before/after you have this week",
    cards: [
      { headline: "You did not need a better camera.", body: "You needed better light." },
      { headline: "It can arrive afterwards.", body: PRICE },
      cta("LIGHT"),
    ],
    caption:
      "You did not need a better camera. You needed better light — and it can arrive afterwards.\n\n" +
      "₦1,000 for one photo.\n\n💬 Comment LIGHT and I'll send you the link.\n\n#aluxart",
  },

  // ───────────────────────── MONTH 2 — trust and objections ──────────────────
  {
    id: "p17", week: 5, slot: "A", product: "studio", trigger: "STUDIO",
    title: "Phone to studio — a customer's result",
    photos: "A customer's own before/after, posted with their permission after the three-week hold",
    cards: [
      { headline: "She sent this from her phone.", body: "Nothing else was asked of her." },
      { headline: "No appointment. No travelling.", body: "One photo, sent in a chat, back the same day." },
      { headline: "Her words, not mine.", body: "Add the customer's actual message here." },
      { headline: "Your turn.", body: PRICE },
      cta("STUDIO"),
    ],
    caption:
      "A customer sent this from her phone while she was at work.\n\n" +
      "No appointment, no studio, no second outfit. One photo in a chat.\n\n" +
      "₦1,000 for one photo.\n\n💬 Comment STUDIO and I'll send you the link.\n\n#aluxart",
  },
  {
    id: "p18", week: 5, slot: "B", product: "relight", trigger: "LIGHT",
    title: "Relight — she almost didn't send it",
    photos: "A customer's before/after where the before looked unpromising",
    cards: [
      { headline: "She almost didn't send this one.", body: "She thought it was too far gone." },
      { headline: "Dark is not the same as ruined.", body: "The detail is usually still there — buried under noise and the wrong colour, but there." },
      { headline: "Send the one you were about to delete.", body: "That is usually the one worth fixing." },
      { headline: "Nothing to lose.", body: PRICE },
      cta("LIGHT"),
    ],
    caption:
      "She almost didn't send this photo. She thought it was too dark to be worth anything.\n\n" +
      "Dark is not the same as ruined. The detail is usually still in there, buried under noise and the wrong colour — which is exactly what relighting pulls back out.\n\n" +
      "Send the one you were about to delete.\n\n₦1,000 for one photo.\n\n" +
      "💬 Comment LIGHT and I'll send you the link.\n\n#aluxart",
  },
  {
    id: "p19", week: 5, slot: "C", product: "assets", trigger: "ASSETS",
    title: "Asset extractor — the rail shot",
    photos: "A vendor's rail or wardrobe shot, and the extracted product angles",
    cards: [
      { headline: "Your whole rail in one photo.", body: "One piece, lifted out of it." },
      { headline: "Buyers do not buy from a rail.", body: "They cannot tell the cut, the length or the fall. So they ask, and half of them never ask." },
      { headline: "Four angles answer the questions first.", body: "Front, three-quarter, side, back — before anyone has to type." },
      { headline: "Per piece, not per shoot.", body: PRICE },
      cta("ASSETS"),
    ],
    caption:
      "Every question a buyer asks in your DMs is a question your photo did not answer.\n\n" +
      "How does it fall? What does the back look like? Is it lined? Four clean angles answer all of it before anybody types, and half the people who would have scrolled past will stay.\n\n" +
      "💬 Comment ASSETS and I'll send you the link.\n\n#nigerianfashion #onlinevendor #aluxart",
  },
  {
    id: "p20", week: 5, slot: "D", product: "relight", trigger: "LIGHT",
    title: "Best pair of the week",
    photos: "The strongest before/after you have this week",
    cards: [
      { headline: "Same photo.", body: "Different night, apparently." },
      cta("LIGHT"),
    ],
    caption: "Same photo. Different night, apparently.\n\n₦1,000.\n\n💬 Comment LIGHT and I'll send you the link.\n\n#aluxart",
  },
  {
    id: "p21", week: 6, slot: "A", product: "studio", trigger: "STUDIO",
    title: "Will it still look like me?",
    photos: "A before/after cropped tight on the face, so identity is obviously preserved",
    cards: [
      { headline: "“Will it still look like her?”", body: "The question everybody asks. Here is the honest answer." },
      { headline: "Look at the face, not the room.", body: "Same eyes, same nose, same gap in the teeth, same everything. Compare them closely — that is the point." },
      { headline: "We change the room and the light.", body: "Never the person. If the face changes, the job is wrong." },
      { headline: "Judge it yourself.", body: PRICE },
      cta("STUDIO"),
    ],
    caption:
      "“Will it still look like me?” is the question I get most, and it is the right question to ask.\n\n" +
      "The answer is that we change the room and the light. Never the face. Crop in close on these two and compare them — same eyes, same nose, same smile. If the person changes, the job was done badly.\n\n" +
      "💬 Comment STUDIO and I'll send you the link.\n\n#aluxart",
  },
  {
    id: "p22", week: 6, slot: "B", product: "relight", trigger: "LIGHT",
    title: "Three photos, one payment",
    photos: "Three before/afters from the same night, shown together",
    cards: [
      { headline: "Three photos from one night.", body: "One payment, one link." },
      { headline: "Send them all at once.", body: "The chat counts them, adds them up and sends a single link." },
      { headline: "₦1,000 each. Nothing hidden.", body: "Three photos is ₦3,000. That is the whole sum." },
      cta("LIGHT"),
    ],
    caption:
      "You do not have to send them one at a time.\n\n" +
      "Send every photo from the night, and the chat counts them, adds them up and gives you one payment link for the lot. Three photos, ₦3,000, one link, all of them back together.\n\n" +
      "💬 Comment LIGHT and I'll send you the link.\n\n#aluxart #dettydecember",
  },
  {
    id: "p23", week: 6, slot: "C", product: "gif", trigger: "GIF",
    title: "GIF maker — a customer's sticker",
    photos: "A customer's finished GIF, shown as before/after stills",
    cards: [
      { headline: "She made this in a chat.", body: "Two pictures and four lines of her own." },
      { headline: "Then it went where she could not.", body: "People use it in their own stories. Her business travels with it." },
      { headline: "Yours takes about two minutes.", body: "Send the pictures, type the words, done." },
      cta("GIF"),
    ],
    caption:
      "She made this in a chat with two pictures and four lines of her own words.\n\n" +
      "Now other people use it in their stories, and her business goes with it. That is advertising that keeps working after you stop paying for it.\n\n" +
      "💬 Comment GIF and I'll send you the link.\n\n#smallbusinessnigeria #aluxart",
  },
  {
    id: "p24", week: 6, slot: "D", product: "relight", trigger: "LIGHT",
    title: "Best pair of the week",
    photos: "The strongest before/after you have this week",
    cards: [
      { headline: "No reshoot. No studio.", body: "Just the light you should have had." },
      cta("LIGHT"),
    ],
    caption: "No reshoot. No studio. Just the light you should have had.\n\n💬 Comment LIGHT and I'll send you the link.\n\n#aluxart",
  },
  {
    id: "p25", week: 7, slot: "A", product: "studio", trigger: "STUDIO",
    title: "Phone to studio — not just children",
    photos: "An adult photographed at home, and the studio portrait",
    cards: [
      { headline: "Not only for children.", body: "Same wall. Same problem. Same fix." },
      { headline: "Everybody has one good photo of themselves.", body: "Usually taken somewhere with terrible light." },
      { headline: "Use it for the thing you keep putting off.", body: "A profile picture, a company page, a frame on the wall." },
      { headline: "One photo.", body: PRICE },
      cta("STUDIO"),
    ],
    caption:
      "Everybody has one photo of themselves they actually like. It is almost always taken somewhere with terrible light.\n\n" +
      "That is a fixable problem, and it is cheaper than booking a session for a photo you already have.\n\n" +
      "₦1,000 for one photo.\n\n💬 Comment STUDIO and I'll send you the link.\n\n#aluxart #portrait",
  },
  {
    id: "p26", week: 7, slot: "B", product: "relight", trigger: "LIGHT",
    title: "Relight — the old photo",
    photos: "A genuinely old photo, and the relit version",
    cards: [
      { headline: "This photo is five years old.", body: "The light is new." },
      { headline: "Old photos are the best candidates.", body: "Nobody is going back to reshoot them, and the moment cannot be repeated." },
      { headline: "The memory stays exactly as it was.", body: "Same people, same day. Only the light changes." },
      { headline: "Bring one back.", body: PRICE },
      cta("LIGHT"),
    ],
    caption:
      "This photo is five years old. The light on it is from this week.\n\n" +
      "Old photos are the ones most worth doing — nobody is reshooting them, and the day cannot happen again. Everything stays exactly as it was. Only the light changes.\n\n" +
      "₦1,000 for one photo.\n\n💬 Comment LIGHT and I'll send you the link.\n\n#throwback #aluxart",
  },
  {
    id: "p27", week: 7, slot: "C", product: "shoot", trigger: "SHOOT",
    title: "Full shoot — ten images",
    photos: "One source photo and a grid of ten varied results",
    cards: [
      { headline: "One photo. Ten images.", body: "Ten different setups, one face." },
      { headline: "What a studio day costs you.", body: "A deposit, a day off, travel across the city, and hoping the light is right." },
      { headline: "What this costs you.", body: "One photo and a few minutes in a chat." },
      cta("SHOOT"),
    ],
    caption:
      "A studio day costs a deposit, a day off work, and travel across the city — before anybody has taken a picture.\n\n" +
      "Send one photo instead and get back a full set: ten images, different poses, framing and lighting, the same face throughout.\n\n" +
      "💬 Comment SHOOT and I'll send you the link.\n\n#lagosbusiness #headshots #aluxart",
  },
  {
    id: "p28", week: 7, slot: "D", product: "relight", trigger: "LIGHT",
    title: "Best pair of the week",
    photos: "The strongest before/after you have this week",
    cards: [
      { headline: "Your phone did its best.", body: "It just had nothing to work with." },
      cta("LIGHT"),
    ],
    caption: "Your phone did its best. It just had nothing to work with.\n\n💬 Comment LIGHT and I'll send you the link.\n\n#aluxart",
  },
  {
    id: "p29", week: 8, slot: "A", product: "studio", trigger: "STUDIO",
    title: "Phone to studio — the christening",
    photos: "A christening or naming ceremony photo at home, and the studio version",
    cards: [
      { headline: "The outfit cost more than the photo deserved.", body: "Let us even that up." },
      { headline: "These are the photos families keep.", body: "Naming ceremonies, christenings, first birthdays. They outlive everything else on your phone." },
      { headline: "One photo, printed properly, lasts.", body: "A sitting-room wall behind it does not do that." },
      cta("STUDIO"),
    ],
    caption:
      "The outfit was planned for weeks. The photo was taken in thirty seconds against whatever wall was free.\n\n" +
      "These are the pictures families keep longest. Worth the small amount it takes to make them look like it.\n\n" +
      "₦1,000 for one photo.\n\n💬 Comment STUDIO and I'll send you the link.\n\n#naming #christening #aluxart",
  },
  {
    id: "p30", week: 8, slot: "B", product: "relight", trigger: "LIGHT",
    title: "Relight — restaurant dinner",
    photos: "A dim restaurant photo, and the relit version",
    cards: [
      { headline: "Dinner looked better than this.", body: "Same table, properly lit." },
      { headline: "Restaurants light the table, not your face.", body: "The light sits above you, so eyes go into shadow and the room behind you disappears." },
      { headline: "Candlelight is worse than it looks.", body: "Beautiful to sit in. Almost nothing for a phone sensor to use." },
      { headline: "Keep the evening.", body: PRICE },
      cta("LIGHT"),
    ],
    caption:
      "Restaurants light the table, not your face. The light sits directly above you, so your eyes fall into shadow and everything behind you goes black.\n\n" +
      "Candlelight makes it worse — lovely to sit in, almost nothing for a phone to work with.\n\n" +
      "₦1,000 for one photo.\n\n💬 Comment LIGHT and I'll send you the link.\n\n#dateNight #lagosrestaurants #aluxart",
  },
  {
    id: "p31", week: 8, slot: "C", product: "assets", trigger: "ASSETS",
    title: "Asset extractor — wigs and beauty",
    photos: "A wig on a mannequin or stand, and the extracted version",
    cards: [
      { headline: "On a mannequin. Sold on a person.", body: "Same wig, lifted clean." },
      { headline: "Beauty sells on detail.", body: "Texture, length, parting, colour. A cluttered background hides all four." },
      { headline: "Wigs, nails, lashes, jewellery.", body: "Anything small enough to be lost against a busy room." },
      cta("ASSETS"),
    ],
    caption:
      "Beauty products sell on detail — texture, length, parting, colour — and a busy background hides every one of them.\n\n" +
      "Send one photo of the piece and it comes back clean, from four angles.\n\n" +
      "💬 Comment ASSETS and I'll send you the link.\n\n#wigsnigeria #beautybusiness #aluxart",
  },
  {
    id: "p32", week: 8, slot: "D", product: "relight", trigger: "LIGHT",
    title: "Best pair of the week",
    photos: "The strongest before/after you have this week",
    cards: [
      { headline: "One photo. One thousand naira.", body: "That is the entire offer." },
      cta("LIGHT"),
    ],
    caption: "One photo. One thousand naira. That is the entire offer.\n\n💬 Comment LIGHT and I'll send you the link.\n\n#aluxart",
  },

  // ───────────────────────── MONTH 3 — own December ──────────────────────────
  {
    id: "p33", week: 9, slot: "A", product: "studio", trigger: "STUDIO",
    title: "December — the Christmas outfit",
    photos: "A child or family in Christmas clothes at home, and the studio version",
    cards: [
      { headline: "The outfit everyone planned for.", body: "The background nobody did." },
      { headline: "December is when the photos happen.", body: "New clothes, family together, everybody home. All taken in a sitting room." },
      { headline: "This is the one that gets printed.", body: "Worth more than the wall behind it." },
      { headline: "Send it the same day.", body: PRICE },
      cta("STUDIO"),
    ],
    caption:
      "Everyone plans the outfit. Nobody plans the background.\n\n" +
      "December is when the most photographs of the year get taken, and almost all of them happen in a sitting room with one overhead bulb.\n\n" +
      "₦1,000 for one photo.\n\n💬 Comment STUDIO and I'll send you the link.\n\n#christmas #detty december #aluxart",
  },
  {
    id: "p34", week: 9, slot: "B", product: "relight", trigger: "LIGHT",
    title: "December — every photo will be too dark",
    photos: "A December club or street photo, and the relit version",
    cards: [
      { headline: "Every December photo will be too dark.", body: "Here is why, and what to do about it." },
      { headline: "December happens at night.", body: "Clubs, streets, halls, car parks. All of them are harder than daylight." },
      { headline: "Take them anyway.", body: "A dark photo of something that happened beats a good photo of nothing." },
      { headline: "Fix them in January, or tonight.", body: PRICE },
      cta("LIGHT"),
    ],
    caption:
      "Every photo you take this month will be too dark, and that is not a reason to stop taking them.\n\n" +
      "December happens at night — clubs, streets, halls, car parks. Take the photo anyway. A dark photo of something that happened beats a perfect photo of nothing.\n\n" +
      "Then send it to me.\n\n₦1,000 for one photo.\n\n" +
      "💬 Comment LIGHT and I'll send you the link.\n\n#dettydecember #lagosnightlife #aluxart",
  },
  {
    id: "p35", week: 9, slot: "C", product: "gif", trigger: "GIF",
    title: "December — a sticker for your business",
    photos: "A December-themed before/after that becomes the GIF",
    cards: [
      { headline: "December is loud. Be the thing people reuse.", body: "A sticker gets used by other people, for free." },
      { headline: "Your words, in their stories.", body: "Up to six scenes, your pictures, your business at the end." },
      cta("GIF"),
    ],
    caption:
      "Everybody is shouting in December. The ones that get remembered are the ones other people pass around.\n\n" +
      "Make a sticker with your own pictures and words, and let other people's stories carry it.\n\n" +
      "💬 Comment GIF and I'll send you the link.\n\n#dettydecember #smallbusinessnigeria #aluxart",
  },
  {
    id: "p36", week: 9, slot: "D", product: "relight", trigger: "LIGHT",
    title: "Best pair of the week",
    photos: "The strongest before/after you have this week",
    cards: [
      { headline: "Taken last night.", body: "Fixed this morning." },
      cta("LIGHT"),
    ],
    caption: "Taken last night. Fixed this morning.\n\n💬 Comment LIGHT and I'll send you the link.\n\n#dettydecember #aluxart",
  },
  {
    id: "p37", week: 10, slot: "A", product: "studio", trigger: "STUDIO",
    title: "December — the family portrait",
    photos: "A family group photographed at home, and the studio version",
    cards: [
      { headline: "Everyone is home for once.", body: "Take the photo. We will handle the room." },
      { headline: "Getting everybody together is the hard part.", body: "Nobody is doing it twice because the background was wrong." },
      { headline: "One group photo, properly finished.", body: PRICE },
      cta("STUDIO"),
    ],
    caption:
      "December is the one month everybody is in the same place. Getting all of them to stand still at the same time is the hard part — and nobody is repeating it because of a wall.\n\n" +
      "Take the photo. Send it to me.\n\n₦1,000 for one photo.\n\n" +
      "💬 Comment STUDIO and I'll send you the link.\n\n#familyportrait #christmas #aluxart",
  },
  {
    id: "p38", week: 10, slot: "B", product: "relight", trigger: "LIGHT",
    title: "December — concert and show photos",
    photos: "A concert or show photo, and the relit version",
    cards: [
      { headline: "The stage was lit. You were not.", body: "Same photo, with you in it." },
      { headline: "Stage light points away from the crowd.", body: "Everything on stage is bright and everything in front of it is a silhouette." },
      { headline: "You were there. The photo should say so.", body: PRICE },
      cta("LIGHT"),
    ],
    caption:
      "Stage lighting is built for the stage. It points away from you, so the performance is bright and the crowd is a silhouette.\n\n" +
      "You were there. The photo should say so.\n\n₦1,000 for one photo.\n\n" +
      "💬 Comment LIGHT and I'll send you the link.\n\n#detty december #concert #aluxart",
  },
  {
    id: "p39", week: 10, slot: "C", product: "assets", trigger: "ASSETS",
    title: "December — sell through the season",
    photos: "December stock on a rail, and the extracted product angles",
    cards: [
      { headline: "Your December stock, photographed properly.", body: "One photo per piece." },
      { headline: "This is your busiest month.", body: "It is also the month you have least time to photograph anything." },
      { headline: "One photo in, four angles out.", body: "Per piece, same day." },
      cta("ASSETS"),
    ],
    caption:
      "December is the month you sell most and have least time to photograph anything.\n\n" +
      "Send one photo of each piece and get back clean product shots from four angles — same day.\n\n" +
      "💬 Comment ASSETS and I'll send you the link.\n\n#dettydecember #nigerianvendor #aluxart",
  },
  {
    id: "p40", week: 10, slot: "D", product: "relight", trigger: "LIGHT",
    title: "Best pair of the week",
    photos: "The strongest before/after you have this week",
    cards: [
      { headline: "Same dress. Same night.", body: "Better light." },
      cta("LIGHT"),
    ],
    caption: "Same dress. Same night. Better light.\n\n💬 Comment LIGHT and I'll send you the link.\n\n#aluxart",
  },
  {
    id: "p41", week: 11, slot: "A", product: "studio", trigger: "STUDIO",
    title: "December — the photo you will want in twenty years",
    photos: "An older relative photographed at home, and the studio portrait",
    cards: [
      { headline: "The photo you will want in twenty years.", body: "Take it now, properly." },
      { headline: "Nobody photographs the people they see every day.", body: "Then one day it is the only picture you have." },
      { headline: "It costs one photo and a thousand naira.", body: "That is a small price for something irreplaceable." },
      cta("STUDIO"),
    ],
    caption:
      "Nobody takes proper photographs of the people they see every day. Then one day a snapshot is the only picture you have of them.\n\n" +
      "While everyone is home this month, take one. We will make it worth keeping.\n\n" +
      "₦1,000 for one photo.\n\n💬 Comment STUDIO and I'll send you the link.\n\n#family #aluxart",
  },
  {
    id: "p42", week: 11, slot: "B", product: "relight", trigger: "LIGHT",
    title: "December — send tonight, have it by morning",
    photos: "A night photo and its relit version, emphasising turnaround",
    cards: [
      { headline: "Send it tonight. Have it by morning.", body: "Usually much sooner." },
      { headline: "It all happens in the chat.", body: "Send the photo, get a price, pay, and it comes back to the same conversation." },
      { headline: "No app. No account. No waiting.", body: PRICE },
      cta("LIGHT"),
    ],
    caption:
      "Send the photo tonight and it comes back before breakfast — usually much sooner.\n\n" +
      "No app to download, no account to make. Send it in the chat, pay in the chat, get it back in the chat.\n\n" +
      "₦1,000 for one photo.\n\n💬 Comment LIGHT and I'll send you the link.\n\n#dettydecember #aluxart",
  },
  {
    id: "p43", week: 11, slot: "C", product: "shoot", trigger: "SHOOT",
    title: "December — a set for the new year",
    photos: "One photo and the ten-image set it produced",
    cards: [
      { headline: "One photo now. A full set for January.", body: "New profile, new company page, new everything." },
      { headline: "Ten images, ten setups.", body: "The same face throughout." },
      cta("SHOOT"),
    ],
    caption:
      "Everybody updates their profile in January. Most people use a photo from a party.\n\n" +
      "Send one photo now and have a full set ready — ten images, different poses and lighting, same face.\n\n" +
      "💬 Comment SHOOT and I'll send you the link.\n\n#newyear #headshots #aluxart",
  },
  {
    id: "p44", week: 11, slot: "D", product: "relight", trigger: "LIGHT",
    title: "The year in before and afters",
    photos: "A grid of the year's strongest before/after pairs",
    cards: [
      { headline: "A year of photos nobody was going to keep.", body: "All of them, kept." },
      { headline: "Yours can be next.", body: PRICE },
      cta("LIGHT"),
    ],
    caption:
      "A year of photographs that were nearly deleted.\n\n" +
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
