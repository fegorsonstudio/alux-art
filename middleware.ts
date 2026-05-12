import { NextResponse, type NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const isApiPath = request.nextUrl.pathname.startsWith("/api");
  const isPublicAsset = request.nextUrl.pathname.startsWith("/_next") ||
    request.nextUrl.pathname.startsWith("/favicon") ||
    /\.(?:avif|gif|ico|jpg|jpeg|png|svg|webp|css|js|map|txt|xml|json|webmanifest)$/i.test(request.nextUrl.pathname);

  if (isApiPath || isPublicAsset) {
    return NextResponse.next();
  }

  return NextResponse.next({ request });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
