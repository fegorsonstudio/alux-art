import "server-only";

/**
 * Every command the chat bot understands, in one place.
 *
 * The manual is BUILT from this list rather than written beside it. A printed
 * manual that lists a command nobody implemented is worse than no manual: it
 * teaches a customer to type something that gets ignored, and being ignored is
 * the single complaint this bot has actually generated.
 *
 * `pattern` is what the webhook matches on, so the row and the handler cannot
 * describe different things. Anything without a pattern (a photo, a look number)
 * is documented in the footer instead.
 */

export type BotCommand = {
  /** What the customer types. Shown in the manual. */
  name: string;
  /** Extra words that do the same thing. Not all are shown, to keep it short. */
  aliases?: string[];
  /** One line, in a customer's words, not ours. */
  does: string;
  /** The matcher the webhook uses. Kept here so the two cannot drift. */
  pattern: RegExp;
};

export const COMMANDS: BotCommand[] = [
  {
    name: "menu",
    aliases: ["restart", "reset", "start over", "cancel", "styles"],
    does: "Start again from the list of styles",
    pattern: /^(restart|start over|cancel|reset|menu|styles)$/i,
  },
  {
    name: "commands",
    aliases: ["manual", "?"],
    does: "Show this list",
    pattern: /^(commands|manual|command list|\?|what can you do\??)$/i,
  },
  {
    name: "status",
    aliases: ["my shoot", "where is my order"],
    does: "Where your current shoot has got to",
    pattern: /^(status|my shoot|my order|where('| i)s my (shoot|order|photos?))$/i,
  },
  {
    name: "balance",
    aliases: ["wallet"],
    does: "What is in your wallet",
    pattern: /^(balance|wallet|my (balance|wallet))$/i,
  },
  {
    name: "fund 5000",
    aliases: ["top up 5000"],
    does: "Add money to your wallet, so the next shoot needs no card",
    pattern: /^(fund|top ?up|add)\s*(?:ngn|n|₦)?\s*([\d,]+)$/i,
  },
  {
    name: "email you@example.com",
    does: "Join this chat to your website account, so both share one wallet",
    pattern: /^e-?mail\s+(\S+@\S+\.\S+)$/i,
  },
  {
    name: "language",
    does: "Change language — English, Pidgin, Français, Español, Português, العربية, 中文",
    pattern: /^(language|langue|idioma|lingua|لغة|语言|pidgin|naija)$/i,
  },
  {
    name: "retouch",
    does: "Ask a human to hand-edit a photo we made for you",
    pattern: /^(retouch|retouching|edit|edit my (photos|images))$/i,
  },
  {
    name: "support",
    aliases: ["help", "human"],
    does: "Reach a real person at the studio",
    pattern: /\b(support|help|human|agent|issue|problem|no response)\b/i,
  },
  {
    name: "stop",
    aliases: ["unsubscribe"],
    does: "Stop every message from this number. Send *start* to undo it",
    pattern: /^(stop|unsubscribe|opt ?out|stop messages)$/i,
  },
];

/** Find the command a message matches, or null. Order is the order above. */
export function matchCommand(text: string): BotCommand | null {
  const s = text.trim();
  if (!s) return null;
  return COMMANDS.find((c) => c.pattern.test(s)) ?? null;
}

/**
 * The manual, as one message.
 *
 * Deliberately not translated. The commands themselves are English words that
 * have to be typed exactly, and a Pidgin manual listing `balance` as
 * "how much I get" would teach a word the matcher does not accept. The
 * *descriptions* are the part worth translating, and that is a later job worth
 * doing properly rather than half.
 */
export function manualText(opts: { noCashOut: string }): string {
  const rows = COMMANDS.map((c) => {
    const alias = c.aliases?.length ? ` (or *${c.aliases[0]}*)` : "";
    return `*${c.name}*${alias}\n   ${c.does}`;
  }).join("\n\n");

  return (
    "*What you can type* \u{1f4d6}\n\n" +
    rows +
    "\n\n" +
    "You can also just *send a photo* to begin, or send a *look number* " +
    "(like 197) to switch the lighting on the shoot you are setting up.\n\n" +
    `\u{1f4b3} ${opts.noCashOut}`
  );
}
