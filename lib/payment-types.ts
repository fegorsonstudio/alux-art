/**
 * payment-types.ts — Shared types for the dual-gateway payment abstraction layer.
 *
 * SERVER-SIDE ONLY. Never import into client components or browser-side code.
 *
 * Amounts in InitPaymentParams are ALWAYS in whole units of the stated currency:
 *   NGN → whole naira   (e.g. 15000 for ₦15,000)
 *   USD → whole dollars (e.g. 10 for $10.00)
 *
 * Each gateway implementation is responsible for converting to its own unit
 * internally (Paystack multiplies by 100 → kobo/cents; Flutterwave uses as-is).
 * No calling code should ever apply a ×100 multiplier.
 */

export type PaymentProvider = "paystack" | "flutterwave";

export interface InitPaymentParams {
  email: string;
  /**
   * Amount **already converted to the stated `currency`**.
   *   NGN → whole naira  (e.g. 15000 for ₦15,000)
   *   USD → whole dollars (e.g. 9.38 for $9.38)
   *
   * Callers are responsible for any NGN→USD conversion before calling
   * initializePayment(). Gateways never perform FX conversion internally.
   * Gateways do apply the unit-multiplier they require:
   *   Paystack  → ×100 (kobo / cents)
   *   Flutterwave → as-is (naira / dollars)
   */
  amountNgn: number;
  currency: "NGN" | "USD";
  /** Passed verbatim to the gateway as transaction metadata. */
  metadata: Record<string, unknown>;
  /** URL the gateway redirects the user to after payment. */
  callbackUrl: string;
  /** Optional creator revenue split. Present only for marketplace/gift flows. */
  creatorSubaccount?: {
    /** Paystack subaccount code, e.g. "ACCT_xxxx". */
    paystackCode?: string;
    /** Flutterwave subaccount ID, e.g. "RS_xxxx". */
    flutterwaveId?: string;
    /**
     * Creator payout already in the stated `currency` units.
     * Same conversion rule applies — Paystack ×100, Flutterwave as-is.
     */
    payoutNgn: number;
  };
}

export interface InitPaymentResult {
  provider: PaymentProvider;
  /** Gateway-generated or caller-generated transaction reference. */
  reference: string;
  /** URL to redirect the user to complete payment. */
  authorizationUrl: string;
}

export interface VerifyPaymentResult {
  success: boolean;
  provider: PaymentProvider;
  reference: string;
  /**
   * Amount in whole naira for NGN transactions.
   * For USD transactions this holds the raw charged amount in USD — check
   * the `currency` field to disambiguate before using for NGN comparisons.
   */
  amountNgn: number;
  currency: string;
  customerEmail: string;
  paidAt: string;
  rawData: Record<string, unknown>;
}
