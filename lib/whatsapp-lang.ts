import "server-only";
import { LOCALES, LOCALE_NAMES, type Locale } from "@/lib/i18n";

/**
 * The bot's own phrasebook.
 *
 * Deliberately NOT lib/dictionaries: those hold website copy — buttons, form
 * labels, checkout — none of which a conversation says. The languages are the
 * same seven the site offers, taken from lib/i18n so the two can never drift
 * apart, but the sentences are written for chat.
 *
 * Only the lines a customer actually meets are translated. Operational replies
 * ("that photo didn't come through") stay English for now: a half-translated
 * conversation reads worse than an honest English one, and these are the strings
 * that decide whether somebody buys.
 *
 * Pidgin is first after English on purpose. It is the language most of this
 * customer base actually chats in, and a bot that speaks it stops sounding like
 * a foreign company.
 */

export type BotKey =
  | "greeting"
  | "askStyle"
  | "sendPhotos"
  | "hdTip"
  | "doneWhenFinished"
  | "whereePosting"
  | "story"
  | "feed"
  | "pickLook"
  | "confirm"
  | "yes"
  | "startOver"
  | "languageSet"
  | "languagePrompt";

type Phrasebook = Record<BotKey, string>;

const en: Phrasebook = {
  greeting: "Hi 👋 This is {brand}.",
  askStyle: "Which one would you like? Tap below, or reply with its number.",
  sendPhotos: "Send me the photos you want done.",
  hdTip: "📸 *Tap HD before you send* — the button at the top right of the photo picker. Or send them as files to keep them untouched.",
  doneWhenFinished: "Up to 10. Reply *done* when you have finished.",
  whereePosting: "Where are you posting these?",
  story: "Story",
  feed: "Feed",
  pickLook: "Now pick the lighting look. Reply with its number.",
  confirm: "Shall I go ahead?",
  yes: "Yes, book it",
  startOver: "Start over",
  languageSet: "Done — I'll speak English from now on.",
  languagePrompt: "Which language would you like? Reply with the number.",
};

const pcm: Phrasebook = {
  greeting: "How far 👋 Na {brand} be this.",
  askStyle: "Which one you want? Tap below, or send the number.",
  sendPhotos: "Send me the photos wey you want make I work on.",
  hdTip: "📸 *Press HD before you send* — the button for top right of the photo picker. Or send dem as files so dem no go lose quality.",
  doneWhenFinished: "Up to 10. Reply *done* when you don finish.",
  whereePosting: "Where you wan post dem?",
  story: "Story",
  feed: "Feed",
  pickLook: "Now pick the lighting look. Send the number.",
  confirm: "Make I go ahead?",
  yes: "Yes, book am",
  startOver: "Start again",
  languageSet: "Correct — na Pidgin I go dey talk from now.",
  languagePrompt: "Which language you want? Send the number.",
};

const fr: Phrasebook = {
  greeting: "Bonjour 👋 Ici {brand}.",
  askStyle: "Lequel voulez-vous ? Touchez ci-dessous, ou répondez avec son numéro.",
  sendPhotos: "Envoyez-moi les photos à traiter.",
  hdTip: "📸 *Activez HD avant d'envoyer* — le bouton en haut à droite. Ou envoyez-les en fichiers pour garder toute la qualité.",
  doneWhenFinished: "Jusqu'à 10. Répondez *done* quand vous avez fini.",
  whereePosting: "Où allez-vous les publier ?",
  story: "Story",
  feed: "Feed",
  pickLook: "Choisissez maintenant l'éclairage. Répondez avec son numéro.",
  confirm: "Je continue ?",
  yes: "Oui, réservez",
  startOver: "Recommencer",
  languageSet: "Parfait — je continue en français.",
  languagePrompt: "Quelle langue préférez-vous ? Répondez avec le numéro.",
};

const es: Phrasebook = {
  greeting: "Hola 👋 Somos {brand}.",
  askStyle: "¿Cuál quieres? Toca abajo, o responde con su número.",
  sendPhotos: "Envíame las fotos que quieres trabajar.",
  hdTip: "📸 *Activa HD antes de enviar* — el botón arriba a la derecha. O envíalas como archivos para conservar la calidad.",
  doneWhenFinished: "Hasta 10. Responde *done* cuando termines.",
  whereePosting: "¿Dónde vas a publicarlas?",
  story: "Story",
  feed: "Feed",
  pickLook: "Ahora elige la iluminación. Responde con su número.",
  confirm: "¿Sigo adelante?",
  yes: "Sí, resérvalo",
  startOver: "Empezar de nuevo",
  languageSet: "Listo — seguiré en español.",
  languagePrompt: "¿Qué idioma prefieres? Responde con el número.",
};

