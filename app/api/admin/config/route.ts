import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase-server";

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
  prompt_only_mode: boolean;
  polish_pass_enabled: boolean;
};

async function getAdminSession() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user ?? null;
  if (!user || user.email !== process.env.ADMIN_EMAIL) return null;
  return user;
}

export async function GET() {
  const user = await getAdminSession();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const service = createServiceClient();
  const { data } = await service.from("app_config").select("key,value");
  const map = Object.fromEntries((data ?? []).map(r => [r.key, r.value]));

  return NextResponse.json({
    vision_model: (map.vision_model ?? "gemini") as VisionModel,
    generation_model: (map.generation_model ?? "nano-banana") as GenerationModel,
    locked_base_rollout_percent: parseInt(map.locked_base_rollout_percent ?? "100", 10),
    locked_base_enabled: map.locked_base_enabled === "true",
    platform_fee_ngn: parseInt(map.platform_fee_ngn ?? "15000", 10),
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

  if (body.vision_model !== undefined) {
    if (!ALLOWED_VISION_MODELS.includes(body.vision_model)) {
      return NextResponse.json({ error: `vision_model must be one of: ${ALLOWED_VISION_MODELS.join(", ")}` }, { status: 400 });
    }
    updates.push({ key: "vision_model", value: body.vision_model, updated_at: now });
  }

  if (body.generation_model !== undefined) {
    if (!ALLOWED_GENERATION_MODELS.includes(body.generation_model)) {
      return NextResponse.json({ error: `generation_model must be one of: ${ALLOWED_GENERATION_MODELS.join(", ")}` }, { status: 400 });
    }
    updates.push({ key: "generation_model", value: body.generation_model, updated_at: now });
  }

  if (body.locked_base_rollout_percent !== undefined) {
    const pct = Number(body.locked_base_rollout_percent);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      return NextResponse.json({ error: "locked_base_rollout_percent must be 0–100" }, { status: 400 });
    }
    updates.push({ key: "locked_base_rollout_percent", value: String(Math.round(pct)), updated_at: now });
  }

  if (body.locked_base_enabled !== undefined) {
    updates.push({ key: "locked_base_enabled", value: body.locked_base_enabled ? "true" : "false", updated_at: now });
  }

  if (body.platform_fee_ngn !== undefined) {
    const fee = Number(body.platform_fee_ngn);
    if (!Number.isInteger(fee) || fee < 1000) {
      return NextResponse.json({ error: "platform_fee_ngn must be an integer ≥ 1000" }, { status: 400 });
    }
    updates.push({ key: "platform_fee_ngn", value: String(fee), updated_at: now });
  }

  if (body.prompt_only_mode !== undefined) {
    updates.push({ key: "prompt_only_mode", value: body.prompt_only_mode ? "true" : "false", updated_at: now });
  }

  if (body.polish_pass_enabled !== undefined) {
    updates.push({ key: "polish_pass_enabled", value: body.polish_pass_enabled ? "true" : "false", updated_at: now });
  }

  if (updates.length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const service = createServiceClient();
  const { error } = await service.from("app_config").upsert(updates, { onConflict: "key" });
  if (error) {
    console.error("[admin/config] save failed", error);
    return NextResponse.json({ error: "Unable to save config" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, updated: updates.map(u => u.key) });
}
