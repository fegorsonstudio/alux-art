/**
 * What retouching costs, in one place.
 *
 * A route file cannot export this — Next.js only allows its own handler exports
 * and rejects the build otherwise — and the studio page must not multiply it out
 * client-side, or the price a buyer is shown and the price they are charged can
 * drift apart. The server computes every figure the buyer sees from here.
 */
export const RETOUCH_PRICE_PER_IMAGE_NGN = 1000;

export function retouchPriceNgn(imageCount: number): number {
  return Math.max(0, Math.round(imageCount)) * RETOUCH_PRICE_PER_IMAGE_NGN;
}
