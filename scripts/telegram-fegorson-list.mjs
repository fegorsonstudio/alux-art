// Sends the owner's Telegram the Instagram people still owed the Fegorson
// Studio link (the API cannot reply after 24 h) and the copy-ready message.
//   node --env-file=.env.local scripts/telegram-fegorson-list.mjs
const tok = process.env.TELEGRAM_BOT_TOKEN;
const chat = process.env.TELEGRAM_ADMIN_CHAT_ID || process.env.TELEGRAM_CHAT_ID || "5806763965";
const users = ["daron.s_lens", "smartmediaflix", "akolisaa_", "__razors", "adurajoshua", "flyonking", "duru_azubuike", "moshood_isreal", "phlens_studio", "ife.oluwabright", "oluyaimagery", "iam_octo"];
const text = `Hi! Here is the link you asked for 🙂

It is not Evoto itself. It is Fegorson Studio, my own retouching app for Windows: skin, eyes, teeth, body shaping, dodge and burn, frequency separation, studio backdrops and your own colour style, all on your laptop, no subscription.

Free for 7 days, then a one-time ₦20,000 licence. When Windows shows "Windows protected your PC", click More info, then Run anyway.

https://aluxartandframes.shop/d/fegorson

Tell me what you think!`;

const head = "Fegorson link: 12 Instagram DMs to answer by hand\nInstagram will not let the bot reply after 24 h. Open each chat in the Instagram app and paste the text in the next message.\n\n" + users.map((u, i) => `${i + 1}. @${u}`).join("\n");
const send = (body) => fetch(`https://api.telegram.org/bot${tok}/sendMessage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: chat, disable_web_page_preview: true, ...body }) }).then((r) => r.json());
const a = await send({ text: head });
// The text alone as its own message, so one long-press copies exactly it.
const b = await send({ text });
console.log(a.ok && b.ok ? "telegram sent (2 messages)" : "telegram failed: " + JSON.stringify(a.ok ? b : a).slice(0, 200));
