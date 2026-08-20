# Alux Art — Complete Product & Business Briefing

Use this document to understand what Alux Art is, what it does, how it works, and how the business is structured. Read it before answering any questions about Alux Art strategy, product, marketing, or technology.

---

## What Alux Art Is

**Alux Art** (full name: Alux Art and Frames) is an AI-powered autonomous photo studio.

It turns a person's ordinary selfies and casual photos into a full set of professional editorial images — without a photographer, without a studio appointment, without any prompts from the user.

**The core promise in one sentence:** Upload your photos. Get 10 professional images. Done.

Alux Art is not a filter app. It is not a photo editor. It is not a beauty tool. It is a studio — one that uses AI to do what a photographer, a stylist, and a retoucher would do together, at a fraction of the cost and time.

The product is live at: **aluxartandframes.shop**

---

## The Problem It Solves

In Nigeria, a professional photoshoot costs between ₦50,000 and ₦200,000+. It requires scheduling a photographer, finding a location, arranging wardrobe, and waiting days or weeks for edited results.

Most people — creators, entrepreneurs, job seekers, professionals who need a strong visual presence on Instagram or LinkedIn — cannot afford this regularly or at all.

Alux Art charges ₦15,000 (approximately $10 USD) for 10 professional editorial images, delivered in 2–5 minutes.

---

## The Core Differentiator: Identity Lock

The single most important feature is **Identity Lock**.

Every AI image generator on the market produces images of a person who looks similar to you — but with a different face, altered skin tone, reshaped features. They replace your identity with a fantasy version.

Alux Art preserves your **exact** face:
- Same face shape, eye spacing, nose shape, jawline
- Same skin tone, hairline, body build
- Recognizable likeness — not an approximation

This is achieved using face-embedding technology (IPAdapter / InstantID) that anchors every generated image to the specific person's uploaded photos. The user uploads 3–5 identity photos (selfies, casual photos) and those photos become the fixed reference for every image in the shoot.

This is not a marketing claim — it is a technical enforcement. The system raises an error if no identity-preservation node is found in a generation workflow.

---

## How It Works — User Flow

1. **Create an account** and log in
2. **Upload identity photos** (3–10 selfies or casual photos of themselves)
3. **Choose a shoot mode** (Fast or Advanced — explained below)
4. **Add an inspiration image** (a photo showing a desired aesthetic, outfit, or setting)
5. **Select a package** (1, 5, or 10 images) and pay
6. **The system generates the shoot automatically** — no prompts needed
7. **Download the finished images** individually or as a ZIP

The user never writes a prompt. The AI reads the identity photos, reads the inspiration image, builds a detailed shoot brief, and generates the images.

---

## Shoot Modes

### Fast Mode
- Minimum: 3 identity photos + 1 inspiration image
- The inspiration image controls the entire look: outfit, mood, lighting, background, color palette
- Shot variation comes from pose, expression, camera angle, and composition
- Good for users who know what aesthetic they want and have a reference image

### Advanced Mode
- Everything in Fast Mode, plus **tagged reference images**
- Users can upload additional photos with specific tags to override parts of the look:
  - `[OUTFIT]` — replace the outfit with this reference
  - `[HAIRSTYLE]` — apply this hairstyle
  - `[MAKEUP]` — apply this makeup look
  - `[BACKGROUND]` — use this environment or backdrop
  - `[LIGHTING]` — match this lighting setup
  - `[ACCESSORY]` — add these accessories
  - `[COLOR_GRADE]` — apply this film or edit style
- Each tag overrides only its specific category; it does not bleed into others

### Marketplace / Template Mode
- Creators (photographers, stylists, brands) build and publish **shoot templates**
- A template packages a curated set of inspiration images, reference images, and shoot configuration
- Users browse the marketplace, buy a template, upload their identity photos, and run the shoot
- Creators earn a revenue share from every purchase of their templates

---

## Pricing

| Package | NGN Price | USD Price | Images |
|---|---|---|---|
| Single | ₦3,000 | ~$2 | 1 |
| Standard | ₦15,000 | ~$10 | 5 |
| Full Shoot | ₦25,000 | ~$15 | 10 |

