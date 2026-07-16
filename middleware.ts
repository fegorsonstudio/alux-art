import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { LOCALE_COOKIE, resolveLocale, isLocale } from "@/lib/i18n";

export async function middleware(request: NextRequest) {
  const isApiPath = request.nextUrl.pathname.startsWith("/api");
  const isPublicAsset = request.nextUrl.pathname.startsWith("/_next") ||
    request.nextUrl.pathname.startsWith("/favicon") ||
    /\.(?:avif|gif|ico|jpg|jpeg|png|svg|webp|css|js|map|txt|xml|json|webmanifest|html)$/i.test(request.nextUrl.pathname);

  if (isApiPath || isPublicAsset) {
    return NextResponse.next();
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

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

  const { data: { user } } = await supabase.auth.getUser();

  // Stray OAuth code rescue: when Supabase can't honor our redirect URL (e.g. a
  // misconfigured allowlist), it falls back to the Site URL root — the code lands
  // on "/" and sign-in silently dies ("sign in twice" bug). Forward any auth code
  // on a non-callback page to the real callback so the first click completes.
  const strayCode = request.nextUrl.searchParams.get("code");
  if (!user && strayCode && /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(strayCode)) {
    const url = request.nextUrl.clone();
    url.pathname = "/api/auth/callback";
    url.search = "";
    url.searchParams.set("code", strayCode);
    const dest = request.nextUrl.pathname === "/" || request.nextUrl.pathname === "/login"
      ? "/studio"
      : request.nextUrl.pathname;
    url.searchParams.set("next", dest);
    return NextResponse.redirect(url);
  }

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
    supabaseResponse.cookies.set(LOCALE_COOKIE, locale, {
      path: "/", maxAge: 31536000, sameSite: "lax",
    });
  }

  return supabaseResponse;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
