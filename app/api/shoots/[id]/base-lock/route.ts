import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import {
  computeBaseCacheKey,
  runStylingVisionPass,
  buildBaseLockPrompt,
  generateBaseWithFal,
  saveBaseImage,
  signBasePath,
  runQualityGate,
  evaluateGate,
  BASE_LOCK_TTL,
} from "@/lib/base-lock";
import { logBaseLockAttempt, logBaseLockResult } from "@/lib/airtable";

export const maxDuration = 300;

// Internal-only: called by start route and self-continuation
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const internalSecret = req.headers.get("x-internal-secret");
  if (!internalSecret || internalSecret !== process.env.INTERNAL_API_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: shootId } = await params;
  const body = await req.json().catch(() => ({}));
  const attempt: number = typeof body.attempt === "number" ? body.attempt : 1;
  const forcedSeed: number | undefined = typeof body.seed === "number" ? body.seed : undefined;

  const service = createServiceClient();
  const ts = () => new Date().toISOString();

  // Load shoot + references
  const { data: shoot, error: shootErr } = await service
    .from("shoots")
    .select("*, shoot_references(*)")
    .eq("id", shootId)
    .single();

  if (shootErr || !shoot) {
    return NextResponse.json({ error: shootErr?.message ?? "Shoot not found" }, { status: 404 });
  }

  // Type the refs
  type RefRow = {
    purpose: string; tag: string | null; storage_bucket: string;
    storage_path: string; name: string;
  };
  const refs = (shoot.shoot_references ?? []) as RefRow[];

  // Sign all ref images so they're accessible to Claude and fal.ai
  const signedRefs = await Promise.all(
    refs.map(async (r) => {
      const { data } = await service.storage
        .from(r.storage_bucket)
        .createSignedUrl(r.storage_path, BASE_LOCK_TTL);
      return { ...r, url: data?.signedUrl ?? "" };
    })
  );

  const identityRefs = signedRefs.filter((r) => r.purpose === "identity" && r.url);
  const outfitRef = signedRefs.find((r) => r.purpose === "tagged" && r.tag === "OUTFIT");
  const hairstyleRef = signedRefs.find((r) => r.purpose === "tagged" && r.tag === "HAIRSTYLE");
  const makeupRef = signedRefs.find((r) => r.purpose === "tagged" && r.tag === "MAKEUP");
  const nailRef = signedRefs.find((r) => r.purpose === "tagged" && r.tag === "NAIL");
  const accessoryRefs = signedRefs.filter((r) => r.purpose === "tagged" && r.tag === "ACCESSORY");
  // In fast mode the inspiration image acts as implicit outfit source
  const inspirationRef = signedRefs.find((r) => r.purpose === "inspiration");

  // Compute cache key over storage paths (stable, not URLs)
  const identityPaths = refs.filter((r) => r.purpose === "identity").map((r) => r.storage_path);
  const outfitPath = outfitRef?.storage_path ?? (shoot.mode === "fast" ? inspirationRef?.storage_path ?? null : null);
  const hairstylePath = hairstyleRef?.storage_path ?? null;
  const makeupPath = makeupRef?.storage_path ?? null;
  const nailPath = nailRef?.storage_path ?? null;
  const accessoryPaths = accessoryRefs.map((r) => r.storage_path);
  const cacheKey = computeBaseCacheKey(identityPaths, outfitPath, hairstylePath, makeupPath, nailPath, accessoryPaths, {});

  // ── Cache lookup ─────────────────────────────────────────────────────────
  if (attempt === 1) {
    const { data: cached } = await service
      .from("character_bases")
      .select("*")
      .eq("user_id", shoot.user_id)
      .eq("cache_key", cacheKey)
      .in("status", ["AUTO_APPROVED", "USER_APPROVED"])
      .eq("is_archived", false)
      .limit(1)
      .maybeSingle();

    if (cached) {
      await service.from("shoots").update({
        character_base_id: cached.id,
        base_lock_status: cached.status,
        base_lock_completed_at: ts(),
        status: "QUEUED",
        updated_at: ts(),
      }).eq("id", shootId);

      await service.from("generation_events").insert({
        id: crypto.randomUUID(), shoot_id: shootId, user_id: shoot.user_id,
        type: "base_approved",
        payload: { base_id: cached.id, source: "cache" },
        created_at: ts(),
      });

      // Resume slot generation
      const origin = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin;
      fetch(`${origin}/api/shoots/${shootId}/start`, {
        method: "POST",
        headers: { "x-internal-secret": process.env.INTERNAL_API_SECRET ?? "" },
      }).catch(() => {});

      return NextResponse.json({ ok: true, source: "cache", baseId: cached.id });
    }
  }

  // ── Create character_bases row ───────────────────────────────────────────
  const baseId = attempt === 1 ? crypto.randomUUID() : (body.base_id as string | undefined) ?? crypto.randomUUID();

  if (attempt === 1) {
    const { error: insertErr } = await service.from("character_bases").insert({
      id: baseId,
      user_id: shoot.user_id,
      origin_shoot_id: shootId,
      cache_key: cacheKey,
      identity_image_paths: identityPaths,
      outfit_ref_path: outfitPath,
      hairstyle_ref_path: hairstylePath,
      makeup_ref_path: makeupPath,
      nail_ref_path: nailPath,
      accessory_ref_paths: accessoryPaths,
      custom_tag_refs: {},
      identity_profile: shoot.identity_profile ?? "",
      styling_brief: {},
      status: "GENERATING",
      attempt_number: 1,
      created_at: ts(), updated_at: ts(),
    });
    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    // Attach base ID to shoot now so subsequent invocations can reference it
    await service.from("shoots").update({
      character_base_id: baseId,
      base_lock_status: "GENERATING",
      updated_at: ts(),
    }).eq("id", shootId);
  } else {
    // Update attempt number on existing row
    await service.from("character_bases").update({
      status: "GENERATING",
      attempt_number: attempt,
      updated_at: ts(),
    }).eq("id", baseId);
  }

  await service.from("generation_events").insert({
    id: crypto.randomUUID(), shoot_id: shootId, user_id: shoot.user_id,
    type: "base_locking",
    payload: { attempt, base_id: baseId },
    created_at: ts(),
  });

  // ── Vision pre-pass ──────────────────────────────────────────────────────
  const stylingRefUrls = [
    outfitRef?.url ?? inspirationRef?.url ?? "",
    hairstyleRef?.url ?? "",
    makeupRef?.url ?? "",
    nailRef?.url ?? "",
    ...accessoryRefs.map((r) => r.url),
  ].filter(Boolean);

  let stylingBrief = { outfit: "", hair: "", makeup: "", nails: "", accessories: [] as string[], outfit_ref_exclusions: [] as string[] };
  try {
    stylingBrief = await runStylingVisionPass(stylingRefUrls);
    await service.from("character_bases").update({
      styling_brief: stylingBrief,
      updated_at: ts(),
    }).eq("id", baseId);
  } catch (err) {
    console.error("[base-lock] vision pre-pass failed (non-fatal):", err);
  }

  // ── Build prompt ─────────────────────────────────────────────────────────
  const identityProfile = shoot.identity_profile ?? "";
  const prompt = buildBaseLockPrompt(
    identityProfile, stylingBrief,
    !!(outfitRef || (shoot.mode === "fast" && inspirationRef)),
    !!hairstyleRef, !!makeupRef, !!nailRef, accessoryRefs.length > 0
  );

  // Attach all relevant ref URLs for fal.ai
  const falRefUrls = [
    ...identityRefs.map((r) => r.url),
    outfitRef?.url ?? inspirationRef?.url,
    hairstyleRef?.url,
    makeupRef?.url,
    nailRef?.url,
    ...accessoryRefs.map((r) => r.url),
  ].filter(Boolean) as string[];

  const seed = forcedSeed ?? Math.floor(Math.random() * 2 ** 31);

  // Log to Airtable before calling fal.ai
  logBaseLockAttempt({
    shootId, baseId, attempt, prompt,
    refUrls: falRefUrls, seed,
  }).catch(() => {});

  // ── Generate base image ──────────────────────────────────────────────────
  let falUrl: string;
  try {
    falUrl = await generateBaseWithFal(prompt, falRefUrls, seed);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[base-lock] fal.ai generation failed:", message);

    if (attempt < 3) {
      // Auto-retry with new seed
      const origin = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin;
      fetch(`${origin}/api/shoots/${shootId}/base-lock`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-internal-secret": process.env.INTERNAL_API_SECRET ?? "",
        },
        body: JSON.stringify({ attempt: attempt + 1, base_id: baseId }),
      }).catch(() => {});
      return NextResponse.json({ ok: false, retrying: true, attempt });
    }

    await service.from("character_bases").update({
      status: "FAILED", failure_reason: message, updated_at: ts(),
    }).eq("id", baseId);
    await service.from("shoots").update({
      status: "BASE_REVIEW", base_lock_status: "FAILED", updated_at: ts(),
    }).eq("id", shootId);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }

  // ── Save to storage ──────────────────────────────────────────────────────
  let storagePath: string;
  try {
    storagePath = await saveBaseImage(service, shoot.user_id, baseId, falUrl);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[base-lock] save failed:", message);
    await service.from("character_bases").update({
      status: "FAILED", failure_reason: message, updated_at: ts(),
    }).eq("id", baseId);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }

  await service.from("character_bases").update({
    base_storage_path: storagePath,
    base_4k_storage_path: storagePath, // same for now; extend later with upscale step
    fal_seed: seed,
    updated_at: ts(),
  }).eq("id", baseId);

  // ── Quality gate ─────────────────────────────────────────────────────────
  const signedBaseUrl = await signBasePath(service, storagePath);
  const identityRefUrlsForGate = identityRefs.map((r) => r.url).slice(0, 2);

  let gateResult;
  let decision: "AUTO_APPROVED" | "PENDING_USER_APPROVAL" | "HARD_FAIL";
  try {
    gateResult = await runQualityGate(signedBaseUrl, identityRefUrlsForGate);
    decision = evaluateGate(gateResult);
  } catch (err) {
    console.error("[base-lock] quality gate failed (defaulting to borderline):", err);
    gateResult = { face_detected: true, face_count: 1, identity_match_score: 0.75,
      full_body_visible: true, background_is_clean_studio: true, no_crops: true,
      technical_quality_score: 0.75, notes: "Gate call failed — defaulting to borderline" };
    decision = "PENDING_USER_APPROVAL";
  }

  await service.from("character_bases").update({
    quality_gate_result: gateResult,
    updated_at: ts(),
  }).eq("id", baseId);

  logBaseLockResult({
    shootId, baseId, attempt,
    status: decision,
    identityMatchScore: gateResult.identity_match_score,
    technicalQualityScore: gateResult.technical_quality_score,
    faceDetected: gateResult.face_detected,
    fullBodyVisible: gateResult.full_body_visible,
    backgroundClean: gateResult.background_is_clean_studio,
    notes: gateResult.notes,
  }).catch(() => {});

  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin;

  if (decision === "AUTO_APPROVED") {
    await service.from("character_bases").update({
      status: "AUTO_APPROVED", updated_at: ts(),
    }).eq("id", baseId);

    await service.from("shoots").update({
      status: "QUEUED",
      base_lock_status: "AUTO_APPROVED",
      base_lock_completed_at: ts(),
      updated_at: ts(),
    }).eq("id", shootId);

    await service.from("generation_events").insert({
      id: crypto.randomUUID(), shoot_id: shootId, user_id: shoot.user_id,
      type: "base_approved",
      payload: { base_id: baseId, base_url: signedBaseUrl, auto: true },
      created_at: ts(),
    });

    // Resume slot generation
    fetch(`${origin}/api/shoots/${shootId}/start`, {
      method: "POST",
      headers: { "x-internal-secret": process.env.INTERNAL_API_SECRET ?? "" },
    }).catch(() => {});

    return NextResponse.json({ ok: true, decision: "AUTO_APPROVED", baseId });
  }

  if (decision === "HARD_FAIL" && attempt < 3) {
    // Auto-retry with new seed
    fetch(`${origin}/api/shoots/${shootId}/base-lock`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": process.env.INTERNAL_API_SECRET ?? "",
      },
      body: JSON.stringify({ attempt: attempt + 1, base_id: baseId, seed: seed + 1 }),
    }).catch(() => {});
    return NextResponse.json({ ok: false, retrying: true, attempt });
  }

  // Borderline OR hard-fail after 3 attempts → surface to user
  await service.from("character_bases").update({
    status: "PENDING_USER_APPROVAL", updated_at: ts(),
  }).eq("id", baseId);

  await service.from("shoots").update({
    status: "BASE_REVIEW",
    base_lock_status: "PENDING_USER_APPROVAL",
    updated_at: ts(),
  }).eq("id", shootId);

  await service.from("generation_events").insert({
    id: crypto.randomUUID(), shoot_id: shootId, user_id: shoot.user_id,
    type: "base_review_required",
    payload: {
      base_id: baseId,
      base_url: signedBaseUrl,
      gate: gateResult,
      attempts_made: attempt,
      attempts_remaining: Math.max(0, 5 - attempt),
    },
    created_at: ts(),
  });

  return NextResponse.json({
    ok: true,
    decision: "PENDING_USER_APPROVAL",
    baseId,
    baseUrl: signedBaseUrl,
    gate: gateResult,
  });
}
