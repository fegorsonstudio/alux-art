/**
 * flutterwave.ts — Flutterwave API helper
 *
 * SERVER-SIDE ONLY. Never import into client components or browser-side code.
 * FLUTTERWAVE_SECRET_KEY and FLUTTERWAVE_SECRET_HASH must never reach the browser.
 *
 * Amount rule: Flutterwave accepts native currency values — no ×100 multiplier.
 *   NGN: send whole naira   (e.g. 15000)
 *   USD: send whole dollars (e.g. parseFloat("9.38"))
 */

import { timingSafeEqual } from "crypto";
import type { InitPaymentParams, InitPaymentResult, VerifyPaymentResult } from "./payment-types";

const FLW_BASE = "https://api.flutterwave.com/v3";

function requireKey(): string {
  const key = process.env.FLUTTERWAVE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "FLUTTERWAVE_SECRET_KEY is not configured. This function must run server-side only."
    );
  }
  return key;
}

// ── Flutterwave API response shapes ──────────────────────────────────────────

interface FlwInitResponse {
  status: string;   // "success" | "error"
  message: string;
  data?: { link: string };
}

interface FlwTxRecord {
  id: number;
  tx_ref: string;
  status: string;     // "successful" | "failed" | "pending"
  amount: number;     // native currency, no conversion needed
  currency: string;
  customer: { email: string; name?: string };
  created_at: string;
}

interface FlwListResponse {
  status: string;
  data: FlwTxRecord[];
}

interface FlwVerifyResponse {
  status: string;
  data: FlwTxRecord;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Initialize a Flutterwave payment and return a redirect URL.
 * Amounts stay in whole currency units (naira / dollars) — no kobo.
 */
export async function initializeFlutterwavePayment(
  params: InitPaymentParams
): Promise<InitPaymentResult> {
  const key = requireKey();
  // Flutterwave uses native currency amounts directly — no ×100.
  // Calling code has already converted NGN→USD if currency === 'USD'.
  const amount =
    params.currency === "USD"
      ? parseFloat(params.amountNgn.toFixed(2))   // ensure 2 decimal precision
      : Math.round(params.amountNgn);              // whole naira

  // Unique reference we control — embedded in metadata so the webhook can
  // look up the associated shoot/purchase without a payments-table join.
  const txRef = `ALX-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;

  const body: Record<string, unknown> = {
    tx_ref: txRef,
    amount,
    currency: params.currency,
    redirect_url: params.callbackUrl,
    customer: { email: params.email },
    // Flutterwave uses "meta" (not "metadata") for custom transaction data
    meta: params.metadata,
  };

  if (params.creatorSubaccount?.flutterwaveId && params.creatorSubaccount.payoutNgn > 0) {
    // Creator payout already in the correct currency — same no-multiplier rule
    const chargeAmount =
      params.currency === "USD"
        ? parseFloat(params.creatorSubaccount.payoutNgn.toFixed(2))
        : Math.round(params.creatorSubaccount.payoutNgn);

    body.subaccounts = [
      {
        id: params.creatorSubaccount.flutterwaveId,
        transaction_charge_type: "flat",
        transaction_charge: chargeAmount,
      },
    ];
  }

  const res = await fetch(`${FLW_BASE}/payments`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Flutterwave initialize failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as FlwInitResponse;

  if (data.status !== "success" || !data.data?.link) {
    throw new Error(`Flutterwave error: ${data.message ?? "unknown"}`);
  }

  return {
    provider: "flutterwave",
    reference: txRef,
    authorizationUrl: data.data.link,
  };
}

/**
 * Verify a Flutterwave transaction by its tx_ref.
 *
 * Two-step: query by tx_ref to get the transaction ID, then re-verify by ID
 * for an authoritative status response (Flutterwave's recommended pattern).
 */
export async function verifyFlutterwavePayment(
  txRef: string
): Promise<VerifyPaymentResult> {
  const key = requireKey();

  // Step 1 — find the transaction ID
  const listRes = await fetch(
    `${FLW_BASE}/transactions?tx_ref=${encodeURIComponent(txRef)}`,
    {
      headers: { Authorization: `Bearer ${key}` },
      cache: "no-store",
    }
  );

  if (!listRes.ok) {
    const text = await listRes.text();
    throw new Error(`Flutterwave transaction lookup failed (${listRes.status}): ${text}`);
  }

  const listData = (await listRes.json()) as FlwListResponse;
  const tx = listData.data?.[0];

  if (!tx) {
    throw new Error(`Flutterwave: no transaction found for tx_ref=${txRef}`);
  }

  // Step 2 — re-verify by transaction ID (authoritative)
  const verifyRes = await fetch(`${FLW_BASE}/transactions/${tx.id}/verify`, {
    headers: { Authorization: `Bearer ${key}` },
    cache: "no-store",
  });

  if (!verifyRes.ok) {
    const text = await verifyRes.text();
    throw new Error(`Flutterwave verify failed (${verifyRes.status}): ${text}`);
  }

  const verifyData = (await verifyRes.json()) as FlwVerifyResponse;
  const verified = verifyData.data;

  return {
    success: verifyData.status === "success" && verified.status === "successful",
    provider: "flutterwave",
    reference: verified.tx_ref,
    // For NGN: amount is whole naira. For USD: amount is whole dollars.
    // The `currency` field tells the caller which unit applies.
    amountNgn: verified.amount,
    currency: verified.currency,
    customerEmail: verified.customer.email,
    paidAt: verified.created_at,
    rawData: verified as unknown as Record<string, unknown>,
  };
}

/**
 * Verify a Flutterwave webhook signature.
 *
 * Flutterwave sends a plain-string `verif-hash` header (not HMAC).
 * The value must match FLUTTERWAVE_SECRET_HASH exactly.
 * Uses timingSafeEqual to prevent timing-based attacks.
 */
export function verifyFlutterwaveWebhookSignature(
  _rawBody: string,
  header: string
): boolean {
  const secret = process.env.FLUTTERWAVE_SECRET_HASH;
  if (!secret) {
    console.error("[flutterwave] FLUTTERWAVE_SECRET_HASH is not set — rejecting all webhooks");
    return false;
  }

  const a = Buffer.from(header);
  const b = Buffer.from(secret);

  // Lengths must match before timingSafeEqual (it throws on length mismatch)
  if (a.length !== b.length) return false;

  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
