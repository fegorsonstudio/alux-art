import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { fal } from "@fal-ai/client";
import sharp from "sharp";
import { createServiceClient } from "./supabase-server";
import { normalizePackageSize, type AspectRatio } from "./types";
import { logFalPayload, logReferenceUpload } from "./airtable";
import { signBasePath } from "./base-lock";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? "");

fal.config({ credentials: process.env.FAL_KEY ?? process.env.FAL_API_KEY ?? "" });

const IDENTITY_ANALYSIS_TIMEOUT_MS = 45_000;
const SHOOT_BRIEF_TIMEOUT_MS = 270_000;
const REFERENCE_SIGNED_URL_TTL_SECONDS = 48 * 60 * 60;

async function withRetry<T>(fn: () => Promise<T>, retries = 3, delayMs = 2000): Promise<T> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === retries - 1) throw err;
      await new Promise(r => setTimeout(r, delayMs * Math.pow(2, attempt)));
    }
  }
  throw new Error("unreachable");
}

// Fetch + resize an image to max 2000px before sending to Claude (Claude rejects >8000px)
async function toBase64Block(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Image fetch failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const resized = await sharp(buf)
    .resize(2000, 2000, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
  return {
    type: "image" as const,
    source: {
      type: "base64" as const,
      media_type: "image/jpeg" as const,
      data: resized.toString("base64"),
    },
  };
}

// Gemini image part — same resize logic, different wrapper format
async function toGeminiImagePart(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Image fetch failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const resized = await sharp(buf)
    .resize(2000, 2000, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
  return { inlineData: { mimeType: "image/jpeg" as const, data: resized.toString("base64") } };
}

type ShootRefRow = {
  purpose: string;
  tag?: string | null;
  custom_name?: string | null;
  note?: string | null;
  name: string;
  storage_bucket: string;
  storage_path: string;
};

type SignedRef = {
  purpose: string;
  tag?: string | null;
  customName?: string | null;
  note?: string | null;
  name: string;
  url: string;
};

type SlotRow = {
  id: string;
  slot: number;
  status: string;
};

type FalOutput = {
  images?: Array<{ url: string }>;
};

async function signRefs(
  service: ReturnType<typeof createServiceClient>,
  refs: ShootRefRow[]
): Promise<SignedRef[]> {
  return Promise.all(
    refs.map(async (ref) => {
      const { data, error } = await service.storage
        .from(ref.storage_bucket)
        .createSignedUrl(ref.storage_path, REFERENCE_SIGNED_URL_TTL_SECONDS);
      if (error || !data?.signedUrl) {
        console.error("[generate] reference signing failed:", {
          purpose: ref.purpose,
          bucket: ref.storage_bucket,
          path: ref.storage_path,
          error: error?.message ?? "No signed URL returned",
        });
      }
      return {
        purpose: ref.purpose,
        tag: ref.tag,
        customName: ref.custom_name,
        note: ref.note,
        name: ref.name,
        url: data?.signedUrl ?? "",
      };
    })
  );
}

async function analyzeIdentityImages(imageUrls: string[]): Promise<string> {
  const imageBlocks = await Promise.all(
    imageUrls.filter(Boolean).slice(0, 4).map(toBase64Block)
  );

  const response = await anthropic.messages.create(
    {
      model: "claude-sonnet-4-6",
      max_tokens: 512,
      messages: [
        {
          role: "user",
          content: [
            ...imageBlocks,
            {
              type: "text",
              text: `Analyze these identity reference photos and extract a precise identity profile for AI image generation.

Return ONLY this format:
IDENTITY PROFILE:
Face: [facial structure — shape, proportions, bone structure]
Skin: [tone with specific descriptors e.g. warm medium brown, cool fair]
Eyes: [color, shape, spacing]
Hair: [color, texture, length, style]
Build: [body type, height impression, proportions]
Distinctive: [any notable stable features]

Clinical and precise. No subjective judgments. Stable biometric features only.`,
            },
          ],
        },
      ],
    },
    { timeout: IDENTITY_ANALYSIS_TIMEOUT_MS, maxRetries: 0 }
  );

  return response.content[0].type === "text" ? response.content[0].text : "";
}

type SceneSlotPrompt = {
  background: string;
  lighting: string;
  mood_vibe: string;
  photography_style: string;
  pose: string;
  shot_type: string;
  scene_exclusions: string;
};

type NewPromptObject = {
  prompt_index: number;
  is_quote_card?: boolean;
  fully_consolidated_prompt?: string;
  svg_layout_instructions?: string;
  negative_prompts?: string;
};

const SHOOT_BRIEF_SYSTEM_INSTRUCTION = `SYSTEM INSTRUCTION: Photo Shoot Prompt Engineer (Art Director Vision Model)

You are an expert, world-class Art Director and Prompt Engineer for professional high-end fashion and lifestyle photoshoots. Your mission is to analyze incoming image assets and design exactly 9 highly detailed, diverse, and technically flawless photoshoot prompts and 1 specialized quote graphic portrait prompt (utilizing an SVG-based overlay workflow).

The entire output must be formatted in a single, strict, valid JSON object with absolutely no external conversational pre-text or post-text.

I. INPUT CLASSIFICATION & VALIDATION

You will analyze three distinct groups of incoming image assets (URLs or base64 data):

GROUP A — Identity (Subject):
Role: The target subject. Their face, skin tone, unique physical markers (scars, piercings, tattoos), and body structure must be replicated with absolute precision across all photographic prompts.
Framing Type Alignment: Analyze the framing of the Group A images carefully to align with downstream prompts:
- Portrait-only references must only be used for tight close-ups and beauty portraits.
- Medium/half-body references must only be used for waist/hip-up or medium prompts.
- Smiling references with visible teeth must be used only for prompts that explicitly involve smiling or laughing.
Validation: If there is a critical gap (e.g., you need to generate a full-body shot but only have a headshot, or a requested asset is completely missing), set the upload_error_warning key at the root of the JSON with a description of what is missing. Do not generate empty or fallback placeholders.

GROUP B — Inspiration (Aesthetic & Pose):
Role: Visual references for the environments, compositions, camera angles, lighting moods, and editorial styling.
Pose Harvesting: If multiple inspiration images are provided, analyze and map all observed poses across your prompts. If fewer than 10 are provided, creatively invent highly fashion-forward, professional poses to fill the remaining slots.

GROUP C — Accessories & Overrides:
Role: Specific items tagged with names and styling notes (e.g., clothing, shoes, bags, props, custom nail designs, jewelry details, hair overrides).
Strict Tag-Focused Isolation: If an image in Group C displays a full body, a model, or a wider scene context but is tagged as a specific element (e.g., tagged as "shoe", "bag", "jacket", "wedding ring"), you must isolate and describe only the tagged item from that image. Completely ignore all other visual information in that reference photo.
Hard-Replacement Priority: Items in Group C hard-replace any corresponding items worn by models in the Group B inspiration images.

II. THE MANDATORY PROMPT PREFIX (For Prompts 1 through 9)

To lock in the image generator's behavioral constraints and protect the subject's identity, the prefix key for all 9 editorial subject prompts must begin with this exact text block, word-for-word, without deviation:

"Use the attached face/body identity photo submitted as the subject. Generate a hyper-realistic photograph matching this reference exactly. PRIORITY: The subject's face, body structure, and dentition must be taken directly and accurately from the attached face photo, preserve all facial features, exactly as they appear. Do not alter the subject's identity under any circumstances. This is a professional fashion and lifestyle photoshoot. The result must look like a high-end editorial magazine photograph with perfect technical quality."

III. CORE ART DIRECTION & SAFETY SAFEGUARDS

1. The Dentition Safeguard
Inspect Group A closely. If NO identity photo displays clear dentition, you MUST NOT write any prompt describing a smiling, laughing, or open-mouthed expression. All pose values must specify closed lips.

2. Styling, Hairstyles, and Overrides
By default, preserve the hair shown in Group A identity images. However, if Group C contains an image tagged [HAIRSTYLE], you MUST override all hair descriptions from Group A and Group B with the EXACT hairstyle visible in the [HAIRSTYLE] reference image. This override is absolute — even if the [HAIRSTYLE] image shows a shaved head, bald head, very short crop, or any other style that differs dramatically from Group A, you must describe that exact style in every portrait prompt. Never fall back to Group A hair when a [HAIRSTYLE] tag is present.

If Group C contains an image tagged [NAIL_DESIGN], detail those custom nail characteristics in the Important Details section.

[OUTFIT] CONSISTENCY LOCK: If Group C contains an asset tagged [OUTFIT], that exact outfit MUST be worn by the subject in ALL 9 portrait prompts without exception. Extract the specific garment, fabric, color, cut, silhouette, and surface details from the [OUTFIT] reference image and replicate them precisely in every portrait prompt. Shot-to-shot variation must come only from pose, camera angle, expression, and composition — NOT from changing the outfit. Do not invent or substitute any alternative garments.

[BACKGROUND] CONSISTENCY LOCK: If Group C contains an asset tagged [BACKGROUND], extract the specific environment type, location, and visual characteristics from that reference and use it as the primary backdrop setting across all portrait prompts. Variation between shots may come from framing, distance, and angle — but the environment type must remain consistent with the [BACKGROUND] reference.

3. Critical Exclusions Registry
- No Aesthetic Bleeding: Do NOT transfer models, skin tones, faces, or hairstyles from Group B or Group C onto the target subject.
- No Identity Artifacts: Do NOT transfer casual clothing from Group A onto the editorial. Group A is for physical identity preservation only.
- No Background Spills: Do NOT mix background environment elements of Group C into the Group B background setting.

4. Cohesive Portfolio Rule
Maintain absolute visual and stylistic cohesion in color grading, mood, atmosphere, and environments across the series. Include baseline negative prompt: "no additional unwanted jewelry, no dead eyes without catchlights, no imaginary teeth, no asymmetric facial structures".

5. Camera & Lens Consistency
Dynamically select one of the world's top 4 medium-format camera systems (Hasselblad, Phase One, Fujifilm GFX, or Leica S) and keep it identical across all 9 portrait prompts. Vary focal lengths per shot type.

6. Atmospheric Elements Integration
Every prompt must incorporate organic atmospheric elements: volumetric dust motes, morning mist, wind-blown elements, humid air quality, micro light leaks, or organic lens flares.

7. Self-Containment Mandate
Every single prompt must be fully self-contained. Never reference other prompts. Fully articulate all details in every prompt, even if repeated. Do NOT include any internal reasoning phrases such as "as seen in identity photo X", "from reference image Y", "per Group C", or any other meta-references to the input assets. The output prompt text is sent directly to an image generator that has no context about the input groups — describe everything explicitly in photographic language.

IV. THE 10th PROMPT: THE GRAPHIC QUOTE CARD

The 10th prompt is a specialized instruction block for an SVG composite workflow. It specifies instructions for producing a high-end editorial graphic layout combining a background image with beautiful typography overlay. Define high-contrast typographic zones, transparent overlays, and beautiful placement of quote text.

V. OUTPUT JSON STRUCTURE

Output ONLY a valid JSON object. No markdown code fences, no pre-text, no post-text.

IMPORTANT: Do all creative reasoning internally. Output ONLY the final consolidated fields — no intermediate breakdown fields (no separate background, lighting, pose, shot_type, outfit_look, reference_registry, prefix, etc.). This keeps the JSON compact and within token limits.

{
  "upload_error_warning": null,
  "prompts": [
    {
      "prompt_index": 1,
      "is_quote_card": false,
      "fully_consolidated_prompt": "Use the attached face/body identity photo submitted as the subject. Generate a hyper-realistic photograph matching this reference exactly. PRIORITY: The subject's face, body structure, and dentition must be taken directly and accurately from the attached face photo, preserve all facial features, exactly as they appear. Do not alter the subject's identity under any circumstances. This is a professional fashion and lifestyle photoshoot. The result must look like a high-end editorial magazine photograph with perfect technical quality. Scene: [lighting setup, background/environment description, shot setup]. Subject: [body language, pose, expression, gaze direction]. Important Details: [exact outfit from [OUTFIT] reference or inspiration, fabric/texture specifics, hairstyle, lens feel, color balance, any tag overrides]. Use Case: editorial fashion photography. Constraints: [preserve identity, preserve outfit lock if [OUTFIT] was provided, negative constraints].",
      "negative_prompts": "no additional jewelry, no dead eyes without catchlights, no imaginary teeth, no asymmetric facial structures"
    },
    {
      "prompt_index": 10,
      "is_quote_card": true,
      "fully_consolidated_prompt": "Complete composite graphic instructions for background image generation.",
      "svg_layout_instructions": "Complete SVG overlay instructions: typographic hierarchy, font specifications, text-shadow or dark overlay for contrast, positioning, color assignments.",
      "negative_prompts": "..."
    }
  ]
}`;


async function buildShootBrief(
  shoot: {
    mode: string;
    package_size: number;
    aspect_ratio: string;
    quote?: { text: string; attribution: string } | null;
  },
  identityProfile: string,
  refs: SignedRef[],
  characterBaseUrl?: string
): Promise<string> {
  const packageSize = normalizePackageSize(shoot.package_size);
  const identityRefs = refs.filter((r) => r.purpose === "identity" && r.url);
  const inspirationRefs = refs.filter((r) => r.purpose === "inspiration" && r.url).slice(0, 9);
  const taggedRefs = refs.filter((r) => r.purpose === "tagged" && r.url);
  const hasQuote = !!shoot.quote?.text && packageSize === 10;
  const portraitCount = hasQuote ? packageSize - 1 : packageSize;

  // Group A: locked base or identity images
  const groupAUrls = characterBaseUrl ? [characterBaseUrl] : identityRefs.map((r) => r.url);
  const groupALabel = characterBaseUrl
    ? "GROUP A — Identity (Subject): Locked character base image. Use for exact facial identity, body structure, and locked wardrobe."
    : `GROUP A — Identity (Subject): ${groupAUrls.length} identity reference photo(s). Use for facial features, skin tone, and body build only.\n\nIdentity Profile:\n${identityProfile}`;

  const [groupABlocks, groupBBlocks, groupCImageBlocks] = await Promise.all([
    Promise.all(groupAUrls.slice(0, 4).map(toGeminiImagePart)),
    Promise.all(inspirationRefs.map((r) => toGeminiImagePart(r.url))),
    Promise.all(taggedRefs.map((r) => toGeminiImagePart(r.url))),
  ]);

  type GeminiPart = { text: string } | { inlineData: { mimeType: "image/jpeg"; data: string } };
  const parts: GeminiPart[] = [];

  if (groupABlocks.length > 0) {
    parts.push({ text: groupALabel });
    parts.push(...groupABlocks);
  }

  if (groupBBlocks.length > 0) {
    parts.push({ text: "GROUP B — Inspiration (Aesthetic & Pose): Visual references for environments, compositions, camera angles, lighting moods, and editorial styling." });
    parts.push(...groupBBlocks);
  }

  // Interleave each Group C image with its own tag label so the model
  // knows exactly which image maps to which tag (critical for [HAIRSTYLE] etc.)
  if (groupCImageBlocks.length > 0) {
    parts.push({ text: "GROUP C — Accessories & Overrides: Each tagged reference is labelled immediately before its image." });
    for (let i = 0; i < taggedRefs.length; i++) {
      const r = taggedRefs[i];
      const tag = r.tag ?? r.customName ?? "unknown";
      const note = r.note ? ` — note: ${r.note}` : "";
      parts.push({ text: `[${tag}] reference image — "${r.name}"${note}: Extract ONLY the ${tag.toLowerCase()} from this image and apply it to all portrait prompts. Ignore all other elements.` });
      parts.push(groupCImageBlocks[i]);
    }
  }

  parts.push({
    text: `SHOOT PARAMETERS:
- Mode: ${shoot.mode}
- Package: ${packageSize} images total (${portraitCount} portrait${portraitCount !== 1 ? "s" : ""}${hasQuote ? " + 1 quote card" : ""})
- Aspect Ratio: ${shoot.aspect_ratio}
${hasQuote ? `- Quote Text: "${shoot.quote!.text}"${shoot.quote!.attribution ? `\n- Attribution: "${shoot.quote!.attribution}"` : ""}` : ""}

Generate exactly ${portraitCount} portrait prompt${portraitCount !== 1 ? "s" : ""}${hasQuote ? " + 1 quote card prompt (prompt_index: 10, is_quote_card: true)" : ""}.

Output ONLY valid JSON matching the output structure in your instructions. No markdown fences, no pre-text, no post-text.`,
  });

  const geminiModel = genai.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction: SHOOT_BRIEF_SYSTEM_INSTRUCTION,
    generationConfig: {
      maxOutputTokens: 16384,
      responseMimeType: "application/json",
    },
  });

  const geminiResult = await Promise.race([
    geminiModel.generateContent(parts),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Gemini brief timeout")), SHOOT_BRIEF_TIMEOUT_MS)
    ),
  ]);

  const raw = geminiResult.response.text();
  return raw.replace(/^```(?:json)?\s*/im, "").replace(/```\s*$/m, "").trim();
}

