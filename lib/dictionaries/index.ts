import type { Locale } from "@/lib/i18n";
import type { AppDictionary } from "./en";

// Dynamic imports keep each language in its own bundle chunk — visitors only
// download the language they're using.
const loaders: Record<Locale, () => Promise<{ default: AppDictionary }>> = {
  en: () => import("./en"),
  pcm: () => import("./pcm"),
  fr: () => import("./fr"),
  es: () => import("./es"),
  pt: () => import("./pt"),
  ar: () => import("./ar"),
  zh: () => import("./zh"),
};

export async function getDictionary(locale: Locale): Promise<AppDictionary> {
  const mod = await (loaders[locale] ?? loaders.en)();
  return mod.default;
}

export type { AppDictionary };
