import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, hasSignedSession } from "@/lib/auth-edge";
import { LOCALE_COOKIE, resolveLocale, isLocale } from "@/lib/i18n";

export async function middleware(request: NextRequest) {
  const isApiPath = request.nextUrl.pathname.startsWith("/api");
  const isPublicAsset = request.nextUrl.pathname.startsWith("/_next") ||
    request.nextUrl.pathname.startsWith("/favicon") ||
    /\.(?:avif|gif|ico|jpg|jpeg|png|svg|webp|css|js|map|txt|xml|json|webmanifest|html)$/i.test(request.nextUrl.pathname);

  if (isApiPath || isPublicAsset) {
    return NextResponse.next();
  }

  // Fully static public pages (legal). These never depend on auth and never
  // redirect based on it, so skip the Supabase getUser() round-trip entirely —
  // it was adding 1.4–3.8s of latency and a Supabase-uptime dependency to pages
  // that must be instant and reliable. Google's OAuth verification crawler
  // flagged /privacy as "unresponsive" when that lookup made it intermittently
  // slow. We still seed the locale cookie so the page renders translated.
  const staticPublicPath = request.nextUrl.pathname;
  if (staticPublicPath === "/privacy" || staticPublicPath === "/terms" || staticPublicPath === "/support" || staticPublicPath === "/links" || staticPublicPath === "/install") {
    const res = NextResponse.next();
    if (!isLocale(request.cookies.get(LOCALE_COOKIE)?.value)) {
      const locale = resolveLocale(undefined, request.headers.get("accept-language"));
      res.cookies.set(LOCALE_COOKIE, locale, { path: "/", maxAge: 31536000, sameSite: "lax" });
    }
    return res;
  }

  const response = NextResponse.next({ request });

  const isAuthPath = request.nextUrl.pathname.startsWith("/login");

  const p = request.nextUrl.pathname;
  const isPublicPath =
    p === "/" ||
    p === "/terms" ||
    p === "/privacy" ||
    p === "/support" ||
    p === "/marketplace" ||
    (p.startsWith("/marketplace/") && !p.includes("/book")) ||
    p.includes("/book/success") ||
    p.startsWith("/creators/") ||
    p.startsWith("/gift/") ||  // gift unboxing + success pages are public links
    p === "/stories" ||
    p.startsWith("/stories/");

  // Signed in = our aa_session cookie carries our signature (lib/auth-edge.ts).
  // No database or outside service here; the server checks the session itself.
  // (The old "stray OAuth code rescue" was for Supabase's redirects and went with it.)
  const user = await hasSignedSession(request.cookies.get(SESSION_COOKIE)?.value);

  if (!user && !isAuthPath && !isPublicPath) {
    const url = request.nextUrl.clone();
    const next = request.nextUrl.pathname + request.nextUrl.search;
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", next);
    return NextResponse.redirect(url);
  }

  if (user && isAuthPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/studio";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // First visit with no language cookie: seed it from the browser's language so
  // server-rendered pages (layout <html lang/dir>, homepage) render translated.
  if (!isLocale(request.cookies.get(LOCALE_COOKIE)?.value)) {
    const locale = resolveLocale(undefined, request.headers.get("accept-language"));
    response.cookies.set(LOCALE_COOKIE, locale, {
      path: "/", maxAge: 31536000, sameSite: "lax",
    });
  }

  return response;
}

export const config = {
  // `d` is the full-size download link, and it must never see this middleware.
  //
  // A buyer who ordered through Instagram or WhatsApp has a synthetic account
  // with no password, so a redirect to /login is a dead end for the one person
  // the link exists for — they cannot sign in, and the file they paid for
  // becomes unreachable. The token in the path is the authorisation, and it
  // grants exactly one photograph.
  matcher: ["/((?!api|d/|_next/static|_next/image|favicon.ico).*)"],
};
