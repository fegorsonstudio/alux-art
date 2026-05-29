declare global {
  interface Window {
    gtag: (...args: unknown[]) => void;
    dataLayer: unknown[];
  }
}

export function trackEvent(eventName: string, params?: Record<string, unknown>) {
  if (typeof window !== "undefined" && typeof window.gtag === "function") {
    window.gtag("event", eventName, params);
  }
}

// Pre-named events for consistency across the app
export const Analytics = {
  templateViewed:    (id: string, title: string) =>
    trackEvent("template_viewed",    { template_id: id, template_name: title }),

  bookingStarted:    (id: string, title: string, priceNgn: number) =>
    trackEvent("booking_started",    { template_id: id, template_name: title, value: priceNgn, currency: "NGN" }),

  paymentInitiated:  (id: string, title: string, priceNgn: number) =>
    trackEvent("payment_initiated",  { template_id: id, template_name: title, value: priceNgn, currency: "NGN" }),

  paymentCompleted:  (shootId: string, priceNgn: number) =>
    trackEvent("purchase",           { shoot_id: shootId, value: priceNgn, currency: "NGN" }),

  creatorDashboard:  () =>
    trackEvent("creator_dashboard_viewed"),

  marketplaceSearch: (query: string) =>
    trackEvent("search",             { search_term: query }),

  apiError: (route: string, status: number) =>
    trackEvent("api_error",          { route, status }),
};