async function generateImageWithFal(
  prompt: string,
  imageUrls: string[],
  aspectRatio: string,
  resolution = "1K"
): Promise<string> {
  // Free fallback for testing when FAL_KEY has no credits
  if (process.env.FAL_TEST_MODE === "1") {
    const dims: Record<string, string> = {
      "3:4": "768x1024", "4:5": "820x1024", "1:1": "1024x1024",
      "16:9": "1024x576", "9:16": "576x1024", "2:3": "683x1024",
    };
    const size = dims[aspectRatio] ?? "820x1024";
    const [w, h] = size.split("x");
    const encoded = encodeURIComponent(prompt.slice(0, 300));
    return `https://image.pollinations.ai/prompt/${encoded}?width=${w}&height=${h}&nologo=1&seed=${Date.now()}`;
  }

  const response = await fal.subscribe("fal-ai/nano-banana-2/edit", {
    input: {
      prompt,
      num_images: 1,
      // All our AspectRatio values are in fal's union; cast through unknown to satisfy strict type
      aspect_ratio: aspectRatio as unknown as "4:5",
      output_format: "png",
      safety_tolerance: "6",
      image_urls: imageUrls.slice(0, 9),
      limit_generations: false,
      ...(resolution ? { resolution: resolution as unknown as "4K" } : {}),
    },
  });

  // Handle both newer and older fal-ai/client versions
  const output = ((response as Record<string, unknown>).data || response) as FalOutput;
  const url = output.images?.[0]?.url ?? "";
  if (!url) throw new Error("fal.ai returned no image URL");
  return url;
}

