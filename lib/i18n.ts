// Locale system: cookie-based (no URL prefixes) so server components and
// middleware share one source of truth with the client provider.
export const LOCALES = ["en", "pcm", "fr", "es", "pt", "ar", "zh"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "alux-locale";

// Native names shown in the language selector.
export const LOCALE_NAMES: Record<Locale, string> = {
  en: "English",
  pcm: "Naijá (Pidgin)",
  fr: "Français",
  es: "Español",
  pt: "Português",
  ar: "العربية",
  zh: "中文",
};

export function isLocale(v: unknown): v is Locale {
  return typeof v === "string" && (LOCALES as readonly string[]).includes(v);
}

export function dirFor(locale: Locale): "ltr" | "rtl" {
  return locale === "ar" ? "rtl" : "ltr";
}

// Map an Accept-Language header to the best supported locale.
export function resolveLocale(cookieVal: string | undefined, acceptLanguage: string | null): Locale {
  if (isLocale(cookieVal)) return cookieVal;
  if (acceptLanguage) {
    for (const part of acceptLanguage.split(",")) {
      const code = part.split(";")[0].trim().toLowerCase();
      const base = code.split("-")[0];
      if (isLocale(code)) return code;
      if (isLocale(base)) return base;
      if (base === "pcm" || code === "en-ng") continue; // en-NG stays English; pcm handled above
    }
  }
  return DEFAULT_LOCALE;
}

// Dictionary shape: surface → key → string. Values may contain {placeholders}.
export type Dictionary = Record<string, string>;

export function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}
