import { NextResponse } from "next/server";

let cache: { usdToNgn: number; ts: number } | null = null;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour
const FALLBACK_RATE = 1600; // reasonable fallback if API is down

export async function GET() {
  if (cache && Date.now() - cache.ts < CACHE_TTL) {
    return NextResponse.json({ usdToNgn: cache.usdToNgn, cached: true });
  }

  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD", {
      next: { revalidate: 3600 },
    });
    if (!res.ok) throw new Error("fetch failed");
    const data = await res.json();
    const rate = data?.rates?.NGN as number | undefined;
    if (!rate || rate < 100) throw new Error("bad rate");

    cache = { usdToNgn: rate, ts: Date.now() };
    return NextResponse.json({ usdToNgn: rate, cached: false });
  } catch {
    // Return cached value or fallback — never fail callers
    const usdToNgn = cache?.usdToNgn ?? FALLBACK_RATE;
    return NextResponse.json({ usdToNgn, cached: true, fallback: !cache });
  }
}