async function saveSlotImage(
  service: ReturnType<typeof createServiceClient>,
  shootId: string,
  userId: string,
  slot: number,
  imageUrl: string,
  isTestMode: boolean = false
): Promise<string> {
  const imageRes = await fetch(imageUrl);
  if (!imageRes.ok) throw new Error(`Image fetch failed: ${imageRes.status}`);

  const contentType =
    imageRes.headers.get("content-type")?.startsWith("image/")
      ? imageRes.headers.get("content-type")!
      : "image/png";
  const bytes = Buffer.from(await imageRes.arrayBuffer());
  const ext = contentType === "image/jpeg" ? "jpg" : "png";
  const storagePath = `${userId}/${shootId}/slot-${slot}.${ext}`;
  const bucket = isTestMode ? "test" : "generated-4k";

  const { error } = await service.storage
    .from(bucket)
    .upload(storagePath, bytes, { contentType, upsert: true });
  if (error) throw new Error(error.message);

  return storagePath;
}

function wrapQuoteLines(text: string, maxCharsPerLine: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (current && (current + " " + word).length > maxCharsPerLine) {
      lines.push(current.trim());
      current = word;
    } else {
      current = current ? current + " " + word : word;
    }
  }
  if (current) lines.push(current.trim());
  return lines.filter(Boolean);
}

function escXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildSvg(w: number, h: number, elements: string[], withShadow = false): string {
  const defs = withShadow
    ? `<defs><filter id="shadow"><feDropShadow dx="2" dy="2" stdDeviation="3" flood-color="rgba(0,0,0,0.9)"/></filter></defs>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${defs}${elements.join("")}</svg>`;
}

async function compositeQuoteCard(
  service: ReturnType<typeof createServiceClient>,
  shoot: {
    id: string;
    user_id: string;
    quote: { text: string; attribution?: string } | null;
    package_size: number;
    aspect_ratio: string;
  },
  backgroundStoragePath: string,
  bucket: string,
  svgLayoutInstructions?: string
): Promise<void> {
  if (!shoot.quote?.text) return;

  const quoteText = shoot.quote.text;
  const attribution = shoot.quote.attribution ?? "";

  // Find best portrait from an earlier completed slot
  const { data: portraitSlot } = await service
    .from("shoot_images")
    .select("slot, preview_storage_bucket, preview_storage_path")
    .eq("shoot_id", shoot.id)
    .eq("status", "COMPLETE")
    .lt("slot", shoot.package_size)
    .order("slot", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!portraitSlot?.preview_storage_path) {
    console.log("[compositeQuoteCard] no portrait found, keeping plain background");
    return;
  }

  const [bgSigned, portraitSigned] = await Promise.all([
    service.storage.from(bucket).createSignedUrl(backgroundStoragePath, 3600),
    service.storage
      .from(portraitSlot.preview_storage_bucket as string)
      .createSignedUrl(portraitSlot.preview_storage_path as string, 3600),
  ]);
  if (!bgSigned.data?.signedUrl || !portraitSigned.data?.signedUrl) return;

  const [bgRes, portraitRes] = await Promise.all([
    fetch(bgSigned.data.signedUrl),
    fetch(portraitSigned.data.signedUrl),
  ]);
  if (!bgRes.ok || !portraitRes.ok) return;

  const [bgBuf, portraitBuf] = [
    Buffer.from(await bgRes.arrayBuffer()),
    Buffer.from(await portraitRes.arrayBuffer()),
  ];

  const bgMeta = await sharp(bgBuf).metadata();
  const W = bgMeta.width ?? 1080;
  const H = bgMeta.height ?? 1350;

  // Ask Claude to pick a layout and color scheme
  const [bgBlock, portraitBlock] = await Promise.all([
    toBase64Block(bgSigned.data.signedUrl),
    toBase64Block(portraitSigned.data.signedUrl),
  ]);

  const designRes = await anthropic.messages.create(
    {
      model: "claude-sonnet-4-6",
      max_tokens: 256,
      messages: [
        {
          role: "user",
          content: [
            bgBlock,
            portraitBlock,
            {
              type: "text",
              text: `You are a graphic designer compositing a quote card. Image 1 is the mood background, image 2 is the subject portrait.

Quote: "${quoteText}"${attribution ? `\nAttribution: ${attribution}` : ""}
${svgLayoutInstructions ? `\nLayout guidance from shoot brief:\n${svgLayoutInstructions}\n` : ""}
Choose the best layout:
- "top_bottom": portrait fills frame, bold text in dark bands top and bottom
- "split_right": portrait on left 55%, text on dark right panel
- "overlay": portrait full-bleed, dark overlay, centered text

Return ONLY valid JSON (no markdown):
{"layout":"top_bottom","text_color":"#RRGGBB","accent_color":"#RRGGBB","overlay_opacity":0.45,"capitalize":true}`,
            },
          ],
        },
      ],
    },
    { timeout: 20_000, maxRetries: 0 }
  );

  const rawDesign =
    designRes.content[0].type === "text" ? designRes.content[0].text : "{}";
  let design: {
    layout: string;
    text_color: string;
    accent_color: string;
    overlay_opacity: number;
    capitalize: boolean;
  };
  try {
    const cleaned = rawDesign
      .replace(/^```(?:json)?\s*/im, "")
      .replace(/```\s*$/m, "")
      .trim();
    design = JSON.parse(cleaned);
  } catch {
    design = {
      layout: "overlay",
      text_color: "#FFFFFF",
      accent_color: "#CCCCCC",
      overlay_opacity: 0.45,
      capitalize: true,
    };
  }

  const textColor = design.text_color ?? "#FFFFFF";
  const accentColor = design.accent_color ?? "#CCCCCC";
  const overlayOpacity = Math.min(0.8, design.overlay_opacity ?? 0.45);
  const displayQuote = design.capitalize ? quoteText.toUpperCase() : quoteText;

  let finalBuf: Buffer;

  if (design.layout === "split_right") {
    const portraitW = Math.round(W * 0.55);
    const panelW = W - portraitW;

    const [croppedPortrait, panelBuf] = await Promise.all([
      sharp(portraitBuf)
        .resize(portraitW, H, { fit: "cover", position: "centre" })
        .toBuffer(),
      sharp({
        create: {
          width: panelW,
          height: H,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: Math.round(0.88 * 255) },
        },
      })
        .png()
        .toBuffer(),
    ]);

    const canvas = await sharp({
      create: { width: W, height: H, channels: 3, background: { r: 0, g: 0, b: 0 } },
    })
      .png()
      .toBuffer();

    const lines = wrapQuoteLines(displayQuote, 14);
    const fontSize = Math.min(
      Math.round(H / (lines.length + 5)),
      Math.round(panelW / 5)
    );
    const lineH = fontSize + 10;
    const blockH = lines.length * lineH;
    const startY = Math.round((H - blockH) / 2);
    const cx = portraitW + Math.round(panelW / 2);

    const textEls = lines.map(
      (line, i) =>
        `<text x="${cx}" y="${startY + i * lineH + fontSize}" text-anchor="middle" font-size="${fontSize}" font-weight="900" fill="${textColor}" font-family="Impact, Arial Black, sans-serif">${escXml(line)}</text>`
    );
    if (attribution) {
      textEls.push(
        `<text x="${cx}" y="${startY + blockH + 32}" text-anchor="middle" font-size="${Math.round(fontSize * 0.45)}" fill="${accentColor}" font-family="Arial, sans-serif">${escXml(attribution)}</text>`
      );
    }

    finalBuf = await sharp(canvas)
      .composite([
        { input: croppedPortrait, top: 0, left: 0 },
        { input: panelBuf, top: 0, left: portraitW },
        { input: Buffer.from(buildSvg(W, H, textEls)) },
      ])
      .png()
      .toBuffer();

  } else if (design.layout === "top_bottom") {
    const bandH = Math.round(H * 0.22);

    const [croppedPortrait, topBand, botBand] = await Promise.all([
      sharp(portraitBuf)
        .resize(W, H, { fit: "cover", position: "north" })
        .toBuffer(),
      sharp({
        create: {
          width: W,
          height: bandH,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: Math.round(0.65 * 255) },
        },
      })
        .png()
        .toBuffer(),
      sharp({
        create: {
          width: W,
          height: bandH,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: Math.round(0.75 * 255) },
        },
      })
        .png()
        .toBuffer(),
    ]);

    const lines = wrapQuoteLines(displayQuote, 20);
    const halfLen = Math.ceil(lines.length / 2);
    const topLines = lines.slice(0, halfLen);
    const botLines = lines.slice(halfLen);
    const fontSize = Math.min(
      Math.round(bandH / (Math.max(topLines.length, botLines.length) + 1.5)),
      Math.round(W / 9)
    );
    const lineH = fontSize + 8;

    const textEls: string[] = [];
    topLines.forEach((line, i) => {
      textEls.push(
        `<text x="${W / 2}" y="${Math.round(bandH * 0.25) + i * lineH + fontSize}" text-anchor="middle" font-size="${fontSize}" font-weight="900" fill="${textColor}" font-family="Impact, Arial Black, sans-serif" filter="url(#shadow)">${escXml(line)}</text>`
      );
    });
    botLines.forEach((line, i) => {
      textEls.push(
        `<text x="${W / 2}" y="${H - bandH + Math.round(bandH * 0.2) + i * lineH + fontSize}" text-anchor="middle" font-size="${fontSize}" font-weight="900" fill="${textColor}" font-family="Impact, Arial Black, sans-serif" filter="url(#shadow)">${escXml(line)}</text>`
      );
    });
    if (attribution) {
      textEls.push(
        `<text x="${W / 2}" y="${H - 28}" text-anchor="middle" font-size="${Math.round(fontSize * 0.45)}" fill="${accentColor}" font-family="Arial, sans-serif">${escXml(attribution)}</text>`
      );
    }

    finalBuf = await sharp(croppedPortrait)
      .composite([
        { input: topBand, top: 0, left: 0 },
        { input: botBand, top: H - bandH, left: 0 },
        { input: Buffer.from(buildSvg(W, H, textEls, true)) },
      ])
      .png()
      .toBuffer();

  } else {
    // "overlay": portrait full-bleed + dark overlay + centered text
    const overlayAlpha = Math.round(overlayOpacity * 255);
    const [croppedPortrait, overlayBuf] = await Promise.all([
      sharp(portraitBuf)
        .resize(W, H, { fit: "cover", position: "centre" })
        .toBuffer(),
      sharp({
        create: {
          width: W,
          height: H,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: overlayAlpha },
        },
      })
        .png()
        .toBuffer(),
    ]);

    const lines = wrapQuoteLines(displayQuote, 18);
    const fontSize = Math.min(
      Math.round(H / (lines.length + 6)),
      Math.round(W / 7)
    );
    const lineH = fontSize + 14;
    const blockH = lines.length * lineH;
    const startY = Math.round((H - blockH) / 2);

    const textEls = lines.map(
      (line, i) =>
        `<text x="${W / 2}" y="${startY + i * lineH + fontSize}" text-anchor="middle" font-size="${fontSize}" font-weight="900" fill="${textColor}" font-family="Impact, Arial Black, sans-serif" filter="url(#shadow)">${escXml(line)}</text>`
    );
    if (attribution) {
      textEls.push(
        `<text x="${W / 2}" y="${startY + blockH + 50}" text-anchor="middle" font-size="${Math.round(fontSize * 0.45)}" fill="${accentColor}" font-family="Arial, sans-serif">${escXml(attribution)}</text>`
      );
    }

    finalBuf = await sharp(croppedPortrait)
      .composite([
        { input: overlayBuf, blend: "over" },
        { input: Buffer.from(buildSvg(W, H, textEls, true)) },
      ])
      .png()
      .toBuffer();
  }

  await service.storage.from(bucket).upload(backgroundStoragePath, finalBuf, {
    contentType: "image/png",
    upsert: true,
  });

  console.log(`[compositeQuoteCard] layout="${design.layout}" saved to ${bucket}/${backgroundStoragePath}`);
}

