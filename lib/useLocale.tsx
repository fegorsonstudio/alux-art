"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_LOCALE, LOCALE_COOKIE, interpolate, isLocale, dirFor, type Locale } from "@/lib/i18n";
import { getDictionary, type AppDictionary } from "@/lib/dictionaries";
import enDict from "@/lib/dictionaries/en";

type LocaleContextValue = {
  locale: Locale;
  dict: AppDictionary;
  setLocale: (l: Locale) => void;
};

const LocaleContext = createContext<LocaleContextValue>({
  locale: DEFAULT_LOCALE,
  dict: enDict,
  setLocale: () => {},
});

export function LocaleProvider({
  initialLocale,
  initialDict,
  children,
}: {
  initialLocale: Locale;
  initialDict: AppDictionary;
  children: React.ReactNode;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  const [dict, setDict] = useState<AppDictionary>(initialDict);
  const router = useRouter();

  const setLocale = useCallback((l: Locale) => {
    if (!isLocale(l)) return;
    // 1-year cookie so middleware and server components see the choice too.
    document.cookie = `${LOCALE_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`;
    setLocaleState(l);
    getDictionary(l).then((d) => {
      setDict(d);
      document.documentElement.lang = l;
      document.documentElement.dir = dirFor(l);
    });
    // Some pages (e.g. the homepage) read the locale cookie server-side and
    // render translated text as part of the initial HTML — that's invisible
    // to this client-side context update. router.refresh() re-runs Server
    // Components for the current route with the new cookie, without a hard
    // reload — critical once installed as a PWA, where there's no address
    // bar left for the user to refresh manually.
    router.refresh();
  }, [router]);

  // Keep <html lang/dir> in sync on first client render as well.
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = dirFor(locale);
  }, [locale]);

  return (
    <LocaleContext.Provider value={{ locale, dict, setLocale }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  return useContext(LocaleContext);
}

// t for one surface: const t = useT("marketplace"); t("heroTitle")
export function useT<S extends keyof AppDictionary>(surface: S) {
  const { dict } = useContext(LocaleContext);
  return useCallback(
    (key: keyof AppDictionary[S], vars?: Record<string, string | number>): string => {
      const section = dict[surface] as Record<string, string>;
      const raw = section?.[key as string] ?? (enDict[surface] as Record<string, string>)[key as string] ?? String(key);
      return interpolate(raw, vars);
    },
    [dict, surface]
  );
}
