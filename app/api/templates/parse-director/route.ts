import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json() as { directorPrompt?: string };
  const raw = typeof body.directorPrompt === "string" ? body.directorPrompt.trim() : "";
  if (!raw) return NextResponse.json({ error: "directorPrompt is required" }, { status: 400 });
  if (raw.length > 20000) return NextResponse.json({ error: "Director prompt too long (max 20 000 chars)" }, { status: 400 });

  const systemPrompt = `You are a photoshoot data extractor. The user pastes a creative director output that contains numbered photoshoot prompts (usually 10). Extract each numbered shot into a structured JSON array.

Rules:
- Extract all numbered shots from "Part 1" (the photoshoot prompts section).
- Each shot must have: slot (integer starting at 1), title (the shot name/label), description (the full shot prompt text exactly as written), environment (location/background extracted from the prompt), wardrobe (any outfit/styling/accessories mentioned).
- If a field is not explicitly mentioned for a shot, infer it briefly from the creative direction header if present, otherwise use an empty string.
- Return ONLY valid JSON — an array of objects, nothing else. No explanation, no markdown, no code fences.

Example output:
[{"slot":1,"title":"Establishing Shot (Wide)","description":"The model stands on the white terrace...","environment":"White stucco terrace, ocean view, golden hour","wardrobe":"Sheer pink chiffon dress, silver clutch"}]`;

  let parsed: unknown;
  try {
    const msg = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: "user", content: raw }],
    });

    const text = msg.content[0]?.type === "text" ? msg.content[0].text.trim() : "";
    // Strip any accidental markdown code fences
    const cleaned = text.replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/i, "").trim();
    parsed = JSON.parse(cleaned);
  } catch (err) {
    console.error("[parse-director] Claude parse error", err);
    return NextResponse.json({ error: "Failed to parse director prompt. Make sure it contains numbered photoshoot prompts in Part 1." }, { status: 422 });
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    return NextResponse.json({ error: "No scenes found in the pasted text." }, { status: 422 });
  }

  // Sanitise each scene
  const scenes = (parsed as Record<string, unknown>[]).map((s, i) => ({
    slot: typeof s.slot === "number" ? s.slot : i + 1,
    title: typeof s.title === "string" ? s.title.trim().slice(0, 120) : `Shot ${i + 1}`,
    description: typeof s.description === "string" ? s.description.trim().slice(0, 1500) : "",
    environment: typeof s.environment === "string" ? s.environment.trim().slice(0, 300) : "",
    wardrobe: typeof s.wardrobe === "string" ? s.wardrobe.trim().slice(0, 300) : "",
  }));

  return NextResponse.json({ scenes });
}
