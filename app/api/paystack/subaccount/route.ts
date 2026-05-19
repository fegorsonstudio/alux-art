import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase-server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user ?? null;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceClient();
  const { data: creator } = await service
    .from("creators")
    .select("id, display_name, bank_name")
    .eq("user_id", user.id)
    .single();
  if (!creator) return NextResponse.json({ error: "Creator profile not found" }, { status: 404 });

  const body = await request.json() as Record<string, unknown>;
  const { bankCode, accountNumber, accountName } = body;

  if (typeof bankCode !== "string" || typeof accountNumber !== "string" || typeof accountName !== "string") {
    return NextResponse.json({ error: "bankCode, accountNumber, and accountName are required" }, { status: 400 });
  }

  const res = await fetch("https://api.paystack.co/subaccount", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      business_name: creator.display_name,
      settlement_bank: bankCode,
      account_number: accountNumber,
      percentage_charge: 0,
      description: `Creator payout — ${creator.display_name}`,
    }),
  });

  const data = await res.json();
  if (!data.status) {
    return NextResponse.json({ error: data.message ?? "Failed to create subaccount" }, { status: 422 });
  }

  const subaccountCode: string = data.data.subaccount_code;

  await service.from("creators").update({
    paystack_subaccount_code: subaccountCode,
    account_number: accountNumber,
    account_name: accountName,
    bank_name: data.data.bank_name ?? creator.bank_name,
    updated_at: new Date().toISOString(),
  }).eq("id", creator.id);

  return NextResponse.json({ subaccountCode });
}
