/**
 * payment-gateway.ts — Unified dual-gateway factory
 *
 * SERVER-SIDE ONLY. All amounts flow through in whole naira/dollars.
 * Unit conversion (kobo for Paystack, native for Flutterwave) happens
 * inside each provider's implementation file — never here.
 *
 * Usage:
 *   const result = await initializePayment('paystack', params);
 *   const result = await initializePayment('flutterwave', params);
 *   const verified = await verifyPayment(payment.provider, payment.provider_reference);
 */

import {
  initializePaystackPayment,
  verifyPaystackPaymentNormalized,
} from "./paystack";
import {
  initializeFlutterwavePayment,
  verifyFlutterwavePayment,
} from "./flutterwave";
import type {
  InitPaymentParams,
  InitPaymentResult,
  VerifyPaymentResult,
  PaymentProvider,
} from "./payment-types";

export type { PaymentProvider, InitPaymentParams, InitPaymentResult, VerifyPaymentResult };

/**
 * Initialize a payment with the specified gateway.
 * Throws if the gateway returns an error — callers should catch and fall through
 * to the other provider for failover logic.
 */
export async function initializePayment(
  provider: PaymentProvider,
  params: InitPaymentParams
): Promise<InitPaymentResult> {
  switch (provider) {
    case "paystack":
      return initializePaystackPayment(params);
    case "flutterwave":
      return initializeFlutterwavePayment(params);
    default: {
      // TypeScript exhaustiveness check
      const _exhaustive: never = provider;
      throw new Error(`Unknown payment provider: ${_exhaustive}`);
    }
  }
}

/**
 * Verify a completed transaction against the gateway that processed it.
 * Read `payments.provider` (or `template_purchases.payment_provider`) from the
 * DB to determine which gateway to call.
 */
export async function verifyPayment(
  provider: PaymentProvider,
  reference: string
): Promise<VerifyPaymentResult> {
  switch (provider) {
    case "paystack":
      return verifyPaystackPaymentNormalized(reference);
    case "flutterwave":
      return verifyFlutterwavePayment(reference);
    default: {
      const _exhaustive: never = provider;
      throw new Error(`Unknown payment provider: ${_exhaustive}`);
    }
  }
}
