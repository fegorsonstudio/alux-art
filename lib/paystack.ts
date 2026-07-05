/**
 * paystack.ts — Paystack API helper
 *
 * SERVER-SIDE ONLY. Never import this file in client components or pages
 * that run in the browser. PAYSTACK_SECRET_KEY must never reach the client.
 *
 * Use in: Server Actions, Route Handlers (app/api/*)
 *
 * Amount rule for Paystack: all amounts are in kobo (NGN) or cents (USD).
 *   ₦15,000 NGN = 1500000 kobo
 *   $10.00  USD = 1000 cents
 * The initializePaystackPayment() function applies the ×100 conversion
 * internally so calling code works in whole naira/dollars.
 */

import type { InitPaymentParams, InitPaymentResult, VerifyPaymentResult } from "./payment-types";

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const VERIFY_BASE = "https://api.paystack.co/transaction/verify";
const INITIALIZE_URL = "https://api.paystack.co/transaction/initialize";

export interface PaystackCustomer {
  email: string;
  first_name?: string;
  last_name?: string;
}

export interface PaystackTransactionData {
  status: "success" | "failed" | "abandoned";
  reference: string;
  amount: number;       // kobo — divide by 100 for NGN
  currency: string;
  customer: PaystackCustomer;
  paid_at: string;
  channel: string;
  fees: number;
  metadata?: Record<string, unknown>;
}

export interface PaystackVerifyResponse {
  status: boolean;
  message: string;
  data: PaystackTransactionData;
}

export async function verifyPaystackPayment(
  reference: string
): Promise<PaystackVerifyResponse> {
  if (!PAYSTACK_SECRET_KEY) {
    throw new Error(
      "PAYSTACK_SECRET_KEY is not configured. This function must run server-side only."
    );
  }

  const response = await fetch(
    `${VERIFY_BASE}/${encodeURIComponent(reference)}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      cache: "no-store", // payment verification must never be cached
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Paystack verification failed (${response.status}): ${errorText}`
    );
  }

  return response.json() as Promise<PaystackVerifyResponse>;
}

export async function isPaymentSuccessful(reference: string): Promise<boolean> {
  const result = await verifyPaystackPayment(reference);
  return result.status === true && result.data.status === "success";
}

// ── Unified gateway interface ─────────────────────────────────────────────────
// These functions accept the shared InitPaymentParams / VerifyPaymentResult
// types and isolate ALL kobo/cents conversion from calling code.

/**
 * Initialize a Paystack transaction.
 * Converts amountNgn (whole naira) → kobo (×100) internally.
 * Creator split share is also converted to kobo internally.
 */
export async function initializePaystackPayment(
  params: InitPaymentParams
): Promise<InitPaymentResult> {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) {
    throw new Error(
      "PAYSTACK_SECRET_KEY is not configured. This function must run server-side only."
    );
  }

  // ×100 conversion lives HERE — calling code always passes the correct
  // currency value already (naira for NGN, dollars for USD). No FX conversion.
  const amount = Math.round(params.amountNgn * 100);

  const body: Record<string, unknown> = {
    email: params.email,
    amount,
    currency: params.currency,
    metadata: params.metadata,
    callback_url: params.callbackUrl,
  };

  if (params.creatorSubaccount?.paystackCode && params.creatorSubaccount.payoutNgn > 0) {
    // Creator payout is already in the correct currency units — just ×100
    const shareAmount = Math.round(params.creatorSubaccount.payoutNgn * 100);

    body.split = {
      type: "flat",
      bearer_type: "account",
      subaccounts: [
        { subaccount: params.creatorSubaccount.paystackCode, share: shareAmount },
      ],
    };
  }

  const res = await fetch(INITIALIZE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Paystack initialize failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as {
    status: boolean;
    message: string;
    data?: { authorization_url: string; reference: string };
  };

  if (!data.status || !data.data?.authorization_url) {
    throw new Error(`Paystack error: ${data.message ?? "unknown"}`);
  }

  return {
    provider: "paystack",
    reference: data.data.reference,
    authorizationUrl: data.data.authorization_url,
  };
}

/**
 * Verify a Paystack transaction and return a normalised result.
 * Converts kobo → whole naira (÷100) internally.
 */
export async function verifyPaystackPaymentNormalized(
  reference: string
): Promise<VerifyPaymentResult> {
  const result = await verifyPaystackPayment(reference);
  const tx = result.data;

  // Paystack returns amounts in kobo — divide by 100 for whole naira
  const amountNgn = Math.round(tx.amount / 100);

  return {
    success: result.status === true && tx.status === "success",
    provider: "paystack",
    reference: tx.reference,
    amountNgn,
    currency: tx.currency,
    customerEmail: tx.customer.email,
    paidAt: tx.paid_at,
    rawData: tx as unknown as Record<string, unknown>,
  };
}