export type WorkerResult = {
  done: boolean;
  completed: number;
  failed: number;
  remaining: number;
  total: number;
};

export async function startGenerationWorker(
  shootId: string,
  opts: { maxSlots?: number; resolution?: string } = {}
): Promise<WorkerResult> {
  const maxSlots = opts.maxSlots ?? 1;
  const resolution = opts.resolution ?? "1K";
  const service = createServiceClient();
  const ts = () => new Date().toISOString();

  const { data: shoot, error: shootErr } = await service
    .from("shoots")
    .select("*, shoot_references(*), shoot_images(*)")
    .eq("id", shootId)
    .single();

  if (shootErr || !shoot) throw new Error(shootErr?.message ?? "Shoot not found");

  const total = normalizePackageSize(shoot.package_size);
  const hasQuote = !!(shoot.quote as { text?: string } | null)?.text && total === 10;
  // Supabase returns JSONB defaults as {} (object), not "" — normalize to string first.
  const rawIdentity = shoot.identity_profile;
  let identityProfile: string =
    typeof rawIdentity === "string" ? rawIdentity : "";
  const rawBrief = shoot.shoot_brief;
  let shootBrief: string =
    typeof rawBrief === "string" ? rawBrief : "";

  const rawRefs = (shoot.shoot_references ?? []) as ShootRefRow[];
  const refs = await signRefs(service, rawRefs);

  // ── Character base resolution ──────────────────────────────────────────
  let characterBaseUrl: string | undefined;
  const hasBase = typeof shoot.character_base_id === "string" && !!shoot.character_base_id;

  if (hasBase) {
    const { data: base } = await service
      .from("character_bases")
      .select("id, base_4k_storage_path, base_storage_path, identity_profile")
      .eq("id", shoot.character_base_id)
      .single();

    if (base) {
      const storagePath = base.base_4k_storage_path ?? base.base_storage_path;
      if (storagePath) {
        characterBaseUrl = await signBasePath(service, storagePath, REFERENCE_SIGNED_URL_TTL_SECONDS).catch(() => undefined);
      }
      // If the shoot doesn't have an identity profile yet, pull it from the base
      if (!identityProfile && typeof base.identity_profile === "string") {
        identityProfile = base.identity_profile;
        await service.from("shoots").update({ identity_profile: identityProfile, updated_at: ts() }).eq("id", shootId);
      }
    }
  }

  if (!hasBase) {
    const identityRefCount = rawRefs.filter((r) => r.purpose === "identity").length;
    const signedIdentityCount = refs.filter((r) => r.purpose === "identity" && r.url).length;
    console.log("[generate] reference URL counts:", {
      shootId,
      totalRefs: rawRefs.length,
      identityRefCount,
      signedIdentityCount,
    });
    if (identityRefCount > 0 && signedIdentityCount === 0) {
      throw new Error(`Identity references exist but none could be signed for shoot ${shootId}`);
    }
  }

  if (!identityProfile && !shootBrief) {
    // Log all reference uploads once before generation. Awaiting matters in serverless:
    // fire-and-forget requests can be dropped when the function returns.
    const refLogResults = await Promise.allSettled(
      rawRefs.map((raw, i) =>
        logReferenceUpload({
          shootId,
          fileName: raw.name,
          purpose: raw.purpose,
          tag: raw.tag,
          storageBucket: raw.storage_bucket,
          storagePath: raw.storage_path,
          fileSizeKB: 0,
          contentType: "image/*",
          signedUrl: refs[i]?.url ?? "",
        })
      )
    );
    for (const result of refLogResults) {
      if (result.status === "rejected") {
        console.error("[airtable] logReferenceUpload failed:", result.reason);
      }
    }
  }

  // --- Step 1: Identity analysis (skip if base provides it) ---
  if (!identityProfile && !hasBase) {
    await service
      .from("shoots")
      .update({ pipeline_stage: "Analyzing identity", progress: 10, updated_at: ts() })
      .eq("id", shootId);

    await service.from("generation_events").insert({
      id: crypto.randomUUID(),
      shoot_id: shootId,
      user_id: shoot.user_id,
      type: "stage",
      payload: { stage: "Analyzing identity", progress: 10 },
      created_at: ts(),
    });

    const identityUrls = refs
      .filter((r) => r.purpose === "identity")
      .map((r) => r.url)
      .filter(Boolean);
    if (identityUrls.length === 0) throw new Error("No identity images found");

    identityProfile = await withRetry(() => analyzeIdentityImages(identityUrls), 2);

    await service
      .from("shoots")
      .update({ identity_profile: identityProfile, updated_at: ts() })
      .eq("id", shootId);
  }

  // --- Step 2: Shoot brief ---
  if (!shootBrief) {

    await service
      .from("shoots")
      .update({ pipeline_stage: "Building shoot brief", progress: 20, updated_at: ts() })
      .eq("id", shootId);

    await service.from("generation_events").insert({
      id: crypto.randomUUID(),
      shoot_id: shootId,
      user_id: shoot.user_id,
      type: "stage",
      payload: { stage: "Building shoot brief", progress: 20 },
      created_at: ts(),
    });

    // No retry — brief timeout (220s) + fal slot (50s) must fit Vercel's 300s limit.
    // Retrying a timed-out Claude call would double the budget and kill the function.
    shootBrief = await buildShootBrief(shoot, identityProfile, refs, characterBaseUrl);
    // Validate before storing — truncation at max_tokens produces broken JSON
    try {
      JSON.parse(shootBrief);
    } catch {
      console.error("[generate] buildShootBrief raw preview:", shootBrief.slice(0, 3000));
      throw new Error(`buildShootBrief returned invalid JSON (length ${shootBrief.length}) — likely hit token limit`);
    }

    await service
      .from("shoots")
      .update({ shoot_brief: shootBrief, updated_at: ts() })
      .eq("id", shootId);

    // Brief build can take 3-4 min with 16K max_tokens + 7 images.
    // Return early so self-continuation gets a fresh 300s budget for slot generation.
    return { done: false, completed: 0, failed: 0, remaining: normalizePackageSize(shoot.package_size), total: normalizePackageSize(shoot.package_size) };
  }

  // Parse per-slot prompts
  // Normalize to string first — Supabase JSONB columns return objects, not strings
  const shootBriefStr =
    typeof shootBrief === "string"
      ? shootBrief
      : JSON.stringify(shootBrief ?? {});

  const shootBriefClean = shootBriefStr
    .replace(/^```(?:json)?\s*/im, "")
    .replace(/```\s*$/m, "")
    .trim();

  let prompts: Record<string, string | SceneSlotPrompt> = {};
  const svgLayoutMap: Record<string, string> = {};
  try {
    const parsed = JSON.parse(shootBriefClean);
    const rawPrompts = parsed.prompts;
    if (Array.isArray(rawPrompts)) {
      // New array format from SHOOT_BRIEF_SYSTEM_INSTRUCTION
      for (const p of rawPrompts as NewPromptObject[]) {
        const key = String(p.prompt_index);
        if (p.fully_consolidated_prompt) prompts[key] = p.fully_consolidated_prompt;
        if (p.svg_layout_instructions) svgLayoutMap[key] = p.svg_layout_instructions;
      }
    } else if (rawPrompts && typeof rawPrompts === "object") {
      // Legacy dict format
      prompts = rawPrompts as Record<string, string | SceneSlotPrompt>;
    }
  } catch (e) {
    console.error("[generate] JSON parse failed, falling back to regex", e);
    const match = shootBriefClean.match(/"1"\s*:\s*"([^"]+)"/);
    if (match) prompts["1"] = match[1];
  }

  // --- Step 3: Process pending slots ---
  const allSlots = (shoot.shoot_images ?? []) as SlotRow[];
  const pendingSlots = allSlots
    .filter((img) => ["QUEUED", "PENDING"].includes(img.status))
    .sort((a, b) => a.slot - b.slot)
    .slice(0, maxSlots);

  const aspectRatio = (shoot.aspect_ratio as AspectRatio) ?? "4:5";

  // Build imageUrls for fal.ai — base-locked shoots use base + scene refs; standard shoots use identity + inspiration
  let imageUrls: string[];
  if (hasBase && characterBaseUrl) {
    const backgroundUrl = refs.find((r) => r.purpose === "tagged" && r.tag === "BACKGROUND")?.url ?? "";
    const lightingUrl = refs.find((r) => r.purpose === "tagged" && r.tag === "LIGHTING")?.url ?? "";
    const colorGradeUrl = refs.find((r) => r.purpose === "tagged" && r.tag === "COLOR_GRADE")?.url ?? "";
    imageUrls = [characterBaseUrl, backgroundUrl, lightingUrl, colorGradeUrl].filter(Boolean).slice(0, 4);
  } else {
    const identityUrls = refs.filter((r) => r.purpose === "identity").map((r) => r.url).filter(Boolean);
    const inspirationUrls = refs.filter((r) => r.purpose === "inspiration").map((r) => r.url).filter(Boolean);
    imageUrls = [...identityUrls.slice(0, 1), ...inspirationUrls.slice(0, 8)];
  }

  const identityUrls = refs
    .filter((r) => r.purpose === "identity")
    .map((r) => r.url)
    .filter(Boolean);
  const inspirationUrls = refs
    .filter((r) => r.purpose === "inspiration")
    .map((r) => r.url)
    .filter(Boolean);

  let failedCount = 0;

  for (const slotImg of pendingSlots) {
    const slot = slotImg.slot;

    // Optimistic-lock: claim this slot atomically
    const { data: claimed } = await service
      .from("shoot_images")
      .update({ status: "GENERATING", stage: `Generating slot ${slot}`, updated_at: ts() })
      .eq("id", slotImg.id)
      .eq("status", slotImg.status) // ensures only one worker picks it
      .select("id")
      .maybeSingle();

    if (!claimed) continue; // another invocation already grabbed it

    await service
      .from("shoots")
      .update({
        pipeline_stage: `Generating slot ${slot}`,
        progress: Math.min(85, 20 + Math.round((slot / total) * 65)),
        updated_at: ts(),
      })
      .eq("id", shootId);

    await service.from("generation_events").insert({
      id: crypto.randomUUID(),
      shoot_id: shootId,
      user_id: shoot.user_id,
      type: "slot_update",
      payload: { image: { slot, status: "GENERATING" } },
      created_at: ts(),
    });

    try {
      const rawSlotPrompt = prompts[String(slot)] ?? prompts["1"];

      let slotPrompt: string;
      if (hasBase && characterBaseUrl && rawSlotPrompt && typeof rawSlotPrompt === "object") {
        // Locked-base: assemble final prompt from scene fields + base anchor opener
        const scene = rawSlotPrompt as SceneSlotPrompt;
        slotPrompt = [
          `Scene: ${scene.background}. ${scene.lighting}. ${scene.mood_vibe}.`,
          `Shot: ${scene.shot_type}. Photography style: ${scene.photography_style}.`,
          `Subject: [BASE REFERENCE] — use the locked character base as the primary identity and wardrobe anchor. Pose: ${scene.pose}.`,
          `Important Details: Maintain exact facial identity, skin tone, body build, and outfit from base reference. Realistic skin texture, natural asymmetry, physically plausible light direction, editorial lens feel, subtle film grain.`,
          `Use Case: editorial photography / fashion portrait.`,
          `Constraints: Preserve exact identity from base reference image. Do not alter face shape, eye spacing, nose shape, jawline, or skin tone. ${scene.scene_exclusions}.`,
        ].join(" ");
      } else if (typeof rawSlotPrompt === "string" && rawSlotPrompt) {
        slotPrompt = rawSlotPrompt;
      } else {
        slotPrompt = "Scene: Studio portrait with clean background. Subject: Person preserving identity exactly. Important Details: Natural wardrobe, editorial lens feel. Use Case: fashion portrait. Constraints: Preserve exact identity. No alterations to facial structure.";
      }

      const isTestMode = process.env.FAL_TEST_MODE === "1";

      // Persist prompt before fal call so it's visible even if generation fails
      await service
        .from("shoot_images")
        .update({ prompt: slotPrompt, updated_at: ts() })
        .eq("id", slotImg.id);

      // Log to Airtable before calling fal.ai so the payload is always visible
      console.log("[generate] Airtable payload URL counts:", {
        shootId,
        slot,
        identityUrls: identityUrls.length,
        inspirationUrls: inspirationUrls.length,
        imageUrls: imageUrls.length,
      });

      try {
        await logFalPayload({
          shootId,
          slot,
          mode: shoot.mode,
          aspectRatio,
          prompt: slotPrompt,
          identityUrls,
          inspirationUrls,
          taggedRefs: refs
            .filter((r) => r.purpose === "tagged")
            .map((r) => ({ tag: r.tag ?? r.customName, url: r.url })),
          imageUrls,
          identityProfile: typeof identityProfile === "string" ? identityProfile : "",
          shootBrief: typeof shootBrief === "string" ? shootBrief : "",
          quoteText: shoot.quote?.text,
          status: isTestMode ? "dry_run" : "sent_to_fal",
        });
      } catch (err) {
        console.error("[airtable] logFalPayload failed:", err);
      }

      const falUrl = await withRetry(() => generateImageWithFal(slotPrompt, imageUrls, aspectRatio, resolution));

      // Always save the image to Supabase storage (using "test" bucket in test mode) so signed URLs work
      const storagePath = await saveSlotImage(service, shootId, shoot.user_id, slot, falUrl, isTestMode);

      // Quote card composite: replace plain background with portrait + text layout
      if (hasQuote && slot === total) {
        const quoteBucket = isTestMode ? "test" : "generated-4k";
        try {
          await compositeQuoteCard(
            service,
            {
              id: shootId,
              user_id: shoot.user_id,
              quote: shoot.quote as { text: string; attribution?: string } | null,
              package_size: total,
              aspect_ratio: shoot.aspect_ratio,
            },
            storagePath,
            quoteBucket,
            svgLayoutMap[String(slot)]
          );
        } catch (compErr) {
          console.error("[generate] compositeQuoteCard failed, keeping plain background:", compErr);
        }
      }

      await service
        .from("shoot_images")
        .update({
          status: "COMPLETE",
          stage: `Completed slot ${slot}`,
          provider: isTestMode ? "pollinations" : "vercel-fal",
          configured_model: isTestMode ? "pollinations-free" : "fal-ai/nano-banana-2/edit",
          preview_storage_bucket: isTestMode ? "test" : "generated-4k",
          preview_storage_path: storagePath,
          download_storage_bucket: isTestMode ? "test" : "generated-4k",
          download_storage_path: storagePath,
          updated_at: ts(),
        })
        .eq("id", slotImg.id);

      await service.from("generation_events").insert({
        id: crypto.randomUUID(),
        shoot_id: shootId,
        user_id: shoot.user_id,
        type: "slot_complete",
        payload: { image: { slot, status: "COMPLETE" } },
        created_at: ts(),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[generate] slot ${slot} failed:`, message);
      failedCount++;

      await service
        .from("shoot_images")
        .update({
          status: "FAILED",
          stage: `Failed: ${message.slice(0, 200)}`,
          provider_error: message,
          updated_at: ts(),
        })
        .eq("id", slotImg.id);
    }
  }

  // Recount completion — done when no slots remain workable (avoids infinite loop on all-FAILED)
  const { count: completeCount } = await service
    .from("shoot_images")
    .select("id", { count: "exact", head: true })
    .eq("shoot_id", shootId)
    .eq("status", "COMPLETE");

  const { count: workableCount } = await service
    .from("shoot_images")
    .select("id", { count: "exact", head: true })
    .eq("shoot_id", shootId)
    .in("status", ["QUEUED", "PENDING", "GENERATING"]);

  const totalComplete = completeCount ?? 0;
  const remaining = workableCount ?? 0;
  const done = remaining === 0;

  await service
    .from("shoots")
    .update({
      status: done ? "COMPLETE" : "PROCESSING",
      progress: done ? 100 : Math.max(10, Math.round((totalComplete / total) * 100)),
      pipeline_stage: done
        ? "Complete"
        : `Completed ${totalComplete}/${total} shots`,
      completed_at: done ? ts() : null,
      updated_at: ts(),
    })
    .eq("id", shootId);

  if (done) {
    await service.from("generation_events").insert({
      id: crypto.randomUUID(),
      shoot_id: shootId,
      user_id: shoot.user_id,
      type: "complete",
      payload: { progress: 100, stage: "Complete" },
      created_at: ts(),
    });
  }

  return { done, completed: totalComplete, failed: failedCount, remaining, total };
}