Payments are processed through **Paystack** (Nigeria's dominant payment gateway). USD payments are also supported. Prices are configured in the admin dashboard and can be changed.

Creators who publish templates receive a payout split (platform fee deducted, remainder to creator via their Paystack subaccount).

---

## Technology Stack

This is how the product works technically. This section helps answer questions about architecture, limitations, and capabilities.

| Layer | What it does | Technology |
|---|---|---|
| **Frontend** | Web app the user interacts with | Next.js (App Router), TypeScript, hosted on a Hetzner VPS |
| **Database** | Stores users, shoots, images, marketplace data | PostgreSQL (self-hosted on VPS) |
| **File storage** | Stores uploaded and generated images | Cloudflare R2 (primary), Supabase Storage (legacy fallback) |
| **Authentication** | User accounts and sessions | Supabase Auth |
| **Payments** | Checkout and webhooks | Paystack |
| **AI — Image Generation** | Generates the actual photos | fal.ai (primary model: nano-banana-2) |
| **AI — Prompt Writing** | Writes the detailed image generation prompts | Claude (Anthropic API) |
| **AI — Vision Analysis** | Analyzes identity and inspiration images | Gemini (Google) |
| **Process management** | Keeps the app running on VPS | PM2 |
| **CDN / DDoS protection** | Proxies web traffic | Cloudflare |

### How a Shoot is Generated (simplified)

1. User pays → Paystack sends a webhook to the app
2. The app creates image slots (one per image in the package)
3. For each slot, the AI Vision model (Gemini) analyzes all uploaded reference images and builds an identity profile
4. Claude (Anthropic) writes a detailed, structured prompt for each shot — specifying scene, lighting, pose, wardrobe, constraints
5. fal.ai generates the image using the prompt + all reference images (face-anchored via IPAdapter)
6. The generated image is saved to Cloudflare R2 storage
7. The user downloads their images from the studio dashboard

Each image slot is processed one at a time (not in parallel) to avoid overloading the generation pipeline. If a slot fails, it can be retried individually.

---

## What the Output Looks Like

Generated images follow an **editorial photography aesthetic**:
- Natural skin texture (not AI-smoothed)
- Realistic fabric folds and material texture
- Physically plausible lighting direction (studio or location)
- Shallow depth of field when appropriate
- Film-grade color: Kodak Vision3 / medium-format aesthetic
- Resolution: 4K (approximately 17MB per image)

The output is not a stylized illustration, not a fantasy version of the person, and not a filtered selfie. It is intended to be indistinguishable from a professional photographer's work.

---

## Target Audience

### Primary
- Nigerian creative professionals, ages 22–38
- Based in Lagos, Abuja, Port Harcourt
- Creators, entrepreneurs, content strategists, fashion-forward professionals
- People who need a strong visual identity for Instagram, LinkedIn, brand decks, pitch materials
- Currently unable to afford or unwilling to schedule a professional photoshoot

### Secondary
- Diasporan Africans and global creators paying in USD
- Remote professionals who need a consistent visual identity across platforms

### Who Alux Art is NOT for
- People who want generic stock-photo-style images with no identity
- People who want AI portrait "art" (fantasy or illustrated versions of themselves)
- People who want to generate images of other people (strict identity fidelity means the uploaded person is the subject)

---

## Brand Personality

Alux Art communicates as: **Precise. Assured. Warm. Efficient. Quietly luxurious.**

What this means in practice:
- Specific numbers always: "10 images" not "a set of photos," "₦15,000" not "affordable"
- Short declarative sentences — no filler, no hedging
- Does not use AI hype words: "stunning," "revolutionary," "cutting-edge," "mind-blowing"
- Does not mention the underlying AI models (fal.ai, Gemini, Claude) in user-facing copy — those are infrastructure, not features
- The brand says "we" as if Alux Art itself is the studio doing the work

**Brand archetype:** The Magician with a Sage undertone. Transformative without being showy about the technology behind the transformation.

---

## Key Constraints and Rules

These are non-negotiable product rules:

1. **Identity must be preserved** — every generated image must use the uploaded person's exact face. The system enforces this at the code level.

2. **No prompts from users** — users never write image prompts. All prompting is handled automatically by the AI.

3. **Identity images are identity-only** — the clothing or background in a user's uploaded identity photos must not appear in generated images. Identity photos give the face; outfits come from the inspiration image or outfit references.

4. **Wardrobe priority:** `[OUTFIT]` tag → inspiration image outfit → neutral fallback. Never use the outfit from identity photos.

5. **Every prompt must state what is preserved and what may change** — the system separates identity, wardrobe, environment, lighting, pose, and constraints explicitly.

6. **API keys and secrets never appear in generated images, frontend code, or user-facing responses.**

---

## Current Business State

- The product is live and accepting payments
- Primary market: Nigeria (NGN pricing, Paystack)
- Secondary market: global (USD pricing)
- The marketplace (creator templates) is live and active
- The platform runs on a Hetzner VPS (not serverless cloud — this matters for generation speed and cost)
- Uptime monitoring is in place (health endpoint + cron auto-restart + UptimeRobot)
- The founder manages the product and business; development is assisted by AI (Claude Code)

---

## Common Questions This Document Helps Answer

- What is Alux Art? → AI photo studio. Selfies in, professional editorial images out.
- How is it different from Lensa or other AI portrait apps? → Identity lock. Those change your face. Alux Art preserves it exactly.
- Who is the target customer? → Nigerian creative professional, 22–38, Lagos/Abuja, needs visual identity without a photographer.
- How much does it cost? → ₦15,000 for 10 images (~$10 USD).
- How long does it take? → 2–5 minutes per shoot.
- What is the marketplace? → Photographers and stylists build and sell shoot templates. Users buy them and run their own shoot with their face.
- Can it generate images of celebrities or other people? → No. The system is anchored to the uploaded identity photos. It generates images of the person who uploaded the photos.
- What AI models does it use? → fal.ai for image generation, Gemini for vision analysis, Claude for prompt writing. These are not mentioned to users.
