import { NextRequest, NextResponse } from "next/server";
import { r2SignedDownloadUrl } from "@/lib/r2";
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
import sql from "@/lib/db";

export const maxDuration = 300;

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

  const ts = () => new Date().toISOString();

  const [shoot] = await sql`SELECT * FROM shoots WHERE id = ${shootId}`;
  if (!shoot) return NextResponse.json({ error: "Shoot not found" }, { status: 404 });

  const refs = await sql`SELECT * FROM shoot_references WHERE shoot_id = ${shootId}`;

  type RefRow = {
    purpose: string; tag: string | null; storage_bucket: string;
    storage_path: string; name: string; url?: string;
  };
  const typedRefs = refs as unknown as RefRow[];

  const signedRefs = await Promise.all(
    typedRefs.map(async (r) => ({
      ...r,
      url: await r2SignedDownloadUrl(r.storage_bucket, r.storage_path, BASE_LOCK_TTL).catch(() => ""),
    }))
  );

  const identityRefs = signedRefs.filter((r) => r.purpose === "identity" && r.url);
  const outfitRef = signedRefs.find((r) => r.purpose === "tagged" && r.tag === "OUTFIT");
  const hairstyleRef = signedRefs.find((r) => r.purpose === "tagged" && r.tag === "HAIRSTYLE");
  const makeupRef = signedRefs.find((r) => r.purpose === "tagged" && r.tag === "MAKEUP");
  const nailRef = signedRefs.find((r) => r.purpose === "tagged" && r.tag === "NAIL");
  const accessoryRefs = signedRefs.filter((r) => r.purpose === "tagged" && r.tag === "ACCESSORY");
  const inspirationRef = signedRefs.find((r) => r.purpose === "inspiration");

  const identityPaths = typedRefs.filter((r) => r.purpose === "identity").map((r) => r.storage_path);
  const outfitPath = outfitRef?.storage_path ?? (shoot.mode === "fast" ? inspirationRef?.storage_path ?? null : null);
  const hairstylePath = hairstyleRef?.storage_path ?? null;
  const makeupPath = makeupRef?.storage_path ?? null;
  const nailPath = nailRef?.storage_path ?? null;
  const accessoryPaths = accessoryRefs.map((r) => r.storage_path);
  const cacheKey = computeBaseCacheKey(identityPaths, outfitPath, hairstylePath, makeupPath, nailPath, accessoryPaths, {});

  // Cache lookup
  if (attempt === 1) {
    const [cached] = await sql`
      SELECT * FROM character_bases
      WHERE user_id = ${shoot.user_id}
        AND cache_key = ${cacheKey}
        AND status = ANY(${["AUTO_APPROVED", "USER_APPROVED"]})
        AND is_archived = false
      LIMIT 1
    `;

    if (cached) {
      await sql`
        UPDATE shoots SET
          character_base_id = ${cached.id},
          base_lock_status = ${cached.status},
          base_lock_completed_at = ${ts()},
          status = 'QUEUED',
          updated_at = ${ts()}
        WHERE id = ${shootId}
      `;
      await sql`
        INSERT INTO generation_events (id, shoot_id, user_id, type, payload, created_at)
        VALUES (
          ${crypto.randomUUID()}, ${shootId}, ${shoot.user_id},
          'base_approved', ${JSON.stringify({ base_id: cached.id, source: "cache" })}, ${ts()}
        )
      `;

      const origin = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin;
      fetch(`${origin}/api/shoots/${shootId}/start`, {
        method: "POST",
        headers: { "x-internal-secret": process.env.INTERNAL_API_SECRET ?? "" },
      }).catch(() => {});

      return NextResponse.json({ ok: true, source: "cache", baseId: cached.id });
    }
  }

  const baseId = attempt === 1 ? crypto.randomUUID() : (body.base_id as string | undefined) ?? crypto.randomUUID();

  if (attempt === 1) {
    try {
      await sql`
        INSERT INTO character_bases (
          id, user_id, origin_shoot_id, cache_key, identity_image_paths,
          outfit_ref_path, hairstyle_ref_path, makeup_ref_path, nail_ref_path,
          accessory_ref_paths, custom_tag_refs, identity_profile, styling_brief,
          status, attempt_number, created_at, updated_at
        ) VALUES (
          ${baseId}, ${shoot.user_id}, ${shootId}, ${cacheKey},
          ${JSON.stringify(identityPaths)}, ${outfitPath}, ${hairstylePath},
          ${makeupPath}, ${nailPath}, ${JSON.stringify(accessoryPaths)},
          '{}', ${shoot.identity_profile ?? ""}, '{}',
          'GENERATING', 1, ${ts()}, ${ts()}
        )
      `;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ error: msg }, { status: 500 });
    }
    await sql`
      UPDATE shoots SET
        character_base_id = ${baseId},
        base_lock_status = 'GENERATING',
        updated_at = ${ts()}
      WHERE id = ${shootId}
    `;
  } else {
    await sql`
      UPDATE character_bases SET status = 'GENERATING', attempt_number = ${attempt}, updated_at = ${ts()}
      WHERE id = ${baseId}
    `;
  }

  await sql`
    INSERT INTO generation_events (id, shoot_id, user_id, type, payload, created_at)
    VALUES (
      ${crypto.randomUUID()}, ${shootId}, ${shoot.user_id},
      'base_locking', ${JSON.stringify({ attempt, base_id: baseId })}, ${ts()}
    )
  `;

  const stylingRefUrls = [
    outfitRef?.url ?? inspirationRef?.url ?? "",
    hairstyleRef?.url ?? "",
    makeupRef?.url ?? "",
    nailRef?.url ?? "",
    ...accessoryRefs.map((r) => r.url ?? ""),
  ].filter(Boolean) as string[];

  let stylingBrief = { outfit: "", hair: "", makeup: "", nails: "", accessories: [] as string[], outfit_ref_exclusions: [] as string[] };
  try {
    stylingBrief = await runStylingVisionPass(stylingRefUrls);
    await sql`
      UPDATE character_bases SET styling_brief = ${JSON.stringify(stylingBrief)}, updated_at = ${ts()}
      WHERE id = ${baseId}
    `;
  } catch (err) {
    console.error("[base-lock] vision pre-pass failed (non-fatal):", err);
  }

  const identityProfile = shoot.identity_profile ?? "";
  const prompt = buildBaseLockPrompt(
    identityProfile, stylingBrief,
    !!(outfitRef || (shoot.mode === "fast" && inspirationRef)),
    !!hairstyleRef, !!makeupRef, !!nailRef, accessoryRefs.length > 0
  );

  const falRefUrls = [
    ...identityRefs.map((r) => r.url),
    outfitRef?.url ?? inspirationRef?.url,
    hairstyleRef?.url,
    makeupRef?.url,
    nailRef?.url,
    ...accessoryRefs.map((r) => r.url),
  ].filter(Boolean) as string[];

  const seed = forcedSeed ?? Math.floor(Math.random() * 2 ** 31);

  logBaseLockAttempt({ shootId, baseId, attempt, prompt, refUrls: falRefUrls, seed }).catch(() => {});

  let falUrl: string;
  try {
    falUrl = await generateBaseWithFal(prompt, falRefUrls, seed);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[base-lock] fal.ai generation failed:", message);

    if (attempt < 3) {
      const origin = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin;
      fetch(`${origin}/api/shoots/${shootId}/base-lock`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-internal-secret": process.env.INTERNAL_API_SECRET ?? "" },
        body: JSON.stringify({ attempt: attempt + 1, base_id: baseId }),
      }).catch(() => {});
      return NextResponse.json({ ok: false, retrying: true, attempt });
    }

    await sql`UPDATE character_bases SET status = 'FAILED', failure_reason = ${message}, updated_at = ${ts()} WHERE id = ${baseId}`;
    await sql`UPDATE shoots SET status = 'BASE_REVIEW', base_lock_status = 'FAILED', updated_at = ${ts()} WHERE id = ${shootId}`;
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }

  let storagePath: string;
  try {
    storagePath = await saveBaseImage(null as never, shoot.user_id, baseId, falUrl);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[base-lock] save failed:", message);
    await sql`UPDATE character_bases SET status = 'FAILED', failure_reason = ${message}, updated_at = ${ts()} WHERE id = ${baseId}`;
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }

  await sql`
    UPDATE character_bases SET
      base_storage_path = ${storagePath},
      base_4k_storage_path = ${storagePath},
      fal_seed = ${seed},
      updated_at = ${ts()}
    WHERE id = ${baseId}
  `;

  const signedBaseUrl = await signBasePath(null as never, storagePath);
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

  await sql`
    UPDATE character_bases SET quality_gate_result = ${JSON.stringify(gateResult)}, updated_at = ${ts()}
    WHERE id = ${baseId}
  `;

  logBaseLockResult({
    shootId, baseId, attempt, status: decision,
    identityMatchScore: gateResult.identity_match_score,
    technicalQualityScore: gateResult.technical_quality_score,
    faceDetected: gateResult.face_detected, fullBodyVisible: gateResult.full_body_visible,
    backgroundClean: gateResult.background_is_clean_studio, notes: gateResult.notes,
  }).catch(() => {});

  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin;

  if (decision === "AUTO_APPROVED") {
    await sql`UPDATE character_bases SET status = 'AUTO_APPROVED', updated_at = ${ts()} WHERE id = ${baseId}`;
    await sql`
      UPDATE shoots SET
        status = 'QUEUED', base_lock_status = 'AUTO_APPROVED',
        base_lock_completed_at = ${ts()}, updated_at = ${ts()}
      WHERE id = ${shootId}
    `;
    await sql`
      INSERT INTO generation_events (id, shoot_id, user_id, type, payload, created_at)
      VALUES (
        ${crypto.randomUUID()}, ${shootId}, ${shoot.user_id},
        'base_approved', ${JSON.stringify({ base_id: baseId, base_url: signedBaseUrl, auto: true })}, ${ts()}
      )
    `;

    fetch(`${origin}/api/shoots/${shootId}/start`, {
      method: "POST",
      headers: { "x-internal-secret": process.env.INTERNAL_API_SECRET ?? "" },
    }).catch(() => {});

    return NextResponse.json({ ok: true, decision: "AUTO_APPROVED", baseId });
  }

  if (decision === "HARD_FAIL" && attempt < 3) {
    fetch(`${origin}/api/shoots/${shootId}/base-lock`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-internal-secret": process.env.INTERNAL_API_SECRET ?? "" },
      body: JSON.stringify({ attempt: attempt + 1, base_id: baseId, seed: seed + 1 }),
    }).catch(() => {});
    return NextResponse.json({ ok: false, retrying: true, attempt });
  }

  await sql`UPDATE character_bases SET status = 'PENDING_USER_APPROVAL', updated_at = ${ts()} WHERE id = ${baseId}`;
  await sql`
    UPDATE shoots SET status = 'BASE_REVIEW', base_lock_status = 'PENDING_USER_APPROVAL', updated_at = ${ts()}
    WHERE id = ${shootId}
  `;
  await sql`
    INSERT INTO generation_events (id, shoot_id, user_id, type, payload, created_at)
    VALUES (
      ${crypto.randomUUID()}, ${shootId}, ${shoot.user_id},
      'base_review_required',
      ${JSON.stringify({ base_id: baseId, base_url: signedBaseUrl, gate: gateResult, attempts_made: attempt, attempts_remaining: Math.max(0, 5 - attempt) })},
      ${ts()}
    )
  `;

  return NextResponse.json({
    ok: true, decision: "PENDING_USER_APPROVAL", baseId, baseUrl: signedBaseUrl, gate: gateResult,
  });
}
