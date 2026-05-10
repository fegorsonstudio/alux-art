/**
 * paystack.ts — Payment Verification Helper
 *
 * SERVER-SIDE ONLY. Never import this file in client components or pages
 * that run in the browser. PAYSTACK_SECRET_KEY must never reach the client.
 *
 * Use in: Server Actions, Route Handlers (app/api/*)
 */

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const VERIFY_BASE = "https://api.paystack.co/transaction/verify";

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
