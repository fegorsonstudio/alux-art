# The Photographer's Upgrade Archive — from 47 looks to 100+

Plan for expanding The Gear Equalizer's lighting archive and adding effect
sections, so photographers can buy studio looks they cannot shoot with the gear
they own.

Everything here plugs into what already ships. No new machinery:
a look is one option with `kind: "prompt"` (hidden recipe in `description`), a
`framing` tag, and a thumbnail. `npm run thumbnails` generates the previews free
in Google Flow, `npm run thumbs:download` fetches them, and
`scripts/attach-lighting-thumbnails.mjs` attaches them with a name guard.

---

## What the 47 already cover, and what they miss

Reading the current names, the archive is deep in one area and empty in others:

| Area | Now | Comment |
|---|---|---|
| Soft key / clamshell / glamour | ~15 | well covered, some near-duplicates |
| Hard key, split, chiaroscuro, spot | ~18 | well covered |
| Rim / kicker / backlight | ~7 | good |
| Coloured gels | 5 | only magenta, blue, green, red, warm |
| Projection / patterned | 3 | ripple, patterned, caustic |
| **Named classic patterns** | **0 by name** | no Rembrandt, loop, butterfly, short, broad |
| **Atmosphere (smoke, haze, fog)** | **0** | the section you asked for |
| **Optical (prism, flare, bokeh)** | **0** | |
| **Practical / environmental** | **0** | neon, window, firelight, screen glow |
| **Colour grades** | **0** | teal-orange, bleach bypass, day-for-night |

The gap is not "more lighting". It is **the vocabulary photographers already shop
by** (Rembrandt, butterfly) plus **effects that need gear or a permit** (smoke
machine, haze, gobos, prisms) — which is exactly what makes this worth paying for.

---

## Proposed sections

Sold as separate groups on the template, so a buyer browses by intent rather than
scrolling 100 thumbnails.

### 1. Classic Portrait Patterns (12 new)
The named patterns every photographer knows and clients ask for. High trust,
easy to explain, likely the best sellers.

Rembrandt (short side) · Rembrandt (broad side) · Loop · Butterfly / Paramount ·
Split · Short lighting · Broad lighting · Clamshell beauty · Rembrandt with hair
light · Loop with reflector fill · Split with fill · Profile / edge

### 2. Editorial & Fashion Hard Light (8 new)
Extends what is already strongest, without duplicating it.

Direct flash on-camera · Hard sun 45° · Overhead noon · Under-lit / horror ·
Cross-lit two-source · Bare-bulb harsh · Ring flash · Deep shadow low-key

### 3. Colour Gel Looks (14 new)
Currently only 5. This is where the cheapest visual transformation lives.

Cyan / orange split · Purple / teal split · Red key + blue rim · Amber + magenta ·
Sodium street orange · Ultraviolet wash · Two-tone complementary rim ·
Single-colour drench · Gel gradient background · Neon pink key · Acid green edge ·
Cool blue key + warm fill · Warm key + cool shadow · Triadic three-colour

### 4. Projection & Gobo (10 new)
Pattern cast onto subject or backdrop. Needs real gear in a real studio.

Window blinds · Foliage / dappled leaves · Venetian slats · Chain-link ·
Lattice / grid · Text / typography shadow · Circular spot with falloff ·
Stained glass · Palm frond · Broken-glass shards

### 5. Atmosphere — smoke, haze, fog (10 new) **(your ask)**
The section that most obviously reads as "I could not do this myself".

Backlit haze beam · Low-lying fog · Smoke swirl side-lit · Volumetric shaft ·
Coloured smoke (warm) · Coloured smoke (cool) · Silhouette through smoke ·
Haze + hard rim · Fog with practical lamp · Dense atmospheric bloom

### 6. Optical & Lens Effects (8 new)
In-camera tricks that need glass most photographers do not own.

Prism refraction edge · Anamorphic blue flare · Warm lens flare · Halation glow ·
Foreground bokeh veil · Soft-focus / diffusion filter · Starburst highlight ·
Mist filter bloom

### 7. Practical & Environmental (8 new)
Light sources that appear in the frame's world.

Neon sign glow · Window daylight · Candle / firelight · Screen / monitor glow ·
Street-lamp pool · Car headlight · Overhead fluorescent · Golden-hour rim

### 8. Cinematic Colour Grades (8 new)
Grade rather than lighting, but the same one-click product, and photographers buy
these constantly.

Teal & orange · Bleach bypass · Day for night · Cross-processed · Faded film ·
High-contrast monochrome · Sepia warm archive · Muted Morandi

**Total: 47 existing + 78 new = 125 looks**, comfortably past 100 with room to
drop weak ones after review.

---

## Two rules the new prompts must follow

Learned the hard way on the first 47:

1. **Start every recipe with "Relight this image. Change nothing else except the
   lighting."** Without it the model re-poses the subject, changes the outfit, or
   closes their eyes.
2. **Never mention the subject's body, wardrobe or expression.** Several early
   prompts told the subject to close their eyes and had to be rewritten.

Sections 5–8 need a small variation, because smoke, prisms and grades are not
purely lighting: state exactly what may be added ("add atmospheric haze") and
repeat that identity, pose, outfit and framing stay untouched.

---

## How to produce it

1. Write the 78 recipes (Gemini via `scripts/lighting-import.mjs`, the same Gem
   that wrote the first 47 — costs nothing but time).
2. Tag each with a framing so its preview uses a matching source photo.
3. `npm run thumbnails` — free in Google Flow, unattended, roughly 45 seconds a
   look, so about an hour for 78.
4. `npm run thumbs:download`, then the attach script.

No fal.ai spend at any point. The only real cost is review time: **look at every
thumbnail before publishing.** The one time that was skipped, 45 wrong images
were attached.

---

## Selling it

- Sections become their own choice groups, so the checkout stays browsable.
- Atmosphere, Optical and Projection are the strongest paid tiers — they are the
  ones a photographer cannot reproduce without a smoke machine, prisms or gobos.
- Classic Patterns is the trust builder: familiar names prove the tool knows the
  craft.
- Colour Grades is the impulse buy: instantly recognisable, no lighting knowledge
  needed.
