import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import sql from "@/lib/db";

const ALLOWED_VISION_MODELS = ["gemini", "claude"] as const;
const ALLOWED_GENERATION_MODELS = ["nano-banana", "seedream"] as const;

type VisionModel = (typeof ALLOWED_VISION_MODELS)[number];
type GenerationModel = (typeof ALLOWED_GENERATION_MODELS)[number];
type AdminConfig = {
  vision_model: VisionModel;
  generation_model: GenerationModel;
  locked_base_rollout_percent: number;
  locked_base_enabled: boolean;
  platform_fee_ngn: number;
  price_1_ngn: number;
  price_5_ngn: number;
  price_10_ngn: number;
  price_1_usd: number;
  price_5_usd: number;
  price_10_usd: number;
  prompt_only_mode: boolean;
  polish_pass_enabled: boolean;
};

async function getAdminSession() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.email !== process.env.ADMIN_EMAIL) return null;
  return user;
}

export async function GET() {
  const user = await getAdminSession();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const rows = await sql`SELECT key, value FROM app_config`;
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));

  const n = (key: string, fallback: number, legacyKey?: string): number => {
    const raw = map[key] ?? (legacyKey ? map[legacyKey] : undefined);
    const v = raw ? parseInt(raw as string, 10) : 0;
    return v > 0 ? v : fallback;
  };
  const f = (key: string, fallback: number): number => {
    const raw = map[key];
    const v = raw ? parseFloat(raw as string) : 0;
    return v > 0 ? v : fallback;
  };

  return NextResponse.json({
    vision_model: (map.vision_model ?? "gemini") as VisionModel,
    generation_model: (map.generation_model ?? "nano-banana") as GenerationModel,
    locked_base_rollout_percent: parseInt((map.locked_base_rollout_percent as string) ?? "100", 10),
    locked_base_enabled: map.locked_base_enabled === "true",
    platform_fee_ngn: n("platform_fee_ngn", 15000),
    price_1_ngn: n("price_1_ngn", 1500, "platform_price_1_ngn"),
    price_5_ngn: n("price_5_ngn", 7500, "platform_price_5_ngn"),
    price_10_ngn: n("price_10_ngn", 15000, "platform_fee_ngn"),
    price_1_usd: f("price_1_usd", 1),
    price_5_usd: f("price_5_usd", 5),
    price_10_usd: f("price_10_usd", 10),
    prompt_only_mode: map.prompt_only_mode === "true",
    polish_pass_enabled: map.polish_pass_enabled === "true",
  } satisfies AdminConfig);
}

export async function PATCH(req: NextRequest) {
  const user = await getAdminSession();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const updates: Array<{ key: string; value: string; updated_at: string }> = [];
  const now = new Date().toISOString();

  const push = (key: string, value: string) => updates.push({ key, value, updated_at: now });

  if (body.vision_model !== undefined) {
    if (!ALLOWED_VISION_MODELS.includes(body.vision_model)) {
      return NextResponse.json({ error: `vision_model must be one of: ${ALLOWED_VISION_MODELS.join(", ")}` }, { status: 400 });
    }
    push("vision_model", body.vision_model);
  }
  if (body.generation_model !== undefined) {
    if (!ALLOWED_GENERATION_MODELS.includes(body.generation_model)) {
      return NextResponse.json({ error: `generation_model must be one of: ${ALLOWED_GENERATION_MODELS.join(", ")}` }, { status: 400 });
    }
    push("generation_model", body.generation_model);
  }
  if (body.locked_base_rollout_percent !== undefined) {
    const pct = Number(body.locked_base_rollout_percent);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      return NextResponse.json({ error: "locked_base_rollout_percent must be 0–100" }, { status: 400 });
    }
    push("locked_base_rollout_percent", String(Math.round(pct)));
  }
  if (body.locked_base_enabled !== undefined) {
    push("locked_base_enabled", body.locked_base_enabled ? "true" : "false");
  }
  if (body.platform_fee_ngn !== undefined) {
    const fee = Number(body.platform_fee_ngn);
    if (!Number.isInteger(fee) || fee < 1000) {
      return NextResponse.json({ error: "platform_fee_ngn must be an integer ≥ 1000" }, { status: 400 });
    }
    push("platform_fee_ngn", String(fee));
  }
  // NGN package prices
  const ngnChecks: Array<[string, number, string]> = [
    ["price_1_ngn", 100, "price_1_ngn must be ≥ 100"],
    ["price_5_ngn", 500, "price_5_ngn must be ≥ 500"],
    ["price_10_ngn", 1000, "price_10_ngn must be ≥ 1000"],
  ];
  for (const [key, min, msg] of ngnChecks) {
    if (body[key] !== undefined) {
      const v = Number(body[key]);
      if (!Number.isInteger(v) || v < min) return NextResponse.json({ error: msg }, { status: 400 });
      push(key, String(v));
      // also write to legacy keys for backward compat
      if (key === "price_1_ngn") push("platform_price_1_ngn", String(v));
      if (key === "price_5_ngn") push("platform_price_5_ngn", String(v));
    }
  }
  // USD package prices
  const usdChecks: Array<[string, number, string]> = [
    ["price_1_usd", 0.5, "price_1_usd must be ≥ 0.5"],
    ["price_5_usd", 2, "price_5_usd must be ≥ 2"],
    ["price_10_usd", 5, "price_10_usd must be ≥ 5"],
  ];
  for (const [key, min, msg] of usdChecks) {
    if (body[key] !== undefined) {
      const v = Number(body[key]);
      if (!Number.isFinite(v) || v < min) return NextResponse.json({ error: msg }, { status: 400 });
      push(key, String(v));
    }
  }
  if (body.prompt_only_mode !== undefined) {
    push("prompt_only_mode", body.prompt_only_mode ? "true" : "false");
  }
  if (body.polish_pass_enabled !== undefined) {
    push("polish_pass_enabled", body.polish_pass_enabled ? "true" : "false");
  }

  if (updates.length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  try {
    for (const u of updates) {
      await sql`
        INSERT INTO app_config (key, value, updated_at)
        VALUES (${u.key}, ${u.value}, ${u.updated_at})
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at
      `;
    }
  } catch (err) {
    console.error("[admin/config] save failed", err);
    return NextResponse.json({ error: "Unable to save config" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, updated: updates.map(u => u.key) });
}