const pt: Phrasebook = {
  greeting: "Olá 👋 Aqui é a {brand}.",
  askStyle: "Qual você quer? Toque abaixo, ou responda com o número.",
  sendPhotos: "Envie-me as fotos que quer trabalhar.",
  hdTip: "📸 *Ative o HD antes de enviar* — o botão no canto superior direito. Ou envie como ficheiros para manter a qualidade.",
  doneWhenFinished: "Até 10. Responda *done* quando terminar.",
  whereePosting: "Onde vai publicar?",
  story: "Story",
  feed: "Feed",
  pickLook: "Agora escolha a iluminação. Responda com o número.",
  confirm: "Posso continuar?",
  yes: "Sim, reservar",
  startOver: "Começar de novo",
  languageSet: "Pronto — continuo em português.",
  languagePrompt: "Que idioma prefere? Responda com o número.",
};

const ar: Phrasebook = {
  greeting: "مرحبا 👋 معك {brand}.",
  askStyle: "أي واحد تريد؟ اضغط أدناه، أو أرسل رقمه.",
  sendPhotos: "أرسل لي الصور التي تريد العمل عليها.",
  hdTip: "📸 *فعّل HD قبل الإرسال* — الزر في أعلى اليمين. أو أرسلها كملفات للحفاظ على الجودة.",
  doneWhenFinished: "حتى 10 صور. أرسل *done* عند الانتهاء.",
  whereePosting: "أين ستنشرها؟",
  story: "ستوري",
  feed: "المنشورات",
  pickLook: "اختر الآن الإضاءة. أرسل رقمها.",
  confirm: "هل أتابع؟",
  yes: "نعم، احجز",
  startOver: "ابدأ من جديد",
  languageSet: "تم — سأتحدث بالعربية من الآن.",
  languagePrompt: "ما اللغة التي تفضلها؟ أرسل الرقم.",
};

const zh: Phrasebook = {
  greeting: "你好 👋 这里是 {brand}。",
  askStyle: "您想要哪一个？点击下方，或回复编号。",
  sendPhotos: "请把要处理的照片发给我。",
  hdTip: "📸 *发送前请开启 HD* — 相册右上角的按钮。或以文件方式发送以保留画质。",
  doneWhenFinished: "最多 10 张。完成后回复 *done*。",
  whereePosting: "您打算发布在哪里？",
  story: "快拍",
  feed: "帖子",
  pickLook: "现在选择灯光效果，回复编号。",
  confirm: "可以继续吗？",
  yes: "好，帮我预订",
  startOver: "重新开始",
  languageSet: "好的 — 我会用中文继续。",
  languagePrompt: "您想用哪种语言？请回复编号。",
};

const BOOKS: Record<Locale, Phrasebook> = { en, pcm, fr, es, pt, ar, zh };

/** One line, in the buyer's language, with {brand} filled in. */
export function t(locale: string | null | undefined, key: BotKey, brand = "Alux Art"): string {
  const book = BOOKS[(locale ?? "en") as Locale] ?? en;
  return (book[key] ?? en[key]).replace("{brand}", brand);
}

/** The picker the buyer sees when they ask to change language. */
export function languageMenu(): string {
  return LOCALES.map((l, i) => `${i + 1}. ${LOCALE_NAMES[l]}`).join("\n");
}

/**
 * Read a language out of what they typed: a menu number, a code, or the name
 * itself. "2", "pcm", "pidgin" and "Naijá" all reach the same place.
 */
export function parseLanguage(answer: string): Locale | null {
  const a = (answer || "").trim().toLowerCase();
  if (!a) return null;

  const n = parseInt(a, 10);
  if (Number.isFinite(n) && n >= 1 && n <= LOCALES.length) return LOCALES[n - 1];

  for (const l of LOCALES) {
    if (a === l) return l;
    if (LOCALE_NAMES[l].toLowerCase().includes(a) && a.length >= 3) return l;
  }
  if (/pidgin|naija|naijá|broken/.test(a)) return "pcm";
  if (/english/.test(a)) return "en";
  if (/fran|french/.test(a)) return "fr";
  if (/espa|spanish/.test(a)) return "es";
  if (/portug/.test(a)) return "pt";
  if (/arab|عرب/.test(a)) return "ar";
  if (/chin|中文|mandarin/.test(a)) return "zh";
  return null;
}
