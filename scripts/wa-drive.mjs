// Drive the live WhatsApp webhook with real, correctly-signed inbound messages.
// This is the only honest test: it goes through signature checking, the session
// loader, the command dispatch and the real send path, exactly as Meta's does.
import crypto from "node:crypto";
import fs from "node:fs";

for (const l of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(l);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

const SECRET = process.env.WHATSAPP_APP_SECRET || process.env.IG_APP_SECRET;
const PHONE_NUMBER_ID = process.argv[2];
const FROM = process.argv[3];
const MESSAGES = process.argv.slice(4);

if (!SECRET) { console.error("no app secret in env"); process.exit(1); }

async function send(text) {
  const body = JSON.stringify({
    object: "whatsapp_business_account",
    entry: [{
      id: "test",
      changes: [{
        field: "messages",
        value: {
          messaging_product: "whatsapp",
          metadata: { phone_number_id: PHONE_NUMBER_ID },
          messages: [{
            id: "wamid.drive." + crypto.randomBytes(8).toString("hex"),
            from: FROM,
            timestamp: String(Math.floor(Date.now() / 1000)),
            type: "text",
            text: { body: text },
          }],
        },
      }],
    }],
  });

  const sig = "sha256=" + crypto.createHmac("sha256", SECRET).update(body).digest("hex");
  const res = await fetch("http://127.0.0.1:3000/api/webhooks/whatsapp", {
    method: "POST",
    headers: { "content-type": "application/json", "x-hub-signature-256": sig },
    body,
  });
  console.log(String(text).padEnd(28), "->", res.status, (await res.text()).slice(0, 60));
}

for (const m of MESSAGES) {
  await send(m);
  await new Promise((r) => setTimeout(r, 2500));   // let the handler finish sending
}
